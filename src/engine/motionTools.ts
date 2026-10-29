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
} from '../utils/vapYyevaDetection';
import { removeImageBackgroundData } from '../utils/batchImageOps';
import { computeAffineMatrix2D, AppliedWatermarkLayer } from '../utils/watermark';
import {
  selectOptimalH264CodecCandidates,
  buildAudioEncoderCandidates,
  resampleChannelFloat32,
} from '../utils/giftStudioUtils';

let initialized = false;

export function initMotionToolsFixed() {
  if (initialized) return;
  initialized = true;

  // Bind bundled npm libraries (pako & upng-js) directly on window so APNG/WebP/PNG/SVGA tools never fail offline or wait on CDN
  if (typeof window !== 'undefined') {
    (window as any).pako = pako;
    (window as any).UPNG = UPNG;
  }

  const LIBS = {
    st: {},
    defs: {
      SVGA: ['https://cdn.jsdelivr.net/npm/svgaplayerweb@2.3.1/build/svga.min.js'],
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
      // Do not hijack drag/drop when on the Gifts Studio, Gift Image Creator, or Editor tab
      if (
        document.getElementById('gifts')?.classList.contains('on') ||
        document.getElementById('gift-image')?.classList.contains('on') ||
        document.getElementById('editor')?.classList.contains('on') ||
        location.hash === '#gifts' ||
        location.hash === '#gift-image' ||
        location.hash === '#editor' ||
        e.target?.closest?.('#gifts') ||
        e.target?.closest?.('#gift-image') ||
        e.target?.closest?.('#editor') ||
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
      // Do not hijack drag/drop when on the Gifts Studio, Gift Image Creator, or Editor tab
      if (
        document.getElementById('gifts')?.classList.contains('on') ||
        document.getElementById('gift-image')?.classList.contains('on') ||
        document.getElementById('editor')?.classList.contains('on') ||
        location.hash === '#gifts' ||
        location.hash === '#gift-image' ||
        location.hash === '#editor' ||
        e.target?.closest?.('#gifts') ||
        e.target?.closest?.('#gift-image') ||
        e.target?.closest?.('#editor') ||
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
        const innerSvg = el.querySelector?.('svg');
        if (innerSvg) {
          innerSvg.setAttribute('width', String(displayW));
          innerSvg.setAttribute('height', String(displayH));
          (innerSvg as HTMLElement).style.display = 'block';
        }
      });

      const activePl = (window as any).SVP || player;
      if (activePl && typeof activePl._resize === 'function') {
        try {
          activePl._resize();
        } catch (_) {}
      }
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

  // Initialize default background to gray/white checkerboard automatically
  applyGiftBg('chk');

  const zoomInBtn = document.getElementById('zoomInBtn');
  const zoomOutBtn = document.getElementById('zoomOutBtn');
  const zoomResetBtn = document.getElementById('zoomResetBtn');

  if (zoomInBtn) {
    zoomInBtn.onclick = () => {
      previewZoom = Math.min(3, Math.round((previewZoom + 0.2) * 100) / 100);
      syncPreviewSize();
    };
  }
  if (zoomOutBtn) {
    zoomOutBtn.onclick = () => {
      previewZoom = Math.max(0.2, Math.round((previewZoom - 0.2) * 100) / 100);
      syncPreviewSize();
    };
  }
  if (zoomResetBtn) {
    zoomResetBtn.onclick = () => {
      previewZoom = 1;
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
    return dl0(b, n);
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
    S = null;
    anim = null;
    player = null;
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
          s = Math.min(2, 400 / Math.max(w, h));
        d.style.cssText = `width:${w * s}px;height:${h * s}px`;
        player = new SVGA.Player(d);
        player.setVideoItem(vi);
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

        // Render interactive canvas player in #view so play/pause/seek and alpha checkerboard work cleanly
        const sc = Math.min(2, 400 / Math.max(w, h));
        const cv = mk(Math.round(w * sc), Math.round(h * sc));
        const cx = cv.getContext('2d');
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
        await dl(await z.generateAsync({ type: 'blob' }), base + '_frames.zip');
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
    if (M.show && !M.del) x.drawImage(M.cur, 0, 0, W, H);
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
    M = {
      k,
      cur: im,
      W: im.naturalWidth,
      H: im.naturalHeight,
      show: 1,
      del: 0,
      on: 0,
      txt: 'Sample text',
      font: 0,
      col: '#ffe0a4',
      size: 24,
      x: 0.5,
      y: 0.5,
      dirty: 0,
    };
    $('#mo').hidden = false;
    $('#mth').src = A[k];
    $('#mname').textContent = 'Current Image: ' + k;
    $('#msz').textContent = M.W + ' × ' + M.H;
    $('#mshow').checked = true;
    $('#mton').checked = false;
    $('#mtb').hidden = true;
    $('#mtb').style.display = 'none';
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
    const im = (window.VI && player && window.VI.images) || {};
    for (const k in im) {
      const s = im[k];
      A[k] = /^data:|^http/.test(s) ? s : 'data:image/png;base64,' + s;
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
      const zipBlob = await z.generateAsync({ type: 'blob' });
      await dl(zipBlob, `${base}_images.zip`);
    } catch (e: any) {
      toast(e?.message || 'Could not download image assets');
    }
  };

  (window as any).__downloadAudioAsset = async () => {
    const a = window.finalAudio && window.finalAudio();
    if (!a || !a.bytes) {
      toast('No audio asset in this file');
      return;
    }
    const base = cur ? cur.name.replace(/\.[^.]+$/, '') : 'audio';
    const ext = a.isMp3 ? 'mp3' : 'wav';
    await dl(new Blob([a.bytes], { type: a.isMp3 ? 'audio/mpeg' : 'audio/wav' }), `${base}.${ext}`);
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
  function prep(f) {
    cur = f;
    S = null;
    anim = null;
    player = null;
    window.VI = null;
    (window as any).__lottieData = null;
    (window as any).__WATERMARK_LAYERS = [];
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
      await getLib('libpag');
      if (!window.libpag) throw Error('libpag could not be downloaded');
      const base = (LIBS.src.libpag || LIBS.defs.libpag[0]).replace('libpag.min.js', ''),
        PAG = await libpag.PAGInit({ locateFile: (n) => base + n }),
        file = await PAG.PAGFile.load(f),
        w = file.width(),
        h = file.height(),
        c = mk(w, h);
      v.appendChild(c);
      const pv = await PAG.PAGView.init(file, c);
      pv.setRepeatCount(0);
      await pv.play();
      const fps = Math.round(file.frameRate()) || 30,
        n = Math.max(1, Math.round((file.duration() / 1e6) * fps));
      S = {
        w,
        h,
        fps,
        n,
        set: async (i) => {
          await pv.setProgress(i / n);
          await pv.flush();
        },
        draw: (cx, W, H) => cx.drawImage(c, 0, 0, W, H),
        stop: () => pv.pause(),
        go: () => pv.play(),
      };
      info({
        Format: 'PAG',
        Resolution: w + ' × ' + h,
        'Frame Rate': fps + ' FPS',
        Duration: (n / fps).toFixed(2) + ' S',
        'File Size': kb(f.size),
        'File Name': f.name,
      });
      fin();
    } catch (e) {
      v.textContent =
        'PAG needs libpag.wasm, which this page could not fetch here (' +
        (e.message || e) +
        '). It works when the page is hosted on your own site.';
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
    inf = async (d, t) =>
      new Uint8Array(await new Response(new Blob([d]).stream().pipeThrough(new DecompressionStream(t))).arrayBuffer()),
    inf2 = async (d) =>
      new Uint8Array(await new Response(new Blob([d]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
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
      for (const k in m.im) {
        const d = m.im[k],
          mt =
            d[0] === 0x89
              ? 'image/png'
              : d[0] === 0xff
                ? 'image/jpeg'
                : d[0] === 0x52
                  ? 'image/webp'
                  : d[0] === 0x47
                    ? 'image/gif'
                    : '';
        if (!mt) continue;
        try {
          const b = await createImageBitmap(new Blob([d], { type: mt }));
          bm[k] = b;
          const t = mk(b.width, b.height);
          t.getContext('2d').drawImage(b, 0, 0);
          A[k] = t.toDataURL('image/png');
        } catch (e) {}
      }
      window.SV = { m, bm };
      if (!m.n) m.n = Math.max(...m.sp.map((s) => s.fr.length), 1);
      const s = Math.min(2, 400 / Math.max(m.w, m.h)),
        cv = mk(Math.round(m.w * s), Math.round(m.h * s)),
        cx = cv.getContext('2d');
      v.appendChild(cv);
      let i = 0,
        run = true,
        ix = 0;
      const tk = setInterval(() => {
        if (!document.body.contains(cv)) return clearInterval(tk);
        if (!run) return;
        svPaint(cx, cv.width, cv.height, i);
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
    const A = x.getImageData(0, 0, cw, ch),
      d = C.data;
    for (let i = 0; i < d.length; i += 4) {
      const a = A.data[i];
      d[i + 3] = a;
      if (a > 0 && a < 255) {
        const k = 255 / a;
        d[i] = Math.min(255, d[i] * k);
        d[i + 1] = Math.min(255, d[i + 1] * k);
        d[i + 2] = Math.min(255, d[i + 2] * k);
      }
    }
    x.putImageData(C, 0, 0);
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
    const sc = Math.min(2, 400 / Math.max(S.w, S.h)),
      cv = mk(Math.round(S.w * sc), Math.round(S.h * sc)),
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
    async function svgaEnc(pngs, W, H, fps) {
      const n = pngs.length,
        parts = [ps2(1, '2.0.0'), pb(2, cat([pf(1, W), pf(2, H), pi(3, fps), pi(4, n)]))];
      for (let i = 0; i < n; i++)
        parts.push(pb(3, cat([ps2(1, 'f' + i), pb(2, new Uint8Array(await pngs[i].arrayBuffer()))])));
      const lay = pb(2, cat([pf(1, 0), pf(2, 0), pf(3, W), pf(4, H)])),
        tr = pb(3, cat([pf(1, 1), pf(2, 0), pf(3, 0), pf(4, 1), pf(5, 0), pf(6, 0)]));
      for (let i = 0; i < n; i++) {
        const fs = [];
        for (let k = 0; k < n; k++) fs.push(pb(2, cat([pf(1, k === i ? 1 : 0), lay, tr])));
        parts.push(pb(4, cat([ps2(1, 'f' + i), ...fs])));
      }
      return new Blob([await inf2(cat(parts))], { type: 'application/octet-stream' });
    }
    window.__svgaEnc = svgaEnc;
    const prev = $('#start').onclick;
    $('#start').onclick = async () => {
      const F = $('#fmt').value;
      if (!/^(lottie|dotlottie|svga|webp|apng|mov|pag)$/.test(F)) return prev();
      if (!cur || !S) return toast('Upload a supported file first');
      if (F === 'pag')
        return toast('PAG export needs Tencent’s PAGExporter (After Effects plugin); no browser encoder exists');
      const W = +$('#w').value || S.w,
        H = +$('#h').value || S.h,
        fps = Math.max(1, +$('#fps').value || 15),
        q = (+$('#qual').value || 100) / 100,
        base = cur.name.replace(/\.\w+$/, ''),
        btn = $('#start');
      btn.disabled = true;
      S.stop();
      try {
        if (F === 'mov') {
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
          await render(W, H, fps, async (c) => {
            fr.push(await window.pngQ(c, window.__cmp));
          });
          if (F === 'svga') {
            const sv = await svgaEnc(fr, W, H, fps);
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
      if (qv() >= 1) return false;
      if (!window.pako) (window as any).pako = pako;
      if (!window.UPNG) (window as any).UPNG = UPNG;
      if (!window.UPNG || !window.pako) {
        toast('Compression library could not load; saving uncompressed');
        return false;
      }
      return true;
    }
    window.cmpReady = ready;
    window.pngQ = async function (c, use) {
      if (!use) return bl(c, 'image/png');
      const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height);
      const colors = Math.max(16, Math.round(256 * qv()));
      return new Blob([UPNG.encode([d.data.buffer], c.width, c.height, colors)], { type: 'image/png' });
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
      const u = await inf(raw, 'deflate'),
        r = new PB(u),
        out = [];
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
          let nv = val;
          if (val && val[0] === 0x89) {
            const bm = await createImageBitmap(new Blob([val])),
              c = mk(bm.width, bm.height);
            c.getContext('2d').drawImage(bm, 0, 0);
            const nb = new Uint8Array(await (await window.pngQ(c, true)).arrayBuffer());
            if (nb.length < val.length) nv = nb;
          }
          const kb2 = cat([pv((1 << 3) | 2), pv(key.length), key]),
            vb = cat([pv((2 << 3) | 2), pv(nv.length), nv]),
            e = cat([kb2, vb]);
          out.push(cat([pv((3 << 3) | 2), pv(e.length), e]));
        } else {
          r.skip(w);
          out.push(u.subarray(st, r.p));
        }
      }
      return new Blob([await inf2(cat(out))], { type: 'application/octet-stream' });
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
      const ok = L && (await ready());
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
      const sc = Math.min(2, 400 / Math.max(S.w, S.h)) * previewZoom,
        d = document.createElement('div');
      d.style.cssText = 'width:' + Math.round(S.w * sc) + 'px;height:' + Math.round(S.h * sc) + 'px';
      v.appendChild(d);
      const pl = new SVGA.Player(d);
      pl.setVideoItem(vi);
      pl.startAnimation();
      cv.remove();
      window.SVP = pl;
      syncPreviewSize(S.w, S.h);
      pl.onFrame((fr) => window.PA && window.PA.sync(fr / (S.fps || 20)));
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
    } catch (e) {}
  }
  const _ae = applyEdit;
  applyEdit = async function (u, k) {
    (window.EDIT = window.EDIT || {})[k] = u;
    if (window.SVP)
      try {
        window.SVP.setImage(u, k);
      } catch (e) {}
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
    async function svgaParts(f) {
      const raw = new Uint8Array(await f.arrayBuffer());
      if (raw[0] === 0x50) return null;
      const u = await inf(raw, 'deflate'),
        r = new PB(u),
        ents = [],
        imgs = {};
      while (!r.end) {
        const t = r.vi(),
          fl = t >>> 3,
          w = t & 7;
        if (fl === 5 && w === 2) {
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
            else if (g === 2) v = q.by();
            else return 0;
            return 1;
          });
          imgs[k] = v;
        } else r.skip(w);
      }
      return { u, ents, imgs };
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
        r = new PB(u),
        out = [];
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
          if (drop && ak.has(ks)) continue;
          let nv = val;
          const ed = o.edits && o.edits[ks];
          if (ed || (o.comp && val && val[0] === 0x89)) {
            const nb = new Uint8Array(
              await (await window.pngQ(await toCv(ed || new Blob([val])), !!o.comp)).arrayBuffer()
            );
            nv = ed || nb.length < val.length ? nb : val;
          }
          const e = cat([pv((1 << 3) | 2), pv(key.length), key, pv((2 << 3) | 2), pv(nv.length), nv]);
          out.push(cat([pv((3 << 3) | 2), pv(e.length), e]));
        } else if (fl === 5 && w === 2) {
          r.by();
          if (!drop) out.push(u.subarray(st, r.p));
        } else {
          r.skip(w);
          out.push(u.subarray(st, r.p));
        }
      }
      if (au && au.set) {
        const n = Math.max(1, Math.min(o.n || 1, Math.ceil(au.dur * (o.fps || 20)))),
          ae = cat([ps2(1, 'audio_0'), pi(2, 0), pi(3, n), pi(4, 0), pi(5, Math.round(au.dur * 1000))]);
        out.push(pb(5, ae), pb(3, cat([ps2(1, 'audio_0'), pb(2, au.set)])));
      }
      const wmLayers: AppliedWatermarkLayer[] = (window as any).__WATERMARK_LAYERS || [];
      if (wmLayers.length > 0) {
        const totalFrames = Math.max(1, o.n || (S && S.n) || 1);
        for (const wm of wmLayers) {
          const url = A[wm.imageKey] || wm.dataUrl;
          if (!url) continue;
          const pngBytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
          out.push(pb(3, cat([ps2(1, wm.imageKey), pb(2, pngBytes)])));
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
          out.push(pb(4, cat([ps2(1, wm.imageKey), ...allFrames])));
        }
      }
      return new Blob([await inf2(cat(out))], { type: 'application/octet-stream' });
    }
    window.svgaPatch = svgaPatch;
    LIBS.defs.Howl = ['https://cdn.jsdelivr.net/npm/howler@2.2.4/dist/howler.core.min.js'];
    LIBS.defs.lamejs = ['https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js'];
    async function encodeMp3(buf, vol) {
      await getLib('lamejs');
      if (!window.lamejs) throw Error('MP3 encoder (lamejs) could not load');
      const ch = Math.min(2, buf.numberOfChannels),
        enc = new lamejs.Mp3Encoder(ch, buf.sampleRate, 128),
        cv = (x) => {
          const o = new Int16Array(x.length);
          for (let i = 0; i < x.length; i++) {
            const v = Math.max(-1, Math.min(1, x[i] * vol));
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
        if (a.length) parts.push(Uint8Array.from(a));
      }
      const e = enc.flush();
      if (e.length) parts.push(Uint8Array.from(e));
      return cat(parts);
    }
    const finalAudio = (window.finalAudio = () => {
      if (AU.del) return null;
      const s = AU.add || AU.cur;
      return s ? { buf: s.buf, vol: AU.vol, bytes: s.bytes, isMp3: s.mp3 } : null;
    });
    const mp3For = async (a) => (a.isMp3 && a.vol === 1 && a.bytes ? a.bytes : encodeMp3(a.buf, a.vol));
    window.svgaAddAudio = async (b, fps, n) => {
      const a = finalAudio();
      if (!a) return b;
      try {
        return await svgaPatch(b, { audio: { set: await mp3For(a), dur: a.buf.duration }, fps, n });
      } catch (e) {
        toast(e.message + ' - saved without audio');
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
        ext = cur ? cur.name.split('.').pop().toLowerCase() : '',
        L = (+$('#qual').value || 100) < 100;
      if (
        cur &&
        ext === 'svga' &&
        (F === 'orig' || F === 'svga') &&
        !(window as any).__edgeFeather?.enabled
      ) {
        const ed = Object.keys(window.EDIT).length;
        if (!ed && !AU.dirty && !L) return dl(cur, cur.name);
        const b = $('#start');
        b.disabled = true;
        try {
          const comp = L && (await window.cmpReady());
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
          await dl(
            await svgaPatch(cur, { edits: eb, comp, audio, fps: S.fps, n: S.n }),
            cur.name.replace(/\.svga$/i, '') + '_edit.svga'
          );
        } catch (e) {
          toast(e.message || 'Export failed');
        } finally {
          b.disabled = false;
        }
        return;
      }
      return prevS();
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
    async function detect(f) {
      const ext = f.name.split('.').pop().toLowerCase();
      let by = null,
        nm = 'Embedded audio',
        keep = null;
      try {
        if (ext === 'svga') {
          const P = await svgaParts(f);
          if (!P) return;
          if (P.ents && P.ents.length && P.imgs[P.ents[0].key]) {
            by = P.imgs[P.ents[0].key];
            nm = P.ents[0].key;
          } else if (P.imgs) {
            for (const [k, v] of Object.entries(P.imgs)) {
              if (isMp3(v)) {
                by = v;
                nm = k;
                break;
              }
            }
          }
          keep = by && by.slice();
        } else if (/^(mp4|mov|webm|vap|yyeva)$/.test(ext)) {
          by = f.__rawBytes ? f.__rawBytes.slice() : new Uint8Array(await f.arrayBuffer());
          const fp = bidx(by, 'ftyp');
          if (fp > 4 && fp < 65536) by = by.subarray(fp - 4);
        }
        if (!by || by.byteLength < 16) return;
        const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        const decoderCtx = OAC ? new OAC(2, 48000, 48000) : actx();
        const ab = by.buffer.slice(by.byteOffset, by.byteOffset + by.byteLength);
        const buf = await decoderCtx.decodeAudioData(ab);
        if (cur !== f || !buf || !buf.length) return;
        AU.cur = { name: nm, buf, bytes: keep, mp3: isMp3(keep) };
        setBox();
        window.PA && window.PA.restart();
      } catch (e) {}
    }
    const _lz = load;
    load = async function (f) {
      stopP();
      Object.assign(AU, { cur: null, add: null, vol: 1, del: false, dirty: false });
      window.EDIT = {};
      setBox();
      await _lz(f);
      detect(f);
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
        if (!a) return;
        const c = C(),
          s = c.createBufferSource(),
          g = c.createGain();
        this.dur = a.buf.duration;
        s.buffer = a.buf;
        s.loop = true;
        g.gain.value = this.muted ? 0 : a.vol;
        s.connect(g);
        g.connect(c.destination);
        s.start(0, off % a.buf.duration);
        this.src = s;
        this.g = g;
        this.t0 = c.currentTime - off;
        this.on = true;
        if (c.state !== 'running') c.resume().catch(() => {});
      },
      restart() {
        if (!(window.finalAudio && window.finalAudio()) || !S || S.paused) return this.stop();
        this.start(this.t || 0);
      },
      sync(t) {
        this.t = t;
        if (!this.on || !this.dur || C().state !== 'running') return;
        const d = Math.abs((this.pos() % this.dur) - (t % this.dur));
        if (d > 0.35 && d < this.dur - 0.35) this.start(t);
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
        PA.t = S.vid.currentTime;
        if (!S.vid.paused) PA.sync(PA.t);
      }
      requestAnimationFrame(pump);
    })();
    document.getElementById('aoe').addEventListener('click', () => setTimeout(() => PA.restart(), 0));
    const sndBtn = $('#snd');
    if (sndBtn) sndBtn.textContent = 'Muted';
    $('#snd').onclick = function () {
      if (!(window.finalAudio && window.finalAudio())) return toast('No audio in this file');
      PA.muted = !PA.muted;
      if (PA.g) PA.g.gain.value = PA.muted ? 0 : window.finalAudio().vol;
      this.textContent = PA.muted ? 'Muted' : 'Sound';
      if (!PA.muted && (!PA.on || !PA.src)) PA.restart();
    };
    const _pp = $('#pp').onclick;
    $('#pp').onclick = function () {
      _pp.call(this);
      if (S && S.paused) PA.stop();
      else if (!PA.muted) PA.restart();
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
      const sc = Math.min(2, 400 / Math.max(source.w, source.h)),
        cw = Math.max(1, Math.round(source.w * sc)),
        ch = Math.max(1, Math.round(source.h * sc));
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
    function applyVideoMetaAndLayout(source, m, f, meta) {
      if (!meta) {
        source.meta = null;
        source.w = m.videoWidth;
        source.h = m.videoHeight;
        if (source._alphaCanvas) source._alphaCanvas.style.display = 'none';
        m.style.cssText = '';
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
      info({
        Format: clamped.kind,
        'Alpha Layout': side === 'r' ? 'Alpha on right (Auto)' : 'Alpha on left (Auto)',
        Resolution: source.w + ' × ' + source.h,
        'Video Size': m.videoWidth + ' × ' + m.videoHeight,
        'Frame Rate': source.fps + ' FPS',
        Duration: m.duration.toFixed(2) + ' S',
        'File Size': kb(f.size),
        'File Name': f.name,
      });
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
      if ($('#trim').checked) {
        start = Number($('#trimStart').value);
        end = Number($('#trimEnd').value);
        if (
          !Number.isFinite(start) ||
          !Number.isFinite(end) ||
          start < 0 ||
          end <= start ||
          end > (S.vid ? S.vid.duration : S.n / S.fps) + 0.001
        )
          throw Error('Choose a valid trim range within the animation');
      }
      geometry(W, H);
      return { W, H, fps, q: quality / 100, start, end, nk: Math.max(1, Math.round((end - start) * fps)) };
    }
    async function encodeMP4(o) {
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
      const fail = (e) => {
          failure = e;
        },
        guard = () => {
          if (failure) throw failure;
        };
      try {
        ve = new VideoEncoder({
          output: (chunk, meta) => {
            try {
              mux.addVideoChunk(chunk, meta);
            } catch (e) {
              fail(e);
            }
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
              try {
                mux.addAudioChunk(chunk, meta);
              } catch (e) {
                fail(e);
              }
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
            total = Math.round((o.nk / o.fps) * sr),
            chunkLen = 960;
          for (let off = 0; off < total; off += chunkLen) {
            guard();
            const n = Math.min(chunkLen, total - off),
              data = new Float32Array(n * ch),
              srcOff = (o.start + off / sr) * srcSr;
            for (let c = 0; c < ch; c++) {
              const src = audio.buf.getChannelData(Math.min(c, audio.buf.numberOfChannels - 1));
              const resampled = resampleChannelFloat32(src, srcSr, sr, n, audio.vol, srcOff);
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
        direct = !!(
          M &&
          m &&
          $('#fit').value === 'stretch' &&
          +$('#scale').value === 100 &&
          $('#mirror').value === 'none' &&
          !(window as any).__edgeFeather?.enabled
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
        const origF = $('#fmt').value;
        let F = origF;
        const o = exportOptions();
        const featherOn = !!(window as any).__edgeFeather?.enabled;
        if (F === 'orig' && featherOn && !source.meta && cur) {
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
        try {
          if (F === 'vap' || F === 'yyeva') await exportVY(F);
          else if (['mp4', 'mov', 'dual'].includes(F)) await exportVideo(F);
          else if (F === 'orig' && source.meta) {
            const unchanged =
              o.W === S.w &&
              o.H === S.h &&
              Math.abs(o.fps - S.fps) < 0.001 &&
              o.q === 1 &&
              !window.AU.dirty &&
              !$('#trim').checked &&
              $('#mirror').value === 'none' &&
              +$('#scale').value === 100 &&
              $('#fit').value === 'stretch' &&
              !featherOn;
            if (unchanged) await dl(cur, cur.name);
            else await exportVY(source.meta.kind.toLowerCase());
          } else {
            const oldN = S.n,
              oldSet = S.set;
            try {
              if ($('#trim').checked) {
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
          status('Ready to export or save the project.');
        } else status('Could not open this file.');
      } catch (e) {
        S = null;
        status('Could not open file: ' + e.message);
        $('#view').textContent = 'Could not open file: ' + e.message;
      }
    };
    window.MotionTools = {
      readMediaMeta,
      packageVideo,
      boxes,
      saveProject,
      restoreProject,
      encodeMP4,
      load,
      version: '12.0-fixed',
    };
  })();
}
