/**
 * Post-workout summary. Phase 2 (LW-21): the answer leads in one line (time · sets · kg lifted ·
 * records); long lists fold. LW-11: Finish lands here at once, and the "Update routine?"
 * question worked out on the workout screen is asked here, in the app's own sheet.
 * 15 Oct 2026: "Add photo" (Camera or Gallery, up to 4) — Hevy's "Add a photo / video" on Finish;
 * the workout is already saved here, so each photo is kept the moment it is picked.
 * R-147 (owner, 27 Oct 2026): the kg lifted against last time is the screen's proud headline — one
 * big card at the very top (KgHeroCard), with the comparison's exercises folded in it.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import {
  askConfirm,
  Card,
  EmptyState,
  GhostButton,
  HeroCard,
  Icon,
  PrimaryButton,
  Screen,
  Skeleton,
} from '@/components/ui';
import { fmtInt } from '@/lib/format';
import { useUnits } from '@/lib/useUnits';
import { color, gradients, radius, space, type } from '@/theme/tokens';

import { CompareNote } from '@/tracker/components/CompareNote';
import { KgHeroCard } from '@/tracker/components/KgHeroCard';
import { SessionSummary } from '@/tracker/components/SessionSummary';
import { ShareSheet } from '@/tracker/components/ShareSheet';
import { WorkoutPhotos } from '@/tracker/components/WorkoutPhotos';
import { SHARE_TEXT_HINT, SHARE_TEXT_LABEL, shareTextNow } from '@/tracker/components/ShareTextRow';
import { Glyph, type GlyphName } from '@/tracker/components/TrackerGlyph';
import { getCloudCoachNote, getSessionCoachNote, type CoachNote } from '@/tracker/services/coachNote';
import { finishAnswer, getSessionSummary, volumeComparison, workoutName } from '@/tracker/services/finishSummary';
import { workoutMilestone } from '@/tracker/services/milestones';
import { applyRoutineOffer, takeRoutineOffer } from '@/tracker/services/routineOffer';
import { autoBackupAfterWorkout } from '@/cloud/autoBackup';
import { copySoon } from '@/cloud/copySync';
import { SAVE_FIRST_ROUTINE, offersFirstRoutine, routineCount, saveFirstRoutine } from '@/tracker/services/saveFirstRoutine';
import { workoutText } from '@/tracker/services/shareText';
import type { SessionSummaryData } from '@/tracker/services/finishSummary';
import { workoutShareScene } from '@/tracker/share/workoutCard';
import { workoutShareInput } from '@/tracker/share/workoutInput';
import { useTrackerPrefs } from '@/tracker/store/trackerPrefsStore';

const TICK = 24;

/** A half-width secondary button: hairline pill, glyph + one short word that never wraps. */
function ShareButton({
  glyph,
  label,
  spoken,
  hint,
  onPress,
}: {
  glyph: GlyphName;
  label: string;
  spoken: string;
  hint?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint={hint}
      style={({ pressed }) => ({
        flex: 1,
        minWidth: 0,
        minHeight: 50,
        paddingHorizontal: space.md,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: color.borderStrong,
        backgroundColor: pressed ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.03)',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.sm,
      })}
    >
      <Glyph name={glyph} size={18} color={color.accent} />
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={{ flexShrink: 1, fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function FinishScreen() {
  useUnits(); // v0.27.0: the record and set texts follow Profile → Units
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = typeof params.id === 'string' ? params.id : params.id?.[0];

  const [data, setData] = useState<SessionSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<Pick<CoachNote, 'text' | 'exercises' | 'cause' | 'source'> | null>(null);
  // R-147: the big "kg lifted vs last time" card and the exercises it opens to (kept when the AI
  // note replaces the line).
  const [hero, setHero] = useState<Pick<CoachNote, 'hero' | 'exercises' | 'cause'> | null>(null);
  const [sharing, setSharing] = useState(false);
  const [routineLine, setRoutineLine] = useState<string | null>(null);
  // Backlog (21 Oct): no routines yet and an empty workout -> one quiet "Save as routine" button.
  const [offerFirst, setOfferFirst] = useState(false);
  const savingFirst = useRef(false);
  const coachNotesPref = useTrackerPrefs((s) => s.coachNotes);
  // v0.25.1: the body figure chosen in Profile.
  const figure = useTrackerPrefs((s) => s.bodyFigure);
  // Phase 3: the picture to share on WhatsApp / Instagram.
  // R-147: "+45 kg more than last time" goes on the picture too, beside "Workout complete", when today beat it.
  const shareLine = hero?.hero?.shareLine ?? null;
  const scene = useMemo(
    () => (data ? workoutShareScene({ ...workoutShareInput(data), figure, ...(shareLine ? { beatLast: shareLine } : {}) }) : null),
    [data, figure, shareLine],
  );

  useEffect(() => {
    let alive = true;
    if (id) {
      getSessionSummary(id)
        .then(async (d) => {
          // R-147: the comparison is read before the screen shows, so the big card is there from the
          // first frame (it never pushes the screen down). It never fails the summary.
          const n = d ? await getSessionCoachNote(d).catch(() => null) : null;
          if (alive) {
            setData(d);
            if (n) {
              setNote(n);
              setHero({ hero: n.hero, exercises: n.exercises, cause: n.cause });
            }
            setLoading(false);
          }
        })
        .catch(() => {
          if (alive) setLoading(false);
        });
    } else {
      setLoading(false);
    }
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    if (!data) return;
    let alive = true;
    routineCount()
      .then((n) => alive && setOfferFirst(offersFirstRoutine(data, n)))
      .catch((e: unknown) => console.warn('[finish] could not count routines', e));
    return () => {
      alive = false;
    };
  }, [data]);

  // Backlog (21 Oct): members who linked Google Drive get a backup after each workout, by itself:
  // when they leave this screen (review: the export holds the write queue, so not while it loads).
  const loaded = useRef(false);
  useEffect(() => {
    if (data) loaded.current = true;
    // #50: the finished workout is copied to ForgeAI's server for a signed-in member (a no-op otherwise).
    if (data) copySoon('finished a workout', 1500);
  }, [data]);
  useEffect(
    () => () => {
      if (loaded.current) void autoBackupAfterWorkout();
    },
    [],
  );

  const onSaveFirst = () => {
    if (!data || savingFirst.current) return;
    savingFirst.current = true;
    saveFirstRoutine(data).then(
      () => {
        setOfferFirst(false);
        setRoutineLine(SAVE_FIRST_ROUTINE.saved);
      },
      (e: unknown) => {
        savingFirst.current = false;
        console.warn('[finish] could not save the routine', e);
        setRoutineLine(SAVE_FIRST_ROUTINE.failed);
      },
    );
  };

  // LW-11: "Update routine?" — asked here, once the summary is on screen (taken once per workout).
  useEffect(() => {
    if (!data || !id) return;
    const offer = takeRoutineOffer(id);
    if (!offer) return;
    void askConfirm({
      title: `Update "${offer.name}"?`,
      body: `${offer.text} Save these changes to the routine for next time?`,
      confirmLabel: 'Update routine',
      cancelLabel: 'Keep original',
    }).then((yes) => {
      if (!yes) return;
      applyRoutineOffer(offer).then(
        () => setRoutineLine(`"${offer.name}" is updated for next time.`),
        () => setRoutineLine("Couldn't update the routine. Your workout is saved; the routine is unchanged."),
      );
    });
  }, [data, id]);

  // The note (Phase C2; audit Phase 7: facts, not a coach): the deterministic line as soon as
  // the summary loads, then — only with the coach switch on, the member opted in AND a Groq key
  // set — a richer note when it arrives. Never blocks; falls back silently.
  useEffect(() => {
    if (!data || !coachNotesPref) return;
    let alive = true;
    // The richer note compares in its own way: it replaces the line (the big card stays).
    void getCloudCoachNote(data).then((rich) => {
      if (alive && rich) setNote({ text: rich, source: 'groq' });
    });
    return () => {
      alive = false;
    };
  }, [data, coachNotesPref]);

  // Audit Phase 9 (#4): this workout's milestone, if it is one (never blocks the summary).
  const [milestone, setMilestone] = useState<string | null>(null);
  useEffect(() => {
    if (!data || !id) return;
    let alive = true;
    void workoutMilestone(id).then((m) => {
      if (alive) setMilestone(m);
    });
    return () => {
      alive = false;
    };
  }, [data, id]);

  const comparison = data ? volumeComparison(data.totalVolumeKg) : null;
  // R-147: the big card compares with last time (it then holds the exercise list).
  const heroCompared = hero?.hero != null && hero.hero.tone !== 'first';

  const sharingText = useRef(false);
  const shareText = (title: string, getText: () => string): void => {
    if (sharingText.current) return;
    sharingText.current = true;
    void shareTextNow(getText, title).finally(() => {
      sharingText.current = false;
    });
  };

  return (
    <Screen title="Workout complete" subtitle="Saved to your history." onBack={() => router.dismissTo('/workout')}>
      {loading ? (
        <View style={{ gap: space.lg }}>
          <Skeleton width="100%" height={128} radius={radius.xl} />
          <Skeleton width="100%" height={180} radius={radius.lg} />
        </View>
      ) : data ? (
        <View style={{ gap: space.lg }}>
          {/* R-147: kg lifted today against last time, the screen's headline. */}
          {hero?.hero ? <KgHeroCard hero={hero.hero} exercises={heroCompared ? hero.exercises : undefined} cause={hero.cause} /> : null}

          <HeroCard gradient={gradients.ember}>
            {/* Oct 2026: the tick sits ON the title's line (it used to float beside the whole
                block); the lines below start where the title's words start. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <Icon name="check" size={TICK} color={color.onAccent} />
              <Text style={{ flex: 1, fontFamily: type.displaySemi, fontSize: type.size.h2, color: color.onAccent }}>
                {workoutName(data)} done
              </Text>
            </View>
            <View style={{ marginLeft: TICK + space.sm, marginTop: 2 }}>
              {/* Audit Phase 9 (#4): "Your 100th workout" — 1st, 10th, 25th, 50th, 100th… */}
              {milestone ? (
                <Text
                  accessibilityRole="header"
                  style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.onAccent, marginBottom: 2 }}
                >
                  {milestone}
                </Text>
              ) : null}
              {/* UAT A-07 (30 Oct 2026): faded brown on orange was hard to read in sunlight; full strength now. */}
              <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.onAccent }}>
                {finishAnswer(data)}
              </Text>
              {comparison ? (
                <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.onAccent, marginTop: 2 }}>
                  That's about {comparison}.
                </Text>
              ) : null}
            </View>
          </HeroCard>

          {/* Audit Phase 7: a line of facts (an easy week, its records, or kg lifted against the
              last workout of its kind) — plain, with no coach heading or sparkle while the coach
              is hidden, and never food or sleep advice while nutrition is. */}
          {/* R-75: the line opens to each exercise (up, down, why) with the arrow on the right. */}
          {/* R-147: the big card already says the engine's comparison; the line stays for an easy week,
              the AI note, or a comparison the card could not make. */}
          {note?.text && !(note.source === 'engine' && heroCompared && !data.easyWeek) ? (
            <CompareNote text={note.text} exercises={heroCompared ? undefined : note.exercises} cause={note.cause} />
          ) : null}

          {routineLine ? (
            <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary }}>{routineLine}</Text>
          ) : null}

          {offerFirst ? (
            <Card style={{ gap: space.sm }}>
              <Text style={{ fontFamily: type.body, fontSize: type.size.sub, lineHeight: 20, color: color.inkSecondary }}>{SAVE_FIRST_ROUTINE.line}</Text>
              <GhostButton label={SAVE_FIRST_ROUTINE.button} icon="plus" onPress={onSaveFirst} />
            </Card>
          ) : null}

          {/* 15 Oct 2026: photos on this workout (private, on this phone). */}
          {id ? <WorkoutPhotos sessionId={id} /> : null}

          {/* The totals already lead in the card above — no second copy in tiles. */}
          <SessionSummary data={data} showTotals={false} />

          {/* Oct 2026: one primary (Done), then the two ways to share side by side as equal
              buttons, then View history. It used to be four actions in three styles, with
              "Share as text" an off-centre link. The words stay short so the row never wraps;
              each says its whole name to a screen reader (and to the phone tests). */}
          <View style={{ gap: space.md, marginTop: space.sm }}>
            <PrimaryButton label="Done" icon="check" onPress={() => router.dismissTo('/workout')} />
            <View style={{ flexDirection: 'row', gap: space.md }}>
              <ShareButton
                glyph="image"
                label="Picture"
                spoken="Share as a picture"
                onPress={() => setSharing(true)}
              />
              <ShareButton
                glyph="list"
                label="Text"
                spoken={SHARE_TEXT_LABEL}
                hint={SHARE_TEXT_HINT}
                onPress={() => shareText(workoutName(data), () => workoutText(data))}
              />
            </View>
            <GhostButton label="View history" icon="calendar" onPress={() => router.dismissTo('/profile')} />
          </View>
          {scene ? (
            <ShareSheet
              visible={sharing}
              scene={scene}
              fileName={`mettleup-workout-${data.session.dateISO}`}
              onClose={() => setSharing(false)}
            />
          ) : null}
        </View>
      ) : (
        <View style={{ gap: space.lg }}>
          <EmptyState
            icon="dumbbell"
            title="Summary unavailable"
            body="Your workout was saved — we just couldn't load its summary."
          />
          <PrimaryButton label="Done" icon="check" onPress={() => router.dismissTo('/workout')} />
        </View>
      )}
    </Screen>
  );
}
