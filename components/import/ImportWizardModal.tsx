"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { UploadCloud, X, ArrowRight, CheckCircle, Search, UserPlus, AlertCircle } from "lucide-react";
import { searchPatients } from "@/app/actions/auth";
import { getSystemStatus } from "@/app/actions/system";
import { cn } from "@/lib/utils"; // Assuming cn utility is available or needs to be added

interface ImportWizardModalProps {
    isOpen: boolean;
    onClose: () => void;
    // If patient is null, it means "Create New Patient"
    onFinish: (files: File[], patient: any | null, importName?: string) => void;
}

type Step = 'select' | 'preview' | 'patient';

export default function ImportWizardModal({ isOpen, onClose, onFinish }: ImportWizardModalProps) {
    const [step, setStep] = useState<Step>('select');
    const [files, setFiles] = useState<File[]>([]);
    const [previews, setPreviews] = useState<{ file: File, url: string, selected: boolean }[]>([]);

    // USB Status
    const [usbConnected, setUsbConnected] = useState<boolean | null>(null);
    const [isCheckingUsb, setIsCheckingUsb] = useState(false);

    // Patient Assignment State
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [selectedPatient, setSelectedPatient] = useState<any | null>(null);
    const [importName, setImportName] = useState("");

    // File Input Ref
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Check USB on Mount/Open
    useEffect(() => {
        if (isOpen) {
            checkUsbStatus();
        }
    }, [isOpen]);

    const checkUsbStatus = async () => {
        setIsCheckingUsb(true);
        try {
            const status = await getSystemStatus();
            setUsbConnected(status.usb);
        } catch (err) {
            console.error("Failed to check USB status:", err);
            setUsbConnected(false);
        } finally {
            setIsCheckingUsb(false);
        }
    };

    // --- STEP 1: FILE HANDLING ---
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!usbConnected) {
            alert("Please connect an external USB storage device to import files.");
            return;
        }
        if (e.target.files && e.target.files.length > 0) {
            const newFiles = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));

            const newPreviews = newFiles.map(f => ({
                file: f,
                url: URL.createObjectURL(f),
                selected: true
            }));

            setFiles(prev => [...prev, ...newFiles]);
            setPreviews(prev => [...prev, ...newPreviews]);
            setStep('preview');
        }
    };

    const toggleSelection = (index: number) => {
        setPreviews(prev => prev.map((p, i) => i === index ? { ...p, selected: !p.selected } : p));
    };

    // --- STEP 2: PATIENT SEARCH ---
    const handleSearch = async (q: string) => {
        setSearchQuery(q);
        if (q.length > 1) {
            const result = await searchPatients(q);
            if (result.success && result.patients) {
                setSearchResults(result.patients);
            } else {
                setSearchResults([]);
            }
        } else {
            setSearchResults([]);
        }
    };

    // --- FINISH ---
    const handleComplete = (isNew: boolean) => {
        // Filter only selected files
        const finalFiles = previews.filter(p => p.selected).map(p => p.file);

        // Default name if empty
        const finalName = importName.trim() || "External Import";

        if (isNew) {
            onFinish(finalFiles, null, finalName); // Null patient -> Create New
        } else if (selectedPatient) {
            onFinish(finalFiles, selectedPatient, finalName);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                onClick={onClose}
            />

            <motion.div
                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
                {/* Header */}
                <div className="h-16 px-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600">
                            <UploadCloud size={20} strokeWidth={2.5} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900 leading-tight">Import External Data</h2>
                            <p className="text-xs font-medium text-slate-500">Add images from USB or Hard Drive</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* USB Restriction Banner */}
                {!usbConnected && !isCheckingUsb && usbConnected !== null && (
                    <div className="bg-amber-50 border-b border-amber-100 px-6 py-3 flex items-center justify-between animate-in slide-in-from-top duration-300">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                                <AlertCircle size={16} />
                            </div>
                            <div>
                                <p className="text-xs font-bold text-amber-900 uppercase tracking-wide">USB STORAGE REQUIRED</p>
                                <p className="text-[11px] font-medium text-amber-700">Please connect an external USB drive to import patient media.</p>
                            </div>
                        </div>
                        <button
                            onClick={checkUsbStatus}
                            className="px-3 py-1.5 bg-amber-600 text-white text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-amber-700 transition-all shadow-sm shadow-amber-500/20"
                        >
                            Retry Check
                        </button>
                    </div>
                )}

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30">

                    {/* STEP 1: SELECT */}
                    {step === 'select' && (
                        <button
                            onClick={() => usbConnected && fileInputRef.current?.click()}
                            disabled={!usbConnected}
                            className={cn(
                                "flex flex-col items-center justify-center w-full min-h-[300px] border-2 border-dashed rounded-3xl transition-all group",
                                usbConnected
                                    ? "border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/30 bg-slate-50/50 cursor-pointer"
                                    : "border-slate-100 bg-slate-50 cursor-not-allowed opacity-60"
                            )}
                        >
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                multiple
                                accept="image/*"
                                onChange={handleFileSelect}
                            />
                            <div className={cn(
                                "w-20 h-20 rounded-full flex items-center justify-center mb-6 transition-all",
                                usbConnected ? "bg-indigo-100 text-indigo-600 group-hover:scale-110" : "bg-slate-200 text-slate-400"
                            )}>
                                <UploadCloud size={32} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-2">
                                {usbConnected ? "Select Patient Media" : "USB Storage Required"}
                            </h3>
                            <p className="text-sm font-medium text-slate-500 max-w-xs text-center leading-relaxed">
                                {usbConnected
                                    ? "Select endoscopic images or clinical photos from your external storage device to begin."
                                    : "Please connect an external USB drive to enable file selection."}
                            </p>

                            {usbConnected && (
                                <div className="mt-8 px-6 py-2.5 bg-indigo-600 text-white text-xs font-black uppercase tracking-[0.2em] rounded-xl shadow-lg shadow-indigo-500/20 group-hover:bg-indigo-700 transition-all">
                                    Browse Files
                                </div>
                            )}
                        </button>
                    )}

                    {/* STEP 2: PREVIEW */}
                    {step === 'preview' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-bold text-slate-900">Selected Images ({previews.filter(p => p.selected).length})</h3>
                                <button onClick={() => fileInputRef.current?.click()} className="text-xs font-bold text-indigo-600 hover:underline">Add More</button>
                            </div>

                            <div className="grid grid-cols-5 gap-3">
                                {previews.map((p, idx) => (
                                    <div
                                        key={idx}
                                        onClick={() => toggleSelection(idx)}
                                        className={`relative aspect-square rounded-xl overflow-hidden cursor-pointer border-2 transition-all ${p.selected ? 'border-indigo-500 ring-2 ring-indigo-500/20' : 'border-transparent opacity-60 grayscale'}`}
                                    >
                                        <img src={p.url} className="w-full h-full object-cover" />
                                        {p.selected && (
                                            <div className="absolute top-2 right-2 bg-indigo-500 text-white rounded-full p-0.5">
                                                <CheckCircle size={14} fill="white" className="text-indigo-500" />
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* STEP 3: PATIENT SELECTION */}
                    {step === 'patient' && (
                        <div className="max-w-2xl mx-auto space-y-8">
                            {/* Import Name Input */}
                            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                                    Name this Import
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. MRI Scan, Previous Endoscopy, External Lab..."
                                    value={importName}
                                    onChange={(e) => setImportName(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-bold text-slate-900 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                                />
                            </div>

                            {/* Option A: Existing Patient */}
                            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs">A</div>
                                    <h3 className="text-sm font-bold text-slate-900">Assign to Existing Patient</h3>
                                </div>

                                <div className="space-y-4">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-3 text-slate-400 w-4 h-4" />
                                        <input
                                            type="text"
                                            placeholder="Search by Name or MRN..."
                                            value={searchQuery}
                                            onChange={(e) => handleSearch(e.target.value)}
                                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white font-medium text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                                        />
                                    </div>
                                    <div className="space-y-2 max-h-48 overflow-y-auto">
                                        {searchResults.map(p => (
                                            <div
                                                key={p.id}
                                                onClick={() => setSelectedPatient(p)}
                                                className={`p-3 rounded-xl border cursor-pointer flex items-center justify-between transition-all ${selectedPatient?.id === p.id ? 'bg-indigo-50 border-indigo-200 ring-1 ring-indigo-500' : 'bg-white border-slate-100 hover:border-indigo-200'}`}
                                            >
                                                <div>
                                                    <p className="text-sm font-bold text-slate-900">{p.fullName}</p>
                                                    <p className="text-xs text-slate-500">MRN: {p.mrn} | {p.age}Y | {p.gender}</p>
                                                </div>
                                                {selectedPatient?.id === p.id && <CheckCircle className="text-indigo-500 w-5 h-5" />}
                                            </div>
                                        ))}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleComplete(false)}
                                        disabled={!selectedPatient}
                                        className="w-full py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-md hover:bg-indigo-700 disabled:opacity-50 disabled:shadow-none transition-all"
                                    >
                                        Import to Selected Patient
                                    </button>
                                </div>
                            </div>

                            {/* Divider */}
                            <div className="relative flex items-center py-2">
                                <div className="flex-grow border-t border-slate-200"></div>
                                <span className="flex-shrink-0 mx-4 text-slate-400 text-xs font-bold uppercase">OR</span>
                                <div className="flex-grow border-t border-slate-200"></div>
                            </div>

                            {/* Option B: New Patient */}
                            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 border-dashed flex items-center justify-between group hover:bg-slate-100 transition-colors cursor-pointer"
                                onClick={() => handleComplete(true)}
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                                        <UserPlus size={20} />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">Create New Patient Profile</h3>
                                        <p className="text-xs text-slate-500">Use the main registration form to create a new profile.</p>
                                    </div>
                                </div>
                                <div className="w-8 h-8 rounded-full bg-white text-slate-400 flex items-center justify-center shadow-sm group-hover:text-emerald-600 group-hover:scale-110 transition-all">
                                    <ArrowRight size={16} />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Buttons */}
                <div className="p-4 border-t border-slate-100 bg-white flex justify-between">
                    <button
                        type="button"
                        onClick={() => {
                            if (step === 'patient') setStep('preview');
                            else if (step === 'preview') setStep('select');
                        }}
                        disabled={step === 'select'}
                        className="px-4 py-2 text-xs font-bold text-slate-500 disabled:opacity-30 hover:text-slate-800 transition-colors"
                    >
                        Back
                    </button>

                    {(step === 'select' || step === 'preview') && (
                        <button
                            type="button"
                            disabled={step === 'select' && files.length === 0}
                            onClick={() => setStep('patient')}
                            className="bg-indigo-600 text-white px-6 py-2 rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/30 flex items-center gap-2 hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:shadow-none"
                        >
                            Next Step <ArrowRight size={16} />
                        </button>
                    )}
                </div>
            </motion.div>
        </div>
    );
}
