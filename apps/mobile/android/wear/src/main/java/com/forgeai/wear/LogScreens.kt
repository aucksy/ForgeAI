package com.forgeai.wear

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.rotary.onRotaryScrollEvent
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import java.util.Date
import kotlin.math.ceil

/*
 * Watch logging (3 Nov 2026): the owner's approved design "MettleUp Watch Logging" (WatchLog.dc.html),
 * drawn at its own px on the 456 px round canvas and scaled by screen width / 456 ([Px]). Screens:
 * 1 Next set, 2a/2b the crown on weight or reps, 3 effort, 4 Saved + rest timer, 5 rest is over,
 * 6 exercise done, 7 not saved; each has its always-on (dim) form: black, ink #BDBDBD, grey
 * #7A7A7A, outlines only, no fills, no seconds, no heart rate, no buttons.
 * The flow itself (what each tap does) is pure, in WatchLog.kt; MainActivity keeps its state.
 */

/** What the logging screens' taps do (MainActivity fills them; the render test leaves them empty). */
internal class LogActions(
  val onTapWeight: () -> Unit = {},
  val onTapReps: () -> Unit = {},
  val onCrown: (Int) -> Unit = {},
  val onDone: () -> Unit = {},
  val onRpe: (Double) -> Unit = {},
  val onSkipEffort: () -> Unit = {},
  val onMinus15: () -> Unit = {},
  val onPlus15: () -> Unit = {},
  val onSkipRest: () -> Unit = {},
  val onOk: () -> Unit = {},
  val onGo: () -> Unit = {},
)

/** The design's colour tokens, active and dim; the accent is the gym's ([palette]). */
private class LogInk(
  val ink: Color,
  val grey: Color,
  val acc: Color,
  val track: Color,
  val surf: Color,
  val line: Color,
)

@Composable
private fun logInk(ambient: Boolean): LogInk {
  val pal = palette(ambient)
  return if (ambient) {
    LogInk(Color(0xFFBDBDBD), Color(0xFF7A7A7A), pal.accent, Color.Transparent, Color.Transparent, Color(0xFF3A3A3A))
  } else {
    LogInk(Color.White, Color(0xFFA0A0A0), pal.accent, Color(0xFF242424), Color(0xFF1C1C1C), Color.Transparent)
  }
}

private const val CHECK = "M5 12.5l4.5 4.5L19 7.5"
private const val ARROW_LINE = "M5 12h14"
private const val ARROW_HEAD = "M13 6l6 6-6 6"
private const val HEART_FILL = "M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z"

/** The selected pill's warm fill and the unselected pill's dark fill (design). */
private val WarmFill = Color(0xFF2A1A12)
private val PillFill = Color(0xFF161616)

/** The logging screens: one of [LogScreen] for this moment. */
@Composable
internal fun LogScreens(
  screen: LogScreen,
  snap: WatchState.Snapshot,
  card: SetCard,
  heart: WatchCopy.HeartLine?,
  ambient: Boolean,
  px: Px,
  now: Long,
  ui: LogUi,
  actions: LogActions,
  status: String?,
) {
  Box(Modifier.fillMaxSize()) {
    when (screen) {
      LogScreen.NEXT_SET -> NextSetScreen(snap, card, heart, ambient, px, now, ui, actions)
      LogScreen.EFFORT -> EffortScreen(snap, card, heart, ambient, px, now, ui, actions)
      LogScreen.REST -> snap.rest?.let { RestScreen(it, card, heart, ambient, px, now, ui, actions, status) }
      LogScreen.REST_OVER -> RestOverScreen(snap, card, ambient, px, now, status)
      LogScreen.EXERCISE_DONE -> ExerciseDoneScreen(snap, card, heart, ambient, px, now, ui, actions)
      LogScreen.NOT_SAVED -> NotSavedScreen(heart, ambient, px, now, actions)
      LogScreen.BETWEEN -> Unit
    }
  }
}

