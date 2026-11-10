package com.forgeai.wear

import android.content.Context
import android.os.PowerManager
import android.provider.Settings

/**
 * R-442 (10 Nov 2026, owner): "During a workout the watch screen turns fully OFF instead of dimming. I keep
 * Always-on display OFF on purpose. The watch's own exercise app dims without it, so ours must too. Never ask
 * members to change a watch setting."
 *
 * Why the screen went black: every version since 0.56 dimmed only through the watch's own dim state
 * (ambient, AmbientLifecycleObserver in [MainActivity]). Google: an app enters that state only "if the always
 * on display is enabled in settings" (developer.android.com/training/wearables/always-on, Debugging), and our
 * own emulator check shows it (watch_keep_screen_uat.sh: Always-on off = black, no ambient-enter in the diary).
 * No version ever kept the screen on itself. With Always-on off there was nothing to dim.
 *
 * What the app does now, only while a workout is open, MettleUp is on screen, the watch's Always-on display is
 * off and Battery Saver is off: it keeps the screen on (FLAG_KEEP_SCREEN_ON, the documented keepScreenOn) and
 * dims it ITSELF, the way the watch would: after the watch's own screen timeout without a touch, or ~1 s after
 * the wrist goes down, the screen drops to the lowest brightness and draws the same black, outlined dim screens
 * as the watch's dim state. A tap, a crown turn or a wrist raise (accelerometer, face turned up) makes it bright
 * again; that first tap only wakes, it never presses a button. When the workout ends the screen is let go and
 * turns fully off by the watch's own timeout. With Always-on ON nothing changes: the watch's dim state is used.
 *
 * Battery Saver: left alone on purpose (the watch is low, at 15 % on a Pixel Watch, and switches its own dim
 * screen off to last longer); the diary names it.
 *
 * Everything here that decides is PURE and JVM-tested (SelfDimTest); [MainActivity] does the Android side.
 */
object SelfDim {
  /** The dimmed screen's brightness (window override; Android raises anything lower to the screen's minimum). */
  const val DIM_BRIGHTNESS = 0.01f

  /** The watch's screen timeout when it cannot be read (Pixel Watch default). */
  const val DEFAULT_TIMEOUT_MS = 15_000L
  const val MIN_TIMEOUT_MS = 5_000L

  /** A watch set to a long timeout still dims within this, as a workout screen should. */
  const val MAX_TIMEOUT_MS = 30_000L

  /** How often the open screen checks that the workout is still open (and the settings unchanged). */
  const val RECHECK_MS = 5_000L

  /** A wrist going down right after a tap does not dim (the member just used the screen). */
  const val QUIET_AFTER_INPUT_MS = 1_500L

  /** Accelerometer while the app dims itself: 10 a second, enough to see a wrist raise. */
  const val SENSOR_PERIOD_US = 100_000

  /**
   * The watch's Always-on display: true on, false off, null unknown. Wear OS keeps it in global
   * ambient_enabled; doze_always_on (the phone name) is read when that one is missing. PURE.
   */
  fun aodOn(global: String?, secure: String?): Boolean? = when (global?.trim()) {
    "0" -> false
    "1" -> true
    else -> when (secure?.trim()) {
      "0" -> false
      "1" -> true
      else -> null
    }
  }

  /**
   * Does the app keep the screen on and dim it itself now? [workoutOpen]: a workout is open (phone spoke of it
   * in the last 4 h). [onScreen]: MettleUp is the screen in front. [aodOn]: [aodOn]. [saverOn]: Battery Saver.
   * [blackedOut]: this workout already had a black screen instead of a dim one while the setting could not be
   * read (a watch that names the setting differently). PURE.
   */
  fun wanted(workoutOpen: Boolean, onScreen: Boolean, aodOn: Boolean?, saverOn: Boolean?, blackedOut: Boolean): Boolean =
    workoutOpen && onScreen && saverOn != true && (aodOn == false || (aodOn == null && blackedOut))

