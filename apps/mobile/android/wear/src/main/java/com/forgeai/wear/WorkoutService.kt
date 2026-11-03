package com.forgeai.wear

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.ServiceCompat

/**
 * R-297 (3 Nov 2026, owner): "during a workout the watch must never go back to the watch face; like
 * the Pixel Watch's own workouts it goes dim and lights up when I look", also with the watch's
 * "Always-on screen" off.
 *
 * A foreground service of type health that runs only while the phone has a workout open, and posts
 * the workout's Ongoing Activity ([WorkoutLive.build], same id) as its foreground notice. This is the
 * shape Google documents for a workout app on Wear OS: the Ongoing Activity keeps the app visible
 * instead of the watch face ("Prevent returning to the watch face", always-on guide), and Health
 * Services' "App structure" puts it in a foreground service for the whole workout because the screen
 * may turn off and the activity stop. It does nothing else: no wake lock, no sensor, no timer, so the
 * watch sleeps as normal; only the process is kept.
 *
 * Started only while MettleUp's screen is up ([WorkoutLive.KeepAlive]: Android refuses a foreground
 * service started from the background) with startService, so a refused start never crashes the app
 * (no startForegroundService promise to keep). Stopped by [WorkoutLive.sync] when the workout ends,
 * or by itself when the phone has said nothing about it for [WorkoutLive.CAP_MS].
 */
class WorkoutService : Service() {
  private val main = Handler(Looper.getMainLooper())

  /** The phone went silent for WorkoutLive.CAP_MS: it died, was reset or lost MettleUp; end it here. */
  private val capCheck = object : Runnable {
    override fun run() {
      val wait = WorkoutLive.KeepAlive.recheckIn(WatchState.workoutAt(this@WorkoutService), System.currentTimeMillis())
      if (wait > 0L && WatchState.workoutOpen(this@WorkoutService)) {
        main.postDelayed(this, wait)
      } else {
        Log.i(TAG, "workout over or silent: foreground service stops")
        WorkoutLive.sync(this@WorkoutService, false)
      }
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (!WatchState.workoutOpen(this)) {
      stopSelf()
      return START_NOT_STICKY
    }
    val n = WorkoutLive.build(this)
    if (n == null) {
      stopSelf()
      return START_NOT_STICKY
    }
    try {
      val type = if (Build.VERSION.SDK_INT >= WorkoutLive.KeepAlive.HEALTH_TYPE_SDK) ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH else 0
      ServiceCompat.startForeground(this, WorkoutLive.ID, n, type)
      running = true
    } catch (e: Exception) {
      // Heart rate refused (the health type needs it on Android 14+) or a background start refused:
      // the plain notice WorkoutLive posted stays, as before R-297.
      Log.w(TAG, "workout foreground service refused", e)
      running = false
      stopSelf()
      return START_NOT_STICKY
    }
    main.removeCallbacks(capCheck)
    main.postDelayed(capCheck, maxOf(1_000L, WorkoutLive.KeepAlive.recheckIn(WatchState.workoutAt(this), System.currentTimeMillis())))
    // Not restarted after the system kills it: that restart would be a background start, which fails.
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    main.removeCallbacks(capCheck)
    if (running) {
      running = false
      // DETACH, not REMOVE: a workout still open keeps its notice (and watch-face icon) without the
      // service; WorkoutLive.sync(false) cancels it when the workout really ends.
      try {
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_DETACH)
      } catch (e: Exception) {
        Log.w(TAG, "workout foreground service not detached", e)
      }
    }
    super.onDestroy()
  }

  companion object {
    private const val TAG = "ForgeWear"

    /** The service holds the workout's notice in the foreground now. */
    @Volatile
    var running = false
      private set

    fun start(ctx: Context) {
      try {
        ctx.applicationContext.startService(Intent(ctx.applicationContext, WorkoutService::class.java))
      } catch (e: Exception) {
        // IllegalStateException: the app is in the background. The notice alone stays.
        Log.w(TAG, "workout foreground service not started", e)
      }
    }

    fun stop(ctx: Context) {
      try {
        ctx.applicationContext.stopService(Intent(ctx.applicationContext, WorkoutService::class.java))
      } catch (e: Exception) {
        Log.w(TAG, "workout foreground service not stopped", e)
      }
    }
  }
}
