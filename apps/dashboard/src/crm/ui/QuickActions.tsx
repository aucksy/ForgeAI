/**
 * Today → quick action buttons (owner backlog, Planned; logic/quickActions.ts). Big icon buttons for
 * the desk's common jobs. The owner picks up to six and their order with "Change buttons"; the choice
 * is kept in this browser per gym (a convenience: losing it brings the default four back).
 */
import { useState } from 'react';

import { canOpen } from '../auth/permissions';
import { useCan, useRole } from '../auth/AuthProvider';
import {
  MAX_QUICK,
  QUICK_ACTIONS,
  moveQuick,
  normalizeQuick,
  quickButtons,
  toggleQuick,
  type QuickActionId,
} from '../logic/quickActions';
import { useCrm } from '../store';
import { Icon } from './icons';
import { Button, Sheet, TOUCH, color, font, radius, space } from './kit';
import { Link } from './router';

const keyFor = (gymId: string) => `forgeai.quickActions.${gymId}`;

function readSaved(gymId: string): QuickActionId[] {
  try {
    const raw = localStorage.getItem(keyFor(gymId));
    return normalizeQuick(raw == null ? null : JSON.parse(raw));
  } catch (e) {
    console.warn('[quick actions] saved choice unreadable', e);
    return normalizeQuick(null);
  }
}

function save(gymId: string, ids: QuickActionId[]) {
  try {
    localStorage.setItem(keyFor(gymId), JSON.stringify(ids));
  } catch (e) {
    console.warn('[quick actions] could not save', e);
  }
}

export function QuickActions() {
  const { snapshot } = useCrm();
  const role = useRole();
  const owner = useCan()('eraseOrDemo');
  const gymId = snapshot.gym.gymId;
  const [ids, setIds] = useState(() => readSaved(gymId));
  const [editing, setEditing] = useState(false);
  const buttons = quickButtons(ids, (p) => canOpen(role, p));

  const update = (next: QuickActionId[]) => {
    setIds(next);
    save(gymId, next);
  };

  return (
    <nav aria-label="Quick actions" style={{ marginBottom: space.lg }}>
      {buttons.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: space.sm }}>
          {buttons.map((b) => (
            <Link key={b.id} to={b.path}>
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: space.sm,
                  minHeight: TOUCH + 12,
                  padding: `${space.sm}px ${space.md}px`,
                  borderRadius: radius.lg,
                  border: `1px solid ${color.border}`,
                  background: color.surfaceRaised,
                  color: color.ink,
                  fontFamily: font.body,
                  fontSize: 15,
                  fontWeight: 700,
                }}
              >
                <span style={{ display: 'grid', placeItems: 'center', width: 36, height: 36, borderRadius: radius.md, background: color.accentSoft, color: color.accentBright, flexShrink: 0 }}>
                  <Icon name={b.icon} size={20} />
                </span>
                {b.label}
              </span>
            </Link>
          ))}
        </div>
      ) : null}
      {owner ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          style={{ marginTop: space.xs, minHeight: TOUCH, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: color.inkSecondary, fontFamily: font.body, fontSize: 14, fontWeight: 700 }}
        >
          Change buttons
        </button>
      ) : null}
      {editing ? (
        <Sheet title="Quick buttons" onClose={() => setEditing(false)} footer={<Button onClick={() => setEditing(false)}>Done</Button>}>
          <p style={{ margin: `0 0 ${space.md}px`, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
            {`Pick up to ${MAX_QUICK} and put them in order. Staff see only the ones they may use.`}
          </p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid' }}>
            {QUICK_ACTIONS.map((a, i) => {
              const on = ids.includes(a.id);
              const at = ids.indexOf(a.id);
              const full = !on && ids.length >= MAX_QUICK;
              return (
                <li key={a.id} style={{ display: 'flex', alignItems: 'center', gap: space.sm, minHeight: TOUCH + 4, borderTop: i ? `1px solid ${color.border}` : 'none' }}>
                  <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: space.sm, fontFamily: font.body, fontSize: 15, color: full ? color.inkMuted : color.ink, cursor: full ? 'not-allowed' : 'pointer', minHeight: TOUCH }}>
                    <input type="checkbox" checked={on} disabled={full} onChange={() => update(toggleQuick(ids, a.id))} style={{ width: 20, height: 20 }} />
                    {a.label}
                  </label>
                  {on ? (
                    <>
                      <Button variant="quiet" disabled={at === 0} onClick={() => update(moveQuick(ids, a.id, -1))} ariaLabel={`Move ${a.label} earlier`}>
                        ↑
                      </Button>
                      <Button variant="quiet" disabled={at === ids.length - 1} onClick={() => update(moveQuick(ids, a.id, 1))} ariaLabel={`Move ${a.label} later`}>
                        ↓
                      </Button>
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Sheet>
      ) : null}
    </nav>
  );
}
