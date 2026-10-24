package com.forgeai.rest

import android.app.ActivityManager
import android.app.AlarmManager
import android.app.KeyguardManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
import android.media.AudioAttributes
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.provider.Settings
import android.text.format.DateFormat
import android.widget.RemoteViews
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * The rest timer's swipe-away card (v0.26.1). Wear OS copies a phone alert to the watch only
 * when it can be swiped away, so this card is NOT ongoing. It is posted on a quiet channel
 * (no sound, no banner), counts down where Android allows it (a count-down chronometer), and
 * carries "+15 s" and "Skip". Those buttons, and the end-of-rest alarm, land in
 * [RestActionReceiver], which works with the app in the background or its JS not running.
 *
 * The rest is kept here (SharedPreferences) as well as in the app's JS store, so a tap on the
 * watch changes the timer even when JS is asleep; JS reads [load] when it wakes up.
 *
 * Phase 2, packet D:
 *  - RT-06: the card's channel is "rest-card-v2" (the old "rest-card" channel is deleted). It
 *    is LOW importance, no sound or vibration: a DEFAULT channel made a Wear watch buzz at the
 *    start of every rest (review fix); only "Rest is over" buzzes.
 *  - RT-05: the card's big line is the time LEFT, counting down ("2:53 left · Bench Press, set 2"),
 *    from a small custom layout (res/layout/forge_rest_card.xml) when it is present.
 *  - RT-12: "Ring through Do Not Disturb" (off by default): with Do Not Disturb on, "Rest is
 *    over" goes out as an alarm (its own channel, alarm sound usage), which Do Not Disturb lets
 *    through unless the member blocks alarms too.
 *  - D8: exact-alarm and notification state, and the settings pages that fix them.
 *
 * Phase 6 (point 4): "Done" — the first button, before "+15 s" and "Skip", on the card and on
 * "Rest is over". It ticks the row the card names ("Bench Press, set 2"). The app hands the row
 * over before each rest ([setDoneTarget]: the workout's start time plus the row's own keys, so a
 * card left over from another workout or a removed set never ticks a different row). A tap is
 * kept here ("pending done", its own preferences file) and the app is told if its JS runs; the
 * app ticks the row through its own store (never written from here), or takes the tap when it
 * next starts. A row with nothing to save gets a Done that opens the app instead (Android allows
 * no app launch from a button's broadcast).
 *
 * Review fixes: the Done also carries the row's grey hint as the card was posted ("values"), so
 * the app ticks only while the row still shows it; an "open" Done is never read again from a
 * launch out of Recents; and a Done tap keeps its broadcast open (at most [DONE_HOLD_MS]) until
 * the app says it has acted ([releaseDone]), so Android cannot freeze the app before the tick.
 *
 * v0.37.1 (notification audit): a Done / "Complete set" tap with the app's JS not running (Android
 * closed it) works on the phone itself ([OfflineTick]: the rest starts here, the tick waits for the
 * app); every "Rest is over" times out ([OVER_TIMEOUT_MS]) and goes when the app comes to the
 * front or a set is ticked ([dismissOver]); the "Open ForgeAI to …" note keeps the live workout
 * card away while it shows; the rest after the last set says "All sets done"; both cards take the
 * gym's accent ([color]).
 *
 * C5 audit (16 Oct 2026): "Rest is over" carries the live card's "Complete set" (C5-1: for up to
 * 2 minutes after a rest there was no button anywhere on a locked phone); the countdown is on a
 * DEFAULT channel unless a watch without the ForgeAI app is connected (C5-3); with the app on
 * screen the alert rings itself at notification volume (C5-4, [restBell]); a restart mid-rest
 * brings the alarm and the cards back ([recover], C5-5); a swiped rest card brings the live card
 * back (C5-15).
 */
object RestCard {
  const val CARD_ID = 41001
  const val OVER_ID = 41002
  /**
   * The LOW countdown channel ("Silent" on the phone). Since the C5 audit (16 Oct 2026) it is used
   * only while a watch WITHOUT the ForgeAI watch app is connected: a bridged DEFAULT card buzzes
   * such a watch at the start of every rest ([WearSync.plainWatch]).
   */
  const val CH_CARD = "rest-card-v2"
  /**
   * C5-3 (16 Oct 2026): a Pixel set to "Hide silent conversations and notifications" never showed
   * the LOW card on the lock screen, and the live card is down during a rest, so a locked phone
   * showed nothing. This DEFAULT channel (no sound, no vibration) is the countdown everywhere
   * else: no watch, or a watch with the ForgeAI app, which shows its own countdown and asks Wear
   * OS not to copy this card (bridge tag [BRIDGE_TAG_CARD]).
   */
  const val CH_CARD_LIVE = "rest-card-live"
  /** C5-3: the rest card's bridge tag; the ForgeAI watch app excludes it (it has its own countdown). */
  const val BRIDGE_TAG_CARD = "rest-card"
  /** C5 review: the countdown's own group, which never gets a summary, so it never alerts. */
  private const val QUIET_GROUP = "forgeai-rest-countdown"
  /** C5-15: the rest card went (swiped, "Clear all"): the live card comes back for the rest. */
  const val ACTION_CARD_GONE = "com.forgeai.rest.CARD_GONE"
  /** The v0.26.1 card channel (LOW importance, filed under "Silent"); deleted on first use. */
  private const val CH_CARD_OLD = "rest-card"
  /**
   * 15 Oct 2026 (owner, in the gym: "the sound should not change"): with the screen off, "Rest is
   * over" played the phone's default notification tone, while the open app plays its own
   * rest-done sound. These channels now play that same sound (res/raw/forge_rest_done.wav, a copy
   * of assets/sounds/rest-done.wav). Android never changes a channel's sound after it is made, so
   * they have new ids; the old ones ("rest-timer", "rest-over-alarm") are deleted.
   */
  const val CH_OVER = "rest-over-sound"
  const val CH_OVER_OPEN = "rest-over-open"
  const val CH_OVER_ALARM = "rest-over-alarm-sound"
  /** C9-26: the channel that rings at the end of rest. Its old name "Rest timer" read like the countdown. */
  private const val OVER_NAME = "Rest is over"
  private const val OVER_DESC = "Tells you when your rest is over"
  /**
   * C5-4 / C1-10 (16 Oct 2026): ForgeAI on screen. The app's own bell played through the MEDIA
   * stream (often at 0) and ignored Do Not Disturb. Now this alert rings itself: the same sound at
   * NOTIFICATION volume as with the screen off, held by Do Not Disturb the same way. No vibration
   * here (the app buzzes the phone itself as the rest ends). The app skips its bell ([restBell]).
   */
  const val CH_OVER_OPEN_SOUND = "rest-over-open-sound"
  private const val OPEN_QUIET_NAME = "Rest is over, sounds off"
  private val CH_OVER_OLD = listOf("rest-timer", "rest-over-alarm")
  const val ACTION_ADD = "com.forgeai.rest.ADD15"
  const val ACTION_SKIP = "com.forgeai.rest.SKIP"
  const val ACTION_END = "com.forgeai.rest.END"
  const val ACTION_DONE = "com.forgeai.rest.DONE"
  /** 13 Oct 2026: "Rest is over" swiped away — the live workout card comes back ([WorkoutCard]). */
  const val ACTION_OVER_GONE = "com.forgeai.rest.OVER_GONE"
  /** v0.37.1 (C3): the "Open ForgeAI to …" note went (swiped, timed out): the live card comes back. */
  const val ACTION_NOTE_GONE = "com.forgeai.rest.NOTE_GONE"
  const val NOTE_ID = 41003
  const val EXTRA_DONE_WORKOUT = "forgeai_done_workout"
  const val EXTRA_DONE_EX = "forgeai_done_ex"
  const val EXTRA_DONE_SET = "forgeai_done_set"
  const val EXTRA_DONE_LABEL = "forgeai_done_label"
  const val EXTRA_DONE_VALUES = "forgeai_done_values"
  /** The longest a Done tap's broadcast is kept open for the app to act on it. */
  const val DONE_HOLD_MS = 2_000L
  /** A Done tap the app has not read by then is dropped by the app; the note goes too. */
  const val DONE_MAX_AGE_MS = 10L * 60_000L
  const val EXTRA_ENDS = "endsAt"
  const val EXTRA_OPEN = "forgeai_open_workout"
  const val ADD_SEC = 15

