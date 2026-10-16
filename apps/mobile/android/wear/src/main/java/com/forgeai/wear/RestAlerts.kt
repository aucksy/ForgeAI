package com.forgeai.wear

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.os.Build
import android.os.PowerManager
import android.os.SystemClock
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.wear.ongoing.OngoingActivity
import androidx.wear.ongoing.Status

/**
 * The watch's side of a rest:
 *  - [restStarted]: an exact alarm at the end (an ALARM CLOCK alarm, the one kind Android fires on
 *    the second in Doze and never rate-limits, as the phone does) and an Ongoing Activity with a
 *    countdown, so the rest shows on the watch face and in Recents; tapping opens the app;
 *  - [restCleared]: both go;
 *  - [restOver]: a strong ~1.5 s buzz of the watch's own (alarm usage, so it is not muted while
 *    the phone is in use, unlike a bridged phone alert) and a "Rest is over" card.
 */
object RestAlerts {
  private const val TAG = "ForgeWear"
  private const val CH_LIVE = "rest-live"
  private const val CH_OVER = "rest-over"
  const val LIVE_ID = 51001
  const val OVER_ID = 51002
  const val ACTION_END = "com.forgeai.wear.REST_END"
  const val EXTRA_ENDS = "endsAt"

  /** "Rest is over" removes itself after this long. */
  private const val OVER_TIMEOUT_MS = 120_000L

  /** Strong, clear, ~1.5 s: three long pulses. */
  private val WAVE_MS = longArrayOf(0L, 400L, 150L, 400L, 150L, 400L)
  private val WAVE_AMP = intArrayOf(0, 255, 0, 255, 0, 255)

  private fun nm(ctx: Context) = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  private fun ensureChannels(ctx: Context) {
    val m = nm(ctx)
    if (m.getNotificationChannel(CH_LIVE) == null) {
      m.createNotificationChannel(
        NotificationChannel(CH_LIVE, "Rest countdown", NotificationManager.IMPORTANCE_LOW).apply {
          description = "Your rest, counting down"
          setSound(null, null)
          enableVibration(false)
          setShowBadge(false)
        },
      )
    }
    if (m.getNotificationChannel(CH_OVER) == null) {
      // No sound or vibration on the channel itself: [buzz] is the one buzz (no double pulse).
      m.createNotificationChannel(
        NotificationChannel(CH_OVER, "Rest is over", NotificationManager.IMPORTANCE_HIGH).apply {
          description = "Tells you when your rest is over"
          setSound(null, null)
          enableVibration(false)
          setShowBadge(false)
        },
      )
    }
  }

