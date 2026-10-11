/**
 * The owner's calls to the cloud shop — thin wrappers over the Supabase RPCs in
 * `supabase/migrations/0002_shop.sql`. Every call carries the owner key; the
 * database checks it before anything else. Errors are thrown as-is (a Postgres
 * message such as BAD_KEY) and turned into plain words by `errorWords`.
 */

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

type Row = Record<string, unknown>;

/** Give up on a call after this long — a hung request must not freeze a button. */
const TIMEOUT_MS = 15_000;

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
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
  return { gymId: String(r.gymId), name: String(r.name), joinCode: String(r.joinCode) };
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
