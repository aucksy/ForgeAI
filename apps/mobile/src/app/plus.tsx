/**
 * F56 MettleUp Plus (R-461): the one screen about the free and paid parts. Opened from every locked pop-up,
 * the free-month pop-ups and Settings -> "MettleUp Plus". It says where the member stands (free month, gym,
 * staff, bought, free), what stays free, what is paid, the three prices, and "Find my gym" (members of a
 * MettleUp gym get everything free).
 * Buying: Google Play, TEST MODE until the owner's "payments live" (playBilling.ts); a QA build uses a stand-in
 * store that says no money is taken. Shared code: Android and iPhone (iPhone has no store yet: "not available").
 */
import { PLUS_OPTIONS, type PlusOption } from '@forgeai/theme';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { Card, GhostButton, PrimaryButton, Screen, askConfirm } from '@/components/ui';
import { goBack } from '@/lib/goBack';
import { tell } from '@/lib/tell';
import { planTodayNow, useMemberAccess } from '@/plan/memberPlanStore';
import { accessLine, buyLabel, plusGymCard, PLUS_WORDS } from '@/plan/planWords';
import { buy, playPrices, restore, storeKind } from '@/plan/playBilling';
import { useGymShop } from '@/shop/gymStore';
import { color, space, type } from '@/theme/tokens';

function Line({ text, on }: { text: string; on: boolean }) {
  return (
    <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
      <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: on ? color.goodText : color.accent, width: 18 }}>{on ? '✓' : '+'}</Text>
      <Text style={{ flex: 1, fontFamily: type.body, fontSize: type.size.body, color: color.ink, lineHeight: 22 }}>{text}</Text>
    </View>
  );
}

export default function PlusScreen() {
  const router = useRouter();
  const access = useMemberAccess();
  const today = planTodayNow();
  const [prices, setPrices] = useState<Partial<Record<PlusOption, string>>>({});
  const [busy, setBusy] = useState<PlusOption | 'restore' | null>(null);
  const store = storeKind();
  // No gym yet: "Find my gym" looks the member up by number; with a gym, it opens the Gym tab.
  const linked = useGymShop((s) => s.link != null);

  useEffect(() => {
    let live = true;
    void playPrices().then((p) => {
      if (live) setPrices(p);
    });
    return () => {
      live = false;
    };
  }, []);

  const owned = access.why === 'bought';
  const gymOrStaff = access.why === 'gym' || access.why === 'staff';
  const gymCard = plusGymCard(access);

  const onBuy = async (option: PlusOption): Promise<void> => {
    if (busy) return;
    setBusy(option);
    try {
      const r = await buy(option, () =>
        askConfirm({ title: buyLabel(option, prices[option] ?? null), body: PLUS_WORDS.testBuild, confirmLabel: PLUS_WORDS.testBuyButton, cancelLabel: 'Cancel' }),
      );
      if (r === 'bought') await tell(PLUS_WORDS.thanks);
      else if (r === 'pending') await tell(PLUS_WORDS.pending);
      else if (r === 'failed') await tell(PLUS_WORDS.failed);
      else if (r === 'unavailable') await tell(PLUS_WORDS.noStore);
      else if (r === 'notLive') await tell(PLUS_WORDS.notLive);
      else await tell(PLUS_WORDS.cancelled);
    } finally {
      setBusy(null);
    }
  };

  const onRestore = async (): Promise<void> => {
    if (busy) return;
    setBusy('restore');
    try {
      const r = await restore();
      await tell(r === 'found' ? PLUS_WORDS.restoreFound : r === 'none' ? PLUS_WORDS.restoreNone : PLUS_WORDS.noStore);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen title={PLUS_WORDS.title} onBack={() => goBack(router, '/settings')}>
      <View style={{ gap: space.lg, paddingBottom: space.xxl }} testID="plus-screen">
        <Text testID="plus-status" style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink, lineHeight: 22 }}>
          {accessLine(access, today)}
        </Text>

        <Card style={{ gap: space.sm }}>
          <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>{PLUS_WORDS.freeTitle}</Text>
          {PLUS_WORDS.free.map((t) => (
            <Line key={t} text={t} on />
          ))}
        </Card>

        <Card style={{ gap: space.sm }}>
          <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>{PLUS_WORDS.paidTitle}</Text>
          {PLUS_WORDS.paid.map((t) => (
            <Line key={t} text={t} on={access.all} />
          ))}
        </Card>

        {!gymOrStaff ? (
          <Card style={{ gap: space.sm }} testID="plus-gym-card">
            <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>{gymCard.title}</Text>
            <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, lineHeight: 20 }}>{gymCard.body}</Text>
            {gymCard.findGym ? <GhostButton label={PLUS_WORDS.gymButton} onPress={() => router.push(linked ? '/shop' : '/find-gym')} /> : null}
          </Card>
        ) : null}

        {!owned && !gymOrStaff ? (
          <View style={{ gap: space.sm }}>
            <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>{PLUS_WORDS.buyTitle}</Text>
            {store === 'standIn' ? (
              <Text testID="plus-test-build" style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent }}>
                {PLUS_WORDS.testBuild}
              </Text>
            ) : null}
            {PLUS_OPTIONS.map((o) => (
              <PrimaryButton key={o} label={buyLabel(o, prices[o] ?? null)} loading={busy === o} disabled={busy != null && busy !== o} onPress={() => void onBuy(o)} />
            ))}
            <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, lineHeight: 20 }}>{PLUS_WORDS.payNote}</Text>
            <GhostButton label={PLUS_WORDS.restore} onPress={() => void onRestore()} />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
