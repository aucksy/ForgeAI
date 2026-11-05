@file:OptIn(ExperimentalTextApi::class)

package com.forgeai.wear

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineBreak
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.TimeTextDefaults

/*
 * R-207 (29 Oct 2026): the watch rebuilt to the designer's "Ring" hand-off (direction 2a). Glance
 * only: no buttons during a workout (the old "Complete set" is gone); the only taps are the two
 * first-launch permission screens. Every size is the hand-off's px at 456 px, scaled by
 * screen width / 456 ([Px]). The screen is chosen from state alone ([ScreenSelector]); the render
 * test (WatchScreensRenderTest) photographs every screen and its ambient twin at 456 and 384 px.
 */

/** Manrope (OFL, Google Fonts), cut to static 500 / 600 / 700 / 800 (res/font, MANROPE-OFL.txt). */
internal val Manrope = FontFamily(
  Font(R.font.manrope_medium, FontWeight.Medium),
  Font(R.font.manrope_semibold, FontWeight.SemiBold),
  Font(R.font.manrope_bold, FontWeight.Bold),
  Font(R.font.manrope_extrabold, FontWeight.ExtraBold),
)

/** The hand-off's colour tokens, active and ambient. */
internal class Palette(
  val accent: Color,
  val text: Color,
  val grey: Color,
  val track: Color,
  val done: Color,
  val upcoming: Color,
)

internal val ActivePalette = Palette(
  accent = Color(0xFFF26B2A),
  text = Color(0xFFFFFFFF),
  grey = Color(0xFFA0A0A0),
  track = Color(0xFF242424),
  done = Color(0xFF6A6A6A),
  upcoming = Color(0xFF262626),
)

internal val AmbientPalette = Palette(
  accent = Color(0xFFB9592C),
  text = Color(0xFFC4C4C4),
  grey = Color(0xFF7C7C7C),
  track = Color(0xFF161616),
  done = Color(0xFF4A4A4A),
  upcoming = Color(0xFF1C1C1C),
)

/**
 * The gym's colour (BrandColour, already made readable on black) the screens draw in; null =
 * MettleUp orange. Set by [WatchScreen] from the phone's /forge/workout "accent".
 */
internal val LocalBrandAccent = staticCompositionLocalOf<Int?> { null }

/** The palette for [brand] (null = MettleUp's own): only the accent changes; ambient dims it. */
internal fun paletteFor(ambient: Boolean, brand: Int?): Palette {
  val base = if (ambient) AmbientPalette else ActivePalette
  if (brand == null) return base
  val accent = if (ambient) BrandColour.dim(brand) else brand
  return Palette(Color(accent), base.text, base.grey, base.track, base.done, base.upcoming)
}

@Composable
internal fun palette(ambient: Boolean): Palette {
  val brand = LocalBrandAccent.current
  return remember(ambient, brand) { paletteFor(ambient, brand) }
}

/** Ambient big numerals: no fill, a 1.5 px outline in this colour. */
private val OutlineInk = Color(0xFFD4D4D4)
private const val OUTLINE_PX = 1.5f

/** The clock's top edge, at 456 px. */
private const val CLOCK_TOP = 36f

/** The widest a one-line exercise name may be before it ends in "…". */
private const val NAME_MAX_WIDTH = 320f

internal val Pill = RoundedCornerShape(percent = 50)

/**
 * The hand-off's px to this screen: value x (screen width / 456). Text is converted without the
 * member's font scale: the layout is drawn to fit inside the ring at exactly these sizes.
 */
internal class Px(private val dpPerPx: Float, private val fontScale: Float) {
  fun dp(px: Float): Dp = (px * dpPerPx).dp
  fun sp(px: Float): TextUnit = (px * dpPerPx / fontScale).sp

  /**
   * Watch logging (3 Nov 2026, design "Largest system text"): labels grow with the member's text
   * size up to x1.24; the big numbers ([sp]) stay fixed, so nothing crosses the round edge.
   */
  val labelScale: Float = fontScale.coerceIn(1f, LABEL_SCALE_MAX)

  fun label(px: Float): TextUnit = (px * labelScale * dpPerPx / fontScale).sp

  companion object {
    const val LABEL_SCALE_MAX = 1.24f
  }
}

@Composable
private fun rememberPx(): Px {
  val widthDp = LocalConfiguration.current.screenWidthDp
  val fontScale = LocalDensity.current.fontScale
  return remember(widthDp, fontScale) { Px(RingMath.scale(widthDp.toFloat()), fontScale) }
}

/**
 * The whole watch screen, from state alone: MainActivity feeds it live, the render test feeds it
 * fixed states. [askHeartRate] / [askAlerts]: the first-launch permission screens are still to show.
 */
