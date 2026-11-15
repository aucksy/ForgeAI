package com.forgeai.rest

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** UAT U-W2 / U-W3 (17 Oct 2026): the phone's side of the watch link, without a phone or a watch. */
class WearWireTest {
  private fun bytes(s: String) = s.toByteArray(Charsets.UTF_8)

  // ------------------------------------------------------------------ R-166: the next set's lines
  @Test
  fun theNextSetLinesAreReadFromTheRowJson() {
    // What restCard.ts rowJson sends: the row plus watch {set, last, goal}.
    val row = """{"workout":42,"exKey":"b","setKey":"b3","open":false,"values":"60|8","label":"Bench Press, set 3",""" +
      """"watch":{"set":"Set 3 of 5","last":"60 kg × 8","goal":"62.5 kg × 8"}}"""
    assertEquals(WatchLines("Set 3 of 5", "60 kg × 8", "62.5 kg × 8"), WearWire.watchLines(row))
    // The row still reads as the same row (the watch sends it back; the lines are ignored).
    assertEquals(WatchDone(42L, "b", "b3", "60|8", "Bench Press, set 3", 0L), WearWire.parseDone(bytes(row)))
    // The watch gets the row without the lines (they go as their own fields).
    val bare = JSONObject(WearWire.withoutWatch(row))
    assertTrue(!bare.has("watch"))
    assertEquals("b3", bare.getString("setKey"))
  }

  @Test
  fun noLinesFromAnOlderAppOrBadText() {
    assertEquals(WatchLines.NONE, WearWire.watchLines(null))
    assertEquals(WatchLines.NONE, WearWire.watchLines(""))
    assertEquals(WatchLines.NONE, WearWire.watchLines("not json"))
    assertEquals(WatchLines.NONE, WearWire.watchLines("""{"workout":42,"exKey":"b","setKey":"b1"}"""))
    // No previous set: last is "" (null too), the rest stays.
    assertEquals(WatchLines("Set 1 of 3", "", "20 kg × 10"), WearWire.watchLines("""{"watch":{"set":"Set 1 of 3","last":null,"goal":"20 kg × 10"}}"""))
    // A row without lines passes through unchanged; bad text too.
    val plain = """{"workout":42,"exKey":"b","setKey":"b1"}"""
    assertEquals(plain, WearWire.withoutWatch(plain))
    assertEquals("x", WearWire.withoutWatch("x"))
  }

  @Test
  fun aVeryLongLineIsCut() {
    val long = "A".repeat(300)
    val l = WearWire.watchLines("""{"watch":{"set":"$long","last":"","goal":""}}""")
    assertEquals(80, l.set.length)
  }

  // ------------------------------------------------------------------ U-W3: /forge/act/done
  @Test
  fun aRestDoneFromTheWatchReadsBackEveryField() {
    // Exactly what WearSync.restDone sends the watch, sent back unchanged.
    val row = JSONObject()
      .put("workout", 1_760_000_000_000L)
      .put("exKey", "a")
      .put("setKey", "a3")
      .put("open", false)
      .put("values", "35|11")
      .put("label", "Bench Press, set 3")
      .put("endsAt", 1_760_000_090_000L)
      .toString()
    val d = WearWire.parseDone(bytes(row))
    assertEquals(WatchDone(1_760_000_000_000L, "a", "a3", "35|11", "Bench Press, set 3", 1_760_000_090_000L), d)
  }

  @Test
  fun aCompleteSetFromTheLiveCardHasNoEndAndMayHaveNoValues() {
    // The live card's row (WorkoutCard: no endsAt), with values and label null.
    val d = WearWire.parseDone(bytes("""{"workout":42,"exKey":"b","setKey":"b1","open":false,"values":null,"label":null}"""))
    assertEquals(WatchDone(42L, "b", "b1", null, null, 0L), d)
    // Empty strings read as none too.
    val e = WearWire.parseDone(bytes("""{"workout":42,"exKey":"b","setKey":"b1","values":"","label":""}"""))
    assertEquals(WatchDone(42L, "b", "b1", null, null, 0L), e)
  }

