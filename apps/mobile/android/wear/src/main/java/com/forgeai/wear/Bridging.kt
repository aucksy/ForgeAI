package com.forgeai.wear

import android.app.NotificationManager
import android.content.Context
import android.util.Log
import androidx.wear.phone.interactions.notifications.BridgingConfig
import androidx.wear.phone.interactions.notifications.BridgingManager

/**
 * Which of the phone's ForgeAI notifications Wear OS copies to this watch. While this app may post
 * notifications it shows the rest itself (its own countdown with Done / +15 s / Skip, its own buzz
 * and "Rest is over" with "Complete set"), so it asks Wear OS not to copy:
 *  - "rest-over": the phone's "Rest is over" (RestCard.BRIDGE_TAG_OVER, the only alert with it);
 *  - "rest-card": the phone's rest countdown (RestCard.BRIDGE_TAG_CARD). C5-3 (16 Oct 2026): it is
 *    now a DEFAULT notification on the phone (so a Pixel's lock screen shows it), and a copied
 *    DEFAULT notification buzzes the watch at every rest start.
 *
 * C5 review (16 Oct 2026): ONLY while this app's notifications are allowed. With them refused this
 * app can show no countdown and no buttons, so the phone's copies are the watch's only countdown
 * and buttons and they come through. Then the copied "Rest is over" is the end-of-rest buzz and
 * this app does not buzz too ([shouldBuzz]: C5-6, one buzz, not two).
 */
object Bridging {
  private const val TAG = "ForgeWear"
  private const val TAG_OVER = "rest-over"
  private const val TAG_CARD = "rest-card"
  private const val PREFS = "forgeai_watch_bridging"

  /** May this app post notifications (its own countdown, buttons and "Rest is over")? */
  fun canPost(ctx: Context): Boolean = try {
    (ctx.applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).areNotificationsEnabled()
  } catch (e: Exception) {
    Log.w(TAG, "notification state unknown", e)
    true
  }

  /**
   * C5-6: buzz at the rest's end ourselves? Yes while our notifications are allowed (the phone's
   * copy is kept off the watch). With them refused the copied phone alert buzzes, so no.
   */
  fun shouldBuzz(ctx: Context): Boolean = canPost(ctx)

  /** Apply the config if it changed since the last time (setConfig binds to a system service). */
  fun sync(ctx: Context) {
    val app = ctx.applicationContext
    val exclude = canPost(app)
    val want = if (exclude) "exclude-over-card" else "all"
    val p = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    if (p.getString("applied", null) == want) return
    try {
      val b = BridgingConfig.Builder(app, true)
      if (exclude) {
        b.addExcludedTag(TAG_OVER)
        b.addExcludedTag(TAG_CARD)
      }
      BridgingManager.fromContext(app).setConfig(b.build())
      p.edit().putString("applied", want).apply()
      Log.i(TAG, "bridging: $want")
    } catch (e: Exception) {
      Log.w(TAG, "bridging config not set", e)
    }
  }
}
