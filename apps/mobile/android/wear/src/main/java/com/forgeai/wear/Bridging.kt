package com.forgeai.wear

import android.app.NotificationManager
import android.content.Context
import android.util.Log
import androidx.wear.phone.interactions.notifications.BridgingConfig
import androidx.wear.phone.interactions.notifications.BridgingManager

/**
 * One "Rest is over" on the watch, not two. The phone tags its "Rest is over" alert with the bridge
 * tag "rest-over" (RestCard.BRIDGE_TAG_OVER); this app posts its own and buzzes itself, so it asks
 * Wear OS not to copy that one alert — but ONLY while this app may post notifications. Without that
 * permission its own card cannot show, so the phone's copy stays (the buzz is ours either way).
 * The phone's rest card (Done / +15 s / Skip) has no tag and is always copied.
 */
object Bridging {
  private const val TAG = "ForgeWear"
  private const val TAG_OVER = "rest-over"
  private const val PREFS = "forgeai_watch_bridging"

  /** Apply the config if it changed since the last time (setConfig binds to a system service). */
  fun sync(ctx: Context) {
    val app = ctx.applicationContext
    val exclude = try {
      (app.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).areNotificationsEnabled()
    } catch (e: Exception) {
      Log.w(TAG, "notification state unknown", e)
      false
    }
    val p = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val want = if (exclude) "exclude" else "all"
    if (p.getString("applied", null) == want) return
    try {
      val b = BridgingConfig.Builder(app, true)
      if (exclude) b.addExcludedTag(TAG_OVER)
      BridgingManager.fromContext(app).setConfig(b.build())
      p.edit().putString("applied", want).apply()
      Log.i(TAG, "bridging: $want")
    } catch (e: Exception) {
      Log.w(TAG, "bridging config not set", e)
    }
  }
}
