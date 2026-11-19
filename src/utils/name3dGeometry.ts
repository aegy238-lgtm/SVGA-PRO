export type Name3DAnimationId =
  | 'none'
  | 'spin3d'
  | 'slowOrbit'
  | 'fadeReveal'
  | 'frontBackZoom'
  | 'goldShimmer'
  | 'lightReflection'
  | 'haloGlow'
  | 'proShake'
  | 'flyAssemble'
  | 'individualSpin'
  | 'pulseGlow'
  | 'metallicReflections';

export type Name3DShapeStyleId =
  | 'royal-bevel'
  | 'diamond-chisel'
  | 'rounded-sculpture'
  | 'heavy-monolith'
  | 'layered-crown'
  | 'metallic-slab';

export type Name3DBgMode = 'solid' | 'gradient' | 'transparent';
export type Name3DAnimDirection = 'normal' | 'reverse' | 'alternate';

export interface Name3DConfig {
  // 1. Text & Font
  text: string;
  fontId: string;
  // 2. 3D Shape & Dimensions
  shapeStyleId: Name3DShapeStyleId;
  fontSize: number; // 48 - 160
  letterThickness: number; // 0 - 100
  extrudeDepth: number; // 6 - 120
  letterSpacing: number; // -8 - 36
  viewAngleX: number; // -55 - 55 deg
  viewAngleY: number; // -75 - 75 deg
  viewAngleZ: number; // -45 - 45 deg
  // 3. Animation
  animationId: Name3DAnimationId;
  animationSpeed: number; // 0.25 - 3.0
  animationDirection: Name3DAnimDirection;
  animationDuration: number; // 1.5 - 8.0 seconds
  isPlaying: boolean;
  // 4. Colors & Gradients
  materialPresetId: string;
  faceColor: string;
  faceGradientEnabled: boolean;
  faceColors: string[]; // 2..4 hex stops
  faceGradientAngle: number; // 0 - 360
  sideColor: string;
  depthColor: string;
  animatedColorShimmer: boolean;
  // 5. Background
  bgMode: Name3DBgMode;
  bgPresetId: string;
  bgColor: string;
  bgGradientColors: [string, string, string];
  bgGradientAngle: number;
  bgGlowIntensity: number; // 0 - 100
  bgGlowColor: string;
  bgParticlesEnabled: boolean;
  // 6. Lighting & Effects
  lightingIntensity: number; // 20 - 200
  reflectionStrength: number; // 0 - 100
  shadowIntensity: number; // 0 - 100
  shininess: number; // 0 - 100
  metalness: number; // 0 - 100
  glowStrength: number; // 0 - 100
  glowColor: string;
}

export interface Name3DFontOption {
  id: string;
  labelAr: string;
  labelEn: string;
  cssFamily: string;
  weight: string;
  sample: string;
}

export interface Name3DShapeStyleOption {
  id: Name3DShapeStyleId;
  labelAr: string;
  labelEn: string;
  descAr: string;
  descEn: string;
  bevelThicknessScale: number;
  bevelSizeScale: number;
  bevelSegments: number;
  depthMultiplier: number;
  hasBackRim: boolean;
}

export interface Name3DAnimationOption {
  id: Name3DAnimationId;
  labelAr: string;
  labelEn: string;
  shortDescAr: string;
  shortDescEn: string;
  category: 'motion' | 'light' | 'piece';
}

export interface Name3DMaterialPreset {
  id: string;
  labelAr: string;
  labelEn: string;
  group: 'gold' | 'metal' | 'luxury';
  faceColor: string;
  faceGradientEnabled: boolean;
  faceColors: string[];
  sideColor: string;
  depthColor: string;
  metalness: number;
  shininess: number;
  reflectionStrength: number;
  glowColor: string;
  swatchGradient: string;
}

export interface Name3DBgPreset {
  id: string;
  labelAr: string;
  labelEn: string;
  bgMode: Name3DBgMode;
  bgColor: string;
  bgGradientColors: [string, string, string];
  bgGradientAngle: number;
  bgGlowColor: string;
  bgGlowIntensity: number;
}

export const NAME3D_FONT_OPTIONS: Name3DFontOption[] = [
  {
    id: 'cairo-black',
    labelAr: 'كايرو الملكي العريض',
    labelEn: 'Cairo Royal Black',
    cssFamily: "'Cairo', sans-serif",
    weight: '900',
    sample: 'سلطان الذهب',
  },
  {
    id: 'tajawal-extrabold',
    labelAr: 'تجوّل الفاخر',
    labelEn: 'Tajawal Luxury Bold',
    cssFamily: "'Tajawal', sans-serif",
    weight: '900',
    sample: 'أحمد الملكي',
  },
  {
    id: 'alexandria-black',
    labelAr: 'الإسكندرية المجسم',
    labelEn: 'Alexandria Heavy 3D',
    cssFamily: "'Alexandria', sans-serif",
    weight: '900',
    sample: 'فخامة VIP',
  },
  {
    id: 'lalezar-display',
    labelAr: 'لاليزار الخط العربي',
    labelEn: 'Lalezar Calligraphy',
    cssFamily: "'Lalezar', sans-serif",
    weight: '400',
    sample: 'أسد العرب',
  },
  {
    id: 'amiri-royal',
    labelAr: 'أميري الكلاسيكي',
    labelEn: 'Amiri Classic Serif',
    cssFamily: "'Amiri', serif",
    weight: '700',
    sample: 'الأمير الذهبي',
  },
  {
    id: 'changa-bold',
    labelAr: 'تشانجا الهندسي',
    labelEn: 'Changa Geometric',
    cssFamily: "'Changa', sans-serif",
    weight: '800',
    sample: 'SVGA PRO',
  },
  {
    id: 'almarai-extrabold',
    labelAr: 'المراعي العصري',
    labelEn: 'Almarai Modern',
    cssFamily: "'Almarai', sans-serif",
    weight: '800',
    sample: 'نجم الساحة',
  },
  {
    id: 'readex-bold',
    labelAr: 'ريدكس البارز',
    labelEn: 'Readex Sculpt',
    cssFamily: "'Readex Pro', sans-serif",
    weight: '700',
    sample: 'ROYAL 777',
  },
];

