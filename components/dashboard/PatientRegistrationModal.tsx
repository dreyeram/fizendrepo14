'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, User, Phone, Mail, Calendar, MapPin, Loader2, Check, UserPlus } from 'lucide-react';
import { createPatient } from '@/app/actions/auth';

interface PatientRegistrationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: (patient: any, procedureType?: string) => void;
}

export function PatientRegistrationModal({ isOpen, onClose, onSuccess }: PatientRegistrationModalProps) {
    // Form fields
    const [fullName, setFullName] = useState('');
    const [age, setAge] = useState('');
    const [gender, setGender] = useState<'Male' | 'Female' | 'Other'>('Male');
    const [mobile, setMobile] = useState('');
    const [email, setEmail] = useState('');
    const [address, setAddress] = useState('');
    const [refId, setRefId] = useState('');

    // State
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async () => {
        const name = fullName.trim();
        if (!name) {
            setError('Patient name is required');
            return;
        }
        if (name.length < 4) {
            setError('Name must be at least 4 characters');
            return;
        }
        if (!/^[a-zA-Z\s]+$/.test(name)) {
            setError('Name can only contain letters, spaces');
            return;
        }

        if (age) {
            const ageNum = parseInt(age, 10);
            if (isNaN(ageNum)) {
                setError('Valid age required');
                return;
            }
            if (ageNum < 0) {
                setError('Age cannot be negative');
                return;
            }
            if (ageNum > 150) {
                setError('Age must be realistic');
                return;
            }
        }

        if (!mobile.trim()) {
            setError('Mobile number is required');
            return;
        }

        setIsSubmitting(true);
        setError('');

        try {
            const result = await createPatient({
                fullName: fullName.trim(),
                age: age ? parseInt(age, 10) : undefined,
                gender,
                mobile: mobile.trim(),
                email: email.trim() || undefined,
                address: address.trim() || undefined,
                refId: refId.trim() || undefined
            });

            if (result.success && result.patient) {
                const patient = {
                    id: result.patient.id,
                    fullName: result.patient.fullName,
                    mrn: result.patient.mrn || '',
                    age: age ? parseInt(age, 10) : undefined,
                    gender,
                    mobile: mobile.trim(),
                    email: email.trim() || undefined,
                    refId: refId.trim() || undefined
                };

                // Reset form
                setFullName('');
                setAge('');
                setGender('Male');
                setMobile('');
                setEmail('');
                setAddress('');
                setRefId('');

                onSuccess?.(patient, undefined);
            } else {
                setError(result.error || 'Failed to create patient');
            }
        } catch (err) {
            setError('An unexpected error occurred');
        } finally {
            setIsSubmitting(false);
        }
    };

    const resetAndClose = () => {
        setFullName('');
        setAge('');
        setGender('Male');
        setMobile('');
        setEmail('');
        setAddress('');
        setRefId('');
        setError('');
        onClose();
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
                    onClick={resetAndClose}
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 20 }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden"
                    >
                        {/* Header */}
                        <div className="p-5 bg-gradient-to-r from-blue-600 to-indigo-700">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                                        <UserPlus className="w-5 h-5 text-white" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold text-white">Register New Patient</h2>
                                        <p className="text-blue-100 text-sm">
                                            Patient Details
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={resetAndClose}
                                    className="p-2 hover:bg-white/10 rounded-lg text-white transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="p-6 max-h-[60vh] overflow-y-auto">
                            {error && (
                                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                                    {error}
                                </div>
                            )}

                            <div className="space-y-4">
                                {/* Full Name */}
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                                        Full Name <span className="text-red-500">*</span>
                                    </label>
                                    <div className="relative">
                                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <input
                                            type="text"
                                            value={fullName}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                if (val === '' || /^[a-zA-Z\s]+$/.test(val)) setFullName(val);
                                            }}
                                            placeholder="Enter patient's full name"
                                            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                        />
                                    </div>
                                </div>

                                {/* Age & Gender */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                                            Age
                                        </label>
                                        <div className="relative">
                                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                            <input
                                                type="number"
                                                value={age}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (val === '') {
                                                        setAge(val);
                                                        return;
                                                    }
                                                    const num = parseInt(val, 10);
                                                    if (!isNaN(num) && num >= 0 && num <= 150) {
                                                        setAge(val);
                                                    }
                                                }}
                                                placeholder="Age"
                                                min="0"
                                                max="150"
                                                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                                            Gender
                                        </label>
                                        <select
                                            value={gender}
                                            onChange={(e) => setGender(e.target.value as any)}
                                            className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all bg-white"
                                        >
                                            <option value="Male">Male</option>
                                            <option value="Female">Female</option>
                                            <option value="Other">Other</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Mobile */}
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                                        Mobile Number <span className="text-red-500">*</span>
                                    </label>
                                    <div className="relative">
                                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <input
                                            type="tel"
                                            value={mobile}
                                            onChange={(e) => setMobile(e.target.value)}
                                            placeholder="10-digit mobile number"
                                            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                        />
                                    </div>
                                </div>

                                {/* Email */}
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                                        Email (Optional)
                                    </label>
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            placeholder="patient@example.com"
                                            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                        />
                                    </div>
                                </div>

                                {/* Address */}
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                                        Address (Optional)
                                    </label>
                                    <div className="relative">
                                        <MapPin className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                                        <textarea
                                            value={address}
                                            onChange={(e) => setAddress(e.target.value)}
                                            placeholder="Patient address"
                                            rows={2}
                                            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all resize-none"
                                        />
                                    </div>
                                </div>

                                {/* ABHA ID */}
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                                        ABHA ID <span className="text-slate-400 font-normal">(Optional)</span>
                                    </label>
                                    <div className="relative">
                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center text-slate-400">
                                            <span className="text-xs font-bold">#</span>
                                        </div>
                                        <input
                                            type="text"
                                            value={refId}
                                            onChange={(e) => setRefId(e.target.value.toUpperCase())}
                                            placeholder="Eg. 12-3456-7890-1234"
                                            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-5 border-t border-slate-100 bg-slate-50 flex gap-3">
                            <button
                                onClick={resetAndClose}
                                className="flex-1 py-2.5 rounded-xl border border-slate-200 font-semibold text-sm text-slate-600 hover:bg-white transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={isSubmitting}
                                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 size={16} className="animate-spin" />
                                        Registering...
                                    </>
                                ) : (
                                    <>
                                        <Check size={16} />
                                        Register Patient
                                    </>
                                )}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

export default PatientRegistrationModal;