  @Test
  fun aRowThatCannotBeLoggedIsRefused() {
    assertNull(WearWire.parseDone(null))
    assertNull(WearWire.parseDone(ByteArray(0)))
    assertNull(WearWire.parseDone(bytes("not json")))
    assertNull(WearWire.parseDone(bytes("[1,2]")))
    assertNull(WearWire.parseDone(bytes("""{"exKey":"a","setKey":"a1"}"""))) // no workout
    assertNull(WearWire.parseDone(bytes("""{"workout":0,"exKey":"a","setKey":"a1"}""")))
    assertNull(WearWire.parseDone(bytes("""{"workout":42,"setKey":"a1"}"""))) // no exercise
    assertNull(WearWire.parseDone(bytes("""{"workout":42,"exKey":"a","setKey":""}"""))) // no set
    // An "open" row has nothing to save (the phone's Done opens the app for it).
    assertNull(WearWire.parseDone(bytes("""{"workout":42,"exKey":"a","setKey":"a1","open":true}""")))
  }

  // ------------------------------------------------------------------ watch logging (3 Nov 2026)
  @Test
  fun theNextSetsBoxesAreReadForTheWatch() {
    val row = """{"workout":42,"exKey":"b","setKey":"b2","watch":{"set":"Set 2 of 4","last":"20 kg × 15","goal":"20 kg × 16",""" +
      """"entry":{"wOn":true,"rOn":true,"w":20,"r":16,"unit":"kg","step":2.5,"warm":false,"rpe":true,"rest":120}}}"""
    val e = WearWire.watchLines(row).entry
    assertEquals(WatchEntry(true, true, "20", 16L, "kg", "2.5", false, true, 120L), e)
    // An empty weight box, pounds, a warm-up, no step sent.
    val f = WearWire.entry(JSONObject("""{"wOn":true,"rOn":true,"w":null,"r":null,"unit":"lb","warm":true,"rest":0}"""))
    assertEquals(WatchEntry(true, true, "", -1L, "lb", "2.5", true, false, 0L), f)
    // Nonsense numbers read as empty; an older app sends no entry.
    val g = WearWire.entry(JSONObject("""{"wOn":true,"rOn":true,"w":-5,"r":5000,"rest":99999}"""))
    assertEquals("", g!!.w)
    assertEquals(-1L, g.r)
    assertEquals(3600L, g.rest)
    assertNull(WearWire.watchLines("""{"watch":{"set":"Set 1 of 3","last":"","goal":""}}""").entry)
  }

  @Test
  fun aDoneLoggedOnTheWatchCarriesItsNumbers() {
    val row = """{"workout":42,"exKey":"b","setKey":"b2","values":"20|15","log":{"w":22.5,"r":16,"rpe":8,"unit":"kg"}}"""
    val d = WearWire.parseDone(bytes(row))
    assertNotNull(d)
    val log = JSONObject(d!!.log!!)
    assertEquals(22.5, log.getDouble("w"), 1e-9)
    assertEquals(16L, log.getLong("r"))
    assertEquals(8.0, log.getDouble("rpe"), 1e-9)
    assertEquals("kg", log.getString("unit"))
    // Reps only, pounds; an effort out of range is dropped, the set still goes.
    val r = JSONObject(WearWire.watchLog(JSONObject("""{"r":20,"rpe":12,"unit":"lb"}"""))!!)
    assertTrue(!r.has("w") && !r.has("rpe"))
    assertEquals("lb", r.getString("unit"))
    // No numbers at all: a plain Done (the card's numbers).
    assertNull(WearWire.watchLog(JSONObject("""{"rpe":8}""")))
    assertNull(WearWire.parseDone(bytes("""{"workout":42,"exKey":"b","setKey":"b2"}"""))!!.log)
  }

