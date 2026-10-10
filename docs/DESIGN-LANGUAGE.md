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
| kg lifted | volume, kg moved, vol |
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

## Numbers and dates

- Clocks and rests: `1:30`, and `1:02:30` past an hour. Totals: `25h 39m`. Never `0m 12s`.
- Weights and reps: `80 kg × 8` — spaces and the unit always; a space before `%`.
- Big numbers: full, in the member's own grouping on result screens; short forms (`228k`) only
  inside charts. One style per screen.
- Dates: `Fri, 9 Oct` for headings; `9 Oct` in lists and charts; add the year when it isn't this
  year; never "-1 days ago".
- Minus: a true minus `−0.8`, not a hyphen.

## Icons: one meaning each

| Icon | Means only |
|---|---|
| bullseye | Target |
| medal | a record |
| flame | streak |
| magnifier | search |
| person | Profile |
| trash | delete |
| back arrow | leave this page |

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

- **Leaving a page:** a back arrow top-left on pushed pages; × only on sheets and create forms.
  An × never deletes anything. Back closes a sheet first, and asks before throwing away typed
  work.
- **Status bar:** an opaque strip always on top; content never scrolls under the clock. `Screen`
  does this for you — build every page on `Screen`.
- **Buttons:** one primary (`PrimaryButton`, the orange pill), one secondary (`GhostButton`, the
  outlined pill), one destructive (a red text link that opens `ConfirmSheet`). No Android stock
  pop-ups.
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

## Shared pieces

### `Screen`
The page shell: backdrop, safe area, header, and the status-bar strip.

```tsx
<Screen title="Body weight" subtitle="12 entries · since 3 Mar">…</Screen>
```

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

`askConfirm` needs `<ConfirmHost />` mounted once at the app root. A controlled
`<ConfirmSheet visible … onConfirm onCancel />` also works. Cancel, ×, back and a tap outside
all count as "no".

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
