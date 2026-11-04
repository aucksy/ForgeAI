/**
 * Settings → Backup and restore → "Bring back a Google Drive backup" (R-320): only brings an old Drive
 * backup to this phone; nothing backs up to Drive any more. TODO(R-320, remove ~Feb 2027).
 */
import { DriveRestoreCard } from '@/components/settings/BackupCard';
import { SettingsPage } from '@/components/settings/SettingsPage';

export default function DriveRestorePage() {
  return (
    <SettingsPage title="Google Drive backup">
      <DriveRestoreCard />
    </SettingsPage>
  );
}
