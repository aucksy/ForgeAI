package com.forgeai.phone

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sqrt

/**
 * T74 (owner report R-356, 5 Nov 2026): how the gym's logo is laid on its home-screen shortcut so
 * it looks clean under ANY launcher mask (circle, squircle, rounded square, teardrop).
 *
 * A LINE-FOR-LINE TWIN of packages/theme/src/shortcutIcon.ts (the owner panel's preview uses that
 * one); both are tested on the same cases (ShortcutArtTest here, shortcutIcon.test.ts there).
 * Change one, change the other.
 *
 * The bug: a square logo (a round black badge on a white square) was drawn at 60 % of the icon on
 * the gym's background tone, so a round mask showed the logo's white square poking out.
 *
 * Rules (dp on the 108 dp adaptive canvas; the middle 66 dp circle is never cut by any mask):
 *  1. The logo's EDGE (outer 3 %): "clear" (more than 10 % see-through), "solid" (90 % one colour)
 *     or "busy" (a photo).
 *  2. Background: the edge colour ("solid", "busy"); for "clear", the first of the gym's colours,
 *     a neutral dark, white, that most of the logo stands out on (3 : 1).
 *  3. Size: the logo's content (not background) is scaled, never stretched, so its farthest point
 *     sits 32 dp from the centre. A "busy" logo's content is the whole picture.
 *
 * PURE: pixels are ARGB ints (Bitmap.getPixels), read small first (ANALYSIS_EDGE px long side).
 */
object ShortcutArt {
  const val CANVAS = 108f
  const val CONTENT_RADIUS = 32f
  const val ANALYSIS_EDGE = 128
  const val NEUTRAL_DARK = 0xFF16181D.toInt()
  const val WHITE = 0xFFFFFFFF.toInt()

  private const val EDGE_SHARE = 0.03
  private const val CLEAR_EDGE = 0.1
  private const val SOLID_SHARE = 0.9
  private const val SAME_STEP = 32
  private const val CONTENT_STEP = 48
  private const val OPAQUE = 128
  private const val STANDS_OUT = 3.0
  private const val STANDS_OUT_SHARE = 0.6

  enum class Edge { CLEAR, SOLID, BUSY }

  /** Where the whole picture goes on the 108 dp canvas (dp), and the background (opaque ARGB). */
  data class Plan(val edge: Edge, val bg: Int, val left: Float, val top: Float, val width: Float, val height: Float)

  private fun alpha(p: Int) = (p ushr 24) and 255
  private fun r(p: Int) = (p shr 16) and 255
  private fun g(p: Int) = (p shr 8) and 255
  private fun b(p: Int) = p and 255

  private fun step(a: Int, b: Int): Int = max(abs(r(a) - r(b)), max(abs(g(a) - g(b)), abs(b(a) - b(b))))

  private fun channel(c: Int): Double {
    val s = c / 255.0
    return if (s <= 0.04045) s / 12.92 else ((s + 0.055) / 1.055).pow(2.4)
  }

  private fun luminance(p: Int) = 0.2126 * channel(r(p)) + 0.7152 * channel(g(p)) + 0.0722 * channel(b(p))

  private fun ratio(a: Int, b: Int): Double {
    val x = luminance(a)
    val y = luminance(b)
    return (max(x, y) + 0.05) / (min(x, y) + 0.05)
  }

  private fun median(v: IntArray, n: Int): Int {
    val s = v.copyOf(n)
    s.sort()
    return s[n / 2]
  }

