// lib/procedure-data.ts


"use client";

// =============================================================================
//  procedure-data.ts — Dedicated End-to-End Data Handling for Procedure Mode
//
//  Responsibilities:
//  1. Capture persistence (localStorage) — survives crashes/refreshes
//  2. Image upload to disk (via /api/capture-upload)
//  3. Media metadata save to database (via server action)
//  4. Deferred upload queue for temp segments
//  5. Session resumption with full media recovery
// =============================================================================

import { saveMediaMetadata, getProcedureMedia } from "@/app/actions/procedure";

// ── Types ──

export interface Capture {
    id: string;
    timestamp: string;
    url: string;                   // base64 dataURL or served URL path
    type: "image" | "video";
    thumbnailUrl?: string;
    thumbnailData?: string;        // [ADDED] Temporary base64 for thumbnails before save
    category?: string;             // P1, P2...
    segmentIndex?: number;
    procedureId?: string;
    dbMediaId?: string;            // The actual DB media ID once saved
    scopeShape?: "circle" | "square"; // [ADDED] Track the scope shape used for the capture
    uploadStatus: "pending" | "uploading" | "saved" | "failed";
    selected?: boolean;
    deleted?: boolean;
}

export interface PendingUpload {
    captureId: string;
    tempSegmentId: string;
    segmentIndex: number;
    type: "image" | "video";
    data: string;                  // base64 data or backend URL
    thumbnailData?: string;        // [ADDED] Thumbnail data for video
    timestamp: string;
}

interface PersistedSession {
    procedureId: string;
    captures: Capture[];
    pendingUploads: PendingUpload[];
    savedAt: number;
}

// ── Storage Keys ──
const STORAGE_KEY = "procedure-captures";

// =============================================================================
//  LOCAL PERSISTENCE — survives page refresh, crash, browser close
// =============================================================================

/** Save the current capture state to localStorage */
export function persistCaptures(
    procedureId: string,
    captures: Capture[],
    pendingUploads: PendingUpload[]
): void {
    try {
        // Only persist URLs that are NOT base64 (too large for localStorage)
        // For base64, we rely on the upload flow to save them to disk
        const lightweight = captures.map(c => ({
            ...c,
            // If uploaded, use the served URL; if still base64, mark for re-fetch
            url: c.uploadStatus === "saved" ? c.url : (c.url.startsWith("data:") ? "__pending__" : c.url),
        }));

        const session: PersistedSession = {
            procedureId,
            captures: lightweight,
            pendingUploads,
            savedAt: Date.now(),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch (e) {
        // localStorage might be full — fail silently
        console.warn("[procedure-data] Could not persist captures:", e);
    }
}

/** Load persisted captures for a given procedure */
export function loadPersistedCaptures(procedureId: string): PersistedSession | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const session: PersistedSession = JSON.parse(raw);
        if (session.procedureId !== procedureId) return null;
        // Don't load stale sessions (> 24 hours old)
        if (Date.now() - session.savedAt > 24 * 60 * 60 * 1000) {
            localStorage.removeItem(STORAGE_KEY);
            return null;
        }
        return session;
    } catch {
        return null;
    }
}

/** Clear persisted session */
export function clearPersistedCaptures(): void {
    try { localStorage.removeItem(STORAGE_KEY); } catch { }
}

// =============================================================================
//  UPLOAD — Save captured image to disk and then to database
// =============================================================================

export interface UploadResult {
    success: boolean;
    mediaId?: string;
    servedUrl?: string;
    thumbnailUrl?: string;
    error?: string;
}

/** Upload a base64 image to the server and save metadata to DB */
export async function uploadCapture(
    procedureId: string,
    captureData: string,
    type: "IMAGE" | "VIDEO",
    scopeShape?: string,
    timestamp?: Date,
    thumbnailData?: string
): Promise<UploadResult> {
    try {
        // Step 1: Upload the file to disk
        const uploadRes = await fetch("/api/capture-upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                procedureId,
                data: captureData,
                type,
                scopeShape,
                thumbnailData,
            }),
        });

        if (!uploadRes.ok) {
            const errText = await uploadRes.text();
            console.error("[procedure-data] Upload failed:", errText);
            return { success: false, error: `Upload HTTP ${uploadRes.status}: ${errText}` };
        }

        const { filePath, thumbnailPath } = await uploadRes.json();

        // Step 2: Save metadata to database
        const saveRes = await saveMediaMetadata({
            procedureId,
            type,
            filePath,
            thumbnailPath,
            scopeShape,
            timestamp: timestamp || new Date(),
        });

        if (saveRes.success && saveRes.mediaId) {
            // Build the served URL
            const servedUrl = `/api/capture-serve?path=${encodeURIComponent(filePath)}`;
            const thumbnailUrl = thumbnailPath ? `/api/capture-serve?path=${encodeURIComponent(thumbnailPath)}` : undefined;
            return { success: true, mediaId: saveRes.mediaId, servedUrl, thumbnailUrl };
        }

        return { success: false, error: saveRes.error || "DB save failed" };
    } catch (err: any) {
        console.error("[procedure-data] Upload error:", err);
        return { success: false, error: err?.message || "Unknown upload error" };
    }
}

