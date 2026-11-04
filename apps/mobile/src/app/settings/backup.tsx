/**
 * Settings → Your data → "Backup and restore".
 *
 * R-320 (owner, 4 Nov 2026: "Backups - Lets go with A"; R-319: two backup options looked unprofessional):
 * ONE backup, the MettleUp account (AccountCard: sign in with Google, then every workout is saved by
 * itself). Below it, the member's own copy for their records ("Download my data", the backup file) and
 * bringing a saved file back. Google Drive backup is no longer offered: a member with an old Drive backup
 * (a new phone) brings it in with the small link at the bottom, while one is still possible.
 * TODO(R-320, remove ~Feb 2027): the "Bring back a Google Drive backup" link and its page.
 */
import { useRouter, type Href } from 'expo-router';
import { useRef } from 'react';
import { Pressable, Text } from 'react-native';

import { isDriveConfigured } from '@/cloud/drive';
import { AccountCard } from '@/components/settings/AccountCard';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { BACKUP_FILE_ROWS } from '@/components/settings/settingsLines';
import { LinkRow } from '@/components/stats/parts';
import { navigateOnce } from '@/lib/guardedAction';
import { color, type } from '@/theme/tokens';

// member-words: what each file row does for them, one line. "Download my data" is a copy, not a backup.
const BACKUP_PAGE_WORDS = {
  saveBackup: 'One file with everything, a copy for your own records',
  restoreBackup: 'Bring your workouts back from a file you saved',
  driveLink: 'Bring back a Google Drive backup',
} as const;

export default function BackupPage() {
  const router = useRouter();
  const busy = useRef(false);
  const go = (href: string | undefined): void => {
    if (href) navigateOnce(busy, () => router.push(href as Href));
  };
  return (
    <SettingsPage title="Backup and restore">
      <AccountCard />
      {BACKUP_FILE_ROWS.map((r) => (
        <LinkRow key={r.key} title={r.title} sub={BACKUP_PAGE_WORDS[r.key as 'saveBackup' | 'restoreBackup']} onPress={() => go(r.href)} />
      ))}
      {isDriveConfigured() ? (
        <Pressable accessibilityRole="link" onPress={() => go('/settings/drive-restore')} style={{ minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' }}>
          <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkSecondary, textDecorationLine: 'underline' }}>
            {BACKUP_PAGE_WORDS.driveLink}
          </Text>
        </Pressable>
      ) : null}
    </SettingsPage>
  );
}
