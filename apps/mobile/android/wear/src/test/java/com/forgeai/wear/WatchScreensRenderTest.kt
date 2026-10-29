package com.forgeai.wear

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import kotlin.math.hypot

/**
 * R-207 (29 Oct 2026): every screen of the designer's "Ring" hand-off (screens/01..12) and its
 * ambient twin, rendered headlessly on a SMALL round watch (192 dp: Pixel Watch 41 mm, 384 px) and
 * a LARGE one (228 dp: Pixel Watch 45 mm, 456 px, the design's own size), as PNGs
 * (build/outputs/watch-screens, uploaded by wear-build.yml as "watch-screens"). File names follow
 * the hand-off's, so each PNG can be laid next to its design picture.
 *
 * Each capture is also CHECKED, so a clipped screen fails the build:
 *  - nothing drawn outside the round screen (a square render shows what a round watch cuts off);
 *  - on the ring screens (rest timer, between rests), no text (white / grey pixels) on the ring;
 *  - on the other screens, no text within 2 dp of the round edge.
 * The clock at the top is left out of the checks (the top fifth of the screen).
 * Next to each raw PNG a "-round" copy greys out what the round glass hides, for a human look.
 */
abstract class WatchScreensRenderBase(private val size: String) {
  private val out = File(System.getProperty("watchScreens.out") ?: "build/outputs/watch-screens").apply { mkdirs() }
  private val now = 1_761_650_000_000L

  /** The hand-off's rest: 2:00 in all, 1:23 left. */
  private val rest = WatchState.Rest(startedAt = now - 37_000L, endsAt = now + 83_000L, next = "Bench Press, set 3")

  private val restSet = NextSet("Set 3 of 5", "60 kg × 8", "62.5 kg × 8")
  private val betweenSet = NextSet("Set 2 of 4", "60 kg × 8", "62.5 kg × 8")
  private val LONG ="Single-Arm Dumbbell Row"

  private fun workout(title: String, next: NextSet, text: String = "") =
    WatchState.Snapshot(rest = null, workoutActive = true, title = title, text = text, next = next)

  private fun resting(title: String = "Bench Press", next: NextSet = restSet) = workout(title, next).copy(rest = rest)

  /** The rest ran out 12 s ago and the set after it is not logged yet. */
  private fun over(title: String = "Bench Press", next: NextSet = restSet) = workout(title, next).copy(overAt = now - 12_000L)

  private val idle = WatchState.Snapshot(null, false, "")

  private class Shot(
    val snap: WatchState.Snapshot,
    val ring: Boolean,
    val bpm: Double? = 132.0,
    val hrStatus: HeartRate.Status = HeartRate.Status.READING,
    val hrAllowed: Boolean = true,
    val askHeartRate: Boolean = false,
    val askAlerts: Boolean = false,
    val phoneConnected: Boolean = true,
    val fontScale: Float = 1f,
  )

  /** Each screen in its active and its ambient form. */
  private fun both(name: String, s: Shot) {
    shot(name, s, ambient = false)
    shot("$name-ambient", s, ambient = true)
  }

  private fun shot(name: String, s: Shot, ambient: Boolean) {
    val file = File(out, "$size-$name.png")
    captureRoboImage(file.absolutePath) {
      Scaled(s.fontScale) {
        WatchScreen(
          s.snap,
          s.bpm,
          s.hrStatus,
          hrAllowed = s.hrAllowed,
          ambient = ambient,
          now = now,
          askHeartRate = s.askHeartRate,
          askAlerts = s.askAlerts,
          phoneConnected = s.phoneConnected,
        )
      }
    }
    check(file, s.ring)
  }

  @Composable
  private fun Scaled(fontScale: Float, content: @Composable () -> Unit) {
    if (fontScale == 1f) {
      content()
      return
    }
    val d = LocalDensity.current
    CompositionLocalProvider(LocalDensity provides Density(d.density, fontScale)) { content() }
  }

  /** Fails on anything a round screen would clip; writes the "-round" copy. */
  private fun check(file: File, ring: Boolean) {
    assertTrue("no capture at ${file.path}", file.exists() && file.length() > 0)
    val img = BitmapFactory.decodeFile(file.absolutePath)
    assertTrue("${file.name} could not be read", img != null)
    val w = img.width
    val h = img.height
    assertTrue("$file is ${w}x$h, not square", w == h)
    val dp = w / (if (size == "small") 192f else 228f)
    val c = (w - 1) / 2f
    val r = w / 2f
    // The text may not come closer to the edge than this: the ring's inside edge (208 - 14 / 2 px
    // from the centre at 456, so 27 design px in from the edge), else 2 dp.
    val limit = if (ring) r - (RingMath.DESIGN_PX / 2f - RingMath.RADIUS + RingMath.STROKE / 2f) * RingMath.scale(w.toFloat()) else r - 2f * dp
    var outside = 0
    var onRing = 0
    val round = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    for (y in 0 until h) {
      for (x in 0 until w) {
        val p = img.getPixel(x, y)
        val red = (p shr 16) and 0xFF
        val g = (p shr 8) and 0xFF
        val b = p and 0xFF
        val d = hypot(x - c, y - c)
        val bright = maxOf(red, g, b) > 60
        val neutral = red > 110 && g > 110 && b > 110 && red - b < 45
        val clockZone = y < h * 0.2f
        if (d > r + 0.5f && bright) outside++
        if (d > limit && d <= r + 0.5f && neutral && !clockZone) onRing++
        round.setPixel(x, y, if (d > r) 0xFF303030.toInt() else (p or 0xFF000000.toInt()))
      }
    }
    File(file.parentFile, file.nameWithoutExtension + "-round.png").outputStream().use { round.compress(Bitmap.CompressFormat.PNG, 100, it) }
    assertTrue("${file.name}: $outside bright pixels outside the round screen (clipped on a watch)", outside == 0)
    assertTrue("${file.name}: $onRing text pixels too close to the edge${if (ring) " (on the ring)" else ""}", onRing <= 3)
  }

