/**
 * Post-workout summary. Phase 2 (LW-21): the answer leads in one line (time · sets · kg lifted ·
 * records); long lists fold. LW-11: Finish lands here at once, and the "Update routine?"
 * question worked out on the workout screen is asked here, in the app's own sheet.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import {
  askConfirm,
  EmptyState,
  GhostButton,
  GlassCard,
  HeroCard,
  Icon,
  PrimaryButton,
  Screen,
  Skeleton,
} from '@/components/ui';
import { fmtInt } from '@/lib/format';
import { useUnits } from '@/lib/useUnits';
import { color, gradients, radius, space, type } from '@/theme/tokens';

import { SessionSummary } from '@/tracker/components/SessionSummary';
import { ShareSheet } from '@/tracker/components/ShareSheet';
import { getCloudCoachNote, getSessionCoachNote } from '@/tracker/services/coachNote';
import { finishAnswer, getSessionSummary, sessionTitle, volumeComparison } from '@/tracker/services/finishSummary';
import { applyRoutineOffer, takeRoutineOffer } from '@/tracker/services/routineOffer';
import type { SessionSummaryData } from '@/tracker/services/finishSummary';
import { workoutShareScene } from '@/tracker/share/workoutCard';
import { workoutShareInput } from '@/tracker/share/workoutInput';
import { useTrackerPrefs } from '@/tracker/store/trackerPrefsStore';

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

  // Coach note (Phase C2): show the deterministic engine line as soon as the
  // summary loads, then — only if the user opted in AND a Groq key is set — swap
  // in a richer AI note when it arrives. Never blocks; falls back silently.
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

  const comparison = data ? volumeComparison(data.totalVolumeKg) : null;

  return (
    <Screen title="Workout complete" subtitle="Saved to your history.">
      {loading ? (
        <View style={{ gap: space.lg }}>
          <Skeleton width="100%" height={128} radius={radius.xl} />
          <Skeleton width="100%" height={180} radius={radius.lg} />
        </View>
      ) : data ? (
        <View style={{ gap: space.lg }}>
          <HeroCard gradient={gradients.ember}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <Icon name="trophy" size={28} color="#1F0D05" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: type.displaySemi, fontSize: type.size.h2, color: '#1F0D05' }}>
                  {sessionTitle(data.session)} done
                </Text>
                <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: 'rgba(31,13,5,0.72)' }}>
                  {finishAnswer(data)}
                </Text>
                {comparison ? (
                  <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: 'rgba(31,13,5,0.6)', marginTop: 2 }}>
                    That's about {comparison}.
                  </Text>
                ) : null}
              </View>
            </View>
          </HeroCard>

          {note ? (
            <GlassCard>
              <View style={{ flexDirection: 'row', gap: space.md }}>
                <Icon name="sparkle" size={20} color={color.accentBright} />
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: type.bodySemi,
                      fontSize: type.size.caption,
                      letterSpacing: 0.4,
                      color: color.inkMuted,
                      marginBottom: 3,
                    }}
                  >
                    COACH
                  </Text>
                  <Text
                    style={{
                      fontFamily: type.body,
                      fontSize: type.size.body,
                      color: color.ink,
                      lineHeight: 21,
                    }}
                  >
                    {note}
                  </Text>
                </View>
              </View>
            </GlassCard>
          ) : null}

          {routineLine ? (
            <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary }}>{routineLine}</Text>
          ) : null}

          {/* The totals already lead in the card above — no second copy in tiles. */}
          <SessionSummary data={data} showTotals={false} />

          <View style={{ gap: space.md, marginTop: space.sm }}>
            <PrimaryButton label="Done" icon="check" onPress={() => router.replace('/')} />
            <GhostButton label="Share workout" icon="send" onPress={() => setSharing(true)} />
            <GhostButton label="View history" icon="calendar" onPress={() => router.replace('/history')} />
          </View>
          {scene ? (
            <ShareSheet
              visible={sharing}
              scene={scene}
              fileName={`forgeai-workout-${data.session.dateISO}`}
              title="Share your workout"
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
          <PrimaryButton label="Done" icon="check" onPress={() => router.replace('/')} />
        </View>
      )}
    </Screen>
  );
}
