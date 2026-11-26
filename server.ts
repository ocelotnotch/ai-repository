import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';
import { buildDeterministicDashboard } from './src/server/analyticalTools.ts';
import { datasetStore } from './src/server/datasetStore.ts';
import { runAgentAnalysis } from './src/server/geminiAgent.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SAMPLE_CSV_FILENAME = 'dummy_kinerja_pelayanan_publik_a34928a3.csv';
const SAMPLE_CSV_PATH = path.resolve(
  __dirname,
  'public',
  'assets',
  'aistudio',
  SAMPLE_CSV_FILENAME
);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '2mb' }));

  // GET /api/workspace — Current in-memory workspace state
  app.get('/api/workspace', (_req, res) => {
    const active = datasetStore.getActive();
    if (!active) {
      res.json({
        active: false,
        profile: null,
        dashboard: null,
        approvedTextColumns: [],
      });
      return;
    }

    res.json({
      active: true,
      profile: active.profile,
      dashboard: buildDeterministicDashboard(),
      approvedTextColumns: Array.from(active.approvedTextColumns),
    });
  });

  // POST /api/dataset/upload — Strict CSV UTF-8 upload & profiling (FR-01, FR-02)
  app.post('/api/dataset/upload', (req, res) => {
    try {
      const { fileName, base64Content, safeDataConfirmed } = req.body ?? {};
      if (typeof fileName !== 'string' || typeof base64Content !== 'string') {
        res.status(400).json({ error: 'Permintaan upload tidak lengkap (fileName dan isi file wajib dikirim).' });
        return;
      }

      const buffer = Buffer.from(base64Content, 'base64');
      const profile = datasetStore.uploadCsvBuffer(fileName, buffer, Boolean(safeDataConfirmed));
      const active = datasetStore.getActive();

      res.json({
        profile,
        dashboard: buildDeterministicDashboard(),
        approvedTextColumns: active ? Array.from(active.approvedTextColumns) : [],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memproses file CSV.';
      res.status(400).json({ error: msg });
    }
  });

  // POST /api/dataset/load-sample — Load attached simulated public service CSV through exact same parser/validator
  app.post('/api/dataset/load-sample', (req, res) => {
    try {
      const { safeDataConfirmed } = req.body ?? {};
      if (!fs.existsSync(SAMPLE_CSV_PATH)) {
        res.status(404).json({ error: 'File dataset simulasi tidak ditemukan di server.' });
        return;
      }
      const buffer = fs.readFileSync(SAMPLE_CSV_PATH);
      const profile = datasetStore.uploadCsvBuffer(
        'dummy_kinerja_pelayanan_publik.csv',
        buffer,
        Boolean(safeDataConfirmed)
      );
      const active = datasetStore.getActive();

      res.json({
        profile,
        dashboard: buildDeterministicDashboard(),
        approvedTextColumns: active ? Array.from(active.approvedTextColumns) : [],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memuat dataset simulasi.';
      res.status(400).json({ error: msg });
    }
  });

  // POST /api/dataset/import-sheet — Import a Google Sheets tab using client-supplied OAuth Bearer token
  app.post('/api/dataset/import-sheet', async (req, res) => {
    try {
      const authHeader = req.headers.authorization ?? '';
      const tokenMatch = authHeader.match(/^Bearer\s+([A-Za-z0-9._~+/-]+=*)$/);
      if (!tokenMatch) {
        res.status(401).json({ error: 'Token otorisasi Google tidak ditemukan atau tidak valid. Silakan masuk kembali dengan Google.' });
        return;
      }

      const { spreadsheetId, spreadsheetTitle, sheetName, safeDataConfirmed } = req.body ?? {};
      if (!safeDataConfirmed) {
        res.status(400).json({
          error: 'Konfirmasi keamanan data wajib dicentang (pastikan data sintetis/anonim dan bebas informasi sensitif).',
        });
        return;
      }
      if (typeof spreadsheetId !== 'string' || !/^[a-zA-Z0-9_-]{10,120}$/.test(spreadsheetId.trim())) {
        res.status(400).json({ error: 'ID Google Sheets tidak valid.' });
        return;
      }
      if (typeof sheetName !== 'string' || sheetName.trim().length === 0 || sheetName.length > 200) {
        res.status(400).json({ error: 'Nama tab sheet tidak valid.' });
        return;
      }

      const cleanId = spreadsheetId.trim();
      const cleanSheetName = sheetName.trim();
      const escapedSheetName = `'${cleanSheetName.replace(/'/g, "''")}'`;
      const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        cleanId
      )}/values/${encodeURIComponent(escapedSheetName)}?valueRenderOption=FORMATTED_VALUE`;

      const sheetsResp = await fetch(sheetsUrl, {
        headers: { Authorization: `Bearer ${tokenMatch[1]}` },
      });

      if (sheetsResp.status === 401) {
        res.status(401).json({ error: 'Sesi Google Anda berakhir. Silakan masuk kembali dengan Google.' });
        return;
      }

      const sheetsData = (await sheetsResp.json()) as {
        values?: string[][];
        error?: { message?: string };
      };
      if (!sheetsResp.ok) {
        res.status(400).json({
          error: sheetsData?.error?.message || 'Gagal membaca data dari Google Sheets API.',
        });
        return;
      }

      const rawValues = Array.isArray(sheetsData.values) ? sheetsData.values : [];
      if (rawValues.length < 2) {
        res.status(400).json({
          error: 'Tab Google Sheets harus memiliki baris header dan minimal 1 baris data.',
        });
        return;
      }

      const headerRow = rawValues[0].map((cell) => String(cell ?? '').trim());
      const headerWidth = headerRow.length;

      // Preserve genuine missing trailing cells while rejecting rows wider than headers
      const normalizedRows: string[][] = [headerRow];
      for (let i = 1; i < rawValues.length; i++) {
        const row = rawValues[i].map((cell) => String(cell ?? ''));
        if (row.every((c) => c.trim() === '')) continue;
        if (row.length > headerWidth) {
          res.status(400).json({
            error: `Struktur kolom tidak konsisten pada baris ke-${i + 1} (${row.length} kolom, header hanya ${headerWidth} kolom). Dataset aktif sebelumnya tetap dipertahankan.`,
          });
          return;
        }
        while (row.length < headerWidth) {
          row.push('');
        }
        normalizedRows.push(row);
      }

      if (normalizedRows.length < 2) {
        res.status(400).json({ error: 'Tab Google Sheets tidak memiliki baris data non-kosong.' });
        return;
      }

      const csvText = Papa.unparse(normalizedRows);
      const buffer = Buffer.from(csvText, 'utf8');
      const displayTitle =
        typeof spreadsheetTitle === 'string' && spreadsheetTitle.trim().length > 0
          ? spreadsheetTitle.trim().replace(/[\\/:*?"<>|]+/g, ' ')
          : cleanId;
      const syntheticCsvName = `${displayTitle} - ${cleanSheetName}.csv`;

      const profile = datasetStore.uploadCsvBuffer(syntheticCsvName, buffer, Boolean(safeDataConfirmed));
      const active = datasetStore.getActive();

      res.json({
        profile,
        dashboard: buildDeterministicDashboard(),
        approvedTextColumns: active ? Array.from(active.approvedTextColumns) : [],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mengimpor Google Sheets.';
      res.status(400).json({ error: msg });
    }
  });

  // POST /api/dataset/reset — Reset workspace (clear read-only dataset & temporary results)
  app.post('/api/dataset/reset', (_req, res) => {
    datasetStore.resetWorkspace();
    res.json({ ok: true });
  });

  // POST /api/filter — Update active filter (FR-04)
  app.post('/api/filter', (req, res) => {
    try {
      const { categoryColumn, categoryValues, periodColumn, periodValues } = req.body ?? {};
      datasetStore.updateFilter({
        categoryColumn,
        categoryValues,
        periodColumn,
        periodValues,
      });
      res.json({
        dashboard: buildDeterministicDashboard(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memperbarui filter.';
      res.status(400).json({ error: msg });
    }
  });

  // POST /api/filter/reset — Reset active filter
  app.post('/api/filter/reset', (_req, res) => {
    try {
      datasetStore.resetFilter();
      res.json({
        dashboard: buildDeterministicDashboard(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mereset filter.';
      res.status(400).json({ error: msg });
    }
  });

  // POST /api/dashboard/config — Update KPI & chart column configuration (FR-03)
  app.post('/api/dashboard/config', (req, res) => {
    try {
      datasetStore.updateDashboardConfig(req.body ?? {});
      res.json({
        dashboard: buildDeterministicDashboard(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memperbarui konfigurasi dashboard.';
      res.status(400).json({ error: msg });
    }
  });

  // POST /api/text-columns/approve — Confirm safe text columns for qualitative analysis (NFR-01 / GR-04)
  app.post('/api/text-columns/approve', (req, res) => {
    try {
      const columns = Array.isArray(req.body?.columns) ? req.body.columns.map(String) : [];
      const approved = datasetStore.setApprovedTextColumns(columns);
      res.json({ approvedTextColumns: approved });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan konfirmasi kolom teks.';
      res.status(400).json({ error: msg });
    }
  });

  // POST /api/agent/analyze — Run real Gemini AI Agent Goal -> Decide -> Act -> Observe -> Evaluate
  app.post('/api/agent/analyze', async (req, res) => {
    try {
      const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
      if (!question) {
        res.status(400).json({ error: 'Pertanyaan analisis tidak boleh kosong.' });
        return;
      }
      if (question.length > 1000) {
        res.status(400).json({ error: 'Pertanyaan terlalu panjang (maksimal 1.000 karakter).' });
        return;
      }
      if (!datasetStore.getActive()) {
        res.status(400).json({ error: 'Unggah dataset CSV terlebih dahulu sebelum menjalankan analisis AI.' });
        return;
      }

      const analysis = await runAgentAnalysis(question);
      const dashboard = buildDeterministicDashboard();
      res.json({ analysis, dashboard });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan saat menjalankan AI Agent.';
      res.status(500).json({ error: msg });
    }
  });

  // Vite middleware for development; static dist serving for production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
