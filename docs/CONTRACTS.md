# ForgeAI module contracts

Single source of truth for cross-module APIs. Every module implements EXACTLY the
exports named here (names + signatures). Types come from `src/types/models.ts`;
theme from `src/theme/tokens.ts`; DB schema from `src/db/schema.ts` (kg everywhere,
`dateISO = 'YYYY-MM-DD'` local, timestamps epoch ms, booleans 0/1, JSON columns are
stringified arrays). Path alias `@/* -> src/*`. TypeScript strict — no `any` in
exported signatures. UI text is English; the AI mirrors the user's language.

## File ownership (one owner per file — never edit another module's files)

| Module | Owns |
|---|---|
| repos | `src/db/repos/*` |
| engine | `src/engine/*`, `src/services/*` |
| ui-kit | `src/components/ui/*`, `src/components/charts/*` |
| ai | `src/ai/*`, `src/store/*`, `src/lib/voice.ts` |
| seed | `src/db/seed/*` |
| assets | `scripts/make-icons.mjs`, `assets/images/*`, `src/components/ui/Logo.tsx` |
| dashboard | `src/app/(tabs)/index.tsx`, `src/components/dashboard/*` |
| chat-ui | `src/app/(tabs)/coach.tsx`, `src/components/chat/*` |
| analytics-ui | `src/app/(tabs)/analytics.tsx`, `src/components/analytics/*` |
| detail-ui | `src/app/exercise/[id].tsx`, `src/app/(tabs)/settings.tsx`, `src/components/exercise/*`, `src/components/settings/*` |

## src/db/repos

All repos use `getDb()` from `@/db`. Ordering: history ascending by date unless
stated. "Working sets" exclude `is_warmup = 1`.

```ts
// userRepo.ts
getProfile(): Promise<UserProfile>                      // throws if unseeded
updateProfile(patch: Partial<Omit<UserProfile, 'id'>>): Promise<UserProfile>
logBodyWeight(dateISO: string, weightKg: number): Promise<BodyWeightEntry> // upsert by date
getBodyWeightHistory(days?: number): Promise<BodyWeightEntry[]> // asc; days = trailing window
getLatestBodyWeight(): Promise<BodyWeightEntry | null>

// exerciseRepo.ts
getAllExercises(): Promise<Exercise[]>                  // name asc
getExerciseById(id: string): Promise<Exercise | null>
findExerciseByName(query: string): Promise<Exercise | null>
//   match order: exact name (ci) -> alias exact -> name/alias contains query ->
//   query contains name. Normalise: lowercase, trim, collapse spaces.
createExercise(input: Omit<Exercise, 'id'>): Promise<Exercise>

// workoutRepo.ts
createSession(input: { dateISO: string; dayType: DayType; notes?: string | null;
  source?: WorkoutSession['source']; startedAt?: number; endedAt?: number | null }): Promise<WorkoutSession>
addSets(sessionId: string, sets: { exerciseId: string; weightKg: number; reps: number;
  isWarmup?: boolean }[]): Promise<SetEntry[]>          // auto set_number per (session, exercise), then prRepo.checkAndRecordPrs
getSessionDetail(id: string): Promise<SessionDetail | null>
getSessionsBetween(fromISO: string, toISO: string): Promise<WorkoutSession[]> // inclusive
getRecentSessionDetails(limit: number): Promise<SessionDetail[]> // newest first
getLastSessionOfDayType(dayType: DayType, beforeISO?: string): Promise<SessionDetail | null>
getExerciseHistory(exerciseId: string, limit?: number):
  Promise<{ sessionId: string; dateISO: string; sets: SetEntry[]; volumeKg: number }[]> // newest first, working sets
deleteSession(id: string): Promise<void>
getStreakDays(todayISO: string): Promise<number>
//   walk back from today; >= 2 consecutive rest days breaks the run;
//   result = count of workout DAYS in the unbroken run (today counts if trained).
getWeeklyVolume(weeks: number): Promise<VolumePoint[]>  // Monday buckets asc, zero-filled
getMuscleGroupVolume(fromISO: string, toISO: string): Promise<MuscleVolumeSlice[]>
//   volume desc; secondary muscles count 50%; map via exercises.muscle_group
getConsistency(days: number): Promise<ConsistencyCell[]> // asc, every day present, level by session-volume quartile
getWorkoutFrequency(weeks: number): Promise<{ weekISO: string; sessions: number }[]> // asc, zero-filled

// prRepo.ts
getAllPrs(): Promise<(PersonalRecord & { exerciseName: string })[]> // best 'weight' + 'e1rm' per exercise, date desc
checkAndRecordPrs(sessionId: string): Promise<PersonalRecord[]>
//   for each exercise in session: insert kind 'weight' if top working-set weight > prior best;
//   kind 'e1rm' if Epley e1RM > prior best. Returns newly inserted PRs.
getPrHistory(exerciseId: string): Promise<PersonalRecord[]> // asc

// nutritionRepo.ts
logMeal(input: { dateISO: string; description: string; calories: number; proteinG: number;
  carbsG: number; fatG: number; source?: Meal['source']; photoUri?: string | null;
  loggedAt?: number }): Promise<Meal>
getMealsForDay(dateISO: string): Promise<Meal[]>        // loggedAt asc
getNutritionDay(dateISO: string): Promise<NutritionDay> // zeros when empty
getNutritionRange(fromISO: string, toISO: string): Promise<NutritionDay[]> // asc, zero-filled
deleteMeal(id: string): Promise<void>

// planRepo.ts
type PlanDayFull = PlanDay & { exercises: (PlanExercise & { exercise: Exercise })[] }
getActivePlan(): Promise<{ plan: WorkoutPlan; days: PlanDayFull[] } | null> // days by day_order, exercises by ex_order

// chatRepo.ts
getMessages(limit?: number): Promise<ChatMessage[]>     // createdAt asc (last `limit`)
addMessage(input: { role: MessageRole; kind?: MessageKind; text: string;
  payload?: unknown | null; imageUri?: string | null }): Promise<ChatMessage>
clearHistory(): Promise<void>
```

