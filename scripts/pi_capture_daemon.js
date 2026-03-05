'use strict';

// =============================================================================
//  pi_capture_daemon.js  ·  SURGICAL GRADE v4.1
//  Zero-latency MJPEG → WebSocket pipeline for ENT endoscopy — Raspberry Pi 5
//
//  ROOT CAUSE FIX (v4 → v4.1):
//    v4 used node-webcam/fswebcam which writes JPEG to a temp file then reads
//    it back. This adds a few bytes of filesystem overhead and can produce
//    frames that are technically valid JPEGs but which the browser's
//    ImageDecoder API silently rejects — causing the client to time out and
//    disconnect with code 1005 every 5 seconds with a black screen.
//
//    v4.1 goes back to direct ffmpeg stdout pipe — proven to produce clean
//    JPEG bytes — but now feeds those frames into the WebSocket server.
//    WebSocket is kept because it's still faster than HTTP multipart.
//
//  ARCHITECTURE:
//    ffmpeg -f v4l2 ... -f image2pipe → stdout
//      → JPEG frame parser (SOI/EOI boundary detection)
//      → emitFrame() ghost-frame filter (< 5KB dropped)
//      → frameEmitter event bus
//      → WebSocket clients (binary ArrayBuffer, no envelope)
//      → HTTP multipart clients (legacy fallback)
//
//  ENDPOINTS:
//    ws://PI:5555/stream      PRIMARY  — binary JPEG frames
//    GET /stream              LEGACY   — HTTP multipart
//    GET /capture             Snapshot JPEG
//    GET /status              JSON stats
//    GET /health              PM2 liveness
//    GET /record/start|stop   MP4 recording
//    GET /ptz                 PTZ via v4l2-ctl
// =============================================================================

const http = require('http');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

// ── WebSocket (required) ────────────────────────────────────────────────────
let WebSocketServer = null;
try {
    WebSocketServer = require('ws').WebSocketServer;
    console.log('[Boot] ws  ✓  WebSocket binary stream enabled');
} catch {
    console.warn('[Boot] ws not installed — HTTP multipart only');
    console.warn('[Boot] Fix: npm install ws');
}

// ── Config ──────────────────────────────────────────────────────────────────
const VIDEO_DEVICE = process.env.VIDEO_DEVICE || '/dev/video0';
const RESOLUTION = process.env.RESOLUTION || '1920x1080';
const FRAMERATE = parseInt(process.env.FRAMERATE || '30', 10);
const HTTP_PORT = parseInt(process.env.PORT || '5555', 10);
const [CAM_W, CAM_H] = RESOLUTION.split('x').map(Number);

// Ghost frame guard — anything below 5 KB is a corrupt/empty frame
const MIN_FRAME_BYTES = 5 * 1024;
const MAX_PARSE_BUF = 20 * 1024 * 1024;

// ── State ───────────────────────────────────────────────────────────────────
let latestFrame = null;
let ffmpegProc = null;
let parseBuffer = Buffer.alloc(0);
let activeRecordingProc = null;
let recordingFilePath = null;
let retryDelay = 2000;
const MAX_RETRY = 30000;

let frameCount = 0;
let droppedCount = 0;
let currentFps = 0;
let _lastCount = 0;
let _lastTime = Date.now();
const startTime = Date.now();

setInterval(() => {
    const now = Date.now();
    currentFps = Math.round((frameCount - _lastCount) / ((now - _lastTime) / 1000));
    _lastCount = frameCount;
    _lastTime = now;
}, 1000);

const frameEmitter = new EventEmitter();
frameEmitter.setMaxListeners(200);

const JPEG_SOI = Buffer.from([0xFF, 0xD8]);
const JPEG_EOI = Buffer.from([0xFF, 0xD9]);

// ── Single emission point ────────────────────────────────────────────────────
function emitFrame(frame) {
    if (!Buffer.isBuffer(frame) || frame.length < MIN_FRAME_BYTES) {
        droppedCount++;
        if (droppedCount % 50 === 1)
            console.warn(`[Capture] Ghost frame #${droppedCount} dropped (${frame?.length ?? 0} bytes)`);
        return;
    }
    latestFrame = frame;
    frameCount++;
    frameEmitter.emit('frame', frame);
}

