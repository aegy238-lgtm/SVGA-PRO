/**
 * Unified OS File-Launch Bridge for Windows & Android.
 * Automatically intercepts files opened via:
 *  1. PWA File Handling API (`window.launchQueue`) on Windows & Android Chrome/Edge
 *  2. Android Web Share Target (`/?shared=1` via `pwa-shared-media-v1` CacheStorage)
 *  3. Offline Windows Desktop Runtime (`?openFileToken=...` + fast `/api/pending-file` polling)
 *  4. Electron Desktop IPC (`window.__DESKTOP_APP__.onOpenFile` / `getPendingOpenFile`)
 *
 * Every opened file immediately brings the app forward, switches directly to `#convert`,
 * and plays automatically via `window.MotionTools.load(file)` (or `restoreProject` for `.motiontools`).
 */

export const SUPPORTED_OS_FILE_EXTENSIONS = [
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
] as const;

export interface OsFileLaunchCallbacks {
  onActivatePrimaryView: () => void;
  onFileOpened?: (fileName: string) => void;
  onError?: (message: string) => void;
}

interface LaunchQueueLike {
  setConsumer: (
    consumer: (launchParams: {
      targetURL?: string;
      files?: Array<{
        kind?: string;
        name?: string;
        getFile: () => Promise<File>;
      }>;
    }) => void | Promise<void>
  ) => void;
}

let activeLaunchSeq = 0;

function guessMimeFromFilename(fileName: string): string {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  switch (ext) {
    case 'mp4':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    case 'mov':
      return 'video/quicktime';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'png':
    case 'apng':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'svg':
      return 'image/svg+xml';
    case 'json':
      return 'application/json';
    case 'zip':
    case 'lottie':
    case 'dotlottie':
      return 'application/zip';
    default:
      return 'application/octet-stream';
  }
}

async function waitForMotionToolsReady(timeoutMs = 15000): Promise<any | null> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const mt = (window as any).MotionTools;
    if (mt && typeof mt.load === 'function') {
      return mt;
    }
    await new Promise((r) => setTimeout(r, 40));
  }
  return (window as any).MotionTools || null;
}

function activatePrimaryConvertView(onActivatePrimaryView?: () => void) {
  try {
    window.focus();
  } catch {
    // ignore focus restrictions
  }

  try {
    onActivatePrimaryView?.();
  } catch {
    // ignore callback errors
  }

  try {
    if (typeof (window as any).__showNavView === 'function') {
      (window as any).__showNavView('convert');
    } else {
      document.querySelectorAll('.view').forEach((el) => {
        el.classList.toggle('on', el.id === 'convert');
      });
      document.querySelectorAll('nav a[data-v]').forEach((a) => {
        a.classList.toggle('on', (a as HTMLElement).dataset.v === 'convert');
      });
    }
  } catch {
    // ignore DOM errors
  }
}

export async function dispatchFileToPrimaryViewer(
  file: File,
  callbacks?: OsFileLaunchCallbacks
): Promise<boolean> {
  if (!file) return false;
  const seq = ++activeLaunchSeq;
  activatePrimaryConvertView(callbacks?.onActivatePrimaryView);

  const mt = await waitForMotionToolsReady(15000);
  if (!mt || seq !== activeLaunchSeq) {
    if (!mt) callbacks?.onError?.('MotionTools engine is not ready yet.');
    return false;
  }

  try {
    const lowerName = (file.name || '').toLowerCase();
    if (lowerName.endsWith('.motiontools') && typeof mt.restoreProject === 'function') {
      await mt.restoreProject(file);
    } else if (typeof mt.load === 'function') {
      await mt.load(file);
    } else {
      return false;
    }

    if (seq !== activeLaunchSeq) return false;

    // Snap instantaneously to the top of the primary preview stage
    try {
      window.scrollTo(0, 0);
      window.focus();
    } catch {
      // ignore scroll/focus errors
    }

    callbacks?.onFileOpened?.(file.name || 'file');
    return true;
  } catch (err: any) {
    console.error('[OSFileLaunch] Failed to open file in primary viewer:', err);
    callbacks?.onError?.(err?.message || 'Failed to open file');
    return false;
  }
}

