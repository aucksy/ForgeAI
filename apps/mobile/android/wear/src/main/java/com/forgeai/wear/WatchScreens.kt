package com.forgeai.wear

import android.text.format.DateFormat
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.CompactChip
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.TimeText
import java.util.Date

internal val Ember = Color(0xFFF26B2A)
internal val Track = Color(0xFF2A2420)
internal val Muted = Color(0xFFB8AFA8)

/** Ambient (screen dimmed): grey and white only, no fills, no ring (burn-in), no buttons. */
private val AmbientGrey = Color(0xFF9E9E9E)

/**
 * The whole watch screen, from state alone (R-166): MainActivity feeds it live, the render test
 * (WatchScreensRenderTest) feeds it fixed states and photographs it on a small and a large round
 * screen.
 *  - Resting: the countdown in an ember ring, heart rate, and the next set: "Set 3 of 5 · Bench
 *    Press", last time's numbers for that set in big type, today's (what "Complete set" saves)
 *    when they differ.
 *  - A workout open, no rest: heart rate, the set, the same two lines and "Complete set".
 *  - Nothing open: how to start.
 * [ambient]: the screen is dimmed (always-on display): the rest shows when it ends instead of a
 * ticking countdown (an ambient screen redraws about once a minute), in grey and white only.
 */
@Composable
internal fun WatchScreen(
  snap: WatchState.Snapshot,
  bpm: Double?,
  hrStatus: HeartRate.Status,
  hrAllowed: Boolean,
  notifAllowed: Boolean,
  ambient: Boolean,
  now: Long,
  onAllow: () -> Unit = {},
  onAllowNotif: () -> Unit = {},
  onComplete: () -> Unit = {},
  exactAllowed: Boolean = true,
  onAllowExact: () -> Unit = {},
) {
  Scaffold(
    modifier = Modifier.fillMaxSize().background(Color.Black),
    timeText = { TimeText() },
  ) {
    BoxWithConstraints(Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) {
      // Type grows with the screen: 1.0 on a 192 dp (small) round watch, ~1.18 on a 228 dp one.
      val k = (maxWidth.value / 192f).coerceIn(1f, 1.25f)
      val side = maxWidth * 0.13f
      val rest = snap.rest
      when {
        rest != null -> RestScreen(rest, snap, if (hrAllowed) bpm else null, ambient, now, k, side)
        snap.workoutActive -> SetScreen(snap, bpm, hrStatus, hrAllowed, notifAllowed, exactAllowed, ambient, k, side, onAllow, onAllowNotif, onAllowExact, onComplete)
        else -> IdleScreen(notifAllowed, exactAllowed, ambient, onAllowNotif, onAllowExact)
      }
    }
  }
}

private fun sz(base: Float, k: Float): TextUnit = (base * k).sp

/** "Last  60 kg × 8": a small grey word, then the numbers in big type. */
private fun labelled(label: String, value: String, valueColor: Color, labelSize: TextUnit, valueSize: TextUnit, labelColor: Color = Muted): AnnotatedString =
  buildAnnotatedString {
    withStyle(SpanStyle(color = labelColor, fontSize = labelSize, fontWeight = FontWeight.Normal)) { append("$label  ") }
    withStyle(SpanStyle(color = valueColor, fontSize = valueSize, fontWeight = FontWeight.Bold)) { append(value) }
  }

/** The next set's two number lines (R-166): last time's (or "No last time"), then today's. */
@Composable
private fun NumberLines(next: NextSet, ambient: Boolean, k: Float) {
  val last = NextSetText.last(next)
  val today = NextSetText.today(next)
  if (last != null) {
    Text(
      labelled("Last", last, Color.White, sz(12f, k), sz(18f, k), if (ambient) AmbientGrey else Muted),
      maxLines = 1,
      overflow = TextOverflow.Ellipsis,
      textAlign = TextAlign.Center,
      modifier = Modifier.testTag("last"),
    )
  } else {
    Text(
      "No last time",
      color = if (ambient) AmbientGrey else Muted,
      fontSize = sz(12f, k),
      maxLines = 1,
      textAlign = TextAlign.Center,
      modifier = Modifier.testTag("last"),
    )
  }
  if (today != null) {
    Text(
      labelled("Today", today, if (ambient) Color.White else Ember, sz(12f, k), sz(14f, k), if (ambient) AmbientGrey else Muted),
      maxLines = 1,
      overflow = TextOverflow.Ellipsis,
      textAlign = TextAlign.Center,
      modifier = Modifier.testTag("today"),
    )
  }
}

