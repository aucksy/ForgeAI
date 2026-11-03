package com.forgeai.wear

import java.math.BigDecimal
import java.math.RoundingMode
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.roundToLong

/*
 * Watch logging (3 Nov 2026, the owner's approved design "MettleUp Watch Logging"): the member logs
 * a set on the watch. Screens: 1 Next set (weight and reps pills, the round Done), 2a/2b the crown
 * changes the tapped number, 3 optional effort (RPE, only with "Track RPE" on in the phone app),
 * 4 "Saved" then the rest timer (-15 / +15 / Skip), 5 Rest is over (about 5 s), 6 Exercise done,
 * 7 Not saved. Everything here is pure (no Android types): WatchLogTest covers it on the JVM.
 *
 * The phone stays the owner of the data. The watch sends the row the phone named (its JSON, as
 * sent) plus the numbers shown ({w, r, rpe, unit}); the phone ticks it exactly as a tick on its own
 * screen (restDone.ts). The watch counts the set as saved only when the phone names another row
 * next ([LogMath.confirmed]); a refusal or [LogMath.CONFIRM_MS] of silence shows "Not saved".
 */

/**
 * The next set's boxes as the phone sent them (/forge/workout "e…" keys, liveCard.ts WatchEntry).
 * [w] / [r] null = the box is empty; [step] one crown step of weight in [unit]; [rest] the seconds
 * of rest after this set (the watch starts it itself if the phone does not answer).
 */
data class SetEntry(
  val wOn: Boolean,
  val rOn: Boolean,
  val w: Double?,
  val r: Int?,
  val unit: String,
  val step: Double,
  val warm: Boolean,
  val rpe: Boolean,
  val rest: Int,
)

/** What the member is changing with the crown (screens 2a / 2b). */
enum class Adjust { NONE, WEIGHT, REPS }

/** Where the log flow is, beyond what the phone's state already says. */
enum class LogPhase { IDLE, EFFORT, SENDING, NOT_SAVED }

/** The screens of the log flow. [BETWEEN]: the older "between rests" screen (no set to log). */
enum class LogScreen { NEXT_SET, EFFORT, REST, REST_OVER, EXERCISE_DONE, NOT_SAVED, BETWEEN }

/**
 * The watch's own part of the flow (the rest comes from the phone, or [WatchState.startLocalRest]).
 * [rowKey]: the phone row (setKey) the edits belong to; a new row drops them.
 */
data class LogUi(
  val rowKey: String = "",
  val weight: Double? = null,
  val reps: Int? = null,
  val edited: Boolean = false,
  val adjust: Adjust = Adjust.NONE,
  val adjustAt: Long = 0L,
  val phase: LogPhase = LogPhase.IDLE,
  val phaseAt: Long = 0L,
  /** The row sent (setKey) and when. */
  val sentKey: String = "",
  val sentAt: Long = 0L,
  /** When the phone confirmed the last set ("Saved" shows [LogMath.SAVED_MS]); 0 = none. */
  val savedAt: Long = 0L,
  /** The last set of an exercise was logged here: after its rest, "Exercise done" (screen 6). */
  val exDone: Boolean = false,
  val doneExercise: String = "",
  val doneSets: Int = 0,
)

object LogMath {
  /** The crown's change ends after this long untouched (design: "3 s idle"). */
  const val ADJUST_IDLE_MS = 3_000L

  /** The effort ring empties over this long, then the set is saved without effort. */
  const val EFFORT_MS = 4_000L

  /** "Saved" shows this long on the rest timer. */
  const val SAVED_MS = 2_000L

  /** "Rest is over" shows this long, then the next set (never a blank screen). */
  const val OVER_MS = 5_000L

  /** No word from the phone this long after Done: "Not saved". */
  const val CONFIRM_MS = 10_000L

  /** One crown detent's worth of scroll (px); a turn moves one step per this much. */
  const val CROWN_PX = 36f

