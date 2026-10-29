package com.forgeai.wear

/**
 * R-207 (29 Oct 2026): the "Ring" watch design (design hand-off 2a) as pure functions, so the JVM
 * tests cover the maths and the screen choice without rendering anything. No Android types here.
 *
 * All sizes are design px on the 456 px round canvas; the screens scale them by
 * screen width / 456 ([RingMath.DESIGN_PX]).
 */

/** Every screen the watch can show (hand-off README, "Screens"). */
enum class WatchScreenKind {
  PERMISSION_HEART_RATE,
  PERMISSION_ALERTS,
  PHONE_NOT_CONNECTED,
  NOTHING_OPEN,
  REST_TIMER,
  REST_IS_OVER,
  BETWEEN_RESTS,
}

/** The hand-off's "Screen choice", in its order. */
object ScreenSelector {
  fun select(
    askHeartRate: Boolean,
    askAlerts: Boolean,
    phoneConnected: Boolean,
    workoutOpen: Boolean,
    restRunning: Boolean,
    restOver: Boolean,
  ): WatchScreenKind = when {
    // 1. Unasked permissions: heart rate first, then alerts.
    askHeartRate -> WatchScreenKind.PERMISSION_HEART_RATE
    askAlerts -> WatchScreenKind.PERMISSION_ALERTS
    // 2. Phone disconnected.
    !phoneConnected -> WatchScreenKind.PHONE_NOT_CONNECTED
    // 3. No workout open.
    !workoutOpen -> WatchScreenKind.NOTHING_OPEN
    // 4. Rest running.
    restRunning -> WatchScreenKind.REST_TIMER
    // 5. Rest ended and the set after it not logged on the phone yet.
    restOver -> WatchScreenKind.REST_IS_OVER
    // 6. Otherwise.
    else -> WatchScreenKind.BETWEEN_RESTS
  }

  /** The same, from what the phone published ([WatchState.Snapshot]). */
  fun select(
    snap: WatchState.Snapshot,
    askHeartRate: Boolean,
    askAlerts: Boolean,
    phoneConnected: Boolean,
  ): WatchScreenKind = select(
    askHeartRate = askHeartRate,
    askAlerts = askAlerts,
    phoneConnected = phoneConnected,
    workoutOpen = snap.workoutActive,
    restRunning = snap.rest != null,
    restOver = snap.overAt > 0L,
  )
}

/** Ring and set-segment geometry (WatchScreen.dc.html, direction "a"). Angles are Compose's: 0 = 3 o'clock, clockwise. */
object RingMath {
  /** The design canvas: a 456 x 456 px round screen. */
  const val DESIGN_PX = 456f

  /** Ring centre radius at 456 px (the outer edge sits 13 px from the screen edge). */
  const val RADIUS = 208f

  /** Ring and segment stroke at 456 px. */
  const val STROKE = 14f

  /** The same in ambient mode. */
  const val AMBIENT_STROKE = 3f

  /** 12 o'clock. */
  const val START_ANGLE = -90f

  /** Gap centred on every boundary between two set segments. */
  const val SEGMENT_GAP = 10f

  /** Design px to this screen's px (or dp, given its width in dp). */
  fun scale(screenWidth: Float): Float = screenWidth / DESIGN_PX

  /**
   * The rest arc: starts at 12 o'clock and runs clockwise for the share of the rest still left,
   * shrinking back toward 12 o'clock as the rest runs out.
   */
  fun restSweep(fractionLeft: Float): Float {
    if (fractionLeft.isNaN()) return 0f
    return 360f * fractionLeft.coerceIn(0f, 1f)
  }

  enum class SegmentState { DONE, CURRENT, UPCOMING }

  data class Segment(val startAngle: Float, val sweep: Float, val state: SegmentState)

  /**
   * One arc per set: each 360/n - 10 degrees, a 10 degree gap centred on every boundary, the first
   * arc starting at 12 o'clock + 5 degrees. [setIndex] is 1-based (the set to do now): earlier sets
   * are done, later ones upcoming. Empty when the set count is unknown.
   */
  fun segments(setIndex: Int, setCount: Int): List<Segment> {
    if (setCount <= 0) return emptyList()
    val each = 360f / setCount
    val sweep = (each - SEGMENT_GAP).coerceAtLeast(0f)
    val current = setIndex.coerceIn(1, setCount) - 1
    return (0 until setCount).map { i ->
      val state = when {
        i < current -> SegmentState.DONE
        i == current -> SegmentState.CURRENT
        else -> SegmentState.UPCOMING
      }
      Segment(START_ANGLE + i * each + SEGMENT_GAP / 2f, sweep, state)
    }
  }
}

