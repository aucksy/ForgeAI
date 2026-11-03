package com.forgeai.wear

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Watch logging (3 Nov 2026): the pure flow in WatchLog.kt, on the JVM. */
class WatchLogTest {
  private val row = "{\"exKey\":\"ex-1\",\"setKey\":\"set-2\",\"sig\":\"20|15\"}"
  private val e = SetEntry(wOn = true, rOn = true, w = 20.0, r = 15, unit = "kg", step = 2.5, warm = false, rpe = true, rest = 120)

  private fun snap(kind: String = "between", logFlow: Boolean = true, entry: SetEntry? = e, title: String = "Bench Press") =
    WatchState.Snapshot(
      rest = if (kind == "rest") WatchState.Rest(0L, 60_000L, "") else null,
      workoutActive = true,
      title = title,
      overAt = if (kind == "over") 1_000L else 0L,
      logFlow = logFlow,
      entry = entry,
      row = row,
    )

  @Test fun numbersShowWithoutTrailingZeros() {
    assertEquals("20", LogMath.num(20.0))
    assertEquals("22.5", LogMath.num(22.5))
    assertEquals("1.25", LogMath.num(1.25))
    assertEquals("—", LogMath.num(null))
    assertEquals("6.5", LogMath.rpe(6.5))
  }

  @Test fun crownStepsTheWeightOnTheMembersGrid() {
    assertEquals(22.5, LogMath.stepWeight(20.0, 2.5, 1), 1e-9)
    assertEquals(17.5, LogMath.stepWeight(20.0, 2.5, -1), 1e-9)
    // Off the grid: the first step lands on it (as the phone's +/-).
    assertEquals(22.5, LogMath.stepWeight(21.0, 2.5, 1), 1e-9)
    assertEquals(20.0, LogMath.stepWeight(21.0, 2.5, -1), 1e-9)
    assertEquals(0.0, LogMath.stepWeight(0.0, 2.5, -1), 1e-9)
    assertEquals(2.5, LogMath.stepWeight(null, 2.5, 1), 1e-9)
  }

  @Test fun crownStepsRepsByOneNeverBelowOne() {
    assertEquals(16, LogMath.stepReps(15, 1))
    assertEquals(14, LogMath.stepReps(15, -1))
    assertEquals(1, LogMath.stepReps(1, -1))
    assertEquals(1, LogMath.stepReps(null, 1))
  }

  @Test fun crownScrollTurnsIntoWholeSteps() {
    val (a, carry) = LogMath.crownSteps(0f, LogMath.CROWN_PX * 2.5f)
    assertEquals(2, a)
    val (b, _) = LogMath.crownSteps(carry, LogMath.CROWN_PX * 0.6f)
    assertEquals(1, b)
    val (c, _) = LogMath.crownSteps(0f, -LogMath.CROWN_PX * 1.2f)
    assertEquals(-1, c)
  }

  @Test fun theRowsKeyIsRead() {
    assertEquals("set-2", LogMath.setKeyOf(row))
    assertEquals("", LogMath.setKeyOf(""))
  }

  @Test fun doneAddsTheNumbersShownToTheRow() {
    val out = LogMath.withLog(row, e, 22.5, 16, 8.0)
    assertTrue(out, out.endsWith(",\"log\":{\"w\":22.5,\"r\":16,\"rpe\":8,\"unit\":\"kg\"}}"))
    assertTrue(out.startsWith("{\"exKey\":\"ex-1\""))
    // No effort picked: no rpe key.
    assertFalse(LogMath.withLog(row, e, 20.0, 15, null).contains("rpe"))
    // An older phone app (no entry): the row goes back as it came.
    assertEquals(row, LogMath.withLog(row, null, 20.0, 15, null))
  }

  @Test fun repsOnlyRowSendsNoWeight() {
    val reps = e.copy(wOn = false, w = null)
    assertEquals(",\"log\":{\"r\":20,\"unit\":\"kg\"}}", LogMath.withLog(row, reps, null, 20, null).removePrefix(row.dropLast(1)))
  }

  @Test fun doneNeedsARowAndNumbers() {
    assertTrue(LogMath.canLog(row, e, 20.0, 15))
    assertFalse(LogMath.canLog("", e, 20.0, 15))
    assertFalse(LogMath.canLog(row, e, 20.0, null))
    assertFalse(LogMath.canLog(row, e, 20.0, 0))
  }

