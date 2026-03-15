"use client";

import React, { useState, useRef } from "react";
import { Building2, Camera, Save, X, Upload, Image as ImageIcon, Trash2, MapPin, Phone, Mail } from "lucide-react";
import { motion } from "framer-motion";
import { updateOrganizationSettings } from "@/app/actions/settings";
import USBFilePicker from "@/components/ui/USBFilePicker";

interface Organization {
    id: string;
    name: string;
    type: string;
    logoPath?: string | null;
    letterheadConfig?: string | null;
}

interface OrganizationSettingsProps {
    organization: Organization;
    onUpdate: () => void;
    onClose?: () => void;
}

export default function OrganizationSettings({ organization, onUpdate, onClose }: OrganizationSettingsProps) {
    const getImageUrl = (path: string) => {
        if (!path) return "";
        if (path.startsWith("data:")) return path; // Handle base64 previews
        if (path.startsWith("uploads/")) return `/api/capture-serve?path=${path}`;
        return `/${path}`;
    };

    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [logoPreview, setLogoPreview] = useState<string | null>(organization.logoPath || null);
    const [isLogoPickerOpen, setIsLogoPickerOpen] = useState(false);

    // Parse letterheadConfig for additional fields
    const letterheadData = organization.letterheadConfig ? JSON.parse(organization.letterheadConfig) : {};

    const [formData, setFormData] = useState({
        name: organization.name,
        type: organization.type,
        address: letterheadData.address || '',
        email: letterheadData.email || '',
        phone: letterheadData.phone || '',
    });

    const handleLogoSelected = (files: File[]) => {
        const file = files[0];
        if (file) {
            // For now, create a data URL for preview
            // In production, this would upload to a storage service
            const reader = new FileReader();
            reader.onloadend = () => {
                setLogoPreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleRemoveLogo = () => {
        setLogoPreview(null);
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            // Package address, email, phone in letterheadConfig
            const letterheadConfig = JSON.stringify({
                address: formData.address,
                email: formData.email,
                phone: formData.phone,
            });

            const result = await updateOrganizationSettings({
                id: organization.id,
                name: formData.name,
                logoPath: logoPreview || undefined,
                letterheadConfig,
            });

            if (result.success) {
                setIsEditing(false);
                onUpdate();
            } else {
                alert("Failed to save: " + result.error);
            }
        } catch (error) {
            console.error(error);
            alert("Error saving organization settings");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-700 p-2">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                <div>
                    <div className="flex items-center gap-4 mb-2">
                        <div className="p-3 bg-blue-100 rounded-2xl text-blue-600 shadow-inner">
                            <Building2 size={24} />
                        </div>
                        <h2 className="text-xl font-semibold text-slate-800 tracking-tight">Organization Branding</h2>
                    </div>
                    <p className="text-slate-500 text-[10px] font-medium uppercase tracking-wider ml-1">Identity & Global Appearance</p>
                </div>

                {onClose && (
                    <button
                        onClick={onClose}
                        className="p-3 bg-white hover:bg-slate-50 text-slate-400 border border-slate-100 rounded-2xl transition-all shadow-sm active:scale-95"
                    >
                        <X size={20} className="stroke-[2.5]" />
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                {/* Configuration Area */}
                <div className="lg:col-span-3 space-y-4">
                    <div className="bg-white/40 backdrop-blur-2xl border border-white/80 rounded-2xl p-6 shadow-2xl shadow-slate-200/60">
                        {/* Logo Upload */}
                        <div className="mb-8">
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3 ml-2">Brand Identity (Logo)</label>
                            <div className="flex items-center gap-6">
                                <div className="relative group">
                                    <div className={`w-24 h-24 rounded-2xl overflow-hidden border-2 border-dashed ${logoPreview ? 'border-transparent' : 'border-slate-200'} bg-white/50 backdrop-blur-sm flex items-center justify-center transition-all group-hover:border-blue-300 shadow-inner`}>
                                        {logoPreview ? (
                                            <img src={getImageUrl(logoPreview)} alt="Logo" className="w-full h-full object-contain p-2" />
                                        ) : (
                                            <Building2 size={40} className="text-slate-200" />
                                        )}
                                    </div>
                                    {isEditing && logoPreview && (
                                        <button
                                            onClick={handleRemoveLogo}
                                            className="absolute -top-3 -right-3 w-8 h-8 bg-rose-500 text-white rounded-2xl flex items-center justify-center shadow-lg hover:bg-rose-600 transition-all active:scale-90"
                                        >
                                            <Trash2 size={16} className="stroke-[3]" />
                                        </button>
                                    )}
                                </div>

                                {isEditing && (
                                    <div className="flex-1">
                                        <button
                                            type="button"
                                            onClick={() => setIsLogoPickerOpen(true)}
                                            className="inline-flex items-center gap-3 px-6 py-3 bg-white hover:bg-blue-50 text-blue-600 border border-blue-100 rounded-xl font-semibold text-[11px] uppercase tracking-wider cursor-pointer transition-all shadow-sm active:scale-95"
                                        >
                                            <Upload size={16} className="stroke-[2.5]" />
                                            Upload Asset
                                        </button>
                                        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mt-3 leading-loose">
                                            PNG, SVG preferred<br />Max 2.0 MB resolution
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Details Form */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2">
                                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 ml-2">Name</label>
                                {isEditing ? (
                                    <input
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full bg-white/50 border border-slate-100 rounded-xl px-5 py-3 text-slate-800 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all font-semibold text-sm"
                                        placeholder="Organization Name"
                                    />
                                ) : (
                                    <div className="flex items-center gap-3 px-5 py-3 bg-white/30 border border-white/50 rounded-xl">
                                        <Building2 size={16} className="text-blue-500" />
                                        <span className="font-semibold text-slate-800 text-sm">{organization.name}</span>
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 ml-2">Entity Type</label>
                                {isEditing ? (
                                    <select
                                        value={formData.type}
                                        onChange={e => setFormData({ ...formData, type: e.target.value })}
                                        className="w-full bg-white/50 border border-slate-100 rounded-xl px-5 py-3 text-slate-800 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all font-semibold text-sm cursor-pointer"
                                    >
                                        <option value="CLINIC">Clinic</option>
                                        <option value="HOSPITAL">Hospital</option>
                                        <option value="DIAGNOSTIC_CENTER">Diagnostic Center</option>
                                        <option value="PRIVATE_PRACTICE">Private Practice</option>
                                    </select>
                                ) : (
                                    <div className="flex items-center gap-3 px-5 py-3 bg-white/30 border border-white/50 rounded-xl">
                                        <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-2.5 py-1 rounded-lg uppercase tracking-wider">{organization.type}</span>
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 ml-2">Primary Email</label>
                                {isEditing ? (
                                    <input
                                        type="email"
                                        value={formData.email}
                                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                                        className="w-full bg-white/50 border border-slate-100 rounded-xl px-5 py-3 text-slate-800 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all font-semibold text-sm"
                                        placeholder="contact@example.com"
                                    />
                                ) : (
                                    <div className="flex items-center gap-3 px-5 py-3 bg-white/30 border border-white/50 rounded-xl">
                                        <Mail size={16} className="text-slate-400" />
                                        <span className="text-sm font-medium text-slate-600">{letterheadData.email || 'Not Configured'}</span>
                                    </div>
                                )}
                            </div>

                            <div className="md:col-span-2">
                                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 ml-2">Location / HQ Address</label>
                                {isEditing ? (
                                    <textarea
                                        value={formData.address}
                                        onChange={e => setFormData({ ...formData, address: e.target.value })}
                                        className="w-full bg-white/50 border border-slate-100 rounded-xl px-5 py-3 text-slate-800 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all font-medium text-sm outline-none resize-none"
                                        rows={2}
                                    />
                                ) : (
                                    <div className="flex items-start gap-3 px-5 py-3 bg-white/30 border border-white/50 rounded-xl">
                                        <MapPin size={16} className="text-slate-400 mt-0.5" />
                                        <span className="text-sm font-medium text-slate-600 leading-relaxed">{letterheadData.address || 'Address not listed'}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="mt-8 pt-6 border-t border-white/50 flex items-center justify-end gap-3">
                            {isEditing ? (
                                <>
                                    <button
                                        onClick={() => {
                                            setIsEditing(false);
                                            setFormData({
                                                name: organization.name,
                                                type: organization.type,
                                                address: letterheadData.address || '',
                                                email: letterheadData.email || '',
                                                phone: letterheadData.phone || '',
                                            });
                                            setLogoPreview(organization.logoPath || null);
                                        }}
                                        className="px-8 py-3.5 bg-white hover:bg-slate-50 text-slate-500 border border-slate-200 rounded-xl font-semibold text-[11px] uppercase tracking-wider transition-all active:scale-95"
                                    >
                                        Discard
                                    </button>
                                    <button
                                        onClick={handleSave}
                                        disabled={isSaving}
                                        className="px-6 py-3 bg-white hover:bg-blue-50 text-blue-600 border border-blue-100 rounded-xl font-semibold text-[10px] uppercase tracking-wider transition-all shadow-xl shadow-blue-900/5 active:scale-95 flex items-center gap-2.5 disabled:opacity-50"
                                    >
                                        <Save size={14} className="stroke-[2.5]" />
                                        {isSaving ? 'Processing' : 'Commit Changes'}
                                    </button>
                                </>
                            ) : (
                                <button
                                    onClick={() => setIsEditing(true)}
                                    className="px-10 py-4 bg-white hover:bg-slate-900 hover:text-white text-slate-900 border border-slate-900/10 rounded-2xl font-semibold text-[11px] uppercase tracking-wider transition-all shadow-xl shadow-slate-900/5 active:scale-95 flex items-center gap-3"
                                >
                                    <Camera size={18} className="stroke-[2.5]" />
                                    Customize Branding
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Preview Area */}
                <div className="lg:col-span-2">
                    <div className="bg-white/40 backdrop-blur-2xl border border-white/80 rounded-2xl p-6 shadow-2xl shadow-slate-200/60 sticky top-8">
                        <div className="flex items-center gap-3 mb-8">
                            <div className="p-2 bg-slate-100 rounded-lg text-slate-400">
                                <ImageIcon size={14} />
                            </div>
                            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Interface Preview</span>
                        </div>

                        <div className="space-y-10">
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-6">Sidebar Component</label>
                                <div className="bg-white/70 border border-white p-6 rounded-3xl shadow-lg ring-1 ring-black/5 flex items-center gap-4">
                                    {logoPreview ? (
                                        <img src={getImageUrl(logoPreview)} alt="Logo" className="w-12 h-12 object-contain rounded-xl bg-white shadow-sm p-1" />
                                    ) : (
                                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
                                            <Building2 size={24} />
                                        </div>
                                    )}
                                    <div className="flex flex-col">
                                        <h4 className="font-semibold text-slate-800 leading-tight tracking-tight uppercase text-xs">{formData.name || 'Organization'}</h4>
                                        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mt-0.5">Medical System</p>
                                    </div>
                                </div>
                            </div>

                            <div className="p-6 bg-white/50 rounded-3xl border border-white">
                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Letterhead Style</label>
                                <div className="space-y-4">
                                    <div className="h-2 w-3/4 bg-slate-100 rounded-full" />
                                    <div className="h-2 w-full bg-slate-100 rounded-full" />
                                    <div className="h-2 w-1/2 bg-slate-100 rounded-full" />
                                    <div className="pt-4 border-t border-slate-100 text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-loose">
                                        {formData.name}<br />
                                        {formData.email}<br />
                                        {formData.phone}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
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