  private const val PREFS = "forgeai_rest_card"
  /** How long a [setAllDone] waits for its [show]. */
  private const val ALL_DONE_PENDING_MS = 5_000L
  /** The tag of the "Rest is over" now showing ([cancelOver]). */
  private const val PREFS_OVER = "forgeai_rest_over"
  private const val PREFS_QUIET = "forgeai_rest_quiet"
  /** Phase 6: the last Done tap (kept apart from the rest, which [forget] clears). */
  private const val PREFS_DONE = "forgeai_rest_done"
  /** v0.37.1 (C3): when the "Open ForgeAI to …" note was posted (0 = none up). */
  private const val PREFS_NOTE = "forgeai_rest_note"
  /** ForgeAI orange: the cards' tint when the app has not handed over a gym's accent ([color]). */
  internal const val COLOR = 0xFFFF7A3B.toInt()
  /**
   * v0.37.1 (C2): every "Rest is over" removes itself after this long (the app-open one after 60 s,
   * as before). Long enough to be seen after a pocket buzz; its removal brings the live workout
   * card back (the delete intent: Android sends it on a timeout too).
   */
  const val OVER_TIMEOUT_MS = 120_000L
  /** v0.37.1 (C9): the words after a rest that followed the workout's last set. */
  const val ALL_DONE_TEXT = "All sets done · Finish when ready"
  /** v0.46: the bridge tag of "Rest is over" only; the watch app excludes it (it alerts itself). */
  const val BRIDGE_TAG_OVER = "rest-over"
  /** An end that fires this much early (an inexact alarm never does) is re-armed instead. */
  private const val EARLY_MS = 1500L
  /** Logcat tag for the end-of-rest path (the device QA saves these lines). */
  private const val LOG_TAG = "ForgeRest"
  /** [load] reports a rest this long past its end as none (the app's view only). */
  private const val STALE_MS = 60_000L

  /**
   * [allDone] (v0.37.1, C9): the rest after the workout's LAST set — nothing is left to do, so the
   * card and "Rest is over" say "All sets done · Finish when ready" instead of a next set.
   */
  data class Rest(val startedAt: Long, val endsAt: Long, val next: String?, val allDone: Boolean = false)

  /**
   * The row the card's Done ticks. [open]: the row has nothing to save, so Done opens the app.
   * [values]: the row's grey hint when the card was posted (the app compares it at the tap).
   */
  data class DoneTarget(val workout: Long, val exKey: String, val setKey: String, val open: Boolean, val values: String?)

  /** A Done tap as kept for the app ([at] = when it was tapped). */
  data class PendingDone(
    val workout: Long,
    val exKey: String,
    val setKey: String,
    val endsAt: Long,
    val at: Long,
    val open: Boolean,
    val label: String?,
    val values: String?,
  )

  /** Set by the module while JS is alive: (kind, endsAt, startedAt). */
  @Volatile var listener: ((String, Long, Long) -> Unit)? = null

  private val handler = Handler(Looper.getMainLooper())
  private var fastPath: Runnable? = null
  /** A Done tap's broadcast, kept open until the app has acted on it (or [DONE_HOLD_MS]). */
  private var doneHold: BroadcastReceiver.PendingResult? = null
  private var doneHoldEnd: Runnable? = null

  // ------------------------------------------------------------------ state
  /**
   * The rest as saved, however long ago it ended. Phase 0 (RT-01): nothing here throws a rest
   * away for being old any more. Before, a rest more than 60 s past its end was wiped on read,
   * so an alarm Android delivered late (inexact on Android 14+ without "Alarms & reminders")
   * found nothing and "Rest is over" never came. A saved rest is wiped only by [clear] (Skip,
   * the workout finished or discarded), by [fireEnd] once its alert is posted, or by [settle];
   * a new rest overwrites it in [show].
   */
  @Synchronized
  fun stored(ctx: Context): Rest? {
    val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val ends = p.getLong("endsAt", 0L)
    if (ends <= 0L) return null
    return Rest(p.getLong("startedAt", ends), ends, p.getString("next", null), p.getBoolean("allDone", false))
  }

  /**
   * The rest for the app (getState) and for "+15 s". A rest that ended over a minute ago reads
   * as none, as before, so the app's catch-up is unchanged; unlike before, the saved rest is
   * NOT wiped here, so its late alarm still finds it.
   */
  @Synchronized
  fun load(ctx: Context): Rest? {
    val r = stored(ctx) ?: return null
    if (r.endsAt < System.currentTimeMillis() - STALE_MS) return null
    return r
  }

  private fun save(ctx: Context, r: Rest) {
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putLong("startedAt", r.startedAt)
      .putLong("endsAt", r.endsAt)
      .putString("next", r.next)
      .putBoolean("allDone", r.allDone)
      .apply()
  }

  /**
   * Phase 6: the row the next card's Done ticks (null = no Done button). Called by the app just
   * before [show]; kept with the rest, so "+15 s" and a re-post keep it, and wiped with it.
   */
  @Synchronized
  fun setDoneTarget(ctx: Context, t: DoneTarget?) {
    val e = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
    if (t == null) {
      e.remove("doneWorkout").remove("doneEx").remove("doneSet").remove("doneOpen").remove("doneValues")
    } else {
      e.putLong("doneWorkout", t.workout)
        .putString("doneEx", t.exKey)
        .putString("doneSet", t.setKey)
        .putBoolean("doneOpen", t.open)
        .putString("doneValues", t.values)
    }
    e.apply()
  }

  /**
   * v0.37.1 (C9): the next rest follows the workout's last set (true) or not. Called by the app just
   * before [show], like [setDoneTarget]; kept with the rest ("+15 s" keeps it) and wiped with it.
   */
  @Synchronized
  fun setAllDone(ctx: Context, on: Boolean) {
    // Review fix: a pending flag, taken by the [show] that follows within a few seconds — a rest
    // started without one (a manual start) never inherits an old "All sets done".
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putBoolean("pendingAllDone", on)
      .putLong("pendingAllDoneAt", System.currentTimeMillis())
      .apply()
  }

  /** The [setAllDone] just before this [show] (at most [ALL_DONE_PENDING_MS] old), taken once. */
  private fun takeAllDone(ctx: Context): Boolean {
    val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val on = p.getBoolean("pendingAllDone", false) &&
      System.currentTimeMillis() - p.getLong("pendingAllDoneAt", 0L) in 0L..ALL_DONE_PENDING_MS
    p.edit().remove("pendingAllDone").remove("pendingAllDoneAt").apply()
    return on
  }

  /**
   * D5 (gym branding): the gym's accent ("#RRGGBB") the app shows, for both cards' tint; null =
   * ForgeAI orange. Kept apart from the rest ([forget] clears that), so a card posted with the
   * app's JS asleep is the gym's colour too.
   */
  fun setAccent(ctx: Context, hex: String?) {
    val e = ctx.getSharedPreferences(PREFS_QUIET, Context.MODE_PRIVATE).edit()
    if (hex.isNullOrEmpty()) e.remove("accent") else e.putString("accent", hex)
    e.apply()
  }

  /** The cards' tint: the gym's accent the app handed over ([setAccent]), else ForgeAI orange. */
  internal fun color(ctx: Context): Int {
    val s: String? = try {
      ctx.getSharedPreferences(PREFS_QUIET, Context.MODE_PRIVATE).getString("accent", null)
    } catch (_: Exception) {
      null
    }
    if (s == null || !s.startsWith("#")) return COLOR
    return try {
      android.graphics.Color.parseColor(s)
    } catch (_: Exception) {
      COLOR
    }
  }

  @Synchronized
  fun doneTarget(ctx: Context): DoneTarget? {
    val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val ex = p.getString("doneEx", null) ?: return null
    val set = p.getString("doneSet", null) ?: return null
    val workout = p.getLong("doneWorkout", 0L)
    if (workout <= 0L) return null
    return DoneTarget(workout, ex, set, p.getBoolean("doneOpen", false), p.getString("doneValues", null))
  }

  /**
   * "Workout sounds" off in Profile: "Rest is over" only vibrates (and still buzzes the watch).
   * Kept apart from the rest, which [forget] clears.
   */
  fun setQuiet(ctx: Context, quiet: Boolean) {
    ctx.getSharedPreferences(PREFS_QUIET, Context.MODE_PRIVATE).edit().putBoolean("quiet", quiet).apply()
  }

  private fun quiet(ctx: Context): Boolean =
    ctx.getSharedPreferences(PREFS_QUIET, Context.MODE_PRIVATE).getBoolean("quiet", false)

  /** Profile: "Ring through Do Not Disturb" (RT-12). Kept beside the sounds switch. */
  fun setRingThroughDnd(ctx: Context, on: Boolean) {
    val was = ringThroughDnd(ctx)
    ctx.getSharedPreferences(PREFS_QUIET, Context.MODE_PRIVATE).edit().putBoolean("dnd", on).commit()
    // C5-7: switched mid-rest: the watch's buzz for THIS rest follows at once (it was sent only
    // with a rest start or +15 s, so the watch kept the old choice until the next rest).
    if (was != on) {
      val r = load(ctx)
      if (r != null && r.endsAt > System.currentTimeMillis()) WearSync.rest(ctx, r)
    }
  }

  /** Also sent to the watch app (WearSync): its buzz gets through Do Not Disturb only when this is on. */
  internal fun ringThroughDnd(ctx: Context): Boolean =
    ctx.getSharedPreferences(PREFS_QUIET, Context.MODE_PRIVATE).getBoolean("dnd", false)

  /**
   * R-55 (22 Oct 2026, owner backlog "Pick your rest-over sound"): Settings → Workouts → "Rest-over
   * sound". "forge" (the ForgeAI chime) keeps the original channels, so nothing changes for a member
   * who never picks. Every other sound has its own three loud channels: Android never changes a
   * channel's sound, so a sound is a channel id ("rest-over-sound-bell" ...). Only the chosen
   * sound's channels exist beside the chime's; picking another deletes them. The open app plays the
   * same file (assets/sounds/rest-<id>.wav, scripts/make_rest_sounds.py): one sound on both paths.
   */
  internal val SOUNDS = listOf("bell", "beep", "whistle")
  private const val DEFAULT_SOUND = "forge"
  private val SOUND_NAMES = mapOf("bell" to "Bell", "beep" to "Double beep", "whistle" to "Whistle")

