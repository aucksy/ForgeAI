/** Words for the demo's confirm sheets (Phase 1, DS-06). PURE — no React Native. */

/** The confirm's one line: what goes and what stays. PURE. */
export function removeDemoBody(ownWorkouts: number): string {
  const what = 'The sample member’s workouts, body weight, food, plan and records go.';
  if (ownWorkouts <= 0) return `${what} Then you add your own details.`;
  const n = ownWorkouts === 1 ? 'Your own workout stays' : `Your own ${ownWorkouts} workouts stay`;
  return `${what} ${n}. Then you add your details.`;
}