// ------------------------------------------------------------------ shared pieces

/** A box at the design's (left, top), [w] x [h] px. */
private fun Modifier.at(px: Px, left: Float, top: Float, w: Float, h: Float): Modifier =
  this.offset(x = px.dp(left), y = px.dp(top)).size(px.dp(w), px.dp(h))

/** A full-width row whose content is centred, its top at [top] px. */
@Composable
private fun Centered(px: Px, top: Float, content: @Composable () -> Unit) {
  Box(Modifier.fillMaxWidth().padding(top = px.dp(top)), contentAlignment = Alignment.TopCenter) { content() }
}

private fun fillIcon(d: String, color: Color): ImageVector =
  ImageVector.Builder(defaultWidth = 24.dp, defaultHeight = 24.dp, viewportWidth = 24f, viewportHeight = 24f)
    .addPath(pathData = addPathNodes(d), fill = SolidColor(color))
    .build()

/** Time and heart rate, top centre (20 px / 600; the heart in the accent). Dim: the time only. */
@Composable
private fun TopBar(px: Px, top: Float, now: Long, heart: WatchCopy.HeartLine?, ambient: Boolean, timeInk: Color, ink: LogInk) {
  val ctx = LocalContext.current
  val minute = now / 60_000L
  val time = remember(minute) { android.text.format.DateFormat.getTimeFormat(ctx).format(Date(now)) }
  Centered(px, top) {
    Row(verticalAlignment = Alignment.CenterVertically) {
      Line(time, px, 20f, FontWeight.SemiBold, timeInk, spacing = 0.02f, lineHeight = 1.2f, tabular = true, tag = "clock", label = true)
      if (heart != null && !ambient) {
        Spacer(Modifier.width(px.dp(12f)))
        StrokeIcon(px.dp(14f), "heartIcon", "heartFill", ink.acc) { fillIcon(HEART_FILL, ink.acc) }
        Spacer(Modifier.width(px.dp(4f)))
        Line(heart.text.removePrefix(WatchCopy.HEART).trim(), px, 20f, FontWeight.Bold, if (heart.waiting) ink.grey else ink.ink, tabular = true, tag = "heart", label = true)
      }
    }
  }
}

/** The big round button (Done's check, or Go's arrow): 128 px, orange; dim: an outline. */
@Composable
private fun RoundButton(px: Px, ambient: Boolean, enabled: Boolean, arrow: Boolean, tag: String, onClick: () -> Unit) {
  val ink = logInk(ambient)
  val bg = when {
    ambient -> Color.Transparent
    enabled -> ink.acc
    else -> Color(0xFF1C1C1C)
  }
  val line = if (ambient) Color(0xFF5A5A5A) else bg
  val mark = when {
    ambient -> Color(0xFF9A9A9A)
    enabled -> Color.Black
    else -> Color(0xFF5A5A5A)
  }
  Box(
    Modifier
      .at(px, 164f, 304f, 128f, 128f)
      .clip(CircleShape)
      .background(bg)
      .border(px.dp(2f), line, CircleShape)
      .then(if (enabled && !ambient) Modifier.clickable(onClick = onClick) else Modifier)
      .testTag(tag),
    contentAlignment = Alignment.Center,
  ) {
    val size = if (arrow) 56f else 60f
    val sw = if (ambient) 2f else 3f
    StrokeIcon(px.dp(size), "${tag}Icon", tag, mark, sw) {
      val paths = if (arrow) listOf(IconPath(ARROW_LINE, mark), IconPath(ARROW_HEAD, mark)) else listOf(IconPath(CHECK, mark))
      strokeIcon(paths, sw, StrokeCap.Round, StrokeJoin.Round)
    }
  }
}

