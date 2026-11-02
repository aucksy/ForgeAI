/**
 * Settings → Your data → "Backup and restore" (R-284, 2 Nov 2026 UAT: backup was in three places).
 * One page for every copy of the workouts: MettleUp's own copy once the member signs in with Google
 * (tracker #50, AccountCard), Android's backup and Drive (BackupCard), then the backup FILE's two pages
 * (R-123: save one, restore from one).
 */
import { useRouter, type Href } from 'expo-router';
import { useRef } from 'react';

import { AccountCard } from '@/components/settings/AccountCard';
import { BackupCard } from '@/components/settings/BackupCard';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { BACKUP_FILE_ROWS } from '@/components/settings/settingsLines';
import { LinkRow } from '@/components/stats/parts';
import { navigateOnce } from '@/lib/guardedAction';

// member-words: what the file is for, in one line under each row.
const FILE_LINES: Record<string, string> = {
  saveBackup: 'One file with everything, to keep anywhere',
  restoreBackup: 'Bring your workouts back from a backup file',
};

export default function BackupPage() {
  const router = useRouter();
  const busy = useRef(false);
  return (
    <SettingsPage title="Backup and restore">
      <AccountCard />
      <BackupCard />
      {BACKUP_FILE_ROWS.map((r) => (
        <LinkRow
          key={r.key}
          title={r.title}
          sub={FILE_LINES[r.key]}
          onPress={() => navigateOnce(busy, () => router.push(r.href as Href))}
        />
      ))}
    </SettingsPage>
  );
}
