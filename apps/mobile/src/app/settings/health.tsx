/** Settings → Health Connect (redesign R6): send each finished workout to Google Fit and Samsung Health. */
import { SettingsPage } from '@/components/settings/SettingsPage';
import { HealthCard } from '@/tracker/phone/PhoneCard';

export default function HealthPage() {
  return (
    <SettingsPage title="Health Connect">
      <HealthCard />
    </SettingsPage>
  );
}
