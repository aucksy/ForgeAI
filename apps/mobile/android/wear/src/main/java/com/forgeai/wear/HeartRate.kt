package com.forgeai.wear

import android.content.Context
import android.util.Log
import androidx.health.services.client.HealthServices
import androidx.health.services.client.MeasureCallback
import androidx.health.services.client.data.Availability
import androidx.health.services.client.data.DataPointContainer
import androidx.health.services.client.data.DataType
import androidx.health.services.client.data.DataTypeAvailability
import androidx.health.services.client.data.DeltaDataType

/**
 * Live heart rate from the watch's own sensor (Health Services MeasureClient). Registered only
 * while the screen is visible ([start] in onStart, [stop] in onStop): a measure callback keeps the
 * sensor on at a high rate, which costs battery. Callbacks arrive on the main thread.
 */
class HeartRate(
  ctx: Context,
  private val onBpm: (Double) -> Unit,
  private val onStatus: (Status) -> Unit,
) {
  enum class Status { WAITING, READING, OFF_WRIST, UNAVAILABLE }

  private val client = HealthServices.getClient(ctx.applicationContext).measureClient
  private var on = false

  private val callback = object : MeasureCallback {
    override fun onAvailabilityChanged(dataType: DeltaDataType<*, *>, availability: Availability) {
      if (availability !is DataTypeAvailability) return
      onStatus(
        when (availability) {
          DataTypeAvailability.AVAILABLE -> Status.READING
          DataTypeAvailability.ACQUIRING -> Status.WAITING
          DataTypeAvailability.UNAVAILABLE_DEVICE_OFF_BODY -> Status.OFF_WRIST
          else -> Status.UNAVAILABLE
        },
      )
    }

    override fun onDataReceived(data: DataPointContainer) {
      val last = data.getData(DataType.HEART_RATE_BPM).lastOrNull() ?: return
      onBpm(last.value)
    }

    override fun onRegistrationFailed(throwable: Throwable) {
      Log.w(TAG, "heart rate not available", throwable)
      on = false
      onStatus(Status.UNAVAILABLE)
    }
  }

  fun start() {
    if (on) return
    try {
      client.registerMeasureCallback(DataType.HEART_RATE_BPM, callback)
      on = true
    } catch (e: Exception) {
      Log.w(TAG, "heart rate not started", e)
      onStatus(Status.UNAVAILABLE)
    }
  }

  fun stop() {
    if (!on) return
    on = false
    try {
      client.unregisterMeasureCallbackAsync(DataType.HEART_RATE_BPM, callback)
    } catch (e: Exception) {
      Log.w(TAG, "heart rate not stopped", e)
    }
  }

  private companion object {
    const val TAG = "ForgeWear"
  }
}
