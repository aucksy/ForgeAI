// #41 (24 Oct 2026): a pretend server for a gym with BRANCHES, for the branch journeys.
//
// Each branch is its own FakeServer (support.mjs), exactly as each branch is its own gym on the real
// server (supabase/migrations/0031_branches.sql): its own records, version, people and keys. This
// network sends every call to the branch whose key it carries, and answers the branch calls itself
// (owner_branches, owner_add_branch, owner_open_branch, branch_*), the way 0031 does. No real server
// is touched.

import { FakeServer, NoSuchFunction, NOW, Refusal } from './support.mjs';

const tenDigits = (p) => {
  let d = String(p ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
};

export class BranchNetwork {
  constructor() {
    /** One FakeServer per branch, first branch first. Each has `.prefix` (null for the first). */
    this.servers = [this.newServer({ gymId: 'g-online', joinCode: 'QA0002', prefix: null })];
    this.groupName = null;
    this.log = [];
  }

  newServer({ gymId, joinCode, name = '', prefix }) {
    const s = new FakeServer();
    s.gym = { gymId, name, joinCode, createdAt: NOW.toISOString() };
    s.prefix = prefix;
    // Keys never repeat across branches.
    s.keySeq = 1000 * (this.servers ? this.servers.length : 0);
    return s;
  }

  get first() {
    return this.servers[0];
  }

  /** The branch a key belongs to (a live or a dead session, or an old owner key). */
  serverOf(key) {
    return this.servers.find((s) => s.sessions.has(key) || s.ownerKeys.has(key) || s.deadKeys.has(key)) ?? this.first;
  }

  ownerAt(key) {
    const s = this.serverOf(key);
    const p = s.who(key);
    if (p.role !== 'owner') throw new Refusal('OWNER_ONLY');
    return { s, p };
  }

  /** A grouped business: owner_branches' answer. */
  branchesJson(here, canOpen) {
    return {
      groupId: this.servers.length > 1 ? 'grp-qa' : null,
      groupName: this.groupName ?? this.first.gym.name,
      canOpen,
      branches: this.servers.map((s, i) => ({
        gymId: s.gym.gymId, name: s.gym.name, joinCode: s.gym.joinCode, receiptPrefix: s.prefix, branchNo: i + 1, isThis: s === here,
      })),
    };
  }

  /** Every member of every OTHER branch with this mobile. */
  visitorsFor(here, phone) {
    const out = [];
    for (const s of this.servers) {
      if (s === here) continue;
      const m = s.rows('member').find((x) => tenDigits(x.phone) === phone && x.archived !== true);
      if (!m) continue;
      const today = NOW.toISOString().slice(0, 10);
      out.push({
        gymId: s.gym.gymId,
        branchName: s.gym.name,
        memberId: m.id,
        firstName: String(m.fullName).split(' ')[0],
        allowed: m.allBranches === true,
        planOk: s.rows('membership').some((ms) => ms.memberId === m.id && ms.cancelled !== true && ms.startsOn <= today && ms.endsOn >= today),
        alreadyIn: s.rows('visit').some((v) => v.memberId === m.id && v.visitedOn === today),
      });
    }
    return out;
  }

  answer(fn, args) {
    this.log.push({ fn, args });
    const today = '2026-10-17';
    switch (fn) {
      case 'owner_branches': {
        const s = this.serverOf(args.p_key);
        const p = s.anyone(args.p_key);
        return this.branchesJson(s, p.role === 'owner');
      }
      case 'owner_add_branch': {
        const { s: from, p } = this.ownerAt(args.p_key);
        const name = String(args.p_name ?? '').trim();
        if (!name) throw new Refusal('EMPTY');
        if (this.servers.some((x) => x.gym.name.toLowerCase() === name.toLowerCase())) throw new Refusal('NAME_TAKEN');
        const n = this.servers.length + 1;
        const b = this.newServer({ gymId: `g-branch-${n}`, joinCode: `QAB00${n}`, name, prefix: `B${n}` });
        this.servers.push(b);
        // Every owner of the business is an owner here too.
        for (const s of this.servers) for (const o of s.people.values()) if (o.role === 'owner' && !b.people.has(o.phone)) b.addPerson({ name: o.name, phone: o.phone, role: 'owner', code: null });
        b.version = 1;
        b.records.set('gym:gym', { k: 'gym', id: 'gym', d: { name, phone: null, address: null, gstin: null, receiptPrefix: b.prefix }, x: false, ver: 1 });
        let copied = 0;
        if (args.p_copy_plans !== false) {
          for (const plan of from.rows('plan')) {
            if (plan.active === false) continue;
            copied += 1;
            const id = `${plan.id}-b${n}`;
            b.records.set(`plan:${id}`, { k: 'plan', id, d: { ...plan, id, gymId: b.gym.gymId }, x: false, ver: 1 });
          }
        }
        return { ...b.signedIn(b.people.get(p.phone)), receiptPrefix: b.prefix, plansCopied: copied, groupId: 'grp-qa' };
      }
      case 'owner_open_branch': {
        const { p } = this.ownerAt(args.p_key);
        const t = this.servers.find((x) => x.gym.gymId === args.p_gym);
        if (!t) throw new Refusal('GONE');
        let there = t.people.get(p.phone);
        if (!there) {
          t.addPerson({ name: p.name, phone: p.phone, role: 'owner', code: null });
          there = t.people.get(p.phone);
        }
        if (there.role !== 'owner') throw new Refusal('STAFF_ELSEWHERE');
        return t.signedIn(there);
      }
      case 'owner_rename_group': {
        this.ownerAt(args.p_key);
        this.groupName = String(args.p_name).trim();
        return this.branchesJson(this.serverOf(args.p_key), true);
      }
      case 'branch_find_visitor': {
        const s = this.serverOf(args.p_key);
        s.anyone(args.p_key);
        const ph = tenDigits(args.p_phone);
        if (!ph) throw new Refusal('BAD_PHONE');
        return this.visitorsFor(s, ph);
      }
      case 'branch_check_in_visitor': {
        const here = this.serverOf(args.p_key);
        here.anyone(args.p_key);
        const home = this.servers.find((x) => x.gym.gymId === args.p_gym && x !== here);
        if (!home) throw new Refusal('GONE');
        const m = home.rows('member').find((x) => x.id === args.p_member);
        if (!m) throw new Refusal('GONE');
        if (m.allBranches !== true) throw new Refusal('NOT_ALLOWED');
        const first = String(m.fullName).split(' ')[0];
        const id = `${m.id}:${today}`;
        if (home.rows('visit').some((v) => v.memberId === m.id && v.visitedOn === today)) {
          return { ok: true, alreadyIn: true, firstName: first, branchName: home.gym.name, planOk: true, day: today };
        }
        home.version += 1;
        home.records.set(`visit:${id}`, {
          k: 'visit', id, x: false, ver: home.version,
          d: { id, gymId: home.gym.gymId, memberId: m.id, visitedOn: today, checkedInAt: NOW.getTime(), source: 'desk', atGymId: here.gym.gymId, atGymName: here.gym.name },
        });
        return { ok: true, alreadyIn: false, firstName: first, branchName: home.gym.name, planOk: true, day: today, checkedInAt: NOW.getTime() };
      }
      case 'branch_visitors': {
        const here = this.serverOf(args.p_key);
        here.anyone(args.p_key);
        const out = [];
        for (const s of this.servers) {
          if (s === here) continue;
          for (const v of s.rows('visit')) {
            if (v.atGymId !== here.gym.gymId || v.visitedOn !== args.p_day) continue;
            const m = s.rows('member').find((x) => x.id === v.memberId);
            out.push({ gymId: s.gym.gymId, branchName: s.gym.name, memberId: v.memberId, firstName: m ? String(m.fullName).split(' ')[0] : '', checkedInAt: v.checkedInAt, source: v.source });
          }
        }
        return out;
      }
      case 'branch_undo_visitor': {
        const here = this.serverOf(args.p_key);
        here.anyone(args.p_key);
        const home = this.servers.find((x) => x.gym.gymId === args.p_gym);
        if (!home) throw new Refusal('GONE');
        for (const [k, r] of home.records) {
          if (r.k === 'visit' && !r.x && r.d.memberId === args.p_member && r.d.visitedOn === args.p_day && r.d.atGymId === here.gym.gymId) {
            home.version += 1;
            home.records.set(k, { ...r, x: true, ver: home.version });
          }
        }
        return null;
      }
      case 'staff_sign_in': {
        const ph = tenDigits(args.p_phone);
        const s = this.servers.find((x) => x.people.get(args.p_phone)?.code === args.p_code || (ph && x.people.get(ph)?.code === args.p_code)) ?? this.first;
        return s.answer(fn, args);
      }
      case 'gym_create_online':
        return this.first.answer(fn, args);
      case 'crm_push': {
        const s = this.serverOf(args.p_key);
        // 0031: a prefixed branch's new receipts carry its prefix.
        if (s.prefix) {
          for (const r of args.p_records ?? []) {
            if (r.k !== 'payment' || r.x) continue;
            const no = String(r.d?.receiptNo ?? '');
            if (!no.startsWith(`${s.prefix}/`) && !no.startsWith(`${s.prefix}I/`)) throw new Refusal('BAD_RECEIPT_NO');
          }
        }
        return s.answer(fn, args);
      }
      default:
        return this.serverOf(args.p_key).answer(fn, args);
    }
  }

  /** Answer every Supabase function call made by this phone. */
  async attach(context) {
    await context.route(/\/rest\/v1\/rpc\/([a-z_]+)/, async (route) => {
      const fn = /rpc\/([a-z_]+)/.exec(route.request().url())?.[1] ?? '';
      let args = {};
      try {
        args = route.request().postDataJSON() ?? {};
      } catch {
        args = {}; // quiet: a call with no body
      }
      try {
        const body = this.answer(fn, args);
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      } catch (e) {
        if (e instanceof NoSuchFunction) {
          await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST202', message: e.message, details: null, hint: null }) });
          return;
        }
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: String(e?.message ?? e), code: 'P0001', details: null, hint: null }) });
      }
    });
  }
}
