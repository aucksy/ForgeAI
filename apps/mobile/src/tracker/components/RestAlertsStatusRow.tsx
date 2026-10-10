/**
 * Profile → Workout: "Rest alerts: On time" / "May be late — tap to fix" / "Off — notifications
 * are blocked" (Phase 2, packet D: D8, RT-01, RT-02). One tap opens the Android page that fixes
 * it; the line is read again whenever the app comes back to the front (after that page).
 * Renders nothing where the state cannot be known (web, a build without the rest module).
 */
import { useEffect, useState } from 'react';
import { AppState, Platform, Pressable } from 'react-native';

import { SettingRow } from '@/components/settings/SettingRow';
import { Icon } from '@/components/ui';
import { color } from '@/theme/tokens';

import { openFixFor, readAlertAccess, restAlertStatus, statusText, type RestAlertStatus } from '../services/restAlertAccess';

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

  if (status === 'unknown') return null;
  const words = statusText(status);
  const fixable = status !== 'on-time';
  const row = (
    <SettingRow
      icon="volume"
      title={words.title}
      caption={words.caption}
      divider={divider}
      right={fixable ? <Icon name="chevron-right" size={18} color={color.inkMuted} /> : undefined}
    />
  );
  if (!fixable) return row;
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