  // ------------------------------------------------------------------ U-W2: the outbox
  @Test
  fun aStateStaysUntilItsPutSucceeds() {
    val box = WearOutbox()
    val a = box.offer("/forge/workout", mapOf("active" to false))
    assertEquals(listOf(a), box.takeDue())
    assertTrue(box.takeDue().isEmpty()) // on its way: not sent twice at once
    box.failed(a) // API_NOT_CONNECTED, or any failed put
    assertEquals(false, box.isEmpty())
    val again = box.takeDue()
    assertEquals(1, again.size)
    assertEquals(mapOf<String, Any>("active" to false), again[0].values) // the Finish is sent again
    box.sent(again[0])
    assertTrue(box.isEmpty())
  }

  @Test
  fun onlyTheLatestStatePerPathIsKept() {
    val box = WearOutbox()
    box.offer("/forge/rest", mapOf("endsAt" to 100L))
    box.offer("/forge/rest", mapOf("endsAt" to 0L, "ended" to false)) // Skip during the pause
    box.offer("/forge/workout", mapOf("active" to true))
    val due = box.takeDue()
    assertEquals(2, due.size)
    assertEquals(0L, due.first { it.path == "/forge/rest" }.values["endsAt"])
  }

  @Test
  fun anOlderPutSucceedingNeverDropsANewerState() {
    val box = WearOutbox()
    val old = box.offer("/forge/rest", mapOf("endsAt" to 100L))
    box.takeDue()
    val newer = box.offer("/forge/rest", mapOf("endsAt" to 200L)) // a new rest while the first put runs
    box.sent(old)
    assertEquals(200L, box.pending("/forge/rest")?.get("endsAt"))
    val due = box.takeDue()
    assertEquals(listOf(newer), due)
    box.sent(newer)
    assertTrue(box.isEmpty())
  }

  @Test
  fun aNewerStateGoesEvenWhileAnOlderOneIsOnItsWay() {
    val box = WearOutbox()
    box.offer("/forge/rest", mapOf("endsAt" to 100L))
    box.takeDue()
    box.offer("/forge/rest", mapOf("endsAt" to 0L))
    assertEquals(1, box.takeDue().size)
  }

  @Test
  fun theOutboxSurvivesARestartOfTheApp() {
    val box = WearOutbox()
    box.offer("/forge/rest", mapOf("startedAt" to 1L, "endsAt" to 90_000L, "next" to "Row, set 2", "ended" to false, "done" to "{\"exKey\":\"a\"}"))
    box.offer("/forge/workout", mapOf("active" to false, "title" to "", "text" to "", "done" to ""))
    val saved = box.encode(1_000L)

    val after = WearOutbox()
    after.restore(saved, 2_000L, 60_000L)
    assertEquals(
      mapOf<String, Any>("startedAt" to 1L, "endsAt" to 90_000L, "next" to "Row, set 2", "ended" to false, "done" to "{\"exKey\":\"a\"}"),
      after.pending("/forge/rest"),
    )
    assertEquals(mapOf<String, Any>("active" to false, "title" to "", "text" to "", "done" to ""), after.pending("/forge/workout"))
    assertEquals(2, after.takeDue().size)
  }

  @Test
  fun aRestoreNeverOverwritesNewerStateAndDropsOldOrBadText() {
    val box = WearOutbox()
    box.offer("/forge/workout", mapOf("active" to true))
    val saved = box.encode(1_000L)

    val busy = WearOutbox()
    busy.offer("/forge/workout", mapOf("active" to false))
    busy.restore(saved, 2_000L, 60_000L)
    assertEquals(false, busy.pending("/forge/workout")?.get("active"))

    val late = WearOutbox()
    late.restore(saved, 1_000L + 60_001L, 60_000L)
    assertTrue(late.isEmpty())

    val bad = WearOutbox()
    bad.restore("{oops", 2_000L, 60_000L)
    bad.restore(null, 2_000L, 60_000L)
    assertTrue(bad.isEmpty())
    assertNotNull(bad.encode(0L))
  }

