import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AgentConnectionState,
  AgentStatusResponse,
  AuthorizedFolderEntry,
  LocalDesktopAgentClient,
  LocalGiftSearchResult,
  ReferenceQueryPayload,
  extractReferenceVisualFeatures,
  generateWindowsBatchInstaller,
  generateWindowsPowerShellAgentScript,
  getSavedAgentToken,
  saveAgentToken,
} from '../utils/aiGiftFinderEngine';
import {
  BrowserAuthorizedFolder,
  BrowserLocalGiftEntry,
  collectEntriesFromDirectoryHandle,
  getStoredDirectoryHandle,
  indexFilesIntoBrowserFolder,
  loadBrowserLocalIndexState,
  removeBrowserFolderFromDb,
  resolveBrowserLocalFile,
  searchBrowserLocalItems,
} from '../utils/browserLocalGiftIndex';

interface AiGiftFinderStudioProps {
  isAr: boolean;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function downloadTextFile(filename: string, content: string, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export const AiGiftFinderStudio: React.FC<AiGiftFinderStudioProps> = ({ isAr }) => {
  // Browser-native Local Folders (Zero install required!)
  const [browserFolders, setBrowserFolders] = useState<BrowserAuthorizedFolder[]>([]);
  const [browserItems, setBrowserItems] = useState<BrowserLocalGiftEntry[]>([]);
  const [indexingProgress, setIndexingProgress] = useState<{
    done: number;
    total: number;
    fileName: string;
  } | null>(null);
  const [folderStatusMsg, setFolderStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Optional Windows Desktop Agent state (for Explorer reveal + background disk index)
  const [agentDrawerOpen, setAgentDrawerOpen] = useState(false);
  const [connState, setConnState] = useState<AgentConnectionState>('disconnected');
  const [agentStatus, setAgentStatus] = useState<AgentStatusResponse | null>(null);
  const [token, setToken] = useState<string>(() => getSavedAgentToken());
  const [pairingInput, setPairingInput] = useState('');
  const [pairingBusy, setPairingBusy] = useState(false);
  const [pairingError, setPairingError] = useState('');
  const [agentFolders, setAgentFolders] = useState<AuthorizedFolderEntry[]>([]);
  const [manualFolderInput, setManualFolderInput] = useState('');
  const [agentFolderBusy, setAgentFolderBusy] = useState(false);

  // Reference upload & search results
  const [refPayload, setRefPayload] = useState<ReferenceQueryPayload | null>(null);
  const [refExtractBusy, setRefExtractBusy] = useState(false);
  const [textQuery, setTextQuery] = useState('');
  const [formatFilter, setFormatFilter] = useState('ALL');
  const [isDragOver, setIsDragOver] = useState(false);

  const [searchBusy, setSearchBusy] = useState(false);
  const [searchResults, setSearchResults] = useState<
    Array<LocalGiftSearchResult & { source: 'browser' | 'agent' }>
  >([]);
  const [searchMeta, setSearchMeta] = useState<{ searchedCount: number; durationMs: number } | null>(
    null
  );
  const [searchError, setSearchError] = useState('');
  const [actionMsg, setActionMsg] = useState('');

  const refFileInputRef = useRef<HTMLInputElement | null>(null);
  const dirFallbackInputRef = useRef<HTMLInputElement | null>(null);

  const totalIndexedCount =
    browserItems.length + (connState === 'connected' ? agentStatus?.indexedCount ?? 0 : 0);
  const hasAnyIndex = browserFolders.length > 0 || connState === 'connected';

  // Load saved local browser index on boot
  useEffect(() => {
    let active = true;
    loadBrowserLocalIndexState().then(({ folders, items }) => {
      if (!active) return;
      setBrowserFolders(folders);
      setBrowserItems(items);
    });
    return () => {
      active = false;
    };
  }, []);

  // Probe optional local Windows Desktop Agent quietly
  const refreshAgentState = useCallback(async (overrideToken?: string) => {
    const activeToken = overrideToken ?? getSavedAgentToken();
    const status = await LocalDesktopAgentClient.checkStatus(activeToken);
    if (!status) {
      setAgentStatus(null);
      setConnState('disconnected');
      setAgentFolders([]);
      return;
    }
    setAgentStatus(status);
    if (!status.paired) {
      setConnState('needs_pairing');
      setAgentFolders([]);
      return;
    }
    setConnState('connected');
    try {
      const folderList = await LocalDesktopAgentClient.getFolders(activeToken);
      setAgentFolders(folderList);
    } catch {}
  }, []);

  useEffect(() => {
    refreshAgentState();
  }, [refreshAgentState]);

  const executeUnifiedSearch = useCallback(
    async (
      payloadToUse: ReferenceQueryPayload | null,
      queryTextToUse: string,
      fmtToUse: string,
      overrideBrowserItems?: BrowserLocalGiftEntry[]
    ) => {
      const activeBrowserItems = overrideBrowserItems ?? browserItems;
      const canSearchBrowser = activeBrowserItems.length > 0;
      const canSearchAgent = connState === 'connected' && Boolean(token);

      if (!canSearchBrowser && !canSearchAgent) {
        return;
      }
      if (!payloadToUse && !queryTextToUse.trim()) {
        return;
      }

      setSearchBusy(true);
      setSearchError('');
      try {
        const mergedResults: Array<LocalGiftSearchResult & { source: 'browser' | 'agent' }> = [];
        let totalSearched = 0;
        let maxDuration = 1;

        if (canSearchBrowser) {
          const bRes = searchBrowserLocalItems(payloadToUse?.frames || [], activeBrowserItems, {
            textQuery: queryTextToUse.trim() || payloadToUse?.textQuery || '',
            formatFilter: fmtToUse,
            limit: 40,
          });
          totalSearched += bRes.searchedCount;
          maxDuration = Math.max(maxDuration, bRes.durationMs);
          for (const r of bRes.results) {
            mergedResults.push({ ...r, source: 'browser' });
          }
        }

        if (canSearchAgent) {
          const aRes = await LocalDesktopAgentClient.search(token, {
            queryFrames: payloadToUse?.frames || [],
            textQuery: queryTextToUse.trim() || payloadToUse?.textQuery || '',
            formatFilter: fmtToUse,
            limit: 40,
          });
          totalSearched += aRes.searchedCount;
          maxDuration = Math.max(maxDuration, aRes.durationMs);
          const seenNames = new Set(mergedResults.map((x) => `${x.name}::${x.sizeBytes}`));
          for (const r of aRes.results || []) {
            if (!seenNames.has(`${r.name}::${r.sizeBytes}`)) {
              mergedResults.push({ ...r, source: 'agent' });
            }
          }
        }

        mergedResults.sort((a, b) => b.score - a.score);
        setSearchResults(mergedResults.slice(0, 40));
        setSearchMeta({ searchedCount: totalSearched, durationMs: maxDuration });
      } catch (err: any) {
        setSearchError(err?.message || (isAr ? 'تعذر إتمام البحث المحلي' : 'Local search failed'));
      } finally {
        setSearchBusy(false);
      }
    },
    [browserItems, connState, token, isAr]
  );

  // Pick a local folder in 1 click (uses native Windows folder dialog via showDirectoryPicker,
  // automatically falling back to <input webkitdirectory> if inside restricted iframe)
  const handlePickBrowserFolder = async () => {
    setFolderStatusMsg(null);
    const pickerFn = (window as any).showDirectoryPicker;
    if (typeof pickerFn === 'function') {
      try {
        const dirHandle = await pickerFn({ mode: 'read' });
        setIndexingProgress({ done: 0, total: 1, fileName: dirHandle.name });
        const entries = await collectEntriesFromDirectoryHandle(dirHandle);
        if (entries.length === 0) {
          setIndexingProgress(null);
          setFolderStatusMsg({
            type: 'err',
            text: isAr
              ? `المجلد "${dirHandle.name}" لا يحتوي على ملفات هدايا أو صور مدعومة.`
              : `Folder "${dirHandle.name}" has no supported gift/media files.`,
          });
          return;
        }
        const { folder, items } = await indexFilesIntoBrowserFolder(dirHandle.name, entries, {
          dirHandle,
          onProgress: (done, total, fileName) => setIndexingProgress({ done, total, fileName }),
        });
        const nextFolders = [folder, ...browserFolders.filter((f) => f.id !== folder.id)];
        const nextItems = [...items, ...browserItems.filter((it) => it.folderId !== folder.id)];
        setBrowserFolders(nextFolders);
        setBrowserItems(nextItems);
        setIndexingProgress(null);
        setFolderStatusMsg({
          type: 'ok',
          text: isAr
            ? `تم تجهيز المجلد "${folder.name}" (${folder.fileCount} ملف جاهز للبحث على جهازك)`
            : `Ready: "${folder.name}" (${folder.fileCount} local files indexed)`,
        });
        if (refPayload || textQuery.trim()) {
          await executeUnifiedSearch(refPayload, textQuery, formatFilter, nextItems);
        }
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          return; // User canceled intentionally
        }
        // Fallback cleanly to webkitdirectory input (e.g. iframe SecurityError)
      }
    }
    dirFallbackInputRef.current?.click();
  };

  const handleFallbackDirectorySelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setFolderStatusMsg(null);
    const filesArr = Array.from(fileList);
    const firstRel = (filesArr[0] as any).webkitRelativePath || filesArr[0].name;
    const rootFolderName = firstRel.includes('/') ? firstRel.split('/')[0] : 'LocalGifts';

    const entries = filesArr.map((file) => ({
      file,
      relativePath: (file as any).webkitRelativePath || `${rootFolderName}/${file.name}`,
    }));

    setIndexingProgress({ done: 0, total: entries.length, fileName: rootFolderName });
    const { folder, items } = await indexFilesIntoBrowserFolder(rootFolderName, entries, {
      onProgress: (done, total, fileName) => setIndexingProgress({ done, total, fileName }),
    });
    setIndexingProgress(null);

    if (items.length === 0) {
      setFolderStatusMsg({
        type: 'err',
        text: isAr
          ? `لم يتم العثور على ملفات هدايا أو صور أو فيديو مدعومة داخل "${rootFolderName}".`
          : `No supported media/gift files found inside "${rootFolderName}".`,
      });
      return;
    }

    const nextFolders = [folder, ...browserFolders.filter((f) => f.id !== folder.id)];
    const nextItems = [...items, ...browserItems.filter((it) => it.folderId !== folder.id)];
    setBrowserFolders(nextFolders);
    setBrowserItems(nextItems);
    setFolderStatusMsg({
      type: 'ok',
      text: isAr
        ? `تم تجهيز المجلد "${folder.name}" (${folder.fileCount} ملف جاهز للبحث على جهازك)`
        : `Ready: "${folder.name}" (${folder.fileCount} local files indexed)`,
    });

    if (refPayload || textQuery.trim()) {
      await executeUnifiedSearch(refPayload, textQuery, formatFilter, nextItems);
    }
  };

  const handleRefreshSavedFolder = async (folder: BrowserAuthorizedFolder) => {
    const dirHandle = await getStoredDirectoryHandle(folder.id);
    if (!dirHandle) {
      dirFallbackInputRef.current?.click();
      return;
    }
    try {
      if (typeof dirHandle.requestPermission === 'function') {
        const perm = await dirHandle.requestPermission({ mode: 'read' });
        if (perm !== 'granted') return;
      }
      setIndexingProgress({ done: 0, total: 1, fileName: folder.name });
      const entries = await collectEntriesFromDirectoryHandle(dirHandle);
      const { folder: updated, items } = await indexFilesIntoBrowserFolder(folder.name, entries, {
        folderId: folder.id,
        dirHandle,
        onProgress: (done, total, fileName) => setIndexingProgress({ done, total, fileName }),
      });
      const nextFolders = [updated, ...browserFolders.filter((f) => f.id !== updated.id)];
      const nextItems = [...items, ...browserItems.filter((it) => it.folderId !== updated.id)];
      setBrowserFolders(nextFolders);
      setBrowserItems(nextItems);
      setIndexingProgress(null);
      setFolderStatusMsg({
        type: 'ok',
        text: isAr
          ? `تم تحديث المجلد "${updated.name}" (${updated.fileCount} ملف)`
          : `Updated "${updated.name}" (${updated.fileCount} files)`,
      });
    } catch {
      setIndexingProgress(null);
      dirFallbackInputRef.current?.click();
    }
  };

  const handleRemoveBrowserFolder = async (folderId: string) => {
    await removeBrowserFolderFromDb(folderId);
    const nextFolders = browserFolders.filter((f) => f.id !== folderId);
    const nextItems = browserItems.filter((it) => it.folderId !== folderId);
    setBrowserFolders(nextFolders);
    setBrowserItems(nextItems);
    setSearchResults((prev) => prev.filter((r) => nextItems.some((it) => it.id === r.id) || r.source === 'agent'));
  };

  const handleReferenceFile = async (file: File) => {
    setRefExtractBusy(true);
    setSearchError('');
    try {
      const extracted = await extractReferenceVisualFeatures(file);
      setRefPayload(extracted);
      if (browserItems.length > 0 || connState === 'connected') {
        await executeUnifiedSearch(extracted, textQuery, formatFilter);
      }
    } catch (err: any) {
      setSearchError(
        err?.message ||
          (isAr
            ? 'تعذر قراءة الملف المرجعي. جرّب صورة (PNG/JPG/WebP) أو فيديو (MP4/MOV) أو ملف SVGA.'
            : 'Could not read reference file.')
      );
    } finally {
      setRefExtractBusy(false);
    }
  };

  // Result File Actions
  const getResultFile = async (
    item: LocalGiftSearchResult & { source: 'browser' | 'agent' }
  ): Promise<File | null> => {
    if (item.source === 'browser') {
      const f = await resolveBrowserLocalFile(item.id);
      if (f) return f;
      setSearchError(
        isAr
          ? 'انتهت جلسة المتصفح لهذا المجلد — اضغط "تحديث" بجانب اسم المجلد لإعادة الربط الفوري.'
          : 'Browser session expired for this folder — click Refresh next to the folder name.'
      );
      return null;
    }
    return await LocalDesktopAgentClient.fetchLocalFile(token, item.path, item.name);
  };

  const handleLoadIntoConverter = async (
    item: LocalGiftSearchResult & { source: 'browser' | 'agent' }
  ) => {
    try {
      const file = await getResultFile(item);
      if (file && typeof (window as any).MotionTools?.load === 'function') {
        (window as any).MotionTools.load(file);
      }
    } catch (err: any) {
      setSearchError(err?.message || 'Failed to open file');
    }
  };

  const handleLoadIntoSvgaEditor = async (
    item: LocalGiftSearchResult & { source: 'browser' | 'agent' }
  ) => {
    try {
      const file = await getResultFile(item);
      if (file && typeof (window as any).__openInSvgaEditor === 'function') {
        (window as any).__openInSvgaEditor(file);
      }
    } catch (err: any) {
      setSearchError(err?.message || 'Failed to open in SVGA Editor');
    }
  };

  const handleOpenInExplorer = async (item: LocalGiftSearchResult) => {
    try {
      await LocalDesktopAgentClient.openLocationInExplorer(token, item.path);
      setActionMsg(
        isAr ? `📂 تم فتح مكان الملف في ويندوز: ${item.name}` : `📂 Revealed in Explorer: ${item.name}`
      );
      setTimeout(() => setActionMsg(''), 3500);
    } catch (err: any) {
      setSearchError(err?.message || 'Failed to open Explorer');
    }
  };

  const handleDownloadCopy = async (
    item: LocalGiftSearchResult & { source: 'browser' | 'agent' }
  ) => {
    const file = await getResultFile(item);
    if (!file) return;
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = item.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  // Optional Desktop Agent handlers
  const handlePairSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pairingInput.trim()) return;
    setPairingBusy(true);
    setPairingError('');
    try {
      const { token: newToken } = await LocalDesktopAgentClient.pair(pairingInput.trim());
      setToken(newToken);
      setPairingInput('');
      await refreshAgentState(newToken);
    } catch (err: any) {
      setPairingError(
        err?.message ||
          (isAr ? 'كود الربط غير صحيح.' : 'Invalid pairing PIN.')
      );
    } finally {
      setPairingBusy(false);
    }
  };

