/**
 * R-344 (owner, 5 Nov 2026), F193 step 1: the one calm line under the finish screen's big card when a
 * workout is lighter than last time. Last night's sleep when it was short (Settings → Health apps →
 * "Sleep and workouts"), else now and then a protein tip. The words and every rule are PURE in
 * phone/sleepLink.ts (shortDayNote); this only reads the night (in memory, never stored or sent) and draws it.
 * Design: docs/design/sleep-protein-line.dc.html (option A, picked: under the big card, no heading).
 */
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { Card, Icon } from '@/components/ui';
import { color, space, type } from '@/theme/tokens';

import { usePhonePrefs } from '../phone/phonePrefs';
import { QA_SLEEP_NOTE, qaSleepInUse, readLastNight, shortDayNote, type ShortDayNote } from '../phone/sleepLink';
import type { HeroTone } from '../services/kgHero';

export function ShortDayLine({
  workoutId,
  startedAt,
  dateISO,
  tone,
  easyWeek,
}: {
  workoutId: string;
  startedAt: number;
  dateISO: string;
  tone: HeroTone | null | undefined;
  easyWeek: boolean;
}) {
  const [note, setNote] = useState<ShortDayNote | null>(null);
  const [qa, setQa] = useState(false);
  // Worked out once per workout: a protein tip counts as shown the moment it is chosen.
  const doneFor = useRef<string | null>(null);

  useEffect(() => {
    if (tone !== 'down' || easyWeek || doneFor.current === workoutId) return;
    doneFor.current = workoutId;
    let alive = true;
    void readLastNight(startedAt).then((sleep) => {
      if (!alive) return;
      const p = usePhonePrefs.getState();
      const n = shortDayNote({ tone, easyWeek, sleep, todayISO: dateISO, tipDay: p.proteinTipDay, tipNext: p.proteinTipNext });
      if (n?.kind === 'protein') p.setSleepLink({ proteinTipDay: dateISO, proteinTipNext: n.next });
      setQa(qaSleepInUse());
      setNote(n);
    });
    return () => {
      alive = false;
    };
  }, [workoutId, startedAt, dateISO, tone, easyWeek]);

  if (!note) return null;
  return (
    <Card style={{ gap: space.xs }}>
      <View accessible accessibilityLabel={note.text} style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
        <View style={{ marginTop: 2 }}>
          <Icon name={note.kind === 'sleep' ? 'clock' : 'meal'} size={20} color={color.accent} />
        </View>
        <Text style={{ flex: 1, fontFamily: type.body, fontSize: type.size.body, color: color.ink, lineHeight: 21 }}>{note.text}</Text>
      </View>
      {qa && note.kind === 'sleep' ? (
        <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted, marginLeft: 20 + space.md }}>{QA_SLEEP_NOTE}</Text>
      ) : null}
    </Card>
  );
}
