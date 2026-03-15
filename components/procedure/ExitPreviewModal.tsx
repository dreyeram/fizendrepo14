"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Layout, Video, Image as ImageIcon, AlertCircle, LogOut, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Capture {
    id: string;
    url: string;
    type?: "image" | "video";
    timestamp: string;
}

interface ExitPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    captures: Capture[];
    patientName: string;
    duration?: string;
    isWaiting?: boolean;
}

export default function ExitPreviewModal({
    isOpen,
    onClose,
    onConfirm,
    captures,
    patientName,
    duration,
    isWaiting
}: ExitPreviewModalProps) {
    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 20 }}
                        className="relative bg-zinc-900 border border-white/10 w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl"
                    >
                        {/* Status Bar */}
                        <div className="h-1 bg-emerald-500 w-full" />

                        <div className="p-8">
                            <div className="flex items-start justify-between mb-8">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                        <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Exit Procedure</span>
                                    </div>
                                    <h2 className="text-2xl font-bold text-white tracking-tight">Review Session Summary</h2>
                                    <p className="text-zinc-400 text-sm mt-1">Review your captures before returning to the dashboard.</p>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2 rounded-full bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 transition-all"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            {/* Session Info Cards */}
                            <div className="grid grid-cols-2 gap-4 mb-8">
                                <div className="bg-white/5 border border-white/5 rounded-2xl p-4">
                                    <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Patient</span>
                                    <span className="text-sm font-bold text-white uppercase">{patientName}</span>
                                </div>
                                <div className="bg-white/5 border border-white/5 rounded-2xl p-4">
                                    <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Duration</span>
                                    <span className="text-sm font-bold text-white uppercase">{duration || "00:00"}</span>
                                </div>
                            </div>

                            {/* Media Section */}
                            <div className="mb-8">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-[11px] font-black text-white uppercase tracking-widest flex items-center gap-2">
                                        <Layout size={12} className="text-emerald-500" />
                                        Session Captures
                                        <span className="ml-2 px-2 py-0.5 rounded-full bg-zinc-800 text-[9px] text-zinc-400">{captures.length} Items</span>
                                    </h3>
                                </div>

                                {captures.length > 0 ? (
                                    <div className="grid grid-cols-4 gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                        {captures.map((cap, i) => (
                                            <div key={cap.id || i} className="aspect-square rounded-xl bg-black border border-white/10 overflow-hidden relative group">
                                                {cap.type === "video" ? (
                                                    <div className="w-full h-full flex items-center justify-center bg-indigo-500/10">
                                                        <Video size={18} className="text-indigo-400" />
                                                    </div>
                                                ) : (
                                                    <img src={cap.url} className="w-full h-full object-cover transition-transform group-hover:scale-110" alt="" />
                                                )}
                                                <div className="absolute inset-x-0 bottom-0 p-1.5 bg-gradient-to-t from-black/80 to-transparent">
                                                    <span className="text-[8px] font-medium text-white/50">{cap.timestamp}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="h-32 rounded-2xl border border-dashed border-white/10 flex flex-col items-center justify-center text-zinc-500 gap-2">
                                        <AlertCircle size={24} />
                                        <span className="text-[10px] font-bold uppercase tracking-widest">No Media Captured</span>
                                    </div>
                                )}
                            </div>

                            {/* Actions */}
                            <div className="flex gap-4">
                                <button
                                    onClick={onClose}
                                    className="flex-1 px-6 py-4 rounded-2xl bg-zinc-800 text-white font-bold text-xs uppercase tracking-wider hover:bg-zinc-700 transition-all border border-white/5"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={onConfirm}
                                    disabled={isWaiting}
                                    className={cn(
                                        "flex-[2] px-6 py-4 rounded-2xl text-white font-bold text-xs uppercase tracking-wider transition-all shadow-lg flex items-center justify-center gap-2 group",
                                        isWaiting 
                                            ? "bg-zinc-700 cursor-not-allowed opacity-70" 
                                            : "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/20"
                                    )}
                                >
                                    {isWaiting ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                            Saving Media...
                                        </>
                                    ) : (
                                        <>
                                            <LogOut size={16} />
                                            Exit to Dashboard
                                            <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Footer Warning */}
                        <div className="bg-amber-500/10 border-t border-amber-500/20 p-4 flex items-center gap-3">
                            <AlertCircle size={14} className="text-amber-500 shrink-0" />
                            <p className="text-[10px] text-amber-200/70 font-medium">
                                This procedure is still <span className="text-amber-500 font-bold uppercase tracking-tighter">In Progress</span>. You can resume it anytime from the dashboard.
                            </p>
                        </div>
                    </motion.div>
                </div>
            )}

            <style jsx>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #27272a;
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #3f3f46;
                }
            `}</style>
        </AnimatePresence>
    );
}