/** A pill button with a word (Skip, OK). */
@Composable
private fun PillButton(px: Px, left: Float, top: Float, w: Float, h: Float, text: String, ambient: Boolean, tag: String, onClick: () -> Unit) {
  val ink = logInk(ambient)
  val shape = RoundedCornerShape(px.dp(h / 2f))
  Box(
    Modifier
      .at(px, left, top, w, h)
      .clip(shape)
      .background(ink.surf)
      .border(px.dp(2f), ink.line, shape)
      .then(if (ambient) Modifier else Modifier.clickable(onClick = onClick))
      .testTag(tag),
    contentAlignment = Alignment.Center,
  ) {
    Line(text, px, 22f, if (ambient) FontWeight.Medium else FontWeight.Bold, ink.ink, label = true)
  }
}

private fun DrawScope.circleBox(radius: Float): Pair<Offset, Size> {
  val k = size.minDimension / RingMath.DESIGN_PX
  val r = radius * k
  return Offset(center.x - r, center.y - r) to Size(2f * r, 2f * r)
}

/** A ring at [radius] px: a full [track] and the share [left] of it from 12 o'clock in [color]. */
@Composable
private fun Ring(radius: Float, stroke: Float, track: Color, color: Color, left: Float, tag: String) {
  Canvas(Modifier.fillMaxSize().testTag(tag)) {
    val (tl, box) = circleBox(radius)
    val w = stroke * size.minDimension / RingMath.DESIGN_PX
    if (track.alpha > 0f) drawArc(track, 0f, 360f, false, topLeft = tl, size = box, style = Stroke(width = w))
    val sweep = 360f * left.coerceIn(0f, 1f)
    if (sweep > 0f) drawArc(color, RingMath.START_ANGLE, sweep, false, topLeft = tl, size = box, style = Stroke(width = w, cap = StrokeCap.Round))
  }
}

// ------------------------------------------------------------------ 1 / 2a / 2b. next set

