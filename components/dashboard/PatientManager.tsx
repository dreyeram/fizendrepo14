"use client";

import React, { useState, useEffect, useRef } from 'react';
import { 
    Search, UserPlus, Filter, ChevronRight, User, 
    MoreHorizontal, Edit2, Play, ChevronLeft, Calendar as CalendarIcon, Phone, FileImage,
    ArrowRight, MapPin, Mail, Loader2, Download, Upload, Eye, Check
} from "lucide-react";
import { searchPatients, createPatient } from '@/app/actions/auth';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from "framer-motion";

interface PatientManagerProps {
    role: 'ADMIN' | 'DOCTOR' | 'ASSISTANT';
    onSelectPatient?: (patient: any) => void;
}

export default function PatientManager({ role, onSelectPatient }: PatientManagerProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [patients, setPatients] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    // Column Visibility State
    const [showColMenu, setShowColMenu] = useState(false);
    const [cols, setCols] = useState({
        mobile: true,
        lastProcedure: true,
        lastViewDate: true,
        gallery: true,
    });

    // Right Panel Form State
    const [formData, setFormData] = useState({
        fullName: "",
        age: "",
        gender: "Male",
        mobile: "",
        email: "",
        address: "",
        refPhysician: "",
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [registerError, setRegisterError] = useState<string|null>(null);

    // Dummy data fallback for development if needed
    const dummyPatients = [
        { id: '1', mrn: '#MRN-001007', fullName: 'Rajesh Kumar', age: 26, gender: 'MALE', mobile: '+91 9840123456', lastProcedure: 'Rigid Laryngoscopy', lastProcedureDate: '12/03/2026', lastViewDate: '13/03/2026', visits: 1 },
        { id: '2', mrn: '#MRN-001006', fullName: 'Vedha Varshini', age: 23, gender: 'FEMALE', mobile: '+91 9150966371', lastProcedure: 'Generic', lastProcedureDate: '11/03/2026', lastViewDate: '12/03/2026', visits: 1 },
        { id: '3', mrn: '#MRN-001005', fullName: 'Raja', age: 85, gender: 'MALE', mobile: '+91 7904200751', lastProcedure: 'Nasal Endoscopy', lastProcedureDate: '10/03/2026', lastViewDate: '13/03/2026', visits: 2 },
    ];

    useEffect(() => {
        loadPatients();
    }, [searchQuery]);

    const loadPatients = async () => {
        setIsLoading(true);
        try {
            const result = await searchPatients(searchQuery);
            if (result.success && result.patients && result.patients.length > 0) {
                setPatients(result.patients);
            } else {
                setPatients(dummyPatients); // Use dummy for UI testing if empty
            }
        } catch (error) {
            console.error('Failed to load patients:', error);
            setPatients(dummyPatients);
        } finally {
            setIsLoading(false);
        }
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.fullName || !formData.age || !formData.mobile) {
            setRegisterError("Full Name, Age, and Mobile are mandatory.");
            return;
        }

        setIsSubmitting(true);
        setRegisterError(null);

        try {
            const result = await createPatient({
                fullName: formData.fullName,
                age: Number(formData.age),
                gender: formData.gender,
                mobile: formData.mobile,
                email: formData.email || undefined,
                address: formData.address || undefined,
                refId: formData.refPhysician || undefined,
            });

            if (result.success && result.patient) {
                setFormData({
                    fullName: "", age: "", gender: "Male", mobile: "", email: "", address: "", refPhysician: ""
                });
                loadPatients();
                if (onSelectPatient) onSelectPatient(result.patient);
            } else {
                setRegisterError(result.error || "Registration failed.");
            }
        } catch (error) {
            setRegisterError("Network error occurred.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="h-full flex flex-row gap-6 bg-[#F5F5F7] p-6 overflow-hidden max-w-[1920px] mx-auto">
            
            {/* Left Section: Patient Queue Table */}
            <div className="flex-1 flex flex-col min-w-0 h-full">
                
                {/* Top Action Bar */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4 flex-1">
                        <div className="relative group w-full max-w-md">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                            <input 
                                type="text" 
                                placeholder="Search patients by MRN, name, or phone number..." 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full h-11 pl-11 pr-12 bg-white border border-slate-200/80 rounded-2xl text-[13px] font-medium text-slate-700 placeholder:text-slate-400 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all outline-none shadow-sm"
                            />
                            <button className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors">
                                <Filter size={16} />
                            </button>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        <button className="w-10 h-10 flex items-center justify-center bg-white border border-slate-200/80 rounded-2xl text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors shadow-[0_2px_8px_rgba(0,0,0,0.04)] active:scale-95" title="Import">
                            <Upload size={16} />
                        </button>
                        <button className="w-10 h-10 flex items-center justify-center bg-white border border-slate-200/80 rounded-2xl text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors shadow-[0_2px_8px_rgba(0,0,0,0.04)] active:scale-95" title="Export">
                            <Download size={16} />
                        </button>
                        
                        <div className="w-px h-6 bg-slate-200/80 mx-1"></div>
                        
                        {/* Columns Visibility Dropdown */}
                        <div className="relative">
                            <button 
                                onClick={() => setShowColMenu(!showColMenu)} 
                                className={clsx(
                                    "px-4 h-10 flex items-center gap-2 bg-white border rounded-2xl transition-colors shadow-[0_2px_8px_rgba(0,0,0,0.04)] active:scale-95",
                                    showColMenu ? "border-blue-500 text-blue-600" : "border-slate-200/80 text-slate-500 hover:text-blue-600 hover:border-blue-200"
                                )}
                            >
                                <Eye size={16} />
                                <span className="text-xs font-bold uppercase tracking-widest hidden sm:inline-block">View</span>
                            </button>
                            
                            <AnimatePresence>
                                {showColMenu && (
                                    <motion.div 
                                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                        transition={{ duration: 0.15 }}
                                        className="absolute right-0 top-12 w-56 bg-white border border-slate-100 shadow-[0_12px_40px_rgba(0,0,0,0.08)] rounded-2xl p-2 z-50 overflow-hidden"
                                    >
                                        <div className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 mb-2">Toggle Columns</div>
                                        {Object.entries(cols).map(([key, isVis]) => (
                                            <label key={key} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 rounded-xl cursor-pointer transition-colors group">
                                                <div className={clsx(
                                                    "w-4 h-4 rounded-[4px] border flex items-center justify-center transition-colors",
                                                    isVis ? "bg-blue-600 border-blue-600 shadow-inner" : "border-slate-300 bg-white group-hover:border-blue-400"
                                                )}>
                                                    {isVis && <Check size={12} className="text-white" strokeWidth={3} />}
                                                </div>
                                                <input 
                                                    type="checkbox" 
                                                    className="hidden"
                                                    checked={isVis} 
                                                    onChange={() => setCols(p => ({...p, [key]: !isVis}))} 
                                                />
                                                <span className="text-[13px] font-semibold text-slate-700 capitalize group-hover:text-slate-900">
                                                    {key.replace(/([A-Z])/g, ' $1').trim()}
                                                </span>
                                            </label>
                                        ))}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>

                {/* Table & Pagination Wrapper */}
                <div className="bg-white rounded-[24px] border border-slate-200/70 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col flex-1 overflow-hidden">
                    
                    <div className="flex-1 overflow-auto no-scrollbar relative w-full">
                        <table className="w-full text-left border-collapse min-w-[1100px]">
                            <thead>
                                <tr className="bg-slate-50/80">
                                    <th className="sticky top-0 left-0 bg-slate-50/95 backdrop-blur-md z-30 w-[50px] min-w-[50px] px-4 py-3.5 border-b border-slate-200/80">
                                        <input type="checkbox" className="rounded-[4px] border-slate-300 text-blue-600 focus:ring-blue-500 w-[14px] h-[14px] cursor-pointer" />
                                    </th>
                                    <th className="sticky top-0 left-[50px] bg-slate-50/95 backdrop-blur-md z-30 w-[130px] min-w-[130px] px-4 py-3.5 border-b border-slate-200/80">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em]">MRN</span>
                                    </th>
                                    <th className="sticky top-0 left-[180px] bg-slate-50/95 backdrop-blur-md z-30 w-[240px] min-w-[240px] px-4 py-3.5 border-b border-slate-200/80">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em]">Name</span>
                                    </th>
                                    <th className="sticky top-0 left-[420px] bg-slate-50/95 backdrop-blur-md z-30 w-[140px] min-w-[140px] px-4 py-3.5 border-b border-slate-200/80 shadow-[10px_0_20px_-10px_rgba(0,0,0,0.04)] border-r border-slate-200/60 transition-all">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em]">Age / Gender</span>
                                    </th>
                                    
                                    {/* Scrollable headers depending on state */}
                                    {cols.mobile && (
                                        <th className="sticky top-0 bg-slate-50/95 backdrop-blur-md z-20 px-6 py-3.5 border-b border-slate-200/80 whitespace-nowrap min-w-[150px]">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em]">Mobile</span>
                                        </th>
                                    )}
                                    {cols.lastProcedure && (
                                        <th className="sticky top-0 bg-slate-50/95 backdrop-blur-md z-20 px-6 py-3.5 border-b border-slate-200/80 whitespace-nowrap min-w-[180px]">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em]">Last Visit</span>
                                        </th>
                                    )}
                                    {cols.lastViewDate && (
                                        <th className="sticky top-0 bg-slate-50/95 backdrop-blur-md z-20 px-4 py-3.5 border-b border-slate-200/80 whitespace-nowrap min-w-[100px] text-center">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em]">Visits</span>
                                        </th>
                                    )}
                                    {cols.gallery && (
                                        <th className="sticky top-0 bg-slate-50/95 backdrop-blur-md z-20 px-4 py-3.5 border-b border-slate-200/80 whitespace-nowrap min-w-[80px] text-center">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em]">View</span>
                                        </th>
                                    )}
                                    
                                    <th className="sticky top-0 right-0 bg-slate-50/95 backdrop-blur-md z-30 w-[220px] min-w-[220px] px-6 py-3.5 border-b border-slate-200/80 shadow-[-10px_0_20px_-10px_rgba(0,0,0,0.04)] border-l border-slate-200/60">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em]">Edit</span>
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em]">Start</span>
                                        </div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100/80">
                                {isLoading ? (
                                    <tr>
                                        <td colSpan={9} className="h-48 text-center">
                                            <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto" />
                                        </td>
                                    </tr>
                                ) : patients.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} className="h-64 text-center">
                                            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                                <Search className="w-8 h-8 text-slate-300" />
                                            </div>
                                            <h3 className="text-sm font-bold text-slate-800">No patients found</h3>
                                            <p className="text-xs font-medium text-slate-400 mt-1">Try adjusting your search criteria</p>
                                        </td>
                                    </tr>
                                ) : (
                                    patients.map((patient, idx) => (
                                        <tr key={patient.id || idx} className="group bg-white hover:bg-slate-50/40 transition-colors h-[68px]">
                                            <td className="sticky left-0 bg-inherit z-10 w-[50px] min-w-[50px] px-4 py-3 border-b border-transparent">
                                                <input type="checkbox" className="rounded-[4px] border-slate-300 text-blue-600 focus:ring-blue-500 w-[14px] h-[14px] cursor-pointer" />
                                            </td>
                                            <td className="sticky left-[50px] bg-inherit z-10 w-[130px] min-w-[130px] px-4 py-3 border-b border-transparent">
                                                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest bg-slate-100/60 px-2 py-1 rounded-lg border border-slate-200/40 group-hover:bg-white group-hover:shadow-sm transition-all">{patient.mrn}</span>
                                            </td>
                                            <td className="sticky left-[180px] bg-inherit z-10 w-[240px] min-w-[240px] px-4 py-3 border-b border-transparent">
                                                <div className="font-bold text-[14px] text-slate-900 truncate pr-4">{patient.fullName}</div>
                                            </td>
                                            <td className="sticky left-[420px] bg-inherit z-10 w-[140px] min-w-[140px] px-4 py-3 border-b border-transparent shadow-[10px_0_20px_-10px_rgba(0,0,0,0.02)] border-r border-slate-100/50">
                                                <div className="flex flex-col">
                                                    <span className="text-[13px] text-slate-900 font-bold">{patient.age}</span>
                                                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{patient.gender || 'Unknown'}</span>
                                                </div>
                                            </td>
                                            
                                            {cols.mobile && (
                                                <td className="px-6 py-3 border-b border-transparent whitespace-nowrap">
                                                    <span className="text-[13px] font-semibold text-slate-600">{patient.mobile}</span>
                                                </td>
                                            )}
                                            {cols.lastProcedure && (
                                                <td className="px-6 py-3 border-b border-transparent whitespace-nowrap">
                                                    <div className="flex flex-col">
                                                        <span className="text-[12px] font-bold text-slate-900">{patient.lastProcedureDate || 'N/A'}</span>
                                                        <span className="text-[11px] font-medium text-slate-500 lowercase tracking-wide max-w-[150px] truncate">{patient.lastProcedure || 'No history'}</span>
                                                    </div>
                                                </td>
                                            )}
                                            {cols.lastViewDate && (
                                                <td className="px-4 py-3 border-b border-transparent whitespace-nowrap text-center">
                                                    <span className="text-[13px] font-bold text-slate-900">{patient.visits || 0}</span>
                                                </td>
                                            )}
                                            {cols.gallery && (
                                                <td className="px-4 py-3 border-b border-transparent whitespace-nowrap text-center">
                                                    <button className="w-8 h-8 mx-auto rounded-full bg-blue-50/50 hover:bg-blue-100 flex items-center justify-center text-blue-500 transition-colors">
                                                        <Eye size={14} strokeWidth={2.5} />
                                                    </button>
                                                </td>
                                            )}
                                            
                                            <td className="sticky right-0 bg-inherit z-10 w-[220px] min-w-[220px] px-6 py-3 border-b border-transparent shadow-[-10px_0_20px_-10px_rgba(0,0,0,0.02)] border-l border-slate-100/50">
                                                <div className="flex items-center justify-between">
                                                    
                                                    <button className="w-8 h-8 rounded-full border border-slate-200/60 flex items-center justify-center text-slate-400 hover:text-slate-900 hover:border-slate-300 hover:bg-white transition-all shadow-sm">
                                                        <Edit2 size={13} strokeWidth={2.5} />
                                                    </button>
                                                    
                                                    <button 
                                                        onClick={() => onSelectPatient?.(patient)}
                                                        className="group/btn relative w-[100px] h-[36px] bg-emerald-50 hover:bg-emerald-100 rounded-full overflow-hidden transition-all flex items-center px-1 border border-emerald-100"
                                                    >
                                                        <div className="absolute left-[3px] w-[28px] h-[28px] bg-emerald-500 shadow-sm shadow-emerald-500/20 rounded-full flex items-center justify-center text-white group-hover/btn:w-[92px] transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] z-10">
                                                            <ArrowRight size={14} strokeWidth={2.5} className="group-hover/btn:translate-x-[26px] transition-transform duration-300" />
                                                        </div>
                                                        <span className="w-full text-center text-[10px] font-black text-emerald-600 uppercase tracking-widest pl-5 group-hover/btn:opacity-0 transition-opacity duration-200">
                                                            Start
                                                        </span>
                                                        <span className="absolute inset-0 flex items-center text-[10px] font-black text-white uppercase tracking-widest pl-5 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300 z-20 delay-75 pointer-events-none">
                                                            Start
                                                        </span>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                    
                    {/* Modern Pagination Bottom */}
                    <div className="flex items-center justify-between px-6 py-4 bg-white border-t border-slate-100 z-10">
                        <div className="flex items-center gap-1">
                            <button className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-900 disabled:opacity-30 transition-colors">
                                &lt; Previous
                            </button>
                            <div className="flex items-center gap-1 mx-2">
                                <button className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold bg-slate-100 text-slate-800 transition-all">
                                    1
                                </button>
                                {/* Active and inactive examples */}
                            </div>
                            <button className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-900 disabled:opacity-30 transition-colors">
                                Next &gt;
                            </button>
                        </div>
                        <div className="flex items-center gap-4">
                            <span className="text-[11px] font-medium text-slate-500">
                                Showing <strong className="text-slate-900">1</strong> to <strong className="text-slate-900">4</strong> of <strong className="text-slate-900">4</strong> entries
                            </span>
                            <button className="px-4 py-1.5 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-900 uppercase tracking-wider transition-all">
                                Show All
                            </button>
                        </div>
                    </div>
                    
                </div>
            </div>

            {/* Right Section: Inline Registration Form */}
            <div className="w-[360px] flex-shrink-0 bg-white rounded-[24px] border border-slate-200/70 shadow-[0_8px_30px_rgba(0,0,0,0.04)] flex flex-col h-full overflow-hidden relative">
                
                {/* Header */}
                <div className="p-6 pb-4 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
                            <UserPlus size={18} strokeWidth={2.5} />
                        </div>
                        <h2 className="text-[15px] font-black text-slate-900 tracking-tight">Register New Patient</h2>
                    </div>
                    
                    {/* Simulated branding from screenshots */}
                    <div className="text-[14px] font-black text-blue-600 italic tracking-tighter opacity-80 select-none">
                        <span className="text-blue-500">Predi</span>Scan™
                    </div>
                </div>
                
                {/* Scrollable Form Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-5 no-scrollbar">
                    
                    {registerError && (
                        <div className="p-3 bg-red-50 text-red-600 text-xs font-bold rounded-xl border border-red-100">
                            {registerError}
                        </div>
                    )}
                    
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                            MRN NO <div className="w-3 h-3 text-slate-300"><Search size={10} /></div>
                        </label>
                        <div className="w-full h-11 px-4 bg-slate-50 border border-slate-200/60 rounded-xl text-[13px] font-bold text-slate-500 flex items-center gap-2 select-none shadow-inner">
                            <span className="text-slate-400">#</span> MRN-001007
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500/80 uppercase tracking-widest">
                            Patient Name <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[14px] h-[14px] text-slate-400" />
                            <input 
                                type="text" 
                                placeholder="Eg. Rajesh Kumar" 
                                value={formData.fullName}
                                onChange={e => setFormData({...formData, fullName: e.target.value})}
                                className="w-full h-11 pl-10 pr-4 bg-white border border-slate-200/80 rounded-xl text-[13px] font-bold text-slate-900 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all placeholder:text-slate-400 placeholder:font-medium shadow-sm active:bg-slate-50"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-500/80 uppercase tracking-widest">
                                Age (Years) <span className="text-red-500">*</span>
                            </label>
                            <div className="relative">
                                <CalendarIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[14px] h-[14px] text-slate-400" />
                                <input 
                                    type="number" 
                                    placeholder="Eg. 26" 
                                    value={formData.age}
                                    onChange={e => setFormData({...formData, age: e.target.value})}
                                    className="w-full h-11 pl-10 pr-12 bg-white border border-slate-200/80 rounded-xl text-[13px] font-bold text-slate-900 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all placeholder:text-slate-400 placeholder:font-medium shadow-sm"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">YRS</span>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-500/80 uppercase tracking-widest">
                                Gender <span className="text-red-500">*</span>
                            </label>
                            <div className="w-full h-11 bg-slate-100/80 rounded-xl p-1 flex">
                                {['MALE', 'FEMALE', 'OTHER'].map(g => (
                                    <button 
                                        key={g}
                                        type="button"
                                        onClick={() => setFormData({...formData, gender: g})}
                                        className={clsx(
                                            "flex-1 rounded-lg text-[9px] font-black tracking-widest transition-all",
                                            formData.gender.toUpperCase() === g 
                                            ? "bg-white text-slate-900 shadow-sm border border-slate-200/50" 
                                            : "text-slate-500 hover:text-slate-700"
                                        )}
                                    >
                                        {g}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500/80 uppercase tracking-widest">
                            Mobile No <span className="text-red-500">*</span>
                        </label>
                        <div className="flex gap-2">
                            <div className="w-20 h-11 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-center gap-1 cursor-pointer">
                                <span className="text-[11px] font-bold text-slate-600">IN +91</span>
                                <ChevronRight size={12} className="text-slate-400 rotate-90" />
                            </div>
                            <input 
                                type="tel" 
                                placeholder="Eg. 9840123456" 
                                value={formData.mobile}
                                onChange={e => setFormData({...formData, mobile: e.target.value})}
                                className="flex-1 h-11 px-4 bg-white border border-slate-200/80 rounded-xl text-[13px] font-bold text-slate-900 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all placeholder:text-slate-400 placeholder:font-medium shadow-sm"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500/80 uppercase tracking-widest">
                            Email Address
                        </label>
                        <div className="relative">
                            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[14px] h-[14px] text-slate-400" />
                            <input 
                                type="email" 
                                placeholder="Eg. raja.k@gmail.com" 
                                value={formData.email}
                                onChange={e => setFormData({...formData, email: e.target.value})}
                                className="w-full h-11 pl-10 pr-4 bg-white border border-slate-200/80 rounded-xl text-[13px] font-bold text-slate-900 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all placeholder:text-slate-400 placeholder:font-medium shadow-sm"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500/80 uppercase tracking-widest">
                            Residential Address
                        </label>
                        <div className="relative">
                            <MapPin className="absolute left-3.5 top-[14px] w-[14px] h-[14px] text-slate-400" />
                            <textarea 
                                placeholder="Eg. Anna Nagar, Chennai" 
                                value={formData.address}
                                onChange={e => setFormData({...formData, address: e.target.value})}
                                className="w-full h-20 pt-3.5 pl-10 pr-4 bg-white border border-slate-200/80 rounded-xl text-[13px] font-bold text-slate-900 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all placeholder:text-slate-400 placeholder:font-medium resize-none shadow-sm"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500/80 uppercase tracking-widest">
                            Referring Physician
                        </label>
                        <div className="relative">
                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[14px] text-slate-400 font-serif italic selection:bg-transparent">
                                Dr.
                            </span>
                            <input 
                                type="text" 
                                placeholder="Eg. S. Raman" 
                                value={formData.refPhysician}
                                onChange={e => setFormData({...formData, refPhysician: e.target.value})}
                                className="w-full h-11 pl-9 pr-4 bg-white border border-slate-200/80 rounded-xl text-[13px] font-bold text-slate-900 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all placeholder:text-slate-400 placeholder:font-medium shadow-sm"
                            />
                        </div>
                    </div>

                </div>

                {/* Submit Action */}
                <div className="p-6 bg-white border-t border-slate-100 z-10">
                    <button 
                        onClick={handleRegister}
                        disabled={isSubmitting}
                        className="w-full h-12 bg-[#1b4dee] hover:bg-blue-600 disabled:opacity-70 text-white rounded-2xl font-bold uppercase tracking-widest text-[11px] flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:-translate-y-0.5 active:translate-y-0"
                    >
                        {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : (
                            <>
                                Register New Patient
                                <Check size={16} strokeWidth={3} />
                            </>
                        )}
                    </button>
                </div>
            </div>

        </div>
    );
}
