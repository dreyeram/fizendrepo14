"use client";

import React, { useRef, useEffect, useCallback, useState, useMemo, forwardRef, useImperativeHandle } from "react";
import { Maximize2, Move, GripVertical, MousePointer2 } from "lucide-react";
import { motion } from "framer-motion";

// ══════════════════════════════════════════════════════════════════════
//  SurgicalCameraStream — Ultra-Low Latency MJPEG Surgical Video
//  Connects to camera_server.py on port 5000 (MJPEG over HTTP)
// ══════════════════════════════════════════════════════════════════════

export interface CameraStreamHandle {
    getCanvas: () => HTMLCanvasElement | null;
    captureFrame: () => Promise<string | null>;
    startRecording: () => Promise<boolean>;
    stopRecording: () => Promise<string | null>;
    getStatus: () => StreamStatus;
    getLiveCanvas: () => HTMLCanvasElement | null;
}

export type StreamStatus = "connecting" | "connected" | "disconnected" | "error" | "fallback" | "streaming";

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
}

type DragMode = 'none' | 'draw' | 'move' | 'pan' | 'resize-nw' | 'resize-ne' | 'resize-sw' | 'resize-se' | 'resize-n' | 'resize-s' | 'resize-e' | 'resize-w';

const SurgicalCameraStream = forwardRef<CameraStreamHandle, SurgicalCameraStreamProps>(
    function SurgicalCameraStream(
        {
            wsUrl,
            deviceId,
            resolution = '1080p',
            mirrored = false,
            zoom = 1,
            hardwareZoom = false,
            captureArea,
            scopeScale = 1,
            showGrid = false,
            gridColor = "white",
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
            className = "",
            activeShape = 'rectangle',
        },
        ref
    ) {
        // imgRef points to the MJPEG <img> element showing the live camera feed
        const imgRef = useRef<HTMLImageElement>(null);
        const canvasRef = useRef<HTMLCanvasElement | null>(null);

        // Recording refs
        const mediaRecorderRef = useRef<MediaRecorder | null>(null);
        const recordedChunksRef = useRef<Blob[]>([]);
        const containerRef = useRef<HTMLDivElement>(null);
        const wrapperRef = useRef<HTMLDivElement>(null);
        const [status, setStatus] = useState<StreamStatus>("connecting");
        const [imgStreamUrl, setImgStreamUrl] = useState<string>("");
        // Measured wrapper dimensions for pixel-perfect scope sizing
        const [wrapperSize, setWrapperSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

        // Calibration drag state
        const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
        const [dragMode, setDragMode] = useState<DragMode>('none');
        const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
        const [dragStartArea, setDragStartArea] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
        const [dragStartPan, setDragStartPan] = useState<{ x: number; y: number } | null>(null);

        // Notify parent of status
        useEffect(() => { onStatusChange?.(status); }, [status, onStatusChange]);

        // ═══════════════════════════════════════
        //  WRAPPER MEASUREMENT — ResizeObserver for pixel-perfect scope sizing
        //  CSS cannot reliably inscribe a square in a rectangle without JS.
        //  We measure the parent wrapper and compute exact pixel dimensions.
        // ═══════════════════════════════════════
        useEffect(() => {
            const el = wrapperRef.current;
            if (!el) return;
            const ro = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    const { width, height } = entry.contentRect;
                    setWrapperSize({ w: Math.round(width), h: Math.round(height) });
                }
            });
            ro.observe(el);
            // Initial measurement
            const rect = el.getBoundingClientRect();
            setWrapperSize({ w: Math.round(rect.width), h: Math.round(rect.height) });
            return () => ro.disconnect();
        }, []);

        // ═══════════════════════════════════════
        //  CAMERA INITIALIZATION — Pi Daemon First, WebRTC Fallback
        // ═══════════════════════════════════════
        const videoRef = useRef<HTMLVideoElement>(null);
        const [mjpegMode, setMjpegMode] = useState(false);
        const [mjpegHasFrame, setMjpegHasFrame] = useState(false);
        const mjpegImgRef = useRef<HTMLImageElement>(null);
        const mjpegCanvasRef = useRef<HTMLCanvasElement>(null);
        const mjpegRafRef = useRef<number | null>(null);

        useEffect(() => {
            if (typeof window === 'undefined') return;

            let stream: MediaStream | null = null;
            let isActive = true;

            async function initCamera() {
                const hostname = window.location.hostname || 'localhost';

                // Step 1: Try the Pi capture daemon on port 5555
                // Retry logic:
                //   - Allow INITIAL_GRACE_RETRIES (5 = 10s) for boot race (daemon not yet started)
                //   - If daemon is never seen after grace period → fall to WebRTC (laptop)
                //   - If daemon is seen at any point → keep retrying until 'streaming' or max
                //   - If daemon returns 'streaming' → activate MJPEG mode immediately
                const MAX_DAEMON_RETRIES = 30;
                const INITIAL_GRACE_RETRIES = 5; // 10s grace for Pi boot race
                let daemonExists = false;

                for (let attempt = 1; attempt <= MAX_DAEMON_RETRIES; attempt++) {
                    if (!isActive) return;
                    try {
                        const statusRes = await fetch(`http://${hostname}:5555/status`, {
                            signal: AbortSignal.timeout(2000)
                        });
                        if (statusRes.ok) {
                            daemonExists = true;
                            const data = await statusRes.json();
                            if (data.status === 'streaming') {
                                console.log(`[Camera] Pi daemon streaming (attempt ${attempt}) — MJPEG mode`);
                                if (isActive) {
                                    setMjpegMode(true);
                                    setStatus("connected");
                                }
                                return;
                            }
                            if (data.status === 'waiting') {
                                console.log(`[Camera] Pi daemon waiting for GStreamer (attempt ${attempt}/${MAX_DAEMON_RETRIES})...`);
                                // Daemon alive, GStreamer booting — activate MJPEG mode immediately
                                // The polling loop will handle waiting for frames
                                if (isActive) {
                                    setMjpegMode(true);
                                    setStatus("connected");
                                }
                                return;
                            }
                        }
                    } catch {
                        // Connection refused or timeout
                        if (!daemonExists && attempt >= INITIAL_GRACE_RETRIES) {
                            // No daemon found after grace period → probably a laptop
                            console.log(`[Camera] No Pi daemon after ${attempt} attempts — using WebRTC`);
                            break;
                        }
                        console.log(`[Camera] Pi daemon not available (attempt ${attempt}), retrying...`);
                    }
                    if (attempt < MAX_DAEMON_RETRIES && isActive) {
                        await new Promise(r => setTimeout(r, 2000));
                    }
                }

                // If daemon was ever seen, use MJPEG mode regardless
                if (daemonExists && isActive) {
                    console.log("[Camera] Pi daemon exists — activating MJPEG mode");
                    setMjpegMode(true);
                    setStatus("connected");
                    return;
                }

                // Step 2: Fall back to WebRTC (dev laptop with webcam)
                console.log("[Camera] Trying WebRTC fallback...");
                try {
                    if (!navigator.mediaDevices?.getUserMedia) {
                        console.log("[Camera] getUserMedia not available");
                        if (isActive) setStatus("fallback");
                        return;
                    }
                    const constraints = {
                        video: {
                            deviceId: deviceId ? { exact: deviceId } : undefined,
                            width: { ideal: 1920 },
                            height: { ideal: 1080 },
                            aspectRatio: { ideal: 1.7777777778 } // 16:9
                        }
                    };
                    stream = await navigator.mediaDevices.getUserMedia(constraints);
                    if (isActive && videoRef.current) {
                        videoRef.current.srcObject = stream;
                        setStatus("streaming");
                    }
                } catch (err) {
                    console.error("WebRTC camera failed:", err);
                    if (isActive) setStatus("fallback");
                }
            }

            initCamera();

            return () => {
                isActive = false;
                if (stream) {
                    stream.getTracks().forEach(track => track.stop());
                }
            };
        }, [deviceId, resolution]);

        // ═══════════════════════════════════════
        //  MJPEG Canvas Renderer — Zero-tearing live feed
        //  Off-screen Image consumes the MJPEG stream from the daemon.
        //  A rAF loop draws the current frame to a visible <canvas>.
        //  canvas.drawImage() goes through Chromium's GPU compositor
        //  which IS vsync'd — unlike <img> multipart/x-mixed-replace.
        // ═══════════════════════════════════════
        useEffect(() => {
            if (!mjpegMode) return;

            const hostname = window.location.hostname || 'localhost';
            const streamUrl = `http://${hostname}:5555/stream`;
            const cvs = mjpegCanvasRef.current;
            if (!cvs) return;

            const ctx = cvs.getContext('2d', { alpha: false });
            if (!ctx) return;

            // Off-screen image receives the MJPEG stream (hidden, never rendered)
            const offscreenImg = new Image();
            offscreenImg.crossOrigin = 'anonymous';
            let isActive = true;
            let hasReceivedFrame = false;
            let cw = 1920, ch = 1080;

            offscreenImg.onload = () => {
                if (!hasReceivedFrame) {
                    hasReceivedFrame = true;
                    // Set canvas resolution to match the stream
                    cvs!.width = offscreenImg.naturalWidth || 1920;
                    cvs!.height = offscreenImg.naturalHeight || 1080;
                    cw = cvs!.width;
                    ch = cvs!.height;
                    setMjpegHasFrame(true);
                    setStatus('connected');
                    console.log(`[Camera] MJPEG stream active: ${cw}x${ch}`);
                }
            };

            offscreenImg.onerror = () => {
                console.warn('[Camera] MJPEG stream error — reconnecting in 2s');
                setTimeout(() => {
                    if (isActive) offscreenImg.src = `${streamUrl}?t=${Date.now()}`;
                }, 2000);
            };

            // Start the stream
            offscreenImg.src = streamUrl;
            console.log(`[Camera] MJPEG stream connecting: ${streamUrl}`);

            // rAF draw loop — draws the off-screen image's current frame
            // to the visible canvas at the display's refresh rate.
            // canvas.drawImage() is composited by Chromium's GPU at vsync.
            function renderLoop() {
                if (!isActive || !ctx) return;
                if (offscreenImg.complete && offscreenImg.naturalWidth > 0) {
                    ctx.drawImage(offscreenImg, 0, 0, cw, ch);
                }
                mjpegRafRef.current = requestAnimationFrame(renderLoop);
            }
            mjpegRafRef.current = requestAnimationFrame(renderLoop);

            return () => {
                isActive = false;
                if (mjpegRafRef.current) cancelAnimationFrame(mjpegRafRef.current);
                offscreenImg.src = ''; // Close the stream connection
            };
        }, [mjpegMode]);

        // ═══════════════════════════════════════
        //  ARROW KEY CONTROLS — Sub-pixel calibration Accuracy
        // ═══════════════════════════════════════
        useEffect(() => {
            if (!isCalibrating || !captureArea) return;

            const handleKeyDown = (e: KeyboardEvent) => {
                const step = e.shiftKey ? 0.01 : 0.002;
                let dx = 0; let dy = 0;

                if (e.key === 'ArrowLeft') dx = -step;
                else if (e.key === 'ArrowRight') dx = step;
                else if (e.key === 'ArrowUp') dy = -step;
                else if (e.key === 'ArrowDown') dy = step;

                if (dx !== 0 || dy !== 0) {
                    e.preventDefault();
                    onCalibrationChange?.({
                        ...captureArea,
                        x: Math.max(0, Math.min(1, captureArea.x + dx)),
                        y: Math.max(0, Math.min(1, captureArea.y + dy))
                    });
                }
            };

            window.addEventListener('keydown', handleKeyDown);
            return () => window.removeEventListener('keydown', handleKeyDown);
        }, [isCalibrating, captureArea, onCalibrationChange]);


        // FRAME SCALE — Medical Scope Approach
        //
        // The entire scope frame SCALES LARGER on screen.
        // Container: absolute positioned, centered via translate(-50%,-50%)
        // then scale(zoom) applied. The frame GROWS beyond the viewport.
        // Parent: overflow:hidden clips the edges symmetrically.
        // Result: zero pixelation, frame grows outward, content stays sharp.

        // ═══════════════════════════════════════
        //  Container Style — Memoized for zero layout thrashing
        // ═══════════════════════════════════════
        const containerStyle = useMemo((): React.CSSProperties => {
            // Guarantee 16:9 exact ratio mapping inside the wrapper
            let cw = wrapperSize.w;
            let ch = cw * 9 / 16;

            if (ch > wrapperSize.h) {
                ch = wrapperSize.h;
                cw = ch * 16 / 9;
            }

            const isCircleScope = activeShape === 'circle' && !isCalibrating && captureArea && captureArea.width > 0;

            // For circle scope: expand container to use full wrapper height as circle diameter.
            // Container stays 16:9 (video fills without letterboxing), circle clips the edges.
            // The circle diameter = min(wrapper width, wrapper height) = biggest circle fitting the canvas.
            if (isCircleScope) {
                const circleDiameter = Math.min(wrapperSize.w, wrapperSize.h);
                ch = circleDiameter;
                cw = circleDiameter * 16 / 9; // 16:9 container at full height — may overflow width, circle clips it
            }

            const base: React.CSSProperties = {
                overflow: "hidden",
                position: "absolute" as const,
                left: "50%",
                top: "50%",
                width: cw > 0 ? `${cw}px` : "100%",
                height: ch > 0 ? `${ch}px` : "100%",
            };

            const effectiveZoom = hardwareZoom ? 1 : zoom;
            const transformParts: string[] = ["translate(-50%, -50%)"];

            if (panOffset.x !== 0 || panOffset.y !== 0) {
                transformParts.push(`translate(${panOffset.x}px, ${panOffset.y}px)`);
            }

            if (effectiveZoom > 1) {
                transformParts.push(`scale(${effectiveZoom})`);
            }

            if (scopeScale !== 1) {
                transformParts.push(`scale(${scopeScale})`);
            }

            return {
                ...base,
                transform: transformParts.join(" "),
                transformOrigin: "center center",
                ...(isCircleScope ? {
                    clipPath: `circle(${Math.floor(ch / 2)}px at 50% 50%)`,
                    borderRadius: "50%",
                } : {}),
            };
        }, [wrapperSize.w, wrapperSize.h, hardwareZoom, zoom, panOffset.x, panOffset.y, scopeScale, activeShape, isCalibrating, captureArea]);

        // ═══════════════════════════════════════
        //  Video Internal Style — Proper Scoping/Centering logic
        // ═══════════════════════════════════════
        const videoInnerStyle = useMemo((): React.CSSProperties => {
            const base: React.CSSProperties = {
                position: "absolute",
                top: "50%",
                left: "50%",
                width: "100%",
                height: "100%",
                transformOrigin: "center center",
                objectFit: "contain"
            };

            if (isCalibrating || !captureArea || captureArea.width === 0) {
                return { ...base, transform: "translate(-50%, -50%)" };
            }

            // Zoom the internal box purely via transform to maintain native object ratios implicitly
            const intrinsicScale = 1 / captureArea.width;
            const intrinsicShiftX = (0.5 - captureArea.x) * 100;
            const intrinsicShiftY = (0.5 - captureArea.y) * 100;

            // Aspect Ratio Correction: 
            // - '4:3 (Stretch Thin)': If content looks too thin (1.333x)
            // - '4:3 (Squeeze Wide)': If content looks too wide (0.75x)
            // - '1:1': Force square (0.5625x)
            let correctionScaleX = 1;
            if (aspectRatioCorrection === '4:3 (Stretch Thin)') {
                correctionScaleX = 1.333; // (16/9) / (4/3) - Stretches thin feed back to wide
            } else if (aspectRatioCorrection === '4:3 (Squeeze Wide)') {
                correctionScaleX = 0.75; // Squeezes fat feed
            } else if (aspectRatioCorrection === '1:1') {
                correctionScaleX = 0.5625; // (1/1) / (16/9)
            }

            return {
                ...base,
                transform: `translate(-50%, -50%) scale(${intrinsicScale}) scaleX(${correctionScaleX}) translate(${intrinsicShiftX}%, ${intrinsicShiftY}%)`,
            };
        }, [isCalibrating, captureArea, aspectRatioCorrection]);

        // ═══════════════════════════════════════
        //  Calibration Mouse Handlers (Draw / Move / Resize)
        // ═══════════════════════════════════════
        // Helper: Get actual rendered video dimensions
        // With our precise 16:9 container, this maps 1:1 perfectly covering the area.
        const getVideoMetrics = () => {
            if (!containerRef.current) return null;
            const containerRect = containerRef.current.getBoundingClientRect();

            return {
                left: 0,
                top: 0,
                width: containerRect.width,
                height: containerRect.height,
                containerRect
            };
        };

        const getNormCoords = (e: React.MouseEvent): { x: number; y: number } => {
            const metrics = getVideoMetrics();
            if (!metrics) return { x: 0, y: 0 };

            const { width, height, containerRect } = metrics;

            // e.clientX/Y are relative to the viewport.
            // containerRect.left/top are the container's position in the viewport.
            // So mouse inside container exactly = e.clientX - containerRect.left
            const mouseX = e.clientX - containerRect.left;
            const mouseY = e.clientY - containerRect.top;

            // Since we know the video exactly fills this container (left=0, top=0 internally inside the container bounds)
            return {
                x: Math.max(0, Math.min(1, mouseX / width)),
                y: Math.max(0, Math.min(1, mouseY / height)),
            };
        };

        const getContainerCoords = (e: React.MouseEvent): { x: number; y: number } => {
            if (!containerRef.current) return { x: 0, y: 0 };
            const rect = containerRef.current.getBoundingClientRect();
            return {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
        };

        const getHitZone = (e: React.MouseEvent): DragMode => {
            if (!captureArea || captureArea.width <= 0) return 'draw';
            const { x, y } = getNormCoords(e);
            const area = captureArea;
            const handleSize = 0.025; // 2.5% of container for handle hit detection

            const left = area.x - area.width / 2;
            const right = area.x + area.width / 2;
            const top = area.y - area.height / 2;
            const bottom = area.y + area.height / 2;

            // Check corners first
            if (Math.abs(x - left) < handleSize && Math.abs(y - top) < handleSize) return 'resize-nw';
            if (Math.abs(x - right) < handleSize && Math.abs(y - top) < handleSize) return 'resize-ne';
            if (Math.abs(x - left) < handleSize && Math.abs(y - bottom) < handleSize) return 'resize-sw';
            if (Math.abs(x - right) < handleSize && Math.abs(y - bottom) < handleSize) return 'resize-se';

            // Check edges
            if (Math.abs(x - left) < handleSize && y > top && y < bottom) return 'resize-w';
            if (Math.abs(x - right) < handleSize && y > top && y < bottom) return 'resize-e';
            if (Math.abs(y - top) < handleSize && x > left && x < right) return 'resize-n';
            if (Math.abs(y - bottom) < handleSize && x > left && x < right) return 'resize-s';

            // Check inside for move
            if (x > left && x < right && y > top && y < bottom) return 'move';

            // Outside — draw new
            return 'draw';
        };

        const getCursorForMode = (mode: DragMode): string => {
            switch (mode) {
                case 'move': return 'grab';
                case 'resize-nw': case 'resize-se': return 'nwse-resize';
                case 'resize-ne': case 'resize-sw': return 'nesw-resize';
                case 'resize-n': case 'resize-s': return 'ns-resize';
                case 'resize-e': case 'resize-w': return 'ew-resize';
                case 'pan': return 'grabbing';
                default: return isCalibrating ? 'crosshair' : (zoom > 1 ? 'grab' : 'default');
            }
        };

        const handleMouseDown = (e: React.MouseEvent) => {
            if (!containerRef.current) return;

            if (isCalibrating) {
                e.preventDefault();
                const coords = getNormCoords(e);
                const mode = getHitZone(e);
                setDragMode(mode);
                setDragStart(coords);
                setDragStartArea(captureArea ? { ...captureArea } : null);

                if (mode === 'draw') {
                    onCalibrationChange?.({ x: coords.x, y: coords.y, width: 0, height: 0 });
                }
            } else if (zoom > 1) {
                // Pan mode
                e.preventDefault();
                const coords = getContainerCoords(e);
                setDragMode('pan');
                setDragStart(coords);
                setDragStartPan({ ...panOffset });
            }
        };

        const handleMouseMove = (e: React.MouseEvent) => {
            if (!containerRef.current) return;

            // Update cursor based on hover zone
            if (dragMode === 'none') {
                const zone = isCalibrating ? getHitZone(e) : (zoom > 1 ? 'move' : 'none');
                containerRef.current.style.cursor = getCursorForMode(zone as DragMode);
                return;
            }

            if (!dragStart) return;
            e.preventDefault();

            if (dragMode === 'pan' && dragStartPan) {
                const curr = getContainerCoords(e);
                const dx = curr.x - dragStart.x;
                const dy = curr.y - dragStart.y;

                // Calculate unclamped pan
                let newX = dragStartPan.x + dx;
                let newY = dragStartPan.y + dy;

                // Clamp: at zoom Z, the video is Z× bigger than the container.
                // We pan BEFORE scaling, so we clamp based on the overflow distance.
                // Max pan = containerSize * (Z - 1) / 2
                if (zoom > 1 && containerRef.current) {
                    const rect = containerRef.current.getBoundingClientRect();
                    const maxPanX = (rect.width * (zoom - 1)) / 2;
                    const maxPanY = (rect.height * (zoom - 1)) / 2;
                    newX = Math.max(-maxPanX, Math.min(maxPanX, newX));
                    newY = Math.max(-maxPanY, Math.min(maxPanY, newY));
                } else {
                    newX = 0;
                    newY = 0;
                }

                setPanOffset({ x: newX, y: newY });
                return;
            }

            if (!isCalibrating || !onCalibrationChange) return;

            const curr = getNormCoords(e);
            const dx = curr.x - dragStart.x;
            const dy = curr.y - dragStart.y;

            if (dragMode === 'draw') {
                // Draw from center outward
                const distX = Math.abs(dx);
                const distY = Math.abs(dy);

                if (activeShape === 'circle') {
                    // Circle: enforce equal width and height (perfect circle)
                    const dist = Math.max(distX, distY);
                    const size = Math.min(dist * 2, 1);
                    onCalibrationChange({
                        x: dragStart.x,
                        y: dragStart.y,
                        width: size,
                        height: size,
                    });
                } else {
                    // Rectangle: independent w/h
                    onCalibrationChange({
                        x: dragStart.x,
                        y: dragStart.y,
                        width: Math.min(distX * 2, 1),
                        height: Math.min(distY * 2, 1),
                    });
                }
            } else if (dragMode === 'move' && dragStartArea) {
                // Move the shape
                const newX = Math.max(dragStartArea.width / 2, Math.min(1 - dragStartArea.width / 2, dragStartArea.x + dx));
                const newY = Math.max(dragStartArea.height / 2, Math.min(1 - dragStartArea.height / 2, dragStartArea.y + dy));
                onCalibrationChange({
                    x: newX,
                    y: newY,
                    width: dragStartArea.width,
                    height: dragStartArea.height,
                });
            } else if (dragMode.startsWith('resize') && dragStartArea) {
                // Resize from the appropriate edge/corner

                let finalW = dragStartArea.width;
                let finalH = dragStartArea.height;
                let finalX = dragStartArea.x;
                let finalY = dragStartArea.y;

                if (activeShape === 'circle') {
                    // Circle: uniform resize — use the dominant axis delta
                    const absDx = Math.abs(dx);
                    const absDy = Math.abs(dy);
                    // Determine sign based on which direction is growing outward
                    let delta = 0;
                    if (dragMode.includes('e') || dragMode.includes('s') || dragMode === 'resize-se' || dragMode === 'resize-ne' || dragMode === 'resize-sw') {
                        delta = Math.max(absDx, absDy);
                        // If the dominant move is shrinking (moving toward center), negate
                        if (dragMode.includes('e') && dx < 0) delta = -delta;
                        else if (dragMode.includes('w') && dx > 0) delta = -delta;
                        else if (dragMode.includes('s') && dy < 0) delta = -delta;
                        else if (dragMode.includes('n') && dy > 0) delta = -delta;
                    } else {
                        delta = Math.max(absDx, absDy);
                        if (dragMode.includes('w') && dx > 0) delta = -delta;
                        else if (dragMode.includes('n') && dy > 0) delta = -delta;
                    }
                    const newSize = Math.max(0.02, Math.min(1, dragStartArea.width + delta));
                    finalW = newSize;
                    finalH = newSize;
                    finalX = dragStartArea.x;
                    finalY = dragStartArea.y;
                } else {
                    // Rectangle: one-sided resize logic
                    if (dragMode.includes('e')) {
                        finalW = Math.max(0.01, dragStartArea.width + dx);
                        finalX = dragStartArea.x + (finalW - dragStartArea.width) / 2;
                    } else if (dragMode.includes('w')) {
                        finalW = Math.max(0.01, dragStartArea.width - dx);
                        finalX = dragStartArea.x - (finalW - dragStartArea.width) / 2;
                    }

                    if (dragMode.includes('s')) {
                        finalH = Math.max(0.01, dragStartArea.height + dy);
                        finalY = dragStartArea.y + (finalH - dragStartArea.height) / 2;
                    } else if (dragMode.includes('n')) {
                        finalH = Math.max(0.01, dragStartArea.height - dy);
                        finalY = dragStartArea.y - (finalH - dragStartArea.height) / 2;
                    }
                }

                // Final Bounds Check
                finalX = Math.max(finalW / 2, Math.min(1 - finalW / 2, finalX));
                finalY = Math.max(finalH / 2, Math.min(1 - finalH / 2, finalY));

                onCalibrationChange({
                    x: finalX,
                    y: finalY,
                    width: finalW,
                    height: finalH,
                });
            }
        };

        const handleMouseUp = () => {
            setDragMode('none');
            setDragStart(null);
            setDragStartArea(null);
            setDragStartPan(null);
        };

        // Clamp pan when zoom changes (including reset to 0 at zoom=1)
        useEffect(() => {
            if (zoom <= 1) {
                setPanOffset({ x: 0, y: 0 });
            } else if (containerRef.current) {
                const effectiveZoom = hardwareZoom ? 1 : zoom;
                const rect = containerRef.current.getBoundingClientRect();
                const maxPanX = rect.width * (effectiveZoom - 1) / (2 * effectiveZoom);
                const maxPanY = rect.height * (effectiveZoom - 1) / (2 * effectiveZoom);
                setPanOffset(prev => ({
                    x: Math.max(-maxPanX, Math.min(maxPanX, prev.x)),
                    y: Math.max(-maxPanY, Math.min(maxPanY, prev.y)),
                }));
            }
        }, [zoom, hardwareZoom]);

        // ═══════════════════════════════════════
        //  3. Hardware PTZ Sync (Pi 5)
        // ═══════════════════════════════════════
        useEffect(() => {
            if (hardwareZoom) {
                const hostname = window.location.hostname || 'localhost';
                // Send panOffset inversely mapped as tilt/pan if needed, depending on v4l2
                fetch(`http://${hostname}:5555/ptz?zoom=${zoom}&pan=${panOffset.x}&tilt=${panOffset.y}`)
                    .catch(() => { });
            }
        }, [hardwareZoom, zoom, panOffset]);

        // ═══════════════════════════════════════
        //  4. Capture Logic (Zero-Latency Daemon API & Fallback)
        // ═══════════════════════════════════════

        // Helper: apply shape mask and aspect ratio correction to canvas context
        // Returns a NEW canvas that is tightly cropped to the mask.
        const cropAndMask = (sourceCanvas: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement => {
            if (!captureArea || captureArea.width === 0) return sourceCanvas;

            // Use the passed activeShape prop
            const shape = activeShape;

            // 1. Aspect Ratio Correction for Captured Image
            let correctionScaleX = 1;
            if (aspectRatioCorrection === '4:3 (Stretch Thin)') {
                correctionScaleX = 1.333; // Stretch
            } else if (aspectRatioCorrection === '4:3 (Squeeze Wide)') {
                correctionScaleX = 0.75; // Squeeze
            } else if (aspectRatioCorrection === '1:1') {
                correctionScaleX = 0.5625; // Squeeze
            }

            // The capture area is normalized (0 to 1). We map it back to canvas pixels.
            const cx = captureArea.x * w;
            const cy = captureArea.y * h;
            const cw = captureArea.width * w;
            const ch = captureArea.height * h;

            // 2. Create the perfectly cropped destination canvas
            const resultCanvas = document.createElement("canvas");
            resultCanvas.width = cw;
            resultCanvas.height = ch;
            const ctx = resultCanvas.getContext("2d");

            if (!ctx) return sourceCanvas;

            // 3. Draw the exact bounding box from the source image into the result canvas
            ctx.drawImage(
                sourceCanvas,
                cx - cw / 2, cy - ch / 2, cw, ch, // Source coordinates (x, y, width, height)
                0, 0, cw, ch                      // Destination coordinates (x, y, width, height)
            );

            // 4. Apply a circular clip to mask out the corners if shape is circle
            if (shape === 'circle') {
                ctx.globalCompositeOperation = 'destination-in';
                ctx.beginPath();
                ctx.arc(cw / 2, ch / 2, Math.min(cw, ch) / 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalCompositeOperation = 'source-over';
            }

            return resultCanvas;
        };

        const doCapture = useCallback(async () => {
            let imgDataUrl: string | null = null;

            // A: Local Dev WebRTC Fallback
            if (status === "streaming" && videoRef.current) {
                const canvas = document.createElement("canvas");
                canvas.width = videoRef.current.videoWidth || 1920;
                canvas.height = videoRef.current.videoHeight || 1080;
                const ctx = canvas.getContext("2d");
                if (ctx) {
                    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
                    const finalCanvas = cropAndMask(canvas, canvas.width, canvas.height);
                    imgDataUrl = finalCanvas.toDataURL("image/png", 1.0); // Use 1.0 for PNG, or switch to image/jpeg for smaller payload
                }
            } else {
                // B: Hardware Mode (Pi 5) — hit the background node.js tcp scraper daemon
                try {
                    const hostname = window.location.hostname || 'localhost';
                    const res = await fetch(`http://${hostname}:5555/capture`, { method: "GET" });
                    if (res.ok) {
                        const blob = await res.blob();
                        const blobUrl = URL.createObjectURL(blob);

                        // Wait for image to load to apply mask
                        imgDataUrl = await new Promise<string | null>((resolve, reject) => {
                            const img = new Image();
                            img.onload = () => {
                                const canvas = document.createElement("canvas");
                                canvas.width = img.naturalWidth;
                                canvas.height = img.naturalHeight;
                                const ctx = canvas.getContext("2d");
                                if (ctx) {
                                    // Apply aspect ratio correction before drawing the image
                                    let correctionScaleX = 1;
                                    if (aspectRatioCorrection === '4:3 (Stretch Thin)') {
                                        correctionScaleX = 1.333;
                                    } else if (aspectRatioCorrection === '4:3 (Squeeze Wide)') {
                                        correctionScaleX = 0.75;
                                    } else if (aspectRatioCorrection === '1:1') {
                                        correctionScaleX = 0.5625;
                                    }

                                    if (correctionScaleX !== 1) {
                                        // We stretch the canvas width or the drawImage width
                                        // To keep it simple, we draw the image with a stretched width on the canvas
                                        ctx.drawImage(img, 0, 0, img.naturalWidth * correctionScaleX, img.naturalHeight);
                                    } else {
                                        ctx.drawImage(img, 0, 0);
                                    }

                                    const finalCanvas = cropAndMask(canvas, canvas.width * correctionScaleX, canvas.height);
                                    // Use PNG compression 1.0 or switch to jpeg for medical
                                    resolve(finalCanvas.toDataURL("image/png", 1.0));
                                } else {
                                    resolve(null);
                                }
                                URL.revokeObjectURL(blobUrl);
                            };
                            img.onerror = () => {
                                URL.revokeObjectURL(blobUrl);
                                reject(new Error("Failed to load daemon blob into image"));
                            };
                            img.src = blobUrl;
                        });
                    }
                } catch (err) {
                    console.error("GStreamer hardware daemon capture failed:", err);
                }
            }

            return imgDataUrl;
        }, [status, captureArea]);

        const startRecording = useCallback(async () => {
            // Hardware Mode (Pi 5) 
            try {
                const hostname = window.location.hostname || 'localhost';
                const res = await fetch(`http://${hostname}:5555/record/start`, { method: "GET" }).catch(() => null);
                if (res && res.ok) return true;
            } catch (err) {
                console.log("Daemon record start failed, trying fallback...", err);
            }

            // Local Dev WebRTC Fallback
            if (status === "streaming" && videoRef.current && (videoRef.current.srcObject instanceof MediaStream)) {
                try {
                    const stream = videoRef.current.srcObject;
                    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
                    recordedChunksRef.current = [];

                    recorder.ondataavailable = (e) => {
                        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
                    };

                    recorder.start(200);
                    mediaRecorderRef.current = recorder;
                    return true;
                } catch (e) {
                    console.error("Local recording failed:", e);
                }
            }
            return false;
        }, [status]);

        const stopRecording = useCallback(async () => {
            // Hardware Mode (Pi 5)
            try {
                const hostname = window.location.hostname || 'localhost';
                const res = await fetch(`http://${hostname}:5555/record/stop`, { method: "GET" }).catch(() => null);
                if (res && res.ok) {
                    const data = await res.json();
                    return data.filename;
                }
            } catch (err) {
                console.log("Daemon record stop failed, checking fallback...");
            }

            // Local Dev WebRTC Fallback
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                return new Promise<string | null>((resolve) => {
                    const recorder = mediaRecorderRef.current!;
                    recorder.onstop = () => {
                        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
                        recordedChunksRef.current = [];
                        // Save locally to blob URL for dev
                        resolve(URL.createObjectURL(blob));
                    };
                    recorder.stop();
                });
            }

            return null;
        }, []);

        useImperativeHandle(ref, () => ({
            getCanvas: () => null,
            captureFrame: doCapture,
            startRecording,
            stopRecording,
            getStatus: () => status,
            getLiveCanvas: () => canvasRef.current
        }));

        // ═══════════════════════════════════════
        //  Calibration Overlay Renderer
        // ═══════════════════════════════════════
        const renderCalibrationOverlay = () => {
            if (!isCalibrating) return null;
            const area = captureArea;
            const hasArea = area && area.width > 0.01;

            const metrics = getVideoMetrics();
            if (!metrics) return null;

            const { left, top, width, height, containerRect } = metrics;
            if (!containerRect || containerRect.width <= 0 || containerRect.height <= 0) return null;

            // The container maps exactly 1:1 to the normalized coordinates.
            // A normalized value of 0.5 means exactly 50% of the container.
            const wPct = hasArea ? (area!.width * 100) : 0;
            const hPct = hasArea ? (area!.height * 100) : 0;

            const cxPct = hasArea ? (area!.x * 100) : 0;
            const cyPct = hasArea ? (area!.y * 100) : 0;

            const leftPct = hasArea ? (cxPct - wPct / 2) : 0;
            const topPct = hasArea ? (cyPct - hPct / 2) : 0;

            const cxPx = hasArea ? (area!.x * containerRect.width) : 0;
            const cyPx = hasArea ? (area!.y * containerRect.height) : 0;
            const wPx = hasArea ? (area!.width * containerRect.width) : 0;
            const hPx = hasArea ? (area!.height * containerRect.height) : 0;

            let circleRadius = Math.min(wPx, hPx) / 2;

            if (isNaN(cxPx) || isNaN(cyPx) || isNaN(circleRadius)) return null;

            return (
                <div className="absolute inset-0 pointer-events-none z-[100]">
                    {/* Header Badge */}
                    <div className="absolute top-4 left-4 flex items-center gap-3 px-4 py-2.5 bg-indigo-600/90 rounded-2xl shadow-2xl border border-indigo-400/30 backdrop-blur-sm pointer-events-auto z-10">
                        <Maximize2 size={14} className="text-white animate-pulse" />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white">
                            Scope Calibration
                        </span>
                        <div className="w-px h-4 bg-white/20" />
                        <span className="text-[10px] font-bold text-indigo-200 capitalize">Area</span>
                    </div>

                    {/* Instructions / Ghost Outline when no area drawn yet */}
                    {!hasArea && dragMode === 'none' && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="absolute inset-0 flex items-center justify-center opacity-30">
                                <div className="w-[100%] h-[100%] border-2 border-dashed border-white/50" />
                            </div>

                            <div className="px-6 py-4 bg-black/60 backdrop-blur-md rounded-3xl border border-white/10 text-center animate-in fade-in zoom-in duration-300 z-10">
                                <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-3">
                                    <MousePointer2 size={20} className="text-white opacity-80" />
                                </div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-white mb-1">Click & Drag to Draw</p>
                                <p className="text-[9px] text-white/50">
                                    Draw your rectangular area
                                </p>
                            </div>
                        </div>
                    )}

                    {/* MASK Overlay */}
                    {hasArea && (
                        <svg width="100%" height="100%" className="absolute inset-0 pointer-events-none">
                            <defs>
                                <mask id="calibration-mask">
                                    <rect width="100%" height="100%" fill="white" />
                                    {activeShape === 'circle' ? (
                                        <circle
                                            cx={`${cxPct}%`}
                                            cy={`${cyPct}%`}
                                            r={`${Math.min(wPct, hPct) / 2}%`}
                                            fill="black"
                                        />
                                    ) : (
                                        <rect
                                            x={`${leftPct}%`}
                                            y={`${topPct}%`}
                                            width={`${wPct}%`}
                                            height={`${hPct}%`}
                                            fill="black"
                                        />
                                    )}
                                </mask>
                            </defs>
                            <rect width="100%" height="100%" fill="rgba(0,0,0,0.6)" mask="url(#calibration-mask)" />

                            {/* Shape Outline */}
                            {activeShape === 'circle' ? (
                                <circle
                                    cx={`${cxPct}%`}
                                    cy={`${cyPct}%`}
                                    r={`${Math.min(wPct, hPct) / 2}%`}
                                    fill="none"
                                    stroke="white"
                                    strokeWidth="2"
                                    strokeDasharray="4 4"
                                    className="animate-pulse-slow"
                                />
                            ) : (
                                <rect
                                    x={`${leftPct}%`}
                                    y={`${topPct}%`}
                                    width={`${wPct}%`}
                                    height={`${hPct}%`}
                                    fill="none"
                                    stroke="white"
                                    strokeWidth="2"
                                    strokeDasharray="4 4"
                                    className="animate-pulse-slow"
                                />
                            )}

                            {/* Grid Reference Lines — Full-span through center */}
                            <line
                                x1="0%" y1={`${cyPct}%`}
                                x2="100%" y2={`${cyPct}%`}
                                stroke="white" strokeWidth="0.5" opacity="0.15"
                                strokeDasharray="6 4"
                            />
                            <line
                                x1={`${cxPct}%`} y1="0%"
                                x2={`${cxPct}%`} y2="100%"
                                stroke="white" strokeWidth="0.5" opacity="0.15"
                                strokeDasharray="6 4"
                            />

                            {/* Small Crosshair at center */}
                            <line
                                x1={`${cxPct - 1}%`} y1={`${cyPct}%`}
                                x2={`${cxPct + 1}%`} y2={`${cyPct}%`}
                                stroke="white" strokeWidth="1" opacity="0.6"
                            />
                            <line
                                x1={`${cxPct}%`} y1={`${cyPct - 1.5}%`}
                                x2={`${cxPct}%`} y2={`${cyPct + 1.5}%`}
                                stroke="white" strokeWidth="1" opacity="0.6"
                            />
                            {/* Center dot */}
                            <circle
                                cx={`${cxPct}%`} cy={`${cyPct}%`}
                                r="2" fill="white" opacity="0.5"
                            />
                        </svg>
                    )}

                    {/* Handles & UI */}
                    {hasArea && (
                        <>
                            {/* Center Mover — Compact */}
                            <div
                                className="absolute w-7 h-7 -ml-3.5 -mt-3.5 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center cursor-grab active:cursor-grabbing pointer-events-auto transition-colors border border-white/30 backdrop-blur-md z-[40] group shadow-lg"
                                style={{ left: `${cxPct}%`, top: `${cyPct}%` }}
                                onMouseDown={(e) => {
                                    e.stopPropagation();
                                    setDragMode('move');
                                    setDragStart(getNormCoords(e));
                                    setDragStartArea({ ...captureArea! });
                                }}
                            >
                                <div className="p-1 rounded-md bg-indigo-500/80 shadow group-hover:scale-110 transition-transform">
                                    <Move size={11} className="text-white" />
                                </div>
                            </div>

                            {/* Resize Handles - Corners */}
                            {[
                                { l: leftPct, t: topPct, mode: 'resize-nw' as const, cursor: 'nw-resize' },
                                { l: leftPct + wPct, t: topPct, mode: 'resize-ne' as const, cursor: 'ne-resize' },
                                { l: leftPct, t: topPct + hPct, mode: 'resize-sw' as const, cursor: 'sw-resize' },
                                { l: leftPct + wPct, t: topPct + hPct, mode: 'resize-se' as const, cursor: 'se-resize' }
                            ].map((h, i) => (
                                <div
                                    key={`corner-${i}`}
                                    className="absolute w-6 h-6 -ml-3 -mt-3 flex items-center justify-center cursor-pointer pointer-events-auto z-30 group"
                                    style={{ left: `${h.l}%`, top: `${h.t}%`, cursor: h.cursor }}
                                    onMouseDown={(e) => {
                                        e.stopPropagation();
                                        setDragMode(h.mode);
                                        setDragStart(getNormCoords(e));
                                        setDragStartArea({ ...captureArea! });
                                    }}
                                >
                                    <div className="w-3 h-3 bg-white border-2 border-indigo-600 rounded-full shadow-lg group-hover:scale-125 transition-transform" />
                                </div>
                            ))}

                            {/* Resize Handles - Edges */}
                            {[
                                { l: leftPct + wPct / 2, t: topPct, mode: 'resize-n' as const, cursor: 'ns-resize' }, // N
                                { l: leftPct + wPct / 2, t: topPct + hPct, mode: 'resize-s' as const, cursor: 'ns-resize' }, // S
                                { l: leftPct, t: topPct + hPct / 2, mode: 'resize-w' as const, cursor: 'ew-resize' }, // W
                                { l: leftPct + wPct, t: topPct + hPct / 2, mode: 'resize-e' as const, cursor: 'ew-resize' } // E
                            ].map((h, i) => (
                                <div
                                    key={`edge-${i}`}
                                    className="absolute w-6 h-6 -ml-3 -mt-3 flex items-center justify-center cursor-pointer pointer-events-auto z-30 group"
                                    style={{ left: `${h.l}%`, top: `${h.t}%`, cursor: h.cursor }}
                                    onMouseDown={(e) => {
                                        e.stopPropagation();
                                        setDragMode(h.mode);
                                        setDragStart(getNormCoords(e));
                                        setDragStartArea({ ...captureArea! });
                                    }}
                                >
                                    <div className="w-2.5 h-2.5 bg-indigo-500 border border-white/50 rounded-full shadow-lg group-hover:scale-125 transition-transform" />
                                </div>
                            ))}

                            {/* Info Badge (Bottom Right) */}
                            <div className="absolute bottom-4 right-4 flex items-center gap-4 px-4 py-2 bg-black/80 rounded-xl border border-white/10 backdrop-blur-md pointer-events-auto z-20">
                                <div className="space-y-0.5">
                                    <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest">Size</span>
                                    <p className="text-[10px] font-mono font-bold text-white">{Math.round(area!.width * 100)}% × {Math.round(area!.height * 100)}%</p>
                                </div>
                                <div className="w-px h-6 bg-white/10" />
                                <div className="space-y-0.5">
                                    <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest">Pos</span>
                                    <p className="text-[10px] font-mono font-bold text-zinc-400">
                                        ({Math.round(area!.x * 100)}, {Math.round(area!.y * 100)})
                                    </p>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            );
        };

        // ═══════════════════════════════════════
        //  Zoom Indicator Overlay
        // ═══════════════════════════════════════
        const renderZoomIndicator = () => {
            const effectiveZoom = hardwareZoom ? 1 : zoom;
            if (effectiveZoom <= 1.05 || isCalibrating) return null;

            return (
                <div className="absolute top-6 right-6 z-[80] flex flex-col items-end gap-3 pointer-events-none">
                    {/* Zoom Badge - Smaller & Compact */}
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-2 px-2.5 py-1.5 bg-black/40 backdrop-blur-md border border-white/5 rounded-xl shadow-lg"
                    >
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/80 animate-pulse" />
                        <span className="text-[9px] font-bold text-white/90 uppercase tracking-widest leading-none">{effectiveZoom.toFixed(2)}x</span>
                    </motion.div>
                </div>
            );
        };


        // ═══════════════════════════════════════
        //  RENDER
        // ═══════════════════════════════════════
        return (
            <div ref={wrapperRef} className={`relative w-full h-full bg-transparent overflow-hidden ${className}`}>
                <div
                    ref={containerRef}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    style={{ ...containerStyle, background: 'transparent' }}
                    className={`relative w-full h-full ${isCalibrating ? 'ring-2 ring-indigo-500/50 transition-shadow duration-200' : ''}`}
                >
                    {/* Empty block to maintain size for GStreamer overlay rendering through the transparent background */}
                    <div style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        background: "transparent",
                    }}>
                        {/* MJPEG Mode — Canvas-based feed (GPU-composited, vsync'd) */}
                        {mjpegMode && (
                            <canvas
                                ref={mjpegCanvasRef}
                                className="pointer-events-none"
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    height: '100%',
                                    display: 'block',
                                    visibility: mjpegHasFrame ? 'visible' : 'hidden',
                                    transform: mirrored ? 'scaleX(-1)' : 'none',
                                }}
                            />
                        )}
                        {/* DEBUG: Temporary state indicator — remove after fixing */}
                        <div style={{
                            position: 'absolute', top: 4, left: 4, zIndex: 999,
                            background: 'rgba(0,0,0,0.7)', color: '#0f0', fontSize: '11px',
                            padding: '2px 6px', borderRadius: 3, fontFamily: 'monospace',
                            pointerEvents: 'none',
                        }}>
                            mjpeg:{mjpegMode ? 'Y' : 'N'} frame:{mjpegHasFrame ? 'Y' : 'N'} st:{status}
                        </div>
                        {/* Dev Mode local camera fallback (Only plays if stream attached) */}
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className="pointer-events-none -z-10"
                            style={{ ...videoInnerStyle, display: status === 'streaming' ? 'block' : 'none' }}
                        />
                    </div>

                    {frozenFrame && (
                        <div className="absolute inset-0 z-5 bg-black flex items-center justify-center">
                            <img
                                src={frozenFrame}
                                style={{
                                    maxWidth: "100%",
                                    maxHeight: "100%",
                                    objectFit: "contain",
                                    transform: mirrored ? "scaleX(-1)" : "none",
                                }}
                                className="block"
                                alt="Frozen"
                            />
                        </div>
                    )}

                    {/* Canvas for overlays if needed */}
                    <canvas
                        ref={canvasRef}
                        className="absolute inset-0 w-full h-full pointer-events-none z-10"
                        style={{ ...videoInnerStyle, display: 'none' }} // Hidden by default
                    />

                    {/* Grid Overlay */}
                    {showGrid && (
                        <div className="absolute inset-0 pointer-events-none z-10 opacity-30">
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-full bg-white/20" />
                            <div className="absolute top-1/2 left-0 -translate-y-1/2 w-full h-px bg-white/20" />
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[25%] aspect-square border border-cyan-500/20 rounded-full" />
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[50%] aspect-square border border-cyan-500/30 rounded-full" />
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[75%] aspect-square border border-cyan-500/20 rounded-full" />
                        </div>
                    )}

                    {/* Circle Hook Overlay — resizable reference ring */}
                    {overlayCircle?.visible && (
                        <div className="absolute inset-0 pointer-events-none z-20 flex items-center justify-center">
                            <svg
                                width="100%" height="100%"
                                viewBox="0 0 100 100"
                                preserveAspectRatio="xMidYMid meet"
                                className="absolute inset-0"
                            >
                                <circle
                                    cx="50" cy="50"
                                    r={overlayCircle.size / 2}
                                    fill="none"
                                    stroke="rgba(0, 230, 180, 0.6)"
                                    strokeWidth="0.5"
                                    strokeDasharray="4 2"
                                />
                                <line x1="48" y1="50" x2="52" y2="50" stroke="rgba(0, 230, 180, 0.3)" strokeWidth="0.15" />
                                <line x1="50" y1="48" x2="50" y2="52" stroke="rgba(0, 230, 180, 0.3)" strokeWidth="0.15" />
                            </svg>
                        </div>
                    )}

                    {/* Circle scope mask — CSS clip-path handles this now via containerStyle */}
                    {/* No SVG mask needed — eliminates GPU re-composition flicker */}

                    {renderCalibrationOverlay()}
                </div>

                {renderZoomIndicator()}
            </div>
        );
    }
);

export default SurgicalCameraStream;
