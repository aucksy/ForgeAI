package com.forgeai.rest

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build
import org.json.JSONObject

/**
 * The live workout card (13 Oct 2026, the owner's Hevy comparison) — the ongoing notification
 * while a workout is open, replacing the quiet "Workout in progress · 4 of 14 sets done" card:
 *  - title: the exercise being trained ("Bench Press"); text: its next open set ("Set 3 of 5 ·
 *    35 kg × 11" — what a tick would save; the app works the words out);
 *  - the exercise's picture as the large icon, when there is one;
 *  - "Complete set": the rest card's own Done ([RestCard.doneIntent] → [RestActionReceiver]), so it
 *    ticks exactly that set with those numbers and starts the rest, also with the app stopped
 *    (the tap is kept and the app acts on it when it starts, as for the rest card);
 *  - all sets done: "All sets done · Finish", no button.
 *
 * Channel traps (read RestCard's notes first):
 *  - "workout-live" is DEFAULT importance, so the phone files it with the normal notifications,
 *    not under "Silent" — but with no sound and no vibration, and [Notification.Builder.setOnlyAlertOnce],
 *    so an update (every tick) never makes a sound or a buzz.
 *  - A Wear OS watch buzzes for a bridged DEFAULT notification even on a silent channel (that is
 *    why the rest COUNTDOWN is LOW). This card is [Notification.Builder.setLocalOnly]: it stays on
 *    the phone. The watch gets the rest countdown and "Rest is over" only.
 *  - Ongoing (cannot be swiped away while the workout is open); the app removes it at Finish /
 *    Discard ([clear]).
 */
object WorkoutCard {
  const val ID = 41004
  const val CH = "workout-live"
  /** Keeps "Complete set"'s PendingIntent apart from the rest card's Done for the same row. */
  private const val CODE_SHIFT = 1_100_000
  /** The large icon's side, in pixels (Android scales it down to its slot). */
  private const val ICON_PX = 192
  /** The app's dark surface behind a drawing (the library's drawings are light lines). */
  private const val ICON_BG = 0xFF1E1A17.toInt()

  private var iconSrc: String? = null
  private var iconBitmap: Bitmap? = null

  private fun ensureChannel(ctx: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val m = RestCard.nm(ctx)
    if (m.getNotificationChannel(CH) != null) return
    m.createNotificationChannel(
      NotificationChannel(CH, "Live workout", NotificationManager.IMPORTANCE_DEFAULT).apply {
        description = "Your open workout: the next set, and Complete set. Never makes a sound."
        setSound(null, null)
        enableVibration(false)
        enableLights(false)
        setShowBadge(false)
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      },
    )
  }

  /** The "Complete set" row from the app's JSON (null = no button: nothing to save, or no set). */
  private fun doneOf(json: String?): Pair<RestCard.DoneTarget, String?>? {
    if (json.isNullOrEmpty()) return null
    return try {
      val o = JSONObject(json)
      val workout = o.optDouble("workout", 0.0).toLong()
      val ex = o.optString("exKey", "")
      val set = o.optString("setKey", "")
      if (workout <= 0L || ex.isEmpty() || set.isEmpty()) return null
      val values = if (o.isNull("values")) null else o.optString("values", "").ifEmpty { null }
      val label = if (o.isNull("label")) null else o.optString("label", "").ifEmpty { null }
      Pair(RestCard.DoneTarget(workout, ex, set, o.optBoolean("open", false), values), label)
    } catch (_: Exception) {
      null
    }
  }

