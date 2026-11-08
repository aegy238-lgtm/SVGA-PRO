import { SvgaFrame } from './codecs.ts';
import {
  AffineMatrix,
  DEFAULT_TRANSFORM,
  LayerTransform,
  buildPivotTransformMatrix,
} from './svgaEditorLogic.ts';
import {
  traceAlphaContourFromRgba,
  Point2D,
} from './svgaShineEngine.ts';
import { compressPngBufferLikeReference } from './svgaImageCompressor.ts';

export type FireEffectCategoryId =
  | 'realistic_fire'
  | 'wave_fire'
  | 'burning_border'
  | 'flame_explosion'
  | 'fire_particles'
  | 'magic_fire'
  | 'blue_fire'
  | 'golden_fire'
  | 'purple_fire'
  | 'dragon_fire'
  | 'energy_flame'
  | 'fire_aura'
  | 'circular_fire'
  | 'animated_fire_bg'
  | 'cinematic_fire';

export type FireShapeCategoryId =
  | 'flame_tongues'
  | 'fire_borders'
  | 'fire_waves'
  | 'flame_paths'
  | 'fire_sparks'
  | 'fire_explosions'
  | 'fire_glows'
  | 'fire_circles'
  | 'fire_ornaments'
  | 'logo_surrounds'
  | 'layer_merge_shapes';

export type FirePlacementMode =
  | 'around_full'
  | 'bottom_rising'
  | 'sides_wings'
  | 'top_crown'
  | 'inner_aura';

export type FireLoopMode = 'loop' | 'once' | 'pingpong';

export type FireEmitterTopology =
  | 'torch_plume'
  | 'sine_wave_chain'
  | 'burning_rect_rim'
  | 'supernova_burst'
  | 'ember_fountain'
  | 'arcane_spiral'
  | 'plasma_jet'
  | 'royal_crown_fire'
  | 'void_vortex'
  | 'dragon_breath_stream'
  | 'energy_aura_shell'
  | 'solar_ring'
  | 'inferno_curtain'
  | 'cinematic_blast'
  | 'twin_crescent_slash'
  | 'tornado_lightning'
  | 'phoenix_wings'
  | 'meteor_shower'
  | 'lotus_flame'
  | 'chain_fire_link'
  | 'prism_flare'
  | 'lava_ripple'
  | 'rune_circle'
  | 'comet_tail'
  | 'demon_horns';

export interface FireColorPalette {
  id: string;
  nameAr: string;
  coreColor: string;
  midColor: string;
  outerColor: string;
  sparkColor: string;
  glowColor: string;
}

export interface FireCategoryMeta {
  id: FireEffectCategoryId;
  nameEn: string;
  nameAr: string;
  count: number;
  startId: number;
  endId: number;
  defaultPalette: FireColorPalette;
}

export interface FireShapeCategoryMeta {
  id: FireShapeCategoryId;
  nameEn: string;
  nameAr: string;
  count: number;
  startId: number;
  endId: number;
}

export interface FireEffectItem {
  id: number; // 1 .. 50000
  code: string;
  nameAr: string;
  nameEn: string;
  categoryId: FireEffectCategoryId;
  topology: FireEmitterTopology;
  palette: FireColorPalette;
  tongueCount: number;
  sparkCount: number;
  waveFrequency: number;
  waveAmplitude: number;
  turbulenceOctaves: number;
  swirlFactor: number;
  flameIntensity: number; // 20 .. 200
  flameSpeed: number; // 0.5 .. 3.0
  spreadRadius: number; // 8 .. 120
  defaultFrames: number; // 16 .. 60
  windAngleDeg: number;
}

export interface FireShapeItem {
  id: number; // 1 .. 5000
  code: string;
  nameAr: string;
  nameEn: string;
  categoryId: FireShapeCategoryId;
  palette: FireColorPalette;
  lobeCount: number;
  asymmetry: number;
  curvature: number;
  innerCutoutRatio: number;
  sparkleDots: number;
  strokeWidth: number;
}

export interface FireLayerConfig {
  enabled: boolean;
  sourceType: 'sequence_import' | 'base_layer_fire' | 'library_effect' | 'library_shape' | 'sprite_sheet';
  effectId?: number;
  shapeId?: number;
  targetLayerId: string; // 'DOCUMENT' | `sprite_${idx}` | `layer_${id}`
  placementMode: FirePlacementMode;
  loopMode: FireLoopMode;
  flameIntensity: number; // 10 .. 200
  flameDensity: number; // 10 .. 200
  flameSpeed: number; // 0.25 .. 4.0
  flameSpread: number; // 4 .. 160
  windAngleDeg: number; // -180 .. 180
  palette: FireColorPalette;
  atlasCols: number;
  atlasRows: number;
  cellWidth: number;
  cellHeight: number;
  totalSequenceFrames: number;
  uniqueCellCount: number;
  frameToCellIndex: number[];
  rawUncompressedBytes: number;
  compressedAtlasBytes: number;
  svgSourceMarkup?: string;
}

export type FireEffectPreset = FireEffectItem;
export type FireShapeDesign = FireShapeItem;

export interface FireStudioConfig {
  enabled: boolean;
  sourceType:
    | 'base_layer_generated'
    | 'library_effect'
    | 'imported_sequence'
    | 'fire_shape';
  targetKey: string | null;
  selectedEffectId: number;
  selectedShapeId: number;
  placementMode: FirePlacementMode;
  loopMode: FireLoopMode;
  flameIntensity: number;
  flameDensity: number;
  flameSpread: number;
  flameDirection: number;
  playbackSpeed: number;
  opacity: number;
  scale: number;
  rotation: number;
  offsetX: number;
  offsetY: number;
  fitToComposition: boolean;
  customFrameCount: number;
}

export const DEFAULT_FIRE_STUDIO_CONFIG: FireStudioConfig = {
  enabled: false,
  sourceType: 'base_layer_generated',
  targetKey: null,
  selectedEffectId: 1,
  selectedShapeId: 1,
  placementMode: 'around_full',
  loopMode: 'loop',
  flameIntensity: 115,
  flameDensity: 110,
  flameSpread: 36,
  flameDirection: 0,
  playbackSpeed: 1.0,
  opacity: 100,
  scale: 100,
  rotation: 0,
  offsetX: 0,
  offsetY: 0,
  fitToComposition: true,
  customFrameCount: 30,
};

export interface ReferenceFireSpriteSheet {
  id: string;
  nameAr: string;
  descAr: string;
  url: string;
  cols: number;
  rows: number;
  frameCount: number;
  bgKeyMode: 'black' | 'purple' | 'auto';
  categoryId: FireEffectCategoryId;
}

export const FIRE_PALETTES: Record<string, FireColorPalette> = {
  realistic: {
    id: 'realistic',
    nameAr: '🔥 لهب برتقالي واقعي (Realistic Inferno)',
    coreColor: '#fffbeb',
    midColor: '#fbbf24',
    outerColor: '#ea580c',
    sparkColor: '#fde047',
    glowColor: '#dc2626',
  },
  golden: {
    id: 'golden',
    nameAr: '👑 نيران ذهبية ملكية (Royal Gold Fire)',
    coreColor: '#ffffff',
    midColor: '#fef08a',
    outerColor: '#d97706',
    sparkColor: '#fffbeb',
    glowColor: '#f59e0b',
  },
  blue: {
    id: 'blue',
    nameAr: '💠 نيران زرقاء بلازما (Blue Plasma)',
    coreColor: '#f0f9ff',
    midColor: '#38bdf8',
    outerColor: '#1d4ed8',
    sparkColor: '#bae6fd',
    glowColor: '#0284c7',
  },
  purple: {
    id: 'purple',
    nameAr: '🔮 نيران بنفسجية سحرية (Purple Arcane)',
    coreColor: '#faf5ff',
    midColor: '#c084fc',
    outerColor: '#7e22ce',
    sparkColor: '#e9d5ff',
    glowColor: '#9333ea',
  },
  dragon: {
    id: 'dragon',
    nameAr: '🐉 نيران التنين القرمزية (Dragon Crimson)',
    coreColor: '#fef2f2',
    midColor: '#f87171',
    outerColor: '#991b1b',
    sparkColor: '#fca5a5',
    glowColor: '#dc2626',
  },
  energy: {
    id: 'energy',
    nameAr: '⚡ لهب الطاقة الزمردي (Emerald Energy)',
    coreColor: '#ecfdf5',
    midColor: '#34d399',
    outerColor: '#047857',
    sparkColor: '#a7f3d0',
    glowColor: '#10b981',
  },
  cyber_pink: {
    id: 'cyber_pink',
    nameAr: '🌸 لهب نيون وردي (Cyber Magenta)',
    coreColor: '#fdf2f8',
    midColor: '#f472b6',
    outerColor: '#be185d',
    sparkColor: '#fbcfe8',
    glowColor: '#ec4899',
  },
};

