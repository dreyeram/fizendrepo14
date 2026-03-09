"use client";

import React, { useState, useEffect, useRef } from "react";
import {
    Camera, Clock, FileText, Move3d, PanelRightOpen, Plus,
    RotateCcw, Settings2, StopCircle, User, Video,
    ZoomIn, ZoomOut, ArrowLeft, AlertCircle, ChevronDown, X
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

// ═══════════════════════════════════════════════════════════
//  ProcedureToolPanel v5 — Right-Side Control Panel (Clean)
// ═══════════════════════════════════════════════════════════

interface Capture {
    id: string;
    timestamp: string;
    url: string;
    type?: "image" | "video";
    thumbnailUrl?: string;
    category?: string;
    segmentIndex?: number;
    selected?: boolean;
    [key: string]: any;
}

interface Segment {
    id: string;
    index: number;
    status: string;
}

export interface ProcedureToolPanelProps {
    patient: any;
    timer: number;
    timerDisplayRef?: React.RefObject<HTMLSpanElement | null>;
    formatTime: (t: number) => string;
    onCapture: () => void;
    onToggleRecording: () => void;
    isRecording: boolean;
    zoom: number;
    zoomRange: { min: number; max: number };
    onZoomChange: (z: number) => void;
    frozenFrame: string | null;
    onToggleFreeze: () => void;
    isCompareMode: boolean;
    onToggleCompare: () => void;
    segments: Segment[];
    activeSegmentIndex: number;
    onSetActiveSegment: (i: number) => void;
    onAddSegment: () => void;
    captures: Capture[];
    onOpenStudio: (cap: Capture) => void;
    onPlayVideo: (cap: Capture) => void;
    history: any[];
    comparisonImage: string | null;
    onSelectComparisonImage: (url: string | null, isHistory?: boolean) => void;
    onBack: () => void;
    onEndProcedure: () => void;
    duration?: string;
    historyExpanded?: boolean;
    setHistoryExpanded?: (v: boolean) => void;
    settings: any;
    updateSetting: (key: any, value: any) => void;
    onOpenScopeSettings?: () => void;
}

export default function ProcedureToolPanel({
    patient, timer, timerDisplayRef, formatTime,
    onCapture, onToggleRecording, isRecording,
    zoom, zoomRange, onZoomChange,
    frozenFrame, onToggleFreeze,
    isCompareMode, onToggleCompare,
    historyExpanded = false, setHistoryExpanded = () => { },
    settings, updateSetting,
    segments, activeSegmentIndex, onSetActiveSegment, onAddSegment,
    captures, onOpenStudio, onPlayVideo,
    history, comparisonImage, onSelectComparisonImage,
    onBack, onEndProcedure, onOpenScopeSettings,
}: ProcedureToolPanelProps) {
    const [activeView, setActiveView] = useState<"images" | "videos">("images");
    const [historyTabs, setHistoryTabs] = useState<{ [procedureId: string]: "image" | "video" | "report" }>({});
    const [activePdfUrl, setActivePdfUrl] = useState<string | null>(null);

    const currentProcId = `P${activeSegmentIndex}`;

    // Filter captures by active segment
    const currentCaptures = captures.filter(c => {
        const match = c.segmentIndex !== undefined
            ? c.segmentIndex === activeSegmentIndex
            : (c.category === currentProcId || (!c.category && activeSegmentIndex === 0));
        return match;
    });

    const imageCaptures = currentCaptures.filter(c => c.type === "image" || !c.type);
    const videoCaptures = currentCaptures.filter(c => c.type === "video");

    useEffect(() => {
        console.log("[ProcedureToolPanel] Props update:", {
            totalCaptures: captures.length,
            activeSegmentIndex,
            currentCapturesCount: currentCaptures.length,
            imageCount: imageCaptures.length
        });
        if (captures.length > 0 && currentCaptures.length === 0) {
            console.warn("[ProcedureToolPanel] Filtering mismatch! Samples:", captures.slice(0, 2).map(c => ({ id: c.id, segIdx: c.segmentIndex, cat: c.category })));
        }
    }, [captures, activeSegmentIndex, currentCaptures.length, imageCaptures.length]);

    return (
        <>
            <aside className="w-full h-full bg-zinc-950 flex flex-col overflow-hidden select-none relative z-50 pointer-events-auto">

                {/* ══════════════════════════════════════════
                    1. HEADER
                ══════════════════════════════════════════ */}
                <div className="flex flex-col bg-zinc-900/40 backdrop-blur-xl border-b border-white/5 shrink-0 relative">

                    {/* HEADER ROW: [Exit] [Timer] [End] */}
                    <div className="flex items-center justify-between px-3 py-2.5 min-h-[48px] relative z-20">
                        {/* LEFT: Exit */}
                        <div className="flex items-center min-w-[60px] gap-2">
                            <button
                                onClick={onBack}
                                className="p-1.5 rounded-lg bg-rose-950/50 hover:bg-rose-900 border border-rose-500/20 text-rose-400 hover:text-white transition-all shadow-lg"
                                title="Exit Procedure"
                            >
                                <ArrowLeft size={16} />
                            </button>
                            {zoom > 1.01 && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.8 }}
                                    className="px-2.5 py-1 rounded-full bg-amber-500/20 border border-amber-400/40 shadow-[0_0_14px_rgba(234,179,8,0.35)] backdrop-blur-md"
                                >
                                    <span className="text-[10px] font-black text-amber-300 tabular-nums tracking-wide">
                                        {(zoom || 1).toFixed(2)}x
                                    </span>
                                </motion.div>
                            )}
                        </div>

                        {/* CENTER: Timer */}
                        <div className="absolute left-1/2 -translate-x-1/2">
                            <div className={`flex items-center gap-2.5 h-9 px-4 rounded-xl border backdrop-blur-md shadow-inner transition-colors ${isRecording ? "bg-red-950/80 border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.2)]" : "bg-black/40 border-white/10"}`}>
                                {isRecording ? (
                                    <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_#ef4444]" />
                                ) : (
                                    <Clock size={12} className="text-emerald-400" />
                                )}
                                <span ref={timerDisplayRef} className={`text-sm font-mono font-bold tabular-nums leading-none tracking-tight ${isRecording ? "text-red-400" : "text-white"}`}>
                                    {formatTime(timer)}
                                </span>
                            </div>
                        </div>

                        {/* RIGHT: Scope Settings & End Button */}
                        <div className="flex items-center gap-3">
                            {onOpenScopeSettings && (
                                <button
                                    onClick={onOpenScopeSettings}
                                    className="h-9 px-3 rounded-xl bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 font-bold text-[10px] uppercase tracking-wider flex items-center gap-1.5 shadow-lg shadow-indigo-500/10 transition-all active:scale-95 border border-indigo-500/30"
                                    title="Open Scope Settings"
                                >
                                    <Settings2 size={14} />
                                </button>
                            )}
                            <button
                                onClick={onEndProcedure}
                                className="h-9 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-[10px] uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-rose-900/40 transition-all active:scale-95 border border-rose-500/50"
                            >
                                <div className="w-2 h-2 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
                                <span>End</span>
                            </button>
                        </div>
                    </div>

                    {/* ROW 2: Patient Info & Session Tabs */}
                    <div className="flex flex-col px-4 py-2 bg-black/40 border-t border-white/5 relative z-10 shrink-0">
                        {/* Patient Info */}
                        <div className="flex items-center min-w-0 mb-2 mt-1">
                            <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                                <span className="text-[14px] font-bold text-white truncate leading-none" title={patient.name}>{patient.name}</span>
                                <span className="text-white/10 text-[10px] font-thin">|</span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="text-[10px] font-black text-zinc-500 uppercase tracking-tighter tabular-nums whitespace-nowrap">
                                        {(patient.age !== undefined && patient.age !== null) ? `${patient.age}Y` : "??Y"} · {patient.gender?.[0] || patient.gender || "U"}
                                    </span>
                                    <span className="text-white/10 text-[10px] font-thin">|</span>
                                    <span className="text-[10px] font-mono font-black text-indigo-400/50 truncate" title="Patient MRN / ID">
                                        {patient.mrn || patient.refId || `#${patient.id.slice(-4)}`}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Session Tabs */}
                        <div className="flex items-center gap-2 pb-1.5">
                            <div className="flex-1 overflow-x-auto scroll-smooth custom-scrollbar-h">
                                <div className="flex items-center gap-1.5 pr-4 pb-1">
                                    {segments.sort((a, b) => a.index - b.index).map((s, idx) => {
                                        const pid = `P${idx + 1}`;
                                        const isActive = s.index === activeSegmentIndex;
                                        return (
                                            <button
                                                key={`segment-tab-${idx}-${s.id || s.index}`}
                                                onClick={() => onSetActiveSegment(s.index)}
                                                className={`h-7 px-3.5 rounded-lg text-[10px] font-black transition-all active:scale-95 shrink-0 ${isActive
                                                    ? "bg-white text-black shadow-[0_4px_12px_rgba(255,255,255,0.2)]"
                                                    : "bg-white/5 text-zinc-500 hover:text-white hover:bg-white/10"
                                                    }`}
                                            >
                                                {pid}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <button
                                onClick={onAddSegment}
                                className="w-8 h-7 rounded-lg flex items-center justify-center bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/20 transition-all active:scale-95 shrink-0 shadow-lg shadow-emerald-900/10"
                                title="Add New Session"
                            >
                                <Plus size={14} strokeWidth={3} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* ══════════════════════════════════════════
                    2. SESSION GALLERY
                ══════════════════════════════════════════ */}
                <div className="flex flex-col flex-1 min-h-0 border-b border-white/5">
                    <div className="px-6 py-3 border-b border-white/5 bg-white/[0.01]">
                        <div className="flex p-1 bg-white/5 rounded-xl border border-white/5">
                            <button
                                onClick={() => setActiveView("images")}
                                className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${activeView === "images" ? "bg-white text-black shadow-md" : "text-zinc-500 hover:text-zinc-300"}`}
                            >
                                Images <span className="opacity-50 ml-1">({imageCaptures.length})</span>
                            </button>
                            <button
                                onClick={() => setActiveView("videos")}
                                className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${activeView === "videos" ? "bg-white text-black shadow-md" : "text-zinc-500 hover:text-zinc-300"}`}
                            >
                                Videos <span className="opacity-50 ml-1">({videoCaptures.length})</span>
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 bg-[#0A0A0A] min-h-0 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                        {activeView === "images" && (
                            <div className="grid grid-cols-2 gap-3 min-h-0">
                                {imageCaptures.map((cap, i) => (
                                    <div key={cap.id || i} className="aspect-square rounded-[24px] bg-zinc-900/50 border border-white/5 overflow-hidden group cursor-pointer relative shadow-lg hover:border-indigo-500/50 hover:shadow-indigo-500/10 transition-all duration-300">
                                        <img src={cap.url} onClick={() => onOpenStudio(cap)} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" alt="" />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onSelectComparisonImage(cap.url, false); }}
                                            className="absolute top-3 right-3 w-9 h-9 rounded-2xl bg-black/40 backdrop-blur-xl border border-white/10 flex items-center justify-center text-white/70 hover:text-white hover:bg-indigo-600 transition-all opacity-0 translate-y-[-10px] group-hover:opacity-100 group-hover:translate-y-0 z-10"
                                            title="Compare with live feed"
                                        >
                                            <Move3d size={16} />
                                        </button>
                                        <div className="absolute bottom-3 left-3 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
                                            <span className="text-[9px] font-black text-white/50 uppercase tracking-widest bg-black/40 backdrop-blur-md px-2 py-1 rounded-lg border border-white/5">
                                                {cap.timestamp?.split(" ")[1] || "Captured"}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                                {imageCaptures.length === 0 && (
                                    <div className="col-span-2 py-16 flex flex-col items-center justify-center gap-3 opacity-20">
                                        <Camera size={32} strokeWidth={1} />
                                        <span className="text-[10px] font-bold uppercase tracking-[0.2em]">No Media Captured</span>
                                    </div>
                                )}
                            </div>
                        )}
                        {activeView === "videos" && (
                            <div className="grid grid-cols-2 gap-3">
                                {videoCaptures.map((cap, i) => (
                                    <div key={cap.id || i} onClick={() => onPlayVideo(cap)} className="aspect-video rounded-[24px] bg-zinc-900/50 border border-white/5 overflow-hidden group cursor-pointer relative shadow-lg hover:border-indigo-500/50 transition-all duration-300">
                                        {cap.thumbnailUrl ? (
                                            <img src={cap.thumbnailUrl} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" alt="" />
                                        ) : (
                                            <video src={cap.url} className="w-full h-full object-cover" />
                                        )}
                                        <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors" />
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <div className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center transition-all group-hover:scale-110 group-hover:bg-indigo-500 group-hover:border-indigo-400">
                                                <Video size={18} className="fill-white text-white translate-x-0.5" />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* ══════════════════════════════════════════
                    3. HISTORY TRIGGER
                ══════════════════════════════════════════ */}
                <div className="flex flex-col shrink-0 border-t border-white/5 bg-zinc-900/40 backdrop-blur-xl h-12 relative z-30">
                    <button
                        onClick={() => setHistoryExpanded(!historyExpanded)}
                        className="px-6 h-full flex justify-between items-center hover:bg-white/10 transition-colors shrink-0"
                    >
                        <div className="flex items-center gap-2">
                            <Clock size={14} className="text-zinc-500" />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Patient History</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">{history.length} Cases</span>
                            <ChevronDown size={14} className={`text-zinc-500 transition-transform duration-500 ${historyExpanded ? "rotate-180" : ""}`} />
                        </div>
                    </button>
                </div>

                {/* ══════════════════════════════════════════
                    4. CONTROLS FOOTER
                ══════════════════════════════════════════ */}
                <div className="flex flex-col bg-[#050505] border-t border-white/5 shrink-0 relative z-[60] shadow-[0_-20px_60px_rgba(0,0,0,0.8)] px-8 pb-10 pt-6">

                    {/* Scope Zoom Control */}
                    <div className="mb-4 px-5 py-3 rounded-xl bg-white/[0.03] border border-white/5 transition-all">
                        <div className="flex items-center justify-between mb-2.5">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">Scope Zoom</span>
                                <button
                                    onClick={() => onZoomChange(1)}
                                    className="w-5 h-5 rounded-md flex items-center justify-center bg-white/5 hover:bg-white/10 text-zinc-500 hover:text-white transition-all active:scale-90"
                                    title="Reset Zoom"
                                >
                                    <RotateCcw size={10} />
                                </button>
                            </div>
                            <span className="text-[11px] font-mono font-bold text-white tabular-nums">{(zoom || 1).toFixed(2)}x</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <ZoomOut size={12} className="text-zinc-600 shrink-0" />
                            <div className="flex-1 relative h-4 flex items-center">
                                <div className="absolute inset-x-0 h-1 bg-white/10 rounded-full top-1/2 -translate-y-1/2" />
                                <motion.div
                                    className="h-1 bg-white rounded-full absolute left-0 top-1/2 -translate-y-1/2 pointer-events-none"
                                    initial={false}
                                    animate={{ width: `${(((zoom || 1) - (zoomRange.min)) / ((zoomRange.max) - (zoomRange.min))) * 100}%` }}
                                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                />
                                <input
                                    type="range"
                                    min={zoomRange.min}
                                    max={zoomRange.max}
                                    step={0.01}
                                    value={zoom || 1}
                                    onChange={(e) => onZoomChange(parseFloat(e.target.value))}
                                    className="absolute inset-0 w-full opacity-0 cursor-pointer z-10"
                                />
                                <motion.div
                                    className="absolute top-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-[0_2px_10px_rgba(0,0,0,0.5)] pointer-events-none ring-4 ring-black/20"
                                    initial={false}
                                    animate={{ left: `${(((zoom || 1) - (zoomRange.min)) / ((zoomRange.max) - (zoomRange.min))) * 100}%` }}
                                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                    style={{ transform: 'translate(-50%, -50%)' }}
                                />
                            </div>
                            <ZoomIn size={12} className="text-zinc-600 shrink-0" />
                        </div>
                    </div>

                    {/* Main Action Buttons */}
                    <div className="flex items-center justify-center gap-8">
                        {/* Recording Button */}
                        <div className="flex flex-col items-center gap-3">
                            <button
                                onClick={onToggleRecording}
                                className={`w-14 h-14 rounded-[20px] border flex items-center justify-center transition-all duration-300 relative group overflow-hidden ${isRecording ? "bg-rose-500 border-rose-400 shadow-[0_0_30px_rgba(244,63,94,0.3)] ring-4 ring-rose-500/10" : "bg-zinc-900 border-white/5 hover:border-white/10 hover:bg-zinc-800"}`}
                            >
                                <div className={`transition-all duration-300 ${isRecording ? "w-4 h-4 rounded-sm bg-white" : "w-5 h-5 rounded-full bg-rose-600 group-hover:scale-110"}`} />
                                {isRecording && <div className="absolute inset-0 bg-white/20 animate-pulse" />}
                            </button>
                            <span className={`text-[10px] font-black uppercase tracking-[0.2em] transition-colors ${isRecording ? "text-rose-500" : "text-zinc-600"}`}>
                                {isRecording ? "Stop" : "Record"}
                            </span>
                        </div>

                        {/* CAPTURE BUTTON (MAIN) */}
                        <div className="flex flex-col items-center gap-4">
                            <button
                                onClick={() => {
                                    console.log("[ProcedureToolPanel] CAPTURE button clicked!");
                                    onCapture();
                                }}
                                className="w-20 h-20 rounded-[30px] bg-white text-black shadow-[0_20px_50px_rgba(255,255,255,0.2)] hover:shadow-[0_25px_60px_rgba(255,255,255,0.3)] flex items-center justify-center border-[4px] border-black/5 ring-1 ring-white/50 relative overflow-hidden transition-all active:scale-90 group active:shadow-inner"
                            >
                                <div className="absolute inset-0 bg-gradient-to-tr from-black/5 via-transparent to-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                                <Camera size={32} className="text-black relative z-10" strokeWidth={2.5} />
                            </button>
                            <span className="text-[11px] font-black uppercase tracking-[0.3em] text-white">Capture</span>
                        </div>

                        {/* FREEZE BUTTON */}
                        <div className="flex flex-col items-center gap-3">
                            <button
                                onClick={onToggleFreeze}
                                className={`w-14 h-14 rounded-[20px] border flex items-center justify-center transition-all duration-300 group ${frozenFrame ? "bg-cyan-500 border-cyan-400 shadow-[0_0_30px_rgba(6,182,212,0.3)] ring-4 ring-cyan-500/10" : "bg-zinc-900 border-white/5 hover:border-white/10 hover:bg-zinc-800"}`}
                            >
                                <StopCircle size={22} className={`transition-colors duration-300 ${frozenFrame ? "text-white fill-none" : "text-zinc-600 group-hover:text-zinc-400"}`} />
                            </button>
                            <span className={`text-[10px] font-black uppercase tracking-[0.2em] transition-colors ${frozenFrame ? "text-cyan-400" : "text-zinc-600"}`}>
                                {frozenFrame ? "Live" : "Freeze"}
                            </span>
                        </div>
                    </div>
                </div>

                {/* ══════════════════════════════════════════
                    5. HISTORY OVERLAY
                ══════════════════════════════════════════ */}
                <AnimatePresence>
                    {historyExpanded && (
                        <>
                            <motion.div
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                onClick={() => setHistoryExpanded(false)}
                                className="absolute inset-0 z-[40] bg-black/40 backdrop-blur-md"
                            />
                            <motion.div
                                initial={{ y: "100%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: "100%", opacity: 0 }}
                                className="absolute inset-0 z-[70] flex flex-col overflow-hidden bg-zinc-950 border border-white/10 shadow-2xl rounded-[24px]"
                            >
                                <div className="px-6 py-4 flex items-center justify-between border-b border-white/5 bg-white/[0.02]">
                                    <div className="flex items-center gap-3">
                                        <Clock size={16} className="text-indigo-400" />
                                        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white">Full Patient History</span>
                                    </div>
                                    <button onClick={() => setHistoryExpanded(false)} className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-all active:scale-95">
                                        <ChevronDown size={18} />
                                    </button>
                                </div>

                                <div className="flex-1 overflow-y-auto bg-black/20 p-6 space-y-8 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                                    {(() => {
                                        const dates = Array.from(new Set(history.map(h => h.date || "Recent")));
                                        if (dates.length === 0) return (
                                            <div className="h-full flex flex-col items-center justify-center opacity-20 gap-3 py-16">
                                                <FileText size={48} strokeWidth={1} />
                                                <span className="text-[11px] font-bold uppercase tracking-[0.3em]">Empty Medical Archive</span>
                                            </div>
                                        );

                                        return dates.map(date => {
                                            const procedures = history.filter(h => (h.date || "Recent") === date);
                                            return (
                                                <div key={date} className="space-y-4">
                                                    <div className="flex items-center gap-4">
                                                        <span className="text-[10px] font-black text-indigo-400/80 uppercase tracking-widest whitespace-nowrap">{date}</span>
                                                        <div className="h-px w-full bg-white/5" />
                                                    </div>
                                                    <div className="grid gap-5">
                                                        {procedures.map((proc: any, i: number) => {
                                                            const activeTab = historyTabs[proc.id] || (proc.media?.some((m: any) => m.type === "image") ? "image" : proc.media?.some((m: any) => m.type === "video") ? "video" : "report");
                                                            const filteredMedia = (proc.media || []).filter((m: any) => m.type === activeTab);
                                                            const hasImages = (proc.media || []).some((m: any) => m.type === "image");
                                                            const hasVideos = (proc.media || []).some((m: any) => m.type === "video");
                                                            const hasReports = (proc.media || []).some((m: any) => m.type === "report");

                                                            return (
                                                                <div key={proc.id || i} className="bg-white/[0.03] border border-white/5 rounded-[32px] p-5 space-y-4 hover:bg-white/[0.05] transition-all group/card">
                                                                    <div className="flex items-center justify-between">
                                                                        <div className="flex flex-col">
                                                                            <span className="text-[14px] text-white font-bold tracking-tight">{proc.procedure}</span>
                                                                            <span className="text-[10px] text-zinc-500 uppercase font-black tracking-widest mt-1">{proc.doctor}</span>
                                                                        </div>
                                                                    </div>

                                                                    <div className="flex p-1 bg-black/40 rounded-xl border border-white/5">
                                                                        {hasImages && (
                                                                            <button onClick={() => setHistoryTabs(prev => ({ ...prev, [proc.id]: "image" }))}
                                                                                className={`flex-1 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all ${activeTab === "image" ? "bg-white text-black shadow-md" : "text-zinc-500 hover:text-zinc-300"}`}>
                                                                                Images
                                                                            </button>
                                                                        )}
                                                                        {hasVideos && (
                                                                            <button onClick={() => setHistoryTabs(prev => ({ ...prev, [proc.id]: "video" }))}
                                                                                className={`flex-1 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all ${activeTab === "video" ? "bg-white text-black shadow-md" : "text-zinc-500 hover:text-zinc-300"}`}>
                                                                                Videos
                                                                            </button>
                                                                        )}
                                                                        {hasReports && (
                                                                            <button onClick={() => setHistoryTabs(prev => ({ ...prev, [proc.id]: "report" }))}
                                                                                className={`flex-1 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all ${activeTab === "report" ? "bg-white text-black shadow-md" : "text-zinc-500 hover:text-zinc-300"}`}>
                                                                                Reports
                                                                            </button>
                                                                        )}
                                                                    </div>

                                                                    {filteredMedia.length > 0 ? (
                                                                        <div className={activeTab === "image" ? "grid grid-cols-3 gap-3" : "space-y-3"}>
                                                                            {filteredMedia.map((m: any) => (
                                                                                <div
                                                                                    key={m.id}
                                                                                    className={`rounded-[20px] bg-zinc-950 border border-white/10 overflow-hidden cursor-pointer hover:border-indigo-500/50 transition-all relative group shadow-2xl ${activeTab === "image" ? "aspect-square" : activeTab === "video" ? "aspect-video" : "p-4 flex items-center gap-3"}`}
                                                                                    onClick={() => {
                                                                                        if (m.type === "image") onOpenStudio({ ...m, timestamp: date });
                                                                                        else if (m.type === "video") onPlayVideo({ ...m, timestamp: date });
                                                                                        else if (m.type === "report") setActivePdfUrl(m.url);
                                                                                    }}
                                                                                >
                                                                                    {m.type === "image" ? (
                                                                                        <>
                                                                                            <img src={m.url} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt="" />
                                                                                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors pointer-events-none" />
                                                                                            <button
                                                                                                onClick={(e) => { e.stopPropagation(); onSelectComparisonImage(m.url, true); }}
                                                                                                className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/70 hover:text-white hover:bg-indigo-600 transition-all opacity-0 group-hover:opacity-100 z-10"
                                                                                                title="Compare"
                                                                                            >
                                                                                                <Move3d size={12} />
                                                                                            </button>
                                                                                        </>
                                                                                    ) : m.type === "video" ? (
                                                                                        <>
                                                                                            <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                                                                                                <Video size={24} className="text-indigo-400" />
                                                                                            </div>
                                                                                        </>
                                                                                    ) : (
                                                                                        <>
                                                                                            <FileText size={20} className="text-red-400 shrink-0" />
                                                                                            <div className="flex flex-col min-w-0">
                                                                                                <span className="text-[11px] font-bold text-white truncate">{m.title || "PDF Report"}</span>
                                                                                                <span className="text-[9px] text-zinc-500 uppercase tracking-widest">View PDF</span>
                                                                                            </div>
                                                                                        </>
                                                                                    )}
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    ) : (
                                                                        <div className="flex items-center gap-3 py-3 px-4 rounded-2xl bg-white/5 text-[10px] text-zinc-600 font-bold uppercase tracking-widest border border-white/5">
                                                                            <AlertCircle size={12} />
                                                                            No {activeTab}s for this session
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        });
                                    })()}
                                </div>
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>

                {/* PDF Viewer */}
                <AnimatePresence>
                    {activePdfUrl && (
                        <div className="fixed inset-0 z-[1000] bg-black/95 backdrop-blur-2xl flex items-center justify-center p-4 md:p-8" onClick={() => setActivePdfUrl(null)}>
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0, y: 30 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 30 }}
                                onClick={(e) => e.stopPropagation()}
                                className="relative w-full h-full max-w-5xl bg-[#121214] rounded-[32px] border border-white/10 overflow-hidden shadow-[0_32px_128px_rgba(0,0,0,0.8)] flex flex-col"
                            >
                                <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-[#121214] z-20">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-xl bg-red-500/10 flex items-center justify-center">
                                            <FileText size={16} className="text-red-500" />
                                        </div>
                                        <span className="text-xs font-black uppercase tracking-widest text-white">Medical Report Viewer</span>
                                    </div>
                                    <button onClick={() => setActivePdfUrl(null)} className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-red-500 transition-all font-black">
                                        <X size={20} />
                                    </button>
                                </div>
                                <div className="flex-1 relative w-full bg-[#09090b] overflow-hidden">
                                    <iframe src={`${activePdfUrl}#view=FitH&toolbar=0&navpanes=0&scrollbar=0`} className="w-full h-full border-0" title="PDF Report" />
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>
            </aside>

            <style jsx global>{`
                ::-webkit-scrollbar { width: 4px; height: 4px; }
                ::-webkit-scrollbar-track { background: #09090b; }
                ::-webkit-scrollbar-thumb { background: #27272a; border-radius: 4px; }
                .custom-scrollbar-h::-webkit-scrollbar { height: 2px !important; }
                .custom-scrollbar-h::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); }
                input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 12px; height: 12px; border-radius: 50%; background: white; cursor: pointer; box-shadow: 0 0 10px rgba(0,0,0,0.5); }
            `}</style>
        </>
    );
}
