/**
 * Explore — redesign R4 (Hevy's Explore). The Workout tab's "Explore" opens here: the plan
 * builder first ("Build a plan" from the member's goal, days, equipment and sore spots), then the
 * ready programs in three groups (a full gym, dumbbells only, home), each from beginner to
 * advanced — tap one to see its routines, then follow it or keep it in your routines ("Save"
 * makes a folder). At the bottom, the ways to bring routines in that used to sit behind the old
 * Routines screen's "+": a routine file someone shared, and a Hevy share link.
 */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { goBack } from '@/lib/goBack';
import { tell } from '@/lib/tell';
import { Card, Icon, Screen, SectionHeader, type IconName } from '@/components/ui';
import { color, space, type } from '@/theme/tokens';

import { SheetRow, TrackerSheet } from '@/tracker/components/TrackerSheet';
import { routineFileProblemText } from '@/tracker/plans/routineFile';
import { routineSaveFailureText } from '@/tracker/services/routineImport';
import { programGroups, programMeta } from '@/tracker/plans/programs';
import type { ExistingChoice } from '@/tracker/services/plansService';
import { pickAndImportRoutineFile } from '@/tracker/services/routineShare';
import { forgetWorkoutFolders } from '@/tracker/services/workoutFolders';
import { useFolderOpen } from '@/tracker/store/folderOpenStore';

function Row({ title, sub, icon, first, onPress }: { title: string; sub?: string; icon?: IconName; first: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={sub ? `${title}, ${sub}` : title}
      style={{
        minHeight: 64,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingVertical: space.sm,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: color.border,
      }}
    >
      {icon ? <Icon name={icon} size={20} color={color.accent} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>{title}</Text>
        {sub ? <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted, marginTop: 2 }}>{sub}</Text> : null}
      </View>
      <Icon name="chevron-right" size={18} color={color.inkMuted} />
    </Pressable>
  );
}

export default function ProgramsScreen() {
  const router = useRouter();
  /** RP-18: the same file again — update its folder or add a copy. */
  const [existing, setExisting] = useState<{ name: string; resolve: (c: ExistingChoice | null) => void } | null>(null);

  const onImportFile = async (): Promise<void> => {
    try {
      const res = await pickAndImportRoutineFile(
        (name) =>
          new Promise<ExistingChoice | null>((resolve) => {
            setExisting({ name, resolve });
          }),
      );
      if (!res) return;
      forgetWorkoutFolders();
      useFolderOpen.getState().setOpen(res.folderId, true);
      const lines: string[] = [];
      if (res.added.length > 0) lines.push(`New in your library: ${res.added.join(', ')}.`);
      if (res.skipped.length > 0) lines.push(`Left out (no muscles in the file): ${res.skipped.join(', ')}.`);
      // C3-22: an update merges — the member's own changes are kept.
      if (res.keptEdits && res.keptEdits.length > 0) lines.push(`Your changes were kept in: ${res.keptEdits.join(', ')}.`);
      await tell(
        res.updated ? 'Folder updated' : 'Routines added',
        lines.length > 0 ? lines.join('\n\n') : res.updated ? 'You had this file already, so its folder was updated.' : 'They are in a new folder on the Workout tab.',
      );
      router.dismissTo('/workout');
    } catch (e) {
      void tell('Could not open that file', routineFileProblemText(e, routineSaveFailureText));
    }
  };

  const answerExisting = (c: ExistingChoice | null): void => {
    const e = existing;
    setExisting(null);
    e?.resolve(c);
  };

  return (
    <Screen title="Explore" subtitle="A plan built for you, or a ready program." onBack={() => goBack(router, '/workout')}>
      <View style={{ gap: space.lg }}>
        <Card style={{ paddingVertical: space.xs }}>
          <Row
            first
            icon="sparkle"
            title="Build a plan"
            sub="From your goal, days, equipment and sore spots"
            onPress={() => router.push('/plan/build')}
          />
        </Card>

        {programGroups().map((g) => (
          <View key={g.equipment}>
            <SectionHeader title={g.label} />
            <Card style={{ paddingVertical: space.xs }}>
              {g.programs.map((p, i) => (
                <Row
                  key={p.key}
                  first={i === 0}
                  title={p.name}
                  sub={programMeta(p)}
                  onPress={() => router.push({ pathname: '/programs/[key]', params: { key: p.key } })}
                />
              ))}
            </Card>
          </View>
        ))}

        <View>
          <SectionHeader title="Bring routines in" />
          <Card style={{ paddingVertical: space.xs }}>
            <Row first icon="import" title="Import a routine file" sub="A file another ForgeAI member shared" onPress={() => void onImportFile()} />
            <Row first={false} icon="globe" title="Import routines from Hevy" sub="From a Hevy share link" onPress={() => router.push('/import/routines')} />
          </Card>
        </View>
      </View>

      {/* RP-18: this file was imported before */}
      <TrackerSheet
        visible={existing != null}
        title="You have this file already"
        subtitle={existing ? `It is in "${existing.name}".` : undefined}
        onClose={() => answerExisting(null)}
      >
        <SheetRow label="Update the existing folder" leading={<Icon name="check" size={18} color={color.accent} />} onPress={() => answerExisting('update')} />
        <SheetRow label="Add a copy" leading={<Icon name="plus" size={18} color={color.accent} />} onPress={() => answerExisting('copy')} />
      </TrackerSheet>
    </Screen>
  );
}
