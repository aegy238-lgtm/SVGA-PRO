import {
  VapYyevaMeta,
  Mp4Box,
  metaFromAnyObject,
  detectVapYyevaSequentialSync,
} from './vapYyevaDetection';

export type { Mp4Box, VapYyevaMeta };

const TD = new TextDecoder();

export const CT = new Uint32Array(256).map((_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});

export function crc32(d: Uint8Array): number {
  let c = ~0;
  for (const b of d) c = CT[(c ^ b) & 255] ^ (c >>> 8);
  return ~c >>> 0;
}

export const kb = (n: number): string => (n / 1024).toFixed(2) + ' KB';

export const even = (n: number): number => Math.ceil(n / 2) * 2;

export function base64(u: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u.length; i += 8192) {
    s += String.fromCharCode(...u.subarray(i, i + 8192));
  }
  return btoa(s);
}

export const unbase64 = (s: string): Uint8Array =>
  Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function lzw(px: Uint8Array): number[] {
  const out: number[] = [];
  let bits = 0;
  let nb = 0;
  const emit = (c: number) => {
    bits |= c << nb;
    nb += 9;
    while (nb >= 8) {
      out.push(bits & 255);
      bits >>= 8;
      nb -= 8;
    }
  };
  const dict = new Map<number, number>();
  let next = 258;
  let w = px[0] ?? 0;
  emit(256);
  for (let i = 1; i < px.length; i++) {
    const k = px[i];
    const key = w * 256 + k;
    const hit = dict.get(key);
    if (hit !== undefined) {
      w = hit;
    } else {
      emit(w);
      dict.set(key, next++);
      if (next >= 511) {
        emit(256);
        dict.clear();
        next = 258;
      }
      w = k;
    }
  }
  emit(w);
  emit(257);
  if (nb > 0) out.push(bits & 255);
  return out;
}

export class PB {
  b: Uint8Array;
  v: DataView;
  p = 0;
  constructor(b: Uint8Array) {
    this.b = b;
    this.v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  }
  get end(): boolean {
    return this.p >= this.b.length;
  }
  vi(): number {
    let r = 0;
    let s = 1;
    for (;;) {
      const c = this.b[this.p++];
      r += (c & 127) * s;
      if (c < 128) break;
      s *= 128;
    }
    return r;
  }
  f32(): number {
    const x = this.v.getFloat32(this.p, true);
    this.p += 4;
    return x;
  }
  by(): Uint8Array {
    const n = this.vi();
    const s = this.b.subarray(this.p, this.p + n);
    this.p += n;
    return s;
  }
  skip(w: number): void {
    if (w === 0) this.vi();
    else if (w === 1) this.p += 8;
    else if (w === 2) this.by();
    else this.p += 4;
  }
}

export function pm(b: Uint8Array, fn: (f: number, r: PB) => number | boolean): void {
  const r = new PB(b);
  while (!r.end) {
    const t = r.vi();
    const f = t >>> 3;
    const w = t & 7;
    if (!fn(f, r)) r.skip(w);
  }
}

export interface SvgaFrame {
  a: number;
  x: number;
  y: number;
  w: number;
  h: number;
  t: number[];
  clipPath?: string;
  shapesRaw?: Uint8Array[];
}

export interface SvgaSprite {
  key: string;
  fr: SvgaFrame[];
  mk?: string;
}

export interface SvgaMovie {
  w: number;
  h: number;
  fps: number;
  n: number;
  im: Record<string, Uint8Array>;
  sp: SvgaSprite[];
  shapes?: number;
  matte?: number;
  audiosRaw?: Uint8Array[];
}

