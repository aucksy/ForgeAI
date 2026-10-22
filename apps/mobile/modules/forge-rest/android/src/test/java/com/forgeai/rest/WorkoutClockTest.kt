package com.forgeai.rest

import org.junit.Assert.assertEquals
import org.junit.Test

/** R-55: the live card's workout time (the card's own Chronometer starts from this). */
class WorkoutClockTest {
  @Test
  fun `running counts from the base the app sent`() {
    val base = 1_000_000L
    assertEquals(0L, WorkoutCard.trainedMs(WorkoutCard.Clock.Running(base), base))
    assertEquals(42L * 60_000 + 15_000, WorkoutCard.trainedMs(WorkoutCard.Clock.Running(base), base + 42L * 60_000 + 15_000))
  }

  @Test
  fun `paused stands still and a clock gone backwards never shows below zero`() {
    assertEquals(20L * 60_000, WorkoutCard.trainedMs(WorkoutCard.Clock.Paused(20L * 60_000), 99_999_999L))
    assertEquals(0L, WorkoutCard.trainedMs(WorkoutCard.Clock.Running(5_000L), 1_000L))
  }
}
