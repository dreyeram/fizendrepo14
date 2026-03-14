"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Search,
    User,
    ChevronRight,
    Loader2
} from "lucide-react";
import { format } from "date-fns";
import { searchPatients } from "@/app/actions/auth";

interface PatientsPanelProps {
    onViewPatient: (patient: any) => void;
    onNewPatient: () => void;
    searchQuery?: string;
}

export default function PatientsPanel({ onViewPatient, onNewPatient, searchQuery = '' }: PatientsPanelProps) {
    const [patients, setPatients] = useState<any[]>([]);
    const [filteredPatients, setFilteredPatients] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [sortOrder, setSortOrder] = useState<'recent' | 'az'>('recent');

    useEffect(() => {
        loadPatients();
    }, []);

    useEffect(() => {
        if (!searchQuery.trim()) {
            setFilteredPatients(patients);
        } else {
            const query = searchQuery.toLowerCase();
            const filtered = patients.filter(p =>
                (p.fullName || '').toLowerCase().includes(query) ||
                (p.mrn || '').toLowerCase().includes(query) ||
                (p.mobile || '').includes(query)
            );
            setFilteredPatients(filtered);
        }
    }, [searchQuery, patients]);

    const loadPatients = useCallback(async () => {
        setIsLoading(true);
        try {
            const result = await searchPatients('');
            if (result.success && result.patients) {
                setPatients(result.patients);
                setFilteredPatients(result.patients);
            }
        } catch (error) {
            console.error("Failed to load patients:", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const sortPatients = (order: 'recent' | 'az') => {
        setSortOrder(order);
        const sorted = [...filteredPatients].sort((a, b) => {
            if (order === 'recent') {
                return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
            } else {
                return (a.fullName || '').localeCompare(b.fullName || '');
            }
        });
        setFilteredPatients(sorted);
    };

    return (
        <div className="h-full flex flex-col bg-transparent">
            {/* Elegant Header */}
            <div className="px-6 py-6 glass-surface rounded-3xl mb-6 flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight italic uppercase">Patients</h2>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="inline-block w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.3)]" />
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                            {filteredPatients.length} Clinical Records
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex glass-surface rounded-2xl p-1 bg-white/10">
                        <button
                            onClick={() => sortPatients('recent')}
                            className={`px-4 py-2.5 text-xs font-bold rounded-xl transition-all ${sortOrder === 'recent'
                                ? 'bg-white text-blue-600 shadow-xl'
                                : 'text-slate-500/60 hover:text-slate-900'
                                }`}
                        >
                            Recent
                        </button>
                        <button
                            onClick={() => sortPatients('az')}
                            className={`px-4 py-2.5 text-xs font-bold rounded-xl transition-all ${sortOrder === 'az'
                                ? 'bg-white text-blue-600 shadow-xl'
                                : 'text-slate-500/60 hover:text-slate-900'
                                }`}
                        >
                            A-Z
                        </button>
                    </div>

                    <button
                        onClick={onNewPatient}
                        className="flex items-center gap-3 px-6 py-3 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-[0.15em] shadow-2xl shadow-slate-900/20 hover:shadow-slate-900/40 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 transition-all group"
                    >
                        <User size={16} />
                        Register Patient
                    </button>
                </div>
            </div>

            {/* Scrollable Canvas */}
            <div className="flex-1 overflow-y-auto pr-2 scrollbar-hide">
                <AnimatePresence mode="popLayout">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center h-full">
                            <Loader2 className="w-10 h-10 text-blue-500 animate-spin" strokeWidth={3} />
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {filteredPatients.map((patient) => (
                                <motion.div
                                    key={patient.id}
                                    layout
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    whileHover={{ y: -5 }}
                                    onClick={() => onViewPatient(patient)}
                                    className="group glass-surface p-6 rounded-[2.5rem] cursor-pointer relative overflow-hidden transition-all hover:bg-white/60"
                                >
                                    {/* Accent Glow */}
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-[40px] rounded-full group-hover:bg-blue-500/10 transition-colors" />

                                    <div className="flex flex-col h-full gap-6">
                                        <div className="flex items-start justify-between">
                                            <div className="w-14 h-14 rounded-3xl bg-blue-600/10 flex items-center justify-center text-blue-600 font-black text-xl shadow-inner-white">
                                                {(patient.fullName || 'U').charAt(0)}
                                            </div>
                                            <div className="glass-surface px-3 py-1.5 rounded-xl text-[10px] font-black text-slate-400 group-hover:text-blue-500 transition-colors uppercase tracking-widest bg-white/40">
                                                {patient.mrn}
                                            </div>
                                        </div>

                                        <div>
                                            <h3 className="text-xl font-bold text-slate-900 group-hover:text-blue-600 transition-colors tracking-tight">
                                                {patient.fullName}
                                            </h3>
                                            <div className="flex flex-wrap items-center gap-2 mt-3">
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{patient.gender}</span>
                                                <span className="text-slate-200">/</span>
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{patient.age}Y</span>
                                                {patient.mobile && (
                                                    <>
                                                        <span className="text-slate-200">/</span>
                                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{patient.mobile}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        <div className="mt-auto pt-6 border-t border-white/40 flex items-center justify-between">
                                            <div className="flex flex-col">
                                                <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest">History</span>
                                                <span className="text-xs font-bold text-slate-600">
                                                    {patient.procedures?.length || 0} Procedures
                                                </span>
                                            </div>
                                            <div className="p-3 rounded-2xl bg-white/50 text-slate-400 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm">
                                                <ChevronRight size={16} strokeWidth={3} />
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}

                            {filteredPatients.length === 0 && (
                                <div className="col-span-full h-full flex flex-col items-center justify-center py-32 glass-surface rounded-[4rem]">
                                    <p className="text-lg font-bold text-slate-400 italic">No clinical matches found</p>
                                    <button onClick={onNewPatient} className="mt-4 px-6 py-2 rounded-full border border-blue-200 text-blue-600 font-bold hover:bg-blue-50 transition-all active:scale-95">
                                        Register Record
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
