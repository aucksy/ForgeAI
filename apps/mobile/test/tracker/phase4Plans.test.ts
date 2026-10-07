/**
 * Phase 4 — routines and plans (v0.26.0). Pure rules: the ready programs, the plan builder
 * (equipment, sore areas, "leave out", split, time, level, goal, weekly sets, swap, the
 * push-up and pull-up ladders), easy weeks, the easy-week Target, the share file and text,
 * and the builder's in-memory answers. Every module here is new in Phase 4, so each test
 * fails on v0.25.1 (the import does not exist there).
 */
import { describe, expect, it } from 'vitest';

import { catalogEntry } from '@/tracker/catalog/exerciseCatalog';
import { computeProgressionTarget, targetLine, toEasyTarget, type ProgSession } from '@/tracker/engine/progression';
import {
  alternativesFor,
  buildPlan,
  exercisesFor,
  LADDER_INFO,
  ladderAbove,
  splitFor,
  swapInPlan,
  templatesFor,
  weeklySets,
  weeklyTarget,
  type BuilderInput,
} from '@/tracker/plans/builder';
import {
  EASY_EVERY,
  EASY_REASON,
  EASY_WEEKS_DEFAULT,
  easySets,
  isEasyWeek,
  nextEasyWeek,
  planWeek,
  skipEasyWeek,
  takeEasyNow,
} from '@/tracker/plans/easyWeek';
import { fits, fitsEquipment, PLAN_EQUIPMENT, SORE_AREAS, soreAreasOf, type PlanEquipment } from '@/tracker/plans/fit';
import { programByKey, programGroups, programRoutines, PROGRAMS, setsAndReps } from '@/tracker/plans/programs';
import {
  makeRoutineFile,
  parseRoutineFile,
  ROUTINE_FILE_KIND,
  routineFileJson,
  routineFileName,
  routinesText,
  type SharedRoutine,
} from '@/tracker/plans/routineFile';
import { parseFolderSettings } from '@/tracker/db/folderRepo';
import { planLine, planNowOf, withEasyWeeks } from '@/tracker/services/planState';
import { DEFAULT_INPUT, usePlanBuilder } from '@/tracker/store/planBuilderStore';
import type { Exercise } from '@/types/models';

const input = (over: Partial<BuilderInput> = {}): BuilderInput => ({ ...DEFAULT_INPUT, ...over });
const keysOf = (p: ReturnType<typeof buildPlan>): string[] => p.routines.flatMap((r) => r.exercises.map((x) => x.key));
const LEVELS = ['beginner', 'intermediate', 'advanced'] as const;

// ------------------------------------------------------------------ ready programs

