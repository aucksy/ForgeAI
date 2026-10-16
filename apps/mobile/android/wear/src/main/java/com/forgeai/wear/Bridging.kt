package com.forgeai.wear

import android.content.Context
import android.util.Log
import androidx.wear.phone.interactions.notifications.BridgingConfig
import androidx.wear.phone.interactions.notifications.BridgingManager

/**
 * Which of the phone's ForgeAI notifications Wear OS copies to this watch. This app shows the rest
 * itself (its own countdown with Done / +15 s / Skip, its own buzz and "Rest is over" with
 * "Complete set"), so it asks Wear OS not to copy:
 *  - "rest-over": the phone's "Rest is over" (RestCard.BRIDGE_TAG_OVER, the only alert with it);
 *  - "rest-card": the phone's rest countdown (RestCard.BRIDGE_TAG_CARD). C5-3 (16 Oct 2026): it is
 *    now a DEFAULT notification on the phone (so a Pixel's lock screen shows it), and a copied
 *    DEFAULT notification buzzes the watch at every rest start.
 *
 * C5-6 (16 Oct 2026): both ALWAYS. Before, "rest-over" was excluded only while this app could post
 * notifications; with that refused the watch buzzed twice at every rest end (this app's own buzz,
 * which needs no permission, then the copied phone alert). The buzz alone is the alert then.
 */
object Bridging {
  private const val TAG = "ForgeWear"
  private const val TAG_OVER = "rest-over"
  private const val TAG_CARD = "rest-card"
  private const val PREFS = "forgeai_watch_bridging"
  /** Bump when the excluded tags change, so the new config is applied once. */
  private const val CONFIG = "exclude-over-card"

  /** Apply the config if it changed since the last time (setConfig binds to a system service). */
  fun sync(ctx: Context) {
    val app = ctx.applicationContext
    val p = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    if (p.getString("applied", null) == CONFIG) return
    try {
      val b = BridgingConfig.Builder(app, true)
      b.addExcludedTag(TAG_OVER)
      b.addExcludedTag(TAG_CARD)
      BridgingManager.fromContext(app).setConfig(b.build())
      p.edit().putString("applied", CONFIG).apply()
      Log.i(TAG, "bridging: $CONFIG")
    } catch (e: Exception) {
      Log.w(TAG, "bridging config not set", e)
    }
  }
}
