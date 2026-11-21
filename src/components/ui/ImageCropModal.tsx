"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Move, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import {
  compressAvatarImage,
  compressWallPhoto,
  type AspectPresetKey,
  type CropRect,
  type ImageTransformState,
} from "@/lib/images";

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

const WALL_ASPECT_PRESETS: { key: AspectPresetKey; label: string }[] = [
  { key: "4:3", label: "4:3" },
  { key: "1:1", label: "1:1" },
  { key: "16:9", label: "16:9" },
  { key: "original", label: "Original" },
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function resolveAspectRatio(
  mode: "avatar" | "wall",
  aspectKey: AspectPresetKey,
  imgSize: { width: number; height: number } | null
): number {
  if (mode === "avatar") return 1;
  switch (aspectKey) {
    case "1:1":
      return 1;
    case "16:9":
      return 16 / 9;
    case "original":
      if (imgSize && imgSize.width > 0 && imgSize.height > 0) {
        return imgSize.width / imgSize.height;
      }
      return 4 / 3;
    case "4:3":
    default:
      return 4 / 3;
  }
}

export interface ImageCropResult {
  dataUrl: string;
  transform: ImageTransformState;
}

export function ImageCropModal({
  mode,
  source,
  initialTransform,
  defaultAspectKey = "4:3",
  accentColor = "#E8622C",
  queueInfo,
  onCancel,
  onApply,
}: {
  mode: "avatar" | "wall";
  source: File | string;
  initialTransform?: ImageTransformState;
  defaultAspectKey?: AspectPresetKey;
  accentColor?: string;
  queueInfo?: {
    current: number;
    total: number;
    onAutoFitRest?: () => void;
  };
  onCancel: () => void;
  onApply: (result: ImageCropResult) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imgSize, setImgSize] = useState<{ width: number; height: number } | null>(
    null
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);

  const [aspectKey, setAspectKey] = useState<AspectPresetKey>(
    mode === "avatar" ? "1:1" : initialTransform?.aspectKey || defaultAspectKey
  );
  const [zoom, setZoom] = useState<number>(
    clamp(initialTransform?.zoom ?? 1, MIN_ZOOM, MAX_ZOOM)
  );
  const [pan, setPan] = useState<{ x: number; y: number }>({
    x: initialTransform?.panX ?? 0,
    y: initialTransform?.panY ?? 0,
  });

  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState<{ width: number; height: number }>({
    width: 340,
    height: 300,
  });

  // Active pointers for drag-to-pan and two-finger pinch-to-zoom
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const dragStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    panX: number;
    panY: number;
  } | null>(null);
  const pinchStartRef = useRef<{
    distance: number;
    zoom: number;
  } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset transform when the source image changes (e.g., stepping through a queue)
  useEffect(() => {
    setImgSize(null);
    setLoadError(null);
    setAspectKey(
      mode === "avatar" ? "1:1" : initialTransform?.aspectKey || defaultAspectKey
    );
    setZoom(clamp(initialTransform?.zoom ?? 1, MIN_ZOOM, MAX_ZOOM));
    setPan({
      x: initialTransform?.panX ?? 0,
      y: initialTransform?.panY ?? 0,
    });
  }, [source, mode, defaultAspectKey, initialTransform]);

  // Create & clean up preview object URL for File sources
  useEffect(() => {
    if (source instanceof File) {
      const url = URL.createObjectURL(source);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewUrl(source);
  }, [source]);

  // Observe stage container dimensions
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setStageSize({ width: rect.width, height: rect.height });
      }
    };
    update();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => ro.disconnect();
    }
  }, [mounted]);

  const aspect = useMemo(
    () => resolveAspectRatio(mode, aspectKey, imgSize),
    [mode, aspectKey, imgSize]
  );

  // Compute the crop frame rectangle inside the stage
  const frame = useMemo(() => {
    const pad = 22;
    const availW = Math.max(120, stageSize.width - pad * 2);
    const availH = Math.max(120, stageSize.height - pad * 2);
    if (availW / availH > aspect) {
      const height = availH;
      const width = height * aspect;
      return { width, height };
    }
    const width = availW;
    const height = width / aspect;
    return { width, height };
  }, [stageSize, aspect]);

  // Compute display scale and pan bounds so the image always covers the frame
  const metrics = useMemo(() => {
    if (!imgSize || imgSize.width <= 0 || imgSize.height <= 0) {
      return null;
    }
    const baseScale = Math.max(
      frame.width / imgSize.width,
      frame.height / imgSize.height
    );
    const displayScale = baseScale * zoom;
    const displayW = imgSize.width * displayScale;
    const displayH = imgSize.height * displayScale;
    const maxOffsetX = Math.max(0, (displayW - frame.width) / 2);
    const maxOffsetY = Math.max(0, (displayH - frame.height) / 2);
    const offsetX = clamp(pan.x * frame.width, -maxOffsetX, maxOffsetX);
    const offsetY = clamp(pan.y * frame.height, -maxOffsetY, maxOffsetY);
    return {
      baseScale,
      displayScale,
      displayW,
      displayH,
      maxOffsetX,
      maxOffsetY,
      offsetX,
      offsetY,
    };
  }, [imgSize, frame, zoom, pan]);

  const clampNormalizedPan = useCallback(
    (
      nextPanX: number,
      nextPanY: number,
      targetZoom: number,
      targetAspectKey: AspectPresetKey = aspectKey
    ) => {
      if (!imgSize || imgSize.width <= 0 || imgSize.height <= 0) {
        return { x: 0, y: 0 };
      }
      const nextAspect = resolveAspectRatio(mode, targetAspectKey, imgSize);
      const pad = 22;
      const availW = Math.max(120, stageSize.width - pad * 2);
      const availH = Math.max(120, stageSize.height - pad * 2);
      const fW = availW / availH > nextAspect ? availH * nextAspect : availW;
      const fH = availW / availH > nextAspect ? availH : availW / nextAspect;

      const baseScale = Math.max(fW / imgSize.width, fH / imgSize.height);
      const displayScale = baseScale * targetZoom;
      const maxX = Math.max(0, (imgSize.width * displayScale - fW) / 2);
      const maxY = Math.max(0, (imgSize.height * displayScale - fH) / 2);

      const clampedPxX = clamp(nextPanX * fW, -maxX, maxX);
      const clampedPxY = clamp(nextPanY * fH, -maxY, maxY);
      return {
        x: fW > 0 ? clampedPxX / fW : 0,
        y: fH > 0 ? clampedPxY / fH : 0,
      };
    },
    [imgSize, mode, aspectKey, stageSize]
  );

  const updateZoom = useCallback(
    (nextZoomRaw: number) => {
      const nextZoom = clamp(nextZoomRaw, MIN_ZOOM, MAX_ZOOM);
      setZoom(nextZoom);
      setPan((prev) => clampNormalizedPan(prev.x, prev.y, nextZoom));
    },
    [clampNormalizedPan]
  );

  const handleAspectChange = (nextKey: AspectPresetKey) => {
    setAspectKey(nextKey);
    setPan((prev) => clampNormalizedPan(prev.x, prev.y, zoom, nextKey));
  };

  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Keyboard shortcuts (Escape to cancel, +/- to zoom, arrows to nudge)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        updateZoom(zoom + 0.15);
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        updateZoom(zoom - 0.15);
      } else if (
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowDown"
      ) {
        e.preventDefault();
        const step = 0.04;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        setPan((prev) => clampNormalizedPan(prev.x + dx, prev.y + dy, zoom));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel, updateZoom, zoom, clampNormalizedPan]);

  // Pointer handlers for drag & pinch
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!metrics) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setIsInteracting(true);

    if (pointersRef.current.size === 1) {
      dragStartRef.current = {
        pointerX: e.clientX,
        pointerY: e.clientY,
        panX: metrics.offsetX / frame.width,
        panY: metrics.offsetY / frame.height,
      };
      pinchStartRef.current = null;
    } else if (pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      pinchStartRef.current = { distance: Math.max(1, dist), zoom };
      dragStartRef.current = null;
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(e.pointerId) || !metrics) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2 && pinchStartRef.current) {
      const pts = Array.from(pointersRef.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const ratio = dist / pinchStartRef.current.distance;
      updateZoom(pinchStartRef.current.zoom * ratio);
      return;
    }

    if (pointersRef.current.size === 1 && dragStartRef.current) {
      const dx = e.clientX - dragStartRef.current.pointerX;
      const dy = e.clientY - dragStartRef.current.pointerY;
      const nextPanX = dragStartRef.current.panX + dx / frame.width;
      const nextPanY = dragStartRef.current.panY + dy / frame.height;
      setPan(clampNormalizedPan(nextPanX, nextPanY, zoom));
    }
  };

  const handlePointerUpOrCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size === 0) {
      dragStartRef.current = null;
      pinchStartRef.current = null;
      setIsInteracting(false);
    } else if (pointersRef.current.size === 1 && metrics) {
      const [remaining] = Array.from(pointersRef.current.values());
      dragStartRef.current = {
        pointerX: remaining.x,
        pointerY: remaining.y,
        panX: metrics.offsetX / frame.width,
        panY: metrics.offsetY / frame.height,
      };
      pinchStartRef.current = null;
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.002;
    updateZoom(zoom + delta);
  };

  async function handleApply() {
    if (!imgSize || !metrics || applying) return;
    setApplying(true);
    setLoadError(null);
    try {
      const sWidth = frame.width / metrics.displayScale;
      const sHeight = frame.height / metrics.displayScale;
      const sx = (imgSize.width - sWidth) / 2 - metrics.offsetX / metrics.displayScale;
      const sy = (imgSize.height - sHeight) / 2 - metrics.offsetY / metrics.displayScale;

      const cropRect: CropRect = { sx, sy, sWidth, sHeight };
      const dataUrl =
        mode === "avatar"
          ? await compressAvatarImage(source, cropRect)
          : await compressWallPhoto(source, cropRect);

      onApply({
        dataUrl,
        transform: {
          zoom,
          panX: metrics.offsetX / frame.width,
          panY: metrics.offsetY / frame.height,
          aspectKey: mode === "avatar" ? "1:1" : aspectKey,
        },
      });
    } catch (err) {
      setLoadError(
        err instanceof Error
          ? err.message
          : "Could not process this photo. Please try another image."
      );
    } finally {
      setApplying(false);
    }
  }

  if (!mounted) return null;

  const isQueued = Boolean(queueInfo && queueInfo.total > 1);
  const hasMoreInQueue = Boolean(
    queueInfo && queueInfo.current < queueInfo.total
  );

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={mode === "avatar" ? "Adjust profile photo" : "Adjust photo"}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20, 17, 14, 0.72)",
        backdropFilter: "blur(4px)",
        zIndex: 300,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 440,
          background: "#FFF9F0",
          borderRadius: 24,
          border: "1px solid #EFE4D2",
          boxShadow: "0 20px 50px rgba(20, 17, 14, 0.35)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "14px 18px 10px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "'Baloo 2', sans-serif",
                fontSize: 18,
                fontWeight: 700,
                color: "#2B2622",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {mode === "avatar" ? "Frame Profile Photo" : "Frame Photo"}
              {isQueued && queueInfo && (
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    fontFamily: "inherit",
                    background: "#FCE9DF",
                    color: "#B24A1D",
                    borderRadius: 999,
                    padding: "2px 9px",
                  }}
                >
                  {queueInfo.current} of {queueInfo.total}
                </span>
              )}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "#8A7F70",
                display: "flex",
                alignItems: "center",
                gap: 5,
                marginTop: 1,
              }}
            >
              <Move size={12} /> Drag to position · Zoom to fit frame
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close photo editor"
            style={{
              background: "#F5EFE3",
              border: "none",
              borderRadius: "50%",
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "#2B2622",
              flexShrink: 0,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Interactive Crop Stage */}
        <div style={{ padding: "0 16px" }}>
          <div
            ref={stageRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUpOrCancel}
            onPointerCancel={handlePointerUpOrCancel}
            onWheel={handleWheel}
            style={{
              position: "relative",
              width: "100%",
              height: 300,
              borderRadius: 18,
              overflow: "hidden",
              background: "#1C1815",
              touchAction: "none",
              userSelect: "none",
              cursor: isInteracting ? "grabbing" : "grab",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {previewUrl && (
              <img
                src={previewUrl}
                alt="Crop preview"
                draggable={false}
                onLoad={(e) => {
                  const img = e.currentTarget;
                  setImgSize({
                    width: img.naturalWidth || img.width,
                    height: img.naturalHeight || img.height,
                  });
                }}
                onError={() => {
                  setLoadError(
                    "Could not read this image format. Please try a JPEG, PNG, or WebP photo."
                  );
                }}
                style={
                  metrics
                    ? {
                        position: "absolute",
                        left: "50%",
                        top: "50%",
                        width: metrics.displayW,
                        height: metrics.displayH,
                        maxWidth: "none",
                        maxHeight: "none",
                        transform: `translate(calc(-50% + ${metrics.offsetX}px), calc(-50% + ${metrics.offsetY}px))`,
                        pointerEvents: "none",
                        userSelect: "none",
                      }
                    : {
                        opacity: 0,
                        position: "absolute",
                        pointerEvents: "none",
                      }
                }
              />
            )}

            {/* Frame Aperture Mask */}
            <div
              style={{
                position: "relative",
                width: frame.width,
                height: frame.height,
                borderRadius: mode === "avatar" ? "50%" : 12,
                boxShadow: "0 0 0 9999px rgba(20, 17, 14, 0.62)",
                border:
                  mode === "avatar"
                    ? `2.5px solid ${accentColor}`
                    : "2px solid rgba(255, 255, 255, 0.92)",
                pointerEvents: "none",
                overflow: "hidden",
                transition: isInteracting ? "none" : "width 0.15s ease, height 0.15s ease",
              }}
            >
              {/* Subtle rule-of-thirds guides while interacting */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  opacity: isInteracting ? 0.55 : 0.18,
                  transition: "opacity 0.15s ease",
                  backgroundImage:
                    "linear-gradient(to right, rgba(255,255,255,0.65) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.65) 1px, transparent 1px)",
                  backgroundSize: "33.333% 33.333%",
                  backgroundPosition: "-1px -1px",
                }}
              />
            </div>

            {!imgSize && !loadError && (
              <div
                style={{
                  position: "absolute",
                  color: "#FFF9F0",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Loading photo…
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        <div style={{ padding: "14px 18px 18px" }}>
          {/* Aspect Ratio Presets for Family Wall photos */}
          {mode === "wall" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 6,
                marginBottom: 12,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: "#6B6259" }}>
                Frame
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                {WALL_ASPECT_PRESETS.map((preset) => {
                  const active = aspectKey === preset.key;
                  return (
                    <button
                      key={preset.key}
                      type="button"
                      onClick={() => handleAspectChange(preset.key)}
                      aria-pressed={active}
                      style={{
                        border: `1.5px solid ${active ? "#E8622C" : "#EFE4D2"}`,
                        background: active ? "#FCE9DF" : "#fff",
                        color: active ? "#B24A1D" : "#6B6259",
                        borderRadius: 999,
                        padding: "5px 10px",
                        fontSize: 11.5,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Zoom Slider Row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "#fff",
              border: "1px solid #EFE4D2",
              borderRadius: 14,
              padding: "8px 10px",
            }}
          >
            <button
              type="button"
              onClick={() => updateZoom(zoom - 0.2)}
              disabled={zoom <= MIN_ZOOM}
              aria-label="Zoom out"
              style={{
                background: "#F7F0E4",
                border: "none",
                borderRadius: 8,
                width: 28,
                height: 28,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: zoom <= MIN_ZOOM ? "default" : "pointer",
                color: "#2B2622",
                opacity: zoom <= MIN_ZOOM ? 0.45 : 1,
                flexShrink: 0,
              }}
            >
              <ZoomOut size={15} />
            </button>

            <input
              type="range"
              aria-label="Zoom level"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              onChange={(e) => updateZoom(parseFloat(e.target.value))}
              style={{
                flex: 1,
                accentColor: "#E8622C",
                cursor: "pointer",
              }}
            />

            <button
              type="button"
              onClick={() => updateZoom(zoom + 0.2)}
              disabled={zoom >= MAX_ZOOM}
              aria-label="Zoom in"
              style={{
                background: "#F7F0E4",
                border: "none",
                borderRadius: 8,
                width: 28,
                height: 28,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: zoom >= MAX_ZOOM ? "default" : "pointer",
                color: "#2B2622",
                opacity: zoom >= MAX_ZOOM ? 0.45 : 1,
                flexShrink: 0,
              }}
            >
              <ZoomIn size={15} />
            </button>

            <span
              style={{
                fontSize: 11.5,
                fontWeight: 700,
                color: "#6B6259",
                minWidth: 34,
                textAlign: "right",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {zoom.toFixed(1)}×
            </span>

            <button
              type="button"
              onClick={handleReset}
              disabled={zoom === 1 && pan.x === 0 && pan.y === 0}
              title="Reset zoom and position"
              aria-label="Reset zoom and position"
              style={{
                background: "none",
                border: "1px solid #EFE4D2",
                borderRadius: 8,
                width: 28,
                height: 28,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor:
                  zoom === 1 && pan.x === 0 && pan.y === 0 ? "default" : "pointer",
                color: "#6B6259",
                opacity: zoom === 1 && pan.x === 0 && pan.y === 0 ? 0.4 : 1,
                flexShrink: 0,
              }}
            >
              <RotateCcw size={13} />
            </button>
          </div>

          {loadError && (
            <div
              role="alert"
              style={{
                marginTop: 10,
                background: "#FCE9DF",
                border: "1px solid #F2C4AF",
                color: "#B23A1D",
                borderRadius: 10,
                padding: "8px 10px",
                fontSize: 12.5,
                fontWeight: 600,
              }}
            >
              {loadError}
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button
              type="button"
              onClick={onCancel}
              disabled={applying}
              style={{
                border: "1.5px solid #EFE4D2",
                background: "#fff",
                color: "#6B6259",
                borderRadius: 14,
                padding: "11px 14px",
                fontSize: 13.5,
                fontWeight: 700,
                cursor: applying ? "default" : "pointer",
              }}
            >
              Cancel
            </button>

            {hasMoreInQueue && queueInfo?.onAutoFitRest && (
              <button
                type="button"
                onClick={queueInfo.onAutoFitRest}
                disabled={applying}
                style={{
                  border: "1.5px solid #EFE4D2",
                  background: "#FFFDF9",
                  color: "#2B2622",
                  borderRadius: 14,
                  padding: "11px 12px",
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: applying ? "default" : "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Auto-fit rest
              </button>
            )}

            <button
              type="button"
              onClick={handleApply}
              disabled={applying || !imgSize || Boolean(loadError)}
              style={{
                flex: 1,
                border: "none",
                background: "#E8622C",
                color: "#fff",
                borderRadius: 14,
                padding: "11px 16px",
                fontSize: 14,
                fontWeight: 700,
                cursor: applying || !imgSize ? "default" : "pointer",
                opacity: applying || !imgSize || loadError ? 0.65 : 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <Check size={16} />
              {applying
                ? "Saving..."
                : hasMoreInQueue
                  ? "Apply & Next"
                  : "Apply"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