describe('ready programs', () => {
  it('every exercise is a real library exercise (a program always lands on pictures and rules)', () => {
    for (const p of PROGRAMS) for (const r of p.routines) for (const x of r.exercises) expect(catalogEntry(x.key), `${p.key}: ${x.key}`).not.toBeNull();
  });

  it('keys are unique and each group runs beginner to advanced', () => {
    expect(new Set(PROGRAMS.map((p) => p.key)).size).toBe(PROGRAMS.length);
    const groups = programGroups();
    expect(groups.map((g) => g.label)).toEqual(['Gym', 'Dumbbells only', 'Home']);
    for (const g of groups) expect(new Set(g.programs.map((p) => p.level))).toEqual(new Set(LEVELS));
  });

  it("a group's programs fit its equipment (dumbbells: dumbbells and a bench; home: a pull-up bar)", () => {
    for (const p of PROGRAMS) {
      const kit: PlanEquipment = p.equipment === 'gym' ? 'gym' : p.equipment === 'dumbbells' ? 'dumbbells_bench' : 'bar';
      for (const r of p.routines) {
        for (const x of r.exercises) {
          const e = catalogEntry(x.key)!;
          if (fitsEquipment(e, kit)) continue;
          // The one exception says so on its card: dips on two sturdy chairs.
          expect(`${p.key}:${x.key}`).toBe('home_calisthenics_advanced:chest_dip');
          expect(p.summary).toMatch(/chairs for dips/);
        }
      }
    }
  });

  it('rep ranges come from the research table: sane, and none for timed work', () => {
    for (const p of PROGRAMS) {
      for (const r of programRoutines(p)) {
        expect(r.exercises.length).toBeGreaterThan(0);
        for (const x of r.exercises) {
          expect(x.repMin).toBeGreaterThanOrEqual(1);
          expect(x.repMax).toBeGreaterThanOrEqual(x.repMin);
          expect(x.sets).toBeGreaterThanOrEqual(1);
          const t = catalogEntry(x.key)!.type;
          expect(x.hasReps).toBe(t === 'weight_reps' || t === 'reps' || t === 'weighted' || t === 'assisted');
        }
      }
    }
    expect(setsAndReps({ sets: 3, repMin: 8, repMax: 12, hasReps: true })).toBe('3 × 8–12');
    expect(setsAndReps({ sets: 3, repMin: 5, repMax: 5, hasReps: true })).toBe('3 × 5');
    expect(setsAndReps({ sets: 1, repMin: 8, repMax: 12, hasReps: false })).toBe('1 set');
  });

  it('home beginners start on an easier push-up than home experts', () => {
    const keys = (key: string) => programByKey(key)!.routines.flatMap((r) => r.exercises.map((x) => x.key));
    const beginner = PROGRAMS.find((p) => p.equipment === 'home' && p.level === 'beginner')!;
    const advanced = PROGRAMS.find((p) => p.equipment === 'home' && p.level === 'advanced')!;
    expect(keys(beginner.key).some((k) => k === 'incline_push_up' || k === 'knee_push_up')).toBe(true);
    expect(keys(advanced.key)).toContain('archer_push_up');
    expect(programByKey('no_such_program')).toBeNull();
  });
});

// ------------------------------------------------------------------ plan builder

describe('plan builder: days and split', () => {
  it('"best for my days" picks the split the days suit', () => {
    expect([2, 3, 4, 5, 6].map((d) => splitFor('auto', d))).toEqual(['full', 'full', 'upper_lower', 'mix5', 'ppl']);
    expect(splitFor('ppl', 3)).toBe('ppl');
  });

  it('one routine per training day, up to the split rotation', () => {
    expect(buildPlan(input({ days: 2 })).routines.map((r) => r.name)).toEqual(['Full Body A', 'Full Body B']);
    expect(buildPlan(input({ days: 3 })).routines).toHaveLength(3);
    expect(buildPlan(input({ days: 4 })).routines.map((r) => r.name)).toEqual(['Upper A', 'Lower A', 'Upper B', 'Lower B']);
    expect(buildPlan(input({ days: 5 })).routines.map((r) => r.name)).toEqual(['Upper', 'Lower', 'Push', 'Pull', 'Legs']);
    expect(buildPlan(input({ days: 6 })).routines).toHaveLength(6);
    expect(buildPlan(input({ days: 3, split: 'ppl' })).routines.map((r) => r.name)).toEqual(['Push', 'Pull', 'Legs']);
    expect(templatesFor('upper_lower', 2).map((t) => t.name)).toEqual(['Upper', 'Lower']);
    expect(buildPlan(input({ days: 4 })).name).toBe('Upper / Lower · 4 days');
  });

  it('time per workout caps the exercises', () => {
    for (const minutes of [30, 45, 60, 75]) {
      for (const r of buildPlan(input({ minutes, days: 4, level: 'advanced' })).routines) {
        expect(r.exercises.length).toBeLessThanOrEqual(exercisesFor(minutes));
      }
    }
    expect(buildPlan(input({ minutes: 30 })).routines[0].exercises).toHaveLength(4);
  });

  it('big lifts come first on a pull day (before: a deadlift after the curls)', () => {
    for (const days of [5, 6]) {
      const plan = buildPlan(input({ days, level: 'intermediate' }));
      for (const r of plan.routines.filter((x) => x.dayType === 'pull')) {
        const firstSmall = r.exercises.findIndex((x) => x.slot === 'rear_delt' || x.slot === 'biceps');
        const big = (slot: string) => slot === 'hinge' || slot === 'v_pull' || slot === 'h_pull';
        const lastBig = Math.max(...r.exercises.map((x, i) => (big(x.slot) ? i : -1)));
        expect(lastBig, r.name).toBeLessThan(firstSmall);
      }
    }
  });
});

