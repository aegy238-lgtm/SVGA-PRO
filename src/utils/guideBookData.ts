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
 * Strictly triggers ONLY for `Tab`, `ArrowLeft`, or standalone `ControlLeft` when not inside form controls or modals.
 * All other keys (letters, numbers, Space, Enter, Escape, Function keys, etc.) return `shouldExport: false`.
 */
export function isQuickExportKeyEvent(params: {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
  targetTagName?: string;
  targetType?: string;
  isContentEditable?: boolean;
  hasOpenModal?: boolean;
}): { shouldExport: boolean; triggerType: 'tab' | 'arrow_left' | 'ctrl_left' | null } {
  if (params.hasOpenModal || params.repeat) {
    return { shouldExport: false, triggerType: null };
  }

  const tag = (params.targetTagName || '').toUpperCase();
  if (params.isContentEditable) {
    return { shouldExport: false, triggerType: null };
  }

  const isTextInput =
    tag === 'TEXTAREA' ||
    (tag === 'INPUT' &&
      !['BUTTON', 'CHECKBOX', 'RADIO', 'RANGE', 'COLOR', 'FILE'].includes(
        (params.targetType || '').toUpperCase()
      ));

  const isInteractiveInput =
    isTextInput ||
    tag === 'SELECT' ||
    (tag === 'INPUT' && (params.targetType || '').toUpperCase() === 'RANGE');

  // Standalone Left Control ("تريك شمال / كنترول شمال")
  if (
    (params.code === 'ControlLeft' || (params.key === 'Control' && params.code !== 'ControlRight')) &&
    !params.altKey &&
    !params.metaKey &&
    !params.shiftKey
  ) {
    if (isInteractiveInput) {
      return { shouldExport: false, triggerType: null };
    }
    return { shouldExport: true, triggerType: 'ctrl_left' };
  }

  // For Tab and ArrowLeft, do not trigger if modifier keys are held
  if (params.ctrlKey || params.altKey || params.metaKey || params.shiftKey) {
    return { shouldExport: false, triggerType: null };
  }

  if (params.key === 'Tab') {
    if (isTextInput) {
      return { shouldExport: false, triggerType: null };
    }
    return { shouldExport: true, triggerType: 'tab' };
  }

  if (params.key === 'ArrowLeft') {
    if (isInteractiveInput) {
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
    badgeAr: 'معالجة وتحويل الهدايا',
    badgeEn: 'Core Converter & Export',
    titleAr: 'معالجة وتحويل الهدايا والتصدير الفوري (كليك شمال / Tab / Ctrl شمال)',
    titleEn: 'Motion Gift Processing & Instant Export (Left-Click / Tab / Left-Ctrl)',
    summaryAr:
      'استوديو متكامل لمعاينة وتحويل جميع صيغ الهدايا (SVGA, VAP, YYEVA, PAG, Lottie, MP4, WebM, GIF, WebP, PNG ZIP) مع استخراج الملفات المغلقة (ZIP) تلقائياً والتصدير الفوري بضغطة واحدة.',
    summaryEn:
      'Complete studio to preview and convert all gift formats with automatic ZIP extraction and instant 1-click export via Left-Click, Tab, Left-Ctrl, or Left Arrow.',
    targetView: 'home',
    accentColor: '#7c5cff',
    screenshotImage: '/assets/aistudio/dsdsds_c54ede2f.png',
    callouts: [
      {
        num: 1,
        titleAr: 'التصدير الفوري بكليك شمال أو Tab أو تريك شمال (Ctrl)',
        titleEn: 'Instant Export via Left-Click, Tab, or Left-Ctrl',
        descAr:
          'بمجرد رفع الملف واختيار الصيغة من القائمة، اضغط (كليك شمال) على شاشة المعاينة أو اضغط زر (Tab) أو (Ctrl شمال / تريك شمال) أو (سهم شمال) ليتم تصدير الملف فوراً بالصيغة المختارة!',
        descEn:
          'Once a file is loaded and your target format is selected, Left-Click on the preview stage or press Tab, Left-Ctrl, or Left Arrow to immediately export in that format!',
        badgeAr: 'اختصار فوري ⚡',
        badgeEn: 'Instant Shortcut ⚡',
        posTop: '48%',
        posLeft: '50%',
      },
      {
        num: 2,
        titleAr: 'فتح وسحب الملفات المغلقة (ZIP) واستخراج محتواها تلقائياً',
        titleEn: 'Auto-Extract Closed ZIP Archives on Upload',
        descAr:
          'عند سحب أو اختيار ملف مضغوط أو مغلق (ZIP) في زر فتح الملفات، يتعرف عليه النظام تلقائياً ويستخرج ملفات الهدايا الداخليه (SVGA, VAP, YYEVA, Lottie, MP4) ويعرضها فوراً.',
        descEn:
          'Drag or select any closed ZIP archive into the file loader to automatically extract and load internal project gift files without manual unzipping.',
        badgeAr: 'فك تلقائي 📦',
        badgeEn: 'Auto ZIP 📦',
        posTop: '18%',
        posLeft: '50%',
      },
      {
        num: 3,
        titleAr: 'اختيار صيغة التصدير والأبعاد ومعدل الإطارات (FPS)',
        titleEn: 'Format Selection, Dimensions & FPS Control',
        descAr:
          'من اللوحة اليمنى حدد الصيغة المطلوبة (SVGA, VAP, YYEVA, MP4, GIF, WebP, PNG ZIP)، وعدّل العرض والارتفاع، وقص المدة الزمنية بالثواني، واعكس الاتجاه (Mirror) أو قناة الشفافية (Alpha).',
        descEn:
          'From the right panel, select your target format, customize Width × Height, FPS, trim start/end seconds, and apply horizontal/vertical mirroring or alpha side.',
        badgeAr: 'تحكم كامل 🎛️',
        badgeEn: 'Full Control 🎛️',
        posTop: '62%',
        posLeft: '84%',
      },
      {
        num: 4,
        titleAr: 'تعديل الطبقات وتنعيم الحواف والعلامة المائية والعمليات الجماعية',
        titleEn: 'Layers, Edge Feather, Watermark & Batch Image Ops',
        descAr:
          'من اللوحة اليسرى استبدل أي صورة داخل الهدية، أضف أو اكتم الصوت، فعّل تنعيم الحواف الشفافة (Edge Feather)، أو أضف علامة مائية ونفّذ تعديلات جماعية (Batch) على كل الصور.',
        descEn:
          'From the left panel, replace sprite images, edit audio tracks, apply smooth Edge Feathering, or add custom watermarks and batch image operations.',
        badgeAr: 'أدوات احترافية 🎨',
        badgeEn: 'Pro Layers 🎨',
        posTop: '35%',
        posLeft: '16%',
      },
      {
        num: 5,
        titleAr: 'حفظ واستكمال المشروع وتغيير خلفية العرض والتكبير',
        titleEn: 'Save/Load Project, Stage Background & Zoom',
        descAr:
          'احفظ مشروعك بكل تعديلاته لاستكماله لاحقاً، واختبر شفافية الهدية على خلفية شفافة أو ألوان ثابتة مع التحكم بنسبة التكبير حتى 300%.',
        descEn:
          'Save your project state to resume later, and test alpha transparency on checkerboard or solid backgrounds with up to 300% zoom.',
        badgeAr: 'حفظ ومعاينة 🔍',
        badgeEn: 'Project & Zoom 🔍',
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
        keysAr: '⌨️ زر Tab / Ctrl شمال',
        keysEn: '⌨️ Tab / Left-Ctrl Key',
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
    badgeAr: 'استوديو الهدايا + فلترة المكرر وتقسيم الصفحات',
    badgeEn: 'Gift Studio, Blue Deduplication & 50-Frame Pages',
    titleAr: 'استوديو عرض ملفات الهدايا + زر فحص المكرر الأزرق 🔵 وتقسيم 50 إطار/صفحة 📄',
    titleEn: 'Gift Files Studio, Blue Duplicate Filter Toggle 🔵 & 50-Frame Pagination 📄',
    summaryAr:
      'يعرض ملفات الهدايا بسلاسة مع زر تفعيل/إيقاف (🔍 فحص المكرر باللون الأزرق 🔵) لفلترة المكرر أو تشغيل الرفع العادي، ونظام تقسيم تلقائي (50 إطار في كل صفحة) لحماية المعالج وكارت الشاشة مع خيار عرض كل الملفات.',
    summaryEn:
      'Plays gift files smoothly with a Blue Toggle Button (🔍 Scan Duplicates 🔵) to switch between Smart Deduplication and Normal Upload, plus automatic 50-Frame Pagination to protect CPU & GPU with a Show All option.',
    targetView: 'gifts',
    accentColor: '#10b981',
    screenshotImage: '/assets/aistudio/dfdf_7967db80.png',
    callouts: [
      {
        num: 1,
        titleAr: 'زر (🔍 فحص المكرر) التفاعلي باللون الأزرق 🔵 (مفعل / غير مفعل)',
        titleEn: 'Interactive Blue Toggle Button (🔍 Scan Duplicates 🔵 ON / OFF)',
        descAr:
          'اضغط على زر (🔍 فحص المكرر) ليتحول إلى اللون الأزرق المضيء 🔵 وتظهر علامة التفعيل (مثل زر العلامة المائية): عند تفعيله يفحص كل الملفات المرفوعة تلقائياً (بالشكل والاسم) ويُظهر رسالة حذف المكرر وتثبيت نسخة واحدة فقط، وعند إيقافه يعمل النظام العادي لرفع جميع الملفات بحرية!',
        descEn:
          'Click (🔍 Scan Duplicates) to turn it glowing Blue 🔵 with an active status dot (like the Watermark button): when ON, it automatically filters duplicates by shape & name and prompts to keep 1 copy; when OFF, normal upload loads all files freely.',
        badgeAr: 'زر تفعيل أزرق 🔵',
        badgeEn: 'Blue Toggle 🔵',
        posTop: '13%',
        posLeft: '62%',
      },
      {
        num: 2,
        titleAr: 'تقسيم الصفحات الذكي (50 إطار لكل صفحة 📄) لحماية المعالج وكارت الشاشة + عرض الكل',
        titleEn: 'Smart 50-Frame Pagination 📄 (CPU/GPU Protection) + Show All Files',
        descAr:
          'عند رفع عدد كبير من الملفات، يقسمها الاستوديو تلقائياً إلى صفحات متتالية بحيث تعرض كل صفحة (50 إطاراً فقط) لمنع أي ضغط أو تحميل زائد على المعالج (CPU) أو كارت الشاشة (GPU)، مع أزرار التنقل بين الصفحات أو زر (🌐 عرض كل الملفات) بضغطة واحدة.',
        descEn:
          'When uploading large batches of files, the studio automatically paginates them into 50 frames per page so only 50 players mount at a time—protecting CPU & GPU—with instant page switching or a 1-click Show All Files mode.',
        badgeAr: 'حماية المعالج 50 إطار 📄',
        badgeEn: '50 Frames/Page 📄',
        posTop: '34%',
        posLeft: '48%',
      },
      {
        num: 3,
        titleAr: 'فتح الملفات المغلقة (ZIP) والمجلدات واستخراج الهدايا تلقائياً',
        titleEn: 'Auto-Extract Closed ZIP Archives & Folders',
        descAr:
          'اسحب أي ملف مضغوط أو مغلق (ZIP) أو مجلد كامل إلى زر (رفع هدايا) ليقوم الاستوديو بفك ضغطه واستخراج كل ملفات SVGA, VAP, YYEVA, PAG, Lottie منه مع استبعاد الصور الثابتة تلقائياً.',
        descEn:
          'Drop any closed ZIP archive or folder onto Upload Gifts and the studio recursively extracts all gift files inside while automatically skipping static images.',
        badgeAr: 'استخراج ذكي 📦',
        badgeEn: 'Smart ZIP 📦',
        posTop: '13%',
        posLeft: '50%',
      },
      {
        num: 4,
        titleAr: 'تحديد مدة الفيديو المخصصة + العلامة المائية الشبكية الكاملة',
        titleEn: 'Custom Video Duration & Full-Grid Watermark',
        descAr:
          'فعّل زر (مدة الفيديو) لتحديد عدد الثواني المطلوبة لتكرار أو ضبط التأثير عند التصدير، وفعّل (العلامة المائية) لفرش علامة مائية شبكية مائلة تغطي مقاس كل هدية تلقائياً.',
        descEn:
          'Toggle Video Duration to fit exported video to exact target seconds, and enable Grid Watermark to overlay a responsive diagonal watermark grid across every gift size.',
        badgeAr: 'مدة + علامة مائية 💧',
        badgeEn: 'Duration & Watermark 💧',
        posTop: '13%',
        posLeft: '75%',
      },
      {
        num: 5,
        titleAr: 'أوضاع التصدير المتعددة + اختصار زر Tab و تريك شمال (Ctrl)',
        titleEn: 'Multi-Mode Batch Export + Tab / Left-Ctrl Shortcut',
        descAr:
          'اختر بين (هدية + فيديو + صورة) أو (هدية + صورة) أو (فيديو فقط) أو (دمج الكل في فيديو واحد جنب بعض) أو (استخراج الفولدرات + الصور)، واضغط زر التصدير أو Tab أو كليك شمال على المعاينة للتصدير الفوري.',
        descEn:
          'Choose Gift+Video+Image, Gift+Image, Video Only, All-in-One side-by-side video, or Folders+Snapshots, then click Export, press Tab / Left-Ctrl, or Left-Click on a gift preview.',
        badgeAr: 'تصدير شامل 🎬',
        badgeEn: 'Batch Export 🎬',
        posTop: '13%',
        posLeft: '88%',
      },
    ],
    shortcuts: [
      {
        keysAr: '🔵 زر فحص المكرر (مفعل / غير مفعل)',
        keysEn: '🔵 Scan Duplicates Toggle (ON / OFF)',
        actionAr: 'التبديل بين فلترة المكرر تلقائياً وتثبيت نسخة (1) أو النظام العادي لرفع كل الملفات',
        actionEn: 'Toggle between automatic deduplication (keep 1 copy) or normal upload mode',
        highlight: true,
      },
      {
        keysAr: '📄 50 إطار/صفحة ↔ 🌐 عرض كل الملفات',
        keysEn: '📄 50 Frames/Page ↔ 🌐 Show All Files',
        actionAr: 'تقسيم العرض إلى 50 إطار لكل صفحة لحماية المعالج وكارت الشاشة أو عرض الكل',
        actionEn: 'Paginate 50 frames per page to protect CPU/GPU or display all files at once',
        highlight: true,
      },
      {
        keysAr: '⌨️ زر Tab / Ctrl شمال / 🖱️ كليك شمال',
        keysEn: '⌨️ Tab / Left-Ctrl / 🖱️ Left-Click',
        actionAr: 'بدء التصدير الجماعي حسب الصيغة والوضع المختار',
        actionEn: 'Start batch export in the selected mode',
        highlight: true,
      },
    ],
  },
  {
    id: 'gift_image_creator',
    icon: '🖼️',
    badgeAr: 'صور الهدايا 3D والحواف',
    badgeEn: '3D Gift Image Creator',
    titleAr: 'إنشاء صور وأيقونات الهدايا بالأشكال والبروز 3D وتنعيم الحواف الشفافة',
    titleEn: '3D Gift Image Creator with Shapes, Relief & Soft Edge Feathering',
    summaryAr:
      'حول أي صورة أو مجموعة صور دفعة واحدة إلى أيقونة هدية احترافية (دائرة، درع ملكي، جوهرة، تاج، قلب، نجمة) مع بروز 3D وتنعيم الحواف الشفافة وإضافة الإطارات وتصدير PNG / WebP / ZIP.',
    summaryEn:
      'Transform single or batch images into professional gift icons with 3D relief, soft alpha edge feathering, VIP frame overlays, and instant PNG / WebP / ZIP export.',
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
        titleAr: 'تأثير البروز ثلاثي الأبعاد (3D Relief) وتنعيم الحواف (Edge Feather)',
        titleEn: '3D Relief Depth & Smooth Transparent Edge Feathering',
        descAr:
          'تحكم في قوة البروز ثلاثي الأبعاد والإضاءة المحيطية، وادمج أطراف الصورة بنعومة فائقة مع الخلفية الشفافة (0px إلى 60px) لمنع أي حواف حادة.',
        descEn:
          'Adjust 3D bevel relief and smoothly feather outer edges into alpha transparency (0–60px) to eliminate sharp borders.',
        badgeAr: 'بروز وحواف ناعمة 🌫️',
        badgeEn: '3D & Soft Edges 🌫️',
        posTop: '22%',
        posLeft: '50%',
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
          'اضغط زر التنزيل أو اضغط (Tab / Ctrl شمال / كليك شمال) لتصدير الصورة الحالية أو تنزيل جميع الصور المعدلة في ملف ZIP واحد منظم بأعلى دقة.',
        descEn:
          'Click Download or press Tab / Left-Ctrl / Left-Click to export your masked gift image or download the entire batch as a ZIP archive.',
        badgeAr: 'تصدير سريع 📦',
        badgeEn: 'Fast ZIP 📦',
        posTop: '80%',
        posLeft: '82%',
      },
    ],
    shortcuts: [
      {
        keysAr: '⌨️ زر Tab / Ctrl شمال / 🖱️ كليك شمال',
        keysEn: '⌨️ Tab / Left-Ctrl / 🖱️ Left-Click',
        actionAr: 'تنزيل الصورة أو تصدير جميع صور الهدايا ZIP فوراً',
        actionEn: 'Download image or batch ZIP immediately',
        highlight: true,
      },
    ],
  },
  {
    id: 'svga_ae_editor',
    icon: '🎬',
    badgeAr: 'محرر SVGA وتصدير AE',
    badgeEn: 'SVGA & AE 2026 Exporter',
    titleAr: 'محرر SVGA المتقدم وتصدير مشاريع After Effects 2026',
    titleEn: 'Advanced SVGA Layer Editor & After Effects 2026 Exporter',
    summaryAr:
      'افتح أي ملف SVGA (أو ملف ZIP مغلق بداخله SVGA)، افحص الطبقات والفريمات على شريط الزمن، استبدل الصور، أو صدّر المشروع كاملاً إلى After Effects 2026 (سكريبت JSX + مجلد الصور).',
    summaryEn:
      'Inspect every SVGA sprite and keyframe on an interactive timeline, replace layer assets, or export a full Adobe After Effects 2026 project bundle (JSX script + PNG folder).',
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
          'تنقل بين الفريمات بدقة فريم بفريم، وراقب حركة كل عنصر ومفاتيح التحريك (Keyframes) والشفافية والدوران والأقنعة (Masks).',
        descEn:
          'Scrub frame-by-frame across the animation timeline and inspect keyframe matrices, alpha values, and clipping masks.',
        badgeAr: 'فريم بفريم 🎞️',
        badgeEn: 'Frame Scrub 🎞️',
        posTop: '82%',
        posLeft: '58%',
      },
      {
        num: 3,
        titleAr: 'تصدير مشروع After Effects 2026 كامل أو ملف SVGA معدل',
        titleEn: 'Export Full After Effects 2026 Bundle or Modified SVGA',
        descAr:
          'صدّر حزمة After Effects 2026 التي تحتوي على سكريبت البناء التلقائي (.jsx) مع مجلد الصور الأصلية (PNGs) لإعادة بناء الأنيميشن بكل طبقاته وحركاته داخل أفتر إفكتس، أو احفظه كملف SVGA جديد.',
        descEn:
          'Export an Adobe After Effects 2026 reconstruction bundle (.jsx script + PNG assets folder) or save your edited animation as a clean SVGA file.',
        badgeAr: 'تصدير AE 2026 🚀',
        badgeEn: 'AE 2026 Export 🚀',
        posTop: '18%',
        posLeft: '58%',
      },
    ],
    shortcuts: [
      {
        keysAr: '⌨️ زر Tab / Ctrl شمال',
        keysEn: '⌨️ Tab / Left-Ctrl Key',
        actionAr: 'تصدير وحفظ ملف SVGA المعدل مباشرة',
        actionEn: 'Export and save modified SVGA file',
        highlight: true,
      },
    ],
  },
  {
    id: 'pro_and_system',
    icon: '👑',
    badgeAr: 'عضوية PRO والمحاولات المجانية',
    badgeEn: 'PRO & Free Attempts System',
    titleAr: 'نظام عضوية PRO، المحاولات المجانية المخصصة، والقائمة الموحدة',
    titleEn: 'PRO Membership, Custom Free Attempts & Unified Navigation',
    summaryAr:
      'تحكم كامل من لوحة الإدارة في صلاحيات أدوات وصيغ PRO، مع إمكانية منح محاولات مجانية مخصصة لكل أداة أو صيغة للمستخدمين غير المشتركين، وترجمة فورية لكامل المنصة.',
    summaryEn:
      'Full admin control over PRO tools and formats, customizable free trial attempts with live badges for non-PRO users, and instant bilingual translation across all tools.',
    targetView: 'home',
    accentColor: '#a855f7',
    callouts: [
      {
        num: 1,
        titleAr: 'تخصيص المحاولات المجانية لكل أداة أو صيغة تصدير (Free Attempts)',
        titleEn: 'Per-Feature & Per-Format Free Trial Attempts',
        descAr:
          'يمكن للمدير من لوحة التحكم تفعيل (محاولات مجانية) لأي صيغة تصدير أو أداة PRO (مثل استوديو الهدايا أو إنشاء صورة الهدية) وتحديد عدد المحاولات؛ وتظهر شارة بعدد المحاولات المتبقية للمستخدم غير المشترك بينما يستخدم مشترك PRO كل الأدوات بلا حدود.',
        descEn:
          'Admins can enable custom free attempts on any PRO export format or tool. Non-PRO users see a badge with their remaining free tries, while PRO members enjoy unlimited access.',
        badgeAr: 'محاولات مجانية 🎁',
        badgeEn: 'Free Trials 🎁',
        posTop: '28%',
        posLeft: '24%',
      },
      {
        num: 2,
        titleAr: 'القائمة المنسدلة الموحدة في الشريط العلوي (أدوات المنصة)',
        titleEn: 'Unified Top Dropdown Menu (Platform Tools)',
        descAr:
          'تم جمع أزرار الحساب والاشتراك ولوحة التحكم واللغة والتنبيهات وواتساب في زر واحد أنيق بأعلى اليمين لفتحها مرتبة تحت بعضها والحفاظ على نظافة الواجهة.',
        descEn:
          'Account, Subscribe, Admin Dashboard, Language, Notifications, and WhatsApp are consolidated into a single sleek dropdown menu in the top bar.',
        badgeAr: 'واجهة منظمة ✨',
        badgeEn: 'Clean Header ✨',
        posTop: '28%',
        posLeft: '76%',
      },
      {
        num: 3,
        titleAr: 'الترجمة الفورية الشاملة لجميع صفحات وأدوات المنصة (عربي / English)',
        titleEn: 'Instant Synced Translation Across All Pages & Studios',
        descAr:
          'عند تغيير اللغة بين العربية والإنجليزية، تتم ترجمة الواجهة الرئيسية واستوديو ملفات الهدايا ومحرر SVGA وأداة صور الهدايا والرسائل التنبيهية فوراً وبنفس اللحظة.',
        descEn:
          'Switching between Arabic and English immediately translates the main studio, Gift Files Studio, SVGA Editor, Gift Image Creator, and all alert banners.',
        badgeAr: 'ثنائي اللغة 🌐',
        badgeEn: 'Bilingual Sync 🌐',
        posTop: '74%',
        posLeft: '50%',
      },
    ],
    shortcuts: [
      {
        keysAr: '📖 زر الكتاب العائم (يسار الأسفل)',
        keysEn: '📖 Floating Book Button (Bottom-Left)',
        actionAr: 'يظهر في الواجهة الرئيسية فقط ويختفي تلقائياً عند دخول أي أداة',
        actionEn: 'Visible only on Home screen; auto-hides inside tools',
        highlight: true,
      },
    ],
  },
];
