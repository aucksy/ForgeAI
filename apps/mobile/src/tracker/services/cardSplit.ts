/**
 * LW-28 — the same exercise on two cards (Bench heavy, then Bench back-off) stays two cards
 * after saving. PURE.
 *
 * The frozen session reader groups a workout's sets by exercise, so both cards came back as
 * ONE Bench with sets 1–6 and the second card's note and superset were hidden. Since tracker
 * schema v10 every set keeps its card (`card_index`, read into the set meta); this splits a
 * group back into its cards, each in the place it had in the workout. A workout without a
 * second card comes back exactly as it went in (same object).
 */
import type { SetMeta } from '@/tracker/db/trackerSets';
import type { SessionDetail } from '@/types/models';

type Group = SessionDetail['exercises'][number];

export function splitCards(detail: SessionDetail, meta: Record<string, SetMeta>): SessionDetail {
  const cardOf = (id: string): number => meta[id]?.cardIndex ?? 0;
  if (!detail.exercises.some((g) => g.sets.some((s) => cardOf(s.id) > 0))) return detail;

  const out: { group: Group; first: number }[] = [];
  for (const g of detail.exercises) {
    const byCard = new Map<number, Group['sets']>();
    for (const s of g.sets) {
      const c = cardOf(s.id);
      const list = byCard.get(c) ?? [];
      list.push(s);
      byCard.set(c, list);
    }
    const cards = [...byCard.keys()].sort((a, b) => a - b);
    for (const c of cards) {
      const sets = byCard.get(c)!;
      const seqs = sets.map((s) => meta[s.id]?.seq).filter((n): n is number => n != null);
      const volumeKg = sets.reduce((sum, s) => sum + (s.isWarmup ? 0 : s.weightKg * s.reps), 0);
      out.push({
        group: cards.length === 1 ? g : { ...g, sets, volumeKg },
        // Written order when known (cards of different exercises interleave), else in place.
        first: seqs.length === sets.length && seqs.length > 0 ? Math.min(...seqs) : Number.NaN,
      });
    }
  }
  const ordered = out.every((o) => !Number.isNaN(o.first))
    ? [...out].sort((a, b) => a.first - b.first)
    : out;
  const exercises = ordered.map((o) => o.group);
  return { ...detail, exercises, totalVolumeKg: exercises.reduce((sum, g) => sum + g.volumeKg, 0) };
}
