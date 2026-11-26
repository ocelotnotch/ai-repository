import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ChartSpec } from '../shared/types';

interface ChartRendererProps {
  chart: ChartSpec;
  height?: number;
}

function formatTooltipVal(value: number, unit: string): string {
  const formatted = new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: 2,
  }).format(value);
  return unit ? `${formatted} ${unit}` : formatted;
}

export function ChartRenderer({ chart, height = 300 }: ChartRendererProps) {
  const isBar = chart.chartType === 'bar';

  return (
    <div className="bg-white border border-slate-200/90 rounded-xl p-5 sm:p-6">
      <div className="pb-4 mb-4 border-b border-slate-100">
        <h3 className="text-[15px] font-semibold text-slate-900 leading-snug">{chart.title}</h3>
        <p className="text-xs text-slate-500 mt-1">
          {chart.xLabel} / {chart.yLabel}
          {chart.unit ? ` (${chart.unit})` : ''}
          <span aria-hidden="true" className="mx-1.5">·</span>
          <span className="font-mono text-[11px]">{chart.resultId}</span>
        </p>
      </div>

      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          {isBar ? (
            <BarChart data={chart.data} margin={{ top: 10, right: 12, left: 0, bottom: 18 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12, fill: '#475569' }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
                interval={0}
                angle={chart.data.length > 4 ? -18 : 0}
                textAnchor={chart.data.length > 4 ? 'end' : 'middle'}
                height={chart.data.length > 4 ? 56 : 30}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'IBM Plex Mono, monospace' }}
                axisLine={false}
                tickLine={false}
                width={54}
              />
              <Tooltip
                cursor={{ fill: '#f1f5f9' }}
                contentStyle={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  boxShadow: '0 6px 18px rgba(15, 23, 42, 0.08)',
                  fontSize: '12px',
                  padding: '8px 12px',
                  color: '#0f172a',
                }}
                labelStyle={{ fontWeight: 600, color: '#0f172a', marginBottom: '2px' }}
                formatter={(val: unknown) => [
                  formatTooltipVal(Number(val ?? 0), chart.unit),
                  chart.yLabel,
                ]}
              />
              <Bar dataKey="value" fill="#1d4ed8" radius={[5, 5, 0, 0]} maxBarSize={48} />
            </BarChart>
          ) : (
            <LineChart data={chart.data} margin={{ top: 10, right: 16, left: 0, bottom: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12, fill: '#475569' }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'IBM Plex Mono, monospace' }}
                axisLine={false}
                tickLine={false}
                width={54}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  boxShadow: '0 6px 18px rgba(15, 23, 42, 0.08)',
                  fontSize: '12px',
                  padding: '8px 12px',
                  color: '#0f172a',
                }}
                labelStyle={{ fontWeight: 600, color: '#0f172a', marginBottom: '2px' }}
                formatter={(val: unknown) => [
                  formatTooltipVal(Number(val ?? 0), chart.unit),
                  chart.yLabel,
                ]}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#1d4ed8"
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#1d4ed8', stroke: '#ffffff', strokeWidth: 2 }}
                activeDot={{ r: 6, fill: '#1e40af', stroke: '#ffffff', strokeWidth: 2 }}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
