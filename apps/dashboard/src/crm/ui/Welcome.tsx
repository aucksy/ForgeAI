/**
 * First run — a brand new, empty CRM.
 *
 * Two doors, stated plainly: start the demo (a real cloud gym with a join code and
 * a shop, plus sample members in this browser), or set up your own gym, empty. The
 * mobile app's Phase O2 lesson applies exactly here — a real gym owner must never
 * find someone else's fake members in their own roster, so the demo is always an
 * explicit choice and never the default. If the cloud cannot be reached, the
 * sample gym still opens without the shop, so a demo never dies on bad Wi-Fi.
 */

import { useState } from 'react';

import { useShop } from '../shop/ShopProvider';
import { useCrm } from '../store';
import { Button, Card, ErrorBanner, TextField, color, font, radius, space } from './kit';

export function Welcome() {
  const { loadDemoGym, startEmptyGym } = useCrm();
  const { startDemo, notice } = useShop();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<'demo' | 'gym' | 'local' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [demoFailed, setDemoFailed] = useState(false);

  const run = async (which: 'demo' | 'gym' | 'local', fn: () => Promise<void>) => {
    setBusy(which);
    setError(null);
    try {
      await fn();
    } catch (e) {
      if (which === 'demo') setDemoFailed(true);
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
      setBusy(null);
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
            Run your gym: members, renewals, dues, attendance — and a shop your members order from in the
            ForgeAI app.
          </p>
        </div>

        {notice && !error && (
          <div
            role="status"
            style={{
              marginBottom: space.lg,
              padding: `${space.md}px ${space.lg}px`,
              borderRadius: radius.md,
              border: `1px solid ${color.borderStrong}`,
              fontFamily: font.body,
              fontSize: 14,
              color: color.inkSecondary,
            }}
          >
            {notice}
          </div>
        )}

        <Card>
          <h2 style={{ margin: 0, fontFamily: font.display, fontSize: 17, fontWeight: 600, color: color.ink }}>
            See it working
          </h2>
          <p style={{ margin: `6px 0 0`, fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>
            Opens a sample gym with made-up members, payments and a shop. You get a real join code, so a
            phone with the ForgeAI app can join and order — and you see the order here.
          </p>

          {error && (
            <div style={{ marginTop: space.md }}>
              <ErrorBanner>{error}</ErrorBanner>
            </div>
          )}

          <div style={{ marginTop: space.lg }}>
            <Button full disabled={busy !== null} onClick={() => run('demo', startDemo)}>
              {busy === 'demo' ? 'Starting your demo gym…' : demoFailed ? 'Try again' : 'Start demo'}
            </Button>
          </div>

          {demoFailed && (
            <div style={{ marginTop: space.sm, textAlign: 'center' }}>
              <Button variant="quiet" disabled={busy !== null} onClick={() => run('local', loadDemoGym)}>
                Open the demo without the shop (works offline)
              </Button>
            </div>
          )}
        </Card>

        <div
          style={{
            marginTop: space.lg,
            // Same inset as the card above, so both cards' text shares one left edge.
            padding: space.xl,
            border: `1px dashed ${color.borderStrong}`,
            borderRadius: radius.lg,
          }}
        >
          <h2 style={{ margin: 0, fontFamily: font.display, fontSize: 17, fontWeight: 600, color: color.ink }}>
            Or set up your own gym
          </h2>
          <p style={{ margin: `6px 0 0`, fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>
            Starts empty. You add your members and your prices — nothing is made up for you.
          </p>

          <TextField
            label="Gym name"
            value={name}
            onChange={setName}
            placeholder="Iron Temple Fitness"
          />

          <div style={{ marginTop: space.lg }}>
            <Button
              variant="ghost"
              full
              disabled={busy !== null || name.trim().length < 2}
              onClick={() => run('gym', () => startEmptyGym(name.trim()))}
            >
              {busy === 'gym' ? 'Setting up…' : 'Create my gym'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