  /** The logo's edge, and its colour (null for CLEAR). */
  fun readEdge(px: IntArray, w: Int, h: Int): Pair<Edge, Int?> {
    val band = max(1, (min(w, h) * EDGE_SHARE).roundToInt())
    var total = 0
    var clear = 0
    val cap = 2 * band * (w + h)
    val rs = IntArray(cap)
    val gs = IntArray(cap)
    val bs = IntArray(cap)
    val all = IntArray(cap)
    var n = 0
    for (y in 0 until h) {
      for (x in 0 until w) {
        if (x >= band && x < w - band && y >= band && y < h - band) continue
        val p = px[y * w + x]
        total++
        if (alpha(p) < OPAQUE) {
          clear++
          continue
        }
        rs[n] = r(p); gs[n] = g(p); bs[n] = b(p); all[n] = p
        n++
      }
    }
    if (total == 0 || n == 0 || clear > total * CLEAR_EDGE) return Edge.CLEAR to null
    val mid = (0xFF shl 24) or (median(rs, n) shl 16) or (median(gs, n) shl 8) or median(bs, n)
    var same = 0
    for (k in 0 until n) if (step(all[k], mid) <= SAME_STEP) same++
    return (if (same >= n * SOLID_SHARE) Edge.SOLID else Edge.BUSY) to mid
  }

  /** How far the content reaches from the picture's centre (px, far pixel corner); null if blank. */
  fun contentRadius(px: IntArray, w: Int, h: Int, paper: Int?): Double? {
    val cx = w / 2.0
    val cy = h / 2.0
    var far = -1.0
    for (y in 0 until h) {
      for (x in 0 until w) {
        val p = px[y * w + x]
        if (alpha(p) < OPAQUE) continue
        if (paper != null && step(p, paper) <= CONTENT_STEP) continue
        val dx = max(abs(x - cx), abs(x + 1 - cx))
        val dy = max(abs(y - cy), abs(y + 1 - cy))
        val d = dx * dx + dy * dy
        if (d > far) far = d
      }
    }
    return if (far < 0) null else sqrt(far)
  }

  /** The background a see-through logo stands out on best, the gym's colours first. */
  fun pickClearBackground(px: IntArray, w: Int, h: Int, gymColours: List<Int>): Int {
    val candidates = ArrayList<Int>()
    for (c in gymColours + listOf(NEUTRAL_DARK, WHITE)) {
      val opaque = c or (0xFF shl 24)
      if (candidates.none { step(it, opaque) == 0 }) candidates.add(opaque)
    }
    val ink = ArrayList<Int>()
    var p = 0
    while (p < w * h) {
      if (alpha(px[p]) >= OPAQUE) ink.add(px[p])
      p += 4
    }
    if (ink.isEmpty()) return candidates[0]
    var best = candidates[0]
    var bestShare = -1.0
    for (c in candidates) {
      val share = ink.count { ratio(it, c) >= STANDS_OUT }.toDouble() / ink.size
      if (share >= STANDS_OUT_SHARE) return c
      if (share > bestShare) {
        best = c
        bestShare = share
      }
    }
    return best
  }

  /** The icon for a logo read at w x h px. gymColours: brand colour, then background tone. */
  fun plan(px: IntArray, w: Int, h: Int, gymColours: List<Int> = emptyList()): Plan {
    val (edge, colour) = readEdge(px, w, h)
    val halfDiagonal = sqrt((w * w + h * h).toDouble()) / 2
    val reach: Double
    val bg: Int
    when (edge) {
      Edge.CLEAR -> {
        reach = contentRadius(px, w, h, null) ?: halfDiagonal
        bg = pickClearBackground(px, w, h, gymColours)
      }
      Edge.SOLID -> {
        reach = contentRadius(px, w, h, colour) ?: halfDiagonal
        bg = colour!!
      }
      Edge.BUSY -> {
        reach = halfDiagonal
        bg = colour!!
      }
    }
    val scale = (CONTENT_RADIUS / max(reach, 0.5)).toFloat()
    val width = w * scale
    val height = h * scale
    return Plan(edge, bg, (CANVAS - width) / 2f, (CANVAS - height) / 2f, width, height)
  }

  /** "#rrggbb,#rrggbb" (the app sends the gym's colours this way) as opaque ARGB ints; bad ones dropped. */
  fun parseColours(list: String): List<Int> =
    list.split(',').mapNotNull { raw ->
      val s = raw.trim().removePrefix("#")
      if (s.length == 6 && s.all { it.isDigit() || it.lowercaseChar() in 'a'..'f' }) (0xFF shl 24) or s.toInt(16) else null
    }
}
