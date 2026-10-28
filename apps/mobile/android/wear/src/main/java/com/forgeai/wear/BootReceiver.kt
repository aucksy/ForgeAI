package com.forgeai.wear

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Watch restarted or the app updated: a rest still running gets its alarm and countdown back.
 * R-167: also when "Alarms & reminders" is switched on (the alarm is set again, now exact).
 */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val a = intent.action
    if (a != Intent.ACTION_BOOT_COMPLETED && a != Intent.ACTION_MY_PACKAGE_REPLACED && a != EXACT_CHANGED) return
    val app = context.applicationContext
    WatchState.recover(app)
    Bridging.sync(app)
  }

  private companion object {
    /** AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED (API 31). */
    const val EXACT_CHANGED = "android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED"
  }
}
