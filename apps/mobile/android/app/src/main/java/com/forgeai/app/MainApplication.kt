package com.forgeai.app

import android.app.Application
import android.content.res.Configuration

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint
import com.facebook.react.internal.featureflags.ReactNativeFeatureFlags
import com.facebook.react.internal.featureflags.ReactNativeNewArchitectureFeatureFlagsDefaults
import android.util.Log

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ExpoReactHostFactory

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    ExpoReactHostFactory.getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        }
    )
  }

  override fun onCreate() {
    super.onCreate()
    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }
    loadReactNative(this)
    if (DefaultNewArchitectureEntryPoint.releaseLevel == ReleaseLevel.STABLE) {
      // React Native 0.85's focus search for clipped list items crashed the app natively (SIGSEGV in
      // FabricUIManagerBinding::findNextFocusableElement, Device QA run 41025681054, W4: the
      // "Rename workout" box opening over a scroll view). It only helps keyboard / TV-remote users
      // reach off-screen rows, so it is off. Same flags as the stable set, plus this one: on every
      // React Native upgrade, re-copy ReactNativeFeatureFlagsOverrides_RNOSS_Stable_Android here.
      val earlyFlags = ReactNativeFeatureFlags.dangerouslyForceOverride(
        object : ReactNativeNewArchitectureFeatureFlagsDefaults() {
          override fun useFabricInterop(): Boolean = true
          override fun enableCustomFocusSearchOnClippedElementsAndroid(): Boolean = false
        }
      )
      if (!earlyFlags.isNullOrEmpty()) Log.w("MettleUp", "feature flags read before the override: $earlyFlags")
    }
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