@Composable
internal fun WatchScreen(
  snap: WatchState.Snapshot,
  bpm: Double?,
  hrStatus: HeartRate.Status,
  hrAllowed: Boolean,
  ambient: Boolean,
  now: Long,
  askHeartRate: Boolean = false,
  askAlerts: Boolean = false,
  alertsAlarmOnly: Boolean = false,
  phoneConnected: Boolean = true,
  onAllowHeartRate: () -> Unit = {},
  onSkipHeartRate: () -> Unit = {},
  onAllowAlerts: () -> Unit = {},
  onSkipAlerts: () -> Unit = {},
  phoneAppMissing: Boolean = false,
  phoneAppRequest: PhoneApp.Request = PhoneApp.Request.IDLE,
  onGetPhoneApp: () -> Unit = {},
  log: LogUi = LogUi(),
  actions: LogActions = LogActions(),
) {
  val px = rememberPx()
  val pal = remember(ambient, snap.accent) { paletteFor(ambient, snap.accent) }
  // "Rest is over" fills the screen with the gym's colour (MettleUp orange without a gym).
  val fill = remember(snap.accent) { paletteFor(false, snap.accent).accent }
  // Watch logging (3 Nov 2026): heart rate is never asked for mid-workout (it shows only if allowed).
  val askHr = askHeartRate && !(snap.workoutActive && snap.logFlow)
  val kind = ScreenSelector.select(snap, askHr, askAlerts, phoneConnected, phoneAppMissing, now)
  // Watch logging: the logging screens replace the workout screens when the phone app takes sets.
  val logScreen = LogFlow.screen(kind, snap, log, now)
  val orange = !ambient && (if (logScreen != null) logScreen == LogScreen.REST_OVER else kind == WatchScreenKind.REST_IS_OVER)
  // The orange fills the round glass only (a square fill would paint the corners a round watch hides).
  val round = LocalConfiguration.current.isScreenRound
  CompositionLocalProvider(LocalBrandAccent provides snap.accent) {
  Box(
    Modifier
      .fillMaxSize()
      .background(Color.Black)
      .background(if (orange) fill else Color.Black, if (round) CircleShape else RectangleShape)
      .testTag("screen-${logScreen?.name ?: kind.name}"),
    contentAlignment = Alignment.Center,
  ) {
    val card = WatchCopy.card(snap)
    val heart = WatchCopy.heartLine(hrAllowed, hrStatus, bpm, ambient)
    // UAT 1 Nov 2026: the phone named no set ("All sets done", no exercise yet, an older phone app).
    val status = WatchCopy.status(snap)
    if (logScreen != null && logScreen != LogScreen.BETWEEN) {
      LogScreens(logScreen, snap, card, heart, ambient, px, now, log, actions, status)
      return@Box
    }
    when (kind) {
      WatchScreenKind.PERMISSION_HEART_RATE -> PermissionScreen(true, ambient, px, onAllowHeartRate, onSkipHeartRate)
      WatchScreenKind.PERMISSION_ALERTS -> PermissionScreen(false, ambient, px, onAllowAlerts, onSkipAlerts, alarmOnly = alertsAlarmOnly)
      WatchScreenKind.PHONE_NOT_CONNECTED -> PhoneNotConnectedScreen(ambient, px)
      WatchScreenKind.PHONE_APP_MISSING -> PhoneAppMissingScreen(ambient, px, phoneAppRequest, onGetPhoneApp)
      WatchScreenKind.NOTHING_OPEN -> NothingOpenScreen(ambient, px)
      WatchScreenKind.WORKOUT_SAVED -> WorkoutSavedScreen(ambient, px)
      WatchScreenKind.REST_TIMER -> snap.rest?.let { r ->
        RestTimerScreen(
          card,
          RestText.remaining(now, r.endsAt),
          RestText.fractionLeft(now, r.startedAt, r.endsAt),
          heart,
          ambient,
          px,
          status,
        )
      }
      WatchScreenKind.REST_IS_OVER ->
        // Watch logging: "Rest is over" shows about 5 s; with no set left to log, the between-rests
        // screen (its "All sets done" line) follows, never a blank screen.
        if (logScreen == LogScreen.BETWEEN) {
          BetweenRestsScreen(card, heart, ambient, px, status)
        } else {
          RestIsOverScreen(card, WatchCopy.overtime(now, snap.overAt), ambient, px, status)
        }
      WatchScreenKind.BETWEEN_RESTS -> BetweenRestsScreen(card, heart, ambient, px, status)
    }
    Clock(px, if (orange) Color.Black else pal.grey)
  }
  }
}

