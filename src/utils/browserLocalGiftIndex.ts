import {
  IndexedGiftRecord,
  VisualFeatureFrame,
  computeVisualFeaturesFromRgba,
  extractReferenceVisualFeatures,
  findPeakVisibleFrameIndicesForMovie,
  isAnimatedGiftFormat,
  rankLocalGiftSearchResults,
  LocalGiftSearchResult,
  tokenizeSearchText,
} from './aiGiftFinderEngine';
import { pako, parseMovie, readMeta } from './codecs';
import { decodePagBinaryToMovie } from './pagEngine';

export interface BrowserAuthorizedFolder {
  id: string;
  name: string;
  fileCount: number;
  indexedAt: string;
  hasPersistentHandle: boolean;
}

export interface BrowserLocalGiftEntry extends IndexedGiftRecord {
  folderId: string;
  relativePath: string;
  /** Runtime in-memory OS File pointer (zero-copy, 0 bytes of RAM for file contents) */
  liveFile?: File;
  /** True once visual hashes have been extracted for this file */
  visualReady?: boolean;
}

const DB_NAME = 'svga520_local_gift_finder_v2';
const DB_VERSION = 2;
const STORE_FOLDERS = 'folders';
const STORE_ITEMS = 'items';
const STORE_BLOBS = 'blobs';
const STORE_HANDLES = 'handles';

const INDEXABLE_EXTS = new Set([
  'svga',
  'pag',
  'vap',
  'yyeva',
  'mp4',
  'mov',
  'webm',
  'gif',
  'webp',
  'apng',
  'png',
  'jpg',
  'jpeg',
  'lottie',
  'json',
]);

// Runtime map of live OS File pointers & FileSystemFileHandles keyed by record id (zero disk copy!)
const runtimeLiveFiles = new Map<string, File>();
const runtimeFileHandles = new Map<string, any>();

export function isSupportedGiftExtension(filename: string): boolean {
  const dotIdx = filename.lastIndexOf('.');
  if (dotIdx < 0) return false;
  const ext = filename.slice(dotIdx + 1).toLowerCase();
  return INDEXABLE_EXTS.has(ext);
}

function openLocalDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_FOLDERS)) {
        db.createObjectStore(STORE_FOLDERS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_ITEMS)) {
        const itemStore = db.createObjectStore(STORE_ITEMS, { keyPath: 'id' });
        itemStore.createIndex('folderId', 'folderId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_BLOBS)) {
        db.createObjectStore(STORE_BLOBS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_HANDLES)) {
        db.createObjectStore(STORE_HANDLES, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open local index DB'));
  });
}

export async function loadBrowserLocalIndexState(): Promise<{
  folders: BrowserAuthorizedFolder[];
  items: BrowserLocalGiftEntry[];
}> {
  try {
    const db = await openLocalDb();
    const tx = db.transaction([STORE_FOLDERS, STORE_ITEMS], 'readonly');
    const foldersReq = tx.objectStore(STORE_FOLDERS).getAll();
    const itemsReq = tx.objectStore(STORE_ITEMS).getAll();

    const [folders, items] = await Promise.all([
      new Promise<BrowserAuthorizedFolder[]>((res, rej) => {
        foldersReq.onsuccess = () => res(foldersReq.result || []);
        foldersReq.onerror = () => rej(foldersReq.error);
      }),
      new Promise<BrowserLocalGiftEntry[]>((res, rej) => {
        itemsReq.onsuccess = () => res(itemsReq.result || []);
        itemsReq.onerror = () => rej(itemsReq.error);
      }),
    ]);

    return { folders, items };
  } catch {
    return { folders: [], items: [] };
  }
}

/**
 * Saves lightweight metadata & visual hashes in background batches without copying multi-GB raw files.
 */
