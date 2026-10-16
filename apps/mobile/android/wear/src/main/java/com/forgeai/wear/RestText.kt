package com.forgeai.wear

/**
 * Pure helpers for the watch's rest screen (no Android types, so the JVM unit test covers them).
 */
object RestText {
  /** Whole seconds left, rounded UP: 0.2 s left still reads "0:01", never a premature "0:00". */
  fun secondsLeft(nowMs: Long, endsAtMs: Long): Long {
    val ms = endsAtMs - nowMs
    if (ms <= 0L) return 0L
    return (ms + 999L) / 1000L
  }

  /** "1:30", "0:05", "12:00"; an hour or more reads "1:02:03". */
  fun remaining(nowMs: Long, endsAtMs: Long): String = clock(secondsLeft(nowMs, endsAtMs))

  fun clock(totalSec: Long): String {
    val s = if (totalSec < 0L) 0L else totalSec
    val h = s / 3600L
    val m = (s % 3600L) / 60L
    val sec = s % 60L
    val ss = sec.toString().padStart(2, '0')
    return if (h > 0L) "$h:${m.toString().padStart(2, '0')}:$ss" else "$m:$ss"
  }

  /** Share of the rest still LEFT, 1.0 at the start down to 0.0 at the end (the ring's sweep). */
  fun fractionLeft(nowMs: Long, startedAtMs: Long, endsAtMs: Long): Float {
    val total = endsAtMs - startedAtMs
    if (total <= 0L) return 0f
    val left = (endsAtMs - nowMs).toFloat() / total.toFloat()
    return left.coerceIn(0f, 1f)
  }

  /** The line under the countdown: "Next: Bench Press, set 3", or nothing. */
  fun nextLine(next: String?): String? {
    val n = next?.trim().orEmpty()
    if (n.isEmpty()) return null
    return if (n.startsWith("All sets done")) n else "Next: $n"
  }

  /** The heart-rate number: "—" until a reading arrives (or it is not a real one). */
  fun bpm(value: Double?): String {
    if (value == null || value.isNaN() || value <= 0.0) return "—"
    return Math.round(value).toString()
  }

  /**
   * The phone says the rest ENDED while the watch still holds it (its own alarm has not gone
   * off yet, e.g. the watch clock is a little behind). Buzz now only when that end is recent: a
   * phone message that comes long after the end (the app settling an old rest on screen, or a
   * watch that was out of range) must never buzz mid-set.
   */
  fun buzzOnPhoneEnd(nowMs: Long, endsAtMs: Long): Boolean {
    if (endsAtMs <= 0L) return false
    return nowMs - endsAtMs in -RECENT_MS..RECENT_MS
  }

  /**
   * A rest that reaches the watch already over (the watch was away from the phone): buzz only
   * if it ended moments ago; older than that it is simply dropped.
   */
  fun buzzOnLateArrival(nowMs: Long, endsAtMs: Long): Boolean =
    endsAtMs > 0L && nowMs >= endsAtMs && nowMs - endsAtMs <= LATE_MS

  /**
   * C5-2: was "Complete set" just sent for this very row? Then its button stays hidden (no double
   * tap) until the phone names the next row, or for [SENT_MS] when no answer comes.
   */
  fun sentRecently(done: String, sentDone: String?, sentAtMs: Long, nowMs: Long): Boolean =
    done.isNotEmpty() && done == sentDone && nowMs - sentAtMs in 0L until SENT_MS

  /** How long a sent "Complete set" keeps its button hidden without the phone's answer. */
  const val SENT_MS = 20_000L

  /** How near the watch's own clock the phone's end must be for [buzzOnPhoneEnd]. */
  const val RECENT_MS = 60_000L

  /** How late a rest may arrive and still buzz ([buzzOnLateArrival]). */
  const val LATE_MS = 5_000L
}