/**
 * The time, top centre (top edge 36 px, 20 px / 600, tabular). Wear's own TimeText time source
 * (the watch's 12 / 24 h setting, ticking each minute), drawn straight as the hand-off draws it.
 */
@Composable
private fun Clock(px: Px, color: Color) {
  val time = TimeTextDefaults.timeSource(TimeTextDefaults.timeFormat()).currentTime
  Box(Modifier.fillMaxSize().padding(top = px.dp(CLOCK_TOP)), contentAlignment = Alignment.TopCenter) {
    Line(time, px, 20f, FontWeight.SemiBold, color, spacing = 0.02f, tabular = true, tag = "clock")
  }
}

// ------------------------------------------------------------------ text

/**
 * One centred line in Manrope. [spacing] and [lineHeight] are in em (0 = the font's own);
 * [outlined]: ambient big numerals (no fill, a 1.5 px light outline); [maxWidth] px, then "…".
 */
@Composable
internal fun Line(
  text: String,
  px: Px,
  size: Float,
  weight: FontWeight,
  color: Color,
  modifier: Modifier = Modifier,
  spacing: Float = 0f,
  lineHeight: Float = 0f,
  tabular: Boolean = false,
  outlined: Boolean = false,
  maxWidth: Float = 0f,
  maxLines: Int = 1,
  balanced: Boolean = false,
  tag: String = "",
  label: Boolean = false,
  minSize: Float = 0f,
) {
  val outlinePx = with(LocalDensity.current) { px.dp(OUTLINE_PX).toPx() }
  // R-368 (owner, 5 Nov 2026: a long exercise name must never be cut off): with [minSize] set, text that does
  // not fit its lines steps down 1 px at a time to [minSize]; only past that does "…" appear.
  val fit = remember(text, size, minSize) { mutableFloatStateOf(size) }
  val shown = if (minSize > 0f) fit.floatValue else size
  var style = TextStyle(
    color = if (outlined) OutlineInk else color,
    fontSize = if (label) px.label(shown) else px.sp(shown),
    fontWeight = weight,
    fontFamily = Manrope,
    letterSpacing = spacing.em,
    textAlign = TextAlign.Center,
    fontFeatureSettings = if (tabular) "tnum" else null,
  )
  if (lineHeight > 0f) {
    // CSS line-height: the extra space split evenly above and below (no trimming).
    style = style.copy(
      lineHeight = lineHeight.em,
      lineHeightStyle = LineHeightStyle(LineHeightStyle.Alignment.Center, LineHeightStyle.Trim.None),
    )
  }
  if (outlined) style = style.copy(drawStyle = Stroke(width = outlinePx))
  if (balanced) style = style.copy(lineBreak = LineBreak.Heading)
  var m = modifier
  if (maxWidth > 0f) m = m.widthIn(max = px.dp(maxWidth))
  if (tag.isNotEmpty()) m = m.testTag(tag)
  BasicText(
    text,
    m,
    style,
    overflow = TextOverflow.Ellipsis,
    softWrap = maxLines > 1,
    maxLines = maxLines,
    onTextLayout = { r ->
      if (minSize > 0f && r.hasVisualOverflow && fit.floatValue > minSize) {
        fit.floatValue = maxOf(minSize, fit.floatValue - 1f)
      } else if (tag.isNotEmpty()) {
        TextFit.cut[tag] = r.hasVisualOverflow
      }
    },
  )
}

/** Test hook (R-368): for each tagged line, whether its last layout still ran out of room ("…"). */
internal object TextFit {
  val cut = mutableMapOf<String, Boolean>()
}

/**
 * "Next: Set 3 of 5 · Bench Press" on one line, or (the long-name rule) "Next: Set 3 of 5" over the
 * name. Nothing when the phone sent no set line.
 */
@Composable
private fun NextSetLines(
  card: SetCard,
  long: Boolean,
  px: Px,
  shortColor: Color,
  headerColor: Color,
  nameColor: Color,
  nameWeight: FontWeight,
  gap: Float,
  oneLineSize: Float = 22f,
  twoLineSize: Float = 20f,
) {
  val oneLine = WatchCopy.nextSetLine(card) ?: return
  if (!long) {
    Line(oneLine, px, oneLineSize, FontWeight.Bold, shortColor, tabular = true, tag = "nextSet")
    return
  }
  Line(WatchCopy.nextSetHeader(card) ?: return, px, twoLineSize, FontWeight.SemiBold, headerColor, tabular = true, tag = "nextSet")
  if (gap > 0f) Spacer(Modifier.height(px.dp(gap)))
  Line(card.exercise, px, twoLineSize, nameWeight, nameColor, maxWidth = NAME_MAX_WIDTH, tag = "exercise")
}

