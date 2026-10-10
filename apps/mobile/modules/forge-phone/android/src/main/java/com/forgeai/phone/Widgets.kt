package com.forgeai.phone

import android.app.AlarmManager
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
import java.util.Calendar
import java.util.Date
import java.util.Locale

/**
 * Home-screen widgets (v0.27.0, tracker plan Phase 5): "Today" (today's workout from the plan)
 * and "This week" (workouts done, day by day). The app writes what they show (`save`) whenever
 * it changes: on launch, on return, after a workout, after a plan change.
 *
 * Audit Phase 6:
 *  - PH-02: the app writes the next 7 days ("days", each with its own date, Today and week) and
 *    what stands after them ("later"). The widget picks the entry for the phone's date itself,
 *    so the morning after, and every Monday, it shows the right workout without the app being
 *    opened. Only data older than all of that falls back to "Open ForgeAI".
 *  - PH-09: "Start" opens forgeai://workout/start?routine=ID (the app starts that routine, or
 *    resumes the open workout); during a workout ("live") the widget says "Resume".
 *  - PH-10: the day marks share the row (they shrink to fit the smallest size) and TalkBack
 *    reads each as "Monday, trained".
 *
 * Review fixes:
 *  - the app's data carries the widget's own key ("token"); every Start / Resume link carries it
 *    as `t=`, and only a link with it starts a workout by itself;
 *  - redrawn just after midnight (a plain alarm, not exact, re-armed on every redraw; no
 *    permission needed) and when the clock or time zone is changed (TIME_SET and
 *    TIMEZONE_CHANGED, which Android still delivers to a receiver in the manifest), so the new
 *    day's entry shows at once instead of up to 30 minutes later.
 */
object Widgets {
  private const val PREFS = "forgeai_widgets"
  private const val KEY = "data"
  private const val ACCENT = 0xFFFF7A3B.toInt()
  private const val MUTED = 0xFFA0A4AE.toInt()
  private const val INK = 0xFF07080C.toInt()
  /** The just-after-midnight redraw (an explicit broadcast to [TodayWidget]). */
  const val ACTION_TICK = "com.forgeai.phone.WIDGET_TICK"
  /** How long after midnight the redraw is asked for, and how late Android may run it. */
  private const val AFTER_MIDNIGHT_MS = 5_000L
  private const val TICK_WINDOW_MS = 10L * 60_000L
  private val DAY_NAMES = arrayOf("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")

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

  /** Today's place in the week, 0 = Monday ... 6 = Sunday. */
  private fun todayIndexNow(): Int {
    val dow = Calendar.getInstance().get(Calendar.DAY_OF_WEEK) // 1 = Sunday ... 7 = Saturday
    return (dow + 5) % 7
  }

  /** The entry the app wrote for this date, or null. */
  private fun entryFor(d: JSONObject?, day: String): JSONObject? {
    val days = d?.optJSONArray("days") ?: return null
    for (i in 0 until days.length()) {
      val e = days.optJSONObject(i) ?: continue
      if (e.optString("dateISO", "") == day) return e
    }
    return null
  }

  /** True when this date is after the last of the days the app wrote ("later" applies). */
  private fun pastLast(d: JSONObject?, day: String): Boolean {
    val days = d?.optJSONArray("days") ?: return false
    if (days.length() == 0) return false
    val last = days.optJSONObject(days.length() - 1)?.optString("dateISO", "") ?: ""
    return last.isNotEmpty() && day > last
  }

  fun refreshAll(ctx: Context) {
    val m = AppWidgetManager.getInstance(ctx)
    for (id in m.getAppWidgetIds(ComponentName(ctx, TodayWidget::class.java))) m.updateAppWidget(id, today(ctx))
    for (id in m.getAppWidgetIds(ComponentName(ctx, WeekWidget::class.java))) m.updateAppWidget(id, week(ctx))
    armMidnight(ctx)
  }

