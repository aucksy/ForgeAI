/**
 * Profile → Workout: "Rest alerts: May be late — tap to fix" / "Off — notifications are blocked" /
 * "Silent — tap to fix" (Phase 2, packet D: D8, RT-01, RT-02; rest-alert audit 11 Oct 2026). One
 * tap opens the Android page that fixes it; read again whenever the app comes back to the front.
 * Renders NOTHING while rest alerts work (owner: defaults that just work) and where the state
 * cannot be known (web, a build without the rest module).
 */
import { useEffect, useState } from 'react';
import { AppState, Platform, Pressable } from 'react-native';

import { SettingRow } from '@/components/settings/SettingRow';
import { Icon } from '@/components/ui';
import { color } from '@/theme/tokens';

import { openFixFor, readAlertAccess, restAlertStatus, showAlertStatus, statusText, type RestAlertStatus } from '../services/restAlertAccess';

export function RestAlertsStatusRow({ divider }: { divider?: boolean }) {
  const [status, setStatus] = useState<RestAlertStatus>('unknown');

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let live = true;
    const check = (): void => {
      void readAlertAccess()
        .then((a) => {
          if (live) setStatus(restAlertStatus(a));
        })
        .catch(() => undefined);
    };
    check();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') check();
    });
    return () => {
      live = false;
      sub.remove();
    };
  }, []);

  // Rest-alert audit (owner: "defaults that just work"): nothing to show while alerts work.
  if (!showAlertStatus(status)) return null;
  const words = statusText(status);
  const row = (
    <SettingRow
      icon="volume"
      title={words.title}
      caption={words.caption}
      divider={divider}
      right={<Icon name="chevron-right" size={18} color={color.inkMuted} />}
    />
  );
  return (
    <Pressable
      onPress={() => openFixFor(status)}
      accessibilityRole="button"
      accessibilityLabel={`${words.title}. ${words.caption}`}
      style={{ minHeight: 48 }}
    >
      {row}
    </Pressable>
  );
}

