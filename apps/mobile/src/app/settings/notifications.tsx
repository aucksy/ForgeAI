/** Settings → Notifications (redesign R6): workout reminders — days, time, and "Turn on notifications" when Android blocks them. */
import { SettingsPage } from '@/components/settings/SettingsPage';
import { RemindersCard } from '@/tracker/phone/PhoneCard';

export default function NotificationsPage() {
  return (
    <SettingsPage title="Notifications">
      <RemindersCard />
    </SettingsPage>
  );
}
