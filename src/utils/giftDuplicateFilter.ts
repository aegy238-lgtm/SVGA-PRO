export interface GiftFileDescriptor {
  id: number | string;
  name: string;
  byteLength: number;
  contentHash: string;
  magicFormat?: string;
  width?: number;
  height?: number;
  duration?: number;
  isExisting?: boolean;
}

export interface DuplicateGroupSummary {
  key: string;
  originalId: number | string;
  originalName: string;
  normalizedName: string;
  totalCopies: number;
  extraCopies: number;
  duplicateIds: Array<number | string>;
  duplicateNames: string[];
  matchReason: 'exact_content_and_name' | 'exact_content' | 'same_name_and_shape';
}

export interface DuplicateAnalysisResult {
  hasDuplicates: boolean;
  totalDuplicateCount: number;
  uniqueGroupCount: number;
  keepIds: Array<number | string>;
  removeIds: Array<number | string>;
  groups: DuplicateGroupSummary[];
}

export interface GiftPaginationSlice<T> {
  totalItems: number;
  pageSize: number;
  totalPages: number;
  currentPage: number;
  startIndex: number;
  endIndex: number;
  displayFrom: number;
  displayTo: number;
  visibleItems: T[];
  showAll: boolean;
  isPaginated: boolean;
}

/**
 * Normalizes a gift filename by stripping OS copy suffixes like:
 * "lion (1).svga", "lion - Copy.svga", "lion_copy_2.svga", "نسخة من lion.svga"
 */
