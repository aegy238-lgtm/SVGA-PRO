import React, { useState } from 'react';
import {
  GUIDE_BOOK_CHAPTERS,
  GuideBookChapter,
  shouldShowGuideBookButton,
} from '../utils/guideBookData';

interface PlatformGuideBookProps {
  activeView: string;
  isAr: boolean;
  onNavigateToView: (viewId: string) => void;
}

export default function PlatformGuideBook({
  activeView,
  isAr,
  onNavigateToView,
}: PlatformGuideBookProps) {
  const [open, setOpen] = useState(false);
  const [activeChapterId, setActiveChapterId] = useState<string>(GUIDE_BOOK_CHAPTERS[0].id);
  const [highlightedCallout, setHighlightedCallout] = useState<number>(1);

  // Strictly only show on the main home view; hide immediately when entering any feature
  const isVisibleOnScreen = shouldShowGuideBookButton(activeView);

  if (!isVisibleOnScreen) {
    return null;
  }

  const activeChapter: GuideBookChapter =
    GUIDE_BOOK_CHAPTERS.find((c) => c.id === activeChapterId) || GUIDE_BOOK_CHAPTERS[0];

  const currentIndex = GUIDE_BOOK_CHAPTERS.findIndex((c) => c.id === activeChapter.id);

  const renderCalloutPins = (chapter: GuideBookChapter) => {
    return chapter.callouts.map((c) => {
      const isHi = highlightedCallout === c.num;
      return (
        <button
          key={c.num}
          type="button"
          onClick={() => setHighlightedCallout(c.num)}
          onMouseEnter={() => setHighlightedCallout(c.num)}
          style={{
            position: 'absolute',
            top: c.posTop,
            left: c.posLeft,
            transform: 'translate(-50%, -50%)',
            width: isHi ? '28px' : '24px',
            height: isHi ? '28px' : '24px',
            borderRadius: '50%',
            background: isHi ? '#7c5cff' : '#14141c',
            border: isHi ? '2px solid #ece3ff' : '1.5px solid #7c5cff',
            color: isHi ? '#ffffff' : '#b79cff',
            fontWeight: 800,
            fontSize: '11.5px',
            cursor: 'pointer',
            display: 'grid',
            placeItems: 'center',
            boxShadow: isHi
              ? '0 0 0 4px rgba(124, 92, 255, 0.25), 0 4px 12px rgba(0,0,0,0.65)'
              : '0 3px 10px rgba(0,0,0,0.55)',
            zIndex: 15,
            transition: 'all 0.16s ease',
            padding: 0,
          }}
          title={isAr ? c.titleAr : c.titleEn}
        >
          {c.num}
        </button>
      );
    });
  };

  const renderVisualScreenMockup = (chapter: GuideBookChapter) => {
    const frameStyle: React.CSSProperties = {
      position: 'relative',
      width: '100%',
      height: '236px',
      minHeight: '236px',
      flexShrink: 0,
      borderRadius: '12px',
      background: '#07070a',
      border: '1px solid #1e1e28',
      overflow: 'hidden',
      display: 'grid',
      gap: '8px',
      padding: '10px',
    };

    if (chapter.id === 'motion_converter') {
      return (
        <div
          style={{
            ...frameStyle,
            gridTemplateColumns: '1fr 1.6fr 1.1fr',
          }}
        >
          {/* Left Panel: Assets & Effects */}
          <div
            style={{
              background: '#0d0d12',
              borderRadius: '8px',
              border: highlightedCallout === 4 ? '1px solid #7c5cff' : '1px solid #1e1e28',
              padding: '8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#b79cff' }}>
              {isAr ? 'الطبقات والصوت والدفعات' : 'Layers, Audio & Batch'}
            </div>
            <div
              style={{
                padding: '4px 6px',
                borderRadius: '6px',
                background: '#14141c',
                border: '1px solid #1e1e28',
                fontSize: '9px',
                color: '#e8e8ee',
              }}
            >
              {isAr ? 'تنعيم الحواف + علامة مائية + Batch' : 'Edge Feather + Watermark + Batch'}
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '4px',
                flex: 1,
              }}
            >
              {['img_01', 'img_02', 'img_03', 'img_04'].map((sp) => (
                <div
                  key={sp}
                  style={{
                    background: '#14141c',
                    borderRadius: '6px',
                    border: '1px solid #1e1e28',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: '8.5px',
                    color: '#80808f',
                  }}
                >
                  {sp}
                </div>
              ))}
            </div>
          </div>

          {/* Center Stage: Live Preview */}
          <div
            style={{
              background: 'repeating-conic-gradient(#12121a 0 25%, #0a0a0f 0 50%) 0 0 / 14px 14px',
              borderRadius: '8px',
              border:
                highlightedCallout === 1 || highlightedCallout === 2 || highlightedCallout === 5
                  ? '1px solid #7c5cff'
                  : '1px solid #1e1e28',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px',
            }}
          >
            <span
              style={{
                fontSize: '8.5px',
                padding: '2px 8px',
                borderRadius: '99px',
                background: '#14141c',
                border: '1px solid #1e1e28',
                color: '#b79cff',
                fontWeight: 600,
              }}
            >
              {isAr
                ? '📦 يدعم فتح ZIP مغلق + كليك شمال / Tab / Ctrl شمال للتصدير'
                : '📦 Auto ZIP Extract + Left-Click / Tab / Left-Ctrl Export'}
            </span>

            <div
              style={{
                width: '66px',
                height: '66px',
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(124, 92, 255, 0.28), transparent 70%)',
                border: '1px solid rgba(124, 92, 255, 0.4)',
                display: 'grid',
                placeItems: 'center',
                fontSize: '26px',
              }}
            >
              👑
            </div>

            <div
              style={{
                width: '100%',
                padding: '4px 8px',
                borderRadius: '6px',
                background: '#0d0d12',
                border: '1px solid #1e1e28',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '8.5px',
                color: '#80808f',
              }}
            >
              <span>▶</span>
              <div
                style={{
                  flex: 1,
                  height: '3px',
                  background: '#1e1e28',
                  borderRadius: '99px',
                  overflow: 'hidden',
                }}
              >
                <div style={{ width: '60%', height: '100%', background: '#7c5cff' }} />
              </div>
              <span>60 FPS · Zoom 100%</span>
            </div>
          </div>

          {/* Right Panel: Format & Export */}
          <div
            style={{
              background: '#0d0d12',
              borderRadius: '8px',
              border: highlightedCallout === 3 ? '1px solid #7c5cff' : '1px solid #1e1e28',
              padding: '8px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#e8e8ee' }}>
                {isAr ? 'إعدادات التحويل' : 'Export Settings'}
              </div>
              <div
                style={{
                  padding: '4px 6px',
                  borderRadius: '5px',
                  background: '#14141c',
                  border: '1px solid #1e1e28',
                  fontSize: '8.5px',
                  color: '#80808f',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span>{isAr ? 'الأبعاد' : 'Size'}</span>
                <span style={{ color: '#e8e8ee' }}>750 × 750</span>
              </div>
              <div
                style={{
                  padding: '4px 6px',
                  borderRadius: '5px',
                  background: '#14141c',
                  border: '1px solid #7c5cff',
                  fontSize: '8.5px',
                  color: '#b79cff',
                  fontWeight: 700,
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span>{isAr ? 'الصيغة' : 'Format'}</span>
                <span>SVGA / VAP ▾</span>
              </div>
            </div>

            <div
              style={{
                padding: '6px',
                borderRadius: '6px',
                background: '#7c5cff',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '8.5px',
                textAlign: 'center',
              }}
            >
              {isAr ? 'بدء التحويل ⚡ [Tab / Ctrl شمال]' : 'Convert ⚡ [Tab / Left-Ctrl]'}
            </div>
          </div>

          {renderCalloutPins(chapter)}
        </div>
      );
    }

    if (chapter.id === 'gifts_studio') {
      return (
        <div
          style={{
            ...frameStyle,
            gridTemplateRows: 'auto auto 1fr',
          }}
        >
          {/* Top Bar */}
          <div
            style={{
              background: '#0d0d12',
              borderRadius: '8px',
              border: '1px solid #1e1e28',
              padding: '5px 9px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '5px',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
              <span
                style={{
                  padding: '3px 7px',
                  borderRadius: '6px',
                  background: '#7c5cff',
                  color: '#fff',
                  fontSize: '8px',
                  fontWeight: 700,
                }}
              >
                {isAr ? '⬇ تصدير هدية + صورة [Tab]' : '⬇ Export Gift + Image [Tab]'}
              </span>
              <span
                style={{
                  padding: '3px 6px',
                  borderRadius: '6px',
                  background: '#14141c',
                  border: '1px solid #1e1e28',
                  color: '#b79cff',
                  fontSize: '8px',
                }}
              >
                {isAr ? '⏱️ مدة الفيديو' : '⏱️ Duration'}
              </span>
              <span
                style={{
                  padding: '3px 6px',
                  borderRadius: '6px',
                  background: '#14141c',
                  border: '1px solid #1e1e28',
                  color: '#80808f',
                  fontSize: '8px',
                }}
              >
                {isAr ? '💧 العلامة المائية' : '💧 Grid Watermark'}
              </span>
              <span
                style={{
                  padding: '3px 7px',
                  borderRadius: '6px',
                  background: 'linear-gradient(135deg, #1d4ed8, #2563eb, #0284c7)',
                  border: '1px solid #38bdf8',
                  boxShadow: '0 0 10px rgba(56, 189, 248, 0.45)',
                  color: '#fff',
                  fontSize: '8px',
                  fontWeight: 800,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <span>🔍 {isAr ? 'فحص المكرر: مفعل' : 'Scan Duplicates: ON'}</span>
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: '#38bdf8',
                    boxShadow: '0 0 6px #38bdf8',
                  }}
                />
              </span>
              <span
                style={{
                  padding: '3px 6px',
                  borderRadius: '6px',
                  background: 'rgba(124, 92, 255, 0.14)',
                  border: '1px solid rgba(124, 92, 255, 0.4)',
                  color: '#d8b4fe',
                  fontSize: '8px',
                  fontWeight: 700,
                }}
              >
                {isAr ? '📦 رفع هدايا / ZIP' : '📦 Upload / ZIP'}
              </span>
            </div>
            <span style={{ fontSize: '9px', fontWeight: 700, color: '#e8e8ee' }}>
              🎁 {isAr ? 'استوديو الهدايا' : 'Gift Files Studio'}
            </span>
          </div>

          {/* 50-Frame Pagination & Duplicate Filter Status Banner Mockup */}
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(16, 22, 42, 0.96), rgba(20, 30, 62, 0.96))',
              border:
                highlightedCallout === 1 || highlightedCallout === 2
                  ? '1.5px solid #38bdf8'
                  : '1px solid rgba(59, 130, 246, 0.4)',
              borderRadius: '8px',
              padding: '5px 9px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '6px',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span
                style={{
                  padding: '2px 7px',
                  borderRadius: '999px',
                  background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                  color: '#fff',
                  fontSize: '7.5px',
                  fontWeight: 800,
                }}
              >
                {isAr ? '📄 الصفحة 1 من 3 (50 إطار/صفحة)' : '📄 Page 1 of 3 (50 frames/page)'}
              </span>
              <span style={{ fontSize: '7.5px', color: '#93c5fd', fontWeight: 700 }}>
                {isAr
                  ? '⚡ حماية المعالج وكارت الشاشة — أو اضغط (🌐 عرض كل الملفات)'
                  : '⚡ CPU/GPU Protection — or click (🌐 Show All Files)'}
              </span>
            </div>
            <span
              style={{
                padding: '2px 7px',
                borderRadius: '6px',
                background: 'linear-gradient(135deg, #10b981, #059669)',
                color: '#fff',
                fontSize: '7.5px',
                fontWeight: 800,
                whiteSpace: 'nowrap',
              }}
            >
              {isAr
                ? '✅ حذف المكرر وتثبيت نسخة (1)'
                : '✅ Delete Duplicates & Keep (1)'}
            </span>
          </div>

          {/* Cards Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '8px',
            }}
          >
            {[
              { name: 'royal_lion.svga', tag: 'SVGA', icon: '🦁' },
              { name: 'dragon_vip.mp4', tag: 'VAP', icon: '🐉' },
              { name: 'castle_king.svga', tag: 'SVGA', icon: '🏰' },
            ].map((item, idx) => (
              <div
                key={idx}
                style={{
                  background: '#0d0d12',
                  borderRadius: '8px',
                  border:
                    idx === 0 || highlightedCallout === 5
                      ? '1px solid #7c5cff'
                      : '1px solid #1e1e28',
                  padding: '6px 8px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '7.5px' }}>
                  <span
                    style={{
                      padding: '1px 5px',
                      borderRadius: '4px',
                      background: 'rgba(16, 185, 129, 0.16)',
                      border: '1px solid rgba(16, 185, 129, 0.4)',
                      color: '#6ee7b7',
                      fontWeight: 700,
                    }}
                  >
                    {isAr ? '✓ نسخة أساسية (1)' : '✓ Primary (1)'}
                  </span>
                  <span
                    style={{
                      padding: '1px 5px',
                      borderRadius: '4px',
                      background: '#14141c',
                      color: '#80808f',
                    }}
                  >
                    {item.tag}
                  </span>
                </div>
                <div style={{ textAlign: 'center', fontSize: '22px', margin: '2px 0' }}>
                  {item.icon}
                </div>
                <div
                  style={{
                    fontSize: '8px',
                    color: '#e8e8ee',
                    textAlign: 'center',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {item.name}
                </div>
              </div>
            ))}
          </div>

          {renderCalloutPins(chapter)}
        </div>
      );
    }

    if (chapter.id === 'gift_image_creator') {
      return (
        <div
          style={{
            ...frameStyle,
            gridTemplateColumns: '1fr 1.4fr 1.1fr',
          }}
        >
          {/* Left Batch List */}
          <div
            style={{
              background: '#0d0d12',
              borderRadius: '8px',
              border: '1px solid #1e1e28',
              padding: '8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ fontSize: '9.5px', fontWeight: 700, color: '#b79cff' }}>
              {isAr ? 'دفعة الصور (Batch)' : 'Batch Queue'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', flex: 1 }}>
              {['🦁', '👑', '🏎️', '💎'].map((ic, i) => (
                <div
                  key={i}
                  style={{
                    background: '#14141c',
                    borderRadius: '6px',
                    border: i === 0 ? '1px solid #7c5cff' : '1px solid #1e1e28',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: '18px',
                  }}
                >
                  {ic}
                </div>
              ))}
            </div>
          </div>

          {/* Center 3D Canvas */}
          <div
            style={{
              background: 'repeating-conic-gradient(#12121a 0 25%, #0a0a0f 0 50%) 0 0 / 14px 14px',
              borderRadius: '8px',
              border: '1px solid #7c5cff',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px',
            }}
          >
            <div
              style={{
                width: '74px',
                height: '74px',
                borderRadius: '14px',
                background: 'radial-gradient(circle, rgba(124, 92, 255, 0.25), transparent 72%)',
                border: '1px solid rgba(124, 92, 255, 0.45)',
                display: 'grid',
                placeItems: 'center',
                fontSize: '34px',
              }}
            >
              🦁
            </div>
            <span style={{ fontSize: '8.5px', color: '#b79cff', fontWeight: 600 }}>
              {isAr ? 'معاينة البروز 3D وتنعيم الحواف + الإطار' : '3D Relief, Edge Feather & Frame'}
            </span>
          </div>

          {/* Right Controls */}
          <div
            style={{
              background: '#0d0d12',
              borderRadius: '8px',
              border: '1px solid #1e1e28',
              padding: '8px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <div style={{ fontSize: '9.5px', fontWeight: 700, color: '#e8e8ee' }}>
                {isAr ? 'إعدادات الصورة' : 'Image Controls'}
              </div>
              <div
                style={{
                  padding: '4px 6px',
                  borderRadius: '5px',
                  background: '#14141c',
                  border: '1px solid #1e1e28',
                  fontSize: '8.5px',
                  color: '#80808f',
                }}
              >
                {isAr ? 'قوة البروز 3D: 85%' : '3D Depth: 85%'}
              </div>
              <div
                style={{
                  padding: '4px 6px',
                  borderRadius: '5px',
                  background: '#14141c',
                  border: '1px solid #1e1e28',
                  fontSize: '8.5px',
                  color: '#80808f',
                }}
              >
                {isAr ? 'تنعيم الحواف: 24px' : 'Edge Feather: 24px'}
              </div>
            </div>

            <div
              style={{
                padding: '6px',
                borderRadius: '6px',
                background: '#7c5cff',
                color: '#fff',
                fontWeight: 700,
                fontSize: '8.5px',
                textAlign: 'center',
              }}
            >
              {isAr ? 'تنزيل الصور ZIP ⚡ [Tab]' : 'Download ZIP ⚡ [Tab]'}
            </div>
          </div>

          {renderCalloutPins(chapter)}
        </div>
      );
    }

    if (chapter.id === 'svga_ae_editor') {
      return (
        <div
          style={{
            ...frameStyle,
            gridTemplateColumns: '1fr 1.6fr',
          }}
        >
          <div
            style={{
              background: '#0d0d12',
              borderRadius: '8px',
              border: '1px solid #1e1e28',
              padding: '8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '5px',
            }}
          >
            <div style={{ fontSize: '9.5px', fontWeight: 700, color: '#b79cff' }}>
              {isAr ? 'شجرة الطبقات (Sprites)' : 'Sprites Tree'}
            </div>
            {['crown_main', 'wings_left', 'wings_right', 'glow_fx'].map((l, i) => (
              <div
                key={l}
                style={{
                  padding: '4px 6px',
                  borderRadius: '5px',
                  background: '#14141c',
                  border: i === 0 ? '1px solid #7c5cff' : '1px solid #1e1e28',
                  fontSize: '8.5px',
                  color: '#e8e8ee',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span>{l}</span>
                <span style={{ color: '#b79cff' }}>PNG</span>
              </div>
            ))}
          </div>

          <div
            style={{
              background: '#0d0d12',
              borderRadius: '8px',
              border: '1px solid #1e1e28',
              padding: '8px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '6px',
              }}
            >
              <span style={{ fontSize: '8.5px', color: '#80808f' }}>
                {isAr ? 'معاينة المسرح والطبقات' : 'Stage & Keyframes'}
              </span>
              <span
                style={{
                  padding: '2px 7px',
                  borderRadius: '5px',
                  background: 'rgba(124, 92, 255, 0.18)',
                  border: '1px solid #7c5cff',
                  color: '#e8e8ee',
                  fontSize: '8px',
                  fontWeight: 700,
                }}
              >
                {isAr ? '🚀 تصدير After Effects 2026 + SVGA' : '🚀 Export AE 2026 + SVGA'}
              </span>
            </div>
            <div
              style={{
                flex: 1,
                display: 'grid',
                placeItems: 'center',
                background: 'repeating-conic-gradient(#12121a 0 25%, #0a0a0f 0 50%) 0 0 / 14px 14px',
                borderRadius: '6px',
                fontSize: '30px',
              }}
            >
              🏆
            </div>
            <div
              style={{
                marginTop: '6px',
                background: '#14141c',
                padding: '5px 8px',
                borderRadius: '5px',
                border: '1px solid #1e1e28',
                fontSize: '8.5px',
                color: '#b79cff',
              }}
            >
              Timeline: Frame 45 / 120 ━━━●━━━━━━━━
            </div>
          </div>

          {renderCalloutPins(chapter)}
        </div>
      );
    }

    // Chapter 5: PRO Membership, Custom Free Trial Attempts & Unified Navigation
    return (
      <div
        style={{
          ...frameStyle,
          gridTemplateColumns: '1.15fr 1fr',
        }}
      >
        <div
          style={{
            background: '#0d0d12',
            borderRadius: '8px',
            border: highlightedCallout === 1 ? '1px solid #7c5cff' : '1px solid #1e1e28',
            padding: '10px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#b79cff' }}>
            {isAr
              ? '👑 أدوات وصيغ PRO + المحاولات المجانية'
              : '👑 PRO Tools & Free Trial Attempts'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {[
              {
                nameAr: '🎁 عرض ملفات الهدايا',
                nameEn: '🎁 Gift Files Studio',
                badgeAr: '🎁 3 محاولات مجانية',
                badgeEn: '🎁 3 Free Tries',
              },
              {
                nameAr: '🖼️ إنشاء صورة الهدية',
                nameEn: '🖼️ Gift Image Creator',
                badgeAr: '🎁 3 محاولات مجانية',
                badgeEn: '🎁 3 Free Tries',
              },
              {
                nameAr: '⚡ تصدير صيغة VAP / SVGA 2.0',
                nameEn: '⚡ VAP / SVGA 2.0 Export',
                badgeAr: '👑 PRO مفتوح للمشتركين',
                badgeEn: '👑 PRO Unlimited',
              },
            ].map((row, idx) => (
              <div
                key={idx}
                style={{
                  padding: '5px 8px',
                  borderRadius: '6px',
                  background: '#14141c',
                  border: '1px solid #1e1e28',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '8.5px',
                }}
              >
                <span style={{ color: '#e8e8ee', fontWeight: 600 }}>
                  {isAr ? row.nameAr : row.nameEn}
                </span>
                <span
                  style={{
                    padding: '2px 6px',
                    borderRadius: '99px',
                    background: 'rgba(124, 92, 255, 0.16)',
                    border: '1px solid rgba(124, 92, 255, 0.4)',
                    color: '#d8b4fe',
                    fontWeight: 700,
                    fontSize: '7.5px',
                  }}
                >
                  {isAr ? row.badgeAr : row.badgeEn}
                </span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: '8px', color: '#80808f' }}>
            {isAr
              ? 'يحدد المدير عدد المحاولات المجانية لكل أداة أو صيغة من لوحة التحكم'
              : 'Admin configures free trial count per tool/format in Dashboard'}
          </div>
        </div>

        <div
          style={{
            background: '#0d0d12',
            borderRadius: '8px',
            border:
              highlightedCallout === 2 || highlightedCallout === 3
                ? '1px solid #7c5cff'
                : '1px solid #1e1e28',
            padding: '10px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#e8e8ee' }}>
            {isAr ? '⚡ القائمة الموحدة + الترجمة الفورية' : '⚡ Unified Menu & Instant Translation'}
          </div>
          <div
            style={{
              background: '#14141c',
              borderRadius: '7px',
              border: '1px solid #1e1e28',
              padding: '6px 8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              fontSize: '8px',
              color: '#cbd5e1',
            }}
          >
            <div>👤 {isAr ? 'الحساب والاشتراك (PRO)' : 'Account & PRO Status'}</div>
            <div>⚙️ {isAr ? 'لوحة التحكم الإدارية' : 'Admin Dashboard'}</div>
            <div>🌐 {isAr ? 'اللغة: العربية ⇄ English (ترجمة فورية)' : 'Language: AR ⇄ EN Sync'}</div>
            <div>💬 {isAr ? 'التنبيهات والتواصل عبر واتساب' : 'Notifications & WhatsApp'}</div>
          </div>
          <div
            style={{
              padding: '4px 8px',
              borderRadius: '6px',
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.35)',
              color: '#6ee7b7',
              fontSize: '8px',
              textAlign: 'center',
              fontWeight: 700,
            }}
          >
            {isAr
              ? '📖 زر الدليل يظهر في الرئيسية فقط ويختفي داخل الأدوات'
              : '📖 Guide Button shows on Home only & auto-hides inside tools'}
          </div>
        </div>

        {renderCalloutPins(chapter)}
      </div>
    );
  };

  return (
    <>
      {/* Bottom-Left Single Circular Guidebook Button — Strictly visible ONLY on the Home screen */}
      <div
        id="homeGuideBookDock"
        dir={isAr ? 'rtl' : 'ltr'}
        style={{
          position: 'fixed',
          bottom: '22px',
          left: '22px',
          zIndex: 90,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <button
          type="button"
          id="openGuideBookBtn"
          onClick={() => setOpen(true)}
          aria-label={
            isAr
              ? 'دليل شرح مميزات الموقع والاختصارات بالصور'
              : 'Illustrated Platform Features Guidebook'
          }
          title={
            isAr
              ? 'دليل مميزات المنصة واختصارات التصدير'
              : 'Platform Features & Shortcuts Guide'
          }
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            border: '1px solid #2b2b3d',
            background: 'radial-gradient(circle at 30% 25%, #231d3d 0%, #0d0d12 75%)',
            color: '#e8e8ee',
            cursor: 'pointer',
            display: 'grid',
            placeItems: 'center',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(124, 92, 255, 0.2)',
            transition: 'all 0.18s ease',
            padding: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#7c5cff';
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow =
              '0 10px 28px rgba(0, 0, 0, 0.75), 0 0 18px rgba(124, 92, 255, 0.35)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#2b2b3d';
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.boxShadow =
              '0 8px 24px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(124, 92, 255, 0.2)';
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#b79cff"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
        </button>
      </div>

      {/* Minimal, Cohesive Dark-Glass Guidebook Modal */}
      {open && (
        <div
          id="platformGuideBookModal"
          role="dialog"
          aria-modal="true"
          aria-label={isAr ? 'دليل مميزات المنصة' : 'Platform Features Guide'}
          dir={isAr ? 'rtl' : 'ltr'}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9995,
            background: 'rgba(7, 7, 10, 0.82)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            style={{
              width: 'min(880px, 96vw)',
              maxHeight: '92vh',
              overflowY: 'auto',
              background: '#0d0d12',
              border: '1px solid #1e1e28',
              borderRadius: '16px',
              padding: '20px',
              boxShadow: '0 24px 64px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(124, 92, 255, 0.12)',
              color: '#e8e8ee',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            {/* Simple Clean Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                paddingBottom: '12px',
                borderBottom: '1px solid #1e1e28',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '9px',
                    background: 'rgba(124, 92, 255, 0.14)',
                    border: '1px solid rgba(124, 92, 255, 0.35)',
                    display: 'grid',
                    placeItems: 'center',
                    color: '#b79cff',
                    flexShrink: 0,
                  }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                  </svg>
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#e8e8ee' }}>
                    {isAr
                      ? 'دليل وكتالوج مميزات المنصة المصوّر + اختصارات التصدير الفوري'
                      : 'Illustrated Platform Features Guide & Instant Export Shortcuts'}
                  </h2>
                  <p style={{ margin: '2px 0 0', fontSize: '11.5px', color: '#80808f' }}>
                    {isAr
                      ? 'اضغط على أي ميزة بالأسفل لمشاهدة سكرين توضيحي مرقّم وشرح تفصيلي لكل وظيفة مضافة واختصارات الكيبورد والماوس'
                      : 'Select any feature tab below for a numbered visual screen and detailed explanation of every tool and shortcut'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                id="closeGuideBookModalBtn"
                onClick={() => setOpen(false)}
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '8px',
                  border: '1px solid #1e1e28',
                  background: '#14141c',
                  color: '#80808f',
                  fontSize: '16px',
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                ✕
              </button>
            </div>

            {/* Clean Segmented Tabs Bar */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))',
                gap: '6px',
                background: '#07070a',
                padding: '5px',
                borderRadius: '10px',
                border: '1px solid #1e1e28',
              }}
            >
              {GUIDE_BOOK_CHAPTERS.map((chap, idx) => {
                const isSelected = chap.id === activeChapter.id;
                return (
                  <button
                    key={chap.id}
                    type="button"
                    id={`guideChapterTab_${chap.id}`}
                    onClick={() => {
                      setActiveChapterId(chap.id);
                      setHighlightedCallout(1);
                    }}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '7px',
                      border: isSelected ? '1px solid #7c5cff' : '1px solid transparent',
                      background: isSelected ? 'rgba(124, 92, 255, 0.16)' : 'transparent',
                      color: isSelected ? '#e8e8ee' : '#80808f',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      fontSize: '11px',
                      fontWeight: isSelected ? 700 : 500,
                      transition: 'all 0.15s ease',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    <span>{chap.icon}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {isAr ? chap.badgeAr : `${idx + 1}. ${chap.badgeEn}`}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Active Tool Summary Bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                background: '#14141c',
                border: '1px solid #1e1e28',
                borderRadius: '10px',
                padding: '10px 14px',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ flex: 1, minWidth: '220px' }}>
                <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#e8e8ee' }}>
                  {activeChapter.icon} {isAr ? activeChapter.titleAr : activeChapter.titleEn}
                </div>
                <div style={{ fontSize: '11.5px', color: '#80808f', marginTop: '2px' }}>
                  {isAr ? activeChapter.summaryAr : activeChapter.summaryEn}
                </div>
              </div>

              {activeChapter.targetView !== 'home' && (
                <button
                  type="button"
                  id={`guideTryFeatureBtn_${activeChapter.id}`}
                  onClick={() => {
                    setOpen(false);
                    onNavigateToView(activeChapter.targetView);
                  }}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '8px',
                    border: '1px solid #7c5cff',
                    background: '#7c5cff',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '11.5px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isAr ? 'فتح الأداة الآن ←' : 'Open Tool →'}
                </button>
              )}
            </div>

            {/* Annotated Screen Mockup */}
            {renderVisualScreenMockup(activeChapter)}

            {/* Grid of Numbered Callouts */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '8px',
              }}
            >
              {activeChapter.callouts.map((c) => {
                const isHi = highlightedCallout === c.num;
                const badgeText = isAr ? c.badgeAr : c.badgeEn;
                return (
                  <div
                    key={c.num}
                    onMouseEnter={() => setHighlightedCallout(c.num)}
                    onClick={() => setHighlightedCallout(c.num)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: isHi ? 'rgba(124, 92, 255, 0.1)' : '#14141c',
                      border: isHi ? '1px solid #7c5cff' : '1px solid #1e1e28',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '6px',
                        marginBottom: '4px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            background: isHi ? '#7c5cff' : '#1e1e28',
                            color: isHi ? '#ffffff' : '#b79cff',
                            fontWeight: 700,
                            fontSize: '11px',
                            display: 'grid',
                            placeItems: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {c.num}
                        </span>
                        <span style={{ fontWeight: 700, fontSize: '11.5px', color: '#e8e8ee' }}>
                          {isAr ? c.titleAr : c.titleEn}
                        </span>
                      </div>
                      {badgeText && (
                        <span
                          style={{
                            fontSize: '9.5px',
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: '99px',
                            background: 'rgba(124, 92, 255, 0.16)',
                            border: '1px solid rgba(124, 92, 255, 0.35)',
                            color: '#d8b4fe',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}
                        >
                          {badgeText}
                        </span>
                      )}
                    </div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: '11px',
                        color: '#80808f',
                        lineHeight: 1.55,
                      }}
                    >
                      {isAr ? c.descAr : c.descEn}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Unified Minimal Footer: Shortcuts + Page Navigation */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                paddingTop: '10px',
                borderTop: '1px solid #1e1e28',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                {activeChapter.shortcuts.map((sc, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: '#14141c',
                      border: '1px solid #1e1e28',
                      padding: '4px 9px',
                      borderRadius: '7px',
                      fontSize: '11px',
                    }}
                  >
                    <kbd
                      style={{
                        background: 'rgba(124, 92, 255, 0.18)',
                        color: '#b79cff',
                        border: '1px solid rgba(124, 92, 255, 0.35)',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        fontWeight: 700,
                        fontSize: '10.5px',
                      }}
                    >
                      {isAr ? sc.keysAr : sc.keysEn}
                    </kbd>
                    <span style={{ color: '#80808f' }}>
                      {isAr ? sc.actionAr : sc.actionEn}
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  type="button"
                  disabled={currentIndex <= 0}
                  onClick={() => {
                    if (currentIndex > 0) {
                      setActiveChapterId(GUIDE_BOOK_CHAPTERS[currentIndex - 1].id);
                      setHighlightedCallout(1);
                    }
                  }}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '7px',
                    border: '1px solid #1e1e28',
                    background: '#14141c',
                    color: '#e8e8ee',
                    fontSize: '11.5px',
                    cursor: currentIndex <= 0 ? 'not-allowed' : 'pointer',
                    opacity: currentIndex <= 0 ? 0.4 : 1,
                  }}
                >
                  {isAr ? 'السابق' : 'Prev'}
                </button>
                <span style={{ fontSize: '11px', color: '#80808f', padding: '0 4px' }}>
                  {currentIndex + 1} / {GUIDE_BOOK_CHAPTERS.length}
                </span>
                <button
                  type="button"
                  disabled={currentIndex >= GUIDE_BOOK_CHAPTERS.length - 1}
                  onClick={() => {
                    if (currentIndex < GUIDE_BOOK_CHAPTERS.length - 1) {
                      setActiveChapterId(GUIDE_BOOK_CHAPTERS[currentIndex + 1].id);
                      setHighlightedCallout(1);
                    }
                  }}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '7px',
                    border: '1px solid #7c5cff',
                    background: 'rgba(124, 92, 255, 0.16)',
                    color: '#e8e8ee',
                    fontSize: '11.5px',
                    cursor:
                      currentIndex >= GUIDE_BOOK_CHAPTERS.length - 1 ? 'not-allowed' : 'pointer',
                    opacity: currentIndex >= GUIDE_BOOK_CHAPTERS.length - 1 ? 0.4 : 1,
                  }}
                >
                  {isAr ? 'التالي' : 'Next'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
