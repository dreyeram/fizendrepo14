"use client";

import React, { useState, useEffect } from "react";
import { Plus, Search, Trash2, Edit2, Check, X, Stethoscope, Sliders, Loader2 } from "lucide-react";
import { getEquipment, createEquipment, updateEquipment, deleteEquipment } from "@/app/actions/equipment";
import { getAllTemplates } from "@/data/reportTemplates";
import { useConfirm } from "@/lib/hooks/useConfirm";

export default function EquipmentSettings() {
    const [equipment, setEquipment] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [isEditing, setIsEditing] = useState(false);
    const [currentId, setCurrentId] = useState<string | null>(null);
    const confirm = useConfirm();

    // Form State
    const [formData, setFormData] = useState({
        name: "",
        type: "Scope",
        serialNumber: "",
        modelNumber: "",
        procedureTypes: [] as string[]
    });

    const procedureOptions = getAllTemplates().map(t => ({ id: t.id, name: t.name }));

    useEffect(() => {
        loadEquipment();
    }, []);

    const loadEquipment = async () => {
        setIsLoading(true);
        try {
            const res = await getEquipment();
            console.log("Equipment Fetch Result:", res);
            if (res.success && res.data) {
                setEquipment(res.data);
            } else {
                console.error("Failed to fetch equipment:", res.error);
            }
        } catch (error) {
            console.error("Error loading equipment:", error);
        }
        setIsLoading(false);
    };

    const handleSave = async () => {
        if (!formData.name) return;

        if (isEditing && currentId) {
            await updateEquipment(currentId, formData);
        } else {
            await createEquipment(formData);
        }

        resetForm();
        loadEquipment();
    };

    const handleEdit = (item: any) => {
        setFormData({
            name: item.name,
            type: item.type,
            serialNumber: item.serialNumber || "",
            modelNumber: item.modelNumber || "",
            procedureTypes: item.procedureTypes ? JSON.parse(item.procedureTypes) : []
        });
        setCurrentId(item.id);
        setIsEditing(true);
    };

    const handleDelete = async (id: string) => {
        const ok = await confirm({
            title: "Delete Equipment",
            message: "Are you sure you want to delete this equipment? This will remove it from the asset registry.",
            confirmLabel: "Delete Asset",
            variant: "danger"
        });
        if (ok) {
            await deleteEquipment(id);
            loadEquipment();
        }
    };

    const resetForm = () => {
        setFormData({ name: "", type: "Scope", serialNumber: "", modelNumber: "", procedureTypes: [] });
        setIsEditing(false);
        setCurrentId(null);
    };

    const toggleProcedureType = (id: string) => {
        setFormData(prev => {
            const exists = prev.procedureTypes.includes(id);
            return {
                ...prev,
                procedureTypes: exists
                    ? prev.procedureTypes.filter(t => t !== id)
                    : [...prev.procedureTypes, id]
            };
        });
    };

    const filteredEquipment = equipment.filter(e => e.name.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className="h-full flex flex-col space-y-8 animate-in fade-in duration-700 p-2">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-5">
                    <div className="p-4 bg-emerald-100 rounded-[1.5rem] text-emerald-600 shadow-inner">
                        <Stethoscope size={32} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-semibold text-slate-800 tracking-tight">Equipment Assets</h2>
                        <p className="text-slate-500 text-xs font-medium mt-1 uppercase tracking-wider">Registry & Maintenance</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            type="text"
                            placeholder="Find matches..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-12 pr-6 py-3.5 bg-white/60 backdrop-blur-md border border-white/80 rounded-2xl text-slate-900 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500/50 transition-all font-medium text-sm shadow-lg shadow-slate-200/40 w-64 placeholder:text-slate-400"
                        />
                    </div>
                </div>
            </div>

            <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 gap-8 min-h-0">
                {/* List Pane */}
                <div className="lg:col-span-2 flex flex-col min-h-0">
                    <div className="flex-1 bg-white/40 backdrop-blur-2xl border border-white/80 rounded-[2.5rem] overflow-hidden shadow-2xl shadow-slate-200/60 flex flex-col">
                        <div className="px-8 py-6 border-b border-white/50 bg-white/30 flex items-center justify-between">
                            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                Registered Devices
                            </h4>
                            {!isEditing && (
                                <button
                                    onClick={resetForm}
                                    className="p-2 bg-white hover:bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-xl transition-all shadow-sm active:scale-95"
                                >
                                    <Plus size={20} className="stroke-[3]" />
                                </button>
                            )}
                        </div>

                        <div className="flex-1 overflow-auto divide-y divide-white/50 scrollbar-hide">
                            {isLoading ? (
                                <div className="p-12 text-center">
                                    <Loader2 size={32} className="animate-spin mx-auto text-emerald-400 mb-4" />
                                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Inventory Syncing</p>
                                </div>
                            ) : filteredEquipment.length === 0 ? (
                                <div className="p-12 text-center">
                                    <Stethoscope size={40} className="mx-auto mb-4 opacity-20 text-slate-400" />
                                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">No assets found</p>
                                    <button
                                        onClick={resetForm}
                                        className="text-xs font-semibold text-emerald-600 uppercase tracking-wider hover:underline"
                                    >
                                        Initialize Registry
                                    </button>
                                </div>
                            ) : (
                                filteredEquipment.map((item) => (
                                    <div
                                        key={item.id}
                                        onClick={() => handleEdit(item)}
                                        className={`p-6 cursor-pointer transition-all duration-300 group ${currentId === item.id ? 'bg-emerald-50/50 ring-2 ring-emerald-500/20' : 'hover:bg-white/50'}`}
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <h5 className="font-semibold text-slate-800 tracking-tight truncate">
                                                        {item.name}
                                                    </h5>
                                                    <span className="text-[10px] font-semibold bg-white text-slate-500 px-2 py-0.5 rounded-full uppercase tracking-wider border border-slate-100">
                                                        {item.type}
                                                    </span>
                                                </div>
                                                <div className="space-y-1">
                                                    {item.serialNumber && (
                                                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                                            <div className="w-1 h-1 bg-slate-300 rounded-full" />
                                                            SN: {item.serialNumber}
                                                        </p>
                                                    )}
                                                    {item.procedureTypes && (
                                                        <div className="flex flex-wrap gap-1 mt-3">
                                                            {JSON.parse(item.procedureTypes).map((pt: string) => (
                                                                <span key={pt} className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-lg uppercase tracking-wider">
                                                                    {procedureOptions.find(o => o.id === pt)?.name || pt}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                                                    className="p-2 opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Editor Pane */}
                <div className="lg:col-span-3">
                    <div className="h-full bg-white/40 backdrop-blur-2xl border border-white/80 rounded-[2.5rem] p-8 shadow-2xl shadow-slate-200/60 overflow-y-auto">
                        <div className="flex items-center justify-between mb-10">
                            <div>
                                <h4 className="text-lg font-semibold text-slate-800 tracking-tight">
                                    {isEditing ? "Refine Asset File" : "New Device Registry"}
                                </h4>
                                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-1">Asset Metadata Configuration</p>
                            </div>
                            {isEditing && (
                                <button
                                    onClick={resetForm}
                                    className="p-2 hover:bg-white/50 rounded-xl transition-all text-slate-400 hover:text-slate-600"
                                >
                                    <X size={20} className="stroke-[3]" />
                                </button>
                            )}
                        </div>

                        <div className="space-y-8 max-w-2xl">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 ml-2">Device Name</label>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="e.g. Olympus EXERA III"
                                        className="w-full bg-white/50 border border-slate-100 rounded-2xl px-6 py-4 text-slate-800 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500/50 transition-all font-semibold text-sm"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 ml-2">Category Type</label>
                                    <select
                                        value={formData.type}
                                        onChange={e => setFormData({ ...formData, type: e.target.value })}
                                        className="w-full bg-white/50 border border-slate-100 rounded-2xl px-6 py-4 text-slate-800 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500/50 transition-all font-semibold text-sm cursor-pointer"
                                    >
                                        <option value="Scope">Scope</option>
                                        <option value="Processor">Processor</option>
                                        <option value="Light Source">Light Source</option>
                                        <option value="Accessory">Accessory</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 ml-2">Serial Signature</label>
                                    <input
                                        type="text"
                                        value={formData.serialNumber}
                                        onChange={e => setFormData({ ...formData, serialNumber: e.target.value })}
                                        placeholder="SN-XXXXX-XXXX"
                                        className="w-full bg-white/50 border border-slate-100 rounded-2xl px-6 py-4 text-slate-800 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500/50 transition-all font-semibold text-sm"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 ml-2 flex items-center justify-between">
                                    Linked Procedures
                                    <Sliders size={14} className="text-slate-300" />
                                </label>
                                <div className="p-6 bg-white/50 border border-slate-100 rounded-[2rem] flex flex-wrap gap-3">
                                    {procedureOptions.map(proc => (
                                        <button
                                            key={proc.id}
                                            onClick={() => toggleProcedureType(proc.id)}
                                            className={`px-5 py-2.5 rounded-xl text-xs font-semibold transition-all border uppercase tracking-wider ${formData.procedureTypes.includes(proc.id)
                                                ? "bg-emerald-600 text-white border-emerald-600 shadow-lg shadow-emerald-500/20"
                                                : "bg-white text-slate-500 border-slate-100 hover:border-emerald-200 hover:bg-emerald-50/30"
                                                }`}
                                        >
                                            {proc.name}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="pt-6">
                                <button
                                    onClick={handleSave}
                                    disabled={!formData.name}
                                    className={`w-full py-4 rounded-2xl font-semibold text-sm uppercase tracking-wider flex items-center justify-center gap-3 transition-all ${formData.name
                                        ? "bg-white hover:bg-emerald-50 text-emerald-600 border border-emerald-100 shadow-xl shadow-emerald-900/5 active:scale-95"
                                        : "bg-slate-100 text-slate-300 cursor-not-allowed border border-slate-200"
                                        }`}
                                >
                                    {isEditing ? <Check size={18} className="stroke-[2.5]" /> : <Plus size={18} className="stroke-[2.5]" />}
                                    {isEditing ? "Update Registry" : "Commit Device"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
