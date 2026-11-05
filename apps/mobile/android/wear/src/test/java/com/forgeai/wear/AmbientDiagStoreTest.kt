package com.forgeai.wear

import android.content.Context
import android.os.PowerManager
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Shadows.shadowOf

/** R-353: the on-watch diary really stores, caps and reads the watch's state (Robolectric). */
@RunWith(AndroidJUnit4::class)
class AmbientDiagStoreTest {
  private val ctx: Context = ApplicationProvider.getApplicationContext()

  @Test
  fun diaryKeepsLinesAcrossCallsAndCapsThem() {
    for (i in 1..(AmbientDiag.MAX_LINES + 10)) AmbientDiag.note(ctx, "e$i")
    val lines = AmbientDiag.Lines.split(AmbientDiag.text(ctx))
    assertEquals(AmbientDiag.MAX_LINES, lines.size)
    assertTrue(lines.last().endsWith(" e${AmbientDiag.MAX_LINES + 10}"))
    assertTrue(lines.first().endsWith(" e11"))
  }

  @Test
  fun stateNamesScreenAndBatterySaver() {
    val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
    shadowOf(pm).turnScreenOn(false)
    shadowOf(pm).setIsPowerSaveMode(true)
    val off = AmbientDiag.state(ctx)
    assertTrue(off, off.contains("screen=0"))
    assertTrue(off, off.contains("saver=1"))
    shadowOf(pm).turnScreenOn(true)
    shadowOf(pm).setIsPowerSaveMode(false)
    val on = AmbientDiag.state(ctx)
    assertTrue(on, on.contains("screen=1"))
    assertTrue(on, on.contains("saver=0"))
  }

  @Test
  fun pushNeverThrowsWithoutPlayServices() {
    AmbientDiag.note(ctx, "stop", "blackout=1")
    AmbientDiag.push(ctx, force = true)
  }
}
