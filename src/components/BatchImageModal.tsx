import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BatchAssetItemState,
  BatchOperationsState,
  countBatchOperations,
} from '../utils/batchImageOps';

export interface BatchImageModalProps {
  open: boolean;
  isAr: boolean;
  assetsMap: Record<string, string>;
  onClose: () => void;
  onExecute: (state: BatchOperationsState) => Promise<void> | void;
}

export default function BatchImageModal({
  open,
  isAr,
  assetsMap,
  onClose,
  onExecute,
}: BatchImageModalProps) {
  const [items, setItems] = useState<Record<string, BatchAssetItemState>>({});
  const [removeBackground, setRemoveBackground] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [activeReplaceKey, setActiveReplaceKey] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const initial: Record<string, BatchAssetItemState> = {};
    for (const [k, src] of Object.entries(assetsMap)) {
      initial[k] = {
        key: k,
        src,
        markedForDelete: false,
        newName: '',
        replacementDataUrl: null,
      };
    }
    setItems(initial);
    setRemoveBackground(false);
    setExecuting(false);
  }, [open, assetsMap]);

  const sortedKeys = useMemo(() => {
    return Object.keys(items).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const operationsCount = useMemo(() => {
    return countBatchOperations({ items, removeBackground });
  }, [items, removeBackground]);

  if (!open) return null;

  const handleClearAll = () => {
    setRemoveBackground(false);
    setItems((prev) => {
      const next: Record<string, BatchAssetItemState> = {};
      for (const [k, item] of Object.entries(prev)) {
        next[k] = {
          ...item,
          markedForDelete: false,
          newName: '',
          replacementDataUrl: null,
          replacementFileName: undefined,
        };
      }
      return next;
    });
  };

  const handleToggleDelete = (key: string, checked: boolean) => {
    setItems((prev) => {
      const cur = prev[key];
      if (!cur) return prev;
      return {
        ...prev,
        [key]: {
          ...cur,
          markedForDelete: checked,
        },
      };
    });
  };

  const handleChangeName = (key: string, value: string) => {
    setItems((prev) => {
      const cur = prev[key];
      if (!cur) return prev;
      return {
        ...prev,
        [key]: {
          ...cur,
          newName: value,
        },
      };
    });
  };

  const handleClickReplace = (key: string) => {
    setActiveReplaceKey(key);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleReplaceFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const targetKey = activeReplaceKey;
    if (!file || !targetKey) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result;
      if (typeof dataUrl === 'string') {
        setItems((prev) => {
          const cur = prev[targetKey];
          if (!cur) return prev;
          return {
            ...prev,
            [targetKey]: {
              ...cur,
              replacementDataUrl: dataUrl,
              replacementFileName: file.name,
              markedForDelete: false,
            },
          };
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleBatchExecute = async () => {
    if (operationsCount === 0 || executing) return;
    setExecuting(true);
    try {
      await onExecute({ items, removeBackground });
      onClose();
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div
      id="batchImageModalBackdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Batch Image Operations"
      onClick={(e) => {
        if (e.target === e.currentTarget && !executing) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99995,
        background: 'rgba(3, 4, 8, 0.82)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        direction: 'ltr',
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleReplaceFileSelected}
      />

      <div
        id="batchImageModalCard"
        style={{
          width: 'min(1040px, 96vw)',
          maxHeight: '92vh',
          background: '#0d0e12',
          border: '1px solid #232530',
          borderRadius: '12px',
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.85)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#f1f5f9',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 22px',
            borderBottom: '1px solid #1e202b',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: '18px',
                fontWeight: 700,
                color: '#ffffff',
                letterSpacing: '-0.01em',
              }}
            >
              Batch Image Operations
            </h2>
            <p
              style={{
                margin: '4px 0 0',
                fontSize: '12px',
                color: '#8b92a5',
              }}
            >
              {isAr
                ? 'Batch edit, replace, and delete image assets · تعديل واستبدال وحذف الصور دفعة واحدة'
                : 'Batch edit, replace, and delete image assets'}
            </p>
          </div>
          <button
            type="button"
            id="batchModalCloseBtn"
            aria-label="Close Batch Image Operations"
            onClick={onClose}
            disabled={executing}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              padding: '6px',
              cursor: 'pointer',
              borderRadius: '6px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Scrollable Body */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: '16px 22px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {/* Operations Status Banner */}
          <div
            id="batchOpsSummaryBar"
            style={{
              background: operationsCount > 0 ? 'rgba(6, 78, 59, 0.32)' : '#12141c',
              border:
                operationsCount > 0
                  ? '1px solid rgba(16, 185, 129, 0.35)'
                  : '1px solid #222532',
              borderRadius: '8px',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            <span
              id="batchSelectedOpsCount"
              style={{
                fontWeight: 700,
                fontSize: '13px',
                color: '#f8fafc',
              }}
            >
              {operationsCount} operations selected
            </span>

            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#cbd5e1',
                }}
              >
                Total {sortedKeys.length} images
              </span>
              <button
                type="button"
                id="batchClearAllBtn"
                onClick={handleClearAll}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#cbd5e1',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '2px 6px',
                  borderRadius: '5px',
                }}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
                <span>Clear All</span>
              </button>
            </div>
          </div>

          {/* Remove Background Toggle Bar */}
          <label
            htmlFor="batchRemoveBgCheckbox"
            style={{
              background: '#111218',
              border: removeBackground ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid #222532',
              borderRadius: '8px',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <span
              style={{
                fontSize: '14px',
                fontWeight: 700,
                color: '#e2e8f0',
              }}
            >
              Remove background
            </span>
            <input
              id="batchRemoveBgCheckbox"
              type="checkbox"
              checked={removeBackground}
              onChange={(e) => setRemoveBackground(e.target.checked)}
              style={{
                width: '18px',
                height: '18px',
                accentColor: '#10b981',
                cursor: 'pointer',
              }}
            />
          </label>

          {/* 4-Column Asset Grid */}
          {sortedKeys.length === 0 ? (
            <div
              style={{
                padding: '48px 20px',
                textAlign: 'center',
                color: '#8b92a5',
                background: '#111218',
                border: '1px dashed #252836',
                borderRadius: '10px',
                fontSize: '13px',
              }}
            >
              {isAr
                ? 'لا توجد أصول صور في الملف الحالي. قم برفع ملف SVGA أو Lottie يحتوي على صور أولاً.'
                : 'No image assets found in the current file. Upload an SVGA or Lottie file with image assets first.'}
            </div>
          ) : (
            <div
              id="batchAssetsGrid"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(215px, 1fr))',
                gap: '12px',
              }}
            >
              {sortedKeys.map((key) => {
                const item = items[key];
                if (!item) return null;
                const isDeleted = item.markedForDelete;
                const isRenamed =
                  !isDeleted && item.newName.trim() !== '' && item.newName.trim() !== item.key;
                const isReplaced = !isDeleted && !!item.replacementDataUrl;
                const isModified = isDeleted || isRenamed || isReplaced;
                const displaySrc = item.replacementDataUrl || item.src;

                return (
                  <div
                    key={key}
                    data-batch-key={key}
                    style={{
                      background: isDeleted ? 'rgba(69, 10, 10, 0.28)' : '#12131a',
                      border: isModified
                        ? '1px solid rgba(16, 185, 129, 0.45)'
                        : '1px solid #222532',
                      borderRadius: '10px',
                      padding: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                      transition: 'border-color 0.15s ease, background 0.15s ease',
                    }}
                  >
                    {/* Image Thumbnail Preview Area */}
                    <div
                      style={{
                        height: '120px',
                        borderRadius: '7px',
                        background: '#06070a',
                        border: isDeleted ? '1px solid #ef4444' : '1px solid #1b1d28',
                        position: 'relative',
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '8px',
                      }}
                    >
                      <img
                        src={displaySrc}
                        alt={key}
                        loading="lazy"
                        style={{
                          maxWidth: '100%',
                          maxHeight: '100%',
                          objectFit: 'contain',
                          opacity: isDeleted ? 0.15 : 1,
                          transition: 'opacity 0.15s ease',
                        }}
                      />

                      {/* Red "Marked for Delete" Overlay */}
                      {isDeleted && (
                        <div
                          data-testid={`marked-delete-overlay-${key}`}
                          style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'rgba(185, 28, 28, 0.88)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            color: '#ffffff',
                          }}
                        >
                          <svg
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M3 6h18" />
                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                            <line x1="10" y1="11" x2="10" y2="17" />
                            <line x1="14" y1="11" x2="14" y2="17" />
                          </svg>
                          <span style={{ fontSize: '12px', fontWeight: 700 }}>
                            Marked for Delete
                          </span>
                        </div>
                      )}

                      {/* Replaced indicator badge */}
                      {isReplaced && (
                        <span
                          style={{
                            position: 'absolute',
                            top: '6px',
                            right: '6px',
                            background: 'rgba(16, 185, 129, 0.9)',
                            color: '#fff',
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '4px',
                          }}
                        >
                          Replaced
                        </span>
                      )}
                    </div>

                    {/* Asset Key Name */}
                    <div
                      title={key}
                      style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        color: '#f8fafc',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {key}
                    </div>

                    {/* Mark for Delete Checkbox */}
                    <label
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#e2e8f0',
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isDeleted}
                        onChange={(e) => handleToggleDelete(key, e.target.checked)}
                        style={{
                          width: '15px',
                          height: '15px',
                          accentColor: '#ef4444',
                          cursor: 'pointer',
                        }}
                      />
                      <span>Mark for Delete</span>
                    </label>

                    {/* Enter New Name Input */}
                    <input
                      type="text"
                      placeholder="Enter new name"
                      value={item.newName}
                      disabled={isDeleted}
                      onChange={(e) => handleChangeName(key, e.target.value)}
                      style={{
                        width: '100%',
                        background: '#08090d',
                        border: '1px solid #1e202c',
                        borderRadius: '6px',
                        padding: '7px 10px',
                        fontSize: '12px',
                        color: '#f1f5f9',
                        opacity: isDeleted ? 0.45 : 1,
                        cursor: isDeleted ? 'not-allowed' : 'text',
                      }}
                    />

                    {/* Replace Button */}
                    <button
                      type="button"
                      disabled={isDeleted}
                      onClick={() => handleClickReplace(key)}
                      style={{
                        width: '100%',
                        background: isReplaced ? 'rgba(16, 185, 129, 0.14)' : '#14151e',
                        border: isReplaced
                          ? '1px solid rgba(16, 185, 129, 0.5)'
                          : '1px solid #262938',
                        borderRadius: '6px',
                        padding: '7px 10px',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: isReplaced ? '#34d399' : '#e2e8f0',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        cursor: isDeleted ? 'not-allowed' : 'pointer',
                        opacity: isDeleted ? 0.4 : 1,
                      }}
                    >
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                      <span>{isReplaced ? 'Replaced (Change)' : 'Replace'}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 22px',
            borderTop: '1px solid #1e202b',
            background: '#0b0c10',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <span
            id="batchReadyFooterText"
            style={{
              fontSize: '12px',
              color: '#8b92a5',
            }}
          >
            Ready to execute {operationsCount} operations
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              id="batchCancelBtn"
              onClick={onClose}
              disabled={executing}
              style={{
                background: '#14151e',
                border: '1px solid #282b3a',
                borderRadius: '7px',
                padding: '8px 18px',
                fontSize: '13px',
                fontWeight: 600,
                color: '#e2e8f0',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              id="batchExecuteBtn"
              onClick={handleBatchExecute}
              disabled={operationsCount === 0 || executing}
              style={{
                background: operationsCount > 0 ? '#10b981' : '#064e3b',
                border: '1px solid #059669',
                borderRadius: '7px',
                padding: '8px 18px',
                fontSize: '13px',
                fontWeight: 700,
                color: '#ffffff',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
                cursor: operationsCount > 0 && !executing ? 'pointer' : 'not-allowed',
                opacity: operationsCount > 0 && !executing ? 1 : 0.55,
              }}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <span>{executing ? 'Executing…' : 'Batch Execute'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
