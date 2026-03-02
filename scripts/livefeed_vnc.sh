#!/bin/bash
###############################################################################
# livefeed_vnc.sh - Camera feed for Pi running in Desktop/VNC mode
#
# Simplified pipeline: captures from USB device and serves MJPEG on port 5000
# for pi_capture_daemon.js to consume. No kmssink (works with X11/VNC).
###############################################################################

set -euo pipefail

VIDEO_DEVICE="${VIDEO_DEVICE:-/dev/video0}"

log() { echo "[livefeed] $(date '+%H:%M:%S') $*" >&2; }

# Wait for video device
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

cleanup() {
    log "Shutting down live feed..."
    kill "$GST_PID" 2>/dev/null || true
    wait "$GST_PID" 2>/dev/null || true
    log "Done."
}
trap cleanup EXIT INT TERM

main() {
    log "═══════════════════════════════════════════════════"
    log "  Camera Feed (VNC/Desktop Mode)"
    log "  Capture: TCP Server Port 5000"
    log "═══════════════════════════════════════════════════"

    wait_for_device

    # Simple pipeline: capture MJPEG from USB device → serve on port 5000
    # No display sink needed — the app shows the feed via browser
    gst-launch-1.0 -e \
        v4l2src device=${VIDEO_DEVICE} io-mode=mmap do-timestamp=true \
        ! image/jpeg,width=1920,height=1080 \
        ! queue leaky=downstream max-size-buffers=2 \
        ! tcpserversink host=127.0.0.1 port=5000 sync=false async=false &

    GST_PID=$!
    log "GStreamer running (PID: $GST_PID)."
    wait "$GST_PID"
}

main "$@"
