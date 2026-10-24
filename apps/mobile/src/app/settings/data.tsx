/** Settings → Your data → Erase or start over (redesign R6; renamed in Release A): remove the demo, or erase everything. */
import { DataCard } from '@/components/settings/DataCard';
import { SettingsPage } from '@/components/settings/SettingsPage';

export default function DataPage() {
  return (
    <SettingsPage title="Erase or start over">
      <DataCard />
    </SettingsPage>
  );
}