// CommonJS (.cjs) entry point so Electron always runs cleanly even with "type": "module" in package.json.
const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.cjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.apng': 'image/png',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.svga': 'application/octet-stream',
  '.vap': 'video/mp4',
  '.yyeva': 'video/mp4',
  '.pag': 'application/octet-stream',
  '.lottie': 'application/zip',
  '.dotlottie': 'application/zip',
  '.zip': 'application/zip',
  '.motiontools': 'application/octet-stream',
};

const SUPPORTED_OPEN_EXTS = new Set([
  '.svga',
  '.vap',
  '.yyeva',
  '.pag',
  '.lottie',
  '.dotlottie',
  '.mp4',
  '.mov',
  '.webm',
  '.gif',
  '.webp',
  '.apng',
  '.png',
  '.jpg',
  '.jpeg',
  '.svg',
  '.json',
  '.zip',
  '.motiontools',
]);

let mainWindow = null;
let staticServer = null;
const openedFileTokens = new Map();
let pendingOpenPayload = null;

function extractSupportedFileFromArgv(argv) {
  if (!Array.isArray(argv)) return null;
  for (let i = 1; i < argv.length; i++) {
    const raw = argv[i];
    if (!raw || raw.startsWith('-')) continue;
    const cleaned = raw.replace(/^"+|"+$/g, '');
    const ext = path.extname(cleaned).toLowerCase();
    if (!SUPPORTED_OPEN_EXTS.has(ext)) continue;
    try {
      if (fs.existsSync(cleaned) && fs.statSync(cleaned).isFile()) {
        return cleaned;
      }
    } catch (_) {}
  }
  return null;
}

function bringMainWindowToFront() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    // Brief always-on-top pulse guarantees Windows brings the studio directly above File Explorer
    mainWindow.setAlwaysOnTop(true);
    mainWindow.moveTop();
    mainWindow.focus();
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setAlwaysOnTop(false);
      }
    }, 180);
  } catch (_) {}
}

function registerExternalFileForRenderer(filePath) {
  if (!filePath) return null;
  try {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null;
    const token = crypto.randomBytes(12).toString('hex');
    const fileName = path.basename(filePath);
    openedFileTokens.set(token, { filePath, fileName });
    // Keep token map bounded
    if (openedFileTokens.size > 30) {
      const oldestKey = openedFileTokens.keys().next().value;
      if (oldestKey) openedFileTokens.delete(oldestKey);
    }
    const payload = { token, fileName };
    pendingOpenPayload = payload;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('os-open-file', payload);
      bringMainWindowToFront();
    }
    return payload;
  } catch (_) {
    return null;
  }
}

function resolveDistDir() {
  const candidates = [
    path.join(__dirname, '..', 'dist'),
    path.join(app.getAppPath(), 'dist'),
    path.join(process.resourcesPath || '', 'app.asar', 'dist'),
    path.join(process.resourcesPath || '', 'dist'),
  ];
  for (const dir of candidates) {
    if (dir && fs.existsSync(path.join(dir, 'index.html'))) {
      return dir;
    }
  }
  return path.join(__dirname, '..', 'dist');
}