export const NAME3D_SHAPE_STYLES: Name3DShapeStyleOption[] = [
  {
    id: 'royal-bevel',
    labelAr: 'مشطوف ملكي',
    labelEn: 'Royal Bevel',
    descAr: 'حواف مشطوفة متوازنة تعكس الضوء بوضوح',
    descEn: 'Balanced chamfered edges for sharp reflections',
    bevelThicknessScale: 1.0,
    bevelSizeScale: 1.0,
    bevelSegments: 4,
    depthMultiplier: 1.0,
    hasBackRim: false,
  },
  {
    id: 'diamond-chisel',
    labelAr: 'نحت ألماسي',
    labelEn: 'Diamond Chisel',
    descAr: 'شطف حاد عميق بلمعان كريستالي متعدد الأوجه',
    descEn: 'Crisp faceted chisel with high-contrast specular ridges',
    bevelThicknessScale: 1.55,
    bevelSizeScale: 1.25,
    bevelSegments: 1,
    depthMultiplier: 1.15,
    hasBackRim: false,
  },
  {
    id: 'rounded-sculpture',
    labelAr: 'مجسم ناعم',
    labelEn: 'Smooth Sculpture',
    descAr: 'حواف مستديرة ناعمة وانسيابية فاخرة',
    descEn: 'Plush rounded bevels with liquid-metal curves',
    bevelThicknessScale: 1.3,
    bevelSizeScale: 1.35,
    bevelSegments: 7,
    depthMultiplier: 1.05,
    hasBackRim: false,
  },
  {
    id: 'heavy-monolith',
    labelAr: 'كتلة بارزة عميقة',
    labelEn: 'Heavy Monolith',
    descAr: 'بروز عميق وقوي يناسب الأسماء الكبيرة والملكية',
    descEn: 'Deep monumental extrusion with authoritative weight',
    bevelThicknessScale: 0.9,
    bevelSizeScale: 0.85,
    bevelSegments: 3,
    depthMultiplier: 1.65,
    hasBackRim: false,
  },
  {
    id: 'layered-crown',
    labelAr: 'طبقتان بإطار خلفي',
    labelEn: 'Dual-Layer Rim',
    descAr: 'طبقة خلفية بارزة تمنح الاسم إطاراً معدنياً مزدوجاً',
    descEn: 'Secondary offset back-plate for double metallic depth',
    bevelThicknessScale: 1.1,
    bevelSizeScale: 1.05,
    bevelSegments: 4,
    depthMultiplier: 1.0,
    hasBackRim: true,
  },
  {
    id: 'metallic-slab',
    labelAr: 'لوح معدني حاد',
    labelEn: 'Architectural Slab',
    descAr: 'زوايا هندسية حادة ومستقيمة بتشطيب عصري',
    descEn: 'Clean architectural edges with minimal bevel',
    bevelThicknessScale: 0.35,
    bevelSizeScale: 0.35,
    bevelSegments: 2,
    depthMultiplier: 1.2,
    hasBackRim: false,
  },
];