// =============================================================================
//  ffmpeg capture — direct V4L2 → stdout pipe
//
//  Key flags for surgical-grade latency:
//    -probesize 32           skip stream analysis (saves ~500ms startup)
//    -analyzeduration 0      skip duration analysis
//    -fflags +nobuffer       disable ffmpeg's internal frame buffer
//    -avioflags +direct      disable OS read buffering
//    -flush_packets 1        flush every packet immediately
// =============================================================================
function startCapture() {
    if (ffmpegProc) return;

    if (!fs.existsSync(VIDEO_DEVICE)) {
        console.log(`[ffmpeg] ${VIDEO_DEVICE} not found — retry in 2s`);
        setTimeout(startCapture, 2000);
        return;
    }

    console.log(`[ffmpeg] Starting: ${VIDEO_DEVICE}  ${CAM_W}x${CAM_H}@${FRAMERATE}fps`);

    ffmpegProc = spawn('ffmpeg', [
        '-loglevel', 'error',
        '-f', 'v4l2',
        '-input_format', 'mjpeg',
        '-video_size', `${CAM_W}x${CAM_H}`,
        '-framerate', String(FRAMERATE),
        '-probesize', '32',
        '-analyzeduration', '0',
        '-use_wallclock_as_timestamps', '1',
        '-i', VIDEO_DEVICE,
        '-c:v', 'copy',
        '-fflags', '+nobuffer+discardcorrupt+flush_packets',
        '-avioflags', '+direct',
        '-flush_packets', '1',
        '-f', 'image2pipe',
        '-vcodec', 'mjpeg',
        'pipe:1',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    parseBuffer = Buffer.alloc(0);

    ffmpegProc.stdout.on('data', (chunk) => {
        parseBuffer = Buffer.concat([parseBuffer, chunk]);

        if (parseBuffer.length > MAX_PARSE_BUF) {
            console.warn('[ffmpeg] Buffer overflow — trimming');
            parseBuffer = parseBuffer.slice(parseBuffer.length - 2 * 1024 * 1024);
        }

        // Extract complete JPEG frames using SOI/EOI markers
        while (true) {
            const soi = parseBuffer.indexOf(JPEG_SOI);
            if (soi === -1) { parseBuffer = Buffer.alloc(0); break; }
            if (soi > 0) { parseBuffer = parseBuffer.slice(soi); }

            const eoi = parseBuffer.indexOf(JPEG_EOI, 2);
            if (eoi === -1) break; // incomplete — wait for more data

            // Extract the complete JPEG (SOI → EOI inclusive)
            emitFrame(Buffer.from(parseBuffer.slice(0, eoi + 2)));
            parseBuffer = parseBuffer.slice(eoi + 2);
        }
    });

    ffmpegProc.stderr.on('data', (d) => {
        const msg = d.toString().trim();
        // Filter out the high-frequency stats lines
        if (msg && !msg.includes('frame=') && !msg.includes('fps=') && !msg.includes('speed=')) {
            console.error(`[ffmpeg] ${msg}`);
        }
    });

    ffmpegProc.on('close', (code) => {
        console.log(`[ffmpeg] Exited (${code}) — restart in ${retryDelay}ms`);
        ffmpegProc = null;
        latestFrame = null;
        parseBuffer = Buffer.alloc(0);
        setTimeout(() => {
            retryDelay = Math.min(retryDelay * 2, MAX_RETRY);
            startCapture();
        }, retryDelay);
    });

    ffmpegProc.on('error', (err) => {
        console.error(`[ffmpeg] Spawn error: ${err.message}`);
        ffmpegProc = null;
        setTimeout(() => { retryDelay = Math.min(retryDelay * 2, MAX_RETRY); startCapture(); }, retryDelay);
    });

    frameEmitter.once('frame', () => {
        retryDelay = 2000;
        console.log(`[ffmpeg] ✓ First frame — ${latestFrame?.length?.toLocaleString() ?? '?'} bytes — stream live`);
    });
}

startCapture();

// =============================================================================
//  HTTP SERVER
// =============================================================================
function buildMjpegPart(buf) {
    return Buffer.concat([
        Buffer.from('--frame\r\nContent-Type: image/jpeg\r\n\r\n'),
        buf,
        Buffer.from('\r\n'),
    ]);
}

const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    // ── /capture ──────────────────────────────────────────────────────────
    if (p === '/capture') {
        if (!latestFrame) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'No frame yet' }));
            return;
        }
        res.writeHead(200, {
            'Content-Type': 'image/jpeg',
            'Content-Length': latestFrame.length,
            'Cache-Control': 'no-cache',
            'X-Frame-Number': String(frameCount),
        });
        res.end(latestFrame);
        return;
    }

    // ── /status ───────────────────────────────────────────────────────────
    if (p === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
        res.end(JSON.stringify({
            status: latestFrame ? 'streaming' : 'waiting',
            mode: 'ffmpeg',
            fps: currentFps,
            resolution: `${CAM_W}x${CAM_H}`,
            framerate: FRAMERATE,
            uptime: Math.round((Date.now() - startTime) / 1000),
            frames: frameCount,
            dropped: droppedCount,
            device: VIDEO_DEVICE,
            recording: !!activeRecordingProc,
        }));
        return;
    }

    // ── /health ───────────────────────────────────────────────────────────
    if (p === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, uptime: Math.round((Date.now() - startTime) / 1000) }));
        return;
    }

    // ── /stream  (legacy HTTP multipart — backward compat) ────────────────
    if (p === '/stream') {
        res.writeHead(200, {
            'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
            'Cache-Control': 'no-cache, no-store',
            'Connection': 'keep-alive',
        });
        if (latestFrame) { try { res.write(buildMjpegPart(latestFrame)); } catch { } }
        const onF = (f) => { try { res.write(buildMjpegPart(f)); } catch { frameEmitter.removeListener('frame', onF); } };
        frameEmitter.on('frame', onF);
        req.on('close', () => frameEmitter.removeListener('frame', onF));
        return;
    }

    // ── /record/start ─────────────────────────────────────────────────────
    if (p.startsWith('/record/start')) {
        if (activeRecordingProc) {
            res.writeHead(409, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Already recording' }));
            return;
        }
        const mediaDir = path.join(process.cwd(), 'data', 'media');
        fs.mkdirSync(mediaDir, { recursive: true });
        const filename = `ent_${Date.now()}.mp4`;
        recordingFilePath = path.join(mediaDir, filename);
        activeRecordingProc = spawn('ffmpeg', [
            '-loglevel', 'error',
            '-f', 'v4l2', '-input_format', 'mjpeg',
            '-video_size', `${CAM_W}x${CAM_H}`, '-framerate', String(FRAMERATE),
            '-i', VIDEO_DEVICE,
            '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '22',
            '-movflags', '+faststart', '-y', recordingFilePath,
        ], { stdio: ['pipe', 'ignore', 'ignore'] });
        activeRecordingProc.on('close', () => { activeRecordingProc = null; });
        activeRecordingProc.on('error', (e) => { console.error('[Record]', e.message); activeRecordingProc = null; });
        console.log(`[Record] Started → ${recordingFilePath}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'recording_started', file: filename }));
        return;
    }

    // ── /record/stop ──────────────────────────────────────────────────────
    if (p.startsWith('/record/stop')) {
        if (!activeRecordingProc) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not recording' }));
            return;
        }
        try { activeRecordingProc.stdin.write('q\n'); } catch { activeRecordingProc.kill('SIGTERM'); }
        const saved = recordingFilePath;
        activeRecordingProc = null; recordingFilePath = null;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'stopped', filename: `/api/capture-serve?path=${encodeURIComponent(saved)}` }));
        return;
    }

    // ── /ptz ──────────────────────────────────────────────────────────────
    if (p.startsWith('/ptz')) {
        const sp = url.searchParams;
        const cmds = [];
        if (sp.has('zoom')) cmds.push(`zoom_absolute=${parseInt(sp.get('zoom'), 10)}`);
        if (sp.has('pan')) cmds.push(`pan_absolute=${parseInt(sp.get('pan'), 10)}`);
        if (sp.has('tilt')) cmds.push(`tilt_absolute=${parseInt(sp.get('tilt'), 10)}`);
        if (sp.has('focus')) cmds.push(`focus_absolute=${parseInt(sp.get('focus'), 10)}`);
        if (cmds.length) exec(`v4l2-ctl -d ${VIDEO_DEVICE} -c ${cmds.join(',')}`, (e) => { if (e) console.error('[PTZ]', e.message); });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', applied: cmds }));
        return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found', ws: `ws://localhost:${HTTP_PORT}/stream` }));
});

server.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log('=============================================================');
    console.log(' SURGICAL CAPTURE DAEMON v4.1  [ffmpeg → WebSocket]');
    console.log(` Device  : ${VIDEO_DEVICE}  ${CAM_W}x${CAM_H}@${FRAMERATE}fps`);
    console.log(` WS      : ws://0.0.0.0:${HTTP_PORT}/stream   ← PRIMARY`);
    console.log(` HTTP    : http://0.0.0.0:${HTTP_PORT}/stream  (legacy fallback)`);
    console.log(` Capture : http://0.0.0.0:${HTTP_PORT}/capture`);
    console.log(` Status  : http://0.0.0.0:${HTTP_PORT}/status`);
    console.log('=============================================================');
});

