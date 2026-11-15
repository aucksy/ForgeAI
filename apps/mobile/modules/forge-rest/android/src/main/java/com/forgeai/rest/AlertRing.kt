package com.forgeai.rest

import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.Ringtone
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock

/**
 * R-590 (15 Nov 2026): the app rings an alert itself when the PHONE took the channel's sound away.
 *
 * WHY. OPPO / OnePlus phones (ColorOS 16-17, his OPPO CPH2873 on Android 17) run a system app,
 * NotificationCenter (com.oplus.notificationmanager), with a default rule for every app that is not on
 * OPPO's own package list: banner off, sound off, vibration off. About 60 ms after an app creates a
 * channel it is rewritten: importance HIGH -> DEFAULT, sound -> none, banner -> off (dumpsys:
 * mOriginalImp=4, mImportance=3, mSound=null, mShowBanner=false). WhatsApp, Truecaller, Facebook and the
 * like are on that list; nearly every other app on his phone (Swiggy, Zomato, LinkedIn, Play Console,
 * Spends) is rewritten exactly like ours, and a channel we made three weeks after install
 * (gym-messages-quiet, 0.78.0) was rewritten too, so a new channel id does not help.
 * No app can raise its own channel back or turn the banner on. The sound it CAN give: it plays the
 * sound once itself, right after the alert is posted:
 *  - a gym message: the phone's own notification sound (ForgeRest.ringIfMuted, gymAlertRing.ts);
 *  - "Rest is over" (screen off / app not on screen): the member's own rest sound, the same file the
 *    channel and the open app play (lesson an-alert-has-two-sound-paths), from RestCard.postOver.
 *
 * WHEN (plan, pure): only when the channel is still an alerting one (importance DEFAULT or more), has no
 * sound, the member did not set its sound themselves (hasUserSetSound, Android 11+), the app's
 * notifications are on, Do Not Disturb is off (unless the member chose "Ring through Do Not Disturb"
 * for this alert: throughDnd) and the phone is on ring (not vibrate, not silent).
 * A phone that kept the sound (Pixel, Samsung, an emulator) rings through the channel and never here.
 * Never twice within RING_GAP_MS on one channel (the push task and the in-app post can both report one message).
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
    /** The member chose to ring this alert through Do Not Disturb (the rest's alarm channel). */
    val throughDnd: Boolean = false,
    /** The importance the app made the channel with (unknown: DEFAULT). */
    val askedImportance: Int = NotificationManager.IMPORTANCE_DEFAULT,
  )

  /** "ring", or why not (logged by the app). PURE. */
  fun plan(f: Facts): String = when {
    f.sdk < 26 -> "no-channels" // before Android 8 the notification carries its own sound
    !f.notificationsOn -> "notifications-off"
    !f.channelFound -> "no-channel"
    f.importance < NotificationManager.IMPORTANCE_DEFAULT -> "quiet-channel"
    f.hasSound -> "channel-rings"
    // A sound the member set is theirs, unless the channel also sits below the importance the app made it
    // with: that is the phone's rewrite (ColorOS marks the sound as set when it strips "Rest is over":
    // importance 4 -> 3, sound none, sound lock on). A member who picks "None" keeps the importance.
    f.userSetSound && f.importance >= f.askedImportance -> "member-set-sound"
    !f.throughDnd && f.interruptionFilter > NotificationManager.INTERRUPTION_FILTER_ALL -> "do-not-disturb"
    f.ringerMode != AudioManager.RINGER_MODE_NORMAL -> "ringer-${f.ringerMode}"
    f.sinceLastRingMs in 0 until RING_GAP_MS -> "just-rang"
    else -> "ring"
  }

  /** How "Rest is over" posted on [channel] may be rung by the app. */
  enum class RestRing { NONE, NOTIFICATION, ALARM }

  /**
   * "Rest is over" just went out on [channel]: may the app ring it when the phone took that channel's
   * sound? PURE (RestCard passes its channel ids and whether ForgeAI is on screen).
   *  - The app on screen ([onScreen], any channel): never here; the open app already rings its own bell
   *    when the channel cannot (RestCard.restBell answers "app"), so this would be a second sound.
   *  - "Workout sounds" off ([quietChannel], vibrate only): never, that is the member's choice.
   *  - The app on screen ([openSoundChannel]): never here; the open app already rings its own bell when
   *    the channel cannot (RestCard.restBell answers "app"), so this would be a second sound.
   *  - Do Not Disturb with "Ring through Do Not Disturb" ([alarmChannel]): as an alarm, through DND.
   *  - Otherwise (screen off, locked, app in the background or closed): as a notification.
   */
  fun restRing(
    channel: String,
    onScreen: Boolean,
    quietChannel: String,
    openSoundChannel: String,
    alarmChannel: String,
  ): RestRing = when {
    onScreen -> RestRing.NONE
    channel == quietChannel || channel == openSoundChannel -> RestRing.NONE
    channel == alarmChannel -> RestRing.ALARM
    else -> RestRing.NOTIFICATION
  }

  /**
   * The raw file of the member's rest sound [s] ("forge" = the ForgeAI chime; anything unknown too).
   * PURE. RestCard's channels and its app ring both use it, so both paths play one file.
   */
  fun restSoundFile(s: String): String = if (s in listOf("bell", "beep", "whistle")) "forge_rest_$s" else "forge_rest_done"

  /** The by-name address of that file in [pkg] (a channel keeps its sound address for ever). PURE. */
  fun restSoundAddress(pkg: String, s: String): String = "android.resource://$pkg/raw/${restSoundFile(s)}"

  private val lastRingAt = HashMap<String, Long>()
  /** Held so the sound is not collected while it plays. */
  @Volatile private var playing: Ringtone? = null

  /**
   * Ring for an alert just posted on [channelId] if the phone took that channel's sound. [sound] null =
   * the phone's own notification sound; [usage] the audio usage (USAGE_ALARM for the rest's DND channel);
   * [throughDnd] = the member chose to ring this one through Do Not Disturb; [askedImportance] = the
   * importance the app made the channel with. "rang" or why not. Never throws.
   */
  fun ringIfMuted(
    ctx: Context,
    channelId: String,
    sound: Uri? = null,
    usage: Int = AudioAttributes.USAGE_NOTIFICATION,
    throughDnd: Boolean = false,
    askedImportance: Int = NotificationManager.IMPORTANCE_DEFAULT,
  ): String = try {
    val answer = synchronized(this) {
      val now = SystemClock.elapsedRealtime()
      val last = lastRingAt[channelId]
      val a = plan(facts(ctx, channelId, if (last == null) -1 else now - last, throughDnd, askedImportance))
      if (a == "ring") lastRingAt[channelId] = now
      a
    }
    if (answer == "ring") play(ctx, sound, usage) else answer
  } catch (e: Exception) {
    "failed:${e.javaClass.simpleName}"
  }

  private fun facts(ctx: Context, channelId: String, sinceLastRingMs: Long, throughDnd: Boolean, askedImportance: Int): Facts {
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
      sinceLastRingMs = sinceLastRingMs,
      throughDnd = throughDnd,
      askedImportance = askedImportance,
    )
  }

  private fun play(ctx: Context, sound: Uri?, usage: Int): String {
    val uri = sound ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION) ?: return "no-phone-sound"
    val r = RingtoneManager.getRingtone(ctx.applicationContext, uri) ?: return "no-phone-sound"
    r.audioAttributes = AudioAttributes.Builder()
      .setUsage(usage)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()
    Handler(Looper.getMainLooper()).post {
      try {
        playing?.stop()
        playing = r
        r.play()
      } catch (e: Exception) {
        // a sound that will not play is only a lost ring; the notification is already shown
        android.util.Log.w("ForgeErr", "app ring did not play", e)
      }
    }
    return "rang"
  }
}
