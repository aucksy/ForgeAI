package com.forgeai.wear

import android.content.Context
import android.util.Log
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable

/**
 * R-441 (10 Nov 2026): the phone's "Add my watch's screen log" (Help and feedback) asks for the
 * screen diary ([AmbientDiag], kept on this watch) with the message [PATH_ASK]. The answer is the
 * same Data Layer item AmbientDiag already writes ([AmbientDiag.PATH], keys "log" and "at"), written
 * now and URGENT, so the phone has today's lines within a second or two instead of whenever Play
 * services next syncs. The diary holds only screen events, Battery Saver, the always-on setting and
 * times: no workout, no heart rate.
 *
 * Kept apart from AmbientDiag on purpose (that file is the dim screen's own code). Paths and keys
 * must match the phone's WearWire.kt (PATH_WATCH_DIAG, PATH_WATCH_DIAG_ASK, KEY_DIAG_LOG,
 * KEY_DIAG_AT); test/lib/watchDiag.test.ts checks them.
 */
object DiagSend {
  private const val TAG = "ForgeWear"
  /** The phone's message: send the diary now. */
  const val PATH_ASK = "/forge/diag-ask"

  /** Writes the diary item now (urgent). Never throws. */
  fun answer(ctx: Context) {
    val app = ctx.applicationContext
    try {
      val req = PutDataMapRequest.create(AmbientDiag.PATH)
      req.dataMap.putString("log", AmbientDiag.text(app))
      req.dataMap.putLong("at", System.currentTimeMillis())
      Wearable.getDataClient(app).putDataItem(req.asPutDataRequest().setUrgent())
        .addOnSuccessListener { Log.i(TAG, "diag sent to the phone (asked)") }
        .addOnFailureListener { e -> Log.w(TAG, "diag not sent (asked)", e) }
    } catch (e: Exception) {
      Log.w(TAG, "diag not sent (asked)", e)
    }
  }
}
