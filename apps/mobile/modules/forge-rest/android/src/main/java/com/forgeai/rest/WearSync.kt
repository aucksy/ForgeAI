package com.forgeai.rest

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.wear.remote.interactions.RemoteActivityHelper
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.common.api.CommonStatusCodes
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.DataMap
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.PutDataRequest
import com.google.android.gms.wearable.Wearable
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicLong

/**
 * v0.46: tells the ForgeAI watch app (apps/mobile/android/wear) about the rest and the open
 * workout, as Wear Data Layer items. The watch keeps its own alarm and countdown from these, so it
 * buzzes even when the phone's bridged alert is muted (Pixel Watch mutes those while the phone is
 * in use).
 *
 *  - /forge/rest     {startedAt, endsAt, next, ringThroughDnd, done, seq} when a rest starts or is
 *                    extended ([RestCard.show] / [RestCard.add]); {endsAt: 0, ended, seq} when it
 *                    goes — ended = false: skipped / cleared / settled quietly; ended = true: it ran
 *                    out here ([RestCard.fireEnd]), so a watch whose own alarm has not gone off yet
 *                    buzzes now.
 *  - /forge/workout  {active, title, text, done, set, last, goal, accent, saved, seq} from [WorkoutCard]
 *                    (its words as kept) and [WorkoutCard.clear] (R-269: saved = closed with Finish). R-166: set / last / goal are the next set's
 *                    lines (WearWire.WatchLines); a watch app older than R-166 ignores them.
 *
 * C5-2 (16 Oct 2026): `done` is the row a tap ticks, as JSON ({workout, exKey, setKey, open, values,
 * label}, plus endsAt for a rest's Done), or "" when there is no row a tap can save. The watch never
 * reads it: it shows its Done / "Complete set" only when it is there, and sends it back unchanged in
 * a message (/forge/act/done, [WearActionService]) that the phone handles as a tap on its own card.
 *
 * seq only ever grows (the clock, or one more than the last), so the watch can drop a re-delivered
 * older item. Every put is urgent and fire-and-forget: nothing waits for it, nothing here throws,
 * and a phone without Google Play services (or without the Wear OS app) only logs. After the API
 * says it is not on this phone, the calls pause for [RETRY_MS] (C5-7: it was the whole process, so
 * one hiccup while Play services updated left the watch out of step until ForgeAI restarted).
 *
 * U-W2 (UAT, 17 Oct 2026): a state counts as sent only once its put SUCCEEDS. Until then the latest
 * one per path waits in [outbox] (also saved in preferences, for a restart of the app) and goes
 * again on the next call after the pause, or by itself when the pause ends ([scheduleRetry]); a
 * newer state replaces it. Before, the workout was marked as sent before the put, so a Finish, a
 * new rest or a Skip during the pause or after a failed put never reached the watch.
 */
object WearSync {
  private const val TAG = "ForgeWear"
  const val PATH_REST = "/forge/rest"
  const val PATH_WORKOUT = "/forge/workout"
  /** C5-2: the watch app's buttons ([WearActionService]). */
  const val PATH_ACT = "/forge/act"
  /** C5-3: the capability the ForgeAI watch app declares (wear/src/main/res/values/wear.xml). */
  const val CAP_WATCH_APP = "forgeai_watch_app"
  /** The watch app's "a workout just started" message (wear WorkoutStarted.kt). */
  const val PATH_OPEN = "/forge/open"
  /** The link the watch app's screen answers to (wear AndroidManifest.xml, VIEW + BROWSABLE). */
  const val WATCH_OPEN_URI = "mettleup-watch://workout"

  /** C5-7: after "not on this phone", ask again after this long. */
  private const val RETRY_MS = 5L * 60_000L
  /** C5-3: how often the watch question is asked again (it is asked at most per rest). */
  private const val PROBE_EVERY_MS = 60_000L
  private const val PREFS = "forgeai_wear_sync"
  private const val MODE_NONE = "none"
  private const val MODE_APP = "app"
  private const val MODE_PLAIN = "plain"

  private val lastSeq = AtomicLong(0L)

  /** Until when the Data Layer is taken as missing (0 = not missing). */
  @Volatile private var unavailableUntil = 0L

  @Volatile private var lastProbe = 0L

  /**
   * The workout as last OFFERED (active, title, text, done), so a tick that changes nothing sends
   * nothing. U-W2: an offered state stays in [outbox] until its put succeeds, so skipping a repeat
   * of it never loses it.
   */
  @Volatile private var lastWorkout: List<Any>? = null

  /** U-W2: the latest state per path not yet put successfully. */
  private val outbox = WearOutbox()
  @Volatile private var restored = false
  private val main = Handler(Looper.getMainLooper())
  @Volatile private var retryCtx: Context? = null
  @Volatile private var retryArmed = false
  /** Timed retries in a row without a success (bounded: a phone without Wear OS stops asking). */
  @Volatile private var retries = 0
  private const val MAX_RETRIES = 6
  /** After a failed put that is not "Data Layer missing": try again this soon. */
  private const val FAIL_RETRY_MS = 30_000L
  /** A saved outbox older than this is dropped at a restart (the watch has moved on). */
  private const val OUTBOX_MAX_AGE_MS = 6L * 60L * 60_000L

