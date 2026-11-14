/**
 * F79 online payments (R-328, 4 Nov 2026): the admin app's calls to MettleUp's web server for payments
 * (deploy/panel/pay.js, same site: /api/pay/...). The gym's payment-company keys never come back here:
 * the server keeps them sealed and answers only "connected, ends in 3456".
 *
 * Off until the server parts are live: an answer { on: false } (tables not there yet, or no master key),
 * a 404 (an older server) or no answer at all all read as "not switched on yet", and the screens hide
 * the online parts. The desk's UPI QR does not need any of this (logic/upiPay.ts).
 */

import { isDemoLocked } from '../../lib/demoLock';
import type { Paise } from '../logic/money';

export type ProviderId = 'razorpay' | 'cashfree' | 'payu' | 'phonepe';

export interface PayConnection {
  provider: ProviderId;
  mode: 'test' | 'live';
  testMode: boolean;
  via: 'keys' | 'oauth';
  hint: string;
  on: boolean;
  offReason: '' | 'disconnected' | 'revoked' | 'bad_keys';
  connectedAt: string;
}

export interface PayField {
  name: string;
  label: string;
  secret: boolean;
  placeholder: string;
}

export interface PayProvider {
  id: ProviderId;
  name: string;
  fields: PayField[];
  oauth: boolean;
  connection: PayConnection | null;
}

/**
 * R-528: the owner's two switches. `ready` false = the server part (D1 0016) is not on yet: shown greyed. An older
 * server sends none (undefined): read as not ready.
 */
export interface PaySwitches {
  ready: boolean;
  /** "Take payments in the member app". */
  app: boolean;
  /** "Take payments on your web page and join link". */
  web: boolean;
}

export type DeskPay =
  | { on: false; why: 'NOT_READY' | 'NO_MASTER_KEY' | 'OFFLINE' | 'DEMO' }
  | { on: true; connectOn: boolean; testMode: boolean; canManage: boolean; providers: PayProvider[]; switches?: PaySwitches };

export interface PayRequest {
  id: string;
  /** 'join' (R-528): paid on the join page; `ref` is the request's enquiry id, there is no member yet. */
  kind: 'fee' | 'shop' | 'join';
  memberId: string | null;
  ref: string;
  amountP: Paise;
  label: string;
  note: string;
  upiId: string | null;
  payee: string;
  provider: ProviderId | null;
  providerName: string | null;
  testMode: boolean;
  url: string | null;
  status: 'open' | 'paid' | 'cancelled' | 'expired';
  failed: boolean;
  paidP: Paise;
  method: 'upi' | 'card' | 'bank' | 'other' | null;
  paymentId: string | null;
  paidAt: string | null;
  late: boolean;
  receiptNo: string | null;
  recorded: boolean;
  createdAt: string;
  expiresAt: string | null;
}

/** A refusal with the server's code (BAD_KEYS, OWNER_ONLY, CHECK...) and, for CHECK, its words. */
export class PayRefused extends Error {
  constructor(
    readonly code: string,
    readonly words: string | null = null,
  ) {
    super(code);
    this.name = 'PayRefused';
  }
}

const TIMEOUT_MS = 20_000;

