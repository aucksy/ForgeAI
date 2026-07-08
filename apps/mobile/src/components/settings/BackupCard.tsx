import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { isDriveConfigured } from '@/cloud/drive';
import { Card, GhostButton, Icon, PrimaryButton } from '@/components/ui';
import { success, warn } from '@/lib/haptics';
import { useBackup } from '@/store/backupStore';
import { useChat } from '@/store/chatStore';
import { useDashboard } from '@/store/dashboardStore';
import { color, space, type } from '@/theme/tokens';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** ISO → "8 Jul 2026, 14:30" without relying on Intl (spotty on RN Android). */
function fmtWhen(iso: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unknown';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${hh}:${mm}`;
}

function Body({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{
        fontFamily: type.body,
        fontSize: type.size.sub,
        color: color.inkSecondary,
        marginTop: space.xs,
        lineHeight: 19,
      }}
    >
      {children}
    </Text>
  );
}

/**
 * "Back up & restore" — member-owned FULL-history backup to the user's OWN Google
 * Drive, so a reinstall / new phone can restore everything. Independent of gym sync
 * (Supabase only holds the summary). Hidden until the build carries a Google client
 * id, so the offline demo never shows an online-only feature it can't perform, and
 * never makes a network call until the user explicitly links Google.
 */
export function BackupCard() {
  const email = useBackup((s) => s.googleEmail);
  const lastBackupAt = useBackup((s) => s.lastBackupAt);
  const busy = useBackup((s) => s.busy);
  const init = useBackup((s) => s.init);
  const linkGoogle = useBackup((s) => s.linkGoogle);
  const unlinkGoogle = useBackup((s) => s.unlinkGoogle);
  const backupNow = useBackup((s) => s.backupNow);
  const checkForBackup = useBackup((s) => s.checkForBackup);
  const restoreFound = useBackup((s) => s.restoreFound);
  const clearFound = useBackup((s) => s.clearFound);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void init();
  }, [init]);

  // Hidden unless the build carries a real Google Web client id (owner-set).
  if (!isDriveConfigured()) return null;

  const onLink = async () => {
    setError(null);
    try {
      const linked = await linkGoogle();
      if (linked) success();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not link Google Drive.');
    }
  };

  const onBackup = async () => {
    setError(null);
    try {
      await backupNow();
      success();
      Alert.alert('Backed up', 'Your full history is saved to your Google Drive.');
    } catch (e) {
      warn();
      setError(e instanceof Error ? e.message : 'Backup failed — please try again.');
    }
  };

  const doRestore = async () => {
    try {
      const applied = await restoreFound();
      if (!applied) {
        // Nothing was actually restored (e.g. a duplicate confirm) — don't lie.
        Alert.alert('Nothing to restore', 'That backup was already applied.');
        return;
      }
      // Rehydrate the in-memory stores from the restored DB (same as reset flow).
      await Promise.all([useDashboard.getState().refresh(), useChat.getState().load()]);
      success();
      Alert.alert('Restored', 'Your history is back on this phone.');
    } catch (e) {
      warn();
      Alert.alert('Restore failed', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  const onRestore = async () => {
    setError(null);
    try {
      const { found } = await checkForBackup();
      if (!found) {
        Alert.alert('No backup found', 'There’s no ForgeAI backup in this Google account yet.');
        return;
      }
      const info = useBackup.getState().found;
      const detail = info
        ? ` from ${fmtWhen(info.exportedAt)} (${info.workouts} workouts, ${info.meals} meals)`
        : '';
      Alert.alert(
        'Restore from Drive?',
        `This replaces everything on this phone with your backup${detail}. This can’t be undone.`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => clearFound() },
          { text: 'Restore', style: 'destructive', onPress: () => void doRestore() },
        ],
      );
    } catch (e) {
      warn();
      setError(e instanceof Error ? e.message : 'Could not read your Drive backup.');
    }
  };

  const errorNode = error ? (
    <Text
      style={{
        fontFamily: type.bodyMedium,
        fontSize: type.size.caption,
        color: color.criticalText,
        marginTop: space.md,
      }}
    >
      {error}
    </Text>
  ) : null;

  if (!email) {
    return (
      <Card>
        <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
          Back up &amp; restore
        </Text>
        <Body>
          Save your full history to your own Google Drive so you never lose it if you reinstall or
          switch phones. Your backup stays private to your Google account.
        </Body>
        {errorNode}
        <View style={{ marginTop: space.lg }}>
          <PrimaryButton
            label={busy ? 'Linking…' : 'Link Google Drive'}
            icon="globe"
            loading={busy}
            disabled={busy}
            onPress={() => void onLink()}
          />
        </View>
      </Card>
    );
  }

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Icon name="check" size={18} color={color.good} />
        <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
          Backup on
        </Text>
      </View>
      <Body>
        Linked to {email}. Last backup: {fmtWhen(lastBackupAt)}.
      </Body>
      <View style={{ marginTop: space.lg, gap: space.sm }}>
        <PrimaryButton
          label={busy ? 'Working…' : 'Back up now'}
          icon="sparkle"
          loading={busy}
          disabled={busy}
          onPress={() => void onBackup()}
        />
        <GhostButton
          label="Restore from Drive"
          icon="clock"
          onPress={() => {
            if (busy) return; // GhostButton has no disabled state — gate concurrent actions here
            void onRestore();
          }}
        />
        <GhostButton
          label="Unlink Google"
          icon="close"
          onPress={() => {
            if (busy) return;
            void unlinkGoogle();
          }}
        />
      </View>
      {errorNode}
    </Card>
  );
}
