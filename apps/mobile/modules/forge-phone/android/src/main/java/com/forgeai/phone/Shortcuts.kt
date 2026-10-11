package com.forgeai.phone

import android.content.Context
import android.content.Intent
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build
import org.json.JSONArray

/**
 * Audit Phase 9: the long-press shortcuts on ForgeAI's app icon ("Start Push 1", "Log body
 * weight"). The app hands the list as JSON (`appShortcuts` in src/tracker/phone/widgets.ts);
 * each one opens a forgeai:// link inside ForgeAI, exactly like the Today widget's.
 *
 * Android limits how often an app in the background may change its shortcuts, so the list is
 * only handed over when it changed (the last one is kept). An empty list removes them all.
 */
object Shortcuts {
  private const val PREFS = "forge_shortcuts"
  private const val KEY_LAST = "last"

  fun save(c: Context, json: String): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N_MR1) return false
    val prefs = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val sm = c.getSystemService(ShortcutManager::class.java) ?: return false
    val arr = JSONArray(json)
    // Skipped only while the launcher still holds them: Android restores this file with a backup
    // (a reinstall, a new phone) but never the shortcuts themselves.
    if (prefs.getString(KEY_LAST, null) == json && sm.dynamicShortcuts.size == minOf(arr.length(), 4)) return true
    if (arr.length() == 0) {
      sm.removeAllDynamicShortcuts()
      // Erase all data: a shortcut dragged onto the home screen must not keep the routine and key.
      try {
        sm.disableShortcuts(listOf("today", "weight"))
      } catch (_: Exception) {
        // none pinned
      }
      prefs.edit().putString(KEY_LAST, json).apply()
      return true
    }
    // Back after an erase: the pinned ones work again (they are updated below).
    try {
      sm.enableShortcuts(listOf("today", "weight"))
    } catch (_: Exception) {
      // none pinned
    }
    val list = ArrayList<ShortcutInfo>()
    for (i in 0 until minOf(arr.length(), 4)) {
      val o = arr.getJSONObject(i)
      val id = o.getString("id")
      val uri = o.getString("uri")
      if (!uri.startsWith("forgeai://")) continue
      val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).setPackage(c.packageName)
      val icon = Icon.createWithResource(c, if (id == "weight") R.drawable.forge_shortcut_weight else R.drawable.forge_shortcut_start)
      list.add(
        ShortcutInfo.Builder(c, id)
          .setShortLabel(o.getString("short"))
          .setLongLabel(o.getString("long"))
          .setIcon(icon)
          .setIntent(intent)
          .setRank(i)
          .build(),
      )
    }
    val ok = sm.setDynamicShortcuts(list)
    // A shortcut the member dragged onto the home screen keeps up too (same id).
    try {
      sm.updateShortcuts(list)
    } catch (_: Exception) {
      // rate limited: the menu above is what matters
    }
    if (ok) prefs.edit().putString(KEY_LAST, json).apply()
    return ok
  }
}