export const NAME3D_ANIMATION_PRESETS: Name3DAnimationOption[] = [
  {
    id: 'none',
    labelAr: 'ثابت بدون حركة',
    labelEn: 'Static Showcase',
    shortDescAr: 'عرض ثلاثي الأبعاد ثابت للتعديل والتصوير',
    shortDescEn: 'Static 3D presentation for still renders',
    category: 'motion',
  },
  {
    id: 'spin3d',
    labelAr: '1. دوران الاسم ثلاثي الأبعاد',
    labelEn: '1. Full 3D Rotation',
    shortDescAr: 'دوران كامل 360 درجة حول المحور الرأسي',
    shortDescEn: 'Full 360-degree 3D turntable rotation',
    category: 'motion',
  },
  {
    id: 'slowOrbit',
    labelAr: '2. دوران بطيء وناعم',
    labelEn: '2. Slow Smooth Orbit',
    shortDescAr: 'تمايل ثلاثي الأبعاد هادئ وفخم لإبراز العمق',
    shortDescEn: 'Silky gentle 3D sway highlighting depth',
    category: 'motion',
  },
  {
    id: 'fadeReveal',
    labelAr: '3. ظهور الاسم تدريجياً',
    labelEn: '3. Gradual Reveal',
    shortDescAr: 'ظهور سينمائي ناعم مع ارتفاع تدريجي للأمام',
    shortDescEn: 'Cinematic fade-in with gentle depth rise',
    category: 'motion',
  },
  {
    id: 'frontBackZoom',
    labelAr: '4. دخول من الأمام والخلف',
    labelEn: '4. Front & Back Zoom',
    shortDescAr: 'اندفاع ثلاثي الأبعاد من العمق نحو الكاميرا',
    shortDescEn: 'Dramatic Z-axis depth approach and settle',
    category: 'motion',
  },
  {
    id: 'goldShimmer',
    labelAr: '5. لمعان ذهبي متحرك',
    labelEn: '5. Moving Gold Shimmer',
    shortDescAr: 'شعاع بريق ذهبي ينزلق عبر واجهة وحواف الحروف',
    shortDescEn: 'Liquid gold light beam sweeping across faces',
    category: 'light',
  },
  {
    id: 'lightReflection',
    labelAr: '6. انعكاس الضوء على الحروف',
    labelEn: '6. Light Reflection Sweep',
    shortDescAr: 'كشافان ضوئيان يدوران لعكس البريق على المجسم',
    shortDescEn: 'Dual studio spotlights orbiting specular bevels',
    category: 'light',
  },
  {
    id: 'haloGlow',
    labelAr: '7. توهج حول الاسم',
    labelEn: '7. Aura Halo Glow',
    shortDescAr: 'هالة ضوئية متوهجة تنبض خلف وحول المجسم',
    shortDescEn: 'Volumetric luminous aura pulsing around text',
    category: 'light',
  },
  {
    id: 'proShake',
    labelAr: '8. اهتزاز احترافي خفيف',
    labelEn: '8. Pro Subtle Shake',
    shortDescAr: 'اهتزاز سينمائي متزن يمنح الاسم حضوراً قوياً',
    shortDescEn: 'Refined cinematic micro-tremor impact',
    category: 'motion',
  },
  {
    id: 'flyAssemble',
    labelAr: '9. طيران الحروف وتجميعها',
    labelEn: '9. Fly & Assemble Pieces',
    shortDescAr: 'تطاير قطع المجسم ثلاثي الأبعاد ثم تجمعها بدقة',
    shortDescEn: '3D pieces fly through space and assemble into name',
    category: 'piece',
  },
  {
    id: 'individualSpin',
    labelAr: '10. دوران الحروف بشكل منفصل',
    labelEn: '10. Individual Letter Spin',
    shortDescAr: 'كل جزء وحرف يدور حول محوره الخاص بتتابع أنيق',
    shortDescEn: 'Each 3D glyph spins independently in wave sequence',
    category: 'piece',
  },
  {
    id: 'pulseGlow',
    labelAr: '11. نبض وتوهج الاسم',
    labelEn: '11. Pulse & Glow Beat',
    shortDescAr: 'نبضة حجم متناسقة مع وميض معدني متصاعد',
    shortDescEn: 'Rhythmic 3D scale pulse synced with emissive glow',
    category: 'light',
  },
  {
    id: 'metallicReflections',
    labelAr: '12. انعكاسات معدنية 3D',
    labelEn: '12. 3D Metallic Reflections',
    shortDescAr: 'تموج انعكاسات الكروم والمعادن عبر الزوايا الثلاثية',
    shortDescEn: 'Multi-axis studio chrome and metallic mirror sweep',
    category: 'light',
  },
];

