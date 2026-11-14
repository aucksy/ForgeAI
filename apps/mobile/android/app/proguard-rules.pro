# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# Add any project specific keep options here:

# 0.78.0 (qa-journeys run 43630726782, J3): a gym push that reaches the phone while the app is not running
# (or is still starting) crashed the app. The notification library loads its background loader by the class
# name written in expo-modules-core's manifest (Class.forName); R8 renamed the class, so the loader was null
# and TaskService.executeTask threw a NullPointerException. Keep the loader's name and members.
-keep class expo.modules.adapters.react.apploader.** { *; }
-keepnames class * implements expo.modules.apploader.HeadlessAppLoader