@Composable
private fun NextSetScreen(
  snap: WatchState.Snapshot,
  card: SetCard,
  heart: WatchCopy.HeartLine?,
  ambient: Boolean,
  px: Px,
  now: Long,
  ui: LogUi,
  actions: LogActions,
) {
  val ink = logInk(ambient)
  val e = snap.entry ?: return
  val rowKey = LogMath.setKeyOf(snap.row)
  val w = LogMath.weight(ui, e, rowKey)
  val r = LogMath.repsNow(ui, e, rowKey)
  val adjust = if (ui.edited && ui.rowKey == rowKey) ui.adjust else Adjust.NONE
  val sending = ui.phase == LogPhase.SENDING
  val requester = remember { FocusRequester() }
  var carry by remember { mutableFloatStateOf(0f) }
  Box(
    Modifier
      .fillMaxSize()
      .onRotaryScrollEvent { ev ->
        val (steps, rest) = LogMath.crownSteps(carry, ev.verticalScrollPixels)
        carry = rest
        if (steps != 0) actions.onCrown(steps)
        true
      }
      .focusRequester(requester)
      .focusable(),
  ) {
    TopBar(px, 28f, now, heart, ambient, ink.grey, ink)
    // The name, the set and Previous sit above the pills (bottom-aligned, as the design's stack).
    val k = px.labelScale
    val stackH = ceil(2f * 22f * k * 1.15f + 2f * 18f * k * 1.3f + 8f)
    // One column: a taller stack (a long name at the largest text) pushes the pills down instead
    // of sliding under them (3 Nov render: "Previous" was hidden).
    Column(Modifier.fillMaxWidth().padding(top = px.dp(58f)), horizontalAlignment = Alignment.CenterHorizontally) {
    Column(
      Modifier.fillMaxWidth().heightIn(min = px.dp(stackH)),
      verticalArrangement = Arrangement.spacedBy(px.dp(4f), Alignment.Bottom),
      horizontalAlignment = Alignment.CenterHorizontally,
    ) {
      if (card.exercise.isNotEmpty()) {
        Line(card.exercise, px, 22f, if (ambient) FontWeight.SemiBold else FontWeight.ExtraBold, ink.ink, spacing = -0.01f, lineHeight = 1.15f, maxWidth = 288f, maxLines = 2, balanced = true, tag = "exercise", label = true)
      }
      Row(verticalAlignment = Alignment.CenterVertically) {
        if (e.warm) {
          Box(
            Modifier.size(px.dp(22f * k)).border(px.dp(1.5f), ink.grey, CircleShape).testTag("warmUp"),
            contentAlignment = Alignment.Center,
          ) {
            Line(WatchCopy.WARM_UP_CHIP, px, 12f, FontWeight.ExtraBold, ink.ink, label = true)
          }
          Spacer(Modifier.width(px.dp(8f)))
        }
        if (card.setLabel.isNotEmpty()) Line(card.setLabel, px, 18f, FontWeight.SemiBold, ink.grey, lineHeight = 1.3f, tabular = true, tag = "setLabel", label = true)
      }
      val sub = if (adjust != Adjust.NONE) LogMath.crownHint(adjust, e) else card.previous.orEmpty()
      if (sub.isNotEmpty()) {
        Line(sub, px, 18f, if (adjust != Adjust.NONE) FontWeight.Bold else FontWeight.Medium, if (adjust != Adjust.NONE) ink.acc else ink.grey, lineHeight = 1.3f, tabular = true, maxWidth = 360f, tag = "previous", label = true)
      }
    }
    // The big numbers, fixed size whatever the text size.
    Spacer(Modifier.height(px.dp(6f)))
    run {
      Row(verticalAlignment = Alignment.CenterVertically) {
        if (e.wOn) {
          NumberPill(px, LogMath.num(w), e.unit, adjust == Adjust.WEIGHT, adjust == Adjust.REPS, ambient, "weight", actions.onTapWeight)
        }
        if (e.wOn && e.rOn) {
          Spacer(Modifier.width(px.dp(8f)))
          Line("×", px, 30f, FontWeight.SemiBold, ink.grey)
          Spacer(Modifier.width(px.dp(8f)))
        }
        if (e.rOn) {
          NumberPill(px, LogMath.reps(r), "", adjust == Adjust.REPS, adjust == Adjust.WEIGHT, ambient, "reps", actions.onTapReps)
        }
        if (!e.wOn && !e.rOn) {
          // A timed or distance set: logged as the phone shows it (no crown).
          Line(snap.next.goal.ifEmpty { "—" }, px, 36f, FontWeight.ExtraBold, ink.ink, maxWidth = 340f, tag = "goal")
        }
      }
    }
    }
    if (adjust != Adjust.NONE) {
      // The crown's arc at the right edge (design: 6 px, 68 to 112 degrees from 12 o'clock).
      Canvas(Modifier.fillMaxSize().testTag("crownArc")) {
        val (tl, box) = circleBox(219f)
        val sw = (if (ambient) 2f else 6f) * size.minDimension / RingMath.DESIGN_PX
        drawArc(ink.acc, 68f - 90f, 44f, false, topLeft = tl, size = box, style = Stroke(width = sw, cap = StrokeCap.Round))
      }
    }
    RoundButton(px, ambient, LogMath.canLog(snap.row, e, w, r) && !sending, arrow = false, tag = "done", onClick = actions.onDone)
  }
  LaunchedEffect(Unit) {
    try {
      requester.requestFocus()
    } catch (_: Exception) {
      // quiet: no focus (a render without a window): the dial simply does nothing.
    }
  }
}