  /** Post or update the card. False when it could not be posted (the app then uses its old card). */
  @Suppress("DEPRECATION")
  @Synchronized
  fun show(ctx: Context, title: String, text: String, image: String?, doneJson: String?): Boolean {
    return try {
      ensureChannel(ctx)
      val icon = RestCard.iconRes(ctx)
      val b = RestCard.builder(ctx, CH)
        .setSmallIcon(icon)
        .setColor(RestCard.COLOR)
        .setContentTitle(title)
        .setContentText(text)
        .setOnlyAlertOnce(true)
        .setOngoing(true)
        .setAutoCancel(false)
        .setLocalOnly(true)
        .setShowWhen(false)
        .setCategory("workout") // Notification.CATEGORY_WORKOUT (Android 12+); older ones ignore it
        .setVisibility(Notification.VISIBILITY_PUBLIC)
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
        b.setPriority(Notification.PRIORITY_DEFAULT).setSound(null).setVibrate(null)
      }
      bitmap(ctx, image)?.let { b.setLargeIcon(it) }
      // "Complete set" only when the row has numbers to save; else a tap on the card opens the app.
      val done = doneOf(doneJson)
      if (done != null && !done.first.open) {
        RestCard.doneIntent(ctx, done.first, 0L, done.second, CODE_SHIFT)?.let { pi ->
          b.addAction(Notification.Action.Builder(Icon.createWithResource(ctx, icon), "Complete set", pi).build())
        }
      }
      RestCard.openIntent(ctx)?.let { b.setContentIntent(it) }
      RestCard.nm(ctx).notify(ID, b.build())
      true
    } catch (_: Exception) {
      false
    }
  }

  /** The workout ended: the card goes. */
  fun clear(ctx: Context) {
    try {
      RestCard.nm(ctx).cancel(ID)
    } catch (_: Exception) {
      // ignore
    }
  }

  /**
   * The large icon from the app's picture: a member's photo (a file or content uri) or a library
   * drawing (in a release build, a drawable named by the app's bundler). Drawn centred on the app's
   * dark surface, so the light-lined drawings show on a light shade too. Kept while it is the same
   * picture (every tick re-posts the card). Null when there is none or it cannot be read.
   */
  @Synchronized
  private fun bitmap(ctx: Context, src: String?): Bitmap? {
    if (src.isNullOrEmpty()) return null
    if (src == iconSrc) return iconBitmap
    val out = try {
      decode(ctx, src)?.let { onSurface(it) }
    } catch (_: Throwable) {
      null
    }
    iconSrc = src
    iconBitmap = out
    return out
  }

  private fun decode(ctx: Context, src: String): Bitmap? {
    val opts = BitmapFactory.Options().apply { inSampleSize = 1 }
    return when {
      src.startsWith("file://") || src.startsWith("/") -> {
        val path = if (src.startsWith("file://")) Uri.parse(src).path ?: return null else src
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(path, bounds)
        opts.inSampleSize = sample(bounds.outWidth, bounds.outHeight)
        BitmapFactory.decodeFile(path, opts)
      }
      src.startsWith("content://") -> {
        val uri = Uri.parse(src)
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        ctx.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        opts.inSampleSize = sample(bounds.outWidth, bounds.outHeight)
        ctx.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, opts) }
      }
      src.contains("://") -> null // a development server's address: no picture
      else -> {
        val id = ctx.resources.getIdentifier(src, "drawable", ctx.packageName)
        if (id == 0) null else BitmapFactory.decodeResource(ctx.resources, id, opts)
      }
    }
  }

  /** The power of two that brings a big photo near the icon's size. */
  private fun sample(w: Int, h: Int): Int {
    var s = 1
    while (w > 0 && h > 0 && w / (s * 2) >= ICON_PX && h / (s * 2) >= ICON_PX) s *= 2
    return s
  }

  private fun onSurface(src: Bitmap): Bitmap {
    val out = Bitmap.createBitmap(ICON_PX, ICON_PX, Bitmap.Config.ARGB_8888)
    val c = Canvas(out)
    c.drawColor(ICON_BG)
    val scale = minOf(ICON_PX.toFloat() / src.width, ICON_PX.toFloat() / src.height)
    val w = (src.width * scale).toInt()
    val h = (src.height * scale).toInt()
    val left = (ICON_PX - w) / 2
    val top = (ICON_PX - h) / 2
    c.drawBitmap(src, null, Rect(left, top, left + w, top + h), Paint(Paint.FILTER_BITMAP_FLAG))
    return out
  }
}
