import { Dashboard } from './components/Dashboard';
import { Login } from './components/Login';
import { Onboarding } from './components/Onboarding';
import { Button, Centered } from './components/ui';
import { useGymData } from './hooks/useGymData';
import { useSession } from './hooks/useSession';
import { supabase } from './lib/supabase';

const signOut = () => void supabase.auth.signOut();

export function App() {
  const { session, loading } = useSession();
  if (loading) return <Centered>Loading…</Centered>;
  if (!session) return <Login />;
  // key by user id → a cross-tab account switch fully remounts, never races state.
  return <Authed key={session.user.id} userId={session.user.id} email={session.user.email ?? ''} />;
}

function Authed({ userId, email }: { userId: string; email: string }) {
  const { loading, error, profile, gym, members, reload } = useGymData(userId);

  if (loading) return <Centered>Loading your gym…</Centered>;

  if (error) {
    return (
      <Centered>
        <div>{error}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={reload}>Retry</Button>
          <Button variant="ghost" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </Centered>
    );
  }

  if (profile?.role === 'member') {
    return (
      <Centered>
        <div>This is a member account. Please use the ForgeAI app — the dashboard is for gym owners.</div>
        <Button variant="ghost" onClick={signOut}>
          Sign out
        </Button>
      </Centered>
    );
  }

  if (!gym) return <Onboarding email={email} onCreated={reload} />;

  return (
    <Dashboard gym={gym} members={members} email={email} onReload={reload} onSignOut={signOut} />
  );
}
