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
}

export default function USBFilePicker({ isOpen, onClose, onFilesSelected, accept = "*/*", multiple = false, title = "Select File" }: USBFilePickerProps) {
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
            // Reset when closed
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
            const res = await fetch(`/api/storage?path=${encodeURIComponent(path)}`);
            const data = await res.json();
            if (data.success) {
                // Filter files by accept prop if it's a file
                let filteredItems = data.items.filter((item: FileItem) => {
                    if (item.type === 'directory' || item.type === 'drive') return true;
                    if (accept === "*/*") return true;
                    
                    const ext = item.name.split('.').pop()?.toLowerCase() || '';
                    if (accept.includes('image/*') && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return true;
                    if (accept.includes('video/*') && ['mp4', 'webm', 'mov', 'avi'].includes(ext)) return true;
                    if (accept.includes('.json') && ext === 'json') return true;
                    
                    // Add more accept type checks as needed
                    return accept.includes(ext);
                });
                
                // Sort directories first
                filteredItems.sort((a: FileItem, b: FileItem) => {
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
        
        // Very basic parent path computation (depends on OS)
        let parentPath = "root";
        if (currentPath.includes("/")) {
            // Unix path
            const parts = currentPath.split("/").filter(Boolean);
            if (parts.length > 1) {
                parts.pop();
                parentPath = "/" + parts.join("/");
            }
        } else if (currentPath.includes("\\")) {
            // Windows path
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
            if (!multiple) {
                newSet.clear();
            }
            newSet.add(itemPath);
        }
        setSelectedPaths(newSet);
    };

    const handleSelect = async () => {
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
            <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
                <motion.div 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
                    onClick={onClose}
                />
                
                <motion.div
                    initial={{ scale: 0.95, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0, y: 20 }}
                    className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[600px] border border-slate-100"
                >
                    {/* Header */}
                    <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-100/50 flex items-center justify-center text-blue-600">
                                <UploadCloud size={20} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-slate-800">{title}</h3>
                                <p className="text-xs font-bold text-slate-500">Select files from external storage</p>
                            </div>
                        </div>
                        <button 
                            onClick={onClose} 
                            className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-800 transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Navigation Bar */}
                    <div className="px-6 py-3 border-b border-slate-100 flex items-center gap-2 bg-white">
                        <button
                            disabled={currentPath === "root" || isLoading}
                            onClick={handleNavigateUp}
                            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
                        >
                            <ArrowLeft size={18} />
                        </button>
                        
                        <div className="flex-1 overflow-x-auto whitespace-nowrap custom-scrollbar flex items-center text-sm font-semibold text-slate-700 px-2">
                            {currentPath === "root" ? (
                                <span className="flex items-center gap-2 text-blue-600"><HardDrive size={14} /> Available Drives</span>
                            ) : (
                                <span className="text-slate-500">{currentPath}</span>
                            )}
                        </div>
                    </div>

                    {/* Content area */}
                    <div className="flex-1 py-2 overflow-y-auto custom-scrollbar bg-slate-50/30 relative">
                        {isLoading ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-3">
                                <div className="w-8 h-8 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
                                <span className="text-xs font-bold uppercase tracking-widest">Loading...</span>
                            </div>
                        ) : error ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-amber-600 gap-3 px-8 text-center">
                                <AlertCircle size={32} />
                                <span className="text-sm font-bold">{error}</span>
                                <button 
                                    onClick={() => loadPath("root")}
                                    className="px-4 py-2 mt-2 text-xs font-black uppercase tracking-widest bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200"
                                >
                                    Return to Root
                                </button>
                            </div>
                        ) : items.length === 0 ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-3">
                                <Folder size={32} className="opacity-20" />
                                <span className="text-xs font-bold uppercase tracking-widest opacity-60">Directory is empty</span>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 px-6 pb-6">
                                {items.map((item, idx) => {
                                    const isSelected = selectedPaths.has(item.path);
                                    const isDir = item.type === 'directory' || item.type === 'drive';
                                    
                                    return (
                                        <div 
                                            key={idx}
                                            onClick={() => isDir ? loadPath(item.path) : toggleSelection(item.path)}
                                            className={cn(
                                                "p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-all",
                                                isSelected 
                                                    ? "bg-blue-50 border-blue-300 shadow-sm"
                                                    : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm"
                                            )}
                                        >
                                            <div className={cn(
                                                "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                                                isDir ? "bg-amber-100 text-amber-600" : (isSelected ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500")
                                            )}>
                                                {item.type === 'drive' ? <HardDrive size={18} /> : 
                                                 item.type === 'directory' ? <Folder size={18} /> : 
                                                 isSelected ? <Check size={18} /> : <File size={18} />}
                                            </div>
                                            
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-bold text-slate-800 truncate" title={item.name}>{item.name}</div>
                                                {item.type === 'file' && (
                                                    <div className="text-[10px] font-bold text-slate-400 mt-0.5">{formatSize(item.size)}</div>
                                                )}
                                            </div>
                                            
                                            {isDir && <ChevronRight size={16} className="text-slate-300" />}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Footer Actions */}
                    <div className="px-6 py-4 border-t border-slate-100 bg-white flex items-center justify-between">
                        <div className="text-xs font-bold text-slate-500">
                            {selectedPaths.size} file(s) selected
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={onClose}
                                className="px-6 py-2.5 rounded-xl text-slate-500 font-bold hover:bg-slate-100 transition-colors text-sm"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSelect}
                                disabled={selectedPaths.size === 0 || isConverting}
                                className="px-6 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-sm transition-all hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {isConverting ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Preparing...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 size={16} />
                                        Select File{selectedPaths.size !== 1 ? 's' : ''}
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