  fun setSound(ctx: Context, id: String) {
    val s = if (id in SOUNDS) id else DEFAULT_SOUND
    ctx.getSharedPreferences(PREFS_QUIET, Context.MODE_PRIVATE).edit().putString("sound", s).commit()
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val m = nm(ctx)
    for (other in SOUNDS) {
      if (other == s) continue
      for (base in listOf(CH_OVER, CH_OVER_OPEN_SOUND, CH_OVER_ALARM)) {
        val chId = soundChannel(base, other)
        if (m.getNotificationChannel(chId) == null) continue
        try {
          m.deleteNotificationChannel(chId)
        } catch (e: Exception) {
          android.util.Log.w("ForgeErr", "old sound channel $chId not deleted", e)
        }
      }
    }
    ensureChannels(ctx)
  }

  internal fun sound(ctx: Context): String {
    val s = ctx.getSharedPreferences(PREFS_QUIET, Context.MODE_PRIVATE).getString("sound", null) ?: return DEFAULT_SOUND
    return if (s in SOUNDS) s else DEFAULT_SOUND
  }

  /** The channel id of [base] for sound [s]: the chime keeps the original ids. */
  private fun soundChannel(base: String, s: String): String = if (s == DEFAULT_SOUND) base else "$base-$s"

  /** The three loud "Rest is over" channels for the member's sound now. */
  private fun chOver(ctx: Context) = soundChannel(CH_OVER, sound(ctx))
  private fun chOverOpenSound(ctx: Context) = soundChannel(CH_OVER_OPEN_SOUND, sound(ctx))
  private fun chOverAlarm(ctx: Context) = soundChannel(CH_OVER_ALARM, sound(ctx))

  /** Is Do Not Disturb (any mode) on right now? */
  private fun dndOn(ctx: Context): Boolean {
    return try {
      val f = nm(ctx).currentInterruptionFilter
      f != NotificationManager.INTERRUPTION_FILTER_ALL && f != NotificationManager.INTERRUPTION_FILTER_UNKNOWN
    } catch (_: Exception) {
      false
    }
  }

  private fun forget(ctx: Context) {
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
  }

  /**
   * Removes "Rest is over", whichever alert is showing. Each alert is posted under its own tag
   * ("over-<end time>"): Android 14 never cancels the timer behind setTimeoutAfter (the "app open"
   * alert's 60 s), and when that timer fires it removes whatever then holds the same id and tag —
   * with one shared id, the NEXT rest's loud alert. A tag per alert means an old timer finds nothing.
   * The untagged id is removed too (alerts posted before this change).
   */
  private fun cancelOver(ctx: Context) {
    val nm = nm(ctx)
    nm.cancel(OVER_ID)
    val p = ctx.getSharedPreferences(PREFS_OVER, Context.MODE_PRIVATE)
    p.getString("tag", null)?.let { nm.cancel(it, OVER_ID) }
    p.edit().remove("tag").remove("at").apply()
  }

  /**
   * 13 Oct 2026 — ONE ForgeAI workout notification at a time (device QA: with two, Android
   * grouped them under one "ForgeAI" header, both collapsed, and the rest card's Done / +15 s /
   * Skip were hidden). Is a rest card or a "Rest is over" up now? The live workout card stays
   * away while it is ([WorkoutCard]). Reads preferences only — never this object's lock, so
   * [WorkoutCard] can ask from the app's thread while a broadcast holds it.
   */
  fun restUp(ctx: Context): Boolean {
    val rest = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    // C5-15: a rest whose card was swiped away ("Clear all") no longer keeps the live card down.
    if (rest.getLong("endsAt", 0L) > 0L && !rest.getBoolean("cardGone", false)) return true
    // v0.37.1 (C3): an "Open ForgeAI to …" note keeps the live card away too (one at a time).
    if (noteUp(ctx)) return true
    val p = ctx.getSharedPreferences(PREFS_OVER, Context.MODE_PRIVATE)
    val tag = p.getString("tag", null) ?: return false
    // Just posted: the system may not list it yet.
    if (System.currentTimeMillis() - p.getLong("at", 0L) < 3_000L) return true
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return false
    return try {
      nm(ctx).activeNotifications.any { it.id == OVER_ID && it.tag == tag }
    } catch (_: Exception) {
      false
    }
  }

  /** Is the "Open ForgeAI to …" note up? Preferences and the system's list only (no lock). */
  private fun noteUp(ctx: Context): Boolean {
    val at = ctx.getSharedPreferences(PREFS_NOTE, Context.MODE_PRIVATE).getLong("at", 0L)
    if (at <= 0L) return false
    val age = System.currentTimeMillis() - at
    if (age < 3_000L) return true
    if (age > DONE_MAX_AGE_MS + 5_000L) return false // timed out (its delete intent may have been lost)
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return false
    return try {
      nm(ctx).activeNotifications.any { it.id == NOTE_ID }
    } catch (_: Exception) {
      false
    }
  }

  /** "Rest is over" was swiped away (or timed out): forget it and bring the live workout card back. */
  fun overGone(ctx: Context) {
    ctx.getSharedPreferences(PREFS_OVER, Context.MODE_PRIVATE).edit().remove("tag").remove("at").apply()
    WorkoutCard.restore(ctx)
  }

  /**
   * C5-15: the rest card went while its rest still runs ("Clear all" in the shade, a swipe, or its
   * own timeout on a phone whose alarm is late). Before, the countdown and Done / +15 s / Skip were
   * gone AND the live card stayed down until the rest ended. Now the live card ("Complete set")
   * comes back for the rest of the rest; "Rest is over" still comes at the end.
   */
  @Synchronized
  fun cardGone(ctx: Context) {
    val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    if (p.getLong("endsAt", 0L) <= 0L) return
    p.edit().putBoolean("cardGone", true).commit()
    android.util.Log.i(LOG_TAG, "rest card gone mid-rest: live card back")
    WorkoutCard.restore(ctx)
  }

  /** C5-15: a rest runs whose card was swiped away (preferences only, no lock, like [restUp]). */
  fun restCardGone(ctx: Context): Boolean {
    val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    return p.getLong("endsAt", 0L) > 0L && p.getBoolean("cardGone", false)
  }

  /** v0.37.1 (C3): the "Open ForgeAI to …" note went (swiped or timed out): the live card is back. */
  fun noteGone(ctx: Context) {
    ctx.getSharedPreferences(PREFS_NOTE, Context.MODE_PRIVATE).edit().clear().apply()
    WorkoutCard.restore(ctx)
  }

  /**
   * v0.37.1 (C2): the app came to the front, or a set was ticked with no rest to start: an old
   * "Rest is over" has done its job, so it goes and the live workout card comes back (one at a
   * time). A running rest is left alone (its card stays; [restore] keeps the live card down).
   */
  @Synchronized
  fun dismissOver(ctx: Context) {
    cancelOver(ctx)
    WorkoutCard.restore(ctx)
  }

  // ------------------------------------------------------------------ actions
  /** A rest started or changed in the app. */
  @Synchronized
  fun show(ctx: Context, startedAt: Long, endsAt: Long, next: String?) {
    // Review fix: the card after the LAST set says "All sets done" from its first post.
    // C5-8: a re-post of the SAME rest (same start: the app adopting a rest started from the shade,
    // or its own +15 s) keeps the "All sets done" it already has; only a new rest needs the flag.
    val same = stored(ctx)?.let { it.startedAt == startedAt && it.allDone } == true
    val r = Rest(startedAt, endsAt, next, takeAllDone(ctx) || same)
    WearSync.probeWatch(ctx) // C5-3: which countdown channel the NEXT post uses
    save(ctx, r)
    cancelOver(ctx) // an old "Rest is over" goes when the next rest starts
    post(ctx, r)
    arm(ctx, endsAt)
    WearSync.rest(ctx, r) // v0.46: the watch app's countdown and its own end alarm
  }

  /**
   * "+15 s" on the card (phone shade or watch). Returns the new rest, or null if none runs.
   * Pressed after the end but before a late "Rest is over" (RT-01): 15 s from now, not ignored.
   */
  @Synchronized
  fun add(ctx: Context): Rest? {
    val cur = load(ctx) ?: return null
    val now = System.currentTimeMillis()
    val r = cur.copy(endsAt = maxOf(cur.endsAt, now) + ADD_SEC * 1000L)
    save(ctx, r)
    post(ctx, r)
    arm(ctx, r.endsAt)
    WearSync.rest(ctx, r)
    return r
  }

  /** "Skip" on the card, or the app skipped / the workout ended. */
  @Synchronized
  fun clear(ctx: Context, dismissOver: Boolean) {
    forget(ctx)
    disarm(ctx)
    nm(ctx).cancel(CARD_ID)
    if (dismissOver) cancelOver(ctx)
    android.util.Log.i(LOG_TAG, "rest cleared (dismissOver=$dismissOver)")
    WearSync.restGone(ctx, ended = false)
    // One at a time: the rest is gone, so the live workout card comes back (none after Finish).
    WorkoutCard.restore(ctx)
  }

