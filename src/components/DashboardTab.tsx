import { AlertTriangle, BarChart3, Filter, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import type { ActiveFilter, DashboardConfig, DashboardDataResponse } from '../shared/types';
import { ChartRenderer } from './ChartRenderer';

interface DashboardTabProps {
  dashboard: DashboardDataResponse | null;
  busy: boolean;
  onUpdateFilter: (filter: Partial<ActiveFilter>) => Promise<void>;
  onResetFilter: () => Promise<void>;
  onUpdateConfig: (config: Partial<DashboardConfig>) => Promise<void>;
  onGoToData: () => void;
}

export function DashboardTab({
  dashboard,
  busy,
  onUpdateFilter,
  onResetFilter,
  onUpdateConfig,
  onGoToData,
}: DashboardTabProps) {
  const [showConfig, setShowConfig] = useState(false);

  if (!dashboard) {
    return (
      <section className="bg-white border border-slate-200/90 rounded-xl p-10 sm:p-14 text-center">
        <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3.5">
          <BarChart3 className="w-6 h-6 text-slate-400" />
        </div>
        <h2 className="text-base font-semibold text-slate-900">Dashboard Belum Tersedia</h2>
        <p className="text-sm text-slate-600 mt-1.5 max-w-md mx-auto leading-relaxed">
          Unggah dataset CSV, muat data simulasi, atau impor dari Google Sheets pada tab Data
          Workspace terlebih dahulu. Dashboard tidak menampilkan angka dummy sebelum data tersedia.
        </p>
        <button
          type="button"
          onClick={onGoToData}
          className="mt-5 min-h-[40px] px-5 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 cursor-pointer"
        >
          Ke Data Workspace
        </button>
      </section>
    );
  }

  const { filter, filterOptions, config } = dashboard;
  const activeCategoryOpt =
    filterOptions.categories.find((c) => c.column === filter.categoryColumn) ??
    filterOptions.categories[0];
  const activePeriodOpt =
    filterOptions.periods.find((p) => p.column === filter.periodColumn) ??
    filterOptions.periods[0];

  const toggleFilterValue = (type: 'category' | 'period', value: string) => {
    if (type === 'category' && activeCategoryOpt) {
      const current = new Set(filter.categoryValues);
      if (current.has(value)) current.delete(value);
      else current.add(value);
      void onUpdateFilter({
        categoryColumn: activeCategoryOpt.column,
        categoryValues: Array.from(current),
      });
    } else if (type === 'period' && activePeriodOpt) {
      const current = new Set(filter.periodValues);
      if (current.has(value)) current.delete(value);
      else current.add(value);
      void onUpdateFilter({
        periodColumn: activePeriodOpt.column,
        periodValues: Array.from(current),
      });
    }
  };

  const hasActiveFilter = filter.categoryValues.length > 0 || filter.periodValues.length > 0;

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Page Header & Action Controls */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Dashboard Kinerja</h1>
          <p className="text-sm text-slate-600 mt-1">
            Perhitungan deterministik server ·{' '}
            <span className="font-mono tabular-nums font-medium text-slate-800">
              {dashboard.filteredRows}/{dashboard.totalRows}
            </span>{' '}
            baris aktif · Filter berlaku sama untuk Dashboard dan Analisis AI
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowConfig((v) => !v)}
            className={`inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-2 text-xs font-medium rounded-lg border whitespace-nowrap cursor-pointer ${
              showConfig
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            {showConfig ? 'Tutup Konfigurasi KPI' : 'Konfigurasi Kolom & KPI'}
          </button>
          <button
            type="button"
            disabled={busy || !hasActiveFilter}
            onClick={() => void onResetFilter()}
            className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Filter
          </button>
        </div>
      </div>

      {/* Filter & KPI Config Panel */}
      <section className="bg-white border border-slate-200/90 rounded-xl p-5 sm:p-6 space-y-5">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {activeCategoryOpt && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  Filter Kategori
                </span>
                {filterOptions.categories.length > 1 && (
                  <select
                    value={activeCategoryOpt.column}
                    disabled={busy}
                    onChange={(e) =>
                      void onUpdateFilter({ categoryColumn: e.target.value, categoryValues: [] })
                    }
                    className="text-xs border border-slate-300 rounded-md px-2.5 py-1 bg-white text-slate-800"
                  >
                    {filterOptions.categories.map((c) => (
                      <option key={c.column} value={c.column}>
                        {c.column}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {activeCategoryOpt.values.map((val) => {
                  const selected = filter.categoryValues.includes(val);
                  return (
                    <button
                      key={val}
                      type="button"
                      disabled={busy}
                      onClick={() => toggleFilterValue('category', val)}
                      className={`min-h-[34px] px-3 py-1.5 text-xs font-medium rounded-lg border whitespace-nowrap cursor-pointer ${
                        selected
                          ? 'bg-blue-700 text-white border-blue-700'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                      }`}
                    >
                      {val}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {activePeriodOpt && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  Filter Periode ({activePeriodOpt.column})
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {activePeriodOpt.values.map((val) => {
                  const selected = filter.periodValues.includes(val);
                  return (
                    <button
                      key={val}
                      type="button"
                      disabled={busy}
                      onClick={() => toggleFilterValue('period', val)}
                      className={`min-h-[34px] px-3 py-1.5 text-xs font-medium font-mono rounded-lg border whitespace-nowrap cursor-pointer ${
                        selected
                          ? 'bg-blue-700 text-white border-blue-700'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                      }`}
                    >
                      {val}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Collapsible KPI & Column Configuration */}
        {showConfig && (
          <div className="pt-5 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Kolom Kategori (Bar Chart)
              </label>
              <select
                value={config.categoryColumn}
                disabled={busy}
                onChange={(e) => void onUpdateConfig({ categoryColumn: e.target.value })}
                className="w-full min-h-[38px] text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white text-slate-900"
              >
                <option value="">Tidak dipilih</option>
                {filterOptions.categories.map((c) => (
                  <option key={c.column} value={c.column}>
                    {c.column}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Kolom Periode (Line Chart)
              </label>
              <select
                value={config.periodColumn}
                disabled={busy}
                onChange={(e) => void onUpdateConfig({ periodColumn: e.target.value })}
                className="w-full min-h-[38px] text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white text-slate-900"
              >
                <option value="">Tidak dipilih</option>
                {filterOptions.periods.map((p) => (
                  <option key={p.column} value={p.column}>
                    {p.column}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Kolom Metrik Tren & Agregasi
              </label>
              <div className="flex gap-2">
                <select
                  value={config.metricColumn}
                  disabled={busy}
                  onChange={(e) => void onUpdateConfig({ metricColumn: e.target.value })}
                  className="flex-1 min-h-[38px] text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white text-slate-900"
                >
                  {filterOptions.numericColumns.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
                <select
                  value={config.aggregation}
                  disabled={busy}
                  onChange={(e) =>
                    void onUpdateConfig({
                      aggregation: e.target.value as DashboardConfig['aggregation'],
                    })
                  }
                  className="w-28 min-h-[38px] text-sm border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-900"
                >
                  <option value="sum">Jumlah</option>
                  <option value="mean">Rata-rata</option>
                  <option value="median">Median</option>
                  <option value="min">Min</option>
                  <option value="max">Maks</option>
                  <option value="count">Hitung</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Kolom Target KPI
              </label>
              <select
                value={config.targetColumn}
                disabled={busy}
                onChange={(e) => void onUpdateConfig({ targetColumn: e.target.value })}
                className="w-full min-h-[38px] text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white text-slate-900"
              >
                <option value="">Tidak digunakan</option>
                {filterOptions.numericColumns.map((col) => (
                  <option key={col} value={col}>
                    {col}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Kolom Realisasi KPI
              </label>
              <select
                value={config.realisasiColumn}
                disabled={busy}
                onChange={(e) => void onUpdateConfig({ realisasiColumn: e.target.value })}
                className="w-full min-h-[38px] text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white text-slate-900"
              >
                <option value="">Tidak digunakan</option>
                {filterOptions.numericColumns.map((col) => (
                  <option key={col} value={col}>
                    {col}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <label className="flex items-center gap-2.5 text-xs text-slate-800 py-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.kpiConfirmed}
                  disabled={busy || !config.targetColumn || !config.realisasiColumn}
                  onChange={(e) => void onUpdateConfig({ kpiConfirmed: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-blue-700"
                />
                <span>Konfirmasi KPI Capaian (Realisasi / Target × 100%)</span>
              </label>
            </div>
          </div>
        )}
      </section>

      {/* Empty Filter Subset State */}
      {dashboard.isEmptySubset ? (
        <section className="bg-white border border-slate-200/90 rounded-xl p-10 sm:p-12 text-center">
          <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center mx-auto mb-3">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <h2 className="text-base font-semibold text-slate-900">
            Tidak Ada Data pada Kombinasi Filter Ini
          </h2>
          <p className="text-sm text-slate-600 mt-1.5 max-w-md mx-auto">
            Kombinasi filter aktif menghasilkan 0 baris observasi. Ubah pilihan filter atau tekan
            Reset Filter untuk kembali melihat keseluruhan data.
          </p>
          <button
            type="button"
            onClick={() => void onResetFilter()}
            className="mt-5 min-h-[40px] px-5 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 cursor-pointer"
          >
            Reset Filter
          </button>
        </section>
      ) : (
        <>
          {/* KPI Metric Grid (Single Elevation, Crisp Tabular Figures) */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {dashboard.kpis.map((kpi) => (
              <div
                key={kpi.key}
                className="bg-white border border-slate-200/90 rounded-xl p-5 sm:p-6 flex flex-col justify-between"
              >
                <p className="text-xs font-semibold text-slate-500">{kpi.label}</p>
                <p className="text-3xl font-semibold text-slate-900 font-mono tabular-nums tracking-tight mt-2.5">
                  {kpi.formattedValue}
                </p>
                <p className="text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100">
                  {kpi.note ? `${kpi.note} · ` : `${kpi.validCount} observasi valid · `}
                  <span className="font-mono text-[11px]">{kpi.resultId}</span>
                </p>
              </div>
            ))}
          </section>

          {/* Charts Grid: Category Bar + Period Line */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {dashboard.categoryChart && <ChartRenderer chart={dashboard.categoryChart} />}
            {dashboard.periodChart && <ChartRenderer chart={dashboard.periodChart} />}
          </section>

          {/* Validated Qualitative Theme Distribution */}
          {dashboard.themeDistribution && (
            <section className="bg-white border border-slate-200/90 rounded-xl p-5 sm:p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-slate-100">
                <div>
                  <h2 className="text-[15px] font-semibold text-slate-900">
                    Distribusi Tema Masukan Masyarakat ({dashboard.themeDistribution.column})
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Penyebut: {dashboard.themeDistribution.denominator} respons diklasifikasikan ·{' '}
                    <span className="font-mono">{dashboard.themeDistribution.resultId}</span>
                  </p>
                </div>
                <p className="text-xs font-semibold text-amber-800">
                  {dashboard.themeDistribution.humanReviewLabel}
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                {dashboard.themeChart && <ChartRenderer chart={dashboard.themeChart} height={270} />}
                <div className="overflow-x-auto border border-slate-200 rounded-lg table-scroll">
                  <table className="w-full text-sm text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                        <th className="py-3 px-4">Tema</th>
                        <th className="py-3 px-4 text-right">Jumlah</th>
                        <th className="py-3 px-4 text-right">Persentase</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {dashboard.themeDistribution.themes.map((t) => (
                        <tr key={t.theme} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4 font-medium text-slate-900">{t.theme}</td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-800">
                            {t.count}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-800">
                            {t.percentage.toFixed(2).replace('.', ',')}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
