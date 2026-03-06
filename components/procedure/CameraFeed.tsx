"use client";

// =============================================================================
//  CameraFeed — Direct camera display (no iframe, no postMessage)
//
//  Pi daemon mode:  <img src="http://{host}:5555/stream" /> (native MJPEG)
//  Localhost mode:  <video> with getUserMedia (WebRTC fallback)
//
//  Exposes captureFrame() via React.forwardRef + useImperativeHandle
// =============================================================================

import React, { useRef, useState, useEffect, useImperativeHandle, forwardRef, useCallback } from "react";

export interface CameraFeedHandle {
    captureFrame(): string | null;
    getVideoElement(): HTMLVideoElement | HTMLImageElement | null;
}

type FeedMode = "daemon" | "webrtc" | "detecting";

const CameraFeed = forwardRef<CameraFeedHandle, { className?: string }>(
    function CameraFeed({ className = "" }, ref) {
        const imgRef = useRef<HTMLImageElement>(null);
        const videoRef = useRef<HTMLVideoElement>(null);
        const canvasRef = useRef<HTMLCanvasElement>(null);
        const streamRef = useRef<MediaStream | null>(null);
        const [mode, setMode] = useState<FeedMode>("detecting");
        const [error, setError] = useState<string | null>(null);

        // ── Detect daemon or fall back to WebRTC ──
        useEffect(() => {
            let active = true;
            const host = typeof window !== "undefined" ? (window.location.hostname || "localhost") : "localhost";
            const daemonUrl = `http://${host}:5555`;

            (async () => {
                // 1. Try daemon first
                try {
                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), 2000);
                    const res = await fetch(`${daemonUrl}/status`, { signal: controller.signal });
                    clearTimeout(timeout);
                    if (res.ok && active) {
                        // Daemon is running — use MJPEG stream
                        setMode("daemon");
                        if (imgRef.current) {
                            imgRef.current.src = `${daemonUrl}/stream`;
                        }
                        return;
                    }
                } catch {
                    // Daemon not available
                }

                if (!active) return;

                // 2. Fall back to WebRTC (getUserMedia)
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({
                        video: { width: { ideal: 1920 }, height: { ideal: 1080 } }
                    });
                    if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
                    streamRef.current = stream;
                    if (videoRef.current) {
                        videoRef.current.srcObject = stream;
                    }
                    setMode("webrtc");
                } catch (e) {
                    if (active) {
                        console.error("[CameraFeed] No camera source available:", e);
                        setError("Camera unavailable. Check that the daemon is running or a camera is connected.");
                    }
                }
            })();

            return () => {
                active = false;
                streamRef.current?.getTracks().forEach(t => t.stop());
                streamRef.current = null;
            };
        }, []);

        // ── Expose captureFrame to parent ──
        const captureFrame = useCallback((): string | null => {
            const canvas = canvasRef.current;
            if (!canvas) { console.warn("[CameraFeed] No canvas ref"); return null; }
            const ctx = canvas.getContext("2d");
            if (!ctx) { console.warn("[CameraFeed] No 2d context"); return null; }

            try {
                if (mode === "daemon" && imgRef.current && imgRef.current.naturalWidth > 0) {
                    canvas.width = imgRef.current.naturalWidth;
                    canvas.height = imgRef.current.naturalHeight;
                    ctx.drawImage(imgRef.current, 0, 0);
                    const data = canvas.toDataURL("image/png", 1.0);
                    console.log("[CameraFeed] Capture successful via canvas (daemon)");
                    return data;
                }
                if (mode === "webrtc" && videoRef.current && videoRef.current.videoWidth > 0) {
                    canvas.width = videoRef.current.videoWidth;
                    canvas.height = videoRef.current.videoHeight;
                    ctx.drawImage(videoRef.current, 0, 0);
                    const data = canvas.toDataURL("image/png", 1.0);
                    console.log("[CameraFeed] Capture successful via canvas (webrtc)");
                    return data;
                }
            } catch (e) {
                // CORS tainted canvas — drawImage works but toDataURL throws
                console.warn("[CameraFeed] Canvas tainted or read error, capture via canvas failed:", e);

                // FALLBACK: If daemon mode, we might try to reach out to a direct /capture endpoint
                // but that requires async. captureFrame is sync in some callers.
                // For now, let's log the detail.
            }

            console.warn("[CameraFeed] No active feed to capture from or capture failed. Mode:", mode);
            return null;
        }, [mode]);

        useImperativeHandle(ref, () => ({
            captureFrame,
            getVideoElement: () => mode === "daemon" ? imgRef.current : videoRef.current
        }), [captureFrame, mode]);

        // ── Reconnect handler ──
        const handleReconnect = useCallback(() => {
            const host = window.location.hostname || "localhost";
            if (imgRef.current) {
                imgRef.current.src = "";
                setTimeout(() => {
                    if (imgRef.current) imgRef.current.src = `http://${host}:5555/stream`;
                }, 100);
            }
        }, []);

        return (
            <div className={`relative w-full h-full bg-black flex items-center justify-center overflow-hidden ${className}`}>
                {/* MJPEG daemon stream — NO crossOrigin to avoid canvas taint */}
                <img
                    ref={imgRef}
                    alt=""
                    style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                        display: mode === "daemon" ? "block" : "none",
                        background: "#000",
                    }}
                />

                {/* WebRTC video */}
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                        display: mode === "webrtc" ? "block" : "none",
                        background: "#000",
                    }}
                />

                {/* Error state */}
                {error && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                        <span style={{ fontSize: 36, opacity: 0.2 }}>⚠</span>
                        <span className="text-white/30 text-xs font-semibold">{error}</span>
                    </div>
                )}

                {/* Detecting state */}
                {mode === "detecting" && !error && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-6 h-6 border-2 border-white/20 border-t-emerald-500 rounded-full animate-spin" />
                    </div>
                )}

                {/* Reconnect button (daemon mode, if image fails to load) */}
                {mode === "daemon" && (
                    <button
                        onClick={handleReconnect}
                        className="absolute bottom-3 left-3 z-10 px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-sm border border-white/10 text-[9px] font-bold text-white/40 uppercase tracking-widest hover:text-white/80 hover:bg-black/80 transition-all"
                        title="Reconnect Camera Feed"
                    >
                        ↻ Reconnect
                    </button>
                )}

                {/* Hidden canvas for frame capture */}
                <canvas ref={canvasRef} style={{ display: "none" }} />
            </div>
        );
    }
);

CameraFeed.displayName = "CameraFeed";
export default CameraFeed;