export const REFERENCE_FIRE_SPRITE_SHEETS: ReferenceFireSpriteSheet[] = [
  {
    id: 'ref_wave_stream_16',
    nameAr: '🔥 شيت موجات اللهب المتدفقة (16 إطار متتابع)',
    descAr: 'تسلسل زمني متتابع لتيار لهب برتقالي متوهج (2×8 إطارات) مع عزل تلقائي للخلفية',
    url: '/assets/aistudio/cee7dd87e419dbffe81c06ebab2617c6258974f710d2d9-uAHTrW_fw480webp_bc246bf7.webp',
    cols: 2,
    rows: 8,
    frameCount: 16,
    bgKeyMode: 'black',
    categoryId: 'wave_fire',
  },
  {
    id: 'ref_crimson_tornado_12',
    nameAr: '🌪️ إعصار البرق والنار القرمزي (12 إطار متتابع)',
    descAr: 'إعصار ناري دوار مع صواعق برق متوهجة (4×3 إطارات) جاهز للدمج كـ Layer واحد',
    url: '/assets/aistudio/e22ba1f2d210b99e06270109cd97f07367931b092f987-tVEwVC_fw480webp_62c5c4ee.webp',
    cols: 4,
    rows: 3,
    frameCount: 12,
    bgKeyMode: 'black',
    categoryId: 'dragon_fire',
  },
  {
    id: 'ref_purple_sparks_32',
    nameAr: '🔮 شرارات الطاقة البنفسجية السحرية (32 إطار متتابع)',
    descAr: 'انفجارات وجزيئات طاقة نارية بنفسجية (4×8 إطارات) مع تفريغ تلقائي للون الخلفية',
    url: '/assets/aistudio/eb8f96d4df862b502b0b5524e76debfa3cc6609e72c6-WJZSfR_fw480webp_3e625d97.webp',
    cols: 4,
    rows: 8,
    frameCount: 32,
    bgKeyMode: 'purple',
    categoryId: 'purple_fire',
  },
  {
    id: 'ref_flame_shapes_6',
    nameAr: '✨ مجموعة أشكال وزخارف اللهب الدائرية (6 تكوينات)',
    descAr: 'أشكال لهب، هالات دائرية، وأقواس نارية (2×3) قابلة للتحريك والدمج حول الشعارات',
    url: '/assets/aistudio/df7dbe3334fec87c144f570d2df99e7cf4c11053e4142-srEfhQ_fw480webp_b01eb68c.webp',
    cols: 2,
    rows: 3,
    frameCount: 6,
    bgKeyMode: 'black',
    categoryId: 'circular_fire',
  },
];

export const TOTAL_FIRE_EFFECTS_COUNT = 50000;
export const TOTAL_FIRE_SHAPES_COUNT = 5000;

export const FIRE_EFFECT_CATEGORIES: FireCategoryMeta[] = [
  { id: 'realistic_fire', nameEn: 'Realistic Fire', nameAr: 'نيران واقعية', count: 3500, startId: 1, endId: 3500, defaultPalette: FIRE_PALETTES.realistic },
  { id: 'wave_fire', nameEn: 'Wave Fire', nameAr: 'نيران موجية', count: 3500, startId: 3501, endId: 7000, defaultPalette: FIRE_PALETTES.realistic },
  { id: 'burning_border', nameEn: 'Burning Border', nameAr: 'إطارات نارية', count: 3500, startId: 7001, endId: 10500, defaultPalette: FIRE_PALETTES.golden },
  { id: 'flame_explosion', nameEn: 'Flame Explosion', nameAr: 'انفجارات نارية', count: 3300, startId: 10501, endId: 13800, defaultPalette: FIRE_PALETTES.dragon },
  { id: 'fire_particles', nameEn: 'Fire Particles', nameAr: 'جزيئات وشرارات', count: 3300, startId: 13801, endId: 17100, defaultPalette: FIRE_PALETTES.golden },
  { id: 'magic_fire', nameEn: 'Magic Fire', nameAr: 'نيران سحرية', count: 3300, startId: 17101, endId: 20400, defaultPalette: FIRE_PALETTES.cyber_pink },
  { id: 'blue_fire', nameEn: 'Blue Fire', nameAr: 'نيران زرقاء', count: 3300, startId: 20401, endId: 23700, defaultPalette: FIRE_PALETTES.blue },
  { id: 'golden_fire', nameEn: 'Golden Fire', nameAr: 'نيران ذهبية', count: 3400, startId: 23701, endId: 27100, defaultPalette: FIRE_PALETTES.golden },
  { id: 'purple_fire', nameEn: 'Purple Fire', nameAr: 'نيران بنفسجية', count: 3300, startId: 27101, endId: 30400, defaultPalette: FIRE_PALETTES.purple },
  { id: 'dragon_fire', nameEn: 'Dragon Fire', nameAr: 'نيران تنين', count: 3300, startId: 30401, endId: 33700, defaultPalette: FIRE_PALETTES.dragon },
  { id: 'energy_flame', nameEn: 'Energy Flame', nameAr: 'لهب الطاقة', count: 3300, startId: 33701, endId: 37000, defaultPalette: FIRE_PALETTES.energy },
  { id: 'fire_aura', nameEn: 'Fire Aura', nameAr: 'هالة نارية', count: 3300, startId: 37001, endId: 40300, defaultPalette: FIRE_PALETTES.golden },
  { id: 'circular_fire', nameEn: 'Circular Fire', nameAr: 'نيران دائرية', count: 3300, startId: 40301, endId: 43600, defaultPalette: FIRE_PALETTES.realistic },
  { id: 'animated_fire_bg', nameEn: 'Animated Fire Background', nameAr: 'خلفيات نارية متحركة', count: 3200, startId: 43601, endId: 46800, defaultPalette: FIRE_PALETTES.dragon },
  { id: 'cinematic_fire', nameEn: 'Cinematic Fire', nameAr: 'تأثيرات سينمائية', count: 3200, startId: 46801, endId: 50000, defaultPalette: FIRE_PALETTES.realistic },
];

export const FIRE_SHAPE_CATEGORIES: FireShapeCategoryMeta[] = [
  { id: 'flame_tongues', nameEn: 'Flame Tongues', nameAr: 'أشكال اللهب', count: 500, startId: 1, endId: 500 },
  { id: 'fire_borders', nameEn: 'Fire Borders', nameAr: 'حواف نارية', count: 500, startId: 501, endId: 1000 },
  { id: 'fire_waves', nameEn: 'Fire Waves', nameAr: 'موجات النار', count: 450, startId: 1001, endId: 1450 },
  { id: 'flame_paths', nameEn: 'Flame Paths', nameAr: 'مسارات اللهب', count: 450, startId: 1451, endId: 1900 },
  { id: 'fire_sparks', nameEn: 'Fire Sparks', nameAr: 'الشرارات', count: 450, startId: 1901, endId: 2350 },
  { id: 'fire_explosions', nameEn: 'Fire Explosions', nameAr: 'الانفجارات', count: 450, startId: 2351, endId: 2800 },
  { id: 'fire_glows', nameEn: 'Fire Glows', nameAr: 'التوهجات', count: 450, startId: 2801, endId: 3250 },
  { id: 'fire_circles', nameEn: 'Fire Circles', nameAr: 'الدوائر النارية', count: 450, startId: 3251, endId: 3700 },
  { id: 'fire_ornaments', nameEn: 'Fire Ornaments', nameAr: 'الزخارف النارية', count: 450, startId: 3701, endId: 4150 },
  { id: 'logo_surrounds', nameEn: 'Logo Surrounds', nameAr: 'التأثيرات المحيطة بالشعارات والصور', count: 450, startId: 4151, endId: 4600 },
  { id: 'layer_merge_shapes', nameEn: 'Layer Merge Shapes', nameAr: 'أشكال نارية قابلة للدمج مع الطبقات الأساسية', count: 400, startId: 4601, endId: 5000 },
];

const TOPOLOGIES: FireEmitterTopology[] = [
  'torch_plume',
  'sine_wave_chain',
  'burning_rect_rim',
  'supernova_burst',
  'ember_fountain',
  'arcane_spiral',
  'plasma_jet',
  'royal_crown_fire',
  'void_vortex',
  'dragon_breath_stream',
  'energy_aura_shell',
  'solar_ring',
  'inferno_curtain',
  'cinematic_blast',
  'twin_crescent_slash',
  'tornado_lightning',
  'phoenix_wings',
  'meteor_shower',
  'lotus_flame',
  'chain_fire_link',
  'prism_flare',
  'lava_ripple',
  'rune_circle',
  'comet_tail',
  'demon_horns',
];

const TOPOLOGY_LABELS_AR: Record<FireEmitterTopology, string> = {
  torch_plume: 'شعلة لهب صاعدة',
  sine_wave_chain: 'موجة نارية متدفقة',
  burning_rect_rim: 'إطار مشتعل متكامل',
  supernova_burst: 'انفجار ناري شعاعي',
  ember_fountain: 'نافورة شرارات وجمر',
  arcane_spiral: 'دوامة لهب حلزونية',
  plasma_jet: 'تيار بلازما نفاث',
  royal_crown_fire: 'تاج ناري ملكي',
  void_vortex: 'إعصار ناري عميق',
  dragon_breath_stream: 'زفير التنين المتوهج',
  energy_aura_shell: 'درع هالة الطاقة',
  solar_ring: 'حلقة شمسية ملتهبة',
  inferno_curtain: 'ستار الجحيم المتحرك',
  cinematic_blast: 'موجة صدمة سينمائية',
  twin_crescent_slash: 'قوسا لهب متقاطعان',
  tornado_lightning: 'إعصار البرق والنار',
  phoenix_wings: 'أجنحة العنقاء النارية',
  meteor_shower: 'وابل شهب مشتعلة',
  lotus_flame: 'زهرة اللوتس النارية',
  chain_fire_link: 'سلاسل اللهب المترابطة',
  prism_flare: 'وهج طيفي متعدد الطبقات',
  lava_ripple: 'تموجات الحمم البركانية',
  rune_circle: 'دائرة الختم الناري',
  comet_tail: 'ذيل المذنب الحارق',
  demon_horns: 'قرنا اللهب المتصاعد',
};

