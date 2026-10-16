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
 *
 * v0.37.1 (C1): a Done / "Complete set" with no JS running is handled on the phone ([OfflineTick]).
 * C5-2 (16 Oct 2026): the ForgeAI watch app's own buttons arrive here too, re-sent as these very
 * broadcasts by [WearActionService].
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
      // 13 Oct 2026: "Rest is over" swiped away (v0.37.1: or timed out) — the live workout card comes back.
      RestCard.ACTION_OVER_GONE -> RestCard.overGone(ctx)
      // v0.37.1 (C3): the "Open ForgeAI to …" note went — the live workout card comes back.
      RestCard.ACTION_NOTE_GONE -> RestCard.noteGone(ctx)
      // C5-15: the rest card was swiped away / "Clear all" mid-rest — the live card comes back.
      RestCard.ACTION_CARD_GONE -> RestCard.cardGone(ctx)
      // C5-10: the live card itself was swiped away (Android 14+) — it is put back.
      WorkoutCard.ACTION_GONE -> WorkoutCard.restore(ctx)
      RestCard.ACTION_DONE -> {
        val l = RestCard.listener
        if (l == null) {
          // v0.37.1 (C1): ForgeAI is closed (no JS). The phone starts the rest and moves the live
          // card on by itself, from the app's plan; the tick waits for the app (OfflineTick).
          if (OfflineTick.run(ctx, intent)) return
          // Not in the plan: the tap is kept for the app, and a note says so (it keeps the live
          // card away while it shows: one notification at a time).
          val q = RestCard.doneTapped(ctx, intent) ?: return
          RestCard.noteQueued(ctx, q.label)
          return
        }
        // Kept for the app, which ticks the row through its own store (never written here).
        val d = RestCard.doneTapped(ctx, intent) ?: return
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