  @Test
  fun watchAccentIsSixDigitHexOrEmpty() {
    assertEquals("#1E3A8A", WearWire.watchAccent(" #1e3a8a "))
    assertEquals("", WearWire.watchAccent(null))
    assertEquals("", WearWire.watchAccent(""))
    assertEquals("", WearWire.watchAccent("#abc"))
    assertEquals("", WearWire.watchAccent("1E3A8A"))
  }

  // ------------------------------------------------------------------ F67: install on the watch
  @Test
  fun watchAppStateReadsConnectedWatchesOnly() {
    assertEquals("none", WearWire.watchAppState(emptyList(), listOf("w1")))
    assertEquals("installed", WearWire.watchAppState(listOf("w1"), listOf("w1")))
    assertEquals("missing", WearWire.watchAppState(listOf("w1"), emptyList()))
    // Two watches, one without the app: missing (its Play Store opens).
    assertEquals("missing", WearWire.watchAppState(listOf("w1", "w2"), listOf("w1")))
    // A watch that declares the app but is not connected does not count.
    assertEquals("missing", WearWire.watchAppState(listOf("w2"), listOf("w1")))
  }

  @Test
  fun installTargetsAreTheWatchesWithoutTheApp() {
    assertEquals(listOf("w2"), WearWire.installTargets(listOf("w1", "w2", "w2"), listOf("w1")))
    assertEquals(emptyList<String>(), WearWire.installTargets(listOf("w1"), listOf("w1")))
    assertEquals(emptyList<String>(), WearWire.installTargets(emptyList(), emptyList()))
  }

  // ------------------------------------------------------------------ watch update ready (10 Nov 2026)
  @Test
  fun watchVersionKeepsOnlySaneValues() {
    assertEquals(WearWire.WatchVersion("0.76.0", 1_000_000_123L), WearWire.watchVersion(" 0.76.0 ", 1_000_000_123L))
    assertNull(WearWire.watchVersion(null, 5L))
    assertNull(WearWire.watchVersion("", 5L))
    assertNull(WearWire.watchVersion("0.76.0", 0L))
  }

  @Test
  fun versionsToAskAreWatchesWithTheAppAndNoItem() {
    val v = mapOf("w1" to WearWire.WatchVersion("0.76.0", 1L))
    assertEquals(listOf("w2"), WearWire.versionsToAsk(listOf("w1", "w2", "w3"), listOf("w1", "w2"), v))
    assertEquals(emptyList<String>(), WearWire.versionsToAsk(listOf("w1"), listOf("w1"), v))
  }

  @Test
  fun watchVersionsJsonListsEveryConnectedWatch() {
    val v = mapOf("w1" to WearWire.WatchVersion("0.76.0", 1_000_000_076L), "w3" to WearWire.WatchVersion("0.70.0", 9L))
    val o = JSONObject(WearWire.watchVersionsJson(listOf("w1" to "Pixel Watch 3", "w2" to "Galaxy", "w3" to "Old"), listOf("w1", "w2"), v))
    assertTrue(o.getBoolean("ok"))
    val n = o.getJSONArray("nodes")
    assertEquals(3, n.length())
    assertEquals("w1", n.getJSONObject(0).getString("nodeId"))
    assertEquals("Pixel Watch 3", n.getJSONObject(0).getString("displayName"))
    assertTrue(n.getJSONObject(0).getBoolean("hasApp"))
    assertEquals("0.76.0", n.getJSONObject(0).getString("versionName"))
    assertEquals(1_000_000_076L, n.getJSONObject(0).getLong("versionCode"))
    // The app with no item: an older watch build (null version).
    assertTrue(n.getJSONObject(1).getBoolean("hasApp"))
    assertTrue(n.getJSONObject(1).isNull("versionName"))
    assertTrue(n.getJSONObject(1).isNull("versionCode"))
    // No app: a stale item left behind is not reported.
    assertTrue(!n.getJSONObject(2).getBoolean("hasApp"))
    assertTrue(n.getJSONObject(2).isNull("versionName"))
    assertTrue(!JSONObject(WearWire.WATCH_VERSIONS_UNKNOWN).getBoolean("ok"))
  }

