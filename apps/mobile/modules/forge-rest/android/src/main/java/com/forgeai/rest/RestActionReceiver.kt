package com.forgeai.rest

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * "+15 s" and "Skip" on the rest card — tapped in the phone's shade or on the watch (a tap on a
 * copied alert runs here, on the phone) — and the end-of-rest alarm. Works without the app's
 * JS: the card and the alarm change here, and JS is told if it is running (else it reads the
 * saved rest when it wakes).
 */
class RestActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val ctx = context.applicationContext
    when (intent.action) {
      RestCard.ACTION_ADD -> {
        val r = RestCard.add(ctx) ?: return
        RestCard.listener?.invoke("add", r.endsAt, r.startedAt)
      }
      RestCard.ACTION_SKIP -> {
        RestCard.clear(ctx, dismissOver = false)
        RestCard.listener?.invoke("skip", 0L, 0L)
      }
      RestCard.ACTION_END -> RestCard.fireEnd(ctx, intent.getLongExtra(RestCard.EXTRA_ENDS, -1L))
    }
  }
}
