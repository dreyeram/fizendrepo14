"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
    Camera, X, Video, Move3d, AlertCircle, ArrowLeft,
    ZoomIn, ZoomOut, RotateCcw, FileText
} from "lucide-react";
import { endProcedure, createProcedure, softDeleteMedia } from "@/app/actions/procedure";
import { getPatientHistory } from "@/app/actions/patient";
import { useSettings } from "@/contexts/SettingsContext";
import { useSessionStore } from "@/lib/store/session.store";
import ProcedureToolPanel from "./procedure/ProcedureToolPanel";
import ImageGallery, { MediaItem } from "./gallery/ImageGallery";
import CameraFeed, { CameraFeedHandle } from "./procedure/CameraFeed";
import HistoryComparisonView from "./procedure/HistoryComparisonView";
import { CustomScopeSettingsInterface } from "./procedure/CustomScopeSettingsInterface";
import ZoomMiniMap from "./procedure/ZoomMiniMap";
import { useScopeStore } from "@/lib/store/scope.store";
import {
    Capture, PendingUpload,
    createCapture, uploadCapture, saveVideoReference,
    fetchExistingMedia, processPendingUploads,
    persistCaptures, loadPersistedCaptures, clearPersistedCaptures,
} from "@/lib/procedure-data";
import ExitPreviewModal from "./procedure/ExitPreviewModal";

// ═══════════════════════════════════════════════════════════
//  ProcedureMode v3 — Clean Rewrite + Robust Data Handling
// ═══════════════════════════════════════════════════════════

interface Props {
    procedureId: string;
    patient: { name: string; age?: number; gender?: string; id: string;[key: string]: any };
    onBack?: () => void;
    onGenerateReport?: (captures: Capture[]) => void;
    isDirectProcedure?: boolean;
}

