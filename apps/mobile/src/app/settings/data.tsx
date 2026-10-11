/** Settings → Your data (redesign R6): remove the demo, or erase everything. */
import { DataCard } from '@/components/settings/DataCard';
import { SettingsPage } from '@/components/settings/SettingsPage';

export default function DataPage() {
  return (
    <SettingsPage title="Your data">
      <DataCard />
    </SettingsPage>
  );
}
