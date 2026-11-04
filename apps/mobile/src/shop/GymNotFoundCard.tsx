/**
 * Launch audit, 3 Nov 2026 (member app #8): a gym link or code that matches no gym. One page for both
 * the join link (InviteScreen) and the check-in link (CheckInScreen): "We couldn't find this gym", one
 * plain sentence (gym.ts unknownCodeWords), then "Scan the poster" (MettleUp's own scanner, /scan) and
 * "Type a gym code" (the Gym tab's code box, shown when this phone has no gym). A member already in a
 * gym has no code box, so they get "Close" instead.
 */
import { useRouter } from 'expo-router';
import { Text } from 'react-native';

import { Card, GhostButton, PrimaryButton } from '@/components/ui';
import { color, space, type } from '@/theme/tokens';

import { unknownCodeWords } from './gym';
import { useGymShop } from './gymStore';

export function GymNotFoundCard({ code, onClose }: { code: string | null; onClose: () => void }) {
  const router = useRouter();
  const inGym = useGymShop((s) => s.link != null);
  const words = unknownCodeWords(code);
  return (
    <Card style={{ gap: space.md }}>
      <Text accessibilityRole="header" style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
        {words.title}
      </Text>
      <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, lineHeight: 20 }}>{words.body}</Text>
      <PrimaryButton label="Scan the poster" icon="camera" onPress={() => router.replace('/scan')} />
      {inGym ? <GhostButton label="Close" onPress={onClose} /> : <GhostButton label="Type a gym code" onPress={() => router.replace('/shop')} />}
    </Card>
  );
}
