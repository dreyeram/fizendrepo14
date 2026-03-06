"use client";

// =============================================================================
//  SurgicalCameraStream.tsx  ·  SIMPLIFIED v4.0
//
//  MAJOR SIMPLIFICATION from v3.1:
//    - REMOVED WebGL2 shaders (Pi GPU can't handle them reliably)
//    - REMOVED ImageDecoder / createImageBitmap JS pipeline
//    - REPLACED with native <img> MJPEG stream (browser handles decode)
//    - KEPT: calibration overlay, capture via /capture, recording via /record
//    - KEPT: zoom, pan, scope shape, grid, frozen frame
//
//  The primary camera feed is now in a separate popup window (CameraFeedPopup).
//  This component serves as the in-page viewfinder for scope overlay & capture.
// =============================================================================

import React, {
    useRef, useEffect, useCallback, useState, useMemo,
    forwardRef, useImperativeHandle
} from "react";
import { Maximize2, Move, MousePointer2 } from "lucide-react";
import { motion } from "framer-motion";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface CameraStreamHandle {
    getCanvas: () => HTMLCanvasElement | null;
    captureFrame: () => Promise<string | null>;
    startRecording: () => Promise<boolean>;
    stopRecording: () => Promise<string | null>;
    getStatus: () => StreamStatus;
    getLiveCanvas: () => HTMLCanvasElement | null;
}

export type StreamStatus =
    "connecting" | "connected" | "disconnected" | "error" | "fallback" | "streaming";

export interface WhiteBalance { r: number; g: number; b: number; }

export interface SurgicalCameraStreamProps {
    wsUrl?: string;
    deviceId?: string;
    resolution?: '720p' | '1080p' | '4K';
    mirrored?: boolean;
    zoom?: number;
    hardwareZoom?: boolean;
    captureArea?: { x: number; y: number; width: number; height: number };
    showGrid?: boolean;
    gridColor?: string;
    frozenFrame?: string | null;
    showLivePip?: boolean;
    overlayCircle?: { size: number; visible: boolean };
    maskSize?: number;
    scopeScale?: number;
    isCalibrating?: boolean;
    onCalibrationChange?: (area: { x: number; y: number; width: number; height: number }) => void;
    onStatusChange?: (status: StreamStatus) => void;
    onFpsUpdate?: (fps: number) => void;
    onResolutionChange?: (w: number, h: number) => void;
    aspectRatioCorrection?: '16:9' | '4:3 (Stretch Thin)' | '4:3 (Squeeze Wide)' | '1:1';
    className?: string;
    activeShape?: 'circle' | 'rectangle';
    enhancement?: boolean;
    whiteBalance?: WhiteBalance;
    sharpening?: number;
}

type DragMode =
    'none' | 'draw' | 'move' | 'pan' |
    'resize-nw' | 'resize-ne' | 'resize-sw' | 'resize-se' |
    'resize-n' | 'resize-s' | 'resize-e' | 'resize-w';

