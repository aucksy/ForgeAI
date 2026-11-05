package com.forgeai.wear

import android.content.Context
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * R-353 (5 Nov 2026, owner): "the dim screen worked at the start of the workout. After I left the app
 * and/or got a phone call, the watch no longer dims while the app is open: the screen goes fully
 * black, and on wrist raise the app comes back bright." His always-on screen was on (it dimmed
 * earlier in the same workout).
 *
 * What is known (developer.android.com/training/wearables/always-on): Wear OS gives the dimmed
 * (ambient) state only to the app it has registered as ambient-capable, which the AmbientLifecycleObserver
 * does ONCE, in onCreate (setAmbientEnabled; androidx.wear 1.3.0 AmbientLifecycleObserverImpl). After
 * that the activity only forwards onResume/onPause/onStop. Nothing re-registers it when another app
 * (the call screen) took the front and MettleUp comes back. A screen that goes OFF instead of dim,
 * while MettleUp is in front and the same watch dimmed it earlier, means Wear OS no longer treats this
 * activity instance as ambient-capable.
 *
 * Two parts:
 *  1. [Heal]: the screen-off-instead-of-dim is detected (onStop with the screen off, not in ambient,
 *     a workout open, and ambient already worked in this process, so the watch's always-on screen is
 *     on). On the next wrist raise MainActivity is recreated, which registers ambient afresh.
 *  2. [Log]: a short on-watch diary of the screen's life (ambient enter/exit, pause/resume/stop,
 *     focus, the screen state, Battery Saver, the always-on setting), so the next report can show WHY.
 *     It is kept on the watch and copied to the Data Layer as /forge/diag (the phone receives the item
 *     but does not read it yet; the phone's feedback screen can attach it later).
 */
object AmbientDiag {
  private const val TAG = "ForgeWear"
  private const val PREFS = "forgeai_watch_diag"
  private const val KEY = "log"
  const val PATH = "/forge/diag"

  /** Lines kept: about two workouts of screen events. */
  const val MAX_LINES = 150

  /** At most one Data Layer copy per this long (a stop/start storm must not spam Bluetooth). */
  const val PUSH_EVERY_MS = 60_000L

  /** The decision to rebuild the screen. PURE (JVM-tested in AmbientDiagTest). */
  object Heal {
    /**
     * Rebuilds in a row that did not bring the dim screen back. After this many the cause is not ours
     * (Battery Saver, Bedtime, Theatre mode, a system bug): stop rebuilding and only log.
     */
    const val MAX_TRIES = 2

    /**
     * The screen went OFF where it should have dimmed. [screenOn]: PowerManager.isInteractive at
     * onStop (true = the member left the app, which is not this). [ambient]: in ambient at that moment
     * (the system can stop the app from the dim state, e.g. Wear OS 5+'s return to the watch face).
     * [ambientWorked]: ambient was entered before in this process, so the watch's always-on screen is
     * on. [workoutOpen]: only mid-workout does MettleUp have to stay dim.
     */
    fun blackout(screenOn: Boolean, ambient: Boolean, ambientWorked: Boolean, workoutOpen: Boolean, finishing: Boolean): Boolean =
      !screenOn && !ambient && ambientWorked && workoutOpen && !finishing

    /** Rebuild on the next start? [tries]: rebuilds since ambient last worked. */
    fun shouldRebuild(blackoutSeen: Boolean, tries: Int): Boolean = blackoutSeen && tries < MAX_TRIES
  }

  /** The diary's text. PURE. */
  object Lines {
    /** [lines] plus [line], keeping the newest [max]. */
    fun append(lines: List<String>, line: String, max: Int = MAX_LINES): List<String> {
      val all = lines + line
      return if (all.size <= max) all else all.subList(all.size - max, all.size)
    }

    fun split(text: String): List<String> = if (text.isEmpty()) emptyList() else text.split('\n')

    fun join(lines: List<String>): String = lines.joinToString("\n")

    /** One line: "HH:mm:ss.SSS event detail". [stamp] is the formatted time. */
    fun line(stamp: String, event: String, detail: String = ""): String =
      if (detail.isEmpty()) "$stamp $event" else "$stamp $event $detail"
  }

  private var lastPush = 0L

  private fun stamp(t: Long): String = SimpleDateFormat("MM-dd HH:mm:ss.SSS", Locale.US).format(Date(t))

  /** Adds one line (never throws). */
  fun note(ctx: Context, event: String, detail: String = "") {
    try {
      val p = ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val line = Lines.line(stamp(System.currentTimeMillis()), event, detail)
      Log.i(TAG, "diag $line")
      val next = Lines.append(Lines.split(p.getString(KEY, "") ?: ""), line)
      p.edit().putString(KEY, Lines.join(next)).apply()
    } catch (e: Exception) {
      Log.w(TAG, "diag not written", e)
    }
  }

  /** The whole diary, oldest first. */
  fun text(ctx: Context): String = try {
    ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "") ?: ""
  } catch (e: Exception) {
    ""
  }

  /** The watch's power and display state, for a line: screen, Battery Saver, always-on, theatre. */
  fun state(ctx: Context): String {
    val pm = try {
      ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
    } catch (e: Exception) {
      null
    }
    val on = pm?.let { runCatching { it.isInteractive }.getOrNull() }
    val saver = pm?.let { runCatching { it.isPowerSaveMode }.getOrNull() }
    val idle = pm?.let { runCatching { it.isDeviceIdleMode }.getOrNull() }
    return "screen=${on.yn()} saver=${saver.yn()} idle=${idle.yn()} aod=${setting(ctx, "ambient_enabled", global = true)}" +
      "/${setting(ctx, "doze_always_on", global = false)} theatre=${setting(ctx, "theater_mode_on", global = true)}"
  }

  private fun Boolean?.yn(): String = when (this) {
    true -> "1"
    false -> "0"
    null -> "?"
  }

  /** A system setting by name; "?" when Android does not let an app read it. */
  private fun setting(ctx: Context, name: String, global: Boolean): String = try {
    val v = if (global) Settings.Global.getString(ctx.contentResolver, name) else Settings.Secure.getString(ctx.contentResolver, name)
    v ?: "-"
  } catch (e: Exception) {
    "?"
  }

  /** Copies the diary to the Data Layer (/forge/diag), at most once per [PUSH_EVERY_MS]. */
  fun push(ctx: Context, force: Boolean = false) {
    val now = System.currentTimeMillis()
    if (!force && now - lastPush < PUSH_EVERY_MS) return
    lastPush = now
    try {
      val req = PutDataMapRequest.create(PATH)
      req.dataMap.putString("log", text(ctx))
      req.dataMap.putLong("at", now)
      Wearable.getDataClient(ctx.applicationContext).putDataItem(req.asPutDataRequest())
        .addOnFailureListener { e -> Log.w(TAG, "diag not sent", e) }
    } catch (e: Exception) {
      Log.w(TAG, "diag not sent", e)
    }
  }
}
