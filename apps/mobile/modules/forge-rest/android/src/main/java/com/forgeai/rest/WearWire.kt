package com.forgeai.rest

import org.json.JSONObject

/**
 * Pure pieces of the watch link (no Android types; the JVM unit test WearWireTest covers them, run
 * by wear-build.yml and release-apk.yml as :forge-rest's unit tests).
 */

/** U-W3: a Done / "Complete set" tapped on the ForgeAI watch app, as read from its message. */
internal data class WatchDone(
  val workout: Long,
  val exKey: String,
  val setKey: String,
  val values: String?,
  val label: String?,
  val endsAt: Long,
)

internal object WearWire {
  /**
   * The row a /forge/act/done message carries: the JSON the phone itself sent in /forge/rest or
   * /forge/workout ({workout, exKey, setKey, open, values, label, endsAt?}), sent back unchanged.
   * Null = it cannot be logged (no data, not JSON, no workout / exercise / set, or an "open" row,
   * which has nothing to save): the phone then tells the watch (/forge/nack/done).
   */
  fun parseDone(data: ByteArray?): WatchDone? {
    if (data == null || data.isEmpty()) return null
    return try {
      val o = JSONObject(String(data, Charsets.UTF_8))
      val workout = o.optLong("workout", 0L)
      val ex = o.optString("exKey", "")
      val set = o.optString("setKey", "")
      if (workout <= 0L || ex.isEmpty() || set.isEmpty() || o.optBoolean("open", false)) return null
      val values = if (o.isNull("values")) null else o.optString("values", "").ifEmpty { null }
      val label = if (o.isNull("label")) null else o.optString("label", "").ifEmpty { null }
      WatchDone(workout, ex, set, values, label, o.optLong("endsAt", 0L))
    } catch (e: Exception) {
      // quiet: not JSON is not a row; WearSync.actionIntent logs the refusal and the watch is told.
      null
    }
  }
}

/**
 * U-W2 (UAT, 17 Oct 2026): what the watch still has to get, per Data Layer path (/forge/rest,
 * /forge/workout): only the LATEST state of each, kept until a put of it succeeds. Before, the
 * workout was recorded as sent before the put, and a put during the Data Layer's pause
 * (API_NOT_CONNECTED) or a failed one was simply dropped: a Finish, a new rest or a Skip never
 * reached the watch.
 *
 * Each [offer] replaces the path's last one. [takeDue] hands out what is not already being sent
 * (each item at most once at a time) and marks it in flight; [sent] drops it only if nothing newer
 * came meanwhile; [failed] keeps it for the next try. [encode] / [restore] keep it across a restart
 * of the app (WearSync saves it in its preferences).
 */
internal class WearOutbox {
  class Item(val path: String, val values: Map<String, Any>, val token: Long)

  private val latest = LinkedHashMap<String, Item>()
  private val inFlight = HashMap<String, Long>()
  private var counter = 0L

  @Synchronized
  fun offer(path: String, values: Map<String, Any>): Item {
    counter += 1
    val item = Item(path, LinkedHashMap(values), counter)
    latest[path] = item
    return item
  }

  @Synchronized
  fun takeDue(): List<Item> {
    val due = latest.values.filter { inFlight[it.path] != it.token }
    for (i in due) inFlight[i.path] = i.token
    return due
  }

  @Synchronized
  fun sent(item: Item) {
    if (latest[item.path]?.token == item.token) latest.remove(item.path)
    if (inFlight[item.path] == item.token) inFlight.remove(item.path)
  }

  @Synchronized
  fun failed(item: Item) {
    if (inFlight[item.path] == item.token) inFlight.remove(item.path)
  }

  @Synchronized
  fun isEmpty(): Boolean = latest.isEmpty()

  @Synchronized
  fun pending(path: String): Map<String, Any>? = latest[path]?.values

  /** {"at": savedAt, "items": {path: {key: value}}}; values are Long, String or Boolean. */
  @Synchronized
  fun encode(nowMs: Long): String {
    val items = JSONObject()
    for ((path, item) in latest) {
      val m = JSONObject()
      for ((k, v) in item.values) m.put(k, v)
      items.put(path, m)
    }
    return JSONObject().put("at", nowMs).put("items", items).toString()
  }

  /**
   * Takes back what [encode] saved, unless it is older than [maxAgeMs] or this outbox already holds
   * a newer state for the path. Bad text is ignored (nothing restored).
   */
  @Synchronized
  fun restore(json: String?, nowMs: Long, maxAgeMs: Long) {
    if (json.isNullOrEmpty()) return
    try {
      val o = JSONObject(json)
      val at = o.optLong("at", 0L)
      if (at <= 0L || nowMs - at > maxAgeMs || nowMs < at) return
      val items = o.optJSONObject("items") ?: return
      val paths = items.keys()
      while (paths.hasNext()) {
        val path = paths.next()
        if (latest.containsKey(path)) continue
        val m = items.optJSONObject(path) ?: continue
        val values = LinkedHashMap<String, Any>()
        val keys = m.keys()
        while (keys.hasNext()) {
          val k = keys.next()
          when (val v = m.get(k)) {
            is Boolean -> values[k] = v
            is Number -> values[k] = v.toLong()
            is String -> values[k] = v
          }
        }
        counter += 1
        latest[path] = Item(path, values, counter)
      }
    } catch (e: Exception) {
      // quiet: an unreadable saved outbox starts empty; the next state the phone sends replaces it.
    }
  }
}
