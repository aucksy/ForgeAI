/**
 * v0.29.0 — Import routines (owner, 9 Oct 2026): paste a Hevy share link (a folder or one
 * routine) and its routines come in exactly as saved — sets, rep ranges and rest — through the
 * same check-and-follow steps as the history import. One question per screen:
 *   1. the link (with how to copy it in Hevy) → 2. reading… → 3. the steps.
 * Strong's share links open only inside Strong (researched 9 Oct 2026), so Strong routines come
 * from its export file (Import from Strong → "Bring my routines in").
 * Audit Phase 4 (IM-13): a read that got only part of the folder says so ("Only 4 of 6 routines
 * could be read — try again"), with Try again or Use these.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';

import { Card, GhostButton, IconButton, PrimaryButton, Screen } from '@/components/ui';
import { warn } from '@/lib/haptics';
import { useBackGuard } from '@/lib/useBackGuard';
import { color, radius, space, type } from '@/theme/tokens';

import { HevyLinkReader } from '@/tracker/components/HevyLinkReader';
import { RoutineImportSteps, type LinkRoutines } from '@/tracker/components/RoutineImportSteps';
import { inferDayType } from '@/tracker/services/hevyImport';
import { historyTypesFor } from '@/tracker/services/routineImport';
import {
  linkedToFound,
  parseRoutineLink,
  partialRead,
  partialReadText,
  readLinkedFolder,
  readProblem,
  type LinkedFolder,
  type PageRead,
  type RoutineLink,
} from '@/tracker/services/routineLink';

const CAPTION = { fontFamily: type.body, fontSize: type.size.sub, color: color.inkMuted, lineHeight: 19 } as const;

type Phase =
  | { kind: 'paste' }
  | { kind: 'reading'; link: RoutineLink }
  | { kind: 'partial'; link: RoutineLink; folder: LinkedFolder; text: string }
  | { kind: 'steps'; routines: LinkRoutines };

export default function ImportRoutinesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ link?: string }>();
  const [text, setText] = useState(typeof params.link === 'string' ? params.link : '');
  const [phase, setPhase] = useState<Phase>({ kind: 'paste' });
  const [problem, setProblem] = useState<string | null>(null);

  const link = parseRoutineLink(text);

  // IM-10: Back inside the steps goes to the previous step; while reading, Back cancels the
  // read (back to the link); on the link screen Back leaves.
  const stepsBack = useRef<(() => boolean) | null>(null);
  const leaving = useRef(false);
  const close = (): void => {
    leaving.current = true;
    router.back();
  };
  useBackGuard(() => {
    if (leaving.current) return false;
    if (phase.kind === 'steps') return stepsBack.current?.() ?? false;
    if (phase.kind === 'reading' || phase.kind === 'partial') {
      setPhase({ kind: 'paste' });
      return true;
    }
    return false;
  });

  const onRead = (): void => {
    if (!link) {
      setProblem('That isn’t a Hevy share link. It looks like hevy.com/folder/… or hevy.com/routine/…');
      return;
    }
    setProblem(null);
    setPhase({ kind: 'reading', link });
  };

  /** The routines to the steps: exactly as saved, or (headings only) warm-ups from the member's history. */
  const toSteps = async (l: RoutineLink, folder: LinkedFolder): Promise<void> => {
    const found = linkedToFound(folder, inferDayType);
    const routines = folder.fromPageData ? found : await historyTypesFor(found).catch(() => found);
    setPhase({ kind: 'steps', routines: { url: l.url, kind: l.kind, folderName: folder.name, found: routines, exact: folder.fromPageData === true } });
  };

  const onPageRead = (l: RoutineLink, read: PageRead | null): void => {
    const folder = read ? readLinkedFolder(read, l.kind) : null;
    const why = readProblem(read, folder);
    if (why || !folder) {
      warn();
      setProblem(why);
      setPhase({ kind: 'paste' });
      return;
    }
    // IM-13: part of the folder only — say so before anything is copied.
    const part = partialRead(read, folder);
    if (part) {
      warn();
      setPhase({ kind: 'partial', link: l, folder, text: partialReadText(part) });
      return;
    }
    void toSteps(l, folder);
  };

  return (
    <Screen title="Import routines" right={<IconButton icon="close" onPress={close} accessibilityLabel="Close" />}>
      {phase.kind === 'steps' ? (
        <RoutineImportSteps app="hevy" link={phase.routines} onClose={close} backRef={stepsBack} />
      ) : phase.kind === 'partial' ? (
        <View style={{ gap: space.lg }}>
          <Card style={{ gap: space.sm, paddingVertical: space.xl }}>
            <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>{phase.text}</Text>
            <Text style={CAPTION}>
              Hevy’s page did not finish loading. Trying again usually gets them all. You can also copy the {phase.folder.routines.length} that came through.
            </Text>
          </Card>
          <PrimaryButton label="Try again" icon="chevron-right" onPress={() => setPhase({ kind: 'reading', link: phase.link })} />
          <GhostButton
            label={`Use these ${phase.folder.routines.length}`}
            icon="check"
            onPress={() => void toSteps(phase.link, phase.folder)}
          />
        </View>
      ) : phase.kind === 'reading' ? (
        <View style={{ gap: space.lg }}>
          <Card style={{ alignItems: 'center', gap: space.md, paddingVertical: space.xl }}>
            <ActivityIndicator color={color.accent} />
            <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>Reading your Hevy link…</Text>
            <Text style={{ ...CAPTION, textAlign: 'center' }}>This takes a few seconds.</Text>
          </Card>
          <GhostButton label="Cancel" icon="close" onPress={() => setPhase({ kind: 'paste' })} />
          <HevyLinkReader key={phase.link.url} url={phase.link.url} onRead={(r) => onPageRead(phase.link, r)} />
        </View>
      ) : (
        <View style={{ gap: space.lg }}>
          <View style={{ gap: space.xs }}>
            <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>Copy your routines from Hevy</Text>
            <Text style={CAPTION}>Paste a Hevy share link. Your routines come in exactly as saved: exercises, warm-ups, sets, reps and rest.</Text>
          </View>
          <View
            style={{
              minHeight: 46,
              paddingHorizontal: space.md,
              justifyContent: 'center',
              borderRadius: radius.md,
              backgroundColor: color.surfaceSunken,
              borderWidth: 1,
              borderColor: problem ? color.criticalText : color.border,
            }}
          >
            <TextInput
              value={text}
              onChangeText={(t) => {
                setText(t);
                setProblem(null);
              }}
              placeholder="hevy.com/folder/…"
              placeholderTextColor={color.inkMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="go"
              onSubmitEditing={onRead}
              accessibilityLabel="Hevy share link"
              style={{ fontFamily: type.bodyMedium, fontSize: type.size.body, color: color.ink, paddingVertical: space.sm }}
            />
          </View>
          {problem ? <Text style={{ ...CAPTION, color: color.criticalText }}>{problem}</Text> : null}
          <PrimaryButton label="Read link" icon="chevron-right" disabled={text.trim() === ''} onPress={onRead} />
          <Card style={{ gap: space.sm }}>
            <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.inkSecondary }}>How to get the link in Hevy</Text>
            <Text style={CAPTION}>A folder: Workout tab → ⋯ on the folder → Share Folder → Copy Link.</Text>
            <Text style={CAPTION}>One routine: Workout tab → ⋯ on the routine → Share Routine → Copy Link.</Text>
          </Card>
          <Text style={CAPTION}>
            Coming from Strong? Strong’s links open only in Strong. Import your Strong file instead, then tap “Bring my routines in”.
          </Text>
          <GhostButton label="Import from Strong" icon="calendar" onPress={() => {
              leaving.current = true;
              router.replace({ pathname: '/import', params: { from: 'strong' } });
            }} />
        </View>
      )}
    </Screen>
  );
}
