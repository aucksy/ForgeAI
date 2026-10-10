/**
 * Shown when ForgeAI cannot start on its own database — Phase O2 (W1), rebuilt for audit
 * DS-08 / SH-11.
 *
 * The important thing this screen does is NOT be the welcome screen: falling back to first-run
 * over a device that already holds months of training would invite the member to set up again,
 * and setting up wipes.
 *
 *  - The words depend on what failed (src/onboarding/bootFailure.ts): a full phone says so.
 *  - "Try again" REALLY retries: it drops the database handle and re-runs the whole start-up
 *    (open, every upgrade step, the first read) — `useOnboarding.retry()`.
 *  - "Save my data file" hands the raw database to the share sheet, so the member can keep it
 *    even if nothing else works.
 *  - "Details" (folded) carries the raw error for support.
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card, GhostButton, Icon, PrimaryButton, Screen } from '@/components/ui';
import { color, space, type } from '@/theme/tokens';

import { bootMessage } from '../bootFailure';
import { NO_DATA_FILE_MESSAGE, saveDataFile } from '../services/saveDataFile';
import { useOnboarding } from '../store/onboardingStore';

const UNKNOWN = { stage: 'read', storageFull: false, detail: 'No details were recorded.' } as const;

export function BootErrorScreen() {
  const retry = useOnboarding((s) => s.retry);
  const failure = useOnboarding((s) => s.bootError) ?? UNKNOWN;
  const { title, body } = bootMessage(failure);

  const [retrying, setRetrying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const onRetry = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      await retry();
    } finally {
      setRetrying(false);
    }
  };

  const onSave = async () => {
    if (saving) return;
    setSaving(true);
    setSaveNote(null);
    const r = await saveDataFile();
    setSaving(false);
    if (r.ok) {
      setSaveNote(
        r.files === 2
          ? 'Keep both files together, with the same names. Support can open them for you.'
          : 'Keep this file somewhere safe. Support can open it for you.',
      );
    } else if (r.reason === 'no-share') {
      setSaveNote("This phone can't share files right now.");
    } else if (r.reason === 'no-file') {
      setSaveNote(NO_DATA_FILE_MESSAGE);
    } else {
      setSaveNote(`ForgeAI couldn't save the file.${r.detail ? ` ${r.detail}` : ''}`);
    }
  };

  const muted = { fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted } as const;

  return (
    <Screen>
      <Card>
        <Text accessibilityRole="header" style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
          {title}
        </Text>
        <Text
          accessibilityLiveRegion="polite"
          style={{
            fontFamily: type.body,
            fontSize: type.size.sub,
            color: color.inkSecondary,
            lineHeight: 20,
            marginTop: space.sm,
          }}
        >
          {body}
        </Text>

        <View style={{ marginTop: space.lg, gap: space.sm }}>
          <PrimaryButton label="Try again" loading={retrying} onPress={() => void onRetry()} />
          <GhostButton label={saving ? 'Preparing your file…' : 'Save my data file'} onPress={() => void onSave()} />
        </View>
        {saveNote ? <Text style={{ ...muted, marginTop: space.sm, lineHeight: 18 }}>{saveNote}</Text> : null}

        <Pressable
          onPress={() => setShowDetails((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showDetails }}
          hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.lg, minHeight: 48 }}
        >
          <Text style={{ ...muted, fontFamily: type.bodySemi }}>Details</Text>
          <View style={{ transform: [{ rotate: showDetails ? '90deg' : '0deg' }] }}>
            <Icon name="chevron-right" size={14} color={color.inkMuted} />
          </View>
        </Pressable>
        {showDetails ? (
          <Text selectable style={{ ...muted, lineHeight: 18 }}>
            {failure.detail}
          </Text>
        ) : null}
      </Card>
    </Screen>
  );
}
