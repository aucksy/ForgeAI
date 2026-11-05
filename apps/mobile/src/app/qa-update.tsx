/**
 * R-336 device UAT, QA builds only: mettleup://qa-update?behind=3 makes this phone see a made-up update
 * 3 versions ahead (behind=0 turns it off), counts as a launch, and opens the Workout tab, so the uat part
 * can photograph the full screen and the orange line. Store and GitHub release builds never carry the
 * 'updateOffer' stand-in (qa-device.yml adds it to app.json), so there this only opens the Workout tab.
 */
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { setUpdateStandIn, useAppUpdate } from '@/lib/updateStore';

export default function QaUpdate() {
  const { behind } = useLocalSearchParams<{ behind?: string }>();
  const [done, setDone] = useState(false);
  useEffect(() => {
    const n = Number(behind ?? '0');
    void setUpdateStandIn(Number.isFinite(n) ? n : 0)
      .catch((e: unknown) => console.warn('[update] QA stand-in not saved', e))
      .then(() => {
        useAppUpdate.getState().laterPopup();
        return useAppUpdate.getState().check({ launch: true });
      })
      .catch((e: unknown) => console.warn('[update] QA check failed', e))
      .finally(() => setDone(true));
  }, [behind]);
  return done ? <Redirect href="/workout" /> : null;
}