describe('plan builder: what fits the member', () => {
  it('every exercise fits the equipment, at every level', () => {
    for (const equipment of PLAN_EQUIPMENT) {
      for (const level of LEVELS) {
        for (const days of [3, 4, 6]) {
          for (const k of keysOf(buildPlan(input({ equipment, level, days })))) {
            expect(fitsEquipment(catalogEntry(k)!, equipment), `${equipment}/${level}/${days}: ${k}`).toBe(true);
          }
        }
      }
    }
  });

  it('a sore area leaves out the moves that load it', () => {
    for (const a of SORE_AREAS) {
      for (const equipment of ['gym', 'none'] as const) {
        const plan = buildPlan(input({ sore: [a], equipment, days: 4, level: 'intermediate' }));
        for (const k of keysOf(plan)) expect(soreAreasOf(k), `${a}/${equipment}: ${k}`).not.toContain(a);
      }
    }
    // A sore knee drops the lunges but the legs still train.
    const knee = buildPlan(input({ sore: ['knee'], days: 4 }));
    expect(keysOf(knee).some((k) => k.includes('lunge') || k.includes('split_squat'))).toBe(false);
    expect(keysOf(knee)).toContain('leg_press');
  });

  it('"leave out" is obeyed, and the slot is filled by the next choice', () => {
    const before = buildPlan(input());
    expect(keysOf(before)).toContain('leg_press');
    const after = buildPlan(input({ avoid: ['leg_press', 'lat_pulldown'] }));
    expect(keysOf(after)).not.toContain('leg_press');
    expect(keysOf(after)).not.toContain('lat_pulldown');
    expect(after.routines[0].exercises[0].slot).toBe('squat');
    expect(after.routines[0].exercises).toHaveLength(before.routines[0].exercises.length);
  });

  it('no press fits (no equipment): a push-up stands in, so day B still pushes (before: no push on day B)', () => {
    const b = buildPlan(input({ equipment: 'none' })).routines[1];
    expect(b.exercises.some((x) => x.slot === 'h_push')).toBe(true);
  });

  it('says plainly what the setup cannot cover', () => {
    expect(buildPlan(input({ equipment: 'none' })).notes.join(' ')).toMatch(/supermans and bird dogs/);
    expect(buildPlan(input({ equipment: 'dumbbells', level: 'intermediate' })).notes).toContain('Without a pull-up bar, rows stand in for pull-ups.');
    expect(buildPlan(input()).notes).toEqual([]);
  });

  it('fits() joins all three filters', () => {
    const squat = catalogEntry('barbell_back_squat')!;
    expect(fits(squat, { equipment: 'gym', sore: [], avoid: [] })).toBe(true);
    expect(fits(squat, { equipment: 'dumbbells', sore: [], avoid: [] })).toBe(false);
    expect(fits(squat, { equipment: 'gym', sore: ['lower_back'], avoid: [] })).toBe(false);
    expect(fits(squat, { equipment: 'gym', sore: [], avoid: ['barbell_back_squat'] })).toBe(false);
  });
});

