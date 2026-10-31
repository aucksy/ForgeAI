package com.forgeai.wear

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WorkoutLiveTest {
  // Review of 0.63.0: a phone that never says "ended" must not leave the workout notice up forever.
  @Test
  fun freshOnlyUnderTheCap() {
    val now = 10_000_000_000L
    assertTrue(WorkoutLive.fresh(now - 60_000L, now))
    assertTrue(WorkoutLive.fresh(now - WorkoutLive.CAP_MS + 1, now))
    assertFalse(WorkoutLive.fresh(now - WorkoutLive.CAP_MS, now))
    assertFalse(WorkoutLive.fresh(0L, now)) // an older app version never saved the time
    assertFalse(WorkoutLive.fresh(now + 60_000L, now)) // the watch clock went back: not trusted
  }
}