  private fun nextSeq(): Long {
    while (true) {
      val prev = lastSeq.get()
      val next = maxOf(System.currentTimeMillis(), prev + 1L)
      if (lastSeq.compareAndSet(prev, next)) return next
    }
  }

  private fun unavailable(): Boolean = System.currentTimeMillis() < unavailableUntil

  /** The rest's Done row for the watch ("" = none): the rest card's own Done ([RestCard.doneTarget]). */
  private fun restDone(ctx: Context, r: RestCard.Rest): String {
    val t = RestCard.doneTarget(ctx) ?: return ""
    if (t.open) return ""
    return try {
      JSONObject()
        .put("workout", t.workout)
        .put("exKey", t.exKey)
        .put("setKey", t.setKey)
        .put("open", false)
        .put("values", t.values ?: JSONObject.NULL)
        .put("label", r.next ?: JSONObject.NULL)
        .put("endsAt", r.endsAt)
        .toString()
    } catch (e: Exception) {
      Log.w(TAG, "rest row not written for the watch", e)
      ""
    }
  }

  /** A rest started or changed. */
  fun rest(ctx: Context, r: RestCard.Rest) {
    // F56 (R-461): on the free part the watch gets no rest (no buzz); the phone's own rest timer stays free.
    if (lock(ctx) != null) return
    val next = if (r.allDone) "All sets done" else r.next.orEmpty()
    val done = restDone(ctx, r)
    put(
      ctx,
      PATH_REST,
      linkedMapOf(
        "startedAt" to r.startedAt,
        "endsAt" to r.endsAt,
        "next" to next,
        "ended" to false,
        // The phone's "Ring through Do Not Disturb": the watch's buzz gets through DND only then.
        "ringThroughDnd" to RestCard.ringThroughDnd(ctx),
        "done" to done,
      ),
    )
  }

  /** The rest is gone: [ended] = it ran out on the phone (not skipped or settled). */
  fun restGone(ctx: Context, ended: Boolean) {
    put(
      ctx,
      PATH_REST,
      linkedMapOf("startedAt" to 0L, "endsAt" to 0L, "next" to "", "ended" to ended, "done" to ""),
    )
  }

  /**
   * The workout is open ([active], [title] = the exercise the live card names, [text] = its set
   * line, [done] = the row "Complete set" ticks, "" = none) or over.
   */
  internal fun workout(
    ctx: Context,
    active: Boolean,
    title: String,
    text: String = "",
    done: String = "",
    lines: WatchLines = WatchLines.NONE,
    saved: Boolean = false,
  ) {
    // F56 (R-461): on the free part the watch shows "needs MettleUp Plus" in place of the workout: no sets,
    // no "Complete set", no logging on the watch. The words come from the app (src/plan/planWords.ts).
    val locked = if (active) lock(ctx) else null
    if (locked != null) {
      workoutLocked(ctx, locked.first, locked.second)
      return
    }
    // R-166: + the next set's lines (set, last time's numbers, what a tick saves); "" = none.
    val l = if (active) lines else WatchLines.NONE
    // 29 Oct 2026: + the gym's colour ("#RRGGBB", "" = MettleUp orange); an older watch app ignores it.
    val accent = accent(ctx)
    // R-269: + saved (closed with Finish, not a discard): the watch shows "Workout saved" for ~4 s.
    // An older watch app ignores it.
    val closedSaved = !active && saved
    val now = if (active) listOf<Any>(true, title, text, done, l.set, l.last, l.goal, accent, false) else listOf<Any>(false, "", "", "", "", "", "", accent, closedSaved)
    // Watch logging (3 Nov 2026): + the row's boxes (the watch's own Done and crown); compared too.
    val entry = if (active) l.entry else null
    val key = now + listOf<Any>(entry?.toString() ?: "")
    if (key == lastWorkout) {
      flush(ctx) // nothing new, but a state still waiting goes now if it can
      return
    }
    lastWorkout = key
    // R-355: what the watch is told the next set is, one line per change (the UAT reads it from logcat,
    // since the cloud emulator has no watch): "watch next: <exercise> | <set> | <text>".
    Log.i(TAG, "watch next: ${now[1]} | ${now[4]} | ${now[2]}")
    val values = linkedMapOf<String, Any>(
      "active" to active,
      "title" to now[1],
      "text" to now[2],
      "done" to now[3],
      "set" to now[4],
      "last" to now[5],
      "goal" to now[6],
      "accent" to now[7],
      "saved" to now[8],
      // This phone app takes sets logged on the watch (the watch shows its logging screens only then).
      "logFlow" to true,
      "eOn" to (entry != null),
    )
    if (entry != null) {
      values["eWOn"] = entry.wOn
      values["eROn"] = entry.rOn
      values["eW"] = entry.w
      values["eR"] = entry.r
      values["eUnit"] = entry.unit
      values["eStep"] = entry.step
      values["eWarm"] = entry.warm
      values["eRpe"] = entry.rpe
      values["eRest"] = entry.rest
    }
    put(ctx, PATH_WORKOUT, values)
  }

