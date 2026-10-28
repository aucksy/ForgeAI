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
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.CompactChip
import androidx.wear.compose.material.LocalTextStyle
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.TimeText
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

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
 *  - A workout open, no rest: the exercise, "Set 3 of 5 ♥ 132", the same two lines, "Complete set".
 *  - Nothing open: how to start.
 * Every line that can be long (a name, "22.5 kg each × 10", larger system text) shrinks to fit its
 * width first (down to 70 %), and only then ends in "…". Lines lower on the round screen get a
 * narrower width, as the glass (and the rest ring) is narrower there.
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
      val side = maxWidth * 0.12f
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

/**
 * One centred line that shrinks to fit its width (to [minScale] of its size), then ends in "…".
 * [build] makes the line at a given scale (1.0 = full size).
 */
@Composable
private fun FitLine(tag: String, modifier: Modifier = Modifier, minScale: Float = 0.7f, build: (Float) -> AnnotatedString) {
  BoxWithConstraints(modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
    val measurer = rememberTextMeasurer()
    val style = LocalTextStyle.current
    val maxPx = constraints.maxWidth
    var scale = 1f
    while (scale > minScale + 0.001f) {
      val w = measurer.measure(build(scale), style = style, maxLines = 1, softWrap = false).size.width
      if (w <= maxPx) break
      scale -= 0.05f
    }
    Text(
      build(scale),
      maxLines = 1,
      softWrap = false,
      overflow = TextOverflow.Ellipsis,
      textAlign = TextAlign.Center,
      modifier = Modifier.testTag(tag),
    )
  }
}

private fun plain(text: String, color: Color, size: TextUnit, weight: FontWeight = FontWeight.Normal): AnnotatedString =
  buildAnnotatedString { withStyle(SpanStyle(color = color, fontSize = size, fontWeight = weight)) { append(text) } }

/** "Last  60 kg × 8": a small grey word, then the numbers in big type. */
private fun labelled(label: String, value: String, valueColor: Color, labelSize: TextUnit, valueSize: TextUnit, labelColor: Color): AnnotatedString =
  buildAnnotatedString {
    withStyle(SpanStyle(color = labelColor, fontSize = labelSize, fontWeight = FontWeight.Normal)) { append("$label  ") }
    withStyle(SpanStyle(color = valueColor, fontSize = valueSize, fontWeight = FontWeight.Bold)) { append(value) }
  }

/**
 * The next set's two number lines (R-166): last time's (or "No last time"), then today's.
 * [inset]: extra side room per line, as the round screen narrows further down.
 */