  // The hand-off's twelve screens (screens/NN-name.png and NN-name-ambient.png).

  @Test fun restTimer() = both("01-rest-timer", Shot(resting(), ring = true))

  @Test fun restIsOver() = both("02-rest-is-over", Shot(over(), ring = false))

  @Test fun betweenRests() = both("03-between-rests", Shot(workout("Bench Press", betweenSet), ring = true))

  @Test fun longNameRestTimer() = both("04-long-name-rest-timer", Shot(resting(LONG), ring = true))

  @Test fun longNameRestIsOver() = both("05-long-name-rest-is-over", Shot(over(LONG), ring = false))

  @Test fun longNameBetweenRests() = both("06-long-name-between-rests", Shot(workout(LONG, betweenSet), ring = true))

  @Test fun nothingOpen() = both("07-nothing-open", Shot(idle, ring = false, bpm = null))

  @Test fun permissionHeartRate() = both("08-permission-heart-rate", Shot(idle, ring = false, hrAllowed = false, askHeartRate = true, askAlerts = true))

  @Test fun permissionAlerts() = both("09-permission-alerts", Shot(idle, ring = false, askAlerts = true))

  @Test fun heartRateDeclined() = both("10-heart-rate-declined", Shot(resting(), ring = true, bpm = null, hrAllowed = false))

  @Test fun heartRateWaiting() =
    both("11-heart-rate-waiting", Shot(resting(), ring = true, bpm = null, hrStatus = HeartRate.Status.WAITING))

  @Test fun phoneNotConnected() = both("12-phone-not-connected", Shot(resting(), ring = false, phoneConnected = false))

  // Real data the hand-off does not draw: each must still fit inside the round glass.

  @Test fun pounds() = both("x1-pounds", Shot(resting(next = NextSet("Set 3 of 5", "135 lb × 8", "140 lb × 8")), ring = true))

  @Test fun veryLongName() = both(
    "x2-very-long-name",
    Shot(workout("Single-Arm Dumbbell Bulgarian Split Squat (Rear Foot Elevated)", NextSet("Set 2 of 4", "2 × 22.5 kg each × 10", "2 × 22.5 kg each × 11")), ring = true),
  )

  @Test fun veryLongNameResting() = both(
    "x3-very-long-name-resting",
    Shot(resting("Single-Arm Dumbbell Bulgarian Split Squat (Rear Foot Elevated)", NextSet("Set 2 of 4", "22.5 kg each × 10", "22.5 kg each × 11")), ring = true),
  )

  @Test fun noPreviousData() = both("x4-no-previous", Shot(workout("Cable Fly", NextSet("Set 1 of 3", "", "15 kg × 12")), ring = true))

  @Test fun manySets() = both("x5-many-sets", Shot(workout("Push-up", NextSet("Set 7 of 12", "20", "20")), ring = true))

  @Test fun olderPhoneApp() = both("x6-older-phone-app", Shot(workout("Bench Press", NextSet.NONE, text = "Set 3 of 5 · 62.5 kg × 8"), ring = true))

  @Test fun allSetsDone() = both("x7-all-sets-done", Shot(workout("Push 1", NextSet.NONE, text = "All sets done · Finish"), ring = true))

  @Test fun largerText() = both("x8-larger-text", Shot(resting(), ring = true, fontScale = 1.3f))

  // "Watch in the gym's colour" (29 Oct 2026): a gym green as sent, and a navy too dark for black
  // (made lighter by BrandColour.readable, as the watch does with the phone's "accent").
  private val green = BrandColour.accentFor("#16A34A")
  private val navy = BrandColour.accentFor("#1E3A8A")

  @Test fun brandGreenRestTimer() = both("b1-gym-green-rest-timer", Shot(resting().copy(accent = green), ring = true))

  @Test fun brandNavyRestTimer() = both("b2-gym-navy-rest-timer", Shot(resting().copy(accent = navy), ring = true))

  @Test fun brandNavyRestIsOver() = both("b3-gym-navy-rest-is-over", Shot(over().copy(accent = navy), ring = false))

  @Test fun brandNavyBetweenRests() = both("b4-gym-navy-between-rests", Shot(workout("Bench Press", betweenSet).copy(accent = navy), ring = true))

  @Test fun longOvertime() = both("x9-long-overtime", Shot(workout("Bench Press", restSet).copy(overAt = now - 3_725_000L), ring = false))
}

@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w192dp-h192dp-round-watch-xhdpi")
class WatchScreensSmallRoundTest : WatchScreensRenderBase("small")

@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w228dp-h228dp-round-watch-xhdpi")
class WatchScreensLargeRoundTest : WatchScreensRenderBase("large")