@Composable
private fun RestScreen(
  rest: WatchState.Rest,
  snap: WatchState.Snapshot,
  bpm: Double?,
  ambient: Boolean,
  now: Long,
  k: Float,
  side: androidx.compose.ui.unit.Dp,
) {
  if (!ambient) {
    val fraction = RestText.fractionLeft(now, rest.startedAt, rest.endsAt)
    Canvas(Modifier.fillMaxSize().padding(3.dp)) {
      val stroke = 7.dp.toPx()
      val inset = stroke / 2f
      val arcSize = Size(size.width - stroke, size.height - stroke)
      drawArc(Track, 0f, 360f, false, topLeft = Offset(inset, inset), size = arcSize, style = Stroke(stroke))
      if (fraction > 0f) {
        drawArc(Ember, -90f, 360f * fraction, false, topLeft = Offset(inset, inset), size = arcSize, style = Stroke(stroke, cap = StrokeCap.Round))
      }
    }
  }
  val accent = if (ambient) AmbientGrey else Ember
  Column(
    Modifier.fillMaxWidth().padding(horizontal = side),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.Center,
  ) {
    // "REST  ♥ 132" (heart rate beside the word, so the countdown keeps the middle).
    Text(
      buildAnnotatedString {
        withStyle(SpanStyle(color = accent, fontSize = sz(12f, k), fontWeight = FontWeight.Bold, letterSpacing = 2.sp)) {
          append(if (ambient) "REST ENDS" else "REST")
        }
        if (bpm != null) {
          withStyle(SpanStyle(color = accent, fontSize = sz(13f, k), fontWeight = FontWeight.Bold)) { append("   ♥ ${RestText.bpm(bpm)}") }
        }
      },
      maxLines = 1,
      modifier = Modifier.testTag("restLabel"),
    )
    Text(
      if (ambient) endTime(rest.endsAt) else RestText.remaining(now, rest.endsAt),
      color = Color.White,
      fontSize = sz(if (ambient) 34f else 40f, k),
      fontWeight = if (ambient) FontWeight.Normal else FontWeight.Bold,
      maxLines = 1,
      modifier = Modifier.testTag("countdown"),
    )
    val next = snap.next
    if (snap.workoutActive && NextSetText.has(next)) {
      Text(
        NextSetText.restHeader(next, snap.title),
        color = Color.White,
        fontSize = sz(13f, k),
        fontWeight = FontWeight.SemiBold,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        textAlign = TextAlign.Center,
        modifier = Modifier.testTag("nextSet"),
      )
      NumberLines(next, ambient, k)
    } else {
      // An older phone app (no lines) or the rest after the last set ("All sets done").
      RestText.nextLine(rest.next)?.let {
        Text(
          it,
          color = if (ambient) AmbientGrey else Muted,
          fontSize = sz(13f, k),
          textAlign = TextAlign.Center,
          maxLines = 2,
          overflow = TextOverflow.Ellipsis,
          modifier = Modifier.testTag("nextSet"),
        )
      }
    }
  }
}

/** "4:12 PM" / "16:12", as the watch tells the time. */
@Composable
private fun endTime(endsAt: Long): String {
  val ctx = LocalContext.current
  return try {
    DateFormat.getTimeFormat(ctx).format(Date(endsAt))
  } catch (e: Exception) {
    RestText.clock(0L)
  }
}

/**
 * A workout open, no rest: heart rate, the set the phone's live card names (R-166: last time's
 * numbers and today's) and (C5-2) "Complete set", so the set just done can be logged from the wrist.
 */
