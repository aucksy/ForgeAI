/**
 * Settings → Reminders (redesign R6 "Notifications"; Release A, A10: the ONE reminders page). Workout
 * reminders (days, time, and "Turn on notifications" when Android blocks them), and with a gym joined,
 * "Reminders from my gym" (plan ending, birthday…), which used to sit away on the gym's page.
 */
import { GymMessagesSwitch, GymRemindersSwitch } from '@/components/settings/GymSettings';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { useGymShop } from '@/shop/gymStore';
import { RemindersCard } from '@/tracker/phone/PhoneCard';

export default function RemindersPage() {
  const gymName = useGymShop((s) => s.link?.gymName ?? null);
  return (
    <SettingsPage title="Reminders">
      <RemindersCard />
      {gymName ? <GymRemindersSwitch gymName={gymName} /> : null}
      {gymName ? <GymMessagesSwitch gymName={gymName} /> : null}
    </SettingsPage>
  );
}