export async function saveMetadataBatchToDb(
  folder: BrowserAuthorizedFolder,
  itemsBatch: BrowserLocalGiftEntry[],
  options?: { persistSmallBlobs?: boolean }
): Promise<void> {
  try {
    const db = await openLocalDb();
    const storeNames = options?.persistSmallBlobs
      ? [STORE_FOLDERS, STORE_ITEMS, STORE_BLOBS]
      : [STORE_FOLDERS, STORE_ITEMS];
    const tx = db.transaction(storeNames, 'readwrite');
    const folderStore = tx.objectStore(STORE_FOLDERS);
    const itemStore = tx.objectStore(STORE_ITEMS);
    const blobStore = options?.persistSmallBlobs ? tx.objectStore(STORE_BLOBS) : null;

    folderStore.put(folder);

    for (let i = 0; i < itemsBatch.length; i++) {
      const item = itemsBatch[i];
      const { liveFile, ...serializable } = item;
      itemStore.put(serializable);
      if (blobStore && liveFile && liveFile.size <= 25 * 1024 * 1024) {
        try {
          blobStore.put({
            id: item.id,
            name: item.name,
            type: liveFile.type || 'application/octet-stream',
            blob: liveFile,
          });
        } catch {}
      }
    }

    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Non-fatal if browser quota restricted
  }
}

/**
 * Saves a single matched file blob to IndexedDB on demand so top matches survive reload without slowing down bulk import.
 */
export async function persistSingleFileBlobToDb(itemId: string, file: File): Promise<void> {
  if (!file || file.size > 60 * 1024 * 1024) return;
  try {
    const db = await openLocalDb();
    const tx = db.transaction([STORE_BLOBS], 'readwrite');
    tx.objectStore(STORE_BLOBS).put({
      id: itemId,
      name: file.name,
      type: file.type || 'application/octet-stream',
      blob: file,
    });
  } catch {}
}