/** POST /api/pay/<path>. Resolves to the JSON answer; throws PayRefused for a refusal, Error('OFFLINE') with no answer. */
export async function payCall<T>(path: string, body: Record<string, unknown>, fetcher: typeof fetch = fetch): Promise<T> {
  if (isDemoLocked()) throw new PayRefused('DEMO');
  const ac = new AbortController();
  const timer = window.setTimeout(() => ac.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetcher(`/api/pay/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: ac.signal,
      cache: 'no-store',
    });
  } catch (e) {
    console.warn('[pay] the server could not be reached', path, e instanceof Error ? e.name : 'error');
    throw new Error('OFFLINE');
  } finally {
    window.clearTimeout(timer);
  }
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = {};
  }
  if (res.status === 404 && !json.error) throw new PayRefused('NOT_READY');
  if (!res.ok || typeof json.error === 'string') {
    const code = typeof json.error === 'string' ? json.error : `HTTP_${res.status}`;
    console.warn('[pay] refused', path, code);
    throw new PayRefused(code, typeof json.words === 'string' ? json.words : null);
  }
  if (json.on === false) throw new PayRefused(typeof json.why === 'string' ? json.why : 'NOT_READY');
  return json as T;
}

/** Settings -> Payments and the money sheets. Also hands the server the gym's UPI ID (for members' shop QR). */
export async function deskPay(key: string, gym: { upiId: string | null; name: string }): Promise<DeskPay> {
  try {
    const r = await payCall<Omit<Extract<DeskPay, { on: true }>, 'on'>>('desk', { key, upiId: gym.upiId ?? '', payee: gym.name });
    return { on: true, ...r };
  } catch (e) {
    if (e instanceof PayRefused) {
      const why = e.code === 'NO_MASTER_KEY' || e.code === 'DEMO' ? e.code : 'NOT_READY';
      return { on: false, why };
    }
    return { on: false, why: 'OFFLINE' };
  }
}

export async function connectKeys(key: string, provider: ProviderId, fields: Record<string, string>): Promise<PayConnection> {
  const r = await payCall<{ connection: PayConnection }>('connect', { key, provider, fields });
  return r.connection;
}

export async function disconnect(key: string, provider: ProviderId): Promise<PayConnection> {
  const r = await payCall<{ connection: PayConnection }>('disconnect', { key, provider });
  return r.connection;
}

export async function oauthStart(key: string, provider: ProviderId): Promise<string> {
  const r = await payCall<{ url: string }>('oauth/start', { key, provider });
  return r.url;
}

export interface NewRequest {
  kind: 'fee' | 'shop';
  memberId?: string;
  ref: string;
  amountP: Paise;
  label: string;
  note: string;
  upiId: string | null;
  payee: string;
  /** Passed through to the payment company (Cashfree needs it); never kept by MettleUp. */
  name?: string;
  phone?: string | null;
  /** false = a UPI-only request (shown in the member's app), no company link. */
  online?: boolean;
}

export async function makeRequest(key: string, req: NewRequest): Promise<{ request: PayRequest; linkError: string | null }> {
  const r = await payCall<{ request: PayRequest; linkError?: string }>('request', { key, ...req, phone: tenDigits(req.phone) });
  return { request: r.request, linkError: r.linkError ?? null };
}

export async function checkRequest(key: string, id: string): Promise<PayRequest> {
  return (await payCall<{ request: PayRequest }>('check', { key, id })).request;
}

export async function cancelRequest(key: string, id: string): Promise<PayRequest> {
  return (await payCall<{ request: PayRequest }>('cancel', { key, id })).request;
}

export async function paidOnline(key: string): Promise<{ paid: PayRequest[]; shopPaid: { orderId: string; paidP: Paise }[] }> {
  return payCall('paid', { key });
}

export async function claimReceipt(key: string, id: string): Promise<{ token: string | null; request: PayRequest }> {
  const r = await payCall<{ token?: string; taken?: boolean; request: PayRequest }>('claim', { key, id });
  return { token: r.token ?? null, request: r.request };
}

export async function markRecorded(key: string, id: string, o: { token?: string | null; receiptNo: string; method?: string; amountP?: Paise }): Promise<PayRequest> {
  return (await payCall<{ request: PayRequest }>('recorded', { key, id, ...o })).request;
}

/** R-528: Settings -> Payments, the owner's switches. Owner only (the server checks). */
export async function saveSwitches(key: string, patch: { app?: boolean; web?: boolean }): Promise<PaySwitches> {
  return (await payCall<{ switches: PaySwitches }>('switches', { key, ...patch })).switches;
}

/** R-528: a payment made on the join page; `said` = a plain UPI payment the person says they made (check the bank). */
export interface JoinPay extends PayRequest {
  said: boolean;
}

/** R-528: the join page's payments of the last 45 days, for Today's "Joined online". */
export async function joinPays(key: string): Promise<JoinPay[]> {
  const r = await payCall<{ joins?: JoinPay[] }>('joins', { key });
  return Array.isArray(r.joins) ? r.joins : [];
}

/** "+91 98290 12345" -> "9829012345"; anything else -> null. PURE. */
export function tenDigits(phone: string | null | undefined): string | null {
  const d = String(phone ?? '').replace(/\D/g, '');
  const ten = d.length === 12 && d.startsWith('91') ? d.slice(2) : d.length === 11 && d.startsWith('0') ? d.slice(1) : d;
  return /^[6-9][0-9]{9}$/.test(ten) ? ten : null;
}