  /** F56: the workout as a locked watch sees it (same item, only the words; an older watch app shows them too). */
  private fun workoutLocked(ctx: Context, title: String, text: String) {
    val accent = accent(ctx)
    val key = listOf<Any>(true, title, text, "", "", "", "", accent, false, "locked")
    if (key == lastWorkout) {
      flush(ctx)
      return
    }
    lastWorkout = key
    Log.i(TAG, "watch next: locked")
    put(
      ctx,
      PATH_WORKOUT,
      linkedMapOf<String, Any>(
        "active" to true, "title" to title, "text" to text, "done" to "", "set" to "", "last" to "", "goal" to "",
        "accent" to accent, "saved" to false, "logFlow" to false, "eOn" to false,
      ),
    )
  }

  // ------------------------------------------------------------------ the free part (F56, R-461)
  /**
   * The words the watch shows on the free part of MettleUp Plus ([title], [text]); null / "" = open (as before).
   * Kept in preferences so the rest card's own calls (app in the background) see it too.
   */
  fun setLock(ctx: Context, title: String?, text: String?) {
    try {
      ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        .putString("lockTitle", title.orEmpty()).putString("lockText", text.orEmpty()).apply()
    } catch (e: Exception) {
      Log.w(TAG, "watch lock not saved", e)
    }
  }

  private fun lock(ctx: Context): Pair<String, String>? = try {
    val p = ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val t = p.getString("lockTitle", "").orEmpty()
    if (t.isEmpty()) null else Pair(t, p.getString("lockText", "").orEmpty())
  } catch (e: Exception) {
    Log.w(TAG, "watch lock not read", e)
    null
  }

  // ------------------------------------------------------------------ the gym's colour
  /**
   * 29 Oct 2026 ("Watch in the gym's colour"): the gym's accent the app is painted in ("#RRGGBB"),
   * or null / "" with no gym (the watch stays MettleUp orange). Sent with the next /forge/workout.
   */
  fun setAccent(ctx: Context, hex: String?) {
    try {
      ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        .putString("accent", WearWire.watchAccent(hex)).apply()
    } catch (e: Exception) {
      Log.w(TAG, "watch colour not saved", e)
    }
  }

  private fun accent(ctx: Context): String = try {
    ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("accent", "") ?: ""
  } catch (e: Exception) {
    Log.w(TAG, "watch colour not read", e)
    ""
  }

  // ------------------------------------------------------------------ open the watch app
  /**
   * 29 Oct 2026 ("Watch opens when a workout starts"): called once when the member STARTS a workout
   * (never on a resume; the app decides, restCard.ts openWatchApp). For every reachable watch with the
   * MettleUp watch app:
   *  1. Wear OS is asked to open its screen (RemoteActivityHelper: the system starts it, which the
   *     watch app could not do itself from the background);
   *  2. the message /forge/open {startedAt} goes too: if the screen is not up a few seconds later
   *     (watch locked, off the wrist, Wear OS refused), the watch shows a "Workout started" card with
   *     an icon on the watch face, and one tap opens the app (WorkoutStarted.kt).
   * Fire and forget: failures are only logged.
   */
  fun openWatch(ctx: Context, startedAt: Long) {
    if (unavailable()) return
    // F56 (R-461): on the free part the watch is not opened by itself (it would only show "needs MettleUp Plus").
    if (lock(ctx) != null) return
    val app = ctx.applicationContext
    val data = startedAt.toString().toByteArray(Charsets.UTF_8)
    try {
      Wearable.getCapabilityClient(app).getCapability(CAP_WATCH_APP, CapabilityClient.FILTER_REACHABLE)
        .addOnSuccessListener { info ->
          if (info.nodes.isEmpty()) Log.i(TAG, "no watch with the app to open")
          for (node in info.nodes) {
            Wearable.getMessageClient(app).sendMessage(node.id, PATH_OPEN, data)
              .addOnFailureListener { e -> failed(e, "watch open message not sent") }
            openRemote(app, node.id)
          }
        }
        .addOnFailureListener { e -> failed(e, "watch app not looked up to open") }
    } catch (e: Exception) {
      Log.w(TAG, "watch app not opened", e)
    }
  }

