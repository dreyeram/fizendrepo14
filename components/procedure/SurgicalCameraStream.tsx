"use client";

// =============================================================================
//  SurgicalCameraStream.tsx  ·  SURGICAL GRADE v3.1
//
//  FIXES vs v3.0 (the black screen + WS stall issue):
//
//  FIX 1 — WS code 1005 detection
//    Code 1005 = server closed cleanly with no reason. This happens when
//    the OLD daemon (v2, no WebSocket server) accepts the HTTP upgrade
//    handshake but then immediately closes because it has no /stream
//    WebSocket handler. We now detect this on the first 1-2 attempts and
//    skip WebSocket entirely, going straight to HTTP multipart.
//
//  FIX 2 — black screen on WS reconnect
//    v3.0 used React state (mjpegHasFrame) to control canvas visibility.
//    When WS reconnects, the useEffect re-runs and React re-renders reset
//    mjpegHasFrame to false → canvas hides → black screen.
//    v3.1 uses a ref (hasFrameRef) + imperative DOM style update.
//    Once the canvas is shown, it stays shown through reconnects.
//
//  FIX 3 — HTTP multipart abort on unmount
//    v3.0 didn't abort the fetch when the component unmounted, causing
//    a console error. Added AbortController properly.
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

const MIN_CLIENT_FRAME_BYTES = 5 * 1024;

// =============================================================================
//  WebGL2 shaders
// =============================================================================
const VERT_GLSL = `#version 300 es
in  vec2 aPos;
out vec2 vUV;
void main() {
    vUV         = vec2(aPos.x * 0.5 + 0.5, 1.0 - (aPos.y * 0.5 + 0.5));
    gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG_GLSL = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec3      uWBGain;
uniform float     uSharp;
uniform vec2      uTexel;
in  vec2 vUV;
out vec4 fragColour;

vec3 unsharpMask(sampler2D tex, vec2 uv, vec2 px, float strength) {
    vec3 tl = texture(tex, uv + vec2(-px.x,  px.y)).rgb;
    vec3 tc = texture(tex, uv + vec2( 0.0,   px.y)).rgb;
    vec3 tr = texture(tex, uv + vec2( px.x,  px.y)).rgb;
    vec3 ml = texture(tex, uv + vec2(-px.x,  0.0 )).rgb;
    vec3 mc = texture(tex, uv).rgb;
    vec3 mr = texture(tex, uv + vec2( px.x,  0.0 )).rgb;
    vec3 bl = texture(tex, uv + vec2(-px.x, -px.y)).rgb;
    vec3 bc = texture(tex, uv + vec2( 0.0,  -px.y)).rgb;
    vec3 br = texture(tex, uv + vec2( px.x, -px.y)).rgb;
    vec3 blur = (tl+tr+bl+br)*(1.0/16.0) + (tc+ml+mr+bc)*(2.0/16.0) + mc*(4.0/16.0);
    return clamp(mc + (mc - blur) * strength, 0.0, 1.0);
}

void main() {
    vec3 col  = unsharpMask(uTex, vUV, uTexel, uSharp);
    col      *= uWBGain;
    col       = clamp(col, 0.0, 1.0);
    fragColour = vec4(col, 1.0);
}`;

const QUAD = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);

interface GLState {
    gl: WebGL2RenderingContext;
    prog: WebGLProgram;
    tex: WebGLTexture;
    vao: WebGLVertexArrayObject;
    uWBGain: WebGLUniformLocation;
    uSharp: WebGLUniformLocation;
    uTexel: WebGLUniformLocation;
    uTex: WebGLUniformLocation;
}

