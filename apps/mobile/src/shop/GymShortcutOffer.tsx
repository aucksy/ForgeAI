/**
 * The once-per-gym offer at the top of the gym's Shop (OWNER-INBOX #11): "Add <gym> to your home
 * screen", with the gym's logo as the shortcut's picture. Android asks before anything is added.
 * "Not now" (or adding) hides it for that gym; Settings → Your gym keeps the button.
 */
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { Card, GhostButton, PrimaryButton } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { color, space, type } from '@/theme/tokens';

import { addGymShortcut, canAddGymShortcut, gymShortcutWords, markShortcutOffered, shortcutOffered } from './gymShortcut';
import type { GymLink } from './types';

export function GymShortcutOffer({ link }: { link: GymLink }) {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [words, setWords] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    if (!canAddGymShortcut(link)) return undefined;
    void shortcutOffered(link.joinCode).then((done) => {
      if (live && !done) setShow(true);
    });
    return () => {
      live = false;
    };
  }, [link]);

  if (!show) return null;

  const hide = (): void => {
    setShow(false);
    void markShortcutOffered(link.joinCode);
  };
  const add = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    const r = await addGymShortcut(link);
    setBusy(false);
    const said = gymShortcutWords(r, link.gymName);
    if (said && r !== 'updated') {
      setWords(said);
      return;
    }
    hide();
  };

  return (
    <Card style={{ gap: space.md, marginBottom: space.md }}>
      <View style={{ gap: space.xs }}>
        <Text accessibilityRole="header" style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
          Add {link.gymName} to your home screen
        </Text>
        <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, lineHeight: 20 }}>
          Your gym's logo on your home screen. It opens ForgeAI.
        </Text>
      </View>
      <InlineError message={words} />
      <PrimaryButton label="Add to home screen" loading={busy} onPress={() => void add()} />
      <GhostButton label="Not now" onPress={hide} />
    </Card>
  );
}
