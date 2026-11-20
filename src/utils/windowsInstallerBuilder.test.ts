import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WINDOWS_APP_VERSION,
  WINDOWS_INSTALLER_ZIP_NAME,
  WINDOWS_SETUP_BAT_NAME,
  encodeUtf8WithBom,
  generateWindowsInstallerHtml,
  generateOfflineRuntimePs1,
  generateWindowsInstallerServerPs1,
  generateSetupBatchScript,
  createIcoFromPngBytes,
  sanitizeWindowsAppName,
  sanitizeWindowsVersion,
  computeWindowsAppInstanceId,
  computePreferredLoopbackPort,
  getDefaultWindowsInstallPath,
  formatWindowsInstallerZipName,
  formatWindowsSetupBatName,
} from './windowsInstallerBuilder.ts';

test('Windows release artifact names match MotionTools-Windows-x64-Setup.zip and Setup-MotionTools.bat', () => {
  assert.equal(WINDOWS_INSTALLER_ZIP_NAME, 'MotionTools-Windows-x64-Setup.zip');
  assert.equal(WINDOWS_SETUP_BAT_NAME, 'Setup-MotionTools.bat');
  assert.equal(
    formatWindowsInstallerZipName('MotionTools', WINDOWS_APP_VERSION),
    'MotionTools-Windows-x64-Setup.zip'
  );
  assert.equal(formatWindowsSetupBatName('MotionTools'), 'Setup-MotionTools.bat');
});

test('Sanitization & custom naming helpers generate isolated ZIP, BAT, install directory, appId, and port', () => {
  assert.equal(sanitizeWindowsAppName('  My<App>:Pro*  '), 'My App Pro');
  assert.equal(sanitizeWindowsVersion(' 2.0.5 '), '2.0.5');

  assert.equal(
    formatWindowsInstallerZipName('SVGA Studio', '2.1.0'),
    'SVGA-Studio-v2.1.0-Windows-x64-Setup.zip'
  );
  assert.equal(
    formatWindowsInstallerZipName('MotionTools', '1.0.24', 'r2'),
    'MotionTools-v1.0.24-r2-Windows-x64-Setup.zip'
  );
  assert.equal(formatWindowsSetupBatName('SVGA Studio'), 'Setup-SVGA-Studio.bat');
  assert.equal(
    getDefaultWindowsInstallPath('SVGA Studio', '2.1.0', 'r2'),
    'C:\\Users\\%USERNAME%\\AppData\\Local\\Programs\\SVGA Studio-v2.1.0-r2'
  );

  const idV1 = computeWindowsAppInstanceId('MotionTools', '1.0.24');
  const idV2 = computeWindowsAppInstanceId('MotionTools', '1.0.25');
  const idV1Tag = computeWindowsAppInstanceId('MotionTools', '1.0.24', 'b99');
  assert.notEqual(idV1, idV2);
  assert.notEqual(idV1, idV1Tag);

  const portV1 = computePreferredLoopbackPort(idV1);
  const portV2 = computePreferredLoopbackPort(idV2);
  const portV1Tag = computePreferredLoopbackPort(idV1Tag);
  assert.ok(portV1 >= 47821 && portV1 < 48999);
  assert.ok(portV2 >= 47821 && portV2 < 48999);
  assert.notEqual(portV1, portV2);
  assert.notEqual(portV1, portV1Tag);
});

test('encodeUtf8WithBom prepends EF BB BF BOM bytes for Windows PowerShell 5.1 UTF-8 parsing', () => {
  const bytes = encodeUtf8WithBom('Write-Output "مرحباً"');
  assert.equal(bytes[0], 0xef);
  assert.equal(bytes[1], 0xbb);
  assert.equal(bytes[2], 0xbf);
});

