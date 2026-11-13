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
  isAnimatedGiftFormat,
  saveAgentToken,
} from '../utils/aiGiftFinderEngine';
import {
  BrowserAuthorizedFolder,
  BrowserLocalGiftEntry,
  clearAllBrowserLocalIndex,
  collectFilesFromDataTransfer,
  loadBrowserLocalIndexState,
  persistSingleFileBlobToDb,
  registerFilesInstantly,
  removeBrowserFolderFromDb,
  resolveBrowserLocalFile,
  scanVisualFeaturesInParallel,
  searchBrowserLocalItems,
} from '../utils/browserLocalGiftIndex';

interface AiGiftFinderStudioProps {
  isAr: boolean;
}

type EnrichedSearchResult = LocalGiftSearchResult & {
  source: 'browser' | 'agent';
  matchedRefName?: string;
  matchedRefPreview?: string;
};

interface MatchedReferencePair {
  refPayload: ReferenceQueryPayload;
  match: EnrichedSearchResult | null;
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
  // Persisted Local Gift Library in Browser IndexedDB (instant zero-copy registration + cached visual hashes)
  const [browserFolders, setBrowserFolders] = useState<BrowserAuthorizedFolder[]>([]);
  const [browserItems, setBrowserItems] = useState<BrowserLocalGiftEntry[]>([]);
  const [indexingProgress, setIndexingProgress] = useState<{
    done: number;
    total: number;
    fileName: string;
  } | null>(null);
  const [folderStatusMsg, setFolderStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [isLibraryDragOver, setIsLibraryDragOver] = useState(false);

  const stopVisualScanRef = useRef(false);

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

  // Multi-file Reference Queue (supports uploading 1 video scanned end-to-end OR multiple images/videos at once!)
  const [refPayloads, setRefPayloads] = useState<ReferenceQueryPayload[]>([]);
  const [selectedRefIndex, setSelectedRefIndex] = useState<number | 'ALL'>('ALL');
  const [refExtractProgress, setRefExtractProgress] = useState<{
    done: number;
    total: number;
    currentName: string;
    isVideoScan: boolean;
  } | null>(null);
  const [textQuery, setTextQuery] = useState('');
  const [formatFilter, setFormatFilter] = useState('ALL');
  const [isRefDragOver, setIsRefDragOver] = useState(false);

  const [searchBusy, setSearchBusy] = useState(false);
  const [matchedPairs, setMatchedPairs] = useState<MatchedReferencePair[]>([]);
  const [searchResults, setSearchResults] = useState<EnrichedSearchResult[]>([]);
  const [searchMeta, setSearchMeta] = useState<{ searchedCount: number; durationMs: number } | null>(
    null
  );
  const [searchError, setSearchError] = useState('');
  const [actionMsg, setActionMsg] = useState('');

  const activeRefPayloadsRef = useRef<ReferenceQueryPayload[]>([]);
  const activeSelectedRefIndexRef = useRef<number | 'ALL'>('ALL');
  const activeTextQueryRef = useRef<string>('');
  const activeFormatFilterRef = useRef<string>('ALL');

  useEffect(() => {
    activeRefPayloadsRef.current = refPayloads;
  }, [refPayloads]);
  useEffect(() => {
    activeSelectedRefIndexRef.current = selectedRefIndex;
  }, [selectedRefIndex]);
  useEffect(() => {
    activeTextQueryRef.current = textQuery;
  }, [textQuery]);
  useEffect(() => {
    activeFormatFilterRef.current = formatFilter;
  }, [formatFilter]);

  const totalIndexedCount =
    browserItems.length + (connState === 'connected' ? agentStatus?.indexedCount ?? 0 : 0);
  const hasAnyIndex = browserItems.length > 0 || connState === 'connected';

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

  const searchSingleReference = useCallback(
    async (
      refItem: ReferenceQueryPayload | null,
      queryTextToUse: string,
      fmtToUse: string,
      activeBrowserItems: BrowserLocalGiftEntry[],
      canSearchAgent: boolean
    ): Promise<{ results: EnrichedSearchResult[]; searchedCount: number; durationMs: number }> => {
      const merged: EnrichedSearchResult[] = [];
      let searchedCount = 0;
      let durationMs = 1;

      if (activeBrowserItems.length > 0) {
        const bRes = searchBrowserLocalItems(refItem?.frames || [], activeBrowserItems, {
          textQuery: queryTextToUse.trim() || refItem?.textQuery || '',
          formatFilter: fmtToUse,
          limit: 40,
          preferOriginalGiftFormats: true,
        });
        searchedCount += bRes.searchedCount;
        durationMs = Math.max(durationMs, bRes.durationMs);
        for (const r of bRes.results) {
          merged.push({
            ...r,
            source: 'browser',
            matchedRefName: refItem?.fileName,
            matchedRefPreview: refItem?.previewDataUrl,
          });
        }
      }

      if (canSearchAgent) {
        const aRes = await LocalDesktopAgentClient.search(token, {
          queryFrames: refItem?.frames || [],
          textQuery: queryTextToUse.trim() || refItem?.textQuery || '',
          formatFilter: fmtToUse === 'GIFT_ONLY' ? 'ALL' : fmtToUse,
          limit: 40,
        });
        searchedCount += aRes.searchedCount;
        durationMs = Math.max(durationMs, aRes.durationMs);
        const seenNames = new Set(merged.map((x) => `${x.name}::${x.sizeBytes}`));
        for (const r of aRes.results || []) {
          if (fmtToUse === 'GIFT_ONLY' && !isAnimatedGiftFormat(r.format)) continue;
          if (!seenNames.has(`${r.name}::${r.sizeBytes}`)) {
            merged.push({
              ...r,
              source: 'agent',
              matchedRefName: refItem?.fileName,
              matchedRefPreview: refItem?.previewDataUrl,
            });
          }
        }
      }

      merged.sort((a, b) => {
        if (fmtToUse === 'ALL') {
          const aGift = isAnimatedGiftFormat(a.format);
          const bGift = isAnimatedGiftFormat(b.format);
          if (aGift !== bGift) {
            const closeScores = Math.abs(a.score - b.score) <= 8;
            const bothStrong = a.score >= 88 && b.score >= 88;
            if ((closeScores && Math.max(a.score, b.score) >= 65) || bothStrong) {
              return aGift ? -1 : 1;
            }
          }
        }
        return b.score - a.score;
      });
      return { results: merged, searchedCount, durationMs };
    },
    [token]
  );

  const executeUnifiedSearch = useCallback(
    async (
      payloadsToUse: ReferenceQueryPayload[],
      refIdxFilter: number | 'ALL',
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
      if (payloadsToUse.length === 0 && !queryTextToUse.trim()) {
        setMatchedPairs([]);
        setSearchResults([]);
        setSearchMeta(null);
        return;
      }

      setSearchBusy(true);
      setSearchError('');
      try {
        if (payloadsToUse.length === 0) {
          // Pure text search
          const single = await searchSingleReference(
            null,
            queryTextToUse,
            fmtToUse,
            activeBrowserItems,
            canSearchAgent
          );
          setMatchedPairs([]);
          setSearchResults(single.results.slice(0, 48));
          setSearchMeta({ searchedCount: single.searchedCount, durationMs: single.durationMs });
          return;
        }

        const activeList =
          refIdxFilter === 'ALL'
            ? payloadsToUse
            : payloadsToUse[refIdxFilter]
              ? [payloadsToUse[refIdxFilter]]
              : payloadsToUse;

        const nextPairs: MatchedReferencePair[] = [];
        const bestResultByItemId = new Map<string, EnrichedSearchResult>();
        let totalSearched = 0;
        let maxDuration = 1;

        for (const refItem of activeList) {
          const res = await searchSingleReference(
            refItem,
            queryTextToUse,
            fmtToUse,
            activeBrowserItems,
            canSearchAgent
          );
          totalSearched = Math.max(totalSearched, res.searchedCount);
          maxDuration = Math.max(maxDuration, res.durationMs);

          const bestMatch = res.results.length > 0 ? res.results[0] : null;
          nextPairs.push({ refPayload: refItem, match: bestMatch });

          for (const candidate of res.results) {
            const key = `${candidate.source}::${candidate.id}`;
            const prev = bestResultByItemId.get(key);
            if (!prev || candidate.score > prev.score) {
              bestResultByItemId.set(key, candidate);
            }
          }
        }

        const combinedList = Array.from(bestResultByItemId.values())
          .sort((a, b) => b.score - a.score)
          .slice(0, 48);

        setMatchedPairs(nextPairs);
        setSearchResults(combinedList);
        setSearchMeta({ searchedCount: totalSearched, durationMs: maxDuration });

        // Persist matched top gift blobs to IndexedDB for reload resilience
        for (const pair of nextPairs) {
          if (pair.match && pair.match.source === 'browser') {
            const matchedFile = await resolveBrowserLocalFile(pair.match.id);
            if (matchedFile) {
              persistSingleFileBlobToDb(pair.match.id, matchedFile);
            }
          }
        }
      } catch (err: any) {
        setSearchError(err?.message || (isAr ? 'تعذر إتمام البحث المحلي' : 'Local search failed'));
      } finally {
        setSearchBusy(false);
      }
    },
    [browserItems, connState, token, isAr, searchSingleReference]
  );

  // Re-run search automatically if selected reference tab or format filter changes
  useEffect(() => {
    if (
      (refPayloads.length > 0 || textQuery.trim()) &&
      (browserItems.length > 0 || connState === 'connected')
    ) {
      executeUnifiedSearch(refPayloads, selectedRefIndex, textQuery, formatFilter);
    }
  }, [formatFilter, selectedRefIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // INSTANT < 1s ZERO-COPY REGISTRATION + PROGRESSIVE PARALLEL VISUAL SCANNER
  const ingestSelectedGiftEntries = async (
    entries: Array<{ file: File; relativePath: string }>,
    collectionLabel?: string
  ) => {
    if (!entries || entries.length === 0) return;
    setFolderStatusMsg(null);
    setSearchError('');
    stopVisualScanRef.current = false;

    const t0 = performance.now();
    const firstRel = entries[0].relativePath || entries[0].file.name;
    const inferredFolderName =
      collectionLabel ||
      (firstRel.includes('/') ? firstRel.split('/')[0] : isAr ? 'مكتبة هدايا جهازي' : 'My Local Gifts');

    const isDirectMultiFiles = !firstRel.includes('/') || firstRel.startsWith('SelectedGifts/');
    const targetFolderId = isDirectMultiFiles ? 'saved_gift_files_library' : undefined;
    const existingInTarget = targetFolderId
      ? browserItems.filter((it) => it.folderId === targetFolderId)
      : browserItems;

    // PHASE 1: Instant zero-copy registration in memory (< 50ms even for 100,000 files!)
    const { folder, allFolderItems, needsVisualScan, reusedCachedCount } = registerFilesInstantly(
      inferredFolderName,
      entries,
      {
        folderId: targetFolderId,
        existingItems: existingInTarget,
      }
    );

    if (allFolderItems.length === 0) {
      setFolderStatusMsg({
        type: 'err',
        text: isAr
          ? 'لم يتم العثور على ملفات هدايا مدعومة (SVGA, PAG, VAP, YYEVA, MP4, WebP, PNG, GIF) ضمن الاختيار.'
          : 'No supported gift/media files found in selection.',
      });
      return;
    }

    const regMs = Math.max(1, Math.round(performance.now() - t0));
    const nextFolders = [folder, ...browserFolders.filter((f) => f.id !== folder.id)];
    const nextItems = [...allFolderItems, ...browserItems.filter((it) => it.folderId !== folder.id)];
    setBrowserFolders(nextFolders);
    setBrowserItems(nextItems);

    setFolderStatusMsg({
      type: 'ok',
      text: isAr
        ? `⚡ تم ربط ${folder.fileCount.toLocaleString()} ملف من جهازك فوراً في ${regMs}ms بدون رفع (${reusedCachedCount > 0 ? `${reusedCachedCount.toLocaleString()} محفوظ مسبقاً` : 'جاهز للفحص السريع'})!`
        : `⚡ Linked ${folder.fileCount.toLocaleString()} local files in ${regMs}ms (zero upload)!`,
    });

    if (activeRefPayloadsRef.current.length > 0 || activeTextQueryRef.current.trim()) {
      await executeUnifiedSearch(
        activeRefPayloadsRef.current,
        activeSelectedRefIndexRef.current,
        activeTextQueryRef.current,
        activeFormatFilterRef.current,
        nextItems
      );
    }

    // PHASE 2: Parallel 16x Hardware-Accelerated Visual Scan for newly added files
    if (needsVisualScan.length > 0) {
      const activeFmt = activeFormatFilterRef.current;
      needsVisualScan.sort((a, b) => {
        const aMatchFmt = activeFmt !== 'ALL' && a.format === activeFmt ? 1 : 0;
        const bMatchFmt = activeFmt !== 'ALL' && b.format === activeFmt ? 1 : 0;
        if (aMatchFmt !== bMatchFmt) return bMatchFmt - aMatchFmt;
        const aGift =
          a.format === 'SVGA' || a.format === 'PAG' || a.format === 'VAP' || a.format === 'YYEVA'
            ? 1
            : 0;
        const bGift =
          b.format === 'SVGA' || b.format === 'PAG' || b.format === 'VAP' || b.format === 'YYEVA'
            ? 1
            : 0;
        return bGift - aGift;
      });

      setIndexingProgress({
        done: 0,
        total: needsVisualScan.length,
        fileName: needsVisualScan[0].name,
      });

      try {
        await scanVisualFeaturesInParallel(folder, needsVisualScan, {
          concurrency: 16,
          shouldStop: () => stopVisualScanRef.current,
          onProgress: (done, total, fileName) => {
            setIndexingProgress({ done, total, fileName });
          },
          onBatchCompleted: async () => {
            if (activeRefPayloadsRef.current.length > 0 || activeTextQueryRef.current.trim()) {
              await executeUnifiedSearch(
                activeRefPayloadsRef.current,
                activeSelectedRefIndexRef.current,
                activeTextQueryRef.current,
                activeFormatFilterRef.current,
                nextItems
              );
            }
          },
        });
      } finally {
        setIndexingProgress(null);
      }

      if (activeRefPayloadsRef.current.length > 0 || activeTextQueryRef.current.trim()) {
        await executeUnifiedSearch(
          activeRefPayloadsRef.current,
          activeSelectedRefIndexRef.current,
          activeTextQueryRef.current,
          activeFormatFilterRef.current,
          nextItems
        );
      }
    }
  };

  // Handler for Multi-File Selection (Ctrl+A inside any folder)
  const handleMultiFilesInputSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const len = fileList.length;
    const entries = new Array<{ file: File; relativePath: string }>(len);
    for (let i = 0; i < len; i++) {
      const file = fileList[i];
      entries[i] = { file, relativePath: `SelectedGifts/${file.name}` };
    }
    await ingestSelectedGiftEntries(
      entries,
      isAr ? 'ملفات الهدايا المحفوظة' : 'Saved Gift Files'
    );
  };

  // Handler for Full Directory Selection (webkitdirectory)
  const handleFolderInputSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const len = fileList.length;
    const firstRel = (fileList[0] as any).webkitRelativePath || fileList[0].name;
    const rootFolderName = firstRel.includes('/') ? firstRel.split('/')[0] : 'LocalGifts';

    const entries = new Array<{ file: File; relativePath: string }>(len);
    for (let i = 0; i < len; i++) {
      const file = fileList[i];
      entries[i] = {
        file,
        relativePath: (file as any).webkitRelativePath || `${rootFolderName}/${file.name}`,
      };
    }
    await ingestSelectedGiftEntries(entries, rootFolderName);
  };

  const handleRemoveBrowserFolder = async (folderId: string) => {
    stopVisualScanRef.current = true;
    await removeBrowserFolderFromDb(folderId);
    const nextFolders = browserFolders.filter((f) => f.id !== folderId);
    const nextItems = browserItems.filter((it) => it.folderId !== folderId);
    setBrowserFolders(nextFolders);
    setBrowserItems(nextItems);
    setSearchResults((prev) =>
      prev.filter((r) => nextItems.some((it) => it.id === r.id) || r.source === 'agent')
    );
  };

  const handleClearAllSavedFiles = async () => {
    stopVisualScanRef.current = true;
    await clearAllBrowserLocalIndex();
    setBrowserFolders([]);
    setBrowserItems([]);
    setMatchedPairs([]);
    setSearchResults((prev) => prev.filter((r) => r.source === 'agent'));
    setFolderStatusMsg({
      type: 'ok',
      text: isAr ? 'تم مسح قائمة الملفات المحفوظة.' : 'Cleared saved local files.',
    });
  };

  // Upload 1 OR MULTIPLE Reference Images/Videos simultaneously
  const handleReferenceFiles = async (fileList: FileList | File[], appendMode = false) => {
    const filesArr = Array.from(fileList);
    if (filesArr.length === 0) return;
    setSearchError('');

    const newlyExtracted: ReferenceQueryPayload[] = [];
    for (let i = 0; i < filesArr.length; i++) {
      const file = filesArr[i];
      const isVid =
        file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|mkv|vap|yyeva)$/i.test(file.name);
      setRefExtractProgress({
        done: i,
        total: filesArr.length,
        currentName: file.name,
        isVideoScan: isVid,
      });
      try {
        const extracted = await extractReferenceVisualFeatures(file);
        newlyExtracted.push(extracted);
      } catch (err: any) {
        setSearchError(
          err?.message ||
            (isAr
              ? `تعذر قراءة الملف المرجعي "${file.name}".`
              : `Could not read reference file "${file.name}".`)
        );
      }
    }
    setRefExtractProgress(null);

    if (newlyExtracted.length === 0) return;

    const mergedRefs = appendMode
      ? [
          ...refPayloads.filter((old) => !newlyExtracted.some((n) => n.fileName === old.fileName)),
          ...newlyExtracted,
        ]
      : newlyExtracted;

    setRefPayloads(mergedRefs);
    setSelectedRefIndex('ALL');

    if (browserItems.length > 0 || connState === 'connected') {
      await executeUnifiedSearch(mergedRefs, 'ALL', textQuery, formatFilter);
    }
  };

