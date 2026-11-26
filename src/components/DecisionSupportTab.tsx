import { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  FileSpreadsheet,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type { AgentAnalysisResponse } from '../shared/types';
import { GoogleSignInButton } from './GoogleSignInButton';

interface DecisionSupportTabProps {
  analysis: AgentAnalysisResponse | null;
  analysisInvalidatedReason: string | null;
  googleUser: User | null;
  googleToken: string | null;
  isLoggingIn: boolean;
  onGoogleLogin: () => Promise<void>;
  onTokenExpired: () => void;
  onGoToAnalysis: () => void;
}

function buildSummarySheetRows(analysis: AgentAnalysisResponse): string[][] {
  const rows: string[][] = [
    ['Bagian', 'Indikator / Butir', 'Nilai / Penjelasan', 'Referensi Bukti'],
    ['Konteks', 'Dataset Aktif', `${analysis.fileName} (v${analysis.datasetVersion})`, analysis.requestId],
    ['Konteks', 'Filter Aktif', analysis.filterSummary, analysis.snapshotAfter.slice(0, 12)],
    ['Konteks', 'Pertanyaan Pengguna', analysis.question, analysis.modelUsed],
    ['Ringkasan Eksekutif', 'Tujuan Analisis', analysis.objective, analysis.resultRefs.join(', ')],
    ['Ringkasan Eksekutif', 'Metode Aktual', analysis.method, analysis.validationStatus],
    ['Ringkasan Eksekutif', 'Ringkasan', analysis.executiveSummary, analysis.agentDecision],
  ];

  for (const f of analysis.findings) {
    rows.push([
      f.isInterpretation ? 'Interpretasi AI' : 'Temuan Terverifikasi',
      f.metricKey || '-',
      f.text,
      `${f.resultId}${f.verifiedValue ? ` = ${f.verifiedValue}` : ''}`,
    ]);
  }

  for (let i = 0; i < analysis.recommendations.length; i++) {
    const rec = analysis.recommendations[i];
    rows.push([
      `Rekomendasi #${i + 1}`,
      rec.action,
      rec.rationale,
      `${rec.resultId} / ${rec.metricKey}${rec.verifiedEvidence ? ` (${rec.verifiedEvidence})` : ''}`,
    ]);
  }

  for (const lim of analysis.limitations) {
    rows.push(['Keterbatasan', 'Catatan', lim, '-']);
  }

  rows.push(['Peninjauan Manusia', 'Otoritas Keputusan', analysis.humanReviewNotice, 'Wajib']);
  return rows;
}

export function DecisionSupportTab({
  analysis,
  analysisInvalidatedReason,
  googleUser,
  googleToken,
  isLoggingIn,
  onGoogleLogin,
  onTokenExpired,
  onGoToAnalysis,
}: DecisionSupportTabProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [exportTitle, setExportTitle] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportedSheet, setExportedSheet] = useState<{ title: string; url: string } | null>(null);

  const isUsable =
    analysis &&
    (analysis.status === 'success' || analysis.status === 'partial') &&
    analysis.validationStatus === 'passed';

  if (!isUsable) {
    return (
      <section className="bg-white border border-slate-200/90 rounded-xl p-10 sm:p-14 text-center space-y-3">
        <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto">
          <ClipboardCheck className="w-6 h-6 text-slate-400" />
        </div>
        <h2 className="text-base font-semibold text-slate-900">
          Ringkasan Dukungan Keputusan Belum Tersedia
        </h2>
        <p className="text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
          {analysisInvalidatedReason
            ? `Hasil analisis sebelumnya telah diinvalidasi (${analysisInvalidatedReason}). Jalankan analisis baru pada tab Analisis AI agar rekomendasi selalu merujuk bukti terbaru.`
            : 'Jalankan pertanyaan analisis yang tervalidasi pada tab Analisis AI terlebih dahulu. Tab ini menyajikan ringkasan eksekutif, temuan, bukti, dan rekomendasi langsung dari hasil terverifikasi tanpa memanggil model tambahan.'}
        </p>
        <div className="pt-2">
          <button
            type="button"
            onClick={onGoToAnalysis}
            className="min-h-[40px] px-5 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 cursor-pointer"
          >
            Ke Analisis AI
          </button>
        </div>
      </section>
    );
  }

  const previewRows = buildSummarySheetRows(analysis);
  const defaultTitle = `Ringkasan Keputusan - ${analysis.fileName.replace(/\.csv$/i, '')} (${analysis.requestId})`;

  const openExportDialog = () => {
    setExportError(null);
    setExportTitle(defaultTitle);
    setConfirmOpen(true);
  };

  const handleConfirmExportToSheets = async () => {
    if (!googleToken) {
      setConfirmOpen(false);
      setExportError('Token Google tidak tersedia. Silakan masuk kembali dengan Google.');
      return;
    }

    const finalTitle = exportTitle.trim() || defaultTitle;
    setExporting(true);
    setExportError(null);

    try {
      const createResp = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${googleToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          properties: { title: finalTitle },
          sheets: [{ properties: { title: 'Ringkasan Keputusan' } }],
        }),
      });

      if (createResp.status === 401) {
        onTokenExpired();
        setConfirmOpen(false);
        setExportError('Sesi Google Anda berakhir. Silakan masuk kembali dengan Google.');
        return;
      }

      const created = await createResp.json();
      if (!createResp.ok || !created?.spreadsheetId) {
        setConfirmOpen(false);
        setExportError(
          created?.error?.message || 'Gagal membuat Google Sheets baru pada akun Anda.'
        );
        return;
      }

      const spreadsheetId = String(created.spreadsheetId);
      const spreadsheetUrl =
        typeof created.spreadsheetUrl === 'string' &&
        created.spreadsheetUrl.startsWith('https://docs.google.com/spreadsheets/')
          ? created.spreadsheetUrl
          : `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}`;

      const range = encodeURIComponent("'Ringkasan Keputusan'!A1");
      const updateResp = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
          spreadsheetId
        )}/values/${range}?valueInputOption=RAW`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${googleToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ values: previewRows }),
        }
      );

      if (!updateResp.ok) {
        const errData = await updateResp.json();
        setConfirmOpen(false);
        setExportError(
          errData?.error?.message ||
            'Spreadsheet berhasil dibuat tetapi gagal menulis baris ringkasan.'
        );
        return;
      }

      setExportedSheet({ title: finalTitle, url: spreadsheetUrl });
      setConfirmOpen(false);
    } catch {
      setConfirmOpen(false);
      setExportError('Gagal terhubung ke Google Sheets API saat menyimpan ringkasan.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Page Header & Save to Google Sheets Action */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Dukungan Keputusan Eksekutif
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            {analysis.fileName} (v{analysis.datasetVersion}) · Filter: {analysis.filterSummary} ·
            Bukti: <span className="font-mono text-xs">{analysis.resultRefs.join(', ')}</span>
          </p>
        </div>

        <div className="shrink-0">
          {googleUser && googleToken ? (
            <button
              type="button"
              disabled={exporting}
              onClick={openExportDialog}
              className="inline-flex items-center gap-2 min-h-[40px] px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Simpan ke Google Sheets
            </button>
          ) : (
            <GoogleSignInButton
              onClick={() => void onGoogleLogin()}
              loading={isLoggingIn}
              label="Sign in with Google"
            />
          )}
        </div>
      </div>

      {/* Human Review Authority Notice */}
      <section className="bg-amber-50/90 border border-amber-200 rounded-xl p-5 flex items-start gap-3.5">
        <ShieldAlert className="w-5 h-5 text-amber-800 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-amber-950">
            Pemberitahuan Peninjauan Manusia (Human-in-the-Loop)
          </h2>
          <p className="text-sm text-amber-900 leading-relaxed">{analysis.humanReviewNotice}</p>
        </div>
      </section>

      {exportError && (
        <div
          role="alert"
          className="flex items-start gap-2.5 p-4 text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl"
        >
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-700" />
          <span>{exportError}</span>
        </div>
      )}

      {exportedSheet && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 text-sm text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-xl">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>
              Ringkasan berhasil disimpan ke Google Sheets: <strong>{exportedSheet.title}</strong>
            </span>
          </div>
          <a
            href={exportedSheet.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 hover:underline whitespace-nowrap shrink-0"
          >
            Buka di Google Sheets
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      {/* Executive Summary */}
      <section className="bg-white border border-slate-200/90 rounded-xl p-5 sm:p-6 space-y-4">
        <div className="pb-4 border-b border-slate-100">
          <p className="text-xs font-semibold text-slate-500">Pertanyaan Analisis</p>
          <p className="text-base font-semibold text-slate-900 mt-1">“{analysis.question}”</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500">Ringkasan Eksekutif</p>
          <p className="text-[15px] text-slate-800 leading-relaxed mt-1.5 max-w-4xl">
            {analysis.executiveSummary}
          </p>
        </div>
      </section>

      {/* Findings & Evidence */}
      <section className="bg-white border border-slate-200/90 rounded-xl p-5 sm:p-6 space-y-5">
        <div className="pb-4 border-b border-slate-100">
          <h2 className="text-[15px] font-semibold text-slate-900">Temuan & Bukti Terverifikasi</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Setiap angka dan kutipan bersumber langsung dari hasil analytical tools yang lulus{' '}
            <span className="font-mono">validate_result</span>.
          </p>
        </div>

        {analysis.findings.length > 0 ? (
          <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
            {analysis.findings.map((finding, idx) => (
              <div key={idx} className="p-4 sm:p-5 space-y-1.5">
                <p className="text-sm text-slate-900 leading-relaxed">{finding.text}</p>
                <p className="text-xs text-slate-500 font-mono">
                  {finding.isInterpretation ? 'Interpretasi AI' : 'Bukti Faktual'} ·{' '}
                  {finding.resultId} / {finding.metricKey}
                  {finding.verifiedValue ? ` · Nilai: ${finding.verifiedValue}` : ''}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-600">Tidak ada daftar temuan terpisah pada respons ini.</p>
        )}

        {analysis.thematicResult && (
          <div className="pt-2 space-y-3">
            <p className="text-xs font-semibold text-slate-700">
              Bukti Kutipan Verbatim ({analysis.thematicResult.humanReviewLabel})
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {analysis.thematicResult.themes.map((t) => (
                <div
                  key={t.theme}
                  className="p-4 bg-slate-50/80 border border-slate-200 rounded-lg space-y-2"
                >
                  <p className="text-xs font-semibold text-slate-900">
                    {t.theme} ·{' '}
                    <span className="font-mono tabular-nums font-normal text-slate-600">
                      {t.count}/{analysis.thematicResult!.denominator} (
                      {t.percentage.toFixed(2).replace('.', ',')}%)
                    </span>
                  </p>
                  {t.quotes.slice(0, 2).map((q) => (
                    <p key={q.rowId} className="text-xs text-slate-700 leading-relaxed">
                      <span className="font-mono text-slate-500">[{q.rowId}]</span> “{q.quote}”
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Evidence-Based Recommendations */}
      <section className="bg-white border border-slate-200/90 rounded-xl p-5 sm:p-6 space-y-4">
        <div className="pb-4 border-b border-slate-100">
          <h2 className="text-[15px] font-semibold text-slate-900">
            Rekomendasi Berbasis Bukti (Bahan Pertimbangan Pimpinan)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Hanya usulan tindak lanjut yang memiliki referensi bukti tervalidasi yang ditampilkan.
            Tidak ada eksekusi keputusan otomatis.
          </p>
        </div>

        {analysis.recommendations.length > 0 ? (
          <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
            {analysis.recommendations.map((rec, idx) => (
              <div key={idx} className="p-4 sm:p-5 space-y-1.5">
                <p className="text-sm font-semibold text-slate-900">
                  {String(idx + 1).padStart(2, '0')}. {rec.action}
                </p>
                <p className="text-sm text-slate-700 leading-relaxed">{rec.rationale}</p>
                <p className="text-xs font-mono text-slate-500 pt-1">
                  Bukti: {rec.resultId} / {rec.metricKey}
                  {rec.verifiedEvidence ? ` (${rec.verifiedEvidence})` : ''}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-600">
            Pertanyaan yang diajukan bersifat deskriptif dan tidak menghasilkan rekomendasi tindakan
            khusus.
          </p>
        )}
      </section>

      {/* Limitations & Data Integrity */}
      <section className="bg-white border border-slate-200/90 rounded-xl p-5 sm:p-6 space-y-3.5">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
          <h2 className="text-[15px] font-semibold text-slate-900">
            Keterbatasan & Integritas Data
          </h2>
        </div>
        {analysis.limitations.length > 0 ? (
          <ul className="list-disc pl-5 text-sm text-slate-700 space-y-1.5 leading-relaxed">
            {analysis.limitations.map((lim, i) => (
              <li key={i}>{lim}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-600">
            Analisis terbatas pada dataset dan filter aktif saat ini; temuan deskriptif tidak
            menyimpulkan hubungan sebab-akibat.
          </p>
        )}
        <p className="text-xs text-slate-500 pt-3 border-t border-slate-100 font-mono">
          Snapshot sebelum: {analysis.snapshotBefore.slice(0, 12)} · Snapshot sesudah:{' '}
          {analysis.snapshotAfter.slice(0, 12)} · Integritas Read-Only:{' '}
          {analysis.datasetIntegrityVerified ? 'Identik (Terverifikasi)' : 'Tidak Identik'}
        </p>
      </section>

      {/* Mandatory User Confirmation Dialog before creating/writing to Google Sheets */}
      {confirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-sheet-export-title"
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[1px] flex items-center justify-center p-4"
        >
          <div className="bg-white border border-slate-200 rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4">
            <h2
              id="confirm-sheet-export-title"
              className="text-base font-semibold text-slate-900"
            >
              Konfirmasi Penyimpanan ke Google Sheets
            </h2>
            <p className="text-sm text-slate-700 leading-relaxed">
              Tindakan ini akan membuat <strong>1 file Google Spreadsheet baru</strong> pada Google
              Drive akun <span className="font-medium text-slate-900">{googleUser?.email}</span>{' '}
              dengan tab <span className="font-mono text-xs">Ringkasan Keputusan</span> berisi{' '}
              <strong>{previewRows.length} baris</strong> (ringkasan eksekutif, temuan terverifikasi,
              rekomendasi, keterbatasan, dan catatan peninjauan manusia).
            </p>

            <div>
              <label
                htmlFor="export-sheet-title"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Nama File Google Spreadsheet Baru
              </label>
              <input
                id="export-sheet-title"
                type="text"
                value={exportTitle}
                disabled={exporting}
                onChange={(e) => setExportTitle(e.target.value)}
                className="w-full min-h-[40px] px-3.5 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={exporting}
                onClick={() => setConfirmOpen(false)}
                className="min-h-[40px] px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={exporting}
                onClick={() => void handleConfirmExportToSheets()}
                className="inline-flex items-center gap-2 min-h-[40px] px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
              >
                {exporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  'Konfirmasi & Simpan'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