/** The widest a status line may be inside the ring, and on a screen without one (design px). */
private const val STATUS_MAX_WIDTH_RING = 300f
private const val STATUS_MAX_WIDTH = 320f

/** UAT 1 Nov 2026: what the phone says when it names no set ([WatchCopy.statusLine]), up to two lines. */
@Composable
private fun StatusLine(text: String, px: Px, color: Color, maxWidth: Float, size: Float = 20f) {
  Line(text, px, size, FontWeight.Bold, color, lineHeight = 1.25f, maxWidth = maxWidth, maxLines = 2, balanced = true, tag = "status")
}

// ------------------------------------------------------------------ ring and segments

private fun DrawScope.ringBox(): Pair<Offset, Size> {
  val k = size.minDimension / RingMath.DESIGN_PX
  val r = RingMath.RADIUS * k
  return Offset(center.x - r, center.y - r) to Size(2f * r, 2f * r)
}

private fun DrawScope.ringStroke(ambient: Boolean): Float =
  (if (ambient) RingMath.AMBIENT_STROKE else RingMath.STROKE) * (size.minDimension / RingMath.DESIGN_PX)

/** The rest ring: a full track, and the arc left from 12 o'clock clockwise with round caps. */
@Composable
private fun RestRing(fractionLeft: Float, pal: Palette, ambient: Boolean) {
  Canvas(Modifier.fillMaxSize().testTag("ring")) {
    val (topLeft, box) = ringBox()
    val w = ringStroke(ambient)
    drawArc(pal.track, 0f, 360f, false, topLeft = topLeft, size = box, style = Stroke(width = w))
    val sweep = RingMath.restSweep(fractionLeft)
    if (sweep > 0f) {
      drawArc(pal.accent, RingMath.START_ANGLE, sweep, false, topLeft = topLeft, size = box, style = Stroke(width = w, cap = StrokeCap.Round))
    }
  }
}

/** Ambient "Rest is over": the accent outline ring (3 px). */
@Composable
private fun OutlineRing(pal: Palette) {
  Canvas(Modifier.fillMaxSize()) {
    val (topLeft, box) = ringBox()
    drawArc(pal.accent, 0f, 360f, false, topLeft = topLeft, size = box, style = Stroke(width = ringStroke(true)))
  }
}

/** One arc per set: done grey, current accent, upcoming dark (drawn upcoming, done, current). */
@Composable
private fun SetSegments(card: SetCard, pal: Palette, ambient: Boolean) {
  val segments = remember(card.setIndex, card.setCount) { RingMath.segments(card.setIndex, card.setCount) }
  if (segments.isEmpty()) return
  Canvas(Modifier.fillMaxSize().testTag("segments")) {
    val (topLeft, box) = ringBox()
    val stroke = Stroke(width = ringStroke(ambient), cap = StrokeCap.Round)
    for (state in listOf(RingMath.SegmentState.UPCOMING, RingMath.SegmentState.DONE, RingMath.SegmentState.CURRENT)) {
      val color = when (state) {
        RingMath.SegmentState.DONE -> pal.done
        RingMath.SegmentState.CURRENT -> pal.accent
        RingMath.SegmentState.UPCOMING -> pal.upcoming
      }
      for (s in segments) {
        if (s.state == state && s.sweep > 0f) {
          drawArc(color, s.startAngle, s.sweep, false, topLeft = topLeft, size = box, style = stroke)
        }
      }
    }
  }
}

// ------------------------------------------------------------------ 1. rest timer

/**
 * R-237 sizes (owner's yes, 1 Nov 2026): the rest timer with bigger words under a smaller countdown.
 * Countdown 128 -> 96 px (long-name form 112 -> 84), the column moved up 16 px, the next-set line
 * 22 -> 26 px (two-line form 20 -> 24), the Previous / Next lines 20 -> 24 px. Only this screen:
 * "Rest is over" and between rests keep the hand-off's sizes.
 */
internal object RestTimerSizes {
  const val COUNTDOWN = 96f
  const val COUNTDOWN_LONG = 84f

  /** Bottom padding: the column's centre sits 8 px above the screen's (the hand-off: 8 px below). */
  const val LIFT = 16f
  const val NEXT_SET = 26f
  const val NEXT_SET_TWO_LINES = 24f
  const val PREVIOUS_NEXT = 24f
  const val STATUS = 22f
}

