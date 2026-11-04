/**
 * F147 Bring a friend (4 Nov 2026): Settings -> Member app -> "Bring a friend".
 *
 * Members invite friends from the MettleUp app's Gym tab; each friend's form lands in Enquiries marked
 * "Referred by <member>". Here the owner sets the free days a member gets for each friend who joins
 * (empty = none, the default) and sees how many links, asks and joins there were. The days are never
 * given by themselves: the owner taps once on the enquiry (Enquiries.tsx, logic/referrals.ts).
 *
 * Hidden until the gym's server has 0056 (friendApi.ts), and for a gym that is not online.
 */

import { useEffect, useState } from 'react';

import { useAuth } from '../../auth/AuthProvider';
import { checkFriendDays, friendRewardDays } from '../../logic/referrals';
import * as friendApi from '../../shop/friendApi';
import { useCrm } from '../../store';
import { Button, Card, SectionTitle, TextField, Toast, color, font, space } from '../kit';

const quiet = { margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary } as const;

export function BringAFriendCard() {
  const { session } = useAuth();
  const { snapshot, updateGym } = useCrm();
  const key = session?.online ? (session.ownerKey ?? null) : null;
  const [summary, setSummary] = useState<friendApi.FriendSummary | null>(null);
  const [shown, setShown] = useState(friendApi.friendServer() === 'yes');
  const saved = friendRewardDays(snapshot.gym);
  const [text, setText] = useState(saved ? String(saved) : '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!key || friendApi.friendServer() === 'no') return;
    let live = true;
    friendApi
      .friendSummary(key)
      .then((r) => {
        if (!live) return;
        setShown(r !== 'missing');
        if (r !== 'missing') setSummary(r);
      })
      .catch((e: unknown) => console.warn('[bring a friend] reading the counts', e));
    return () => {
      live = false;
    };
  }, [key]);

  // The gym's copy can arrive (or change on another device) after the card opens.
  useEffect(() => {
    setText(saved ? String(saved) : '');
  }, [saved]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  if (!key || !shown) return null;

  // Any change can be tapped: a wrong number is then explained under the box (a greyed button explains nothing).
  const changed = text.trim() !== (saved ? String(saved) : '');

  const save = async () => {
    const c = checkFriendDays(text);
    if (!c.ok) {
      setError(c.message);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await updateGym({ friendRewardDays: c.days });
      setText(c.days ? String(c.days) : '');
      setToast(c.days ? `Saved. A member gets ${c.days} free ${c.days === 1 ? 'day' : 'days'} for each friend who joins.` : 'Saved. No free days for a friend who joins.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ marginBottom: space.lg }}>
      <SectionTitle>Bring a friend</SectionTitle>
      <p style={quiet}>
        Members can send a friend a link from the MettleUp app. The friend leaves a name and number, and it shows in Enquiries
        with the member’s name.
      </p>
      <div style={{ marginTop: space.lg, maxWidth: 360 }}>
        <TextField
          label="Free days for each friend who joins"
          value={text}
          onChange={(v) => {
            setText(v);
            setError(null);
          }}
          inputMode="numeric"
          placeholder="None"
          error={error}
          hint="Leave it empty to give no free days. When a friend joins, you choose to give the days with one tap. They are never added by themselves."
        />
      </div>
      <div style={{ marginTop: space.md }}>
        <Button needsInternet disabled={busy || !changed} onClick={save}>
          Save free days
        </Button>
      </div>
      {summary && (
        <p style={{ ...quiet, marginTop: space.lg, fontSize: 13 }} data-testid="friend-summary">
          {`Friends who left their number: ${summary.asked} · Friends who joined: ${summary.joined}`}
        </p>
      )}
      {toast && <Toast message={toast} />}
    </Card>
  );
}