  /**
   * The alarm (or the in-process timer) for [expected] went off. Phase 0 (RT-01): however late
   * it comes, "Rest is over" is posted at once. No ghost alert: the guards are the saved rest
   * itself. Skip, Finish and Discard wipe it ([clear]); the next set's rest replaces it and
   * "+15 s" moves it, so its end no longer matches [expected]; the app's own catch-up wipes a
   * long-overdue one while the member is looking at the app ([settle]).
   */
  @Synchronized
  fun fireEnd(ctx: Context, expected: Long) {
    // Device QA run 38081757903: the alarm went off on time on a sleeping phone, yet no
    // "Rest is over" was in the list 50 s later. These lines (tag ForgeRest) say which way it went.
    val cur = stored(ctx) ?: return endLog(expected, "no saved rest (skipped, finished, or already alerted)")
    if (cur.endsAt != expected) return endLog(expected, "the rest now ends at ${cur.endsAt}, not alerted")
    val now = System.currentTimeMillis()
    if (now < expected - EARLY_MS) {
      endLog(expected, "${expected - now} ms early, armed again")
      arm(ctx, expected)
      return
    }
    forget(ctx)
    disarm(ctx)
    nm(ctx).cancel(CARD_ID)
    endLog(expected, "posting Rest is over, ${now - expected} ms late")
    // The watch buzzes now only if its own alarm has not (and the end is recent: WatchState).
    WearSync.restGone(ctx, ended = true)
    postOver(ctx, cur.next, expected, now - expected, cur.allDone)
    listener?.invoke("end", 0L, 0L)
  }

  private fun endLog(expected: Long, what: String) {
    android.util.Log.i(LOG_TAG, "end $expected: $what")
  }

  /**
   * The app read the rest (getState: it came back on screen, or finished loading). With ForgeAI
   * on screen, a rest whose end passed over a minute ago is settled quietly: the member is
   * looking at the app, which already shows the rest is over, so a late alarm must not buzz
   * later, mid-set. A rest just over (up to a minute) gets its alert now, as an on-time end
   * would. Off screen nothing changes here: the alarm still brings the alert.
   */
  @Synchronized
  fun settle(ctx: Context) {
    val cur = stored(ctx) ?: return
    val now = System.currentTimeMillis()
    if (cur.endsAt > now) return
    if (!appOnScreen(ctx)) return
    if (now - cur.endsAt <= STALE_MS) {
      fireEnd(ctx, cur.endsAt)
      return
    }
    forget(ctx)
    disarm(ctx)
    nm(ctx).cancel(CARD_ID)
    android.util.Log.i(LOG_TAG, "rest settled quietly (ended ${now - cur.endsAt} ms ago, app on screen)")
    WearSync.restGone(ctx, ended = false)
    WorkoutCard.restore(ctx)
  }

  /**
   * The app came back (getState). A running rest's alarm is set again, so a permission granted
   * meanwhile ("Alarms & reminders", D8) makes THIS rest's alert exact, not only the next one.
   */
  @Synchronized
  fun rearm(ctx: Context) {
    val cur = stored(ctx) ?: return
    if (cur.endsAt <= System.currentTimeMillis()) return
    arm(ctx, cur.endsAt)
  }

  /**
   * C5-5 (16 Oct 2026): the phone restarted (or ForgeAI was updated) mid-workout. Android dropped
   * the rest's alarm and every notification, and nothing brought them back until the app was
   * opened: no "Rest is over" on the phone, no live card. Now ([RestBootReceiver]):
   *  - a rest still running gets its card and its alarm back (on time, as before the restart);
   *  - a rest that ended while the phone was off is forgotten quietly (no late alert mid-set);
   *  - the live workout card comes back with its last words (and "Complete set").
   */
  @Synchronized
  fun recover(ctx: Context) {
    val cur = stored(ctx)
    val now = System.currentTimeMillis()
    if (cur != null && cur.endsAt > now) {
      post(ctx, cur)
      arm(ctx, cur.endsAt)
      WearSync.rest(ctx, cur)
      android.util.Log.i(LOG_TAG, "restart: rest until ${cur.endsAt} re-armed")
    } else if (cur != null) {
      forget(ctx)
      disarm(ctx)
      android.util.Log.i(LOG_TAG, "restart: rest that ended ${now - cur.endsAt} ms ago forgotten")
    }
    // A "Rest is over" or note still saved is checked against the system's list ([restUp]): after a
    // restart none is up, after an update one may still be (then the live card waits for it).
    // A workout left open for hours (forgotten) does not get its card back (C5-11).
    if (WorkoutCard.keptWithin(ctx, OfflineTick.STALE_MS)) WorkoutCard.restore(ctx)
  }

  // ------------------------------------------------------------------ Phase 6: Done
  /** The Done tap an intent carries: a button's broadcast, or the app launched by an "open" Done. */
  private fun pendingFrom(intent: Intent, open: Boolean): PendingDone? {
    val ex = intent.getStringExtra(EXTRA_DONE_EX) ?: return null
    val set = intent.getStringExtra(EXTRA_DONE_SET) ?: return null
    val workout = intent.getLongExtra(EXTRA_DONE_WORKOUT, 0L)
    if (workout <= 0L) return null
    return PendingDone(
      workout = workout,
      exKey = ex,
      setKey = set,
      endsAt = intent.getLongExtra(EXTRA_ENDS, 0L),
      at = System.currentTimeMillis(),
      open = open,
      label = intent.getStringExtra(EXTRA_DONE_LABEL),
      values = intent.getStringExtra(EXTRA_DONE_VALUES),
    )
  }

  /** Kept until the app takes it; a newer tap replaces an older one. Written at once (commit). */
  private fun keepPending(ctx: Context, d: PendingDone) {
    ctx.getSharedPreferences(PREFS_DONE, Context.MODE_PRIVATE).edit()
      .clear()
      .putLong("workout", d.workout)
      .putString("ex", d.exKey)
      .putString("set", d.setKey)
      .putLong("endsAt", d.endsAt)
      .putLong("at", d.at)
      .putBoolean("open", d.open)
      .putString("label", d.label)
      .putString("values", d.values)
      .commit()
  }

  /**
   * "Done" tapped on the card or on "Rest is over" (phone shade, lock screen or watch). Keeps the
   * tap for the app and removes "Rest is over"; the card stays until the app posts the next rest.
   * Null when the intent names no row.
   */
  @Synchronized
  fun doneTapped(ctx: Context, intent: Intent): PendingDone? {
    val d = pendingFrom(intent, open = false) ?: return null
    keepPending(ctx, d)
    cancelOver(ctx)
    return d
  }