test('PowerShell installer & offline runtime avoid invalid System.Net Add-Type, unbraced ProgramFiles(x86), and $args overwrite', () => {
  const installerPs1 = generateWindowsInstallerServerPs1({
    brandTitle: 'Ahmed Pro SVGA',
    appName: 'MotionTools',
    version: WINDOWS_APP_VERSION,
  });
  const runtimePs1 = generateOfflineRuntimePs1('MotionTools');

  for (const script of [installerPs1, runtimePs1]) {
    assert.equal(script.includes('Add-Type -AssemblyName System.Net'), false);
    assert.equal(script.includes('$env:ProgramFiles(x86)'), false);
    assert.equal(script.includes('${env:ProgramFiles(x86)}'), true);
    assert.equal(/^\s*\$args\s*=/m.test(script), false);
    assert.equal(script.includes('$launchArgs'), true);
    assert.equal(script.includes('[System.Threading.Thread]{'), false);
    assert.equal(script.includes('Add-Type -AssemblyName System.Windows.Forms'), true);
    assert.equal(script.includes('[System.Windows.Forms.MessageBox]::Show'), true);
  }
});

test('Offline runtime and installer isolate appId, loopback port, shortcuts, and registry keys per build', () => {
  const customId = computeWindowsAppInstanceId('Studio Pro', '2.4.0', 'vip');
  const customPort = computePreferredLoopbackPort(customId);
  const runtimePs1 = generateOfflineRuntimePs1({
    appName: 'Studio Pro',
    version: '2.4.0',
    appId: customId,
    preferredPort: customPort,
  });

  assert.ok(runtimePs1.includes(`$expectedAppId = '${customId}'`));
  assert.ok(runtimePs1.includes('$probe.appId -eq $expectedAppId'));
  assert.ok(runtimePs1.includes(`$port = ${customPort}`));
  assert.ok(runtimePs1.includes(`"appId":"${customId}"`));

  const installerPs1 = generateWindowsInstallerServerPs1({
    brandTitle: 'Royal Brand',
    appName: 'Studio Pro',
    version: '2.4.0',
    appId: customId,
    instanceTag: 'vip',
  });
  assert.ok(installerPs1.includes('Studio Pro-v2.4.0-vip'));
  assert.ok(installerPs1.includes('Studio Pro v2.4.0 (vip).lnk'));
  assert.ok(
    installerPs1.includes(`HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${customId}`)
  );
  assert.ok(installerPs1.includes('Royal Brand · Studio Pro (v2.4.0)'));
});

test('Setup-MotionTools.bat launches installer-server.ps1 in STA mode with Bypass and CRLF endings', () => {
  const bat = generateSetupBatchScript();
  assert.ok(bat.includes('\r\n'));
  assert.ok(bat.includes('-STA -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden'));
  assert.ok(bat.includes('installer\\installer-server.ps1'));
  assert.ok(bat.includes('MotionTools-Windows-x64-Setup.zip'));

  const customBat = generateSetupBatchScript({
    zipFileName: 'MyApp-v2.0-Windows-x64-Setup.zip',
    batFileName: 'Setup-MyApp.bat',
    appName: 'MyApp',
  });
  assert.ok(customBat.includes('MyApp-v2.0-Windows-x64-Setup.zip'));
  assert.ok(customBat.includes('Setup-MyApp.bat'));
});

test('installer.html includes Arabic UI labels, /api/ping heartbeat, and /api/close beacon', () => {
  const html = generateWindowsInstallerHtml({
    brandTitle: 'Ahmed Pro SVGA',
    appName: 'MotionTools',
    installDir: 'C:\\Users\\%USERNAME%\\AppData\\Local\\Programs\\MotionTools',
    createDesktopShortcut: true,
    launchAfterInstall: true,
    version: WINDOWS_APP_VERSION,
    hasLogo: true,
    hasIcon: true,
  });
  assert.ok(html.includes('تثبيت التطبيق — Ahmed Pro SVGA · MotionTools (v1.0.24)'));
  assert.ok(html.includes('/api/ping'));
  assert.ok(html.includes('/api/close'));
  assert.ok(html.includes('إضافة اختصار على سطح المكتب'));
  assert.ok(html.includes('تشغيل التطبيق بعد التثبيت'));
  assert.ok(html.includes('./app-icon.ico'));
});

test('createIcoFromPngBytes builds valid ICO header wrapping PNG bytes', () => {
  const dummyPng = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ico = createIcoFromPngBytes(dummyPng);
  assert.equal(ico.length, 22 + dummyPng.length);
  assert.equal(ico[2], 1); // ICO type
  assert.equal(ico[4], 1); // 1 image
});
