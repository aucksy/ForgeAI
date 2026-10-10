# ForgeAI design language

One way to say, show and build things in the member app. Every new or changed screen follows
this. Shared pieces live in `apps/mobile/src/components/ui` and are imported from
`@/components/ui`.

## Words: one word per idea

| Say | Never |
|---|---|
| workout | session |
| record | PR, personal record, new PR |
| estimated 1-rep max | e1RM, PR e1RM |
| kg lifted / lb lifted (`liftedWords`) | volume, kg moved, vol |
| heaviest weight; best set (80 kg × 8) | heaviest set, top set |
| weeks in a row | day streak |
| the routine's own name ("Push 1") | its type ("Push Day", "Full Body") |
| Rest | Resting, Rest timer card |

- Plain English, short and calm. No jargon, no cheering slogans.
- One verb per action: "Follow this plan", "Import from …", "Next:".
- Subtitles carry facts (a count, a date range, the workout's name).
- Sentence case for every heading, button and chip. ALL CAPS only for small overlines and
  table headers.
- Buttons name the action ("Delete", "Discard"), never "OK" or "Yes".
- Anything half-built says so on screen.
- `test/lib/memberWords.test.ts` reads every screen and fails on "session", "PR", "volume",
  "kg moved" or "vol" in anything a member reads. Its allow-list is for code only (the hidden
  coach, frozen engine text, SQL, an AI prompt, search keywords) — never add a screen to it.

## Numbers and dates

- Clocks and rests: `1:30`, `0:45`, and `1:02:30` past an hour (`fmtDuration`, `fmtRest`).
  Lengths of time: `45 min`, `1h 05m`, `25h 39m`, `2h` (`fmtTotalTime`). Never `0m 12s`,
  `45s` or `11 h 20 min`. Buttons that add time: `+15 s`.
- Weights and reps: `80 kg × 8` — spaces and the unit always; a space before `%`.
- Big numbers: full, in the member's own grouping on result screens; short forms (`228k`) only
  inside charts. One style per screen.
- Dates: `Fri, 9 Oct` for headings (`dateWithYear`); `9 Oct` in lists and charts
  (`tinyDateWithYear`); add the year when it isn't this year; month headings `October 2026`
  (`monthTitle`); never "-1 days ago". No hand-built month arrays in screens.
- Minus: a true minus `−0.8`, not a hyphen.

## Icons: one meaning each

One meaning per icon, one icon per meaning. Names are `Icon` names (`@/components/ui`); a new
meaning gets a new icon, never a borrowed one. Many rows need no icon at all — that is fine.

| Icon (`name`) | Means only |
|---|---|
| bullseye (`target`) | the Target for the next set (live workout) |
| medal (`medal`) | a record — every kind (heaviest weight, estimated 1-rep max, best set…) |
| flame (`flame`) | streak / weeks in a row |
| magnifier (`search`) | search |
| person (`person`) | Profile (tab) |
| trash (`trash`) | delete or remove (behind a confirm or Undo) |
| back arrow (`chevron-left`) | leave this page (`Screen onBack`) |
| × (`close`) | close a sheet, a create form or a viewer — never deletes |
| dumbbell (`dumbbell`) | a workout or an exercise: start, resume, the Workout tab, the library |
| list (`list`) | routines, plans and programs |
| check (`check`) | done, saved, follow this plan |
| plus (`plus`) | add |
| calendar (`calendar`) | History and dates |
| chart (`chart`) | Progress (tab) |
| trend (`trend`) | getting stronger over time |
| scale (`scale`) | body weight |
| ruler (`ruler`) | body measurements |
| camera (`camera`) / video (`video`) | a photo / a video |
| clock (`clock`) | time: elapsed, rest, reminders |
| gauge (`gauge`) | how hard a set felt (RPE) |
| heart (`heart`) | easy weeks, recovery and Health Connect |
| zap (`zap`) | superset |
| route (`route`) | a distance |
| import (`import`) | bring in from a file or another app |
| volume (`volume`) | sounds and alerts |
| key (`key`) | a key or a sign-in |
| meal (`meal`) | nutrition (hidden) |
| sparkle (`sparkle`) | the coach and its notes (hidden) |
| sliders (`settings`) | change this thing's settings (exercise options, edit routine) |

Retired: `trophy` (it meant records, "done" and "programs" at once) — use `medal` or `check`.

## Colour and contrast

- Every piece of information text is at least 4.5:1 against the plane it sits on. The text
  greys are `ink` > `inkSecondary` > `inkMuted` > `inkFaint`, and all four pass on `bg`,
  `surface`, `surfaceRaised`, `surfaceSunken`, glass and the hero-card top.
  `apps/mobile/test/theme/contrast.test.ts` checks this — add any new text colour or plane there.
- `inkFaint` is for placeholders and hints (e.g. the weight a set tick will save). Hints count
  as information.
- `inkDisabled` is only for inactive controls. Never use it for anything the member needs to
  read.
- Grey for neutral changes; colour only for a change that matters to the member's goal. Red
  only for danger, never for a failure set. One colour for single-line charts. Colour is never
  the only signal.
- Keep the ember look. Never reorder `chart.series` — the order is what keeps charts readable
  for colour-blind members.

## Layout and behaviour

- **Leaving a page:** a back arrow top-left on pushed pages (`<Screen onBack={…}>`, spoken
  "Go back"); × only on sheets, viewers and create forms (New exercise, Log measurements, Build
  a plan, the add-exercise pickers). An × never deletes anything — a delete is a trash icon or a
  red link. Back closes a sheet first, and asks before throwing away typed work.
- **Status bar:** an opaque strip always on top; content never scrolls under the clock. `Screen`
  does this for you — build every page on `Screen`.
- **Buttons:** one primary (`PrimaryButton`, the orange pill), one secondary (`GhostButton`, the
  outlined pill), one destructive (`DangerLink` in `components/DangerLink.tsx`, a red text link
  that asks with `askConfirm` first). Never a red link on the ember card. No Android stock
  pop-ups: questions use `askConfirm`, notices ("Could not save") use `tell()` from
  `lib/tell.ts` — `Alert.alert` is not used anywhere.
- **Touch:** every tap target at least 48 dp, with 8 dp between targets. A double tap never does
  a thing twice.
- **Choices:** a radio circle for one-of-many; a checkbox circle for many-of-many; chips only for
  short filters. On/off is always a switch.
- **Small labels:** selectable chips are outlined when selected; read-only labels are plain grey
  text.
- **Lists:** rows with dividers inside one card. Long lists fold shut under a highlighted heading
  with their count (`FoldSection`). Horizontal scrollers run to the screen edge.
- **Main button** on a step screen is pinned above the gesture bar.
- **States:** empty = one friendly line and the one action that fills it (`EmptyState`); loading
  = a placeholder with no jump (`Skeleton`); error = "Couldn't load — Try again" (`LoadError`),
  never "No data".
- **Deletes:** prefer Undo (`UndoBar`) over "Are you sure?". Ask (`ConfirmSheet`) only when
  Undo is not possible.
- One heading style per level; one thumbnail shape; folds turn their chevron when they open.
- Text grows with the phone's text size without being cut off — test at 200 %.

## Everyone can use it (accessibility)

- **Text size is set once.** Every `Text` and `TextInput` grows with the phone's font size up to
  a cap picked from its own size: body 1.6×, headings 1.4×, page titles 1.3×, hero numerals
  1.2× (`textScaleCap` in `components/ui/a11y.ts`, wired in by `metro.config.js`). Don't add
  `maxFontSizeMultiplier` by hand, except for a number inside a fixed shape
  (`TEXT_SCALE_CAP.inShape`, plus `adjustsFontSizeToFit`).
- **Boxes grow with their text.** `minHeight`, never `height`, on anything holding words.
- **Headings:** page titles, `SectionHeader`, sheet titles and empty/error titles are headings a
  screen reader can jump between. A hand-made heading gets `accessibilityRole="header"`.
- **Choices say their state:** `Chip` says "selected"; pass `role="radio"` for one-of-many and
  `role="checkbox"` for many-of-many, so it says "checked".
- **Numbers are read whole:** `StatTile`, `RingGauge` and `AnimatedNumber` speak the final number
  with its label and unit in one line. A `HeroCard` that is one fact takes an
  `accessibilityLabel` that says it all.
- **Errors are spoken** the moment they appear, and once (`InlineError`, `LoadError`): by an
  announcement only — an error line carries no `accessibilityLiveRegion` as well.
- **Less motion:** with the phone's "Remove animations" on, the shared pieces stop moving
  (`useReduceMotion`). New animation uses that hook.
- **Every icon-only button has a spoken name** — `IconButton` will not compile without one — and
  every tap target is at least 48 dp (`hitSlopFor`).
- **Colour is never the only signal:** a change carries an arrow and a sign; "Same" is grey.

## Shared pieces

### `Screen`
The page shell: backdrop, safe area, header, and the status-bar strip.

```tsx
<Screen title="Body weight" subtitle="12 entries · since 3 Mar" onBack={() => goBack(router, '/analytics')}>…</Screen>
```

`goBack` (`lib/goBack.ts`) goes back, or — opened cold from a link or widget, with nothing
behind the page — to the tab the page belongs under. A back arrow is never a dead button.

### `Sheet` and `SheetRow`
The one bottom sheet. Handle, title, × (48 dp), and a body that scrolls once it is taller than
the room — capped at 90 % of the screen, never under the status bar, above the keyboard and the
gesture bar. `footer` stays pinned under the scrolling body.

```tsx
<Sheet visible={open} title="Set type" onClose={close}>
  <SheetRow label="Warm-up" selected={kind === 'warmup'} onPress={() => pick('warmup')} />
</Sheet>
```

Do not hand-roll a `Modal` for a sheet. (`TrackerSheet` is now a thin name for `Sheet`.)

### `ConfirmSheet`, `askConfirm` and `ConfirmHost`
"Are you sure?" in the app's own sheet. Imperative form, for replacing `Alert.alert`:

```tsx
if (await askConfirm({ title: 'Discard this workout?', body: 'Its sets will be deleted.', confirmLabel: 'Discard', destructive: true })) {
  discard();
}
```

`askConfirm` needs `<ConfirmHost />` mounted once at the app root. A notice — something to read,
not a question — is `tell('Could not save', 'Please try again.')`: the same sheet with one quiet
"Close" button (`notice: true`). A controlled
`<ConfirmSheet visible … onConfirm onCancel />` also works. Cancel, ×, back and a tap outside
all count as "no". Asked the moment another sheet closes, `ConfirmHost` waits for that sheet to
slide away first (`sheetClock`), so a question or notice is never lost — no delay needed at the
call.

### `LoadError`

```tsx
{error ? <LoadError what="your workouts" onRetry={reload} /> : …}
```

### `UndoBar`
Stays at least 6 s and stands still while a finger is on it. Place it yourself and key it by the
deleted thing so a new delete starts a fresh clock.

```tsx
{deleted ? <UndoBar key={deleted.id} message="Set 3 deleted" onAction={undo} onDismiss={forget} /> : null}
```

### `FoldSection` and `FoldedList`
A list folded shut under a highlighted heading: "12 sets · see them". Tap to open; the chevron
turns.

```tsx
<FoldedList title="All sets" noun="set" items={sets} keyOf={(s) => s.id} renderItem={(s) => <SetLine set={s} />} />
<FoldSection title="Entries" count={n} noun={{ one: 'entry', other: 'entries' }}>…</FoldSection>
```