function startLocalStaticServer(distDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const rawUrl = req.url || '/';
        const parsed = new URL(rawUrl, 'http://127.0.0.1');
        let pathname = decodeURIComponent(parsed.pathname || '/');

        // Minimal built-in API routes matching server.ts
        if (pathname === '/api/health') {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ status: 'ok', runtime: 'electron-windows' }));
          return;
        }
        if (pathname === '/api/ip') {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ip: '127.0.0.1' }));
          return;
        }
        if (pathname === '/api/open-file') {
          const token = parsed.searchParams.get('token') || '';
          const entry = openedFileTokens.get(token);
          if (!entry || !fs.existsSync(entry.filePath)) {
            res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'File token not found' }));
            return;
          }
          const ext = path.extname(entry.filePath).toLowerCase();
          const mime = MIME_TYPES[ext] || 'application/octet-stream';
          res.writeHead(200, {
            'Content-Type': mime,
            'X-File-Name': encodeURIComponent(entry.fileName),
            'Cache-Control': 'no-store',
          });
          fs.createReadStream(entry.filePath).pipe(res);
          return;
        }

        if (pathname === '/') pathname = '/index.html';

        const safeRel = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '');
        let filePath = path.join(distDir, safeRel);

        if (!filePath.startsWith(distDir)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }

        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          filePath = path.join(distDir, 'index.html');
        }

        const ext = path.extname(filePath).toLowerCase();
        const mime = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, {
          'Content-Type': mime,
          'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
        });
        fs.createReadStream(filePath).pipe(res);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Internal server error');
      }
    });

    server.on('error', reject);
    // Bind strictly to local loopback on an automatically assigned free port
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to bind local desktop server'));
        return;
      }
      resolve({ server, url: `http://127.0.0.1:${addr.port}` });
    });
  });
}

function resolveAppIcon(distDir) {
  const iconCandidates = [
    path.join(distDir, 'pwa-512x512.png'),
    path.join(distDir, 'logo.png'),
    path.join(__dirname, '..', 'public', 'pwa-512x512.png'),
    path.join(__dirname, '..', 'public', 'logo.png'),
  ];
  for (const p of iconCandidates) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

async function createMainWindow() {
  const distDir = resolveDistDir();
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    dialog.showErrorBox(
      'Build Missing — ملفات التشغيل غير موجودة',
      'Please run "npm run build" first to generate the dist/ folder before starting the Windows app.'
    );
    app.quit();
    return;
  }

  const started = await startLocalStaticServer(distDir);
  staticServer = started.server;

  mainWindow = new BrowserWindow({
    width: 1380,
    height: 880,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#07070a',
    title: 'AHMED & CR8 SVGA · MotionTools Desktop',
    icon: resolveAppIcon(distDir),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      spellcheck: false,
    },
  });

  // Hide default menu bar for a clean pro studio feel (Alt still reveals if needed)
  Menu.setApplicationMenu(null);

  // Open external links (WhatsApp, support, OAuth popups) safely in system browser or clean popup
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost')) {
      return { action: 'allow' };
    }
    if (url.includes('accounts.google.com') || url.includes('firebaseapp.com')) {
      return { action: 'allow' };
    }
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'deny' };
  });

  // Allow DevTools shortcut (Ctrl+Shift+I or F12) for troubleshooting
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow) return;
    mainWindow.maximize();
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Check if launched directly by double-clicking a supported file in Windows Explorer
  const initialFile = extractSupportedFileFromArgv(process.argv);
  const initialPayload = initialFile ? registerExternalFileForRenderer(initialFile) : null;
  const targetUrl = initialPayload
    ? `${started.url}/?openFileToken=${encodeURIComponent(initialPayload.token)}`
    : started.url;

  await mainWindow.loadURL(targetUrl);
}

ipcMain.handle('get-pending-open-file', () => {
  const current = pendingOpenPayload;
  pendingOpenPayload = null;
  return current;
});

const gotSingleLock = app.requestSingleInstanceLock();
if (!gotSingleLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    const filePath = extractSupportedFileFromArgv(commandLine);
    if (filePath) {
      registerExternalFileForRenderer(filePath);
    } else {
      bringMainWindowToFront();
    }
  });

  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    if (filePath) {
      registerExternalFileForRenderer(filePath);
    }
  });

  app.whenReady().then(() => {
    createMainWindow().catch((err) => {
      console.error('Desktop startup error:', err);
      dialog.showErrorBox('Startup Error', String(err && err.message ? err.message : err));
      app.quit();
    });
  });

  app.on('window-all-closed', () => {
    if (staticServer) {
      try {
        staticServer.close();
      } catch (_) {}
      staticServer = null;
    }
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
