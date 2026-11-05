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
  /**
   * Watch logging (3 Nov 2026): the numbers the member logged on the watch's own Done, as JSON
   * {w, r, rpe, unit} (w in the unit the watch showed); null = a plain Done (the card's numbers).
   */
  val log: String? = null,
)

/**
 * Watch logging (3 Nov 2026): the next set's boxes for the watch's own Done and crown (liveCard.ts
 * `WatchEntry`). [w] / [step] are numbers as text in [unit] ("" = the box is empty); [r] -1 = empty.
 */
internal data class WatchEntry(
  val wOn: Boolean,
  val rOn: Boolean,
  val w: String,
  val r: Long,
  val unit: String,
  val step: String,
  val warm: Boolean,
  val rpe: Boolean,
  val rest: Long,
)

/**
 * R-166 (28 Oct 2026): the next set on the watch app, as the app's live card worked it out
 * (liveCard.ts `watch`): [set] "Set 3 of 5", [last] last time's numbers for that set ("60 kg × 8"),
 * [goal] what "Complete set" saves ("62.5 kg × 8"). Each "" when unknown.
 */
internal data class WatchLines(val set: String, val last: String, val goal: String, val entry: WatchEntry? = null) {
  companion object {
    val NONE = WatchLines("", "", "")
  }
}

internal object WearWire {
  /** Longest line passed to the watch (a hand-typed name can be any length; the watch ellipsizes). */
  private const val MAX_LINE = 80

  /**
   * R-166: the "watch" lines the app put in the live card's row JSON ({..., watch: {set, last,
   * goal}}); [WatchLines.NONE] when there are none (an older app, no set named, bad JSON).
   */
  fun watchLines(rowJson: String?): WatchLines {
    if (rowJson.isNullOrEmpty()) return WatchLines.NONE
    return try {
      val w = JSONObject(rowJson).optJSONObject("watch") ?: return WatchLines.NONE
      fun line(k: String): String = if (w.isNull(k)) "" else w.optString(k, "").trim().take(MAX_LINE)
      WatchLines(line("set"), line("last"), line("goal"), entry(w.optJSONObject("entry")))
    } catch (e: Exception) {
      // quiet: no lines is the old watch screen (title and text only), never a crash in the card.
      WatchLines.NONE
    }
  }

  /** A number as the watch reads it ("62.5", "60"); "" when not a sane number. */
  private fun numText(o: JSONObject, k: String, max: Double): String {
    if (o.isNull(k) || !o.has(k)) return ""
    val v = o.optDouble(k, Double.NaN)
    if (v.isNaN() || v < 0.0 || v > max) return ""
    return if (v == Math.floor(v)) v.toLong().toString() else (Math.round(v * 100.0) / 100.0).toString()
  }

  /** Watch logging: the row's boxes (liveCard.ts `watchEntry`); null when there are none. */
  fun entry(e: JSONObject?): WatchEntry? {
    if (e == null) return null
    return try {
      val r = if (e.isNull("r") || !e.has("r")) -1L else e.optDouble("r", -1.0).let { if (it.isNaN() || it < 0.0 || it > 1000.0) -1L else Math.round(it) }
      WatchEntry(
        wOn = e.optBoolean("wOn", false),
        rOn = e.optBoolean("rOn", false),
        w = numText(e, "w", 2000.0),
        r = r,
        unit = if (e.optString("unit", "kg") == "lb") "lb" else "kg",
        step = numText(e, "step", 100.0).ifEmpty { "2.5" },
        warm = e.optBoolean("warm", false),
        rpe = e.optBoolean("rpe", false),
        rest = e.optLong("rest", 0L).coerceIn(0L, 3600L),
      )
    } catch (e2: Exception) {
      // quiet: no entry is the watch's older screen (glance only), never a crash in the card.
      null
    }
  }

