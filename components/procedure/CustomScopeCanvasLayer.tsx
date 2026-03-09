"use client";

/**
 * CustomScopeCanvasLayer — v5
 *
 * Two modes:
 *   A) ACTIVE SCOPE mode  → full black mask, center grid, D-pad pan controls
 *   B) DRAWING / EDITING mode → interactive handles, resize, keyboard nudge
 *
 * NEW: In ACTIVE SCOPE mode, the grid lines + D-pad are HIDDEN by default.
 *      Press '0' to toggle them on/off. Press '0' again to hide.
 */

import React, { useState, useRef, useEffect, useCallback, RefObject } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useScopeStore, ScopeGeometry } from "@/lib/store/scope.store";
import { Check, Move, MousePointer2, RefreshCcw, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, X, Crosshair } from "lucide-react";

interface VideoRect { x: number; y: number; w: number; h: number; }

function computeVideoRect(cW: number, cH: number, vW: number, vH: number, fit: 'contain' | 'cover'): VideoRect {
    if (!vW || !vH || !cW || !cH) return { x: 0, y: 0, w: cW, h: cH };
    const cA = cW / cH, vA = vW / vH;
    if (fit === 'contain') {
        if (cA > vA) {
            const h = cH, w = h * vA;
            return { x: (cW - w) / 2, y: 0, w, h };
        } else {
            const w = cW, h = w / vA;
            return { x: 0, y: (cH - h) / 2, w, h };
        }
    } else {
        // cover
        if (cA > vA) {
            const w = cW, h = w / vA;
            return { x: 0, y: (cH - h) / 2, w, h };
        } else {
            const h = cH, w = h * vA;
            return { x: (cW - w) / 2, y: 0, w, h };
        }
    }
}

type DragMode = 'none' | 'draw' | 'move' | 'resize-nw' | 'resize-ne' | 'resize-sw' | 'resize-se';

interface Props {
    videoRef: RefObject<HTMLVideoElement | null>;
    aspectRatioCorrection?: '16:9' | '4:3 (Stretch Thin)' | '4:3 (Squeeze Wide)' | '1:1';
}

