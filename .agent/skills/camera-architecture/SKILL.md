---
name: Camera Architecture Standard
description: Implementation standards for the high-performance, low-latency "Raw WebRTC" camera feed.
---

# Camera Architecture: Raw WebRTC Standard

This document establishes the permanent architectural standard for the camera feed in the Endoscopy Suite. This standard was adopted to resolve critical latency, tearing, and CPU overhead issues identified on the Raspberry Pi 5.

## 🚨 MANDATORY REQUIREMENT: Direct Browser Feed
The camera feed MUST always use raw browser APIs (`navigator.mediaDevices.getUserMedia`) to connect directly to the capture hardware.

**PROHIBITED ACTIONS:**
- DO NOT use an intermediary capture daemon (e.g., `pi_capture_daemon.js`).
- DO NOT use `ffmpeg` or `v4l2-ctl` to pipe frames over WebSockets or HTTP.
- DO NOT implement custom MJPEG parsers in JavaScript.
- DO NOT use server-side deinterlacing filters (e.g., `yadif`).

## Technical Rationale
1. **Zero Latency**: Direct browser-to-hardware connection eliminates the 500ms - 2s overhead introduced by daemon piping.
2. **Zero Tearing**: The browser's native WebRTC stack handles MJPEG/YUY2 packet reconstruction and frame synchronization far more reliably than custom JS parsing.
3. **CPU Efficiency**: Offloads camera handling to the browser's optimized media engine, preventing CPU saturation that causes system crashes.

## Reference Implementation
The canonical implementation resides in [CameraFeed.tsx](file:///e:/mln/endoscopy-suite/components/procedure/CameraFeed.tsx).

### 1. Initialization
Use `getUserMedia` with `ideal` constraints.
```typescript
const stream = await navigator.mediaDevices.getUserMedia({
    video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 },
    }
});
```

### 2. Rendering
Render directly via a `<video>` element with `autoPlay`, `playsInline`, and `muted`.
```tsx
<video ref={videoRef} autoPlay playsInline muted />
```

### 3. Frame Capture
Capture frames strictly using a hidden `<canvas>` and `ctx.drawImage(video, 0, 0)`.
```typescript
const canvas = canvasRef.current;
const ctx = canvas.getContext("2d");
ctx.drawImage(video, 0, 0);
const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
```

## Maintenance & Troubleshooting
- **Network**: Internet connection is required for initial deployment, but the camera feed is LOCAL to the hardware.
- **V4L2 Recognition**: The browser identifies the capture card as `USB3 Video (v4l2)`. If it's not visible, check physical cables or Pi permissions.
- **Permissions**: Ensure `chromium` or `firefox` has camera permissions in the Pi's privacy settings.