  private fun openRemote(app: Context, nodeId: String) {
    try {
      val intent = Intent(Intent.ACTION_VIEW)
        .addCategory(Intent.CATEGORY_BROWSABLE)
        .setData(Uri.parse(WATCH_OPEN_URI))
      val f = RemoteActivityHelper(app).startRemoteActivity(intent, nodeId)
      f.addListener({
        try {
          f.get()
          Log.i(TAG, "watch asked to open MettleUp")
        } catch (e: Exception) {
          Log.w(TAG, "watch did not take the open request", e)
        }
      }, { r -> r.run() })
    } catch (e: Exception) {
      Log.w(TAG, "watch open request not sent", e)
    }
  }

  // ------------------------------------------------------------------ F67: install on the watch
  /** F67: the Wear OS answer could not be had (no Play services, no Wear OS app, an error, a timeout). */
  const val WATCH_UNKNOWN = "unknown"
  /** F67 [installOnWatch]: the Play Store was asked to open on at least one watch. */
  const val INSTALL_OPENED = "opened"
  /** F67 [installOnWatch]: no watch took the request (refused, error, timeout). */
  const val INSTALL_FAILED = "failed"
  /** F67: how long a Wear OS question may take before the app is told "unknown" / "failed". */
  private const val ASK_TIMEOUT_MS = 8_000L
  /** F67: the watch must confirm the Play Store opened within this (it may be asleep). */
  private const val OPEN_TIMEOUT_MS = 15_000L

  /** One answer per question, whichever comes first: Wear OS or the timeout. */
  private class Once(private val done: (String) -> Unit) {
    private val answered = java.util.concurrent.atomic.AtomicBoolean(false)
    /** Not answered yet (the timeout only logs when it is the one answering). */
    fun pending(): Boolean = !answered.get()
    fun answer(v: String) {
      if (!answered.compareAndSet(false, true)) return
      try {
        done(v)
      } catch (e: Exception) {
        Log.w(TAG, "watch answer not passed on", e)
      }
    }
  }

  /**
   * F67: the connected watches and the ones with the MettleUp watch app (capability
   * [CAP_WATCH_APP]); [onFail] with a reason if Wear OS cannot say.
   */
  private fun askWatches(app: Context, onFail: (String) -> Unit, then: (connected: List<String>, withApp: List<String>) -> Unit) {
    if (unavailable()) {
      onFail("Wear Data Layer paused (not on this phone)")
      return
    }
    try {
      Wearable.getNodeClient(app).connectedNodes
        .addOnSuccessListener { nodes ->
          val connected = nodes.map { it.id }
          if (connected.isEmpty()) {
            then(connected, emptyList())
            return@addOnSuccessListener
          }
          Wearable.getCapabilityClient(app).getCapability(CAP_WATCH_APP, CapabilityClient.FILTER_REACHABLE)
            .addOnSuccessListener { info -> then(connected, info.nodes.map { it.id }) }
            .addOnFailureListener { e ->
              failed(e, "watch app not looked up (install)")
              onFail("capability lookup failed")
            }
        }
        .addOnFailureListener { e ->
          failed(e, "connected watches not read (install)")
          onFail("connected watches not read")
        }
    } catch (e: Exception) {
      // No Play services at all lands here on some phones.
      Log.w(TAG, "watches not looked up (install)", e)
      onFail("lookup threw")
    }
  }

  /**
   * F67 ("Install the watch app from the phone"): "none" (no watch connected), "installed" (every
   * connected watch has the MettleUp watch app), "missing" (one lacks it) or "unknown" (Wear OS
   * could not say within [ASK_TIMEOUT_MS]). Never throws; [done] is called exactly once.
   */
  fun watchAppState(ctx: Context, done: (String) -> Unit) {
    val once = Once(done)
    main.postDelayed({
      if (once.pending()) Log.w(TAG, "watch app state: Wear OS did not answer in time")
      once.answer(WATCH_UNKNOWN)
    }, ASK_TIMEOUT_MS)
    askWatches(
      ctx.applicationContext,
      { why ->
        Log.i(TAG, "watch app state unknown: $why")
        once.answer(WATCH_UNKNOWN)
      },
    ) { connected, withApp ->
      val s = WearWire.watchAppState(connected, withApp)
      Log.i(TAG, "watch app state: $s")
      once.answer(s)
    }
  }

  /**
   * F67: opens the Play Store on the MettleUp page on every connected watch without the watch app
   * (RemoteActivityHelper + market://details?id=<package>; the watch app has the phone's package
   * name). Answers "opened" (at least one watch took it), "installed" (nothing to install), "none"
   * (no watch connected), "failed" (refused, error, or [OPEN_TIMEOUT_MS]) or "unknown" (Wear OS could
   * not say which watches there are). Never throws; [done] is called exactly once.
   */
  fun installOnWatch(ctx: Context, done: (String) -> Unit) {
    val app = ctx.applicationContext
    val once = Once(done)
    main.postDelayed({
      if (once.pending()) Log.w(TAG, "watch Play Store request timed out")
      once.answer(INSTALL_FAILED)
    }, OPEN_TIMEOUT_MS)
    askWatches(
      app,
      { why ->
        Log.w(TAG, "watch Play Store not opened: $why")
        once.answer(WATCH_UNKNOWN)
      },
    ) { connected, withApp ->
      val state = WearWire.watchAppState(connected, withApp)
      val targets = WearWire.installTargets(connected, withApp)
      if (state != WearWire.WATCH_MISSING || targets.isEmpty()) {
        once.answer(state)
        return@askWatches
      }
      openPlayStoreOn(app, targets, once)
    }
  }

