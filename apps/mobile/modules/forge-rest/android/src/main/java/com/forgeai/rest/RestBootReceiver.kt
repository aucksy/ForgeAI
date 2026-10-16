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
 */
class RestBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val a = intent.action
    if (a != Intent.ACTION_BOOT_COMPLETED && a != Intent.ACTION_MY_PACKAGE_REPLACED) return
    try {
      RestCard.recover(context.applicationContext)
    } catch (e: Exception) {
      android.util.Log.w("ForgeRest", "rest not recovered after $a", e)
    }
  }
}
