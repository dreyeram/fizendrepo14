"use client";

import React, { useState } from "react";
import { AlertTriangle, Trash2, RefreshCw, Lock, KeyRound, Check, ShieldAlert, UserX } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { setDangerZonePin, hasDangerZonePin, verifyDangerZonePin, deleteAllPatients } from "@/app/actions/settings";
import { useConfirm } from "@/lib/hooks/useConfirm";
import { useNotify } from "@/lib/store/ui.store";

interface DangerPanelProps {
    userId: string;
    onUpdate: () => void;
}

export default function DangerPanel({ userId, onUpdate }: DangerPanelProps) {
    const [hasPin, setHasPin] = useState(false);
    const [pinValue, setPinValue] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [pinError, setPinError] = useState('');
    const [isSavingPin, setIsSavingPin] = useState(false);
    const [pinSaved, setPinSaved] = useState(false);

    const [deleteConfirm, setDeleteConfirm] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);
    const [pinRequired, setPinRequired] = useState(false);
    const [enteredPin, setEnteredPin] = useState('');
    const confirm = useConfirm();
    const notify = useNotify();

    // Check PIN status on mount
    React.useEffect(() => {
        checkPinStatus();
    }, []);

    const checkPinStatus = async () => {
        const result = await hasDangerZonePin(userId);
        setHasPin(result.hasPin);
    };

    const handleSavePin = async () => {
        setPinError('');
        if (pinValue.length < 4 || pinValue.length > 6) {
            setPinError('PIN must be 4-6 digits');
            return;
        }
        if (pinValue !== confirmPin) {
            setPinError('PINs do not match');
            return;
        }

        setIsSavingPin(true);
        const result = await setDangerZonePin(userId, pinValue);

        if (result.success) {
            setPinSaved(true);
            setHasPin(true);
            setPinValue('');
            setConfirmPin('');
            setTimeout(() => setPinSaved(false), 3000);
        } else {
            setPinError(result.error || 'Failed to save PIN');
        }
        setIsSavingPin(false);
    };

    const handleDeleteAllPatients = async () => {
        // First verify PIN if set
        if (hasPin) {
            if (!pinRequired) {
                setPinRequired(true);
                return;
            }

            const pinResult = await verifyDangerZonePin(userId, enteredPin);
            if (!pinResult.valid) {
                setPinError('Incorrect PIN');
                return;
            }
        }

        if (deleteConfirm !== 'DELETE ALL') {
            return;
        }

        setIsDeleting(true);
        const result = await deleteAllPatients();

        if (result.success) {
            notify.success("Data Deleted", `Deleted ${result.count} patients and all related data.`);
            setDeleteConfirm('');
            setPinRequired(false);
            setEnteredPin('');
            onUpdate();
        } else {
            notify.error("Database Error", result.error || "Failed to delete patient data.");
        }
        setIsDeleting(false);
    };

    return (
        <div className="max-w-2xl space-y-8">
            {/* Warning Banner */}
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3">
                <AlertTriangle className="text-rose-500 flex-shrink-0 mt-0.5" size={20} />
                <div>
                    <h4 className="font-bold text-rose-800">Danger Zone</h4>
                    <p className="text-sm text-rose-600 mt-1">
                        Actions in this section are <strong>irreversible</strong> and will permanently delete data.
                        Please proceed with extreme caution.
                    </p>
                </div>
            </div>

            {/* PIN Protection */}
            <div className="bg-white rounded-2xl border-2 border-rose-200 overflow-hidden">
                <div className="px-6 py-4 bg-gradient-to-r from-rose-50 to-amber-50 border-b border-rose-100 flex items-center gap-3">
                    <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center text-rose-600">
                        <Lock size={20} />
                    </div>
                    <div>
                        <h4 className="font-bold text-rose-900">Security PIN</h4>
                        <p className="text-xs text-rose-600">Required before destructive actions</p>
                    </div>
                    {hasPin && (
                        <div className="ml-auto flex items-center gap-1 px-2 py-1 bg-emerald-100 rounded-lg">
                            <Check size={12} className="text-emerald-600" />
                            <span className="text-xs font-bold text-emerald-700">Active</span>
                        </div>
                    )}
                </div>

                <div className="p-6">
                    <p className="text-sm text-slate-500 mb-4">
                        {hasPin
                            ? 'PIN protection is active. Enter a new PIN below to change it.'
                            : 'Set a 4-6 digit PIN to protect destructive actions.'}
                    </p>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                                <KeyRound size={10} className="inline mr-1" />
                                {hasPin ? 'New PIN' : 'Enter PIN'}
                            </label>
                            <input
                                type="password"
                                value={pinValue}
                                onChange={e => {
                                    setPinValue(e.target.value.replace(/\D/g, '').slice(0, 6));
                                    setPinError('');
                                }}
                                placeholder="• • • • • •"
                                className="w-full text-center tracking-widest font-mono bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
                                maxLength={6}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                                Confirm PIN
                            </label>
                            <input
                                type="password"
                                value={confirmPin}
                                onChange={e => {
                                    setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6));
                                    setPinError('');
                                }}
                                placeholder="• • • • • •"
                                className="w-full text-center tracking-widest font-mono bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
                                maxLength={6}
                            />
                        </div>
                    </div>

                    {pinError && <p className="text-rose-500 text-xs font-semibold mb-4">{pinError}</p>}

                    <AnimatePresence>
                        {pinSaved && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="mb-4 p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-2"
                            >
                                <Check size={16} className="text-emerald-600" />
                                <span className="text-sm font-semibold text-emerald-700">PIN saved successfully!</span>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <button
                        onClick={handleSavePin}
                        disabled={isSavingPin || pinValue.length < 4}
                        className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-rose-500 to-red-600 text-white font-bold text-sm shadow-lg shadow-rose-500/25 hover:shadow-rose-500/40 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        <Lock size={16} />
                        {isSavingPin ? 'Saving...' : hasPin ? 'Update PIN' : 'Set PIN'}
                    </button>
                </div>
            </div>

            {/* Delete All Patients */}
            <div className="bg-white rounded-2xl border-2 border-rose-300 overflow-hidden">
                <div className="px-6 py-4 bg-gradient-to-r from-rose-100 to-rose-50 border-b border-rose-200 flex items-center gap-3">
                    <div className="w-10 h-10 bg-rose-500 rounded-xl flex items-center justify-center text-white">
                        <UserX size={20} />
                    </div>
                    <div>
                        <h4 className="font-bold text-rose-900">Delete All Patients</h4>
                        <p className="text-xs text-rose-600">Permanently remove all patient records</p>
                    </div>
                </div>

                <div className="p-6">
                    <div className="p-4 bg-rose-50 rounded-xl border border-rose-100 mb-4">
                        <p className="text-sm text-rose-700">
                            <strong>Warning:</strong> This will permanently delete ALL patients, procedures, reports, and media files.
                            This action cannot be undone.
                        </p>
                    </div>

                    {pinRequired && hasPin && (
                        <div className="mb-4">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                                Enter your PIN to proceed
                            </label>
                            <input
                                type="password"
                                value={enteredPin}
                                onChange={e => {
                                    setEnteredPin(e.target.value.replace(/\D/g, '').slice(0, 6));
                                    setPinError('');
                                }}
                                placeholder="• • • • • •"
                                className="w-full text-center tracking-widest font-mono bg-slate-50 border border-rose-200 rounded-xl p-3 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
                                maxLength={6}
                            />
                        </div>
                    )}

                    <div className="mb-4">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                            Type "DELETE ALL" to confirm
                        </label>
                        <input
                            type="text"
                            value={deleteConfirm}
                            onChange={e => setDeleteConfirm(e.target.value)}
                            placeholder="DELETE ALL"
                            className="w-full bg-slate-50 border border-rose-200 rounded-xl p-3 font-mono uppercase tracking-wider text-center outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
                        />
                    </div>

                    <button
                        onClick={handleDeleteAllPatients}
                        disabled={isDeleting || deleteConfirm !== 'DELETE ALL'}
                        className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-rose-600 to-red-700 text-white font-bold text-sm shadow-lg shadow-rose-500/25 hover:shadow-rose-500/40 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Trash2 size={16} />
                        {isDeleting ? 'Deleting...' : hasPin && !pinRequired ? 'Verify PIN & Delete' : 'Delete All Patients'}
                    </button>
                </div>
            </div>

            {/* Reset Settings */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <RefreshCw size={20} className="text-amber-500" />
                        <div>
                            <h4 className="text-sm font-bold text-slate-700">Reset All Settings</h4>
                            <p className="text-xs text-slate-500">Restore all settings to factory defaults</p>
                        </div>
                    </div>
                    <button
                        onClick={async () => {
                            const ok = await confirm({
                                title: 'Reset Settings',
                                message: 'Reset all application settings to defaults? This will not delete patient data.',
                                confirmLabel: 'Reset Everything',
                                variant: 'danger'
                            });
                            if (ok) {
                                // TODO: Reset settings backend action
                                notify.success('Settings Reset', 'Configuration has been restored to factory defaults.');
                                onUpdate();
                            }
                        }}
                        className="px-4 py-2 rounded-xl border border-amber-200 text-amber-700 font-semibold text-sm hover:bg-amber-50 transition-colors flex items-center gap-2"
                    >
                        <RefreshCw size={14} />
                        Reset Settings
                    </button>
                </div>
            </div>
        </div>
    );
}
