package com.forgeai.phone

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.hypot
import kotlin.math.roundToInt

/**
 * T74 (R-356): the shortcut icon's rules, pure JVM. The SAME cases and numbers are in
 * apps/dashboard/test/crm/shortcutIcon.test.ts for the TypeScript twin (the owner panel preview),
 * so the panel shows what the phone draws.
 */
class ShortcutArtTest {
  private val white = 0xFFFFFFFF.toInt()
  private val black = 0xFF000000.toInt()
  private val clear = 0x00000000

  private fun img(w: Int, h: Int, at: (x: Int, y: Int) -> Int) = IntArray(w * h) { at(it % w, it / w) }

  private fun disc(x: Int, y: Int, cx: Double, cy: Double, r: Double) = hypot(x + 0.5 - cx, y + 0.5 - cy) <= r

  /** The owner's case: a round black badge on a white square. */
  private val badge = img(128, 128) { x, y -> if (disc(x, y, 64.0, 64.0, 56.0)) black else white }

  @Test fun badge_on_a_white_square_fills_the_icon_with_white_and_fits_the_badge_in_the_safe_circle() {
    val p = ShortcutArt.plan(badge, 128, 128, listOf(0xFF101010.toInt()))
    assertEquals(ShortcutArt.Edge.SOLID, p.edge)
    assertEquals(white, p.bg)
    // The badge's reach (about 56 px of 128) lands on the 32 dp circle: the picture is about 72 dp.
    val reach = ShortcutArt.contentRadius(badge, 128, 128, white)!!
    assertEquals(32.0, reach * p.width / 128, 0.01)
    assertTrue("width ${p.width}", p.width in 70f..74f)
    assertEquals(p.width, p.height, 0.001f)
    assertEquals((108f - p.width) / 2f, p.left, 0.001f)
  }

  @Test fun a_see_through_logo_takes_the_first_gym_colour_it_stands_out_on() {
    val orange = 0xFFF07020.toInt()
    val logo = img(128, 128) { x, y -> if (disc(x, y, 64.0, 64.0, 40.0)) orange else clear }
    val p = ShortcutArt.plan(logo, 128, 128, listOf(0xFFF7D411.toInt(), 0xFF0A0A0C.toInt()))
    assertEquals(ShortcutArt.Edge.CLEAR, p.edge)
    // Orange on the yellow brand colour is about 2 : 1 (too faint); the dark tone is next.
    assertEquals(0xFF0A0A0C.toInt(), p.bg)
    assertEquals(32.0, 40.5 * p.width / 128, 0.6)
  }

  @Test fun a_black_see_through_logo_with_no_gym_colours_goes_on_white_not_the_neutral_dark() {
    val logo = img(100, 100) { x, y -> if (disc(x, y, 50.0, 50.0, 30.0)) black else clear }
    val p = ShortcutArt.plan(logo, 100, 100)
    assertEquals(ShortcutArt.Edge.CLEAR, p.edge)
    assertEquals(white, p.bg)
  }

  @Test fun a_white_see_through_logo_with_no_gym_colours_goes_on_the_neutral_dark() {
    val logo = img(100, 100) { x, y -> if (disc(x, y, 50.0, 50.0, 30.0)) white else clear }
    assertEquals(ShortcutArt.NEUTRAL_DARK, ShortcutArt.plan(logo, 100, 100).bg)
  }

  @Test fun a_photo_edge_is_busy_and_the_whole_picture_fits_inside_the_circle() {
    val photo = img(128, 128) { x, y -> (0xFF shl 24) or ((x * 2) shl 16) or ((y * 2) shl 8) or 90 }
    val p = ShortcutArt.plan(photo, 128, 128)
    assertEquals(ShortcutArt.Edge.BUSY, p.edge)
    // Half the diagonal (90.5 px) lands on the 32 dp circle: about 45.25 dp a side.
    assertEquals(45.25f, p.width, 0.05f)
  }

  @Test fun jpeg_noise_on_a_white_edge_is_still_one_colour() {
    val noisy = img(128, 128) { x, y ->
      if (disc(x, y, 64.0, 64.0, 56.0)) black else {
        val n = 255 - ((x * 7 + y * 13) % 11)
        (0xFF shl 24) or (n shl 16) or (n shl 8) or n
      }
    }
    val p = ShortcutArt.plan(noisy, 128, 128)
    assertEquals(ShortcutArt.Edge.SOLID, p.edge)
    assertTrue(p.width in 70f..74f)
  }

  @Test fun a_wide_wordmark_on_red_keeps_its_shape_and_fills_with_red() {
    val red = 0xFFD7262E.toInt()
    val logo = img(200, 80) { x, y -> if (x in 40 until 160 && y in 30 until 50) white else red }
    val p = ShortcutArt.plan(logo, 200, 80)
    assertEquals(ShortcutArt.Edge.SOLID, p.edge)
    assertEquals(red, p.bg)
    // Reach: hypot(60, 10) = 60.83 px -> 32 dp; never stretched (height / width = 80 / 200).
    assertEquals(200 * 32 / hypot(60.0, 10.0), p.width.toDouble(), 0.01)
    assertEquals(0.4f, p.height / p.width, 0.0001f)
  }

  @Test fun a_blank_picture_is_scaled_as_a_whole() {
    val blank = img(64, 64) { _, _ -> white }
    assertNull(ShortcutArt.contentRadius(blank, 64, 64, white))
    val p = ShortcutArt.plan(blank, 64, 64)
    assertEquals((64 * 32 / hypot(32.0, 32.0)).toFloat(), p.width, 0.01f)
  }

  @Test fun the_gym_colours_arrive_as_a_comma_list() {
    assertEquals(listOf(0xFFFFD400.toInt(), 0xFF101010.toInt()), ShortcutArt.parseColours("#FFD400,#101010"))
    assertEquals(emptyList<Int>(), ShortcutArt.parseColours(""))
    assertEquals(listOf(0xFFABCDEF.toInt()), ShortcutArt.parseColours("red, #abcdef ,#12"))
  }

  @Test fun a_thin_dark_frame_is_part_of_the_logo_so_the_whole_picture_fits_the_circle() {
    // The edge band is 3 % (4 px of 128); a 1 px black frame is a quarter of it: not one colour.
    assertEquals(4, (128 * 0.03).roundToInt())
    val framed = img(128, 128) { x, y -> if (x == 0 || y == 0 || x == 127 || y == 127) black else white }
    val (edge, colour) = ShortcutArt.readEdge(framed, 128, 128)
    assertEquals(ShortcutArt.Edge.BUSY, edge)
    assertEquals(white, colour)
    assertEquals(45.25f, ShortcutArt.plan(framed, 128, 128).width, 0.05f)
  }
}
