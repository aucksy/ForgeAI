/**
 * The owner's calls to the cloud shop — thin wrappers over the Supabase RPCs in
 * `supabase/migrations/0002_shop.sql`. Every call carries the owner key; the
 * database checks it before anything else. Errors are thrown as-is (a Postgres
 * message such as BAD_KEY) and turned into plain words by `errorWords`.
 */

import { parseGymBrand, type GymBrand, type HeadingStyle } from '@forgeai/theme';

import { supabase } from '../../lib/supabase';
import {
  appMemberFromRow,
  orderFromRow,
  productFromRow,
  type AppMember,
  type Order,
  type OrderStatus,
  type Product,
  type SavePayload,
} from './logic';

import { sentFromRow, sentFromRows, type MessageDraft, type SentMessage } from './messages';
import { reminderPayload, remindersFromAnswer, type ReminderSettings, type RemindersAnswer } from '../logic/autoReminders';
import {
  giveFromAnswer,
  offerFromRow,
  offersFromAnswer,
  undoFromAnswer,
  type CheckedDraft,
  type GiveAnswer,
  type OffersAnswer,
  type WorkoutOffer,
} from '../logic/workoutOffer';

type Row = Record<string, unknown>;

/** Give up on a call after this long — a hung request must not freeze a button. */
const TIMEOUT_MS = 15_000;

export async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  let timer: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error('timed out')), TIMEOUT_MS);
  });
  try {
    const res = await Promise.race([supabase.rpc(fn, args), timeout]);
    if (res.error) throw res.error;
    return res.data as T;
  } finally {
    window.clearTimeout(timer);
  }
}

export interface CloudGymInfo {
  gymId: string;
  name: string;
  joinCode: string;
  /** Gym branding (0005): null when the gym has none, or the server predates branding. */
  brand?: GymBrand | null;
}

export async function startDemoGym(name: string): Promise<CloudGymInfo & { ownerKey: string }> {
  const r = await call<Row>('demo_start_gym', { p_name: name });
  return {
    gymId: String(r.gymId),
    name: String(r.name),
    joinCode: String(r.joinCode),
    ownerKey: String(r.ownerKey),
  };
}

export async function ownerGym(key: string): Promise<CloudGymInfo> {
  const r = await call<Row>('owner_gym', { p_key: key });
  return { gymId: String(r.gymId), name: String(r.name), joinCode: String(r.joinCode), brand: parseGymBrand(r.brand) };
}

/**
 * Gym branding: save the gym's whole look (owner_set_brand, 0005). Nulls clear; all nulls and
 * 'normal' are MettleUp's own look. Members get it on their next app launch (new members at once).
 */
export async function setBrand(
  key: string,
  args: { p_accent: string | null; p_bg: string | null; p_logo_url: string | null; p_heading: HeadingStyle },
): Promise<GymBrand | null> {
  const r = await call<Row>('owner_set_brand', { p_key: key, ...args });
  return parseGymBrand(r.brand);
}

export async function renameGym(key: string, name: string): Promise<CloudGymInfo> {
  const r = await call<Row>('owner_rename_gym', { p_key: key, p_name: name });
  return { gymId: String(r.gymId), name: String(r.name), joinCode: String(r.joinCode) };
}

export async function listProducts(key: string): Promise<Product[]> {
  const rows = await call<Row[]>('owner_products', { p_key: key });
  return (rows ?? []).map(productFromRow);
}

export async function saveProduct(key: string, p: SavePayload): Promise<Product> {
  const r = await call<Row>('owner_save_product', { p_key: key, p });
  return productFromRow(r);
}

export async function deleteProduct(key: string, productId: string): Promise<void> {
  await call<null>('owner_delete_product', { p_key: key, p_product: productId });
}

export async function listOrders(key: string): Promise<Order[]> {
  const rows = await call<Row[]>('owner_orders', { p_key: key });
  return (rows ?? []).map(orderFromRow);
}

export async function setOrderStatus(key: string, orderId: string, status: OrderStatus): Promise<Order> {
  const r = await call<Row>('owner_set_order_status', { p_key: key, p_order: orderId, p_status: status });
  return orderFromRow(r);
}

export async function listAppMembers(key: string): Promise<AppMember[]> {
  const rows = await call<Row[]>('owner_app_members', { p_key: key });
  return (rows ?? []).map(appMemberFromRow);
}

// ---------------------------------------------------------------- gym messages (0008)

/**
 * Send one message to every app member of the gym, or (0025) only to `to` (app member ids) and/or
 * at `sendAt` (an ISO time). The two new keys go only when set, so an older server still answers
 * the four-argument call. Throws OFFER_TODAY / OFFER_WEEK / TOO_MANY / NO_ONE / BAD_TIME.
 */
