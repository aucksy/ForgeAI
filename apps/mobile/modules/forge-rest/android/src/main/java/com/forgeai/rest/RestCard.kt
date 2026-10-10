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
import android.media.RingtoneManager
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
 */
object RestCard {
  const val CARD_ID = 41001
  const val OVER_ID = 41002
  const val CH_CARD = "rest-card-v2"
  /** The v0.26.1 card channel (LOW importance, filed under "Silent"); deleted on first use. */
  private const val CH_CARD_OLD = "rest-card"
  const val CH_OVER = "rest-timer" // the same loud channel the app has used since v0.22
  const val CH_OVER_OPEN = "rest-over-open"
  const val CH_OVER_ALARM = "rest-over-alarm"
  const val ACTION_ADD = "com.forgeai.rest.ADD15"
  const val ACTION_SKIP = "com.forgeai.rest.SKIP"
  const val ACTION_END = "com.forgeai.rest.END"
  const val ACTION_DONE = "com.forgeai.rest.DONE"
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
  /** The tag of the "Rest is over" now showing ([cancelOver]). */
  private const val PREFS_OVER = "forgeai_rest_over"
  private const val PREFS_QUIET = "forgeai_rest_quiet"
  /** Phase 6: the last Done tap (kept apart from the rest, which [forget] clears). */
  private const val PREFS_DONE = "forgeai_rest_done"
  private const val COLOR = 0xFFFF7A3B.toInt()
  /** An end that fires this much early (an inexact alarm never does) is re-armed instead. */
  private const val EARLY_MS = 1500L
  /** Logcat tag for the end-of-rest path (the device QA saves these lines). */
  private const val LOG_TAG = "ForgeRest"
  /** [load] reports a rest this long past its end as none (the app's view only). */
  private const val STALE_MS = 60_000L

