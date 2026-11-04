/**
 * Android's own backup of this phone (the workout count and "Include photos in my backup").
 * R-320: no Settings row links here any more (the Backup page shows only the MettleUp account); the page
 * stays so the cloud check of Android's backup (qa part M, backup-m-*.yaml) can open it by its link.
 */
import { PhoneBackupCard } from '@/components/settings/BackupCard';
import { SettingsPage } from '@/components/settings/SettingsPage';

export default function PhoneBackupPage() {
  return (
    <SettingsPage title="This phone's backup">
      <PhoneBackupCard />
    </SettingsPage>
  );
}
