"use client";

// =============================================================================
//  CameraFeedPopup.tsx  ·  Zero-Processing Camera Feed Popup Window (v2)
//
//  Opens a separate browser window with camera feed.
//  Strategy:
//    1. Try daemon HTTP stream  (Pi: <img src="/stream">)
//    2. Fall back to WebRTC     (Laptop: getUserMedia → <video>)
//  Supports single-window enforcement and auto-resize on toolbar toggle.
// =============================================================================

import { useRef, useEffect, useCallback } from "react";

interface CameraFeedPopupProps {
    /** Whether the popup should be open */
    isOpen: boolean;
    /** Whether the right-side toolbar is expanded */
    toolbarExpanded: boolean;
    /** Camera device ID for WebRTC fallback */
    deviceId?: string;
    /** Called when popup is closed by the user */
    onPopupClosed?: () => void;
}

// Singleton ref — ensures only ONE popup window exists globally
let globalPopupRef: Window | null = null;

export default function CameraFeedPopup({
    isOpen,
    toolbarExpanded,
    deviceId,
    onPopupClosed,
}: CameraFeedPopupProps) {
    const popupRef = useRef<Window | null>(null);
    const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ── Build the popup HTML ──────────────────────────────────────────────
    const buildPopupHTML = useCallback(() => {
        const host = typeof window !== "undefined"
            ? (window.location.hostname || "localhost")
            : "localhost";

        const deviceIdStr = deviceId ? `'${deviceId}'` : "null";

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Live Camera Feed</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body {
            width: 100%; height: 100%;
            background: #000;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
        }
        .feed-container {
            width: 100%; height: 100%;
            display: flex; flex-direction: column;
            background: #000;
        }
        .camera-area {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #000;
            min-height: 0;
            position: relative;
        }
        .camera-area img, .camera-area video {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
            image-rendering: auto;
        }
        .loading-overlay {
            position: absolute; inset: 0;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            background: #000;
            z-index: 10;
            transition: opacity 0.5s ease;
        }
        .loading-overlay.hidden { opacity: 0; pointer-events: none; }
        .loading-spinner {
            width: 40px; height: 40px;
            border: 3px solid rgba(255,255,255,0.1);
            border-top: 3px solid #10b981;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .loading-text {
            margin-top: 16px;
            color: rgba(255,255,255,0.5);
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.15em;
        }
        .status-bar {
            height: 28px;
            background: linear-gradient(to right, #0a0a0a, #111);
            border-top: 1px solid rgba(255,255,255,0.05);
            display: flex;
            align-items: center;
            padding: 0 12px;
            gap: 16px;
            flex-shrink: 0;
        }
        .status-dot {
            width: 6px; height: 6px;
            border-radius: 50%;
            background: #ef4444;
            transition: background 0.3s;
        }
        .status-dot.live { background: #10b981; box-shadow: 0 0 6px #10b981; }
        .status-label {
            font-size: 9px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.2em;
            color: rgba(255,255,255,0.4);
        }
        .status-fps {
            font-size: 10px;
            font-weight: 700;
            font-family: 'SF Mono', 'Fira Code', monospace;
            color: rgba(255,255,255,0.3);
        }
        .status-fps span { color: #10b981; }
    </style>
</head>
<body>
    <div class="feed-container">
        <div class="camera-area">
            <div class="loading-overlay" id="loading">
                <div class="loading-spinner"></div>
                <div class="loading-text">Connecting to camera...</div>
            </div>
            <img id="feedImg" alt="Camera Feed" style="display:none;" />
            <video id="feedVideo" autoplay playsinline muted style="display:none;"></video>
        </div>
        <div class="status-bar">
            <div class="status-dot" id="statusDot"></div>
            <span class="status-label" id="statusLabel">Connecting</span>
            <span class="status-fps" id="fpsDisplay"></span>
        </div>
    </div>
    <script>
        const HOST = '${host}';
        const DAEMON_URL = 'http://' + HOST + ':5555';
        const DEVICE_ID = ${deviceIdStr};
        let pollTimer = null;
        let isLive = false;
        let mode = 'none'; // 'daemon' or 'webrtc'

        function updateStatus(state, extra) {
            const dot = document.getElementById('statusDot');
            const label = document.getElementById('statusLabel');
            dot.className = 'status-dot' + (state === 'live' ? ' live' : '');
            const labels = {
                connecting: 'Connecting',
                live: 'Live',
                error: 'No Signal',
                reconnecting: 'Reconnecting...',
                webrtc: 'Live (WebRTC)',
            };
            label.textContent = (labels[state] || state) + (extra ? ' · ' + extra : '');
        }

        // ── Strategy 1: Daemon MJPEG stream ──────────────────────────────
        async function tryDaemon() {
            try {
                const ctrl = new AbortController();
                const timer = setTimeout(() => ctrl.abort(), 3000);
                const r = await fetch(DAEMON_URL + '/status', { signal: ctrl.signal });
                clearTimeout(timer);
                if (r.ok) {
                    const d = await r.json();
                    if (d.status === 'streaming' || d.status === 'waiting') {
                        return true;
                    }
                }
            } catch {}
            return false;
        }

        function startDaemonStream() {
            mode = 'daemon';
            const feed = document.getElementById('feedImg');
            const loading = document.getElementById('loading');

            feed.onload = function() {
                loading.classList.add('hidden');
                feed.style.display = 'block';
                isLive = true;
                updateStatus('live', 'Daemon');
            };
            feed.onerror = function() {
                if (!isLive) {
                    // Daemon failed — fall back to WebRTC
                    startWebRTC();
                } else {
                    setTimeout(() => {
                        if (document.getElementById('feedImg')) {
                            document.getElementById('feedImg').src = DAEMON_URL + '/stream?t=' + Date.now();
                        }
                    }, 2000);
                    updateStatus('reconnecting');
                }
            };

            feed.src = DAEMON_URL + '/stream?' + Date.now();
            
            // Start FPS polling
            pollTimer = setInterval(pollStatus, 2000);
            pollStatus();
        }

        // ── Strategy 2: WebRTC getUserMedia ───────────────────────────────
        async function startWebRTC() {
            mode = 'webrtc';
            const video = document.getElementById('feedVideo');
            const loading = document.getElementById('loading');

            // Hide img element
            document.getElementById('feedImg').style.display = 'none';

            try {
                const constraints = {
                    video: DEVICE_ID
                        ? { deviceId: { exact: DEVICE_ID }, width: { ideal: 1920 }, height: { ideal: 1080 } }
                        : { width: { ideal: 1920 }, height: { ideal: 1080 } }
                };
                const stream = await navigator.mediaDevices.getUserMedia(constraints);
                video.srcObject = stream;
                video.style.display = 'block';
                loading.classList.add('hidden');
                isLive = true;
                updateStatus('webrtc');

                // Track FPS via requestAnimationFrame
                let frames = 0, lastTime = performance.now();
                function countFrames() {
                    frames++;
                    const now = performance.now();
                    if (now - lastTime >= 2000) {
                        const fps = Math.round(frames / ((now - lastTime) / 1000));
                        document.getElementById('fpsDisplay').innerHTML = '<span>' + fps + '</span> FPS · WebRTC';
                        frames = 0;
                        lastTime = now;
                    }
                    requestAnimationFrame(countFrames);
                }
                requestAnimationFrame(countFrames);
            } catch (err) {
                loading.querySelector('.loading-text').textContent = 'Camera access denied or unavailable';
                updateStatus('error');
                console.error('[Popup] WebRTC failed:', err);
            }
        }

        function pollStatus() {
            fetch(DAEMON_URL + '/status', { signal: AbortSignal.timeout(1500) })
                .then(r => r.json())
                .then(d => {
                    const el = document.getElementById('fpsDisplay');
                    if (d.fps !== undefined) {
                        el.innerHTML = '<span>' + d.fps + '</span> FPS · ' + (d.resolution || '?') + ' · ' + d.mode;
                    }
                })
                .catch(() => {});
        }

        // ── Boot: try daemon, fall back to WebRTC ─────────────────────────
        async function boot() {
            updateStatus('connecting');
            const hasDaemon = await tryDaemon();
            if (hasDaemon) {
                console.log('[Popup] Daemon detected — using native MJPEG <img>');
                startDaemonStream();
            } else {
                console.log('[Popup] No daemon — falling back to WebRTC');
                startWebRTC();
            }
        }

        boot();

        window.addEventListener('beforeunload', () => {
            if (pollTimer) clearInterval(pollTimer);
            // Stop WebRTC tracks
            const video = document.getElementById('feedVideo');
            if (video && video.srcObject) {
                video.srcObject.getTracks().forEach(t => t.stop());
            }
        });
    </script>
</body>
</html>`;
    }, [deviceId]);

    // ── Open / manage popup window ────────────────────────────────────────
    const openPopup = useCallback(() => {
        // Reuse existing popup if still open
        if (globalPopupRef && !globalPopupRef.closed) {
            globalPopupRef.focus();
            popupRef.current = globalPopupRef;
            return;
        }

        const screenW = window.screen.availWidth;
        const screenH = window.screen.availHeight;
        const popupW = Math.round(screenW * 0.75);
        const popupH = screenH;

        const popup = window.open(
            "",
            "CameraFeedPopup",
            `width=${popupW},height=${popupH},left=0,top=0,` +
            `menubar=no,toolbar=no,location=no,status=no,scrollbars=no,resizable=yes`
        );

        if (!popup) {
            console.error("[CameraFeedPopup] Popup blocked by browser");
            return;
        }

        popup.document.open();
        popup.document.write(buildPopupHTML());
        popup.document.close();

        globalPopupRef = popup;
        popupRef.current = popup;

        // Detect user closing the popup manually
        const checkClosed = setInterval(() => {
            if (popup.closed) {
                clearInterval(checkClosed);
                globalPopupRef = null;
                popupRef.current = null;
                onPopupClosed?.();
            }
        }, 500);
        checkIntervalRef.current = checkClosed;
    }, [buildPopupHTML, onPopupClosed]);

    // ── Resize popup when toolbar expands/collapses ──────────────────────
    useEffect(() => {
        const popup = popupRef.current;
        if (!popup || popup.closed) return;

        const screenW = window.screen.availWidth;
        const screenH = window.screen.availHeight;

        if (toolbarExpanded) {
            const newW = Math.round(screenW * 0.73);
            try { popup.resizeTo(newW, screenH); popup.moveTo(0, 0); } catch { }
        } else {
            const newW = Math.round(screenW * 0.75);
            try { popup.resizeTo(newW, screenH); popup.moveTo(0, 0); } catch { }
        }
    }, [toolbarExpanded]);

    // ── Lifecycle ─────────────────────────────────────────────────────────
    useEffect(() => {
        if (isOpen) {
            openPopup();
        }
        return () => {
            if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
            if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
            globalPopupRef = null;
            popupRef.current = null;
        };
    }, [isOpen, openPopup]);

    return null;
}
