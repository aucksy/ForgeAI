package com.forgeai.rest

import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JS side of the rest card (v0.26.1). Sync functions, so calls land in the order JS makes them.
 *  - show(startedAt, endsAt, next) — a rest started or moved in the app;
 *  - clear(dismissOver)            — skipped in the app, or the workout ended;
 *  - getState()                    — the rest as the card knows it ({ endsAt: 0 } = none); first
 *                                    settles a rest that ended while the app was away;
 *  - takeOpenRequest()             — true once if the app was opened from a rest alert.
 * Phase 2, packet D (D8, RT-02, RT-05, RT-08, RT-12):
 *  - canScheduleExact() / openExactAlarmSettings()      — "Alarms & reminders";
 *  - notificationsEnabled() / openNotificationSettings() — ForgeAI's notifications;
 *  - is24Hour(), ringerMode() (0 silent, 1 vibrate, 2 normal), setRingThroughDnd(on).
 * Phase 6 ("Done" on the card and on "Rest is over"):
 *  - setDoneTarget(workout, exKey, setKey, open, values) — the row the next card's Done ticks
 *                                    (exKey null = no Done) and its grey hint; called just
 *                                    before show();
 *  - takePendingDone()             — the kept Done tap, once ({ workout, exKey, setKey, endsAt,
 *                                    at, open, label, values } or null);
 *  - postDoneNote(title, text)     — a quiet note that opens the app (a tap it could not act on);
 *  - doneSettled()                 — the app acted on the Done tap: its broadcast may end.
 * Events: onRestChange { kind: "add" | "skip" | "end" | "done", endsAt, startedAt }, onOpenWorkout.
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
      // Phase 6: an "open" Done (a row with nothing to save) brought the app up: keep it for JS.
      val c = ctx
      if (c != null && RestCard.captureDoneIntent(c, intent)) {
        try {
          sendEvent("onRestChange", mapOf("kind" to "done", "endsAt" to 0.0, "startedAt" to 0.0))
        } catch (_: Exception) {
          // JS reads it with takePendingDone when it comes back.
        }
      }
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

    Function("setQuiet") { quiet: Boolean ->
      val c = ctx ?: return@Function false
      RestCard.setQuiet(c, quiet)
      true
    }

    Function("clear") { dismissOver: Boolean ->
      val c = ctx ?: return@Function false
      RestCard.clear(c, dismissOver)
      true
    }

    Function("getState") {
      val c = ctx
      // The app is back: a rest that ended while it was away is alerted or settled now (RT-01).
      if (c != null) RestCard.settle(c)
      // ...and a running one's alarm is set again, exact if "Alarms & reminders" was just allowed.
      if (c != null) RestCard.rearm(c)
      val r = if (c != null) RestCard.load(c) else null
      mapOf(
        "endsAt" to (r?.endsAt ?: 0L).toDouble(),
        "startedAt" to (r?.startedAt ?: 0L).toDouble(),
        "next" to r?.next,
      )
    }

    Function("canScheduleExact") {
      val c = ctx ?: return@Function true
      RestCard.canScheduleExact(c)
    }

    Function("openExactAlarmSettings") {
      val c: Context = appContext.currentActivity ?: ctx ?: return@Function false
      RestCard.openExactAlarmSettings(c)
    }

    Function("notificationsEnabled") {
      val c = ctx ?: return@Function true
      RestCard.notificationsEnabled(c)
    }

    Function("openNotificationSettings") {
      val c: Context = appContext.currentActivity ?: ctx ?: return@Function false
      RestCard.openNotificationSettings(c)
    }

    Function("is24Hour") {
      val c = ctx ?: return@Function false
      RestCard.is24Hour(c)
    }

    Function("ringerMode") {
      val c = ctx ?: return@Function 2
      RestCard.ringerMode(c)
    }

    Function("setRingThroughDnd") { on: Boolean ->
      val c = ctx ?: return@Function false
      RestCard.setRingThroughDnd(c, on)
      true
    }

    Function("setDoneTarget") { workout: Double, exKey: String?, setKey: String?, open: Boolean, values: String? ->
      val c = ctx ?: return@Function false
      val t = if (exKey != null && setKey != null && workout > 0.0) {
        RestCard.DoneTarget(workout.toLong(), exKey, setKey, open, values)
      } else {
        null
      }
      RestCard.setDoneTarget(c, t)
      true
    }

    Function("takePendingDone") {
      val c = ctx ?: return@Function null
      // A cold start by an "open" Done: the tap rides on the launch intent.
      RestCard.captureDoneIntent(c, appContext.currentActivity?.intent)
      val d = RestCard.takePending(c) ?: return@Function null
      mapOf(
        "workout" to d.workout.toDouble(),
        "exKey" to d.exKey,
        "setKey" to d.setKey,
        "endsAt" to d.endsAt.toDouble(),
        "at" to d.at.toDouble(),
        "open" to d.open,
        "label" to d.label,
        "values" to d.values,
      )
    }

    Function("doneSettled") {
      RestCard.releaseDone()
      true
    }

    Function("postDoneNote") { title: String, text: String ->
      val c = ctx ?: return@Function false
      RestCard.postNote(c, title, text)
      true
    }

    Function("takeOpenRequest") {
      val intent = appContext.currentActivity?.intent ?: return@Function false
      if (!intent.getBooleanExtra(RestCard.EXTRA_OPEN, false)) return@Function false
      intent.removeExtra(RestCard.EXTRA_OPEN)
      true
    }
  }
}
