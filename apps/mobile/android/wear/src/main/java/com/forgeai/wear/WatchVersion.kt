package com.forgeai.wear

import android.content.Context
import android.util.Log
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable

/**
 * Watch update ready (10 Nov 2026): this watch app's own versionName / versionCode, kept in the
 * Data Layer item [PATH] so the phone (modules/forge-rest WearSync.watchVersions) can tell when the
 * watch is older than the phone and say "a watch update is ready".
 *
 * Why a DataItem and not only an answer to a ping: the item is stored and synced by Google Play
 * services, so the phone reads it at any time, with the watch app closed, asleep or briefly out of
 * range (the phone keeps the last copy). It is written on app start, on boot, after an update
 * (MY_PACKAGE_REPLACED, BootReceiver), the first time the phone's items wake the listener in a
 * process, and when the phone asks ([PATH_ASK], a build installed and never opened). The values carry
 * no timestamp, so writing the same version again changes nothing and syncs nothing.
 *
 * Paths and keys must match the phone's WearWire.kt (PATH_WATCH_VERSION, PATH_WATCH_VERSION_ASK,
 * KEY_NAME, KEY_CODE). An older phone app never reads the item: nothing changes for it.
 */
object WatchVersion {
  private const val TAG = "ForgeWear"
  const val PATH = "/forge/watch-version"
  /** The phone's message: write the item now. */
  const val PATH_ASK = "/forge/watch-version-ask"
  const val KEY_NAME = "versionName"
  const val KEY_CODE = "versionCode"

  /** Set once this process has written the item (the listener's own wake-ups need it only once). */
  @Volatile private var done = false

  /** The item's values (trimmed name, code), or null when the package has no sane version. PURE. */
  fun values(name: String?, code: Long): Pair<String, Long>? {
    val n = name?.trim().orEmpty()
    if (n.isEmpty() || code <= 0L) return null
    return n to code
  }

  /** Writes the item unless this process already did ([force] = write anyway). Never throws. */
  fun publish(ctx: Context, why: String, force: Boolean = false) {
    if (done && !force) return
    val app = ctx.applicationContext
    try {
      val info = app.packageManager.getPackageInfo(app.packageName, 0)
      val v = values(info.versionName, info.longVersionCode)
      if (v == null) {
        Log.w(TAG, "watch version not published ($why): no version in the package")
        return
      }
      val req = PutDataMapRequest.create(PATH)
      req.dataMap.putString(KEY_NAME, v.first)
      req.dataMap.putLong(KEY_CODE, v.second)
      Wearable.getDataClient(app).putDataItem(req.asPutDataRequest().setUrgent())
        .addOnSuccessListener { done = true }
        .addOnFailureListener { e -> Log.w(TAG, "watch version not published ($why)", e) }
    } catch (e: Exception) {
      Log.w(TAG, "watch version not published ($why)", e)
    }
  }
}
