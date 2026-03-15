"use client";

import React, {
    useRef, useState, useEffect,
    useImperativeHandle, forwardRef, useCallback,
} from "react";
import { useScopeStore } from "@/lib/store/scope.store";
import { CustomScopeCanvasLayer } from "./CustomScopeCanvasLayer";

export interface CameraFeedHandle {
    captureFrame(options?: { ignoreMask?: boolean }): string | null;
    getVideoElement(): HTMLVideoElement | null;
}

const PRINT_MIN_PX = 1440;

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
        const [videoSize, setVideoSize] = useState({ w: 2560, h: 1440 });

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
                            width: { ideal: 2560 }, height: { ideal: 1440 }, frameRate: { ideal: 30 },
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
                            video: { width: { ideal: 2560 }, height: { ideal: 1440 }, frameRate: { ideal: 30 } },
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
            const fillScale = Math.min(contW / scopeW, contH / scopeH);
            const scaledCx = contW / 2 + (scopeCx - contW / 2) * fillScale;
            const scaledCy = contH / 2 + (scopeCy - contH / 2) * fillScale;
            const tx = contW / 2 - scaledCx;
            const ty = contH / 2 - scaledCy;

            const calX = (panX / 100) * 0.8 * contW;
            const calY = (panY / 100) * 0.8 * contH;

            return `translate(${tx + calX}px, ${ty + calY}px) scale(${fillScale}) scaleX(${arcX})`;
        })();

        // ─────────────────────────────────────────────────────────────────────────
        //  captureFrame — v5: correct mental model
        //
        //  The video element has:
        //    - style: objectFit='cover', width='100%', height='100%'
        //    - transform: translate(tx+calX, ty+calY) scale(fillScale) scaleX(arcX)
        //    - transformOrigin: '50% 50%'  (i.e. container centre)
        //
        //  objectFit:cover means the browser internally scales the video so it
        //  fills the container — letterboxing is NOT used. The video is always
        //  rendered at full contW × contH in screen space before the CSS transform.
        //
        //  So the pre-transform video element occupies exactly [0,0,contW,contH]
        //  in the element's own coordinate space, and the native video pixels map
        //  onto that rectangle with cover-fit (centre-aligned, edges cropped).
        //
        //  The CSS transform (applied around the container centre 50%/50%) then:
        //    1. scaleX(arcX)       — stretches/squishes horizontally
        //    2. scale(fillScale)   — zooms up so scope fills container
        //    3. translate(tx,ty)   — shifts so scope centre → container centre
        //
        //  CSS applies right-to-left, so a point P in element space maps to screen:
        //    screen.x = (P.x - contW/2) * fillScale * arcX + contW/2 + totalTx
        //    screen.y = (P.y - contH/2) * fillScale         + contH/2 + totalTy
        //
        //  Inverse (what element-space point is visible at screen centre contW/2, contH/2?):
        //    P.x = (0 - totalTx) / (fillScale * arcX) + contW/2
        //    P.y = (0 - totalTy) / fillScale           + contH/2
        //
        //  That element-space point, converted to native pixels via objectFit:cover
        //  mapping, is the capture centre. The capture half-size is scopeW/(2*fillScale)
        //  in element space → native pixels.
        // ─────────────────────────────────────────────────────────────────────────
        const captureFrame = useCallback((options?: { ignoreMask?: boolean }): string | null => {
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

                // ── 1. arcX ──────────────────────────────────────────────────────
                let arcX = 1;
                if (aspectRatioCorrection === '4:3 (Stretch Thin)') arcX = 1.333;
                else if (aspectRatioCorrection === '4:3 (Squeeze Wide)') arcX = 0.75;
                else if (aspectRatioCorrection === '1:1') arcX = 0.5625;

                // ── 2. objectFit:cover mapping ───────────────────────────────────
                //  The browser renders the video with cover-fit into [0,0,contW,contH].
                //  Find the rendered rect of the video (may be larger than container,
                //  centred, edges clipped by overflow:hidden).
                //
                //  Native video aspect = vw/vh (NOT affected by arcX — arcX is a CSS
                //  visual stretch applied AFTER the browser's cover computation).
                const nativeAR = vw / vh;
                const contAR = contW / contH;
                let covW: number, covH: number; // size of the video as rendered by objectFit:cover
                if (contAR > nativeAR) {
                    // Container wider → video fills width, overflows height
                    covW = contW;
                    covH = contW / nativeAR;
                } else {
                    // Container taller → video fills height, overflows width
                    covH = contH;
                    covW = contH * nativeAR;
                }
                const covOx = (contW - covW) / 2; // offset from container left
                const covOy = (contH - covH) / 2; // offset from container top

                // ── 3. Reproduce scopeFillTransform values exactly ───────────────
                //  These use the VISUAL aspect ratio (including arcX) since
                //  scopeFillTransform is aware of how the video looks on screen.
                const vA = (vw / vh) * arcX; // visual aspect ratio after arcX
                const cA = contW / contH;

                // Contain-fit render rect (used by square scope geometry)
                let renderW: number, renderH: number;
                if (cA > vA) { renderH = contH; renderW = renderH * vA; }
                else { renderW = contW; renderH = renderW / vA; }
                const ox = (contW - renderW) / 2;
                const oy = (contH - renderH) / 2;

                // Scope centre and size in screen/element space
                let scopeCx: number, scopeCy: number, scopeW: number;
                if (capShape === 'circle') {
                    let cvW: number, cvH: number, cvX: number, cvY: number;
                    if (cA > vA) { cvW = contW; cvH = cvW / vA; cvX = 0; cvY = (contH - cvH) / 2; }
                    else { cvH = contH; cvW = cvH * vA; cvX = (contW - cvW) / 2; cvY = 0; }
                    scopeCx = cvX + capGeo.x * cvW;
                    scopeCy = cvY + capGeo.y * cvH;
                    scopeW = capGeo.width * Math.min(contW, contH);
                } else {
                    scopeCx = ox + capGeo.x * renderW;
                    scopeCy = oy + capGeo.y * renderH;
                    scopeW = capGeo.width * Math.min(renderW, renderH);
                }

                const fillScale = Math.min(contW / scopeW, contH / scopeW);

                const scaledCx = contW / 2 + (scopeCx - contW / 2) * fillScale;
                const scaledCy = contH / 2 + (scopeCy - contH / 2) * fillScale;
                const tx = contW / 2 - scaledCx;
                const ty = contH / 2 - scaledCy;

                const calX = (store.panX / 100) * 0.8 * contW;
                const calY = (store.panY / 100) * 0.8 * contH;
                const totalTx = tx + calX;
                const totalTy = ty + calY;

                // ── 4. Invert the CSS transform ───────────────────────────────────
                //  Transform applied around transformOrigin = (contW/2, contH/2):
                //    screen.x = (P.x - contW/2) * fillScale * arcX + contW/2 + totalTx
                //    screen.y = (P.y - contH/2) * fillScale         + contH/2 + totalTy
                //
                //  At screen centre (contW/2, contH/2), solve for P:
                //    0 = (P.x - contW/2) * fillScale * arcX + totalTx
                //    P.x = contW/2 - totalTx / (fillScale * arcX)
                //
                //    0 = (P.y - contH/2) * fillScale + totalTy
                //    P.y = contH/2 - totalTy / fillScale
                //
                //  P is in element space = pre-transform container coords [0,contW] × [0,contH]
                const elemX = contW / 2 - totalTx / (fillScale * arcX);
                const elemY = contH / 2 - totalTy / fillScale;

                // ── 5. Element space → native video pixels ───────────────────────
                //  The video is rendered objectFit:cover into [0,0,contW,contH].
                //  covOx/covOy is where the video rect starts inside element space.
                //  covW/covH is the full rendered size of the video.
                //  Native pixel = (elemCoord - covOffset) * (nativeDim / covDim)
                //
                //  NOTE: arcX is a CSS visual stretch — it does NOT affect the
                //  objectFit:cover computation (that uses raw vw/vh).
                //  arcX only affects where the scope geometry was placed visually.
                //  When we map elem→native we must first UNDO the arcX stretch
                //  on the X axis, because native pixels are not arcX-stretched.
                //
                //  elemX is in arcX-stretched element space.
                //  Un-stretched elem X = contW/2 + (elemX - contW/2) / arcX
                const elemXUnstretched = contW / 2 + (elemX - contW / 2) / arcX;

                const nativeCx = (elemXUnstretched - covOx) * (vw / covW);
                const nativeCy = (elemY - covOy) * (vh / covH);

                // ── 6. Capture half-size in native pixels ────────────────────────
                //  The scope in element space has diameter = scopeW (pre-transform).
                //  After fillScale, it fills the container — but we want the original
                //  scope size, which is scopeW / fillScale ... wait, no.
                //  We want to capture exactly what was INSIDE the scope boundary,
                //  which is scopeW/2 in element space (pre-fillScale).
                //  In native pixels (un-stretching arcX for X):
                const elemHalfPx = scopeW / 2;
                const nativeHalfW = (elemHalfPx / arcX) * (vw / covW);
                const nativeHalfH = elemHalfPx * (vh / covH);

                // ── 7. Source rect ────────────────────────────────────────────────
                const srcX = Math.max(0, Math.round(nativeCx - nativeHalfW));
                const srcY = Math.max(0, Math.round(nativeCy - nativeHalfH));
                const srcW = Math.min(Math.round(nativeHalfW * 2), vw - srcX);
                const srcH = Math.min(Math.round(nativeHalfH * 2), vh - srcY);

                if (srcW < 2 || srcH < 2) return null;

                // ── 8. Output canvas size ────────────────────────────────────────
                //  Re-apply arcX to srcW → correct visual width for output image
                const isCircle = capShape === 'circle';
                const isSquare = capShape === 'square';
                const displayW = Math.round(srcW * arcX);
                const displayH = srcH;

                let canvasW: number, canvasH: number;
                if (isCircle || isSquare) {
                    const side = Math.max(displayW, displayH, PRINT_MIN_PX);
                    canvasW = side; canvasH = side;
                } else {
                    const long = Math.max(displayW, displayH);
                    const sc = Math.max(long, PRINT_MIN_PX) / long;
                    canvasW = Math.round(displayW * sc);
                    canvasH = Math.round(displayH * sc);
                }

                // ── 9. Draw ──────────────────────────────────────────────────────
                const drawCrop = (cv: HTMLCanvasElement, transparent = false) => {
                    const ctx = cv.getContext('2d', { willReadFrequently: true })!;
                    if (!transparent) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height); }
                    ctx.imageSmoothingEnabled = true;
                    (ctx as any).imageSmoothingQuality = 'high';
                    const sc = Math.min(cv.width / displayW, cv.height / displayH);
                    const dstW = displayW * sc;
                    const dstH = displayH * sc;
                    const dstX = (cv.width - dstW) / 2;
                    const dstY = (cv.height - dstH) / 2;
                    ctx.drawImage(video, srcX, srcY, srcW, srcH, dstX, dstY, dstW, dstH);
                    return ctx;
                };

                if (isCircle && !options?.ignoreMask) {
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
                // ── No scope: capture full frame ─────────────────────────────────
                const canvas = canvasRef.current;
                if (!canvas) return null;
                canvas.width = vw; canvas.height = vh;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                if (!ctx) return null;
                ctx.drawImage(video, 0, 0, vw, vh);
                return canvas.toDataURL('image/jpeg', 0.95);
            }
        }, [aspectRatioCorrection]);
        // NOTE: zoom / zoomPanOffset intentionally not used here.
        // scopeFillTransform (the view) doesn't use them, so capture must not either.

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