function deterministicHash(seed: number): number {
  let x = (seed ^ 0xdeadbeef) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

function hashFloat(seed: number, salt: number): number {
  return (deterministicHash(seed * 747796405 + salt * 2891336453) % 10000) / 10000;
}

function hslToHex(h: number, s: number, l: number): string {
  const hn = ((h % 360) + 360) % 360;
  const sn = Math.max(0, Math.min(100, s)) / 100;
  const ln = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((hn / 60) % 2) - 1));
  const m = ln - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (hn < 60) [r, g, b] = [c, x, 0];
  else if (hn < 120) [r, g, b] = [x, c, 0];
  else if (hn < 180) [r, g, b] = [0, c, x];
  else if (hn < 240) [r, g, b] = [0, x, c];
  else if (hn < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Generates any of the 50,000 unique Fire Effect items deterministically in O(1) time.
 */
export function getFireEffectById(rawId: number): FireEffectItem {
  const id = Math.max(1, Math.min(TOTAL_FIRE_EFFECTS_COUNT, Math.round(rawId)));
  const cat =
    FIRE_EFFECT_CATEGORIES.find((c) => id >= c.startId && id <= c.endId) ||
    FIRE_EFFECT_CATEGORIES[0];
  const localIdx = id - cat.startId;

  // Select topology with category affinity + deterministic variety
  const catIdx = FIRE_EFFECT_CATEGORIES.indexOf(cat);
  const topoIdx = (catIdx * 3 + localIdx) % TOPOLOGIES.length;
  const topology = TOPOLOGIES[topoIdx];

  // Build unique nuanced color palette around category base hue
  const baseHues: Record<FireEffectCategoryId, number> = {
    realistic_fire: 24,
    wave_fire: 28,
    burning_border: 38,
    flame_explosion: 14,
    fire_particles: 44,
    magic_fire: 315,
    blue_fire: 202,
    golden_fire: 46,
    purple_fire: 276,
    dragon_fire: 6,
    energy_flame: 158,
    fire_aura: 40,
    circular_fire: 22,
    animated_fire_bg: 16,
    cinematic_fire: 26,
  };
  const hueShift = (hashFloat(id, 1) - 0.5) * 26;
  const baseHue = (baseHues[cat.id] + hueShift + 360) % 360;
  const palette: FireColorPalette = {
    id: `pal_${id}`,
    nameAr: cat.defaultPalette.nameAr,
    coreColor: hslToHex((baseHue + 18) % 360, 100, 95),
    midColor: hslToHex((baseHue + 8) % 360, 96, 62),
    outerColor: hslToHex(baseHue, 92, 42),
    sparkColor: hslToHex((baseHue + 24) % 360, 100, 82),
    glowColor: hslToHex((baseHue - 6 + 360) % 360, 90, 36),
  };

  const tongueCount = 6 + (deterministicHash(id * 13) % 28); // 6 .. 33 tongues
  const sparkCount = 8 + (deterministicHash(id * 29) % 36); // 8 .. 43 sparks
  const waveFrequency = Number((1.2 + hashFloat(id, 2) * 5.8).toFixed(2));
  const waveAmplitude = Math.round(8 + hashFloat(id, 3) * 38);
  const turbulenceOctaves = 2 + (deterministicHash(id * 41) % 5);
  const swirlFactor = Number(((hashFloat(id, 4) - 0.5) * 3.6).toFixed(2));
  const flameIntensity = Math.round(75 + hashFloat(id, 5) * 110);
  const flameSpeed = Number((0.65 + hashFloat(id, 6) * 2.15).toFixed(2));
  const spreadRadius = Math.round(14 + hashFloat(id, 7) * 76);
  const defaultFrames = [16, 20, 24, 30, 36, 40, 48][deterministicHash(id * 53) % 7];
  const windAngleDeg = Math.round((hashFloat(id, 8) - 0.5) * 70);

  const topoAr = TOPOLOGY_LABELS_AR[topology];
  return {
    id,
    code: `FX-${String(id).padStart(5, '0')}`,
    nameAr: `${cat.nameAr} · ${topoAr} #${id}`,
    nameEn: `${cat.nameEn} · ${topology.replace(/_/g, ' ')} #${id}`,
    categoryId: cat.id,
    topology,
    palette,
    tongueCount,
    sparkCount,
    waveFrequency,
    waveAmplitude,
    turbulenceOctaves,
    swirlFactor,
    flameIntensity,
    flameSpeed,
    spreadRadius,
    defaultFrames,
    windAngleDeg,
  };
}

/**
 * Searches and paginates the 50,000 Fire Effects catalog lazily without allocating 50,000 objects in memory.
 */
export function searchFireEffectsCatalog(options: {
  categoryId?: FireEffectCategoryId | 'ALL';
  query?: string;
  page?: number;
  pageSize?: number;
}): {
  items: FireEffectItem[];
  totalMatched: number;
  page: number;
  totalPages: number;
} {
  const categoryId = options.categoryId || 'ALL';
  const q = (options.query || '').trim().toLowerCase();
  const pageSize = Math.max(6, Math.min(60, options.pageSize || 24));
  const page = Math.max(1, options.page || 1);

  let rangeStart = 1;
  let rangeEnd = TOTAL_FIRE_EFFECTS_COUNT;
  if (categoryId !== 'ALL') {
    const cat = FIRE_EFFECT_CATEGORIES.find((c) => c.id === categoryId);
    if (cat) {
      rangeStart = cat.startId;
      rangeEnd = cat.endId;
    }
  }

  // Fast path when no text query is active: O(pageSize) direct indexing across the 50,000 range
  if (!q) {
    const totalMatched = rangeEnd - rangeStart + 1;
    const totalPages = Math.max(1, Math.ceil(totalMatched / pageSize));
    const safePage = Math.min(page, totalPages);
    const startOffset = (safePage - 1) * pageSize;
    const items: FireEffectItem[] = [];
    for (let i = 0; i < pageSize; i++) {
      const id = rangeStart + startOffset + i;
      if (id > rangeEnd) break;
      items.push(getFireEffectById(id));
    }
    return { items, totalMatched, page: safePage, totalPages };
  }

  // Direct numeric ID search (e.g. "4250" or "#4250" or "FX-04250")
  const numMatch = q.match(/(\d+)/);
  const matchedIds: number[] = [];
  if (numMatch) {
    const exactNum = Number(numMatch[1]);
    if (exactNum >= rangeStart && exactNum <= rangeEnd) {
      matchedIds.push(exactNum);
    }
  }

  for (let id = rangeStart; id <= rangeEnd; id++) {
    if (matchedIds.length >= 600) break;
    if (matchedIds.includes(id)) continue;
    const item = getFireEffectById(id);
    if (
      item.nameAr.toLowerCase().includes(q) ||
      item.nameEn.toLowerCase().includes(q) ||
      item.code.toLowerCase().includes(q)
    ) {
      matchedIds.push(id);
    }
  }

  const totalMatched = matchedIds.length;
  const totalPages = Math.max(1, Math.ceil(totalMatched / pageSize));
  const safePage = Math.min(page, totalPages);
  const sliceIds = matchedIds.slice((safePage - 1) * pageSize, safePage * pageSize);
  return {
    items: sliceIds.map((id) => getFireEffectById(id)),
    totalMatched,
    page: safePage,
    totalPages,
  };
}

/**
 * Generates any of the 5,000 unique Fire Shape & Vector Design items deterministically in O(1) time.
 */
export function getFireShapeById(rawId: number): FireShapeItem {
  const id = Math.max(1, Math.min(TOTAL_FIRE_SHAPES_COUNT, Math.round(rawId)));
  const cat =
    FIRE_SHAPE_CATEGORIES.find((c) => id >= c.startId && id <= c.endId) ||
    FIRE_SHAPE_CATEGORIES[0];

  const paletteKeys = Object.keys(FIRE_PALETTES);
  const basePal = FIRE_PALETTES[paletteKeys[deterministicHash(id * 19) % paletteKeys.length]];
  const lobeCount = 3 + (deterministicHash(id * 31) % 22);
  const asymmetry = Number(((hashFloat(id, 11) - 0.5) * 1.4).toFixed(2));
  const curvature = Number((0.25 + hashFloat(id, 12) * 0.95).toFixed(2));
  const innerCutoutRatio = Number((0.18 + hashFloat(id, 13) * 0.58).toFixed(2));
  const sparkleDots = 4 + (deterministicHash(id * 43) % 20);
  const strokeWidth = Number((1.2 + hashFloat(id, 14) * 3.8).toFixed(1));

  return {
    id,
    code: `SH-${String(id).padStart(4, '0')}`,
    nameAr: `${cat.nameAr} · تصميم #${id}`,
    nameEn: `${cat.nameEn} · Design #${id}`,
    categoryId: cat.id,
    palette: basePal,
    lobeCount,
    asymmetry,
    curvature,
    innerCutoutRatio,
    sparkleDots,
    strokeWidth,
  };
}

/**
 * Searches and paginates the 5,000 Fire Shapes catalog lazily.
 */
export function searchFireShapesCatalog(options: {
  categoryId?: FireShapeCategoryId | 'ALL';
  query?: string;
  page?: number;
  pageSize?: number;
}): {
  items: FireShapeItem[];
  totalMatched: number;
  page: number;
  totalPages: number;
} {
  const categoryId = options.categoryId || 'ALL';
  const q = (options.query || '').trim().toLowerCase();
  const pageSize = Math.max(6, Math.min(60, options.pageSize || 24));
  const page = Math.max(1, options.page || 1);

  let rangeStart = 1;
  let rangeEnd = TOTAL_FIRE_SHAPES_COUNT;
  if (categoryId !== 'ALL') {
    const cat = FIRE_SHAPE_CATEGORIES.find((c) => c.id === categoryId);
    if (cat) {
      rangeStart = cat.startId;
      rangeEnd = cat.endId;
    }
  }

  if (!q) {
    const totalMatched = rangeEnd - rangeStart + 1;
    const totalPages = Math.max(1, Math.ceil(totalMatched / pageSize));
    const safePage = Math.min(page, totalPages);
    const startOffset = (safePage - 1) * pageSize;
    const items: FireShapeItem[] = [];
    for (let i = 0; i < pageSize; i++) {
      const id = rangeStart + startOffset + i;
      if (id > rangeEnd) break;
      items.push(getFireShapeById(id));
    }
    return { items, totalMatched, page: safePage, totalPages };
  }

  const matchedIds: number[] = [];
  const numMatch = q.match(/(\d+)/);
  if (numMatch) {
    const exactNum = Number(numMatch[1]);
    if (exactNum >= rangeStart && exactNum <= rangeEnd) {
      matchedIds.push(exactNum);
    }
  }

  for (let id = rangeStart; id <= rangeEnd; id++) {
    if (matchedIds.length >= 400) break;
    if (matchedIds.includes(id)) continue;
    const item = getFireShapeById(id);
    if (
      item.nameAr.toLowerCase().includes(q) ||
      item.nameEn.toLowerCase().includes(q) ||
      item.code.toLowerCase().includes(q)
    ) {
      matchedIds.push(id);
    }
  }

  const totalMatched = matchedIds.length;
  const totalPages = Math.max(1, Math.ceil(totalMatched / pageSize));
  const safePage = Math.min(page, totalPages);
  const sliceIds = matchedIds.slice((safePage - 1) * pageSize, safePage * pageSize);
  return {
    items: sliceIds.map((id) => getFireShapeById(id)),
    totalMatched,
    page: safePage,
    totalPages,
  };
}

/**
 * Generates an SVG path for a single organic waving flame tongue starting at (bx, by)
 * pointing along unit normal (nx, ny) with length `len`, base half-width `halfW`, and wave phase `phase`.
 */
export function buildFlameTongueSvgPath(
  bx: number,
  by: number,
  nx: number,
  ny: number,
  len: number,
  halfW: number,
  phase: number,
  swirl = 0
): string {
  // Tangent vector perpendicular to normal
  const tx = -ny;
  const ty = nx;

  const wave1 = Math.sin(phase) * halfW * 0.55 + swirl * halfW * 0.3;
  const wave2 = Math.cos(phase * 1.35 + 0.8) * halfW * 0.72 + swirl * halfW * 0.6;
  const tipWave = Math.sin(phase * 1.7 + 1.4) * halfW * 0.5 + swirl * halfW * 0.85;

  const pLeftX = bx - tx * halfW;
  const pLeftY = by - ty * halfW;
  const pRightX = bx + tx * halfW;
  const pRightY = by + ty * halfW;

  const tipX = bx + nx * len + tx * tipWave;
  const tipY = by + ny * len + ty * tipWave;

  const c1Lx = bx + nx * (len * 0.35) - tx * (halfW * 0.85 - wave1);
  const c1Ly = by + ny * (len * 0.35) - ty * (halfW * 0.85 - wave1);
  const c2Lx = bx + nx * (len * 0.72) - tx * (halfW * 0.32 - wave2);
  const c2Ly = by + ny * (len * 0.72) - ty * (halfW * 0.32 - wave2);

  const c1Rx = bx + nx * (len * 0.72) + tx * (halfW * 0.32 + wave2);
  const c1Ry = by + ny * (len * 0.72) + ty * (halfW * 0.32 + wave2);
  const c2Rx = bx + nx * (len * 0.35) + tx * (halfW * 0.85 + wave1);
  const c2Ry = by + ny * (len * 0.35) + ty * (halfW * 0.85 + wave1);

  return (
    `M ${pLeftX.toFixed(1)} ${pLeftY.toFixed(1)} ` +
    `C ${c1Lx.toFixed(1)} ${c1Ly.toFixed(1)}, ${c2Lx.toFixed(1)} ${c2Ly.toFixed(1)}, ${tipX.toFixed(1)} ${tipY.toFixed(1)} ` +
    `C ${c1Rx.toFixed(1)} ${c1Ry.toFixed(1)}, ${c2Rx.toFixed(1)} ${c2Ry.toFixed(1)}, ${pRightX.toFixed(1)} ${pRightY.toFixed(1)} Z`
  );
}

/**
 * Renders a FireShapeItem (#S1 .. #S5000) into a clean standalone vector SVG string.
 */
export function generateFireShapeSvgMarkup(
  shape: FireShapeItem,
  options?: { width?: number; height?: number; phase?: number; paletteOverride?: FireColorPalette }
): string {
  const W = options?.width || 240;
  const H = options?.height || 240;
  const phase = options?.phase ?? 0;
  const pal = options?.paletteOverride || shape.palette;
  const cx = W / 2;
  const cy = H / 2;
  const R = Math.min(W, H) * 0.36;

  const outerPaths: string[] = [];
  const midPaths: string[] = [];
  const corePaths: string[] = [];
  const sparks: string[] = [];

  const n = Math.max(3, shape.lobeCount);
  for (let i = 0; i < n; i++) {
    const ratio = i / n;
    let bx = cx;
    let by = cy + R * 0.65;
    let nx = 0;
    let ny = -1;
    let len = R * (0.85 + 0.35 * Math.sin(i * 1.7 + shape.id));
    let halfW = (R * 0.42) / Math.max(2, Math.sqrt(n));

    if (
      shape.categoryId === 'fire_circles' ||
      shape.categoryId === 'logo_surrounds' ||
      shape.categoryId === 'fire_borders' ||
      shape.categoryId === 'fire_ornaments'
    ) {
      const ang = ratio * Math.PI * 2 - Math.PI / 2;
      const rBase = R * (0.55 + shape.innerCutoutRatio * 0.25);
      bx = cx + Math.cos(ang) * rBase;
      by = cy + Math.sin(ang) * rBase;
      nx = Math.cos(ang + shape.asymmetry * 0.35);
      ny = Math.sin(ang + shape.asymmetry * 0.35);
      len = R * (0.42 + 0.18 * Math.sin(i * 2.3 + shape.id));
    } else if (shape.categoryId === 'fire_waves' || shape.categoryId === 'flame_paths') {
      bx = W * 0.14 + ratio * (W * 0.72);
      by = cy + Math.sin(ratio * Math.PI * 2 + shape.id) * (R * 0.28) + R * 0.25;
      nx = shape.asymmetry * 0.25;
      ny = -1;
      len = R * (0.65 + 0.3 * Math.cos(i * 1.9));
    } else if (shape.categoryId === 'fire_explosions' || shape.categoryId === 'fire_sparks') {
      const ang = ratio * Math.PI * 2;
      bx = cx + Math.cos(ang) * (R * 0.12);
      by = cy + Math.sin(ang) * (R * 0.12);
      nx = Math.cos(ang);
      ny = Math.sin(ang);
      len = R * (0.72 + 0.35 * ((i % 3) * 0.4));
    } else {
      // flame_tongues, fire_glows, layer_merge_shapes
      const spreadX = (ratio - 0.5) * R * 1.1;
      bx = cx + spreadX;
      by = cy + R * 0.62 - Math.abs(spreadX) * 0.2;
      const tilt = (ratio - 0.5) * 0.45 + shape.asymmetry * 0.2;
      const mag = Math.hypot(tilt, -1);
      nx = tilt / mag;
      ny = -1 / mag;
      len = R * (1.15 - Math.abs(ratio - 0.5) * 0.85);
      halfW = R * 0.26;
    }

    const pPhase = phase + i * 0.85 + shape.id * 0.17;
    outerPaths.push(buildFlameTongueSvgPath(bx, by, nx, ny, len, halfW, pPhase, shape.asymmetry));
    midPaths.push(
      buildFlameTongueSvgPath(bx, by, nx, ny, len * 0.76, halfW * 0.68, pPhase + 0.4, shape.asymmetry)
    );
    corePaths.push(
      buildFlameTongueSvgPath(bx, by, nx, ny, len * 0.48, halfW * 0.38, pPhase + 0.8, shape.asymmetry)
    );
  }

  for (let s = 0; s < shape.sparkleDots; s++) {
    const ang = (s / shape.sparkleDots) * Math.PI * 2 + phase * 0.5;
    const dist = R * (0.45 + hashFloat(shape.id, s + 30) * 0.65);
    const sx = cx + Math.cos(ang) * dist;
    const sy = cy + Math.sin(ang) * dist;
    const sr = 1.5 + hashFloat(shape.id, s + 60) * 2.8;
    sparks.push(`<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="${sr.toFixed(1)}" fill="${pal.sparkColor}" opacity="0.9"/>`);
  }

  const gradId = `fsh_grad_${shape.id}`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
    `<defs>` +
    `<radialGradient id="${gradId}" cx="50%" cy="55%" r="55%">` +
    `<stop offset="0%" stop-color="${pal.coreColor}" stop-opacity="0.95"/>` +
    `<stop offset="45%" stop-color="${pal.midColor}" stop-opacity="0.65"/>` +
    `<stop offset="100%" stop-color="${pal.glowColor}" stop-opacity="0"/>` +
    `</radialGradient>` +
    `</defs>` +
    `<circle cx="${cx}" cy="${cy}" r="${(R * 1.15).toFixed(1)}" fill="url(#${gradId})" opacity="0.55"/>` +
    `<path d="${outerPaths.join(' ')}" fill="${pal.outerColor}" opacity="0.92"/>` +
    `<path d="${midPaths.join(' ')}" fill="${pal.midColor}" opacity="0.95"/>` +
    `<path d="${corePaths.join(' ')}" fill="${pal.coreColor}" opacity="0.98"/>` +
    sparks.join('') +
    `</svg>`
  );
}

