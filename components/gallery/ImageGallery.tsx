"use client";

import React, { useState, useEffect, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, Download, ZoomIn, ZoomOut, RotateCw, Maximize2, Grid } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export interface MediaItem {
    id: string;
    type?: string;
    filePath: string;
    thumbnailUrl?: string;
    timestamp?: Date | string;
    procedureType?: string;
    procedureDate?: Date | string;
}

export interface ImageGalleryProps {
    images: MediaItem[];
    initialIndex?: number;
    isOpen: boolean;
    onClose: () => void;
}

export default function ImageGallery({ images, initialIndex = 0, isOpen, onClose }: ImageGalleryProps) {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const [zoom, setZoom] = useState(1);
    const [rotation, setRotation] = useState(0);

    useEffect(() => {
        setCurrentIndex(initialIndex);
        setZoom(1);
        setRotation(0);
    }, [initialIndex, isOpen]);

    const goToNext = useCallback(() => {
        if (images.length > 0) {
            setCurrentIndex((prev) => (prev + 1) % images.length);
            setZoom(1);
            setRotation(0);
        }
    }, [images.length]);

    const goToPrev = useCallback(() => {
        if (images.length > 0) {
            setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
            setZoom(1);
            setRotation(0);
        }
    }, [images.length]);

    // Keyboard navigation
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (!isOpen) return;
            switch (e.key) {
                case 'ArrowLeft':
                    goToPrev();
                    break;
                case 'ArrowRight':
                    goToNext();
                    break;
                case 'Escape':
                    onClose();
                    break;
            }
        };

        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [isOpen, currentIndex, goToNext, goToPrev, onClose]);

    const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.5, 4));
    const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.5, 0.5));
    const handleRotate = () => setRotation((prev) => (prev + 90) % 360);

    const handleDownload = () => {
        const image = images[currentIndex];
        if (image) {
            const link = document.createElement('a');
            link.href = image.filePath;
            link.download = `capture-${currentIndex + 1}.png`;
            link.click();
        }
    };

    const formatDate = (date: Date | string | undefined) => {
        if (!date) return '';
        try {
            return new Date(date).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch {
            return '';
        }
    };

    if (!isOpen || images.length === 0) return null;

    const currentImage = images[currentIndex];

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[9999] bg-black/95 flex flex-col"
                onClick={onClose}
            >
                {/* Header */}
                <div
                    className="flex items-center justify-between p-4 bg-black/50"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex items-center gap-4">
                        <span className="text-white/80 font-bold">
                            {currentIndex + 1} / {images.length}
                        </span>
                        {currentImage.procedureType && (
                            <span className="px-3 py-1 bg-white/10 rounded-lg text-white/60 text-sm">
                                {currentImage.procedureType}
                            </span>
                        )}
                        {currentImage.timestamp && (
                            <span className="text-white/40 text-sm">
                                {formatDate(currentImage.timestamp)}
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleZoomOut();
                            }}
                            className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                            title="Zoom Out (−)"
                        >
                            <ZoomOut size={20} />
                        </button>
                        <span className="text-white/60 text-sm w-14 text-center font-mono">{Math.round(zoom * 100)}%</span>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleZoomIn();
                            }}
                            className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                            title="Zoom In (+)"
                        >
                            <ZoomIn size={20} />
                        </button>
                        <div className="w-px h-6 bg-white/20 mx-2" />
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleRotate();
                            }}
                            className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                            title="Rotate 90°"
                        >
                            <RotateCw size={20} />
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleDownload();
                            }}
                            className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                            title="Download"
                        >
                            <Download size={20} />
                        </button>
                        <div className="w-px h-6 bg-white/20 mx-2" />
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onClose();
                            }}
                            className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                            title="Close (Esc)"
                        >
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {/* Main Image Area */}
                <div
                    className="flex-1 flex items-center justify-center relative overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Prev Button */}
                    {images.length > 1 && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                goToPrev();
                            }}
                            className="absolute left-4 z-10 p-3 rounded-full bg-black/50 hover:bg-black/70 text-white/80 hover:text-white transition-all"
                        >
                            <ChevronLeft size={32} />
                        </button>
                    )}

                    {/* Image Container with Zoom/Rotate */}
                    <div className="flex items-center justify-center overflow-auto max-w-full max-h-full p-4">
                        <motion.div
                            key={currentIndex}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.2 }}
                            className="w-full h-full flex items-center justify-center p-4"
                        >
                            {currentImage.type === 'video' ? (
                                <video
                                    src={currentImage.filePath}
                                    controls
                                    autoPlay
                                    className="max-h-[75vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
                                />
                            ) : (
                                <img
                                    src={currentImage.filePath}
                                    alt={`Capture ${currentIndex + 1}`}
                                    className="max-h-[75vh] object-contain rounded-lg shadow-2xl cursor-grab"
                                    style={{
                                        transform: `scale(${zoom}) rotate(${rotation}deg)`,
                                        transition: 'transform 0.2s ease-out',
                                        transformOrigin: 'center center'
                                    }}
                                    draggable={false}
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).src = '/placeholder-image.png';
                                    }}
                                />
                            )}
                        </motion.div>
                    </div>

                    {/* Next Button */}
                    {images.length > 1 && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                goToNext();
                            }}
                            className="absolute right-4 z-10 p-3 rounded-full bg-black/50 hover:bg-black/70 text-white/80 hover:text-white transition-all"
                        >
                            <ChevronRight size={32} />
                        </button>
                    )}
                </div>

                {/* Thumbnail Strip */}
                {images.length > 1 && (
                    <div
                        className="p-4 bg-black/50 flex items-center justify-center gap-2 overflow-x-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {images.map((img, index) => (
                            <button
                                key={img.id || index}
                                onClick={() => {
                                    setCurrentIndex(index);
                                    setZoom(1);
                                    setRotation(0);
                                }}
                                className={`relative w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 transition-all ${index === currentIndex
                                    ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-black'
                                    : 'opacity-50 hover:opacity-100'
                                    }`}
                            >
                                {img.thumbnailUrl ? (
                                    <img 
                                        src={img.thumbnailUrl} 
                                        alt={`Thumbnail ${index + 1}`} 
                                        className="w-full h-full object-cover" 
                                    />
                                ) : img.type === 'video' ? (
                                    <video 
                                        src={`${img.filePath}#t=0.1`} 
                                        className="w-full h-full object-cover"
                                        muted
                                        playsInline
                                    />
                                ) : (
                                    <img 
                                        src={img.filePath} 
                                        alt={`Thumbnail ${index + 1}`} 
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).src = '/placeholder-image.png';
                                        }}
                                    />
                                )}
                            </button>
                        ))}
                    </div>
                )}
            </motion.div>
        </AnimatePresence>
    );
}
