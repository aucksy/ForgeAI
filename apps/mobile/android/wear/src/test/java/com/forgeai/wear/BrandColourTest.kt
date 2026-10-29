package com.forgeai.wear

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

class BrandColourTest {
  private val orange = 0xFFF26B2A.toInt()
  private val navy = 0xFF1E3A8A.toInt()

  @Test
  fun parsesOnlySixDigitHex() {
    assertEquals(0xFF1E3A8A.toInt(), BrandColour.parse("#1E3A8A"))
    assertEquals(0xFF1E3A8A.toInt(), BrandColour.parse("1e3a8a"))
    assertNull(BrandColour.parse(""))
    assertNull(BrandColour.parse(null))
    assertNull(BrandColour.parse("#abc"))
    assertNull(BrandColour.parse("rgb(1,2,3)"))
  }

  @Test
  fun missingColourIsOrange() {
    // An older phone app sends nothing: no brand, the screens use MettleUp's own palette.
    assertNull(BrandColour.accentFor(""))
    assertEquals(ActivePalette.accent, paletteFor(false, null).accent)
    assertEquals(AmbientPalette.accent, paletteFor(true, null).accent)
  }

  @Test
  fun contrastMatchesWcag() {
    assertEquals(21.0, BrandColour.contrastOnBlack(0xFFFFFFFF.toInt()), 0.01)
    assertEquals(1.0, BrandColour.contrastOnBlack(0xFF000000.toInt()), 0.01)
    assertTrue(BrandColour.contrastOnBlack(orange) > 6.0)
  }

  @Test
  fun readableColourIsUnchanged() {
    assertEquals(orange, BrandColour.readable(orange))
    val green = 0xFF16A34A.toInt()
    assertEquals(green, BrandColour.readable(green))
  }

  @Test
  fun darkColourIsLightenedKeepingItsHue() {
    val out = BrandColour.readable(navy)
    assertTrue(BrandColour.contrastOnBlack(out) >= BrandColour.MIN_CONTRAST)
    val (h0, _, l0) = BrandColour.toHsl(navy)
    val (h1, s1, l1) = BrandColour.toHsl(out)
    assertTrue("hue kept", abs(h0 - h1) < 0.02f)
    assertTrue("still a colour, not grey", s1 > 0.3f)
    assertTrue("lighter", l1 > l0)
    // Only as light as it needs: one step darker would not reach the bar.
    val (h, s, l) = BrandColour.toHsl(out)
    assertTrue(BrandColour.contrastOnBlack(BrandColour.fromHsl(h, s, l - 0.02f)) < BrandColour.MIN_CONTRAST)
  }

  @Test
  fun blackBecomesAReadableGrey() {
    val out = BrandColour.readable(0xFF000000.toInt())
    assertTrue(BrandColour.contrastOnBlack(out) >= BrandColour.MIN_CONTRAST)
  }

  @Test
  fun alwaysOpaqueAndAmbientIsDimmer() {
    val out = BrandColour.readable(0x001E3A8A)
    assertEquals(0xFF, (out ushr 24) and 0xFF)
    val dim = BrandColour.dim(out)
    assertTrue(BrandColour.luminance(dim) < BrandColour.luminance(out))
  }

  @Test
  fun hslRoundTrips() {
    for (c in listOf(orange, navy, 0xFF16A34A.toInt(), 0xFFFFFFFF.toInt(), 0xFF808080.toInt())) {
      val (h, s, l) = BrandColour.toHsl(c)
      val back = BrandColour.fromHsl(h, s, l)
      for (shift in listOf(16, 8, 0)) {
        assertTrue(abs(((c shr shift) and 0xFF) - ((back shr shift) and 0xFF)) <= 1)
      }
    }
  }
}
