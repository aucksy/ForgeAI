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
}