  /**
   * F67 / watch update (10 Nov 2026): asks each of [targets] to open its Play Store on the MettleUp
   * page; [once] gets "opened" when one took it, "failed" when all refused or threw.
   */
  private fun openPlayStoreOn(app: Context, targets: List<String>, once: Once) {
    val left = java.util.concurrent.atomic.AtomicInteger(targets.size)
    val uri = Uri.parse(WearWire.playStoreUri(app.packageName))
    for (node in targets) {
      try {
        val intent = Intent(Intent.ACTION_VIEW).addCategory(Intent.CATEGORY_BROWSABLE).setData(uri)
        val f = RemoteActivityHelper(app).startRemoteActivity(intent, node)
        f.addListener({
          try {
            f.get()
            Log.i(TAG, "watch Play Store opened on MettleUp")
            once.answer(INSTALL_OPENED)
          } catch (e: Exception) {
            Log.w(TAG, "watch did not open its Play Store", e)
            if (left.decrementAndGet() == 0) once.answer(INSTALL_FAILED)
          }
        }, { r -> r.run() })
      } catch (e: Exception) {
        Log.w(TAG, "watch Play Store request not sent", e)
        if (left.decrementAndGet() == 0) once.answer(INSTALL_FAILED)
      }
    }
  }

  // ------------------------------------------------------------------ watch update ready (10 Nov 2026)
  /** A watch that has the app but no version item is asked to write it; read again after this. */
  private const val VERSION_REREAD_MS = 2_500L

  /**
   * Watch update ready (10 Nov 2026): every connected watch as JSON (WearWire.watchVersionsJson:
   * nodeId, displayName, hasApp, versionName|null, versionCode|null), or
   * [WearWire.WATCH_VERSIONS_UNKNOWN] when Wear OS cannot say within [ASK_TIMEOUT_MS]. The version
   * is the watch's own Data Layer item (WatchVersion.kt on the watch), readable with the watch app
   * closed. A watch with the app but no item is sent [WearWire.PATH_WATCH_VERSION_ASK] (a new build
   * installed and never opened writes it then) and read once more; an older watch build ignores the
   * message, so its version stays null = "an update is ready". Never throws; [done] is called once.
   */
  fun watchVersions(ctx: Context, done: (String) -> Unit) {
    val app = ctx.applicationContext
    val once = Once(done)
    main.postDelayed({
      if (once.pending()) Log.w(TAG, "watch versions: Wear OS did not answer in time")
      once.answer(WearWire.WATCH_VERSIONS_UNKNOWN)
    }, ASK_TIMEOUT_MS)
    if (unavailable()) {
      once.answer(WearWire.WATCH_VERSIONS_UNKNOWN)
      return
    }
    try {
      Wearable.getNodeClient(app).connectedNodes
        .addOnSuccessListener { nodes ->
          val connected = nodes.map { it.id to (it.displayName ?: "") }
          if (connected.isEmpty()) {
            once.answer(WearWire.watchVersionsJson(connected, emptyList(), emptyMap()))
            return@addOnSuccessListener
          }
          Wearable.getCapabilityClient(app).getCapability(CAP_WATCH_APP, CapabilityClient.FILTER_REACHABLE)
            .addOnSuccessListener { info ->
              val withApp = info.nodes.map { it.id }
              readWatchVersions(app, { once.answer(WearWire.WATCH_VERSIONS_UNKNOWN) }) { versions ->
                val ask = WearWire.versionsToAsk(connected.map { it.first }, withApp, versions)
                if (ask.isEmpty()) {
                  once.answer(WearWire.watchVersionsJson(connected, withApp, versions))
                } else {
                  askForVersions(app, ask)
                  main.postDelayed({
                    // A failed second read keeps the first (the asked watches stay without a version).
                    readWatchVersions(app, { once.answer(WearWire.watchVersionsJson(connected, withApp, versions)) }) { again ->
                      once.answer(WearWire.watchVersionsJson(connected, withApp, again))
                    }
                  }, VERSION_REREAD_MS)
                }
              }
            }
            .addOnFailureListener { e ->
              failed(e, "watch app not looked up (versions)")
              once.answer(WearWire.WATCH_VERSIONS_UNKNOWN)
            }
        }
        .addOnFailureListener { e ->
          failed(e, "connected watches not read (versions)")
          once.answer(WearWire.WATCH_VERSIONS_UNKNOWN)
        }
    } catch (e: Exception) {
      Log.w(TAG, "watch versions not looked up", e)
      once.answer(WearWire.WATCH_VERSIONS_UNKNOWN)
    }
  }

