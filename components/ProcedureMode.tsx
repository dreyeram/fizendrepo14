"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
    Camera,
    X,
    Video,
    Move3d,
    AlertCircle,
    ArrowLeft,
    ZoomIn,
    ZoomOut,
    RotateCcw,
    FileText,
    PlusCircle,
    MinusCircle,
    ChevronDown,
    ChevronUp
} from "lucide-react";
import { saveMediaMetadata, endProcedure, getProcedureMedia, createProcedure } from "@/app/actions/procedure";
import { getPatientHistory } from "@/app/actions/patient";
import { useSettings } from "@/contexts/SettingsContext";
import { useSessionStore } from "@/lib/store/session.store";

import SurgicalCameraStream, { CameraStreamHandle } from "./procedure/SurgicalCameraStream";
import ProcedureToolPanel from "./procedure/ProcedureToolPanel";
import ImageGallery, { MediaItem } from "./gallery/ImageGallery";
import LivePreviewCircle from "./procedure/LivePreviewCircle";
import ZoomMiniMap from "./procedure/ZoomMiniMap";
import SettingsPanel from "./panels/SettingsPanel";
import { getUserProfile } from "@/app/actions/settings";


// ═══════════════════════════════════════════════════════════
//  ProcedureMode v2 — Surgical Endoscopy Interface
// ═══════════════════════════════════════════════════════════

interface Capture {
    id: string;
    timestamp: string;
    url: string;
    type?: 'image' | 'video';
    thumbnailUrl?: string;
    // Extended category to support grouping or allow string
    category?: string;
    segmentIndex?: number; // Added for session tracking
    selected?: boolean;
    deleted?: boolean;
    [key: string]: any;
}

interface Props {
    procedureId: string;
    patient: { name: string; age?: number; gender?: string; id: string;[key: string]: any };
    onBack?: () => void;
    onGenerateReport?: (captures: Capture[]) => void;
}

