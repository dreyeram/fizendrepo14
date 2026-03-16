"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Folder, File, ChevronRight, UploadCloud, AlertCircle, HardDrive, ArrowLeft, Check, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileItem {
    name: string;
    path: string;
    type: 'directory' | 'file' | 'drive';
    size?: number;
    mtime?: string;
}

interface USBFilePickerProps {
    isOpen: boolean;
    onClose: () => void;
    onFilesSelected: (files: File[]) => void;
    accept?: string;
    multiple?: boolean;
    title?: string;
    mode?: 'file' | 'folder';
    onFolderSelected?: (folderPath: string) => void;
    usbOnly?: boolean;
}

export default function USBFilePicker({ 
    isOpen, 
    onClose, 
    onFilesSelected, 
    onFolderSelected,
    accept = "*/*", 
    multiple = false, 
    title = "Select File",
    mode = 'file',
    usbOnly = false
}: USBFilePickerProps) {
    const [currentPath, setCurrentPath] = useState<string>("root");
    const [items, setItems] = useState<FileItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
    const [isConverting, setIsConverting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            loadPath("root");
        } else {
            setCurrentPath("root");
            setItems([]);
            setError(null);
            setSelectedPaths(new Set());
        }
    }, [isOpen]);

    const loadPath = async (path: string) => {
        setIsLoading(true);
        setError(null);
        try {
            const url = new URL('/api/storage', window.location.origin);
            url.searchParams.set('path', path);
            if (usbOnly) url.searchParams.set('usbOnly', 'true');
            
            const res = await fetch(url.toString());
            const data = await res.json();
            if (data.success) {
                let filteredItems = data.items.filter((item: FileItem) => {
                    if (item.type === 'directory' || item.type === 'drive') return true;
                    if (accept === "*/*") return true;
                    
                    const ext = item.name.split('.').pop()?.toLowerCase() || '';
                    if (accept.includes('image/*') && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return true;
                    if (accept.includes('video/*') && ['mp4', 'webm', 'mov', 'avi'].includes(ext)) return true;
                    if (accept.includes('.json') && ext === 'json') return true;
                    return accept.includes(ext);
                });
                
                filteredItems.sort((a: FileItem, b: FileItem) => {
                    if (a.type === 'drive' && b.type !== 'drive') return -1;
                    if (b.type === 'drive' && a.type !== 'drive') return 1;
                    if (a.type === 'directory' && b.type === 'file') return -1;
                    if (a.type === 'file' && b.type === 'directory') return 1;
                    return a.name.localeCompare(b.name);
                });

                setItems(filteredItems);
                setCurrentPath(path);
            } else {
                setError(data.error || "Failed to load directory.");
            }
        } catch (err) {
            console.error("Storage fetch error:", err);
            setError("Network error while accessing storage.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleNavigateUp = () => {
        if (currentPath === "root") return;
        
        let parentPath = "root";
        if (currentPath.includes("/")) {
            const parts = currentPath.split("/").filter(Boolean);
            if (parts.length > 1) {
                parts.pop();
                parentPath = "/" + parts.join("/");
            }
        } else if (currentPath.includes("\\")) {
            const parts = currentPath.split("\\").filter(Boolean);
            if (parts.length > 1) {
                parts.pop();
                parentPath = parts.join("\\") + (parts.length === 1 ? "\\" : "");
            }
        }
        
        loadPath(parentPath);
    };

    const toggleSelection = (itemPath: string) => {
        const newSet = new Set(selectedPaths);
        if (newSet.has(itemPath)) {
            newSet.delete(itemPath);
        } else {
            if (!multiple) newSet.clear();
            newSet.add(itemPath);
        }
        setSelectedPaths(newSet);
    };

    const handleSelect = async () => {
        if (mode === 'folder') {
            if (currentPath === "root") return;
            onFolderSelected?.(currentPath);
            onClose();
            return;
        }

        if (selectedPaths.size === 0) return;
        
        setIsConverting(true);
        try {
            const filePromises = Array.from(selectedPaths).map(async (filePath) => {
                const res = await fetch(`/api/storage/serve?path=${encodeURIComponent(filePath)}`);
                if (!res.ok) throw new Error(`Failed to fetch ${filePath}`);
                const blob = await res.blob();
                const filename = filePath.split(/[/\\]/).pop() || "unknown_file";
                return new (window as any).File([blob], filename, { type: blob.type }) as File;
            });

            const files = await Promise.all(filePromises);
            onFilesSelected(files);
            onClose();
        } catch (err) {
            console.error("File selection error:", err);
            setError("Failed to process selected file(s).");
        } finally {
            setIsConverting(false);
        }
    };

    if (!isOpen) return null;

    const formatSize = (bytes?: number) => {
        if (bytes === undefined) return '';
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
                <style jsx global>{`
                    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
                    .font-plus-jakarta {
                        font-family: 'Plus Jakarta Sans', sans-serif;
                    }
                `}</style>

                <motion.div 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-slate-950/40 backdrop-blur-[12px]"
                    onClick={onClose}
                />
                
                <motion.div
                    initial={{ scale: 0.9, opacity: 0, y: 50 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 50 }}
                    transition={{ type: "spring", damping: 25, stiffness: 300 }}
                    className="relative w-full max-w-4xl bg-white rounded-[40px] shadow-[0_32px_128px_-16px_rgba(0,0,0,0.15)] overflow-hidden flex flex-col h-[750px] border border-slate-100 font-plus-jakarta"
                >
                    {/* Header */}
                    <div className="px-10 py-8 border-b border-slate-100 flex items-center justify-between bg-white">
                        <div className="flex items-center gap-5">
                            <div className="w-14 h-14 rounded-[20px] bg-blue-50/50 flex items-center justify-center text-blue-600 ring-1 ring-blue-100/50 shadow-inner">
                                {mode === 'folder' ? <HardDrive size={24} /> : <UploadCloud size={24} />}
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-slate-900 tracking-tight leading-none mb-1">{title}</h3>
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest opacity-60">
                                    {mode === 'folder' ? 'Select a destination folder' : 'Select files from external storage'}
                                </p>
                            </div>
                        </div>
                        <button 
                            onClick={onClose} 
                            className="w-12 h-12 rounded-2xl text-slate-300 hover:text-slate-900 hover:bg-slate-50 transition-all flex items-center justify-center active:scale-95"
                        >
                            <X size={24} />
                        </button>
                    </div>

                    {/* Breadcrumbs / Navigation */}
                    <div className="px-10 py-5 border-b border-slate-100 flex items-center gap-6 bg-slate-50/20">
                        <button
                            disabled={currentPath === "root" || isLoading}
                            onClick={handleNavigateUp}
                            className="p-2 rounded-xl text-slate-400 hover:text-slate-900 hover:bg-white hover:shadow-sm disabled:opacity-20 disabled:hover:bg-transparent transition-all"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        
                        <div className="flex-1 overflow-x-auto whitespace-nowrap no-scrollbar flex items-center gap-3 text-sm font-bold text-slate-600">
                            {currentPath === "root" ? (
                                <span className="flex items-center gap-2.5 text-blue-600 scale-105 origin-left transition-transform">
                                    <HardDrive size={18} strokeWidth={2.5} /> 
                                    <span className="uppercase tracking-widest text-xs">Available Drives</span>
                                </span>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <span className="text-slate-300">/</span>
                                    <span className="font-mono text-xs bg-white px-3 py-1.5 rounded-lg border border-slate-200/50 shadow-sm">{currentPath}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Browser Content Grid */}
                    <div className="flex-1 py-8 overflow-y-auto custom-scrollbar relative">
                        {isLoading ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-slate-400">
                                <div className="w-10 h-10 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
                                <span className="text-[10px] font-black uppercase tracking-[0.2em]">Accessing Storage...</span>
                            </div>
                        ) : error ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-amber-600 gap-4 px-12 text-center animate-in fade-in duration-500">
                                <AlertCircle size={40} className="opacity-50" />
                                <div className="space-y-1">
                                    <p className="text-sm font-bold">{error}</p>
                                    <p className="text-xs font-semibold text-slate-400">Please check device connection and try again.</p>
                                </div>
                                <button 
                                    onClick={() => loadPath("root")}
                                    className="px-6 h-10 mt-2 text-[10px] font-black uppercase tracking-widest bg-amber-50 text-amber-700 rounded-xl hover:bg-amber-100 ring-1 ring-amber-200/50 transition-all active:scale-95"
                                >
                                    Refresh Storage
                                </button>
                            </div>
                        ) : items.length === 0 ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 gap-4 animate-in fade-in duration-500">
                                <Folder size={48} className="opacity-10" />
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Directory is empty</span>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 px-10 pb-10">
                                <AnimatePresence mode="popLayout">
                                    {items.map((item, idx) => {
                                        const isSelected = selectedPaths.has(item.path);
                                        const isDir = item.type === 'directory' || item.type === 'drive';
                                        
                                        return (
                                            <motion.div 
                                                key={item.path}
                                                initial={{ opacity: 0, scale: 0.95 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                transition={{ delay: idx * 0.03 }}
                                                onClick={() => isDir ? loadPath(item.path) : toggleSelection(item.path)}
                                                className={cn(
                                                    "p-5 rounded-[24px] border transition-all cursor-pointer flex items-center gap-4 group",
                                                    isSelected 
                                                        ? "bg-blue-50/50 border-blue-400 shadow-lg shadow-blue-500/10"
                                                        : "bg-white border-slate-100 hover:border-slate-300 hover:shadow-xl hover:shadow-slate-200/50 hover:-translate-y-0.5"
                                                )}
                                            >
                                                <div className={cn(
                                                    "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-transform duration-500 group-hover:scale-110",
                                                    isDir || item.type === 'drive' 
                                                        ? "bg-amber-100 text-amber-600 shadow-inner" 
                                                        : (isSelected ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" : "bg-slate-50 text-slate-400")
                                                )}>
                                                    {item.type === 'drive' ? <HardDrive size={22} /> : 
                                                     item.type === 'directory' ? <Folder size={22} /> : 
                                                     isSelected ? <Check size={22} strokeWidth={3} /> : <File size={22} />}
                                                </div>
                                                
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-[14px] font-black text-slate-800 truncate" title={item.name}>{item.name}</div>
                                                    {item.type === 'file' && (
                                                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-tight mt-0.5">{formatSize(item.size)}</div>
                                                    )}
                                                </div>
                                                
                                                {isDir && (
                                                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 group-hover:text-amber-500 transition-colors">
                                                        <ChevronRight size={18} />
                                                    </div>
                                                )}
                                            </motion.div>
                                        );
                                    })}
                                </AnimatePresence>
                            </div>
                        )}
                    </div>

                    {/* Footer Actions */}
                    <div className="px-10 py-8 border-t border-slate-100 bg-white flex items-center justify-between mt-auto">
                        <div className="flex items-center gap-3">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Selection</span>
                            <div className="text-[11px] font-bold text-slate-900 bg-slate-100 px-4 py-1.5 rounded-full shadow-inner border border-slate-200/50">
                                {mode === 'folder' 
                                    ? (currentPath === 'root' ? 'Select a drive first' : currentPath)
                                    : `${selectedPaths.size} item${selectedPaths.size !== 1 ? 's' : ''} selected`}
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <button
                                onClick={onClose}
                                className="px-8 h-12 rounded-2xl text-slate-500 font-extrabold hover:text-slate-900 hover:bg-slate-50 transition-all text-sm active:scale-95"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSelect}
                                disabled={(mode === 'file' && selectedPaths.size === 0) || (mode === 'folder' && currentPath === 'root') || isConverting}
                                className={cn(
                                    "px-10 h-12 rounded-[20px] font-black text-xs uppercase tracking-[0.2em] transition-all flex items-center gap-3 shadow-lg active:scale-95",
                                    (mode === 'file' && selectedPaths.size === 0) || (mode === 'folder' && currentPath === 'root') || isConverting
                                        ? "bg-slate-100 text-slate-300 border border-slate-200 cursor-not-allowed"
                                        : "bg-blue-600 text-white hover:bg-blue-700 shadow-blue-500/20"
                                )}
                            >
                                {isConverting ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Preparing...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 size={18} />
                                        {mode === 'folder' ? 'Select Destination' : 'Select Files'}
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
