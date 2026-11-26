import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Download,
  FileSpreadsheet,
  Loader2,
  LogOut,
  RefreshCw,
  Search,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { GoogleSignInButton } from './GoogleSignInButton';

export interface DriveSpreadsheetFile {
  id: string;
  name: string;
  modifiedTime?: string;
}

export interface SheetTabInfo {
  sheetId: number;
  title: string;
  rowCount?: number;
  columnCount?: number;
}

interface GoogleSheetsPickerProps {
  googleUser: User | null;
  googleToken: string | null;
  isLoggingIn: boolean;
  safeConfirmed: boolean;
  busy: boolean;
  onGoogleLogin: () => Promise<void>;
  onGoogleLogout: () => Promise<void>;
  onTokenExpired: () => void;
  onRequireSafeConfirm: () => void;
  onImportSheet: (params: {
    spreadsheetId: string;
    spreadsheetTitle: string;
    sheetName: string;
  }) => Promise<void>;
}

function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  return trimmed;
}

function formatDateId(iso?: string): string {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

export function GoogleSheetsPicker({
  googleUser,
  googleToken,
  isLoggingIn,
  safeConfirmed,
  busy,
  onGoogleLogin,
  onGoogleLogout,
  onTokenExpired,
  onRequireSafeConfirm,
  onImportSheet,
}: GoogleSheetsPickerProps) {
  const [files, setFiles] = useState<DriveSpreadsheetFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [manualUrlOrId, setManualUrlOrId] = useState('');

  const [selectedFile, setSelectedFile] = useState<DriveSpreadsheetFile | null>(null);
  const [sheetTabs, setSheetTabs] = useState<SheetTabInfo[]>([]);
  const [selectedSheetName, setSelectedSheetName] = useState('');
  const [loadingTabs, setLoadingTabs] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);

  const loadDriveSpreadsheets = useCallback(async () => {
    if (!googleToken) return;
    setLoadingFiles(true);
    setSheetError(null);
    try {
      const q = encodeURIComponent(
        "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false"
      );
      const fields = encodeURIComponent('files(id,name,modifiedTime)');
      const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&orderBy=modifiedTime%20desc&pageSize=25`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${googleToken}` },
      });

      if (res.status === 401) {
        onTokenExpired();
        setSheetError('Sesi Google Anda berakhir. Silakan masuk kembali dengan Google.');
        return;
      }

      const data = await res.json();
      if (!res.ok) {
        setSheetError(
          data?.error?.message || 'Gagal mengambil daftar Google Sheets dari Google Drive.'
        );
        return;
      }

      setFiles(Array.isArray(data.files) ? data.files : []);
    } catch {
      setSheetError('Tidak dapat terhubung ke Google Drive API.');
    } finally {
      setLoadingFiles(false);
    }
  }, [googleToken, onTokenExpired]);

  useEffect(() => {
    if (googleToken) {
      void loadDriveSpreadsheets();
    } else {
      setFiles([]);
      setSelectedFile(null);
      setSheetTabs([]);
      setSelectedSheetName('');
    }
  }, [googleToken, loadDriveSpreadsheets]);

  const inspectSpreadsheet = async (spreadsheetId: string, fallbackName?: string) => {
    if (!googleToken) return;
    const cleanId = extractSpreadsheetId(spreadsheetId);
    if (!/^[a-zA-Z0-9_-]{10,120}$/.test(cleanId)) {
      setSheetError('ID atau tautan Google Sheets tidak valid.');
      return;
    }

    setLoadingTabs(true);
    setSheetError(null);
    setSheetTabs([]);
    setSelectedSheetName('');

    try {
      const fields = encodeURIComponent(
        'properties.title,sheets.properties(sheetId,title,gridProperties)'
      );
      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(cleanId)}?fields=${fields}`,
        {
          headers: { Authorization: `Bearer ${googleToken}` },
        }
      );

      if (res.status === 401) {
        onTokenExpired();
        setSheetError('Sesi Google Anda berakhir. Silakan masuk kembali dengan Google.');
        return;
      }

      const data = await res.json();
      if (!res.ok) {
        setSheetError(
          data?.error?.message || 'Gagal membaca metadata Google Sheets. Periksa izin akses file.'
        );
        return;
      }

      const title = String(data?.properties?.title || fallbackName || cleanId);
      const tabs: SheetTabInfo[] = Array.isArray(data?.sheets)
        ? data.sheets.map(
            (s: {
              properties?: {
                sheetId?: number;
                title?: string;
                gridProperties?: { rowCount?: number; columnCount?: number };
              };
            }) => ({
              sheetId: s.properties?.sheetId ?? 0,
              title: String(s.properties?.title ?? ''),
              rowCount: s.properties?.gridProperties?.rowCount,
              columnCount: s.properties?.gridProperties?.columnCount,
            })
          )
        : [];

      if (tabs.length === 0) {
        setSheetError('Spreadsheet ini tidak memiliki tab sheet yang dapat dibaca.');
        return;
      }

      setSelectedFile({ id: cleanId, name: title });
      setSheetTabs(tabs);
      setSelectedSheetName(tabs[0].title);
    } catch {
      setSheetError('Gagal menghubungi Google Sheets API.');
    } finally {
      setLoadingTabs(false);
    }
  };

  const handleImportClick = async () => {
    setSheetError(null);
    if (!safeConfirmed) {
      onRequireSafeConfirm();
      return;
    }
    if (!selectedFile || !selectedSheetName) {
      setSheetError('Pilih spreadsheet dan tab sheet terlebih dahulu.');
      return;
    }
    await onImportSheet({
      spreadsheetId: selectedFile.id,
      spreadsheetTitle: selectedFile.name,
      sheetName: selectedSheetName,
    });
  };

  const filteredFiles = files.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );

  return (
    <section className="bg-white border border-slate-200/90 rounded-xl p-5 sm:p-6 flex flex-col h-full">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 pb-4 border-b border-slate-100">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-slate-900">
            Impor dari Google Sheets
          </h2>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Pilih spreadsheet langsung dari Google Drive atau tempel tautan/ID spreadsheet untuk
            diimpor ke workspace read-only.
          </p>
        </div>

        {googleUser && googleToken ? (
          <div className="flex items-center gap-2.5 shrink-0">
            <span className="text-xs text-slate-600 truncate max-w-[170px]">
              {googleUser.email || googleUser.displayName}
            </span>
            <button
              type="button"
              onClick={() => void onGoogleLogout()}
              className="inline-flex items-center gap-1.5 min-h-[34px] px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Putuskan
            </button>
          </div>
        ) : (
          <GoogleSignInButton onClick={() => void onGoogleLogin()} loading={isLoggingIn} />
        )}
      </div>

      {sheetError && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2.5 p-3.5 text-xs sm:text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg"
        >
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-700" />
          <span>{sheetError}</span>
        </div>
      )}

      {!googleToken ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-8 px-4">
          <div className="w-11 h-11 rounded-lg bg-slate-100 flex items-center justify-center mb-3">
            <FileSpreadsheet className="w-5 h-5 text-slate-500" />
          </div>
          <p className="text-sm font-medium text-slate-800">Akun Google Belum Terhubung</p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm leading-relaxed">
            Masuk dengan Google di sudut kanan atas panel ini untuk menelusuri Google Sheets Anda.
            Token akses disimpan sementara di memori browser dan dihapus saat keluar.
          </p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-5 flex-1">
          {/* Left: Browse Drive spreadsheets or paste URL/ID */}
          <div className="md:col-span-7 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="sheet-search" className="text-xs font-semibold text-slate-700">
                Daftar Spreadsheet Drive
              </label>
              <button
                type="button"
                disabled={loadingFiles}
                onClick={() => void loadDriveSpreadsheets()}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingFiles ? 'animate-spin' : ''}`} />
                Muat Ulang
              </button>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="sheet-search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama spreadsheet..."
                className="w-full min-h-[38px] pl-9 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div className="border border-slate-200 rounded-lg max-h-52 overflow-y-auto divide-y divide-slate-100 table-scroll">
              {loadingFiles ? (
                <div className="p-6 flex items-center justify-center gap-2 text-xs text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-700" />
                  <span>Memuat daftar Google Sheets...</span>
                </div>
              ) : filteredFiles.length === 0 ? (
                <p className="p-5 text-xs text-slate-500 text-center">
                  Tidak ada spreadsheet ditemukan. Tempel URL atau ID spreadsheet di bawah.
                </p>
              ) : (
                filteredFiles.map((f) => {
                  const isSelected = selectedFile?.id === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => void inspectSpreadsheet(f.id, f.name)}
                      className={`w-full text-left px-3.5 py-2.5 flex items-center justify-between gap-3 cursor-pointer ${
                        isSelected ? 'bg-blue-50/80' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0 flex items-center gap-2.5">
                        <FileSpreadsheet className="w-4 h-4 text-emerald-700 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">{f.name}</p>
                          {f.modifiedTime && (
                            <p className="text-[11px] text-slate-500">
                              Diubah {formatDateId(f.modifiedTime)}
                            </p>
                          )}
                        </div>
                      </div>
                      <span
                        className={`text-xs font-medium shrink-0 ${
                          isSelected ? 'text-blue-800' : 'text-slate-500'
                        }`}
                      >
                        {isSelected ? 'Dipilih' : 'Pilih'}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            {/* Direct URL / ID input */}
            <div className="pt-1 space-y-1.5">
              <label htmlFor="manual-sheet-id" className="block text-xs font-medium text-slate-600">
                Atau tempel URL / ID Google Sheets
              </label>
              <div className="flex gap-2">
                <input
                  id="manual-sheet-id"
                  type="text"
                  value={manualUrlOrId}
                  onChange={(e) => setManualUrlOrId(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="flex-1 min-h-[36px] px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                />
                <button
                  type="button"
                  disabled={!manualUrlOrId.trim() || loadingTabs}
                  onClick={() => void inspectSpreadsheet(manualUrlOrId)}
                  className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Periksa Tab
                </button>
              </div>
            </div>
          </div>

          {/* Right: Selected Spreadsheet Tab & Import Action */}
          <div className="md:col-span-5 bg-slate-50/80 border border-slate-200/80 rounded-lg p-4 flex flex-col justify-between gap-4">
            {loadingTabs ? (
              <div className="py-10 flex items-center justify-center gap-2 text-xs text-slate-600">
                <Loader2 className="w-4 h-4 animate-spin text-blue-700" />
                <span>Membaca daftar tab sheet...</span>
              </div>
            ) : selectedFile && sheetTabs.length > 0 ? (
              <div className="space-y-4">
                <div>
                  <p className="text-[11px] font-medium text-slate-500">Spreadsheet Terpilih</p>
                  <p className="text-sm font-semibold text-slate-900 mt-0.5 leading-snug">
                    {selectedFile.name}
                  </p>
                  <p className="text-[11px] font-mono text-slate-500 mt-0.5 truncate">
                    {selectedFile.id}
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="sheet-tab-select"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Tab Sheet ({sheetTabs.length} tersedia)
                  </label>
                  <select
                    id="sheet-tab-select"
                    value={selectedSheetName}
                    onChange={(e) => setSelectedSheetName(e.target.value)}
                    disabled={busy}
                    className="w-full min-h-[38px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:border-blue-600 focus:outline-none"
                  >
                    {sheetTabs.map((t) => (
                      <option key={t.sheetId} value={t.title}>
                        {t.title}
                        {t.rowCount && t.columnCount
                          ? ` (${t.rowCount}×${t.columnCount})`
                          : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <p className="text-xs text-slate-500 leading-relaxed">
                  Baris pertama dipakai sebagai header unik (maks. 1.000 baris, 20 kolom).
                </p>
              </div>
            ) : (
              <div className="py-8 text-center space-y-1.5 my-auto">
                <FileSpreadsheet className="w-6 h-6 text-slate-400 mx-auto" />
                <p className="text-xs font-semibold text-slate-700">Pilih File Spreadsheet</p>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Pilih file dari daftar atau masukkan URL untuk memuat pilihan tab.
                </p>
              </div>
            )}

            <button
              type="button"
              disabled={busy || !selectedFile || !selectedSheetName}
              onClick={() => void handleImportClick()}
              className="w-full inline-flex items-center justify-center gap-2 min-h-[40px] px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-45 whitespace-nowrap cursor-pointer"
            >
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Mengimpor...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Impor ke Workspace
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
