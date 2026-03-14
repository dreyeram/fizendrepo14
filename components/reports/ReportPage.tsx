//components/reports/ReportPage.tsx
"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { flushSync } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
    ArrowLeft, Check, Wand2, Printer, FileText,
    Loader2, Search, Eye, AlertCircle,
    X, Trash2, Plus, Home, History, ChevronRight, GripVertical, ZoomIn
} from "lucide-react";
import { useSessionStore } from "@/lib/store/session.store";
import { getPatientDetails, updateProcedureType, saveReport } from "@/app/actions/procedure";
import { getEquipment } from "@/app/actions/equipment";
import { getMedicines } from "@/app/actions/inventory";
import { getAllTemplates, resolveTemplate, getNormalValues } from "@/data/reportTemplates";
import { resolveImageUrl } from "@/lib/utils/image";

import InlineDropdown, { BilateralDropdown } from "./InlineDropdown";

// ─────────────────────────────────────────────────────────────────────────────
// LETTERHEAD
// Changes:
//   • Zone C now shows the report-name pill (dynamic, not hardcoded) + date below
//   • Consultant name / role removed from header
//   • Row 2 patient info is full-width (no pill in row 2)
//   • Name truncated to 25 chars
//   • Ref falls back to "Self" instead of "N/A"
// ─────────────────────────────────────────────────────────────────────────────
const Letterhead = ({ doctor, patient, hospital, reportName }: any) => {
    const orgName = hospital?.name || 'PREDISCAN HOSPITAL';
    const orgAddress = hospital?.address || 'IITM Research Park, Chennai';
    const orgEmail = hospital?.contactEmail || hospital?.email || 'prediscan@gmail.com';
    const orgPhone = hospital?.mobile || '+91 7339286710';
    const rawLogo = hospital?.logoPath || '';
    const orgLogo = useMemo(() => resolveImageUrl(rawLogo), [rawLogo]);

    const [logoError, setLogoError] = React.useState(false);

    const contactStr = [orgAddress, orgPhone, orgEmail].filter(Boolean).join('  |  ');
    const dateStr =
        new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).toUpperCase()
        + '  '
        + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    // Truncate patient name to 25 chars
    const patientName = (patient?.fullName || patient?.name || 'N/A').toUpperCase();
    const truncatedName = patientName.length > 25 ? patientName.slice(0, 25) : patientName;

    return (
        <div className="flex flex-col mb-4 select-none bg-white w-full">

            {/* ══ ROW 1: Logo | Name+Contact | Report Title Pill + Date ══ */}
            <div className="flex items-center gap-4" style={{ minHeight: '64px' }}>

                {/* Zone A — Logo */}
                <div className="shrink-0 flex items-center justify-center" style={{ width: '120px', height: '56px' }}>
                    {orgLogo && !logoError ? (
                        <img
                            src={orgLogo}
                            alt={orgName}
                            style={{ maxHeight: '56px', maxWidth: '120px', width: 'auto', height: 'auto', objectFit: 'contain' }}
                            onError={() => setLogoError(true)}
                        />
                    ) : (
                        <div className="h-[56px] w-[56px] bg-blue-900 rounded-full flex items-center justify-center text-white font-serif font-black text-2xl shrink-0">
                            {orgName.charAt(0)}
                        </div>
                    )}
                </div>

                {/* Zone B — Hospital name + contact */}
                <div className="flex-1 flex flex-col gap-[4px] min-w-0">
                    <h1 className="text-[22px] font-bold text-blue-900 uppercase tracking-wide leading-tight">{orgName}</h1>
                    {contactStr && <p className="text-[12px] text-zinc-500 leading-tight">{contactStr}</p>}
                </div>

                {/* Zone C — Report Title Pill + Date (replaces consultant name/role) */}
                <div className="shrink-0 flex flex-col items-end justify-center gap-[6px]" style={{ minWidth: '240px' }}>
                    {/* Report name pill */}
                    <div className="px-4 py-[7px] rounded-xl w-full flex items-center justify-center" style={{ backgroundColor: '#1c41a5' }}>
                        <h2 className="text-[12px] font-bold text-white uppercase tracking-tight text-center leading-tight">
                            {reportName || 'DIAGNOSTIC NASAL ENDOSCOPY REPORT'}
                        </h2>
                    </div>
                    {/* Date below pill */}
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] text-zinc-400 font-medium">Report Date :</span>
                        <span className="text-[12px] font-bold text-zinc-900">{dateStr}</span>
                    </div>
                </div>
            </div>

            {/* ══ Navy Divider ══ */}
            <div className="w-full my-2" style={{ height: '1.5px', backgroundColor: '#122266' }} />

            {/* ══ ROW 2: Patient info — full width, 4 columns, proper spacing ══ */}
            <div className="grid grid-cols-4 gap-x-6">
                {[
                    { label: 'MRN No', value: patient?.mrn || 'N/A' },
                    { label: 'Name', value: truncatedName },
                    { label: 'Age/Sex', value: `${patient?.age || '--'} Yrs / ${patient?.gender || '--'}` },
                    { label: 'Ref', value: (patient?.referringDoctor || 'Self').toUpperCase() },
                ].map((col) => (
                    <div key={col.label} className="flex flex-col gap-[2px] min-w-0">
                        <span className="text-[11px] text-zinc-400 font-medium leading-none">{col.label}</span>
                        <span className="text-[13px] font-bold text-zinc-900 truncate leading-tight">{col.value}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

const Footer = ({ doctor }: any) => null;

// ─────────────────────────────────────────────────────────────────────────────
// VISUAL SELECTOR
// ─────────────────────────────────────────────────────────────────────────────
const VisualSelectorA4 = ({ segments, activeTabId, onSelect }: any) => (
    <div className="space-y-6 py-8 flex-1 flex flex-col items-center justify-center">
        <div className="text-center space-y-2">
            <h3 className="text-lg font-serif text-zinc-900 italic">Select Procedure Template</h3>
            <p className="text-[9px] text-zinc-400 uppercase tracking-widest font-bold">Segment P{segments.find((s: any) => s.id === activeTabId)?.index}</p>
        </div>
        <div className="grid grid-cols-3 gap-3 w-full max-w-md">
            {getAllTemplates().map((t: any) => (
                <button key={t.id} onClick={() => onSelect(t.id)}
                    className="group p-3 bg-white border border-zinc-200 rounded-lg hover:border-blue-500 hover:shadow-md transition-all flex flex-col items-center gap-2 text-center">
                    <div className="w-8 h-8 rounded-md bg-zinc-50 flex items-center justify-center text-zinc-400 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                        <FileText size={16} />
                    </div>
                    <div>
                        <h4 className="text-[12px] font-bold text-zinc-800 leading-tight">{t.name}</h4>
                        <p className="text-[10px] text-zinc-400">{t.shortName}</p>
                    </div>
                </button>
            ))}
        </div>
    </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// RENDER FIELD
// ─────────────────────────────────────────────────────────────────────────────
function RenderField({ field, value, onChange, colSpan = 1 }: any) {
    const isFullWidth = field.type === 'textarea' || field.type === 'bilateral' || colSpan === 2;
    const label = (
        <div className="w-[160px] shrink-0">
            <span className="text-[11px] uppercase tracking-wider font-bold text-zinc-400 select-none whitespace-nowrap overflow-hidden text-ellipsis block">{field.label}</span>
        </div>
    );
    if (field.type === 'textarea') {
        return (
            <div className="group mt-4 mb-6">
                <div className="flex items-center mb-2">
                    {field.label && <span className="text-[12px] uppercase tracking-wider font-extrabold text-blue-900/60 mr-3">{field.label}</span>}
                    <div className="h-px flex-1 bg-zinc-100" />
                </div>
                <textarea value={value || ''} onChange={(e) => onChange(e.target.value)}
                    className="w-full min-h-[60px] p-4 text-[12px] font-serif text-zinc-900 bg-white border border-zinc-200 rounded-lg focus:ring-1 focus:ring-blue-100 focus:border-blue-300 transition-all placeholder:text-zinc-200 resize-none leading-relaxed shadow-sm"
                    placeholder="Enter details..." rows={field.rows || 3} />
            </div>
        );
    }
    return (
        <div className={`grid grid-cols-[160px_1fr] items-center gap-3 group min-h-[28px] border-b border-zinc-50 hover:border-zinc-100 transition-all pb-1 ${isFullWidth ? 'max-w-3xl' : ''}`}>
            {label}
            <div className="flex-1 min-w-0">
                {field.type === 'bilateral' ? (
                    <BilateralDropdown label={field.label} leftValue={value?.left || ''} rightValue={value?.right || ''} options={field.options || []}
                        onLeftChange={(v: any) => onChange({ ...value, left: v })} onRightChange={(v: any) => onChange({ ...value, right: v })} />
                ) : field.type === 'select' || field.type === 'multiselect' || field.type === 'radio' ? (
                    <InlineDropdown value={value} options={field.options || []} onChange={onChange} placeholder="Select..." multiple={field.type === 'multiselect'} />
                ) : (
                    <input type="text" value={value || ''} onChange={(e) => onChange(e.target.value)}
                        className="w-full bg-transparent border-none text-[11px] font-medium text-zinc-900 p-0 focus:ring-0 placeholder:text-zinc-200 h-[22px]" placeholder="..." />
                )}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// PRESCRIPTION SECTION
// ─────────────────────────────────────────────────────────────────────────────
const PrescriptionSection = ({ prescriptions = [], availableMedicines = [], onChange }: any) => {
    const [searchTerm, setSearchTerm] = useState("");
    const [isAdding, setIsAdding] = useState(false);
    const filteredMeds = (availableMedicines || []).filter((m: any) =>
        m.name.toLowerCase().includes(searchTerm.toLowerCase()) || m.genericName?.toLowerCase().includes(searchTerm.toLowerCase())
    ).slice(0, 5);
    const addMed = (med: any) => {
        onChange([...prescriptions, { id: med.id, name: med.name, generic: med.genericName, dosage: "", frequency: "1-0-1", duration: "5 Days", instruction: "After Food" }]);
        setIsAdding(false); setSearchTerm("");
    };
    const removeMed = (index: number) => onChange(prescriptions.filter((_: any, i: number) => i !== index));
    const updateMed = (index: number, key: string, val: string) => {
        const next = [...prescriptions]; next[index] = { ...next[index], [key]: val }; onChange(next);
    };
    return (
        <div className="mt-8 border-t-[1.5px] border-zinc-900 pt-4 select-none">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="w-1.5 h-4 bg-blue-900 rounded-full" />
                    <h2 className="text-[13px] font-black text-blue-900 uppercase tracking-[0.1em]">Prescription / Rx</h2>
                </div>
                {!isAdding && (
                    <button onClick={() => setIsAdding(true)} className="text-[11px] font-bold text-blue-700 hover:text-blue-900 uppercase tracking-wider flex items-center gap-1.5 bg-blue-50 px-3 py-1 rounded-full transition-colors border border-blue-100 shadow-sm">
                        <Plus size={10} /> Add Rx
                    </button>
                )}
            </div>
            {isAdding && (
                <div className="mb-4 p-3 bg-white rounded-xl border border-blue-100 shadow-xl relative z-[60]">
                    <div className="flex items-center gap-3 mb-3 pb-2 border-b border-zinc-50">
                        <Search size={12} className="text-zinc-400" />
                        <input autoFocus type="text" placeholder="Find medicine by name or generic..."
                            className="flex-1 bg-transparent border-none text-[11px] focus:ring-0 p-0 text-zinc-900"
                            value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                        <button onClick={() => setIsAdding(false)} className="text-zinc-300 hover:text-zinc-500"><X size={14} /></button>
                    </div>
                    <div className="space-y-1">
                        {filteredMeds.map((m: any) => (
                            <button key={m.id} onClick={() => addMed(m)} className="w-full text-left p-2 hover:bg-zinc-50 rounded-lg text-xs flex items-center justify-between group transition-colors">
                                <div className="flex flex-col">
                                    <span className="font-bold text-zinc-800">{m.name}</span>
                                    <span className="text-[11px] text-zinc-400 font-serif italic">{m.genericName}</span>
                                </div>
                                <Plus size={12} className="text-zinc-200 group-hover:text-blue-600" />
                            </button>
                        ))}
                        {searchTerm && filteredMeds.length === 0 && <div className="text-center py-4 text-[10px] text-zinc-400 italic">No medicines found</div>}
                    </div>
                </div>
            )}
            <div className="space-y-2">
                {prescriptions.map((p: any, i: number) => (
                    <div key={i} className="flex items-center gap-4 text-xs group bg-zinc-50/50 p-2.5 rounded-lg border border-transparent hover:border-zinc-200 hover:bg-white transition-all">
                        <div className="flex-1 flex flex-col min-w-0">
                            <span className="font-bold text-zinc-900 truncate uppercase">{p.name}</span>
                            <span className="text-[11px] text-zinc-400 font-serif italic truncate">{p.generic}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <input className="w-16 bg-transparent border-none text-[12px] text-zinc-600 p-0 focus:ring-0 placeholder:text-zinc-200" placeholder="Dosage" value={p.dosage} onChange={(e) => updateMed(i, "dosage", e.target.value)} />
                            <div className="h-3 w-px bg-zinc-100" />
                            <input className="w-12 bg-transparent border-none text-[12px] text-zinc-600 p-0 focus:ring-0 text-center" value={p.frequency} onChange={(e) => updateMed(i, "frequency", e.target.value)} />
                            <div className="h-3 w-px bg-zinc-100" />
                            <input className="w-12 bg-transparent border-none text-[12px] text-zinc-600 p-0 focus:ring-0 text-center" value={p.duration} onChange={(e) => updateMed(i, "duration", e.target.value)} />
                            <button onClick={() => removeMed(i)} className="opacity-0 group-hover:opacity-100 text-zinc-300 hover:text-red-500 transition-all"><Trash2 size={10} /></button>
                        </div>
                    </div>
                ))}
                {prescriptions.length === 0 && !isAdding && <div className="text-[9px] text-zinc-300 italic py-2">No medications prescribed.</div>}
            </div>
        </div>
    );
};

// ─── Shape helper ───────────────────────────────────────────────────────────
const shapeStyle = (scopeShape?: string | null): React.CSSProperties => {
    const base: React.CSSProperties = { overflow: 'hidden', border: 'none', boxShadow: 'none', outline: 'none' };
    switch (scopeShape) {
        case 'circle':
            return { ...base, borderRadius: '50%', aspectRatio: '1 / 1' };
        case 'square':
            return { ...base, borderRadius: '12px', aspectRatio: '1 / 1' };
        case 'rectangle':
            return { ...base, borderRadius: '8px', aspectRatio: '16 / 9' };
        default:
            return { ...base, borderRadius: '8px', aspectRatio: '16 / 9' };
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// DRAGGABLE IMAGE GALLERY
// ─────────────────────────────────────────────────────────────────────────────
const DraggableImageGallery = ({ imageIds, mediaCache, captionsMap, onReorder, onCaptionChange }: any) => {
    const [dragging, setDragging] = useState<number | null>(null);
    const [dragOver, setDragOver] = useState<number | null>(null);
    const [lightbox, setLightbox] = useState<string | null>(null);
    const [replacingIndex, setReplacingIndex] = useState<number | null>(null);

    const uniqueIds: string[] = useMemo(
        () => Array.from(new Set(imageIds || [])).slice(0, 6) as string[],
        [imageIds]
    );

    const allMedia: any[] = useMemo(
        () => (mediaCache || []).filter((m: any) => m.url || m.base64),
        [mediaCache]
    );

    const handleDragStart = (e: React.DragEvent, index: number) => {
        setDragging(index); e.dataTransfer.effectAllowed = 'move';
    };
    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(index);
    };
    const handleDrop = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        if (dragging === null || dragging === index) { setDragging(null); setDragOver(null); return; }
        const next = [...uniqueIds];
        const [moved] = next.splice(dragging, 1);
        next.splice(index, 0, moved);
        onReorder(next);
        setDragging(null); setDragOver(null);
    };
    const handleDragEnd = () => { setDragging(null); setDragOver(null); };

    const handleReplace = (newId: string) => {
        if (replacingIndex === null) return;
        if (uniqueIds.includes(newId) && uniqueIds[replacingIndex] !== newId) {
            setReplacingIndex(null);
            return;
        }
        const next = [...uniqueIds];
        next[replacingIndex] = newId;
        onReorder(next);
        setReplacingIndex(null);
    };

    return (
        <>
            {/* ── Lightbox ── */}
            <AnimatePresence>
                {lightbox && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[310] bg-black/90 flex items-center justify-center p-8"
                        onClick={() => setLightbox(null)}>
                        <motion.img initial={{ scale: 0.85 }} animate={{ scale: 1 }} exit={{ scale: 0.85 }}
                            src={lightbox} alt="Preview"
                            className="max-h-full max-w-full rounded-2xl shadow-2xl object-contain"
                            onClick={(e) => e.stopPropagation()} />
                        <button onClick={() => setLightbox(null)} className="absolute top-6 right-6 text-white/60 hover:text-white">
                            <X size={28} />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Replace Gallery Picker Popup ── */}
            <AnimatePresence>
                {replacingIndex !== null && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[305] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
                        onClick={() => setReplacingIndex(null)}>
                        <motion.div
                            initial={{ opacity: 0, y: 20, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 20, scale: 0.96 }}
                            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col"
                            style={{ maxHeight: '80vh' }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 shrink-0">
                                <div>
                                    <h3 className="text-[13px] font-black text-zinc-900 tracking-tight">
                                        Replace Fig {replacingIndex + 1}
                                    </h3>
                                    <p className="text-[10px] text-zinc-400 mt-0.5">
                                        Select an image to swap into this slot. Already-used images are marked.
                                    </p>
                                </div>
                                <button onClick={() => setReplacingIndex(null)}
                                    className="p-1.5 text-zinc-400 hover:text-zinc-700 transition-all">
                                    <X size={18} />
                                </button>
                            </div>

                            <div className="overflow-y-auto p-4">
                                {allMedia.length === 0 ? (
                                    <p className="text-center py-10 text-[11px] text-zinc-400 italic">No images available in this procedure.</p>
                                ) : (
                                    <div className="grid grid-cols-3 gap-3">
                                        {allMedia.map((m: any) => {
                                            const isCurrentSlot = uniqueIds[replacingIndex] === m.id;
                                            const isUsedElsewhere = uniqueIds.includes(m.id) && !isCurrentSlot;
                                            const imgSrc = m.url || m.base64 || '';
                                            const pickerShape = shapeStyle(m.scopeShape);

                                            return (
                                                <button
                                                    key={m.id}
                                                    onClick={() => !isUsedElsewhere && handleReplace(m.id)}
                                                    disabled={isUsedElsewhere}
                                                    title={isUsedElsewhere ? 'Already used in another slot' : isCurrentSlot ? 'Currently in this slot' : 'Click to replace'}
                                                    className={`relative overflow-hidden border-2 transition-all group bg-zinc-100
                                                        ${isCurrentSlot ? 'border-blue-500 shadow-md shadow-blue-100' : ''}
                                                        ${isUsedElsewhere ? 'border-zinc-200 opacity-50 cursor-not-allowed' : ''}
                                                        ${!isCurrentSlot && !isUsedElsewhere ? 'border-zinc-200 hover:border-blue-400 hover:shadow-md cursor-pointer' : ''}
                                                    `}
                                                    style={pickerShape}
                                                >
                                                    <img src={imgSrc} alt="" className="w-full h-full object-cover" />

                                                    {isCurrentSlot && (
                                                        <div className="absolute top-1.5 left-1.5 bg-blue-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                                                            Current
                                                        </div>
                                                    )}

                                                    {isUsedElsewhere && (
                                                        <div className="absolute top-1.5 left-1.5 bg-zinc-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wide flex items-center gap-0.5">
                                                            <Check size={7} /> Used
                                                        </div>
                                                    )}

                                                    {!isCurrentSlot && !isUsedElsewhere && (
                                                        <div className="absolute inset-0 bg-blue-600/0 group-hover:bg-blue-600/15 transition-all flex items-end justify-center pb-2 opacity-0 group-hover:opacity-100">
                                                            <span className="text-[10px] font-black text-blue-700 bg-white/90 px-2 py-0.5 rounded-full uppercase tracking-wide shadow">
                                                                Select
                                                            </span>
                                                        </div>
                                                    )}

                                                    {m.timestamp && (
                                                        <div className="absolute bottom-1 right-1 text-[9px] text-white/80 bg-black/40 px-1 rounded font-medium">
                                                            {m.timestamp}
                                                        </div>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Hint row ── */}
            {uniqueIds.length > 1 && (
                <div className="flex items-center gap-1 mb-3">
                    <GripVertical size={10} className="text-zinc-300" />
                    <span className="text-[10px] text-zinc-300 uppercase tracking-wider font-bold">Drag to reorder</span>
                </div>
            )}

            {/* ── Image list ── */}
            <div className="grid grid-cols-1 gap-3">
                {uniqueIds.map((id: string, i: number) => {
                    const m = (mediaCache || []).find((x: any) => x.id === id);
                    if (!m) return null;
                    const isDraggingThis = dragging === i;
                    const isDragTarget = dragOver === i && dragging !== i;
                    const imgShapeStyle = shapeStyle(m.scopeShape);

                    return (
                        <div
                            key={`${id}-${i}`}
                            draggable
                            onDragStart={(e) => handleDragStart(e, i)}
                            onDragOver={(e) => handleDragOver(e, i)}
                            onDrop={(e) => handleDrop(e, i)}
                            onDragEnd={handleDragEnd}
                            className={`space-y-1 transition-all duration-150 cursor-grab active:cursor-grabbing
                                ${isDraggingThis ? 'opacity-40 scale-95' : 'opacity-100 scale-100'}
                            `}
                        >
                            <div
                                className={`relative group ${isDragTarget ? 'ring-2 ring-blue-400 ring-offset-2' : ''}`}
                                style={imgShapeStyle}
                            >
                                <img src={m.url || m.base64} className="w-full h-full object-cover" alt={`Fig ${i + 1}`} />

                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setLightbox(m.url || m.base64); }}
                                        className="w-7 h-7 bg-white/90 rounded-full flex items-center justify-center shadow-md hover:bg-white transition-all"
                                        title="Zoom"
                                    >
                                        <ZoomIn size={12} className="text-zinc-700" />
                                    </button>

                                    <button
                                        onClick={(e) => { e.stopPropagation(); setReplacingIndex(i); }}
                                        className="w-7 h-7 bg-white/90 rounded-full flex items-center justify-center shadow-md hover:bg-blue-600 hover:text-white transition-all group/rep"
                                        title="Replace image"
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-700 group-hover/rep:text-white transition-colors">
                                            <path d="M7 16V4m0 0L3 8m4-4l4 4" /><path d="M17 8v12m0 0l4-4m-4 4l-4-4" />
                                        </svg>
                                    </button>
                                </div>

                                <div className="absolute top-2 left-2 w-6 h-6 bg-blue-900/80 backdrop-blur text-white text-[11px] flex items-center justify-center rounded-full font-bold pointer-events-none">
                                    {i + 1}
                                </div>

                                <div className="absolute top-2 right-2 w-5 h-5 bg-black/40 backdrop-blur text-white flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-all pointer-events-none">
                                    <GripVertical size={10} />
                                </div>
                            </div>

                            <div className="flex items-center gap-1 px-1">
                                <span className="text-[11px] text-zinc-400 italic font-bold whitespace-nowrap">Fig {i + 1}</span>
                                <input
                                    className="flex-1 min-w-0 text-[11px] bg-transparent border-none focus:ring-0 italic text-zinc-500 placeholder:text-zinc-300 p-0 h-4"
                                    placeholder="Add caption..."
                                    value={captionsMap?.[id] || ''}
                                    onChange={(e) => onCaptionChange(id, e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// HISTORY REPORTS PANEL
// ─────────────────────────────────────────────────────────────────────────────
const HistoryReportsPanel = ({ procedures }: { procedures: any[] }) => {
    const [expanded, setExpanded] = useState(false);
    const [pdfModal, setPdfModal] = useState<{ url: string; title: string } | null>(null);
    const [fallbackReport, setFallbackReport] = useState<any>(null);
    const [loadingId, setLoadingId] = useState<string | null>(null);
    const [errorId, setErrorId] = useState<string | null>(null);

    const historyReports = useMemo(() => {
        if (!procedures?.length) return [];
        return procedures
            .filter((p: any) => {
                if (!p.report?.content) return false;
                let parsed: any = {};
                try { parsed = typeof p.report.content === 'string' ? JSON.parse(p.report.content) : p.report.content; } catch (_) { return false; }
                const hasSectionData = (parsed.formData?.printableSections || []).some((sec: any) =>
                    sec.items?.some((it: any) => {
                        const v = String(it.value || '').trim();
                        return v && v !== 'undefined' && v !== 'null';
                    })
                );
                const hasPrescriptions = (parsed.prescriptions || []).length > 0;
                return hasSectionData || hasPrescriptions;
            })
            .map((p: any) => {
                let parsed: any = {};
                try { parsed = typeof p.report.content === 'string' ? JSON.parse(p.report.content) : p.report.content; } catch (_) { }
                const rawType = p.type || parsed.procedureType || '';
                return {
                    id: p.id,
                    type: rawType,
                    date: p.report?.updatedAt || p.updatedAt || p.createdAt || null,
                    finalized: p.report?.finalized || false,
                    content: parsed,
                };
            })
            .sort((a: any, b: any) => {
                if (!a.date) return 1;
                if (!b.date) return -1;
                return new Date(b.date).getTime() - new Date(a.date).getTime();
            });
    }, [procedures]);

    const formatDate = (d: string | null) => {
        if (!d) return null;
        const dt = new Date(d);
        if (isNaN(dt.getTime())) return null;
        return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
    };

    const handleReportClick = async (r: any) => {
        setLoadingId(r.id);
        setErrorId(null);
        try {
            const res = await fetch(`/api/report-serve?id=${encodeURIComponent(r.id)}`);
            if (res.ok && res.headers.get('content-type')?.includes('pdf')) {
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const title = [
                    (r.type || 'Report').toUpperCase(),
                    formatDate(r.date)
                ].filter(Boolean).join(' — ');
                setPdfModal({ url, title });
            } else {
                setFallbackReport(r);
            }
        } catch (_) {
            setFallbackReport(r);
        } finally {
            setLoadingId(null);
        }
    };

    const closePdf = () => {
        if (pdfModal?.url) URL.revokeObjectURL(pdfModal.url);
        setPdfModal(null);
    };

    return (
        <>
            {/* ── Full-screen PDF viewer modal ── */}
            <AnimatePresence>
                {pdfModal && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-6"
                    >
                        <motion.div
                            initial={{ opacity: 0, y: 20, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.97 }}
                            className="bg-white w-full h-full max-w-5xl rounded-2xl overflow-hidden flex flex-col shadow-2xl"
                        >
                            <div className="h-14 border-b border-zinc-100 flex items-center justify-between px-6 shrink-0">
                                <div className="flex items-center gap-3">
                                    <FileText className="text-blue-600" size={18} />
                                    <span className="text-[13px] font-black text-zinc-800 uppercase tracking-tight truncate max-w-[400px]">
                                        {pdfModal.title}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <a
                                        href={pdfModal.url}
                                        download="report.pdf"
                                        className="px-3 py-1.5 bg-zinc-100 text-zinc-700 rounded-lg text-[11px] font-bold hover:bg-zinc-200 transition-all flex items-center gap-1.5"
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                                        Download
                                    </a>
                                    <button onClick={closePdf} className="p-1.5 text-zinc-400 hover:text-zinc-700 transition-all">
                                        <X size={20} />
                                    </button>
                                </div>
                            </div>
                            <iframe
                                src={`${pdfModal.url}#toolbar=0&navpanes=0`}
                                className="flex-1 w-full border-none"
                                title="Report PDF"
                            />
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Fallback: form-data summary popup ── */}
            <AnimatePresence>
                {fallbackReport && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
                        onClick={() => setFallbackReport(null)}>
                        <motion.div initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 24, scale: 0.96 }}
                            className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[80vh] flex flex-col overflow-hidden"
                            onClick={(e) => e.stopPropagation()}>

                            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 shrink-0">
                                <div>
                                    <h3 className="text-[13px] font-black text-zinc-900 uppercase tracking-tight">
                                        {fallbackReport.type?.toUpperCase()} Report
                                    </h3>
                                    <p className="text-[10px] text-zinc-400 font-medium mt-0.5 flex items-center gap-1">
                                        {formatDate(fallbackReport.date) && (
                                            <span>{formatDate(fallbackReport.date)}</span>
                                        )}
                                        {fallbackReport.finalized
                                            ? <span className="text-emerald-600 font-bold">● Finalized</span>
                                            : <span className="text-amber-500 font-bold">● PDF not yet generated</span>
                                        }
                                    </p>
                                </div>
                                <button onClick={() => setFallbackReport(null)} className="p-1.5 text-zinc-400 hover:text-zinc-700"><X size={18} /></button>
                            </div>

                            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                                {(fallbackReport.content?.formData?.printableSections || []).map((sec: any, si: number) => {
                                    const hasData = sec.items?.some((it: any) => it.value && String(it.value).trim() && it.value !== 'undefined');
                                    if (!hasData) return null;
                                    return (
                                        <div key={si}>
                                            <h4 className="text-[11px] font-black text-blue-900 uppercase tracking-wider mb-2 pb-1 border-b border-zinc-100">{sec.title}</h4>
                                            <div className="space-y-1.5">
                                                {sec.items.map((item: any, ii: number) => {
                                                    const val = String(item.value || '').trim();
                                                    if (!val || val === 'undefined') return null;
                                                    return (
                                                        <div key={ii} className="grid grid-cols-[140px_1fr] gap-2 text-xs">
                                                            <span className="text-zinc-400 font-medium">{item.label}</span>
                                                            <span className="text-zinc-900 font-semibold">{val}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                                {(fallbackReport.content?.prescriptions || []).length > 0 && (
                                    <div>
                                        <h4 className="text-[9px] font-black text-blue-900 uppercase tracking-widest mb-2 pb-1 border-b border-zinc-100">Prescription / Rx</h4>
                                        {fallbackReport.content.prescriptions.map((rx: any, ri: number) => (
                                            <div key={ri} className="flex items-center gap-3 text-[11px] py-1.5 border-b border-zinc-50">
                                                <span className="font-bold text-zinc-900 flex-1">{rx.name}</span>
                                                <span className="text-zinc-400 italic text-[10px]">{rx.dosage}</span>
                                                <span className="text-zinc-500">{rx.frequency}</span>
                                                <span className="text-zinc-400">{rx.duration}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {!(fallbackReport.content?.formData?.printableSections?.some((s: any) =>
                                    s.items?.some((it: any) => it.value && String(it.value).trim() && it.value !== 'undefined')
                                )) && !(fallbackReport.content?.prescriptions?.length) && (
                                        <div className="text-center py-8 text-[11px] text-zinc-400 italic">No report content available.</div>
                                    )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Sidebar collapsible section ── */}
            <div className="pt-2">
                <button onClick={() => setExpanded(e => !e)} className="w-full flex items-center justify-between group p-2 rounded-xl hover:bg-zinc-50 transition-colors">
                    <div className="flex items-center gap-2">
                        <History size={14} className="text-zinc-400 group-hover:text-blue-500 transition-colors" />
                        <span className="text-[10px] font-black text-zinc-400 group-hover:text-zinc-600 uppercase tracking-[0.2em] transition-colors">
                            Previous Reports
                        </span>
                        {historyReports.length > 0 && (
                            <span className="text-[9px] font-black text-blue-500 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full">
                                {historyReports.length}
                            </span>
                        )}
                    </div>
                    <ChevronRight size={14} className={`text-zinc-300 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`} />
                </button>

                <AnimatePresence>
                    {expanded && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                        >
                            <div className="mt-3 space-y-2">
                                {historyReports.length === 0 ? (
                                    <p className="text-[11px] text-zinc-400 italic px-2">No previous reports found.</p>
                                ) : historyReports.map((r: any) => {
                                    const isLoading = loadingId === r.id;
                                    return (
                                        <button
                                            key={r.id}
                                            onClick={() => handleReportClick(r)}
                                            disabled={isLoading}
                                            className="w-full text-left p-3.5 rounded-xl border border-zinc-100 hover:border-blue-200 hover:bg-blue-50/50 hover:shadow-[0_2px_10px_rgba(59,130,246,0.1)] transition-all group flex items-center justify-between disabled:opacity-60 bg-white"
                                        >
                                            <div className="flex flex-col gap-1 min-w-0">
                                                <span className="text-[11px] font-bold text-zinc-700 group-hover:text-blue-700 truncate uppercase tracking-wide transition-colors">
                                                    {r.type || 'Report'}
                                                </span>
                                                {formatDate(r.date) && (
                                                    <span className="text-[10px] text-zinc-400 font-medium">
                                                        {formatDate(r.date)}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0 ml-2">
                                                {r.finalized && (
                                                    <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)] shrink-0" title="Finalized" />
                                                )}
                                                {isLoading ? (
                                                    <Loader2 size={12} className="animate-spin text-blue-500" />
                                                ) : (
                                                    <ChevronRight size={12} className="text-zinc-300 group-hover:text-blue-500 transition-colors" />
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// PROPS
// ─────────────────────────────────────────────────────────────────────────────
interface ReportPageProps {
    patient: any;
    doctor: any;
    hospital: any;
    captures?: any[];
    onBack: () => void;
    onBackToAnnotate?: (ids?: string[]) => void;
    onComplete: () => void;
    onSave: (data: any, action?: string) => Promise<Blob | void | undefined>;
    onGeneratePDF: (data: any, action?: string) => Promise<Blob | undefined>;
    onSaveSuccess?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function ReportPage({
    patient, doctor, hospital, captures = [],
    onBack, onBackToAnnotate, onComplete, onSave, onGeneratePDF, onSaveSuccess
}: ReportPageProps) {
    const { segments, setActiveSegment } = useSessionStore();

    const rawDoctorName = doctor?.fullName || doctor?.name || 'Shara';
    const doctorDegree = doctor?.degree ? `, ${doctor.degree}` : '';
    const doctorRole = doctor?.role || 'Consultant Specialist';
    const hasDrPrefix = rawDoctorName.toLowerCase().startsWith('dr');
    const formattedDrName = hasDrPrefix ? rawDoctorName : `Dr. ${rawDoctorName}`;

    const [isLoading, setIsLoading] = useState(true);
    const [activeTabId, setActiveTabId] = useState<string | null>(null);
    const [proceduresData, setProceduresData] = useState<Record<string, any>>({});
    const [mediaCache, setMediaCache] = useState<Record<string, any[]>>({});
    const [formState, setFormState] = useState<Record<string, any>>({});
    const [selectedImagesMap, setSelectedImagesMap] = useState<Record<string, string[]>>({});
    const [captionsMap, setCaptionsMap] = useState<Record<string, Record<string, string>>>({});
    const [availableEquipment, setAvailableEquipment] = useState<any[]>([]);
    const [availableMedicines, setAvailableMedicines] = useState<any[]>([]);
    const [selectedEquipment, setSelectedEquipment] = useState<Record<string, string[]>>({});
    const [prescriptions, setPrescriptions] = useState<Record<string, any[]>>({});
    const [isDirty, setIsDirty] = useState(false);
    const [showUnsavedModal, setShowUnsavedModal] = useState(false);
    const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
    const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
    const [hasPreviewed, setHasPreviewed] = useState(false);
    const [allProcedures, setAllProcedures] = useState<any[]>([]);
    const [showAutoFillPopup, setShowAutoFillPopup] = useState(false);
    const autoFillActionRef = useRef<'preview' | 'finalize'>('finalize');

    const [footerText, setFooterText] = useState("");
    const [footerOptions, setFooterOptions] = useState<string[]>([]);

    useEffect(() => {
        try {
            const savedOptions: string[] = JSON.parse(localStorage.getItem('report_footer_options') || '[]');
            const savedDefaultStr = localStorage.getItem('report_footer_default');
            if (Array.isArray(savedOptions)) {
                setFooterOptions(savedOptions);
                if (savedDefaultStr !== null) {
                    const savedDefault = parseInt(savedDefaultStr, 10);
                    if (!isNaN(savedDefault) && savedOptions[savedDefault]) {
                        setFooterText(savedOptions[savedDefault]);
                    }
                }
            }
        } catch (_) {}
    }, []);

    const saveFooterOption = (val: string) => {
        if (!val.trim()) return;
        if (!footerOptions.includes(val)) {
            const newOpts = [...footerOptions, val];
            setFooterOptions(newOpts);
            localStorage.setItem('report_footer_options', JSON.stringify(newOpts));
        }
    };

    const setDefaultFooter = (val: string) => {
        const idx = footerOptions.indexOf(val);
        if (idx !== -1) {
            localStorage.setItem('report_footer_default', String(idx));
        }
    };

    const removeFooterOption = (val: string) => {
        const newOpts = footerOptions.filter((o) => o !== val);
        setFooterOptions(newOpts);
        localStorage.setItem('report_footer_options', JSON.stringify(newOpts));
        const savedDefault = localStorage.getItem('report_footer_default');
        if (savedDefault !== null && Number(savedDefault) >= newOpts.length) {
            localStorage.removeItem('report_footer_default');
        }
    };

    const capturesRef = useRef(captures);
    capturesRef.current = captures;
    const segmentIdsKey = useMemo(() => segments.map((s: any) => s.id).sort().join(','), [segments]);

    // ── Load ──
    useEffect(() => {
        const load = async () => {
            setIsLoading(true);
            const res = await getPatientDetails(patient.id);
            if (res.success && res.procedures) {
                setAllProcedures(res.procedures);
                const pData: any = {}, mCache: any = {}, fState: any = {}, sImages: any = {}, cMap: any = {};

                segments.forEach((s: any) => {
                    pData[s.id] = { id: s.id, type: s.type || 'generic', status: s.status || 'draft', finalized: false };
                    mCache[s.id] = [];
                });

                res.procedures.forEach((proc: any) => {
                    pData[proc.id] = {
                        id: proc.id,
                        type: (proc.type && proc.type !== 'generic') ? proc.type : (pData[proc.id]?.type || 'generic'),
                        status: proc.status, finalized: proc.report?.finalized
                    };
                    mCache[proc.id] = (proc.media || []).map((m: any) => ({
                        id: m.id, url: m.url || (m.filePath ? resolveImageUrl(m.filePath) : ''),
                        type: m.type === 'VIDEO' ? 'video' : 'image',
                        timestamp: new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        category: m.type === 'ANNOTATED' ? 'report' : 'raw', originId: m.originId,
                        scopeShape: m.scopeShape || null,
                    }));

                    if (proc.report?.content) {
                        try {
                            const parsed = typeof proc.report.content === 'string' ? JSON.parse(proc.report.content) : proc.report.content;
                            fState[proc.id] = parsed.formData || {};
                            const recoveredType = parsed.procedureType || parsed.type;
                            if (recoveredType && recoveredType !== 'generic' && pData[proc.id].type === 'generic') pData[proc.id].type = recoveredType;
                            sImages[proc.id] = (parsed.selectedImages || []).map((img: any) => {
                                const found = mCache[proc.id].find((m: any) => m.url === img.url || m.id === img.id);
                                return found ? found.id : null;
                            }).filter(Boolean);
                            const caps: any = {};
                            (parsed.selectedImages || []).forEach((img: any) => {
                                const found = mCache[proc.id].find((m: any) => m.url === img.url || m.id === img.id);
                                if (found) caps[found.id] = img.caption;
                            });
                            cMap[proc.id] = caps;
                            if (parsed.captures && Array.isArray(parsed.captures)) {
                                const existingIds = new Set(mCache[proc.id].map((x: any) => x.id));
                                const existingUrls = new Set(mCache[proc.id].map((x: any) => x.url).filter(Boolean));
                                parsed.captures.forEach((m: any) => {
                                    const im = {
                                        id: m.id, url: m.url || (m.filePath ? resolveImageUrl(m.filePath) : ''), type: m.type || 'image',
                                        timestamp: m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
                                        category: m.type === 'ANNOTATED' ? 'report' : (m.category || 'raw'), originId: m.originId,
                                        scopeShape: m.scopeShape || null
                                    };
                                    if (!existingIds.has(im.id) && !(im.url && existingUrls.has(im.url))) {
                                        mCache[proc.id].push(im); existingIds.add(im.id); if (im.url) existingUrls.add(im.url);
                                    }
                                });
                            }
                        } catch (_) { }
                    }
                });

                // Merge in-memory captures
                const currentCaptures = capturesRef.current;
                if (currentCaptures?.length > 0) {
                    const capturesByProc: Record<string, any[]> = {};
                    const unassigned: any[] = [];
                    currentCaptures.forEach((m: any) => {
                        if (m.procedureId) { if (!capturesByProc[m.procedureId]) capturesByProc[m.procedureId] = []; capturesByProc[m.procedureId].push(m); }
                        else unassigned.push(m);
                    });
                    const mergeMedia = (pid: string, mediaList: any[]) => {
                        if (!mCache[pid]) mCache[pid] = [];
                        const existingIds = new Set(mCache[pid].map((x: any) => x.id));
                        const existingUrls = new Set(mCache[pid].map((x: any) => x.url).filter(Boolean));
                        mediaList.forEach((m: any) => {
                            const im = {
                                id: m.id, url: m.url || m.base64 || (m.filePath ? resolveImageUrl(m.filePath) : ''), base64: m.base64, type: m.type || 'image',
                                timestamp: m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '', category: 'report',
                                scopeShape: m.scopeShape || null
                            };
                            if (!existingIds.has(im.id) && !(im.url && existingUrls.has(im.url))) {
                                mCache[pid].push(im); existingIds.add(im.id); if (im.url) existingUrls.add(im.url);
                            }
                        });
                    };
                    Object.keys(capturesByProc).forEach(pid => mergeMedia(pid, capturesByProc[pid]));
                    if (unassigned.length > 0) {
                        new Set([...segments.map((s: any) => s.id), ...Object.keys(pData)]).forEach(pid => mergeMedia(pid, unassigned));
                    }
                    currentCaptures.forEach((c: any) => {
                        const pids = c.procedureId ? [c.procedureId] : Object.keys(mCache);
                        pids.forEach(pid => { if (!sImages[pid]) sImages[pid] = []; sImages[pid].push(c.id); });
                    });
                    Object.keys(sImages).forEach(pid => { sImages[pid] = Array.from(new Set(sImages[pid])); });
                }

                setProceduresData(pData); setMediaCache(mCache); setFormState(fState);
                setSelectedImagesMap(sImages); setCaptionsMap(cMap);

                const savedEquip: any = {}, savedRx: any = {};
                res.procedures.forEach((proc: any) => {
                    if (proc.report?.content) {
                        try {
                            const p = typeof proc.report.content === 'string' ? JSON.parse(proc.report.content) : proc.report.content;
                            if (p.equipment) savedEquip[proc.id] = p.equipment;
                            if (p.prescriptions) savedRx[proc.id] = p.prescriptions;
                        } catch (_) { }
                    }
                });
                setSelectedEquipment(savedEquip); setPrescriptions(savedRx);
            }
            const [equipRes, medRes] = await Promise.all([getEquipment(), getMedicines()]);
            if (equipRes.success) setAvailableEquipment(equipRes.data || []);
            if (medRes.success) setAvailableMedicines(medRes.medicines || []);
            setIsLoading(false);
        };
        load();
    }, [patient.id, segmentIdsKey]);

    useEffect(() => {
        if (!activeTabId && segments.length > 0) setActiveTabId(segments[0].id);
    }, [segments, activeTabId]);

    const assembleAllSegmentsData = useCallback(() => segments.map((seg: any) => {
        const pid = seg.id, pType = proceduresData[pid]?.type || 'generic';
        const rawForm = formState[pid] || {}, structure = resolveTemplate(pType)?.sections || [];
        const printableSections = structure.map((sect: any) => ({
            title: sect.title, items: sect.fields.map((f: any) => {
                let val = rawForm[f.id];
                if (f.type === 'bilateral' && val) val = `R: ${val.right || '—'} | L: ${val.left || '—'}`;
                else if (Array.isArray(val)) val = val.join(', ');
                return { label: f.label, value: val, type: f.type, rawValue: rawForm[f.id] };
            })
        }));
        const selIds = selectedImagesMap[pid] || [], media = mediaCache[pid] || [];
        const selectedImages = Array.from(new Set(selIds)).map((id: string) => {
            const m = media.find((x: any) => x.id === id);
            return { url: m?.url, caption: captionsMap[pid]?.[id] || '', scopeShape: m?.scopeShape || null };
        }).filter((img: any) => img.url);
        return {
            procedureId: pid, procedureType: pType, title: resolveTemplate(pType)?.name || 'Report',
            formData: { printableSections }, selectedImages, imageCaptions: captionsMap[pid] || {},
            captures: media,
            equipment: selectedEquipment[pid]?.map((id: string) => availableEquipment.find((e: any) => e.id === id)).filter(Boolean) || [],
            prescriptions: prescriptions[pid] || []
        };
    }), [segments, proceduresData, formState, selectedImagesMap, mediaCache, captionsMap, selectedEquipment, availableEquipment, prescriptions]);

    const handleSave = async (finalize = false, overrideId?: string) => {
        let allSuccess = true;
        try {
            const allSegmentsData = assembleAllSegmentsData();
            const segmentsToSave = overrideId ? segments.filter((s: any) => s.id === overrideId) : segments;
            const results = await Promise.all(segmentsToSave.map(async (segment: any) => {
                const targetId = segment.id;
                const segmentData = allSegmentsData.find((s: any) => s.procedureId === targetId);
                const reportContent = {
                    formData: formState[targetId] || {}, procedureId: targetId,
                    procedureType: segmentData?.procedureType || 'generic', segments: segmentData ? [segmentData] : [],
                    selectedImages: segmentData?.selectedImages || [], captures: segmentData?.captures || [],
                    imageCaptions: captionsMap[targetId] || {}, equipment: segmentData?.equipment || [],
                    prescriptions: prescriptions[targetId] || [], footerText
                };
                const res = await saveReport({ procedureId: targetId, content: JSON.stringify(reportContent), isFinalized: finalize });
                return res.success;
            }));
            allSuccess = results.every(r => r === true);
        } catch (error) { console.error("Failed to save:", error); allSuccess = false; }
        if (allSuccess) { setIsDirty(false); }
    };

    const handleAutoFill = () => {
        const type = activeTabId ? proceduresData[activeTabId]?.type : 'generic';
        const template = resolveTemplate(type), normalValues = getNormalValues(template ? template.id : type);
        if (!template && !normalValues) return;
        let newForm = { ...(formState[activeTabId!] || {}) };
        if (normalValues) newForm = { ...newForm, ...normalValues };
        template?.sections.forEach((s: any) => s.fields.forEach((f: any) => { if ((f as any).default && !newForm[f.id]) newForm[f.id] = (f as any).default; }));
        setFormState({ ...formState, [activeTabId!]: newForm }); setIsDirty(true);
    };

    const handleFieldChange = (procedureId: string, fieldId: string, val: any) => {
        setFormState(prev => ({ ...prev, [procedureId]: { ...(prev[procedureId] || {}), [fieldId]: val } })); setIsDirty(true);
    };

    const isReportEmpty = useCallback(() => {
        for (const seg of segments) {
            const form = formState[seg.id] || {};
            const hasAnyValue = Object.values(form).some((v: any) => {
                if (v == null) return false;
                if (typeof v === 'object' && !Array.isArray(v)) {
                    return Object.values(v).some((sv: any) => sv != null && String(sv).trim() !== '');
                }
                if (Array.isArray(v)) return v.length > 0;
                return String(v).trim() !== '';
            });
            if (hasAnyValue) return false;
        }
        return true;
    }, [segments, formState]);

    useEffect(() => {
        if (!isDirty) return;
        const timer = setTimeout(() => handleSave(false), 5000);
        return () => clearTimeout(timer);
    }, [formState, selectedEquipment, prescriptions, isDirty]);

    const handleGeneratePDF = async (action: 'download' | 'preview' | 'print') => {
        setIsLoading(true);
        try {
            const blob = await onGeneratePDF({
                patient, doctor, hospital,
                segments: assembleAllSegmentsData(),
                footerText,
                action: action === 'preview' ? undefined : action
            } as any);
            if (!blob) { setIsLoading(false); return; }
            if (action === 'print') {
                const url = URL.createObjectURL(blob as Blob);
                const pf = document.createElement('iframe');
                Object.assign(pf.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: 'none', opacity: '0' });
                pf.src = url; document.body.appendChild(pf);
                pf.onload = () => {
                    try { pf.contentWindow?.focus(); pf.contentWindow?.print(); } catch (_) { window.open(url, '_blank'); }
                    setTimeout(() => { document.body.removeChild(pf); URL.revokeObjectURL(url); }, 60000);
                };
                return;
            }
            if (action === 'preview') { setPreviewBlobUrl(URL.createObjectURL(blob as Blob)); setHasPreviewed(true); }
        } catch (e) { console.error("PDF Gen Error", e); }
        finally { setIsLoading(false); }
    };

    const handleSignAndFinalize = useCallback(() => {
        if (isReportEmpty()) {
            autoFillActionRef.current = 'finalize';
            setShowAutoFillPopup(true);
        } else {
            handleSave(true).then(() => handleGeneratePDF('print'));
        }
    }, [isReportEmpty, handleSave, handleGeneratePDF]);

    const handleSaveAndPreview = useCallback(() => {
        if (isReportEmpty()) {
            autoFillActionRef.current = 'preview';
            setShowAutoFillPopup(true);
        } else {
            handleSave(false).then(() => handleGeneratePDF('preview'));
        }
    }, [isReportEmpty, handleSave, handleGeneratePDF]);

    const handleNavigationAttempt = (action: () => void) => {
        if (isDirty) { setPendingNavigation(() => action); setShowUnsavedModal(true); } else action();
    };
    const handleConfirmExit = async (save: boolean) => {
        if (save) await handleSave(); setShowUnsavedModal(false); setIsDirty(false); if (pendingNavigation) pendingNavigation();
    };
    const handleHomeClick = () => {
        setPendingNavigation(() => onComplete);
        if (isDirty || !hasPreviewed) setShowUnsavedModal(true); else onComplete();
    };
    const handleAnnotateClick = () => {
        if (!onBackToAnnotate) return;
        setPendingNavigation(() => onBackToAnnotate);
        if (isDirty || !hasPreviewed) setShowUnsavedModal(true); else onBackToAnnotate();
    };
    const handleImageReorder = (newIds: string[]) => {
        if (!activeTabId) return;
        setSelectedImagesMap(prev => ({ ...prev, [activeTabId]: newIds })); setIsDirty(true);
    };
    const handleCaptionChange = (id: string, val: string) => {
        if (!activeTabId) return;
        setCaptionsMap(prev => ({ ...prev, [activeTabId]: { ...(prev[activeTabId] || {}), [id]: val } })); setIsDirty(true);
    };

    // ── Modals ──
    const UnsavedChangesModal = () => (
        <AnimatePresence>
            {showUnsavedModal && (
                <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
                    <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="bg-zinc-950 border border-white/10 rounded-[40px] shadow-2xl w-full max-w-md overflow-hidden p-10 flex flex-col items-center text-center gap-6">
                        <div className="w-20 h-20 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                            <AlertCircle size={40} className="text-amber-500" />
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-2xl font-semibold tracking-tight text-white">
                                {isDirty ? "Unsaved Changes" : (!hasPreviewed ? "Report Not Finalized" : "Exit to Dashboard?")}
                            </h3>
                            <p className="text-zinc-400 text-sm font-normal leading-relaxed px-4">
                                {isDirty ? "You have unsaved edits. Exiting now will discard your report draft."
                                    : (!hasPreviewed ? "You haven't clicked 'Save and Preview' to finalize this report."
                                        : "Are you sure you want to return to the patient dashboard?")}
                            </p>
                        </div>
                        <div className="grid grid-cols-2 gap-4 w-full pt-2">
                            <button onClick={() => setShowUnsavedModal(false)} className="h-14 rounded-2xl bg-white/5 border border-white/10 text-white text-xs font-bold uppercase tracking-wider hover:bg-white/10 transition-all">Cancel</button>
                            <button onClick={() => handleConfirmExit(false)} className="h-14 rounded-2xl bg-rose-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-rose-500 transition-all">Exit Now</button>
                        </div>
                        {isDirty && <button onClick={() => handleConfirmExit(true)} className="w-full py-3 rounded-xl text-blue-400 text-xs font-semibold uppercase tracking-wider hover:bg-white/5 transition-all -mt-2">Save & Exit</button>}
                        {!isDirty && !hasPreviewed && <button onClick={() => { setShowUnsavedModal(false); handleGeneratePDF('preview'); }} className="w-full py-3 rounded-xl text-emerald-400 text-xs font-semibold uppercase tracking-wider hover:bg-white/5 transition-all -mt-2">Finalize Now</button>}
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );

    const EmbeddedPDFModal = () => {
        if (!previewBlobUrl) return null;
        return (
            <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-8">
                <div className="bg-white w-full h-full max-w-5xl rounded-2xl overflow-hidden flex flex-col">
                    <div className="h-14 border-b border-zinc-100 flex items-center justify-between px-6">
                        <div className="flex items-center gap-3"><FileText className="text-blue-600" size={18} /><span className="text-sm font-bold uppercase tracking-tight">Finalized Report</span></div>
                        <div className="flex items-center gap-3">
                            <button onClick={() => { URL.revokeObjectURL(previewBlobUrl); setPreviewBlobUrl(null); }} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 flex items-center gap-2"><Check size={14} /> Finish & Return</button>
                            <button onClick={() => { URL.revokeObjectURL(previewBlobUrl); setPreviewBlobUrl(null); }} className="p-1.5 text-zinc-400 hover:text-zinc-600"><X size={20} /></button>
                        </div>
                    </div>
                    <iframe src={`${previewBlobUrl}#toolbar=0`} className="flex-1 w-full" />
                </div>
            </div>
        );
    };

    const AutoFillEmptyModal = () => (
        <AnimatePresence>
            {showAutoFillPopup && (
                <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
                    <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="bg-zinc-950 border border-white/10 rounded-[40px] shadow-2xl w-full max-w-md overflow-hidden p-10 flex flex-col items-center text-center gap-6">
                        <div className="w-20 h-20 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                            <Wand2 size={40} className="text-blue-400" />
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-2xl font-semibold tracking-tight text-white">
                                Report is Empty
                            </h3>
                            <p className="text-zinc-400 text-sm font-normal leading-relaxed px-4">
                                You haven&apos;t filled in any findings. Would you like to auto-fill the report as &quot;Healthy / Normal&quot; before proceeding?
                            </p>
                        </div>
                        <div className="grid grid-cols-2 gap-4 w-full pt-2">
                            <button onClick={() => {
                                setShowAutoFillPopup(false);
                                const isFinalize = autoFillActionRef.current === 'finalize';
                                handleSave(isFinalize).then(() => handleGeneratePDF(isFinalize ? 'print' : 'preview'));
                            }} className="h-14 rounded-2xl bg-white/5 border border-white/10 text-white text-xs font-bold uppercase tracking-wider hover:bg-white/10 transition-all">
                                No, Continue Empty
                            </button>
                            <button onClick={() => {
                                setShowAutoFillPopup(false);
                                const isFinalize = autoFillActionRef.current === 'finalize';
                                // Use flushSync to force synchronous state update so
                                // assembleAllSegmentsData() reads the new auto-filled values
                                flushSync(() => {
                                    segments.forEach((seg: any) => {
                                        const type = proceduresData[seg.id]?.type || 'generic';
                                        const template = resolveTemplate(type);
                                        const normalValues = getNormalValues(template ? template.id : type);
                                        if (!template && !normalValues) return;
                                        let newForm = { ...(formState[seg.id] || {}) };
                                        if (normalValues) newForm = { ...newForm, ...normalValues };
                                        template?.sections.forEach((s: any) => s.fields.forEach((f: any) => { if ((f as any).default && !newForm[f.id]) newForm[f.id] = (f as any).default; }));
                                        setFormState(prev => ({ ...prev, [seg.id]: newForm }));
                                    });
                                    setIsDirty(true);
                                });
                                // Now state is committed — save and generate PDF
                                handleSave(isFinalize).then(() => handleGeneratePDF(isFinalize ? 'print' : 'preview'));
                            }} className="h-14 rounded-2xl bg-emerald-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-emerald-500 transition-all">
                                Yes, Auto-Fill Normal
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );

    // No full-screen white blocking loader — render inline overlay instead
    // (see isLoading overlay inside the main return below)

    const activeForm = activeTabId ? formState[activeTabId] || {} : {};
    const activeType = (activeTabId && proceduresData[activeTabId]) ? proceduresData[activeTabId].type : (segments.find((s: any) => s.id === activeTabId)?.type || 'generic');
    const isGeneric = !activeType || activeType === 'generic';
    const activeMedia = activeTabId ? mediaCache[activeTabId] || [] : [];
    const activeSelectedIds = activeTabId ? selectedImagesMap[activeTabId] || [] : [];

    // Derive the active report name for the letterhead
    const activeReportName = !isGeneric
        ? (resolveTemplate(activeType)?.name || 'Medical Report')
        : null;

    return (
        <div className="flex h-screen bg-[#f5f5f5] overflow-hidden relative">
            <UnsavedChangesModal />
            <EmbeddedPDFModal />
            <AutoFillEmptyModal />

            {/* Non-blocking loading overlay */}
            {isLoading && (
                <div className="absolute inset-0 z-[200] bg-zinc-100/80 backdrop-blur-sm flex items-center justify-center pointer-events-auto">
                    <div className="flex flex-col items-center gap-3">
                        <Loader2 className="animate-spin text-blue-500 w-8 h-8" />
                        <p className="text-[11px] text-zinc-500 uppercase tracking-widest font-bold">Loading Report Data...</p>
                    </div>
                </div>
            )}

            {/* ── A4 Canvas ── */}
            <div className="flex-1 overflow-y-auto flex flex-col items-center p-8 bg-zinc-100">
                <div className="bg-white shadow-2xl flex flex-col shrink-0" style={{ width: '250mm', minHeight: '297mm', padding: '20mm', marginBottom: '4rem' }}>

                    {/* Pass dynamic reportName — no pill in body anymore */}
                    <Letterhead
                        doctor={doctor}
                        patient={patient}
                        hospital={hospital}
                        reportName={activeReportName}
                    />

                    <div className="mt-4">
                        {isGeneric ? (
                            <VisualSelectorA4 segments={segments} activeTabId={activeTabId} onSelect={handleTypeSelect} />
                        ) : (
                            <div className="grid grid-cols-12 gap-8">

                                {/* Left: form + prescription + signature */}
                                <div className="col-span-9 space-y-6">
                                    {(resolveTemplate(activeType)?.sections || []).map((sect: any) => {
                                        const hasComplexFields = sect.fields.some((f: any) => f.type === 'textarea' || f.type === 'bilateral' || f.width === 'full');
                                        return (
                                            <div key={sect.id} className="pb-4">
                                                <h3 className="text-[11px] font-black text-blue-900 uppercase tracking-widest mb-4 border-b-[1.5px] border-zinc-100 pb-2 flex items-center gap-2">
                                                    <div className="w-1 h-3 bg-blue-600 rounded-sm" />{sect.title}
                                                </h3>
                                                <div className={`grid ${hasComplexFields ? 'grid-cols-1' : 'grid-cols-2'} gap-x-12 gap-y-3`}>
                                                    {sect.fields.map((field: any) => (
                                                        <div key={field.id}>
                                                            <RenderField field={field} value={activeForm[field.id]} onChange={(v: any) => handleFieldChange(activeTabId!, field.id, v)} />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}

                                    <PrescriptionSection
                                        prescriptions={prescriptions[activeTabId!] || []}
                                        availableMedicines={availableMedicines}
                                        onChange={(rx: any) => { setPrescriptions(prev => ({ ...prev, [activeTabId!]: rx })); setIsDirty(true); }}
                                    />

                                    {/* Signature block */}
                                    {(() => {
                                        const sig = doctor?.signaturePath ? resolveImageUrl(doctor.signaturePath) : null;
                                        return (
                                            <div className="mt-16 flex items-end justify-between pb-8 border-b-0">
                                                <div className="flex-1 max-w-[50%] flex flex-col dropdown-container text-xs">
                                                    <span className="text-[10px] uppercase font-bold text-zinc-400 mb-1">Footer Note</span>
                                                    <div className="relative group/footer">
                                                        <input 
                                                            type="text" 
                                                            value={footerText}
                                                            onChange={(e) => setFooterText(e.target.value)}
                                                            onBlur={() => saveFooterOption(footerText)}
                                                            placeholder="Type note to appear at bottom left..." 
                                                            className="w-full bg-white border border-zinc-200 rounded-md px-3 py-2 text-[11px] focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all font-medium text-zinc-800 placeholder:text-zinc-300"
                                                        />
                                                        {footerOptions.length > 0 && (
                                                            <div className="absolute left-0 top-full mt-1 w-full bg-white border border-zinc-200 shadow-xl rounded-md opacity-0 group-hover/footer:opacity-100 group-focus-within/footer:opacity-100 pointer-events-none group-hover/footer:pointer-events-auto group-focus-within/footer:pointer-events-auto transition-all z-10 max-h-40 overflow-y-auto">
                                                                {footerOptions.map((opt) => (
                                                                    <div key={opt} className="flex items-center justify-between px-3 py-2 hover:bg-zinc-50 border-b border-zinc-50 last:border-0 group/opt">
                                                                        <button 
                                                                            type="button" 
                                                                            className="flex-1 text-left text-[11px] text-zinc-700 truncate"
                                                                            onClick={() => setFooterText(opt)}
                                                                        >
                                                                            {opt}
                                                                        </button>
                                                                        <div className="flex items-center gap-1 opacity-0 group-hover/opt:opacity-100 transition-opacity">
                                                                            <button 
                                                                                type="button" 
                                                                                onClick={() => setDefaultFooter(opt)} 
                                                                                title="Set as Default" 
                                                                                className={`p-1 rounded hover:bg-blue-100 text-blue-600 ${localStorage.getItem('report_footer_default') === String(footerOptions.indexOf(opt)) ? 'bg-blue-50 opacity-100' : ''}`}
                                                                            >
                                                                                <Check size={12} />
                                                                            </button>
                                                                            <button 
                                                                                type="button" 
                                                                                onClick={() => removeFooterOption(opt)} 
                                                                                title="Remove" 
                                                                                className="p-1 rounded hover:bg-rose-100 text-rose-500"
                                                                            >
                                                                                <Trash2 size={12} />
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex flex-col items-end">
                                                    <div className="h-16 w-48 mb-2 flex items-end justify-center border-b-[1.5px] border-zinc-300 border-dashed">
                                                        {sig ? <img src={sig} alt="Signature" className="max-h-14 max-w-full object-contain mb-1" />
                                                            : <span className="text-[9px] text-zinc-300 font-bold uppercase tracking-widest mb-2">Signature Placeholder</span>}
                                                    </div>
                                                    <div className="text-[13px] font-bold text-zinc-900">{formattedDrName}{doctorDegree}</div>
                                                    <div className="text-[11px] font-medium text-zinc-500">{doctorRole}</div>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>

                                {/* Right: draggable image gallery */}
                                <div className="col-span-3 border-l border-zinc-50 pl-6">
                                    <DraggableImageGallery
                                        imageIds={activeSelectedIds}
                                        mediaCache={activeMedia}
                                        captionsMap={captionsMap[activeTabId!] || {}}
                                        onReorder={handleImageReorder}
                                        onCaptionChange={handleCaptionChange}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    <Footer doctor={doctor} />
                </div>
            </div>

            {/* ── Right Sidebar ── */}
            <div className="w-72 bg-white border-l border-zinc-100 flex flex-col z-50 font-plus-jakarta">

                <div className="p-6 border-b border-zinc-50 flex items-center gap-2">
                    {onBackToAnnotate && (
                        <button onClick={handleAnnotateClick}
                            className="flex items-center gap-1.5 text-zinc-500 hover:text-blue-600 transition-all font-bold uppercase text-[11px] bg-zinc-50 px-2 flex-1 justify-center py-2 rounded-lg border border-zinc-100 shadow-sm">
                            <ArrowLeft size={14} /> Annotate
                        </button>
                    )}
                    <button onClick={handleHomeClick}
                        className="flex items-center gap-1.5 text-zinc-500 hover:text-rose-600 transition-all font-bold uppercase text-[11px] flex-1 justify-center bg-zinc-50 px-2 py-2 rounded-lg border border-zinc-100 shadow-sm">
                        <Home size={14} /> Home
                    </button>
                </div>

                <div className="flex-1 p-6 overflow-y-auto flex flex-col gap-6 custom-scrollbar">

                    {/* Procedure list */}
                    <div className="space-y-4">
                        <span className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] block">Procedure List</span>
                        <div className="space-y-2">
                            {segments.map((s: any) => {
                                const sType = proceduresData[s.id]?.type || s.type || 'generic';
                                const template = resolveTemplate(sType);
                                const name = template?.shortName || template?.name || `Segment P${s.index}`;
                                return (
                                    <button key={s.id}
                                        onClick={() => handleNavigationAttempt(() => { setActiveTabId(s.id); setActiveSegment(s.index); })}
                                        className={`w-full text-left px-4 py-3.5 rounded-xl text-[12px] font-bold transition-all border ${activeTabId === s.id ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-[0_2px_10px_rgba(59,130,246,0.1)]' : 'border-zinc-100 text-zinc-500 hover:bg-zinc-50 hover:border-zinc-200 hover:text-zinc-700 shadow-sm'}`}>
                                        <div className="flex items-center gap-3 relative">
                                            <div className={`w-2 h-2 rounded-full transition-colors ${activeTabId === s.id ? 'bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.4)]' : 'bg-zinc-300'}`} />
                                            <span className="truncate">{name.toUpperCase()}</span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Report actions */}
                    <div className="border-t border-zinc-100 pt-6 space-y-4">
                        <span className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] block">Report Actions</span>
                        <button onClick={handleAutoFill} disabled={isGeneric}
                            className="w-full py-4 bg-blue-50 text-blue-600 rounded-xl font-bold text-[13px] hover:bg-blue-100 hover:text-blue-700 transition-all flex items-center justify-center gap-2 border border-blue-100 disabled:opacity-50 disabled:grayscale shadow-sm">
                            <Wand2 size={16} /> Auto-Fill Normal
                        </button>
                        <button onClick={handleSaveAndPreview}
                            className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold text-[13px] hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2">
                            <Eye size={16} /> Save and Preview
                        </button>
                        <button onClick={handleSignAndFinalize}
                            className="w-full py-4 bg-zinc-900 text-white rounded-xl font-bold text-[13px] hover:bg-zinc-800 transition-all shadow-lg shadow-zinc-900/20 flex items-center justify-center gap-2">
                            <Printer size={16} /> Sign and Finalize
                        </button>
                    </div>

                    {/* Previous history reports */}
                    <div className="mt-auto pt-6 border-t border-zinc-100">
                        <HistoryReportsPanel procedures={allProcedures} />
                    </div>
                </div>
            </div>
        </div>
    );

    function handleTypeSelect(type: string) {
        if (!activeTabId) return;
        updateProcedureType(activeTabId, type).then(res => {
            if (res.success) {
                setProceduresData(prev => ({ ...prev, [activeTabId]: { ...(prev[activeTabId] || {}), type } }));
                useSessionStore.setState({ segments: segments.map((s: any) => s.id === activeTabId ? { ...s, type } : s) });
                setIsDirty(true);
            } else alert("Failed to update procedure type.");
        }).catch(err => console.error("Type update error:", err));
    }
}