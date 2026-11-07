/**
 * Settings → Workouts → Plates and bars (Oct 2026): the plates the member's gym has and the bar
 * the plate calculator starts on. Opened from the Workouts page and from the plate calculator's
 * "Change plates" link. See `tracker/components/PlateSetupCard.tsx`. F194: the "Machine and cable
 * steps" line sits on top (`tracker/components/MachineStepCard.tsx`).
 */
import { SettingsPage } from '@/components/settings/SettingsPage';
import { MachineStepCard } from '@/tracker/components/MachineStepCard';
import { PlateSetupCard } from '@/tracker/components/PlateSetupCard';

export default function PlatesPage() {
  return (
    <SettingsPage title="Plates and bars">
      <MachineStepCard />
      <PlateSetupCard />
    </SettingsPage>
  );
}
