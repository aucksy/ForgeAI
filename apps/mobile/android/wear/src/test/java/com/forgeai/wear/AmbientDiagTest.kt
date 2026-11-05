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
    assertTrue(heal.blackout(screenOn = false, ambient = false, ambientWorked = true, workoutOpen = true, finishing = false))
    // The member left the app (button, call screen on top): the screen is still on.
    assertFalse(heal.blackout(screenOn = true, ambient = false, ambientWorked = true, workoutOpen = true, finishing = false))
    // Stopped from the dim state (Wear OS returning to the watch face): not this fault.
    assertFalse(heal.blackout(screenOn = false, ambient = true, ambientWorked = true, workoutOpen = true, finishing = false))
    // Never dimmed since the app started: the watch's always-on screen may simply be off.
    assertFalse(heal.blackout(screenOn = false, ambient = false, ambientWorked = false, workoutOpen = true, finishing = false))
    // No workout open: going dark is allowed.
    assertFalse(heal.blackout(screenOn = false, ambient = false, ambientWorked = true, workoutOpen = false, finishing = false))
    // Closing or already rebuilding.
    assertFalse(heal.blackout(screenOn = false, ambient = false, ambientWorked = true, workoutOpen = true, finishing = true))
  }

  @Test
  fun rebuildsStopAfterTheCap() {
    assertTrue(heal.shouldRebuild(blackoutSeen = true, tries = 0))
    assertTrue(heal.shouldRebuild(blackoutSeen = true, tries = heal.MAX_TRIES - 1))
    // A rebuild that did not help twice: the cause is not this app; only log from then on.
    assertFalse(heal.shouldRebuild(blackoutSeen = true, tries = heal.MAX_TRIES))
    assertFalse(heal.shouldRebuild(blackoutSeen = false, tries = 0))
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
}
