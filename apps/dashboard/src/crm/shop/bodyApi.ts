/**
 * The gym's calls for measurements taken by the trainer and diet plans (R-120): thin wrappers over
 * the RPCs in supabase/migrations/0035_trainer_measurements_diet.sql. Every call carries the owner or
 * desk key; the server checks it and keeps each gym to its own members. A server without 0035
 * answers PGRST202 (`isNoSuchFunction`): the screens then say it is not switched on yet.
 */

import { dietFromRow, dietsFromRows, type DietPayload, type DietPlan } from '../logic/dietPlans';
import { measureFromRow, measuresFromRows, type BodyMeasure, type MeasurePayload } from '../logic/bodyMeasures';
import { call } from './api';

/** A member's measurements, newest day first. */
export async function listMeasures(key: string, memberId: string): Promise<BodyMeasure[]> {
  return measuresFromRows(await call<unknown>('owner_member_measurements', { p_key: key, p_member: memberId }));
}

/** Save one day (no id: new; with id: change it). Throws DAY_TAKEN / BAD_DATE / EMPTY / INVALID / NO_MEMBER / NOT_FOUND. */
export async function saveMeasure(key: string, memberId: string, entry: MeasurePayload): Promise<BodyMeasure> {
  const m = measureFromRow(await call<unknown>('owner_save_measurement', { p_key: key, p_member: memberId, p_entry: entry }));
  if (!m) throw new Error('UNKNOWN');
  return m;
}

export async function deleteMeasure(key: string, id: string): Promise<void> {
  await call<null>('owner_delete_measurement', { p_key: key, p_id: id });
}

/** Every diet plan of the gym, withdrawn ones too. */
export async function listDiets(key: string): Promise<DietPlan[]> {
  return dietsFromRows(await call<unknown>('owner_diet_plans', { p_key: key }));
}

/** Make (no id) or change (with id) a plan. Throws INVALID / NOT_FOUND / WITHDRAWN. */
export async function saveDiet(key: string, plan: DietPayload): Promise<DietPlan> {
  const p = dietFromRow(await call<unknown>('owner_save_diet_plan', { p_key: key, p_plan: plan }));
  if (!p) throw new Error('UNKNOWN');
  return p;
}

export async function withdrawDiet(key: string, id: string): Promise<DietPlan> {
  const p = dietFromRow(await call<unknown>('owner_withdraw_diet_plan', { p_key: key, p_id: id }));
  if (!p) throw new Error('UNKNOWN');
  return p;
}
