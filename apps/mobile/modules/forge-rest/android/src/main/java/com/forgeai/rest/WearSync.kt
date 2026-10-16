package com.forgeai.rest

import android.content.Context
import android.util.Log
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.common.api.CommonStatusCodes
import com.google.android.gms.wearable.DataMap
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import java.util.concurrent.atomic.AtomicLong

/**
 * v0.46: tells the ForgeAI watch app (apps/mobile/android/wear) about the rest and the open
 * workout, as Wear Data Layer items. The watch keeps its own alarm and countdown from these, so it
 * buzzes even when the phone's bridged alert is muted (Pixel Watch mutes those while the phone is
 * in use).
 *
 *  - /forge/rest     {startedAt, endsAt, next, seq} when a rest starts or is extended
 *                    ([RestCard.show] / [RestCard.add]); {endsAt: 0, ended, seq} when it goes —
 *                    ended = false: skipped / cleared / settled quietly; ended = true: it ran out
 *                    here ([RestCard.fireEnd]), so a watch whose own alarm has not gone off yet
 *                    buzzes now.
 *  - /forge/workout  {active, title, seq} from [WorkoutCard.show] / [WorkoutCard.hide] / [WorkoutCard.clear].
 *
 * seq only ever grows (the clock, or one more than the last), so the watch can drop a re-delivered
 * older item. Every put is urgent and fire-and-forget: nothing waits for it, nothing here throws,
 * and a phone without Google Play services (or without the Wear OS app) only logs. After the API
 * says it is not on this phone, the calls stop for the rest of the process.
 */
object WearSync {
  private const val TAG = "ForgeWear"
  const val PATH_REST = "/forge/rest"
  const val PATH_WORKOUT = "/forge/workout"

  private val lastSeq = AtomicLong(0L)

  @Volatile private var unavailable = false

  /** The workout as last sent (active, title), so a tick that changes nothing sends nothing. */
  @Volatile private var lastWorkout: Pair<Boolean, String>? = null

  private fun nextSeq(): Long {
    while (true) {
      val prev = lastSeq.get()
      val next = maxOf(System.currentTimeMillis(), prev + 1L)
      if (lastSeq.compareAndSet(prev, next)) return next
    }
  }

  /** A rest started or changed. */
  fun rest(ctx: Context, r: RestCard.Rest) {
    val next = if (r.allDone) "All sets done" else r.next.orEmpty()
    put(ctx, PATH_REST) {
      putLong("startedAt", r.startedAt)
      putLong("endsAt", r.endsAt)
      putString("next", next)
      putBoolean("ended", false)
    }
  }

  /** The rest is gone: [ended] = it ran out on the phone (not skipped or settled). */
  fun restGone(ctx: Context, ended: Boolean) {
    put(ctx, PATH_REST) {
      putLong("startedAt", 0L)
      putLong("endsAt", 0L)
      putString("next", "")
      putBoolean("ended", ended)
    }
  }

  /** The workout is open ([active], [title] = the exercise the live card names) or over. */
  fun workout(ctx: Context, active: Boolean, title: String) {
    val now = Pair(active, if (active) title else "")
    if (now == lastWorkout) return
    lastWorkout = now
    put(ctx, PATH_WORKOUT) {
      putBoolean("active", now.first)
      putString("title", now.second)
    }
  }

  private fun put(ctx: Context, path: String, fill: DataMap.() -> Unit) {
    if (unavailable) return
    try {
      val req = PutDataMapRequest.create(path)
      req.dataMap.fill()
      req.dataMap.putLong("seq", nextSeq())
      val data = req.asPutDataRequest().setUrgent()
      Wearable.getDataClient(ctx.applicationContext).putDataItem(data)
        .addOnFailureListener { e ->
          if (e is ApiException && e.statusCode == CommonStatusCodes.API_NOT_CONNECTED) {
            // No Wear OS on this phone: stop asking until the app restarts.
            unavailable = true
            Log.w(TAG, "Wear Data Layer not on this phone; watch sync off for this run")
          } else {
            Log.w(TAG, "watch sync $path failed", e)
          }
        }
    } catch (e: Exception) {
      Log.w(TAG, "watch sync $path not sent", e)
    }
  }
}