  /**
   * The app was brought up by an "open" Done (a row with nothing to save): keep that tap for the
   * app, once (the extras are removed). True when the intent carried one.
   *
   * Review fix: removing the extras changes only this copy of the intent. Reopened from Recents
   * after Android closed it, the app is handed the ORIGINAL launch intent, extras and all, which
   * would be read as a fresh tap (a new time, so past the 10-minute check). Such a launch is
   * marked "launched from history" and is never a tap.
   */
  @Synchronized
  fun captureDoneIntent(ctx: Context, intent: Intent?): Boolean {
    if (intent == null) return false
    if ((intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) return false
    val d = pendingFrom(intent, open = true) ?: return false
    intent.removeExtra(EXTRA_DONE_EX)
    intent.removeExtra(EXTRA_DONE_SET)
    intent.removeExtra(EXTRA_DONE_WORKOUT)
    intent.removeExtra(EXTRA_DONE_LABEL)
    intent.removeExtra(EXTRA_DONE_VALUES)
    intent.removeExtra(EXTRA_ENDS)
    keepPending(ctx, d)
    cancelOver(ctx)
    return true
  }

  /** The kept Done tap, taken ONCE by the app (null = none). The app is up: its note goes. */
  @Synchronized
  fun takePending(ctx: Context): PendingDone? {
    val p = ctx.getSharedPreferences(PREFS_DONE, Context.MODE_PRIVATE)
    val ex = p.getString("ex", null)
    val set = p.getString("set", null)
    val d = if (ex != null && set != null) {
      PendingDone(
        workout = p.getLong("workout", 0L),
        exKey = ex,
        setKey = set,
        endsAt = p.getLong("endsAt", 0L),
        at = p.getLong("at", 0L),
        open = p.getBoolean("open", false),
        label = p.getString("label", null),
        values = p.getString("values", null),
      )
    } else {
      null
    }
    p.edit().clear().commit()
    try {
      nm(ctx).cancel(NOTE_ID)
    } catch (_: Exception) {
      // ignore
    }
    // v0.37.1 (C3): the note kept the live card away; with it gone the card comes back.
    val notes = ctx.getSharedPreferences(PREFS_NOTE, Context.MODE_PRIVATE)
    if (notes.getLong("at", 0L) > 0L) {
      notes.edit().clear().apply()
      WorkoutCard.restore(ctx)
    }
    return d
  }

  /**
   * Review fix: a Done tap handed to the running app keeps its broadcast open ([result], from
   * goAsync) until the app has acted on it ([releaseDone]) or [maxMs] passed, whichever is first.
   * Without it a cached app could be frozen by Android between the tap and the tick. A newer tap
   * ends an older hold first; every hold is finished exactly once.
   */
  @Synchronized
  fun holdForDone(result: BroadcastReceiver.PendingResult, maxMs: Long) {
    releaseDone()
    doneHold = result
    val end = Runnable { releaseDone() }
    doneHoldEnd = end
    handler.postDelayed(end, maxMs)
  }

  /** The app acted on the Done tap (or the time is up): its broadcast ends. Safe to call any time. */
  @Synchronized
  fun releaseDone() {
    doneHoldEnd?.let { handler.removeCallbacks(it) }
    doneHoldEnd = null
    val r = doneHold ?: return
    doneHold = null
    try {
      r.finish()
    } catch (_: Exception) {
      // already finished
    }
  }

  /** Done tapped while the app's JS is not running: the tap waits for the app, and says so. */
  fun noteQueued(ctx: Context, label: String?) {
    val what = label ?: "your set"
    postNote(ctx, "Open MettleUp to save $what", "MettleUp was closed. Open it within 10 min to log this set.")
  }

  /**
   * A quiet note (the card's LOW channel: no sound, no watch buzz) that opens ForgeAI when tapped
   * and goes by itself after 10 minutes, when a Done tap is no longer acted on.
   *
   * v0.37.1 (C3), one ForgeAI workout notification at a time: while the note shows, the live
   * workout card is down ([restUp] counts the note); it comes back when the note is tapped (the
   * app opens), swiped away or times out ([noteGone], its delete intent), or the app takes the tap.
   */
  @Suppress("DEPRECATION")
  fun postNote(ctx: Context, title: String, text: String) {
    try {
      ensureChannels(ctx)
      val b = builder(ctx, CH_CARD)
        .setSmallIcon(iconRes(ctx))
        .setColor(color(ctx))
        .setContentTitle(title)
        .setContentText(text)
        .setAutoCancel(true)
        .setOngoing(false)
        .setShowWhen(false)
        .setVisibility(Notification.VISIBILITY_PUBLIC)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        b.setTimeoutAfter(DONE_MAX_AGE_MS)
      } else {
        b.setPriority(Notification.PRIORITY_LOW)
      }
      openIntent(ctx)?.let { b.setContentIntent(it) }
      b.setDeleteIntent(actionIntent(ctx, ACTION_NOTE_GONE, 7))
      ctx.getSharedPreferences(PREFS_NOTE, Context.MODE_PRIVATE).edit().putLong("at", System.currentTimeMillis()).commit()
      WorkoutCard.hide(ctx)
      nm(ctx).notify(NOTE_ID, b.build())
    } catch (_: Exception) {
      // No permission to post: the tap still waits for the app.
    }
  }

  /** One PendingIntent per row, so a tap on an older card still names ITS row, not the newest. */
  private fun doneCode(t: DoneTarget): Int {
    // The hint too: a card posted with another hint for the same row keeps ITS hint.
    val key = t.workout.toString() + "|" + t.exKey + "|" + t.setKey + "|" + (t.values ?: "")
    return 10_000 + ((key.hashCode() and 0x7fffffff) % 1_000_000)
  }

