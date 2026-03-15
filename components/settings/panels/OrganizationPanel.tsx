"use client";

import React, { useState, useRef } from "react";
import { Building2, Upload, Trash2, MapPin, Phone, Mail, Globe, Save, Check, AlertCircle, Image as ImageIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { updateOrganizationSettings } from "@/app/actions/settings";
import { resolveImageUrl } from "@/lib/utils/image";
import USBFilePicker from "@/components/ui/USBFilePicker";

interface Organization {
    id: string;
    name: string;
    type: string;
    logoPath?: string | null;
    letterheadConfig?: string | null;
}

interface OrganizationPanelProps {
    organization: Organization;
    onUpdate: () => void;
    onUnsavedChange: (hasChanges: boolean) => void;
}

export default function OrganizationPanel({ organization, onUpdate, onUnsavedChange }: OrganizationPanelProps) {
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [isLogoPickerOpen, setIsLogoPickerOpen] = useState(false);

    const letterheadData = organization.letterheadConfig ? JSON.parse(organization.letterheadConfig) : {};

    const [logoPreview, setLogoPreview] = useState<string | null>(organization.logoPath || null);
    const [formData, setFormData] = useState({
        name: organization.name,
        type: organization.type,
        address: letterheadData.address || '',
        phone: letterheadData.phone || '',
        email: letterheadData.email || '',
        website: letterheadData.website || '',
    });

    const handleChange = (field: string, value: string) => {
        setFormData((prev: any) => ({ ...prev, [field]: value }));
        onUnsavedChange(true);
    };

    const handleLogoSelected = (files: File[]) => {
        const file = files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setLogoPreview(reader.result as string);
                onUnsavedChange(true);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleRemoveLogo = () => {
        setLogoPreview(null);
        onUnsavedChange(true);
    };

    const handleSave = async () => {
        setIsSaving(true);
        setSaveError('');
        setSaveSuccess(false);

        try {
            const result = await updateOrganizationSettings({
                id: organization.id,
                name: formData.name,
                type: formData.type,
                logoPath: logoPreview || undefined,
                letterheadConfig: JSON.stringify({
                    address: formData.address,
                    phone: formData.phone,
                    email: formData.email,
                    website: formData.website,
                }),
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
            setSaveError('Error saving organization settings');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="max-w-3xl space-y-8">
            {/* Logo Section */}
            <div className="bg-white/60 backdrop-blur-xl border border-white/60 rounded-3xl overflow-hidden shadow-sm">
                <div className="px-8 py-5 border-b border-white/60 bg-white/40">
                    <h4 className="text-sm font-bold text-slate-800">Organization Branding</h4>
                    <p className="text-xs text-slate-500 mt-0.5 font-medium">Logo appears on reports and letterheads</p>
                </div>

                <div className="p-8">
                    <div className="flex items-center gap-8">
                        {/* Logo Preview */}
                        <div className="relative w-36 h-36 bg-white border-2 border-dashed border-slate-200 rounded-3xl flex items-center justify-center overflow-hidden shadow-inner group">
                            {logoPreview ? (
                                <>
                                    <img src={resolveImageUrl(logoPreview)!} alt="Logo" className="max-w-full max-h-full object-contain p-4" />
                                    <button
                                        onClick={handleRemoveLogo}
                                        className="absolute top-2 right-2 p-1.5 bg-rose-500 text-white rounded-full hover:bg-rose-600 transition-colors shadow-lg opacity-0 group-hover:opacity-100"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </>
                            ) : (
                                <div className="text-center">
                                    <ImageIcon size={32} className="text-slate-300 mx-auto mb-2" />
                                    <span className="text-slate-400 text-xs font-semibold">No branding</span>
                                </div>
                            )}
                        </div>

                        {/* Upload */}
                        <div className="flex-1">
                            <h5 className="text-sm font-bold text-slate-700 mb-2">Upload visual identity</h5>
                            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                                Upload a high-resolution logo for your organization. Recommended size: 512x512px.
                                Supported formats: JPG, PNG.
                            </p>

                            <button
                                type="button"
                                onClick={() => setIsLogoPickerOpen(true)}
                                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl font-bold text-sm cursor-pointer transition-colors border border-blue-200"
                            >
                                <Upload size={16} />
                                Choose File
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Basic Info */}
            <div className="bg-white/60 backdrop-blur-xl border border-white/60 rounded-3xl overflow-hidden shadow-sm">
                <div className="px-8 py-5 border-b border-white/60 bg-white/40">
                    <h4 className="text-sm font-bold text-slate-800">Basic Information</h4>
                </div>

                <div className="p-8 space-y-6">
                    {/* Organization Name */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 ml-1">
                            Organization Name
                        </label>
                        <div className="relative">
                            <Building2 size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={formData.name}
                                onChange={e => handleChange('name', e.target.value)}
                                className="w-full bg-white/50 border border-slate-200 rounded-xl pl-12 pr-4 py-3.5 font-semibold text-slate-700 outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all shadow-sm"
                                placeholder="Loyal Med Clinic"
                            />
                        </div>
                    </div>

                    {/* Type */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 ml-1">
                            Organization Type
                        </label>
                        <div className="relative">
                            <select
                                value={formData.type}
                                onChange={e => handleChange('type', e.target.value)}
                                className="w-full bg-white/50 border border-slate-200 rounded-xl px-4 py-3.5 font-semibold text-slate-700 outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all shadow-sm appearance-none"
                            >
                                <option value="CLINIC">Clinic</option>
                                <option value="HOSPITAL">Hospital</option>
                                <option value="DIAGNOSTIC_CENTER">Diagnostic Center</option>
                            </select>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Contact Information */}
            <div className="bg-white/60 backdrop-blur-xl border border-white/60 rounded-3xl overflow-hidden shadow-sm">
                <div className="px-8 py-5 border-b border-white/60 bg-white/40">
                    <h4 className="text-sm font-bold text-slate-800">Contact Details</h4>
                    <p className="text-xs text-slate-500 mt-0.5 font-medium">Visible on patient reports and invoices</p>
                </div>

                <div className="p-8 space-y-6">
                    {/* Address */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 ml-1">
                            Postal Address
                        </label>
                        <div className="relative">
                            <MapPin size={18} className="absolute left-4 top-4 text-slate-400" />
                            <textarea
                                value={formData.address}
                                onChange={e => handleChange('address', e.target.value)}
                                rows={3}
                                className="w-full bg-white/50 border border-slate-200 rounded-xl pl-12 pr-4 py-3.5 font-semibold text-slate-700 outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all resize-none shadow-sm"
                                placeholder="123 Medical Complex, Healthcare Street..."
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Phone */}
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 ml-1">
                                Phone Number
                            </label>
                            <div className="relative">
                                <Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="tel"
                                    value={formData.phone}
                                    onChange={e => handleChange('phone', e.target.value)}
                                    className="w-full bg-white/50 border border-slate-200 rounded-xl pl-12 pr-4 py-3.5 font-semibold text-slate-700 outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all shadow-sm"
                                    placeholder="+91 98765 43210"
                                />
                            </div>
                        </div>

                        {/* Email */}
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 ml-1">
                                Email Address
                            </label>
                            <div className="relative">
                                <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={e => handleChange('email', e.target.value)}
                                    className="w-full bg-white/50 border border-slate-200 rounded-xl pl-12 pr-4 py-3.5 font-semibold text-slate-700 outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all shadow-sm"
                                    placeholder="contact@clinic.com"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Website */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 ml-1">
                            Website
                        </label>
                        <div className="relative">
                            <Globe size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="url"
                                value={formData.website}
                                onChange={e => handleChange('website', e.target.value)}
                                className="w-full bg-white/50 border border-slate-200 rounded-xl pl-12 pr-4 py-3.5 font-semibold text-slate-700 outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all shadow-sm"
                                placeholder="https://www.clinic.com"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 pb-8">
                <div>
                    <AnimatePresence>
                        {saveSuccess && (
                            <motion.div
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100"
                            >
                                <Check size={16} strokeWidth={3} />
                                <span className="text-sm font-bold">Settings saved successfully</span>
                            </motion.div>
                        )}
                        {saveError && (
                            <motion.div
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                className="flex items-center gap-2 text-rose-600 bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-100"
                            >
                                <AlertCircle size={16} strokeWidth={3} />
                                <span className="text-sm font-bold">{saveError}</span>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-8 py-3.5 rounded-xl bg-slate-900 text-white font-bold text-sm shadow-xl shadow-slate-900/20 hover:shadow-2xl hover:shadow-slate-900/30 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2 disabled:opacity-50 disabled:transform-none"
                >
                    <Save size={18} />
                    {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
            </div>
            
            <USBFilePicker 
                isOpen={isLogoPickerOpen}
                onClose={() => setIsLogoPickerOpen(false)}
                onFilesSelected={handleLogoSelected}
                title="Select Organization Logo"
                accept="image/*"
            />
        </div>
    );
}
