"use client";

import React, { useState, useRef } from "react";
import { User, Mail, Phone, Camera, Save, Upload, Trash2, Briefcase, Check, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { updateUserProfile } from "@/app/actions/settings";
import USBFilePicker from "@/components/ui/USBFilePicker";

interface UserData {
    id: string;
    fullName: string;
    username: string;
    role: string;
    contactDetails?: string;
    signaturePath?: string;
}

interface ProfilePanelProps {
    user: UserData;
    onUpdate: () => void;
    onUnsavedChange: (hasChanges: boolean) => void;
}

export default function ProfilePanel({ user, onUpdate, onUnsavedChange }: ProfilePanelProps) {
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [isSignaturePickerOpen, setIsSignaturePickerOpen] = useState(false);

    const contactInfo = user.contactDetails ? JSON.parse(user.contactDetails) : {};
    const [signaturePreview, setSignaturePreview] = useState<string | null>(user.signaturePath || null);

    const [formData, setFormData] = useState({
        fullName: user.fullName,
        email: contactInfo.email || '',
        phone: contactInfo.phone || '',
        specialty: contactInfo.specialty || '',
        cameraResolution: contactInfo.cameraResolution || '1080p',
        printQuality: contactInfo.printQuality || 'Medium',
    });

    // Track initial values for change detection
    const initialData = {
        fullName: user.fullName,
        email: contactInfo.email || '',
        phone: contactInfo.phone || '',
        specialty: contactInfo.specialty || '',
        cameraResolution: contactInfo.cameraResolution || '1080p',
        printQuality: contactInfo.printQuality || 'Medium',
        signature: user.signaturePath || null,
    };

    const hasChanges = () => {
        return formData.fullName !== initialData.fullName ||
            formData.email !== initialData.email ||
            formData.phone !== initialData.phone ||
            formData.specialty !== initialData.specialty ||
            formData.cameraResolution !== initialData.cameraResolution ||
            formData.printQuality !== initialData.printQuality ||
            signaturePreview !== initialData.signature;
    };

    const handleChange = (field: string, value: string) => {
        setFormData((prev: any) => ({ ...prev, [field]: value }));
        onUnsavedChange(true);
    };

    const handleSave = async () => {
        setIsSaving(true);
        setSaveError('');
        setSaveSuccess(false);

        try {
            const result = await updateUserProfile({
                userId: user.id,
                fullName: formData.fullName,
                contactDetails: JSON.stringify({
                    email: formData.email,
                    phone: formData.phone,
                    specialty: formData.specialty,
                    cameraResolution: formData.cameraResolution,
                    printQuality: formData.printQuality,
                }),
                signaturePath: signaturePreview || undefined,
            });

            if (result.success) {
                setSaveSuccess(true);
                onUnsavedChange(false);
                onUpdate();
                setTimeout(() => setSaveSuccess(false), 3000);
            } else {
                setSaveError(result.error || 'Failed to save');
            }
        } catch (error) {
            console.error(error);
            setSaveError('Error saving profile');
        } finally {
            setIsSaving(false);
        }
    };

    const handleSignatureSelected = (files: File[]) => {
        const file = files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setSignaturePreview(reader.result as string);
                onUnsavedChange(true);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleRemoveSignature = () => {
        setSignaturePreview(null);
        onUnsavedChange(true);
    };

    return (
        <div className="max-w-2xl space-y-8">
            {/* Avatar Card */}
            <div className="flex items-center gap-6 p-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl border border-blue-100">
                <div className="relative group">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white text-3xl font-black shadow-lg shadow-blue-500/20">
                        {formData.fullName.charAt(0)}
                    </div>
                    <button className="absolute -bottom-1 -right-1 w-7 h-7 bg-white rounded-full shadow-md flex items-center justify-center text-slate-500 hover:text-blue-600 transition-colors border border-slate-200">
                        <Camera size={14} />
                    </button>
                </div>
                <div>
                    <h3 className="text-xl font-black text-slate-900">{formData.fullName}</h3>
                    <p className="text-sm text-slate-500 font-medium">@{user.username}</p>
                    <div className="mt-2 flex items-center gap-2">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${user.role === 'DOCTOR' ? 'bg-blue-100 text-blue-700' :
                            user.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' :
                                'bg-emerald-100 text-emerald-700'
                            }`}>
                            {user.role}
                        </span>
                    </div>
                </div>
            </div>

            {/* Form Section */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
                    <h4 className="text-sm font-bold text-slate-700">Personal Information</h4>
                </div>

                <div className="p-6 space-y-5">
                    {/* Full Name */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                            Full Name
                        </label>
                        <div className="relative">
                            <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={formData.fullName}
                                onChange={e => handleChange('fullName', e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-12 pr-4 py-3 font-semibold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                                placeholder="Dr. John Doe"
                            />
                        </div>
                    </div>

                    {/* Email */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                            Email Address
                        </label>
                        <div className="relative">
                            <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="email"
                                value={formData.email}
                                onChange={e => handleChange('email', e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-12 pr-4 py-3 font-semibold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                                placeholder="doctor@clinic.com"
                            />
                        </div>
                    </div>

                    {/* Phone */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                            Phone Number
                        </label>
                        <div className="relative">
                            <Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="tel"
                                value={formData.phone}
                                onChange={e => handleChange('phone', e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-12 pr-4 py-3 font-semibold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                                placeholder="+91 98765 43210"
                            />
                        </div>
                    </div>

                    {/* Specialty (Doctors only) */}
                    {user.role === 'DOCTOR' && (
                        <div className="space-y-5">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                                    Specialty
                                </label>
                                <div className="relative">
                                    <Briefcase size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        value={formData.specialty}
                                        onChange={e => handleChange('specialty', e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-12 pr-4 py-3 font-semibold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                                        placeholder="ENT Surgeon"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                                        Camera Frame Resolution
                                    </label>
                                    <div className="relative">
                                        <Camera size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <select
                                            value={formData.cameraResolution}
                                            onChange={e => handleChange('cameraResolution', e.target.value)}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-12 pr-4 py-3 font-semibold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all appearance-none"
                                        >
                                            <option value="720p">720p (Fastest)</option>
                                            <option value="1080p">1080p (Standard)</option>
                                            <option value="4K">4K (High Precision)</option>
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                                        Image Print Quality
                                    </label>
                                    <div className="relative">
                                        <Camera size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <select
                                            value={formData.printQuality}
                                            onChange={e => handleChange('printQuality', e.target.value)}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-12 pr-4 py-3 font-semibold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all appearance-none"
                                        >
                                            <option value="Low">Low</option>
                                            <option value="Medium">Medium</option>
                                            <option value="High">High</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Signature Section (Doctors only) */}
            {user.role === 'DOCTOR' && (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
                        <h4 className="text-sm font-bold text-slate-700">Digital Signature</h4>
                        <p className="text-xs text-slate-500 mt-0.5">Used on medical reports and documents</p>
                    </div>

                    <div className="p-6">
                        <div className="flex items-center gap-6">
                            {/* Preview */}
                            <div className="relative w-48 h-24 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center overflow-hidden">
                                {signaturePreview ? (
                                    <>
                                        <img src={signaturePreview} alt="Signature" className="max-w-full max-h-full object-contain p-2" />
                                        <button
                                            onClick={handleRemoveSignature}
                                            className="absolute top-2 right-2 p-1.5 bg-rose-500 text-white rounded-full hover:bg-rose-600 transition-colors shadow-lg"
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    </>
                                ) : (
                                    <span className="text-slate-400 text-xs">No signature uploaded</span>
                                )}
                            </div>

                            {/* Upload */}
                            <div>
                                <button
                                    type="button"
                                    onClick={() => setIsSignaturePickerOpen(true)}
                                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl font-semibold text-sm text-slate-700 cursor-pointer transition-colors"
                                >
                                    <Upload size={16} />
                                    Upload Signature
                                </button>
                                <p className="text-[10px] text-slate-400 mt-2">PNG/JPG, transparent background recommended</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-4">
                <div>
                    <AnimatePresence>
                        {saveSuccess && (
                            <motion.div
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                className="flex items-center gap-2 text-emerald-600"
                            >
                                <Check size={18} />
                                <span className="text-sm font-semibold">Changes saved!</span>
                            </motion.div>
                        )}
                        {saveError && (
                            <motion.div
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                className="flex items-center gap-2 text-rose-600"
                            >
                                <AlertCircle size={18} />
                                <span className="text-sm font-semibold">{saveError}</span>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <button
                    onClick={handleSave}
                    disabled={isSaving || !hasChanges()}
                    className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-sm shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Save size={16} />
                    {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
            </div>
            
            <USBFilePicker 
                isOpen={isSignaturePickerOpen}
                onClose={() => setIsSignaturePickerOpen(false)}
                onFilesSelected={handleSignatureSelected}
                title="Select Signature"
                accept="image/*"
            />
        </div>
    );
}
