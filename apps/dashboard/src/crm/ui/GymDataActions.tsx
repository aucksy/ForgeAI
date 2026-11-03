/**
 * Settings → Your data, the owner's two "leaving" actions (launch plan D8, 21 Oct 2026):
 *  - Download all your gym's data: one Excel file (a sheet per kind of record) + the full JSON copy
 *    (logic/gymExport.ts). Works for every gym, online or in this browser only.
 *  - Delete our gym from MettleUp (online gyms): sends a delete request to MettleUp's box. The deletion
 *    itself is done by MettleUp within 30 days after calling the gym back (docs/launch/GYM-DELETE.md),
 *    as the privacy notice says; nothing is deleted from this button.
 *
 * Launch audit 3 Nov 2026 (owner side #9): the download sat under "Danger zone", so an owner read
 * it as risky and never kept a copy. It is now its own card (DownloadDataCard) above Your data,
 * with the day this browser last downloaded it. That day is kept in this browser only (a
 * convenience: losing it only hides the line).
 */
import { useState } from 'react';

import { useAuth } from '../auth/AuthProvider';
import { downloadGymData, lastDownloadWords } from '../logic/gymExport';
import { sendFeedback } from '../logic/feedback';
import { useCrm } from '../store';
import { downloadTextFile } from './download';
import { Button, Card, SectionTitle, Sheet, color, font, space } from './kit';

export const DELETE_WORDS = {
  ask: 'Delete our gym from MettleUp',
  title: 'Delete your gym from MettleUp?',
  body:
    'Download your data first. Then we delete every member, payment, check-in and shop order of this gym from our server within 30 days, and call you on the gym’s number to confirm before we do. This cannot be undone.',
  send: 'Send delete request',
  sent: 'Request sent. We will call you on the gym’s number before anything is deleted.',
} as const;

const lastKey = (gymId: string) => `mettleup.lastDownload.${gymId}`;

/** When this browser last downloaded this gym's data (epoch ms), or null. */
export function readLastDownload(gymId: string): number | null {
  try {
    const n = Number(localStorage.getItem(lastKey(gymId)));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch (e) {
    console.warn('[gym export] last download unreadable', e);
    return null;
  }
}

function keepLastDownload(gymId: string, at: number) {
  try {
    localStorage.setItem(lastKey(gymId), String(at));
  } catch (e) {
    console.warn('[gym export] could not keep the download day', e);
  }
}

/** Settings -> Sign-in & data: "Keep a copy of your data", its own card, never under Danger zone. */
export function DownloadDataCard() {
  const { snapshot } = useCrm();
  const gymId = snapshot.gym.gymId;
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(() => readLastDownload(gymId));
  const [note, setNote] = useState<{ ok: boolean; words: string } | null>(null);

  const download = async () => {
    setBusy(true);
    setNote(null);
    try {
      await downloadGymData(snapshot, downloadTextFile);
      const at = Date.now();
      keepLastDownload(gymId, at);
      setLast(at);
      setNote({ ok: true, words: 'Downloaded: an Excel file and a full copy.' });
    } catch (e) {
      console.warn('[gym export] failed', e);
      setNote({ ok: false, words: 'Could not make the file. Try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ marginBottom: space.lg }}>
      <SectionTitle>Keep a copy of your data</SectionTitle>
      <p style={{ margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
        Download every member, plan, payment and check-in as an Excel file. Keep it on your phone or computer. We suggest once a month.
      </p>
      <p style={{ margin: `${space.sm}px 0 0`, fontFamily: font.body, fontSize: 13, color: color.inkMuted }}>{lastDownloadWords(last)}</p>
      <div style={{ marginTop: space.lg }}>
        <Button variant="ghost" wrap disabled={busy} needsInternet onClick={() => void download()}>
          Download all your gym’s data
        </Button>
      </div>
      {note && (
        <p role="status" style={{ margin: `${space.md}px 0 0`, fontFamily: font.body, fontSize: 14, fontWeight: 600, color: note.ok ? color.goodText : color.criticalText }}>
          {note.words}
        </p>
      )}
    </Card>
  );
}

/** Danger zone: "Delete our gym from MettleUp" (online gyms only). */
export function GymDataActions({ online }: { online: boolean }) {
  const { snapshot } = useCrm();
  const session = useAuth().session;
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; words: string } | null>(null);

  const requestDelete = async () => {
    setBusy(true);
    const who = session?.person ? `${session.person.name} (${session.person.role})` : 'owner';
    const r = await sendFeedback(
      `DELETE REQUEST: gym "${snapshot.gym.name}", code ${snapshot.gym.joinCode}, gym phone ${snapshot.gym.phone ?? '-'}, asked by ${who}.`,
      'settings/delete-request',
    );
    setBusy(false);
    setAsking(false);
    setNote(r.ok ? { ok: true, words: DELETE_WORDS.sent } : { ok: false, words: r.words });
  };

  return (
    <>
      {online && (
        <div style={{ marginTop: space.lg }}>
          <Button variant="ghost" tone="danger" wrap disabled={busy} needsInternet onClick={() => setAsking(true)}>
            {DELETE_WORDS.ask}
          </Button>
        </div>
      )}
      {note && (
        <p role="status" style={{ margin: `${space.md}px 0 0`, fontFamily: font.body, fontSize: 14, fontWeight: 600, color: note.ok ? color.goodText : color.criticalText }}>
          {note.words}
        </p>
      )}
      {asking && (
        <Sheet
          title={DELETE_WORDS.title}
          onClose={() => setAsking(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setAsking(false)}>
                Cancel
              </Button>
              <Button tone="danger" disabled={busy} onClick={() => void requestDelete()}>
                {DELETE_WORDS.send}
              </Button>
            </>
          }
        >
          <p style={{ margin: 0, fontFamily: font.body, fontSize: 15, lineHeight: 1.5, color: color.inkSecondary }}>{DELETE_WORDS.body}</p>
        </Sheet>
      )}
    </>
  );
}
