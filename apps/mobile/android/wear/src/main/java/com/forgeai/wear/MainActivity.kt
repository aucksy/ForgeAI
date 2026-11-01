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
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.wear.ambient.AmbientLifecycleObserver
import androidx.wear.remote.interactions.RemoteActivityHelper
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.delay

/**
 * The watch screen (WatchScreens.kt). R-207 (29 Oct 2026): the designer's "Ring" screens, chosen
 * from state alone ([ScreenSelector]): two first-launch permission screens (the only taps), phone
 * not connected, nothing open, rest timer, rest is over, between rests. Glance-only: the screen has
 * no "Complete set" any more. Heart rate is measured only while this screen is visible, not dimmed,
 * and a workout is open.
 *
 * R-166 (28 Oct 2026): ambient mode. With the watch's always-on screen the app stays on screen when
 * the watch dims (the ambient twin of each screen, redrawn about once a minute).
 */
class MainActivity : ComponentActivity() {
  private var onScreen by mutableStateOf(false)
  private var bpm by mutableStateOf<Double?>(null)
  private var hrStatus by mutableStateOf(HeartRate.Status.WAITING)
  private var hrAllowed by mutableStateOf(false)
  private var ambient by mutableStateOf(false)
  /** Bumped once a minute in ambient (the screen redraws then). */
  private var ambientTick by mutableLongStateOf(0L)
  /** R-207: the first-launch screens still to show (heart rate "1 of 2", rest alerts "2 of 2"). */
  private var askHeartRate by mutableStateOf(false)
  private var askAlerts by mutableStateOf(false)
  /** UAT 1 Nov 2026: "Rest alerts" has only the Alarms & reminders step left (notifications done). */
  private var alertsAlarmOnly by mutableStateOf(false)
  /** R-207: "Phone not connected" (two empty checks in a row; unknown counts as connected). */
  private var phoneConnected by mutableStateOf(true)
  private var emptyChecks by mutableIntStateOf(0)
  /** R-269: a phone is connected but MettleUp is not on it ([PhoneApp.missing]; unknown counts as there). */
  private var phoneAppMissing by mutableStateOf(false)
  /** R-269: what "Open on phone" did last (the line under "Get MettleUp on your phone"). */
  private var phoneAppRequest by mutableStateOf(PhoneApp.Request.IDLE)
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
      // Refused for good (no more dialogs): the next Allow opens the app's settings instead.
      val again = heartPermissions().any { shouldShowRequestPermissionRationale(it) }
      if (!again) prefs().edit().putBoolean("hrBlocked", true).apply()
    } else {
      prefs().edit().putBoolean("hrBlocked", false).apply()
    }
    answered(KEY_ASKED_HR)
    afterNotificationChange()
  }

  private val askNotif = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
    if (!granted && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      !shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS)
    ) {
      prefs().edit().putBoolean("notifBlocked", true).apply()
    }
    answered(KEY_ASKED_NOTIF)
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
      // R-207: is the phone there? Checked while the screen is up and not dimmed.
      // UAT 1 Nov 2026: after one empty answer the second check comes in 3 s, not 15 s, so a watch
      // with no phone says "Phone not connected" quickly instead of "Start a workout on your phone".
      LaunchedEffect(onScreen, ambient) {
        if (!onScreen || ambient) return@LaunchedEffect
        var lastCheck = 0L
        while (true) {
          val t = System.currentTimeMillis()
          if (t - lastCheck >= PHONE_CHECK_MS || emptyChecks == 1) {
            lastCheck = t
            checkPhone()
          }
          delay(PHONE_RECHECK_MS)
        }
      }
      var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
      // R-269: "Workout saved" shows for WorkoutSaved.SHOW_MS, then the screen moves on by itself.
      val savedAt = snap.savedAt
      LaunchedEffect(savedAt) {
        now = System.currentTimeMillis()
        val left = WorkoutSaved.left(savedAt, now)
        if (left > 0L) {
          delay(left + 50L)
          now = System.currentTimeMillis()
        }
      }
      val endsAt = snap.rest?.endsAt
      val overAt = snap.overAt
      LaunchedEffect(endsAt, overAt, ambient, ambientTick, exactAllowed) {
        now = System.currentTimeMillis()
        if (endsAt == null) {
          // "Rest is over" counts up (live only; ambient redraws once a minute).
          var counting = overAt > 0L && !ambient
          while (counting) {
            delay(250L)
            now = System.currentTimeMillis()
            counting = WatchState.snapshot.overAt > 0L
          }
          return@LaunchedEffect
        }
        if (ambient) {
          // Ambient: no ticking (the screen redraws once a minute).
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
        ambient,
        now,
        askHeartRate = askHeartRate,
        askAlerts = askAlerts,
        alertsAlarmOnly = alertsAlarmOnly,
        phoneConnected = phoneConnected,
        onAllowHeartRate = ::allowHeartRate,
        onSkipHeartRate = { answered(KEY_ASKED_HR) },
        onAllowAlerts = ::allowNotifications,
        onSkipAlerts = ::skipAlerts,
        phoneAppMissing = phoneAppMissing,
        phoneAppRequest = phoneAppRequest,
        onGetPhoneApp = ::openPlayStoreOnPhone,
      )
    }
  }

  override fun onStart() {
    super.onStart()
    WatchState.load(this)
    WatchSync.refresh(this)
    hrAllowed = hasHeartPermission()
    afterNotificationChange()
    onScreen = true
    visible = true
    // The app is open: a "Workout started" card has done its job.
    WorkoutStarted.cancel(this)
  }

  override fun onStop() {
    onScreen = false
    visible = false
    super.onStop()
  }

  private fun prefs() = getSharedPreferences("forgeai_watch_ui", MODE_PRIVATE)

  /**
   * R-207: whether a first-launch screen was answered (Allow or Not now). The old app asked both at
   * once on first open (pref "asked"): those watches count as asked for both.
   */
  private fun asked(key: String): Boolean = prefs().getBoolean(key, false) || prefs().getBoolean("asked", false)

  private fun answered(key: String) {
    prefs().edit().putBoolean(key, true).apply()
    refreshAsks()
  }

  /** Which first-launch screens still show: never for a permission already on. */
  private fun refreshAsks() {
    askHeartRate = !hasHeartPermission() && !asked(KEY_ASKED_HR)
    val notif = needNotifAsk()
    askAlerts = notif || needExactAsk()
    alertsAlarmOnly = !notif && askAlerts
  }

  private fun needNotifAsk(): Boolean =
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !notificationsOn() && !asked(KEY_ASKED_NOTIF)

  /**
   * 0.61.0 review: "Alarms & reminders" is off on new Wear OS 5+ installs, and without it the end-of-rest
   * buzz can come late with the screen off. The "Rest alerts" screen asks for it too, once, under its own
   * key (the old "asked" pref does not cover it, so watches updated from 0.60 are asked once as well).
   */
  private fun needExactAsk(): Boolean = !exactAllowed && !prefs().getBoolean(KEY_ASKED_EXACT, false)

  private fun skipAlerts() {
    prefs().edit().putBoolean(KEY_ASKED_NOTIF, true).putBoolean(KEY_ASKED_EXACT, true).apply()
    refreshAsks()
  }

  /** Opens this app's "Alarms & reminders" switch (the rest's buzz on the second). */
  private fun allowExactAlarms() {
    answered(KEY_ASKED_EXACT)
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

  /** One check of the phone link; "not connected" only after two empty answers in a row. */
  private fun checkPhone() {
    try {
      Wearable.getNodeClient(this).connectedNodes
        .addOnSuccessListener { nodes ->
          if (nodes.isEmpty()) {
            emptyChecks += 1
            if (emptyChecks >= 2) phoneConnected = false
          } else {
            emptyChecks = 0
            phoneConnected = true
            checkPhoneApp()
          }
        }
        .addOnFailureListener { e -> Log.w("ForgeWear", "phone check failed", e) }
    } catch (e: Exception) {
      Log.w("ForgeWear", "phone check failed", e)
    }
  }

  /**
   * R-269: does the connected phone have MettleUp? Its app declares the capability
   * [PhoneApp.CAPABILITY]; a phone that already sent a workout counts as having it (older phone apps
   * declare nothing). A failed lookup changes nothing.
   */
  private fun checkPhoneApp() {
    try {
      Wearable.getCapabilityClient(this).getCapability(PhoneApp.CAPABILITY, CapabilityClient.FILTER_REACHABLE)
        .addOnSuccessListener { info ->
          val has = info.nodes.isNotEmpty()
          if (has) WatchState.markPhoneAppSeen(this)
          val missing = PhoneApp.missing(connected = true, hasCapability = has, seenBefore = WatchState.phoneAppSeen(this))
          if (!missing) phoneAppRequest = PhoneApp.Request.IDLE
          phoneAppMissing = missing
        }
        .addOnFailureListener { e -> Log.w("ForgeWear", "phone app check failed", e) }
    } catch (e: Exception) {
      Log.w("ForgeWear", "phone app check failed", e)
    }
  }

  /**
   * R-269: "Open on phone" on "Get MettleUp on your phone": the phone's Play Store opens on MettleUp
   * (the watch app has the phone app's package name). The mirror of the phone's installOnWatch.
   */
  private fun openPlayStoreOnPhone() {
    val intent = Intent(Intent.ACTION_VIEW)
      .addCategory(Intent.CATEGORY_BROWSABLE)
      .setData(Uri.parse(PhoneApp.playStoreUri(packageName)))
    try {
      val f = RemoteActivityHelper(this).startRemoteActivity(intent)
      f.addListener({
        phoneAppRequest = try {
          f.get()
          Log.i("ForgeWear", "phone Play Store opened on MettleUp")
          PhoneApp.Request.SENT
        } catch (e: Exception) {
          Log.w("ForgeWear", "phone did not open its Play Store", e)
          PhoneApp.Request.FAILED
        }
      }, mainExecutor)
    } catch (e: Exception) {
      Log.w("ForgeWear", "phone Play Store request not sent", e)
      phoneAppRequest = PhoneApp.Request.FAILED
    }
  }

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
      answered(KEY_ASKED_HR)
    }
  }

  private fun allowHeartRate() {
    if (!prefs().getBoolean("hrBlocked", false)) {
      requestAll(heartPermissions())
      return
    }
    answered(KEY_ASKED_HR)
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

  /** The first-launch screens, the alarm state, and Wear OS bridging (kept up to date after an app update). */
  private fun afterNotificationChange() {
    exactAllowed = exactAlarmsOn()
    refreshAsks()
    Bridging.sync(this)
  }

  /**
   * R-167: "Alarms & reminders" (SCHEDULE_EXACT_ALARM; off by default on Wear OS 5+ installs). Asked on
   * the "Rest alerts" screen ([needExactAsk]); without it the screen itself buzzes on time while it is up
   * (the wake-lock wait above).
   */
  private var exactAllowed by mutableStateOf(true)

  private fun exactAlarmsOn(): Boolean = try {
    Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
      (getSystemService(ALARM_SERVICE) as AlarmManager).canScheduleExactAlarms()
  } catch (e: Exception) {
    Log.w("ForgeWear", "exact alarm state unknown", e)
    true
  }

  private fun allowNotifications() {
    if (!needNotifAsk()) {
      allowExactAlarms()
      return
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !prefs().getBoolean("notifBlocked", false)) {
      try {
        askNotif.launch(Manifest.permission.POST_NOTIFICATIONS)
        return
      } catch (e: Exception) {
        Log.w("ForgeWear", "notification request failed", e)
      }
    }
    answered(KEY_ASKED_NOTIF)
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

  companion object {
    private const val READ_HEART_RATE = "android.permission.health.READ_HEART_RATE"
    private const val KEY_ASKED_HR = "askedHr"
    private const val KEY_ASKED_NOTIF = "askedNotif"
    private const val KEY_ASKED_EXACT = "askedExact"
    private const val PHONE_CHECK_MS = 15_000L
    private const val PHONE_RECHECK_MS = 3_000L

    /** The screen is up (between onStart and onStop): [WorkoutStarted] then posts no card. */
    @Volatile
    var visible = false
      private set
  }
}
