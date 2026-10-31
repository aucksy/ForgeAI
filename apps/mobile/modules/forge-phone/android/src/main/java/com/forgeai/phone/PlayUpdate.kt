package com.forgeai.phone

import android.app.Activity
import android.content.Context
import com.google.android.play.core.appupdate.AppUpdateManager
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.InstallStateUpdatedListener
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.InstallStatus
import com.google.android.play.core.install.model.UpdateAvailability

/**
 * R-260 (31 Oct 2026): Google Play's own "update this app" flow, for a copy installed from Play.
 * The FLEXIBLE flow only: Google's box asks, the new version downloads while the member keeps
 * using the app, and the app restarts into it when JS calls finish() (a tap on "Restart"), or
 * Play installs it quietly the next time the app is in the background after finish().
 * A copy not installed from Play (GitHub APK, adb) gets an error from Play: check() then says
 * "no update" and the GitHub card handles that copy.
 */
object PlayUpdate {
  private var manager: AppUpdateManager? = null
  private var listener: InstallStateUpdatedListener? = null

  private fun of(c: Context): AppUpdateManager =
    manager ?: AppUpdateManagerFactory.create(c.applicationContext).also { manager = it }

  fun statusName(s: Int): String = when (s) {
    InstallStatus.PENDING -> "pending"
    InstallStatus.DOWNLOADING -> "downloading"
    InstallStatus.DOWNLOADED -> "downloaded"
    InstallStatus.INSTALLING -> "installing"
    InstallStatus.INSTALLED -> "installed"
    InstallStatus.FAILED -> "failed"
    InstallStatus.CANCELED -> "canceled"
    else -> "none"
  }

  /** What Play says now: { available, staleDays, status, versionCode }; null when Play cannot say. */
  fun check(c: Context, done: (Map<String, Any?>?) -> Unit) {
    try {
      of(c).appUpdateInfo
        .addOnSuccessListener { info ->
          val available = info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE &&
            info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE)
          done(
            mapOf(
              "available" to available,
              "staleDays" to info.clientVersionStalenessDays(),
              "status" to statusName(info.installStatus()),
              "versionCode" to info.availableVersionCode(),
            ),
          )
        }
        .addOnFailureListener { e ->
          // Normal on a copy not installed from Play (GitHub APK, adb install, an emulator).
          android.util.Log.i("ForgeUpdate", "Play could not say if an update exists: ${e.message}")
          done(null)
        }
    } catch (e: Throwable) {
      android.util.Log.w("ForgeErr", "Play update check failed", e)
      done(null)
    }
  }

  /**
   * Opens Google's update box. Result: "accepted" (download started), "declined", "unavailable" or
   * "failed". `onState` hears the download's progress ("downloading", "downloaded", "failed", ...).
   */
  fun start(c: Context, activity: Activity, onState: (String) -> Unit, done: (String) -> Unit) {
    try {
      val m = of(c)
      listener?.let { m.unregisterListener(it) }
      val l = InstallStateUpdatedListener { state ->
        val name = statusName(state.installStatus())
        onState(name)
        if (state.installStatus() == InstallStatus.INSTALLED || state.installStatus() == InstallStatus.FAILED ||
          state.installStatus() == InstallStatus.CANCELED
        ) {
          listener?.let { m.unregisterListener(it) }
          listener = null
        }
      }
      listener = l
      m.registerListener(l)
      // Play's info can start one flow only: ask afresh every time.
      m.appUpdateInfo
        .addOnSuccessListener { info ->
          if (info.updateAvailability() != UpdateAvailability.UPDATE_AVAILABLE ||
            !info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE)
          ) {
            done("unavailable")
            return@addOnSuccessListener
          }
          m.startUpdateFlow(info, activity, AppUpdateOptions.newBuilder(AppUpdateType.FLEXIBLE).build())
            .addOnSuccessListener { code -> done(if (code == Activity.RESULT_OK) "accepted" else "declined") }
            .addOnFailureListener { e ->
              android.util.Log.w("ForgeErr", "Play update box could not open", e)
              done("failed")
            }
        }
        .addOnFailureListener { e ->
          android.util.Log.w("ForgeErr", "Play update info could not be read", e)
          done("failed")
        }
    } catch (e: Throwable) {
      android.util.Log.w("ForgeErr", "Play update could not start", e)
      done("failed")
    }
  }

  /** Install the downloaded update: the app restarts into the new version (quietly if in the background). */
  fun finish(c: Context): Boolean = try {
    of(c).completeUpdate()
    true
  } catch (e: Throwable) {
    android.util.Log.w("ForgeErr", "Play update could not finish", e)
    false
  }
}
