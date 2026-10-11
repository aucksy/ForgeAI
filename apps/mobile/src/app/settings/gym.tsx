/** Settings → Your gym (redesign R6): the member's gym (gym sync stays hidden behind its flag, D4). */
import { CloudCard } from '@/components/settings/CloudCard';
import { GymCard } from '@/components/settings/GymCard';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { FEATURES, profileParts } from '@/lib/features';

const PARTS = new Set(profileParts(FEATURES));

export default function GymPage() {
  return (
    <SettingsPage title="Your gym">
      <GymCard />
      {PARTS.has('gymSync') ? <CloudCard /> : null}
    </SettingsPage>
  );
}
