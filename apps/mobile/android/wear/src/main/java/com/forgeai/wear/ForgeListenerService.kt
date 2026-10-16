package com.forgeai.wear

import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.WearableListenerService

/**
 * Wakes for the phone's Data Layer items under /forge (manifest filter), even with the watch app
 * closed. Each item is read at once: the buffer is released when this returns.
 */
class ForgeListenerService : WearableListenerService() {
  override fun onDataChanged(dataEvents: DataEventBuffer) {
    for (event in dataEvents) {
      if (event.type == DataEvent.TYPE_CHANGED) WatchSync.apply(applicationContext, event.dataItem)
    }
  }
}