export default function ProcedureMode({ procedureId, patient, onBack, onGenerateReport }: Props) {
    const { settings } = useSettings() || { settings: {} }; // Safety fallback
    const {
        segments,
        activeSegmentIndex,
        setActiveSegment,
        addSegment,
        updateSegment,
    } = useSessionStore();

    // Deferred Upload Queue
    const [pendingUploads, setPendingUploads] = useState<{
        id: string;      // Capture ID
        tempSegmentId: string; // The temp ID it belongs to
        index?: number;  // The segment index
        type: 'image' | 'video';
        data: string;    // Base64 data OR backend video URL
        timestamp: string;
    }[]>([]);

    // Camera
    const cameraRef = useRef<CameraStreamHandle>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [isCalibrating, setIsCalibrating] = useState(false);
    const [calibrationArea, setCalibrationArea] = useState<{ x: number; y: number; width: number; height: number } | undefined>(undefined);
    const [calibrationShape, setCalibrationShape] = useState<'circle' | 'rectangle'>('rectangle');

    const [resolution, setResolution] = useState<{ w: number; h: number } | undefined>(undefined);
    const [doctorSettings, setDoctorSettings] = useState<{ cameraResolution?: '720p' | '1080p' | '4K'; printQuality?: string }>({});

    // ... (UI State) ...
    // UI State
    // UI State (frameShape is derived from activeProfile, not local state)
    // const [frameShape] removed — use activeProfile?.shape instead
    const [scopeOffset, setScopeOffset] = useState({ x: 0, y: 0 });
    const [scopeScale, setScopeScale] = useState(1); // New state for Circle Size
    const [mainZoom, setMainZoom] = useState(1);
    const [isGrid, setIsGrid] = useState(false);
    const [overlayCircleSize, setOverlayCircleSize] = useState(80); // % of viewport
    const [maskSize, setMaskSize] = useState(100); // % for crop (100 = full circle, 50 = half)
    const [showOverlayCircle, setShowOverlayCircle] = useState(true);

    // Freeze & Compare
    const [frozenFrame, setFrozenFrame] = useState<string | null>(null);
    const [isCompareMode, setIsCompareMode] = useState(false);
    const [comparisonImage, setComparisonImage] = useState<any | null>(null);
    const [compareLeftImage, setCompareLeftImage] = useState<any | null>(null);
    const [panelCollapsed, setPanelCollapsed] = useState(false);
    const [compareZoom, setCompareZoom] = useState(1);
    const [leftCompareZoom, setLeftCompareZoom] = useState(1);
    const [rightCompareZoom, setRightCompareZoom] = useState(1);
    const [compareHistoryTabs, setCompareHistoryTabs] = useState<{ [procedureId: string]: 'image' | 'video' | 'report' }>({});
    const [activePdfUrl, setActivePdfUrl] = useState<string | null>(null);
    const [leftCompareOffset, setLeftCompareOffset] = useState({ x: 0, y: 0 });
    const [rightCompareOffset, setRightCompareOffset] = useState({ x: 0, y: 0 });
    const [previewImage, setPreviewImage] = useState<string | null>(null); // In-canvas image preview
    const [compareSelectTarget, setCompareSelectTarget] = useState<'left' | 'right'>('left'); // Which side gallery click fills
    const [liveZoom, setLiveZoom] = useState(1);
    const isDraggingRef = useRef(false); // To distinguish click from drag

    // Hardware Zoom
    const [hasHardwareZoom] = useState(false);
    const [zoomRange] = useState({ min: 1, max: 12 });

    // Recording & Captures
    const [isRecording, setIsRecording] = useState(false);
    const [captures, setCaptures] = useState<Capture[]>([]);
    const [flashActive, setFlashActive] = useState(false);
    const timerRef = useRef(0);
    const timerDisplayRef = useRef<HTMLSpanElement>(null);
    // ...

    // Dialogs
    const [showEndConfirm, setShowEndConfirm] = useState(false);
    const [showBackConfirm, setShowBackConfirm] = useState(false);
    const [showRecordingWarning, setShowRecordingWarning] = useState(false);
    const [isPlayingVideo, setPlayingVideo] = useState<any | null>(null);

    // Settings & Scope Profile
    const activeProfile = settings.scopeProfiles?.find(p => p.id === settings.activeScopeId) || settings.scopeProfiles?.[0];

    // Gallery
    const [isGalleryOpen, setIsGalleryOpen] = useState(false);
    const [galleryInitialIndex, setGalleryInitialIndex] = useState(0);

    // History
    const [history, setHistory] = useState<any[]>([]);
    const [historyExpanded, setHistoryExpanded] = useState(false);

    const [cameraError, setCameraError] = useState<string | null>(null);
    const [showSettings, setShowSettings] = useState(false);
    const { updateSetting } = useSettings();

    // Voice
    const recognitionRef = useRef<any>(null);
    const recognitionActive = useRef(false);
    const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'error'>('loading');

    // WebSocket URL
    const wsUrl = typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_CAMERA_WS_URL || null) : null;

    // Reset scopeScale to 1.0 when switching scope profiles
    // The auto-fill zoom is computed dynamically in getVideoStyle from captureArea.
    // scopeScale is a manual fine-tune on top (1.0 = no extra zoom).
    useEffect(() => {
        setScopeScale(1);
    }, [activeProfile?.id]);

    // Calibration lifecycle callbacks
    const handleStopCalibration = useCallback(() => {
        setIsCalibrating(false);
    }, []);

    // Stable callback refs for SurgicalCameraStream (prevents re-render on parent state change)
    const handleResolutionChange = useCallback((w: number, h: number) => {
        setResolution({ w, h });
    }, []);

    const handleCalibrationAreaChange = useCallback((area: { x: number; y: number; width: number; height: number }) => {
        setCalibrationArea(area);
    }, []);

    const handleConfirmCalibration = useCallback((profileData: any) => {
        setIsCalibrating(false);
        // Reset scopeScale to 1.0 — the auto-fill zoom is handled by
        // getVideoStyle's baseScale = 1/captureArea.width. No double-zoom.
        setScopeScale(1);
        // Clear calibration area since it's now saved in the profile
        setCalibrationArea(undefined);
    }, []);

    // Draggable constraints for PiP
    const constraintsRef = useRef(null);

    // ═══════════════════════════════════════
    //  Bootstrap & Settings
    // ═══════════════════════════════════════
    // NOTE: Scope shape is now fully derived from activeProfile?.shape
    //       (via SettingsContext). No legacy localStorage needed.

    useEffect(() => {
        let mounted = true;

        async function bootstrapCamera() {
            try {
                // Keep device enumeration for LivePreview PIP if needed
                if (!mounted) return;
                const devs = await navigator.mediaDevices.enumerateDevices();
                const videoDevs = devs.filter(d => d.kind === 'videoinput');
                setDevices(videoDevs);
                if (videoDevs.length > 0) setSelectedDeviceId(prev => prev || videoDevs[0].deviceId);
            } catch (e) { console.error("Camera bootstrap:", e); }
        }

        async function fetchDoctorSettings() {
            try {
                const { getSeededDoctorId } = await import("@/app/actions/auth");
                const docId = await getSeededDoctorId();
                if (!docId) return;
                const res = await getUserProfile(docId);
                if (mounted && res.success && res.user?.contactDetails) {
                    try {
                        const details = JSON.parse(res.user.contactDetails);
                        setDoctorSettings({
                            cameraResolution: details.cameraResolution || '1080p',
                            printQuality: details.printQuality || 'Medium'
                        });
                    } catch (e) { }
                }
            } catch (e) { console.error("Settings fetch:", e); }
        }

        if (patient?.id) {
            getPatientHistory(patient.id).then(res => {
                if (mounted && res.success && res.history) setHistory(res.history);
            }).catch(e => console.error("History fetch error:", e));
        }

        bootstrapCamera();
        fetchDoctorSettings();
        return () => { mounted = false; };
    }, [patient?.id]);

    // Device monitoring
    useEffect(() => {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices) return;
        const h = async () => {
            const devs = await navigator.mediaDevices.enumerateDevices();
            setDevices(devs.filter(d => d.kind === 'videoinput'));
        };
        navigator.mediaDevices.addEventListener('devicechange', h);
        return () => navigator.mediaDevices.removeEventListener('devicechange', h);
    }, []);

    // ═══════════════════════════════════════
    //  Session Sanitizer (Fixes stale temp data — MOUNT ONLY)
    // ═══════════════════════════════════════
    useEffect(() => {
        // Only runs once on mount to clean leftover temp segments from previous sessions.
        // Must NOT run on every `segments` change, otherwise it deletes
        // the temp segment that handleAddSegment just created.
        const currentSegments = useSessionStore.getState().segments;
        const currentActive = useSessionStore.getState().activeSegmentIndex;
        const hasTemp = currentSegments.some(s => s.id.toString().includes('temp-'));

        if (hasTemp) {
            console.warn("Found stale temp segments on mount, sanitizing...");
            const validSegments = currentSegments.filter(s => !s.id.toString().includes('temp-'));

            let nextActive = currentActive;
            const activeWasTemp = currentSegments.find(s => s.index === currentActive && s.id.toString().includes('temp-'));

            if (activeWasTemp) {
                nextActive = validSegments.length > 0 ? validSegments[0].index : 1;
            }

            useSessionStore.setState({
                segments: validSegments,
                activeSegmentIndex: nextActive
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Load previous media for current segment
    // Load previous media for ALL segments in the session
    useEffect(() => {
        if (segments.length === 0) return;

        let mounted = true;
        const fetchAllMedia = async () => {
            try {
                const results = await Promise.all(
                    segments.map(async (seg) => {
                        // Skip temp segments for fetching (they have no DB media yet)
                        if (seg.id.toString().startsWith('temp-')) return [];

                        const res = await getProcedureMedia(seg.id);
                        if (res.success && res.media) {
                            // Tag media with segment index
                            return res.media.map((m: any) => ({
                                ...m,
                                category: `P${seg.index}`,
                                segmentIndex: seg.index
                            }));
                        }
                        return [];
                    })
                );

                if (mounted) {
                    const allMedia = results.flat().sort((a, b) =>
                        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                    );
                    // Merge with pending captures? 
                    // Actually, if we just captured something locally, it is in `captures`.
                    // If we re-fetch, we might overwrite local state (like base64 URLs)?
                    // But `getProcedureMedia` returns URLs.
                    // If we recently captured, `captures` has base64.
                    // If we blindly overwrite, we lose base64 and get file URL (which is good).
                    // BUT safe to only set if `captures` is empty? 
                    // No, user might reload.
                    // We should merge or just set?
                    // "Load previous" usually implies ON MOUNT.
                    // If `segments` changes (Add Segment), we shouldn't re-fetch/overwrite everything?
                    // Maybe.
                    // For now, let's set it. The `pendingUploads` queue handles the "saving" part.
                    // The "viewing" part relies on this.
                    setCaptures(prev => {
                        // If we have local captures that are NOT in DB yet (temp id), keep them?
                        // This is getting complex.
                        // Simple approach: On Mount (or segments change), fetch.
                        // But `handleAddSegment` adds a segment.
                        // We don't want to clear the current view.
                        // Let's rely on merging unique IDs.

                        const incomingIds = new Set(allMedia.map(m => m.id));
                        const localOnly = prev.filter(p => !incomingIds.has(p.id));
                        return [...localOnly, ...allMedia];
                    });
                }
            } catch (e) {
                console.error("Media fetch error:", e);
            }
        };

        fetchAllMedia();
        return () => { mounted = false; };
    }, [segments.length]); // Only re-fetch if number of segments changes (or mount)

    // ── Fetch Patient History ──
    useEffect(() => {
        let mounted = true;
        const fetchHistory = async () => {
            if (!patient?.id) return;
            try {
                const res = await getPatientHistory(patient.id);
                if (mounted && res.success && res.history) {
                    setHistory(res.history);
                }
            } catch (e) {
                console.error("Failed to fetch history:", e);
            }
        };
        fetchHistory();
        return () => { mounted = false; };
    }, [patient?.id]);

    // Timer — ref-based, direct DOM mutation, zero re-renders
    useEffect(() => {
        const iv = setInterval(() => {
            timerRef.current += 1;
            if (timerDisplayRef.current) {
                const s = timerRef.current;
                timerDisplayRef.current.textContent = `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
            }
        }, 1000);
        return () => clearInterval(iv);
    }, []);

    // ═══════════════════════════════════════
    //  Core Functions
    // ═══════════════════════════════════════
    const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

    // Singleton AudioContext — created once, reused forever (avoids GC + browser limits)
    const audioCtxRef = useRef<AudioContext | null>(null);
    const playSound = useCallback((type: 'success' | 'error') => {
        if (!settings.soundEnabled) return;
        if (!audioCtxRef.current) {
            audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === 'suspended') ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        if (type === 'success') { osc.type = 'sine'; osc.frequency.setValueAtTime(800, ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1); }
        else { osc.type = 'sawtooth'; osc.frequency.setValueAtTime(200, ctx.currentTime); }
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        osc.start(); osc.stop(ctx.currentTime + 0.2);
    }, [settings.soundEnabled]);

    // ── Capture (saves what viewer sees, tagged with session) ──
    const handleCapture = useCallback(async (returnDataOnly?: boolean): Promise<string | void> => {
        setFlashActive(true);
        setTimeout(() => setFlashActive(false), 150);

        const capData = await cameraRef.current?.captureFrame();
        if (!capData) return;
        if (returnDataOnly) return capData;

        const capId = Math.random().toString(36).substr(2, 9);
        const activeProcId = `P${activeSegmentIndex}`; // e.g. P1 (index=1), P2 (index=2)

        const newCap: Capture = {
            id: capId,
            timestamp: new Date().toLocaleTimeString(),
            url: capData,
            type: 'image',
            category: activeProcId,
            segmentIndex: activeSegmentIndex,
            procedureId,
        };
        setCaptures(prev => [newCap, ...prev]);

        // If in compare mode and targeting left, update comparison view immediately
        if (isCompareMode) {
            setCompareLeftImage(newCap);
        }

        // 1. Upload image to disk via API
        // 2. Save file path (not base64) to database
        (async () => {
            try {
                // Check if current segment is temporary
                const currentSegment = segments.find(s => s.index === activeSegmentIndex); // Use reliable index
                const currentId = currentSegment?.id || procedureId; // Fallback to prop if not found (should be p1)

                if (!currentId) {
                    console.warn("Capture: No procedure ID available. Skipping sync.");
                    return;
                }

                if (currentId.toString().startsWith('temp-')) {
                    console.log("Segment is temporary, queuing image upload...", currentId);
                    setPendingUploads(prev => [...prev, {
                        id: capId,
                        tempSegmentId: currentId,
                        index: activeSegmentIndex, // Store index to track updates
                        type: 'image',
                        data: capData,
                        timestamp: newCap.timestamp
                    }]);
                } else {
                    // Immediate Upload
                    const uploadRes = await fetch('/api/capture-upload', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            procedureId: currentId,
                            data: capData,
                            type: 'IMAGE'
                        })
                    });

                    if (uploadRes.ok) {
                        const { filePath } = await uploadRes.json();
                        const res = await saveMediaMetadata({
                            procedureId: currentId,
                            type: "IMAGE",
                            filePath: filePath,
                            timestamp: new Date()
                        });
                        if (res.success && res.mediaId) {
                            setCaptures(prev => prev.map(c => c.id === capId ? { ...c, id: res.mediaId! } : c));
                        }
                    } else {
                        console.error("Upload failed:", await uploadRes.text());
                    }
                }
            } catch (err) {
                console.error("Capture save error:", err);
            }
        })();
    }, [procedureId, activeSegmentIndex, segments]);

    // ── Recording ──
    const toggleRecording = useCallback(async () => {
        if (!isRecording) {
            if (cameraRef.current && await cameraRef.current.startRecording()) {
                setIsRecording(true);
            } else {
                console.error("Failed to start recording");
            }
        } else {
            if (cameraRef.current) {
                const videoUrl = await cameraRef.current.stopRecording();
                if (videoUrl) {
                    setIsRecording(false);
                    const id = Math.random().toString(36).substr(2, 9);

                    // Get current segment ID (could be temp or real)
                    const activeProcId = segments.find(s => s.index === activeSegmentIndex)?.id;
                    if (!activeProcId) return;

                    // 1. Optimistic UI Update (use the URL served by the backend or blob locally)
                    const newCap: Capture = {
                        id,
                        timestamp: new Date().toLocaleTimeString(),
                        url: videoUrl,
                        type: 'video',
                        category: `P${activeSegmentIndex}`,
                        segmentIndex: activeSegmentIndex
                    };

                    setCaptures(prev => [newCap, ...prev]);

                    // Generate thumbnail using a video element
                    const v = document.createElement('video');
                    v.src = videoUrl;
                    v.muted = true;
                    v.crossOrigin = "anonymous";
                    v.onloadedmetadata = () => { v.currentTime = 0.5; };
                    v.onseeked = () => {
                        try {
                            const c = document.createElement('canvas');
                            c.width = 320;
                            c.height = 180;
                            c.getContext('2d')?.drawImage(v, 0, 0, c.width, c.height);
                            const thumbUrl = c.toDataURL('image/jpeg', 0.8);
                            setCaptures(prev => prev.map(cap => cap.id === id ? { ...cap, thumbnailUrl: thumbUrl } : cap));
                        } catch (e) {
                            console.warn("Could not generate thumbnail cross-origin:", e);
                        }
                        v.remove();
                    };

                    // Save purely the URL to the DB
                    if (!activeProcId) {
                        console.warn("Recording: No procedure ID available. Skipping sync.");
                        return;
                    }

                    if (activeProcId.toString().startsWith('temp-')) {
                        // Defer saving the link
                        setPendingUploads(prev => [...prev, {
                            id,
                            tempSegmentId: activeProcId.toString(),
                            type: 'video',
                            data: videoUrl,
                            timestamp: newCap.timestamp
                        }]);
                    } else {
                        try {
                            const saveRes = await saveMediaMetadata({
                                procedureId: activeProcId.toString(),
                                type: "VIDEO",
                                filePath: videoUrl, // Link to the Python stream / Next app host route
                                timestamp: new Date()
                            });
                            if (saveRes.success && saveRes.mediaId) {
                                setCaptures(prev => prev.map(cap => cap.id === id ? { ...cap, id: saveRes.mediaId! } : cap));
                            }
                        } catch (e) {
                            console.error("Database error saving video URL:", e);
                        }
                    }
                } else {
                    console.error("Failed to stop recording correctly");
                    setIsRecording(false);
                }
            }
        }
    }, [isRecording, activeSegmentIndex, segments]);



    // ── Freeze ──
    const handleToggleFreeze = useCallback(async () => {
        if (frozenFrame) { setFrozenFrame(null); }
        else {
            const data = await cameraRef.current?.captureFrame();
            if (data) setFrozenFrame(data);
        }
    }, [frozenFrame]);

    // ── Zoom ──
    const handleZoomChange = useCallback((z: number) => {
        setMainZoom(z);
        if (hasHardwareZoom && stream) {
            const track = stream.getVideoTracks()[0];
            (track as any).applyConstraints({ advanced: [{ zoom: Math.min(Math.max(z, zoomRange.min), zoomRange.max) }] }).catch(() => { });
        }
    }, [hasHardwareZoom, stream, zoomRange]);

    // ── Compare Mode Side Effects ──
    useEffect(() => {
        if (isCompareMode) {
            setPanelCollapsed(true);
            setCompareZoom(1);
            setLeftCompareZoom(1);
            setRightCompareZoom(1);
            setLiveZoom(1);
            // Do NOT clear images here, as they might be set by the trigger
        } else {
            setPanelCollapsed(false);
            setCompareZoom(1);
            // Clear images on exit
            setCompareLeftImage(null);
            setComparisonImage(null);
        }
    }, [isCompareMode]);

    // ── Toggle Compare Mode ──
    const handleToggleCompare = useCallback(() => {
        setIsCompareMode(prev => !prev);
    }, []);

    // ── Select Comparison Image ──
    const handleSelectComparisonImage = useCallback((url: string | null, isHistory?: boolean) => {
        if (url) {
            if (isHistory) {
                setComparisonImage(url);
            } else {
                setCompareLeftImage(url);
            }
            setIsCompareMode(true);
            // Effect handles panel/zoom resets
        } else {
            setIsCompareMode(false);
            // Effect handles cleanups
        }
    }, []);

    // ── Switch Camera ──
    const handleSwitchCamera = useCallback(() => {
        if (devices.length < 2) return;
        const currentIndex = devices.findIndex(d => d.deviceId === selectedDeviceId);
        const nextIndex = (currentIndex + 1) % devices.length;
        setSelectedDeviceId(devices[nextIndex].deviceId);
    }, [devices, selectedDeviceId]);

    // ── Image Preview (in-canvas instead of gallery) ──
    const handleOpenGallery = useCallback((cap: Capture) => {
        // Show image directly in the main feed area
        setPreviewImage(cap.url);
    }, []);

    // ── Segment ──
    const handleAddSegment = useCallback(async () => {
        try {
            const { getSeededDoctorId } = await import("@/app/actions/auth");
            const docId = await getSeededDoctorId();
            if (!docId) {
                console.error('No doctor ID found');
                return;
            }

            // 1. Optimistic Add
            const newIndex = segments.length + 1;
            const tempId = `temp-${Date.now()}`;

            addSegment({
                id: tempId,
                index: newIndex,
                status: 'draft',
                createdAt: new Date(),
                type: 'generic'
            });
            // Note: addSegment sets activeSegmentIndex automatically in store

            // 2. Background Create
            createProcedure({ patientId: patient.id, doctorId: docId, type: 'generic' })
                .then(res => {
                    if (res.success && res.procedureId) {
                        console.log(`Procedure created: ${res.procedureId}, replacing ${tempId}`);
                        updateSegment(newIndex, { id: res.procedureId });
                    } else {
                        console.error('Failed to create procedure in background:', res.error);
                        // TODO: Handle failure (mark segment as error?)
                    }
                })
                .catch(err => console.error("Create procedure error:", err));

        } catch (err) {
            console.error('Failed to create segment:', err);
        }
    }, [segments, patient.id, addSegment, updateSegment]);

    // ── Deferred Upload Processor ──
    useEffect(() => {
        if (pendingUploads.length === 0) return;

        const processQueue = async () => {
            const remaining: typeof pendingUploads = [];

            for (const item of pendingUploads) {
                // Find if the temp segment has a real ID now via index mapping
                const realSegment = segments.find(s => s.index === item.index);
                if (realSegment && !realSegment.id.toString().startsWith('temp-')) {
                    console.log(`Processing deferred upload for newly created segment: ${realSegment.id}`);

                    try {
                        if (item.type === 'video') {
                            // It's a pure backend URL, simply save the metadata
                            const saveRes = await saveMediaMetadata({
                                procedureId: realSegment.id.toString(),
                                type: "VIDEO",
                                filePath: item.data, // This is the URL from the backend
                                timestamp: new Date(item.timestamp)
                            });
                            if (saveRes.success && saveRes.mediaId) {
                                setCaptures(prev => prev.map(cap => cap.id === item.id ? { ...cap, id: saveRes.mediaId! } : cap));
                            }
                        } else {
                            // It's a base64 image, needs physical upload
                            const uploadRes = await fetch('/api/capture-upload', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    procedureId: realSegment.id.toString(),
                                    data: item.data,
                                    type: 'IMAGE'
                                })
                            });

                            if (uploadRes.ok) {
                                const { filePath } = await uploadRes.json();
                                const saveRes = await saveMediaMetadata({
                                    procedureId: realSegment.id.toString(),
                                    type: "IMAGE",
                                    filePath: filePath,
                                    timestamp: new Date(item.timestamp)
                                });
                                if (saveRes.success && saveRes.mediaId) {
                                    setCaptures(prev => prev.map(cap => cap.id === item.id ? { ...cap, id: saveRes.mediaId! } : cap));
                                }
                            }
                        }
                    } catch (e) {
                        console.error("Failed to process deferred upload:", e);
                        remaining.push(item);
                    }
                } else {
                    // Still waiting for real ID
                    remaining.push(item);
                }
            }
            if (remaining.length !== pendingUploads.length) {
                setPendingUploads(remaining);
            }
        };

        processQueue();
    }, [pendingUploads, segments]);

    // ── Back ──
    const handleBack = useCallback(() => {
        if (isCompareMode) {
            setIsCompareMode(false);
            setComparisonImage(null);
            setCompareLeftImage(null);
            setPanelCollapsed(false);
            setLeftCompareZoom(1);
            setRightCompareZoom(1);
            setLeftCompareOffset({ x: 0, y: 0 });
            setRightCompareOffset({ x: 0, y: 0 });
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

    // ── Finish Logic ──
    const performFinish = async () => {
        // Transition IMMEDIATELY — don't block on upload polling or DB calls
        if (onGenerateReport) onGenerateReport(captures);

        // Fire background cleanup (non-blocking)
        (async () => {
            // Wait for any pending uploads (background, max 5s)
            if (pendingUploads.length > 0) {
                let retries = 0;
                while (pendingUploads.length > 0 && retries < 10) {
                    await new Promise(r => setTimeout(r, 500));
                    retries++;
                }
            }
            try { await endProcedure(procedureId); } catch (e) {
                console.error('Background endProcedure failed:', e);
            }
        })();
    };



    // ═══════════════════════════════════════
    //  Keyboard & Voice
    // ═══════════════════════════════════════
    const captureRef = useRef(handleCapture);
    const toggleRecRef = useRef(toggleRecording);
    const freezeRef = useRef(handleToggleFreeze);
    // Refs for dialog state — allows keyboard effect to read current values without re-subscribing
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
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) { setModelStatus('error'); }
        else {
            const rec = new SR();
            rec.continuous = true; rec.interimResults = false; rec.lang = 'en-US';
            recognitionRef.current = rec;
            rec.onstart = () => { setModelStatus('ready'); recognitionActive.current = true; };
            rec.onresult = (e: any) => {
                const t = e.results[e.results.length - 1][0].transcript.toLowerCase().trim();
                if (t.includes("capture")) captureRef.current();
                if (t.includes("freeze")) freezeRef.current();
                if (t.includes("record")) toggleRecRef.current();
            };
            rec.onerror = (e: any) => { if (e.error === 'not-allowed' || e.error === 'network') setModelStatus('error'); };
            rec.onend = () => { if (recognitionActive.current) { try { rec.start(); } catch { } } };
            try { rec.start(); } catch { }
        }

        const handleKey = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            switch (e.key.toLowerCase()) {
                case ' ': case 'enter': e.preventDefault(); captureRef.current(); break;
                case 'r': e.preventDefault(); toggleRecRef.current(); break;
                case 'f': e.preventDefault(); freezeRef.current(); break;
                case 'c': e.preventDefault(); setIsCompareMode(p => { const n = !p; if (n) setPanelCollapsed(true); else { setComparisonImage(null); setPanelCollapsed(false); } return n; }); break;
                case 'g': e.preventDefault(); setIsGrid(p => !p); break;
                case 'm': {
                    // Cycle through scope profiles
                    e.preventDefault();
                    const profiles = settings.scopeProfiles || [];
                    if (profiles.length > 1) {
                        const currentIdx = profiles.findIndex((p: any) => p.id === settings.activeScopeId);
                        const nextIdx = (currentIdx + 1) % profiles.length;
                        updateSetting('activeScopeId', profiles[nextIdx].id);
                    }
                    break;
                }
                case '=': case '+': e.preventDefault(); setMainZoom(p => Math.min(p + 0.5, 12)); break;
                case '-': e.preventDefault(); setMainZoom(p => Math.max(p - 0.5, 1)); break;
                case 'z': e.preventDefault(); setMainZoom(1); break;
                case 'escape':
                    e.preventDefault();
                    if (showEndConfirmRef.current) setShowEndConfirm(false);
                    else if (showBackConfirmRef.current) setShowBackConfirm(false);
                    else if (isGalleryOpenRef.current) setIsGalleryOpen(false);
                    else if (frozenFrameRef.current) setFrozenFrame(null);
                    break;
                case 'e': if (e.ctrlKey || e.metaKey) { e.preventDefault(); setShowEndConfirm(true); } break;
            }
        };

        const handleContext = (e: MouseEvent) => { e.preventDefault(); captureRef.current(); };
        window.addEventListener("keydown", handleKey);
        window.addEventListener("contextmenu", handleContext);

        return () => {
            recognitionActive.current = false;
            try { recognitionRef.current?.stop(); } catch { }
            window.removeEventListener("keydown", handleKey);
            window.removeEventListener("contextmenu", handleContext);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ═══════════════════════════════════════
    //  RENDER
    // ═══════════════════════════════════════
    return (
        <div className="flex h-screen w-full bg-black text-white font-sans overflow-hidden select-none">

            {/* ═══ LEFT: VIDEO FEED ═══ */}
            <main
                ref={constraintsRef}
                className={`${isCompareMode ? 'w-full' : 'w-[75%]'} relative flex flex-col min-w-0 cursor-default overflow-hidden shrink-0 transition-all duration-300 bg-black`}
                onClick={() => {
                    if (historyExpanded) setHistoryExpanded(false);
                }}
            >
                <div className="flex-1 relative bg-black overflow-hidden">
                    {isCompareMode ? (
                        <div className="w-full h-full flex flex-col overflow-hidden bg-black relative">
                            {/* Global Exit Compare Button - Top Right */}
                            <button
                                onClick={(e) => { e.stopPropagation(); setIsCompareMode(false); setComparisonImage(null); setCompareLeftImage(null); setPanelCollapsed(false); setCompareZoom(1); setLeftCompareZoom(1); setRightCompareZoom(1); }}
                                className="absolute top-4 right-4 z-[80] w-9 h-9 rounded-full bg-red-950/80 hover:bg-red-600/40 flex items-center justify-center text-red-100 transition-all border border-red-500/30 shadow-lg"
                                title="Exit Compare Mode"
                            >
                                <X size={18} />
                            </button>

                            {/* Main Compare Area — Image vs Image */}
                            <div className="flex-1 flex overflow-hidden min-h-0 bg-zinc-950 p-3 pb-0 pt-2 gap-4">
                                {/* LEFT: Current Session / Live Feed */}
                                <div
                                    ref={constraintsRef}
                                    className="flex-1 relative bg-black/40 rounded-3xl flex items-center justify-center border-2 transition-all overflow-hidden group/left border-white/5 shadow-[0_0_50px_rgba(16,185,129,0.05)]"
                                >
                                    {compareLeftImage ? (
                                        <>
                                            <div className="w-full h-full relative flex items-center justify-center overflow-hidden ">
                                                {compareLeftImage?.type === 'video' ? (
                                                    <video
                                                        src={compareLeftImage?.url}
                                                        controls
                                                        muted
                                                        autoPlay
                                                        loop
                                                        className="max-w-full max-h-full object-contain"
                                                    />
                                                ) : compareLeftImage?.type === 'report' ? (
                                                    <iframe
                                                        src={compareLeftImage?.url}
                                                        className="w-full h-full border-0 bg-white"
                                                        title="PDF Report Viewer"
                                                    />
                                                ) : (
                                                    <motion.img
                                                        drag={leftCompareZoom > 1}
                                                        dragMomentum={false}
                                                        dragElastic={0}
                                                        onDrag={(e, info) => {
                                                            setLeftCompareOffset(prev => ({
                                                                x: prev.x + info.delta.x,
                                                                y: prev.y + info.delta.y
                                                            }));
                                                        }}
                                                        src={compareLeftImage?.url || compareLeftImage}
                                                        className={`max-w-full max-h-full object-contain cursor-${leftCompareZoom > 1 ? 'grab active:cursor-grabbing' : 'pointer'}`}
                                                        style={{ scale: leftCompareZoom }}
                                                        animate={{ x: leftCompareOffset.x, y: leftCompareOffset.y }}
                                                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                                        alt="Left"
                                                    />
                                                )}
                                            </div>
                                            <div className="absolute top-4 left-4 px-4 py-2 rounded-full bg-emerald-950/80 border border-emerald-500/30 z-20 flex items-center gap-2">
                                                {compareLeftImage?.type === 'video' ? <Video size={12} className="text-emerald-400" /> : compareLeftImage?.type === 'report' ? <FileText size={12} className="text-emerald-400" /> : null}
                                                <span className="text-[11px] font-black text-emerald-100 uppercase tracking-widest">Image A {compareLeftImage?.type !== 'image' && `(${compareLeftImage?.type})`}</span>
                                            </div>

                                            {/* Bottom-Right Overlay Cluster (Zoom Slider + MiniMap) */}
                                            <div className="absolute bottom-2 right-2 flex flex-col items-end gap-1.5 z-30 scale-[0.7] origin-bottom-right">
                                                {/* Minimap */}
                                                <ZoomMiniMap
                                                    imageUrl={compareLeftImage}
                                                    zoom={leftCompareZoom}
                                                    offset={leftCompareOffset}
                                                />

                                                {/* Zoom controls only for images */}
                                                {compareLeftImage?.type === 'image' && (
                                                    <div className="absolute bottom-2 right-2 flex flex-col items-end gap-1.5 z-30 scale-[0.7] origin-bottom-right">
                                                        {/* Minimap */}
                                                        <ZoomMiniMap
                                                            imageUrl={compareLeftImage?.url || compareLeftImage}
                                                            zoom={leftCompareZoom}
                                                            offset={leftCompareOffset}
                                                        />

                                                        {/* Scope-Scale Style Zoom Slider */}
                                                        <div className="w-56 p-4 rounded-3xl bg-black/60 backdrop-blur-xl border border-white/10 shadow-2xl">
                                                            <div className="flex items-center justify-between mb-3 text-white/50">
                                                                <span className="text-[9px] font-black uppercase tracking-[0.2em]">Zoom Level</span>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-[10px] font-mono font-bold text-emerald-400">{leftCompareZoom.toFixed(1)}x</span>
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); setLeftCompareZoom(1); setLeftCompareOffset({ x: 0, y: 0 }); }}
                                                                        className="w-6 h-6 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center"
                                                                    >
                                                                        <RotateCcw size={10} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-3">
                                                                <ZoomOut size={12} />
                                                                <div className="flex-1 relative h-4 flex items-center">
                                                                    <div className="absolute inset-0 h-1 bg-white/10 rounded-full my-auto" />
                                                                    <input
                                                                        type="range"
                                                                        min={1}
                                                                        max={10}
                                                                        step={0.1}
                                                                        value={leftCompareZoom}
                                                                        onChange={(e) => { e.stopPropagation(); setLeftCompareZoom(parseFloat(e.target.value)); }}
                                                                        className="absolute inset-0 w-full opacity-0 cursor-pointer z-10"
                                                                    />
                                                                    <div
                                                                        className="h-1 bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                                                                        style={{ width: `${((leftCompareZoom - 1) / 9) * 100}%` }}
                                                                    />
                                                                    <div
                                                                        className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white shadow-xl ring-2 ring-emerald-500/20"
                                                                        style={{ left: `${((leftCompareZoom - 1) / 9) * 100}%`, transform: 'translate(-50%, -50%)' }}
                                                                    />
                                                                </div>
                                                                <ZoomIn size={12} />
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    ) : (
                                        <div className="w-full h-full relative overflow-hidden rounded-3xl">
                                            <SurgicalCameraStream
                                                ref={cameraRef}
                                                wsUrl={wsUrl || undefined}
                                                deviceId={!wsUrl ? selectedDeviceId : undefined}
                                                resolution={doctorSettings.cameraResolution}
                                                hardwareZoom={hasHardwareZoom}
                                                captureArea={calibrationArea || activeProfile?.captureArea}
                                                scopeScale={scopeScale}
                                                zoom={scopeScale}
                                                showGrid={isGrid}
                                                activeShape={isCalibrating ? calibrationShape : (activeProfile?.shape || 'rectangle')}
                                                isCalibrating={isCalibrating}
                                                aspectRatioCorrection={settings.aspectRatio}
                                                onResolutionChange={handleResolutionChange}
                                                onCalibrationChange={handleCalibrationAreaChange}
                                            />
                                            {/* Label for Live Feed */}
                                            <div className="absolute top-4 left-4 px-4 py-2 rounded-full bg-emerald-600/20 border border-emerald-500/30 backdrop-blur-md z-20 flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]" />
                                                <span className="text-[11px] font-black text-emerald-100 uppercase tracking-widest">Live Feed (A)</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Small Live Preview over image A (PiP) - Only when image A is selected */}
                                    <AnimatePresence>
                                        {isCompareMode && compareLeftImage && (
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
                                                className="absolute top-4 right-4 z-[60] w-24 h-24 rounded-full border-2 border-white/20 shadow-2xl overflow-hidden bg-black ring-4 ring-black/50 cursor-grab active:cursor-grabbing hover:border-emerald-500/50 transition-colors"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (!isDraggingRef.current) {
                                                        setCompareLeftImage(null); // Return to full live feed
                                                    }
                                                }}
                                                title="Return to Full Live Feed"
                                            >
                                                <LivePreviewCircle deviceId={selectedDeviceId} className="w-full h-full" captureArea={calibrationArea || activeProfile?.captureArea} aspectRatioCorrection={settings.aspectRatio} />
                                                <div className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/30 transition-colors group">
                                                    <span className="text-[6px] font-black text-white uppercase tracking-tighter opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">Full Feed</span>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                </div>

                                {/* RIGHT: Medical History */}
                                <div
                                    className="flex-1 relative bg-black/40 rounded-3xl flex items-center justify-center border-2 transition-all overflow-hidden group/right border-white/5 hover:border-blue-500/20 shadow-[0_0_50px_rgba(59,130,246,0.05)]"
                                >
                                    {comparisonImage ? (
                                        <>
                                            <div className="w-full h-full relative flex items-center justify-center overflow-hidden ">
                                                {comparisonImage?.type === 'video' ? (
                                                    <video
                                                        src={comparisonImage?.url}
                                                        controls
                                                        muted
                                                        autoPlay
                                                        loop
                                                        className="max-w-full max-h-full object-contain"
                                                    />
                                                ) : comparisonImage?.type === 'report' ? (
                                                    <iframe
                                                        src={comparisonImage?.url}
                                                        className="w-full h-full border-0 bg-white"
                                                        title="History PDF Report Viewer"
                                                    />
                                                ) : (
                                                    <motion.img
                                                        drag={rightCompareZoom > 1}
                                                        dragMomentum={false}
                                                        dragElastic={0}
                                                        onDrag={(e, info) => {
                                                            setRightCompareOffset(prev => ({
                                                                x: prev.x + info.delta.x,
                                                                y: prev.y + info.delta.y
                                                            }));
                                                        }}
                                                        src={comparisonImage?.url || comparisonImage}
                                                        className={`max-w-full max-h-full object-contain cursor-${rightCompareZoom > 1 ? 'grab active:cursor-grabbing' : 'pointer'}`}
                                                        style={{ scale: rightCompareZoom }}
                                                        animate={{ x: rightCompareOffset.x, y: rightCompareOffset.y }}
                                                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                                        alt="Right"
                                                    />
                                                )}

                                                {/* History Date Overlay */}
                                                {comparisonImage?.type === 'image' && (
                                                    <div className="absolute bottom-4 left-4 px-4 py-2 rounded-xl bg-black/60 border border-white/10 backdrop-blur-md z-20">
                                                        <span className="text-[11px] font-black text-white/50 uppercase tracking-[0.2em] tabular-nums">
                                                            {history.find(p => (p.media || []).some((m: any) => m.url === comparisonImage?.url))?.date || "History"}
                                                        </span>
                                                    </div>
                                                )}
                                                <div className="absolute top-4 left-4 px-4 py-2 rounded-full bg-blue-600/20 border border-blue-500/30 backdrop-blur-md z-20 flex items-center gap-2">
                                                    {comparisonImage?.type === 'video' ? <Video size={12} className="text-blue-400" /> : comparisonImage?.type === 'report' ? <FileText size={12} className="text-blue-400" /> : null}
                                                    <span className="text-[11px] font-black text-blue-100 uppercase tracking-widest">Image B {comparisonImage?.type !== 'image' && `(${comparisonImage?.type})`}</span>
                                                </div>

                                                {/* Bottom-Right Overlay Cluster (Zoom Slider + MiniMap) */}
                                                {comparisonImage?.type === 'image' && (
                                                    <div className="absolute bottom-2 right-2 flex flex-col items-end gap-1.5 z-30 scale-[0.7] origin-bottom-right">
                                                        {/* Minimap */}
                                                        <ZoomMiniMap
                                                            imageUrl={comparisonImage?.url || comparisonImage}
                                                            zoom={rightCompareZoom}
                                                            offset={rightCompareOffset}
                                                        />

                                                        {/* Scope-Scale Style Zoom Slider */}
                                                        <div className="w-56 p-4 rounded-3xl bg-black/60 backdrop-blur-xl border border-white/10 shadow-2xl">
                                                            <div className="flex items-center justify-between mb-3 text-white/50">
                                                                <span className="text-[9px] font-black uppercase tracking-[0.2em]">Zoom Level</span>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-[10px] font-mono font-bold text-blue-400">{rightCompareZoom.toFixed(1)}x</span>
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); setRightCompareZoom(1); setRightCompareOffset({ x: 0, y: 0 }); }}
                                                                        className="w-6 h-6 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center"
                                                                    >
                                                                        <RotateCcw size={10} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-3">
                                                                <ZoomOut size={12} />
                                                                <div className="flex-1 relative h-4 flex items-center">
                                                                    <div className="absolute inset-0 h-1 bg-white/10 rounded-full my-auto" />
                                                                    <input
                                                                        type="range"
                                                                        min={1}
                                                                        max={10}
                                                                        step={0.1}
                                                                        value={rightCompareZoom}
                                                                        onChange={(e) => { e.stopPropagation(); setRightCompareZoom(parseFloat(e.target.value)); }}
                                                                        className="absolute inset-0 w-full opacity-0 cursor-pointer z-10"
                                                                    />
                                                                    <div
                                                                        className="h-1 bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                                                                        style={{ width: `${((rightCompareZoom - 1) / 9) * 100}%` }}
                                                                    />
                                                                    <div
                                                                        className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white shadow-xl ring-2 ring-blue-500/20"
                                                                        style={{ left: `${((rightCompareZoom - 1) / 9) * 100}%`, transform: 'translate(-50%, -50%)' }}
                                                                    />
                                                                </div>
                                                                <ZoomIn size={12} />
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center p-8 text-center">
                                            <div className="w-14 h-14 rounded-full bg-blue-500/10 flex items-center justify-center mb-3 border border-blue-500/20">
                                                <Camera size={24} className="text-blue-600" />
                                            </div>
                                            <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Image B</h4>
                                            <p className="text-[10px] text-zinc-600">Select from gallery below</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                            {/* Bottom Gallery Strip — Split into Session vs History */}
                            <div className="shrink-0 bg-zinc-950 border-t border-white/10 h-[180px] flex overflow-hidden">
                                {/* LEFT COLUMN: Current Session */}
                                <div className="flex-1 flex overflow-hidden border-r border-white/5 p-4 bg-zinc-950/50">
                                    <div className="flex flex-col gap-1.5 w-full overflow-hidden">
                                        <div className="flex items-center gap-2 px-1">
                                            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                                            <span className="text-[11px] font-black text-zinc-400 uppercase tracking-[0.2em]">Current Session</span>
                                        </div>
                                        <div className="flex-1 flex gap-6 overflow-x-auto no-scrollbar px-1 min-w-0">
                                            {/* Group by Session (Segment Index) */}
                                            {Array.from(new Set(captures.map(c => c.segmentIndex || 1))).sort((a, b) => a - b).map(idx => {
                                                const sessionCaptures = captures.filter(c => c.segmentIndex === idx);
                                                if (sessionCaptures.length === 0) return null;
                                                return (
                                                    <div key={idx} className="flex flex-col gap-2 shrink-0">
                                                        <div className="flex items-center justify-between border-b border-white/5 pb-1 mb-1">
                                                            <span className="text-[9px] font-black text-emerald-500/80 uppercase tracking-widest">P{idx}</span>
                                                            <span className="text-[9px] font-bold text-zinc-600 tabular-nums">{sessionCaptures.length}</span>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            {sessionCaptures.map((cap, i) => {
                                                                const isLeftSelected = compareLeftImage?.url === cap.url || compareLeftImage === cap.url;
                                                                const isRightSelected = comparisonImage?.url === cap.url || comparisonImage === cap.url;
                                                                return (
                                                                    <div
                                                                        key={cap.id || i}
                                                                        onClick={() => {
                                                                            setCompareLeftImage(cap);
                                                                        }}
                                                                        className={`w-20 h-20 shrink-0 rounded-2xl overflow-hidden cursor-pointer border-2 transition-all hover:scale-105 active:scale-95 shadow-xl relative group ${isLeftSelected ? 'border-emerald-500 ring-4 ring-emerald-500/20'
                                                                            : isRightSelected ? 'border-blue-500 ring-4 ring-blue-500/20'
                                                                                : 'border-white/10 hover:border-white/30'
                                                                            }`}
                                                                    >
                                                                        {cap.type === 'image' || !cap.type ? (
                                                                            <img src={cap.url} className="w-full h-full object-cover" alt="" />
                                                                        ) : cap.type === 'video' ? (
                                                                            <div className="w-full h-full bg-zinc-900 flex items-center justify-center relative">
                                                                                <video
                                                                                    src={`${cap.url}#t=0.5`}
                                                                                    className="w-full h-full object-cover opacity-60"
                                                                                    muted
                                                                                    playsInline
                                                                                />
                                                                                <Video size={18} className="text-emerald-500 absolute z-10" />
                                                                                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors" />
                                                                            </div>
                                                                        ) : (
                                                                            <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                                                                                <FileText size={24} className="text-emerald-500/50" />
                                                                            </div>
                                                                        )}
                                                                        {cap.type && cap.type !== 'image' && (
                                                                            <div className="absolute bottom-1 right-1 px-1 rounded bg-black/60 text-[6px] font-bold text-white uppercase">{cap.type}</div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {captures.length === 0 && (
                                                <div className="flex items-center justify-center w-full h-full opacity-30 italic text-[10px]">No media</div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* RIGHT COLUMN: History */}
                                <div className="flex-1 flex overflow-hidden p-4 bg-black/40">
                                    <div className="flex flex-col gap-1.5 w-full overflow-hidden">
                                        <div className="flex items-center gap-2 px-1">
                                            <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
                                            <span className="text-[11px] font-black text-zinc-400 uppercase tracking-[0.2em]">Medical History</span>
                                        </div>
                                        <div className="flex-1 flex gap-8 overflow-x-auto no-scrollbar px-1 min-w-0">
                                            {history.length > 0 ? history.map((proc, pIdx) => {
                                                const activeTab = compareHistoryTabs[proc.id] || (proc.media?.some((m: any) => m.type === 'image') ? 'image' : proc.media?.some((m: any) => m.type === 'video') ? 'video' : 'report');
                                                const filteredMedia = (proc.media || []).filter((m: any) => m.type === activeTab);
                                                const hasImages = (proc.media || []).some((m: any) => m.type === 'image');
                                                const hasVideos = (proc.media || []).some((m: any) => m.type === 'video');
                                                const hasReports = (proc.media || []).some((m: any) => m.type === 'report');

                                                return (
                                                    <div key={pIdx} className="flex flex-col gap-2 shrink-0">
                                                        <div className="flex flex-col border-b border-white/5 pb-1 mb-1 min-w-[120px]">
                                                            <div className="flex items-center justify-between gap-4 mb-1.5">
                                                                <span className="text-[9px] font-black text-blue-500/80 uppercase tracking-widest whitespace-nowrap">{proc.date || "Past Session"}</span>
                                                                <span className="text-[9px] font-bold text-zinc-600 tabular-nums">{(proc.media || []).length}</span>
                                                            </div>
                                                            {/* Mini Tabs for Compare Mode Strip */}
                                                            <div className="flex bg-white/5 rounded-md p-0.5 border border-white/5">
                                                                {hasImages && (
                                                                    <button
                                                                        onClick={() => setCompareHistoryTabs(prev => ({ ...prev, [proc.id]: 'image' }))}
                                                                        className={`flex-1 py-0.5 px-2 rounded-sm text-[7px] font-black uppercase tracking-tighter transition-all ${activeTab === 'image' ? "bg-white text-black shadow-inner" : "text-zinc-500 hover:text-zinc-300"}`}
                                                                    >
                                                                        IMG
                                                                    </button>
                                                                )}
                                                                {hasVideos && (
                                                                    <button
                                                                        onClick={() => setCompareHistoryTabs(prev => ({ ...prev, [proc.id]: 'video' }))}
                                                                        className={`flex-1 py-0.5 px-2 rounded-sm text-[7px] font-black uppercase tracking-tighter transition-all ${activeTab === 'video' ? "bg-white text-black shadow-inner" : "text-zinc-500 hover:text-zinc-300"}`}
                                                                    >
                                                                        VID
                                                                    </button>
                                                                )}
                                                                {hasReports && (
                                                                    <button
                                                                        onClick={() => setCompareHistoryTabs(prev => ({ ...prev, [proc.id]: 'report' }))}
                                                                        className={`flex-1 py-0.5 px-2 rounded-sm text-[7px] font-black uppercase tracking-tighter transition-all ${activeTab === 'report' ? "bg-white text-black shadow-inner" : "text-zinc-500 hover:text-zinc-300"}`}
                                                                    >
                                                                        REP
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            {filteredMedia.length > 0 ? filteredMedia.map((m: any) => {
                                                                const isLeftSelected = compareLeftImage?.url === m.url || compareLeftImage === m.url;
                                                                const isRightSelected = comparisonImage?.url === m.url || comparisonImage === m.url;
                                                                return (
                                                                    <div
                                                                        key={m.id}
                                                                        onClick={() => {
                                                                            setComparisonImage(m);
                                                                        }}
                                                                        className={`w-20 h-20 shrink-0 rounded-2xl overflow-hidden cursor-pointer border-2 transition-all hover:scale-105 active:scale-95 shadow-xl relative group ${isLeftSelected ? 'border-emerald-500 ring-4 ring-emerald-500/20'
                                                                            : isRightSelected ? 'border-blue-500 ring-4 ring-blue-500/20'
                                                                                : 'border-white/10 hover:border-white/30'
                                                                            }`}
                                                                    >
                                                                        {m.type === 'image' || !m.type ? (
                                                                            <img src={m.url} className="w-full h-full object-cover" alt="" />
                                                                        ) : m.type === 'video' ? (
                                                                            <div className="w-full h-full bg-zinc-900 flex items-center justify-center relative">
                                                                                <video
                                                                                    src={`${m.url}#t=0.5`}
                                                                                    className="w-full h-full object-cover opacity-60"
                                                                                    muted
                                                                                    playsInline
                                                                                />
                                                                                <Video size={18} className="text-blue-500 absolute z-10" />
                                                                                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors" />
                                                                            </div>
                                                                        ) : (
                                                                            <div className="w-full h-full bg-zinc-900 flex items-center justify-center p-2 flex-col gap-1 cursor-pointer hover:bg-zinc-800 transition-colors" onClick={(e) => { e.stopPropagation(); setActivePdfUrl(m.url); }} >
                                                                                <FileText size={20} className="text-red-500/70" />
                                                                                <span className="text-[6px] font-black text-white/40 uppercase tracking-tighter text-center line-clamp-2">{m.title || 'PDF Report'}</span><span className='text-[5px] text-zinc-600 font-bold uppercase tracking-widest'>View PDF</span>
                                                                            </div>
                                                                        )}
                                                                        {m.type && m.type !== 'image' && (
                                                                            <div className="absolute bottom-1 right-1 px-1 rounded bg-black/60 text-[6px] font-bold text-white uppercase">{m.type}</div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            }) : (
                                                                <div className="w-20 h-20 flex items-center justify-center opacity-20 border border-dashed border-white/20 rounded-2xl">
                                                                    <AlertCircle size={16} />
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            }) : (
                                                <div className="flex items-center justify-center w-full h-full opacity-30 italic text-[11px]">No history records</div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* PDF Viewer Modal Overlay (Compare Mode) */}
                                <AnimatePresence>
                                    {activePdfUrl && (
                                        <div
                                            className="fixed inset-0 z-[1000] bg-black/95 backdrop-blur-2xl flex items-center justify-center p-4 md:p-8"
                                            onClick={() => setActivePdfUrl(null)}
                                        >
                                            <motion.div
                                                initial={{ scale: 0.9, opacity: 0, y: 30 }}
                                                animate={{ scale: 1, opacity: 1, y: 0 }}
                                                exit={{ scale: 0.9, opacity: 0, y: 30 }}
                                                onClick={(e) => e.stopPropagation()}
                                                className="relative w-full h-full max-w-5xl bg-[#121214] rounded-[32px] border border-white/10 overflow-hidden shadow-[0_32px_128px_rgba(0,0,0,0.8)] flex flex-col"
                                            >
                                                {/* Header */}
                                                <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02] z-20">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-xl bg-red-500/10 flex items-center justify-center">
                                                            <FileText size={16} className="text-red-500" />
                                                        </div>
                                                        <span className="text-xs font-black uppercase tracking-widest text-white">Medical Report Viewer</span>
                                                    </div>

                                                    <button
                                                        onClick={() => setActivePdfUrl(null)}
                                                        className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-red-500 transition-all"
                                                    >
                                                        <X size={20} />
                                                    </button>
                                                </div>

                                                {/* PDF Content Workspace - Standard Full-Height View */}
                                                <div className="flex-1 relative w-full bg-[#09090b] overflow-hidden">
                                                    <iframe
                                                        src={`${activePdfUrl}#view=FitH&toolbar=0&navpanes=0&scrollbar=0`}
                                                        className="w-full h-full border-0"
                                                        title="PDF Report"
                                                    />
                                                </div>
                                            </motion.div>
                                        </div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    ) : previewImage ? (
                        /* In-canvas image preview */
                        <div className="w-full h-full relative flex items-center justify-center bg-black/80 backdrop-blur-md">
                            <img src={previewImage} className="max-w-full max-h-full object-contain" alt="Captured" />
                            <button
                                onClick={() => setPreviewImage(null)}
                                className="absolute top-4 right-4 z-[80] w-12 h-12 rounded-full bg-black/80 hover:bg-red-600 flex items-center justify-center text-white/70 hover:text-white transition-all border border-white/20 shadow-2xl"
                                title="Close Preview"
                            >
                                <X size={24} />
                            </button>
                            <div className="absolute top-4 left-4 px-4 py-2 rounded-full bg-indigo-600/20 border border-indigo-500/30 backdrop-blur-md z-20">
                                <span className="text-[11px] font-black text-indigo-100 uppercase tracking-widest">Image Preview</span>
                            </div>
                        </div>
                    ) : (
                        <div className="w-full h-full absolute inset-0">
                            <SurgicalCameraStream
                                ref={cameraRef}
                                wsUrl={wsUrl || undefined}
                                deviceId={!wsUrl ? selectedDeviceId : undefined}
                                resolution={doctorSettings.cameraResolution}
                                hardwareZoom={hasHardwareZoom}
                                // Pass Active Scope Profile Settings (staged calibration values take precedence)

                                captureArea={calibrationArea || activeProfile?.captureArea}
                                scopeScale={scopeScale}
                                zoom={scopeScale}
                                showGrid={isGrid}
                                frozenFrame={frozenFrame}
                                showLivePip={!!frozenFrame}
                                isCalibrating={isCalibrating}
                                activeShape={isCalibrating ? calibrationShape : (activeProfile?.shape || 'rectangle')}
                                onResolutionChange={handleResolutionChange}
                                onCalibrationChange={handleCalibrationAreaChange}
                                aspectRatioCorrection={settings.aspectRatio} />
                        </div>
                    )}

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
                                    if (!isDraggingRef.current) {
                                        setFrozenFrame(null);
                                    }
                                }}
                                className="absolute bottom-6 right-6 z-[60] w-44 h-44 rounded-full border-2 border-white/20 shadow-2xl overflow-hidden bg-black ring-4 ring-black/50 cursor-grab active:cursor-grabbing hover:border-blue-500/50 transition-all group"
                                title="Return to Live Feed"
                            >
                                <LivePreviewCircle deviceId={selectedDeviceId} className="w-full h-full" captureArea={calibrationArea || activeProfile?.captureArea} aspectRatioCorrection={settings.aspectRatio} />
                                <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors">
                                    <div className="flex flex-col items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444]" />
                                        <span className="text-[9px] font-black text-white uppercase tracking-widest">Live Feed</span>
                                        <span className="text-[8px] font-bold text-white/50 uppercase tracking-tighter">(Click to unfreeze)</span>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                        {flashActive && (
                            <motion.div
                                initial={{ opacity: 0.35 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                className="absolute inset-0 z-[60] bg-white pointer-events-none"
                            />
                        )}
                    </AnimatePresence>

                    {cameraError && (
                        <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/90">
                            <div className="bg-red-950/80 border border-red-500/50 p-6 rounded-2xl max-w-md text-white shadow-2xl backdrop-blur-md text-center">
                                <AlertCircle size={40} className="text-red-500 mx-auto mb-3" />
                                <h3 className="text-sm font-black uppercase tracking-widest mb-2 text-red-200">Camera Interrupted</h3>
                                <p className="text-xs text-zinc-400 mb-6">{cameraError}</p>
                                <button onClick={() => window.location.reload()} className="px-6 py-2.5 bg-white hover:bg-zinc-200 text-black font-bold text-xs uppercase tracking-wider rounded-xl transition-colors">Reload Interface</button>
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* ═══ RIGHT: TOOL PANEL ═══ */}
            {!isCompareMode && (
                <div className="w-[25%] h-full shrink-0 flex flex-col bg-zinc-950 relative z-20 shadow-[-20px_0_60px_rgba(0,0,0,0.8)] border-l border-white/5">
                    <ProcedureToolPanel
                        patient={patient}
                        timer={timerRef.current}
                        timerDisplayRef={timerDisplayRef}
                        formatTime={formatTime}
                        onCapture={() => { handleCapture(); playSound('success'); }}
                        onToggleRecording={() => { toggleRecording(); playSound('success'); }}
                        isRecording={isRecording}
                        zoom={mainZoom}
                        zoomRange={zoomRange}
                        onZoomChange={handleZoomChange}
                        previewImage={previewImage}
                        onClearPreview={() => setPreviewImage(null)}
                        frozenFrame={frozenFrame}
                        onToggleFreeze={handleToggleFreeze}
                        isCompareMode={isCompareMode}
                        onToggleCompare={handleToggleCompare}
                        deviceId={selectedDeviceId} // Pass deviceId for live preview
                        devices={devices} // Added
                        onSwitchCamera={handleSwitchCamera} // Added
                        scopeScale={scopeScale} // Added
                        onSetScopeScale={setScopeScale} // Added

                        segments={segments as any}
                        activeSegmentIndex={activeSegmentIndex}
                        onSetActiveSegment={setActiveSegment}
                        onAddSegment={handleAddSegment}

                        captures={captures as any}
                        onOpenStudio={handleOpenGallery as any}
                        onPlayVideo={(cap: any) => setPlayingVideo(cap)}
                        history={history}
                        comparisonImage={comparisonImage}
                        onSelectComparisonImage={handleSelectComparisonImage}
                        onBack={handleBack} /* Back is now on left panel, but keep for collapsed mode */
                        onEndProcedure={() => setShowEndConfirm(true)}
                        collapsed={panelCollapsed}
                        onToggleCollapse={() => setPanelCollapsed(!panelCollapsed)}
                        settings={settings}
                        updateSetting={updateSetting}
                        activeScopeId={settings.activeScopeId}
                        scopeProfiles={settings.scopeProfiles}
                        onSelectProfile={(id: string) => updateSetting('activeScopeId', id)}
                        historyExpanded={historyExpanded}
                        setHistoryExpanded={setHistoryExpanded}
                        isCalibrating={isCalibrating}
                        onStartCalibration={() => setIsCalibrating(!isCalibrating)}
                        onStopCalibration={handleStopCalibration}
                        onConfirmCalibration={handleConfirmCalibration}
                        onChangeCalibrationShape={setCalibrationShape}

                        calibrationArea={calibrationArea}
                        resolution={resolution}
                    />
                </div>
            )}

            {/* ═══ MODALS — Single AnimatePresence, no backdrop-blur (GPU perf) ═══ */}
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
                                <button onClick={performFinish}
                                    className="px-6 py-3 rounded-xl bg-red-600 text-white font-bold hover:bg-red-500 shadow-lg shadow-red-900/20">Confirm Finish</button>
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
                        images={captures.filter(c => c.type === 'image' || !c.type).map(c => ({
                            id: c.id,
                            filePath: c.url,
                            type: 'image',
                            timestamp: c.timestamp
                        } as MediaItem))}
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
                            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent pointer-events-none">
                                <div className="text-white font-mono text-sm">{isPlayingVideo.timestamp}</div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>


            <style jsx global>{`::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: #09090b; } ::-webkit-scrollbar-thumb { background: #27272a; border-radius: 4px; } input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 12px; height: 12px; border-radius: 50%; background: white; cursor: pointer; box-shadow: 0 0 10px rgba(0,0,0,0.5); }`}</style>
        </div>
    );
}
