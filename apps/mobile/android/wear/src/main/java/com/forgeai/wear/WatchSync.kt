package com.forgeai.wear

import android.content.Context
import android.util.Log
import com.google.android.gms.wearable.DataItem
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.Wearable

/** Reads the phone's /forge items into [WatchState]. Paths and keys match the phone's WearSync.kt. */
object WatchSync {
  private const val TAG = "ForgeWear"
  const val PATH_REST = "/forge/rest"
  const val PATH_WORKOUT = "/forge/workout"

  /** A message: the member just started a workout on the phone ([WorkoutStarted]). */
  const val PATH_OPEN = "/forge/open"

  fun apply(ctx: Context, item: DataItem) {
    try {
      val path = item.uri.path ?: return
      if (path != PATH_REST && path != PATH_WORKOUT) return
      val m = DataMapItem.fromDataItem(item).dataMap
      // R-269: an item from MettleUp on the phone: the app is there (older phone apps declare no capability).
      WatchState.markPhoneAppSeen(ctx)
      val seq = m.getLong("seq", 0L)
      if (path == PATH_REST) {
        WatchState.onRest(
          ctx,
          m.getLong("startedAt", 0L),
          m.getLong("endsAt", 0L),
          m.getString("next", "") ?: "",
          m.getBoolean("ended", false),
          m.getBoolean("ringThroughDnd", false),
          seq,
          // C5-2: the row the countdown's Done ticks ("" = none; an older phone app sends none).
          m.getString("done", "") ?: "",
        )
      } else {
        WatchState.onWorkout(
          ctx,
          m.getBoolean("active", false),
          m.getString("title", "") ?: "",
          seq,
          // C5-2: the live card's set line and the row its "Complete set" ticks.
          m.getString("text", "") ?: "",
          m.getString("done", "") ?: "",
          // R-166: the next set's lines (an older phone app sends none: the screen uses text).
          NextSet(m.getString("set", "") ?: "", m.getString("last", "") ?: "", m.getString("goal", "") ?: ""),
          // The gym's colour, "#RRGGBB" (an older phone app sends none: MettleUp orange).
          m.getString("accent", "") ?: "",
          // R-269: the phone closed the workout with Finish (an older phone app sends none).
          m.getBoolean("saved", false),
          // Watch logging (3 Nov 2026): the phone takes sets logged here, and the next set's boxes.
          m.getBoolean("logFlow", false),
          entry(m),
        )
      }
    } catch (e: Exception) {
      Log.w(TAG, "phone item not read", e)
    }
  }

  /** Watch logging: the next set's boxes from the item's "e…" keys; null = none (older phone app). */
  private fun entry(m: com.google.android.gms.wearable.DataMap): SetEntry? {
    if (!m.getBoolean("eOn", false)) return null
    return SetEntry(
      wOn = m.getBoolean("eWOn", false),
      rOn = m.getBoolean("eROn", false),
      w = (m.getString("eW", "") ?: "").toDoubleOrNull(),
      r = m.getLong("eR", -1L).let { if (it < 0L) null else it.toInt() },
      unit = if (m.getString("eUnit", "kg") == "lb") "lb" else "kg",
      step = (m.getString("eStep", "") ?: "").toDoubleOrNull()?.takeIf { it > 0.0 } ?: 2.5,
      warm = m.getBoolean("eWarm", false),
      rpe = m.getBoolean("eRpe", false),
      rest = m.getLong("eRest", 0L).toInt(),
    )
  }

  /**
   * The screen came up: read the items the phone already holds, so a watch app installed (or
   * reinstalled) mid-workout catches up without waiting for the next change. Items already
   * applied are skipped by their seq.
   */
  fun refresh(ctx: Context) {
    val app = ctx.applicationContext
    try {
      Wearable.getDataClient(app).dataItems
        .addOnSuccessListener { buf ->
          try {
            for (item in buf) apply(app, item)
          } finally {
            buf.release()
          }
        }
        .addOnFailureListener { e -> Log.w(TAG, "phone items not read", e) }
    } catch (e: Exception) {
      Log.w(TAG, "Data Layer not available", e)
    }
  }
}
