package com.forgeai.wear

import kotlin.math.pow

/**
 * The gym's colour on the watch (29 Oct 2026, "Watch in the gym's colour"). The phone sends the
 * accent its app is painted in after the member joined a gym (/forge/workout "accent", "#RRGGBB");
 * no gym, or an older phone app that sends nothing, is "" and the watch stays MettleUp orange.
 *
 * Pure (no Android types): JVM-tested in BrandColourTest. Colours are ARGB Ints.
 */
object BrandColour {
  /**
   * The least contrast the accent needs against black: the ring and the words drawn in it sit on
   * the black screen, and "Rest is over" writes black words ON the accent. 4.5 is the plain-text
   * bar (WCAG AA); MettleUp's own orange is about 6.9.
   */
  const val MIN_CONTRAST = 4.5

  /** The ambient (always-on) accent is the active one dimmed this much, as MettleUp's own pair. */
  const val AMBIENT_DIM = 0.77f

  private val HEX = Regex("^#?([0-9a-fA-F]{6})$")

  /** "#RRGGBB" (or "RRGGBB") to an opaque colour; null for "" or anything else (the watch keeps orange). */
  fun parse(hex: String?): Int? {
    val m = HEX.find(hex?.trim() ?: return null) ?: return null
    return (0xFF000000.toInt()) or m.groupValues[1].toInt(16)
  }

  /** WCAG relative luminance, 0 (black) to 1 (white). */
  fun luminance(argb: Int): Double {
    fun ch(v: Int): Double {
      val c = v / 255.0
      return if (c <= 0.03928) c / 12.92 else ((c + 0.055) / 1.055).pow(2.4)
    }
    return 0.2126 * ch((argb shr 16) and 0xFF) + 0.7152 * ch((argb shr 8) and 0xFF) + 0.0722 * ch(argb and 0xFF)
  }

  /** Contrast of the colour against pure black (1 to 21). */
  fun contrastOnBlack(argb: Int): Double = (luminance(argb) + 0.05) / 0.05

  /**
   * The colour made light enough to read on black: unchanged when it already reaches
   * [MIN_CONTRAST]; otherwise its HSL lightness is raised (hue and saturation kept, so a navy gym
   * stays blue rather than turning grey) in small steps until it does. Always opaque.
   */
  fun readable(argb: Int): Int {
    val opaque = argb or 0xFF000000.toInt()
    if (contrastOnBlack(opaque) >= MIN_CONTRAST) return opaque
    val (h, s, l) = toHsl(opaque)
    var light = l
    while (light < 1f) {
      light = minOf(1f, light + 0.01f)
      val c = fromHsl(h, s, light)
      if (contrastOnBlack(c) >= MIN_CONTRAST) return c
    }
    return 0xFFFFFFFF.toInt()
  }

  /** The always-on screen's accent: each channel dimmed ([AMBIENT_DIM]), as MettleUp's own pair. */
  fun dim(argb: Int, by: Float = AMBIENT_DIM): Int {
    fun d(v: Int): Int = (v * by).toInt().coerceIn(0, 255)
    return (0xFF shl 24) or (d((argb shr 16) and 0xFF) shl 16) or (d((argb shr 8) and 0xFF) shl 8) or d(argb and 0xFF)
  }

  /** The accent the watch draws for the phone's [hex]: null = MettleUp's own (orange). */
  fun accentFor(hex: String?): Int? = parse(hex)?.let { readable(it) }

  // ------------------------------------------------------------------ HSL
  internal fun toHsl(argb: Int): Triple<Float, Float, Float> {
    val r = ((argb shr 16) and 0xFF) / 255f
    val g = ((argb shr 8) and 0xFF) / 255f
    val b = (argb and 0xFF) / 255f
    val max = maxOf(r, g, b)
    val min = minOf(r, g, b)
    val l = (max + min) / 2f
    if (max == min) return Triple(0f, 0f, l)
    val d = max - min
    val s = if (l > 0.5f) d / (2f - max - min) else d / (max + min)
    val h = when (max) {
      r -> ((g - b) / d + (if (g < b) 6f else 0f))
      g -> ((b - r) / d + 2f)
      else -> ((r - g) / d + 4f)
    } / 6f
    return Triple(h, s, l)
  }

  internal fun fromHsl(h: Float, s: Float, l: Float): Int {
    fun hue(p: Float, q: Float, tIn: Float): Float {
      var t = tIn
      if (t < 0f) t += 1f
      if (t > 1f) t -= 1f
      return when {
        t < 1f / 6f -> p + (q - p) * 6f * t
        t < 1f / 2f -> q
        t < 2f / 3f -> p + (q - p) * (2f / 3f - t) * 6f
        else -> p
      }
    }
    val r: Float
    val g: Float
    val b: Float
    if (s == 0f) {
      r = l; g = l; b = l
    } else {
      val q = if (l < 0.5f) l * (1f + s) else l + s - l * s
      val p = 2f * l - q
      r = hue(p, q, h + 1f / 3f)
      g = hue(p, q, h)
      b = hue(p, q, h - 1f / 3f)
    }
    fun ch(v: Float): Int = Math.round(v * 255f).coerceIn(0, 255)
    return (0xFF shl 24) or (ch(r) shl 16) or (ch(g) shl 8) or ch(b)
  }
}