  /** Asks [nodes] to write their version item now (an older watch build has no listener: dropped). */
  private fun askForVersions(app: Context, nodes: List<String>) {
    for (node in nodes) {
      try {
        Wearable.getMessageClient(app).sendMessage(node, WearWire.PATH_WATCH_VERSION_ASK, ByteArray(0))
          .addOnFailureListener { e -> Log.w(TAG, "watch version ask not sent", e) }
      } catch (e: Exception) {
        Log.w(TAG, "watch version ask not sent", e)
      }
    }
  }

  /** Every watch's version item on this phone, by node id; [onFail] when the Data Layer cannot say. */
  private fun readWatchVersions(app: Context, onFail: () -> Unit, then: (Map<String, WearWire.WatchVersion>) -> Unit) {
    try {
      // No host: the item at this path of every node.
      val uri = Uri.Builder().scheme(PutDataRequest.WEAR_URI_SCHEME).path(WearWire.PATH_WATCH_VERSION).build()
      Wearable.getDataClient(app).getDataItems(uri)
        .addOnSuccessListener { buf ->
          val out = HashMap<String, WearWire.WatchVersion>()
          try {
            for (item in buf) {
              val node = item.uri.host ?: continue
              val m = DataMapItem.fromDataItem(item).dataMap
              WearWire.watchVersion(m.getString(WearWire.KEY_NAME), m.getLong(WearWire.KEY_CODE, 0L))?.let { out[node] = it }
            }
          } catch (e: Exception) {
            Log.w(TAG, "a watch version item not read", e)
          } finally {
            buf.release()
          }
          then(out)
        }
        .addOnFailureListener { e ->
          Log.w(TAG, "watch version items not read", e)
          onFail()
        }
    } catch (e: Exception) {
      Log.w(TAG, "watch version items not read", e)
      onFail()
    }
  }

  // ------------------------------------------------------------------ R-441: the watch's screen diary
  /** After asking the watches for a fresh diary, read the items after this. */
  private const val DIAG_REREAD_MS = 2_500L

  /**
   * R-441 (10 Nov 2026): every watch's screen diary as JSON (WearWire.watchDiagJson), for "Add my
   * watch's screen log" in Help and feedback. Connected watches with the app are asked to write it
   * now ([WearWire.PATH_WATCH_DIAG_ASK]; an older watch build ignores the message and its last copy,
   * written at each screen-off, is read instead). The items are read [DIAG_REREAD_MS] later, with or
   * without a watch in reach (the phone keeps the last copy). [WearWire.WATCH_DIAG_UNKNOWN] when Wear
   * OS cannot say within [ASK_TIMEOUT_MS]. Never throws; [done] is called once.
   */
  fun watchDiag(ctx: Context, done: (String) -> Unit) {
    val app = ctx.applicationContext
    val once = Once(done)
    main.postDelayed({
      if (once.pending()) Log.w(TAG, "watch diary: Wear OS did not answer in time")
      once.answer(WearWire.WATCH_DIAG_UNKNOWN)
    }, ASK_TIMEOUT_MS)
    if (unavailable()) {
      once.answer(WearWire.WATCH_DIAG_UNKNOWN)
      return
    }
    val read = {
      readWatchDiag(app, { once.answer(WearWire.WATCH_DIAG_UNKNOWN) }) { items ->
        Log.i(TAG, "watch diary: ${items.size} watch(es)")
        once.answer(WearWire.watchDiagJson(items))
      }
    }
    try {
      Wearable.getCapabilityClient(app).getCapability(CAP_WATCH_APP, CapabilityClient.FILTER_REACHABLE)
        .addOnSuccessListener { info ->
          for (node in info.nodes) {
            try {
              Wearable.getMessageClient(app).sendMessage(node.id, WearWire.PATH_WATCH_DIAG_ASK, ByteArray(0))
                .addOnFailureListener { e -> Log.w(TAG, "watch diary ask not sent", e) }
            } catch (e: Exception) {
              Log.w(TAG, "watch diary ask not sent", e)
            }
          }
          if (info.nodes.isEmpty()) read() else main.postDelayed({ read() }, DIAG_REREAD_MS)
        }
        .addOnFailureListener { e ->
          // No watch to ask: the last copies on this phone still count.
          Log.w(TAG, "watch app not looked up (diary)", e)
          read()
        }
    } catch (e: Exception) {
      Log.w(TAG, "watch diary not looked up", e)
      once.answer(WearWire.WATCH_DIAG_UNKNOWN)
    }
  }

