package com.forgeai.rest

import android.content.Context
import android.content.Intent
import org.json.JSONArray
import org.json.JSONObject

/**
 * v0.37.1 (notification audit C1): "Complete set" on the live workout card, or "Done" on the rest
 * card, tapped while Android has closed ForgeAI (no JS running). Before, the tap only posted a note
 * "Open ForgeAI to save Bench Press, set 3" beside the live card: no tick, no rest.
 *
 * Now the phone does it by itself, from the app's PLAN of the sets ahead (livePlan.ts, kept with
 * the live card's words by [WorkoutCard]: each row's words, the numbers a tick saves, and the rest
 * after it):
 *  - the rest starts at once ([RestCard.show]: the rest card alone, the live card down, the alarm
 *    and "Rest is over" as for any rest), naming the next row, whose Done it carries; or, with no
 *    rest after that row (rest off, mid-superset), the live card moves straight on;
 *  - the live card's words move on to the next row, so its next "Complete set" ticks that row (a
 *    whole workout can be logged from the shade or a watch with ForgeAI closed);
 *  - the tick waits here, in order, for the app ([take]); the app saves each one exactly once
 *    with the numbers the card showed, and never starts its rest again (restDoneRun.ts).
 *
 * Why not start the app's JS in the background (a headless task)? It needs the whole app bundle
 * loaded and the workout read back from SQLite before anything shows: seconds on a mid-range phone
 * after a tap from a locked phone or a watch, with Android's background-start rules to pass (a
 * notification's broadcast is allowed only a short window) and no way to check it here (Kotlin
 * builds only in the cloud). This path is a few preference reads: the rest card is up at once.
 *
 * A tap this plan cannot place (no plan, another workout's card, the last row it knows) returns
 * false and the receiver falls back to the old kept tap and its note (which keeps the live card
 * away while it shows: one notification at a time).
 */
object OfflineTick {
  private const val PREFS = "forgeai_offline_ticks"
  /** At most this many ticks wait for the app (more than any workout has). */
  private const val MAX_QUEUED = 100
  private const val LOG_TAG = "ForgeRest"
  /** C5-11: a live card (words or plan) older than this belongs to a forgotten workout. */
  const val STALE_MS = 60L * 60_000L

  private fun str(o: JSONObject, k: String): String? =
    if (o.isNull(k)) null else o.optString(k, "").ifEmpty { null }

  /** What the plan says about the tapped row and the one after it. */
  private class Step(
    val workout: Long,
    val exKey: String,
    val setKey: String,
    val values: String?,
    val label: String?,
    val restSec: Int,
    val next: JSONObject,
  )

  /** The tapped row in the kept plan, or null when the plan cannot place it. */
  private fun find(ctx: Context, intent: Intent): Step? {
    return try {
      val workout = intent.getLongExtra(RestCard.EXTRA_DONE_WORKOUT, 0L)
      val exKey = intent.getStringExtra(RestCard.EXTRA_DONE_EX) ?: return null
      val setKey = intent.getStringExtra(RestCard.EXTRA_DONE_SET) ?: return null
      if (workout <= 0L) return null
      val plan = WorkoutCard.plan(ctx) ?: return null
      if (plan.optLong("workout", 0L) != workout) return null
      val steps = plan.optJSONArray("steps") ?: return null
      var at = -1
      for (k in 0 until steps.length()) {
        val s = steps.optJSONObject(k) ?: continue
        if (str(s, "exKey") == exKey && str(s, "setKey") == setKey) {
          at = k
          break
        }
      }
      if (at < 0 || at + 1 >= steps.length()) return null
      val step = steps.optJSONObject(at) ?: return null
      val next = steps.optJSONObject(at + 1) ?: return null
      if (step.optBoolean("open", false)) return null
      val values = str(step, "values")
      // The button carries the hint it was posted with: a card older than the plan never ticks
      // other numbers than the ones it showed.
      val tapped = intent.getStringExtra(RestCard.EXTRA_DONE_VALUES)
      if (tapped != null && tapped != values) return null
      Step(workout, exKey, setKey, values, str(step, "label"), step.optInt("rest", 0), next)
    } catch (_: Exception) {
      null
    }
  }