  private fun openIntent(ctx: Context): PendingIntent {
    val i = Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    return PendingIntent.getActivity(ctx, 1, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  private fun endIntent(ctx: Context, endsAt: Long): PendingIntent {
    val i = Intent(ctx, RestAlarmReceiver::class.java).setAction(ACTION_END).putExtra(EXTRA_ENDS, endsAt)
    return PendingIntent.getBroadcast(ctx, 2, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  // ------------------------------------------------------------------ the rest's life
  fun restStarted(ctx: Context, r: WatchState.Rest) {
    cancel(ctx, OVER_ID) // an old "Rest is over" goes when the next rest starts
    arm(ctx, r.endsAt)
    showLive(ctx, r)
  }

  fun restCleared(ctx: Context) {
    disarm(ctx)
    cancel(ctx, LIVE_ID)
  }

  fun restOver(ctx: Context, r: WatchState.Rest) {
    disarm(ctx)
    cancel(ctx, LIVE_ID)
    buzz(ctx)
    postOver(ctx, r)
  }

  // ------------------------------------------------------------------ alarm
  fun arm(ctx: Context, endsAt: Long) {
    val app = ctx.applicationContext
    val am = app.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val pi = endIntent(app, endsAt)
    val exact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()
    if (exact) {
      try {
        am.setAlarmClock(AlarmManager.AlarmClockInfo(endsAt, openIntent(app)), pi)
        return
      } catch (e: SecurityException) {
        Log.w(TAG, "alarm clock refused, trying a plain exact alarm", e)
      }
      try {
        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endsAt, pi)
        return
      } catch (e: SecurityException) {
        Log.w(TAG, "exact alarm refused, using an inexact one", e)
      }
    }
    try {
      am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endsAt, pi)
    } catch (e: Exception) {
      Log.w(TAG, "no rest alarm could be set", e)
    }
  }

  private fun disarm(ctx: Context) {
    try {
      val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      am.cancel(endIntent(ctx.applicationContext, 0L))
    } catch (e: Exception) {
      Log.w(TAG, "rest alarm not cancelled", e)
    }
  }

  // ------------------------------------------------------------------ countdown (Ongoing Activity)
  private fun showLive(ctx: Context, r: WatchState.Rest) {
    try {
      ensureChannels(ctx)
      val open = openIntent(ctx)
      val nextLine = RestText.nextLine(r.next)
      val b = NotificationCompat.Builder(ctx, CH_LIVE)
        .setSmallIcon(R.drawable.ic_stat_forge)
        .setColor(EMBER)
        .setContentTitle("Rest")
        .setContentText(nextLine ?: "Resting")
        .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setSilent(true)
        .setShowWhen(true)
        .setWhen(r.endsAt)
        .setUsesChronometer(true)
        .setChronometerCountDown(true)
        .setContentIntent(open)
        .setTimeoutAfter(maxOf(1_000L, r.endsAt - System.currentTimeMillis()) + 60_000L)
      // The watch face / Recents chip: "Rest 1:23", counting down to the end.
      val zero = SystemClock.elapsedRealtime() + (r.endsAt - System.currentTimeMillis())
      val status = Status.Builder()
        .addTemplate("Rest #time#")
        // A TimerPart counts DOWN to zero (a StopwatchPart counts up).
        .addPart("time", Status.TimerPart(zero))
        .build()
      OngoingActivity.Builder(ctx, LIVE_ID, b)
        .setStaticIcon(R.drawable.ic_stat_forge)
        .setTouchIntent(open)
        .setStatus(status)
        .build()
        .apply(ctx)
      nm(ctx).notify(LIVE_ID, b.build())
    } catch (e: Exception) {
      Log.w(TAG, "rest countdown not shown", e)
    }
  }

  // ------------------------------------------------------------------ the end
  private fun buzz(ctx: Context) {
    try {
      // Keep the watch awake for the buzz (the alarm's own wake lock ends with the receiver).
      val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
      pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ForgeAI:restOver").acquire(3_000L)
    } catch (e: Exception) {
      Log.w(TAG, "no wake lock for the buzz", e)
    }
    try {
      val v: Vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        (ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
      } else {
        @Suppress("DEPRECATION")
        ctx.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
      }
      val effect = VibrationEffect.createWaveform(WAVE_MS, WAVE_AMP, -1)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        v.vibrate(effect, VibrationAttributes.createForUsage(VibrationAttributes.USAGE_ALARM))
      } else {
        @Suppress("DEPRECATION")
        v.vibrate(effect, AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build())
      }
    } catch (e: Exception) {
      Log.w(TAG, "rest-over buzz failed", e)
    }
  }

  private fun postOver(ctx: Context, r: WatchState.Rest) {
    try {
      ensureChannels(ctx)
      val b = NotificationCompat.Builder(ctx, CH_OVER)
        .setSmallIcon(R.drawable.ic_stat_forge)
        .setColor(EMBER)
        .setContentTitle("Rest is over")
        .setContentText(RestText.nextLine(r.next) ?: "Time for your next set")
        .setCategory(NotificationCompat.CATEGORY_ALARM)
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setAutoCancel(true)
        .setShowWhen(true)
        .setWhen(r.endsAt)
        .setContentIntent(openIntent(ctx))
        .setTimeoutAfter(OVER_TIMEOUT_MS)
      nm(ctx).notify(OVER_ID, b.build())
    } catch (e: Exception) {
      // Notifications refused: the buzz above still happened.
      Log.w(TAG, "Rest is over not posted", e)
    }
  }

  private fun cancel(ctx: Context, id: Int) {
    try {
      nm(ctx).cancel(id)
    } catch (e: Exception) {
      Log.w(TAG, "notification $id not cancelled", e)
    }
  }

  /** ForgeAI's ember orange. */
  const val EMBER = 0xFFF26B2A.toInt()
}
