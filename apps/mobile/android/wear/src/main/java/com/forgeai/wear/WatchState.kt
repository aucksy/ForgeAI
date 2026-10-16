package com.forgeai.wear

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/**
 * What the watch knows, as the phone last published it (Data Layer, [WatchSync]):
 *  - /forge/rest     {startedAt, endsAt, next, seq} while a rest runs; {endsAt: 0, ended, seq} when it
 *                    is skipped / cleared (ended = false) or ran out on the phone (ended = true);
 *  - /forge/workout  {active, title, seq}.
 *
 * Kept in preferences (the listener service and the alarm receiver run without the screen) and
 * mirrored into Compose state for the screen. Every change goes through here, under one lock,
 * and drives the alarm / countdown / buzz in [RestAlerts]. A message older than the last one
 * applied (its seq is not higher) is ignored, so a re-delivered item never undoes a newer one.
 */
object WatchState {
  private const val TAG = "ForgeWear"
  private const val PREFS = "forgeai_watch"

  data class Rest(val startedAt: Long, val endsAt: Long, val next: String)

  data class Snapshot(val rest: Rest?, val workoutActive: Boolean, val title: String)

  private val main = Handler(Looper.getMainLooper())

  /** The screen's copy (main thread). */
  var snapshot by mutableStateOf(Snapshot(null, false, ""))
    private set

  private fun prefs(ctx: Context) = ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun read(ctx: Context): Snapshot {
    val p = prefs(ctx)
    val ends = p.getLong("endsAt", 0L)
    val rest = if (ends > 0L) Rest(p.getLong("startedAt", ends), ends, p.getString("next", "") ?: "") else null
    return Snapshot(rest, p.getBoolean("active", false), p.getString("title", "") ?: "")
  }

  private fun publish(ctx: Context) {
    val s = read(ctx)
    main.post { snapshot = s }
  }

  /** The screen came up: show what is saved. */
  fun load(ctx: Context) = publish(ctx)

  /** The saved rest, if one runs (or has not been alerted yet). */
  @Synchronized
  fun rest(ctx: Context): Rest? = read(ctx).rest

  private fun saveRest(ctx: Context, r: Rest?) {
    val e = prefs(ctx).edit()
    if (r == null) {
      e.remove("startedAt").remove("endsAt").remove("next")
    } else {
      e.putLong("startedAt", r.startedAt).putLong("endsAt", r.endsAt).putString("next", r.next)
    }
    e.commit()
  }

  /** A /forge/rest item from the phone. */
  @Synchronized
  fun onRest(ctx: Context, startedAt: Long, endsAt: Long, next: String, ended: Boolean, seq: Long) {
    val p = prefs(ctx)
    if (seq != 0L && seq <= p.getLong("restSeq", 0L)) {
      Log.i(TAG, "rest seq $seq already applied")
      return
    }
    p.edit().putLong("restSeq", seq).commit()
    val now = System.currentTimeMillis()
    val cur = read(ctx).rest
    if (endsAt > 0L) {
      val r = Rest(if (startedAt in 1L..endsAt) startedAt else now, endsAt, next)
      if (endsAt <= now) {
        // Reached the watch already over (it was out of range).
        saveRest(ctx, null)
        RestAlerts.restCleared(ctx)
        if (RestText.buzzOnLateArrival(now, endsAt)) RestAlerts.restOver(ctx, r)
        Log.i(TAG, "rest arrived ${now - endsAt} ms after its end")
      } else {
        saveRest(ctx, r)
        RestAlerts.restStarted(ctx, r)
        Log.i(TAG, "rest until $endsAt (${endsAt - now} ms)")
      }
    } else {
      saveRest(ctx, null)
      RestAlerts.restCleared(ctx)
      if (ended && cur != null && RestText.buzzOnPhoneEnd(now, cur.endsAt)) {
        // The phone's end came before the watch's own alarm: buzz now, once.
        RestAlerts.restOver(ctx, cur)
        Log.i(TAG, "rest ended on the phone first")
      } else {
        Log.i(TAG, "rest cleared (ended=$ended)")
      }
    }
    publish(ctx)
  }

  /** A /forge/workout item from the phone. */
  @Synchronized
  fun onWorkout(ctx: Context, active: Boolean, title: String, seq: Long) {
    val p = prefs(ctx)
    if (seq != 0L && seq <= p.getLong("workoutSeq", 0L)) return
    p.edit().putLong("workoutSeq", seq).putBoolean("active", active).putString("title", title).commit()
    if (!active && read(ctx).rest != null) {
      // Workout finished or discarded: no rest may buzz after it.
      saveRest(ctx, null)
      RestAlerts.restCleared(ctx)
    }
    publish(ctx)
  }

  /** The rest's alarm went off for [expected]. */
  @Synchronized
  fun onAlarm(ctx: Context, expected: Long) {
    val cur = read(ctx).rest
    if (cur == null || cur.endsAt != expected) {
      Log.i(TAG, "alarm for $expected: no such rest now")
      return
    }
    val now = System.currentTimeMillis()
    if (now < expected - EARLY_MS) {
      RestAlerts.arm(ctx, expected)
      Log.i(TAG, "alarm ${expected - now} ms early, armed again")
      return
    }
    saveRest(ctx, null)
    RestAlerts.restOver(ctx, cur)
    publish(ctx)
  }

  /** An alarm that fires this much early is set again instead. */
  private const val EARLY_MS = 1_500L
}
