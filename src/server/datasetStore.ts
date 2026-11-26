import crypto from 'node:crypto';
import Papa from 'papaparse';
import type {
  ActiveFilter,
  ChartSpec,
  ColumnCandidateType,
  ColumnProfile,
  DashboardConfig,
  DatasetProfile,
  QualitativeThemeResult,
  ValidationReport,
} from '../shared/types.ts';

export const MAX_CSV_BYTES = 1 * 1024 * 1024; // 1 MB
export const MAX_CSV_ROWS = 1000;
export const MAX_CSV_COLS = 20;

export interface InternalRow {
  readonly __rowId: string;
  readonly values: Readonly<Record<string, string>>;
}

export interface StoredQuantitativeResult {
  kind: 'quantitative';
  resultId: string;
  datasetVersion: number;
  filterKey: string;
  operation: string;
  params: Record<string, unknown>;
  totalFilteredRows: number;
  validCount: number;
  missingCount: number;
  duplicatesIncluded: number;
  metrics: Record<string, { label: string; value: number | string | null; formatted: string; unit: string }>;
  table?: Array<Record<string, string | number | null>>;
  limitations: string[];
  createdAt: string;
}

export interface StoredTextSubsetResult {
  kind: 'text_subset';
  resultId: string;
  datasetVersion: number;
  filterKey: string;
  column: string;
  totalInFilter: number;
  emptyCount: number;
  analyzedCount: number;
  excludedCount: number;
  truncatedCount: number;
  items: Array<{ rowId: string; text: string; truncated: boolean }>;
  sourceById: Record<string, string>;
  createdAt: string;
}

export interface StoredThemeResult {
  kind: 'themes';
  resultId: string;
  datasetVersion: number;
  filterKey: string;
  data: QualitativeThemeResult;
  metrics: Record<string, { label: string; value: number | string | null; formatted: string; unit: string }>;
  createdAt: string;
}

export type StoredToolResult = StoredQuantitativeResult | StoredTextSubsetResult | StoredThemeResult;

export interface ActiveDatasetState {
  datasetVersion: number;
  fileName: string;
  uploadedAt: string;
  safeDataConfirmed: boolean;
  snapshotHash: string;
  headers: readonly string[];
  rows: readonly InternalRow[];
  profile: DatasetProfile;
  filter: ActiveFilter;
  dashboardConfig: DashboardConfig;
  approvedTextColumns: Set<string>;
}

const MONTH_MAP: Record<string, number> = {
  jan: 1, januari: 1, january: 1,
  feb: 2, februari: 2, february: 2,
  mar: 3, maret: 3, march: 3,
  apr: 4, april: 4,
  mei: 5, may: 5,
  jun: 6, juni: 6, june: 6,
  jul: 7, juli: 7, july: 7,
  agu: 8, ags: 8, agustus: 8, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oktober: 10, oct: 10, october: 10,
  nov: 11, november: 11,
  des: 12, desember: 12, dec: 12, december: 12,
};

export function parsePeriodSortKey(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;

  // YYYY-MM-DD or YYYY/MM/DD
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) {
    return Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]);
  }
  // YYYY-MM or YYYY/MM
  m = s.match(/^(\d{4})[-/](\d{1,2})$/);
  if (m) {
    return Number(m[1]) * 10000 + Number(m[2]) * 100;
  }
  // YYYY-Q1 .. YYYY-Q4
  m = s.match(/^(\d{4})[-/\s]?Q([1-4])$/i);
  if (m) {
    return Number(m[1]) * 10000 + Number(m[2]) * 300;
  }
  // Q1 2026
  m = s.match(/^Q([1-4])[-/\s]?(\d{4})$/i);
  if (m) {
    return Number(m[2]) * 10000 + Number(m[1]) * 300;
  }
  // Month YYYY (e.g., Jan 2026, Februari 2026)
  m = s.match(/^([a-zA-Z]+)[-/\s]+(\d{4})$/);
  if (m) {
    const mon = MONTH_MAP[m[1].toLowerCase()];
    if (mon) return Number(m[2]) * 10000 + mon * 100;
  }
  // YYYY Month
  m = s.match(/^(\d{4})[-/\s]+([a-zA-Z]+)$/);
  if (m) {
    const mon = MONTH_MAP[m[2].toLowerCase()];
    if (mon) return Number(m[1]) * 10000 + mon * 100;
  }
  // DD/MM/YYYY or DD-MM-YYYY
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) {
    return Number(m[3]) * 10000 + Number(m[2]) * 100 + Number(m[1]);
  }
  // Bare year YYYY
  m = s.match(/^((?:19|20)\d{2})$/);
  if (m) {
    return Number(m[1]) * 10000;
  }
  return null;
}

