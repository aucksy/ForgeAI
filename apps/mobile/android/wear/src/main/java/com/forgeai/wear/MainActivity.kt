package com.forgeai.wear

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.wear.ambient.AmbientLifecycleObserver
import kotlinx.coroutines.delay

/**
 * The watch screen (WatchScreens.kt). Resting: a big countdown inside an ember ring with the next
 * set. A workout open and no rest: heart rate and the set. Nothing open: how to start. Heart rate
 * is measured only while this screen is visible and a workout is open.
 *
 * R-166 (28 Oct 2026): ambient mode. With the watch's always-on screen, the app stays on screen
 * when the watch dims (grey, no ticking: the rest's end time instead of the countdown), so one
 * glance in a set still shows the set and last time's numbers.
 */
class MainActivity : ComponentActivity() {
  private var onScreen by mutableStateOf(false)
  private var bpm by mutableStateOf<Double?>(null)
  private var hrStatus by mutableStateOf(HeartRate.Status.WAITING)
  private var hrAllowed by mutableStateOf(false)
  private var notifAllowed by mutableStateOf(true)
  private var ambient by mutableStateOf(false)
  /** Bumped once a minute in ambient (the screen redraws then). */
  private var ambientTick by mutableLongStateOf(0L)
  private lateinit var heart: HeartRate

  private val ambientObserver = AmbientLifecycleObserver(
    this,
    object : AmbientLifecycleObserver.AmbientLifecycleCallback {
      override fun onEnterAmbient(ambientDetails: AmbientLifecycleObserver.AmbientDetails) {
        ambient = true
      }

      override fun onUpdateAmbient() {
        ambientTick = System.currentTimeMillis()
      }

      override fun onExitAmbient() {
        ambient = false
      }
    },
  )

