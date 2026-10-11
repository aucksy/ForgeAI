/** Settings → Export & import (redesign R6): Save my history, then Import from Hevy / Strong and Import routines. */
import { SaveHistoryCard } from '@/components/settings/BackupCard';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { ImportCard } from '@/tracker/components/ImportCard';

export default function ExportPage() {
  return (
    <SettingsPage title="Export & import">
      <SaveHistoryCard />
      <ImportCard />
    </SettingsPage>
  );
}
