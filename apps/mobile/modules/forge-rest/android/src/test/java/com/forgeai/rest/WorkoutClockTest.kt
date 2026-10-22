package com.forgeai.rest

import org.junit.Assert.assertEquals
import org.junit.Test

/** R-55: the paused workout time in the live card's header, in the app's own m:ss. */
class WorkoutClockTest {
  @Test
  fun `under an hour reads minutes and seconds`() {
    assertEquals("0:00", WorkoutCard.clockText(0L))
    assertEquals("0:59", WorkoutCard.clockText(59_999L))
    assertEquals("42:15", WorkoutCard.clockText((42L * 60 + 15) * 1000))
  }

  @Test
  fun `past an hour reads hours minutes and seconds`() {
    assertEquals("1:00:00", WorkoutCard.clockText(3_600_000L))
    assertEquals("1:02:30", WorkoutCard.clockText((3600L + 150) * 1000))
  }
}