  @Test
  fun updateTargetsAreWatchesWithTheApp() {
    assertEquals(listOf("w1", "w3"), WearWire.updateTargets(listOf("w1", "w2", "w3"), listOf("w1", "w3"), null))
    assertEquals(listOf("w3"), WearWire.updateTargets(listOf("w1", "w2", "w3"), listOf("w1", "w3"), "w3"))
    // A watch named that lacks the app or is gone: every watch with the app.
    assertEquals(listOf("w1"), WearWire.updateTargets(listOf("w1", "w2"), listOf("w1"), "w2"))
    assertEquals(emptyList<String>(), WearWire.updateTargets(listOf("w2"), emptyList(), null))
  }

  @Test
  fun playStoreUriNamesThePackage() {
    assertEquals("market://details?id=com.mettleup.app", WearWire.playStoreUri("com.mettleup.app"))
  }

  // ------------------------------------------------------------------ R-355: the next set's exercise name
  @Test
  fun theWatchGetsTheExerciseOfTheNextSet() {
    // Rest after Bench Press's last set: the app's card already names Barbell Row, set 1.
    val row = """{"workout":42,"exKey":"b","setKey":"b1","open":false,"values":"60|8","label":"Barbell Row, set 1",""" +
      """"watch":{"set":"Set 1 of 3","last":"60 kg × 8","goal":"60 kg × 8"}}"""
    val lines = WearWire.watchLines(row)
    assertEquals("Barbell Row", WearWire.watchTitle("Barbell Row", lines, WearWire.withoutWatch(row)))
    // A row with nothing to save (no Done) still names its exercise: the set line is there.
    assertEquals("Barbell Row", WearWire.watchTitle("Barbell Row", WatchLines("Set 1 of 3", "", ""), ""))
  }

  @Test
  fun afterTheFinalSetNoWorkoutNameGoesAsAnExercise() {
    // "All sets done · Finish": the card's title is the workout's name, no row, no lines.
    assertEquals("", WearWire.watchTitle("Push Day", WatchLines.NONE, ""))
    assertEquals("", WearWire.watchTitle("Workout in progress", WearWire.watchLines(null), ""))
  }

  // ------------------------------------------------------------------ R-441: the watch's screen diary
  @Test
  fun theWatchDiaryAnswerIsNewestFirstWithoutNamesOrEmptyLogs() {
    val json = WearWire.watchDiagJson(
      listOf(
        WearWire.WatchDiag(100L, "11-10 09:00:00.000 create"),
        WearWire.WatchDiag(300L, "11-10 10:00:00.000 stop ambient=0"),
        WearWire.WatchDiag(200L, "  "),
      ),
    )
    val o = JSONObject(json)
    assertTrue(o.getBoolean("ok"))
    val w = o.getJSONArray("watches")
    assertEquals(2, w.length())
    assertEquals(300L, w.getJSONObject(0).getLong("at"))
    assertEquals("11-10 10:00:00.000 stop ambient=0", w.getJSONObject(0).getString("log"))
    // Only the time and the lines go to the app: no node id, no watch name.
    assertEquals(setOf("at", "log"), w.getJSONObject(0).keys().asSequence().toSet())
  }

