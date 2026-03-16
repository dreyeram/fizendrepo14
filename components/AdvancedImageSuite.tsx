"use client"
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
    X, Trash2, RotateCw, Save, MousePointer2, Pen, Sticker, Undo2, Redo2, CheckCircle2,
    MoveUpRight, CheckSquare, Square, Circle, ChevronLeft, ChevronRight, ZoomIn, ZoomOut,
    Image as ImageIcon, Video, Edit3, Trash, Camera, Play, Pause, Loader2, FileImage, Layers,
    Settings2, ChevronDown, User, Clock, PanelRightOpen, ArrowUp, ArrowDown, ArrowLeft, ArrowRight,
    FileText, ChevronUp, Layout, Home, AlertCircle, Check, Minus, Plus, RotateCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { saveMediaMetadata, getProcedureMedia, softDeleteMedia, restoreMedia } from '@/app/actions/procedure';
import { getAllTemplates as getAnatomyTemplates, type AnatomyTemplate } from '@/data/entTemplates';
import { getAllTemplates as getReportTemplates } from '@/data/reportTemplates';
import { getTags, createTag } from '@/app/actions/tags';
import { useSessionStore } from '@/lib/store/session.store';

interface Tag { id: string; label: string; color: string; }
const MOCK_TAGS: Tag[] = [
    { id: 'normal', label: 'Normal', color: '#10b981' },
    { id: 'polyp', label: 'Polyp', color: '#ef4444' },
    { id: 'inflammation', label: 'Inflammation', color: '#f59e0b' },
    { id: 'discharge', label: 'Discharge', color: '#8b5cf6' },
    { id: 'deviated', label: 'Deviated Septum', color: '#3b82f6' },
    { id: 'edema', label: 'Edema', color: '#ec4899' },
    { id: 'mass', label: 'Mass/Tumor', color: '#dc2626' },
    { id: 'foreign', label: 'Foreign Body', color: '#6366f1' },
    { id: 'scarring', label: 'Scarring', color: '#78716c' },
    { id: 'hypertrophy', label: 'Hypertrophy', color: '#0891b2' },
    { id: 'bleeding', label: 'Bleeding', color: '#be123c' },
    { id: 'ulcer', label: 'Ulcer', color: '#fbbf24' },
    { id: 'granulation', label: 'Granulation', color: '#be185d' },
    { id: 'fungal', label: 'Fungal Debris', color: '#a21caf' },
];

// --- Types ---
type Tool = 'select' | 'pen' | 'arrow' | 'rect' | 'circle' | 'tag';
type SidebarTab = 'images' | 'videos' | 'trashed';

interface ShapeBase {
    id: string;
    type: string;
    x: number;
    y: number;
    rotation: number;
    opacity: number;
    color: string;
    thickness: number;
}

interface PathShape extends ShapeBase {
    type: 'path';
    points: { x: number, y: number }[];
    w: number;
    h: number;
}

interface RectShape extends ShapeBase {
    type: 'rect' | 'circle';
    w: number;
    h: number;
}

