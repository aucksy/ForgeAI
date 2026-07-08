import { useState } from 'react';
import type { FormEvent } from 'react';

import { supabase } from '../lib/supabase';
import { color, font, space } from '../theme';
import { Button, Card, ErrorText, TextField } from './ui';

/**
 * Shown when a signed-in owner has no gym yet. Calls the create_gym RPC (SECURITY
 * DEFINER) which makes the gym + sets this account as its owner, then triggers a
 * reload so the dashboard appears with the new join code to share with members.
 */
export function Onboarding({ email, onCreated }: { email: string; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Enter a name for your gym.');
      return;
    }
    setBusy(true);
    try {
      const { error: rpcErr } = await supabase.rpc('create_gym', { gym_name: name.trim() });
      if (rpcErr) throw rpcErr;
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your gym — please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: space.xl }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <Card>
          <h1 style={{ margin: 0, fontFamily: font.display, fontSize: 22, fontWeight: 700, color: color.ink }}>
            Create your gym
          </h1>
          <p style={{ color: color.inkSecondary, fontSize: 14, lineHeight: 1.5, marginTop: space.sm }}>
            Signed in as {email}. Name your gym and you'll get a join code to share with members — they
            enter it in the ForgeAI app to sync their progress to you.
          </p>
          <form onSubmit={(e) => void create(e)}>
            <TextField label="Gym name" value={name} onChange={setName} placeholder="e.g. Iron Temple Fitness" />
            {error ? <ErrorText>{error}</ErrorText> : null}
            <div style={{ marginTop: space.lg }}>
              <Button type="submit" disabled={busy}>
                {busy ? 'Creating…' : 'Create gym'}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
