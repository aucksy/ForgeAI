/**
 * Settings → Backup (redesign R6): ForgeAI's own copy of the workouts once the member signs in with
 * Google (tracker #50, AccountCard), Android's backup of the workouts, photos in it or not, and
 * Drive when the build carries it (an optional extra copy).
 */
import { AccountCard } from '@/components/settings/AccountCard';
import { BackupCard } from '@/components/settings/BackupCard';
import { SettingsPage } from '@/components/settings/SettingsPage';

export default function BackupPage() {
  return (
    <SettingsPage title="Backup">
      <AccountCard />
      <BackupCard />
    </SettingsPage>
  );
}
