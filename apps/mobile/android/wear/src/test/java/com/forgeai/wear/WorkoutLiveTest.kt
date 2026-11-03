package com.forgeai.wear

import com.forgeai.wear.WorkoutLive.KeepAlive.Mode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WorkoutLiveTest {
  // Review of 0.63.0: a phone that never says "ended" must not leave the workout notice up forever.
  @Test
  fun freshOnlyUnderTheCap() {
    val now = 10_000_000_000L
    assertTrue(WorkoutLive.fresh(now - 60_000L, now))
    assertTrue(WorkoutLive.fresh(now - WorkoutLive.CAP_MS + 1, now))
    assertFalse(WorkoutLive.fresh(now - WorkoutLive.CAP_MS, now))
    assertFalse(WorkoutLive.fresh(0L, now)) // an older app version never saved the time
    assertFalse(WorkoutLive.fresh(now + 60_000L, now)) // the watch clock went back: not trusted
  }

  // R-297: the workout is held by a foreground service only when Android allows starting one.
  @Test
  fun serviceOnlyFromTheScreenWithHeartRateOnAndroid14() {
    val k = WorkoutLive.KeepAlive
    // No open workout: everything goes, whatever else is true.
    assertEquals(Mode.OFF, k.mode(open = false, inFront = true, sdk = 34, heartAllowed = true))
    assertEquals(Mode.OFF, k.mode(open = false, inFront = false, sdk = 30, heartAllowed = false))
    // Screen up, Android 14+ (Wear OS 5/6), heart rate allowed: the health-type service.
    assertEquals(Mode.SERVICE, k.mode(open = true, inFront = true, sdk = 34, heartAllowed = true))
    assertEquals(Mode.SERVICE, k.mode(open = true, inFront = true, sdk = 36, heartAllowed = true))
    // Heart rate refused on Android 14+: the health type would be refused, so the notice alone.
    assertEquals(Mode.NOTICE, k.mode(open = true, inFront = true, sdk = 34, heartAllowed = false))
    // Before Android 14 (Wear OS 4) the service needs no permission.
    assertEquals(Mode.SERVICE, k.mode(open = true, inFront = true, sdk = 33, heartAllowed = false))
    // A phone message while the screen is down: a background start is refused, so not tried.
    assertEquals(Mode.NOTICE, k.mode(open = true, inFront = false, sdk = 34, heartAllowed = true))
  }

  @Test
  fun serviceRechecksWhenThePhoneWouldGoSilent() {
    val now = 10_000_000_000L
    val k = WorkoutLive.KeepAlive
    assertEquals(WorkoutLive.CAP_MS, k.recheckIn(now, now))
    assertEquals(WorkoutLive.CAP_MS - 60_000L, k.recheckIn(now - 60_000L, now))
    assertEquals(0L, k.recheckIn(now - WorkoutLive.CAP_MS, now)) // silent too long: stop now
    assertEquals(0L, k.recheckIn(0L, now)) // never heard of
    assertEquals(0L, k.recheckIn(now + 60_000L, now)) // clock went back: not trusted
    assertTrue(k.recheckIn(now - 1L, now) > 0L)
  }
}
