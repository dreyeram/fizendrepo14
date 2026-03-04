#!/usr/bin/env python3
"""
pi_capture_daemon.py  — Ultra-simple MJPEG capture daemon
==========================================================
Philosophy: DO LESS. The simplest possible path = lowest latency + zero tearing.

Pipeline:
  V4L2 camera  →  OpenCV cap.read() (YUYV raw, then decoded to BGR)
               →  cv2.imencode('.jpg')  (Pi CPU → clean JPEG, no hardware encoder)
               →  multipart/x-mixed-replace HTTP stream

The browser receives a clean MJPEG stream, identical to the reference Django app.
The frontend renders it on a Canvas via requestAnimationFrame for vsync-correct display.

Endpoints:
  GET /stream      — MJPEG multipart stream  (consumed by Canvas fetch reader)
  GET /capture     — Latest frame as image/jpeg
  GET /status      — JSON {status, fps}
  OPTIONS *        — CORS preflight
"""

import os, cv2, time, json, threading, io
from http.server import HTTPServer, BaseHTTPRequestHandler

# ─── Config (set via PM2 env) ────────────────────────────────────
DEVICE_INDEX = int(os.environ.get('VIDEO_DEVICE_INDEX', '0'))
DEVICE_PATH  = f'/dev/video{DEVICE_INDEX}'
WIDTH        = int(os.environ.get('WIDTH',        '1920'))
HEIGHT       = int(os.environ.get('HEIGHT',       '1080'))
FPS          = int(os.environ.get('FRAMERATE',    '30'))
QUALITY      = int(os.environ.get('JPEG_QUALITY', '85'))
PORT         = int(os.environ.get('HTTP_PORT',    '5555'))

# ─── Shared frame state ──────────────────────────────────────────
_lock         = threading.Lock()
_frame_jpeg   = None     # bytes of latest JPEG
_frame_event  = threading.Event()
_capture_fps  = 0.0

ENCODE_PARAMS = [cv2.IMWRITE_JPEG_QUALITY, QUALITY]


def apply_hardware_controls():
    """Strip hardware ISP post-processing that causes halo/shimmer artifacts."""
    cmds = [
        f'v4l2-ctl -d {DEVICE_PATH} --set-ctrl=power_line_frequency=1',  # 50 Hz (India)
        f'v4l2-ctl -d {DEVICE_PATH} --set-ctrl=sharpness=0',             # no ringing
        f'v4l2-ctl -d {DEVICE_PATH} --set-ctrl=backlight_compensation=0',# no banding
    ]
    for cmd in cmds:
        os.system(cmd + ' 2>/dev/null')


def capture_thread():
    """Capture frames from the camera and push to shared state."""
    global _frame_jpeg, _capture_fps

    apply_hardware_controls()

    while True:
        print(f'[Capture] Opening {DEVICE_PATH} (index {DEVICE_INDEX})…')
        cap = cv2.VideoCapture(DEVICE_INDEX, cv2.CAP_V4L2)

        if not cap.isOpened():
            print('[Capture] ERROR: Camera not found — retrying in 3 s')
            time.sleep(3)
            continue

        # Request resolution/fps.  Do NOT set FOURCC=MJPG — that activates the
        # hardware MJPEG encoder which produces corrupted frames on this card.
        # Default (YUYV/uncompressed) → OpenCV decodes cleanly to BGR.
        # Default to 720p if not specified — more stable for USB bandwidth
        target_w = WIDTH if WIDTH > 0 else 1280
        target_h = HEIGHT if HEIGHT > 0 else 720
        
        cap.set(cv2.CAP_PROP_FRAME_WIDTH,  target_w)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, target_h)
        cap.set(cv2.CAP_PROP_FPS,          30) # Force 30 for stability

        aw = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        ah = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        print(f'[Capture] {aw}×{ah} capture active')

        while True:
            # Use grab() + retrieve() for more atomic buffer synchronization
            ok = cap.grab()
            if not ok: continue
            
            ok, bgr = cap.retrieve()
            if not ok or bgr is None: continue

            # ── SMOOTH ARTIFACTS ─────────────────────────────────────
            # A 3x3 median blur is the "magic bullet" for hospital 1080i
            # "comb" artifacts. It removes the jaggies without the
            # 50% resolution loss of bob-deinterlacing.
            # ─────────────────────────────────────────────────────────
            try:
                bgr = cv2.medianBlur(bgr, 3)
                ret, buf = cv2.imencode('.jpg', bgr, ENCODE_PARAMS)
            except cv2.error:
                continue
            if not ret:
                continue

            jpeg = buf.tobytes()

            with _lock:
                _frame_jpeg = jpeg

            _frame_event.set()
            _frame_event.clear()

            n_frames += 1
            elapsed = time.time() - t0
            if elapsed >= 2.0:
                _capture_fps = n_frames / elapsed
                n_frames = 0
                t0 = time.time()

        cap.release()