/** One big number in its 86 px pill; [selected] = the crown changes it, [other] = the other one is selected. */
@Composable
private fun NumberPill(px: Px, value: String, unit: String, selected: Boolean, other: Boolean, ambient: Boolean, tag: String, onTap: () -> Unit) {
  val ink = logInk(ambient)
  val shape = RoundedCornerShape(px.dp(28f))
  val bg = when {
    ambient -> Color.Transparent
    selected -> WarmFill
    else -> PillFill
  }
  val line = if (selected) ink.acc else Color.Transparent
  val numInk = if (other) ink.grey else ink.ink
  val unitInk = if (selected) ink.ink else ink.grey
  val size = if (value.length > 4) 54f else 64f
  Row(
    Modifier
      .height(px.dp(86f))
      .clip(shape)
      .background(bg)
      .border(px.dp(3f), line, shape)
      .then(if (ambient) Modifier else Modifier.clickable(onClick = onTap))
      .padding(horizontal = px.dp(14f))
      .testTag(tag),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Line(value, px, size, if (ambient) FontWeight.Medium else FontWeight.ExtraBold, numInk, spacing = -0.04f, lineHeight = 1f, tabular = true, tag = "${tag}Value")
    if (unit.isNotEmpty()) {
      Spacer(Modifier.width(px.dp(4f)))
      Line(unit, px, 22f, FontWeight.Bold, unitInk, Modifier.padding(top = px.dp(20f)))
    }
  }
}

// ------------------------------------------------------------------ 3. effort (RPE)

@Composable
private fun EffortScreen(
  snap: WatchState.Snapshot,
  card: SetCard,
  heart: WatchCopy.HeartLine?,
  ambient: Boolean,
  px: Px,
  now: Long,
  ui: LogUi,
  actions: LogActions,
) {
  val ink = logInk(ambient)
  val e = snap.entry
  val rowKey = LogMath.setKeyOf(snap.row)
  Ring(218f, if (ambient) 2f else 4f, ink.track, if (ambient) Color(0xFF4A4A4A) else Color(0xFF7A7A7A), LogFlow.effortLeft(ui, now), "effortRing")
  TopBar(px, 28f, now, heart, ambient, ink.grey, ink)
  Centered(px, if (px.labelScale > 1.1f) 54f else 60f) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(px.dp(2f))) {
      if (e != null) {
        val line = LogMath.setLine(LogMath.weight(ui, e, rowKey), LogMath.repsNow(ui, e, rowKey), e)
        if (line.isNotEmpty()) Line(line, px, 18f, FontWeight.SemiBold, ink.grey, tabular = true, tag = "effortSet", label = true)
      } else if (card.next != null) {
        Line(card.next, px, 18f, FontWeight.SemiBold, ink.grey, tabular = true, label = true)
      }
      Line(WatchCopy.HOW_HARD, px, 26f, if (ambient) FontWeight.SemiBold else FontWeight.ExtraBold, ink.ink, tag = "title", label = true)
    }
  }
  for ((i, v) in LogMath.RPE.withIndex()) {
    val col = i % 4
    val row = i / 4
    val shape = RoundedCornerShape(px.dp(32f))
    Box(
      Modifier
        .at(px, 51f + col * 90f, 132f + row * 70f, 84f, 64f)
        .clip(shape)
        .background(ink.surf)
        .border(px.dp(2f), ink.line, shape)
        .then(if (ambient) Modifier else Modifier.clickable { actions.onRpe(v) })
        .testTag("rpe${LogMath.rpe(v)}"),
      contentAlignment = Alignment.Center,
    ) {
      Line(LogMath.rpe(v), px, 28f, if (ambient) FontWeight.Medium else FontWeight.Bold, ink.ink, tabular = true)
    }
  }
  Centered(px, 272f) { Line(WatchCopy.EFFORT_SCALE, px, 16f, FontWeight.SemiBold, ink.grey, tag = "scale", label = true) }
  PillButton(px, 153f, 304f, 150f, 80f, WatchCopy.SKIP, ambient, "skipEffort", actions.onSkipEffort)
}

// ------------------------------------------------------------------ 4. saved + rest timer