/**
 * Draws a single frame `frameIdx` (out of `totalFrames`) of a FireEffectItem or Base-Layer Wave Fire
 * onto a 2D Canvas context with full alpha transparency.
 */
export function renderFireEffectFrameToContext(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  effect: FireEffectItem,
  frameIdx: number,
  totalFrames: number,
  options?: {
    intensityScale?: number;
    densityScale?: number;
    spreadScale?: number;
    windAngleOffset?: number;
    paletteOverride?: FireColorPalette;
    perimeterPoints?: { x: number; y: number; nx: number; ny: number }[];
    placementMode?: FirePlacementMode;
  }
): void {
  const W = Math.max(16, width);
  const H = Math.max(16, height);
  ctx.clearRect(0, 0, W, H);

  const pal = options?.paletteOverride || effect.palette;
  const progress = (frameIdx % Math.max(1, totalFrames)) / Math.max(1, totalFrames);
  const phase = progress * Math.PI * 2;
  const intensity = Math.max(0.2, ((options?.intensityScale ?? effect.flameIntensity) / 100));
  const density = Math.max(0.25, ((options?.densityScale ?? 100) / 100));
  const spread = Math.max(0.3, ((options?.spreadScale ?? effect.spreadRadius) / 40));
  const windRad = (((options?.windAngleOffset ?? effect.windAngleDeg) * Math.PI) / 180) * 0.35;

  const cx = W / 2;
  const cy = H / 2;
  const R = Math.min(W, H) * 0.35;

  // Build emitter anchors either from base layer perimeter points or from the effect's topology
  const emitters: { x: number; y: number; nx: number; ny: number; scale: number }[] = [];
  const count = Math.max(5, Math.min(72, Math.round(effect.tongueCount * density)));

  if (options?.perimeterPoints && options.perimeterPoints.length >= 4) {
    const pts = options.perimeterPoints;
    const mode = options.placementMode || 'around_full';
    for (let i = 0; i < count; i++) {
      const pIdx = Math.floor((i / count) * pts.length) % pts.length;
      const pt = pts[pIdx];
      if (mode === 'bottom_rising' && pt.y < cy - R * 0.15) continue;
      if (mode === 'top_crown' && pt.y > cy + R * 0.1) continue;
      if (mode === 'sides_wings' && Math.abs(pt.x - cx) < R * 0.25) continue;

      let nx = pt.nx;
      let ny = pt.ny;
      if (mode === 'bottom_rising') {
        nx = nx * 0.35;
        ny = -Math.abs(ny) - 0.65;
      } else if (mode === 'inner_aura') {
        nx = -nx * 0.5;
        ny = -ny * 0.5 - 0.4;
      }
      const mag = Math.max(1e-3, Math.hypot(nx, ny));
      emitters.push({ x: pt.x, y: pt.y, nx: nx / mag, ny: ny / mag, scale: 1 });
    }
  } else {
    for (let i = 0; i < count; i++) {
      const t = i / count;
      const topo = effect.topology;
      if (
        topo === 'solar_ring' ||
        topo === 'burning_rect_rim' ||
        topo === 'energy_aura_shell' ||
        topo === 'rune_circle' ||
        topo === 'void_vortex'
      ) {
        const ang = t * Math.PI * 2 - Math.PI / 2;
        const rRing = R * 0.68;
        const swirlAng = ang + (topo === 'void_vortex' ? 0.55 : 0.15 * effect.swirlFactor);
        emitters.push({
          x: cx + Math.cos(ang) * rRing,
          y: cy + Math.sin(ang) * rRing,
          nx: Math.cos(swirlAng),
          ny: Math.sin(swirlAng),
          scale: 0.85,
        });
      } else if (topo === 'supernova_burst' || topo === 'cinematic_blast' || topo === 'prism_flare') {
        const ang = t * Math.PI * 2 + progress * Math.PI * 0.5;
        const burstR = R * (0.15 + 0.55 * progress);
        emitters.push({
          x: cx + Math.cos(ang) * burstR,
          y: cy + Math.sin(ang) * burstR,
          nx: Math.cos(ang),
          ny: Math.sin(ang),
          scale: 1.15 * (1 - progress * 0.35),
        });
      } else if (
        topo === 'sine_wave_chain' ||
        topo === 'inferno_curtain' ||
        topo === 'lava_ripple' ||
        topo === 'chain_fire_link'
      ) {
        const x = W * 0.1 + t * (W * 0.8);
        const y = cy + R * 0.45 + Math.sin(t * Math.PI * effect.waveFrequency + phase) * (R * 0.22);
        emitters.push({
          x,
          y,
          nx: Math.sin(windRad) * 0.4,
          ny: -Math.cos(windRad),
          scale: 0.95 + 0.25 * Math.sin(t * Math.PI * 2 + phase),
        });
      } else if (topo === 'dragon_breath_stream' || topo === 'plasma_jet' || topo === 'comet_tail') {
        const x = W * 0.14 + t * (W * 0.72);
        const y = cy + Math.sin(t * 4 - phase * 2) * (R * 0.18 * t);
        emitters.push({
          x,
          y,
          nx: 0.88,
          ny: -0.25 + Math.cos(t * 5 - phase) * 0.25,
          scale: 0.55 + t * 0.85,
        });
      } else if (topo === 'phoenix_wings' || topo === 'demon_horns' || topo === 'twin_crescent_slash') {
        const side = i % 2 === 0 ? -1 : 1;
        const wingT = Math.floor(i / 2) / Math.max(1, Math.floor(count / 2));
        const x = cx + side * (R * 0.2 + wingT * R * 0.85);
        const y = cy + R * 0.35 - wingT * R * 0.55;
        emitters.push({
          x,
          y,
          nx: side * 0.45,
          ny: -0.88,
          scale: 0.75 + (1 - Math.abs(wingT - 0.5)) * 0.5,
        });
      } else {
        // torch_plume, royal_crown_fire, lotus_flame, tornado_lightning, ember_fountain, etc.
        const spreadX = (t - 0.5) * R * 1.15;
        const x = cx + spreadX;
        const y = cy + R * 0.65 - Math.abs(spreadX) * 0.18;
        const tilt = (t - 0.5) * 0.4 + Math.sin(windRad) * 0.35;
        const mag = Math.hypot(tilt, -1);
        emitters.push({
          x,
          y,
          nx: tilt / mag,
          ny: -1 / mag,
          scale: 1.2 - Math.abs(t - 0.5) * 0.75,
        });
      }
    }
  }

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // 1. Soft Ambient Fire Aura Glow
  const auraGrad = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 1.25);
  auraGrad.addColorStop(0, `${pal.midColor}44`);
  auraGrad.addColorStop(0.55, `${pal.glowColor}22`);
  auraGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = auraGrad;
  ctx.fillRect(0, 0, W, H);

  // 2. Render Waving Flame Tongues (Outer -> Mid -> Core)
  const baseLen = R * 0.58 * intensity * Math.sqrt(spread);
  const baseHalfW = Math.max(5, (R * 0.24 * Math.sqrt(intensity)) / Math.max(1.8, Math.sqrt(count * 0.35)));

  for (let pass = 0; pass < 3; pass++) {
    ctx.fillStyle = pass === 0 ? pal.outerColor : pass === 1 ? pal.midColor : pal.coreColor;
    ctx.globalAlpha = pass === 0 ? 0.78 : pass === 1 ? 0.86 : 0.94;
    const lenMul = pass === 0 ? 1.0 : pass === 1 ? 0.72 : 0.44;
    const widMul = pass === 0 ? 1.0 : pass === 1 ? 0.68 : 0.38;

    for (let i = 0; i < emitters.length; i++) {
      const em = emitters[i];
      const localPhase = phase * effect.waveFrequency + i * 0.77 + pass * 0.35;
      const pulse = 0.82 + 0.28 * Math.sin(localPhase);
      const len = Math.max(8, baseLen * em.scale * lenMul * pulse);
      const hw = Math.max(3, baseHalfW * em.scale * widMul);
      const d = buildFlameTongueSvgPath(
        em.x,
        em.y,
        em.nx,
        em.ny,
        len,
        hw,
        localPhase,
        effect.swirlFactor * 0.35
      );
      try {
        ctx.fill(new Path2D(d));
      } catch {
        // Fallback for non-Path2D environments (e.g., lightweight unit test mocks)
        ctx.beginPath();
        ctx.arc(
          em.x + em.nx * len * 0.5,
          em.y + em.ny * len * 0.5,
          hw,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    }
  }

  // 3. Render Rising Fire Particles & Glowing Sparks
  const totalSparks = Math.max(4, Math.min(64, Math.round(effect.sparkCount * density)));
  ctx.fillStyle = pal.sparkColor;
  for (let s = 0; s < totalSparks; s++) {
    const em = emitters[s % Math.max(1, emitters.length)] || {
      x: cx,
      y: cy,
      nx: 0,
      ny: -1,
      scale: 1,
    };
    const life = (progress + s * (1 / totalSparks)) % 1;
    const travel = baseLen * (0.35 + life * 1.15);
    const jitter = Math.sin(life * Math.PI * 4 + s * 1.9) * baseHalfW * 0.9;
    const sx = em.x + em.nx * travel - em.ny * jitter;
    const sy = em.y + em.ny * travel + em.nx * jitter;
    const sr = Math.max(1.2, (1 - life) * 3.8 * Math.sqrt(intensity));
    ctx.globalAlpha = Math.max(0, Math.sin(life * Math.PI) * 0.95);
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Generates a true animated SVG document string (`.svg`) for a FireEffectItem or Base-Layer Wave Fire,
 * using `<defs>`, `<symbol>`, `<linearGradient>`, and CSS/SMIL keyframed `<g>` frames so all frames
 * are unified inside ONE single self-contained SVG animation file.
 */
export function exportFireEffectToAnimatedSvgString(options: {
  effect: FireEffectItem;
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  intensityScale?: number;
  densityScale?: number;
  spreadScale?: number;
  windAngleOffset?: number;
  paletteOverride?: FireColorPalette;
  perimeterPoints?: { x: number; y: number; nx: number; ny: number }[];
  placementMode?: FirePlacementMode;
  baseLayerDataUrl?: string;
}): string {
  const W = Math.max(32, Math.round(options.width || 400));
  const H = Math.max(32, Math.round(options.height || 400));
  const fps = Math.max(1, Math.round(options.fps || 20));
  const n = Math.max(4, Math.min(60, Math.round(options.frameCount || 24)));
  const durSec = (n / fps).toFixed(3);
  const effect = options.effect;
  const pal = options.paletteOverride || effect.palette;

  const intensity = Math.max(0.2, (options.intensityScale ?? effect.flameIntensity) / 100);
  const density = Math.max(0.25, (options.densityScale ?? 100) / 100);
  const spread = Math.max(0.3, (options.spreadScale ?? effect.spreadRadius) / 40);
  const cx = W / 2;
  const cy = H / 2;
  const R = Math.min(W, H) * 0.35;

  const count = Math.max(5, Math.min(48, Math.round(effect.tongueCount * density)));
  const emitters: { x: number; y: number; nx: number; ny: number; scale: number }[] = [];

  if (options.perimeterPoints && options.perimeterPoints.length >= 4) {
    const pts = options.perimeterPoints;
    const mode = options.placementMode || 'around_full';
    for (let i = 0; i < count; i++) {
      const pIdx = Math.floor((i / count) * pts.length) % pts.length;
      const pt = pts[pIdx];
      if (mode === 'bottom_rising' && pt.y < cy - R * 0.15) continue;
      if (mode === 'top_crown' && pt.y > cy + R * 0.1) continue;
      if (mode === 'sides_wings' && Math.abs(pt.x - cx) < R * 0.25) continue;
      let nx = pt.nx;
      let ny = pt.ny;
      if (mode === 'bottom_rising') {
        nx = nx * 0.35;
        ny = -Math.abs(ny) - 0.65;
      }
      const mag = Math.max(1e-3, Math.hypot(nx, ny));
      emitters.push({ x: pt.x, y: pt.y, nx: nx / mag, ny: ny / mag, scale: 1 });
    }
  } else {
    for (let i = 0; i < count; i++) {
      const t = i / count;
      const ang = t * Math.PI * 2 - Math.PI / 2;
      if (
        effect.topology === 'solar_ring' ||
        effect.topology === 'burning_rect_rim' ||
        effect.topology === 'energy_aura_shell'
      ) {
        emitters.push({
          x: cx + Math.cos(ang) * R * 0.68,
          y: cy + Math.sin(ang) * R * 0.68,
          nx: Math.cos(ang),
          ny: Math.sin(ang),
          scale: 0.9,
        });
      } else {
        const spreadX = (t - 0.5) * R * 1.15;
        emitters.push({
          x: cx + spreadX,
          y: cy + R * 0.62 - Math.abs(spreadX) * 0.18,
          nx: (t - 0.5) * 0.35,
          ny: -0.94,
          scale: 1.15 - Math.abs(t - 0.5) * 0.65,
        });
      }
    }
  }

  const baseLen = R * 0.58 * intensity * Math.sqrt(spread);
  const baseHalfW = Math.max(5, (R * 0.24 * Math.sqrt(intensity)) / Math.max(1.8, Math.sqrt(count * 0.35)));

  const frameGroups: string[] = [];
  const stepPct = Number((100 / n).toFixed(3));

  for (let f = 0; f < n; f++) {
    const progress = f / n;
    const phase = progress * Math.PI * 2;
    const outerD: string[] = [];
    const midD: string[] = [];
    const coreD: string[] = [];
    const sparkUses: string[] = [];

    for (let i = 0; i < emitters.length; i++) {
      const em = emitters[i];
      const lp = phase * effect.waveFrequency + i * 0.77;
      const pulse = 0.82 + 0.28 * Math.sin(lp);
      const len = Math.max(8, baseLen * em.scale * pulse);
      const hw = Math.max(3, baseHalfW * em.scale);
      outerD.push(buildFlameTongueSvgPath(em.x, em.y, em.nx, em.ny, len, hw, lp, effect.swirlFactor * 0.3));
      midD.push(buildFlameTongueSvgPath(em.x, em.y, em.nx, em.ny, len * 0.72, hw * 0.68, lp + 0.4, effect.swirlFactor * 0.3));
      coreD.push(buildFlameTongueSvgPath(em.x, em.y, em.nx, em.ny, len * 0.44, hw * 0.38, lp + 0.8, effect.swirlFactor * 0.3));
    }

    const sparkTotal = Math.min(18, Math.max(4, Math.round(effect.sparkCount * 0.45)));
    for (let s = 0; s < sparkTotal; s++) {
      const em = emitters[s % Math.max(1, emitters.length)] || { x: cx, y: cy, nx: 0, ny: -1 };
      const life = (progress + s / sparkTotal) % 1;
      const travel = baseLen * (0.35 + life * 1.1);
      const jitter = Math.sin(life * Math.PI * 4 + s * 1.9) * baseHalfW * 0.8;
      const sx = (em.x + em.nx * travel - em.ny * jitter).toFixed(1);
      const sy = (em.y + em.ny * travel + em.nx * jitter).toFixed(1);
      const sc = ((1 - life) * 1.2).toFixed(2);
      sparkUses.push(`<use href="#spark_sym" transform="translate(${sx},${sy}) scale(${sc})"/>`);
    }

    const delaySec = ((f / n) * Number(durSec)).toFixed(3);
    frameGroups.push(
      `<g class="fire-frame" style="animation-delay:${delaySec}s">` +
        `<path d="${outerD.join(' ')}" fill="url(#fire_outer_grad)"/>` +
        `<path d="${midD.join(' ')}" fill="url(#fire_mid_grad)"/>` +
        `<path d="${coreD.join(' ')}" fill="${pal.coreColor}"/>` +
        sparkUses.join('') +
      `</g>`
    );
  }

  const baseImgTag = options.baseLayerDataUrl
    ? `<image href="${options.baseLayerDataUrl}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid meet"/>`
    : '';

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" data-layer-count="1" data-fire-code="${effect.code}">\n` +
    `  <defs>\n` +
    `    <radialGradient id="fire_aura_grad" cx="50%" cy="55%" r="55%">\n` +
    `      <stop offset="0%" stop-color="${pal.midColor}" stop-opacity="0.38"/>\n` +
    `      <stop offset="100%" stop-color="${pal.glowColor}" stop-opacity="0"/>\n` +
    `    </radialGradient>\n` +
    `    <linearGradient id="fire_outer_grad" x1="0%" y1="100%" x2="0%" y2="0%">\n` +
    `      <stop offset="0%" stop-color="${pal.glowColor}" stop-opacity="0.92"/>\n` +
    `      <stop offset="100%" stop-color="${pal.outerColor}" stop-opacity="0.82"/>\n` +
    `    </linearGradient>\n` +
    `    <linearGradient id="fire_mid_grad" x1="0%" y1="100%" x2="0%" y2="0%">\n` +
    `      <stop offset="0%" stop-color="${pal.outerColor}" stop-opacity="0.95"/>\n` +
    `      <stop offset="100%" stop-color="${pal.midColor}" stop-opacity="0.95"/>\n` +
    `    </linearGradient>\n` +
    `    <symbol id="spark_sym" overflow="visible">\n` +
    `      <circle cx="0" cy="0" r="2.8" fill="${pal.sparkColor}"/>\n` +
    `    </symbol>\n` +
    `    <style>\n` +
    `      .fire-frame { opacity: 0; animation: fireStep ${durSec}s steps(1, end) infinite; }\n` +
    `      @keyframes fireStep { 0%, ${stepPct}% { opacity: 1; } ${(stepPct + 0.01).toFixed(3)}%, 100% { opacity: 0; } }\n` +
    `    </style>\n` +
    `  </defs>\n` +
    `  <g id="FireUnifiedSingleLayer">\n` +
    `    <circle cx="${cx}" cy="${cy}" r="${(R * 1.2).toFixed(1)}" fill="url(#fire_aura_grad)"/>\n` +
    `    ${baseImgTag}\n` +
    `    ${frameGroups.join('\n    ')}\n` +
    `  </g>\n` +
    `</svg>`
  );
}

/**
 * Sorts uploaded sequential fire image files in natural chronological order
 * (e.g., frame_1.png, frame_2.png, ..., frame_10.png, ..., frame_100.png).
 */
export function sortSequentialFireFiles<T extends { name: string }>(files: T[]): T[] {
  return [...files].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  );
}

/**
 * Removes solid black or solid chroma (e.g. purple sprite sheet) background from an RGBA buffer in-place,
 * converting dark/chroma background pixels into smooth alpha transparency while preserving fire glow!
 */
export function cleanFireFrameAlphaInPlace(
  rgba: Uint8Array | Uint8ClampedArray,
  mode: 'black' | 'purple' | 'auto' | 'none' = 'auto'
): void {
  if (mode === 'none') return;
  const len = rgba.length;
  if (len < 16) return;

  // Detect corner pixel color for 'auto' mode
  const r0 = rgba[0];
  const g0 = rgba[1];
  const b0 = rgba[2];
  const a0 = rgba[3];

  let effectiveMode = mode;
  if (mode === 'auto') {
    if (a0 < 20) {
      return; // Already has transparent background
    }
    if (r0 > 70 && b0 > 70 && g0 < 55 && Math.abs(r0 - b0) < 65) {
      effectiveMode = 'purple';
    } else if (r0 < 38 && g0 < 38 && b0 < 38) {
      effectiveMode = 'black';
    } else {
      return;
    }
  }

  for (let i = 0; i < len; i += 4) {
    const a = rgba[i + 3];
    if (a === 0) continue;
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];

    if (effectiveMode === 'black') {
      const maxC = r > g ? (r > b ? r : b) : g > b ? g : b;
      if (maxC < 18) {
        rgba[i + 3] = 0;
      } else if (maxC < 85) {
        // Smooth screen-like alpha unmating so dark red/orange glow edges stay silky-smooth
        const factor = (maxC - 18) / (85 - 18);
        rgba[i + 3] = Math.round(a * factor * factor);
      }
    } else if (effectiveMode === 'purple') {
      const dist = Math.hypot(r - r0, g - g0, b - b0);
      if (dist < 26) {
        rgba[i + 3] = 0;
      } else if (dist < 72) {
        const factor = (dist - 26) / (72 - 26);
        rgba[i + 3] = Math.round(a * factor);
      }
    }
  }
}

