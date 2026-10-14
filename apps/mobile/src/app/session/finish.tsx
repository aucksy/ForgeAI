/**
 * Post-workout summary. Phase 2 (LW-21): the answer leads in one line (time · sets · kg lifted ·
 * records); long lists fold. LW-11: Finish lands here at once, and the "Update routine?"
 * question worked out on the workout screen is asked here, in the app's own sheet.
 * 15 Oct 2026: "Add photo" (Camera or Gallery, up to 4) — Hevy's "Add a photo / video" on Finish;
 * the workout is already saved here, so each photo is kept the moment it is picked.
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
import { onAccentTint } from '@/theme/tint';
import { color, gradients, radius, space, type } from '@/theme/tokens';

import { SessionSummary } from '@/tracker/components/SessionSummary';
import { ShareSheet } from '@/tracker/components/ShareSheet';
import { WorkoutPhotos } from '@/tracker/components/WorkoutPhotos';
import { SHARE_TEXT_HINT, SHARE_TEXT_LABEL, shareTextNow } from '@/tracker/components/ShareTextRow';
import { Glyph, type GlyphName } from '@/tracker/components/TrackerGlyph';
import { getCloudCoachNote, getSessionCoachNote } from '@/tracker/services/coachNote';
import { finishAnswer, getSessionSummary, volumeComparison, workoutName } from '@/tracker/services/finishSummary';
import { workoutMilestone } from '@/tracker/services/milestones';
import { applyRoutineOffer, takeRoutineOffer } from '@/tracker/services/routineOffer';
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
  const [note, setNote] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [routineLine, setRoutineLine] = useState<string | null>(null);
  const coachNotesPref = useTrackerPrefs((s) => s.coachNotes);
  // v0.25.1: the body figure chosen in Profile.
  const figure = useTrackerPrefs((s) => s.bodyFigure);
  // Phase 3: the picture to share on WhatsApp / Instagram.
  const scene = useMemo(() => (data ? workoutShareScene({ ...workoutShareInput(data), figure }) : null), [data, figure]);

  useEffect(() => {
    let alive = true;
    if (id) {
      getSessionSummary(id)
        .then((d) => {
          if (alive) {
            setData(d);
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
    if (!data) return;
    let alive = true;
    void getSessionCoachNote(data).then((n) => {
      if (!alive) return;
      setNote(n.text);
      if (coachNotesPref) {
        void getCloudCoachNote(data).then((rich) => {
          if (alive && rich) setNote(rich);
        });
      }
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
              <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: onAccentTint(0.72) }}>
                {finishAnswer(data)}
              </Text>
              {comparison ? (
                <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: onAccentTint(0.6), marginTop: 2 }}>
                  That's about {comparison}.
                </Text>
              ) : null}
            </View>
          </HeroCard>

          {/* Audit Phase 7: a line of facts (an easy week, its records, or kg lifted against the
              last workout of its kind) — plain, with no coach heading or sparkle while the coach
              is hidden, and never food or sleep advice while nutrition is. */}
          {note ? (
            <Card>
              <Text style={{ fontFamily: type.body, fontSize: type.size.body, color: color.ink, lineHeight: 21 }}>
                {note}
              </Text>
            </Card>
          ) : null}

          {routineLine ? (
            <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary }}>{routineLine}</Text>
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
              fileName={`forgeai-workout-${data.session.dateISO}`}
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
