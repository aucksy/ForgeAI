/**
 * The credit under a library drawing (Phase 0, EX-05): who drew it and its licence, in a
 * readable grey (inkSecondary, about 7.9 : 1 on the sheet; before, inkFaint at 1.74 : 1), and a
 * tap opens the Credits page with the source, the licence and what was changed.
 */
import { useRouter } from 'expo-router';
import { Pressable, Text } from 'react-native';

import { color, type } from '@/theme/tokens';

import { MEDIA_CREDIT } from '../catalog/media';

export function DrawingCredit({ beforeOpen }: { beforeOpen?: () => void }) {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => {
        beforeOpen?.(); // a sheet closes first, so the page is not hidden behind it
        router.push('/credits');
      }}
      accessibilityRole="link"
      accessibilityLabel={`${MEDIA_CREDIT}. Open credits`}
      hitSlop={8}
      style={{ minHeight: 32, justifyContent: 'center' }}
    >
      <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary }}>
        {MEDIA_CREDIT} ·{' '}
        <Text style={{ fontFamily: type.bodySemi, color: color.accent }}>Credits</Text>
      </Text>
    </Pressable>
  );
}