export const NAME3D_MATERIAL_PRESETS: Name3DMaterialPreset[] = [
  {
    id: 'gold-shiny',
    labelAr: 'ذهبي لامع 24K',
    labelEn: 'Shiny 24K Gold',
    group: 'gold',
    faceColor: '#ffd966',
    faceGradientEnabled: true,
    faceColors: ['#fff4b8', '#f5b82e', '#b87408'],
    sideColor: '#d99316',
    depthColor: '#6b4104',
    metalness: 92,
    shininess: 88,
    reflectionStrength: 90,
    glowColor: '#ffbe3d',
    swatchGradient: 'linear-gradient(135deg, #fff4b8 0%, #f5b82e 48%, #8f5605 100%)',
  },
  {
    id: 'gold-metallic',
    labelAr: 'ذهبي معدني مصقول',
    labelEn: 'Brushed Metallic Gold',
    group: 'gold',
    faceColor: '#e6b44c',
    faceGradientEnabled: true,
    faceColors: ['#f8e096', '#d89f2c', '#8c5c0e'],
    sideColor: '#b37a18',
    depthColor: '#4c3006',
    metalness: 96,
    shininess: 76,
    reflectionStrength: 85,
    glowColor: '#eab308',
    swatchGradient: 'linear-gradient(135deg, #f8e096 0%, #d89f2c 52%, #5c3a06 100%)',
  },
  {
    id: 'gold-dark',
    labelAr: 'ذهبي داكن عتيق',
    labelEn: 'Antique Dark Gold',
    group: 'gold',
    faceColor: '#c98a22',
    faceGradientEnabled: true,
    faceColors: ['#e5b55c', '#a86b14', '#4d2c05'],
    sideColor: '#7a4a09',
    depthColor: '#2d1803',
    metalness: 90,
    shininess: 70,
    reflectionStrength: 78,
    glowColor: '#d97706',
    swatchGradient: 'linear-gradient(135deg, #e5b55c 0%, #a86b14 50%, #3a1f04 100%)',
  },
  {
    id: 'rose-gold',
    labelAr: 'ذهبي وردي فاخر',
    labelEn: 'Luxury Rose Gold',
    group: 'gold',
    faceColor: '#f3b6a4',
    faceGradientEnabled: true,
    faceColors: ['#ffe2d9', '#e59584', '#9c4e43'],
    sideColor: '#c87363',
    depthColor: '#5c2821',
    metalness: 90,
    shininess: 86,
    reflectionStrength: 88,
    glowColor: '#fb7185',
    swatchGradient: 'linear-gradient(135deg, #ffe2d9 0%, #e59584 50%, #7f382e 100%)',
  },
  {
    id: 'silver-mirror',
    labelAr: 'فضي مرآوي',
    labelEn: 'Mirror Silver',
    group: 'metal',
    faceColor: '#e8eef5',
    faceGradientEnabled: true,
    faceColors: ['#ffffff', '#cbd5e1', '#64748b'],
    sideColor: '#94a3b8',
    depthColor: '#334155',
    metalness: 95,
    shininess: 92,
    reflectionStrength: 95,
    glowColor: '#cbd5e1',
    swatchGradient: 'linear-gradient(135deg, #ffffff 0%, #cbd5e1 48%, #475569 100%)',
  },
  {
    id: 'platinum',
    labelAr: 'بلاتيني ملكي',
    labelEn: 'Royal Platinum',
    group: 'metal',
    faceColor: '#dbe2eb',
    faceGradientEnabled: true,
    faceColors: ['#f8fafc', '#b6c2d2', '#4c5767'],
    sideColor: '#8d9bae',
    depthColor: '#272f3b',
    metalness: 97,
    shininess: 84,
    reflectionStrength: 92,
    glowColor: '#93c5fd',
    swatchGradient: 'linear-gradient(135deg, #f8fafc 0%, #9eaec2 50%, #333c4a 100%)',
  },
  {
    id: 'copper-bronze',
    labelAr: 'نحاسي برونزي',
    labelEn: 'Polished Copper',
    group: 'metal',
    faceColor: '#e28955',
    faceGradientEnabled: true,
    faceColors: ['#ffd3b6', '#d9723c', '#7c2d12'],
    sideColor: '#b45324',
    depthColor: '#451a08',
    metalness: 92,
    shininess: 82,
    reflectionStrength: 84,
    glowColor: '#f97316',
    swatchGradient: 'linear-gradient(135deg, #ffd3b6 0%, #d9723c 50%, #5c1f0c 100%)',
  },
  {
    id: 'chrome-liquid',
    labelAr: 'كروم لامع سائل',
    labelEn: 'Liquid Chrome',
    group: 'metal',
    faceColor: '#f1f5f9',
    faceGradientEnabled: true,
    faceColors: ['#ffffff', '#94a3b8', '#1e293b', '#e2e8f0'],
    sideColor: '#cbd5e1',
    depthColor: '#0f172a',
    metalness: 100,
    shininess: 98,
    reflectionStrength: 100,
    glowColor: '#38bdf8',
    swatchGradient: 'linear-gradient(135deg, #ffffff 0%, #64748b 45%, #f8fafc 70%, #0f172a 100%)',
  },
  {
    id: 'royal-emerald',
    labelAr: 'زمردي بحواف ذهبية',
    labelEn: 'Emerald & Gold',
    group: 'luxury',
    faceColor: '#10b981',
    faceGradientEnabled: true,
    faceColors: ['#6ee7b7', '#059669', '#064e3b'],
    sideColor: '#f5b82e',
    depthColor: '#784605',
    metalness: 86,
    shininess: 90,
    reflectionStrength: 86,
    glowColor: '#34d399',
    swatchGradient: 'linear-gradient(135deg, #6ee7b7 0%, #059669 55%, #f5b82e 100%)',
  },
  {
    id: 'ruby-gold',
    labelAr: 'ياقوتي أحمر وذهبي',
    labelEn: 'Imperial Ruby & Gold',
    group: 'luxury',
    faceColor: '#e11d48',
    faceGradientEnabled: true,
    faceColors: ['#fda4af', '#be123c', '#4c0519'],
    sideColor: '#f5b82e',
    depthColor: '#6b3e05',
    metalness: 85,
    shininess: 90,
    reflectionStrength: 86,
    glowColor: '#fb7185',
    swatchGradient: 'linear-gradient(135deg, #fda4af 0%, #be123c 55%, #f5b82e 100%)',
  },
  {
    id: 'sapphire-chrome',
    labelAr: 'ياقوتي أزرق وبلاتين',
    labelEn: 'Sapphire & Platinum',
    group: 'luxury',
    faceColor: '#2563eb',
    faceGradientEnabled: true,
    faceColors: ['#93c5fd', '#1d4ed8', '#172554'],
    sideColor: '#dbeafe',
    depthColor: '#1e3a8a',
    metalness: 88,
    shininess: 92,
    reflectionStrength: 90,
    glowColor: '#3b82f6',
    swatchGradient: 'linear-gradient(135deg, #93c5fd 0%, #1d4ed8 55%, #cbd5e1 100%)',
  },
  {
    id: 'obsidian-gold',
    labelAr: 'أوبسيديان أسود وذهب',
    labelEn: 'Obsidian & 24K Rim',
    group: 'luxury',
    faceColor: '#1e202b',
    faceGradientEnabled: true,
    faceColors: ['#475569', '#11131a', '#05060a'],
    sideColor: '#fbbf24',
    depthColor: '#92400e',
    metalness: 92,
    shininess: 95,
    reflectionStrength: 92,
    glowColor: '#f59e0b',
    swatchGradient: 'linear-gradient(135deg, #334155 0%, #090a0f 58%, #fbbf24 100%)',
  },
];

export const NAME3D_BG_PRESETS: Name3DBgPreset[] = [
  {
    id: 'obsidian-studio',
    labelAr: 'أسود ملكي',
    labelEn: 'Obsidian Black',
    bgMode: 'gradient',
    bgColor: '#07070c',
    bgGradientColors: ['#131320', '#090910', '#040407'],
    bgGradientAngle: 180,
    bgGlowColor: '#f59e0b',
    bgGlowIntensity: 38,
  },
  {
    id: 'golden-palace',
    labelAr: 'ذهبي مخملي',
    labelEn: 'Royal Gold',
    bgMode: 'gradient',
    bgColor: '#241806',
    bgGradientColors: ['#4a3109', '#1f1404', '#0d0802'],
    bgGradientAngle: 145,
    bgGlowColor: '#fbbf24',
    bgGlowIntensity: 55,
  },
  {
    id: 'pure-white',
    labelAr: 'أبيض نقي',
    labelEn: 'Pure White',
    bgMode: 'solid',
    bgColor: '#ffffff',
    bgGradientColors: ['#ffffff', '#f3f4f6', '#e5e7eb'],
    bgGradientAngle: 180,
    bgGlowColor: '#f59e0b',
    bgGlowIntensity: 10,
  },
  {
    id: 'midnight-violet',
    labelAr: 'ليلي SVGA PRO',
    labelEn: 'SVGA Midnight',
    bgMode: 'gradient',
    bgColor: '#0c0a1d',
    bgGradientColors: ['#1e1548', '#0e0b22', '#060510'],
    bgGradientAngle: 135,
    bgGlowColor: '#8b5cf6',
    bgGlowIntensity: 48,
  },
  {
    id: 'imperial-navy',
    labelAr: 'كحلي ملكي',
    labelEn: 'Royal Navy',
    bgMode: 'gradient',
    bgColor: '#07142b',
    bgGradientColors: ['#0f2957', '#081733', '#030a17'],
    bgGradientAngle: 150,
    bgGlowColor: '#38bdf8',
    bgGlowIntensity: 42,
  },
  {
    id: 'transparent',
    labelAr: 'شفاف بالكامل',
    labelEn: 'Transparent',
    bgMode: 'transparent',
    bgColor: '#000000',
    bgGradientColors: ['#000000', '#000000', '#000000'],
    bgGradientAngle: 180,
    bgGlowColor: '#f59e0b',
    bgGlowIntensity: 0,
  },
];

