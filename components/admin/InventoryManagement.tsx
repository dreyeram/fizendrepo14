"use client";

import React, { useState, useEffect } from "react";
import {
    Plus, Search, Edit2, Trash2, Pill, Beaker,
    Stethoscope, FileText, ChevronRight, Loader2,
    Filter, X, Save, AlertCircle
} from "lucide-react";
import { getMedicines, addMedicine, updateMedicine, deleteMedicine } from "@/app/actions/inventory";
import { motion, AnimatePresence } from "framer-motion";
import { useConfirm } from "@/lib/hooks/useConfirm";
import { useNotify } from "@/lib/store/ui.store";

interface Medicine {
    id: string;
    name: string;
    composition?: string;
    strength?: string;
    category?: string;
    dosageForm?: string;
    description?: string;
}

interface InventoryManagementProps {
    organizationId: string;
}

export default function InventoryManagement({ organizationId }: InventoryManagementProps) {
    const [medicines, setMedicines] = useState<Medicine[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingMedicine, setEditingMedicine] = useState<Medicine | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState("");
    const confirm = useConfirm();
    const notify = useNotify();

    // Form State
    const [formData, setFormData] = useState({
        name: "",
        composition: "",
        strength: "",
        category: "Tablet",
        dosageForm: "Oral",
        description: ""
    });

    const categories = ["Tablet", "Syrup", "Injection", "Capsule", "Ointment", "Drops", "Inhaler", "Other"];
    const dosageForms = ["Oral", "IV", "IM", "Subcutaneous", "Topical", "Nasal", "Inhalation", "Rectal"];

    useEffect(() => {
        loadData();
    }, [organizationId]);

    const loadData = async () => {
        setLoading(true);
        const result = await getMedicines();
        if (result.success && result.medicines) {
            setMedicines(result.medicines as any);
        }
        setLoading(false);
    };

    const handleOpenModal = (medicine?: Medicine) => {
        if (medicine) {
            setEditingMedicine(medicine);
            setFormData({
                name: medicine.name,
                composition: medicine.composition || "",
                strength: medicine.strength || "",
                category: medicine.category || "Tablet",
                dosageForm: medicine.dosageForm || "Oral",
                description: medicine.description || ""
            });
        } else {
            setEditingMedicine(null);
            setFormData({
                name: "",
                composition: "",
                strength: "",
                category: "Tablet",
                dosageForm: "Oral",
                description: ""
            });
        }
        setIsModalOpen(true);
        setError("");
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name.trim()) {
            setError("Medicine name is required");
            return;
        }

        setIsSaving(true);
        setError("");

        try {
            if (editingMedicine) {
                const result = await updateMedicine(editingMedicine.id, formData);
                if (result.success) {
                    setIsModalOpen(false);
                    loadData();
                } else {
                    setError(result.error || "Failed to update");
                }
            } else {
                const result = await addMedicine({ ...formData, organizationId });
                if (result.success) {
                    setIsModalOpen(false);
                    loadData();
                } else {
                    setError(result.error || "Failed to add");
                }
            }
        } catch (err) {
            setError("An unexpected error occurred");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string, name: string) => {
        const ok = await confirm({
            title: "Delete Medicine",
            message: `Are you sure you want to delete ${name}?`,
            confirmLabel: "Delete",
            variant: "danger"
        });
        
        if (ok) {
            const result = await deleteMedicine(id);
            if (result.success) {
                notify.success("Medicine Deleted", `${name} has been removed from inventory.`);
                loadData();
            } else {
                notify.error("Delete Failed", result.error || "Failed to delete medicine.");
            }
        }
    };

    const filteredMedicines = medicines.filter(m =>
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.composition?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.category?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 p-2">
                <div className="flex items-center gap-5">
                    <div className="p-4 bg-emerald-100 rounded-[1.5rem] text-emerald-600 shadow-inner">
                        <Pill size={32} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-semibold text-slate-800 tracking-tight">Medicine Inventory</h2>
                        <p className="text-slate-500 text-[11px] font-medium mt-1 uppercase tracking-wider">Management & Prescriptions</p>
                    </div>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="flex items-center justify-center gap-3 bg-white hover:bg-emerald-50 text-emerald-600 border border-emerald-100 px-8 py-3.5 rounded-[1.25rem] font-semibold text-sm uppercase tracking-wider transition-all shadow-xl shadow-emerald-900/5 active:scale-95"
                >
                    <Plus size={20} className="stroke-[2.5]" />
                    Add Medicine
                </button>
            </div>

            {/* Stats & Search */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="md:col-span-3 relative group">
                    <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors" size={20} />
                    <input
                        type="text"
                        placeholder="Search medicines by name, composition or category..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-white/60 backdrop-blur-xl border border-white/80 rounded-[1.5rem] pl-16 pr-6 py-4 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500/50 transition-all shadow-xl shadow-slate-200/40 font-medium"
                    />
                </div>
                <div className="bg-white/80 backdrop-blur-xl border border-white p-4 flex items-center justify-between px-8 rounded-[1.5rem] shadow-xl shadow-slate-200/40">
                    <div className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Total Items</div>
                    <div className="text-2xl font-semibold text-slate-900">{medicines.length}</div>
                </div>
            </div>

            {/* List/Grid View */}
            <div className="bg-white/40 backdrop-blur-2xl border border-white/80 rounded-[2.5rem] overflow-hidden shadow-2xl shadow-slate-200/60">
                {loading ? (
                    <div className="p-32 flex flex-col items-center justify-center text-slate-400">
                        <Loader2 className="w-12 h-12 animate-spin text-emerald-500 mb-6" />
                        <p className="font-black uppercase tracking-widest text-[10px] animate-pulse">Synchronizing inventory...</p>
                    </div>
                ) : filteredMedicines.length === 0 ? (
                    <div className="p-32 flex flex-col items-center justify-center text-center text-slate-400">
                        <div className="w-24 h-24 bg-slate-50 rounded-[2rem] flex items-center justify-center mb-6 shadow-inner">
                            <Filter className="w-10 h-10 text-slate-300" />
                        </div>
                        <h3 className="text-lg font-semibold text-slate-800 mb-2">No medicines found</h3>
                        <p className="max-w-xs text-sm font-medium text-slate-500">Try adjusting your search or add a new medicine to start your inventory.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-white/50 border-b border-white text-xs uppercase font-semibold tracking-wider text-slate-500">
                                    <th className="px-10 py-6">Medicine & Composition</th>
                                    <th className="px-10 py-6">Category</th>
                                    <th className="px-10 py-6">Dosage & Strength</th>
                                    <th className="px-10 py-6 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/50">
                                {filteredMedicines.map((medicine) => (
                                    <tr key={medicine.id} className="hover:bg-white/60 transition-all group">
                                        <td className="px-10 py-6">
                                            <div className="flex items-center gap-5">
                                                <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-500 shrink-0 group-hover:bg-emerald-500 group-hover:text-white transition-all shadow-sm group-hover:shadow-lg group-hover:shadow-emerald-200 group-hover:-translate-y-0.5">
                                                    <Pill size={24} />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="font-semibold text-slate-800 text-base tracking-tight group-hover:text-emerald-700 transition-colors">{medicine.name}</div>
                                                    <div className="text-xs text-slate-500 font-medium uppercase tracking-wider">{medicine.composition || 'Generic Salt'}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-10 py-6">
                                            <span className="px-4 py-1.5 rounded-xl bg-slate-100/80 text-slate-600 text-xs font-semibold tracking-wider uppercase border border-white shadow-sm">
                                                {medicine.category}
                                            </span>
                                        </td>
                                        <td className="px-10 py-6">
                                            <div className="flex flex-col">
                                                <span className="text-sm text-slate-700 font-semibold">{medicine.dosageForm}</span>
                                                <span className="text-xs text-slate-500 font-medium">{medicine.strength || '-'}</span>
                                            </div>
                                        </td>
                                        <td className="px-10 py-6 text-right">
                                            <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                                                <button
                                                    onClick={() => handleOpenModal(medicine)}
                                                    className="p-3 text-slate-400 hover:text-blue-600 bg-white hover:shadow-lg rounded-xl transition-all border border-transparent hover:border-blue-100"
                                                >
                                                    <Edit2 size={18} />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(medicine.id, medicine.name)}
                                                    className="p-3 text-slate-400 hover:text-rose-600 bg-white hover:shadow-lg rounded-xl transition-all border border-transparent hover:border-rose-100"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal */}
            <AnimatePresence>
                {isModalOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsModalOpen(false)}
                            className="absolute inset-0 bg-slate-900/20 backdrop-blur-md"
                        />
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="relative w-full max-w-xl bg-white/95 backdrop-blur-2xl border border-white rounded-[3rem] shadow-[0_32px_128px_-16px_rgba(0,0,0,0.15)] overflow-hidden"
                        >
                            <div className="flex items-center justify-between p-8 border-b border-slate-50 bg-white/50">
                                <h3 className="text-xl font-semibold text-slate-800 flex items-center gap-4 tracking-tight">
                                    <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-600">
                                        {editingMedicine ? <Edit2 size={24} /> : <Plus size={24} />}
                                    </div>
                                    {editingMedicine ? "Edit Medicine" : "Add New Medicine"}
                                </h3>
                                <button onClick={() => setIsModalOpen(false)} className="p-3 text-slate-400 hover:text-slate-900 hover:bg-slate-50 rounded-full transition-all">
                                    <X size={24} />
                                </button>
                            </div>

                            <form onSubmit={handleSubmit} className="p-10 space-y-8">
                                {error && (
                                    <div className="flex items-center gap-3 p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 text-sm font-bold">
                                        <AlertCircle size={20} />
                                        {error}
                                    </div>
                                )}

                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 ml-2">Medicine Name *</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="e.g. Pantoprazole"
                                        className="w-full bg-slate-50/50 border border-slate-100 rounded-2xl px-6 py-4 text-slate-800 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500/50 transition-all font-semibold"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 ml-2">Composition</label>
                                        <input
                                            type="text"
                                            value={formData.composition}
                                            onChange={(e) => setFormData({ ...formData, composition: e.target.value })}
                                            placeholder="e.g. Salt info"
                                            className="w-full bg-slate-50/50 border border-slate-100 rounded-2xl px-6 py-4 text-slate-800 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500/50 transition-all text-sm font-semibold"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 ml-2">Strength</label>
                                        <input
                                            type="text"
                                            value={formData.strength}
                                            onChange={(e) => setFormData({ ...formData, strength: e.target.value })}
                                            placeholder="e.g. 40mg"
                                            className="w-full bg-slate-50/50 border border-slate-100 rounded-2xl px-6 py-4 text-slate-800 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500/50 transition-all text-sm font-semibold"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 ml-2">Category</label>
                                        <select
                                            value={formData.category}
                                            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                            className="w-full bg-slate-50/50 border border-slate-100 rounded-2xl px-6 py-4 text-slate-800 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500/50 transition-all text-sm font-semibold appearance-none"
                                        >
                                            {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 ml-2">Dosage Form</label>
                                        <select
                                            value={formData.dosageForm}
                                            onChange={(e) => setFormData({ ...formData, dosageForm: e.target.value })}
                                            className="w-full bg-slate-50/50 border border-slate-100 rounded-2xl px-6 py-4 text-slate-800 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500/50 transition-all text-sm font-semibold appearance-none"
                                        >
                                            {dosageForms.map(d => <option key={d} value={d}>{d}</option>)}
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 ml-2">Notes / Description</label>
                                    <textarea
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                        rows={3}
                                        placeholder="Add any specific instructions or details..."
                                        className="w-full bg-slate-50/50 border border-slate-100 rounded-2xl px-6 py-4 text-slate-800 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500/50 transition-all text-sm font-semibold resize-none"
                                    />
                                </div>

                                <div className="flex gap-4 pt-4">
                                    <button
                                        type="button"
                                        onClick={() => setIsModalOpen(false)}
                                        className="flex-1 py-5 bg-slate-50 hover:bg-slate-100 text-slate-800 rounded-[1.5rem] font-semibold uppercase tracking-wider px-4 transition-all"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSaving}
                                        className="flex-[2] py-5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-[1.5rem] font-semibold uppercase tracking-wider transition-all flex items-center justify-center gap-3 shadow-2xl shadow-emerald-500/20"
                                    >
                                        {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} className="stroke-[2.5]" />}
                                        {editingMedicine ? "Update Medicine" : "Add to Inventory"}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