describe('plan builder: level and goal change the plan (Hevy Trainer barely changes)', () => {
  it('level picks the rung: machines for a beginner, barbells for an expert', () => {
    const b = buildPlan(input({ level: 'beginner' })).routines[0].exercises[0];
    const a = buildPlan(input({ level: 'advanced' })).routines[0].exercises[0];
    expect(b.key).toBe('leg_press');
    expect(a.key).toBe('barbell_back_squat');
    expect(a.sets).toBe(4); // a heavy first lift gets a 4th set for trained lifters
    expect(b.sets).toBe(3);
  });

  it('goal sets the rep ranges', () => {
    const squat = (goal: BuilderInput['goal']) => buildPlan(input({ goal, level: 'intermediate' })).routines[0].exercises[0];
    expect(squat('strength').repMax).toBeLessThan(squat('muscle').repMax);
  });

  it('the main muscles get their weekly dose where the time allows', () => {
    const plan = buildPlan(input({ level: 'intermediate', days: 4 }));
    const weekly = new Map(plan.weekly.map((w) => [w.muscle, w.sets]));
    for (const m of ['chest', 'lats', 'upper_back', 'quads', 'hamstrings', 'glutes'] as const) {
      expect(weekly.get(m) ?? 0, m).toBeGreaterThanOrEqual(weeklyTarget('muscle', 'intermediate') - 1);
    }
    // Weekly sets are counted the same way as the plan shows them.
    expect(weeklySets(plan.routines, 4).get('chest')).toBeCloseTo(weekly.get('chest')!, 0);
  });
});

describe('plan builder: push-ups and pull-ups climb a ladder (research v3 §4.4)', () => {
  it('a home beginner starts on incline push-ups with the next versions waiting', () => {
    const push = buildPlan(input({ equipment: 'none' })).routines[0].exercises.find((x) => x.slot === 'h_push')!;
    expect(push.key).toBe('incline_push_up');
    expect(push.ladder).toEqual(['Push-Up', 'Decline Push-Up', 'Archer Push-Up']);
  });

  it('with a bar a beginner gets negatives toward the pull-up; the ladder stops at what the kit allows', () => {
    const pull = buildPlan(input({ equipment: 'bar' })).routines[0].exercises.find((x) => x.slot === 'v_pull')!;
    expect(pull.key).toBe('negative_pull_up');
    expect(pull.ladder[0]).toMatch(/^Pull-?up$/i);
    expect(pull.ladder.some((n) => /weighted/i.test(n))).toBe(false); // no plates at home
    expect(ladderAbove('assisted_pull_up').some((n) => /weighted/i.test(n))).toBe(true); // the gym has them
  });

  it('the climb in the i matches the rules: 15 pull-ups, 25 push-ups', () => {
    expect(catalogEntry('pull_up')!.repCap).toBe(15);
    expect(catalogEntry('push_up')!.repCap).toBe(25);
    expect(LADDER_INFO).toContain('15 pull-ups');
    expect(LADDER_INFO).toContain('25 push-ups');
  });
});

describe('plan builder: swap', () => {
  it('alternatives fit the kit, skip what the routine has, and keep the kind', () => {
    const ctx = { level: 'beginner' as const, exclude: ['lat_pulldown', 'seated_cable_row'], equipment: 'gym' as const, sore: [], avoid: [] };
    const alts = alternativesFor('lat_pulldown', ctx);
    expect(alts.length).toBeGreaterThan(0);
    expect(alts.length).toBeLessThanOrEqual(4);
    for (const a of alts) {
      expect(ctx.exclude).not.toContain(a.key);
      expect(catalogEntry(a.key)!.primary.includes('cardio')).toBe(false);
    }
    const home = alternativesFor('push_up', { level: 'intermediate', exclude: [], equipment: 'none', sore: [], avoid: [] });
    for (const a of home) expect(fitsEquipment(catalogEntry(a.key)!, 'none')).toBe(true);
    expect(home.some((a) => a.reason.endsWith('harder version') || a.reason.endsWith('easier version'))).toBe(true);
    // A hold swaps for a hold.
    for (const a of alternativesFor('plank', { level: 'beginner', exclude: [], equipment: 'gym', sore: [], avoid: [] })) {
      expect(catalogEntry(a.key)!.type).toBe('time');
    }
    expect(alternativesFor('no_such_key', ctx)).toEqual([]);
  });

  it('a swap keeps the sets and slot, takes its own rep range and ladder, and updates the weekly sets', () => {
    const inp = input({ equipment: 'bar' });
    const plan = buildPlan(inp);
    const i = plan.routines[0].exercises.findIndex((x) => x.slot === 'v_pull');
    const old = plan.routines[0].exercises[i];
    const swapped = swapInPlan(plan, inp, 0, i, 'inverted_row');
    const now = swapped.routines[0].exercises[i];
    expect(now.key).toBe('inverted_row');
    expect(now.sets).toBe(old.sets);
    expect(now.slot).toBe(old.slot);
    expect(plan.routines[0].exercises[i].key).toBe(old.key); // the old plan is untouched
    expect(swapped.weekly).not.toEqual(plan.weekly);
    expect(swapInPlan(plan, inp, 0, i, 'no_such_key')).toBe(plan);
  });
});