  /** The effort choices, two rows of four (design). */
  val RPE = listOf(6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0, 10.0)

  /** Highest weight and reps the crown goes to (the phone's own boxes allow no more). */
  const val MAX_WEIGHT = 2000.0
  const val MAX_REPS = 999

  /** "20", "22.5", "137.8"; "—" for an empty box. */
  fun num(v: Double?): String {
    if (v == null || v.isNaN()) return "—"
    if (abs(v - v.roundToLong()) < 1e-9) return v.roundToLong().toString()
    return BigDecimal(v).setScale(2, RoundingMode.HALF_UP).stripTrailingZeros().toPlainString()
  }

  fun reps(v: Int?): String = v?.toString() ?: "—"

  /** "6.5", "10". */
  fun rpe(v: Double): String = num(v)

  /** One crown step from [base] on the [step] grid, as the phone's +/- does (setEntry.ts stepOnGrid). */
  fun stepWeight(base: Double?, step: Double, dir: Int): Double {
    val b = base ?: 0.0
    if (!(step > 0.0)) return b
    val q = b / step
    val r = Math.round(q).toDouble()
    val onGrid = abs(q - r) < 1e-6
    val k = if (onGrid) r + dir else if (dir > 0) ceil(q) else floor(q)
    val next = Math.round(maxOf(0.0, k * step) * 1000.0) / 1000.0
    return next.coerceAtMost(MAX_WEIGHT)
  }

  /** One rep up or down; never below 1 (as the phone's box). */
  fun stepReps(base: Int?, dir: Int): Int {
    val b = base ?: 0
    val next = (b + dir).coerceIn(1, MAX_REPS)
    return if (dir < 0 && next >= b && b > 0) b else next
  }

  /** The line under the set while the crown is live: "Turn the dial · 2.5 kg steps". */
  fun crownHint(adjust: Adjust, e: SetEntry): String = when (adjust) {
    Adjust.WEIGHT -> "${WatchCopy.TURN_THE_CROWN} · ${num(e.step)} ${e.unit} steps"
    Adjust.REPS -> "${WatchCopy.TURN_THE_CROWN} · 1 rep steps"
    Adjust.NONE -> ""
  }

  /** The weight and reps shown now: the member's changes for this row, else what the phone sent. */
  fun weight(ui: LogUi, e: SetEntry, rowKey: String): Double? = if (ui.edited && ui.rowKey == rowKey) ui.weight else e.w

  fun repsNow(ui: LogUi, e: SetEntry, rowKey: String): Int? = if (ui.edited && ui.rowKey == rowKey) ui.reps else e.r

  /** "20 kg × 16" (the effort screen's line); a missing half is left out. */
  fun setLine(w: Double?, r: Int?, e: SetEntry): String {
    val parts = mutableListOf<String>()
    if (e.wOn && w != null) parts.add("${num(w)} ${e.unit}")
    if (e.rOn && r != null) parts.add(r.toString())
    return parts.joinToString(" × ")
  }

  /** Can Done log this row? The phone named one, and every box it has holds a number. */
  fun canLog(row: String, e: SetEntry?, w: Double?, r: Int?): Boolean {
    if (row.isBlank() || setKeyOf(row).isEmpty()) return false
    if (e == null) return true
    if (e.rOn && (r == null || r <= 0)) return false
    if (e.wOn && !e.rOn && w == null) return false
    return true
  }

