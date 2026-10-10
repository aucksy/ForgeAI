/**
 * Profile → Backup → "Include photos in my backup" (audit PG-17, owner decision D11 = A).
 * Default OFF. On: the newest progress photos that fit are copied into the folder Android's
 * own backup carries, capped so the whole backup stays well under Android's 25 MB limit (over
 * it, Android backs up nothing at all). The card says exactly what is covered:
 * "Backing up your newest 42 photos (15 MB)". Off: the copies are deleted.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { Card } from '@/components/ui';
import { color, space, type } from '@/theme/tokens';
import { isPhotoBackupOn, syncPhotoBackup, togglePhotoBackup } from '@/tracker/services/photoBackup';
import { photoBackupLine } from '@/tracker/services/photoBackupPlan';

import { ToggleRow } from './SettingRow';

/**
 * Review fix (Phase 5): the switch always ends on the STORED choice. Before, a copy run that
 * failed after "on" was saved flipped the switch back to "off" while the setting stayed on.
 * Copy runs go one at a time in the service; "off" waits for a running one, then deletes.
 */
export function PhotoBackupCard() {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Only the newest read or toggle may write the card (an on-focus run can finish late).
  const req = useRef(0);

  const refresh = useCallback(async (): Promise<void> => {
    const id = ++req.current;
    const now = await isPhotoBackupOn();
    if (req.current !== id) return;
    setOn(now);
    if (!now) {
      setLine(null);
      return;
    }
    setLine('Checking your photos…');
    const state = await syncPhotoBackup();
    const stored = await isPhotoBackupOn();
    if (req.current !== id) return;
    setOn(stored);
    setLine(stored ? photoBackupLine(state) : null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh().catch(() => setLine(null));
    }, [refresh]),
  );

  const onChange = async (next: boolean): Promise<void> => {
    if (busy) return;
    const id = ++req.current;
    setBusy(true);
    setError(null);
    setOn(next);
    setLine(next ? 'Copying your newest photos…' : null);
    try {
      const r = await togglePhotoBackup(next);
      if (req.current !== id) return;
      setOn(r.on);
      setLine(r.on && r.state ? photoBackupLine(r.state) : null);
      if (r.failed) {
        setError(r.on === next && next ? 'Couldn’t copy your photos just now. It tries again next time you open the app.' : 'Couldn’t change this. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <ToggleRow
        title="Include photos in my backup"
        caption="Your newest progress photos go into Android’s backup to your Google account, as far as room allows."
        value={on}
        onChange={(v) => void onChange(v)}
      />
      <View style={{ gap: space.xs }}>
        {line ? <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkSecondary, lineHeight: 19 }}>{line}</Text> : null}
        {!on ? (
          <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted, lineHeight: 16 }}>
            Off: photos stay on this phone only. To keep one anywhere else, open it and tap “Save to phone gallery”.
          </Text>
        ) : (
          <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted, lineHeight: 16 }}>
            Android’s backup holds 25 MB for the whole app, so older photos may not fit. Turning this off deletes the copies.
          </Text>
        )}
        {error ? <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.criticalText }}>{error}</Text> : null}
      </View>
    </Card>
  );
}
