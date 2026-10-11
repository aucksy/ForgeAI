/** Settings → Backup (redesign R6): Android's backup of the workouts, photos in it or not, and Drive when the build carries it. */
import { BackupCard } from '@/components/settings/BackupCard';
import { SettingsPage } from '@/components/settings/SettingsPage';

export default function BackupPage() {
  return (
    <SettingsPage title="Backup">
      <BackupCard />
    </SettingsPage>
  );
}
