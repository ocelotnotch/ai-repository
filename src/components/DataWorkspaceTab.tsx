import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  RotateCcw,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type { DatasetProfile } from '../shared/types';
import { GoogleSheetsPicker } from './GoogleSheetsPicker';

interface DataWorkspaceTabProps {
  profile: DatasetProfile | null;
  busy: boolean;
  uploadError: string | null;
  googleUser: User | null;
  googleToken: string | null;
  isLoggingIn: boolean;
  onGoogleLogin: () => Promise<void>;
  onGoogleLogout: () => Promise<void>;
  onTokenExpired: () => void;
  onUploadFile: (file: File, safeConfirmed: boolean) => Promise<void>;
  onLoadSample: (safeConfirmed: boolean) => Promise<void>;
  onImportSheet: (params: {
    spreadsheetId: string;
    spreadsheetTitle: string;
    sheetName: string;
    safeConfirmed: boolean;
  }) => Promise<void>;
  onResetWorkspace: () => Promise<void>;
  onGoToTab: (tab: 'dashboard' | 'analysis') => void;
}

const CANDIDATE_TYPE_LABEL: Record<string, string> = {
  numeric: 'Numerik',
  period: 'Periode / Waktu',
  category: 'Kategori',
  text: 'Teks Bebas',
};

