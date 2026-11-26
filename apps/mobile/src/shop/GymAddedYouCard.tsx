/**
 * F239 / R-629 "A gym added you": the card on top of the Workout tab (one of its notices, lib/workoutNotices.ts) and
 * on the Gym tab with no gym. "Iron Gym added you as a member." with "Join Iron Gym" (or "Switch to Iron Gym" for a
 * member already in another gym) and "Not now". Several gyms: one card, each gym with its own button, one "Not now".
 * Every button opens the gym's own join screen (/j/<code>, InviteScreen), which asks again before anything changes.
 * The words and rules are in gymAddedYou.ts; the check is gymAddedYouApi.ts. Only theme colours (dark mode), and
 * the text wraps freely (font size 2.0); buttons are the app's own (54 / 50 dp tall). Styles are read when drawn (a
 * gym's colours rewrite the theme tokens).
 */
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { useReportWant, type NoticeSlotProps } from '@/components/noticeSlot';
import { Card, GhostButton, PrimaryButton } from '@/components/ui';
import { color, space, type } from '@/theme/tokens';

import { addedA11y, addedBody, addedButton, addedTitle, GYM_ADDED, severalTitle, type AddedMatch } from './gymAddedYou';
import { noteJoinTap, notNow, useGymAddedYou } from './gymAddedYouApi';

export function GymAddedYouCard({ hidden = false, onWant, onDone }: NoticeSlotProps = {}) {
  const router = useRouter();
  const shown = useGymAddedYou((s) => s.shown);
  const currentGym = useGymAddedYou((s) => s.currentGym);
  const qa = useGymAddedYou((s) => s.qa);
  useReportWant(shown.length > 0, onWant);
  if (shown.length === 0 || hidden) return null;

  const inGym = currentGym != null;
  const open = (m: AddedMatch): void => {
    noteJoinTap(m);
    router.push(`/j/${m.joinCode}`);
  };
  const later = (): void => {
    void notNow(shown.map((m) => m.gymId));
    onDone?.();
  };
  const several = shown.length > 1;

  return (
    <Card style={{ gap: space.md, borderLeftWidth: 3, borderLeftColor: color.accent }}>
      {several ? (
        <Text accessibilityRole="header" style={titleStyle()}>
          {severalTitle(shown.length)}
        </Text>
      ) : null}
      {shown.map((m) => (
        <View key={m.gymId} style={{ gap: space.sm }} testID={`gym-added-${m.gymId}`}>
          <Text accessibilityRole={several ? undefined : 'header'} accessibilityLabel={addedA11y(m, inGym)} style={several ? rowTitleStyle() : titleStyle()}>
            {addedTitle(m)}
          </Text>
          <Text style={bodyStyle()}>{addedBody(m, currentGym)}</Text>
          <PrimaryButton label={addedButton(m, inGym)} onPress={() => open(m)} />
        </View>
      ))}
      <GhostButton label={GYM_ADDED.notNow} onPress={later} />
      {qa ? <Text style={quietStyle()}>{GYM_ADDED.testBuild}</Text> : null}
    </Card>
  );
}

const titleStyle = () => ({ fontFamily: type.bodySemi, fontSize: type.size.body, lineHeight: 22, color: color.ink }) as const;
const rowTitleStyle = () => ({ fontFamily: type.bodySemi, fontSize: type.size.sub, lineHeight: 20, color: color.ink }) as const;
const bodyStyle = () => ({ fontFamily: type.body, fontSize: type.size.sub, lineHeight: 20, color: color.inkSecondary }) as const;
const quietStyle = () => ({ fontFamily: type.body, fontSize: type.size.caption, lineHeight: 18, color: color.inkMuted }) as const;
