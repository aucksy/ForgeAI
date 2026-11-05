package com.forgeai.wear

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * R-343 + R-355 (owner, 5 Nov 2026): the watch names the exercise the NEXT set belongs to during a rest,
 * never the one just finished, and no name after the workout's final set (the phone then sends "" as
 * the exercise, WearWire.watchTitle). Pure: WatchCopy.card / status and LogFlow.screen on the JVM.
 */
class WatchNextExerciseTest {
  private val e = SetEntry(wOn = true, rOn = true, w = 60.0, r = 8, unit = "kg", step = 2.5, warm = false, rpe = false, rest = 90)

  private fun snap(title: String, next: NextSet, text: String = "", entry: SetEntry? = e, rest: Boolean = true, overAt: Long = 0L) =
    WatchState.Snapshot(
      rest = if (rest) WatchState.Rest(0L, 90_000L, "") else null,
      workoutActive = true,
      title = title,
      text = text,
      next = next,
      overAt = overAt,
      logFlow = true,
      entry = entry,
      row = if (entry != null) "{\"exKey\":\"b\",\"setKey\":\"b1\"}" else "",
    )

  @Test fun restBetweenSetsNamesTheSameExerciseAndItsNextSet() {
    // R-343 kept: the rest screen's name line is card.exercise.
    val c = WatchCopy.card(snap("Bench Press", NextSet("Set 2 of 3", "57.5 kg × 8", "60 kg × 8")))
    assertEquals("Bench Press", c.exercise)
    assertEquals("Set 2 of 3", c.setLabel)
    assertEquals("Previous 57.5 kg × 8", c.previous)
    assertEquals("Next 60 kg × 8", c.next)
  }

  @Test fun restAfterTheLastSetOfANamesExerciseBSetOne() {
    // R-355, the reported case: the phone's item during that rest names B with B's own lines.
    val c = WatchCopy.card(snap("Barbell Row", NextSet("Set 1 of 3", "50 kg × 10", "60 kg × 8")))
    assertEquals("Barbell Row", c.exercise)
    assertEquals(1, c.setIndex)
    assertEquals(3, c.setCount)
    assertEquals("Previous 50 kg × 10", c.previous)
    assertEquals("Next 60 kg × 8", c.next)
  }

  @Test fun afterTheWorkoutsFinalSetNoNameOnlyTheStatusLine() {
    val s = snap("", NextSet.NONE, text = "All sets done · Finish", entry = null)
    val c = WatchCopy.card(s)
    assertEquals("", c.exercise)
    assertEquals("", c.setLabel)
    assertNull(c.previous)
    assertNull(c.next)
    assertEquals(WatchCopy.ALL_SETS_DONE, WatchCopy.status(s))
    // Paused after the last set: the same.
    assertEquals(WatchCopy.ALL_SETS_DONE, WatchCopy.status(s.copy(text = "Paused · All sets done · Finish")))
  }

  @Test fun theLoggingFlowFollowsTheNextExercise() {
    // A's last set logged on the watch: during the rest the rest screen, then "Exercise done" naming B.
    val ui = LogUi(exDone = true, doneExercise = "Bench Press", doneSets = 3)
    val b = snap("Barbell Row", NextSet("Set 1 of 3", "", "60 kg × 8"))
    assertEquals(LogScreen.REST, LogFlow.screen(WatchScreenKind.REST_TIMER, b, ui, 1_000L))
    val after = b.copy(rest = null)
    assertEquals(LogScreen.EXERCISE_DONE, LogFlow.screen(WatchScreenKind.BETWEEN_RESTS, after, ui, 1_000L))
    // The phone still naming the finished exercise would skip "Exercise done" (the old stale case).
    val stale = after.copy(title = "Bench Press")
    assertEquals(LogScreen.NEXT_SET, LogFlow.screen(WatchScreenKind.BETWEEN_RESTS, stale, ui, 1_000L))
    // After the final set: no set, no name: the between-rests screen with its status line.
    val end = snap("", NextSet.NONE, text = "All sets done · Finish", entry = null, rest = false)
    assertEquals(LogScreen.BETWEEN, LogFlow.screen(WatchScreenKind.BETWEEN_RESTS, end, ui, 1_000L))
  }
}