export function DataWorkspaceTab({
  profile,
  busy,
  uploadError,
  googleUser,
  googleToken,
  isLoggingIn,
  onGoogleLogin,
  onGoogleLogout,
  onTokenExpired,
  onUploadFile,
  onLoadSample,
  onImportSheet,
  onResetWorkspace,
  onGoToTab,
}: DataWorkspaceTabProps) {
  const [safeConfirmed, setSafeConfirmed] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const processSelectedFile = async (file: File) => {
    setLocalError(null);
    if (!safeConfirmed) {
      setLocalError('Centang konfirmasi keamanan data terlebih dahulu sebelum mengunggah CSV.');
      return;
    }
    await onUploadFile(file, safeConfirmed);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processSelectedFile(file);
    e.target.value = '';
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (busy) return;
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await processSelectedFile(file);
    }
  };

  const handleSampleClick = async () => {
    setLocalError(null);
    if (!safeConfirmed) {
      setLocalError('Centang konfirmasi keamanan data terlebih dahulu untuk memuat dataset simulasi.');
      return;
    }
    await onLoadSample(safeConfirmed);
  };

  const totalMissing = profile
    ? profile.columns.reduce((sum, col) => sum + col.missingCount, 0)
    : 0;

  const activeError = localError || uploadError;

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Page Title & Quick Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Data Workspace</h1>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            Unggah file CSV UTF-8, muat dataset simulasi, atau impor tab dari Google Sheets. Data
            asli disimpan dalam mode read-only tanpa imputasi atau perubahan otomatis.
          </p>
        </div>

        {profile && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onGoToTab('dashboard')}
              className="inline-flex items-center gap-1.5 min-h-[38px] px-4 py-2 text-sm font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap cursor-pointer"
            >
              Buka Dashboard
              <ArrowRight className="w-4 h-4 text-slate-500" />
            </button>
            <button
              type="button"
              onClick={() => onGoToTab('analysis')}
              className="inline-flex items-center gap-1.5 min-h-[38px] px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 whitespace-nowrap cursor-pointer"
            >
              Mulai Analisis AI
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Unified Safe Data Confirmation Bar */}
      <div className="bg-white border border-slate-200/90 rounded-xl p-4 sm:p-5 space-y-3">
        <label className="flex items-start gap-3.5 cursor-pointer">
          <input
            type="checkbox"
            checked={safeConfirmed}
            onChange={(e) => {
              setSafeConfirmed(e.target.checked);
              if (e.target.checked) setLocalError(null);
            }}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600 shrink-0"
          />
          <div className="text-sm text-slate-800 leading-relaxed">
            <span className="font-semibold text-slate-900 inline-flex items-center gap-1.5 mr-1.5">
              <ShieldCheck className="w-4 h-4 text-blue-700 inline" />
              Konfirmasi Keamanan Data (Wajib):
            </span>
            Saya memastikan dataset yang digunakan adalah <strong>data sintetis atau anonim</strong>{' '}
            yang telah ditinjau dan tidak mengandung informasi pribadi sensitif (PII) maupun data
            rahasia instansi.
          </div>
        </label>

        {activeError && (
          <div
            role="alert"
            className="flex items-start gap-2.5 p-3.5 text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg"
          >
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-700" />
            <div>
              <p className="font-semibold">Validasi Data Ditolak</p>
              <p className="mt-0.5 text-red-700">{activeError}</p>
            </div>
          </div>
        )}
      </div>

      {/* 2-Column Data Intake Grid: CSV Upload + Google Sheets */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left 5 cols: CSV Upload & Simulation */}
        <section className="lg:col-span-5 bg-white border border-slate-200/90 rounded-xl p-5 sm:p-6 flex flex-col justify-between gap-5">
          <div>
            <div className="pb-4 border-b border-slate-100">
              <h2 className="text-[15px] font-semibold text-slate-900">
                Unggah CSV atau Data Simulasi
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Format CSV UTF-8 · Maks. 1 MB · 1.000 baris · 20 kolom · Header unik.
              </p>
            </div>

            {/* Interactive Dropzone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => void handleDrop(e)}
              onClick={() => {
                if (busy) return;
                if (!safeConfirmed) {
                  setLocalError(
                    'Centang konfirmasi keamanan data terlebih dahulu sebelum mengunggah CSV.'
                  );
                  return;
                }
                fileInputRef.current?.click();
              }}
              className={`mt-4 border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                isDragging
                  ? 'border-blue-600 bg-blue-50/70'
                  : 'border-slate-300 bg-slate-50/60 hover:border-blue-500 hover:bg-slate-50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                disabled={busy}
                className="hidden"
              />
              <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center mx-auto mb-3">
                <Upload className="w-5 h-5 text-blue-700" />
              </div>
              <p className="text-sm font-semibold text-slate-900">
                {busy ? 'Memproses dataset...' : 'Klik untuk pilih file CSV atau tarik ke sini'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Validasi struktur & profil kolom dijalankan otomatis di server
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 space-y-2.5">
            <p className="text-xs font-medium text-slate-500">
              Atau uji langsung menggunakan data simulasi kinerja pelayanan publik:
            </p>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleSampleClick()}
                className="flex-1 inline-flex items-center justify-center gap-2 min-h-[40px] px-4 py-2 text-sm font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 text-blue-700 shrink-0" />
                Muat Dataset Simulasi (54 Baris)
              </button>

              {profile && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onResetWorkspace()}
                  className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3.5 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reset
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Right 7 cols: Google Sheets Picker */}
        <div className="lg:col-span-7">
          <GoogleSheetsPicker
            googleUser={googleUser}
            googleToken={googleToken}
            isLoggingIn={isLoggingIn}
            safeConfirmed={safeConfirmed}
            busy={busy}
            onGoogleLogin={onGoogleLogin}
            onGoogleLogout={onGoogleLogout}
            onTokenExpired={onTokenExpired}
            onRequireSafeConfirm={() =>
              setLocalError(
                'Centang konfirmasi keamanan data di bagian atas terlebih dahulu sebelum mengimpor dari Google Sheets.'
              )
            }
            onImportSheet={(params) =>
              onImportSheet({
                ...params,
                safeConfirmed,
              })
            }
          />
        </div>
      </div>

      {/* Empty State when no dataset is loaded */}
      {!profile ? (
        <section className="bg-white border border-slate-200/90 rounded-xl p-10 sm:p-12 text-center">
          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3.5">
            <Database className="w-6 h-6 text-slate-400" />
          </div>
          <h2 className="text-base font-semibold text-slate-900">Belum Ada Dataset Aktif</h2>
          <p className="text-sm text-slate-600 mt-1.5 max-w-md mx-auto leading-relaxed">
            Centang konfirmasi keamanan data di atas lalu unggah file CSV, muat dataset simulasi,
            atau impor dari Google Sheets untuk mulai melihat profil data, KPI, dan analisis AI.
          </p>
        </section>
      ) : (
        <>
          {/* Dataset Summary Strip (single-level elevation, clean hairline dividers) */}
          <section className="bg-white border border-slate-200/90 rounded-xl overflow-hidden">
            <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-[15px] font-semibold text-slate-900">
                  Ringkasan & Integritas Dataset
                </h2>
                <p className="text-xs text-slate-500 mt-0.5 truncate">
                  {profile.fileName} · Versi #{profile.datasetVersion} · Mode Read-Only · Hash{' '}
                  <span className="font-mono">{profile.snapshotHash.slice(0, 12)}</span>
                </p>
              </div>
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 shrink-0">
                <CheckCircle2 className="w-4 h-4" />
                <span>Data Terverifikasi</span>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 lg:divide-x divide-slate-200">
              <div className="p-5 sm:p-6">
                <p className="text-xs font-medium text-slate-500">Jumlah Baris</p>
                <p className="text-2xl sm:text-3xl font-semibold text-slate-900 font-mono tabular-nums mt-1.5">
                  {new Intl.NumberFormat('id-ID').format(profile.rowCount)}
                </p>
              </div>
              <div className="p-5 sm:p-6">
                <p className="text-xs font-medium text-slate-500">Jumlah Kolom</p>
                <p className="text-2xl sm:text-3xl font-semibold text-slate-900 font-mono tabular-nums mt-1.5">
                  {profile.columnCount}
                </p>
              </div>
              <div className="p-5 sm:p-6">
                <p className="text-xs font-medium text-slate-500">Total Missing Values</p>
                <p
                  className={`text-2xl sm:text-3xl font-semibold font-mono tabular-nums mt-1.5 ${
                    totalMissing > 0 ? 'text-amber-700' : 'text-slate-900'
                  }`}
                >
                  {totalMissing}
                </p>
              </div>
              <div className="p-5 sm:p-6">
                <p className="text-xs font-medium text-slate-500">Baris Duplikat Identik</p>
                <p
                  className={`text-2xl sm:text-3xl font-semibold font-mono tabular-nums mt-1.5 ${
                    profile.duplicateRowCount > 0 ? 'text-amber-700' : 'text-slate-900'
                  }`}
                >
                  {profile.duplicateRowCount}
                </p>
              </div>
            </div>

            <div className="px-5 sm:px-6 py-3.5 bg-slate-50/70 border-t border-slate-100">
              {profile.issues.length > 0 ? (
                <div className="text-xs sm:text-sm text-amber-900 space-y-1">
                  <p className="font-semibold">
                    Catatan Kualitas Data (Dilaporkan Tanpa Mengubah Data Asli):
                  </p>
                  <ul className="list-disc pl-5 space-y-0.5">
                    {profile.issues.map((issue, idx) => (
                      <li key={idx}>{issue}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-xs text-slate-600">
                  Pemeriksaan kualitas data tidak menemukan missing values maupun baris duplikat
                  identik.
                </p>
              )}
            </div>
          </section>

          {/* Column Profile Table */}
          <section className="bg-white border border-slate-200/90 rounded-xl overflow-hidden">
            <div className="px-5 sm:px-6 py-4 border-b border-slate-100">
              <h2 className="text-[15px] font-semibold text-slate-900">Profil Kolom</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Deteksi tipe kandidat, jumlah observasi valid, missing values, dan contoh nilai
                aman.
              </p>
            </div>
            <div className="overflow-x-auto table-scroll">
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/90 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-5">Nama Kolom</th>
                    <th className="py-3 px-4">Tipe Kandidat</th>
                    <th className="py-3 px-4 text-right">Valid</th>
                    <th className="py-3 px-4 text-right">Missing</th>
                    <th className="py-3 px-4 text-right">Unik</th>
                    <th className="py-3 px-5">Contoh Nilai Aman</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {profile.columns.map((col) => (
                    <tr key={col.name} className="hover:bg-slate-50/80">
                      <td className="py-3 px-5 font-medium text-slate-900 font-mono text-xs whitespace-nowrap">
                        {col.name}
                      </td>
                      <td className="py-3 px-4 text-xs font-medium text-slate-700 whitespace-nowrap">
                        {CANDIDATE_TYPE_LABEL[col.candidateType] ?? col.candidateType}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-800">
                        {col.validCount}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono tabular-nums text-xs ${
                          col.missingCount > 0 ? 'text-amber-700 font-semibold' : 'text-slate-500'
                        }`}
                      >
                        {col.missingCount}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-800">
                        {col.uniqueCount}
                      </td>
                      <td className="py-3 px-5 text-xs text-slate-500 max-w-sm truncate">
                        {col.candidateType === 'text'
                          ? 'Teks bebas (tidak dikirim ke AI tanpa persetujuan kolom)'
                          : col.sampleValues.join(' · ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Data Preview Table */}
          <section className="bg-white border border-slate-200/90 rounded-xl overflow-hidden">
            <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-[15px] font-semibold text-slate-900">Pratinjau Data</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Menampilkan {profile.previewRows.length} baris pertama dari {profile.rowCount}{' '}
                  baris sumber (read-only).
                </p>
              </div>
            </div>
            <div className="overflow-x-auto max-h-[420px] table-scroll">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                    <th className="py-3 px-4 text-right w-12">#</th>
                    {profile.columns.map((c) => (
                      <th
                        key={c.name}
                        className={`py-3 px-3.5 whitespace-nowrap ${
                          c.candidateType === 'numeric' ? 'text-right' : ''
                        }`}
                      >
                        {c.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {profile.previewRows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-400">
                        {idx + 1}
                      </td>
                      {profile.columns.map((col) => {
                        const val = row[col.name] ?? '';
                        const isNum = col.candidateType === 'numeric';
                        return (
                          <td
                            key={col.name}
                            className={`py-2.5 px-3.5 ${
                              isNum
                                ? 'text-right font-mono tabular-nums text-slate-900 whitespace-nowrap'
                                : col.candidateType === 'text'
                                  ? 'text-slate-700 min-w-[220px] max-w-sm leading-relaxed'
                                  : 'text-slate-800 whitespace-nowrap'
                            }`}
                          >
                            {val === '' ? (
                              <span className="text-amber-700 italic">kosong</span>
                            ) : (
                              val
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