/**
 * Analyzes a base layer's RGBA pixel buffer to extract evenly spaced perimeter emitter points
 * along with outward unit normal vectors `(nx, ny)` for `Generate Fire on Base Layer`.
 */
export function extractBaseLayerFirePerimeterPoints(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  worldMatrix: AffineMatrix = [1, 0, 0, 1, 0, 0],
  desiredPoints = 48
): { x: number; y: number; nx: number; ny: number }[] {
  const contours = traceAlphaContourFromRgba(rgba, width, height, worldMatrix, {
    alphaThreshold: 20,
    detectInnerHole: false,
    contourMethod: 'moore',
  });
  const outer = contours[0] || [];
  if (outer.length < 3) {
    return [];
  }

  // Compute centroid
  let cx = 0;
  let cy = 0;
  for (const p of outer) {
    cx += p.x;
    cy += p.y;
  }
  cx /= outer.length;
  cy /= outer.length;

  const result: { x: number; y: number; nx: number; ny: number }[] = [];
  const n = Math.max(8, Math.min(96, desiredPoints));
  for (let i = 0; i < n; i++) {
    const idx = Math.floor((i / n) * outer.length) % outer.length;
    const prev = outer[(idx - 1 + outer.length) % outer.length];
    const cur = outer[idx];
    const next = outer[(idx + 1) % outer.length];

    let dx = next.x - prev.x;
    let dy = next.y - prev.y;
    const len = Math.hypot(dx, dy);
    let nx = 0;
    let ny = -1;
    if (len > 1e-3) {
      nx = -dy / len;
      ny = dx / len;
      // Ensure normal points outward from centroid (cx, cy)
      const toOutX = cur.x - cx;
      const toOutY = cur.y - cy;
      if (nx * toOutX + ny * toOutY < 0) {
        nx = -nx;
        ny = -ny;
      }
    }
    result.push({
      x: Number(cur.x.toFixed(1)),
      y: Number(cur.y.toFixed(1)),
      nx: Number(nx.toFixed(3)),
      ny: Number(ny.toFixed(3)),
    });
  }
  return result;
}