export async function sendMessage(
  key: string,
  d: MessageDraft,
  opts: { to?: readonly string[] | null; sendAt?: string | null } = {},
): Promise<SentMessage> {
  const args: Record<string, unknown> = { p_key: key, p_kind: d.kind, p_title: d.title.trim(), p_body: d.body.trim() };
  if (opts.to) args.p_to = [...opts.to];
  if (opts.sendAt) args.p_send_at = opts.sendAt;
  const r = await call<Row>('owner_send_message', args);
  const m = sentFromRow(r);
  if (!m) throw new Error('UNKNOWN');
  return m;
}

// ---------------------------------------------------------------- the workout offer (0025)

/** The gym's offers and their members (owner and front desk). Throws PGRST202 on a server without 0025. */
export async function listOffers(key: string): Promise<OffersAnswer> {
  return offersFromAnswer(await call<unknown>('owner_offers', { p_key: key }));
}

/** Start an offer (no id), or change a running one's giving mode / last day to join (with id). Owner only. */
export async function saveOffer(
  key: string,
  offer: Partial<CheckedDraft> & { id?: string },
): Promise<WorkoutOffer> {
  const o = offerFromRow(await call<unknown>('owner_save_offer', { p_key: key, p_offer: offer }));
  if (!o) throw new Error('UNKNOWN');
  return o;
}

/** Stop an offer: nobody new joins; members in it keep their window. Owner only. */
export async function stopOffer(key: string, offerId: string): Promise<WorkoutOffer> {
  const o = offerFromRow(await call<unknown>('owner_stop_offer', { p_key: key, p_offer: offerId }));
  if (!o) throw new Error('UNKNOWN');
  return o;
}

/** The desk's one tap: give an earned reward (owner and front desk). */
export async function giveReward(key: string, offerId: string, rosterId: string): Promise<GiveAnswer> {
  const r = giveFromAnswer(await call<unknown>('staff_give_reward', { p_key: key, p_offer: offerId, p_roster: rosterId }));
  if (!r) throw new Error('UNKNOWN');
  return r;
}

/** The owner takes a reward back (while the plan still ends where the reward put it). */
export async function undoReward(key: string, offerId: string, rosterId: string): Promise<{ endsOn: string }> {
  const r = undoFromAnswer(await call<unknown>('owner_undo_reward', { p_key: key, p_offer: offerId, p_roster: rosterId }));
  if (!r) throw new Error('UNKNOWN');
  return r;
}

// ---------------------------------------------------------------- automatic reminders (0029, R-86)

/** The owner's switches (owner and front desk read). Throws PGRST202 on a server without 0029. */
export async function getAutoReminders(key: string): Promise<RemindersAnswer> {
  return remindersFromAnswer(await call<unknown>('owner_auto_reminders', { p_key: key }));
}

/** Save every switch and its days. Owner only (the desk gets OWNER_ONLY). */
export async function saveAutoReminders(key: string, settings: ReminderSettings): Promise<RemindersAnswer> {
  return remindersFromAnswer(await call<unknown>('owner_save_auto_reminders', { p_key: key, p_settings: reminderPayload(settings) }));
}

/** The Sent list, newest first, with how many members have seen each. */
export async function listMessages(key: string): Promise<SentMessage[]> {
  return sentFromRows(await call<unknown>('owner_messages', { p_key: key }));
}

/** Take a sent message back out of every member's inbox. */
export async function withdrawMessage(key: string, messageId: string): Promise<void> {
  await call<null>('owner_withdraw_message', { p_key: key, p_message: messageId });
}

/** Add (or with a negative delta, take away) stock on the cloud — never an absolute number. */
export async function addStock(
  key: string,
  productId: string,
  optionId: string | null,
  delta: number,
): Promise<Product> {
  const r = await call<Row>('owner_add_stock', {
    p_key: key,
    p_product: productId,
    p_option: optionId,
    p_delta: delta,
  });
  return productFromRow(r);
}

/** Show or hide a product in the app without touching anything else on it. */
export async function setProductActive(key: string, productId: string, active: boolean): Promise<Product> {
  const r = await call<Row>('owner_set_product_active', { p_key: key, p_product: productId, p_active: active });
  return productFromRow(r);
}

/** A one-time upload ticket (48 hex, 15 minutes): the folder a new photo goes into. */
export async function photoTicket(key: string): Promise<string> {
  const t = await call<string>('owner_photo_ticket', { p_key: key });
  return String(t);
}

/** Point a product at a photo (null removes it). No CHANGED check: only the photo moves. */
export async function setProductPhoto(key: string, productId: string, url: string | null): Promise<Product> {
  const r = await call<Row>('owner_set_product_photo', { p_key: key, p_product: productId, p_url: url });
  return productFromRow(r);
}
