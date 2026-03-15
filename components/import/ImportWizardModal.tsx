"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
    UploadCloud, X, ArrowRight, CheckCircle2, Search, 
    UserPlus, AlertCircle, FileText, ImageIcon, Video,
    Sparkles, User, Calendar, Phone, Check, ChevronDown
} from "lucide-react";
import { searchPatients } from "@/app/actions/auth";
import { getSystemStatus } from "@/app/actions/system";
import { cn } from "@/lib/utils";
import USBFilePicker from "@/components/ui/USBFilePicker";

const COUNTRY_DATA = [
    { code: "IN", dialCode: "+91", flag: "🇮🇳", name: "India", length: 10 },
    { code: "US", dialCode: "+1", flag: "🇺🇸", name: "United States", length: 10 },
    { code: "GB", dialCode: "+44", flag: "🇬🇧", name: "United Kingdom", length: 10 },
    { code: "AE", dialCode: "+971", flag: "🇦🇪", name: "United Arab Emirates", length: 9 },
    { code: "OM", dialCode: "+968", flag: "🇴🇲", name: "Oman", length: 8 },
    { code: "KW", dialCode: "+965", flag: "🇰🇼", name: "Kuwait", length: 8 },
    { code: "SA", dialCode: "+966", flag: "🇸🇦", name: "Saudi Arabia", length: 9 },
    { code: "QA", dialCode: "+974", flag: "🇶🇦", name: "Qatar", length: 8 },
];

interface ImportWizardModalProps {
    isOpen: boolean;
    onClose: () => void;
    onFinish: (files: File[], patient: any | null, importData: any, onProgress: (p: number) => void) => Promise<void>;
}

