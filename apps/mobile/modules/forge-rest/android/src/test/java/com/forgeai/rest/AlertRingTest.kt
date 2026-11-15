package com.forgeai.rest

import org.junit.Assert.assertEquals
import org.junit.Test

/** R-590: when the app rings a gym message itself (the phone took the channel's sound). */
class AlertRingTest {
  /** His OPPO's "Messages from your gym" (dumpsys, 15 Nov 2026): importance 3, no sound, not set by him, ring on. */
  private val oppo = AlertRing.Facts(
    sdk = 37,
    notificationsOn = true,
    channelFound = true,
    importance = 3,
    hasSound = false,
    userSetSound = false,
    interruptionFilter = 1,
    ringerMode = 2,
    sinceLastRingMs = -1,
  )

  @Test
  fun `his OPPO rings`() {
    assertEquals("ring", AlertRing.plan(oppo))
    assertEquals("ring", AlertRing.plan(oppo.copy(importance = 4)))
  }

  @Test
  fun `a phone that kept the sound rings through the channel, never twice`() {
    assertEquals("channel-rings", AlertRing.plan(oppo.copy(hasSound = true, importance = 4)))
  }

  @Test
  fun `the member's own choices win`() {
    assertEquals("member-set-sound", AlertRing.plan(oppo.copy(userSetSound = true)))
    assertEquals("quiet-channel", AlertRing.plan(oppo.copy(importance = 2)))
    assertEquals("quiet-channel", AlertRing.plan(oppo.copy(importance = 0)))
    assertEquals("notifications-off", AlertRing.plan(oppo.copy(notificationsOn = false)))
  }

  @Test
  fun `silent, vibrate and Do Not Disturb stay quiet`() {
    assertEquals("ringer-0", AlertRing.plan(oppo.copy(ringerMode = 0)))
    assertEquals("ringer-1", AlertRing.plan(oppo.copy(ringerMode = 1)))
    assertEquals("do-not-disturb", AlertRing.plan(oppo.copy(interruptionFilter = 2)))
    assertEquals("do-not-disturb", AlertRing.plan(oppo.copy(interruptionFilter = 3)))
    assertEquals("do-not-disturb", AlertRing.plan(oppo.copy(interruptionFilter = 4)))
  }

  @Test
  fun `one message reported twice rings once`() {
    assertEquals("just-rang", AlertRing.plan(oppo.copy(sinceLastRingMs = 0)))
    assertEquals("just-rang", AlertRing.plan(oppo.copy(sinceLastRingMs = AlertRing.RING_GAP_MS - 1)))
    assertEquals("ring", AlertRing.plan(oppo.copy(sinceLastRingMs = AlertRing.RING_GAP_MS)))
  }

  @Test
  fun `no channel or an old Android never rings`() {
    assertEquals("no-channel", AlertRing.plan(oppo.copy(channelFound = false)))
    assertEquals("no-channels", AlertRing.plan(oppo.copy(sdk = 25)))
  }
}
