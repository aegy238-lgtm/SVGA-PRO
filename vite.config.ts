import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {build, defineConfig, type Plugin} from 'vite';

function collectDistFiles(dir: string, baseDir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(baseDir, full).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      if (rel === 'assets/aistudio') continue;
      results.push(...collectDistFiles(full, baseDir));
    } else {
      if (rel === 'offline-manifest.json' || rel.endsWith('.map')) continue;
      results.push(rel);
    }
  }
  return results;
}

const MIME_MAP: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function offlineManifestPlugin(): Plugin {
  const distDir = path.resolve(__dirname, 'dist');
  let activeBuildPromise: Promise<void> | null = null;

  const ensureDistBuilt = async (forceRebuild = false) => {
    const manifestPath = path.join(distDir, 'offline-manifest.json');
    if (!forceRebuild && fs.existsSync(manifestPath) && fs.existsSync(path.join(distDir, 'index.html'))) {
      return;
    }
    if (!activeBuildPromise) {
      activeBuildPromise = (async () => {
        await build({
          configFile: path.resolve(__dirname, 'vite.config.ts'),
          mode: 'production',
          logLevel: 'silent',
        });
      })().finally(() => {
        activeBuildPromise = null;
      });
    }
    await activeBuildPromise;
  };

  return {
    name: 'motiontools-offline-manifest',
    writeBundle() {
      if (!fs.existsSync(distDir)) return;
      const files = collectDistFiles(distDir, distDir).sort();
      const manifest = {
        appName: 'MotionTools',
        version: '1.0.24',
        generatedAt: new Date().toISOString(),
        files,
      };
      fs.writeFileSync(
        path.join(distDir, 'offline-manifest.json'),
        JSON.stringify(manifest, null, 2),
        'utf-8'
      );
    },
    configureServer(server) {
      server.middlewares.use('/api/windows-offline-manifest', async (req, res) => {
        try {
          const urlObj = new URL(req.url || '/', 'http://127.0.0.1');
          const force = urlObj.searchParams.get('rebuild') === '1';
          await ensureDistBuilt(force);
          const manifestPath = path.join(distDir, 'offline-manifest.json');
          const raw = fs.readFileSync(manifestPath, 'utf-8');
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(raw);
        } catch (err: any) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({error: err?.message || 'Failed to prepare offline bundle'}));
        }
      });

      server.middlewares.use('/__offline_dist__', (req, res, next) => {
        try {
          const cleanPath = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^[/\\]+/, '');
          const resolved = path.resolve(distDir, cleanPath || 'index.html');
          if (!resolved.startsWith(distDir) || !fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
            return next();
          }
          const ext = path.extname(resolved).toLowerCase();
          res.statusCode = 200;
          res.setHeader('Content-Type', MIME_MAP[ext] || 'application/octet-stream');
          fs.createReadStream(resolved).pipe(res);
        } catch {
          next();
        }
      });
    },
  };
}

export default defineConfig(() => {
  return {
    base: './',
    plugins: [react(), tailwindcss(), offlineManifestPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