export function CustomScopeCanvasLayer({ videoRef, aspectRatioCorrection = '16:9' }: Props) {
    const {
        scopes, activeScopeId, addScope, drawingShape, setDrawingShape,
        panX, panY, setPanOffset, resetPan, setActiveScopeId,
        setDrawnGeometry: setGlobalDrawnGeometry
    } = useScopeStore();
    const activeScope = scopes.find(s => s.id === activeScopeId);

    const containerRef = useRef<HTMLDivElement>(null);
    const videoRectRef = useRef<VideoRect>({ x: 0, y: 0, w: 1, h: 1 });
    const [videoRect, setVideoRect] = useState<VideoRect>({ x: 0, y: 0, w: 1, h: 1 });
    const [containerSize, setContainerSize] = useState({ w: 1, h: 1 });

    // ─── NEW: Adjustment UI toggle (grid + D-pad) — off by default ───
    const [adjustmentVisible, setAdjustmentVisible] = useState(false);

    // ─── Track video render rect ───
    useEffect(() => {
        const update = () => {
            const el = containerRef.current;
            const vid = videoRef.current;
            if (!el) return;

            // Compute arcX
            let arcX = 1;
            if (aspectRatioCorrection === '4:3 (Stretch Thin)') arcX = 1.333;
            else if (aspectRatioCorrection === '4:3 (Squeeze Wide)') arcX = 0.75;
            else if (aspectRatioCorrection === '1:1') arcX = 0.5625;

            const vw = vid?.videoWidth || 16;
            const vh = vid?.videoHeight || 9;
            // Use corrected native aspect ratio
            const correctedVW = vw * arcX;

            const shape = drawingShapeRef.current || useScopeStore.getState().scopes.find(s => s.id === useScopeStore.getState().activeScopeId)?.shape;
            const fit = (shape === 'circle') ? 'cover' : 'contain';
            const r = computeVideoRect(el.clientWidth, el.clientHeight, correctedVW, vh, fit);
            videoRectRef.current = r;
            setVideoRect({ ...r });
            setContainerSize({ w: el.clientWidth, h: el.clientHeight });
        };
        update();
        const ro = new ResizeObserver(update);
        if (containerRef.current) ro.observe(containerRef.current);
        const vid = videoRef.current;
        vid?.addEventListener('loadedmetadata', update);
        vid?.addEventListener('resize', update);
        return () => { ro.disconnect(); vid?.removeEventListener('loadedmetadata', update); vid?.removeEventListener('resize', update); };
    }, [videoRef, activeScopeId, drawingShape, aspectRatioCorrection]);

    // ─── Drawing state (all in refs to avoid stale closures) ───
    const dragModeRef = useRef<DragMode>('none');
    const startMouseRef = useRef({ x: 0, y: 0 });
    const startGeoRef = useRef<ScopeGeometry | null>(null);
    const drawingShapeRef = useRef(drawingShape);
    useEffect(() => { drawingShapeRef.current = drawingShape; }, [drawingShape]);

    const [drawnGeometry, setDrawnGeometry] = useState<ScopeGeometry | null>(null);
    const [previewGeometry, setPreviewGeometry] = useState<ScopeGeometry | null>(null);
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [scopeName, setScopeName] = useState("");
    const [viewLabel, setViewLabel] = useState("");
    const [setAsDefault, setSetAsDefault] = useState(false);
    const [dragForRender, setDragForRender] = useState<DragMode>('none');

    const drawnGeoRef = useRef<ScopeGeometry | null>(null);
    useEffect(() => {
        drawnGeoRef.current = drawnGeometry;
        setGlobalDrawnGeometry(drawnGeometry);
    }, [drawnGeometry, setGlobalDrawnGeometry]);

    // ─── Helpers ───
    const getVideoNorm = useCallback((clientX: number, clientY: number) => {
        const el = containerRef.current;
        if (!el) return { x: 0.5, y: 0.5 };
        const rect = el.getBoundingClientRect();
        const vr = videoRectRef.current;
        return {
            x: Math.max(0, Math.min(1, (clientX - rect.left - vr.x) / vr.w)),
            y: Math.max(0, Math.min(1, (clientY - rect.top - vr.y) / vr.h)),
        };
    }, []);

    const getEventPos = useCallback((e: MouseEvent | TouchEvent) => {
        if ('touches' in e && e.touches.length > 0) return getVideoNorm(e.touches[0].clientX, e.touches[0].clientY);
        if ('changedTouches' in e && (e as TouchEvent).changedTouches.length > 0) return getVideoNorm((e as TouchEvent).changedTouches[0].clientX, (e as TouchEvent).changedTouches[0].clientY);
        return getVideoNorm((e as MouseEvent).clientX, (e as MouseEvent).clientY);
    }, [getVideoNorm]);

    const snapToCircle = useCallback((dx: number, dy: number): number => {
        const vr = videoRectRef.current;
        const pxSize = Math.min(Math.abs(dx) * vr.w, Math.abs(dy) * vr.h);
        return pxSize / Math.min(vr.w, vr.h);
    }, []);

    // ─── Pointer down ───
    const beginDrag = useCallback((clientX: number, clientY: number, mode: DragMode) => {
        if (!drawingShapeRef.current) return;
        const pos = getVideoNorm(clientX, clientY);
        dragModeRef.current = mode;
        startMouseRef.current = pos;
        startGeoRef.current = drawnGeoRef.current;
        setDragForRender(mode);
    }, [getVideoNorm]);

    // ─── Global mouse/touch events ───
    useEffect(() => {
        const onMove = (e: MouseEvent | TouchEvent) => {
            const mode = dragModeRef.current;
            if (mode === 'none') return;
            const pos = getEventPos(e);
            const start = startMouseRef.current;
            const dx = pos.x - start.x, dy = pos.y - start.y;
            const vr = videoRectRef.current;
            const shape = drawingShapeRef.current;

            if (mode === 'draw') {
                const minX = Math.min(start.x, pos.x), minY = Math.min(start.y, pos.y);
                let geo: ScopeGeometry;
                const r = snapToCircle(dx, dy);
                geo = { x: minX + Math.abs(dx) / 2, y: minY + Math.abs(dy) / 2, width: r, height: r };
                setPreviewGeometry(geo);
                return;
            }

            const sg = startGeoRef.current;
            if (!sg) return;
            let { x, y, width, height } = { ...sg };

            if (mode === 'move') {
                x = Math.max(0, Math.min(1, x + dx));
                y = Math.max(0, Math.min(1, y + dy));
            } else {
                const dPx = Math.hypot(dx * vr.w, dy * vr.h);
                const sign = (mode === 'resize-se' || mode === 'resize-ne') ? (dx >= 0 ? 1 : -1) : (dx <= 0 ? 1 : -1);
                const newR = Math.max(0.02, sg.width + sign * dPx / Math.min(vr.w, vr.h));
                width = newR; height = newR;
            }

            const updated: ScopeGeometry = { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)), width: Math.max(0.01, width), height: Math.max(0.01, height) };
            drawnGeoRef.current = updated;
            setDrawnGeometry(updated);
        };

        const onUp = (e: MouseEvent | TouchEvent) => {
            const mode = dragModeRef.current;
            if (mode === 'none') return;
            if (mode === 'draw') {
                const pos = getEventPos(e);
                const start = startMouseRef.current;
                const dx = pos.x - start.x, dy = pos.y - start.y;
                const shape = drawingShapeRef.current;
                const minX = Math.min(start.x, pos.x), minY = Math.min(start.y, pos.y);
                const pxSize = Math.max(Math.abs(dx) * videoRectRef.current.w, Math.abs(dy) * videoRectRef.current.h);
                setPreviewGeometry(null);
                if (pxSize > 10) {
                    const r = snapToCircle(dx, dy);
                    const geo: ScopeGeometry = { x: minX + Math.abs(dx) / 2, y: minY + Math.abs(dy) / 2, width: r, height: r };
                    drawnGeoRef.current = geo;
                    setDrawnGeometry(geo);
                }
            }
            dragModeRef.current = 'none';
            setDragForRender('none');
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        window.addEventListener('touchmove', onMove, { passive: false });
        window.addEventListener('touchend', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            window.removeEventListener('touchmove', onMove);
            window.removeEventListener('touchend', onUp);
        };
    }, [getEventPos, snapToCircle]);

    // ─── Keyboard ───
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (showSaveModal) return;
            const isDrawing = !!drawingShapeRef.current;

            // ── '0' key: toggle adjustment UI (grid + D-pad) in active scope mode ──
            if (e.key === '0' && !isDrawing && activeScopeId) {
                e.preventDefault();
                setAdjustmentVisible(prev => !prev);
                return;
            }

            if (isDrawing) {
                if (e.key === 'Escape') { drawnGeoRef.current = null; setDrawnGeometry(null); setDrawingShape(null); return; }
                if (e.key === 'Enter' && drawnGeoRef.current) { setShowSaveModal(true); return; }

                if ((e.key === 'o' || e.key === 'O') && drawnGeoRef.current) {
                    e.preventDefault();
                    const geo = { ...drawnGeoRef.current, x: 0.5, y: 0.5 };
                    drawnGeoRef.current = geo;
                    setDrawnGeometry(geo);
                    return;
                }

                if (!drawnGeoRef.current) return;
                const step = e.shiftKey ? 0.01 : 0.002;
                const geo = { ...drawnGeoRef.current };
                let changed = false;
                if (e.key === 'ArrowUp') { geo.y = Math.max(0, geo.y - step); changed = true; }
                if (e.key === 'ArrowDown') { geo.y = Math.min(1, geo.y + step); changed = true; }
                if (e.key === 'ArrowLeft') { geo.x = Math.max(0, geo.x - step); changed = true; }
                if (e.key === 'ArrowRight') { geo.x = Math.min(1, geo.x + step); changed = true; }
                const sh = drawingShapeRef.current;
                if (e.key === '=' || e.key === '+') { geo.width = Math.min(1, geo.width + step); geo.height = geo.width; changed = true; }
                if (e.key === '-') { geo.width = Math.max(0.01, geo.width - step); geo.height = geo.width; changed = true; }
                if (changed) { e.preventDefault(); drawnGeoRef.current = geo; setDrawnGeometry(geo); }
            } else if (activeScopeId && adjustmentVisible) {
                // Arrow keys only work for pan when adjustment UI is visible
                const step = e.shiftKey ? 4 : 1.5;
                let nx = panX, ny = panY;
                const PAN_MAX = 25;
                if (e.key === 'ArrowUp') { ny = Math.max(-PAN_MAX, panY - step); e.preventDefault(); }
                if (e.key === 'ArrowDown') { ny = Math.min(PAN_MAX, panY + step); e.preventDefault(); }
                if (e.key === 'ArrowLeft') { nx = Math.max(-PAN_MAX, panX - step); e.preventDefault(); }
                if (e.key === 'ArrowRight') { nx = Math.min(PAN_MAX, panX + step); e.preventDefault(); }
                if (nx !== panX || ny !== panY) setPanOffset(nx, ny);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [showSaveModal, activeScopeId, panX, panY, setPanOffset, setDrawingShape, adjustmentVisible]);

    // ─── Reset adjustment visibility when scope deactivated ───
    useEffect(() => {
        if (!activeScopeId) setAdjustmentVisible(false);
    }, [activeScopeId]);

    // ─── Pan with D-pad buttons ───
    const pan = useCallback((dx: number, dy: number) => {
        const PAN_MAX = 25;
        const store = useScopeStore.getState();
        setPanOffset(
            Math.max(-PAN_MAX, Math.min(PAN_MAX, store.panX + dx)),
            Math.max(-PAN_MAX, Math.min(PAN_MAX, store.panY + dy))
        );
    }, [setPanOffset]);

    // ─── Save ───
    const handleSave = () => {
        const geo = drawnGeoRef.current, shape = drawingShapeRef.current;
        if (!scopeName.trim() || !shape || !geo) return;
        addScope({ name: scopeName.trim(), viewLabel: viewLabel.trim() || undefined, shape, isDefault: setAsDefault, geometry: geo });
        setScopeName(""); setViewLabel(""); setSetAsDefault(false);
        drawnGeoRef.current = null; setDrawnGeometry(null); setShowSaveModal(false); setDrawingShape(null);
    };
    const handleCancel = () => {
        drawnGeoRef.current = null; setDrawnGeometry(null); setShowSaveModal(false); setDrawingShape(null);
    };

    // ─── Geo → pixel coords ───
    const vr = videoRect;
    const shape = drawingShape || activeScope?.shape;

    const toContainerPx = useCallback((geo: ScopeGeometry) => {
        const isEditing = !!drawingShapeRef.current;
        const contW = containerSize.w;
        const contH = containerSize.h;

        // If we are NOT editing, the video component (CameraFeed) is applying
        // a transform to "fill" the scope into the container.
        // We must mirror that by centering the mask hole.
        if (!isEditing && activeScopeId) {
            const rVal = (geo.width * Math.min(contW, contH)) / 2;
            const fillScale = Math.min(contW / (rVal * 2), contH / (rVal * 2));

            // In active view, the "hole" is always centered because 
            // the video is transformed to center that specific geo.
            return {
                cx: contW / 2,
                cy: contH / 2,
                rx: rVal * fillScale,
                ry: rVal * fillScale
            };
        }

        const cx = vr.x + geo.x * vr.w;
        const cy = vr.y + geo.y * vr.h;
        let rx: number, ry: number;
        const sh = drawingShapeRef.current || activeScope?.shape;
        if (sh === 'circle') {
            rx = ry = geo.width * Math.min(contW, contH) / 2;
        } else if (sh === 'square') {
            rx = ry = geo.width * Math.min(vr.w, vr.h) / 2;
        } else {
            rx = geo.width * vr.w / 2;
            ry = geo.height * vr.h / 2;
        }
        return { cx, cy, rx, ry };
    }, [vr, activeScope?.shape, activeScopeId, containerSize]);

    const geo = dragForRender === 'draw' ? previewGeometry : (drawnGeometry ?? (drawingShape ? null : activeScope?.geometry ?? null));
    const isDrawingMode = !!drawingShape;
    const hasShape = !!drawnGeometry;
    const hasActiveScope = !!activeScopeId && !!activeScope && !isDrawingMode;
    const maskId = "scope-mask-v5";

    // ─── Resize handles ───
    const renderHandles = () => {
        if (!drawnGeometry || showSaveModal || !drawingShape) return null;
        const { cx, cy, rx, ry } = toContainerPx(drawnGeometry);
        return (
            <div className="absolute inset-0 pointer-events-none z-50">
                <div style={{ left: cx, top: cy, transform: 'translate(-50%, -50%)', cursor: 'move' }}
                    className="absolute w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center pointer-events-auto shadow-[0_0_20px_rgba(79,70,229,0.6)] border-2 border-white/20 hover:scale-110 active:scale-95 transition-transform"
                    onMouseDown={e => { e.stopPropagation(); beginDrag(e.clientX, e.clientY, 'move'); }}
                    onTouchStart={e => { e.stopPropagation(); beginDrag(e.touches[0].clientX, e.touches[0].clientY, 'move'); }}>
                    <Move size={20} className="text-white" />
                </div>
                {([
                    { px: cx - rx, py: cy - ry, m: 'resize-nw', cur: 'nwse-resize' },
                    { px: cx + rx, py: cy - ry, m: 'resize-ne', cur: 'nesw-resize' },
                    { px: cx - rx, py: cy + ry, m: 'resize-sw', cur: 'nesw-resize' },
                    { px: cx + rx, py: cy + ry, m: 'resize-se', cur: 'nwse-resize' },
                ] as const).map((h, i) => (
                    <div key={i} style={{ left: h.px, top: h.py, cursor: h.cur, transform: 'translate(-50%, -50%)' }}
                        className="absolute w-10 h-10 flex items-center justify-center pointer-events-auto group"
                        onMouseDown={e => { e.stopPropagation(); beginDrag(e.clientX, e.clientY, h.m as DragMode); }}
                        onTouchStart={e => { e.stopPropagation(); beginDrag(e.touches[0].clientX, e.touches[0].clientY, h.m as DragMode); }}>
                        <div className="w-5 h-5 bg-white border-2 border-indigo-600 rounded-lg shadow-lg group-hover:scale-125 transition-transform flex items-center justify-center">
                            <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full" />
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    // ─── D-Pad: only rendered when adjustmentVisible is true ───
    const renderDPad = () => {
        if (!hasActiveScope || isDrawingMode || !adjustmentVisible) return null;
        const STEP = 2;
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="absolute right-6 bottom-28 z-50 flex flex-col items-center gap-1 select-none"
            >
                {/* Center home */}
                <button onClick={resetPan} title="Center (reset pan)"
                    className="w-9 h-9 mb-1 rounded-xl bg-black/60 border border-white/10 flex items-center justify-center text-indigo-400 hover:text-white hover:bg-indigo-600 active:scale-90 transition-all shadow-lg"
                >
                    <Crosshair size={16} />
                </button>
                {/* Up */}
                <button onMouseDown={() => pan(0, -STEP)} onTouchStart={() => pan(0, -STEP)}
                    className="w-9 h-9 rounded-xl bg-black/60 border border-white/10 flex items-center justify-center text-white hover:bg-white/20 active:scale-90 transition-all">
                    <ChevronUp size={18} />
                </button>
                <div className="flex gap-1">
                    <button onMouseDown={() => pan(-STEP, 0)} onTouchStart={() => pan(-STEP, 0)}
                        className="w-9 h-9 rounded-xl bg-black/60 border border-white/10 flex items-center justify-center text-white hover:bg-white/20 active:scale-90 transition-all">
                        <ChevronLeft size={18} />
                    </button>
                    <div className="w-9 h-9 rounded-xl bg-black/30 border border-white/5 flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-white/20" />
                    </div>
                    <button onMouseDown={() => pan(STEP, 0)} onTouchStart={() => pan(STEP, 0)}
                        className="w-9 h-9 rounded-xl bg-black/60 border border-white/10 flex items-center justify-center text-white hover:bg-white/20 active:scale-90 transition-all">
                        <ChevronRight size={18} />
                    </button>
                </div>
                <button onMouseDown={() => pan(0, STEP)} onTouchStart={() => pan(0, STEP)}
                    className="w-9 h-9 rounded-xl bg-black/60 border border-white/10 flex items-center justify-center text-white hover:bg-white/20 active:scale-90 transition-all">
                    <ChevronDown size={18} />
                </button>

                {(panX !== 0 || panY !== 0) && (
                    <div className="mt-1 px-2 py-1 rounded-lg bg-black/60 border border-white/10 text-[9px] text-indigo-300 font-mono text-center">
                        {panX > 0 ? '+' : ''}{panX.toFixed(0)}, {panY > 0 ? '+' : ''}{panY.toFixed(0)}
                    </div>
                )}
            </motion.div>
        );
    };

    return (
        <div
            ref={containerRef}
            className="absolute inset-0 z-40 overflow-hidden"
            onMouseDown={e => {
                if (!drawnGeometry && drawingShape && !showSaveModal) {
                    e.stopPropagation();
                    beginDrag(e.clientX, e.clientY, 'draw');
                }
            }}
            onTouchStart={e => {
                if (!drawnGeometry && drawingShape && !showSaveModal) {
                    e.stopPropagation();
                    beginDrag(e.touches[0].clientX, e.touches[0].clientY, 'draw');
                }
            }}
            style={{ touchAction: isDrawingMode ? 'none' : 'auto', cursor: isDrawingMode && !hasShape ? 'crosshair' : 'default' }}
        >
            {/* SVG: full-container mask + conditional grid */}
            <svg width="100%" height="100%" className="absolute inset-0 pointer-events-none">
                <defs>
                    <mask id={maskId}>
                        <rect width="100%" height="100%" fill="white" />
                        {geo && shape && (() => {
                            const { cx, cy, rx, ry } = toContainerPx(geo);
                            return shape === 'circle'
                                ? <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="black" />
                                : <rect x={cx - rx} y={cy - ry} width={rx * 2} height={ry * 2} fill="black" />;
                        })()}
                    </mask>
                </defs>

                <rect width="100%" height="100%"
                    fill={hasActiveScope ? "rgb(0,0,0)" : "rgba(0,0,0,0.72)"}
                    mask={`url(#${maskId})`}
                />

                {geo && shape && (() => {
                    const { cx, cy, rx, ry } = toContainerPx(geo);

                    // In active scope mode, only draw grid/border when adjustmentVisible is true
                    // In drawing mode, always show grid
                    const showGrid = isDrawingMode || adjustmentVisible;

                    return (
                        <g>
                            {/* Grid lines — only when drawing OR adjustment is toggled on */}
                            {showGrid && (
                                <g opacity={isDrawingMode ? "0.4" : "0.25"}>
                                    <line x1={cx - rx} y1={cy} x2={cx + rx} y2={cy}
                                        stroke={isDrawingMode ? "#818cf8" : "rgba(255,255,255,0.5)"}
                                        strokeWidth="0.8" strokeDasharray="4 4" />
                                    <line x1={cx} y1={cy - ry} x2={cx} y2={cy + ry}
                                        stroke={isDrawingMode ? "#818cf8" : "rgba(255,255,255,0.5)"}
                                        strokeWidth="0.8" strokeDasharray="4 4" />
                                    {isDrawingMode && (<>
                                        <line x1="0" y1={cy} x2="100%" y2={cy} stroke="#818cf8" strokeWidth="0.5" strokeDasharray="4 8" />
                                        <line x1={cx} y1="0" x2={cx} y2="100%" stroke="#818cf8" strokeWidth="0.5" strokeDasharray="4 8" />
                                    </>)}
                                </g>
                            )}

                            {/* Shape border — only when drawing OR adjustment is toggled on */}
                            {showGrid && (
                                shape === 'circle'
                                    ? <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none"
                                        stroke={isDrawingMode ? "#818cf8" : "rgba(255,255,255,0.15)"}
                                        strokeWidth={isDrawingMode ? "2.5" : "1.5"}
                                        strokeDasharray={isDrawingMode ? "8 4" : undefined} />
                                    : <rect x={cx - rx} y={cy - ry} width={rx * 2} height={ry * 2} fill="none"
                                        stroke={isDrawingMode ? "#818cf8" : "rgba(255,255,255,0.15)"}
                                        strokeWidth={isDrawingMode ? "2.5" : "1.5"}
                                        strokeDasharray={isDrawingMode ? "8 4" : undefined} />
                            )}

                            {/* Center dot — only when adjustment is visible */}
                            {showGrid && (
                                <circle cx={cx} cy={cy} r="4"
                                    fill={isDrawingMode ? "#818cf8" : "rgba(255,255,255,0.3)"}
                                    opacity={isDrawingMode ? "1" : "0.5"} />
                            )}
                        </g>
                    );
                })()}
            </svg>

            {renderHandles()}

            {/* D-pad wrapped in AnimatePresence for smooth transition */}
            <AnimatePresence>
                {adjustmentVisible && renderDPad()}
            </AnimatePresence>

            {/* '0' key hint — only visible when adjustment is ON */}

            {/* Adjustment active indicator */}
            <AnimatePresence>
                {hasActiveScope && adjustmentVisible && !isDrawingMode && (
                    <motion.div
                        key="adj-active"
                        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                        className="absolute top-4 left-1/2 -translate-x-1/2 z-10 pointer-events-none px-4 py-1.5 rounded-2xl bg-indigo-600/20 backdrop-blur-lg border border-indigo-500/30 flex items-center gap-2"
                    >
                        <Crosshair size={12} className="text-indigo-400" />
                        <span className="text-[9px] font-bold text-indigo-300 uppercase tracking-widest">
                            Adjustment · Press <kbd className="text-[8px] font-black bg-indigo-500/30 border border-indigo-500/40 px-1 py-0.5 rounded">0</kbd> to hide
                            {(panX !== 0 || panY !== 0) && <>&nbsp;·&nbsp;Pan {panX > 0 ? '→' : panX < 0 ? '←' : ''}{panY > 0 ? '↓' : panY < 0 ? '↑' : ''}</>}
                        </span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Drawing instruction */}
            <AnimatePresence>
                {isDrawingMode && !hasShape && dragForRender === 'none' && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                        className="absolute bottom-10 left-1/2 -translate-x-1/2 px-6 py-4 rounded-3xl bg-indigo-600 text-white shadow-2xl pointer-events-none border border-white/20 flex items-center gap-4"
                    >
                        <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center animate-bounce">
                            <MousePointer2 size={20} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[12px] font-black uppercase tracking-widest">Draw a {drawingShape}</span>
                            <span className="text-[10px] text-white/70 mt-1 uppercase tracking-wider">Click & drag on the live feed</span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Hint bar (drawing edit mode) */}
            <AnimatePresence>
                {hasShape && !showSaveModal && dragForRender === 'none' && isDrawingMode && (
                    <motion.div
                        initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
                        className="absolute top-6 left-1/2 -translate-x-1/2 z-10 pointer-events-none px-4 py-2 rounded-2xl bg-black/50 backdrop-blur-lg border border-white/10 flex items-center gap-2"
                    >
                        <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Adjustment</span>
                        <div className="w-px h-3 bg-white/10" />
                        <span className="text-[9px] text-zinc-400 uppercase tracking-wider">Arrows · + / − · Enter to save · Esc to reset</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Action bar (edit mode) */}
            <AnimatePresence>
                {hasShape && !showSaveModal && isDrawingMode && (
                    <motion.div
                        initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30 }}
                        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-black/90 backdrop-blur-2xl p-3 rounded-[28px] border border-white/10 shadow-2xl z-[60]"
                    >
                        <button onClick={() => { drawnGeoRef.current = null; setDrawnGeometry(null); }}
                            className="h-12 px-5 rounded-2xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white font-bold uppercase tracking-widest text-[10px] flex items-center gap-2 transition-all">
                            <RefreshCcw size={14} /> Redraw
                        </button>
                        <div className="h-6 w-px bg-white/10" />
                        <button onClick={() => {
                            if (!drawnGeoRef.current) return;
                            const geo = { ...drawnGeoRef.current, x: 0.5, y: 0.5 };
                            drawnGeoRef.current = geo;
                            setDrawnGeometry(geo);
                        }} className="h-12 px-5 rounded-2xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 font-bold uppercase tracking-widest text-[10px] flex items-center gap-2 transition-all">
                            <Crosshair size={14} /> Center
                        </button>
                        <div className="h-6 w-px bg-white/10" />
                        <button onClick={handleCancel} className="h-12 px-5 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-bold uppercase tracking-widest text-[10px] transition-all">Cancel</button>
                        <button onClick={() => setShowSaveModal(true)} className="h-12 px-7 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest text-[11px] flex items-center gap-2 shadow-lg shadow-indigo-500/20 active:scale-95 transition-all">
                            <Check size={16} /> Save Scope
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Active scope exit button — only visible when adjustment is ON */}
            <AnimatePresence>
                {hasActiveScope && !isDrawingMode && adjustmentVisible && (
                    <motion.button
                        initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                        onClick={() => { setActiveScopeId(null); resetPan(); setAdjustmentVisible(false); }}
                        className="absolute top-4 left-1/2 -translate-x-1/2 z-50 w-10 h-10 rounded-full bg-black/70 border border-white/20 flex items-center justify-center text-white hover:bg-white/20 active:scale-90 transition-all shadow-xl backdrop-blur-md"
                        title="Deactivate scope"
                    >
                        <X size={18} />
                    </motion.button>
                )}
            </AnimatePresence>

            {/* Save Modal */}
            <AnimatePresence>
                {showSaveModal && (
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-md z-[100] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
                            className="w-full max-w-sm bg-zinc-900 border border-white/10 shadow-2xl rounded-[36px] overflow-hidden"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="p-6 border-b border-white/5">
                                <h3 className="text-base font-black text-white">Save Scope</h3>
                                <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">Persisted to catalog</p>
                            </div>
                            <div className="p-6 space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Name <span className="text-rose-400">*</span></label>
                                    <input type="text" value={scopeName} onChange={e => setScopeName(e.target.value)} placeholder="e.g. Right Colon View" autoFocus
                                        className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-zinc-700" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Degree / Label (optional)</label>
                                    <input type="text" value={viewLabel} onChange={e => setViewLabel(e.target.value)} placeholder="e.g. 70°"
                                        className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-zinc-700" />
                                </div>
                                <label className="flex items-center gap-3 p-3 rounded-xl bg-white/5 cursor-pointer border border-white/5 hover:border-white/10 transition-colors">
                                    <input type="checkbox" checked={setAsDefault} onChange={e => setSetAsDefault(e.target.checked)} className="w-4 h-4 rounded appearance-none border border-white/20 checked:bg-indigo-500 outline-none" />
                                    <span className="text-[11px] font-bold text-white uppercase tracking-widest">Set as default</span>
                                </label>
                            </div>
                            <div className="p-6 border-t border-white/5 flex gap-3">
                                <button onClick={() => setShowSaveModal(false)} className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 font-bold text-white uppercase tracking-widest text-[10px] transition-colors">Back</button>
                                <button onClick={handleSave} disabled={!scopeName.trim()} className="flex-[2] py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold text-white uppercase tracking-widest text-[10px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">Save Scope</button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}