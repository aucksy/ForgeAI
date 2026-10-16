package com.forgeai.wear

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Watch restarted or the app updated: a rest still running gets its alarm and countdown back. */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val a = intent.action
    if (a != Intent.ACTION_BOOT_COMPLETED && a != Intent.ACTION_MY_PACKAGE_REPLACED) return
    val app = context.applicationContext
    WatchState.recover(app)
    Bridging.sync(app)
  }
}
