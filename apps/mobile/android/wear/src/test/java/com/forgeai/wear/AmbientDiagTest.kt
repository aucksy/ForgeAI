package com.forgeai.wear

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AmbientDiagTest {
  private val heal = AmbientDiag.Heal

  // R-353: the screen went OFF mid-workout where it dimmed earlier: that is the fault we rebuild for.
  @Test
  fun blackoutOnlyWhenTheScreenWentOffInsteadOfDimming() {
    assertTrue(heal.blackout(screenOn = false, ambient = false, ambientWorked = true, workoutOpen = true, finishing = false, saverOn = false))
    // The member left the app (button, call screen on top): the screen is still on.
    assertFalse(heal.blackout(screenOn = true, ambient = false, ambientWorked = true, workoutOpen = true, finishing = false, saverOn = false))
    // Stopped from the dim state (Wear OS returning to the watch face): not this fault.
    assertFalse(heal.blackout(screenOn = false, ambient = true, ambientWorked = true, workoutOpen = true, finishing = false, saverOn = false))
    // Never dimmed since the app started: the watch's always-on screen may simply be off.
    assertFalse(heal.blackout(screenOn = false, ambient = false, ambientWorked = false, workoutOpen = true, finishing = false, saverOn = false))
    // No workout open: going dark is allowed.
    assertFalse(heal.blackout(screenOn = false, ambient = false, ambientWorked = true, workoutOpen = false, finishing = false, saverOn = false))
    // Closing or already rebuilding.
    assertFalse(heal.blackout(screenOn = false, ambient = false, ambientWorked = true, workoutOpen = true, finishing = true, saverOn = false))
  }

  @Test
  fun rebuildsStopAfterTheCap() {
    assertTrue(heal.shouldRebuild(blackoutSeen = true, tries = 0))
    assertTrue(heal.shouldRebuild(blackoutSeen = true, tries = heal.MAX_TRIES - 1))
    // A rebuild that did not help twice: the cause is not this app; only log from then on.
    assertFalse(heal.shouldRebuild(blackoutSeen = true, tries = heal.MAX_TRIES))
    assertFalse(heal.shouldRebuild(blackoutSeen = false, tries = 0))
  }

  // R-437: Battery Saver turned the dim screen off itself (Google: it "disables the Always-on Display but
  // keeps Tilt-to-wake"): not a fault a rebuild can fix, so none is tried.
  @Test
  fun batterySaverBlackScreenIsTheWatchsNotARebuild() {
    assertFalse(heal.blackout(screenOn = false, ambient = false, ambientWorked = true, workoutOpen = true, finishing = false, saverOn = true))
  }

  // R-437: a workout that used up both tries no longer leaves the heal off for the next workouts.
  @Test
  fun eachWorkoutGetsItsOwnTries() {
    assertEquals(heal.MAX_TRIES, heal.triesFor(seenWorkout = 3, workout = 3, tries = heal.MAX_TRIES))
    assertEquals(0, heal.triesFor(seenWorkout = 3, workout = 4, tries = heal.MAX_TRIES))
    assertTrue(heal.shouldRebuild(blackoutSeen = true, tries = heal.triesFor(3, 4, heal.MAX_TRIES)))
    val before = AmbientDiag.workoutCount
    AmbientDiag.newWorkout()
    assertEquals(before + 1, AmbientDiag.workoutCount)
  }

  // R-437: the diary names the watch's own reason for a black screen.
  @Test
  fun watchCauseNamesBatterySaverThenAlwaysOnOff() {
    assertEquals("battery-saver", AmbientDiag.watchCause(saverOn = true, aodGlobal = "1"))
    assertEquals("battery-saver", AmbientDiag.watchCause(saverOn = true, aodGlobal = "0"))
    assertEquals("always-on-off", AmbientDiag.watchCause(saverOn = false, aodGlobal = "0"))
    assertEquals("", AmbientDiag.watchCause(saverOn = false, aodGlobal = "1"))
    // Unreadable on this watch ("?", "-", unknown saver): no reason claimed.
    assertEquals("", AmbientDiag.watchCause(saverOn = null, aodGlobal = "?"))
    assertEquals("", AmbientDiag.watchCause(saverOn = false, aodGlobal = "-"))
  }

  @Test
  fun diaryKeepsTheNewestLines() {
    val l = AmbientDiag.Lines
    var lines = emptyList<String>()
    for (i in 1..5) lines = l.append(lines, "e$i", max = 3)
    assertEquals(listOf("e3", "e4", "e5"), lines)
    assertEquals(lines, l.split(l.join(lines)))
    assertEquals(emptyList<String>(), l.split(""))
    assertEquals("11-05 10:00:00.000 stop screen=0", l.line("11-05 10:00:00.000", "stop", "screen=0"))
    assertEquals("11-05 10:00:00.000 focus", l.line("11-05 10:00:00.000", "focus"))
  }

  /**
   * R-557 (14 Nov 2026): the owner's black screens came from a watch app older than 0.77.0. 0.77.0 and later write
   * cause=always-on-off on every black stop in an open workout with Always-on off (and now held=); his diary's
   * stops ("stop amb0 wo1 bo0 sc0 bs0 id0 aod0/- th0", as the phone sent them) carry neither: 0.76.0's line.
   */
  @Test
  fun ownersBlackStopsHaveTheLineOfAWatchAppOlderThan077() {
    val now = AmbientDiag.stopDetail(ambient = false, workoutOpen = true, blackout = false, held = false, cause = AmbientDiag.watchCause(saverOn = false, aodGlobal = "0"))
    assertEquals("ambient=0 workout=1 blackout=0 held=0 cause=always-on-off ", now)
    val his = "ambient=0 workout=1 blackout=0 screen=0 saver=0 idle=0 aod=0/- theatre=0"
    assertFalse(his.contains("cause="))
    assertFalse(his.contains("held="))
    // Held by the app and still black: the watch switched the screen off itself (held=1), named apart.
    assertEquals("ambient=0 workout=1 blackout=0 held=1 cause=always-on-off ", AmbientDiag.stopDetail(false, true, false, true, "always-on-off"))
    // Nothing to name: no cause word at all.
    assertEquals("ambient=1 workout=0 blackout=0 held=0 ", AmbientDiag.stopDetail(true, false, false, false, ""))
  }
}
