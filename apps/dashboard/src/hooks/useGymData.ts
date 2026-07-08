import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '../lib/supabase';
import type { Gym, MemberSummary, Profile } from '../types';

export interface GymData {
  loading: boolean;
  error: string | null;
  profile: Profile | null;
  gym: Gym | null;
  members: MemberSummary[];
  reload: () => void;
}

/**
 * Loads the signed-in owner's profile, their gym, and their gym's member_summary
 * rows. RLS scopes every read to the owner's own gym (a member/other gym sees
 * nothing). Members appear here once they've synced at least once.
 */
export function useGymData(userId: string | undefined): GymData {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [gym, setGym] = useState<Gym | null>(null);
  const [members, setMembers] = useState<MemberSummary[]>([]);
  // Generation guard (mirrors useSession's `active` flag): only the newest load may
  // write state. Stops an out-of-order older response (e.g. a cross-tab account
  // switch that changes userId mid-flight) from overwriting the newer gym's data.
  const genRef = useRef(0);

  const load = useCallback(async () => {
    if (!userId) return;
    const gen = ++genRef.current;
    const alive = () => gen === genRef.current;
    setLoading(true);
    setError(null);
    try {
      const { data: prof, error: pErr } = await supabase
        .from('profiles')
        .select('id, gym_id, role, display_name')
        .eq('id', userId)
        .maybeSingle();
      if (!alive()) return;
      if (pErr) throw pErr;
      const typedProfile = (prof as Profile | null) ?? null;
      setProfile(typedProfile);

      if (!typedProfile?.gym_id) {
        setGym(null);
        setMembers([]);
        return;
      }

      const [gymRes, memberRes] = await Promise.all([
        supabase
          .from('gyms')
          .select('gym_id, name, join_code')
          .eq('gym_id', typedProfile.gym_id)
          .maybeSingle(),
        supabase
          .from('member_summary')
          .select('*')
          .eq('gym_id', typedProfile.gym_id)
          .order('last_active_at', { ascending: false, nullsFirst: false }),
      ]);
      if (!alive()) return;
      if (gymRes.error) throw gymRes.error;
      if (memberRes.error) throw memberRes.error;
      setGym((gymRes.data as Gym | null) ?? null);
      setMembers((memberRes.data as MemberSummary[] | null) ?? []);
    } catch (e) {
      if (!alive()) return;
      setError(e instanceof Error ? e.message : 'Failed to load your gym.');
    } finally {
      if (alive()) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
    // Invalidate any in-flight load on unmount / userId change.
    return () => {
      genRef.current++;
    };
  }, [load]);

  return { loading, error, profile, gym, members, reload: () => void load() };
}
