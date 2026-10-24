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

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { csvFilename } from '../../logic/csv';
import {
  applyCellEdits,
  cellText,
  columnLetter,
  emptyColumnMap,
  extrasOverCap,
  fieldLabel,
  findHeaderRow,
  importAction,
  IMPORT_FIELDS,
  MAX_IMPORT_ROWS,
  planImport,
  rowVerdict,
  skippedRowsCsv,
  SKIP_BRANCH,
  templateCsv,
  termsPreview,
  MAX_EXTRAS,
  usableExtras,
  type BranchRouting,
  type Cell,
  type CellEdits,
  type ColumnMap,
  type ExtraColumn,
  type ImportField,
  type ImportRow,
  type NotMemberRow,
  type RowStatus,
} from '../../logic/importMembers';
import {
  AI_WORDS,
  aiColumnsPayload,
  applyAiPicks,
  askAiForColumns,
  columnName,
  columnSamples,
  findIdColumns,
  idNamedColumns,
  freeColumns,
} from '../../logic/aiImport';
import { branchesToOpen, branchNamesInFile, rowsPerBranch, type BranchNameInFile } from '../../logic/importBranches';
import { guessMapAt, sheetExtras, sheetWidth, type ExtraChoice } from '../../logic/importGuess';
import { mergeSaveResults, rowsToRetry, saveImport, type ImportSaver, type ImportSaveResult, type SkippedRow } from '../../logic/importSave';
import { formatPhone } from '../../logic/members';
import { useCrm } from '../../store';
import { useAuth, useRole } from '../../auth/AuthProvider';
import { matchBranchName, useBranches } from '../../branches/context';
import type { CrmData, CrmSnapshot } from '../../data/adapter';
import type { Member } from '../../types';
import { previewImportMoney } from '../../data/importPreview';
import { pastImports, planUndo } from '../../logic/undoImport';
import { bestSheet, readSheets, usableSheets, type SheetRows } from '../../logic/sheets';
import { formatINR } from '../../logic/money';
import { downloadCsv } from '../download';
import { Button, Card, ChipToggle, ErrorBanner, Grid, PageHeader, Pill, Row, SectionTitle, SelectField, TextField, TOUCH, color, font, radius, space } from '../kit';
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

/**
 * #36 / #41: what the import did, branch by branch (`logic/importSave.ts`), plus the import id so
 * "Try again" files the waiting rows under the same import (one "Undo this import" per branch).
 */
interface Result extends ImportSaveResult {
  importId: string;
}

/** #41: another branch's records, opened to check duplicates and to save into. */
type OtherBranch =
  | { state: 'opening' }
  | { state: 'open'; data: CrmData; snapshot: CrmSnapshot }
  | { state: 'failed'; words: string };

