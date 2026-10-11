/** Settings → Your details (redesign R6): name, mobile, gym, goal, experience, age, height. */
import { ProfileCard } from '@/components/settings/ProfileCard';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { useDashboard } from '@/store/dashboardStore';

export default function DetailsPage() {
  return (
    <SettingsPage title="Your details">
      <ProfileCard onSaved={() => void useDashboard.getState().refresh().catch(() => undefined)} />
    </SettingsPage>
  );
}
