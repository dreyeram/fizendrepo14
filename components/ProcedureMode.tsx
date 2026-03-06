"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
    Camera, X, Video, Move3d, AlertCircle, ArrowLeft,
    ZoomIn, ZoomOut, RotateCcw, FileText
} from "lucide-react";
import { endProcedure, createProcedure } from "@/app/actions/procedure";
import { getPatientHistory } from "@/app/actions/patient";
import { useSettings } from "@/contexts/SettingsContext";
import { useSessionStore } from "@/lib/store/session.store";
import ProcedureToolPanel from "./procedure/ProcedureToolPanel";
import ImageGallery, { MediaItem } from "./gallery/ImageGallery";
import CameraFeed, { CameraFeedHandle } from "./procedure/CameraFeed";
import {
    Capture, PendingUpload,
    createCapture, uploadCapture, saveVideoReference,
    fetchExistingMedia, processPendingUploads,
    persistCaptures, loadPersistedCaptures, clearPersistedCaptures,
} from "@/lib/procedure-data";

// ═══════════════════════════════════════════════════════════
//  ProcedureMode v3 — Clean Rewrite + Robust Data Handling
// ═══════════════════════════════════════════════════════════

interface Props {
    procedureId: string;
    patient: { name: string; age?: number; gender?: string; id: string;[key: string]: any };
    onBack?: () => void;
    onGenerateReport?: (captures: Capture[]) => void;
}

