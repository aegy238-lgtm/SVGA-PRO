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
  const [highlightedCallout, setHighlightedCallout] = useState<number | null>(1);

  // Strictly only show on the main home view; hide immediately when entering any feature
  const isVisibleOnScreen = shouldShowGuideBookButton(activeView);

  if (!isVisibleOnScreen) {
    return null;
  }

  const activeChapter: GuideBookChapter =
    GUIDE_BOOK_CHAPTERS.find((c) => c.id === activeChapterId) || GUIDE_BOOK_CHAPTERS[0];

  const currentIndex = GUIDE_BOOK_CHAPTERS.findIndex((c) => c.id === activeChapter.id);

  const renderVisualScreenMockup = (chapter: GuideBookChapter) => {
    if (chapter.id === 'motion_converter') {
      return (
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '290px',
            borderRadius: '14px',
            background: '#090a12',
            border: '1px solid rgba(124, 92, 255, 0.45)',
            overflow: 'hidden',
            display: 'grid',
            gridTemplateColumns: '1fr 1.6fr 1.1fr',
            gap: '8px',
            padding: '10px',
            boxShadow: 'inset 0 0 40px rgba(124, 92, 255, 0.12)',
          }}
        >
          {/* Left Panel Mockup: Layers, Audio, Edge Feather, Watermark */}
          <div
            style={{
              background: '#12131f',
              borderRadius: '10px',
              border:
                highlightedCallout === 3
                  ? '1.5px solid #a78bfa'
                  : '1px solid rgba(255,255,255,0.08)',
              padding: '8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ fontSize: '10px', fontWeight: 800, color: '#c4b5fd' }}>
              🎨 {isAr ? 'صور وطبقات الملف + الصوت' : 'Image & Audio Assets'}
            </div>
            <div
              style={{
                padding: '4px 6px',
                borderRadius: '6px',
                background: 'rgba(124, 92, 255, 0.16)',
                border: '1px solid rgba(124, 92, 255, 0.35)',
                fontSize: '9.5px',
                color: '#e9d5ff',
              }}
            >
              🌫️ {isAr ? 'تنعيم الحواف (Edge Feather)' : 'Edge Feather'}
            </div>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: '8.5px',
                  padding: '2px 6px',
                  borderRadius: '99px',
                  background: '#1e2036',
                  color: '#cbd5e1',
                }}
              >
                💧 {isAr ? 'علامة مائية' : 'Watermark'}
              </span>
              <span
                style={{
                  fontSize: '8.5px',
                  padding: '2px 6px',
                  borderRadius: '99px',
                  background: '#1e2036',
                  color: '#cbd5e1',
                }}
              >
                ⚡ Batch
              </span>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '4px',
                marginTop: '2px',
                flex: 1,
              }}
            >
              {['crown_01.png', 'wings_02.png', 'glow_03.png', 'star_04.png'].map((sp) => (
                <div
                  key={sp}
                  style={{
                    background: '#0b0c14',
                    borderRadius: '6px',
                    border: '1px solid #23253a',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '4px',
                    fontSize: '8px',
                    color: '#94a3b8',
                  }}
                >
                  <span style={{ fontSize: '14px' }}>✨</span>
                  <span>{sp}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Center Stage Mockup: Live Preview + Left Click Instant Export */}
          <div
            style={{
              background:
                'repeating-conic-gradient(#1a1b26 0 25%, #12131c 0 50%) 0 0 / 16px 16px',
              borderRadius: '10px',
              border:
                highlightedCallout === 1
                  ? '2px solid #10b981'
                  : '1px solid rgba(255,255,255,0.12)',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '10px',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: '7px',
                left: '8px',
                right: '8px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: '99px',
                  background: 'rgba(16, 185, 129, 0.22)',
                  border: '1px solid #10b981',
                  color: '#6ee7b7',
                }}
              >
                🖱️ {isAr ? 'كليك شمال هنا = تصدير فوري!' : 'Left-Click Here = Instant Export!'}
              </span>
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: 800,
                  padding: '2px 7px',
                  borderRadius: '99px',
                  background: 'rgba(245, 158, 11, 0.22)',
                  border: '1px solid #f59e0b',
                  color: '#fde047',
                }}
              >
                ⌨️ Tab
              </span>
            </div>

            <div
              style={{
                width: '96px',
                height: '96px',
                borderRadius: '18px',
                background:
                  'radial-gradient(circle, rgba(124,92,255,0.38) 0%, rgba(16,185,129,0.15) 70%, transparent 100%)',
                border: '1px dashed rgba(167, 139, 250, 0.5)',
                display: 'grid',
                placeItems: 'center',
                fontSize: '42px',
                boxShadow: '0 0 30px rgba(124, 92, 255, 0.35)',
              }}
            >
              👑
            </div>
            <div
              style={{
                marginTop: '6px',
                fontSize: '10px',
                fontWeight: 800,
                color: '#f8fafc',
                textAlign: 'center',
              }}
            >
              {isAr ? 'شاشة معاينة الهدية الحية' : 'Live Gift Preview Stage'}
            </div>

            {/* Bottom Stage Controls */}
            <div
              style={{
                position: 'absolute',
                bottom: '7px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(10, 11, 18, 0.88)',
                padding: '3px 10px',
                borderRadius: '99px',
                border: '1px solid rgba(255,255,255,0.12)',
                fontSize: '8.5px',
                color: '#cbd5e1',
              }}
            >
              <span>⏯️ Pause</span>
              <span>🔊 Sound</span>
              <span>🔍 100%</span>
              <span>🎨 BG</span>
            </div>
          </div>

          {/* Right Panel Mockup: Format & Conversion Settings */}
          <div
            style={{
              background: '#12131f',
              borderRadius: '10px',
              border:
                highlightedCallout === 2
                  ? '1.5px solid #f59e0b'
                  : '1px solid rgba(255,255,255,0.08)',
              padding: '8px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '5px',
            }}
          >
            <div style={{ fontSize: '10px', fontWeight: 800, color: '#fde047' }}>
              ⚙️ {isAr ? 'إعدادات التحويل والصيغة' : 'Format & Export Settings'}
            </div>
            <div
              style={{
                fontSize: '9px',
                color: '#94a3b8',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>{isAr ? 'الأبعاد:' : 'Size:'}</span>
              <span style={{ color: '#fff', fontWeight: 700 }}>750 × 750</span>
            </div>
            <div
              style={{
                fontSize: '9px',
                color: '#94a3b8',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>FPS:</span>
              <span style={{ color: '#fff', fontWeight: 700 }}>30 FPS</span>
            </div>
            <div
              style={{
                padding: '5px 7px',
                borderRadius: '6px',
                background: '#1b1d30',
                border: '1px solid #7c5cff',
                fontSize: '9.5px',
                color: '#e9d5ff',
                fontWeight: 700,
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>{isAr ? 'الصيغة:' : 'Format:'}</span>
              <span>SVGA / VAP / MP4 ▾</span>
            </div>
            <div
              style={{
                padding: '7px 8px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #7c5cff, #10b981)',
                color: '#fff',
                fontSize: '9.5px',
                fontWeight: 900,
                textAlign: 'center',
                boxShadow: '0 4px 14px rgba(124, 92, 255, 0.4)',
              }}
            >
              ⚡ {isAr ? 'بدء التحويل [Tab / كليك شمال]' : 'Export [Tab / Left-Click]'}
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
            position: 'relative',
            width: '100%',
            height: '290px',
            borderRadius: '14px',
            background: '#090c18',
            border: '1px solid rgba(16, 185, 129, 0.45)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            padding: '10px',
          }}
        >
          {/* Top Studio Bar Mockup */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#111628',
              padding: '7px 10px',
              borderRadius: '10px',
              border: '1px solid rgba(255,255,255,0.08)',
              gap: '6px',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  padding: '4px 10px',
                  borderRadius: '99px',
                  background: 'linear-gradient(135deg, #7c5cff, #6366f1)',
                  color: '#fff',
                  fontSize: '9.5px',
                  fontWeight: 800,
                }}
              >
                ⬇ {isAr ? 'تصدير هدية + صورة [Tab]' : 'Export Pack [Tab]'}
              </span>
              <span
                style={{
                  padding: '3px 8px',
                  borderRadius: '99px',
                  background: '#1b2238',
                  color: '#cbd5e1',
                  fontSize: '9px',
                }}
              >
                🎁 {isAr ? 'هدية + صورة / فيديو / فولدرات ▾' : 'Export Mode ▾'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  padding: '3px 9px',
                  borderRadius: '99px',
                  background: 'rgba(16, 185, 129, 0.18)',
                  border: '1px solid #10b981',
                  color: '#6ee7b7',
                  fontSize: '9px',
                  fontWeight: 800,
                }}
              >
                ⏱️ {isAr ? 'مدة الفيديو: مفعّل (8 ث)' : 'Video Duration: ON (8s)'}
              </span>
              <span
                style={{
                  padding: '3px 9px',
                  borderRadius: '99px',
                  background: 'rgba(124, 92, 255, 0.2)',
                  border: '1px solid #7c5cff',
                  color: '#e9d5ff',
                  fontSize: '9px',
                  fontWeight: 800,
                }}
              >
                ➕ {isAr ? 'رفع هدايا أو ملفات مغلقة ZIP' : 'Upload Gifts & ZIP'}
              </span>
            </div>
          </div>

          {/* Cards Grid Mockup */}
          <div
            style={{
              flex: 1,
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '8px',
            }}
          >
            {[
              { name: 'royal_dragon.svga', fmt: 'SVGA', dur: '6.5s', icon: '🐉' },
              { name: 'luxury_castle.vap', fmt: 'VAP Alpha', dur: '8.0s', icon: '🏰' },
              { name: 'golden_lion_pack.zip', fmt: 'ZIP Extracted', dur: '5.2s', icon: '🦁' },
            ].map((card) => (
              <div
                key={card.name}
                style={{
                  background: '#111628',
                  borderRadius: '10px',
                  border: '1px solid #232c48',
                  padding: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8.5px' }}>
                  <span
                    style={{
                      background: 'rgba(124,92,255,0.25)',
                      color: '#c4b5fd',
                      padding: '1px 6px',
                      borderRadius: '4px',
                      fontWeight: 800,
                    }}
                  >
                    {card.fmt}
                  </span>
                  <span style={{ color: '#6ee7b7' }}>{card.dur}</span>
                </div>
                <div
                  style={{
                    height: '95px',
                    borderRadius: '8px',
                    background:
                      'repeating-conic-gradient(#181f36 0 25%, #101526 0 50%) 0 0 / 12px 12px',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: '34px',
                  }}
                >
                  {card.icon}
                </div>
                <div
                  style={{
                    fontSize: '9px',
                    fontWeight: 700,
                    color: '#e2e8f0',
                    textAlign: 'center',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {card.name}
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
            position: 'relative',
            width: '100%',
            height: '290px',
            borderRadius: '14px',
            background: '#0b0a14',
            border: '1px solid rgba(236, 72, 153, 0.45)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            padding: '10px',
          }}
        >
          {/* Header Bar */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#161326',
              padding: '7px 10px',
              borderRadius: '10px',
              border: '1px solid rgba(236, 72, 153, 0.3)',
            }}
          >
            <span
              style={{
                padding: '4px 10px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #7c5cff, #059669)',
                color: '#fff',
                fontSize: '9.5px',
                fontWeight: 800,
              }}
            >
              📦 {isAr ? 'تنزيل جميع الصور ZIP [Tab]' : 'Download All ZIP [Tab]'}
            </span>
            <span
              style={{
                padding: '4px 10px',
                borderRadius: '8px',
                background: 'rgba(236, 72, 153, 0.25)',
                border: '1px solid #f472b6',
                color: '#fbcfe8',
                fontSize: '9.5px',
                fontWeight: 800,
              }}
            >
              🌫️ {isAr ? 'تنعيم الحواف الشفافة: مفعّل (24px)' : 'Soft Edge Feather: ON (24px)'}
            </span>
            <span style={{ fontSize: '10px', fontWeight: 800, color: '#f8fafc' }}>
              🖼️ {isAr ? 'إنشاء صورة الهدية 3D' : '3D Gift Image Studio'}
            </span>
          </div>

          {/* Content Area */}
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '8px' }}>
            <div
              style={{
                background:
                  'repeating-conic-gradient(#19162b 0 25%, #110f1f 0 50%) 0 0 / 14px 14px',
                borderRadius: '10px',
                border: '1px solid #2b2448',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
              }}
            >
              <div
                style={{
                  width: '112px',
                  height: '112px',
                  borderRadius: '50%',
                  background: 'radial-gradient(circle, #ec4899 0%, #7c5cff 60%, transparent 72%)',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: '44px',
                  boxShadow: '0 0 32px rgba(236, 72, 153, 0.45)',
                  border: '2px solid rgba(253, 224, 71, 0.75)',
                }}
              >
                💎
              </div>
              <span style={{ fontSize: '9.5px', color: '#fbcfe8', marginTop: '6px', fontWeight: 700 }}>
                {isAr
                  ? 'حواف متدرجة الشفافية + طبقة إطار ذهبي مشترك'
                  : 'Feathered Alpha Edges + Shared VIP Frame'}
              </span>
            </div>

            <div
              style={{
                background: '#141122',
                borderRadius: '10px',
                border: '1px solid #2b2448',
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div style={{ fontSize: '9.5px', fontWeight: 800, color: '#f472b6' }}>
                ✨ {isAr ? 'قوالب تشكيل الهدايا (10 أشكال)' : '10 Gift Mask Shapes'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                {[
                  isAr ? '⚪ دائري ناعم' : '⚪ Circle',
                  isAr ? '🛡️ درع ملكي' : '🛡️ Royal Shield',
                  isAr ? '💎 ماسة سداسية' : '💎 Diamond',
                  isAr ? '👑 تاج VIP' : '👑 VIP Crown',
                  isAr ? '❤️ قلب ثلاثي' : '❤️ 3D Heart',
                  isAr ? '⭐ نجمة ذهبية' : '⭐ Gold Star',
                ].map((s) => (
                  <div
                    key={s}
                    style={{
                      padding: '5px',
                      borderRadius: '6px',
                      background: '#1f1a36',
                      border: '1px solid rgba(236,72,153,0.3)',
                      fontSize: '8.5px',
                      color: '#e9d5ff',
                      textAlign: 'center',
                      fontWeight: 700,
                    }}
                  >
                    {s}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {renderCalloutPins(chapter)}
        </div>
      );
    }

    // SVGA AE Editor Mockup
    return (
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '290px',
          borderRadius: '14px',
          background: '#0a0b12',
          border: '1px solid rgba(245, 158, 11, 0.45)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          padding: '10px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#151624',
            padding: '7px 10px',
            borderRadius: '10px',
            border: '1px solid rgba(245, 158, 11, 0.35)',
          }}
        >
          <div style={{ display: 'flex', gap: '6px' }}>
            <span
              style={{
                padding: '4px 10px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                color: '#000',
                fontSize: '9.5px',
                fontWeight: 900,
              }}
            >
              🚀 {isAr ? 'تصدير SVGA / After Effects [Tab]' : 'Export SVGA / AE [Tab]'}
            </span>
          </div>
          <span style={{ fontSize: '10px', fontWeight: 800, color: '#fde047' }}>
            🎬 {isAr ? 'محرر طبقات وفريمات SVGA المتقدم' : 'Advanced SVGA Timeline Editor'}
          </span>
        </div>

        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '8px' }}>
          <div
            style={{
              background: '#121320',
              borderRadius: '8px',
              border: '1px solid #262840',
              padding: '6px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <div style={{ fontSize: '9px', fontWeight: 800, color: '#fde047' }}>
              🗂️ {isAr ? 'شجرة الطبقات (Sprites)' : 'Sprites Tree'}
            </div>
            {['layer_crown_main', 'layer_wings_left', 'layer_wings_right', 'layer_particles'].map(
              (l) => (
                <div
                  key={l}
                  style={{
                    padding: '4px 6px',
                    borderRadius: '5px',
                    background: '#1a1c30',
                    fontSize: '8.5px',
                    color: '#cbd5e1',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>👁️ {l}</span>
                  <span style={{ color: '#6ee7b7' }}>PNG</span>
                </div>
              )
            )}
          </div>

          <div
            style={{
              background: '#121320',
              borderRadius: '8px',
              border: '1px solid #262840',
              padding: '8px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div
              style={{
                flex: 1,
                display: 'grid',
                placeItems: 'center',
                background: 'repeating-conic-gradient(#191b2e 0 25%, #111322 0 50%) 0 0 / 14px 14px',
                borderRadius: '6px',
                fontSize: '36px',
              }}
            >
              🏆
            </div>
            <div
              style={{
                marginTop: '6px',
                background: '#0c0d16',
                padding: '5px 8px',
                borderRadius: '6px',
                border: '1px solid #2e3252',
                fontSize: '8.5px',
                color: '#fde047',
              }}
            >
              🎞️ Timeline: Frame 45 / 120 ━━━●━━━━━━━━━━
            </div>
          </div>
        </div>

        {renderCalloutPins(chapter)}
      </div>
    );
  };

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
            width: isHi ? '30px' : '25px',
            height: isHi ? '30px' : '25px',
            borderRadius: '50%',
            background: isHi
              ? 'linear-gradient(135deg, #f59e0b, #ef4444)'
              : 'linear-gradient(135deg, #7c5cff, #4f46e5)',
            border: '2px solid #ffffff',
            color: '#ffffff',
            fontWeight: 900,
            fontSize: '12px',
            cursor: 'pointer',
            display: 'grid',
            placeItems: 'center',
            boxShadow: isHi
              ? '0 0 20px rgba(245, 158, 11, 0.95), 0 4px 10px rgba(0,0,0,0.6)'
              : '0 4px 12px rgba(0,0,0,0.6)',
            zIndex: 15,
            transition: 'all 0.18s ease',
          }}
          title={isAr ? c.titleAr : c.titleEn}
        >
          {c.num}
        </button>
      );
    });
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
              ? '📖 دليل شرح وظائف ومميزات الموقع بالصور + اختصارات التصدير'
              : '📖 Illustrated Platform Features & Shortcuts Guidebook'
          }
          style={{
            width: '52px',
            height: '52px',
            borderRadius: '50%',
            border: '1.5px solid rgba(154, 124, 255, 0.45)',
            background:
              'radial-gradient(circle at 30% 25%, rgba(154, 124, 255, 0.26) 0%, rgba(20, 20, 32, 0.94) 68%, rgba(11, 11, 18, 0.98) 100%)',
            color: '#e0d4ff',
            cursor: 'pointer',
            display: 'grid',
            placeItems: 'center',
            boxShadow:
              '0 10px 28px rgba(0, 0, 0, 0.65), 0 0 22px rgba(154, 124, 255, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.16)',
            backdropFilter: 'blur(12px)',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
            padding: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px) scale(1.05)';
            e.currentTarget.style.borderColor = 'rgba(167, 139, 250, 0.85)';
            e.currentTarget.style.boxShadow =
              '0 12px 32px rgba(0, 0, 0, 0.75), 0 0 28px rgba(154, 124, 255, 0.48), inset 0 1px 0 rgba(255, 255, 255, 0.25)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.borderColor = 'rgba(154, 124, 255, 0.45)';
            e.currentTarget.style.boxShadow =
              '0 10px 28px rgba(0, 0, 0, 0.65), 0 0 22px rgba(154, 124, 255, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.16)';
          }}
        >
          <svg
            width="23"
            height="23"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#c4b5fd"
            strokeWidth="1.85"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
        </button>
      </div>

      {/* Full Illustrated Guidebook Modal */}
      {open && (
        <div
          id="platformGuideBookModal"
          role="dialog"
          aria-modal="true"
          aria-label={
            isAr ? 'كتالوج ودليل شرح مميزات الموقع بالصور' : 'Illustrated Platform Guidebook'
          }
          dir={isAr ? 'rtl' : 'ltr'}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9995,
            background: 'rgba(4, 5, 12, 0.86)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            style={{
              width: 'min(980px, 96vw)',
              maxHeight: '92vh',
              overflowY: 'auto',
              background: 'linear-gradient(180deg, #131424 0%, #0b0c16 100%)',
              border: '1px solid rgba(124, 92, 255, 0.5)',
              borderRadius: '20px',
              padding: '22px',
              boxShadow: '0 28px 80px rgba(0, 0, 0, 0.85)',
              color: '#f8fafc',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                paddingBottom: '14px',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #7c5cff 0%, #f59e0b 100%)',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: '24px',
                    boxShadow: '0 6px 20px rgba(124, 92, 255, 0.4)',
                  }}
                >
                  📖
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#ffffff' }}>
                    {isAr
                      ? 'دليل وكتالوج مميزات المنصة المصوّر + اختصارات التصدير الفوري'
                      : 'Illustrated Platform Features Guidebook & Export Shortcuts'}
                  </h2>
                  <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                    {isAr
                      ? 'اضغط على أي ميزة بالأسفل لمشاهدة سكرين توضيحي مرقّم وشرح تفصيلي لكل وظيفة واختصارات الكيبورد والماوس'
                      : 'Select any feature tab below to inspect its numbered visual screen and detailed functional guide'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                id="closeGuideBookModalBtn"
                onClick={() => setOpen(false)}
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '50%',
                  border: '1px solid rgba(255, 255, 255, 0.16)',
                  background: '#1a1b2e',
                  color: '#cbd5e1',
                  fontSize: '18px',
                  cursor: 'pointer',
                }}
              >
                ×
              </button>
            </div>

            {/* Chapter Tabs Selector */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '8px',
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
                      padding: '10px 12px',
                      borderRadius: '12px',
                      border: isSelected
                        ? `2px solid ${chap.accentColor}`
                        : '1px solid rgba(255, 255, 255, 0.09)',
                      background: isSelected
                        ? 'rgba(124, 92, 255, 0.18)'
                        : 'rgba(20, 22, 36, 0.75)',
                      color: '#ffffff',
                      cursor: 'pointer',
                      textAlign: isAr ? 'right' : 'left',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span style={{ fontSize: '22px' }}>{chap.icon}</span>
                    <div style={{ overflow: 'hidden' }}>
                      <div
                        style={{
                          fontSize: '10px',
                          fontWeight: 800,
                          color: isSelected ? '#fde047' : '#94a3b8',
                        }}
                      >
                        {isAr ? `صفحة ${idx + 1} • ${chap.badgeAr}` : `Page ${idx + 1} • ${chap.badgeEn}`}
                      </div>
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: 800,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {isAr ? chap.titleAr : chap.titleEn}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Active Chapter Content: Visual Screen + Callout Explanations */}
            <div
              style={{
                background: '#0e101d',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '16px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              {/* Chapter Title & Summary */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: '12px',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: 1, minWidth: '260px' }}>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '3px 10px',
                      borderRadius: '99px',
                      background: 'rgba(124, 92, 255, 0.2)',
                      border: '1px solid rgba(124, 92, 255, 0.45)',
                      color: '#c4b5fd',
                      fontSize: '11px',
                      fontWeight: 800,
                      marginBottom: '6px',
                    }}
                  >
                    <span>{activeChapter.icon}</span>
                    <span>{isAr ? activeChapter.badgeAr : activeChapter.badgeEn}</span>
                  </div>
                  <h3 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 900, color: '#fff' }}>
                    {isAr ? activeChapter.titleAr : activeChapter.titleEn}
                  </h3>
                  <p style={{ margin: 0, fontSize: '12.5px', color: '#cbd5e1', lineHeight: 1.6 }}>
                    {isAr ? activeChapter.summaryAr : activeChapter.summaryEn}
                  </p>
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
                      padding: '9px 16px',
                      borderRadius: '10px',
                      border: '1px solid rgba(16, 185, 129, 0.6)',
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      color: '#042f2e',
                      fontWeight: 900,
                      fontSize: '12px',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
                    }}
                  >
                    🚀 {isAr ? 'الانتقال لهذه الميزة الآن' : 'Open This Tool Now'}
                  </button>
                )}
              </div>

              {/* Interactive Annotated Screen Preview */}
              <div>
                <div
                  style={{
                    fontSize: '11.5px',
                    fontWeight: 800,
                    color: '#fde047',
                    marginBottom: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>
                    🖥️{' '}
                    {isAr
                      ? 'سكرين توضيحي تفاعلي لواجهة الميزة (اضغط على الأرقام ١ - ٤ لمعرفة وظيفة كل جزء):'
                      : 'Interactive Annotated Screen Preview (Click numbers 1–4 to inspect each function):'}
                  </span>
                </div>
                {renderVisualScreenMockup(activeChapter)}
              </div>

              {/* Detailed Numbered Explanations Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: '10px',
                }}
              >
                {activeChapter.callouts.map((c) => {
                  const isHi = highlightedCallout === c.num;
                  return (
                    <div
                      key={c.num}
                      onMouseEnter={() => setHighlightedCallout(c.num)}
                      onClick={() => setHighlightedCallout(c.num)}
                      style={{
                        padding: '12px',
                        borderRadius: '12px',
                        background: isHi
                          ? 'linear-gradient(180deg, rgba(124, 92, 255, 0.2) 0%, rgba(18, 20, 36, 0.95) 100%)'
                          : '#141627',
                        border: isHi
                          ? '1.5px solid #f59e0b'
                          : '1px solid rgba(255, 255, 255, 0.08)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: '6px',
                          gap: '6px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                          <span
                            style={{
                              width: '22px',
                              height: '22px',
                              borderRadius: '50%',
                              background: isHi ? '#f59e0b' : '#7c5cff',
                              color: isHi ? '#000' : '#fff',
                              fontWeight: 900,
                              fontSize: '11.5px',
                              display: 'grid',
                              placeItems: 'center',
                              flexShrink: 0,
                            }}
                          >
                            {c.num}
                          </span>
                          <span style={{ fontWeight: 800, fontSize: '12.5px', color: '#fff' }}>
                            {isAr ? c.titleAr : c.titleEn}
                          </span>
                        </div>
                        {(c.badgeAr || c.badgeEn) && (
                          <span
                            style={{
                              fontSize: '9.5px',
                              padding: '2px 7px',
                              borderRadius: '99px',
                              background: 'rgba(255,255,255,0.08)',
                              color: '#fde047',
                              fontWeight: 700,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {isAr ? c.badgeAr : c.badgeEn}
                          </span>
                        )}
                      </div>
                      <p
                        style={{
                          margin: 0,
                          fontSize: '11.5px',
                          color: '#cbd5e1',
                          lineHeight: 1.55,
                        }}
                      >
                        {isAr ? c.descAr : c.descEn}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Shortcuts Bar for this feature */}
              <div
                style={{
                  background:
                    'linear-gradient(90deg, rgba(16, 185, 129, 0.14), rgba(124, 92, 255, 0.14))',
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                  borderRadius: '12px',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '10px',
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 800, color: '#6ee7b7' }}>
                  ⚡ {isAr ? 'اختصارات التصدير الفوري في هذه الميزة:' : 'Instant Export Shortcuts:'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  {activeChapter.shortcuts.map((sc, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: '#0b0d17',
                        border: sc.highlight
                          ? '1px solid #f59e0b'
                          : '1px solid rgba(255,255,255,0.15)',
                        padding: '4px 10px',
                        borderRadius: '8px',
                        fontSize: '11px',
                      }}
                    >
                      <kbd
                        style={{
                          background: 'rgba(245, 158, 11, 0.2)',
                          color: '#fde047',
                          padding: '1px 6px',
                          borderRadius: '5px',
                          fontWeight: 900,
                        }}
                      >
                        {isAr ? sc.keysAr : sc.keysEn}
                      </kbd>
                      <span style={{ color: '#e2e8f0', fontWeight: 600 }}>
                        {isAr ? sc.actionAr : sc.actionEn}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer Pagination Controls */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
              }}
            >
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
                  padding: '8px 16px',
                  borderRadius: '10px',
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: '#181a2c',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: currentIndex <= 0 ? 'not-allowed' : 'pointer',
                  opacity: currentIndex <= 0 ? 0.45 : 1,
                }}
              >
                {isAr ? '→ الميزة السابقة' : '← Previous Feature'}
              </button>

              <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 700 }}>
                {isAr
                  ? `صفحة ${currentIndex + 1} من ${GUIDE_BOOK_CHAPTERS.length}`
                  : `Page ${currentIndex + 1} of ${GUIDE_BOOK_CHAPTERS.length}`}
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
                  padding: '8px 16px',
                  borderRadius: '10px',
                  border: '1px solid rgba(124, 92, 255, 0.5)',
                  background: 'rgba(124, 92, 255, 0.22)',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor:
                    currentIndex >= GUIDE_BOOK_CHAPTERS.length - 1 ? 'not-allowed' : 'pointer',
                  opacity: currentIndex >= GUIDE_BOOK_CHAPTERS.length - 1 ? 0.45 : 1,
                }}
              >
                {isAr ? 'الميزة التالية ←' : 'Next Feature →'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
