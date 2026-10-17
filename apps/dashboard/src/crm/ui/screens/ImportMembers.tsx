/**
 * Import members from Excel or CSV (15 Oct 2026) — `/members/import`.
 *
 * Research (Audit/crm-research/RESEARCH.md §9 rec 9): an owner moving off his register or sheet
 * on day one. One screen: pick a file -> check which column is which -> see every row's fate ->
 * add them in batches of 500 (one save each — one push online) with progress -> a summary and the
 * skipped rows as a file to fix.
 *
 * The spreadsheet reader (read-excel-file, MIT) is loaded only when a file is picked, so the
 * panel's first load does not grow. Every decision is in `logic/importMembers.ts` and tested.
 * Owner and Staff may both import: adding members is front-desk work (auth/permissions.ts).
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { csvFilename } from '../../logic/csv';
import {
  cellText,
  columnLetter,
  emptyColumnMap,
  fieldLabel,
  fillBlanksPatch,
  findHeaderRow,
  guessColumns,
  guessFromValues,
  importAction,
  IMPORT_FIELDS,
  MAX_IMPORT_ROWS,
  planImport,
  rowBringsTerm,
  rowVerdict,
  saveInBatches,
  skippedRowsCsv,
  skipReason,
  templateCsv,
  termsPreview,
  type Cell,
  type ColumnMap,
  type ImportField,
  type ImportRow,
  type RowStatus,
} from '../../logic/importMembers';
import { formatPhone } from '../../logic/members';
import { useCrm } from '../../store';
import { useRole } from '../../auth/AuthProvider';
import type { ImportTermsResult } from '../../data/adapter';
import { previewImportMoney } from '../../data/importPreview';
import { pastImports, planUndo } from '../../logic/undoImport';
import { bestSheet, readSheets, usableSheets, type SheetRows } from '../../logic/sheets';
import { formatINR } from '../../logic/money';
import { downloadCsv } from '../download';
import { Button, Card, ChipToggle, ErrorBanner, Grid, PageHeader, Row, SectionTitle, SelectField, color, font, radius, space } from '../kit';
import { navigate } from '../router';

/** Bigger than any gym's member list; stops a wrong file (a video) from freezing the tab. */
const MAX_FILE_BYTES = 5 * 1024 * 1024;
/** Rows drawn at once; the counts above always cover the whole file. */
const SHOW_ROWS = 200;

type Stage = 'pick' | 'reading' | 'review' | 'running' | 'done';
type Filter = 'all' | RowStatus;

interface Loaded {
  name: string;
  rows: Cell[][];
  /** 16 Oct 2026: every usable sheet in the file, and the one shown. */
  sheets: SheetRows[];
  sheet: number;
  /** The sheet was picked by the app (not by the owner). */
  auto: boolean;
}

interface Result {
  added: number;
  updated: number;
  skipped: { row: ImportRow; reason: string }[];
  /** Why saving stopped part-way (no internet), or null when everything went through. */
  stopped: string | null;
  /** The last Excel row saved as a member (0 when none). */
  lastSavedRow: number;
  /** Data migration: the plans, memberships and receipts made (null when none were tried). */
  terms: ImportTermsResult | null;
  termsError: string | null;
  /** A Staff session: the plans in the file were left for the owner. */
  termsForStaff: boolean;
}

/**
 * Let the browser draw before heavy work: "Reading the file…" shows before a big sheet is parsed.
 * A plain timer, not an animation frame, so a tab in the background still moves on.
 */
function letThePagePaint(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 50));
}

