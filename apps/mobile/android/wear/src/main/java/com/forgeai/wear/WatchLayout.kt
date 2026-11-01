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
  /** R-269: the phone is connected but has no MettleUp app ([PhoneApp.missing]). */
  PHONE_APP_MISSING,
  NOTHING_OPEN,
  /** R-269: the member just tapped Finish on the phone ([WorkoutSaved], about 4 s). */
  WORKOUT_SAVED,
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
    phoneAppMissing: Boolean = false,
    saved: Boolean = false,
  ): WatchScreenKind = when {
    // 1. Unasked permissions: heart rate first, then alerts.
    askHeartRate -> WatchScreenKind.PERMISSION_HEART_RATE
    askAlerts -> WatchScreenKind.PERMISSION_ALERTS
    // 2. Rest running, then rest ended and the set after it not logged yet. Before "phone not
    //    connected" (0.61.0 review): the watch runs the countdown and the buzz itself, so a phone left
    //    in a locker mid-rest must not hide them.
    workoutOpen && restRunning -> WatchScreenKind.REST_TIMER
    workoutOpen && restOver -> WatchScreenKind.REST_IS_OVER
    // R-269: the workout was just saved on the phone: "Workout saved" for a few seconds.
    !workoutOpen && saved -> WatchScreenKind.WORKOUT_SAVED
    // 3. Phone disconnected.
    !phoneConnected -> WatchScreenKind.PHONE_NOT_CONNECTED
    // R-269: connected, but MettleUp is not on the phone: say how to get it.
    !workoutOpen && phoneAppMissing -> WatchScreenKind.PHONE_APP_MISSING
    // 4. No workout open.
    !workoutOpen -> WatchScreenKind.NOTHING_OPEN
    // 6. Otherwise.
    else -> WatchScreenKind.BETWEEN_RESTS
  }

  /** The same, from what the phone published ([WatchState.Snapshot]). */
  fun select(
    snap: WatchState.Snapshot,
    askHeartRate: Boolean,
    askAlerts: Boolean,
    phoneConnected: Boolean,
    phoneAppMissing: Boolean = false,
    now: Long = 0L,
  ): WatchScreenKind = select(
    askHeartRate = askHeartRate,
    askAlerts = askAlerts,
    phoneConnected = phoneConnected,
    workoutOpen = snap.workoutActive,
    restRunning = snap.rest != null,
    restOver = snap.overAt > 0L,
    phoneAppMissing = phoneAppMissing,
    saved = WorkoutSaved.showing(snap.savedAt, now),
  )
}

/**
 * R-269 (1 Nov 2026, owner's UAT list): after Finish on the phone the watch says "Workout saved" for
 * about [SHOW_MS], then the normal "Start a workout on your phone". Before, it jumped straight back,
 * so the member could not tell a saved workout from a lost phone link.
 */
object WorkoutSaved {
  const val SHOW_MS = 4_000L

  /** [savedAt] = when the phone's "saved" reached the watch (0 = none). PURE. */
  fun showing(savedAt: Long, now: Long): Boolean = savedAt > 0L && now - savedAt in 0L until SHOW_MS

  /** How long the screen still has to show (0 = gone). PURE. */
  fun left(savedAt: Long, now: Long): Long = if (showing(savedAt, now)) SHOW_MS - (now - savedAt) else 0L

  /**
   * Does this /forge/workout item mean "just saved"? Only a workout the watch had open ([wasActive])
   * that the phone closed with saved = true. A discard sends saved = false; an older phone app never
   * sends it, so its members keep the old jump straight back. PURE.
   */
  fun justSaved(active: Boolean, saved: Boolean, wasActive: Boolean): Boolean = !active && saved && wasActive
}

/**
 * R-269 (1 Nov 2026): is MettleUp on the phone? The phone app declares the capability [CAPABILITY]
 * (modules/forge-rest/android/src/main/res/values/wear.xml), the mirror of this app's
 * "forgeai_watch_app". A phone app older than that declares nothing, so a phone that already sent
 * this watch a workout ([seenBefore]) counts as having it.
 */
object PhoneApp {
  const val CAPABILITY = "mettleup_phone_app"

