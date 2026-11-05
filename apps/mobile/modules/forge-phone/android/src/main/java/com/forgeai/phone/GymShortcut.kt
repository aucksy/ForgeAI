package com.forgeai.phone

import android.content.Context
import android.content.Intent
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.drawable.Icon
import android.os.Build
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/**
 * OWNER-INBOX #11 (decided 18 Oct 2026, icon option A): "Add <gym> to your home screen". Android
 * never lets an app swap its own icon for a downloaded picture, so this pins a home-screen shortcut
 * drawn from the gym's logo that opens ForgeAI. Android itself asks the member first ("Add to home
 * screen?"); nothing is placed without that yes. ForgeAI stays in the app list as it is.
 *
 * One shortcut per phone (id "gym"): asking again after a switch to another gym redraws the one
 * already pinned. Leaving the gym disables it (Android lets an app grey out a pinned shortcut, not
 * remove it); joining again enables it.
 */
object GymShortcut {
  private const val ID = "gym"
  /** Adaptive icon canvas: 108 dp at xxxhdpi (4 px per dp). Where the logo goes: ShortcutArt. */
  internal const val SIZE = 432
  private const val MAX_BYTES = 4 * 1024 * 1024

  fun supported(c: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
    val sm = c.getSystemService(ShortcutManager::class.java) ?: return false
    return sm.isRequestPinShortcutSupported
  }

  /**
   * Draws the logo and asks Android to pin it (or redraws the one already pinned). With ask=false
   * (a new logo or another gym, app start) only a pinned one is redrawn: nothing is asked. Runs off
   * the UI thread (it downloads). `bg`: the gym's colours as "#rrggbb,#rrggbb" (brand colour, then
   * background tone; either may be missing), used only behind a see-through logo. Returns "asked", "updated", "none", "unsupported", "no-logo" or "failed".
   */
  fun pin(c: Context, name: String, logoUrl: String, bg: String, ask: Boolean): String {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return "unsupported"
    val sm = c.getSystemService(ShortcutManager::class.java) ?: return "unsupported"
    val pinned = sm.pinnedShortcuts.any { it.id == ID }
    if (!pinned && !ask) return "none"
    // Joined again: the greyed-out one works again even if the new picture can't be had.
    if (pinned) sm.enableShortcuts(listOf(ID))
    val logo = download(logoUrl) ?: return "no-logo"
    val icon = Icon.createWithAdaptiveBitmap(drawIcon(logo, ShortcutArt.parseColours(bg)))
    val launch = c.packageManager.getLaunchIntentForPackage(c.packageName) ?: return "failed"
    launch.action = Intent.ACTION_MAIN
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    val label = name.trim().ifEmpty { "Your gym" }
    val info = ShortcutInfo.Builder(c, ID)
      .setShortLabel(label.take(25))
      .setLongLabel(label.take(45))
      .setIcon(icon)
      .setIntent(launch)
      .build()
    if (pinned) {
      return if (sm.updateShortcuts(listOf(info))) "updated" else "failed"
    }
    if (!sm.isRequestPinShortcutSupported) return "unsupported"
    return if (sm.requestPinShortcut(info, null)) "asked" else "failed"
  }

  /** Left the gym: the pinned shortcut greys out with this line (no shortcut pinned: nothing to do). */
  fun off(c: Context, message: String): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
    val sm = c.getSystemService(ShortcutManager::class.java) ?: return false
    if (sm.pinnedShortcuts.none { it.id == ID }) return true
    sm.disableShortcuts(listOf(ID), message)
    return true
  }

  /** The gym's logo (https only, at most 4 MB), decoded; null when it can't be had (offline included). */
  private fun download(url: String): Bitmap? {
    if (!url.startsWith("https://")) return null
    return try {
      fetch(url)
    } catch (e: IOException) {
      android.util.Log.w("ForgeErr", "gym shortcut: logo download failed", e)
      null
    }
  }

  private fun fetch(url: String): Bitmap? {
    val conn = URL(url).openConnection() as HttpURLConnection
    try {
      conn.connectTimeout = 10_000
      conn.readTimeout = 15_000
      conn.instanceFollowRedirects = true
      if (conn.responseCode !in 200..299) return null
      val out = ByteArrayOutputStream()
      conn.inputStream.use { input ->
        val buf = ByteArray(16 * 1024)
        while (true) {
          val n = input.read(buf)
          if (n < 0) break
          out.write(buf, 0, n)
          if (out.size() > MAX_BYTES) return null
        }
      }
      val bytes = out.toByteArray()
      return BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
    } finally {
      conn.disconnect()
    }
  }

  /**
   * T74 (R-356): the logo laid by ShortcutArt's rules on the 108 dp adaptive canvas: the background
   * is the logo's own edge colour (or, behind a see-through logo, the gym's colour it stands out
   * on), and the logo's content stays inside the 66 dp circle no launcher mask cuts. `fills`: the
   * gym's brand colour, then its background tone. Internal: the render test draws it too.
   */
  internal fun drawIcon(logo: Bitmap, fills: List<Int>): Bitmap {
    val k = minOf(1f, ShortcutArt.ANALYSIS_EDGE.toFloat() / maxOf(logo.width, logo.height))
    val aw = maxOf(1, Math.round(logo.width * k))
    val ah = maxOf(1, Math.round(logo.height * k))
    val small = if (aw == logo.width && ah == logo.height) logo else Bitmap.createScaledBitmap(logo, aw, ah, true)
    val px = IntArray(aw * ah)
    small.getPixels(px, 0, aw, 0, 0, aw, ah)
    val plan = ShortcutArt.plan(px, aw, ah, fills)
    val out = Bitmap.createBitmap(SIZE, SIZE, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(out)
    canvas.drawColor(plan.bg)
    val dp = SIZE / ShortcutArt.CANVAS
    // The plan's width is for the small copy; the full logo keeps its own aspect ratio.
    val w = plan.width * dp
    val h = w * logo.height / logo.width
    val left = (SIZE - w) / 2f
    val top = (SIZE - h) / 2f
    canvas.drawBitmap(logo, null, RectF(left, top, left + w, top + h), Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG))
    if (small !== logo) small.recycle()
    return out
  }
}
