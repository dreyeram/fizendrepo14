"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Play, Users, Loader2, UploadCloud, Edit2, Filter, Download, CheckSquare, Square, MoreHorizontal, ChevronDown, ChevronRight, FileText, Image as ImageIcon, AlertCircle, ArrowRight } from "lucide-react";
import { searchPatients } from "@/app/actions/auth";
import { exportPatientsAction } from "@/app/actions/export";
import { cn } from "@/lib/utils";

interface PatientQueueProps {
    onViewHistory: (patient: any, procedureId: string) => void;
    onStartProcedure: (patient: any, procedureId?: string) => void;
    onStartAnnotate?: (patient: any, procedure: any) => void;
    onEditReport?: (patient: any, procedure: any) => void;
    onEndAndAnnotate?: (patient: any, procedure: any) => void;
    onImport: () => void;
    onEdit: (patient: any) => void;
    refreshKey?: number;
}

export default function PatientQueue({ onViewHistory, onStartProcedure, onStartAnnotate, onEditReport, onEndAndAnnotate, onImport, onEdit, refreshKey }: PatientQueueProps) {
    const [patients, setPatients] = useState<any[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    const [showFilters, setShowFilters] = useState(false);

    // Advanced Filters State
    const [genderFilter, setGenderFilter] = useState<string>("all");
    const [ageFilter, setAgeFilter] = useState<string>("all");
    const [refFilter, setRefFilter] = useState<string>("");
    const [visitFilter, setVisitFilter] = useState<string>("all");

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [showAll, setShowAll] = useState(false);
    const itemsPerPage = 8; // Adjust to fit nicely

    // Countdown State for Start Procedure
    const [startingPatientId, setStartingPatientId] = useState<string | null>(null);
    const [countdown, setCountdown] = useState(3);
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target && typeof target.closest === 'function') {
                if (!target.closest('.patient-row-wrapper')) {
                    setExpandedId(null);
                }
            }
        };
        document.addEventListener('mousedown', handleClickOutside, true);
        return () => document.removeEventListener('mousedown', handleClickOutside, true);
    }, []);

    useEffect(() => {
        loadPatients();
    }, [refreshKey]);

    const loadPatients = useCallback(async () => {
        setIsLoading(true);
        try {
            const result = await searchPatients('');
            if (result) setPatients(result);
        } catch (error) {
            console.error("Clinical boot error:", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const toggleSelect = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === filteredPatients.length && filteredPatients.length > 0) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredPatients.map(p => p.id)));
        }
    };

    const handleExport = async () => {
        if (selectedIds.size === 0) return;
        setIsExporting(true);
        try {
            const result = await exportPatientsAction(Array.from(selectedIds));
            if (result.success) {
                alert(`Export successful: ${result.fileName}`);
                setSelectedIds(new Set());
            } else {
                alert(`Export failed: ${result.error}`);
            }
        } catch (err) {
            alert("Export process failure");
        } finally {
            setIsExporting(false);
        }
    };

    const clearFilters = () => {
        setGenderFilter("all");
        setAgeFilter("all");
        setRefFilter("");
        setVisitFilter("all");
        setSearchQuery("");
    };

    const filteredPatients = patients.filter(p => {
        // Text Search (MRN, Name, Phone, Email, Ref ID)
        const query = searchQuery.toLowerCase();
        const matchesQuery = !searchQuery || (
            (p.fullName || '').toLowerCase().includes(query) ||
            (p.mrn || '').toLowerCase().includes(query) ||
            (p.mobile || '').toLowerCase().includes(query) ||
            (p.email || '').toLowerCase().includes(query) ||
            (p.address || '').toLowerCase().includes(query) ||
            (p.refId || '').toLowerCase().includes(query)
        );

        // Gender Filter
        const matchesGender = genderFilter === "all" || p.gender === genderFilter;

        // Age Filter
        let matchesAge = true;
        if (ageFilter !== "all") {
            const age = p.age || 0;
            if (ageFilter === "0-18") matchesAge = age <= 18;
            else if (ageFilter === "19-40") matchesAge = age > 18 && age <= 40;
            else if (ageFilter === "41-60") matchesAge = age > 40 && age <= 60;
            else if (ageFilter === "61+") matchesAge = age > 60;
        }

        // Referring Doctor Filter
        const matchesRef = !refFilter || (p.referringDoctor || '').toLowerCase().includes(refFilter.toLowerCase());

        // Visit Filter
        let matchesVisits = true;
        if (visitFilter !== "all") {
            const counts = p.procedures?.length || 0;
            if (visitFilter === "0") matchesVisits = counts === 0;
            else if (visitFilter === "1") matchesVisits = counts === 1;
            else if (visitFilter === "2+") matchesVisits = counts >= 2;
        }

        return matchesQuery && matchesGender && matchesAge && matchesRef && matchesVisits;
    });

    const hasActiveFilters = genderFilter !== "all" || ageFilter !== "all" || refFilter !== "" || visitFilter !== "all" || searchQuery !== "";

    const [expandedId, setExpandedId] = useState<string | null>(null);


    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, genderFilter, ageFilter, refFilter, visitFilter]);

    const totalPages = Math.ceil(filteredPatients.length / itemsPerPage);
    const paginatedPatients = showAll ? filteredPatients : filteredPatients.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const startEntry = showAll ? (filteredPatients.length > 0 ? 1 : 0) : (filteredPatients.length > 0 ? ((currentPage - 1) * itemsPerPage) + 1 : 0);
    const endEntry = showAll ? filteredPatients.length : Math.min(currentPage * itemsPerPage, filteredPatients.length);

    const toggleExpand = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setExpandedId(prev => (prev === id ? null : id));
    };

    // Helper to generate pagination numbers (e.g., 1, 2, 3, ..., 32)
    const getPageNumbers = () => {
        const pages = [];
        if (totalPages <= 5) {
            for (let i = 1; i <= totalPages; i++) pages.push(i);
        } else {
            if (currentPage <= 3) {
                pages.push(1, 2, 3, 4, '...', totalPages);
            } else if (currentPage >= totalPages - 2) {
                pages.push(1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
            } else {
                pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
            }
        }
        return pages;
    };

    // Handle Start Procedure Countdown
    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (startingPatientId) {
            if (countdown > 0) {
                timer = setTimeout(() => {
                    setCountdown(c => c - 1);
                }, 1000);
            } else {
                // Countdown finished
                const patient = patients.find(p => p.id === startingPatientId);
                if (patient) {
                    onStartProcedure(patient);
                }
                setStartingPatientId(null);
            }
        }
        return () => clearTimeout(timer);
    }, [startingPatientId, countdown, patients, onStartProcedure]);

    const handleStartClick = (e: React.MouseEvent, patientId: string) => {
        e.stopPropagation();
        if (startingPatientId === patientId) {
            // Cancel
            setStartingPatientId(null);
        } else {
            setStartingPatientId(patientId);
            setCountdown(3);
        }
    };

    return (
        <div className="h-full flex flex-col bg-white overflow-hidden">
            {/* Main Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
                <div className="flex items-center gap-4 flex-1">
                    <div className="relative flex-1 max-w-xl">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search patients by MRN, name, or phone number.."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full h-11 pl-11 pr-4 bg-slate-50 border-none rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500/10 transition-all outline-none"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={cn(
                            "p-2 rounded-lg transition-all",
                            showFilters ? "bg-blue-50 text-blue-600" : "bg-slate-50 text-slate-500 hover:bg-slate-100"
                        )}
                        title="Filter"
                    >
                        <Filter size={16} />
                    </button>

                    <button
                        onClick={onImport}
                        className="p-2 bg-slate-50 text-slate-500 hover:bg-slate-100 rounded-lg transition-all"
                        title="Import"
                    >
                        <UploadCloud size={16} />
                    </button>

                    <button
                        onClick={handleExport}
                        disabled={selectedIds.size === 0 || isExporting}
                        className="p-2 bg-blue-600 text-white rounded-lg shadow-lg shadow-blue-500/10 hover:bg-blue-700 transition-all disabled:opacity-50 disabled:shadow-none"
                        title="Export Selected"
                    >
                        {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                    </button>
                </div>
            </div>

            {/* Advanced Filters Panel - Single Row Version */}
            <AnimatePresence>
                {showFilters && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden border-b border-slate-100 bg-slate-50/20"
                    >
                        <div className="px-6 py-3 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-6">
                                {/* Gender */}
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest shrink-0">Gender</span>
                                    <select
                                        value={genderFilter}
                                        onChange={(e) => setGenderFilter(e.target.value)}
                                        className="h-9 px-3 bg-white border border-slate-200 rounded-lg text-[11px] font-bold text-slate-600 focus:ring-2 focus:ring-blue-500/10 transition-all outline-none min-w-[100px]"
                                    >
                                        <option value="all">All Genders</option>
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                    </select>
                                </div>

                                {/* Age Range */}
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest shrink-0">Age</span>
                                    <select
                                        value={ageFilter}
                                        onChange={(e) => setAgeFilter(e.target.value)}
                                        className="h-9 px-3 bg-white border border-slate-200 rounded-lg text-[11px] font-bold text-slate-600 focus:ring-2 focus:ring-blue-500/10 transition-all outline-none min-w-[110px]"
                                    >
                                        <option value="all">All Ages</option>
                                        <option value="0-18">0-18 Yrs</option>
                                        <option value="19-40">19-40 Yrs</option>
                                        <option value="41-60">41-60 Yrs</option>
                                        <option value="61+">61+ Yrs</option>
                                    </select>
                                </div>

                                {/* Visit Count */}
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest shrink-0">Visits</span>
                                    <select
                                        value={visitFilter}
                                        onChange={(e) => setVisitFilter(e.target.value)}
                                        className="h-9 px-3 bg-white border border-slate-200 rounded-lg text-[11px] font-bold text-slate-600 focus:ring-2 focus:ring-blue-500/10 transition-all outline-none min-w-[100px]"
                                    >
                                        <option value="all">All Visits</option>
                                        <option value="0">0 Visits</option>
                                        <option value="1">1 Visit</option>
                                        <option value="2+">2+ Visits</option>
                                    </select>
                                </div>

                                {/* Referring Doctor Search */}
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest shrink-0">Ref Dr</span>
                                    <div className="relative">
                                        <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                        <input
                                            type="text"
                                            placeholder="Search by Doctor..."
                                            value={refFilter}
                                            onChange={(e) => setRefFilter(e.target.value)}
                                            className="w-48 h-9 pl-9 pr-3 bg-white border border-slate-200 rounded-lg text-[11px] font-bold text-slate-600 placeholder:text-slate-300 focus:ring-2 focus:ring-blue-500/10 transition-all outline-none"
                                        />
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={clearFilters}
                                className="px-4 py-2 text-[10px] font-black text-slate-400 hover:text-blue-600 transition-colors uppercase tracking-[0.2em]"
                            >
                                Clear Filters
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Table Headers */}
            <div className="px-6 py-2.5 border-b border-slate-100 bg-slate-50/10 flex items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest shrink-0">
                <div className="w-10 flex justify-center">
                    <button onClick={toggleSelectAll} className="w-4 h-4 border border-slate-200 rounded flex items-center justify-center transition-all bg-white">
                        {selectedIds.size === filteredPatients.length && filteredPatients.length > 0 && <CheckSquare size={11} className="text-blue-500" />}
                    </button>
                </div>
                <div className="w-36 pl-4">History / MRN</div>
                <div className="flex-1 px-4">Patient Details</div>
                <div className="w-48 px-4">Referral Info</div>
                <div className="w-32 px-4">Contact</div>
                <div className="w-28 text-right pr-6">Action</div>
                <div className="w-10"></div>
            </div>

            {/* Scrollable List */}
            <div ref={listRef} className="flex-1 overflow-y-auto overflow-x-hidden">
                <AnimatePresence mode="popLayout">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-20">
                            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" strokeWidth={2} />
                            <p className="mt-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Loading Records...</p>
                        </div>
                    ) : paginatedPatients.length === 0 ? (
                        <div className="py-20 text-center">
                            <p className="text-slate-400 font-bold text-sm uppercase tracking-widest italic">No clinical records found</p>
                        </div>
                    ) : (
                        paginatedPatients.map((patient, idx) => {
                            const isSelected = selectedIds.has(patient.id);
                            const isExpanded = expandedId === patient.id;
                            const initials = (patient.fullName || 'P').split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);

                            return (
                                <div key={patient.id} className="border-b border-slate-50 group transition-colors relative patient-row-wrapper">
                                    <motion.div
                                        layout
                                        initial={{ opacity: 0, y: 5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: idx * 0.02 }}
                                        className={cn(
                                            "px-6 h-14 flex items-center text-sm text-slate-600 cursor-pointer transition-all hover:bg-slate-100/50",
                                            isSelected ? "bg-blue-50/40" : (idx % 2 === 0 ? "bg-slate-50/20" : "bg-white")
                                        )}
                                        onClick={(e) => toggleExpand(e, patient.id)}
                                    >
                                        <div className="w-10 flex justify-center" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                onClick={(e) => toggleSelect(e, patient.id)}
                                                className={cn(
                                                    "w-4 h-4 border rounded flex items-center justify-center transition-all",
                                                    isSelected ? "bg-blue-500 border-blue-500 text-white" : "border-slate-200 bg-white"
                                                )}
                                            >
                                                {isSelected && <CheckSquare size={11} />}
                                            </button>
                                        </div>

                                        <div className="w-36 pl-4 flex flex-col justify-center">
                                            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                                                #{patient.mrn}
                                            </span>
                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                <span className="text-[11px] font-bold text-blue-600">
                                                    {patient.procedures?.length > 0
                                                        ? new Date(patient.procedures[0].createdAt).toLocaleDateString('en-GB')
                                                        : 'No History'}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex-1 px-4 flex items-center gap-3 overflow-hidden">
                                            <div className="w-8 h-8 rounded-full bg-blue-50 border border-blue-100/50 flex items-center justify-center overflow-hidden text-[10px] font-black text-blue-600 shrink-0 capitalize">
                                                {initials}
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <span className="font-bold text-slate-800 truncate text-[13px] leading-tight">{patient.fullName}</span>
                                                <div className="flex items-center gap-1.5 mt-0.5">
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{patient.gender || '??'}</span>
                                                    <span className="w-1 h-1 rounded-full bg-slate-200" />
                                                    <span className="text-[10px] font-bold text-slate-500">{patient.age || '??'} Yrs</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="w-48 px-4 flex flex-col justify-center overflow-hidden">
                                            <span className="text-[11px] text-slate-700 font-bold uppercase tracking-tight truncate">
                                                {patient.referringDoctor || 'Self'}
                                            </span>
                                            <span className="text-[10px] text-slate-400 font-medium truncate mt-0.5">
                                                ID: {patient.refId || '---'}
                                            </span>
                                        </div>

                                        <div className="w-32 px-4 flex items-center">
                                            <span className="font-bold text-slate-600 text-[11px] tracking-tight">{patient.mobile || '---'}</span>
                                        </div>

                                        <div className="w-28 py-2 flex justify-end pr-4" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                onClick={(e) => handleStartClick(e, patient.id)}
                                                className={cn(
                                                    "px-3 h-8 text-white rounded-lg flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-wider transition-all shadow-sm active:scale-[0.95]",
                                                    startingPatientId === patient.id
                                                        ? "bg-red-500 hover:bg-red-600 shadow-red-500/20"
                                                        : "bg-slate-900 hover:bg-blue-600 shadow-slate-900/10"
                                                )}
                                                style={{
                                                    background: startingPatientId === patient.id
                                                        ? `linear-gradient(to right, #ef4444 ${((3 - countdown) / 3) * 100}%, #f87171 ${((3 - countdown) / 3) * 100}%)`
                                                        : undefined
                                                }}
                                            >
                                                {startingPatientId === patient.id ? (
                                                    <span className="whitespace-nowrap px-1 overflow-hidden font-black">CANCEL ({countdown}s)</span>
                                                ) : (
                                                    <>
                                                        <Play size={10} fill="currentColor" />
                                                        Start
                                                    </>
                                                )}
                                            </button>
                                        </div>

                                        <div className="w-10 flex justify-end pr-4">
                                            <button
                                                onClick={(e) => toggleExpand(e, patient.id)}
                                                className={cn(
                                                    "p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all rounded-lg",
                                                    isExpanded && "text-blue-600 bg-blue-50 rotate-180"
                                                )}
                                            >
                                                <ChevronDown size={14} className="transition-transform duration-200" />
                                            </button>
                                        </div>

                                    </motion.div>

                                    {/* Expanded View: Inner Tabular View */}
                                    <AnimatePresence>
                                        {isExpanded && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: "auto", opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                className="bg-slate-50/80 overflow-hidden"
                                            >
                                                <div className="ml-auto mr-14 mb-4 max-w-2xl border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
                                                    <div className="max-h-[145px] overflow-y-auto custom-scrollbar">
                                                        <table className="w-full text-xs relative">
                                                            <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm">
                                                                <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-widest text-[9px]">
                                                                    <th className="px-4 py-2.5 text-left">Created</th>
                                                                    <th className="px-4 py-2.5 text-left">Last Updated</th>
                                                                    <th className="px-4 py-2.5 text-left w-40">Status</th>
                                                                    <th className="px-4 py-2.5 text-right">Action</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-50">
                                                                {patient.procedures && patient.procedures.length > 0 ? (
                                                                    patient.procedures.map((proc: any) => {
                                                                        // Determine unified status/action button
                                                                        let statusLabel = proc.status;
                                                                        let statusColor = "bg-slate-50 text-slate-500 border-slate-200";
                                                                        let statusIcon = <Square size={10} />;
                                                                        let actionHandler = undefined;

                                                                        if (proc.status === 'COMPLETED') {
                                                                            if (proc.report && proc.report.finalized === false) {
                                                                                statusLabel = "DRAFT REPORT";
                                                                                statusColor = "bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200 shadow-sm";
                                                                                statusIcon = <Edit2 size={10} />;
                                                                                actionHandler = () => {
                                                                                    if (onEditReport) {
                                                                                        onEditReport(patient, proc);
                                                                                    } else if (onStartAnnotate) {
                                                                                        onStartAnnotate(patient, proc);
                                                                                    } else {
                                                                                        onStartProcedure(patient, proc.id);
                                                                                    }
                                                                                };
                                                                            } else {
                                                                                statusColor = "bg-emerald-50 text-emerald-600 border-emerald-200/50";
                                                                                statusIcon = <CheckSquare size={10} />;
                                                                            }
                                                                        } else if (proc.status === 'CAPTURED') {
                                                                            statusLabel = "START ANNOTATE";
                                                                            statusColor = "bg-blue-600 text-white border-blue-600 hover:bg-blue-700 shadow-sm shadow-blue-500/20";
                                                                            statusIcon = <Edit2 size={10} />;
                                                                            actionHandler = () => {
                                                                                if (onStartAnnotate) {
                                                                                    onStartAnnotate(patient, proc);
                                                                                } else {
                                                                                    onStartProcedure(patient, proc.id);
                                                                                }
                                                                            };
                                                                        } else if (proc.status === 'CRITICAL') {
                                                                            statusColor = "bg-rose-50 text-rose-600 border-rose-200/50";
                                                                            statusIcon = <AlertCircle size={10} />;
                                                                        } else if (proc.status === 'IN_PROGRESS') {
                                                                            statusLabel = "RESUME";
                                                                            statusColor = "bg-amber-500 text-white border-amber-500 hover:bg-amber-600 shadow-sm shadow-amber-500/20";
                                                                            statusIcon = <Edit2 size={10} />;
                                                                            actionHandler = () => onStartProcedure(patient, proc.id);
                                                                        } else if (proc.status === 'SCHEDULED') {
                                                                            statusLabel = "START";
                                                                            statusColor = "bg-slate-800 text-white border-slate-800 hover:bg-slate-900 shadow-sm";
                                                                            statusIcon = <Edit2 size={10} />;
                                                                            actionHandler = () => onStartProcedure(patient, proc.id);
                                                                        }

                                                                        return (
                                                                            <tr key={proc.id} className="group/row hover:bg-slate-50/50 transition-colors">
                                                                                <td className="px-4 py-3">
                                                                                    <div className="font-bold text-slate-600 text-[11px]">{new Date(proc.createdAt).toLocaleDateString('en-GB')}</div>
                                                                                    <div className="text-[9px] text-slate-400 font-medium mt-0.5">{new Date(proc.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
                                                                                </td>
                                                                                <td className="px-4 py-3">
                                                                                    <div className="font-bold text-slate-600 text-[11px]">{new Date(proc.updatedAt || proc.createdAt).toLocaleDateString('en-GB')}</div>
                                                                                    <div className="text-[9px] text-slate-400 font-medium mt-0.5">{new Date(proc.updatedAt || proc.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
                                                                                </td>
                                                                                <td className="px-4 py-3">
                                                                                    <div className="flex flex-col gap-1.5 w-full max-w-[140px]">
                                                                                        <button
                                                                                            onClick={actionHandler}
                                                                                            disabled={!actionHandler}
                                                                                            className={cn(
                                                                                                "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all border w-full",
                                                                                                statusColor,
                                                                                                !actionHandler && "cursor-default"
                                                                                            )}
                                                                                        >
                                                                                            {statusIcon}
                                                                                            {statusLabel}
                                                                                        </button>

                                                                                        {proc.status === 'IN_PROGRESS' && (
                                                                                            <button
                                                                                                onClick={(e) => {
                                                                                                    e.stopPropagation();
                                                                                                    if (onEndAndAnnotate) onEndAndAnnotate(patient, proc);
                                                                                                }}
                                                                                                className="px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-tight flex items-center justify-center gap-1 transition-all border border-blue-200 bg-white text-blue-600 hover:bg-blue-50 shadow-sm"
                                                                                            >
                                                                                                <ArrowRight size={8} />
                                                                                                End & Annotate
                                                                                            </button>
                                                                                        )}
                                                                                    </div>
                                                                                </td>
                                                                                <td className="px-4 py-3 text-right">
                                                                                    <div className="flex items-center justify-end">
                                                                                        <button
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                onViewHistory(patient, proc.id);
                                                                                            }}
                                                                                            className="px-3 py-1.5 text-slate-600 bg-white border border-slate-200 hover:border-slate-300 rounded-lg transition-all hover:bg-slate-50 hover:shadow-sm active:scale-95 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider shadow-sm"
                                                                                        >
                                                                                            View History
                                                                                        </button>
                                                                                    </div>
                                                                                </td>
                                                                            </tr>
                                                                        );
                                                                    })
                                                                ) : (
                                                                    <tr>
                                                                        <td colSpan={4} className="px-6 py-4 text-center text-slate-400 italic font-medium text-xs">No procedures recorded</td>
                                                                    </tr>
                                                                )}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            );
                        })
                    )}
                </AnimatePresence>
            </div>

            {/* Pagination Footer */}
            {!isLoading && filteredPatients.length > 0 && (
                <div className="border-t border-slate-200 bg-white shrink-0 flex flex-col sm:flex-row items-stretch justify-between">
                    <div className="flex-1 flex flex-col sm:flex-row items-center gap-1.5 px-5 py-3 bg-gradient-to-r from-blue-50/50 to-white">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1 || showAll}
                            className="px-3 py-1.5 text-[11px] font-bold text-slate-500 hover:text-slate-800 disabled:opacity-30 disabled:hover:text-slate-500 transition-colors flex items-center gap-1"
                        >
                            &lt; Previous
                        </button>

                        <div className="flex items-center gap-1">
                            {!showAll && getPageNumbers().map((pageNum, i) => (
                                <React.Fragment key={i}>
                                    {pageNum === '...' ? (
                                        <span className="px-2 text-slate-400 text-xs">...</span>
                                    ) : (
                                        <button
                                            onClick={() => setCurrentPage(pageNum as number)}
                                            className={cn(
                                                "w-7 h-7 rounded-md text-[11px] font-bold flex items-center justify-center transition-all",
                                                currentPage === pageNum
                                                    ? "bg-slate-100 text-slate-800 ring-1 ring-slate-200"
                                                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                                            )}
                                        >
                                            {pageNum}
                                        </button>
                                    )}
                                </React.Fragment>
                            ))}
                        </div>

                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages || showAll}
                            className="px-3 py-1.5 text-[11px] font-bold text-slate-500 hover:text-slate-800 disabled:opacity-30 disabled:hover:text-slate-500 transition-colors flex items-center gap-1"
                        >
                            Next &gt;
                        </button>
                    </div>

                    <div className="flex items-center gap-4 px-5 py-3 border-t sm:border-t-0 sm:border-l border-slate-100 bg-white">
                        <span className="text-[11px] font-medium text-slate-500 whitespace-nowrap">
                            Showing <strong className="text-slate-700">{startEntry}</strong> to <strong className="text-slate-700">{endEntry}</strong> of <strong className="text-slate-700">{filteredPatients.length}</strong> entries
                        </span>

                        <button
                            onClick={() => setShowAll(!showAll)}
                            className="px-3 py-1.5 text-[11px] font-bold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors bg-white shadow-sm whitespace-nowrap"
                        >
                            {showAll ? "Paginate" : "Show All"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
