import { useState } from 'react';
import type { FormEvent } from 'react';

import { supabase } from '../lib/supabase';
import { color, font, gradients, space } from '../theme';
import { Button, Card, ErrorText, TextField } from './ui';

/**
 * Owner sign-in / account creation (Supabase Auth, email + password). With email
 * confirmation OFF for the beta, "Create account" returns a session immediately and
 * useSession takes over. Members do NOT sign in here — they use the mobile app.
 */
export function Login() {
  const [createAccount, setCreateAccount] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    try {
      const creds = { email: email.trim(), password };
      if (createAccount) {
        const { data, error: authErr } = await supabase.auth.signUp(creds);
        if (authErr) throw authErr;
        // Confirmation ON (or an already-registered email) returns no session — don't
        // dead-end silently; tell the owner what to do next.
        if (!data.session) {
          setNotice('Account created — check your email to confirm, then sign in.');
          return;
        }
      } else {
        const { error: authErr } = await supabase.auth.signInWithPassword(creds);
        if (authErr) throw authErr;
      }
      // On success, onAuthStateChange (useSession) drives the app forward.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed — please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: space.xl }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: space.xl }}>
          <div
            style={{
              fontFamily: font.display,
              fontSize: 30,
              fontWeight: 700,
              background: gradients.ember,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            ForgeAI
          </div>
          <div style={{ color: color.inkMuted, fontSize: 13, marginTop: 4 }}>Owner dashboard</div>
        </div>

        <Card>
          <form onSubmit={(e) => void submit(e)}>
            <div style={{ display: 'flex', gap: space.sm }}>
              {[
                { k: false, label: 'Sign in' },
                { k: true, label: 'Create account' },
              ].map((opt) => {
                const on = createAccount === opt.k;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => {
                      setCreateAccount(opt.k);
                      setError(null);
                      setNotice(null);
                    }}
                    style={{
                      flex: 1,
                      padding: '8px 0',
                      borderRadius: 999,
                      border: `1px solid ${on ? color.accent : color.border}`,
                      background: on ? color.accentSoft : color.surfaceSunken,
                      color: on ? color.accentBright : color.inkSecondary,
                      fontFamily: font.body,
                      fontWeight: 600,
                      fontSize: 13,
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <TextField label="Email" value={email} onChange={setEmail} type="email" placeholder="you@gym.com" />
            <TextField
              label="Password"
              value={password}
              onChange={setPassword}
              type="password"
              placeholder="At least 6 characters"
            />

            {error ? <ErrorText>{error}</ErrorText> : null}
            {notice ? (
              <div style={{ color: color.goodText, fontFamily: font.body, fontSize: 13, marginTop: space.md }}>
                {notice}
              </div>
            ) : null}

            <div style={{ marginTop: space.lg }}>
              <Button type="submit" disabled={busy}>
                {busy ? 'Please wait…' : createAccount ? 'Create account' : 'Sign in'}
              </Button>
            </div>
          </form>
        </Card>

        <div style={{ textAlign: 'center', color: color.inkFaint, fontSize: 12, marginTop: space.lg }}>
          For gym owners. Members use the ForgeAI app.
        </div>
      </div>
    </div>
  );
}
