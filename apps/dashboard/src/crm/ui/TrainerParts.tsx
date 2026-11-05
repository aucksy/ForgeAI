/**
 * F109 "Trainers see their members' progress": the small pieces outside the "Training progress" page.
 *  - useTrainerAccess(): may this signed-in key open "Training progress" ('owner' / 'trainer'), or not ('no')?
 *  - TrainerTick: the owner's "Trainer" tick on a person (Settings -> Staff & sign-in). The person's role stays
 *    what it was, so a trainer never gets the owner's powers.
 *  - MemberTrainerCard: the owner picks a member's trainer on the member's page.
 * All hidden until the gym's server has the trainer view (0050), and in the demo gym.
 */

import { useCallback, useEffect, useState } from 'react';

import { useAuth, useRole } from '../auth/AuthProvider';
import { trainerErrorWords, type TrainerSetup } from '../logic/trainerView';
import { errorWords } from '../shop/logic';
import * as trainerApi from '../shop/trainerApi';
import { Card, CheckField, ErrorBanner, SectionTitle, SelectField, color, font, space } from './kit';

/** The signed-in key, when the gym is online. */
function useOnlineKey(): string | null {
  const { session } = useAuth();
  return session?.online ? (session.ownerKey ?? null) : null;
}

/** May this key open "Training progress"? Asks the server once per page load. */
export function useTrainerAccess(): trainerApi.TrainerAccess {
  const key = useOnlineKey();
  const [, setTick] = useState(0);
  useEffect(() => trainerApi.onTrainerAccessChange(() => setTick((n) => n + 1)), []);
  useEffect(() => {
    if (!key || trainerApi.trainerAccess(key) !== 'unknown') return;
    trainerApi.getTrainerMembers(key).catch((e: unknown) => console.warn('[trainer view] checking access', e));
  }, [key]);
  return trainerApi.trainerAccess(key);
}

/** The owner's view of who is a trainer and who trains whom; null while unknown or without 0050. */
export function useTrainerSetup(): {
  setup: TrainerSetup | null;
  save: (run: (key: string) => Promise<TrainerSetup>) => Promise<string | null>;
} {
  const key = useOnlineKey();
  const owner = useRole() === 'owner';
  const [setup, setSetup] = useState<TrainerSetup | null>(null);
  useEffect(() => {
    if (!key || !owner || trainerApi.trainerAccess(key) === 'no') return;
    let live = true;
    trainerApi
      .getTrainerSetup(key)
      .then((s) => {
        if (live && s !== 'missing') setSetup(s);
      })
      .catch((e: unknown) => console.warn('[trainer view] reading the trainers', e));
    return () => {
      live = false;
    };
  }, [key, owner]);
  const save = useCallback(
    async (run: (key: string) => Promise<TrainerSetup>): Promise<string | null> => {
      if (!key) return 'Your gym needs to be online for this.';
      try {
        setSetup(await run(key));
        return null;
      } catch (e) {
        console.warn('[ForgeErr] trainer view: saving', e);
        return trainerErrorWords(e) ?? errorWords(e);
      }
    },
    [key],
  );
  return { setup, save };
}

/** Settings -> Staff & sign-in: the "Trainer" tick on one person (owner only; hidden without 0050). */
export function TrainerTick({ staffId, setup, save }: { staffId: string; setup: TrainerSetup | null; save: ReturnType<typeof useTrainerSetup>['save'] }) {
  const [error, setError] = useState<string | null>(null);
  const person = setup?.people.find((p) => p.id === staffId);
  if (!setup || !person) return null;
  return (
    <>
      <CheckField
        checked={person.trainer}
        onChange={(v) => {
          setError(null);
          void save((key) => trainerApi.setTrainer(key, staffId, v)).then(setError);
        }}
        hint="Sees the workout progress of the members you give them, in Training progress. Nothing else changes."
      >
        Trainer
      </CheckField>
      {error && <ErrorBanner>{error}</ErrorBanner>}
    </>
  );
}

const quiet = { margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary } as const;

/** A member's page: the owner picks the member's trainer. Hidden without 0050 or with no trainer ticked yet. */
export function MemberTrainerCard({ memberId }: { memberId: string }) {
  const owner = useRole() === 'owner';
  const { setup, save } = useTrainerSetup();
  const [error, setError] = useState<string | null>(null);
  const trainers = setup?.people.filter((p) => p.trainer) ?? [];
  if (!owner || !setup || trainers.length === 0) return null;
  const current = setup.assigned[memberId] ?? '';
  return (
    <Card style={{ marginBottom: space.lg }}>
      <SectionTitle>Trainer</SectionTitle>
      <p style={quiet}>The trainer sees this member's workout progress in Training progress, if the member shares it from the app.</p>
      <div style={{ marginTop: space.md }}>
        <SelectField
          label="Trainer"
          value={current}
          onChange={(v) => {
            setError(null);
            void save((key) => trainerApi.assignTrainer(key, memberId, v || null)).then(setError);
          }}
          options={[{ value: '', label: 'No trainer' }, ...trainers.map((t) => ({ value: t.id, label: t.name }))]}
        />
      </div>
      {error && <ErrorBanner>{error}</ErrorBanner>}
    </Card>
  );
}