@Composable
private fun RestScreen(
  rest: WatchState.Rest,
  card: SetCard,
  heart: WatchCopy.HeartLine?,
  ambient: Boolean,
  px: Px,
  now: Long,
  ui: LogUi,
  actions: LogActions,
  status: String?,
) {
  val ink = logInk(ambient)
  Ring(RingMath.RADIUS, if (ambient) RingMath.AMBIENT_STROKE else RingMath.STROKE, ink.track, ink.acc, RestText.fractionLeft(now, rest.startedAt, rest.endsAt), "ring")
  TopBar(px, 50f, now, heart, ambient, ink.grey, ink)
  val savedChip = LogFlow.showSaved(ui, now)
  // R-343 (owner, 5 Nov 2026: "During the rest time, it's not showing the exercise name"): the exercise the next
  // set belongs to sits above the countdown, one line; the "Saved" chip takes its place for its few seconds.
  if (!savedChip && card.exercise.isNotEmpty()) {
    Centered(px, 82f) {
      Line(card.exercise, px, 20f, if (ambient) FontWeight.Medium else FontWeight.Bold, ink.ink, spacing = -0.01f, lineHeight = 1.1f, maxWidth = 280f, maxLines = 1, tag = "restExercise", label = true)
    }
  }
  if (savedChip) {
    Centered(px, 80f) {
      Row(
        Modifier
          .height(px.dp(34f))
          .clip(RoundedCornerShape(px.dp(18f)))
          .background(ink.surf)
          .border(px.dp(1.5f), ink.line, RoundedCornerShape(px.dp(18f)))
          .padding(start = px.dp(12f), end = px.dp(16f))
          .testTag("saved"),
        verticalAlignment = Alignment.CenterVertically,
      ) {
        StrokeIcon(px.dp(20f), "savedIcon", "savedCheck", ink.acc) { strokeIcon(listOf(IconPath(CHECK, ink.acc)), 3f, StrokeCap.Round, StrokeJoin.Round) }
        Spacer(Modifier.width(px.dp(6f)))
        Line(WatchCopy.SAVED, px, 18f, FontWeight.Bold, ink.ink, label = true)
      }
    }
  }
  val clock = LogMath.restClock(RestText.secondsLeft(now, rest.endsAt), ambient)
  Centered(px, 120f) {
    Line(clock, px, if (clock.length > 4) 76f else 92f, if (ambient) FontWeight.Medium else FontWeight.ExtraBold, ink.ink, spacing = -0.045f, lineHeight = 1f, tabular = true, tag = "countdown")
  }
  if (!ambient) {
    RoundSmall(px, 44f, WatchCopy.MINUS_15, "minus15", actions.onMinus15)
    RoundSmall(px, 316f, WatchCopy.PLUS_15, "plus15", actions.onPlus15)
  }
  if (card.setLabel.isEmpty() && status != null) {
    Centered(px, 220f) { Line(status, px, 18f, FontWeight.SemiBold, ink.grey, lineHeight = 1.25f, maxWidth = 300f, maxLines = 2, balanced = true, tag = "status", label = true) }
  } else {
    card.previous?.let { Centered(px, 220f) { Line(it, px, 18f, FontWeight.Medium, ink.grey, tabular = true, maxWidth = 330f, tag = "previous", label = true) } }
    card.next?.let { Centered(px, 246f) { Line(it, px, 22f, if (ambient) FontWeight.Medium else FontWeight.Bold, ink.acc, tabular = true, maxWidth = 330f, tag = "next", label = true) } }
  }
  if (!ambient) PillButton(px, 158f, 292f, 140f, 90f, WatchCopy.SKIP, false, "skipRest", actions.onSkipRest)
}

/** −15 / +15: a 64 px dark circle in a 96 px tap area. */
@Composable
private fun RoundSmall(px: Px, left: Float, text: String, tag: String, onClick: () -> Unit) {
  Box(
    Modifier.at(px, left, 118f, 96f, 96f).clip(CircleShape).clickable(onClick = onClick).testTag(tag),
    contentAlignment = Alignment.Center,
  ) {
    Box(Modifier.size(px.dp(64f)).clip(CircleShape).background(Color(0xFF1C1C1C)), contentAlignment = Alignment.Center) {
      Line(text, px, 20f, FontWeight.Bold, Color(0xFFA0A0A0), tabular = true)
    }
  }
}