  /** "Get MettleUp on your phone" only when a phone IS connected and nothing says the app is there. PURE. */
  fun missing(connected: Boolean, hasCapability: Boolean, seenBefore: Boolean): Boolean =
    connected && !hasCapability && !seenBefore

  /** The phone's Play Store page for [pkg] (the watch app has the phone app's package name). */
  fun playStoreUri(pkg: String): String = "market://details?id=$pkg"

  /** What the "Open on phone" button did last: nothing yet, the phone took it, or it did not answer. */
  enum class Request { IDLE, SENT, FAILED }

  /** The line under "Get MettleUp on your phone" after the button's [r]. PURE. */
  fun reason(r: Request): String = when (r) {
    Request.IDLE -> WatchCopy.GET_PHONE_APP_REASON
    Request.SENT -> WatchCopy.GET_PHONE_APP_SENT
    Request.FAILED -> WatchCopy.GET_PHONE_APP_FAILED
  }
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

  /**
   * UAT 1 Nov 2026 (first run): under "Start a workout on your phone", what to open and what then
   * shows here. A member who just installed the watch app did not know it needs MettleUp on the phone.
   */
  const val NOTHING_OPEN_HINT = "Open MettleUp on your phone. Your rest timer shows up here."
  const val PHONE_NOT_CONNECTED = "Phone not connected"

  /** UAT 1 Nov 2026: says what to check, not only "keep it near" (Bluetooth off is the usual cause). */
  const val KEEP_PHONE_NEAR = "Keep your phone near you with Bluetooth on."
  /** R-269: the phone is connected, but MettleUp is not on it. */
  const val GET_PHONE_APP = "Get MettleUp on your phone"
  const val GET_PHONE_APP_REASON = "Your watch needs the MettleUp app on your phone."
  const val OPEN_ON_PHONE = "Open on phone"
  const val GET_PHONE_APP_SENT = "Look at your phone to install MettleUp."
  const val GET_PHONE_APP_FAILED = "Your phone did not answer. Try again."

  /** R-269: right after Finish on the phone. */
  const val WORKOUT_SAVED = "Workout saved"
  const val WORKOUT_SAVED_REASON = "Well done. See the details on your phone."
  const val ALLOW = "Allow"
  const val NOT_NOW = "Not now"
  const val STEP_HEART_RATE = "1 of 2"
  const val STEP_ALERTS = "2 of 2"
  const val TITLE_HEART_RATE = "Heart rate"
  const val TITLE_ALERTS = "Rest alerts"
  const val REASON_HEART_RATE = "Shows how hard your heart works while you rest."
  const val REASON_ALERTS = "Your watch buzzes when rest is over."

  /**
   * UAT 1 Nov 2026: the "Rest alerts" screen's second step. After notifications were allowed, the same
   * screen came back unchanged (Alarms & reminders still off) and a second "Allow" jumped into the
   * watch's settings unannounced. Now that step says what it opens.
   */
  const val REASON_ALARMS = "Turn on Alarms & reminders so your watch buzzes on time."
  const val OPEN_SETTINGS = "Open settings"

  /**
   * UAT 1 Nov 2026: the phone's live-card words when no set is named. The watch showed only the
   * workout's name, so after the last set nothing said the workout was done.
   */
  const val ALL_SETS_DONE = "All sets done. Tap Finish on your phone."
  const val ADD_AN_EXERCISE = "Add an exercise on your phone."

  private const val PAUSED = "Paused · "

  /**
   * The line shown when the phone named no set ([text] = its live card's set line, liveCard.ts):
   * "All sets done · Finish" and "Add an exercise to start" in watch words, an older phone app's
   * "Set 3 of 5 · 62.5 kg × 8" as it is; null when there is nothing to say.
   */
  fun statusLine(text: String): String? {
    val t = text.trim().removePrefix(PAUSED).trim()
    if (t.isEmpty()) return null
    if (t.startsWith("All sets done")) return ALL_SETS_DONE
    if (t.startsWith("Add an exercise")) return ADD_AN_EXERCISE
    return t
  }

  /** [statusLine] only while the phone sent no set line (with one, the screens show the set). */
  fun status(snap: WatchState.Snapshot): String? = if (snap.next.set.isBlank()) statusLine(snap.text) else null

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
