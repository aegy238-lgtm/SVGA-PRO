export interface GuideCalloutItem {
  num: number;
  titleAr: string;
  titleEn: string;
  descAr: string;
  descEn: string;
  badgeAr?: string;
  badgeEn?: string;
  posTop: string;
  posLeft: string;
}

export interface GuideShortcutBadge {
  keysAr: string;
  keysEn: string;
  actionAr: string;
  actionEn: string;
  highlight?: boolean;
}

export interface GuideBookChapter {
  id: string;
  icon: string;
  badgeAr: string;
  badgeEn: string;
  titleAr: string;
  titleEn: string;
  summaryAr: string;
  summaryEn: string;
  targetView: 'home' | 'editor' | 'gifts' | 'gift-image';
  accentColor: string;
  screenshotImage?: string;
  callouts: GuideCalloutItem[];
  shortcuts: GuideShortcutBadge[];
}

/**
 * Pure function: Determines whether the floating Guidebook button should be visible.
 * Per user requirement: The book icon appears ONLY on the main home landing view ('home'),
 * and immediately disappears whenever the user enters any feature/tool ('convert', 'editor', 'gifts', 'gift-image').
 */
export function shouldShowGuideBookButton(activeView: string | null | undefined): boolean {
  const normalized = (activeView || 'home').trim().toLowerCase();
  return normalized === 'home';
}

/**
 * Pure function: Checks whether a keyboard event should trigger instant export.
 * Supports `Tab` key (and `ArrowLeft` when not inside form controls) while ignoring inputs/textareas/selects.
 */
export function isQuickExportKeyEvent(params: {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  targetTagName?: string;
  targetType?: string;
  isContentEditable?: boolean;
  hasOpenModal?: boolean;
}): { shouldExport: boolean; triggerType: 'tab' | 'arrow_left' | null } {
  if (params.hasOpenModal) {
    return { shouldExport: false, triggerType: null };
  }
  if (params.ctrlKey || params.altKey || params.metaKey) {
    return { shouldExport: false, triggerType: null };
  }

  const tag = (params.targetTagName || '').toUpperCase();
  if (params.isContentEditable) {
    return { shouldExport: false, triggerType: null };
  }

  // If user is typing inside an input, textarea, or select:
  // Do not hijack ArrowLeft; and for Tab, only trigger if not typing in a text/number/password/search/email input
  const isTextInput =
    tag === 'TEXTAREA' ||
    (tag === 'INPUT' &&
      !['BUTTON', 'CHECKBOX', 'RADIO', 'RANGE', 'COLOR', 'FILE'].includes(
        (params.targetType || '').toUpperCase()
      ));

  if (params.key === 'Tab') {
    if (isTextInput) {
      return { shouldExport: false, triggerType: null };
    }
    return { shouldExport: true, triggerType: 'tab' };
  }

  if (params.key === 'ArrowLeft') {
    if (isTextInput || tag === 'SELECT' || (tag === 'INPUT' && (params.targetType || '').toUpperCase() === 'RANGE')) {
      return { shouldExport: false, triggerType: null };
    }
    return { shouldExport: true, triggerType: 'arrow_left' };
  }

  return { shouldExport: false, triggerType: null };
}

