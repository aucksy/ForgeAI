package com.forgeai.phone

import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JS side of "around the phone" (v0.27.0): Health Connect and the home-screen widgets.
 * Health Connect calls are async (they talk to another app); widget calls are quick.
 */
class ForgePhoneModule : Module() {
  private val ctx: Context?
    get() = appContext.reactContext?.applicationContext

  override fun definition() = ModuleDefinition {
    Name("ForgePhone")

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
