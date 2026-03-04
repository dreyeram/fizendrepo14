#!/usr/bin/env python3
"""
pi_capture_daemon.py — OpenCV MJPEG capture daemon

Exact clone of the reference Pi Django app's camera pipeline:
  cv2.VideoCapture(0) → cap.read() → cv2.imencode('.jpg') → stream

This guarantees:
  1. Complete frames (cap.read() returns a fully decoded frame)
  2. Clean JPEG encoding (cv2.imencode handles it perfectly)
  3. Zero tearing (no JPEG boundary parsing, no partial frames)

Endpoints:
  GET /stream    MJPEG live stream (<img src="/stream"> works)
  GET /capture   Latest single JPEG frame
  GET /status    JSON {status: 'streaming'|'waiting'}
"""

import os
import sys
import cv2
import time
import json
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler

# ─── Configuration ───────────────────────────────────────────────
VIDEO_DEVICE = int(os.environ.get('VIDEO_DEVICE_INDEX', '0'))
WIDTH = int(os.environ.get('WIDTH', '1920'))
HEIGHT = int(os.environ.get('HEIGHT', '1080'))
FRAMERATE = int(os.environ.get('FRAMERATE', '30'))
HTTP_PORT = int(os.environ.get('HTTP_PORT', '5555'))
JPEG_QUALITY = int(os.environ.get('JPEG_QUALITY', '85'))

# ─── Shared state ────────────────────────────────────────────────
latest_frame_lock = threading.Lock()
latest_frame_jpeg = None       # bytes — last complete JPEG
frame_event = threading.Event()
camera_ok = False


def capture_loop():
    """
    Continuously read frames from the camera using OpenCV.
    Forces V4L2 backend and explicit resolution/MJPG format.
    """
    global latest_frame_jpeg, camera_ok

    # Aggressive Hardware Signal Cleanup
    # These settings strip out the ISP processing that causes "glassy lines" and halos.
    # We do this before opening the camera handle to ensure the hardware is initialized clean.
    v4l2_cmds = [
        f"v4l2-ctl -d {VIDEO_DEVICE} --set-ctrl=power_line_frequency=1", # 50Hz (India)
        f"v4l2-ctl -d {VIDEO_DEVICE} --set-ctrl=sharpness=0",            # Disable sharpening (ringing)
        f"v4l2-ctl -d {VIDEO_DEVICE} --set-ctrl=backlight_compensation=0" # Disable contrast banding
    ]
    for cmd in v4l2_cmds:
        os.system(f"{cmd} 2>/dev/null")

    print(f"[Capture] Opening camera index {VIDEO_DEVICE} with CAP_V4L2")
    # Use V4L2 backend for better control on Linux
    cap = cv2.VideoCapture(VIDEO_DEVICE, cv2.CAP_V4L2)

    if not cap.isOpened():
        print(f"[Capture] ERROR: Cannot open camera {VIDEO_DEVICE}")
        camera_ok = False
        time.sleep(3)
        return capture_loop()

    # CRITICAL: Set format to MJPEG FIRST to handle bandwidth correctly
    # 'M', 'J', 'P', 'G'
    cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))
    
    # Force the resolution
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, WIDTH)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, HEIGHT)
    cap.set(cv2.CAP_PROP_FPS, FRAMERATE)

    # Check what we actually got
    actual_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    actual_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    actual_fps = cap.get(cv2.CAP_PROP_FPS)
    actual_fourcc = int(cap.get(cv2.CAP_PROP_FOURCC))
    fourcc_str = "".join([chr((actual_fourcc >> 8 * i) & 0xFF) for i in range(4)])
    
    print(f"[Capture] Camera configuration:")
    print(f"  Resolution : {actual_w}x{actual_h} (Requested {WIDTH}x{HEIGHT})")
    print(f"  Framerate  : {actual_fps}fps (Requested {FRAMERATE})")
    print(f"  Format     : {fourcc_str}")

    camera_ok = True
    encode_params = [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY]

    while True:
        success, frame = cap.read()
        if not success:
            print("[Capture] cap.read() failed — reopening camera...")
            camera_ok = False
            cap.release()
            time.sleep(1)
            return capture_loop()

        # Encode the frame as JPEG — identical to reference app
        ret, buffer = cv2.imencode('.jpg', frame, encode_params)
        if not ret:
            continue

        jpeg_bytes = buffer.tobytes()

        with latest_frame_lock:
            latest_frame_jpeg = jpeg_bytes

        frame_event.set()
        frame_event.clear()


