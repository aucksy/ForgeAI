package com.forgeai.phone

import android.content.Context
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JS side of "around the phone" (v0.27.0): Health Connect and the home-screen widgets; v0.28.0
 * an export shared to ForgeAI from Android's share menu.
 * Health Connect calls are async (they talk to another app); widget calls are quick.
 */
class ForgePhoneModule : Module() {
  private val ctx: Context?
    get() = appContext.reactContext?.applicationContext

  /** Android 10 and older: the only way to ask (deprecated from Android 11, where installerPackage uses getInstallSourceInfo). */
  @Suppress("DEPRECATION")
  private fun legacyInstaller(c: Context): String? = c.packageManager.getInstallerPackageName(c.packageName)

  override fun definition() = ModuleDefinition {
    Name("ForgePhone")
    Events("onSharedFile", "onPlayUpdate")

    // ---------------------------------------------------------------- Google Play's update flow (R-260)
    AsyncFunction("playUpdateCheck") { promise: Promise ->
      val c = ctx
      if (c == null) {
        promise.resolve(null)
      } else {
        PlayUpdate.check(c) { promise.resolve(it) }
      }
    }

    AsyncFunction("playUpdateStart") { promise: Promise ->
      val c = ctx
      val a = appContext.currentActivity
      if (c == null || a == null) {
        promise.resolve("failed")
      } else {
        PlayUpdate.start(
          c,
          a,
          { status ->
            try {
              sendEvent("onPlayUpdate", mapOf("status" to status))
            } catch (_: Exception) {
              // JS asks playUpdateCheck again when it comes back
            }
          },
        ) { promise.resolve(it) }
      }
    }

    Function("playUpdateFinish") {
      val c = ctx ?: return@Function false
      PlayUpdate.finish(c)
    }

    // ---------------------------------------------------------------- a shared export (v0.28.0)
    // The app already running: Android hands the share to onNewIntent; JS takes it on the event.
    OnNewIntent { intent ->
      if (Share.isShare(intent)) {
        Share.pending = intent
        try {
          sendEvent("onSharedFile", mapOf<String, Any?>())
        } catch (_: Exception) {
          // JS reads it with takeSharedFile when it comes back
        }
      }
    }

    // A cold start opened by a share keeps it on the activity's own intent.
    AsyncFunction("takeSharedFile") {
      val c = ctx ?: return@AsyncFunction null
      val first = Share.pending
      Share.pending = null
      try {
        Share.take(c, first) ?: Share.take(c, appContext.currentActivity?.intent)
      } catch (e: Throwable) {
        android.util.Log.w("ForgeShare", "could not read the shared file", e)
        // Audit IM-17: the import screen says why, instead of nothing happening.
        mapOf("error" to (if (e.message == "too big") "too_big" else "unreadable"))
      }
    }

    // ---------------------------------------------------------------- Health Connect
    Function("healthStatus") {
      val c = ctx ?: return@Function "unavailable"
      try {
        Health.status(c)
      } catch (e: Throwable) {
        android.util.Log.w("ForgeHealth", "Health Connect status could not be read", e)
        "unavailable"
      }
    }

    AsyncFunction("healthGranted") {
      val c = ctx ?: return@AsyncFunction false
      try {
        Health.granted(c)
      } catch (e: Throwable) {
        android.util.Log.w("ForgeHealth", "Health Connect access could not be read", e)
        false
      }
    }

    // 24 Oct 2026: each permission on its own; null = no Health Connect. A failure rejects the
    // promise (logged here) so the app keeps what it showed instead of flipping to Off.
    AsyncFunction("healthAccess") {
      val c = ctx ?: return@AsyncFunction null
      try {
        Health.access(c)
      } catch (e: Throwable) {
        android.util.Log.w("ForgeHealth", "Health Connect access could not be read", e)
        throw e
      }
    }

    Function("healthRequest") {
      val a = appContext.currentActivity ?: return@Function false
      // Started from the UI thread (review: starting an activity from the JS thread is not safe).
      a.runOnUiThread {
        try {
          Health.request(a)
        } catch (e: Throwable) {
          // Nothing opened. Logged (v0.39.0: the silent catch hid that Android 14+ refused it); the
          // Health Connect page then offers "Open Health Connect" as the way round.
          android.util.Log.w("ForgeHealth", "permission screen did not open", e)
        }
      }
      true
    }

    Function("healthOpenSettings") {
      val c = ctx ?: return@Function false
      Health.openSettings(c)
    }

    AsyncFunction("healthWrite") { json: String ->
      val c = ctx ?: return@AsyncFunction -1
      try {
        Health.write(c, json)
      } catch (e: Throwable) {
        // Audit M2: the reason was dropped here. Logged; the app keeps the workout for "Send again".
        android.util.Log.w("ForgeErr", "Health Connect write failed", e)
        -1
      }
    }

    AsyncFunction("healthDelete") { id: String ->
      val c = ctx ?: return@AsyncFunction false
      try {
        Health.delete(c, id)
      } catch (e: Throwable) {
        android.util.Log.w("ForgeErr", "Health Connect delete failed", e)
        false
      }
    }

    // ---------------------------------------------------------------- widgets
    Function("widgetSave") { json: String ->
      val c = ctx ?: return@Function false
      try {
        Widgets.save(c, json)
        true
      } catch (_: Throwable) {
        false
      }
    }

    Function("widgetCount") {
      val c = ctx ?: return@Function 0
      try {
        Widgets.count(c)
      } catch (_: Throwable) {
        0
      }
    }

    Function("widgetPin") { kind: String ->
      val c = ctx ?: return@Function false
      try {
        Widgets.pin(c, kind)
      } catch (e: Throwable) {
        // Audit H3: logged; Settings shows the long-press hint.
        android.util.Log.w("ForgeErr", "widget pin request failed", e)
        false
      }
    }

    // ---------------------------------------------------------------- start-up screen (15 Oct 2026)
    // A phone in a branded gym starts on a plain screen (no ForgeAI logo) so the gym's logo is the
    // first one shown; out of a gym, ForgeAI's own. Android 13+ only (setSplashScreenTheme picks the
    // NEXT launch's screen); older phones keep ForgeAI's. Returns "set", "reset" or "unsupported".
    Function("splashPlain") { plain: Boolean ->
      val a = appContext.currentActivity ?: return@Function "unsupported"
      if (android.os.Build.VERSION.SDK_INT < 33) return@Function "unsupported"
      val theme = a.resources.getIdentifier("Theme.App.SplashPlain", "style", a.packageName)
      if (plain && theme == 0) {
        android.util.Log.w("ForgeErr", "start-up screen: Theme.App.SplashPlain is missing")
        return@Function "unsupported"
      }
      // Called here, not posted to the UI thread (review): it is one call to the system, safe from
      // any thread, and the answer then says whether it really happened (JS retries otherwise).
      try {
        if (android.os.Build.VERSION.SDK_INT >= 33) a.splashScreen.setSplashScreenTheme(if (plain) theme else android.content.res.Resources.ID_NULL)
        android.util.Log.i("ForgeSplash", if (plain) "plain start-up screen set" else "ForgeAI start-up screen set")
        if (plain) "set" else "reset"
      } catch (e: Throwable) {
        android.util.Log.w("ForgeErr", "start-up screen could not be set", e)
        "unsupported"
      }
    }

    // ---------------------------------------------------------------- the gym's home-screen shortcut (OWNER-INBOX #11)
    Function("gymShortcutSupported") {
      val c = ctx ?: return@Function false
      try {
        GymShortcut.supported(c)
      } catch (e: Throwable) {
        android.util.Log.w("ForgeErr", "gym shortcut: support check failed", e)
        false
      }
    }

    // Off the UI thread (Expo runs AsyncFunction on its own queue): it downloads the logo.
    AsyncFunction("gymShortcutPin") { name: String, logoUrl: String, bg: String, ask: Boolean ->
      val c = ctx ?: return@AsyncFunction "failed"
      try {
        GymShortcut.pin(c, name, logoUrl, bg, ask)
      } catch (e: Throwable) {
        android.util.Log.w("ForgeErr", "gym shortcut: pin failed", e)
        "failed"
      }
    }

    Function("gymShortcutOff") { message: String ->
      val c = ctx ?: return@Function false
      try {
        GymShortcut.off(c, message)
      } catch (e: Throwable) {
        android.util.Log.w("ForgeErr", "gym shortcut: could not grey it out", e)
        false
      }
    }

    // ---------------------------------------------------------------- who installed the app (0.56.0)
    // "com.android.vending" = Google Play. The GitHub "new version" card hides on a Play install: a
    // GitHub APK carries another signing key, so Android refuses it over the Play one. Null when
    // Android does not say (adb, an error).
    Function("installerPackage") {
      val c = ctx ?: return@Function null
      try {
        val name: String? = if (android.os.Build.VERSION.SDK_INT >= 30) {
          c.packageManager.getInstallSourceInfo(c.packageName).installingPackageName
        } else {
          legacyInstaller(c)
        }
        name
      } catch (e: Throwable) {
        android.util.Log.w("ForgeErr", "installer could not be read", e)
        null
      }
    }

    // ---------------------------------------------------------------- app icon shortcuts (audit Phase 9)
    Function("shortcutsSave") { json: String ->
      val c = ctx ?: return@Function false
      try {
        Shortcuts.save(c, json)
      } catch (_: Throwable) {
        false
      }
    }
  }
}