## src/engine (pure functions — no DB imports) + src/services (DB orchestration)

```ts
// engine/overload.ts
epleyE1rm(weightKg: number, reps: number): number       // w * (1 + reps/30)
roundToIncrement(weightKg: number, incrementKg: number): number
computeOverloadTarget(input: {
  exercise: Exercise;
  target: { targetSets: number; repRangeMin: number; repRangeMax: number };
  history: { dateISO: string; sets: { weightKg: number; reps: number }[] }[]; // newest first, working sets
}): OverloadTarget
// Rules (top WORKING set of most recent session, `w x r`):
//  - no history -> action 'start', conservative starting weight by equipment, reason explains.
//  - all sets of last session hit repRangeMax at same weight -> 'increase' by incrementKg;
//    reason "Completed all N target reps last session."
//  - top reps < repRangeMin in BOTH of last two sessions -> 'deload' 10% (rounded to increment);
//    reason mentions resetting to build back up.
//  - same top weight for >= 3 sessions AND no top-rep improvement -> 'deload' (plateau) or
//    'hold' with +1 rep target if reps still climbing; plateau reason mentions 3 weeks.
//  - otherwise 'hold': same weight, target top reps + 1. Every branch sets a human reason.

// engine/recovery.ts
computeRecovery(input: {
  todayISO: string;
  recentSessions: { dateISO: string; dayType: DayType; volumeKg: number;
    muscleVolumes: { muscleGroup: MuscleGroup; volumeKg: number }[] }[]; // last 7 days
  avgWeeklyVolumeKg: number;                            // trailing 4-week mean
}): RecoveryStatus  // score 0-100: rest-day credit, 7d volume vs avg, muscle freshness >= 48h

// engine/strength.ts
computeStrengthScore(input: {
  bodyWeightKg: number;
  lifts: { exerciseName: string; e1rmKg: number }[];    // best e1RM of key lifts
}): StrengthScore
// benchmarks (xBW): bench 1.25, squat 1.75, deadlift 2.0, overhead press 0.75, row 1.0

// engine/insights.ts
buildInsight(d: {
  streakDays: number; proteinGapG: number; recentPrCount: number;
  plateauedExercise: string | null; weeklyVolumeDeltaPct: number; todayTrained: boolean;
}): string  // one coach-voice sentence, priority: PR > plateau > protein gap > volume > streak

// services/coach.ts
getTodaysWorkout(dateISO?: string): Promise<TodaysWorkout>
//   rotation: active plan days ordered; next = day after the plan-day of the most recent
//   session (wrap around; skip 'rest'); if today already trained -> that day marked done in
//   headline. Targets via computeOverloadTarget with getExerciseHistory (limit 4).

// services/dashboard.ts
getDashboardData(): Promise<DashboardData>

// services/analytics.ts
getExerciseStats(exerciseId: string): Promise<ExerciseStats>
getAnalyticsBundle(rangeDays: 30 | 90 | 180): Promise<{
  weight: { dateISO: string; weightKg: number }[];
  weeklyVolume: VolumePoint[];
  frequency: { weekISO: string; sessions: number }[];
  calories: NutritionDay[];
  muscleVolume: MuscleVolumeSlice[];
  consistency: ConsistencyCell[];
  prTimeline: (PersonalRecord & { exerciseName: string })[];
  strengthTrend: { dateISO: string; score: number }[];  // monthly points
}>
```