  /** Every watch's diary item on this phone; [onFail] when the Data Layer cannot say. */
  private fun readWatchDiag(app: Context, onFail: () -> Unit, then: (List<WearWire.WatchDiag>) -> Unit) {
    try {
      val uri = Uri.Builder().scheme(PutDataRequest.WEAR_URI_SCHEME).path(WearWire.PATH_WATCH_DIAG).build()
      Wearable.getDataClient(app).getDataItems(uri)
        .addOnSuccessListener { buf ->
          val out = ArrayList<WearWire.WatchDiag>()
          try {
            for (item in buf) {
              val m = DataMapItem.fromDataItem(item).dataMap
              val log = m.getString(WearWire.KEY_DIAG_LOG) ?: continue
              out.add(WearWire.WatchDiag(m.getLong(WearWire.KEY_DIAG_AT, 0L), log))
            }
          } catch (e: Exception) {
            Log.w(TAG, "a watch diary item not read", e)
          } finally {
            buf.release()
          }
          then(out)
        }
        .addOnFailureListener { e ->
          Log.w(TAG, "watch diary items not read", e)
          onFail()
        }
    } catch (e: Exception) {
      Log.w(TAG, "watch diary items not read", e)
      onFail()
    }
  }

  /**
   * Watch update ready (10 Nov 2026): opens the Play Store on the MettleUp page on the connected
   * watch [nodeId] (null, or a watch not connected / without the app = every connected watch WITH
   * the app), where Play shows "Update" when a newer watch build is out. Answers "opened", "none"
   * (no watch connected), "missing" (no connected watch has the app: installOnWatch is the way),
   * "failed" (refused, error, or [OPEN_TIMEOUT_MS]) or "unknown". Never throws; [done] once.
   */
  fun updateOnWatch(ctx: Context, nodeId: String?, done: (String) -> Unit) {
    val app = ctx.applicationContext
    val once = Once(done)
    main.postDelayed({
      if (once.pending()) Log.w(TAG, "watch Play Store (update) request timed out")
      once.answer(INSTALL_FAILED)
    }, OPEN_TIMEOUT_MS)
    askWatches(
      app,
      { why ->
        Log.w(TAG, "watch Play Store (update) not opened: $why")
        once.answer(WATCH_UNKNOWN)
      },
    ) { connected, withApp ->
      val targets = WearWire.updateTargets(connected, withApp, nodeId)
      when {
        connected.isEmpty() -> once.answer(WearWire.WATCH_NONE)
        targets.isEmpty() -> once.answer(WearWire.WATCH_MISSING)
        else -> openPlayStoreOn(app, targets, once)
      }
    }
  }

  /** U-W2: [values] becomes the path's latest state; everything waiting is sent if it can be. */
  private fun put(ctx: Context, path: String, values: Map<String, Any>) {
    loadOutbox(ctx)
    outbox.offer(path, values)
    saveOutbox(ctx)
    flush(ctx)
  }

  /** The saved outbox of an earlier run of the app, once per process (U-W2). */
  private fun loadOutbox(ctx: Context) {
    if (restored) return
    restored = true
    try {
      val p = ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      outbox.restore(p.getString("outbox", null), System.currentTimeMillis(), OUTBOX_MAX_AGE_MS)
    } catch (e: Exception) {
      Log.w(TAG, "watch outbox not read", e)
    }
  }

  private fun saveOutbox(ctx: Context) {
    try {
      val p = ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      if (outbox.isEmpty()) {
        p.edit().remove("outbox").apply()
      } else {
        p.edit().putString("outbox", outbox.encode(System.currentTimeMillis())).apply()
      }
    } catch (e: Exception) {
      Log.w(TAG, "watch outbox not saved", e)
    }
  }

  /** Puts every waiting state not already on its way. During the pause nothing goes (it waits). */
  private fun flush(ctx: Context) {
    loadOutbox(ctx)
    val app = ctx.applicationContext
    if (unavailable()) {
      if (!outbox.isEmpty()) scheduleRetry(app, unavailableUntil - System.currentTimeMillis() + 1_000L)
      return
    }
    for (item in outbox.takeDue()) {
      try {
        val req = PutDataMapRequest.create(item.path)
        fill(req.dataMap, item.values)
        req.dataMap.putLong("seq", nextSeq())
        val data = req.asPutDataRequest().setUrgent()
        Wearable.getDataClient(app).putDataItem(data)
          .addOnSuccessListener {
            outbox.sent(item)
            retries = 0
            saveOutbox(app)
          }
          .addOnFailureListener { e ->
            outbox.failed(item)
            failed(e, "watch sync ${item.path} failed")
            scheduleRetry(app, if (unavailable()) unavailableUntil - System.currentTimeMillis() + 1_000L else FAIL_RETRY_MS)
          }
      } catch (e: Exception) {
        outbox.failed(item)
        Log.w(TAG, "watch sync ${item.path} not sent", e)
        scheduleRetry(app, FAIL_RETRY_MS)
      }
    }
  }

  private fun fill(m: DataMap, values: Map<String, Any>) {
    for ((k, v) in values) {
      when (v) {
        is Boolean -> m.putBoolean(k, v)
        is Long -> m.putLong(k, v)
        is Int -> m.putLong(k, v.toLong())
        else -> m.putString(k, v.toString())
      }
    }
  }