function buildGLState(canvas: HTMLCanvasElement): GLState | null {
    const gl = canvas.getContext('webgl2', {
        alpha: false, antialias: false, depth: false, stencil: false,
        powerPreference: 'high-performance', preserveDrawingBuffer: false,
    }) as WebGL2RenderingContext | null;
    if (!gl) return null;

    const compile = (type: number, src: string) => {
        const s = gl.createShader(type)!;
        gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            console.error('[WebGL2]', gl.getShaderInfoLog(s)); gl.deleteShader(s); return null;
        }
        return s;
    };
    const vert = compile(gl.VERTEX_SHADER, VERT_GLSL);
    const frag = compile(gl.FRAGMENT_SHADER, FRAG_GLSL);
    if (!vert || !frag) return null;

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vert); gl.attachShader(prog, frag); gl.linkProgram(prog);
    gl.deleteShader(vert); gl.deleteShader(frag);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.error('[WebGL2] Link error:', gl.getProgramInfoLog(prog)); return null;
    }

    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.useProgram(prog);
    const uWBGain = gl.getUniformLocation(prog, 'uWBGain')!;
    const uSharp = gl.getUniformLocation(prog, 'uSharp')!;
    const uTexel = gl.getUniformLocation(prog, 'uTexel')!;
    const uTex = gl.getUniformLocation(prog, 'uTex')!;
    gl.uniform1i(uTex, 0);

    console.log('[WebGL2] ✓ Pipeline ready — VideoCore VII GPU');
    return { gl, prog, tex, vao, uWBGain, uSharp, uTexel, uTex };
}

