package com.forgeai.wear

/**
 * R-577 (owner, 15 Nov 2026, "Option 1"): the watch screens are rendered on the screen sizes of the
 * watches members really own, not only Google Pixel. A size is its width in dp (what the layout
 * scales by, [RingMath.scale] of screenWidthDp) and its density (what decides the PNG's pixels).
 * Every size below is one Robolectric class per render test (the qualifiers name every axis, so
 * nothing carries over between classes: see the "+qualifier" lesson).
 *
 * Sources (full table with links in docs/CLAUDE-NOTES.md, R-577):
 *  - px: the makers' spec pages; density: Google's own device list for Wear OS screenshot tests
 *    (Horologist WearDevice: Galaxy Watch 5 396 px x2.0, Galaxy Watch 6 Large 480 px x2.125 = 340 dpi,
 *    TicWatch Pro 5 466 px x2.0, Pixel Watch 384 px x2.0). Samsung sizes Google does not list use
 *    Samsung's 340 dpi, which gives the smaller (harder) dp.
 *  - No square size: no Wear OS watch on sale in India in Nov 2026 has a square screen.
 *
 * [name] is the PNG prefix: "small" and "large" keep their old names (the Pixel sizes). [px]: the real
 * watch's screen; every capture must come out this wide (+-1 px), which proves the density was used.
 */
internal data class WatchSize(val name: String, val dp: Int, val px: Int)

internal object WatchSizes {
  /** 192 dp, 384 px xhdpi: Pixel Watch 1 and 2 (41 mm); Google's smallest round. */
  val SMALL = WatchSize("small", 192, 384)

  /** 198 dp, 396 px xhdpi: Galaxy Watch4 / Watch5 / FE 40 mm, Watch4 Classic 42 mm. */
  val GALAXY_40_OLD = WatchSize("198dp", 198, 396)

  /**
   * 204 dp, 408 px xhdpi: Pixel Watch 3 and 4 (41 mm). Also stands for Galaxy Watch6 / Watch7 40 mm
   * and Watch6 Classic 43 mm (432 px at 340 dpi = 203 dp), Watch8 40 mm and Watch8 Classic (438 px = 206 dp).
   */
  val PIXEL3_41 = WatchSize("204dp", 204, 408)

  /** 212 dp, 450 px at 340 dpi: Galaxy Watch4 / Watch5 44 mm, Watch4 Classic 46 mm, Watch5 Pro 45 mm. */
  val GALAXY_44_OLD = WatchSize("212dp", 212, 450)

  /** 226 dp, 480 px at 340 dpi: Galaxy Watch6 / 7 / 8 44 mm, Watch6 Classic 47 mm, Galaxy Watch Ultra 47 mm. */
  val GALAXY_44_NEW = WatchSize("226dp", 226, 480)

  /** 228 dp, 456 px xhdpi: Pixel Watch 3 and 4 (45 mm). */
  val LARGE = WatchSize("large", 228, 456)

  /** 233 dp, 466 px xhdpi: TicWatch Pro 5 / Pro 5 Enduro, OnePlus Watch 2 / 2R / 3 (the widest). */
  val WIDE = WatchSize("233dp", 233, 466)

  /**
   * The largest text a watch offers (Settings > Accessibility > Font size, "Largest"): 1.3 on Galaxy
   * watches (One UI Watch), 1.24 on Pixel. Rendered on the smallest and the widest size.
   */
  const val LARGEST_FONT = 1.3f
  val SMALL_LARGEST_TEXT = WatchSize("small-largest-text", 192, 384)
  val WIDE_LARGEST_TEXT = WatchSize("233dp-largest-text", 233, 466)
}
