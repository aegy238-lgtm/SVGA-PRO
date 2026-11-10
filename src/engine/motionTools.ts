// @ts-nocheck
import {
  CT,
  crc32,
  kb,
  even,
  base64,
  unbase64,
  lzw,
  PB,
  pm,
  parseMovie,
  bidx,
  boxes,
  metaFrom,
  readMeta as baseReadMeta,
  lotJson,
  pako,
  UPNG,
  encodeLosslessWebPFrame,
  muxAnimatedWebPFrames,
  parseAnimatedWebPInfo,
  demuxAnimatedWebPToSingleFrames,
  encodeAnimatedApng,
  parseApngInfo,
  decodeApngFramesRgba,
} from '../utils/codecs';
import {
  clampMetaToVideoBounds,
  detectAlphaLayoutFromRgbaFrame,
  detectVapYyevaSequentialSync,
  inferAlphaSideFromRects,
  metaFromAnyObject,
  parseJsonSlice,
  resolveDynamicFramePlacements,
  applyLuminanceMaskToRgba,
  extractMaskPreviewRgba,
  computeSlotFitDrawRect,
} from '../utils/vapYyevaDetection';
import { removeImageBackgroundData } from '../utils/batchImageOps';
import { computeAffineMatrix2D, AppliedWatermarkLayer } from '../utils/watermark';
import {
  selectOptimalH264CodecCandidates,
  buildAudioEncoderCandidates,
  resampleChannelFloat32,
  getOptimalAudioFrameSize,
  computeAudioChunkSampleOffset,
  interleaveTimestampedMediaChunks,
} from '../utils/giftStudioUtils';
import {
  analyzePngBinary,
  computeSvgaSpriteCompressionTarget,
  resampleRgbaPremultiplied,
  quantizeAndEncodePng8Dithered,
  compressPngBufferLikeReference,
  rescaleSvgaSpriteEntityProtobuf,
  compressSvga2Binary,
  SvgaCompressionMode,
  SpriteScaleEntry,
} from '../utils/svgaImageCompressor';
import {
  ChromaKeyConfig,
  INITIAL_CHROMA_KEY,
  applyChromaKeyToContext,
  applyChromaKeyToRgbaBuffer,
} from '../utils/chromaKey';
import { exportSvgaToAfterEffectsDirect } from '../services/svgaAeExport';
import {
  issueGiftCertificate,
  issueAndAutoAttachGiftCertificate,
  injectCertificateIntoJsZipInstance,
  loadCertificateAutoSettings,
} from '../utils/giftCertificateEngine';
import {
  encodePagFileBinary,
  decodePagBinaryToMovie,
  decodePagWithLibpagFallback,
  renderSvgaMovieToWebpFrames,
  isPagBinary,
} from '../utils/pagEngine';

let initialized = false;

