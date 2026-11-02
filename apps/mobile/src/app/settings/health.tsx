/** Settings → Phone and watch → Health apps (redesign R6; R-284 renamed from "Health Connect"): send each finished workout to Google Health and Samsung Health. */
import { SettingsPage } from '@/components/settings/SettingsPage';
import { HealthCard } from '@/tracker/phone/PhoneCard';

export default function HealthPage() {
  return (
    <SettingsPage title="Health apps">
      <HealthCard />
    </SettingsPage>
  );
}
