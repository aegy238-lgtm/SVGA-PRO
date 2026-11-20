import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  generateWindowsInstallerHtml,
  generateWindowsInstallerServerPs1,
  generateOfflineRuntimePs1,
  WINDOWS_OPEN_WITH_EXTENSIONS,
  WINDOWS_PRIMARY_OWNED_EXTENSIONS,
} from '../windowsInstallerBuilder';
import { canDownloadWindowsInstaller } from '../platformStore';

describe('PWA Manifest, Windows File Associations & Admin-Only Installer', () => {
  it('configures public/manifest.json with branded name, site logo PNGs, launch_handler, and all file_handlers', () => {
    const manifestPath = path.resolve(process.cwd(), 'public/manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    assert.equal(manifest.name, 'AHMED & CR8 SVGA · MotionTools');
    assert.equal(manifest.short_name, 'Ahmed SVGA');
    assert.ok(manifest.short_name.length <= 12);
    assert.equal(manifest.display, 'standalone');
    assert.ok(manifest.launch_handler?.client_mode?.includes('focus-existing'));

    // Ensure generic legacy S SVG icon is NOT used in manifest icons
    const iconSrcs: string[] = manifest.icons.map((i: any) => i.src);
    assert.ok(iconSrcs.includes('/pwa-192x192.png'));
    assert.ok(iconSrcs.includes('/pwa-512x512.png'));
    assert.ok(iconSrcs.includes('/pwa-maskable-512x512.png'));
    assert.ok(!iconSrcs.includes('/icon.svg'));

    // Verify Chromium Windows compliance: dedicated top-priority .svga handler,
    // zero blocked application/octet-stream, and zero duplicate extensions across MIME keys
    assert.ok(Array.isArray(manifest.file_handlers) && manifest.file_handlers.length >= 2);
    assert.deepEqual(manifest.file_handlers[0].accept, { 'application/x-svga': ['.svga'] });
    const icoBuf = fs.readFileSync(path.resolve(process.cwd(), 'public/favicon.ico'));
    assert.equal(icoBuf.readUInt16LE(0), 0);
    assert.equal(icoBuf.readUInt16LE(2), 1);

    const allHandlerExts = new Set<string>();
    for (const fh of manifest.file_handlers || []) {
      assert.ok(!('application/octet-stream' in (fh.accept || {})), 'application/octet-stream is rejected by Chromium file_handlers');
      for (const exts of Object.values(fh.accept || {})) {
        for (const ext of exts as string[]) {
          const lower = ext.toLowerCase();
          assert.ok(!allHandlerExts.has(lower), `Duplicate extension ${lower} in file_handlers`);
          allHandlerExts.add(lower);
        }
      }
    }
    for (const reqExt of [
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
    ]) {
      assert.ok(allHandlerExts.has(reqExt), `Missing extension ${reqExt} in manifest file_handlers`);
    }
  });

  it('generates Windows Offline Installer with .svga logo file association & auto-open runtime endpoints', () => {
    const html = generateWindowsInstallerHtml({
      brandTitle: 'Ahmed Pro SVGA',
      appName: 'MotionTools',
      installDir: 'C:\\Users\\%USERNAME%\\AppData\\Local\\Programs\\MotionTools',
      createDesktopShortcut: true,
      launchAfterInstall: true,
      associateFiles: true,
      version: '1.0.24',
      hasLogo: true,
      hasFileLogo: true,
      hasIcon: true,
    });
    assert.ok(html.includes('id="associateFiles"'));
    assert.ok(html.includes('id="fileLogoInput"'));
    assert.ok(html.includes('customFileIconPngBase64'));
    assert.ok(html.includes('./file-logo.png'));
    assert.ok(html.includes('associateFiles: associateChk ? associateChk.checked : true'));

    const serverPs1 = generateWindowsInstallerServerPs1({
      brandTitle: 'Ahmed Pro SVGA',
      appName: 'MotionTools',
      version: '1.0.24',
    });
    assert.ok(serverPs1.includes('OpenWithProgids'));
    assert.ok(serverPs1.includes('DefaultIcon'));
    assert.ok(serverPs1.includes('SHChangeNotify'));
    assert.ok(serverPs1.includes('svga-file-icon.ico'));
    assert.ok(serverPs1.includes('Write-IcoFromPngBytes'));
    assert.ok(serverPs1.includes('customFileIconPngBase64'));
    assert.ok(serverPs1.includes('/file-logo.png'));
    assert.ok(serverPs1.includes('$activeFileIcon'));
    for (const ext of WINDOWS_PRIMARY_OWNED_EXTENSIONS) {
      assert.ok(serverPs1.includes(`'${ext}'`));
    }
    for (const ext of WINDOWS_OPEN_WITH_EXTENSIONS) {
      assert.ok(serverPs1.includes(`'${ext}'`));
    }

    const runtimePs1 = generateOfflineRuntimePs1({
      appName: 'MotionTools',
      version: '1.0.24',
    });
    assert.ok(runtimePs1.includes('param('));
    assert.ok(runtimePs1.includes('[string]$OpenFile'));
    assert.ok(runtimePs1.includes('/api/enqueue-file'));
    assert.ok(runtimePs1.includes('/api/pending-file'));
    assert.ok(runtimePs1.includes('/api/open-file'));
    assert.ok(runtimePs1.includes('X-File-Name'));
    assert.ok(runtimePs1.includes('Focus-AppWindow'));
    assert.ok(runtimePs1.includes('SetForegroundWindow'));
    assert.ok(runtimePs1.includes('SwitchToThisWindow'));
    assert.ok(runtimePs1.includes('SetWindowPos'));
    assert.ok(runtimePs1.includes('windowFocused'));
  });

  it('strictly restricts Windows Offline Installer download to active Admin accounts only', () => {
    assert.equal(canDownloadWindowsInstaller(null, 'actual'), false);
    assert.equal(
      canDownloadWindowsInstaller(
        { id: 'u1', email: 'user@test.com', name: 'Free', role: 'user', isPro: false } as any,
        'actual'
      ),
      false
    );
    assert.equal(
      canDownloadWindowsInstaller(
        { id: 'u2', email: 'pro@test.com', name: 'Pro', role: 'user', isPro: true } as any,
        'actual'
      ),
      false
    );
    assert.equal(
      canDownloadWindowsInstaller(
        {
          id: 'a1',
          email: 'owner@motiontools.app',
          name: 'Admin',
          role: 'admin',
          isPro: true,
          adminPermissions: ['manage_users'],
        } as any,
        'free_user'
      ),
      false
    );
    assert.equal(
      canDownloadWindowsInstaller(
        {
          id: 'a1',
          email: 'owner@motiontools.app',
          name: 'Admin',
          role: 'admin',
          isPro: true,
          adminPermissions: ['manage_users'],
        } as any,
        'actual'
      ),
      true
    );
  });
});
