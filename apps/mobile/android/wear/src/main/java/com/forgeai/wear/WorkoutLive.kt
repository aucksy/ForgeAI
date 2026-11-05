package com.forgeai.wear

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
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
 * Shown while the phone says a workout is open (/forge/workout active), gone when it ends. R-297: while
 * MettleUp's screen has been up during the workout, the notice is held by [WorkoutService] ([KeepAlive]).
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

  /**
   * UAT 1 Nov 2026: is the saved workout still open for the SCREEN? The same cap as the notice: a
   * phone that was reset or lost MettleUp mid-workout never sends "ended", and the watch showed that
   * old set for good. [at] = 0: saved by a watch app older than 0.63.0, taken as open. PURE.
   */
  fun openOnScreen(active: Boolean, at: Long, now: Long): Boolean = active && (at == 0L || fresh(at, now))

  /**
   * R-297 (3 Nov 2026, owner): with the watch's "Always-on screen" OFF the watch still went back to the
   * watch face mid-workout. A posted notification alone does not make MettleUp a running workout to
   * Wear OS: Google's documented shape for a workout app is the Ongoing Activity posted BY A FOREGROUND
   * SERVICE of type health for the whole workout (Health Services "App structure"; the Ongoing
   * Activity guide's own sample calls startForeground). [WorkoutService] is that service. It holds no
   * wake lock, no sensor and no timer: the cost is a process kept alive while a workout is open.
   *
   * How the workout is held up, decided from state alone. PURE (JVM-tested in WorkoutLiveTest).
   */
  object KeepAlive {
    enum class Mode {
      /** No open workout: notice and service go. */
      OFF,

      /** The notice only (as before R-297); a service already running is left alone. */
      NOTICE,

      /** The notice, posted by [WorkoutService] in the foreground. */
      SERVICE,
    }

    /** Android 14 (API 34): a health-type foreground service needs a body-sensor permission granted. */
    const val HEALTH_TYPE_SDK = 34

    /**
     * [inFront]: MettleUp's screen is up (Android lets an app start a foreground service only then).
     * [heartAllowed]: heart rate was allowed (BODY_SENSORS / health.READ_HEART_RATE), which the health
     * service type needs from Android 14; refused, the notice alone stays.
     */
    fun mode(open: Boolean, inFront: Boolean, sdk: Int, heartAllowed: Boolean): Mode = when {
      !open -> Mode.OFF
      inFront && (sdk < HEALTH_TYPE_SDK || heartAllowed) -> Mode.SERVICE
      else -> Mode.NOTICE
    }

    /** How long the service waits before checking the workout again: what is left of [CAP_MS]. PURE. */
    fun recheckIn(at: Long, now: Long): Long =
      if (!WorkoutLive.fresh(at, now)) 0L else WorkoutLive.CAP_MS - (now - at)
  }

  /** Show or remove the workout's Ongoing Activity to match [active]. Safe to call again. */
  fun sync(ctx: Context, active: Boolean) {
    val app = ctx.applicationContext
    if (!active) {
      WorkoutService.stop(app)
      cancel(app)
      return
    }
    show(app)
    if (KeepAlive.mode(true, MainActivity.visible, Build.VERSION.SDK_INT, heartAllowed(app)) == KeepAlive.Mode.SERVICE) {
      WorkoutService.start(app)
    }
  }

  /** R-297: MettleUp's screen just came to the front: a workout still open gets its foreground service. */
  fun onScreenUp(ctx: Context) {
    val app = ctx.applicationContext
    val mode = KeepAlive.mode(WatchState.workoutOpen(app), true, Build.VERSION.SDK_INT, heartAllowed(app))
    // R-353: post the workout's Ongoing Activity again too. Another app (a call) may have been the
    // ongoing task in between, and Wear OS keeps a dimmed app up only with its Ongoing Activity.
    if (mode != KeepAlive.Mode.OFF) show(app)
    if (mode == KeepAlive.Mode.SERVICE) WorkoutService.start(app)
  }

  /** The permission the health service type needs on Android 14+ (MainActivity asks for it). */
  fun heartAllowed(ctx: Context): Boolean {
    val perms = mutableListOf(Manifest.permission.BODY_SENSORS)
    if (Build.VERSION.SDK_INT >= 36) perms.add("android.permission.health.READ_HEART_RATE")
    return perms.any { ContextCompat.checkSelfPermission(ctx, it) == PackageManager.PERMISSION_GRANTED }
  }

  private fun nm(ctx: Context) = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  private fun show(ctx: Context) {
    val n = build(ctx) ?: return
    try {
      // Also updates the foreground service's notice (same id) when it runs.
      nm(ctx).notify(ID, n)
    } catch (e: Exception) {
      Log.w(TAG, "workout Ongoing Activity not shown", e)
    }
  }

  /** The workout's notice with its Ongoing Activity applied (null if it could not be made). */
  fun build(ctx: Context): Notification? {
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
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setContentIntent(open)
        .setTimeoutAfter(CAP_MS)
      OngoingActivity.Builder(ctx, ID, b)
        .setStaticIcon(R.drawable.ic_stat_forge)
        .setTouchIntent(open)
        .setStatus(Status.Builder().addTemplate("Workout").build())
        .build()
        .apply(ctx)
      return b.build()
    } catch (e: Exception) {
      // Notifications refused: the app still dims and brightens while it is open, it just may
      // fall back to the watch face after Wear OS's timeout.
      Log.w(TAG, "workout Ongoing Activity not made", e)
      return null
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
