"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { User, Phone, Mail, MapPin, Loader2, Zap, Check, Stethoscope, FileText, AlertCircle, X } from "lucide-react";
import { createPatient } from "@/app/actions/auth";
import { encodeProcedureType } from "@/types/procedureTypes";

interface RapidEntryProps {
    onSuccess: (patient: any, procedureType?: string) => void;
}

const GENDER_OPTIONS = ["Male", "Female", "Other"];

export default function RapidEntry({ onSuccess }: RapidEntryProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    const [formData, setFormData] = useState({
        fullName: '',
        age: '',
        gender: 'Male',
        mobile: '',
        email: '',
        address: '',
        referringDoctor: '',
        notes: ''
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        setError('');
    };

    const validate = () => {
        if (!formData.fullName.trim()) return "Patient name is required";
        if (!formData.age || parseInt(formData.age) <= 0) return "Valid age is required";
        if (!formData.mobile.trim() || formData.mobile.length < 10) return "Valid mobile number is required";
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

        try {
            const result = await createPatient({
                fullName: formData.fullName.trim(),
                age: parseInt(formData.age) || 0,
                gender: formData.gender as any,
                mobile: formData.mobile.trim(),
                email: formData.email.trim() || undefined,
                address: formData.address.trim() || undefined,
            });

            if (result.success && result.patient) {
                const defaultType = encodeProcedureType("ent", "nasal_sinus", "nasal_endoscopy");
                onSuccess(result.patient, defaultType);
                // Reset form
                setFormData({ fullName: '', age: '', gender: 'Male', mobile: '', email: '', address: '', referringDoctor: '', notes: '' });
            } else {
                setError(result.error || 'Registration conflict detected');
            }
        } catch (err) {
            setError('Biometric link failure. Try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="h-full flex flex-col bg-transparent px-2">
            <div className="glass-surface p-10 rounded-[3rem] bg-white/40 flex-1 relative overflow-hidden flex flex-col border border-white/50 shadow-2xl shadow-slate-200/20">
                {/* Header Section */}
                <div className="shrink-0 mb-10 flex items-start justify-between">
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.2em] shadow-lg shadow-blue-500/20">
                                Rapid Intake
                            </span>
                        </div>
                        <h2 className="text-3xl font-bold text-slate-900 tracking-tight leading-tight">Patient Registration</h2>
                        <p className="text-slate-400 text-sm font-medium mt-1">Initialize record for immediate procedure</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-y-auto scrollbar-hide pr-1">
                    <div className="space-y-8 pb-6">
                        {/* Primary Identity */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="group">
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3 ml-1 group-focus-within:text-blue-600 transition-colors">Full Name</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        name="fullName"
                                        value={formData.fullName}
                                        onChange={handleChange}
                                        placeholder="Legal Name"
                                        className="w-full h-14 bg-white/60 glass-surface px-6 rounded-2xl text-[16px] font-semibold text-slate-900 outline-none focus:bg-white focus:ring-4 focus:ring-blue-500/5 transition-all placeholder:text-slate-300"
                                    />
                                </div>
                            </div>

                            <div className="group">
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3 ml-1">Identity Age</label>
                                <input
                                    type="number"
                                    name="age"
                                    value={formData.age}
                                    onChange={handleChange}
                                    placeholder="00"
                                    className="w-full h-14 bg-white/60 glass-surface px-6 rounded-2xl text-[16px] font-semibold text-slate-900 outline-none focus:bg-white transition-all"
                                />
                            </div>
                        </div>

                        {/* Gender Tag Selector */}
                        <div className="group">
                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3 ml-1">Gender Specification</label>
                            <div className="flex gap-3">
                                {GENDER_OPTIONS.map((g) => (
                                    <button
                                        key={g}
                                        type="button"
                                        onClick={() => setFormData(prev => ({ ...prev, gender: g }))}
                                        className={`px-6 py-3.5 rounded-2xl text-xs font-bold transition-all border ${formData.gender === g
                                            ? 'bg-slate-900 text-white border-slate-900 shadow-xl'
                                            : 'bg-white/40 text-slate-400 border-white/50 hover:bg-white hover:text-slate-600'
                                            }`}
                                    >
                                        {g}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Contact & Comm */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="group">
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3 ml-1">Mobile Node</label>
                                <input
                                    type="tel"
                                    name="mobile"
                                    value={formData.mobile}
                                    onChange={handleChange}
                                    placeholder="00000 00000"
                                    maxLength={10}
                                    className="w-full h-14 bg-white/60 glass-surface px-6 rounded-2xl text-[16px] font-semibold text-slate-900 outline-none focus:bg-white transition-all"
                                />
                            </div>
                            <div className="group">
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3 ml-1">Email Interface</label>
                                <input
                                    type="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    placeholder="patient@domain.com"
                                    className="w-full h-14 bg-white/60 glass-surface px-6 rounded-2xl text-[16px] font-semibold text-slate-900 outline-none focus:bg-white transition-all"
                                />
                            </div>
                        </div>

                        {/* Location */}
                        <div className="group">
                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3 ml-1">Spatial Address</label>
                            <div className="relative">
                                <MapPin className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" size={18} />
                                <input
                                    type="text"
                                    name="address"
                                    value={formData.address}
                                    onChange={handleChange}
                                    placeholder="City, District, Province"
                                    className="w-full h-14 pl-14 pr-6 bg-white/60 glass-surface rounded-2xl text-[15px] font-semibold text-slate-900 outline-none focus:bg-white transition-all"
                                />
                            </div>
                        </div>

                        {/* Clinical Context */}
                        <div className="grid grid-cols-1 gap-8">
                            <div className="group">
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3 ml-1">Referring Physician</label>
                                <div className="relative">
                                    <Stethoscope className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" size={18} />
                                    <input
                                        type="text"
                                        name="referringDoctor"
                                        value={formData.referringDoctor}
                                        onChange={handleChange}
                                        placeholder="Dr. Specialist"
                                        className="w-full h-14 pl-14 pr-6 bg-white/60 glass-surface rounded-2xl text-[15px] font-semibold text-slate-900 outline-none focus:bg-white transition-all"
                                    />
                                </div>
                            </div>

                            <div className="group">
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3 ml-1">Clinical Notes / Allergies</label>
                                <div className="relative">
                                    <FileText className="absolute left-5 top-5 text-slate-300 pointer-events-none" size={18} />
                                    <textarea
                                        name="notes"
                                        value={formData.notes}
                                        onChange={handleChange}
                                        rows={3}
                                        placeholder="Clinical observations..."
                                        className="w-full p-6 pl-14 bg-white/60 glass-surface rounded-3xl text-[15px] font-semibold text-slate-900 outline-none focus:bg-white transition-all resize-none"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Launch Action */}
                    <div className="mt-8 pt-6 border-t border-white/40">
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full h-16 rounded-[2rem] bg-blue-600 text-white font-bold text-sm uppercase tracking-[0.2em] shadow-[0_20px_40px_rgba(37,99,235,0.25)] hover:shadow-[0_25px_50px_rgba(37,99,235,0.4)] hover:-translate-y-1 active:translate-y-0 active:scale-95 transition-all flex items-center justify-center gap-4 group disabled:opacity-50"
                        >
                            {isSubmitting ? (
                                <Loader2 className="w-6 h-6 animate-spin" />
                            ) : (
                                <>
                                    Complete & Launch Procedure
                                    <Zap size={20} fill="currentColor" className="text-white group-hover:scale-125 transition-transform" />
                                </>
                            )}
                        </button>
                    </div>

                    {/* Feedback Overlay */}
                    <AnimatePresence>
                        {error && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-rose-500 text-white px-8 py-4 rounded-[1.5rem] shadow-2xl text-xs font-bold uppercase tracking-widest z-[100] flex items-center gap-3 border-2 border-rose-300"
                            >
                                <AlertCircle size={16} strokeWidth={3} />
                                <span>{error}</span>
                                <button onClick={() => setError('')} className="ml-2 w-6 h-6 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center transition-colors">
                                    <X size={14} strokeWidth={3} />
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </form>
            </div>
        </div>
    );
}