export const GUIDE_BOOK_CHAPTERS: GuideBookChapter[] = [
  {
    id: 'motion_converter',
    icon: '⚡',
    badgeAr: 'الوظيفة الأساسية + التصدير السريع',
    badgeEn: 'Core Converter & Instant Export',
    titleAr: 'معالجة وتحويل الهدايا والتصدير الفوري (كليك شمال / Tab)',
    titleEn: 'Motion Gift Processing & Instant Export (Left-Click / Tab)',
    summaryAr:
      'استوديو متكامل لمعاينة وتحويل جميع صيغ الهدايا (SVGA, VAP, YYEVA, PAG, Lottie, MP4, WebM, GIF, WebP, PNG ZIP) مع دعم التصدير الفوري بضغطة كليك شمال على شاشة المعاينة أو زر Tab حسب الصيغة المحددة.',
    summaryEn:
      'Complete studio to preview and convert all gift formats (SVGA, VAP, YYEVA, PAG, Lottie, MP4, WebM, GIF, WebP, PNG ZIP) with instant 1-click export via Left-Click on preview or Tab key.',
    targetView: 'home',
    accentColor: '#7c5cff',
    screenshotImage: '/assets/aistudio/dsdsds_c54ede2f.png',
    callouts: [
      {
        num: 1,
        titleAr: 'التصدير الفوري بكليك شمال (Left-Click) أو زر Tab',
        titleEn: 'Instant Export via Left-Click or Tab Key',
        descAr:
          'بمجرد رفع الملف واختيار الصيغة من القائمة، اضغط (كليك شمال) مباشرة على شاشة معاينة الهدية أو اضغط زر (Tab) من الكيبورد ليتم تصدير وتحميل الملف فوراً بالصيغة المختارة!',
        descEn:
          'Once a file is loaded and your target format is selected, simply Left-Click on the preview stage or press the Tab key to immediately export and download in that format!',
        badgeAr: 'اختصار جديد ⚡',
        badgeEn: 'New Shortcut ⚡',
        posTop: '48%',
        posLeft: '50%',
      },
      {
        num: 2,
        titleAr: 'اختيار صيغة التصدير والأبعاد ومعدل الإطارات (FPS)',
        titleEn: 'Format Selection, Dimensions & FPS Control',
        descAr:
          'من اللوحة اليمنى يمكنك تحديد الصيغة المطلوبة (SVGA, VAP, YYEVA, MP4, GIF, WebP, PNG ZIP)، وتغيير العرض والارتفاع، وقص مدة الفيديو بالثواني، وعكس الاتجاه (Mirror).',
        descEn:
          'From the right panel, select your target format, customize Width × Height, FPS, trim start/end seconds, and apply horizontal/vertical mirroring.',
        badgeAr: 'تحكم كامل 🎛️',
        badgeEn: 'Full Control 🎛️',
        posTop: '62%',
        posLeft: '84%',
      },
      {
        num: 3,
        titleAr: 'تعديل الطبقات وتنعيم الحواف والعلامة المائية والصوت',
        titleEn: 'Layer Assets, Edge Feather, Watermark & Audio',
        descAr:
          'من اللوحة اليسرى يمكنك استبدال أي صورة داخل الهدية، إضافة أو حذف الصوت، تفعيل تنعيم الحواف الشفافة (Edge Feather)، أو وضع علامة مائية وتنفيذ عمليات جماعية (Batch).',
        descEn:
          'From the left panel, replace internal sprite images, edit/mute audio tracks, apply smooth Edge Feathering, or add custom watermarks and batch image ops.',
        badgeAr: 'أدوات احترافية 🎨',
        badgeEn: 'Pro Layers 🎨',
        posTop: '35%',
        posLeft: '16%',
      },
      {
        num: 4,
        titleAr: 'تغيير خلفية العرض والتكبير/التصغير (Zoom)',
        titleEn: 'Preview Background & Interactive Zoom',
        descAr:
          'اختبر شفافية الهدية على خلفية المربعات الشفافة أو الأسود أو الأخضر (كروما) أو ارفع صورة خلفية خاصة بك مع التحكم في نسبة التكبير حتى 300%.',
        descEn:
          'Test gift alpha transparency on checkerboard, solid colors, green screen, or upload a custom background image with up to 300% zoom.',
        badgeAr: 'معاينة حية 🔍',
        badgeEn: 'Live Stage 🔍',
        posTop: '82%',
        posLeft: '50%',
      },
    ],
    shortcuts: [
      {
        keysAr: '🖱️ كليك شمال (Left-Click)',
        keysEn: '🖱️ Left-Click on Stage',
        actionAr: 'تصدير فوري للملف حسب الصيغة المحددة',
        actionEn: 'Instant export in the selected format',
        highlight: true,
      },
      {
        keysAr: '⌨️ زر Tab',
        keysEn: '⌨️ Tab Key',
        actionAr: 'بدء التحويل والتصدير مباشرة بضغطة واحدة',
        actionEn: 'Start conversion & export immediately',
        highlight: true,
      },
      {
        keysAr: '⬅️ سهم شمال (ArrowLeft)',
        keysEn: '⬅️ Left Arrow Key',
        actionAr: 'اختصار سريع إضافي لتصدير الملف فوراً',
        actionEn: 'Additional quick shortcut to export file',
      },
    ],
  },
  {
    id: 'gifts_studio',
    icon: '🎁',
    badgeAr: 'استوديو الهدايا الجماعي',
    badgeEn: 'Batch Gift Files Studio',
    titleAr: 'استوديو وعرض ملفات الهدايا واستخراج الملفات المغلقة (ZIP)',
    titleEn: 'Gift Files Studio, Multi-Player & Archive Extractor',
    summaryAr:
      'يعرض عشرات ملفات الهدايا في وقت واحد، ويدعم سحب الملفات المغلقة (ZIP) لاستخراج وعرض جميع الهدايا بداخلها تلقائياً، مع تصدير الفيديو بمدد مخصصة أو فرز الفولدرات والصور.',
    summaryEn:
      'Plays dozens of gift files simultaneously, extracts closed ZIP archives automatically on drop, and exports videos with custom duration or sorted folders + PNG snapshots.',
    targetView: 'gifts',
    accentColor: '#10b981',
    screenshotImage: '/assets/aistudio/xxxx_15cd91b9.png',
    callouts: [
      {
        num: 1,
        titleAr: 'فتح الملفات المغلقة (ZIP) واستخراج الهدايا تلقائياً',
        titleEn: 'Auto-Extract Closed ZIP Archives & Folders',
        descAr:
          'اسحب أي ملف مضغوط أو مغلق (ZIP) إلى زر (رفع هدايا) ليقوم الاستوديو بفك ضغطه واستخراج كل ملفات SVGA, VAP, YYEVA, PAG, Lottie منه وعرضها فوراً في الشبكة.',
        descEn:
          'Drop any closed ZIP archive onto Upload Gifts and the studio recursively extracts and plays all SVGA, VAP, YYEVA, PAG, and Lottie files inside.',
        badgeAr: 'استخراج ذكي 📦',
        badgeEn: 'Smart ZIP 📦',
        posTop: '14%',
        posLeft: '66%',
      },
      {
        num: 2,
        titleAr: 'زر تحديد مدة تصدير الفيديو (أو المدة الأصلية)',
        titleEn: 'Custom Video Export Duration Toggle',
        descAr:
          'عند تفعيل زر (مدة الفيديو) يمكنك اختيار عدد الثواني ليتم عرض التأثير وتصدير الفيديو حسب المدة التي اخترتها، وعند إيقافه يتم التصدير بالمدة الأصلية للهدية.',
        descEn:
          'Toggle Video Duration to loop/fit the gift effect to your exact target seconds during export, or leave it off to export at original duration.',
        badgeAr: 'تحكم بالمدة ⏱️',
        badgeEn: 'Duration Control ⏱️',
        posTop: '14%',
        posLeft: '43%',
      },
      {
        num: 3,
        titleAr: 'أوضاع التصدير المتعددة + اختصار زر Tab وكليك شمال',
        titleEn: 'Multi-Mode Batch Export + Tab Shortcut',
        descAr:
          'اختر بين (هدية + فيديو + صورة) أو (فيديو فقط) أو (دمج الكل في فيديو واحد جنب بعض) أو (استخراج الفولدرات + الصور)، واضغط زر التصدير أو زر Tab للتنفيذ الفوري.',
        descEn:
          'Choose Gift+Video+Image pack, Video only, All-in-One side-by-side video, or Folders+Snapshots, then click Export or press Tab.',
        badgeAr: 'تصدير شامل 🎬',
        badgeEn: 'Batch Export 🎬',
        posTop: '14%',
        posLeft: '12%',
      },
      {
        num: 4,
        titleAr: 'كروت المعاينة التفاعلية لكل هدية',
        titleEn: 'Interactive Per-Gift Preview Cards',
        descAr:
          'كل هدية تظهر في كارت مستقل يوضح الصيغة، الأبعاد، المدة، وجود الصوت، مع أزرار لتشغيل/إيقاف الهدية، التقاط صورة PNG فورية، أو تغيير اتجاه قناة الشفافية (Alpha).',
        descEn:
          'Each gift renders in an independent card showing format, dimensions, duration, audio badge, plus instant PNG snapshot and Alpha channel controls.',
        badgeAr: 'معاينة فورية ✨',
        badgeEn: 'Live Cards ✨',
        posTop: '55%',
        posLeft: '85%',
      },
    ],
    shortcuts: [
      {
        keysAr: '⌨️ زر Tab / 🖱️ كليك شمال',
        keysEn: '⌨️ Tab Key / 🖱️ Left-Click',
        actionAr: 'بدء التصدير الجماعي حسب الصيغة والوضع المختار',
        actionEn: 'Start batch export in the selected mode',
        highlight: true,
      },
    ],
  },
  {
    id: 'gift_image_creator',
    icon: '🖼️',
    badgeAr: 'أيقونات وصور الهدايا 3D',
    badgeEn: '3D Gift Image Creator',
    titleAr: 'إنشاء صور وأيقونات الهدايا بالأشكال وتنعيم الحواف الشفافة',
    titleEn: '3D Gift Image Creator with Shapes & Soft Edge Feathering',
    summaryAr:
      'حول أي صورة أو مجموعة صور دفعة واحدة إلى أيقونة هدية احترافية (دائرة، درع ملكي، جوهرة، تاج، قلب، نجمة) مع تنعيم الحواف الشفافة وإضافة الإطارات وتصدير PNG / WebP / ZIP.',
    summaryEn:
      'Transform single or batch images into professional gift icons (Circle, Royal Shield, Diamond, Crown, Heart, Star) with soft alpha edge feathering and frame overlays.',
    targetView: 'gift-image',
    accentColor: '#ec4899',
    callouts: [
      {
        num: 1,
        titleAr: 'قص وتشكيل الصور بـ 10 قوالب هدايا احترافية',
        titleEn: '10 Precision Gift Mask Shapes',
        descAr:
          'اختر شكل القناع (دائري، مربع بحواف ناعمة، درع VIP، سداسي، ماسة، قلب، نجمة، تاج) وطبّقه على جميع الصور المرفوعة أو الصور المحددة فقط.',
        descEn:
          'Select from 10 geometric & royal gift masks and apply them across all uploaded images or selected items.',
        badgeAr: 'قوالب جاهزة 💎',
        badgeEn: '10 Shapes 💎',
        posTop: '30%',
        posLeft: '82%',
      },
      {
        num: 2,
        titleAr: 'تنعيم الحواف الشفافة غير الحادة (Soft Edge Feather)',
        titleEn: 'Smooth Transparent Edge Feathering',
        descAr:
          'يتيح لك دمج أطراف الصورة بنعومة فائقة مع الخلفية الشفافة (من 0px إلى 60px) بحيث لا تظهر أي حواف حادة عند عرض الهدية في التطبيقات.',
        descEn:
          'Smoothly feather the outer edges into alpha transparency (0–60px) to eliminate sharp borders inside live streaming apps.',
        badgeAr: 'حواف ناعمة 🌫️',
        badgeEn: 'Soft Edges 🌫️',
        posTop: '16%',
        posLeft: '36%',
      },
      {
        num: 3,
        titleAr: 'إضافة طبقة إطار أو شعار مشترك (Overlay Frame)',
        titleEn: 'Shared Frame & Logo Overlay Layer',
        descAr:
          'ارفع إطاراً ذهبياً أو شعاراً ليتم تركيبه تلقائياً فوق أو تحت جميع صور الهدايا مع التحكم بالشفافية والحجم والموضع بالسحب المباشر بالماوس.',
        descEn:
          'Upload a decorative frame or badge overlay to composite above or below all gift images with interactive drag positioning.',
        badgeAr: 'إطارات VIP ✨',
        badgeEn: 'VIP Frames ✨',
        posTop: '58%',
        posLeft: '50%',
      },
      {
        num: 4,
        titleAr: 'تصدير فوري بصيغة PNG / WebP / JPG أو ملف ZIP كامل',
        titleEn: 'Instant Single or Batch ZIP Export',
        descAr:
          'اضغط زر التنزيل أو اضغط (Tab / كليك شمال) لتصدير الصورة الحالية أو تنزيل جميع الصور المعدلة في ملف ZIP واحد منظم بأعلى دقة.',
        descEn:
          'Click Download or press Tab / Left-Click to export your masked gift image or download the entire batch as a ZIP archive.',
        badgeAr: 'تصدير سريع 📦',
        badgeEn: 'Fast ZIP 📦',
        posTop: '16%',
        posLeft: '14%',
      },
    ],
    shortcuts: [
      {
        keysAr: '⌨️ زر Tab / 🖱️ كليك شمال',
        keysEn: '⌨️ Tab Key / 🖱️ Left-Click',
        actionAr: 'تنزيل الصورة أو تصدير جميع صور الهدايا ZIP فوراً',
        actionEn: 'Download image or batch ZIP immediately',
        highlight: true,
      },
    ],
  },
  {
    id: 'svga_ae_editor',
    icon: '🎬',
    badgeAr: 'محرر الطبقات والأنيميشن',
    badgeEn: 'Timeline & Layer Editor',
    titleAr: 'محرر SVGA المتقدم وتصدير مشاريع After Effects',
    titleEn: 'Advanced SVGA Layer Editor & After Effects Exporter',
    summaryAr:
      'افتح أي ملف SVGA، افحص جميع الطبقات (Sprites) والفريمات على شريط الزمن (Timeline)، استبدل الصور، عدّل الحجم والموضع والشفافية، أو صدّر المشروع مباشرة إلى After Effects.',
    summaryEn:
      'Inspect every SVGA sprite and keyframe on an interactive timeline, replace layer assets, transform positions/opacity, or export to Adobe After Effects.',
    targetView: 'editor',
    accentColor: '#f59e0b',
    callouts: [
      {
        num: 1,
        titleAr: 'فحص وإدارة جميع طبقات الملف (Sprites & Layers)',
        titleEn: 'Full Sprite & Layer Tree Inspector',
        descAr:
          'استعرض كل عنصر داخل ملف SVGA، مع إمكانية إخفاء/إظهار أي طبقة، استبدال صورتها، أو حذفها نهائياً مع معاينة فورية في المسرح.',
        descEn:
          'Browse every internal sprite key, toggle visibility, replace individual PNG textures, or delete unwanted layers.',
        badgeAr: 'تحكم بالطبقات 🗂️',
        badgeEn: 'Layer Tree 🗂️',
        posTop: '45%',
        posLeft: '18%',
      },
      {
        num: 2,
        titleAr: 'شريط الزمن التفاعلي (Interactive Timeline)',
        titleEn: 'Frame-Accurate Interactive Timeline',
        descAr:
          'تنقل بين الفريمات بدقة فريم بفريم، وراقب حركة كل عنصر ومفاتيح التحريك (Keyframes) والشفافية والدوران.',
        descEn:
          'Scrub frame-by-frame across the animation timeline and inspect keyframe matrices, alpha values, and clipping masks.',
        badgeAr: 'فريم بفريم 🎞️',
        badgeEn: 'Frame Scrub 🎞️',
        posTop: '82%',
        posLeft: '52%',
      },
      {
        num: 3,
        titleAr: 'تصدير ملف SVGA معدل أو سكريبت After Effects',
        titleEn: 'Export Modified SVGA or After Effects Script',
        descAr:
          'احفظ تعديلاتك كملف SVGA جديد مضغوط وجاهز، أو صدّر حزمة After Effects لإعادة بناء الأنيميشن بالكامل داخل برنامج أفتر إفكتس.',
        descEn:
          'Export your edited animation as a clean SVGA file or generate an Adobe After Effects reconstruction bundle.',
        badgeAr: 'تصدير AE 🚀',
        badgeEn: 'AE Export 🚀',
        posTop: '15%',
        posLeft: '20%',
      },
    ],
    shortcuts: [
      {
        keysAr: '⌨️ زر Tab',
        keysEn: '⌨️ Tab Key',
        actionAr: 'تصدير وحفظ ملف SVGA المعدل مباشرة',
        actionEn: 'Export and save modified SVGA file',
        highlight: true,
      },
    ],
  },
];
