/**
 * R-260: the launch pop-up "Update MettleUp" (when: lib/updatePrompt.ts; what: lib/updateStore.ts).
 * Mounted once under the tabs, so it never shows on the welcome screens. It also checks again when the
 * app comes back after 6 hours away, and lets a finished Play download install when the app leaves.
 */
import { useEffect, useRef } from 'react';
import { AppState, Text, View } from 'react-native';

import { GhostButton, PrimaryButton, Sheet } from '@/components/ui';
import { installDownloadedQuietly, useAppUpdate } from '@/lib/updateStore';
import { color, space, type } from '@/theme/tokens';
import { phoneNative } from '@/tracker/phone/native';
import { useActiveWorkout } from '@/tracker/store/activeWorkoutStore';

const RECHECK_MS = 6 * 60 * 60 * 1000;

export const UPDATE_WORDS = {
  title: 'Update MettleUp',
  github: 'A new version is ready. Tap "Update" to download the file, then open it to install. Your workouts stay safe.',
  play: 'A new version is ready. Tap "Update" to download it while you keep using the app. Your workouts stay safe.',
  restartTitle: 'The new version is ready to install',
  restart: 'Tap "Restart now" to open the new version. It takes a few seconds. Your workouts stay safe.',
  update: 'Update',
  restartNow: 'Restart now',
  later: 'Later',
} as const;

export function UpdatePrompt() {
  const popup = useAppUpdate((s) => s.popup);
  const kind = useAppUpdate((s) => s.kind);
  const playStatus = useAppUpdate((s) => s.playStatus);
  const busy = useAppUpdate((s) => s.busy);
  const workout = useActiveWorkout((s) => s.active != null);
  const lastCheck = useRef(0);

  useEffect(() => {
    const run = (launch: boolean) => {
      lastCheck.current = Date.now();
      void useActiveWorkout
        .getState()
        .hydrate()
        .catch((e: unknown) => console.warn('[update] workout state not read before the check', e))
        .then(() => useAppUpdate.getState().check({ launch }));
    };
    run(true);
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'background') installDownloadedQuietly();
      if (st === 'active' && Date.now() - lastCheck.current > RECHECK_MS) run(true);
    });
    const native = phoneNative();
    const play = native?.playUpdateCheck ? native.addListener('onPlayUpdate', (e) => useAppUpdate.getState().setPlayStatus(e.status)) : null;
    return () => {
      sub.remove();
      play?.remove();
    };
  }, []);

  // A workout opened while the pop-up was up (a shortcut, the watch): it gives way.
  useEffect(() => {
    if (workout && popup) useAppUpdate.getState().laterPopup();
  }, [workout, popup]);

  if (!kind) return null;
  const restart = kind === 'play' && playStatus === 'downloaded';
  const body = restart ? UPDATE_WORDS.restart : kind === 'github' ? UPDATE_WORDS.github : UPDATE_WORDS.play;
  const close = () => useAppUpdate.getState().laterPopup();
  return (
    <Sheet
      visible={popup && !workout}
      title={restart ? UPDATE_WORDS.restartTitle : UPDATE_WORDS.title}
      onClose={close}
      closeLabel="Later"
      footer={
        <View style={{ gap: space.sm }}>
          <PrimaryButton
            label={restart ? UPDATE_WORDS.restartNow : UPDATE_WORDS.update}
            loading={busy}
            onPress={() => void useAppUpdate.getState().update()}
          />
          <GhostButton label={UPDATE_WORDS.later} onPress={close} />
        </View>
      }
    >
      <Text style={{ fontFamily: type.body, fontSize: type.size.body, lineHeight: 22, color: color.inkSecondary }}>{body}</Text>
    </Sheet>
  );
}
