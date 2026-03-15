"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronLeft, ChevronRight, ZoomIn, Download, FileText, ImageIcon, Video, Calendar, Clock, Image as LucideImage, Play, Eye, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSystemStatus } from "@/app/actions/system";
import { useNotify } from "@/lib/store/ui.store";

interface MediaItem {
    id: string;
    url: string;
    thumbnailUrl?: string;
    type?: 'image' | 'video' | 'annotated';
    notes?: string;
    createdAt?: string;
    deleted?: boolean;
}

interface Procedure {
    id: string;
    type: string;
    createdAt: string;
    media?: MediaItem[];
    report?: any;
    status?: string;
}

interface ProcedureMediaPopupProps {
    isOpen: boolean;
    onClose: () => void;
    patient: any;
    procedures: Procedure[];
    initialProcedureId?: string;
    initialTab?: 'images' | 'annotated' | 'videos' | 'reports' | 'bins';
}

export default function ProcedureMediaPopup({
    isOpen,
    onClose,
    patient,
    procedures = [],
    initialProcedureId,
    initialTab = 'images'
}: ProcedureMediaPopupProps) {
    const [activeProcedureId, setActiveProcedureId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'images' | 'annotated' | 'videos' | 'reports' | 'bins'>(initialTab);
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const [selectedItemArray, setSelectedItemArray] = useState<MediaItem[]>([]);
    const [usbConnected, setUsbConnected] = useState<boolean>(false);
    
    const activeItemRef = useRef<HTMLButtonElement | null>(null);
    const notify = useNotify();

    const sortedProcedures = [...procedures].sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const checkUsbStatus = async () => {
        try {
            const status = await getSystemStatus();
            setUsbConnected(status.usb);
        } catch (err) {
            console.error("Failed to check USB status:", err);
            setUsbConnected(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            checkUsbStatus();
            if (initialProcedureId) {
                setActiveProcedureId(initialProcedureId);
            } else if (sortedProcedures.length > 0) {
                setActiveProcedureId(sortedProcedures[0].id);
            }
            setActiveTab(initialTab);
        } else {
            setActiveProcedureId(null);
            setSelectedIndex(null);
        }
    }, [isOpen, initialProcedureId, sortedProcedures.length]);

    // Auto-scroll to active procedure
    useEffect(() => {
        if (activeProcedureId && activeItemRef.current) {
            // Delay slightly to ensure layout is ready and container is scrollable
            const timer = setTimeout(() => {
                activeItemRef.current?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [activeProcedureId, isOpen]);

    if (!isOpen) return null;

    const activeProcedure = sortedProcedures.find(p => p.id === activeProcedureId);
    
    // Map media items to ensure they use the serve API if they have a filePath
    const media: MediaItem[] = (activeProcedure?.media || []).map((m: any) => ({
        id: m.id,
        url: m.url || (m.filePath ? `/api/capture-serve?path=${encodeURIComponent(m.filePath)}` : ''),
        thumbnailUrl: m.thumbnailUrl || (m.thumbnailPath ? `/api/capture-serve?path=${encodeURIComponent(m.thumbnailPath)}` : undefined),
        type: m.type?.toLowerCase() as any,
        createdAt: m.timestamp || m.createdAt,
        deleted: m.isDeleted || m.deleted || false
    }));
    
    // Non-deleted media
    const activeMedia = media.filter(m => !m.deleted);
    const images = activeMedia.filter(m => m.type === 'image');
    const annotated = activeMedia.filter(m => m.type === 'annotated');
    const videos = activeMedia.filter(m => m.type === 'video');
    const bins = media.filter(m => m.deleted);
    const hasReport = !!activeProcedure?.report;

    const openLightbox = (idx: number, array: MediaItem[]) => {
        setSelectedItemArray(array);
        setSelectedIndex(idx);
    };

    const selectedItem = selectedIndex !== null ? selectedItemArray[selectedIndex] : null;

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 md:p-10 font-plus-jakarta animate-in fade-in duration-300">
             <style jsx global>{`
                @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
                .font-plus-jakarta {
                    font-family: 'Plus Jakarta Sans', sans-serif;
                }
            `}</style>
            {/* Backdrop */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="absolute inset-0 bg-black/80 backdrop-blur-3xl"
            />

            {/* Main Modal Container */}
            <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 30 }}
                className="relative w-full h-full max-w-7xl bg-zinc-900 border border-white/10 rounded-[2.5rem] shadow-[0_50px_100px_-20px_rgba(0,0,0,1)] overflow-hidden flex flex-col md:flex-row"
            >
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-8 right-8 z-50 w-12 h-12 rounded-full bg-white/5 hover:bg-white/10 text-white/30 hover:text-white transition-all flex items-center justify-center border border-white/5 active:scale-95 group"
                >
                    <X size={24} className="group-hover:rotate-90 transition-transform duration-300" />
                </button>

                {/* Sidebar - Left Side */}
                <div className="w-full md:w-80 bg-zinc-950/60 border-r border-white/5 flex flex-col overflow-hidden">
                    <div className="p-8 pb-6">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4">Patient History</p>
                        
                        <div className="space-y-1">
                            <h2 className="text-2xl font-black text-white leading-tight tracking-tight">
                                {patient?.fullName || 'Anonymous'}
                            </h2>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                                    {patient?.mrn || 'NO-MRN'}
                                </span>
                                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                                    {patient?.age ? `${patient.age}Y` : '??Y'} • {patient?.gender || 'N/A'}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-2.5 custom-scrollbar pb-10">
                        {sortedProcedures.map((proc) => (
                            <button
                                key={proc.id}
                                ref={activeProcedureId === proc.id ? activeItemRef : null}
                                onClick={() => setActiveProcedureId(proc.id)}
                                className={cn(
                                    "w-full p-5 rounded-[1.5rem] transition-all duration-300 text-left group border relative overflow-hidden",
                                    activeProcedureId === proc.id
                                        ? "bg-white/10 border-white/20 shadow-[0_15px_45px_rgba(0,0,0,0.6)]"
                                        : "bg-transparent border-transparent hover:bg-white/5 hover:border-white/5"
                                )}
                            >
                                {activeProcedureId === proc.id && (
                                    <motion.div 
                                        layoutId="sidebarAccent"
                                        className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-12 bg-blue-500 rounded-r-full shadow-[0_0_20px_rgba(59,130,246,0.6)]"
                                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                    />
                                )}
                                <div className="flex flex-col gap-1.5">
                                    <span className={cn(
                                        "text-[15px] font-bold tracking-tight capitalize transition-all duration-300",
                                        activeProcedureId === proc.id ? "text-white translate-x-1" : "text-slate-500 group-hover:text-slate-300"
                                    )}>
                                        {proc.type}
                                    </span>
                                    <div className={cn(
                                        "flex items-center gap-3 transition-all duration-300",
                                        activeProcedureId === proc.id ? "translate-x-1" : ""
                                    )}>
                                        <div className={cn(
                                            "flex items-center gap-1.5 transition-opacity",
                                            activeProcedureId === proc.id ? "text-white/60" : "text-slate-600 group-hover:text-slate-500"
                                        )}>
                                            <Calendar size={12} />
                                            <span className="text-[12px] font-semibold">
                                                {new Date(proc.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                            </span>
                                        </div>
                                        <div className={cn(
                                            "flex items-center gap-1.5 border-l pl-3 transition-opacity",
                                            activeProcedureId === proc.id ? "text-white/60 border-white/20" : "text-slate-600 group-hover:text-slate-500 border-white/10"
                                        )}>
                                            <Clock size={12} />
                                            <span className="text-[12px] font-semibold">
                                                {new Date(proc.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Main Content Area - Right Side */}
                <div className="flex-1 flex flex-col overflow-hidden bg-gradient-to-br from-zinc-900 to-zinc-950">
                    {/* Tabs Header */}
                    <div className="px-10 pt-10 pb-2 border-b border-white/5 flex gap-10">
                        <TabButton 
                            isActive={activeTab === 'images'} 
                            onClick={() => setActiveTab('images')} 
                            label={`Images (${images.length})`} 
                            icon={<ImageIcon size={18} />} 
                        />
                        <TabButton 
                            isActive={activeTab === 'annotated'} 
                            onClick={() => setActiveTab('annotated')} 
                            label={`Annotated (${annotated.length})`} 
                            icon={<LucideImage size={18} />} 
                        />
                        <TabButton 
                            isActive={activeTab === 'videos'} 
                            onClick={() => setActiveTab('videos')} 
                            label={`Videos (${videos.length})`} 
                            icon={<Video size={18} />} 
                        />
                        {hasReport && (
                            <TabButton 
                                isActive={activeTab === 'reports'} 
                                onClick={() => setActiveTab('reports')} 
                                label="Report" 
                                icon={<FileText size={18} />} 
                            />
                        )}
                        <TabButton 
                            isActive={activeTab === 'bins'} 
                            onClick={() => setActiveTab('bins')} 
                            label={`Bins (${bins.length})`} 
                            icon={<Trash2 size={18} />} 
                        />
                    </div>

                    {/* Scrollable Gallery Content */}
                    <div className="flex-1 overflow-y-auto p-10 custom-scrollbar bg-black/5">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={`${activeProcedureId}-${activeTab}`}
                                initial={{ opacity: 0, y: 15 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -15 }}
                                transition={{ duration: 0.4, ease: "easeOut" }}
                                className="h-full"
                            >
                                {activeTab === 'images' && (
                                    <GalleryGrid items={images} onSelect={(idx: number) => openLightbox(idx, images)} emptyMessage="No original images found" />
                                )}
                                {activeTab === 'annotated' && (
                                    <GalleryGrid items={annotated} onSelect={(idx: number) => openLightbox(idx, annotated)} emptyMessage="No annotated images found" />
                                )}
                                {activeTab === 'videos' && (
                                    <VideoGrid items={videos} onSelect={(idx: number) => openLightbox(idx, videos)} emptyMessage="No videos recorded" />
                                )}
                                {activeTab === 'reports' && (
                                    <ReportViewer procedureId={activeProcedureId!} />
                                )}
                                {activeTab === 'bins' && (
                                    <GalleryGrid items={bins} onSelect={(idx: number) => openLightbox(idx, bins)} emptyMessage="Bin is empty" />
                                )}
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </div>
            </motion.div>

            {/* Lightbox Overlay */}
            <AnimatePresence>
                {selectedItem && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[400] bg-black/95 backdrop-blur-2xl flex flex-col items-center justify-center p-12"
                    >
                         <div className="absolute top-10 flex justify-between items-start w-full px-16 z-10 animate-in slide-in-from-top duration-500">
                            <div className="flex flex-col gap-2">
                                <div className="text-white/40 text-[11px] font-black tracking-[0.25em] uppercase mb-1">
                                    {selectedIndex! + 1} / {selectedItemArray.length} • {activeProcedure?.type}
                                </div>
                                <div className="flex items-center gap-4">
                                    <h3 className="text-2xl font-black text-white tracking-tight leading-none">
                                        {patient?.fullName || 'Anonymous'}
                                    </h3>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                                            {patient?.mrn || 'NO-MRN'}
                                        </span>
                                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                                            {patient?.age ? `${patient.age}Y` : '??Y'} • {patient?.gender || 'N/A'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <button 
                                    onClick={(e) => {
                                        if (!usbConnected) return;
                                        // Trigger download
                                        const link = document.createElement('a');
                                        link.href = selectedItem.url;
                                        link.download = `media_${selectedItem.id}`;
                                        link.click();
                                    }}
                                    disabled={!usbConnected}
                                    className={cn(
                                        "w-14 h-14 rounded-full flex items-center justify-center transition-all border active:scale-90 group",
                                        usbConnected 
                                            ? "bg-white/5 hover:bg-white/10 text-white border-white/5" 
                                            : "bg-white/5 text-white/20 border-white/5 cursor-not-allowed"
                                    )}
                                    title={usbConnected ? "Download Media" : "Connect USB external storage"}
                                >
                                    <Download size={20} className={cn("transition-transform", usbConnected && "group-hover:scale-110")} />
                                </button>
                                <button onClick={() => setSelectedIndex(null)} className="w-14 h-14 bg-white/5 hover:bg-red-500/80 rounded-full flex items-center justify-center text-white transition-all border border-white/5 active:scale-95 group">
                                    <X size={20} className="group-hover:rotate-90 transition-transform" />
                                </button>
                            </div>
                        </div>

                        <div className="relative flex flex-col items-center gap-8">
                            <motion.div 
                                layoutId={`media-${selectedItem.id}`} 
                                className="max-w-full max-h-[75vh] flex items-center justify-center p-4"
                            >
                                {selectedItem.type === 'video' ? (
                                    <video controls autoPlay src={selectedItem.url} className="max-w-[85vw] max-h-[70vh] rounded-[2.5rem] shadow-[0_0_100px_rgba(0,0,0,1)] border border-white/10" />
                                ) : (
                                    <img src={selectedItem.url} alt="" className="max-w-[85vw] max-h-[75vh] rounded-[2.5rem] shadow-[0_0_100px_rgba(0,0,0,1)] border border-white/10 object-contain" />
                                )}
                            </motion.div>

                            <motion.div 
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex items-center gap-3 px-6 py-3 bg-white/5 border border-white/10 rounded-full backdrop-blur-xl"
                            >
                                <div className="flex items-center gap-2 text-white/40">
                                    <Calendar size={14} />
                                    <span className="text-[12px] font-bold tabular-nums">
                                        {selectedItem.createdAt ? new Date(selectedItem.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}
                                    </span>
                                </div>
                                <div className="w-px h-3 bg-white/10" />
                                <div className="flex items-center gap-2 text-white/40">
                                    <Clock size={14} />
                                    <span className="text-[12px] font-bold tabular-nums">
                                        {selectedItem.createdAt ? new Date(selectedItem.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'N/A'}
                                    </span>
                                </div>
                            </motion.div>
                        </div>

                        <button onClick={() => setSelectedIndex(prev => (prev! > 0 ? prev! - 1 : prev))} className={cn("absolute left-10 w-24 h-24 bg-white/5 hover:bg-white/10 rounded-full flex items-center justify-center text-white/30 hover:text-white transition-all border border-white/5 active:scale-90", selectedIndex === 0 && "opacity-0 pointer-events-none")}>
                            <ChevronLeft size={48} />
                        </button>
                        <button onClick={() => setSelectedIndex(prev => (prev! < selectedItemArray.length - 1 ? prev! + 1 : prev))} className={cn("absolute right-10 w-24 h-24 bg-white/5 hover:bg-white/10 rounded-full flex items-center justify-center text-white/30 hover:text-white transition-all border border-white/5 active:scale-90", selectedIndex === selectedItemArray.length - 1 && "opacity-0 pointer-events-none")}>
                            <ChevronRight size={48} />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// Sub-components for cleaner structure
const TabButton = ({ isActive, onClick, label, icon }: any) => (
    <button
        onClick={onClick}
        className={cn(
            "pb-5 px-1 text-[13px] font-black uppercase tracking-[0.25em] flex items-center gap-3 border-b-2 transition-all duration-300 relative",
            isActive 
                ? "border-white text-white translate-y-[1px]" 
                : "border-transparent text-white/20 hover:text-white/50"
        )}
    >
        <span className={cn("transition-transform duration-300", isActive && "scale-110")}>{icon}</span>
        {label}
        {isActive && (
            <motion.div 
                layoutId="activeTab"
                className="absolute inset-x-0 bottom-0 h-[2px] bg-white shadow-[0_0_15px_rgba(255,255,255,0.8)]"
            />
        )}
    </button>
);

const GalleryGrid = ({ items, onSelect, emptyMessage }: any) => (
    items.length === 0 ? (
        <EmptyState icon={<ImageIcon size={64} />} message={emptyMessage} />
    ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-8">
            {items.map((item: any, idx: number) => (
                <motion.div
                    key={item.id}
                    layoutId={`media-${item.id}`}
                    onClick={() => onSelect(idx)}
                    whileHover={{ scale: 1.04, y: -8 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className="flex flex-col gap-3 group cursor-pointer"
                >
                    <div className="aspect-square relative rounded-[2rem] overflow-hidden bg-zinc-950 border border-white/10 shadow-2xl flex items-center justify-center transition-all duration-300 group-hover:bg-zinc-900 group-hover:border-white/20">
                        {item.type === 'video' && !item.thumbnailUrl ? (
                            <div className="flex flex-col items-center gap-2 text-white/20 group-hover:text-blue-500/50 transition-colors">
                                <Video size={48} strokeWidth={1.5} />
                                <span className="text-[10px] font-black uppercase tracking-widest">Video</span>
                            </div>
                        ) : (
                            <img src={item.thumbnailUrl || item.url} alt="" className="w-full h-full object-contain opacity-100 transition-all duration-700 saturate-100 group-hover:scale-110" />
                        )}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-white/5 transition-all duration-500" />
                    </div>
                    <div className="px-2 text-center">
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest group-hover:text-blue-400 transition-colors">
                            {item.id.slice(0, 8)}
                        </span>
                    </div>
                </motion.div>
            ))}
        </div>
    )
);

const VideoThumbnail = ({ item }: { item: any }) => {
    const [thumbError, setThumbError] = useState(false);

    return (
        <div className="relative w-full h-full flex items-center justify-center">
            {item.thumbnailUrl && !thumbError ? (
                <img 
                    src={item.thumbnailUrl} 
                    alt="" 
                    className="w-full h-full object-contain opacity-60 transition-all duration-700 group-hover:scale-110" 
                    onError={() => {
                        console.warn("Thumbnail failed to load, falling back to video preview:", item.thumbnailUrl);
                        setThumbError(true);
                    }}
                />
            ) : (
                <video 
                    src={`${item.url}#t=0.1`} 
                    className="w-full h-full object-cover opacity-60 transition-all duration-700 group-hover:scale-110"
                    muted
                    playsInline
                />
            )}
            <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-16 h-16 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/20 group-hover:scale-110 transition-all">
                    <Play size={24} fill="white" />
                </div>
            </div>
        </div>
    );
};

const VideoGrid = ({ items, onSelect, emptyMessage }: any) => (
    items.length === 0 ? (
        <EmptyState icon={<Video size={64} />} message={emptyMessage} />
    ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-10">
            {items.map((item: any, idx: number) => (
                <motion.div
                    key={item.id}
                    layoutId={`media-${item.id}`}
                    onClick={() => onSelect(idx)}
                    whileHover={{ scale: 1.04, y: -8 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className="flex flex-col gap-3 group cursor-pointer"
                >
                    <div className="aspect-square relative rounded-[2.5rem] overflow-hidden bg-zinc-950 border border-white/10 shadow-2xl p-4 flex items-center justify-center transition-all duration-300 group-hover:bg-zinc-900 group-hover:border-white/20">
                        <VideoThumbnail item={item} />
                    </div>
                    <div className="px-2 text-center">
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest group-hover:text-blue-400 transition-colors">
                            {item.id.slice(0, 8)}
                        </span>
                    </div>
                </motion.div>
            ))}
        </div>
    )
);

const ReportViewer = ({ procedureId }: { procedureId: string }) => (
    <div className="h-[65vh] w-full bg-zinc-800 rounded-[2.5rem] overflow-hidden relative border border-white/5 shadow-2xl animate-in zoom-in-95 duration-500">
        <iframe
            src={`/api/report-serve?id=${procedureId}`}
            className="w-full h-full border-0 bg-white"
            title="PDF Preview"
        />
        <div className="absolute inset-0 pointer-events-none ring-1 ring-inset ring-white/10 rounded-[2.5rem]" />
    </div>
);

const EmptyState = ({ icon, message }: any) => (
    <div className="h-full min-h-[450px] flex flex-col items-center justify-center text-white/10 text-center">
        <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 0.2 }}
            className="mb-8"
        >
            {icon}
        </motion.div>
        <p className="text-2xl font-black italic tracking-widest uppercase opacity-40">{message}</p>
        <p className="text-sm font-bold tracking-tight opacity-20 mt-2">No records found for this category</p>
    </div>
);
