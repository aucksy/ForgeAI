/**
 * R-441 (10 Nov 2026): "Add my watch's screen log" under the message in Help and feedback (the page and
 * the floating button's sheet). Shown only when this phone holds a MettleUp watch screen log
 * (lib/watchDiag.ts); off until the member switches it on. Sending happens in the parent, after the
 * message itself was sent (sendWatchLog).
 */
import { useEffect, useState } from 'react';

import { ToggleRow } from '@/components/settings/SettingRow';
import { WATCH_LOG_WORDS, watchLogAvailable } from '@/lib/watchDiag';

/** Is there a log to offer ([available], looked up once while [active]), and is the switch on. */
export function useWatchLog(active: boolean): { available: boolean; on: boolean; setOn: (on: boolean) => void } {
  const [available, setAvailable] = useState(false);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    void watchLogAvailable().then((yes) => {
      if (alive) setAvailable(yes);
    });
    return () => {
      alive = false;
    };
  }, [active]);
  return { available, on: available && on, setOn };
}

export function WatchLogSwitch({ available, on, onChange }: { available: boolean; on: boolean; onChange: (on: boolean) => void }) {
  if (!available) return null;
  return <ToggleRow icon="clock" title={WATCH_LOG_WORDS.title} caption={WATCH_LOG_WORDS.caption} value={on} onChange={onChange} />;
}