  /**
   * The Done button's intent. 13 Oct 2026: also the live workout card's "Complete set"
   * ([WorkoutCard]), which passes [codeShift] so its PendingIntent never replaces the rest card's.
   */
  internal fun doneIntent(ctx: Context, t: DoneTarget, endsAt: Long, label: String?, codeShift: Int = 0): PendingIntent? {
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    val i: Intent
    if (t.open) {
      // Nothing to save: Done opens the app on the row. Android allows no app launch from a
      // broadcast, so this button launches the app itself; the tap rides on the launch intent.
      i = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName) ?: return null
      i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    } else {
      i = Intent(ctx, RestActionReceiver::class.java).setAction(ACTION_DONE)
    }
    putDone(i, t, endsAt, label)
    return if (t.open) {
      PendingIntent.getActivity(ctx, doneCode(t) + codeShift, i, flags)
    } else {
      PendingIntent.getBroadcast(ctx, doneCode(t) + codeShift, i, flags)
    }
  }

  private fun putDone(i: Intent, t: DoneTarget, endsAt: Long, label: String?) {
    i.putExtra(EXTRA_DONE_WORKOUT, t.workout)
    i.putExtra(EXTRA_DONE_EX, t.exKey)
    i.putExtra(EXTRA_DONE_SET, t.setKey)
    i.putExtra(EXTRA_DONE_LABEL, label)
    i.putExtra(EXTRA_DONE_VALUES, t.values)
    i.putExtra(EXTRA_ENDS, endsAt)
  }

  /**
   * C5-2: a Done / "Complete set" tapped on the ForgeAI watch app ([WearActionService]), as the
   * same broadcast a phone button sends, so it takes the same road (the app, or [OfflineTick]).
   */
  internal fun doneBroadcast(ctx: Context, t: DoneTarget, endsAt: Long, label: String?): Intent {
    val i = Intent(ctx, RestActionReceiver::class.java).setAction(ACTION_DONE)
    putDone(i, t, endsAt, label)
    return i
  }

  private fun doneAction(ctx: Context, icon: Int, t: DoneTarget?, endsAt: Long, label: String?): Notification.Action? {
    if (t == null) return null
    return try {
      val pi = doneIntent(ctx, t, endsAt, label) ?: return null
      Notification.Action.Builder(Icon.createWithResource(ctx, icon), "Done", pi).build()
    } catch (_: Exception) {
      null
    }
  }

  // ------------------------------------------------------------------ D8: access and settings
  /** May the app set exact alarms? Always true below Android 12, where no permission exists. */
  fun canScheduleExact(ctx: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    return try {
      (ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager).canScheduleExactAlarms()
    } catch (_: Exception) {
      true // unknown: never nag
    }
  }

  /** Are ForgeAI's notifications on (Android 13+ asks; any version can block them)? */
  fun notificationsEnabled(ctx: Context): Boolean {
    return try {
      nm(ctx).areNotificationsEnabled()
    } catch (_: Exception) {
      true
    }
  }

  /** Android's "Alarms & reminders" page for this app (Android 12+). False if it did not open. */
  fun openExactAlarmSettings(ctx: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return false
    return try {
      val i = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + ctx.packageName))
      i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      ctx.startActivity(i)
      true
    } catch (_: Exception) {
      openAppDetails(ctx)
    }
  }

  /** Android's notification settings for this app. False if no settings page opened. */
  fun openNotificationSettings(ctx: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return openAppDetails(ctx)
    return try {
      val i = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
      i.putExtra(Settings.EXTRA_APP_PACKAGE, ctx.packageName)
      i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      ctx.startActivity(i)
      true
    } catch (_: Exception) {
      openAppDetails(ctx)
    }
  }

  private fun openAppDetails(ctx: Context): Boolean {
    return try {
      val i = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + ctx.packageName))
      i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      ctx.startActivity(i)
      true
    } catch (_: Exception) {
      false
    }
  }

  /**
   * Rest-alert audit (11 Oct 2026): can "Rest is over" make a sound and a buzz? A member (or a
   * phone's cleaner app) can silence the channel in Android's settings, and nothing in ForgeAI
   * showed it. "ok", "silenced" (no sound and no vibration, or importance low/min) or "blocked".
   */
  fun alertChannelState(ctx: Context): String = worstChannel(ctx)?.second ?: "ok"

  /**
   * C5-14 (16 Oct 2026): every "Rest is over" channel this member's settings can use, not only the
   * screen-off one: "Workout sounds" off uses the vibrate-only channel; otherwise the screen-off
   * and app-open ones, plus the Do Not Disturb one when "Ring through Do Not Disturb" is on.
   * Muting any of them in Android settings silenced some rests while Profile said "on time".
   */
  private fun alertChannels(ctx: Context): List<String> =
    if (quiet(ctx)) {
      listOf(CH_OVER_OPEN)
    } else {
      listOf(chOver(ctx), chOverOpenSound(ctx)) + (if (ringThroughDnd(ctx)) listOf(chOverAlarm(ctx)) else emptyList())
    }

  /** The first of [alertChannels] that cannot alert, with its state ("blocked" / "silenced"); null = all ok. */
  private fun worstChannel(ctx: Context): Pair<String, String>? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return null
    return try {
      ensureChannels(ctx)
      var silenced: Pair<String, String>? = null
      for (id in alertChannels(ctx)) {
        val ch = nm(ctx).getNotificationChannel(id) ?: continue
        val state = when {
          ch.importance == NotificationManager.IMPORTANCE_NONE -> "blocked"
          ch.importance < NotificationManager.IMPORTANCE_DEFAULT -> "silenced"
          // The vibrate-only channel is silenced when it cannot vibrate; the others when they can do neither.
          id == CH_OVER_OPEN && !ch.shouldVibrate() -> "silenced"
          ch.sound == null && !ch.shouldVibrate() -> "silenced"
          else -> "ok"
        }
        if (state == "blocked") return Pair(id, state)
        if (state == "silenced" && silenced == null) silenced = Pair(id, state)
      }
      silenced
    } catch (e: Exception) {
      android.util.Log.w(LOG_TAG, "alert channel state unknown", e)
      null
    }
  }

  /** Can this channel make a sound now (it exists, is not muted, and has one)? */
  private fun channelRings(ctx: Context, id: String): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
    return try {
      ensureChannels(ctx)
      val ch = nm(ctx).getNotificationChannel(id) ?: return false
      ch.importance >= NotificationManager.IMPORTANCE_DEFAULT && ch.sound != null
    } catch (e: Exception) {
      android.util.Log.w(LOG_TAG, "channel $id state unknown", e)
      false
    }
  }

  /**
   * C5-4 + C1-10 (16 Oct 2026): who makes the end-of-rest sound with ForgeAI on screen.
   *  - "hold": Do Not Disturb is on and "Ring through Do Not Disturb" is off. The screen-off alert
   *    is held by DND, so the app's bell stays quiet too (it played out loud before: one rule now).
   *  - "native": "Rest is over" rings itself (its channel, notification volume, held by the ringer
   *    and DND like any notification); the app must not ring a second, MEDIA-volume bell.
   *  - "app": the alert cannot ring (notifications off, its channel muted, "Workout sounds" off,
   *    or Android 7 and older): the app's own bell, as before.
   */
  fun restBell(ctx: Context): String {
    if (dndOn(ctx) && !ringThroughDnd(ctx)) return "hold"
    if (quiet(ctx) || !notificationsEnabled(ctx)) return "app"
    return if (channelRings(ctx, overChannel(ctx))) "native" else "app"
  }

  /** Android's "background restriction" for ForgeAI (Android 9+), which can hold alarms back. */
  fun backgroundRestricted(ctx: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return false
    return try {
      (ctx.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).isBackgroundRestricted
    } catch (_: Exception) {
      false
    }
  }

  /** Android's settings page of the "Rest is over" channel itself. False if none opened. */
  fun openAlertChannelSettings(ctx: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return openAppDetails(ctx)
    return try {
      ensureChannels(ctx)
      val i = Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
      i.putExtra(Settings.EXTRA_APP_PACKAGE, ctx.packageName)
      // C5-14: the channel that is muted, when one is (else the main one).
      i.putExtra(Settings.EXTRA_CHANNEL_ID, worstChannel(ctx)?.first ?: chOver(ctx))
      i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      ctx.startActivity(i)
      true
    } catch (_: Exception) {
      openNotificationSettings(ctx)
    }
  }

  /** The app's own Android page (battery and background settings live under it). */
  fun openAppSettings(ctx: Context): Boolean = openAppDetails(ctx)

  /** The phone's 12/24-hour setting (RT-05). */
  fun is24Hour(ctx: Context): Boolean = DateFormat.is24HourFormat(ctx)

  /** Ringer: 0 silent, 1 vibrate, 2 normal (RT-08). 2 when unknown. */
  fun ringerMode(ctx: Context): Int {
    return try {
      (ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager).ringerMode
    } catch (_: Exception) {
      AudioManager.RINGER_MODE_NORMAL
    }
  }

  // ------------------------------------------------------------------ timing
  private fun endIntent(ctx: Context, endsAt: Long): PendingIntent {
    val i = Intent(ctx, RestActionReceiver::class.java).setAction(ACTION_END).putExtra(EXTRA_ENDS, endsAt)
    return PendingIntent.getBroadcast(ctx, 2, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  private fun arm(ctx: Context, endsAt: Long) {
    disarm(ctx)
    val app = ctx.applicationContext
    // While the process runs and the phone is awake, this fires on the second.
    val run = Runnable { fireEnd(app, endsAt) }
    fastPath = run
    handler.postDelayed(run, maxOf(0L, endsAt - System.currentTimeMillis()))
    // The alarm covers a sleeping phone and a stopped app. Exact only where Android allows
    // it (the "Alarms & reminders" permission, Android 12+); otherwise Android may run it
    // late, and [fireEnd] still alerts then. 0.56.1: with no USE_EXACT_ALARM (Google Play policy)
    // this is the member's own switch; the rest timer asks for it (D8) and [rearm] makes a running
    // rest exact once it is allowed (app back on screen, or Android's broadcast: RestBootReceiver).
    val am = try {
      ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    } catch (_: Exception) {
      return // No alarm: the in-process timer and the app's own timer still run.
    }
    val pi = endIntent(app, endsAt)
    val exact = try {
      Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()
    } catch (_: Exception) {
      false
    }
    if (exact) {
      // Rest-alert audit (11 Oct 2026): an ALARM CLOCK alarm, as timer apps use. It is the one
      // kind Android delivers on the second in Doze (an allow-while-idle exact alarm may be held
      // up to 15 minutes there) and that phone makers' battery savers leave alone. Its "show"
      // intent (the alarm icon in the status bar) opens the workout.
      try {
        val show = openIntent(app)
        if (show != null) {
          am.setAlarmClock(AlarmManager.AlarmClockInfo(endsAt, show), pi)
          return
        }
      } catch (_: SecurityException) {
        // The permission was taken away between the check and the call: inexact below.
      } catch (_: Exception) {
        // the plain exact alarm below
      }
      try {
        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endsAt, pi)
        return
      } catch (_: SecurityException) {
        // inexact below
      } catch (_: Exception) {
        // inexact below
      }
    }
    try {
      am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endsAt, pi)
    } catch (_: Exception) {
      // No alarm: the in-process timer and the app's own timer still run.
    }
  }

  private fun disarm(ctx: Context) {
    fastPath?.let { handler.removeCallbacks(it) }
    fastPath = null
    try {
      val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      am.cancel(endIntent(ctx.applicationContext, 0L))
    } catch (_: Exception) {
      // ignore
    }
  }

  // ------------------------------------------------------------------ notifications
  internal fun nm(ctx: Context) = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  internal fun iconRes(ctx: Context): Int {
    val id = ctx.resources.getIdentifier("notification_icon", "drawable", ctx.packageName)
    return if (id != 0) id else ctx.applicationInfo.icon
  }

  /** "1:30" — minutes and seconds. */
  fun fmtLength(sec: Long): String {
    val s = maxOf(0L, sec)
    return "${s / 60}:${(s % 60).toString().padStart(2, '0')}"
  }

  /** "4:12 pm", or "16:12" when the phone uses the 24-hour clock. */
  private fun clock(ctx: Context, ms: Long): String {
    val pattern = if (DateFormat.is24HourFormat(ctx)) "HH:mm" else "h:mm a"
    return SimpleDateFormat(pattern, Locale.ENGLISH).format(Date(ms)).lowercase(Locale.ENGLISH)
  }

  internal fun openIntent(ctx: Context): PendingIntent? {
    val launch = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName) ?: return null
    launch.putExtra(EXTRA_OPEN, true)
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    return PendingIntent.getActivity(ctx, 3, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  internal fun actionIntent(ctx: Context, action: String, code: Int): PendingIntent {
    val i = Intent(ctx, RestActionReceiver::class.java).setAction(action)
    return PendingIntent.getBroadcast(ctx, code, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  @Suppress("DEPRECATION")
  internal fun builder(ctx: Context, channel: String): Notification.Builder =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(ctx, channel)
    else Notification.Builder(ctx)

  /**
   * The app's own rest-done sound (the one the open app plays), for the loud channels. By NAME,
   * not by number (review): a channel keeps its sound address for ever, and a raw resource's
   * number shifts whenever another raw file is added or removed in a later version — the name form
   * is looked up each time it plays. (R.raw is still referenced so the shrinker keeps the file.)
   */
  private fun restSound(ctx: Context, s: String = DEFAULT_SOUND): Uri {
    // R-55: each sound's file by name (the numbers below only keep the files in a release build).
    val res = when (s) {
      "bell" -> R.raw.forge_rest_bell
      "beep" -> R.raw.forge_rest_beep
      "whistle" -> R.raw.forge_rest_whistle
      else -> R.raw.forge_rest_done
    }
    if (res == 0) android.util.Log.w("ForgeErr", "rest sound resource missing: $s")
    val file = if (s == DEFAULT_SOUND) "forge_rest_done" else "forge_rest_$s"
    return Uri.parse("android.resource://${ctx.packageName}/raw/$file")
  }

  /** R-55: the chosen sound's own three loud channels (the chime's are made above). */
  private fun ensureSoundChannels(ctx: Context, m: NotificationManager) {
    val s = sound(ctx)
    if (s == DEFAULT_SOUND) return
    val label = SOUND_NAMES[s] ?: s
    val usage = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).build()
    val over = soundChannel(CH_OVER, s)
    if (m.getNotificationChannel(over) == null) {
      m.createNotificationChannel(
        NotificationChannel(over, "$OVER_NAME: $label", NotificationManager.IMPORTANCE_HIGH).apply {
          description = OVER_DESC
          setSound(restSound(ctx, s), usage)
          enableVibration(true)
          vibrationPattern = longArrayOf(0, 250, 150, 250)
          setShowBadge(false)
          lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        },
      )
    }
    val open = soundChannel(CH_OVER_OPEN_SOUND, s)
    if (m.getNotificationChannel(open) == null) {
      m.createNotificationChannel(
        NotificationChannel(open, "Rest is over, app open: $label", NotificationManager.IMPORTANCE_DEFAULT).apply {
          description = "Rings when rest ends while MettleUp is on screen, at notification volume"
          setSound(restSound(ctx, s), usage)
          enableVibration(false)
          setShowBadge(false)
          lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        },
      )
    }
    val alarm = soundChannel(CH_OVER_ALARM, s)
    if (m.getNotificationChannel(alarm) == null) {
      m.createNotificationChannel(
        NotificationChannel(alarm, "Rest is over, through Do Not Disturb: $label", NotificationManager.IMPORTANCE_HIGH).apply {
          description = "Used only when you turn on Ring through Do Not Disturb in MettleUp"
          setSound(
            restSound(ctx, s),
            AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_ALARM)
              .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
              .build(),
          )
          enableVibration(true)
          vibrationPattern = longArrayOf(0, 250, 150, 250)
          setShowBadge(false)
          lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        },
      )
    }
  }

  private fun ensureChannels(ctx: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val m = nm(ctx)
    for (old in CH_OVER_OLD) {
      if (m.getNotificationChannel(old) != null) {
        try {
          m.deleteNotificationChannel(old)
        } catch (e: Exception) {
          android.util.Log.w("ForgeErr", "old rest channel $old not deleted", e)
        }
      }
    }
    if (m.getNotificationChannel(CH_CARD) == null) {
      // Review fix: LOW importance again. A Wear OS watch buzzes for a bridged notification of
      // DEFAULT importance even when its channel has no sound or vibration, so DEFAULT made the
      // watch vibrate at the START of every rest. Only "Rest is over" (its own HIGH channel)
      // should buzz. The card stays on the lock screen (PUBLIC, no private data) and the watch
      // still shows it; the price is that the phone files it under "Silent".
      m.createNotificationChannel(
        NotificationChannel(CH_CARD, "Rest countdown", NotificationManager.IMPORTANCE_LOW).apply {
          description = "Shows your rest on the phone and on your watch, with +15 s and Skip"
          setSound(null, null)
          enableVibration(false)
          enableLights(false)
          setShowBadge(false)
          lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        },
      )
    }
    if (m.getNotificationChannel(CH_CARD_LIVE) == null) {
      // C5-3: DEFAULT, so the phone lists it with the normal notifications and shows it on a lock
      // screen that hides silent ones. No sound, no vibration; posted with onlyAlertOnce.
      m.createNotificationChannel(
        NotificationChannel(CH_CARD_LIVE, "Rest countdown on the lock screen", NotificationManager.IMPORTANCE_DEFAULT).apply {
          description = "Your rest counting down, with Done, +15 s and Skip. Never makes a sound."
          setSound(null, null)
          enableVibration(false)
          enableLights(false)
          setShowBadge(false)
          lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        },
      )
    }
    if (m.getNotificationChannel(CH_OVER_OPEN_SOUND) == null) {
      m.createNotificationChannel(
        NotificationChannel(CH_OVER_OPEN_SOUND, "Rest is over, app open", NotificationManager.IMPORTANCE_DEFAULT).apply {
          description = "Rings when rest ends while MettleUp is on screen, at notification volume"
          setSound(
            restSound(ctx),
            AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).build(),
          )
          enableVibration(false)
          setShowBadge(false)
          lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        },
      )
    }
    if (m.getNotificationChannel(CH_CARD_OLD) != null) {
      try {
        m.deleteNotificationChannel(CH_CARD_OLD)
      } catch (_: Exception) {
        // ignore
      }
    }
    if (m.getNotificationChannel(CH_OVER_ALARM) == null) {
      m.createNotificationChannel(
        NotificationChannel(CH_OVER_ALARM, "Rest is over, through Do Not Disturb", NotificationManager.IMPORTANCE_HIGH).apply {
          description = "Used only when you turn on Ring through Do Not Disturb in MettleUp"
          setSound(
            restSound(ctx),
            AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_ALARM)
              .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
              .build(),
          )
          enableVibration(true)
          vibrationPattern = longArrayOf(0, 250, 150, 250)
          setShowBadge(false)
          lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        },
      )
    }
    // C9-26: the channel was called "Rest timer". On a phone that already has it, creating it again
    // with the same id changes only its name and description; Android keeps the member's sound, buzz
    // and importance choices (the same rename as CH_OVER_OPEN below).
    if (m.getNotificationChannel(CH_OVER)?.name?.toString() != OVER_NAME) {
      m.createNotificationChannel(
        NotificationChannel(CH_OVER, OVER_NAME, NotificationManager.IMPORTANCE_HIGH).apply {
          description = OVER_DESC
          setSound(
            restSound(ctx),
            AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).build(),
          )
          enableVibration(true)
          vibrationPattern = longArrayOf(0, 250, 150, 250)
          setShowBadge(false)
          lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        },
      )
    }
    // C5-4: since the app-open alert rings itself (CH_OVER_OPEN_SOUND), this vibrate-only channel is
    // the "Workout sounds" off one. Android lets an app rename a channel (never change its sound).
    if (m.getNotificationChannel(CH_OVER_OPEN)?.name?.toString() != OPEN_QUIET_NAME) {
      m.createNotificationChannel(
        NotificationChannel(CH_OVER_OPEN, OPEN_QUIET_NAME, NotificationManager.IMPORTANCE_DEFAULT).apply {
          description = "Buzzes when rest ends while Workout sounds are off in MettleUp"
          setSound(null, null)
          enableVibration(true)
          vibrationPattern = longArrayOf(0, 250, 150, 250)
          setShowBadge(false)
          lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        },
      )
    }
    ensureSoundChannels(ctx, m)
  }

  /** Card title, e.g. "Rest 1:30 · ends 4:12 pm". */
  fun title(ctx: Context, r: Rest): String {
    val len = Math.round((r.endsAt - r.startedAt) / 1000.0)
    return "Rest ${fmtLength(len)} · ends ${clock(ctx, r.endsAt)}"
  }

  /**
   * RT-05: the card's own view. A big line that counts down the time LEFT
   * ("2:53 left · Bench Press, set 2") and, under it, the old title ("Rest 3:00 · ends 4:27 pm").
   * Looked up by name, so a build without the layout simply posts the plain card.
   */
  private fun countdownView(ctx: Context, r: Rest): RemoteViews? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return null
    return try {
      val res = ctx.resources
      val pkg = ctx.packageName
      val layout = res.getIdentifier("forge_rest_card", "layout", pkg)
      val left = res.getIdentifier("forge_rest_left", "id", pkg)
      val line = res.getIdentifier("forge_rest_line", "id", pkg)
      val sub = res.getIdentifier("forge_rest_sub", "id", pkg)
      if (layout == 0 || left == 0 || line == 0 || sub == 0) return null
      val v = RemoteViews(pkg, layout)
      val base = SystemClock.elapsedRealtime() + (r.endsAt - System.currentTimeMillis())
      v.setChronometer(left, base, null, true)
      v.setChronometerCountDown(left, true)
      v.setTextViewText(line, if (r.allDone) " left · All sets done" else if (r.next != null) " left · ${r.next}" else " left")
      v.setTextViewText(sub, title(ctx, r))
      v
    } catch (_: Exception) {
      null
    }
  }

  @Suppress("DEPRECATION")
  private fun post(ctx: Context, r: Rest) {
    try {
      ensureChannels(ctx)
      val icon = iconRes(ctx)
      // C5-3: DEFAULT (shown on any lock screen), unless a watch without the ForgeAI app would
      // copy it and buzz at every rest start: then the LOW card as before.
      val channel = if (WearSync.plainWatch(ctx)) CH_CARD else CH_CARD_LIVE
      // C5-15: a re-post (a new rest, +15 s) is up again: the live card goes back down.
      ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove("cardGone").commit()
      val b = builder(ctx, channel)
        .setSmallIcon(icon)
        .setColor(color(ctx))
        .setContentTitle(title(ctx, r))
        .setContentText(if (r.allDone) ALL_DONE_TEXT else if (r.next != null) "Next: ${r.next}" else "Time to rest")
        .setOnlyAlertOnce(true)
        .setAutoCancel(false)
        .setOngoing(false)
        .setWhen(r.endsAt)
        .setCategory("stopwatch") // Notification.CATEGORY_STOPWATCH (Android 12+); older ones ignore it
        .setVisibility(Notification.VISIBILITY_PUBLIC)
      // Phase 6: Done first (the most used), then +15 s and Skip; a watch shows them in this order.
      doneAction(ctx, icon, doneTarget(ctx), r.endsAt, r.next)?.let { b.addAction(it) }
      b.addAction(Notification.Action.Builder(Icon.createWithResource(ctx, icon), "+15 s", actionIntent(ctx, ACTION_ADD, 4)).build())
      b.addAction(Notification.Action.Builder(Icon.createWithResource(ctx, icon), "Skip", actionIntent(ctx, ACTION_SKIP, 5)).build())
      val view = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) countdownView(ctx, r) else null
      if (view != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        // The system still draws the header and the Done, +15 s and Skip buttons around it; a watch
        // keeps showing the title and text set above. Review fix: no chronometer in the header
        // here. The custom line already counts down ("2:53 left"), and a header chronometer
        // was a second countdown right above it.
        b.setShowWhen(false)
        b.setStyle(Notification.DecoratedCustomViewStyle())
        b.setCustomContentView(view)
      } else {
        // The plain card (no custom layout): the header chronometer IS its countdown.
        b.setShowWhen(true).setUsesChronometer(true)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) b.setChronometerCountDown(true)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        // A card left behind by a stopped phone removes itself a minute after the rest.
        b.setTimeoutAfter(maxOf(1000L, r.endsAt - System.currentTimeMillis()) + 60_000L)
      } else {
        b.setPriority(Notification.PRIORITY_LOW)
      }
      openIntent(ctx)?.let { b.setContentIntent(it) }
      // C5-3: the ForgeAI watch app asks Wear OS not to copy this card (it shows its own countdown
      // with Done / +15 s / Skip); a watch without the app still gets it.
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) b.extend(Notification.WearableExtender().setBridgeTag(BRIDGE_TAG_CARD))
      // C5-15: swiped away or "Clear all" mid-rest: the live card comes back ([cardGone]).
      b.setDeleteIntent(actionIntent(ctx, ACTION_CARD_GONE, 8))
      // C5 review (16 Oct 2026): on the DEFAULT channel this card, posted afresh at every rest
      // start, counted as a new alerting notification, which can wake a Pixel's screen ("Wake
      // screen for notifications") in a pocket at every set. onlyAlertOnce covers updates only.
      // Chosen: the card is the lone child of its own group with GROUP_ALERT_SUMMARY and no summary
      // is ever posted, so Android never lets this card alert (no sound, buzz, peek or screen
      // wake: "suppressed by group alert behaviour") while its DEFAULT importance still lists it
      // with the normal notifications and on a lock screen that hides silent ones (what C5-3 needs).
      // (androidx's NotificationCompat.setSilent works the same way.) Keeping one notification up
      // between rests instead would break "one at a time" with the live card.
      if (channel == CH_CARD_LIVE && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        b.setGroup(QUIET_GROUP).setGroupAlertBehavior(Notification.GROUP_ALERT_SUMMARY)
      }
      nm(ctx).notify(CARD_ID, b.build())
      // One at a time: the rest card alone while the rest runs (it names the next set, and its
      // Done ticks it) — also when the rest started with the app's JS asleep.
      WorkoutCard.hide(ctx)
    } catch (e: Exception) {
      // No permission to post: the in-app timer still works.
      android.util.Log.w(LOG_TAG, "rest card not posted", e)
    }
  }

  /** Is ForgeAI on screen right now (screen on, unlocked, app in front)? */
  fun appOnScreen(ctx: Context): Boolean {
    return try {
      val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
      val kg = ctx.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
      val info = ActivityManager.RunningAppProcessInfo()
      ActivityManager.getMyMemoryState(info)
      pm.isInteractive && !kg.isKeyguardLocked &&
        info.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
    } catch (_: Exception) {
      false
    }
  }

  /**
   * The "Rest is over" text. On time: "Next: …" (one word per idea, Phase 7). A minute or more late (RT-01):
   * "Ended 2 min ago · Next: …", so a late alert is not taken for a fresh one.
   */
  fun overText(next: String?, lateMs: Long, allDone: Boolean = false): String {
    // v0.37.1 (C9): after the workout's last set nothing is next (the live card's "All sets done · Finish").
    val base = if (allDone) ALL_DONE_TEXT else if (next != null) "Next: $next" else "Time for your next set"
    val mins = lateMs / 60_000L
    return if (mins >= 1L) "Ended $mins min ago · $base" else base
  }

  /**
   * The channel "Rest is over" goes out on now:
   *  - "Workout sounds" off: vibrate only (wherever the app is);
   *  - RT-12: Do Not Disturb on and "Ring through Do Not Disturb" on: the alarm channel, which DND
   *    lets through (C1-10: now also with the app on screen);
   *  - C5-4: ForgeAI on screen: the app-open channel, the same sound at notification volume;
   *  - otherwise the loud screen-off alert.
   */
  private fun overChannel(ctx: Context): String = when {
    quiet(ctx) -> CH_OVER_OPEN
    ringThroughDnd(ctx) && dndOn(ctx) -> chOverAlarm(ctx)
    appOnScreen(ctx) -> chOverOpenSound(ctx)
    else -> chOver(ctx) // R-55: the member's chosen sound (the chime keeps the original ids)
  }

  @Suppress("DEPRECATION")
  private fun postOver(ctx: Context, next: String?, endsAt: Long, lateMs: Long, allDone: Boolean) {
    try {
      ensureChannels(ctx)
      val icon = iconRes(ctx)
      val channel = overChannel(ctx)
      val open = appOnScreen(ctx) || channel == CH_OVER_OPEN
      val soft = channel == CH_OVER_OPEN || channel == chOverOpenSound(ctx)
      // 13 Oct 2026: Android 15+ "notification cooldown" (on by default on Pixel, and a Pixel Watch
      // follows it) mutes the buzz of a second alert from one app within ~2 minutes — one rest
      // after another. Alarm-category alerts skip it, so every "Rest is over" is an alarm on every
      // channel... except while Do Not Disturb is on and the member has NOT chosen "Ring through
      // Do Not Disturb": Do Not Disturb lets alarms through, so there it stays a reminder (RT-12).
      val category = if (dndOn(ctx) && !ringThroughDnd(ctx)) Notification.CATEGORY_REMINDER else Notification.CATEGORY_ALARM
      val b = builder(ctx, channel)
        .setSmallIcon(icon)
        .setColor(color(ctx))
        .setContentTitle("Rest is over")
        .setContentText(overText(next, lateMs, allDone))
        .setShowWhen(true)
        .setWhen(endsAt)
        .setAutoCancel(true)
        .setOngoing(false)
        .setCategory(category)
        .setVisibility(Notification.VISIBILITY_PUBLIC)
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
        // Android 7 and older (no channels): the app on screen rings its own bell there ([restBell]).
        b.setPriority(if (soft) Notification.PRIORITY_DEFAULT else Notification.PRIORITY_MAX)
        if (soft) {
          b.setDefaults(Notification.DEFAULT_VIBRATE)
        } else {
          // R-55 (review): the member's own sound here too, not the phone's default tone.
          val usage = if (channel == chOverAlarm(ctx)) AudioAttributes.USAGE_ALARM else AudioAttributes.USAGE_NOTIFICATION
          b.setDefaults(Notification.DEFAULT_VIBRATE or Notification.DEFAULT_LIGHTS)
            .setSound(restSound(ctx, sound(ctx)), AudioAttributes.Builder().setUsage(usage).build())
        }
      }
      // App on screen: the watch has buzzed by the time this goes; the app shows the rest is over.
      // v0.37.1 (C2): EVERY "Rest is over" goes by itself — one posted with the app in the
      // background used to stay until swiped, keeping the live workout card away all that time.
      // Its timeout sends the delete intent below (Android cancels with sendDelete on a timeout),
      // which brings the live card back; the app coming to the front or a tick also clear it
      // ([dismissOver]).
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) b.setTimeoutAfter(if (open) 60_000L else OVER_TIMEOUT_MS)
      // C5-1 (16 Oct 2026): the live card's "Complete set" (the set named by "Next: …"). Without
      // it, a locked phone had no button anywhere for up to 2 minutes after every rest: the rest
      // card (Done) goes at the end and the live card waits for this alert to leave.
      // History: a "Done" here was taken off on 11 Oct (device QA run 38081757903: posted with 1
      // action, then removed by Android within 30 s). The same fix gave every alert its own tag
      // because an older alert's 60 s setTimeoutAfter timer removes whatever holds its id and tag:
      // that timer fits the removal at least as well. If Android removes this alert early anyway,
      // its delete intent brings the live card ("Complete set") back, so a button stays.
      WorkoutCard.completeAction(ctx, icon)?.let { b.addAction(it) }
      openIntent(ctx)?.let { b.setContentIntent(it) }
      // v0.46: the ForgeAI watch app buzzes at the rest's end itself, so it asks Wear OS not to
      // copy THIS alert (its BridgingConfig excludes the tag "rest-over"). U-W1 (17 Oct 2026): it
      // excludes it in every case, also while the member has refused the watch app's
      // notifications (its buzz needs none; only its "Rest is over" card is then missing), so the
      // watch buzzes exactly once. It excludes the countdown's "rest-card" (C5-3) only while its
      // notifications are allowed. Only this alert carries "rest-over". Without the watch app the
      // tags change nothing.
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) b.extend(Notification.WearableExtender().setBridgeTag(BRIDGE_TAG_OVER))
      // Swiped away: the live workout card comes back (one at a time).
      b.setDeleteIntent(actionIntent(ctx, ACTION_OVER_GONE, 6))
      val tag = "over-$endsAt"
      ctx.getSharedPreferences(PREFS_OVER, Context.MODE_PRIVATE).edit().putString("tag", tag).putLong("at", System.currentTimeMillis()).commit()
      WorkoutCard.hide(ctx)
      nm(ctx).notify(tag, OVER_ID, b.build())
      android.util.Log.i(LOG_TAG, "Rest is over posted on $channel")
    } catch (e: Exception) {
      android.util.Log.w(LOG_TAG, "Rest is over NOT posted", e)
    }
  }
}
