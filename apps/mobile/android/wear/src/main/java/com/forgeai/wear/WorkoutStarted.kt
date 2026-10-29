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
import androidx.wear.ongoing.OngoingActivity
import androidx.wear.ongoing.Status

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
 * "Workout started" card with an Ongoing Activity (an icon on the watch face): one tap opens the app.
 * The card goes when the app opens, a rest starts, the workout ends, or after [TIMEOUT_MS].
 *
 * Only on the START of a workout: the phone sends the message only then, and each workout (its start
 * time) is handled once here, also if the message comes twice ([Rule]).
 */
object WorkoutStarted {
  private const val TAG = "ForgeWear"
  private const val PREFS = "forgeai_watch_open"
  private const val CH = "workout-started"
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
      p.edit().putLong("handled", startedAt).commit()
    }
    if (MainActivity.visible) return
    try {
      app.startActivity(openIntent(app))
    } catch (e: Exception) {
      Log.w(TAG, "watch app not opened from the background", e)
    }
    main.postDelayed({
      if (MainActivity.visible) {
        Log.i(TAG, "watch app opened for the workout")
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
      if (m.getNotificationChannel(CH) == null) {
        m.createNotificationChannel(
          NotificationChannel(CH, "Workout started", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "When you start a workout on your phone, one tap opens MettleUp here"
            setSound(null, null)
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
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setAutoCancel(true)
        .setContentIntent(open)
        .setTimeoutAfter(TIMEOUT_MS)
      // The watch face / Recents icon: one tap opens the app.
      OngoingActivity.Builder(ctx, ID, b)
        .setStaticIcon(R.drawable.ic_stat_forge)
        .setTouchIntent(open)
        .setStatus(Status.Builder().addTemplate("Workout started").build())
        .build()
        .apply(ctx)
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