/** Rest timer (screen 1; 4b without the heart line; 5a with "♥ —"). */
@Composable
internal fun RestTimerScreen(
  card: SetCard,
  countdown: String,
  fractionLeft: Float,
  heart: WatchCopy.HeartLine?,
  ambient: Boolean,
  px: Px,
  status: String? = null,
) {
  val pal = palette(ambient)
  val long = WatchCopy.isLongName(card)
  Box(Modifier.fillMaxSize()) {
    RestRing(fractionLeft, pal, ambient)
    Column(
      Modifier.fillMaxSize().padding(bottom = px.dp(RestTimerSizes.LIFT)),
      verticalArrangement = Arrangement.Center,
      horizontalAlignment = Alignment.CenterHorizontally,
    ) {
      if (heart != null) {
        Line(heart.text, px, 24f, FontWeight.Bold, if (heart.waiting) pal.grey else pal.text, tabular = true, tag = "heart")
      }
      Line(
        countdown,
        px,
        if (long) RestTimerSizes.COUNTDOWN_LONG else RestTimerSizes.COUNTDOWN,
        FontWeight.ExtraBold,
        pal.text,
        spacing = -0.045f,
        lineHeight = 1f,
        tabular = true,
        outlined = ambient,
        tag = "countdown",
      )
      Spacer(Modifier.height(px.dp(10f)))
      NextSetLines(
        card,
        long,
        px,
        pal.text,
        pal.grey,
        pal.text,
        FontWeight.Bold,
        gap = 0f,
        oneLineSize = RestTimerSizes.NEXT_SET,
        twoLineSize = RestTimerSizes.NEXT_SET_TWO_LINES,
      )
      status?.let { StatusLine(it, px, pal.text, maxWidth = STATUS_MAX_WIDTH_RING, size = RestTimerSizes.STATUS) }
      card.previous?.let {
        Spacer(Modifier.height(px.dp(6f)))
        Line(it, px, RestTimerSizes.PREVIOUS_NEXT, FontWeight.Medium, pal.grey, tabular = true, tag = "previous")
      }
      card.next?.let {
        Spacer(Modifier.height(px.dp(2f)))
        Line(it, px, RestTimerSizes.PREVIOUS_NEXT, FontWeight.ExtraBold, pal.accent, tabular = true, tag = "next")
      }
    }
  }
}

// ------------------------------------------------------------------ 1b. rest is over

/** Rest is over (screen 1b): the whole screen accent, all text black; ambient: black, an outline ring. */
@Composable
internal fun RestIsOverScreen(card: SetCard, overtime: String, ambient: Boolean, px: Px, status: String? = null) {
  val pal = palette(ambient)
  val ink = if (ambient) pal.text else Color.Black
  val nextInk = if (ambient) pal.accent else Color.Black
  val long = WatchCopy.isLongName(card)
  Box(Modifier.fillMaxSize()) {
    if (ambient) OutlineRing(pal)
    Column(
      Modifier.fillMaxSize(),
      verticalArrangement = Arrangement.spacedBy(px.dp(6f), Alignment.CenterVertically),
      horizontalAlignment = Alignment.CenterHorizontally,
    ) {
      Line(overtime, px, 34f, FontWeight.ExtraBold, ink, Modifier.padding(top = px.dp(18f)), spacing = -0.02f, tabular = true, tag = "overtime")
      Line(
        WatchCopy.REST_IS_OVER,
        px,
        54f,
        FontWeight.ExtraBold,
        Color.Black,
        Modifier.padding(bottom = px.dp(10f)),
        spacing = -0.03f,
        lineHeight = 1.05f,
        outlined = ambient,
        tag = "restIsOver",
      )
      // The column's 6 px gap also sits between the two long-name lines.
      NextSetLines(card, long, px, ink, ink, ink, FontWeight.ExtraBold, gap = 0f)
      status?.let { StatusLine(it, px, ink, maxWidth = STATUS_MAX_WIDTH) }
      card.previous?.let { Line(it, px, 20f, FontWeight.Medium, ink, tabular = true, tag = "previous") }
      card.next?.let { Line(it, px, 20f, FontWeight.ExtraBold, nextInk, tabular = true, tag = "next") }
    }
  }
}

// ------------------------------------------------------------------ 2. between rests

