"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from "framer-motion";
import { Search, Play, Users, User, Loader2, UploadCloud, Edit2, Filter, Download, CheckSquare, Square, MoreHorizontal, ChevronDown, ChevronRight, FileText, Image as ImageIcon, AlertCircle, ArrowRight, Eye, Settings, X, Check, Trash2, ChevronUp, RotateCcw, Plus, Calendar, MapPin, Mail, HardDrive } from "lucide-react";
import { searchPatients } from "@/app/actions/auth";
import { downloadProcedureZip, downloadPatientsZip, downloadMultipleProceduresZip } from "@/lib/utils/download";
import { exportPatientsAction } from "@/app/actions/export";
import { exportToUSBAction, exportSingleProcedureToUSBAction } from "@/app/actions/export-usb";
import { getSystemStatus } from "@/app/actions/system";
import { cn } from "@/lib/utils";
import ProcedureMediaPopup from "./ProcedureMediaPopup";
import { useNotify } from "@/lib/store/ui.store";
import { SimpleTooltip, TooltipProvider } from "../ui/tooltip";
import USBFilePicker from "../ui/USBFilePicker";
import { useConfirm } from "@/lib/hooks/useConfirm";

interface PatientQueueProps {
    onViewHistory: (patient: any, procedureId: string) => void;
    onStartProcedure: (patient: any, procedureId?: string) => void;
    onStartAnnotate?: (patient: any, procedure: any) => void;
    onEditReport?: (patient: any, procedure: any) => void;
    onPreviewReport?: (patient: any, procedure: any) => void; // Added missing prop
    onEndAndAnnotate?: (patient: any, procedure: any) => void;
    onImport: () => void;
    onEdit: (patient: any) => void;
    refreshKey?: number;
    externalSearchQuery?: string;
    onSearchChange?: (q: string) => void;
    orgLogo?: string;
    orgData?: any;
    isCameraConnected?: boolean;
    currentUserId?: string; // NEW: filter patients by this doctor's ID
}


// helper to count visits
const getVisitCount = (procs: any[]) => {
    if (!procs || procs.length === 0) return 0;
    const uniqueDays = new Set(procs.map(p => new Date(p.createdAt).toLocaleDateString()));
    return uniqueDays.size;
};

const SlideToStart = ({onComplete, disabled = false}: {onComplete: () => void; disabled?: boolean}) => {
    const containerWidth = 140;
    const handleSize = 34;
    const x = useMotionValue(0);
    const backgroundFill = useTransform(x, [0, containerWidth - handleSize - 8], ["rgba(22,163,74,0.03)", "rgba(22,163,74,0.8)"]);
    const fillWidth = useTransform(x, [0, containerWidth - handleSize - 8], [handleSize, containerWidth]);
    const textColor = useTransform(x, [0, containerWidth - handleSize - 8], ["rgba(22,163,74,0.4)", "rgba(255,255,255,1)"]);
    const [done, setDone] = useState(false);
    return (
        <div className={cn("relative h-10 rounded-full overflow-hidden p-1 shadow-inner bg-slate-50 border border-slate-200/50", disabled ? "opacity-30 pointer-events-none" : "hover:bg-slate-100/50 transition-colors")} style={{ width: containerWidth }}>
            <motion.div className="absolute inset-y-0 left-0" style={{ width: fillWidth, background: backgroundFill, borderRadius: 30 }} />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <motion.span className="text-[10px] font-black tracking-[0.25em] uppercase ml-6 font-['Plus_Jakarta_Sans']" style={{ color: textColor }}>START</motion.span>
            </div>
            <motion.div drag="x" style={{x}} dragConstraints={{left:0,right:containerWidth-handleSize-8}} dragElastic={0} onDragEnd={(_,info)=>{
                if (x.get() > containerWidth-handleSize-15) { 
                    setDone(true); 
                    onComplete(); 
                    setTimeout(()=>{setDone(false); x.set(0);},1200);
                } else { 
                    animate(x,0,{type:'spring',stiffness:500,damping:30}); 
                }
            }} className={cn("relative z-30 h-full aspect-square bg-green-600 rounded-full flex items-center justify-center cursor-grab active:cursor-grabbing shadow-lg shadow-green-500/20", done && "bg-green-500")} whileHover={{scale:1.05}} whileTap={{scale:0.95}}>
                {done?<Check size={16} className="text-white" strokeWidth={3}/>:<ArrowRight size={16} className="text-white" strokeWidth={3}/>}
            </motion.div>
        </div>
    );
};

