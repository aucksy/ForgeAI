package com.forgeai.wear

import android.content.Context
import android.util.Log
import androidx.core.content.ContextCompat
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
  enum class Status { WAITING, READING, OFF_WRIST, UNAVAILABLE, NO_SENSOR }

  private val client = HealthServices.getClient(ctx.applicationContext).measureClient
  private val main = ContextCompat.getMainExecutor(ctx.applicationContext)

  /** The screen wants a reading (between [start] and [stop]). */
  private var wanted = false
  private var registered = false

  /** Does this watch measure heart rate? null = not asked yet (asked once per screen object). */
  private var supported: Boolean? = null

  private val callback = object : MeasureCallback {
    override fun onAvailabilityChanged(dataType: DeltaDataType<*, *>, availability: Availability) {
      if (!wanted || availability !is DataTypeAvailability) return
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
      if (!wanted) return
      val last = data.getData(DataType.HEART_RATE_BPM).lastOrNull() ?: return
      onBpm(last.value)
    }

    override fun onRegistrationFailed(throwable: Throwable) {
      Log.w(TAG, "heart rate not available", throwable)
      registered = false
      if (wanted) onStatus(Status.UNAVAILABLE)
    }
  }

  /** Start measuring: an old message ("not on the wrist", ...) is cleared first. */
  fun start() {
    if (wanted) return
    wanted = true
    onStatus(Status.WAITING)
    when (supported) {
      true -> register()
      false -> onStatus(Status.NO_SENSOR)
      null -> checkThenRegister()
    }
  }

  /** Ask Health Services once whether this watch measures heart rate at all. */
  private fun checkThenRegister() {
    val future = try {
      client.getCapabilitiesAsync()
    } catch (e: Exception) {
      Log.w(TAG, "heart-rate capability not asked; trying anyway", e)
      register()
      return
    }
    future.addListener({
      val ok: Boolean? = try {
        DataType.HEART_RATE_BPM in future.get().supportedDataTypesMeasure
      } catch (e: Exception) {
        Log.w(TAG, "heart-rate capability unknown; trying anyway", e)
        null
      }
      if (ok != null) supported = ok
      if (!wanted) return@addListener
      if (ok == false) onStatus(Status.NO_SENSOR) else register()
    }, main)
  }

  private fun register() {
    if (registered || !wanted) return
    try {
      client.registerMeasureCallback(DataType.HEART_RATE_BPM, callback)
      registered = true
    } catch (e: Exception) {
      Log.w(TAG, "heart rate not started", e)
      onStatus(Status.UNAVAILABLE)
    }
  }

  fun stop() {
    wanted = false
    if (!registered) return
    registered = false
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