server.on('error', (e) => { console.error('[Server]', e.message); process.exit(1); });

// =============================================================================
//  WEBSOCKET SERVER
//
//  Each message = one complete JPEG frame (raw bytes, no envelope).
//  bufferedAmount guard: if the socket buffer has unsent data, drop the
//  new frame instead of queuing. This keeps latency at zero — the client
//  always sees the LATEST frame, never a backlog of old ones.
// =============================================================================
if (WebSocketServer) {
    const wss = new WebSocketServer({ server });

    wss.on('connection', (ws, req) => {
        const reqUrl = new URL(req.url, 'http://localhost');
        if (reqUrl.pathname !== '/stream') { ws.close(1008, 'wrong path'); return; }

        console.log(`[WS] Client connected  (total: ${wss.clients.size})`);

        // Send latest frame immediately — client displays without waiting
        if (latestFrame && ws.readyState === ws.OPEN) {
            ws.send(latestFrame, { binary: true });
        }

        const onFrame = (frame) => {
            if (ws.readyState !== ws.OPEN) {
                frameEmitter.removeListener('frame', onFrame);
                return;
            }
            // Drop frame if client falling behind — prevents latency drift
            if (ws.bufferedAmount > 0) return;

            ws.send(frame, { binary: true }, (err) => {
                if (err) frameEmitter.removeListener('frame', onFrame);
            });
        };

        frameEmitter.on('frame', onFrame);

        ws.on('close', (code) => {
            frameEmitter.removeListener('frame', onFrame);
            console.log(`[WS] Client disconnected (${code})  (total: ${wss.clients.size})`);
        });

        ws.on('error', () => frameEmitter.removeListener('frame', onFrame));
    });

    console.log(`[WS] WebSocket server active on port ${HTTP_PORT}`);
}

// =============================================================================
//  GRACEFUL SHUTDOWN
// =============================================================================
function shutdown(sig) {
    console.log(`\n[Daemon] ${sig} — shutting down`);
    if (activeRecordingProc) { try { activeRecordingProc.stdin.write('q\n'); } catch { } }
    if (ffmpegProc) { ffmpegProc.kill('SIGTERM'); ffmpegProc = null; }
    server.close(() => { console.log('[Daemon] Done.'); process.exit(0); });
    setTimeout(() => process.exit(1), 5000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (r) => console.error('[Daemon] UnhandledRejection:', r));
process.on('uncaughtException', (e) => console.error('[Daemon] UncaughtException:', e.message));