  const handlePickAgentFolder = async () => {
    setAgentFolderBusy(true);
    try {
      const res = await LocalDesktopAgentClient.pickFolderNative(token);
      setAgentFolders(res.folders || []);
      await refreshAgentState(token);
    } finally {
      setAgentFolderBusy(false);
    }
  };

  const handleAddAgentFolderPath = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualFolderInput.trim()) return;
    setAgentFolderBusy(true);
    try {
      const res = await LocalDesktopAgentClient.addFolderPath(token, manualFolderInput.trim());
      setAgentFolders(res.folders || []);
      setManualFolderInput('');
      await refreshAgentState(token);
    } finally {
      setAgentFolderBusy(false);
    }
  };

  const dir = isAr ? 'rtl' : 'ltr';

  return (
    <div
      id="aiGiftFinderContainer"
      dir={dir}
      style={{
        height: '100%',
        overflowY: 'auto',
        background:
          'radial-gradient(ellipse at 50% 0%, rgba(124, 92, 255, 0.14) 0%, #090a12 52%, #07080d 100%)',
        color: '#f1f5f9',
        padding: '18px 24px 48px',
        fontFamily: 'inherit',
      }}
    >
      {/* Hidden native webkitdirectory folder fallback */}
      <input
        ref={dirFallbackInputRef}
        id="browserLocalFolderFallbackInput"
        type="file"
        hidden
        multiple
        // @ts-expect-error webkitdirectory is supported by Chromium/Edge/Firefox/Safari
        webkitdirectory=""
        onChange={(e) => {
          handleFallbackDirectorySelected(e.target.files);
          e.target.value = '';
        }}
      />

      <div style={{ maxWidth: '1220px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Clean, Friendly Top Header */}
        <header
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            background: 'rgba(18, 19, 30, 0.92)',
            border: '1px solid rgba(124, 92, 255, 0.3)',
            borderRadius: '16px',
            padding: '14px 18px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #7c5cff, #4f46e5)',
                display: 'grid',
                placeItems: 'center',
                fontSize: '20px',
                flexShrink: 0,
              }}
            >
              🔍
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: '18.5px', fontWeight: 900, color: '#ffffff' }}>
                {isAr
                  ? 'ابحث عن أي هدية داخل جهازك بالصورة أو الفيديو'
                  : 'Find Any Gift on Your Device by Image or Video'}
              </h1>
              <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: '#94a3b8' }}>
                {isAr
                  ? 'اختر مجلد الهدايا من جهازك مرة واحدة، ثم ارفع أي صورة أو فيديو ليجلب لك الموقع الملف الأصلي فوراً بدون رفع ملفاتك للإنترنت.'
                  : 'Pick your local folder once, then drop any image or video to locate the original file locally — zero uploads.'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span
              data-testid="agent-connection-badge"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '99px',
                fontSize: '12px',
                fontWeight: 800,
                background: hasAnyIndex ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                border: hasAnyIndex
                  ? '1px solid rgba(16, 185, 129, 0.5)'
                  : '1px solid rgba(245, 158, 11, 0.5)',
                color: hasAnyIndex ? '#6ee7b7' : '#fde047',
              }}
            >
              <span>{hasAnyIndex ? '🟢' : '📁'}</span>
              <span>
                {hasAnyIndex
                  ? isAr
                    ? `جاهز للبحث • ${totalIndexedCount} ملف على جهازك`
                    : `Ready • ${totalIndexedCount} local files`
                  : isAr
                    ? 'اختر مجلد الهدايا من جهازك للبدء'
                    : 'Choose a local folder to start'}
              </span>
            </span>

            <button
              type="button"
              id="toggleDesktopAgentDrawerBtn"
              onClick={() => setAgentDrawerOpen((p) => !p)}
              style={{
                padding: '6px 12px',
                borderRadius: '10px',
                border:
                  connState === 'connected'
                    ? '1px solid rgba(16, 185, 129, 0.5)'
                    : '1px solid #334155',
                background:
                  connState === 'connected' ? 'rgba(16, 185, 129, 0.12)' : '#141522',
                color: connState === 'connected' ? '#6ee7b7' : '#cbd5e1',
                fontSize: '11.5px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              🪟{' '}
              {connState === 'connected'
                ? isAr
                  ? 'برنامج ويندوز متصل'
                  : 'Windows Agent Connected'
                : isAr
                  ? 'برنامج ويندوز المساعد (اختياري)'
                  : 'Windows Agent (Optional)'}
            </button>
          </div>
        </header>

        {/* Simple Two-Step Workspace */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
            gap: '16px',
            alignItems: 'stretch',
          }}
        >
          {/* STEP 1: Pick Folder on Your PC */}
          <section
            id="step1LocalFolderCard"
            style={{
              background: 'rgba(18, 19, 30, 0.92)',
              border:
                browserFolders.length > 0
                  ? '1px solid rgba(16, 185, 129, 0.45)'
                  : '1px solid rgba(124, 92, 255, 0.45)',
              borderRadius: '16px',
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '99px',
                    background: 'rgba(124, 92, 255, 0.25)',
                    color: '#ddd6fe',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: '12px',
                    fontWeight: 900,
                  }}
                >
                  1
                </span>
                <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 900, color: '#fff' }}>
                  {isAr ? 'اختر مجلد الهدايا من جهازك' : 'Choose Gifts Folder on Your PC'}
                </h2>
              </div>

              <button
                type="button"
                id="pickBrowserLocalFolderBtn"
                onClick={handlePickBrowserFolder}
                disabled={Boolean(indexingProgress)}
                style={{
                  padding: '9px 16px',
                  borderRadius: '10px',
                  border: 0,
                  background: 'linear-gradient(135deg, #7c5cff, #5b21b6)',
                  color: '#fff',
                  fontSize: '12.5px',
                  fontWeight: 800,
                  cursor: indexingProgress ? 'wait' : 'pointer',
                  boxShadow: '0 4px 14px rgba(124, 92, 255, 0.35)',
                }}
              >
                📁 {browserFolders.length > 0 ? (isAr ? '+ إضافة مجلد آخر' : '+ Add Another Folder') : (isAr ? 'اختر مجلد من جهازي الآن' : 'Select Folder on Device')}
              </button>
            </div>

            {indexingProgress && (
              <div
                style={{
                  background: '#0d0f1a',
                  border: '1px solid rgba(124, 92, 255, 0.4)',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  fontSize: '12px',
                  color: '#c4b5fd',
                }}
              >
                ⏳ {isAr ? 'جاري تجهيز وفهرسة الملفات محلياً:' : 'Indexing local files:'}{' '}
                <b>
                  {indexingProgress.done}/{indexingProgress.total}
                </b>{' '}
                — <span style={{ color: '#94a3b8' }}>{indexingProgress.fileName}</span>
              </div>
            )}

            {folderStatusMsg && (
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: folderStatusMsg.type === 'ok' ? '#6ee7b7' : '#fca5a5',
                  background:
                    folderStatusMsg.type === 'ok'
                      ? 'rgba(16, 185, 129, 0.1)'
                      : 'rgba(239, 68, 68, 0.1)',
                  border:
                    folderStatusMsg.type === 'ok'
                      ? '1px solid rgba(16, 185, 129, 0.35)'
                      : '1px solid rgba(239, 68, 68, 0.35)',
                  borderRadius: '8px',
                  padding: '8px 10px',
                }}
              >
                {folderStatusMsg.text}
              </div>
            )}

            {browserFolders.length === 0 ? (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  textAlign: 'center',
                  gap: '8px',
                  border: '1px dashed #334155',
                  borderRadius: '12px',
                  padding: '18px',
                  background: 'rgba(11, 14, 26, 0.6)',
                }}
              >
                <div style={{ fontSize: '26px' }}>📂</div>
                <div style={{ fontSize: '12.5px', color: '#cbd5e1', lineHeight: 1.6 }}>
                  {isAr
                    ? 'اضغط "اختر مجلد من جهازي الآن" وحدد المجلد الذي تحفظ فيه هداياك (SVGA, PAG, VAP, MP4, صور) — لن يتم رفع أي ملف إلى الإنترنت.'
                    : 'Click "Select Folder on Device" to pick your local gifts folder — nothing leaves your PC.'}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {browserFolders.map((f) => (
                  <div
                    key={f.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      padding: '8px 12px',
                      borderRadius: '10px',
                      background: '#111320',
                      border: '1px solid #2b2d42',
                      fontSize: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <span>📁</span>
                      <span style={{ fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.name}
                      </span>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '99px',
                          background: 'rgba(124, 92, 255, 0.2)',
                          color: '#c4b5fd',
                          fontSize: '11px',
                          fontWeight: 800,
                        }}
                      >
                        {f.fileCount} {isAr ? 'ملف' : 'files'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => handleRefreshSavedFolder(f)}
                        title={isAr ? 'تحديث ملفات هذا المجلد' : 'Refresh folder'}
                        style={{
                          padding: '4px 8px',
                          borderRadius: '7px',
                          border: '1px solid #334155',
                          background: '#161826',
                          color: '#cbd5e1',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        🔄 {isAr ? 'تحديث' : 'Refresh'}
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${f.name}`}
                        onClick={() => handleRemoveBrowserFolder(f.id)}
                        style={{
                          padding: '3px 8px',
                          borderRadius: '7px',
                          border: '1px solid rgba(239, 68, 68, 0.35)',
                          background: 'rgba(239, 68, 68, 0.1)',
                          color: '#fca5a5',
                          fontSize: '12px',
                          fontWeight: 900,
                          cursor: 'pointer',
                        }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* STEP 2: Upload Reference Image or Video to Search */}
          <section
            id="step2ReferenceSearchCard"
            style={{
              background: 'rgba(18, 19, 30, 0.92)',
              border: '1px solid #26273b',
              borderRadius: '16px',
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '99px',
                  background: 'rgba(124, 92, 255, 0.25)',
                  color: '#ddd6fe',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: '12px',
                  fontWeight: 900,
                }}
              >
                2
              </span>
              <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 900, color: '#fff' }}>
                {isAr ? 'ارفع صورة أو فيديو الهدية للبحث عنها' : 'Upload Gift Image or Video to Search'}
              </h2>
            </div>

            <div
              id="referenceDropZone"
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragOver(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragOver(false);
                const dropped = e.dataTransfer?.files?.[0];
                if (dropped) handleReferenceFile(dropped);
              }}
              style={{
                border: isDragOver ? '2px dashed #a78bfa' : '2px dashed rgba(124, 92, 255, 0.45)',
                borderRadius: '12px',
                background: isDragOver ? 'rgba(124, 92, 255, 0.14)' : 'rgba(11, 14, 26, 0.78)',
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                gap: '8px',
                minHeight: '126px',
              }}
            >
              <input
                ref={refFileInputRef}
                id="referenceFileInput"
                type="file"
                hidden
                accept="image/*,video/*,.svga,.gif,.webp,.png,.jpg,.jpeg,.mp4,.webm,.mov"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleReferenceFile(f);
                }}
              />
              {refPayload?.previewDataUrl ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
                  <img
                    src={refPayload.previewDataUrl}
                    alt={refPayload.fileName}
                    style={{
                      width: '72px',
                      height: '72px',
                      objectFit: 'contain',
                      borderRadius: '10px',
                      background: '#090b14',
                      border: '1px solid #2b2d42',
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ textAlign: isAr ? 'right' : 'left', minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontSize: '13px',
                        fontWeight: 800,
                        color: '#fff',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {refPayload.fileName}
                    </div>
                    <div style={{ fontSize: '11px', color: '#a78bfa', marginTop: '2px' }}>
                      {refPayload.fileType.toUpperCase()} • {refPayload.width}×{refPayload.height}
                    </div>
                    <button
                      type="button"
                      onClick={() => refFileInputRef.current?.click()}
                      style={{
                        marginTop: '6px',
                        padding: '5px 10px',
                        borderRadius: '8px',
                        border: '1px solid rgba(124, 92, 255, 0.5)',
                        background: 'rgba(124, 92, 255, 0.16)',
                        color: '#ddd6fe',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {isAr ? 'تغيير الصورة / الفيديو' : 'Change Reference'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: '24px' }}>{refExtractBusy ? '⏳' : '🖼️🎬'}</div>
                  <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#e2e8f0' }}>
                    {refExtractBusy
                      ? isAr
                        ? 'جاري قراءة الصورة / الفيديو...'
                        : 'Reading reference...'
                      : isAr
                        ? 'اسحب صورة أو فيديو الهدية هنا'
                        : 'Drag & drop gift image or video here'}
                  </div>
                  <button
                    type="button"
                    id="selectReferenceFileBtn"
                    onClick={() => refFileInputRef.current?.click()}
                    style={{
                      padding: '7px 15px',
                      borderRadius: '9px',
                      border: '1px solid rgba(124, 92, 255, 0.65)',
                      background: 'rgba(124, 92, 255, 0.2)',
                      color: '#fff',
                      fontSize: '12px',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    {isAr ? 'رفع صورة أو فيديو من الجهاز' : 'Upload Image / Video'}
                  </button>
                </>
              )}
            </div>

            {!hasAnyIndex && refPayload && (
              <div
                style={{
                  background: 'rgba(245, 158, 11, 0.14)',
                  border: '1px solid rgba(245, 158, 11, 0.5)',
                  borderRadius: '9px',
                  padding: '8px 12px',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#fde047',
                }}
              >
                ⚠️{' '}
                {isAr
                  ? 'الصورة جاهزة! اضغط على "اختر مجلد من جهازي الآن" في الخطوة 1 لإظهار الملفات المطابقة فوراً.'
                  : 'Reference ready! Pick your local folder in Step 1 to run the search.'}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                id="localGiftTextQueryInput"
                type="text"
                value={textQuery}
                onChange={(e) => setTextQuery(e.target.value)}
                placeholder={isAr ? 'أو ابحث باسم الهدية (اختياري)...' : 'Or search by name...'}
                style={{
                  flex: 1,
                  minWidth: '150px',
                  padding: '9px 12px',
                  borderRadius: '9px',
                  border: '1px solid #2b2d42',
                  background: '#0b0e1a',
                  color: '#fff',
                  fontSize: '12px',
                }}
              />
              <select
                id="localGiftFormatFilter"
                aria-label={isAr ? 'تصفية الصيغة' : 'Format filter'}
                value={formatFilter}
                onChange={(e) => setFormatFilter(e.target.value)}
                style={{
                  flex: '0 0 auto',
                  width: 'auto',
                  padding: '9px 12px',
                  borderRadius: '9px',
                  border: '1px solid #2b2d42',
                  background: '#0b0e1a',
                  color: '#e2e8f0',
                  fontSize: '12px',
                  fontWeight: 700,
                }}
              >
                <option value="ALL">{isAr ? 'كل الصيغ' : 'All'}</option>
                <option value="SVGA">SVGA</option>
                <option value="PAG">PAG</option>
                <option value="VAP">VAP</option>
                <option value="YYEVA">YYEVA</option>
                <option value="MP4">MP4</option>
                <option value="PNG">PNG</option>
                <option value="WEBP">WebP</option>
                <option value="GIF">GIF</option>
              </select>
              <button
                type="button"
                id="runLocalGiftSearchBtn"
                disabled={searchBusy || !hasAnyIndex || (!refPayload && !textQuery.trim())}
                onClick={() => executeUnifiedSearch(refPayload, textQuery, formatFilter)}
                style={{
                  padding: '9px 16px',
                  borderRadius: '9px',
                  border: 0,
                  background:
                    searchBusy || !hasAnyIndex || (!refPayload && !textQuery.trim())
                      ? '#26273b'
                      : 'linear-gradient(135deg, #7c5cff, #5b21b6)',
                  color: '#fff',
                  fontSize: '12.5px',
                  fontWeight: 800,
                  cursor:
                    searchBusy || !hasAnyIndex || (!refPayload && !textQuery.trim())
                      ? 'not-allowed'
                      : 'pointer',
                }}
              >
                {searchBusy ? (isAr ? 'جاري البحث...' : 'Searching...') : isAr ? '🔍 ابحث' : '🔍 Search'}
              </button>
            </div>
          </section>
        </div>

        {/* Optional Windows Desktop Agent Collapsible Drawer */}
        {agentDrawerOpen && (
          <section
            id="optionalDesktopAgentDrawer"
            style={{
              background: 'rgba(16, 17, 29, 0.96)',
              border: '1px solid rgba(124, 92, 255, 0.35)',
              borderRadius: '16px',
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '14.5px', fontWeight: 900, color: '#fff' }}>
                  🪟 {isAr ? 'برنامج ويندوز المساعد (اختياري لفتح المجلد في Explorer تلقائياً)' : 'Optional Windows 10/11 Desktop Agent'}
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                  {isAr
                    ? 'اختياري: إذا أردت أيضاً زر "فتح مكانه في ويندوز" أو البحث في آلاف الملفات بالخلفية دون إعادة اختيار المجلد.'
                    : 'Optional: enables direct "Reveal in Windows Explorer" and persistent background disk indexing.'}
                </p>
              </div>
              <button
                type="button"
                id="recheckLocalAgentBtn"
                onClick={() => refreshAgentState()}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1px solid rgba(124, 92, 255, 0.45)',
                  background: 'rgba(124, 92, 255, 0.16)',
                  color: '#ddd6fe',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                🔄 {isAr ? 'فحص الاتصال' : 'Check Connection'}
              </button>
            </div>

            {connState === 'disconnected' && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                <span style={{ color: '#fca5a5', fontSize: '12px', fontWeight: 700 }}>
                  🔴 {isAr ? 'البرنامج المساعد غير مشغل حالياً على جهازك.' : 'Desktop agent is not running.'}
                </span>
                <button
                  type="button"
                  id="downloadWinAgentBatBtn"
                  onClick={() =>
                    downloadTextFile(
                      'SVGA520-Local-Agent-Setup.bat',
                      generateWindowsBatchInstaller(),
                      'application/x-bat;charset=utf-8'
                    )
                  }
                  style={{
                    padding: '8px 14px',
                    borderRadius: '9px',
                    border: 0,
                    background: 'linear-gradient(135deg, #7c5cff, #5b21b6)',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  ⬇️ {isAr ? 'تحميل مثبت Windows 10 / 11 (.bat)' : 'Download Windows Installer (.bat)'}
                </button>
                <button
                  type="button"
                  id="downloadWinAgentPs1Btn"
                  onClick={() =>
                    downloadTextFile(
                      'SVGA520Agent.ps1',
                      generateWindowsPowerShellAgentScript(),
                      'text/plain;charset=utf-8'
                    )
                  }
                  style={{
                    padding: '8px 14px',
                    borderRadius: '9px',
                    border: '1px solid #334155',
                    background: '#141522',
                    color: '#cbd5e1',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  📄 {isAr ? 'تحميل ملف PowerShell (.ps1)' : 'Download (.ps1)'}
                </button>
              </div>
            )}

            {connState === 'needs_pairing' && (
              <form
                onSubmit={handlePairSubmit}
                style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}
              >
                <input
                  id="agentPairingPinInput"
                  type="text"
                  value={pairingInput}
                  onChange={(e) => setPairingInput(e.target.value)}
                  placeholder={isAr ? 'أدخل كود الربط (6 أرقام)' : 'Enter 6-digit Pairing PIN'}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '9px',
                    border: '1px solid #334155',
                    background: '#0b0e1a',
                    color: '#fff',
                    fontSize: '12.5px',
                  }}
                />
                <button
                  type="submit"
                  id="submitAgentPairingBtn"
                  disabled={pairingBusy}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '9px',
                    border: 0,
                    background: 'linear-gradient(135deg, #7c5cff, #5b21b6)',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  {isAr ? 'تأكيد الربط' : 'Pair'}
                </button>
                {pairingError && <span style={{ color: '#fca5a5', fontSize: '12px' }}>{pairingError}</span>}
              </form>
            )}

            {connState === 'connected' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    type="button"
                    id="pickNativeFolderBtn"
                    disabled={agentFolderBusy}
                    onClick={handlePickAgentFolder}
                    style={{
                      padding: '7px 14px',
                      borderRadius: '9px',
                      border: 0,
                      background: 'linear-gradient(135deg, #7c5cff, #5b21b6)',
                      color: '#fff',
                      fontSize: '12px',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    📁 {isAr ? '+ اختيار مجلد في ويندوز' : '+ Pick Windows Folder'}
                  </button>
                  <form onSubmit={handleAddAgentFolderPath} style={{ display: 'flex', gap: '6px', flex: 1, minWidth: '220px' }}>
                    <input
                      id="manualFolderPathInput"
                      type="text"
                      value={manualFolderInput}
                      onChange={(e) => setManualFolderInput(e.target.value)}
                      placeholder="D:\Gifts\SVGA"
                      style={{
                        flex: 1,
                        padding: '7px 10px',
                        borderRadius: '8px',
                        border: '1px solid #2b2d42',
                        background: '#0b0e1a',
                        color: '#fff',
                        fontSize: '12px',
                      }}
                    />
                    <button
                      type="submit"
                      id="addFolderPathBtn"
                      style={{
                        padding: '7px 12px',
                        borderRadius: '8px',
                        border: '1px solid rgba(16, 185, 129, 0.5)',
                        background: 'rgba(16, 185, 129, 0.14)',
                        color: '#6ee7b7',
                        fontSize: '11.5px',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      + {isAr ? 'إضافة' : 'Add'}
                    </button>
                  </form>
                  <button
                    type="button"
                    onClick={() => {
                      saveAgentToken('');
                      setToken('');
                      refreshAgentState('');
                    }}
                    style={{
                      padding: '7px 10px',
                      borderRadius: '8px',
                      border: '1px solid rgba(239, 68, 68, 0.35)',
                      background: 'rgba(239, 68, 68, 0.1)',
                      color: '#fca5a5',
                      fontSize: '11.5px',
                      cursor: 'pointer',
                    }}
                  >
                    {isAr ? 'فصل' : 'Disconnect'}
                  </button>
                </div>
                {agentFolders.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {agentFolders.map((af) => (
                      <span
                        key={af.path}
                        dir="ltr"
                        style={{
                          padding: '4px 10px',
                          borderRadius: '8px',
                          background: '#0b0e1a',
                          border: '1px solid #2b2d42',
                          fontSize: '11.5px',
                          color: '#cbd5e1',
                        }}
                      >
                        📁 {af.path} ({af.fileCount})
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {searchError && (
          <div style={{ color: '#fca5a5', fontSize: '12.5px', fontWeight: 700 }}>⚠️ {searchError}</div>
        )}
        {actionMsg && (
          <div style={{ color: '#6ee7b7', fontSize: '12.5px', fontWeight: 700 }}>{actionMsg}</div>
        )}

        {/* Search Results Grid */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 900, color: '#fff' }}>
              {isAr ? 'النتائج المطابقة من جهازك' : 'Matching Files From Your Device'}
              {searchMeta && (
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#a78bfa', marginInlineStart: '10px' }}>
                  {isAr
                    ? `(${searchResults.length} نتيجة من أصل ${searchMeta.searchedCount} ملف • ${searchMeta.durationMs}ms)`
                    : `(${searchResults.length} matches from ${searchMeta.searchedCount} files • ${searchMeta.durationMs}ms)`}
                </span>
              )}
            </h3>
          </div>

          {searchResults.length === 0 ? (
            <div
              style={{
                background: 'rgba(18, 19, 30, 0.65)',
                border: '1px dashed #26273b',
                borderRadius: '14px',
                padding: '28px',
                textAlign: 'center',
                color: '#94a3b8',
                fontSize: '13px',
              }}
            >
              {searchMeta
                ? isAr
                  ? 'لم يتم العثور على ملفات مطابقة داخل المجلدات المحددة.'
                  : 'No matching files found inside selected folders.'
                : isAr
                  ? 'اختر مجلد الهدايا من جهازك في الخطوة 1 ثم ارفع صورة أو فيديو في الخطوة 2 لتظهر الملفات المطابقة هنا.'
                  : 'Select your local folder in Step 1 and drop an image/video in Step 2 to view matching files.'}
            </div>
          ) : (
            <div
              data-testid="gift-finder-results-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: '14px',
              }}
            >
              {searchResults.map((item) => (
                <article
                  key={`${item.source}::${item.id}`}
                  style={{
                    background: 'rgba(20, 21, 34, 0.94)',
                    border: '1px solid #2b2d42',
                    borderRadius: '14px',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    boxShadow: '0 8px 20px rgba(0,0,0,0.3)',
                  }}
                >
                  <div
                    style={{
                      position: 'relative',
                      height: '145px',
                      borderRadius: '10px',
                      background: '#0b0e1a',
                      border: '1px solid #1e2030',
                      display: 'grid',
                      placeItems: 'center',
                      overflow: 'hidden',
                    }}
                  >
                    {item.thumbnailDataUrl ? (
                      <img
                        src={item.thumbnailDataUrl}
                        alt={item.name}
                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                      />
                    ) : (
                      <div style={{ fontSize: '24px', fontWeight: 900, color: '#64748b' }}>
                        {item.format}
                      </div>
                    )}
                    <span
                      style={{
                        position: 'absolute',
                        top: '8px',
                        insetInlineStart: '8px',
                        padding: '3px 9px',
                        borderRadius: '99px',
                        background:
                          item.score >= 80
                            ? 'rgba(16, 185, 129, 0.9)'
                            : item.score >= 55
                              ? 'rgba(124, 92, 255, 0.9)'
                              : 'rgba(51, 65, 85, 0.92)',
                        color: '#fff',
                        fontSize: '11px',
                        fontWeight: 900,
                      }}
                    >
                      {item.score}% {isAr ? 'تطابق' : 'Match'}
                    </span>
                    <span
                      style={{
                        position: 'absolute',
                        top: '8px',
                        insetInlineEnd: '8px',
                        padding: '2px 7px',
                        borderRadius: '6px',
                        background: 'rgba(9, 10, 18, 0.85)',
                        border: '1px solid #334155',
                        color: '#c4b5fd',
                        fontSize: '10px',
                        fontWeight: 800,
                      }}
                    >
                      {item.format}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div
                      title={item.name}
                      style={{
                        fontSize: '13px',
                        fontWeight: 800,
                        color: '#fff',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.name}
                    </div>
                    <div
                      dir="ltr"
                      title={item.path}
                      style={{
                        fontSize: '11px',
                        color: '#94a3b8',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      📁 {item.path}
                    </div>
                    <div style={{ fontSize: '11px', color: '#a78bfa', fontWeight: 700 }}>
                      {item.width > 0 ? `${item.width}×${item.height} • ` : ''}
                      {formatBytes(item.sizeBytes)}
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '6px',
                      marginTop: 'auto',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => handleLoadIntoConverter(item)}
                      style={{
                        padding: '7px 8px',
                        borderRadius: '8px',
                        border: '1px solid rgba(124, 92, 255, 0.45)',
                        background: 'rgba(124, 92, 255, 0.16)',
                        color: '#ddd6fe',
                        fontSize: '11px',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      ⚡ {isAr ? 'فتح في المعالجة' : 'Converter'}
                    </button>

                    {item.format === 'SVGA' ? (
                      <button
                        type="button"
                        onClick={() => handleLoadIntoSvgaEditor(item)}
                        style={{
                          padding: '7px 8px',
                          borderRadius: '8px',
                          border: '1px solid rgba(124, 92, 255, 0.65)',
                          background: 'linear-gradient(135deg, #7c5cff, #5b21b6)',
                          color: '#fff',
                          fontSize: '11px',
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        ✨ {isAr ? 'محرر SVGA' : 'SVGA Editor'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleDownloadCopy(item)}
                        style={{
                          padding: '7px 8px',
                          borderRadius: '8px',
                          border: '1px solid #334155',
                          background: '#141625',
                          color: '#e2e8f0',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        💾 {isAr ? 'حفظ / تحميل' : 'Save Copy'}
                      </button>
                    )}

                    {item.source === 'agent' && (
                      <button
                        type="button"
                        onClick={() => handleOpenInExplorer(item)}
                        style={{
                          gridColumn: 'span 2',
                          padding: '7px 8px',
                          borderRadius: '8px',
                          border: '1px solid rgba(16, 185, 129, 0.45)',
                          background: 'rgba(16, 185, 129, 0.14)',
                          color: '#6ee7b7',
                          fontSize: '11px',
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        📂 {isAr ? 'فتح موقع الملف في ويندوز' : 'Open Location in Windows'}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