@Composable
private fun NumberLines(next: NextSet, ambient: Boolean, k: Float, lastSize: Float, inset: Dp) {
  val last = NextSetText.last(next)
  val today = NextSetText.today(next)
  val label = if (ambient) AmbientGrey else Muted
  if (last != null) {
    FitLine("last", Modifier.padding(horizontal = inset)) { s ->
      labelled("Last", last, Color.White, sz(12f * s, k), sz(lastSize * s, k), label)
    }
  } else {
    FitLine("last", Modifier.padding(horizontal = inset)) { s -> plain("No last time", label, sz(12f * s, k)) }
  }
  if (today != null) {
    FitLine("today", Modifier.padding(horizontal = inset * 2)) { s ->
      labelled("Today", today, if (ambient) Color.White else Ember, sz(12f * s, k), sz(13f * s, k), label)
    }
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
  side: Dp,
) {
  if (!ambient) {
    val fraction = RestText.fractionLeft(now, rest.startedAt, rest.endsAt)
    Canvas(Modifier.fillMaxSize().padding(3.dp)) {
      val stroke = 6.dp.toPx()
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
    FitLine("restLabel") { s ->
      buildAnnotatedString {
        withStyle(SpanStyle(color = accent, fontSize = sz(11f * s, k), fontWeight = FontWeight.Bold, letterSpacing = 2.sp)) {
          append(if (ambient) "REST ENDS" else "REST")
        }
        if (bpm != null) {
          withStyle(SpanStyle(color = accent, fontSize = sz(13f * s, k), fontWeight = FontWeight.Bold)) { append("   ♥ ${RestText.bpm(bpm)}") }
        }
      }
    }
    Text(
      if (ambient) endTime(rest.endsAt) else RestText.remaining(now, rest.endsAt),
      color = Color.White,
      fontSize = sz(if (ambient) 30f else 36f, k),
      fontWeight = if (ambient) FontWeight.Normal else FontWeight.Bold,
      maxLines = 1,
      modifier = Modifier.testTag("countdown"),
    )
    val next = snap.next
    if (snap.workoutActive && NextSetText.has(next)) {
      FitLine("nextSet") { s -> plain(NextSetText.restHeader(next, snap.title), Color.White, sz(13f * s, k), FontWeight.SemiBold) }
      NumberLines(next, ambient, k, lastSize = 16f, inset = 6.dp)
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

/** "4:12 PM" / "16:12", as the watch tells the time (plain spaces: some fonts lack U+202F). */
@Composable
private fun endTime(endsAt: Long): String {
  val ctx = LocalContext.current
  return try {
    val pattern = if (DateFormat.is24HourFormat(ctx)) "H:mm" else "h:mm a"
    SimpleDateFormat(pattern, Locale.getDefault()).format(Date(endsAt)).replace('\u202F', ' ').replace('\u00A0', ' ')
  } catch (e: Exception) {
    ""
  }
}

/**
 * A workout open, no rest: the set the phone's live card names (R-166: last time's numbers and
 * today's), heart rate beside the set, and (C5-2) "Complete set", so the set just done can be
 * logged from the wrist.
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
  side: Dp,
  onAllow: () -> Unit,
  onAllowNotif: () -> Unit,
  onAllowExact: () -> Unit,
  onComplete: () -> Unit,
) {
  val canComplete = snap.done.isNotEmpty() && !ambient
  val next = snap.next
  val lines = NextSetText.has(next)
  val accent = if (ambient) AmbientGrey else Ember
  val muted = if (ambient) AmbientGrey else Muted
  val heart = if (allowed) "♥ ${RestText.bpm(bpm)}" else null
  val prompt = !ambient && (!notifAllowed || !exactAllowed)
  Column(
    // A little room under the clock at the top (more with the "Allow ..." line under the button).
    Modifier.fillMaxWidth().padding(start = side, end = side, top = if (prompt) 14.dp else 6.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.Center,
  ) {
    if (lines) {
      FitLine("exercise") { s -> plain(snap.title, Color.White, sz(15f * s, k), FontWeight.Bold) }
      // "Set 3 of 5   ♥ 132": the set and the heart rate on one line.
      FitLine("set") { s ->
        buildAnnotatedString {
          withStyle(SpanStyle(color = muted, fontSize = sz(12f * s, k))) { append(next.set) }
          if (heart != null) withStyle(SpanStyle(color = accent, fontSize = sz(15f * s, k), fontWeight = FontWeight.Bold)) { append("   $heart") }
        }
      }
      NumberLines(next, ambient, k, lastSize = 18f, inset = 4.dp)
    } else {
      // An older phone app, "All sets done · Finish", or a row with nothing to save.
      if (heart != null) Text(heart, color = accent, fontSize = sz(18f, k), fontWeight = FontWeight.Bold, maxLines = 1, modifier = Modifier.testTag("heart"))
      if (snap.title.isNotBlank()) {
        FitLine("exercise") { s -> plain(snap.title, Color.White, sz(14f * s, k), FontWeight.Bold) }
      }
      if (snap.text.isNotBlank()) {
        Text(snap.text, color = muted, fontSize = sz(12f, k), maxLines = 2, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center)
      }
      val note = when {
        status == HeartRate.Status.NO_SENSOR -> "This watch has no heart-rate sensor"
        status == HeartRate.Status.OFF_WRIST -> "Wear the watch snugly"
        status == HeartRate.Status.UNAVAILABLE -> "Heart rate not available"
        else -> null
      }
      if (allowed && note != null && !canComplete) {
        Text(note, color = Muted, fontSize = sz(12f, k), textAlign = TextAlign.Center, maxLines = 2)
      }
    }
    if (!allowed) {
      Text(
        if (ambient) "♥ off" else "♥ Tap to allow heart rate",
        color = accent,
        fontSize = sz(11f, k),
        fontWeight = FontWeight.Bold,
        textAlign = TextAlign.Center,
        maxLines = 1,
        modifier = (if (ambient) Modifier else Modifier.clickable(onClick = onAllow).padding(2.dp)).testTag("heart"),
      )
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
    // C5 review: also beside "Complete set" (a small tappable line, to fit a round screen): with
    // notifications off this app has no countdown and no buttons of its own between sets.
    if (!notifAllowed && !ambient) {
      LinkLine("Allow notifications", "allowNotifications", onAllowNotif)
    } else if (!exactAllowed && !ambient) {
      LinkLine("Allow alarms", "allowAlarms", onAllowExact)
    }
  }
}

/** A small orange tappable line under "Complete set" (a chip there would not fit a round screen). */
@Composable
private fun LinkLine(text: String, tag: String, onClick: () -> Unit) {
  Text(
    text,
    color = Ember,
    fontSize = 11.sp,
    fontWeight = FontWeight.Bold,
    textAlign = TextAlign.Center,
    maxLines = 1,
    overflow = TextOverflow.Ellipsis,
    modifier = Modifier.clickable(onClick = onClick).padding(horizontal = 6.dp, vertical = 5.dp).testTag(tag),
  )
}

/** The first screen: notifications or alarms off, with a short reason and one button. */
@Composable
private fun AllowPrompt(reason: String, button: String, tag: String, onAllow: () -> Unit) {
  Spacer(Modifier.height(6.dp))
  Text(reason, color = Muted, fontSize = 12.sp, textAlign = TextAlign.Center, maxLines = 2)
  Spacer(Modifier.height(4.dp))
  CompactChip(
    onClick = onAllow,
    label = { Text(button, color = Color.Black, fontWeight = FontWeight.Bold, fontSize = 14.sp) },
    colors = ChipDefaults.primaryChipColors(backgroundColor = Ember),
    modifier = Modifier.testTag(tag),
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
      AllowPrompt("The countdown on the watch face needs notifications", "Allow", "allowNotifications", onAllowNotif)
    } else if (!exactAllowed && !ambient) {
      AllowPrompt("To buzz right when your rest ends, allow alarms", "Allow", "allowAlarms", onAllowExact)
    }
  }
}
