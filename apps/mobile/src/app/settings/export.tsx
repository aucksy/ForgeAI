/**
 * Settings → Your data → Save as a spreadsheet (Release A, A11): Save my history and Save my
 * measurements. Bringing workouts IN has its own page now (Bring in from Hevy or Strong).
 */
import { SaveHistoryCard, SaveMeasurementsCard } from '@/components/settings/BackupCard';
import { SettingsPage } from '@/components/settings/SettingsPage';

export default function ExportPage() {
  return (
    <SettingsPage title="Save as a spreadsheet">
      <SaveHistoryCard />
      <SaveMeasurementsCard />
    </SettingsPage>
  );
}