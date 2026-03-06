"use client";

// =============================================================================
//  FloatingToolbarIcon.tsx  ·  Mac-style Floating Collapsed Toolbar
//
//  Shown when the right-side ProcedureToolPanel is collapsed.
//  Displays capture/video count badges and expands the toolbar on click.
// =============================================================================

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, Video, PanelRightOpen } from "lucide-react";

interface FloatingToolbarIconProps {
    imageCount: number;
    videoCount: number;
    isRecording: boolean;
    onExpand: () => void;
}

export default function FloatingToolbarIcon({
    imageCount,
    videoCount,
    isRecording,
    onExpand,
}: FloatingToolbarIconProps) {
    return (
        <motion.div
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 20, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="fixed right-3 top-1/2 -translate-y-1/2 z-[90] flex flex-col items-center gap-2"
        >
            {/* Main Expand Button */}
            <button
                onClick={onExpand}
                className="group relative w-12 h-12 rounded-2xl bg-zinc-900/90 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)] flex items-center justify-center hover:bg-zinc-800/90 hover:border-white/20 hover:shadow-[0_8px_40px_rgba(0,0,0,0.6)] transition-all duration-200 active:scale-95"
                title="Expand Toolbar (T)"
            >
                <PanelRightOpen
                    size={18}
                    className="text-zinc-400 group-hover:text-white transition-colors"
                />

                {/* Pulse ring when recording */}
                {isRecording && (
                    <div className="absolute inset-0 rounded-2xl border-2 border-red-500/50 animate-pulse" />
                )}
            </button>

            {/* Image Count Badge */}
            <AnimatePresence>
                {imageCount > 0 && (
                    <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 500, damping: 25 }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-950/80 backdrop-blur-xl border border-emerald-500/20 shadow-lg"
                        title={`${imageCount} image${imageCount !== 1 ? "s" : ""} captured`}
                    >
                        <Camera size={11} className="text-emerald-400" />
                        <span className="text-[10px] font-black text-emerald-300 tabular-nums leading-none">
                            {imageCount}
                        </span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Video Count Badge */}
            <AnimatePresence>
                {(videoCount > 0 || isRecording) && (
                    <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 500, damping: 25 }}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl backdrop-blur-xl border shadow-lg ${isRecording
                                ? "bg-red-950/80 border-red-500/30"
                                : "bg-blue-950/80 border-blue-500/20"
                            }`}
                        title={
                            isRecording
                                ? "Recording in progress..."
                                : `${videoCount} video${videoCount !== 1 ? "s" : ""} recorded`
                        }
                    >
                        <Video
                            size={11}
                            className={isRecording ? "text-red-400 animate-pulse" : "text-blue-400"}
                        />
                        <span
                            className={`text-[10px] font-black tabular-nums leading-none ${isRecording ? "text-red-300" : "text-blue-300"
                                }`}
                        >
                            {isRecording ? "REC" : videoCount}
                        </span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Keyboard hint */}
            <div className="mt-1 px-2 py-0.5 rounded-md bg-black/60 border border-white/5">
                <span className="text-[8px] font-bold text-zinc-600 uppercase tracking-widest">T</span>
            </div>
        </motion.div>
    );
}