export function normalizeGiftFileName(rawName: string): {
  normalizedFull: string;
  normalizedBase: string;
  ext: string;
} {
  const trimmed = String(rawName || '').trim();
  const extMatch = trimmed.match(/\.([^.]+)$/);
  const ext = extMatch ? extMatch[1].toLowerCase().trim() : '';
  let base = extMatch ? trimmed.slice(0, -extMatch[0].length) : trimmed;

  // Strip Arabic/English prefix copy markers
  base = base
    .replace(/^(?:copy\s+of\s+|نسخة\s+من\s+|نسخه\s+من\s+)/i, '')
    .trim();

  // Repeatedly strip trailing copy suffixes: (1), [2], - Copy, _copy, - نسخة (2), etc.
  let prev = '';
  while (prev !== base) {
    prev = base;
    base = base
      .replace(/\s*(?:-\s*)?(?:copy|نسخة|نسخه|مكرر)(?:\s*\(\d+\)|\s*\[\d+\]|\s+\d+)?$/i, '')
      .replace(/[_\-\s]+(?:copy|dup|duplicate)(?:[_\-\s]*\d+)?$/i, '')
      .replace(/\s*\(\d+\)$/, '')
      .replace(/\s*\[\d+\]$/, '')
      .trim();
  }

  const normalizedBase = base
    .toLowerCase()
    .replace(/[\s_-]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const finalBase = normalizedBase || 'gift';
  const normalizedFull = ext ? `${finalBase}.${ext}` : finalBase;
  return { normalizedFull, normalizedBase: finalBase, ext };
}

/**
 * Detects gift magic format from raw bytes
 */
export function detectMagicFormat(u: Uint8Array): string {
  if (!u || u.length < 4) return 'unknown';
  if (u[0] === 0x47 && u[1] === 0x49 && u[2] === 0x46) return 'gif';
  if (u[0] === 0x89 && u[1] === 0x50 && u[2] === 0x4e && u[3] === 0x47) return 'apng';
  if (u[0] === 0x52 && u[1] === 0x49 && u[2] === 0x46 && u[3] === 0x46) return 'webp';
  if (u.length >= 8 && u[4] === 0x66 && u[5] === 0x74 && u[6] === 0x79 && u[7] === 0x70) return 'mp4';
  if (u[0] === 0x50 && u[1] === 0x41 && u[2] === 0x47) return 'pag';
  if (u[0] === 0x78 || (u[0] === 0x50 && u[1] === 0x4b)) return 'svga';
  if (u[0] === 0x7b) return 'lottie';
  if (u[0] === 0x3c) return 'svg';
  return 'unknown';
}

/**
 * Computes a deterministic, high-precision binary fingerprint (dual FNV-1a 64-bit hex + byte size + magic format)
 * over the gift bytes so any two identical files produce the exact same contentHash.
 */
export function computeGiftBinarySignature(bytes: Uint8Array): {
  contentHash: string;
  byteLength: number;
  magicFormat: string;
} {
  if (!bytes || bytes.length === 0) {
    return { contentHash: '0000000000000000:0', byteLength: 0, magicFormat: 'unknown' };
  }
  const len = bytes.length;
  const magicFormat = detectMagicFormat(bytes);

  let h1 = 0x811c9dc5 >>> 0;
  let h2 = 0x01000193 >>> 0;

  // Hash every byte if <= 512KB, otherwise hash dense head/mid/tail + strided bytes across the entire file
  if (len <= 524288) {
    for (let i = 0; i < len; i++) {
      const b = bytes[i];
      h1 ^= b;
      h1 = Math.imul(h1, 0x01000193) >>> 0;
      h2 ^= b ^ (i & 0xff);
      h2 = Math.imul(h2, 0x811c9dc5) >>> 0;
    }
  } else {
    const chunk = 65536;
    // Head 64KB
    for (let i = 0; i < chunk; i++) {
      const b = bytes[i];
      h1 ^= b;
      h1 = Math.imul(h1, 0x01000193) >>> 0;
    }
    // Middle 64KB
    const midStart = Math.floor(len / 2) - Math.floor(chunk / 2);
    for (let i = midStart; i < midStart + chunk; i++) {
      const b = bytes[i];
      h2 ^= b;
      h2 = Math.imul(h2, 0x811c9dc5) >>> 0;
    }
    // Tail 64KB
    for (let i = len - chunk; i < len; i++) {
      const b = bytes[i];
      h1 ^= b;
      h1 = Math.imul(h1, 0x01000193) >>> 0;
      h2 ^= b;
      h2 = Math.imul(h2, 0x811c9dc5) >>> 0;
    }
    // Stride across entire buffer
    const step = Math.max(1, Math.floor(len / 8192));
    for (let i = 0; i < len; i += step) {
      const b = bytes[i];
      h1 ^= b;
      h1 = Math.imul(h1, 0x01000193) >>> 0;
    }
  }

  const hex1 = h1.toString(16).padStart(8, '0');
  const hex2 = h2.toString(16).padStart(8, '0');
  return {
    contentHash: `${magicFormat}:${len}:${hex1}${hex2}`,
    byteLength: len,
    magicFormat,
  };
}

/**
 * Analyzes a list of gift descriptors (existing + newly uploaded) and identifies all duplicate copies
 * based on binary content fingerprint AND normalized filename + visual shape.
 */
export function analyzeDuplicateGifts(items: GiftFileDescriptor[]): DuplicateAnalysisResult {
  const keepIds: Array<number | string> = [];
  const removeIds: Array<number | string> = [];
  const groupsMap = new Map<string, DuplicateGroupSummary>();

  // Maps to track first seen original item
  const byContentHash = new Map<string, { item: GiftFileDescriptor; norm: ReturnType<typeof normalizeGiftFileName> }>();
  const byNameAndShape = new Map<string, { item: GiftFileDescriptor; norm: ReturnType<typeof normalizeGiftFileName> }>();

  for (const item of items) {
    const norm = normalizeGiftFileName(item.name);
    const hasValidHash = Boolean(item.contentHash && item.byteLength > 0);
    const shapeKey = `${norm.normalizedFull}|${item.magicFormat || norm.ext}|${item.byteLength}|${item.width || 0}x${item.height || 0}`;

    let matchedPrimary: { item: GiftFileDescriptor; norm: ReturnType<typeof normalizeGiftFileName> } | undefined;
    let matchReason: DuplicateGroupSummary['matchReason'] = 'exact_content_and_name';

    if (hasValidHash && byContentHash.has(item.contentHash)) {
      matchedPrimary = byContentHash.get(item.contentHash)!;
      matchReason =
        matchedPrimary.norm.normalizedFull === norm.normalizedFull
          ? 'exact_content_and_name'
          : 'exact_content';
    } else if (item.byteLength > 0 && byNameAndShape.has(shapeKey)) {
      matchedPrimary = byNameAndShape.get(shapeKey)!;
      matchReason = 'same_name_and_shape';
    }

    if (!matchedPrimary) {
      keepIds.push(item.id);
      const entry = { item, norm };
      if (hasValidHash) {
        byContentHash.set(item.contentHash, entry);
      }
      if (item.byteLength > 0) {
        byNameAndShape.set(shapeKey, entry);
      }
    } else {
      removeIds.push(item.id);
      const primaryId = matchedPrimary.item.id;
      const groupKey = String(primaryId);
      let group = groupsMap.get(groupKey);
      if (!group) {
        group = {
          key: groupKey,
          originalId: primaryId,
          originalName: matchedPrimary.item.name,
          normalizedName: matchedPrimary.norm.normalizedFull,
          totalCopies: 1,
          extraCopies: 0,
          duplicateIds: [],
          duplicateNames: [],
          matchReason,
        };
        groupsMap.set(groupKey, group);
      }
      group.totalCopies += 1;
      group.extraCopies += 1;
      group.duplicateIds.push(item.id);
      group.duplicateNames.push(item.name);
    }
  }

  const groups = Array.from(groupsMap.values());
  return {
    hasDuplicates: removeIds.length > 0,
    totalDuplicateCount: removeIds.length,
    uniqueGroupCount: groups.length,
    keepIds,
    removeIds,
    groups,
  };
}

/**
 * Evaluates incoming files based on whether the Duplicate Filter toggle button is ON (blue) or OFF (normal upload mode).
 * - When `filterEnabled === false`: Normal upload mode is active; all files are accepted into `keepIds` without holding duplicates.
 * - When `filterEnabled === true`: Duplicate filter mode is active; duplicate copies are separated into `removeIds` and `groups`.
 */
export function evaluateIncomingGiftsWithToggle(
  items: GiftFileDescriptor[],
  filterEnabled: boolean
): DuplicateAnalysisResult & { filterEnabled: boolean } {
  if (!filterEnabled) {
    return {
      filterEnabled: false,
      hasDuplicates: false,
      totalDuplicateCount: 0,
      uniqueGroupCount: 0,
      keepIds: items.map((item) => item.id),
      removeIds: [],
      groups: [],
    };
  }
  return {
    filterEnabled: true,
    ...analyzeDuplicateGifts(items),
  };
}

/**
 * Computes the active page slice for Gift Files Studio to prevent CPU/GPU overload when uploading large numbers of gifts.
 * Default pageSize is 50 frames/cards per page, with an option to `showAll` files on a single view.
 */
export function computeGiftPagination<T>(
  items: T[],
  currentPage: number,
  pageSize: number = 50,
  showAll: boolean = false
): GiftPaginationSlice<T> {
  const safeItems = Array.isArray(items) ? items : [];
  const totalItems = safeItems.length;
  const safePageSize = Math.max(1, Math.round(pageSize || 50));

  if (showAll) {
    return {
      totalItems,
      pageSize: safePageSize,
      totalPages: 1,
      currentPage: 1,
      startIndex: 0,
      endIndex: totalItems,
      displayFrom: totalItems > 0 ? 1 : 0,
      displayTo: totalItems,
      visibleItems: safeItems.slice(),
      showAll: true,
      isPaginated: false,
    };
  }

  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const clampedPage = Math.max(1, Math.min(totalPages, Math.round(currentPage || 1)));
  const startIndex = totalItems === 0 ? 0 : (clampedPage - 1) * safePageSize;
  const endIndex = Math.min(totalItems, startIndex + safePageSize);

  return {
    totalItems,
    pageSize: safePageSize,
    totalPages,
    currentPage: clampedPage,
    startIndex,
    endIndex,
    displayFrom: totalItems > 0 ? startIndex + 1 : 0,
    displayTo: endIndex,
    visibleItems: safeItems.slice(startIndex, endIndex),
    showAll: false,
    isPaginated: totalItems > safePageSize,
  };
}
