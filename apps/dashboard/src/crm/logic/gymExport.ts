/**
 * Settings → Your data → "Download all your gym's data" (launch plan D8, 21 Oct 2026). The privacy
 * notice and the gym agreement promise a gym can take everything with it. One Excel file, one sheet
 * per kind of record, with plain column names, money in rupees and every member's name next to their
 * rows, so it opens in Excel or Google Sheets and moves to any other software. Plus the full copy as
 * JSON (exactly what ForgeAI holds) for a move that wants every field. PURE except `downloadGymData`.
 */
import type { CrmSnapshot } from '../data/adapter';

export type Cell = string | number | boolean | null;
export interface ExportSheet {
  name: string;
  rows: Cell[][];
}

const rupees = (paise: number) => Math.round(paise) / 100;
const when = (ms: number | null | undefined) => (ms ? new Date(ms).toISOString().replace('T', ' ').slice(0, 16) : null);

/** The gym's records as sheets. Header row first. Voided and cancelled rows are kept, and say so. */
export function gymExportSheets(s: CrmSnapshot, now: Date = new Date()): ExportSheet[] {
  const memberName = new Map(s.members.map((m) => [m.id, m.fullName]));
  const name = (id: string | null | undefined) => (id ? (memberName.get(id) ?? '(removed member)') : null);
  const extraLabels = [...new Set(s.members.flatMap((m) => Object.keys(m.extra ?? {})))];
  return [
    {
      name: 'About',
      rows: [
        ['Gym', s.gym.name],
        ['Gym code', s.gym.joinCode],
        ['Phone', s.gym.phone],
        ['Address', s.gym.address],
        ['GSTIN', s.gym.gstin],
        ['Set up on', when(s.gym.createdAt)],
        ['Downloaded on', when(now.getTime())],
        ['Members', s.members.length],
        ['Memberships', s.memberships.length],
        ['Payments', s.payments.length],
        ['Check-ins', s.visits.length],
        ['Money', 'In rupees. Dates are year-month-day.'],
      ],
    },
    {
      name: 'Members',
      rows: [
        // #47: the gym's own extra details (from an import) follow, one column each, when there are any.
        ['Member id', 'Name', 'Mobile', 'Email', 'Gender', 'Date of birth', 'Address', 'Emergency contact', 'Emergency mobile', 'Joined on', 'Batch', 'Notes', 'Archived', 'Uses the app', ...extraLabels],
        ...s.members.map((m) => [
          m.id, m.fullName, m.phone, m.email, m.gender, m.dateOfBirth, m.address, m.emergencyName, m.emergencyPhone,
          m.joinedOn, m.batch ?? null, m.notes, m.archived, Boolean(m.appUserId),
          ...extraLabels.map((k) => m.extra?.[k] ?? null),
        ]),
      ],
    },
    {
      name: 'Plans',
      rows: [
        ['Plan id', 'Name', 'Length', 'Unit', 'Price (Rs)', 'Joining fee (Rs)', 'PT sessions', 'Trainer', 'Description', 'In use'],
        ...s.plans.map((p) => [p.id, p.name, p.durationCount, p.durationUnit, rupees(p.priceP), rupees(p.joiningFeeP), p.ptSessions ?? null, p.trainer ?? null, p.description, p.active]),
      ],
    },
    {
      name: 'Memberships',
      rows: [
        ['Membership id', 'Member', 'Member id', 'Plan', 'Starts', 'Ends', 'Price (Rs)', 'List price (Rs)', 'Joining fee (Rs)', 'Cancelled', 'Sold by', 'Notes'],
        ...s.memberships.map((m) => [
          m.id, name(m.memberId), m.memberId, m.planName, m.startsOn, m.endsOn, rupees(m.priceP), rupees(m.listPriceP), rupees(m.joiningFeeP), m.cancelled, m.soldBy, m.notes,
        ]),
      ],
    },
    {
      name: 'Payments',
      rows: [
        ['Receipt no', 'Member', 'Member id', 'Paid on', 'Amount (Rs)', 'Method', 'Reference', 'Note', 'Membership id', 'Collected by', 'Voided', 'Why voided'],
        ...s.payments.map((p) => [
          p.receiptNo, name(p.memberId), p.memberId, p.paidOn, rupees(p.amountP), p.method, p.reference, p.note, p.membershipId, p.collectedBy, p.voided, p.voidReason,
        ]),
      ],
    },
    {
      name: 'Check-ins',
      rows: [['Member', 'Member id', 'Date', 'Time', 'How'], ...s.visits.map((v) => [name(v.memberId), v.memberId, v.visitedOn, when(v.checkedInAt), v.source])],
    },
    {
      name: 'Enquiries',
      rows: [
        ['Name', 'Mobile', 'Interested in', 'Follow up on', 'Status', 'Became member', 'Added'],
        ...(s.enquiries ?? []).map((e) => [e.name, e.phone, e.interest, e.followUpOn, e.status, name(e.memberId), when(e.createdAt)]),
      ],
    },
    {
      name: 'Expenses',
      rows: [['Date', 'Amount (Rs)', 'Category', 'Note'], ...(s.expenses ?? []).map((e) => [e.spentOn, rupees(e.amountP), e.category, e.note])],
    },
  ];
}

/** "Shakti Gym data 2026-10-21" — a file name any phone or computer accepts. PURE. */
export function exportFileBase(gymName: string, now: Date = new Date()): string {
  const safe = gymName.replace(/[^\p{L}\p{N} ._-]+/gu, ' ').replace(/\s+/g, ' ').trim() || 'Gym';
  return `${safe} data ${now.toISOString().slice(0, 10)}`;
}

/** Saves the Excel file and the full JSON copy. */
export async function downloadGymData(s: CrmSnapshot, saveText: (name: string, text: string, mime: string) => void): Promise<void> {
  const XLSX = await import('xlsx');
  const book = XLSX.utils.book_new();
  for (const sheet of gymExportSheets(s)) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(sheet.rows), sheet.name);
  const base = exportFileBase(s.gym.name);
  XLSX.writeFile(book, `${base}.xlsx`, { compression: true });
  saveText(`${base} (full copy).json`, JSON.stringify(s, null, 1), 'application/json');
}
