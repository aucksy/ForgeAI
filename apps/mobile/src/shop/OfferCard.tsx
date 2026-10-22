/**
 * The gym's workout offer on the Gym tab (OWNER-INBOX #49 step 2), above "My membership":
 * "Train 10 times in 30 days, get 3 extra days" + "Join the offer" (which opens the consent screen
 * first), then "6 of 10 workouts" with dots, "Until 21 Nov", and "Leave the offer".
 *
 * Read on every visit; the last answer is kept so it still shows at the gym with no signal. Hidden
 * when there is no offer, and when the gym's server has no offers yet (0025 not applied): one log
 * line, no words to the member. What the card says: offer.ts (tested); words: offerWords.ts.
 * Only the DATES of counted workouts leave the phone, only after Join (offerActions.ts).
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { Card, GhostButton, PrimaryButton, Sheet, askConfirm } from '@/components/ui';
import { todayISO } from '@/lib/date';
import { color, space, type } from '@/theme/tokens';

import { offerNumbers, offerView, type OffersAnswer } from './offer';
import { joinOffer, leaveOffer, readKeptOffer, syncOfferDates } from './offerActions';
import { OFFER_WORDS, consentWords } from './offerWords';
import type { GymLink } from './types';

export function OfferCard({ link }: { link: GymLink }) {
  const [answer, setAnswer] = useState<OffersAnswer | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinWords, setJoinWords] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const busy = useRef(false);
  // Another gym (or a rejoin) on a screen that stays open: never keep the last member's offer.
  const [forMember, setForMember] = useState(link.memberId);
  if (forMember !== link.memberId) {
    setForMember(link.memberId);
    setAnswer(null);
  }

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void (async () => {
        const kept = await readKeptOffer(link.memberId);
        if (live && kept) setAnswer((a) => a ?? kept.answer);
        const load = await syncOfferDates(link);
        if (!live) return;
        if (load.kind === 'answer') setAnswer(load.answer);
        // No offers on the server, or a refusal that is not about the signal: no card.
        else if (load.kind === 'missing' || !load.offline) setAnswer(null);
        // Offline: the kept card stays as it is.
      })().catch((e: unknown) => console.warn('[ForgeErr] offer card: refresh', e));
      return () => {
        live = false;
      };
    }, [link]),
  );

  const today = todayISO();
  const view = offerView(answer, today);
  if (!view || !answer?.offer) return null;
  const offer = answer.offer;
  const consent = consentWords(offerNumbers(offer, answer.gymName));

  const onJoin = async () => {
    if (busy.current) return;
    busy.current = true;
    setJoining(true);
    setJoinWords(null);
    try {
      const r = await joinOffer(link, offer);
      if (r.ok) {
        setAnswer(r.answer);
        setConsentOpen(false);
      } else {
        setJoinWords(r.words);
      }
    } finally {
      busy.current = false;
      setJoining(false);
    }
  };

  const onLeave = async () => {
    if (busy.current) return;
    const ok = await askConfirm({
      title: OFFER_WORDS.leaveTitle,
      body: OFFER_WORDS.leaveBody,
      confirmLabel: OFFER_WORDS.leaveConfirm,
      cancelLabel: OFFER_WORDS.leaveCancel,
      destructive: true,
    });
    if (!ok) return;
    busy.current = true;
    setLeaving(true);
    try {
      await leaveOffer(link, offer.id);
      // The card goes back to the offer as the gym sees it now (or hides).
      const load = await syncOfferDates(link);
      setAnswer(load.kind === 'answer' ? load.answer : null);
    } finally {
      busy.current = false;
      setLeaving(false);
    }
  };

  const body = { fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, lineHeight: 20 } as const;
  return (
    <Card style={{ gap: space.xs, marginBottom: space.md }}>
      <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.caption, color: color.accentBright, letterSpacing: 1.4, textTransform: 'uppercase' }}>
        {view.eyebrow}
      </Text>
      <Text accessibilityRole="header" style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
        {view.title}
      </Text>
      {view.dots ? <Dots done={view.dots.done} total={view.dots.total} /> : null}
      <View style={{ gap: 2, marginTop: space.xs }}>
        {view.lines.map((line) => (
          <Text key={line} style={body}>
            {line}
          </Text>
        ))}
      </View>
      {view.action === 'join' ? (
        <View style={{ marginTop: space.sm }}>
          <GhostButton
            label={OFFER_WORDS.joinButton}
            onPress={() => {
              setJoinWords(null);
              setConsentOpen(true);
            }}
          />
        </View>
      ) : null}
      {view.action === 'leave' ? (
        <View style={{ marginTop: space.sm }}>
          <GhostButton label={leaving ? '…' : OFFER_WORDS.leaveButton} onPress={() => void onLeave()} accessibilityLabel={OFFER_WORDS.leaveButton} />
        </View>
      ) : null}

      <Sheet
        visible={consentOpen}
        title={consent.title}
        onClose={() => setConsentOpen(false)}
        footer={
          <View style={{ gap: space.sm }}>
            <PrimaryButton label={consent.join} onPress={() => void onJoin()} loading={joining} disabled={joining} />
            <GhostButton label={consent.notNow} onPress={() => setConsentOpen(false)} />
          </View>
        }
      >
        <View style={{ gap: space.md }}>
          {consent.paragraphs.map((p) => {
            const cut = p.indexOf(': ');
            return (
              <Text key={p} style={body}>
                <Text style={{ fontFamily: type.bodySemi, color: color.ink }}>{p.slice(0, cut + 1)}</Text>
                {p.slice(cut + 1)}
              </Text>
            );
          })}
          <Text style={{ ...body, color: color.inkMuted }}>{consent.noChange}</Text>
          {joinWords ? (
            <Text accessibilityLiveRegion="polite" style={{ ...body, color: color.warning }}>
              {joinWords}
            </Text>
          ) : null}
        </View>
      </Sheet>
    </Card>
  );
}

/** "6 of 10" as dots: the gym's accent for done, a quiet ring for the rest. Never red. */
function Dots({ done, total }: { done: number; total: number }) {
  return (
    <View
      accessible
      accessibilityLabel={OFFER_WORDS.progress(done, total)}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.xs }}
    >
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={{
            width: 12,
            height: 12,
            borderRadius: 6,
            backgroundColor: i < done ? color.accent : 'transparent',
            borderWidth: i < done ? 0 : 1.5,
            borderColor: color.border,
          }}
        />
      ))}
    </View>
  );
}
