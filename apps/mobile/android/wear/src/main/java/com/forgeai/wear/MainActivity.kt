package com.forgeai.wear

import android.Manifest
import android.app.NotificationManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.CompactChip
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.TimeText
import kotlinx.coroutines.delay

private val Ember = Color(0xFFF26B2A)
private val Track = Color(0xFF2A2420)
private val Muted = Color(0xFFB8AFA8)

/**
 * The watch screen. Resting: a big countdown inside an ember ring. A workout open and no rest:
 * live heart rate. Nothing open: how to start. Heart rate is measured only while this screen is
 * visible and a workout is open.
 */
class MainActivity : ComponentActivity() {
  private var onScreen by mutableStateOf(false)
  private var bpm by mutableStateOf<Double?>(null)
  private var hrStatus by mutableStateOf(HeartRate.Status.WAITING)
  private var hrAllowed by mutableStateOf(false)
  private var notifAllowed by mutableStateOf(true)
  private lateinit var heart: HeartRate

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
    heart = HeartRate(this, { bpm = it }, { hrStatus = it })
    setContent {
      val snap = WatchState.snapshot
      val measure = onScreen && hrAllowed && (snap.workoutActive || snap.rest != null)
      DisposableEffect(measure) {
        if (measure) heart.start()
        onDispose {
          heart.stop()
          bpm = null
        }
      }
      ForgeWatch(snap, bpm, hrStatus, hrAllowed, notifAllowed, onAllow = ::allowHeartRate, onAllowNotif = ::allowNotifications)
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

  /** The screen's line, and Wear OS bridging (the phone's "Rest is over" only while ours can show). */
  private fun afterNotificationChange() {
    notifAllowed = notificationsOn()
    Bridging.sync(this)
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

@Composable
private fun ForgeWatch(
  snap: WatchState.Snapshot,
  bpm: Double?,
  hrStatus: HeartRate.Status,
  hrAllowed: Boolean,
  notifAllowed: Boolean,
  onAllow: () -> Unit,
  onAllowNotif: () -> Unit,
) {
  Scaffold(
    modifier = Modifier.fillMaxSize().background(Color.Black),
    timeText = { TimeText() },
  ) {
    Box(Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) {
      val rest = snap.rest
      when {
        rest != null -> RestScreen(rest, if (hrAllowed) bpm else null)
        snap.workoutActive -> HeartScreen(snap.title, bpm, hrStatus, hrAllowed, onAllow, notifAllowed, onAllowNotif)
        else -> IdleScreen(notifAllowed, onAllowNotif)
      }
    }
  }
}

@Composable
private fun RestScreen(rest: WatchState.Rest, bpm: Double?) {
  var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
  LaunchedEffect(rest.endsAt) {
    while (true) {
      now = System.currentTimeMillis()
      delay(200L)
    }
  }
  val fraction = RestText.fractionLeft(now, rest.startedAt, rest.endsAt)
  Canvas(Modifier.fillMaxSize().padding(4.dp)) {
    val stroke = 10.dp.toPx()
    val inset = stroke / 2f
    val arcSize = Size(size.width - stroke, size.height - stroke)
    drawArc(Track, 0f, 360f, false, topLeft = Offset(inset, inset), size = arcSize, style = Stroke(stroke))
    if (fraction > 0f) {
      drawArc(
        Ember,
        -90f,
        360f * fraction,
        false,
        topLeft = Offset(inset, inset),
        size = arcSize,
        style = Stroke(stroke, cap = StrokeCap.Round),
      )
    }
  }
  Column(
    Modifier.fillMaxWidth().padding(horizontal = 26.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.Center,
  ) {
    Text("REST", color = Ember, fontSize = 13.sp, fontWeight = FontWeight.Bold, letterSpacing = 2.sp)
    Text(
      RestText.remaining(now, rest.endsAt),
      color = Color.White,
      fontSize = 50.sp,
      fontWeight = FontWeight.Bold,
      maxLines = 1,
    )
    RestText.nextLine(rest.next)?.let {
      Text(
        it,
        color = Muted,
        fontSize = 13.sp,
        textAlign = TextAlign.Center,
        maxLines = 2,
        overflow = TextOverflow.Ellipsis,
      )
    }
    if (bpm != null) {
      Spacer(Modifier.height(4.dp))
      Text("♥ ${RestText.bpm(bpm)}", color = Ember, fontSize = 14.sp, fontWeight = FontWeight.Bold)
    }
  }
}

@Composable
private fun HeartScreen(
  title: String,
  bpm: Double?,
  status: HeartRate.Status,
  allowed: Boolean,
  onAllow: () -> Unit,
  notifAllowed: Boolean,
  onAllowNotif: () -> Unit,
) {
  Column(
    Modifier.fillMaxWidth().padding(horizontal = 22.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.Center,
  ) {
    if (title.isNotBlank()) {
      Text(title, color = Muted, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center)
      Spacer(Modifier.height(2.dp))
    }
    Text(
      if (allowed) RestText.bpm(bpm) else "—",
      color = Color.White,
      fontSize = 52.sp,
      fontWeight = FontWeight.Bold,
      maxLines = 1,
    )
    Text("♥ BPM", color = Ember, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 2.sp)
    val note = when {
      !allowed -> "Heart rate is off. Tap to allow."
      status == HeartRate.Status.NO_SENSOR -> "This watch has no heart-rate sensor"
      status == HeartRate.Status.OFF_WRIST -> "Wear the watch snugly"
      status == HeartRate.Status.UNAVAILABLE -> "Heart rate not available"
      bpm == null -> "Reading…"
      else -> null
    }
    if (note != null) {
      Spacer(Modifier.height(6.dp))
      Text(
        note,
        color = if (!allowed) Ember else Muted,
        fontSize = 13.sp,
        textAlign = TextAlign.Center,
        modifier = if (!allowed) Modifier.clickable(onClick = onAllow).padding(4.dp) else Modifier,
      )
    }
    if (!notifAllowed) NotificationPrompt(onAllowNotif)
  }
}

/** Notifications off: the countdown on the watch face (and "Rest is over") cannot show. */
@Composable
private fun NotificationPrompt(onAllow: () -> Unit) {
  Spacer(Modifier.height(6.dp))
  Text(
    "The countdown on the watch face needs notifications",
    color = Muted,
    fontSize = 12.sp,
    textAlign = TextAlign.Center,
    maxLines = 2,
  )
  Spacer(Modifier.height(4.dp))
  CompactChip(
    onClick = onAllow,
    label = { Text("Allow", color = Color.Black, fontWeight = FontWeight.Bold) },
    colors = ChipDefaults.primaryChipColors(backgroundColor = Ember),
  )
}

@Composable
private fun IdleScreen(notifAllowed: Boolean, onAllowNotif: () -> Unit) {
  Column(
    Modifier.fillMaxWidth().padding(horizontal = 24.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.Center,
  ) {
    Text("ForgeAI", color = Ember, fontSize = 15.sp, fontWeight = FontWeight.Bold)
    Spacer(Modifier.height(6.dp))
    Text(
      "Start a workout in ForgeAI on your phone",
      color = Color.White,
      fontSize = 16.sp,
      textAlign = TextAlign.Center,
    )
    if (!notifAllowed) NotificationPrompt(onAllowNotif)
  }
}
