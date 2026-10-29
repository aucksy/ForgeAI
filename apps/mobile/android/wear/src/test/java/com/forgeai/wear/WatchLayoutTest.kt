package com.forgeai.wear

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** R-207: the "Ring" design's maths, copy and screen choice (WatchLayout.kt), on the plain JVM. */
class WatchLayoutTest {
  private val open = WatchState.Snapshot(rest = null, workoutActive = true, title = "Bench Press", next = NextSet("Set 3 of 5", "60 kg × 8", "62.5 kg × 8"))
  private val rest = WatchState.Rest(startedAt = 1_000L, endsAt = 121_000L, next = "")

  // ---------------------------------------------------------------- screen choice

  @Test
  fun permissionsComeFirstHeartRateBeforeAlerts() {
    assertEquals(WatchScreenKind.PERMISSION_HEART_RATE, ScreenSelector.select(open.copy(rest = rest), true, true, false))
    assertEquals(WatchScreenKind.PERMISSION_ALERTS, ScreenSelector.select(open.copy(rest = rest), false, true, false))
  }

  @Test
  fun disconnectedHidesNothingTheWatchRunsItself() {
    // 0.61.0 review: the watch runs the countdown and the buzz, so a lost phone link never hides them.
    assertEquals(WatchScreenKind.REST_TIMER, ScreenSelector.select(open.copy(rest = rest), false, false, false))
    assertEquals(WatchScreenKind.REST_IS_OVER, ScreenSelector.select(open.copy(overAt = 5L), false, false, false))
    assertEquals(WatchScreenKind.PHONE_NOT_CONNECTED, ScreenSelector.select(open, false, false, false))
    assertEquals(WatchScreenKind.PHONE_NOT_CONNECTED, ScreenSelector.select(WatchState.Snapshot(null, false, ""), false, false, false))
  }

  @Test
  fun noWorkoutIsNothingOpenEvenWithAStaleRestOver() {
    val closed = WatchState.Snapshot(null, false, "", overAt = 5L)
    assertEquals(WatchScreenKind.NOTHING_OPEN, ScreenSelector.select(closed, false, false, true))
  }

  @Test
  fun aRunningRestBeatsRestIsOver() {
    assertEquals(WatchScreenKind.REST_TIMER, ScreenSelector.select(open.copy(rest = rest, overAt = 5L), false, false, true))
    assertEquals(WatchScreenKind.REST_IS_OVER, ScreenSelector.select(open.copy(overAt = 5L), false, false, true))
    assertEquals(WatchScreenKind.BETWEEN_RESTS, ScreenSelector.select(open, false, false, true))
  }

  @Test
  fun everyFlagCombinationPicksExactlyTheSpecOrder() {
    val b = listOf(false, true)
    for (hr in b) for (al in b) for (ph in b) for (wo in b) for (re in b) for (ov in b) {
      val want = when {
        hr -> WatchScreenKind.PERMISSION_HEART_RATE
        al -> WatchScreenKind.PERMISSION_ALERTS
        wo && re -> WatchScreenKind.REST_TIMER
        wo && ov -> WatchScreenKind.REST_IS_OVER
        !ph -> WatchScreenKind.PHONE_NOT_CONNECTED
        !wo -> WatchScreenKind.NOTHING_OPEN
        else -> WatchScreenKind.BETWEEN_RESTS
      }
      assertEquals(want, ScreenSelector.select(hr, al, ph, wo, re, ov))
    }
  }

  // ---------------------------------------------------------------- ring

  @Test
  fun restSweepIsTheShareLeftOfAFullCircle() {
    assertEquals(360f, RingMath.restSweep(1f), 0.001f)
    assertEquals(249f, RingMath.restSweep(83f / 120f), 0.001f)
    assertEquals(0f, RingMath.restSweep(0f), 0.001f)
    assertEquals(0f, RingMath.restSweep(-0.5f), 0.001f)
    assertEquals(360f, RingMath.restSweep(2f), 0.001f)
    assertEquals(0f, RingMath.restSweep(Float.NaN), 0.001f)
  }

  @Test
  fun ringStartsAtTwelveOClock() {
    assertEquals(-90f, RingMath.START_ANGLE, 0f)
  }

  @Test
  fun scaleIsWidthOver456() {
    assertEquals(1f, RingMath.scale(456f), 0.0001f)
    assertEquals(384f / 456f, RingMath.scale(384f), 0.0001f)
  }

  @Test
  fun fourSegmentsMatchTheHandOff() {
    // Set 2 of 4: one done, one current, two upcoming; each 80 degrees, starting 5 degrees past 12.
    val s = RingMath.segments(2, 4)
    assertEquals(4, s.size)
    assertEquals(listOf(RingMath.SegmentState.DONE, RingMath.SegmentState.CURRENT, RingMath.SegmentState.UPCOMING, RingMath.SegmentState.UPCOMING), s.map { it.state })
    assertEquals(listOf(-85f, 5f, 95f, 185f), s.map { it.startAngle })
    for (seg in s) assertEquals(80f, seg.sweep, 0.0001f)
  }

