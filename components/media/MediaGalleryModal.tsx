"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronLeft, ChevronRight, ZoomIn, Download, Grid, FileText, ImageIcon, Video } from "lucide-react";

interface MediaItem {
    id: string;
    url: string;
    thumbnailUrl?: string;
    type?: 'image' | 'video';
    notes?: string;
    createdAt?: string;
}

interface MediaGalleryModalProps {
    isOpen: boolean;
    onClose: () => void;
    procedure?: any;
    patient?: any;
    organizationName?: string;
    initialTab?: 'images' | 'videos' | 'report';
}

export default function MediaGalleryModal({
    isOpen,
    onClose,
    procedure,
    patient,
    organizationName = "Medical Center",
    initialTab
}: MediaGalleryModalProps) {
    const [activeTab, setActiveTab] = useState<'images' | 'videos' | 'report'>('images');
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const [selectedItemArray, setSelectedItemArray] = useState<MediaItem[]>([]);

    // PDF State
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const media: MediaItem[] = procedure?.media || [];
    const images = media.filter(m => m.type !== 'video');
    const videos = media.filter(m => m.type === 'video');
    const report = procedure?.report;

    useEffect(() => {
        if (isOpen) {
            if (initialTab) {
                setActiveTab(initialTab);
            } else {
                // Smart auto-selection logic
                if (images.length > 0) setActiveTab('images');
                else if (videos.length > 0) setActiveTab('videos');
                else if (report) setActiveTab('report');
            }

            if (report) {
                // Check if we already have it to avoid reload frame blinking
                if (!pdfUrl) {
                    setPdfUrl(`/api/report-serve?id=${procedure?.id}`);
                }
            }
        } else {
            setSelectedIndex(null);
            setPdfUrl(null);
            setError(null);
        }
    }, [isOpen, procedure?.id]);



    if (!isOpen) return null;

    const selectedItem = selectedIndex !== null ? selectedItemArray[selectedIndex] : null;

    const openLightbox = (idx: number, array: MediaItem[]) => {
        setSelectedItemArray(array);
        setSelectedIndex(idx);
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="absolute inset-0 bg-black/95 backdrop-blur-md"
            />

            {/* Main Modal */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-[80vw] h-[85vh] bg-zinc-950 border border-white/5 rounded-3xl overflow-hidden flex flex-col shadow-2xl"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-6 pb-2 border-b border-white/5 bg-black/50">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-white/5 text-white/60 flex items-center justify-center">
                            <Grid size={20} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white tracking-tight">Procedure History</h2>
                            <p className="text-xs font-medium text-white/40 tracking-wider">
                                {patient?.fullName} • {new Date(procedure?.createdAt || new Date()).toLocaleDateString('en-GB')}
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all flex items-center justify-center"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Tab Navigation */}
                <div className="px-6 border-b border-white/5 flex gap-4 bg-black/50">
                    <button
                        onClick={() => setActiveTab('images')}
                        className={`py-4 px-2 text-sm font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'images' ? 'border-white text-white' : 'border-transparent text-white/40 hover:text-white/70'
                            }`}
                    >
                        <ImageIcon size={16} /> Images ({images.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('videos')}
                        className={`py-4 px-2 text-sm font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'videos' ? 'border-white text-white' : 'border-transparent text-white/40 hover:text-white/70'
                            }`}
                    >
                        <Video size={16} /> Videos ({videos.length})
                    </button>
                    {report && (
                        <button
                            onClick={() => setActiveTab('report')}
                            className={`py-4 px-2 text-sm font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'report' ? 'border-white text-white' : 'border-transparent text-white/40 hover:text-white/70'
                                }`}
                        >
                            <FileText size={16} /> Report
                        </button>
                    )}
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                    {/* Images Tab */}
                    {activeTab === 'images' && (
                        images.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-white/30">
                                <ImageIcon size={48} className="mb-4 opacity-50" />
                                <p>No images available for this procedure</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                                {images.map((item, idx) => (
                                    <motion.div
                                        key={item.id}
                                        layoutId={`media-${item.id}`}
                                        onClick={() => openLightbox(idx, images)}
                                        whileHover={{ scale: 1.02 }}
                                        className="aspect-square relative rounded-xl overflow-hidden bg-black border border-white/5 cursor-pointer group"
                                    >
                                        <img src={item.url} alt="" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                                            <ZoomIn className="text-white drop-shadow-md" size={32} />
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        )
                    )}

                    {/* Videos Tab */}
                    {activeTab === 'videos' && (
                        videos.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-white/30">
                                <Video size={48} className="mb-4 opacity-50" />
                                <p>No videos available for this procedure</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {videos.map((item, idx) => (
                                    <motion.div
                                        key={item.id}
                                        layoutId={`media-${item.id}`}
                                        onClick={() => openLightbox(idx, videos)}
                                        whileHover={{ scale: 1.02 }}
                                        className="aspect-video relative rounded-xl overflow-hidden bg-black border border-white/5 cursor-pointer group"
                                    >
                                        {item.thumbnailUrl ? (
                                            <img src={item.thumbnailUrl} alt="" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                                        ) : (
                                            <video 
                                                src={`${item.url}#t=0.1`} 
                                                className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                                                muted
                                                playsInline
                                            />
                                        )}
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                                            <ZoomIn className="text-white drop-shadow-md" size={32} />
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        )
                    )}

                    {/* Report Tab */}
                    {activeTab === 'report' && report && (
                        <div className="h-full w-full bg-slate-800 rounded-xl overflow-hidden relative border border-white/10">
                            {error && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 z-10 p-8 text-center">
                                    <div className="w-16 h-16 bg-rose-500/20 rounded-full flex items-center justify-center mb-4">
                                        <X className="text-rose-500" size={32} />
                                    </div>
                                    <p className="text-rose-400 font-bold text-lg mb-2">Failed to Load Report</p>
                                    <p className="text-white/50 text-sm max-w-md">{error}</p>
                                </div>
                            )}

                            {pdfUrl && !error && (
                                <iframe
                                    src={pdfUrl}
                                    className="w-full h-full border-0 bg-white"
                                    title="PDF Preview"
                                    onError={() => setError("The saved PDF could not be found or loaded from storage.")}
                                />
                            )}
                        </div>
                    )}
                </div>
            </motion.div>

            {/* Lightbox Overlay */}
            <AnimatePresence>
                {selectedItem && (
                    <div className="fixed inset-0 z-[210] bg-black/95 flex flex-col">
                        {/* Lightbox Toolbar */}
                        <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-10 bg-gradient-to-b from-black/80 to-transparent">
                            <div className="text-white/70 text-sm font-bold tracking-widest uppercase">
                                {selectedIndex! + 1} / {selectedItemArray.length}
                            </div>
                            <div className="flex gap-4">
                                <a href={selectedItem.url} download className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors">
                                    <Download size={20} />
                                </a>
                                <button onClick={() => setSelectedIndex(null)} className="w-10 h-10 bg-white/10 hover:bg-rose-500 rounded-full flex items-center justify-center text-white transition-colors">
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Main Image */}
                        <div className="flex-1 flex items-center justify-center p-8 relative">
                            <motion.div
                                layoutId={`media-${selectedItem.id}`}
                                className="relative max-w-full max-h-full"
                            >
                                {selectedItem.type === 'video' ? (
                                    <video controls autoPlay src={selectedItem.url} className="max-w-[90vw] max-h-[80vh] rounded-md shadow-2xl" />
                                ) : (
                                    <img src={selectedItem.url} alt="" className="max-w-[90vw] max-h-[85vh] rounded-md shadow-2xl" />
                                )}
                            </motion.div>

                            {/* Nav Buttons */}
                            <button
                                onClick={(e) => { e.stopPropagation(); setSelectedIndex(prev => (prev! > 0 ? prev! - 1 : prev)); }}
                                className={`absolute left-8 w-16 h-16 bg-white/5 hover:bg-white/20 rounded-full flex items-center justify-center text-white/50 hover:text-white transition-all backdrop-blur-sm ${selectedIndex === 0 ? 'opacity-0 pointer-events-none' : ''}`}
                            >
                                <ChevronLeft size={32} />
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); setSelectedIndex(prev => (prev! < selectedItemArray.length - 1 ? prev! + 1 : prev)); }}
                                className={`absolute right-8 w-16 h-16 bg-white/5 hover:bg-white/20 rounded-full flex items-center justify-center text-white/50 hover:text-white transition-all backdrop-blur-sm ${selectedIndex === selectedItemArray.length - 1 ? 'opacity-0 pointer-events-none' : ''}`}
                            >
                                <ChevronRight size={32} />
                            </button>
                        </div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
