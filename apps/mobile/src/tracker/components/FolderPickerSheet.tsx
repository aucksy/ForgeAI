/**
 * "Where should it go?" — audit Phase 4 (RP-08). A new, saved or copied routine never joins the
 * followed plan by itself: the member picks a folder; "My routines" (not followed) is first and
 * the plan says what joining it means.
 */
import { ScrollView } from 'react-native';

import { Icon } from '@/components/ui';
import { color } from '@/theme/tokens';

import { folderChoices } from '../services/folderChoice';
import { Glyph } from './TrackerGlyph';
import { SheetRow, TrackerSheet } from './TrackerSheet';

export function FolderPickerSheet({
  visible,
  title,
  folders,
  onPick,
  onClose,
}: {
  visible: boolean;
  title: string;
  folders: readonly { id: string; name: string; following: boolean; routines: readonly unknown[] }[];
  /** null = "My routines" (made when missing). */
  onPick: (folderId: string | null) => void;
  onClose: () => void;
}) {
  return (
    <TrackerSheet visible={visible} title={title} subtitle="Your plan only changes if you pick it." onClose={onClose}>
      <ScrollView style={{ maxHeight: 400 }} nestedScrollEnabled contentContainerStyle={{ gap: 2 }}>
        {folderChoices(folders).map((c) => (
          <SheetRow
            key={c.folderId ?? 'mine'}
            label={c.label}
            value={c.value}
            leading={c.following ? <Icon name="target" size={18} color={color.accent} /> : <Glyph name="list" size={18} color={color.accent} />}
            onPress={() => onPick(c.folderId)}
          />
        ))}
      </ScrollView>
    </TrackerSheet>
  );
}
