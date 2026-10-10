package com.forgeai.phone

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import java.io.File

/**
 * v0.28.0 — a Hevy / Strong export shared to ForgeAI from Android's share menu (ACTION_SEND with
 * a .csv / .xlsx). The shared file is copied into the app's cache (the sharing app's permission to
 * read it ends with the share), and JS opens the import with it. Each share is taken once.
 */
object Share {
  /** A share that arrived while the app was running (onNewIntent does not replace getIntent()). */
  @Volatile var pending: Intent? = null

  private const val TAKEN = "com.forgeai.phone.SHARE_TAKEN"
  private const val MAX_BYTES = 50L * 1024 * 1024

  /**
   * A share not taken yet. Reopened from Recents after Android closed the app, the activity is
   * rebuilt from the same share with "launched from history" set — that one was taken before.
   * (The same file shared again on purpose is a new share and is taken.)
   */
  fun isShare(intent: Intent?): Boolean =
    intent != null &&
      intent.action == Intent.ACTION_SEND &&
      !intent.getBooleanExtra(TAKEN, false) &&
      (intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) == 0 &&
      streamOf(intent) != null

  @Suppress("DEPRECATION")
  private fun streamOf(intent: Intent): Uri? {
    val u: Uri? =
      if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
      else intent.getParcelableExtra(Intent.EXTRA_STREAM) as? Uri
    return u ?: intent.clipData?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.uri
  }

  /** The file's own name, as the sharing app gave it. */
  private fun nameOf(c: Context, uri: Uri): String {
    try {
      c.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cur ->
        if (cur.moveToFirst()) {
          val n = cur.getString(0)
          if (!n.isNullOrBlank()) return n
        }
      }
    } catch (_: Throwable) {
      // fall through
    }
    return uri.lastPathSegment?.substringAfterLast('/')?.takeIf { it.isNotBlank() } ?: "shared-export"
  }

  /**
   * Take the share once: copy it to the cache and return (file uri, name, type), or null when the
   * intent holds no share (or it was taken already).
   */
  fun take(c: Context, intent: Intent?): Map<String, String>? {
    if (!isShare(intent)) return null
    val i = intent!!
    i.putExtra(TAKEN, true)
    val uri = streamOf(i) ?: return null
    val name = nameOf(c, uri).replace(Regex("[^A-Za-z0-9._ -]"), "_").take(80).let { if (it.trim('.', ' ').isEmpty()) "shared-export" else it }
    val dir = File(c.cacheDir, "shared-import").apply { mkdirs() }
    dir.listFiles()?.forEach { it.delete() } // only the newest share is kept
    val out = File(dir, name.ifBlank { "shared-export" })
    c.contentResolver.openInputStream(uri)?.use { input ->
      out.outputStream().use { o ->
        val buf = ByteArray(64 * 1024)
        var total = 0L
        while (true) {
          val n = input.read(buf)
          if (n < 0) break
          total += n
          if (total > MAX_BYTES) throw IllegalStateException("too big")
          o.write(buf, 0, n)
        }
      }
    } ?: return mapOf("error" to "unreadable") // the sharing app gave no way to read it (audit IM-17)
    return mapOf("uri" to Uri.fromFile(out).toString(), "name" to name, "type" to (i.type ?: ""))
  }
}
