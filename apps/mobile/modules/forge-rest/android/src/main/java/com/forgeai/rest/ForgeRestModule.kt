package com.forgeai.rest

import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JS side of the rest card (v0.26.1). Sync functions, so calls land in the order JS makes them.
 *  - show(startedAt, endsAt, next) — a rest started or moved in the app;
 *  - clear(dismissOver)            — skipped in the app, or the workout ended;
 *  - getState()                    — the rest as the card knows it ({ endsAt: 0 } = none);
 *  - takeOpenRequest()             — true once if the app was opened from a rest alert.
 * Events: onRestChange { kind: "add" | "skip" | "end", endsAt, startedAt }, onOpenWorkout.
 */
class ForgeRestModule : Module() {
  private val ctx: Context?
    get() = appContext.reactContext?.applicationContext

  override fun definition() = ModuleDefinition {
    Name("ForgeRest")
    Events("onRestChange", "onOpenWorkout")

    OnCreate {
      RestCard.listener = { kind, endsAt, startedAt ->
        try {
          sendEvent("onRestChange", mapOf("kind" to kind, "endsAt" to endsAt.toDouble(), "startedAt" to startedAt.toDouble()))
        } catch (_: Exception) {
          // JS went away meanwhile; it reads getState() when it comes back.
        }
      }
    }

    OnDestroy {
      RestCard.listener = null
    }

    OnNewIntent { intent ->
      if (intent.getBooleanExtra(RestCard.EXTRA_OPEN, false)) {
        intent.removeExtra(RestCard.EXTRA_OPEN)
        try {
          sendEvent("onOpenWorkout", mapOf<String, Any?>())
        } catch (_: Exception) {
          // ignore
        }
      }
    }

    Function("show") { startedAt: Double, endsAt: Double, next: String? ->
      val c = ctx ?: return@Function false
      RestCard.show(c, startedAt.toLong(), endsAt.toLong(), next)
      true
    }

    Function("clear") { dismissOver: Boolean ->
      val c = ctx ?: return@Function false
      RestCard.clear(c, dismissOver)
      true
    }

    Function("getState") {
      val c = ctx
      val r = if (c != null) RestCard.load(c) else null
      mapOf(
        "endsAt" to (r?.endsAt ?: 0L).toDouble(),
        "startedAt" to (r?.startedAt ?: 0L).toDouble(),
        "next" to r?.next,
      )
    }

    Function("takeOpenRequest") {
      val intent = appContext.currentActivity?.intent ?: return@Function false
      if (!intent.getBooleanExtra(RestCard.EXTRA_OPEN, false)) return@Function false
      intent.removeExtra(RestCard.EXTRA_OPEN)
      true
    }
  }
}