export function sortPeriodsTemporally(values: string[]): string[] {
  return [...values].sort((a, b) => {
    const ka = parsePeriodSortKey(a);
    const kb = parsePeriodSortKey(b);
    if (ka !== null && kb !== null) return ka - kb;
    if (ka !== null) return -1;
    if (kb !== null) return 1;
    return a.localeCompare(b, 'id');
  });
}

export function parseNumericValue(raw: string | undefined | null): number | null {
  if (raw === undefined || raw === null) return null;
  const trimmed = String(raw).trim();
  if (trimmed === '') return null;
  const normalized = trimmed.replace(/\s+/g, '');
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return n;
}

function isMissingCell(raw: string | undefined | null): boolean {
  return raw === undefined || raw === null || String(raw).trim() === '';
}

function inferColumnType(header: string, nonEmptyValues: string[]): ColumnCandidateType {
  if (nonEmptyValues.length === 0) return 'category';

  const headerLower = header.toLowerCase();

  // Check period first (e.g. 2026-01 or bare year if header suggests time)
  const periodMatches = nonEmptyValues.filter((v) => parsePeriodSortKey(v) !== null).length;
  const looksLikePeriodHeader = /(periode|bulan|tanggal|tgl|tahun|waktu|date|month|year|quarter|triwulan)/i.test(headerLower);
  const nonBareYearPeriodMatches = nonEmptyValues.filter((v) => !/^\d{4}$/.test(v.trim()) && parsePeriodSortKey(v) !== null).length;
  if (
    nonBareYearPeriodMatches / nonEmptyValues.length >= 0.85 ||
    (looksLikePeriodHeader && periodMatches / nonEmptyValues.length >= 0.85)
  ) {
    return 'period';
  }

  // Check numeric
  const numericMatches = nonEmptyValues.filter((v) => parseNumericValue(v) !== null).length;
  if (numericMatches / nonEmptyValues.length >= 0.9) {
    return 'numeric';
  }

  // Distinguish free text vs category
  const avgLength = nonEmptyValues.reduce((sum, v) => sum + v.length, 0) / nonEmptyValues.length;
  const avgWords = nonEmptyValues.reduce((sum, v) => sum + v.trim().split(/\s+/).length, 0) / nonEmptyValues.length;
  const uniqueRatio = new Set(nonEmptyValues).size / nonEmptyValues.length;
  const looksLikeTextHeader = /(masukan|komentar|ulasan|keluhan|saran|feedback|catatan|keterangan|narasi|respon|pendapat|aspirasi)/i.test(headerLower);
  const looksLikeIdHeader = /(^id$|_id$|^id_|kode|nomor)/i.test(headerLower);

  if (looksLikeIdHeader && avgWords <= 1.5) {
    return 'category';
  }
  if (looksLikeTextHeader || avgLength >= 28 || (avgWords >= 3.2 && uniqueRatio >= 0.35)) {
    return 'text';
  }
  return 'category';
}

export function buildFilterKey(filter: ActiveFilter): string {
  const catCols = filter.categoryColumn || '';
  const catVals = [...(filter.categoryValues || [])].sort().join('|');
  const perCols = filter.periodColumn || '';
  const perVals = [...(filter.periodValues || [])].sort().join('|');
  return `${catCols}=[${catVals}];${perCols}=[${perVals}]`;
}

