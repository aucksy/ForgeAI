package com.forgeai.phone

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.widget.RemoteViews
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Home-screen widgets (v0.27.0, tracker plan Phase 5): "Today" (today's workout from the plan)
 * and "This week" (workouts done, day by day). The app writes what they show (`save`) whenever
 * it changes — on launch, after a workout, after a plan change. A widget whose data is from
 * another day (or week) says "Open ForgeAI…" instead of showing a stale workout.
 */
object Widgets {
  private const val PREFS = "forgeai_widgets"
  private const val KEY = "data"
  private const val ACCENT = 0xFFFF7A3B.toInt()
  private const val MUTED = 0xFFA0A4AE.toInt()
  private const val INK = 0xFF07080C.toInt()

  fun save(ctx: Context, json: String) {
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, json).apply()
    refreshAll(ctx)
  }

  private fun data(ctx: Context): JSONObject? = try {
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null)?.let { JSONObject(it) }
  } catch (_: Exception) {
    null
  }

  fun todayISO(): String = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())

  fun refreshAll(ctx: Context) {
    val m = AppWidgetManager.getInstance(ctx)
    for (id in m.getAppWidgetIds(ComponentName(ctx, TodayWidget::class.java))) m.updateAppWidget(id, today(ctx))
    for (id in m.getAppWidgetIds(ComponentName(ctx, WeekWidget::class.java))) m.updateAppWidget(id, week(ctx))
  }

  fun count(ctx: Context): Int {
    val m = AppWidgetManager.getInstance(ctx)
    return m.getAppWidgetIds(ComponentName(ctx, TodayWidget::class.java)).size +
      m.getAppWidgetIds(ComponentName(ctx, WeekWidget::class.java)).size
  }

  /** Ask the home screen to add a widget ("today" or "week"). False when it cannot. */
  fun pin(ctx: Context, kind: String): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
    val m = AppWidgetManager.getInstance(ctx)
    if (!m.isRequestPinAppWidgetSupported) return false
    val cls = if (kind == "week") WeekWidget::class.java else TodayWidget::class.java
    return m.requestPinAppWidget(ComponentName(ctx, cls), null, null)
  }

  private fun open(ctx: Context, path: String, code: Int): PendingIntent {
    val i = Intent(Intent.ACTION_VIEW, Uri.parse("forgeai://$path")).setPackage(ctx.packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return PendingIntent.getActivity(ctx, code, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  fun today(ctx: Context): RemoteViews {
    val v = RemoteViews(ctx.packageName, R.layout.forge_widget_today)
    val d = data(ctx)
    val t = d?.optJSONObject("today")
    if (d == null || t == null || d.optString("dateISO") != todayISO()) {
      v.setTextViewText(R.id.forge_today_title, "ForgeAI")
      v.setTextViewText(R.id.forge_today_line, "Open ForgeAI to see your workout")
      v.setTextViewText(R.id.forge_today_action, "Open")
    } else {
      v.setTextViewText(R.id.forge_today_title, t.optString("title", "ForgeAI"))
      v.setTextViewText(R.id.forge_today_line, t.optString("line", ""))
      v.setTextViewText(R.id.forge_today_action, t.optString("action", "Open"))
    }
    v.setOnClickPendingIntent(R.id.forge_today_root, open(ctx, "workout", 21))
    return v
  }

  private val DAY_IDS = intArrayOf(
    R.id.forge_week_d0, R.id.forge_week_d1, R.id.forge_week_d2, R.id.forge_week_d3,
    R.id.forge_week_d4, R.id.forge_week_d5, R.id.forge_week_d6,
  )

  fun week(ctx: Context): RemoteViews {
    val v = RemoteViews(ctx.packageName, R.layout.forge_widget_week)
    val d = data(ctx)
    val w = d?.optJSONObject("week")
    val today = todayISO()
    val days = w?.optJSONArray("days")
    val fresh = w != null && days != null && days.length() == 7 &&
      today >= w.optString("weekStartISO", "9999") && today <= w.optString("weekEndISO", "0000")
    if (!fresh) {
      v.setTextViewText(R.id.forge_week_count, "ForgeAI")
      v.setTextViewText(R.id.forge_week_line, "Open ForgeAI to update")
      for (id in DAY_IDS) {
        v.setInt(id, "setBackgroundResource", R.drawable.forge_day_open)
        v.setTextColor(id, MUTED)
      }
    } else {
      v.setTextViewText(R.id.forge_week_count, w!!.optString("count", ""))
      v.setTextViewText(R.id.forge_week_line, w.optString("line", ""))
      val todayIndex = w.optInt("todayIndex", -1)
      for (i in 0 until 7) {
        val done = days!!.optBoolean(i, false)
        val bg = when {
          done -> R.drawable.forge_day_done
          i == todayIndex -> R.drawable.forge_day_today
          else -> R.drawable.forge_day_open
        }
        v.setInt(DAY_IDS[i], "setBackgroundResource", bg)
        v.setTextColor(DAY_IDS[i], if (done) INK else if (i == todayIndex) ACCENT else MUTED)
      }
    }
    v.setOnClickPendingIntent(R.id.forge_week_root, open(ctx, "history", 22))
    return v
  }
}

class TodayWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    for (id in ids) manager.updateAppWidget(id, Widgets.today(context))
  }
}

class WeekWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    for (id in ids) manager.updateAppWidget(id, Widgets.week(context))
  }
}