  data class Rest(val startedAt: Long, val endsAt: Long, val next: String?)

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
    return Rest(p.getLong("startedAt", ends), ends, p.getString("next", null))
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
    ctx.getSharedPreferences(PREFS_QUIET, Context.MODE_PRIVATE).edit().putBoolean("dnd", on).apply()
  }

  private fun ringThroughDnd(ctx: Context): Boolean =
    ctx.getSharedPreferences(PREFS_QUIET, Context.MODE_PRIVATE).getBoolean("dnd", false)

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
    ctx.getSharedPreferences(PREFS_OVER, Context.MODE_PRIVATE).getString("tag", null)?.let { nm.cancel(it, OVER_ID) }
  }

  // ------------------------------------------------------------------ actions
  /** A rest started or changed in the app. */
  @Synchronized
  fun show(ctx: Context, startedAt: Long, endsAt: Long, next: String?) {
    val r = Rest(startedAt, endsAt, next)
    save(ctx, r)
    cancelOver(ctx) // an old "Rest is over" goes when the next rest starts
    post(ctx, r)
    arm(ctx, endsAt)
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
    postOver(ctx, cur.next, expected, now - expected)
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
    postNote(ctx, "Open ForgeAI to save $what", "ForgeAI was closed. Open it within 10 min to log this set.")
  }

  /**
   * A quiet note (the card's LOW channel: no sound, no watch buzz) that opens ForgeAI when tapped
   * and goes by itself after 10 minutes, when a Done tap is no longer acted on.
   */
  @Suppress("DEPRECATION")
  fun postNote(ctx: Context, title: String, text: String) {
    try {
      ensureChannels(ctx)
      val b = builder(ctx, CH_CARD)
        .setSmallIcon(iconRes(ctx))
        .setColor(COLOR)
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

  private fun doneIntent(ctx: Context, t: DoneTarget, endsAt: Long, label: String?): PendingIntent? {
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
    i.putExtra(EXTRA_DONE_WORKOUT, t.workout)
    i.putExtra(EXTRA_DONE_EX, t.exKey)
    i.putExtra(EXTRA_DONE_SET, t.setKey)
    i.putExtra(EXTRA_DONE_LABEL, label)
    i.putExtra(EXTRA_DONE_VALUES, t.values)
    i.putExtra(EXTRA_ENDS, endsAt)
    return if (t.open) {
      PendingIntent.getActivity(ctx, doneCode(t), i, flags)
    } else {
      PendingIntent.getBroadcast(ctx, doneCode(t), i, flags)
    }
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
    // late, and [fireEnd] still alerts then. Asking for the permission is a later phase (D8).
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
      try {
        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endsAt, pi)
        return
      } catch (_: SecurityException) {
        // The permission was taken away between the check and the call: inexact below.
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
  private fun nm(ctx: Context) = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  private fun iconRes(ctx: Context): Int {
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

  private fun openIntent(ctx: Context): PendingIntent? {
    val launch = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName) ?: return null
    launch.putExtra(EXTRA_OPEN, true)
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    return PendingIntent.getActivity(ctx, 3, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  private fun actionIntent(ctx: Context, action: String, code: Int): PendingIntent {
    val i = Intent(ctx, RestActionReceiver::class.java).setAction(action)
    return PendingIntent.getBroadcast(ctx, code, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  @Suppress("DEPRECATION")
  private fun builder(ctx: Context, channel: String): Notification.Builder =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(ctx, channel)
    else Notification.Builder(ctx)

  private fun ensureChannels(ctx: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val m = nm(ctx)
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
          description = "Used only when you turn on Ring through Do Not Disturb in ForgeAI"
          setSound(
            RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
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
    if (m.getNotificationChannel(CH_OVER) == null) {
      m.createNotificationChannel(
        NotificationChannel(CH_OVER, "Rest timer", NotificationManager.IMPORTANCE_HIGH).apply {
          description = "Tells you when your rest is over"
          setSound(
            RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
            AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).build(),
          )
          enableVibration(true)
          vibrationPattern = longArrayOf(0, 250, 150, 250)
          setShowBadge(false)
          lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        },
      )
    }
    if (m.getNotificationChannel(CH_OVER_OPEN) == null) {
      m.createNotificationChannel(
        NotificationChannel(CH_OVER_OPEN, "Rest is over, app open", NotificationManager.IMPORTANCE_DEFAULT).apply {
          description = "Buzzes your watch when rest ends while ForgeAI is on screen (the app rings itself)"
          setSound(null, null)
          enableVibration(true)
          vibrationPattern = longArrayOf(0, 250, 150, 250)
          setShowBadge(false)
          lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        },
      )
    }
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
      v.setTextViewText(line, if (r.next != null) " left · ${r.next}" else " left")
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
      val b = builder(ctx, CH_CARD)
        .setSmallIcon(icon)
        .setColor(COLOR)
        .setContentTitle(title(ctx, r))
        .setContentText(if (r.next != null) "Next: ${r.next}" else "Time to rest")
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
      nm(ctx).notify(CARD_ID, b.build())
    } catch (_: Exception) {
      // No permission to post: the in-app timer still works.
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
  fun overText(next: String?, lateMs: Long): String {
    val base = if (next != null) "Next: $next" else "Time for your next set"
    val mins = lateMs / 60_000L
    return if (mins >= 1L) "Ended $mins min ago · $base" else base
  }

  @Suppress("DEPRECATION")
  private fun postOver(ctx: Context, next: String?, endsAt: Long, lateMs: Long) {
    try {
      ensureChannels(ctx)
      val icon = iconRes(ctx)
      // App on screen: it rings itself, so the phone only vibrates — but the alert is still
      // posted, which is what makes the watch buzz. Otherwise this is the loud alert.
      // "Workout sounds" off: the vibrate-only channel, wherever the app is.
      val open = appOnScreen(ctx) || quiet(ctx)
      // RT-12: only when the member turned it on, and only while Do Not Disturb is on; at other
      // times the alert follows the ringer as before.
      val alarm = !open && ringThroughDnd(ctx) && dndOn(ctx)
      val channel = if (open) CH_OVER_OPEN else if (alarm) CH_OVER_ALARM else CH_OVER
      val b = builder(ctx, channel)
        .setSmallIcon(icon)
        .setColor(COLOR)
        .setContentTitle("Rest is over")
        .setContentText(overText(next, lateMs))
        .setShowWhen(true)
        .setWhen(endsAt)
        .setAutoCancel(true)
        .setOngoing(false)
        .setCategory(if (alarm) Notification.CATEGORY_ALARM else Notification.CATEGORY_REMINDER)
        .setVisibility(Notification.VISIBILITY_PUBLIC)
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
        b.setPriority(if (open) Notification.PRIORITY_DEFAULT else Notification.PRIORITY_MAX)
          .setDefaults(if (open) Notification.DEFAULT_VIBRATE else Notification.DEFAULT_ALL)
      }
      // App on screen: the watch has buzzed by the time this goes; the app shows the rest is over.
      if (open && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) b.setTimeoutAfter(60_000L)
      // No "Done" here (it stays on the rest card): with that action on this alert, Android 14
      // removed "Rest is over" seconds after posting it on a locked phone (device QA run
      // 38081757903: posted with 1 action, then gone, not by the app). The alert is back to the
      // shape every earlier phone run passed with.
      openIntent(ctx)?.let { b.setContentIntent(it) }
      val tag = "over-$endsAt"
      ctx.getSharedPreferences(PREFS_OVER, Context.MODE_PRIVATE).edit().putString("tag", tag).commit()
      nm(ctx).notify(tag, OVER_ID, b.build())
      android.util.Log.i(LOG_TAG, "Rest is over posted on $channel")
    } catch (e: Exception) {
      android.util.Log.w(LOG_TAG, "Rest is over NOT posted", e)
    }
  }
}