## src/ai + src/store + src/lib/voice.ts

```ts
// ai/models.ts
DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5'
ANTHROPIC_MODELS: { id: string; label: string }[]       // sonnet-5, opus-4-8, haiku-4-5
DEFAULT_OPENAI_MODEL = 'gpt-5'
OPENAI_MODELS: { id: string; label: string }[]

// ai/types.ts
interface CoachCard { kind: MessageKind; text: string; payload: unknown | null }
interface ToolRunResult { resultForModel: unknown; card?: CoachCard }
interface CoachTool { name: string; description: string;
  parameters: Record<string, unknown>;                  // JSON Schema
  execute(args: Record<string, unknown>): Promise<ToolRunResult> }
interface ProviderTurn { text: string;
  toolCalls: { id: string; name: string; args: Record<string, unknown> }[] }
interface ProviderMessage { role: 'user' | 'assistant' | 'tool'; text?: string;
  imageBase64?: { data: string; mediaType: string };
  toolCalls?: ProviderTurn['toolCalls'];                // assistant tool-use turns
  toolResult?: { callId: string; result: unknown } }

// ai/tools.ts — the OS surface. export const COACH_TOOLS: CoachTool[]
//  log_workout(dayType?, exercises: [{ name, sets: [{ weightKg, reps }] }], dateISO?)
//    -> resolves names via findExerciseByName (creates unknown as 'other' non-compound),
//       creates/reuses today's session, addSets, returns summary + new PRs; card 'workout_logged'
//  get_todays_workout() -> TodaysWorkout; card 'workout_plan'
//  log_meal(description, calories, proteinG, carbsG, fatG, dateISO?) — the MODEL estimates
//    macros itself (from text or image) and passes numbers; card 'meal_logged'
//  get_nutrition(dateISO?) -> NutritionDay + targets + remaining; card 'nutrition_summary'
//  get_nutrition_range(fromISO, toISO) -> NutritionDay[] + averages
//  get_workout_summary(fromISO, toISO) -> sessions, volume, top exercises, day-type counts
//  get_prs() -> PR list; card 'pr_list'
//  get_exercise_stats(name) -> ExerciseStats summary (no giant arrays to the model)
//  log_body_weight(weightKg, dateISO?)
//  get_dashboard_snapshot() -> compact DashboardData summary for coaching questions

// ai/system.ts
buildSystemPrompt(profile: UserProfile, todayISO: string): string
//  persona: experienced personal trainer at {gymName}; ALWAYS explain why; mirror the
//  user's language (English/Hindi/Hinglish); use tools for any data question — never
//  invent numbers; kg default; concise coach tone, no emoji spam.

// ai/providers/anthropic.ts + ai/providers/openai.ts
chatAnthropic(cfg: { apiKey: string; model: string }, system: string,
  messages: ProviderMessage[], tools: CoachTool[]): Promise<ProviderTurn>
chatOpenAi(cfg: { apiKey: string; model: string }, system: string,
  messages: ProviderMessage[], tools: CoachTool[]): Promise<ProviderTurn>
//  REST fetch only (no SDKs). Anthropic: /v1/messages, anthropic-version 2023-06-01,
//  tool_use/tool_result blocks, image = base64 source block. OpenAI: /v1/chat/completions,
//  tools + tool_calls, image_url data URI. Surface HTTP errors as thrown Error with
//  a short user-safe message (never echo the key).

// ai/localCoach.ts — NO-KEY FALLBACK (demo must shine offline)
localCoachReply(text: string): Promise<{ text: string; cards: CoachCard[] } | null>
//  deterministic intent parser (en/hi/hinglish keywords): todays_workout, log_workout
//  ("bench press 80 kg 8 7 6", "80 x 8"), log_meal via FOOD_DB lookup (~40 items:
//  roti, dal, paneer, biryani, butter chicken, rice, eggs, oats, whey, dosa, idli...),
//  nutrition_today, calories/protein remaining, weekly/monthly summary, prs,
//  improvement, body weight log. null -> orchestrator sends generic help reply.

// ai/orchestrator.ts
sendToCoach(userText: string, imageUri?: string | null): Promise<ChatMessage[]>
//  1) persist user msg; 2) provider = settingsStore (or 'local' when no key);
//  3) local: localCoachReply; cloud: tool loop (max 6 rounds) with last ~20 messages
//     as context, execute COACH_TOOLS, collect cards; image -> read file as base64;
//  4) persist coach reply (kind 'text') + one message per card (kind = card.kind,
//     payload JSON); returns ALL newly persisted messages in order. Errors ->
//     friendly 'error' message (offer local mode), never throws.

// store/settingsStore.ts — zustand + persist(AsyncStorage), key 'forgeai-settings'
useSettings: { ai: AiSettings; unitSystem: UnitSystem; language: AppLanguage;
  setProvider, setModel(provider, model), setVoiceEnabled, setSpeakReplies,
  setUnitSystem, setLanguage }
//  NOTE keys live in lib/keys (SecureStore), never in this store.

// store/chatStore.ts
useChat: { messages: ChatMessage[]; sending: boolean; loaded: boolean;
  load(): Promise<void>;                                 // chatRepo.getMessages(200)
  send(text: string, imageUri?: string | null): Promise<void>; // optimistic user msg + pending coach bubble
  clear(): Promise<void> }

// store/dashboardStore.ts
useDashboard: { data: DashboardData | null; loading: boolean;
  refresh(): Promise<void> }                             // call after any logging mutation

// lib/voice.ts — expo-speech-recognition seam (graceful everywhere)
useVoiceInput(): { available: boolean; listening: boolean; partial: string;
  start(lang: 'en-IN' | 'hi-IN'): Promise<void>; stop(): Promise<void> }
//  events: result (interim+final), end, error -> reset state; request permissions on first start.
speak(text: string): void                                // expo-speech TTS, fire-and-forget
```

