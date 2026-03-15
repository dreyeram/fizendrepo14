"use client";

import React, { useState, useEffect, useRef } from "react";
import { Building2, Camera, MapPin, Phone, Mail, Save, Loader2, Check, AlertCircle } from "lucide-react";
import { getOrganizationSettings, updateOrganizationSettings } from "@/app/actions/settings";
import { motion } from "framer-motion";
import USBFilePicker from "@/components/ui/USBFilePicker";

interface OrganizationTabProps {
    orgId: string;
    onUpdate?: () => void;
}

const getImageUrl = (path: string) => {
    if (!path) return "";
    if (path.startsWith("uploads/")) return `/api/capture-serve?path=${path}`;
    return `/${path}`;
};

export default function OrganizationTab({ orgId, onUpdate }: OrganizationTabProps) {
    const [logo, setLogo] = useState("");
    const [name, setName] = useState("");
    const [address, setAddress] = useState("");
    const [mobile, setMobile] = useState("");
    const [email, setEmail] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState({ text: "", type: "" });

    const [isLogoPickerOpen, setIsLogoPickerOpen] = useState(false);

    useEffect(() => {
        if (orgId) {
            loadOrgSettings();
        }
    }, [orgId]);

    const loadOrgSettings = async () => {
        setLoading(true);
        const result = await getOrganizationSettings(orgId);
        if (result.success && result.organization) {
            const org = result.organization;
            setName(org.name || "");
            setLogo(org.logoPath || "");
            setAddress((org as any).address || "");
            setMobile((org as any).mobile || "");
            setEmail((org as any).contactEmail || "");
        }
        setLoading(false);
    };

    const handleLogoSelected = async (files: File[]) => {
        const file = files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const base64 = event.target?.result as string;

            try {
                const res = await fetch("/api/settings/upload", {
                    method: "POST",
                    body: JSON.stringify({
                        data: base64,
                        type: "ORG_LOGO",
                        organizationId: orgId
                    })
                });
                const result = await res.json();

                if (result.success) {
                    setLogo(result.filePath);
                }
            } catch (err) {
                console.error("Upload failed", err);
            }
        };
        reader.readAsDataURL(file);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setMessage({ text: "", type: "" });

        const result = await updateOrganizationSettings({
            id: orgId,
            name,
            logoPath: logo,
            address,
            mobile,
            contactEmail: email
        });

        if (result.success) {
            setMessage({ text: "Organization settings updated successfully!", type: "success" });
            onUpdate?.();
        } else {
            setMessage({ text: "Failed to update organization settings.", type: "error" });
        }
        setIsSaving(false);
    };

    if (loading) return (
        <div className="h-full flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-4" />
            <p className="text-[10px] font-black uppercase tracking-widest">Loading organization...</p>
        </div>
    );

    return (
        <form onSubmit={handleSave} className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Logo Section */}
            <div className="flex items-center gap-6 bg-slate-50 p-6 rounded-xl border border-slate-100">
                <div className="relative group">
                    <div className="w-20 h-20 rounded-xl bg-white border border-slate-100 p-3 flex items-center justify-center shadow-md shadow-slate-200/50 overflow-hidden">
                        {logo ? (
                            <img src={getImageUrl(logo)} className="max-w-full max-h-full object-contain" alt="Logo" />
                        ) : (
                            <Building2 size={40} className="text-slate-300" />
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsLogoPickerOpen(true)}
                        className="absolute -right-2 -bottom-2 w-8 h-8 bg-white shadow-md rounded-lg flex items-center justify-center text-slate-600 hover:text-blue-600 hover:scale-110 active:scale-95 transition-all"
                    >
                        <Camera size={16} />
                    </button>
                </div>
                <div>
                    <h3 className="text-lg font-bold text-slate-900">{name || "Clinic/Hospital Name"}</h3>
                    <p className="text-slate-500 text-xs font-medium">Manage institutional identity & branding</p>
                </div>
            </div>

            <div className="space-y-4">
                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Organization Name</label>
                    <div className="relative">
                        <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-12 pr-5 py-3 font-bold text-slate-800 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all text-sm"
                            placeholder="HealthCare Medical Center"
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Physical Address</label>
                    <div className="relative">
                        <MapPin className="absolute left-4 top-4 text-slate-400" size={18} />
                        <textarea
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            rows={2}
                            className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-12 pr-5 py-3 font-bold text-slate-800 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all resize-none text-sm"
                            placeholder="Street, City, Zip Code"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Contact Mobile</label>
                        <div className="relative">
                            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input
                                type="text"
                                value={mobile}
                                onChange={(e) => setMobile(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-12 pr-5 py-3 font-bold text-slate-800 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all text-sm"
                                placeholder="+91 99999 99999"
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Contact Email</label>
                        <div className="relative">
                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-12 pr-5 py-3 font-bold text-slate-800 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all text-sm"
                                placeholder="contact@hospital.com"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {message.text && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`p-4 rounded-2xl flex items-center gap-3 text-sm font-bold ${message.type === "success" ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-rose-50 text-rose-600 border border-rose-100"
                        }`}
                >
                    {message.type === "success" ? <Check size={18} /> : <AlertCircle size={18} />}
                    {message.text}
                </motion.div>
            )}

            <button
                type="submit"
                disabled={isSaving}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-3 shadow-lg shadow-blue-500/10 active:scale-[0.98] text-xs"
            >
                {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                {isSaving ? "Saving..." : "Save Organization Changes"}
            </button>
            
            <USBFilePicker 
                isOpen={isLogoPickerOpen}
                onClose={() => setIsLogoPickerOpen(false)}
                onFilesSelected={handleLogoSelected}
                title="Select Organization Logo"
                accept="image/*"
            />
        </form>
    );
}
