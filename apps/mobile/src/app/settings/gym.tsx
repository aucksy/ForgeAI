/**
 * Settings → Your gym (redesign R6): the member's gym (gym sync stays hidden behind its flag, D4).
 *
 * UAT U-G2: a member who JOINED a gym in the app sees that gym here (it used to show the name typed
 * at onboarding), with "Shop and leave" to the Shop tab, where its shop and Leave are. A member in
 * no gym sees the card as before (the name they typed, or "Not added yet"), and (owner report,
 * 17 Oct 2026) "Join your gym" with the gym's code under it. A joined gym with a logo also has
 * "Add to your home screen" (OWNER-INBOX #11): the gym's logo as a shortcut that opens ForgeAI.
 */
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Text } from 'react-native';

import { CloudCard } from '@/components/settings/CloudCard';
import { GymCard } from '@/components/settings/GymCard';
import { JoinGymCard } from '@/components/settings/JoinGymCard';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { LinkRow } from '@/components/stats/parts';
import { GlassCard } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { addGymShortcut, canAddGymShortcut, gymShortcutWords, markShortcutOffered } from '@/shop/gymShortcut';
import { FEATURES, profileParts } from '@/lib/features';
import { useGymShop } from '@/shop/gymStore';
import { useGymHydrated } from '@/shop/shopSource';
import type { GymLink } from '@/shop/types';
import { color, space, type } from '@/theme/tokens';

const PARTS = new Set(profileParts(FEATURES));

export default function GymPage() {
  const hydrated = useGymHydrated();
  const link = useGymShop((s) => s.link);
  return (
    <SettingsPage title="Your gym">
      {!hydrated ? null : link ? (
        <JoinedGymCard link={link} />
      ) : (
        <>
          <GymCard />
          <JoinGymCard />
        </>
      )}
      {PARTS.has('gymSync') ? <CloudCard /> : null}
    </SettingsPage>
  );
}

function JoinedGymCard({ link }: { link: GymLink }) {
  const router = useRouter();
  const [words, setWords] = useState<string | null>(null);
  const busy = useRef(false);
  const addShortcut = async (): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    setWords(null);
    const r = await addGymShortcut(link);
    setWords(gymShortcutWords(r, link.gymName));
    // Added here: the Shop tab need not offer it again.
    if (r === 'asked' || r === 'updated') void markShortcutOffered(link.joinCode);
    busy.current = false;
  };
  return (
    <>
      <GlassCard>
        <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.caption, color: color.accentBright, letterSpacing: 1.4, textTransform: 'uppercase' }}>
          Your gym
        </Text>
        <Text style={{ fontFamily: type.display, fontSize: type.size.h2, color: color.ink, letterSpacing: -0.3, marginTop: space.sm }}>{link.gymName}</Text>
        <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkSecondary, marginTop: 3 }}>
          {link.name.trim() ? `Joined in the app as ${link.name.trim()}` : 'Joined in the app'}
        </Text>
      </GlassCard>
      <LinkRow title="Shop and leave" sub={`${link.gymName}'s shop, your orders, and Leave`} onPress={() => router.navigate('/shop')} />
      {canAddGymShortcut(link) ? (
        <LinkRow title="Add to your home screen" sub={`${link.gymName}'s logo on your home screen. It opens ForgeAI.`} onPress={() => void addShortcut()} />
      ) : null}
      <InlineError message={words} />
    </>
  );
}
