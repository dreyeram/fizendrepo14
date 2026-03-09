"use client";

import React, { useState } from "react";
import {
    Clock, ChevronDown, FileText, Video,
    AlertCircle, Search, Calendar, User as UserIcon,
    ArrowRightCircle, Move3d
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface HistoryComparisonViewProps {
    history: any[];
    onSelectImage: (url: string) => void;
}

export default function HistoryComparisonView({ history, onSelectImage }: HistoryComparisonViewProps) {
    const [historyTabs, setHistoryTabs] = useState<{ [procedureId: string]: "image" | "video" | "report" }>({});
    const [searchQuery, setSearchQuery] = useState("");

    const filteredHistory = history.filter(h =>
        h.procedure?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        h.doctor?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        h.date?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const dates = Array.from(new Set(filteredHistory.map(h => h.date || "Recent")));

    return (
        <div className="w-full h-full flex flex-col bg-zinc-950 overflow-hidden">
            {/* Header / Search */}
            <div className="p-4 border-b border-white/5 bg-zinc-900/40 backdrop-blur-md shrink-0">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                            <Clock size={20} />
                        </div>
                        <div>
                            <h3 className="text-sm font-black uppercase tracking-widest text-white">History Browser</h3>
                            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Select image for Image B</p>
                        </div>
                    </div>
                </div>

                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
                    <input
                        type="text"
                        placeholder="Search by date, procedure or doctor..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-black/40 border border-white/5 rounded-xl py-2 pl-10 pr-4 text-[11px] text-white focus:outline-none focus:border-indigo-500/50 transition-all placeholder:text-zinc-700"
                    />
                </div>
            </div>

            {/* Scrollable List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                {dates.length > 0 ? (
                    dates.map(date => {
                        const procedures = filteredHistory.filter(h => (h.date || "Recent") === date);
                        return (
                            <div key={date} className="space-y-4">
                                <div className="flex items-center gap-3 sticky top-0 bg-zinc-950/80 backdrop-blur-sm py-1 z-10">
                                    <Calendar size={12} className="text-indigo-500/50" />
                                    <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{date}</span>
                                    <div className="h-px flex-1 bg-white/5" />
                                </div>

                                <div className="grid gap-4">
                                    {procedures.map((proc: any, i: number) => {
                                        const activeTab = historyTabs[proc.id] || (proc.media?.some((m: any) => m.type === "image") ? "image" : proc.media?.some((m: any) => m.type === "video") ? "video" : "report");
                                        const filteredMedia = (proc.media || []).filter((m: any) => m.type === activeTab);
                                        const hasImages = (proc.media || []).some((m: any) => m.type === "image");
                                        const hasVideos = (proc.media || []).some((m: any) => m.type === "video");

                                        return (
                                            <div key={proc.id || i} className="bg-white/[0.02] border border-white/5 rounded-[24px] overflow-hidden hover:bg-white/[0.04] transition-all group/card">
                                                <div className="p-4 flex flex-col gap-3">
                                                    <div className="flex items-start justify-between">
                                                        <div className="flex flex-col">
                                                            <span className="text-[13px] text-white font-bold leading-tight">{proc.procedure}</span>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <UserIcon size={10} className="text-zinc-600" />
                                                                <span className="text-[9px] text-zinc-500 uppercase font-black tracking-widest">{proc.doctor}</span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="flex p-1 bg-black/40 rounded-xl border border-white/5">
                                                        {hasImages && (
                                                            <button onClick={() => setHistoryTabs(prev => ({ ...prev, [proc.id]: "image" }))}
                                                                className={`flex-1 py-1 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all ${activeTab === "image" ? "bg-indigo-600 text-white shadow-md" : "text-zinc-500 hover:text-zinc-300"}`}>
                                                                Images
                                                            </button>
                                                        )}
                                                        {hasVideos && (
                                                            <button onClick={() => setHistoryTabs(prev => ({ ...prev, [proc.id]: "video" }))}
                                                                className={`flex-1 py-1 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all ${activeTab === "video" ? "bg-indigo-600 text-white shadow-md" : "text-zinc-500 hover:text-zinc-300"}`}>
                                                                Videos
                                                            </button>
                                                        )}
                                                    </div>

                                                    {activeTab === "image" && filteredMedia.length > 0 && (
                                                        <div className="grid grid-cols-3 gap-2">
                                                            {filteredMedia.map((m: any) => (
                                                                <div
                                                                    key={m.id}
                                                                    onClick={() => onSelectImage(m.url)}
                                                                    className="aspect-square rounded-xl bg-black border border-white/10 overflow-hidden cursor-pointer hover:border-indigo-500/50 transition-all relative group shadow-lg"
                                                                >
                                                                    <img src={m.url} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt="" />
                                                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center transition-all">
                                                                        <Move3d size={14} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {activeTab === "video" && filteredMedia.length > 0 && (
                                                        <div className="space-y-2">
                                                            {filteredMedia.map((m: any) => (
                                                                <div key={m.id} className="flex items-center gap-3 p-2 bg-black/20 rounded-xl border border-white/5">
                                                                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                                                                        <Video size={14} className="text-indigo-400" />
                                                                    </div>
                                                                    <span className="text-[10px] text-zinc-400 truncate flex-1">{m.title || "Video Capture"}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="h-full flex flex-col items-center justify-center opacity-20 gap-3 py-16">
                        <AlertCircle size={40} strokeWidth={1} />
                        <span className="text-[11px] font-bold uppercase tracking-[0.3em]">No results found</span>
                    </div>
                )}
            </div>
        </div>
    );
}
