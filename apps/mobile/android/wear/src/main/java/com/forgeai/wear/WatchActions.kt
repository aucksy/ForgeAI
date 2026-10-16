package com.forgeai.wear

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.widget.Toast
import com.google.android.gms.wearable.Wearable

/**
 * C5-2 (16 Oct 2026): the watch's own buttons. The watch could tick a set only from the phone's
 * copied rest card, which exists only while resting (its Done ticks the NEXT set, before it is
 * done); after the rest it had no button at all. Now:
 *  - "Complete set" on the workout screen ([MainActivity]) and on this app's "Rest is over";
 *  - Done / +15 s / Skip on this app's own rest countdown (the phone's card is no longer copied
 *    here, C5-3).
 * Each goes to the phone as a Wear message /forge/act/{done|add|skip} (done carries the row exactly
 * as the phone sent it). The phone (WearActionService.kt) handles it as a tap on its own card, with
 * ForgeAI open or closed. The phone's answer (a new rest, the next row) arrives as usual.
 */
object WatchActions {
  private const val TAG = "ForgeWear"
  const val PATH = "/forge/act"
  const val ACTION = "com.forgeai.wear.ACT"
  const val EXTRA_WHAT = "what"
  const val EXTRA_ROW = "row"
  /** U-W3: the phone's answer when it could not use a Done / "Complete set" ([refused]). */
  const val PATH_NACK_DONE = "/forge/nack/done"

  private val main = Handler(Looper.getMainLooper())

  /** A short note on the watch (from any thread: a listener service calls on a worker thread). */
  private fun note(ctx: Context, text: String) {
    val app = ctx.applicationContext
    main.post {
      try {
        Toast.makeText(app, text, Toast.LENGTH_SHORT).show()
      } catch (e: Exception) {
        Log.w(TAG, "no toast", e)
      }
    }
  }

  /**
   * U-W3 (17 Oct 2026): the phone received a Done / "Complete set" but could not use it (it could
   * not read the row). The button comes back at once and the member is told, instead of the button
   * hiding for 20 s as if the set were saved.
   */
  fun refused(ctx: Context) {
    Log.w(TAG, "the phone could not log the set sent from here")
    WatchState.sendFailed(ctx)
    note(ctx, "Not saved. Tick it on your phone")
  }

  /** "Complete set" / Done for [row] (the phone's JSON); the button hides until the phone answers. */
  fun complete(ctx: Context, row: String, onDone: () -> Unit = {}) {
    if (row.isEmpty()) {
      onDone()
      return
    }
    WatchState.markSent(ctx, row)
    send(ctx, "done", row, onDone)
  }

  /**
   * Sends one message to every connected phone (there is one); [onDone] runs once when all have
   * answered. Nothing connected or a failure: a short note on the watch, and the button is back.
   */
  fun send(ctx: Context, what: String, row: String, onDone: () -> Unit = {}) {
    val app = ctx.applicationContext
    val path = "$PATH/$what"
    val bytes = row.toByteArray(Charsets.UTF_8)
    val fail: (String) -> Unit = { why ->
      Log.w(TAG, "$path not sent: $why")
      if (what == "done") WatchState.sendFailed(app)
      note(app, "Phone not reachable")
      onDone()
    }
    try {
      Wearable.getNodeClient(app).connectedNodes
        .addOnSuccessListener { nodes ->
          if (nodes.isEmpty()) {
            fail("no phone connected")
            return@addOnSuccessListener
          }
          var left = nodes.size
          var sent = false
          for (n in nodes) {
            Wearable.getMessageClient(app).sendMessage(n.id, path, bytes)
              .addOnSuccessListener { sent = true }
              .addOnFailureListener { e -> Log.w(TAG, "$path to ${n.displayName} failed", e) }
              .addOnCompleteListener {
                left -= 1
                if (left == 0) {
                  if (sent) {
                    Log.i(TAG, "$path sent")
                    onDone()
                  } else {
                    fail("every phone refused it")
                  }
                }
              }
          }
        }
        .addOnFailureListener { e -> fail(e.toString()) }
    } catch (e: Exception) {
      fail(e.toString())
    }
  }

  /** A notification button that sends [what] (with [row]) through [WatchActionReceiver]. */
  fun pending(ctx: Context, what: String, row: String, code: Int): PendingIntent {
    val i = Intent(ctx, WatchActionReceiver::class.java)
      .setAction(ACTION)
      .putExtra(EXTRA_WHAT, what)
      .putExtra(EXTRA_ROW, row)
    return PendingIntent.getBroadcast(ctx, code, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }
}

/** A button on this app's countdown or "Rest is over": the message goes to the phone ([WatchActions]). */
class WatchActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != WatchActions.ACTION) return
    val app = context.applicationContext
    val what = intent.getStringExtra(WatchActions.EXTRA_WHAT) ?: return
    val row = intent.getStringExtra(WatchActions.EXTRA_ROW).orEmpty()
    // The tapped card has done its job (the phone's answer brings the next one).
    if (what == "done") RestAlerts.overTapped(app)
    val result = goAsync()
    val finish: () -> Unit = {
      try {
        result.finish()
      } catch (e: Exception) {
        Log.w("ForgeWear", "button broadcast already finished", e)
      }
    }
    if (what == "done") WatchActions.complete(app, row, finish) else WatchActions.send(app, what, "", finish)
  }
}