/** #47: the "Ask AI to match the columns" card. */
type AiState =
  | { stage: 'idle' }
  | { stage: 'asking' }
  | { stage: 'skipped' }
  | { stage: 'done'; filled: number; held: string[]; left: number | null }
  | { stage: 'error'; words: string };

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
  // #41: a gym with several branches. With one branch (`multi` false) nothing below changes.
  const branchCtx = useBranches();
  const multi = branchCtx.multi;
  const currentGymId = branchCtx.currentGymId;
  const branchList = useMemo(() => branchCtx.branches.map((b) => ({ gymId: b.gymId, name: b.name })), [branchCtx.branches]);
  const match = useCallback((typed: string) => matchBranchName(typed, branchList), [branchList]);
  const branchName = useCallback(
    (gymId: string) => branchList.find((b) => b.gymId === gymId)?.name ?? (gymId === '' ? 'this branch' : 'that branch'),
    [branchList],
  );
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
  // #47 AI import: the owner's extra details, the fields the AI filled in, and the AI card.
  const { session } = useAuth();
  const [extraChoices, setExtraChoices] = useState<Record<number, ExtraChoice>>({});
  const [aiFields, setAiFields] = useState<ImportField[]>([]);
  const [ai, setAi] = useState<AiState>({ stage: 'idle' });
  /** Bumped whenever the sheet or its header row changes: an AI answer for the old one is dropped. */
  const aiTurn = useRef(0);
  // #41: the owner's pick for each branch name in the file, the branch for each sheet, and the
  // other branches opened for this import.
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [sheetGym, setSheetGym] = useState<Record<number, string>>({});
  const [others, setOthers] = useState<Record<string, OtherBranch>>({});
  // #36: fixes typed into "Rows to check", and the rows the owner skipped there.
  const [edits, setEdits] = useState<CellEdits>({});
  const [skippedByOwner, setSkippedByOwner] = useState<ReadonlySet<number>>(new Set());
  const [lastFixed, setLastFixed] = useState<string | null>(null);
  const [importedSheets, setImportedSheets] = useState<readonly number[]>([]);

  const headers = useMemo(() => (file ? (file.rows[headerRow] ?? []).map(cellText) : []), [file, headerRow]);
  const width = useMemo(() => (file ? sheetWidth(file.rows) : 0), [file]);
  const idCols = useMemo(() => (file ? findIdColumns(file.rows, headerRow, width) : []), [file, headerRow, width]);
  const idColNums = useMemo(() => idCols.map((c) => c.col), [idCols]);
  const idNamed = useMemo(() => (file ? idNamedColumns(file.rows, headerRow, width, idColNums) : []), [file, headerRow, width, idColNums]);
  const free = useMemo(() => (file ? freeColumns(file.rows, headerRow, width, map, idColNums) : []), [file, headerRow, width, map, idColNums]);
  // #36: every other column is kept unless the owner unticks it; a column that only numbers the
  // rows starts unticked (and says so).
  const extras = useMemo<ExtraColumn[]>(
    () => (file ? sheetExtras(file.rows, headerRow, map, idColNums, extraChoices) : []),
    [file, headerRow, map, idColNums, extraChoices],
  );

  // The sheet with the owner's fixes typed in: what is checked and saved.
  const sheetRows = useMemo(() => (file ? applyCellEdits(file.rows, edits) : []), [file, edits]);

  // #41: where each row goes.
  const defaultSheetGym = useMemo(() => {
    if (!file || !multi) return currentGymId;
    const name = file.sheets[file.sheet]?.name ?? '';
    return (file.sheets.length > 1 ? match(name) : null) ?? currentGymId;
  }, [file, multi, match, currentGymId]);
  const sheetGymId = file ? sheetGym[file.sheet] ?? defaultSheetGym : currentGymId;
  const branchNames = useMemo<BranchNameInFile[]>(
    () => (file && multi && map.branch !== null ? branchNamesInFile(sheetRows, headerRow, map, { match, answers }) : []),
    [file, multi, map, sheetRows, headerRow, match, answers],
  );
  const needed = useMemo(
    () => (multi ? branchesToOpen(branchNames, sheetGymId, currentGymId, map.branch !== null) : []),
    [multi, branchNames, sheetGymId, currentGymId, map.branch],
  );
  // Open each other branch the rows go to (once): its members are checked for duplicates, and the rows are saved into it.
  useEffect(() => {
    if (stage !== 'review') return;
    for (const id of needed) {
      if (others[id]) continue;
      setOthers((prev) => ({ ...prev, [id]: { state: 'opening' } }));
      void (async () => {
        try {
          const data = await branchCtx.dataFor(id);
          const snap = await data.load();
          setOthers((prev) => ({ ...prev, [id]: { state: 'open', data, snapshot: snap } }));
        } catch (e) {
          console.warn('[ForgeErr] import members: branch could not be opened', id, e);
          const words = e instanceof Error && e.message ? e.message : 'It could not be opened.';
          setOthers((prev) => ({ ...prev, [id]: { state: 'failed', words } }));
        }
      })();
    }
  }, [needed, others, branchCtx, stage]);
  const stillOpening = needed.filter((id) => !others[id] || others[id]!.state === 'opening');
  const routing = useMemo<BranchRouting | undefined>(() => {
    if (!multi) return undefined;
    const rosters: Record<string, readonly Member[]> = {};
    const failed: Record<string, string> = {};
    for (const [id, o] of Object.entries(others)) {
      if (o.state === 'open') rosters[id] = o.snapshot.members;
      else if (o.state === 'failed') failed[id] = o.words;
    }
    return { branches: branchList, currentGymId, sheetGymId: map.branch === null ? sheetGymId : null, match, answers, rosters, failed };
  }, [multi, others, branchList, currentGymId, map.branch, sheetGymId, match, answers]);

  const plan = useMemo(
    () =>
      file && stage === 'review'
        ? planImport(sheetRows, headerRow, map, snapshot.members, today, { extras, idCols: idColNums, branches: routing })
        : null,
    [file, stage, sheetRows, headerRow, map, snapshot.members, today, extras, idColNums, routing],
  );

  // UAT U-A10: the money the import will really save as receipts, worked out by the import itself
  // (#41: on each branch's own records).
  const [previewPaidP, setPreviewPaidP] = useState<number | null>(null);
  // #36 review: the money preview could not be worked out (the import itself still works).
  const [previewFailed, setPreviewFailed] = useState(false);
  useEffect(() => {
    setPreviewPaidP(null);
    if (!plan || role !== 'owner') return;
    let cancelled = false;
    const groups = new Map<string, ImportRow[]>();
    for (const r of plan.rows) {
      const g = r.gymId === undefined || r.gymId === currentGymId ? '' : r.gymId;
      groups.set(g, [...(groups.get(g) ?? []), r]);
    }
    const runs = [...groups.entries()].map(([g, rows]) => {
      const o = g === '' ? null : others[g];
      const snap = g === '' ? snapshot : o?.state === 'open' ? o.snapshot : null;
      if (!snap) return Promise.resolve({ receipts: 0, paidP: 0 });
      const adds = rows.filter((r) => r.status === 'add' && r.draft !== null).map((r) => r.draft!);
      // The same rows, in the same order, as the import hands to importTerms.
      const terms = rows
        .filter((r) => r.term && r.draft && (r.status === 'add' || r.existing !== null || r.sameAsRow !== null))
        .sort((a, b) => a.rowNumber - b.rowNumber)
        .map((r) => ({ phone: r.draft!.phone, term: r.term! }));
      return previewImportMoney(snap, adds, terms, today);
    });
    void Promise.all(runs)
      .then((all) => {
        if (cancelled) return;
        setPreviewFailed(false);
        setPreviewPaidP(all.some((r) => r === null) ? null : all.reduce((t, r) => t + (r?.paidP ?? 0), 0));
      })
      .catch((e: unknown) => {
        console.warn('[ForgeErr] import: money preview', e);
        if (cancelled) return;
        setPreviewPaidP(null);
        setPreviewFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [plan, snapshot, role, today, others, currentGymId]);

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
    setAnswers({});
    setSheetGym({});
    setImportedSheets([]);
    openSheet({ name: f.name, rows: [], sheets, sheet: 0, auto: true }, bestSheet(sheets));
  };

  /**
   * Our column guesses for a header row: by name, then by what is in the columns; ID-number columns
   * taken back out. #41: with several branches, a column of branch names is found even when its name
   * says nothing; with one branch, a "Branch" column is just another detail to keep.
   */
  const guessMap = (rows: Cell[][], h: number): ColumnMap => guessMapAt(rows, h, today, multi ? match : null);

  /** A new sheet or header row: typed fixes and skips start again. */
  const resetRows = () => {
    setEdits({});
    setSkippedByOwner(new Set());
    setLastFixed(null);
  };

  /** Show one sheet of the file: its header row and column guesses start again. */
  const openSheet = (loaded: Loaded, i: number) => {
    const rows = loaded.sheets[i]?.rows ?? [];
    const h = findHeaderRow(rows);
    setFile({ ...loaded, rows, sheet: i });
    setHeaderRow(h);
    setMap(guessMap(rows, h));
    resetAi();
    resetRows();
    setFilter('all');
    setStage('review');
  };

  /** A new sheet or header row: the AI's earlier answer and the extra details start again. */
  const resetAi = () => {
    aiTurn.current += 1;
    setExtraChoices({});
    setAiFields([]);
    setAi({ stage: 'idle' });
  };

  /** #47: the owner said yes. Only the masked column names and 5 example rows go. */
  const askAi = async () => {
    if (!file || !session) return;
    const turn = aiTurn.current;
    setAi({ stage: 'asking' });
    const answer = await askAiForColumns(session.ownerKey, aiColumnsPayload(file.rows, headerRow, width, idColNums));
    if (turn !== aiTurn.current) return; // the owner moved to another sheet meanwhile
    if (!answer.ok) {
      setAi({ stage: 'error', words: answer.words });
      return;
    }
    // #41: a gym with one branch has no Branch box: that column stays a detail to keep.
    const picks = multi ? answer.picks : answer.picks.filter((p) => !('field' in p.target && p.target.field === 'branch'));
    const applied = applyAiPicks(map, picks, idColNums, headers);
    setMap(applied.map);
    setAiFields(applied.aiFields);
    // A detail the owner already ticked or renamed stays as the owner left it.
    setExtraChoices((prev) => ({ ...applied.extras, ...prev }));
    const ticked = Object.values(applied.extras).filter((e) => e.on).length;
    setAi({ stage: 'done', filled: applied.aiFields.length + ticked, held: applied.held, left: answer.left });
  };

  const setExtra = (col: number, change: Partial<ExtraChoice>) => {
    setExtraChoices((prev) => {
      const now = extras.find((e) => e.col === col);
      if (!now) return prev;
      return { ...prev, [col]: { label: now.label, on: now.on, ai: now.ai, aiIgnored: now.aiIgnored, ...change } };
    });
  };

  const pickColumn = (field: ImportField, value: string) => {
    const col = value === '' ? null : Number(value);
    setAiFields((prev) => prev.filter((f) => f !== field));
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
    setMap(guessMap(file.rows, h));
    resetAi();
    resetRows();
  };

  /** #36: the owner's fix for one row, from "Rows to check". */
  const fixRow = (row: ImportRow, fix: Record<number, string>) => {
    setEdits((prev) => ({ ...prev, [row.rowNumber - 1]: { ...(prev[row.rowNumber - 1] ?? {}), ...fix } }));
    setLastFixed(`Row ${row.rowNumber} checked again.`);
  };

  /** The store each branch saves through: this branch's own (so the screens redraw), the others' opened. */
  const saverFor = async (gymId: string): Promise<ImportSaver> => {
    if (gymId === '' || gymId === currentGymId) return { createMembers, updateMember, importTerms };
    const o = others[gymId];
    if (o?.state === 'open') return o.data;
    return branchCtx.dataFor(gymId);
  };

  const run = async () => {
    if (!plan || !file) return;
    // Frozen now: each save re-reads the gym, and a live plan would start calling the members
    // just added "already a member".
    const rows = plan.rows;
    const importId = `import-${Date.now().toString(36)}`;
    setStage('running');
    setProgress({ done: 0, total: 0 });
    // #36 / #41: branch by branch; a failure only holds back its own rows (logic/importSave.ts).
    // Every record this import makes carries one id (data migration, 15 Oct 2026).
    const saved = await saveImport({
      rows,
      dupMode,
      role,
      importId,
      saverFor,
      branchName,
      currentGymId,
      onProgress: (done, total) => setProgress({ done, total }),
    });
    for (const b of saved.branches) if (b.stopped) console.warn('[ForgeErr] import members: saving stopped', b.gymId, b.stopped);
    setResult({ ...saved, importId });
    setImportedSheets((prev) => [...prev, file.sheet]);
    // The other branches changed: they are opened again for the next sheet.
    setOthers({});
    setStage('done');
  };

  /** #36: "Try again": only the rows still waiting, under the same import. */
  const retry = async () => {
    if (!result) return;
    const rows = rowsToRetry(result);
    if (rows.length === 0) return;
    setStage('running');
    setProgress({ done: 0, total: 0 });
    const again = await saveImport({
      rows,
      dupMode,
      role,
      importId: result.importId,
      saverFor,
      branchName,
      currentGymId,
      onProgress: (done, total) => setProgress({ done, total }),
    });
    setResult({ ...mergeSaveResults(result, again), importId: result.importId });
    setStage('done');
  };

  const nextSheet = file ? file.sheets.findIndex((_, i) => i !== file.sheet && !importedSheets.includes(i)) : -1;

  const startOver = () => {
    setFile(null);
    setResult(null);
    setError(null);
    resetAi();
    resetRows();
    setOthers({});
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
              Other columns (locker number, blood group…) can be kept as extra details. Aadhaar and PAN numbers are never imported.
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
          {/* #47: owner of an online gym only; never shown when every column is already placed. */}
          {role === 'owner' && session && ai.stage !== 'skipped' && (ai.stage !== 'idle' || free.length > 0 || map.fullName === null || map.phone === null) && (
            <AiCard ai={ai} onAsk={() => void askAi()} onSkip={() => setAi({ stage: 'skipped' })} />
          )}

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
                  label: `${sh.name} (${filledRows(sh.rows)} rows)${importedSheets.includes(i) ? ' · added' : ''}`,
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
              {/* #41: the Branch box only for a gym with 2 or more branches. */}
              {IMPORT_FIELDS.filter((f) => multi || f !== 'branch').map((field) => (
                <SelectField
                  key={field}
                  label={fieldLabel(field) + (field === 'fullName' || field === 'phone' ? ' *' : '') + (aiFields.includes(field) ? ' · AI' : '')}
                  value={map[field] === null ? '' : String(map[field])}
                  onChange={(v) => pickColumn(field, v)}
                  options={[
                    { value: '', label: '— Not in the file —' },
                    // Review of #47: every column can be picked by hand, an ID-number one too (its
                    // Aadhaar / PAN numbers are cut out of whatever is read).
                    ...Array.from({ length: width }, (_, i) => ({
                      value: String(i),
                      label: `${columnLetter(i)} · ${(headers[i] || '(no name)').slice(0, 40)}${idColNums.includes(i) ? ' (ID numbers)' : ''}`,
                    })),
                  ]}
                />
              ))}
            </Grid>
            {idCols.map((c) => (
              <p key={c.col} style={{ ...muted, marginTop: space.md, color: color.warning }}>
                {`Not imported: ${columnName(headers, c.col)} has ${c.kind === 'aadhaar' ? 'Aadhaar' : 'PAN'} numbers. ID numbers are never imported.`}
              </p>
            ))}
            {idNamed.map((col) => (
              <p key={`named-${col}`} style={{ ...muted, marginTop: space.md }}>
                {`${columnName(headers, col)} is read as usual. Any Aadhaar or PAN number in it is left out.`}
              </p>
            ))}
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

          {multi && map.branch !== null && (
            <BranchNamesCard
              names={branchNames}
              branches={branchList}
              others={others}
              needed={needed}
              counts={rowsPerBranch(plan.rows)}
              onPick={(key, gymId) => setAnswers((prev) => ({ ...prev, [key]: gymId }))}
              onRetry={(id) => setOthers((prev) => { const next = { ...prev }; delete next[id]; return next; })}
            />
          )}
          {multi && map.branch === null && (
            <SheetBranchCard
              branches={branchList}
              value={sheetGymId}
              severalSheets={file.sheets.length > 1}
              other={sheetGymId !== currentGymId ? others[sheetGymId] ?? { state: 'opening' } : null}
              name={branchName(sheetGymId)}
              onPick={(gymId) => setSheetGym((prev) => ({ ...prev, [file.sheet]: gymId }))}
              onRetry={() => setOthers((prev) => { const next = { ...prev }; delete next[sheetGymId]; return next; })}
            />
          )}

          {free.length > 0 && (
            <ExtrasCard
              extras={extras}
              names={(col) => columnName(headers, col)}
              samples={(col) => columnSamples(file.rows, headerRow, col)}
              onChange={setExtra}
            />
          )}

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
            notMembers={plan.notMembers}
            filter={filter}
            setFilter={setFilter}
            dupMode={dupMode}
            setDupMode={setDupMode}
            branchOf={multi ? branchName : null}
          />

          <RowsToCheck
            rows={plan.rows.filter((r) => r.status === 'problem' && !r.ownerSkipped && !skippedByOwner.has(r.rowNumber))}
            skipped={skippedByOwner.size}
            map={map}
            sheetRows={sheetRows}
            lastFixed={lastFixed}
            onFix={fixRow}
            onSkip={(r) => setSkippedByOwner((prev) => new Set([...prev, r.rowNumber]))}
            onUnskip={() => setSkippedByOwner(new Set())}
          />

          <TermsLine rows={plan.rows} owner={role === 'owner'} paidP={previewPaidP} />
          {previewFailed && (
            <p role="status" style={muted}>
              We couldn’t add up the money in this file before the import. Each receipt is still checked when it is added.
            </p>
          )}

          {stillOpening.length > 0 && (
            <p role="status" aria-live="polite" style={{ ...muted, color: color.ink, fontWeight: 700, margin: `${space.lg}px 0 0` }}>
              {`Opening ${stillOpening.map((id) => branchName(id)).join(', ')}… The Add button works once ${stillOpening.length === 1 ? 'it is' : 'they are'} open.`}
            </p>
          )}

          <ActionBar
            plan={plan.rows}
            role={role}
            dupMode={dupMode}
            blocked={map.fullName === null || map.phone === null || stillOpening.length > 0}
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

      {stage === 'done' && result && file && (
        <DoneCard
          result={result}
          multi={multi}
          currentGymId={currentGymId}
          branchName={branchName}
          onDownload={() =>
            downloadCsv(
              csvFilename(['skipped rows', file.name.replace(/\.[^.]+$/, '')]),
              skippedRowsCsv(headers, result.skipped),
            )
          }
          onRetry={() => void retry()}
          nextSheet={nextSheet >= 0 ? file.sheets[nextSheet]?.name ?? '' : null}
          onNextSheet={() => {
            if (nextSheet < 0) return;
            setResult(null);
            openSheet({ ...file, auto: false }, nextSheet);
          }}
          onStartOver={startOver}
        />
      )}
      {role === 'owner' && (stage === 'pick' || stage === 'done') && <PastImports />}
    </>
  );
}

function Review({
  rows,
  counts,
  leftOut,
  notMembers,
  filter,
  setFilter,
  dupMode,
  setDupMode,
  branchOf,
}: {
  rows: ImportRow[];
  counts: { add: number; duplicate: number; problem: number };
  leftOut: number;
  notMembers: readonly NotMemberRow[];
  filter: Filter;
  setFilter: (f: Filter) => void;
  dupMode: 'skip' | 'fill';
  setDupMode: (m: 'skip' | 'fill') => void;
  /** #41: a gym with several branches: each row says where it goes. */
  branchOf: ((gymId: string) => string) | null;
}) {
  const totals = notMembers.filter((r) => r.why === 'total').map((r) => r.rowNumber);
  const strays = notMembers.filter((r) => r.why === 'stray').map((r) => r.rowNumber);
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
      {/* #36: rows that are not members are named, never dropped without a word. */}
      {totals.length > 0 && (
        <p style={{ ...muted, marginTop: space.sm }}>
          {`Not added: ${rowsWord(totals)} ${totals.length === 1 ? 'is a totals row' : 'are totals rows'}, not ${totals.length === 1 ? 'a member' : 'members'}.`}
        </p>
      )}
      {strays.length > 0 && (
        <p style={{ ...muted, marginTop: space.sm }}>
          {`Not added: ${rowsWord(strays)} ${strays.length === 1 ? 'has' : 'have'} only one cell filled in, with no name and no mobile.`}
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
            <RowCard key={r.rowNumber} row={r} branch={branchOf && r.gymId !== undefined ? branchOf(r.gymId) : null} />
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

function RowCard({ row, branch }: { row: ImportRow; branch: string | null }) {
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
      {row.draft && (
        <div style={{ color: color.inkSecondary, marginTop: 2 }}>
          {formatPhone(row.draft.phone)}
          {branch ? ` · Goes to ${branch}` : ''}
        </div>
      )}
      {row.draft?.extra && Object.keys(row.draft.extra).length > 0 && (
        <div style={{ color: color.inkSecondary, fontSize: 13, marginTop: 2 }}>
          {Object.entries(row.draft.extra)
            .map(([k, v]) => `${k}: ${v}`)
            .join(' · ')}
        </div>
      )}
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

/**
 * #47: the owner is asked before every AI read, in one line (honest wording per the review). "I'll
 * match them myself" sends nothing; the column boxes below always work without the AI.
 */
function AiCard({ ai, onAsk, onSkip }: { ai: AiState; onAsk: () => void; onSkip: () => void }) {
  return (
    <Card style={{ marginBottom: space.lg }}>
      <SectionTitle>Match the columns with AI</SectionTitle>
      {(ai.stage === 'idle' || ai.stage === 'asking') && (
        <>
          <p style={{ ...muted, color: color.ink }}>{AI_WORDS.ask}</p>
          <p style={{ ...muted, marginTop: space.sm }}>Nothing is saved until you check the list and tap Add.</p>
          {ai.stage === 'asking' && (
            <p role="status" aria-live="polite" style={{ ...muted, color: color.ink, fontWeight: 700, marginTop: space.sm }}>
              {AI_WORDS.asking}
            </p>
          )}
          <div style={{ marginTop: space.md }}>
            <Row gap={space.sm}>
              <Button wrap disabled={ai.stage === 'asking'} onClick={onAsk}>
                {ai.stage === 'asking' ? AI_WORDS.asking : 'Ask AI'}
              </Button>
              <Button variant="ghost" wrap disabled={ai.stage === 'asking'} onClick={onSkip}>
                I’ll match them myself
              </Button>
            </Row>
          </div>
        </>
      )}
      {ai.stage === 'done' && (
        <div role="status" aria-live="polite">
          <p style={{ ...muted, color: color.ink, fontWeight: 700 }}>
            {ai.filled > 0
              ? `AI matched ${ai.filled} ${ai.filled === 1 ? 'column' : 'columns'}. They are marked “AI” below. Check them before you add.`
              : ai.held.length > 0
                ? AI_WORDS.unsure
                : 'AI found nothing more to match. Match the rest yourself below.'}
          </p>
          {ai.held.map((h) => (
            <p key={h} style={{ ...muted, marginTop: space.sm }}>
              {`${h} Change the box below if that is right.`}
            </p>
          ))}
          {ai.left !== null && (
            <p style={{ ...muted, marginTop: space.sm }}>{`${ai.left} AI ${ai.left === 1 ? 'match' : 'matches'} left today.`}</p>
          )}
        </div>
      )}
      {ai.stage === 'error' && (
        <p role="status" aria-live="polite" style={{ ...muted, color: color.warning }}>
          {ai.words}
        </p>
      )}
    </Card>
  );
}

/**
 * #47: columns that fit no box. Each one ticked becomes the gym's own detail on every member it
 * has a value for ("Locker No.: 12"), shown on the member's page. Nothing is kept unless ticked.
 */
function ExtrasCard({
  extras,
  names,
  samples,
  onChange,
}: {
  extras: readonly ExtraColumn[];
  names: (col: number) => string;
  samples: (col: number) => string[];
  onChange: (col: number, change: Partial<ExtraChoice>) => void;
}) {
  const kept = usableExtras(extras).length;
  const ticked = extras.filter((e) => e.on).length;
  // #36: every ticked column past the cap is named before the import.
  const over = extrasOverCap(extras);
  return (
    <Card style={{ marginBottom: space.lg }}>
      <SectionTitle>Other columns in your file</SectionTitle>
      <p style={muted}>
        These columns fit none of the boxes above. Each ticked column is kept as a detail on the member’s page. You can change its name. Untick a column you don’t need.
      </p>
      <ul style={{ listStyle: 'none', margin: `${space.sm}px 0 0`, padding: 0, display: 'grid' }}>
        {extras.map((e, i) => {
          const eg = samples(e.col);
          return (
            <li key={e.col} style={{ borderTop: i ? `1px solid ${color.border}` : 'none', padding: `${space.sm}px 0` }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: space.sm, minHeight: TOUCH, fontFamily: font.body, fontSize: 15, color: color.ink, cursor: 'pointer', minWidth: 0, overflowWrap: 'anywhere' }}>
                <input type="checkbox" checked={e.on} onChange={() => onChange(e.col, { on: !e.on })} style={{ width: 20, height: 20, flex: 'none' }} />
                <span style={{ minWidth: 0 }}>{`Keep ${names(e.col)}`}</span>
                {e.ai && <Pill tone="muted">AI</Pill>}
              </label>
              {eg.length > 0 && <p style={{ ...muted, fontSize: 13, paddingLeft: 28 }}>{`e.g. ${eg.join(', ')}`}</p>}
              {!e.on && e.aiIgnored && (
                <p style={{ ...muted, fontSize: 13, paddingLeft: 28 }}>AI says this column is not needed, so it is not kept. Tick it to keep it.</p>
              )}
              {!e.on && !e.aiIgnored && e.rowNumbers && (
                <p style={{ ...muted, fontSize: 13, paddingLeft: 28 }}>It only numbers the rows, so it is not kept. Tick it to keep it.</p>
              )}
              {e.on && (
                <div style={{ paddingLeft: 28 }}>
                  <TextField label="Name on the member’s page" value={e.label} onChange={(v) => onChange(e.col, { label: v })} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {over.length > 0 && (
        <p style={{ ...muted, marginTop: space.sm, color: color.warning }}>
          {`Not brought in: ${over.map((e) => names(e.col)).join(', ')}. One member can keep at most ${MAX_EXTRAS} details from your file. Untick other columns to bring these in.`}
        </p>
      )}
      {ticked > 0 && kept < Math.min(ticked, MAX_EXTRAS) && (
        <p style={{ ...muted, marginTop: space.sm, color: color.warning }}>A ticked column with no name is not kept. Give it a name.</p>
      )}
    </Card>
  );
}

/** Rows of "Rows to check" drawn at once (the rest are in the skipped-rows file after the import). */
const CHECK_ROWS = 50;

/**
 * #41: one sheet for all branches. Each different name in its Branch column is listed ONCE: the
 * branch it was matched to (changeable), or "Pick a branch" when none fits. "Skip these rows"
 * leaves that name's rows out on purpose.
 */
function BranchNamesCard({
  names,
  branches,
  others,
  needed,
  counts,
  onPick,
  onRetry,
}: {
  names: readonly BranchNameInFile[];
  branches: readonly { gymId: string; name: string }[];
  others: Readonly<Record<string, OtherBranch>>;
  needed: readonly string[];
  counts: ReadonlyMap<string, { add: number; duplicate: number }>;
  onPick: (key: string, gymId: string) => void;
  onRetry: (gymId: string) => void;
}) {
  const waiting = names.filter((nm) => nm.target === null);
  const nameOf = (id: string) => branches.find((b) => b.gymId === id)?.name ?? 'that branch';
  return (
    <Card style={{ marginBottom: space.lg }}>
      <SectionTitle>Branches in your file</SectionTitle>
      <p style={muted}>Your file has a column with each member’s branch. Check that each name goes to the right branch.</p>
      {waiting.length > 0 && (
        <p style={{ ...muted, color: color.warning, marginTop: space.sm }}>
          {`${waiting.length === 1 ? '1 name matches' : `${waiting.length} names match`} none of your branches. Pick a branch for ${waiting.length === 1 ? 'it' : 'each one'}, or pick “Skip these rows”. Until then, those rows wait under “Rows to check”.`}
        </p>
      )}
      <Grid min={220}>
        {names.map((nm) => (
          <SelectField
            key={nm.key}
            label={nm.shown ? `“${nm.shown.slice(0, 40)}” · ${n(nm.rows, 'row')}` : `No branch written · ${n(nm.rows, 'row')}`}
            value={nm.target ?? ''}
            onChange={(v) => onPick(nm.key, v)}
            error={nm.target === null ? 'Pick a branch for these rows.' : null}
            options={[
              ...(nm.target === null ? [{ value: '', label: 'Pick a branch' }] : []),
              ...branches.map((b) => ({ value: b.gymId, label: b.name })),
              { value: SKIP_BRANCH, label: 'Skip these rows' },
            ]}
          />
        ))}
      </Grid>
      {needed.map((id) => {
        const o = others[id];
        if (o?.state !== 'failed') return null;
        return (
          <div key={id} style={{ marginTop: space.md }}>
            <p style={{ ...muted, color: color.warning }}>{`Could not open ${nameOf(id)}: ${o.words} Its rows wait under “Rows to check”.`}</p>
            <div style={{ marginTop: space.sm }}>
              <Button variant="ghost" wrap onClick={() => onRetry(id)}>
                {`Try to open ${nameOf(id)} again`}
              </Button>
            </div>
          </div>
        );
      })}
      {counts.size > 0 && (
        <p style={{ ...muted, marginTop: space.md }}>
          {[...counts.entries()].map(([id, c]) => `${nameOf(id)}: ${c.add} to add`).join(' · ')}
        </p>
      )}
    </Card>
  );
}

/** #41: no Branch column. The owner says which branch this sheet's members go to (one sheet per branch). */
function SheetBranchCard({
  branches,
  value,
  severalSheets,
  other,
  name,
  onPick,
  onRetry,
}: {
  branches: readonly { gymId: string; name: string }[];
  value: string;
  severalSheets: boolean;
  other: OtherBranch | null;
  name: string;
  onPick: (gymId: string) => void;
  onRetry: () => void;
}) {
  return (
    <Card style={{ marginBottom: space.lg }}>
      <SectionTitle>Branch</SectionTitle>
      <SelectField
        label="Add the members in this sheet to"
        value={value}
        onChange={onPick}
        options={branches.map((b) => ({ value: b.gymId, label: b.name }))}
      />
      {severalSheets && (
        <p style={{ ...muted, marginTop: space.sm }}>
          One sheet for each branch? Pick the branch for this sheet. When it is added, you can add the next sheet.
        </p>
      )}
      {other?.state === 'failed' && (
        <div style={{ marginTop: space.md }}>
          <p style={{ ...muted, color: color.warning }}>{`Could not open ${name}: ${other.words}`}</p>
          <div style={{ marginTop: space.sm }}>
            <Button variant="ghost" wrap onClick={onRetry}>
              {`Try to open ${name} again`}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

/**
 * #36 "never stop halfway": the rows that can't go in yet, each with its reason. The owner fixes
 * the name, mobile or joining date right here ("Check again") or skips the row; every other row
 * still goes in.
 */
function RowsToCheck({
  rows,
  skipped,
  map,
  sheetRows,
  lastFixed,
  onFix,
  onSkip,
  onUnskip,
}: {
  rows: readonly ImportRow[];
  skipped: number;
  map: ColumnMap;
  sheetRows: readonly (readonly unknown[])[];
  lastFixed: string | null;
  onFix: (row: ImportRow, fix: Record<number, string>) => void;
  onSkip: (row: ImportRow) => void;
  onUnskip: () => void;
}) {
  if (rows.length === 0 && skipped === 0 && !lastFixed) return null;
  return (
    <Card style={{ marginBottom: space.lg }}>
      <SectionTitle>Rows to check</SectionTitle>
      <p style={muted}>
        {rows.length > 0
          ? `${n(rows.length, 'row')} can’t be added yet. The reason is under each row. Fix it here and tap “Check again”, or tap “Skip this row”. All the other rows still go in.`
          : 'Every row can be added now.'}
      </p>
      {lastFixed && (
        <p role="status" aria-live="polite" style={{ ...muted, color: color.ink, fontWeight: 700, marginTop: space.sm }}>
          {lastFixed}
        </p>
      )}
      <div style={{ display: 'grid', gap: space.sm, marginTop: space.md }}>
        {rows.slice(0, CHECK_ROWS).map((r) => (
          <FixRow key={r.rowNumber} row={r} map={map} sheetRow={sheetRows[r.rowNumber - 1] ?? []} onFix={onFix} onSkip={onSkip} />
        ))}
      </div>
      {rows.length > CHECK_ROWS && (
        <p style={{ ...muted, marginTop: space.md }}>
          {`Showing the first ${CHECK_ROWS} of ${rows.length}. After the import, download the skipped rows and fix the rest in Excel.`}
        </p>
      )}
      {skipped > 0 && (
        <div style={{ marginTop: space.md }}>
          <Row gap={space.sm}>
            <p style={muted}>{`You skipped ${n(skipped, 'row')}. ${skipped === 1 ? 'It is' : 'They are'} not added.`}</p>
            <Button variant="ghost" wrap onClick={onUnskip}>
              Show skipped rows again
            </Button>
          </Row>
        </div>
      )}
    </Card>
  );
}

const FIX_FIELDS = ['fullName', 'phone', 'joinedOn'] as const;
const FIX_HINT: Record<(typeof FIX_FIELDS)[number], string> = {
  fullName: 'The member’s name',
  phone: '10 digits, like 98765 43210',
  joinedOn: 'Like 15/08/2026',
};

function FixRow({
  row,
  map,
  sheetRow,
  onFix,
  onSkip,
}: {
  row: ImportRow;
  map: ColumnMap;
  sheetRow: readonly unknown[];
  onFix: (row: ImportRow, fix: Record<number, string>) => void;
  onSkip: (row: ImportRow) => void;
}) {
  const fields = FIX_FIELDS.filter((f) => map[f] !== null);
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f, cellText(sheetRow[map[f]!])])));
  // A row whose only trouble is its branch is fixed by the branch picker above, not by typing.
  const onlyBranch = row.problems.length === 1 && (row.needsBranch || row.branchWaiting);
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
      <div style={{ fontWeight: 700 }}>{`Row ${row.rowNumber} · ${row.name || '(no name)'}`}</div>
      {row.problems.map((p) => (
        <div key={p} style={{ color: color.criticalText, marginTop: 4 }}>
          {p}
        </div>
      ))}
      {!onlyBranch && fields.length > 0 && (
        <Grid min={180}>
          {fields.map((f) => (
            <TextField
              key={f}
              label={`${fieldLabel(f)}, row ${row.rowNumber}`}
              value={vals[f] ?? ''}
              hint={FIX_HINT[f]}
              inputMode={f === 'phone' ? 'tel' : 'text'}
              onChange={(v) => setVals((prev) => ({ ...prev, [f]: v }))}
            />
          ))}
        </Grid>
      )}
      <div style={{ marginTop: space.md }}>
        <Row gap={space.sm}>
          {!onlyBranch && fields.length > 0 && (
            <Button wrap onClick={() => onFix(row, Object.fromEntries(fields.map((f) => [map[f]!, vals[f] ?? ''])))}>
              Check again
            </Button>
          )}
          <Button variant="ghost" wrap onClick={() => onSkip(row)} ariaLabel={`Skip row ${row.rowNumber}`}>
            Skip this row
          </Button>
        </Row>
      </div>
    </div>
  );
}

/**
 * The end of an import: what went in (branch by branch when there are several), what was left out
 * on purpose, and what is waiting because something failed, with "Try again" for just those rows.
 */
function DoneCard({
  result,
  multi,
  currentGymId,
  branchName,
  onDownload,
  onRetry,
  nextSheet,
  onNextSheet,
  onStartOver,
}: {
  result: Result;
  multi: boolean;
  currentGymId: string;
  branchName: (gymId: string) => string;
  onDownload: () => void;
  onRetry: () => void;
  nextSheet: string | null;
  onNextSheet: () => void;
  onStartOver: () => void;
}) {
  const added = result.branches.reduce((t, b) => t + b.added, 0);
  const updated = result.branches.reduce((t, b) => t + b.updated, 0);
  const waiting = result.skipped.filter((s) => s.waiting);
  const withTerms = result.branches.filter((b) => b.terms);
  const terms = withTerms.length
    ? withTerms.reduce(
        (t, b) => ({
          plans: t.plans + b.terms!.plans,
          memberships: t.memberships + b.terms!.memberships,
          payments: t.payments + b.terms!.payments,
          skipped: t.skipped + b.terms!.skipped,
        }),
        { plans: 0, memberships: 0, payments: 0, skipped: 0 },
      )
    : null;
  const named = (gymId: string) => branchName(gymId);
  const intoOthers = multi && result.branches.some((b) => b.gymId !== currentGymId && b.gymId !== '' && b.added > 0);
  return (
    <Card>
      <SectionTitle>Import finished</SectionTitle>
      <p style={{ margin: 0, fontFamily: font.display, fontSize: 20, fontWeight: 700, color: color.ink }}>
        {`${added} added, ${result.skipped.length} skipped`}
        {updated > 0 ? `, ${updated} filled in` : ''}
      </p>
      {multi &&
        result.branches.map((b) => (
          <p key={b.gymId} style={{ ...muted, marginTop: space.sm }}>
            {`${named(b.gymId)}: ${n(b.added, 'member')} added${b.updated > 0 ? `, ${b.updated} filled in` : ''}${b.terms && b.terms.memberships > 0 ? `, ${n(b.terms.memberships, 'plan')} with dates` : ''}.`}
          </p>
        ))}
      {terms && (terms.memberships > 0 || terms.skipped > 0) && (
        <p style={{ ...muted, marginTop: space.sm }}>
          {`${n(terms.memberships, 'plan')} with their dates · ${n(terms.payments, 'receipt')}${terms.plans > 0 ? ` · ${n(terms.plans, 'new plan name')} added to Plans` : ''}${terms.skipped > 0 ? ` · ${terms.skipped} already here, not added again` : ''}.`}
        </p>
      )}
      {result.branches
        .filter((b) => b.termsError)
        .map((b) => (
          <div key={`terms-${b.gymId}`} style={{ marginTop: space.md }}>
            <ErrorBanner>
              {multi
                ? `${named(b.gymId)}: members are saved, but not all their plans and payments. ${b.termsError} Open that branch and tap “Undo this import” on this page. Then import the same file again, so every payment comes in only once.`
                : `Members are saved, but not all their plans and payments. ${b.termsError} Tap “Undo this import” below. Then import the same file again, so every payment comes in only once.`}
            </ErrorBanner>
          </div>
        ))}
      {result.termsForStaff && (
        <p style={{ ...muted, marginTop: space.sm }}>
          Only the owner can add the plans and payments in this file. Ask the owner to import the same file. Members already added are skipped.
        </p>
      )}
      {result.branches
        .filter((b) => b.stopped && !b.openError)
        .map((b) => (
          <div key={`stopped-${b.gymId}`} style={{ marginTop: space.md }}>
            <ErrorBanner>
              {`Saving stopped halfway${multi ? ` in ${named(b.gymId)}` : ''}: ${b.stopped} `}
              {b.added > 0
                ? `${b.added} members were saved (up to row ${b.lastSavedRow}). The rest may not be saved. `
                : 'No new members were saved. '}
              When the internet is back, tap “Try again” below, or import the same file again. Members already added are skipped, so nobody is added twice.
            </ErrorBanner>
          </div>
        ))}
      {result.branches
        .filter((b) => b.openError)
        .map((b) => (
          <div key={`open-${b.gymId}`} style={{ marginTop: space.md }}>
            <ErrorBanner>{`${named(b.gymId)} could not be opened: ${b.openError} Its rows are waiting below. Tap “Try again”.`}</ErrorBanner>
          </div>
        ))}
      {intoOthers && (
        <p style={{ ...muted, marginTop: space.sm }}>
          Each branch has its own “Past imports” list on this page. To undo what went into another branch, switch to that branch and open this page there.
        </p>
      )}
      {waiting.length > 0 && (
        <div style={{ marginTop: space.lg }}>
          <SectionTitle>Rows to check</SectionTitle>
          <p style={muted}>{`${n(waiting.length, 'row')} ${waiting.length === 1 ? 'is' : 'are'} not saved yet. Tap “Try again” to send just ${waiting.length === 1 ? 'this row' : 'these rows'}.`}</p>
          <div style={{ display: 'grid', gap: space.xs, marginTop: space.sm }}>
            {waiting.slice(0, CHECK_ROWS).map((s: SkippedRow) => (
              <div key={s.row.rowNumber} style={{ ...muted, color: color.ink, overflowWrap: 'anywhere' }}>
                {`Row ${s.row.rowNumber} · ${s.row.draft?.fullName || s.row.name || '(no name)'}: ${s.reason}`}
              </div>
            ))}
          </div>
          {waiting.length > CHECK_ROWS && <p style={{ ...muted, marginTop: space.sm }}>{`And ${waiting.length - CHECK_ROWS} more.`}</p>}
          <div style={{ marginTop: space.md }}>
            <Button wrap onClick={onRetry}>
              Try again
            </Button>
          </div>
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
        {result.skipped.length > 0 && (
          <div style={{ marginTop: space.lg }}>
            <Button variant="ghost" wrap onClick={onDownload}>
              {`Download ${n(result.skipped.length, 'skipped row')}`}
            </Button>
          </div>
        )}
        {nextSheet !== null && (
          <div style={{ marginTop: space.lg }}>
            <Button variant="ghost" wrap onClick={onNextSheet}>
              {`Import the next sheet: “${nextSheet.slice(0, 30)}”`}
            </Button>
          </div>
        )}
        <div style={{ marginTop: space.lg }}>
          <Button variant="ghost" wrap onClick={onStartOver}>
            Import another file
          </Button>
        </div>
      </Row>
    </Card>
  );
}

/** "Row 25" / "Rows 25, 26 and 3 more". PURE. */
function rowsWord(nums: readonly number[]): string {
  if (nums.length === 1) return `Row ${nums[0]}`;
  const more = nums.length > 8 ? ` and ${nums.length - 8} more` : '';
  return `Rows ${nums.slice(0, 8).join(', ')}${more}`;
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
