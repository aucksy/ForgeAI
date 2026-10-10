/**
 * Sending and opening routine files on the phone — Phase 4. The format and the text are
 * pure (`plans/routineFile.ts`); this file is the device side: the share menu for text or a
 * file, and the file picker for an import.
 */
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Share } from 'react-native';

import type { PlanDayFull } from '@/db/repos/planRepo';
import { SHARE_FOLDER } from '@/lib/tempPictures';

import { parseRoutineFile, ROUTINE_FILE_MAX_BYTES, routineFileJson, routineFileName, routinesText } from '../plans/routineFile';
import { existingFileFolder, importRoutineFile, routineFileOf, sharedRoutinesOf, type ExistingChoice, type ImportResult } from './plansService';

/** Send the routines as plain text (WhatsApp, a note…). */
export async function shareRoutinesAsText(folder: string | null, routines: readonly PlanDayFull[]): Promise<void> {
  const text = routinesText(folder, await sharedRoutinesOf(routines));
  await Share.share({ message: text, title: folder ?? routines[0]?.name ?? 'Routine' });
}

/** Send the routines as a file another ForgeAI member can import. */
export async function shareRoutinesAsFile(folder: string | null, routines: readonly PlanDayFull[]): Promise<boolean> {
  const file = await routineFileOf(folder, routines);
  // The share pictures' folder, which "Erase all data" empties (lib/tempPictures).
  const dir = `${FileSystem.cacheDirectory ?? ''}${SHARE_FOLDER}`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
  const uri = `${dir}${routineFileName(folder ?? routines[0]?.name ?? 'routine')}`;
  await FileSystem.writeAsStringAsync(uri, routineFileJson(file));
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'Share routine' });
  return true;
}

/**
 * Pick a routine file and add it as a new folder. null when the member cancelled; a
 * plain-English Error when the file cannot be used.
 */
export async function pickAndImportRoutineFile(
  /** RP-18: asked when this file was imported before — "update" that folder, add a "copy", or null to stop. */
  choose?: (folderName: string) => Promise<ExistingChoice | null>,
): Promise<ImportResult | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['*/*'], copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets || res.assets.length === 0) return null;
  // A photo or a video picked by mistake must not be read into memory whole.
  const size = res.assets[0].size ?? (await FileSystem.getInfoAsync(res.assets[0].uri).then((i) => (i.exists ? i.size : 0)).catch(() => 0));
  if (size > ROUTINE_FILE_MAX_BYTES) throw new Error('That file is too big to be a routine file.');
  const text = await FileSystem.readAsStringAsync(res.assets[0].uri);
  const parsed = parseRoutineFile(text);
  if (!parsed.ok) throw new Error(parsed.reason);
  const before = await existingFileFolder(parsed.file);
  if (before && choose) {
    const pick = await choose(before.name);
    if (!pick) return null;
    return importRoutineFile(parsed.file, { existing: pick });
  }
  return importRoutineFile(parsed.file);
}
