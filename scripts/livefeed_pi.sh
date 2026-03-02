#!/bin/bash
###############################################################################
# livefeed_pi.sh - Endoscopy Live Feed for Pi 5
#
# Works in BOTH modes:
#   - Desktop mode (X11/Wayland running): TCP-only, browser shows the feed
#   - Console mode (no desktop): TCP-only (kmssink removed — the web browser
#     on the Pi desktop is always the display target)
#
# GStreamer pipeline:
#   v4l2src → MJPEG → tee → tcpserversink :5000
#   pi_capture_daemon.js reads :5000 and serves /capture on :5555
#   SurgicalCameraStream.tsx polls :5555 and shows it in the browser
###############################################################################

set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────────────
VIDEO_DEVICE="${VIDEO_DEVICE:-/dev/video0}"
WIDTH="${WIDTH:-1920}"
HEIGHT="${HEIGHT:-1080}"
FRAMERATE="${FRAMERATE:-30}"
# ─────────────────────────────────────────────────────────────────────────────

log() { echo "[livefeed] $(date '+%H:%M:%S') $*" >&2; }

# ─── Wait for video device ──────────────────────────────────────────────────
wait_for_device() {
    local retries=0
    while [ ! -e "$VIDEO_DEVICE" ]; do
        retries=$((retries + 1))
        if [ $retries -gt 60 ]; then
            log "ERROR: $VIDEO_DEVICE not found after 60s."
            exit 1
        fi
        log "Waiting for $VIDEO_DEVICE ... ($retries/60)"
        sleep 1
    done
    log "Device $VIDEO_DEVICE is ready."
}

# ─── Log device MJPEG capabilities ──────────────────────────────────────────
detect_caps() {
    if command -v v4l2-ctl &>/dev/null; then
        log "MJPEG formats supported by device:"
        v4l2-ctl -d "$VIDEO_DEVICE" --list-formats-ext 2>/dev/null \
            | grep -A5 "MJPG\|JPEG" >&2 || log "  (v4l2-ctl list failed)"
    fi
}

# ─── Cleanup on exit ────────────────────────────────────────────────────────
GST_PID=""
cleanup() {
    log "Shutting down..."
    [ -n "$GST_PID" ] && kill "$GST_PID" 2>/dev/null || true
    [ -n "$GST_PID" ] && wait "$GST_PID" 2>/dev/null || true
    log "Done."
}
trap cleanup EXIT INT TERM

# ─── Launch GStreamer (TCP-only) ─────────────────────────────────────────────
# No kmssink — Pi desktop (X11/Wayland) owns the DRM planes.
# The browser running on the Pi desktop shows the live feed via polling :5555.
#
# Pipeline:
#   v4l2src → image/jpeg,1920x1080,30fps → queue (leaky) → tcpserversink :5000
#
# leaky=downstream: always drop old frames, never freeze on stale data.
# The Node.js daemon (pi_capture_daemon.js) connects to :5000, extracts JPEG
# frames, and serves the latest one at http://localhost:5555/capture.
launch_pipeline() {
    local caps="image/jpeg,width=${WIDTH},height=${HEIGHT},framerate=${FRAMERATE}/1"

    local pipeline="v4l2src device=${VIDEO_DEVICE} io-mode=mmap do-timestamp=true \
! ${caps} \
! queue leaky=downstream max-size-buffers=2 max-size-bytes=0 max-size-time=0 \
! tcpserversink host=127.0.0.1 port=5000 sync=false async=false"

    log "Pipeline:"
    log "  $pipeline"

    GST_DEBUG=1 gst-launch-1.0 -e \
        v4l2src device="${VIDEO_DEVICE}" io-mode=mmap do-timestamp=true \
        ! "${caps}" \
        ! queue leaky=downstream max-size-buffers=2 max-size-bytes=0 max-size-time=0 \
        ! tcpserversink host=127.0.0.1 port=5000 sync=false async=false &

    GST_PID=$!
    log "GStreamer running (PID: ${GST_PID}). Waiting..."
    wait "$GST_PID"
    local exit_code=$?
    GST_PID=""
    return $exit_code
}

# ─── Main ────────────────────────────────────────────────────────────────────
main() {
    log "══════════════════════════════════════════════════════════"
    log "  Endoscopy Live Feed — Desktop Mode (Pi 5 + Browser)"
    log "  Device:   ${VIDEO_DEVICE}"
    log "  Caps:     ${WIDTH}x${HEIGHT} @ ${FRAMERATE}fps MJPEG"
    log "  TCP out:  127.0.0.1:5000  →  pi_capture_daemon → :5555"
    log "  Display:  Browser at http://localhost:3000"
    log "══════════════════════════════════════════════════════════"

    wait_for_device
    detect_caps

    local attempt=0
    while true; do
        attempt=$((attempt + 1))
        log "Starting pipeline (attempt #${attempt})..."

        if launch_pipeline; then
            log "Pipeline exited cleanly."
        else
            log "Pipeline exited with code $?. Retrying in 3s..."
        fi

        sleep 3
        wait_for_device
    done
}

main "$@"
