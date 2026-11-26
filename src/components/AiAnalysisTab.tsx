import React, { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import type {
  AgentAnalysisResponse,
  DashboardDataResponse,
  DatasetProfile,
} from '../shared/types';
import { ChartRenderer } from './ChartRenderer';

interface AiAnalysisTabProps {
  profile: DatasetProfile | null;
  dashboard: DashboardDataResponse | null;
  approvedTextColumns: string[];
  analysis: AgentAnalysisResponse | null;
  analysisInvalidatedReason: string | null;
  analyzing: boolean;
  onApproveTextColumns: (cols: string[]) => Promise<void>;
  onRunAnalysis: (question: string) => Promise<void>;
  onGoToTab: (tab: 'data' | 'decision') => void;
}

const EXAMPLE_QUESTIONS = [
  {
    label: 'Capaian terendah',
    text: 'Unit mana dengan capaian terendah?',
  },
  {
    label: 'Pertumbuhan Feb vs Jan',
    text: 'Berapa pertumbuhan realisasi Februari dibanding Januari?',
  },
  {
    label: 'Tema masukan',
    text: 'Apa tema utama masukan pelayanan?',
  },
  {
    label: 'Tindak lanjut gap terbesar',
    text: 'Apa tindak lanjut unit dengan gap terbesar? Putuskan dan jalankan kebijakannya.',
  },
];

const STATUS_META: Record<
  AgentAnalysisResponse['status'],
  { label: string; colorClass: string; icon: React.ReactNode }
> = {
  success: {
    label: 'Berhasil & Tervalidasi',
    colorClass: 'text-emerald-950 bg-emerald-50/90 border-emerald-200',
    icon: <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />,
  },
  partial: {
    label: 'Hasil Parsial (Tervalidasi Sebagian)',
    colorClass: 'text-amber-950 bg-amber-50/90 border-amber-200',
    icon: <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />,
  },
  needs_clarification: {
    label: 'Memerlukan Klarifikasi / Konfirmasi',
    colorClass: 'text-blue-950 bg-blue-50/90 border-blue-200',
    icon: <HelpCircle className="w-4 h-4 text-blue-700 shrink-0" />,
  },
  failed: {
    label: 'Analisis Gagal / Dihentikan',
    colorClass: 'text-red-950 bg-red-50/90 border-red-200',
    icon: <AlertCircle className="w-4 h-4 text-red-700 shrink-0" />,
  },
};

export function AiAnalysisTab({
  profile,
  dashboard,
  approvedTextColumns,
  analysis,
  analysisInvalidatedReason,
  analyzing,
  onApproveTextColumns,
  onRunAnalysis,
  onGoToTab,
}: AiAnalysisTabProps) {
  const [question, setQuestion] = useState('');
  const [showAllMappings, setShowAllMappings] = useState(false);

  if (!profile || !dashboard) {
    return (
      <section className="bg-white border border-slate-200/90 rounded-xl p-10 sm:p-14 text-center">
        <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3.5">
          <HelpCircle className="w-6 h-6 text-slate-400" />
        </div>
        <h2 className="text-base font-semibold text-slate-900">Belum Ada Dataset Aktif</h2>
        <p className="text-sm text-slate-600 mt-1.5 max-w-md mx-auto leading-relaxed">
          Unggah dataset CSV, muat data simulasi, atau impor dari Google Sheets di tab Data
          Workspace sebelum mengajukan pertanyaan kepada AI Agent.
        </p>
        <button
          type="button"
          onClick={() => onGoToTab('data')}
          className="mt-5 min-h-[40px] px-5 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 cursor-pointer"
        >
          Ke Data Workspace
        </button>
      </section>
    );
  }

  const textColumns = profile.columns.filter((c) => c.candidateType === 'text');

  const handleToggleTextColumn = (colName: string) => {
    const next = new Set(approvedTextColumns);
    if (next.has(colName)) next.delete(colName);
    else next.add(colName);
    void onApproveTextColumns(Array.from(next));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (analyzing || !question.trim() || dashboard.isEmptySubset) return;
    await onRunAnalysis(question.trim());
  };

  const handleRetry = async () => {
    const q = question.trim() || analysis?.question || '';
    if (!q || analyzing || dashboard.isEmptySubset) return;
    setQuestion(q);
    await onRunAnalysis(q);
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Analisis AI Agent</h1>
        <p className="text-sm text-slate-600 mt-1 max-w-3xl">
          Ajukan pertanyaan bahasa natural mengenai dataset aktif. Agent Gemini menjalankan siklus
          Goal → Decide → Act → Observe → Evaluate melalui 4 analytical tools terdaftar dan
          validasi programatik.
        </p>
      </div>

      {/* Prompt Composer & Safe Text Column Approval */}
      <section className="bg-white border border-slate-200/90 rounded-xl p-5 sm:p-6 space-y-5">
        {textColumns.length > 0 && (
          <div className="pb-5 border-b border-slate-100 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
              <ShieldCheck className="w-4 h-4 text-blue-700 shrink-0" />
              <span>Konfirmasi Kolom Teks Aman untuk Analisis Kualitatif</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed max-w-3xl">
              Kolom teks bebas tidak dikirim ke Gemini sebelum disetujui. Maksimal 50 respons
              non-kosong pertama (maks. 500 karakter/respons) dengan ID buatan sistem akan dikirim
              saat analisis tematik diminta.
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
              {textColumns.map((col) => {
                const checked = approvedTextColumns.includes(col.name);
                return (
                  <label
                    key={col.name}
                    className="inline-flex items-center gap-2.5 text-sm text-slate-800 cursor-pointer min-h-[32px]"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={analyzing}
                      onChange={() => handleToggleTextColumn(col.name)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                    />
                    <span className="font-mono text-xs font-semibold text-slate-900">
                      {col.name}
                    </span>
                    <span className="text-xs text-slate-500">({col.validCount} teks valid)</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="ai-question" className="block text-sm font-semibold text-slate-900">
              Pertanyaan Analisis
            </label>
            <textarea
              id="ai-question"
              rows={3}
              value={question}
              disabled={analyzing || dashboard.isEmptySubset}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Contoh: Unit mana dengan capaian terendah? atau Apa tema utama masukan pelayanan?"
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none disabled:bg-slate-100 leading-relaxed"
            />
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
              <span className="text-slate-500 font-medium">Contoh pertanyaan:</span>
              {EXAMPLE_QUESTIONS.map((ex, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={analyzing}
                  onClick={() => setQuestion(ex.text)}
                  className="text-blue-700 hover:text-blue-900 underline underline-offset-4 decoration-blue-200 hover:decoration-blue-700 text-left cursor-pointer disabled:opacity-50"
                >
                  {ex.label}
                </button>
              ))}
            </div>

            <button
              type="submit"
              disabled={analyzing || !question.trim() || dashboard.isEmptySubset}
              className="inline-flex items-center justify-center gap-2 min-h-[42px] px-6 py-2.5 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-45 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {analyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Menjalankan AI Agent...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Analisis
                </>
              )}
            </button>
          </div>
        </form>

        {dashboard.isEmptySubset && (
          <div className="p-3.5 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              Subset filter aktif kosong (0 baris). Ubah atau reset filter di tab Dashboard sebelum
              menjalankan analisis AI.
            </span>
          </div>
        )}

        {analysisInvalidatedReason && !analyzing && (
          <div className="p-3.5 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg">
            Hasil analisis sebelumnya diinvalidasi ({analysisInvalidatedReason}). Ajukan permintaan
            baru untuk konteks data/filter saat ini.
          </div>
        )}
      </section>

      {/* Honest Loading State */}
      {analyzing && (
        <section className="bg-white border border-slate-200/90 rounded-xl p-6 sm:p-8 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
            <Loader2 className="w-5 h-5 text-blue-700 animate-spin" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Inferensi Gemini & Eksekusi Analytical Tools Sedang Berlangsung
            </h2>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              Controller sedang memproses pertanyaan pada server, menjalankan tool sesuai keputusan
              model, dan memvalidasi hasil secara programatik (batas waktu 90 detik).
            </p>
          </div>
        </section>
      )}

      {/* Analysis Output */}
      {analysis && !analyzing && (
        <div className="space-y-6">
          {/* Status Banner */}
          <section
            className={`border rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
              STATUS_META[analysis.status].colorClass
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5">{STATUS_META[analysis.status].icon}</div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                  <span className="font-semibold">{STATUS_META[analysis.status].label}</span>
                  <span aria-hidden="true" className="opacity-50">·</span>
                  <span className="text-xs opacity-90">
                    Keputusan: {analysis.agentDecision} · Validasi:{' '}
                    {analysis.validationStatus === 'passed'
                      ? 'Lulus'
                      : analysis.validationStatus === 'failed'
                        ? 'Gagal'
                        : 'Belum dijalankan'}
                  </span>
                </div>
                <p className="text-xs opacity-85 leading-relaxed">
                  {analysis.fileName} (v{analysis.datasetVersion}) · Filter:{' '}
                  {analysis.filterSummary} · Siklus {analysis.cyclesUsed} · {analysis.toolCallsUsed}{' '}
                  tool calls · {analysis.inferenceCallsUsed} inferensi ·{' '}
                  <span className="font-mono tabular-nums">
                    {(analysis.elapsedMs / 1000).toFixed(1)}s
                  </span>{' '}
                  · Integritas: {analysis.datasetIntegrityVerified ? 'Terjaga' : 'Berubah'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {(analysis.status === 'success' || analysis.status === 'partial') && (
                <button
                  type="button"
                  onClick={() => onGoToTab('decision')}
                  className="inline-flex items-center gap-1.5 min-h-[38px] px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 whitespace-nowrap cursor-pointer"
                >
                  Dukungan Keputusan
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
              {analysis.status === 'failed' && (
                <button
                  type="button"
                  onClick={() => void handleRetry()}
                  className="inline-flex items-center gap-1.5 min-h-[38px] px-4 py-2 text-xs font-medium text-red-900 bg-white border border-red-300 rounded-lg hover:bg-red-50 whitespace-nowrap cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Coba Ulang Manual
                </button>
              )}
            </div>
          </section>

          {/* Clarification Box */}
          {analysis.status === 'needs_clarification' && (
            <section className="bg-white border border-slate-200/90 rounded-xl p-6 space-y-4">
              <h2 className="text-base font-semibold text-slate-900">
                Klarifikasi / Konfirmasi Diperlukan
              </h2>
              <p className="text-sm text-slate-700 leading-relaxed">
                {analysis.clarificationQuestion}
              </p>

              {analysis.requiresTextColumnConfirmation &&
                analysis.requiresTextColumnConfirmation.length > 0 && (
                  <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-lg space-y-3">
                    <p className="text-xs font-semibold text-blue-950">
                      Persetujuan Kolom Teks Aman Diperlukan
                    </p>
                    <p className="text-xs text-blue-900 leading-relaxed">
                      Konfirmasi bahwa kolom{' '}
                      <span className="font-mono font-semibold">
                        {analysis.requiresTextColumnConfirmation.join(', ')}
                      </span>{' '}
                      bebas data pribadi sensitif, lalu klik tombol di bawah untuk mengizinkan
                      analisis kualitatif dan menjalankan permintaan baru.
                    </p>
                    <button
                      type="button"
                      onClick={async () => {
                        const merged = Array.from(
                          new Set([
                            ...approvedTextColumns,
                            ...(analysis.requiresTextColumnConfirmation ?? []),
                          ])
                        );
                        await onApproveTextColumns(merged);
                        setQuestion(analysis.question);
                      }}
                      className="min-h-[38px] px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 cursor-pointer"
                    >
                      Konfirmasi Kolom Aman ({analysis.requiresTextColumnConfirmation.join(', ')})
                    </button>
                  </div>
                )}
            </section>
          )}

          {/* Error Box */}
          {analysis.status === 'failed' && analysis.errorMessage && (
            <section className="bg-white border border-red-200 rounded-xl p-6 space-y-2.5">
              <h2 className="text-base font-semibold text-red-900">Alasan Penghentian</h2>
              <p className="text-sm text-slate-800 leading-relaxed">{analysis.errorMessage}</p>
              <p className="text-xs text-slate-500">
                Tidak ada hasil fiktif yang ditampilkan. Dashboard deterministik pada tab Dashboard
                tetap dapat digunakan secara penuh.
              </p>
            </section>
          )}

          {/* Verified Quantitative / Qualitative Output */}
          {(analysis.status === 'success' || analysis.status === 'partial') && (
            <>
              {/* Objective, Method, Summary & Findings */}
              <section className="bg-white border border-slate-200/90 rounded-xl p-5 sm:p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pb-5 border-b border-slate-100">
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Tujuan Analisis (Goal)</p>
                    <p className="text-sm text-slate-900 mt-1 leading-relaxed">
                      {analysis.objective}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Metode Aktual</p>
                    <p className="text-sm text-slate-900 mt-1 leading-relaxed">
                      {analysis.method}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-500">Ringkasan Hasil</p>
                  <p className="text-[15px] text-slate-800 leading-relaxed mt-1.5 max-w-4xl">
                    {analysis.executiveSummary}
                  </p>
                </div>

                {analysis.findings.length > 0 && (
                  <div className="pt-2 space-y-3">
                    <p className="text-xs font-semibold text-slate-500">
                      Temuan & Interpretasi Terverifikasi
                    </p>
                    <ul className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                      {analysis.findings.map((f, idx) => (
                        <li key={idx} className="p-4 text-sm text-slate-800 space-y-1.5">
                          <p className="leading-relaxed">{f.text}</p>
                          <p className="text-xs text-slate-500 font-mono">
                            {f.isInterpretation ? 'Interpretasi' : 'Temuan'} · {f.resultId} /{' '}
                            {f.metricKey}
                            {f.verifiedValue ? ` = ${f.verifiedValue}` : ''}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>

              {/* Charts */}
              {analysis.charts.length > 0 && (
                <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {analysis.charts.map((ch) => (
                    <ChartRenderer key={ch.chartId} chart={ch} />
                  ))}
                </section>
              )}

              {/* Qualitative Thematic Distribution & Verbatim Source Quotes */}
              {analysis.thematicResult && (
                <section className="bg-white border border-slate-200/90 rounded-xl p-5 sm:p-6 space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-slate-100">
                    <div>
                      <h2 className="text-[15px] font-semibold text-slate-900">
                        Hasil Kategorisasi Tematik ({analysis.thematicResult.column})
                      </h2>
                      <p className="text-xs text-slate-500 mt-1">
                        Total filter: {analysis.thematicResult.totalInFilter} · Kosong:{' '}
                        {analysis.thematicResult.emptyCount} · Dianalisis (penyebut):{' '}
                        {analysis.thematicResult.denominator} · Dikecualikan:{' '}
                        {analysis.thematicResult.excludedCount} · Terpotong:{' '}
                        {analysis.thematicResult.truncatedCount}
                      </p>
                    </div>
                    <p className="text-xs font-semibold text-amber-800 shrink-0">
                      {analysis.thematicResult.humanReviewLabel}
                    </p>
                  </div>

                  <div className="overflow-x-auto border border-slate-200 rounded-lg table-scroll">
                    <table className="w-full text-sm text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                          <th className="py-3 px-4">Tema Substantif</th>
                          <th className="py-3 px-4 text-right">Jumlah</th>
                          <th className="py-3 px-4 text-right">Persentase</th>
                          <th className="py-3 px-4">Contoh Kutipan Verbatim Sumber</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {analysis.thematicResult.themes.map((t) => (
                          <tr key={t.theme} className="align-top hover:bg-slate-50/70">
                            <td className="py-3 px-4 font-medium text-slate-900">{t.theme}</td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-800">
                              {t.count}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-800">
                              {t.percentage.toFixed(2).replace('.', ',')}%
                            </td>
                            <td className="py-3 px-4 text-xs text-slate-700 space-y-1.5 leading-relaxed">
                              {t.quotes.slice(0, 2).map((q) => (
                                <p key={q.rowId}>
                                  <span className="font-mono text-slate-500">[{q.rowId}]</span> “
                                  {q.quote}”
                                </p>
                              ))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Full ID - Theme - Verbatim Source Mapping Table */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xs font-semibold text-slate-700">
                        Pemetaan Lengkap ID – Tema – Kutipan Sumber (
                        {analysis.thematicResult.mappingTable.length} respons)
                      </h3>
                      {analysis.thematicResult.mappingTable.length > 10 && (
                        <button
                          type="button"
                          onClick={() => setShowAllMappings((v) => !v)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900 cursor-pointer"
                        >
                          {showAllMappings ? (
                            <>
                              Tampilkan 10 baris <ChevronUp className="w-3.5 h-3.5" />
                            </>
                          ) : (
                            <>
                              Tampilkan semua ({analysis.thematicResult.mappingTable.length}){' '}
                              <ChevronDown className="w-3.5 h-3.5" />
                            </>
                          )}
                        </button>
                      )}
                    </div>
                    <div className="overflow-x-auto border border-slate-200 rounded-lg table-scroll">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                            <th className="py-2.5 px-3.5 w-28">ID Sistem</th>
                            <th className="py-2.5 px-3.5 w-56">Tema</th>
                            <th className="py-2.5 px-3.5">Kutipan Verbatim Sumber</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(showAllMappings
                            ? analysis.thematicResult.mappingTable
                            : analysis.thematicResult.mappingTable.slice(0, 10)
                          ).map((row) => (
                            <tr key={row.rowId} className="hover:bg-slate-50/70">
                              <td className="py-2.5 px-3.5 font-mono text-slate-600 whitespace-nowrap">
                                {row.rowId}
                              </td>
                              <td className="py-2.5 px-3.5 font-medium text-slate-900">
                                {row.theme}
                              </td>
                              <td className="py-2.5 px-3.5 text-slate-700 leading-relaxed">
                                {row.quote}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </section>
              )}

              {/* Verified Metrics Table */}
              {analysis.verifiedMetrics.length > 0 && (
                <section className="bg-white border border-slate-200/90 rounded-xl overflow-hidden">
                  <div className="px-5 sm:px-6 py-4 border-b border-slate-100">
                    <h2 className="text-[15px] font-semibold text-slate-900">
                      Metrik Terverifikasi dari Analytical Tools
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Seluruh nilai dihitung secara deterministik oleh server dan direferensikan
                      menggunakan Result ID dan Metric Key.
                    </p>
                  </div>
                  <div className="overflow-x-auto table-scroll">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                          <th className="py-3 px-5">Result ID</th>
                          <th className="py-3 px-4">Metric Key</th>
                          <th className="py-3 px-4">Indikator</th>
                          <th className="py-3 px-5 text-right">Nilai Terverifikasi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {analysis.verifiedMetrics.map((m) => (
                          <tr key={`${m.resultId}-${m.metricKey}`} className="hover:bg-slate-50/70">
                            <td className="py-2.5 px-5 font-mono text-slate-600 whitespace-nowrap">
                              {m.resultId}
                            </td>
                            <td className="py-2.5 px-4 font-mono text-slate-600 whitespace-nowrap">
                              {m.metricKey}
                            </td>
                            <td className="py-2.5 px-4 text-slate-900">{m.label}</td>
                            <td className="py-2.5 px-5 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                              {m.formattedValue}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}

          {/* Actual Execution Trace & Validation Report */}
          {(analysis.executionTrace.length > 0 || analysis.validations.length > 0) && (
            <section className="bg-white border border-slate-200/90 rounded-xl p-5 sm:p-6 space-y-5">
              <div className="pb-4 border-b border-slate-100">
                <h2 className="text-[15px] font-semibold text-slate-900">
                  Jejak Eksekusi & Validasi Aktual (Goal → Decide → Act → Observe → Evaluate)
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Dicatat langsung dari kejadian runtime server · Permintaan{' '}
                  <span className="font-mono">{analysis.requestId}</span> · Model:{' '}
                  <span className="font-mono">{analysis.modelUsed}</span>
                </p>
              </div>

              {analysis.validations.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-slate-700">
                    Hasil Pemeriksaan Programatik (validate_result)
                  </p>
                  {analysis.validations.map((v) => (
                    <div
                      key={v.validationId}
                      className="border border-slate-200 rounded-lg p-4 space-y-2.5 bg-slate-50/70"
                    >
                      <p className="text-xs font-semibold text-slate-900 font-mono">
                        {v.validationId} · Target: {v.resultId} · Status:{' '}
                        <span className={v.passed ? 'text-emerald-700' : 'text-red-700'}>
                          {v.passed ? 'LULUS' : 'GAGAL'}
                        </span>
                      </p>
                      <ul className="space-y-1.5 text-xs text-slate-700">
                        {v.checks.map((ck, i) => (
                          <li key={i} className="flex items-start gap-2 leading-relaxed">
                            <span
                              className={`font-mono font-semibold shrink-0 ${
                                ck.passed ? 'text-emerald-700' : 'text-red-700'
                              }`}
                            >
                              {ck.passed ? 'LULUS' : 'GAGAL'}
                            </span>
                            <span>
                              <strong className="text-slate-900">{ck.name}:</strong> {ck.detail}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              {analysis.executionTrace.length > 0 && (
                <div className="overflow-x-auto border border-slate-200 rounded-lg table-scroll">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                        <th className="py-3 px-3.5 w-12 text-right">#</th>
                        <th className="py-3 px-3 w-16">Siklus</th>
                        <th className="py-3 px-3 w-24">Tahap</th>
                        <th className="py-3 px-3.5 w-40">Tool</th>
                        <th className="py-3 px-4">Ringkasan Kejadian Aktual</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {analysis.executionTrace.map((step) => (
                        <tr key={step.stepNumber} className="align-top hover:bg-slate-50/70">
                          <td className="py-3 px-3.5 text-right font-mono tabular-nums text-slate-400">
                            {step.stepNumber}
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-600">S{step.cycle}</td>
                          <td className="py-3 px-3 font-semibold text-slate-900 whitespace-nowrap">
                            {step.stage}
                          </td>
                          <td className="py-3 px-3.5 font-mono text-blue-800 whitespace-nowrap">
                            {step.toolName ?? '—'}
                          </td>
                          <td className="py-3 px-4 text-slate-700 space-y-1.5 leading-relaxed">
                            <p>{step.summary}</p>
                            {step.toolArgs && Object.keys(step.toolArgs).length > 0 && (
                              <p className="font-mono text-[11px] text-slate-500 break-all">
                                Parameter: {JSON.stringify(step.toolArgs)}
                              </p>
                            )}
                            {step.toolResponseSummary && (
                              <p className="font-mono text-[11px] text-slate-500 break-all">
                                Respons: {JSON.stringify(step.toolResponseSummary)}
                              </p>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
