package com.forgeai.wear

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * U-W1 / U-W5 (UAT, 17 Oct 2026): which phone notifications Wear OS may copy to the watch. The tags
 * must match the phone's RestCard.BRIDGE_TAG_OVER / BRIDGE_TAG_CARD (checked from source by the
 * phone's vitest, test/tracker/watchBridge.test.ts).
 */
class BridgingTest {
  @Test
  fun restIsOverIsNeverCopiedSoTheWatchBuzzesOnce() {
    // This app always buzzes at the rest's end itself: the phone's copy would be a second buzz
    // (or, muted while the phone is in use, the only one, and missing).
    assertEquals(true, Bridging.excludedTags(true).contains("rest-over"))
    assertEquals(true, Bridging.excludedTags(false).contains("rest-over"))
  }

  @Test
  fun theCountdownIsCopiedOnlyWhenThisAppCannotShowItsOwn() {
    assertEquals(listOf("rest-over", "rest-card"), Bridging.excludedTags(true))
    // Notifications refused: no countdown or buttons of our own, so the phone's card comes through.
    assertEquals(listOf("rest-over"), Bridging.excludedTags(false))
  }

  @Test
  fun tagsMatchThePhone() {
    assertEquals("rest-over", Bridging.TAG_OVER)
    assertEquals("rest-card", Bridging.TAG_CARD)
  }
}