// ------------------------------------------------------------------ 5. rest is over

@Composable
private fun RestOverScreen(snap: WatchState.Snapshot, card: SetCard, ambient: Boolean, px: Px, now: Long, status: String?) {
  val ink = logInk(ambient)
  val text = if (ambient) ink.ink else Color.Black
  Ring(218f, if (ambient) 2f else 4f, Color.Transparent, if (ambient) ink.acc else Color.Black, LogFlow.overLeft(snap.overAt, now), "overRing")
  TopBar(px, 28f, now, null, ambient, if (ambient) ink.grey else Color.Black, ink)
  Column(
    Modifier.fillMaxSize().padding(top = px.dp(20f), start = px.dp(64f), end = px.dp(64f)),
    verticalArrangement = Arrangement.spacedBy(px.dp(6f), Alignment.CenterVertically),
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    Line(WatchCopy.REST_IS_OVER, px, 52f, if (ambient) FontWeight.SemiBold else FontWeight.ExtraBold, text, Modifier.padding(bottom = px.dp(10f)), spacing = -0.03f, lineHeight = 1.02f, maxLines = 2, balanced = true, tag = "restIsOver")
    if (card.setLabel.isNotEmpty()) {
      Line(card.setLabel, px, 20f, FontWeight.Bold, text, tabular = true, tag = "setLabel", label = true)
      card.previous?.let { Line(it, px, 20f, FontWeight.SemiBold, text, tabular = true, maxWidth = 340f, tag = "previous", label = true) }
      val goal = snap.next.goal.trim()
      if (goal.isNotEmpty()) {
        Row(verticalAlignment = Alignment.Bottom) {
          Line(WatchCopy.NEXT, px, 20f, FontWeight.Bold, text, Modifier.alignByBaseline(), label = true)
          Spacer(Modifier.width(px.dp(10f)))
          Line(goal, px, if (goal.length > 10) 36f else 48f, if (ambient) FontWeight.SemiBold else FontWeight.ExtraBold, text, Modifier.alignByBaseline(), spacing = -0.03f, tabular = true, maxWidth = 300f, tag = "next")
        }
      }
    } else if (status != null) {
      Line(status, px, 20f, FontWeight.Bold, text, lineHeight = 1.25f, maxWidth = 320f, maxLines = 2, balanced = true, tag = "status", label = true)
    }
  }
}

// ------------------------------------------------------------------ 6. exercise done

