"use client";

import React, { useState, useEffect } from "react";
import { AlertTriangle, Trash2, X, AlertCircle, Lock, KeyRound, Check, Undo2, RefreshCw, Eye } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
    verifyDangerZonePin,
    hasDangerZonePin,
    softDeleteMultiplePatients,
    getTrashedPatients,
    restorePatient,
    permanentDeletePatient
} from "@/app/actions/settings";
import { searchPatients } from "@/app/actions/auth";
import { useConfirm } from "@/lib/hooks/useConfirm";
import { useNotify } from "@/lib/store/ui.store";

interface Patient {
    id: string;
    fullName: string;
    mrn: string;
    procedures?: any[];
    deletedAt?: Date | null;
}

interface DangerZoneProps {
    userId: string;
    onNavigateToProfile?: () => void;
    onRefresh?: () => void;
}

type DangerView = 'locked' | 'patients' | 'trash';

export default function DangerZone({ userId, onNavigateToProfile, onRefresh }: DangerZoneProps) {
    const [view, setView] = useState<DangerView>('locked');
    const [pin, setPin] = useState('');
    const [pinError, setPinError] = useState('');
    const [hasPin, setHasPin] = useState<boolean | null>(null);
    const [isVerifying, setIsVerifying] = useState(false);

    // Patient selection
    const [patients, setPatients] = useState<Patient[]>([]);
    const [trashedPatients, setTrashedPatients] = useState<Patient[]>([]);
    const [selectedPatients, setSelectedPatients] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const confirm = useConfirm();
    const notify = useNotify();

    useEffect(() => {
        checkPinStatus();
    }, [userId]);

    const checkPinStatus = async () => {
        const result = await hasDangerZonePin(userId);
        setHasPin(result.hasPin);
    };

    const handleVerifyPin = async () => {
        if (pin.length < 4) {
            setPinError('PIN must be at least 4 digits');
            return;
        }

        setIsVerifying(true);
        setPinError('');

        const result = await verifyDangerZonePin(userId, pin);

        if (result.success) {
            setView('patients');
            loadPatients();
            loadTrashedPatients();
        } else {
            setPinError(result.error || 'Incorrect PIN');
        }

        setIsVerifying(false);
    };

    const loadPatients = async () => {
        setIsLoading(true);
        try {
            const result = await searchPatients("");
            if (result.success && result.patients) {
                // Filter out already deleted patients
                const activePatients = result.patients.filter((p: any) => !p.deletedAt);
                setPatients(activePatients.map((p: any) => ({
                    id: p.id,
                    fullName: p.fullName,
                    mrn: p.mrn,
                    procedures: p.procedures
                })));
            } else {
                setPatients([]);
            }
        } catch (e) {
            console.error("Failed to load patients", e);
        }
        setIsLoading(false);
    };

    const loadTrashedPatients = async () => {
        const result = await getTrashedPatients();
        if (result.success && result.patients) {
            setTrashedPatients(result.patients.map((p: any) => ({
                id: p.id,
                fullName: p.fullName,
                mrn: p.mrn,
                procedures: p.procedures,
                deletedAt: p.deletedAt
            })));
        }
    };

    const togglePatient = (id: string) => {
        const newSet = new Set(selectedPatients);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedPatients(newSet);
    };

    const handleMoveToTrash = async () => {
        if (selectedPatients.size === 0) return;

        setIsDeleting(true);
        const result = await softDeleteMultiplePatients(Array.from(selectedPatients));

        if (result.success) {
            setSelectedPatients(new Set());
            loadPatients();
            loadTrashedPatients();
            onRefresh?.();
            notify.success("Patients Trashed", `Successfully moved ${selectedPatients.size} patient(s) to trash.`);
        } else {
            notify.error("Delete Failed", result.error || "Failed to move patients to trash.");
        }
        setIsDeleting(false);
    };

    const handleRestore = async (patientId: string) => {
        const result = await restorePatient(patientId);
        if (result.success) {
            loadPatients();
            loadTrashedPatients();
            onRefresh?.();
            notify.success("Patient Restored", "The patient record has been restored to active status.");
        } else {
            notify.error("Restore Failed", result.error || "Failed to restore patient record.");
        }
    };

    const handlePermanentDelete = async (patientId: string) => {
        const ok = await confirm({
            title: "Permanent Deletion",
            message: "This will PERMANENTLY delete this patient and ALL their data. This cannot be undone.",
            confirmLabel: "Delete Forever",
            variant: "danger"
        });
        
        if (!ok) return;

        const result = await permanentDeletePatient(patientId);
        if (result.success) {
            loadTrashedPatients();
            onRefresh?.();
            notify.success("Patient Deleted", "The patient and all associated data have been permanently removed.");
        } else {
            notify.error("Delete Failed", result.error || "Failed to permanently delete patient.");
        }
    };

    // ========== LOCKED VIEW (PIN PROMPT) ==========
    if (view === 'locked') {
        return (
            <div className="max-w-md mx-auto mt-12">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden"
                >
                    {/* Header */}
                    <div className="p-6 bg-gradient-to-r from-rose-500 to-red-600 text-white text-center">
                        <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                            <Lock size={32} />
                        </div>
                        <h2 className="text-xl font-black">Danger Zone</h2>
                        <p className="text-rose-100 text-sm font-medium mt-1">Protected Area</p>
                    </div>

                    {/* Content */}
                    <div className="p-6">
                        {hasPin === false ? (
                            // No PIN set
                            <div className="text-center">
                                <AlertCircle size={48} className="text-amber-500 mx-auto mb-4" />
                                <h3 className="font-bold text-slate-900 mb-2">No PIN Set</h3>
                                <p className="text-sm text-slate-500 mb-6">
                                    You need to set a Danger Zone PIN in your profile before accessing this area.
                                </p>
                                <button
                                    onClick={onNavigateToProfile}
                                    className="w-full py-3 px-4 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors"
                                >
                                    Go to Profile Settings
                                </button>
                            </div>
                        ) : (
                            // PIN entry form
                            <>
                                <p className="text-sm text-slate-500 text-center mb-6">
                                    Enter your Danger Zone PIN to access patient deletion features.
                                </p>

                                <div className="mb-4">
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                                        <KeyRound size={12} className="inline mr-1" />
                                        Enter PIN
                                    </label>
                                    <input
                                        type="password"
                                        value={pin}
                                        onChange={e => {
                                            setPin(e.target.value.replace(/\D/g, '').slice(0, 6));
                                            setPinError('');
                                        }}
                                        onKeyDown={e => e.key === 'Enter' && handleVerifyPin()}
                                        placeholder="• • • • • •"
                                        className="w-full text-center text-2xl tracking-[0.5em] font-mono bg-slate-50 border border-slate-200 rounded-xl p-4 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
                                        maxLength={6}
                                    />
                                    {pinError && (
                                        <p className="text-rose-500 text-xs font-semibold mt-2 text-center">{pinError}</p>
                                    )}
                                </div>

                                <button
                                    onClick={handleVerifyPin}
                                    disabled={isVerifying || pin.length < 4}
                                    className="w-full py-3 px-4 bg-gradient-to-r from-rose-500 to-red-600 text-white font-bold rounded-xl shadow-lg shadow-rose-500/25 hover:shadow-rose-500/40 transition-all disabled:opacity-50"
                                >
                                    {isVerifying ? 'Verifying...' : 'Unlock Danger Zone'}
                                </button>
                            </>
                        )}
                    </div>
                </motion.div>
            </div>
        );
    }

    // ========== UNLOCKED VIEW (PATIENT LIST + TRASH) ==========
    return (
        <div className="max-w-3xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-black text-slate-900">Danger Zone</h1>
                    <p className="text-slate-500 font-medium">Select patients to move to trash</p>
                </div>
                <button
                    onClick={() => { setView('locked'); setPin(''); }}
                    className="px-4 py-2 bg-slate-100 text-slate-600 font-bold text-sm rounded-xl hover:bg-slate-200 transition-colors flex items-center gap-2"
                >
                    <Lock size={16} /> Lock
                </button>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-2 mb-6">
                <button
                    onClick={() => setView('patients')}
                    className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${view === 'patients'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                >
                    Active Patients ({patients.length})
                </button>
                <button
                    onClick={() => setView('trash')}
                    className={`px-4 py-2 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${view === 'trash'
                        ? 'bg-rose-500 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                >
                    <Trash2 size={14} /> Trash ({trashedPatients.length})
                </button>
                <button
                    onClick={() => { loadPatients(); loadTrashedPatients(); }}
                    className="ml-auto p-2 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
                >
                    <RefreshCw size={16} />
                </button>
            </div>

            {/* ======= ACTIVE PATIENTS VIEW ======= */}
            {view === 'patients' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    {isLoading ? (
                        <div className="text-center py-12 text-slate-400">Loading patients...</div>
                    ) : patients.length === 0 ? (
                        <div className="text-center py-12 text-slate-400">No active patients</div>
                    ) : (
                        <>
                            {/* Selection Actions */}
                            <div className="mb-4 flex items-center justify-between">
                                <p className="text-sm text-slate-500">
                                    {selectedPatients.size > 0
                                        ? `${selectedPatients.size} patient(s) selected`
                                        : 'Select patients to delete'}
                                </p>
                                {selectedPatients.size > 0 && (
                                    <button
                                        onClick={handleMoveToTrash}
                                        disabled={isDeleting}
                                        className="px-4 py-2 bg-rose-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-rose-500/25 hover:shadow-rose-500/40 transition-all flex items-center gap-2 disabled:opacity-50"
                                    >
                                        <Trash2 size={16} />
                                        {isDeleting ? 'Moving...' : 'Move to Trash'}
                                    </button>
                                )}
                            </div>

                            {/* Patient List */}
                            <div className="space-y-2">
                                {patients.map(patient => (
                                    <div
                                        key={patient.id}
                                        onClick={() => togglePatient(patient.id)}
                                        className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all ${selectedPatients.has(patient.id)
                                            ? 'bg-rose-50 border-rose-200'
                                            : 'bg-white border-slate-200 hover:border-slate-300'
                                            }`}
                                    >
                                        <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${selectedPatients.has(patient.id)
                                            ? 'bg-rose-500 border-rose-500 text-white'
                                            : 'border-slate-300'
                                            }`}>
                                            {selectedPatients.has(patient.id) && <Check size={14} />}
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="font-bold text-slate-900">{patient.fullName}</h3>
                                            <p className="text-xs text-slate-400">MRN: {patient.mrn}</p>
                                        </div>
                                        <div className="text-xs text-slate-400">
                                            {patient.procedures?.length || 0} procedures
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </motion.div>
            )}

            {/* ======= TRASH VIEW ======= */}
            {view === 'trash' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    {trashedPatients.length === 0 ? (
                        <div className="text-center py-12">
                            <Trash2 size={48} className="text-slate-300 mx-auto mb-4" />
                            <p className="text-slate-400">Trash is empty</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {trashedPatients.map(patient => (
                                <div
                                    key={patient.id}
                                    className="flex items-center gap-4 p-4 rounded-xl border border-slate-200 bg-white"
                                >
                                    <div className="w-10 h-10 rounded-lg bg-rose-100 flex items-center justify-center text-rose-500">
                                        <Trash2 size={20} />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="font-bold text-slate-900">{patient.fullName}</h3>
                                        <p className="text-xs text-slate-400">MRN: {patient.mrn}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handleRestore(patient.id)}
                                            className="px-3 py-1.5 bg-emerald-100 text-emerald-700 font-bold text-xs rounded-lg hover:bg-emerald-200 transition-colors flex items-center gap-1"
                                        >
                                            <Undo2 size={12} /> Restore
                                        </button>
                                        <button
                                            onClick={() => handlePermanentDelete(patient.id)}
                                            className="px-3 py-1.5 bg-rose-100 text-rose-600 font-bold text-xs rounded-lg hover:bg-rose-200 transition-colors flex items-center gap-1"
                                        >
                                            <X size={12} /> Delete Forever
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="mt-6 p-4 bg-amber-50 rounded-xl border border-amber-100">
                        <div className="flex items-start gap-3">
                            <AlertCircle size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
                            <p className="text-sm text-amber-700">
                                <span className="font-bold">Note:</span> Items in trash can be restored. Clicking "Delete Forever" will permanently remove all data including procedures, images, and reports.
                            </p>
                        </div>
                    </div>
                </motion.div>
            )}
        </div>
    );
}
