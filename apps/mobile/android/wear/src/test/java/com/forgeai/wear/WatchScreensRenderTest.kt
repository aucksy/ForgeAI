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
 * R-166 (28 Oct 2026): every watch screen the owner asked for, rendered headlessly on a SMALL round
 * watch (192 dp: Pixel Watch 41 mm, 384 px) and a LARGE one (228 dp: Pixel Watch 45 mm, 456 px),
 * as PNGs (build/outputs/watch-screens, uploaded by wear-build.yml as "watch-screens").
 *
 * Each capture is also CHECKED, so a clipped screen fails the build:
 *  - nothing drawn outside the round screen (a square render shows what a round watch cuts off);
 *  - on the rest screen, no text (white / grey pixels) on the ember ring;
 *  - on the other screens, no text within 2 dp of the round edge.
 * The clock at the top (TimeText) is the system's own curved text and is left out of the checks.
 * Next to each raw PNG a "-round" copy greys out what the round glass hides, for a human look.
 */
abstract class WatchScreensRenderBase(private val size: String) {
  private val out = File(System.getProperty("watchScreens.out") ?: "build/outputs/watch-screens").apply { mkdirs() }
  private val now = 1_761_650_000_000L
  private val rest = WatchState.Rest(startedAt = now - 37_000L, endsAt = now + 83_000L, next = "Bench Press, set 3")

  private fun workout(title: String, next: NextSet, done: Boolean = true, text: String = "") =
    WatchState.Snapshot(rest = null, workoutActive = true, title = title, text = text, done = if (done) "{\"workout\":1}" else "", next = next)

  private val bench = NextSet("Set 3 of 5", "60 kg × 8", "62.5 kg × 8")

  private fun shot(
    name: String,
    snap: WatchState.Snapshot,
    resting: Boolean,
    ambient: Boolean = false,
    bpm: Double? = 132.0,
    notifAllowed: Boolean = true,
    exactAllowed: Boolean = true,
    fontScale: Float = 1f,
  ) {
    val file = File(out, "$size-$name.png")
    captureRoboImage(file.absolutePath) {
      Scaled(fontScale) {
        WatchScreen(
          snap,
          bpm,
          HeartRate.Status.READING,
          hrAllowed = true,
          notifAllowed = notifAllowed,
          ambient = ambient,
          now = now,
          exactAllowed = exactAllowed,
        )
      }
    }
    check(file, resting && !ambient)
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
    // The text may not come closer to the edge than this (the ring's inside edge on the rest screen).
    val limit = if (ring) r - 11f * dp else r - 2f * dp
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
        // The system clock sits along the top edge: left to Wear OS.
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

  @Test fun restingWithTimer() = shot("1-resting", workout("Bench Press", bench).copy(rest = rest), resting = true)

  @Test fun midSet() = shot("2-mid-set", workout("Bench Press", bench), resting = false)

  @Test fun lastSet() = shot("3-last-set", workout("Bench Press", NextSet("Set 5 of 5", "55 kg × 8", "57.5 kg × 8")), resting = false)

  @Test fun restingBeforeTheLastSet() =
    shot("3b-resting-last-set", workout("Bench Press", NextSet("Set 5 of 5", "55 kg × 8", "57.5 kg × 8")).copy(rest = rest), resting = true)

  @Test fun noPreviousData() = shot("4-no-previous", workout("Cable Fly", NextSet("Set 1 of 3", "", "15 kg × 12")), resting = false)

  @Test fun restingNoPreviousData() =
    shot("4b-resting-no-previous", workout("Cable Fly", NextSet("Set 1 of 3", "", "15 kg × 12")).copy(rest = rest), resting = true)

  @Test fun veryLongExerciseName() = shot(
    "5-long-name",
    workout("Single-Arm Dumbbell Bulgarian Split Squat (Rear Foot Elevated)", NextSet("Set 2 of 4", "2 × 22.5 kg each × 10", "2 × 22.5 kg each × 11")),
    resting = false,
  )

  @Test fun restingVeryLongExerciseName() = shot(
    "5b-resting-long-name",
    workout("Single-Arm Dumbbell Bulgarian Split Squat (Rear Foot Elevated)", NextSet("Set 2 of 4", "22.5 kg each × 10", "22.5 kg each × 11")).copy(rest = rest),
    resting = true,
  )

  @Test fun pounds() = shot("6-pounds", workout("Bench Press", NextSet("Set 3 of 5", "135 lb × 8", "140 lb × 8")), resting = false)

  @Test fun restingPounds() =
    shot("6b-resting-pounds", workout("Bench Press", NextSet("Set 3 of 5", "135 lb × 8", "140 lb × 8")).copy(rest = rest), resting = true)

  @Test fun sameNumbersAsLastTime() = shot("7-same-as-last", workout("Barbell Row", NextSet("Set 2 of 4", "70 kg × 8", "70 kg × 8")), resting = false)

  @Test fun ambientResting() = shot("8-ambient-resting", workout("Bench Press", bench).copy(rest = rest), resting = true, ambient = true)

  @Test fun ambientMidSet() = shot("9-ambient-mid-set", workout("Bench Press", bench), resting = false, ambient = true)

  @Test fun notificationsOff() = shot("10-notifications-off", workout("Bench Press", bench), resting = false, notifAllowed = false)

  @Test fun alarmsOff() = shot("11-alarms-off", workout("Bench Press", bench), resting = false, exactAllowed = false)

  @Test fun largerText() = shot("12-larger-text", workout("Bench Press", bench), resting = false, fontScale = 1.15f)

  @Test fun restingLargerText() = shot("12b-resting-larger-text", workout("Bench Press", bench).copy(rest = rest), resting = true, fontScale = 1.15f)

  @Test fun olderPhoneApp() = shot(
    "13-older-phone-app",
    workout("Bench Press", NextSet.NONE, text = "Set 3 of 5 · 62.5 kg × 8"),
    resting = false,
  )

  @Test fun allSetsDone() = shot(
    "14-all-sets-done",
    workout("Push 1", NextSet.NONE, done = false, text = "All sets done · Finish"),
    resting = false,
  )

  @Test fun idle() = shot("15-idle", WatchState.Snapshot(null, false, ""), resting = false, bpm = null)
}

@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w192dp-h192dp-round-watch-xhdpi")
class WatchScreensSmallRoundTest : WatchScreensRenderBase("small")

@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w228dp-h228dp-round-watch-xhdpi")
class WatchScreensLargeRoundTest : WatchScreensRenderBase("large")
