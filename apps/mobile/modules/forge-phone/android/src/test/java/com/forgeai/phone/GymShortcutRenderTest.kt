package com.forgeai.phone

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.GraphicsMode
import java.io.File
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.pow

/**
 * T74 (R-356): the gym's shortcut icon DRAWN (GymShortcut.drawIcon, headless) and shown through
 * the launcher masks Android phones use: circle (Pixel), squircle, rounded square (Samsung One UI)
 * and teardrop. For each logo a sheet: top row the OLD drawing (before this fix), bottom row the
 * new one, as PNGs in build/outputs/shortcut-icons (uploaded by wear-build.yml as "shortcut-icons").
 *
 * Checked, so the bug cannot come back: on the owner's case (a round black badge on a white
 * square) the ring a circle mask shows between the safe circle (33 dp) and the mask edge (36 dp)
 * is ONE colour, and so is the square mask's outer band; the old drawing fails the same check.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class GymShortcutRenderTest {
  private val out = File(System.getProperty("shortcutIcons.out") ?: "build/outputs/shortcut-icons").apply { mkdirs() }
  private val size = GymShortcut.SIZE
  private val dp = size / 108f

  private val white = 0xFFFFFFFF.toInt()
  private val black = 0xFF000000.toInt()

  // ---------------------------------------------------------------- logos

  private fun logo(w: Int, h: Int, draw: (Canvas, Paint) -> Unit): Bitmap {
    val b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    draw(Canvas(b), Paint(Paint.ANTI_ALIAS_FLAG))
    return b
  }

  /** The owner's screenshot: a round black badge with a white ring inside, on a white square. */
  private fun badgeOnWhite() = logo(512, 512) { c, p ->
    c.drawColor(white)
    p.color = black
    c.drawCircle(256f, 256f, 230f, p)
    p.color = white
    p.style = Paint.Style.STROKE
    p.strokeWidth = 14f
    c.drawCircle(256f, 256f, 180f, p)
    p.style = Paint.Style.FILL
    c.drawRect(196f, 196f, 316f, 316f, p)
  }

  /** A logo with its background removed: an orange mark. */
  private fun clearMark() = logo(512, 512) { c, p ->
    p.color = 0xFFF07020.toInt()
    val path = Path().apply {
      moveTo(256f, 40f); lineTo(470f, 420f); lineTo(42f, 420f); close()
    }
    c.drawPath(path, p)
  }

  /** A wide wordmark on a red box. */
  private fun wideOnRed() = logo(800, 300) { c, p ->
    c.drawColor(0xFFD7262E.toInt())
    p.color = white
    for (i in 0 until 5) c.drawRect(140f + i * 110f, 110f, 220f + i * 110f, 190f, p)
  }

  /** A photo: no single edge colour. */
  private fun photo() = logo(400, 400) { c, _ ->
    val px = IntArray(400 * 400) { val x = it % 400; val y = it / 400; (0xFF shl 24) or ((x * 255 / 399) shl 16) or ((y * 255 / 399) shl 8) or 120 }
    c.drawBitmap(Bitmap.createBitmap(px, 400, 400, Bitmap.Config.ARGB_8888), 0f, 0f, null)
  }

  // ---------------------------------------------------------------- the old drawing (before T74)

  /** Exactly what v0.54.0 drew: the logo fitted into the middle 60 % on the gym's background tone. */
  private fun oldIcon(logo: Bitmap, bg: Int): Bitmap {
    val o = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val c = Canvas(o)
    c.drawColor(bg)
    val box = size * 0.60f
    val s = minOf(box / logo.width, box / logo.height)
    val w = logo.width * s
    val h = logo.height * s
    c.drawBitmap(logo, null, RectF((size - w) / 2, (size - h) / 2, (size + w) / 2, (size + h) / 2), Paint(Paint.FILTER_BITMAP_FLAG))
    return o
  }

  // ---------------------------------------------------------------- masks (dp from the centre)

  private enum class Mask { CIRCLE, SQUIRCLE, ROUNDED_SQUARE, TEARDROP }

  /** Is the point (dx, dy) dp from the centre inside the 72 dp viewport under this mask? */
  private fun inside(m: Mask, dx: Float, dy: Float): Boolean {
    val r = 36f
    return when (m) {
      Mask.CIRCLE -> hypot(dx, dy) <= r
      Mask.SQUIRCLE -> (abs(dx) / r).pow(4) + (abs(dy) / r).pow(4) <= 1f
      Mask.ROUNDED_SQUARE -> roundedBox(dx, dy, r, 0.2f * 72f)
      // Round on three corners, a small radius top-left (Pixel's teardrop).
      Mask.TEARDROP -> roundedBox(dx, dy, r, if (dx < 0 && dy < 0) 0.1f * 72f else r)
    }
  }

  private fun roundedBox(dx: Float, dy: Float, half: Float, corner: Float): Boolean {
    val ax = abs(dx)
    val ay = abs(dy)
    if (ax > half || ay > half) return false
    val ix = ax - (half - corner)
    val iy = ay - (half - corner)
    return ix <= 0 || iy <= 0 || hypot(ix, iy) <= corner
  }

  /** The 72 dp viewport through a mask, on a grey "wallpaper" so the shape's corners show. */
  private fun masked(icon: Bitmap, m: Mask): Bitmap {
    val v = (72 * dp).toInt()
    val off = (18 * dp).toInt()
    val o = Bitmap.createBitmap(v, v, Bitmap.Config.ARGB_8888)
    for (y in 0 until v) for (x in 0 until v) {
      val dx = (x + 0.5f) / dp - 36f
      val dy = (y + 0.5f) / dp - 36f
      o.setPixel(x, y, if (inside(m, dx, dy)) icon.getPixel(x + off, y + off) else 0xFF6B7280.toInt())
    }
    return o
  }

  /** One sheet: before (top) and after (bottom), each through every mask. */
  private fun sheet(name: String, before: Bitmap, after: Bitmap) {
    val v = (72 * dp).toInt()
    val gap = 24
    val masks = Mask.values()
    val w = masks.size * (v + gap) + gap
    val h = 2 * (v + gap) + gap
    val s = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    val c = Canvas(s)
    c.drawColor(0xFF6B7280.toInt())
    for ((row, icon) in listOf(before, after).withIndex()) {
      for ((i, m) in masks.withIndex()) c.drawBitmap(masked(icon, m), (gap + i * (v + gap)).toFloat(), (gap + row * (v + gap)).toFloat(), null)
    }
    File(out, "$name.png").outputStream().use { s.compress(Bitmap.CompressFormat.PNG, 100, it) }
    File(out, "$name-after-raw.png").outputStream().use { after.compress(Bitmap.CompressFormat.PNG, 100, it) }
  }

  /** The colours a circle mask shows between the safe circle and its edge, and the square band. */
  private fun ringColours(icon: Bitmap): Set<Int> {
    val found = HashSet<Int>()
    for (y in 0 until size) for (x in 0 until size) {
      val dx = (x + 0.5f) / dp - 54f
      val dy = (y + 0.5f) / dp - 54f
      val d = hypot(dx, dy)
      val inRing = d in 33.5f..36f
      val inSquareBand = max(abs(dx), abs(dy)) <= 36f && d > 33.5f
      if (inRing || inSquareBand) found.add(icon.getPixel(x, y) or (0xFF shl 24))
    }
    return found
  }

  private fun near(a: Int, b: Int) =
    abs(((a shr 16) and 255) - ((b shr 16) and 255)) <= 6 &&
      abs(((a shr 8) and 255) - ((b shr 8) and 255)) <= 6 &&
      abs((a and 255) - (b and 255)) <= 6

  // ---------------------------------------------------------------- the checks

  @Test fun owners_case_badge_on_a_white_square_shows_a_clean_shape_on_every_mask() {
    val logo = badgeOnWhite()
    // The gym's dark background tone was behind it before; the brand colour is yellow.
    val before = oldIcon(logo, 0xFF101010.toInt())
    val after = GymShortcut.drawIcon(logo, listOf(0xFFFFD400.toInt(), 0xFF101010.toInt()))
    sheet("01-badge-on-white-square", before, after)

    val afterRing = ringColours(after)
    assertTrue("after: the ring is all white, found ${afterRing.size} colours", afterRing.all { near(it, white) })
    val beforeRing = ringColours(before)
    assertTrue("before: the old drawing showed the white square's corners on the dark tone", beforeRing.any { near(it, white) } && beforeRing.any { near(it, 0xFF101010.toInt()) })
    // The badge's black fills the middle: it was not shrunk to a dot.
    assertEquals(black, after.getPixel(size / 2 - (28 * dp).toInt(), size / 2) or (0xFF shl 24))
  }

  @Test fun see_through_logo_sits_on_the_gym_colour_it_stands_out_on() {
    val logo = clearMark()
    val before = oldIcon(logo, 0xFF0A0A0C.toInt())
    val after = GymShortcut.drawIcon(logo, listOf(0xFFF7D411.toInt(), 0xFF0A0A0C.toInt()))
    sheet("02-see-through-logo", before, after)
    // Orange is faint on the yellow brand colour: the dark tone is taken.
    assertEquals(0xFF0A0A0C.toInt(), after.getPixel(4, 4))
    assertTrue(ringColours(after).all { near(it, 0xFF0A0A0C.toInt()) })
  }

  @Test fun wide_wordmark_on_red_fills_with_red_and_keeps_its_shape() {
    val logo = wideOnRed()
    val before = oldIcon(logo, 0xFF101010.toInt())
    val after = GymShortcut.drawIcon(logo, emptyList())
    sheet("03-wide-wordmark-on-red", before, after)
    assertTrue(ringColours(after).all { near(it, 0xFFD7262E.toInt()) })
  }

  @Test fun photo_logo_fits_whole_inside_the_safe_circle() {
    val logo = photo()
    val before = oldIcon(logo, white)
    val after = GymShortcut.drawIcon(logo, emptyList())
    sheet("04-photo", before, after)
    // Nothing of the photo outside the 33 dp safe circle: the ring is the one background colour.
    assertEquals(1, ringColours(after).size)
  }

  // ---------------------------------------------------------------- R-364: negative, edge, regression

  private fun png(b: Bitmap): ByteArray = java.io.ByteArrayOutputStream().also { b.compress(Bitmap.CompressFormat.PNG, 100, it) }.toByteArray()

  @Test fun regression_round_see_through_badge_still_looks_right() {
    val logo = logo(512, 512) { c, p ->
      p.color = 0xFF1E3A8A.toInt()
      c.drawCircle(256f, 256f, 250f, p)
      p.color = white
      c.drawRect(200f, 200f, 312f, 312f, p)
    }
    val before = oldIcon(logo, 0xFF0A0A0C.toInt())
    val after = GymShortcut.drawIcon(logo, listOf(0xFFF7D411.toInt(), 0xFF0A0A0C.toInt()))
    sheet("05-round-see-through-badge", before, after)
    // Navy on yellow stands out: the brand colour is behind it, and the ring is that one colour.
    assertTrue(ringColours(after).all { near(it, 0xFFF7D411.toInt()) })
    // The badge fills the middle (its navy at 25 dp from the centre).
    assertTrue(near(after.getPixel(size / 2 - (25 * dp).toInt(), size / 2), 0xFF1E3A8A.toInt()))
  }

  @Test fun negative_a_broken_file_is_not_a_logo() {
    assertEquals(null, GymShortcut.decodeLogo("<html>not a picture</html>".toByteArray()))
    assertEquals(null, GymShortcut.decodeLogo(ByteArray(0)))
  }

  @Test fun negative_a_huge_logo_is_decoded_small_and_drawn_without_stretching() {
    val big = logo(3000, 1500) { c, p ->
      c.drawColor(white)
      p.color = black
      c.drawCircle(1500f, 750f, 600f, p)
    }
    val back = GymShortcut.decodeLogo(png(big))!!
    assertTrue("decoded ${back.width}", back.width < 2048)
    assertEquals(2.0f, back.width.toFloat() / back.height, 0.01f)
    val icon = GymShortcut.drawIcon(back, emptyList())
    sheet("06-huge-wide-logo", oldIcon(back, 0xFF101010.toInt()), icon)
    assertEquals(size, icon.width)
    assertTrue(ringColours(icon).all { near(it, white) })
    // Never stretched: the black disc is as wide as it is tall.
    val row = (0 until size).filter { near(icon.getPixel(it, size / 2), black) }
    val col = (0 until size).filter { near(icon.getPixel(size / 2, it), black) }
    assertEquals(row.size.toFloat(), col.size.toFloat(), 3f)
  }

  @Test fun negative_empty_tiny_and_thin_logos_draw_without_a_crash() {
    val cases = mapOf(
      "see-through-only" to logo(200, 200) { _, _ -> },
      "one-pixel" to logo(1, 1) { c, _ -> c.drawColor(0xFFD7262E.toInt()) },
      "thin-strip" to logo(2400, 40) { c, p -> c.drawColor(white); p.color = black; c.drawRect(100f, 10f, 2300f, 30f, p) },
    )
    for ((name, l) in cases) {
      val icon = GymShortcut.drawIcon(l, emptyList())
      assertEquals(name, size, icon.width)
      assertEquals(name, size, icon.height)
      // Nothing outside the safe circle but the one background colour.
      assertEquals(name, 1, ringColours(icon).size)
      sheet("07-$name", oldIcon(l, white), icon)
    }
  }
}

