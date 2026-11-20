import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Register Chromium/Edge PWA File Handling launchQueue consumer IMMEDIATELY at boot
// (before React mounts) so cold-start & warm-start double-clicks on .svga / media files
// on Windows & Android are NEVER missed.
if (typeof window !== 'undefined') {
  const w = window as any;
  w.__EARLY_LAUNCH_FILES__ = w.__EARLY_LAUNCH_FILES__ || [];
  if (w.launchQueue && typeof w.launchQueue.setConsumer === 'function') {
    try {
      w.launchQueue.setConsumer(async (launchParams: any) => {
        if (!launchParams?.files || launchParams.files.length === 0) return;
        try {
          window.focus();
        } catch {
          // ignore
        }
        for (const handle of launchParams.files) {
          if (!handle || typeof handle.getFile !== 'function') continue;
          try {
            const file = await handle.getFile();
            if (!file) continue;
            if (typeof w.__openExternalMotionFile === 'function') {
              await w.__openExternalMotionFile(file);
            } else {
              w.__EARLY_LAUNCH_FILES__.push(file);
            }
            break;
          } catch (err) {
            console.warn('[PWA LaunchQueue] Failed reading launched file:', err);
          }
        }
      });
    } catch (err) {
      console.warn('[PWA LaunchQueue] Registration skipped:', err);
    }
  }
}

createRoot(document.getElementById('root')!).render(<App />);

// Register PWA Service Worker on web (Windows & Android Chrome/Edge) for installability,
// offline resilience, File Handling, and Android Web Share Target.
if (
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  !(window as any).__DESKTOP_APP__?.isElectron &&
  window.location.protocol !== 'file:'
) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js', {scope: './'})
      .catch((err) => {
        console.warn('[PWA] Service Worker registration skipped:', err);
      });
  });
}