  @Test
  fun aHugeWatchDiaryIsCutToItsNewestEnd() {
    val log = "x".repeat(WearWire.MAX_DIAG_CHARS) + "NEWEST"
    val got = JSONObject(WearWire.watchDiagJson(listOf(WearWire.WatchDiag(1L, log)))).getJSONArray("watches").getJSONObject(0).getString("log")
    assertEquals(WearWire.MAX_DIAG_CHARS, got.length)
    assertTrue(got.endsWith("NEWEST"))
    // No watch: ok, an empty list (org.json does not keep key order, so compare the values).
    val none = JSONObject(WearWire.watchDiagJson(emptyList()))
    assertTrue(none.getBoolean("ok"))
    assertEquals(0, none.getJSONArray("watches").length())
  }
  // ------------------------------------------------------------------ R-575: every signal of "has the app"
  private val now = 1_763_200_000_000L
  private fun sig(
    connected: List<Pair<String, String>>? = emptyList(),
    capR: List<Pair<String, String>>? = emptyList(),
    capA: List<String>? = emptyList(),
    ver: Set<String>? = emptySet(),
    diag: Map<String, Long>? = emptyMap(),
    local: String? = "phone",
  ) = WearWire.Signals(connected, capR, capA, ver, diag, local)

  @Test
  fun hisCaseCapabilityEmptyDiaryFromTheWatchCountsAsTheApp() {
    // 15 Nov 2026, feedback 105: connected watch X, capability empty, X's diary 2 minutes old, no version item.
    val s = sig(connected = listOf("X" to "Watch"), diag = mapOf("X" to now - 120_000L))
    val seen = WearWire.watchesSeen(s, now)
    assertEquals(listOf(WearWire.WatchSeen("X", "Watch", hasApp = true, connected = true)), seen)
    val o = JSONObject(WearWire.watchVersionsJson(WearWire.versionsOk(s, seen), seen, emptyMap(), WearWire.signalsWhy(s, emptyMap())))
    assertTrue(o.getBoolean("ok"))
    val w = o.getJSONArray("nodes").getJSONObject(0)
    assertTrue(w.getBoolean("hasApp"))
    assertTrue(w.getBoolean("connected"))
    assertTrue(w.isNull("versionName"))
    assertEquals("nodes=1 capR=0 capA=0 ver=0 diag=1", o.getString("why"))
    // It is pinged (a 0.77.0+ watch would reply with its version item; his old one drops it).
    assertEquals(listOf("X"), WearWire.pingTargets(seen, emptyMap()))
  }

  @Test
  fun eachSignalAloneSaysTheAppIsThere() {
    val c = listOf("X" to "Watch")
    assertTrue(WearWire.watchesSeen(sig(connected = c, capR = c), now).single().hasApp)
    assertTrue(WearWire.watchesSeen(sig(connected = c, capA = listOf("X")), now).single().hasApp)
    assertTrue(WearWire.watchesSeen(sig(connected = c, ver = setOf("X")), now).single().hasApp)
    assertTrue(WearWire.watchesSeen(sig(connected = c, diag = mapOf("X" to 1L)), now).single().hasApp)
    // No signal: a connected watch without the app (F67's "Install on watch").
    val none = WearWire.watchesSeen(sig(connected = c), now).single()
    assertTrue(!none.hasApp && none.connected)
  }

  @Test
  fun aFailedStepIsNotANo() {
    // Capability lookups failed (null) and connectedNodes failed: the watch's own diary still finds it.
    val s = sig(connected = null, capR = null, capA = null, diag = mapOf("X" to now - 60_000L))
    val seen = WearWire.watchesSeen(s, now)
    assertEquals(listOf(WearWire.WatchSeen("X", "", hasApp = true, connected = false)), seen)
    assertTrue(WearWire.versionsOk(s, seen))
    assertEquals("nodes=fail:17 capR=fail:8 capA=? ver=0 diag=1", WearWire.signalsWhy(s, mapOf("nodes" to "17", "capR" to "8")))
    // connectedNodes failed but the reachable capability answered: that watch is connected.
    val r = WearWire.watchesSeen(sig(connected = null, capR = listOf("X" to "Watch")), now).single()
    assertTrue(r.hasApp && r.connected)
    // Nothing answered and nothing found: Wear OS could not say (ok false), never "no watch".
    val nothing = sig(connected = null, capR = null, capA = null, ver = null, diag = null)
    assertTrue(!WearWire.versionsOk(nothing, WearWire.watchesSeen(nothing, now)))
    assertEquals("nodes=? capR=? capA=? ver=? diag=?", WearWire.signalsWhy(nothing, emptyMap()))
  }