export function parseMovie(buf: Uint8Array): SvgaMovie {
  const m: SvgaMovie = { w: 0, h: 0, fps: 20, n: 0, im: {}, sp: [] };
  pm(buf, (f, r) => {
    if (f === 2) {
      pm(r.by(), (g, q) => {
        if (g === 1) m.w = q.f32();
        else if (g === 2) m.h = q.f32();
        else if (g === 3) m.fps = q.vi();
        else if (g === 4) m.n = q.vi();
        else return 0;
        return 1;
      });
      return 1;
    }
    if (f === 3) {
      let k = '';
      let v: Uint8Array | null = null;
      pm(r.by(), (g, q) => {
        if (g === 1) k = TD.decode(q.by());
        else if (g === 2) v = q.by().slice();
        else return 0;
        return 1;
      });
      if (v) m.im[k] = v;
      return 1;
    }
    if (f === 4) {
      const s: SvgaSprite = { key: '', fr: [] };
      pm(r.by(), (g, q) => {
        if (g === 1) {
          s.key = TD.decode(q.by());
          return 1;
        }
        if (g === 2) {
          const fe: SvgaFrame = { a: 0, x: 0, y: 0, w: 0, h: 0, t: [1, 0, 0, 1, 0, 0] };
          pm(q.by(), (h, z) => {
            if (h === 1) fe.a = z.f32();
            else if (h === 2)
              pm(z.by(), (i, u) => {
                if (i === 1) fe.x = u.f32();
                else if (i === 2) fe.y = u.f32();
                else if (i === 3) fe.w = u.f32();
                else if (i === 4) fe.h = u.f32();
                else return 0;
                return 1;
              });
            else if (h === 3) {
              fe.t = [0, 0, 0, 0, 0, 0];
              pm(z.by(), (i, u) => {
                if (i >= 1 && i <= 6) fe.t[i - 1] = u.f32();
                else return 0;
                return 1;
              });
            } else if (h === 4) {
              fe.clipPath = TD.decode(z.by());
              return 1;
            } else if (h === 5) {
              m.shapes = 1;
              if (!fe.shapesRaw) fe.shapesRaw = [];
              fe.shapesRaw.push(z.by().slice());
              return 1;
            } else return 0;
            return 1;
          });
          s.fr.push(fe);
          return 1;
        }
        if (g === 3) {
          s.mk = TD.decode(q.by());
          if (s.mk) m.matte = 1;
          return 1;
        }
        return 0;
      });
      m.sp.push(s);
      return 1;
    }
    if (f === 5) {
      if (!m.audiosRaw) m.audiosRaw = [];
      m.audiosRaw.push(r.by().slice());
      return 1;
    }
    return 0;
  });
  return m;
}

export const bidx = (u: Uint8Array, s: string, from = 0): number => {
  const n = [...s].map((c) => c.charCodeAt(0));
  for (let i = u.indexOf(n[0], from); i >= 0; i = u.indexOf(n[0], i + 1)) {
    if (n.every((b, j) => u[i + j] === b)) return i;
  }
  return -1;
};

export function boxes(u: Uint8Array, start = 0, end = u.length): Mp4Box[] {
  const v = new DataView(u.buffer, u.byteOffset, u.byteLength);
  const out: Mp4Box[] = [];
  for (let p = start; p < end; ) {
    // Ignore trailing zero padding at EOF
    if (p + 8 > end) {
      let allZero = true;
      for (let k = p; k < end; k++) {
        if (u[k] !== 0) {
          allZero = false;
          break;
        }
      }
      if (allZero) break;
      throw Error('Incomplete MP4 box');
    }
    let n = v.getUint32(p);
    let h = 8;
    if (n === 0 && u[p + 4] === 0 && u[p + 5] === 0 && u[p + 6] === 0 && u[p + 7] === 0) {
      break;
    }
    if (n === 1) {
      if (p + 16 > end) throw Error('Incomplete MP4 box');
      n = Number(v.getBigUint64(p + 8));
      h = 16;
    }
    if (n === 0) n = end - p;
    if (!Number.isSafeInteger(n) || n < h || p + n > end) {
      throw Error('Invalid MP4 box size');
    }
    out.push({ start: p, end: p + n, header: h, type: TD.decode(u.subarray(p + 4, p + 8)) });
    p += n;
  }
  return out;
}

export function metaFrom(data: any, kind: 'VAP' | 'YYEVA'): VapYyevaMeta | null {
  const res = metaFromAnyObject(data, kind);
  if (!res) {
    const d = kind === 'VAP' ? data?.info : data?.descript;
    if (!d) return null;
    throw Error('Invalid alpha / RGB rectangles');
  }
  return res;
}

export function readMeta(u: Uint8Array): VapYyevaMeta | null {
  return detectVapYyevaSequentialSync(u);
}

export function lotJson(names: string[], W: number, H: number, fps: number, ext: number) {
  return {
    v: '5.7.0',
    fr: fps,
    ip: 0,
    op: names.length,
    w: W,
    h: H,
    nm: 'frames',
    ddd: 0,
    markers: [],
    assets: names.map((p, i) => ({
      id: 'i' + i,
      w: W,
      h: H,
      u: ext ? '/images/' : '',
      p,
      e: ext ? 0 : 1,
    })),
    layers: names.map((_, i) => ({
      ddd: 0,
      ind: i + 1,
      ty: 2,
      nm: 'f' + i,
      refId: 'i' + i,
      sr: 1,
      ao: 0,
      ip: i,
      op: i + 1,
      st: 0,
      bm: 0,
      ks: {
        o: { a: 0, k: 100 },
        r: { a: 0, k: 0 },
        p: { a: 0, k: [W / 2, H / 2, 0] },
        a: { a: 0, k: [W / 2, H / 2, 0] },
        s: { a: 0, k: [100, 100, 100] },
      },
    })),
  };
}