export async function removeBrowserFolderFromDb(folderId: string): Promise<void> {
  try {
    const db = await openLocalDb();
    const tx = db.transaction(
      [STORE_FOLDERS, STORE_ITEMS, STORE_BLOBS, STORE_HANDLES],
      'readwrite'
    );
    tx.objectStore(STORE_FOLDERS).delete(folderId);
    tx.objectStore(STORE_HANDLES).delete(folderId);
    const itemStore = tx.objectStore(STORE_ITEMS);
    const blobStore = tx.objectStore(STORE_BLOBS);
    const idx = itemStore.index('folderId');
    await new Promise<void>((resolve) => {
      const cursorReq = idx.openCursor(IDBKeyRange.only(folderId));
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          const pk = String(cursor.primaryKey);
          runtimeLiveFiles.delete(pk);
          runtimeFileHandles.delete(pk);
          blobStore.delete(pk);
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      cursorReq.onerror = () => resolve();
    });
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {}
}

export async function clearAllBrowserLocalIndex(): Promise<void> {
  runtimeLiveFiles.clear();
  runtimeFileHandles.clear();
  try {
    const db = await openLocalDb();
    const tx = db.transaction(
      [STORE_FOLDERS, STORE_ITEMS, STORE_BLOBS, STORE_HANDLES],
      'readwrite'
    );
    tx.objectStore(STORE_FOLDERS).clear();
    tx.objectStore(STORE_ITEMS).clear();
    tx.objectStore(STORE_BLOBS).clear();
    tx.objectStore(STORE_HANDLES).clear();
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {}
}

export async function getStoredDirectoryHandle(folderId: string): Promise<any | null> {
  try {
    const db = await openLocalDb();
    const tx = db.transaction([STORE_HANDLES], 'readonly');
    const req = tx.objectStore(STORE_HANDLES).get(folderId);
    return await new Promise<any>((resolve) => {
      req.onsuccess = () => resolve(req.result?.handle || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * PHASE 1: INSTANT ZERO-COPY REGISTRATION (< 50ms even for 50,000 - 100,000 files!)
 * Registers OS File pointers in memory immediately without reading or copying file contents from disk,
 * and reuses any previously cached visual hashes by matching (folderId + file.name + file.size).
 */
export function registerFilesInstantly(
  folderName: string,
  entries: Array<{ file: File; relativePath: string; fileHandle?: any }>,
  options?: {
    folderId?: string;
    existingItems?: BrowserLocalGiftEntry[];
  }
): {
  folder: BrowserAuthorizedFolder;
  allFolderItems: BrowserLocalGiftEntry[];
  needsVisualScan: BrowserLocalGiftEntry[];
  reusedCachedCount: number;
} {
  const folderId =
    options?.folderId ||
    `folder_${folderName.toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, '_')}`;

  // Build O(1) lookup map of existing items so already-scanned files take 0ms!
  const existingById = new Map<string, BrowserLocalGiftEntry>();
  if (options?.existingItems) {
    for (let i = 0; i < options.existingItems.length; i++) {
      const prev = options.existingItems[i];
      existingById.set(prev.id, prev);
    }
  }

  const needsVisualScan: BrowserLocalGiftEntry[] = [];
  let reusedCachedCount = 0;
  const nowIso = new Date().toISOString();

  for (let i = 0; i < entries.length; i++) {
    const { file, relativePath, fileHandle } = entries[i];
    if (!isSupportedGiftExtension(file.name)) continue;

    const id = `${folderId}::${file.name}::${file.size}`;
    runtimeLiveFiles.set(id, file);
    if (fileHandle) {
      runtimeFileHandles.set(id, fileHandle);
    }

    const cached = existingById.get(id);
    if (cached && cached.frames && cached.frames.length > 0) {
      cached.liveFile = file;
      cached.visualReady = true;
      reusedCachedCount++;
      continue;
    }

    const dotIdx = file.name.lastIndexOf('.');
    const ext = dotIdx >= 0 ? file.name.slice(dotIdx + 1).toUpperCase() : 'FILE';
    const rel = relativePath || `${folderName}/${file.name}`;
    const slashIdx = rel.lastIndexOf('/');
    const subFolder = slashIdx > 0 ? rel.slice(0, slashIdx) : folderName;

    const entry: BrowserLocalGiftEntry = {
      id,
      folderId,
      name: file.name,
      path: rel,
      relativePath: rel,
      folder: subFolder,
      format: ext,
      sizeBytes: file.size,
      modifiedAt: nowIso,
      width: 0,
      height: 0,
      frames: [],
      thumbnailDataUrl: '',
      tokens: tokenizeSearchText(`${file.name} ${subFolder}`),
      liveFile: file,
      visualReady: false,
    };

    existingById.set(id, entry);
    needsVisualScan.push(entry);
  }

  const allFolderItems: BrowserLocalGiftEntry[] = [];
  for (const item of existingById.values()) {
    if (item.folderId === folderId) {
      allFolderItems.push(item);
    }
  }

  const folder: BrowserAuthorizedFolder = {
    id: folderId,
    name: folderName,
    fileCount: allFolderItems.length,
    indexedAt: new Date().toISOString(),
    hasPersistentHandle: false,
  };

  return {
    folder,
    allFolderItems,
    needsVisualScan,
    reusedCachedCount,
  };
}

/**
 * Ultra-fast hardware-accelerated visual feature extractor using createImageBitmap
 * and a reusable 96x96 canvas (avoids DOM Image allocation and multi-seek overhead during bulk scan).
 */
async function extractTurboVisualFeaturesForEntry(
  file: File,
  sharedCanvas: HTMLCanvasElement,
  sharedCtx: CanvasRenderingContext2D
): Promise<{
  width: number;
  height: number;
  frames: VisualFeatureFrame[];
  thumbnailDataUrl: string;
}> {
  const nameLower = file.name.toLowerCase();
  const dotIdx = nameLower.lastIndexOf('.');
  const ext = dotIdx >= 0 ? nameLower.slice(dotIdx + 1) : '';

  const drawSourceToShared = (
    source: CanvasImageSource,
    srcW: number,
    srcH: number
  ): VisualFeatureFrame => {
    sharedCtx.fillStyle = '#0b0e1a';
    sharedCtx.fillRect(0, 0, 96, 96);
    const scale = Math.min(96 / Math.max(1, srcW), 96 / Math.max(1, srcH));
    const dw = Math.max(1, Math.round(srcW * scale));
    const dh = Math.max(1, Math.round(srcH * scale));
    const dx = Math.round((96 - dw) / 2);
    const dy = Math.round((96 - dh) / 2);
    sharedCtx.drawImage(source, dx, dy, dw, dh);
    const imgData = sharedCtx.getImageData(0, 0, 96, 96);
    const feat = computeVisualFeaturesFromRgba(imgData.data, 96, 96);
    feat.aspectRatio = srcH > 0 ? Number((srcW / srcH).toFixed(3)) : 1;
    return feat;
  };

  // 1. Fast path for Images (PNG, JPG, WebP, GIF) via hardware createImageBitmap
  if (
    ext === 'png' ||
    ext === 'jpg' ||
    ext === 'jpeg' ||
    ext === 'webp' ||
    ext === 'gif' ||
    ext === 'apng'
  ) {
    if (typeof createImageBitmap === 'function') {
      try {
        const bmp = await createImageBitmap(file);
        const w = bmp.width || 96;
        const h = bmp.height || 96;
        const feat = drawSourceToShared(bmp, w, h);
        const thumb = sharedCanvas.toDataURL('image/jpeg', 0.72);
        bmp.close?.();
        return { width: w, height: h, frames: [feat], thumbnailDataUrl: thumb };
      } catch {}
    }
  }

  // 2. Fast path for SVGA / PAG: decode movie + top sprites via createImageBitmap
  if (ext === 'svga' || ext === 'pag') {
    try {
      const buf = await file.arrayBuffer();
      const rawBytes = new Uint8Array(buf);
      const movie =
        ext === 'pag'
          ? (await decodePagBinaryToMovie(rawBytes)).svgaMovie
          : parseMovie(rawBytes[0] === 0x78 || pako?.inflate ? pako.inflate(rawBytes) : rawBytes);

      const W = Math.max(1, Math.round(movie.w || 300));
      const H = Math.max(1, Math.round(movie.h || 300));
      const imEntries = Object.entries(movie.im || {}).filter(
        ([, b]) => b && b.byteLength > 64
      );

      if (imEntries.length > 0 && typeof createImageBitmap === 'function') {
        // Decode up to 60 image assets sorted by byte size so full multi-layer SVGA/PAG gifts render faithfully
        imEntries.sort((a, b) => b[1].byteLength - a[1].byteLength);
        const topEntries = imEntries.slice(0, 60);
        const bmpMap: Record<string, ImageBitmap> = {};

        await Promise.all(
          topEntries.map(async ([k, raw]) => {
            try {
              const bmp = await createImageBitmap(new Blob([raw as unknown as BlobPart]));
              bmpMap[k] = bmp;
            } catch {}
          })
        );

        const frames: VisualFeatureFrame[] = [];
        let thumb = '';

        // Render peak visible frames across the animation timeline (skips blank intro/fade-out frames)
        const peakIndices = findPeakVisibleFrameIndicesForMovie(movie, 3);
        const compCanvas = document.createElement('canvas');
        compCanvas.width = W;
        compCanvas.height = H;
        const compCtx = compCanvas.getContext('2d');

        if (compCtx && (movie.sp?.length || 0) > 0) {
          for (const fIdx of peakIndices) {
            compCtx.setTransform(1, 0, 0, 1, 0, 0);
            compCtx.clearRect(0, 0, W, H);
            let drawn = 0;
            for (const s of movie.sp || []) {
              const fe = s.fr?.[fIdx];
              const bmp = bmpMap[s.key];
              if (!fe || !(fe.a > 0.02) || !bmp) continue;
              compCtx.save();
              compCtx.globalAlpha = Math.max(0, Math.min(1, fe.a));
              const t = fe.t || [1, 0, 0, 1, 0, 0];
              compCtx.transform(t[0] ?? 1, t[1] ?? 0, t[2] ?? 0, t[3] ?? 1, t[4] ?? 0, t[5] ?? 0);
              if (fe.clipPath && typeof Path2D !== 'undefined') {
                try {
                  compCtx.clip(new Path2D(fe.clipPath));
                } catch {}
              }
              compCtx.drawImage(
                bmp,
                fe.x || 0,
                fe.y || 0,
                fe.w || bmp.width || W,
                fe.h || bmp.height || H
              );
              compCtx.restore();
              drawn++;
            }
            if (drawn > 0) {
              const feat = drawSourceToShared(compCanvas, W, H);
              frames.push(feat);
              if (!thumb) thumb = sharedCanvas.toDataURL('image/jpeg', 0.78);
            }
          }
        }

        // Also include the largest individual sprite bitmaps directly as supplementary visual descriptors
        const bmpList = Object.values(bmpMap);
        for (const bmp of bmpList.slice(0, 2)) {
          const feat = drawSourceToShared(bmp, bmp.width || 96, bmp.height || 96);
          frames.push(feat);
          if (!thumb) thumb = sharedCanvas.toDataURL('image/jpeg', 0.78);
        }

        for (const bmp of bmpList) {
          bmp.close?.();
        }

        if (frames.length > 0) {
          return { width: W, height: H, frames, thumbnailDataUrl: thumb };
        }
      }
    } catch {}
  }

  // 3. Fast Single-Seek Path for Video / VAP / YYEVA during bulk scanning
  if (ext === 'vap' || ext === 'yyeva' || ext === 'mp4' || ext === 'webm' || ext === 'mov') {
    let vapMeta: ReturnType<typeof readMeta> = null;
    try {
      const headSlice = await file.slice(0, Math.min(file.size, 2 * 1024 * 1024)).arrayBuffer();
      vapMeta = readMeta(new Uint8Array(headSlice));
    } catch {}

    const mediaBlob =
      ext === 'vap' || ext === 'yyeva' ? new File([file], file.name, { type: 'video/mp4' }) : file;
    const url = URL.createObjectURL(mediaBlob);
    try {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.preload = 'metadata';
      video.src = url;

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout')), 2500);
        video.onloadeddata = () => {
          clearTimeout(timer);
          resolve();
        };
        video.onerror = () => {
          clearTimeout(timer);
          reject(new Error('err'));
        };
      });

      const vw = video.videoWidth || 300;
      const vh = video.videoHeight || 300;
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
      const frames: VisualFeatureFrame[] = [];
      let thumb = '';
      const cropCanvas = document.createElement('canvas');
      const cropCtx = cropCanvas.getContext('2d');

      for (const ratio of [0.22, 0.50, 0.78]) {
        const targetSec = Math.min(duration - 0.04, Math.max(0, duration * ratio));
        await new Promise<void>((resolve) => {
          const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            resolve();
          };
          video.addEventListener('seeked', onSeeked);
          video.currentTime = targetSec;
          setTimeout(resolve, 260);
        });

        if (vapMeta?.c && vapMeta.c.length >= 4 && cropCtx) {
          const [rx, ry, rw, rh] = vapMeta.c;
          if (rw > 0 && rh > 0) {
            cropCanvas.width = rw;
            cropCanvas.height = rh;
            cropCtx.clearRect(0, 0, rw, rh);
            cropCtx.drawImage(video, rx, ry, rw, rh, 0, 0, rw, rh);
            frames.push(drawSourceToShared(cropCanvas, rw, rh));
            if (!thumb || ratio === 0.50) {
              thumb = sharedCanvas.toDataURL('image/jpeg', 0.72);
            }
          }
        }

        frames.push(drawSourceToShared(video, vw, vh));
        if (!thumb) {
          thumb = sharedCanvas.toDataURL('image/jpeg', 0.72);
        }
      }

      return {
        width: vapMeta?.c?.[2] || vw,
        height: vapMeta?.c?.[3] || vh,
        frames,
        thumbnailDataUrl: thumb,
      };
    } catch {
      return { width: 0, height: 0, frames: [], thumbnailDataUrl: '' };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // Fallback
  try {
    const extracted = await extractReferenceVisualFeatures(file);
    return {
      width: extracted.width,
      height: extracted.height,
      frames: extracted.frames,
      thumbnailDataUrl: extracted.previewDataUrl,
    };
  } catch {
    return { width: 0, height: 0, frames: [], thumbnailDataUrl: '' };
  }
}

/**
 * PHASE 2: PARALLEL TURBO VISUAL SCANNER (16x concurrent workers + throttled UI updates + live match callback)
 */
export async function scanVisualFeaturesInParallel(
  folder: BrowserAuthorizedFolder,
  itemsToScan: BrowserLocalGiftEntry[],
  options?: {
    concurrency?: number;
    shouldStop?: () => boolean;
    onProgress?: (done: number, total: number, currentFileName: string) => void;
    onBatchCompleted?: (updatedBatch: BrowserLocalGiftEntry[]) => void;
  }
): Promise<void> {
  if (itemsToScan.length === 0) {
    await saveMetadataBatchToDb(folder, [], { persistSmallBlobs: false });
    return;
  }

  const concurrency = Math.max(1, Math.min(24, options?.concurrency || 16));
  const total = itemsToScan.length;
  let cursor = 0;
  let completed = 0;
  let lastProgressEmitMs = 0;
  let pendingDbBatch: BrowserLocalGiftEntry[] = [];

  // Persist compact original gift blobs cleanly for up to 120 items per scan (<= 8MB each)
  // so downloading matched original gift files keeps working across browser reloads.
  let persistedBlobCount = 0;
  const maxPersistBlobs = 120;

  const workerLoop = async () => {
    const workerCanvas = document.createElement('canvas');
    workerCanvas.width = 96;
    workerCanvas.height = 96;
    const workerCtx = workerCanvas.getContext('2d', { willReadFrequently: true });
    if (!workerCtx) return;

    while (cursor < total) {
      if (options?.shouldStop?.()) break;
      const idx = cursor++;
      const entry = itemsToScan[idx];
      const file = entry.liveFile || runtimeLiveFiles.get(entry.id);
      if (!file) continue;

      const { width, height, frames, thumbnailDataUrl } =
        await extractTurboVisualFeaturesForEntry(file, workerCanvas, workerCtx);

      entry.width = width;
      entry.height = height;
      entry.frames = frames;
      entry.thumbnailDataUrl = thumbnailDataUrl;
      entry.visualReady = true;

      if (
        persistedBlobCount < maxPersistBlobs &&
        file.size <= 8 * 1024 * 1024 &&
        (total <= 120 || isAnimatedGiftFormat(entry.format))
      ) {
        persistedBlobCount++;
        persistSingleFileBlobToDb(entry.id, file);
      }

      completed++;
      pendingDbBatch.push(entry);

      const now = performance.now();
      if (completed === total || now - lastProgressEmitMs >= 110) {
        lastProgressEmitMs = now;
        options?.onProgress?.(completed, total, file.name);
      }

      if (pendingDbBatch.length >= 32 || completed === total) {
        const batchToSave = pendingDbBatch;
        pendingDbBatch = [];
        options?.onBatchCompleted?.(batchToSave);
        // Non-blocking background metadata save
        saveMetadataBatchToDb(folder, batchToSave, { persistSmallBlobs: false });
      }
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, total) }, () => workerLoop());
  await Promise.all(workers);

  if (pendingDbBatch.length > 0) {
    options?.onBatchCompleted?.(pendingDbBatch);
    await saveMetadataBatchToDb(folder, pendingDbBatch, { persistSmallBlobs: false });
  }
}

export async function indexFilesIntoBrowserFolder(
  folderName: string,
  entries: Array<{ file: File; relativePath: string; fileHandle?: any }>,
  options?: {
    folderId?: string;
    dirHandle?: any;
    mergeWithItems?: BrowserLocalGiftEntry[];
    onProgress?: (done: number, total: number, currentFileName: string) => void;
  }
): Promise<{ folder: BrowserAuthorizedFolder; items: BrowserLocalGiftEntry[] }> {
  const { folder, allFolderItems, needsVisualScan } = registerFilesInstantly(
    folderName,
    entries,
    {
      folderId: options?.folderId,
      existingItems: options?.mergeWithItems,
    }
  );

  await scanVisualFeaturesInParallel(folder, needsVisualScan, {
    concurrency: 16,
    onProgress: options?.onProgress,
  });

  return { folder, items: allFolderItems };
}

export async function collectEntriesFromDirectoryHandle(
  dirHandle: any,
  prefix = ''
): Promise<Array<{ file: File; relativePath: string; fileHandle: any }>> {
  const collected: Array<{ file: File; relativePath: string; fileHandle: any }> = [];
  const rootName = prefix || dirHandle.name;
  for await (const [name, handle] of dirHandle.entries()) {
    const rel = `${rootName}/${name}`;
    if (handle.kind === 'file') {
      if (isSupportedGiftExtension(name)) {
        try {
          const file = await handle.getFile();
          collected.push({ file, relativePath: rel, fileHandle: handle });
        } catch {}
      }
    } else if (handle.kind === 'directory') {
      const nested = await collectEntriesFromDirectoryHandle(handle, rel);
      collected.push(...nested);
    }
  }
  return collected;
}

/**
 * Recursively collects files from drag-and-drop DataTransfer (supports dropping both files and folders).
 */
export async function collectFilesFromDataTransfer(
  dt: DataTransfer
): Promise<Array<{ file: File; relativePath: string }>> {
  const out: Array<{ file: File; relativePath: string }> = [];

  const readEntry = async (entry: any, parentPath = ''): Promise<void> => {
    if (!entry) return;
    if (entry.isFile) {
      await new Promise<void>((resolve) => {
        entry.file(
          (file: File) => {
            const rel = parentPath ? `${parentPath}/${file.name}` : file.name;
            out.push({ file, relativePath: rel });
            resolve();
          },
          () => resolve()
        );
      });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const nextParent = parentPath ? `${parentPath}/${entry.name}` : entry.name;
      const readBatch = async (): Promise<void> => {
        const entries: any[] = await new Promise((resolve) => {
          reader.readEntries(
            (batch: any[]) => resolve(batch || []),
            () => resolve([])
          );
        });
        if (entries.length > 0) {
          for (const child of entries) {
            await readEntry(child, nextParent);
          }
          await readBatch();
        }
      };
      await readBatch();
    }
  };

  if (dt.items && dt.items.length > 0) {
    const entries: any[] = [];
    for (let i = 0; i < dt.items.length; i++) {
      const item = dt.items[i];
      const entry = (item as any).webkitGetAsEntry?.();
      if (entry) entries.push(entry);
    }
    if (entries.length > 0) {
      for (const e of entries) {
        await readEntry(e, '');
      }
      if (out.length > 0) return out;
    }
  }

  for (let i = 0; i < (dt.files?.length || 0); i++) {
    const f = dt.files[i];
    out.push({
      file: f,
      relativePath: (f as any).webkitRelativePath || f.name,
    });
  }
  return out;
}

export async function resolveBrowserLocalFile(itemId: string): Promise<File | null> {
  const live = runtimeLiveFiles.get(itemId);
  if (live) return live;

  const fh = runtimeFileHandles.get(itemId);
  if (fh && typeof fh.getFile === 'function') {
    try {
      const f = await fh.getFile();
      runtimeLiveFiles.set(itemId, f);
      return f;
    } catch {}
  }

  // Fallback to persistent IndexedDB STORE_BLOBS so saved files work across browser reloads!
  try {
    const db = await openLocalDb();
    const tx = db.transaction([STORE_BLOBS], 'readonly');
    const req = tx.objectStore(STORE_BLOBS).get(itemId);
    const saved = await new Promise<any>((resolve) => {
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
    if (saved?.blob) {
      const restored =
        saved.blob instanceof File
          ? saved.blob
          : new File([saved.blob], saved.name || 'gift.svga', {
              type: saved.type || 'application/octet-stream',
            });
      runtimeLiveFiles.set(itemId, restored);
      return restored;
    }
  } catch {}

  return null;
}

export function searchBrowserLocalItems(
  queryFrames: VisualFeatureFrame[],
  items: BrowserLocalGiftEntry[],
  options?: {
    textQuery?: string;
    formatFilter?: string;
    limit?: number;
    preferOriginalGiftFormats?: boolean;
  }
): { results: LocalGiftSearchResult[]; searchedCount: number; durationMs: number } {
  const start = performance.now();
  const results = rankLocalGiftSearchResults(queryFrames, items, {
    textQuery: options?.textQuery,
    formatFilter: options?.formatFilter,
    limit: options?.limit ?? 36,
    minScore: 0,
    preferOriginalGiftFormats: options?.preferOriginalGiftFormats ?? true,
  });
  return {
    results,
    searchedCount: items.length,
    durationMs: Math.max(1, Math.round(performance.now() - start)),
  };
}