  private fun tickIntent(ctx: Context): PendingIntent {
    val i = Intent(ctx, TodayWidget::class.java).setAction(ACTION_TICK)
    return PendingIntent.getBroadcast(ctx, 24, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  /** Epoch ms of the next local midnight. */
  private fun nextMidnight(): Long {
    val c = Calendar.getInstance()
    c.add(Calendar.DAY_OF_YEAR, 1)
    c.set(Calendar.HOUR_OF_DAY, 0)
    c.set(Calendar.MINUTE, 0)
    c.set(Calendar.SECOND, 0)
    c.set(Calendar.MILLISECOND, 0)
    return c.timeInMillis
  }

  /**
   * A redraw just after the next local midnight, while a widget is on the home screen. A window
   * alarm (not exact: no permission), RTC (it never wakes the phone; a sleeping phone gets it as
   * it wakes, before anyone looks). Setting it again replaces the one already set.
   */
  fun armMidnight(ctx: Context) {
    try {
      val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      val pi = tickIntent(ctx.applicationContext)
      if (count(ctx) == 0) {
        am.cancel(pi)
        return
      }
      am.setWindow(AlarmManager.RTC, nextMidnight() + AFTER_MIDNIGHT_MS, TICK_WINDOW_MS, pi)
    } catch (_: Exception) {
      // No alarm: the 30-minute update still redraws it.
    }
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
    val day = todayISO()
    val live = d?.optJSONObject("live")
    val fromDays = entryFor(d, day)?.optJSONObject("today")
    val fromLater = if (fromDays == null && pastLast(d, day)) d?.optJSONObject("later")?.optJSONObject("today") else null
    val t = live ?: fromDays ?: fromLater
    var path = "workout"
    if (t == null) {
      v.setTextViewText(R.id.forge_today_title, "ForgeAI")
      v.setTextViewText(R.id.forge_today_line, "Open ForgeAI to see your workout")
      v.setTextViewText(R.id.forge_today_action, "Open")
      v.setContentDescription(R.id.forge_today_root, "ForgeAI. Open ForgeAI to see your workout")
    } else {
      val title = t.optString("title", "ForgeAI")
      val line = t.optString("line", "")
      val action = t.optString("action", "Open")
      v.setTextViewText(R.id.forge_today_title, title)
      v.setTextViewText(R.id.forge_today_line, line)
      v.setTextViewText(R.id.forge_today_action, action)
      v.setContentDescription(R.id.forge_today_root, "Today: $title. $line. $action")
      val routineId = t.optString("routineId", "")
      // The widget's own key: only a link that carries it starts a workout by itself.
      val token = d?.optString("token", "") ?: ""
      val key = if (token.isNotEmpty()) "t=" + Uri.encode(token) else ""
      if (live != null) {
        path = if (key.isNotEmpty()) "workout/start?$key" else "workout/start"
      } else if (action == "Start" && routineId.isNotEmpty()) {
        path = "workout/start?routine=" + Uri.encode(routineId) + (if (key.isNotEmpty()) "&$key" else "")
      }
    }
    v.setOnClickPendingIntent(R.id.forge_today_root, open(ctx, path, 21))
    return v
  }

  private val DAY_IDS = intArrayOf(
    R.id.forge_week_d0, R.id.forge_week_d1, R.id.forge_week_d2, R.id.forge_week_d3,
    R.id.forge_week_d4, R.id.forge_week_d5, R.id.forge_week_d6,
  )

  /** The seven day marks. `known` = false: nothing to say about them (no data yet). */
  private fun paintDays(v: RemoteViews, done: BooleanArray, todayIndex: Int, known: Boolean) {
    for (i in 0 until 7) {
      val bg = when {
        done[i] -> R.drawable.forge_day_done
        i == todayIndex -> R.drawable.forge_day_today
        else -> R.drawable.forge_day_open
      }
      v.setInt(DAY_IDS[i], "setBackgroundResource", bg)
      v.setTextColor(DAY_IDS[i], if (done[i]) INK else if (i == todayIndex) ACCENT else MUTED)
      val said = when {
        !known -> DAY_NAMES[i]
        done[i] -> DAY_NAMES[i] + ", trained"
        i == todayIndex -> DAY_NAMES[i] + ", today"
        todayIndex >= 0 && i < todayIndex -> DAY_NAMES[i] + ", not trained"
        else -> DAY_NAMES[i]
      }
      v.setContentDescription(DAY_IDS[i], said)
    }
  }

  fun week(ctx: Context): RemoteViews {
    val v = RemoteViews(ctx.packageName, R.layout.forge_widget_week)
    val d = data(ctx)
    val day = todayISO()
    val w = entryFor(d, day)?.optJSONObject("week")
    val days = w?.optJSONArray("days")
    val later = if (w == null && pastLast(d, day)) d?.optJSONObject("later")?.optJSONObject("week") else null
    if (w != null && days != null && days.length() == 7) {
      v.setTextViewText(R.id.forge_week_count, w.optString("count", ""))
      v.setTextViewText(R.id.forge_week_line, w.optString("line", ""))
      val done = BooleanArray(7) { days.optBoolean(it, false) }
      paintDays(v, done, w.optInt("todayIndex", -1), true)
    } else if (later != null) {
      // A week the app has not seen yet: nothing done in it so far.
      v.setTextViewText(R.id.forge_week_count, later.optString("count", ""))
      v.setTextViewText(R.id.forge_week_line, later.optString("line", ""))
      paintDays(v, BooleanArray(7), todayIndexNow(), true)
    } else {
      v.setTextViewText(R.id.forge_week_count, "ForgeAI")
      v.setTextViewText(R.id.forge_week_line, "Open ForgeAI to update")
      paintDays(v, BooleanArray(7), -1, false)
    }
    v.setOnClickPendingIntent(R.id.forge_week_root, open(ctx, "history", 22))
    return v
  }
}

class TodayWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    for (id in ids) manager.updateAppWidget(id, Widgets.today(context))
    Widgets.armMidnight(context) // after a restart the alarm is gone: set it again
  }

  /**
   * Review fix: the just-after-midnight redraw, and a clock or time-zone change (the manifest
   * lists TIME_SET and TIMEZONE_CHANGED for this receiver only, so both widgets redraw once).
   */
  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    when (intent.action) {
      Widgets.ACTION_TICK, Intent.ACTION_TIME_CHANGED, Intent.ACTION_TIMEZONE_CHANGED -> Widgets.refreshAll(context)
    }
  }
}

class WeekWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    for (id in ids) manager.updateAppWidget(id, Widgets.week(context))
    Widgets.armMidnight(context)
  }
}