  @Test
  fun aWatchNotConnectedCountsOnlyWithAFreshDiary() {
    val week = WearWire.UNREACHED_FRESH_MS
    val fresh = WearWire.watchesSeen(sig(diag = mapOf("X" to now - week + 60_000L)), now)
    assertEquals(listOf(WearWire.WatchSeen("X", "", hasApp = true, connected = false)), fresh)
    // A watch the member no longer has: an old diary, or FILTER_ALL / a version item alone, is not reported.
    assertTrue(WearWire.watchesSeen(sig(diag = mapOf("X" to now - week - 60_000L)), now).isEmpty())
    assertTrue(WearWire.watchesSeen(sig(capA = listOf("X"), ver = setOf("X")), now).isEmpty())
    assertTrue(WearWire.watchesSeen(sig(diag = mapOf("X" to 0L)), now).isEmpty())
    // Nothing connected, nothing written: no watch (ok, "none").
    val empty = sig()
    assertTrue(WearWire.versionsOk(empty, WearWire.watchesSeen(empty, now)))
    assertEquals(0, JSONObject(WearWire.watchVersionsJson(true, emptyList(), emptyMap(), "")).getJSONArray("nodes").length())
  }

  @Test
  fun thePhonesOwnNodeNeverCounts() {
    val s = sig(connected = listOf("phone" to "Me", "X" to "Watch"), diag = mapOf("phone" to now, "X" to now), ver = setOf("phone"), local = "phone")
    assertEquals(listOf("X"), WearWire.watchesSeen(s, now).map { it.nodeId })
  }

  @Test
  fun connectedWatchesComeFirstWithoutRepeats() {
    val s = sig(
      connected = listOf("A" to "One", "A" to "One"),
      capR = listOf("B" to "Two", "A" to "One"),
      diag = mapOf("C" to now - 1_000L, "D" to now - 500L, "A" to now),
    )
    val seen = WearWire.watchesSeen(s, now)
    assertEquals(listOf("A", "B", "D", "C"), seen.map { it.nodeId })
    assertEquals(listOf(true, true, false, false), seen.map { it.connected })
    val (connected, withApp) = WearWire.connectedAndWithApp(seen)
    assertEquals(listOf("A", "B"), connected)
    assertEquals(listOf("A", "B"), withApp)
    // Only connected watches without a version item are pinged.
    assertEquals(listOf("B"), WearWire.pingTargets(seen, mapOf("A" to WearWire.WatchVersion("0.77.0", 1L))))
  }

  @Test
  fun theVersionGoesOnlyToAWatchWithTheAppAndTheWhyIsShort() {
    val seen = listOf(WearWire.WatchSeen("A", "One", true, true), WearWire.WatchSeen("B", "Two", false, true))
    val v = mapOf("A" to WearWire.WatchVersion("0.77.0", 7L), "B" to WearWire.WatchVersion("0.77.0", 7L))
    val o = JSONObject(WearWire.watchVersionsJson(true, seen, v, "x".repeat(400)))
    assertEquals("0.77.0", o.getJSONArray("nodes").getJSONObject(0).getString("versionName"))
    assertTrue(o.getJSONArray("nodes").getJSONObject(1).isNull("versionName"))
    assertEquals(160, o.getString("why").length)
    // ok false carries no watches, only the why.
    val bad = JSONObject(WearWire.watchVersionsJson(false, seen, v, "timeout"))
    assertTrue(!bad.getBoolean("ok"))
    assertEquals(0, bad.getJSONArray("nodes").length())
    assertEquals("timeout", bad.getString("why"))
    assertEquals("cap=fail:SecurityException", WearWire.step("cap", null, "SecurityException"))
    assertEquals("cap=fail:error", WearWire.step("cap", 2, "!!"))
  }
}