export function formatFilterSummary(filter: ActiveFilter): string {
  const parts: string[] = [];
  if (filter.categoryColumn && filter.categoryValues.length > 0) {
    parts.push(`${filter.categoryColumn}: ${filter.categoryValues.join(', ')}`);
  }
  if (filter.periodColumn && filter.periodValues.length > 0) {
    parts.push(`${filter.periodColumn}: ${filter.periodValues.join(', ')}`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'Semua data (tanpa filter)';
}

function computeDatasetHash(headers: readonly string[], rows: readonly InternalRow[]): string {
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify(headers));
  for (const row of rows) {
    hash.update('\n');
    hash.update(row.__rowId);
    hash.update(':');
    for (const h of headers) {
      hash.update(row.values[h] ?? '');
      hash.update('\u001f');
    }
  }
  return hash.digest('hex');
}

function suggestDashboardConfig(columns: ColumnProfile[]): DashboardConfig {
  const categoryCols = columns.filter(
    (c) => c.candidateType === 'category' && !/(^id$|_id$|^id_|observasi)/i.test(c.name)
  );
  const fallbackCategory = columns.find((c) => c.candidateType === 'category');
  const periodCol = columns.find((c) => c.candidateType === 'period');
  const numericCols = columns.filter((c) => c.candidateType === 'numeric');

  const unitCol =
    categoryCols.find((c) => /(unit|instansi|bidang|layanan|opd|wilayah|bagian)/i.test(c.name)) ||
    categoryCols[0] ||
    fallbackCategory;

  const targetCol = numericCols.find((c) => /target/i.test(c.name));
  const realisasiCol = numericCols.find((c) => /(realisasi|capaian_aktual|aktual|hasil)/i.test(c.name));
  const primaryMetric = realisasiCol || numericCols[0];

  return {
    categoryColumn: unitCol?.name ?? '',
    periodColumn: periodCol?.name ?? '',
    metricColumn: primaryMetric?.name ?? '',
    aggregation: 'sum',
    targetColumn: targetCol?.name ?? '',
    realisasiColumn: realisasiCol?.name ?? '',
    kpiConfirmed: Boolean(targetCol && realisasiCol),
  };
}

class InMemoryDatasetStore {
  private state: ActiveDatasetState | null = null;
  private versionCounter = 0;
  private resultCounter = 0;
  private chartCounter = 0;
  private validationCounter = 0;

  private results = new Map<string, StoredToolResult>();
  private charts = new Map<string, ChartSpec>();
  private validations = new Map<string, ValidationReport>();
  private validatedResultIds = new Set<string>();
  private latestValidatedThemeByContext = new Map<string, { result: QualitativeThemeResult; chart: ChartSpec | null }>();

  getActive(): ActiveDatasetState | null {
    return this.state;
  }

  computeCurrentSnapshotHash(): string | null {
    if (!this.state) return null;
    return computeDatasetHash(this.state.headers, this.state.rows);
  }

  uploadCsvBuffer(fileName: string, buffer: Buffer, safeDataConfirmed: boolean): DatasetProfile {
    if (!safeDataConfirmed) {
      throw new Error('Konfirmasi keamanan data wajib dicentang (pastikan data sintetis/anonim dan bebas informasi sensitif).');
    }

    const cleanName = fileName.trim();
    if (!cleanName || !cleanName.toLowerCase().endsWith('.csv')) {
      throw new Error('Format file tidak didukung. Unggah satu file berformat .csv (UTF-8).');
    }

    if (buffer.byteLength === 0) {
      throw new Error('File CSV kosong. Unggah file yang memiliki header dan minimal satu baris data.');
    }

    if (buffer.byteLength > MAX_CSV_BYTES) {
      throw new Error(`Ukuran file melebihi batas maksimum 1 MB (${(buffer.byteLength / (1024 * 1024)).toFixed(2)} MB).`);
    }

    let text: string;
    try {
      const decoder = new TextDecoder('utf-8', { fatal: true });
      text = decoder.decode(buffer);
    } catch {
      throw new Error('File tidak valid sebagai teks UTF-8 atau file rusak.');
    }

    // Strip UTF-8 BOM if present
    if (text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1);
    }

    if (text.trim().length === 0) {
      throw new Error('Isi file CSV kosong.');
    }

    const parsed = Papa.parse<string[]>(text, {
      header: false,
      skipEmptyLines: 'greedy',
      dynamicTyping: false,
    });

    if (parsed.errors.length > 0) {
      const fatalErrors = parsed.errors.filter((e) => e.type === 'Quotes' || e.type === 'FieldMismatch');
      if (fatalErrors.length > 0) {
        const first = fatalErrors[0];
        throw new Error(`Struktur CSV tidak valid pada baris ${(first.row ?? 0) + 1}: ${first.message}`);
      }
    }

    const matrix = parsed.data;
    if (!matrix || matrix.length < 2) {
      throw new Error('File CSV harus memiliki baris header dan minimal 1 baris data.');
    }

    const rawHeaders = matrix[0].map((h) => String(h ?? '').trim());
    if (rawHeaders.length === 0) {
      throw new Error('Header CSV tidak ditemukan.');
    }
    if (rawHeaders.length > MAX_CSV_COLS) {
      throw new Error(`Jumlah kolom (${rawHeaders.length}) melebihi batas maksimum ${MAX_CSV_COLS} kolom.`);
    }
    if (rawHeaders.some((h) => h === '')) {
      throw new Error('Ditemukan nama kolom (header) kosong. Semua kolom harus memiliki nama header yang jelas.');
    }

    const headerSeen = new Set<string>();
    const duplicatesHeader: string[] = [];
    for (const h of rawHeaders) {
      const key = h.toLowerCase();
      if (headerSeen.has(key)) duplicatesHeader.push(h);
      headerSeen.add(key);
    }
    if (duplicatesHeader.length > 0) {
      throw new Error(`Header CSV harus unik. Ditemukan header duplikat: ${duplicatesHeader.join(', ')}.`);
    }

    const dataRowsMatrix = matrix.slice(1);
    if (dataRowsMatrix.length === 0) {
      throw new Error('CSV tidak memiliki baris data setelah header.');
    }
    if (dataRowsMatrix.length > MAX_CSV_ROWS) {
      throw new Error(`Jumlah baris (${dataRowsMatrix.length}) melebihi batas maksimum ${MAX_CSV_ROWS} baris.`);
    }

    // Strict structural check: every row must match header column count
    for (let i = 0; i < dataRowsMatrix.length; i++) {
      if (dataRowsMatrix[i].length !== rawHeaders.length) {
        throw new Error(
          `Struktur kolom tidak konsisten pada baris data ke-${i + 1} (ditemukan ${dataRowsMatrix[i].length} kolom, seharusnya ${rawHeaders.length} kolom). Dataset aktif sebelumnya tetap dipertahankan.`
        );
      }
    }

    const frozenHeaders = Object.freeze([...rawHeaders]);
    const internalRows: InternalRow[] = dataRowsMatrix.map((cells, idx) => {
      const obj: Record<string, string> = {};
      for (let c = 0; c < frozenHeaders.length; c++) {
        obj[frozenHeaders[c]] = String(cells[c] ?? '').trim();
      }
      return Object.freeze({
        __rowId: `ROW-${String(idx + 1).padStart(4, '0')}`,
        values: Object.freeze(obj),
      });
    });
    const frozenRows = Object.freeze(internalRows);

    // Count exact duplicate rows after first occurrence
    const seenRowSignatures = new Set<string>();
    let duplicateRowCount = 0;
    for (const row of frozenRows) {
      const sig = frozenHeaders.map((h) => row.values[h]).join('\u001f');
      if (seenRowSignatures.has(sig)) {
        duplicateRowCount++;
      } else {
        seenRowSignatures.add(sig);
      }
    }

    // Build column profiles
    const columnProfiles: ColumnProfile[] = frozenHeaders.map((header) => {
      let missingCount = 0;
      const nonEmpty: string[] = [];
      for (const row of frozenRows) {
        const val = row.values[header];
        if (isMissingCell(val)) {
          missingCount++;
        } else {
          nonEmpty.push(val);
        }
      }
      const candidateType = inferColumnType(header, nonEmpty);
      const uniqueValues = Array.from(new Set(nonEmpty));
      const sortedSamples =
        candidateType === 'period'
          ? sortPeriodsTemporally(uniqueValues).slice(0, 6)
          : uniqueValues.slice(0, 5);

      return {
        name: header,
        candidateType,
        missingCount,
        validCount: nonEmpty.length,
        uniqueCount: uniqueValues.length,
        sampleValues: candidateType === 'text' ? [] : sortedSamples,
      };
    });

    const issues: string[] = [];
    const colsWithMissing = columnProfiles.filter((c) => c.missingCount > 0);
    if (colsWithMissing.length > 0) {
      issues.push(
        `Terdapat missing values pada ${colsWithMissing.length} kolom (${colsWithMissing
          .map((c) => `${c.name}: ${c.missingCount}`)
          .join(', ')}). Data asli tidak diubah/diimputasi.`
      );
    }
    if (duplicateRowCount > 0) {
      issues.push(
        `Terdeteksi ${duplicateRowCount} baris duplikat identik setelah kemunculan pertama. Baris duplikat tetap dipertahankan (read-only) dan dilaporkan dalam analisis.`
      );
    }

    const nextVersion = ++this.versionCounter;
    const uploadedAt = new Date().toISOString();
    const snapshotHash = computeDatasetHash(frozenHeaders, frozenRows);
    const suggestedConfig = suggestDashboardConfig(columnProfiles);

    const profile: DatasetProfile = {
      datasetVersion: nextVersion,
      fileName: cleanName,
      uploadedAt,
      safeDataConfirmed,
      snapshotHash,
      rowCount: frozenRows.length,
      columnCount: frozenHeaders.length,
      duplicateRowCount,
      columns: columnProfiles,
      previewRows: frozenRows.slice(0, 20).map((r) => ({ ...r.values })),
      suggestedConfig,
      issues,
    };

    // Commit new state atomically and clear old temporary results
    this.clearTemporaryStores();
    this.state = {
      datasetVersion: nextVersion,
      fileName: cleanName,
      uploadedAt,
      safeDataConfirmed,
      snapshotHash,
      headers: frozenHeaders,
      rows: frozenRows,
      profile,
      filter: {
        categoryColumn: suggestedConfig.categoryColumn,
        categoryValues: [],
        periodColumn: suggestedConfig.periodColumn,
        periodValues: [],
      },
      dashboardConfig: suggestedConfig,
      approvedTextColumns: new Set<string>(),
    };

    return profile;
  }

  resetWorkspace(): void {
    this.state = null;
    this.clearTemporaryStores();
  }

  private clearTemporaryStores(): void {
    this.results.clear();
    this.charts.clear();
    this.validations.clear();
    this.validatedResultIds.clear();
    this.latestValidatedThemeByContext.clear();
    this.resultCounter = 0;
    this.chartCounter = 0;
    this.validationCounter = 0;
  }

  updateFilter(filter: Partial<ActiveFilter>): ActiveFilter {
    if (!this.state) throw new Error('Belum ada dataset aktif.');
    const headersSet = new Set(this.state.headers);

    const nextCategoryCol =
      filter.categoryColumn !== undefined
        ? filter.categoryColumn === '' || headersSet.has(filter.categoryColumn)
          ? filter.categoryColumn
          : this.state.filter.categoryColumn
        : this.state.filter.categoryColumn;

    const nextPeriodCol =
      filter.periodColumn !== undefined
        ? filter.periodColumn === '' || headersSet.has(filter.periodColumn)
          ? filter.periodColumn
          : this.state.filter.periodColumn
        : this.state.filter.periodColumn;

    const nextFilter: ActiveFilter = {
      categoryColumn: nextCategoryCol,
      categoryValues: Array.isArray(filter.categoryValues)
        ? filter.categoryValues.map(String)
        : this.state.filter.categoryValues,
      periodColumn: nextPeriodCol,
      periodValues: Array.isArray(filter.periodValues)
        ? filter.periodValues.map(String)
        : this.state.filter.periodValues,
    };

    this.state.filter = nextFilter;
    return nextFilter;
  }

  resetFilter(): ActiveFilter {
    if (!this.state) throw new Error('Belum ada dataset aktif.');
    this.state.filter = {
      categoryColumn: this.state.dashboardConfig.categoryColumn,
      categoryValues: [],
      periodColumn: this.state.dashboardConfig.periodColumn,
      periodValues: [],
    };
    return this.state.filter;
  }

  updateDashboardConfig(partial: Partial<DashboardConfig>): DashboardConfig {
    if (!this.state) throw new Error('Belum ada dataset aktif.');
    const headersSet = new Set(this.state.headers);
    const validCol = (c: string | undefined, fallback: string) =>
      c === undefined ? fallback : c === '' || headersSet.has(c) ? c : fallback;

    const allowedAgg = new Set(['sum', 'mean', 'median', 'min', 'max', 'count']);
    const nextConfig: DashboardConfig = {
      categoryColumn: validCol(partial.categoryColumn, this.state.dashboardConfig.categoryColumn),
      periodColumn: validCol(partial.periodColumn, this.state.dashboardConfig.periodColumn),
      metricColumn: validCol(partial.metricColumn, this.state.dashboardConfig.metricColumn),
      aggregation:
        partial.aggregation && allowedAgg.has(partial.aggregation)
          ? partial.aggregation
          : this.state.dashboardConfig.aggregation,
      targetColumn: validCol(partial.targetColumn, this.state.dashboardConfig.targetColumn),
      realisasiColumn: validCol(partial.realisasiColumn, this.state.dashboardConfig.realisasiColumn),
      kpiConfirmed:
        typeof partial.kpiConfirmed === 'boolean'
          ? partial.kpiConfirmed
          : this.state.dashboardConfig.kpiConfirmed,
    };

    this.state.dashboardConfig = nextConfig;
    return nextConfig;
  }

  setApprovedTextColumns(columns: string[]): string[] {
    if (!this.state) throw new Error('Belum ada dataset aktif.');
    const headersSet = new Set(this.state.headers);
    const valid = columns.filter((c) => headersSet.has(c));
    this.state.approvedTextColumns = new Set(valid);
    return Array.from(this.state.approvedTextColumns);
  }

  getFilteredRows(overrideFilter?: ActiveFilter): readonly InternalRow[] {
    if (!this.state) return [];
    const f = overrideFilter ?? this.state.filter;
    return this.state.rows.filter((row) => {
      if (f.categoryColumn && f.categoryValues.length > 0) {
        if (!f.categoryValues.includes(row.values[f.categoryColumn] ?? '')) {
          return false;
        }
      }
      if (f.periodColumn && f.periodValues.length > 0) {
        if (!f.periodValues.includes(row.values[f.periodColumn] ?? '')) {
          return false;
        }
      }
      return true;
    });
  }

  countDuplicatesInRows(rows: readonly InternalRow[]): number {
    if (!this.state) return 0;
    const seen = new Set<string>();
    let dups = 0;
    for (const r of rows) {
      const sig = this.state.headers.map((h) => r.values[h] ?? '').join('\u001f');
      if (seen.has(sig)) dups++;
      else seen.add(sig);
    }
    return dups;
  }

  nextResultId(): string {
    return `RES-${String(++this.resultCounter).padStart(3, '0')}`;
  }

  nextChartId(): string {
    return `CHT-${String(++this.chartCounter).padStart(3, '0')}`;
  }

  nextValidationId(): string {
    return `VAL-${String(++this.validationCounter).padStart(3, '0')}`;
  }

  saveResult(res: StoredToolResult): void {
    this.results.set(res.resultId, res);
  }

  getResult(resultId: string): StoredToolResult | undefined {
    return this.results.get(resultId);
  }

  saveChart(chart: ChartSpec): void {
    this.charts.set(chart.chartId, chart);
  }

  getChart(chartId: string): ChartSpec | undefined {
    return this.charts.get(chartId);
  }

  saveValidation(report: ValidationReport): void {
    this.validations.set(report.validationId, report);
    if (report.passed) {
      this.validatedResultIds.add(report.resultId);
      const res = this.results.get(report.resultId);
      if (res && res.kind === 'themes') {
        const key = `${res.datasetVersion}::${res.filterKey}`;
        const matchingChart = Array.from(this.charts.values()).find(
          (c) => c.resultId === res.resultId && c.datasetVersion === res.datasetVersion && c.filterKey === res.filterKey
        );
        this.latestValidatedThemeByContext.set(key, {
          result: res.data,
          chart: matchingChart ?? null,
        });
      }
    }
  }

  isResultValidated(resultId: string): boolean {
    return this.validatedResultIds.has(resultId);
  }

  getLatestValidatedThemeForActiveContext(): { result: QualitativeThemeResult; chart: ChartSpec | null } | null {
    if (!this.state) return null;
    const key = `${this.state.datasetVersion}::${buildFilterKey(this.state.filter)}`;
    return this.latestValidatedThemeByContext.get(key) ?? null;
  }
}

export const datasetStore = new InMemoryDatasetStore();
