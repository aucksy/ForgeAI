/**
 * "What's new" in the admin app (R-148; logic/whatsNew.ts). Two places:
 * - WhatsNewCard: top of Today, once after an update ("Got it" hides it until the next one).
 * - WhatsNewScreen: Settings → What's new (/settings/news), every update to read again.
 * Each change may carry a button to the page where it is; a page this person cannot open has none.
 * Not in the demo gym (a visitor there has no "update" to hear about).
 */
import { useState } from 'react';

import { useRole } from '../auth/AuthProvider';
import { canOpen } from '../auth/permissions';
import type { Role } from '../auth/signin';
import { useDemo } from '../demo/demoMode';
import { ADMIN_NEWS, markNewsSeen, newsDay, readNews, type AdminNewsEntry, type AdminNewsLine } from '../logic/whatsNew';
import { Card, PageHeader, SectionTitle, TOUCH, color, font, space } from './kit';
import { navigate } from './router';

/** The button a line gets for this person, or null. PURE. */
export function newsGo(line: AdminNewsLine, role: Role): { label: string; path: string } | null {
  return line.go && canOpen(role, line.go.path) ? line.go : null;
}

const linkStyle = {
  background: 'none',
  border: 'none',
  padding: 0,
  minHeight: TOUCH,
  cursor: 'pointer',
  fontFamily: font.body,
  fontSize: 14,
  fontWeight: 700,
  color: color.accentBright,
  textAlign: 'left',
} as const;

function NewsLines({ entry, role, onGo }: { entry: AdminNewsEntry; role: Role; onGo?: () => void }) {
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: space.sm }}>
      {entry.lines.map((l) => {
        const go = newsGo(l, role);
        return (
          <li key={l.text} style={{ display: 'grid', gap: 2 }}>
            <span style={{ fontFamily: font.body, fontSize: 14, color: color.ink, lineHeight: 1.45 }}>{l.text}</span>
            {go && (
              <button
                type="button"
                style={linkStyle}
                onClick={() => {
                  onGo?.();
                  navigate(go.path);
                }}
              >
                {go.label} ›
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function DayTitle({ id }: { id: string }) {
  return (
    <p style={{ margin: `0 0 ${space.sm}px`, fontFamily: font.body, fontSize: 13, fontWeight: 700, color: color.inkSecondary }}>
      {`Update of ${newsDay(id)}`}
    </p>
  );
}

/** Today: what changed since this browser last looked, once. */
export function WhatsNewCard() {
  const demo = useDemo() !== null;
  const role = useRole();
  const [entries, setEntries] = useState(() => (demo ? [] : readNews()));
  if (demo || entries.length === 0) return null;
  const done = () => {
    setEntries([]);
    markNewsSeen();
  };
  return (
    <Card style={{ marginBottom: space.lg }}>
      <section aria-label="What's new in the admin app">
        <SectionTitle>What's new in the admin app</SectionTitle>
        <div style={{ display: 'grid', gap: space.lg }}>
          {entries.map((e) => (
            <div key={e.id}>
              <DayTitle id={e.id} />
              <NewsLines entry={e} role={role} onGo={done} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: space.lg, marginTop: space.sm }}>
          <button type="button" style={linkStyle} onClick={done} aria-label="Got it. Hide what's new">
            Got it
          </button>
          <button
            type="button"
            style={{ ...linkStyle, color: color.inkSecondary }}
            onClick={() => {
              done();
              navigate('/settings/news');
            }}
          >
            See earlier updates
          </button>
        </div>
      </section>
    </Card>
  );
}

/** Settings → What's new: every update, newest first. */
export function WhatsNewScreen() {
  const role = useRole();
  return (
    <>
      <PageHeader title="What's new" subtitle="Changes to the admin app, newest first" />
      {ADMIN_NEWS.filter((e) => e.lines.length > 0).map((e) => (
        <Card key={e.id} style={{ marginBottom: space.lg }}>
          <SectionTitle>{newsDay(e.id)}</SectionTitle>
          <NewsLines entry={e} role={role} />
        </Card>
      ))}
    </>
  );
}

/** Settings' small card that opens the list. */
export function WhatsNewSettingsCard() {
  return (
    <Card style={{ marginBottom: space.lg }}>
      <SectionTitle>What's new</SectionTitle>
      <p style={{ margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
        {`What changed in the admin app. Last update: ${newsDay(ADMIN_NEWS[0]?.id ?? '')}.`}
      </p>
      <button type="button" style={linkStyle} onClick={() => navigate('/settings/news')}>
        See all updates ›
      </button>
    </Card>
  );
}
