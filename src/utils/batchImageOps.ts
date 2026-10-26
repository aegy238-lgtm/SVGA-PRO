export interface BatchAssetItemState {
  key: string;
  src: string;
  markedForDelete: boolean;
  newName: string;
  replacementDataUrl: string | null;
  replacementFileName?: string;
}

export interface BatchOperationsState {
  items: Record<string, BatchAssetItemState>;
  removeBackground: boolean;
}

/**
 * Counts the total number of active batch operations selected by the user.
 */
export function countBatchOperations(state: BatchOperationsState): number {
  let count = 0;
  if (state.removeBackground) {
    count += 1;
  }
  for (const item of Object.values(state.items)) {
    if (item.markedForDelete) {
      count += 1;
    } else {
      const trimmedName = item.newName.trim();
      if (trimmedName && trimmedName !== item.key) {
        count += 1;
      }
      if (item.replacementDataUrl) {
        count += 1;
      }
    }
  }
  return count;
}

/**
 * Removes solid/uniform background from RGBA pixel buffer in-place using corner/border sampling
 * with smooth alpha ramp feathering to preserve subject edges.
 */
export function removeImageBackgroundData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  tolerance = 38
): boolean {
  if (width <= 0 || height <= 0 || data.length < width * height * 4) return false;

  // Sample corners and border midpoints to determine dominant background color
  const sampleCoords: Array<[number, number]> = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
    [Math.floor(width / 2), 0],
    [Math.floor(width / 2), height - 1],
    [0, Math.floor(height / 2)],
    [width - 1, Math.floor(height / 2)],
  ];

  const samples: Array<[number, number, number]> = [];

  for (const [sx, sy] of sampleCoords) {
    const idx = (sy * width + sx) * 4;
    if (data[idx + 3] > 20) {
      samples.push([data[idx], data[idx + 1], data[idx + 2]]);
    }
  }

  // Pick the dominant (most frequent / medoid) border sample so a foreground object touching one edge doesn't skew bg color
  let bgR = 0;
  let bgG = 0;
  let bgB = 0;
  if (samples.length > 0) {
    let bestCluster: Array<[number, number, number]> = [samples[0]];
    for (const s1 of samples) {
      const cluster = samples.filter((s2) => {
        const dr = s1[0] - s2[0];
        const dg = s1[1] - s2[1];
        const db = s1[2] - s2[2];
        return Math.sqrt(dr * dr + dg * dg + db * db) <= Math.max(24, tolerance);
      });
      if (cluster.length > bestCluster.length) {
        bestCluster = cluster;
      }
    }
    bgR = Math.round(bestCluster.reduce((acc, c) => acc + c[0], 0) / bestCluster.length);
    bgG = Math.round(bestCluster.reduce((acc, c) => acc + c[1], 0) / bestCluster.length);
    bgB = Math.round(bestCluster.reduce((acc, c) => acc + c[2], 0) / bestCluster.length);
  }

  const innerTol = Math.max(4, tolerance);
  const outerTol = innerTol + 28;
  let modified = false;

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a === 0) continue;
    const dr = data[i] - bgR;
    const dg = data[i + 1] - bgG;
    const db = data[i + 2] - bgB;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);

    if (dist <= innerTol) {
      data[i + 3] = 0;
      modified = true;
    } else if (dist < outerTol) {
      const factor = (dist - innerTol) / (outerTol - innerTol);
      const nextA = Math.round(a * factor);
      if (nextA < a) {
        data[i + 3] = nextA;
        modified = true;
      }
    }
  }

  return modified;
}
