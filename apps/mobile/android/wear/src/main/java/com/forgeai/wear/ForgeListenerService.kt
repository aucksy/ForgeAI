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
  }
}
