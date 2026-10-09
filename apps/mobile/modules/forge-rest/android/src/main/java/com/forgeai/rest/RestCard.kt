package com.forgeai.rest

import android.app.ActivityManager
import android.app.AlarmManager
import android.app.KeyguardManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.text.format.DateFormat
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
 */
object RestCard {
  const val CARD_ID = 41001
  const val OVER_ID = 41002
  const val CH_CARD = "rest-card"
  const val CH_OVER = "rest-timer" // the same loud channel the app has used since v0.22
  const val CH_OVER_OPEN = "rest-over-open"
  const val ACTION_ADD = "com.forgeai.rest.ADD15"
  const val ACTION_SKIP = "com.forgeai.rest.SKIP"
  const val ACTION_END = "com.forgeai.rest.END"
  const val EXTRA_ENDS = "endsAt"
  const val EXTRA_OPEN = "forgeai_open_workout"
  const val ADD_SEC = 15

  private const val PREFS = "forgeai_rest_card"
  private const val PREFS_QUIET = "forgeai_rest_quiet"
  private const val COLOR = 0xFFFF7A3B.toInt()
  /** An end that fires this much early (an inexact alarm never does) is re-armed instead. */
  private const val EARLY_MS = 1500L

  data class Rest(val startedAt: Long, val endsAt: Long, val next: String?)

  /** Set by the module while JS is alive: (kind, endsAt, startedAt). */
  @Volatile var listener: ((String, Long, Long) -> Unit)? = null

  private val handler = Handler(Looper.getMainLooper())
  private var fastPath: Runnable? = null

  // ------------------------------------------------------------------ state
  @Synchronized
  fun load(ctx: Context): Rest? {
    val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val ends = p.getLong("endsAt", 0L)
    if (ends <= 0L) return null
    // A rest whose end passed long ago lost its alarm (the app was force-stopped): forget it.
    if (ends < System.currentTimeMillis() - 60_000L) {
      p.edit().clear().apply()
      return null
    }
    return Rest(p.getLong("startedAt", ends), ends, p.getString("next", null))
  }

  private fun save(ctx: Context, r: Rest) {
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putLong("startedAt", r.startedAt)
      .putLong("endsAt", r.endsAt)
      .putString("next", r.next)
      .apply()
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

  private fun forget(ctx: Context) {
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
  }

  // ------------------------------------------------------------------ actions
  /** A rest started or changed in the app. */
  @Synchronized
  fun show(ctx: Context, startedAt: Long, endsAt: Long, next: String?) {
    val r = Rest(startedAt, endsAt, next)
    save(ctx, r)
    nm(ctx).cancel(OVER_ID) // an old "Rest is over" goes when the next rest starts
    post(ctx, r)
    arm(ctx, endsAt)
  }

  /** "+15 s" on the card (phone shade or watch). Returns the new rest, or null if none runs. */
  @Synchronized
  fun add(ctx: Context): Rest? {
    val cur = load(ctx) ?: return null
    val now = System.currentTimeMillis()
    if (cur.endsAt <= now) return null
    val r = cur.copy(endsAt = cur.endsAt + ADD_SEC * 1000L)
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
    if (dismissOver) nm(ctx).cancel(OVER_ID)
  }

  /** The alarm (or the in-process timer) for [expected] went off. */
  @Synchronized
  fun fireEnd(ctx: Context, expected: Long) {
    val cur = load(ctx) ?: return
    if (cur.endsAt != expected) return // moved or skipped meanwhile
    val now = System.currentTimeMillis()
    if (now < expected - EARLY_MS) {
      arm(ctx, expected)
      return
    }
    forget(ctx)
    disarm(ctx)
    nm(ctx).cancel(CARD_ID)
    postOver(ctx, cur.next)
    listener?.invoke("end", 0L, 0L)
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
    // it (the "Alarms & reminders" permission); otherwise Android may run it a little late.
    try {
      val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      val pi = endIntent(app, endsAt)
      val exact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()
      if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endsAt, pi)
      else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endsAt, pi)
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
      m.createNotificationChannel(
        NotificationChannel(CH_CARD, "Rest timer card", NotificationManager.IMPORTANCE_LOW).apply {
          description = "Shows your rest on the phone and on your watch, with +15 s and Skip"
          setSound(null, null)
          enableVibration(false)
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
        .setShowWhen(true)
        .setWhen(r.endsAt)
        .setUsesChronometer(true)
        .setVisibility(Notification.VISIBILITY_PUBLIC)
        .addAction(Notification.Action.Builder(Icon.createWithResource(ctx, icon), "+15 s", actionIntent(ctx, ACTION_ADD, 4)).build())
        .addAction(Notification.Action.Builder(Icon.createWithResource(ctx, icon), "Skip", actionIntent(ctx, ACTION_SKIP, 5)).build())
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) b.setChronometerCountDown(true)
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

  @Suppress("DEPRECATION")
  private fun postOver(ctx: Context, next: String?) {
    try {
      ensureChannels(ctx)
      // App on screen: it rings itself, so the phone only vibrates — but the alert is still
      // posted, which is what makes the watch buzz. Otherwise this is the loud alert.
      // "Workout sounds" off: the vibrate-only channel, wherever the app is.
      val open = appOnScreen(ctx) || quiet(ctx)
      val b = builder(ctx, if (open) CH_OVER_OPEN else CH_OVER)
        .setSmallIcon(iconRes(ctx))
        .setColor(COLOR)
        .setContentTitle("Rest is over")
        .setContentText(if (next != null) "Next up: $next" else "Time for your next set")
        .setAutoCancel(true)
        .setOngoing(false)
        .setCategory(Notification.CATEGORY_REMINDER)
        .setVisibility(Notification.VISIBILITY_PUBLIC)
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
        b.setPriority(if (open) Notification.PRIORITY_DEFAULT else Notification.PRIORITY_MAX)
          .setDefaults(if (open) Notification.DEFAULT_VIBRATE else Notification.DEFAULT_ALL)
      }
      // App on screen: the watch has buzzed by the time this goes; the app shows the rest is over.
      if (open && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) b.setTimeoutAfter(60_000L)
      openIntent(ctx)?.let { b.setContentIntent(it) }
      nm(ctx).notify(OVER_ID, b.build())
    } catch (_: Exception) {
      // ignore
    }
  }
}