@Composable
private fun ExerciseDoneScreen(
  snap: WatchState.Snapshot,
  card: SetCard,
  heart: WatchCopy.HeartLine?,
  ambient: Boolean,
  px: Px,
  now: Long,
  ui: LogUi,
  actions: LogActions,
) {
  val ink = logInk(ambient)
  var drag by remember { mutableFloatStateOf(0f) }
  Box(
    Modifier
      .fillMaxSize()
      .then(
        if (ambient) {
          Modifier
        } else {
          // A swipe to the left is Go too (a swipe to the right stays the watch's own "back").
          Modifier.pointerInput(Unit) {
            detectHorizontalDragGestures(
              onDragStart = { drag = 0f },
              onDragEnd = {
                if (drag < -SWIPE_PX * density) actions.onGo()
                drag = 0f
              },
            ) { _, dx -> drag += dx }
          }
        },
      ),
  ) {
    TopBar(px, 28f, now, heart, ambient, ink.grey, ink)
    Column(
      Modifier.fillMaxWidth().padding(top = px.dp(52f)).height(px.dp(248f)),
      verticalArrangement = Arrangement.spacedBy(px.dp(2f), Alignment.CenterVertically),
      horizontalAlignment = Alignment.CenterHorizontally,
    ) {
      if (ui.doneSets > 0) {
        Row(verticalAlignment = Alignment.CenterVertically) {
          StrokeIcon(px.dp(20f), "doneIcon", "exDoneCheck", ink.acc) { strokeIcon(listOf(IconPath(CHECK, ink.acc)), 3f, StrokeCap.Round, StrokeJoin.Round) }
          Spacer(Modifier.width(px.dp(6f)))
          Line(LogMath.setsDone(ui.doneSets), px, 18f, FontWeight.SemiBold, ink.grey, tag = "setsDone", label = true)
        }
      }
      Line(WatchCopy.NEXT_EXERCISE, px, 18f, FontWeight.SemiBold, ink.grey, Modifier.padding(top = px.dp(8f)), label = true)
      Line(card.exercise, px, 32f, if (ambient) FontWeight.SemiBold else FontWeight.ExtraBold, ink.ink, spacing = -0.02f, lineHeight = 1.1f, maxWidth = 300f, maxLines = 2, balanced = true, tag = "exercise", label = true)
      card.previous?.let { Line(it, px, 18f, FontWeight.Medium, ink.grey, Modifier.padding(top = px.dp(4f)), tabular = true, maxWidth = 330f, tag = "previous", label = true) }
      val goal = snap.next.goal.trim()
      if (goal.isNotEmpty()) {
        Row(verticalAlignment = Alignment.Bottom) {
          Line(WatchCopy.NEXT, px, 18f, FontWeight.Bold, ink.acc, Modifier.alignByBaseline(), label = true)
          Spacer(Modifier.width(px.dp(10f)))
          Line(goal, px, if (goal.length > 10) 32f else 44f, if (ambient) FontWeight.SemiBold else FontWeight.ExtraBold, ink.acc, Modifier.alignByBaseline(), spacing = -0.03f, tabular = true, maxWidth = 300f, tag = "next")
        }
      }
    }
    RoundButton(px, ambient, true, arrow = true, tag = "go", onClick = actions.onGo)
  }
}

/** How far (dp) a left swipe must go to count as Go. */
private const val SWIPE_PX = 48f

// ------------------------------------------------------------------ 7. not saved

@Composable
private fun NotSavedScreen(heart: WatchCopy.HeartLine?, ambient: Boolean, px: Px, now: Long, actions: LogActions) {
  val ink = logInk(ambient)
  TopBar(px, 28f, now, heart, ambient, ink.grey, ink)
  Column(
    Modifier.fillMaxSize().padding(top = px.dp(30f), start = px.dp(72f), end = px.dp(72f)),
    verticalArrangement = Arrangement.spacedBy(px.dp(8f), Alignment.CenterVertically),
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    StrokeIcon(px.dp(48f), "phoneOffIcon", "logPhoneOff", ink.grey, ink.acc) {
      strokeIcon(
        listOf(IconPath(PHONE_BODY, ink.grey), IconPath(PHONE_SPEAKER, ink.grey), IconPath(PHONE_SLASH, ink.acc)),
        1.6f,
        StrokeCap.Round,
        StrokeJoin.Miter,
      )
    }
    Line(WatchCopy.NOT_SAVED, px, 26f, if (ambient) FontWeight.SemiBold else FontWeight.ExtraBold, ink.ink, tag = "title", label = true)
    Line(WatchCopy.TICK_IT_ON_YOUR_PHONE, px, 20f, FontWeight.Medium, ink.grey, lineHeight = 1.3f, maxLines = 2, balanced = true, tag = "reason", label = true)
    val shape = RoundedCornerShape(px.dp(44f))
    Box(
      Modifier
        .padding(top = px.dp(14f))
        .size(px.dp(160f), px.dp(88f))
        .clip(shape)
        .background(ink.surf)
        .border(px.dp(2f), ink.line, shape)
        .then(if (ambient) Modifier else Modifier.clickable(onClick = actions.onOk))
        .testTag("ok"),
      contentAlignment = Alignment.Center,
    ) {
      Line(WatchCopy.OK, px, 22f, if (ambient) FontWeight.Medium else FontWeight.Bold, ink.ink, label = true)
    }
  }
}
