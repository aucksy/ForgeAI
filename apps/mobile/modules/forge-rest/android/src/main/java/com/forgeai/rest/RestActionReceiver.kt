package com.forgeai.rest

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * "Done" (Phase 6), "+15 s" and "Skip" on the rest card — tapped in the phone's shade or on the watch (a tap on a
 * copied alert runs here, on the phone) — and the end-of-rest alarm. Works without the app's
 * JS: the card and the alarm change here, and JS is told if it is running (else it reads the
 * saved rest when it wakes).
 *
 * Review fix: a Done handed to the running app keeps this broadcast open (goAsync) until the app
 * says it has acted, at most [RestCard.DONE_HOLD_MS], so Android does not freeze a cached app
 * between the tap and the tick. The hold is always finished ([RestCard.releaseDone]).
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
      RestCard.ACTION_DONE -> {
        // Kept for the app, which ticks the row through its own store (never written here).
        val d = RestCard.doneTapped(ctx, intent) ?: return
        val l = RestCard.listener
        if (l == null) {
          RestCard.noteQueued(ctx, d.label)
          return
        }
        // Held before JS is told, so an answer that comes at once still finds the hold.
        RestCard.holdForDone(goAsync(), RestCard.DONE_HOLD_MS)
        try {
          l.invoke("done", d.endsAt, 0L)
        } catch (_: Exception) {
          RestCard.releaseDone()
        }
      }
    }
  }
}