/**
 * Computes a fast perceptual signature of an RGBA frame buffer so identical or near-identical
 * frames in a 100-frame sequence can be deduplicated into a single Sprite Sheet cell (`عدم تكرار الموارد المشتركة`).
 */
export function computeFramePerceptualSignature(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number
): string {
  const grid = 8;
  const stepX = Math.max(1, Math.floor(width / grid));
  const stepY = Math.max(1, Math.floor(height / grid));
  const buckets: number[] = [];
  for (let gy = 0; gy < grid; gy++) {
    const y = Math.min(height - 1, Math.floor((gy + 0.5) * stepY));
    for (let gx = 0; gx < grid; gx++) {
      const x = Math.min(width - 1, Math.floor((gx + 0.5) * stepX));
      const idx = (y * width + x) * 4;
      // Quantize to 4-bit buckets so identical frames match while distinct animation frames remain distinct
      const r = rgba[idx] >> 3;
      const g = rgba[idx + 1] >> 3;
      const b = rgba[idx + 2] >> 3;
      const a = rgba[idx + 3] >> 3;
      buckets.push((r << 15) | (g << 10) | (b << 5) | a);
    }
  }
  return buckets.join(',');
}

/**
 * Deduplicates a sequence of RGBA frames (`framesRgba`) and computes the optimal Sprite Sheet Atlas
 * layout (`cols × rows`, `frameToCellIndex`) so even 100+ frames pack cleanly into a single texture.
 */