  private val ask = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
    hrAllowed = hasHeartPermission()
    if (!hrAllowed) {
      // Refused for good (no more dialogs): the next tap opens the app's settings instead.
      val again = heartPermissions().any { shouldShowRequestPermissionRationale(it) }
      if (!again) prefs().edit().putBoolean("hrBlocked", true).apply()
    } else {
      prefs().edit().putBoolean("hrBlocked", false).apply()
    }
    afterNotificationChange()
  }

  private val askNotif = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
    if (!granted && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      !shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS)
    ) {
      prefs().edit().putBoolean("notifBlocked", true).apply()
    }
    afterNotificationChange()
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    lifecycle.addObserver(ambientObserver)
    heart = HeartRate(this, { bpm = it }, { hrStatus = it })
    setContent {
      val snap = WatchState.snapshot
      // Not in ambient: the dimmed screen shows no live bpm, so the sensor rests too (battery; 0.60.0 review).
      val measure = onScreen && !ambient && hrAllowed && (snap.workoutActive || snap.rest != null)
      DisposableEffect(measure) {
        if (measure) heart.start()
        onDispose {
          heart.stop()
          bpm = null
        }
      }
      var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
      val endsAt = snap.rest?.endsAt
      LaunchedEffect(endsAt, ambient, ambientTick, exactAllowed) {
        now = System.currentTimeMillis()
        if (endsAt == null) return@LaunchedEffect
        if (ambient) {
          // Ambient: no ticking (the screen shows the rest's end time; it redraws once a minute).
          // 0.60.0 review: without "Alarms & reminders" the end alarm is inexact and the wrist is
          // usually down (ambient) when a rest ends, so wait here under a short partial wake lock and
          // buzz on time. With exact alarms on, the alarm does it.
          if (exactAllowed) return@LaunchedEffect
          val wait = endsAt + 300L - System.currentTimeMillis()
          if (wait <= 0L) {
            WatchState.onAlarm(this@MainActivity, endsAt)
            return@LaunchedEffect
          }
          val lock = (getSystemService(POWER_SERVICE) as PowerManager)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "mettleup:rest-end")
          lock.setReferenceCounted(false)
          lock.acquire(wait + 5_000L)
          try {
            delay(wait)
            WatchState.onAlarm(this@MainActivity, endsAt)
          } finally {
            if (lock.isHeld) lock.release()
          }
          return@LaunchedEffect
        }
        while (true) {
          now = System.currentTimeMillis()
          // R-167 (Play: no USE_EXACT_ALARM): with "Alarms & reminders" off the end alarm can come
          // late; while this screen is up the buzz comes on time from here (onAlarm runs once).
          if (now >= endsAt + 300L) WatchState.onAlarm(this@MainActivity, endsAt)
          delay(200L)
        }
      }
      WatchScreen(
        snap,
        bpm,
        hrStatus,
        hrAllowed,
        notifAllowed,
        ambient,
        now,
        onAllow = ::allowHeartRate,
        onAllowNotif = ::allowNotifications,
        onComplete = { WatchActions.complete(this, snap.done) },
        exactAllowed = exactAllowed,
        onAllowExact = ::allowExactAlarms,
      )
    }
  }

  override fun onStart() {
    super.onStart()
    WatchState.load(this)
    WatchSync.refresh(this)
    hrAllowed = hasHeartPermission()
    afterNotificationChange()
    if (!prefs().getBoolean("asked", false)) {
      // First open: heart rate, and (Wear OS 4+) notifications for "Rest is over".
      prefs().edit().putBoolean("asked", true).apply()
      val notif = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) listOf(Manifest.permission.POST_NOTIFICATIONS) else emptyList()
      requestAll(heartPermissions() + notif)
    }
    onScreen = true
  }

  override fun onStop() {
    onScreen = false
    super.onStop()
  }

  private fun prefs() = getSharedPreferences("forgeai_watch_ui", MODE_PRIVATE)

  /** Wear OS 6 (Android 16) names the heart-rate permission health.READ_HEART_RATE. */
  private fun heartPermissions(): List<String> {
    val list = mutableListOf(Manifest.permission.BODY_SENSORS)
    if (Build.VERSION.SDK_INT >= 36) list.add(READ_HEART_RATE)
    return list
  }

  private fun hasHeartPermission(): Boolean =
    heartPermissions().any { checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED }

  private fun requestAll(perms: List<String>) {
    try {
      ask.launch(perms.toTypedArray())
    } catch (e: Exception) {
      Log.w("ForgeWear", "permission request failed", e)
    }
  }

  private fun allowHeartRate() {
    if (!prefs().getBoolean("hrBlocked", false)) {
      requestAll(heartPermissions())
      return
    }
    try {
      startActivity(
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      )
    } catch (e: Exception) {
      Log.w("ForgeWear", "app settings did not open", e)
      requestAll(heartPermissions())
    }
  }

  private fun notificationsOn(): Boolean = try {
    (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).areNotificationsEnabled()
  } catch (e: Exception) {
    Log.w("ForgeWear", "notification state unknown", e)
    true
  }

  /** The screen's line, and Wear OS bridging (kept up to date after an app update). */
  private fun afterNotificationChange() {
    notifAllowed = notificationsOn()
    exactAllowed = exactAlarmsOn()
    Bridging.sync(this)
  }

  /** R-167: "Alarms & reminders" (SCHEDULE_EXACT_ALARM; off by default on Wear OS 5+ installs). */
  private var exactAllowed by mutableStateOf(true)

  private fun exactAlarmsOn(): Boolean = try {
    Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
      (getSystemService(ALARM_SERVICE) as AlarmManager).canScheduleExactAlarms()
  } catch (e: Exception) {
    Log.w("ForgeWear", "exact alarm state unknown", e)
    true
  }

  /** Opens this app's "Alarms & reminders" switch (the rest's buzz on the second). */
  private fun allowExactAlarms() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
    try {
      startActivity(
        Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:$packageName"))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      )
    } catch (e: Exception) {
      Log.w("ForgeWear", "alarm settings did not open", e)
      try {
        startActivity(
          Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
      } catch (e2: Exception) {
        Log.w("ForgeWear", "app settings did not open", e2)
      }
    }
  }

  private fun allowNotifications() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !prefs().getBoolean("notifBlocked", false)) {
      try {
        askNotif.launch(Manifest.permission.POST_NOTIFICATIONS)
        return
      } catch (e: Exception) {
        Log.w("ForgeWear", "notification request failed", e)
      }
    }
    try {
      startActivity(
        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
          .putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      )
    } catch (e: Exception) {
      Log.w("ForgeWear", "notification settings did not open", e)
    }
  }

  private companion object {
    const val READ_HEART_RATE = "android.permission.health.READ_HEART_RATE"
  }
}

