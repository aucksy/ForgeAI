package com.forgeai.wear

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationManager
import android.content.Intent
import android.content.pm.PackageManager
import android.database.ContentObserver
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.provider.Settings
import android.util.Log
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.WindowManager
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

  /**
   * R-455: the one-time tip "Tap a number, then turn the dial": how often the member started changing a number
   * (a pill tapped or the dial turned, [LogMath.isUse]) and on how many exercises the tip showed; kept in prefs.
   */
  private var dialUses by mutableIntStateOf(0)
  private var tipShown by mutableIntStateOf(0)
  private var tipTitle = ""

  /** R-455: when the screen last woke from dim (uptime ms; 0 = not yet): the waking dial turn changes nothing. */
  private var wokeAt = 0L

  /**
   * R-442: the app keeps the screen on and dims it itself ([SelfDim]: workout open, Always-on display off,
   * Battery Saver off, MettleUp in front).
   */
  private var selfDimOn by mutableStateOf(false)

  /** R-442: dimmed by the app itself (the same dim screens as the watch's own dim state). */
  private var selfDim by mutableStateOf(false)

  /** R-442: the last tap, crown turn, button or wrist raise (the dim wait starts from it). */
  private var inputAt by mutableLongStateOf(0L)

  /**
   * Battery guard: why the screen is let go although the workout would have it held ("idle": no input for
   * [SelfDim.IDLE_RELEASE_MS]; "paused": the phone's workout timer is paused); null = not let go.
   */
  private var released: String? = null

  /** R-442: the tap that woke the dimmed screen is eaten to its end (it never presses a button). */
  private var swallowTouch = false
  private val wrist = SelfDim.Wrist()
  private var accel: SensorEventListener? = null
  private var aodObserver: ContentObserver? = null

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
        wokeAt = SystemClock.uptimeMillis()
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
    dialUses = prefs().getInt(KEY_DIAL_USES, 0)
    tipShown = prefs().getInt(KEY_TIP_SHOWN, 0)
    AmbientDiag.note(this, "create", if (savedInstanceState != null) "restored" else "")
    // Watch update ready (10 Nov 2026): the phone reads this app's version from the Data Layer.
    WatchVersion.publish(this, "start")
    heart = HeartRate(this, { bpm = it }, { hrStatus = it })
    setContent {
      val snap = WatchState.snapshot
      // R-442: dimmed by the watch (ambient) or by the app itself (Always-on display off): drawn the same.
      val dimmed = ambient || selfDim
      // R-442: is the app to keep the screen on and dim it itself? Checked when the screen or the workout
      // changes, then every few seconds while a workout is up (it may end by the phone's silence alone).
      // Battery guard: a pause on the phone lets the screen go; the workout resumed holds it again (a fresh
      // start for the idle wait: the member was busy on the phone).
      val paused = WatchCopy.paused(snap.text)
      LaunchedEffect(onScreen, snap.workoutActive, paused) {
        if (!paused && released == "paused") {
          inputAt = System.currentTimeMillis()
          refreshSelfDim("resume")
        } else {
          refreshSelfDim("state")
        }
        while (onScreen && (snap.workoutActive || selfDimOn)) {
          delay(SelfDim.RECHECK_MS)
          refreshSelfDim("check")
        }
      }
      // R-442: the watch's own screen timeout without a touch: dim (instead of the screen going black).
      LaunchedEffect(selfDimOn, selfDim, inputAt) {
        if (!selfDimOn || selfDim) return@LaunchedEffect
        delay(SelfDim.idleLeft(System.currentTimeMillis(), inputAt, SelfDim.timeoutMs(this@MainActivity)))
        dimNow("timeout")
      }
      // R-442: while the app dims itself, the clock moves once a minute (as the watch's dim state redraws).
      LaunchedEffect(selfDim) {
        while (selfDim) {
          delay(60_050L - System.currentTimeMillis() % 60_000L)
          ambientTick = System.currentTimeMillis()
        }
      }
      // Not in ambient: the dimmed screen shows no live bpm, so the sensor rests too (battery; 0.60.0 review).
      val measure = onScreen && !dimmed && hrAllowed && (snap.workoutActive || snap.rest != null)
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
      LaunchedEffect(onScreen, dimmed) {
        if (!onScreen || dimmed) return@LaunchedEffect
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
      LaunchedEffect(endsAt, overAt, ambient, selfDim, ambientTick, exactAllowed) {
        now = System.currentTimeMillis()
        if (endsAt == null) {
          // "Rest is over" counts up (live only; ambient redraws once a minute, and so does R-442's own dim).
          var counting = overAt > 0L && !ambient && !selfDim
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
          // R-442: dimmed by the app itself (screen kept on, so no wake lock): one redraw a second, in step.
          delay(if (selfDim && now < endsAt) SelfDim.toNextSecond(endsAt, now) + 20L else 200L)
        }
      }
      // Watch logging: the clock and the effort ring move while a workout is open on screen.
      val ui = logUi
      val logging = snap.logFlow && snap.workoutActive && !dimmed
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
      // R-455: the tip counts each exercise whose first set it showed on (after [LogMath.TIP_EXERCISES], "Previous" stays).
      val tipOn = LogMath.tipOn(dialUses, tipShown)
      val firstOfExercise = logging && snap.entry != null && LogMath.firstSet(snap.next.set)
      LaunchedEffect(tipOn, firstOfExercise, snap.title) {
        if (tipOn && firstOfExercise && snap.title.isNotBlank() && snap.title != tipTitle) {
          tipTitle = snap.title
          tipShown += 1
          prefs().edit().putInt(KEY_TIP_SHOWN, tipShown).apply()
        }
      }
      WatchScreen(
        snap,
        bpm,
        hrStatus,
        hrAllowed,
        dimmed,
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
        dialTip = tipOn,
      )
    }
  }

  /** Watch logging: what each tap and crown turn on the logging screens does. */
  private val logActions = LogActions(
    onTapWeight = { onEntry { e, key -> setLog(LogFlow.tapWeight(logUi, e, key, System.currentTimeMillis())) } },
    onTapReps = { onEntry { e, key -> setLog(LogFlow.tapReps(logUi, e, key, System.currentTimeMillis())) } },
    onCrown = { steps ->
      // R-455: the turn that woke the dim screen only wakes it (the dial now changes the reps with nothing tapped).
      if (!LogMath.wakeTurn(wokeAt, SystemClock.uptimeMillis())) {
        onEntry { e, key -> setLog(LogFlow.crown(logUi, e, key, steps, System.currentTimeMillis())) }
      }
    },
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

  /** R-455: the new log state; a pill tapped or the dial's first turn counts toward retiring the tip. */
  private fun setLog(after: LogUi) {
    if (dialUses < LogMath.TIP_USES && LogMath.isUse(logUi, after)) {
      dialUses += 1
      prefs().edit().putInt(KEY_DIAL_USES, dialUses).apply()
    }
    logUi = after
  }

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
    // Battery guard: coming on screen (the watch's own wake, tilt-to-wake or a tap, after a let-go screen)
    // is a fresh look: the idle wait starts here, before anything checks it.
    inputAt = System.currentTimeMillis()
    onScreen = true
    visible = true
    // The app is open: a "Workout started" card has done its job.
    WorkoutStarted.cancel(this)
    watchAodSetting(true)
  }

  override fun onResume() {
    super.onResume()
    // R-297: the screen is in front now (Android lets a foreground service start only then): an open
    // workout gets WorkoutService, which keeps MettleUp up instead of the watch face to the end.
    WorkoutLive.onScreenUp(this)
    AmbientDiag.note(this, "resume", AmbientDiag.state(this))
    // R-442: back in front: bright, and the app dims itself again if Always-on display is off.
    inputAt = System.currentTimeMillis()
    refreshSelfDim("resume")
    // R-353: last time the screen went OFF where it should have dimmed (AmbientDiag.Heal). Rebuild this
    // screen once, which registers it for the dim state again (the observer does that only in onCreate).
    // R-437: each new workout gets its own tries.
    rebuilds = AmbientDiag.Heal.triesFor(rebuildsWorkout, AmbientDiag.workoutCount, rebuilds)
    rebuildsWorkout = AmbientDiag.workoutCount
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
    // R-437: Battery Saver (or Always-on off) is the watch's own reason for a black screen: named in the
    // diary, and with Battery Saver no rebuild (it cannot bring the dim screen back).
    val cause = if (!screenOn && !ambient && open) AmbientDiag.watchCause(this) else ""
    if (AmbientDiag.Heal.blackout(screenOn, ambient, ambientWorked, open, isFinishing || isChangingConfigurations, saverOn = cause == "battery-saver")) {
      blackoutSeen = true
    }
    // R-557: held= says whether the app was keeping the screen on itself at this moment (written before the
    // let-go below).
    AmbientDiag.note(this, "stop", AmbientDiag.stopDetail(ambient, open, blackoutSeen, selfDimOn, cause) + AmbientDiag.state(this))
    AmbientDiag.push(this)
    // R-442: a black screen where it should have dimmed, on a watch whose Always-on setting cannot be read:
    // from the next wake of this workout the app dims itself.
    if (!screenOn && !ambient && open && !isFinishing && !isChangingConfigurations && cause != "battery-saver" &&
      SelfDim.aodOn(this) == null
    ) {
      blackedWorkout = AmbientDiag.workoutCount
    }
    // R-442: out of sight: the screen is the watch's again (a forced screen-off, e.g. a palm over it, shows as
    // "self-dim-off stop screen=0" in the diary).
    watchAodSetting(false)
    refreshSelfDim("stop")
    if (selfDim) brighten("stop")
    super.onStop()
  }

  // ---- R-442: the app's own dim screen (SelfDim) ----

  /** Turns the app's own dimming on or off to match the workout, the screen and the watch's settings. */
  private fun refreshSelfDim(why: String) {
    val open = WatchState.workoutOpen(this)
    val aod = SelfDim.aodOn(this)
    val saver = SelfDim.saverOn(this)
    val blacked = blackedWorkout >= 0 && blackedWorkout == AmbientDiag.workoutCount
    // Read from the saved state, not the snapshot: on opening, the snapshot is still the old one, and a
    // paused workout was held for half a second (cloud watch check D-paused, run 42803353941).
    val pausedNow = WatchCopy.paused(WatchState.setLine(this))
    val mode = SelfDim.wanted(workoutOpen = open, onScreen = onScreen, aodOn = aod, saverOn = saver, blackedOut = blacked)
    // Battery guard: held only while someone uses the watch and the workout is not paused on the phone.
    val rel = if (mode) {
      SelfDim.releaseWhy(now = System.currentTimeMillis(), inputAt = inputAt, paused = pausedNow, idleMs = idleReleaseMs())
    } else {
      null
    }
    val want = mode && rel == null
    // R-557: every wake says whether the screen is held and every input that decided it. Before, the early
    // return below wrote nothing when nothing changed, so a diary of wakes could not say why nothing was held.
    if (why == "resume") {
      AmbientDiag.note(this, "self-dim-why", "$why " + SelfDim.inputs(want, open, onScreen, aod, saver, blacked, pausedNow, rel == "idle"))
    }
    // A new reason to let go is written in the diary even when the screen was not held (a workout that came
    // up already paused shows "self-dim-off paused", so a black screen there is explained).
    val newlyReleased = rel != null && rel != released
    released = rel
    if (want == selfDimOn && !newlyReleased) return
    if (want != selfDimOn) {
      selfDimOn = want
      try {
        if (want) {
          window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
          inputAt = System.currentTimeMillis()
          startWrist()
        } else {
          // The workout ended, was paused or nobody used the watch for 12 minutes (or Always-on came back):
          // the screen is let go. Left dimmed, the watch's own timeout now turns it off; a touch makes it
          // bright first (and, after "idle", holds it again).
          window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
          stopWrist()
        }
      } catch (e: Exception) {
        Log.w("ForgeWear", "self dim not switched", e)
      }
    }
    AmbientDiag.note(this, if (want) "self-dim-on" else "self-dim-off", "${rel ?: why} ${AmbientDiag.state(this)}")
  }

  /**
   * Battery guard: the idle wait ([SelfDim.IDLE_RELEASE_MS]); the cloud watch check shortens it with the QA key,
   * which counts only on a test build of the watch's system (never on a member's watch).
   */
  private fun idleReleaseMs(): Long {
    val qa = try {
      prefs().getLong(SelfDim.QA_IDLE_KEY, 0L)
    } catch (e: Exception) {
      0L
    }
    return SelfDim.idleReleaseMs(qa, testOs = Build.TYPE != "user")
  }

  /**
   * A tap, crown turn, button or wrist raise: the dim wait and the idle wait start over. After an "idle"
   * let-go the screen is held again ([why] names the input in the diary's self-dim-on line).
   */
  private fun input(why: String) {
    inputAt = System.currentTimeMillis()
    if (released == "idle") refreshSelfDim(why)
  }

  /** Dims the screen (the app's own dim state): lowest brightness, the dim screens. */
  private fun dimNow(why: String) {
    if (!selfDimOn || selfDim || ambient) return
    selfDim = true
    setBrightness(SelfDim.DIM_BRIGHTNESS)
    AmbientDiag.note(this, "self-dim-enter", why)
  }

  /** Bright again (a tap, the crown, a wrist raise), and the dim wait starts over. */
  private fun brighten(why: String) {
    input(why)
    if (!selfDim) return
    selfDim = false
    wokeAt = SystemClock.uptimeMillis()
    setBrightness(WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE)
    AmbientDiag.note(this, "self-dim-exit", why)
  }

  private fun setBrightness(v: Float) {
    try {
      val lp = window.attributes
      lp.screenBrightness = v
      window.attributes = lp
    } catch (e: Exception) {
      Log.w("ForgeWear", "brightness not set", e)
    }
  }

  /** The wrist, while the app dims itself: down dims, a raise toward the eyes brightens. */
  private fun startWrist() {
    if (accel != null) return
    val sm = getSystemService(SENSOR_SERVICE) as? SensorManager ?: return
    val sensor = sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) ?: return
    wrist.reset()
    val l = object : SensorEventListener {
      override fun onSensorChanged(e: SensorEvent) {
        if (e.values.size < 3) return
        when (wrist.feed(e.values[2], SystemClock.elapsedRealtime())) {
          // A raise is an input: bright again when dimmed; the idle wait starts over either way.
          SelfDim.Wrist.Move.RAISED -> if (selfDim) brighten("wrist-up") else input("wrist-up")
          SelfDim.Wrist.Move.LOWERED ->
            if (System.currentTimeMillis() - inputAt > SelfDim.QUIET_AFTER_INPUT_MS) dimNow("wrist-down")
          SelfDim.Wrist.Move.NONE -> Unit
        }
      }

      override fun onAccuracyChanged(s: Sensor?, accuracy: Int) = Unit
    }
    try {
      if (sm.registerListener(l, sensor, SelfDim.SENSOR_PERIOD_US)) accel = l
    } catch (e: Exception) {
      Log.w("ForgeWear", "wrist sensor not started", e)
    }
  }

  private fun stopWrist() {
    val l = accel ?: return
    accel = null
    try {
      (getSystemService(SENSOR_SERVICE) as SensorManager).unregisterListener(l)
    } catch (e: Exception) {
      Log.w("ForgeWear", "wrist sensor not stopped", e)
    }
  }

  /** Always-on display switched while MettleUp is up: the watch's dim state or the app's own takes over at once. */
  private fun watchAodSetting(on: Boolean) {
    try {
      if (on && aodObserver == null) {
        val o = object : ContentObserver(Handler(Looper.getMainLooper())) {
          override fun onChange(selfChange: Boolean) {
            refreshSelfDim("setting")
          }
        }
        contentResolver.registerContentObserver(Settings.Global.getUriFor("ambient_enabled"), false, o)
        contentResolver.registerContentObserver(Settings.Secure.getUriFor("doze_always_on"), false, o)
        aodObserver = o
      } else if (!on) {
        aodObserver?.let { contentResolver.unregisterContentObserver(it) }
        aodObserver = null
      }
    } catch (e: Exception) {
      Log.w("ForgeWear", "always-on setting not watched", e)
    }
  }

  override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
    // R-442: the first touch on the app's own dim screen only makes it bright (never a button press).
    if (selfDim || swallowTouch) {
      when (ev.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          swallowTouch = true
          brighten("touch")
        }
        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> swallowTouch = false
      }
      return true
    }
    // Battery guard: a touch also holds a let-go ("idle") screen again.
    if ((selfDimOn || released != null) && ev.actionMasked == MotionEvent.ACTION_DOWN) input("touch")
    return super.dispatchTouchEvent(ev)
  }

  override fun dispatchGenericMotionEvent(ev: MotionEvent): Boolean {
    // R-442: a crown turn on the dim screen makes it bright (and changes nothing); otherwise it restarts the wait.
    if (selfDim) {
      brighten("crown")
      return true
    }
    if (selfDimOn || released != null) input("crown")
    return super.dispatchGenericMotionEvent(ev)
  }

  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    if (selfDim || selfDimOn || released != null) brighten("key")
    return super.dispatchKeyEvent(event)
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

    /** R-455: the dial tip's counters ([LogMath.tipOn]). */
    private const val KEY_DIAL_USES = "dialUses"
    private const val KEY_TIP_SHOWN = "dialTipShown"
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

    /** R-437: [AmbientDiag.workoutCount] when [rebuilds] was last kept (a new workout starts it over). */
    private var rebuildsWorkout = 0

    /** R-353: the logging flow's state, carried across one rebuild. */
    private var keptLogUi: LogUi? = null

    /**
     * R-442: [AmbientDiag.workoutCount] of the workout that had a black screen while the Always-on setting could
     * not be read (-1 = none): the app dims itself for the rest of that workout.
     */
    private var blackedWorkout = -1
  }
}
