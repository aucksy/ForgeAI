/**
 * The Gym tab's leaderboard (R-133): "Leaderboard · last 30 days" with tabs Workouts | Kg lifted, the
 * top 10 with your row marked, "You: 7th · 12 workouts" when you are not in the top 10 (never the
 * bottom of the list), and the gym's challenge on top when there is one.
 *
 * Hidden until the gym's server answers (0037 not live: no card, no error), and for a phone in no
 * gym (the Gym tab only draws it for a joined gym). The phone sends its own day totals when the tab
 * opens (leaderboardPush.ts, at most every 10 minutes). The numbers: leaderboard.ts; the words:
 * boardWords.ts (tested).
 *
 * R-164: a name opens that member's workouts when the gym says they share them (member_mate_board:
 * their name shows and their "Let my gym mates see my workouts" switch is on). Other rows stay plain.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card } from '@/components/ui';
import { todayISO } from '@/lib/date';
import type { UnitSystem } from '@/lib/units';
import { useUnits } from '@/lib/useUnits';
import { color, radius, space, type } from '@/theme/tokens';
import { SegmentedTabs } from '@/tracker/components/SegmentedTabs';

import { BOARD_WORDS, challengeLine, kgTabLabel, rankText, valueText, youLine } from './boardWords';
import { challengeFill, type Board, type BoardChallenge, type BoardList, type BoardMeasure } from './leaderboard';
import { peekBoard, pushBoard, readBoard, type BoardRead } from './leaderboardSync';
import { MATE_WORDS, profileFor, type MateBoard } from './mateProfile';
import { readMateBoard } from './mateSync';
import type { GymLink } from './types';

/** Read when drawn: a gym's branding repaints the colour tokens. */
const textStyle = () => ({ fontFamily: type.body, fontSize: type.size.sub, lineHeight: 20, color: color.inkSecondary }) as const;

export function LeaderboardCard({ link }: { link: GymLink }) {
  const units = useUnits();
  const [board, setBoard] = useState<Board | null>(() => peekBoard(link));
  const [tab, setTab] = useState<BoardMeasure>('workouts');
  const [mates, setMates] = useState<MateBoard | null>(null);
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      let live = true;
      const apply = (r: BoardRead): void => {
        if (!live) return;
        if (r.kind === 'board') setBoard(r.board);
        else if (r.kind === 'hidden') setBoard(null);
      };
      void (async () => {
        // Read at once; if the phone just sent its numbers, read again so they show.
        const pushed = pushBoard('focus');
        apply(await readBoard(link));
        if ((await pushed) === 'sent') apply(await readBoard(link));
        // R-164: which names open a profile (none when the server cannot share yet).
        const m = await readMateBoard(link);
        if (live) setMates(m);
      })().catch((e: unknown) => console.warn('[board] card refresh', e));
      return () => {
        live = false;
      };
    }, [link]),
  );

  if (!board) return null;
  const list: BoardList = board[tab];
  const today = todayISO();
  const tabs = [
    { id: 'workouts' as const, label: BOARD_WORDS.tabWorkouts },
    { id: 'kg' as const, label: kgTabLabel(units) },
  ];
  const listedMe = list.top.some((r) => r.me);

  return (
    <Card style={{ gap: space.sm, marginTop: space.md }}>
      {board.challenge ? <ChallengeBlock c={board.challenge} today={today} units={units} /> : null}
      <Text accessibilityRole="header" style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
        {BOARD_WORDS.title}
      </Text>
      <SegmentedTabs tabs={tabs} value={tab} onChange={setTab} />
      {list.top.length === 0 && !list.me ? <Text style={textStyle()}>{BOARD_WORDS.empty}</Text> : null}
      <View style={{ gap: space.xs }}>
        {list.top.map((r, i) => {
          const profile = r.me ? null : profileFor(mates?.[tab], i, r.rank, r.name);
          return (
          <Pressable
            key={`${r.rank}-${r.name}-${r.value}-${r.me ? 'me' : ''}`}
            accessible
            accessibilityRole={profile ? 'button' : undefined}
            accessibilityHint={profile ? MATE_WORDS.openHint : undefined}
            onPress={() => {
              if (profile) router.push({ pathname: '/shop/mate/[id]', params: { id: profile, name: r.name } });
            }}
            accessibilityLabel={`${rankText(r.rank)}, ${r.me ? BOARD_WORDS.you : r.name}, ${valueText(tab, r.value, units)}${r.me ? '. That is you' : ''}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.md,
              minHeight: 44,
              paddingHorizontal: space.sm,
              borderRadius: radius.sm,
              backgroundColor: r.me ? color.accentSoft : 'transparent',
            }}
          >
            <Text style={{ width: 40, fontFamily: type.monoBold, fontSize: type.size.body, color: r.me ? color.accentBright : color.inkMuted }}>{rankText(r.rank)}</Text>
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                fontFamily: r.me ? type.bodySemi : type.bodyMedium,
                fontSize: type.size.body,
                color: profile ? color.accent : color.ink,
                textDecorationLine: profile ? 'underline' : 'none',
              }}
            >
              {r.me ? BOARD_WORDS.you : r.name}
            </Text>
            <Text style={{ fontFamily: type.monoBold, fontSize: type.size.sub, color: r.me ? color.accentBright : color.inkSecondary }}>{valueText(tab, r.value, units)}</Text>
          </Pressable>
          );
        })}
      </View>
      {list.me && !listedMe ? (
        <Text style={{ ...textStyle(), fontFamily: type.bodySemi, color: color.ink, marginTop: space.xs }}>{youLine(list.me.rank, list.me.value, tab, units)}</Text>
      ) : null}
      {!list.me && list.top.length > 0 ? <Text style={{ ...textStyle(), marginTop: space.xs }}>{BOARD_WORDS.notListed}</Text> : null}
    </Card>
  );
}

function ChallengeBlock({ c, today, units }: { c: BoardChallenge; today: string; units: UnitSystem }) {
  const line = challengeLine(c, today, units);
  return (
    <View
      accessible
      accessibilityLabel={`${c.title}. ${line}.${c.hit ? ` ${BOARD_WORDS.hit(c.prizeDays)}` : ''}`}
      style={{ gap: space.xs, paddingBottom: space.md, marginBottom: space.xs, borderBottomWidth: 1, borderBottomColor: color.border }}
    >
      <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>{c.title}</Text>
      <Text style={textStyle()}>{line}</Text>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: color.surfaceSunken, overflow: 'hidden' }}>
        <View style={{ width: `${Math.round(challengeFill(c) * 100)}%`, height: 8, borderRadius: 4, backgroundColor: c.hit ? color.accentBright : color.accent }} />
      </View>
      {c.hit ? <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, lineHeight: 20, color: color.accentBright }}>{BOARD_WORDS.hit(c.prizeDays)}</Text> : null}
    </View>
  );
}
