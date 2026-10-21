/**
 * The one box a member ticks before joining a gym (launch plan D5/D6; words and links in
 * joinTerms.ts). A real checkbox for TalkBack, a 48 dp row, and "Read them" opening the
 * terms and privacy notice in the browser.
 */
import { Linking, Pressable, Text, View } from 'react-native';

import { color, space, type } from '@/theme/tokens';

import { AGREE_LABEL, PRIVACY_URL, TERMS_URL } from './joinTerms';

export function JoinAgreement({ agreed, onChange }: { agreed: boolean; onChange: (v: boolean) => void }) {
  const open = (url: string) => {
    Linking.openURL(url).catch((e: unknown) => console.warn('[join] could not open', url, e));
  };
  return (
    <View style={{ gap: space.xs }}>
      <Pressable
        onPress={() => onChange(!agreed)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: agreed }}
        accessibilityLabel={AGREE_LABEL}
        style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48 }}
      >
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            borderWidth: 2,
            borderColor: agreed ? color.accent : color.inkFaint,
            backgroundColor: agreed ? color.accent : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {agreed ? <Text style={{ color: color.onAccent, fontFamily: type.bodySemi, fontSize: 16, lineHeight: 18 }}>✓</Text> : null}
        </View>
        <Text style={{ flex: 1, fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, lineHeight: 20 }}>{AGREE_LABEL}</Text>
      </Pressable>
      <View style={{ flexDirection: 'row', gap: space.lg, paddingLeft: 24 + space.sm }}>
        <Pressable onPress={() => open(TERMS_URL)} accessibilityRole="link" accessibilityLabel="Read the terms" style={{ minHeight: 48, justifyContent: 'center' }}>
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent }}>Terms</Text>
        </Pressable>
        <Pressable onPress={() => open(PRIVACY_URL)} accessibilityRole="link" accessibilityLabel="Read the privacy notice" style={{ minHeight: 48, justifyContent: 'center' }}>
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent }}>Privacy notice</Text>
        </Pressable>
      </View>
    </View>
  );
}
