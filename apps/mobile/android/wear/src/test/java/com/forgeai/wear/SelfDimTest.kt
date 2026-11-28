package com.forgeai.wear

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

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

  /**
   * What MainActivity does: held only when the mode wants it and nothing lets it go. R-636: [activityAt] is the
   * later of the last watch input and the last workout change ([SelfDim.activityAt]); a pause is no reason any more.
   */
  private fun holds(
    now: Long,
    activityAt: Long,
    aodOn: Boolean? = false,
    workoutOpen: Boolean = true,
    idleMs: Long = SelfDim.IDLE_RELEASE_MS,
  ): Boolean =
    SelfDim.wanted(workoutOpen = workoutOpen, onScreen = true, aodOn = aodOn, saverOn = false, blackedOut = false) &&
      SelfDim.releaseWhy(now, activityAt, idleMs) == null

  @Test
  fun idleScreenIsLetGoAfterTwelveMinutesNotBefore() {
    assertEquals(12 * 60_000L, SelfDim.IDLE_RELEASE_MS)
    val t0 = 1_000_000L
    // 11:59 with no input and no workout change: still held.
    assertNull(SelfDim.releaseWhy(now = t0 + 11 * 60_000L + 59_000L, activityAt = t0))
    assertTrue(holds(now = t0 + 11 * 60_000L + 59_999L, activityAt = t0))
    // 12:00: let go, for "idle".
    assertEquals("idle", SelfDim.releaseWhy(now = t0 + 12 * 60_000L, activityAt = t0))
    assertFalse(holds(now = t0 + 12 * 60_000L, activityAt = t0))
    // Four hours later (the walked-away member): still let go.
    assertEquals("idle", SelfDim.releaseWhy(now = t0 + 4 * 3_600_000L, activityAt = t0))
  }

  @Test
  fun anInputHoldsTheScreenAgain() {
    val t0 = 1_000_000L
    val late = t0 + 13 * 60_000L
    assertFalse(holds(now = late, activityAt = t0))
    // A tap, crown turn, button, wrist raise or the watch's own wake at `late` starts the wait over.
    assertTrue(holds(now = late, activityAt = late))
    assertTrue(holds(now = late + 11 * 60_000L, activityAt = late))
    assertFalse(holds(now = late + 12 * 60_000L, activityAt = late))
  }

  /**
   * R-636 (owner, 28 Nov 2026, O-40): a pause on the phone let the screen go at once ("paused"), so the workout
   * left the watch. Now a paused workout is held like any other, until the idle wait with no change at all.
   */
  @Test
  fun aPausedWorkoutIsHeldUntilTheIdleWait() {
    val t0 = 1_000_000L
    // Paused at 0 (a change: the set line now starts "Paused · "), then nothing: held at 0 and at 11:59.
    val running = WatchState.Snapshot(rest = null, workoutActive = true, title = "Bench Press", text = "Set 3 of 4")
    val paused = running.copy(text = "Paused · Set 3 of 4")
    assertTrue(WatchCopy.paused(paused.text))
    assertTrue(SelfDim.workoutChanged(running, paused))
    assertNull(SelfDim.releaseWhy(now = t0, activityAt = t0))
    assertTrue(holds(now = t0, activityAt = t0))
    assertNull(SelfDim.releaseWhy(now = t0 + 11 * 60_000L + 59_000L, activityAt = t0))
    // 12:00 with no change: let go, and the word is "idle" (no "paused" word any more), so a tap holds it again.
    assertEquals("idle", SelfDim.releaseWhy(now = t0 + 12 * 60_000L, activityAt = t0))
    assertFalse(holds(now = t0 + 12 * 60_000L, activityAt = t0))
    // Resumed on the phone later: also a change, so the wait starts there.
    assertTrue(SelfDim.workoutChanged(paused, running))
  }

  /** R-636: watch input at 0, a workout change on the phone at 11:00, then nothing: held at 22:59, let go at 23:00. */
  @Test
  fun activityIsTheLaterOfWatchInputAndAWorkoutChange() {
    val t0 = 1_000_000L
    val change = t0 + 11 * 60_000L
    assertEquals(change, SelfDim.activityAt(inputAt = t0, changeAt = change))
    // A watch input later than the change counts instead.
    assertEquals(change + 5_000L, SelfDim.activityAt(inputAt = change + 5_000L, changeAt = change))
    // No change yet (0): the watch input alone, as before.
    assertEquals(t0, SelfDim.activityAt(inputAt = t0, changeAt = 0L))
    val act = SelfDim.activityAt(inputAt = t0, changeAt = change)
    assertNull(SelfDim.releaseWhy(now = t0 + 22 * 60_000L + 59_000L, activityAt = act))
    assertEquals("idle", SelfDim.releaseWhy(now = t0 + 23 * 60_000L, activityAt = act))
    // The same snapshot re-sent every minute is no change, so the wait still ends 12 min after the last real one.
    val snap = WatchState.Snapshot(rest = null, workoutActive = true, title = "Bench Press", text = "Set 3 of 4")
    assertFalse(SelfDim.workoutChanged(snap, snap.copy()))
  }

  /** R-636: a workout change = any field of the screen's copy except the gym colour; an equal copy is none. */
  @Test
  fun aWorkoutChangeIsAnyFieldButTheGymColour() {
    val base = WatchState.Snapshot(
      rest = WatchState.Rest(startedAt = 1_000L, endsAt = 121_000L, next = "Set 3 of 4 · Bench Press"),
      workoutActive = true,
      title = "Bench Press",
      text = "Set 3 of 4 · 60 kg × 8",
      next = NextSet("Set 3 of 4", "60 kg × 8", "60 kg × 8"),
      overAt = 0L,
      accent = null,
      savedAt = 0L,
      logFlow = true,
      entry = SetEntry(wOn = true, rOn = true, w = 60.0, r = 8, unit = "kg", step = 2.5, warm = false, rpe = false, rest = 120),
      row = "{\"setKey\":\"s3\"}",
    )
    // A retry, a flush or a re-send: equal, no change.
    assertFalse(SelfDim.workoutChanged(base, base.copy()))
    // Only the gym colour differs: no change.
    assertFalse(SelfDim.workoutChanged(base, base.copy(accent = 0xFF00AA55.toInt())))
    // Each other field differing: a change.
    assertTrue(SelfDim.workoutChanged(base, base.copy(rest = null)))
    assertTrue(SelfDim.workoutChanged(base, base.copy(rest = base.rest!!.copy(endsAt = 136_000L))))
    assertTrue(SelfDim.workoutChanged(base, base.copy(workoutActive = false)))
    assertTrue(SelfDim.workoutChanged(base, base.copy(title = "Incline Press")))
    assertTrue(SelfDim.workoutChanged(base, base.copy(text = "Paused · Set 3 of 4 · 60 kg × 8")))
    assertTrue(SelfDim.workoutChanged(base, base.copy(next = NextSet("Set 4 of 4", "60 kg × 8", "60 kg × 8"))))
    assertTrue(SelfDim.workoutChanged(base, base.copy(overAt = 121_000L)))
    assertTrue(SelfDim.workoutChanged(base, base.copy(savedAt = 200_000L)))
    assertTrue(SelfDim.workoutChanged(base, base.copy(logFlow = false)))
    assertTrue(SelfDim.workoutChanged(base, base.copy(entry = base.entry!!.copy(r = 10))))
    assertTrue(SelfDim.workoutChanged(base, base.copy(entry = null)))
    assertTrue(SelfDim.workoutChanged(base, base.copy(row = "{\"setKey\":\"s4\"}")))
  }

  /**
   * R-636: the heart sensor runs on the bright screen as before, AND on the app's own dim screen while it is held
   * (the owner: "not capturing the heart rate when it's dim"); never in the watch's own dim (Always-on on), never
   * after a let-go, never on the "needs MettleUp Plus" screen.
   */
  @Test
  fun theHeartSensorRunsBrightAndWhileHeldDimOnly() {
    fun m(
      onScreen: Boolean = true,
      systemDim: Boolean = false,
      selfDim: Boolean = false,
      held: Boolean = true,
      allowed: Boolean = true,
      workoutOrRest: Boolean = true,
      locked: Boolean = false,
    ) = SelfDim.measureHeart(onScreen, systemDim, selfDim, held, allowed, workoutOrRest, locked)
    // Bright (held or not: Battery Saver, Always-on on before the watch dims): as today.
    assertTrue(m())
    assertTrue(m(held = false))
    // The app's own dim screen while held: now measured.
    assertTrue(m(selfDim = true, held = true))
    // Let go (12 min with no change): the sensor stops.
    assertFalse(m(selfDim = true, held = false))
    // The watch's own dim state (Always-on on): off, as today.
    assertFalse(m(systemDim = true, held = false))
    assertFalse(m(systemDim = true, selfDim = true, held = true))
    // Not allowed, no workout and no rest, another app in front, the "needs MettleUp Plus" screen.
    assertFalse(m(allowed = false))
    assertFalse(m(workoutOrRest = false))
    assertFalse(m(onScreen = false))
    assertFalse(m(locked = true))
    assertFalse(m(selfDim = true, held = true, locked = true))
  }

  /** R-636: off the wrist, a workout change is not activity (a watch left on a bench goes dark as today). */
  @Test
  fun aChangeOffTheWristDoesNotCount() {
    assertFalse(SelfDim.countsChange(HeartRate.Status.OFF_WRIST))
    assertTrue(SelfDim.countsChange(HeartRate.Status.READING))
    assertTrue(SelfDim.countsChange(HeartRate.Status.WAITING))
    assertTrue(SelfDim.countsChange(HeartRate.Status.UNAVAILABLE))
    assertTrue(SelfDim.countsChange(HeartRate.Status.NO_SENSOR))
  }

  /** R-636: the test-only live workout push and the QA idle key count only on a test build of the watch's system. */
  @Test
  fun testOnlyHooksNeedATestSystemBuild() {
    assertFalse(SelfDim.testOs("user"))
    assertTrue(SelfDim.testOs("userdebug"))
    assertTrue(SelfDim.testOs("eng"))
  }

  /**
   * R-636: the two new diary words say what the screen did, and the phone's log keeps them (watchDiag.ts
   * SELF_DIM_WHY). No diary line MainActivity writes carries the heart rate (privacy notice: not saved or sent).
   */
  @Test
  fun theDiaryGetsTwoNewWordsAndNeverTheHeartRate() {
    assertEquals("change", SelfDim.WHY_CHANGE)
    assertEquals("off-wrist", SelfDim.WHY_OFF_WRIST)
    val phone = File("../../src/lib/watchDiag.ts").readText()
    val why = phone.lines().first { it.contains("const SELF_DIM_WHY") }
    assertTrue("the phone drops \"change\": $why", why.contains("'change'"))
    assertTrue("the phone drops \"off-wrist\": $why", why.contains("'off-wrist'"))
    val notes = File("src/main/java/com/forgeai/wear/MainActivity.kt").readLines().filter { it.contains("AmbientDiag.note(") }
    assertTrue("no diary lines found in MainActivity.kt", notes.size >= 10)
    for (line in notes) {
      for (word in listOf("bpm", "hrStatus", "heart", "Heart")) {
        assertFalse("a diary line carries \"$word\": ${line.trim()}", line.contains(word))
      }
    }
  }

  @Test
  fun aClockThatWentBackIsNotIdle() {
    assertNull(SelfDim.releaseWhy(now = 0L, activityAt = 50_000L))
  }

  @Test
  fun idleNeverMakesTheAppHoldTheScreen() {
    val t0 = 1_000_000L
    // Always-on ON: never held, used or idle (negative).
    assertFalse(holds(now = t0, activityAt = t0, aodOn = true))
    assertFalse(holds(now = t0 + 13 * 60_000L, activityAt = t0, aodOn = true))
    // No workout: never held (negative).
    assertFalse(holds(now = t0, activityAt = t0, workoutOpen = false))
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
    assertNull(SelfDim.releaseWhy(now = 5_000L, activityAt = 5_000L))
    assertEquals(
      "hold=1 workout=1 front=1 aod=0 saver=0 blacked=0 paused=0 quiet=0",
      SelfDim.inputs(hold = true, workoutOpen = true, onScreen = true, aodOn = aod, saverOn = false, blackedOut = false, paused = false, quiet = false),
    )
  }

  /** R-557: a wake that is NOT held names the input that stopped it (before, such a wake wrote nothing). */
  @Test
  fun aWakeThatIsNotHeldNamesWhatStoppedIt() {
    // Always-on on (the watch dims it). R-636: a pause on the phone no longer stops the hold; paused= is still
    // written as read, so the diary shows a paused workout that IS held (hold=1 paused=1).
    assertEquals(
      "hold=0 workout=1 front=1 aod=1 saver=0 blacked=0 paused=1 quiet=0",
      SelfDim.inputs(hold = false, workoutOpen = true, onScreen = true, aodOn = true, saverOn = false, blackedOut = false, paused = true, quiet = false),
    )
    assertEquals(
      "hold=1 workout=1 front=1 aod=0 saver=0 blacked=0 paused=1 quiet=0",
      SelfDim.inputs(hold = true, workoutOpen = true, onScreen = true, aodOn = false, saverOn = false, blackedOut = false, paused = true, quiet = false),
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