  /**
   * Watch logging: the numbers a watch Done carries ({w, r, rpe, unit}), checked and re-written;
   * null when there are none (a plain Done) or they are not sane.
   */
  fun watchLog(o: JSONObject?): String? {
    if (o == null) return null
    return try {
      val out = JSONObject()
      val w = o.optDouble("w", Double.NaN)
      val r = o.optDouble("r", Double.NaN)
      val rpe = o.optDouble("rpe", Double.NaN)
      if (!w.isNaN() && w >= 0.0 && w <= 2000.0) out.put("w", w)
      if (!r.isNaN() && r >= 0.0 && r <= 1000.0) out.put("r", Math.round(r))
      if (!rpe.isNaN() && rpe >= 1.0 && rpe <= 10.0) out.put("rpe", rpe)
      if (!out.has("w") && !out.has("r")) return null
      out.put("unit", if (o.optString("unit", "kg") == "lb") "lb" else "kg")
      out.toString()
    } catch (e: Exception) {
      // quiet: unreadable numbers make a plain Done (the card's numbers), never a lost tap.
      null
    }
  }

  // ------------------------------------------------------------------ F67: install on the watch
  /** F67: no watch connected. */
  const val WATCH_NONE = "none"
  /** F67: every connected watch has the MettleUp watch app (its capability, wear.xml). */
  const val WATCH_INSTALLED = "installed"
  /** F67: at least one connected watch lacks it. */
  const val WATCH_MISSING = "missing"

  /**
   * F67 ("Install the watch app from the phone"): what the phone tells the app, from the connected
   * watches ([connected], node ids) and those that declare the MettleUp watch app ([withApp]). A
   * node that declares it but is not connected does not count.
   */
  fun watchAppState(connected: Collection<String>, withApp: Collection<String>): String {
    if (connected.isEmpty()) return WATCH_NONE
    val has = withApp.toSet()
    return if (connected.all { it in has }) WATCH_INSTALLED else WATCH_MISSING
  }

  /** F67: the connected watches the Play Store should open on (those without the watch app). */
  fun installTargets(connected: Collection<String>, withApp: Collection<String>): List<String> {
    val has = withApp.toSet()
    return connected.filter { it !in has }.distinct()
  }

  /**
   * F67: the watch's Play Store page of the MettleUp watch app. The watch app has the phone's
   * applicationId (com.mettleup.app, android/wear/build.gradle: the Data Layer needs the same id),
   * so the phone's own package name is the right one.
   */
  fun playStoreUri(pkg: String): String = "market://details?id=$pkg"

  private val HEX6 = Regex("^#[0-9A-F]{6}$")

  /**
   * 29 Oct 2026: the gym's colour as the watch takes it: "#RRGGBB" in capitals, or "" (no gym, or
   * anything else: the watch stays MettleUp orange).
   */
  fun watchAccent(hex: String?): String {
    val s = hex?.trim()?.uppercase() ?: return ""
    return if (HEX6.matches(s)) s else ""
  }

  /**
   * R-355 (5 Nov 2026): the name the watch shows as the exercise of the next set. The live card's
   * title is the exercise only while the card names a set ([lines] set, or a row a tap ticks); with
   * no set named ("All sets done · Finish", "Add an exercise to start") it is the WORKOUT's name
   * ("Push Day", "Workout in progress"), which the watch drew above its countdown as if it were an
   * exercise. Then "" goes: the watch shows its status line ("All sets done") and no stale name.
   */
  fun watchTitle(title: String, lines: WatchLines, row: String): String =
    if (lines.set.isNotBlank() || row.isNotEmpty()) title else ""

  /** The row JSON without its "watch" lines (the watch gets them as their own fields). */
  fun withoutWatch(rowJson: String): String {
    if (rowJson.isEmpty()) return rowJson
    return try {
      val o = JSONObject(rowJson)
      if (!o.has("watch")) return rowJson
      o.remove("watch")
      o.toString()
    } catch (e: Exception) {
      // quiet: not JSON is passed on as it was (the watch never reads it, it only sends it back).
      rowJson
    }
  }

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
      WatchDone(workout, ex, set, values, label, o.optLong("endsAt", 0L), watchLog(o.optJSONObject("log")))
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