export const DEFAULT_NAME3D_CONFIG: Name3DConfig = {
  text: 'سلطان الذهب',
  fontId: 'cairo-black',
  shapeStyleId: 'royal-bevel',
  fontSize: 96,
  letterThickness: 6,
  extrudeDepth: 36,
  letterSpacing: 0,
  viewAngleX: -8,
  viewAngleY: 16,
  viewAngleZ: 0,
  animationId: 'slowOrbit',
  animationSpeed: 1.0,
  animationDirection: 'normal',
  animationDuration: 3.5,
  isPlaying: true,
  materialPresetId: 'gold-shiny',
  faceColor: '#ffd966',
  faceGradientEnabled: true,
  faceColors: ['#fff4b8', '#f5b82e', '#b87408'],
  faceGradientAngle: 135,
  sideColor: '#d99316',
  depthColor: '#6b4104',
  animatedColorShimmer: true,
  bgMode: 'gradient',
  bgPresetId: 'obsidian-studio',
  bgColor: '#07070c',
  bgGradientColors: ['#131320', '#090910', '#040407'],
  bgGradientAngle: 180,
  bgGlowIntensity: 38,
  bgGlowColor: '#f59e0b',
  bgParticlesEnabled: true,
  lightingIntensity: 105,
  reflectionStrength: 90,
  shadowIntensity: 55,
  shininess: 88,
  metalness: 92,
  glowStrength: 32,
  glowColor: '#ffbe3d',
};

export interface Point2D {
  x: number;
  y: number;
}

export interface ContourPolygon {
  outer: Point2D[];
  holes: Point2D[][];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  centerX: number;
  centerY: number;
  area: number;
}

export function sanitizeHexColor(input: string, fallback = '#ffd966'): string {
  const cleaned = (input || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(cleaned)) return cleaned.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) return `#${cleaned.toLowerCase()}`;
  if (/^#[0-9a-fA-F]{3}$/.test(cleaned)) {
    const r = cleaned[1];
    const g = cleaned[2];
    const b = cleaned[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return fallback;
}

export function detectTextIsRtl(text: string): boolean {
  const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  return arabicRegex.test(text || '');
}

/**
 * Signed area of a 2D polygon in screen coordinates (Y down).
 * Using shoelace formula: sum (x_i * y_{i+1} - x_{i+1} * y_i) / 2.
 * In screen coords (Y down), a CW outer boundary around a solid pixel has positive area.
 */
export function computePolygonSignedArea(pts: Point2D[]): number {
  let sum = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum * 0.5;
}

export function pointInPolygon(pt: Point2D, poly: Point2D[]): boolean {
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect =
      yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function perpDistance(pt: Point2D, lineStart: Point2D, lineEnd: Point2D): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) {
    return Math.hypot(pt.x - lineStart.x, pt.y - lineStart.y);
  }
  const num = Math.abs(dy * pt.x - dx * pt.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x);
  return num / Math.sqrt(lenSq);
}