// ------------------------------------------------------------------ easy weeks

describe('easy weeks (research v3 §6.4)', () => {
  const every6 = { every: EASY_EVERY, base: 0 };

  it('the default is every 6 weeks, on (an open owner decision)', () => {
    expect(EASY_EVERY).toBe(6);
    expect(EASY_WEEKS_DEFAULT).toBe(true);
  });

  it('weeks count from the day the plan was followed', () => {
    expect(planWeek('2026-10-01', '2026-10-01')).toBe(1);
    expect(planWeek('2026-10-01', '2026-10-07')).toBe(1);
    expect(planWeek('2026-10-01', '2026-10-08')).toBe(2);
    expect(planWeek('2026-10-01', '2026-09-20')).toBe(1); // a clock set back never gives week 0
  });

  it('every 6th week is easy; "take one now" and "train normally" move the next one', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 12].map((w) => isEasyWeek(every6, w))).toEqual([false, false, false, false, false, true, false, true]);
    expect(nextEasyWeek(every6, 3)).toBe(6);
    expect(nextEasyWeek(every6, 7)).toBe(12);
    const now = takeEasyNow(every6, 3);
    expect(isEasyWeek(now, 3)).toBe(true);
    expect(nextEasyWeek(now, 4)).toBe(9);
    const skip = skipEasyWeek(every6, 6);
    expect(isEasyWeek(skip, 6)).toBe(false);
    expect(nextEasyWeek(skip, 6)).toBe(12);
    expect(isEasyWeek(null, 6)).toBe(false);
  });

  it('half the sets, at least one', () => {
    expect([1, 2, 3, 4, 5].map(easySets)).toEqual([1, 1, 2, 2, 3]);
  });

  it('switching easy weeks on counts from this week', () => {
    const on = withEasyWeeks({ startISO: '2026-09-01' }, true, 4);
    expect(on.easy).toEqual({ every: 6, base: 3 });
    expect(nextEasyWeek(on.easy, 4)).toBe(9);
    expect(withEasyWeeks(on, false, 4).easy).toBeNull();
  });

  it('the plan line says where the member is', () => {
    const folder = { id: 'f', name: 'Plan', following: true, settings: { startISO: '2026-10-01', easy: every6 } };
    expect(planLine(planNowOf(folder, '2026-10-15'))).toBe('Week 3 · easy week in week 6');
    expect(planLine(planNowOf(folder, '2026-11-06'))).toBe('Easy week this week');
    expect(planLine(planNowOf({ ...folder, settings: { startISO: '2026-10-01' } }, '2026-10-15'))).toBe('Week 3');
    expect(planNowOf({ ...folder, following: false }, '2026-10-15')).toBeNull();
    expect(planLine(null)).toBeNull();
  });

  it('folder settings survive odd stored values', () => {
    expect(parseFolderSettings(null)).toEqual({});
    expect(parseFolderSettings('not json')).toEqual({});
    expect(parseFolderSettings('[1,2]')).toEqual({});
    expect(parseFolderSettings('{"easy":{"every":1,"base":0},"startISO":"2026-13"}')).toEqual({});
    expect(parseFolderSettings('{"easy":null,"program":"gym_ppl_advanced","startISO":"2026-10-01"}')).toEqual({
      easy: null,
      program: 'gym_ppl_advanced',
      startISO: '2026-10-01',
    });
  });
});

