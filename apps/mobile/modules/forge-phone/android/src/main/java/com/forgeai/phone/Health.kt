package com.forgeai.phone

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.metadata.Device
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.units.Energy
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import java.time.Instant
import java.time.ZoneId

/**
 * Health Connect (v0.27.0, tracker plan Phase 5): each finished workout goes to Health Connect
 * as a strength-training session with its estimated active calories, so Google Fit and Samsung
 * Health (which read Health Connect) show it. Write only — ForgeAI reads nothing back.
 *
 * Records carry a client id ("forgeai-<session id>") and the time of sending as their version,
 * so sending an edited workout again replaces it instead of adding a second one, and a deleted
 * workout can be taken back out.
 */
object Health {
  const val REQUEST_CODE = 4711
  private const val PROVIDER = "com.google.android.apps.healthdata"

  private val EXERCISE = HealthPermission.getWritePermission(ExerciseSessionRecord::class)
  private val CALORIES = HealthPermission.getWritePermission(ActiveCaloriesBurnedRecord::class)
  val PERMISSIONS: Set<String> = setOf(EXERCISE, CALORIES)

  /** "available", "update" (Health Connect app missing or too old), or "unavailable". */
  fun status(ctx: Context): String {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return "unavailable"
    return when (HealthConnectClient.getSdkStatus(ctx, PROVIDER)) {
      HealthConnectClient.SDK_AVAILABLE -> "available"
      HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "update"
      else -> "unavailable"
    }
  }

  private fun client(ctx: Context): HealthConnectClient? =
    if (status(ctx) == "available") HealthConnectClient.getOrCreate(ctx) else null

  fun granted(ctx: Context): Boolean {
    val c = client(ctx) ?: return false
    return runBlocking { c.permissionController.getGrantedPermissions().containsAll(PERMISSIONS) }
  }

  /**
   * 24 Oct 2026 ("on and off"): each of ForgeAI's two permissions on its own. Health Connect lets
   * the member allow one and not the other (one switch each, on its permission screen and in its
   * app). `granted` read that as "nothing allowed", so the app said Off while Health Connect said
   * ForgeAI was allowed, and every send failed (one refused record type fails the whole insert).
   * Null when Health Connect is not there. THROWS when it could not be asked: the app then keeps
   * what it showed, instead of reading a hiccup as "not allowed".
   */
  fun access(ctx: Context): Map<String, Boolean>? {
    val c = client(ctx) ?: return null
    val g = runBlocking { c.permissionController.getGrantedPermissions() }
    return mapOf("exercise" to g.contains(EXERCISE), "calories" to g.contains(CALORIES))
  }

  private fun caloriesAllowed(c: HealthConnectClient): Boolean =
    runBlocking { c.permissionController.getGrantedPermissions().contains(CALORIES) }

  /**
   * Open Health Connect's own permission screen. The app checks `granted` when it is back.
   *
   * v0.39.0 fix: on Android 14+ the library's contract builds an androidx-only intent
   * (`androidx.activity.result.contract.action.REQUEST_PERMISSIONS`) that ONLY an activity-result
   * registry understands. Sent with plain startActivityForResult it threw ActivityNotFoundException,
   * the error was swallowed, and "Connect" did nothing on every Android 14-16 phone. The registry
   * turns it into the system's real permission request. Must run on the UI thread.
   */
  fun request(activity: Activity): Boolean {
    if (status(activity) != "available") return false
    val contract = PermissionController.createRequestPermissionResultContract(PROVIDER)
    val owner = activity as? ComponentActivity
    if (owner != null) {
      // One-shot: the launcher unregisters itself once Health Connect answers.
      val holder = arrayOfNulls<ActivityResultLauncher<Set<String>>>(1)
      val launcher = owner.activityResultRegistry.register("forge-health-${System.nanoTime()}", contract) { _ ->
        holder[0]?.unregister()
      }
      holder[0] = launcher
      launcher.launch(PERMISSIONS)
      return true
    }
    activity.startActivityForResult(contract.createIntent(activity, PERMISSIONS), REQUEST_CODE)
    return true
  }

