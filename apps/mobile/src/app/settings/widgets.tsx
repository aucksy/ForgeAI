/** Settings → Widgets (redesign R6): Today and This week on the home screen. */
import { SettingsPage } from '@/components/settings/SettingsPage';
import { WidgetsCard } from '@/tracker/phone/PhoneCard';

export default function WidgetsPage() {
  return (
    <SettingsPage title="Widgets">
      <WidgetsCard />
    </SettingsPage>
  );
}