/** Between rests (screen 2): a workout open, no rest running. View only; set segments on the ring. */
@Composable
internal fun BetweenRestsScreen(card: SetCard, heart: WatchCopy.HeartLine?, ambient: Boolean, px: Px, status: String? = null) {
  val pal = palette(ambient)
  Box(Modifier.fillMaxSize()) {
    SetSegments(card, pal, ambient)
    Column(
      Modifier.fillMaxSize().padding(top = px.dp(14f)),
      verticalArrangement = Arrangement.Center,
      horizontalAlignment = Alignment.CenterHorizontally,
    ) {
      if (card.exercise.isNotEmpty()) {
        Line(
          card.exercise,
          px,
          if (WatchCopy.isLongBetweenName(card.exercise)) 21f else 26f,
          FontWeight.ExtraBold,
          pal.text,
          maxWidth = NAME_MAX_WIDTH,
          tag = "exercise",
        )
      }
      val number = WatchCopy.setNumber(card)
      val of = WatchCopy.setOf(card)
      if (number != null && of != null) {
        Spacer(Modifier.height(px.dp(2f)))
        Row(verticalAlignment = Alignment.Bottom) {
          Line(
            number,
            px,
            96f,
            FontWeight.ExtraBold,
            pal.text,
            Modifier.alignByBaseline(),
            spacing = -0.04f,
            lineHeight = 1.05f,
            tabular = true,
            outlined = ambient,
            tag = "setNumber",
          )
          Spacer(Modifier.width(px.dp(12f)))
          Line(of, px, 36f, FontWeight.Bold, pal.grey, Modifier.alignByBaseline(), tabular = true, tag = "setOf")
        }
        Spacer(Modifier.height(px.dp(8f)))
      } else if (card.setLabel.isNotEmpty()) {
        // UAT 1 Nov 2026: "Warm-up 1 of 2" (no "Set N of M" to split): the label itself, not nothing.
        Spacer(Modifier.height(px.dp(4f)))
        Line(card.setLabel, px, 36f, FontWeight.Bold, pal.text, maxWidth = NAME_MAX_WIDTH, tabular = true, tag = "setLabel")
        Spacer(Modifier.height(px.dp(8f)))
      }
      status?.let {
        Spacer(Modifier.height(px.dp(8f)))
        StatusLine(it, px, pal.text, maxWidth = STATUS_MAX_WIDTH_RING)
      }
      card.previous?.let { Line(it, px, 20f, FontWeight.Medium, pal.grey, tabular = true, tag = "previous") }
      card.next?.let {
        Spacer(Modifier.height(px.dp(2f)))
        Line(it, px, 20f, FontWeight.ExtraBold, pal.accent, tabular = true, tag = "next")
      }
      if (heart != null) {
        Spacer(Modifier.height(px.dp(12f)))
        Line(heart.text, px, 22f, FontWeight.Bold, if (heart.waiting) pal.grey else pal.text, tabular = true, tag = "heart")
      }
    }
  }
}

// ------------------------------------------------------------------ icons (24 px viewBox, stroked)

internal const val PHONE_BODY = "M9.5 2.5h5a2.5 2.5 0 0 1 2.5 2.5v14a2.5 2.5 0 0 1 -2.5 2.5h-5a2.5 2.5 0 0 1 -2.5 -2.5v-14a2.5 2.5 0 0 1 2.5 -2.5z"
internal const val PHONE_SPEAKER = "M11 18h2"
internal const val PHONE_SLASH = "M3.5 3.5l17 17"
private const val HEART_OUTLINE = "M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.3a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"
private const val BELL_BODY = "M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z"
private const val BELL_CLAPPER = "M10 20.5a2 2 0 0 0 4 0"
private const val CHECK_CIRCLE = "M12 2.75a9.25 9.25 0 1 1 0 18.5a9.25 9.25 0 1 1 0 -18.5z"
private const val CHECK_MARK = "M7.5 12.4l3 3l6 -6.3"

internal class IconPath(val d: String, val color: Color)

internal fun strokeIcon(paths: List<IconPath>, width: Float, cap: StrokeCap, join: StrokeJoin): ImageVector {
  val b = ImageVector.Builder(defaultWidth = 24.dp, defaultHeight = 24.dp, viewportWidth = 24f, viewportHeight = 24f)
  for (p in paths) {
    b.addPath(
      pathData = addPathNodes(p.d),
      stroke = SolidColor(p.color),
      strokeLineWidth = width,
      strokeLineCap = cap,
      strokeLineJoin = join,
    )
  }
  return b.build()
}

@Composable
internal fun StrokeIcon(size: Dp, tag: String, vararg key: Any, build: () -> ImageVector) {
  val vector = remember(*key) { build() }
  Image(rememberVectorPainter(vector), contentDescription = null, modifier = Modifier.size(size).testTag(tag))
}

// ------------------------------------------------------------------ 3. nothing open

