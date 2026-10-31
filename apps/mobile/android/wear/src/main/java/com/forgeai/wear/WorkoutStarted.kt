package com.forgeai.wear

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat

/**
 * "Watch opens when a workout starts" (29 Oct 2026). When the member starts a workout on the phone
 * (and "Open MettleUp on my watch" is on there), the phone does two things (WearSync.openWatch):
 *  1. asks Wear OS to open this app (RemoteActivityHelper: the system opens the screen, which an app
 *     in the background may not do itself);
 *  2. sends the message /forge/open {the workout's start time} here, for when 1 did not work (the
 *     watch was locked, off the wrist, or Wear OS refused).
 *
 * On the message: try to open the screen from here too (Android 10+ usually refuses a start from the
 * background: it is only logged), then, if the screen is still not up after [CHECK_MS], post a
 * "Workout started" card that pops up over the watch face with one buzz (R-237): one tap opens the app.
 * R-237 also: the phone's first "a workout is open" message ([onWorkoutBegan]) does the same, for when
 * /forge/open was lost.
 * The card goes when the app opens, a rest starts, the workout ends, or after [TIMEOUT_MS].
 *
 * Only on the START of a workout: the phone sends the message only then, and each workout (its start
 * time) is handled once here, also if the message comes twice ([Rule]).
 */
object WorkoutStarted {
  private const val TAG = "ForgeWear"
  private const val PREFS = "forgeai_watch_open"
  private const val CH = "workout-started-popup"
  private const val OLD_CH = "workout-started"
  const val ID = 51003

  /** How long the opened screen has to come up before the card is posted. */
  private const val CHECK_MS = 4_000L

  /** The card removes itself after this long. */
  private const val TIMEOUT_MS = 30L * 60_000L

  private val main = Handler(Looper.getMainLooper())

  /** Pure: which /forge/open messages are acted on (JVM-tested in WorkoutStartedTest). */
  object Rule {
    /** A message this far from the watch's clock (a late delivery, a wrong clock) is ignored. */
    const val MAX_AGE_MS = 10L * 60_000L

    /** The workout's start time in the message (plain digits), or 0 for anything else. */
    fun parse(data: ByteArray?): Long {
      if (data == null || data.isEmpty() || data.size > 32) return 0L
      return String(data, Charsets.UTF_8).trim().toLongOrNull()?.takeIf { it > 0L } ?: 0L
    }

    /** Act on a workout that started at [startedAt]? Not twice for one workout, not when stale. */
    fun shouldOpen(lastHandled: Long, startedAt: Long, now: Long): Boolean {
      if (startedAt <= 0L || startedAt == lastHandled) return false
      return kotlin.math.abs(now - startedAt) <= MAX_AGE_MS
    }
  }

  /** The phone's /forge/open message. */
  fun onRequest(ctx: Context, data: ByteArray?) {
    val app = ctx.applicationContext
    val startedAt = Rule.parse(data)
    val p = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    synchronized(this) {
      if (!Rule.shouldOpen(p.getLong("handled", 0L), startedAt, System.currentTimeMillis())) {
        Log.i(TAG, "open request for $startedAt ignored")
        return
      }
      val now = System.currentTimeMillis()
      // The backup ([onWorkoutBegan]) may have acted on this workout first: Wear OS does not keep the
      // two messages in order. Then only note it, no second open or card.
      val done = kotlin.math.abs(now - p.getLong("handledAt", 0L)) <= Rule.MAX_AGE_MS
      p.edit().putLong("handled", startedAt).putLong("handledAt", now).commit()
      if (done) return
    }
    open(app)
  }

  /**
   * R-237 (31 Oct 2026): the phone said a workout is open and the watch had none: open the app (or pop
   * the card up) as for /forge/open. Not when /forge/open was handled under [Rule.MAX_AGE_MS] ago.
   */
  fun onWorkoutBegan(ctx: Context) {
    val app = ctx.applicationContext
    val p = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val now = System.currentTimeMillis()
    synchronized(this) {
      if (kotlin.math.abs(now - p.getLong("handledAt", 0L)) <= Rule.MAX_AGE_MS) return
      p.edit().putLong("handledAt", now).commit()
    }
    open(app)
  }

  private fun open(app: Context) {
    if (MainActivity.visible) return
    try {
      app.startActivity(openIntent(app))
    } catch (e: Exception) {
      Log.w(TAG, "watch app not opened from the background", e)
    }
    main.postDelayed({
      if (MainActivity.visible) {
        Log.i(TAG, "watch app opened for the workout")
      } else if (WatchState.rest(app) != null) {
        Log.i(TAG, "a rest runs: its own card opens the app")
      } else {
        Log.i(TAG, "watch app did not open: posting Workout started")
        post(app)
      }
    }, CHECK_MS)
  }

  private fun openIntent(ctx: Context): Intent =
    Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)

  private fun nm(ctx: Context) = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  private fun post(ctx: Context) {
    try {
      val m = nm(ctx)
      // R-237 (31 Oct 2026): the old channel ("workout-started", default importance, silent) only put
      // the card at the bottom of the list: the owner never saw it. A channel's importance cannot change
      // once made, so a new one: high importance (it pops up over the watch face and lights the screen)
      // with one buzz. The old channel is deleted.
      m.deleteNotificationChannel(OLD_CH)
      if (m.getNotificationChannel(CH) == null) {
        m.createNotificationChannel(
          NotificationChannel(CH, "Workout started", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Pops up when you start a workout on your phone. Tap it to open MettleUp."
            setSound(null, null)
            enableVibration(true)
            vibrationPattern = longArrayOf(0L, 250L)
            setShowBadge(false)
          },
        )
      }
      val open = PendingIntent.getActivity(ctx, 3, openIntent(ctx), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      val accent = BrandColour.accentFor(ctx.getSharedPreferences("forgeai_watch", Context.MODE_PRIVATE).getString("accent", ""))
      val b = NotificationCompat.Builder(ctx, CH)
        .setSmallIcon(R.drawable.ic_stat_forge)
        .setColor(accent ?: RestAlerts.EMBER)
        .setContentTitle("Workout started")
        .setContentText("Tap to open MettleUp")
        .setCategory(NotificationCompat.CATEGORY_WORKOUT)
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setOnlyAlertOnce(true)
        .setAutoCancel(true)
        .setContentIntent(open)
        .setTimeoutAfter(TIMEOUT_MS)
      // R-237: no Ongoing Activity here any more: it makes the card "ongoing", and Wear OS never pops
      // an ongoing card up. The watch-face icon for the whole workout is WorkoutLive's.
      m.notify(ID, b.build())
    } catch (e: Exception) {
      // Notifications refused (or no channel): nothing else to show.
      Log.w(TAG, "Workout started not posted", e)
    }
  }

  /** The app opened, a rest started or the workout ended: the card has done its job. */
  fun cancel(ctx: Context) {
    try {
      nm(ctx.applicationContext).cancel(ID)
    } catch (e: Exception) {
      Log.w(TAG, "Workout started not removed", e)
    }
  }
}