  @Test
  fun segmentGapsAreTenDegreesAndCloseTheCircle() {
    for (n in 1..12) {
      val s = RingMath.segments(1, n)
      assertEquals(n, s.size)
      for (i in 0 until n - 1) assertEquals(10f, s[i + 1].startAngle - (s[i].startAngle + s[i].sweep), 0.001f)
      val wrap = (s[0].startAngle + 360f) - (s[n - 1].startAngle + s[n - 1].sweep)
      assertEquals(10f, wrap, 0.001f)
    }
  }

  @Test
  fun segmentIndexIsClampedAndUnknownCountDrawsNothing() {
    assertTrue(RingMath.segments(3, 0).isEmpty())
    assertEquals(RingMath.SegmentState.CURRENT, RingMath.segments(0, 3)[0].state)
    assertEquals(RingMath.SegmentState.CURRENT, RingMath.segments(9, 3)[2].state)
    assertEquals(0f, RingMath.segments(1, 40)[0].sweep, 0f) // 9 degrees each: no room after the gap
  }

  // ---------------------------------------------------------------- copy

  @Test
  fun setCardReadsThePhonesLines() {
    val c = WatchCopy.card(open)
    assertEquals(3, c.setIndex)
    assertEquals(5, c.setCount)
    assertEquals("Previous 60 kg × 8", c.previous)
    assertEquals("Next 62.5 kg × 8", c.next)
    assertEquals("Next: Set 3 of 5 · Bench Press", WatchCopy.nextSetLine(c))
    assertEquals("Set 3", WatchCopy.setNumber(c))
    assertEquals("of 5", WatchCopy.setOf(c))
  }

  @Test
  fun emptyLinesAreLeftOut() {
    val c = WatchCopy.card("Cable Fly", NextSet("", "", ""))
    assertNull(c.previous)
    assertNull(c.next)
    assertNull(WatchCopy.nextSetLine(c))
    assertNull(WatchCopy.setNumber(c))
    assertNull(WatchCopy.setOf(c))
    assertEquals(0 to 0, WatchCopy.parseSet("All sets done"))
  }

  @Test
  fun longNameRuleIsOverThirtyCharacters() {
    // "Next: Set 3 of 5 · " is 19 characters: an 11-character name is exactly 30, still short.
    assertFalse(WatchCopy.isLongName(WatchCopy.card("Bench Press", NextSet("Set 3 of 5", "", ""))))
    assertTrue(WatchCopy.isLongName(WatchCopy.card("Bench Press 2", NextSet("Set 3 of 5", "", ""))))
    assertFalse(WatchCopy.isLongBetweenName("Incline Bench Pres")) // 18
    assertTrue(WatchCopy.isLongBetweenName("Incline Bench Press")) // 19
  }

  @Test
  fun overtimeCountsUpWithAMinusSign() {
    assertEquals("−0:00", WatchCopy.overtime(1_000L, 1_000L))
    assertEquals("−0:12", WatchCopy.overtime(13_500L, 1_000L))
    assertEquals("−0:00", WatchCopy.overtime(0L, 1_000L))
    assertEquals('−', WatchCopy.overtime(0L, 0L)[0])
  }

  @Test
  fun heartLineHidesWhenDeclinedNoSensorOrAmbient() {
    assertEquals(WatchCopy.HeartLine("♥ 132", false), WatchCopy.heartLine(true, HeartRate.Status.READING, 132.0, false))
    assertEquals(WatchCopy.HeartLine("♥ —", true), WatchCopy.heartLine(true, HeartRate.Status.WAITING, null, false))
    assertNull(WatchCopy.heartLine(false, HeartRate.Status.READING, 132.0, false))
    assertNull(WatchCopy.heartLine(true, HeartRate.Status.NO_SENSOR, null, false))
    assertNull(WatchCopy.heartLine(true, HeartRate.Status.READING, 132.0, true))
  }

  @Test
  fun everyWordIsTheHandOffsCopy() {
    assertEquals("Rest is over", WatchCopy.REST_IS_OVER)
    assertEquals("Start a workout on your phone", WatchCopy.START_A_WORKOUT)
    assertEquals("Phone not connected", WatchCopy.PHONE_NOT_CONNECTED)
    assertEquals("Keep your phone near you.", WatchCopy.KEEP_PHONE_NEAR)
    assertEquals("Allow", WatchCopy.ALLOW)
    assertEquals("Not now", WatchCopy.NOT_NOW)
    assertEquals("1 of 2", WatchCopy.STEP_HEART_RATE)
    assertEquals("2 of 2", WatchCopy.STEP_ALERTS)
    assertEquals("Heart rate", WatchCopy.TITLE_HEART_RATE)
    assertEquals("Rest alerts", WatchCopy.TITLE_ALERTS)
    assertEquals("Shows how hard your heart works while you rest.", WatchCopy.REASON_HEART_RATE)
    assertEquals("Your watch buzzes when rest is over.", WatchCopy.REASON_ALERTS)
  }
}