describe('the Target in an easy week', () => {
  const bench: Exercise = { id: 'b', name: 'Bench Press', aliases: [], muscleGroup: 'chest', secondaryMuscles: [], equipment: 'barbell', isCompound: true, incrementKg: 2.5 };
  const session = (dateISO: string, kg: number, reps: number): ProgSession => ({
    dateISO,
    sets: [0, 1, 2].map(() => ({ weightKg: kg, reps, rpe: null, setType: 'normal' as const })),
  });
  const target = (history: ProgSession[]) =>
    computeProgressionTarget({ exercise: bench, target: { targetSets: 3, repRangeMin: 8, repRangeMax: 12 }, history, todayISO: '2026-10-07' });

  it('half the sets at the same weight — never "Up", never a rep to chase', () => {
    const up = target([session('2026-10-03', 60, 12), session('2026-09-30', 57.5, 12)]);
    expect(up.change).toBe('up');
    const easy = toEasyTarget(up, EASY_REASON, easySets);
    expect(easy.easy).toBe(true);
    expect(easy.targetWeightKg).toBe(60); // last time's weight, not the step up
    expect(easy.targetSets).toBe(2);
    expect(easy.change).toBeNull();
    expect(easy.repGoal).toBeNull();
    expect(targetLine(easy)).toBe('Easy week · 60 kg · 2 sets');
    expect(easy.reason).toBe(EASY_REASON);
  });

  it('a first time stays a first time', () => {
    const first = target([]);
    expect(toEasyTarget(first, EASY_REASON, easySets)).toBe(first);
  });
});

// ------------------------------------------------------------------ sharing

