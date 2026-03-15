"use client";

import React, { useState } from "react";
import { Settings, Plus, Maximize2, Trash2, Edit3, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface AdminCardProps {
    title: string;
    description: string;
    icon: React.ElementType;
    children?: React.ReactNode;
    onAdd?: () => void;
    onSettings?: () => void;
    expandedContent?: React.ReactNode;
    className?: string;
    count?: number;
    isExpanded?: boolean;
    onExpandedChange?: (expanded: boolean) => void;
}

export default function AdminCard({
    title,
    description,
    icon: Icon,
    children,
    onAdd,
    onSettings,
    expandedContent,
    className,
    count,
    isExpanded: externalExpanded,
    onExpandedChange
}: AdminCardProps) {
    const [internalExpanded, setInternalExpanded] = useState(false);
    
    const isExpanded = externalExpanded !== undefined ? externalExpanded : internalExpanded;
    
    const handleSetExpanded = (val: boolean) => {
        setInternalExpanded(val);
        if (onExpandedChange) onExpandedChange(val);
    };

    return (
        <>
            <motion.div
                whileHover={{ y: -4, scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                className={cn(
                    "relative overflow-hidden bg-gradient-to-br from-white via-white to-blue-50/30",
                    "border border-black/[0.04] rounded-[1.5rem]",
                    "shadow-[0_20px_40px_rgba(8,112,184,0.08)] hover:shadow-[0_30px_60px_rgba(8,112,184,0.12)]",
                    "transition-all duration-500 font-apple select-none h-full flex flex-col p-4",
                    className
                )}
            >
                {/* Subtle Glow Effect */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-400/5 blur-[40px] rounded-full -mr-10 -mt-10 pointer-events-none" />
                
                {/* Header */}
                <div className="relative z-10 flex items-start justify-between mb-2">
                    <div className="flex items-start gap-3">
                        <div className="p-2.5 bg-gradient-to-br from-slate-900 to-slate-700 rounded-xl text-white shadow-lg shadow-slate-900/20">
                            <Icon size={16} />
                        </div>
                        <div>
                            <h3 className="text-[12px] font-bold text-slate-900 tracking-tight leading-none mb-0.5">{title}</h3>
                            <p className="text-[9px] text-slate-400 font-medium leading-tight">{description}</p>
                        </div>
                    </div>
                    
                    <div className="flex gap-0.5">
                        {expandedContent && (
                            <button 
                                onClick={() => handleSetExpanded(true)}
                                className="p-1.5 text-slate-300 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-all"
                                title="Expand view"
                            >
                                <Maximize2 size={12} />
                            </button>
                        )}
                        {onSettings && (
                            <button 
                                onClick={onSettings}
                                className="p-1.5 text-slate-300 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-all"
                            >
                                <Settings size={12} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Content Area */}
                <div className="relative z-10 flex-1 min-h-[60px]">
                    {children}
                </div>

                {/* Actions / Footer */}
                {(onAdd || count !== undefined) && (
                    <div className="relative z-10 mt-3 pt-3 border-t border-black/[0.03] flex items-center justify-between">
                        <div>
                            {count !== undefined && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 text-blue-600 text-[10px] font-bold border border-blue-100/50">
                                    {count} Items
                                </span>
                            )}
                        </div>
                        {onAdd && (
                            <button 
                                onClick={onAdd}
                                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-900 text-white rounded-xl text-[10px] font-bold hover:bg-blue-600 transition-all active:scale-95 shadow-lg shadow-black/10"
                            >
                                <Plus size={10} strokeWidth={3} />
                                Add New
                            </button>
                        )}
                    </div>
                )}
            </motion.div>

            {/* Expanded Popup */}
            <AnimatePresence>
                {isExpanded && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 md:p-10">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
                            onClick={() => handleSetExpanded(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="relative w-full max-w-5xl max-h-[92vh] bg-white rounded-[2.5rem] shadow-2xl shadow-black/20 overflow-hidden flex flex-col font-apple"
                        >
                            <div className="flex items-center justify-between p-7 border-b border-slate-50 bg-gradient-to-r from-slate-50/50 to-white">
                                <div className="flex items-center gap-5">
                                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white shadow-xl shadow-blue-500/20">
                                        <Icon size={24} />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{title} Management</h2>
                                        <p className="text-slate-500 font-medium">Configure and manage {title.toLowerCase()} settings</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleSetExpanded(false)}
                                    className="p-3 rounded-2xl bg-slate-50 text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-all active:scale-90"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-white">
                                {expandedContent || children}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </>
    );
}

// Sub-component for inline list items in cards
interface AdminCardItemProps { 
    label: string; 
    value?: string; 
    onDelete?: () => void; 
    onEdit?: () => void;
    icon?: React.ElementType;
}

export function AdminCardItem({ label, value, onDelete, onEdit, icon: Icon }: AdminCardItemProps) {
    return (
        <div className="flex items-center justify-between py-2 border-b border-black/[0.02] last:border-0 group/item">
            <div className="flex items-center gap-2.5">
                {Icon && <Icon size={12} className="text-slate-400" />}
                <div className="flex flex-col">
                    <span className="text-[11px] font-bold text-slate-700 leading-tight group-hover/item:text-slate-900 transition-colors">{label}</span>
                    {value && <span className="text-[10px] text-slate-400 font-medium group-hover/item:text-slate-500 transition-colors">{value}</span>}
                </div>
            </div>
            <div className="flex items-center gap-1.5 opacity-0 group-hover/item:opacity-100 transition-all translate-x-1 group-hover/item:translate-x-0">
                {onEdit && (
                    <button onClick={onEdit} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all">
                        <Edit3 size={12} />
                    </button>
                )}
                {onDelete && (
                    <button onClick={onDelete} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all">
                        <Trash2 size={12} />
                    </button>
                )}
            </div>
        </div>
    );
}
