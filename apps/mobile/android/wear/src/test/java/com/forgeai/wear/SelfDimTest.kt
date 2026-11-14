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

  /** What MainActivity does: held only when the mode wants it and nothing lets it go. */
  private fun holds(
    now: Long,
    inputAt: Long,
    paused: Boolean = false,
    aodOn: Boolean? = false,
    workoutOpen: Boolean = true,
    idleMs: Long = SelfDim.IDLE_RELEASE_MS,
  ): Boolean =
    SelfDim.wanted(workoutOpen = workoutOpen, onScreen = true, aodOn = aodOn, saverOn = false, blackedOut = false) &&
      SelfDim.releaseWhy(now, inputAt, paused, idleMs) == null

  @Test
  fun idleScreenIsLetGoAfterTwelveMinutesNotBefore() {
    assertEquals(12 * 60_000L, SelfDim.IDLE_RELEASE_MS)
    val t0 = 1_000_000L
    // 11:59 without a touch: still held.
    assertNull(SelfDim.releaseWhy(now = t0 + 11 * 60_000L + 59_000L, inputAt = t0, paused = false))
    assertTrue(holds(now = t0 + 11 * 60_000L + 59_999L, inputAt = t0))
    // 12:00: let go, for "idle".
    assertEquals("idle", SelfDim.releaseWhy(now = t0 + 12 * 60_000L, inputAt = t0, paused = false))
    assertFalse(holds(now = t0 + 12 * 60_000L, inputAt = t0))
    // Four hours later (the walked-away member): still let go.
    assertEquals("idle", SelfDim.releaseWhy(now = t0 + 4 * 3_600_000L, inputAt = t0, paused = false))
  }

  @Test
  fun anInputHoldsTheScreenAgain() {
    val t0 = 1_000_000L
    val late = t0 + 13 * 60_000L
    assertFalse(holds(now = late, inputAt = t0))
    // A tap, crown turn, button, wrist raise or the watch's own wake at `late` starts the wait over.
    assertTrue(holds(now = late, inputAt = late))
    assertTrue(holds(now = late + 11 * 60_000L, inputAt = late))
    assertFalse(holds(now = late + 12 * 60_000L, inputAt = late))
  }

  @Test
  fun aPausedWorkoutLetsTheScreenGoAtOnce() {
    val t0 = 1_000_000L
    // Just touched, but paused on the phone: let go.
    assertEquals("paused", SelfDim.releaseWhy(now = t0, inputAt = t0, paused = true))
    assertFalse(holds(now = t0, inputAt = t0, paused = true))
    // Paused and idle: named "paused" (the member's choice, not forgetting).
    assertEquals("paused", SelfDim.releaseWhy(now = t0 + 30 * 60_000L, inputAt = t0, paused = true))
    // Resumed (the app then starts the idle wait over): held again.
    assertTrue(holds(now = t0 + 30 * 60_000L, inputAt = t0 + 30 * 60_000L, paused = false))
  }

  @Test
  fun aClockThatWentBackIsNotIdle() {
    assertNull(SelfDim.releaseWhy(now = 0L, inputAt = 50_000L, paused = false))
  }

  @Test
  fun idleAndPauseNeverMakeTheAppHoldTheScreen() {
    val t0 = 1_000_000L
    // Always-on ON: never held, used or idle, paused or not (negative).
    assertFalse(holds(now = t0, inputAt = t0, aodOn = true))
    assertFalse(holds(now = t0 + 13 * 60_000L, inputAt = t0, aodOn = true))
    assertFalse(holds(now = t0, inputAt = t0, aodOn = true, paused = true))
    // No workout: never held (negative).
    assertFalse(holds(now = t0, inputAt = t0, workoutOpen = false))
    assertFalse(holds(now = t0, inputAt = t0, workoutOpen = false, paused = true))
  }

  @Test
  fun theShortQaIdleWaitCountsOnlyOnATestSystem() {
    // A member's watch (system build "user"): always 12 minutes, whatever the key says.
    assertEquals(SelfDim.IDLE_RELEASE_MS, SelfDim.idleReleaseMs(qaOverride = 40_000L, testOs = false))
    assertEquals(SelfDim.IDLE_RELEASE_MS, SelfDim.idleReleaseMs(qaOverride = 0L, testOs = false))
    // The cloud emulator (adb root, a test system): the key shortens it, never below 30 s or above 12 min.
    assertEquals(40_000L, SelfDim.idleReleaseMs(qaOverride = 40_000L, testOs = true))
    assertEquals(SelfDim.QA_IDLE_MIN_MS, SelfDim.idleReleaseMs(qaOverride = 1_000L, testOs = true))
    assertEquals(SelfDim.IDLE_RELEASE_MS, SelfDim.idleReleaseMs(qaOverride = 99 * 60_000L, testOs = true))
    assertEquals(SelfDim.IDLE_RELEASE_MS, SelfDim.idleReleaseMs(qaOverride = 0L, testOs = true))
    assertEquals(SelfDim.IDLE_RELEASE_MS, SelfDim.idleReleaseMs(qaOverride = -5L, testOs = true))
  }

  @Test
  fun pausedIsReadFromThePhonesLine() {
    assertTrue(WatchCopy.paused("Paused · Set 3 of 5 · 62.5 kg × 8"))
    assertTrue(WatchCopy.paused("Paused · All sets done · Finish"))
    assertTrue(WatchCopy.paused("  Paused · Rest · next set at 9:41 pm"))
    assertFalse(WatchCopy.paused("Set 3 of 5 · 62.5 kg × 8"))
    assertFalse(WatchCopy.paused(""))
    assertFalse(WatchCopy.paused("Rest · next set at 9:41 pm"))
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

  /**
   * R-557 (14 Nov 2026, owner: "Watch screen is turning off. Log switch was enabled"): his watch's inputs at every
   * wake in that diary (Always-on "aod0/-", Battery Saver off, a workout open, MettleUp just woken in front).
   * 0.77.0's check holds the screen for exactly these inputs, and the wake now writes that it did and why.
   */
  @Test
  fun ownersFourteenNovemberWakeIsHeldAndTheDiarySaysSo() {
    val aod = SelfDim.aodOn("0", null)
    assertEquals(false, aod)
    val mode = SelfDim.wanted(workoutOpen = true, onScreen = true, aodOn = aod, saverOn = false, blackedOut = false)
    assertTrue(mode)
    // Just woken: the idle wait starts at the wake, so nothing lets it go.
    assertNull(SelfDim.releaseWhy(now = 5_000L, inputAt = 5_000L, paused = false))
    assertEquals(
      "hold=1 workout=1 front=1 aod=0 saver=0 blacked=0 paused=0 quiet=0",
      SelfDim.inputs(hold = true, workoutOpen = true, onScreen = true, aodOn = aod, saverOn = false, blackedOut = false, paused = false, quiet = false),
    )
  }

  /** R-557: a wake that is NOT held names the input that stopped it (before, such a wake wrote nothing). */
  @Test
  fun aWakeThatIsNotHeldNamesWhatStoppedIt() {
    // Paused on the phone.
    assertEquals(
      "hold=0 workout=1 front=1 aod=0 saver=0 blacked=0 paused=1 quiet=0",
      SelfDim.inputs(hold = false, workoutOpen = true, onScreen = true, aodOn = false, saverOn = false, blackedOut = false, paused = true, quiet = false),
    )
    // The watch would not say its Always-on setting or Battery Saver.
    assertEquals(
      "hold=0 workout=1 front=1 aod=? saver=? blacked=0 paused=0 quiet=0",
      SelfDim.inputs(hold = false, workoutOpen = true, onScreen = true, aodOn = null, saverOn = null, blackedOut = false, paused = false, quiet = false),
    )
    // No workout open (the phone went quiet for 4 h, or no workout).
    assertEquals(
      "hold=0 workout=0 front=1 aod=0 saver=0 blacked=0 paused=0 quiet=0",
      SelfDim.inputs(hold = false, workoutOpen = false, onScreen = true, aodOn = false, saverOn = false, blackedOut = false, paused = false, quiet = false),
    )
  }
}
