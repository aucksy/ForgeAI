package com.forgeai.wear

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** R-166: what the watch says about the next set (last time's numbers, today's). */
class NextSetTextTest {
  private val bench = NextSet("Set 3 of 5", "60 kg × 8", "62.5 kg × 8")

  @Test
  fun lastAndTodayWhenTheyDiffer() {
    assertTrue(NextSetText.has(bench))
    assertEquals("60 kg × 8", NextSetText.last(bench))
    assertEquals("62.5 kg × 8", NextSetText.today(bench))
  }

  @Test
  fun oneLineWhenTodayIsLastTime() {
    val same = NextSet("Set 2 of 4", "70 kg × 8", "70 kg × 8")
    assertEquals("70 kg × 8", NextSetText.last(same))
    assertNull(NextSetText.today(same))
  }

  @Test
  fun firstTimeHasNoLastLine() {
    val first = NextSet("Set 1 of 3", "", "15 kg × 12")
    assertNull(NextSetText.last(first))
    assertEquals("15 kg × 12", NextSetText.today(first))
  }

  @Test
  fun anOlderPhoneAppSendsNoLines() {
    assertFalse(NextSetText.has(NextSet.NONE))
    assertNull(NextSetText.today(NextSet.NONE))
  }

  @Test
  fun restHeaderKeepsTheSetFirst() {
    assertEquals("Set 3 of 5 · Bench Press", NextSetText.restHeader(bench, "Bench Press"))
    assertEquals("Set 3 of 5", NextSetText.restHeader(bench, " "))
    assertEquals("Bench Press", NextSetText.restHeader(NextSet.NONE, "Bench Press"))
  }
}
