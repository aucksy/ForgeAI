package com.forgeai.phone

import android.content.Context
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

  override fun definition() = ModuleDefinition {
    Name("ForgePhone")
    Events("onSharedFile")

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
      } catch (_: Throwable) {
        "unavailable"
      }
    }

    AsyncFunction("healthGranted") {
      val c = ctx ?: return@AsyncFunction false
      try {
        Health.granted(c)
      } catch (_: Throwable) {
        false
      }
    }

    Function("healthRequest") {
      val a = appContext.currentActivity ?: return@Function false
      // Started from the UI thread (review: starting an activity from the JS thread is not safe).
      a.runOnUiThread {
        try {
          Health.request(a)
        } catch (_: Throwable) {
          // nothing opens; Profile still shows "Connect"
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
      } catch (_: Throwable) {
        -1
      }
    }

    AsyncFunction("healthDelete") { id: String ->
      val c = ctx ?: return@AsyncFunction false
      try {
        Health.delete(c, id)
      } catch (_: Throwable) {
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
      } catch (_: Throwable) {
        false
      }
    }
  }
}
