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

  fun apply(ctx: Context, item: DataItem) {
    try {
      val path = item.uri.path ?: return
      if (path != PATH_REST && path != PATH_WORKOUT) return
      val m = DataMapItem.fromDataItem(item).dataMap
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
        )
      } else {
        WatchState.onWorkout(ctx, m.getBoolean("active", false), m.getString("title", "") ?: "", seq)
      }
    } catch (e: Exception) {
      Log.w(TAG, "phone item not read", e)
    }
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
