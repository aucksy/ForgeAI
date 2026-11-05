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
  // Release review: "Get MettleUp" only after two empty capability answers in a row (Wear OS may not
  // have shared the phone's details yet right after Bluetooth reconnects).
  private var emptyAppChecks = 0
  /** R-269: a phone is connected but MettleUp is not on it ([PhoneApp.missing]; unknown counts as there). */
  private var phoneAppMissing by mutableStateOf(false)
  /** R-269: what "Open on phone" did last (the line under "Get MettleUp on your phone"). */
  private var phoneAppRequest by mutableStateOf(PhoneApp.Request.IDLE)
  private lateinit var heart: HeartRate
  /** Watch logging (3 Nov 2026): the logging screens' state ([LogFlow]); kept while the app runs. */
  private var logUi by mutableStateOf(LogUi())

  private val ambientObserver = AmbientLifecycleObserver(
    this,
    object : AmbientLifecycleObserver.AmbientLifecycleCallback {
      override fun onEnterAmbient(ambientDetails: AmbientLifecycleObserver.AmbientDetails) {
        ambient = true
        // R-353: the dim screen works (so the watch's always-on screen is on); rebuilds start over.
        ambientWorked = true
        rebuilds = 0
        AmbientDiag.note(this@MainActivity, "ambient-enter", AmbientDiag.state(this@MainActivity))
      }

      override fun onUpdateAmbient() {
        ambientTick = System.currentTimeMillis()
      }

      override fun onExitAmbient() {
        ambient = false
        AmbientDiag.note(this@MainActivity, "ambient-exit")
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
    // R-297: heart rate just allowed mid-workout: the health-type service may start now.
    if (hrAllowed) WorkoutLive.onScreenUp(this)
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
    // R-353: a rebuild (below, onResume) keeps the set being logged.
    keptLogUi?.let { logUi = it }
    keptLogUi = null
    AmbientDiag.note(this, "create", if (savedInstanceState != null) "restored" else "")
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
          // Ambient during a rest. R-341 (owner, 5 Nov 2026: "in the dim mode, it's not showing the real
          // counter"): the dimmed rest screen now counts down each second, like the bright one. The CPU
          // sleeps in ambient, so a short partial wake lock (only until the rest ends, at most the rest's
          // length + 5 s) keeps the one-second redraw going; after the rest it drops at once.
          // 0.60.0 review: without "Alarms & reminders" the end alarm is inexact, so the buzz also comes
          // from here on time. With exact alarms on, the alarm does it.
          val wait = endsAt + 300L - System.currentTimeMillis()
          if (wait <= 0L) {
            if (!exactAllowed) WatchState.onAlarm(this@MainActivity, endsAt)
            return@LaunchedEffect
          }
          val lock = (getSystemService(POWER_SERVICE) as PowerManager)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "mettleup:rest-end")
          lock.setReferenceCounted(false)
          lock.acquire(wait + 5_000L)
          try {
            while (true) {
              now = System.currentTimeMillis()
              if (now >= endsAt + 300L) break
              // Wake on the next whole second of the countdown, so the digits change in step.
              val toNextSecond = ((endsAt - now) % 1000L).let { if (it <= 0L) 1000L + it else it }
              delay(minOf(toNextSecond + 20L, endsAt + 300L - now))
            }
            now = System.currentTimeMillis()
            if (!exactAllowed) WatchState.onAlarm(this@MainActivity, endsAt)
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
      // Watch logging: the clock and the effort ring move while a workout is open on screen.
      val ui = logUi
      val logging = snap.logFlow && snap.workoutActive && !ambient
      LaunchedEffect(logging, ui.phase, ambientTick) {
        now = System.currentTimeMillis()
        while (logging) {
          delay(if (ui.phase == LogPhase.EFFORT) 100L else 1_000L)
          now = System.currentTimeMillis()
        }
      }
      // 3 s without a turn or a tap: the crown's change ends.
      LaunchedEffect(ui.adjust, ui.adjustAt) {
        if (ui.adjust == Adjust.NONE) return@LaunchedEffect
        delay((LogMath.ADJUST_IDLE_MS - (System.currentTimeMillis() - ui.adjustAt)).coerceAtLeast(0L) + 20L)
        logUi = LogFlow.idle(logUi, System.currentTimeMillis())
      }
      // Effort: 4 s untouched saves the set without it. Sending: no answer in 10 s is "Not saved".
      LaunchedEffect(ui.phase, ui.phaseAt) {
        when (ui.phase) {
          LogPhase.EFFORT -> {
            delay((LogMath.EFFORT_MS - (System.currentTimeMillis() - ui.phaseAt)).coerceAtLeast(0L))
            if (logUi.phase == LogPhase.EFFORT && logUi.phaseAt == ui.phaseAt) sendSet(null)
          }
          LogPhase.SENDING -> {
            delay((LogMath.CONFIRM_MS - (System.currentTimeMillis() - ui.sentAt)).coerceAtLeast(0L))
            if (logUi.phase == LogPhase.SENDING && logUi.sentAt == ui.sentAt) notSaved("no answer from the phone", keepKey = true)
          }
          else -> Unit
        }
      }
      // The phone took the set: it names the next row (or the workout closed). A late answer after "Not saved"
      // (no answer in time) still counts, so the member is not told to log a set that was saved.
      LaunchedEffect(snap.row, snap.workoutActive, ui.sentKey) {
        val waiting = logUi.phase == LogPhase.SENDING || logUi.phase == LogPhase.NOT_SAVED
        if (waiting && LogMath.confirmed(logUi.sentKey, snap.row, snap.workoutActive)) {
          LogBus.waiting = false
          logUi = LogFlow.confirmed(logUi, System.currentTimeMillis())
          now = System.currentTimeMillis()
        }
      }
      // The phone said it could not log it.
      val refusedAt = LogBus.refusedAt
      LaunchedEffect(refusedAt) {
        if (refusedAt > 0L && logUi.phase == LogPhase.SENDING && refusedAt >= logUi.sentAt) notSaved("the phone could not log it")
      }
      // "Saved" shows 2 s, then goes.
      LaunchedEffect(ui.savedAt) {
        if (ui.savedAt <= 0L) return@LaunchedEffect
        delay(LogMath.SAVED_MS + 50L)
        now = System.currentTimeMillis()
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
        log = ui,
        actions = logActions,
      )
    }
  }

  /** Watch logging: what each tap and crown turn on the logging screens does. */
  private val logActions = LogActions(
    onTapWeight = { onEntry { e, key -> logUi = LogFlow.tapWeight(logUi, e, key, System.currentTimeMillis()) } },
    onTapReps = { onEntry { e, key -> logUi = LogFlow.tapReps(logUi, e, key, System.currentTimeMillis()) } },
    onCrown = { steps -> onEntry { e, key -> logUi = LogFlow.crown(logUi, e, key, steps, System.currentTimeMillis()) } },
    onDone = ::doneTapped,
    onRpe = { v -> if (logUi.phase == LogPhase.EFFORT) sendSet(v) },
    onSkipEffort = { if (logUi.phase == LogPhase.EFFORT) sendSet(null) },
    onMinus15 = {
      WatchState.shiftRest(this, -15_000L)
      WatchActions.send(this, "sub", "", quiet = true)
    },
    onPlus15 = {
      WatchState.shiftRest(this, 15_000L)
      WatchActions.send(this, "add", "", quiet = true)
    },
    onSkipRest = {
      WatchState.skipRest(this)
      WatchActions.send(this, "skip", "", quiet = true)
    },
    onOk = { logUi = LogFlow.dismiss(logUi, System.currentTimeMillis()) },
    onGo = { logUi = LogFlow.go(logUi) },
  )

  private fun onEntry(block: (SetEntry, String) -> Unit) {
    val snap = WatchState.snapshot
    val e = snap.entry ?: return
    block(e, LogMath.setKeyOf(snap.row))
  }

  /** Done on "Next set": the effort question when the phone asks for it, else the set goes now. */
  private fun doneTapped() {
    val snap = WatchState.snapshot
    val e = snap.entry
    val key = LogMath.setKeyOf(snap.row)
    if (logUi.phase == LogPhase.SENDING || logUi.phase == LogPhase.EFFORT) return
    val w = e?.let { LogMath.weight(logUi, it, key) }
    val r = e?.let { LogMath.repsNow(logUi, it, key) }
    if (!LogMath.canLog(snap.row, e, w, r)) return
    val u = LogFlow.done(logUi, e, System.currentTimeMillis())
    logUi = u
    if (u.phase != LogPhase.EFFORT) sendSet(null)
  }

  /**
   * The set goes to the phone with the numbers shown ([LogMath.withLog]); the rest starts here at
   * once (it still runs if the phone does not answer). [rpe]: the effort picked, or null.
   */
  private fun sendSet(rpe: Double?) {
    val snap = WatchState.snapshot
    val e = snap.entry
    val key = LogMath.setKeyOf(snap.row)
    val w = e?.let { LogMath.weight(logUi, it, key) }
    val r = e?.let { LogMath.repsNow(logUi, it, key) }
    val payload = LogMath.withLog(snap.row, e, w, r, rpe)
    val card = WatchCopy.card(snap)
    val last = e != null && !e.warm && card.setCount > 0 && card.setIndex == card.setCount
    val t = System.currentTimeMillis()
    logUi = LogFlow.sent(logUi, key, t, last, snap.title, card.setCount)
    LogBus.waiting = true
    if (e != null) WatchState.startLocalRest(this, e.rest)
    WatchActions.logSet(this, payload) { ok ->
      if (!ok && logUi.phase == LogPhase.SENDING && logUi.sentAt == t) notSaved("not sent")
    }
  }

  private fun notSaved(why: String, keepKey: Boolean = false) {
    Log.w("ForgeWear", "set logged here not saved: $why")
    LogBus.waiting = false
    logUi = LogFlow.notSaved(logUi, System.currentTimeMillis(), keepKey)
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

  override fun onResume() {
    super.onResume()
    // R-297: the screen is in front now (Android lets a foreground service start only then): an open
    // workout gets WorkoutService, which keeps MettleUp up instead of the watch face to the end.
    WorkoutLive.onScreenUp(this)
    AmbientDiag.note(this, "resume", AmbientDiag.state(this))
    // R-353: last time the screen went OFF where it should have dimmed (AmbientDiag.Heal). Rebuild this
    // screen once, which registers it for the dim state again (the observer does that only in onCreate).
    if (AmbientDiag.Heal.shouldRebuild(blackoutSeen && WatchState.workoutOpen(this), rebuilds)) {
      blackoutSeen = false
      rebuilds += 1
      AmbientDiag.note(this, "rebuild", "try $rebuilds")
      AmbientDiag.push(this, force = true)
      window.decorView.post {
        if (!isFinishing && !isDestroyed) {
          keptLogUi = logUi
          recreate()
        }
      }
    } else {
      blackoutSeen = false
    }
  }

  override fun onPause() {
    AmbientDiag.note(this, "pause", if (ambient) "ambient" else "")
    super.onPause()
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    // A call screen or a system panel over MettleUp takes the focus without stopping it.
    AmbientDiag.note(this, if (hasFocus) "focus" else "focus-lost")
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    AmbientDiag.note(this, "new-intent", intent.action ?: "")
  }

  override fun onStop() {
    onScreen = false
    visible = false
    val screenOn = try {
      (getSystemService(POWER_SERVICE) as PowerManager).isInteractive
    } catch (e: Exception) {
      true
    }
    val open = WatchState.workoutOpen(this)
    if (AmbientDiag.Heal.blackout(screenOn, ambient, ambientWorked, open, isFinishing || isChangingConfigurations)) {
      blackoutSeen = true
    }
    AmbientDiag.note(
      this,
      "stop",
      "ambient=${if (ambient) 1 else 0} workout=${if (open) 1 else 0} blackout=${if (blackoutSeen) 1 else 0} " +
        AmbientDiag.state(this),
    )
    AmbientDiag.push(this)
    super.onStop()
  }

  override fun onDestroy() {
    AmbientDiag.note(this, "destroy", if (isChangingConfigurations) "rebuild" else "")
    super.onDestroy()
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
          emptyAppChecks = if (has) 0 else emptyAppChecks + 1
          val missing = emptyAppChecks >= 2 &&
            PhoneApp.missing(connected = true, hasCapability = has, seenBefore = WatchState.phoneAppSeen(this))
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

    /** R-353: the dim screen was entered at least once since the app started (always-on is on). */
    private var ambientWorked = false

    /** R-353: the last stop was the screen going off instead of dimming ([AmbientDiag.Heal.blackout]). */
    private var blackoutSeen = false

    /** R-353: rebuilds since the dim screen last worked (capped by [AmbientDiag.Heal.MAX_TRIES]). */
    private var rebuilds = 0

    /** R-353: the logging flow's state, carried across one rebuild. */
    private var keptLogUi: LogUi? = null
  }
}
