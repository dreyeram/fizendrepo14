"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    X, Plus, Star, Trash2, Target, Circle, Square
} from "lucide-react";
import { useScopeStore, CustomScope } from "@/lib/store/scope.store";
import { useConfirm } from "@/lib/hooks/useConfirm";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    isFreezed?: boolean;
}

export function CustomScopeSettingsInterface({ isOpen, onClose, isFreezed }: Props) {
    const {
        scopes, activeScopeId,
        setActiveScopeId, setDefaultScope, removeScope, setDrawingShape, addScope
    } = useScopeStore();
    const confirm = useConfirm();

    const [isChoosingShape, setIsChoosingShape] = useState(false);



    const handleShapeSelect = (shape: 'circle' | 'square') => {
        setDrawingShape(shape);
        setIsChoosingShape(false);
        onClose(); // Close settings → user draws on the feed
    };

    const handleClose = () => {
        setIsChoosingShape(false);
        setDrawingShape(null); // Reset drawing state on close
        onClose();
    };

    const ShapeIcon = ({ shape }: { shape: CustomScope['shape'] }) => {
        if (shape === 'circle') return <Circle size={16} className="text-indigo-400" />;
        if (shape === 'square') return <Square size={16} className="text-indigo-400" />;
        return <Square size={16} className="text-indigo-400" />;
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* ── Backdrop: click anywhere outside the panel to close ── */}
                    <motion.div
                        key="backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-[90]"
                        onClick={handleClose}
                    />

                    {/* ── Sliding Panel ── */}
                    <motion.div
                        key="panel"
                        initial={{ x: "100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "100%" }}
                        transition={{ type: "spring", damping: 28, stiffness: 220 }}
                        className="absolute inset-y-0 right-0 w-80 z-[100] bg-zinc-950 flex flex-col border-l border-white/10 shadow-2xl"
                        onClick={e => e.stopPropagation()} // Prevent backdrop click
                    >
                        {/* Header */}
                        <div className="px-5 py-4 flex items-center justify-between border-b border-white/5 bg-zinc-900/60">
                            <div className="flex items-center gap-2">
                                <Target size={15} className="text-indigo-400" />
                                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white">
                                    {isChoosingShape ? 'Choose Shape' : 'Scope Settings'}
                                </span>
                            </div>
                            <button
                                onClick={handleClose}
                                className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-all active:scale-95"
                            >
                                <X size={15} />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-5 space-y-5 no-scrollbar">
                            <AnimatePresence mode="wait">
                                {!isChoosingShape ? (
                                    /* ── Scope List ── */
                                    <motion.div
                                        key="list"
                                        initial={{ opacity: 0, x: -16 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 16 }}
                                        className="space-y-4"
                                    >


                                        {/* Header Row */}
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Saved Scopes</span>
                                            <button
                                                onClick={() => !isFreezed && setIsChoosingShape(true)}
                                                disabled={isFreezed}
                                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all text-[9px] font-black uppercase tracking-widest
                                                    ${isFreezed
                                                        ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed opacity-50'
                                                        : 'bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 active:scale-95'
                                                    }`}
                                                title={isFreezed ? "Release freeze to add scope" : "Add new custom scope"}
                                            >
                                                <Plus size={11} /> Add Scope
                                            </button>
                                        </div>

                                        {/* Freeze Mode Warning */}
                                        {isFreezed && (
                                            <motion.div
                                                initial={{ opacity: 0, y: -10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3"
                                            >
                                                <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
                                                    <Target size={14} className="text-amber-500" />
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-[10px] font-black text-amber-500 uppercase tracking-wider mb-0.5">Freeze Mode Active</p>
                                                    <p className="text-[9px] text-amber-500/60 font-bold leading-relaxed">
                                                        Drawing a scope requires a live feed. Please release the freeze mode to draw.
                                                    </p>
                                                </div>
                                            </motion.div>
                                        )}

                                        {/* List */}
                                        <div className="grid gap-2">
                                            {scopes.map((scope: CustomScope) => {
                                                const isActive = scope.id === activeScopeId;
                                                return (
                                                    <div
                                                        key={scope.id}
                                                        className={`group relative bg-zinc-900 border rounded-2xl p-3 flex items-center gap-3 transition-all cursor-pointer
                                                            ${isActive
                                                                ? 'border-indigo-500/40 ring-1 ring-indigo-500/20 bg-indigo-500/10'
                                                                : 'border-white/5 hover:bg-zinc-800'
                                                            }`}
                                                        onClick={() => setActiveScopeId(isActive ? null : scope.id)}
                                                    >
                                                        {/* Shape Icon */}
                                                        <div className="w-10 h-10 rounded-xl bg-black border border-white/10 flex items-center justify-center shrink-0">
                                                            <ShapeIcon shape={scope.shape} />
                                                        </div>

                                                        {/* Info */}
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-xs font-bold text-white truncate">{scope.name}</span>
                                                                {scope.isDefault && <Star size={10} className="fill-amber-500 text-amber-500 shrink-0" />}
                                                                {isActive && (
                                                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)] shrink-0 animate-pulse" />
                                                                )}
                                                            </div>
                                                            {scope.viewLabel && (
                                                                <div className="text-[9px] text-zinc-500 font-medium uppercase tracking-tighter mt-0.5">
                                                                    {scope.viewLabel}
                                                                </div>
                                                            )}
                                                            {isActive && (
                                                                <div className="text-[9px] text-indigo-400 font-bold uppercase tracking-widest mt-0.5">Active</div>
                                                            )}
                                                        </div>

                                                        {/* Actions (visible on hover) */}
                                                        <div className="flex flex-col items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button
                                                                onClick={e => { e.stopPropagation(); setDefaultScope(scope.id); }}
                                                                className={`p-1.5 rounded-lg transition-all ${scope.isDefault ? 'text-amber-500' : 'text-zinc-600 hover:bg-amber-500/20 hover:text-amber-400'}`}
                                                                title="Set as Default"
                                                            >
                                                                <Star size={12} />
                                                            </button>
                                                            <button
                                                                onClick={async (e) => {
                                                                    e.stopPropagation();
                                                                    const ok = await confirm({
                                                                        title: "Delete Scope",
                                                                        message: `Delete scope "${scope.name}"?`,
                                                                        confirmLabel: "Delete",
                                                                        variant: "danger"
                                                                    });
                                                                    if (ok) removeScope(scope.id);
                                                                }}
                                                                className="p-1.5 rounded-lg text-zinc-600 hover:bg-red-500/20 hover:text-red-400 transition-all"
                                                                title="Delete"
                                                            >
                                                                <Trash2 size={12} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}

                                            {scopes.length === 0 && (
                                                <div className="text-center py-10 text-zinc-600">
                                                    <Target size={30} className="mx-auto mb-3 opacity-20" />
                                                    <p className="text-[10px] font-black uppercase tracking-widest">No scopes defined</p>
                                                    <p className="text-[9px] text-zinc-700 mt-1 uppercase tracking-wider">Click Add Scope to begin</p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Active Scope Toggle (deactivate) */}
                                        {activeScopeId && (
                                            <button
                                                onClick={() => setActiveScopeId(null)}
                                                className="w-full py-2 rounded-xl border border-rose-500/20 text-rose-400 text-[9px] font-bold uppercase tracking-widest hover:bg-rose-500/10 transition-colors"
                                            >
                                                Deactivate Scope
                                            </button>
                                        )}
                                    </motion.div>
                                ) : (
                                    /* ── Shape Chooser ── */
                                    <motion.div
                                        key="shape-chooser"
                                        initial={{ opacity: 0, x: 16 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -16 }}
                                        className="space-y-3"
                                    >
                                        <p className="text-[10px] text-zinc-400 uppercase tracking-wider mb-3">Select shape to draw</p>

                                        {([
                                            { shape: 'circle' as const, Icon: Circle, label: 'Circle', desc: 'Perfect for round endoscope views' },
                                            { shape: 'square' as const, Icon: Square, label: 'Square', desc: '1:1 aspect ratio' },
                                        ]).map(({ shape, Icon, label, desc }) => (
                                            <button
                                                key={shape}
                                                onClick={() => handleShapeSelect(shape)}
                                                className="w-full bg-zinc-900 border border-white/5 hover:border-indigo-500/40 hover:bg-zinc-800 rounded-2xl p-4 flex items-center gap-4 transition-all group"
                                            >
                                                <div className="w-12 h-12 rounded-xl bg-black flex items-center justify-center group-hover:bg-indigo-500/10 transition-colors shrink-0">
                                                    <Icon size={20} className="text-zinc-500 group-hover:text-indigo-400" />
                                                </div>
                                                <div className="text-left">
                                                    <div className="text-sm font-bold text-white">{label}</div>
                                                    <div className="text-[10px] text-zinc-500 uppercase tracking-widest">{desc}</div>
                                                </div>
                                            </button>
                                        ))}

                                        <button
                                            onClick={() => setIsChoosingShape(false)}
                                            className="w-full py-2.5 rounded-2xl text-zinc-500 text-[10px] font-bold uppercase tracking-widest hover:text-white transition-colors"
                                        >
                                            ← Back to list
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
