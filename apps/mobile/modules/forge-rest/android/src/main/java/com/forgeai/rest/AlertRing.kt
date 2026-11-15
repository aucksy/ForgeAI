package com.forgeai.rest

import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock

/**
 * R-590 (15 Nov 2026): the app rings a gym message itself when the PHONE took the channel's sound away.
 *
 * WHY. OPPO / OnePlus phones (ColorOS 16-17, his OPPO CPH2873 on Android 17) run a system app,
 * NotificationCenter (com.oplus.notificationmanager), with a default rule for every app that is not on
 * OPPO's own package list: banner off, sound off, vibration off. About 60 ms after an app creates a
 * channel it is rewritten: importance HIGH -> DEFAULT, sound -> none, banner -> off (dumpsys:
 * mOriginalImp=4, mImportance=3, mSound=null, mShowBanner=false). WhatsApp, Truecaller, Facebook and the
 * like are on that list; nearly every other app on his phone (Swiggy, Zomato, LinkedIn, Play Console,
 * Microsoft Authenticator, Spends) is rewritten exactly like ours, and a channel we made three weeks after
 * install (gym-messages-quiet, 0.78.0) was rewritten too, so a new channel id does not help.
 * No app can raise its own channel back or turn the banner on. The sound it CAN give: it plays the
 * phone's own notification sound once, right after the message is posted.
 *
 * WHEN (plan, pure): only when the channel is still an alerting one (importance DEFAULT or more), has no
 * sound, the member did not set its sound themselves (hasUserSetSound, Android 11+), the app's
 * notifications are on, Do Not Disturb is off and the phone is on ring (not vibrate, not silent).
 * A phone that kept the sound (Pixel, Samsung, an emulator) rings through the channel and never here.
 * Never twice within RING_GAP_MS (the push task and the in-app post can both report one message).
 */
object AlertRing {
  const val RING_GAP_MS = 4_000L

  /** What the phone says, read once per ring. */
  data class Facts(
    val sdk: Int,
    val notificationsOn: Boolean,
    val channelFound: Boolean,
    val importance: Int,
    val hasSound: Boolean,
    val userSetSound: Boolean,
    val interruptionFilter: Int,
    val ringerMode: Int,
    val sinceLastRingMs: Long,
  )

  /** "ring", or why not (logged by the app). PURE. */
  fun plan(f: Facts): String = when {
    f.sdk < 26 -> "no-channels" // before Android 8 the notification carries its own sound
    !f.notificationsOn -> "notifications-off"
    !f.channelFound -> "no-channel"
    f.importance < NotificationManager.IMPORTANCE_DEFAULT -> "quiet-channel"
    f.hasSound -> "channel-rings"
    f.userSetSound -> "member-set-sound"
    f.interruptionFilter > NotificationManager.INTERRUPTION_FILTER_ALL -> "do-not-disturb"
    f.ringerMode != AudioManager.RINGER_MODE_NORMAL -> "ringer-${f.ringerMode}"
    f.sinceLastRingMs in 0 until RING_GAP_MS -> "just-rang"
    else -> "ring"
  }

  @Volatile private var lastRingAt = -1L
  /** Held so the sound is not collected while it plays. */
  @Volatile private var playing: Ringtone? = null

  /** Ring for a message just posted on [channelId] if the phone took that channel's sound. Never throws. */
  fun ringIfMuted(ctx: Context, channelId: String): String = try {
    val answer = synchronized(this) {
      val now = SystemClock.elapsedRealtime()
      val a = plan(facts(ctx, channelId, now))
      if (a == "ring") lastRingAt = now
      a
    }
    if (answer == "ring") play(ctx) else answer
  } catch (e: Exception) {
    "failed:${e.javaClass.simpleName}"
  }

  private fun facts(ctx: Context, channelId: String, now: Long): Facts {
    val sdk = Build.VERSION.SDK_INT
    val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val am = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    val ch = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) nm.getNotificationChannel(channelId) else null
    return Facts(
      sdk = sdk,
      notificationsOn = nm.areNotificationsEnabled(),
      channelFound = ch != null,
      importance = if (ch != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ch.importance else NotificationManager.IMPORTANCE_NONE,
      hasSound = ch != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && ch.sound != null,
      userSetSound = ch != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && ch.hasUserSetSound(),
      interruptionFilter = nm.currentInterruptionFilter,
      ringerMode = am.ringerMode,
      sinceLastRingMs = if (lastRingAt < 0) -1 else now - lastRingAt,
    )
  }

  private fun play(ctx: Context): String {
    val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION) ?: return "no-phone-sound"
    val r = RingtoneManager.getRingtone(ctx.applicationContext, uri) ?: return "no-phone-sound"
    r.audioAttributes = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_NOTIFICATION)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()
    Handler(Looper.getMainLooper()).post {
      try {
        playing?.stop()
        playing = r
        r.play()
      } catch (e: Exception) {
        // a sound that will not play is only a lost ring; the notification is already shown
        android.util.Log.w("ForgeErr", "gym ring did not play", e)
      }
    }
    return "rang"
  }
}
