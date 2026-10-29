package com.forgeai.wear

import android.app.NotificationManager
import android.content.Context
import android.util.Log
import androidx.wear.phone.interactions.notifications.BridgingConfig
import androidx.wear.phone.interactions.notifications.BridgingManager

/**
 * Which of the phone's ForgeAI notifications Wear OS copies to this watch ([excludedTags]):
 *  - "rest-over": the phone's "Rest is over" (RestCard.BRIDGE_TAG_OVER, the only alert with it).
 *    ALWAYS kept off: this app buzzes at the rest's end itself ([RestAlerts.restOver]), so a copy
 *    would be a second buzz.
 *  - "rest-card": the phone's rest countdown (RestCard.BRIDGE_TAG_CARD). Kept off only while this
 *    app may post notifications: then it shows its own countdown with Done / +15 s / Skip, and the
 *    copy (a DEFAULT notification on the phone since C5-3) would buzz at every rest start. With
 *    them refused this app can show no countdown and no buttons, so the phone's copy comes through.
 *
 * U-W1 (UAT, 17 Oct 2026): with this app's notifications refused, "rest-over" used to come through
 * too and this app stayed quiet (C5-6: one buzz, not two). But a Pixel Watch mutes a copied phone
 * alert while the phone is in use (screen on in the gym, the normal case), so the member felt
 * nothing at all at the rest's end. The one buzz is now always this app's own: the Vibrator needs
 * no notification permission (only VIBRATE, in the manifest), it fires from the watch's own exact
 * alarm, and nothing mutes it while the phone is in use. What the member loses with notifications
 * refused: the "Rest is over" card on the watch (and its "Complete set"); the screen of this app
 * still shows "Rest is over" (R-207: glance-only, no button) and asks once ("Rest alerts", 2 of 2).
 */
object Bridging {
  private const val TAG = "ForgeWear"
  const val TAG_OVER = "rest-over"
  const val TAG_CARD = "rest-card"
  private const val PREFS = "forgeai_watch_bridging"

  /** May this app post notifications (its own countdown, buttons and "Rest is over")? */
  fun canPost(ctx: Context): Boolean = try {
    (ctx.applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).areNotificationsEnabled()
  } catch (e: Exception) {
    Log.w(TAG, "notification state unknown", e)
    true
  }

  /** The phone tags Wear OS must not copy here: "rest-over" always, "rest-card" only while [canPost]. */
  fun excludedTags(canPost: Boolean): List<String> = if (canPost) listOf(TAG_OVER, TAG_CARD) else listOf(TAG_OVER)

  /** Apply the config if it changed since the last time (setConfig binds to a system service). */
  fun sync(ctx: Context) {
    val app = ctx.applicationContext
    val tags = excludedTags(canPost(app))
    // U-W1: "exclude:" names differ from the old "exclude-over-card" / "all", so a watch updated
    // from an older version applies the new config once.
    val want = "exclude:" + tags.joinToString(",")
    val p = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    if (p.getString("applied", null) == want) return
    try {
      val b = BridgingConfig.Builder(app, true)
      for (t in tags) b.addExcludedTag(t)
      BridgingManager.fromContext(app).setConfig(b.build())
      p.edit().putString("applied", want).apply()
      Log.i(TAG, "bridging: $want")
    } catch (e: Exception) {
      Log.w(TAG, "bridging config not set", e)
    }
  }
}
