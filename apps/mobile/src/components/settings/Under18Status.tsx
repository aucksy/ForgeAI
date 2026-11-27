/**
 * R-630 slice A (design note 3a): in place of the backup card once the member confirmed an age under 18. One line
 * that says where the delete stands; "Deleted" only after the server confirmed every part. "Try again" while it waits.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { under18DeleteWords } from '@/cloud/ageRule';
import { jobState, STAFF_LOGIN_WORDS } from '@/cloud/under18Job';
import { Card, GhostButton } from '@/components/ui';
import { useGymShop } from '@/shop/gymStore';
import { color, space, type } from '@/theme/tokens';

type Shown = ReturnType<typeof jobState>;

/** The job's state, or null when there is no under-18 delete on this phone (the normal card shows). */
export function useUnder18State(): [Shown | null, () => Promise<void>] {
  const [state, setState] = useState<Shown | null>(null);
  const reload = useCallback(async () => {
    try {
      const { readUnder18Job } = await import('@/cloud/under18Run');
      const job = await readUnder18Job();
      setState(job ? jobState(job) : null);
    } catch (e) {
      console.warn('[under18] could not read the delete job', e);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );
  return [state, reload];
}

export function Under18Status({ state, onChanged }: { state: Shown; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const retry = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      const { runUnder18Job } = await import('@/cloud/under18Run');
      await runUnder18Job(useGymShop.getState().link ?? null);
      await onChanged();
    } finally {
      setBusy(false);
    }
  };
  const line = state === 'staff' ? STAFF_LOGIN_WORDS : under18DeleteWords(state);
  return (
    <Card>
      <Text accessibilityLiveRegion="polite" style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, lineHeight: 19 }}>
        {line}
      </Text>
      {state === 'signInNeeded' ? (
        <View style={{ marginTop: space.md }}>
          <GhostButton
            label={busy ? 'Signing in…' : 'Sign in once to delete'}
            onPress={() =>
              void (async () => {
                if (busy) return;
                setBusy(true);
                try {
                  const { useAccount } = await import('@/store/accountStore');
                  await useAccount.getState().signIn();
                  await onChanged();
                } finally {
                  setBusy(false);
                }
              })()
            }
          />
        </View>
      ) : null}
      {state === 'offline' || state === 'failed' ? (
        <View style={{ marginTop: space.md }}>
          <GhostButton label={busy ? 'Trying…' : 'Try again'} onPress={() => void retry()} />
        </View>
      ) : null}
    </Card>
  );
}
