"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { UserPlus, Loader2, AlertCircle, Check, ClipboardCheck, User, Calendar, Phone, Mail, MapPin, Stethoscope, FileText, ChevronDown, Lock, Hash, ShieldCheck, Search, X, UploadCloud, Play, RotateCcw, Info } from "lucide-react";
import { createPatient, updatePatient, checkMobileExists, getNextMRN, getReferringPhysicians, checkEmailExists, checkDuplicatePatient } from "@/app/actions/auth";
import { encodeProcedureType } from "@/types/procedureTypes";

import { resolveImageUrl } from "@/lib/utils/image";
import { cn } from "@/lib/utils";
interface NewPatientFormProps {
    onSuccess: (patient: any, procedureType?: string) => void;
    editingPatient?: any;
    orgLogo?: string;
    onCancel?: () => void;
    onDuplicateMobile?: (mobile: string) => void;
    orgName?: string; // Added orgName to props
    onImport?: () => void;
    isMediaImported?: boolean;
    onDirectProcedure?: () => void;
    isCameraConnected?: boolean;
}

const GENDER_OPTIONS = ["Male", "Female", "Other"];

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

export default function NewPatientForm({
    onSuccess,
    editingPatient,
    orgLogo,
    onCancel,
    onDuplicateMobile,
    orgName = "Org",
    onImport,
    isMediaImported,
    onDirectProcedure,
    isCameraConnected = false
}: NewPatientFormProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [logoError, setLogoError] = useState(false);
    const [error, setError] = useState('');
    const [nextMRN, setNextMRN] = useState<string>('');
    const [physicianSuggestions, setPhysicianSuggestions] = useState<string[]>([]);
    const [showPhysicianSuggestions, setShowPhysicianSuggestions] = useState(false);

    const fetchNextMRN = async () => {
        const result = await getNextMRN();
        if (result.success && result.mrn) {
            setNextMRN(result.mrn);
        }
    };

    const fetchPhysicians = async () => {
        const result = await getReferringPhysicians();
        if (result.success) {
            setPhysicianSuggestions(result.physicians);
        }
    };

    React.useEffect(() => {
        // Fetch next real MRN for new patients OR guests being registered
        const isGuest = editingPatient?.refId === 'GUEST';
        if (!editingPatient || isGuest) {
            fetchNextMRN();
            fetchPhysicians();
        }
    }, [editingPatient]);

    const [mobileStatus, setMobileStatus] = useState<'idle' | 'checking' | 'exists' | 'available'>('idle');
    const [mobileCheckMessage, setMobileCheckMessage] = useState('');
    const [emailStatus, setEmailStatus] = useState<'idle' | 'checking' | 'exists' | 'available'>('idle');

    const [formData, setFormData] = useState({
        fullName: '',
        age: '',
        gender: '',
        mobile: '',
        dialCode: '+91', 
        countryCode: 'IN',
        email: '',
        address: '',
        referringDoctor: '',
        refId: '',
        notes: ''
    });

    const [ageUnit, setAgeUnit] = useState<'YRS' | 'MTHS'>('YRS');

    React.useEffect(() => {
        if (editingPatient) {
            const isGuest = editingPatient.refId === 'GUEST' || editingPatient.fullName === 'Guest Patient';
            let ageDisplay = '';
            if (editingPatient.age !== undefined && editingPatient.age !== null) {
                const ageNum = editingPatient.age;
                if (ageNum < 1) {
                    // Convert float (e.g. 0.5) back to notation (0.6)
                    const mths = Math.round(ageNum * 12);
                    ageDisplay = `0.${mths}`;
                } else {
                    // Ensure whole number for adults
                    ageDisplay = Math.floor(ageNum).toString();
                }
            }

            setFormData({
                fullName: isGuest ? '' : (editingPatient.fullName || ''),
                age: isGuest ? '' : ageDisplay,
                gender: isGuest ? '' : (editingPatient.gender || ''),
                mobile: isGuest ? '' : (editingPatient.mobile || ''),
                dialCode: editingPatient.dialCode || '+91', 
                countryCode: editingPatient.countryCode || 'IN',
                email: editingPatient.email || '',
                address: editingPatient.address || '',
                referringDoctor: isGuest ? '' : (editingPatient.referringDoctor || ''),
                refId: editingPatient.refId || '',
                notes: editingPatient.notes || ''
            });
            setAgeUnit(editingPatient.age && editingPatient.age < 1 ? 'MTHS' : 'YRS');
            setMobileStatus('idle');
            setEmailStatus('idle');
        } else {
            setFormData({
                fullName: '',
                age: '',
                gender: '',
                mobile: '',
                dialCode: '+91',
                countryCode: 'IN',
                email: '',
                address: '',
                referringDoctor: '',
                refId: '',
                notes: ''
            });
            fetchNextMRN();
            fetchPhysicians();
        }
    }, [editingPatient]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;

        // Strict character type validation & length limits
        if (name === 'fullName') {
            // Only letters and spaces, max 22
            if (!/^[a-zA-Z\s]*$/.test(value) || value.length > 22) return;
        }

        if (name === 'age') {
            // Only digits and one decimal point
            if (!/^[0-9.]*$/.test(value)) return;
            if ((value.match(/\./g) || []).length > 1) return;

            // No leading zeros for whole numbers (07 → block)
            if (/^0[0-9]/.test(value)) return;

            const parts = value.split('.');
            const intPart = parts[0];
            const decPart = parts[1]; // undefined if no decimal yet

            // Only allow decimal if integer part is 0 (infant mode)
            if (value.includes('.') && intPart !== '0') return;

            if (decPart !== undefined) {
                // Max 2 decimal digits (only for 10 or 11)
                if (decPart.length > 2) return;

                // 1 digit: must be 1–9
                if (decPart.length === 1) {
                    if (decPart === '0') return; // 0.0 -> block, must be 0.1+
                }

                // 2 digits: only 10 or 11 are valid
                if (decPart.length === 2) {
                    const monthNum = parseInt(decPart, 10);
                    if (monthNum < 10 || monthNum > 11) return;
                }
            }

            // Max age cap
            if (parseFloat(value) > 150) return;
        }

        if (name === 'mobile') {
            // Only digits, length cap depends on country
            const currentCountry = COUNTRY_DATA.find(c => c.code === formData.countryCode) || COUNTRY_DATA[0];
            if (!/^[0-9]*$/.test(value) || value.length > currentCountry.length) return;
        }

        if (name === 'address' && value.length > 250) return;

        if (name === 'referringDoctor') {
            // Letters, spaces, dots, max 72
            if (!/^[a-zA-Z\s.]*$/.test(value) || value.length > 72) return;
        }

        if (name === 'email' && value.length > 255) return;

        if (name === 'refId' && value.length > 50) return;

        setFormData(prev => ({ ...prev, [name]: value }));
        setError('');

        if (name === 'mobile') {
            setMobileStatus('idle');
            setMobileCheckMessage('');
        }

        if (name === 'email') {
            setEmailStatus('idle');
        }
    };

    const renderCharCounter = (current: number, max: number, threshold: number) => {
        if (current <= (max - threshold)) return null;
        const remaining = max - current;
        return (
            <span className={cn(
                "text-[10px] font-extrabold tracking-wider ml-auto px-2 py-0.5 rounded-md",
                remaining <= 5 ? "bg-rose-100 text-rose-600" : "bg-blue-50 text-blue-600"
            )}>
                {remaining}/{max} CHARACTERS REMAINING
            </span>
        );
    };

    const validate = () => {
        const name = formData.fullName.trim();
        if (!name) return "Patient name is required";
        if (name.length < 4) return "Name must be at least 4 characters";
        if (!/^[a-zA-Z\s]+$/.test(name)) return "Name can only contain letters, spaces";

        const ageNum = parseFloat(formData.age);
        if (!formData.age || isNaN(ageNum)) return "Valid age required";
        if (ageNum < 0) return "Age cannot be negative";
        if (ageNum > 150) return "Age must be realistic";

        // Decimal age = infant months (0.1 to 0.11). Enforce strictly.
        if (formData.age.includes('.')) {
            const [yrs, mthsStr] = formData.age.split('.');
            if (yrs !== '0') return "Decimal age only allowed for infants (0.1 to 0.11)";
            if (!mthsStr || mthsStr === '') return "Enter months (1-11) after decimal";
            const mths = parseInt(mthsStr, 10);
            if (mths < 1 || mths > 11) return "Infant age must be between 0.1 and 0.11 months";
        }

        const currentCountry = COUNTRY_DATA.find(c => c.code === formData.countryCode) || COUNTRY_DATA[0];
        if (!formData.mobile.trim() || formData.mobile.length < currentCountry.length) return `Mobile number must be ${currentCountry.length} digits for ${currentCountry.name}`;
        if (!formData.gender) return "Gender selection is required";
        if (formData.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) return "Valid email address required";
        return null;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const validationError = validate();
        if (validationError) {
            setError(validationError);
            return;
        }

        setIsSubmitting(true);
        setError('');

        // Prepare numeric age: Years + (Months / 12)
        const [yrsStr, mthsStr] = formData.age.split('.');
        const yrs = parseInt(yrsStr || '0');
        const mths = parseInt(mthsStr || '0');
        const numericAge = yrs + (mths / 12);

        try {
            // Only perform duplicate check for NEW patients (not editing)
            if (!editingPatient) {
                const dupCheck = await checkDuplicatePatient({
                    fullName: formData.fullName.trim(),
                    age: numericAge,
                    gender: formData.gender,
                    mobile: formData.mobile.trim()
                });

                if (dupCheck.exists && dupCheck.patient) {
                    setError(`PATIENT RECORD ALREADY EXISTS: Registered as ${dupCheck.patient.fullName} (MRN: ${dupCheck.patient.mrn})`);
                    setIsSubmitting(false);
                    return;
                }
            }

            if (editingPatient) {
                const isGuestConversion = editingPatient.refId === 'GUEST';
                const result = await updatePatient(editingPatient.id, {
                    fullName: formData.fullName.trim(),
                    age: numericAge || 0,
                    gender: formData.gender as any,
                    mobile: formData.mobile.trim(),
                    email: formData.email.trim() || undefined,
                    address: formData.address.trim() || undefined,
                    referringDoctor: formData.referringDoctor.trim() || undefined,
                    refId: isGuestConversion ? (formData.refId.trim() === 'GUEST' ? '' : formData.refId.trim()) : (formData.refId.trim() || undefined),
                    mrn: isGuestConversion ? nextMRN : undefined
                });

                if (result.success && result.patient) {
                    onSuccess(result.patient);
                } else {
                    setError(result.error || 'Failed to update record');
                }
            } else {
                const result = await createPatient({
                    fullName: formData.fullName.trim(),
                    age: numericAge || 0,
                    gender: formData.gender as any,
                    mobile: formData.mobile.trim(),
                    email: formData.email.trim() || undefined,
                    address: formData.address.trim() || undefined,
                    referringDoctor: formData.referringDoctor.trim() || undefined,
                    refId: formData.refId.trim() || undefined,
                });

                if (result.success && result.patient) {
                    const defaultType = encodeProcedureType("ent", "nasal_sinus", "nasal_endoscopy");
                    onSuccess(result.patient, defaultType);
                    setFormData({ fullName: '', age: '', gender: '', mobile: '', dialCode: '+91', countryCode: 'IN', email: '', address: '', referringDoctor: '', refId: '', notes: '' });
                    fetchNextMRN(); // Refresh MRN for next entry
                    fetchPhysicians(); // Refresh physician registry
                } else {
                    setError(result.error || 'Conflict in record database');
                }
            }
        } catch (err) {
            setError('Registry bridge failure');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="h-full flex flex-col bg-transparent overflow-hidden py-1">
            <div className="flex-1 bg-white border border-slate-200 rounded-[24px] shadow-sm flex flex-col overflow-hidden relative mx-1 mb-1">

                {/* Header */}
                <div className="px-5 py-4 border-b border-transparent flex items-center justify-between bg-white shrink-0">
                    <div className="flex items-center gap-3">
                        <div className={cn(
                            "w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-md transition-all",
                            isMediaImported ? "bg-emerald-500 shadow-emerald-500/20" : "bg-blue-600 shadow-blue-500/20"
                        )}>
                            {isMediaImported ? <Check size={18} strokeWidth={3} /> : <UserPlus size={18} />}
                        </div>
                        <div>
                            <h2 className={cn(
                                "text-sm font-bold tracking-tight",
                                isMediaImported ? "text-emerald-600" : "text-slate-800"
                            )}>
                                {isMediaImported || editingPatient?.refId === 'GUEST' ? 'Media Captured ✅' : (editingPatient ? 'Update Patient Record' : 'Register New Patient')}
                            </h2>
                            {(isMediaImported || editingPatient?.refId === 'GUEST') && (
                                <p className="text-[10px] font-black text-emerald-500/80 uppercase tracking-widest">Complete Registration</p>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={onDirectProcedure}
                            disabled={!isCameraConnected}
                            className={cn(
                                "text-white text-[12px] font-bold px-4 py-2 rounded-full shadow-lg transition-all active:scale-95 flex items-center gap-2",
                                isCameraConnected 
                                    ? "bg-blue-600 hover:bg-blue-700 shadow-blue-500/20" 
                                    : "bg-slate-300 shadow-none cursor-not-allowed grayscale"
                            )}
                        >
                            <Play size={12} fill="currentColor" />
                            Quick Procedure
                        </button>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
                    {/* Scrollable Content */}
                    <div className="flex-1 overflow-hidden p-4">
                        <div className="h-full flex flex-col justify-between gap-2">
                            {(isMediaImported || editingPatient?.refId === 'GUEST') && (
                                <motion.div 
                                    initial={{ opacity:0, y: -10 }}
                                    animate={{ opacity:1, y: 0 }}
                                    className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex items-center gap-3 shadow-sm"
                                >
                                    <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center shrink-0">
                                        <Info size={16} className="text-white" />
                                    </div>
                                    <p className="text-[11px] font-bold text-emerald-700 leading-tight">
                                        You captured images for a guest. Please add the patient details to complete registration.
                                    </p>
                                </motion.div>
                            )}

                            {/* Auto-Generated MRN Display */}
                            <div className="space-y-1.5 opacity-80">
                                <label className="text-xs font-bold text-slate-700 flex items-center gap-2">
                                    MRN No
                                    <Lock size={12} className="text-slate-400" />
                                </label>
                                <div className="relative">
                                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                                            <Hash size={16} className="text-slate-400" />
                                        </div>
                                        <input
                                            type="text"
                                            value={editingPatient && editingPatient.refId !== 'GUEST' ? editingPatient.mrn : (nextMRN || 'Fetching...')}
                                            readOnly
                                            className="w-full h-11 pl-11 pr-12 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-500 outline-none cursor-not-allowed font-mono tracking-tight"
                                        />
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setFormData({ fullName: '', age: '', gender: '', mobile: '', dialCode: '+91', countryCode: 'IN', email: '', address: '', referringDoctor: '', refId: '', notes: '' });
                                                setMobileStatus('idle');
                                                setEmailStatus('idle');
                                                setError('');
                                            }}
                                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                            title="Clear entry"
                                        >
                                            <RotateCcw size={16} />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col gap-2 flex-1">
                                <div className="grid grid-cols-1 gap-y-2">
                                    {/* Full Name */}
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[12px] font-bold text-slate-700 tracking-tight">Patient Name <span className="text-red-500">*</span></label>
                                            {renderCharCounter(formData.fullName.length, 22, 5)}
                                        </div>
                                        <div className="relative group/input">
                                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within/input:text-blue-600 transition-colors pointer-events-none">
                                                <User size={18} />
                                            </div>
                                            <input
                                                type="text"
                                                name="fullName"
                                                value={formData.fullName}
                                                onChange={handleChange}
                                                placeholder="Eg. Rajesh Kumar"
                                                className={cn(
                                                    "w-full h-11 pl-11 pr-4 bg-white border rounded-xl text-sm font-semibold text-slate-900 placeholder:text-slate-400/80 transition-all outline-none",
                                                    error && !formData.fullName.trim() ? "border-red-400 bg-red-50/10 focus:border-red-500 ring-1 ring-red-50" : "border-slate-200 focus:border-blue-600 focus:bg-blue-50/5 focus:ring-4 focus:ring-blue-100/50"
                                                )}
                                            />
                                        </div>
                                    </div>

                                    {/* Age */}
                                    <div className="space-y-1.5 relative">
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs font-bold text-slate-700">Age <span className="text-red-500">*</span></label>
                                            <div className="group/info relative">
                                                <Info size={12} className="text-slate-400 cursor-help" />
                                                <div className="absolute right-0 bottom-full mb-2 w-52 p-2 bg-slate-900 text-white text-[10px] font-medium rounded-lg opacity-0 group-hover/info:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl border border-slate-800">
                                                    For infants: use decimal for months (0.1 = 1 month, 0.6 = 6 months, 0.11 = 11 months). Min: 0.1, Max: 0.11
                                                </div>
                                            </div>
                                        </div>
                                        <div className="relative group/input">
                                            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-slate-400 group-focus-within/input:text-blue-600 transition-colors pointer-events-none" />
                                            <input
                                                type="text"
                                                name="age"
                                                value={formData.age}
                                                onChange={handleChange}
                                                placeholder="Eg. 25 or 0.6 (months)"
                                                className={cn(
                                                    "w-full h-11 pl-11 pr-4 bg-white border rounded-xl text-sm font-semibold text-slate-900 placeholder:text-slate-400 transition-all outline-none",
                                                    error && !formData.age ? "border-red-400 bg-red-50/10 focus:border-red-500 ring-1 ring-red-50" : "border-slate-200 focus:border-blue-600 focus:bg-blue-50/5 focus:ring-4 focus:ring-blue-100/50"
                                                )}
                                            />
                                        </div>
                                    </div>

                                    {/* Gender */}
                                    <div className="space-y-2">
                                        <label className="text-[12px] font-bold text-slate-700 tracking-tight">Gender <span className="text-red-500">*</span></label>
                                        <div className={cn(
                                            "flex p-1 rounded-xl border h-11 transition-all",
                                            error && !formData.gender ? "bg-rose-50 border-rose-200" : "bg-slate-100/80 border-slate-200"
                                        )}>
                                            {GENDER_OPTIONS.map((g) => (
                                                <button
                                                    key={g}
                                                    type="button"
                                                    onClick={() => setFormData(prev => ({ ...prev, gender: g }))}
                                                    className={cn(
                                                        "flex-1 text-xs font-bold rounded-lg transition-all",
                                                        formData.gender === g
                                                            ? 'bg-white text-blue-700 shadow-sm border border-slate-200/50'
                                                            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                                                    )}
                                                >
                                                    {g}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 gap-y-2 border-t border-slate-100 pt-2">
                                    {/* Mobile No */}
                                    <div className="space-y-2 relative">
                                        <label className="text-[12px] font-bold text-slate-700 tracking-tight">Mobile No <span className="text-red-500">*</span></label>
                                        <div className="flex gap-2">
                                            <div className="relative group/country select-none w-28 shrink-0">
                                                <div className={cn(
                                                    "absolute inset-0 flex items-center px-3 bg-slate-50 border rounded-xl pointer-events-none transition-all z-10",
                                                    "border-slate-200 group-focus-within/country:border-blue-600 group-focus-within/country:ring-4 group-focus-within/country:ring-blue-100/50"
                                                )}>
                                                    <span className="text-lg mr-2">
                                                        {(COUNTRY_DATA.find(c => c.code === formData.countryCode) || COUNTRY_DATA[0]).flag}
                                                    </span>
                                                    <span className="text-xs font-bold text-slate-700">
                                                        {(COUNTRY_DATA.find(c => c.code === formData.countryCode) || COUNTRY_DATA[0]).dialCode}
                                                    </span>
                                                    <ChevronDown size={14} className="ml-auto text-slate-400 group-focus-within/country:text-blue-600 transition-colors" />
                                                </div>

                                                <select
                                                    value={formData.countryCode}
                                                    onChange={(e) => {
                                                        const country = COUNTRY_DATA.find(c => c.code === e.target.value) || COUNTRY_DATA[0];
                                                        setFormData(prev => ({
                                                            ...prev,
                                                            countryCode: country.code,
                                                            dialCode: country.dialCode,
                                                            mobile: ''
                                                        }));
                                                    }}
                                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                                                >
                                                    {COUNTRY_DATA.map((c) => (
                                                        <option key={c.code} value={c.code}>{c.name} ({c.dialCode})</option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div className="relative group/input flex-1">
                                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within/input:text-blue-600 transition-colors pointer-events-none">
                                                    <Phone size={16} />
                                                </div>
                                                <input
                                                    type="tel"
                                                    name="mobile"
                                                    value={formData.mobile}
                                                    onChange={handleChange}
                                                    placeholder="Mobile number"
                                                    className={cn(
                                                        "w-full h-11 pl-11 pr-4 bg-white border rounded-xl text-sm font-semibold text-slate-900 placeholder:text-slate-400 transition-all outline-none",
                                                        error && !formData.mobile ? "border-red-400" : "border-slate-200 focus:border-blue-600 focus:bg-blue-50/5 focus:ring-4 focus:ring-blue-100/50"
                                                    )}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Email Address */}
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[12px] font-bold text-slate-700 tracking-tight">Email Address</label>
                                            {renderCharCounter(formData.email.length, 255, 200)}
                                        </div>
                                        <div className="relative group/input">
                                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within/input:text-blue-600 transition-colors pointer-events-none">
                                                <Mail size={18} />
                                            </div>
                                            <input
                                                type="email"
                                                name="email"
                                                value={formData.email}
                                                onChange={handleChange}
                                                placeholder="Eg. patient@example.com"
                                                className="w-full h-11 pl-11 pr-4 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-blue-50/5 focus:ring-4 focus:ring-blue-100/50 transition-all outline-none"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 gap-y-2 border-t border-slate-100 pt-2">
                                    {/* Residential Address */}
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[12px] font-bold text-slate-700 tracking-tight">Residential Address</label>
                                            {renderCharCounter(formData.address.length, 250, 200)}
                                        </div>
                                        <div className="relative group/input">
                                            <div className="absolute left-4 top-3 text-slate-400 group-focus-within/input:text-blue-600 transition-colors pointer-events-none">
                                                <MapPin size={18} />
                                            </div>
                                            <input
                                                type="text"
                                                name="address"
                                                value={formData.address}
                                                onChange={handleChange}
                                                placeholder="Eg. Anna Nagar, Chennai"
                                                className="w-full h-11 pl-11 pr-4 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-blue-50/5 focus:ring-4 focus:ring-blue-100/50 transition-all outline-none"
                                            />
                                        </div>
                                    </div>

                                    {/* Referring Physician */}
                                    <div className="space-y-2 relative group/ref">
                                        <label className="text-[12px] font-bold text-slate-700 tracking-tight">Referring Physician</label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                                                <Stethoscope size={18} className="text-slate-400 group-focus-within/ref:text-blue-500 transition-colors" />
                                            </div>
                                            <input
                                                type="text"
                                                value={formData.referringDoctor}
                                                onFocus={() => setShowPhysicianSuggestions(true)}
                                                onBlur={() => setTimeout(() => setShowPhysicianSuggestions(false), 200)}
                                                onChange={(e) => setFormData({ ...formData, referringDoctor: e.target.value })}
                                                placeholder="Eg. Dr. S. Raman"
                                                className="w-full h-11 pl-10 pr-4 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-blue-50/5 focus:ring-4 focus:ring-blue-100/50 transition-all outline-none"
                                            />
                                            
                                            <AnimatePresence>
                                                {showPhysicianSuggestions && formData.referringDoctor && (
                                                    <motion.ul
                                                        initial={{ opacity: 0, y: -10 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        exit={{ opacity: 0, y: -10 }}
                                                        className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-slate-200"
                                                    >
                                                        {physicianSuggestions
                                                            .filter(p => !formData.referringDoctor || p.toLowerCase().includes(formData.referringDoctor.toLowerCase()))
                                                            .slice(0, 10)
                                                            .map((doc, idx) => (
                                                                <li
                                                                    key={idx}
                                                                    onClick={() => {
                                                                        setFormData({ ...formData, referringDoctor: doc });
                                                                        setShowPhysicianSuggestions(false);
                                                                    }}
                                                                    className="px-4 py-2.5 hover:bg-slate-50 cursor-pointer text-sm font-medium text-slate-700 flex items-center gap-2 border-b border-slate-50 last:border-0"
                                                                >
                                                                    <Search size={14} className="text-slate-400" />
                                                                    {doc}
                                                                </li>
                                                            ))}
                                                    </motion.ul>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    </div>

                                    {/* ABHA ID */}
                                    <div className="space-y-1.5 group/refid">
                                        <label className="text-[12px] font-bold text-slate-700 tracking-tight">ABHA ID</label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                                                <FileText size={18} className="text-slate-400 group-focus-within/refid:text-blue-500 transition-colors" />
                                            </div>
                                            <input
                                                type="text"
                                                value={formData.refId}
                                                onChange={(e) => setFormData({ ...formData, refId: e.target.value.toUpperCase() })}
                                                placeholder="Eg. 12-3456-7890-1234"
                                                className="w-full h-11 pl-10 pr-4 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-blue-50/5 focus:ring-4 focus:ring-blue-100/50 transition-all uppercase placeholder:normal-case"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Sticky Footer for Buttons */}
                    <div className="shrink-0 px-4 py-3 bg-slate-50/50 border-t border-slate-100/80">
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={onCancel}
                                className="flex-1 h-11 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-50 transition-all flex items-center justify-center gap-2 active:scale-95 shadow-sm"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="flex-[2] h-11 bg-blue-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-blue-700/20 hover:bg-blue-800 hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:translate-y-0 px-4 whitespace-nowrap"
                            >
                                {isSubmitting ? (
                                    <Loader2 className="w-5 h-5 animate-spin text-white/70" />
                                ) : (
                                    <>
                                        <span className="truncate">{editingPatient ? 'Save and Update' : 'Register New Patient'}</span>
                                        <Check size={18} className="shrink-0" />
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </form>

                {/* Error Notification */}
                <AnimatePresence>
                    {error && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            className="absolute bottom-16 left-4 right-4 bg-rose-50 border border-rose-100 text-rose-600 px-3 py-2 rounded-lg shadow-lg z-50 flex items-center gap-2"
                        >
                            <AlertCircle size={14} className="shrink-0" />
                            <p className="text-[10px] font-bold uppercase tracking-wide flex-1">{error}</p>
                            <button onClick={() => setError('')} className="p-1 hover:bg-rose-100 rounded-md transition-colors">
                                <X size={12} />
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