/** Nothing open (screen 3). */
@Composable
internal fun NothingOpenScreen(ambient: Boolean, px: Px) {
  val pal = palette(ambient)
  Column(
    Modifier.fillMaxSize().padding(horizontal = px.dp(72f)),
    verticalArrangement = Arrangement.spacedBy(px.dp(14f), Alignment.CenterVertically),
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    StrokeIcon(px.dp(44f), "phoneIcon", "phone", pal.accent) {
      strokeIcon(listOf(IconPath(PHONE_BODY, pal.accent), IconPath(PHONE_SPEAKER, pal.accent)), 1.6f, StrokeCap.Round, StrokeJoin.Miter)
    }
    Line(WatchCopy.START_A_WORKOUT, px, 26f, FontWeight.ExtraBold, pal.text, lineHeight = 1.15f, maxLines = 3, balanced = true, tag = "title")
    // UAT 1 Nov 2026: what to open, and what then shows here.
    Line(WatchCopy.NOTHING_OPEN_HINT, px, 20f, FontWeight.Medium, pal.grey, lineHeight = 1.3f, maxLines = 3, balanced = true, tag = "reason")
  }
}

// ------------------------------------------------------------------ R-269: workout saved

/** Right after Finish on the phone, about 4 s ([WorkoutSaved]): a tick, "Workout saved", one line. */
@Composable
internal fun WorkoutSavedScreen(ambient: Boolean, px: Px) {
  val pal = palette(ambient)
  Column(
    Modifier.fillMaxSize().padding(horizontal = px.dp(72f)),
    verticalArrangement = Arrangement.spacedBy(px.dp(14f), Alignment.CenterVertically),
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    StrokeIcon(px.dp(56f), "savedIcon", "saved", pal.accent) {
      strokeIcon(listOf(IconPath(CHECK_CIRCLE, pal.accent), IconPath(CHECK_MARK, pal.accent)), 1.8f, StrokeCap.Round, StrokeJoin.Round)
    }
    Line(WatchCopy.WORKOUT_SAVED, px, 30f, FontWeight.ExtraBold, pal.text, lineHeight = 1.15f, maxLines = 2, balanced = true, tag = "title")
    Line(WatchCopy.WORKOUT_SAVED_REASON, px, 20f, FontWeight.Medium, pal.grey, lineHeight = 1.3f, maxLines = 3, balanced = true, tag = "reason")
  }
}

// ------------------------------------------------------------------ R-269: no MettleUp on the phone

/**
 * The phone is connected but MettleUp is not on it ([PhoneApp.missing]). "Open on phone" opens the
 * phone's Play Store on MettleUp (MainActivity, RemoteActivityHelper); the line under the title then
 * says to look at the phone, or that the phone did not answer ([PhoneApp.reason]).
 */
@Composable
internal fun PhoneAppMissingScreen(ambient: Boolean, px: Px, request: PhoneApp.Request, onOpen: () -> Unit) {
  val pal = palette(ambient)
  Column(
    Modifier.fillMaxSize().padding(top = px.dp(8f), start = px.dp(64f), end = px.dp(64f)),
    verticalArrangement = Arrangement.spacedBy(px.dp(10f), Alignment.CenterVertically),
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    StrokeIcon(px.dp(38f), "phoneIcon", "phone", pal.accent) {
      strokeIcon(listOf(IconPath(PHONE_BODY, pal.accent), IconPath(PHONE_SPEAKER, pal.accent)), 1.6f, StrokeCap.Round, StrokeJoin.Miter)
    }
    Line(WatchCopy.GET_PHONE_APP, px, 26f, FontWeight.ExtraBold, pal.text, lineHeight = 1.15f, maxLines = 3, balanced = true, tag = "title")
    Line(PhoneApp.reason(request), px, 20f, FontWeight.Medium, pal.grey, lineHeight = 1.3f, maxLines = 3, balanced = true, tag = "reason")
    // Ambient: an outline button with accent text, and no taps (as on the permission screens).
    Box(
      Modifier
        .padding(top = px.dp(4f))
        .height(px.dp(52f))
        .widthIn(min = px.dp(184f))
        .clip(Pill)
        .background(if (ambient) Color.Transparent else pal.accent)
        .border(px.dp(2f), pal.accent, Pill)
        .then(if (ambient) Modifier else Modifier.clickable(onClick = onOpen))
        .padding(horizontal = px.dp(28f))
        .testTag("openOnPhone"),
      contentAlignment = Alignment.Center,
    ) {
      Line(WatchCopy.OPEN_ON_PHONE, px, 20f, FontWeight.Bold, if (ambient) pal.accent else Color.Black)
    }
  }
}

// ------------------------------------------------------------------ 4. permissions (the only taps)