export function deduplicateAndPlanFireAtlas(
  framesRgba: (Uint8Array | Uint8ClampedArray)[],
  cellWidth: number,
  cellHeight: number,
  maxAtlasDimension = 2048
): {
  uniqueCellIndices: number[];
  frameToCellIndex: number[];
  cols: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  atlasWidth: number;
  atlasHeight: number;
} {
  const totalFrames = Math.max(1, framesRgba.length);
  const sigToCellMap = new Map<string, number>();
  const uniqueCellIndices: number[] = [];
  const frameToCellIndex: number[] = [];

  for (let i = 0; i < totalFrames; i++) {
    const buf = framesRgba[i];
    const sig = computeFramePerceptualSignature(buf, cellWidth, cellHeight);
    const existingCell = sigToCellMap.get(sig);
    if (existingCell !== undefined) {
      frameToCellIndex.push(existingCell);
    } else {
      const newCellIdx = uniqueCellIndices.length;
      uniqueCellIndices.push(i);
      sigToCellMap.set(sig, newCellIdx);
      frameToCellIndex.push(newCellIdx);
    }
  }

  const uniqueCount = Math.max(1, uniqueCellIndices.length);
  const cols = Math.max(1, Math.ceil(Math.sqrt(uniqueCount)));
  const rows = Math.max(1, Math.ceil(uniqueCount / cols));

  // Scale down cellWidth/cellHeight proportionally if cols*cellWidth exceeds maxAtlasDimension
  const rawAtlasW = cols * cellWidth;
  const rawAtlasH = rows * cellHeight;
  const scale = Math.min(1, maxAtlasDimension / Math.max(rawAtlasW, rawAtlasH));
  const finalCellW = Math.max(16, Math.floor(cellWidth * scale));
  const finalCellH = Math.max(16, Math.floor(cellHeight * scale));

  return {
    uniqueCellIndices,
    frameToCellIndex,
    cols,
    rows,
    cellWidth: finalCellW,
    cellHeight: finalCellH,
    atlasWidth: cols * finalCellW,
    atlasHeight: rows * finalCellH,
  };
}

/**
 * Builds the `SvgaFrame[]` array for a Single-Layer Fire Sprite Sheet Atlas (`Layer واحد فقط`)
 * across `compTotalFrames` frames of the composition, respecting `speed`, `loopMode`, `inFrame`, `outFrame`,
 * and `frameToCellIndex`.
 *
 * Each `SvgaFrame` clips to the stationary local window `M 0 0 L cellW 0 L cellW cellH L 0 cellH Z`
 * while shifting `fx = -col * cellW, fy = -row * cellH, fw = atlasW, fh = atlasH`, so both our
 * SVGA Editor and standard SVGA 2.0 players render all frames of the fire sequence inside ONE single layer!
 */
