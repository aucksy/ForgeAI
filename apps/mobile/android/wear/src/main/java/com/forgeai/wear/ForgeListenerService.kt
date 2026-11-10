package com.forgeai.wear

import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService

/**
 * Wakes for the phone's Data Layer items under /forge (manifest filter), even with the watch app
 * closed. Each item is read at once: the buffer is released when this returns.
 */
class ForgeListenerService : WearableListenerService() {
  override fun onDataChanged(dataEvents: DataEventBuffer) {
    // The notification permission may have changed in Settings since: keep the bridging right.
    Bridging.sync(applicationContext)
    // Watch update ready (10 Nov 2026): once per process, so a build installed and never opened is seen.
    WatchVersion.publish(applicationContext, "listener")
    for (event in dataEvents) {
      if (event.type == DataEvent.TYPE_CHANGED) WatchSync.apply(applicationContext, event.dataItem)
    }
  }

  /**
   * U-W3 (17 Oct 2026): the phone answers /forge/nack/done when it could not use a "Complete set"
   * / Done sent from here (WearActionService.kt): the button comes back at once with a note,
   * instead of staying hidden for 20 s as if the set were saved.
   */
  override fun onMessageReceived(event: MessageEvent) {
    if (event.path == WatchActions.PATH_NACK_DONE) WatchActions.refused(applicationContext)
    // Watch update ready (10 Nov 2026): the phone asks for this app's version (it has no item yet).
    if (event.path == WatchVersion.PATH_ASK) WatchVersion.publish(applicationContext, "asked", force = true)
    // R-441: the phone's Help and feedback asks for the screen diary (DiagSend.kt).
    if (event.path == DiagSend.PATH_ASK) DiagSend.answer(applicationContext)
    // A workout was just started on the phone: open the app, or post "Workout started".
    if (event.path == WatchSync.PATH_OPEN) {
      // R-269: only MettleUp on the phone sends this: the phone app is there.
      WatchState.markPhoneAppSeen(applicationContext)
      WorkoutStarted.onRequest(applicationContext, event.data)
    }
  }
}
