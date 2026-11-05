package com.forgeai.wear

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

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
    for (hr in b) for (al in b) for (ph in b) for (wo in b) for (re in b) for (ov in b) for (miss in b) for (sv in b) {
      val want = when {
        hr -> WatchScreenKind.PERMISSION_HEART_RATE
        al -> WatchScreenKind.PERMISSION_ALERTS
        wo && re -> WatchScreenKind.REST_TIMER
        wo && ov -> WatchScreenKind.REST_IS_OVER
        !wo && sv -> WatchScreenKind.WORKOUT_SAVED
        !ph -> WatchScreenKind.PHONE_NOT_CONNECTED
        !wo && miss -> WatchScreenKind.PHONE_APP_MISSING
        !wo -> WatchScreenKind.NOTHING_OPEN
        else -> WatchScreenKind.BETWEEN_RESTS
      }
      assertEquals(want, ScreenSelector.select(hr, al, ph, wo, re, ov, phoneAppMissing = miss, saved = sv))
    }
    // Without the two R-269 flags: exactly the hand-off's order, as before.
    for (hr in b) for (al in b) for (ph in b) for (wo in b) for (re in b) for (ov in b) {
      assertEquals(ScreenSelector.select(hr, al, ph, wo, re, ov, false, false), ScreenSelector.select(hr, al, ph, wo, re, ov))
    }
  }

  // ---------------------------------------------------------------- R-269: workout saved

  @Test
  fun workoutSavedShowsForAboutFourSecondsThenNothingOpen() {
    val saved = WatchState.Snapshot(null, false, "", savedAt = 100_000L)
    assertEquals(WatchScreenKind.WORKOUT_SAVED, ScreenSelector.select(saved, false, false, true, now = 100_000L))
    assertEquals(WatchScreenKind.WORKOUT_SAVED, ScreenSelector.select(saved, false, false, true, now = 103_999L))
    assertEquals(WatchScreenKind.NOTHING_OPEN, ScreenSelector.select(saved, false, false, true, now = 104_000L))
    // A watch clock behind the save time, or no save at all: no "Workout saved".
    assertEquals(WatchScreenKind.NOTHING_OPEN, ScreenSelector.select(saved, false, false, true, now = 99_000L))
    assertEquals(WatchScreenKind.NOTHING_OPEN, ScreenSelector.select(saved.copy(savedAt = 0L), false, false, true, now = 100_000L))
    // A new workout already open wins.
    assertEquals(WatchScreenKind.BETWEEN_RESTS, ScreenSelector.select(open.copy(savedAt = 100_000L), false, false, true, now = 101_000L))
    assertEquals(4_000L, WorkoutSaved.SHOW_MS)
    assertEquals(3_000L, WorkoutSaved.left(100_000L, 101_000L))
    assertEquals(0L, WorkoutSaved.left(100_000L, 105_000L))
    assertEquals(0L, WorkoutSaved.left(0L, 1L))
  }

  @Test
  fun onlyAFinishOfAnOpenWorkoutIsSaved() {
    assertTrue(WorkoutSaved.justSaved(active = false, saved = true, wasActive = true))
    // A discard, an older phone app (no "saved"), a workout the watch never had open, a new workout.
    assertFalse(WorkoutSaved.justSaved(active = false, saved = false, wasActive = true))
    assertFalse(WorkoutSaved.justSaved(active = false, saved = true, wasActive = false))
    assertFalse(WorkoutSaved.justSaved(active = true, saved = true, wasActive = true))
  }

  // ---------------------------------------------------------------- R-269: no MettleUp on the phone

  @Test
  fun getMettleUpOnlyWhenAConnectedPhoneLacksTheApp() {
    assertTrue(PhoneApp.missing(connected = true, hasCapability = false, seenBefore = false))
    assertFalse(PhoneApp.missing(connected = true, hasCapability = true, seenBefore = false))
    // A phone app older than the capability that already sent a workout: it is there.
    assertFalse(PhoneApp.missing(connected = true, hasCapability = false, seenBefore = true))
    assertFalse(PhoneApp.missing(connected = false, hasCapability = false, seenBefore = false))
    val idle = WatchState.Snapshot(null, false, "")
    assertEquals(WatchScreenKind.PHONE_APP_MISSING, ScreenSelector.select(idle, false, false, true, phoneAppMissing = true))
    // Not connected says so first; an open workout means the app is there.
    assertEquals(WatchScreenKind.PHONE_NOT_CONNECTED, ScreenSelector.select(idle, false, false, false, phoneAppMissing = true))
    assertEquals(WatchScreenKind.BETWEEN_RESTS, ScreenSelector.select(open, false, false, true, phoneAppMissing = true))
    // The app is there but no workout: still "Open MettleUp on your phone".
    assertEquals(WatchScreenKind.NOTHING_OPEN, ScreenSelector.select(idle, false, false, true, phoneAppMissing = false))
  }

  @Test
  fun openOnPhoneGoesToMettleUpInThePlayStore() {
    assertEquals("market://details?id=com.mettleup.app", PhoneApp.playStoreUri("com.mettleup.app"))
    assertEquals(WatchCopy.GET_PHONE_APP_REASON, PhoneApp.reason(PhoneApp.Request.IDLE))
    assertEquals(WatchCopy.GET_PHONE_APP_SENT, PhoneApp.reason(PhoneApp.Request.SENT))
    assertEquals(WatchCopy.GET_PHONE_APP_FAILED, PhoneApp.reason(PhoneApp.Request.FAILED))
  }

  /** The phone app must declare the very capability the watch looks for (two files, two apps). */
  @Test
  fun thePhoneAppDeclaresTheCapabilityTheWatchAsksFor() {
    // Gradle runs this module's tests from apps/mobile/android/wear.
    val xml = File("../../modules/forge-rest/android/src/main/res/values/wear.xml")
    assertTrue("missing ${xml.absolutePath}", xml.exists())
    val text = xml.readText()
    assertTrue(text.contains("<item>${PhoneApp.CAPABILITY}</item>"))
    assertTrue(text.contains("name=\"android_wear_capabilities\""))
    assertTrue(text.contains("tools:keep=\"@array/android_wear_capabilities\""))
    // Not the watch's own capability (the phone would then look like a watch with the app).
    assertFalse(text.contains("forgeai_watch_app</item>"))
  }

  // ---------------------------------------------------------------- R-237: rest timer sizes

  @Test
  fun restTimerSizesAreTheApprovedMock() {
    assertEquals(96f, RestTimerSizes.COUNTDOWN, 0f)
    assertEquals(84f, RestTimerSizes.COUNTDOWN_LONG, 0f)
    assertEquals(16f, RestTimerSizes.LIFT, 0f)
    assertEquals(26f, RestTimerSizes.NEXT_SET, 0f)
    assertEquals(24f, RestTimerSizes.NEXT_SET_TWO_LINES, 0f)
    assertEquals(24f, RestTimerSizes.PREVIOUS_NEXT, 0f)
    // The words stay "Previous" / "Next" (owner's hard rule: never "Last" / "Today").
    val c = WatchCopy.card(open)
    assertTrue(c.previous!!.startsWith("Previous "))
    assertTrue(c.next!!.startsWith("Next "))
  }

  // ---------------------------------------------------------------- R-354: logging screens' top row and small text

  @Test
  fun timeRowSitsAboutFivePercentLower() {
    // Owner, 5 Nov 2026: "push that a bit lower, maybe by 5%". 22 px of 456 = 4.8 %.
    val moved = (LogLayout.TOP_BAR - LogLayout.TOP_BAR_BEFORE) / RingMath.DESIGN_PX
    assertTrue("moved ${moved * 100} %", moved in 0.045f..0.055f)
  }

  @Test
  fun smallLinesGrowAtNormalTextAndStayPutAtTheLargest() {
    assertEquals(20f, LogLayout.grown(20f, 18f, 1f), 0f)
    assertEquals(22f, LogLayout.topBarText(1f), 0f)
    // The largest text size: exactly the old size x 1.24 (no room left on the round screen).
    assertEquals(18f * Px.LABEL_SCALE_MAX, LogLayout.grown(20f, 18f, Px.LABEL_SCALE_MAX), 0.001f)
    assertEquals(20f * Px.LABEL_SCALE_MAX, LogLayout.topBarText(Px.LABEL_SCALE_MAX), 0.001f)
  }

  @Test
  fun largestTextTightensTheNextSetStack() {
    assertFalse(LogLayout.tight(1f))
    assertTrue(LogLayout.tight(Px.LABEL_SCALE_MAX))
    // The stack's reserved height at the largest text is no taller than before R-354 (it was 129 px), so the
    // 22 px lower time row does not push the pills into Done. The render test checks the real gap
    // (WatchLogRenderTest.checkClearAboveButton).
    assertTrue(LogLayout.nextSetStack(Px.LABEL_SCALE_MAX) <= 129f)
    assertTrue(LogLayout.nextSetTop(1f) >= LogLayout.topBarBottom(1f))
  }

  @Test
  fun effortGridSitsUnderTheTitleAndSkipStaysOnTheGlass() {
    for (step in 0..24) {
      val k = 1f + step / 100f
      assertTrue(LogLayout.effortGridTop(k) >= LogLayout.effortTop(k) + 4f)
      // Skip (80 px tall, 150 px wide) keeps its corners inside the round screen.
      val bottom = LogLayout.effortSkipTop(k) + 80f
      val dy = bottom - RingMath.DESIGN_PX / 2f
      val halfChord = kotlin.math.sqrt((RingMath.DESIGN_PX / 2f) * (RingMath.DESIGN_PX / 2f) - dy * dy)
      assertTrue("k=$k: Skip's bottom row is ${2 * halfChord} px wide", halfChord >= 75f + 16f)
    }
    // The grid (2 rows, 134 px) is centred on the screen at the normal text size.
    assertEquals(RingMath.DESIGN_PX / 2f, LogLayout.effortGridTop(1f) + 134f / 2f, 16f)
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

  // ---------------------------------------------------------------- UAT 1 Nov 2026

  @Test
  fun statusLineSaysWhatToDoWhenThePhoneNamesNoSet() {
    assertEquals(WatchCopy.ALL_SETS_DONE, WatchCopy.statusLine("All sets done · Finish"))
    assertEquals(WatchCopy.ALL_SETS_DONE, WatchCopy.statusLine("Paused · All sets done · Finish"))
    assertEquals(WatchCopy.ADD_AN_EXERCISE, WatchCopy.statusLine("Add an exercise to start"))
    // An older phone app (no set lines): its own set line, as before R-207.
    assertEquals("Set 3 of 5 · 62.5 kg × 8", WatchCopy.statusLine("Set 3 of 5 · 62.5 kg × 8"))
    assertNull(WatchCopy.statusLine(""))
    assertNull(WatchCopy.statusLine("  "))
  }

  @Test
  fun statusShowsOnlyWithoutASetLine() {
    assertNull(WatchCopy.status(open.copy(text = "Set 3 of 5 · 62.5 kg × 8")))
    val done = WatchState.Snapshot(null, true, "Push 1", text = "All sets done · Finish")
    assertEquals(WatchCopy.ALL_SETS_DONE, WatchCopy.status(done))
  }

  @Test
  fun bannedMemberWordsNeverShow() {
    val words = listOf(
      WatchCopy.START_A_WORKOUT, WatchCopy.NOTHING_OPEN_HINT, WatchCopy.PHONE_NOT_CONNECTED, WatchCopy.KEEP_PHONE_NEAR,
      WatchCopy.REASON_HEART_RATE, WatchCopy.REASON_ALERTS, WatchCopy.REASON_ALARMS, WatchCopy.ALL_SETS_DONE, WatchCopy.ADD_AN_EXERCISE,
      WatchCopy.GET_PHONE_APP, WatchCopy.GET_PHONE_APP_REASON, WatchCopy.OPEN_ON_PHONE, WatchCopy.GET_PHONE_APP_SENT,
      WatchCopy.GET_PHONE_APP_FAILED, WatchCopy.WORKOUT_SAVED, WatchCopy.WORKOUT_SAVED_REASON,
    )
    val banned = Regex("(^|[^A-Za-z])(volume|pr|prs|session)([^A-Za-z]|$)", RegexOption.IGNORE_CASE)
    for (w in words) assertFalse(w, banned.containsMatchIn(w))
  }

  @Test
  fun aWorkoutThePhoneWentSilentOnIsNotShownForever() {
    val now = 10L * 60 * 60 * 1000
    assertTrue(WorkoutLive.openOnScreen(true, now - 60_000L, now))
    assertFalse(WorkoutLive.openOnScreen(true, now - WorkoutLive.CAP_MS, now))
    assertFalse(WorkoutLive.openOnScreen(false, now, now))
    // Saved by a watch app older than 0.63.0 (no time kept): still open, as before.
    assertTrue(WorkoutLive.openOnScreen(true, 0L, now))
  }

  @Test
  fun everyWordIsTheHandOffsCopy() {
    assertEquals("Rest is over", WatchCopy.REST_IS_OVER)
    assertEquals("Start a workout on your phone", WatchCopy.START_A_WORKOUT)
    assertEquals("Phone not connected", WatchCopy.PHONE_NOT_CONNECTED)
    assertEquals("Keep your phone near you with Bluetooth on.", WatchCopy.KEEP_PHONE_NEAR)
    assertEquals("Open MettleUp on your phone. Your rest timer shows up here.", WatchCopy.NOTHING_OPEN_HINT)
    assertEquals("Turn on Alarms & reminders so your watch buzzes on time.", WatchCopy.REASON_ALARMS)
    assertEquals("Open settings", WatchCopy.OPEN_SETTINGS)
    assertEquals("Allow", WatchCopy.ALLOW)
    assertEquals("Not now", WatchCopy.NOT_NOW)
    assertEquals("1 of 2", WatchCopy.STEP_HEART_RATE)
    assertEquals("2 of 2", WatchCopy.STEP_ALERTS)
    assertEquals("Heart rate", WatchCopy.TITLE_HEART_RATE)
    assertEquals("Rest alerts", WatchCopy.TITLE_ALERTS)
    assertEquals("Shows how hard your heart works while you rest.", WatchCopy.REASON_HEART_RATE)
    assertEquals("Your watch buzzes when rest is over.", WatchCopy.REASON_ALERTS)
    assertEquals("Get MettleUp on your phone", WatchCopy.GET_PHONE_APP)
    assertEquals("Your watch needs the MettleUp app on your phone.", WatchCopy.GET_PHONE_APP_REASON)
    assertEquals("Open on phone", WatchCopy.OPEN_ON_PHONE)
    assertEquals("Look at your phone to install MettleUp.", WatchCopy.GET_PHONE_APP_SENT)
    assertEquals("Your phone did not answer. Try again.", WatchCopy.GET_PHONE_APP_FAILED)
    assertEquals("Workout saved", WatchCopy.WORKOUT_SAVED)
    assertEquals("Well done. See the details on your phone.", WatchCopy.WORKOUT_SAVED_REASON)
    // The app-is-there hint is kept as it was.
    assertEquals("Open MettleUp on your phone. Your rest timer shows up here.", WatchCopy.NOTHING_OPEN_HINT)
  }
}
