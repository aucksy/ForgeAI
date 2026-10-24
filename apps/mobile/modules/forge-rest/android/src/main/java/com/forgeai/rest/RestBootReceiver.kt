package com.forgeai.rest

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * C5-5 (16 Oct 2026): the phone restarted, or ForgeAI was updated, mid-workout. Android drops the
 * rest's alarm and (on a restart) every notification; nothing brought them back until the app was
 * opened, so the phone never said "Rest is over" (the watch, which did not restart, still buzzed)
 * and the live card with "Complete set" was gone. [RestCard.recover] puts a running rest's card and
 * alarm back, forgets one that ended meanwhile, and brings the live card back.
 *
 * RECEIVE_BOOT_COMPLETED is already in the app (expo-notifications declares it; it is on
 * scripts/ci/approved-permissions.txt), so the permission list does not change.
 *
 * 0.56.1 (Google Play policy: no USE_EXACT_ALARM): Android sends
 * [ACTION_EXACT_ALARM_ALLOWED] when the member turns "Alarms & reminders" on for MettleUp (Android
 * 12+, from the rest timer's ask or Settings). A rest running then gets its alarm set again, now
 * exact ([RestCard.rearm]), even if the member never comes back to the app before it ends. (Taking
 * the switch away again kills the app and drops its alarms; [RestCard.recover] is not needed then:
 * the app's next start re-arms the rest inexactly.)
 */
class RestBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val a = intent.action
    if (a == ACTION_EXACT_ALARM_ALLOWED) {
      try {
        RestCard.rearm(context.applicationContext)
        android.util.Log.i("ForgeRest", "Alarms & reminders changed: running rest re-armed (exact=${RestCard.canScheduleExact(context)})")
      } catch (e: Exception) {
        android.util.Log.w("ForgeRest", "rest not re-armed after $a", e)
      }
      return
    }
    if (a != Intent.ACTION_BOOT_COMPLETED && a != Intent.ACTION_MY_PACKAGE_REPLACED) return
    try {
      RestCard.recover(context.applicationContext)
    } catch (e: Exception) {
      android.util.Log.w("ForgeRest", "rest not recovered after $a", e)
    }
  }
}

/** AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED (API 31), as a string. */
internal const val ACTION_EXACT_ALARM_ALLOWED = "android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED"