interface ArrowShape extends ShapeBase {
    type: 'arrow';
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

interface PinShape extends ShapeBase {
    type: 'pin';
    text: string;
    iconScale?: number;
    fontSize?: number;
    fontColor?: string;
}

type Shape = PathShape | RectShape | ArrowShape | PinShape;

export interface Capture {
    id: string;
    url: string;
    base64?: string; // Local fallback
    timestamp: string;
    type?: 'image' | 'video';
    category?: 'raw' | 'polyp' | 'ulcer' | 'inflammation' | 'bleeding' | 'tumor' | 'other' | 'report';
    deleted?: boolean;
    dbMediaId?: string; // [ADDED] Consistent with lib/procedure-data.ts
    procedureId?: string; // Added to track which procedure this belongs to
    originId?: string; // ID of the original image this was edited from
    scopeShape?: string | null; // Track the scope shape used for the capture (circle/square)
    thumbnailUrl?: string; // [ADDED] For video thumbnails
}

interface AdvancedImageSuiteProps {
    captures: Capture[]; // Initial captures (legacy/prop fallback)
    onUpdateCaptures: (captures: Capture[]) => void;
    onClose: () => void;
    onGenerateReport?: (selectedIds: string[], templateMap?: Record<string, string>, captures?: Capture[]) => void;
    initialImageId?: string;
    initialSelectedIds?: string[];
    procedureId?: string;  // Fallback procedureId
}

// ENT-specific finding tags

const SliderField = React.memo(({
    label, value, min, max, step = 1, onChange, unit = '', displayValue
}: {
    label: string, value: number, min: number, max: number, step?: number, onChange: (val: number) => void, unit?: string, displayValue?: string
}) => {
    return (
        <div className="space-y-3">
            <div className="flex justify-between items-center px-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{label}</span>
                <span className="text-[11px] font-bold text-white bg-white/5 px-2 py-0.5 rounded-md font-mono border border-white/5">
                    {displayValue || `${value}${unit}`}
                </span>
            </div>
            <div className="flex items-center gap-3">
                <button
                    onClick={() => onChange(Math.max(min, value - step))}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-zinc-900 border border-white/10 hover:bg-zinc-800 hover:border-white/20 active:scale-95 transition-all text-zinc-400 hover:text-white shrink-0 shadow-sm"
                >
                    <Minus size={14} />
                </button>

                <div className="relative flex-1 h-7 flex items-center px-1">
                    <div className="absolute left-1 right-1 h-1.5 bg-white/10 rounded-full" />
                    <motion.div
                        className="absolute h-1.5 bg-blue-500 rounded-full left-1"
                        initial={false}
                        animate={{ width: `calc(${((value - min) / (max - min)) * 100}% - 8px)` }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                    <input
                        type="range" min={min} max={max} step={step}
                        value={value} onChange={(e) => onChange(parseFloat(e.target.value))}
                        className="absolute inset-x-1 inset-y-0 w-[calc(100%-8px)] opacity-0 cursor-pointer z-20"
                    />
                    <motion.div
                        className="absolute w-4 h-4 bg-white rounded-full shadow-lg z-10 pointer-events-none ring-2 ring-blue-500/20"
                        initial={false}
                        animate={{ left: `calc(${((value - min) / (max - min)) * 100}% + 4px)` }}
                        style={{ transform: 'translateX(-50%)' }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                </div>

                <button
                    onClick={() => onChange(Math.min(max, value + step))}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-zinc-900 border border-white/10 hover:bg-zinc-800 hover:border-white/20 active:scale-95 transition-all text-zinc-400 hover:text-white shrink-0 shadow-sm"
                >
                    <Plus size={14} />
                </button>
            </div>
        </div>
    );
});
SliderField.displayName = 'SliderField';

export default function AdvancedImageSuite({
    captures: initialCaptures,
    onUpdateCaptures,
    onClose,
    onGenerateReport,
    initialImageId,
    initialSelectedIds,
    procedureId
}: AdvancedImageSuiteProps) {
    // --- Store & Session State ---
    const { segments, activeSegmentIndex, setActiveSegment } = useSessionStore();
    const [localCaptures, setLocalCaptures] = useState<Capture[]>(initialCaptures);
    const [isLoadingMedia, setIsLoadingMedia] = useState(false);
    const hasRanAutoSelect = useRef(false);

    // Determines the effectively active segment ID (default to prop or store)
    const activeSegment = segments.find(s => s.index === activeSegmentIndex)
        || (procedureId ? { id: procedureId, index: 1 } : null);

    // Only show segments that have media
    const visibleSegments = segments.filter(seg => {
        return localCaptures.some(c => c.procedureId === seg.id && !c.deleted);
    });

    // --- State ---
    const [showSettings, setShowSettings] = useState(false);
    const [activeImageId, setActiveImageId] = useState<string | null>(initialImageId || null);
    const [tool, setTool] = useState<Tool>('select');

    // Tags State
    const [tags, setTags] = useState<Tag[]>(MOCK_TAGS);
    const [activeTag, setActiveTag] = useState<Tag>(MOCK_TAGS[0]);
    const [newTagLabel, setNewTagLabel] = useState("");
    const [isCreatingTag, setIsCreatingTag] = useState(false);
    const [isTagTrayOpen, setIsTagTrayOpen] = useState(false);

    // Properties
    const [color, setColor] = useState('#ef4444');
    const [thickness, setThickness] = useState(4);
    const [opacity, setOpacity] = useState(1);
    const [tagFontSize, setTagFontSize] = useState(24);
    const [tagIconScale, setTagIconScale] = useState(2);
    const [tagFontColor, setTagFontColor] = useState('#ffffff');
    const [primaryToolIds, setPrimaryToolIds] = useState<string[]>(['pen', 'arrow', 'rect', 'circle']);

    // --- Helpers ---
    const getCircleParams = () => {
        if (!naturalSize) return { cx: 0, cy: 0, r: 10000 };
        const cx = naturalSize.w / 2;
        const cy = naturalSize.h / 2;
        const r = Math.min(cx, cy);
        return { cx, cy, r };
    };

    const clampToCircle = (x: number, y: number) => {
        const { cx, cy, r } = getCircleParams();
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= r) return { x, y };
        const angle = Math.atan2(dy, dx);
        return {
            x: cx + Math.cos(angle) * r,
            y: cy + Math.sin(angle) * r
        };
    };

    // Fetch Tags - Merge defaults with DB tags
    useEffect(() => {
        let mounted = true;
        const loadTags = async () => {
            // Start with defaults
            let finalTags = [...MOCK_TAGS];

            try {
                const res = await getTags();
                if (mounted && res.success && res.tags && res.tags.length > 0) {
                    const dbTags = res.tags;
                    const uniqueDbTags = dbTags.filter(dbTag =>
                        !MOCK_TAGS.some(defaultTag => defaultTag.id === dbTag.id || defaultTag.label.toLowerCase() === dbTag.label.toLowerCase())
                    );
                    finalTags = [...MOCK_TAGS, ...uniqueDbTags];
                }
            } catch (e) {
                console.error("Failed to fetch tags, using defaults", e);
            }

            if (mounted) {
                setTags(finalTags);
                // Ensure active tag is valid and defaults to first item if current active is invalid
                if (!finalTags.find(t => t.id === activeTag.id)) {
                    setActiveTag(finalTags[0]);
                }
            }
        };
        loadTags();
        return () => { mounted = false; };
    }, []);

    const handleCreateTag = async () => {
        if (!newTagLabel.trim()) return;
        setIsCreatingTag(true);
        try {
            const res = await createTag(newTagLabel.trim(), color);
            if (res.success && res.tag) {
                setTags(prev => [...prev, res.tag!]);
                setActiveTag(res.tag!);
                setNewTagLabel("");
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsCreatingTag(false);
        }
    };

    const [sidebarTab, setSidebarTab] = useState<SidebarTab>('images');

    // Annotation State
    const [annotations, setAnnotations] = useState<Record<string, Shape[]>>({});
    const [history, setHistory] = useState<Record<string, Shape[][]>>({});
    const [historyStep, setHistoryStep] = useState<Record<string, number>>({});

    // Properties


    // Canvas Selection & Interaction
    const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [dragStart, setDragStart] = useState<{ x: number, y: number } | null>(null);
    const [transformAction, setTransformAction] = useState<{
        type: 'move' | 'resize',
        handle?: string,
        startShape?: Shape,
        startPoint?: { x: number, y: number }
    } | null>(null);

    // Zoom State
    const [zoom, setZoom] = useState(1);
    const MIN_ZOOM = 0.5;
    const MAX_ZOOM = 3;

    // Video State
    const [isVideoPlaying, setIsVideoPlaying] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);

    // UI State
    const [showReportSelection, setShowReportSelection] = useState(false);
    const [selectedForReport, setSelectedForReport] = useState<Set<string>>(new Set((initialSelectedIds || []).filter(id => initialCaptures.find(c => c.id === id)?.type !== 'video'))); // Filter initial selections
    const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' | 'warning' } | null>(null);

    // Template State
    const [selectedReportTemplates, setSelectedReportTemplates] = useState<Record<string, string>>({});
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatusIndicator, setSaveStatusIndicator] = useState<'idle' | 'saving' | 'saved'>('idle');
    const [showHomeWarning, setShowHomeWarning] = useState(false);
    const [showImageWarning, setShowImageWarning] = useState(false);

    // Default template logic
    const templates = getReportTemplates();
    const defaultTemplateId = templates.length > 0 ? templates[0].id : 'generic';

    // Sync individual session templates
    useEffect(() => {
        if (segments.length > 0) {
            setSelectedReportTemplates(prev => {
                const next = { ...prev };
                segments.forEach(seg => {
                    if (!next[seg.id]) next[seg.id] = defaultTemplateId;
                });
                return next;
            });
        }
    }, [segments, defaultTemplateId]);

    // Auto-select Edited tab logic removed as we merged them.
    // We can just ensure if we save a new edit, we switch to it (which handleSave does via setActiveImageId)
    useEffect(() => {
        // Ensure we are not on an invalid tab (like 'annotated' if it existed in state history)
        if (sidebarTab !== 'images' && sidebarTab !== 'videos' && sidebarTab !== 'trashed') {
            setSidebarTab('images');
        }
    }, [sidebarTab]);

    // Autosave Effect
    useEffect(() => {
        const timer = setTimeout(() => {
            onUpdateCaptures(localCaptures);
        }, 2000);
        return () => clearTimeout(timer);
    }, [localCaptures, onUpdateCaptures]);

    // Refs
    const containerRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const [naturalSize, setNaturalSize] = useState<{ w: number, h: number } | null>(null);

    // --- Media Fetching for Logic ---
    useEffect(() => {
        const fetchSessionMedia = async () => {
            // If we have segments, let's try to fetch all media for them
            if (segments.length === 0) return;

            setIsLoadingMedia(true);
            try {
                let allFetched: Capture[] = [];

                for (const seg of segments) {
                    const res = await getProcedureMedia(seg.id);
                    if (res.success && res.media) {
                        const mapped: Capture[] = res.media.map((m: any) => ({
                            id: m.id,
                            url: m.url || '',
                            timestamp: m.timestamp,
                            type: m.type as 'image' | 'video',
                            category: m.category || 'raw',
                            procedureId: seg.id,
                            dbMediaId: m.id,
                            scopeShape: m.scopeShape || null,
                            deleted: m.deleted
                        }));
                        allFetched = [...allFetched, ...mapped];
                    }
                }

                // DB is the authoritative source. Only add initialCaptures
                // whose IDs AND URLs are NOT already in the DB results.
                const dbIds = new Set(allFetched.map(item => item.id));
                const dbUrls = new Set(allFetched.map(item => item.url).filter(Boolean));

                const newLocalOnly = initialCaptures.filter(p => {
                    if (dbIds.has(p.id)) return false;
                    // Also filter by URL match to prevent duplicates with different IDs
                    if (p.url && dbUrls.has(p.url)) return false;
                    return true;
                });
                const combined = [
                    ...allFetched.map(dbItem => {
                        const localMatch = initialCaptures.find(p => 
                            p.id === dbItem.id || 
                            p.dbMediaId === dbItem.id || 
                            (p.url && dbItem.url && p.url === dbItem.url)
                        );
                        return {
                            ...dbItem,
                            deleted: !!dbItem.deleted || !!localMatch?.deleted
                        };
                    }),
                    ...newLocalOnly.map(p => ({
                        ...p,
                        procedureId: p.procedureId || activeSegment?.id || procedureId
                    }))
                ];

                setLocalCaptures(combined);

                // If no active image, set first image if available, else first video
                if (!activeImageId && combined.length > 0) {
                    const firstImage = combined.find(c => c.type !== 'video' && !c.deleted);
                    if (firstImage) {
                        setActiveImageId(firstImage.id);
                        setSidebarTab('images');
                    } else {
                        const firstVideo = combined.find(c => c.type === 'video' && !c.deleted);
                        if (firstVideo) {
                            setActiveImageId(firstVideo.id);
                            setSidebarTab('videos');
                        } else {
                            setActiveImageId(combined[0].id);
                        }
                    }
                }

                if (!hasRanAutoSelect.current && (!initialSelectedIds || initialSelectedIds.length === 0)) {
                    hasRanAutoSelect.current = true;
                    
                    const newSelections = new Set<string>();
                    
                    // Loop through visible segments (those that actually HAVE media)
                    const relevantSegments = segments.filter(seg => 
                        combined.some(c => c.procedureId === seg.id && !c.deleted)
                    );

                    relevantSegments.forEach(seg => {
                        const segImages = combined.filter(c => c.procedureId === seg.id && c.type !== 'video' && !c.deleted);
                        
                        const annotated = segImages.filter(c => c.category === 'report');
                        const raws = segImages.filter(c => c.category !== 'report');
                        
                        const annotatedOriginIds = new Set(annotated.map(c => c.originId).filter(Boolean));
                        const eligibleRaws = raws.filter(c => !annotatedOriginIds.has(c.id));
                        
                        const toSelectForProc = [...annotated, ...eligibleRaws].slice(0, 4);
                        toSelectForProc.forEach(c => newSelections.add(c.id));
                    });
                    
                    if (newSelections.size > 0) {
                        setSelectedForReport(newSelections);
                    }
                }

            } catch (e) {
                console.error("Failed to fetch session media", e);
            } finally {
                setIsLoadingMedia(false);
            }
        };

        fetchSessionMedia();
    }, [segments]); // REMOVED initialCaptures to prevent infinite re-fetch/duplication cycles


    const activeCapture = localCaptures.find(c => c.id === activeImageId);

    // Filter by Tab AND Active Segment
    const getFilteredCaptures = () => {
        // Filter by Procedure Segment first
        let segmentCaptures = localCaptures;

        // Only filter by segment if we successfully identified an active segment
        if (activeSegment?.id) {
            segmentCaptures = localCaptures.filter(c => c.procedureId === activeSegment.id);

            const orphans = localCaptures.filter(c => !c.procedureId);
            if (activeSegmentIndex === 1 || segments.length === 0) {
                segmentCaptures = [...segmentCaptures, ...orphans];
            }
        }

        switch (sidebarTab) {
            case 'images':
                // Raw images tab: shows all non-deleted images (raw AND edited/report)
                return segmentCaptures.filter(c => c.type !== 'video' && !c.deleted);
            case 'videos':
                return segmentCaptures.filter(c => c.type === 'video' && !c.deleted);
            case 'trashed':
                return segmentCaptures.filter(c => c.deleted);
            default:
                return [];
        }
    };

    const filteredCaptures = useMemo(() => getFilteredCaptures(), [localCaptures, sidebarTab, segments, activeSegmentIndex]);

    // --- Helpers ---
    const getCurrentShapes = useCallback(() => {
        if (!activeImageId) return [];
        return annotations[activeImageId] || [];
    }, [activeImageId, annotations]);

    const showNotification = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 3000);
    };

    const updateShape = (id: string, updates: Partial<Shape>) => {
        if (!activeImageId) return;
        setAnnotations(prev => ({
            ...prev,
            [activeImageId]: prev[activeImageId].map(s => s.id === id ? { ...s, ...updates } as Shape : s)
        }));
    };

    const commitToHistory = (newShapes: Shape[]) => {
        if (!activeImageId) return;
        const currentStep = historyStep[activeImageId] || 0;
        const currentHistory = history[activeImageId] || [];
        const newHistory = [...currentHistory.slice(0, currentStep + 1), newShapes];
        setHistory(prev => ({ ...prev, [activeImageId]: newHistory }));
        setHistoryStep(prev => ({ ...prev, [activeImageId]: newHistory.length - 1 }));
        setAnnotations(prev => ({ ...prev, [activeImageId]: newShapes }));
        setHasUnsavedChanges(true);
    };

    const handleUndo = () => {
        if (!activeImageId) return;
        const currentStep = historyStep[activeImageId] ?? -1;
        const currentHistory = history[activeImageId] || [];

        if (currentStep > 0) {
            const newStep = currentStep - 1;
            setHistoryStep(prev => ({ ...prev, [activeImageId]: newStep }));
            setAnnotations(prev => ({ ...prev, [activeImageId]: currentHistory[newStep] || [] }));
        } else if (currentStep === 0) {
            // Undo back to empty state
            setHistoryStep(prev => ({ ...prev, [activeImageId]: -1 }));
            setAnnotations(prev => ({ ...prev, [activeImageId]: [] }));
        }
    };

    const handleRedo = () => {
        if (!activeImageId) return;
        const currentStep = historyStep[activeImageId] || 0;
        const currentHistory = history[activeImageId] || [];
        if (currentStep < currentHistory.length - 1) {
            const newStep = currentStep + 1;
            setHistoryStep(prev => ({ ...prev, [activeImageId]: newStep }));
            setAnnotations(prev => ({ ...prev, [activeImageId]: currentHistory[newStep] || [] }));
        }
    };

    const canUndo = activeImageId ? (historyStep[activeImageId] ?? -1) >= 0 : false;
    const canRedo = activeImageId ? (historyStep[activeImageId] ?? -1) < (history[activeImageId]?.length || 0) - 1 : false;

    const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.1, MAX_ZOOM));
    const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.1, MIN_ZOOM));
    const handleZoomReset = () => setZoom(1);

    const handleCaptureVideoFrame = () => {
        // Disabled as per user request
        console.log("Frame capture disabled");
    };

    const getMousePos = (e: React.MouseEvent) => {
        const svg = svgRef.current;
        if (!svg) return { x: 0, y: 0 };
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const cursorPt = pt.matrixTransform(svg.getScreenCTM()?.inverse());
        return { x: cursorPt.x, y: cursorPt.y };
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!activeImageId || !tool || activeCapture?.type === 'video') return;
        if (tool !== 'select') setSelectedShapeId(null);

        let pos = getMousePos(e);
        if (tool !== 'select') {
            pos = clampToCircle(pos.x, pos.y);
        }

        if (tool === 'select' && selectedShapeId) {
            const target = e.target as Element;
            const handle = target.getAttribute('data-handle');
            if (handle) {
                const shape = getCurrentShapes().find(s => s.id === selectedShapeId);
                if (shape) {
                    setTransformAction({ type: 'resize', handle, startShape: shape, startPoint: pos });
                    setDragStart(pos);
                    return;
                }
            }
        }

        if (tool === 'select') {
            if (e.target === svgRef.current) {
                setSelectedShapeId(null);
                return;
            } else {
                const targetId = (e.target as Element).getAttribute('data-id');
                if (targetId) {
                    setSelectedShapeId(targetId);
                    const shape = getCurrentShapes().find(s => s.id === targetId);
                    if (shape) {
                        setTransformAction({ type: 'move', startShape: shape, startPoint: pos });
                        setDragStart(pos);
                    }
                }
                return;
            }
        }

        setIsDrawing(true);
        setDragStart(pos);
        const newId = Math.random().toString(36).substr(2, 9);
        const currentShapes = getCurrentShapes();

        let newShape: Shape | null = null;
        if (tool === 'pen') {
            newShape = { type: 'path', id: newId, color, thickness, points: [pos], x: pos.x, y: pos.y, w: 0, h: 0, rotation: 0, opacity } as PathShape;
        } else if (tool === 'tag') {
            newShape = { type: 'pin', id: newId, color: activeTag.color, thickness, x: pos.x, y: pos.y, text: activeTag.label, rotation: 0, opacity, fontSize: tagFontSize, iconScale: tagIconScale, fontColor: tagFontColor } as PinShape;
            const nextShapes = [...currentShapes, newShape];
            setAnnotations(prev => ({ ...prev, [activeImageId]: nextShapes }));
            commitToHistory(nextShapes);
            setSelectedShapeId(newId);
            setTool('select');
            setIsDrawing(false);
            setIsTagTrayOpen(false); // Close tray after placing tag
            return;
        } else if (tool === 'arrow') {
            newShape = { type: 'arrow', id: newId, color, thickness, x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y, x: pos.x, y: pos.y, rotation: 0, opacity } as ArrowShape;
        } else if (tool === 'rect' || tool === 'circle') {
            newShape = { type: tool, id: newId, color, thickness, x: pos.x, y: pos.y, w: 0, h: 0, rotation: 0, opacity } as RectShape;
        }

        if (newShape) {
            setAnnotations(prev => ({ ...prev, [activeImageId]: [...currentShapes, newShape!] }));
            setSelectedShapeId(newId);
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        let pos = getMousePos(e);
        if (transformAction || isDrawing) {
            pos = clampToCircle(pos.x, pos.y);
        }

        if (transformAction && dragStart && transformAction.startShape) {
            const { type, handle, startShape, startPoint } = transformAction;
            if (!startPoint) return;
            const dx = pos.x - startPoint.x;
            const dy = pos.y - startPoint.y;

            if (type === 'move') {
                if (startShape.type === 'arrow') {
                    const s = startShape as ArrowShape;
                    updateShape(s.id, { x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy });
                } else {
                    updateShape(startShape.id, { x: startShape.x + dx, y: startShape.y + dy });
                }
            } else if (type === 'resize') {
                if (startShape.type === 'arrow') {
                    const s = startShape as ArrowShape;
                    if (handle === 'start') updateShape(s.id, { x1: s.x1 + dx, y1: s.y1 + dy });
                    else if (handle === 'end') updateShape(s.id, { x2: s.x2 + dx, y2: s.y2 + dy });
                } else if ('w' in startShape && 'h' in startShape) {
                    const s = startShape as RectShape;
                    let { x, y, w, h } = s;
                    if (handle?.includes('e')) w += dx;
                    if (handle?.includes('s')) h += dy;
                    if (handle?.includes('w')) { x += dx; w -= dx; }
                    if (handle?.includes('n')) { y += dy; h -= dy; }
                    updateShape(s.id, { x, y, w, h });
                } else if (startShape.type === 'pin') {
                    const s = startShape as PinShape;
                    const oldSize = (s.fontSize || tagFontSize);
                    const oldScale = (s.iconScale || tagIconScale);
                    
                    // Simple uniform scale based on vertical delta
                    // Since the pin tip is at the bottom, dragging 'n' handles should scale up.
                    let deltaScale = 1 - (dy / 200); 
                    if (handle?.includes('s')) deltaScale = 1 + (dy / 200);
                    
                    const newSize = Math.max(10, Math.min(100, oldSize * deltaScale));
                    const newScale = Math.max(0.5, Math.min(5, oldScale * deltaScale));
                    
                    updateShape(s.id, { fontSize: newSize, iconScale: newScale });
                }
            }
            return;
        }

        if (isDrawing && dragStart && tool !== 'select') {
            const currentShapes = getCurrentShapes();
            const activeShape = currentShapes[currentShapes.length - 1];
            if (!activeShape) return;
            if (activeShape.type === 'path') {
                const newPoints = [...(activeShape as PathShape).points, pos];
                const xs = newPoints.map(p => p.x);
                const ys = newPoints.map(p => p.y);
                updateShape(activeShape.id, {
                    points: newPoints,
                    x: Math.min(...xs), y: Math.min(...ys),
                    w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys)
                } as Partial<PathShape>);
            } else if (activeShape.type === 'rect' || activeShape.type === 'circle') {
                updateShape(activeShape.id, { w: pos.x - dragStart.x, h: pos.y - dragStart.y });
            } else if (activeShape.type === 'arrow') {
                updateShape(activeShape.id, { x2: pos.x, y2: pos.y });
            }
        }
    };

    const handleMouseUp = () => {
        if (isDrawing) {
            setIsDrawing(false);
            commitToHistory(getCurrentShapes());
            setTool('select'); // Switch to select tool after drawing
        }
        if (transformAction) { setTransformAction(null); commitToHistory(getCurrentShapes()); }
    };

    const performAutoSave = async () => {
        if (!activeImageId || !containerRef.current) return;
        const currentActiveCapture = localCaptures.find(c => c.id === activeImageId);
        if (!currentActiveCapture || currentActiveCapture.type === 'video') return;

        setIsSaving(true);
        setSaveStatusIndicator('saving');

        const isEditingReportImage = currentActiveCapture.category === 'report';
        const originId = isEditingReportImage ? currentActiveCapture.originId : activeImageId;

        // [FIX] Check if an annotated version already exists for this raw image to prevent duplication
        const existingAnnotated = !isEditingReportImage
            ? localCaptures.find(c => c.originId === activeImageId && c.category === 'report' && !c.deleted)
            : null;

        const effectiveCaptureToReplace = isEditingReportImage ? currentActiveCapture : existingAnnotated;

        const rawImageUrl = isEditingReportImage && currentActiveCapture.originId
            ? localCaptures.find(c => c.id === currentActiveCapture.originId)?.url || currentActiveCapture.url
            : currentActiveCapture.url;

        const canvas = document.createElement('canvas');
        const img = new Image();
        img.src = rawImageUrl;
        img.crossOrigin = "anonymous";
        await new Promise(r => img.onload = r);
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            setIsSaving(false);
            setSaveStatusIndicator('idle');
            return;
        }

        // Canvas starts transparent — image provides its own background.
        // PNG output preserves transparency for circular scope captures.

        ctx.drawImage(img, 0, 0);
        const shapes = getCurrentShapes();
        shapes.forEach(shape => {
            // ... (Same drawing logic as provided) ...
            ctx.save();
            ctx.globalAlpha = shape.opacity ?? 1;
            ctx.strokeStyle = shape.color;
            ctx.fillStyle = shape.color;
            ctx.lineWidth = shape.thickness;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            if (shape.type === 'rect') { ctx.strokeRect(shape.x, shape.y, (shape as RectShape).w, (shape as RectShape).h); }
            else if (shape.type === 'circle') {
                const s = shape as RectShape; ctx.beginPath();
                ctx.ellipse(s.x + (s.w || 0) / 2, s.y + (s.h || 0) / 2, Math.abs((s.w || 0) / 2), Math.abs((s.h || 0) / 2), 0, 0, 2 * Math.PI);
                ctx.stroke();
            }
            else if (shape.type === 'path') {
                const s = shape as PathShape; ctx.beginPath();
                s.points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
                ctx.stroke();
            }
            else if (shape.type === 'pin') {
                const s = shape as PinShape;
                const fSize = s.fontSize || tagFontSize;
                const iScale = s.iconScale || tagIconScale;
                const fColor = s.fontColor || tagFontColor;
                const estimatedWidth = s.text.length * (fSize * 0.6) + 20;
                const textY = -(iScale * 30);

                ctx.translate(s.x, s.y);

                // Draw Pin Icon
                ctx.save();
                ctx.fillStyle = s.color;
                const pinPath = new Path2D("M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z M12 11.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z");
                ctx.scale(iScale * 2, iScale * 2);
                ctx.translate(-12, -24);
                ctx.fill(pinPath);
                ctx.restore();

                // Draw Text Background Pill
                ctx.save();
                ctx.fillStyle = "rgba(0,0,0,0.6)";
                const rx = fSize * 0.6;
                const rectX = -(estimatedWidth / 2);
                const rectY = textY - (fSize * 0.8);
                const rectW = estimatedWidth;
                const rectH = fSize * 1.2;

                // Rounded rect helper
                ctx.beginPath();
                ctx.moveTo(rectX + rx, rectY);
                ctx.lineTo(rectX + rectW - rx, rectY);
                ctx.quadraticCurveTo(rectX + rectW, rectY, rectX + rectW, rectY + rx);
                ctx.lineTo(rectX + rectW, rectY + rectH - rx);
                ctx.quadraticCurveTo(rectX + rectW, rectY + rectH, rectX + rectW - rx, rectY + rectH);
                ctx.lineTo(rectX + rx, rectY + rectH);
                ctx.quadraticCurveTo(rectX, rectY + rectH, rectX, rectY + rectH - rx);
                ctx.lineTo(rectX, rectY + rx);
                ctx.quadraticCurveTo(rectX, rectY, rectX + rx, rectY);
                ctx.closePath();
                ctx.fill();
                ctx.restore();

                // Draw Tag Text
                ctx.save();
                ctx.font = `900 ${fSize}px system-ui, sans-serif`;
                ctx.fillStyle = fColor;
                ctx.textAlign = "center";
                ctx.shadowColor = "rgba(0,0,0,0.5)";
                ctx.shadowBlur = 4;
                ctx.shadowOffsetY = 2;
                ctx.fillText(s.text, 0, textY);
                ctx.restore();

                ctx.restore();
            } else if (shape.type === 'arrow') {
                const s = shape as ArrowShape;
                ctx.beginPath();
                ctx.moveTo(s.x1, s.y1);
                ctx.lineTo(s.x2, s.y2);
                ctx.stroke();

                const angle = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
                const headLen = Math.max(15, shape.thickness * 4);
                ctx.beginPath();
                ctx.moveTo(s.x2, s.y2);
                ctx.lineTo(s.x2 - headLen * Math.cos(angle - Math.PI / 6), s.y2 - headLen * Math.sin(angle - Math.PI / 6));
                ctx.moveTo(s.x2, s.y2);
                ctx.lineTo(s.x2 - headLen * Math.cos(angle + Math.PI / 6), s.y2 - headLen * Math.sin(angle + Math.PI / 6));
                ctx.stroke();
            }
            ctx.restore();
        });

        let finalUrl = canvas.toDataURL("image/png");
        const capShape = currentActiveCapture.scopeShape || 'rectangle';
        if ((capShape === 'circle' || capShape === 'square') && canvas.width !== canvas.height) {
            const side = Math.min(canvas.width, canvas.height);
            const cropCanvas = document.createElement('canvas');
            cropCanvas.width = side;
            cropCanvas.height = side;
            const cropCtx = cropCanvas.getContext('2d');
            if (cropCtx) {
                const sx = (canvas.width - side) / 2;
                const sy = (canvas.height - side) / 2;
                cropCtx.drawImage(canvas, sx, sy, side, side, 0, 0, side, side);
                finalUrl = cropCanvas.toDataURL("image/png");
            }
        }

        const newUrl = finalUrl;
        const targetProcedureId = currentActiveCapture.procedureId || activeSegment?.id || procedureId;

        const newId = `adj-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        const newCapture: Capture = {
            id: newId,
            url: newUrl,
            timestamp: new Date().toLocaleTimeString(),
            type: 'image',
            category: 'report',
            procedureId: targetProcedureId,
            originId: isEditingReportImage ? currentActiveCapture.originId : activeImageId,
            scopeShape: currentActiveCapture.scopeShape || undefined
        };

        if (targetProcedureId) {
            try {
                // 1. UPLOAD
                const uploadRes = await fetch('/api/capture-upload', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        procedureId: targetProcedureId,
                        data: newUrl,
                        type: 'IMAGE',
                        filename: `annotated_${Date.now()}.png`,
                        scopeShape: currentActiveCapture.scopeShape || undefined
                    }),
                });

                if (!uploadRes.ok) throw new Error('Upload failed');
                const { filePath } = await uploadRes.json();

                // 2. SOFT DELETE OLD IF OVERWRITING
                if (effectiveCaptureToReplace) {
                    await softDeleteMedia(effectiveCaptureToReplace.id);
                }

                // 3. SAVE METADATA
                const res = await saveMediaMetadata({
                    procedureId: targetProcedureId,
                    type: 'ANNOTATED',
                    filePath: filePath,
                    originId: newCapture.originId,
                    timestamp: new Date(),
                    scopeShape: currentActiveCapture.scopeShape || undefined
                });

                if (res.success && res.mediaId) {
                    newCapture.id = res.mediaId;
                    newCapture.url = `/api/capture-serve?path=${encodeURIComponent(filePath)}`;
                }
            } catch (err) {
                console.error('Failed to auto-save annotated image:', err);
                setIsSaving(false);
                setSaveStatusIndicator('idle');
                return;
            }
        }

        // SWAP IN PLACE
        const finalReplaceId = effectiveCaptureToReplace?.id;

        setLocalCaptures(prev => {
            if (finalReplaceId) {
                return prev.map(c => c.id === finalReplaceId ? newCapture : c);
            } else {
                return [newCapture, ...prev];
            }
        });

        onUpdateCaptures(
            finalReplaceId
                ? localCaptures.map(c => c.id === finalReplaceId ? newCapture : c)
                : [newCapture, ...localCaptures]
        );

        setSelectedForReport(prev => {
            const next = new Set(prev);
            if (finalReplaceId) {
                next.delete(finalReplaceId);
            }
            if (!isEditingReportImage && activeImageId) {
                // If we started from raw, remove raw from selection and use annotated version
                next.delete(activeImageId);
            }
            next.add(newCapture.id);
            return next;
        });

        // Migrate annotations and history to new ID
        setAnnotations(prev => {
            const next = { ...prev };
            next[newCapture.id] = next[activeImageId!] || [];
            if (!isEditingReportImage) delete next[activeImageId!];
            return next;
        });
        setHistory(prev => {
            const next = { ...prev };
            next[newCapture.id] = next[activeImageId!] || [];
            if (!isEditingReportImage) delete next[activeImageId!];
            return next;
        });
        setHistoryStep(prev => {
            const next = { ...prev };
            next[newCapture.id] = next[activeImageId!] || 0;
            if (!isEditingReportImage) delete next[activeImageId!];
            return next;
        });

        setActiveImageId(newCapture.id);
        setHasUnsavedChanges(false);
        setIsSaving(false);
        setSaveStatusIndicator('saved');

        setTimeout(() => {
            setSaveStatusIndicator(prev => prev === 'saved' ? 'idle' : prev);
        }, 3000);
    };

    // Auto-Save Effect trigger
    useEffect(() => {
        if (!activeImageId || !hasUnsavedChanges || isDrawing || transformAction !== null) return;
        const currentShapes = annotations[activeImageId] || [];
        if (currentShapes.length === 0 && !history[activeImageId]?.length) return; // Don't auto-save just opening a clean image

        setSaveStatusIndicator('saving');
        const timer = setTimeout(() => {
            performAutoSave();
        }, 2500);

        return () => clearTimeout(timer);
    }, [annotations, activeImageId, isDrawing, transformAction, hasUnsavedChanges]);

    const toggleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const item = localCaptures.find(c => c.id === id);
        if (!item) return;
        
        const isDeleting = !item.deleted;
        const next = localCaptures.map(c => c.id === id ? { ...c, deleted: !c.deleted } : c);
        setLocalCaptures(next);
        onUpdateCaptures(next);

        // Sync with DB if it has a DB ID
        const dbId = item.dbMediaId || (item.id.length > 20 ? item.id : null);
        if (dbId) {
            try {
                if (isDeleting) await softDeleteMedia(dbId);
                else await restoreMedia(dbId);
            } catch (err) {
                console.error("Failed to sync delete status with DB:", err);
            }
        }

        if (isDeleting) {
            showNotification("Item moved to bin. You can recover it from the bin later.", "warning");
            
            if (activeImageId === id) {
                // Find visible items in the same segment
                const remaining = next.filter(c => {
                    if (c.deleted) return false;
                    if (!activeSegment?.id) return true;
                    return c.procedureId === activeSegment.id || !c.procedureId;
                });

                if (remaining.length > 0) {
                    // Try to find the item that was exactly before or after this one
                    const deletedIdx = localCaptures.findIndex(c => c.id === id);
                    // Find closest available item in 'next' array (which has updated 'deleted' flags)
                    // We look for the first non-deleted item near the original index
                    let nextToSelect = null;
                    
                    // Look forward
                    for (let i = deletedIdx + 1; i < localCaptures.length; i++) {
                        if (!next[i].deleted && (activeSegment?.id ? next[i].procedureId === activeSegment.id : true)) {
                            nextToSelect = next[i].id;
                            break;
                        }
                    }
                    
                    // If not found forward, look backward
                    if (!nextToSelect) {
                        for (let i = deletedIdx - 1; i >= 0; i--) {
                            if (!next[i].deleted && (activeSegment?.id ? next[i].procedureId === activeSegment.id : true)) {
                                nextToSelect = next[i].id;
                                break;
                            }
                        }
                    }

                    setActiveImageId(nextToSelect || remaining[0].id);
                } else {
                    setActiveImageId(null);
                }
            }
        }
    };

    const toggleReportSelection = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const capture = localCaptures.find(c => c.id === id);
        if (capture?.type === 'video') return; // Strictly allow images only

        setSelectedForReport(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const restoreCapture = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const item = localCaptures.find(c => c.id === id);
        if (!item) return;

        const next = localCaptures.map(c => c.id === id ? { ...c, deleted: false } : c);
        setLocalCaptures(next);
        onUpdateCaptures(next);

        // Sync with DB
        const dbId = item.dbMediaId || (item.id.length > 20 ? item.id : null);
        if (dbId) {
            try {
                await restoreMedia(dbId);
                showNotification("Item restored successfully", "success");
            } catch (err) {
                console.error("Failed to restore from DB:", err);
            }
        }
    };



    const allInSegment = localCaptures.filter(c => {
        if (c.deleted) return false;
        if (!activeSegment?.id) return true;
        return c.procedureId === activeSegment.id || !c.procedureId;
    });

    const currentIndex = allInSegment.findIndex(c => c.id === activeImageId);
    const goToPrev = () => { if (currentIndex > 0) setActiveImageId(allInSegment[currentIndex - 1].id); };
    const goToNext = () => { if (currentIndex < allInSegment.length - 1) setActiveImageId(allInSegment[currentIndex + 1].id); };

    // Transformer (Defined internally to access scope, but could be extracted)
    const Transformer = ({ shape }: { shape: Shape }) => {
        let bx = 0, by = 0, bw = 0, bh = 0;
        if ('w' in shape) { bx = shape.x; by = shape.y; bw = shape.w; bh = shape.h; }
        else if ('x1' in shape) {
            bx = Math.min(shape.x1, shape.x2); by = Math.min(shape.y1, shape.y2);
            bw = Math.abs(shape.x2 - shape.x1); bh = Math.abs(shape.y2 - shape.y1);
        } else if (shape.type === 'pin') {
            const s = shape as PinShape;
            const fSize = s.fontSize || tagFontSize;
            const iScale = s.iconScale || tagIconScale;
            const textWidth = s.text.length * (fSize * 0.6) + 20;
            const iconWidth = 24 * (iScale * 2);
            const textY = -(iScale * 24);
            
            const pillTop = textY - (fSize * 0.8);
            const iconTop = -(iScale * 48);
            
            bw = Math.max(iconWidth, textWidth);
            by = s.y + Math.min(pillTop, iconTop) - 5;
            bh = s.y - by + 5;
            bx = s.x - bw / 2;
        }
        if (bw < 0) { bx += bw; bw = Math.abs(bw); }
        if (bh < 0) { by += bh; bh = Math.abs(bh); }

        return (
            <g>
                <rect x={bx} y={by} width={bw} height={bh} fill="none" stroke="#3b82f6" strokeWidth="2" strokeDasharray="6 3" pointerEvents="none" />
                {('w' in shape || shape.type === 'pin') && (
                    <>
                        <rect x={bx - 5} y={by - 5} width={10} height={10} fill="white" stroke="#3b82f6" strokeWidth={2} cursor="nw-resize" data-handle="nw" rx="2" />
                        <rect x={bx + bw - 5} y={by - 5} width={10} height={10} fill="white" stroke="#3b82f6" strokeWidth={2} cursor="ne-resize" data-handle="ne" rx="2" />
                        <rect x={bx - 5} y={by + bh - 5} width={10} height={10} fill="white" stroke="#3b82f6" strokeWidth={2} cursor="sw-resize" data-handle="sw" rx="2" />
                        <rect x={bx + bw - 5} y={by + bh - 5} width={10} height={10} fill="white" stroke="#3b82f6" strokeWidth={2} cursor="se-resize" data-handle="se" rx="2" />
                    </>
                )}
                {('x1' in shape) && (
                    <>
                        <circle cx={shape.x1} cy={shape.y1} r={6} fill="white" stroke="#3b82f6" strokeWidth={2} cursor="move" data-handle="start" />
                        <circle cx={shape.x2} cy={shape.y2} r={6} fill="white" stroke="#3b82f6" strokeWidth={2} cursor="move" data-handle="end" />
                    </>
                )}
            </g>
        );
    };

    const StylePreview = () => {
        const isVisible = showSettings;
        if (!isVisible || !naturalSize) return null;

        const { w, h } = naturalSize;
        const effectiveTool = tool === 'select' ? 'pen' : tool;

        // Calculate a responsive size and position based on image dimensions
        const scaleFactor = Math.min(w, h) / 800;
        const boxW = 220 * scaleFactor;
        const boxH = 200 * scaleFactor;
        
        // Position at 5% from top/left
        const previewX = w * 0.05;
        const previewY = h * 0.1;

        let element = null;
        const commonProps = { 
            stroke: color, 
            strokeWidth: thickness * scaleFactor, 
            opacity: opacity, 
            fill: 'none', 
            strokeLinecap: 'round' as const, 
            strokeLinejoin: 'round' as const 
        };

        const drawX = previewX + (boxW * 0.2);
        const drawY = previewY + (boxH * 0.3);
        const drawW = boxW * 0.6;
        const drawH = boxH * 0.5;

        if (effectiveTool === 'rect') {
            element = <rect x={drawX} y={drawY} width={drawW} height={drawH} {...commonProps} />;
        } else if (effectiveTool === 'circle') {
            element = <ellipse cx={drawX + drawW/2} cy={drawY + drawH/2} rx={drawW/2} ry={drawH/2} {...commonProps} />;
        } else if (effectiveTool === 'pen') {
            const d = `M ${drawX} ${drawY + drawH} Q ${drawX + drawW/2} ${drawY} ${drawX + drawW} ${drawY + drawH}`;
            element = <path d={d} {...commonProps} />;
        } else if (effectiveTool === 'arrow') {
            element = (
                <g opacity={opacity}>
                    <line x1={drawX} y1={drawY + drawH/2} x2={drawX + drawW} y2={drawY + drawH/2} stroke={color} strokeWidth={thickness * scaleFactor} markerEnd="url(#arrowhead)" />
                </g>
            );
        } else if (effectiveTool === 'tag') {
            const fSize = tagFontSize * scaleFactor;
            const iScale = tagIconScale * scaleFactor;
            const fColor = tagFontColor;
            const text = activeTag.label;
            const estimatedWidth = text.length * (fSize * 0.6) + 20 * scaleFactor;
            const textY = -(iScale * 15);

            element = (
                <g transform={`translate(${drawX + drawW/2},${drawY + drawH/2})`} opacity={opacity}>
                    <path
                        d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z M12 11.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
                        fill={color}
                        transform={`translate(-12, -24) scale(${iScale * 2})`}
                    />
                    <rect
                        x={-(estimatedWidth / 2)}
                        y={textY - (fSize * 0.8)}
                        width={estimatedWidth}
                        height={fSize * 1.2}
                        rx={fSize * 0.6}
                        fill="black"
                        fillOpacity="0.6"
                    />
                    <text
                        x="0"
                        y={textY}
                        textAnchor="middle"
                        fill={fColor}
                        fontWeight="900"
                        fontSize={fSize}
                        style={{
                            textShadow: '0 2px 4px rgba(0,0,0,0.5)',
                            fontFamily: 'system-ui, sans-serif'
                        }}
                    >
                        {text}
                    </text>
                </g>
            );
        }

        return (
            <motion.g
                initial={{ opacity: 0, scale: 0.9, x: -20 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.9, x: -20 }}
                className="pointer-events-none"
            >
                <rect
                    x={previewX}
                    y={previewY}
                    width={boxW}
                    height={boxH}
                    rx={24 * scaleFactor}
                    fill="rgba(0,0,0,0.6)"
                    stroke="rgba(255,255,255,0.2)"
                    style={{ backdropFilter: 'blur(12px)' }}
                />
                <text
                    x={previewX + (15 * scaleFactor)}
                    y={previewY + (30 * scaleFactor)}
                    fontSize={12 * scaleFactor}
                    fontWeight="900"
                    fill="rgba(255,255,255,0.6)"
                    className="uppercase tracking-[0.2em]"
                    style={{ fontFamily: 'system-ui, sans-serif' }}
                >
                    Live Preview
                </text>
                {element}
            </motion.g>
        );
    };



    // --- Render ---
    return (
        <div className="fixed inset-0 z-[100] flex bg-zinc-950 text-white select-none">
            {/* === MAIN AREA (LEFT) === */}
            <div className="flex-1 flex flex-col relative bg-[#020202] overflow-hidden">

                <div className="flex-1 flex flex-col items-center justify-center p-4 relative overflow-hidden bg-[#020202]">
                    {activeCapture ? (
                        <div className="relative flex flex-col items-center w-full h-full">
                            {/* The Image/Video viewport */}
                            <div className="relative flex-1 flex items-center justify-center w-full min-h-0">
                                {activeCapture.type === 'video' ? (
                                    <div className="relative flex flex-col items-center max-w-full max-h-full">
                                        <video ref={videoRef} src={activeCapture.url} className="max-w-full max-h-[85vh] rounded-3xl shadow-[0_0_100px_rgba(0,0,0,0.8)] border border-white/5 overflow-hidden" style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }} onPlay={() => setIsVideoPlaying(true)} onPause={() => setIsVideoPlaying(false)} controls />
                                    </div>
                                ) : (
                                    <div ref={containerRef} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} className="relative rounded-3xl overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.8)] border border-white/5 group bg-black" style={{ cursor: tool === 'select' ? 'default' : 'crosshair', transform: `scale(${zoom})`, transformOrigin: 'center' }}>
                                        <img src={activeCapture.category === 'report' && activeCapture.originId ? (localCaptures.find(c => c.id === activeCapture.originId)?.url || activeCapture.url) : activeCapture.url} className="max-w-full max-h-[85vh] block object-contain pointer-events-none" draggable={false} onLoad={(e) => setNaturalSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} alt="" />
                                        <svg ref={svgRef} className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }} viewBox={naturalSize ? `0 0 ${naturalSize.w} ${naturalSize.h}` : undefined}>
                                            <defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill={color} /></marker></defs>
                                            
                                            <AnimatePresence>
                                                <StylePreview />
                                            </AnimatePresence>

                                            {getCurrentShapes().map(shape => {
                                                let element = null;
                                                const commonProps = { stroke: shape.color, strokeWidth: shape.thickness, opacity: shape.opacity, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

                                                if (shape.type === 'rect') { const s = shape as RectShape; element = <rect x={s.x} y={s.y} width={s.w} height={s.h} {...commonProps} />; }
                                                else if (shape.type === 'circle') { const s = shape as RectShape; element = <ellipse cx={s.x + (s.w || 0) / 2} cy={s.y + (s.h || 0) / 2} rx={Math.abs((s.w || 0) / 2)} ry={Math.abs((s.h || 0) / 2)} {...commonProps} />; }
                                                else if (shape.type === 'path') { const s = shape as PathShape; const d = s.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' '); element = <path d={d} {...commonProps} />; }
                                                else if (shape.type === 'arrow') {
                                                    const s = shape as ArrowShape;
                                                    element = <g opacity={shape.opacity}><line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={shape.color} strokeWidth={shape.thickness} markerEnd="url(#arrowhead)" /></g>;
                                                }
                                                else if (shape.type === 'pin') {
                                                    const s = shape as PinShape;
                                                    const fSize = s.fontSize || tagFontSize;
                                                    const iScale = s.iconScale || tagIconScale;
                                                    const fColor = s.fontColor || tagFontColor;
                                                    const estimatedWidth = s.text.length * (fSize * 0.6) + 20;
                                                    const textY = -(iScale * 24);

                                                    element = <g transform={`translate(${s.x},${s.y})`} opacity={s.opacity}>
                                                        {/* Pin Icon */}
                                                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z M12 11.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill={s.color} transform={`translate(-12, -24) scale(${iScale * 2})`} />

                                                        {/* Text Background Pill */}
                                                        <rect
                                                            x={-(estimatedWidth / 2)}
                                                            y={textY - (fSize * 0.8)}
                                                            width={estimatedWidth}
                                                            height={fSize * 1.2}
                                                            rx={fSize * 0.6}
                                                            fill="black"
                                                            fillOpacity="0.6"
                                                        />

                                                        {/* Tag Text */}
                                                        <text
                                                            x="0"
                                                            y={textY}
                                                            textAnchor="middle"
                                                            fill={fColor}
                                                            fontWeight="900"
                                                            fontSize={fSize}
                                                            style={{
                                                                textShadow: '0 2px 4px rgba(0,0,0,0.5)',
                                                                fontFamily: 'system-ui, sans-serif'
                                                            }}
                                                        >
                                                            {s.text}
                                                        </text>
                                                    </g>;
                                                }

                                                return (
                                                    <g key={shape.id} onMouseDown={(e) => {
                                                        const target = e.target as Element;
                                                        const handle = target.getAttribute('data-handle');
                                                        if (tool === 'select' && !handle) {
                                                            e.stopPropagation();
                                                            setSelectedShapeId(shape.id);
                                                            setTransformAction({ type: 'move', startShape: shape, startPoint: getMousePos(e) });
                                                            setDragStart(getMousePos(e));
                                                        }
                                                    }} data-id={shape.id} style={{ pointerEvents: tool === 'select' ? 'auto' : 'none', cursor: tool === 'select' ? 'move' : 'none' }}>
                                                        {element}
                                                        {selectedShapeId === shape.id && <Transformer shape={shape} />}
                                                    </g>
                                                );
                                            })}
                                        </svg>
                                    </div>
                                )}
                            </div>

                            {/* Action & Tools Combined Row */}
                            {activeCapture.type !== 'video' ? (
                                <div className="bg-zinc-900/95 backdrop-blur-2xl border border-white/10 p-1 rounded-2xl shadow-2xl flex items-stretch h-12 gap-1 pointer-events-auto ring-1 ring-white/5 mx-auto max-w-fit">
                                    {/* History Cluster */}
                                    <div className="flex items-center border-r border-white/10 pr-1 mr-1 px-1">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleUndo(); }}
                                            disabled={!canUndo}
                                            className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all duration-300 relative group ${canUndo ? 'hover:bg-white/10 text-white cursor-pointer active:scale-90' : 'text-zinc-800 cursor-not-allowed'}`}
                                            title="Undo"
                                        >
                                            <Undo2 size={16} />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleRedo(); }}
                                            disabled={!canRedo}
                                            className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all duration-300 relative group ${canRedo ? 'hover:bg-white/10 text-white cursor-pointer active:scale-90' : 'text-zinc-800 cursor-not-allowed'}`}
                                            title="Redo"
                                        >
                                            <Redo2 size={16} />
                                        </button>
                                    </div>

                                    {/* Tool Cluster */}
                                    <div className="flex items-center gap-1 relative border-r border-white/10 pr-2 mr-1">
                                        {[
                                            { id: 'select', icon: MousePointer2, label: 'Select' },
                                            ...primaryToolIds.map(id => {
                                                if (id === 'pen') return { id: 'pen', icon: Pen, label: 'Pen' };
                                                if (id === 'arrow') return { id: 'arrow', icon: MoveUpRight, label: 'Arrow' };
                                                if (id === 'rect') return { id: 'rect', icon: Square, label: 'Rect' };
                                                if (id === 'circle') return { id: 'circle', icon: Circle, label: 'Circle' };
                                                return null;
                                            }).filter((t): t is { id: string, icon: any, label: string } => !!t)
                                        ].map((t) => (
                                            <button
                                                key={t.id}
                                                onClick={() => {
                                                    if (t.id === 'tag') {
                                                        if (tool === 'tag') {
                                                            setIsTagTrayOpen(!isTagTrayOpen);
                                                        } else {
                                                            setTool('tag');
                                                            setIsTagTrayOpen(true);
                                                        }
                                                    } else {
                                                        setTool(t.id as Tool);
                                                        setIsTagTrayOpen(false);
                                                    }
                                                }}
                                                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 relative group active:scale-90 ${tool === t.id
                                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/40'
                                                    : 'text-zinc-500 hover:bg-white/5 hover:text-white'
                                                    }`}
                                                title={t.label}
                                            >
                                                <t.icon size={16} />
                                            </button>
                                        ))}
                                    </div>

                                    {/* Tag Cluster */}
                                    <div className="flex items-center relative border-r border-white/10 pr-2 mr-1">
                                        <button
                                            onClick={() => {
                                                if (tool === 'tag') {
                                                    setIsTagTrayOpen(!isTagTrayOpen);
                                                } else {
                                                    setTool('tag');
                                                    setIsTagTrayOpen(true);
                                                }
                                            }}
                                            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 relative group active:scale-90 ${tool === 'tag'
                                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/40'
                                                : 'text-zinc-500 hover:bg-white/5 hover:text-white'
                                                }`}
                                            title="Tag Finding"
                                        >
                                            <Sticker size={16} />
                                        </button>

                                        {/* Dynamic Subtoolbar (Tag tray) */}
                                        <AnimatePresence>
                                            {tool === 'tag' && isTagTrayOpen && (
                                                <motion.div
                                                    initial={{ opacity: 0, y: 10, scale: 0.9 }}
                                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                                    exit={{ opacity: 0, y: 10, scale: 0.9 }}
                                                    className="absolute bottom-full mb-4 left-1/2 -translate-x-1/2 w-80 bg-zinc-950 border border-white/10 p-4 rounded-3xl shadow-2xl flex flex-col gap-4 ring-1 ring-white/10 z-[100]"
                                                >
                                                    <div className="flex justify-between items-center text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">
                                                        <span>Findings Architecture</span>
                                                        <span className="text-zinc-700">{tags.length} TAGS</span>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto no-scrollbar pr-2">
                                                        {tags.map((tag) => (
                                                            <button
                                                                key={tag.id}
                                                                onClick={() => {
                                                                    setActiveTag(tag);
                                                                    setIsTagTrayOpen(false);
                                                                }}
                                                                className={`text-left px-3 py-2.5 rounded-2xl text-[11px] font-bold flex items-center gap-3 transition-all border ${activeTag.id === tag.id
                                                                    ? 'bg-zinc-100 text-black border-white shadow-xl'
                                                                    : 'bg-white/5 text-zinc-400 border-white/5 hover:bg-white/10 hover:text-white'
                                                                    }`}
                                                            >
                                                                <div className="w-2.5 h-2.5 rounded-full shadow-lg" style={{ backgroundColor: tag.color }} />
                                                                <span className="truncate">{tag.label}</span>
                                                            </button>
                                                        ))}
                                                    </div>

                                                    <div className="pt-4 border-t border-white/10">
                                                        <div className="flex gap-2">
                                                            <input
                                                                type="text"
                                                                value={newTagLabel}
                                                                onChange={(e) => setNewTagLabel(e.target.value)}
                                                                placeholder="NAME NEW FINDING..."
                                                                className="flex-1 bg-black/40 border-white/5 text-[10px] font-bold uppercase tracking-widest text-white rounded-xl px-4 py-3 focus:ring-1 focus:ring-blue-500 outline-none placeholder:text-zinc-700 border"
                                                                onKeyDown={(e) => e.key === 'Enter' && handleCreateTag()}
                                                            />
                                                            <button
                                                                onClick={handleCreateTag}
                                                                disabled={!newTagLabel.trim() || isCreatingTag}
                                                                className="bg-blue-600 hover:bg-blue-500 text-white rounded-xl px-5 py-3 text-[10px] font-black uppercase tracking-widest disabled:opacity-50 transition-all active:scale-95 flex items-center justify-center shadow-lg"
                                                            >
                                                                {isCreatingTag ? <Loader2 size={12} className="animate-spin" /> : 'ADD'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>

                                    {/* Zoom Cluster */}
                                    <div className="flex items-center gap-3 px-3 border-r border-white/10 pr-4 mr-1">
                                        <button onClick={(e) => { e.stopPropagation(); handleZoomOut(); }} disabled={zoom <= MIN_ZOOM} className="flex items-center justify-center text-zinc-400 hover:text-white disabled:opacity-20 active:scale-90 transition-all"><ZoomOut size={15} /></button>

                                        <div className="w-20 relative flex items-center justify-center h-full group">
                                            <div className="absolute inset-x-0 h-1 bg-white/10 rounded-full group-hover:bg-white/20 transition-colors" />
                                            <input
                                                type="range"
                                                min={MIN_ZOOM} max={MAX_ZOOM} step="0.1"
                                                value={zoom}
                                                onChange={(e) => setZoom(parseFloat(e.target.value))}
                                                onMouseDown={(e) => e.stopPropagation()}
                                                className="absolute inset-0 w-full opacity-0 cursor-pointer z-10"
                                            />
                                            <div className="absolute left-0 h-1 bg-blue-500 rounded-full" style={{ width: `${((zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)) * 100}%` }} />
                                            <motion.div
                                                className="absolute w-3 h-3 rounded-full bg-white shadow-md pointer-events-none group-hover:scale-110 transition-transform"
                                                animate={{ left: `${((zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)) * 100}%` }}
                                                style={{ x: '-50%' }}
                                            />
                                        </div>

                                        <button onClick={(e) => { e.stopPropagation(); handleZoomIn(); }} disabled={zoom >= MAX_ZOOM} className="flex items-center justify-center text-zinc-400 hover:text-white disabled:opacity-20 active:scale-90 transition-all"><ZoomIn size={15} /></button>

                                        <div className="min-w-[34px] text-center flex items-center justify-center px-1">
                                            <span className="text-[10px] font-bold text-zinc-300 tabular-nums tracking-tighter">{Math.round(zoom * 100)}%</span>
                                        </div>

                                        <div className="w-px h-4 bg-white/10 mx-0.5" />

                                        <button
                                            onClick={(e) => { e.stopPropagation(); setZoom(1); }}
                                            className="flex items-center justify-center text-zinc-400 hover:text-white transition-all active:scale-90 ml-1"
                                            title="Reset Zoom"
                                        >
                                            <RotateCcw size={14} />
                                        </button>
                                    </div>

                                    {/* Action Cluster (Auto-Save Indicator) */}
                                    <div className="flex items-center justify-center px-3 min-w-[100px] h-full">
                                        {saveStatusIndicator === 'saving' ? (
                                            <div className="flex items-center gap-2 text-amber-400">
                                                <Loader2 size={12} className="animate-spin" />
                                                <span className="text-[9px] font-black uppercase tracking-widest">Saving...</span>
                                            </div>
                                        ) : saveStatusIndicator === 'saved' ? (
                                            <div className="flex items-center gap-2 text-emerald-400" >
                                                <CheckCircle2 size={12} />
                                                <span className="text-[9px] font-black uppercase tracking-widest">Saved</span>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2 text-zinc-500">
                                                <Check size={12} />
                                                <span className="text-[9px] font-black uppercase tracking-widest">Auto Saved</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="pb-6 pt-4 flex flex-wrap items-center justify-center gap-3 z-50 pointer-events-none w-full max-w-[90%] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    {/* Video Frame Capture */}
                                    {/* Video Frame Capture Removed */}

                                    {/* Zoom Cluster for Video */}
                                    <div className="bg-zinc-900/95 backdrop-blur-2xl border border-white/10 p-2.5 rounded-2xl shadow-2xl flex items-center gap-4 pointer-events-auto ring-1 ring-white/5 px-4 h-10">
                                        <button onClick={(e) => { e.stopPropagation(); handleZoomOut(); }} disabled={zoom <= MIN_ZOOM} className="flex items-center justify-center text-zinc-400 hover:text-white disabled:opacity-20 active:scale-90 transition-all"><ZoomOut size={16} /></button>

                                        <div className="w-24 relative flex items-center justify-center h-full group">
                                            <div className="absolute inset-x-0 h-1 bg-white/10 rounded-full group-hover:bg-white/20 transition-colors" />
                                            <input
                                                type="range"
                                                min={MIN_ZOOM} max={MAX_ZOOM} step="0.1"
                                                value={zoom}
                                                onChange={(e) => setZoom(parseFloat(e.target.value))}
                                                onMouseDown={(e) => e.stopPropagation()}
                                                className="absolute inset-0 w-full opacity-0 cursor-pointer z-10"
                                            />
                                            <div className="absolute left-0 h-1 bg-blue-500 rounded-full" style={{ width: `${((zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)) * 100}%` }} />
                                            <motion.div
                                                className="absolute w-3.5 h-3.5 rounded-full bg-white shadow-md pointer-events-none group-hover:scale-110 transition-transform"
                                                animate={{ left: `${((zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)) * 100}%` }}
                                                style={{ x: '-50%' }}
                                            />
                                        </div>

                                        <button onClick={(e) => { e.stopPropagation(); handleZoomIn(); }} disabled={zoom >= MAX_ZOOM} className="flex items-center justify-center text-zinc-400 hover:text-white disabled:opacity-20 active:scale-90 transition-all"><ZoomIn size={16} /></button>

                                        <div className="min-w-[34px] text-center flex items-center justify-center">
                                            <span className="text-[10px] font-bold text-zinc-300 tabular-nums tracking-tighter">{Math.round(zoom * 100)}%</span>
                                        </div>

                                        <div className="w-px h-4 bg-white/10 mx-0.5" />

                                        <button
                                            onClick={(e) => { e.stopPropagation(); setZoom(1); }}
                                            className="flex items-center justify-center text-zinc-400 hover:text-white transition-all active:scale-90 ml-1"
                                            title="Reset Zoom"
                                        >
                                            <RotateCcw size={15} />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center text-zinc-600 gap-4 opacity-30 h-full">
                            <FileImage size={64} strokeWidth={1} />
                            <p className="text-[10px] font-black uppercase tracking-[0.3em]">Select an image to preview</p>
                        </div>
                    )}
                </div>
            </div >

            {/* === SIDEBAR (RIGHT) === */}
            {/* === PANEL B: SESSION GALLERY (MIDDLE) === */}
            <div className="w-[320px] bg-[#080808] border-l border-white/5 flex flex-col h-full overflow-hidden shrink-0">
                {/* Segment Selector (Now prominent at the top of middle panel) */}
                {visibleSegments.length > 1 && (
                    <div className="px-6 py-5 border-b border-white/5 bg-black/40">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Select Session</span>
                            <span className="text-[9px] font-bold text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-full">{visibleSegments.length} SEGMENTS</span>
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                            {visibleSegments.map((seg) => (
                                <button
                                    key={seg.id}
                                    onClick={() => setActiveSegment(seg.index)}
                                    className={`h-10 rounded-xl text-[11px] font-black transition-all active:scale-95 border ${activeSegmentIndex === seg.index
                                        ? 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-500/20'
                                        : 'bg-white/5 border-white/5 text-zinc-500 hover:text-zinc-300 hover:bg-white/10'
                                        }`}
                                >
                                    P{seg.index}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Tabs Area */}
                <div className="px-3 py-3 bg-black flex border-b border-white/5">
                    <div className="flex w-full bg-white/5 p-1 rounded-2xl border border-white/5 gap-1">
                        {[
                            { id: 'images' as SidebarTab, label: 'IMG', icon: ImageIcon },
                            { id: 'videos' as SidebarTab, label: 'VID', icon: Video },
                        ].map(tab => {
                            const count = localCaptures.filter(c => {
                                if (activeSegment?.id && c.procedureId && c.procedureId !== activeSegment.id) return false;
                                if (tab.id === 'images') return c.type !== 'video' && !c.deleted;
                                if (tab.id === 'videos') return c.type === 'video' && !c.deleted;
                                return false;
                            }).length;

                            const isActive = sidebarTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setSidebarTab(tab.id as SidebarTab)}
                                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl transition-all relative min-w-0 ${isActive
                                        ? 'bg-zinc-800 text-white shadow-lg'
                                        : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                                        }`}
                                >
                                    <tab.icon size={12} className="shrink-0" />
                                    <span className="text-[9px] font-black uppercase tracking-tighter truncate">{tab.label}</span>
                                    {count > 0 && (
                                        <span className={`absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] flex items-center justify-center text-[9px] font-bold rounded-full border border-black shadow-lg ${isActive ? 'bg-blue-600 text-white' : 'bg-zinc-700 text-zinc-300'
                                            }`}>
                                            {count}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Gallery Scroll Area */}
                <div className="flex-1 overflow-y-auto p-6 bg-[#080808] scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                    {isLoadingMedia ? (
                        <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-4 opacity-50">
                            <Loader2 className="animate-spin" size={24} />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Synchronizing...</span>
                        </div>
                    ) : (
                        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar pt-2">
                            {filteredCaptures.length > 0 ? (
                                <div className="grid grid-cols-2 gap-2 content-start pb-4">
                                    {filteredCaptures.map(c => {
                                        // Check if this image is an Original (source for others)
                                        const isOriginal = localCaptures.some(other => other.originId === c.id && !other.deleted);
                                        // An image is 'Edited' if it has an originId OR is explicitly tagged as report category
                                        const isEdited = c.category === 'report' || !!c.originId;

                                        return (
                                            <div
                                                key={c.id}
                                                onClick={() => setActiveImageId(c.id)}
                                                className={`group relative aspect-square rounded-[22px] overflow-hidden cursor-pointer border-2 transition-all duration-300 shadow-xl ${activeImageId === c.id
                                                    ? 'border-blue-500 shadow-blue-500/10 bg-blue-500/10 ring-4 ring-blue-500/10'
                                                    : 'border-white/5 hover:border-white/20 bg-zinc-950'
                                                    }`}
                                            >
                                                {c.type === 'video' ? (
                                                    <div className="w-full h-full flex items-center justify-center bg-black">
                                                        {c.thumbnailUrl ? (
                                                            <img src={c.thumbnailUrl} className="w-full h-full object-contain transition-transform duration-700 group-hover:scale-110" alt="" />
                                                        ) : (
                                                            <Video size={32} className="text-zinc-800" strokeWidth={1.5} />
                                                        )}
                                                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                            <div className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center">
                                                                <Video size={14} className="text-white fill-white" />
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <img src={c.url} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt="" />
                                                )}

                                                {/* Thumbnail Actions */}
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); sidebarTab === 'trashed' ? restoreCapture(c.id, e) : toggleDelete(c.id, e); }}
                                                        className={`absolute bottom-2 right-2 w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-95 ${sidebarTab === 'trashed' ? 'bg-emerald-500 text-white shadow-emerald-500/40' : 'bg-rose-600 text-white shadow-rose-600/40'}`}
                                                    >
                                                        {sidebarTab === 'trashed' ? <RotateCw size={14} /> : <Trash2 size={14} />}
                                                    </button>

                                                    {sidebarTab !== 'trashed' && c.type !== 'video' && (
                                                        <button
                                                            onClick={(e) => toggleReportSelection(c.id, e)}
                                                            className={`absolute top-2 right-2 w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-95 ${selectedForReport.has(c.id) ? 'bg-blue-600 text-white shadow-blue-500/40' : 'bg-white/20 text-white hover:bg-white/40 backdrop-blur-md'}`}
                                                        >
                                                            {selectedForReport.has(c.id) ? <CheckCircle2 size={14} /> : <FileText size={14} />}
                                                        </button>
                                                    )}
                                                </div>

                                                <div className="absolute bottom-2 left-2 opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0">
                                                    <span className="text-[8px] font-black text-white/50 bg-black/80 px-2 py-1 rounded-lg border border-white/5 uppercase tracking-tighter tabular-nums whitespace-nowrap">
                                                        {c.timestamp?.split(' ')[1] || 'Capt'}
                                                    </span>
                                                </div>

                                                {/* Visual Tags */}
                                                <div className="absolute top-2 left-2 flex flex-col gap-1 items-start">
                                                    {selectedForReport.has(c.id) && (
                                                        <div className="bg-blue-600/90 backdrop-blur-sm px-1.5 py-0.5 rounded-lg text-[6px] font-black text-white tracking-[0.2em] shadow-lg border border-blue-400/50">REPORT</div>
                                                    )}
                                                    {isEdited && (
                                                        <div className="bg-emerald-600/90 backdrop-blur-sm px-1.5 py-0.5 rounded-lg text-[6px] font-black text-white tracking-[0.2em] shadow-lg border-emerald-400/50 flex items-center gap-1">
                                                            <Edit3 size={7} /> EDITED
                                                        </div>
                                                    )}
                                                    {isOriginal && (
                                                        <div className="bg-zinc-600/90 backdrop-blur-sm px-1.5 py-0.5 rounded-lg text-[6px] font-black text-white tracking-[0.2em] shadow-lg border border-zinc-400/50 flex items-center gap-1">
                                                            <Layers size={7} /> ORIGINAL
                                                        </div>
                                                    )}
                                                    {c.type === 'video' && <div className="bg-rose-600 px-1.5 py-0.5 rounded-lg text-[7px] font-black text-white tracking-widest shadow-lg">VID</div>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-4 opacity-20">
                                    <ImageIcon size={48} strokeWidth={1} />
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">No Records Found</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Bin Access Footer */}
                <div className="p-3 bg-black border-t border-white/5 shrink-0">
                    <button
                        onClick={() => setSidebarTab(sidebarTab === 'trashed' ? 'images' : 'trashed')}
                        className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl transition-all border ${sidebarTab === 'trashed' ? 'bg-zinc-800 text-white border-zinc-700' : 'bg-zinc-900/50 text-zinc-500 border-white/5 hover:bg-zinc-900 hover:text-zinc-300 hover:border-white/10'}`}
                    >
                        {sidebarTab === 'trashed' ? <RotateCw size={14} /> : <Trash size={14} />}
                        <span className="text-[10px] font-black uppercase tracking-widest">{sidebarTab === 'trashed' ? 'CLOSE BIN' : 'OPEN BIN'}</span>
                        <span className="bg-zinc-800 px-1.5 py-0.5 rounded text-[9px] font-bold ml-1 text-zinc-400">{localCaptures.filter(c => c.deleted).length}</span>
                    </button>
                </div>
            </div>

            {/* === PANEL C: ACTIONS & CONFIG (RIGHT) === */}
            <div className="w-[300px] bg-[#050505] border-l border-white/5 flex flex-col h-full overflow-hidden shrink-0 shadow-[20px_0_50px_rgba(0,0,0,1)] relative z-30">
                {/* Header Section - Streamlined */}
                <div className="flex items-center justify-between px-5 py-4 bg-[#050505] border-b border-white/5 shrink-0 min-h-[72px]">
                    <div className="flex flex-col">
                        <span className="text-[11px] font-black tracking-widest uppercase leading-none text-blue-500">Annotate Images</span>
                        <span className="text-[8px] font-black text-zinc-600 uppercase tracking-[0.2em] mt-1">Procedure Workflow</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowSettings(true)}
                            className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/5 border border-white/10 text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all active:scale-95 group"
                            title="Settings"
                        >
                            <Settings2 size={16} />
                        </button>
                        <button
                            onClick={() => setShowHomeWarning(true)}
                            className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/5 border border-white/10 text-zinc-500 hover:text-white hover:bg-rose-600 hover:border-rose-400 transition-all active:scale-95 group"
                            title="Exit Annotation Mode"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {/* Quick Controls Section Removed (Moved to Viewport) */}


                {/* Workflow Footer Area - Consolidated */}
                <div className="flex-1 overflow-y-auto no-scrollbar">
                    <div className="p-4 flex flex-col gap-4">
                        <div className="space-y-3">
                            <div className="flex items-center justify-between px-1">
                                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Procedures</span>
                                <span className="text-[8px] font-bold text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-full uppercase">{segments.length} PROCEDURES</span>
                            </div>
                            <div className="flex flex-col gap-4">
                                {visibleSegments.map((seg) => {
                                    const selectedTemplateId = selectedReportTemplates[seg.id] || defaultTemplateId;
                                    const procedureCaptures = localCaptures.filter(c => c.procedureId === seg.id && !c.deleted && selectedForReport.has(c.id));
                                    const rawCount = localCaptures.filter(c => c.procedureId === seg.id && !c.deleted && !selectedForReport.has(c.id)).length;

                                    return (
                                        <div key={seg.id} className={`p-3 rounded-2xl border transition-all ${activeSegment?.id === seg.id ? 'bg-white/10 border-blue-500/30' : 'bg-white/5 border-white/5'}`}>
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <span className={`w-5 h-5 rounded-lg flex items-center justify-center text-[9px] font-black ${activeSegment?.id === seg.id ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-500'}`}>P{seg.index}</span>
                                                    <span className="text-[10px] font-black text-white">Procedure Type</span>
                                                </div>
                                                <div className="flex flex-col items-end">
                                                    <span className="text-[8px] font-bold text-zinc-500">{procedureCaptures.length} Selected</span>
                                                    <span className="text-[7px] font-medium text-zinc-700">{rawCount} Raw</span>
                                                </div>
                                            </div>

                                            <div className="relative group">
                                                <select
                                                    value={selectedTemplateId}
                                                    onChange={(e) => setSelectedReportTemplates(prev => ({ ...prev, [seg.id]: e.target.value }))}
                                                    className="w-full h-10 bg-zinc-900 border border-white/5 hover:border-blue-500/50 text-white text-[10px] font-black rounded-xl px-10 appearance-none outline-none transition-all"
                                                >
                                                    {getReportTemplates().map(t => (
                                                        <option key={t.id} value={t.id}>{t.name.toUpperCase()}</option>
                                                    ))}
                                                </select>
                                                <Layout size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                                                <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                                            </div>

                                            {procedureCaptures.length === 0 && (
                                                <div className="mt-2 flex items-center gap-2 px-1">
                                                    <AlertCircle size={9} className="text-amber-500" />
                                                    <span className="text-[7px] font-bold text-amber-500/70 uppercase">No images selected</span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-[#050505] border-t border-white/5">
                    {(() => {
                        const isReady = selectedForReport.size > 0;

                        return (
                            <button
                                onClick={() => {
                                    if (!isReady) return;
                                    if (onGenerateReport) {
                                        const finalSelections = localCaptures.filter(c => !c.deleted && selectedForReport.has(c.id));

                                        if (finalSelections.length < 4) {
                                            setShowImageWarning(true);
                                            return;
                                        }

                                        onGenerateReport(
                                            finalSelections.map(c => c.id),
                                            selectedReportTemplates,
                                            finalSelections
                                        );
                                    }
                                }}
                                disabled={!isReady}
                                className={`w-full h-16 rounded-2xl text-[12px] font-black uppercase tracking-[0.2em] transition-all flex flex-col items-center justify-center gap-0.5 shadow-xl active:scale-95 border-b-2 ${isReady
                                    ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/20 border-blue-800'
                                    : 'bg-zinc-900 text-zinc-600 border-zinc-800 cursor-not-allowed opacity-50'
                                    }`}
                            >
                                <span>Finish Annotate</span>
                                <span className={`text-[10px] font-medium normal-case tracking-normal ${isReady ? 'text-white/50' : 'text-zinc-700'}`}>
                                    {isReady ? "Go to Report" : "Select images for report"}
                                </span>
                            </button>
                        );
                    })()}
                </div>
            </div>

            {/* Image Count Warning Modal */}
            <AnimatePresence>
                {showImageWarning && (
                    <>
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowImageWarning(false)} className="fixed inset-0 z-[210] bg-black/80 backdrop-blur-xl" />
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[220] w-[400px] bg-zinc-950 border border-white/10 p-10 rounded-[40px] shadow-2xl flex flex-col items-center text-center gap-6"
                        >
                            <div className="w-20 h-20 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                                <AlertCircle size={40} className="text-amber-500" />
                            </div>
                            <div className="space-y-2">
                                <h2 className="text-2xl font-semibold tracking-tight text-white">Fewer than 4 Images</h2>
                                <p className="text-zinc-400 text-sm font-normal leading-relaxed">
                                    You have selected fewer than 4 images. A standard report typically includes 4 images. Do you want to proceed anyway?
                                </p>
                            </div>
                            <div className="grid grid-cols-2 gap-4 w-full pt-4">
                                <button onClick={() => setShowImageWarning(false)} className="h-14 rounded-2xl bg-white/5 border border-white/10 text-white text-xs font-bold uppercase tracking-wider hover:bg-white/10 transition-all">Cancel</button>
                                <button
                                    onClick={() => {
                                        setShowImageWarning(false);
                                        if (onGenerateReport) {
                                            const finalSelections = localCaptures.filter(c => !c.deleted && selectedForReport.has(c.id));
                                            onGenerateReport(finalSelections.map(c => c.id), selectedReportTemplates, finalSelections);
                                        }
                                    }}
                                    className="h-14 rounded-2xl bg-amber-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-amber-500 transition-all shadow-xl shadow-amber-900/20"
                                >
                                    Proceed
                                </button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* Home Warning Modal */}
            <AnimatePresence>
                {
                    showHomeWarning && (
                        <>
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowHomeWarning(false)} className="fixed inset-0 z-[210] bg-black/80 backdrop-blur-xl" />
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.9, opacity: 0 }}
                                className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[220] w-[400px] bg-zinc-950 border border-white/10 p-10 rounded-[40px] shadow-2xl flex flex-col items-center text-center gap-6"
                            >
                                <div className="w-20 h-20 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                                    <AlertCircle size={40} className="text-amber-500" />
                                </div>
                                <div className="space-y-2">
                                    <h2 className="text-2xl font-semibold tracking-tight text-white">Exit Annotation Mode?</h2>
                                    <p className="text-zinc-400 text-sm font-normal leading-relaxed">
                                        {hasUnsavedChanges
                                            ? "You have unsaved edits. Exiting now will discard unsaved annotations and return you to the patient queue."
                                            : "Are you sure you want to return to the patient dashboard?"}
                                    </p>
                                </div>
                                <div className="grid grid-cols-2 gap-4 w-full pt-4">
                                    <button onClick={() => setShowHomeWarning(false)} className="h-14 rounded-2xl bg-white/5 border border-white/10 text-white text-xs font-bold uppercase tracking-wider hover:bg-white/10 transition-all">Cancel</button>
                                    <button onClick={() => { setShowHomeWarning(false); onClose(); }} className="h-14 rounded-2xl bg-rose-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-rose-500 transition-all shadow-xl shadow-rose-900/20">Exit Now</button>
                                </div>
                            </motion.div>
                        </>
                    )
                }
            </AnimatePresence>

            {/* Settings Compact Dropdown */}
            <AnimatePresence>
                {
                    showSettings && (
                        <>
                            <div className="fixed inset-0 z-[90] bg-transparent" onClick={() => setShowSettings(false)} />
                            <motion.div
                                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                                className="absolute top-[80px] right-6 z-[100] w-[280px] bg-zinc-950 border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden ring-1 ring-white/10"
                            >
                                <div className="p-4 border-b border-white/5 bg-zinc-900/50 flex flex-col gap-1">
                                    <h3 className="text-[11px] font-black uppercase tracking-widest text-white">Configuration</h3>
                                    <p className="text-[9px] text-zinc-500">Customize toolbar and defaults</p>
                                </div>

                                <div className="p-4 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                                    {/* Primary Tools Selection */}
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center">
                                            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Primary Shapes (Max 4)</span>
                                            <span className="text-[9px] font-bold text-blue-500">{primaryToolIds.length}/4</span>
                                        </div>
                                        <div className="grid grid-cols-4 gap-2">
                                            {[
                                                { id: 'pen', icon: Pen }, { id: 'arrow', icon: MoveUpRight },
                                                { id: 'rect', icon: Square }, { id: 'circle', icon: Circle }
                                            ].map(t => {
                                                const isSelected = primaryToolIds.includes(t.id);
                                                return (
                                                    <button
                                                        key={t.id}
                                                        onClick={() => {
                                                            if (isSelected) {
                                                                setPrimaryToolIds(prev => prev.filter(p => p !== t.id));
                                                            } else {
                                                                if (primaryToolIds.length < 4) {
                                                                    setPrimaryToolIds(prev => [...prev, t.id]);
                                                                }
                                                            }
                                                        }}
                                                        disabled={!isSelected && primaryToolIds.length >= 4}
                                                        className={`aspect-square rounded-xl flex items-center justify-center transition-all ${isSelected
                                                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                                                            : 'bg-white/5 text-zinc-500 hover:bg-white/10 hover:text-zinc-300 disabled:opacity-20 disabled:cursor-not-allowed'
                                                            }`}
                                                    >
                                                        <t.icon size={16} />
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>

                                    {/* Color Palette */}
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Default Shape Color</span>
                                            <div className="grid grid-cols-6 gap-2">
                                                {['#ef4444', '#f97316', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#ffffff', '#000000', '#9ca3af'].map((c) => (
                                                    <button
                                                        key={c}
                                                        onClick={() => setColor(c)}
                                                        className={`aspect-square rounded-full border border-white/10 transition-transform hover:scale-110 flex items-center justify-center ${color === c ? 'ring-2 ring-white scale-110' : ''}`}
                                                        style={{ backgroundColor: c }}
                                                    >
                                                        {color === c && <Check size={10} className={c === '#ffffff' ? 'text-black' : 'text-white'} />}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Tag Text Color</span>
                                            <div className="flex flex-wrap gap-2">
                                                {['#ffffff', '#000000', '#ef4444', '#f59e0b', '#10b981', '#3b82f6'].map((c) => (
                                                    <button
                                                        key={c}
                                                        onClick={() => setTagFontColor(c)}
                                                        className={`w-6 h-6 rounded-full border border-white/10 transition-transform hover:scale-110 flex items-center justify-center ${tagFontColor === c ? 'ring-2 ring-white scale-110' : ''}`}
                                                        style={{ backgroundColor: c }}
                                                    >
                                                        {tagFontColor === c && <Check size={8} className={c === '#ffffff' ? 'text-black' : 'text-white'} />}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Sliders */}
                                    <div className="space-y-5">
                                        {/* Sliders */}
                                        <div className="space-y-6">
                                            <SliderField
                                                label="Stroke"
                                                value={thickness}
                                                min={1}
                                                max={20}
                                                onChange={setThickness}
                                                unit="px"
                                            />

                                            <SliderField
                                                label="Opacity"
                                                value={opacity}
                                                min={0.1}
                                                max={1}
                                                step={0.05}
                                                onChange={setOpacity}
                                                displayValue={`${Math.round(opacity * 100)}%`}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        </>
                    )
                }
            </AnimatePresence>

            {
                notification?.message && (
                    <div className={`fixed bottom-10 left-10 px-6 py-4 rounded-2xl shadow-2xl text-white text-[11px] font-black uppercase tracking-widest animate-in fade-in slide-in-from-bottom-6 z-[200] border backdrop-blur-xl ${notification.type === 'success'
                        ? 'bg-emerald-600/90 border-emerald-400/50 shadow-emerald-900/20'
                        : notification.type === 'warning'
                            ? 'bg-amber-600/90 border-amber-400/50 shadow-amber-900/20'
                            : 'bg-rose-600/90 border-rose-400/50 shadow-rose-900/20'
                        }`}>
                        {notification.message}
                    </div>
                )
            }
        </div >
    );
}

// Keep Transformer component (not touched for logic preservation)
