// ═══════════════════════════════════════════════════════════════════
//  Pi Capture Daemon — Direct MJPEG Capture from USB Camera
//  
//  Uses ffmpeg to read MJPEG frames directly from /dev/video0.
//  The camera natively outputs MJPEG, so -c:v copy = ZERO CPU transcode.
//  Frames are extracted from ffmpeg's stdout and served via HTTP.
//
//  Endpoints:
//    GET /stream   → MJPEG stream (multipart/x-mixed-replace)
//    GET /capture  → Single JPEG frame (latest from RAM)
//    GET /status   → JSON status { status: 'streaming' | 'waiting' }
//    GET /record/start → Start recording to MP4
//    GET /record/stop  → Stop recording
//    GET /ptz?pan=&tilt=&zoom= → PTZ camera controls
// ═══════════════════════════════════════════════════════════════════

const http = require('http');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

// ─── Configuration ───────────────────────────────────────────────
const VIDEO_DEVICE = process.env.VIDEO_DEVICE || '/dev/video0';
const WIDTH = process.env.WIDTH || '1920';
const HEIGHT = process.env.HEIGHT || '1080';
const FRAMERATE = process.env.FRAMERATE || '30';
const HTTP_PORT = 5555;

// ─── State ───────────────────────────────────────────────────────
let latestFrame = null;
let ffmpegProcess = null;
let currentBuffer = Buffer.alloc(0);
let activeRecordingProcess = null;
let recordingFilePath = null;

// Frame event emitter — notifies /stream clients when a new frame arrives
const frameEmitter = new EventEmitter();
frameEmitter.setMaxListeners(20);

// JPEG markers
const JPEG_SOI = Buffer.from([0xFF, 0xD8]); // Start Of Image
const JPEG_EOI = Buffer.from([0xFF, 0xD9]); // End Of Image

const MAX_BUFFER_SIZE = 10 * 1024 * 1024; // 10MB safety cap

// ─── FFmpeg Direct Capture ───────────────────────────────────────
// Reads MJPEG frames directly from the USB capture card.
// -c:v copy = zero transcode (camera outputs MJPEG natively)
// -f image2pipe = outputs individual JPEG frames to stdout
// ─────────────────────────────────────────────────────────────────
function startCapture() {
    if (ffmpegProcess) {
        console.log('[Capture] Already running, skipping restart.');
        return;
    }

    // Wait for device to exist
    if (!fs.existsSync(VIDEO_DEVICE)) {
        console.log(`[Capture] Waiting for ${VIDEO_DEVICE}...`);
        setTimeout(startCapture, 2000);
        return;
    }

    console.log(`[Capture] Starting ffmpeg: ${VIDEO_DEVICE} ${WIDTH}x${HEIGHT}@${FRAMERATE}fps`);

    ffmpegProcess = spawn('ffmpeg', [
        '-f', 'v4l2',
        '-input_format', 'mjpeg',
        '-video_size', `${WIDTH}x${HEIGHT}`,
        '-framerate', FRAMERATE,
        '-i', VIDEO_DEVICE,
        '-c:v', 'copy',          // Zero transcode — pass MJPEG through untouched
        '-f', 'image2pipe',      // Output individual JPEG frames to stdout
        '-vcodec', 'mjpeg',
        '-'                      // Output to stdout
    ], {
        stdio: ['pipe', 'pipe', 'pipe']  // stdin, stdout, stderr
    });

    currentBuffer = Buffer.alloc(0);

    ffmpegProcess.stdout.on('data', (data) => {
        currentBuffer = Buffer.concat([currentBuffer, data]);

        // Safety: cap buffer size
        if (currentBuffer.length > MAX_BUFFER_SIZE) {
            currentBuffer = currentBuffer.subarray(currentBuffer.length - 2 * 1024 * 1024);
        }

        // Extract complete JPEG frames
        while (true) {
            const startIdx = currentBuffer.indexOf(JPEG_SOI);
            if (startIdx === -1) {
                currentBuffer = Buffer.alloc(0);
                break;
            }

            // Discard garbage before SOI
            if (startIdx > 0) {
                currentBuffer = currentBuffer.subarray(startIdx);
            }

            // Find EOI after SOI
            const endIdx = currentBuffer.indexOf(JPEG_EOI, 2);
            if (endIdx === -1) {
                break; // Incomplete frame — wait for more data
            }

            // Complete frame!
            const frame = Buffer.from(currentBuffer.subarray(0, endIdx + 2));
            currentBuffer = currentBuffer.subarray(endIdx + 2);
            latestFrame = frame;
            frameEmitter.emit('frame', frame);
        }
    });

    ffmpegProcess.stderr.on('data', (data) => {
        const msg = data.toString().trim();
        // Only log non-progress lines (avoid flooding)
        if (msg && !msg.startsWith('frame=') && !msg.startsWith('size=')) {
            console.log(`[ffmpeg] ${msg}`);
        }
    });

    ffmpegProcess.on('close', (code) => {
        console.log(`[Capture] ffmpeg exited with code ${code}. Restarting in 3s...`);
        ffmpegProcess = null;
        latestFrame = null;
        currentBuffer = Buffer.alloc(0);
        setTimeout(startCapture, 3000);
    });

    ffmpegProcess.on('error', (err) => {
        console.error(`[Capture] ffmpeg spawn error: ${err.message}`);
        ffmpegProcess = null;
        setTimeout(startCapture, 3000);
    });
}

