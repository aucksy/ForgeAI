/**
 * Redesign R2 — a feed card's ⋯ and its share button. The ⋯ offers Hevy's list: Save as
 * routine · Repeat workout · Edit workout · Share as a picture · Share as text · Delete workout
 * (asks first) — the same actions as the workout page (`useWorkoutActions`), never a copy. The
 * share button offers the two shares only. The workout is read when the menu opens.
 */
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { tell } from '@/lib/tell';
import { color, space, type } from '@/theme/tokens';

import { useWorkoutActions } from '../../lib/useWorkoutActions';
import { getSessionSummary, sessionTitle, type SessionSummaryData } from '../../services/finishSummary';
import { workoutText } from '../../services/shareText';
import { openActiveWorkout } from '../../services/workoutStart';
import { workoutShareScene } from '../../share/workoutCard';
import { workoutShareInput } from '../../share/workoutInput';
import { useTrackerPrefs } from '../../store/trackerPrefsStore';
import { FolderPickerSheet } from '../FolderPickerSheet';
import { ShareSheet } from '../ShareSheet';
import { shareTextNow } from '../ShareTextRow';
import { Glyph } from '../TrackerGlyph';
import { SheetRow, TrackerSheet } from '../TrackerSheet';

export interface FeedMenuRequest {
  id: string;
  mode: 'menu' | 'share';
}

/** Let one sheet slide away before the next slides up. */
const SLIDE_MS = 260;

export function FeedMenu({ request, onClose, onDeleted }: { request: FeedMenuRequest | null; onClose: () => void; onDeleted: () => void }) {
  const router = useRouter();
  // A tab: the workout screen goes ON TOP, so the tabs stay underneath.
  const actions = useWorkoutActions(router, () => void openActiveWorkout(router));
  const [data, setData] = useState<SessionSummaryData | null>(null);
  const [failed, setFailed] = useState(false);
  const [sharing, setSharing] = useState(false);
  const figure = useTrackerPrefs((s) => s.bodyFigure);
  const scene = useMemo(() => (data ? workoutShareScene({ ...workoutShareInput(data), figure }) : null), [data, figure]);

  // HI-13: a failed action says so (a card has no room under it, so the app's own sheet does).
  const { actionError, setActionError } = actions;
  useEffect(() => {
    if (!actionError) return;
    void tell('That didn’t work', actionError);
    setActionError(null);
  }, [actionError, setActionError]);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    if (!request) return undefined;
    // Review fix: read the workout afresh on EVERY open. Kept from an earlier open, an edit saved
    // since was undone by a second "Edit workout" (it started from the old sets), and Repeat,
    // Save as routine and Share used the old copy.
    setData(null);
    getSessionSummary(request.id)
      .then((d) => {
        if (alive) {
          setData(d);
          if (!d) setFailed(true);
        }
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
    // Each open is a new request object (the Profile sets a fresh one per tap).
  }, [request]);

  const close = (then?: () => void): void => {
    onClose();
    if (then) setTimeout(then, SLIDE_MS);
  };

  const title = data ? sessionTitle(data.session) : 'Workout';
  const shareRows = (
    <>
      <SheetRow
        label="Share as a picture"
        leading={<Glyph name="image" size={20} color={color.accent} />}
        onPress={() => close(() => setSharing(true))}
      />
      <SheetRow
        label="Share as text"
        leading={<Glyph name="share" size={20} color={color.accent} />}
        onPress={() => {
          const d = data;
          close(() => {
            if (d) void shareTextNow(() => workoutText(d), sessionTitle(d.session));
          });
        }}
      />
    </>
  );

  return (
    <>
      <TrackerSheet visible={request != null} title={request?.mode === 'share' ? 'Share' : title} onClose={() => close()}>
        {data ? (
          <View style={{ gap: 2 }}>
            {request?.mode === 'share' ? (
              shareRows
            ) : (
              <>
                <SheetRow
                  label="Save as routine"
                  leading={<Glyph name="list" size={20} color={color.accent} />}
                  onPress={() => close(actions.askSaveRoutine)}
                />
                <SheetRow
                  label="Repeat workout"
                  leading={<Glyph name="play" size={20} color={color.accent} />}
                  onPress={() => close(() => void actions.onRepeat(data))}
                />
                <SheetRow
                  label="Edit workout"
                  leading={<Glyph name="pencil" size={20} color={color.accent} />}
                  onPress={() => close(() => void actions.onEdit(data))}
                />
                {shareRows}
                <SheetRow
                  label="Delete workout"
                  danger
                  leading={<Glyph name="trash" size={20} color={color.criticalText} />}
                  onPress={() => {
                    const id = data.session.id;
                    close(() => void actions.onDelete(id, onDeleted));
                  }}
                />
              </>
            )}
          </View>
        ) : failed ? (
          <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkSecondary, paddingVertical: space.md }}>
            Couldn’t open this workout. It may have been deleted.
          </Text>
        ) : (
          <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkMuted, paddingVertical: space.md }}>Loading…</Text>
        )}
      </TrackerSheet>
      <FolderPickerSheet
        visible={actions.pickFolders != null}
        title="Where should the routine go?"
        folders={actions.pickFolders ?? []}
        onClose={actions.closeFolders}
        onPick={(folderId) => {
          const choices = actions.pickFolders ?? [];
          actions.closeFolders();
          const d = data;
          if (d) setTimeout(() => void actions.onSaveRoutine(d, folderId, choices), SLIDE_MS);
        }}
      />
      {scene && data ? (
        <ShareSheet visible={sharing} scene={scene} fileName={`forgeai-workout-${data.session.dateISO}`} onClose={() => setSharing(false)} />
      ) : null}
    </>
  );
}
