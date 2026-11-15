package com.forgeai.rest

import org.junit.Assert.assertEquals
import org.junit.Test

/** R-590: when the app rings a gym message or "Rest is over" itself (the phone took the channel's sound). */
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

  // ---------------------------------------------------------------- "Rest is over" (R-590, 15 Nov 2026)

  /** His OPPO's "Rest is over" (rest-over-sound, dumpsys 15 Nov 2026): made HIGH, reads 3, no sound, sound lock on. */
  private val oppoRest = oppo.copy(userSetSound = true, askedImportance = 4)

  private fun rest(channel: String, onScreen: Boolean = false, s: String = "forge"): AlertRing.RestRing {
    val tail = if (s == "forge") "" else "-$s"
    return AlertRing.restRing(channel, onScreen, RestCard.CH_OVER_OPEN, RestCard.CH_OVER_OPEN_SOUND + tail, RestCard.CH_OVER_ALARM + tail)
  }

  @Test
  fun `his OPPO's stripped Rest is over rings, though the phone marked its sound as set`() {
    assertEquals("ring", AlertRing.plan(oppoRest))
    assertEquals("ring", AlertRing.plan(oppoRest.copy(userSetSound = false)))
  }

  @Test
  fun `a member who picked no sound in the phone's settings keeps it`() {
    // A member's own "None" leaves the importance the app asked for.
    assertEquals("member-set-sound", AlertRing.plan(oppoRest.copy(importance = 4)))
  }

  @Test
  fun `Pixel and Samsung keep the rest sound, so the app never rings a second time`() {
    assertEquals("channel-rings", AlertRing.plan(oppoRest.copy(importance = 4, hasSound = true, userSetSound = false)))
    assertEquals("channel-rings", AlertRing.plan(oppoRest.copy(importance = 3, hasSound = true)))
  }

  @Test
  fun `screen off or app in the background rings as a notification, on the member's sound's channel`() {
    for (s in listOf("forge", "bell", "beep", "whistle")) {
      val tail = if (s == "forge") "" else "-$s"
      assertEquals(AlertRing.RestRing.NOTIFICATION, rest(RestCard.CH_OVER + tail, s = s))
    }
  }

  @Test
  fun `Workout sounds off never rings`() {
    assertEquals(AlertRing.RestRing.NONE, rest(RestCard.CH_OVER_OPEN))
    assertEquals(AlertRing.RestRing.NONE, rest(RestCard.CH_OVER_OPEN, s = "bell"))
  }

  @Test
  fun `ForgeAI on screen never rings here (the open app rings its own bell)`() {
    assertEquals(AlertRing.RestRing.NONE, rest(RestCard.CH_OVER_OPEN_SOUND, onScreen = true))
    assertEquals(AlertRing.RestRing.NONE, rest(RestCard.CH_OVER_OPEN_SOUND + "-whistle", onScreen = true, s = "whistle"))
    // also on the channels the open app can land on: Ring through Do Not Disturb, or a race at the end
    assertEquals(AlertRing.RestRing.NONE, rest(RestCard.CH_OVER_ALARM, onScreen = true))
    assertEquals(AlertRing.RestRing.NONE, rest(RestCard.CH_OVER, onScreen = true))
    // the app-open channel itself, even if the screen went off between the pick and the check
    assertEquals(AlertRing.RestRing.NONE, rest(RestCard.CH_OVER_OPEN_SOUND))
  }

  @Test
  fun `Do Not Disturb holds the ring unless the member chose Ring through Do Not Disturb`() {
    assertEquals("do-not-disturb", AlertRing.plan(oppoRest.copy(interruptionFilter = 2)))
    assertEquals("do-not-disturb", AlertRing.plan(oppoRest.copy(interruptionFilter = 3)))
    assertEquals(AlertRing.RestRing.ALARM, rest(RestCard.CH_OVER_ALARM))
    assertEquals(AlertRing.RestRing.ALARM, rest(RestCard.CH_OVER_ALARM + "-beep", s = "beep"))
    assertEquals("ring", AlertRing.plan(oppoRest.copy(interruptionFilter = 2, throughDnd = true)))
    assertEquals("ring", AlertRing.plan(oppoRest.copy(interruptionFilter = 3, throughDnd = true)))
  }

  @Test
  fun `silent and vibrate hold the rest ring, also through Do Not Disturb`() {
    assertEquals("ringer-0", AlertRing.plan(oppoRest.copy(ringerMode = 0)))
    assertEquals("ringer-1", AlertRing.plan(oppoRest.copy(ringerMode = 1)))
    assertEquals("ringer-1", AlertRing.plan(oppoRest.copy(ringerMode = 1, interruptionFilter = 2, throughDnd = true)))
  }

  @Test
  fun `the member's own off choices win for the rest too`() {
    assertEquals("notifications-off", AlertRing.plan(oppoRest.copy(notificationsOn = false)))
    assertEquals("quiet-channel", AlertRing.plan(oppoRest.copy(importance = 2)))
    assertEquals("quiet-channel", AlertRing.plan(oppoRest.copy(importance = 0)))
  }

  @Test
  fun `one Rest is over posted twice rings once`() {
    assertEquals("just-rang", AlertRing.plan(oppoRest.copy(sinceLastRingMs = 10)))
    assertEquals("ring", AlertRing.plan(oppoRest.copy(sinceLastRingMs = AlertRing.RING_GAP_MS)))
  }

  @Test
  fun `the app rings the same file the channel and the open app play`() {
    assertEquals("forge_rest_done", AlertRing.restSoundFile("forge"))
    assertEquals("forge_rest_bell", AlertRing.restSoundFile("bell"))
    assertEquals("forge_rest_beep", AlertRing.restSoundFile("beep"))
    assertEquals("forge_rest_whistle", AlertRing.restSoundFile("whistle"))
    assertEquals("forge_rest_done", AlertRing.restSoundFile("gong")) // unknown: the chime
    assertEquals("android.resource://com.mettleup.app/raw/forge_rest_bell", AlertRing.restSoundAddress("com.mettleup.app", "bell"))
  }
}
