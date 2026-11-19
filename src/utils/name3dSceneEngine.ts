import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  NAME3D_FONT_OPTIONS,
  NAME3D_SHAPE_STYLES,
  Name3DConfig,
  detectTextIsRtl,
  evaluateName3DAnimation,
  evaluatePiece3DTransform,
  extractContoursFromMask,
  sanitizeHexColor,
} from './name3dGeometry';
import { drawName3DBackgroundTo2D, hexToRgba } from './name3dExporter';

interface PieceEntry {
  group: THREE.Group;
  homeX: number;
  homeY: number;
  homeZ: number;
}

const _dummy = new THREE.Object3D();

function detectSoftwareWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function createFaceGradientTexture(
  config: Name3DConfig,
  shimmerOffset: number,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 256;
  const ctx = cv.getContext('2d');
  if (ctx) {
    if (config.faceGradientEnabled && config.faceColors.length >= 2) {
      const rad = ((config.faceGradientAngle ?? 135) * Math.PI) / 180;
      const cx = cv.width * 0.5;
      const cy = cv.height * 0.5;
      const r = Math.hypot(cv.width, cv.height) * 0.5;
      const grad = ctx.createLinearGradient(
        cx - Math.cos(rad) * r,
        cy - Math.sin(rad) * r,
        cx + Math.cos(rad) * r,
        cy + Math.sin(rad) * r
      );
      const stops = config.faceColors.map((c) => sanitizeHexColor(c, config.faceColor));
      stops.forEach((hex, idx) => {
        grad.addColorStop(idx / Math.max(1, stops.length - 1), hex);
      });
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, cv.width, cv.height);
    } else {
      ctx.fillStyle = sanitizeHexColor(config.faceColor, '#ffd966');
      ctx.fillRect(0, 0, cv.width, cv.height);
    }

    // Subtle luxury brushed metallic micro-grain
    ctx.globalAlpha = 0.06;
    for (let y = 0; y < cv.height; y += 3) {
      ctx.fillStyle = y % 6 === 0 ? '#ffffff' : '#000000';
      ctx.fillRect(0, y, cv.width, 1);
    }
    ctx.globalAlpha = 1;

    // Optional animated diagonal metallic sheen band baked onto face albedo
    if (config.animatedColorShimmer || config.animationId === 'goldShimmer' || config.animationId === 'metallicReflections') {
      const bandCenter = cv.width * (0.5 + shimmerOffset * 0.55);
      const bandW = cv.width * 0.22;
      const sheen = ctx.createLinearGradient(bandCenter - bandW, 0, bandCenter + bandW, cv.height * 0.65);
      sheen.addColorStop(0, 'rgba(255,255,255,0)');
      sheen.addColorStop(0.45, 'rgba(255,248,215,0.22)');
      sheen.addColorStop(0.5, 'rgba(255,252,235,0.42)');
      sheen.addColorStop(0.55, 'rgba(255,248,215,0.22)');
      sheen.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = sheen;
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

function createSideDepthTexture(
  sideColor: string,
  depthColor: string,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 256;
  const ctx = cv.getContext('2d');
  if (ctx) {
    // ExtrudeGeometry side UV.y runs along the Z depth from front bevel (0) to back wall (1)
    const grad = ctx.createLinearGradient(0, 0, 0, cv.height);
    grad.addColorStop(0, sanitizeHexColor(sideColor, '#d99316'));
    grad.addColorStop(0.32, sanitizeHexColor(sideColor, '#d99316'));
    grad.addColorStop(1, sanitizeHexColor(depthColor, '#6b4104'));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cv.width, cv.height);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

function createRadialGlowTexture(colorHex: string): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 256;
  const ctx = cv.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(128, 128, 8, 128, 128, 124);
    grad.addColorStop(0, hexToRgba(colorHex, 0.85));
    grad.addColorStop(0.35, hexToRgba(colorHex, 0.36));
    grad.addColorStop(0.7, hexToRgba(colorHex, 0.08));
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 128;
  const ctx = cv.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(128, 64, 10, 128, 64, 120);
    grad.addColorStop(0, 'rgba(0,0,0,0.72)');
    grad.addColorStop(0.45, 'rgba(0,0,0,0.34)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 128);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.needsUpdate = true;
  return tex;
}

export class Name3DSceneEngine {
  private container: HTMLElement;
  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private envTex: THREE.Texture | null = null;

  private masterGroup: THREE.Group;
  private pieces: PieceEntry[] = [];

  // Shared materials
  private faceMaterial: THREE.MeshPhysicalMaterial;
  private sideMaterial: THREE.MeshPhysicalMaterial;
  private backRimMaterial: THREE.MeshPhysicalMaterial;
  private faceTex: THREE.CanvasTexture | null = null;
  private sideTex: THREE.CanvasTexture | null = null;

  // Lights & Atmospheric elements
  private hemiLight: THREE.HemisphereLight;
  private keyLight: THREE.DirectionalLight;
  private rimLight: THREE.DirectionalLight;
  private shimmerLightA: THREE.PointLight;
  private shimmerLightB: THREE.PointLight;
  private haloSprite: THREE.Sprite;
  private haloTex: THREE.CanvasTexture;
  private contactShadowMesh: THREE.Mesh;
  private particlesMesh: THREE.InstancedMesh;
  private particleSeeds: Array<{ r: number; angle: number; y: number; speed: number; scale: number }> = [];

  private config: Name3DConfig;
  private geometrySignature = '';
  private lastShimmerBucket = -999;
  private phase = 0;
  private lastTimeMs = 0;
  private frameId = 0;
  private isRunning = false;
  private isDisposed = false;
  private resizeObserver: ResizeObserver | null = null;
  private handleContextLost: (e: Event) => void;
  private handleContextRestored: () => void;

  constructor(container: HTMLElement, initialConfig: Name3DConfig) {
    this.container = container;
    this.config = { ...initialConfig };
    this.isSoftwareGl = detectSoftwareWebGL();

    const width = Math.max(320, container.clientWidth || 800);
    const height = Math.max(240, container.clientHeight || 520);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const canvas = this.renderer.domElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.style.outline = 'none';
    container.appendChild(canvas);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 120);
    this.camera.position.set(0, 0.35, 11.2);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 4.5;
    this.controls.maxDistance = 22;

    // Mandatory procedural studio RoomEnvironment IBL reflections
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.envTex = envRT.texture;
    this.scene.environment = this.envTex;
    pmrem.dispose();

    // 3-Point Studio Lighting + Twin Specular Orbit Lights
    this.hemiLight = new THREE.HemisphereLight(0xdce8ff, 0x261d14, 0.75);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(0xfff4df, 2.2);
    this.keyLight.position.set(4.5, 6.2, 7.5);
    if (!this.isSoftwareGl) {
      this.keyLight.castShadow = true;
      this.keyLight.shadow.mapSize.set(1024, 1024);
      this.keyLight.shadow.camera.left = -6;
      this.keyLight.shadow.camera.right = 6;
      this.keyLight.shadow.camera.top = 4;
      this.keyLight.shadow.camera.bottom = -4;
      this.keyLight.shadow.bias = -0.0005;
      this.keyLight.shadow.normalBias = 0.02;
    }
    this.scene.add(this.keyLight);

    this.rimLight = new THREE.DirectionalLight(0x9ec5ff, 1.45);
    this.rimLight.position.set(-5.5, 2.5, -5.0);
    this.scene.add(this.rimLight);

    this.shimmerLightA = new THREE.PointLight(0xffdf8e, 4.5, 18, 1.4);
    this.shimmerLightA.position.set(3.2, 1.4, 4.2);
    this.scene.add(this.shimmerLightA);

    this.shimmerLightB = new THREE.PointLight(0xffffff, 2.8, 16, 1.5);
    this.shimmerLightB.position.set(-3.2, -1.2, 4.0);
    this.scene.add(this.shimmerLightB);

    // Master 3D Text Group
    this.masterGroup = new THREE.Group();
    this.scene.add(this.masterGroup);

    // Shared PBR Materials
    this.faceMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.92,
      roughness: 0.16,
      clearcoat: 0.8,
      clearcoatRoughness: 0.14,
      envMapIntensity: 1.5,
      transparent: true,
      opacity: 1,
    });

    this.sideMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.94,
      roughness: 0.24,
      clearcoat: 0.55,
      clearcoatRoughness: 0.2,
      envMapIntensity: 1.35,
      transparent: true,
      opacity: 1,
    });

    this.backRimMaterial = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(sanitizeHexColor(initialConfig.depthColor, '#6b4104')),
      metalness: 0.95,
      roughness: 0.26,
      clearcoat: 0.6,
      envMapIntensity: 1.2,
      transparent: true,
      opacity: 1,
    });

    // Volumetric Halo Glow Sprite behind the 3D Name
    this.haloTex = createRadialGlowTexture(initialConfig.glowColor);
    const haloMat = new THREE.SpriteMaterial({
      map: this.haloTex,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.haloSprite = new THREE.Sprite(haloMat);
    this.haloSprite.position.set(0, 0, -1.4);
    this.haloSprite.scale.set(9.5, 4.2, 1);
    this.scene.add(this.haloSprite);

    // Soft Contact Shadow Plane underneath the 3D Name
    const shadowGeo = new THREE.PlaneGeometry(8.5, 2.6);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: createContactShadowTexture(),
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    this.contactShadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    this.contactShadowMesh.rotation.x = -Math.PI / 2;
    this.contactShadowMesh.position.set(0, -1.65, 0);
    this.scene.add(this.contactShadowMesh);

    // Floating 3D Bokeh Sparkle Particles (InstancedMesh)
    const pCount = 42;
    const pGeo = new THREE.OctahedronGeometry(0.055, 0);
    const pMat = new THREE.MeshBasicMaterial({
      color: 0xffdf8e,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.particlesMesh = new THREE.InstancedMesh(pGeo, pMat, pCount);
    this.particlesMesh.frustumCulled = false;
    for (let i = 0; i < pCount; i++) {
      this.particleSeeds.push({
        r: 2.8 + ((i * 73) % 100) * 0.032,
        angle: (i / pCount) * Math.PI * 2,
        y: (((i * 37) % 100) / 100 - 0.5) * 4.2,
        speed: 0.14 + ((i * 19) % 10) * 0.025,
        scale: 0.55 + ((i * 29) % 10) * 0.12,
      });
    }
    this.scene.add(this.particlesMesh);

    // WebGL Context Loss safety
    this.handleContextLost = (e: Event) => {
      e.preventDefault();
      this.stop();
    };
    this.handleContextRestored = () => {
      this.updateMaterials(0, true);
      this.start();
    };
    canvas.addEventListener('webglcontextlost', this.handleContextLost, false);
    canvas.addEventListener('webglcontextrestored', this.handleContextRestored, false);

    // ResizeObserver for responsive container
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.handleResize());
      this.resizeObserver.observe(container);
    }

    this.applyConfig(initialConfig, true);
    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }
  }

  public handleResize(): void {
    if (this.isDisposed) return;
    const w = Math.max(240, this.container.clientWidth || 640);
    const h = Math.max(200, this.container.clientHeight || 420);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.renderSingleFrame();
  }

  public resetCamera(): void {
    this.camera.position.set(0, 0.35, 11.2);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    this.renderSingleFrame();
  }

  public applyConfig(next: Name3DConfig, forceRebuild = false): void {
    const prev = this.config;
    this.config = { ...next };

    const geomSig = [
      next.text,
      next.fontId,
      next.shapeStyleId,
      next.fontSize,
      next.letterThickness,
      next.extrudeDepth,
      next.letterSpacing,
    ].join('|');

    if (forceRebuild || geomSig !== this.geometrySignature) {
      this.geometrySignature = geomSig;
      this.rebuildTextMeshes();
    }

    const materialChanged =
      forceRebuild ||
      prev.faceColor !== next.faceColor ||
      prev.faceGradientEnabled !== next.faceGradientEnabled ||
      prev.faceGradientAngle !== next.faceGradientAngle ||
      prev.faceColors.join(',') !== next.faceColors.join(',') ||
      prev.sideColor !== next.sideColor ||
      prev.depthColor !== next.depthColor ||
      prev.shininess !== next.shininess ||
      prev.metalness !== next.metalness ||
      prev.reflectionStrength !== next.reflectionStrength ||
      prev.glowColor !== next.glowColor ||
      prev.glowStrength !== next.glowStrength ||
      prev.animatedColorShimmer !== next.animatedColorShimmer;

    if (materialChanged) {
      this.updateMaterials(0, true);
    }

    this.updateLightingAndAtmosphere(0, 1);
    this.applyAnimationAtPhase(this.phase);
    this.renderSingleFrame();
  }

  private disposeTextMeshes(): void {
    for (const p of this.pieces) {
      p.group.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          (obj as THREE.Mesh).geometry.dispose();
        }
      });
      this.masterGroup.remove(p.group);
    }
    this.pieces = [];
  }

  /**
   * Rasterizes Arabic/English/ornate text via native browser shaping, extracts closed vector contours
   * (including inner holes), and builds true 3D extruded bevelled meshes with normalized full-name UVs.
   */
  public rebuildTextMeshes(): void {
    this.disposeTextMeshes();

    const rawText = (this.config.text || '').trim() || 'سلطان الذهب';
    const fontOpt =
      NAME3D_FONT_OPTIONS.find((f) => f.id === this.config.fontId) || NAME3D_FONT_OPTIONS[0];
    const shapeStyle =
      NAME3D_SHAPE_STYLES.find((s) => s.id === this.config.shapeStyleId) || NAME3D_SHAPE_STYLES[0];
    const isRtl = detectTextIsRtl(rawText);

    // High-resolution offscreen rasterization canvas for crisp Arabic ligatures, dots & curves
    const rasterFontPx = 136;
    const padX = 54;
    const padY = 50;

    const measureCanvas = document.createElement('canvas');
    measureCanvas.width = 32;
    measureCanvas.height = 32;
    const mCtx = measureCanvas.getContext('2d');
    if (!mCtx) return;

    const fontDecl = `${fontOpt.weight} ${rasterFontPx}px ${fontOpt.cssFamily}`;
    mCtx.font = fontDecl;
    (mCtx as any).direction = isRtl ? 'rtl' : 'ltr';
    if (!isRtl && this.config.letterSpacing !== 0 && 'letterSpacing' in mCtx) {
      (mCtx as any).letterSpacing = `${this.config.letterSpacing}px`;
    }

    const metrics = mCtx.measureText(rawText);
    const extraSpacingPx = isRtl && this.config.letterSpacing > 0 ? this.config.letterSpacing * 3 : 0;
    const textW = Math.max(96, Math.ceil(metrics.width + extraSpacingPx));
    const maxCanvasW = 1040;
    const fitScale = textW + padX * 2 > maxCanvasW ? (maxCanvasW - padX * 2) / textW : 1;
    const drawFontPx = Math.max(42, Math.round(rasterFontPx * fitScale));

    const cw = Math.min(maxCanvasW, Math.ceil(textW * fitScale + padX * 2));
    const ch = Math.ceil(drawFontPx * 1.95 + padY * 2);

    const off = document.createElement('canvas');
    off.width = cw;
    off.height = ch;
    const ctx = off.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    ctx.clearRect(0, 0, cw, ch);
    ctx.font = `${fontOpt.weight} ${drawFontPx}px ${fontOpt.cssFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    (ctx as any).direction = isRtl ? 'rtl' : 'ltr';
    if ('letterSpacing' in ctx) {
      (ctx as any).letterSpacing = `${this.config.letterSpacing * 0.65}px`;
    }

    const cx = cw * 0.5;
    const cy = ch * 0.52;

    // Controlled thickness dilation preserves Arabic dots and inner letter holes cleanly
    const thicknessPx = (this.config.letterThickness / 100) * (drawFontPx * 0.085);
    ctx.fillStyle = '#ffffff';
    if (thicknessPx > 0.35) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = thicknessPx * 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeText(rawText, cx, cy);
    }
    ctx.fillText(rawText, cx, cy);

    const imgData = ctx.getImageData(0, 0, cw, ch);
    const data = imgData.data;
    const mask = new Uint8Array(cw * ch);
    let minX = cw,
      maxX = 0,
      minY = ch,
      maxY = 0;
    for (let y = 0; y < ch; y++) {
      const row = y * cw;
      for (let x = 0; x < cw; x++) {
        if (data[(row + x) * 4 + 3] >= 112) {
          mask[row + x] = 1;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX <= minX || maxY <= minY) return;

    const contours = extractContoursFromMask(mask, cw, ch, {
      smoothPasses: 2,
      simplifyEpsilon: 0.48,
      minArea: 5.5,
    });
    if (contours.length === 0) return;

    // Map pixel span into balanced Three.js world units scaled by fontSize
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const centerPxX = (minX + maxX) * 0.5;
    const centerPxY = (minY + maxY) * 0.5;

    const sizeFactor = this.config.fontSize / 96; // 0.5 .. 1.66
    const targetMaxW = 7.4 * sizeFactor;
    const targetMaxH = 2.45 * sizeFactor;
    const worldPerPx = Math.min(targetMaxW / spanX, targetMaxH / spanY);

    const baseDepth = (0.14 + (this.config.extrudeDepth / 100) * 1.15) * shapeStyle.depthMultiplier;
    const bevelBase = (0.032 + (this.config.letterThickness / 100) * 0.04) * sizeFactor;
    const bevelThickness = Math.min(baseDepth * 0.45, bevelBase * shapeStyle.bevelThicknessScale);
    const bevelSize = Math.min(0.11, bevelBase * 0.72 * shapeStyle.bevelSizeScale);

    const extrudeOpts: THREE.ExtrudeGeometryOptions = {
      depth: baseDepth,
      steps: 1,
      bevelEnabled: true,
      bevelThickness,
      bevelSize,
      bevelSegments: shapeStyle.bevelSegments,
      curveSegments: 6,
    };

    const totalWorldW = spanX * worldPerPx;
    const totalWorldH = spanY * worldPerPx;
    const halfTotalW = totalWorldW * 0.5;
    const halfTotalH = totalWorldH * 0.5;

    // Build each contour as an independent centered 3D mesh piece inside masterGroup
    for (const poly of contours) {
      const pieceWorldCenterX = (poly.centerX - centerPxX) * worldPerPx;
      const pieceWorldCenterY = -(poly.centerY - centerPxY) * worldPerPx;

      const shape = new THREE.Shape();
      poly.outer.forEach((pt, idx) => {
        const lx = (pt.x - poly.centerX) * worldPerPx;
        const ly = -(pt.y - poly.centerY) * worldPerPx;
        if (idx === 0) shape.moveTo(lx, ly);
        else shape.lineTo(lx, ly);
      });
      shape.closePath();

      for (const holePts of poly.holes) {
        const hole = new THREE.Path();
        holePts.forEach((pt, idx) => {
          const lx = (pt.x - poly.centerX) * worldPerPx;
          const ly = -(pt.y - poly.centerY) * worldPerPx;
          if (idx === 0) hole.moveTo(lx, ly);
          else hole.lineTo(lx, ly);
        });
        hole.closePath();
        shape.holes.push(hole);
      }

      const geo = new THREE.ExtrudeGeometry(shape, extrudeOpts);
      // Center along Z so rotation pivots cleanly through the sculptural middle of the 3D name
      geo.translate(0, 0, -baseDepth * 0.5);

      // Normalize UVs smoothly across the full name bounding box for seamless gradients & shimmer!
      const posAttr = geo.attributes.position;
      const uvAttr = geo.attributes.uv;
      const normAttr = geo.attributes.normal;
      if (posAttr && uvAttr && normAttr) {
        const zMin = -baseDepth * 0.5 - bevelThickness;
        const zSpan = Math.max(0.01, baseDepth + bevelThickness * 2);
        for (let i = 0; i < posAttr.count; i++) {
          const vx = posAttr.getX(i);
          const vy = posAttr.getY(i);
          const vz = posAttr.getZ(i);
          const nz = Math.abs(normAttr.getZ(i));

          if (nz > 0.55) {
            // Front / back face UV in [0..1] across entire name
            const u = Math.max(0, Math.min(1, (vx + pieceWorldCenterX + halfTotalW) / Math.max(0.01, totalWorldW)));
            const v = Math.max(0, Math.min(1, (vy + pieceWorldCenterY + halfTotalH) / Math.max(0.01, totalWorldH)));
            uvAttr.setXY(i, u, v);
          } else {
            // Side wall UV.y maps cleanly from front bevel (0) to deep back (1) for sideColor -> depthColor gradient
            const depthT = Math.max(0, Math.min(1, 1 - (vz - zMin) / zSpan));
            const u = Math.max(0, Math.min(1, (vx + pieceWorldCenterX + halfTotalW) / Math.max(0.01, totalWorldW)));
            uvAttr.setXY(i, u, depthT);
          }
        }
        uvAttr.needsUpdate = true;
      }

      geo.computeVertexNormals();

      const pieceGroup = new THREE.Group();
      pieceGroup.position.set(pieceWorldCenterX, pieceWorldCenterY, 0);

      const mainMesh = new THREE.Mesh(geo, [this.faceMaterial, this.sideMaterial]);
      mainMesh.castShadow = !this.isSoftwareGl;
      mainMesh.receiveShadow = !this.isSoftwareGl;
      pieceGroup.add(mainMesh);

      // Layered Crown style adds a secondary stepped back rim plate
      if (shapeStyle.hasBackRim) {
        const rimGeo = new THREE.ExtrudeGeometry(shape, {
          depth: baseDepth * 0.45,
          steps: 1,
          bevelEnabled: true,
          bevelThickness: bevelThickness * 0.7,
          bevelSize: bevelSize * 2.15,
          bevelSegments: 2,
          curveSegments: 6,
        });
        rimGeo.translate(0, 0, -baseDepth * 0.88);
        rimGeo.computeVertexNormals();
        const rimMesh = new THREE.Mesh(rimGeo, this.backRimMaterial);
        pieceGroup.add(rimMesh);
      }

      this.masterGroup.add(pieceGroup);
      this.pieces.push({
        group: pieceGroup,
        homeX: pieceWorldCenterX,
        homeY: pieceWorldCenterY,
        homeZ: 0,
      });
    }

    // Position contact shadow directly below text bounds
    this.contactShadowMesh.position.y = -halfTotalH - 0.55;
    this.contactShadowMesh.scale.set(Math.max(0.6, totalWorldW / 6.5), 1, 1);
    this.haloSprite.scale.set(Math.max(5.5, totalWorldW * 1.45), Math.max(2.8, totalWorldH * 2.1), 1);
  }

  private updateMaterials(shimmerOffset: number, forceTextures = false): void {
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const bucket = Math.round(shimmerOffset * 18);

    if (forceTextures || bucket !== this.lastShimmerBucket) {
      this.lastShimmerBucket = bucket;
      const nextFaceTex = createFaceGradientTexture(this.config, shimmerOffset, maxAniso);
      if (this.faceTex) this.faceTex.dispose();
      this.faceTex = nextFaceTex;
      this.faceMaterial.map = nextFaceTex;
      this.faceMaterial.needsUpdate = true;
    }

    if (forceTextures || !this.sideTex) {
      const nextSideTex = createSideDepthTexture(this.config.sideColor, this.config.depthColor, maxAniso);
      if (this.sideTex) this.sideTex.dispose();
      this.sideTex = nextSideTex;
      this.sideMaterial.map = nextSideTex;
      this.sideMaterial.needsUpdate = true;

      this.backRimMaterial.color.set(sanitizeHexColor(this.config.depthColor, '#6b4104'));
    }

    const metal = Math.max(0, Math.min(1, this.config.metalness / 100));
    const rough = Math.max(0.05, Math.min(0.88, 1 - (this.config.shininess / 100) * 0.92));
    const envIntensity = 0.25 + (this.config.reflectionStrength / 100) * 1.85;
    const clearcoat = Math.max(0, Math.min(1, this.config.shininess / 100));

    this.faceMaterial.metalness = metal;
    this.faceMaterial.roughness = rough;
    this.faceMaterial.envMapIntensity = envIntensity;
    this.faceMaterial.clearcoat = clearcoat;
    this.faceMaterial.clearcoatRoughness = Math.max(0.04, rough * 0.65);

    this.sideMaterial.metalness = Math.min(1, metal * 1.03);
    this.sideMaterial.roughness = Math.min(0.92, rough + 0.08);
    this.sideMaterial.envMapIntensity = envIntensity * 0.9;
    this.sideMaterial.clearcoat = clearcoat * 0.7;

    this.backRimMaterial.metalness = metal;
    this.backRimMaterial.roughness = Math.min(0.92, rough + 0.12);
    this.backRimMaterial.envMapIntensity = envIntensity * 0.85;

    const glowColor = sanitizeHexColor(this.config.glowColor, '#ffbe3d');
    this.faceMaterial.emissive.set(glowColor);
    this.sideMaterial.emissive.set(glowColor);

    if (forceTextures) {
      const nextHalo = createRadialGlowTexture(glowColor);
      this.haloTex.dispose();
      this.haloTex = nextHalo;
      (this.haloSprite.material as THREE.SpriteMaterial).map = nextHalo;
      (this.haloSprite.material as THREE.SpriteMaterial).needsUpdate = true;
      (this.particlesMesh.material as THREE.MeshBasicMaterial).color.set(glowColor);
    }
  }

  private updateLightingAndAtmosphere(lightOrbitAngle: number, glowBoost: number): void {
    const lightScale = Math.max(0.2, this.config.lightingIntensity / 100);
    this.hemiLight.intensity = 0.62 * lightScale;
    this.keyLight.intensity = 1.65 * lightScale;
    this.rimLight.intensity = 1.25 * lightScale;

    // Orbit specular shimmer point lights around the 3D letters
    const r = 5.4;
    this.shimmerLightA.position.set(
      Math.cos(lightOrbitAngle) * r,
      1.6 + Math.sin(lightOrbitAngle * 2) * 1.2,
      4.3 + Math.sin(lightOrbitAngle) * 1.5
    );
    this.shimmerLightB.position.set(
      Math.cos(lightOrbitAngle + Math.PI) * r,
      -1.4 + Math.cos(lightOrbitAngle * 2) * 1.1,
      4.0
    );

    const extraShimmerLight =
      this.config.animationId === 'goldShimmer' ||
      this.config.animationId === 'lightReflection' ||
      this.config.animationId === 'metallicReflections' ||
      this.config.animatedColorShimmer
        ? 1.3
        : 0.7;
    this.shimmerLightA.intensity = 2.4 * lightScale * extraShimmerLight;
    this.shimmerLightB.intensity = 1.5 * lightScale * extraShimmerLight;
    this.shimmerLightA.color.set(sanitizeHexColor(this.config.glowColor, '#ffdf8e'));

    // Glow emissive + halo sprite
    const glowNorm = Math.max(0, Math.min(1, this.config.glowStrength / 100));
    const emissiveStrength = glowNorm * 0.42 * glowBoost;
    this.faceMaterial.emissiveIntensity = emissiveStrength;
    this.sideMaterial.emissiveIntensity = emissiveStrength * 0.72;

    const haloMat = this.haloSprite.material as THREE.SpriteMaterial;
    const hideAtmosphereForTransparent = this.config.bgMode === 'transparent';
    this.haloSprite.visible = !hideAtmosphereForTransparent && glowNorm > 0.02;
    haloMat.opacity = Math.min(0.9, glowNorm * 0.75 * glowBoost);

    // Contact shadow intensity
    const shadowMat = this.contactShadowMesh.material as THREE.MeshBasicMaterial;
    const shadowNorm = Math.max(0, Math.min(1, this.config.shadowIntensity / 100));
    this.contactShadowMesh.visible = !hideAtmosphereForTransparent && shadowNorm > 0.02;
    shadowMat.opacity = shadowNorm * 0.65;

    // 3D floating particles
    this.particlesMesh.visible = !hideAtmosphereForTransparent && this.config.bgParticlesEnabled;
  }

  private updateParticles(phase: number): void {
    if (!this.particlesMesh.visible) return;
    const t = phase * Math.PI * 2;
    for (let i = 0; i < this.particleSeeds.length; i++) {
      const s = this.particleSeeds[i];
      const ang = s.angle + t * s.speed;
      const x = Math.cos(ang) * s.r * 1.35;
      const y = s.y + Math.sin(t + i) * 0.28;
      const z = Math.sin(ang) * s.r * 0.65 - 1.2;
      const pulse = s.scale * (0.7 + 0.35 * Math.sin(t * 2 + i));
      _dummy.position.set(x, y, z);
      _dummy.rotation.set(t + i, t * 0.7 + i, 0);
      _dummy.scale.setScalar(pulse);
      _dummy.updateMatrix();
      this.particlesMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.particlesMesh.instanceMatrix.needsUpdate = true;
  }

  public applyAnimationAtPhase(phase: number): void {
    const master = evaluateName3DAnimation(
      this.config.animationId,
      phase,
      this.config.animationDirection,
      {
        x: this.config.viewAngleX,
        y: this.config.viewAngleY,
        z: this.config.viewAngleZ,
      }
    );

    this.masterGroup.position.set(master.posX, master.posY, master.posZ);
    this.masterGroup.rotation.set(master.rotX, master.rotY, master.rotZ);
    this.masterGroup.scale.setScalar(master.scale);

    this.faceMaterial.opacity = master.opacity;
    this.sideMaterial.opacity = master.opacity;
    this.backRimMaterial.opacity = master.opacity;

    const pieceCount = this.pieces.length;
    for (let i = 0; i < pieceCount; i++) {
      const piece = this.pieces[i];
      const pt = evaluatePiece3DTransform(
        this.config.animationId,
        phase,
        this.config.animationDirection,
        i,
        pieceCount
      );
      piece.group.position.set(
        piece.homeX + pt.offsetX,
        piece.homeY + pt.offsetY,
        piece.homeZ + pt.offsetZ
      );
      piece.group.rotation.set(pt.rotX, pt.rotY, pt.rotZ);
      piece.group.scale.setScalar(pt.scale);
    }

    if (
      this.config.animatedColorShimmer ||
      this.config.animationId === 'goldShimmer' ||
      this.config.animationId === 'metallicReflections'
    ) {
      this.updateMaterials(master.shimmerOffset, false);
    }
    this.updateLightingAndAtmosphere(master.lightOrbitAngle, master.glowBoost);
    this.updateParticles(phase);
  }

  public renderSingleFrame(): void {
    if (this.isDisposed) return;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  private scheduleSoftwareAfterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (!this.isRunning || this.isDisposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const status = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (status === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 6);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 6);
    } else {
      this.frameId = window.setTimeout(cb, 90);
    }
  }

  private tick = (): void => {
    if (!this.isRunning || this.isDisposed) return;
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0, (now - this.lastTimeMs) / 1000));
    this.lastTimeMs = now;

    if (this.config.isPlaying && this.config.animationId !== 'none') {
      const dur = Math.max(0.5, this.config.animationDuration);
      this.phase += (dt * this.config.animationSpeed) / dur;
    } else if (this.config.isPlaying && (this.config.animatedColorShimmer || this.config.bgParticlesEnabled)) {
      this.phase += dt * 0.25;
    }

    this.applyAnimationAtPhase(this.phase);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.scheduleSoftwareAfterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  public start(): void {
    if (this.isRunning || this.isDisposed) return;
    this.isRunning = true;
    this.lastTimeMs = performance.now();
    this.tick();
  }

  public stop(): void {
    this.isRunning = false;
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      clearTimeout(this.frameId);
      this.frameId = 0;
    }
  }

  /**
   * Renders a deterministic high-resolution frame onto a 2D canvas for PNG / GIF / MP4 export.
   */
  public renderExportFrameToContext(
    targetCtx: CanvasRenderingContext2D,
    width: number,
    height: number,
    phase: number,
    forceTransparent: boolean
  ): void {
    const prevSize = new THREE.Vector2();
    this.renderer.getSize(prevSize);
    const prevAspect = this.camera.aspect;
    const prevPixelRatio = this.renderer.getPixelRatio();
    const prevHaloVis = this.haloSprite.visible;
    const prevParticlesVis = this.particlesMesh.visible;
    const prevShadowVis = this.contactShadowMesh.visible;

    try {
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();

      this.applyAnimationAtPhase(phase);

      if (forceTransparent) {
        this.haloSprite.visible = false;
        this.particlesMesh.visible = false;
        this.contactShadowMesh.visible = false;
      }

      this.renderer.setClearColor(0x000000, 0);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);

      // Composite background + WebGL render onto target 2D canvas
      drawName3DBackgroundTo2D(targetCtx, width, height, this.config, forceTransparent);
      targetCtx.drawImage(this.renderer.domElement, 0, 0, width, height);
    } finally {
      this.haloSprite.visible = prevHaloVis;
      this.particlesMesh.visible = prevParticlesVis;
      this.contactShadowMesh.visible = prevShadowVis;
      this.renderer.setPixelRatio(prevPixelRatio);
      this.renderer.setSize(prevSize.x, prevSize.y, false);
      this.camera.aspect = prevAspect;
      this.camera.updateProjectionMatrix();
      this.renderSingleFrame();
    }
  }

  public getCurrentPhase(): number {
    return this.phase;
  }

  public dispose(): void {
    this.isDisposed = true;
    this.stop();
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);

    this.disposeTextMeshes();
    this.faceMaterial.dispose();
    this.sideMaterial.dispose();
    this.backRimMaterial.dispose();
    if (this.faceTex) this.faceTex.dispose();
    if (this.sideTex) this.sideTex.dispose();
    this.haloTex.dispose();
    (this.haloSprite.material as THREE.Material).dispose();
    this.contactShadowMesh.geometry.dispose();
    (this.contactShadowMesh.material as THREE.MeshBasicMaterial).map?.dispose();
    (this.contactShadowMesh.material as THREE.Material).dispose();
    this.particlesMesh.geometry.dispose();
    (this.particlesMesh.material as THREE.Material).dispose();
    if (this.envTex) this.envTex.dispose();
    this.controls.dispose();
    this.renderer.dispose();
    if (canvas.parentElement === this.container) {
      this.container.removeChild(canvas);
    }
  }
}