  @Test fun savedOnlyWhenThePhoneNamesAnotherRow() {
    assertFalse(LogMath.confirmed("set-2", row, true))
    assertTrue(LogMath.confirmed("set-2", row.replace("set-2", "set-3"), true))
    assertTrue(LogMath.confirmed("set-2", "", true))
    assertTrue(LogMath.confirmed("set-2", row, false))
    assertFalse(LogMath.confirmed("", row, true))
  }

  @Test fun tapThenCrownThenSecondTapEnds() {
    var ui = LogFlow.tapWeight(LogUi(), e, "set-2", 0L)
    assertEquals(Adjust.WEIGHT, ui.adjust)
    ui = LogFlow.crown(ui, e, "set-2", 1, 10L)
    assertEquals(22.5, ui.weight!!, 1e-9)
    assertEquals(15, ui.reps)
    ui = LogFlow.tapWeight(ui, e, "set-2", 20L)
    assertEquals(Adjust.NONE, ui.adjust)
    assertEquals(22.5, LogMath.weight(ui, e, "set-2")!!, 1e-9)
    // A new row from the phone drops the edits.
    assertEquals(20.0, LogMath.weight(ui, e, "set-3")!!, 1e-9)
  }

  @Test fun crownDoesNothingWithNothingSelected() {
    val ui = LogFlow.crown(LogUi(), e, "set-2", 3, 0L)
    assertEquals(LogUi(), ui)
  }

  @Test fun threeSecondsIdleEndsTheCrown() {
    val ui = LogFlow.tapReps(LogUi(), e, "set-2", 0L)
    assertEquals(Adjust.REPS, LogFlow.idle(ui, 2_999L).adjust)
    assertEquals(Adjust.NONE, LogFlow.idle(ui, 3_000L).adjust)
  }

  @Test fun effortAskedOnlyWhenTrackedAndNotForWarmUps() {
    assertEquals(LogPhase.EFFORT, LogFlow.done(LogUi(), e, 0L).phase)
    assertEquals(LogPhase.IDLE, LogFlow.done(LogUi(), e.copy(rpe = false), 0L).phase)
    assertEquals(LogPhase.IDLE, LogFlow.done(LogUi(), e.copy(warm = true), 0L).phase)
  }

  @Test fun effortRingEmptiesInFourSeconds() {
    val ui = LogUi(phase = LogPhase.EFFORT, phaseAt = 1_000L)
    assertEquals(1f, LogFlow.effortLeft(ui, 1_000L), 1e-6f)
    assertEquals(0.5f, LogFlow.effortLeft(ui, 3_000L), 1e-6f)
    assertEquals(0f, LogFlow.effortLeft(ui, 6_000L), 1e-6f)
  }

  @Test fun oldPhoneAppKeepsTheOldScreens() {
    assertNull(LogFlow.screen(WatchScreenKind.BETWEEN_RESTS, snap(logFlow = false), LogUi(), 0L))
    assertNull(LogFlow.screen(WatchScreenKind.NOTHING_OPEN, snap(), LogUi(), 0L))
  }

  @Test fun screensFollowTheFlow() {
    assertEquals(LogScreen.NEXT_SET, LogFlow.screen(WatchScreenKind.BETWEEN_RESTS, snap(), LogUi(), 0L))
    assertEquals(LogScreen.BETWEEN, LogFlow.screen(WatchScreenKind.BETWEEN_RESTS, snap(entry = null), LogUi(), 0L))
    assertEquals(LogScreen.EFFORT, LogFlow.screen(WatchScreenKind.BETWEEN_RESTS, snap(), LogUi(phase = LogPhase.EFFORT), 0L))
    assertEquals(LogScreen.REST, LogFlow.screen(WatchScreenKind.REST_TIMER, snap("rest"), LogUi(), 0L))
    assertEquals(LogScreen.NOT_SAVED, LogFlow.screen(WatchScreenKind.REST_TIMER, snap("rest"), LogUi(phase = LogPhase.NOT_SAVED), 0L))
    // Rest is over: about 5 s of orange, then the next set.
    assertEquals(LogScreen.REST_OVER, LogFlow.screen(WatchScreenKind.REST_IS_OVER, snap("over"), LogUi(), 3_000L))
    assertEquals(LogScreen.NEXT_SET, LogFlow.screen(WatchScreenKind.REST_IS_OVER, snap("over"), LogUi(), 6_001L))
    // Nothing left to log after it: the between-rests screen, never a blank one.
    assertEquals(LogScreen.BETWEEN, LogFlow.screen(WatchScreenKind.REST_IS_OVER, snap("over", entry = null), LogUi(), 6_001L))
  }