describe('sharing a routine as a file or text', () => {
  const routines: SharedRoutine[] = [
    {
      name: 'Upper A',
      dayType: 'upper',
      exercises: [
        { name: 'Barbell Bench Press', catalogKey: 'barbell_bench_press', logType: 'weight_reps', sets: 3, repMin: 6, repMax: 10, primary: ['chest'] },
        { name: 'Plank', catalogKey: 'plank', logType: 'time', sets: 2, repMin: 10, repMax: 15, primary: ['abs'] },
        { name: 'My Band Pull', catalogKey: null, logType: 'reps', sets: 1, repMin: 15, repMax: 15, primary: ['rear_delts'] },
      ],
    },
  ];

  it('the file reads back exactly', () => {
    const file = makeRoutineFile('Summer plan', routines);
    const back = parseRoutineFile(routineFileJson(file));
    expect(back).toEqual({ ok: true, file });
    expect(file.kind).toBe(ROUTINE_FILE_KIND);
  });

  it('the text reads well anywhere', () => {
    expect(routinesText('Summer plan', routines)).toBe(
      'Summer plan\n\nUpper A · Upper Body\n1. Barbell Bench Press — 3 × 6–10\n2. Plank — 2 sets\n3. My Band Pull — 1 × 15\n\nMade with ForgeAI',
    );
    expect(routinesText(null, [{ name: 'Empty', dayType: 'full', exercises: [] }])).toBe('Empty · Full Body\n(no exercises yet)\n\nMade with ForgeAI');
  });

  it('a safe file name', () => {
    expect(routineFileName('Upper A')).toBe('upper-a.forgeai.json');
    expect(routineFileName('  ')).toBe('routine.forgeai.json');
    expect(routineFileName('Push/Pull: Week #1')).toBe('push-pull-week-1.forgeai.json');
  });

  it('refuses what it cannot use, in plain words', () => {
    const bad = (text: string) => {
      const r = parseRoutineFile(text);
      return r.ok ? null : r.reason;
    };
    expect(bad('hello')).toBe('That file is not a routine file.');
    expect(bad('{"kind":"other"}')).toBe('That file is not a ForgeAI routine file.');
    expect(bad(`{"kind":"${ROUTINE_FILE_KIND}","version":2,"routines":[{}]}`)).toMatch(/newer ForgeAI/);
    expect(bad(`{"kind":"${ROUTINE_FILE_KIND}","version":1,"routines":[]}`)).toBe('That file has no routines in it.');
    expect(bad(`{"kind":"${ROUTINE_FILE_KIND}","version":1,"routines":[{"name":"x","exercises":[{"name":""}]}]}`)).toBe('An exercise in that file is damaged.');
    const many = JSON.stringify({ kind: ROUTINE_FILE_KIND, version: 1, routines: Array.from({ length: 31 }, () => ({ name: 'r', exercises: [] })) });
    expect(bad(many)).toMatch(/30 at most/);
  });

  it('brings odd numbers into range instead of refusing an older file', () => {
    const r = parseRoutineFile(
      JSON.stringify({
        kind: ROUTINE_FILE_KIND,
        version: 1,
        folder: '',
        routines: [{ name: ' Legs ', dayType: 'nonsense', exercises: [{ name: 'Squat', catalogKey: 'BAD KEY!', logType: 'x', sets: 99, repMin: 0, repMax: -5, primary: ['quads', 'nope'] }] }],
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.file.folder).toBeNull();
    expect(r.file.routines[0].name).toBe('Legs');
    expect(r.file.routines[0].dayType).toBe('full');
    expect(r.file.routines[0].exercises[0]).toEqual({ name: 'Squat', catalogKey: null, logType: 'weight_reps', sets: 12, repMin: 1, repMax: 1, primary: ['quads'] });
  });
});

// ------------------------------------------------------------------ the builder's answers

describe("the builder's answers (in memory until the plan is followed)", () => {
  it('starts from the profile, remembers names for the leave-out chips, builds and swaps', () => {
    const s = usePlanBuilder.getState();
    s.start({ goal: 'strength', level: 'advanced' });
    expect(usePlanBuilder.getState().input).toMatchObject({ goal: 'strength', level: 'advanced', days: 3, avoid: [] });
    expect(usePlanBuilder.getState().easyWeeks).toBe(EASY_WEEKS_DEFAULT);

    s.toggleAvoid('barbell_back_squat', 'Barbell Back Squat');
    expect(usePlanBuilder.getState().input.avoid).toEqual(['barbell_back_squat']);
    expect(usePlanBuilder.getState().avoidNames).toEqual({ barbell_back_squat: 'Barbell Back Squat' });
    s.toggleSore('knee');
    s.set({ days: 4 });
    s.build();
    const plan = usePlanBuilder.getState().plan!;
    expect(plan.routines).toHaveLength(4);
    expect(keysOf(plan)).not.toContain('barbell_back_squat');

    const first = plan.routines[0].exercises[0];
    const alt = alternativesFor(first.key, { level: 'advanced', exclude: plan.routines[0].exercises.map((x) => x.key), equipment: 'gym', sore: ['knee'], avoid: ['barbell_back_squat'] })[0];
    s.swap(0, 0, alt.key);
    expect(usePlanBuilder.getState().plan!.routines[0].exercises[0].key).toBe(alt.key);

    s.toggleAvoid('barbell_back_squat', 'Barbell Back Squat');
    expect(usePlanBuilder.getState().avoidNames).toEqual({});
    s.clearPlan();
    expect(usePlanBuilder.getState().plan).toBeNull();
    // A fresh start forgets the last member's answers.
    s.start({ goal: null, level: null });
    expect(usePlanBuilder.getState().input).toEqual(DEFAULT_INPUT);
  });
});
