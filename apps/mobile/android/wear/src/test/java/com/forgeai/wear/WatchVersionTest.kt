package com.forgeai.wear

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Watch update ready (10 Nov 2026): the version the watch keeps for the phone. */
class WatchVersionTest {
  @Test
  fun aSaneVersionIsKeptTrimmed() {
    assertEquals("0.76.0" to 1_000_000_123L, WatchVersion.values(" 0.76.0 ", 1_000_000_123L))
  }

  @Test
  fun noNameOrNoCodeWritesNothing() {
    assertNull(WatchVersion.values(null, 5L))
    assertNull(WatchVersion.values("  ", 5L))
    assertNull(WatchVersion.values("0.76.0", 0L))
    assertNull(WatchVersion.values("0.76.0", -1L))
  }

  @Test
  fun pathsAndKeysMatchThePhone() {
    // Must equal modules/forge-rest WearWire.kt (the phone reads these).
    assertEquals("/forge/watch-version", WatchVersion.PATH)
    assertEquals("/forge/watch-version-ask", WatchVersion.PATH_ASK)
    assertEquals("versionName", WatchVersion.KEY_NAME)
    assertEquals("versionCode", WatchVersion.KEY_CODE)
  }
}