export function ImportMembersScreen() {
  const { snapshot, today, createMembers, updateMember, importTerms } = useCrm();
  // Data migration: memberships and receipts are the owner's (the server refuses a Staff session's plans).
  const role = useRole();
  const [stage, setStage] = useState<Stage>('pick');
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<Loaded | null>(null);
  const [headerRow, setHeaderRow] = useState(0);
  const [map, setMap] = useState<ColumnMap>(emptyColumnMap);
  const [dupMode, setDupMode] = useState<'skip' | 'fill'>('skip');
  const [filter, setFilter] = useState<Filter>('all');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<Result | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const plan = useMemo(
    () => (file && stage === 'review' ? planImport(file.rows, headerRow, map, snapshot.members, today) : null),
    [file, stage, headerRow, map, snapshot.members, today],
  );

  // UAT U-A10: the money the import will really save as receipts, worked out by the import itself.
  const [previewPaidP, setPreviewPaidP] = useState<number | null>(null);
  useEffect(() => {
    setPreviewPaidP(null);
    if (!plan || role !== 'owner') return;
    let cancelled = false;
    const adds = plan.rows.filter((r) => r.status === 'add' && r.draft !== null).map((r) => r.draft!);
    // The same rows, in the same order, as run() below hands to importTerms.
    const terms = plan.rows
      .filter((r) => r.term && r.draft && (r.status === 'add' || r.existing !== null || r.sameAsRow !== null))
      .sort((a, b) => a.rowNumber - b.rowNumber)
      .map((r) => ({ phone: r.draft!.phone, term: r.term! }));
    void previewImportMoney(snapshot, adds, terms, today).then((r) => {
      if (!cancelled) setPreviewPaidP(r ? r.paidP : null);
    });
    return () => {
      cancelled = true;
    };
  }, [plan, snapshot, role, today]);

  const headers = useMemo(() => (file ? (file.rows[headerRow] ?? []).map(cellText) : []), [file, headerRow]);
  const width = useMemo(() => (file ? Math.max(0, ...file.rows.slice(0, 200).map((r) => r.length)) : 0), [file]);

  const fail = (message: string, cause?: unknown) => {
    console.warn('[ForgeErr] import members:', message, cause ?? '');
    setError(message);
    setStage('pick');
  };

  const readFile = async (f: File) => {
    setError(null);
    setResult(null);
    if (f.size > MAX_FILE_BYTES) {
      return fail('That file is over 5 MB. It is too big for a member list. Pick the Excel or CSV file with your members.');
    }
    setStage('reading');
    // A big .xlsx takes seconds to read and the page cannot draw meanwhile: show "Reading the file…" first.
    await letThePagePaint();
    let all: SheetRows[];
    try {
      const read = await readSheets(f.name, await f.arrayBuffer(), letThePagePaint);
      if (read === 'unknown') {
        return fail('That is not an Excel or CSV file. Pick a .xlsx, .xls or .csv file.');
      }
      all = read;
    } catch (e) {
      return fail('We couldn’t read that file. Open it in Excel, save it again as .xlsx or CSV, and try once more.', e);
    }
    const sheets = usableSheets(all);
    if (sheets.length === 0) {
      return fail('That file has no member rows. It needs one row of column names, then one row per member.');
    }
    // Checking every row comes next (the list below): let the page draw once more first.
    await letThePagePaint();
    openSheet({ name: f.name, rows: [], sheets, sheet: 0, auto: true }, bestSheet(sheets));
  };

  /** Show one sheet of the file: its header row and column guesses start again. */
  const openSheet = (loaded: Loaded, i: number) => {
    const rows = loaded.sheets[i]?.rows ?? [];
    const h = findHeaderRow(rows);
    setFile({ ...loaded, rows, sheet: i });
    setHeaderRow(h);
    setMap(guessFromValues(rows, h, guessColumns(rows[h] ?? []), today));
    setFilter('all');
    setStage('review');
  };

  const pickColumn = (field: ImportField, value: string) => {
    const col = value === '' ? null : Number(value);
    setMap((prev) => {
      const next = { ...prev };
      // One column feeds one field: taking it here frees it elsewhere.
      if (col !== null) for (const f of IMPORT_FIELDS) if (next[f] === col) next[f] = null;
      next[field] = col;
      return next;
    });
  };

  const changeHeaderRow = (value: string) => {
    if (!file) return;
    const h = Number(value);
    setHeaderRow(h);
    setMap(guessFromValues(file.rows, h, guessColumns(file.rows[h] ?? []), today));
  };

  const run = async () => {
    if (!plan || !file) return;
    // Frozen now: each save re-reads the gym, and a live plan would start calling the members
    // just added "already a member".
    const rows = plan.rows;
    const adds = rows.filter((r) => r.status === 'add' && r.draft !== null);
    const fills = dupMode === 'fill' ? rows.filter((r) => r.existing !== null && r.sameAsRow === null && r.draft !== null) : [];
    const work = new Set([...adds, ...fills]);
    // A repeated row whose plan and payment are added to its member is not "skipped" (review: the
    // skipped-rows file would invite typing that payment in again).
    // C7-37: so is a row for a member already in the gym whose plan and payment the owner adds.
    const repeatAdds = (r: ImportRow) => rowBringsTerm(r, role);
    const skipped = rows.filter((r) => !work.has(r) && !repeatAdds(r)).map((row) => ({ row, reason: skipReason(row) }));
    const total = adds.length + fills.length;
    setStage('running');
    setProgress({ done: 0, total });

    // New members: one save per batch (one push online), never one per row. Every record this
    // import makes carries one id (data migration, 15 Oct 2026).
    const importId = `import-${Date.now().toString(36)}`;
    const outcome = await saveInBatches(adds, (drafts) => createMembers(drafts.map((d) => ({ ...d, importId }))), (done) => setProgress({ done, total }));
    for (const row of outcome.duplicates) {
      skipped.push({ row, reason: 'Already a member.' });
    }
    const notSavedReason = 'Not saved. Saving stopped, maybe because the internet went off. Import this file again. Members already added are skipped.';
    for (const row of outcome.notSaved) skipped.push({ row, reason: notSavedReason });
    if (outcome.stopped) console.warn('[ForgeErr] import members: saving stopped', outcome.stopped);

    let updated = 0;
    if (outcome.stopped) {
      // The connection is gone: filling in details would fail row by row too.
      for (const row of fills) skipped.push({ row, reason: notSavedReason });
    } else {
      for (let i = 0; i < fills.length; i += 1) {
        const row = fills[i]!;
        try {
          const patch = row.existing && row.draft ? fillBlanksPatch(row.existing, row.draft) : {};
          if (!row.existing || Object.keys(patch).length === 0) {
            skipped.push({ row, reason: 'Already a member. Nothing new to fill in.' });
          } else {
            await updateMember(row.existing.id, patch);
            updated += 1;
          }
        } catch (e) {
          // One bad row never stops the rest.
          console.warn(`[ForgeErr] import members: row ${row.rowNumber} not filled in`, e);
          skipped.push({ row, reason: 'Could not be saved.' });
        }
        setProgress({ done: adds.length + i + 1, total });
      }
    }
    // Data migration (15 Oct 2026): each row's plan with its dates becomes a real membership, and
    // what was paid a receipt — for new members and for members already here (a term already in
    // the gym is skipped, so importing again adds nothing).
    let terms: ImportTermsResult | null = null;
    let termsError: string | null = null;
    // 16 Oct 2026: rows that repeat a member (a payments list) bring their plan and payment too,
    // after that member's first row (file order).
    const termRows = [...outcome.added, ...rows.filter((r) => r.existing !== null || r.sameAsRow !== null)]
      .filter((r) => r.term && r.draft)
      .sort((a, b) => a.rowNumber - b.rowNumber);
    if (!outcome.stopped && termRows.length > 0 && role === 'owner') {
      try {
        terms = await importTerms(
          termRows.map((r) => ({ phone: r.draft!.phone, term: r.term! })),
          importId,
        );
      } catch (e) {
        console.warn('[ForgeErr] import members: plans and payments not saved', e);
        termsError = e instanceof Error && e.message ? e.message : 'Saving stopped.';
      }
    }
    skipped.sort((a, b) => a.row.rowNumber - b.row.rowNumber);
    const lastSavedRow = outcome.added.reduce((max, r) => Math.max(max, r.rowNumber), 0);
    setResult({ added: outcome.added.length, updated, skipped, stopped: outcome.stopped, lastSavedRow, terms, termsError, termsForStaff: role !== 'owner' && termRows.length > 0 });
    setStage('done');
  };

  const startOver = () => {
    setFile(null);
    setResult(null);
    setError(null);
    setStage('pick');
  };

  const downloadSample = () => downloadCsv(csvFilename(['members sample']), templateCsv());

  return (
    <>
      <PageHeader
        title="Import members from Excel"
        subtitle="Move your register or sheet in a few minutes"
        actions={
          stage !== 'running' ? (
            <Button variant="ghost" wrap onClick={() => navigate('/members')}>
              ← Members
            </Button>
          ) : undefined
        }
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <input
        ref={input}
        type="file"
        accept=".xlsx,.csv,.xls,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        style={{ display: 'none' }}
        aria-label="Choose an Excel or CSV file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          // Cleared so picking the same file again (after fixing it) still reads it.
          e.target.value = '';
          if (f) void readFile(f);
        }}
      />

      {(stage === 'pick' || stage === 'reading') && (
        <Card style={{ marginBottom: space.lg }}>
          <SectionTitle>Your file</SectionTitle>
          <ol style={list}>
            <li>
              One row per member, with a name and a 10-digit mobile. Joining date, gender, birthday, address, batch, plan, fees, valid till and notes are optional.
            </li>
            <li>
              Works with .xlsx, old .xls and .csv, and files with several sheets. Dates like 15/08/2026 are fine.
            </li>
            <li>
              Nothing is saved until you check the list and tap Add.
            </li>
          </ol>
          {stage === 'reading' && (
            <p role="status" aria-live="polite" style={{ ...muted, color: color.ink, fontWeight: 700, marginBottom: space.md }}>
              Reading the file… a big sheet can take a few seconds.
            </p>
          )}
          <Row gap={space.sm}>
            <Button wrap disabled={stage === 'reading'} onClick={() => input.current?.click()}>
              {stage === 'reading' ? 'Reading the file…' : 'Choose file'}
            </Button>
            <Button variant="ghost" wrap onClick={downloadSample}>
              Download sample file
            </Button>
          </Row>
        </Card>
      )}

      {stage === 'review' && file && plan && (
        <>
          <Card style={{ marginBottom: space.lg }}>
            <SectionTitle>Which column is which</SectionTitle>
            <p style={muted}>
              {`${file.name}${file.sheets.length > 1 ? `, sheet "${file.sheets[file.sheet]?.name ?? ''}"${file.auto ? ' (it looks most like a member list)' : ''}` : ''}. We guessed from the column names. Change any that are wrong.`}
            </p>
            {file.sheets.length > 1 && (
              <SelectField
                label="Sheet"
                value={String(file.sheet)}
                onChange={(v) => openSheet({ ...file, auto: false }, Number(v))}
                options={file.sheets.map((sh, i) => ({
                  value: String(i),
                  label: `${sh.name} (${filledRows(sh.rows)} rows)`,
                }))}
              />
            )}
            <SelectField
              label="Column names are on row"
              value={String(headerRow)}
              onChange={changeHeaderRow}
              options={file.rows.slice(0, 10).map((r, i) => ({
                value: String(i),
                label: `${i + 1}: ${r.map(cellText).filter(Boolean).slice(0, 4).join(', ').slice(0, 60) || '(empty)'}`,
              }))}
            />
            <Grid min={200}>
              {IMPORT_FIELDS.map((field) => (
                <SelectField
                  key={field}
                  label={fieldLabel(field) + (field === 'fullName' || field === 'phone' ? ' *' : '')}
                  value={map[field] === null ? '' : String(map[field])}
                  onChange={(v) => pickColumn(field, v)}
                  options={[
                    { value: '', label: '— Not in the file —' },
                    ...Array.from({ length: width }, (_, i) => ({
                      value: String(i),
                      label: `${columnLetter(i)} · ${(headers[i] || '(no name)').slice(0, 40)}`,
                    })),
                  ]}
                />
              ))}
            </Grid>
            {(map.plan !== null || map.amount !== null || map.expiry !== null) && map.expiry === null && map.startDate === null && (
              <p style={{ ...muted, marginTop: space.lg }}>
                Pick the “Valid till” or “Plan start” column to bring each plan in with its dates. Without either, the plan and fees go into the member’s notes.
              </p>
            )}
            {map.joinedOn === null && (
              <p style={{ ...muted, marginTop: space.sm }}>
                {map.expiry !== null || map.startDate !== null
                  ? 'No joining date column: each member’s plan start is used (today when there is none).'
                  : 'No joining date column: everyone gets today’s date.'}
              </p>
            )}
          </Card>

          {(map.fullName === null || map.phone === null) && (
            <ErrorBanner>
              {map.fullName === null && map.phone === null
                ? 'Pick the columns with the name and the mobile number.'
                : map.fullName === null
                  ? 'Pick the column with the name.'
                  : 'Pick the column with the mobile number.'}
            </ErrorBanner>
          )}

          <Review
            rows={plan.rows}
            counts={plan.counts}
            leftOut={plan.leftOut}
            filter={filter}
            setFilter={setFilter}
            dupMode={dupMode}
            setDupMode={setDupMode}
          />

          <TermsLine rows={plan.rows} owner={role === 'owner'} paidP={previewPaidP} />

          <ActionBar
            plan={plan.rows}
            role={role}
            dupMode={dupMode}
            blocked={map.fullName === null || map.phone === null}
            onRun={() => void run()}
            onOther={() => input.current?.click()}
          />
        </>
      )}

      {stage === 'running' && (
        <Card>
          <SectionTitle>Adding members…</SectionTitle>
          <p style={muted}>
            {`${progress.done} of ${progress.total} done. Keep this page open until it finishes.`}
          </p>
          <div
            role="progressbar"
            aria-label="Import progress"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.done}
            style={{ marginTop: space.lg, height: 10, borderRadius: radius.pill, background: color.surfaceSunken, overflow: 'hidden' }}
          >
            <div
              style={{
                height: '100%',
                width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%`,
                background: color.accent,
                transition: 'width 120ms linear',
              }}
            />
          </div>
        </Card>
      )}

      {stage === 'done' && result && (
        <Card>
          <SectionTitle>Import finished</SectionTitle>
          <p style={{ margin: 0, fontFamily: font.display, fontSize: 20, fontWeight: 700, color: color.ink }}>
            {`${result.added} added, ${result.skipped.length} skipped`}
            {result.updated > 0 ? `, ${result.updated} filled in` : ''}
          </p>
          {result.terms && (result.terms.memberships > 0 || result.terms.skipped > 0) && (
            <p style={{ ...muted, marginTop: space.sm }}>
              {`${n(result.terms.memberships, 'plan')} with their dates · ${n(result.terms.payments, 'receipt')}${result.terms.plans > 0 ? ` · ${n(result.terms.plans, 'new plan name')} added to Plans` : ''}${result.terms.skipped > 0 ? ` · ${result.terms.skipped} already here, not added again` : ''}.`}
            </p>
          )}
          {result.termsError && (
            <div style={{ marginTop: space.md }}>
              <ErrorBanner>
                {`Members are saved, but not all their plans and payments. ${result.termsError} Tap “Undo this import” below. Then import the same file again, so every payment comes in only once.`}
              </ErrorBanner>
            </div>
          )}
          {result.termsForStaff && (
            <p style={{ ...muted, marginTop: space.sm }}>
              Only the owner can add the plans and payments in this file. Ask the owner to import the same file. Members already added are skipped.
            </p>
          )}
          {result.stopped && (
            <div style={{ marginTop: space.md }}>
              <ErrorBanner>
                {`Saving stopped halfway: ${result.stopped} `}
                {result.added > 0
                  ? `${result.added} members were saved (up to row ${result.lastSavedRow}). The rest may not be saved. `
                  : 'No new members were saved. '}
                When the internet is back, import the same file again. Members already added are skipped, so nobody is added twice.
              </ErrorBanner>
            </div>
          )}
          {result.skipped.length > 0 && (
            <p style={{ ...muted, marginTop: space.sm }}>
              Download the skipped rows and fix them in Excel. The reason is in the first column. Then import that file.
            </p>
          )}
          <Row gap={space.sm}>
            <div style={{ marginTop: space.lg }}>
              <Button wrap onClick={() => navigate('/members')}>
                Open members
              </Button>
            </div>
            {result.skipped.length > 0 && file && (
              <div style={{ marginTop: space.lg }}>
                <Button
                  variant="ghost"
                  wrap
                  onClick={() =>
                    downloadCsv(
                      csvFilename(['skipped rows', file.name.replace(/\.[^.]+$/, '')]),
                      skippedRowsCsv(headers, result.skipped),
                    )
                  }
                >
                  {`Download ${result.skipped.length} skipped rows`}
                </Button>
              </div>
            )}
            <div style={{ marginTop: space.lg }}>
              <Button variant="ghost" wrap onClick={startOver}>
                Import another file
              </Button>
            </div>
          </Row>
        </Card>
      )}
      {role === 'owner' && (stage === 'pick' || stage === 'done') && <PastImports />}
    </>
  );
}

function Review({
  rows,
  counts,
  leftOut,
  filter,
  setFilter,
  dupMode,
  setDupMode,
}: {
  rows: ImportRow[];
  counts: { add: number; duplicate: number; problem: number };
  leftOut: number;
  filter: Filter;
  setFilter: (f: Filter) => void;
  dupMode: 'skip' | 'fill';
  setDupMode: (m: 'skip' | 'fill') => void;
}) {
  const inGym = rows.filter((r) => r.existing !== null).length;
  const shown = rows.filter((r) => filter === 'all' || r.status === filter);
  return (
    <Card style={{ marginBottom: space.lg }}>
      <SectionTitle>Check the list</SectionTitle>
      <p style={{ margin: 0, fontFamily: font.body, fontSize: 15, color: color.ink }}>
        {`${rows.length} rows: ${counts.add} will be added, ${counts.duplicate} already members or repeated, ${counts.problem} with a problem.`}
      </p>
      {leftOut > 0 && (
        <p style={{ ...muted, color: color.warning, marginTop: space.sm }}>
          {`Only the first ${MAX_IMPORT_ROWS} rows can be imported at once. ${leftOut} more rows were left out. Import them as a second file.`}
        </p>
      )}

      {inGym > 0 && (
        <div style={{ marginTop: space.lg }}>
          <p style={{ ...muted, marginBottom: space.sm }}>
            {`${inGym} are already members of your gym (same mobile). For them:`}
          </p>
          <ChipToggle
            label="Members already in the gym"
            value={dupMode}
            onChange={(v) => setDupMode(v === 'fill' ? 'fill' : 'skip')}
            options={[
              { value: 'skip', label: 'Skip them' },
              { value: 'fill', label: 'Fill in their blank details' },
            ]}
          />
          {dupMode === 'fill' && (
            <p style={{ ...muted, marginTop: space.sm }}>
              Only empty details are filled in. Their name, mobile and joining date stay as they are.
            </p>
          )}
        </div>
      )}

      <div style={{ margin: `${space.lg}px 0` }}>
        <ChipToggle
          label="Show rows"
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
          options={[
            { value: 'all', label: 'All', count: rows.length },
            { value: 'add', label: 'Will be added', count: counts.add },
            { value: 'duplicate', label: 'Already members', count: counts.duplicate },
            { value: 'problem', label: 'Problems', count: counts.problem },
          ]}
        />
      </div>

      {shown.length === 0 ? (
        <p style={muted}>No rows here.</p>
      ) : (
        <div style={{ display: 'grid', gap: space.sm }}>
          {shown.slice(0, SHOW_ROWS).map((r) => (
            <RowCard key={r.rowNumber} row={r} />
          ))}
        </div>
      )}
      {shown.length > SHOW_ROWS && (
        <p style={{ ...muted, marginTop: space.md }}>
          {`Showing the first ${SHOW_ROWS} of ${shown.length}. All of them are counted above.`}
        </p>
      )}
    </Card>
  );
}

const TONE: Record<RowStatus, string> = {
  add: color.goodText,
  duplicate: color.warning,
  problem: color.criticalText,
};

function RowCard({ row }: { row: ImportRow }) {
  const name = row.draft?.fullName || row.name;
  return (
    <div
      style={{
        border: `1px solid ${color.border}`,
        borderRadius: radius.md,
        background: color.surfaceSunken,
        padding: `${space.md}px ${space.lg}px`,
        fontFamily: font.body,
        fontSize: 14,
        color: color.ink,
        minWidth: 0,
        overflowWrap: 'anywhere',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: space.sm }}>
        <span style={{ fontWeight: 700, minWidth: 0 }}>
          {`Row ${row.rowNumber}`} · {name || '(no name)'}
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: TONE[row.status], minWidth: 0 }}>{rowVerdict(row)}</span>
      </div>
      {row.draft && <div style={{ color: color.inkSecondary, marginTop: 2 }}>{formatPhone(row.draft.phone)}</div>}
      {row.problems.map((p) => (
        <div key={p} style={{ color: color.criticalText, marginTop: 4 }}>
          {p}
        </div>
      ))}
      {row.warnings.map((w) => (
        <div key={w} style={{ color: color.warning, fontSize: 13, marginTop: 4 }}>
          {w}
        </div>
      ))}
    </div>
  );
}

function ActionBar({
  plan,
  role,
  dupMode,
  blocked,
  onRun,
  onOther,
}: {
  plan: ImportRow[];
  role: 'owner' | 'staff';
  dupMode: 'skip' | 'fill';
  blocked: boolean;
  onRun: () => void;
  onOther: () => void;
}) {
  // C7-18: an owner importing a file whose members are all in already (the staff's import, the
  // second half of a split file, a retry) can still add their plans and payments.
  const { label, enabled } = importAction(plan, dupMode, role);
  return (
    <Row gap={space.sm}>
      <Button wrap disabled={blocked || !enabled} onClick={onRun}>
        {label}
      </Button>
      <Button variant="ghost" wrap onClick={onOther}>
        Choose another file
      </Button>
    </Row>
  );
}

const muted: CSSProperties = {
  margin: 0,
  fontFamily: font.body,
  fontSize: 14,
  color: color.inkSecondary,
};

const list: CSSProperties = {
  margin: `0 0 ${space.lg}px`,
  paddingLeft: 20,
  display: 'grid',
  gap: space.sm,
  fontFamily: font.body,
  fontSize: 14,
  color: color.inkSecondary,
};

/**
 * Data migration (15 Oct 2026): before importing, what the plans in the sheet become — so the owner
 * sees their members will arrive WITH their plans, end dates and payments, not as bare names.
 */
function TermsLine({ rows, owner, paidP }: { rows: readonly ImportRow[]; owner: boolean; paidP: number | null }) {
  // C7-37: every payment row counts, repeats of a member included. U-A10: the money is what the
  // import will really save (a running "paid so far" is not added up twice); null while it is worked out.
  const { members: count, names } = termsPreview(rows);
  const paid = paidP ?? 0;
  if (count === 0) return null;
  return (
    <Card>
      <SectionTitle>Plans and payments</SectionTitle>
      <p style={{ margin: 0, fontSize: 14, color: color.ink }}>
        {owner
          ? `${count} members come with their plan and its dates (${names} plan names)${paid > 0 ? `, and ${formatINR(paid)} already paid as receipts` : ''}. Expiry reminders work for them from day one.`
          : `${count} members have a plan in this file. Only the owner can add plans and payments. Members are added now. Plans are added when the owner imports the same file.`}
      </p>
    </Card>
  );
}

/**
 * "Undo this import" (16 Oct 2026): every import still in the gym, newest first, each with one
 * undo. Owner only (the server refuses the front desk). Two steps: the button shows what goes and
 * what stays, then "Yes, undo it". What the gym used since the import always stays.
 */
function PastImports() {
  const { snapshot, undoImport } = useCrm();
  const list = useMemo(() => (snapshot ? pastImports(snapshot) : []), [snapshot]);
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const ask = asking && snapshot ? planUndo(snapshot, asking) : null;
  if (list.length === 0 && !done) return null;

  const run = async (importId: string) => {
    setBusy(true);
    setFailed(null);
    try {
      const r = await undoImport(importId);
      setDone(
        `Import undone: ${n(r.members, 'member')}, ${n(r.memberships, 'plan')} with dates, ${n(r.payments, 'receipt')} and ${n(r.plans, 'plan name')} removed.${keptWords(r.kept)}`,
      );
      setAsking(null);
    } catch (e) {
      console.warn('[ForgeErr] undo import', e);
      setFailed(
        'The import was not fully undone. Check the internet and tap Undo again. What is already removed stays removed.',
      );
    } finally {
      setBusy(false);
    }
  };

  const when = (at: number | null) =>
    at == null ? 'Earlier import' : new Date(at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

  return (
    <Card style={{ marginTop: space.lg }}>
      <SectionTitle>Past imports</SectionTitle>
      {done && (
        <p role="status" aria-live="polite" style={{ ...muted, color: color.ink, fontWeight: 700 }}>
          {done}
        </p>
      )}
      {failed && <ErrorBanner>{failed}</ErrorBanner>}
      {list.map((imp) => (
        <div key={imp.importId} style={{ padding: `${space.sm}px 0`, borderTop: `1px solid ${color.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 700, color: color.ink }}>{when(imp.at)}</div>
              <div style={muted}>
                {`${n(imp.members, 'member')} · ${n(imp.memberships, 'plan')} with dates · ${n(imp.payments, 'receipt')}`}
              </div>
            </div>
            {asking !== imp.importId && (
              <Button variant="ghost" tone="danger" disabled={busy} onClick={() => { setDone(null); setAsking(imp.importId); }} ariaLabel={`Undo the import of ${when(imp.at)}`}>
                Undo this import
              </Button>
            )}
          </div>
          {asking === imp.importId && ask && (
            <div style={{ marginTop: space.sm }}>
              <p style={{ ...muted, color: color.ink }}>
                {`This removes what this file added: ${n(ask.members.length, 'member')}, ${n(ask.memberships.length, 'plan')} with dates, ${n(ask.payments.length, 'receipt')} and ${n(ask.plans.length, 'plan name')} from Plans.`}
                {keptWords(ask.kept)}
                {' Nothing you added yourself is removed.'}
              </p>
              <Row gap={space.sm}>
                <Button tone="danger" disabled={busy} onClick={() => run(imp.importId)}>
                  {busy ? 'Undoing…' : 'Yes, undo it'}
                </Button>
                <Button variant="ghost" disabled={busy} onClick={() => setAsking(null)}>
                  Keep it
                </Button>
              </Row>
            </div>
          )}
        </div>
      ))}
    </Card>
  );
}

/** " 2 members and 1 plan with dates stay: the gym used them after the import." PURE. */
function keptWords(kept: { members: number; memberships: number; plans: number }): string {
  const parts: string[] = [];
  if (kept.members > 0) parts.push(n(kept.members, 'member'));
  if (kept.memberships > 0) parts.push(`${n(kept.memberships, 'plan')} with dates`);
  if (kept.plans > 0) parts.push(n(kept.plans, 'plan name'));
  if (parts.length === 0) return '';
  return ` ${parts.join(', ')} stay, with their receipts, because they were used after the import (a check-in, a payment at the desk, extra days or a PT session).`;
}

/** "1 member", "3 members". PURE. */
function n(count: number, word: string): string {
  return `${count} ${count === 1 ? word : `${word}s`}`;
}

/** Rows with anything in them (the Sheet picker's count). PURE. */
function filledRows(rows: readonly (readonly Cell[])[]): number {
  return rows.filter((r) => r.some((c) => cellText(c) !== '')).length;
}