  private val SET_KEY = Regex("\"setKey\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"")

  /** The row's setKey from the phone's JSON ("" = none). */
  fun setKeyOf(row: String): String = SET_KEY.find(row)?.groupValues?.get(1) ?: ""

  /**
   * The row as the phone sent it, plus the numbers logged here: `"log":{"w":22.5,"r":17,"rpe":8,"unit":"kg"}`.
   * Without [e] (an older phone app) the row goes back unchanged (the phone then saves its own numbers).
   */
  fun withLog(row: String, e: SetEntry?, w: Double?, r: Int?, rpe: Double?): String {
    val t = row.trim()
    if (e == null || !t.endsWith("}")) return row
    val parts = mutableListOf<String>()
    if (e.wOn && w != null) parts.add("\"w\":${num(w)}")
    if (e.rOn && r != null) parts.add("\"r\":$r")
    if (parts.isEmpty()) return row
    if (rpe != null) parts.add("\"rpe\":${num(rpe)}")
    parts.add("\"unit\":\"${if (e.unit == "lb") "lb" else "kg"}\"")
    val body = t.dropLast(1).trimEnd()
    val sep = if (body.endsWith("{")) "" else ","
    return "$body$sep\"log\":{${parts.joinToString(",")}}}"
  }

  /**
   * The phone took the set: it names another row next (or none: all sets done), or the workout
   * closed. The phone sends that only after the tick (restDoneRun.ts / OfflineTick.kt).
   */
  fun confirmed(sentKey: String, row: String, active: Boolean): Boolean =
    sentKey.isNotEmpty() && (!active || setKeyOf(row) != sentKey)

  /** Crown scroll [px] (accumulated with [carry]) into whole steps and the leftover. */
  fun crownSteps(carry: Float, px: Float): Pair<Int, Float> {
    val total = carry + px
    val steps = (total / CROWN_PX).toInt()
    return steps to (total - steps * CROWN_PX)
  }

  /** "4 sets done" / "1 set done". */
  fun setsDone(n: Int): String = if (n == 1) "1 set done" else "$n sets done"

  /** The rest clock: "1:23"; dimmed (no seconds): "2 min" (rounded up, at least 1). */
  fun restClock(secondsLeft: Long, ambient: Boolean): String =
    if (ambient) "${maxOf(1L, (secondsLeft + 59L) / 60L)} min" else RestText.clock(secondsLeft)
}

/** The flow's steps, as pure functions of [LogUi] (MainActivity keeps the state and the timers). */
object LogFlow {
  /** Tap on the weight pill: the crown changes the weight; a second tap ends it. */
  fun tapWeight(ui: LogUi, e: SetEntry, rowKey: String, now: Long): LogUi = tap(ui, e, rowKey, now, Adjust.WEIGHT)

  fun tapReps(ui: LogUi, e: SetEntry, rowKey: String, now: Long): LogUi = tap(ui, e, rowKey, now, Adjust.REPS)

  private fun tap(ui: LogUi, e: SetEntry, rowKey: String, now: Long, what: Adjust): LogUi {
    val base = own(ui, e, rowKey)
    return base.copy(adjust = if (base.adjust == what) Adjust.NONE else what, adjustAt = now)
  }

  /** The member's copy of the row's numbers (taken from the phone's on the first change). */
  private fun own(ui: LogUi, e: SetEntry, rowKey: String): LogUi =
    if (ui.edited && ui.rowKey == rowKey) ui else ui.copy(rowKey = rowKey, weight = e.w, reps = e.r, edited = true)

  /** [steps] crown steps on the number being changed; nothing when none is selected. */
  fun crown(ui: LogUi, e: SetEntry, rowKey: String, steps: Int, now: Long): LogUi {
    if (steps == 0 || ui.adjust == Adjust.NONE) return ui
    var u = own(ui, e, rowKey)
    val dir = if (steps > 0) 1 else -1
    repeat(abs(steps)) {
      u = when (u.adjust) {
        Adjust.WEIGHT -> u.copy(weight = LogMath.stepWeight(u.weight, e.step, dir))
        Adjust.REPS -> u.copy(reps = LogMath.stepReps(u.reps, dir))
        Adjust.NONE -> u
      }
    }
    return u.copy(adjustAt = now)
  }

  /** 3 s untouched: the crown's change ends. */
  fun idle(ui: LogUi, now: Long): LogUi =
    if (ui.adjust != Adjust.NONE && now - ui.adjustAt >= LogMath.ADJUST_IDLE_MS) ui.copy(adjust = Adjust.NONE) else ui