## src/components/ui + src/components/charts (ui-kit)

All styling from tokens. Reanimated entrance/press micro-interactions. Exact prop
contracts (consumers code against these):

```tsx
<Screen title?: string subtitle?: string scroll?: boolean (default true)
  right?: ReactNode noPad?: boolean>                     // backdrop gradient + safe area + header
<Card style?>                                            // surface, radius.lg, border hairline
<GlassCard style?>                                       // color.glass + border, for overlays/hero
<HeroCard gradient?: readonly [string,string] style?>    // gradient hero surface
<SectionHeader title action?: { label; onPress }>
<StatTile label value unit? delta?: { value: string; good: boolean } icon?: IconName onPress?>
<RingGauge value: number max: number size?: number label?: string sublabel?: string
  color?: string trackColor?: string>                    // SVG progress ring, animated
<Chip label selected? onPress? icon?: IconName>
<PrimaryButton label onPress loading? disabled? icon?: IconName>   // ember gradient
<GhostButton label onPress icon?: IconName>
<IconButton icon: IconName onPress size? tint? accessibilityLabel>
<Icon name: IconName size?: number color?: string>
// IconName: 'home'|'chat'|'chart'|'settings'|'mic'|'send'|'camera'|'flame'|'dumbbell'|
//   'meal'|'trophy'|'trend'|'chevron-right'|'chevron-left'|'plus'|'check'|'close'|
//   'sparkle'|'calendar'|'clock'|'scale'|'heart'|'zap'|'target'|'key'|'globe'|'volume'
<AnimatedNumber value: number format?: (n: number) => string style?>  // count-up on change
<Skeleton width height radius?>                          // shimmer loading
<EmptyState icon: IconName title body?>
<Badge label tone?: 'accent'|'good'|'warn'|'neutral'>
TabBar                                                    // upgrade in place: icons + active pill + glass
```

Charts (react-native-svg; `chart` tokens; single-series = `chart.series[0]` unless
told; grid hairlines `color.grid`; axis labels `color.inkMuted` 11px; NO dual axes;
selective direct labels only — never every point; press-to-inspect where noted):