// Start capturing
startCapture();

// ─── HTTP API Server ─────────────────────────────────────────────
const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // ── GET /capture — Single JPEG frame ──
    if (pathname === '/capture' && req.method === 'GET') {
        if (latestFrame) {
            res.writeHead(200, {
                'Content-Type': 'image/jpeg',
                'Content-Length': latestFrame.length,
                'Cache-Control': 'no-cache'
            });
            res.end(latestFrame);
        } else {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'No frame available yet' }));
        }

        // ── GET /status — JSON status ──
    } else if (pathname === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: latestFrame ? 'streaming' : 'waiting' }));

        // ── GET /stream — MJPEG live stream ──
    } else if (pathname === '/stream') {
        // multipart/x-mixed-replace — browser-native MJPEG rendering
        // The browser handles frame timing and double buffering internally
        const BOUNDARY = '--frame';
        res.writeHead(200, {
            'Content-Type': `multipart/x-mixed-replace; boundary=frame`,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Connection': 'keep-alive',
        });

        function sendFrame(frame) {
            try {
                res.write(`${BOUNDARY}\r\n`);
                res.write(`Content-Type: image/jpeg\r\n`);
                res.write(`Content-Length: ${frame.length}\r\n`);
                res.write(`\r\n`);
                res.write(frame);
                res.write(`\r\n`);
            } catch {
                // Client disconnected
            }
        }

        // Send current frame immediately
        if (latestFrame) sendFrame(latestFrame);

        // Push new frames as they arrive
        const onFrame = (frame) => sendFrame(frame);
        frameEmitter.on('frame', onFrame);

        req.on('close', () => {
            frameEmitter.removeListener('frame', onFrame);
        });

        // ── GET /record/start — Start MP4 recording ──
    } else if (pathname.startsWith('/record/start')) {
        if (activeRecordingProcess) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Already recording' }));
            return;
        }

        const mediaDir = path.join(process.cwd(), 'data', 'media');
        if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });

        const filename = `record_${Date.now()}.mp4`;
        recordingFilePath = path.join(mediaDir, filename);

        console.log(`[Record] Starting → ${recordingFilePath}`);

        // Record directly from the camera device
        activeRecordingProcess = spawn('ffmpeg', [
            '-f', 'v4l2',
            '-input_format', 'mjpeg',
            '-video_size', `${WIDTH}x${HEIGHT}`,
            '-framerate', FRAMERATE,
            '-i', VIDEO_DEVICE,
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '28',
            '-y',
            recordingFilePath
        ]);

        activeRecordingProcess.stderr.on('data', () => { });
        activeRecordingProcess.on('close', (code) => {
            console.log(`[Record] ffmpeg exited with code ${code}`);
            activeRecordingProcess = null;
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'recording_started', filePath: `/data/media/${filename}` }));

        // ── GET /record/stop — Stop recording ──
    } else if (pathname.startsWith('/record/stop')) {
        if (!activeRecordingProcess) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not recording' }));
            return;
        }

        console.log('[Record] Stopping...');
        activeRecordingProcess.stdin.write('q\n');

        const savedUrl = `/api/capture-serve?path=${encodeURIComponent(recordingFilePath)}`;
        activeRecordingProcess = null;
        recordingFilePath = null;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success', filename: savedUrl }));

        // ── GET /ptz — Camera PTZ controls ──
    } else if (pathname.startsWith('/ptz')) {
        const urlParams = parsedUrl.searchParams;
        let commands = [];

        if (urlParams.has('zoom')) commands.push(`zoom_absolute=${urlParams.get('zoom')}`);
        if (urlParams.has('pan')) commands.push(`pan_absolute=${urlParams.get('pan')}`);
        if (urlParams.has('tilt')) commands.push(`tilt_absolute=${urlParams.get('tilt')}`);

        if (commands.length > 0) {
            exec(`v4l2-ctl -d ${VIDEO_DEVICE} -c ${commands.join(',')}`, (err) => {
                if (err) console.error('[PTZ] Command failed:', err.message);
            });
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success' }));

    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

server.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log('═══════════════════════════════════════════════════');
    console.log(` PI CAPTURE DAEMON — http://0.0.0.0:${HTTP_PORT}`);
    console.log(` Camera: ${VIDEO_DEVICE} ${WIDTH}x${HEIGHT}@${FRAMERATE}fps`);
    console.log(` Mode: Direct ffmpeg capture (zero transcode)`);
    console.log('═══════════════════════════════════════════════════');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('[Daemon] SIGTERM received, shutting down...');
    if (ffmpegProcess) ffmpegProcess.kill('SIGTERM');
    if (activeRecordingProcess) activeRecordingProcess.kill('SIGTERM');
    server.close();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('[Daemon] SIGINT received, shutting down...');
    if (ffmpegProcess) ffmpegProcess.kill('SIGTERM');
    if (activeRecordingProcess) activeRecordingProcess.kill('SIGTERM');
    server.close();
    process.exit(0);
});