  /** Done: the effort question first when the phone asks for it (not for a warm-up), else straight to sending. */
  fun done(ui: LogUi, e: SetEntry?, now: Long): LogUi {
    val ask = e != null && e.rpe && !e.warm
    return ui.copy(adjust = Adjust.NONE, phase = if (ask) LogPhase.EFFORT else ui.phase, phaseAt = now)
  }

  /**
   * The set went to the phone: wait for its answer. [lastOfExercise]: it was the exercise's last
   * set ("Exercise done" after the rest); [exercise] / [sets] for that screen.
   */
  fun sent(ui: LogUi, rowKey: String, now: Long, lastOfExercise: Boolean, exercise: String, sets: Int): LogUi = ui.copy(
    adjust = Adjust.NONE,
    phase = LogPhase.SENDING,
    phaseAt = now,
    sentKey = rowKey,
    sentAt = now,
    savedAt = 0L,
    exDone = lastOfExercise,
    doneExercise = if (lastOfExercise) exercise else "",
    doneSets = if (lastOfExercise) sets else 0,
    edited = false,
  )

  fun confirmed(ui: LogUi, now: Long): LogUi = ui.copy(phase = LogPhase.IDLE, phaseAt = now, sentKey = "", savedAt = now)

  /** The phone refused it, did not answer, or could not be reached. */
  fun notSaved(ui: LogUi, now: Long): LogUi = ui.copy(phase = LogPhase.NOT_SAVED, phaseAt = now, sentKey = "", exDone = false)

  fun dismiss(ui: LogUi, now: Long): LogUi = ui.copy(phase = LogPhase.IDLE, phaseAt = now)

  /** Go (or a swipe) on "Exercise done". */
  fun go(ui: LogUi): LogUi = ui.copy(exDone = false, doneExercise = "", doneSets = 0)

  /**
   * Which log-flow screen shows, or null for the older screens (the phone app does not take sets
   * from the watch yet). [kind] is the older choice ([ScreenSelector]); only its workout screens
   * (rest timer, rest is over, between rests) are replaced.
   */
  fun screen(kind: WatchScreenKind, snap: WatchState.Snapshot, ui: LogUi, now: Long): LogScreen? {
    if (!snap.logFlow) return null
    if (kind != WatchScreenKind.REST_TIMER && kind != WatchScreenKind.REST_IS_OVER && kind != WatchScreenKind.BETWEEN_RESTS) return null
    return when {
      ui.phase == LogPhase.NOT_SAVED -> LogScreen.NOT_SAVED
      ui.phase == LogPhase.EFFORT -> LogScreen.EFFORT
      kind == WatchScreenKind.REST_TIMER -> LogScreen.REST
      kind == WatchScreenKind.REST_IS_OVER && now - snap.overAt in 0L until LogMath.OVER_MS -> LogScreen.REST_OVER
      ui.exDone && ui.phase != LogPhase.SENDING && snap.entry != null && snap.title.trim() != ui.doneExercise.trim() -> LogScreen.EXERCISE_DONE
      snap.entry != null -> LogScreen.NEXT_SET
      else -> LogScreen.BETWEEN
    }
  }

  /** "Saved" on the rest timer: the phone confirmed under [LogMath.SAVED_MS] ago. */
  fun showSaved(ui: LogUi, now: Long): Boolean = ui.savedAt > 0L && now - ui.savedAt in 0L until LogMath.SAVED_MS

  /** The share of the effort ring still left (1 at the start, 0 after [LogMath.EFFORT_MS]). */
  fun effortLeft(ui: LogUi, now: Long): Float =
    (1f - (now - ui.phaseAt).toFloat() / LogMath.EFFORT_MS).coerceIn(0f, 1f)

  /** The share of the "Rest is over" ring still left (5 s). */
  fun overLeft(overAt: Long, now: Long): Float = (1f - (now - overAt).toFloat() / LogMath.OVER_MS).coerceIn(0f, 1f)
}