  /** The dim wait: the watch's own screen timeout, kept between [MIN_TIMEOUT_MS] and [MAX_TIMEOUT_MS]. PURE. */
  fun timeoutMs(setting: Long?): Long =
    if (setting == null || setting <= 0L) DEFAULT_TIMEOUT_MS else setting.coerceIn(MIN_TIMEOUT_MS, MAX_TIMEOUT_MS)

  /** How long until the screen dims, [inputAt] being the last tap, crown turn or wrist raise. PURE. */
  fun idleLeft(now: Long, inputAt: Long, timeout: Long): Long = (timeout - (now - inputAt)).coerceIn(0L, timeout)

  /** Milliseconds to the next whole second of a countdown ending at [endsAt] (so the dim digits change in step). PURE. */
  fun toNextSecond(endsAt: Long, now: Long): Long = ((endsAt - now) % 1000L).let { if (it <= 0L) 1000L + it else it }

  /**
   * Wrist raise and wrist down from the accelerometer's z axis (out of the watch face; m/s²). Face up toward the
   * eyes reads about +7..+10, an arm hanging down about 0 (the left/right wrist setting turns x and y, never z).
   * RAISED: the face came up (over [upZ] for [raiseMs]) after being down in the last [raiseWindowMs]. LOWERED: the
   * face stayed down (under [downZ]) for [downHoldMs]. Each is reported once per movement. Lightly smoothed, so a
   * rep's jolt is not a raise. PURE (time is passed in).
   */
  class Wrist(
    private val upZ: Float = 6.0f,
    private val downZ: Float = 3.0f,
    private val raiseMs: Long = 200L,
    private val downHoldMs: Long = 1_000L,
    private val raiseWindowMs: Long = 3_000L,
  ) {
    enum class Move { NONE, RAISED, LOWERED }

    private var z = Float.NaN
    private var downSince = -1L
    private var lastDownAt = Long.MIN_VALUE / 2
    private var upSince = -1L
    private var saidDown = false
    private var saidUp = false

    fun reset() {
      z = Float.NaN
      downSince = -1L
      lastDownAt = Long.MIN_VALUE / 2
      upSince = -1L
      saidDown = false
      saidUp = false
    }

    fun feed(rawZ: Float, t: Long): Move {
      z = if (z.isNaN()) rawZ else z + 0.5f * (rawZ - z)
      if (z < downZ) {
        if (downSince < 0L) downSince = t
        lastDownAt = t
        upSince = -1L
        saidUp = false
        if (!saidDown && t - downSince >= downHoldMs) {
          saidDown = true
          return Move.LOWERED
        }
        return Move.NONE
      }
      downSince = -1L
      saidDown = false
      if (z > upZ) {
        if (upSince < 0L) upSince = t
        if (!saidUp && t - upSince >= raiseMs && upSince - lastDownAt <= raiseWindowMs) {
          saidUp = true
          return Move.RAISED
        }
      } else {
        upSince = -1L
      }
      return Move.NONE
    }
  }

  // ---- The watch, read (never throws) ----

  fun aodOn(ctx: Context): Boolean? = aodOn(read(ctx, "ambient_enabled", global = true), read(ctx, "doze_always_on", global = false))

  fun saverOn(ctx: Context): Boolean? = try {
    (ctx.getSystemService(Context.POWER_SERVICE) as PowerManager).isPowerSaveMode
  } catch (e: Exception) {
    null
  }

  fun timeoutMs(ctx: Context): Long = timeoutMs(
    try {
      Settings.System.getLong(ctx.contentResolver, Settings.System.SCREEN_OFF_TIMEOUT)
    } catch (e: Exception) {
      null
    },
  )

  private fun read(ctx: Context, name: String, global: Boolean): String? = try {
    if (global) Settings.Global.getString(ctx.contentResolver, name) else Settings.Secure.getString(ctx.contentResolver, name)
  } catch (e: Exception) {
    null
  }
}
