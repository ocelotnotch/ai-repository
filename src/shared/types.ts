export type ColumnCandidateType = 'numeric' | 'period' | 'category' | 'text';

export interface ColumnProfile {
  name: string;
  candidateType: ColumnCandidateType;
  missingCount: number;
  validCount: number;
  uniqueCount: number;
  sampleValues: string[]; // Safe samples for category/period/numeric; omitted or masked for free text when sending to Gemini
}

export interface DatasetProfile {
  datasetVersion: number;
  fileName: string;
  uploadedAt: string;
  safeDataConfirmed: boolean;
  snapshotHash: string;
  rowCount: number;
  columnCount: number;
  duplicateRowCount: number;
  columns: ColumnProfile[];
  previewRows: Array<Record<string, string>>;
  suggestedConfig: DashboardConfig;
  issues: string[];
}

export interface ActiveFilter {
  categoryColumn: string;
  categoryValues: string[];
  periodColumn: string;
  periodValues: string[];
}

export interface DashboardConfig {
  categoryColumn: string;
  periodColumn: string;
  metricColumn: string;
  aggregation: 'sum' | 'mean' | 'median' | 'min' | 'max' | 'count';
  targetColumn: string;
  realisasiColumn: string;
  kpiConfirmed: boolean;
}

export interface KpiCardItem {
  key: string;
  label: string;
  value: number | null;
  formattedValue: string;
  unit: string;
  validCount: number;
  note?: string;
  resultId: string;
}

export interface ChartDatum {
  label: string;
  value: number;
  secondaryValue?: number;
  extra?: Record<string, string | number | null>;
}

export interface ChartSpec {
  chartId: string;
  resultId: string;
  datasetVersion: number;
  filterKey: string;
  chartType: 'bar' | 'line';
  title: string;
  xLabel: string;
  yLabel: string;
  unit: string;
  metricKey: string;
  data: ChartDatum[];
}

export interface ThemeDistributionItem {
  theme: string;
  count: number;
  percentage: number;
  quotes: Array<{
    rowId: string;
    quote: string;
  }>;
}

export interface QualitativeThemeResult {
  resultId: string;
  subsetResultId: string;
  column: string;
  denominator: number;
  totalInFilter: number;
  emptyCount: number;
  analyzedCount: number;
  excludedCount: number;
  truncatedCount: number;
  themes: ThemeDistributionItem[];
  mappingTable: Array<{
    rowId: string;
    theme: string;
    quote: string;
  }>;
  humanReviewLabel: string;
  limitations: string[];
}

export interface DashboardDataResponse {
  datasetVersion: number;
  fileName: string;
  snapshotHash: string;
  totalRows: number;
  filteredRows: number;
  duplicateRowCount: number;
  filter: ActiveFilter;
  filterOptions: {
    categories: Array<{ column: string; values: string[] }>;
    periods: Array<{ column: string; values: string[] }>;
    numericColumns: string[];
    allColumns: string[];
    textColumns: string[];
  };
  config: DashboardConfig;
  kpis: KpiCardItem[];
  categoryChart: ChartSpec | null;
  periodChart: ChartSpec | null;
  themeDistribution: QualitativeThemeResult | null;
  themeChart: ChartSpec | null;
  isEmptySubset: boolean;
}

export type TraceStage = 'Goal' | 'Decide' | 'Act' | 'Observe' | 'Evaluate';

export interface ExecutionTraceStep {
  stepNumber: number;
  cycle: number;
  stage: TraceStage;
  timestamp: string;
  summary: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResponseSummary?: Record<string, unknown>;
}

export interface VerifiedMetricEntry {
  resultId: string;
  metricKey: string;
  label: string;
  value: number | string | null;
  formattedValue: string;
  unit?: string;
}

export interface AgentFinding {
  text: string;
  resultId: string;
  metricKey: string;
  verifiedValue?: string;
  isInterpretation?: boolean;
}

export interface AgentRecommendation {
  action: string;
  rationale: string;
  resultId: string;
  metricKey: string;
  verifiedEvidence?: string;
}

export interface ValidationReport {
  validationId: string;
  passed: boolean;
  resultId: string;
  checks: Array<{
    name: string;
    passed: boolean;
    detail: string;
  }>;
  reasons: string[];
}

export type AgentStatus = 'success' | 'partial' | 'needs_clarification' | 'failed';

export interface AgentAnalysisResponse {
  requestId: string;
  status: AgentStatus;
  datasetVersion: number;
  fileName: string;
  filter: ActiveFilter;
  filterSummary: string;
  question: string;
  snapshotBefore: string;
  snapshotAfter: string;
  datasetIntegrityVerified: boolean;
  modelUsed: string;
  elapsedMs: number;
  cyclesUsed: number;
  toolCallsUsed: number;
  inferenceCallsUsed: number;
  validationStatus: 'passed' | 'failed' | 'not_run';
  validations: ValidationReport[];
  clarificationQuestion?: string;
  requiresTextColumnConfirmation?: string[];
  errorMessage?: string;
  objective: string;
  method: string;
  executiveSummary: string;
  resultRefs: string[];
  verifiedMetrics: VerifiedMetricEntry[];
  findings: AgentFinding[];
  recommendations: AgentRecommendation[];
  limitations: string[];
  agentDecision: string;
  humanReviewNotice: string;
  charts: ChartSpec[];
  thematicResult: QualitativeThemeResult | null;
  executionTrace: ExecutionTraceStep[];
}