export function initMotionToolsFixed() {
  if (initialized) return;
  initialized = true;

  // Bind bundled npm libraries (pako & upng-js) directly on window so APNG/WebP/PNG/SVGA tools never fail offline or wait on CDN
  if (typeof window !== 'undefined') {
    (window as any).pako = pako;
    (window as any).UPNG = UPNG;
    (window as any).__analyzePngBinary = analyzePngBinary;
    (window as any).__compressPngBufferLikeReference = compressPngBufferLikeReference;
    (window as any).__compressSvga2Binary = compressSvga2Binary;
  }

  const getSvgaCompressionConfig = (): { qualityPercent: number; mode: SvgaCompressionMode } => {
    const qInputEl = document.getElementById('qual') as HTMLInputElement | null;
    const rawQ = Number(qInputEl?.value ?? 100);
    const qualityPercent = Number.isFinite(rawQ) ? Math.max(1, Math.min(100, rawQ)) : 100;
    const mode: SvgaCompressionMode = (window as any).__svgaCmpMode || 'auto_quality';
    return { qualityPercent, mode };
  };
  (window as any).__getSvgaCompressionConfig = getSvgaCompressionConfig;

  const LIBS = {
    st: {},
    defs: {
      SVGA: ['https://cdn.jsdelivr.net/npm/svgaplayerweb@2.3.1/build/svga.min.js'],
      libpag: [
        '/lib/libpag.min.js',
        'https://cdn.jsdelivr.net/npm/libpag@4.3.45/lib/libpag.min.js',
      ],
      lottie: [
        'https://cdn.jsdelivr.net/npm/lottie-web@5.13.0/build/player/lottie.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.13.0/lottie.min.js',
      ],
      JSZip: [
        'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
        'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
      ],
      pako: [
        'https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js',
        'https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js',
      ],
      UPNG: [
        'https://cdn.jsdelivr.net/npm/upng-js@2.1.0/UPNG.js',
        'https://cdnjs.cloudflare.com/ajax/libs/upng-js/2.1.0/UPNG.min.js',
      ],
    },
  };
  const tagJs = (u) =>
    new Promise((r) => {
      const s = document.createElement('script');
      s.src = u;
      s.onload = () => r(1);
      s.onerror = () => r(0);
      setTimeout(() => r(0), 6000);
      document.head.appendChild(s);
    });
  async function getLib(n) {
    LIBS.src = LIBS.src || {};
    for (const u of LIBS.defs[n]) {
      if (window[n]) break;
      if ((await tagJs(u)) && window[n]) {
        LIBS.src[n] = u;
        break;
      }
    }
    LIBS.st[n] = !!window[n];
  }
  LIBS.all = (async () => {
    await getLib('lottie');
    const bad = Object.keys(LIBS.st).filter((k) => !LIBS.st[k]);
    if (bad.length)
      setTimeout(() => toast('Could not load: ' + bad.join(', ') + ' (check your connection)'), 300);
  })();

  const $ = (s) => document.querySelector(s),
    $$ = (s) => [...document.querySelectorAll(s)];
  let tt;
  function toast(m) {
    const t = $('#toast');
    if (!t) return;
    t.textContent = m;
    t.classList.add('on');
    clearTimeout(tt);
    tt = setTimeout(() => t.classList.remove('on'), 2200);
  }
  function show(v) {
    $$('.view').forEach((e) => e.classList.toggle('on', e.id === v));
    $$('nav a[data-v]').forEach((a) => a.classList.toggle('on', a.dataset.v === v));
    try {
      history.replaceState(null, '', '#' + v);
    } catch (e) {}
    try {
      window.dispatchEvent(new CustomEvent('motionviewchange', { detail: v }));
    } catch (e) {}
  }
  (window as any).__showNavView = show;
  const syncViewFromHash = () => {
    const rawHash = (location.hash || '').replace(/^#/, '').trim();
    if (
      rawHash &&
      ['home', 'convert', 'editor', 'editor-ae2', 'gifts', 'gift-image', 'gold-designer'].includes(rawHash)
    ) {
      show(rawHash);
    } else {
      show(cur ? 'convert' : 'home');
    }
  };
  window.addEventListener('hashchange', syncViewFromHash);
  setTimeout(syncViewFromHash, 0);

  document.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement | null)?.closest?.('[data-v]') as HTMLElement | null;
    if (a) {
      const v = a.dataset.v;
      if (v && typeof (window as any).__checkNavViewAccess === 'function') {
        const allowed = (window as any).__checkNavViewAccess(v);
        if (!allowed) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }
      if (v) show(v);
    }
    const t = (e.target as HTMLElement | null)?.closest?.('[data-t]') as HTMLElement | null;
    if (t) toast(t.dataset.t);
  });

  /* particles */
  const cv = $('#bg'),
    cx = cv.getContext('2d');
  let ps = [];
  function rs() {
    cv.width = cv.offsetWidth;
    cv.height = cv.offsetHeight;
    ps = Array.from({ length: 70 }, () => ({
      x: Math.random() * cv.width,
      y: Math.random() * cv.height,
      r: Math.random() * 1.5 + 0.4,
      v: Math.random() * 0.25 + 0.05,
      c: ['#ff4fa0', '#4fb6ff', '#9a7cff'][(Math.random() * 3) | 0],
    }));
  }
  rs();
  addEventListener('resize', rs);
  (function f() {
    cx.clearRect(0, 0, cv.width, cv.height);
    ps.forEach((p) => {
      p.y -= p.v;
      if (p.y < 0) p.y = cv.height;
      cx.globalAlpha = 0.55;
      cx.fillStyle = p.c;
      cx.beginPath();
      cx.arc(p.x, p.y, p.r, 0, 7);
      cx.fill();
    });
    if (!matchMedia('(prefers-reduced-motion:reduce)').matches) requestAnimationFrame(f);
  })();

  /* upload */
  const fi = $('#file'),
    dr = $('#drop');
  let cur = null,
    player = null;
  dr.onclick = () => fi.click();
  fi.onchange = () => fi.files[0] && load(fi.files[0]);
  ['dragover', 'dragenter'].forEach((n) =>
    document.addEventListener(n, (e: any) => {
      // Do not hijack drag/drop when on the Gifts Studio, Gift Image Creator, 3D Gold Designer, or Editor tab
      if (
        document.getElementById('gifts')?.classList.contains('on') ||
        document.getElementById('gift-image')?.classList.contains('on') ||
        document.getElementById('gold-designer')?.classList.contains('on') ||
        document.getElementById('editor')?.classList.contains('on') ||
        document.getElementById('editor-ae2')?.classList.contains('on') ||
        location.hash === '#gifts' ||
        location.hash === '#gift-image' ||
        location.hash === '#gold-designer' ||
        location.hash === '#editor' ||
        location.hash === '#editor-ae2' ||
        e.target?.closest?.('#gifts') ||
        e.target?.closest?.('#gift-image') ||
        e.target?.closest?.('#gold-designer') ||
        e.target?.closest?.('#editor') ||
        e.target?.closest?.('#editor-ae2') ||
        e.defaultPrevented
      ) {
        return;
      }
      e.preventDefault();
      dr?.classList.add('over');
    })
  );
  ['dragleave', 'drop'].forEach((n) =>
    document.addEventListener(n, (e: any) => {
      // Do not hijack drag/drop when on the Gifts Studio, Gift Image Creator, 3D Gold Designer, or Editor tab
      if (
        document.getElementById('gifts')?.classList.contains('on') ||
        document.getElementById('gift-image')?.classList.contains('on') ||
        document.getElementById('gold-designer')?.classList.contains('on') ||
        document.getElementById('editor')?.classList.contains('on') ||
        document.getElementById('editor-ae2')?.classList.contains('on') ||
        location.hash === '#gifts' ||
        location.hash === '#gift-image' ||
        location.hash === '#gold-designer' ||
        location.hash === '#editor' ||
        location.hash === '#editor-ae2' ||
        e.target?.closest?.('#gifts') ||
        e.target?.closest?.('#gift-image') ||
        e.target?.closest?.('#gold-designer') ||
        e.target?.closest?.('#editor') ||
        e.target?.closest?.('#editor-ae2') ||
        e.defaultPrevented
      ) {
        return;
      }
      e.preventDefault();
      dr?.classList.remove('over');
      if (n === 'drop' && e.dataTransfer?.files?.[0]) load(e.dataTransfer.files[0]);
    })
  );
  function info(o) {
    $('#info').innerHTML = Object.entries(o)
      .map(([k, v]) => `<span>${k}: ${v}</span>`)
      .join('');
  }
  let load = function (f) {
    cur = f;
    (window as any).__currentMotionFile = f;
    userAdjustedZoom = false;
    previewZoom = 1;
    show('convert');
    const ext = f.name.split('.').pop().toLowerCase(),
      u = URL.createObjectURL(f),
      v = $('#view');
    v.innerHTML = '';
    v.style.border = '0';
    player = null;
    $('#assets').innerHTML = '';
    info({ Format: ext.toUpperCase(), 'File Size': kb(f.size), 'File Name': f.name });
    if (typeof (window as any).__recordUploadActivity === 'function') {
      (window as any).__recordUploadActivity(f.name, kb(f.size), ext.toUpperCase());
    }
  };

  const defaultGiftBg = 'repeating-conic-gradient(#999 0 25%,#ccc 0 50%) 0 0/14px 14px';
  let curGiftBg: { type: 'color' | 'chk' | 'image'; val: string } = { type: 'chk', val: defaultGiftBg };
  let previewZoom = 1;
  let userAdjustedZoom = false;

  function getAutoDefaultZoom(w?: number, h?: number): number {
    const maxDim = Math.max(Number(w) || 0, Number(h) || 0);
    return maxDim >= 600 ? 1.6 : 1;
  }

  function getHiResCanvasDims(w?: number, h?: number): [number, number] {
    const W = Math.max(1, Number(w) || 500);
    const H = Math.max(1, Number(h) || 500);
    const dpr = Math.min(2, Math.max(1, Number(window.devicePixelRatio) || 1));
    const baseScale = Math.min(2, 400 / Math.max(W, H));
    const targetW = Math.max(W, Math.round(W * baseScale * Math.max(2.2, previewZoom) * dpr));
    const targetH = Math.max(H, Math.round(H * baseScale * Math.max(2.2, previewZoom) * dpr));
    const capScale = Math.min(1, 1920 / Math.max(targetW, targetH));
    return [Math.max(1, Math.round(targetW * capScale)), Math.max(1, Math.round(targetH * capScale))];
  }

  function applyGiftBg(val: string, isImage = false) {
    curGiftBg = isImage
      ? { type: 'image', val }
      : val === 'chk'
      ? { type: 'chk', val: defaultGiftBg }
      : { type: 'color', val };

    const v = document.getElementById('view') as HTMLElement | null;
    if (v) {
      if (isImage) {
        v.style.backgroundColor = '#0c0d14';
        v.style.backgroundImage = `url("${val}")`;
        v.style.backgroundSize = '100% 100%';
        v.style.backgroundPosition = 'center';
        v.style.backgroundRepeat = 'no-repeat';
      } else {
        v.style.backgroundImage = 'none';
        v.style.background = curGiftBg.val;
      }
      v.querySelectorAll('canvas').forEach((c) => {
        (c as HTMLElement).style.background = 'transparent';
      });
    }
    const stage = document.getElementById('stage') as HTMLElement | null;
    if (stage) stage.style.background = '';

    // Sync #dots UI indicators
    const clearBtnEl = document.getElementById('clearBgImgBtn');
    const bgBtnEl = document.getElementById('bgImgBtn');
    if (isImage) {
      $$('#dots b').forEach((el) => el.classList.remove('active'));
      if (bgBtnEl) bgBtnEl.classList.add('active');
      if (clearBtnEl) clearBtnEl.style.display = 'inline-flex';
    } else {
      if (bgBtnEl) bgBtnEl.classList.remove('active');
      if (clearBtnEl) clearBtnEl.style.display = 'none';
      const targetKey = val === 'chk' ? 'chk' : val.toLowerCase();
      $$('#dots b').forEach((el) => {
        const dBg = ((el as HTMLElement).dataset.bg || '').toLowerCase();
        el.classList.toggle('active', dBg === targetKey);
      });
    }

    try {
      window.dispatchEvent(new CustomEvent('giftbgchange', { detail: curGiftBg }));
    } catch (_) {}
  }

  function updateZoomLabel() {
    const zBtn = document.getElementById('zoomResetBtn');
    if (zBtn) zBtn.textContent = `${Math.round(previewZoom * 100)}%`;
  }

  function syncPreviewSize(customW?: number, customH?: number) {
    updateZoomLabel();
    const v = document.getElementById('view') as HTMLElement | null;
    if (!v) return;
    const W = Number(customW || (S && S.w) || 0);
    const H = Number(customH || (S && S.h) || 0);
    if (W > 0 && H > 0) {
      const baseScale = Math.min(2, 400 / Math.max(W, H));
      const displayW = Math.max(24, Math.round(W * baseScale * previewZoom));
      const displayH = Math.max(24, Math.round(H * baseScale * previewZoom));
      v.classList.add('loaded');
      v.style.width = `${displayW}px`;
      v.style.height = `${displayH}px`;
      v.style.aspectRatio = 'unset';

      Array.from(v.children).forEach((child) => {
        const el = child as HTMLElement;
        if (el.style.display === 'none') return;
        el.style.width = `${displayW}px`;
        el.style.height = `${displayH}px`;
        el.style.maxWidth = 'none';
        el.style.maxHeight = 'none';
        if (el.tagName === 'VIDEO' || el.tagName === 'IMG' || el.tagName === 'CANVAS') {
          el.style.display = 'block';
          el.style.objectFit = 'fill';
        }
        const innerCanvas = el.tagName === 'CANVAS' ? null : (el.querySelector?.('canvas') as HTMLCanvasElement | null);
        if (innerCanvas) {
          innerCanvas.style.width = `${displayW}px`;
          innerCanvas.style.height = `${displayH}px`;
          innerCanvas.style.maxWidth = 'none';
          innerCanvas.style.maxHeight = 'none';
          innerCanvas.style.display = 'block';
        }
        const innerSvg = el.querySelector?.('svg');
        if (innerSvg) {
          innerSvg.setAttribute('width', String(displayW));
          innerSvg.setAttribute('height', String(displayH));
          (innerSvg as HTMLElement).style.display = 'block';
        }
      });

      if (anim && typeof anim.resize === 'function') {
        try {
          anim.resize();
        } catch (_) {}
      }
    } else if (!v.classList.contains('loaded')) {
      const boxPx = Math.max(120, Math.round(420 * previewZoom));
      v.style.width = `${boxPx}px`;
      v.style.height = `${boxPx}px`;
    }
    if (typeof (window as any).__reapplyStageEdgeFeather === 'function') {
      (window as any).__reapplyStageEdgeFeather();
    }
  }

  (window as any).__applyGiftBg = applyGiftBg;
  (window as any).__getGiftBg = () => curGiftBg;
  (window as any).__syncPreviewSize = syncPreviewSize;
  (window as any).__getMotionAnimationState = () => {
    if (!S) {
      const vid = document.querySelector('#view video') as HTMLVideoElement | null;
      if (vid && vid.duration > 0) {
        return {
          w: vid.videoWidth || 360,
          h: vid.videoHeight || 360,
          fps: 30,
          n: Math.round(vid.duration * 30),
          vid,
          duration: vid.duration,
          player: null,
        };
      }
      return null;
    }
    const dur = S.vid && S.vid.duration > 0 ? S.vid.duration : S.n / Math.max(1, S.fps || 15);
    return {
      w: S.w,
      h: S.h,
      fps: S.fps || 15,
      n: S.n || 1,
      vid: S.vid || null,
      duration: dur,
      set: S.set,
      draw: S.draw,
      player: player || (window as any).SVP || null,
    };
  };

  (window as any).__seekMotionFrameOrTime = async (timeSec: number) => {
    if (S && S.vid) {
      try {
        S.vid.currentTime = Math.min(S.vid.duration, Math.max(0, timeSec));
      } catch (_) {}
    } else if (S && typeof S.set === 'function') {
      const frame = Math.round(timeSec * (S.fps || 15));
      try {
        await S.set(Math.min((S.n || 1) - 1, Math.max(0, frame)));
      } catch (_) {}
    }
  };

  // Active main-stage playback trim loop monitor for video and animation in #view
  (function initMainStageTrimMonitor() {
    setInterval(() => {
      if (window.__busy) return;
      const previewRange = (window as any).__previewTrimRange;
      const cfg = (window as any).__edgeFeather;
      const trimCheck = document.getElementById('trim') as HTMLInputElement | null;

      let isTrimActive = false;
      let startSec = 0;
      let endSec = 0;

      if (previewRange && previewRange.active && previewRange.end > previewRange.start) {
        isTrimActive = true;
        startSec = Number(previewRange.start || 0);
        endSec = Number(previewRange.end || 0);
      } else if (cfg && cfg.trimEnabled && cfg.trimEndTime > cfg.trimStartTime) {
        isTrimActive = true;
        startSec = Number(cfg.trimStartTime || 0);
        endSec = Number(cfg.trimEndTime || 0);
      } else if (trimCheck && trimCheck.checked) {
        isTrimActive = true;
        startSec = parseFloat((document.getElementById('trimStart') as HTMLInputElement | null)?.value || '0');
        endSec = parseFloat((document.getElementById('trimEnd') as HTMLInputElement | null)?.value || '0');
      }

      if (!isTrimActive || endSec <= startSec) return;

      // Monitor HTML5 Video in #view
      const viewVid = document.querySelector('#view video') as HTMLVideoElement | null;
      if (viewVid && viewVid.duration > 0 && !viewVid.paused) {
        if (viewVid.currentTime >= endSec - 0.04 || viewVid.currentTime < startSec - 0.05) {
          try {
            viewVid.currentTime = startSec;
          } catch (_) {}
        }
      }
    }, 80);
  })();

  // Initialize default background to gray/white checkerboard automatically
  applyGiftBg('chk');

  const zoomInBtn = document.getElementById('zoomInBtn');
  const zoomOutBtn = document.getElementById('zoomOutBtn');
  const zoomResetBtn = document.getElementById('zoomResetBtn');

  if (zoomInBtn) {
    zoomInBtn.onclick = () => {
      userAdjustedZoom = true;
      previewZoom = Math.min(3, Math.round((previewZoom + 0.2) * 100) / 100);
      syncPreviewSize();
    };
  }
  if (zoomOutBtn) {
    zoomOutBtn.onclick = () => {
      userAdjustedZoom = true;
      previewZoom = Math.max(0.2, Math.round((previewZoom - 0.2) * 100) / 100);
      syncPreviewSize();
    };
  }
  if (zoomResetBtn) {
    zoomResetBtn.onclick = () => {
      userAdjustedZoom = true;
      const defaultZ = getAutoDefaultZoom(S?.w, S?.h);
      previewZoom = Math.abs(previewZoom - defaultZ) < 0.05 ? 1 : defaultZ;
      syncPreviewSize();
    };
  }

  $$('#dots b').forEach((b) => {
    b.onclick = () => {
      const bg = (b as HTMLElement).dataset.bg || (b as HTMLElement).style.background;
      applyGiftBg(bg, false);
    };
  });

  const bgCustomColor = document.getElementById('bgCustomColorInput') as HTMLInputElement | null;
  if (bgCustomColor) {
    bgCustomColor.oninput = (e: any) => {
      if (e.target?.value) {
        applyGiftBg(e.target.value, false);
      }
    };
  }

  const bgBtn = document.getElementById('bgImgBtn');
  const bgInput = document.getElementById('bgImgInput') as HTMLInputElement | null;
  const clearBtn = document.getElementById('clearBgImgBtn');

  if (bgBtn && bgInput) {
    bgBtn.onclick = () => bgInput.click();
    bgInput.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          applyGiftBg(ev.target.result as string, true);
        }
      };
      reader.readAsDataURL(file);
      bgInput.value = '';
    };
  }

  if (clearBtn) {
    clearBtn.onclick = (e) => {
      e.stopPropagation();
      applyGiftBg('chk', false);
    };
  }
  $('#again').onclick = () => fi.click();
  $('#q').oninput = (e) =>
    $$('#assets div').forEach((d) => (d.style.display = d.title.includes(e.target.value) ? '' : 'none'));

  const wInputEl = document.getElementById('w') as HTMLInputElement | null;
  const hInputEl = document.getElementById('h') as HTMLInputElement | null;
  const onDimInputChange = () => {
    const nw = Number(wInputEl?.value || (S && S.w) || 0);
    const nh = Number(hInputEl?.value || (S && S.h) || 0);
    if (nw > 0 && nh > 0) {
      if (!userAdjustedZoom) {
        previewZoom = getAutoDefaultZoom(nw, nh);
      }
      syncPreviewSize(nw, nh);
    }
  };
  if (wInputEl) wInputEl.addEventListener('input', onDimInputChange);
  if (hInputEl) hInputEl.addEventListener('input', onDimInputChange);

  const h = location.hash.slice(1);
  if (['home', 'convert', 'editor', 'gifts'].includes(h)) show(h);

  /* Block 3: Core conversion & playback */
  let S = null,
    anim = null;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    LY = () => $('#lay').value;
  const mk = (w, h) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  };
  const bl = (c, m, q) => new Promise((r) => c.toBlob(r, m, q));
  let dlBar = function (msg, b, n) {
    let el = document.getElementById('dlbar');
    if (!el) {
      el = document.createElement('div');
      el.id = 'dlbar';
      el.style.cssText =
        'position:fixed;left:50%;transform:translateX(-50%);bottom:64px;z-index:99;background:#14141c;border:1px solid var(--ac);color:var(--tx);padding:10px 14px;border-radius:10px;display:flex;gap:10px;align-items:center;max-width:92vw;font-size:12px';
      document.body.appendChild(el);
    }
    el.textContent = '';
    const s = document.createElement('span');
    s.textContent = msg;
    el.appendChild(s);
    if (b) {
      const k = document.createElement('button');
      k.className = 'pill';
      k.textContent = 'Save file';
      k.onclick = () => dl0(b, n);
      el.appendChild(k);
    }
    const x = document.createElement('button');
    x.className = 'pill';
    x.textContent = '✕';
    x.onclick = () => el.remove();
    el.appendChild(x);
  };
  window.dlBar = dlBar;
  let dl0 = async function (b, n) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = n;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(a.href);
    }, 4000);
    toast('Saved ' + n + ' · ' + kb(b.size));
  };
  let dl = async function (b, n) {
    dlBar('File ready: ' + n + ' · ' + kb(b.size), b, n);
    const res = await dl0(b, n);
    if (!(b as any)?.__certAlreadyEmbedded) {
      void issueAndAutoAttachGiftCertificate({
        giftFileName: n,
        fileSizeBytes: b.size,
        sourceStudio: 'منصة المصمم أحمد للهدايا',
      });
    }
    return res;
  };
  let drawVid = function (c, W, H, m) {
    const L = LY(),
      vw = m.videoWidth,
      vh = m.videoHeight;
    if (L === 'n') return c.drawImage(m, 0, 0, W, H);
    const hw = vw / 2,
      t = mk(hw, vh),
      x = t.getContext('2d', { willReadFrequently: true }),
      ca = L === 'r' ? 0 : hw,
      aa = L === 'r' ? hw : 0;
    x.drawImage(m, ca, 0, hw, vh, 0, 0, hw, vh);
    const C = x.getImageData(0, 0, hw, vh);
    x.clearRect(0, 0, hw, vh);
    x.drawImage(m, aa, 0, hw, vh, 0, 0, hw, vh);
    const A = x.getImageData(0, 0, hw, vh);
    for (let i = 0; i < C.data.length; i += 4) C.data[i + 3] = A.data[i];
    x.putImageData(C, 0, 0);
    c.drawImage(t, 0, 0, W, H);
  };
  load = async function (f) {
    cur = f;
    (window as any).__currentMotionFile = f;
    if (window.SVP) {
      try {
        window.SVP.pauseAnimation?.();
        window.SVP.clear?.();
      } catch (_) {}
      window.SVP = null;
    }
    if (player) {
      try {
        player.pauseAnimation?.();
        player.clear?.();
      } catch (_) {}
      player = null;
    }
    S = null;
    anim = null;
    show('convert');
    $('#view').textContent = 'Loading…';
    const ext = f.name.split('.').pop().toLowerCase(),
      u = URL.createObjectURL(f),
      v = $('#view');
    v.innerHTML = '';
    v.style.border = '0';
    v.classList.add('loaded');
    const curB = (window as any).__getGiftBg?.();
    if (curB) (window as any).__applyGiftBg?.(curB.val, curB.type === 'image');
    $('#assets').innerHTML = '';
    $('#pp').textContent = 'Pause';
    try {
      if (ext === 'svga') {
        if (typeof SVGA === 'undefined') throw Error('SVGA player failed to load');
        const d = document.createElement('div');
        v.appendChild(d);
        const vi = await new Promise((ok, no) => new SVGA.Parser().load(f, ok, no)).catch(
            () => new Promise((ok, no) => new SVGA.Parser().load(u, ok, no))
          ),
          w = vi.videoSize.width,
          h = vi.videoSize.height,
          [hiW, hiH] = getHiResCanvasDims(w, h);
        d.style.cssText = `width:${hiW}px;height:${hiH}px`;
        player = new SVGA.Player(d);
        player.setVideoItem(vi);
        try {
          player._resize = () => {};
        } catch (_) {}
        player.startAnimation();
        S = {
          w,
          h,
          fps: vi.FPS,
          n: vi.frames,
          set: async (i) => {
            player.stepToFrame(i, false);
            try {
              player._renderer?.drawFrame?.(i);
            } catch (_) {}
            await sleep(8);
          },
          draw: (c, W, H) => c.drawImage(d.querySelector('canvas'), 0, 0, W, H),
          stop: () => player.pauseAnimation(),
          go: () => player.startAnimation(),
        };
        info({
          Format: 'SVGA',
          Resolution: w + ' × ' + h,
          'Frame Rate': vi.FPS + ' FPS',
          Duration: (vi.frames / vi.FPS).toFixed(2) + ' S',
          'File Size': kb(f.size),
          'Image Count': Object.keys(vi.images || {}).length,
          'File Name': f.name,
        });
        $('#assets').innerHTML = Object.entries(vi.images || {})
          .map(
            ([k, x]) =>
              `<div title="${k}"><img src="${/^data:|^http/.test(x) ? x : 'data:image/png;base64,' + x}" alt="${k}"></div>`
          )
          .join('');
      } else if (ext === 'json') {
        await LIBS.all;
        if (typeof lottie === 'undefined') throw Error('Lottie player failed to load');
        const data = JSON.parse(await f.text()),
          s = Math.min(2, 400 / Math.max(data.w, data.h)),
          d = document.createElement('div');
        (window as any).__lottieData = data;
        d.style.cssText = `width:${data.w * s}px;height:${data.h * s}px`;
        v.appendChild(d);
        anim = lottie.loadAnimation({
          container: d,
          renderer: 'canvas',
          loop: true,
          autoplay: true,
          animationData: data,
        });
        S = {
          w: data.w,
          h: data.h,
          fps: data.fr,
          n: Math.max(1, Math.round(data.op - data.ip)),
          set: async (i) => {
            anim.goToAndStop(i, true);
            await sleep(0);
          },
          draw: (c, W, H) => c.drawImage(d.querySelector('canvas'), 0, 0, W, H),
          stop: () => anim.pause(),
          go: () => anim.play(),
        };
        info({
          Format: 'Lottie',
          Resolution: data.w + ' × ' + data.h,
          'Frame Rate': data.fr + ' FPS',
          Duration: (S.n / data.fr).toFixed(2) + ' S',
          Layers: (data.layers || []).length,
          'File Size': kb(f.size),
          'File Name': f.name,
        });
      } else if (/^(mp4|mov|webm|vap|yyeva)$/.test(ext)) {
        let rawBytes = f.__rawBytes || new Uint8Array(await f.arrayBuffer());
        let videoBytes = rawBytes;
        if (rawBytes[0] === 0x50 && rawBytes[1] === 0x4b && window.JSZip) {
          const z = await window.JSZip.loadAsync(f);
          const allNames = Object.keys(z.files).filter((n) => !/__MACOSX/.test(n));
          const vidEntry = allNames.find((n) => /\.(mp4|mov|webm|vap|yyeva)$/i.test(n));
          const jsonEntries = allNames.filter((n) => /\.json$/i.test(n));
          for (const jn of jsonEntries) {
            try {
              const jTxt = await z.file(jn).async('string');
              const parsed = JSON.parse(jTxt);
              const zm = metaFromAnyObject(parsed, ext === 'vap' ? 'VAP' : 'YYEVA');
              if (zm) {
                f.__zipMeta = zm;
                break;
              }
            } catch (_) {}
          }
          if (vidEntry) {
            const vb = await z.file(vidEntry).async('blob');
            videoBytes = new Uint8Array(await vb.arrayBuffer());
            rawBytes = videoBytes;
          }
        }
        f.__rawBytes = rawBytes;
        const ftypPos = bidx(videoBytes, 'ftyp');
        if (ftypPos > 4 && ftypPos < 65536) {
          videoBytes = videoBytes.subarray(ftypPos - 4);
        }
        const mimeType =
          ext === 'webm' ? 'video/webm' : ext === 'mov' ? 'video/quicktime' : 'video/mp4';
        const videoUrl = URL.createObjectURL(new Blob([videoBytes], { type: mimeType }));
        const m = document.createElement('video');
        m.src = videoUrl;
        m.loop = m.autoplay = m.playsInline = true;
        m.muted = true;
        v.appendChild(m);
        m.play().catch(() => {});
        await new Promise((ok, no) => {
          m.onloadedmetadata = ok;
          m.onerror = () => no(Error('This browser cannot decode .' + ext));
        });
        const fps = 30;
        S = {
          w: m.videoWidth,
          h: m.videoHeight,
          fps,
          n: Math.max(1, Math.floor(m.duration * fps)),
          vid: m,
          set: async (i) => {
            const t = Math.min((i + 0.5) / fps, m.duration - 0.001);
            if (Math.abs(m.currentTime - t) < 0.001) return;
            await Promise.race([
              new Promise((r) => {
                m.onseeked = r;
                m.currentTime = t;
              }),
              sleep(800),
            ]);
          },
          draw: (c, W, H) => drawVid(c, W, H, m),
          stop: () => m.pause(),
          go: () => m.play(),
        };
        info({
          Format: ext.toUpperCase(),
          Resolution: m.videoWidth + ' × ' + m.videoHeight,
          Duration: m.duration.toFixed(2) + ' S',
          'File Size': kb(f.size),
          'File Name': f.name,
        });
      } else if (/^(gif|webp|png|apng|jpg|jpeg)$/.test(ext)) {
        const rawBuf = new Uint8Array(await f.arrayBuffer());
        let w = 0,
          h = 0,
          n = 1,
          fps = 15;
        let frameBitmaps: ImageBitmap[] = [];
        let frameDurationsMs: number[] = [];

        // 1. Check if PNG/APNG via header & UPNG decoder
        const isPngSig =
          rawBuf.length > 8 &&
          rawBuf[0] === 0x89 &&
          rawBuf[1] === 0x50 &&
          rawBuf[2] === 0x4e &&
          rawBuf[3] === 0x47;
        const isWebpSig =
          rawBuf.length > 12 &&
          TD.decode(rawBuf.subarray(0, 4)) === 'RIFF' &&
          TD.decode(rawBuf.subarray(8, 12)) === 'WEBP';

        if (isPngSig) {
          try {
            const apngInfo = parseApngInfo(rawBuf);
            if (apngInfo && apngInfo.isApng && apngInfo.numFrames > 1) {
              const decoded = decodeApngFramesRgba(rawBuf);
              w = decoded.width;
              h = decoded.height;
              frameDurationsMs = decoded.delaysMs;
              const avgMs =
                frameDurationsMs.reduce((a, b) => a + b, 0) / Math.max(1, frameDurationsMs.length);
              fps = Math.max(1, Math.min(60, Math.round(1000 / Math.max(10, avgMs))));
              for (const rgba of decoded.frames) {
                const c = mk(w, h);
                const cx = c.getContext('2d');
                const id = new ImageData(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength), w, h);
                cx.putImageData(id, 0, 0);
                frameBitmaps.push(await createImageBitmap(c));
              }
              n = frameBitmaps.length;
            }
          } catch (_) {}
        }

        // 2. Try browser ImageDecoder for animated WebP / GIF / APNG if not yet decoded
        if (frameBitmaps.length === 0 && window.ImageDecoder) {
          try {
            const mimeType = isPngSig
              ? 'image/png'
              : isWebpSig
              ? 'image/webp'
              : ext === 'gif'
              ? 'image/gif'
              : f.type || 'image/' + (ext === 'apng' ? 'png' : ext);
            const dec = new ImageDecoder({ data: rawBuf.slice().buffer, type: mimeType });
            await dec.tracks.ready;
            const total = dec.tracks.selectedTrack?.frameCount || 1;
            if (total > 1) {
              for (let fi = 0; fi < total; fi++) {
                const r = await dec.decode({ frameIndex: fi });
                if (!w) {
                  w = r.image.displayWidth || r.image.codedWidth;
                  h = r.image.displayHeight || r.image.codedHeight;
                }
                const durMs = r.image.duration ? Math.max(10, r.image.duration / 1000) : 67;
                frameDurationsMs.push(durMs);
                const c = mk(w, h);
                c.getContext('2d').drawImage(r.image, 0, 0, w, h);
                r.image.close();
                frameBitmaps.push(await createImageBitmap(c));
              }
              n = frameBitmaps.length;
              const avgMs =
                frameDurationsMs.reduce((a, b) => a + b, 0) / Math.max(1, frameDurationsMs.length);
              fps = Math.max(1, Math.min(60, Math.round(1000 / Math.max(10, avgMs))));
            }
            dec.close?.();
          } catch (_) {}
        }

        // 3. Fallback for Animated WebP if ImageDecoder was unavailable/failed: demux ANMF chunks into single-frame WebPs
        if (frameBitmaps.length === 0 && isWebpSig) {
          try {
            const wInfo = parseAnimatedWebPInfo(rawBuf);
            if (wInfo && wInfo.isAnimated && wInfo.frameCount > 1) {
              const demuxed = demuxAnimatedWebPToSingleFrames(rawBuf);
              w = demuxed.width;
              h = demuxed.height;
              frameDurationsMs = demuxed.durationsMs;
              for (const sf of demuxed.frames) {
                const bm = await createImageBitmap(new Blob([sf], { type: 'image/webp' }));
                frameBitmaps.push(bm);
              }
              n = frameBitmaps.length;
              const avgMs =
                frameDurationsMs.reduce((a, b) => a + b, 0) / Math.max(1, frameDurationsMs.length);
              fps = Math.max(1, Math.min(60, Math.round(1000 / Math.max(10, avgMs))));
            }
          } catch (_) {}
        }

        // 4. Static or single-frame fallback via <img>
        if (frameBitmaps.length === 0) {
          const img = new Image();
          img.src = u;
          await img.decode();
          w = img.naturalWidth || 400;
          h = img.naturalHeight || 400;
          frameBitmaps = [await createImageBitmap(img)];
          frameDurationsMs = [67];
          n = 1;
        }

        // Render interactive canvas player in #view at full high resolution so play/pause/seek and alpha checkerboard stay razor-sharp
        const [hiW, hiH] = getHiResCanvasDims(w, h);
        const cv = mk(hiW, hiH);
        const cx = cv.getContext('2d');
        if (cx) {
          cx.imageSmoothingEnabled = true;
          cx.imageSmoothingQuality = 'high';
        }
        cv.style.background = 'transparent';
        v.appendChild(cv);

        let curIdx = 0;
        let playing = n > 1;
        let timerId: any = null;

        const paintFrame = (idx: number) => {
          const bm = frameBitmaps[idx] || frameBitmaps[0];
          if (!bm) return;
          cx.clearRect(0, 0, cv.width, cv.height);
          cx.drawImage(bm, 0, 0, cv.width, cv.height);
          if ((window as any).__chromaKey?.enabled) {
            applyChromaKeyToContext(cx, cv.width, cv.height, (window as any).__chromaKey);
          }
        };
        paintFrame(0);

        const stepLoop = () => {
          if (!document.body.contains(cv)) return;
          if (playing && !window.__busy && n > 1) {
            curIdx = (curIdx + 1) % n;
            paintFrame(curIdx);
            const seekEl = $('#seek') as HTMLInputElement | null;
            if (seekEl && n > 1) {
              seekEl.value = String(Math.round((curIdx / (n - 1)) * 100));
            }
          }
          const delay = frameDurationsMs[curIdx] || Math.round(1000 / fps);
          timerId = setTimeout(stepLoop, Math.max(16, delay));
        };
        if (n > 1) {
          timerId = setTimeout(stepLoop, frameDurationsMs[0] || Math.round(1000 / fps));
        }

        const detectedFmt =
          isPngSig && (ext === 'apng' || n > 1)
            ? 'APNG'
            : isWebpSig && n > 1
            ? 'Animated WebP'
            : ext.toUpperCase();

        S = {
          w,
          h,
          fps,
          n,
          _repaintCurrent: () => paintFrame(curIdx),
          set: async (i) => {
            curIdx = Math.max(0, Math.min(n - 1, i));
            paintFrame(curIdx);
          },
          draw: (c, W, H) => {
            const bm = frameBitmaps[curIdx] || frameBitmaps[0];
            if (bm) c.drawImage(bm, 0, 0, W, H);
          },
          stop: () => {
            playing = false;
          },
          go: () => {
            playing = true;
          },
        };
        info({
          Format: detectedFmt,
          Resolution: S.w + ' × ' + S.h,
          Frames: n,
          'Frame Rate': fps + ' FPS',
          Duration: (n / Math.max(1, fps)).toFixed(2) + ' S',
          'File Size': kb(f.size),
          'File Name': f.name,
        });
      } else {
        v.textContent =
          '.' + ext + ' needs a WebAssembly decoder that this page cannot load (PAG, VAP and YYEVA are not supported yet).';
        return;
      }
      $('#w').value = S.w;
      $('#h').value = S.h;
      $('#fps').value = Math.round(S.fps) || 15;
      if (!userAdjustedZoom && S && S.w > 0 && S.h > 0) {
        previewZoom = getAutoDefaultZoom(S.w, S.h);
      }
      syncPreviewSize(S.w, S.h);
    } catch (e) {
      v.textContent = e.message || 'Could not open this file.';
    }
  };
  $('#lay').onchange = () => {
    if (S && S.vid) {
      const L = LY();
      S.w = L === 'n' ? S.vid.videoWidth : S.vid.videoWidth / 2;
      $('#w').value = S.w;
      syncPreviewSize(S.w, S.h);
    }
  };
  $('#pp').onclick = function () {
    if (!S) return;
    if (S.paused) {
      S.go();
      S.paused = false;
      this.textContent = 'Pause';
    } else {
      S.stop();
      S.paused = true;
      this.textContent = 'Play';
    }
  };
  async function render(W, H, fps, cb) {
    const c = mk(W, H),
      x = c.getContext('2d', { willReadFrequently: true }),
      nk = Math.max(1, Math.round((S.n * fps) / S.fps));
    for (let k = 0; k < nk; k++) {
      const t = performance.now();
      await S.set(Math.min(S.n - 1, Math.round((k * S.fps) / fps)));
      x.clearRect(0, 0, W, H);
      S.draw(x, W, H);
      await cb(c, x, k, t);
      const pct = Math.round((100 * (k + 1)) / nk);
      toast('Rendering ' + pct + '%');
      const stEl = document.getElementById('exportStatus');
      if (stEl) stEl.textContent = `Rendering frames… ${pct}% (${k + 1}/${nk})`;
    }
  }
  let gifEnc = function (fr, W, H, fps) {
    const smp = [],
      st = Math.max(1, Math.floor((fr.length * W * H) / 90000));
    let n = 0;
    for (const d of fr)
      for (let i = 0; i < d.length; i += 4)
        if (n++ % st === 0 && d[i + 3] >= 128) smp.push((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    const boxes = [smp.length ? smp : [0]];
    while (boxes.length < 255) {
      let bi = -1,
        bs = 0,
        bc = 0;
      boxes.forEach((b, i) => {
        if (b.length < 2) return;
        const mn = [255, 255, 255],
          mx = [0, 0, 0];
        for (const p of b) {
          const c = [p >> 16, (p >> 8) & 255, p & 255];
          for (let k = 0; k < 3; k++) {
            if (c[k] < mn[k]) mn[k] = c[k];
            if (c[k] > mx[k]) mx[k] = c[k];
          }
        }
        let k0 = 0,
          r = 0;
        for (let k = 0; k < 3; k++)
          if (mx[k] - mn[k] > r) {
            r = mx[k] - mn[k];
            k0 = k;
          }
        const sc = r * Math.sqrt(b.length);
        if (r > 0 && sc > bs) {
          bs = sc;
          bi = i;
          bc = k0;
        }
      });
      if (bi < 0) break;
      const b = boxes[bi],
        sh = 16 - 8 * bc;
      b.sort((p, q) => ((p >> sh) & 255) - ((q >> sh) & 255));
      boxes.splice(bi, 1, b.slice(0, b.length >> 1), b.slice(b.length >> 1));
    }
    const pal = boxes.map((b) => {
        let r = 0,
          g = 0,
          l = 0;
        for (const p of b) {
          r += p >> 16;
          g += (p >> 8) & 255;
          l += p & 255;
        }
        return [Math.round(r / b.length), Math.round(g / b.length), Math.round(l / b.length)];
      }),
      cache = new Int16Array(32768).fill(-1),
      idx = (r, g, b) => {
        const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
        let v = cache[key];
        if (v >= 0) return v;
        let best = 0,
          bd = 1e9;
        const rr = (r & 248) | 4,
          gg = (g & 248) | 4,
          bb = (b & 248) | 4;
        for (let i = 0; i < pal.length; i++) {
          const p = pal[i],
            d = (p[0] - rr) ** 2 + (p[1] - gg) ** 2 + (p[2] - bb) ** 2;
          if (d < bd) {
            bd = d;
            best = i;
          }
        }
        return (cache[key] = best);
      };
    const o = [],
      w2 = (v) => o.push(v & 255, (v >> 8) & 255);
    o.push(71, 73, 70, 56, 57, 97);
    w2(W);
    w2(H);
    o.push(247, 0, 0);
    for (let i = 0; i < 256; i++) o.push(...(pal[i] || [0, 0, 0]));
    o.push(33, 255, 11, ...[...'NETSCAPE2.0'].map((c) => c.charCodeAt(0)), 3, 1, 0, 0, 0);
    for (const d of fr) {
      const px = new Uint8Array(W * H);
      for (let i = 0, j = 0; j < px.length; i += 4, j++)
        px[j] = d[i + 3] < 128 ? 255 : idx(d[i], d[i + 1], d[i + 2]);
      o.push(33, 249, 4, 9);
      w2(Math.max(2, Math.round(100 / fps)));
      o.push(255, 0, 44);
      w2(0);
      w2(0);
      w2(W);
      w2(H);
      o.push(0, 8);
      const b = lzw(px);
      for (let i = 0; i < b.length; i += 255) {
        const s = b.slice(i, i + 255);
        o.push(s.length, ...s);
      }
      o.push(0);
    }
    o.push(59);
    return new Blob([new Uint8Array(o)], { type: 'image/gif' });
  };
  let record = async function (W, H, fps, q, kind, draw) {
    window.__hasAu = !!(window.finalAudio && window.finalAudio());
    const list =
      kind === 'mp4'
        ? [
            ...(window.__hasAu ? ['video/mp4;codecs=avc1,mp4a.40.2'] : []),
            'video/mp4;codecs=avc1',
            'video/mp4',
          ]
        : [
            ...(window.__hasAu ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus'] : []),
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8',
            'video/webm',
          ];
    const mime = list.find((m) => MediaRecorder.isTypeSupported(m));
    if (!mime)
      throw Error(kind.toUpperCase() + ' recording is not supported by this browser. Try WebM in Chrome.');
    const o = mk(W, H),
      ox = o.getContext('2d'),
      chunks = [],
      mr = new MediaRecorder(await window.withAudio(o.captureStream(fps)), {
        mimeType: mime,
        videoBitsPerSecond: Math.round(W * H * fps * 0.4 * Math.max(q, 0.1)),
      });
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise((r) => (mr.onstop = r));
    mr.start();
    window.__aStart && window.__aStart();
    await render(...draw.size, fps, async (c, x, k, t) => {
      draw.paint(ox, c, x);
      await sleep(Math.max(0, 1000 / fps - (performance.now() - t)));
    });
    await sleep(120);
    mr.stop();
    await done;
    window.__aStop && window.__aStop();
    return { blob: new Blob(chunks, { type: mime }), ext: mime.includes('mp4') ? 'mp4' : 'webm' };
  };
  $('#start').onclick = async () => {
    if (!cur || !S) return toast('Upload a supported file first');
    const F = $('#fmt').value,
      W = +$('#w').value || S.w,
      H = +$('#h').value || S.h,
      fps = Math.max(1, +$('#fps').value || 15),
      q = (+$('#qual').value || 100) / 100,
      base = cur.name.replace(/\.\w+$/, '');
    if (F === 'orig') return dl(cur, cur.name);
    const btn = $('#start');
    btn.disabled = true;
    S.stop();
    try {
      if (/^(png|webp|jpg)$/.test(F)) {
        const c = mk(W, H),
          x = c.getContext('2d');
        await S.set(0);
        if (F === 'jpg') {
          x.fillStyle = '#fff';
          x.fillRect(0, 0, W, H);
        }
        S.draw(x, W, H);
        await dl(await bl(c, { png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg' }[F], q), base + '.' + F);
      } else if (F === 'zip') {
        if (typeof JSZip === 'undefined') throw Error('JSZip failed to load');
        const z = new JSZip();
        await render(W, H, fps, async (c, x, k) => {
          z.file(base + '_' + String(k).padStart(4, '0') + '.png', await window.pngQ(c, window.__cmp));
        });
        const autoCertCfg = loadCertificateAutoSettings();
        if (autoCertCfg.enabled && autoCertCfg.embedInZipArchives) {
          const certRec = issueGiftCertificate({
            giftName: base,
            fileFormat: 'ZIP',
            sourceStudio: 'منصة المصمم أحمد للهدايا',
          });
          await injectCertificateIntoJsZipInstance(z, certRec);
        }
        const zipOutBlob: any = await z.generateAsync({ type: 'blob' });
        zipOutBlob.__certAlreadyEmbedded = true;
        await dl(zipOutBlob, base + '_frames.zip');
      } else if (F === 'gif') {
        const fr = [];
        await render(W, H, fps, async (c, x) => {
          const d = x.getImageData(0, 0, W, H).data;
          if (q < 1) {
            const st = 1 + Math.round((1 - q) * 60);
            for (let i = 0; i < d.length; i += 4) {
              d[i] = Math.round(d[i] / st) * st;
              d[i + 1] = Math.round(d[i + 1] / st) * st;
              d[i + 2] = Math.round(d[i + 2] / st) * st;
            }
          }
          fr.push(d);
        });
        await dl(gifEnc(fr, W, H, fps), base + '.gif');
      } else if (F === 'apng') {
        const fr: Uint8Array[] = [];
        await render(W, H, fps, async (c, x) => {
          const imgData = x.getImageData(0, 0, W, H);
          fr.push(new Uint8Array(imgData.data.buffer.slice(0)));
        });
        const stEl = document.getElementById('exportStatus');
        if (stEl) stEl.textContent = 'Encoding Animated PNG (APNG)…';
        const apngBytes = encodeAnimatedApng(fr, W, H, fps, q, 0);
        await dl(new Blob([apngBytes], { type: 'image/apng' }), base + '.apng');
      } else if (F === 'webm' || F === 'mp4') {
        const r = await record(W, H, fps, q, F, {
          size: [W, H],
          paint: (o, c) => {
            o.clearRect(0, 0, W, H);
            o.drawImage(c, 0, 0);
          },
        });
        await dl(r.blob, base + '.' + r.ext);
      } else if (F === 'dual') {
        const r = await record(W * 2, H, fps, q, 'mp4', {
          size: [W, H],
          paint: (o, c, x) => {
            o.fillStyle = '#000';
            o.fillRect(0, 0, W * 2, H);
            o.drawImage(c, 0, 0);
            const d = x.getImageData(0, 0, W, H);
            for (let i = 0; i < d.data.length; i += 4) {
              d.data[i] = d.data[i + 1] = d.data[i + 2] = d.data[i + 3];
              d.data[i + 3] = 255;
            }
            o.putImageData(d, W, 0);
          },
        });
        await dl(r.blob, base + '_dual.' + r.ext);
      }
    } catch (e) {
      toast(e.message || 'Conversion failed');
    }
    btn.disabled = false;
    if (!S.paused) S.go();
  };

  /* Block 4: Image Edit Modal & Extra Formats */
  LIBS.defs.libpag = [
    'https://cdn.jsdelivr.net/npm/libpag@4.2.84/lib/libpag.min.js',
    'https://cdn.jsdelivr.net/npm/libpag@4.1.8/lib/libpag.min.js',
  ];
  document.head.insertAdjacentHTML(
    'beforeend',
    `<style>
.th{position:relative;cursor:default}.th img{max-width:100%;max-height:100%}.th .ac{position:absolute;top:3px;left:3px;right:3px;display:none;justify-content:space-between}.th:hover .ac,.th:focus-within .ac{display:flex}
.th .ac button{width:22px;height:22px;border-radius:5px;border:1px solid #fff6;background:#000a;color:#fff;cursor:pointer;padding:0;line-height:1}
.mo{position:fixed;inset:0;background:#000b;z-index:20;display:flex;align-items:center;justify-content:center;padding:12px}.mo[hidden]{display:none}
.md{background:#0e0e12;border:1px solid var(--line);border-radius:12px;width:min(1000px,100%);max-height:94%;display:flex;flex-direction:column;overflow:hidden}
.md header{display:flex;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--line)}.md header small,.md small{color:var(--mu);display:block;font-size:11px}.md header button{background:0;border:0;color:var(--tx);cursor:pointer;font-size:16px}
.mb{display:grid;grid-template-columns:1fr 340px;min-height:0;overflow:auto}.ml{padding:14px;border-right:1px solid var(--line)}.mr{padding:14px;display:flex;flex-direction:column;gap:12px;overflow:auto}
.mh{display:flex;align-items:center;gap:10px;margin-bottom:10px}.mh>img{width:36px;height:36px;border-radius:6px;background:#222;object-fit:contain}.bgs{margin-left:auto;display:flex;align-items:center;gap:6px;font-size:11px;color:var(--mu)}
.bgs i{width:20px;height:20px;border-radius:5px;border:1px solid #fff4;cursor:pointer;display:inline-block}.bgs i.on{outline:2px solid var(--ac2)}
.mst{display:grid;place-items:center;min-height:300px;border:1px solid var(--line);border-radius:8px;background:#111;padding:16px}.mst.chk,.bgs i[data-c=chk]{background:repeating-conic-gradient(#999 0 25%,#ddd 0 50%) 0 0/14px 14px}
#mc{outline:1px dashed #4a8cff;cursor:move;touch-action:none}
.card{border:1px solid var(--line);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:10px;background:#101015}
.md .g,.md .rd{padding:12px;border-radius:8px;cursor:pointer;font-weight:600;border:1px solid}.md .g{background:#16302a;border-color:#2a7a5a;color:#5de0ad}.md .rd{background:#2a1a1c;border-color:#6a2c33;color:#ff8a94}
.tg{display:flex;justify-content:space-between;align-items:center}.pos{display:flex;gap:6px}.pos button,.md footer button{flex:1;padding:8px;border-radius:8px;border:1px solid var(--line);background:#14141c;cursor:pointer}
.md footer{display:flex;justify-content:space-between;align-items:center;padding:12px 18px;border-top:1px solid var(--line)}.md footer span{display:flex;gap:8px}.md footer #msave{background:#13805a;border-color:#13805a}.md footer #msave:disabled{opacity:.45;cursor:not-allowed}
@media(max-width:820px){.mb{grid-template-columns:1fr}}</style>`
  );
  if (!document.getElementById('mo')) {
    document.body.insertAdjacentHTML(
      'beforeend',
      `<div class='mo' id='mo' hidden><div class='md' role='dialog' aria-label='Image Edit Tool'>
<header><div><b>Image Edit Tool</b><small>Replace, hide, or delete the image, and adjust text in the actual asset area</small></div><button id='mx' aria-label='Close'>✕</button></header>
<div class='mb'><section class='ml'><div class='mh'><img id='mth' alt=''><div><b id='mname'></b><small id='msz'></small></div><div class='bgs' id='mbgs'>Preview Background <i data-c='chk' class='on'></i><i data-c='#000' style='background:#000'></i><i data-c='#fff' style='background:#fff'></i><i data-c='#888' style='background:#888'></i></div></div>
<div class='mst chk' id='mstg'><canvas id='mc'></canvas></div><small id='mft' style='margin-top:8px'></small></section>
<aside class='mr'><div class='card'><b>Image Actions</b><button class='g' id='mrep'>Replace Image</button><label class='tg'><span><b>Show Image</b><small>Off saves a same-size transparent image</small></span><input type='checkbox' id='mshow' checked></label><button class='rd' id='mdel'>Delete Image</button></div>
<div class='card'><label class='tg'><b>Text</b><input type='checkbox' id='mton'></label><div id='mtb' hidden style='display:flex;flex-direction:column;gap:8px'>
<small>Text</small><input type='text' id='mtxt' value='Sample text'>
<small>Font</small><select id='mfont'><option value='0'>Arial / Helvetica</option><option value='1'>Georgia</option><option value='2'>Courier New</option><option value='3'>Impact</option><option value='4'>Trebuchet MS</option></select>
<small>Color</small><div style='display:flex;gap:6px'><input type='color' id='mcol' value='#ffe0a4' style='width:46px;padding:0'><input type='text' id='mhex' value='#ffe0a4'></div>
<div class='tg'><small>Text Scale</small><b id='mszv'>24px</b></div><input type='range' id='msize' min='8' max='200' value='24' style='accent-color:var(--ac)'>
<small>Drag the text inside the asset area on the left.</small><div class='pos'><button data-p='.88'>Bottom</button><button data-p='.5'>Center</button><button data-p='.12'>Top</button></div></div></div></aside></div>
<footer><small id='mst2'></small><span><button id='mcan'>Cancel</button><button id='msave' disabled>Save Changes</button></span></footer></div></div>`
    );
  }
  const FX = [
      'Arial, Helvetica, sans-serif',
      'Georgia, serif',
      '"Courier New", monospace',
      'Impact, sans-serif',
      '"Trebuchet MS", sans-serif',
    ],
    A = {};
  let M = null;
  const imgOf = (u) =>
    new Promise((r) => {
      const i = new Image();
      i.onload = () => r(i);
      i.onerror = () => r(null);
      i.src = u;
    });
  function mdraw() {
    const c = $('#mc'),
      x = c.getContext('2d'),
      { W, H } = M;
    c.width = W;
    c.height = H;
    x.clearRect(0, 0, W, H);
    if (M.show && !M.del && M.cur && (!M.isVapMask || M.hasCustomImg)) {
      x.drawImage(M.cur, 0, 0, W, H);
    }
    if (M.on) {
      x.font = 'bold ' + M.size + 'px ' + FX[M.font];
      x.fillStyle = M.col;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(M.txt, M.x * W, M.y * H);
    }
    const s = Math.min(1, 380 / Math.max(W, H));
    c.style.width = W * s + 'px';
    c.style.height = H * s + 'px';
    $('#mft').textContent = 'The dashed box is the actual output asset area · ' + W + ' × ' + H;
    $('#mst2').textContent = M.dirty ? 'Pending changes. Press Save Changes' : 'Please select operations to execute';
    $('#msave').disabled = !M.dirty;
  }
  async function openEdit(k) {
    const im = await imgOf(A[k]);
    if (!im) return toast('Cannot open this image');
    const vapSlot = S?.meta?.dynamicSlots?.find((sl: any) => sl.assetKey === k);
    const vapRep = vapSlot && S?._vapSlotReplacements?.[vapSlot.srcId];
    const hasCustomImg = vapSlot ? Boolean(vapRep && vapRep.active && vapRep.customImg) : true;
    const isTxtSlot = Boolean(vapSlot && vapSlot.isTextSlot);
    M = {
      k,
      cur: im,
      W: vapSlot ? vapSlot.w : im.naturalWidth,
      H: vapSlot ? vapSlot.h : im.naturalHeight,
      show: 1,
      del: 0,
      on: isTxtSlot ? 1 : 0,
      txt: vapRep?.text || (isTxtSlot ? vapSlot.srcTag || 'User Name' : 'Sample text'),
      font: 0,
      col: vapRep?.textColor || vapSlot?.color || '#ffe0a4',
      size: isTxtSlot ? Math.max(14, Math.round((vapSlot?.h || 48) * 0.48)) : 24,
      x: 0.5,
      y: 0.5,
      dirty: isTxtSlot ? 1 : 0,
      isVapMask: Boolean(vapSlot),
      hasCustomImg,
      vapSlot,
    };
    $('#mo').hidden = false;
    $('#mth').src = A[k];
    $('#mname').textContent = vapSlot
      ? `قناع ديناميكي: ${vapSlot.srcTag} (${vapSlot.srcType === 'txt' ? 'نص / اسم' : 'صورة / طبقة'})`
      : 'Current Image: ' + k;
    $('#msz').textContent = M.W + ' × ' + M.H;
    $('#mshow').checked = true;
    $('#mton').checked = Boolean(M.on);
    $('#mtb').hidden = !M.on;
    $('#mtb').style.display = M.on ? 'flex' : 'none';
    if ($('#mtxt')) $('#mtxt').value = M.txt;
    if ($('#mcol')) $('#mcol').value = M.col;
    if ($('#mhex')) $('#mhex').value = M.col;
    if ($('#msize')) $('#msize').value = String(M.size);
    if ($('#mszv')) $('#mszv').textContent = M.size + 'px';
    mdraw();
  }
  const mclose = () => {
      $('#mo').hidden = true;
      M = null;
    },
    ch = (f) => () => {
      if (!M) return;
      f();
      M.dirty = 1;
      mdraw();
    };
  $('#mx').onclick = $('#mcan').onclick = mclose;
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && M) mclose();
  });
  $('#mrep').onclick = () => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = 'image/*';
    i.onchange = async () => {
      const im = i.files[0] && (await imgOf(URL.createObjectURL(i.files[0])));
      if (!im) return toast('Cannot read this image');
      M.cur = im;
      M.hasCustomImg = true;
      M.del = 0;
      M.show = 1;
      $('#mshow').checked = true;
      M.dirty = 1;
      mdraw();
    };
    i.click();
  };
  $('#mshow').onchange = ch(() => {
    M.show = $('#mshow').checked ? 1 : 0;
  });
  $('#mdel').onclick = ch(() => {
    M.del = 1;
    toast('Image will be deleted (saved as transparent)');
  });
  $('#mton').onchange = ch(() => {
    M.on = $('#mton').checked ? 1 : 0;
    const b = $('#mtb');
    b.hidden = !M.on;
    b.style.display = M.on ? 'flex' : 'none';
  });
  $('#mtxt').oninput = ch(() => {
    M.txt = $('#mtxt').value;
  });
  $('#mfont').onchange = ch(() => {
    M.font = +$('#mfont').value;
  });
  $('#mcol').oninput = ch(() => {
    M.col = $('#mcol').value;
    $('#mhex').value = M.col;
  });
  $('#mhex').oninput = ch(() => {
    if (/^#[0-9a-f]{6}$/i.test($('#mhex').value)) {
      M.col = $('#mhex').value;
      $('#mcol').value = M.col;
    }
  });
  $('#msize').oninput = ch(() => {
    M.size = +$('#msize').value;
    $('#mszv').textContent = M.size + 'px';
  });
  $$('.pos button').forEach(
    (b) =>
      (b.onclick = ch(() => {
        M.y = +b.dataset.p;
        M.x = 0.5;
        if (!M.on) {
          M.on = 1;
          $('#mton').checked = true;
          $('#mtb').hidden = false;
          $('#mtb').style.display = 'flex';
        }
      }))
  );
  $$('#mbgs i').forEach(
    (i) =>
      (i.onclick = () => {
        $$('#mbgs i').forEach((o) => o.classList.remove('on'));
        i.classList.add('on');
        const s = $('#mstg');
        s.classList.toggle('chk', i.dataset.c === 'chk');
        s.style.background = i.dataset.c === 'chk' ? '' : i.dataset.c;
      })
  );
  let drag = 0;
  const mc = $('#mc');
  const mv = (e) => {
    if (!drag || !M || !M.on) return;
    const r = mc.getBoundingClientRect();
    M.x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    M.y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    M.dirty = 1;
    mdraw();
  };
  mc.onpointerdown = (e) => {
    drag = 1;
    mc.setPointerCapture(e.pointerId);
    mv(e);
  };
  mc.onpointermove = mv;
  mc.onpointerup = () => (drag = 0);
  let applyEdit = async function (url, k) {
    if (!window.SV) return;
    const im = await imgOf(url);
    if (im) window.SV.bm[k] = await createImageBitmap(im);
  };
  $('#msave').onclick = () => {
    const url = $('#mc').toDataURL('image/png'),
      k = M.k;
    A[k] = url;
    const t = document.querySelector('.th[data-k="' + k + '"] img');
    if (t) t.src = url;
    applyEdit(url, k);
    mclose();
    toast('Image updated');
  };
  async function copyImg(k) {
    const im = await imgOf(A[k]),
      c = mk(im.naturalWidth, im.naturalHeight);
    c.getContext('2d').drawImage(im, 0, 0);
    const b = await bl(c, 'image/png');
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]);
      toast('Image copied');
    } catch (e) {
      dl(b, k + '.png');
    }
  }
  function openAssetPreviewModal(k: string) {
    const url = A[k];
    if (!url) return;

    let modal = document.getElementById('assetPreviewModal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'assetPreviewModal';
    modal.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 99999;
      background: rgba(4, 4, 10, 0.88);
      backdrop-filter: blur(12px);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
      color: #fff;
    `;

    const img = new Image();
    img.src = url;
    img.onload = () => {
      const dimStr = `${img.naturalWidth} × ${img.naturalHeight} px`;
      let cmpBadgeHtml = '';
      try {
        const rawBytes = (window as any).__svgaRawImages?.[k];
        if (rawBytes && rawBytes instanceof Uint8Array) {
          const analysis = analyzePngBinary(rawBytes);
          cmpBadgeHtml = `<div style="font-size: 11px; color: #34d399; margin-top: 3px; font-weight: 600;">⚡ ${analysis.summaryAr}</div>`;
        }
      } catch (_) {}
      modal.innerHTML = `
        <div style="
          background: #12121a;
          border: 1px solid rgba(124, 92, 255, 0.4);
          box-shadow: 0 12px 48px rgba(0,0,0,0.7);
          border-radius: 14px;
          max-width: 90vw;
          max-height: 85vh;
          width: 580px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        ">
          <div style="
            padding: 12px 18px;
            border-bottom: 1px solid #1e1e2c;
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: #171722;
          ">
            <div>
              <div style="font-weight: 700; font-size: 14px; color: #f0f0f8;">🖼️ ${k}</div>
              <div style="font-size: 11px; color: #a0a0b5; margin-top: 2px;">الأبعاد الحقيقية: ${dimStr}</div>
              ${cmpBadgeHtml}
            </div>
            <button id="closePvModalBtn" style="
              background: #242436;
              border: 0;
              color: #fff;
              width: 28px;
              height: 28px;
              border-radius: 50%;
              cursor: pointer;
              font-size: 16px;
              font-weight: 700;
            ">✕</button>
          </div>
          <div style="
            flex: 1;
            min-height: 220px;
            max-height: 60vh;
            overflow: auto;
            display: grid;
            place-items: center;
            padding: 20px;
            background: repeating-conic-gradient(#1f1f2e 0 25%, #14141e 0 50%) 0 0 / 16px 16px;
          ">
            <img src="${url}" alt="${k}" style="max-width: 100%; max-height: 100%; object-fit: contain; filter: drop-shadow(0 4px 20px rgba(0,0,0,0.5));" />
          </div>
          <div style="
            padding: 12px 18px;
            border-top: 1px solid #1e1e2c;
            display: flex;
            gap: 10px;
            justify-content: flex-end;
            background: #171722;
          ">
            <a href="${url}" download="${k}.png" style="
              padding: 8px 16px;
              border-radius: 8px;
              background: #7c5cff;
              color: #fff;
              text-decoration: none;
              font-weight: 700;
              font-size: 12px;
              display: inline-flex;
              align-items: center;
              gap: 6px;
            ">⬇️ تحميل الصورة</a>
            <button id="pvCopyBtn" style="
              padding: 8px 16px;
              border-radius: 8px;
              background: #272738;
              border: 1px solid #3a3a52;
              color: #fff;
              font-weight: 700;
              font-size: 12px;
              cursor: pointer;
            ">📋 نسخ</button>
            <button id="pvEditBtn" style="
              padding: 8px 16px;
              border-radius: 8px;
              background: #272738;
              border: 1px solid #3a3a52;
              color: #fff;
              font-weight: 700;
              font-size: 12px;
              cursor: pointer;
            ">✎ تعديل</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
      });
      document.getElementById('closePvModalBtn')?.addEventListener('click', () => {
        modal.remove();
      });
      document.getElementById('pvCopyBtn')?.addEventListener('click', () => {
        copyImg(k);
      });
      document.getElementById('pvEditBtn')?.addEventListener('click', () => {
        modal.remove();
        openEdit(k);
      });
    };
  }

  const assetsEl = $('#assets');
  if (assetsEl) {
    assetsEl.addEventListener('click', (e: any) => {
      const t = e.target.closest('.th');
      if (!t) return;
      const k = t.dataset.k;
      if (e.target.closest('.ed')) {
        openEdit(k);
      } else if (e.target.closest('.cp')) {
        copyImg(k);
      } else {
        openAssetPreviewModal(k);
      }
    });
  }

  function renderAssetCards(filterQuery = '') {
    try {
      window.dispatchEvent(new CustomEvent('motionassetschange', { detail: { ...A } }));
    } catch (_) {}
    const assetsContainer = $('#assets');
    if (!assetsContainer) return;
    const q = filterQuery.trim().toLowerCase();
    const keys = Object.keys(A).filter((k) => !q || k.toLowerCase().includes(q));

    if (keys.length === 0) {
      assetsContainer.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:16px;color:var(--mu);font-size:11px">لا توجد صور مطابقة</div>`;
      return;
    }

    assetsContainer.innerHTML = keys
      .map((k) => {
        const src = A[k];
        return `<div class="th" title="${k}" data-k="${k}">
          <div class="th-img-wrap">
            <img src="${src}" alt="${k}" loading="lazy" />
          </div>
          <div class="th-info">
            <span class="th-name" title="${k}">${k}</span>
            <span class="ac">
              <button class="ed" title="تعديل الصورة" aria-label="Edit ${k}">✎</button>
              <button class="cp" title="نسخ الصورة" aria-label="Copy ${k}">⧉</button>
              <button class="pv" title="تكبير ومعاينة" aria-label="Preview ${k}">🔍</button>
            </span>
          </div>
        </div>`;
      })
      .join('');
  }

  function buildAssets() {
    for (const k in A) delete A[k];
    const rawMap = (window as any).__svgaRawImages || {};
    const im =
      (window.VI && player && window.VI.images) ||
      (window.SV && window.SV.m && window.SV.m.im) ||
      {};
    for (const k in im) {
      if (window.EDIT && window.EDIT[k]) {
        A[k] = window.EDIT[k];
      } else if (rawMap[k] && rawMap[k] instanceof Uint8Array && rawMap[k][0] === 0x89) {
        A[k] = 'data:image/png;base64,' + base64(rawMap[k]);
      } else if (im[k] instanceof Uint8Array) {
        const d = im[k];
        const mt =
          d[0] === 0xff && d[1] === 0xd8
            ? 'image/jpeg'
            : d[0] === 0x52 && d.length >= 12 && d[8] === 0x57
              ? 'image/webp'
              : 'image/png';
        A[k] = `data:${mt};base64,` + base64(d);
      } else {
        const s = im[k];
        if (typeof s === 'string') {
          A[k] = /^data:|^http/.test(s) ? s : 'data:image/png;base64,' + s;
        }
      }
    }
    if (!Object.keys(A).length && (window as any).__lottieData?.assets) {
      ((window as any).__lottieData.assets as any[]).forEach((asset, idx) => {
        if (asset && typeof asset.p === 'string' && /^data:image\/|^https?:|^blob:/.test(asset.p)) {
          const key = String(asset.id || `img_${idx}`);
          A[key] = asset.p;
        }
      });
    }
    const qVal = ($('#q') as HTMLInputElement)?.value || '';
    renderAssetCards(qVal);
  }

  (window as any).__getMotionAssets = () => ({ ...A });

  (window as any).__downloadAllImageAssets = async () => {
    const keys = Object.keys(A);
    if (!keys.length) {
      toast('No image assets available to download');
      return;
    }
    try {
      const z = new window.JSZip();
      for (const k of keys) {
        const url = A[k];
        if (!url) continue;
        const blob = await (await fetch(url)).blob();
        const fileName = /\.(png|jpe?g|webp|gif)$/i.test(k) ? k : `${k}.png`;
        z.file(fileName, blob);
      }
      const base = cur ? cur.name.replace(/\.[^.]+$/, '') : 'assets';
      const autoCertCfg = loadCertificateAutoSettings();
      if (autoCertCfg.enabled && autoCertCfg.embedInZipArchives) {
        const certRec = issueGiftCertificate({
          giftName: base,
          fileFormat: 'ZIP',
          sourceStudio: 'منصة المصمم أحمد للهدايا',
        });
        await injectCertificateIntoJsZipInstance(z, certRec);
      }
      const zipBlob: any = await z.generateAsync({ type: 'blob' });
      zipBlob.__certAlreadyEmbedded = true;
      await dl(zipBlob, `${base}_images.zip`);
    } catch (e: any) {
      toast(e?.message || 'Could not download image assets');
    }
  };

  (window as any).__downloadAudioAsset = async () => {
    const a = window.finalAudio && window.finalAudio();
    if (!a || (!a.bytes && !a.buf)) {
      toast('No audio asset in this file');
      return;
    }
    let dataBytes = a.bytes;
    if (!dataBytes && a.buf && typeof (window as any).mp3For === 'function') {
      try {
        dataBytes = await (window as any).mp3For(a);
      } catch (_) {}
    }
    if (!dataBytes) {
      toast('No audio asset in this file');
      return;
    }
    const base = cur ? cur.name.replace(/\.[^.]+$/, '') : 'audio';
    const isMpeg = a.isMp3 || (dataBytes[0] === 0x49 && dataBytes[1] === 0x44 && dataBytes[2] === 0x33) || (dataBytes[0] === 0xff && (dataBytes[1] & 0xe0) === 0xe0);
    const ext = isMpeg ? 'mp3' : 'wav';
    await dl(new Blob([dataBytes], { type: isMpeg ? 'audio/mpeg' : 'audio/wav' }), `${base}.${ext}`);
  };

  (window as any).__executeBatchImageOps = async (batchState: any) => {
    if (!batchState || !batchState.items) return;
    const itemEntries = Object.values(batchState.items) as any[];
    let opsApplied = 0;

    for (const op of itemEntries) {
      const key = op.key;
      if (!A[key]) continue;

      if (op.markedForDelete) {
        const origIm = await imgOf(A[key]);
        const W = Math.max(1, origIm?.naturalWidth || 1);
        const H = Math.max(1, origIm?.naturalHeight || 1);
        const c = mk(W, H);
        const transparentUrl = c.toDataURL('image/png');
        await applyEdit(transparentUrl, key);
        if ((window as any).__lottieData?.assets) {
          ((window as any).__lottieData.assets as any[]).forEach((asset, idx) => {
            const ak = String(asset?.id || `img_${idx}`);
            if (ak === key) asset.p = transparentUrl;
          });
        }
        delete A[key];
        if (Array.isArray((window as any).__WATERMARK_LAYERS)) {
          (window as any).__WATERMARK_LAYERS = (window as any).__WATERMARK_LAYERS.filter(
            (w: any) => w.imageKey !== key
          );
          (window as any).__syncStageWatermarks?.();
        }
        opsApplied++;
        continue;
      }

      let currentUrl = op.replacementDataUrl || A[key];
      const needsPixelPass = !!op.replacementDataUrl || !!batchState.removeBackground;

      if (needsPixelPass) {
        const origIm = await imgOf(A[key]);
        const newIm = await imgOf(currentUrl);
        if (newIm) {
          const W = Math.max(1, origIm?.naturalWidth || newIm.naturalWidth || 1);
          const H = Math.max(1, origIm?.naturalHeight || newIm.naturalHeight || 1);
          const c = mk(W, H);
          const ctx = c.getContext('2d', { willReadFrequently: true });
          ctx.clearRect(0, 0, W, H);
          ctx.drawImage(newIm, 0, 0, W, H);

          if (batchState.removeBackground) {
            const imgData = ctx.getImageData(0, 0, W, H);
            removeImageBackgroundData(imgData.data, W, H, 38);
            ctx.putImageData(imgData, 0, 0);
          }

          currentUrl = c.toDataURL('image/png');
          A[key] = currentUrl;
          await applyEdit(currentUrl, key);
          if ((window as any).__lottieData?.assets) {
            ((window as any).__lottieData.assets as any[]).forEach((asset, idx) => {
              const ak = String(asset?.id || `img_${idx}`);
              if (ak === key) asset.p = currentUrl;
            });
          }
          opsApplied++;
        }
      }

      const trimmedNewName = (op.newName || '').trim();
      if (trimmedNewName && trimmedNewName !== key) {
        const currentVal = A[key];
        delete A[key];
        A[trimmedNewName] = currentVal;

        if (window.EDIT && window.EDIT[key]) {
          window.EDIT[trimmedNewName] = window.EDIT[key];
        }
        if (window.SV) {
          if (window.SV.bm && window.SV.bm[key]) {
            window.SV.bm[trimmedNewName] = window.SV.bm[key];
          }
          if (window.SV.m && Array.isArray(window.SV.m.sp)) {
            window.SV.m.sp.forEach((s: any) => {
              if (s.key === key) s.key = trimmedNewName;
            });
          }
        }
        if (window.SVP && window.SVP._videoItem) {
          const vi = window.SVP._videoItem;
          if (vi.images && vi.images[key]) {
            vi.images[trimmedNewName] = vi.images[key];
          }
          if (Array.isArray(vi.sprites)) {
            vi.sprites.forEach((sp: any) => {
              if (sp.imageKey === key) sp.imageKey = trimmedNewName;
            });
          }
          try {
            window.SVP.setImage(currentVal, trimmedNewName);
          } catch (_) {}
        }
        if ((window as any).__lottieData) {
          const ld = (window as any).__lottieData;
          if (Array.isArray(ld.assets)) {
            ld.assets.forEach((asset: any, idx: number) => {
              const ak = String(asset?.id || `img_${idx}`);
              if (ak === key) asset.id = trimmedNewName;
            });
          }
          if (Array.isArray(ld.layers)) {
            ld.layers.forEach((ly: any) => {
              if (ly && ly.refId === key) ly.refId = trimmedNewName;
            });
          }
        }
        opsApplied++;
      }
    }

    // Reload live Lottie canvas if active
    if (anim && (window as any).__lottieData && typeof lottie !== 'undefined') {
      try {
        const v = $('#view');
        const container = v?.querySelector('div');
        if (container) {
          anim.destroy();
          container.innerHTML = '';
          anim = lottie.loadAnimation({
            container,
            renderer: 'canvas',
            loop: true,
            autoplay: !(S && S.paused),
            animationData: (window as any).__lottieData,
          });
          syncPreviewSize(S?.w, S?.h);
        }
      } catch (_) {}
    }

    const qVal = ($('#q') as HTMLInputElement)?.value || '';
    renderAssetCards(qVal);

    // Update Image Count badge in #info if present
    const infoSpans = $$('#info span');
    for (const sp of infoSpans) {
      if (sp.textContent && sp.textContent.startsWith('Image Count:')) {
        sp.textContent = `Image Count: ${Object.keys(A).length}`;
      }
    }

    toast(`Batch executed (${opsApplied} asset updates applied)`);
  };

  function syncStageWatermarks() {
    const v = document.getElementById('view');
    if (!v) return;
    let overlay = document.getElementById('stageWatermarkOverlay');
    const layers: AppliedWatermarkLayer[] = (window as any).__WATERMARK_LAYERS || [];
    if (!layers.length) {
      overlay?.remove();
      return;
    }
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'stageWatermarkOverlay';
      overlay.style.cssText =
        'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:15;';
      v.style.position = 'relative';
      v.appendChild(overlay);
    } else if (overlay.parentElement !== v) {
      v.style.position = 'relative';
      v.appendChild(overlay);
    }

    const baseW = S?.w || layers[0]?.animWidth || 413;
    const baseH = S?.h || layers[0]?.animHeight || 413;

    overlay.innerHTML = layers
      .map((ly) => {
        const currentSrc = A[ly.imageKey] || ly.dataUrl;
        const leftPct = (ly.x / Math.max(1, baseW)) * 100;
        const topPct = (ly.y / Math.max(1, baseH)) * 100;
        const wPct = ((ly.width * (ly.scale / 100)) / Math.max(1, baseW)) * 100;
        const hPct = ((ly.height * (ly.scale / 100)) / Math.max(1, baseH)) * 100;
        const op = Math.max(0, Math.min(1, ly.opacity / 100));
        return `<img
          src="${currentSrc}"
          alt="${ly.imageKey}"
          data-wm-key="${ly.imageKey}"
          style="
            position:absolute;
            left:${leftPct}%;
            top:${topPct}%;
            width:${wPct}%;
            height:${hPct}%;
            transform:translate(-50%, -50%) rotate(${ly.rotation}deg);
            transform-origin:center center;
            opacity:${op};
            object-fit:contain;
            pointer-events:none;
          "
        />`;
      })
      .join('');
  }

  (window as any).__syncStageWatermarks = syncStageWatermarks;

  (window as any).__applyWatermarkLayer = async (layer: AppliedWatermarkLayer) => {
    if (!layer || !layer.imageKey || !layer.dataUrl) return;
    const key = layer.imageKey;
    A[key] = layer.dataUrl;
    (window.EDIT = window.EDIT || {})[key] = layer.dataUrl;

    const existingList: AppliedWatermarkLayer[] = (window as any).__WATERMARK_LAYERS || [];
    const im = await imgOf(layer.dataUrl);
    const bmp = im ? await createImageBitmap(im).catch(() => null) : null;
    const enrichedLayer = { ...layer, _img: im, _bmp: bmp };
    const idx = existingList.findIndex((w) => w.imageKey === key);
    if (idx >= 0) {
      existingList[idx] = enrichedLayer;
    } else {
      existingList.push(enrichedLayer);
    }
    (window as any).__WATERMARK_LAYERS = existingList;

    if (window.SV && bmp) {
      window.SV.bm[key] = bmp;
    }

    const qVal = ($('#q') as HTMLInputElement)?.value || '';
    renderAssetCards(qVal);

    const infoSpans = $$('#info span');
    for (const sp of infoSpans) {
      if (sp.textContent && sp.textContent.startsWith('Image Count:')) {
        sp.textContent = `Image Count: ${Object.keys(A).length}`;
      }
    }

    syncStageWatermarks();
    toast(`Watermark "${key}" added as top layer`);
  };

  (window as any).__clearWatermarkLayers = () => {
    const layers: AppliedWatermarkLayer[] = (window as any).__WATERMARK_LAYERS || [];
    for (const ly of layers) {
      delete A[ly.imageKey];
      if (window.EDIT) delete window.EDIT[ly.imageKey];
      if (window.SV?.bm) delete window.SV.bm[ly.imageKey];
    }
    (window as any).__WATERMARK_LAYERS = [];
    syncStageWatermarks();
    const qVal = ($('#q') as HTMLInputElement)?.value || '';
    renderAssetCards(qVal);
    toast('Watermark removed');
  };

  const qInput = $('#q') as HTMLInputElement | null;
  if (qInput) {
    qInput.oninput = (e: any) => {
      renderAssetCards(e.target.value);
    };
  }
  let origPreChromaAssets: Record<string, string> = {};

  function syncVideoChromaPreview() {
    const v = document.getElementById('view');
    if (!v) return;
    const cfg: ChromaKeyConfig = (window as any).__chromaKey;
    const existingCv = document.getElementById('chromaLiveCanvas') as HTMLCanvasElement | null;

    if (!S || !S.vid || S.meta || !cfg || !cfg.enabled) {
      if (existingCv) existingCv.remove();
      if (S && S.vid && !S.meta) {
        S.vid.style.cssText = '';
        syncPreviewSize(S.w, S.h);
      }
      return;
    }

    const m = S.vid as HTMLVideoElement;
    const [cw, ch] = getHiResCanvasDims(S.w || 360, S.h || 360);

    let cv = existingCv;
    if (!cv || !cv.isConnected) {
      cv = mk(cw, ch);
      cv.id = 'chromaLiveCanvas';
      cv.style.background = 'transparent';
      v.appendChild(cv);
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      const activeSource = S;
      (function loopVideoChroma() {
        if (activeSource !== S || !cv || !cv.isConnected || !(window as any).__chromaKey?.enabled) return;
        if (!window.__busy && m.readyState >= 2 && ctx) {
          ctx.clearRect(0, 0, cv.width, cv.height);
          ctx.drawImage(m, 0, 0, cv.width, cv.height);
          applyChromaKeyToContext(ctx, cv.width, cv.height, (window as any).__chromaKey);
        }
        requestAnimationFrame(loopVideoChroma);
      })();
    } else {
      cv.width = cw;
      cv.height = ch;
    }

    m.style.cssText =
      'position:absolute;width:2px;height:2px;opacity:0.001;pointer-events:none;left:0;top:0;z-index:-1';
    syncPreviewSize(S.w, S.h);
  }

  (window as any).__applyChromaKeyToStageAndAssets = async (cfg: ChromaKeyConfig) => {
    (window as any).__chromaKey = cfg || INITIAL_CHROMA_KEY;

    // 1. Handle SVGA / Lottie Image Assets (A[k])
    const assetKeys = Object.keys(A);
    if (assetKeys.length > 0) {
      if (cfg && cfg.enabled && cfg.applyToLayers !== false) {
        // Backup pristine assets first
        for (const k of assetKeys) {
          if (!origPreChromaAssets[k] && A[k]) {
            origPreChromaAssets[k] = A[k];
          }
        }
        let processed = 0;
        for (const k of assetKeys) {
          const baseSrc = origPreChromaAssets[k] || A[k];
          if (!baseSrc) continue;
          const im = await imgOf(baseSrc);
          if (!im) continue;
          const W = Math.max(1, im.naturalWidth || 1);
          const H = Math.max(1, im.naturalHeight || 1);
          const c = mk(W, H);
          const ctx = c.getContext('2d', { willReadFrequently: true });
          ctx.clearRect(0, 0, W, H);
          ctx.drawImage(im, 0, 0, W, H);
          applyChromaKeyToContext(ctx, W, H, cfg);
          const keyedUrl = c.toDataURL('image/png');
          A[k] = keyedUrl;
          await applyEdit(keyedUrl, k);
          if ((window as any).__lottieData?.assets) {
            ((window as any).__lottieData.assets as any[]).forEach((asset, idx) => {
              const ak = String(asset?.id || `img_${idx}`);
              if (ak === k) asset.p = keyedUrl;
            });
          }
          processed++;
        }
        const qVal = ($('#q') as HTMLInputElement)?.value || '';
        renderAssetCards(qVal);
        if (processed > 0) {
          toast(`✨ تمت إزالة الكروما الخضراء من ${processed} طبقة بنجاح`);
        }
      } else if (Object.keys(origPreChromaAssets).length > 0) {
        // Restore original assets when Chroma Key is turned off
        for (const [k, origUrl] of Object.entries(origPreChromaAssets)) {
          if (!A[k]) continue;
          A[k] = origUrl;
          if (window.EDIT) delete window.EDIT[k];
          await applyEdit(origUrl, k);
          if ((window as any).__lottieData?.assets) {
            ((window as any).__lottieData.assets as any[]).forEach((asset, idx) => {
              const ak = String(asset?.id || `img_${idx}`);
              if (ak === k) asset.p = origUrl;
            });
          }
        }
        origPreChromaAssets = {};
        const qVal = ($('#q') as HTMLInputElement)?.value || '';
        renderAssetCards(qVal);
        toast('↺ تمت استعادة ألوان الطبقات الأصلية');
      }

      // Reload Lottie player if active
      if (anim && (window as any).__lottieData && typeof lottie !== 'undefined') {
        try {
          const v = $('#view');
          const container = v?.querySelector('div');
          if (container) {
            anim.destroy();
            container.innerHTML = '';
            anim = lottie.loadAnimation({
              container,
              renderer: 'canvas',
              loop: true,
              autoplay: !(S && S.paused),
              animationData: (window as any).__lottieData,
            });
            syncPreviewSize(S?.w, S?.h);
          }
        } catch (_) {}
      }
    } else if (cfg && cfg.enabled) {
      toast('✨ تم تفعيل إزالة الكروما الخضراء على العرض والتصدير');
    } else {
      toast('↺ تم إيقاف إزالة الكروما الخضراء');
    }

    // 2. Sync live video / animated image stage preview
    syncVideoChromaPreview();
    if (S && typeof S._repaintCurrent === 'function') {
      S._repaintCurrent();
    }
  };

  function prep(f) {
    cur = f;
    (window as any).__currentMotionFile = f;
    userAdjustedZoom = false;
    previewZoom = 1;
    origPreChromaAssets = {};
    if (window.SVP) {
      try {
        window.SVP.pauseAnimation?.();
        window.SVP.clear?.();
      } catch (_) {}
      window.SVP = null;
    }
    if (player) {
      try {
        player.pauseAnimation?.();
        player.clear?.();
      } catch (_) {}
      player = null;
    }
    S = null;
    anim = null;
    window.VI = null;
    (window as any).__lottieData = null;
    (window as any).__WATERMARK_LAYERS = [];
    window.EDIT = {};
    const vapMasksEl = document.getElementById('vapDynamicMasksPanel');
    if (vapMasksEl) {
      vapMasksEl.style.display = 'none';
      vapMasksEl.innerHTML = '';
    }
    show('convert');
    const v = $('#view');
    v.innerHTML = '';
    v.style.border = '0';
    v.classList.add('loaded');
    const curB = (window as any).__getGiftBg?.();
    if (curB) (window as any).__applyGiftBg?.(curB.val, curB.type === 'image');
    (window as any).__reapplyStageEdgeFeather?.();
    $('#assets').innerHTML = '';
    $('#pp').textContent = 'Pause';
    return v;
  }
  function fin() {
    $('#w').value = S.w;
    $('#h').value = S.h;
    $('#fps').value = Math.round(S.fps) || 15;
    if (!userAdjustedZoom && S && S.w > 0 && S.h > 0) {
      previewZoom = getAutoDefaultZoom(S.w, S.h);
    }
    syncPreviewSize(S.w, S.h);
  }
  function lot(data, f, v, fmt) {
    (window as any).__lottieData = data;
    const s = Math.min(2, 400 / Math.max(data.w, data.h)),
      d = document.createElement('div');
    d.style.cssText = 'width:' + data.w * s + 'px;height:' + data.h * s + 'px';
    v.appendChild(d);
    anim = lottie.loadAnimation({
      container: d,
      renderer: 'canvas',
      loop: true,
      autoplay: true,
      animationData: data,
    });
    S = {
      w: data.w,
      h: data.h,
      fps: data.fr,
      n: Math.max(1, Math.round(data.op - data.ip)),
      set: async (i) => {
        anim.goToAndStop(i, true);
        await sleep(0);
      },
      draw: (c, W, H) => c.drawImage(d.querySelector('canvas'), 0, 0, W, H),
      stop: () => anim.pause(),
      go: () => anim.play(),
    };
    info({
      Format: fmt,
      Resolution: data.w + ' × ' + data.h,
      'Frame Rate': data.fr + ' FPS',
      Duration: (S.n / data.fr).toFixed(2) + ' S',
      'File Size': kb(f.size),
      'File Name': f.name,
    });
    fin();
    buildAssets();
  }
  async function openDot(f) {
    const v = prep(f);
    try {
      await LIBS.all;
      const z = await JSZip.loadAsync(f),
        man = JSON.parse(await z.file('manifest.json').async('string')),
        id = man.animations[0].id;
      const p = z.file('animations/' + id + '.json') || z.file('a/' + id + '.json'),
        data = JSON.parse(await p.async('string'));
      for (const a of data.assets || []) {
        if (a.p && !a.e) {
          const n = a.p,
            fl = z.file('images/' + n) || z.file('i/' + n);
          if (fl) {
            const x = n.split('.').pop().toLowerCase();
            a.p = 'data:image/' + (x === 'jpg' ? 'jpeg' : x) + ';base64,' + (await fl.async('base64'));
            a.u = '';
            a.e = 1;
          }
        }
      }
      lot(data, f, v, 'DotLottie');
    } catch (e) {
      v.textContent = 'Could not open this DotLottie: ' + e.message;
    }
  }
  async function openSeq(f) {
    const v = prep(f);
    try {
      const z = await JSZip.loadAsync(f),
        allFiles = Object.keys(z.files).filter((n) => !/__MACOSX/.test(n)),
        vidEntry = allFiles.find((n) => /\.(mp4|mov|webm|vap|yyeva)$/i.test(n)),
        names = allFiles
          .filter((n) => /\.(png|jpe?g|webp)$/i.test(n))
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      if (vidEntry && (!names.length || allFiles.some((n) => /\.json$/i.test(n)))) {
        const vb = await z.file(vidEntry).async('blob');
        const extMatch = vidEntry.split('.').pop().toLowerCase();
        const vf = new File([vb], f.name.replace(/\.zip$/i, '.' + (extMatch || 'vap')), {
          type: 'video/mp4',
        });
        for (const jn of allFiles.filter((n) => /\.json$/i.test(n))) {
          try {
            const parsed = JSON.parse(await z.file(jn).async('string'));
            const zm = metaFromAnyObject(parsed);
            if (zm) {
              vf.__zipMeta = zm;
              break;
            }
          } catch (_) {}
        }
        return load(vf);
      }
      if (!names.length) throw Error('No images found in this ZIP');
      const bm = [];
      for (const n of names) bm.push(await createImageBitmap(await z.file(n).async('blob')));
      const c = mk(bm[0].width, bm[0].height),
        x = c.getContext('2d');
      v.appendChild(c);
      let i = 0,
        run = true;
      setInterval(() => {
        if (!run || !document.body.contains(c)) return;
        x.clearRect(0, 0, c.width, c.height);
        x.drawImage(bm[i], 0, 0);
        i = (i + 1) % bm.length;
      }, 40);
      S = {
        w: c.width,
        h: c.height,
        fps: 25,
        n: bm.length,
        set: async (k) => {
          i = k;
        },
        draw: (cx, W, H) => cx.drawImage(bm[i], 0, 0, W, H),
        stop: () => (run = false),
        go: () => (run = true),
      };
      info({
        Format: 'PNG Sequence ZIP',
        Resolution: S.w + ' × ' + S.h,
        Frames: bm.length,
        'File Size': kb(f.size),
        'File Name': f.name,
      });
      fin();
    } catch (e) {
      v.textContent = 'Could not open this ZIP: ' + e.message;
    }
  }
  async function openSvg(f) {
    const v = prep(f);
    try {
      const t = await f.text(),
        d = document.createElement('div');
      d.innerHTML = t;
      const sv = d.querySelector('svg');
      if (!sv) throw Error('Not an SVG file');
      const vb = (sv.getAttribute('viewBox') || '0 0 400 400').split(/[ ,]+/).map(Number),
        w = Math.round(parseFloat(sv.getAttribute('width')) || vb[2]),
        h = Math.round(parseFloat(sv.getAttribute('height')) || vb[3]);
      sv.setAttribute('width', Math.min(400, w));
      sv.setAttribute('height', (Math.min(400, w) * h) / w);
      v.appendChild(d);
      let bmp = null;
      const fps = 30;
      S = {
        w,
        h,
        fps,
        n: 90,
        set: async (i) => {
          sv.pauseAnimations();
          sv.setCurrentTime(i / fps);
          const c = sv.cloneNode(true);
          c.setAttribute('width', w);
          c.setAttribute('height', h);
          if (!c.getAttribute('xmlns')) c.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
          bmp = await imgOf(
            'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(c))
          );
        },
        draw: (c, W, H) => bmp && c.drawImage(bmp, 0, 0, W, H),
        stop: () => sv.pauseAnimations(),
        go: () => sv.unpauseAnimations(),
      };
      info({
        Format: 'SVG / SMIL',
        Resolution: w + ' × ' + h,
        'File Size': kb(f.size),
        'File Name': f.name,
      });
      fin();
    } catch (e) {
      v.textContent = 'Could not open this SVG: ' + e.message;
    }
  }
  async function openPag(f) {
    const v = prep(f);
    try {
      for (const k in A) delete A[k];
      const decoded = await decodePagWithLibpagFallback(f);
      const m = decoded.svgaMovie;
      const bm = {};
      (window as any).__svgaRawImages = m.im;
      (window as any).M = m;

      for (const k in m.im) {
        const d = m.im[k];
        if (!d || !d.length) continue;
        const mt =
          d[0] === 0x89 && d[1] === 0x50
            ? 'image/png'
            : d[0] === 0xff && d[1] === 0xd8
              ? 'image/jpeg'
              : d[0] === 0x52 && d.length >= 12 && d[8] === 0x57 && d[9] === 0x45 && d[10] === 0x42 && d[11] === 0x50
                ? 'image/webp'
                : 'image/png';
        try {
          const b = await createImageBitmap(new Blob([d], { type: mt }));
          bm[k] = b;
          if (mt === 'image/png') {
            A[k] = 'data:image/png;base64,' + base64(d);
          } else {
            const t = mk(b.width, b.height);
            t.getContext('2d').drawImage(b, 0, 0);
            A[k] = t.toDataURL('image/png');
          }
        } catch (err) {
          A[k] = `data:${mt};base64,` + base64(d);
        }
      }

      if (decoded.audioBytes && decoded.audioBytes.byteLength > 0 && window.AU) {
        try {
          const actx = new AudioContext();
          const abuf = await actx.decodeAudioData(decoded.audioBytes.slice().buffer);
          await actx.close();
          window.AU.orig = {
            name: f.name.replace(/\.[^.]+$/, '') + '.mp3',
            bytes: decoded.audioBytes,
            buf: abuf,
            mp3: true,
          };
          if (window.PA) window.PA.restart();
        } catch (_) {}
      }

      window.SV = { m, bm };
      if (!m.n) m.n = Math.max(...m.sp.map((s) => s.fr.length), 1);

      const [hiW, hiH] = getHiResCanvasDims(m.w || 500, m.h || 500),
        cv = mk(hiW, hiH),
        cx = cv.getContext('2d');
      if (cx) {
        cx.imageSmoothingEnabled = true;
        cx.imageSmoothingQuality = 'high';
      }
      v.appendChild(cv);

      let i = 0,
        run = true,
        ix = 0;
      const tk = setInterval(() => {
        if (!document.body.contains(cv)) return clearInterval(tk);
        if (!run) return;
        (window as any).__svgaCurrentFrame = i;
        svPaint(cx, cv.width, cv.height, i);
        if (window.PA) window.PA.sync(i / Math.max(1, m.fps));
        i = (i + 1) % Math.max(1, m.n);
      }, 1000 / Math.max(1, m.fps));

      S = {
        w: Math.round(m.w || 500),
        h: Math.round(m.h || 500),
        fps: m.fps || 30,
        n: Math.max(1, m.n || 1),
        set: async (k) => {
          ix = Math.max(0, Math.min(m.n - 1, k));
          i = ix;
          svPaint(cx, cv.width, cv.height, ix);
        },
        draw: (c, W, H) => svPaint(c, W, H, ix),
        stop: () => (run = false),
        go: () => (run = true),
      };

      info({
        Format: 'PAG (Tencent Portable Animated Graphics)',
        Resolution: S.w + ' × ' + S.h,
        'Frame Rate': S.fps + ' FPS',
        Duration: (S.n / S.fps).toFixed(2) + ' S',
        Frames: S.n,
        'Image Count': Object.keys(A).length,
        'Decomposed Layers': (m.sp || []).length,
        'File Size': kb(f.size),
        'File Name': f.name,
      });
      fin();
      renderAssetCards(($('#q') as HTMLInputElement)?.value || '');
    } catch (e) {
      window.SV = null;
      v.textContent = 'Could not decode this PAG file: ' + (e.message || e);
    }
  }
  const _load = load;
  load = async function (f) {
    const ext = f.name.split('.').pop().toLowerCase();
    if (ext === 'lottie') return openDot(f);
    if (ext === 'pag') return openPag(f);
    if (ext === 'svg') return openSvg(f);
    if (ext === 'zip') return openSeq(f);
    await LIBS.all;
    if (window.SVGA && !SVGA.__p) {
      const o = SVGA.Player.prototype.setVideoItem;
      SVGA.Player.prototype.setVideoItem = function (vi) {
        window.VI = vi;
        return o.call(this, vi);
      };
      SVGA.__p = 1;
    }
    window.VI = null;
    await _load(f);
    buildAssets();
  };

  /* Block 5: Native Engines (SVGA 2.x, ZIP, APNG) */
  const TD = new TextDecoder(),
    inf = async (d, t) => {
      if (pako?.inflate) {
        try {
          return t === 'deflate-raw' && pako.inflateRaw ? pako.inflateRaw(d) : pako.inflate(d);
        } catch (_) {
          try {
            if (pako.inflateRaw) return pako.inflateRaw(d);
          } catch (_) {}
        }
      }
      return new Uint8Array(
        await new Response(new Blob([d]).stream().pipeThrough(new DecompressionStream(t))).arrayBuffer()
      );
    },
    inf2 = async (d) => {
      if (pako?.deflate) {
        try {
          return pako.deflate(d, { level: 9 });
        } catch (_) {}
      }
      return new Uint8Array(
        await new Response(new Blob([d]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer()
      );
    };
  class ZS {
    constructor() {
      this.files = {};
      this.q = [];
    }
    static async loadAsync(f) {
      const buf = await f.arrayBuffer(),
        v = new DataView(buf),
        u = new Uint8Array(buf);
      let e = u.length - 22;
      while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
      if (e < 0) throw Error('Not a ZIP file');
      const n = v.getUint16(e + 10, true);
      let p = v.getUint32(e + 16, true);
      const z = new ZS();
      for (let i = 0; i < n; i++) {
        const me = v.getUint16(p + 10, true),
          cs = v.getUint32(p + 20, true),
          nl = v.getUint16(p + 28, true),
          el = v.getUint16(p + 30, true),
          cl = v.getUint16(p + 32, true),
          off = v.getUint32(p + 42, true),
          name = TD.decode(u.subarray(p + 46, p + 46 + nl));
        p += 46 + nl + el + cl;
        z.files[name] = {
          name,
          async: async (t) => {
            const lo = off + 30 + v.getUint16(off + 26, true) + v.getUint16(off + 28, true);
            let d = u.subarray(lo, lo + cs);
            if (me === 8) d = await inf(d, 'deflate-raw');
            if (t === 'string') return TD.decode(d);
            if (t === 'blob') return new Blob([d]);
            if (t === 'base64') return base64(d);
            return d;
          },
        };
      }
      return z;
    }
    file(n, d) {
      if (d === undefined) return this.files[n] || null;
      this.q.push([n, d]);
    }
    async generateAsync() {
      const parts = [],
        cd = [];
      let off = 0;
      for (const [name, data] of this.q) {
        const d = new Uint8Array(data instanceof Blob ? await data.arrayBuffer() : data),
          nb = new TextEncoder().encode(name),
          c = crc32(d);
        const h = new DataView(new ArrayBuffer(30));
        h.setUint32(0, 0x04034b50, true);
        h.setUint16(4, 20, true);
        h.setUint32(14, c, true);
        h.setUint32(18, d.length, true);
        h.setUint32(22, d.length, true);
        h.setUint16(26, nb.length, true);
        parts.push(h.buffer, nb, d);
        const g = new DataView(new ArrayBuffer(46));
        g.setUint32(0, 0x02014b50, true);
        g.setUint16(4, 20, true);
        g.setUint16(6, 20, true);
        g.setUint32(16, c, true);
        g.setUint32(20, d.length, true);
        g.setUint32(24, d.length, true);
        g.setUint16(28, nb.length, true);
        g.setUint32(42, off, true);
        cd.push(g.buffer, nb);
        off += 30 + nb.length + d.length;
      }
      let cs = 0;
      for (const x of cd) cs += x.byteLength;
      const e = new DataView(new ArrayBuffer(22));
      e.setUint32(0, 0x06054b50, true);
      e.setUint16(8, this.q.length, true);
      e.setUint16(10, this.q.length, true);
      e.setUint32(12, cs, true);
      e.setUint32(16, off, true);
      return new Blob([...parts, ...cd, e.buffer], { type: 'application/zip' });
    }
  }
  window.JSZip = ZS;
  async function apngEnc(fr, W, H, fps) {
    const out = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])];
    let seq = 0;
    const ck = (t, d) => {
      const b = new Uint8Array(12 + d.length),
        v = new DataView(b.buffer);
      v.setUint32(0, d.length);
      for (let i = 0; i < 4; i++) b[4 + i] = t.charCodeAt(i);
      b.set(d, 8);
      v.setUint32(8 + d.length, crc32(b.subarray(4, 8 + d.length)));
      out.push(b);
    };
    const ih = new Uint8Array(13),
      iv = new DataView(ih.buffer);
    iv.setUint32(0, W);
    iv.setUint32(4, H);
    ih[8] = 8;
    ih[9] = 6;
    ck('IHDR', ih);
    const ac = new Uint8Array(8);
    new DataView(ac.buffer).setUint32(0, fr.length);
    ck('acTL', ac);
    for (let i = 0; i < fr.length; i++) {
      const f = new Uint8Array(26),
        v = new DataView(f.buffer);
      v.setUint32(0, seq++);
      v.setUint32(4, W);
      v.setUint32(8, H);
      v.setUint16(20, Math.round(1000 / fps));
      v.setUint16(22, 1000);
      f[24] = 1;
      ck('fcTL', f);
      const rw = W * 4 + 1,
        raw = new Uint8Array(rw * H);
      for (let y = 0; y < H; y++) raw.set(fr[i].subarray(y * W * 4, (y + 1) * W * 4), y * rw + 1);
      const z = await inf2(raw);
      if (i === 0) ck('IDAT', z);
      else {
        const d = new Uint8Array(4 + z.length);
        new DataView(d.buffer).setUint32(0, seq++);
        d.set(z, 4);
        ck('fdAT', d);
      }
    }
    ck('IEND', new Uint8Array(0));
    return new Blob(out, { type: 'image/png' });
  }
  window.SV = null;
  function svPaint(c, W, H, i) {
    const m = window.SV.m;
    c.clearRect(0, 0, W, H);
    c.save();
    c.scale(W / m.w, H / m.h);
    for (const s of m.sp) {
      const f = s.fr[i],
        b = window.SV.bm[s.key];
      if (!f || !b || f.a <= 0.001) continue;
      c.globalAlpha = Math.min(1, f.a);
      c.save();
      c.transform(...f.t);
      if (f.clipPath) {
        try {
          c.clip(new Path2D(f.clipPath), 'evenodd');
        } catch {}
      }
      c.drawImage(b, f.x, f.y, f.w || b.width, f.h || b.height);
      c.restore();
    }
    c.restore();
    c.globalAlpha = 1;
  }
  async function openSvga(f) {
    const v = prep(f);
    try {
      const raw = new Uint8Array(await f.arrayBuffer());
      if (raw[0] === 0x50 && raw[1] === 0x4b)
        throw Error('This is an SVGA 1.x file (zip). Only SVGA 2.x is supported');
      const m = parseMovie(await inf(raw, 'deflate'));
      if (!m.w || !m.h) throw Error('Invalid SVGA file');
      const bm = {};
      (window as any).__svgaRawImages = m.im;
      for (const k in m.im) {
        const d = m.im[k],
          mt =
            d[0] === 0x89 && d[1] === 0x50
              ? 'image/png'
              : d[0] === 0xff && d[1] === 0xd8
                ? 'image/jpeg'
                : d[0] === 0x52 && d.length >= 12 && d[8] === 0x57 && d[9] === 0x45 && d[10] === 0x42 && d[11] === 0x50
                  ? 'image/webp'
                  : d[0] === 0x47 && d[1] === 0x49 && d[2] === 0x46
                    ? 'image/gif'
                    : '';
        if (!mt) continue;
        try {
          const b = await createImageBitmap(new Blob([d], { type: mt }));
          bm[k] = b;
          if (mt === 'image/png') {
            A[k] = 'data:image/png;base64,' + base64(d);
          } else {
            const t = mk(b.width, b.height);
            t.getContext('2d').drawImage(b, 0, 0);
            A[k] = t.toDataURL('image/png');
          }
        } catch (e) {}
      }
      window.SV = { m, bm };
      if (!m.n) m.n = Math.max(...m.sp.map((s) => s.fr.length), 1);
      const [hiW, hiH] = getHiResCanvasDims(m.w, m.h),
        cv = mk(hiW, hiH),
        cx = cv.getContext('2d');
      if (cx) {
        cx.imageSmoothingEnabled = true;
        cx.imageSmoothingQuality = 'high';
      }
      v.appendChild(cv);
      let i = 0,
        run = true,
        ix = 0;
      const tk = setInterval(() => {
        if (!document.body.contains(cv)) return clearInterval(tk);
        if (!run) return;
        (window as any).__svgaCurrentFrame = i;
        svPaint(cx, cv.width, cv.height, i);
        if (window.PA) window.PA.sync(i / m.fps);
        i = (i + 1) % m.n;
      }, 1000 / m.fps);
      S = {
        w: Math.round(m.w),
        h: Math.round(m.h),
        fps: m.fps,
        n: m.n,
        set: async (k) => {
          ix = k;
        },
        draw: (c, W, H) => svPaint(c, W, H, ix),
        stop: () => (run = false),
        go: () => (run = true),
      };
      info({
        Format: 'SVGA',
        Version: '2.0',
        Resolution: S.w + ' × ' + S.h,
        'Frame Rate': m.fps + ' FPS',
        Duration: (m.n / m.fps).toFixed(2) + ' S',
        'File Size': kb(f.size),
        'Image Count': Object.keys(A).length,
        'File Name': f.name,
      });
      fin();
      renderAssetCards(($('#q') as HTMLInputElement)?.value || '');
      await svgaUpgrade(f, v, cv);
    } catch (e) {
      window.SV = null;
      v.textContent = 'Could not open this SVGA: ' + (e.message || e);
    }
  }
  const _load2 = load;
  load = async function (f) {
    for (const k in A) delete A[k];
    if (f.name.toLowerCase().endsWith('.svga')) return openSvga(f);
    window.SV = null;
    return _load2(f);
  };

  /* Block 6: VAP / YYEVA */
  LIBS.defs.SVGA = [
    'https://cdn.jsdelivr.net/npm/svgaplayerweb@2.3.2/build/svga.min.js',
    'https://unpkg.com/svgaplayerweb@2.3.2/build/svga.min.js',
    'https://cdn.jsdelivr.net/npm/svgaplayerweb@2.3.1/build/svga.min.js',
  ];
  let readMeta = baseReadMeta;
  let _vapScratchCanvas: HTMLCanvasElement | null = null;
  let _vapScratchCtx: CanvasRenderingContext2D | null = null;
  let _vapSlotLayerCanvas: HTMLCanvasElement | null = null;
  let _vapSlotLayerCtx: CanvasRenderingContext2D | null = null;
  let _vapSlotMaskCanvas: HTMLCanvasElement | null = null;
  let _vapSlotMaskCtx: CanvasRenderingContext2D | null = null;

  function vapDraw(c, W, H, m, M) {
    const [cx, cy, cw, ch] = M.c,
      [ax, ay, aw, ah] = M.a;
    if (!_vapScratchCanvas || _vapScratchCanvas.width !== cw || _vapScratchCanvas.height !== ch) {
      _vapScratchCanvas = mk(cw, ch);
      _vapScratchCtx = _vapScratchCanvas.getContext('2d', { willReadFrequently: true });
    }
    const t = _vapScratchCanvas,
      x = _vapScratchCtx!;
    x.clearRect(0, 0, cw, ch);
    x.drawImage(m, cx, cy, cw, ch, 0, 0, cw, ch);
    const C = x.getImageData(0, 0, cw, ch);
    x.clearRect(0, 0, cw, ch);
    x.drawImage(m, ax, ay, aw, ah, 0, 0, cw, ch);
    const A_alpha = x.getImageData(0, 0, cw, ch),
      d = C.data;
    for (let i = 0; i < d.length; i += 4) {
      const a = A_alpha.data[i];
      d[i + 3] = a;
      if (a > 0 && a < 255) {
        const k = 255 / a;
        d[i] = Math.min(255, d[i] * k);
        d[i + 1] = Math.min(255, d[i + 1] * k);
        d[i + 2] = Math.min(255, d[i + 2] * k);
      }
    }
    if ((window as any).__chromaKey?.enabled) {
      applyChromaKeyToRgbaBuffer(d, cw, ch, (window as any).__chromaKey);
    }
    x.putImageData(C, 0, 0);

    // Render VAP / YYEVA Dynamic Mask Slots (Image & Text/Name masks)
    const slots = M.dynamicSlots;
    if (Array.isArray(slots) && slots.length > 0) {
      const fps = Math.max(1, M.fps || S?.fps || 30);
      const totalFrames = Math.max(1, M.frames || S?.n || 1);
      const curTime = Number(m?.currentTime) || 0;
      const curFrameIdx = Math.max(0, Math.min(totalFrames - 1, Math.floor((curTime + 0.0005) * fps)));
      const placements = resolveDynamicFramePlacements(M, curFrameIdx);
      const replacements = S?._vapSlotReplacements || {};
      const showGuides = Boolean((window as any).__vapShowMaskGuides);

      if (placements.length > 0) {
        for (const pl of placements) {
          const slot = slots.find((s: any) => s.srcId === pl.srcId);
          if (!slot) continue;
          const [dx, dy, dw, dh] = pl.frame;
          const [mx, my, mw, mh] = pl.mFrame;
          if (dw <= 0 || dh <= 0) continue;

          const rep = replacements[slot.srcId];
          if (rep && rep.active && !rep.hidden && rep.source) {
            if (!_vapSlotLayerCanvas || _vapSlotLayerCanvas.width !== dw || _vapSlotLayerCanvas.height !== dh) {
              _vapSlotLayerCanvas = mk(dw, dh);
              _vapSlotLayerCtx = _vapSlotLayerCanvas.getContext('2d', { willReadFrequently: true });
            }
            const lx = _vapSlotLayerCtx!;
            lx.clearRect(0, 0, dw, dh);

            const srcEl = rep.source;
            const srcW = Number(srcEl.naturalWidth || srcEl.width || dw) || dw;
            const srcH = Number(srcEl.naturalHeight || srcEl.height || dh) || dh;
            const fitMode = rep.fitMode || slot.fitType || 'fitXY';
            const scale = Number(rep.scale) > 0 ? Number(rep.scale) : 1;
            const offX = Number(rep.offsetX) || 0;
            const offY = Number(rep.offsetY) || 0;
            const rect = computeSlotFitDrawRect(srcW, srcH, dw, dh, fitMode, scale, offX, offY);
            lx.imageSmoothingEnabled = true;
            lx.imageSmoothingQuality = 'high';
            lx.drawImage(srcEl, rect.dx, rect.dy, rect.dw, rect.dh);

            const useMask = rep.useMask !== false;
            if (useMask && mw > 0 && mh > 0) {
              if (!_vapSlotMaskCanvas || _vapSlotMaskCanvas.width !== dw || _vapSlotMaskCanvas.height !== dh) {
                _vapSlotMaskCanvas = mk(dw, dh);
                _vapSlotMaskCtx = _vapSlotMaskCanvas.getContext('2d', { willReadFrequently: true });
              }
              const mxCtx = _vapSlotMaskCtx!;
              mxCtx.clearRect(0, 0, dw, dh);
              mxCtx.drawImage(m, mx, my, mw, mh, 0, 0, dw, dh);
              const layerData = lx.getImageData(0, 0, dw, dh);
              const maskData = mxCtx.getImageData(0, 0, dw, dh);
              applyLuminanceMaskToRgba(layerData.data, maskData.data, dw, dh);
              lx.putImageData(layerData, 0, 0);
            }

            x.drawImage(_vapSlotLayerCanvas, dx, dy, dw, dh);
          } else if (showGuides) {
            // Render visual mask guide overlay when mask guides are toggled on
            if (mw > 0 && mh > 0) {
              if (!_vapSlotMaskCanvas || _vapSlotMaskCanvas.width !== dw || _vapSlotMaskCanvas.height !== dh) {
                _vapSlotMaskCanvas = mk(dw, dh);
                _vapSlotMaskCtx = _vapSlotMaskCanvas.getContext('2d', { willReadFrequently: true });
              }
              const mxCtx = _vapSlotMaskCtx!;
              mxCtx.clearRect(0, 0, dw, dh);
              mxCtx.drawImage(m, mx, my, mw, mh, 0, 0, dw, dh);
              const maskData = mxCtx.getImageData(0, 0, dw, dh);
              const tint: [number, number, number] = slot.isTextSlot ? [56, 189, 248] : [168, 85, 247];
              const previewRgba = extractMaskPreviewRgba(maskData.data, dw, dh, tint);
              for (let p = 3; p < previewRgba.length; p += 4) {
                previewRgba[p] = Math.round(previewRgba[p] * 0.45);
              }
              mxCtx.putImageData(new ImageData(previewRgba, dw, dh), 0, 0);
              x.drawImage(_vapSlotMaskCanvas, dx, dy, dw, dh);
            }
          }

          if (showGuides) {
            x.save();
            x.strokeStyle = slot.isTextSlot ? '#38bdf8' : '#c084fc';
            x.lineWidth = Math.max(2, Math.round(cw / 280));
            x.setLineDash([6, 4]);
            x.strokeRect(dx + 1, dy + 1, Math.max(2, dw - 2), Math.max(2, dh - 2));
            x.setLineDash([]);
            const label = `${slot.srcTag} (${slot.srcType})`;
            const fontSize = Math.max(11, Math.min(18, Math.round(cw / 42)));
            x.font = `bold ${fontSize}px system-ui, sans-serif`;
            const tw = x.measureText(label).width + 10;
            const th = fontSize + 6;
            const bx = Math.max(0, Math.min(cw - tw, dx));
            const by = Math.max(0, dy - th - 2);
            x.fillStyle = slot.isTextSlot ? 'rgba(2, 132, 199, 0.9)' : 'rgba(126, 34, 206, 0.9)';
            x.fillRect(bx, by, tw, th);
            x.fillStyle = '#fff';
            x.textBaseline = 'middle';
            x.fillText(label, bx + 5, by + th / 2);
            x.restore();
          }
        }
      }
    }

    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(t, 0, 0, W, H);
  }
  const _dv = drawVid;
  drawVid = function (c, W, H, m) {
    return S && S.meta ? vapDraw(c, W, H, m, S.meta) : _dv(c, W, H, m);
  };
  let vapDetect = async function (f) {
    const m = S && S.vid;
    if (!m) return;
    let meta = null;
    try {
      meta = readMeta(new Uint8Array(await f.arrayBuffer()));
    } catch (e) {}
    if (!meta) return;
    S.meta = meta;
    S.w = meta.c[2];
    S.h = meta.c[3];
    if (meta.fps) S.fps = meta.fps;
    S.n = Math.max(1, Math.floor(m.duration * S.fps));
    S.set = async (i) => {
      const t = Math.min((i + 0.5) / S.fps, m.duration - 0.001);
      if (Math.abs(m.currentTime - t) < 0.001) return;
      await Promise.race([
        new Promise((r) => {
          m.onseeked = r;
          m.currentTime = t;
        }),
        sleep(800),
      ]);
    };
    const [hiW, hiH] = getHiResCanvasDims(S.w, S.h),
      cv = mk(hiW, hiH),
      x = cv.getContext('2d');
    cv.style.background = 'transparent';
    const bgMeta = (window as any).__getGiftBg?.();
    if (bgMeta) (window as any).__applyGiftBg?.(bgMeta.val, bgMeta.type === 'image');
    m.style.cssText =
      'position:absolute;width:2px;height:2px;opacity:0.001;pointer-events:none;left:0;top:0;z-index:-1';
    $('#view').appendChild(cv);
    (function lp() {
      if (!document.body.contains(cv)) return;
      if (!window.__busy && m.readyState >= 2) {
        x.clearRect(0, 0, cv.width, cv.height);
        vapDraw(x, cv.width, cv.height, m, meta);
      }
      requestAnimationFrame(lp);
    })();
    info({
      Format: meta.kind,
      Resolution: S.w + ' × ' + S.h,
      'Video Size': m.videoWidth + ' × ' + m.videoHeight,
      'Frame Rate': S.fps + ' FPS',
      Duration: m.duration.toFixed(2) + ' S',
      'File Size': kb(f.size),
      'File Name': f.name,
    });
    fin();
  };
  const _l5 = load;
  load = async function (f) {
    await _l5(f);
    if (/\.(mp4|mov|webm|vap|yyeva)$/i.test(f.name)) await vapDetect(f);
  };
  const box = (t, b) => {
    const o = new Uint8Array(8 + b.length);
    new DataView(o.buffer).setUint32(0, o.length);
    for (let i = 0; i < 4; i++) o[4 + i] = t.charCodeAt(i);
    o.set(b, 8);
    return o;
  };
  let afterFtyp = async function (blob, bx) {
    const u = new Uint8Array(await blob.arrayBuffer()),
      n = new DataView(u.buffer).getUint32(0);
    if (TD.decode(u.subarray(4, 8)) !== 'ftyp') throw Error('Browser did not produce a valid MP4');
    return new Blob([u.subarray(0, n), bx, u.subarray(n)], { type: 'video/mp4' });
  };
  let exportVY = async function (F) {
    if (!cur || !S) return toast('Upload a supported file first');
    const W0 = +$('#w').value || S.w,
      H0 = +$('#h').value || S.h,
      W = W0 + (W0 % 2),
      H = H0 + (H0 % 2),
      fps = Math.max(1, +$('#fps').value || 15),
      q = (+$('#qual').value || 100) / 100,
      base = cur.name.replace(/\.\w+$/, ''),
      nk = Math.max(1, Math.round((S.n * fps) / S.fps)),
      btn = $('#start');
    btn.disabled = true;
    S.stop();
    const Y = F === 'yyeva',
      aw = Y ? W : W / 2,
      ah = Y ? H : H / 2,
      VW = Y ? W * 2 : Math.ceil((W + 4 + aw) / 16) * 16,
      VH = Y ? H : Math.ceil(H / 16) * 16,
      aF = Y ? [W, 0, W, H] : [W + 4, 0, aw, ah],
      rF = [0, 0, W, H];
    try {
      const r = await record(VW, VH, fps, q, 'mp4', {
        size: [W, H],
        paint: (o, c, x) => {
          o.fillStyle = '#000';
          o.fillRect(0, 0, VW, VH);
          o.drawImage(c, 0, 0);
          const d = x.getImageData(0, 0, W, H),
            g = mk(W, H),
            gx = g.getContext('2d');
          for (let i = 0; i < d.data.length; i += 4) {
            d.data[i] = d.data[i + 1] = d.data[i + 2] = d.data[i + 3];
            d.data[i + 3] = 255;
          }
          gx.putImageData(d, 0, 0);
          o.imageSmoothingQuality = 'high';
          o.drawImage(g, aF[0], 0, aw, ah);
        },
      });
      const te = new TextEncoder(),
        js =
          F === 'vap'
            ? JSON.stringify({
                info: {
                  v: 2,
                  f: nk,
                  w: W,
                  h: H,
                  fps,
                  videoW: VW,
                  videoH: VH,
                  aFrame: aF,
                  rgbFrame: rF,
                  isVapx: 0,
                  orien: 0,
                },
              })
            : JSON.stringify({
                descript: {
                  width: W,
                  height: H,
                  isEffect: 0,
                  version: 1,
                  rgbFrame: rF,
                  alphaFrame: aF,
                  totalFrame: nk,
                  fps,
                },
              });
      await dl(
        F === 'vap'
          ? await afterFtyp(r.blob, box('vapc', te.encode(js)))
          : new Blob([r.blob, box('yyev', te.encode(js))], { type: 'video/mp4' }),
        base + '_' + F + '.mp4'
      );
    } catch (e) {
      toast(e.message || 'Export failed');
    }
    btn.disabled = false;
    if (!S.paused) S.go();
  };
  const _st = $('#start').onclick;
  $('#start').onclick = () => {
    const F = $('#fmt').value;
    return F === 'vap' || F === 'yyeva' ? exportVY(F) : _st();
  };

  /* Block 7: Exporters: Lottie, DotLottie, WebP, MOV, SVGA 2.0, PAG */
  (() => {
    const le = (n, b) => Array.from({ length: b }, (_, i) => (n >>> (8 * i)) & 255),
      cat = (a) => {
        const o = new Uint8Array(a.reduce((t, x) => t + x.length, 0));
        let p = 0;
        for (const x of a) {
          o.set(x, p);
          p += x.length;
        }
        return o;
      },
      T4 = (t) => Uint8Array.from(t, (c) => c.charCodeAt(0)),
      ck4 = (t, d) => cat([T4(t), Uint8Array.from(le(d.length, 4)), d, new Uint8Array(d.length & 1)]),
      b64 = (b) =>
        new Promise((r) => {
          const f = new FileReader();
          f.onload = () => r(f.result);
          f.readAsDataURL(b);
        });
    function webpMux(bufs, W, H, fps) {
      const muxedBytes = muxAnimatedWebPFrames(bufs, W, H, fps, 0);
      return new Blob([muxedBytes], { type: 'image/webp' });
    }
    const pv = (n) => {
        const o = [];
        while (n > 127) {
          o.push((n % 128) | 128);
          n = Math.floor(n / 128);
        }
        o.push(n);
        return Uint8Array.from(o);
      },
      pf = (f, v) => cat([pv((f << 3) | 5), new Uint8Array(new Float32Array([v]).buffer)]),
      pi = (f, v) => cat([pv(f << 3), pv(v)]),
      pb = (f, d) => cat([pv((f << 3) | 2), pv(d.length), d]),
      ps2 = (f, s) => pb(f, new TextEncoder().encode(s));
    async function svgaEnc(pngs, W, H, fps, audioPayload = null) {
      const n = pngs.length,
        parts = [ps2(1, '2.0.0'), pb(2, cat([pf(1, W), pf(2, H), pi(3, fps), pi(4, n)]))];
      for (let i = 0; i < n; i++) {
        const keyName = 'img_' + (1640 + i);
        parts.push(pb(3, cat([ps2(1, keyName), pb(2, new Uint8Array(await pngs[i].arrayBuffer()))])));
      }
      if (audioPayload && audioPayload.bytes && audioPayload.bytes.length > 0) {
        parts.push(pb(3, cat([ps2(1, 'audio_0'), pb(2, audioPayload.bytes)])));
      }
      for (let i = 0; i < n; i++) {
        const keyName = 'img_' + (1640 + i);
        const sc = pngs[i] && pngs[i].__spriteScale;
        const layW = sc ? sc.targetW : W;
        const layH = sc ? sc.targetH : H;
        const sx = sc ? W / Math.max(1, sc.targetW) : 1;
        const sy = sc ? H / Math.max(1, sc.targetH) : 1;
        const lay = pb(2, cat([pf(1, 0), pf(2, 0), pf(3, layW), pf(4, layH)]));
        const tr = pb(3, cat([pf(1, sx), pf(2, 0), pf(3, 0), pf(4, sy), pf(5, 0), pf(6, 0)]));
        const fs = [];
        for (let k = 0; k < n; k++) fs.push(pb(2, cat([pf(1, k === i ? 1 : 0), lay, tr])));
        parts.push(pb(4, cat([ps2(1, keyName), ...fs])));
      }
      if (audioPayload && audioPayload.bytes && audioPayload.bytes.length > 0) {
        const durMs = Math.max(1, Math.round((audioPayload.dur || n / Math.max(1, fps)) * 1000));
        const endFr = Math.max(1, n);
        const ae = cat([ps2(1, 'audio_0'), pi(2, 0), pi(3, endFr), pi(4, 0), pi(5, durMs)]);
        parts.push(pb(5, ae));
      }
      const rawMovie = cat(parts);
      const deflated = pako?.deflate ? pako.deflate(rawMovie, { level: 9 }) : await inf2(rawMovie);
      const outBlob: any = new Blob([deflated], { type: 'application/octet-stream' });
      if (audioPayload && audioPayload.bytes && audioPayload.bytes.length > 0) {
        outBlob.__hasEmbeddedAudio = true;
      }
      return outBlob;
    }
    window.__svgaEnc = svgaEnc;
    const prev = $('#start').onclick;
    $('#start').onclick = async () => {
      let F = $('#fmt').value;
      const activeExt = cur ? cur.name.split('.').pop().toLowerCase() : '';
      if (F === 'orig' && activeExt === 'pag') {
        const hasPagEdits =
          Object.keys(window.EDIT || {}).length > 0 ||
          Boolean((window as any).__WATERMARK_LAYERS?.length) ||
          Boolean((window as any).__chromaKey?.enabled) ||
          Boolean((window as any).__edgeFeather?.enabled) ||
          (S &&
            ((+$('#w').value && +$('#w').value !== S.w) ||
              (+$('#h').value && +$('#h').value !== S.h) ||
              (+$('#fps').value && Math.abs(+$('#fps').value - Math.round(S.fps)) > 0.5)));
        if (hasPagEdits) F = 'pag';
      }
      if (!/^(lottie|dotlottie|svga|webp|apng|mov|pag)$/.test(F)) return prev();
      if (!cur || !S) return toast('Upload a supported file first');
      const W = +$('#w').value || S.w,
        H = +$('#h').value || S.h,
        fps = Math.max(1, +$('#fps').value || 15),
        q = (+$('#qual').value || 100) / 100,
        base = cur.name.replace(/\.\w+$/, ''),
        btn = $('#start');
      btn.disabled = true;
      S.stop();
      try {
        if (F === 'pag') {
          const stEl = document.getElementById('exportStatus');
          if (stEl) stEl.textContent = 'جاري تشفير وتصدير ملف PAG الاحترافي (.pag)…';
          const geomModified =
            W !== S.w ||
            H !== S.h ||
            (+$('#scale').value && +$('#scale').value !== 100) ||
            ($('#mirror').value && $('#mirror').value !== 'none') ||
            ($('#fit').value && $('#fit').value !== 'stretch') ||
            Boolean($('#trim')?.checked) ||
            Boolean((window as any).__edgeFeather?.enabled);

          const audioPayload =
            typeof (window as any).svgaPrepareAudioPayload === 'function'
              ? await (window as any).svgaPrepareAudioPayload(fps, S.n || 1)
              : null;

          // If we have decomposed layers in window.SV.m and geometry is intact, preserve decomposed layers + edits AND embed rendered WebP sequence for native libpag playback
          if (window.SV && window.SV.m && !geomModified && !(window as any).__WATERMARK_LAYERS?.length) {
            const clonedIm: Record<string, Uint8Array> = { ...(window.SV.m.im || {}) };
            if (window.EDIT) {
              for (const [ek, eu] of Object.entries(window.EDIT)) {
                try {
                  const b = await (await fetch(eu as string)).blob();
                  clonedIm[ek] = new Uint8Array(await b.arrayBuffer());
                } catch (_) {}
              }
            }
            const pagMovie = {
              ...window.SV.m,
              w: W,
              h: H,
              fps,
              im: clonedIm,
            };
            const webpFrames = await renderSvgaMovieToWebpFrames(pagMovie, 180);
            const pagBytes = encodePagFileBinary({
              width: W,
              height: H,
              fps,
              svgaMovie: pagMovie,
              webpFrames,
              audioBytes: audioPayload?.bytes || null,
            });
            await dl(new Blob([pagBytes as any], { type: 'application/octet-stream' }), base + '.pag');
          } else {
            // Render frames from any source format (MP4, VAP, YYEVA, SVGA, GIF, WebP, Lottie, PAG) into PAG binary
            const frPngBytes: Uint8Array[] = [];
            const webpFrames: Uint8Array[] = [];
            await render(W, H, fps, async (c, x) => {
              const pngBlob = await window.pngQ(c, q < 1, false);
              frPngBytes.push(new Uint8Array(await pngBlob.arrayBuffer()));
              const wBlob = await bl(c, 'image/webp', q);
              if (wBlob && wBlob.type === 'image/webp') {
                const u = new Uint8Array(await wBlob.arrayBuffer());
                if (u.length >= 20 && u[0] === 0x52 && u[8] === 0x57) {
                  webpFrames.push(u);
                  return;
                }
              }
              const id = x.getImageData(0, 0, W, H);
              webpFrames.push(encodeLosslessWebPFrame(id.data, W, H));
            });
            const pagBytes = encodePagFileBinary({
              width: W,
              height: H,
              fps,
              framesPng: frPngBytes,
              webpFrames,
              audioBytes: audioPayload?.bytes || null,
            });
            await dl(new Blob([pagBytes as any], { type: 'application/octet-stream' }), base + '.pag');
          }
          if (stEl) stEl.textContent = '';
        } else if (F === 'mov') {
          const w2 = W + (W % 2),
            h2 = H + (H % 2),
            r = await record(w2, h2, fps, q, 'mp4', {
              size: [w2, h2],
              paint: (o, c) => {
                o.clearRect(0, 0, w2, h2);
                o.drawImage(c, 0, 0);
              },
            });
          if (r.ext !== 'mp4') throw Error('MOV needs MP4 recording (use latest Chrome or Edge)');
          const u = new Uint8Array(await r.blob.arrayBuffer());
          u.set([113, 116, 32, 32], 8);
          await dl(new Blob([u], { type: 'video/quicktime' }), base + '.mov');
        } else if (F === 'apng') {
          const rgbaFrames: Uint8Array[] = [];
          await render(W, H, fps, async (c, x) => {
            const id = x.getImageData(0, 0, W, H);
            rgbaFrames.push(new Uint8Array(id.data.buffer.slice(0)));
          });
          const stEl = document.getElementById('exportStatus');
          if (stEl) stEl.textContent = 'Encoding Animated PNG (APNG)…';
          const apngBytes = encodeAnimatedApng(rgbaFrames, W, H, fps, q, 0);
          await dl(new Blob([apngBytes], { type: 'image/apng' }), base + '.apng');
        } else if (F === 'webp') {
          const webpBuffers: Uint8Array[] = [];
          await render(W, H, fps, async (c, x) => {
            const blob = await bl(c, 'image/webp', q);
            if (blob && blob.type === 'image/webp') {
              const ab = await blob.arrayBuffer();
              const u = new Uint8Array(ab);
              if (
                u.length >= 20 &&
                TD.decode(u.subarray(0, 4)) === 'RIFF' &&
                TD.decode(u.subarray(8, 12)) === 'WEBP'
              ) {
                webpBuffers.push(u);
                return;
              }
            }
            // Fallback to pure TypeScript Lossless VP8L encoder if browser canvas.toBlob('image/webp') fell back to PNG
            const id = x.getImageData(0, 0, W, H);
            webpBuffers.push(encodeLosslessWebPFrame(id.data, W, H));
          });
          const stEl = document.getElementById('exportStatus');
          if (stEl) stEl.textContent = 'Muxing Animated WebP…';
          await dl(webpMux(webpBuffers, W, H, fps), base + '.webp');
        } else {
          const fr = [];
          const isSvgaOut = F === 'svga';
          await render(W, H, fps, async (c) => {
            fr.push(await window.pngQ(c, isSvgaOut ? true : window.__cmp, isSvgaOut));
          });
          if (F === 'svga') {
            const audioPayload =
              typeof (window as any).svgaPrepareAudioPayload === 'function'
                ? await (window as any).svgaPrepareAudioPayload(fps, fr.length)
                : null;
            const sv = await svgaEnc(fr, W, H, fps, audioPayload);
            await dl(await window.svgaAddAudio(sv, fps, fr.length), base + '.svga');
          } else if (F === 'lottie')
            await dl(
              new Blob([JSON.stringify(lotJson(await Promise.all(fr.map(b64)), W, H, fps, 0))], {
                type: 'application/json',
              }),
              base + '.json'
            );
          else {
            const z = new JSZip(),
              nm = fr.map((_, i) => 'f' + String(i).padStart(4, '0') + '.png');
            z.file(
              'manifest.json',
              new Blob([
                JSON.stringify({
                  version: '1.0',
                  generator: 'MotionTools',
                  author: 'MotionTools',
                  animations: [{ id: 'animation', speed: 1, loop: true }],
                }),
              ])
            );
            z.file('animations/animation.json', new Blob([JSON.stringify(lotJson(nm, W, H, fps, 1))]));
            fr.forEach((b, i) => z.file('images/' + nm[i], b));
            await dl(await z.generateAsync({ type: 'blob' }), base + '.lottie');
          }
        }
      } catch (e) {
        toast(e.message || 'Conversion failed');
        throw e;
      } finally {
        btn.disabled = false;
        if (!S.paused) S.go();
      }
    };
  })();

  /* Block 8: Compression engine */
  (() => {
    const cat = (a) => {
      const o = new Uint8Array(a.reduce((t, x) => t + x.length, 0));
      let p = 0;
      for (const x of a) {
        o.set(x, p);
        p += x.length;
      }
      return o;
    };
    const qv = () => (+$('#qual').value || 100) / 100;
    async function ready() {
      if (!window.pako) (window as any).pako = pako;
      if (!window.UPNG) (window as any).UPNG = UPNG;
      if (!window.UPNG || !window.pako) {
        toast('Compression library could not load; saving uncompressed');
        return false;
      }
      return true;
    }
    window.cmpReady = ready;
    window.pngQ = async function (c, use, forSvga = false) {
      if (!use && !forSvga) return bl(c, 'image/png');
      const { qualityPercent, mode } = getSvgaCompressionConfig();
      const effectiveMode: SvgaCompressionMode = forSvga ? mode : 'png8_only';
      const target = computeSvgaSpriteCompressionTarget(
        c.width,
        c.height,
        qualityPercent,
        effectiveMode
      );
      const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height);
      const resampled =
        target.targetW !== c.width || target.targetH !== c.height
          ? resampleRgbaPremultiplied(d.data, c.width, c.height, target.targetW, target.targetH)
          : new Uint8Array(d.data.buffer, d.data.byteOffset, d.data.byteLength);
      const png8Bytes = quantizeAndEncodePng8Dithered(resampled, target.targetW, target.targetH, {
        maxColors: target.maxColors,
        ditherStrength: target.ditherStrength,
      });
      const blob: any = new Blob([png8Bytes], { type: 'image/png' });
      blob.__spriteScale = {
        origW: c.width,
        origH: c.height,
        targetW: target.targetW,
        targetH: target.targetH,
        sx: target.sx,
        sy: target.sy,
      };
      return blob;
    };
    const pv = (n) => {
      const o = [];
      while (n > 127) {
        o.push((n % 128) | 128);
        n = Math.floor(n / 128);
      }
      o.push(n);
      return Uint8Array.from(o);
    };
    async function svgaRecomp(f) {
      const raw = new Uint8Array(await f.arrayBuffer());
      if (raw[0] === 0x50) throw Error('SVGA 1.x cannot be recompressed');
      const { qualityPercent, mode } = getSvgaCompressionConfig();
      const res = compressSvga2Binary(raw, qualityPercent, mode);
      return new Blob([res.bytes], { type: 'application/octet-stream' });
    }
    const prev = $('#start').onclick;
    $('#start').onclick = async () => {
      let F = $('#fmt').value;
      const L = qv() < 1;
      if (!cur) return toast('Upload a supported file first');
      const ext = cur.name.split('.').pop().toLowerCase(),
        base = cur.name.replace(/\.\w+$/, '');
      if (F === 'orig' && L) {
        const mp = {
          gif: 'gif',
          webp: 'webp',
          apng: 'apng',
          png: 'apng',
          mp4: 'mp4',
          mov: 'mov',
          webm: 'webm',
          json: 'lottie',
          lottie: 'dotlottie',
          zip: 'zip',
        };
        if (ext === 'svga') {
          const b = $('#start');
          b.disabled = true;
          try {
            if (await ready()) {
              const o = await svgaRecomp(cur);
              return dl(o, base + '_min.svga');
            }
          } catch (e) {
            toast(e.message);
          } finally {
            b.disabled = false;
          }
          return;
        }
        if (!mp[ext]) return toast('Pick a target format to compress this file');
        $('#fmt').value = mp[ext];
        F = mp[ext];
      }
      const ok = (L || F === 'svga') && (await ready());
      window.__cmp = ok;
      return prev();
    };
  })();

  /* Block 9: SVGA 2.0 Upgrade */
  window.SVP = null;
  async function svgaUpgrade(f, v, cv) {
    window.SVP = null;
    await getLib('SVGA');
    if (!window.SVGA) {
      if (window.SV && (window.SV.m.shapes || window.SV.m.matte))
        toast('SVGA library could not load (check connection); matte/vector layers may look wrong');
      return;
    }
    try {
      const u = URL.createObjectURL(f),
        vi = await new Promise((ok, no) => new SVGA.Parser().load(f, ok, no)).catch(
          () => new Promise((ok, no) => new SVGA.Parser().load(u, ok, no))
        );
      if (!S || cur !== f) return;
      const baseW = S.w || (vi && vi.videoSize && vi.videoSize.width) || 360;
      const baseH = S.h || (vi && vi.videoSize && vi.videoSize.height) || 360;
      const baseFps = S.fps || (vi && vi.FPS) || 20;
      const [hiW, hiH] = getHiResCanvasDims(baseW, baseH),
        d = document.createElement('div');
      d.style.cssText = 'width:' + hiW + 'px;height:' + hiH + 'px';
      v.appendChild(d);
      const pl = new SVGA.Player(d);
      if (vi && Array.isArray(vi.audios)) {
        vi.audios = [];
      }
      pl.setVideoItem(vi);
      try {
        pl._resize = () => {};
      } catch (_) {}
      // Apply any existing edited/chroma-keyed images to the upgraded player
      if (window.EDIT) {
        for (const [ek, eu] of Object.entries(window.EDIT)) {
          try {
            pl.setImage(eu, ek);
          } catch (_) {}
        }
      }
      pl.startAnimation();
      cv.remove();
      window.SVP = pl;
      syncPreviewSize(baseW, baseH);
      pl.onFrame((fr) => {
        if (!S || window.SVP !== pl) return;
        (window as any).__svgaCurrentFrame = fr;
        (pl as any).currentFrame = fr;
        const activeFps = (S && S.fps) || baseFps || 20;
        if (window.PA) window.PA.sync(fr / activeFps);
      });
      Object.assign(S, {
        set: async (i) => {
          pl.stepToFrame(i, false);
          try {
            pl._renderer?.drawFrame?.(i);
          } catch (_) {}
          await sleep(8);
        },
        draw: (c, W, H) => c.drawImage(d.querySelector('canvas'), 0, 0, W, H),
        stop: () => pl.pauseAnimation(),
        go: () => pl.startAnimation(),
      });
      if ((window as any).__chromaKey?.enabled && (window as any).__chromaKey?.applyToLayers !== false) {
        (window as any).__applyChromaKeyToStageAndAssets?.((window as any).__chromaKey);
      }
    } catch (e) {}
  }
  const _ae = applyEdit;
  applyEdit = async function (u, k) {
    (window.EDIT = window.EDIT || {})[k] = u;
    if (window.SVP)
      try {
        window.SVP.setImage(u, k);
      } catch (e) {}
    if (S?.meta?.dynamicSlots) {
      const slot = S.meta.dynamicSlots.find((s: any) => s.assetKey === k);
      if (slot) {
        S._vapSlotReplacements = S._vapSlotReplacements || {};
        const im = await imgOf(u);
        if (im) {
          const prev = S._vapSlotReplacements[slot.srcId] || {};
          S._vapSlotReplacements[slot.srcId] = {
            ...prev,
            active: true,
            hidden: false,
            source: im,
            customImg: true,
            dataUrl: u,
            fitMode: prev.fitMode || slot.fitType || 'fitXY',
            useMask: prev.useMask !== false,
          };
          const thumbEl = document.querySelector(`#vapDynamicMasksPanel [data-vap-thumb="${slot.srcId}"]`) as HTMLImageElement | null;
          if (thumbEl) thumbEl.src = u;
          const badgeEl = document.querySelector(`#vapDynamicMasksPanel [data-vap-status="${slot.srcId}"]`) as HTMLElement | null;
          if (badgeEl) {
            badgeEl.textContent = '✓ تم الاستبدال';
            badgeEl.style.background = 'rgba(16, 185, 129, 0.2)';
            badgeEl.style.color = '#34d399';
          }
          if (S.vid && S._alphaCanvas) {
            const x = S._alphaCanvas.getContext('2d');
            if (x) {
              x.clearRect(0, 0, S._alphaCanvas.width, S._alphaCanvas.height);
              vapDraw(x, S._alphaCanvas.width, S._alphaCanvas.height, S.vid, S.meta);
            }
          }
        }
      }
    }
    return _ae(u, k);
  };

  /* Block 10: Audio engine + native SVGA patch export */
  (() => {
    const cat = (a) => {
        const o = new Uint8Array(a.reduce((t, x) => t + x.length, 0));
        let p = 0;
        for (const x of a) {
          o.set(x, p);
          p += x.length;
        }
        return o;
      },
      pv = (n) => {
        const o = [];
        while (n > 127) {
          o.push((n % 128) | 128);
          n = Math.floor(n / 128);
        }
        o.push(n);
        return Uint8Array.from(o);
      },
      pi = (f, v) => cat([pv(f << 3), pv(v)]),
      pf = (f, v) => cat([pv((f << 3) | 5), new Uint8Array(new Float32Array([v]).buffer)]),
      pb = (f, d) => cat([pv((f << 3) | 2), pv(d.length), d]),
      ps2 = (f, s) => pb(f, new TextEncoder().encode(s));
    window.EDIT = window.EDIT || {};
    const AU = (window.AU = { cur: null, add: null, vol: 1, del: false, dirty: false });
    let AC = null;
    const actx = () => AC || (AC = new (window.AudioContext || window.webkitAudioContext)());
    const isMp3 = (b) =>
      !!b &&
      b.length > 3 &&
      ((b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0));
    const isAudioBin = (b) => {
      if (!b || b.length < 4) return false;
      if (isMp3(b)) return true;
      if (
        b.length >= 12 &&
        b[0] === 0x52 &&
        b[1] === 0x49 &&
        b[2] === 0x46 &&
        b[3] === 0x46 &&
        b[8] === 0x57 &&
        b[9] === 0x41 &&
        b[10] === 0x56 &&
        b[11] === 0x45
      )
        return true;
      if (b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53) return true;
      if (b[0] === 0xff && (b[1] & 0xf6) === 0xf0) return true;
      if (b.length >= 8 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return true;
      return false;
    };
    const ensureMp3Id3Header = (b: Uint8Array | null | undefined): Uint8Array => {
      if (!b || b.length === 0) return new Uint8Array(0);
      // Official SVGA 2.0 players (svgaplayerweb, SVGAPlayer-iOS/Android/Web) check
      // bytes[0..2] === "ID3" (0x49, 0x44, 0x33 -> Base64 "SUQz") to recognize MP3 audio in MovieEntity.images.
      if (b.length >= 3 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) {
        return b;
      }
      const id3v2Header = new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
      return cat([id3v2Header, b]);
    };
    async function svgaParts(f) {
      const raw = new Uint8Array(await f.arrayBuffer());
      if (raw[0] === 0x50) return null;
      const u = await inf(raw, 'deflate'),
        r = new PB(u),
        ents = [],
        imgs = {},
        unscalableKeys = new Set<string>();
      let movieFps = 20,
        movieFrames = 0;
      while (!r.end) {
        const t = r.vi(),
          fl = t >>> 3,
          w = t & 7;
        if (fl === 2 && w === 2) {
          pm(r.by(), (g, q) => {
            if (g === 1 || g === 2) {
              q.f32();
              return 1;
            }
            if (g === 3) {
              movieFps = q.vi() || 20;
              return 1;
            }
            if (g === 4) {
              movieFrames = q.vi() || 0;
              return 1;
            }
            return 0;
          });
        } else if (fl === 5 && w === 2) {
          const e = {};
          pm(r.by(), (g, q) => {
            if (g === 1) e.key = TD.decode(q.by());
            else if (g >= 2 && g <= 5) e['n' + g] = q.vi();
            else return 0;
            return 1;
          });
          ents.push(e);
        } else if (fl === 3 && w === 2) {
          let k = '',
            v = null;
          pm(r.by(), (g, q) => {
            if (g === 1) k = TD.decode(q.by());
            else if (g === 2) v = q.by().slice();
            else return 0;
            return 1;
          });
          imgs[k] = v;
        } else if (fl === 4 && w === 2) {
          let sKey = '';
          let hasClipOrShapes = false;
          pm(r.by(), (g, q) => {
            if (g === 1) {
              sKey = TD.decode(q.by());
              return 1;
            }
            if (g === 2) {
              pm(q.by(), (fg, fq) => {
                if (fg === 4) {
                  const cp = fq.by();
                  if (cp && cp.length > 0) hasClipOrShapes = true;
                  return 1;
                }
                if (fg === 5) {
                  fq.by();
                  hasClipOrShapes = true;
                  return 1;
                }
                return 0;
              });
              return 1;
            }
            return 0;
          });
          if (sKey && hasClipOrShapes) unscalableKeys.add(sKey);
        } else r.skip(w);
      }
      return { u, ents, imgs, unscalableKeys, movieFps, movieFrames };
    }
    async function toCv(b) {
      const bm = await createImageBitmap(b),
        c = mk(bm.width, bm.height);
      c.getContext('2d').drawImage(bm, 0, 0);
      return c;
    }
    async function svgaPatch(f, o) {
      o = o || {};
      const P = await svgaParts(f);
      if (!P) throw Error('SVGA 1.x files cannot be patched');
      const u = P.u,
        ak = new Set(P.ents.map((e) => e.key)),
        au = o.audio,
        drop = au && (au.del || au.set),
        { qualityPercent, mode } = getSvgaCompressionConfig(),
        scaleMap: Record<string, SpriteScaleEntry> = {},
        compressedImages: Record<string, Uint8Array> = {};

      // Pass 1: Compress and/or apply edits to all image entries in P.imgs so scaleMap is ready for SpriteEntity (field 4)
      for (const [ks, val] of Object.entries(P.imgs)) {
        if (ak.has(ks) || isAudioBin(val)) continue;
        const canDownscale = !P.unscalableKeys?.has(ks);
        const effMode = canDownscale ? mode : 'png8_only';
        const ed = o.edits && o.edits[ks];
        if (ed) {
          const cv = await toCv(ed);
          const pngBlob: any = await window.pngQ(cv, true, !!o.comp && canDownscale);
          compressedImages[ks] = new Uint8Array(await pngBlob.arrayBuffer());
          if (canDownscale && pngBlob.__spriteScale) {
            scaleMap[ks] = pngBlob.__spriteScale;
          }
        } else if (o.comp && val && val.length > 8) {
          if (val[0] === 0x89 && val[1] === 0x50) {
            try {
              const res = compressPngBufferLikeReference(val, qualityPercent, effMode);
              compressedImages[ks] = res.bytes;
              if (canDownscale) {
                scaleMap[ks] = {
                  origW: res.origW,
                  origH: res.origH,
                  targetW: res.targetW,
                  targetH: res.targetH,
                  sx: res.sx,
                  sy: res.sy,
                };
              }
            } catch (_) {
              const cv = await toCv(new Blob([val]));
              const pngBlob: any = await window.pngQ(cv, true, canDownscale);
              const nb = new Uint8Array(await pngBlob.arrayBuffer());
              if (nb.length < val.length || (canDownscale && pngBlob.__spriteScale && pngBlob.__spriteScale.sx > 1)) {
                compressedImages[ks] = nb;
                if (canDownscale && pngBlob.__spriteScale) scaleMap[ks] = pngBlob.__spriteScale;
              }
            }
          } else if (val[0] === 0xff || val[0] === 0x52) {
            try {
              const cv = await toCv(new Blob([val]));
              const pngBlob: any = await window.pngQ(cv, true, canDownscale);
              const nb = new Uint8Array(await pngBlob.arrayBuffer());
              if (nb.length < val.length || (canDownscale && pngBlob.__spriteScale && pngBlob.__spriteScale.sx > 1)) {
                compressedImages[ks] = nb;
                if (canDownscale && pngBlob.__spriteScale) scaleMap[ks] = pngBlob.__spriteScale;
              }
            } catch (_) {}
          }
        }
      }

      // Pass 2: Rebuild MovieEntity in strict ascending Protobuf field order (1 -> 2 -> 3 -> 4 -> 5)
      const r = new PB(u),
        f12 = [],
        f3 = [],
        f4 = [],
        f5 = [];
      while (!r.end) {
        const st = r.p,
          t = r.vi(),
          fl = t >>> 3,
          w = t & 7;
        if (fl === 3 && w === 2) {
          const ent = r.by();
          let key = null,
            val = null;
          pm(ent, (g, q) => {
            if (g === 1) {
              key = q.by();
              return 1;
            }
            if (g === 2) {
              val = q.by();
              return 1;
            }
            return 0;
          });
          const ks = TD.decode(key);
          if (drop && (ak.has(ks) || ks === 'audio_0' || isAudioBin(val))) continue;
          let nv = compressedImages[ks] || val;
          if ((ak.has(ks) || isMp3(nv)) && nv) {
            nv = ensureMp3Id3Header(nv);
          }
          const e = cat([pv((1 << 3) | 2), pv(key.length), key, pv((2 << 3) | 2), pv(nv.length), nv]);
          f3.push(cat([pv((3 << 3) | 2), pv(e.length), e]));
        } else if (fl === 4 && w === 2) {
          const spriteRaw = r.by();
          const updatedSprite = rescaleSvgaSpriteEntityProtobuf(spriteRaw, scaleMap);
          f4.push(pb(4, updatedSprite));
        } else if (fl === 5 && w === 2) {
          r.by();
          if (!drop) f5.push(u.subarray(st, r.p));
        } else {
          r.skip(w);
          f12.push(u.subarray(st, r.p));
        }
      }
      if (au && au.set) {
        const mp3WithId3 = ensureMp3Id3Header(au.set);
        const effFps = Math.max(1, o.fps || P.movieFps || (S && S.fps) || 20);
        const totalFrames = Math.max(1, o.n || P.movieFrames || (S && S.n) || Math.ceil(au.dur * effFps));
        const durMs = Math.max(1, Math.round((au.dur || totalFrames / effFps) * 1000));
        const ae = cat([ps2(1, 'audio_0'), pi(2, 0), pi(3, totalFrames), pi(4, 0), pi(5, durMs)]);
        f3.push(pb(3, cat([ps2(1, 'audio_0'), pb(2, mp3WithId3)])));
        f5.push(pb(5, ae));
      }
      const wmLayers: AppliedWatermarkLayer[] = (window as any).__WATERMARK_LAYERS || [];
      if (wmLayers.length > 0) {
        const totalFrames = Math.max(1, o.n || P.movieFrames || (S && S.n) || 1);
        for (const wm of wmLayers) {
          const url = A[wm.imageKey] || wm.dataUrl;
          if (!url) continue;
          const rawWmBytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
          let pngBytes = rawWmBytes;
          try {
            if (rawWmBytes[0] === 0x89 && rawWmBytes[1] === 0x50) {
              pngBytes = compressPngBufferLikeReference(rawWmBytes, qualityPercent, 'png8_only').bytes;
            }
          } catch (_) {}
          f3.push(pb(3, cat([ps2(1, wm.imageKey), pb(2, pngBytes)])));
          const [a, b, c, d, tx, ty] = computeAffineMatrix2D(
            wm.x,
            wm.y,
            wm.width,
            wm.height,
            wm.scale,
            wm.rotation
          );
          const lay = pb(2, cat([pf(1, 0), pf(2, 0), pf(3, wm.width), pf(4, wm.height)]));
          const tr = pb(3, cat([pf(1, a), pf(2, b), pf(3, c), pf(4, d), pf(5, tx), pf(6, ty)]));
          const frameBytes = pb(2, cat([pf(1, Math.max(0, Math.min(1, wm.opacity / 100))), lay, tr]));
          const allFrames = [];
          for (let fi = 0; fi < totalFrames; fi++) allFrames.push(frameBytes);
          f4.push(pb(4, cat([ps2(1, wm.imageKey), ...allFrames])));
        }
      }
      const rawMovieOut = cat([...f12, ...f3, ...f4, ...f5]);
      const deflated = pako?.deflate ? pako.deflate(rawMovieOut, { level: 9 }) : await inf2(rawMovieOut);
      return new Blob([deflated], { type: 'application/octet-stream' });
    }
    window.svgaPatch = svgaPatch;
    LIBS.defs.Howl = ['https://cdn.jsdelivr.net/npm/howler@2.2.4/dist/howler.core.min.js'];
    LIBS.defs.lamejs = [
      'https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js',
      'https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.all.min.js',
      'https://unpkg.com/lamejs@1.2.1/lame.min.js',
    ];
    async function encodeMp3(buf, vol, startSec = 0, endSec = 0) {
      await getLib('lamejs');
      if (!window.lamejs) throw Error('MP3 encoder (lamejs) could not load');
      const srcSr = buf.sampleRate || 48000,
        sr = srcSr === 44100 || srcSr === 48000 || srcSr === 32000 ? srcSr : 44100,
        ch = Math.min(2, Math.max(1, buf.numberOfChannels || 1)),
        enc = new lamejs.Mp3Encoder(ch, sr, 128),
        sIdx = Math.max(0, Math.min(buf.length, Math.round((startSec || 0) * srcSr))),
        eIdx =
          endSec && endSec > startSec
            ? Math.max(sIdx, Math.min(buf.length, Math.round(endSec * srcSr)))
            : buf.length,
        srcSliceLen = Math.max(0, eIdx - sIdx),
        dstSliceLen = Math.max(0, Math.round((srcSliceLen * sr) / srcSr)),
        fadeLen = Math.min(128, Math.floor(dstSliceLen / 8)),
        cv = (x) => {
          const floatSlice =
            sr === srcSr
              ? x.subarray(sIdx, eIdx)
              : resampleChannelFloat32(x, srcSr, sr, dstSliceLen, 1, sIdx, false);
          const o = new Int16Array(floatSlice.length);
          for (let i = 0; i < floatSlice.length; i++) {
            let env = 1;
            if (sIdx > 0 && fadeLen > 4 && i < fadeLen) env = i / fadeLen;
            else if (fadeLen > 4 && i > floatSlice.length - 1 - fadeLen)
              env = (floatSlice.length - 1 - i) / fadeLen;
            const v = Math.max(-1, Math.min(1, floatSlice[i] * vol * env));
            o[i] = v < 0 ? v * 32768 : v * 32767;
          }
          return o;
        },
        L = cv(buf.getChannelData(0)),
        R = ch > 1 ? cv(buf.getChannelData(1)) : null,
        parts = [];
      for (let i = 0; i < L.length; i += 1152) {
        const a =
          ch > 1
            ? enc.encodeBuffer(L.subarray(i, i + 1152), R.subarray(i, i + 1152))
            : enc.encodeBuffer(L.subarray(i, i + 1152));
        if (a.length) parts.push(new Uint8Array(a.buffer, a.byteOffset, a.byteLength).slice());
      }
      const e = enc.flush();
      if (e.length) parts.push(new Uint8Array(e.buffer, e.byteOffset, e.byteLength).slice());
      return ensureMp3Id3Header(cat(parts));
    }
    const finalAudio = (window.finalAudio = () => {
      if (AU.del) return null;
      const s = AU.add || AU.cur;
      return s ? { buf: s.buf, vol: AU.vol, bytes: s.bytes, isMp3: s.mp3 } : null;
    });
    const mp3For = async (a, startSec = 0, endSec = 0) => {
      const isTrimmed = startSec > 0.005 || (endSec > 0 && endSec < a.buf.duration - 0.01);
      if (a.isMp3 && a.vol === 1 && a.bytes && !isTrimmed) {
        return ensureMp3Id3Header(a.bytes);
      }
      return encodeMp3(a.buf, a.vol, startSec, endSec);
    };
    const prepareSvgaAudioPayload = async (fps, n) => {
      if (AU.detectPromise) {
        try {
          await AU.detectPromise;
        } catch (_) {}
      }
      if (!finalAudio() && !AU.del && cur && (cur.__rawBytes || (S && S.vid))) {
        try {
          await detect(cur);
        } catch (_) {}
      }
      const a = finalAudio();
      if (!a || !a.buf) return null;
      const featherCfg = (window as any).__edgeFeather;
      const trimCheck = $('#trim') as HTMLInputElement | null;
      const isTrimOn = Boolean((trimCheck && trimCheck.checked) || (featherCfg && featherCfg.trimEnabled));
      let sSec = 0,
        eSec = 0;
      if (isTrimOn) {
        sSec = Number(
          trimCheck && trimCheck.checked
            ? ($('#trimStart') as HTMLInputElement)?.value || 0
            : featherCfg?.trimStartTime || 0
        );
        eSec = Number(
          trimCheck && trimCheck.checked
            ? ($('#trimEnd') as HTMLInputElement)?.value || 0
            : featherCfg?.trimEndTime || 0
        );
      }
      const mp3Bytes = await mp3For(a, sSec, eSec);
      const effDur = eSec > sSec ? eSec - sSec : a.buf.duration;
      return { bytes: ensureMp3Id3Header(mp3Bytes), dur: effDur, fps, n };
    };
    (window as any).svgaPrepareAudioPayload = prepareSvgaAudioPayload;
    window.svgaAddAudio = async (b, fps, n) => {
      if (b && (b as any).__hasEmbeddedAudio) return b;
      try {
        const payload = await prepareSvgaAudioPayload(fps, n);
        if (!payload || !payload.bytes || payload.bytes.length === 0) return b;
        return await svgaPatch(b, { audio: { set: payload.bytes, dur: payload.dur }, fps, n });
      } catch (e) {
        console.warn('svgaAddAudio error:', e);
        toast((e?.message || 'Audio error') + ' - saved without audio');
        return b;
      }
    };
    window.withAudio = async (st) => {
      window.__aStart = window.__aStop = null;
      const a = finalAudio();
      if (!a) return st;
      try {
        const c = new (window.AudioContext || window.webkitAudioContext)(),
          d = c.createMediaStreamDestination(),
          s = c.createBufferSource(),
          g = c.createGain();
        s.buffer = a.buf;
        g.gain.value = a.vol;
        s.connect(g);
        g.connect(d);
        d.stream.getAudioTracks().forEach((t) => st.addTrack(t));
        window.__aStart = () => {
          c.resume();
          s.start();
        };
        window.__aStop = () => {
          try {
            s.stop();
          } catch (e) {}
          c.close();
        };
      } catch (e) {
        window.__hasAu = false;
      }
      return st;
    };
    const prevS = $('#start').onclick;
    $('#start').onclick = async () => {
      const F = $('#fmt').value,
        ext = cur ? cur.name.split('.').pop().toLowerCase() : '';
      const geomChanged =
        Boolean(S) &&
        ((+$('#w').value && +$('#w').value !== S.w) ||
          (+$('#h').value && +$('#h').value !== S.h) ||
          (+$('#fps').value && Math.abs(+$('#fps').value - Math.round(S.fps)) > 0.5) ||
          (+$('#scale').value && +$('#scale').value !== 100) ||
          ($('#mirror').value && $('#mirror').value !== 'none') ||
          ($('#fit').value && $('#fit').value !== 'stretch') ||
          Boolean($('#trim')?.checked) ||
          Boolean((window as any).__edgeFeather?.trimEnabled));

      if (
        cur &&
        ext === 'svga' &&
        (F === 'orig' || F === 'svga') &&
        !geomChanged &&
        !(window as any).__edgeFeather?.enabled
      ) {
        const b = $('#start');
        b.disabled = true;
        try {
          const cfg = getSvgaCompressionConfig();
          const wantCompress = cfg.qualityPercent < 100;
          const hasEdits =
            AU.dirty ||
            Object.keys(window.EDIT || {}).length > 0 ||
            Boolean((window as any).__WATERMARK_LAYERS?.length);

          if (!wantCompress && !hasEdits) {
            await dl(cur, cur.name);
            return;
          }

          const compReady = wantCompress ? await window.cmpReady() : false;
          let audio = null;
          if (AU.dirty) {
            if (AU.del) audio = { del: 1 };
            else if (AU.add || AU.vol !== 1) {
              const a = finalAudio();
              audio = a ? { set: await mp3For(a), dur: a.buf.duration } : { del: 1 };
            }
          }
          const eb = {};
          for (const k in window.EDIT) eb[k] = await (await fetch(window.EDIT[k])).blob();
          const stEl = document.getElementById('exportStatus');
          if (stEl) {
            stEl.textContent = wantCompress
              ? `جاري ضغط ملف SVGA (${cfg.qualityPercent}%)…`
              : 'جاري تصدير ملف SVGA بالجودة الأصلية (100%)…';
          }
          const outName = wantCompress
            ? cur.name.replace(/\.svga$/i, '') + '_compressed.svga'
            : cur.name.replace(/\.svga$/i, '') + '.svga';
          await dl(
            await svgaPatch(cur, { edits: eb, comp: wantCompress && compReady, audio, fps: S.fps, n: S.n }),
            outName
          );
        } catch (e) {
          toast(e.message || 'Export failed');
        } finally {
          b.disabled = false;
        }
        return;
      }
      if (cur && ext === 'svga' && F === 'orig' && geomChanged) {
        $('#fmt').value = 'svga';
      }
      return prevS();
    };

    (window as any).__exportCurrentMotionToSvgaEditorFile = async (): Promise<File | null> => {
      const activeFile = cur || (window as any).__currentMotionFile;
      if (!activeFile) return null;
      const activeExt = (activeFile.name.split('.').pop() || '').toLowerCase();

      if (activeExt === 'pag' && window.SV && window.SV.m) {
        try {
          const clonedIm: Record<string, Uint8Array> = { ...(window.SV.m.im || {}) };
          if (window.EDIT) {
            for (const [ek, eu] of Object.entries(window.EDIT)) {
              try {
                const b = await (await fetch(eu as string)).blob();
                clonedIm[ek] = new Uint8Array(await b.arrayBuffer());
              } catch (_) {}
            }
          }
          const pagBytes = encodePagFileBinary({
            width: window.SV.m.w || S?.w || 500,
            height: window.SV.m.h || S?.h || 500,
            fps: window.SV.m.fps || S?.fps || 30,
            svgaMovie: {
              ...window.SV.m,
              im: clonedIm,
            },
          });
          return new File([pagBytes as any], activeFile.name, {
            type: 'application/octet-stream',
            lastModified: Date.now(),
          });
        } catch (err) {
          console.warn('Fallback to raw PAG file for editor:', err);
        }
        const buf = await activeFile.arrayBuffer();
        return new File([buf], activeFile.name, {
          type: 'application/octet-stream',
          lastModified: Date.now(),
        });
      }

      if (activeExt === 'svga') {
        const hasEdits =
          AU.dirty ||
          Object.keys(window.EDIT || {}).length > 0 ||
          Boolean((window as any).__WATERMARK_LAYERS?.length);
        if (hasEdits && S) {
          try {
            let audio = null;
            if (AU.dirty) {
              if (AU.del) audio = { del: 1 };
              else if (AU.add || AU.vol !== 1) {
                const a = finalAudio();
                audio = a ? { set: await mp3For(a), dur: a.buf.duration } : { del: 1 };
              }
            }
            const eb: Record<string, Blob> = {};
            for (const k in window.EDIT) eb[k] = await (await fetch(window.EDIT[k])).blob();
            const patchedBlob = await svgaPatch(activeFile, {
              edits: eb,
              comp: false,
              audio,
              fps: S.fps,
              n: S.n,
            });
            return new File([patchedBlob], activeFile.name, {
              type: 'application/octet-stream',
              lastModified: Date.now(),
            });
          } catch (err) {
            console.warn('Fallback to raw SVGA file for editor:', err);
          }
        }
        const buf = await activeFile.arrayBuffer();
        return new File([buf], activeFile.name, {
          type: 'application/octet-stream',
          lastModified: Date.now(),
        });
      }

      if (S && typeof (window as any).__svgaEnc === 'function') {
        const W = +$('#w')?.value || S.w || 500;
        const H = +$('#h')?.value || S.h || 500;
        const fps = Math.max(1, +$('#fps')?.value || S.fps || 15);
        const base = activeFile.name.replace(/\.\w+$/, '') || 'project';
        const wasPaused = S.paused;
        S.stop?.();
        try {
          toast('⏳ جاري تحويل المشروع وفتحه في محرر SVGA / After Effects...');
          const fr: Blob[] = [];
          await render(W, H, fps, async (c: HTMLCanvasElement) => {
            fr.push(await window.pngQ(c, true, true));
          });
          if (fr.length > 0) {
            const audioPayload =
              typeof (window as any).svgaPrepareAudioPayload === 'function'
                ? await (window as any).svgaPrepareAudioPayload(fps, fr.length)
                : null;
            let svBlob = await (window as any).__svgaEnc(fr, W, H, fps, audioPayload);
            if (typeof (window as any).svgaAddAudio === 'function') {
              svBlob = await (window as any).svgaAddAudio(svBlob, fps, fr.length);
            }
            return new File([svBlob], `${base}.svga`, {
              type: 'application/octet-stream',
              lastModified: Date.now(),
            });
          }
        } catch (err) {
          console.warn('Auto-convert non-SVGA to SVGA for editor failed:', err);
        } finally {
          if (!wasPaused) S.go?.();
        }
      }

      const buf = await activeFile.arrayBuffer();
      return new File([buf], activeFile.name, {
        type: activeFile.type || 'application/octet-stream',
        lastModified: Date.now(),
      });
    };
    document.head.insertAdjacentHTML(
      'beforeend',
      '<style>#aoe{background:#13805a;border-color:#13805a}#aoe:disabled{opacity:.45;cursor:not-allowed}.pos button.on{background:#2a2a35;border-color:var(--ac2)}#audBox{cursor:pointer}#audBox:hover{border-color:var(--ac)}</style>'
    );
    if (!document.getElementById('ao')) {
      document.body.insertAdjacentHTML(
        'beforeend',
        `<div class='mo' id='ao' hidden><div class='md' role='dialog' aria-label='Audio Edit Tool'>
<header><div><b id='aot'>Audio Edit Tool</b><small>Configure animation audio and click execute</small></div><button id='aox' aria-label='Close'>✕</button></header>
<div class='mb'><section class='ml'><div class='mh'><div style='width:38px;height:38px;border-radius:8px;background:#3a2a10;display:grid;place-items:center'>♪</div><div><b id='aon'></b><small id='aos'></small></div></div>
<div class='mst' style='min-height:260px;padding:8px'><canvas id='awv' style='width:100%;height:240px'></canvas></div>
<div class='card' style='margin-top:10px;flex-direction:row;align-items:center'><button class='pill' id='aop' style='width:42px'>▶</button><small id='aoi'></small></div></section>
<aside class='mr'><div class='pos'><button id='ak1' class='on'>Audio | Volume</button><button id='ak2'>Delete Audio</button></div>
<div id='aop1' style='display:flex;flex-direction:column;gap:12px'><div class='card'><b>Audio File</b><div class='pos'><button id='aof' style='background:#16302a;border-color:#2a7a5a;color:#5de0ad'></button><button id='aoadd'>Add Audio</button></div></div>
<div class='card'><div class='tg'><b>Volume</b><b id='aovl'>100%</b></div><input type='range' id='aorg' min='0' max='200' value='100' style='accent-color:var(--ac)'></div></div>
<div id='aop2' style='display:none'><div class='card'><b>Delete Audio</b><small>Removes the audio from the exported file</small><button class='rd' id='aodb'></button></div></div></aside></div>
<footer><small id='aost'></small><span><button id='aoc'>Cancel</button><button id='aoe' disabled>Execute</button></span></footer></div></div>`
      );
    }
    const g = (id) => document.getElementById(id);
    let T = null,
      pl = null;
    const lab = () => (S && S.meta && S.meta.kind) || (cur ? cur.name.split('.').pop().toUpperCase() : '');
    const curS = () => (T.del ? null : T.add || AU.cur);
    function wave(buf) {
      const c = g('awv'),
        x = c.getContext('2d'),
        W = (c.width = 600),
        H = (c.height = 300),
        N = 60,
        gr = x.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, '#d98a1c');
      gr.addColorStop(1, '#2fa86a');
      x.clearRect(0, 0, W, H);
      x.fillStyle = gr;
      let pk = [];
      if (buf) {
        const d = buf.getChannelData(0),
          bs = Math.floor(d.length / N) || 1;
        for (let i = 0; i < N; i++) {
          let m = 0;
          for (let j = i * bs; j < (i + 1) * bs && j < d.length; j++) {
            const a = Math.abs(d[j]);
            if (a > m) m = a;
          }
          pk.push(m);
        }
        const mx = Math.max(...pk, 1e-6);
        pk = pk.map((v) => 0.08 + (0.92 * v) / mx);
      } else pk = Array.from({ length: N }, (_, i) => 0.25 + 0.6 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.45)));
      pk.forEach((v, i) => {
        const bw = (W / N) * 0.55,
          xx = (i * W) / N + (W / N) * 0.2,
          h = v * H * 0.9;
        x.beginPath();
        x.roundRect ? x.roundRect(xx, (H - h) / 2, bw, h, bw / 2) : x.rect(xx, (H - h) / 2, bw, h);
        x.fill();
      });
    }
    function ui() {
      const s = curS();
      g('aon').textContent = s ? s.name : 'No current audio';
      g('aos').textContent = lab() + ' · ' + (s ? s.buf.duration.toFixed(2) + ' s' : 'Unknown duration');
      g('aof').textContent = s ? s.name : 'No current audio';
      g('aoi').textContent = s ? 'Click play to preview' : 'No audio to preview';
      g('aovl').textContent = Math.round(T.vol * 100) + '%';
      g('aorg').value = Math.round(T.vol * 100);
      g('aodb').textContent = T.del ? 'Audio will be deleted (click to undo)' : 'Delete current audio';
      wave(s && s.buf);
      g('awv').style.opacity = s ? 1 : 0.35;
      g('aoe').disabled = !T.chg;
      g('aost').textContent = T.chg ? 'Pending changes. Press Execute' : 'Please select operations to execute';
    }
    const stopP = () => {
      if (pl) {
        try {
          pl.s.stop();
        } catch (e) {}
        pl = null;
      }
      g('aop').textContent = '▶';
    };
    const tab = (k) => {
      g('ak1').classList.toggle('on', k === 1);
      g('ak2').classList.toggle('on', k === 2);
      g('aop1').style.display = k === 1 ? 'flex' : 'none';
      g('aop2').style.display = k === 2 ? 'block' : 'none';
    };
    g('ak1').onclick = () => tab(1);
    g('ak2').onclick = () => tab(2);
    g('aop').onclick = () => {
      if (pl) return stopP();
      const s = curS();
      if (!s) return;
      const c = actx();
      c.resume();
      const sr = c.createBufferSource(),
        gn = c.createGain();
      sr.buffer = s.buf;
      gn.gain.value = T.vol;
      sr.connect(gn);
      gn.connect(c.destination);
      sr.onended = () => {
        if (pl && pl.s === sr) stopP();
      };
      sr.start();
      pl = { s: sr, g: gn };
      g('aop').textContent = '■';
    };
    g('aorg').oninput = (e) => {
      T.vol = e.target.value / 100;
      T.chg = 1;
      if (pl) pl.g.gain.value = T.vol;
      ui();
    };
    g('aodb').onclick = () => {
      T.del = !T.del;
      if (T.del) T.add = null;
      T.chg = 1;
      stopP();
      ui();
    };
    g('aoadd').onclick = () => {
      const i = document.createElement('input');
      i.type = 'file';
      i.accept = 'audio/*,.mp3,.wav,.m4a,.aac,.ogg';
      i.onchange = async () => {
        const f = i.files[0];
        if (!f) return;
        try {
          const by = new Uint8Array(await f.arrayBuffer()),
            buf = await actx().decodeAudioData(by.slice().buffer);
          T.add = { name: f.name, buf, bytes: by, mp3: isMp3(by) };
          T.del = false;
          T.chg = 1;
          stopP();
          tab(1);
          ui();
        } catch (e) {
          toast('Cannot decode this audio file');
        }
      };
      i.click();
    };
    const shut = () => {
      stopP();
      g('ao').hidden = true;
    };
    g('aox').onclick = g('aoc').onclick = shut;
    g('aoe').onclick = () => {
      Object.assign(AU, { add: T.add, vol: T.vol, del: T.del, dirty: true });
      shut();
      setBox();
      toast(
        /svga/i.test(lab())
          ? 'Audio saved - applied when you export (Keep Original / SVGA)'
          : 'Audio saved - merged when you export a video format or SVGA'
      );
    };
    function setBox() {
      const b = $('#audBox'),
        a = finalAudio();
      b.textContent = a
        ? '♪ ' + (AU.add ? AU.add.name : AU.cur.name) + ' · ' + a.buf.duration.toFixed(1) + ' s (click to edit)'
        : AU.del
          ? 'Audio deleted (click to edit)'
          : '+ Click to add audio';
    }
    $('#audBox').onclick = () => {
      if (!cur) return toast('Upload a file first');
      T = { add: AU.add, vol: AU.vol, del: AU.del, chg: 0 };
      g('aot').textContent = lab() + ' Audio Edit Tool';
      tab(1);
      g('ao').hidden = false;
      ui();
    };
    const sanitizeMp4ContainerForAudioDecode = (rawU8: Uint8Array): Uint8Array => {
      if (!rawU8 || rawU8.byteLength < 16) return rawU8;
      let u8 = rawU8;
      const fp = bidx(u8, 'ftyp');
      if (fp >= 4 && fp < 65536) {
        u8 = u8.subarray(fp - 4);
      }
      try {
        const top = boxes(u8);
        if (top && top.length > 0 && top.some((b) => b.type === 'moov' || b.type === 'mdat')) {
          const lastBoxEnd = top[top.length - 1].end;
          const copy = u8.slice(0, Math.min(u8.byteLength, lastBoxEnd));
          for (const b of top) {
            if (b.type === 'vapc' || b.type === 'yyev' || b.type === 'yyeva') {
              if (b.start + 8 <= copy.byteLength) {
                // Replace custom VAP/YYEVA box tag with standard ISO-BMFF 'free' box tag
                // so chunk offsets (stco/co64) stay 100% identical while strict MP4 demuxers never reject custom boxes
                copy[b.start + 4] = 0x66; // 'f'
                copy[b.start + 5] = 0x72; // 'r'
                copy[b.start + 6] = 0x65; // 'e'
                copy[b.start + 7] = 0x65; // 'e'
              }
            }
          }
          return copy;
        }
      } catch (_) {}
      const yyTrail = bidx(u8, 'yyeffectmp4json[[');
      if (yyTrail > 8) {
        const prevTag = TD.decode(u8.subarray(yyTrail - 4, yyTrail));
        if (prevTag === 'free' || prevTag === 'skip' || prevTag === 'yyev') {
          return u8.subarray(0, yyTrail - 8);
        }
        return u8.subarray(0, yyTrail);
      }
      return u8;
    };
    async function detect(f) {
      const ext = f.name.split('.').pop().toLowerCase();
      let by = null,
        nm = 'Embedded audio',
        keep = null;
      try {
        const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        const tryDecodeBuffer = async (u8) => {
          if (!u8 || u8.byteLength < 16) return null;
          const ctx = OAC ? new OAC(2, 48000, 48000) : actx();
          const ab = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
          let decoded = await ctx.decodeAudioData(ab).catch(() => null);
          if (!decoded && OAC) {
            const fallbackAb = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
            decoded = await actx().decodeAudioData(fallbackAb).catch(() => null);
          }
          if (!decoded && (isMp3(u8) || (u8[0] === 0xff && (u8[1] & 0xe0) === 0xe0))) {
            const withId3 = ensureMp3Id3Header(u8);
            const ab2 = withId3.buffer.slice(withId3.byteOffset, withId3.byteOffset + withId3.byteLength);
            const ctx2 = OAC ? new OAC(2, 48000, 48000) : actx();
            decoded = await ctx2.decodeAudioData(ab2).catch(() => null);
          }
          return decoded;
        };
        const decodeBytes = async (u8, isVideoContainer = false) => {
          if (!u8 || u8.byteLength < 16) return null;
          if (isVideoContainer) {
            const sanitized = sanitizeMp4ContainerForAudioDecode(u8);
            const fromSanitized = await tryDecodeBuffer(sanitized);
            if (fromSanitized && fromSanitized.length > 0) return fromSanitized;
          }
          return await tryDecodeBuffer(u8);
        };
        if (ext === 'svga') {
          const P = await svgaParts(f);
          if (!P) return;

          const findImgKey = (key: string, imgs: Record<string, Uint8Array>) => {
            if (!key || !imgs) return null;
            if (imgs[key]) return key;
            const lower = key.toLowerCase();
            for (const k in imgs) {
              if (k.toLowerCase() === lower) return k;
            }
            const noExt = key.replace(/\.[^.]+$/, '').toLowerCase();
            for (const k in imgs) {
              if (k.replace(/\.[^.]+$/, '').toLowerCase() === noExt) return k;
            }
            return null;
          };

          const validEnts = (P.ents || []).filter((e) => {
            if (!e || !e.key || !P.imgs) return false;
            const matched = findImgKey(e.key, P.imgs);
            if (matched) {
              e.matchedKey = matched;
              return true;
            }
            return false;
          });

          if (
            validEnts.length > 1 ||
            (validEnts.length === 1 && ((validEnts[0].n2 || 0) > 0 || (validEnts[0].n4 || 0) > 0))
          ) {
            const svgaFps = Math.max(1, (S && S.fps) || P.movieFps || 20);
            const animDur = S && S.n ? S.n / svgaFps : P.movieFrames ? P.movieFrames / svgaFps : 3;
            const decodedClips = [];
            let maxEndSec = animDur;
            for (const ent of validEnts) {
              const rawClip = P.imgs[ent.matchedKey || ent.key];
              const clipBuf = await decodeBytes(rawClip, false);
              if (!clipBuf || !clipBuf.length) continue;
              const startSec = Math.max(0, (ent.n2 || 0) / svgaFps);
              const offsetSec = Math.max(0, (ent.n4 || 0) / 1000);
              const endSec =
                ent.n3 && ent.n3 > (ent.n2 || 0)
                  ? ent.n3 / svgaFps
                  : startSec + Math.max(0, clipBuf.duration - offsetSec);
              if (endSec > maxEndSec) maxEndSec = endSec;
              decodedClips.push({ clipBuf, startSec, offsetSec, endSec, key: ent.key, rawClip });
            }
            if (decodedClips.length > 0) {
              if (
                decodedClips.length === 1 &&
                decodedClips[0].startSec === 0 &&
                decodedClips[0].offsetSec === 0
              ) {
                const only = decodedClips[0];
                if (cur !== f) return;
                keep = only.rawClip.slice();
                AU.cur = { name: only.key, buf: only.clipBuf, bytes: keep, mp3: isMp3(keep) };
                setBox();
                if (window.PA) {
                  window.PA.dur = only.clipBuf.duration;
                  window.PA.t = 0;
                }
                const sndEl = $('#snd');
                if (sndEl && sndEl.textContent === 'Muted') sndEl.style.opacity = '1';
                window.PA && window.PA.restart();
                return;
              }
              const masterSr = 48000;
              const totalFrames = Math.max(1, Math.ceil(maxEndSec * masterSr));
              const mixCtx = OAC ? new OAC(2, totalFrames, masterSr) : actx();
              const mixedBuf = mixCtx.createBuffer(2, totalFrames, masterSr);
              for (const c of decodedClips) {
                const dstStart = Math.round(c.startSec * masterSr);
                const srcStart = Math.round(c.offsetSec * (c.clipBuf.sampleRate || masterSr));
                const maxDurSec = Math.max(0, c.endSec - c.startSec);
                const dstCount = Math.min(
                  totalFrames - dstStart,
                  Math.round(maxDurSec * masterSr)
                );
                if (dstCount <= 0) continue;
                for (let ch = 0; ch < 2; ch++) {
                  const srcCh = c.clipBuf.getChannelData(Math.min(ch, c.clipBuf.numberOfChannels - 1));
                  const resampled = resampleChannelFloat32(
                    srcCh,
                    c.clipBuf.sampleRate || masterSr,
                    masterSr,
                    dstCount,
                    1,
                    srcStart
                  );
                  const dstCh = mixedBuf.getChannelData(ch);
                  for (let i = 0; i < dstCount; i++) {
                    const v = dstCh[dstStart + i] + resampled[i];
                    dstCh[dstStart + i] = v > 1 ? 1 : v < -1 ? -1 : v;
                  }
                }
              }
              if (cur !== f) return;
              AU.cur = {
                name: decodedClips.map((c) => c.key).join(' + '),
                buf: mixedBuf,
                bytes: null,
                mp3: false,
              };
              setBox();
              if (window.PA) {
                window.PA.dur = mixedBuf.duration;
                window.PA.t = 0;
              }
              const sndEl = $('#snd');
              if (sndEl && sndEl.textContent === 'Muted') sndEl.style.opacity = '1';
              window.PA && window.PA.restart();
              return;
            }
          }
          if (validEnts.length > 0 && P.imgs[validEnts[0].matchedKey || validEnts[0].key]) {
            const ent = validEnts[0];
            by = P.imgs[ent.matchedKey || ent.key];
            nm = ent.key;
          } else if (P.ents && P.ents.length && P.imgs[P.ents[0].key]) {
            by = P.imgs[P.ents[0].key];
            nm = P.ents[0].key;
          } else if (P.imgs) {
            for (const [k, v] of Object.entries(P.imgs)) {
              if (
                isAudioBin(v) ||
                (/audio|sound|bgm|voice|music|\.(mp3|wav|ogg|m4a|aac)$/i.test(k) &&
                  !(v && v[0] === 0x89 && v[1] === 0x50))
              ) {
                by = v;
                nm = k;
                break;
              }
            }
          }
          keep = by && by.slice();
          if (!by || by.byteLength < 16) return;
          const buf = await decodeBytes(by, false);
          if (cur !== f || !buf || !buf.length) return;
          AU.cur = { name: nm, buf, bytes: keep, mp3: isMp3(keep) };
          setBox();
          if (window.PA) {
            window.PA.dur = buf.duration;
            window.PA.t = 0;
          }
          const sndEl = $('#snd');
          if (sndEl && sndEl.textContent === 'Muted') sndEl.style.opacity = '1';
          window.PA && window.PA.restart();
          return;
        } else if (/^(mp4|mov|webm|vap|yyeva)$/.test(ext) || f.__rawBytes || (S && S.vid)) {
          by = f.__rawBytes ? f.__rawBytes.slice() : new Uint8Array(await f.arrayBuffer());
          let buf = null;
          if (by && by.byteLength >= 16) {
            buf = await decodeBytes(by, true);
          }
          // If OfflineAudioContext/AudioContext decode failed directly on customized MP4 container (e.g. vapc/yyev boxes),
          // fallback to extracting audio buffer via the already decoded media/video element or Audio element
          if (!buf && S && S.vid && S.vid.src) {
            try {
              const resp = await fetch(S.vid.src);
              const blob = await resp.blob();
              const ab = await blob.arrayBuffer();
              buf = await tryDecodeBuffer(new Uint8Array(ab));
            } catch (_) {}
          }
          if (cur !== f || !buf || !buf.length) return;
          AU.cur = { name: nm, buf, bytes: null, mp3: false };
          setBox();
          const sndEl = $('#snd');
          if (sndEl && sndEl.textContent === 'Muted') {
            sndEl.style.opacity = '1';
          }
          window.PA && window.PA.restart();
          return;
        }
      } catch (e) {}
    }
    const _lz = load;
    load = async function (f) {
      stopP();
      Object.assign(AU, { cur: null, add: null, vol: 1, del: false, dirty: false, detectPromise: null });
      window.EDIT = {};
      setBox();
      await _lz(f);
      const p = detect(f);
      AU.detectPromise = p;
      await p;
    };
  })();

  /* Block 11: WebCodecs MP4 + Preview Audio */
  (() => {
    LIBS.defs.Mp4Muxer = [
      'https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.1/build/mp4-muxer.js',
      'https://cdn.jsdelivr.net/npm/mp4-muxer@4.3.0/build/mp4-muxer.js',
    ];
    const C = () => window.__AC || (window.__AC = new (window.AudioContext || window.webkitAudioContext)());
    const PA = (window.PA = {
      on: false,
      t: 0,
      _lastT: 0,
      dur: 0,
      muted: true,
      src: null,
      g: null,
      t0: 0,
      pos() {
        return this.on ? C().currentTime - this.t0 : 0;
      },
      stop() {
        if (this.src) {
          try {
            this.src.stop();
          } catch (e) {}
          this.src = null;
        }
        this.on = false;
      },
      start(off) {
        this.stop();
        const a = window.finalAudio && window.finalAudio();
        if (!a || !a.buf || !a.buf.duration) return;
        const c = C(),
          s = c.createBufferSource(),
          g = c.createGain();
        this.dur = a.buf.duration;
        const safeOff = Math.max(0, (off || 0) % a.buf.duration);
        s.buffer = a.buf;
        const animDur = S && S.n && S.fps ? S.n / S.fps : a.buf.duration;
        const isMatchingLoop = Math.abs(a.buf.duration - animDur) < 0.45;
        s.loop = isMatchingLoop;
        if (s.loop) {
          s.loopStart = 0;
          s.loopEnd = a.buf.duration;
        }
        g.gain.value = this.muted ? 0 : a.vol;
        s.connect(g);
        g.connect(c.destination);
        s.onended = () => {
          if (this.src === s) {
            this.src = null;
            this.on = false;
          }
        };
        s.start(0, safeOff);
        this.src = s;
        this.g = g;
        this.t0 = c.currentTime - safeOff;
        this._lastT = safeOff;
        this.on = true;
        if (c.state !== 'running') c.resume().catch(() => {});
      },
      restart() {
        if (!(window.finalAudio && window.finalAudio()) || !S || S.paused) return this.stop();
        this.start(this.t || 0);
      },
      sync(t, isManualSeek = false) {
        const prevT = this._lastT || 0;
        this.t = t;
        this._lastT = t;
        if (!this.dur || C().state !== 'running' || this.muted) return;

        // If user explicitly scrubbed the timeline slider
        if (isManualSeek) {
          this.start(t);
          return;
        }

        // If audio is not currently playing, start it smoothly
        if (!this.on) {
          if (t < this.dur - 0.05) this.start(t);
          return;
        }

        // Only on actual animation loop back to frame 0 (large backwards jump)
        if (t < prevT - 1.2 && t < 0.6) {
          if (!this.src || !this.src.loop) {
            this.start(t);
          }
        }
      },
    });
    ['pointerdown', 'keydown', 'touchstart'].forEach((e) =>
      addEventListener(
        e,
        () => {
          const c = C();
          if (c.state !== 'running') c.resume().catch(() => {});
        },
        true
      )
    );
    (function pump() {
      if (S && S.vid) {
        if (!S.vid.paused) PA.sync(S.vid.currentTime);
        else PA.t = S.vid.currentTime;
      }
      requestAnimationFrame(pump);
    })();
    document.getElementById('aoe').addEventListener('click', () => setTimeout(() => PA.restart(), 0));
    const sndBtn = $('#snd');
    if (sndBtn) sndBtn.textContent = 'Muted';
    $('#snd').onclick = async function () {
      const c = C();
      if (c && c.state !== 'running') {
        try {
          await c.resume();
        } catch (_) {}
      }
      if (AU.detectPromise) {
        try {
          await AU.detectPromise;
        } catch (_) {}
      }
      const a = window.finalAudio && window.finalAudio();
      if (!a || !a.buf) {
        return toast('No audio track detected in this file');
      }
      PA.muted = !PA.muted;
      if (PA.g) {
        PA.g.gain.value = PA.muted ? 0 : a.vol;
      }
      this.textContent = PA.muted ? 'Muted' : 'Sound';
      if (!PA.muted) {
        let curTime = 0;
        if (S && S.vid) {
          curTime = S.vid.currentTime || 0;
        } else if (window.SVP && typeof window.SVP.currentFrame === 'number') {
          const fps = (S && S.fps) || 20;
          curTime = (window.SVP.currentFrame || 0) / fps;
        } else {
          curTime = PA.t || 0;
        }
        PA.start(curTime);
      } else {
        PA.stop();
      }
    };
    const _pp = $('#pp').onclick;
    $('#pp').onclick = function () {
      _pp.call(this);
      if (S && S.paused) PA.stop();
      else if (!PA.muted) {
        let curTime = 0;
        if (S && S.vid) curTime = S.vid.currentTime || 0;
        else if (window.SVP && typeof window.SVP.currentFrame === 'number') {
          curTime = (window.SVP.currentFrame || 0) / ((S && S.fps) || 20);
        } else curTime = PA.t || 0;
        PA.start(curTime);
      }
    };
    const _lp = load;
    load = async function (f) {
      PA.stop();
      PA.t = 0;
      PA.muted = true;
      const sb = $('#snd');
      if (sb) sb.textContent = 'Muted';
      await _lp(f);
    };
    const prev2 = $('#start').onclick;
    $('#start').onclick = async () => {
      const F = $('#fmt').value;
      PA.stop();
      if (F === 'orig' && window.AU && window.AU.dirty && cur && S) {
        const k = S.meta ? S.meta.kind.toLowerCase() : cur.name.split('.').pop().toLowerCase();
        if (/^(vap|yyeva|mp4|mov|webm)$/.test(k)) $('#fmt').value = k;
      }
      try {
        await prev2();
      } finally {
        $('#fmt').value = F;
        PA.restart();
      }
    };
  })();

  /* Block 12: Reliable MP4 export, standard YYEVA metadata, portable projects (v12.0-fixed) */
  (() => {
    const te = new TextEncoder(),
      td = new TextDecoder();
    const status = (s) => {
      const el = $('#exportStatus');
      if (el) el.textContent = s;
    };
    const timed = (p, ms, label) => {
      let t;
      return Promise.race([
        p,
        new Promise((_, r) => {
          t = setTimeout(() => r(Error(label + ' timed out')), ms);
        }),
      ]).finally(() => clearTimeout(t));
    };
    async function compressed(u, decompress = false) {
      const C = decompress ? window.DecompressionStream : window.CompressionStream;
      if (C)
        return new Uint8Array(
          await new Response(new Blob([u]).stream().pipeThrough(new C('deflate'))).arrayBuffer()
        );
      await getLib('pako');
      if (!window.pako) throw Error('Zlib support is unavailable');
      return decompress ? pako.inflate(u) : pako.deflate(u);
    }
    async function readMediaMeta(u) {
      const syncMeta = detectVapYyevaSequentialSync(u);
      if (syncMeta) return syncMeta;

      let top = [];
      try {
        top = boxes(u);
      } catch (_) {}
      for (const b of top) {
        if (b.type === 'vapc' || b.type === 'yyev' || b.type === 'yyeva') {
          const slice = u.subarray(b.start + b.header, b.end);
          const kind = b.type === 'vapc' ? 'VAP' : 'YYEVA';
          const direct = metaFromAnyObject(parseJsonSlice(slice), kind);
          if (direct) return direct;
          try {
            const inflated = await compressed(slice, true);
            const fromInflated = metaFromAnyObject(parseJsonSlice(inflated), kind);
            if (fromInflated) return fromInflated;
          } catch (_) {}
        }
      }
      const begin = 'yyeffectmp4json[[',
        end = ']]yyeffectmp4json',
        i = bidx(u, begin);
      if (i >= 0) {
        const e = bidx(u, end, i + begin.length);
        if (e > i) {
          try {
            const s = td.decode(u.subarray(i + begin.length, e)).trim(),
              text = s.startsWith('{') ? s : td.decode(await compressed(unbase64(s), true));
            const m = metaFromAnyObject(parseJsonSlice(te.encode(text)), 'YYEVA');
            if (m) return m;
          } catch (_) {}
        }
      }
      return null;
    }
    afterFtyp = async function (blob, bx) {
      const u = new Uint8Array(await blob.arrayBuffer()),
        top = boxes(u),
        f = top[0];
      if (!f || f.type !== 'ftyp') throw Error('Encoder did not produce MP4');
      if (top.some((b) => b.type === 'moof')) throw Error('Fragmented MP4 cannot be repackaged as VAP');
      const cut = f.end,
        v = new DataView(u.buffer, u.byteOffset, u.byteLength);
      function walk(s, e) {
        for (const b of boxes(u, s, e)) {
          if (['moov', 'trak', 'mdia', 'minf', 'stbl'].includes(b.type)) walk(b.start + b.header, b.end);
          if (b.type !== 'stco' && b.type !== 'co64') continue;
          const p = b.start + b.header,
            step = b.type === 'co64' ? 8 : 4;
          if (p + 8 > b.end) throw Error('Incomplete chunk table');
          const n = v.getUint32(p + 4);
          if (p + 8 + n * step > b.end) throw Error('Invalid chunk table');
          for (let i = 0; i < n; i++) {
            const off = p + 8 + i * step;
            if (step === 8) {
              const old = v.getBigUint64(off);
              if (old >= BigInt(cut)) v.setBigUint64(off, old + BigInt(bx.length));
            } else {
              const old = v.getUint32(off);
              if (old >= cut) {
                if (old + bx.length > 0xffffffff) throw Error('MP4 offset overflow');
                v.setUint32(off, old + bx.length);
              }
            }
          }
        }
      }
      walk(0, u.length);
      return new Blob([u.subarray(0, cut), bx, u.subarray(cut)], { type: 'video/mp4' });
    };
    async function packageVideo(blob, format, meta) {
      if (format === 'vap') return afterFtyp(blob, box('vapc', te.encode(JSON.stringify(meta))));
      const payload = base64(await compressed(te.encode(JSON.stringify(meta))));
      return new Blob(
        [blob, box('free', te.encode('yyeffectmp4json[[' + payload + ']]yyeffectmp4json'))],
        { type: 'video/mp4' }
      );
    }
    async function seekVideo(m, t) {
      const dur = Number.isFinite(m.duration) && m.duration > 0 ? m.duration : 0;
      t = dur > 0.002 ? Math.max(0, Math.min(t, dur - 0.001)) : Math.max(0, t);
      if (!m.seeking && Math.abs(m.currentTime - t) < 0.0005 && m.readyState >= 2) return;
      await new Promise((resolve, reject) => {
        let settled = false;
        const clean = () => {
            clearTimeout(timer);
            m.removeEventListener('seeked', checkReady);
            m.removeEventListener('canplay', checkReady);
            m.removeEventListener('loadeddata', checkReady);
            m.removeEventListener('error', fail);
          },
          finish = () => {
            if (settled) return;
            settled = true;
            clean();
            resolve();
          },
          checkReady = () => {
            if (!m.seeking && m.readyState >= 2) finish();
          },
          fail = () => {
            if (settled) return;
            settled = true;
            clean();
            reject(Error('Video frame decode failed'));
          },
          timer = setTimeout(() => {
            finish();
          }, 5000);
        m.addEventListener('seeked', checkReady);
        m.addEventListener('canplay', checkReady);
        m.addEventListener('loadeddata', checkReady);
        m.addEventListener('error', fail);
        try {
          m.currentTime = t;
          if (!m.seeking && m.readyState >= 2 && Math.abs(m.currentTime - t) < 0.001) {
            finish();
          }
        } catch (e) {
          clean();
          reject(e);
        }
      });
      await new Promise((r) => {
        let done = false;
        const fin = () => {
          if (!done) {
            done = true;
            r();
          }
        };
        requestAnimationFrame(fin);
        setTimeout(fin, 14);
      });
    }
    function ensureAlphaPreviewCanvas(source, m) {
      let cv = source._alphaCanvas;
      const [cw, ch] = getHiResCanvasDims(source.w, source.h);
      if (!cv || !cv.isConnected) {
        cv = mk(cw, ch);
        cv.style.background = 'transparent';
        const bgMeta2 = (window as any).__getGiftBg?.();
        if (bgMeta2) (window as any).__applyGiftBg?.(bgMeta2.val, bgMeta2.type === 'image');
        source._alphaCanvas = cv;
        $('#view').appendChild(cv);
        const x = cv.getContext('2d');
        (function paint() {
          if (source !== S || !cv.isConnected) return;
          if (!window.__busy && m.readyState >= 2 && source.meta) {
            x.clearRect(0, 0, cv.width, cv.height);
            vapDraw(x, cv.width, cv.height, m, source.meta);
          }
          requestAnimationFrame(paint);
        })();
      } else {
        cv.width = cw;
        cv.height = ch;
      }
      cv.style.display = '';
      m.style.cssText =
        'position:absolute;width:2px;height:2px;opacity:0.001;pointer-events:none;left:0;top:0;z-index:-1';
    }
    function buildVapMaskSilhouetteDataUrl(m: HTMLVideoElement, slot: any): string {
      const w = Math.max(1, Number(slot.w) || 100);
      const h = Math.max(1, Number(slot.h) || 100);
      const c = mk(w, h);
      const x = c.getContext('2d', { willReadFrequently: true })!;
      const mf = slot.defaultMFrame;
      if (mf && mf[2] > 0 && mf[3] > 0 && m.readyState >= 2) {
        try {
          x.drawImage(m, mf[0], mf[1], mf[2], mf[3], 0, 0, w, h);
          const raw = x.getImageData(0, 0, w, h);
          const tint: [number, number, number] = slot.isTextSlot ? [56, 189, 248] : [192, 132, 252];
          const rgba = extractMaskPreviewRgba(raw.data, w, h, tint);
          x.putImageData(new ImageData(rgba, w, h), 0, 0);
        } catch (_) {}
      } else {
        x.fillStyle = slot.isTextSlot ? 'rgba(56, 189, 248, 0.35)' : 'rgba(192, 132, 252, 0.35)';
        if (slot.isTextSlot) {
          x.fillRect(2, 2, Math.max(2, w - 4), Math.max(2, h - 4));
        } else {
          x.beginPath();
          x.arc(w / 2, h / 2, Math.min(w, h) / 2 - 2, 0, Math.PI * 2);
          x.fill();
        }
      }
      // Draw subtle label inside silhouette preview so user recognizes the mask slot in #assets
      x.save();
      x.strokeStyle = slot.isTextSlot ? 'rgba(56, 189, 248, 0.85)' : 'rgba(192, 132, 252, 0.85)';
      x.lineWidth = 2;
      x.strokeRect(1, 1, Math.max(1, w - 2), Math.max(1, h - 2));
      const fsz = Math.max(10, Math.min(18, Math.round(Math.min(w, h) * 0.24)));
      x.font = `bold ${fsz}px system-ui, sans-serif`;
      x.fillStyle = '#ffffff';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.shadowColor = 'rgba(0,0,0,0.85)';
      x.shadowBlur = 4;
      x.fillText(slot.isTextSlot ? `نص: ${slot.srcTag}` : `صورة: ${slot.srcTag}`, w / 2, h / 2);
      x.restore();
      return c.toDataURL('image/png');
    }

    function renderTextSlotCanvas(slot: any, text: string, color: string, fontSize?: number, bgColor?: string): HTMLCanvasElement {
      const w = Math.max(1, Number(slot.w) || 234);
      const h = Math.max(1, Number(slot.h) || 54);
      const c = mk(w, h);
      const x = c.getContext('2d')!;
      x.clearRect(0, 0, w, h);
      if (bgColor && bgColor !== 'transparent') {
        x.fillStyle = bgColor;
        x.fillRect(0, 0, w, h);
      }
      const fsz = fontSize || Math.max(14, Math.round(h * 0.5));
      x.font = `bold ${fsz}px "Cairo", "Tajawal", system-ui, -apple-system, sans-serif`;
      x.fillStyle = color || slot.color || '#ffffff';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(text, w / 2, h / 2);
      return c;
    }

    function repaintVapStageNow(source: any) {
      if (source?.vid && source?._alphaCanvas && source?.meta) {
        const x = source._alphaCanvas.getContext('2d');
        if (x) {
          x.clearRect(0, 0, source._alphaCanvas.width, source._alphaCanvas.height);
          vapDraw(x, source._alphaCanvas.width, source._alphaCanvas.height, source.vid, source.meta);
        }
      }
    }

    function setupVapDynamicMasksUI(source: any, m: HTMLVideoElement, clamped: any) {
      const panel = document.getElementById('vapDynamicMasksPanel');
      for (const k in A) delete A[k];
      source._vapSlotReplacements = source._vapSlotReplacements || {};
      source._vapOrigSilhouettes = source._vapOrigSilhouettes || {};

      const slots = clamped?.dynamicSlots || [];
      if (!slots.length) {
        if (panel) {
          panel.style.display = 'none';
          panel.innerHTML = '';
        }
        renderAssetCards(($('#q') as HTMLInputElement)?.value || '');
        return;
      }

      for (const slot of slots) {
        const silUrl = buildVapMaskSilhouetteDataUrl(m, slot);
        source._vapOrigSilhouettes[slot.srcId] = silUrl;
        const rep = source._vapSlotReplacements[slot.srcId];
        A[slot.assetKey] = rep && rep.active && rep.dataUrl ? rep.dataUrl : silUrl;
      }
      renderAssetCards(($('#q') as HTMLInputElement)?.value || '');

      if (m && m.readyState < 2 && !source._vapSilhouetteWaitHooked) {
        source._vapSilhouetteWaitHooked = true;
        const refreshSilhouettes = () => {
          m.removeEventListener('loadeddata', refreshSilhouettes);
          m.removeEventListener('canplay', refreshSilhouettes);
          if (source !== S || m.readyState < 2) return;
          for (const slot of slots) {
            const silUrl = buildVapMaskSilhouetteDataUrl(m, slot);
            source._vapOrigSilhouettes[slot.srcId] = silUrl;
            const rep = source._vapSlotReplacements[slot.srcId];
            if (!rep || !rep.active) {
              A[slot.assetKey] = silUrl;
              const thumbEl = document.querySelector(`#vapDynamicMasksPanel [data-vap-thumb="${slot.srcId}"]`) as HTMLImageElement | null;
              if (thumbEl) thumbEl.src = silUrl;
            }
          }
          renderAssetCards(($('#q') as HTMLInputElement)?.value || '');
        };
        m.addEventListener('loadeddata', refreshSilhouettes);
        m.addEventListener('canplay', refreshSilhouettes);
      }

      if (!panel) return;
      panel.style.display = 'block';
      const guidesOn = Boolean((window as any).__vapShowMaskGuides);

      panel.innerHTML = `
        <div style="
          background: linear-gradient(145deg, rgba(26, 22, 43, 0.96), rgba(16, 16, 26, 0.98));
          border: 1px solid rgba(168, 85, 247, 0.45);
          border-radius: 12px;
          padding: 10px;
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
        ">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:8px;">
            <div>
              <div style="font-size:12px;font-weight:800;color:#e9d5ff;display:flex;align-items:center;gap:5px;">
                <span>🎭 أقنعة وطبقات الملف القابلة للاستبدال</span>
                <span style="background:rgba(168,85,247,0.25);color:#d8b4fe;padding:1px 6px;border-radius:6px;font-size:10px;">${slots.length}</span>
              </div>
              <div style="font-size:10px;color:#9ca3af;margin-top:2px;">
                تم التعرف تلقائياً على قناع الصورة وقناع الاسم داخل ملف ${clamped.kind}
              </div>
            </div>
            <button type="button" id="vapToggleMaskGuidesBtn" style="
              padding: 4px 8px;
              font-size: 10px;
              font-weight: 700;
              border-radius: 7px;
              cursor: pointer;
              border: 1px solid ${guidesOn ? '#38bdf8' : '#3b3b54'};
              background: ${guidesOn ? 'rgba(56, 189, 248, 0.2)' : '#1e1e2e'};
              color: ${guidesOn ? '#7dd3fc' : '#cbd5e1'};
              white-space: nowrap;
            " title="إظهار أو إخفاء حدود ومكان الأقنعة على شاشة العرض">
              ${guidesOn ? '👁️ إخفاء الحدود' : '👁️ إظهار مكان الأقنعة'}
            </button>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${slots
              .map((slot: any) => {
                const rep = source._vapSlotReplacements[slot.srcId] || {};
                const isActive = Boolean(rep.active);
                const thumbSrc = A[slot.assetKey] || '';
                const isTxt = Boolean(slot.isTextSlot);
                const typeBadgeLabel = isTxt ? 'قناع نص / اسم (Text Mask)' : 'قناع صورة / طبقة (Image Mask)';
                const typeBadgeColor = isTxt ? '#38bdf8' : '#c084fc';
                const fitMode = rep.fitMode || slot.fitType || 'fitXY';
                const useMask = rep.useMask !== false;
                return `
                  <div data-vap-slot-card="${slot.srcId}" style="
                    background: rgba(15, 15, 23, 0.9);
                    border: 1px solid ${isTxt ? 'rgba(56, 189, 248, 0.35)' : 'rgba(192, 132, 252, 0.35)'};
                    border-radius: 10px;
                    padding: 8px;
                    display: flex;
                    flex-direction: column;
                    gap: 7px;
                  ">
                    <div style="display:flex;align-items:center;gap:8px;">
                      <div style="
                        width: 46px;
                        height: 46px;
                        border-radius: 8px;
                        overflow: hidden;
                        flex-shrink: 0;
                        border: 1px solid rgba(255,255,255,0.12);
                        background: repeating-conic-gradient(#232334 0 25%, #171723 0 50%) 0 0 / 10px 10px;
                        display: grid;
                        place-items: center;
                      ">
                        <img data-vap-thumb="${slot.srcId}" src="${thumbSrc}" alt="${slot.srcTag}" style="max-width:100%;max-height:100%;object-fit:contain;" />
                      </div>
                      <div style="flex:1;min-width:0;">
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:4px;">
                          <span style="font-size:12px;font-weight:800;color:#f3f4f6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                            ${isTxt ? '🏷️ قناع الاسم:' : '🖼️ قناع الصورة:'} <code style="color:${typeBadgeColor};">${slot.srcTag}</code>
                          </span>
                          <span data-vap-status="${slot.srcId}" style="
                            font-size:9px;
                            padding:1px 6px;
                            border-radius:5px;
                            font-weight:700;
                            background:${isActive ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.08)'};
                            color:${isActive ? '#34d399' : '#9ca3af'};
                          ">${isActive ? '✓ تم الاستبدال' : 'بدون طبقة'}</span>
                        </div>
                        <div style="font-size:10px;color:${typeBadgeColor};margin-top:1px;font-weight:600;">
                          ${typeBadgeLabel} · ${slot.w}×${slot.h}px
                        </div>
                      </div>
                    </div>

                    ${
                      isTxt
                        ? `
                      <div style="display:flex;gap:4px;align-items:center;">
                        <input
                          type="text"
                          data-vap-txt-input="${slot.srcId}"
                          placeholder="اكتب الاسم أو النص هنا..."
                          value="${rep.text ? String(rep.text).replace(/"/g, '&quot;') : ''}"
                          style="
                            flex:1;
                            min-width:0;
                            padding:5px 7px;
                            font-size:11px;
                            border-radius:6px;
                            border:1px solid #2e2e42;
                            background:#141420;
                            color:#fff;
                          "
                        />
                        <input
                          type="color"
                          data-vap-txt-color="${slot.srcId}"
                          value="${rep.textColor || slot.color || '#ffffff'}"
                          title="لون النص"
                          style="width:26px;height:26px;padding:0;border:1px solid #2e2e42;border-radius:6px;background:transparent;cursor:pointer;flex-shrink:0;"
                        />
                        <button
                          type="button"
                          data-vap-txt-apply="${slot.srcId}"
                          style="
                            padding:5px 9px;
                            font-size:11px;
                            font-weight:700;
                            border-radius:6px;
                            border:1px solid rgba(56, 189, 248, 0.5);
                            background:rgba(14, 165, 233, 0.25);
                            color:#bae6fd;
                            cursor:pointer;
                            white-space:nowrap;
                          "
                        >تطبيق الاسم</button>
                      </div>
                    `
                        : ''
                    }

                    <div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;">
                      <button
                        type="button"
                        data-vap-upload-btn="${slot.srcId}"
                        style="
                          flex:1;
                          padding:5px 8px;
                          font-size:10.5px;
                          font-weight:700;
                          border-radius:6px;
                          border:1px solid rgba(168, 85, 247, 0.5);
                          background:rgba(139, 92, 246, 0.22);
                          color:#e9d5ff;
                          cursor:pointer;
                          white-space:nowrap;
                        "
                      >📁 استبدال بطبقة / صورة</button>
                      <button
                        type="button"
                        data-vap-edit-btn="${slot.srcId}"
                        style="
                          padding:5px 8px;
                          font-size:10.5px;
                          font-weight:700;
                          border-radius:6px;
                          border:1px solid #323248;
                          background:#1c1c2b;
                          color:#d1d5db;
                          cursor:pointer;
                          white-space:nowrap;
                        "
                        title="فتح محرر الصور والنصوص المتقدم"
                      >✎ محرر</button>
                      <button
                        type="button"
                        data-vap-reset-btn="${slot.srcId}"
                        style="
                          padding:5px 7px;
                          font-size:10.5px;
                          font-weight:700;
                          border-radius:6px;
                          border:1px solid rgba(239, 68, 68, 0.35);
                          background:rgba(239, 68, 68, 0.12);
                          color:#fca5a5;
                          cursor:pointer;
                        "
                        title="إفراغ القناع واستعادة حالته الأصلية"
                      >↺</button>
                    </div>

                    <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;padding-top:3px;border-top:1px solid rgba(255,255,255,0.06);font-size:10px;color:#9ca3af;">
                      <label style="display:flex;align-items:center;gap:4px;cursor:pointer;" title="تطبيق قناع الشفافية المتحرك (mFrame) الخاص بالملف على الطبقة المستبدلة">
                        <input type="checkbox" data-vap-mask-toggle="${slot.srcId}" ${useMask ? 'checked' : ''} />
                        <span>قص القناع (mFrame)</span>
                      </label>
                      <select
                        data-vap-fit-select="${slot.srcId}"
                        style="padding:2px 5px;font-size:10px;border-radius:5px;background:#161622;border:1px solid #2d2d42;color:#e5e7eb;"
                        title="طريقة ملاءمة الطبقة داخل القناع"
                      >
                        <option value="cover" ${fitMode === 'cover' ? 'selected' : ''}>تغطية (Cover)</option>
                        <option value="contain" ${fitMode === 'contain' ? 'selected' : ''}>احتواء (Contain)</option>
                        <option value="fitXY" ${fitMode === 'fitXY' || fitMode === 'stretch' ? 'selected' : ''}>تمدد كامل (FitXY)</option>
                      </select>
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>
        </div>
      `;

      const guideBtn = document.getElementById('vapToggleMaskGuidesBtn');
      if (guideBtn) {
        guideBtn.onclick = () => {
          (window as any).__vapShowMaskGuides = !(window as any).__vapShowMaskGuides;
          setupVapDynamicMasksUI(source, m, clamped);
          repaintVapStageNow(source);
        };
      }

      slots.forEach((slot: any) => {
        const uploadBtn = panel.querySelector(`[data-vap-upload-btn="${slot.srcId}"]`) as HTMLButtonElement | null;
        if (uploadBtn) {
          uploadBtn.onclick = () => {
            const inp = document.createElement('input');
            inp.type = 'file';
            inp.accept = 'image/*';
            inp.onchange = async () => {
              const file = inp.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = async () => {
                const dataUrl = String(reader.result || '');
                if (!dataUrl) return;
                A[slot.assetKey] = dataUrl;
                const thImg = document.querySelector(`.th[data-k="${slot.assetKey}"] img`) as HTMLImageElement | null;
                if (thImg) thImg.src = dataUrl;
                const prev = source._vapSlotReplacements[slot.srcId] || {};
                // Default image uploads to 'cover' for circular/avatar masks unless user explicitly set it
                if (!prev.fitMode && !slot.isTextSlot) {
                  prev.fitMode = 'cover';
                }
                source._vapSlotReplacements[slot.srcId] = prev;
                await applyEdit(dataUrl, slot.assetKey);
                toast(`تم استبدال القناع "${slot.srcTag}" بالطبقة الجديدة`);
              };
              reader.readAsDataURL(file);
            };
            inp.click();
          };
        }

        const editBtn = panel.querySelector(`[data-vap-edit-btn="${slot.srcId}"]`) as HTMLButtonElement | null;
        if (editBtn) {
          editBtn.onclick = () => openEdit(slot.assetKey);
        }

        const resetBtn = panel.querySelector(`[data-vap-reset-btn="${slot.srcId}"]`) as HTMLButtonElement | null;
        if (resetBtn) {
          resetBtn.onclick = () => {
            delete source._vapSlotReplacements[slot.srcId];
            if (window.EDIT) delete window.EDIT[slot.assetKey];
            const silUrl = source._vapOrigSilhouettes?.[slot.srcId] || buildVapMaskSilhouetteDataUrl(m, slot);
            A[slot.assetKey] = silUrl;
            renderAssetCards(($('#q') as HTMLInputElement)?.value || '');
            setupVapDynamicMasksUI(source, m, clamped);
            repaintVapStageNow(source);
            toast(`تمت استعادة القناع "${slot.srcTag}" لحالته الأصلية`);
          };
        }

        const txtApplyBtn = panel.querySelector(`[data-vap-txt-apply="${slot.srcId}"]`) as HTMLButtonElement | null;
        const txtInput = panel.querySelector(`[data-vap-txt-input="${slot.srcId}"]`) as HTMLInputElement | null;
        const txtColor = panel.querySelector(`[data-vap-txt-color="${slot.srcId}"]`) as HTMLInputElement | null;
        const applyQuickText = async () => {
          const val = (txtInput?.value || '').trim();
          if (!val) {
            toast('اكتب الاسم أو النص أولاً');
            return;
          }
          const col = txtColor?.value || slot.color || '#ffffff';
          const c = renderTextSlotCanvas(slot, val, col);
          const dataUrl = c.toDataURL('image/png');
          const prev = source._vapSlotReplacements[slot.srcId] || {};
          source._vapSlotReplacements[slot.srcId] = {
            ...prev,
            text: val,
            textColor: col,
            fitMode: prev.fitMode || 'contain',
            useMask: prev.useMask !== false,
          };
          A[slot.assetKey] = dataUrl;
          const thImg = document.querySelector(`.th[data-k="${slot.assetKey}"] img`) as HTMLImageElement | null;
          if (thImg) thImg.src = dataUrl;
          await applyEdit(dataUrl, slot.assetKey);
          toast(`تم وضع الاسم "${val}" داخل قناع ${slot.srcTag}`);
        };
        if (txtApplyBtn) txtApplyBtn.onclick = applyQuickText;
        if (txtInput) {
          txtInput.onkeydown = (ev) => {
            if (ev.key === 'Enter') {
              ev.preventDefault();
              applyQuickText();
            }
          };
        }

        const maskToggle = panel.querySelector(`[data-vap-mask-toggle="${slot.srcId}"]`) as HTMLInputElement | null;
        if (maskToggle) {
          maskToggle.onchange = () => {
            const prev = source._vapSlotReplacements[slot.srcId] || {};
            prev.useMask = maskToggle.checked;
            source._vapSlotReplacements[slot.srcId] = prev;
            repaintVapStageNow(source);
          };
        }

        const fitSelect = panel.querySelector(`[data-vap-fit-select="${slot.srcId}"]`) as HTMLSelectElement | null;
        if (fitSelect) {
          fitSelect.onchange = () => {
            const prev = source._vapSlotReplacements[slot.srcId] || {};
            prev.fitMode = fitSelect.value;
            source._vapSlotReplacements[slot.srcId] = prev;
            repaintVapStageNow(source);
          };
        }
      });
    }

    function applyVideoMetaAndLayout(source, m, f, meta) {
      if (!meta) {
        source.meta = null;
        source.w = m.videoWidth;
        source.h = m.videoHeight;
        if (source._alphaCanvas) source._alphaCanvas.style.display = 'none';
        m.style.cssText = '';
        const panel = document.getElementById('vapDynamicMasksPanel');
        if (panel) {
          panel.style.display = 'none';
          panel.innerHTML = '';
        }
        info({
          Format: f.name.split('.').pop().toUpperCase(),
          Resolution: source.w + ' × ' + source.h,
          Duration: m.duration.toFixed(2) + ' S',
          'File Size': kb(f.size),
          'File Name': f.name,
        });
        fin();
        return;
      }
      const clamped = clampMetaToVideoBounds(meta, m.videoWidth, m.videoHeight);
      const side = clamped.alphaLayout || inferAlphaSideFromRects(clamped.a, clamped.c);
      $('#lay').value = side;
      Object.assign(source, {
        meta: clamped,
        w: clamped.c[2],
        h: clamped.c[3],
        fps: clamped.fps || source.fps,
      });
      source.n = clamped.frames || Math.max(1, Math.round(m.duration * source.fps));
      source.set = (i) => seekVideo(m, (i + 0.5) / source.fps);
      ensureAlphaPreviewCanvas(source, m);
      setupVapDynamicMasksUI(source, m, clamped);
      const infoObj: Record<string, any> = {
        Format: clamped.kind,
        'Alpha Layout': side === 'r' ? 'Alpha on right (Auto)' : 'Alpha on left (Auto)',
        Resolution: source.w + ' × ' + source.h,
        'Video Size': m.videoWidth + ' × ' + m.videoHeight,
        'Frame Rate': source.fps + ' FPS',
        Duration: m.duration.toFixed(2) + ' S',
        'File Size': kb(f.size),
        'File Name': f.name,
      };
      if (clamped.dynamicSlots && clamped.dynamicSlots.length > 0) {
        infoObj['Dynamic Masks'] = clamped.dynamicSlots
          .map((s: any) => `${s.srcTag} (${s.srcType === 'txt' ? 'Text' : 'Image'} ${s.w}×${s.h})`)
          .join(' + ');
      }
      info(infoObj);
      fin();
    }
    $('#lay').onchange = () => {
      if (!S || !S.vid || !cur) return;
      const L = LY(),
        m = S.vid,
        vw = m.videoWidth,
        vh = m.videoHeight,
        hw = Math.max(2, Math.floor(vw / 2));
      if (L === 'n') {
        applyVideoMetaAndLayout(S, m, cur, null);
      } else {
        const det = S._detectedMeta;
        const detSide = det ? det.alphaLayout || inferAlphaSideFromRects(det.a, det.c) : null;
        const nextMeta =
          det && detSide === L
            ? det
            : {
                kind: det?.kind || (/\.vap$/i.test(cur.name) ? 'VAP' : 'YYEVA'),
                c: L === 'r' ? [0, 0, hw, vh] : [hw, 0, hw, vh],
                a: L === 'r' ? [hw, 0, hw, vh] : [0, 0, hw, vh],
                fps: S.fps,
                frames: S.n,
                alphaLayout: L,
              };
        applyVideoMetaAndLayout(S, m, cur, nextMeta);
      }
    };
    vapDetect = async function (f) {
      const source = S,
        m = source && source.vid;
      if (!m) return;
      const raw = f.__rawBytes || new Uint8Array(await f.arrayBuffer());
      let meta = f.__zipMeta || (await readMediaMeta(raw));
      if (source !== S) return;

      if (!meta && m.videoWidth >= 4 && m.videoHeight >= 4) {
        const ext = f.name.split('.').pop().toLowerCase();
        const ac = mk(m.videoWidth, m.videoHeight),
          ax = ac.getContext('2d', { willReadFrequently: true });
        const origTime = m.currentTime || 0;
        const wasPaused = m.paused;
        const dur = Number.isFinite(m.duration) && m.duration > 0 ? m.duration : 1;
        const sampleTimes = [
          origTime > 0 ? origTime : Math.min(0.12, dur * 0.2),
          Math.min(0.35, dur * 0.45),
          Math.min(0.75, dur * 0.7),
        ];
        for (const t of sampleTimes) {
          if (source !== S) return;
          try {
            if (m.readyState < 2 || Math.abs(m.currentTime - t) > 0.05) {
              await Promise.race([seekVideo(m, t), sleep(450)]);
            }
            if (m.readyState >= 2) {
              ax.clearRect(0, 0, ac.width, ac.height);
              ax.drawImage(m, 0, 0, ac.width, ac.height);
              const imgData = ax.getImageData(0, 0, ac.width, ac.height);
              const res = detectAlphaLayoutFromRgbaFrame(
                imgData.data,
                ac.width,
                ac.height,
                ext
              );
              if (res.layout !== 'n' && res.meta) {
                meta = res.meta;
                break;
              }
            }
          } catch (_) {}
        }
        try {
          if (Math.abs(m.currentTime - origTime) > 0.05) {
            m.currentTime = origTime;
          }
          if (!wasPaused && !source.paused) m.play().catch(() => {});
        } catch (_) {}
      }

      if (!meta || source !== S) return;
      source._detectedMeta = meta;
      applyVideoMetaAndLayout(source, m, f, meta);
    };
    let lastURL = null;
    dlBar = window.dlBar = function (message, blob, name) {
      let el = $('#dlbar');
      if (!el) {
        el = document.createElement('div');
        el.id = 'dlbar';
        el.style.cssText =
          'position:fixed;left:50%;transform:translateX(-50%);bottom:24px;z-index:99;background:#14141c;border:1px solid var(--ac);padding:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;max-width:92vw;overflow-wrap:anywhere';
        document.body.appendChild(el);
      }
      if (lastURL) {
        URL.revokeObjectURL(lastURL);
        lastURL = null;
      }
      el.replaceChildren();
      const span = document.createElement('span');
      span.textContent = message;
      el.appendChild(span);
      if (blob) {
        lastURL = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = lastURL;
        a.download = name;
        a.className = 'pill';
        a.textContent = 'Download file';
        el.appendChild(a);
        const save = document.createElement('button');
        save.className = 'pill';
        save.textContent = 'Save as…';
        save.onclick = async () => {
          try {
            if (!window.showSaveFilePicker) {
              a.click();
              return;
            }
            const handle = await window.showSaveFilePicker({ suggestedName: name }),
              w = await handle.createWritable();
            await w.write(blob);
            await w.close();
            toast('Saved ' + name);
          } catch (e) {
            if (e.name !== 'AbortError') toast('Save as unavailable. Use Download file.');
          }
        };
        el.appendChild(save);
      }
      const close = document.createElement('button');
      close.className = 'pill';
      close.textContent = '✕';
      close.onclick = () => {
        if (lastURL) URL.revokeObjectURL(lastURL);
        lastURL = null;
        el.remove();
      };
      el.appendChild(close);
    };
    dl0 = async function (blob, name) {
      if (!(blob instanceof Blob) || !blob.size) throw Error('Exporter returned an empty file');
      const a = document.createElement('a'),
        url = URL.createObjectURL(blob);
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      toast('Download requested: ' + name);
    };
    dl = async function (blob, name) {
      if (!(blob instanceof Blob) || !blob.size) throw Error('Exporter returned an empty file');
      dlBar('File ready: ' + name + ' · ' + kb(blob.size), blob, name);
      status('Ready: ' + name + ' · ' + kb(blob.size) + ' — use Download file if the download did not start.');
      await dl0(blob, name);
      if (!(blob as any)?.__certAlreadyEmbedded) {
        void issueAndAutoAttachGiftCertificate({
          giftFileName: name,
          fileSizeBytes: blob.size,
          sourceStudio: 'منصة المصمم أحمد للهدايا',
        });
      }
      return blob;
    };
    function settings() {
      return Object.fromEntries(
        ['w', 'h', 'fps', 'qual', 'fmt', 'lay', 'fit', 'scale', 'mirror', 'trimStart', 'trimEnd']
          .map((id) => [id, $('#' + id).value])
          .concat([['trim', $('#trim').checked]])
      );
    }
    function geometry(W, H) {
      const scale = Number($('#scale').value) / 100,
        fit = $('#fit').value,
        mirror = $('#mirror').value;
      if (!Number.isFinite(scale) || scale <= 0 || scale > 10)
        throw Error('Content scale must be between 1 and 1000%');
      let w = W,
        h = H;
      if (fit !== 'stretch') {
        const r = fit === 'contain' ? Math.min(W / S.w, H / S.h) : Math.max(W / S.w, H / S.h);
        w = S.w * r;
        h = S.h * r;
      }
      return {
        w: w * scale,
        h: h * scale,
        sx: mirror === 'horizontal' ? -1 : 1,
        sy: mirror === 'vertical' ? -1 : 1,
      };
    }
    function contentDraw(draw, x, W, H) {
      const g = geometry(W, H);
      x.save();
      x.translate(W / 2, H / 2);
      x.scale(g.sx, g.sy);
      x.translate(-g.w / 2, -g.h / 2);
      draw(x, g.w, g.h);
      x.restore();
      const wmLayers: any[] = (window as any).__WATERMARK_LAYERS || [];
      if (wmLayers.length > 0) {
        const baseW = (S && S.w) || wmLayers[0]?.animWidth || W;
        const baseH = (S && S.h) || wmLayers[0]?.animHeight || H;
        for (const wm of wmLayers) {
          const imSource = wm._bmp || wm._img;
          if (!imSource) continue;
          const [a, b, c, d, tx, ty] = computeAffineMatrix2D(
            wm.x * (W / Math.max(1, baseW)),
            wm.y * (H / Math.max(1, baseH)),
            wm.width * (W / Math.max(1, baseW)),
            wm.height * (H / Math.max(1, baseH)),
            wm.scale,
            wm.rotation
          );
          x.save();
          x.globalAlpha = Math.max(0, Math.min(1, wm.opacity / 100));
          x.transform(a, b, c, d, tx, ty);
          x.drawImage(
            imSource,
            0,
            0,
            wm.width * (W / Math.max(1, baseW)),
            wm.height * (H / Math.max(1, baseH))
          );
          x.restore();
        }
      }
      if ((window as any).__chromaKey?.enabled) {
        applyChromaKeyToContext(x, W, H, (window as any).__chromaKey);
      }
      if (
        (window as any).__edgeFeather?.enabled &&
        typeof (window as any).__applyEdgeFeatherToContext === 'function'
      ) {
        (window as any).__applyEdgeFeatherToContext(x, W, H);
      }
    }
    function exportOptions() {
      const W = Number($('#w').value),
        H = Number($('#h').value),
        fps = Number($('#fps').value),
        quality = Number($('#qual').value);
      if (!Number.isInteger(W) || !Number.isInteger(H) || W < 1 || H < 1 || W > 8192 || H > 8192)
        throw Error('Width and height must be whole numbers between 1 and 8192');
      if (!Number.isFinite(fps) || fps < 1 || fps > 120) throw Error('FPS must be between 1 and 120');
      if (!Number.isFinite(quality) || quality < 1 || quality > 100)
        throw Error('Quality must be between 1 and 100');
      let start = 0,
        end = S.vid ? S.vid.duration : S.n / S.fps;
      const featherCfg = (window as any).__edgeFeather;
      const trimCheckbox = $('#trim') as HTMLInputElement | null;
      const isTrimChecked = Boolean(trimCheckbox && trimCheckbox.checked);
      const isFeatherTrimActive = Boolean(featherCfg && featherCfg.trimEnabled);

      if (isTrimChecked || isFeatherTrimActive) {
        if (isFeatherTrimActive && !isTrimChecked) {
          start = Number(featherCfg.trimStartTime || 0);
          end = Number(featherCfg.trimEndTime || (S.vid ? S.vid.duration : S.n / S.fps));
        } else {
          start = Number(($('#trimStart') as HTMLInputElement)?.value || 0);
          end = Number(($('#trimEnd') as HTMLInputElement)?.value || (S.vid ? S.vid.duration : S.n / S.fps));
        }
        const totalDur = S.vid ? S.vid.duration : S.n / S.fps;
        start = Math.max(0, Math.min(totalDur - 0.001, start));
        end = Math.max(start + 0.001, Math.min(totalDur, end));
      }
      geometry(W, H);
      return { W, H, fps, q: quality / 100, start, end, nk: Math.max(1, Math.round((end - start) * fps)) };
    }
    async function encodeMP4(o) {
      if (window.AU?.detectPromise) {
        try {
          await window.AU.detectPromise;
        } catch (_) {}
      }
      if (!window.VideoEncoder || !window.VideoFrame || !window.Mp4Muxer) return recordMP4(o);
      let config;
      const codecCandidates = selectOptimalH264CodecCandidates(o.VW, o.VH);
      for (const codec of codecCandidates) {
        const c = {
          codec,
          width: o.VW,
          height: o.VH,
          bitrate: Math.round(Math.min(60e6, Math.max(2.5e6, o.VW * o.VH * o.fps * 0.28)) * o.q),
          framerate: o.fps,
          avc: { format: 'avc' },
        };
        try {
          if ((await VideoEncoder.isConfigSupported(c)).supported) {
            config = c;
            break;
          }
        } catch (_) {}
      }
      if (!config) return recordMP4(o);
      const audio = window.finalAudio && window.finalAudio();
      let audioConfig = null;
      if (audio && audio.buf && window.AudioEncoder && window.AudioData) {
        const audioCandidates = buildAudioEncoderCandidates(
          audio.buf.sampleRate,
          audio.buf.numberOfChannels
        );
        for (const cand of audioCandidates) {
          try {
            const sup = await AudioEncoder.isConfigSupported({
              codec: cand.codec,
              sampleRate: cand.sampleRate,
              numberOfChannels: cand.numberOfChannels,
              bitrate: cand.bitrate,
            });
            if (sup && sup.supported) {
              audioConfig = cand;
              break;
            }
          } catch (_) {}
        }
      }
      const target = new Mp4Muxer.ArrayBufferTarget(),
        mux = new Mp4Muxer.Muxer({
          target,
          fastStart: 'in-memory',
          firstTimestampBehavior: 'offset',
          video: { codec: 'avc', width: o.VW, height: o.VH, frameRate: o.fps },
          ...(audioConfig
            ? {
                audio: {
                  codec: audioConfig.muxCodec,
                  sampleRate: audioConfig.sampleRate,
                  numberOfChannels: audioConfig.numberOfChannels,
                },
              }
            : {}),
        });
      let failure = null,
        ve = null,
        ae = null;
      const vChunks: Array<{ chunk: any; meta: any; timestamp: number }> = [];
      const aChunks: Array<{ chunk: any; meta: any; timestamp: number }> = [];
      const fail = (e) => {
          failure = e;
        },
        guard = () => {
          if (failure) throw failure;
        };
      try {
        ve = new VideoEncoder({
          output: (chunk, meta) => {
            vChunks.push({
              chunk,
              meta,
              timestamp: Number.isFinite(chunk.timestamp) ? chunk.timestamp : 0,
            });
          },
          error: fail,
        });
        ve.configure(config);
        const cvs = [mk(o.VW, o.VH), mk(o.VW, o.VH)],
          ctxs = cvs.map((cv) => cv.getContext('2d', { alpha: false }));
        const keyInterval = Math.max(1, Math.round(o.fps));
        for (let k = 0; k < o.nk; k++) {
          guard();
          const bufIdx = k & 1;
          const c = cvs[bufIdx];
          const x = ctxs[bufIdx];
          await o.paint(x, k);
          const tsUs = Math.round((k * 1e6) / o.fps);
          const nextTsUs = Math.round(((k + 1) * 1e6) / o.fps);
          const f = new VideoFrame(c, {
            timestamp: tsUs,
            duration: Math.max(1, nextTsUs - tsUs),
          });
          try {
            ve.encode(f, { keyFrame: k % keyInterval === 0 });
          } finally {
            f.close();
          }
          const deadline = performance.now() + 15000;
          while (ve.encodeQueueSize > 2) {
            guard();
            if (performance.now() > deadline) throw Error('Video encoder stalled');
            await sleep(4);
          }
          await sleep(0);
          if (k % 5 === 0) status('Encoding ' + Math.round(((k + 1) * 100) / o.nk) + '%');
        }
        await timed(ve.flush(), 30000, 'Video encoder');
        guard();
        if (audioConfig && audio && audio.buf) {
          ae = new AudioEncoder({
            output: (chunk, meta) => {
              aChunks.push({
                chunk,
                meta,
                timestamp: Number.isFinite(chunk.timestamp) ? chunk.timestamp : 0,
              });
            },
            error: fail,
          });
          ae.configure({
            codec: audioConfig.codec,
            sampleRate: audioConfig.sampleRate,
            numberOfChannels: audioConfig.numberOfChannels,
            bitrate: audioConfig.bitrate,
          });
          const sr = audioConfig.sampleRate,
            ch = audioConfig.numberOfChannels,
            srcSr = audio.buf.sampleRate || sr,
            chunkLen = getOptimalAudioFrameSize(audioConfig.muxCodec),
            rawTotal = Math.max(1, Math.round((o.nk / o.fps) * sr)),
            total = Math.ceil(rawTotal / chunkLen) * chunkLen;
          for (let off = 0; off < total; off += chunkLen) {
            guard();
            const n = Math.min(chunkLen, total - off),
              data = new Float32Array(n * ch),
              srcOff = computeAudioChunkSampleOffset(o.start, off, srcSr, sr);
            for (let c = 0; c < ch; c++) {
              const src = audio.buf.getChannelData(Math.min(c, audio.buf.numberOfChannels - 1));
              const resampled = resampleChannelFloat32(src, srcSr, sr, n, audio.vol, srcOff, false);
              data.set(resampled, c * n);
            }
            const f = new AudioData({
              format: 'f32-planar',
              sampleRate: sr,
              numberOfChannels: ch,
              numberOfFrames: n,
              timestamp: Math.round((off * 1e6) / sr),
              data,
            });
            try {
              ae.encode(f);
            } finally {
              f.close();
            }
            const deadline = performance.now() + 15000;
            while (ae.encodeQueueSize > 16) {
              guard();
              if (performance.now() > deadline) throw Error('Audio encoder stalled');
              await sleep(3);
            }
          }
          await timed(ae.flush(), 30000, 'Audio encoder');
          guard();
        }
        status('Packaging MP4…');
        const interleaved = interleaveTimestampedMediaChunks(vChunks, aChunks);
        for (const item of interleaved) {
          if (item.kind === 'video' && item.video) {
            mux.addVideoChunk(item.video.chunk, item.video.meta);
          } else if (item.kind === 'audio' && item.audio) {
            mux.addAudioChunk(item.audio.chunk, item.audio.meta);
          }
        }
        mux.finalize();
        if (!target.buffer || !target.buffer.byteLength) throw Error('MP4 muxer returned no data');
        return new Blob([target.buffer], { type: 'video/mp4' });
      } finally {
        if (ve && ve.state !== 'closed') ve.close();
        if (ae && ae.state !== 'closed') ae.close();
      }
    }
    async function recordMP4(o) {
      if (!window.MediaRecorder)
        throw Error('MP4 encoding is unavailable. Open this file in Chrome or Edge.');
      const audio = window.finalAudio && window.finalAudio(),
        mime = (
          audio
            ? ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4']
            : ['video/mp4;codecs=avc1.42E01E', 'video/mp4']
        ).find((t) => MediaRecorder.isTypeSupported(t));
      if (!mime) throw Error('MP4 encoding is unavailable. Open this file in current Chrome or Edge.');
      status('Using real-time MP4 encoder…');
      const c = mk(o.VW, o.VH),
        x = c.getContext('2d', { alpha: false }),
        stream = c.captureStream(0),
        track = stream.getVideoTracks()[0],
        chunks = [];
      let context, source, recorder, failed;
      try {
        if (audio) {
          context = new AudioContext();
          await context.resume();
          const dest = context.createMediaStreamDestination(),
            gain = context.createGain();
          source = context.createBufferSource();
          source.buffer = audio.buf;
          gain.gain.value = audio.vol;
          source.connect(gain).connect(dest);
          dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
        }
        recorder = new MediaRecorder(stream, {
          mimeType: mime,
          videoBitsPerSecond: Math.round(Math.max(2e6, o.VW * o.VH * o.fps * 0.35) * o.q),
        });
        recorder.ondataavailable = (e) => {
          if (e.data.size) chunks.push(e.data);
        };
        const done = new Promise((resolve, reject) => {
          recorder.onstop = resolve;
          recorder.onerror = (e) => {
            failed = e.error || Error('MP4 recording failed');
            reject(failed);
          };
        });
        done.catch(() => {});
        await o.paint(x, 0);
        recorder.start();
        if (source && o.start < source.buffer.duration) source.start(0, o.start);
        const start = performance.now();
        for (let k = 0; k < o.nk; k++) {
          if (failed) throw failed;
          if (k) await o.paint(x, k);
          track.requestFrame();
          status('Recording ' + Math.round(((k + 1) * 100) / o.nk) + '%');
          await sleep(Math.max(0, start + ((k + 1) * 1000) / o.fps - performance.now()));
        }
        recorder.stop();
        await timed(done, 10000, 'MP4 recorder');
        if (!chunks.length) throw Error('MP4 recorder returned no data');
        return new Blob(chunks, { type: 'video/mp4' });
      } finally {
        if (recorder && recorder.state !== 'inactive') recorder.stop();
        if (source)
          try {
            source.stop();
          } catch (_) {}
        stream.getTracks().forEach((t) => t.stop());
        if (context) await context.close();
      }
    }
    exportVY = async function (format) {
      const o = exportOptions(),
        W = even(o.W),
        H = even(o.H),
        Y = format === 'yyeva',
        aw = Y ? W : even(Math.ceil(W / 2)),
        ah = Y ? H : even(Math.ceil(H / 2)),
        VW = Y ? W * 2 : Math.ceil((W + 4 + aw) / 16) * 16,
        VH = Y ? H : Math.ceil(Math.max(H, ah) / 16) * 16;
      if (VW > 8192 || VH > 8192) throw Error('Packed video exceeds 8192 pixels. Reduce output dimensions.');
      const a = [Y ? W : W + 4, 0, aw, ah],
        rgb = [0, 0, W, H],
        M = S.meta,
        m = S.vid,
        raw = S._rawDraw || S.draw,
        rgba = mk(W, H),
        rx = rgba.getContext('2d', { willReadFrequently: true }),
        alpha = mk(W, H),
        ax = alpha.getContext('2d'),
        hasVapMaskEdits = !!(
          S?._vapSlotReplacements &&
          Object.values(S._vapSlotReplacements).some((r: any) => r && r.active)
        ),
        hasWatermarkLayers = !!(
          Array.isArray((window as any).__WATERMARK_LAYERS) &&
          (window as any).__WATERMARK_LAYERS.length > 0
        ),
        direct = !!(
          M &&
          m &&
          $('#fit').value === 'stretch' &&
          +$('#scale').value === 100 &&
          $('#mirror').value === 'none' &&
          !(window as any).__edgeFeather?.enabled &&
          !(window as any).__chromaKey?.enabled &&
          !hasVapMaskEdits &&
          !hasWatermarkLayers
        );
      const out = await encodeMP4({
        ...o,
        VW,
        VH,
        paint: async (x, k) => {
          const t = Math.min(o.start + (k + 0.5) / o.fps, o.end - 0.0001);
          if (m) await seekVideo(m, t);
          else await S.set(Math.min(S.n - 1, Math.floor(t * S.fps)));
          x.fillStyle = '#000';
          x.fillRect(0, 0, VW, VH);
          x.imageSmoothingQuality = 'high';
          if (direct) {
            x.drawImage(m, ...M.c, 0, 0, W, H);
            x.drawImage(m, ...M.a, ...a);
            return;
          }
          rx.clearRect(0, 0, W, H);
          contentDraw(raw, rx, W, H);
          x.drawImage(rgba, 0, 0);
          const d = rx.getImageData(0, 0, W, H);
          for (let i = 0; i < d.data.length; i += 4) {
            d.data[i] = d.data[i + 1] = d.data[i + 2] = d.data[i + 3];
            d.data[i + 3] = 255;
          }
          ax.putImageData(d, 0, 0);
          x.drawImage(alpha, ...a);
        },
      });
      const meta = Y
          ? {
              descript: {
                width: VW,
                height: VH,
                isEffect: 0,
                version: 1,
                rgbFrame: rgb,
                alphaFrame: a,
                totalFrame: o.nk,
                fps: o.fps,
              },
              effect: [],
              datas: [],
            }
          : {
              info: {
                v: 2,
                f: o.nk,
                w: W,
                h: H,
                fps: o.fps,
                videoW: VW,
                videoH: VH,
                aFrame: a,
                rgbFrame: rgb,
                isVapx: 0,
                orien: 0,
              },
            },
        blob = await packageVideo(out, format, meta),
        check = await readMediaMeta(new Uint8Array(await blob.arrayBuffer()));
      if (!check || check.kind !== (Y ? 'YYEVA' : 'VAP'))
        throw Error('Export metadata verification failed');
      await dl(blob, cur.name.replace(/\.[^.]+$/, '') + '_' + format + '.mp4');
      return blob;
    };
    async function exportVideo(format) {
      const o = exportOptions(),
        W = even(o.W),
        H = even(o.H),
        dual = format === 'dual',
        VW = dual ? W * 2 : W,
        VH = H,
        raw = S._rawDraw || S.draw,
        c = mk(W, H),
        x = c.getContext('2d', { willReadFrequently: true }),
        g = mk(W, H),
        gx = g.getContext('2d');
      let blob = await encodeMP4({
        ...o,
        VW,
        VH,
        paint: async (out, k) => {
          const t = Math.min(o.start + (k + 0.5) / o.fps, o.end - 0.0001);
          if (S.vid) await seekVideo(S.vid, t);
          else await S.set(Math.min(S.n - 1, Math.floor(t * S.fps)));
          x.clearRect(0, 0, W, H);
          contentDraw(raw, x, W, H);
          out.fillStyle = '#000';
          out.fillRect(0, 0, VW, VH);
          out.drawImage(c, 0, 0);
          if (dual) {
            const d = x.getImageData(0, 0, W, H);
            for (let i = 0; i < d.data.length; i += 4) {
              d.data[i] = d.data[i + 1] = d.data[i + 2] = d.data[i + 3];
              d.data[i + 3] = 255;
            }
            gx.putImageData(d, 0, 0);
            out.drawImage(g, W, 0);
          }
        },
      });
      if (format === 'mov') {
        const u = new Uint8Array(await blob.arrayBuffer());
        u.set([113, 116, 32, 32], 8);
        blob = new Blob([u], { type: 'video/quicktime' });
      }
      await dl(
        blob,
        cur.name.replace(/\.[^.]+$/, '') + (dual ? '_dual' : '') + (format === 'mov' ? '.mov' : '.mp4')
      );
      return blob;
    }
    const previousStart = $('#start').onclick;
    let working = false;
    $('#start').onclick = async () => {
      if (working) return;
      if (typeof (window as any).__checkConversionAccess === 'function') {
        const allowed = (window as any).__checkConversionAccess(
          $('#fmt') ? $('#fmt').value : 'orig',
          cur ? cur.name : 'animation.svga'
        );
        if (!allowed) return;
      }
      if (!cur || !S) {
        status('Upload a supported file first.');
        toast('Upload a supported file first');
        return;
      }
      const btn = $('#start'),
        source = S,
        playing = !S.paused,
        time = S.vid ? S.vid.currentTime : 0,
        labelHtml = btn.innerHTML;
      working = true;
      window.__busy = 1;
      btn.disabled = true;
      btn.textContent = 'Exporting…';
      $('#saveProject').disabled = $('#openProject').disabled = true;
      source.stop();
      if (window.PA) window.PA.stop();
      status('Preparing export…');
      const controls = $$('#convert input,#convert select'),
        disabled = controls.map((e) => e.disabled);
      controls.forEach((e) => (e.disabled = true));
      try {
        const o = exportOptions();
        const origF = $('#fmt').value;
        let F = origF;
        const featherCfg = (window as any).__edgeFeather;
        const featherOn = !!featherCfg?.enabled;
        const chromaOn = !!(window as any).__chromaKey?.enabled;
        if (F === 'orig' && (featherOn || chromaOn) && !source.meta && cur) {
          const ext = cur.name.split('.').pop()?.toLowerCase() || 'svga';
          const extMap: Record<string, string> = {
            svga: 'svga',
            gif: 'gif',
            webp: 'webp',
            apng: 'apng',
            png: 'apng',
            mp4: 'mp4',
            mov: 'mov',
            webm: 'webm',
            json: 'lottie',
            lottie: 'dotlottie',
            zip: 'zip',
          };
          if (extMap[ext]) {
            F = extMap[ext];
            $('#fmt').value = F;
          }
        }
        const exportAeScriptPackage = async (fileInput?: any) => {
          const file = fileInput || cur || (window as any).__currentMotionFile;
          if (!file) {
            status('يرجى اختيار أو رفع ملف SVGA أولاً.');
            toast('يرجى اختيار أو رفع ملف SVGA أولاً');
            return;
          }
          const updateProgressUI = (percent: number, text: string) => {
            const safePercent = Math.min(100, Math.max(0, Math.round(Number(percent) || 0)));
            const msgText = text || 'جاري المعالجة...';
            status(`[${safePercent}%] ${msgText}`);
            if (btn) {
              btn.textContent = `⏳ [${safePercent}%] ${msgText}`;
            }
            const stEl = document.getElementById('exportStatus');
            if (stEl) {
              stEl.textContent = `[${safePercent}%] ${msgText}`;
            }
          };

          // 1. Try Direct Native Engine first (Fastest, zero postMessage overhead, instant download)
          try {
            status('جاري قراءة ملف SVGA وتجهيز سكريبت After Effects...');
            updateProgressUI(5, 'جاري تفكيك وتجهيز ملف SVGA...');
            const result = await exportSvgaToAfterEffectsDirect(
              file,
              file.name.replace(/\.[^.]+$/i, ''),
              updateProgressUI
            );
            status(`تم تحميل سكريبت وحزمة After Effects بنجاح: ${result.zipFileName}`);
            toast('تم تصدير وتحميل حزمة After Effects بنجاح! ⚡');
            return;
          } catch (directErr: any) {
            console.warn('Native AE export encountered issue, falling back to bridge iframe:', directErr);
          }

          // 2. Fallback to Bridge Iframe if native run failed
          return new Promise<void>((resolve, reject) => {
            let bridge = document.getElementById('aeScriptHiddenBridge') as HTMLIFrameElement | null;
            if (!bridge) {
              bridge = document.createElement('iframe');
              bridge.id = 'aeScriptHiddenBridge';
              bridge.src = '/svga-to-after-effects.html';
              bridge.style.position = 'fixed';
              bridge.style.left = '-9999px';
              bridge.style.top = '-9999px';
              bridge.style.width = '1px';
              bridge.style.height = '1px';
              bridge.style.opacity = '0';
              bridge.style.pointerEvents = 'none';
              bridge.style.border = '0';
              document.body.appendChild(bridge);
            }
            let sent = false;
            const onMsg = (event: MessageEvent) => {
              if (event.data?.type === 'svga-ae-ready' && !sent) {
                send();
              } else if (event.data?.type === 'svga-ae-progress') {
                updateProgressUI(event.data.percent, event.data.text);
              } else if (event.data?.type === 'svga-ae-done') {
                window.removeEventListener('message', onMsg);
                updateProgressUI(100, 'تم التصدير بنجاح!');
                const fileName = event.data.fileName || `${file.name.replace(/\.[^.]+$/i, '')}-AfterEffects.zip`;
                const blob = event.data?.blob;
                if (blob) {
                  const zipUrl = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = zipUrl;
                  a.download = fileName;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  setTimeout(() => URL.revokeObjectURL(zipUrl), 30000);
                }
                status(`تم تحميل سكريبت وحزمة After Effects بنجاح: ${fileName}`);
                toast('تم تصدير وتحميل حزمة After Effects بنجاح! ⚡');
                resolve();
              } else if (event.data?.type === 'svga-ae-error') {
                window.removeEventListener('message', onMsg);
                status('خطأ في تصدير سكريبت After Effects: ' + event.data.error);
                reject(new Error(event.data.error || 'Failed to export After Effects package'));
              }
            };
            window.addEventListener('message', onMsg);
            const send = () => {
              if (sent) return;
              sent = true;
              try {
                updateProgressUI(5, 'جاري تفكيك وتجهيز ملف SVGA...');
                bridge!.contentWindow?.postMessage(
                  {
                    type: 'svga-ae-export',
                    file,
                    name: file.name.replace(/\.[^.]+$/i, ''),
                  },
                  '*'
                );
              } catch (e) {
                window.removeEventListener('message', onMsg);
                reject(e);
              }
            };
            if ((bridge as any).__loaded) {
              setTimeout(send, 50);
            } else {
              bridge.onload = () => {
                (bridge as any).__loaded = true;
                setTimeout(send, 100);
              };
              setTimeout(() => {
                try {
                  bridge!.contentWindow?.postMessage({ type: 'svga-ae-ping' }, '*');
                } catch (_) {}
                setTimeout(send, 200);
              }, 300);
            }
          });
        };
        (window as any).__exportAeScriptPackage = exportAeScriptPackage;
        try {
          if (F === 'ae_script') await exportAeScriptPackage(cur);
          else if (F === 'vap' || F === 'yyeva') await exportVY(F);
          else if (['mp4', 'mov', 'dual'].includes(F)) await exportVideo(F);
          else if (F === 'orig' && source.meta) {
            const hasVapMaskEdits = !!(
              S?._vapSlotReplacements &&
              Object.values(S._vapSlotReplacements).some((r: any) => r && r.active)
            );
            const hasWatermarkLayers = !!(
              Array.isArray((window as any).__WATERMARK_LAYERS) &&
              (window as any).__WATERMARK_LAYERS.length > 0
            );
            const unchanged =
              o.W === S.w &&
              o.H === S.h &&
              Math.abs(o.fps - S.fps) < 0.001 &&
              o.q === 1 &&
              !window.AU.dirty &&
              !$('#trim').checked &&
              !(featherCfg && featherCfg.trimEnabled) &&
              $('#mirror').value === 'none' &&
              +$('#scale').value === 100 &&
              $('#fit').value === 'stretch' &&
              !featherOn &&
              !chromaOn &&
              !hasVapMaskEdits &&
              !hasWatermarkLayers;
            if (unchanged) await dl(cur, cur.name);
            else await exportVY(source.meta.kind.toLowerCase());
          } else {
            const oldN = S.n,
              oldSet = S.set;
            try {
              const isTrimActive = Boolean($('#trim').checked || (featherCfg && featherCfg.trimEnabled));
              if (isTrimActive) {
                S.n = Math.max(1, Math.round((o.end - o.start) * S.fps));
                S.set = (i) => oldSet(Math.min(oldN - 1, i + Math.floor(o.start * S.fps)));
              }
              await previousStart();
            } finally {
              S.n = oldN;
              S.set = oldSet;
            }
          }
        } finally {
          if ($('#fmt').value !== origF) {
            $('#fmt').value = origF;
          }
        }
      } catch (e) {
        console.error('Export failed', e);
        status('Export failed: ' + (e.message || e) + '. You can retry.');
        dlBar('Export failed: ' + (e.message || e));
        toast('Export failed: ' + (e.message || e));
      } finally {
        controls.forEach((e, i) => (e.disabled = disabled[i]));
        working = false;
        window.__busy = 0;
        btn.disabled = false;
        btn.innerHTML = labelHtml;
        $('#saveProject').disabled = $('#openProject').disabled = false;
        if (source === S) {
          if (source.vid)
            try {
              await seekVideo(source.vid, time);
            } catch (_) {}
          if (playing) {
            Promise.resolve(source.go()).catch(() => {});
            if (window.PA) window.PA.restart();
          }
        }
      }
    };

    // Left-Click ("تريك شمال / كليك شمال") instant export on #view preview stage
    const stageViewEl = $('#view');
    if (stageViewEl) {
      stageViewEl.addEventListener('click', (ev: MouseEvent) => {
        if (ev.button !== 0) return;
        if ((window as any).__leftClickExportEnabled === false) return;
        if (working || !cur || !S) return;
        const fmtSelect = $('#fmt') as HTMLSelectElement | null;
        const selectedFmtLabel =
          fmtSelect?.options?.[fmtSelect.selectedIndex]?.text || fmtSelect?.value || 'Original';
        toast('⚡ تصدير فوري (كليك شمال): ' + selectedFmtLabel);
        $('#start')?.click();
      });
    }

    $('#trim').onchange = () => {
      $('#trimRange').hidden = !$('#trim').checked;
    };
    function wav(buf) {
      const ch = buf.numberOfChannels,
        n = buf.length,
        u = new Uint8Array(44 + n * ch * 4),
        v = new DataView(u.buffer),
        str = (o, s) => {
          for (let i = 0; i < s.length; i++) u[o + i] = s.charCodeAt(i);
        };
      str(0, 'RIFF');
      v.setUint32(4, u.length - 8, true);
      str(8, 'WAVE');
      str(12, 'fmt ');
      v.setUint32(16, 16, true);
      v.setUint16(20, 3, true);
      v.setUint16(22, ch, true);
      v.setUint32(24, buf.sampleRate, true);
      v.setUint32(28, buf.sampleRate * ch * 4, true);
      v.setUint16(32, ch * 4, true);
      v.setUint16(34, 32, true);
      str(36, 'data');
      v.setUint32(40, n * ch * 4, true);
      for (let c = 0; c < ch; c++) {
        const a = buf.getChannelData(c);
        for (let i = 0; i < n; i++) v.setFloat32(44 + (i * ch + c) * 4, a[i], true);
      }
      return u;
    }
    async function saveProject() {
      if (!cur || !S) throw Error('Upload a file before saving a project');
      const add = window.AU.add,
        p = {
          type: 'MotionToolsProject',
          version: 1,
          source: {
            name: cur.name,
            mime: cur.type,
            data: base64(new Uint8Array(await cur.arrayBuffer())),
          },
          settings: settings(),
          images: { ...(window.EDIT || {}) },
          audio: {
            vol: window.AU.vol,
            del: window.AU.del,
            dirty: window.AU.dirty,
            add: add ? { name: add.name, data: base64(add.bytes || wav(add.buf)) } : null,
          },
        },
        b = new Blob([JSON.stringify(p)], { type: 'application/json' });
      await dl(b, cur.name.replace(/\.[^.]+$/, '') + '.motiontools');
      return b;
    }
    async function restoreProject(file) {
      const p = JSON.parse(await file.text());
      if (
        p.type !== 'MotionToolsProject' ||
        p.version !== 1 ||
        !p.source ||
        typeof p.source.name !== 'string' ||
        typeof p.source.data !== 'string'
      )
        throw Error('Not a supported MotionTools project');
      const f = new File([unbase64(p.source.data)], p.source.name, { type: p.source.mime || '' });
      await load(f);
      if (!S) throw Error('Project source could not be opened');
      for (const [id, value] of Object.entries(p.settings || {})) {
        if (
          !['w', 'h', 'fps', 'qual', 'fmt', 'lay', 'fit', 'scale', 'mirror', 'trimStart', 'trimEnd', 'trim'].includes(
            id
          )
        )
          continue;
        const e = $('#' + id);
        if (id === 'trim') e.checked = !!value;
        else e.value = value;
      }
      $('#trim').onchange();
      if (S.vid && !S.meta) S.w = $('#lay').value === 'n' ? S.vid.videoWidth : S.vid.videoWidth / 2;
      for (const [key, url] of Object.entries(p.images || {})) {
        if (typeof url !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/i.test(url))
          throw Error('Invalid project image');
        A[key] = url;
        await applyEdit(url, key);
        for (const e of $$('#assets .th')) if (e.dataset.k === key) e.querySelector('img').src = url;
      }
      const audio = p.audio || {};
      let add = null;
      if (audio.add) {
        const bytes = unbase64(audio.add.data),
          ctx = new AudioContext();
        try {
          const buf = await ctx.decodeAudioData(bytes.slice().buffer);
          add = { name: audio.add.name, bytes, buf, mp3: bytes[0] === 0x49 || bytes[0] === 0xff };
        } finally {
          await ctx.close();
        }
      }
      Object.assign(window.AU, {
        add,
        vol: Number.isFinite(audio.vol) ? audio.vol : 1,
        del: !!audio.del,
        dirty: !!audio.dirty,
      });
      $('#audBox').textContent = window.AU.del
        ? 'Audio deleted (click to edit)'
        : add
          ? '♪ ' + add.name + ' (click to edit)'
          : 'Audio assets (click to edit)';
      if (window.PA) window.PA.restart();
      status('Project restored: ' + p.source.name);
      toast('Project restored');
      return p;
    }
    $('#saveProject').onclick = async () => {
      if (working) return;
      const b = $('#saveProject');
      b.disabled = true;
      try {
        await saveProject();
      } catch (e) {
        status('Could not save project: ' + e.message);
      } finally {
        b.disabled = false;
      }
    };
    $('#openProject').onclick = () => {
      if (!working) $('#projectFile').click();
    };
    $('#projectFile').onchange = async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try {
        await restoreProject(f);
      } catch (e) {
        status('Could not open project: ' + e.message);
      }
    };
    const previousLoad = load;
    load = async function (f) {
      if (working) {
        toast('Wait for export to finish before opening another file');
        return;
      }
      if (/\.motiontools$/i.test(f.name)) return restoreProject(f);
      if (S) {
        S.stop();
        if (S.vid) {
          const v = S.vid,
            url = v.src;
          v.pause();
          v.removeAttribute('src');
          v.load();
          if (url.startsWith('blob:')) URL.revokeObjectURL(url);
        }
      }
      if (anim)
        try {
          anim.destroy();
        } catch (_) {}
      if (player && player.clear)
        try {
          player.clear();
        } catch (_) {}
      $('#fit').value = 'stretch';
      $('#scale').value = '100';
      $('#mirror').value = 'none';
      $('#trim').checked = false;
      $('#trimRange').hidden = true;
      $('#trimStart').value = 0;
      $('#lay').value = 'n';
      status('Opening ' + f.name + '…');
      try {
        await previousLoad(f);
        if (S) {
          S._rawDraw = S.draw;
          const raw = S.draw;
          S.draw = (x, W, H) => contentDraw(raw, x, W, H);
          $('#trimEnd').value = (S.vid ? S.vid.duration : S.n / S.fps).toFixed(3);
          if ((window as any).__chromaKey?.enabled) {
            (window as any).__applyChromaKeyToStageAndAssets?.((window as any).__chromaKey);
          }
          status('Ready to export or save the project.');
        } else status('Could not open this file.');
      } catch (e) {
        S = null;
        status('Could not open file: ' + e.message);
        $('#view').textContent = 'Could not open file: ' + e.message;
      }
    };

    // =========================================================================
    // Interactive Scrubber (#seek), Play/Pause (#pp), and Gift Snapshot (#snapGiftBtn)
    // =========================================================================
    (() => {
      const seekEl = document.getElementById('seek') as HTMLInputElement | null;
      let isUserScrubbing = false;

      if (seekEl) {
        const updateSeekPosition = async (ratio: number) => {
          if (!S) return;
          const totalFrames = Math.max(1, S.n || 1);
          const fps = Math.max(1, S.fps || 15);
          const totalDur = S.vid && S.vid.duration > 0 ? S.vid.duration : totalFrames / fps;
          const targetTime = Math.max(0, Math.min(totalDur, ratio * totalDur));
          const targetFrame = Math.max(0, Math.min(totalFrames - 1, Math.round(ratio * (totalFrames - 1))));

          if (S.vid) {
            try {
              S.vid.currentTime = targetTime;
            } catch (_) {}
          }
          (window as any).__svgaCurrentFrame = targetFrame;
          if (window.SVP && typeof window.SVP.stepToFrame === 'function') {
            try {
              (window.SVP as any).currentFrame = targetFrame;
              window.SVP.stepToFrame(targetFrame, false);
              window.SVP._renderer?.drawFrame?.(targetFrame);
            } catch (_) {}
          } else if (typeof S.set === 'function') {
            try {
              await S.set(targetFrame);
            } catch (_) {}
          }
          if (window.PA) {
            window.PA.t = targetTime;
            if (window.PA.on) window.PA.sync(targetTime, true);
          }
        };

        seekEl.addEventListener('mousedown', () => { isUserScrubbing = true; });
        seekEl.addEventListener('touchstart', () => { isUserScrubbing = true; }, { passive: true });

        seekEl.addEventListener('input', (e: any) => {
          isUserScrubbing = true;
          const pct = Math.max(0, Math.min(100, Number(e.target.value) || 0));
          updateSeekPosition(pct / 100);
        });

        seekEl.addEventListener('change', (e: any) => {
          const pct = Math.max(0, Math.min(100, Number(e.target.value) || 0));
          updateSeekPosition(pct / 100);
          setTimeout(() => { isUserScrubbing = false; }, 80);
        });

        window.addEventListener('mouseup', () => {
          if (isUserScrubbing) setTimeout(() => { isUserScrubbing = false; }, 80);
        });
        window.addEventListener('touchend', () => {
          if (isUserScrubbing) setTimeout(() => { isUserScrubbing = false; }, 80);
        });

        // Continuous progress loop updating #seek bar while animation plays
        (function loopSeekProgress() {
          if (!isUserScrubbing && S && !S.paused) {
            let progress = 0;
            if (S.vid && S.vid.duration > 0) {
              progress = S.vid.currentTime / S.vid.duration;
            } else if (typeof (window as any).__svgaCurrentFrame === 'number' && S.n > 1) {
              progress = (window as any).__svgaCurrentFrame / Math.max(1, S.n - 1);
            } else if (window.SVP && S.n > 1) {
              const curF = window.SVP.currentFrame ?? (window.SVP as any)._currentFrame ?? (window.SVP._renderer?.currentFrame || 0);
              progress = curF / Math.max(1, S.n - 1);
            } else if (anim && S.n > 1) {
              const curF = anim.currentFrame || 0;
              progress = curF / Math.max(1, S.n - 1);
            } else if (typeof (window as any).__currentAnimationStepIdx === 'number' && S.n > 1) {
              progress = (window as any).__currentAnimationStepIdx / Math.max(1, S.n - 1);
            }
            if (Number.isFinite(progress)) {
              seekEl.value = String(Math.max(0, Math.min(100, Math.round(progress * 100))));
            }
          }
          requestAnimationFrame(loopSeekProgress);
        })();
      }

      // Snapshot capture function: captures exact gift render on canvas (full resolution, transparent PNG)
      const captureGiftSnapshot = async () => {
        if (!S) {
          return toast('يرجى رفع ملف هدية للمعاينة أولاً');
        }
        try {
          const W = Math.max(1, S.w || 400);
          const H = Math.max(1, S.h || 400);
          const snapCanvas = mk(W, H);
          const snapCtx = snapCanvas.getContext('2d', { willReadFrequently: true });
          if (!snapCtx) throw new Error('Could not create canvas context');

          snapCtx.clearRect(0, 0, W, H);
          if (typeof S.draw === 'function') {
            S.draw(snapCtx, W, H);
          } else {
            const liveCanvas = document.querySelector('#view canvas') as HTMLCanvasElement | null;
            const liveVid = document.querySelector('#view video') as HTMLVideoElement | null;
            if (liveCanvas) {
              snapCtx.drawImage(liveCanvas, 0, 0, W, H);
            } else if (liveVid) {
              snapCtx.drawImage(liveVid, 0, 0, W, H);
            }
          }

          // Apply any active watermark layers if present
          const wmList = (window as any).__WATERMARK_LAYERS || [];
          if (Array.isArray(wmList) && wmList.length > 0) {
            for (const ly of wmList) {
              const img = ly._img || (ly.dataUrl ? await imgOf(ly.dataUrl) : null);
              if (!img) continue;
              const w = ly.width * (ly.scale / 100);
              const h = ly.height * (ly.scale / 100);
              const [a, b, c, d, e, f] = computeAffineMatrix2D(ly.x, ly.y, w, h, ly.rotation);
              snapCtx.save();
              snapCtx.transform(a, b, c, d, e, f);
              snapCtx.globalAlpha = Math.max(0, Math.min(1, ly.opacity / 100));
              snapCtx.drawImage(img, -w / 2, -h / 2, w, h);
              snapCtx.restore();
            }
          }

          const blob: Blob | null = await new Promise((res) => snapCanvas.toBlob(res, 'image/png'));
          if (!blob) throw new Error('Canvas snapshot failed');

          const curName = (cur?.name || 'gift').replace(/\.\w+$/, '');
          const snapName = `${curName}_snapshot_${Date.now()}.png`;
          await dl(blob, snapName);
          toast(`✨ تم التقاط وحفظ لقطة شاشة للهدية بنجاح (${W}×${H}px)`);
        } catch (err: any) {
          toast('تعذر التقاط لقطة الشاشة: ' + (err?.message || err));
        }
      };

      (window as any).__captureGiftSnapshot = captureGiftSnapshot;

      // Bind snap button click
      const snapBtn = document.getElementById('snapGiftBtn');
      if (snapBtn) {
        snapBtn.onclick = (e) => {
          e.stopPropagation();
          captureGiftSnapshot();
        };
      }
    })();

    window.MotionTools = {
      readMediaMeta,
      packageVideo,
      boxes,
      saveProject,
      restoreProject,
      encodeMP4,
      load,
      getCurrentFile: () => cur || (window as any).__currentMotionFile || null,
      version: '12.0-fixed',
    };
    (window as any).__getCurrentFile = () => cur || (window as any).__currentMotionFile || null;
  })();
}
