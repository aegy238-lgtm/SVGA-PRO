#!/usr/bin/env node
/**
 * SVGA520 Local Desktop Agent (Zero-Dependency Node.js Runtime)
 * Binds strictly to http://127.0.0.1:45200
 * All indexing, visual feature extraction, and comparisons run locally on this machine.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { execFile } from 'node:child_process';

const PORT = Number(process.env.SVGA520_AGENT_PORT || 45200);
const DATA_DIR =
  process.env.SVGA520_AGENT_DATA_DIR ||
  path.join(
    process.platform === 'win32'
      ? process.env.LOCALAPPDATA || os.homedir()
      : path.join(os.homedir(), '.local', 'share'),
    'SVGA520LocalAgent'
  );
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const INDEX_PATH = path.join(DATA_DIR, 'index.json');

const SUPPORTED_EXTS = new Set([
  '.svga',
  '.pag',
  '.vap',
  '.yyeva',
  '.mp4',
  '.mov',
  '.webm',
  '.gif',
  '.webp',
  '.apng',
  '.png',
  '.jpg',
  '.jpeg',
  '.lottie',
  '.json',
]);

fs.mkdirSync(DATA_DIR, { recursive: true });

function loadConfig() {
  let cfg = null;
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch {}
  }
  if (!cfg || typeof cfg !== 'object') cfg = {};
  if (!cfg.token) cfg.token = crypto.randomBytes(24).toString('hex');
  if (!cfg.pairingCode) cfg.pairingCode = String(crypto.randomInt(100000, 999999));
  if (!Array.isArray(cfg.allowedFolders)) cfg.allowedFolders = [];
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
  return cfg;
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
}

function loadIndex() {
  if (fs.existsSync(INDEX_PATH)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
      if (parsed && Array.isArray(parsed.items)) return parsed;
    } catch {}
  }
  return { lastIndexedAt: null, lastScanDurationMs: 0, items: [] };
}

function saveIndex(idx) {
  fs.writeFileSync(INDEX_PATH, JSON.stringify(idx), 'utf8');
}

const config = loadConfig();
let indexStore = loadIndex();
let isIndexing = false;

function isPathAuthorized(targetPath) {
  if (!targetPath || !config.allowedFolders.length) return false;
  const hasTraversal = /(^|[\\/])\.\.([\\/]|$)/.test(targetPath);
  if (hasTraversal) return false;
  const resolvedTarget = path.resolve(targetPath);
  return config.allowedFolders.some((folder) => {
    const resolvedFolder = path.resolve(folder);
    if (process.platform === 'win32') {
      const a = resolvedTarget.toLowerCase();
      const b = resolvedFolder.toLowerCase();
      return a === b || a.startsWith(b.endsWith('\\') ? b : b + '\\');
    }
    return (
      resolvedTarget === resolvedFolder ||
      resolvedTarget.startsWith(resolvedFolder.endsWith('/') ? resolvedFolder : resolvedFolder + '/')
    );
  });
}

// Lightweight Pure-JS PNG RGBA Decoder (supports RGB colorType 2 and RGBA colorType 6, bitDepth 8)
function decodePngBuffer(buf) {
  if (
    buf.length < 33 ||
    buf[0] !== 0x89 ||
    buf[1] !== 0x50 ||
    buf[2] !== 0x4e ||
    buf[3] !== 0x47
  ) {
    return null;
  }
  let width = 0;
  let height = 0;
  let bitDepth = 8;
  let colorType = 6;
  const idatChunks = [];
  let offset = 8;
  while (offset + 8 <= buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString('ascii');
    const dataStart = offset + 8;
    const dataEnd = dataStart + len;
    if (dataEnd > buf.length) break;
    const chunkData = buf.subarray(dataStart, dataEnd);
    if (type === 'IHDR' && chunkData.length >= 13) {
      width = chunkData.readUInt32BE(0);
      height = chunkData.readUInt32BE(4);
      bitDepth = chunkData[8];
      colorType = chunkData[9];
    } else if (type === 'IDAT') {
      idatChunks.push(chunkData);
    } else if (type === 'IEND') {
      break;
    }
    offset = dataEnd + 4;
  }
  if (!width || !height || bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) {
    return null;
  }
  let raw;
  try {
    raw = zlib.inflateSync(Buffer.concat(idatChunks));
  } catch {
    return null;
  }
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const prevRow = new Uint8Array(stride);
  const currRow = new Uint8Array(stride);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * (stride + 1);
    if (rowOffset >= raw.length) break;
    const filterType = raw[rowOffset];
    for (let i = 0; i < stride; i++) {
      const xByte = raw[rowOffset + 1 + i] || 0;
      const a = i >= bpp ? currRow[i - bpp] : 0;
      const b = prevRow[i];
      const c = i >= bpp ? prevRow[i - bpp] : 0;
      let val = xByte;
      if (filterType === 1) val = (xByte + a) & 0xff;
      else if (filterType === 2) val = (xByte + b) & 0xff;
      else if (filterType === 3) val = (xByte + ((a + b) >> 1)) & 0xff;
      else if (filterType === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        val = (xByte + pr) & 0xff;
      }
      currRow[i] = val;
    }
    for (let x = 0; x < width; x++) {
      const outIdx = (y * width + x) * 4;
      const inIdx = x * bpp;
      rgba[outIdx] = currRow[inIdx];
      rgba[outIdx + 1] = currRow[inIdx + 1];
      rgba[outIdx + 2] = currRow[inIdx + 2];
      rgba[outIdx + 3] = bpp === 4 ? currRow[inIdx + 3] : 255;
    }
    prevRow.set(currRow);
  }
  return { width, height, rgba };
}

function downsampleRgbaGrid(rgba, srcW, srcH, dstW, dstH) {
  const total = dstW * dstH;
  const rOut = new Array(total).fill(0);
  const gOut = new Array(total).fill(0);
  const bOut = new Array(total).fill(0);
  const lumaOut = new Array(total).fill(0);
  let fg = 0;
  let countAll = 0;
  for (let dy = 0; dy < dstH; dy++) {
    const y0 = Math.floor((dy * srcH) / dstH);
    const y1 = Math.max(y0 + 1, Math.floor(((dy + 1) * srcH) / dstH));
    for (let dx = 0; dx < dstW; dx++) {
      const x0 = Math.floor((dx * srcW) / dstW);
      const x1 = Math.max(x0 + 1, Math.floor(((dx + 1) * srcW) / dstW));
      let sr = 0,
        sg = 0,
        sb = 0,
        cnt = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const idx = (sy * srcW + sx) * 4;
          const a = (rgba[idx + 3] ?? 255) / 255;
          if (a > 0.1) fg++;
          countAll++;
          sr += (rgba[idx] ?? 0) * a + 11 * (1 - a);
          sg += (rgba[idx + 1] ?? 0) * a + 14 * (1 - a);
          sb += (rgba[idx + 2] ?? 0) * a + 26 * (1 - a);
          cnt++;
        }
      }
      const outIdx = dy * dstW + dx;
      const ar = Math.round(sr / Math.max(1, cnt));
      const ag = Math.round(sg / Math.max(1, cnt));
      const ab = Math.round(sb / Math.max(1, cnt));
      rOut[outIdx] = ar;
      gOut[outIdx] = ag;
      bOut[outIdx] = ab;
      lumaOut[outIdx] = 0.299 * ar + 0.587 * ag + 0.114 * ab;
    }
  }
  return { r: rOut, g: gOut, b: bOut, luma: lumaOut, foregroundRatio: countAll ? fg / countAll : 0 };
}

function bitsToHex64(bits) {
  let hex = '';
  for (let n = 0; n < 16; n++) {
    let val = 0;
    for (let b = 0; b < 4; b++) if (bits[n * 4 + b]) val |= 1 << (3 - b);
    hex += val.toString(16);
  }
  return hex;
}

function computeFeatures(rgba, width, height) {
  const g98 = downsampleRgbaGrid(rgba, width, height, 9, 8);
  const dBits = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      dBits.push(g98.luma[y * 9 + x] > g98.luma[y * 9 + x + 1] ? 1 : 0);
    }
  }
  const g88 = downsampleRgbaGrid(rgba, width, height, 8, 8);
  const mean = g88.luma.reduce((a, b) => a + b, 0) / 64;
  const aBits = g88.luma.map((v) => (v >= mean ? 1 : 0));
  const colorGrid = [];
  const hist = new Array(24).fill(0);
  let active = 0;
  for (let i = 0; i < 64; i++) {
    const r = g88.r[i],
      g = g88.g[i],
      b = g88.b[i];
    colorGrid.push(r, g, b);
    if (r + g + b > 48) {
      hist[Math.min(7, r >> 5)]++;
      hist[8 + Math.min(7, g >> 5)]++;
      hist[16 + Math.min(7, b >> 5)]++;
      active++;
    }
  }
  const denom = Math.max(1, active);
  return {
    dHash: bitsToHex64(dBits),
    aHash: bitsToHex64(aBits),
    colorGrid,
    colorHist: hist.map((v) => Math.round((v / denom) * 1000)),
    aspectRatio: height > 0 ? Number((width / height).toFixed(3)) : 1,
    foregroundRatio: Number(g88.foregroundRatio.toFixed(3)),
  };
}

function extractSvgaBestPng(filePath) {
  let bytes = fs.readFileSync(filePath);
  if (bytes.length > 2 && bytes[0] === 0x78) {
    try {
      bytes = zlib.inflateSync(bytes);
    } catch {}
  }
  let best = null;
  let bestArea = 0;
  for (let i = 0; i < bytes.length - 24; i++) {
    if (
      bytes[i] === 0x89 &&
      bytes[i + 1] === 0x50 &&
      bytes[i + 2] === 0x4e &&
      bytes[i + 3] === 0x47
    ) {
      let end = -1;
      for (let j = i + 8; j < bytes.length - 7; j++) {
        if (
          bytes[j] === 0x49 &&
          bytes[j + 1] === 0x45 &&
          bytes[j + 2] === 0x4e &&
          bytes[j + 3] === 0x44 &&
          bytes[j + 4] === 0xae &&
          bytes[j + 5] === 0x42 &&
          bytes[j + 6] === 0x60 &&
          bytes[j + 7] === 0x82
        ) {
          end = j + 8;
          break;
        }
      }
      if (end > i + 24) {
        const pngBuf = bytes.subarray(i, end);
        const decoded = decodePngBuffer(pngBuf);
        if (decoded && decoded.width * decoded.height > bestArea) {
          bestArea = decoded.width * decoded.height;
          best = { decoded, pngBase64: Buffer.from(pngBuf).toString('base64') };
        }
        i = end - 1;
      }
    }
  }
  return best;
}

function walkFiles(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(full, out);
    else if (e.isFile()) out.push(full);
  }
  return out;
}

function rebuildIndex() {
  if (isIndexing) return indexStore.items.length;
  isIndexing = true;
  const started = Date.now();
  const nextItems = [];
  try {
    for (const folder of config.allowedFolders) {
      if (!fs.existsSync(folder)) continue;
      for (const filePath of walkFiles(folder)) {
        const ext = path.extname(filePath).toLowerCase();
        if (!SUPPORTED_EXTS.has(ext)) continue;
        const st = fs.statSync(filePath);
        let width = 0,
          height = 0,
          frames = [],
          thumbnailDataUrl = '';
        if (ext === '.png') {
          const buf = fs.readFileSync(filePath);
          const decoded = decodePngBuffer(buf);
          if (decoded) {
            width = decoded.width;
            height = decoded.height;
            frames = [computeFeatures(decoded.rgba, width, height)];
            if (buf.length < 350000) {
              thumbnailDataUrl = 'data:image/png;base64,' + buf.toString('base64');
            }
          }
        } else if (ext === '.svga') {
          const hit = extractSvgaBestPng(filePath);
          if (hit) {
            width = hit.decoded.width;
            height = hit.decoded.height;
            frames = [computeFeatures(hit.decoded.rgba, width, height)];
            thumbnailDataUrl = 'data:image/png;base64,' + hit.pngBase64;
          }
        }
        const name = path.basename(filePath);
        const tokens = name
          .toLowerCase()
          .replace(/\.[^.]+$/, '')
          .split(/[^a-z0-9\u0600-\u06ff]+/i)
          .filter((t) => t.length >= 2);
        nextItems.push({
          id: Buffer.from(filePath).toString('base64url'),
          name,
          path: filePath,
          folder,
          format: ext.slice(1).toUpperCase(),
          sizeBytes: st.size,
          modifiedAt: st.mtime.toISOString(),
          width,
          height,
          frames,
          thumbnailDataUrl,
          tokens,
        });
      }
    }
    indexStore = {
      lastIndexedAt: new Date().toISOString(),
      lastScanDurationMs: Date.now() - started,
      items: nextItems,
    };
    saveIndex(indexStore);
    return nextItems.length;
  } finally {
    isIndexing = false;
  }
}

function hammingHex(a, b) {
  if (!a || !b || a.length !== b.length) return 64;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x > 0) {
      dist += x & 1;
      x >>= 1;
    }
  }
  return dist;
}

function cosineSim(a, b) {
  if (!a?.length || a.length !== b?.length) return 0;
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? Math.max(0, Math.min(1, dot / (Math.sqrt(na) * Math.sqrt(nb)))) : 0;
}

function histInter(a, b) {
  if (a?.length !== 24 || b?.length !== 24) return 0;
  let mn = 0,
    mx = 0;
  for (let i = 0; i < 24; i++) {
    mn += Math.min(a[i], b[i]);
    mx += Math.max(a[i], b[i]);
  }
  return mx > 0 ? mn / mx : 0;
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        resolve({});
      }
    });
  });
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  if (origin) res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-SVGA520-Token');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
  const clientToken = req.headers['x-svga520-token'] || '';
  const isAuth = clientToken === config.token;

  if (url.pathname === '/status' && req.method === 'GET') {
    sendJson(res, 200, {
      online: true,
      version: '1.0.0',
      os: process.platform === 'win32' ? 'Windows 10/11' : os.platform(),
      requiresPairing: true,
      paired: isAuth,
      folderCount: config.allowedFolders.length,
      indexedCount: indexStore.items.length,
      isIndexing,
      lastIndexedAt: indexStore.lastIndexedAt,
      lastScanDurationMs: indexStore.lastScanDurationMs,
    });
    return;
  }

  if (url.pathname === '/pair' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const pin = String(body.pairingCode || '').trim();
    if (pin === config.pairingCode || pin === config.token) {
      sendJson(res, 200, { success: true, token: config.token });
    } else {
      sendJson(res, 403, { error: 'Invalid Pairing Code' });
    }
    return;
  }

  if (!isAuth) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return;
  }

  const buildFolders = () =>
    config.allowedFolders.map((f) => ({
      path: f,
      fileCount: indexStore.items.filter((i) => i.folder === f).length,
      addedAt: indexStore.lastIndexedAt || new Date().toISOString(),
    }));

  if (url.pathname === '/folders' && req.method === 'GET') {
    sendJson(res, 200, { folders: buildFolders() });
    return;
  }

  if (url.pathname === '/folders/add' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const p = String(body.path || '').trim();
    if (!p || !fs.existsSync(p) || !fs.statSync(p).isDirectory()) {
      sendJson(res, 400, { error: 'Folder path does not exist' });
      return;
    }
    const resolved = path.resolve(p);
    if (!config.allowedFolders.includes(resolved)) {
      config.allowedFolders.push(resolved);
      saveConfig(config);
    }
    rebuildIndex();
    sendJson(res, 200, { added: resolved, folders: buildFolders() });
    return;
  }

  if (url.pathname === '/folders/pick' && req.method === 'POST') {
    if (process.platform === 'win32') {
      execFile(
        'powershell.exe',
        [
          '-NoProfile',
          '-STA',
          '-Command',
          'Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; if($d.ShowDialog() -eq "OK"){ Write-Output $d.SelectedPath }',
        ],
        (err, stdout) => {
          const picked = String(stdout || '').trim();
          if (err || !picked) {
            sendJson(res, 200, { canceled: true, folders: buildFolders() });
            return;
          }
          const resolved = path.resolve(picked);
          if (!config.allowedFolders.includes(resolved)) {
            config.allowedFolders.push(resolved);
            saveConfig(config);
          }
          rebuildIndex();
          sendJson(res, 200, { added: resolved, folders: buildFolders() });
        }
      );
      return;
    }
    sendJson(res, 200, { canceled: true, folders: buildFolders() });
    return;
  }

  if (url.pathname === '/folders/remove' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const resolved = body.path ? path.resolve(String(body.path)) : '';
    config.allowedFolders = config.allowedFolders.filter((f) => f !== resolved);
    indexStore.items = indexStore.items.filter((i) => i.folder !== resolved);
    saveConfig(config);
    saveIndex(indexStore);
    sendJson(res, 200, { folders: buildFolders() });
    return;
  }

  if (url.pathname === '/index/rebuild' && req.method === 'POST') {
    const cnt = rebuildIndex();
    sendJson(res, 200, { indexedCount: cnt, durationMs: indexStore.lastScanDurationMs });
    return;
  }

  if (url.pathname === '/search' && req.method === 'POST') {
    const started = Date.now();
    const body = await readJsonBody(req);
    const qFrames = Array.isArray(body.queryFrames) ? body.queryFrames : [];
    const textQuery = String(body.textQuery || '');
    const fmtFilter = String(body.formatFilter || 'ALL').toUpperCase();
    const limit = Math.max(1, Math.min(100, Number(body.limit || 36)));
    const qTokens = textQuery
      .toLowerCase()
      .split(/[^a-z0-9\u0600-\u06ff]+/i)
      .filter((t) => t.length >= 2);

    const results = indexStore.items
      .filter((c) => fmtFilter === 'ALL' || c.format.toUpperCase() === fmtFilter)
      .map((cand) => {
        let bestVis = 0,
          bestVh = 0,
          bestSc = 0,
          bestHi = 0,
          bestAs = 0;
        for (const qf of qFrames) {
          for (const cf of cand.frames || []) {
            const vh =
              (1 - hammingHex(qf.dHash, cf.dHash) / 64) * 0.62 +
              (1 - hammingHex(qf.aHash, cf.aHash) / 64) * 0.38;
            const sc = cosineSim(qf.colorGrid, cf.colorGrid);
            const hi = histInter(qf.colorHist, cf.colorHist);
            const mx = Math.max(qf.aspectRatio || 1, cf.aspectRatio || 1);
            const mn = Math.min(qf.aspectRatio || 1, cf.aspectRatio || 1);
            const ar = mx > 0 ? mn / mx : 1;
            const comb = vh * 0.44 + sc * 0.31 + hi * 0.17 + ar * 0.08;
            if (comb > bestVis) {
              bestVis = comb;
              bestVh = vh;
              bestSc = sc;
              bestHi = hi;
              bestAs = ar;
            }
          }
        }
        let txtScore = 0;
        if (qTokens.length > 0) {
          const hay = `${cand.name} ${cand.folder} ${cand.format}`.toLowerCase();
          txtScore = qTokens.filter((tk) => hay.includes(tk)).length / qTokens.length;
        }
        const finalRatio =
          qFrames.length === 0 && qTokens.length > 0
            ? txtScore
            : qTokens.length > 0
            ? bestVis * 0.8 + txtScore * 0.2
            : bestVis;
        return {
          id: cand.id,
          name: cand.name,
          path: cand.path,
          folder: cand.folder,
          format: cand.format,
          sizeBytes: cand.sizeBytes,
          modifiedAt: cand.modifiedAt,
          width: cand.width,
          height: cand.height,
          thumbnailDataUrl: cand.thumbnailDataUrl,
          score: Math.max(0, Math.min(100, Math.round(finalRatio * 100))),
          matchBreakdown: {
            visualHashScore: Math.round(bestVh * 100),
            spatialColorScore: Math.round(bestSc * 100),
            histogramScore: Math.round(bestHi * 100),
            aspectScore: Math.round(bestAs * 100),
            textScore: Math.round(txtScore * 100),
          },
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    sendJson(res, 200, {
      results,
      searchedCount: indexStore.items.length,
      durationMs: Date.now() - started,
    });
    return;
  }

  if (url.pathname === '/open-location' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const target = String(body.path || '');
    if (!isPathAuthorized(target) || !fs.existsSync(target)) {
      sendJson(res, 403, { error: 'Access denied: path outside authorized folders.' });
      return;
    }
    if (process.platform === 'win32') {
      execFile('explorer.exe', [`/select,${target}`], () => {});
    }
    sendJson(res, 200, { success: true });
    return;
  }

  if (url.pathname === '/open-file' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const target = String(body.path || '');
    if (!isPathAuthorized(target) || !fs.existsSync(target)) {
      sendJson(res, 403, { error: 'Access denied: path outside authorized folders.' });
      return;
    }
    if (process.platform === 'win32') {
      execFile('cmd.exe', ['/c', 'start', '', target], () => {});
    }
    sendJson(res, 200, { success: true });
    return;
  }

  if (url.pathname === '/file-stream' && req.method === 'GET') {
    const target = url.searchParams.get('path') || '';
    if (!isPathAuthorized(target) || !fs.existsSync(target)) {
      sendJson(res, 403, { error: 'Access denied: path outside authorized folders.' });
      return;
    }
    const data = fs.readFileSync(target);
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': data.length,
    });
    res.end(data);
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`SVGA520 Local Desktop Agent listening on http://127.0.0.1:${PORT}`);
  console.log(`Pairing Code (PIN): ${config.pairingCode}`);
});