export default function ProcedureMode({ procedureId, patient, onBack, onGenerateReport }: Props) {
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
        segments, activeSegmentIndex, setActiveSegment, addSegment, updateSegment,
        captures, addCapture, setCaptures
    } = useSessionStore();

    // ── Camera ──
    const feedRef = useRef<CameraFeedHandle>(null);

    // ── Recording ──
    const [isRecording, setIsRecording] = useState(false);

    // ── Captures (managed via session store) ──
    const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);

    // ── Freeze & PiP ──
    const [frozenFrame, setFrozenFrame] = useState<string | null>(null);

    // ── Compare Mode ──
    const [isCompareMode, setIsCompareMode] = useState(false);
    const [comparisonImage, setComparisonImage] = useState<any>(null);
    const [compareLeftImage, setCompareLeftImage] = useState<any>(null);
    const [leftCompareZoom, setLeftCompareZoom] = useState(1);
    const [rightCompareZoom, setRightCompareZoom] = useState(1);
    const [leftCompareOffset, setLeftCompareOffset] = useState({ x: 0, y: 0 });
    const [rightCompareOffset, setRightCompareOffset] = useState({ x: 0, y: 0 });

    // ── Timer ──
    const timerRef = useRef(0);
    const timerDisplayRef = useRef<HTMLSpanElement>(null);

    // ── UI ──
    const [flashActive, setFlashActive] = useState(false);
    const [showEndConfirm, setShowEndConfirm] = useState(false);
    const [showBackConfirm, setShowBackConfirm] = useState(false);
    const [showRecordingWarning, setShowRecordingWarning] = useState(false);
    const [isPlayingVideo, setPlayingVideo] = useState<any>(null);
    const [isGalleryOpen, setIsGalleryOpen] = useState(false);
    const [galleryInitialIndex, setGalleryInitialIndex] = useState(0);
    const [previewImage, setPreviewImage] = useState<string | null>(null);

    // ── History ──
    const [history, setHistory] = useState<any[]>([]);
    const [historyExpanded, setHistoryExpanded] = useState(false);

    // ── Zoom ──
    const [mainZoom, setMainZoom] = useState(1);
    const [zoomRange] = useState({ min: 1, max: 12 });

    // ── Refs ──
    const constraintsRef = useRef<HTMLDivElement>(null);
    const isDraggingRef = useRef(false);

    // ═══════════════════════════════════════
    //  BOOT
    // ═══════════════════════════════════════

    // Timer
    useEffect(() => {
        const iv = setInterval(() => {
            timerRef.current++;
            if (timerDisplayRef.current) {
                const s = timerRef.current;
                timerDisplayRef.current.textContent =
                    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
            }
        }, 1000);
        return () => clearInterval(iv);
    }, []);

    // Fetch patient history
    useEffect(() => {
        if (!patient?.id) return;
        getPatientHistory(patient.id)
            .then(res => { if (res.success && res.history) setHistory(res.history); })
            .catch(e => console.error("History fetch error:", e));
    }, [patient?.id]);

    // ── Session Resumption: load from DB + localStorage ──
    useEffect(() => {
        if (segments.length === 0) return;
        let mounted = true;

        (async () => {
            try {
                // 1. Try loading persisted captures from localStorage (crash recovery)
                const persisted = loadPersistedCaptures(procedureId);

                // 2. Fetch from database for all real segments
                const dbCaptures = await fetchExistingMedia(segments as any);

                if (!mounted) return;

                // 3. Merge: DB items take priority, then persisted, avoid duplicates
                setCaptures(prev => {
                    const existingIds = new Set(prev.map(c => c.id));
                    const combined = [...prev];

                    for (const cap of dbCaptures) {
                        if (!existingIds.has(cap.id)) {
                            combined.push(cap);
                            existingIds.add(cap.id);
                        }
                    }

                    // Add persisted items that are "saved" and have served URLs
                    if (persisted?.captures) {
                        for (const cap of persisted.captures) {
                            if (cap.url !== "__pending__" && !existingIds.has(cap.id)) {
                                combined.push(cap);
                                existingIds.add(cap.id);
                            }
                        }
                    }

                    return combined;
                });

                // 4. Restore pending uploads from persisted session
                if (persisted?.pendingUploads && persisted.pendingUploads.length > 0) {
                    setPendingUploads(persisted.pendingUploads);
                }
            } catch (e) { console.error("Session resumption error:", e); }
        })();

        return () => { mounted = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [segments.length]);

    // ── Persist captures to localStorage on change ──
    useEffect(() => {
        if (captures.length > 0 || pendingUploads.length > 0) {
            persistCaptures(procedureId, captures, pendingUploads);
        }
    }, [captures, pendingUploads, procedureId]);

    // ═══════════════════════════════════════
    //  CORE FUNCTIONS
    // ═══════════════════════════════════════

    const formatTime = (s: number) =>
        `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

    // ── Sound ──
    const audioCtxRef = useRef<AudioContext | null>(null);
    const playSound = useCallback((type: "success" | "error") => {
        if (!settings.soundEnabled) return;
        if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
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
        if (!capData) {
            console.warn("[ProcedureMode] Capture failed — captureFrame() returned null");
            playSound("error");
            return;
        }
        if (returnDataOnly) return capData;

        // Create capture object
        console.log("[ProcedureMode] Creating capture for segmentIndex:", activeSegmentIndex, "procedureId:", procedureId);
        const newCap = createCapture(capData, "image", activeSegmentIndex, procedureId);
        addCapture(newCap);
        playSound("success");

        if (isCompareMode) setCompareLeftImage(newCap);

        // Background upload
        (async () => {
            try {
                const currentSegment = segments.find(s => s.index === activeSegmentIndex);
                const currentId = currentSegment?.id || procedureId;
                if (!currentId) return;

                if (currentId.toString().startsWith("temp-")) {
                    // Segment doesn't have a real DB ID yet — defer
                    setPendingUploads(prev => [...prev, {
                        captureId: newCap.id, tempSegmentId: currentId,
                        segmentIndex: activeSegmentIndex,
                        type: "image", data: capData, timestamp: newCap.timestamp,
                    }]);
                } else {
                    // Upload immediately
                    const result = await uploadCapture(currentId, capData, "IMAGE");
                    if (result.success) {
                        setCaptures(prev => prev.map(c =>
                            c.id === newCap.id
                                ? { ...c, dbMediaId: result.mediaId, url: result.servedUrl || c.url, uploadStatus: "saved" as const }
                                : c
                        ));
                        console.log(`[ProcedureMode] Capture saved: ${result.mediaId}`);
                    } else {
                        console.error("[ProcedureMode] Upload failed:", result.error);
                        setCaptures(prev => prev.map(c =>
                            c.id === newCap.id ? { ...c, uploadStatus: "failed" as const } : c
                        ));
                    }
                }
            } catch (err) { console.error("[ProcedureMode] Capture save error:", err); }
        })();
    }, [procedureId, activeSegmentIndex, segments, playSound, isCompareMode]);

    // ── Recording (daemon-based) ──
    const toggleRecording = useCallback(async () => {
        const host = window.location.hostname || "localhost";
        if (!isRecording) {
            try {
                const res = await fetch(`http://${host}:5555/record/start`).catch(() => null);
                if (res?.ok) setIsRecording(true);
                else console.warn("Daemon record/start failed or not available");
            } catch { }
        } else {
            setIsRecording(false);
            try {
                const res = await fetch(`http://${host}:5555/record/stop`).catch(() => null);
                if (res?.ok) {
                    const data = await res.json();
                    const videoUrl = data.filename || null;
                    if (videoUrl) {
                        const newCap = createCapture(videoUrl, "video", activeSegmentIndex, procedureId);
                        addCapture(newCap);

                        const activeProcId = segments.find(s => s.index === activeSegmentIndex)?.id;
                        if (activeProcId && !activeProcId.toString().startsWith("temp-")) {
                            const result = await saveVideoReference(activeProcId.toString(), videoUrl);
                            if (result.success) {
                                setCaptures(prev => prev.map(c =>
                                    c.id === newCap.id
                                        ? { ...c, dbMediaId: result.mediaId, uploadStatus: "saved" as const }
                                        : c
                                ));
                            }
                        } else if (activeProcId) {
                            setPendingUploads(prev => [...prev, {
                                captureId: newCap.id, tempSegmentId: activeProcId.toString(),
                                segmentIndex: activeSegmentIndex,
                                type: "video", data: videoUrl, timestamp: newCap.timestamp,
                            }]);
                        }
                    }
                }
            } catch (e) { console.error("Record stop error:", e); }
        }
    }, [isRecording, activeSegmentIndex, segments, procedureId]);

    // ── Freeze ──
    const handleToggleFreeze = useCallback(() => {
        if (frozenFrame) {
            setFrozenFrame(null);
        } else {
            const frame = feedRef.current?.captureFrame();
            if (frame) setFrozenFrame(frame);
        }
    }, [frozenFrame]);

    // ── Zoom ──
    const handleZoomChange = useCallback((z: number) => {
        setMainZoom(z);
    }, []);

    // ── Compare Mode ──
    useEffect(() => {
        if (!isCompareMode) {
            setCompareLeftImage(null);
            setComparisonImage(null);
            setLeftCompareZoom(1);
            setRightCompareZoom(1);
            setLeftCompareOffset({ x: 0, y: 0 });
            setRightCompareOffset({ x: 0, y: 0 });
        }
    }, [isCompareMode]);

    const handleToggleCompare = useCallback(() => { setIsCompareMode(p => !p); }, []);

    const handleSelectComparisonImage = useCallback((url: string | null, isHistory?: boolean) => {
        if (url) {
            if (isHistory) setComparisonImage(url);
            else setCompareLeftImage(url);
            setIsCompareMode(true);
        } else {
            setIsCompareMode(false);
        }
    }, []);

    // ── Switch Camera (no-op for daemon, kept for interface) ──
    const handleSwitchCamera = useCallback(() => { }, []);

    // ── Open Gallery / Preview ──
    const handleOpenGallery = useCallback((cap: Capture) => {
        setPreviewImage(cap.url);
    }, []);

    // ── Add Segment ──
    const handleAddSegment = useCallback(async () => {
        try {
            const { getSeededDoctorId } = await import("@/app/actions/auth");
            const docId = await getSeededDoctorId();
            if (!docId) return;

            const newIndex = segments.length + 1;
            const tempId = `temp-${Date.now()}`;
            addSegment({ id: tempId, index: newIndex, status: "draft", createdAt: new Date(), type: "generic" });

            createProcedure({ patientId: patient.id, doctorId: docId, type: "generic" })
                .then(res => {
                    if (res.success && res.procedureId) updateSegment(newIndex, { id: res.procedureId });
                })
                .catch(err => console.error("Create procedure error:", err));
        } catch (err) { console.error("Failed to create segment:", err); }
    }, [segments, patient.id, addSegment, updateSegment]);

    // ── Deferred Upload Processor ──
    useEffect(() => {
        if (pendingUploads.length === 0) return;
        (async () => {
            const remaining = await processPendingUploads(
                pendingUploads,
                segments as any,
                (captureId, updates) => {
                    setCaptures(prev => prev.map(c =>
                        c.id === captureId ? { ...c, ...updates } : c
                    ));
                }
            );
            if (remaining.length !== pendingUploads.length) {
                setPendingUploads(remaining);
            }
        })();
    }, [pendingUploads, segments]);

    // ── Back ──
    const handleBack = useCallback(() => {
        if (isCompareMode) {
            setIsCompareMode(false);
            return;
        }
        if (isRecording || captures.length > 0) setShowBackConfirm(true);
        else if (onBack) onBack();
    }, [isCompareMode, isRecording, captures.length, onBack]);

    // ── End ──
    const handleEndProcedure = useCallback(() => {
        if (isRecording) setShowRecordingWarning(true);
        else setShowEndConfirm(true);
    }, [isRecording]);

    // ── Finish ──
    const performFinish = async () => {
        if (onGenerateReport) onGenerateReport(captures);
        (async () => {
            if (pendingUploads.length > 0) {
                let retries = 0;
                while (pendingUploads.length > 0 && retries < 10) {
                    await new Promise(r => setTimeout(r, 500));
                    retries++;
                }
            }
            try { await endProcedure(procedureId); } catch (e) { console.error("endProcedure failed:", e); }
        })();
    };

    // ═══════════════════════════════════════
    //  KEYBOARD SHORTCUTS
    // ═══════════════════════════════════════
    const captureRef = useRef(handleCapture);
    const toggleRecRef = useRef(toggleRecording);
    const freezeRef = useRef(handleToggleFreeze);
    const showEndConfirmRef = useRef(showEndConfirm);
    const showBackConfirmRef = useRef(showBackConfirm);
    const isGalleryOpenRef = useRef(isGalleryOpen);
    const frozenFrameRef = useRef(frozenFrame);

    useEffect(() => { captureRef.current = handleCapture; }, [handleCapture]);
    useEffect(() => { toggleRecRef.current = toggleRecording; }, [toggleRecording]);
    useEffect(() => { freezeRef.current = handleToggleFreeze; }, [handleToggleFreeze]);
    useEffect(() => { showEndConfirmRef.current = showEndConfirm; }, [showEndConfirm]);
    useEffect(() => { showBackConfirmRef.current = showBackConfirm; }, [showBackConfirm]);
    useEffect(() => { isGalleryOpenRef.current = isGalleryOpen; }, [isGalleryOpen]);
    useEffect(() => { frozenFrameRef.current = frozenFrame; }, [frozenFrame]);

    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            switch (e.key.toLowerCase()) {
                case " ": case "enter": e.preventDefault(); captureRef.current(); break;
                case "r": e.preventDefault(); toggleRecRef.current(); break;
                case "f": e.preventDefault(); freezeRef.current(); break;
                case "c": e.preventDefault(); setIsCompareMode(p => !p); break;
                case "=": case "+": e.preventDefault(); setMainZoom(p => Math.min(p + 0.5, 12)); break;
                case "-": e.preventDefault(); setMainZoom(p => Math.max(p - 0.5, 1)); break;
                case "z": e.preventDefault(); setMainZoom(1); break;
                case "escape":
                    e.preventDefault();
                    if (showEndConfirmRef.current) setShowEndConfirm(false);
                    else if (showBackConfirmRef.current) setShowBackConfirm(false);
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
                className={`${isCompareMode ? "w-full" : "w-[75%]"} relative flex flex-col min-w-0 cursor-default overflow-hidden shrink-0 transition-all duration-300 bg-black`}
            >
                <div className="flex-1 relative bg-black overflow-hidden">

                    {/* ── Compare Mode ── */}
                    {isCompareMode ? (
                        <div className="w-full h-full flex flex-col overflow-hidden bg-black relative">
                            <button
                                onClick={() => setIsCompareMode(false)}
                                className="absolute top-4 right-4 z-[80] w-9 h-9 rounded-full bg-red-950/80 hover:bg-red-600/40 flex items-center justify-center text-red-100 transition-all border border-red-500/30 shadow-lg"
                                title="Exit Compare Mode"
                            >
                                <X size={18} />
                            </button>

                            <div className="flex-1 flex overflow-hidden min-h-0 bg-zinc-950 p-3 gap-4">
                                {/* LEFT: Session image or live feed */}
                                <div className="flex-1 relative bg-black/40 rounded-3xl flex items-center justify-center border-2 border-white/5 overflow-hidden">
                                    {compareLeftImage ? (
                                        <div className="w-full h-full relative flex items-center justify-center overflow-hidden">
                                            {compareLeftImage?.type === "video" ? (
                                                <video src={compareLeftImage?.url} controls muted autoPlay loop className="max-w-full max-h-full object-contain" />
                                            ) : (
                                                <motion.img
                                                    drag={leftCompareZoom > 1}
                                                    dragMomentum={false}
                                                    dragElastic={0}
                                                    onDrag={(_e, info) => { setLeftCompareOffset(prev => ({ x: prev.x + info.delta.x, y: prev.y + info.delta.y })); }}
                                                    src={compareLeftImage?.url || compareLeftImage}
                                                    className={`max-w-full max-h-full object-contain cursor-${leftCompareZoom > 1 ? "grab" : "pointer"}`}
                                                    style={{ scale: leftCompareZoom }}
                                                    animate={{ x: leftCompareOffset.x, y: leftCompareOffset.y }}
                                                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                                    alt="Left"
                                                />
                                            )}
                                        </div>
                                    ) : (
                                        <CameraFeed ref={feedRef} className="w-full h-full" />
                                    )}
                                    <div className="absolute top-4 left-4 px-4 py-2 rounded-full bg-emerald-950/80 border border-emerald-500/30 z-20">
                                        <span className="text-[11px] font-black text-emerald-100 uppercase tracking-widest">
                                            {compareLeftImage ? "Image A" : "Live Feed"}
                                        </span>
                                    </div>
                                </div>

                                {/* RIGHT: Comparison image */}
                                <div className="flex-1 relative bg-black/40 rounded-3xl flex items-center justify-center border-2 border-white/5 overflow-hidden">
                                    {comparisonImage ? (
                                        <div className="w-full h-full relative flex items-center justify-center overflow-hidden">
                                            <motion.img
                                                drag={rightCompareZoom > 1}
                                                dragMomentum={false}
                                                dragElastic={0}
                                                onDrag={(_e, info) => { setRightCompareOffset(prev => ({ x: prev.x + info.delta.x, y: prev.y + info.delta.y })); }}
                                                src={typeof comparisonImage === "string" ? comparisonImage : comparisonImage?.url}
                                                className={`max-w-full max-h-full object-contain cursor-${rightCompareZoom > 1 ? "grab" : "pointer"}`}
                                                style={{ scale: rightCompareZoom }}
                                                animate={{ x: rightCompareOffset.x, y: rightCompareOffset.y }}
                                                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                                alt="Right"
                                            />
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center gap-3 opacity-20">
                                            <Move3d size={32} />
                                            <span className="text-[10px] font-bold uppercase tracking-widest">Select an image to compare</span>
                                        </div>
                                    )}
                                    <div className="absolute top-4 left-4 px-4 py-2 rounded-full bg-indigo-950/80 border border-indigo-500/30 z-20">
                                        <span className="text-[11px] font-black text-indigo-100 uppercase tracking-widest">Image B</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                    ) : previewImage ? (
                        /* ── Image Preview ── */
                        <div className="w-full h-full relative flex items-center justify-center bg-black/80 backdrop-blur-md">
                            <img src={previewImage} className="max-w-full max-h-full object-contain" alt="Captured" />
                            <button
                                onClick={() => setPreviewImage(null)}
                                className="absolute top-4 right-4 z-[80] w-12 h-12 rounded-full bg-black/80 hover:bg-red-600 flex items-center justify-center text-white/70 hover:text-white transition-all border border-white/20 shadow-2xl"
                            >
                                <X size={24} />
                            </button>
                            <div className="absolute top-4 left-4 px-4 py-2 rounded-full bg-indigo-600/20 border border-indigo-500/30 backdrop-blur-md z-20">
                                <span className="text-[11px] font-black text-indigo-100 uppercase tracking-widest">Image Preview</span>
                            </div>
                        </div>

                    ) : (
                        /* ═══ RAW CAMERA FEED ═══ */
                        <div className="w-full h-full" style={{ transform: mainZoom > 1 ? `scale(${mainZoom})` : undefined, transformOrigin: "center center", transition: "transform 0.15s ease-out" }}>
                            {frozenFrame ? (
                                <img src={frozenFrame} alt="Frozen" className="w-full h-full object-contain" style={{ background: "#000" }} />
                            ) : (
                                <CameraFeed ref={feedRef} className="w-full h-full" />
                            )}
                        </div>
                    )}

                    {/* Frozen Frame PiP — circular draggable bubble */}
                    <AnimatePresence>
                        {frozenFrame && !isCompareMode && (
                            <motion.div
                                drag
                                dragConstraints={constraintsRef}
                                dragMomentum={false}
                                dragElastic={0.1}
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                onDragStart={() => { isDraggingRef.current = true; }}
                                onDragEnd={() => { setTimeout(() => { isDraggingRef.current = false; }, 250); }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (!isDraggingRef.current) setFrozenFrame(null);
                                }}
                                className="absolute bottom-6 right-6 z-[60] w-44 h-44 rounded-full border-2 border-white/20 shadow-2xl overflow-hidden bg-black ring-4 ring-black/50 cursor-grab active:cursor-grabbing hover:border-blue-500/50 transition-all group"
                                title="Return to Live Feed"
                            >
                                <CameraFeed className="w-full h-full" />
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
                                initial={{ opacity: 0.8 }}
                                animate={{ opacity: 0 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                className="absolute inset-0 bg-white z-[70] pointer-events-none"
                            />
                        )}
                    </AnimatePresence>
                </div>
            </main>

            {/* ═══ RIGHT: TOOLBAR (25%) ═══ */}
            {!isCompareMode && (
                <div className="w-[25%] flex flex-col min-w-0 max-h-screen overflow-hidden border-l border-white/5">
                    <ProcedureToolPanel
                        patient={patient}
                        timer={timerRef.current}
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
                        onAddSegment={handleAddSegment}
                        captures={captures}
                        onOpenStudio={handleOpenGallery as any}
                        onPlayVideo={(cap: any) => setPlayingVideo(cap)}
                        history={history}
                        comparisonImage={comparisonImage}
                        onSelectComparisonImage={handleSelectComparisonImage}
                        onBack={handleBack}
                        onEndProcedure={() => setShowEndConfirm(true)}
                        settings={settings}
                        updateSetting={updateSetting}
                        historyExpanded={historyExpanded}
                        setHistoryExpanded={setHistoryExpanded}
                    />
                </div>
            )}

            {/* ═══ MODALS ═══ */}
            <AnimatePresence>
                {showEndConfirm && (
                    <div key="end-confirm" className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center">
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}
                            className="bg-zinc-900 border border-zinc-800 p-8 rounded-2xl max-w-md w-full text-center shadow-2xl">
                            <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
                            <h3 className="text-xl font-bold text-white mb-2">End Procedure?</h3>
                            <p className="text-zinc-400 text-sm mb-8">This will finalize the session. You'll be redirected to the Report Editor.</p>
                            <div className="flex gap-4 justify-center">
                                <button onClick={() => setShowEndConfirm(false)} className="px-6 py-3 rounded-xl bg-zinc-800 text-white font-bold hover:bg-zinc-700">Cancel</button>
                                <button onClick={performFinish} className="px-6 py-3 rounded-xl bg-red-600 text-white font-bold hover:bg-red-500 shadow-lg shadow-red-900/20">Confirm Finish</button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {showBackConfirm && (
                    <div key="back-confirm" className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center">
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}
                            className="bg-zinc-900 border border-zinc-800 p-8 rounded-2xl max-w-md w-full text-center shadow-2xl">
                            <AlertCircle size={48} className="text-amber-500 mx-auto mb-4" />
                            <h3 className="text-xl font-bold text-white mb-2">Unsaved Session?</h3>
                            <p className="text-zinc-400 text-sm mb-8">
                                {isRecording ? "Recording is active." : "You have captured media."} Exiting will return to dashboard.
                            </p>
                            <div className="flex gap-4 justify-center">
                                <button onClick={() => setShowBackConfirm(false)} className="px-6 py-3 rounded-xl bg-zinc-800 text-white font-bold hover:bg-zinc-700">Cancel</button>
                                <button onClick={() => { if (onBack) onBack(); }} className="px-6 py-3 rounded-xl bg-amber-600 text-black font-bold hover:bg-amber-500">Exit</button>
                            </div>
                        </motion.div>
                    </div>
                )}

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
                    <ImageGallery
                        key="gallery"
                        isOpen={isGalleryOpen}
                        images={captures.filter(c => c.type === "image" || !c.type).map(c => ({ id: c.id, filePath: c.url, type: "image", timestamp: c.timestamp } as MediaItem))}
                        initialIndex={galleryInitialIndex}
                        onClose={() => setIsGalleryOpen(false)}
                    />
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
            </AnimatePresence>

            <style jsx global>{`::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: #09090b; } ::-webkit-scrollbar-thumb { background: #27272a; border-radius: 4px; } input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 12px; height: 12px; border-radius: 50%; background: white; cursor: pointer; box-shadow: 0 0 10px rgba(0,0,0,0.5); }`}</style>
        </div>
    );
}
