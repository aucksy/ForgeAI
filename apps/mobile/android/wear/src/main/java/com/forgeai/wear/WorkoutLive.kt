package com.forgeai.wear

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.wear.ongoing.OngoingActivity
import androidx.wear.ongoing.Status

/**
 * R-236 (31 Oct 2026, owner): "keep the screen awake while it's on, just like the native workout on
 * the Pixel Watch: when I look at the watch it brightens up, otherwise it just remains dim."
 *
 * The Pixel's own exercise screen does this with two Wear OS parts, and so does this app:
 *  1. ambient mode (MainActivity's AmbientLifecycleObserver): wrist down, the screen dims to the
 *     ambient twin of the same screen; wrist up (or a tap), it is bright again. Wear OS decides the
 *     moment, from the wrist and the watch's own timeout.
 *  2. an Ongoing Activity for the WHOLE workout (this file). Without one, Wear OS 5+ hides a dimmed
 *     app after its second timeout and shows the watch face (developer.android.com/training/wearables/
 *     always-on: "To keep an app visible during a long task, such as a workout, use an Ongoing
 *     Activity"). Before this, the only Ongoing Activity was the rest countdown, so between sets the
 *     watch fell back to the watch face. It also puts a MettleUp icon on the watch face and in
 *     Recents: one tap back.
 * Not FLAG_KEEP_SCREEN_ON: it keeps the screen bright the whole time and drains the battery, which
 * the Pixel does not do either.
 *
 * Shown while the phone says a workout is open (/forge/workout active), gone when it ends.
 */
object WorkoutLive {
  private const val TAG = "ForgeWear"
  private const val CH = "workout-live"
  const val ID = 51004

  /**
   * The longest the notice stays after the phone's last word about the workout. Every set the phone
   * logs posts it again (and restarts this clock); 4 hours of silence means the phone died, was reset
   * or lost MettleUp and "ended" will never come.
   */
  const val CAP_MS = 4L * 60 * 60 * 1000

  /** True while the phone's last workout message ([at], epoch ms) is under [CAP_MS] old. PURE. */
  fun fresh(at: Long, now: Long): Boolean = at > 0L && now - at in 0L until CAP_MS

  /** Show or remove the workout's Ongoing Activity to match [active]. Safe to call again. */
  fun sync(ctx: Context, active: Boolean) {
    val app = ctx.applicationContext
    if (active) show(app) else cancel(app)
  }

  private fun nm(ctx: Context) = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  private fun show(ctx: Context) {
    try {
      val m = nm(ctx)
      if (m.getNotificationChannel(CH) == null) {
        m.createNotificationChannel(
          NotificationChannel(CH, "Workout in progress", NotificationManager.IMPORTANCE_LOW).apply {
            description = "Keeps MettleUp on your watch while you work out. Tap it to go back to the app."
            setSound(null, null)
            enableVibration(false)
            setShowBadge(false)
          },
        )
      }
      val open = PendingIntent.getActivity(
        ctx,
        4,
        Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
      val accent = BrandColour.accentFor(ctx.getSharedPreferences("forgeai_watch", Context.MODE_PRIVATE).getString("accent", ""))
      val b = NotificationCompat.Builder(ctx, CH)
        .setSmallIcon(R.drawable.ic_stat_forge)
        .setColor(accent ?: RestAlerts.EMBER)
        .setContentTitle("Workout in progress")
        .setContentText("Tap to open MettleUp")
        .setCategory(NotificationCompat.CATEGORY_WORKOUT)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setSilent(true)
        .setContentIntent(open)
        .setTimeoutAfter(CAP_MS)
      OngoingActivity.Builder(ctx, ID, b)
        .setStaticIcon(R.drawable.ic_stat_forge)
        .setTouchIntent(open)
        .setStatus(Status.Builder().addTemplate("Workout").build())
        .build()
        .apply(ctx)
      m.notify(ID, b.build())
    } catch (e: Exception) {
      // Notifications refused: the app still dims and brightens while it is open, it just may
      // fall back to the watch face after Wear OS's timeout.
      Log.w(TAG, "workout Ongoing Activity not shown", e)
    }
  }

  private fun cancel(ctx: Context) {
    try {
      nm(ctx).cancel(ID)
    } catch (e: Exception) {
      Log.w(TAG, "workout Ongoing Activity not removed", e)
    }
  }
}
