package com.forgeai.wear

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** The rest's end alarm ([RestAlerts.arm]): buzz and "Rest is over", if that rest still stands. */
class RestAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != RestAlerts.ACTION_END) return
    WatchState.onAlarm(context.applicationContext, intent.getLongExtra(RestAlerts.EXTRA_ENDS, -1L))
  }
}
