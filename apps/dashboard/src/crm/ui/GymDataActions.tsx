/**
 * Settings → Your data, the owner's two "leaving" actions (launch plan D8, 21 Oct 2026):
 *  - Download all your gym's data: one Excel file (a sheet per kind of record) + the full JSON copy
 *    (logic/gymExport.ts). Works for every gym, online or in this browser only.
 *  - Delete our gym from MettleUp (online gyms): sends a delete request to MettleUp's box. The deletion
 *    itself is done by MettleUp within 30 days after calling the gym back (docs/launch/GYM-DELETE.md),
 *    as the privacy notice says; nothing is deleted from this button.
 */
import { useState } from 'react';

import { useAuth } from '../auth/AuthProvider';
import { downloadGymData } from '../logic/gymExport';
import { sendFeedback } from '../logic/feedback';
import { useCrm } from '../store';
import { downloadTextFile } from './download';
import { Button, Sheet, color, font, space } from './kit';

export const DELETE_WORDS = {
  ask: 'Delete our gym from MettleUp',
  title: 'Delete your gym from MettleUp?',
  body:
    'Download your data first. Then we delete every member, payment, check-in and shop order of this gym from our server within 30 days, and call you on the gym’s number to confirm before we do. This cannot be undone.',
  send: 'Send delete request',
  sent: 'Request sent. We will call you on the gym’s number before anything is deleted.',
} as const;

export function GymDataActions({ online }: { online: boolean }) {
  const { snapshot } = useCrm();
  const session = useAuth().session;
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; words: string } | null>(null);

  const download = async () => {
    setBusy(true);
    setNote(null);
    try {
      await downloadGymData(snapshot, downloadTextFile);
      setNote({ ok: true, words: 'Downloaded: an Excel file and a full copy.' });
    } catch (e) {
      console.warn('[gym export] failed', e);
      setNote({ ok: false, words: 'Could not make the file. Try again.' });
    } finally {
      setBusy(false);
    }
  };

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
      <div style={{ marginTop: space.lg }}>
        <Button variant="ghost" wrap disabled={busy} needsInternet onClick={() => void download()}>
          Download all your gym’s data
        </Button>
      </div>
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
