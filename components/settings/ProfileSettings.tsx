"use client";

import React, { useState, useEffect, useRef } from "react";
import { User, Mail, Phone, Camera, Save, X, Edit3, Shield, Building2, KeyRound, Lock, Check, Upload, Pencil, Trash2, Briefcase } from "lucide-react";
import { motion } from "framer-motion";
import { updateUserProfile, setDangerZonePin, hasDangerZonePin } from "@/app/actions/settings";
import USBFilePicker from "@/components/ui/USBFilePicker";

interface UserData {
    id: string;
    fullName: string;
    username: string;
    role: string;
    contactDetails?: string;
    signaturePath?: string;
    dangerZonePin?: string;
    organization?: {
        id: string;
        name: string;
        type: string;
    };
}

interface ProfileSettingsProps {
    user: UserData;
    onUpdate: () => void;
    onClose?: () => void;
}

export default function ProfileSettings({ user, onUpdate, onClose }: ProfileSettingsProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isSignaturePickerOpen, setIsSignaturePickerOpen] = useState(false);

    // PIN state
    const [hasPin, setHasPin] = useState(false);
    const [pinValue, setPinValue] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [pinError, setPinError] = useState('');
    const [isSavingPin, setIsSavingPin] = useState(false);
    const [pinSaved, setPinSaved] = useState(false);

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

    useEffect(() => {
        checkPinStatus();
    }, [user.id]);

    const checkPinStatus = async () => {
        const result = await hasDangerZonePin(user.id);
        setHasPin(result.hasPin);
    };

    const handleSave = async () => {
        setIsSaving(true);
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
                setIsEditing(false);
                onUpdate();
            } else {
                alert("Failed to save: " + result.error);
            }
        } catch (error) {
            console.error(error);
            alert("Error saving profile");
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
            };
            reader.readAsDataURL(file);
        }
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
        const result = await setDangerZonePin(user.id, pinValue);

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

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-slate-900">My Profile</h1>
                    <p className="text-slate-500 font-medium mt-1">Manage your account settings</p>
                </div>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                        <X size={20} />
                    </button>
                )}
            </div>

            {/* Profile Card */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden"
            >
                {/* Avatar Header */}
                <div className="relative h-24 bg-gradient-to-r from-blue-600 to-indigo-600">
                    <div className="absolute -bottom-10 left-6">
                        <div className="w-20 h-20 rounded-2xl bg-white shadow-xl flex items-center justify-center text-3xl font-black text-blue-600 ring-4 ring-white">
                            {user.fullName.charAt(0)}
                        </div>
                    </div>
                    <div className="absolute bottom-3 right-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${user.role === 'DOCTOR' ? 'bg-blue-500/20 text-white' :
                            user.role === 'ADMIN' ? 'bg-purple-500/20 text-white' :
                                'bg-green-500/20 text-white'
                            }`}>
                            <Shield size={12} className="inline mr-1" />
                            {user.role}
                        </span>
                    </div>
                </div>

                {/* Content */}
                <div className="pt-14 px-6 pb-6">
                    {/* Organization Badge */}
                    {user.organization && (
                        <div className="mb-6 flex items-center gap-2 text-slate-500">
                            <Building2 size={16} />
                            <span className="text-sm font-semibold">{user.organization.name}</span>
                            <span className="text-xs bg-slate-100 px-2 py-0.5 rounded-full">{user.organization.type}</span>
                        </div>
                    )}

                    {/* Form Fields */}
                    <div className="space-y-5">
                        {/* Full Name */}
                        <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Full Name</label>
                            {isEditing ? (
                                <input
                                    value={formData.fullName}
                                    onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-semibold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                />
                            ) : (
                                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                                    <User size={18} className="text-slate-400" />
                                    <span className="font-semibold text-slate-700">{user.fullName}</span>
                                </div>
                            )}
                        </div>

                        {/* Username (readonly) */}
                        <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Username</label>
                            <div className="flex items-center gap-3 p-3 bg-slate-100 rounded-xl">
                                <span className="font-mono text-sm text-slate-500">@{user.username}</span>
                                <span className="text-[10px] text-slate-400 ml-auto">Cannot be changed</span>
                            </div>
                        </div>

                        {/* Email */}
                        <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Email</label>
                            {isEditing ? (
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                                    placeholder="Enter email address"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-semibold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                />
                            ) : (
                                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                                    <Mail size={18} className="text-slate-400" />
                                    <span className="font-semibold text-slate-700">{contactInfo.email || 'Not set'}</span>
                                </div>
                            )}
                        </div>

                        {/* Phone */}
                        <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Phone</label>
                            {isEditing ? (
                                <input
                                    type="tel"
                                    value={formData.phone}
                                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                    placeholder="Enter phone number"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-semibold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                />
                            ) : (
                                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                                    <Phone size={18} className="text-slate-400" />
                                    <span className="font-semibold text-slate-700">{contactInfo.phone || 'Not set'}</span>
                                </div>
                            )}
                        </div>

                        {/* Specialty (for Doctors) */}
                        {user.role === 'DOCTOR' && (
                            <div className="space-y-5">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Specialty</label>
                                    {isEditing ? (
                                        <input
                                            type="text"
                                            value={formData.specialty}
                                            onChange={e => setFormData({ ...formData, specialty: e.target.value })}
                                            placeholder="e.g., ENT Surgeon, Gastroenterologist"
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-semibold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                        />
                                    ) : (
                                        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                                            <Briefcase size={18} className="text-slate-400" />
                                            <span className="font-semibold text-slate-700">{contactInfo.specialty || 'Not set'}</span>
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    {/* Camera Resolution */}
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Camera Feed Resolution</label>
                                        {isEditing ? (
                                            <select
                                                value={formData.cameraResolution}
                                                onChange={e => setFormData({ ...formData, cameraResolution: e.target.value })}
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-semibold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 appearance-none"
                                            >
                                                <option value="720p">720p (Fastest)</option>
                                                <option value="1080p">1080p (Standard)</option>
                                                <option value="4K">4K (High Precision)</option>
                                            </select>
                                        ) : (
                                            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                                                <Camera size={18} className="text-slate-400" />
                                                <span className="font-semibold text-slate-700">{contactInfo.cameraResolution || '1080p'}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Print Quality */}
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Image Capture Quality</label>
                                        {isEditing ? (
                                            <select
                                                value={formData.printQuality}
                                                onChange={e => setFormData({ ...formData, printQuality: e.target.value })}
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-semibold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 appearance-none"
                                            >
                                                <option value="Low">Low (Smaller File Size)</option>
                                                <option value="Medium">Medium (Balanced)</option>
                                                <option value="High">High (Best Print Quality)</option>
                                            </select>
                                        ) : (
                                            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                                                <Camera size={18} className="text-slate-400" />
                                                <span className="font-semibold text-slate-700">{contactInfo.printQuality || 'Medium'}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Signature Upload */}
                        {user.role === 'DOCTOR' && (
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Digital Signature</label>
                                <div className="flex items-center gap-4">
                                    {/* Signature Preview */}
                                    <div className="relative w-40 h-20 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center overflow-hidden">
                                        {signaturePreview ? (
                                            <img src={signaturePreview} alt="Signature" className="max-w-full max-h-full object-contain" />
                                        ) : (
                                            <span className="text-slate-400 text-xs">No signature</span>
                                        )}
                                        {isEditing && signaturePreview && (
                                            <button
                                                onClick={() => setSignaturePreview(null)}
                                                className="absolute top-1 right-1 p-1 bg-rose-500 text-white rounded-full"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        )}
                                    </div>

                                    {/* Upload Button */}
                                    {isEditing && (
                                        <div>
                                            <button
                                                type="button"
                                                onClick={() => setIsSignaturePickerOpen(true)}
                                                className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl font-semibold text-sm text-slate-700 cursor-pointer transition-colors"
                                            >
                                                <Upload size={16} />
                                                Upload Signature
                                            </button>
                                            <p className="text-[10px] text-slate-400 mt-1">PNG/JPG, transparent background recommended</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="mt-8 flex items-center gap-3">
                        {isEditing ? (
                            <>
                                <button
                                    onClick={() => setIsEditing(false)}
                                    className="flex-1 py-3 px-4 rounded-xl border border-slate-200 font-bold text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-sm shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    <Save size={16} />
                                    {isSaving ? 'Saving...' : 'Save Changes'}
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={() => setIsEditing(true)}
                                className="w-full py-3 px-4 rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
                            >
                                <Edit3 size={16} />
                                Edit Profile
                            </button>
                        )}
                    </div>
                </div>
            </motion.div>

            {/* Danger Zone PIN Card */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-white rounded-2xl border-2 border-rose-200 shadow-lg overflow-hidden"
            >
                <div className="p-4 bg-gradient-to-r from-rose-50 to-red-50 border-b border-rose-100 flex items-center gap-3">
                    <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center text-rose-600">
                        <Lock size={20} />
                    </div>
                    <div>
                        <h2 className="font-bold text-rose-900">Danger Zone PIN</h2>
                        <p className="text-xs text-rose-600">Protect patient deletion with a PIN</p>
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
                            ? 'Your Danger Zone is protected. Enter a new PIN below to change it.'
                            : 'Set a 4-6 digit PIN to protect the Danger Zone. This PIN will be required before deleting any patient records.'}
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

                    {pinError && (
                        <p className="text-rose-500 text-xs font-semibold mb-4">{pinError}</p>
                    )}

                    {pinSaved && (
                        <div className="mb-4 p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-2">
                            <Check size={16} className="text-emerald-600" />
                            <span className="text-sm font-semibold text-emerald-700">PIN saved successfully!</span>
                        </div>
                    )}

                    <button
                        onClick={handleSavePin}
                        disabled={isSavingPin || pinValue.length < 4}
                        className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-rose-500 to-red-600 text-white font-bold text-sm shadow-lg shadow-rose-500/25 hover:shadow-rose-500/40 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        <Save size={16} />
                        {isSavingPin ? 'Saving...' : hasPin ? 'Update PIN' : 'Set PIN'}
                    </button>
                </div>
            </motion.div>
            
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