// =============================================================================
//  COMPONENT
// =============================================================================
const SurgicalCameraStream = forwardRef<CameraStreamHandle, SurgicalCameraStreamProps>(
    function SurgicalCameraStream(
        {
            wsUrl: _wsUrl,
            deviceId,
            resolution = '1080p',
            mirrored = false,
            zoom = 1,
            hardwareZoom = false,
            captureArea,
            scopeScale = 1,
            showGrid = false,
            gridColor = 'white',
            frozenFrame,
            showLivePip = false,
            overlayCircle,
            maskSize = 100,
            isCalibrating = false,
            onCalibrationChange,
            onStatusChange,
            onFpsUpdate,
            onResolutionChange,
            aspectRatioCorrection = '16:9',
            className = '',
            activeShape = 'rectangle',
            enhancement = true,
            whiteBalance = { r: 1.0, g: 1.0, b: 1.0 },
            sharpening = 0.35,
        },
        ref
    ) {
        // ── DOM refs ──────────────────────────────────────────────────────────
        const wrapperRef = useRef<HTMLDivElement>(null);
        const containerRef = useRef<HTMLDivElement>(null);
        const imgRef = useRef<HTMLImageElement>(null);
        const canvasRef = useRef<HTMLCanvasElement | null>(null);
        const videoRef = useRef<HTMLVideoElement>(null);
        const mediaRecorderRef = useRef<MediaRecorder | null>(null);
        const recordedChunksRef = useRef<Blob[]>([]);

        // ── React state ───────────────────────────────────────────────────────
        const [status, setStatus] = useState<StreamStatus>('connecting');
        const [hasFrame, setHasFrame] = useState(false);
        const [wrapperSize, setWrapperSize] = useState({ w: 0, h: 0 });
        const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
        const [dragMode, setDragMode] = useState<DragMode>('none');
        const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
        const [dragStartArea, setDragStartArea] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
        const [dragStartPan, setDragStartPan] = useState<{ x: number; y: number } | null>(null);
        const [useDaemon, setUseDaemon] = useState(false);
        const [displayFps, setDisplayFps] = useState(0);

        useEffect(() => { onStatusChange?.(status); }, [status, onStatusChange]);

        // ── Wrapper size ──────────────────────────────────────────────────────
        useEffect(() => {
            const el = wrapperRef.current;
            if (!el) return;
            const ro = new ResizeObserver((entries) => {
                for (const e of entries) {
                    const { width, height } = e.contentRect;
                    setWrapperSize({ w: Math.round(width), h: Math.round(height) });
                }
            });
            ro.observe(el);
            const r = el.getBoundingClientRect();
            setWrapperSize({ w: Math.round(r.width), h: Math.round(r.height) });
            return () => ro.disconnect();
        }, []);

        // ── Daemon detection ──────────────────────────────────────────────────
        useEffect(() => {
            if (typeof window === 'undefined') return;
            let mediaStream: MediaStream | null = null;
            let active = true;

            const init = async () => {
                const host = window.location.hostname || 'localhost';
                const MAX = 15, GRACE = 3;
                let seen = false;

                for (let i = 1; i <= MAX; i++) {
                    if (!active) return;
                    try {
                        const r = await fetch(`http://${host}:5555/status`, { signal: AbortSignal.timeout(2000) });
                        if (r.ok) {
                            seen = true;
                            const d = await r.json();
                            if (d.status === 'streaming' || d.status === 'waiting') {
                                console.log(`[Camera] Daemon ${d.status} (${d.mode ?? '?'}) — using native MJPEG <img>`);
                                if (active) { setUseDaemon(true); setStatus('connected'); }
                                return;
                            }
                        }
                    } catch {
                        if (!seen && i >= GRACE) { console.log('[Camera] No daemon — WebRTC fallback'); break; }
                        console.log(`[Camera] Daemon attempt ${i}/${MAX}...`);
                    }
                    if (i < MAX && active) await new Promise(r => setTimeout(r, 1500));
                }

                if (seen && active) { setUseDaemon(true); setStatus('connected'); return; }

                // WebRTC fallback for local development
                try {
                    if (!navigator.mediaDevices?.getUserMedia) { if (active) setStatus('fallback'); return; }
                    mediaStream = await navigator.mediaDevices.getUserMedia({
                        video: { deviceId: deviceId ? { exact: deviceId } : undefined, width: { ideal: 1920 }, height: { ideal: 1080 } },
                    });
                    if (active && videoRef.current) { videoRef.current.srcObject = mediaStream; setStatus('streaming'); }
                } catch (e) {
                    console.error('[Camera] WebRTC failed:', e);
                    if (active) setStatus('fallback');
                }
            };

            init();
            return () => { active = false; mediaStream?.getTracks().forEach(t => t.stop()); };
        }, [deviceId, resolution]);

        // ── Native <img> MJPEG stream setup ───────────────────────────────────
        useEffect(() => {
            if (!useDaemon) return;
            const img = imgRef.current;
            if (!img) return;

            const host = window.location.hostname || 'localhost';

            const onLoad = () => {
                if (!hasFrame) {
                    setHasFrame(true);
                    setStatus('connected');
                    console.log('[Stream] ✓ First frame via native <img> MJPEG — zero-processing live');
                }
            };

            const onError = () => {
                console.warn('[Stream] <img> stream error — retrying in 2s');
                setTimeout(() => {
                    if (imgRef.current) {
                        imgRef.current.src = `http://${host}:5555/stream?t=${Date.now()}`;
                    }
                }, 2000);
            };

            img.addEventListener('load', onLoad);
            img.addEventListener('error', onError);

            // Start the stream
            img.src = `http://${host}:5555/stream`;

            return () => {
                img.removeEventListener('load', onLoad);
                img.removeEventListener('error', onError);
                img.src = '';
            };
        }, [useDaemon, hasFrame]);

        // ── Daemon FPS + resolution polling ───────────────────────────────────
        useEffect(() => {
            if (!useDaemon) return;
            const host = window.location.hostname || 'localhost';
            const poll = async () => {
                try {
                    const r = await fetch(`http://${host}:5555/status`, { signal: AbortSignal.timeout(1500) });
                    if (!r.ok) return;
                    const d = await r.json();
                    if (typeof d.fps === 'number') {
                        setDisplayFps(d.fps);
                        onFpsUpdate?.(d.fps);
                    }
                    if (typeof d.resolution === 'string') {
                        const p = d.resolution.split('x').map(Number);
                        if (p.length === 2 && !isNaN(p[0])) onResolutionChange?.(p[0], p[1]);
                    }
                } catch { }
            };
            poll();
            const t = setInterval(poll, 2000);
            return () => clearInterval(t);
        }, [useDaemon, onFpsUpdate, onResolutionChange]);

        // ── Arrow key calibration ─────────────────────────────────────────────
        useEffect(() => {
            if (!isCalibrating || !captureArea) return;
            const onKey = (e: KeyboardEvent) => {
                const step = e.shiftKey ? 0.01 : 0.002;
                let dx = 0, dy = 0;
                if (e.key === 'ArrowLeft') dx = -step;
                else if (e.key === 'ArrowRight') dx = step;
                else if (e.key === 'ArrowUp') dy = -step;
                else if (e.key === 'ArrowDown') dy = step;
                if (dx || dy) {
                    e.preventDefault();
                    onCalibrationChange?.({ ...captureArea, x: Math.max(0, Math.min(1, captureArea.x + dx)), y: Math.max(0, Math.min(1, captureArea.y + dy)) });
                }
            };
            window.addEventListener('keydown', onKey);
            return () => window.removeEventListener('keydown', onKey);
        }, [isCalibrating, captureArea, onCalibrationChange]);

        // ── Container style ───────────────────────────────────────────────────
        const containerStyle = useMemo((): React.CSSProperties => {
            let cw = wrapperSize.w, ch = cw * 9 / 16;
            if (ch > wrapperSize.h) { ch = wrapperSize.h; cw = ch * 16 / 9; }
            const isCircle = activeShape === 'circle' && !isCalibrating && captureArea && captureArea.width > 0;
            if (isCircle) { const d = Math.min(wrapperSize.w, wrapperSize.h); ch = d; cw = d * 16 / 9; }
            const ez = hardwareZoom ? 1 : zoom;
            const xf: string[] = ['translate(-50%,-50%)'];
            if (panOffset.x !== 0 || panOffset.y !== 0) xf.push(`translate(${panOffset.x}px,${panOffset.y}px)`);
            if (ez > 1) xf.push(`scale(${ez})`);
            if (scopeScale !== 1) xf.push(`scale(${scopeScale})`);
            return {
                overflow: 'hidden', position: 'absolute' as const,
                left: '50%', top: '50%',
                width: cw > 0 ? `${cw}px` : '100%',
                height: ch > 0 ? `${ch}px` : '100%',
                transform: xf.join(' '), transformOrigin: 'center center',
                ...(isCircle ? { clipPath: `circle(${Math.floor(ch / 2)}px at 50% 50%)`, borderRadius: '50%' } : {}),
            };
        }, [wrapperSize, hardwareZoom, zoom, panOffset, scopeScale, activeShape, isCalibrating, captureArea]);

        const videoInnerStyle = useMemo((): React.CSSProperties => {
            const base: React.CSSProperties = { position: 'absolute', top: '50%', left: '50%', width: '100%', height: '100%', transformOrigin: 'center center', objectFit: 'contain' };
            if (isCalibrating || !captureArea || captureArea.width === 0) return { ...base, transform: 'translate(-50%,-50%)' };
            const s = 1 / captureArea.width, sx = (0.5 - captureArea.x) * 100, sy = (0.5 - captureArea.y) * 100;
            let cx = 1;
            if (aspectRatioCorrection === '4:3 (Stretch Thin)') cx = 1.333;
            else if (aspectRatioCorrection === '4:3 (Squeeze Wide)') cx = 0.75;
            else if (aspectRatioCorrection === '1:1') cx = 0.5625;
            return { ...base, transform: `translate(-50%,-50%) scale(${s}) scaleX(${cx}) translate(${sx}%,${sy}%)` };
        }, [isCalibrating, captureArea, aspectRatioCorrection]);

        // ── Mouse helpers ─────────────────────────────────────────────────────
        const getVideoMetrics = () => {
            if (!containerRef.current) return null;
            const r = containerRef.current.getBoundingClientRect();
            return { width: r.width, height: r.height, containerRect: r };
        };

        const getNorm = (e: React.MouseEvent) => {
            const m = getVideoMetrics();
            if (!m) return { x: 0, y: 0 };
            return { x: Math.max(0, Math.min(1, (e.clientX - m.containerRect.left) / m.width)), y: Math.max(0, Math.min(1, (e.clientY - m.containerRect.top) / m.height)) };
        };

        const getContainer = (e: React.MouseEvent) => {
            if (!containerRef.current) return { x: 0, y: 0 };
            const r = containerRef.current.getBoundingClientRect();
            return { x: e.clientX - r.left, y: e.clientY - r.top };
        };

        const getHitZone = (e: React.MouseEvent): DragMode => {
            if (!captureArea || captureArea.width <= 0) return 'draw';
            const { x, y } = getNorm(e);
            const { x: ax, y: ay, width: aw, height: ah } = captureArea;
            const hs = 0.025;
            const l = ax - aw / 2, r = ax + aw / 2, t = ay - ah / 2, b = ay + ah / 2;
            if (Math.abs(x - l) < hs && Math.abs(y - t) < hs) return 'resize-nw';
            if (Math.abs(x - r) < hs && Math.abs(y - t) < hs) return 'resize-ne';
            if (Math.abs(x - l) < hs && Math.abs(y - b) < hs) return 'resize-sw';
            if (Math.abs(x - r) < hs && Math.abs(y - b) < hs) return 'resize-se';
            if (Math.abs(x - l) < hs && y > t && y < b) return 'resize-w';
            if (Math.abs(x - r) < hs && y > t && y < b) return 'resize-e';
            if (Math.abs(y - t) < hs && x > l && x < r) return 'resize-n';
            if (Math.abs(y - b) < hs && x > l && x < r) return 'resize-s';
            if (x > l && x < r && y > t && y < b) return 'move';
            return 'draw';
        };

        const cursorFor = (mode: DragMode) => {
            switch (mode) {
                case 'move': return 'grab';
                case 'resize-nw': case 'resize-se': return 'nwse-resize';
                case 'resize-ne': case 'resize-sw': return 'nesw-resize';
                case 'resize-n': case 'resize-s': return 'ns-resize';
                case 'resize-e': case 'resize-w': return 'ew-resize';
                case 'pan': return 'grabbing';
                default: return isCalibrating ? 'crosshair' : zoom > 1 ? 'grab' : 'default';
            }
        };

        const handleMouseDown = (e: React.MouseEvent) => {
            if (!containerRef.current) return;
            if (isCalibrating) {
                e.preventDefault();
                const c = getNorm(e), m = getHitZone(e);
                setDragMode(m); setDragStart(c); setDragStartArea(captureArea ? { ...captureArea } : null);
                if (m === 'draw') onCalibrationChange?.({ x: c.x, y: c.y, width: 0, height: 0 });
            } else if (zoom > 1) {
                e.preventDefault();
                setDragMode('pan'); setDragStart(getContainer(e)); setDragStartPan({ ...panOffset });
            }
        };

        const handleMouseMove = (e: React.MouseEvent) => {
            if (!containerRef.current) return;
            if (dragMode === 'none') {
                containerRef.current.style.cursor = cursorFor(isCalibrating ? getHitZone(e) : zoom > 1 ? 'move' : 'none');
                return;
            }
            if (!dragStart) return;
            e.preventDefault();

            if (dragMode === 'pan' && dragStartPan) {
                const c = getContainer(e);
                let nx = dragStartPan.x + c.x - dragStart.x, ny = dragStartPan.y + c.y - dragStart.y;
                if (zoom > 1 && containerRef.current) {
                    const r = containerRef.current.getBoundingClientRect();
                    nx = Math.max(-r.width * (zoom - 1) / 2, Math.min(r.width * (zoom - 1) / 2, nx));
                    ny = Math.max(-r.height * (zoom - 1) / 2, Math.min(r.height * (zoom - 1) / 2, ny));
                } else { nx = 0; ny = 0; }
                setPanOffset({ x: nx, y: ny }); return;
            }

            if (!isCalibrating || !onCalibrationChange) return;
            const curr = getNorm(e), dx = curr.x - dragStart.x, dy = curr.y - dragStart.y;

            if (dragMode === 'draw') {
                if (activeShape === 'circle') { const sz = Math.min(Math.max(Math.abs(dx), Math.abs(dy)) * 2, 1); onCalibrationChange({ x: dragStart.x, y: dragStart.y, width: sz, height: sz }); }
                else onCalibrationChange({ x: dragStart.x, y: dragStart.y, width: Math.min(Math.abs(dx) * 2, 1), height: Math.min(Math.abs(dy) * 2, 1) });
            } else if (dragMode === 'move' && dragStartArea) {
                const a = dragStartArea;
                onCalibrationChange({ x: Math.max(a.width / 2, Math.min(1 - a.width / 2, a.x + dx)), y: Math.max(a.height / 2, Math.min(1 - a.height / 2, a.y + dy)), width: a.width, height: a.height });
            } else if (dragMode.startsWith('resize') && dragStartArea) {
                const a = dragStartArea;
                let fw = a.width, fh = a.height, fx = a.x, fy = a.y;
                if (activeShape === 'circle') {
                    const d = Math.max(Math.abs(dx), Math.abs(dy));
                    let delta = d;
                    if ((dragMode.includes('e') && dx < 0) || (dragMode.includes('w') && dx > 0) || (dragMode.includes('s') && dy < 0) || (dragMode.includes('n') && dy > 0)) delta = -d;
                    const ns = Math.max(0.02, Math.min(1, a.width + delta)); fw = ns; fh = ns;
                } else {
                    if (dragMode.includes('e')) { fw = Math.max(0.01, a.width + dx); fx = a.x + (fw - a.width) / 2; }
                    else if (dragMode.includes('w')) { fw = Math.max(0.01, a.width - dx); fx = a.x - (fw - a.width) / 2; }
                    if (dragMode.includes('s')) { fh = Math.max(0.01, a.height + dy); fy = a.y + (fh - a.height) / 2; }
                    else if (dragMode.includes('n')) { fh = Math.max(0.01, a.height - dy); fy = a.y - (fh - a.height) / 2; }
                }
                onCalibrationChange({ x: Math.max(fw / 2, Math.min(1 - fw / 2, fx)), y: Math.max(fh / 2, Math.min(1 - fh / 2, fy)), width: fw, height: fh });
            }
        };

        const handleMouseUp = () => { setDragMode('none'); setDragStart(null); setDragStartArea(null); setDragStartPan(null); };

        useEffect(() => {
            if (zoom <= 1) { setPanOffset({ x: 0, y: 0 }); return; }
            if (containerRef.current) {
                const ez = hardwareZoom ? 1 : zoom;
                const r = containerRef.current.getBoundingClientRect();
                const mx = r.width * (ez - 1) / (2 * ez), my = r.height * (ez - 1) / (2 * ez);
                setPanOffset(p => ({ x: Math.max(-mx, Math.min(mx, p.x)), y: Math.max(-my, Math.min(my, p.y)) }));
            }
        }, [zoom, hardwareZoom]);

        // ── Hardware zoom via PTZ ──────────────────────────────────────────────
        useEffect(() => {
            if (!hardwareZoom) return;
            const host = window.location.hostname || 'localhost';
            fetch(`http://${host}:5555/ptz?zoom=${zoom}&pan=${panOffset.x}&tilt=${panOffset.y}`).catch(() => { });
        }, [hardwareZoom, zoom, panOffset]);

        // ── Capture ───────────────────────────────────────────────────────────
        const cropAndMask = useCallback((src: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement => {
            if (!captureArea || captureArea.width === 0) return src;
            const { x: ax, y: ay, width: aw, height: ah } = captureArea;
            let cx = 1;
            if (aspectRatioCorrection === '4:3 (Stretch Thin)') cx = 1.333;
            else if (aspectRatioCorrection === '4:3 (Squeeze Wide)') cx = 0.75;
            else if (aspectRatioCorrection === '1:1') cx = 0.5625;
            const px = ax * w, py = ay * h, pw = aw * w, ph = ah * h;
            const out = document.createElement('canvas'); out.width = pw; out.height = ph;
            const ctx = out.getContext('2d'); if (!ctx) return src;
            ctx.drawImage(src, px - pw / 2, py - ph / 2, pw, ph, 0, 0, pw, ph);
            if (activeShape === 'circle') {
                ctx.globalCompositeOperation = 'destination-in';
                ctx.beginPath(); ctx.arc(pw / 2, ph / 2, Math.min(pw, ph) / 2, 0, Math.PI * 2); ctx.fill();
                ctx.globalCompositeOperation = 'source-over';
            }
            return out;
        }, [captureArea, aspectRatioCorrection, activeShape]);

        const doCapture = useCallback(async (): Promise<string | null> => {
            // WebRTC mode: draw from video element
            if (status === 'streaming' && videoRef.current) {
                const c = document.createElement('canvas'); c.width = videoRef.current.videoWidth || 1920; c.height = videoRef.current.videoHeight || 1080;
                const ctx = c.getContext('2d'); if (ctx) ctx.drawImage(videoRef.current, 0, 0, c.width, c.height);
                return cropAndMask(c, c.width, c.height).toDataURL('image/png', 1.0);
            }
            // Daemon mode: use /capture endpoint for clean JPEG
            try {
                let baseUrl = `http://${window.location.hostname || 'localhost'}:5555`;
                if (_wsUrl) {
                    try { const u = new URL(_wsUrl); baseUrl = `http://${u.hostname}:${u.port || '80'}`; } catch { }
                }
                const res = await fetch(`${baseUrl}/capture`); if (!res.ok) return null;
                const blob = await res.blob(), blobUrl = URL.createObjectURL(blob);
                return await new Promise<string | null>((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => {
                        const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
                        const ctx = c.getContext('2d'); if (!ctx) { resolve(null); return; }
                        let cx = 1;
                        if (aspectRatioCorrection === '4:3 (Stretch Thin)') cx = 1.333;
                        else if (aspectRatioCorrection === '4:3 (Squeeze Wide)') cx = 0.75;
                        else if (aspectRatioCorrection === '1:1') cx = 0.5625;
                        if (cx !== 1) ctx.drawImage(img, 0, 0, img.naturalWidth * cx, img.naturalHeight);
                        else ctx.drawImage(img, 0, 0);
                        URL.revokeObjectURL(blobUrl);
                        resolve(cropAndMask(c, c.width * cx, c.height).toDataURL('image/png', 1.0));
                    };
                    img.onerror = () => { URL.revokeObjectURL(blobUrl); reject(new Error('img load failed')); };
                    img.src = blobUrl;
                });
            } catch (e) { console.error('[Capture]', e); return null; }
        }, [status, captureArea, aspectRatioCorrection, activeShape, cropAndMask, _wsUrl]);

        const startRecording = useCallback(async (): Promise<boolean> => {
            try {
                let baseUrl = `http://${window.location.hostname || 'localhost'}:5555`;
                if (_wsUrl) {
                    try { const u = new URL(_wsUrl); baseUrl = `http://${u.hostname}:${u.port || '80'}`; } catch { }
                }
                const r = await fetch(`${baseUrl}/record/start`).catch(() => null);
                if (r?.ok) return true;
            } catch { }
            if (status === 'streaming' && videoRef.current?.srcObject instanceof MediaStream) {
                try {
                    const rec = new MediaRecorder(videoRef.current.srcObject, { mimeType: 'video/webm' });
                    recordedChunksRef.current = [];
                    rec.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
                    rec.start(200); mediaRecorderRef.current = rec; return true;
                } catch { }
            }
            return false;
        }, [status, _wsUrl]);

        const stopRecording = useCallback(async (): Promise<string | null> => {
            try {
                let baseUrl = `http://${window.location.hostname || 'localhost'}:5555`;
                if (_wsUrl) {
                    try { const u = new URL(_wsUrl); baseUrl = `http://${u.hostname}:${u.port || '80'}`; } catch { }
                }
                const r = await fetch(`${baseUrl}/record/stop`).catch(() => null);
                if (r?.ok) { const d = await r.json(); return d.filename; }
            } catch { }
            if (mediaRecorderRef.current?.state !== 'inactive') {
                return new Promise<string | null>((resolve) => {
                    const rec = mediaRecorderRef.current!;
                    rec.onstop = () => { const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' }); recordedChunksRef.current = []; resolve(URL.createObjectURL(blob)); };
                    rec.stop();
                });
            }
            return null;
        }, [_wsUrl]);

        useImperativeHandle(ref, () => ({ getCanvas: () => null, captureFrame: doCapture, startRecording, stopRecording, getStatus: () => status, getLiveCanvas: () => canvasRef.current }));

        // ── Calibration overlay ───────────────────────────────────────────────
        const renderCalibrationOverlay = () => {
            if (!isCalibrating) return null;
            const area = captureArea, has = area && area.width > 0.01;
            const m = getVideoMetrics(); if (!m || m.containerRect.width <= 0) return null;
            const wP = has ? area!.width * 100 : 0, hP = has ? area!.height * 100 : 0;
            const cxP = has ? area!.x * 100 : 0, cyP = has ? area!.y * 100 : 0;
            const lP = cxP - wP / 2, tP = cyP - hP / 2;

            return (
                <div className="absolute inset-0 pointer-events-none z-[100]">
                    <div className="absolute top-4 left-4 flex items-center gap-3 px-4 py-2.5 bg-indigo-600/90 rounded-2xl shadow-2xl border border-indigo-400/30 backdrop-blur-sm pointer-events-auto z-10">
                        <Maximize2 size={14} className="text-white animate-pulse" />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white">Scope Calibration</span>
                        <div className="w-px h-4 bg-white/20" />
                        <span className="text-[10px] font-bold text-indigo-200 capitalize">{activeShape === 'circle' ? 'Circle' : 'Rectangle'}</span>
                    </div>
                    {!has && dragMode === 'none' && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="px-6 py-4 bg-black/60 backdrop-blur-md rounded-3xl border border-white/10 text-center z-10">
                                <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-3"><MousePointer2 size={20} className="text-white opacity-80" /></div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-white mb-1">Click &amp; Drag to Draw</p>
                                <p className="text-[9px] text-white/50">Draw around the scope lens area</p>
                            </div>
                        </div>
                    )}
                    {has && (
                        <svg width="100%" height="100%" className="absolute inset-0 pointer-events-none">
                            <defs><mask id="cal-mask"><rect width="100%" height="100%" fill="white" />
                                {activeShape === 'circle' ? <circle cx={`${cxP}%`} cy={`${cyP}%`} r={`${Math.min(wP, hP) / 2}%`} fill="black" />
                                    : <rect x={`${lP}%`} y={`${tP}%`} width={`${wP}%`} height={`${hP}%`} fill="black" />}
                            </mask></defs>
                            <rect width="100%" height="100%" fill="rgba(0,0,0,0.55)" mask="url(#cal-mask)" />
                            {activeShape === 'circle' ? <circle cx={`${cxP}%`} cy={`${cyP}%`} r={`${Math.min(wP, hP) / 2}%`} fill="none" stroke="white" strokeWidth="1.5" strokeDasharray="5 3" />
                                : <rect x={`${lP}%`} y={`${tP}%`} width={`${wP}%`} height={`${hP}%`} fill="none" stroke="white" strokeWidth="1.5" strokeDasharray="5 3" />}
                            <line x1="0%" y1={`${cyP}%`} x2="100%" y2={`${cyP}%`} stroke="white" strokeWidth="0.4" opacity="0.15" strokeDasharray="6 4" />
                            <line x1={`${cxP}%`} y1="0%" x2={`${cxP}%`} y2="100%" stroke="white" strokeWidth="0.4" opacity="0.15" strokeDasharray="6 4" />
                            <circle cx={`${cxP}%`} cy={`${cyP}%`} r="2.5" fill="white" opacity="0.6" />
                        </svg>
                    )}
                    {has && (
                        <>
                            <div className="absolute w-7 h-7 -ml-3.5 -mt-3.5 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center cursor-grab active:cursor-grabbing pointer-events-auto border border-white/30 backdrop-blur-md z-[40] shadow-lg transition-colors"
                                style={{ left: `${cxP}%`, top: `${cyP}%` }}
                                onMouseDown={(e) => { e.stopPropagation(); setDragMode('move'); setDragStart(getNorm(e)); setDragStartArea({ ...captureArea! }); }}>
                                <div className="p-1 rounded-md bg-indigo-500/80 shadow"><Move size={11} className="text-white" /></div>
                            </div>
                            {([{ l: lP, t: tP, m: 'resize-nw' }, { l: lP + wP, t: tP, m: 'resize-ne' }, { l: lP, t: tP + hP, m: 'resize-sw' }, { l: lP + wP, t: tP + hP, m: 'resize-se' }] as const).map((h, i) => (
                                <div key={`c${i}`} className="absolute w-6 h-6 -ml-3 -mt-3 flex items-center justify-center pointer-events-auto z-30 group"
                                    style={{ left: `${h.l}%`, top: `${h.t}%`, cursor: 'nwse-resize' }}
                                    onMouseDown={(e) => { e.stopPropagation(); setDragMode(h.m as DragMode); setDragStart(getNorm(e)); setDragStartArea({ ...captureArea! }); }}>
                                    <div className="w-3 h-3 bg-white border-2 border-indigo-600 rounded-full shadow-lg group-hover:scale-125 transition-transform" />
                                </div>
                            ))}
                            <div className="absolute bottom-4 right-4 flex items-center gap-4 px-4 py-2 bg-black/80 rounded-xl border border-white/10 backdrop-blur-md pointer-events-auto z-20">
                                <div><span className="text-[8px] font-black text-zinc-500 uppercase">Size</span><p className="text-[10px] font-mono font-bold text-white">{Math.round(area!.width * 100)}% × {Math.round(area!.height * 100)}%</p></div>
                                <div className="w-px h-6 bg-white/10" />
                                <div><span className="text-[8px] font-black text-zinc-500 uppercase">Pos</span><p className="text-[10px] font-mono font-bold text-zinc-400">({Math.round(area!.x * 100)}, {Math.round(area!.y * 100)})</p></div>
                            </div>
                        </>
                    )}
                </div>
            );
        };

        const renderZoomBadge = () => {
            const ez = hardwareZoom ? 1 : zoom;
            if (ez <= 1.05 || isCalibrating) return null;
            return (
                <div className="absolute top-6 right-6 z-[80] pointer-events-none">
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-2 px-2.5 py-1.5 bg-black/40 backdrop-blur-md border border-white/5 rounded-xl shadow-lg">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/80 animate-pulse" />
                        <span className="text-[9px] font-bold text-white/90 uppercase tracking-widest leading-none">{ez.toFixed(2)}x</span>
                    </motion.div>
                </div>
            );
        };

        const renderStatusBadge = () => {
            return (
                <div className="absolute top-6 left-6 z-[80] pointer-events-none">
                    <div className="flex items-center gap-2 px-2.5 py-1.5 bg-black/40 backdrop-blur-md border border-emerald-500/20 rounded-xl shadow-lg">
                        <div className={`w-1.5 h-1.5 rounded-full ${hasFrame ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
                        <div className="flex items-center gap-1.5 h-full">
                            <span className="text-[9px] font-bold text-emerald-300 uppercase tracking-widest leading-none">
                                {hasFrame ? 'Live' : 'Connecting'}
                                {displayFps > 0 && <span className="ml-2 text-white/50">{displayFps} FPS</span>}
                            </span>
                        </div>
                    </div>
                </div>
            );
        };

        // ── RENDER ────────────────────────────────────────────────────────────
        return (
            <div ref={wrapperRef} className={`relative w-full h-full bg-black overflow-hidden ${className}`}>
                <div
                    ref={containerRef}
                    onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
                    style={{ ...containerStyle, background: 'transparent' }}
                    className={`relative w-full h-full ${isCalibrating ? 'ring-2 ring-indigo-500/50' : ''}`}
                >
                    {/* PRIMARY: Native <img> MJPEG stream — browser handles decode */}
                    {useDaemon && (
                        <img
                            ref={imgRef}
                            alt="Camera Feed"
                            className="pointer-events-none absolute inset-0 w-full h-full"
                            style={{
                                display: hasFrame ? 'block' : 'none',
                                objectFit: 'contain',
                                transform: mirrored ? 'scaleX(-1)' : 'none',
                                imageRendering: 'auto',
                                zIndex: 10,
                                ...videoInnerStyle,
                            }}
                        />
                    )}
                    {/* FALLBACK: WebRTC getUserMedia */}
                    <video ref={videoRef} autoPlay playsInline muted
                        className="pointer-events-none absolute inset-0 w-full h-full z-0"
                        style={{ ...videoInnerStyle, display: status === 'streaming' ? 'block' : 'none' }}
                    />

                    {/* Loading state */}
                    {!hasFrame && status !== 'streaming' && (
                        <div className="absolute inset-0 flex items-center justify-center z-5">
                            <div className="flex flex-col items-center gap-3">
                                <div className="w-8 h-8 border-2 border-white/10 border-t-emerald-500 rounded-full animate-spin" />
                                <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Connecting to camera...</span>
                            </div>
                        </div>
                    )}

                    {frozenFrame && (
                        <div className="absolute inset-0 z-5 bg-black flex items-center justify-center">
                            <img src={frozenFrame} alt="Frozen"
                                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', transform: mirrored ? 'scaleX(-1)' : 'none' }} />
                        </div>
                    )}

                    <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-10"
                        style={{ ...videoInnerStyle, display: 'none' }} />

                    {showGrid && (
                        <div className="absolute inset-0 pointer-events-none z-10 opacity-30">
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-full bg-white/20" />
                            <div className="absolute top-1/2 left-0 -translate-y-1/2 w-full h-px bg-white/20" />
                            {[25, 50, 75].map(p => (
                                <div key={p} className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 aspect-square border rounded-full ${p === 50 ? 'border-cyan-500/30' : 'border-cyan-500/20'}`} style={{ height: `${p}%` }} />
                            ))}
                        </div>
                    )}

                    {overlayCircle?.visible && (
                        <div className="absolute inset-0 pointer-events-none z-20 flex items-center justify-center">
                            <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" className="absolute inset-0">
                                <circle cx="50" cy="50" r={overlayCircle.size / 2} fill="none" stroke="rgba(0,230,180,0.6)" strokeWidth="0.5" strokeDasharray="4 2" />
                                <line x1="48" y1="50" x2="52" y2="50" stroke="rgba(0,230,180,0.3)" strokeWidth="0.15" />
                                <line x1="50" y1="48" x2="50" y2="52" stroke="rgba(0,230,180,0.3)" strokeWidth="0.15" />
                            </svg>
                        </div>
                    )}

                    {renderCalibrationOverlay()}
                </div>
                {renderZoomBadge()}
                {renderStatusBadge()}
            </div>
        );
    }
);

export default SurgicalCameraStream;