package com.forgeai.wear

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WorkoutStartedTest {
  private val now = 1_761_700_000_000L

  @Test
  fun readsTheStartTime() {
    assertEquals(now, WorkoutStarted.Rule.parse(now.toString().toByteArray()))
    assertEquals(0L, WorkoutStarted.Rule.parse(null))
    assertEquals(0L, WorkoutStarted.Rule.parse(ByteArray(0)))
    assertEquals(0L, WorkoutStarted.Rule.parse("soon".toByteArray()))
    assertEquals(0L, WorkoutStarted.Rule.parse("-5".toByteArray()))
  }

  @Test
  fun opensOncePerWorkout() {
    assertTrue(WorkoutStarted.Rule.shouldOpen(0L, now - 1_000L, now))
    assertFalse(WorkoutStarted.Rule.shouldOpen(now - 1_000L, now - 1_000L, now))
    assertTrue(WorkoutStarted.Rule.shouldOpen(now - 99_000L, now - 1_000L, now))
  }

  @Test
  fun ignoresStaleOrUnreadableRequests() {
    assertFalse(WorkoutStarted.Rule.shouldOpen(0L, 0L, now))
    assertFalse(WorkoutStarted.Rule.shouldOpen(0L, now - WorkoutStarted.Rule.MAX_AGE_MS - 1L, now))
    // A phone clock a little ahead is fine; far ahead is not.
    assertTrue(WorkoutStarted.Rule.shouldOpen(0L, now + 30_000L, now))
    assertFalse(WorkoutStarted.Rule.shouldOpen(0L, now + WorkoutStarted.Rule.MAX_AGE_MS + 1L, now))
  }
}
