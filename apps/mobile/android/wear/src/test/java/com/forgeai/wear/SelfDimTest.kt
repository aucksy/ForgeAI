package com.forgeai.wear

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** R-442: the app dims the screen itself during a workout when the watch's Always-on display is off. */
class SelfDimTest {
  @Test
  fun alwaysOnSettingReadFromWearThenPhoneName() {
    assertEquals(false, SelfDim.aodOn("0", "1"))
    assertEquals(true, SelfDim.aodOn("1", "0"))
    assertEquals(false, SelfDim.aodOn(null, "0"))
    assertEquals(true, SelfDim.aodOn("", "1"))
    assertNull(SelfDim.aodOn(null, null))
    assertNull(SelfDim.aodOn("?", "x"))
  }

  @Test
  fun dimsItselfOnlyMidWorkoutInFrontWithAlwaysOnOff() {
    // The owner's watch: workout open, MettleUp in front, Always-on off, Battery Saver off.
    assertTrue(SelfDim.wanted(workoutOpen = true, onScreen = true, aodOn = false, saverOn = false, blackedOut = false))
    // Always-on on: the watch's own dim state does it (and costs less battery).
    assertFalse(SelfDim.wanted(workoutOpen = true, onScreen = true, aodOn = true, saverOn = false, blackedOut = false))
    // No workout: the screen goes fully off as the watch wants (negative).
    assertFalse(SelfDim.wanted(workoutOpen = false, onScreen = true, aodOn = false, saverOn = false, blackedOut = false))
    // Another app or the watch face in front.
    assertFalse(SelfDim.wanted(workoutOpen = true, onScreen = false, aodOn = false, saverOn = false, blackedOut = false))
    // Battery Saver: the watch is low and saves itself.
    assertFalse(SelfDim.wanted(workoutOpen = true, onScreen = true, aodOn = false, saverOn = true, blackedOut = false))
    // Setting unreadable: only after a black screen in this workout.
    assertFalse(SelfDim.wanted(workoutOpen = true, onScreen = true, aodOn = null, saverOn = false, blackedOut = false))
    assertTrue(SelfDim.wanted(workoutOpen = true, onScreen = true, aodOn = null, saverOn = null, blackedOut = true))
    // A black screen never overrides a readable "on".
    assertFalse(SelfDim.wanted(workoutOpen = true, onScreen = true, aodOn = true, saverOn = false, blackedOut = true))
  }

  @Test
  fun dimWaitFollowsTheWatchTimeoutWithinBounds() {
    assertEquals(15_000L, SelfDim.timeoutMs(null))
    assertEquals(15_000L, SelfDim.timeoutMs(0L))
    assertEquals(15_000L, SelfDim.timeoutMs(15_000L))
    assertEquals(5_000L, SelfDim.timeoutMs(1_000L))
    assertEquals(30_000L, SelfDim.timeoutMs(600_000L))
    // "Never" on some watches is Int.MAX_VALUE: a workout screen still dims.
    assertEquals(30_000L, SelfDim.timeoutMs(Int.MAX_VALUE.toLong()))
  }

  @Test
  fun idleLeftCountsFromTheLastTouch() {
    assertEquals(15_000L, SelfDim.idleLeft(now = 1_000L, inputAt = 1_000L, timeout = 15_000L))
    assertEquals(5_000L, SelfDim.idleLeft(now = 11_000L, inputAt = 1_000L, timeout = 15_000L))
    assertEquals(0L, SelfDim.idleLeft(now = 99_000L, inputAt = 1_000L, timeout = 15_000L))
    // A clock that went back never waits longer than the timeout.
    assertEquals(15_000L, SelfDim.idleLeft(now = 0L, inputAt = 50_000L, timeout = 15_000L))
  }

  @Test
  fun dimCountdownRedrawsOnTheSecond() {
    assertEquals(400L, SelfDim.toNextSecond(endsAt = 10_400L, now = 0L))
    assertEquals(1_000L, SelfDim.toNextSecond(endsAt = 10_000L, now = 0L))
  }

  private fun feed(w: SelfDim.Wrist, z: Float, from: Long, to: Long): List<SelfDim.Wrist.Move> =
    (from..to step 100L).map { w.feed(z, it) }.filter { it != SelfDim.Wrist.Move.NONE }

  @Test
  fun wristDownThenRaiseIsSeenOnceEach() {
    val w = SelfDim.Wrist()
    // Looking at the watch: nothing.
    assertEquals(emptyList<SelfDim.Wrist.Move>(), feed(w, 9.5f, 0L, 2_000L))
    // Arm down for 2 s: one LOWERED.
    assertEquals(listOf(SelfDim.Wrist.Move.LOWERED), feed(w, 0.8f, 2_100L, 4_100L))
    // Raised to look: one RAISED.
    assertEquals(listOf(SelfDim.Wrist.Move.RAISED), feed(w, 9.0f, 4_200L, 6_000L))
  }

  @Test
  fun noRaiseWithoutTheWristBeingDownFirst() {
    val w = SelfDim.Wrist()
    // Lying face up on a bench, or a slow tilt with no arm down before it (negative).
    assertEquals(emptyList<SelfDim.Wrist.Move>(), feed(w, 9.8f, 0L, 5_000L))
    assertEquals(emptyList<SelfDim.Wrist.Move>(), feed(w, 4.5f, 5_100L, 6_000L))
    assertEquals(emptyList<SelfDim.Wrist.Move>(), feed(w, 9.0f, 6_100L, 8_000L))
  }

  @Test
  fun aShortJoltDownIsNotAWristDown() {
    val w = SelfDim.Wrist()
    feed(w, 9.5f, 0L, 1_000L)
    // 0.3 s low (a rep's swing), then up again: not LOWERED.
    assertEquals(emptyList<SelfDim.Wrist.Move>(), feed(w, 0.0f, 1_100L, 1_400L))
    assertFalse(feed(w, 9.5f, 1_500L, 3_000L).contains(SelfDim.Wrist.Move.LOWERED))
  }

  @Test
  fun aRaiseLongAfterTheArmWentDownStillCountsWhileItStaysDown() {
    val w = SelfDim.Wrist()
    // Arm down for a minute (a set), then raised.
    assertEquals(listOf(SelfDim.Wrist.Move.LOWERED), feed(w, 0.5f, 0L, 60_000L))
    assertEquals(listOf(SelfDim.Wrist.Move.RAISED), feed(w, 8.5f, 60_100L, 61_500L))
  }
}