  @Test fun exerciseDoneShowsOnceTheNextExerciseIsNamed() {
    val ui = LogUi(exDone = true, doneExercise = "Bench Press", doneSets = 4)
    assertEquals(LogScreen.EXERCISE_DONE, LogFlow.screen(WatchScreenKind.BETWEEN_RESTS, snap(title = "Incline Press"), ui, 0L))
    // The phone still names the old exercise: no "Exercise done" yet.
    assertEquals(LogScreen.NEXT_SET, LogFlow.screen(WatchScreenKind.BETWEEN_RESTS, snap(title = "Bench Press"), ui, 0L))
    // Go (or a swipe) moves on.
    assertEquals(LogScreen.NEXT_SET, LogFlow.screen(WatchScreenKind.BETWEEN_RESTS, snap(title = "Incline Press"), LogFlow.go(ui), 0L))
  }

  @Test fun sentThenConfirmedShowsSavedForTwoSeconds() {
    var ui = LogFlow.sent(LogUi(), "set-2", 1_000L, lastOfExercise = false, exercise = "Bench Press", sets = 4)
    assertEquals(LogPhase.SENDING, ui.phase)
    assertEquals("set-2", ui.sentKey)
    assertFalse(ui.exDone)
    ui = LogFlow.confirmed(ui, 2_000L)
    assertEquals(LogPhase.IDLE, ui.phase)
    assertTrue(LogFlow.showSaved(ui, 3_999L))
    assertFalse(LogFlow.showSaved(ui, 4_000L))
  }

  @Test fun notSavedDropsExerciseDone() {
    val ui = LogFlow.sent(LogUi(), "set-4", 0L, lastOfExercise = true, exercise = "Bench Press", sets = 4)
    assertTrue(ui.exDone)
    val ns = LogFlow.notSaved(ui, 1L)
    assertEquals(LogPhase.NOT_SAVED, ns.phase)
    assertFalse(ns.exDone)
    assertEquals(LogPhase.IDLE, LogFlow.dismiss(ns, 2L).phase)
    assertEquals("", ns.sentKey)
  }

  @Test fun noAnswerKeepsTheKeySoALateConfirmStillCounts() {
    val ui = LogFlow.sent(LogUi(), "set-4", 0L, lastOfExercise = false, exercise = "Bench Press", sets = 4)
    val ns = LogFlow.notSaved(ui, 1L, keepKey = true)
    assertEquals(LogPhase.NOT_SAVED, ns.phase)
    assertEquals(ui.sentKey, ns.sentKey)
    assertTrue(LogMath.confirmed(ns.sentKey, "set-5", true))
  }

  @Test fun restClockDimShowsMinutesOnly() {
    assertEquals("1:23", LogMath.restClock(83L, false))
    assertEquals("2 min", LogMath.restClock(83L, true))
    assertEquals("1 min", LogMath.restClock(5L, true))
  }

  @Test fun memberWordsStayPlain() {
    assertEquals("4 sets done", LogMath.setsDone(4))
    assertEquals("1 set done", LogMath.setsDone(1))
    val words = listOf(
      WatchCopy.NOT_SAVED, WatchCopy.TICK_IT_ON_YOUR_PHONE, WatchCopy.HOW_HARD, WatchCopy.EFFORT_SCALE,
      WatchCopy.TURN_THE_CROWN, WatchCopy.NEXT_EXERCISE, WatchCopy.SAVED, WatchCopy.SKIP,
      LogMath.crownHint(Adjust.WEIGHT, e), LogMath.crownHint(Adjust.REPS, e),
    )
    for (w in words) {
      val low = w.lowercase()
      assertFalse(w, low.contains("volume") || low.contains("session") || Regex("\\bpr\\b").containsMatchIn(low) || Regex("\\blast\\b").containsMatchIn(low))
    }
  }
}
