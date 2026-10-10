/**
 * "Share routine" / "Share folder" (Phase 4): as text anyone can read, or as a file another
 * ForgeAI member opens with "Import a routine file".
 */

import type { PlanDayFull } from '@/db/repos/planRepo';
import { color } from '@/theme/tokens';
import { tell } from '@/lib/tell';

import { shareRoutinesAsFile, shareRoutinesAsText } from '../services/routineShare';
import { Glyph } from './TrackerGlyph';
import { SheetRow, TrackerSheet } from './TrackerSheet';

export function ShareRoutineSheet({
  visible,
  folder,
  routines,
  onClose,
}: {
  visible: boolean;
  /** The folder's name when a whole folder is shared, else null. */
  folder: string | null;
  routines: readonly PlanDayFull[];
  onClose: () => void;
}) {
  const fail = () => void tell('Could not share', 'Something went wrong. Please try again.');
  const title = folder ? `Share ${folder}` : `Share ${routines[0]?.name ?? 'routine'}`;
  return (
    <TrackerSheet visible={visible} title={title} subtitle="Text anyone can read, or a file another ForgeAI member can open." onClose={onClose}>
      <SheetRow
        label="Send as text"
        leading={<Glyph name="list" size={20} color={color.accent} />}
        onPress={() => {
          onClose();
          void shareRoutinesAsText(folder, routines).catch(fail);
        }}
      />
      <SheetRow
        label="Send as a file"
        leading={<Glyph name="image" size={20} color={color.accent} />}
        onPress={() => {
          onClose();
          void shareRoutinesAsFile(folder, routines)
            .then((ok) => {
              if (!ok) void tell('Sharing is not available', 'This phone has no app to send the file with.');
            })
            .catch(fail);
        }}
      />
    </TrackerSheet>
  );
}
