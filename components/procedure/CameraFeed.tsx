"use client";

import React, {
    useRef, useState, useEffect,
    useImperativeHandle, forwardRef, useCallback,
} from "react";
import { useScopeStore } from "@/lib/store/scope.store";
import { CustomScopeCanvasLayer } from "./CustomScopeCanvasLayer";

export interface CameraFeedHandle {
    captureFrame(): string | null;
    getVideoElement(): HTMLVideoElement | null;
}

const PRINT_MIN_PX = 1200;

export interface CameraFeedProps {
    className?: string;
    zoom?: number;
    zoomPanOffset?: { x: number; y: number };
    pipMode?: boolean;
    aspectRatioCorrection?: '16:9' | '4:3 (Stretch Thin)' | '4:3 (Squeeze Wide)' | '1:1';
}

const CameraFeed = forwardRef<CameraFeedHandle, CameraFeedProps>(
    function CameraFeed({
        className = "",
        zoom = 1,
        zoomPanOffset = { x: 0, y: 0 },
        pipMode = false,
        aspectRatioCorrection = '16:9'
    }, ref) {
        const videoRef = useRef<HTMLVideoElement>(null);
        const canvasRef = useRef<HTMLCanvasElement>(null);
        const containerRef = useRef<HTMLDivElement>(null);
        const streamRef = useRef<MediaStream | null>(null);
        const [ready, setReady] = useState(false);
        const [error, setError] = useState<string | null>(null);
        const [contSize, setContSize] = useState({ w: 0, h: 0 });
        const [videoSize, setVideoSize] = useState({ w: 1920, h: 1080 });

        const { panX, panY, scopes, activeScopeId, drawingShape } = useScopeStore();
        const activeScope = scopes.find(s => s.id === activeScopeId);
        const targetGeo = activeScope?.geometry ?? null;
        const targetShape = activeScope?.shape ?? (drawingShape || null);
        const hasScopeSet = !!(targetGeo && targetGeo.width > 0);

        useEffect(() => {
            const el = containerRef.current;
            if (!el) return;
            const ro = new ResizeObserver(entries => {
                for (const e of entries) {
                    const { width, height } = e.contentRect;
                    setContSize({ w: Math.round(width), h: Math.round(height) });
                }
            });
            ro.observe(el);
            const r = el.getBoundingClientRect();
            setContSize({ w: Math.round(r.width), h: Math.round(r.height) });
            return () => ro.disconnect();
        }, []);

        useEffect(() => {
            let active = true;
            async function startCamera() {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({
                        video: {
                            width: { ideal: 3840 }, height: { ideal: 2160 }, frameRate: { ideal: 30 },
                            advanced: [{ whiteBalanceMode: 'manual', exposureMode: 'manual', focusMode: 'manual' }] as any,
                        },
                        audio: false,
                    });
                    if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
                    streamRef.current = stream;
                    if (videoRef.current) {
                        videoRef.current.srcObject = stream;
                        (videoRef.current as any).disablePictureInPicture = true;
                        videoRef.current.onloadedmetadata = () => {
                            if (videoRef.current) {
                                setVideoSize({ w: videoRef.current.videoWidth, h: videoRef.current.videoHeight });
                            }
                        };
                    }
                    setReady(true); setError(null);
                } catch {
                    try {
                        const stream = await navigator.mediaDevices.getUserMedia({
                            video: { width: { ideal: 3840 }, height: { ideal: 2160 }, frameRate: { ideal: 30 } },
                            audio: false,
                        });
                        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
                        streamRef.current = stream;
                        if (videoRef.current) {
                            videoRef.current.srcObject = stream;
                            videoRef.current.onloadedmetadata = () => {
                                if (videoRef.current)
                                    setVideoSize({ w: videoRef.current.videoWidth, h: videoRef.current.videoHeight });
                            };
                        }
                        setReady(true); setError(null);
                    } catch (err2: any) {
                        if (!active) return;
                        if (err2.name === 'NotReadableError') setError('Camera is in use by another application.');
                        else if (err2.name === 'NotAllowedError') setError('Camera permission denied.');
                        else if (err2.name === 'NotFoundError') setError('No camera detected.');
                        else setError(`Camera error: ${err2.message}`);
                    }
                }
            }
            startCamera();
            return () => {
                active = false;
                streamRef.current?.getTracks().forEach(t => t.stop());
                streamRef.current = null;
            };
        }, []);

        const scopeFillTransform = (() => {
            if (!hasScopeSet || !targetGeo || !targetShape || drawingShape) return null;
            const contW = contSize.w || containerRef.current?.clientWidth || 1;
            const contH = contSize.h || containerRef.current?.clientHeight || 1;
            const vw = videoRef.current?.videoWidth || videoSize.w;
            const vh = videoRef.current?.videoHeight || videoSize.h;

            let arcX = 1;
            if (aspectRatioCorrection === '4:3 (Stretch Thin)') arcX = 1.333;
            else if (aspectRatioCorrection === '4:3 (Squeeze Wide)') arcX = 0.75;
            else if (aspectRatioCorrection === '1:1') arcX = 0.5625;

            const vA = (vw / vh) * arcX;
            const cA = contW / contH;
            let renderW: number, renderH: number;
            if (cA > vA) { renderH = contH; renderW = renderH * vA; }
            else { renderW = contW; renderH = renderW / vA; }

            const ox = (contW - renderW) / 2;
            const oy = (contH - renderH) / 2;

            let scopeCx: number, scopeCy: number, scopeW: number, scopeH: number;
            if (targetShape === 'circle') {
                let cvW: number, cvH: number, cvX: number, cvY: number;
                if (cA > vA) { cvW = contW; cvH = cvW / vA; cvX = 0; cvY = (contH - cvH) / 2; }
                else { cvH = contH; cvW = cvH * vA; cvX = (contW - cvW) / 2; cvY = 0; }
                scopeCx = cvX + targetGeo.x * cvW;
                scopeCy = cvY + targetGeo.y * cvH;
                scopeW = scopeH = targetGeo.width * Math.min(contW, contH);
            } else {
                scopeCx = ox + targetGeo.x * renderW;
                scopeCy = oy + targetGeo.y * renderH;
                scopeW = scopeH = targetGeo.width * Math.min(renderW, renderH);
            }

            if (scopeW < 4 || scopeH < 4) return null;
            // Add a 5% safety margin (0.95 multiplier) to ensure the scope is never cropped
            const fillScale = Math.min(contW / scopeW, contH / scopeH);
            const scaledCx = contW / 2 + (scopeCx - contW / 2) * fillScale;
            const scaledCy = contH / 2 + (scopeCy - contH / 2) * fillScale;
            const tx = contW / 2 - scaledCx;
            const ty = contH / 2 - scaledCy;

            const calX = (panX / 100) * 0.8 * contW;
            const calY = (panY / 100) * 0.8 * contH;

            return `translate(${tx + calX}px, ${ty + calY}px) scale(${fillScale}) scaleX(${arcX})`;
        })();

        const captureFrame = useCallback((): string | null => {
            const video = videoRef.current;
            const container = containerRef.current;
            if (!video || video.videoWidth === 0) return null;

            const vw = video.videoWidth;
            const vh = video.videoHeight;
            const store = useScopeStore.getState();
            const scope = store.scopes.find(s => s.id === store.activeScopeId);
            const capGeo = scope?.geometry ?? store.drawnGeometry;
            const capShape = scope?.shape ?? store.drawingShape;

            if (capGeo && capShape && capGeo.width > 0) {
                const rect = container?.getBoundingClientRect();
                const contW = rect ? rect.width : (container?.clientWidth || vw);
                const contH = rect ? rect.height : (container?.clientHeight || vh);

                let arcX = 1;
                if (aspectRatioCorrection === '4:3 (Stretch Thin)') arcX = 1.333;
                else if (aspectRatioCorrection === '4:3 (Squeeze Wide)') arcX = 0.75;
                else if (aspectRatioCorrection === '1:1') arcX = 0.5625;

                const vA = (vw / vh) * arcX;
                const cA = contW / contH;
                let renderW: number, renderH: number;
                if (cA > vA) { renderH = contH; renderW = renderH * vA; }
                else { renderW = contW; renderH = renderW / vA; }

                let screenCx: number, screenCy: number, rScreenX: number, rScreenY: number;
                if (capShape === 'circle') {
                    let cvW: number, cvH: number, cvX: number, cvY: number;
                    if (cA > vA) { cvW = contW; cvH = cvW / vA; cvX = 0; cvY = (contH - cvH) / 2; }
                    else { cvH = contH; cvW = cvH * vA; cvX = (contW - cvW) / 2; cvY = 0; }
                    screenCx = cvX + capGeo.x * cvW;
                    screenCy = cvY + capGeo.y * cvH;
                    rScreenX = rScreenY = (capGeo.width * Math.min(contW, contH)) / 2;
                } else {
                    const ox = (contW - renderW) / 2;
                    const oy = (contH - renderH) / 2;
                    screenCx = ox + capGeo.x * renderW;
                    screenCy = oy + capGeo.y * renderH;
                    rScreenX = rScreenY = (capGeo.width * Math.min(renderW, renderH)) / 2;
                }

                const uz = zoom || 1;
                rScreenX /= uz; rScreenY /= uz;
                const calScreenX = (store.panX / 100) * 0.8 * contW;
                const calScreenY = (store.panY / 100) * 0.8 * contH;
                const navScreenX = zoomPanOffset.x / uz;
                const navScreenY = zoomPanOffset.y / uz;

                const finalScreenCx = screenCx + calScreenX + navScreenX;
                const finalScreenCy = screenCy + calScreenY + navScreenY;

                const ox = (contW - renderW) / 2;
                const oy = (contH - renderH) / 2;

                // Map to native video pixels (undoing stretched width)
                const cx = (finalScreenCx - ox) * (vw / renderW);
                const cy = (finalScreenCy - oy) * (vh / renderH);

                // Native radius needs to account for the arcX distortion
                // because native pixels are NOT stretched, but our screen circles are.
                const rx = rScreenX * (vw / renderW);
                const ry = rScreenY * (vh / renderH);

                const srcX = Math.max(0, Math.round(cx - rx));
                const srcY = Math.max(0, Math.round(cy - ry));
                const srcW = Math.min(Math.round(rx * 2), vw - srcX);
                const srcH = Math.min(Math.round(ry * 2), vh - srcY);
                if (srcW < 2 || srcH < 2) return null;

                const isCircle = capShape === 'circle';
                const isSquare = capShape === 'square';
                let canvasW: number, canvasH: number;
                if (isCircle || isSquare) {
                    const side = Math.max(srcW * arcX, srcH, PRINT_MIN_PX);
                    canvasW = side; canvasH = side;
                } else {
                    const long = Math.max(srcW * arcX, srcH);
                    const sc = Math.max(long, PRINT_MIN_PX) / long;
                    canvasW = Math.round(srcW * arcX * sc);
                    canvasH = Math.round(srcH * sc);
                }

                const drawCrop = (cv: HTMLCanvasElement, transparent = false) => {
                    const ctx = cv.getContext('2d', { willReadFrequently: true })!;
                    if (!transparent) { ctx.fillStyle = '#FFF'; ctx.fillRect(0, 0, cv.width, cv.height); }
                    ctx.imageSmoothingEnabled = true;
                    (ctx as any).imageSmoothingQuality = 'high';
                    const stretchedSrcW = srcW * arcX;
                    const sc = Math.min(cv.width / stretchedSrcW, cv.height / srcH);
                    const dstW = stretchedSrcW * sc, dstH = srcH * sc;
                    const dstX = (cv.width - dstW) / 2;
                    const dstY = (cv.height - dstH) / 2;
                    ctx.drawImage(video, srcX, srcY, srcW, srcH, dstX, dstY, dstW, dstH);
                    return ctx;
                };

                if (isCircle) {
                    const out = document.createElement('canvas');
                    out.width = canvasW; out.height = canvasH;
                    const octx = drawCrop(out, true);
                    octx.globalCompositeOperation = 'destination-in';
                    octx.beginPath();
                    octx.arc(canvasW / 2, canvasH / 2, canvasW / 2 - 1, 0, Math.PI * 2);
                    octx.fillStyle = '#000'; octx.fill();
                    octx.globalCompositeOperation = 'source-over';
                    return out.toDataURL('image/png');
                } else {
                    const out = document.createElement('canvas');
                    out.width = canvasW; out.height = canvasH;
                    drawCrop(out, false);
                    return out.toDataURL('image/jpeg', 0.98);
                }
            } else {
                const canvas = canvasRef.current;
                if (!canvas) return null;
                canvas.width = vw; canvas.height = vh;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                if (!ctx) return null;
                ctx.drawImage(video, 0, 0, vw, vh);
                return canvas.toDataURL('image/jpeg', 0.95);
            }
        }, [zoom, zoomPanOffset, aspectRatioCorrection]);

        useImperativeHandle(ref, () => ({
            captureFrame,
            getVideoElement: () => videoRef.current,
        }), [captureFrame]);

        const noScopeTransform = (() => {
            const calX = panX * 0.8, calY = panY * 0.8;
            let arcX = 1;
            if (aspectRatioCorrection === '4:3 (Stretch Thin)') arcX = 1.333;
            else if (aspectRatioCorrection === '4:3 (Squeeze Wide)') arcX = 0.75;
            else if (aspectRatioCorrection === '1:1') arcX = 0.5625;
            return `translate(${calX}%, ${calY}%) scaleX(${arcX})`;
        })();

        return (
            <div
                ref={containerRef}
                className={`relative w-full h-full bg-black flex items-center justify-center overflow-hidden ${className} ${pipMode ? 'rounded-full' : ''}`}
            >
                <video
                    ref={videoRef}
                    autoPlay playsInline muted
                    style={{
                        objectFit: 'cover',
                        width: '100%',
                        height: '100%',
                        background: '#000',
                        transform: scopeFillTransform ?? noScopeTransform,
                        transformOrigin: '50% 50%',
                    }}
                />
                {error && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
                        <span style={{ fontSize: 36, opacity: 0.2 }}>⚠</span>
                        <span className="text-white/30 text-xs font-semibold">{error}</span>
                    </div>
                )}
                {!ready && !error && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-6 h-6 border-2 border-white/20 border-t-emerald-500 rounded-full animate-spin" />
                    </div>
                )}
                <canvas ref={canvasRef} style={{ display: 'none' }} />
                <CustomScopeCanvasLayer videoRef={videoRef} aspectRatioCorrection={aspectRatioCorrection} />
            </div>
        );
    }
);

CameraFeed.displayName = 'CameraFeed';
export default CameraFeed;