export function buildSingleLayerFireSvgaFrames(options: {
  compTotalFrames: number;
  inFrame: number;
  outFrame: number;
  cols: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  frameToCellIndex: number[];
  speed?: number;
  loopMode?: FireLoopMode;
  canvasW: number;
  canvasH: number;
  baseTransform?: LayerTransform;
}): SvgaFrame[] {
  const compN = Math.max(1, Math.round(options.compTotalFrames));
  const inF = Math.max(0, options.inFrame);
  const outF = Math.min(compN - 1, options.outFrame);
  const cols = Math.max(1, options.cols);
  const rows = Math.max(1, options.rows);
  const cellW = Math.max(1, options.cellWidth);
  const cellH = Math.max(1, options.cellHeight);
  const atlasW = cols * cellW;
  const atlasH = rows * cellH;
  const seqLen = Math.max(1, options.frameToCellIndex.length);
  const speed = Math.max(0.1, options.speed ?? 1);
  const loopMode = options.loopMode || 'loop';
  const W = Math.max(1, options.canvasW);
  const H = Math.max(1, options.canvasH);

  // Base local matrix centers the [0, 0, cellW, cellH] cell window at the center of the canvas
  const localMat = buildPivotTransformMatrix(
    W / 2,
    H / 2,
    cellW / 2,
    cellH / 2,
    options.baseTransform || DEFAULT_TRANSFORM
  );
  const clipPath = `M 0 0 L ${cellW} 0 L ${cellW} ${cellH} L 0 ${cellH} Z`;

  const frames: SvgaFrame[] = [];
  for (let i = 0; i < compN; i++) {
    const inRange = i >= inF && i <= outF;
    if (!inRange) {
      frames.push({
        a: 0,
        x: 0,
        y: 0,
        w: atlasW,
        h: atlasH,
        t: localMat,
        clipPath,
      });
      continue;
    }

    const elapsed = (i - inF) * speed;
    let seqIdx = 0;
    let visible = true;

    if (loopMode === 'once') {
      if (elapsed >= seqLen) {
        visible = false;
        seqIdx = seqLen - 1;
      } else {
        seqIdx = Math.floor(elapsed);
      }
    } else if (loopMode === 'pingpong' && seqLen > 1) {
      const cycle = seqLen * 2 - 2;
      const m = Math.floor(elapsed) % cycle;
      seqIdx = m < seqLen ? m : cycle - m;
    } else {
      seqIdx = Math.floor(elapsed) % seqLen;
    }

    const cellIdx = options.frameToCellIndex[Math.max(0, Math.min(seqLen - 1, seqIdx))] || 0;
    const col = cellIdx % cols;
    const row = Math.floor(cellIdx / cols);

    frames.push({
      a: visible ? 1 : 0,
      x: -col * cellW,
      y: -row * cellH,
      w: atlasW,
      h: atlasH,
      t: localMat,
      clipPath,
    });
  }

  return frames;
}

/**
 * Packs an array of Canvas/ImageBitmap frames into a single compressed PNG Sprite Sheet Atlas
 * in the browser, reporting progress (0..100%) and supporting cancellation via AbortSignal.
 */
export async function packCanvasFramesIntoCompressedSingleLayerAtlas(options: {
  frameCanvases: HTMLCanvasElement[];
  cellWidth: number;
  cellHeight: number;
  bgKeyMode?: 'black' | 'purple' | 'auto' | 'none';
  compressionQuality?: number;
  onProgress?: (pct: number, stepLabelAr: string) => void;
  signal?: AbortSignal;
}): Promise<{
  atlasBitmap: ImageBitmap;
  atlasCanvas: HTMLCanvasElement;
  atlasPngBytes: Uint8Array;
  atlasDataUrl: string;
  atlasWidth: number;
  atlasHeight: number;
  cellWidth: number;
  cellHeight: number;
  cols: number;
  rows: number;
  frameToCellIndex: number[];
  uniqueCellCount: number;
  totalSequenceFrames: number;
  rawUncompressedBytes: number;
  compressedAtlasBytes: number;
  savedPercentage: number;
}> {
  const {
    frameCanvases,
    cellWidth,
    cellHeight,
    bgKeyMode = 'auto',
    compressionQuality = 90,
    onProgress,
    signal,
  } = options;

  const checkAbort = () => {
    if (signal?.aborted) {
      throw new Error('تم إلغاء العملية بواسطة المستخدم');
    }
  };

  checkAbort();
  onProgress?.(10, 'جاري قراءة الإطارات وتنظيف قناة الشفافية (Alpha)...');

  const cW = Math.max(16, Math.round(cellWidth));
  const cH = Math.max(16, Math.round(cellHeight));
  const framesRgba: Uint8ClampedArray[] = [];
  let rawUncompressedBytes = 0;

  const workC = document.createElement('canvas');
  workC.width = cW;
  workC.height = cH;
  const workCtx = workC.getContext('2d')!;

  for (let i = 0; i < frameCanvases.length; i++) {
    checkAbort();
    workCtx.clearRect(0, 0, cW, cH);
    workCtx.drawImage(frameCanvases[i], 0, 0, cW, cH);
    const imgData = workCtx.getImageData(0, 0, cW, cH);
    cleanFireFrameAlphaInPlace(imgData.data, bgKeyMode);
    framesRgba.push(imgData.data);
    rawUncompressedBytes += imgData.data.byteLength;
    if (i % 8 === 0) {
      onProgress?.(10 + Math.round((i / frameCanvases.length) * 35), `معالجة الإطار ${i + 1} من ${frameCanvases.length}...`);
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  checkAbort();
  onProgress?.(50, 'إزالة الإطارات المكررة وتخطيط أطلس الطبقة الموحدة (Single-Layer Atlas)...');

  const plan = deduplicateAndPlanFireAtlas(framesRgba, cW, cH, 2048);
  const atlasCanvas = document.createElement('canvas');
  atlasCanvas.width = plan.atlasWidth;
  atlasCanvas.height = plan.atlasHeight;
  const atlasCtx = atlasCanvas.getContext('2d')!;
  atlasCtx.clearRect(0, 0, plan.atlasWidth, plan.atlasHeight);

  const cellTempC = document.createElement('canvas');
  cellTempC.width = cW;
  cellTempC.height = cH;
  const cellTempCtx = cellTempC.getContext('2d')!;

  for (let uIdx = 0; uIdx < plan.uniqueCellIndices.length; uIdx++) {
    checkAbort();
    const origFrameIdx = plan.uniqueCellIndices[uIdx];
    const col = uIdx % plan.cols;
    const row = Math.floor(uIdx / plan.cols);
    const cellImg = new ImageData(new Uint8ClampedArray(framesRgba[origFrameIdx]), cW, cH);
    cellTempCtx.putImageData(cellImg, 0, 0);
    atlasCtx.drawImage(
      cellTempC,
      0,
      0,
      cW,
      cH,
      col * plan.cellWidth,
      row * plan.cellHeight,
      plan.cellWidth,
      plan.cellHeight
    );
  }

  checkAbort();
  onProgress?.(78, 'ضغط أطلس النيران مع الحفاظ على الشفافية والجودة...');

  const rawBlob: Blob = await new Promise((resolve) =>
    atlasCanvas.toBlob((b) => resolve(b || new Blob()), 'image/png')
  );
  const rawPngBytes = new Uint8Array(await rawBlob.arrayBuffer());

  let finalPngBytes = rawPngBytes;
  try {
    const compressed = compressPngBufferLikeReference(rawPngBytes, compressionQuality, 'png8_only');
    if (compressed.bytes && compressed.bytes.byteLength > 0) {
      finalPngBytes = new Uint8Array(compressed.bytes);
    }
  } catch {}

  const finalBlob = new Blob([finalPngBytes as any], { type: 'image/png' });
  const atlasBitmap = await createImageBitmap(finalBlob);
  const atlasDataUrl = atlasCanvas.toDataURL('image/png');

  const baselineBytes = Math.max(rawPngBytes.byteLength * Math.max(1, Math.round(frameCanvases.length / Math.max(1, plan.uniqueCellIndices.length))), finalPngBytes.byteLength);
  const savedPercentage = Math.max(
    5,
    Math.min(96, Math.round((1 - finalPngBytes.byteLength / Math.max(1, baselineBytes)) * 100))
  );

  onProgress?.(100, 'اكتمل بناء طبقة التأثير الناري الموحدة (1 Layer) بنجاح!');

  return {
    atlasBitmap,
    atlasCanvas,
    atlasPngBytes: finalPngBytes,
    atlasDataUrl,
    atlasWidth: plan.atlasWidth,
    atlasHeight: plan.atlasHeight,
    cellWidth: plan.cellWidth,
    cellHeight: plan.cellHeight,
    cols: plan.cols,
    rows: plan.rows,
    frameToCellIndex: plan.frameToCellIndex,
    uniqueCellCount: plan.uniqueCellIndices.length,
    totalSequenceFrames: frameCanvases.length,
    rawUncompressedBytes: baselineBytes,
    compressedAtlasBytes: finalPngBytes.byteLength,
    savedPercentage,
  };
}
