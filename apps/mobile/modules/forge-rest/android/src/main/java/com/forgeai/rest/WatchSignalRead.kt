package com.forgeai.rest

import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.common.api.CommonStatusCodes
import com.google.android.gms.tasks.Task
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.DataItemBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.PutDataRequest
import com.google.android.gms.wearable.Wearable

/**
 * R-575 (15 Nov 2026): every signal that a watch has the MettleUp watch app, read AT ONCE (WearWire's
 * rule table): connectedNodes, the capability with FILTER_REACHABLE and with FILTER_ALL, the hosts of the
 * watch's /forge/watch-version and /forge/diag items, and this phone's own node id. Before, the steps ran
 * one after another and the first failure (or a slow Wear OS on a busy phone) ended the whole read with
 * {"ok":false}, which the log could not tell apart from "no watch".
 *
 * Each step that fails is tried again after [BACKOFF_MS] (twice at most, while [budgetMs] allows; never
 * after API_NOT_CONNECTED, which means no Wear OS on this phone). [then] gets what answered by
 * [budgetMs] (late = some step had not answered), the error of each step that failed (Wear OS's status
 * code, or the error's kind) and the version items read. Main thread only (Task listeners run there),
 * so no locking. [then] is called exactly once. Never throws.
 */
internal class WatchSignalRead(
  private val app: Context,
  private val budgetMs: Long,
  private val then: (Result) -> Unit,
) {
  class Result(
    val signals: WearWire.Signals,
    val errs: Map<String, String>,
    val versions: Map<String, WearWire.WatchVersion>,
    val late: Boolean,
  )

  private val main = Handler(Looper.getMainLooper())
  private val start = SystemClock.uptimeMillis()
  private var connected: List<Pair<String, String>>? = null
  private var capReachable: List<Pair<String, String>>? = null
  private var capAll: List<String>? = null
  private var versionHosts: Set<String>? = null
  private var versions: Map<String, WearWire.WatchVersion> = emptyMap()
  private var diagAt: Map<String, Long>? = null
  private var local: String? = null
  private val errs = HashMap<String, String>()
  private var left = STEPS
  private var delivered = false

  fun run() {
    main.postDelayed({ deliver(true) }, budgetMs)
    try {
      attempt("nodes", 0, { Wearable.getNodeClient(app).connectedNodes }) { nodes ->
        connected = nodes.map { it.id to (it.displayName ?: "") }
      }
      attempt("capR", 0, { Wearable.getCapabilityClient(app).getCapability(WearSync.CAP_WATCH_APP, CapabilityClient.FILTER_REACHABLE) }) { info ->
        capReachable = info.nodes.map { it.id to (it.displayName ?: "") }
      }
      attempt("capA", 0, { Wearable.getCapabilityClient(app).getCapability(WearSync.CAP_WATCH_APP, CapabilityClient.FILTER_ALL) }) { info ->
        capAll = info.nodes.map { it.id }
      }
      attempt("ver", 0, { Wearable.getDataClient(app).getDataItems(pathUri(WearWire.PATH_WATCH_VERSION)) }) { buf ->
        val r = readVersionItems(buf)
        versionHosts = r.first
        versions = r.second
      }
      attempt("diag", 0, { Wearable.getDataClient(app).getDataItems(pathUri(WearWire.PATH_WATCH_DIAG)) }) { buf ->
        diagAt = readDiagHosts(buf)
      }
      attempt("local", 0, { Wearable.getNodeClient(app).localNode }) { node -> local = node.id }
    } catch (e: Exception) {
      // No Play services at all lands here on some phones: what answered (nothing) goes now.
      Log.w(TAG, "watch signals not read", e)
      deliver(false)
    }
  }

  private fun <T> attempt(key: String, tries: Int, task: () -> Task<T>, ok: (T) -> Unit) {
    if (delivered) return
    try {
      task()
        .addOnSuccessListener { v ->
          try {
            ok(v)
            errs.remove(key)
          } catch (e: Exception) {
            Log.w(TAG, "watch signal $key not read", e)
            errs[key] = token(e)
          }
          stepDone()
        }
        .addOnFailureListener { e -> failedOnce(key, tries, e, task, ok) }
    } catch (e: Exception) {
      failedOnce(key, tries, e, task, ok)
    }
  }

  private fun <T> failedOnce(key: String, tries: Int, e: Exception, task: () -> Task<T>, ok: (T) -> Unit) {
    errs[key] = token(e)
    val noWear = e is ApiException && e.statusCode == CommonStatusCodes.API_NOT_CONNECTED
    val wait = BACKOFF_MS.getOrNull(tries)
    val elapsed = SystemClock.uptimeMillis() - start
    if (!delivered && !noWear && wait != null && elapsed + wait + 300L < budgetMs) {
      Log.w(TAG, "watch signal $key failed (${errs[key]}); again in $wait ms")
      main.postDelayed({ attempt(key, tries + 1, task, ok) }, wait)
      return
    }
    Log.w(TAG, "watch signal $key failed", e)
    stepDone()
  }

  private fun stepDone() {
    left -= 1
    if (left <= 0) deliver(false)
  }

  private fun deliver(late: Boolean) {
    if (delivered) return
    delivered = true
    val s = WearWire.Signals(connected, capReachable, capAll, versionHosts, diagAt, local)
    try {
      then(Result(s, HashMap(errs), versions, late && left > 0))
    } catch (e: Exception) {
      Log.w(TAG, "watch signals not passed on", e)
    }
  }

  companion object {
    private const val TAG = "ForgeWear"
    private const val STEPS = 6
    /** Waits before the 2nd and 3rd try of a failed step. */
    private val BACKOFF_MS = longArrayOf(500L, 1_500L)

    /** No host: the item at this path of every node. */
    fun pathUri(path: String): Uri = Uri.Builder().scheme(PutDataRequest.WEAR_URI_SCHEME).path(path).build()

    /** "8" (Wear OS's status code) or the error's kind ("SecurityException"). */
    fun token(e: Exception): String = if (e is ApiException) e.statusCode.toString() else e.javaClass.simpleName.ifEmpty { "error" }

    /** Every version item's host (sane or not) and the sane versions by host. Releases [buf]. */
    fun readVersionItems(buf: DataItemBuffer): Pair<Set<String>, Map<String, WearWire.WatchVersion>> {
      val hosts = HashSet<String>()
      val out = HashMap<String, WearWire.WatchVersion>()
      try {
        for (item in buf) {
          val node = item.uri.host ?: continue
          hosts.add(node)
          try {
            val m = DataMapItem.fromDataItem(item).dataMap
            WearWire.watchVersion(m.getString(WearWire.KEY_NAME), m.getLong(WearWire.KEY_CODE, 0L))?.let { out[node] = it }
          } catch (e: Exception) {
            Log.w(TAG, "a watch version item not read", e)
          }
        }
      } finally {
        buf.release()
      }
      return hosts to out
    }

    /** Every diary item's host and the diary's own time (0 when unreadable). Releases [buf]. */
    fun readDiagHosts(buf: DataItemBuffer): Map<String, Long> {
      val out = HashMap<String, Long>()
      try {
        for (item in buf) {
          val node = item.uri.host ?: continue
          val at = try {
            DataMapItem.fromDataItem(item).dataMap.getLong(WearWire.KEY_DIAG_AT, 0L)
          } catch (e: Exception) {
            Log.w(TAG, "a watch diary item not read", e)
            0L
          }
          out[node] = maxOf(out[node] ?: 0L, at)
        }
      } finally {
        buf.release()
      }
      return out
    }
  }
}