/**
 * The next set as the screens show it: built from the phone's /forge/workout lines ([NextSet]).
 * [setLabel] is the phone's own "Set 3 of 5"; [setIndex] / [setCount] are read from it (0 = unknown).
 */
data class SetCard(
  val exercise: String,
  val setLabel: String,
  val setIndex: Int,
  val setCount: Int,
  val previous: String?,
  val next: String?,
)

/** Every word the watch shows, exactly as the hand-off writes it. */
object WatchCopy {
  const val HEART = "♥"
  const val REST_IS_OVER = "Rest is over"
  const val START_A_WORKOUT = "Start a workout on your phone"
  const val PHONE_NOT_CONNECTED = "Phone not connected"
  const val KEEP_PHONE_NEAR = "Keep your phone near you."
  const val ALLOW = "Allow"
  const val NOT_NOW = "Not now"
  const val STEP_HEART_RATE = "1 of 2"
  const val STEP_ALERTS = "2 of 2"
  const val TITLE_HEART_RATE = "Heart rate"
  const val TITLE_ALERTS = "Rest alerts"
  const val REASON_HEART_RATE = "Shows how hard your heart works while you rest."
  const val REASON_ALERTS = "Your watch buzzes when rest is over."

  /** "Next: Set 3 of 5 · Bench Press" longer than this splits into two lines. */
  const val LONG_NAME_CHARS = 30

  /** A between-rests exercise name longer than this drops from 26 px to 21 px. */
  const val BETWEEN_NAME_CHARS = 18

  private val SET_OF = Regex("Set +([0-9]+) +of +([0-9]+)")

  /** "Set 3 of 5" -> (3, 5); (0, 0) when the phone sent no set line (or another one). */
  fun parseSet(label: String): Pair<Int, Int> {
    val m = SET_OF.find(label) ?: return 0 to 0
    val i = m.groupValues[1].toIntOrNull() ?: return 0 to 0
    val n = m.groupValues[2].toIntOrNull() ?: return 0 to 0
    if (n <= 0) return 0 to 0
    return i to n
  }

  fun card(snap: WatchState.Snapshot): SetCard = card(snap.title, snap.next)

  fun card(exercise: String, next: NextSet): SetCard {
    val label = next.set.trim()
    val (i, n) = parseSet(label)
    return SetCard(
      exercise = exercise.trim(),
      setLabel = label,
      setIndex = i,
      setCount = n,
      previous = next.last.trim().ifEmpty { null }?.let { "Previous $it" },
      next = next.goal.trim().ifEmpty { null }?.let { "Next $it" },
    )
  }

  /** "Next: Set 3 of 5"; null when the phone sent no set line. */
  fun nextSetHeader(c: SetCard): String? = if (c.setLabel.isEmpty()) null else "Next: ${c.setLabel}"

  /** "Next: Set 3 of 5 · Bench Press" (the one-line form). */
  fun nextSetLine(c: SetCard): String? {
    val head = nextSetHeader(c) ?: return null
    return if (c.exercise.isEmpty()) head else "$head · ${c.exercise}"
  }

  /** The long-name rule: the one-line form is longer than 30 characters. */
  fun isLongName(c: SetCard): Boolean = (nextSetLine(c)?.length ?: 0) > LONG_NAME_CHARS

  /** Between rests: the name drops to 21 px past 18 characters. */
  fun isLongBetweenName(name: String): Boolean = name.length > BETWEEN_NAME_CHARS

  /** "Set 2" and "of 4" (between rests); null when the set is unknown. */
  fun setNumber(c: SetCard): String? = if (c.setCount > 0) "Set ${c.setIndex}" else null

  fun setOf(c: SetCard): String? = if (c.setCount > 0) "of ${c.setCount}" else null

  /** The overtime timer on "Rest is over": "−0:12" (a minus sign, U+2212), counting up from −0:00. */
  fun overtime(nowMs: Long, overAtMs: Long): String {
    val sec = ((nowMs - overAtMs).coerceAtLeast(0L)) / 1000L
    return "−" + RestText.clock(sec)
  }

  /** The heart-rate line: [text] is "♥ 132", or "♥ —" while [waiting] for the first reading. */
  data class HeartLine(val text: String, val waiting: Boolean)

  /**
   * Null (no line, the column re-centres) when the member said no, the watch has no sensor, or the
   * screen is in ambient (no live heart rate there). Otherwise the reading, or "♥ —" until one comes.
   */
  fun heartLine(allowed: Boolean, status: HeartRate.Status, bpm: Double?, ambient: Boolean): HeartLine? {
    if (ambient || !allowed || status == HeartRate.Status.NO_SENSOR) return null
    val value = RestText.bpm(bpm)
    return HeartLine("$HEART $value", waiting = value == "—")
  }
}