  /**
   * U-W2: "when the connection is back": one timed flush (the pause's end, or [FAIL_RETRY_MS] after
   * a failure), at most [MAX_RETRIES] in a row without a success. Any later call flushes too.
   */
  private fun scheduleRetry(ctx: Context, delayMs: Long) {
    if (retryArmed || retries >= MAX_RETRIES) return
    retryArmed = true
    retries += 1
    retryCtx = ctx.applicationContext
    main.postDelayed({
      retryArmed = false
      retryCtx?.let { if (!outbox.isEmpty()) flush(it) }
    }, maxOf(1_000L, delayMs))
  }

  private fun failed(e: Exception, what: String) {
    if (e is ApiException && e.statusCode == CommonStatusCodes.API_NOT_CONNECTED) {
      // No Wear OS on this phone (or Play services is updating): pause, then try again.
      unavailableUntil = System.currentTimeMillis() + RETRY_MS
      Log.w(TAG, "Wear Data Layer not on this phone; watch sync paused for ${RETRY_MS / 1000} s")
    } else {
      Log.w(TAG, what, e)
    }
  }

  // ------------------------------------------------------------------ C5-3: which watch is there
  /**
   * Is a watch WITHOUT the ForgeAI watch app connected? Then the rest countdown stays on its LOW
   * channel: Wear OS copies it there, and a copied DEFAULT notification buzzes at every rest start.
   * Read from the last [probeWatch]; unknown = no.
   */
  fun plainWatch(ctx: Context): Boolean =
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("watch", MODE_NONE) == MODE_PLAIN

  /**
   * Asks Wear OS (in the background, at most once a minute) which watch is there, for [plainWatch].
   * C5 review (16 Oct 2026): per CONNECTED watch, not over every watch ever paired: "plain" as soon
   * as one connected watch lacks the ForgeAI app (its copy of the card would buzz), "app" when every
   * connected watch has it, "none" with no watch connected. Also asked when the app starts
   * (ForgeRestModule), so the first rest already has the answer.
   */
  fun probeWatch(ctx: Context) {
    // U-W2: also asked when the app starts and at every rest: a state still waiting goes now.
    flush(ctx)
    val now = System.currentTimeMillis()
    if (now - lastProbe < PROBE_EVERY_MS || unavailable()) return
    lastProbe = now
    val app = ctx.applicationContext
    try {
      Wearable.getNodeClient(app).connectedNodes
        .addOnSuccessListener { nodes ->
          if (nodes.isEmpty()) {
            saveWatch(app, MODE_NONE)
            return@addOnSuccessListener
          }
          Wearable.getCapabilityClient(app).getCapability(CAP_WATCH_APP, CapabilityClient.FILTER_REACHABLE)
            .addOnSuccessListener { info ->
              val withApp = info.nodes.map { it.id }.toSet()
              saveWatch(app, if (nodes.any { it.id !in withApp }) MODE_PLAIN else MODE_APP)
            }
            .addOnFailureListener { e -> failed(e, "watch app not looked up") }
        }
        .addOnFailureListener { e -> failed(e, "connected watches not read") }
    } catch (e: Exception) {
      Log.w(TAG, "watch not looked up", e)
    }
  }

  private fun saveWatch(ctx: Context, mode: String) {
    val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    if (p.getString("watch", null) == mode) return
    p.edit().putString("watch", mode).apply()
    Log.i(TAG, "watch: $mode")
  }

  // ------------------------------------------------------------------ C5-2: the watch's buttons
  /**
   * The broadcast a watch message stands for ([WearActionService]): /forge/act/done with the row's
   * JSON as sent in [rest] / [workout], /forge/act/add, /forge/act/skip. Null = not one of ours.
   */
  internal fun actionIntent(ctx: Context, path: String, data: ByteArray?): Intent? {
    return when (path) {
      "$PATH_ACT/add" -> Intent(ctx, RestActionReceiver::class.java).setAction(RestCard.ACTION_ADD)
      "$PATH_ACT/skip" -> Intent(ctx, RestActionReceiver::class.java).setAction(RestCard.ACTION_SKIP)
      // Watch logging (3 Nov 2026): "−15" on the watch's rest timer.
      "$PATH_ACT/sub" -> Intent(ctx, RestActionReceiver::class.java).setAction(RestCard.ACTION_SUB)
      "$PATH_ACT/done" -> {
        // U-W3: the parsing is pure (WearWire.parseDone, JVM-tested); null = the watch is told.
        val d = WearWire.parseDone(data)
        if (d == null) {
          Log.w(TAG, "watch Done not read (${data?.size ?: 0} bytes)")
          return null
        }
        try {
          RestCard.doneBroadcast(ctx, RestCard.DoneTarget(d.workout, d.exKey, d.setKey, false, d.values), d.endsAt, d.label, d.log)
        } catch (e: Exception) {
          Log.w(TAG, "watch Done not passed on", e)
          null
        }
      }
      else -> null
    }
  }
}