```tsx
<LineChart data: { x: string; y: number }[] height?: number color?: string
  fillGradient?: boolean yFormat?: (n:number)=>string target?: number
  onInspect?: (p: { x: string; y: number } | null) => void>  // press-drag crosshair + dot
<BarChart data: { x: string; y: number }[] height?: number color?: string
  yFormat? labelEvery?: number highlightLast?: boolean>      // rounded 4px tops, 2px gaps
<Sparkline data: number[] width? height? color?>             // no axes
<MiniBars data: number[] width? height? color?>              // tiny bars for tiles
<HBarList data: { label: string; value: number; color?: string }[] valueFormat?>
  // horizontal bars w/ labels — muscle-group volume (identity via labels, ONE hue)
<Heatmap cells: ConsistencyCell[] weeks: number>             // GitHub-style, chart.ramp
<DeltaPill value: number suffix?>                            // +12% styled good/critical text
```

## Wave-2 screens (consume everything above; own their route files)

- **dashboard**: hero "Today: Pull Day" card (tap -> coach with prompt), streak flame,
  StatTile grid (calories ring, protein ring, recovery, strength), weekly volume
  MiniBars + delta, body-weight Sparkline, AI insight GlassCard, next-workout row.
  Pull-to-refresh; refresh on focus (useFocusEffect + dashboardStore.refresh).
- **chat-ui**: message list (inverted FlatList), rich cards per MessageKind
  (workout_plan renders per-exercise Last/Target/Reason rows; nutrition ring cards;
  PR trophy list), typing indicator, suggested-prompt chips (the PRD's 12), input bar
  w/ mic (hold-to-talk, partial transcript, waveform pulse), camera/photo attach,
  auto-scroll, TTS toggle respect. On send: chatStore.send, then dashboardStore.refresh().
- **analytics-ui**: range Chips (30/90/180d), sections: Body Weight LineChart,
  Weekly Volume BarChart, Frequency BarChart, Calories vs target LineChart,
  Muscle Group HBarList, Consistency Heatmap, PR timeline list, Strength LineChart.
  Exercise picker -> per-exercise progress (top weight + e1RM lines, volume bars) ->
  link to exercise page.
- **detail-ui**: exercise/[id]: header stats (best set, PR e1rm, avg w/reps),
  progress LineChart, volume BarChart, session history list (sets as chips).
  settings: provider selector (Claude/OpenAI/Local demo), model picker, API key
  fields (SecureStore via lib/keys, masked, never logged), voice toggles, units,
  language, "dark mode" (locked on, playful copy), gym branding footer
  ("Powered by ForgeAI"), Reset demo data (drop DB + reseed + restart notice).

## Seed (src/db/seed) — first-launch realism

Deterministic PRNG (mulberry32, fixed seed). Member: Arjun Mehra, 27, 176 cm,
intermediate, goal muscle, gym "Iron Temple Fitness", member since 2025-11,
targets 2600 kcal / 160 g P / 290 g C / 75 g F. ~35-exercise catalog with
Hindi/Hinglish aliases. Active 6-day PPL plan (Push/Pull/Legs A+B, sensible
rep ranges). 13 weeks history ending YESTERDAY (today stays unlogged for the
demo; TODAY = next day in rotation):
- 5-6 sessions/week, ~90% adherence, deload week 7, realistic weight/rep noise,
  clear overload trends (e.g. bench 60->72.5, squat 80->105, lat pulldown 55->70).
- addSets path must generate PRs organically (use repos, not raw SQL).
- Body weight 74.0 -> 77.6 kg, ~3x/week entries with noise.
- Meals: 3-5/day Indian mix hitting targets +-15%; protein trend 120->158 g;
  TODAY partially logged (breakfast + lunch, ~55% of targets).
- Chat history: 6-8 seeded messages showing off (a logged workout, a meal photo-less
  log, a PR congrats, today's-workout card).
- Set meta seeded='1'; seed runs in ONE transaction; target < 3 s on-device.

## Assets

`scripts/make-icons.mjs` (node, @resvg/resvg-js): resizes the designer's master
PNG exports in `scripts/icon-src/` (ember hexagon + compass-star mark on #07080C)
by embedding each as a data-URI `<image>` in an SVG (no sharp/ImageMagick on the
build machine). Outputs the Expo assets (icon 1024, adaptive foreground/monochrome
1024, splash 512, favicon 48) AND the native `res/mipmap-*` launcher icons (PNG;
the old .webp are deleted — CI builds android/ with no prebuild, so the native
mipmaps are what actually ship) plus the drawable-* splash logos.
`Logo.tsx`: SVG wordmark "FORGE **AI**" (Sora feel, ember accent).
