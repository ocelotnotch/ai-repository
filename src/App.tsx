import { useCallback, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import type {
  ActiveFilter,
  AgentAnalysisResponse,
  DashboardConfig,
  DashboardDataResponse,
  DatasetProfile,
} from './shared/types';
import {
  clearAccessToken,
  googleSignIn,
  initAuth,
  logout as googleLogout,
} from './lib/googleAuth';
import { AiAnalysisTab } from './components/AiAnalysisTab';
import { DashboardTab } from './components/DashboardTab';
import { DataWorkspaceTab } from './components/DataWorkspaceTab';
import { DecisionSupportTab } from './components/DecisionSupportTab';

type TabKey = 'data' | 'dashboard' | 'analysis' | 'decision';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'data', label: 'Data Workspace' },
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'analysis', label: 'Analisis AI' },
  { key: 'decision', label: 'Dukungan Keputusan' },
];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Gagal membaca file CSV di browser.'));
    reader.readAsDataURL(file);
  });
}

function summarizeFilter(filter: ActiveFilter | undefined): string {
  if (!filter) return 'Semua data';
  const parts: string[] = [];
  if (filter.categoryColumn && filter.categoryValues.length > 0) {
    parts.push(`${filter.categoryColumn}: ${filter.categoryValues.join(', ')}`);
  }
  if (filter.periodColumn && filter.periodValues.length > 0) {
    parts.push(`${filter.periodColumn}: ${filter.periodValues.join(', ')}`);
  }
  return parts.length > 0 ? parts.join(' / ') : 'Semua data (tanpa filter)';
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('data');
  const [profile, setProfile] = useState<DatasetProfile | null>(null);
  const [dashboard, setDashboard] = useState<DashboardDataResponse | null>(null);
  const [approvedTextColumns, setApprovedTextColumns] = useState<string[]>([]);
  const [analysis, setAnalysis] = useState<AgentAnalysisResponse | null>(null);
  const [analysisInvalidatedReason, setAnalysisInvalidatedReason] = useState<string | null>(null);

  // Google Workspace OAuth state (token held strictly in memory)
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setGoogleUser(user);
        setGoogleToken(token);
      },
      () => {
        setGoogleUser(null);
        setGoogleToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    setGlobalError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setGoogleUser(result.user);
        setGoogleToken(result.accessToken);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal masuk dengan Google.';
      if (!/popup-closed-by-user/i.test(msg)) {
        setGlobalError(`Autentikasi Google dibatalkan atau gagal: ${msg}`);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleLogout = async () => {
    await googleLogout();
    setGoogleUser(null);
    setGoogleToken(null);
  };

  const handleTokenExpired = useCallback(() => {
    clearAccessToken();
    setGoogleToken(null);
  }, []);

  const fetchWorkspace = useCallback(async () => {
    try {
      const res = await fetch('/api/workspace');
      if (!res.ok) return;
      const data = await res.json();
      if (data.active) {
        setProfile(data.profile);
        setDashboard(data.dashboard);
        setApprovedTextColumns(data.approvedTextColumns ?? []);
      } else {
        setProfile(null);
        setDashboard(null);
        setApprovedTextColumns([]);
      }
    } catch {
      // Ignore transient startup errors
    }
  }, []);

  useEffect(() => {
    void fetchWorkspace();
  }, [fetchWorkspace]);

  const handleUploadFile = async (file: File, safeConfirmed: boolean) => {
    setWorkspaceBusy(true);
    setUploadError(null);
    setGlobalError(null);
    try {
      const base64Content = await fileToBase64(file);
      const res = await fetch('/api/dataset/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          base64Content,
          safeDataConfirmed: safeConfirmed,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error || 'Gagal mengunggah file CSV.');
        return;
      }
      setProfile(data.profile);
      setDashboard(data.dashboard);
      setApprovedTextColumns(data.approvedTextColumns ?? []);
      setAnalysis(null);
      setAnalysisInvalidatedReason(null);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Gagal mengirim file ke server.');
    } finally {
      setWorkspaceBusy(false);
    }
  };

  const handleLoadSample = async (safeConfirmed: boolean) => {
    setWorkspaceBusy(true);
    setUploadError(null);
    setGlobalError(null);
    try {
      const res = await fetch('/api/dataset/load-sample', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ safeDataConfirmed: safeConfirmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error || 'Gagal memuat dataset simulasi.');
        return;
      }
      setProfile(data.profile);
      setDashboard(data.dashboard);
      setApprovedTextColumns(data.approvedTextColumns ?? []);
      setAnalysis(null);
      setAnalysisInvalidatedReason(null);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Gagal memuat dataset simulasi.');
    } finally {
      setWorkspaceBusy(false);
    }
  };

  const handleImportSheet = async (params: {
    spreadsheetId: string;
    spreadsheetTitle: string;
    sheetName: string;
    safeConfirmed: boolean;
  }) => {
    if (!googleToken) {
      setUploadError('Silakan masuk dengan Google terlebih dahulu sebelum mengimpor Google Sheets.');
      return;
    }
    setWorkspaceBusy(true);
    setUploadError(null);
    setGlobalError(null);
    try {
      const res = await fetch('/api/dataset/import-sheet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${googleToken}`,
        },
        body: JSON.stringify({
          spreadsheetId: params.spreadsheetId,
          spreadsheetTitle: params.spreadsheetTitle,
          sheetName: params.sheetName,
          safeDataConfirmed: params.safeConfirmed,
        }),
      });
      const data = await res.json();
      if (res.status === 401) {
        handleTokenExpired();
        setUploadError(data.error || 'Sesi Google berakhir. Silakan masuk kembali dengan Google.');
        return;
      }
      if (!res.ok) {
        setUploadError(data.error || 'Gagal mengimpor data dari Google Sheets.');
        return;
      }
      setProfile(data.profile);
      setDashboard(data.dashboard);
      setApprovedTextColumns(data.approvedTextColumns ?? []);
      setAnalysis(null);
      setAnalysisInvalidatedReason(null);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Gagal mengimpor Google Sheets.');
    } finally {
      setWorkspaceBusy(false);
    }
  };

  const handleResetWorkspace = async () => {
    setWorkspaceBusy(true);
    setUploadError(null);
    setGlobalError(null);
    try {
      await fetch('/api/dataset/reset', { method: 'POST' });
      setProfile(null);
      setDashboard(null);
      setApprovedTextColumns([]);
      setAnalysis(null);
      setAnalysisInvalidatedReason(null);
      setActiveTab('data');
    } catch {
      setGlobalError('Gagal mereset workspace.');
    } finally {
      setWorkspaceBusy(false);
    }
  };

  const handleUpdateFilter = async (partial: Partial<ActiveFilter>) => {
    setWorkspaceBusy(true);
    setGlobalError(null);
    try {
      const res = await fetch('/api/filter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial),
      });
      const data = await res.json();
      if (!res.ok) {
        setGlobalError(data.error || 'Gagal memperbarui filter.');
        return;
      }
      setDashboard(data.dashboard);
      if (analysis) {
        setAnalysis(null);
        setAnalysisInvalidatedReason('Filter aktif telah diubah');
      }
    } catch {
      setGlobalError('Gagal terhubung ke server saat memperbarui filter.');
    } finally {
      setWorkspaceBusy(false);
    }
  };

  const handleResetFilter = async () => {
    setWorkspaceBusy(true);
    setGlobalError(null);
    try {
      const res = await fetch('/api/filter/reset', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setGlobalError(data.error || 'Gagal mereset filter.');
        return;
      }
      setDashboard(data.dashboard);
      if (analysis) {
        setAnalysis(null);
        setAnalysisInvalidatedReason('Filter aktif telah direset');
      }
    } catch {
      setGlobalError('Gagal mereset filter.');
    } finally {
      setWorkspaceBusy(false);
    }
  };

  const handleUpdateConfig = async (partial: Partial<DashboardConfig>) => {
    setWorkspaceBusy(true);
    setGlobalError(null);
    try {
      const res = await fetch('/api/dashboard/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial),
      });
      const data = await res.json();
      if (!res.ok) {
        setGlobalError(data.error || 'Gagal memperbarui konfigurasi dashboard.');
        return;
      }
      setDashboard(data.dashboard);
    } catch {
      setGlobalError('Gagal menyimpan konfigurasi dashboard.');
    } finally {
      setWorkspaceBusy(false);
    }
  };

  const handleApproveTextColumns = async (columns: string[]) => {
    setGlobalError(null);
    try {
      const res = await fetch('/api/text-columns/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columns }),
      });
      const data = await res.json();
      if (res.ok) {
        setApprovedTextColumns(data.approvedTextColumns ?? []);
      }
    } catch {
      setGlobalError('Gagal menyimpan persetujuan kolom teks.');
    }
  };

  const handleRunAnalysis = async (question: string) => {
    if (analyzing) return;
    setAnalyzing(true);
    setGlobalError(null);
    setAnalysisInvalidatedReason(null);
    try {
      const res = await fetch('/api/agent/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGlobalError(data.error || 'Gagal menjalankan analisis AI.');
        return;
      }
      setAnalysis(data.analysis);
      if (data.dashboard) {
        setDashboard(data.dashboard);
      }
    } catch {
      setGlobalError('Gagal terhubung ke server untuk inferensi AI.');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f6f9] text-slate-900 flex flex-col">
      {/* Executive Top Bar: 3-Zone Contract */}
      <header className="bg-white border-b border-slate-200/90 sticky top-0 z-20">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 h-14 sm:h-[60px] flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => setActiveTab('data')}
            className="inline-flex items-center gap-2.5 text-sm sm:text-[15px] font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span
              aria-hidden="true"
              className="w-7 h-7 rounded-lg bg-blue-700 text-white flex items-center justify-center text-xs font-bold shrink-0"
            >
              DS
            </span>
            <span>AI Agent Decision Support</span>
          </button>

          <nav
            aria-label="Navigasi utama"
            className="hidden md:flex items-center gap-7 text-sm font-medium h-full"
          >
            {TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`h-full inline-flex items-center border-b-2 whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? 'border-blue-700 text-blue-700 font-semibold'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              disabled={!profile || workspaceBusy || analyzing}
              onClick={() => void handleResetWorkspace()}
              className="min-h-[36px] px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Reset Workspace
            </button>
          </div>
        </div>

        {/* Mobile Tab Strip (compact height, crisp horizontal scroll at 390px) */}
        <nav
          aria-label="Navigasi mobile"
          className="md:hidden border-t border-slate-100 overflow-x-auto bg-white table-scroll"
        >
          <div className="flex items-center px-4 gap-5 text-xs font-medium">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`min-h-[42px] inline-flex items-center border-b-2 whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? 'border-blue-700 text-blue-700 font-semibold'
                      : 'border-transparent text-slate-600'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </nav>
      </header>

      {/* Quiet Unboxed Active Context Strip */}
      <div className="bg-white/75 border-b border-slate-200/80">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500">
          {profile && dashboard ? (
            <>
              <span className="font-semibold text-slate-800 truncate max-w-[260px] sm:max-w-sm">
                {profile.fileName}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-slate-700">
                {dashboard.filteredRows}/{profile.rowCount} baris · {profile.columnCount} kolom
              </span>
              <span aria-hidden="true">·</span>
              <span className="truncate max-w-full sm:max-w-md">
                Filter: {summarizeFilter(dashboard.filter)}
              </span>
            </>
          ) : (
            <span>
              Belum ada dataset aktif · Unggah CSV atau impor Google Sheets di Data Workspace
            </span>
          )}
          {googleUser && googleToken && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-slate-700 truncate max-w-[220px]">
                Google: {googleUser.email}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Main Executive Viewport */}
      <main className="flex-1 max-w-[1360px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {globalError && (
          <div
            role="alert"
            className="mb-6 p-4 text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between gap-4"
          >
            <span>{globalError}</span>
            <button
              type="button"
              onClick={() => setGlobalError(null)}
              className="text-xs font-semibold underline shrink-0 cursor-pointer"
            >
              Tutup
            </button>
          </div>
        )}

        {activeTab === 'data' && (
          <DataWorkspaceTab
            profile={profile}
            busy={workspaceBusy}
            uploadError={uploadError}
            googleUser={googleUser}
            googleToken={googleToken}
            isLoggingIn={isLoggingIn}
            onGoogleLogin={handleGoogleLogin}
            onGoogleLogout={handleGoogleLogout}
            onTokenExpired={handleTokenExpired}
            onUploadFile={handleUploadFile}
            onLoadSample={handleLoadSample}
            onImportSheet={handleImportSheet}
            onResetWorkspace={handleResetWorkspace}
            onGoToTab={(tab) => setActiveTab(tab)}
          />
        )}

        {activeTab === 'dashboard' && (
          <DashboardTab
            dashboard={dashboard}
            busy={workspaceBusy}
            onUpdateFilter={handleUpdateFilter}
            onResetFilter={handleResetFilter}
            onUpdateConfig={handleUpdateConfig}
            onGoToData={() => setActiveTab('data')}
          />
        )}

        {activeTab === 'analysis' && (
          <AiAnalysisTab
            profile={profile}
            dashboard={dashboard}
            approvedTextColumns={approvedTextColumns}
            analysis={analysis}
            analysisInvalidatedReason={analysisInvalidatedReason}
            analyzing={analyzing}
            onApproveTextColumns={handleApproveTextColumns}
            onRunAnalysis={handleRunAnalysis}
            onGoToTab={(tab) => setActiveTab(tab)}
          />
        )}

        {activeTab === 'decision' && (
          <DecisionSupportTab
            analysis={analysis}
            analysisInvalidatedReason={analysisInvalidatedReason}
            googleUser={googleUser}
            googleToken={googleToken}
            isLoggingIn={isLoggingIn}
            onGoogleLogin={handleGoogleLogin}
            onTokenExpired={handleTokenExpired}
            onGoToAnalysis={() => setActiveTab('analysis')}
          />
        )}
      </main>
    </div>
  );
}