function destroyGLState(g: GLState) {
    try { g.gl.deleteTexture(g.tex); } catch { }
    try { g.gl.deleteProgram(g.prog); } catch { }
    try { g.gl.deleteVertexArray(g.vao); } catch { }
}

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
        const canvasDisplayRef = useRef<HTMLCanvasElement>(null);
        const canvasRef = useRef<HTMLCanvasElement | null>(null);
        const videoRef = useRef<HTMLVideoElement>(null);
        const mediaRecorderRef = useRef<MediaRecorder | null>(null);
        const recordedChunksRef = useRef<Blob[]>([]);
        const glStateRef = useRef<GLState | null>(null);

        // ── FIX 2: frame visibility controlled by refs, NOT React state ───────
        // These refs persist through WS reconnects without triggering re-renders
        // that would hide the canvas again.
        const hasFrameRef = useRef(false);   // true once first frame painted
        const canvasVisRef = useRef(false);   // tracks imperative visibility

        // ── React state ───────────────────────────────────────────────────────
        const [status, setStatus] = useState<StreamStatus>('connecting');
        const [hasFrame, setHasFrame] = useState(false);
        const [wrapperSize, setWrapperSize] = useState({ w: 0, h: 0 });
        const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
        const [dragMode, setDragMode] = useState<DragMode>('none');
        const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
        const [dragStartArea, setDragStartArea] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
        const [dragStartPan, setDragStartPan] = useState<{ x: number; y: number } | null>(null);
        const [mjpegMode, setMjpegMode] = useState(false);
        const [glReady, setGlReady] = useState(false);

        useEffect(() => { onStatusChange?.(status); }, [status, onStatusChange]);

        // ── Wrapper size ──────────────────────────────────────────────────────
        useEffect(() => {
            const el = wrapperRef.current;
            if (!el) return;
            const ro = new ResizeObserver((entries) => {
                for (const e of entries) {
                    const { width, height } = e.contentRect;
                    console.log(`[Stream] ResizeObserver: ${width}x${height}`);
                    setWrapperSize({ w: Math.round(width), h: Math.round(height) });
                }
            });
            ro.observe(el);
            const r = el.getBoundingClientRect();
            console.log(`[Stream] Initial size: ${r.width}x${r.height}`);
            setWrapperSize({ w: Math.round(r.width), h: Math.round(r.height) });
            return () => ro.disconnect();
        }, []);

        // ── Daemon detection → WebRTC fallback ────────────────────────────────
        useEffect(() => {
            if (typeof window === 'undefined') return;
            let mediaStream: MediaStream | null = null;
            let active = true;

            const init = async () => {
                const host = window.location.hostname || 'localhost';
                const MAX = 30, GRACE = 5;
                let seen = false;

                for (let i = 1; i <= MAX; i++) {
                    if (!active) return;
                    try {
                        const r = await fetch(`http://${host}:5555/status`, { signal: AbortSignal.timeout(2000) });
                        if (r.ok) {
                            seen = true;
                            const d = await r.json();
                            if (d.status === 'streaming' || d.status === 'waiting') {
                                console.log(`[Camera] Daemon ${d.status} (${d.mode ?? '?'}) — activating MJPEG/WS mode`);
                                if (active) { setMjpegMode(true); setStatus('connected'); }
                                return;
                            }
                        }
                    } catch {
                        if (!seen && i >= GRACE) { console.log('[Camera] No daemon — WebRTC fallback'); break; }
                        console.log(`[Camera] Daemon attempt ${i}/${MAX}...`);
                    }
                    if (i < MAX && active) await new Promise(r => setTimeout(r, 2000));
                }

                if (seen && active) { setMjpegMode(true); setStatus('connected'); return; }

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

        // ── PRIMARY STREAM EFFECT ─────────────────────────────────────────────
        useEffect(() => {
            if (!mjpegMode) return;
            const canvas = canvasDisplayRef.current;
            if (!canvas) return;

            const host = window.location.hostname || 'localhost';

            // WebGL2 init
            let use2D = false;
            if (enhancement) {
                const g = buildGLState(canvas);
                if (g) { glStateRef.current = g; setGlReady(true); }
                else { use2D = true; console.warn('[WebGL2] Not available — 2D canvas'); }
            } else { use2D = true; }

            const ctx2d = use2D ? canvas.getContext('2d') : null;

            let active = true;
            let rafId = 0;
            let retryDelay = 1000;
            let ws: WebSocket | null = null;
            let wsWorked = false;   // true once WS delivers at least one real frame
            let wsAttempts = 0;
            let httpAbort: AbortController | null = null;

            let pendingFrame: ImageBitmap | null = null;

            // ── Imperatively show canvas — survives React re-renders ──────────
            const showCanvas = () => {
                if (canvasVisRef.current) return; // already visible
                const c = canvasDisplayRef.current;
                if (c) { c.style.visibility = 'visible'; canvasVisRef.current = true; }
            };

            // ── RAF vsync paint loop ──────────────────────────────────────────
            const paint = () => {
                if (!active) return;
                rafId = requestAnimationFrame(paint);
                if (!pendingFrame) return;
                const bm = pendingFrame; pendingFrame = null;
                const w = bm.width, h = bm.height;

                if (use2D && ctx2d) {
                    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
                    ctx2d.drawImage(bm, 0, 0);
                } else {
                    const g = glStateRef.current;
                    if (g) {
                        const { gl, prog, tex, vao, uWBGain, uSharp, uTexel } = g;
                        if (canvas.width !== w || canvas.height !== h) {
                            canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h);
                        }
                        gl.bindTexture(gl.TEXTURE_2D, tex);
                        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bm);
                        gl.useProgram(prog);
                        gl.uniform3f(uWBGain, whiteBalance.r, whiteBalance.g, whiteBalance.b);
                        gl.uniform1f(uSharp, sharpening);
                        gl.uniform2f(uTexel, 1.0 / w, 1.0 / h);
                        gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLES, 0, 6); gl.bindVertexArray(null);
                    }
                }
                bm.close();
            };
            rafId = requestAnimationFrame(paint);

            const hasImageDecoder = typeof (window as any).ImageDecoder !== 'undefined';
            console.log(`[Stream] Decoder: ${hasImageDecoder ? 'ImageDecoder API (GPU thread) ✓' : 'createImageBitmap'}`);

            // ── Decode JPEG → ImageBitmap ─────────────────────────────────────
            const decodeJpeg = (data: ArrayBuffer) => {
                const onDecoded = (bm: ImageBitmap) => {
                    if (!active) { bm.close?.(); return; }
                    if (pendingFrame) pendingFrame.close();
                    pendingFrame = bm;
                    if (!hasFrameRef.current) {
                        hasFrameRef.current = true;
                        setHasFrame(true);
                        setStatus('connected');
                        showCanvas();
                        console.log('[Stream] ✓ First frame — surgical-grade live');
                    }
                };

                if (hasImageDecoder) {
                    const dec = new (window as any).ImageDecoder({
                        type: 'image/jpeg',
                        data: data,
                    });
                    dec.decode().then(({ image }: { image: ImageBitmap }) => onDecoded(image)).catch((err: any) => {
                        console.error('[Stream] ImageDecoder failed, trying fallback:', err);
                        const blob = new Blob([data], { type: 'image/jpeg' });
                        createImageBitmap(blob).then(onDecoded).catch(e => console.error('[Stream] Fallback decoder also failed:', e));
                    });
                } else {
                    const blob = new Blob([data], { type: 'image/jpeg' });
                    createImageBitmap(blob).then(onDecoded).catch(err => console.error('[Stream] createImageBitmap failed:', err));
                }
            };

            // ── HTTP multipart fallback ───────────────────────────────────────
            const connectHTTP = async () => {
                if (!active) return;
                console.log('[Stream] HTTP multipart → /stream');
                httpAbort = new AbortController();
                let res: Response;
                try {
                    res = await fetch(`http://${host}:5555/stream`, { signal: httpAbort.signal });
                } catch (e: any) {
                    if (e?.name === 'AbortError') return;
                    if (active) setTimeout(connectHTTP, retryDelay);
                    return;
                }
                if (!res.ok || !res.body) { if (active) setTimeout(connectHTTP, retryDelay); return; }

                const reader = res.body.getReader();
                const SOI = [0xFF, 0xD8], EOI = [0xFF, 0xD9];
                let buf = new Uint8Array(0);

                const indexOf = (h: Uint8Array, n: number[], from: number): number => {
                    outer: for (let i = from; i <= h.length - n.length; i++) {
                        for (let j = 0; j < n.length; j++) if (h[i + j] !== n[j]) continue outer;
                        return i;
                    }
                    return -1;
                };

                try {
                    while (active) {
                        const { value, done } = await reader.read();
                        if (done || !active) break;
                        if (value) {
                            const m = new Uint8Array(buf.length + value.length);
                            m.set(buf); m.set(value, buf.length); buf = m;
                        }
                        while (true) {
                            const s = indexOf(buf, SOI, 0);
                            if (s === -1) { buf = new Uint8Array(0); break; }
                            if (s > 0) buf = buf.slice(s);
                            const e = indexOf(buf, EOI, 2);
                            if (e === -1) break;
                            const jpeg = buf.slice(0, e + 2);
                            buf = buf.slice(e + 2);
                            if (jpeg.length >= MIN_CLIENT_FRAME_BYTES) decodeJpeg(jpeg.buffer as ArrayBuffer);
                        }
                        if (buf.length > 10 * 1024 * 1024) buf = buf.slice(buf.length - 1024 * 1024);
                    }
                } catch { /* stream interrupted */ } finally {
                    reader.releaseLock();
                    if (active) {
                        retryDelay = Math.min(retryDelay * 2, 8000);
                        setTimeout(connectHTTP, retryDelay);
                    }
                }
            };

            // ── WebSocket ─────────────────────────────────────────────────────
            const connectWS = () => {
                if (!active) return;
                wsAttempts++;
                const url = _wsUrl || `ws://${host}:5555/stream`;
                console.log(`[Stream] WS → ${url} (attempt ${wsAttempts})`);

                try {
                    ws = new WebSocket(url);
                } catch (e) {
                    console.error('[Stream] WS constructor failed:', e);
                    if (active) connectHTTP();
                    return;
                }
                ws.binaryType = 'arraybuffer';

                ws.onopen = () => { console.log('[Stream] WS connected ✓'); retryDelay = 1000; };

                ws.onmessage = (evt) => {
                    if (!active) return;
                    if (!(evt.data instanceof ArrayBuffer)) {
                        console.warn('[Stream] Received non-binary WS message:', typeof evt.data);
                        return;
                    }
                    if (evt.data.byteLength < MIN_CLIENT_FRAME_BYTES) {
                        console.warn(`[Stream] WS frame too small: ${evt.data.byteLength} bytes`);
                        return;
                    }
                    if (!wsWorked) console.log(`[Stream] Got first frame via WS: ${evt.data.byteLength} bytes`);
                    wsWorked = true;
                    decodeJpeg(evt.data);
                };

                ws.onclose = (e) => {
                    ws = null;
                    if (!active) return;

                    // ── FIX 1: Detect old daemon (no WS server) ───────────────
                    // Code 1005 = server closed with no status code.
                    // This is exactly what happens when the OLD v2 daemon
                    // accepts the WebSocket upgrade but has no handler.
                    // After 2 attempts with no frames, give up on WS.
                    if (e.code === 1005 && !wsWorked && wsAttempts <= 2) {
                        console.warn('[Stream] WS 1005 — daemon has no WS server (old v2?). Using HTTP multipart.');
                        connectHTTP();
                        return;
                    }

                    // Normal transient disconnect — reconnect with backoff
                    const delay = retryDelay;
                    retryDelay = Math.min(retryDelay * 2, 8000);
                    console.warn(`[Stream] WS closed (${e.code}) — retry in ${delay}ms`);
                    setTimeout(connectWS, delay);
                };

                ws.onerror = () => { /* onclose always follows */ };
            };

            connectWS();

            // Safety: if no frame after 6s, switch to HTTP multipart regardless
            const fallbackTimer = setTimeout(() => {
                if (!hasFrameRef.current && active) {
                    console.warn('[Stream] No frame after 6s — forcing HTTP multipart');
                    ws?.close(); ws = null;
                    connectHTTP();
                }
            }, 6000);

            return () => {
                active = false;
                clearTimeout(fallbackTimer);
                cancelAnimationFrame(rafId);
                ws?.close(); ws = null;
                httpAbort?.abort();
                if (pendingFrame) { pendingFrame.close(); pendingFrame = null; }
                if (glStateRef.current) { destroyGLState(glStateRef.current); glStateRef.current = null; }
            };
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [mjpegMode, enhancement]);

        // ── Live WebGL uniform updates (no context recreation) ────────────────
        useEffect(() => {
            const g = glStateRef.current;
            if (!g) return;
            const { gl, prog, uWBGain, uSharp } = g;
            gl.useProgram(prog);
            gl.uniform3f(uWBGain, whiteBalance.r, whiteBalance.g, whiteBalance.b);
            gl.uniform1f(uSharp, sharpening);
        }, [whiteBalance, sharpening]);

        // ── Daemon FPS + resolution polling ───────────────────────────────────
        useEffect(() => {
            if (!mjpegMode) return;
            const host = window.location.hostname || 'localhost';
            const poll = async () => {
                try {
                    const r = await fetch(`http://${host}:5555/status`, { signal: AbortSignal.timeout(1500) });
                    if (!r.ok) return;
                    const d = await r.json();
                    if (typeof d.fps === 'number') onFpsUpdate?.(d.fps);
                    if (typeof d.resolution === 'string') {
                        const p = d.resolution.split('x').map(Number);
                        if (p.length === 2 && !isNaN(p[0])) onResolutionChange?.(p[0], p[1]);
                    }
                } catch { }
            };
            poll();
            const t = setInterval(poll, 2000);
            return () => clearInterval(t);
        }, [mjpegMode, onFpsUpdate, onResolutionChange]);

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
            if (status === 'streaming' && videoRef.current) {
                const c = document.createElement('canvas'); c.width = videoRef.current.videoWidth || 1920; c.height = videoRef.current.videoHeight || 1080;
                const ctx = c.getContext('2d'); if (ctx) ctx.drawImage(videoRef.current, 0, 0, c.width, c.height);
                return cropAndMask(c, c.width, c.height).toDataURL('image/png', 1.0);
            }
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
        }, []);

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

        const renderGPUBadge = () => {
            if (!glReady || !enhancement) return null;
            return (
                <div className="absolute top-6 left-6 z-[80] pointer-events-none">
                    <div className="flex items-center gap-2 px-2.5 py-1.5 bg-black/40 backdrop-blur-md border border-emerald-500/20 rounded-xl shadow-lg">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        <span className="text-[9px] font-bold text-emerald-300 uppercase tracking-widest leading-none">GPU Enhanced</span>
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
                    {/* PRIMARY: WebGL2/2D canvas — starts hidden, shown imperatively on first frame */}
                    {mjpegMode && (
                        <canvas
                            ref={canvasDisplayRef}
                            className="pointer-events-none absolute inset-0 w-full h-full"
                            style={{
                                display: 'block',
                                visibility: hasFrame ? 'visible' : 'hidden',
                                transform: mirrored ? 'scaleX(-1)' : 'none',
                                imageRendering: 'auto',
                                zIndex: 10,
                            }}
                        />
                    )}
                    {/* FALLBACK: WebRTC getUserMedia */}
                    <video ref={videoRef} autoPlay playsInline muted
                        className="pointer-events-none absolute inset-0 w-full h-full z-0"
                        style={{ ...videoInnerStyle, display: status === 'streaming' ? 'block' : 'none' }}
                    />

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
                {renderGPUBadge()}
            </div>
        );
    }
);

export default SurgicalCameraStream;