export default function PatientQueue({ onViewHistory, onStartProcedure, onStartAnnotate, onEditReport, onEndAndAnnotate, onImport, onEdit, refreshKey, externalSearchQuery, onSearchChange, orgLogo, orgData, isCameraConnected = false, currentUserId }: PatientQueueProps) {
    const [patients, setPatients] = useState<any[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [selectedProcIds, setSelectedProcIds] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [usbConnected, setUsbConnected] = useState<boolean>(false);
    const [expandedTab, setExpandedTab] = useState<'completed' | 'pending' | 'incomplete' | 'bins'>('completed');
    const [patientCategory, setPatientCategory] = useState<'all' | 'guest'>('all');
    const [exportTarget, setExportTarget] = useState<'browser' | 'usb'>('browser');
    const [usbProcExport, setUsbProcExport] = useState<{ patientId: string, procId: string } | null>(null);
    const [downloadingProcs, setDownloadingProcs] = useState<Set<string>>(new Set());
    
    // USB Folder Selection
    const [isFolderPickerOpen, setIsFolderPickerOpen] = useState(false);
    
    const notify = useNotify();
    const confirm = useConfirm();

    // Columns Visibility State
    const [showColMenu, setShowColMenu] = useState(false);
    const [cols, setCols] = useState({
        mobile: true,
        lastProcedure: true,
        lastViewDate: true,
        gallery: true,
    });

    // Advanced Filters State
    const [genderFilter, setGenderFilter] = useState<string>("all");
    const [ageFilter, setAgeFilter] = useState<string>("all");
    const [refFilter, setRefFilter] = useState<string>("");
    const [visitFilter, setVisitFilter] = useState<string>("all");
    const [fromDateFilter, setFromDateFilter] = useState<string>("");
    const [toDateFilter, setToDateFilter] = useState<string>("");

    // Media Popup State
    const [mediaPopup, setMediaPopup] = useState<{
        isOpen: boolean;
        patient: any;
        initialTab: 'images' | 'annotated' | 'videos' | 'reports';
        initialProcedureId?: string;
    }>({
        isOpen: false,
        patient: null,
        initialTab: 'images'
    });

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [showAll, setShowAll] = useState(false);
    const [itemsPerPage, setItemsPerPage] = useState(10); // start with a safe default; recalculated below

    // Ref for the scrollable table wrapper — used to compute how many rows fit
    const tableWrapperRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    // Dynamically compute rows per page to exactly fill the available height
    useEffect(() => {
        const ROW_HEIGHT = 57;   // py-4 row height in px (matches actual rendered height)
        const HEADER_HEIGHT = 49; // thead row height

        const recalculate = () => {
            const wrapper = tableWrapperRef.current;
            if (!wrapper) return;
            const available = wrapper.clientHeight - HEADER_HEIGHT;
            const rows = Math.max(5, Math.floor(available / ROW_HEIGHT));
            setItemsPerPage(rows);
        };

        const observer = new ResizeObserver(recalculate);
        if (tableWrapperRef.current) observer.observe(tableWrapperRef.current);
        recalculate(); // run once immediately
        return () => observer.disconnect();
    }, []);

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
        loadPatients();
        checkUsbStatus();
        const interval = setInterval(checkUsbStatus, 5000); // Check every 5s
        return () => clearInterval(interval);
    }, [refreshKey]);

    const loadPatients = useCallback(async () => {
        setIsLoading(true);
        try {
            const result = await searchPatients('', 500, currentUserId);
            if (result && result.success) {
                setPatients(result.patients || []);
            }
        } catch (error) {
            console.error("Clinical boot error:", error);
        } finally {
            setIsLoading(false);
        }
    }, [currentUserId]);

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

    const toggleProcSelect = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        const next = new Set(selectedProcIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedProcIds(next);
    };

    const toggleAllProcs = (e: React.MouseEvent, procs: any[]) => {
        e.stopPropagation();
        const ids = procs.map(p => p.id);
        const allSelected = ids.every(id => selectedProcIds.has(id));
        const next = new Set(selectedProcIds);
        if (allSelected) ids.forEach(id => next.delete(id));
        else ids.forEach(id => next.add(id));
        setSelectedProcIds(next);
    };

    const handleExport = async () => {
        if (selectedIds.size === 0) return;
        
        if (exportTarget === 'browser') {
            setIsExporting(true);
            try {
                const selectedPatients = patients.filter(p => selectedIds.has(p.id));
                if (selectedPatients.length === 0) throw new Error("No patients found");
                notify.info("Export Started", "Preparing files for bulk ZIP archive...");
                await downloadPatientsZip(selectedPatients, orgData);
                notify.success("Export Successful", "Bulk ZIP archive generated.");
                setSelectedIds(new Set());
            } catch (err) {
                notify.error("Export Failed", String(err));
            } finally {
                setIsExporting(false);
            }
        } else {
            // USB Mode - Open Folder Picker
            setIsFolderPickerOpen(true);
        }
    };

    const handleUSBFolderSelected = async (folderPath: string) => {
        setIsExporting(true);
        try {
            if (usbProcExport) {
                // Single procedure export
                notify.info("USB Export Started", `Copying procedure data to ${folderPath}...`);
                const res = await exportSingleProcedureToUSBAction(usbProcExport.patientId, usbProcExport.procId, folderPath);
                if (res.success) {
                    notify.success("USB Export Successful", res.message);
                } else {
                    notify.error("USB Export Failed", res.error || "Unknown error");
                }
                setUsbProcExport(null);
            } else {
                // Bulk export (current behavior)
                const patientIds = Array.from(selectedIds);
                notify.info("USB Export Started", `Copying data to ${folderPath}...`);
                const res = await exportToUSBAction(patientIds, folderPath);
                if (res.success) {
                    notify.success("USB Export Successful", res.message);
                    setSelectedIds(new Set());
                } else {
                    notify.error("USB Export Failed", res.error || "Unknown error");
                }
            }
        } catch (err) {
            notify.error("USB Export Error", String(err));
        } finally {
            setIsExporting(false);
            setIsFolderPickerOpen(false);
        }
    };

    const openMediaPopup = (e: React.MouseEvent, patient: any, tab: 'images' | 'annotated' | 'videos' | 'reports', procedureId?: string) => {
        e.stopPropagation();
        setMediaPopup({
            isOpen: true,
            patient,
            initialTab: tab,
            initialProcedureId: procedureId || (patient.procedures?.[0]?.id)
        });
    };

    const clearFilters = () => {
        setGenderFilter("all");
        setAgeFilter("all");
        setRefFilter("");
        setVisitFilter("all");
        setSearchQuery("");
        setFromDateFilter("");
        setToDateFilter("");
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

        // Category Filter
        let matchesCategory = true;
        if (patientCategory === 'all') {
            matchesCategory = p.refId !== 'GUEST';
        } else if (patientCategory === 'guest') {
            const hasMedia = p.procedures?.some((proc: any) => 
                (proc.mediaStats?.images || 0) > 0 || (proc.mediaStats?.videos || 0) > 0 || (proc.mediaStats?.reports || 0) > 0
            );
            matchesCategory = p.refId === 'GUEST' && hasMedia;
        }

        // Date Range Filter
        let matchesDate = true;
        if (fromDateFilter || toDateFilter) {
            if (!p.createdAt) {
                matchesDate = false;
            } else {
                const regDate = new Date(p.createdAt).getTime();
                if (fromDateFilter) {
                    const from = new Date(fromDateFilter).setHours(0, 0, 0, 0);
                    if (regDate < from) matchesDate = false;
                }
                if (toDateFilter) {
                    const to = new Date(toDateFilter).setHours(23, 59, 59, 999);
                    if (regDate > to) matchesDate = false;
                }
            }
        }

        return matchesQuery && matchesGender && matchesAge && matchesRef && matchesVisits && matchesCategory && matchesDate;
    });

    const hasActiveFilters = genderFilter !== "all" || ageFilter !== "all" || refFilter !== "" || visitFilter !== "all" || searchQuery !== "" || fromDateFilter !== "" || toDateFilter !== "";

    const [expandedId, setExpandedId] = useState<string | null>(null);


    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, genderFilter, ageFilter, refFilter, visitFilter, patientCategory, fromDateFilter, toDateFilter]);

    const totalPages = Math.ceil(filteredPatients.length / itemsPerPage);
    const paginatedPatients = showAll ? filteredPatients : filteredPatients.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const startEntry = showAll ? (filteredPatients.length > 0 ? 1 : 0) : (filteredPatients.length > 0 ? ((currentPage - 1) * itemsPerPage) + 1 : 0);
    const endEntry = showAll ? filteredPatients.length : Math.min(currentPage * itemsPerPage, filteredPatients.length);

    const toggleExpand = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setExpandedId(prev => (prev === id ? null : id));
    };

    const handleDeleteProc = async (e: React.MouseEvent, patientId: string, procId: string) => {
        e.stopPropagation();
        
        const ok = await confirm({
            title: "Move to Bin",
            message: "Move this procedure to bin? You can restore it later from the bin tab.",
            confirmLabel: "Move to Bin",
            variant: "primary"
        });

        if (ok) {
            setPatients(prev => prev.map(patient => {
                if (patient.id === patientId) {
                    return {
                        ...patient,
                        procedures: (patient.procedures || []).map((p: any) => 
                            p.id === procId ? { ...p, deleted: true } : p
                        )
                    };
                }
                return patient;
            }));
            notify.info("Moved to Bins", "Procedure moved to the bins tab.");
        }
    };

    const handleRestoreProc = (e: React.MouseEvent, patientId: string, procId: string) => {
        e.stopPropagation();
        setPatients(prev => prev.map(patient => {
            if (patient.id === patientId) {
                return {
                    ...patient,
                    procedures: (patient.procedures || []).map((p: any) => 
                        p.id === procId ? { ...p, deleted: false } : p
                    )
                };
            }
            return patient;
        }));
        notify.success("Restored", "Procedure has been restored effectively.");
    };

    const handlePermanentDeleteProc = async (e: React.MouseEvent, patientId: string, procId: string) => {
        e.stopPropagation();
        
        const ok = await confirm({
            title: "Delete Permanently",
            message: "Delete this procedure forever? This is permanent and you will be unable to recover it.",
            confirmLabel: "Delete Forever",
            variant: "danger"
        });

        if (ok) {
            setPatients(prev => prev.map(patient => {
                if (patient.id === patientId) {
                    return {
                        ...patient,
                        procedures: (patient.procedures || []).filter((p: any) => p.id !== procId)
                    };
                }
                return patient;
            }));
            notify.error("Deleted Forever", "Procedure record permanently removed.");
        }
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
    // Removed - using simple click handler instead

    const handleStartClick = (e: React.MouseEvent, patientId: string) => {
        e.stopPropagation();
        const patient = patients.find(p => p.id === patientId);
        if (patient) {
            onStartProcedure(patient);
        }
    };

    return (
        <TooltipProvider>
        <div className="h-full flex flex-col bg-white overflow-hidden patient-queue-root">
            {/* Main Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
                <div className="flex items-center gap-6 flex-1 min-w-0">
                    {orgLogo && (
                        <div className="flex items-center shrink-0">
                            <img
                                src={orgLogo.startsWith('data:') ? orgLogo : `/api/capture-serve?path=${encodeURIComponent(orgLogo)}`}
                                alt="Organization Logo"
                                className="h-9 w-auto max-w-[120px] object-contain"
                            />
                        </div>
                    )}
                    
                    <div className="flex items-center bg-slate-100/80 p-1 rounded-xl shrink-0">
                        {[
                            { id: 'all', label: 'All Patients', icon: Users },
                            { id: 'guest', label: 'Guest Patients', icon: User }
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setPatientCategory(tab.id as any)}
                                className={cn(
                                    "relative flex items-center gap-2 px-4 py-1.5 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap",
                                    patientCategory === tab.id 
                                        ? "bg-white text-blue-600 shadow-sm text-blue-700" 
                                        : "text-slate-500 hover:text-slate-700 hover:bg-white/40"
                                )}
                            >
                                <tab.icon size={13} strokeWidth={2.5} />
                                {tab.label}
                                {patientCategory === tab.id && (
                                    <motion.div 
                                        layoutId="activeTab"
                                        className="absolute inset-0 bg-white rounded-lg -z-10 shadow-sm"
                                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                    />
                                )}
                            </button>
                        ))}
                    </div>

                    <div className="relative flex-1 max-w-lg min-w-[200px]">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                        <input
                            type="text"
                            placeholder="Find patients by MRN, Name, or Phone..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full h-11 pl-12 pr-4 bg-slate-100/50 border border-slate-100 rounded-2xl text-sm font-bold text-slate-700 placeholder:text-slate-300 focus:ring-[6px] focus:ring-blue-600/5 focus:bg-white focus:border-blue-600/10 transition-all outline-none font-['Plus_Jakarta_Sans']"
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

                    <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
                        <button
                            onClick={() => { setExportTarget('browser'); handleExport(); }}
                            disabled={selectedIds.size === 0 || isExporting}
                            className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold transition-all",
                                selectedIds.size === 0 || isExporting
                                    ? "text-slate-400 cursor-not-allowed"
                                    : "text-slate-600 hover:bg-white hover:text-blue-600"
                            )}
                            title="Download as ZIP to your computer"
                        >
                            {isExporting && exportTarget === 'browser' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                            ZIP
                        </button>
                        <div className="w-[1px] h-3 bg-slate-200" />
                        <button
                            onClick={() => { setExportTarget('usb'); handleExport(); }}
                            disabled={selectedIds.size === 0 || isExporting || !usbConnected}
                            className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold transition-all",
                                !usbConnected || selectedIds.size === 0 || isExporting
                                    ? "text-slate-400 cursor-not-allowed"
                                    : "text-slate-600 hover:bg-white hover:text-blue-600"
                            )}
                            title={!usbConnected ? "Connect USB external storage to export" : "Export directly to USB folder"}
                        >
                            {isExporting && exportTarget === 'usb' ? <Loader2 size={14} className="animate-spin" /> : <HardDrive size={14} />}
                            USB
                        </button>
                    </div>
                </div>
            </div>

            <USBFilePicker 
                isOpen={isFolderPickerOpen}
                onClose={() => setIsFolderPickerOpen(false)}
                onFilesSelected={() => {}} 
                onFolderSelected={handleUSBFolderSelected}
                mode="folder"
                title="Select Export Destination"
                usbOnly
            />

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
                                <div className="flex flex-col gap-1">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.15em] ml-1">Gender</span>
                                    <select
                                        value={genderFilter}
                                        onChange={(e) => setGenderFilter(e.target.value)}
                                        className="h-8 px-2 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 focus:ring-2 focus:ring-blue-500/10 transition-all outline-none min-w-[90px]"
                                    >
                                        <option value="all">All Genders</option>
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                    </select>
                                </div>

                                {/* Age Range */}
                                <div className="flex flex-col gap-1">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.15em] ml-1">Age</span>
                                    <select
                                        value={ageFilter}
                                        onChange={(e) => setAgeFilter(e.target.value)}
                                        className="h-8 px-2 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 focus:ring-2 focus:ring-blue-500/10 transition-all outline-none min-w-[90px]"
                                    >
                                        <option value="all">All Ages</option>
                                        <option value="0-18">0-18 Yrs</option>
                                        <option value="19-40">19-40 Yrs</option>
                                        <option value="41-60">41-60 Yrs</option>
                                        <option value="61+">61+ Yrs</option>
                                    </select>
                                </div>

                                {/* Visit Count */}
                                <div className="flex flex-col gap-1">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.15em] ml-1">Visits</span>
                                    <select
                                        value={visitFilter}
                                        onChange={(e) => setVisitFilter(e.target.value)}
                                        className="h-8 px-2 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 focus:ring-2 focus:ring-blue-500/10 transition-all outline-none min-w-[90px]"
                                    >
                                        <option value="all">All Visits</option>
                                        <option value="0">0 Visits</option>
                                        <option value="1">1 Visit</option>
                                        <option value="2+">2+ Visits</option>
                                    </select>
                                </div>

                                {/* Referring Doctor Search */}
                                <div className="flex flex-col gap-1">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.15em] ml-1">Ref Dr</span>
                                    <div className="relative">
                                        <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                        <input
                                            type="text"
                                            placeholder="Search Doctor..."
                                            value={refFilter}
                                            onChange={(e) => setRefFilter(e.target.value)}
                                            className="w-40 h-8 pl-9 pr-3 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 placeholder:text-slate-300 focus:ring-2 focus:ring-blue-500/10 transition-all outline-none"
                                        />
                                    </div>
                                </div>

                                {/* Date Range Filter */}
                                <div className="flex items-center gap-4 ml-2 border-l border-slate-200 pl-4">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.15em] ml-1">From Date</span>
                                        <div className="relative">
                                            <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                                            <input
                                                type="date"
                                                value={fromDateFilter}
                                                onChange={(e) => setFromDateFilter(e.target.value)}
                                                className="h-8 pl-8 pr-2 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 focus:ring-2 focus:ring-blue-500/10 transition-all outline-none"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.15em] ml-1">To Date</span>
                                        <div className="relative">
                                            <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                                            <input
                                                type="date"
                                                value={toDateFilter}
                                                onChange={(e) => setToDateFilter(e.target.value)}
                                                className="h-8 pl-8 pr-2 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 focus:ring-2 focus:ring-blue-500/10 transition-all outline-none"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={clearFilters}
                                className="px-4 py-2 text-[10px] font-black text-slate-400 hover:text-blue-600 transition-colors tracking-[0.2em]"
                            >
                                Clear Filters
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Table & Pagination Wrapper */}
            <div className="bg-white rounded-[24px] border border-slate-200/70 !border-t-transparent shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col flex-1 overflow-hidden mx-6 mb-6">
                <div ref={tableWrapperRef} className="flex-1 overflow-auto no-scrollbar relative w-full custom-scrollbar">
                    <table className="w-full text-left border-collapse table-fixed">
                        <thead>
                            <tr className="bg-slate-50/80">
                                <th className="sticky top-0 bg-slate-50/95 backdrop-blur-md z-30 w-[40px] px-3 py-3 border-b border-slate-200/80">
                                    <button onClick={toggleSelectAll} className="w-5 h-5 border-[1.5px] border-slate-200 rounded-lg flex items-center justify-center transition-all bg-white hover:border-blue-500">
                                        {selectedIds.size === filteredPatients.length && filteredPatients.length > 0 && <CheckSquare size={13} className="text-blue-500" />}
                                    </button>
                                </th>
                                <th className="sticky top-0 bg-slate-50/95 backdrop-blur-md z-30 w-[140px] px-3 py-4 border-b border-slate-200/80">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] font-['Plus_Jakarta_Sans']">MRN / 1st visit</span>
                                </th>
                                <th className="sticky top-0 bg-slate-50/95 backdrop-blur-md z-30 w-[200px] px-3 py-4 border-b border-slate-200/80">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] font-['Plus_Jakarta_Sans']">Patient name / ABHA ID</span>
                                </th>
                                <th className="sticky top-0 bg-slate-50/95 backdrop-blur-md z-30 w-[100px] px-3 py-4 border-b border-slate-200/80 text-center">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] font-['Plus_Jakarta_Sans']">Age / Sex</span>
                                </th>
                                <th className="sticky top-0 bg-slate-50/95 backdrop-blur-md z-30 w-[130px] px-3 py-4 border-b border-slate-200/80">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] font-['Plus_Jakarta_Sans']">Mobile</span>
                                </th>
                                <th className="sticky top-0 bg-slate-50/95 backdrop-blur-md z-30 w-[240px] px-4 py-4 border-b border-slate-200/80">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] font-['Plus_Jakarta_Sans']">Last procedure</span>
                                </th>
                                <th className="sticky top-0 bg-slate-50/95 backdrop-blur-md z-30 w-[140px] px-4 py-4 border-b border-slate-200/80 text-left">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] font-['Plus_Jakarta_Sans']">Action</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100/80">
                    <AnimatePresence mode="popLayout">
                        {isLoading ? (
                            <motion.tr layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                <td colSpan={7}>
                                    <div className="flex flex-col items-center justify-center py-20">
                                        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" strokeWidth={2} />
                                        <p className="mt-4 text-[11px] font-bold text-slate-400 tracking-widest">Loading records...</p>
                                    </div>
                                </td>
                            </motion.tr>
                        ) : paginatedPatients.length === 0 ? (
                            <motion.tr layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                <td colSpan={7}>
                                    <div className="py-20 text-center">
                                        <p className="text-slate-400 font-bold text-sm tracking-widest italic">No clinical records found</p>
                                    </div>
                                </td>
                            </motion.tr>
                        ) : (
                                    paginatedPatients.map((patient, idx) => {
                                        const isSelected = selectedIds.has(patient.id);
                                        const isExpanded = expandedId === patient.id;
                                        
                                        // Filter out ghost procedures (must have media or be completed/have report)
                                        const validProcs = (patient.procedures || []).filter((p: any) => 
                                            !p.deleted && (p.status === 'COMPLETED' || p.report || (p.mediaStats?.images > 0 || p.mediaStats?.videos > 0))
                                        );
                                        const lastProc = validProcs[0];

                                        return (
                                            <React.Fragment key={patient.id}>
                                                <motion.tr
                                                    initial={{ opacity: 0 }}
                                                    animate={{ opacity: 1 }}
                                                    transition={{ delay: idx * 0.01 }}
                                                    className={cn(
                                                        "group transition-colors relative cursor-pointer border-b border-slate-200/60 patient-row-wrapper",
                                                        isSelected ? "bg-blue-50/80" : isExpanded ? "bg-white shadow-[0_12px_30px_rgba(0,0,0,0.08)] z-[50] sticky top-[57px]" : "bg-white hover:bg-slate-50/40"
                                                    )}
                                                    onClick={(e) => toggleExpand(e, patient.id)}
                                                >
                                                    <td className="px-3 py-2.5 bg-inherit rounded-l-none">
                                                        <button
                                                            onClick={(e) => toggleSelect(e, patient.id)}
                                                            className={cn(
                                                                "w-4 h-4 border rounded flex items-center justify-center transition-all",
                                                                isSelected ? "bg-blue-500 border-blue-500 text-white" : "border-slate-300 bg-white"
                                                            )}
                                                        >
                                                            {isSelected && <CheckSquare size={10} />}
                                                        </button>
                                                    </td>

                                                    {/* Stacked MRN / 1st Visit */}
                                                     <td className="px-3 py-4">
                                                        <div className="flex flex-col">
                                                            <span className="text-[14px] font-extrabold text-slate-800 tracking-tight font-['Plus_Jakarta_Sans']">{patient.mrn}</span>
                                                            <span className="text-[11px] text-slate-400 font-bold leading-tight mt-1 uppercase tracking-wider font-['Plus_Jakarta_Sans']">
                                                                {patient.createdAt ? new Date(patient.createdAt).toLocaleDateString('en-GB') : 'No record'}
                                                            </span>
                                                        </div>
                                                    </td>

                                                    {/* Stacked Patient Name / ABHA ID */}
                                                     <td className="px-4 py-5 group/name relative">
                                                        <div className="flex items-center gap-3 max-w-full overflow-hidden">
                                                            <div className="flex flex-col flex-1 overflow-hidden">
                                                                 <div className="flex items-center gap-1.5">
                                                                    <span className="text-[15px] font-extrabold text-slate-900 truncate capitalize leading-tight font-['Plus_Jakarta_Sans']">
                                                                        {patient.fullName?.toLowerCase() || 'Unnamed'}
                                                                    </span>
                                                                    {/* Show icon near name ONLY if ALL procedures are imported (whole patient was imported) */}
                                                                    {(() => {
                                                                        const validProcs = (patient.procedures || []).filter((p: any) => !p.deleted);
                                                                        const isFullyImported = validProcs.length > 0 && validProcs.every((p: any) => p.source === 'External Import' || p.type === 'External Import');
                                                                        return isFullyImported ? (
                                                                            <SimpleTooltip content="Imported Patient">
                                                                                <div className="flex items-center justify-center w-[18px] h-[18px] rounded-full bg-blue-100 border border-blue-200 shrink-0">
                                                                                    <UploadCloud size={10} className="text-blue-600" strokeWidth={2.5} />
                                                                                </div>
                                                                            </SimpleTooltip>
                                                                        ) : null;
                                                                    })()}
                                                                </div>
                                                                {patient.refId && patient.refId !== 'NILL' && patient.refId !== 'No Abha id' && (
                                                                    <span className="text-[11px] text-slate-400 font-bold truncate leading-tight mt-1.5 flex items-center gap-1.5 font-['Plus_Jakarta_Sans']">
                                                                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-100"></span>
                                                                        {patient.refId}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); onEdit(patient); }}
                                                                className="opacity-0 group-hover/name:opacity-100 transition-all duration-300 p-2.5 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded-xl shadow-sm border border-blue-100 flex items-center justify-center translate-x-4 group-hover/name:translate-x-0"
                                                            >
                                                                <Edit2 size={13} strokeWidth={2.5} />
                                                            </button>
                                                        </div>
                                                    </td>

                                                    {/* Merged Age / Gender */}
                                                     <td className="px-3 py-4 border-l border-slate-50">
                                                        <div className="flex items-center justify-center gap-2">
                                                            <span className="text-[14px] font-black text-slate-700 font-['Plus_Jakarta_Sans']">{patient.refId === 'GUEST' ? '--' : (patient.age || '--')}</span>
                                                            <span className="text-slate-200 font-light translate-y-[-1px]">|</span>
                                                            <span className={cn(
                                                                "inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-lg text-[10px] font-black tracking-widest uppercase",
                                                                patient.gender?.toLowerCase() === 'male' 
                                                                    ? "bg-blue-50/50 text-blue-600 border border-blue-100/50" 
                                                                    : "bg-pink-50/50 text-pink-600 border border-pink-100/50"
                                                            )}>
                                                                {patient.refId === 'GUEST' ? '?' : (patient.gender?.charAt(0) || '?')}
                                                            </span>
                                                        </div>
                                                    </td>

                                                     <td className="px-3 py-4 text-[14px] font-bold text-slate-600 border-l border-slate-50 font-['Plus_Jakarta_Sans']">
                                                        {patient.refId === 'GUEST' ? '--' : (patient.mobile || '--')}
                                                    </td>

                                                      <td className="px-3 py-4 border-l border-slate-50">
                                                        <div className="flex flex-col gap-1.5">
                                                            <span className="text-[14px] font-black text-slate-800 truncate leading-tight tracking-tight capitalize font-['Plus_Jakarta_Sans']">
                                                                {lastProc ? lastProc.type : 'None'}
                                                            </span>
                                                            <div className="flex items-center gap-3">
                                                                <span className="text-[10px] text-slate-400 font-bold whitespace-nowrap uppercase tracking-widest font-['Plus_Jakarta_Sans']">
                                                                    {lastProc ? new Date(lastProc.createdAt).toLocaleDateString('en-GB') : ''}
                                                                </span>
                                                                 <div className="flex items-center gap-3">
                                                                    <button 
                                                                        onClick={(e) => openMediaPopup(e, patient, 'images', lastProc?.id)}
                                                                        className="flex items-center gap-1.5 hover:text-blue-500 transition-all text-slate-300 group/icon"
                                                                    >
                                                                        <ImageIcon size={12} strokeWidth={2.5} className="group-hover/icon:scale-110 transition-all" />
                                                                        <span className="text-[11px] font-black tabular-nums font-['Plus_Jakarta_Sans']">
                                                                            {lastProc?.mediaStats?.images || 0}
                                                                        </span>
                                                                    </button>
                                                                    <button 
                                                                        onClick={(e) => openMediaPopup(e, patient, 'videos', lastProc?.id)}
                                                                        className="flex items-center gap-1.5 hover:text-blue-500 transition-all text-slate-300 group/icon"
                                                                    >
                                                                        <Play size={10} fill="currentColor" strokeWidth={0} className="group-hover/icon:scale-110 transition-all" />
                                                                        <span className="text-[11px] font-black tabular-nums font-['Plus_Jakarta_Sans']">
                                                                            {lastProc?.mediaStats?.videos || 0}
                                                                        </span>
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>

                                                    <td className="px-3 py-4">
                                                        <div className="flex items-center justify-start">
                                                            {patient.refId === 'GUEST' ? (
                                                                 <button
                                                                    onClick={(e) => { e.stopPropagation(); onEdit(patient); }}
                                                                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-[10px] font-black tracking-[0.2em] uppercase shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all active:scale-95 font-['Plus_Jakarta_Sans']"
                                                                >
                                                                    <Plus size={14} strokeWidth={3} />
                                                                    Add Details
                                                                </button>
                                                            ) : (
                                                                <SlideToStart onComplete={() => onStartProcedure(patient)} disabled={isLoading || !isCameraConnected} />
                                                            )}
                                                        </div>
                                                    </td>
                                                </motion.tr>

                                                <AnimatePresence>
                                                    {isExpanded && (
                                                        <motion.tr
                                                            initial={{ opacity: 0, height: 0 }}
                                                            animate={{ opacity: 1, height: 'auto' }}
                                                            exit={{ opacity: 0, height: 0 }}
                                                            className="bg-white patient-row-wrapper relative z-[45] sticky top-[112px] border-b border-slate-200/60 shadow-[0_20px_40px_rgba(0,0,0,0.06)]"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <td colSpan={7} className="p-0 border-none">
                                                                <div className="px-6 py-6" onClick={(e) => e.stopPropagation()}>
                                                                    <div className="bg-white rounded-[24px] border border-slate-200/60 shadow-sm overflow-hidden max-h-[500px] overflow-y-auto custom-scrollbar">
                                                                        {/* Patient Quick Info Bar */}
                                                                        <div className="px-8 py-5 border-b border-slate-100 bg-slate-50/10 flex flex-wrap items-center gap-y-4 gap-x-12">
                                                                            {/* Address */}
                                                                            <div className="flex items-center gap-3 min-w-[200px] group/info">
                                                                                <div className="w-9 h-9 rounded-xl bg-blue-50/50 flex items-center justify-center text-blue-500 group-hover/info:bg-blue-500 group-hover/info:text-white transition-all duration-300">
                                                                                    <MapPin size={16} strokeWidth={2.5} />
                                                                                </div>
                                                                                <div className="flex flex-col">
                                                                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5">Residential Address</span>
                                                                                    <span className="text-[13px] font-bold text-slate-700 leading-tight">
                                                                                        {patient.address || 'Address not provided'}
                                                                                    </span>
                                                                                </div>
                                                                            </div>

                                                                            {/* Email */}
                                                                            <div className="flex items-center gap-3 min-w-[200px] group/info">
                                                                                <div className="w-9 h-9 rounded-xl bg-emerald-50/50 flex items-center justify-center text-emerald-500 group-hover/info:bg-emerald-500 group-hover/info:text-white transition-all duration-300">
                                                                                    <Mail size={16} strokeWidth={2.5} />
                                                                                </div>
                                                                                <div className="flex flex-col">
                                                                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5">Email Address</span>
                                                                                    <span className="text-[13px] font-bold text-slate-700 leading-tight">
                                                                                        {patient.email || 'No email registered'}
                                                                                    </span>
                                                                                </div>
                                                                            </div>

                                                                            {/* Referring Physician */}
                                                                            <div className="flex items-center gap-3 min-w-[200px] group/info">
                                                                                <div className="w-9 h-9 rounded-xl bg-orange-50/50 flex items-center justify-center text-orange-500 group-hover/info:bg-orange-500 group-hover/info:text-white transition-all duration-300">
                                                                                    <User size={16} strokeWidth={2.5} />
                                                                                </div>
                                                                                <div className="flex flex-col">
                                                                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5">Referring Physician</span>
                                                                                    <span className="text-[13px] font-bold text-slate-700 leading-tight">
                                                                                        {patient.referringDoctor || 'Self'}
                                                                                    </span>
                                                                                </div>
                                                                            </div>
                                                                        </div>

                                                                        {/* Fluid Tabs */}
                                                                        <div className="flex items-center justify-between px-8 border-b border-slate-100 bg-slate-50/30">
                                                                            <div className="flex items-center gap-8">
                                                                                 {[
                                                                                     { id: 'completed', label: 'Completed', count: patient.procedures?.filter((p: any) => !p.deleted && p.report?.finalized).length || 0 },
                                                                                     { id: 'pending', label: 'Pending', count: patient.procedures?.filter((p: any) => !p.deleted && (p.status === 'COMPLETED' || p.report) && !p.report?.finalized).length || 0 },
                                                                                     { id: 'incomplete', label: 'Incomplete', count: patient.procedures?.filter((p: any) => !p.deleted && p.status !== 'COMPLETED' && !p.report && (p.mediaStats?.images > 0 || p.mediaStats?.videos > 0)).length || 0 },
                                                                                     { id: 'bins', label: 'Bin', count: patient.procedures?.filter((p: any) => p.deleted).length || 0 }
                                                                                 ].map((tab) => (
                                                                                    <button
                                                                                        key={tab.id}
                                                                                        onClick={(e) => { e.stopPropagation(); setExpandedTab(tab.id as any); }}
                                                                                        className={cn(
                                                                                            "py-4 text-[12px] font-black uppercase tracking-[0.2em] relative transition-all",
                                                                                            expandedTab === tab.id ? "text-blue-600" : "text-slate-400 hover:text-slate-600"
                                                                                        )}
                                                                                    >
                                                                                        <div className="flex items-center gap-2">
                                                                                            {tab.label}
                                                                                            <span className={cn(
                                                                                                "px-1.5 py-0.5 rounded text-[10px] tabular-nums",
                                                                                                expandedTab === tab.id ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500"
                                                                                            )}>
                                                                                                {tab.count || 0}
                                                                                            </span>
                                                                                        </div>
                                                                                        {expandedTab === tab.id && (
                                                                                            <motion.div layoutId="expandedActiveTab" className="absolute bottom-0 inset-x-0 h-0.5 bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.4)]" />
                                                                                        )}
                                                                                    </button>
                                                                                ))}
                                                                            </div>

                                                                            <div className="flex items-center gap-3">
                                                                                {/* Bulk Download Button — appears when procedures are selected */}
                                                                                {selectedProcIds.size > 0 && (
                                                                                    <button 
                                                                                        onClick={async (e) => {
                                                                                            e.stopPropagation();
                                                                                            if (downloadingProcs.size > 0 || !usbConnected) return;
                                                                                            
                                                                                            // Mark all selected as downloading
                                                                                            setDownloadingProcs(prev => {
                                                                                                const next = new Set(prev);
                                                                                                selectedProcIds.forEach(id => next.add(id));
                                                                                                return next;
                                                                                            });
                                                                                            
                                                                                            try {
                                                                                                notify.success("Bulk Download Started", `Preparing ${selectedProcIds.size} procedures for ZIP archive...`);
                                                                                                const selectedProcs = patient.procedures?.filter((p: any) => selectedProcIds.has(p.id)) || [];
                                                                                                await downloadMultipleProceduresZip(patient, selectedProcs, orgData);
                                                                                                notify.success("Download Complete", "Bulk ZIP archive generated successfully.");
                                                                                                setSelectedProcIds(new Set());
                                                                                            } catch (err) {
                                                                                                console.error("Bulk download failed:", err);
                                                                                                notify.error("Download Failed", "There was an error generating the bulk ZIP archive.");
                                                                                            } finally {
                                                                                                setDownloadingProcs(prev => {
                                                                                                    const next = new Set(prev);
                                                                                                    selectedProcIds.forEach(id => next.delete(id));
                                                                                                    return next;
                                                                                                });
                                                                                            }
                                                                                        }}
                                                                                        disabled={downloadingProcs.size > 0 || !usbConnected}
                                                                                        className={cn(
                                                                                            "flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm border",
                                                                                            downloadingProcs.size > 0
                                                                                                ? "bg-slate-100 text-slate-400 border-slate-200 cursor-wait"
                                                                                                : !usbConnected
                                                                                                    ? "bg-slate-200 text-slate-400 border-slate-300 cursor-not-allowed"
                                                                                                    : "bg-emerald-500 text-white border-emerald-500 hover:bg-emerald-600 shadow-emerald-200/50"
                                                                                        )}
                                                                                        title={!usbConnected ? "Connect USB external storage to download" : `Download ${selectedProcIds.size} selected procedures as ZIP`}
                                                                                    >
                                                                                        {downloadingProcs.size > 0 ? (
                                                                                            <Loader2 size={13} className="animate-spin" />
                                                                                        ) : (
                                                                                            <Download size={13} />
                                                                                        )}
                                                                                        Download ({selectedProcIds.size})
                                                                                    </button>
                                                                                )}

                                                                                <button 
                                                                                    onClick={(e) => { e.stopPropagation(); setExpandedId(null); }}
                                                                                    className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50/80 rounded-lg transition-all group/close flex items-center gap-2 pr-3"
                                                                                    title="Close expanded view"
                                                                                >
                                                                                    <div className="w-8 h-8 rounded-full bg-slate-100 group-hover/close:bg-blue-100 flex items-center justify-center transition-colors">
                                                                                        <ChevronUp size={18} className="group-hover/close:-translate-y-0.5 transition-transform" />
                                                                                    </div>
                                                                                    <span className="text-[10px] font-bold uppercase tracking-widest opacity-0 group-hover/close:opacity-100 transition-opacity">Close</span>
                                                                                </button>
                                                                            </div>
                                                                        </div>

                                                                        <table className="w-full text-left border-collapse table-fixed">
                                                                            <thead className="bg-slate-50/30 border-b border-slate-100">
                                                                                <tr>
                                                                                    <th className="w-[50px] px-6 py-4 sticky top-0 bg-slate-50 z-20">
                                                                                         <button 
                                                                                             onClick={(e) => {
                                                                                                 const currentFilteredProcs = patient.procedures?.filter((p: any) => {
                                                                                                     if (expandedTab === 'bins') return p.deleted;
                                                                                                     if (expandedTab === 'completed') return !p.deleted && p.report?.finalized;
                                                                                                     if (expandedTab === 'pending') return !p.deleted && (p.status === 'COMPLETED' || p.report) && !p.report?.finalized;
                                                                                                     if (expandedTab === 'incomplete') return !p.deleted && p.status !== 'COMPLETED' && !p.report && (p.mediaStats?.images > 0 || p.mediaStats?.videos > 0);
                                                                                                     return false;
                                                                                                 }) || [];
                                                                                                 toggleAllProcs(e, currentFilteredProcs);
                                                                                             }} 
                                                                                             className={cn(
                                                                                                 "w-4 h-4 border rounded flex items-center justify-center transition-all",
                                                                                                 (() => {
                                                                                                     const currentFilteredProcs = patient.procedures?.filter((p: any) => {
                                                                                                         if (expandedTab === 'bins') return p.deleted;
                                                                                                         if (expandedTab === 'completed') return !p.deleted && p.report?.finalized;
                                                                                                         if (expandedTab === 'pending') return !p.deleted && (p.status === 'COMPLETED' || p.report) && !p.report?.finalized;
                                                                                                         if (expandedTab === 'incomplete') return !p.deleted && p.status !== 'COMPLETED' && !p.report && (p.mediaStats?.images > 0 || p.mediaStats?.videos > 0);
                                                                                                         return false;
                                                                                                     }) || [];
                                                                                                     const allSelected = currentFilteredProcs.length > 0 && currentFilteredProcs.every((p: any) => selectedProcIds.has(p.id));
                                                                                                     return allSelected ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300 bg-white hover:border-blue-400";
                                                                                                 })()
                                                                                             )}
                                                                                         >
                                                                                             {(() => {
                                                                                                 const currentFilteredProcs = patient.procedures?.filter((p: any) => {
                                                                                                     if (expandedTab === 'bins') return p.deleted;
                                                                                                     if (expandedTab === 'completed') return !p.deleted && p.report?.finalized;
                                                                                                     if (expandedTab === 'pending') return !p.deleted && (p.status === 'COMPLETED' || p.report) && !p.report?.finalized;
                                                                                                     if (expandedTab === 'incomplete') return !p.deleted && p.status !== 'COMPLETED' && !p.report && (p.mediaStats?.images > 0 || p.mediaStats?.videos > 0);
                                                                                                     return false;
                                                                                                 }) || [];
                                                                                                 const allSelected = currentFilteredProcs.length > 0 && currentFilteredProcs.every((p: any) => selectedProcIds.has(p.id));
                                                                                                 return allSelected && <CheckSquare size={10} />;
                                                                                             })()}
                                                                                         </button>
                                                                                    </th>
                                                                                    <th className="w-[180px] px-6 py-4 text-[11px] font-black text-slate-400 tracking-[0.2em] whitespace-nowrap sticky top-0 bg-slate-50 z-20">Date & Time</th>
                                                                                    <th className="px-6 py-4 text-[11px] font-black text-slate-400 tracking-[0.2em] whitespace-nowrap sticky top-0 bg-slate-50 z-20">Procedure Name</th>
                                                                                    <th className="w-[180px] px-6 py-4 text-[11px] font-black text-slate-400 tracking-[0.2em] whitespace-nowrap sticky top-0 bg-slate-50 z-20">Status</th>
                                                                                    <th className="w-[180px] px-6 py-4 text-[11px] font-black text-slate-400 tracking-[0.2em] whitespace-nowrap sticky top-0 bg-slate-50 z-20">Gallery Icons</th>
                                                                                     <th className="w-[100px] px-6 py-4 text-[11px] font-black text-slate-400 tracking-[0.2em] text-center whitespace-nowrap sticky top-0 bg-slate-50 z-20">
                                                                                         {expandedTab === 'incomplete' ? 'Annotate' : 'Report'}
                                                                                     </th>
                                                                                    <th className="w-[100px] px-6 py-4 text-[11px] font-black text-slate-400 tracking-[0.2em] text-center whitespace-nowrap sticky top-0 bg-slate-50 z-20">{expandedTab === 'bins' ? 'Actions' : 'Delete'}</th>
                                                                                    <th className="w-[120px] px-6 py-4 text-[11px] font-black text-slate-400 tracking-[0.2em] text-center whitespace-nowrap sticky top-0 bg-slate-50 z-20">Download</th>
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody className="divide-y divide-slate-100">
                                                                                 {(() => {
                                                                                     const getFilteredProcs = (tab: string) => {
                                                                                         if (!patient.procedures) return [];
                                                                                         return patient.procedures.filter((p: any) => {
                                                                                             if (tab === 'bins') return p.deleted;
                                                                                           if (tab === 'completed') return !p.deleted && p.report?.finalized;
                                                                                           if (tab === 'pending') return !p.deleted && (p.status === 'COMPLETED' || p.report) && !p.report?.finalized;
                                                                                           if (tab === 'incomplete') return !p.deleted && p.status !== 'COMPLETED' && !p.report && (p.mediaStats?.images > 0 || p.mediaStats?.videos > 0);
                                                                                           return false;
                                                                                         });
                                                                                     };

                                                                                     const filteredProcs = getFilteredProcs(expandedTab);

                                                                                     if (filteredProcs.length === 0) {
                                                                                         return (
                                                                                             <tr>
                                                                                                 <td colSpan={7} className="px-6 py-12 text-center">
                                                                                                     <div className="flex flex-col items-center gap-2">
                                                                                                        <AlertCircle className="text-slate-200 w-10 h-10" />
                                                                                                        <p className="text-[13px] font-bold text-slate-400 italic">No {expandedTab} procedures found</p>
                                                                                                     </div>
                                                                                                 </td>
                                                                                             </tr>
                                                                                         );
                                                                                     }

                                                                                     return filteredProcs.map((proc: any) => (
                                                                                         <tr key={proc.id} className="hover:bg-blue-50/20 transition-all duration-300 group/proc border-b border-slate-50 last:border-0">
                                                                                             <td className="px-6 py-5">
                                                                                                 <button 
                                                                                                     onClick={(e) => toggleProcSelect(e, proc.id)} 
                                                                                                     className={cn(
                                                                                                         "w-4 h-4 border rounded flex items-center justify-center transition-all",
                                                                                                         selectedProcIds.has(proc.id) ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300 bg-white hover:border-blue-400"
                                                                                                     )}
                                                                                                 >
                                                                                                     {selectedProcIds.has(proc.id) && <CheckSquare size={10} />}
                                                                                                 </button>
                                                                                             </td>
                                                                                             <td className="px-6 py-5">
                                                                                                 <div className="flex flex-col">
                                                                                                     <span className="text-[14px] font-bold text-slate-800 tracking-tight">
                                                                                                         {new Date(proc.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                                                                     </span>
                                                                                                     <span className="text-[11px] text-slate-400 font-medium uppercase tracking-widest mt-0.5">
                                                                                                         {new Date(proc.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                                                                                     </span>
                                                                                                 </div>
                                                                                             </td>
                                                                                              <td className="px-6 py-5">
                                                                                                  <div className="flex items-center gap-1.5">
                                                                                                      <span className="text-[15px] font-bold text-slate-900 capitalize">{proc.type}</span>
                                                                                                      {(() => {
                                                                                                          const allProcs = (patient.procedures || []).filter((p: any) => !p.deleted);
                                                                                                          const isFullyImported = allProcs.every((p: any) => p.source === 'External Import');
                                                                                                          const thisProcImported = proc.source === 'External Import';
                                                                                                          return (!isFullyImported && thisProcImported) ? (
                                                                                                              <SimpleTooltip content="This procedure was imported">
                                                                                                                  <div className="flex items-center justify-center w-[16px] h-[16px] rounded-full bg-blue-100 border border-blue-200 shrink-0">
                                                                                                                      <UploadCloud size={9} className="text-blue-600" strokeWidth={2.5} />
                                                                                                                  </div>
                                                                                                              </SimpleTooltip>
                                                                                                          ) : null;
                                                                                                      })()} 
                                                                                                  </div>
                                                                                              </td>
                                                                                             <td className="px-6 py-5">
                                                                                                  {(() => {
                                                                                                      // Tab 1: Completed
                                                                                                      if (expandedTab === 'completed' || proc.report?.finalized) {
                                                                                                         return (
                                                                                                             <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase tracking-widest border border-emerald-100/50 whitespace-nowrap">
                                                                                                                 <span className="w-1 h-1 rounded-full bg-emerald-500"></span>
                                                                                                                 Completed
                                                                                                             </span>
                                                                                                         );
                                                                                                      }
                                                                                                      
                                                                                                      // Tab 2: Pending
                                                                                                      if (expandedTab === 'pending') {
                                                                                                          if (proc.report && !proc.report.finalized) {
                                                                                                              return (
                                                                                                                  <button 
                                                                                                                      onClick={(e) => { e.stopPropagation(); openMediaPopup(e, patient, 'reports', proc.id); }}
                                                                                                                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-50 text-orange-600 text-[10px] font-black uppercase tracking-widest border border-orange-100/50 hover:bg-orange-100 transition-colors shadow-sm whitespace-nowrap"
                                                                                                                  >
                                                                                                                      <span className="w-1 h-1 rounded-full bg-orange-500"></span>
                                                                                                                      Edit Report
                                                                                                                  </button>
                                                                                                              );
                                                                                                          }

                                                                                                          const hasAnnotated = proc.media?.some((m: any) => m.originId || m.type === 'ANNOTATED');
                                                                                                          return (
                                                                                                              <button 
                                                                                                                  onClick={(e) => { e.stopPropagation(); onStartAnnotate?.(patient, proc); }}
                                                                                                                  className={cn(
                                                                                                                      "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border transition-colors shadow-sm whitespace-nowrap",
                                                                                                                      hasAnnotated ? "bg-blue-50 text-blue-600 border-blue-100/50 hover:bg-blue-100 resume-annotate-glow" : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                                                                                                                  )}
                                                                                                              >
                                                                                                                  <span className={cn("w-1 h-1 rounded-full", hasAnnotated ? "bg-blue-600" : "bg-slate-400")}></span>
                                                                                                                  {hasAnnotated ? "Resume Annotate" : "Start Annotate"}
                                                                                                              </button>
                                                                                                          );
                                                                                                      }

                                                                                                      // Tab 3: Incomplete (Captured)
                                                                                                      if (expandedTab === 'incomplete') {
                                                                                                          return (
                                                                                                              <button 
                                                                                                                  onClick={(e) => { e.stopPropagation(); openMediaPopup(e, patient, 'images', proc.id); }}
                                                                                                                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-600 text-[10px] font-black uppercase tracking-widest border border-blue-100/50 hover:bg-blue-100 transition-colors shadow-sm whitespace-nowrap"
                                                                                                              >
                                                                                                                  <span className="w-1 h-1 rounded-full bg-blue-500"></span>
                                                                                                                  Captured
                                                                                                              </button>
                                                                                                          );
                                                                                                      }

                                                                                                      // Fallback / Bins
                                                                                                      if (proc.deleted) {
                                                                                                          return <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Deleted</span>;
                                                                                                      }

                                                                                                      return (
                                                                                                          <button 
                                                                                                              onClick={(e) => { e.stopPropagation(); onStartProcedure?.(patient, proc.id); }}
                                                                                                              className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors text-left flex items-center gap-1.5 px-1 whitespace-nowrap"
                                                                                                          >
                                                                                                              <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                                                                                              Pending
                                                                                                          </button>
                                                                                                      );
                                                                                                  })()}
                                                                                              </td>
                                                                                             <td className="px-6 py-5">
                                                                                                 <div className="flex items-center gap-4">
                                                                                                     <button onClick={(e) => openMediaPopup(e, patient, 'images', proc.id)} className="flex items-center gap-1.5 text-slate-400 hover:text-blue-500 transition-all group/gicon">
                                                                                                         <ImageIcon size={14} className="text-slate-300 group-hover/gicon:text-blue-500" />
                                                                                                         <span className="text-[12px] font-bold tabular-nums">{proc.mediaStats?.images || 0}</span>
                                                                                                     </button>
                                                                                                     <button onClick={(e) => openMediaPopup(e, patient, 'videos', proc.id)} className="flex items-center gap-1.5 text-slate-400 hover:text-blue-500 transition-all group/gicon">
                                                                                                         <Play size={12} fill="currentColor" strokeWidth={0} className="text-slate-300 group-hover/gicon:text-blue-500" />
                                                                                                         <span className="text-[12px] font-bold tabular-nums">{proc.mediaStats?.videos || 0}</span>
                                                                                                     </button>
                                                                                                 </div>
                                                                                             </td>
                                                                                              <td className="px-6 py-5 text-center">
                                                                                                  {(() => {
                                                                                                      if (expandedTab === 'incomplete') {
                                                                                                          return (
                                                                                                              <button 
                                                                                                                  onClick={(e) => { e.stopPropagation(); onStartAnnotate?.(patient, proc); }}
                                                                                                                  className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto hover:bg-emerald-600 hover:text-white transition-all shadow-sm"
                                                                                                                  title="Start Annotation"
                                                                                                              >
                                                                                                                  <Edit2 size={14} />
                                                                                                              </button>
                                                                                                          );
                                                                                                      }
                                                                                                      
                                                                                                      if (expandedTab === 'pending') {
                                                                                                          const needsReport = !proc.report;
                                                                                                          return (
                                                                                                              <button 
                                                                                                                  onClick={(e) => { 
                                                                                                                      e.stopPropagation(); 
                                                                                                                      needsReport ? onStartAnnotate?.(patient, proc) : onEditReport?.(patient, proc); 
                                                                                                                  }}
                                                                                                                  className={cn(
                                                                                                                      "w-8 h-8 rounded-lg flex items-center justify-center mx-auto transition-all shadow-sm",
                                                                                                                      needsReport ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white" : "bg-blue-50 text-blue-500 hover:bg-blue-600 hover:text-white"
                                                                                                                  )}
                                                                                                                  title={needsReport ? "Annotate & Report" : "Edit Report"}
                                                                                                              >
                                                                                                                  {needsReport ? <Edit2 size={14} /> : <FileText size={14} />}
                                                                                                              </button>
                                                                                                          );
                                                                                                      }

                                                                                                      // Default (Completed)
                                                                                                      return (
                                                                                                          <button 
                                                                                                              onClick={(e) => { e.stopPropagation(); openMediaPopup(e, patient, 'reports', proc.id); }}
                                                                                                              className="w-8 h-8 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center mx-auto hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                                                                                                              title="View Report"
                                                                                                          >
                                                                                                              <FileText size={14} />
                                                                                                          </button>
                                                                                                      );
                                                                                                  })()}
                                                                                              </td>
                                                                                             <td className="px-6 py-5 text-center">
                                                                                                 <div className="flex items-center justify-center gap-2">
                                                                                                     {expandedTab === 'bins' ? (
                                                                                                         <>
                                                                                                             <button 
                                                                                                                 onClick={(e) => handleRestoreProc(e, patient.id, proc.id)}
                                                                                                                 className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all shadow-sm group/restore"
                                                                                                                 title="Restore Procedure"
                                                                                                             >
                                                                                                                 <RotateCcw size={14} className="group-hover/restore:-rotate-45 transition-transform" />
                                                                                                             </button>
                                                                                                             <button 
                                                                                                                 onClick={(e) => handlePermanentDeleteProc(e, patient.id, proc.id)}
                                                                                                                 className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center hover:bg-red-600 hover:text-white transition-all shadow-sm"
                                                                                                                 title="Delete Forever"
                                                                                                             >
                                                                                                                 <Trash2 size={14} />
                                                                                                             </button>
                                                                                                         </>
                                                                                                     ) : (
                                                                                                         <button 
                                                                                                             onClick={(e) => handleDeleteProc(e, patient.id, proc.id)}
                                                                                                             className="w-8 h-8 rounded-lg bg-red-50 text-red-500 flex items-center justify-center mx-auto hover:bg-red-600 hover:text-white transition-all shadow-sm"
                                                                                                             title="Move to Bin"
                                                                                                         >
                                                                                                             <Trash2 size={14} />
                                                                                                         </button>
                                                                                                     )}
                                                                                                 </div>
                                                                                             </td>
                                                                                             <td className="px-6 py-5 text-center">
                                                                                                 <button 
                                                                                                     onClick={async (e) => {
                                                                                                         e.stopPropagation();
                                                                                                         
                                                                                                         // If this item is checked, we determine if it's a bulk download
                                                                                                         const isBulk = selectedProcIds.has(proc.id) && selectedProcIds.size > 1;
                                                                                                         
                                                                                                         // Base case: check if we are already downloading THIS proc or USB not connected
                                                                                                         if (downloadingProcs.has(proc.id) || !usbConnected) return;
                                                                                                         
                                                                                                         try {
                                                                                                             if (exportTarget === 'usb') {
                                                                                                                 // USB Mode
                                                                                                                 setUsbProcExport({ patientId: patient.id, procId: proc.id });
                                                                                                                 setIsFolderPickerOpen(true);
                                                                                                                 return;
                                                                                                             }

                                                                                                             if (isBulk) {
                                                                                                                // Mark all selected as downloading
                                                                                                                setDownloadingProcs(prev => {
                                                                                                                    const next = new Set(prev);
                                                                                                                    selectedProcIds.forEach(id => next.add(id));
                                                                                                                    return next;
                                                                                                                });
                                                                                                                notify.success("Bulk Download Started", `Preparing ${selectedProcIds.size} procedures for ZIP archive...`);

                                                                                                                // Get full procedure objects
                                                                                                                const selectedProcs = patient.procedures?.filter((p: any) => selectedProcIds.has(p.id)) || [];
                                                                                                                await downloadMultipleProceduresZip(patient, selectedProcs, orgData);

                                                                                                                notify.success("Download Complete", "Bulk ZIP archive generated successfully.");
                                                                                                                setSelectedProcIds(new Set());
                                                                                                             } else {
                                                                                                                // Single download
                                                                                                                setDownloadingProcs(prev => {
                                                                                                                    const next = new Set(prev);
                                                                                                                    next.add(proc.id);
                                                                                                                    return next;
                                                                                                                });
                                                                                                                notify.success("Download Started", "Preparing files for ZIP archive...");
                                                                                                                await downloadProcedureZip(patient, proc, orgData);
                                                                                                                notify.success("Download Complete", "ZIP archive generated successfully.");
                                                                                                             }
                                                                                                         } catch (err) {
                                                                                                             console.error("Download failed:", err);
                                                                                                             notify.error("Download Failed", "There was an error generating the ZIP archive.");
                                                                                                         } finally {
                                                                                                             setDownloadingProcs(prev => {
                                                                                                                 const next = new Set(prev);
                                                                                                                 if (isBulk) {
                                                                                                                    selectedProcIds.forEach(id => next.delete(id));
                                                                                                                 } else {
                                                                                                                    next.delete(proc.id);
                                                                                                                 }
                                                                                                                 return next;
                                                                                                             });
                                                                                                         }
                                                                                                     }}
                                                                                                     className={cn(
                                                                                                         "w-8 h-8 rounded-lg flex items-center justify-center mx-auto transition-all shadow-sm",
                                                                                                         downloadingProcs.has(proc.id)
                                                                                                            ? "bg-slate-100 text-slate-400 cursor-wait"
                                                                                                            : !usbConnected
                                                                                                                ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                                                                                                                : "bg-emerald-500 text-white hover:bg-emerald-600 shadow-emerald-200/50"
                                                                                                     )}
                                                                                                     title={!usbConnected ? "Connect USB external storage" : downloadingProcs.has(proc.id) ? "Preparing ZIP..." : "Download Procedure ZIP"}
                                                                                                     disabled={downloadingProcs.has(proc.id) || !usbConnected}
                                                                                                 >
                                                                                                     {downloadingProcs.has(proc.id) ? (
                                                                                                         <Loader2 size={14} className="animate-spin" />
                                                                                                     ) : (
                                                                                                         <Download size={14} />
                                                                                                     )}
                                                                                                 </button>
                                                                                             </td>
                                                                                         </tr>
                                                                                     ));
                                                                                 })()}
                                                                            </tbody>
                                                                        </table>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        </motion.tr>
                                                    )}
                                                </AnimatePresence>
                                            </React.Fragment>
                                        );
                                    })
                                )}
                            </AnimatePresence>
                        </tbody>
                    </table>
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
            <style jsx global>{`
                @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
                
                .patient-queue-root {
                    font-family: 'Plus Jakarta Sans', 'Inter', -apple-system, sans-serif;
                }

                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                    height: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: #ffffff;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #e2e8f0;
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #cbd5e1;
                }

                /* Premium Table Enhancements */
                .premium-row-shadow {
                    box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.5);
                }

                .resume-annotate-glow {
                    animation: status-blue-pulse 2s infinite;
                }
                @keyframes status-blue-pulse {
                    0% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.4); }
                    70% { box-shadow: 0 0 0 6px rgba(37, 99, 235, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0); }
                }
            `}</style>
            {/* Media Popup */}
            <ProcedureMediaPopup 
                isOpen={mediaPopup.isOpen}
                onClose={() => setMediaPopup(prev => ({ ...prev, isOpen: false }))}
                patient={mediaPopup.patient}
                procedures={mediaPopup.patient?.procedures || []}
                initialTab={mediaPopup.initialTab}
                initialProcedureId={mediaPopup.initialProcedureId}
            />
        </div>
        </TooltipProvider>
    );
}
