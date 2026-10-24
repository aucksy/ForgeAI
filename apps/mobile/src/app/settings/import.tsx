/**
 * Settings → Your data → Bring in from Hevy or Strong (Release A, A11): the ONE home for bringing your
 * past workouts and routines in. Find a plan links here too, and the empty app's "Moving from Hevy or
 * Strong?" card stays.
 */
import { SettingsPage } from '@/components/settings/SettingsPage';
import { ImportCard } from '@/tracker/components/ImportCard';

export default function ImportPage() {
  return (
    <SettingsPage title="Bring in from Hevy or Strong">
      <ImportCard />
    </SettingsPage>
  );
}