export default function ImportWizardModal({ isOpen, onClose, onFinish }: ImportWizardModalProps) {
    // Media State
    const [previews, setPreviews] = useState<{ file: File, url: string, selected: boolean, type: 'image' | 'video' }[]>([]);
    const [activeMediaTab, setActiveMediaTab] = useState<'images' | 'videos'>('images');

    // USB Status
    const [usbConnected, setUsbConnected] = useState<boolean | null>(null);
    const [isCheckingUsb, setIsCheckingUsb] = useState(false);

    // Form State
    const [patientType, setPatientType] = useState<'new' | 'existing'>('new');
    const [formData, setFormData] = useState({
        fullName: "",
        age: "",
        gender: "Male",
        mobile: "",
        dialCode: "+91",
        countryCode: "IN"
    });
    const [showCountrySelector, setShowCountrySelector] = useState(false);
    const [selectedPatient, setSelectedPatient] = useState<any | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [procedureType, setProcedureType] = useState('Diagnostic Nasal Endoscopy (DNE)');
    const [isSaving, setIsSaving] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [importProgress, setImportProgress] = useState(0);
    const [isSuccess, setIsSuccess] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    
    // File Picker State
    const [isPickerOpen, setIsPickerOpen] = useState(false);

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

    // --- FILE HANDLING ---
    const handleFilesSelected = (files: File[]) => {
        if (!usbConnected || files.length === 0) return;
        
        const newPreviews = files.map(f => {
            const type = f.type.startsWith('video/') || f.name.match(/\.(mp4|webm|mov|avi)$/i) ? 'video' : 'image';
            return {
                file: f,
                url: URL.createObjectURL(f),
                selected: true,
                type: type as 'image' | 'video'
            };
        });

        setPreviews(prev => [...prev, ...newPreviews]);
        if (newPreviews.some(p => p.type === 'video') && !newPreviews.some(p => p.type === 'image')) {
            setActiveMediaTab('videos');
        } else {
            setActiveMediaTab('images');
        }
    };

    // --- FORM HANDLERS ---
    const handleAgeChange = (val: string) => {
        if (!/^[0-9.]*$/.test(val)) return;
        if ((val.match(/\./g) || []).length > 1) return;
        if (/^0[0-9]/.test(val)) return;

        const parts = val.split('.');
        if (val.includes('.') && parts[0] !== '0') return;
        if (parts[1] !== undefined) {
            if (parts[1].length > 2) return;
            if (parts[1].length === 1 && parts[1] === '0') return;
            if (parts[1].length === 2 && (parseInt(parts[1]) < 10 || parseInt(parts[1]) > 11)) return;
        }
        if (parseFloat(val) > 150) return;
        setFormData(prev => ({ ...prev, age: val }));
    };

    const handleMobileChange = (val: string) => {
        if (!/^[0-9]*$/.test(val)) return;
        const country = COUNTRY_DATA.find(c => c.code === formData.countryCode);
        const maxLength = country ? country.length : 10;
        if (val.length > maxLength) return;
        setFormData(prev => ({ ...prev, mobile: val }));
    };

    const toggleSelection = (index: number) => {
        setPreviews(prev => prev.map((p, i) => i === index ? { ...p, selected: !p.selected } : p));
    };

    // --- PATIENT SEARCH ---
    useEffect(() => {
        if (patientType === 'existing' && searchQuery.trim().length >= 2) {
            const delayDebounceFn = setTimeout(async () => {
                setIsSearching(true);
                try {
                    const res = await searchPatients(searchQuery);
                    if (res.success) {
                        setSearchResults(res.patients || []);
                    }
                } catch (e) {
                    console.error("Search error:", e);
                } finally {
                    setIsSearching(false);
                }
            }, 300);

            return () => clearTimeout(delayDebounceFn);
        } else {
            setSearchResults([]);
        }
    }, [searchQuery, patientType]);

    // --- VALIDATION ---
    const validate = () => {
        const selectedFiles = previews.filter(p => p.selected);
        if (selectedFiles.length === 0) {
            setErrors({ global: "Please select at least one image or video to import" });
            return false;
        }

        if (patientType === 'existing') {
            if (!selectedPatient) {
                setErrors({ global: "Please select an existing patient" });
                return false;
            }
            return true;
        }

        const newErrors: Record<string, string> = {};
        const name = formData.fullName.trim();
        if (!name) newErrors.fullName = "Name required";
        else if (name.length < 4) newErrors.fullName = "Min 4 characters";
        
        const ageNum = parseFloat(formData.age);
        if (!formData.age || isNaN(ageNum)) newErrors.age = "Valid age required";
        else if (formData.age.includes('.')) {
            const [yrs, mthsStr] = formData.age.split('.');
            if (yrs !== '0') newErrors.age = "0.1 to 0.11 ONLY";
            else if (!mthsStr || parseInt(mthsStr) < 1 || parseInt(mthsStr) > 11) newErrors.age = "Months 1-11";
        }

        const country = COUNTRY_DATA.find(c => c.code === formData.countryCode);
        const expectedLength = country ? country.length : 10;

        if (!formData.mobile) newErrors.mobile = "Mobile required";
        else if (formData.mobile.length !== expectedLength) newErrors.mobile = `${expectedLength} digits required`;
        
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    // --- FINISH ---
    const handleSave = async () => {
        if (!validate()) return;
        setIsSaving(true);
        setIsImporting(true);
        setImportProgress(0);
        
        const finalFiles = previews.filter(p => p.selected).map(p => p.file);
        
        try {
            const importData = {
                procedureType,
                patientType,
                ...(patientType === 'new' ? formData : { patientId: selectedPatient.id })
            };
            
            await onFinish(
                finalFiles, 
                patientType === 'new' ? null : selectedPatient, 
                importData,
                (p) => setImportProgress(p)
            );
            
            setIsSuccess(true);
            // Auto close after success
            setTimeout(() => {
                onClose();
            }, 2500);
        } catch (err) {
            console.error("Import save failure", err);
            setErrors({ global: "Import failed. Please try again." });
            setIsImporting(false);
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    const filteredMedia = previews.filter(p => p.type === (activeMediaTab === 'images' ? 'image' : 'video'));

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
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
                        className="relative w-full max-w-6xl bg-white rounded-[40px] shadow-[0_32px_128px_-16px_rgba(0,0,0,0.2)] overflow-hidden flex flex-col md:flex-row h-[820px] border border-slate-100 isolate font-plus-jakarta"
                    >
                         <style jsx global>{`
                            @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
                            .font-plus-jakarta {
                                font-family: 'Plus Jakarta Sans', sans-serif;
                            }
                        `}</style>

                        {/* Background Decor */}
                        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-50/70 rounded-full blur-3xl -z-10 -translate-y-1/2 translate-x-1/2" />
                        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-indigo-50/70 rounded-full blur-3xl -z-10 translate-y-1/2 -translate-x-1/2" />

                        {/* Progress / Success Overlay */}
                        <AnimatePresence>
                            {(isImporting || isSuccess) && (
                                <motion.div 
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="absolute inset-0 z-50 bg-white/95 backdrop-blur-md flex flex-col items-center justify-center p-12 text-center"
                                >
                                    {!isSuccess ? (
                                        <div className="w-full max-w-md space-y-8">
                                            <div className="relative w-24 h-24 mx-auto">
                                                <div className="absolute inset-0 border-4 border-blue-100 rounded-full" />
                                                <motion.div 
                                                    className="absolute inset-0 border-4 border-blue-600 rounded-full border-t-transparent"
                                                    animate={{ rotate: 360 }}
                                                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                                />
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    <UploadCloud size={32} className="text-blue-600" />
                                                </div>
                                            </div>
                                            
                                            <div className="space-y-3">
                                                <h4 className="text-2xl font-black text-slate-800 tracking-tight">Importing Media...</h4>
                                                <p className="text-slate-500 font-bold text-sm">Please wait while we process and upload your files.</p>
                                            </div>

                                            <div className="space-y-4">
                                                <div className="h-4 bg-slate-100 rounded-full overflow-hidden shadow-inner border border-slate-200/50">
                                                    <motion.div 
                                                        className="h-full bg-gradient-to-r from-blue-600 to-indigo-600 shadow-[0_0_20px_rgba(37,99,235,0.4)]"
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${importProgress}%` }}
                                                        transition={{ type: "spring", damping: 20, stiffness: 100 }}
                                                    />
                                                </div>
                                                <p className="text-[11px] font-black text-blue-600 uppercase tracking-[0.2em]">{Math.round(importProgress)}% Complete</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <motion.div 
                                            initial={{ scale: 0.8, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            className="w-full max-w-md space-y-8"
                                        >
                                            <div className="w-24 h-24 bg-emerald-100 rounded-full mx-auto flex items-center justify-center text-emerald-600 shadow-xl shadow-emerald-500/10 ring-8 ring-emerald-50">
                                                <CheckCircle2 size={48} />
                                            </div>
                                            
                                            <div className="space-y-3">
                                                <h4 className="text-3xl font-black text-slate-800 tracking-tight">Import Successful!</h4>
                                                <p className="text-slate-500 font-bold text-sm">All media has been successfully assigned and imported.</p>
                                            </div>
                                            
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] pt-4">Closing automatically...</p>
                                        </motion.div>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Left Sidebar - Media Import */}
                        <div className="w-full md:w-[42%] bg-slate-50/30 backdrop-blur-sm p-12 flex flex-col border-r border-slate-100/50 relative">
                            <div className="mb-6 text-blue-600 bg-blue-100/50 w-14 h-14 rounded-[20px] flex items-center justify-center shadow-inner ring-1 ring-blue-200/50">
                                <UploadCloud size={28} />
                            </div>

                            <div className="space-y-4 mb-4">
                                <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight leading-[1.1]">
                                    Import <br/><span className="text-blue-600 uppercase text-xs tracking-[0.2em] font-black block mt-1 opacity-50">External Data</span>
                                </h2>
                                <p className="text-slate-500 font-bold leading-relaxed text-[14px]">
                                    Select patient media from your external storage device to begin the import process.
                                </p>
                            </div>

                            {/* USB Status Indicator */}
                            {!usbConnected && (
                                <div className="mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-100 flex items-center gap-3 animate-in fade-in slide-in-from-left duration-300">
                                    <AlertCircle size={18} className="text-amber-500" />
                                    <div className="flex-1">
                                        <p className="text-[10px] font-black text-amber-800 uppercase tracking-widest leading-none mb-1">USB Required</p>
                                        <p className="text-[11px] font-semibold text-amber-600 leading-tight">Connect external storage to browse files</p>
                                    </div>
                                    <button 
                                        onClick={checkUsbStatus}
                                        disabled={isCheckingUsb}
                                        className="p-1.5 rounded-lg hover:bg-amber-100 text-amber-600 transition-colors"
                                    >
                                        <Check size={14} className={cn(isCheckingUsb && "animate-spin")} />
                                    </button>
                                </div>
                            )}

                            {/* Browse Button */}
                            <button
                                onClick={() => usbConnected && setIsPickerOpen(true)}
                                disabled={!usbConnected}
                                className={cn(
                                    "w-full h-14 rounded-[20px] flex items-center justify-center gap-3 font-black text-xs uppercase tracking-[0.2em] transition-all active:scale-95 mb-8",
                                    usbConnected 
                                        ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20 hover:bg-blue-700" 
                                        : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                                )}
                            >
                                <UploadCloud size={18} />
                                Browse Files
                            </button>

                            {/* Media Tabs & Grid */}
                            <div className="flex-1 flex flex-col min-h-0">
                                <div className="flex gap-6 mb-6 px-1">
                                    <button 
                                        onClick={() => setActiveMediaTab('images')}
                                        className={cn(
                                            "text-[11px] font-black uppercase tracking-[0.2em] transition-all relative pb-2",
                                            activeMediaTab === 'images' ? "text-blue-600" : "text-slate-400 hover:text-slate-600"
                                        )}
                                    >
                                        Images ({previews.filter(p => p.type === 'image').length})
                                        {activeMediaTab === 'images' && <motion.div layoutId="mediaTab" className="absolute bottom-0 inset-x-0 h-0.5 bg-blue-600 rounded-full" />}
                                    </button>
                                    <button 
                                        onClick={() => setActiveMediaTab('videos')}
                                        className={cn(
                                            "text-[11px] font-black uppercase tracking-[0.2em] transition-all relative pb-2",
                                            activeMediaTab === 'videos' ? "text-blue-600" : "text-slate-400 hover:text-slate-600"
                                        )}
                                    >
                                        Videos ({previews.filter(p => p.type === 'video').length})
                                        {activeMediaTab === 'videos' && <motion.div layoutId="mediaTab" className="absolute bottom-0 inset-x-0 h-0.5 bg-blue-600 rounded-full" />}
                                    </button>
                                </div>

                                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                                    {filteredMedia.length > 0 ? (
                                        <div className="grid grid-cols-2 gap-4 pb-4">
                                            {filteredMedia.map((p, i) => (
                                                <motion.div 
                                                    key={i}
                                                    initial={{ opacity: 0, scale: 0.8 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    className={cn(
                                                        "aspect-square rounded-[24px] overflow-hidden border-[4px] shadow-xl transition-all cursor-pointer relative group",
                                                        p.selected ? "border-blue-500 shadow-blue-500/10" : "border-white opacity-40 grayscale"
                                                    )}
                                                    onClick={() => toggleSelection(previews.indexOf(p))}
                                                >
                                                    {p.type === 'image' ? (
                                                        <img src={p.url} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full bg-slate-100 flex items-center justify-center relative">
                                                            <video 
                                                                src={`${p.url}#t=0.1`} 
                                                                className="w-full h-full object-cover"
                                                                muted
                                                                playsInline
                                                            />
                                                            <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                                                                <Video size={24} className="text-white" />
                                                            </div>
                                                        </div>
                                                    )}
                                                    {p.selected && (
                                                        <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white shadow-lg">
                                                            <Check size={14} strokeWidth={3} />
                                                        </div>
                                                    )}
                                                </motion.div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="h-full flex flex-col items-center justify-center text-slate-300 opacity-50 space-y-4">
                                            {activeMediaTab === 'images' ? <ImageIcon size={48} /> : <Video size={48} />}
                                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-center">
                                                No {activeMediaTab} selected
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Right Pane - Form Content */}
                        <div className="w-full md:w-[58%] p-14 flex flex-col bg-white/50 backdrop-blur-md overflow-hidden">
                            <div className="flex items-start justify-between mb-8">
                                <div>
                                    <div className="flex items-center gap-2 text-blue-600 font-extrabold text-[11px] uppercase tracking-[0.3em] mb-3 px-1">
                                        <div className="w-2 h-2 rounded-full bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.4)]" />
                                        Medical Record Import
                                    </div>
                                    <h3 className="text-3xl font-black text-slate-800 tracking-tight">Assign Patient Details</h3>
                                </div>
                                <button 
                                    onClick={onClose} 
                                    className="w-12 h-12 flex items-center justify-center rounded-full bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-800 transition-all hover:rotate-90"
                                >
                                    <X size={24} />
                                </button>
                            </div>

                            {/* Patient Type Toggle */}
                            <div className="flex p-1.5 bg-slate-100 rounded-2xl mb-8 w-fit">
                                <button
                                    onClick={() => setPatientType('new')}
                                    className={cn(
                                        "px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                                        patientType === 'new' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                                    )}
                                >
                                    New Patient
                                </button>
                                <button
                                    onClick={() => setPatientType('existing')}
                                    className={cn(
                                        "px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                                        patientType === 'existing' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                                    )}
                                >
                                    Existing Patient
                                </button>
                            </div>

                            <div className="flex-1 space-y-6 overflow-y-auto pr-2 custom-scrollbar pb-4">
                                {patientType === 'new' ? (
                                    <div className="space-y-6">
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between px-1">
                                                <label className="text-sm font-bold text-slate-700 tracking-tight">Patient Name <span className="text-red-500">*</span></label>
                                                {errors.fullName && <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">{errors.fullName}</span>}
                                            </div>
                                            <div className="relative group/input">
                                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within/input:text-blue-600 transition-colors pointer-events-none">
                                                    <User size={18} />
                                                </div>
                                                <input
                                                    type="text"
                                                    value={formData.fullName}
                                                    onChange={e => setFormData({...formData, fullName: e.target.value})}
                                                    placeholder="Eg. Rajesh Kumar"
                                                    className={cn(
                                                        "w-full h-12 pl-11 pr-4 bg-white border rounded-xl text-sm font-semibold text-slate-900 placeholder:text-slate-400 transition-all outline-none",
                                                        errors.fullName ? "border-red-400 focus:border-red-500 bg-red-50/10" : "border-slate-200 focus:border-blue-600 focus:ring-4 focus:ring-blue-100/30"
                                                    )}
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-8">
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between px-1">
                                                    <label className="text-sm font-bold text-slate-700 tracking-tight">Age <span className="text-red-500">*</span></label>
                                                    {errors.age && <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">{errors.age}</span>}
                                                </div>
                                                <div className="relative group/input">
                                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within/input:text-blue-600 transition-colors pointer-events-none">
                                                        <Calendar size={18} />
                                                    </div>
                                                    <input
                                                        type="text"
                                                        value={formData.age}
                                                        onChange={e => handleAgeChange(e.target.value)}
                                                        placeholder="Eg. 25 or 0.6"
                                                        className={cn(
                                                            "w-full h-12 pl-11 pr-4 bg-white border rounded-xl text-sm font-semibold text-slate-900 placeholder:text-slate-400 transition-all outline-none",
                                                            errors.age ? "border-red-400 focus:border-red-500 bg-red-50/10" : "border-slate-200 focus:border-blue-600 focus:ring-4 focus:ring-blue-100/30"
                                                        )}
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-sm font-bold text-slate-700 tracking-tight px-1">Gender <span className="text-red-500">*</span></label>
                                                <div className="flex p-1 bg-slate-100/80 border border-slate-200 rounded-xl h-12">
                                                    {['Male', 'Female', 'Others'].map(g => (
                                                        <button
                                                            key={g}
                                                            type="button"
                                                            onClick={() => setFormData({...formData, gender: g})}
                                                            className={cn(
                                                                "flex-1 text-sm font-bold rounded-lg transition-all",
                                                                formData.gender === g 
                                                                    ? "bg-white text-blue-700 shadow-sm border border-slate-200/50" 
                                                                    : "text-slate-500 hover:text-slate-700"
                                                            )}
                                                        >
                                                            {g}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between px-1">
                                                <label className="text-sm font-bold text-slate-700 tracking-tight">Mobile No <span className="text-red-500">*</span></label>
                                                {errors.mobile && <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">{errors.mobile}</span>}
                                            </div>
                                            <div className="flex gap-2 relative group/input">
                                                <div className="relative shrink-0 w-28">
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowCountrySelector(!showCountrySelector)}
                                                        className="w-full h-12 flex items-center justify-between px-3 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition-all"
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm">{COUNTRY_DATA.find(c => c.code === formData.countryCode)?.flag}</span>
                                                            <span className="text-xs font-bold text-slate-700">{formData.dialCode}</span>
                                                        </div>
                                                        <ChevronDown size={14} className={cn("text-slate-400 transition-transform", showCountrySelector && "rotate-180")} />
                                                    </button>

                                                    <AnimatePresence>
                                                        {showCountrySelector && (
                                                            <>
                                                                <div 
                                                                    className="fixed inset-0 z-[210]" 
                                                                    onClick={() => setShowCountrySelector(false)} 
                                                                />
                                                                <motion.div
                                                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                                                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                                                    className="absolute bottom-full left-0 mb-2 w-48 bg-white rounded-2xl shadow-2xl border border-slate-100 py-2 z-[220] max-h-[300px] overflow-y-auto custom-scrollbar"
                                                                >
                                                                    {COUNTRY_DATA.map((country) => (
                                                                        <button
                                                                            key={country.code}
                                                                            type="button"
                                                                            onClick={() => {
                                                                                setFormData({
                                                                                    ...formData,
                                                                                    countryCode: country.code,
                                                                                    dialCode: country.dialCode,
                                                                                    mobile: "" // Clear mobile when country changes to avoid invalid length
                                                                                });
                                                                                setShowCountrySelector(false);
                                                                            }}
                                                                            className={cn(
                                                                                "w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 transition-colors",
                                                                                formData.countryCode === country.code && "bg-blue-50/50"
                                                                            )}
                                                                        >
                                                                            <span className="text-lg">{country.flag}</span>
                                                                            <div className="flex flex-col">
                                                                                <span className="text-[11px] font-bold text-slate-800">{country.name}</span>
                                                                                <span className="text-[10px] font-medium text-slate-400">{country.dialCode}</span>
                                                                            </div>
                                                                            {formData.countryCode === country.code && (
                                                                                <Check size={12} className="ml-auto text-blue-600" />
                                                                            )}
                                                                        </button>
                                                                    ))}
                                                                </motion.div>
                                                            </>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                                <div className="relative flex-1 group/field">
                                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within/field:text-blue-600 transition-colors pointer-events-none">
                                                        <Phone size={16} />
                                                    </div>
                                                    <input
                                                        type="tel"
                                                        value={formData.mobile}
                                                        onChange={e => handleMobileChange(e.target.value)}
                                                        placeholder="Mobile number"
                                                        className={cn(
                                                            "w-full h-12 pl-11 pr-4 bg-white border rounded-xl text-sm font-semibold text-slate-900 placeholder:text-slate-400 transition-all outline-none",
                                                            errors.mobile ? "border-red-400 focus:border-red-500 bg-red-50/10" : "border-slate-200 focus:border-blue-600 focus:ring-4 focus:ring-blue-100/30"
                                                        )}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        <div className="space-y-3">
                                            <label className="text-sm font-bold text-slate-700 tracking-tight px-1">Search Patient</label>
                                            <div className="relative group/search">
                                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within/search:text-blue-600 transition-colors">
                                                    <Search size={18} />
                                                </div>
                                                <input
                                                    type="text"
                                                    value={searchQuery}
                                                    onChange={e => setSearchQuery(e.target.value)}
                                                    placeholder="Search by Name, MRN or Phone..."
                                                    className="w-full h-12 pl-12 pr-4 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100/20 transition-all outline-none"
                                                />
                                                {isSearching && (
                                                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                                        <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="space-y-3 min-h-[200px]">
                                            {searchResults.length > 0 ? (
                                                <div className="grid grid-cols-1 gap-2 max-h-[300px] overflow-y-auto pr-1">
                                                    {searchResults.map(p => (
                                                        <button
                                                            key={p.id}
                                                            type="button"
                                                            onClick={() => setSelectedPatient(p)}
                                                            className={cn(
                                                                "flex items-center justify-between p-4 rounded-2xl border transition-all text-left",
                                                                selectedPatient?.id === p.id 
                                                                    ? "border-blue-500 bg-blue-50/50 ring-1 ring-blue-500 shadow-sm" 
                                                                    : "border-slate-100 bg-slate-50/30 hover:bg-slate-50 hover:border-slate-200"
                                                            )}
                                                        >
                                                            <div className="flex items-center gap-4">
                                                                <div className={cn(
                                                                    "w-10 h-10 rounded-full flex items-center justify-center font-bold",
                                                                    selectedPatient?.id === p.id ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500"
                                                                )}>
                                                                    {p.fullName[0].toUpperCase()}
                                                                </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="text-sm font-bold text-slate-800">{p.fullName}</div>
                                                                        {p.procedures?.some((proc: any) => proc.source === 'External Import' || proc.type === 'External Import' || (proc.type && proc.type.toLowerCase().includes('import'))) && (
                                                                            <div className="flex items-center gap-1 bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tight border border-blue-200/60 shadow-sm shrink-0 whitespace-nowrap">
                                                                                <UploadCloud size={9} strokeWidth={3} />
                                                                                <span>Imported</span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                                                        MRN: {p.mrn} • {p.gender} • {p.age} Yrs
                                                                    </div>
                                                            </div>
                                                            {selectedPatient?.id === p.id && (
                                                                <Check className="text-blue-600" size={20} />
                                                            )}
                                                        </button>
                                                    ))}
                                                </div>
                                            ) : searchQuery.length >= 2 && !isSearching ? (
                                                <div className="py-12 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50 rounded-3xl border border-dashed border-slate-200">
                                                    <User size={32} className="opacity-20 mb-3" />
                                                    <p className="text-xs font-bold uppercase tracking-widest">No patients found</p>
                                                </div>
                                            ) : (
                                                <div className="py-12 flex flex-col items-center justify-center text-slate-300">
                                                    <Search size={32} className="opacity-10 mb-3" />
                                                    <p className="text-[10px] font-black uppercase tracking-[0.2em]">Start typing to search...</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Procedure Dropdown - ALWAYS VISIBLE OR ONLY FOR EXISTING? */}
                                <div className="space-y-2 pt-4 border-t border-slate-100">
                                    <label className="text-sm font-bold text-slate-700 tracking-tight px-1">Procedure Carried Out</label>
                                    <div className="relative group/select">
                                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within/select:text-blue-600 transition-colors pointer-events-none">
                                            <Sparkles size={18} />
                                        </div>
                                        <select
                                            value={procedureType}
                                            onChange={e => setProcedureType(e.target.value)}
                                            className="w-full h-12 pl-11 pr-10 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 appearance-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100/30 transition-all outline-none cursor-pointer"
                                        >
                                            <option>Diagnostic Nasal Endoscopy (DNE)</option>
                                            <option>Rigid Video Laryngoscopy (RVL)</option>
                                            <option>Flexible Video Laryngoscopy (FVL)</option>
                                            <option>Video Stroboscopy</option>
                                            <option>Otoendoscopy</option>
                                            <option>Pharyngoscopy</option>
                                            <option>Nasopharyngoscopy</option>
                                            <option>Sleep Apnea Endoscopy (DISE)</option>
                                            <option>Others</option>
                                        </select>
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                                            <ChevronDown size={18} />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Footer Actions */}
                            <div className="pt-8 border-t border-slate-100 flex items-center justify-between mt-auto">
                                <button
                                    onClick={onClose}
                                    className="px-8 h-12 rounded-2xl text-slate-500 font-bold hover:text-slate-800 hover:bg-slate-100 transition-all text-sm"
                                >
                                    Cancel
                                </button>
                                
                                <div className="flex items-center gap-4">
                                    {errors.global && (
                                        <p className="text-[10px] font-black text-red-500 uppercase tracking-widest">{errors.global}</p>
                                    )}
                                    <button
                                        onClick={handleSave}
                                        disabled={isSaving}
                                        className={cn(
                                            "px-10 h-12 rounded-[20px] bg-slate-900 text-white font-black text-sm transition-all flex items-center gap-3 active:scale-95 shadow-lg shadow-slate-900/10",
                                            isSaving ? "opacity-70 cursor-not-allowed" : "hover:bg-blue-600 hover:shadow-blue-500/20"
                                        )}
                                    >
                                        {isSaving ? (
                                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        ) : (
                                            <CheckCircle2 size={18} />
                                        )}
                                        {patientType === 'existing' ? 'Link and Import' : 'Register and Import'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
            
            <USBFilePicker 
                isOpen={isPickerOpen}
                onClose={() => setIsPickerOpen(false)}
                onFilesSelected={handleFilesSelected}
                title="Import Media"
                accept="image/*,video/*"
                multiple
            />
        </AnimatePresence>
    );
}

