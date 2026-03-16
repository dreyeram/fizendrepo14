"use client";

import React, { useState, useEffect } from "react";
import { Plus, Pill, Edit2, Trash2, Search, Loader2, Save, X, AlertCircle } from "lucide-react";
import { getMedicines, addMedicine, updateMedicine, deleteMedicine } from "@/app/actions/inventory";
import { motion, AnimatePresence } from "framer-motion";
import { useConfirm } from "@/lib/hooks/useConfirm";

interface Medicine {
    id: string;
    name: string;
    composition?: string;
    strength?: string;
    category?: string;
    dosageForm?: string;
}

interface MedicinesTabProps {
    orgId: string;
}

export default function MedicinesTab({ orgId }: MedicinesTabProps) {
    const [medicines, setMedicines] = useState<Medicine[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingMed, setEditingMed] = useState<Medicine | null>(null);
    const [formData, setFormData] = useState({
        name: "",
        composition: "",
        strength: "",
        category: "Tablet",
        dosageForm: "Oral"
    });
    const confirm = useConfirm();

    useEffect(() => {
        loadMedicines();
    }, [orgId]);

    const loadMedicines = async () => {
        setLoading(true);
        const result = await getMedicines();
        if (result.success && result.medicines) {
            setMedicines(result.medicines as any);
        }
        setLoading(false);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingMed) {
                await updateMedicine(editingMed.id, formData);
            } else {
                await addMedicine({ ...formData, organizationId: orgId });
            }
            setIsModalOpen(false);
            loadMedicines();
        } catch (err) {
            console.error("Save failed", err);
        }
    };

    const handleDelete = async (id: string) => {
        const ok = await confirm({
            title: "Delete Medicine",
            message: "Are you sure you want to delete this medicine? This will remove it from the inventory.",
            confirmLabel: "Delete Medicine",
            variant: "danger"
        });
        if (!ok) return;
        try {
            await deleteMedicine(id);
            loadMedicines();
        } catch (err) {
            console.error("Delete failed", err);
        }
    };

    const filtered = medicines.filter(m =>
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        m.composition?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="space-y-6 animate-in fade-in duration-500 flex flex-col h-full overflow-hidden">
            {/* Header / Search Area */}
            <div className="flex items-center justify-between shrink-0">
                <div className="relative w-64">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                        type="text"
                        placeholder="Search medicines..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-10 pr-4 py-2.5 text-sm font-bold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all shadow-sm"
                    />
                </div>
                <button
                    onClick={() => { setEditingMed(null); setFormData({ name: "", composition: "", strength: "", category: "Tablet", dosageForm: "Oral" }); setIsModalOpen(true); }}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-xl shadow-blue-500/10 transition-all active:scale-95"
                >
                    <Plus size={18} />
                    Add Medicine
                </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-slate-200">
                {loading ? (
                    <div className="h-64 flex flex-col items-center justify-center text-slate-400">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-4" />
                        <p className="text-[10px] font-black uppercase tracking-widest">Syndicating Inventory...</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="h-64 flex flex-col items-center justify-center text-slate-300">
                        <Pill size={48} strokeWidth={1.5} className="mb-4" />
                        <p className="font-bold text-sm">No medicines found</p>
                    </div>
                ) : (
                    filtered.map((medicine) => (
                        <div key={medicine.id} className="group bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center justify-between hover:bg-white hover:shadow-xl hover:shadow-slate-200/50 hover:border-white transition-all">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-white shadow-sm rounded-xl flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform">
                                    <Pill size={20} />
                                </div>
                                <div>
                                    <h4 className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{medicine.name}</h4>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{medicine.composition} • {medicine.strength}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={() => { setEditingMed(medicine); setFormData({ ...medicine as any }); setIsModalOpen(true); }}
                                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                >
                                    <Edit2 size={16} />
                                </button>
                                <button
                                    onClick={() => handleDelete(medicine.id)}
                                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Modal */}
            <AnimatePresence>
                {isModalOpen && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsModalOpen(false)} className="absolute inset-0 bg-slate-900/10 backdrop-blur-md" />
                        <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl p-10 overflow-hidden border border-white">
                            <h3 className="text-xl font-black text-slate-900 mb-8 flex items-center gap-3">
                                {editingMed ? <Edit2 size={24} className="text-blue-600" /> : <Plus size={24} className="text-blue-600" />}
                                {editingMed ? "Edit Medicine" : "Add Medicine"}
                            </h3>
                            <form onSubmit={handleSave} className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[11px] font-black uppercase tracking-widest text-slate-400">Medicine Name</label>
                                    <input
                                        type="text" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-slate-800 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all shadow-sm"
                                        placeholder="e.g. Paracetamol"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-black uppercase tracking-widest text-slate-400">Composition</label>
                                        <input
                                            type="text" value={formData.composition} onChange={e => setFormData({ ...formData, composition: e.target.value })}
                                            className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-slate-800 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all shadow-sm"
                                            placeholder="Salt name"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-black uppercase tracking-widest text-slate-400">Strength</label>
                                        <input
                                            type="text" value={formData.strength} onChange={e => setFormData({ ...formData, strength: e.target.value })}
                                            className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-slate-800 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all shadow-sm"
                                            placeholder="500mg"
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-black uppercase tracking-widest text-slate-400">Category</label>
                                        <select value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-slate-800 focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all">
                                            {["Tablet", "Syrup", "Injection", "Capsule", "Ointment", "Drops", "Inhaler", "Other"].map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-black uppercase tracking-widest text-slate-400">Form</label>
                                        <select value={formData.dosageForm} onChange={e => setFormData({ ...formData, dosageForm: e.target.value })} className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-slate-800 focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all">
                                            {["Oral", "IV", "IM", "Subcutaneous", "Topical", "Nasal", "Inhalation", "Rectal"].map(d => <option key={d} value={d}>{d}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="flex gap-4 pt-4">
                                    <button onClick={() => setIsModalOpen(false)} type="button" className="flex-1 py-4 bg-slate-100 font-bold uppercase tracking-widest text-slate-600 rounded-2xl hover:bg-slate-200 transition-all">Cancel</button>
                                    <button type="submit" className="flex-[2] py-4 bg-blue-600 text-white font-bold uppercase tracking-widest rounded-2xl shadow-xl shadow-blue-500/20 hover:scale-[1.02] transition-all">Save Medicine</button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