function rdpOpen(pts: Point2D[], epsilon: number): Point2D[] {
  if (pts.length <= 2) return pts;
  let maxDist = 0;
  let index = 0;
  const last = pts.length - 1;
  for (let i = 1; i < last; i++) {
    const d = perpDistance(pts[i], pts[0], pts[last]);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (maxDist > epsilon) {
    const left = rdpOpen(pts.slice(0, index + 1), epsilon);
    const right = rdpOpen(pts.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [pts[0], pts[last]];
}

export function simplifyClosedPolygon(pts: Point2D[], epsilon = 0.55): Point2D[] {
  if (pts.length <= 4) return pts;
  // Remove collinear points first
  const dedup: Point2D[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const curr = pts[i];
    const next = pts[(i + 1) % n];
    const cross = (curr.x - prev.x) * (next.y - curr.y) - (curr.y - prev.y) * (next.x - curr.x);
    if (Math.abs(cross) > 1e-5) {
      dedup.push(curr);
    }
  }
  if (dedup.length <= 4) return dedup.length >= 3 ? dedup : pts;

  // Split at farthest pair for closed RDP
  let splitIdx = Math.floor(dedup.length / 2);
  let maxD = -1;
  for (let i = 1; i < dedup.length; i++) {
    const d = (dedup[i].x - dedup[0].x) ** 2 + (dedup[i].y - dedup[0].y) ** 2;
    if (d > maxD) {
      maxD = d;
      splitIdx = i;
    }
  }
  const part1 = rdpOpen(dedup.slice(0, splitIdx + 1), epsilon);
  const part2 = rdpOpen(dedup.slice(splitIdx).concat([dedup[0]]), epsilon);
  const merged = part1.slice(0, -1).concat(part2.slice(0, -1));
  return merged.length >= 3 ? merged : dedup;
}

export function smoothClosedPolygonChaikin(pts: Point2D[], iterations = 2): Point2D[] {
  let current = pts;
  for (let iter = 0; iter < iterations; iter++) {
    const n = current.length;
    if (n < 3) break;
    const next: Point2D[] = new Array(n * 2);
    for (let i = 0; i < n; i++) {
      const p0 = current[i];
      const p1 = current[(i + 1) % n];
      next[i * 2] = {
        x: 0.75 * p0.x + 0.25 * p1.x,
        y: 0.75 * p0.y + 0.25 * p1.y,
      };
      next[i * 2 + 1] = {
        x: 0.25 * p0.x + 0.75 * p1.x,
        y: 0.25 * p0.y + 0.75 * p1.y,
      };
    }
    current = next;
  }
  return current;
}

/**
 * Pure TypeScript directed-grid contour extractor.
 * Extracts all outer shapes and their inner holes (like و، م، ه، O، A، 8) from a binary alpha mask.
 * Works identically for Arabic connected cursive, tashkeel, English, and ornate Unicode symbols.
 */
export function extractContoursFromMask(
  mask: Uint8Array,
  width: number,
  height: number,
  options?: { smoothPasses?: number; simplifyEpsilon?: number; minArea?: number }
): ContourPolygon[] {
  const smoothPasses = options?.smoothPasses ?? 2;
  const simplifyEpsilon = options?.simplifyEpsilon ?? 0.52;
  const minArea = options?.minArea ?? 4.0;

  if (width <= 0 || height <= 0 || mask.length < width * height) return [];

  const isFilled = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    return mask[y * width + x] > 0;
  };

  // Adjacency map: vertex key -> outgoing edges (dx, dy, toX, toY, used)
  // Grid vertex coordinates range [0..width] x [0..height]
  const stride = width + 1;
  type OutEdge = { toX: number; toY: number; dir: number; used: boolean };
  // dir: 0 = Right (+1,0), 1 = Down (0,+1), 2 = Left (-1,0), 3 = Up (0,-1)
  const outgoing = new Map<number, OutEdge[]>();

  const addEdge = (x0: number, y0: number, x1: number, y1: number, dir: number) => {
    const key = y0 * stride + x0;
    let list = outgoing.get(key);
    if (!list) {
      list = [];
      outgoing.set(key, list);
    }
    list.push({ toX: x1, toY: y1, dir, used: false });
  };

  // Emit directed boundary edges with solid pixel on the RIGHT of each edge (CW outer in Y-down screen coords, CCW hole)
  for (let y = 0; y < height; y++) {
    const rowOff = y * width;
    for (let x = 0; x < width; x++) {
      if (mask[rowOff + x] === 0) continue;
      if (!isFilled(x, y - 1)) addEdge(x, y, x + 1, y, 0); // Top -> Right
      if (!isFilled(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1, 1); // Right -> Down
      if (!isFilled(x, y + 1)) addEdge(x + 1, y + 1, x, y + 1, 2); // Bottom -> Left
      if (!isFilled(x - 1, y)) addEdge(x, y + 1, x, y, 3); // Left -> Up
    }
  }

  const rawLoops: Point2D[][] = [];

  for (const [startKey, startEdges] of outgoing.entries()) {
    for (const firstEdge of startEdges) {
      if (firstEdge.used) continue;

      const startX = startKey % stride;
      const startY = Math.floor(startKey / stride);
      const loop: Point2D[] = [{ x: startX, y: startY }];

      firstEdge.used = true;
      let cx = firstEdge.toX;
      let cy = firstEdge.toY;
      let prevDir = firstEdge.dir;

      let safety = width * height * 4 + 100;
      while ((cx !== startX || cy !== startY) && safety-- > 0) {
        loop.push({ x: cx, y: cy });
        const edges = outgoing.get(cy * stride + cx);
        if (!edges || edges.length === 0) break;

        let chosen: OutEdge | null = null;
        if (edges.length === 1) {
          if (!edges[0].used) chosen = edges[0];
        } else {
          // Saddle vertex (2 touching diagonal pixels): prefer turning RIGHT relative to prevDir to keep contours non-crossing
          const rightTurnDir = (prevDir + 1) & 3;
          const straightDir = prevDir;
          const leftTurnDir = (prevDir + 3) & 3;
          const priority = [rightTurnDir, straightDir, leftTurnDir, (prevDir + 2) & 3];
          for (const d of priority) {
            const candidate = edges.find((e) => !e.used && e.dir === d);
            if (candidate) {
              chosen = candidate;
              break;
            }
          }
        }
        if (!chosen) break;
        chosen.used = true;
        prevDir = chosen.dir;
        cx = chosen.toX;
        cy = chosen.toY;
      }

      if (loop.length >= 4) {
        rawLoops.push(loop);
      }
    }
  }

  interface ClassifiedLoop {
    pts: Point2D[];
    rawArea: number;
    absArea: number;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  }

  const outers: ClassifiedLoop[] = [];
  const holes: ClassifiedLoop[] = [];

  for (const raw of rawLoops) {
    // Collapse straight runs first so smoothing operates on meaningful corners
    const collapsed: Point2D[] = [];
    const n = raw.length;
    for (let i = 0; i < n; i++) {
      const prev = raw[(i - 1 + n) % n];
      const curr = raw[i];
      const next = raw[(i + 1) % n];
      const cross = (curr.x - prev.x) * (next.y - curr.y) - (curr.y - prev.y) * (next.x - curr.x);
      if (Math.abs(cross) > 1e-6) {
        collapsed.push(curr);
      }
    }
    if (collapsed.length < 3) continue;

    const rawArea = computePolygonSignedArea(collapsed);
    const absArea = Math.abs(rawArea);
    if (absArea < minArea) continue;

    const smoothed = smoothPasses > 0 ? smoothClosedPolygonChaikin(collapsed, smoothPasses) : collapsed;
    const simplified = simplifyEpsilon > 0 ? simplifyClosedPolygon(smoothed, simplifyEpsilon) : smoothed;
    if (simplified.length < 3) continue;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of simplified) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    const item: ClassifiedLoop = {
      pts: simplified,
      rawArea,
      absArea,
      minX,
      maxX,
      minY,
      maxY,
    };

    if (rawArea > 0) {
      outers.push(item);
    } else {
      holes.push(item);
    }
  }

  // Build ContourPolygons and assign each hole to the smallest enclosing outer contour
  const results: ContourPolygon[] = outers.map((o) => ({
    outer: o.pts,
    holes: [],
    minX: o.minX,
    maxX: o.maxX,
    minY: o.minY,
    maxY: o.maxY,
    centerX: (o.minX + o.maxX) * 0.5,
    centerY: (o.minY + o.maxY) * 0.5,
    area: o.absArea,
  }));

  for (const h of holes) {
    const samplePt = h.pts[0];
    let bestIdx = -1;
    let bestArea = Infinity;
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (
        samplePt.x < r.minX ||
        samplePt.x > r.maxX ||
        samplePt.y < r.minY ||
        samplePt.y > r.maxY
      ) {
        continue;
      }
      if (r.area < bestArea && pointInPolygon(samplePt, r.outer)) {
        bestArea = r.area;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      results[bestIdx].holes.push(h.pts);
    }
  }

  // Sort left-to-right (or right-to-left for RTL animations) by centerX
  results.sort((a, b) => a.centerX - b.centerX);
  return results;
}

export interface EvaluatedMasterTransform {
  posX: number;
  posY: number;
  posZ: number;
  rotX: number; // radians
  rotY: number; // radians
  rotZ: number; // radians
  scale: number;
  opacity: number;
  shimmerOffset: number; // -1..1
  lightOrbitAngle: number; // radians
  glowBoost: number; // 0..2
  metallicWave: number; // 0..1
}

export interface EvaluatedPieceTransform {
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  scale: number;
}

export function normalizeAnimProgress(
  rawPhase: number,
  direction: Name3DAnimDirection
): number {
  const wrapped = ((rawPhase % 1) + 1) % 1;
  if (direction === 'reverse') return 1 - wrapped;
  if (direction === 'alternate') {
    const twoCycle = ((rawPhase % 2) + 2) % 2;
    return twoCycle <= 1 ? twoCycle : 2 - twoCycle;
  }
  return wrapped;
}

function easeOutCubic(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - c, 3);
}

function easeInOutSine(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return -(Math.cos(Math.PI * c) - 1) / 2;
}

/**
 * Deterministic 3D animation evaluator used by both live WebGL playback and frame-exact GIF/MP4 export.
 */
export function evaluateName3DAnimation(
  animationId: Name3DAnimationId,
  rawPhase: number,
  direction: Name3DAnimDirection,
  baseAnglesDeg: { x: number; y: number; z: number }
): EvaluatedMasterTransform {
  const p = normalizeAnimProgress(rawPhase, direction);
  const tau = Math.PI * 2;
  const rad = Math.PI / 180;
  const bx = baseAnglesDeg.x * rad;
  const by = baseAnglesDeg.y * rad;
  const bz = baseAnglesDeg.z * rad;

  const out: EvaluatedMasterTransform = {
    posX: 0,
    posY: 0,
    posZ: 0,
    rotX: bx,
    rotY: by,
    rotZ: bz,
    scale: 1,
    opacity: 1,
    shimmerOffset: Math.sin(p * tau),
    lightOrbitAngle: p * tau,
    glowBoost: 1,
    metallicWave: 0.5 + 0.5 * Math.sin(p * tau),
  };

  switch (animationId) {
    case 'none':
      return out;

    case 'spin3d':
      out.rotY = by + p * tau;
      out.rotX = bx + Math.sin(p * tau) * 0.12;
      break;

    case 'slowOrbit':
      out.rotY = by + Math.sin(p * tau) * 0.42;
      out.rotX = bx + Math.sin(p * tau * 2) * 0.08;
      out.posY = Math.sin(p * tau) * 0.14;
      break;

    case 'fadeReveal': {
      // 0..0.38 reveal in, 0.38..0.82 hold with gentle float, 0.82..1.0 gentle fade out for seamless loop
      if (p < 0.38) {
        const e = easeOutCubic(p / 0.38);
        out.opacity = e;
        out.scale = 0.82 + 0.18 * e;
        out.posZ = -1.8 * (1 - e);
        out.rotX = bx + 0.25 * (1 - e);
      } else if (p <= 0.84) {
        const hold = (p - 0.38) / 0.46;
        out.opacity = 1;
        out.posY = Math.sin(hold * Math.PI) * 0.1;
        out.rotY = by + Math.sin(hold * Math.PI) * 0.14;
      } else {
        const e = easeInOutSine((p - 0.84) / 0.16);
        out.opacity = 1 - e;
        out.scale = 1 + 0.06 * e;
        out.posZ = 0.5 * e;
      }
      break;
    }

    case 'frontBackZoom': {
      const wave = Math.sin(p * tau);
      out.posZ = wave * 2.1;
      out.rotY = by + Math.cos(p * tau) * 0.24;
      out.rotX = bx + Math.sin(p * tau) * 0.1;
      out.scale = 1 + wave * 0.08;
      break;
    }

    case 'goldShimmer':
      out.shimmerOffset = -1.3 + p * 2.6;
      out.lightOrbitAngle = -1.2 + p * 2.4;
      out.rotY = by + Math.sin(p * tau) * 0.16;
      out.glowBoost = 1.0 + 0.45 * Math.pow(Math.max(0, Math.sin(p * Math.PI)), 2);
      break;

    case 'lightReflection':
      out.lightOrbitAngle = p * tau;
      out.shimmerOffset = Math.cos(p * tau) * 1.15;
      out.rotY = by + Math.sin(p * tau) * 0.22;
      out.rotX = bx + Math.cos(p * tau) * 0.09;
      out.glowBoost = 1.15 + 0.3 * Math.sin(p * tau * 2);
      break;

    case 'haloGlow':
      out.glowBoost = 0.75 + 1.15 * (0.5 + 0.5 * Math.sin(p * tau));
      out.posY = Math.sin(p * tau) * 0.12;
      out.rotY = by + Math.sin(p * tau) * 0.14;
      break;

    case 'proShake': {
      const env = 0.65 + 0.35 * Math.sin(p * tau);
      out.posX = Math.sin(p * tau * 6) * 0.09 * env;
      out.posY = Math.cos(p * tau * 8) * 0.06 * env;
      out.rotZ = bz + Math.sin(p * tau * 5) * 0.045 * env;
      out.rotY = by + Math.sin(p * tau * 3) * 0.12;
      break;
    }

    case 'flyAssemble':
      out.rotY = by + Math.sin(p * tau) * 0.15;
      break;

    case 'individualSpin':
      out.rotY = by + Math.sin(p * tau) * 0.1;
      break;

    case 'pulseGlow': {
      const beat = Math.pow(Math.max(0, Math.sin(p * tau * 2)), 2);
      out.scale = 1 + beat * 0.12;
      out.posZ = beat * 0.45;
      out.glowBoost = 0.85 + beat * 1.15;
      out.rotY = by + Math.sin(p * tau) * 0.15;
      break;
    }

    case 'metallicReflections':
      out.rotY = by + Math.sin(p * tau) * 0.34;
      out.rotX = bx + Math.sin(p * tau * 2) * 0.14;
      out.lightOrbitAngle = p * tau * 2;
      out.shimmerOffset = -1.2 + ((p * 2) % 1) * 2.4;
      out.metallicWave = 0.5 + 0.5 * Math.sin(p * tau * 2);
      out.glowBoost = 1.1 + 0.35 * Math.sin(p * tau * 2);
      break;
  }

  return out;
}

/**
 * Evaluates per-glyph/per-piece 3D offset & rotation for piece-level animations
 * (#9 Fly & Assemble, #10 Individual Letter Spin).
 */
export function evaluatePiece3DTransform(
  animationId: Name3DAnimationId,
  rawPhase: number,
  direction: Name3DAnimDirection,
  pieceIndex: number,
  pieceCount: number
): EvaluatedPieceTransform {
  const identity: EvaluatedPieceTransform = {
    offsetX: 0,
    offsetY: 0,
    offsetZ: 0,
    rotX: 0,
    rotY: 0,
    rotZ: 0,
    scale: 1,
  };
  if (pieceCount <= 0) return identity;

  const p = normalizeAnimProgress(rawPhase, direction);
  const normIdx = pieceCount > 1 ? pieceIndex / (pieceCount - 1) : 0.5;
  const seed = Math.sin((pieceIndex + 1) * 12.9898) * 43758.5453;
  const randA = seed - Math.floor(seed);
  const seed2 = Math.cos((pieceIndex + 1) * 78.233) * 19341.231;
  const randB = seed2 - Math.floor(seed2);

  if (animationId === 'flyAssemble') {
    // 0..0.46 fly in & assemble, 0.46..0.82 hold assembled cleanly, 0.82..1.0 disperse softly for seamless loop
    const stagger = normIdx * 0.18;
    let scatter = 0;
    if (p < 0.52) {
      const localT = Math.max(0, Math.min(1, (p - stagger) / 0.34));
      scatter = 1 - easeOutCubic(localT);
    } else if (p <= 0.82) {
      scatter = 0;
    } else {
      const localOut = Math.max(0, Math.min(1, (p - 0.82) / 0.18));
      scatter = easeInOutSine(localOut);
    }

    const dirX = (normIdx - 0.5) * 6.5 + (randA - 0.5) * 2.4;
    const dirY = (randB - 0.5) * 4.8 + (pieceIndex % 2 === 0 ? 1.4 : -1.4);
    const dirZ = 2.6 + randA * 3.5;

    return {
      offsetX: dirX * scatter || 0,
      offsetY: dirY * scatter || 0,
      offsetZ: dirZ * scatter || 0,
      rotX: (randB - 0.5) * Math.PI * 2.2 * scatter || 0,
      rotY: (randA - 0.5) * Math.PI * 3.0 * scatter || 0,
      rotZ: (normIdx - 0.5) * Math.PI * 1.4 * scatter || 0,
      scale: 0.35 + 0.65 * (1 - scatter * 0.65),
    };
  }

  if (animationId === 'individualSpin') {
    const waveOffset = normIdx * 0.45;
    const localPhase = ((p - waveOffset) % 1 + 1) % 1;
    // Spin smoothly for first 60% of each piece's cycle, rest briefly upright
    const spinT = localPhase < 0.65 ? easeInOutSine(localPhase / 0.65) : 1;
    const bob = Math.sin(localPhase * Math.PI * 2) * 0.16;
    return {
      offsetX: 0,
      offsetY: bob,
      offsetZ: Math.sin(spinT * Math.PI) * 0.35,
      rotX: Math.sin(spinT * Math.PI) * 0.2,
      rotY: spinT * Math.PI * 2,
      rotZ: 0,
      scale: 1 + Math.sin(spinT * Math.PI) * 0.08,
    };
  }

  return identity;
}