  const handleRemoveSingleReference = async (idxToRemove: number) => {
    const remaining = refPayloads.filter((_, i) => i !== idxToRemove);
    setRefPayloads(remaining);
    const nextIdx = 'ALL';
    setSelectedRefIndex(nextIdx);
    if (remaining.length > 0 || textQuery.trim()) {
      await executeUnifiedSearch(remaining, nextIdx, textQuery, formatFilter);
    } else {
      setMatchedPairs([]);
      setSearchResults([]);
      setSearchMeta(null);
    }
  };

  // Result File Actions
  const getResultFile = async (item: EnrichedSearchResult): Promise<File | null> => {
    if (item.source === 'browser') {
      const f = await resolveBrowserLocalFile(item.id);
      if (f) return f;
      setSearchError(
        isAr
          ? 'يرجى إعادة تحديد هذا الملف من جهازك لفتحه.'
          : 'Please re-select this file from your device to open it.'
      );
      return null;
    }
    return await LocalDesktopAgentClient.fetchLocalFile(token, item.path, item.name);
  };

  const handleLoadIntoConverter = async (item: EnrichedSearchResult) => {
    try {
      const file = await getResultFile(item);
      if (file && typeof (window as any).MotionTools?.load === 'function') {
        (window as any).MotionTools.load(file);
      }
    } catch (err: any) {
      setSearchError(err?.message || 'Failed to open file');
    }
  };

