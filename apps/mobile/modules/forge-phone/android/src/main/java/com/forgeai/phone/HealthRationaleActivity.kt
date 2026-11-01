package com.forgeai.phone

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle

/**
 * R-267 (1 Nov 2026, Health Connect audit): the page Health Connect opens when the member taps
 * "Privacy policy" / "Read MettleUp's privacy policy" on its permission screens (Android 13 and
 * older: ACTION_SHOW_PERMISSIONS_RATIONALE; Android 14+: VIEW_PERMISSION_USAGE through the alias in
 * this module's manifest). Google requires it to SHOW the app's privacy policy, the same one given
 * in the Play Console. Before, both opened the app's home screen, which shows no policy (a Play
 * review rejection reason). Now the privacy notice opens in the browser and this screen closes.
 *
 * The address must stay equal to PRIVACY_URL in src/shop/joinTerms.ts (a vitest guard checks it).
 */
class HealthRationaleActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    try {
      startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(PRIVACY_URL)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (e: Exception) {
      // No browser on the phone: logged; the member is back on Health Connect's screen.
      android.util.Log.w("ForgeHealth", "privacy notice could not be shown (no browser)", e)
    }
    finish()
  }

  companion object {
    const val PRIVACY_URL = "https://forgeai.aakashpahuja.in/privacy.html"
  }
}
