"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
    X, User, Phone, Calendar, Save, ImageIcon, 
    AlertCircle, CheckCircle2, ArrowRight, Sparkles,
    Search, Check, ChevronDown
} from "lucide-react";
import { cn } from "@/lib/utils";
import { searchPatients } from "@/app/actions/auth";

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

interface QuickPatientPopupProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: any) => Promise<void>;
    captures: any[];
    initialData?: any;
}

export default function QuickPatientPopup({ isOpen, onClose, onSave, captures, initialData }: QuickPatientPopupProps) {
    const [formData, setFormData] = useState({
        fullName: initialData?.fullName || "",
        age: "",
        gender: "Male",
        mobile: "",
        dialCode: "+91",
        countryCode: "IN",
        procedureType: "Diagnostic Nasal Endoscopy (DNE)"
    });
    const [showCountrySelector, setShowCountrySelector] = useState(false);
    const [patientType, setPatientType] = useState<'new' | 'existing'>('new');
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [selectedPatient, setSelectedPatient] = useState<any>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        if (isOpen && initialData) {
            setFormData({
                fullName: initialData.fullName || "",
                age: initialData.age ? initialData.age.toString() : "",
                gender: initialData.gender || "Male",
                mobile: initialData.mobile || "",
                dialCode: initialData.dialCode || "+91",
                countryCode: initialData.countryCode || "IN",
                procedureType: "Diagnostic Nasal Endoscopy (DNE)"
            });
            setErrors({});
            setPatientType('new');
            setSelectedPatient(null);
        }
    }, [isOpen, initialData]);

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

    const validate = () => {
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

    const handleSave = async () => {
        if (!validate()) return;
        setIsSaving(true);
        try {
            if (patientType === 'existing') {
                await onSave({
                    type: 'existing',
                    patientId: selectedPatient.id
                });
            } else {
                await onSave({
                    type: 'new',
                    ...formData
                });
            }
        } catch (err) {
            console.error("Quick save failure", err);
        } finally {
            setIsSaving(false);
        }
    };

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
                        className="relative w-full max-w-6xl bg-white rounded-[40px] shadow-[0_32px_128px_-16px_rgba(0,0,0,0.2)] overflow-hidden flex flex-col md:flex-row h-[820px] border border-slate-100 isolate"
                    >
                        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-50/70 rounded-full blur-3xl -z-10 -translate-y-1/2 translate-x-1/2" />
                        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-indigo-50/70 rounded-full blur-3xl -z-10 translate-y-1/2 -translate-x-1/2" />

                        <div className="w-full md:w-[42%] bg-slate-50/30 backdrop-blur-sm p-12 flex flex-col border-r border-slate-100/50 relative">
                            <div className="mb-6 text-blue-600 bg-blue-100/50 w-14 h-14 rounded-[20px] flex items-center justify-center shadow-inner ring-1 ring-blue-200/50">
                                <Sparkles size={28} />
                            </div>

                            <div className="space-y-4 mb-8">
                                <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight leading-[1.1] font-['Plus_Jakarta_Sans']">
                                    Media <br/><span className="text-blue-600 transition-colors uppercase text-xs tracking-[0.2em] font-black block mt-1 opacity-50">Captured Success</span>
                                </h2>
                                <p className="text-slate-500 font-bold leading-relaxed text-[14px] max-w-[280px] font-['Plus_Jakarta_Sans']">
                                    A quick session has been recorded. Add patient details now to move this patient to the main registry.
                                </p>
                            </div>

                             <div className="flex-1 overflow-visible pointer-events-none select-none">
                                <div className="grid grid-cols-2 gap-4 pb-4">
                                    {captures.slice(0, 4).map((cap, i) => (
                                        <motion.div 
                                            key={cap.id}
                                            initial={{ opacity: 0, scale: 0.8 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ delay: 0.2 + (i * 0.1) }}
                                            className="aspect-square rounded-[24px] overflow-hidden border-[4px] border-white shadow-xl shadow-blue-500/5 bg-slate-100 relative group"
                                        >
                                            <img src={cap.url} alt="" className="w-full h-full object-cover" />
                                            {cap.type === 'video' && (
                                                <div className="absolute inset-0 flex items-center justify-center bg-black/10 backdrop-blur-[2px]">
                                                    <div className="w-10 h-10 rounded-full bg-white/50 flex items-center justify-center ring-1 ring-white/60 backdrop-blur-md">
                                                        <div className="w-0 h-0 border-t-5 border-t-transparent border-l-8 border-l-white border-b-5 border-b-transparent ml-1" />
                                                    </div>
                                                </div>
                                            )}
                                        </motion.div>
                                    ))}
                                </div>
                                {captures.length > 4 && (
                                    <div className="flex items-center gap-3 text-[11px] font-black text-slate-400 tracking-[0.2em] uppercase ml-1">
                                        <span className="w-10 h-[2px] bg-slate-100 rounded-full" />
                                        <span>+ {captures.length - 4} more captures</span>
                                    </div>
                                )}
                            </div>

                            <div className="mt-auto pt-6 border-t border-slate-100/50">
                                <div className="flex gap-4 p-5 rounded-[24px] bg-amber-50/60 border border-amber-100/50 shadow-sm shadow-amber-900/5">
                                    <AlertCircle size={20} className="text-amber-500 shrink-0" />
                                    <p className="text-[11px] font-semibold text-amber-800/70 leading-relaxed">
                                        Closing without saving will keep this record in the <span className="text-amber-600 font-bold underline decoration-amber-200 underline-offset-2">Guest List</span> for later review.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="w-full md:w-[58%] p-14 flex flex-col bg-white/50 backdrop-blur-md overflow-hidden">
                            <div className="flex items-start justify-between mb-8">
                                <div>
                                    <div className="flex items-center gap-2 text-blue-600 font-extrabold text-[11px] uppercase tracking-[0.3em] mb-3 px-1">
                                        <div className="w-2 h-2 rounded-full bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.4)]" />
                                        Direct Procedure Entry
                                    </div>
                                    <h3 className="text-3xl font-black text-slate-800 tracking-tight font-['Plus_Jakarta_Sans']">Complete Registration</h3>
                                </div>
                                <button 
                                    onClick={onClose} 
                                    className="w-12 h-12 flex items-center justify-center rounded-full bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-800 transition-all hover:rotate-90"
                                >
                                    <X size={24} />
                                </button>
                            </div>

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

                             <div className="flex-1 space-y-8 overflow-y-auto pr-2 custom-scrollbar pb-4">
                                {patientType === 'new' ? (
                                    <>
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
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
                                                    onChange={e => {
                                                        if (!/^[a-zA-Z\s]*$/.test(e.target.value) || e.target.value.length > 22) return;
                                                        setFormData({...formData, fullName: e.target.value});
                                                    }}
                                                    placeholder="Eg. Rajesh Kumar"
                                                    className={cn(
                                                        "w-full h-11 pl-11 pr-4 bg-white border rounded-xl text-sm font-semibold text-slate-900 placeholder:text-slate-400/80 transition-all outline-none font-['Plus_Jakarta_Sans']",
                                                        errors.fullName ? "border-red-400 bg-red-50/10 focus:border-red-500 ring-1 ring-red-50" : "border-slate-200 focus:border-blue-600 focus:bg-blue-50/5 focus:ring-4 focus:ring-blue-100/50"
                                                    )}
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-10">
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between">
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
                                                        placeholder="Eg. 25 or 0.6 (months)"
                                                        className={cn(
                                                            "w-full h-11 pl-11 pr-4 bg-white border rounded-xl text-sm font-semibold text-slate-900 placeholder:text-slate-400 transition-all outline-none font-['Plus_Jakarta_Sans']",
                                                            errors.age ? "border-red-400 bg-red-50/10 focus:border-red-500 ring-1 ring-red-50" : "border-slate-200 focus:border-blue-600 focus:bg-blue-50/5 focus:ring-4 focus:ring-blue-100/50"
                                                        )}
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-sm font-bold text-slate-700 tracking-tight">Gender <span className="text-red-500">*</span></label>
                                                <div className={cn(
                                                    "flex p-1 rounded-xl border h-11 transition-all font-['Plus_Jakarta_Sans']",
                                                    errors.gender ? "bg-red-50 border-red-200" : "bg-slate-100/80 border-slate-200"
                                                )}>
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
                                            <div className="flex items-center justify-between">
                                                <label className="text-sm font-bold text-slate-700 tracking-tight">Mobile No <span className="text-red-500">*</span></label>
                                                {errors.mobile && <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">{errors.mobile}</span>}
                                            </div>
                                            <div className="flex gap-2 relative group/input">
                                                <div className="relative shrink-0 w-28">
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowCountrySelector(!showCountrySelector)}
                                                        className="w-full h-11 flex items-center justify-between px-3 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition-all font-['Plus_Jakarta_Sans']"
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
                                                            "w-full h-11 pl-11 pr-4 bg-white border rounded-xl text-sm font-semibold text-slate-900 placeholder:text-slate-400 transition-all outline-none font-['Plus_Jakarta_Sans']",
                                                            errors.mobile ? "border-red-400 bg-red-50/10 focus:border-red-500 ring-1 ring-red-50" : "border-slate-200 focus:border-blue-600 focus:bg-blue-50/5 focus:ring-4 focus:ring-blue-100/50"
                                                        )}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="space-y-6">
                                        <div className="space-y-3">
                                            <label className="text-sm font-bold text-slate-700 tracking-tight">Search Existing Patient</label>
                                            <div className="relative group/search">
                                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within/search:text-blue-600 transition-colors">
                                                    <Search size={18} />
                                                </div>
                                                    <input
                                                        type="text"
                                                        value={searchQuery}
                                                        onChange={e => setSearchQuery(e.target.value)}
                                                        placeholder="Search by Name, MRN or Phone..."
                                                        className="w-full h-12 pl-12 pr-4 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100/50 transition-all outline-none font-['Plus_Jakarta_Sans']"
                                                    />
                                                    {isSearching && (
                                                        <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                                            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                                                        </div>
                                                    )}
                                            </div>
                                        </div>

                                        <div className="space-y-3">
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
                                                                <div>
                                                                    <div className="text-sm font-bold text-slate-800">{p.fullName}</div>
                                                                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                                                        MRN: {p.mrn} • {p.gender} • {p.age} Yrs
                                                                    </div>
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
                                                    <p className="text-xs font-bold uppercase tracking-widest font-['Plus_Jakarta_Sans']">No patients found</p>
                                                </div>
                                            ) : (
                                                <div className="py-12 flex flex-col items-center justify-center text-slate-300">
                                                    <Search size={32} className="opacity-20 mb-3" />
                                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] font-['Plus_Jakarta_Sans']">Start typing to search...</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Procedure Dropdown */}
                                <div className="space-y-2 pt-4 border-t border-slate-100 mt-6">
                                    <label className="text-xs font-black text-slate-700 uppercase tracking-[0.2em] px-1">Procedure Carried Out</label>
                                    <div className="relative group/select">
                                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within/select:text-blue-600 transition-colors pointer-events-none">
                                            <Sparkles size={18} />
                                        </div>
                                        <select
                                            value={formData.procedureType}
                                            onChange={e => setFormData(prev => ({ ...prev, procedureType: e.target.value }))}
                                            className="w-full h-12 pl-11 pr-10 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 appearance-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100/30 transition-all outline-none cursor-pointer font-['Plus_Jakarta_Sans']"
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

                            <div className="pt-8 border-t border-slate-100 flex items-center justify-between bg-white/50 backdrop-blur-sm mt-auto">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="px-8 h-12 rounded-2xl text-slate-500 font-bold hover:text-slate-800 hover:bg-slate-100 transition-all text-sm"
                                >
                                    Cancel
                                </button>
                                
                                <div className="flex items-center gap-4">
                                    {errors.global && (
                                        <span className="text-[10px] font-black text-red-500 uppercase tracking-[0.2em]">{errors.global}</span>
                                    )}
                                    <button
                                        type="button"
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
                                        {patientType === 'existing' ? 'Link Patient' : 'Register Patient'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