/** Save a video URL reference to the database (no file upload needed) */
export async function saveVideoReference(
    procedureId: string,
    videoUrl: string,
    timestamp?: Date
): Promise<UploadResult> {
    try {
        const saveRes = await saveMediaMetadata({
            procedureId,
            type: "VIDEO",
            filePath: videoUrl,
            timestamp: timestamp || new Date(),
        });

        if (saveRes.success && saveRes.mediaId) {
            return { success: true, mediaId: saveRes.mediaId, servedUrl: videoUrl };
        }
        return { success: false, error: saveRes.error || "DB save failed" };
    } catch (err: any) {
        return { success: false, error: err?.message || "Unknown error" };
    }
}

// =============================================================================
//  DEFERRED UPLOAD QUEUE — handles captures made during temp segments
// =============================================================================

export interface Segment {
    id: string;
    index: number;
    status: string;
}

/** Process any pending uploads whose segments now have real IDs */
export async function processPendingUploads(
    pendingUploads: PendingUpload[],
    segments: Segment[],
    onCaptureUpdated: (captureId: string, updates: Partial<Capture>) => void
): Promise<PendingUpload[]> {
    const remaining: PendingUpload[] = [];

    for (const item of pendingUploads) {
        const realSeg = segments.find(s => s.index === item.segmentIndex);
        if (!realSeg || realSeg.id.toString().startsWith("temp-")) {
            remaining.push(item);
            continue;
        }

        const realId = realSeg.id.toString();
        console.log(`[procedure-data] Processing deferred upload for segment ${realId}`);

        try {
            let result: UploadResult;
            if (item.type === "video") {
                // [FIX] Use uploadCapture for videos to handle thumbnailData if present
                if (item.thumbnailData || item.data.startsWith('data:')) {
                    result = await uploadCapture(realId, item.data, "VIDEO", (item as any).scopeShape, new Date(item.timestamp), item.thumbnailData);
                } else {
                    result = await saveVideoReference(realId, item.data, new Date(item.timestamp));
                }
            } else {
                result = await uploadCapture(realId, item.data, "IMAGE", (item as any).scopeShape, new Date(item.timestamp));
            }

            if (result.success) {
                onCaptureUpdated(item.captureId, {
                    dbMediaId: result.mediaId,
                    url: result.servedUrl || item.data,
                    thumbnailUrl: result.thumbnailUrl,
                    uploadStatus: "saved",
                });
            } else {
                console.error(`[procedure-data] Deferred upload failed:`, result.error);
                remaining.push(item);
            }
        } catch (e) {
            console.error("[procedure-data] Deferred upload error:", e);
            remaining.push(item);
        }
    }

    return remaining;
}

// =============================================================================
//  SESSION RESUMPTION — Fetch all saved media from DB for display
// =============================================================================

/** Fetch existing media from DB for all segments (for resumption) */
export async function fetchExistingMedia(
    segments: Segment[]
): Promise<Capture[]> {
    const all: Capture[] = [];

    for (const seg of segments) {
        if (seg.id.toString().startsWith("temp-")) continue;

        try {
            const res = await getProcedureMedia(seg.id);
            if (res.success && res.media) {
                for (const m of res.media) {
                        all.push({
                            id: m.id,
                            url: m.url,
                            thumbnailUrl: m.thumbnailUrl, // [FIX] Include thumbnailUrl for session resumption
                            timestamp: m.timestamp,
                            type: m.type as "image" | "video",
                            segmentIndex: seg.index,
                            category: `P${seg.index}`,
                            uploadStatus: "saved",
                            dbMediaId: m.id,
                            scopeShape: (m as any).scopeShape,
                            deleted: m.deleted
                        });
                }
            }
        } catch (e) {
            console.error(`[procedure-data] Fetch media for segment ${seg.id} failed:`, e);
        }
    }

    return all;
}

// =============================================================================
//  CAPTURE CREATION HELPER
// =============================================================================

/** Create a new Capture object with a unique ID */
export function createCapture(
    data: string,
    type: "image" | "video",
    segmentIndex: number,
    procedureId: string,
    scopeShape?: "circle" | "square",
    thumbnailData?: string
): Capture {
    return {
        id: `cap-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        timestamp: new Date().toLocaleTimeString(),
        url: data,
        type,
        thumbnailData,
        category: `P${segmentIndex}`,
        segmentIndex,
        procedureId,
        scopeShape,
        uploadStatus: "pending",
    };
}
