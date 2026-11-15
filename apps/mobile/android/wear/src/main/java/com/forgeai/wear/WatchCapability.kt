package com.forgeai.wear

import android.content.Context
import android.util.Log
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableStatusCodes

/**
 * R-575 (15 Nov 2026): this watch app tells the phone it is here, by the capability [NAME] (the phone's
 * WearSync.CAP_WATCH_APP). It was declared only in res/values/wear.xml, and release builds shrank that
 * array to nothing (0.76.0 to 0.78.0 shipped it empty), so no phone ever found the watch app: "Your watch
 * app has an update" never showed and the phone treated every watch as one without the app.
 *
 * Two ways now, each enough alone:
 *  1. the array is kept (res/raw/keep.xml) and named here in code, so the shrinker sees it in use;
 *  2. the capability is also announced at run time (CapabilityClient.addLocalCapability) on app start,
 *     boot, after an update and when the phone's items wake the listener (with WatchVersion.publish).
 *     A capability already declared or announced answers DUPLICATE_CAPABILITY: that is fine.
 * Never throws.
 */
object WatchCapability {
  private const val TAG = "ForgeWear"
  const val NAME = "forgeai_watch_app"

  @Volatile private var done = false

  /** The capabilities the packaged array declares (empty when the array is missing). */
  fun declared(ctx: Context): List<String> = try {
    ctx.resources.getStringArray(R.array.android_wear_capabilities).toList()
  } catch (e: Exception) {
    Log.w(TAG, "capability array not read", e)
    emptyList()
  }

  fun announce(ctx: Context) {
    if (done) return
    val app = ctx.applicationContext
    val list = declared(app)
    if (NAME !in list) Log.w(TAG, "the packaged capability array does not hold $NAME ($list); announcing it at run time")
    try {
      Wearable.getCapabilityClient(app).addLocalCapability(NAME)
        .addOnSuccessListener {
          done = true
          Log.i(TAG, "capability $NAME announced")
        }
        .addOnFailureListener { e ->
          if (e is ApiException && e.statusCode == WearableStatusCodes.DUPLICATE_CAPABILITY) {
            done = true
          } else {
            Log.w(TAG, "capability $NAME not announced", e)
          }
        }
    } catch (e: Exception) {
      Log.w(TAG, "capability $NAME not announced", e)
    }
  }
}
