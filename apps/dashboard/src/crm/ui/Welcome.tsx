/**
 * First run — a brand new, empty CRM.
 *
 * Two doors, stated plainly: set up your real gym, or look around a demo one. The
 * mobile app's Phase O2 lesson applies exactly here — a real gym owner must never
 * find someone else's fake members in their own roster, so the demo is always an
 * explicit choice and never the default.
 */

import { useState } from 'react';

import { useCrm } from '../store';
import { Button, Card, ErrorBanner, TextField, color, font, radius, space } from './kit';

export function Welcome() {
  const { loadDemoGym, startEmptyGym } = useCrm();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: color.bg,
        display: 'grid',
        placeItems: 'center',
        padding: space.xl,
      }}
    >
      <div style={{ width: '100%', maxWidth: 460 }}>
        <div style={{ textAlign: 'center', marginBottom: space.xxl }}>
          <div
            style={{
              fontFamily: font.display,
              fontSize: 30,
              fontWeight: 800,
              color: color.ink,
              letterSpacing: -0.5,
            }}
          >
            FORGE<span style={{ color: color.accent }}>AI</span>
          </div>
          <p style={{ margin: `${space.sm}px 0 0`, fontFamily: font.body, fontSize: 15, color: color.inkSecondary }}>
            Run your gym: members, renewals, dues and attendance in one place.
          </p>
        </div>

        {error && <ErrorBanner>{error}</ErrorBanner>}

        <Card>
          <h2 style={{ margin: 0, fontFamily: font.display, fontSize: 17, fontWeight: 600, color: color.ink }}>
            Set up your gym
          </h2>
          <p style={{ margin: `6px 0 0`, fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>
            Starts empty. You add your members and your prices — nothing is made up for you.
          </p>

          <TextField
            label="Gym name"
            value={name}
            onChange={setName}
            placeholder="Iron Temple Fitness"
            autoFocus
          />

          <div style={{ marginTop: space.lg }}>
            <Button
              full
              disabled={busy || name.trim().length < 2}
              onClick={() => run(() => startEmptyGym(name.trim()))}
            >
              {busy ? 'Setting up…' : 'Create my gym'}
            </Button>
          </div>
        </Card>

        <div
          style={{
            marginTop: space.lg,
            padding: space.lg,
            border: `1px dashed ${color.borderStrong}`,
            borderRadius: radius.lg,
            textAlign: 'center',
          }}
        >
          <p style={{ margin: 0, fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>
            Just want to see what it does?
          </p>
          <div style={{ marginTop: space.md }}>
            <Button variant="ghost" disabled={busy} onClick={() => run(loadDemoGym)}>
              Explore a demo gym
            </Button>
          </div>
          <p style={{ margin: `${space.sm}px 0 0`, fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>
            Loads a sample gym with 128 made-up members. You can erase it any time from Settings.
          </p>
        </div>
      </div>
    </div>
  );
}