async function fetchLocalDesktopFileByToken(
  token: string,
  fallbackName?: string
): Promise<File | null> {
  if (!token) return null;
  try {
    const res = await fetch(`/api/open-file?token=${encodeURIComponent(token)}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const rawHeaderName = res.headers.get('X-File-Name') || '';
    let decodedName = fallbackName || 'opened-file.svga';
    if (rawHeaderName) {
      try {
        decodedName = decodeURIComponent(rawHeaderName);
      } catch {
        decodedName = rawHeaderName;
      }
    }
    const blob = await res.blob();
    const mime =
      blob.type && blob.type !== 'application/octet-stream'
        ? blob.type
        : guessMimeFromFilename(decodedName);
    return new File([blob], decodedName, { type: mime, lastModified: Date.now() });
  } catch (err) {
    console.warn('[OSFileLaunch] Could not fetch desktop token file:', err);
    return null;
  }
}

async function consumeAndroidSharedMediaCache(
  callbacks: OsFileLaunchCallbacks
): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  try {
    const cache = await caches.open('pwa-shared-media-v1');
    const keys = await cache.keys();
    const sharedKeys = keys.filter((req) => req.url.includes('/shared-file-temp-'));
    if (sharedKeys.length === 0) return false;

    // Sort by index so first shared file opens immediately in primary viewer
    sharedKeys.sort((a, b) => a.url.localeCompare(b.url));
    const firstReq = sharedKeys[0];
    const response = await cache.match(firstReq);
    if (!response) return false;

    const encodedName = response.headers.get('X-File-Name') || `shared_${Date.now()}.svga`;
    let fileName = encodedName;
    try {
      fileName = decodeURIComponent(encodedName);
    } catch {
      // keep raw
    }

    const blob = await response.blob();
    const mime = blob.type || guessMimeFromFilename(fileName);
    const file = new File([blob], fileName, { type: mime, lastModified: Date.now() });

    // Clean up temporary shared media cache entries
    await Promise.all(sharedKeys.map((k) => cache.delete(k).catch(() => {})));

    return await dispatchFileToPrimaryViewer(file, callbacks);
  } catch (err) {
    console.warn('[OSFileLaunch] Failed reading Android shared media cache:', err);
    return false;
  }
}

/**
 * Registers all OS file-open listeners once on app startup and returns a cleanup function.
 */
export function initOsFileLaunchBridge(callbacks: OsFileLaunchCallbacks): () => void {
  if (typeof window === 'undefined') return () => {};

  let disposed = false;
  const processedTokens = new Set<string>();

  // Expose helper globally for early-boot launchQueue, debugging, Electron, or external triggers
  (window as any).__openExternalMotionFile = (file: File) =>
    dispatchFileToPrimaryViewer(file, callbacks);

  // 1a. Immediately drain any file(s) already captured by early-boot launchQueue in main.tsx
  const earlyQueue = (window as any).__EARLY_LAUNCH_FILES__ as File[] | undefined;
  if (Array.isArray(earlyQueue) && earlyQueue.length > 0) {
    const latestEarlyFile = earlyQueue[earlyQueue.length - 1];
    earlyQueue.length = 0;
    if (latestEarlyFile) {
      void dispatchFileToPrimaryViewer(latestEarlyFile, callbacks);
    }
  }

  // 1b. PWA File Handling API fallback (in case main.tsx wasn't the entry point)
  const launchQueue = (window as any).launchQueue as LaunchQueueLike | undefined;
  if (
    launchQueue &&
    typeof launchQueue.setConsumer === 'function' &&
    !Array.isArray((window as any).__EARLY_LAUNCH_FILES__)
  ) {
    try {
      launchQueue.setConsumer(async (launchParams) => {
        if (disposed || !launchParams?.files || launchParams.files.length === 0) return;
        try {
          window.focus();
        } catch {
          // ignore
        }
        for (const handle of launchParams.files) {
          if (!handle || typeof handle.getFile !== 'function') continue;
          try {
            const file = await handle.getFile();
            if (file && !disposed) {
              await dispatchFileToPrimaryViewer(file, callbacks);
              break;
            }
          } catch (err) {
            console.warn('[OSFileLaunch] launchQueue handle.getFile failed:', err);
          }
        }
      });
    } catch (err) {
      console.warn('[OSFileLaunch] launchQueue registration error:', err);
    }
  }

  // 2. URL query parameters: Android Share Target (?shared=1), shortcuts (?action=...),
  //    and Offline Windows Desktop launch (?openFileToken=...)
  const handleUrlStartupParams = async () => {
    try {
      const url = new URL(window.location.href);
      const shared = url.searchParams.get('shared');
      const openFileToken = url.searchParams.get('openFileToken');
      const action = url.searchParams.get('action');
      const fileLaunch = url.searchParams.get('file_launch');

      if (fileLaunch === '1' || openFileToken || shared === '1') {
        activatePrimaryConvertView(callbacks.onActivatePrimaryView);
      }

      if (shared === '1') {
        await consumeAndroidSharedMediaCache(callbacks);
        url.searchParams.delete('shared');
        url.searchParams.delete('t');
        window.history.replaceState({}, '', url.pathname + url.search + url.hash);
      }

      if (openFileToken && !processedTokens.has(openFileToken)) {
        processedTokens.add(openFileToken);
        const file = await fetchLocalDesktopFileByToken(openFileToken);
        if (file && !disposed) {
          await dispatchFileToPrimaryViewer(file, callbacks);
        }
        url.searchParams.delete('openFileToken');
        window.history.replaceState({}, '', url.pathname + url.search + url.hash);
      }

      if (action === 'open_file') {
        activatePrimaryConvertView(callbacks.onActivatePrimaryView);
      } else if (action === 'editor' && typeof (window as any).__showNavView === 'function') {
        (window as any).__showNavView('editor');
      } else if (action === 'gifts' && typeof (window as any).__showNavView === 'function') {
        (window as any).__showNavView('gifts');
      }
    } catch {
      // ignore URL parsing issues
    }
  };
  void handleUrlStartupParams();

  // 3. Electron Desktop IPC (cold launch + second-instance double-clicks in Windows Explorer)
  const desktopApi = (window as any).__DESKTOP_APP__;
  let removeElectronListener: (() => void) | undefined;
  if (desktopApi?.isElectron) {
    const loadDesktopToken = async (payload: { token?: string; fileName?: string } | null) => {
      if (!payload?.token || processedTokens.has(payload.token) || disposed) return;
      processedTokens.add(payload.token);
      const file = await fetchLocalDesktopFileByToken(payload.token, payload.fileName);
      if (file && !disposed) {
        await dispatchFileToPrimaryViewer(file, callbacks);
      }
    };

    if (typeof desktopApi.getPendingOpenFile === 'function') {
      desktopApi
        .getPendingOpenFile()
        .then((pending: any) => loadDesktopToken(pending))
        .catch(() => {});
    }
    if (typeof desktopApi.onOpenFile === 'function') {
      removeElectronListener = desktopApi.onOpenFile((payload: any) => {
        void loadDesktopToken(payload);
      });
    }
  }

  // 4. Offline Windows PowerShell Runtime ultra-fast polling (180ms + instant on window focus)
  //    so double-clicking a 2nd/3rd .svga file in Windows Explorer pops the window forward
  //    and swaps to the new animation immediately (<0.2s).
  let pollTimer: number | null = null;
  let pollInFlight = false;
  let onFocusCheck: (() => void) | null = null;
  let onVisCheck: (() => void) | null = null;

  const isOfflineWinRuntime = Boolean(
    (window as any).__MOTIONTOOLS_DESKTOP_BRANDING__ &&
      (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') &&
      !desktopApi?.isElectron
  );

  if (isOfflineWinRuntime) {
    const checkPendingOfflineFile = async () => {
      if (disposed || pollInFlight) return;
      pollInFlight = true;
      try {
        const res = await fetch('/api/pending-file', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (data?.hasFile && data?.token && !processedTokens.has(data.token)) {
          processedTokens.add(data.token);
          const file = await fetchLocalDesktopFileByToken(data.token, data.fileName);
          if (file && !disposed) {
            await dispatchFileToPrimaryViewer(file, callbacks);
          }
        }
      } catch {
        // Silent — local server may be closing
      } finally {
        pollInFlight = false;
      }
    };
    void checkPendingOfflineFile();
    pollTimer = window.setInterval(checkPendingOfflineFile, 180);
    onFocusCheck = () => {
      void checkPendingOfflineFile();
    };
    onVisCheck = () => {
      if (document.visibilityState === 'visible') {
        void checkPendingOfflineFile();
      }
    };
    window.addEventListener('focus', onFocusCheck);
    document.addEventListener('visibilitychange', onVisCheck);
  }

  return () => {
    disposed = true;
    if (pollTimer !== null) {
      window.clearInterval(pollTimer);
    }
    if (onFocusCheck) window.removeEventListener('focus', onFocusCheck);
    if (onVisCheck) document.removeEventListener('visibilitychange', onVisCheck);
    if (typeof removeElectronListener === 'function') {
      removeElectronListener();
    }
  };
}
