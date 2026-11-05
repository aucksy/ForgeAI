package com.forgeai.wear

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

/**
 * Watch logging (3 Nov 2026): every screen of the owner's approved "MettleUp Watch Logging" design
 * (WatchLog.dc.html: next, warmup, adjustWeight, adjustReps, long, effort, rest, saved, restover,
 * exdone, notsaved) and its always-on twin, on the small (192 dp) and large (228 dp) round watch,
 * plus real data the design does not draw (pounds, a 5-digit weight, the largest text size).
 * PNGs go next to the older screens' ("L.." names) and get the same round-edge checks.
 */
abstract class WatchLogRenderBase(private val size: String) {
  private val out = File(System.getProperty("watchScreens.out") ?: "build/outputs/watch-screens").apply { mkdirs() }
  private val now = 1_761_650_000_000L
  private val row = "{\"exKey\":\"ex-1\",\"setKey\":\"set-2\",\"sig\":\"20|15\"}"
  private val entry = SetEntry(wOn = true, rOn = true, w = 20.0, r = 15, unit = "kg", step = 2.5, warm = false, rpe = true, rest = 120)
  private val next = NextSet("Set 2 of 4", "20 kg × 15", "20 kg × 16")

  private fun nextSet(title: String = "Bench Press", e: SetEntry = entry, n: NextSet = next) =
    WatchState.Snapshot(rest = null, workoutActive = true, title = title, next = n, logFlow = true, entry = e, row = row)

  private fun resting(title: String = "Bench Press", n: NextSet = NextSet("Set 3 of 4", "20 kg × 15", "20 kg × 16")) =
    nextSet(title, entry, n).copy(rest = WatchState.Rest(startedAt = now - 37_000L, endsAt = now + 83_000L, next = ""))

  private class Shot(
    val snap: WatchState.Snapshot,
    val ui: LogUi = LogUi(),
    val ring: Boolean = false,
    val edgeRing: Boolean = false,
    val fontScale: Float = 1f,
    val bpm: Double? = 132.0,
  )

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
          HeartRate.Status.READING,
          hrAllowed = true,
          ambient = ambient,
          now = now,
          log = s.ui,
        )
      }
    }
    checkRoundCapture(file, size, s.ring, s.edgeRing)
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

  private val editing = LogUi(rowKey = "set-2", weight = 22.5, reps = 15, edited = true, adjustAt = now - 500L)

  @Test fun nextSetScreen() = both("L01-next-set", Shot(nextSet()))

  @Test fun warmUp() = both(
    "L02-warm-up",
    Shot(nextSet(e = entry.copy(w = 10.0, r = 12, warm = true), n = NextSet("Warm-up 1 of 2", "10 kg × 12", "10 kg × 12"))),
  )

  @Test fun adjustWeight() = both("L03-adjust-weight", Shot(nextSet(), editing.copy(adjust = Adjust.WEIGHT)))

  @Test fun adjustReps() = both("L04-adjust-reps", Shot(nextSet(), editing.copy(reps = 16, adjust = Adjust.REPS)))

  @Test fun longName() = both("L05-long-name", Shot(nextSet("Single-Arm Dumbbell Bulgarian Split Squat (Rear Foot Elevated)")))

  @Test fun effort() = both(
    "L06-effort",
    Shot(nextSet(), LogUi(phase = LogPhase.EFFORT, phaseAt = now - 1_600L), edgeRing = true),
  )

  @Test fun restTimer() = both("L07-rest", Shot(resting(), ring = true))

  @Test fun saved() = both("L08-saved", Shot(resting(), LogUi(savedAt = now - 600L), ring = true))

  @Test fun restOver() = both("L09-rest-over", Shot(nextSet().copy(overAt = now - 1_500L), edgeRing = true))

  @Test fun exerciseDone() = both(
    "L10-exercise-done",
    Shot(
      nextSet("Incline Dumbbell Press", entry.copy(w = 22.5, r = 10), NextSet("Set 1 of 3", "22.5 kg × 10", "22.5 kg × 11")),
      LogUi(exDone = true, doneExercise = "Bench Press", doneSets = 4),
    ),
  )

  @Test fun notSaved() = both("L11-not-saved", Shot(resting(), LogUi(phase = LogPhase.NOT_SAVED, phaseAt = now - 300L)))

  // Real data the design does not draw: each must still fit inside the round glass.

  @Test fun pounds() = both(
    "L12-pounds",
    Shot(nextSet(e = entry.copy(w = 135.0, r = 8, unit = "lb", step = 5.0), n = NextSet("Set 2 of 4", "135 lb × 8", "140 lb × 8"))),
  )

  @Test fun bigWeight() = both(
    "L13-big-weight",
    Shot(nextSet(e = entry.copy(w = 102.5, r = 100), n = NextSet("Set 2 of 4", "102.5 kg × 100", "102.5 kg × 100"))),
  )

  @Test fun largestText() = both("L14-largest-text", Shot(nextSet("Single-Arm Dumbbell Row"), fontScale = 1.3f))

  @Test fun largestTextRest() = both("L15-largest-text-rest", Shot(resting(), LogUi(savedAt = now - 600L), ring = true, fontScale = 1.3f))

  @Test fun largestTextEffort() = both(
    "L16-largest-text-effort",
    Shot(nextSet(), LogUi(phase = LogPhase.EFFORT, phaseAt = now - 1_600L), edgeRing = true, fontScale = 1.3f),
  )

  @Test fun repsOnly() = both(
    "L17-reps-only",
    Shot(nextSet("Push-up", entry.copy(wOn = false, w = null, r = 20), NextSet("Set 2 of 3", "20", "20"))),
  )

  @Test fun noHeartRate() = both("L18-no-heart-rate", Shot(nextSet(), bpm = null))

  // R-354: the lower time row leaves less room here; the largest text must still fit above Go.
  @Test fun largestTextExerciseDone() = both(
    "L19-largest-text-exercise-done",
    Shot(
      nextSet("Incline Dumbbell Press", entry.copy(w = 22.5, r = 10), NextSet("Set 1 of 3", "22.5 kg × 10", "22.5 kg × 11")),
      LogUi(exDone = true, doneExercise = "Bench Press", doneSets = 4),
      fontScale = 1.3f,
    ),
  )
}

@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w192dp-h192dp-round-watch-xhdpi")
class WatchLogSmallRoundTest : WatchLogRenderBase("small")

@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w228dp-h228dp-round-watch-xhdpi")
class WatchLogLargeRoundTest : WatchLogRenderBase("large")