  /**
   * The tap with the app closed. True when it was handled here (ticked and moved on, or already
   * waiting: a second tap, or a watch's lagging copy of the card); false = not placed by the plan.
   */
  @Synchronized
  fun run(ctx: Context, intent: Intent): Boolean {
    // C5-11 (16 Oct 2026): a workout left open and forgotten kept its card, and a stray tap days
    // later logged a set and started a rest that rang. A card whose words and plan are over
    // [STALE_MS] old is not acted on here: the tap waits for the app with the "Open ForgeAI" note.
    if (!WorkoutCard.keptWithin(ctx, STALE_MS)) {
      android.util.Log.i(LOG_TAG, "tap with the app closed on a card over ${STALE_MS / 60_000L} min old: left for the app")
      return false
    }
    val s = find(ctx, intent) ?: return false
    val now = System.currentTimeMillis()
    when (enqueue(ctx, s, now)) {
      Queued.ALREADY -> return true
      Queued.FULL -> return false
      Queued.ADDED -> Unit
    }
    val nextEx = str(s.next, "exKey")
    val nextSet = str(s.next, "setKey")
    val nextOpen = s.next.optBoolean("open", false)
    val nextValues = if (nextOpen) null else str(s.next, "values")
    val nextLabel = str(s.next, "label")
    val target = if (nextEx != null && nextSet != null) RestCard.DoneTarget(s.workout, nextEx, nextSet, nextOpen, nextValues) else null
    val allDone = target == null
    // The live card's words move on to the next row (shown now, or when the rest is over).
    val doneJson = if (target == null) {
      null
    } else {
      try {
        JSONObject()
          .put("workout", s.workout)
          .put("exKey", target.exKey)
          .put("setKey", target.setKey)
          .put("open", target.open)
          .put("values", target.values ?: JSONObject.NULL)
          .put("label", nextLabel ?: JSONObject.NULL)
          // R-166: the next row's lines for the watch app (livePlan.ts step.watch), as the app sends.
          .apply { s.next.optJSONObject("watch")?.let { put("watch", it) } }
          .toString()
      } catch (_: Exception) {
        null
      }
    }
    // R-55 (review): a tick while the workout was paused resumes it at the tick (the app's own rule,
    // activeWorkoutStore), so a paused clock starts running again from the time it showed.
    val paused = WorkoutCard.clock(ctx) as? WorkoutCard.Clock.Paused
    val clockJson = paused?.let {
      try {
        JSONObject().put("base", now - it.ms).toString()
      } catch (e: Exception) {
        android.util.Log.w(LOG_TAG, "workout clock not resumed after an offline tick", e)
        null
      }
    }
    WorkoutCard.keep(ctx, str(s.next, "title") ?: "Workout in progress", str(s.next, "text") ?: "", str(s.next, "image"), doneJson, clockJson)
    if (s.restSec > 0) {
      // The rest card alone (it takes the live card down), naming the next row and ticking it.
      RestCard.setDoneTarget(ctx, target)
      RestCard.setAllDone(ctx, allDone)
      RestCard.show(ctx, now, now + s.restSec * 1000L, if (allDone) null else nextLabel)
    } else {
      // No rest after this row: an old rest or "Rest is over" goes, the live card is back on the next row.
      RestCard.clear(ctx, dismissOver = true)
    }
    android.util.Log.i(LOG_TAG, "tap with the app closed: ${s.exKey}/${s.setKey} ticked for the app, rest ${s.restSec} s")
    return true
  }

  private enum class Queued { ADDED, ALREADY, FULL }

  /** Keeps the tick for the app, in order, once per row. Written at once (commit). */
  private fun enqueue(ctx: Context, s: Step, at: Long): Queued {
    val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val arr = try {
      JSONArray(p.getString("ticks", null) ?: "[]")
    } catch (_: Exception) {
      JSONArray()
    }
    for (k in 0 until arr.length()) {
      val o = arr.optJSONObject(k) ?: continue
      if (o.optLong("workout", 0L) == s.workout && str(o, "exKey") == s.exKey && str(o, "setKey") == s.setKey) return Queued.ALREADY
    }
    // Review fix: a row the app already took (a watch's late copy of the card, tapped after the
    // app read the queue but before it posted a new plan) is not ticked or rested a second time.
    if (keyOf(s.workout, s.exKey, s.setKey) in takenKeys(p)) return Queued.ALREADY
    if (arr.length() >= MAX_QUEUED) return Queued.FULL
    return try {
      arr.put(
        JSONObject()
          .put("workout", s.workout)
          .put("exKey", s.exKey)
          .put("setKey", s.setKey)
          .put("values", s.values ?: JSONObject.NULL)
          .put("label", s.label ?: JSONObject.NULL)
          .put("at", at),
      )
      p.edit().putString("ticks", arr.toString()).commit()
      Queued.ADDED
    } catch (_: Exception) {
      Queued.FULL
    }
  }

  /** The waiting ticks (a JSON array, oldest first), taken ONCE by the app; null = none. */
  @Synchronized
  fun take(ctx: Context): String? {
    val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val raw = p.getString("ticks", null)
    if (raw != null) {
      // Remember what was taken (the last [MAX_TAKEN] rows), so a late duplicate tap is ignored.
      val taken = takenKeys(p).toMutableList()
      try {
        val arr = JSONArray(raw)
        for (k in 0 until arr.length()) {
          val o = arr.optJSONObject(k) ?: continue
          val ex = str(o, "exKey") ?: continue
          val set = str(o, "setKey") ?: continue
          taken.add(keyOf(o.optLong("workout", 0L), ex, set))
        }
      } catch (_: Exception) {
        // A queue that does not read back: nothing to remember.
      }
      p.edit().remove("ticks").putString("taken", JSONArray(taken.takeLast(MAX_TAKEN)).toString()).commit()
    }
    return raw
  }

  private const val MAX_TAKEN = 100

  private fun keyOf(workout: Long, exKey: String, setKey: String): String = "$workout|$exKey|$setKey"

  private fun takenKeys(p: android.content.SharedPreferences): List<String> =
    try {
      val a = JSONArray(p.getString("taken", null) ?: "[]")
      (0 until a.length()).mapNotNull { a.optString(it, "").ifEmpty { null } }
    } catch (_: Exception) {
      emptyList()
    }
}
