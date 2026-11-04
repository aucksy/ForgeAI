/** Settings → Backup and restore → "Download my data" (R-123; renamed R-320): one file with everything, a copy for the member's records, to the share sheet. */
import { SaveBackupPanel } from '@/components/settings/BackupFilePanels';
import { SettingsPage } from '@/components/settings/SettingsPage';

export default function SaveBackupPage() {
  return (
    <SettingsPage title="Download my data">
      <SaveBackupPanel />
    </SettingsPage>
  );
}
