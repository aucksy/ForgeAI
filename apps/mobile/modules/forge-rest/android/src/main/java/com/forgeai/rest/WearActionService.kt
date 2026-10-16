package com.forgeai.rest

import android.util.Log
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableListenerService

/**
 * C5-2 (16 Oct 2026): the ForgeAI watch app's own buttons. Before, the watch could tick a set only
 * from the copied rest card, which exists only while resting (and its Done ticks the NEXT set,
 * before it is done). After the rest the watch had no button at all.
 *
 * Now the watch app shows "Complete set" (on its workout screen and its "Rest is over") and Done /
 * +15 s / Skip on its own countdown, and sends each as a Wear message (/forge/act/…). Here each is
 * re-sent as the very broadcast the phone's own button sends ([WearSync.actionIntent] →
 * [RestActionReceiver]), so it takes the same road: the app ticks the row when its JS runs, else
 * the phone starts the rest itself ([OfflineTick]). Only the ForgeAI watch app can send these: the
 * Wear Data Layer delivers messages only between apps with the same package and signing key.
 *
 * U-W3 (UAT, 17 Oct 2026): a Done / "Complete set" the phone cannot use (its row unreadable, or
 * the broadcast refused) is answered with [PATH_NACK_DONE] to the watch that sent it, which shows
 * its button again at once with a note (it used to stay hidden 20 s, as if the set were saved).
 */
class WearActionService : WearableListenerService() {
  override fun onMessageReceived(event: MessageEvent) {
    val ctx = applicationContext
    val i = WearSync.actionIntent(ctx, event.path, event.data)
    if (i == null) {
      Log.w("ForgeWear", "watch message ${event.path} not understood")
      nack(event)
      return
    }
    try {
      ctx.sendBroadcast(i)
      Log.i("ForgeWear", "watch button ${event.path}")
    } catch (e: Exception) {
      Log.w("ForgeWear", "watch button ${event.path} not passed on", e)
      nack(event)
    }
  }

  /** Tells the watch its Done was not logged (only for Done: +15 s / Skip have no hidden button). */
  private fun nack(event: MessageEvent) {
    if (event.path != "${WearSync.PATH_ACT}/done") return
    try {
      Wearable.getMessageClient(applicationContext).sendMessage(event.sourceNodeId, PATH_NACK_DONE, event.data ?: ByteArray(0))
        .addOnFailureListener { e -> Log.w("ForgeWear", "watch not told its Done failed", e) }
    } catch (e: Exception) {
      Log.w("ForgeWear", "watch not told its Done failed", e)
    }
  }

  companion object {
    /** The watch's ForgeListenerService (wear/…/WatchActions.PATH_NACK_DONE) listens for it. */
    const val PATH_NACK_DONE = "/forge/nack/done"
  }
}
