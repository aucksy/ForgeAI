/**
 * Import members from Excel or CSV (15 Oct 2026) — `/members/import`.
 *
 * Research (Audit/crm-research/RESEARCH.md §9 rec 9): an owner moving off his register or sheet
 * on day one. One screen: pick a file -> check which column is which -> see every row's fate ->
 * add them in batches of 500 (one save each — one push online) with progress -> a summary and the
 * skipped rows as a file to fix (in English, like every download).
 *
 * The spreadsheet reader (read-excel-file, MIT) is loaded only when a file is picked, so the
 * panel's first load does not grow. Every decision is in `logic/importMembers.ts` and tested.
 * Owner and Staff may both import: adding members is front-desk work (auth/permissions.ts).
 */

import { useMemo, useRef, useState, type CSSProperties } from 'react';

import { inEnglish, tr } from '../../i18n';
import { csvFilename } from '../../logic/csv';
import {
  cellText,
  columnLetter,
  decodeCsvBytes,
  emptyColumnMap,
  englishSkipReasons,
  fieldLabel,
  fillBlanksPatch,
  findHeaderRow,
  guessColumns,
  guessFromValues,
  IMPORT_FIELDS,
  MAX_IMPORT_ROWS,
  parseCsv,
  planImport,
  rowVerdict,
  saveInBatches,
  skippedRowsCsv,
  skipReason,
  sniffFile,
  templateCsv,
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
import { pastImports, planUndo } from '../../logic/undoImport';
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
      return fail(tr('That file is over 5 MB — too big for a member list. Pick the Excel or CSV file with your members.', 'Yeh file 5 MB se badi hai — member list itni badi nahi hoti. Members wali Excel ya CSV file chuno.'));
    }
    setStage('reading');
    // A big .xlsx takes seconds to read and the page cannot draw meanwhile: show "Reading the file…" first.
    await letThePagePaint();
    let rows: Cell[][];
    try {
      const buffer = await f.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const kind = sniffFile(f.name, bytes.subarray(0, 8));
      if (kind === 'xls') {
        return fail(tr('This is an old .xls file. Open it in Excel, choose Save As → Excel Workbook (.xlsx) or CSV, and pick that file.', 'Yeh purani .xls file hai. Excel mein kholo, Save As → Excel Workbook (.xlsx) ya CSV chuno, phir woh file yahan chuno.'));
      }
      if (kind === 'unknown') {
        return fail(tr('That is not an Excel or CSV file. Pick a .xlsx or .csv file.', 'Yeh Excel ya CSV file nahi hai. .xlsx ya .csv file chuno.'));
      }
      if (kind === 'csv') {
        rows = parseCsv(decodeCsvBytes(bytes));
      } else {
        // Loaded only now, so the panel's first load stays small.
        const { readSheet } = await import('read-excel-file/universal');
        await letThePagePaint();
        rows = (await readSheet(buffer)) as unknown as Cell[][];
      }
    } catch (e) {
      return fail(tr('We couldn’t read that file. Open it in Excel, save it again as .xlsx or CSV, and try once more.', 'File padh nahi paaye. Excel mein kholo, .xlsx ya CSV mein phir save karo, aur dobara try karo.'), e);
    }
    const filled = rows.filter((r) => r.some((c) => cellText(c) !== ''));
    if (filled.length < 2) {
      return fail(tr('That file has no member rows — it needs a row of column names and one row per member.', 'Is file mein members nahi hain — ek row mein column ke naam aur har member ki ek row chahiye.'));
    }
    // Checking every row comes next (the list below): let the page draw once more first.
    await letThePagePaint();
    const h = findHeaderRow(rows);
    setFile({ name: f.name, rows });
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
    // The skipped-rows file is English in every language: the same plan, worked out in English.
    const english = englishSkipReasons(file.rows, headerRow, map, snapshot.members, today);
    const reasonFor = (row: ImportRow) => english.get(row.rowNumber) ?? inEnglish(() => skipReason(row));
    const skipped = rows.filter((r) => !work.has(r)).map((row) => ({ row, reason: reasonFor(row) }));
    const total = adds.length + fills.length;
    setStage('running');
    setProgress({ done: 0, total });

    // New members: one save per batch (one push online), never one per row. Every record this
    // import makes carries one id (data migration, 15 Oct 2026).
    const importId = `import-${Date.now().toString(36)}`;
    const outcome = await saveInBatches(adds, (drafts) => createMembers(drafts.map((d) => ({ ...d, importId }))), (done) => setProgress({ done, total }));
    for (const row of outcome.duplicates) {
      skipped.push({ row, reason: inEnglish(() => tr('Already a member.', 'Pehle se member hai.')) });
    }
    const notSavedReason = inEnglish(() =>
      tr(
        'Not saved — saving stopped (no internet?). Import this file again: members already added are skipped.',
        'Save nahi hua — save ruk gaya (internet?). Yeh file phir import karo: jo jud gaye woh chhod diye jayenge.',
      ),
    );
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
            skipped.push({ row, reason: inEnglish(() => tr('Already a member — nothing new to fill in.', 'Pehle se member — bharne ko kuch naya nahi.')) });
          } else {
            await updateMember(row.existing.id, patch);
            updated += 1;
          }
        } catch (e) {
          // One bad row never stops the rest.
          console.warn(`[ForgeErr] import members: row ${row.rowNumber} not filled in`, e);
          skipped.push({ row, reason: inEnglish(() => tr('Could not be saved.', 'Save nahi hua.')) });
        }
        setProgress({ done: adds.length + i + 1, total });
      }
    }
    // Data migration (15 Oct 2026): each row's plan with its dates becomes a real membership, and
    // what was paid a receipt — for new members and for members already here (a term already in
    // the gym is skipped, so importing again adds nothing).
    let terms: ImportTermsResult | null = null;
    let termsError: string | null = null;
    const termRows = [...outcome.added, ...rows.filter((r) => r.existing !== null && r.sameAsRow === null)].filter((r) => r.term && r.draft);
    if (!outcome.stopped && termRows.length > 0 && role === 'owner') {
      try {
        terms = await importTerms(
          termRows.map((r) => ({ phone: r.draft!.phone, term: r.term! })),
          importId,
        );
      } catch (e) {
        console.warn('[ForgeErr] import members: plans and payments not saved', e);
        termsError = e instanceof Error && e.message ? e.message : tr('Saving stopped.', 'Save ruk gaya.');
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

  const downloadSample = () => downloadCsv(csvFilename([tr('members sample', 'members sample')]), templateCsv());

  return (
    <>
      <PageHeader
        title={tr('Import members from Excel', 'Excel se members jodo')}
        subtitle={tr('Move your register or sheet in a few minutes', 'Apna register ya sheet kuch minute mein laao')}
        actions={
          stage !== 'running' ? (
            <Button variant="ghost" wrap onClick={() => navigate('/members')}>
              {tr('← Members', '← Members')}
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
        aria-label={tr('Choose an Excel or CSV file', 'Excel ya CSV file chuno')}
        onChange={(e) => {
          const f = e.target.files?.[0];
          // Cleared so picking the same file again (after fixing it) still reads it.
          e.target.value = '';
          if (f) void readFile(f);
        }}
      />

      {(stage === 'pick' || stage === 'reading') && (
        <Card style={{ marginBottom: space.lg }}>
          <SectionTitle>{tr('Your file', 'Aapki file')}</SectionTitle>
          <ol style={list}>
            <li>
              {tr(
                'One row per member, with a name and a 10-digit mobile. Joining date, gender, birthday, address, batch, plan, fees, valid till and notes are optional.',
                'Har member ki ek row, naam aur 10 ank ke mobile ke saath. Joining date, gender, janam din, pata, Batch, Plan, Fees, valid till aur notes zaroori nahi.',
              )}
            </li>
            <li>
              {tr(
                'Works with .xlsx and .csv. Dates like 15/08/2026 are fine.',
                '.xlsx aur .csv dono chalti hain. 15/08/2026 jaisi date theek hai.',
              )}
            </li>
            <li>
              {tr(
                'Nothing is saved until you check the list and press Add.',
                'Jab tak aap list dekh kar Add nahi dabate, kuch save nahi hota.',
              )}
            </li>
          </ol>
          {stage === 'reading' && (
            <p role="status" aria-live="polite" style={{ ...muted, color: color.ink, fontWeight: 700, marginBottom: space.md }}>
              {tr('Reading the file… a big sheet can take a few seconds.', 'File padh rahe hain… badi sheet mein kuch second lagte hain.')}
            </p>
          )}
          <Row gap={space.sm}>
            <Button wrap disabled={stage === 'reading'} onClick={() => input.current?.click()}>
              {stage === 'reading' ? tr('Reading the file…', 'File padh rahe hain…') : tr('Choose file', 'File chuno')}
            </Button>
            <Button variant="ghost" wrap onClick={downloadSample}>
              {tr('Download sample file', 'Sample file download karo')}
            </Button>
          </Row>
        </Card>
      )}

      {stage === 'review' && file && plan && (
        <>
          <Card style={{ marginBottom: space.lg }}>
            <SectionTitle>{tr('Which column is which', 'Kaunsa column kya hai')}</SectionTitle>
            <p style={muted}>
              {tr(
                `${file.name}. We guessed from the column names — change any that are wrong.`,
                `${file.name}. Column ke naam se andaaza lagaya hai — jo galat ho use badlo.`,
              )}
            </p>
            <SelectField
              label={tr('Column names are on row', 'Column ke naam is row mein hain')}
              value={String(headerRow)}
              onChange={changeHeaderRow}
              options={file.rows.slice(0, 10).map((r, i) => ({
                value: String(i),
                label: `${i + 1}: ${r.map(cellText).filter(Boolean).slice(0, 4).join(', ').slice(0, 60) || tr('(empty)', '(khaali)')}`,
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
                    { value: '', label: tr('— Not in the file —', '— File mein nahi —') },
                    ...Array.from({ length: width }, (_, i) => ({
                      value: String(i),
                      label: `${columnLetter(i)} · ${(headers[i] || tr('(no name)', '(bina naam)')).slice(0, 40)}`,
                    })),
                  ]}
                />
              ))}
            </Grid>
            {(map.plan !== null || map.amount !== null || map.expiry !== null) && map.expiry === null && map.startDate === null && (
              <p style={{ ...muted, marginTop: space.lg }}>
                {tr(
                  'Pick the “Valid till” or “Plan start” column to bring each plan in with its dates. Without either, the plan and fees go into the member’s notes.',
                  'Har plan uski dates ke saath laane ke liye “Valid till” ya “Plan shuru” column chuno. Dono na ho to plan aur fees member ke notes mein jayenge.',
                )}
              </p>
            )}
            {map.joinedOn === null && (
              <p style={{ ...muted, marginTop: space.sm }}>
                {map.expiry !== null || map.startDate !== null
                  ? tr('No joining date column: each member’s plan start is used (today when there is none).', 'Joining date ka column nahi: har member ke plan ki shuru date lagegi (na ho to aaj ki).')
                  : tr('No joining date column: everyone gets today’s date.', 'Joining date ka column nahi: sabko aaj ki date milegi.')}
              </p>
            )}
          </Card>

          {(map.fullName === null || map.phone === null) && (
            <ErrorBanner>
              {map.fullName === null && map.phone === null
                ? tr('Pick the columns with the name and the mobile number.', 'Naam aur mobile number wale column chuno.')
                : map.fullName === null
                  ? tr('Pick the column with the name.', 'Naam wala column chuno.')
                  : tr('Pick the column with the mobile number.', 'Mobile number wala column chuno.')}
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

          <TermsLine rows={plan.rows} owner={role === 'owner'} />

          <ActionBar
            plan={plan.rows}
            dupMode={dupMode}
            blocked={map.fullName === null || map.phone === null}
            onRun={() => void run()}
            onOther={() => input.current?.click()}
          />
        </>
      )}

      {stage === 'running' && (
        <Card>
          <SectionTitle>{tr('Adding members…', 'Members jod rahe hain…')}</SectionTitle>
          <p style={muted}>
            {tr(`${progress.done} of ${progress.total} done. Keep this page open until it finishes.`, `${progress.total} mein se ${progress.done} ho gaye. Khatam hone tak yeh page khula rakho.`)}
          </p>
          <div
            role="progressbar"
            aria-label={tr('Import progress', 'Import kitna hua')}
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
          <SectionTitle>{tr('Import finished', 'Import ho gaya')}</SectionTitle>
          <p style={{ margin: 0, fontFamily: font.display, fontSize: 20, fontWeight: 700, color: color.ink }}>
            {tr(`${result.added} added, ${result.skipped.length} skipped`, `${result.added} jude, ${result.skipped.length} chhode`)}
            {result.updated > 0 ? tr(`, ${result.updated} filled in`, `, ${result.updated} mein details bhari`) : ''}
          </p>
          {result.terms && (result.terms.memberships > 0 || result.terms.skipped > 0) && (
            <p style={{ ...muted, marginTop: space.sm }}>
              {tr(
                `${result.terms.memberships} plans with their dates · ${result.terms.payments} receipts${result.terms.plans > 0 ? ` · ${result.terms.plans} new plan names added to Plans` : ''}${result.terms.skipped > 0 ? ` · ${result.terms.skipped} already here, not added again` : ''}.`,
                `${result.terms.memberships} plan unki dates ke saath · ${result.terms.payments} raseed${result.terms.plans > 0 ? ` · ${result.terms.plans} naye plan Plans mein jude` : ''}${result.terms.skipped > 0 ? ` · ${result.terms.skipped} pehle se the, dobara nahi jude` : ''}.`,
              )}
            </p>
          )}
          {result.termsError && (
            <div style={{ marginTop: space.md }}>
              <ErrorBanner>
                {tr(
                  `Members are saved, but their plans and payments did not save: ${result.termsError} Import the same file again — members already here are skipped and their plans are added then.`,
                  `Members save ho gaye, par unke plan aur payment save nahi hue: ${result.termsError} Wahi file phir import karo — jo members hain woh chhod diye jayenge aur plan jud jayenge.`,
                )}
              </ErrorBanner>
            </div>
          )}
          {result.termsForStaff && (
            <p style={{ ...muted, marginTop: space.sm }}>
              {tr(
                'Plans and payments in this file are added by the owner: ask them to import the same file (members already added are skipped).',
                'Is file ke plan aur payment owner jodte hain: unhe yahi file import karne ko kaho (jo members jud gaye woh chhod diye jayenge).',
              )}
            </p>
          )}
          {result.stopped && (
            <div style={{ marginTop: space.md }}>
              <ErrorBanner>
                {tr(`Saving stopped part-way: ${result.stopped} `, `Save beech mein ruk gaya: ${result.stopped} `)}
                {result.added > 0
                  ? tr(
                      `${result.added} members were saved (up to row ${result.lastSavedRow}); the rest may not have been. `,
                      `${result.added} members save ho gaye (row ${result.lastSavedRow} tak); baaki shayad nahi hue. `,
                    )
                  : tr('No new members were saved. ', 'Koi naya member save nahi hua. ')}
                {tr(
                  'Import the same file again when the internet is back — members already added are skipped, so nobody is added twice.',
                  'Internet aane par wahi file phir import karo — jo pehle jud gaye woh chhod diye jayenge, koi do baar nahi judega.',
                )}
              </ErrorBanner>
            </div>
          )}
          {result.skipped.length > 0 && (
            <p style={{ ...muted, marginTop: space.sm }}>
              {tr(
                'Download the skipped rows, fix them in Excel (the reason is in the first column) and import that file.',
                'Chhodi gayi rows download karo, Excel mein theek karo (wajah pehle column mein hai) aur woh file import karo.',
              )}
            </p>
          )}
          <Row gap={space.sm}>
            <div style={{ marginTop: space.lg }}>
              <Button wrap onClick={() => navigate('/members')}>
                {tr('Open members', 'Members dekho')}
              </Button>
            </div>
            {result.skipped.length > 0 && file && (
              <div style={{ marginTop: space.lg }}>
                <Button
                  variant="ghost"
                  wrap
                  onClick={() =>
                    downloadCsv(
                      csvFilename([tr('skipped rows', 'skipped rows'), file.name.replace(/\.[^.]+$/, '')]),
                      skippedRowsCsv(headers, result.skipped),
                    )
                  }
                >
                  {tr(`Download ${result.skipped.length} skipped rows`, `${result.skipped.length} chhodi rows download karo`)}
                </Button>
              </div>
            )}
            <div style={{ marginTop: space.lg }}>
              <Button variant="ghost" wrap onClick={startOver}>
                {tr('Import another file', 'Doosri file import karo')}
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
      <SectionTitle>{tr('Check the list', 'List check karo')}</SectionTitle>
      <p style={{ margin: 0, fontFamily: font.body, fontSize: 15, color: color.ink }}>
        {tr(
          `${rows.length} rows: ${counts.add} will be added, ${counts.duplicate} already members or repeated, ${counts.problem} with a problem.`,
          `${rows.length} rows: ${counts.add} judenge, ${counts.duplicate} pehle se member ya do baar, ${counts.problem} mein gadbad.`,
        )}
      </p>
      {leftOut > 0 && (
        <p style={{ ...muted, color: color.warning, marginTop: space.sm }}>
          {tr(
            `Only the first ${MAX_IMPORT_ROWS} rows are imported at once; ${leftOut} more were left out. Import them as a second file.`,
            `Ek baar mein pehli ${MAX_IMPORT_ROWS} rows hi judti hain; ${leftOut} aur chhoot gayi. Unhe doosri file mein import karo.`,
          )}
        </p>
      )}

      {inGym > 0 && (
        <div style={{ marginTop: space.lg }}>
          <p style={{ ...muted, marginBottom: space.sm }}>
            {tr(`${inGym} are already members of your gym (same mobile). For them:`, `${inGym} pehle se aapke gym ke member hain (wahi mobile). Unke liye:`)}
          </p>
          <ChipToggle
            label={tr('Members already in the gym', 'Pehle se gym ke members')}
            value={dupMode}
            onChange={(v) => setDupMode(v === 'fill' ? 'fill' : 'skip')}
            options={[
              { value: 'skip', label: tr('Skip them', 'Chhod do') },
              { value: 'fill', label: tr('Fill in their blank details', 'Khaali details bhar do') },
            ]}
          />
          {dupMode === 'fill' && (
            <p style={{ ...muted, marginTop: space.sm }}>
              {tr('Only empty details are filled in. Their name, mobile and joining date stay as they are.', 'Sirf khaali details bharengi. Naam, mobile aur joining date waise hi rahenge.')}
            </p>
          )}
        </div>
      )}

      <div style={{ margin: `${space.lg}px 0` }}>
        <ChipToggle
          label={tr('Show rows', 'Rows dikhao')}
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
          options={[
            { value: 'all', label: tr('All', 'Sab'), count: rows.length },
            { value: 'add', label: tr('Will be added', 'Judenge'), count: counts.add },
            { value: 'duplicate', label: tr('Already members', 'Pehle se member'), count: counts.duplicate },
            { value: 'problem', label: tr('Problems', 'Gadbad'), count: counts.problem },
          ]}
        />
      </div>

      {shown.length === 0 ? (
        <p style={muted}>{tr('No rows here.', 'Yahan koi row nahi.')}</p>
      ) : (
        <div style={{ display: 'grid', gap: space.sm }}>
          {shown.slice(0, SHOW_ROWS).map((r) => (
            <RowCard key={r.rowNumber} row={r} />
          ))}
        </div>
      )}
      {shown.length > SHOW_ROWS && (
        <p style={{ ...muted, marginTop: space.md }}>
          {tr(`Showing the first ${SHOW_ROWS} of ${shown.length}. All of them are counted above.`, `${shown.length} mein se pehli ${SHOW_ROWS} dikh rahi hain. Upar ginti mein sab hain.`)}
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
          {tr(`Row ${row.rowNumber}`, `Row ${row.rowNumber}`)} · {name || tr('(no name)', '(bina naam)')}
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
  dupMode,
  blocked,
  onRun,
  onOther,
}: {
  plan: ImportRow[];
  dupMode: 'skip' | 'fill';
  blocked: boolean;
  onRun: () => void;
  onOther: () => void;
}) {
  const adds = plan.filter((r) => r.status === 'add').length;
  const fills = dupMode === 'fill' ? plan.filter((r) => r.existing !== null && r.sameAsRow === null).length : 0;
  const label =
    fills > 0 && adds === 0
      ? tr(`Update ${fills} members`, `${fills} members update karo`)
      : fills > 0
      ? tr(`Add ${adds} members, update ${fills}`, `${adds} members jodo, ${fills} update karo`)
      : adds === 1
        ? tr('Add 1 member', '1 member jodo')
        : tr(`Add ${adds} members`, `${adds} members jodo`);
  return (
    <Row gap={space.sm}>
      <Button wrap disabled={blocked || adds + fills === 0} onClick={onRun}>
        {label}
      </Button>
      <Button variant="ghost" wrap onClick={onOther}>
        {tr('Choose another file', 'Doosri file chuno')}
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
function TermsLine({ rows, owner }: { rows: readonly ImportRow[]; owner: boolean }) {
  const withTerm = rows.filter((r) => r.term && r.status !== 'problem' && r.sameAsRow === null);
  if (withTerm.length === 0) return null;
  const paid = withTerm.reduce((sum, r) => sum + (r.term?.paidP ?? 0), 0);
  const names = new Set(withTerm.map((r) => r.term!.planName.toLowerCase())).size;
  return (
    <Card>
      <SectionTitle>{tr('Plans and payments', 'Plan aur payment')}</SectionTitle>
      <p style={{ margin: 0, fontSize: 14, color: color.ink }}>
        {owner
          ? tr(
              `${withTerm.length} members come with their plan and its dates (${names} plan names)${paid > 0 ? `, and ${formatINR(paid)} already paid as receipts` : ''}. Expiry reminders work for them from day one.`,
              `${withTerm.length} members apne plan aur uski dates ke saath aayenge (${names} plan)${paid > 0 ? `, aur ${formatINR(paid)} di hui fees raseed ban kar` : ''}. Expiry reminder pehle din se chalenge.`,
            )
          : tr(
              `${withTerm.length} members have a plan in this file. The owner adds plans and payments: members are added now, plans when the owner imports the same file.`,
              `Is file mein ${withTerm.length} members ka plan hai. Plan aur payment owner jodte hain: members abhi judenge, plan tab jab owner yahi file import karenge.`,
            )}
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
      const kept = r.kept.members + r.kept.memberships + r.kept.plans;
      setDone(
        tr(
          `Import taken back: ${r.members} members, ${r.memberships} plans with dates, ${r.payments} receipts removed.${kept > 0 ? ` ${kept} kept because the gym used them after the import.` : ''}`,
          `Import wapas ho gaya: ${r.members} members, ${r.memberships} plan dates ke saath, ${r.payments} raseed hataye.${kept > 0 ? ` ${kept} rakhe, kyunki import ke baad gym ne inhe use kiya.` : ''}`,
        ),
      );
      setAsking(null);
    } catch (e) {
      console.warn('[ForgeErr] undo import', e);
      setFailed(
        tr(
          'The import was not fully taken back (check the internet). Press Undo again: what is already gone stays gone, the rest goes.',
          'Import poora wapas nahi hua (internet check karo). Undo phir dabao: jo hat gaya woh hata rahega, baaki ab hatega.',
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  const when = (at: number | null) =>
    at == null ? tr('Earlier import', 'Pichhla import') : new Date(at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

  return (
    <Card style={{ marginTop: space.lg }}>
      <SectionTitle>{tr('Past imports', 'Pichhle import')}</SectionTitle>
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
                {tr(
                  `${imp.members} members · ${imp.memberships} plans with dates · ${imp.payments} receipts`,
                  `${imp.members} members · ${imp.memberships} plan dates ke saath · ${imp.payments} raseed`,
                )}
              </div>
            </div>
            {asking !== imp.importId && (
              <Button variant="ghost" tone="danger" disabled={busy} onClick={() => { setDone(null); setAsking(imp.importId); }} ariaLabel={tr(`Undo the import of ${when(imp.at)}`, `${when(imp.at)} ka import wapas lo`)}>
                {tr('Undo this import', 'Yeh import wapas lo')}
              </Button>
            )}
          </div>
          {asking === imp.importId && ask && (
            <div style={{ marginTop: space.sm }}>
              <p style={{ ...muted, color: color.ink }}>
                {tr(
                  `This removes ${ask.members.length} members, ${ask.memberships.length} plans with dates and ${ask.payments.length} receipts that this file added.`,
                  `Isse is file se jude ${ask.members.length} members, ${ask.memberships.length} plan dates ke saath aur ${ask.payments.length} raseed hat jayenge.`,
                )}
                {ask.kept.members + ask.kept.memberships + ask.kept.plans > 0
                  ? tr(
                      ` ${ask.kept.members + ask.kept.memberships + ask.kept.plans} stay, because the gym used them after the import (a check-in, a payment at the desk, a plan sold).`,
                      ` ${ask.kept.members + ask.kept.memberships + ask.kept.plans} rahenge, kyunki import ke baad gym ne inhe use kiya (check-in, desk par payment, plan becha).`,
                    )
                  : ''}
                {tr(' Members you typed in yourself are never touched.', ' Jo members aapne khud likhe, unhe kuch nahi hoga.')}
              </p>
              <Row gap={space.sm}>
                <Button tone="danger" disabled={busy} onClick={() => run(imp.importId)}>
                  {busy ? tr('Taking it back…', 'Wapas ho raha hai…') : tr('Yes, undo it', 'Haan, wapas lo')}
                </Button>
                <Button variant="ghost" disabled={busy} onClick={() => setAsking(null)}>
                  {tr('Keep it', 'Rehne do')}
                </Button>
              </Row>
            </div>
          )}
        </div>
      ))}
    </Card>
  );
}