export default function ProcedureMode({ procedureId, patient, onBack, onGenerateReport, isDirectProcedure }: Props) {
    // ── Guard ──
    if (!patient) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-black text-white p-6 text-center">
                <AlertCircle size={48} className="text-red-500 mb-4" />
                <h1 className="text-2xl font-bold mb-2">System Error</h1>
                <p className="text-zinc-400 mb-6">Patient context lost. Please return to the dashboard.</p>
                <button onClick={onBack} className="px-6 py-2 bg-white text-black font-bold rounded-lg">Back</button>
            </div>
        );
    }

    const { settings, updateSetting } = useSettings() || { settings: {}, updateSetting: () => { } };
    const {
        segments, activeSegmentIndex, setActiveSegment, addSegment, updateSegment, removeSegment,
        captures, addCapture, setCaptures, sessionTimer, tickSessionTimer
    } = useSessionStore();

    // ── Camera ──
    const feedRef = useRef<CameraFeedHandle>(null);

    // ── Recording ──
    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordedChunksRef = useRef<Blob[]>([]);
    const [isRecordingProcessing, setIsRecordingProcessing] = useState(false);
    const isProcessingRecordingRef = useRef(false); // rename to match state or just use state

    // ── Captures ──
    const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);

    // ── Freeze & PiP ──
    const [frozenFrame, setFrozenFrame] = useState<string | null>(null);

    // ── Compare Mode ──
    const [isCompareMode, setIsCompareMode] = useState(false);
    const [comparisonImage, setComparisonImage] = useState<any>(null);
    const [compareLeftImage, setCompareLeftImage] = useState<any>(null);
    const [lastCompareLeftImage, setLastCompareLeftImage] = useState<any>(null);
    const [leftCompareZoom, setLeftCompareZoom] = useState(1);
    const [rightCompareZoom, setRightCompareZoom] = useState(1);
    const [leftCompareOffset, setLeftCompareOffset] = useState({ x: 0, y: 0 });
    const [rightCompareOffset, setRightCompareOffset] = useState({ x: 0, y: 0 });

    // ── Timer (Session-wide) ──
    const timerDisplayRef = useRef<HTMLSpanElement>(null);

    // ── UI ──
    const [flashActive, setFlashActive] = useState(false);
    const [showEndConfirm, setShowEndConfirm] = useState(false);
    const [showExitPreview, setShowExitPreview] = useState(false);
    const [showRecordingWarning, setShowRecordingWarning] = useState(false);
    const [isPlayingVideo, setPlayingVideo] = useState<any>(null);
    const [isGalleryOpen, setIsGalleryOpen] = useState(false);
    const [galleryInitialIndex, setGalleryInitialIndex] = useState(0);
    const [previewImage, setPreviewImage] = useState<string | null>(null);

    // ── History ──
    const [history, setHistory] = useState<any[]>([]);
    const [historyExpanded, setHistoryExpanded] = useState(false);

    // ── PIP ──
    const [showPip, setShowPip] = useState(true);

    // ── Scope Settings ──
    const [isScopeSettingsOpen, setIsScopeSettingsOpen] = useState(false);

    // ── Zoom State ──
    const { scopes, activeScopeId, mainZoom, setMainZoom } = useScopeStore();
    const [zoomRange] = useState({ min: 1, max: 6 });
    const [zoomPanOffset, setZoomPanOffset] = useState({ x: 0, y: 0 });
    const [mainSize, setMainSize] = useState({ w: 1, h: 1 });
    const [panelASize, setPanelASize] = useState({ w: 1, h: 1 });

    // ── Refs ──
    const constraintsRef = useRef<HTMLDivElement>(null);
    const mainFeedConstraintsRef = useRef<HTMLDivElement>(null);
    const panelARef = useRef<HTMLDivElement>(null);
    const panelBRef = useRef<HTMLDivElement>(null);
    const previewConstraintsRef = useRef<HTMLDivElement>(null);
    const isDraggingRef = useRef(false);

    // ═══════════════════════════════════════
    //  BOOT
    // ═══════════════════════════════════════

    // Tick the session-wide timer every second
    useEffect(() => {
        const iv = setInterval(() => {
            tickSessionTimer();
            if (timerDisplayRef.current) {
                // Peek at next value for smooth UI update
                const nextSec = sessionTimer + 1;
                timerDisplayRef.current.textContent =
                    `${Math.floor(nextSec / 60).toString().padStart(2, "0")}:${(nextSec % 60).toString().padStart(2, "0")}`;
            }
        }, 1000);
        return () => clearInterval(iv);
    }, [tickSessionTimer, sessionTimer]);

    useEffect(() => {
        if (!patient?.id) return;
        getPatientHistory(patient.id)
            .then(res => { if (res.success && res.history) setHistory(res.history); })
            .catch(e => console.error("History fetch error:", e));
    }, [patient?.id]);

    useEffect(() => {
        if (segments.length === 0) return;
        let mounted = true;
        (async () => {
            try {
                const persisted = loadPersistedCaptures(procedureId);
                const dbCaptures = await fetchExistingMedia(segments as any);
                if (!mounted) return;
                setCaptures(prev => {
                    const existingLocalIds = new Set(prev.map(c => c.id));
                    const existingDbIds = new Set(prev.filter(c => c.dbMediaId).map(c => c.dbMediaId));
                    const combined = [...prev];
                    for (const cap of dbCaptures) {
                        if (!existingLocalIds.has(cap.id) && !existingDbIds.has(cap.dbMediaId)) {
                            combined.push(cap);
                            existingLocalIds.add(cap.id);
                            if (cap.dbMediaId) existingDbIds.add(cap.dbMediaId);
                        }
                    }
                    if (persisted?.captures) {
                        for (const cap of persisted.captures) {
                            if (cap.url !== "__pending__" && !existingLocalIds.has(cap.id) && !existingDbIds.has(cap.dbMediaId)) {
                                combined.push(cap);
                                existingLocalIds.add(cap.id);
                            }
                        }
                    }
                    return combined;
                });
                if (persisted?.pendingUploads && persisted.pendingUploads.length > 0)
                    setPendingUploads(persisted.pendingUploads);
            } catch (e) { console.error("Session resumption error:", e); }
        })();
        return () => { mounted = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [segments.length]);

    useEffect(() => {
        if (captures.length > 0 || pendingUploads.length > 0)
            persistCaptures(procedureId, captures, pendingUploads);
    }, [captures, pendingUploads, procedureId]);

    // ── Cleanup recording on unmount ──
    useEffect(() => {
        return () => {
            if (mediaRecorderRef.current?.state !== 'inactive')
                mediaRecorderRef.current?.stop();
        };
    }, []);

    // ═══════════════════════════════════════
    //  CORE FUNCTIONS
    // ═══════════════════════════════════════

    const formatTime = (s: number) =>
        `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

    const audioCtxRef = useRef<AudioContext | null>(null);
    const playSound = useCallback((type: "success" | "error") => {
        if (!settings.soundEnabled) return;
        if (!audioCtxRef.current)
            audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        const ctx = audioCtxRef.current;
        if (ctx.state === "suspended") ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = type === "success" ? "sine" : "sawtooth";
        osc.frequency.setValueAtTime(type === "success" ? 800 : 200, ctx.currentTime);
        if (type === "success") osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        osc.start(); osc.stop(ctx.currentTime + 0.2);
    }, [settings.soundEnabled]);

    // ── Capture ──
    const handleCapture = useCallback(async (returnDataOnly?: boolean): Promise<string | void> => {
        setFlashActive(true);
        setTimeout(() => setFlashActive(false), 150);
        const capData = feedRef.current?.captureFrame();
        if (!capData) { playSound("error"); return; }
        if (returnDataOnly) return capData;

        const activeScope = scopes.find(s => s.id === activeScopeId);
        const scopeShape = activeScope?.shape;

        const newCap = createCapture(capData, "image", activeSegmentIndex, procedureId, scopeShape);
        addCapture(newCap);
        playSound("success");
        if (isCompareMode) {
            setCompareLeftImage(newCap);
            setLastCompareLeftImage(newCap);
        }

        (async () => {
            try {
                const currentSegment = segments.find(s => s.index === activeSegmentIndex);
                const currentId = currentSegment?.id || procedureId;
                if (!currentId) return;
                if (currentId.toString().startsWith("temp-")) {
                    setPendingUploads(prev => [...prev, {
                        captureId: newCap.id, tempSegmentId: currentId,
                        segmentIndex: activeSegmentIndex,
                        type: "image", data: capData, timestamp: newCap.timestamp,
                    }]);
                } else {
                    const result = await uploadCapture(currentId, capData, "IMAGE", scopeShape);
                    if (result.success) {
                        setCaptures(prev => prev.map(c =>
                            c.id === newCap.id
                                ? { ...c, dbMediaId: result.mediaId, url: result.servedUrl || c.url, uploadStatus: "saved" as const }
                                : c
                        ));
                    } else {
                        setCaptures(prev => prev.map(c =>
                            c.id === newCap.id ? { ...c, uploadStatus: "failed" as const } : c
                        ));
                    }
                }
            } catch (err) { console.error("[ProcedureMode] Capture save error:", err); }
        })();
    }, [procedureId, activeSegmentIndex, segments, playSound, isCompareMode]);
    
    // ── Remove Capture ──
    const handleRemoveCapture = useCallback(async (cap: Capture) => {
        // 1. Local update - mark as deleted
        setCaptures(prev => prev.map(c => c.id === cap.id ? { ...c, deleted: true } : c));
        
        // 2. Database update (if it exists in DB)
        if (cap.dbMediaId) {
            try {
                const result = await softDeleteMedia(cap.dbMediaId);
                if (!result.success) {
                    console.error("[ProcedureMode] Failed to soft delete media from DB:", result.error);
                }
            } catch (err) {
                console.error("[ProcedureMode] DB deletion error:", err);
            }
        }
    }, [setCaptures]);

    // ── Recording ─────────────────────────────────────────────────────────
    // Strategy:
    //   1. Get MediaStream directly from the live <video> element via
    //      feedRef.current.getVideoElement().srcObject — this always works
    //      for WebRTC (local webcam) streams regardless of any daemon.
    //   2. Use MediaRecorder with vp9 if supported, else plain webm.
    //   3. On stop: FileReader → base64 data URL → uploadCapture pipeline
    //      (same pathway as photo captures so it appears in gallery).
    const toggleRecording = useCallback(async () => {
        if (isProcessingRecordingRef.current) {
            console.log("[Recording] toggleRecording called while already processing. Skipping.");
            return;
        }
        isProcessingRecordingRef.current = true;
        setIsRecordingProcessing(true);
        console.log("[Recording] toggleRecording invoked. Current state isRecording:", isRecording);

        try {
            if (!isRecording) {
                // ── START ──────────────────────────────────────────────
                const videoEl = feedRef.current?.getVideoElement();
                console.log("[Recording] START path. Video element present:", !!videoEl);
                const stream = videoEl?.srcObject instanceof MediaStream
                    ? videoEl.srcObject
                    : null;

                if (!stream) {
                    console.warn("[Recording] START failed: No MediaStream available. videoEl:", videoEl, "srcObject:", videoEl?.srcObject);
                    playSound("error");
                    return;
                }
                
                const tracks = stream.getTracks();
                console.log("[Recording] Stream info:", { 
                    id: stream.id, 
                    active: stream.active, 
                    tracks: tracks.map(t => ({ kind: t.kind, label: t.label, enabled: t.enabled, state: t.readyState }))
                });

                if (tracks.filter(t => t.kind === 'video').length === 0) {
                    console.warn("[Recording] START failed: Stream has no video tracks.");
                    playSound("error");
                    return;
                }

                // Pick best supported codec
                const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
                    ? 'video/webm;codecs=vp9'
                    : MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
                        ? 'video/webm;codecs=vp8'
                        : 'video/webm';

                console.log("[Recording] Selected mimeType:", mimeType);

                try {
                    const rec = new MediaRecorder(stream, { mimeType });
                    recordedChunksRef.current = [];
                    rec.ondataavailable = (e) => {
                        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
                    };
                    rec.start(200); // collect chunks every 200ms
                    mediaRecorderRef.current = rec;
                    setIsRecording(true);
                    console.log("[Recording] MediaRecorder successfully started.");
                } catch (err) {
                    console.error("[Recording] MediaRecorder start exception:", err);
                    playSound("error");
                }

            } else {
                // ── STOP ───────────────────────────────────────────────
                console.log("[Recording] STOP path.");
                setIsRecording(false);
                const rec = mediaRecorderRef.current;
                console.log("[Recording] Recorder state:", rec?.state);

                if (!rec || rec.state === "inactive") {
                    console.warn("[Recording] STOP early return: No active recorder found.");
                    return;
                }

                rec.onstop = () => {
                    rec.onstop = null;
                    const chunks = recordedChunksRef.current;
                    if (chunks.length === 0) {
                        console.warn("[Recording] No chunks recorded");
                        setIsRecordingProcessing(false);
                        isProcessingRecordingRef.current = false;
                        return;
                    }

                    const blob = new Blob(chunks, { type: 'video/webm' });
                    recordedChunksRef.current = [];
                    mediaRecorderRef.current = null;

                    console.log("[Recording] Blob size:", blob.size, "bytes");

                    // Convert blob → base64 data URL → upload via existing pipeline
                    const reader = new FileReader();
                    reader.onloadend = async () => {
                        const base64Data = reader.result as string;
                        console.log("[Recording] FileReader finished, base64 length:", base64Data.length);
                        
                        // [ADDED] Capture a thumbnail frame
                        const thumbnailData = feedRef.current?.captureFrame() || undefined;
                        console.log("[Recording] Thumbnail captured:", !!thumbnailData);

                        const activeScope = scopes.find(s => s.id === activeScopeId);
                        const scopeShape = activeScope?.shape;

                        const newCap = createCapture(base64Data, "video", activeSegmentIndex, procedureId, scopeShape, thumbnailData);
                        console.log("[Recording] Adding capture to store:", newCap.id);
                        addCapture(newCap);

                        const activeProcId = segments.find(s => s.index === activeSegmentIndex)?.id;
                        if (activeProcId && !activeProcId.toString().startsWith("temp-")) {
                            try {
                                console.log("[Recording] Uploading to DB for proc:", activeProcId);
                                const result = await uploadCapture(activeProcId.toString(), base64Data, "VIDEO", scopeShape, new Date(), thumbnailData);
                                console.log("[Recording] Upload result:", result.success ? "SUCCESS" : "FAILED", result.error || "");
                                setCaptures(prev => prev.map(c =>
                                    c.id === newCap.id
                                        ? {
                                            ...c,
                                            dbMediaId: result.success ? result.mediaId : c.dbMediaId,
                                            url: result.success ? (result.servedUrl || c.url) : c.url,
                                            thumbnailUrl: result.success ? (result.thumbnailUrl || c.thumbnailUrl) : c.thumbnailUrl,
                                            uploadStatus: result.success ? "saved" as const : "failed" as const,
                                        }
                                        : c
                                ));
                            } catch (err) {
                                console.error("[Recording] Upload exception:", err);
                                setCaptures(prev => prev.map(c =>
                                    c.id === newCap.id ? { ...c, uploadStatus: "failed" as const } : c
                                ));
                            }
                        } else if (activeProcId) {
                            console.log("[Recording] Segment is temporary, marking as pending upload");
                            setPendingUploads(prev => [...prev, {
                                captureId: newCap.id,
                                tempSegmentId: activeProcId.toString(),
                                segmentIndex: activeSegmentIndex,
                                type: "video",
                                data: base64Data,
                                thumbnailData,
                                timestamp: newCap.timestamp,
                            }]);
                        } else {
                            console.warn("[Recording] No activeProcId found, video might not be correctly linked");
                        }
                        setIsRecordingProcessing(false);
                        isProcessingRecordingRef.current = false;
                    };
                    reader.onerror = (e) => {
                        console.error("[Recording] FileReader error:", e);
                        setIsRecordingProcessing(false);
                        isProcessingRecordingRef.current = false;
                    };
                    reader.readAsDataURL(blob);
                };
                console.log("[Recording] Calling rec.stop()");
                rec.stop();
            }
        } catch (err) {
            console.error("[Recording] Global error in toggleRecording:", err);
            // On catch, we must ensure flags are cleared
            setIsRecordingProcessing(false);
            isProcessingRecordingRef.current = false;
        } finally {
            if (!isRecording) {
                // We were STARTING. If we failed or succeeded, we clear the 'processing' flag
                // shortly after to allow the user to click STOP later.
                setTimeout(() => { 
                    isProcessingRecordingRef.current = false; 
                    setIsRecordingProcessing(false);
                }, 300);
            } else {
                // We were STOPPING. If we returned early (e.g. at line 340), we must clear flags.
                // If we proceeded to rec.stop(), the flags are cleared in onloadend/onerror.
                const rec = mediaRecorderRef.current;
                if (!rec || rec.state === "inactive") {
                    console.warn("[Recording] STOP early return or recorder inactive, clearing flags");
                    setIsRecordingProcessing(false);
                    isProcessingRecordingRef.current = false;
                }
            }
        }
    }, [isRecording, activeSegmentIndex, segments, procedureId, scopes, activeScopeId, addCapture]);

    // ── Freeze ──
    const handleToggleFreeze = useCallback(() => {
        if (frozenFrame) {
            setFrozenFrame(null);
        } else {
            const frame = feedRef.current?.captureFrame();
            if (frame) {
                setFrozenFrame(frame);
                // Reset zoom to 1x on freeze as requested
                setMainZoom(1);
                setZoomPanOffset({ x: 0, y: 0 });
            }
        }
    }, [frozenFrame, setMainZoom, setZoomPanOffset]);

    // ── Zoom ──
    const handleZoomChange = useCallback((z: number) => {
        setMainZoom(z);
        if (z <= 1.01) setZoomPanOffset({ x: 0, y: 0 });
    }, [setMainZoom]);

    // ── Compare Mode ──
    useEffect(() => {
        if (!isCompareMode) {
            setCompareLeftImage(null); setComparisonImage(null);
            setLeftCompareZoom(1); setRightCompareZoom(1);
            setLeftCompareOffset({ x: 0, y: 0 }); setRightCompareOffset({ x: 0, y: 0 });
        }
    }, [isCompareMode]);

    const handleLeftCompareZoomChange = useCallback((z: number) => {
        setLeftCompareZoom(z);
        if (z <= 1.01) setLeftCompareOffset({ x: 0, y: 0 });
    }, []);

    const handleRightCompareZoomChange = useCallback((z: number) => {
        setRightCompareZoom(z);
        if (z <= 1.01) setRightCompareOffset({ x: 0, y: 0 });
    }, []);

    const handleToggleCompare = useCallback(() => { setIsCompareMode(p => !p); }, []);
    const handleSelectComparisonImage = useCallback((item: any, isHistory?: boolean) => {
        if (!item) {
            if (isHistory) setComparisonImage(null);
            else setCompareLeftImage(null);
            return;
        }

        if (isHistory) {
            setComparisonImage(item);
            setRightCompareZoom(1);
            setRightCompareOffset({ x: 0, y: 0 });
        } else {
            setCompareLeftImage(item);
            setLastCompareLeftImage(item);
            setLeftCompareZoom(1);
            setLeftCompareOffset({ x: 0, y: 0 });
        }
        setIsCompareMode(true);
    }, []);
    const handleSwitchCamera = useCallback(() => { }, []);
    const handleOpenGallery = useCallback((cap: Capture) => { setPreviewImage(cap.url); }, []);

    const isAddingSegment = useRef(false);
    const handleAddSegment = useCallback(async () => {
        if (isAddingSegment.current) return;
        if (segments.length >= 5) {
            console.warn("[ProcedureMode] Maximum segment limit (5) reached.");
            return;
        }
        
        isAddingSegment.current = true;
        try {
            const { getSeededDoctorId, getCurrentSession } = await import("@/app/actions/auth");
            const session = await getCurrentSession();
            const docId = (session.success && session.user) ? session.user.id : await getSeededDoctorId();
            if (!docId) return;

            // Robust index calculation: find max existing index and add 1
            const maxIndex = segments.length > 0 
                ? Math.max(...segments.map(s => s.index)) 
                : 0;
            const newIndex = maxIndex + 1;
            
            const tempId = `temp-${Date.now()}`;
            addSegment({ id: tempId, index: newIndex, status: "draft", createdAt: new Date(), type: "generic" });
            
            createProcedure({ patientId: patient.id, doctorId: docId, type: "generic" })
                .then(res => { 
                    if (res.success && res.procedureId) {
                        updateSegment(newIndex, { id: res.procedureId }); 
                    }
                })
                .catch(err => console.error("Create procedure error:", err))
                .finally(() => {
                    isAddingSegment.current = false;
                });
        } catch (err) { 
            console.error("Failed to create segment:", err); 
            isAddingSegment.current = false;
        }
    }, [segments, patient.id, addSegment, updateSegment]);

    useEffect(() => {
        if (pendingUploads.length === 0) return;
        (async () => {
            const remaining = await processPendingUploads(
                pendingUploads, segments as any,
                (captureId, updates) => {
                    setCaptures(prev => prev.map(c => c.id === captureId ? { ...c, ...updates } : c));
                }
            );
            if (remaining.length !== pendingUploads.length) setPendingUploads(remaining);
        })();
    }, [pendingUploads, segments]);

    const handleBack = useCallback(async () => {
        if (isCompareMode) { setIsCompareMode(false); return; }
        
        // If recording is still being processed, wait for it
        if (isRecordingProcessing) {
            // Show some feedback? For now just wait
            let waitCount = 0;
            while (isProcessingRecordingRef.current && waitCount < 20) {
                await new Promise(r => setTimeout(r, 200));
                waitCount++;
            }
        }

        if (isRecording || captures.length > 0) setShowExitPreview(true);
        else if (onBack) onBack();
    }, [isCompareMode, isRecording, captures.length, onBack, isRecordingProcessing]);

    const handleEndProcedure = useCallback(() => {
        if (isRecording) setShowRecordingWarning(true);
        else if (isDirectProcedure && captures.length > 0) performFinish();
        else setShowEndConfirm(true);
    }, [isRecording, isDirectProcedure, captures.length]);

    const performFinish = async () => {
        // Wait for all recordings and uploads to finish
        if (isRecordingProcessing || pendingUploads.length > 0) {
            let waitCount = 0;
            while ((isProcessingRecordingRef.current || pendingUploads.length > 0) && waitCount < 30) {
                await new Promise(r => setTimeout(r, 200));
                waitCount++;
            }
        }

        if (captures.length === 0) {
            if (onBack) onBack();
            return;
        }
        if (onGenerateReport) await onGenerateReport(captures);
        
        try { await endProcedure(procedureId); } catch (e) { console.error("endProcedure failed:", e); }
    };

    // ═══════════════════════════════════════
    //  KEYBOARD SHORTCUTS
    // ═══════════════════════════════════════
    const captureRef = useRef(handleCapture);
    const toggleRecRef = useRef(toggleRecording);
    const freezeRef = useRef(handleToggleFreeze);
    const showEndConfirmRef = useRef(showEndConfirm);
    const showExitPreviewRef = useRef(showExitPreview);
    const isGalleryOpenRef = useRef(isGalleryOpen);
    const frozenFrameRef = useRef(frozenFrame);

    useEffect(() => { captureRef.current = handleCapture; }, [handleCapture]);
    useEffect(() => { toggleRecRef.current = toggleRecording; }, [toggleRecording]);
    useEffect(() => { freezeRef.current = handleToggleFreeze; }, [handleToggleFreeze]);
    useEffect(() => { showEndConfirmRef.current = showEndConfirm; }, [showEndConfirm]);
    useEffect(() => { showExitPreviewRef.current = showExitPreview; }, [showExitPreview]);
    useEffect(() => { isGalleryOpenRef.current = isGalleryOpen; }, [isGalleryOpen]);
    useEffect(() => { frozenFrameRef.current = frozenFrame; }, [frozenFrame]);

    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            switch (e.key.toLowerCase()) {
                case " ": case "enter": e.preventDefault(); captureRef.current(); break;
                case "r": e.preventDefault(); toggleRecRef.current(); break;
                case "f": e.preventDefault(); freezeRef.current(); break;
                case "=": case "+": e.preventDefault(); setMainZoom((p: number) => Math.min(p + 0.5, 6)); break;
                case "-": e.preventDefault(); setMainZoom((p: number) => Math.max(p - 0.5, 1)); break;
                case "z": e.preventDefault(); setMainZoom(1); break;
                case "escape":
                    e.preventDefault();
                    if (showEndConfirmRef.current) setShowEndConfirm(false);
                    else if (showExitPreviewRef.current) setShowExitPreview(false);
                    else if (isGalleryOpenRef.current) setIsGalleryOpen(false);
                    else if (frozenFrameRef.current) setFrozenFrame(null);
                    break;
                case "e": if (e.ctrlKey || e.metaKey) { e.preventDefault(); setShowEndConfirm(true); } break;
            }
        };
        const handleContext = (e: MouseEvent) => { e.preventDefault(); captureRef.current(); };
        window.addEventListener("keydown", handleKey);
        window.addEventListener("contextmenu", handleContext);
        return () => { window.removeEventListener("keydown", handleKey); window.removeEventListener("contextmenu", handleContext); };
    }, []);

    // ═══════════════════════════════════════
    //  RENDER
    // ═══════════════════════════════════════
    return (
        <div className="flex h-screen w-full bg-black text-white font-sans overflow-hidden select-none">

            {/* ═══ LEFT: VIDEO FEED (75%) ═══ */}
            <main
                ref={constraintsRef}
                className={`${isCompareMode ? "w-full" : "w-[70%]"} relative flex flex-col min-w-0 cursor-default overflow-hidden shrink-0 transition-all duration-300 bg-black`}
            >
                <div className="flex-1 relative bg-black overflow-hidden">

                    {isCompareMode ? (
                        <div className="w-full h-full flex flex-col overflow-hidden bg-black relative">
                            {/* Exit / Toolbar */}
                            <div className="absolute top-4 right-4 z-[90] flex items-center gap-3">
                                <button onClick={() => setIsCompareMode(false)}
                                    className="w-9 h-9 rounded-full bg-red-950/80 hover:bg-red-600/40 flex items-center justify-center text-red-100 transition-all border border-red-500/30 shadow-lg"
                                    title="Exit Compare Mode">
                                    <X size={18} />
                                </button>
                            </div>

                            <div className="flex-1 flex overflow-hidden min-h-0 bg-zinc-950 p-3 gap-4">
                                {/* IMAGE A - CURRENT SESSION */}
                                <div
                                    ref={(el) => {
                                        (panelARef as any).current = el;
                                        if (el && (el.clientWidth !== panelASize.w || el.clientHeight !== panelASize.h)) {
                                            setPanelASize({ w: el.clientWidth, h: el.clientHeight });
                                        }
                                    }}
                                    onClick={() => {
                                        if (!compareLeftImage && lastCompareLeftImage) {
                                            setCompareLeftImage(lastCompareLeftImage);
                                        }
                                    }}
                                    className={`flex-1 relative bg-black rounded-[32px] flex items-center justify-center border border-white/10 overflow-hidden group/panelA ${(!compareLeftImage && lastCompareLeftImage) ? 'cursor-pointer' : ''}`}
                                >
                                    <div className="w-full h-full relative flex items-center justify-center overflow-hidden">
                                        {!compareLeftImage ? (
                                            <div className="absolute inset-0 overflow-hidden flex items-center justify-center pointer-events-none">
                                                <div className="relative flex items-center justify-center" style={{ aspectRatio: mainSize.w && mainSize.h ? `${mainSize.w}/${mainSize.h}` : '16/9', width: '100%', maxHeight: '100%', maxWidth: '100%' }}>
                                                    <motion.div
                                                        animate={{
                                                            x: zoomPanOffset.x * (panelASize.w / (mainSize.w || 1)),
                                                            y: zoomPanOffset.y * (panelASize.h / (mainSize.h || 1)),
                                                            scale: mainZoom
                                                        }}
                                                        transition={{ type: "spring", stiffness: 400, damping: 40, mass: 0.4 }}
                                                        style={{ transformOrigin: '50% 50%', width: '100%', height: '100%' }}
                                                        className="w-full h-full flex items-center justify-center"
                                                    >
                                                        <CameraFeed
                                                            ref={feedRef}
                                                            className="absolute inset-0 w-full h-full"
                                                            zoom={mainZoom}
                                                            zoomPanOffset={zoomPanOffset}
                                                            aspectRatioCorrection={settings.aspectRatio}
                                                        />
                                                    </motion.div>
                                                </div>
                                            </div>
                                        ) : (
                                            compareLeftImage?.type === "video" ? (
                                                <video src={compareLeftImage?.url} controls muted autoPlay loop className="max-w-full max-h-full object-contain pointer-events-auto" />
                                            ) : (
                                                <motion.img
                                                    drag={leftCompareZoom > 1} dragMomentum={false} dragElastic={0}
                                                    onDrag={(_e, info) => {
                                                        setLeftCompareOffset(prev => {
                                                            const el = panelARef.current;
                                                            const W = el ? el.clientWidth : 1;
                                                            const H = el ? el.clientHeight : 1;
                                                            const maxX = (W * (leftCompareZoom - 1)) / 2;
                                                            const maxY = (H * (leftCompareZoom - 1)) / 2;
                                                            return {
                                                                x: Math.max(-maxX, Math.min(maxX, prev.x + info.delta.x)),
                                                                y: Math.max(-maxY, Math.min(maxY, prev.y + info.delta.y))
                                                            };
                                                        });
                                                    }}
                                                    src={compareLeftImage?.url || compareLeftImage}
                                                    className={`max-w-full max-h-full object-contain pointer-events-auto cursor-${leftCompareZoom > 1 ? "grab" : "default"}`}
                                                    style={{ scale: leftCompareZoom }}
                                                    animate={{ x: leftCompareOffset.x, y: leftCompareOffset.y }}
                                                    transition={{ type: "spring", stiffness: 400, damping: 40, mass: 0.4 }}
                                                    alt="Left"
                                                />
                                            )
                                        )}
                                    </div>

                                    <div className="absolute top-6 left-6 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/30 backdrop-blur-xl z-20 pointer-events-none">
                                        <span className="text-[11px] font-black text-emerald-400 uppercase tracking-widest">Image A</span>
                                    </div>

                                    {compareLeftImage && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setShowPip(p => !p); }}
                                            className={`absolute top-6 right-6 h-9 px-4 rounded-full flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all border shadow-lg z-30 ${showPip ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-black/60 border-white/10 text-white/60'}`}
                                        >
                                            <Video size={14} />
                                            <span>{showPip ? "Hide PIP" : "Show PIP"}</span>
                                        </button>
                                    )}

                                    {/* LIVE PIP */}
                                    <AnimatePresence>
                                        {showPip && compareLeftImage && (
                                            <motion.div
                                                drag dragConstraints={panelARef} dragElastic={0} dragMomentum={false}
                                                initial={{ opacity: 0, scale: 0.8 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.8 }}
                                                onDragStart={() => { isDraggingRef.current = true; }}
                                                onDragEnd={() => { setTimeout(() => { isDraggingRef.current = false; }, 250); }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (!isDraggingRef.current) {
                                                        setCompareLeftImage(null);
                                                    }
                                                }}
                                                className="absolute bottom-6 right-6 z-[60] w-48 h-48 rounded-full border-2 border-white/20 shadow-2xl overflow-hidden bg-black ring-4 ring-black/50 cursor-grab active:cursor-grabbing hover:border-indigo-500 shadow-indigo-500/20 group/pip"
                                            >
                                                <CameraFeed
                                                    ref={feedRef}
                                                    className="w-full h-full"
                                                    pipMode
                                                    aspectRatioCorrection={settings.aspectRatio}
                                                />
                                                <div className="absolute inset-0 bg-black/0 group-hover/pip:bg-black/40 flex items-center justify-center transition-colors">
                                                    <div className="flex flex-col items-center gap-1 opacity-0 group-hover/pip:opacity-100">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_#ef4444]" />
                                                        <span className="text-[8px] font-black text-white uppercase tracking-widest">Live Feed</span>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    {/* ZOOM UI FOR IMAGE A */}
                                    <div className="absolute bottom-6 right-6 z-[70] flex flex-col items-end gap-2 pointer-events-none">
                                        {(!compareLeftImage ? mainZoom : leftCompareZoom) > 1 && (
                                            <div className="pointer-events-auto">
                                                <ZoomMiniMap
                                                    imageUrl={!compareLeftImage ? "" : (compareLeftImage.url || compareLeftImage)}
                                                    zoom={!compareLeftImage ? mainZoom : leftCompareZoom}
                                                    offset={!compareLeftImage ? zoomPanOffset : leftCompareOffset}
                                                />
                                            </div>
                                        )}
                                        <div className="flex items-center gap-2 bg-black/60 backdrop-blur-xl border border-white/10 px-3 py-2 rounded-2xl shadow-2xl pointer-events-auto">
                                            <button onClick={() => !compareLeftImage ? handleZoomChange(Math.max(zoomRange.min, mainZoom - 0.5)) : handleLeftCompareZoomChange(Math.max(zoomRange.min, leftCompareZoom - 0.5))} className="p-1 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white transition-colors">
                                                <ZoomOut size={14} />
                                            </button>
                                            <div className="w-24 relative h-3 flex items-center group">
                                                <div className="absolute inset-x-0 h-1 bg-white/20 rounded-full top-1/2 -translate-y-1/2" />
                                                <motion.div
                                                    className="h-1 bg-emerald-500 rounded-full absolute left-0 top-1/2 -translate-y-1/2 pointer-events-none"
                                                    initial={false}
                                                    animate={{ width: `${(((!compareLeftImage ? mainZoom : leftCompareZoom) - zoomRange.min) / (zoomRange.max - zoomRange.min)) * 100}%` }}
                                                />
                                                <input
                                                    type="range"
                                                    min={zoomRange.min}
                                                    max={zoomRange.max}
                                                    step={0.1}
                                                    value={!compareLeftImage ? mainZoom : leftCompareZoom}
                                                    onChange={(e) => !compareLeftImage ? handleZoomChange(parseFloat(e.target.value)) : handleLeftCompareZoomChange(parseFloat(e.target.value))}
                                                    className="absolute inset-0 w-full opacity-0 cursor-pointer z-10"
                                                />
                                            </div>
                                            <button onClick={() => !compareLeftImage ? handleZoomChange(Math.min(zoomRange.max, mainZoom + 0.5)) : handleLeftCompareZoomChange(Math.min(zoomRange.max, leftCompareZoom + 0.5))} className="p-1 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white transition-colors">
                                                <ZoomIn size={14} />
                                            </button>
                                            <button onClick={() => !compareLeftImage ? handleZoomChange(1) : handleLeftCompareZoomChange(1)} className="p-1 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white transition-colors ml-2 border-l border-white/10 pl-3">
                                                <RotateCcw size={14} />
                                            </button>
                                            <div className="ml-1 w-8 text-right">
                                                <span className="text-[10px] font-black text-emerald-400 tabular-nums">{(!compareLeftImage ? mainZoom : leftCompareZoom).toFixed(1)}x</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* IMAGE B - HISTORY / MEDIA */}
                                <div ref={panelBRef} className="flex-1 relative bg-black rounded-[32px] flex items-center justify-center border border-white/10 overflow-hidden group/panelB">
                                    {comparisonImage ? (
                                        <div className="w-full h-full relative flex items-center justify-center overflow-hidden">
                                            {comparisonImage?.type === "video" ? (
                                                <video src={comparisonImage?.url} controls muted autoPlay loop className="max-w-full max-h-full object-contain" />
                                            ) : comparisonImage?.type === "report" ? (
                                                <iframe src={comparisonImage?.url} className="w-full h-full bg-white" title="Report PDF" />
                                            ) : (
                                                <motion.img
                                                    drag={rightCompareZoom > 1} dragMomentum={false} dragElastic={0}
                                                    onDrag={(_e, info) => {
                                                        setRightCompareOffset(prev => {
                                                            const el = panelBRef.current;
                                                            const W = el ? el.clientWidth : 1;
                                                            const H = el ? el.clientHeight : 1;
                                                            const maxX = (W * (rightCompareZoom - 1)) / 2;
                                                            const maxY = (H * (rightCompareZoom - 1)) / 2;
                                                            return {
                                                                x: Math.max(-maxX, Math.min(maxX, prev.x + info.delta.x)),
                                                                y: Math.max(-maxY, Math.min(maxY, prev.y + info.delta.y))
                                                            };
                                                        });
                                                    }}
                                                    src={typeof comparisonImage === "string" ? comparisonImage : comparisonImage?.url}
                                                    className={`max-w-full max-h-full object-contain cursor-${rightCompareZoom > 1 ? "grab" : "default"}`}
                                                    style={{ scale: rightCompareZoom }}
                                                    animate={{ x: rightCompareOffset.x, y: rightCompareOffset.y }}
                                                    transition={{ type: "spring", stiffness: 400, damping: 40, mass: 0.4 }}
                                                    alt="Right"
                                                />
                                            )}
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center gap-4 text-zinc-700">
                                            <div className="w-20 h-20 rounded-full border-2 border-dashed border-zinc-800 flex items-center justify-center">
                                                <Move3d size={32} />
                                            </div>
                                            <div className="text-center">
                                                <p className="text-[11px] font-black uppercase tracking-[0.2em]">Image B Empty</p>
                                                <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-800 mt-1">Select from history or session below</p>
                                            </div>
                                        </div>
                                    )}
                                    <div className="absolute top-6 left-6 px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/30 backdrop-blur-xl z-20">
                                        <span className="text-[11px] font-black text-indigo-400 uppercase tracking-widest">Image B</span>
                                    </div>

                                    {/* ZOOM UI FOR IMAGE B */}
                                    {comparisonImage && (
                                        <div className="absolute bottom-6 right-6 z-[70] flex flex-col items-end gap-2 pointer-events-none">
                                            {rightCompareZoom > 1 && (
                                                <div className="pointer-events-auto">
                                                    <ZoomMiniMap
                                                        imageUrl={typeof comparisonImage === "string" ? comparisonImage : (comparisonImage?.url || "")}
                                                        zoom={rightCompareZoom}
                                                        offset={rightCompareOffset}
                                                    />
                                                </div>
                                            )}
                                            <div className="flex items-center gap-2 bg-black/60 backdrop-blur-xl border border-white/10 px-3 py-2 rounded-2xl shadow-2xl pointer-events-auto">
                                                <button onClick={() => handleRightCompareZoomChange(Math.max(zoomRange.min, rightCompareZoom - 0.5))} className="p-1 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white transition-colors">
                                                    <ZoomOut size={14} />
                                                </button>
                                                <div className="w-24 relative h-3 flex items-center group">
                                                    <div className="absolute inset-x-0 h-1 bg-white/20 rounded-full top-1/2 -translate-y-1/2" />
                                                    <motion.div
                                                        className="h-1 bg-indigo-500 rounded-full absolute left-0 top-1/2 -translate-y-1/2 pointer-events-none"
                                                        initial={false}
                                                        animate={{ width: `${((rightCompareZoom - zoomRange.min) / (zoomRange.max - zoomRange.min)) * 100}%` }}
                                                    />
                                                    <input
                                                        type="range"
                                                        min={zoomRange.min}
                                                        max={zoomRange.max}
                                                        step={0.1}
                                                        value={rightCompareZoom}
                                                        onChange={(e) => handleRightCompareZoomChange(parseFloat(e.target.value))}
                                                        className="absolute inset-0 w-full opacity-0 cursor-pointer z-10"
                                                    />
                                                </div>
                                                <button onClick={() => handleRightCompareZoomChange(Math.min(zoomRange.max, rightCompareZoom + 0.5))} className="p-1 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white transition-colors">
                                                    <ZoomIn size={14} />
                                                </button>
                                                <button onClick={() => handleRightCompareZoomChange(1)} className="p-1 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white transition-colors ml-2 border-l border-white/10 pl-3">
                                                    <RotateCcw size={14} />
                                                </button>
                                                <div className="ml-1 w-8 text-right">
                                                    <span className="text-[10px] font-black text-indigo-400 tabular-nums">{rightCompareZoom.toFixed(1)}x</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Session Strip (Horizontal Single Row - 50/50 Split) */}
                            <div className="shrink-0 bg-zinc-950 border-t border-white/10 flex items-center h-[100px]">
                                {/* Current Session Gallery (Left 50%) */}
                                <div className="flex-1 flex items-center gap-4 h-full px-6 border-r border-white/10 min-w-0">
                                    <div className="flex flex-col min-w-[70px]">
                                        <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest leading-none">Current</span>
                                        <span className="text-[10px] font-bold text-white uppercase tracking-tight">Session</span>
                                    </div>
                                    <div className="flex-1 flex items-center gap-2 overflow-x-auto overflow-y-hidden h-full py-2 scrollbar-none">
                                        {captures.length > 0 ? (
                                            captures.map((cap, i) => (
                                                <div
                                                    key={cap.id || i}
                                                    onClick={() => handleSelectComparisonImage(cap, false)}
                                                    className={`w-14 h-14 shrink-0 rounded-lg bg-zinc-900 border-2 overflow-hidden cursor-pointer transition-all relative group ${((typeof compareLeftImage === 'string' ? compareLeftImage : compareLeftImage?.url) === cap.url) ? 'border-emerald-500 shadow-lg shadow-emerald-500/20' : 'border-white/5 hover:border-white/20'}`}
                                                >
                                                    {cap.type === "video" ? (
                                                        <div className="w-full h-full flex items-center justify-center bg-indigo-500/10">
                                                            <Video size={14} className="text-indigo-400" />
                                                        </div>
                                                    ) : (
                                                        <img src={cap.url} className="w-full h-full object-cover transition-transform group-hover:scale-110" alt="" />
                                                    )}
                                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                                                </div>
                                            ))
                                        ) : (
                                            <div className="text-zinc-700 text-[9px] font-bold uppercase tracking-widest px-4">No Media</div>
                                        )}
                                    </div>
                                </div>

                                {/* History Gallery (Right 50%) */}
                                <div className="flex-1 flex items-center gap-4 h-full px-6 min-w-0">
                                    <div className="flex flex-col min-w-[100px]">
                                        <span className="text-[8px] font-black text-indigo-500 uppercase tracking-widest leading-none">Patient</span>
                                        <span className="text-[10px] font-bold text-white uppercase tracking-tight">History</span>
                                    </div>
                                    <div className="flex-1 flex items-center gap-3 overflow-x-auto overflow-y-hidden h-full py-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                                        {history.length > 0 ? (
                                            history.map((h: any, sessionIdx: number) => (
                                                <div key={h.id || sessionIdx} className="flex items-center gap-2 h-full shrink-0">
                                                    {/* Session Group Header Pill */}
                                                    <div className="h-14 px-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex flex-col justify-center shrink-0">
                                                        <span className="text-[7px] font-black text-indigo-400 uppercase tracking-widest leading-none mb-0.5">{h.date}</span>
                                                        <span className="text-[9px] font-bold text-white/80 uppercase truncate max-w-[80px] leading-tight">{h.procedure}</span>
                                                    </div>

                                                    {/* Media Items for this session */}
                                                    <div className="flex items-center gap-2">
                                                        {(h.media || []).map((m: any, idx: number) => (
                                                            <div
                                                                key={m.id || idx}
                                                                onClick={() => handleSelectComparisonImage(m, true)}
                                                                className={`w-14 h-14 shrink-0 rounded-lg bg-zinc-900 border-2 overflow-hidden cursor-pointer transition-all relative group shadow-lg ${comparisonImage?.id === m.id ? 'border-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.3)]' : 'border-white/5 hover:border-white/20'}`}
                                                                title={`${h.date} - ${h.procedure}`}
                                                            >
                                                                {m.type === "image" ? (
                                                                    <img src={m.url} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt="" />
                                                                ) : m.type === "video" ? (
                                                                    <div className="w-full h-full flex items-center justify-center bg-indigo-500/10">
                                                                        <Video size={14} className="text-indigo-400" />
                                                                    </div>
                                                                ) : (
                                                                    <div className="w-full h-full flex items-center justify-center bg-red-500/10">
                                                                        <FileText size={14} className="text-red-400" />
                                                                    </div>
                                                                )}
                                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all" />
                                                            </div>
                                                        ))}
                                                    </div>

                                                    {/* Divider between sessions */}
                                                    {sessionIdx < history.length - 1 && (
                                                        <div className="w-px h-8 bg-white/5 mx-1" />
                                                    )}
                                                </div>
                                            ))
                                        ) : (
                                            <div className="text-zinc-700 text-[9px] font-bold uppercase tracking-widest px-4 italic">No history available</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                    ) : previewImage ? (
                        <div 
                            ref={previewConstraintsRef}
                            className="w-full h-full relative flex items-center justify-center bg-black/80 backdrop-blur-md cursor-pointer"
                            onClick={() => setPreviewImage(null)}
                        >
                            <img src={previewImage} className="max-w-full max-h-full object-contain pointer-events-none" alt="Captured" />
                            
                            {/* PIP Toggle Button */}
                            <button
                                onClick={(e) => { e.stopPropagation(); setShowPip(p => !p); }}
                                className={`absolute top-6 right-6 h-9 px-4 rounded-full flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all border shadow-lg z-[90] ${showPip ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-black/60 border-white/10 text-white/60'}`}
                            >
                                <Video size={14} />
                                <span>{showPip ? "Hide PIP" : "Show PIP"}</span>
                            </button>

                            <div className="absolute top-4 left-4 px-4 py-2 rounded-full bg-indigo-600/20 border border-indigo-500/30 backdrop-blur-md z-20 pointer-events-none">
                                <span className="text-[11px] font-black text-indigo-100 uppercase tracking-widest">Image Preview</span>
                            </div>

                            {/* LIVE PIP during Preview */}
                            <AnimatePresence>
                                {showPip && (
                                    <motion.div
                                        drag dragConstraints={previewConstraintsRef} dragElastic={0} dragMomentum={false}
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.8 }}
                                        onDragStart={() => { isDraggingRef.current = true; }}
                                        onDragEnd={() => { setTimeout(() => { isDraggingRef.current = false; }, 250); }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (!isDraggingRef.current) {
                                                setPreviewImage(null);
                                            }
                                        }}
                                        className="absolute bottom-6 right-6 z-[60] w-48 h-48 rounded-full border-2 border-white/20 shadow-2xl overflow-hidden bg-black ring-4 ring-black/50 cursor-grab active:cursor-grabbing hover:border-indigo-500 shadow-indigo-500/20 group/pip"
                                    >
                                        <CameraFeed
                                            ref={feedRef}
                                            className="w-full h-full"
                                            pipMode
                                            aspectRatioCorrection={settings.aspectRatio}
                                        />
                                        <div className="absolute inset-0 bg-black/0 group-hover/pip:bg-black/40 flex items-center justify-center transition-colors">
                                            <div className="flex flex-col items-center gap-1 opacity-0 group-hover/pip:opacity-100">
                                                <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_#ef4444]" />
                                                <span className="text-[8px] font-black text-white uppercase tracking-widest">Live Feed</span>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                    ) : (
                        /* ═══ LIVE CAMERA FEED ═══ */
                        <div
                            ref={(el) => {
                                (mainFeedConstraintsRef as any).current = el;
                                if (el && (el.clientWidth !== mainSize.w || el.clientHeight !== mainSize.h)) {
                                    setMainSize({ w: el.clientWidth, h: el.clientHeight });
                                }
                            }}
                            className="w-full h-full relative flex items-center justify-center overflow-hidden"
                        >
                            <motion.div
                                drag={mainZoom > 1.01}
                                dragMomentum={false}
                                dragElastic={0}
                                dragConstraints={mainFeedConstraintsRef}
                                onDrag={(_e, info) => {
                                    setZoomPanOffset(prev => {
                                        // Clamp pan so zoomed content stays within canvas
                                        const el = mainFeedConstraintsRef.current;
                                        const W = el ? el.clientWidth : window.innerWidth;
                                        const H = el ? el.clientHeight : window.innerHeight;
                                        const maxX = (W * (mainZoom - 1)) / 2;
                                        const maxY = (H * (mainZoom - 1)) / 2;
                                        const nx = Math.max(-maxX, Math.min(maxX, prev.x + info.delta.x));
                                        const ny = Math.max(-maxY, Math.min(maxY, prev.y + info.delta.y));
                                        return { x: nx, y: ny };
                                    });
                                }}
                                animate={{ x: zoomPanOffset.x, y: zoomPanOffset.y, scale: mainZoom }}
                                transition={{ type: "spring", stiffness: 400, damping: 40, mass: 0.4 }}
                                style={{ transformOrigin: '50% 50%', width: '100%', height: '100%' }}
                                className="flex items-center justify-center cursor-default active:cursor-grabbing"
                            >
                                {frozenFrame ? (
                                    <img src={frozenFrame} alt="Frozen" className="w-full h-full object-contain" style={{ background: "#000" }} />
                                ) : (
                                    <CameraFeed
                                        ref={feedRef}
                                        className="w-full h-full"
                                        zoom={mainZoom}
                                        zoomPanOffset={zoomPanOffset}
                                        aspectRatioCorrection={settings.aspectRatio}
                                    />
                                )}
                            </motion.div>
                        </div>
                    )
                    }

                    {/* Frozen Frame PiP */}
                    <AnimatePresence>
                        {frozenFrame && !isCompareMode && (
                            <motion.div
                                drag dragConstraints={mainFeedConstraintsRef} dragElastic={0} dragMomentum={false}
                                initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                                onDragStart={() => { isDraggingRef.current = true; }}
                                onDragEnd={() => { setTimeout(() => { isDraggingRef.current = false; }, 250); }}
                                onClick={(e) => { e.stopPropagation(); if (!isDraggingRef.current) setFrozenFrame(null); }}
                                className="absolute bottom-6 right-6 z-[60] w-44 h-44 rounded-full border-2 border-white/20 shadow-2xl overflow-hidden bg-black ring-4 ring-black/50 cursor-grab active:cursor-grabbing hover:border-blue-500/50 shadow-blue-500/20 group"
                                title="Return to Live Feed"
                            >
                                <CameraFeed
                                    className="w-full h-full"
                                    pipMode
                                    aspectRatioCorrection={settings.aspectRatio}
                                    zoom={mainZoom}
                                    zoomPanOffset={zoomPanOffset}
                                />
                                <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors">
                                    <div className="flex flex-col items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444]" />
                                        <span className="text-[9px] font-black text-white uppercase tracking-widest">Live Feed</span>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>



                    {/* Flash overlay */}
                    <AnimatePresence>
                        {flashActive && (
                            <motion.div
                                initial={{ opacity: 0.8 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                className="absolute inset-0 bg-white z-[70] pointer-events-none"
                            />
                        )}
                    </AnimatePresence>
                </div >
            </main >

            {/* ═══ RIGHT: TOOLBAR (25%) ═══ */}
            {
                !isCompareMode && (
                    <div className="w-[30%] flex flex-col min-w-0 max-h-screen overflow-hidden border-l border-white/5">
                        <ProcedureToolPanel
                            patient={patient}
                            activeScopeName={scopes.find(s => s.id === activeScopeId)?.name}
                            timer={sessionTimer}
                            timerDisplayRef={timerDisplayRef}
                            formatTime={formatTime}
                            onCapture={handleCapture}
                            onToggleRecording={toggleRecording}
                            isRecording={isRecording}
                            zoom={mainZoom}
                            zoomRange={zoomRange}
                            onZoomChange={handleZoomChange}
                            frozenFrame={frozenFrame}
                            onToggleFreeze={handleToggleFreeze}
                            isCompareMode={isCompareMode}
                            onToggleCompare={handleToggleCompare}
                            segments={segments as any}
                            activeSegmentIndex={activeSegmentIndex}
                            onSetActiveSegment={setActiveSegment}
                            onRemoveSegment={removeSegment}
                            onAddSegment={handleAddSegment}
                            captures={captures}
                            onRemoveCapture={handleRemoveCapture}
                            onOpenStudio={handleOpenGallery as any}
                            onPlayVideo={(cap: any) => setPlayingVideo(cap)}
                            history={history}
                            comparisonImage={comparisonImage}
                            onSelectComparisonImage={handleSelectComparisonImage}
                            onBack={handleBack}
                            onEndProcedure={handleEndProcedure}
                            duration={formatTime(sessionTimer)}
                            settings={settings}
                            updateSetting={updateSetting}
                            historyExpanded={historyExpanded}
                            setHistoryExpanded={setHistoryExpanded}
                            onOpenScopeSettings={() => setIsScopeSettingsOpen(true)}
                        />
                    </div>
                )
            }

            {/* ═══ MODALS ═══ */}
            <AnimatePresence>
                {showEndConfirm && (
                    <div key="end-confirm" className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center">
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}
                            className="bg-zinc-900 border border-zinc-800 p-8 rounded-2xl max-w-md w-full text-center shadow-2xl">
                            <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
                            <h3 className="text-xl font-bold text-white mb-2">End Procedure?</h3>
                            <p className="text-zinc-400 text-sm mb-8">This will finalize the procedure. You'll be redirected to the Annotate Section.</p>
                            <div className="flex gap-4 justify-center">
                                <button onClick={() => setShowEndConfirm(false)} className="px-6 py-3 rounded-xl bg-zinc-800 text-white font-bold hover:bg-zinc-700">Cancel</button>
                                <button onClick={performFinish} className="px-6 py-3 rounded-xl bg-red-600 text-white font-bold hover:bg-red-500 shadow-lg shadow-red-900/20">Finish & Go to Annotate</button>
                            </div>
                        </motion.div>
                    </div>
                )}
                <ExitPreviewModal
                    key="exit-preview-modal"
                    isOpen={showExitPreview}
                    onClose={() => setShowExitPreview(false)}
                    onConfirm={() => { if (onBack) onBack(); }}
                    captures={captures}
                    patientName={patient.name || patient.fullName}
                    duration={formatTime(sessionTimer)}
                    isWaiting={isRecordingProcessing || pendingUploads.length > 0}
                />
                {showRecordingWarning && (
                    <div key="rec-warning" className="fixed inset-0 z-[200] bg-black/85 flex items-center justify-center">
                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl text-center">
                            <AlertCircle size={48} className="text-amber-500 mx-auto mb-4" />
                            <h3 className="text-white font-bold text-lg mb-2">Recording Active</h3>
                            <p className="text-zinc-400 text-sm mb-6">Stop and save recording first?</p>
                            <div className="flex gap-3">
                                <button onClick={() => setShowRecordingWarning(false)} className="flex-1 py-3 bg-zinc-800 rounded-xl text-white font-bold text-xs uppercase">Cancel</button>
                                <button onClick={() => { toggleRecording(); setShowRecordingWarning(false); setTimeout(() => setShowEndConfirm(true), 500); }}
                                    className="flex-1 py-3 bg-amber-500 text-black rounded-xl font-bold text-xs uppercase">Stop & Finish</button>
                            </div>
                        </div>
                    </div>
                )}
                {isGalleryOpen && (
                    <ImageGallery key="gallery" isOpen={isGalleryOpen}
                        images={captures.filter(c => c.type === "image" || !c.type).map(c => ({ id: c.id, filePath: c.url, type: "image", timestamp: c.timestamp } as MediaItem))}
                        initialIndex={galleryInitialIndex} onClose={() => setIsGalleryOpen(false)} />
                )}
                {isPlayingVideo && (
                    <motion.div key="video-player" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-8"
                        onClick={() => setPlayingVideo(null)}>
                        <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
                            className="relative max-w-5xl w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10"
                            onClick={e => e.stopPropagation()}>
                            <button onClick={() => setPlayingVideo(null)} className="absolute top-4 right-4 z-20 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center"><X size={20} /></button>
                            <video src={isPlayingVideo.url} controls autoPlay className="w-full h-full object-contain" />
                        </motion.div>
                    </motion.div>
                )}
                <CustomScopeSettingsInterface key="scope-settings-modal" isOpen={isScopeSettingsOpen} onClose={() => setIsScopeSettingsOpen(false)} isFreezed={!!frozenFrame} />
            </AnimatePresence>

            <style jsx global>{`::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: #09090b; } ::-webkit-scrollbar-thumb { background: #27272a; border-radius: 4px; } input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 12px; height: 12px; border-radius: 50%; background: white; cursor: pointer; box-shadow: 0 0 10px rgba(0,0,0,0.5); }`}</style>
        </div >
    );
}