@Composable
private fun SetScreen(
  snap: WatchState.Snapshot,
  bpm: Double?,
  status: HeartRate.Status,
  allowed: Boolean,
  notifAllowed: Boolean,
  exactAllowed: Boolean,
  ambient: Boolean,
  k: Float,
  side: androidx.compose.ui.unit.Dp,
  onAllow: () -> Unit,
  onAllowNotif: () -> Unit,
  onAllowExact: () -> Unit,
  onComplete: () -> Unit,
) {
  val canComplete = snap.done.isNotEmpty() && !ambient
  val next = snap.next
  val lines = NextSetText.has(next)
  val accent = if (ambient) AmbientGrey else Ember
  Column(
    Modifier.fillMaxWidth().padding(horizontal = side),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.Center,
  ) {
    if (!allowed) {
      Text(
        if (ambient) "♥ off" else "♥ Tap to allow heart rate",
        color = accent,
        fontSize = sz(12f, k),
        fontWeight = FontWeight.Bold,
        textAlign = TextAlign.Center,
        maxLines = 2,
        modifier = (if (ambient) Modifier else Modifier.clickable(onClick = onAllow).padding(2.dp)).testTag("heart"),
      )
    } else {
      Text(
        "♥ ${RestText.bpm(bpm)}",
        color = accent,
        fontSize = sz(18f, k),
        fontWeight = FontWeight.Bold,
        maxLines = 1,
        modifier = Modifier.testTag("heart"),
      )
      val note = when {
        status == HeartRate.Status.NO_SENSOR -> "This watch has no heart-rate sensor"
        status == HeartRate.Status.OFF_WRIST -> "Wear the watch snugly"
        status == HeartRate.Status.UNAVAILABLE -> "Heart rate not available"
        else -> null
      }
      // Only when there is room: the set's lines come first.
      if (note != null && !lines && !canComplete) {
        Text(note, color = Muted, fontSize = sz(12f, k), textAlign = TextAlign.Center, maxLines = 2)
      }
    }
    Spacer(Modifier.height(2.dp))
    if (lines) {
      Text(
        snap.title,
        color = Color.White,
        fontSize = sz(15f, k),
        fontWeight = FontWeight.Bold,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        textAlign = TextAlign.Center,
        modifier = Modifier.testTag("exercise"),
      )
      Text(
        next.set,
        color = if (ambient) AmbientGrey else Muted,
        fontSize = sz(12f, k),
        maxLines = 1,
        textAlign = TextAlign.Center,
        modifier = Modifier.testTag("set"),
      )
      NumberLines(next, ambient, k)
    } else {
      // An older phone app, "All sets done · Finish", or a row with nothing to save.
      if (snap.title.isNotBlank()) {
        Text(snap.title, color = Color.White, fontSize = sz(14f, k), fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center)
      }
      if (snap.text.isNotBlank()) {
        Text(snap.text, color = if (ambient) AmbientGrey else Muted, fontSize = sz(12f, k), maxLines = 2, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center)
      }
    }
    if (canComplete) {
      Spacer(Modifier.height(4.dp))
      CompactChip(
        onClick = onComplete,
        label = { Text("Complete set", color = Color.Black, fontWeight = FontWeight.Bold) },
        colors = ChipDefaults.primaryChipColors(backgroundColor = Ember),
        modifier = Modifier.testTag("complete"),
      )
    }
    // C5 review: also beside "Complete set" (short form, to fit a round screen): with notifications
    // off this app has no countdown and no buttons of its own between sets.
    if (!notifAllowed && !ambient) {
      NotificationPrompt(onAllowNotif, compact = true)
    } else if (!exactAllowed && !ambient) {
      ExactAlarmPrompt(onAllowExact, compact = true)
    }
  }
}

/**
 * Notifications off: the countdown on the watch face, its buttons and "Rest is over" cannot show.
 * [compact]: one small chip, no explanation (beside "Complete set" on a round screen).
 */
@Composable
private fun NotificationPrompt(onAllow: () -> Unit, compact: Boolean = false) {
  if (!compact) {
    Spacer(Modifier.height(6.dp))
    Text(
      "The countdown on the watch face needs notifications",
      color = Muted,
      fontSize = 12.sp,
      textAlign = TextAlign.Center,
      maxLines = 2,
    )
  }
  Spacer(Modifier.height(4.dp))
  CompactChip(
    onClick = onAllow,
    label = {
      Text(
        if (compact) "Allow notifications" else "Allow",
        color = if (compact) Ember else Color.Black,
        fontWeight = FontWeight.Bold,
        fontSize = if (compact) 11.sp else 14.sp,
      )
    },
    colors = if (compact) ChipDefaults.secondaryChipColors() else ChipDefaults.primaryChipColors(backgroundColor = Ember),
  )
}

/**
 * R-167: "Alarms & reminders" is off (Play allows this app no USE_EXACT_ALARM; Wear OS 5+ starts
 * it off): the end-of-rest buzz may come late when this screen is not up. One chip opens the switch.
 */
@Composable
private fun ExactAlarmPrompt(onAllow: () -> Unit, compact: Boolean = false) {
  if (!compact) {
    Spacer(Modifier.height(6.dp))
    Text(
      "To buzz right when your rest ends, allow alarms",
      color = Muted,
      fontSize = 12.sp,
      textAlign = TextAlign.Center,
      maxLines = 2,
    )
  }
  Spacer(Modifier.height(4.dp))
  CompactChip(
    onClick = onAllow,
    label = {
      Text(
        if (compact) "Allow alarms" else "Allow",
        color = if (compact) Ember else Color.Black,
        fontWeight = FontWeight.Bold,
        fontSize = if (compact) 11.sp else 14.sp,
      )
    },
    colors = if (compact) ChipDefaults.secondaryChipColors() else ChipDefaults.primaryChipColors(backgroundColor = Ember),
    modifier = Modifier.testTag("allowAlarms"),
  )
}

@Composable
private fun IdleScreen(notifAllowed: Boolean, exactAllowed: Boolean, ambient: Boolean, onAllowNotif: () -> Unit, onAllowExact: () -> Unit) {
  Column(
    Modifier.fillMaxWidth().padding(horizontal = 24.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.Center,
  ) {
    Text("MettleUp", color = if (ambient) AmbientGrey else Ember, fontSize = 15.sp, fontWeight = FontWeight.Bold)
    Spacer(Modifier.height(6.dp))
    Text(
      "Start a workout in MettleUp on your phone",
      color = Color.White,
      fontSize = 16.sp,
      textAlign = TextAlign.Center,
    )
    if (!notifAllowed && !ambient) {
      NotificationPrompt(onAllowNotif)
    } else if (!exactAllowed && !ambient) {
      ExactAlarmPrompt(onAllowExact)
    }
  }
}
