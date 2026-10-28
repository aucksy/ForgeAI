package com.forgeai.wear

/**
 * R-166 (28 Oct 2026): the next set as the phone's live card works it out (liveCard.ts `watch`,
 * sent in /forge/workout): [set] "Set 3 of 5", [last] last time's numbers for that very set
 * ("60 kg × 8", the phone's PREVIOUS column), [goal] what "Complete set" saves ("62.5 kg × 8": the
 * Target, else last time's, or what was typed). Each "" when unknown. A phone app older than R-166
 * sends none: the screen then shows the live card's text line, as before.
 */
data class NextSet(val set: String, val last: String, val goal: String) {
  companion object {
    val NONE = NextSet("", "", "")
  }
}

/** What the watch screen says about the next set. Pure (no Android types): RestTextTest covers it. */
object NextSetText {
  /** The phone sent the lines (R-166 or later). */
  fun has(n: NextSet): Boolean = n.set.isNotBlank()

  /** Last time's numbers, or null the first time this set is done. */
  fun last(n: NextSet): String? = n.last.trim().ifEmpty { null }

  /**
   * Today's numbers (what "Complete set" saves) when they differ from last time's; null when they
   * are the same (one line says it) or unknown.
   */
  fun today(n: NextSet): String? {
    val g = n.goal.trim()
    if (g.isEmpty() || g == n.last.trim()) return null
    return g
  }

  /**
   * The line under the countdown that names the set: "Set 3 of 5 · Bench Press" (the set first,
   * so a long name loses its end, never the set number).
   */
  fun restHeader(n: NextSet, exercise: String): String {
    val set = n.set.trim()
    val name = exercise.trim()
    return when {
      set.isEmpty() -> name
      name.isEmpty() -> set
      else -> "$set · $name"
    }
  }
}