class StreamHandler(BaseHTTPRequestHandler):
    """HTTP handler serving MJPEG stream and single frame capture."""

    def log_message(self, format, *args):
        """Suppress default logging to avoid console spam."""
        pass

    def do_GET(self):
        if self.path == '/stream':
            self._handle_stream()
        elif self.path == '/capture':
            self._handle_capture()
        elif self.path == '/status':
            self._handle_status()
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b'Not found')

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.end_headers()

    def _handle_stream(self):
        """
        MJPEG stream — EXACT format of the reference Django app:
          Content-Type: multipart/x-mixed-replace; boundary=frame
          Each part:
            --frame\r\n
            Content-Type: image/jpeg\r\n\r\n
            {JPEG bytes}\r\n
        """
        self.send_response(200)
        self.send_header('Content-Type', 'multipart/x-mixed-replace; boundary=frame')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Connection', 'keep-alive')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()

        try:
            while True:
                frame_event.wait(timeout=2.0)

                with latest_frame_lock:
                    jpeg = latest_frame_jpeg

                if jpeg is None:
                    continue

                # Yield EXACTLY like the reference Django app
                self.wfile.write(b'--frame\r\n'
                                 b'Content-Type: image/jpeg\r\n\r\n' +
                                 jpeg +
                                 b'\r\n')
                self.wfile.flush()

        except (BrokenPipeError, ConnectionResetError):
            pass  # Client disconnected

    def _handle_capture(self):
        """Single JPEG frame."""
        with latest_frame_lock:
            jpeg = latest_frame_jpeg

        if jpeg is None:
            self.send_response(503)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': 'No frame yet'}).encode())
            return

        self.send_response(200)
        self.send_header('Content-Type', 'image/jpeg')
        self.send_header('Content-Length', str(len(jpeg)))
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(jpeg)

    def _handle_status(self):
        """JSON status."""
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        status = 'streaming' if latest_frame_jpeg else 'waiting'
        self.wfile.write(json.dumps({'status': status}).encode())


class ThreadedHTTPServer(HTTPServer):
    """Handle each request in a new thread (needed for /stream)."""
    daemon_threads = True

    def process_request(self, request, client_address):
        t = threading.Thread(target=self._handle, args=(request, client_address))
        t.daemon = True
        t.start()

    def _handle(self, request, client_address):
        try:
            self.finish_request(request, client_address)
        except Exception:
            self.handle_error(request, client_address)
        finally:
            self.shutdown_request(request)


def main():
    print('═══════════════════════════════════════════════════')
    print(f' CAPTURE DAEMON (Python/OpenCV)  http://0.0.0.0:{HTTP_PORT}')
    print(f' Camera  : index {VIDEO_DEVICE}  {WIDTH}x{HEIGHT}@{FRAMERATE}fps')
    print(f' Quality : JPEG {JPEG_QUALITY}%')
    print(f' Stream  : http://0.0.0.0:{HTTP_PORT}/stream')
    print('═══════════════════════════════════════════════════')

    # Start capture in background thread
    cap_thread = threading.Thread(target=capture_loop, daemon=True)
    cap_thread.start()

    # Start HTTP server
    server = ThreadedHTTPServer(('0.0.0.0', HTTP_PORT), StreamHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n[Shutdown] Bye.')
        server.shutdown()


if __name__ == '__main__':
    main()
