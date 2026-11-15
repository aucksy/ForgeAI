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

  // ------------------------------------------------------------------ watch update ready (10 Nov 2026)
  /**
   * Watch builds from 10 Nov 2026 on keep their own versionName / versionCode in the Data Layer item
   * [PATH_WATCH_VERSION] (keys [KEY_NAME], [KEY_CODE]; android/wear WatchVersion.kt). A watch with
   * the app and no item is an older build. [PATH_WATCH_VERSION_ASK] is the phone's message asking a
   * watch to write it now (a watch app installed and never opened). Must match WatchVersion.kt.
   */
  const val PATH_WATCH_VERSION = "/forge/watch-version"
  const val PATH_WATCH_VERSION_ASK = "/forge/watch-version-ask"
  const val KEY_NAME = "versionName"
  const val KEY_CODE = "versionCode"

  /** One watch's version as its item says; [name] "" or [code] <= 0 are not sane and never stored. */
  data class WatchVersion(val name: String, val code: Long)

  /** A version item's values, or null when they are not sane (empty name, no code). */
  fun watchVersion(name: String?, code: Long): WatchVersion? {
    val n = name?.trim().orEmpty()
    if (n.isEmpty() || n.length > 40 || code <= 0L) return null
    return WatchVersion(n, code)
  }

  /** The connected watches that have the app but no version item yet (the ones to ask). */
  fun versionsToAsk(connected: Collection<String>, withApp: Collection<String>, versions: Map<String, WatchVersion>): List<String> {
    val has = withApp.toSet()
    return connected.filter { it in has && it !in versions }.distinct()
  }

  /**
   * The phone's answer to watchVersions() (watchUpdate.ts parses it): {"ok":true,"nodes":[{nodeId,
   * displayName, hasApp, versionName|null, versionCode|null}]} for every connected watch, in order.
   * [connected] pairs are (node id, display name).
   */
  fun watchVersionsJson(connected: List<Pair<String, String>>, withApp: Collection<String>, versions: Map<String, WatchVersion>): String {
    val has = withApp.toSet()
    val arr = org.json.JSONArray()
    val seen = HashSet<String>()
    for ((id, label) in connected) {
      if (!seen.add(id)) continue
      val app = id in has
      val v = if (app) versions[id] else null
      val o = JSONObject()
      o.put("nodeId", id)
      o.put("displayName", label.take(MAX_LINE))
      o.put("hasApp", app)
      o.put("connected", true)
      o.put("versionName", v?.name ?: JSONObject.NULL)
      o.put("versionCode", v?.code ?: JSONObject.NULL)
      arr.put(o)
    }
    return JSONObject().put("ok", true).put("nodes", arr).toString()
  }

  /** watchVersions() when Wear OS could not say. */
  const val WATCH_VERSIONS_UNKNOWN = """{"ok":false,"nodes":[]}"""

  // ------------------------------------------------------------------ R-575: "has the app" from the watch's own items
  /**
   * R-575 (15 Nov 2026): the owner's phone read his watch's screen diary (an item only the MettleUp watch
   * app writes) but watchVersions() reported no watch with the app, so "Your watch app has an update"
   * never showed. Which step gave the empty answer is not known (a failure, a timeout, no connected
   * watch, or an empty capability all read the same). Now no single signal decides alone: a watch has
   * the app when ANY of these says so, and "no app" needs every one that answered to say no.
   *
   *  | signal                                   | says "has the app"         | says "connected now"    |
   *  |------------------------------------------|----------------------------|-------------------------|
   *  | NodeClient.connectedNodes                 | -                          | yes                     |
   *  | capability [WearSync.CAP_WATCH_APP], REACHABLE | yes                   | yes (reachable)         |
   *  | the same capability, FILTER_ALL           | yes, for a connected watch | -                       |
   *  | its /forge/watch-version item (0.77.0 on) | yes, with the version      | -                       |
   *  | its /forge/diag item (every app since 5 Nov 2026, 0.76.0 included) | yes | -                  |
   *  | a version item written after the phone's ask (the 0.77.0+ watch's reply) | yes | yes      |
   *
   * The item's host is the node that wrote it. The phone's own node never counts (the capability never
   * returns it; items are filtered by [local]). A watch with the app that is NOT connected now (Bluetooth
   * off, out of reach, the connected-watches question failed or timed out) is still reported, with
   * connected=false, when its diary is fresher than [UNREACHED_FRESH_MS]: the pop-up can show, and
   * "Update on watch" then says "Your watch is not connected" (stepAfter('none')) or "search MettleUp on
   * your watch" (stepAfter('missing')), both a step the member can take. An older diary, or FILTER_ALL
   * alone, does not count for an unconnected watch: a watch the member no longer has would otherwise ask
   * for an update for ever.
   */
  const val UNREACHED_FRESH_MS = 7L * 24L * 60L * 60_000L

  /** One watch as watchVersions() reports it. */
  data class WatchSeen(val nodeId: String, val displayName: String, val hasApp: Boolean, val connected: Boolean)

  /** R-575: what each signal answered (null = that step failed or did not answer in time). */
  data class Signals(
    /** connectedNodes: (node id, display name). */
    val connected: List<Pair<String, String>>?,
    /** Capability, FILTER_REACHABLE: (node id, display name). */
    val capReachable: List<Pair<String, String>>?,
    /** Capability, FILTER_ALL: node ids. */
    val capAll: Collection<String>?,
    /** Hosts of the /forge/watch-version items. */
    val versionHosts: Collection<String>?,
    /** Hosts of the /forge/diag items -> the diary's own time (ms). */
    val diagAt: Map<String, Long>?,
    /** This phone's node id (null when unknown). */
    val local: String? = null,
  )

  /**
   * R-575: every watch to report (the table above): connected or reachable watches first (connectedNodes
   * order, then reachable-only ones), then unconnected watches with the app and a fresh diary (newest
   * first). PURE.
   */
  fun watchesSeen(s: Signals, nowMs: Long): List<WatchSeen> {
    val local = s.local
    val capR = s.capReachable.orEmpty()
    val app = HashSet<String>()
    capR.forEach { app.add(it.first) }
    s.capAll?.let { app.addAll(it) }
    s.versionHosts?.let { app.addAll(it) }
    s.diagAt?.let { app.addAll(it.keys) }
    val out = ArrayList<WatchSeen>()
    val seen = HashSet<String>()
    for ((id, label) in s.connected.orEmpty() + capR) {
      if (id.isBlank() || id == local || !seen.add(id)) continue
      out.add(WatchSeen(id, label.take(MAX_LINE), id in app, true))
    }
    val away = s.diagAt.orEmpty().entries
      .filter { (id, at) -> id.isNotBlank() && id != local && id !in seen && fresh(at, nowMs) }
      .sortedByDescending { it.value }
    for ((id, _) in away) if (seen.add(id)) out.add(WatchSeen(id, "", true, false))
    return out
  }

  /** A diary time within [UNREACHED_FRESH_MS] (a watch clock up to a day ahead still counts). PURE. */
  private fun fresh(at: Long, nowMs: Long): Boolean =
    at > 0L && at <= nowMs + 24L * 60L * 60_000L && nowMs - at <= UNREACHED_FRESH_MS

  /**
   * R-575: the ping. Every CONNECTED watch without a version item is asked to write it (with the app
   * signal or not: a 0.77.0+ watch app whose capability is missing replies with the item). PURE.
   */
  fun pingTargets(seen: List<WatchSeen>, versions: Map<String, WatchVersion>): List<String> =
    seen.filter { it.connected && it.nodeId !in versions }.map { it.nodeId }.distinct()

  /** R-575: the connected watches and those of them with the app, from [watchesSeen] (for the Play Store and F67). PURE. */
  fun connectedAndWithApp(seen: List<WatchSeen>): Pair<List<String>, List<String>> {
    val on = seen.filter { it.connected }
    return on.map { it.nodeId } to on.filter { it.hasApp }.map { it.nodeId }
  }

  /**
   * R-575: one step of the read for the answer's "why" (no node id, no name): "nodes=1", "cap=0",
   * "cap=fail:8" (Wear OS's status code, or the error's kind), "diag=?" (no answer in time). PURE.
   */
  fun step(name: String, count: Int?, err: String?): String = when {
    err != null -> "$name=fail:${err.filter { it.isLetterOrDigit() || it == '_' }.take(24).ifEmpty { "error" }}"
    count == null -> "$name=?"
    else -> "$name=$count"
  }

  /**
   * R-575: Wear OS could say when the connected-watches or the reachable-capability question answered,
   * or any watch was found at all (then a failed step only means less is known). PURE.
   */
  fun versionsOk(s: Signals, seen: List<WatchSeen>): Boolean = s.connected != null || s.capReachable != null || seen.isNotEmpty()

  /** R-575: the "why" of a read ("nodes=1 capR=0 capA=1 ver=0 diag=1"), each step via [step]. PURE. */
  fun signalsWhy(s: Signals, errs: Map<String, String>): String = listOf(
    step("nodes", s.connected?.size, errs["nodes"]),
    step("capR", s.capReachable?.size, errs["capR"]),
    step("capA", s.capAll?.size, errs["capA"]),
    step("ver", s.versionHosts?.size, errs["ver"]),
    step("diag", s.diagAt?.size, errs["diag"]),
  ).joinToString(" ")

  /**
   * R-575: the answer of watchVersions(): {"ok", "why", "nodes":[{nodeId, displayName, hasApp,
   * connected, versionName|null, versionCode|null}]}. [why] is the steps ("nodes=1 cap=0 ver=0 diag=1"),
   * so a member's log says why a watch was or was not found. PURE.
   */
  fun watchVersionsJson(ok: Boolean, seen: List<WatchSeen>, versions: Map<String, WatchVersion>, why: String): String {
    val arr = org.json.JSONArray()
    if (ok) {
      for (w in seen) {
        val v = if (w.hasApp) versions[w.nodeId] else null
        arr.put(
          JSONObject()
            .put("nodeId", w.nodeId)
            .put("displayName", w.displayName.take(MAX_LINE))
            .put("hasApp", w.hasApp)
            .put("connected", w.connected)
            .put("versionName", v?.name ?: JSONObject.NULL)
            .put("versionCode", v?.code ?: JSONObject.NULL),
        )
      }
    }
    return JSONObject().put("ok", ok).put("why", why.take(160)).put("nodes", arr).toString()
  }

  // ------------------------------------------------------------------ R-441: the watch's screen diary
  /**
   * R-441 (10 Nov 2026): the watch keeps a short screen diary (android/wear AmbientDiag.kt: screen
   * on / off / dim, Battery Saver, the always-on setting, times) in the Data Layer item
   * [PATH_WATCH_DIAG] (keys [KEY_DIAG_LOG], [KEY_DIAG_AT]); [PATH_WATCH_DIAG_ASK] asks a watch to write
   * it now (android/wear DiagSend.kt). Must match those files.
   */
  const val PATH_WATCH_DIAG = "/forge/diag"
  const val PATH_WATCH_DIAG_ASK = "/forge/diag-ask"
  const val KEY_DIAG_LOG = "log"
  const val KEY_DIAG_AT = "at"

  /** The most diary text passed to the app per watch (the watch keeps about 150 lines, ~14 000). */
  const val MAX_DIAG_CHARS = 20_000

  /** One watch's diary item: [at] when the watch wrote it (its clock, ms), [log] its lines. */
  data class WatchDiag(val at: Long, val log: String)

  /**
   * The phone's answer to watchDiag() (lib/watchDiag.ts parses it): {"ok":true,"watches":[{at, log}]},
   * newest first. No node id or watch name (a name can carry the member's own). PURE.
   */
  fun watchDiagJson(items: Collection<WatchDiag>): String {
    val arr = org.json.JSONArray()
    for (d in items.sortedByDescending { it.at }) {
      if (d.log.isBlank()) continue
      arr.put(JSONObject().put("at", d.at).put("log", d.log.takeLast(MAX_DIAG_CHARS)))
    }
    return JSONObject().put("ok", true).put("watches", arr).toString()
  }

  /** watchDiag() when Wear OS could not say. */
  const val WATCH_DIAG_UNKNOWN = """{"ok":false,"watches":[]}"""

  /**
   * "Update on watch": the connected watches WITH the app whose Play Store page opens; only [only]
   * when it names one of them (null or a watch not connected / without the app = all of them).
   */
  fun updateTargets(connected: Collection<String>, withApp: Collection<String>, only: String?): List<String> {
    val has = withApp.toSet()
    val all = connected.filter { it in has }.distinct()
    return if (only != null && only in all) listOf(only) else all
  }

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
