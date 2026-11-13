import {
  IndexedGiftRecord,
  VisualFeatureFrame,
  computeVisualFeaturesFromRgba,
  extractReferenceVisualFeatures,
  rankLocalGiftSearchResults,
  LocalGiftSearchResult,
  tokenizeSearchText,
} from './aiGiftFinderEngine';

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
  /** Runtime in-memory File reference (available immediately in current session) */
  liveFile?: File;
}

const DB_NAME = 'svga520_local_gift_finder_v1';
const DB_VERSION = 1;
const STORE_FOLDERS = 'folders';
const STORE_ITEMS = 'items';
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

// Runtime map of live File objects & FileSystemFileHandles keyed by record id
const runtimeLiveFiles = new Map<string, File>();
const runtimeFileHandles = new Map<string, any>();

export function isSupportedGiftExtension(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
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

async function saveFolderAndItemsToDb(
  folder: BrowserAuthorizedFolder,
  items: BrowserLocalGiftEntry[],
  dirHandle?: any
): Promise<void> {
  try {
    const db = await openLocalDb();
    const storeNames = dirHandle
      ? [STORE_FOLDERS, STORE_ITEMS, STORE_HANDLES]
      : [STORE_FOLDERS, STORE_ITEMS];
    const tx = db.transaction(storeNames, 'readwrite');
    tx.objectStore(STORE_FOLDERS).put(folder);
    const itemStore = tx.objectStore(STORE_ITEMS);

    // Clear previous items belonging to this folderId first
    const idx = itemStore.index('folderId');
    await new Promise<void>((resolve) => {
      const cursorReq = idx.openCursor(IDBKeyRange.only(folder.id));
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      cursorReq.onerror = () => resolve();
    });

    for (const item of items) {
      const { liveFile: _omit, ...serializable } = item;
      itemStore.put(serializable);
    }

    if (dirHandle) {
      tx.objectStore(STORE_HANDLES).put({ id: folder.id, handle: dirHandle });
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Non-fatal if browser is in private mode / quota restricted
  }
}

export async function removeBrowserFolderFromDb(folderId: string): Promise<void> {
  try {
    const db = await openLocalDb();
    const tx = db.transaction([STORE_FOLDERS, STORE_ITEMS, STORE_HANDLES], 'readwrite');
    tx.objectStore(STORE_FOLDERS).delete(folderId);
    tx.objectStore(STORE_HANDLES).delete(folderId);
    const itemStore = tx.objectStore(STORE_ITEMS);
    const idx = itemStore.index('folderId');
    await new Promise<void>((resolve) => {
      const cursorReq = idx.openCursor(IDBKeyRange.only(folderId));
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          runtimeLiveFiles.delete(String(cursor.primaryKey));
          runtimeFileHandles.delete(String(cursor.primaryKey));
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

async function extractFastFeaturesForLocalFile(file: File): Promise<{
  width: number;
  height: number;
  frames: VisualFeatureFrame[];
  thumbnailDataUrl: string;
}> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';

  // Image / SVGA via shared extractor
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'apng', 'svga'].includes(ext)) {
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

  // Video formats including VAP & YYEVA (MP4 containers)
  if (['mp4', 'webm', 'mov', 'vap', 'yyeva'].includes(ext)) {
    const mediaBlob =
      ext === 'vap' || ext === 'yyeva'
        ? new File([file], file.name, { type: 'video/mp4' })
        : file;
    const url = URL.createObjectURL(mediaBlob);
    try {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.preload = 'metadata';
      video.src = url;

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout')), 3500);
        video.onloadedmetadata = () => {
          clearTimeout(timer);
          resolve();
        };
        video.onerror = () => {
          clearTimeout(timer);
          reject(new Error('video decode err'));
        };
      });

      const vw = video.videoWidth || 300;
      const vh = video.videoHeight || 300;
      const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
      const sampleRatios = [0.35, 0.7];
      const frames: VisualFeatureFrame[] = [];
      let thumbnailDataUrl = '';

      const canvas = document.createElement('canvas');
      canvas.width = 96;
      canvas.height = 96;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        for (let i = 0; i < sampleRatios.length; i++) {
          const t = Math.min(dur - 0.04, Math.max(0, dur * sampleRatios[i]));
          await new Promise<void>((res) => {
            const onSeeked = () => {
              video.removeEventListener('seeked', onSeeked);
              res();
            };
            video.addEventListener('seeked', onSeeked);
            video.currentTime = t;
            setTimeout(res, 500);
          });
          ctx.fillStyle = '#0b0e1a';
          ctx.fillRect(0, 0, 96, 96);
          const scale = Math.min(96 / Math.max(1, vw), 96 / Math.max(1, vh));
          const dw = Math.max(1, Math.round(vw * scale));
          const dh = Math.max(1, Math.round(vh * scale));
          ctx.drawImage(video, Math.round((96 - dw) / 2), Math.round((96 - dh) / 2), dw, dh);
          const imgData = ctx.getImageData(0, 0, 96, 96);
          const feat = computeVisualFeaturesFromRgba(imgData.data, 96, 96, Number(t.toFixed(2)));
          feat.aspectRatio = vh > 0 ? Number((vw / vh).toFixed(3)) : 1;
          frames.push(feat);
          if (i === 0) {
            thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.8);
          }
        }
      }
      return { width: vw, height: vh, frames, thumbnailDataUrl };
    } catch {
      return { width: 0, height: 0, frames: [], thumbnailDataUrl: '' };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return { width: 0, height: 0, frames: [], thumbnailDataUrl: '' };
}

export async function indexFilesIntoBrowserFolder(
  folderName: string,
  entries: Array<{ file: File; relativePath: string; fileHandle?: any }>,
  options?: {
    folderId?: string;
    dirHandle?: any;
    onProgress?: (done: number, total: number, currentFileName: string) => void;
  }
): Promise<{ folder: BrowserAuthorizedFolder; items: BrowserLocalGiftEntry[] }> {
  const folderId = options?.folderId || `folder_${folderName.toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, '_')}`;
  const validEntries = entries.filter((e) => isSupportedGiftExtension(e.file.name));
  const indexedItems: BrowserLocalGiftEntry[] = [];

  for (let i = 0; i < validEntries.length; i++) {
    const { file, relativePath, fileHandle } = validEntries[i];
    options?.onProgress?.(i + 1, validEntries.length, file.name);

    const id = `${folderId}::${relativePath || file.name}`;
    runtimeLiveFiles.set(id, file);
    if (fileHandle) {
      runtimeFileHandles.set(id, fileHandle);
    }

    const { width, height, frames, thumbnailDataUrl } = await extractFastFeaturesForLocalFile(file);
    const ext = file.name.split('.').pop()?.toUpperCase() || 'FILE';
    const pathParts = (relativePath || file.name).split('/');
    const subFolder =
      pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : folderName;

    indexedItems.push({
      id,
      folderId,
      name: file.name,
      path: relativePath || `${folderName}/${file.name}`,
      relativePath: relativePath || file.name,
      folder: subFolder,
      format: ext,
      sizeBytes: file.size,
      modifiedAt: new Date(file.lastModified || Date.now()).toISOString(),
      width,
      height,
      frames,
      thumbnailDataUrl,
      tokens: tokenizeSearchText(`${file.name} ${subFolder}`),
      liveFile: file,
    });
  }

  const folder: BrowserAuthorizedFolder = {
    id: folderId,
    name: folderName,
    fileCount: indexedItems.length,
    indexedAt: new Date().toISOString(),
    hasPersistentHandle: Boolean(options?.dirHandle),
  };

  await saveFolderAndItemsToDb(folder, indexedItems, options?.dirHandle);
  return { folder, items: indexedItems };
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

  return null;
}

export function searchBrowserLocalItems(
  queryFrames: VisualFeatureFrame[],
  items: BrowserLocalGiftEntry[],
  options?: { textQuery?: string; formatFilter?: string; limit?: number }
): { results: LocalGiftSearchResult[]; searchedCount: number; durationMs: number } {
  const start = performance.now();
  const results = rankLocalGiftSearchResults(queryFrames, items, {
    textQuery: options?.textQuery,
    formatFilter: options?.formatFilter,
    limit: options?.limit ?? 36,
    minScore: 0,
  });
  return {
    results,
    searchedCount: items.length,
    durationMs: Math.max(1, Math.round(performance.now() - start)),
  };
}