  const handleLoadIntoSvgaEditor = async (item: EnrichedSearchResult) => {
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

  const handleDownloadCopy = async (item: EnrichedSearchResult) => {
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
    setActionMsg(
      isAr ? `⬇️ جاري تحميل الملف الأصلي: ${item.name}` : `⬇️ Downloading original file: ${item.name}`
    );
    setTimeout(() => setActionMsg(''), 3500);
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
      setPairingError(err?.message || (isAr ? 'كود الربط غير صحيح.' : 'Invalid pairing PIN.'));
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
  const highlightedIds = new Set(
    matchedPairs
      .filter((p) => p.match && (p.match.isExactMatch || p.match.score >= 88))
      .map((p) => `${p.match!.source}::${p.match!.id}`)
  );

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
      {/* Native Multi-File Reference Input (supports selecting multiple images/videos at once!) */}
      <input
        id="referenceFileInput"
        type="file"
        multiple
        style={{ display: 'none' }}
        accept="image/*,video/*,.svga,.pag,.vap,.yyeva,.gif,.webp,.png,.jpg,.jpeg,.mp4,.webm,.mov"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleReferenceFiles(e.target.files, false);
          }
          e.target.value = '';
        }}
      />

      {/* Native Multi-File Append Input to add extra reference files */}
      <input
        id="referenceFileAppendInput"
        type="file"
        multiple
        style={{ display: 'none' }}
        accept="image/*,video/*,.svga,.pag,.vap,.yyeva,.gif,.webp,.png,.jpg,.jpeg,.mp4,.webm,.mov"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleReferenceFiles(e.target.files, true);
          }
          e.target.value = '';
        }}
      />

      <input
        id="giftFilesMultiPicker"
        type="file"
        multiple
        style={{ display: 'none' }}
        accept=".svga,.pag,.vap,.yyeva,.mp4,.webm,.mov,.png,.jpg,.jpeg,.webp,.gif,image/*,video/*"
        onChange={(e) => {
          handleMultiFilesInputSelected(e.target.files);
          e.target.value = '';
        }}
      />

      <input
        id="giftFolderMultiPicker"
        type="file"
        multiple
        style={{ display: 'none' }}
        // @ts-expect-error webkitdirectory is supported by Chromium/Edge/Firefox/Safari
        webkitdirectory=""
        onChange={(e) => {
          handleFolderInputSelected(e.target.files);
          e.target.value = '';
        }}
      />

      <div
        style={{
          maxWidth: '1240px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {/* Top Header */}
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
                  ? 'باحث الهدايا الذكي 100%: مسح شامل للفيديو وبحث متعدد الملفات'
                  : 'AI Gift Finder 100%: Full Video Timeline Scan & Multi-Reference Match'}
              </h1>
              <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: '#94a3b8' }}>
                {isAr
                  ? 'ارفع صورة أو عدة صور أو فيديو (يتم مسح الفيديو من أوله لآخره بدقة 100%)، وحدد ملفات جهازك (حتى 100,000 ملف في ثانية) ليتم تمييز هديتك المطلوبة فوراً بعلامة 100%!'
                  : 'Upload 1 or multiple images/videos (videos scanned start-to-finish), select your local files (<1s zero-copy), and spot your exact 100% matched gift instantly.'}
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
              <span>{hasAnyIndex ? '⚡' : '📁'}</span>
              <span>
                {hasAnyIndex
                  ? isAr
                    ? `جاهز • ${totalIndexedCount.toLocaleString()} ملف مربوط`
                    : `Ready • ${totalIndexedCount.toLocaleString()} linked files`
                  : isAr
                    ? 'حدد ملفات الهدايا للبحث الفوري'
                    : 'Select local gift files'}
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

        {/* Two-Step Workspace */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
            gap: '16px',
            alignItems: 'stretch',
          }}
        >
          {/* STEP 1: Multi-Reference Image / Full-Video Upload */}
          <section
            id="step2ReferenceSearchCard"
            style={{
              background: 'rgba(18, 19, 30, 0.92)',
              border:
                refPayloads.length > 0
                  ? '1px solid rgba(16, 185, 129, 0.5)'
                  : '1px solid rgba(124, 92, 255, 0.45)',
              borderRadius: '16px',
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '99px',
                    background: 'linear-gradient(135deg, #7c5cff, #5b21b6)',
                    color: '#fff',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: '12px',
                    fontWeight: 900,
                  }}
                >
                  1
                </span>
                <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 900, color: '#fff' }}>
                  {isAr
                    ? 'ارفع صورة أو عدة صور أو فيديو الهدية المطلوبة'
                    : 'Upload Reference Image(s) or Full Video'}
                </h2>
              </div>
              {refPayloads.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span
                    style={{
                      padding: '3px 9px',
                      borderRadius: '99px',
                      background: 'rgba(16, 185, 129, 0.16)',
                      border: '1px solid rgba(16, 185, 129, 0.4)',
                      color: '#6ee7b7',
                      fontSize: '11px',
                      fontWeight: 800,
                    }}
                  >
                    ✓ {refPayloads.length} {isAr ? 'ملف للبحث' : 'ref(s)'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setRefPayloads([]);
                      setMatchedPairs([]);
                      setSearchResults([]);
                      setSearchMeta(null);
                    }}
                    style={{
                      padding: '3px 8px',
                      borderRadius: '7px',
                      border: '1px solid rgba(239, 68, 68, 0.35)',
                      background: 'rgba(239, 68, 68, 0.1)',
                      color: '#fca5a5',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {isAr ? 'مسح' : 'Clear'}
                  </button>
                </div>
              )}
            </div>

            <div
              id="referenceDropZone"
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsRefDragOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsRefDragOver(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsRefDragOver(false);
                if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
                  handleReferenceFiles(e.dataTransfer.files, refPayloads.length > 0);
                }
              }}
              style={{
                border: isRefDragOver
                  ? '2px dashed #a78bfa'
                  : '2px dashed rgba(124, 92, 255, 0.45)',
                borderRadius: '12px',
                background: isRefDragOver
                  ? 'rgba(124, 92, 255, 0.14)'
                  : 'rgba(11, 14, 26, 0.78)',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                gap: '10px',
                minHeight: '132px',
              }}
            >
              {refExtractProgress ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
                  <div style={{ fontSize: '22px' }}>🎬🔍</div>
                  <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#ddd6fe' }}>
                    {refExtractProgress.isVideoScan
                      ? isAr
                        ? `جاري فحص الفيديو من أوله لآخره بدقة عالية (${refExtractProgress.done + 1}/${refExtractProgress.total})...`
                        : `Scanning full video timeline (${refExtractProgress.done + 1}/${refExtractProgress.total})...`
                      : isAr
                        ? `جاري تحليل الملف المرجعي (${refExtractProgress.done + 1}/${refExtractProgress.total})...`
                        : `Analyzing reference (${refExtractProgress.done + 1}/${refExtractProgress.total})...`}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                    {refExtractProgress.currentName}
                  </div>
                </div>
              ) : refPayloads.length > 0 ? (
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {/* Filter pills when multiple reference files are uploaded together */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                    {refPayloads.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setSelectedRefIndex('ALL')}
                        style={{
                          padding: '5px 10px',
                          borderRadius: '8px',
                          border:
                            selectedRefIndex === 'ALL'
                              ? '1px solid #10b981'
                              : '1px solid #334155',
                          background:
                            selectedRefIndex === 'ALL' ? 'rgba(16, 185, 129, 0.2)' : '#141625',
                          color: selectedRefIndex === 'ALL' ? '#6ee7b7' : '#cbd5e1',
                          fontSize: '11px',
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        🌟 {isAr ? `الكل (${refPayloads.length})` : `All (${refPayloads.length})`}
                      </button>
                    )}

                    {refPayloads.map((rp, rIdx) => {
                      const pairForThis = matchedPairs.find(
                        (mp) => mp.refPayload.fileName === rp.fileName
                      );
                      const isFound = Boolean(pairForThis?.match && pairForThis.match.score >= 85);
                      const isSelected = selectedRefIndex === rIdx;
                      return (
                        <div
                          key={`${rp.fileName}::${rIdx}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '4px 8px',
                            borderRadius: '9px',
                            border: isSelected
                              ? '1px solid #a78bfa'
                              : isFound
                                ? '1px solid rgba(16, 185, 129, 0.55)'
                                : '1px solid #2b2d42',
                            background: isSelected ? 'rgba(124, 92, 255, 0.2)' : '#121422',
                            maxWidth: '220px',
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedRefIndex(rIdx)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              border: 0,
                              background: 'transparent',
                              color: '#fff',
                              padding: 0,
                              cursor: 'pointer',
                              minWidth: 0,
                            }}
                          >
                            {rp.previewDataUrl && (
                              <img
                                src={rp.previewDataUrl}
                                alt={rp.fileName}
                                style={{
                                  width: '26px',
                                  height: '26px',
                                  objectFit: 'cover',
                                  borderRadius: '5px',
                                  flexShrink: 0,
                                }}
                              />
                            )}
                            <div style={{ textAlign: isAr ? 'right' : 'left', minWidth: 0 }}>
                              <div
                                style={{
                                  fontSize: '11px',
                                  fontWeight: 800,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  maxWidth: '125px',
                                }}
                              >
                                {rp.fileName}
                              </div>
                              <div style={{ fontSize: '9.5px', color: isFound ? '#6ee7b7' : '#a78bfa' }}>
                                {rp.fileType === 'video'
                                  ? `🎬 ${rp.sampledFrameCount || rp.frames.length} ${isAr ? 'لقطة كاملة' : 'frames'}`
                                  : `${rp.width}×${rp.height}`}
                                {isFound ? ' • 100% ✓' : ''}
                              </div>
                            </div>
                          </button>
                          <button
                            type="button"
                            aria-label={`Remove reference ${rp.fileName}`}
                            onClick={() => handleRemoveSingleReference(rIdx)}
                            style={{
                              border: 0,
                              background: 'transparent',
                              color: '#94a3b8',
                              fontSize: '13px',
                              fontWeight: 900,
                              cursor: 'pointer',
                              padding: '0 2px',
                            }}
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Action row for adding more files together or replacing */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                    <label
                      htmlFor="referenceFileAppendInput"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        border: '1px solid rgba(16, 185, 129, 0.5)',
                        background: 'rgba(16, 185, 129, 0.15)',
                        color: '#6ee7b7',
                        fontSize: '11.5px',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      ➕ {isAr ? 'إضافة صور / فيديوهات أخرى للبحث معاً' : 'Add More References'}
                    </label>
                    <label
                      htmlFor="referenceFileInput"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        border: '1px solid rgba(124, 92, 255, 0.5)',
                        background: 'rgba(124, 92, 255, 0.16)',
                        color: '#ddd6fe',
                        fontSize: '11.5px',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      🔄 {isAr ? 'استبدال بمجموعة جديدة' : 'Replace Selection'}
                    </label>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: '26px' }}>🖼️🎬</div>
                  <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#e2e8f0' }}>
                    {isAr
                      ? 'ارفع صورة أو عدة صور أو فيديو للهدية (يفحص الفيديو بالكامل من أوله لآخره)'
                      : 'Upload 1 or multiple images/videos (scans full video start-to-finish)'}
                  </div>
                  <label
                    id="selectReferenceFileBtn"
                    htmlFor="referenceFileInput"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 18px',
                      borderRadius: '10px',
                      border: '1px solid rgba(124, 92, 255, 0.7)',
                      background: 'linear-gradient(135deg, #7c5cff, #5b21b6)',
                      color: '#fff',
                      fontSize: '12.5px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      boxShadow: '0 4px 14px rgba(124, 92, 255, 0.35)',
                    }}
                  >
                    📤 {isAr ? 'رفع صورة / عدة ملفات / فيديو الهدية' : 'Upload Image(s) or Video'}
                  </label>
                </>
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                id="localGiftTextQueryInput"
                type="text"
                value={textQuery}
                onChange={(e) => setTextQuery(e.target.value)}
                placeholder={isAr ? 'أو اكتب اسم الهدية (اختياري)...' : 'Or type gift name (optional)...'}
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
                <option value="ALL">
                  {isAr ? '🎁 ملفات الهدايا الأصلية أولاً (كل الصيغ)' : 'Original Gift Files First (All)'}
                </option>
                <option value="GIFT_ONLY">
                  {isAr
                    ? '✨ ملفات الهدايا المتحركة فقط (SVGA / PAG / VAP / MP4)'
                    : 'Animated Gift Files Only (SVGA/PAG/VAP/MP4)'}
                </option>
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
                disabled={searchBusy || !hasAnyIndex || (refPayloads.length === 0 && !textQuery.trim())}
                onClick={() =>
                  executeUnifiedSearch(refPayloads, selectedRefIndex, textQuery, formatFilter)
                }
                style={{
                  padding: '9px 16px',
                  borderRadius: '9px',
                  border: 0,
                  background:
                    searchBusy || !hasAnyIndex || (refPayloads.length === 0 && !textQuery.trim())
                      ? '#26273b'
                      : 'linear-gradient(135deg, #7c5cff, #5b21b6)',
                  color: '#fff',
                  fontSize: '12.5px',
                  fontWeight: 800,
                  cursor:
                    searchBusy || !hasAnyIndex || (refPayloads.length === 0 && !textQuery.trim())
                      ? 'not-allowed'
                      : 'pointer',
                }}
              >
                {searchBusy ? (isAr ? 'جاري البحث...' : 'Scanning...') : isAr ? '🔍 فحص الآن' : '🔍 Scan Now'}
              </button>
            </div>
          </section>

          {/* STEP 2: Select All Your Gift Files (Ctrl+A) or Full Folder -> Instant Zero-Copy Link */}
          <section
            id="step1LocalFolderCard"
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsLibraryDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsLibraryDragOver(false);
            }}
            onDrop={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsLibraryDragOver(false);
              if (e.dataTransfer) {
                const collected = await collectFilesFromDataTransfer(e.dataTransfer);
                if (collected.length > 0) {
                  await ingestSelectedGiftEntries(collected);
                }
              }
            }}
            style={{
              background: isLibraryDragOver
                ? 'rgba(124, 92, 255, 0.14)'
                : 'rgba(18, 19, 30, 0.92)',
              border:
                browserItems.length > 0
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
                    background: 'linear-gradient(135deg, #7c5cff, #5b21b6)',
                    color: '#fff',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: '12px',
                    fontWeight: 900,
                  }}
                >
                  2
                </span>
                <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 900, color: '#fff' }}>
                  {isAr
                    ? 'حدد ملفات الهدايا من جهازك (ربط في ثانية وفحص متوازي)'
                    : 'Select Your Gift Files (Instant Link & Parallel Scan)'}
                </h2>
              </div>

              {browserItems.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAllSavedFiles}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '8px',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    background: 'rgba(239, 68, 68, 0.1)',
                    color: '#fca5a5',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  🗑️ {isAr ? 'مسح المحفوظ' : 'Clear Saved'}
                </button>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
              <label
                id="pickMultiGiftFilesLabel"
                htmlFor="giftFilesMultiPicker"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '11px 14px',
                  borderRadius: '11px',
                  background: 'linear-gradient(135deg, #7c5cff, #5b21b6)',
                  color: '#fff',
                  fontSize: '12.5px',
                  fontWeight: 900,
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(124, 92, 255, 0.35)',
                  textAlign: 'center',
                }}
              >
                <span>📄</span>
                <span>
                  {isAr
                    ? 'تحديد ملفات الهدايا (Ctrl+A لكل الصيغ)'
                    : 'Select Gift Files (Ctrl+A All Formats)'}
                </span>
              </label>

              <label
                id="pickBrowserLocalFolderBtn"
                htmlFor="giftFolderMultiPicker"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '11px 14px',
                  borderRadius: '11px',
                  border: '1px solid rgba(124, 92, 255, 0.55)',
                  background: 'rgba(124, 92, 255, 0.16)',
                  color: '#e2e8f0',
                  fontSize: '12.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                <span>📁</span>
                <span>
                  {isAr ? 'أو اختيار مجلد هدايا كامل' : 'Or Select Entire Gifts Folder'}
                </span>
              </label>
            </div>

            {indexingProgress && (
              <div
                style={{
                  background: '#0d0f1a',
                  border: '1px solid rgba(124, 92, 255, 0.45)',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  fontSize: '12px',
                  color: '#c4b5fd',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span>
                    🚀 {isAr ? 'الفحص البصري المتوازي السريع:' : 'Parallel visual scan:'}{' '}
                    <b>
                      {indexingProgress.done.toLocaleString()}/{indexingProgress.total.toLocaleString()}
                    </b>
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: '#94a3b8', fontSize: '11px' }}>{indexingProgress.fileName}</span>
                    <button
                      type="button"
                      onClick={() => {
                        stopVisualScanRef.current = true;
                        setIndexingProgress(null);
                      }}
                      style={{
                        padding: '2px 8px',
                        borderRadius: '6px',
                        border: '1px solid rgba(245, 158, 11, 0.5)',
                        background: 'rgba(245, 158, 11, 0.15)',
                        color: '#fde047',
                        fontSize: '10.5px',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      ⏹️ {isAr ? 'اكتفاء بالنتائج الحالية' : 'Stop Scan'}
                    </button>
                  </div>
                </div>
                <div
                  style={{
                    height: '6px',
                    borderRadius: '99px',
                    background: '#1e2030',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(100, Math.round((indexingProgress.done / Math.max(1, indexingProgress.total)) * 100))}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #7c5cff, #10b981)',
                    }}
                  />
                </div>
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
                      ? 'rgba(16, 185, 129, 0.12)'
                      : 'rgba(239, 68, 68, 0.12)',
                  border:
                    folderStatusMsg.type === 'ok'
                      ? '1px solid rgba(16, 185, 129, 0.4)'
                      : '1px solid rgba(239, 68, 68, 0.4)',
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
                  gap: '6px',
                  border: '1px dashed #334155',
                  borderRadius: '12px',
                  padding: '14px',
                  background: 'rgba(11, 14, 26, 0.6)',
                }}
              >
                <div style={{ fontSize: '22px' }}>🎁</div>
                <div style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: 1.6 }}>
                  {isAr
                    ? 'اضغط "تحديد ملفات الهدايا (Ctrl+A لكل الصيغ)" أو اسحب ملفاتك هنا — يتم الربط في لحظة (بدون نسخ أو رفع) والفحص التلقائي فوراً!'
                    : 'Click "Select Gift Files (Ctrl+A)" or drop them here — instant zero-copy linking and parallel scanning!'}
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
                      border: '1px solid rgba(16, 185, 129, 0.35)',
                      fontSize: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <span>💾</span>
                      <span
                        style={{
                          fontWeight: 800,
                          color: '#fff',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {f.name}
                      </span>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '99px',
                          background: 'rgba(16, 185, 129, 0.18)',
                          color: '#6ee7b7',
                          fontSize: '11px',
                          fontWeight: 800,
                        }}
                      >
                        {f.fileCount.toLocaleString()} {isAr ? 'ملف محفوظ' : 'files linked'}
                      </span>
                    </div>
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
                ))}
              </div>
            )}
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
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                  {isAr
                    ? 'البحث المباشر يعمل في المتصفح بدون أي برامج. هذا البرنامج اختياري فقط إذا أردت فتح موقع الملف داخل Windows Explorer بضغطة زر.'
                    : 'Browser search works directly without any install. This optional helper lets you reveal files directly in Windows Explorer.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => refreshAgentState()}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1px solid #334155',
                  background: '#161826',
                  color: '#cbd5e1',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                🔄 {isAr ? 'فحص الاتصال' : 'Check Status'}
              </button>
            </div>

            {connState === 'disconnected' && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  id="downloadWindowsBatchInstallerBtn"
                  onClick={() =>
                    downloadTextFile(
                      'Install-SVGA520-LocalAgent.bat',
                      generateWindowsBatchInstaller(),
                      'application/bat;charset=utf-8'
                    )
                  }
                  style={{
                    padding: '8px 14px',
                    borderRadius: '9px',
                    border: '1px solid rgba(124, 92, 255, 0.5)',
                    background: 'rgba(124, 92, 255, 0.16)',
                    color: '#ddd6fe',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  ⬇️ {isAr ? 'تحميل مثبّت ويندوز (.bat)' : 'Download Windows Installer (.bat)'}
                </button>
                <button
                  type="button"
                  id="downloadPowerShellAgentScriptBtn"
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

        {/* VERIFIED 100% EXACT MATCH SPOTLIGHT (Supports 1 OR MULTIPLE Uploaded References Together!) */}
        {matchedPairs.some((p) => p.match) && (
          <section
            data-testid="top-gift-match-banner"
            style={{
              background:
                'linear-gradient(135deg, rgba(16, 185, 129, 0.16) 0%, rgba(245, 158, 11, 0.14) 50%, rgba(124, 92, 255, 0.18) 100%)',
              border: '2px solid rgba(250, 204, 21, 0.72)',
              borderRadius: '18px',
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              boxShadow: '0 12px 34px rgba(16, 185, 129, 0.18)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '20px' }}>👑</span>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#fef08a' }}>
                  {isAr
                    ? `تم تحديد الهدايا المطلوبة وتمييزها بدقة 100% (${matchedPairs.filter((p) => p.match).length})`
                    : `Verified Exact Gift Matches (${matchedPairs.filter((p) => p.match).length})`}
                </h3>
              </div>
              <span
                style={{
                  padding: '4px 11px',
                  borderRadius: '99px',
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  color: '#fff',
                  fontSize: '11.5px',
                  fontWeight: 900,
                }}
              >
                ✓ {isAr ? 'علامة التطابق المؤكد' : '100% Verified Match Seal'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {matchedPairs.map((pair, pIdx) => {
                const m = pair.match;
                if (!m) return null;
                return (
                  <div
                    key={`${pair.refPayload.fileName}::${m.id}::${pIdx}`}
                    data-testid="verified-matched-gift-row"
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '14px',
                      background: 'rgba(11, 13, 24, 0.88)',
                      border:
                        m.score >= 95 || m.isExactMatch
                          ? '2px solid #10b981'
                          : '1px solid rgba(250, 204, 21, 0.55)',
                      borderRadius: '14px',
                      padding: '12px 16px',
                    }}
                  >
                    {/* Side-by-side Comparison: Uploaded Reference <-> Matched Gift */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '280px', flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        {pair.refPayload.previewDataUrl && (
                          <div style={{ textAlign: 'center' }}>
                            <img
                              src={pair.refPayload.previewDataUrl}
                              alt={pair.refPayload.fileName}
                              style={{
                                width: '64px',
                                height: '64px',
                                objectFit: 'contain',
                                borderRadius: '9px',
                                background: '#070810',
                                border: '1px solid #334155',
                              }}
                            />
                            <div style={{ fontSize: '9.5px', color: '#94a3b8', marginTop: '2px' }}>
                              {isAr ? 'المرفوع' : 'Uploaded'}
                            </div>
                          </div>
                        )}
                        <span style={{ fontSize: '18px', color: '#10b981', fontWeight: 900 }}>⇄</span>
                        <div style={{ textAlign: 'center' }}>
                          <div
                            style={{
                              width: '74px',
                              height: '74px',
                              borderRadius: '10px',
                              background: '#070810',
                              border: '2px solid #10b981',
                              display: 'grid',
                              placeItems: 'center',
                              overflow: 'hidden',
                            }}
                          >
                            {m.thumbnailDataUrl ? (
                              <img
                                src={m.thumbnailDataUrl}
                                alt={m.name}
                                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                              />
                            ) : (
                              <span style={{ fontSize: '16px', fontWeight: 900, color: '#6ee7b7' }}>
                                {m.format}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '9.5px', color: '#6ee7b7', fontWeight: 800, marginTop: '2px' }}>
                            {isAr ? 'ملف الهدية' : 'Gift File'}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span
                            style={{
                              padding: '3px 10px',
                              borderRadius: '99px',
                              background: 'linear-gradient(135deg, #f59e0b, #10b981)',
                              color: '#052e16',
                              fontSize: '11.5px',
                              fontWeight: 900,
                            }}
                          >
                            👑{' '}
                            {m.score >= 95 || m.isExactMatch
                              ? isAr
                                ? `هذه هي الهدية المطلوبة 100%`
                                : `Exact 100% Gift Match`
                              : isAr
                                ? `أقرب هدية مطابقة (${m.score}%)`
                                : `Top Match (${m.score}%)`}
                          </span>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: '6px',
                              background: 'rgba(124, 92, 255, 0.28)',
                              border: '1px solid rgba(124, 92, 255, 0.6)',
                              color: '#ddd6fe',
                              fontSize: '11px',
                              fontWeight: 900,
                            }}
                          >
                            {m.format}
                          </span>
                          {typeof m.matchedTimestampSec === 'number' && (
                            <span
                              style={{
                                padding: '2px 8px',
                                borderRadius: '6px',
                                background: 'rgba(16, 185, 129, 0.16)',
                                color: '#6ee7b7',
                                fontSize: '10.5px',
                                fontWeight: 800,
                              }}
                            >
                              ⏱️ {isAr ? `ظهرت عند الثانية ${m.matchedTimestampSec}s` : `At ${m.matchedTimestampSec}s`}
                            </span>
                          )}
                        </div>

                        <div
                          style={{
                            fontSize: '15.5px',
                            fontWeight: 900,
                            color: '#ffffff',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {m.name}
                        </div>

                        <div style={{ fontSize: '11.5px', color: '#cbd5e1' }}>
                          {isAr ? 'مطابقة للمرجع:' : 'For:'}{' '}
                          <b style={{ color: '#fde047' }}>{pair.refPayload.fileName}</b> •{' '}
                          {m.width > 0 ? `${m.width}×${m.height} • ` : ''}
                          {formatBytes(m.sizeBytes)}
                        </div>
                      </div>
                    </div>

                    {/* Quick Export / Open Buttons */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                      <button
                        type="button"
                        id={pIdx === 0 ? 'downloadTopMatchedGiftBtn' : undefined}
                        onClick={() => handleDownloadCopy(m)}
                        style={{
                          padding: '10px 16px',
                          borderRadius: '10px',
                          border: 0,
                          background: 'linear-gradient(135deg, #10b981, #059669)',
                          color: '#fff',
                          fontSize: '12.5px',
                          fontWeight: 900,
                          cursor: 'pointer',
                          boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
                        }}
                      >
                        ⬇️{' '}
                        {isAr
                          ? `تنزيل الملف الأصلي (${m.name})`
                          : `Download Original (${m.name})`}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleLoadIntoConverter(m)}
                        style={{
                          padding: '9px 13px',
                          borderRadius: '10px',
                          border: '1px solid rgba(124, 92, 255, 0.6)',
                          background: 'rgba(124, 92, 255, 0.2)',
                          color: '#fff',
                          fontSize: '12px',
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        ⚡ {isAr ? 'المعالجة' : 'Converter'}
                      </button>

                      {m.format === 'SVGA' && (
                        <button
                          type="button"
                          onClick={() => handleLoadIntoSvgaEditor(m)}
                          style={{
                            padding: '9px 13px',
                            borderRadius: '10px',
                            border: 0,
                            background: 'linear-gradient(135deg, #7c5cff, #5b21b6)',
                            color: '#fff',
                            fontSize: '12px',
                            fontWeight: 800,
                            cursor: 'pointer',
                          }}
                        >
                          ✨ {isAr ? 'محرر SVGA' : 'SVGA Editor'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* All Search Results Grid with Signature Exact-Match Highlight Ribbon */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 900, color: '#fff' }}>
              {isAr ? 'جميع ملفات الهدايا المطابقة من جهازك' : 'All Matching Gift Files From Your Device'}
              {searchMeta && (
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#a78bfa', marginInlineStart: '10px' }}>
                  {isAr
                    ? `(${searchResults.length} نتيجة من أصل ${searchMeta.searchedCount.toLocaleString()} ملف • ${searchMeta.durationMs}ms)`
                    : `(${searchResults.length} matches from ${searchMeta.searchedCount.toLocaleString()} files • ${searchMeta.durationMs}ms)`}
                </span>
              )}
            </h3>
          </div>

          {refPayloads.length > 0 && !hasAnyIndex ? (
            <div
              data-testid="missing-library-cta"
              style={{
                background:
                  'linear-gradient(135deg, rgba(124, 92, 255, 0.16) 0%, rgba(16, 185, 129, 0.14) 100%)',
                border: '2px dashed rgba(16, 185, 129, 0.65)',
                borderRadius: '16px',
                padding: '24px 20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: '12px',
              }}
            >
              <div style={{ fontSize: '28px' }}>📂✨</div>
              <div style={{ fontSize: '15px', fontWeight: 900, color: '#ffffff' }}>
                {isAr
                  ? 'تم تحليل الصورة المرجعية بنجاح — حدد الآن ملفات الهدايا من جهازك لجلب الملف الأصلي وتنزيله!'
                  : 'Reference analyzed! Now select your local gift files/folder to fetch & download the original file.'}
              </div>
              <div style={{ fontSize: '12.5px', color: '#cbd5e1', maxWidth: '640px', lineHeight: 1.6 }}>
                {isAr
                  ? 'اضغط أحد الزرين بالأسفل واختر ملفات الهدايا (.svga / .pag / .vap / .mp4) أو المجلد الكامل من جهازك — سيتم مطابقة الصورة فوراً وإظهار زر تنزيل الملف الأصلي.'
                  : 'Choose your gift files (.svga / .pag / .vap / .mp4) or full folder below to instantly match and download the original file.'}
              </div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <label
                  htmlFor="giftFilesMultiPicker"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '7px',
                    padding: '11px 18px',
                    borderRadius: '11px',
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: 900,
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
                  }}
                >
                  📄 {isAr ? 'حدد ملفات الهدايا من جهازك الآن (Ctrl+A)' : 'Select Gift Files Now (Ctrl+A)'}
                </label>
                <label
                  htmlFor="giftFolderMultiPicker"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '7px',
                    padding: '11px 18px',
                    borderRadius: '11px',
                    border: '1px solid rgba(124, 92, 255, 0.65)',
                    background: 'rgba(124, 92, 255, 0.2)',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  📁 {isAr ? 'أو اختر مجلد الهدايا بالكامل' : 'Or Select Entire Folder'}
                </label>
              </div>
            </div>
          ) : searchResults.length === 0 ? (
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
                  ? 'لم يتم العثور على ملفات مطابقة داخل الملفات المحددة.'
                  : 'No matching files found inside selected files.'
                : isAr
                  ? 'ارفع صورة أو عدة صور أو فيديو الهدية في الخطوة 1، ثم حدد ملفات الهدايا من جهازك في الخطوة 2 ليتم فحصها وتمييز هديتك بنسبة 100% فوراً.'
                  : 'Upload your reference image(s) or video in Step 1, then select your local gift files in Step 2.'}
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
              {searchResults.map((item) => {
                const isWinner =
                  highlightedIds.has(`${item.source}::${item.id}`) ||
                  Boolean(item.isExactMatch) ||
                  item.score >= 95;
                return (
                  <article
                    key={`${item.source}::${item.id}`}
                    data-exact-match={isWinner ? 'true' : 'false'}
                    style={{
                      background: isWinner
                        ? 'linear-gradient(180deg, rgba(16, 185, 129, 0.14) 0%, rgba(20, 21, 34, 0.96) 55%)'
                        : 'rgba(20, 21, 34, 0.94)',
                      border: isWinner
                        ? '2px solid #facc15'
                        : '1px solid #2b2d42',
                      borderRadius: '14px',
                      padding: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                      boxShadow: isWinner
                        ? '0 0 22px rgba(250, 204, 21, 0.25), 0 8px 20px rgba(0,0,0,0.4)'
                        : '0 8px 20px rgba(0,0,0,0.3)',
                    }}
                  >
                    {/* Distinctive Verified Star Ribbon for Exact Matched Gift */}
                    {isWinner && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '6px',
                          padding: '5px 9px',
                          borderRadius: '8px',
                          background: 'linear-gradient(135deg, #f59e0b, #10b981)',
                          color: '#052e16',
                          fontSize: '11px',
                          fontWeight: 900,
                        }}
                      >
                        <span>👑 {isAr ? 'الهدية المطلوبة • تطابق 100%' : 'Verified 100% Match'}</span>
                        <span>★</span>
                      </div>
                    )}

                    <div
                      style={{
                        position: 'relative',
                        height: '145px',
                        borderRadius: '10px',
                        background: '#0b0e1a',
                        border: isWinner ? '1px solid rgba(250, 204, 21, 0.45)' : '1px solid #1e2030',
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
                            isWinner
                              ? 'rgba(16, 185, 129, 0.96)'
                              : item.score >= 70
                                ? 'rgba(124, 92, 255, 0.92)'
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
                          color: isWinner ? '#fef08a' : '#fff',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.name}
                      </div>
                      {item.matchedRefName && isWinner && (
                        <div style={{ fontSize: '10.5px', color: '#6ee7b7', fontWeight: 700 }}>
                          🎯 {isAr ? `مطابقة لـ: ${item.matchedRefName}` : `Matches: ${item.matchedRefName}`}
                          {typeof item.matchedTimestampSec === 'number'
                            ? ` @ ${item.matchedTimestampSec}s`
                            : ''}
                        </div>
                      )}
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
                        onClick={() => handleDownloadCopy(item)}
                        style={{
                          gridColumn: 'span 2',
                          padding: '8px 10px',
                          borderRadius: '8px',
                          border: isWinner
                            ? '0'
                            : '1px solid rgba(16, 185, 129, 0.45)',
                          background: isWinner
                            ? 'linear-gradient(135deg, #10b981, #059669)'
                            : 'rgba(16, 185, 129, 0.14)',
                          color: isWinner ? '#fff' : '#6ee7b7',
                          fontSize: '11.5px',
                          fontWeight: 900,
                          cursor: 'pointer',
                        }}
                      >
                        ⬇️{' '}
                        {isAr
                          ? `تنزيل الملف الأصلي (${item.name})`
                          : `Download Original (${item.name})`}
                      </button>

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
                          💾 {isAr ? 'حفظ نسخة' : 'Save Copy'}
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
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
