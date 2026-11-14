/**
 * "Numbers to confirm" on Today (0048, R-287): a member who checks in with the gym's poster typed
 * the mobile number the gym has for them; the desk says whether it is really theirs. Yes links the
 * app member to that number (their next Check in works); No leaves them unlinked. Owner and desk
 * alike. Pending ones only; hidden when there are none, until the gym server has 0048, and when
 * signed out of the cloud. Read again with Today (every minute, and when the page comes back).
 * Rules and words: logic/phoneLinks.ts.
 */

import { useMemo, useState } from 'react';

import { useAuth } from '../auth/AuthProvider';
import {
  linkErrorWords,
  linkQuestion,
  linkWho,
  pendingLinks,
  PHONE_LINK_WORDS as W,
  type PhoneLinkRow,
} from '../logic/phoneLinks';
import { decidePhoneLink } from '../shop/phoneLinkApi';
import { useNeedsYou } from './NeedsYou';
import { Button, Card, ErrorBanner, Row, SectionTitle, color, font, space } from './kit';

export function PhoneLinksCard() {
  const { session } = useAuth();
  const key = session?.online ? (session.ownerKey ?? null) : null;
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ id: string; text: string } | null>(null);
  // R-319 item 8a: Today's "Needs you" count drops at once after an answer.
  // R-522: the list itself comes from Needs you too (one read a minute for the whole panel, never with the tab
  // hidden), so this card no longer asks the server on its own timer.
  const needs = useNeedsYou();
  const { linkRows } = needs;
  const rows = useMemo<PhoneLinkRow[] | null>(() => (linkRows ? pendingLinks(linkRows) : null), [linkRows]);

  if (!key || !rows || rows.length === 0) return null;

  const decide = async (r: PhoneLinkRow, decision: 'approved' | 'declined'): Promise<void> => {
    setBusy(r.id);
    setProblem(null);
    try {
      await decidePhoneLink(key, r.id, decision);
    } catch (e) {
      console.warn('[ForgeErr] numbers to confirm: answering', e);
      setProblem({ id: r.id, text: linkErrorWords(e) });
    } finally {
      await needs.refresh(['links']);
      setBusy(null);
    }
  };

  return (
    <Card pad={space.lg} style={{ marginBottom: space.md }}>
      <section aria-label={W.title}>
        <SectionTitle>{W.title}</SectionTitle>
        <p style={{ margin: `0 0 ${space.md}px`, fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>{W.why}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: space.md }}>
          {rows.map((r) => (
            <div key={r.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Row gap={space.md}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontFamily: font.body, fontSize: 14, fontWeight: 600, color: color.ink }}>{linkWho(r)}</div>
                  <div style={{ fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>{linkQuestion(r)}</div>
                </div>
                <Row gap={space.sm} wrap={false}>
                  <Button variant="ghost" disabled={busy !== null} onClick={() => decide(r, 'declined')} ariaLabel={`${W.no}: ${linkWho(r)}`}>
                    {W.no}
                  </Button>
                  <Button disabled={busy !== null} onClick={() => decide(r, 'approved')} ariaLabel={`${W.yes}: ${linkWho(r)}`}>
                    {busy === r.id ? W.working : W.yes}
                  </Button>
                </Row>
              </Row>
              {problem?.id === r.id ? <ErrorBanner>{problem.text}</ErrorBanner> : null}
            </div>
          ))}
        </div>
      </section>
    </Card>
  );
}