  /**
   * Health Connect missing or too old (Android 9-13): its Play Store page. Otherwise its own
   * settings (to manage access). v0.27.0 review: the settings screen cannot open without the app.
   */
  fun openSettings(ctx: Context): Boolean {
    val tries = if (status(ctx) == "update") {
      listOf(
        Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$PROVIDER&url=healthconnect%3A%2F%2Fonboarding")).setPackage("com.android.vending"),
        Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$PROVIDER")),
      )
    } else if (Build.VERSION.SDK_INT >= 34) {
      // v0.39.0: Android 14+ — ForgeAI's own page in Health Connect first (where access refused
      // twice is switched back on), then Health Connect's home.
      listOf(
        Intent("android.health.connect.action.MANAGE_HEALTH_PERMISSIONS").putExtra(Intent.EXTRA_PACKAGE_NAME, ctx.packageName),
        Intent("android.health.connect.action.HEALTH_HOME_SETTINGS"),
        Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS),
      )
    } else {
      listOf(Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS))
    }
    for (i in tries) {
      try {
        ctx.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        return true
      } catch (_: Exception) {
        // quiet: this page is missing on this phone; the next one is tried, and JS says so if none opened
      }
    }
    return false
  }

  /**
   * Write workouts: a JSON array of { id, title, startMs, endMs, kcal }. Returns how many were
   * written. A workout without a positive length is skipped.
   */
  fun write(ctx: Context, json: String): Int {
    val c = client(ctx) ?: return 0
    val arr = JSONArray(json)
    val zone = ZoneId.systemDefault()
    val version = System.currentTimeMillis()
    // 24 Oct 2026: calories only when the member allowed them; the workouts go either way.
    val calories = caloriesAllowed(c)
    val records = mutableListOf<Record>()
    var sessions = 0
    for (i in 0 until arr.length()) {
      val w = arr.getJSONObject(i)
      val startMs = w.getLong("startMs")
      val endMs = w.getLong("endMs")
      if (endMs <= startMs) continue
      val id = w.getString("id")
      val start = Instant.ofEpochMilli(startMs)
      val end = Instant.ofEpochMilli(endMs)
      val so = zone.rules.getOffset(start)
      val eo = zone.rules.getOffset(end)
      records.add(
        ExerciseSessionRecord(
          startTime = start,
          startZoneOffset = so,
          endTime = end,
          endZoneOffset = eo,
          metadata = Metadata.activelyRecorded(
            clientRecordId = "forgeai-$id",
            clientRecordVersion = version,
            device = Device(type = Device.TYPE_PHONE),
          ),
          exerciseType = ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING,
          title = w.optString("title", "Workout"),
        ),
      )
      // Always sent (when allowed), also at 0: an edit that drops the calories must replace the old record.
      val kcal = maxOf(0.0, w.optDouble("kcal", 0.0))
      if (calories) {
        records.add(
          ActiveCaloriesBurnedRecord(
            startTime = start,
            startZoneOffset = so,
            endTime = end,
            endZoneOffset = eo,
            energy = Energy.kilocalories(kcal),
            metadata = Metadata.activelyRecorded(
              clientRecordId = "forgeai-$id-kcal",
              clientRecordVersion = version,
              device = Device(type = Device.TYPE_PHONE),
            ),
          ),
        )
      }
      sessions += 1
    }
    if (records.isEmpty()) return 0
    // Health Connect takes up to 1000 records a call; send in parts.
    runBlocking { for (part in records.chunked(500)) c.insertRecords(part) }
    return sessions
  }

  /** Take a deleted workout back out of Health Connect. */
  fun delete(ctx: Context, id: String): Boolean {
    val c = client(ctx) ?: return false
    val calories = caloriesAllowed(c)
    runBlocking {
      c.deleteRecords(ExerciseSessionRecord::class, emptyList(), listOf("forgeai-$id"))
      // Without the calories permission Health Connect refuses this call, which used to fail the
      // whole delete. A calories copy sent while it was allowed then stays (Health Connect's rule).
      if (calories) c.deleteRecords(ActiveCaloriesBurnedRecord::class, emptyList(), listOf("forgeai-$id-kcal"))
    }
    return true
  }
}
