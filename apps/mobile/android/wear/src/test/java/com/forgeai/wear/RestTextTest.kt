package com.forgeai.wear

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RestTextTest {
  @Test
  fun remainingRoundsUpSoTheEndIsNeverEarly() {
    assertEquals("1:30", RestText.remaining(0L, 90_000L))
    assertEquals("0:01", RestText.remaining(0L, 200L))
    assertEquals("0:00", RestText.remaining(5_000L, 5_000L))
    assertEquals("0:00", RestText.remaining(9_000L, 5_000L))
    assertEquals("0:05", RestText.remaining(0L, 4_001L))
  }

  @Test
  fun clockFormats() {
    assertEquals("0:09", RestText.clock(9L))
    assertEquals("12:00", RestText.clock(720L))
    assertEquals("1:02:03", RestText.clock(3_723L))
    assertEquals("0:00", RestText.clock(-4L))
  }

  @Test
  fun ringSweepIsTheShareLeft() {
    assertEquals(1f, RestText.fractionLeft(0L, 0L, 60_000L), 0.0001f)
    assertEquals(0.5f, RestText.fractionLeft(30_000L, 0L, 60_000L), 0.0001f)
    assertEquals(0f, RestText.fractionLeft(70_000L, 0L, 60_000L), 0.0001f)
    assertEquals(1f, RestText.fractionLeft(-5_000L, 0L, 60_000L), 0.0001f)
    assertEquals(0f, RestText.fractionLeft(0L, 10L, 10L), 0.0001f)
  }

  @Test
  fun nextLine() {
    assertEquals("Next: Bench Press, set 3", RestText.nextLine("Bench Press, set 3"))
    assertEquals("All sets done", RestText.nextLine("All sets done"))
    assertNull(RestText.nextLine(""))
    assertNull(RestText.nextLine("  "))
    assertNull(RestText.nextLine(null))
  }

  @Test
  fun bpmShowsADashUntilARealReading() {
    assertEquals("—", RestText.bpm(null))
    assertEquals("—", RestText.bpm(0.0))
    assertEquals("—", RestText.bpm(Double.NaN))
    assertEquals("128", RestText.bpm(127.6))
  }

  @Test
  fun phoneEndBuzzesOnlyWhenRecent() {
    assertTrue(RestText.buzzOnPhoneEnd(100_000L, 99_000L))
    assertTrue(RestText.buzzOnPhoneEnd(100_000L, 101_500L)) // watch clock a little behind
    assertFalse(RestText.buzzOnPhoneEnd(500_000L, 100_000L)) // settled long after
    assertFalse(RestText.buzzOnPhoneEnd(100_000L, 0L))
  }

  @Test
  fun completeSetHidesOnlyForTheRowJustSentAndOnlyBriefly() {
    val row = "{\"exKey\":\"a\",\"setKey\":\"3\"}"
    assertTrue(RestText.sentRecently(row, row, 1_000L, 5_000L))
    assertFalse(RestText.sentRecently(row, row, 1_000L, 1_000L + RestText.SENT_MS)) // no answer: back
    assertFalse(RestText.sentRecently("{\"exKey\":\"a\",\"setKey\":\"4\"}", row, 1_000L, 5_000L)) // next row
    assertFalse(RestText.sentRecently(row, null, 1_000L, 5_000L))
    assertFalse(RestText.sentRecently("", "", 1_000L, 5_000L)) // no row: nothing to hide
  }

  @Test
  fun lateArrivalBuzzesOnlyWithinFiveSeconds() {
    assertTrue(RestText.buzzOnLateArrival(10_000L, 10_000L))
    assertTrue(RestText.buzzOnLateArrival(14_000L, 10_000L))
    assertFalse(RestText.buzzOnLateArrival(16_000L, 10_000L))
    assertFalse(RestText.buzzOnLateArrival(9_000L, 10_000L))
  }
}
