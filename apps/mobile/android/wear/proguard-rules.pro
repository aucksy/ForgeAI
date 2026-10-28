# MettleUp for Wear OS. The libraries (Compose, Health Services, Play services wearable) ship their
# own keep rules; the listener service, receiver and activity are kept through the manifest.
# R-166: ambient mode (androidx.wear AmbientLifecycleObserver) calls the watch's shared wearable
# library (uses-library com.google.android.wearable, optional), which is not on the build classpath.
-dontwarn com.google.android.wearable.**