# ─── HTTP handler ────────────────────────────────────────────────

class Handler(BaseHTTPRequestHandler):
    """Minimal HTTP handler — MJPEG stream + single-frame capture + status."""

    def log_message(self, *args):
        pass   # silence per-request logging

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin',  '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_GET(self):
        path = self.path.split('?')[0]
        if path == '/stream':
            self._stream()
        elif path == '/capture':
            self._capture()
        elif path == '/status':
            self._status()
        else:
            self.send_response(404)
            self.end_headers()

    # ── /stream ──────────────────────────────────────────────────
    def _stream(self):
        """
        Standard multipart/x-mixed-replace MJPEG stream.
        Format exactly matches the reference Django app:
          --frame\r\n
          Content-Type: image/jpeg\r\n\r\n
          {JPEG bytes}\r\n
        """
        self.send_response(200)
        self.send_header('Content-Type',  'multipart/x-mixed-replace; boundary=frame')
        self.send_header('Cache-Control', 'no-cache, no-store')
        self.send_header('Connection',    'keep-alive')
        self.send_header('Pragma',        'no-cache')
        self._cors()
        self.end_headers()

        try:
            while True:
                _frame_event.wait(timeout=3.0)
                with _lock:
                    jpeg = _frame_jpeg
                if jpeg is None:
                    continue
                part = (
                    b'--frame\r\n'
                    b'Content-Type: image/jpeg\r\n\r\n' +
                    jpeg +
                    b'\r\n'
                )
                self.wfile.write(part)
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass   # client disconnected

    # ── /capture ─────────────────────────────────────────────────
    def _capture(self):
        with _lock:
            jpeg = _frame_jpeg
        if jpeg is None:
            self.send_response(503)
            self.send_header('Content-Type', 'application/json')
            self._cors()
            self.end_headers()
            self.wfile.write(b'{"error":"no frame yet"}')
            return
        self.send_response(200)
        self.send_header('Content-Type',   'image/jpeg')
        self.send_header('Content-Length', str(len(jpeg)))
        self.send_header('Cache-Control',  'no-cache')
        self._cors()
        self.end_headers()
        self.wfile.write(jpeg)

    # ── /status ──────────────────────────────────────────────────
    def _status(self):
        with _lock:
            have = _frame_jpeg is not None
        body = json.dumps({'status': 'streaming' if have else 'waiting',
                           'fps': round(_capture_fps, 1)}).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self._cors()
        self.end_headers()
        self.wfile.write(body)


class ThreadedServer(HTTPServer):
    """Each HTTP request gets its own daemon thread."""
    def process_request(self, req, addr):
        t = threading.Thread(target=self._handle1, args=(req, addr), daemon=True)
        t.start()

    def _handle1(self, req, addr):
        try:
            self.finish_request(req, addr)
        except Exception:
            self.handle_error(req, addr)
        finally:
            self.shutdown_request(req)


if __name__ == '__main__':
    print('═══════════════════════════════════════════════════════')
    print(f' PI CAPTURE DAEMON  (Python + OpenCV)')
    print(f' Device  : {DEVICE_PATH}  ({WIDTH}×{HEIGHT} @{FPS} fps)')
    print(f' Quality : JPEG {QUALITY}%')
    print(f' Stream  : http://0.0.0.0:{PORT}/stream')
    print('═══════════════════════════════════════════════════════')

    # Capture thread runs independently, feeds _frame_jpeg
    threading.Thread(target=capture_thread, daemon=True).start()

    # HTTP server — blocks forever
    srv = ThreadedServer(('0.0.0.0', PORT), Handler)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print('\n[Shutdown]')
        srv.shutdown()