/** First launch (screen 4): heart rate ("1 of 2") or rest alerts ("2 of 2"). Allow / Not now. */
@Composable
internal fun PermissionScreen(
  heartRate: Boolean,
  ambient: Boolean,
  px: Px,
  onAllow: () -> Unit,
  onNotNow: () -> Unit,
  alarmOnly: Boolean = false,
) {
  val pal = palette(ambient)
  Column(
    Modifier.fillMaxSize().padding(top = px.dp(12f), start = px.dp(64f), end = px.dp(64f)),
    verticalArrangement = Arrangement.spacedBy(px.dp(8f), Alignment.CenterVertically),
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    Line(if (heartRate) WatchCopy.STEP_HEART_RATE else WatchCopy.STEP_ALERTS, px, 15f, FontWeight.SemiBold, pal.grey, tabular = true, tag = "step")
    if (heartRate) {
      StrokeIcon(px.dp(34f), "heartIcon", "heart", pal.accent) {
        strokeIcon(listOf(IconPath(HEART_OUTLINE, pal.accent)), 1.7f, StrokeCap.Butt, StrokeJoin.Round)
      }
    } else {
      StrokeIcon(px.dp(34f), "bellIcon", "bell", pal.accent) {
        strokeIcon(listOf(IconPath(BELL_BODY, pal.accent), IconPath(BELL_CLAPPER, pal.accent)), 1.7f, StrokeCap.Round, StrokeJoin.Round)
      }
    }
    Line(if (heartRate) WatchCopy.TITLE_HEART_RATE else WatchCopy.TITLE_ALERTS, px, 26f, FontWeight.ExtraBold, pal.text, lineHeight = 1.1f, tag = "title")
    Line(
      when {
        heartRate -> WatchCopy.REASON_HEART_RATE
        alarmOnly -> WatchCopy.REASON_ALARMS
        else -> WatchCopy.REASON_ALERTS
      },
      px,
      20f,
      FontWeight.Medium,
      pal.grey,
      lineHeight = 1.35f,
      maxLines = 3,
      balanced = true,
      tag = "reason",
    )
    // Ambient: no fills, the button an outline with accent text, and no taps.
    Box(
      Modifier
        .padding(top = px.dp(8f))
        .height(px.dp(52f))
        .widthIn(min = px.dp(184f))
        .clip(Pill)
        .background(if (ambient) Color.Transparent else pal.accent)
        .border(px.dp(2f), pal.accent, Pill)
        .then(if (ambient) Modifier else Modifier.clickable(onClick = onAllow))
        .padding(horizontal = px.dp(28f))
        .testTag("allow"),
      contentAlignment = Alignment.Center,
    ) {
      // UAT 1 Nov 2026: the Alarms & reminders step opens the watch's settings, and says so.
      Line(if (alarmOnly && !heartRate) WatchCopy.OPEN_SETTINGS else WatchCopy.ALLOW, px, 20f, FontWeight.Bold, if (ambient) pal.accent else Color.Black)
    }
    Box(
      Modifier
        .height(px.dp(46f))
        .clip(Pill)
        .then(if (ambient) Modifier else Modifier.clickable(onClick = onNotNow))
        .padding(horizontal = px.dp(24f))
        .testTag("notNow"),
      contentAlignment = Alignment.Center,
    ) {
      Line(WatchCopy.NOT_NOW, px, 20f, FontWeight.SemiBold, pal.text)
    }
  }
}

// ------------------------------------------------------------------ 5b. phone not connected

/** Phone not connected (screen 5b). */
@Composable
internal fun PhoneNotConnectedScreen(ambient: Boolean, px: Px) {
  val pal = palette(ambient)
  Column(
    Modifier.fillMaxSize().padding(horizontal = px.dp(70f)),
    verticalArrangement = Arrangement.spacedBy(px.dp(10f), Alignment.CenterVertically),
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    StrokeIcon(px.dp(44f), "phoneOffIcon", "phoneOff", pal.grey, pal.accent) {
      strokeIcon(
        listOf(IconPath(PHONE_BODY, pal.grey), IconPath(PHONE_SPEAKER, pal.grey), IconPath(PHONE_SLASH, pal.accent)),
        1.6f,
        StrokeCap.Round,
        StrokeJoin.Miter,
      )
    }
    Line(WatchCopy.PHONE_NOT_CONNECTED, px, 26f, FontWeight.ExtraBold, pal.text, lineHeight = 1.15f, maxLines = 2, balanced = true, tag = "title")
    Line(WatchCopy.KEEP_PHONE_NEAR, px, 20f, FontWeight.Medium, pal.grey, lineHeight = 1.3f, maxLines = 3, balanced = true, tag = "reason")
  }
}
