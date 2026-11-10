package com.forgeai.phone

import android.app.Activity
import android.os.Build
import android.util.Log
import android.view.View
import android.view.WindowInsetsController
import android.view.inspector.WindowInspector

/**
 * R-440 (10 Nov 2026): the status bar's icons over a full-page pop-up.
 *
 * A React Native Modal is its own Android window (a Dialog), and the status bar takes its icon colour
 * from the TOP window. React Native 0.85's StatusBar (expo-status-bar wraps it) only ever sets the app's
 * main window (StatusBarModule.setStyle: activity.window), so a <StatusBar> inside the pop-up changes
 * nothing the member sees. The Modal copies the main window's icons once when it opens; on the cloud
 * phone (UAT run for R-438) the pop-up window still drew WHITE icons on the light look's cream page.
 * (Upstream fixed StatusBar for Modal windows after 0.85: facebook/react-native PR #56059.)
 *
 * So the pop-up asks, once it is on screen (its onShow), for its own window's icons to follow the
 * app's look: dark on the light look, light on the dark one. Navigation-bar buttons too (the Modal
 * picks those from the PHONE's light/dark setting, which can differ from the member's choice).
 * Each call logs what it found under ForgeBars, so the cloud test shows the before and after.
 */
internal object PopupBars {
  private const val TAG = "ForgeBars"
  private const val MASK =
    WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS

  /** Dark status-bar icons on [root]'s window? null = cannot tell. */
  @Suppress("DEPRECATION")
  private fun darkIcons(root: View): Boolean? =
    if (Build.VERSION.SDK_INT >= 30) {
      root.windowInsetsController?.let { (it.systemBarsAppearance and WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS) != 0 }
    } else {
      (root.systemUiVisibility and View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR) != 0
    }

  @Suppress("DEPRECATION")
  private fun setDarkIcons(root: View, dark: Boolean) {
    if (Build.VERSION.SDK_INT >= 30) {
      root.windowInsetsController?.setSystemBarsAppearance(if (dark) MASK else 0, MASK)
    } else {
      val f = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
      root.systemUiVisibility = if (dark) root.systemUiVisibility or f else root.systemUiVisibility and f.inv()
    }
  }

  /** On the UI thread. `light`: the app shows the light look (so the icons go dark). Returns what it did. */
  fun apply(activity: Activity, light: Boolean): String {
    // WindowInspector (the list of this app's windows) is Android 10+; older phones keep the Modal's copy.
    if (Build.VERSION.SDK_INT < 29) return "unsupported"
    return try {
      val main = activity.window?.decorView
      val windows = WindowInspector.getGlobalWindowViews()
      // The newest window that is not the app's own: the pop-up that just opened.
      val top = windows.lastOrNull { it !== main && it.isAttachedToWindow && it.windowToken != null }
      if (top == null) {
        Log.i(TAG, "no pop-up window open (${windows.size} windows)")
        return "none"
      }
      val before = darkIcons(top)
      setDarkIcons(top, light)
      val msg =
        "pop-up window: dark icons before=$before, app window dark icons=${main?.let { darkIcons(it) }}, " +
          "now=${darkIcons(top)} (look ${if (light) "light" else "dark"}, ${windows.size} windows)"
      Log.i(TAG, msg)
      if (before == light) "same" else "set"
    } catch (e: Throwable) {
      Log.w(TAG, "pop-up status bar could not be set", e)
      "failed"
    }
  }
}
