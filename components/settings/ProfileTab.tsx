"use client";

import React, { useState, useRef } from "react";
import { User, Camera, FileText, Check, Loader2, Save, AlertCircle } from "lucide-react";
import { updateUserProfile } from "@/app/actions/settings";
import { motion } from "framer-motion";
import USBFilePicker from "@/components/ui/USBFilePicker";

interface ProfileTabProps {
    user: any;
    onUpdate: () => void;
}

const getImageUrl = (path: string) => {
    if (!path) return "";
    if (path.startsWith("uploads/")) return `/api/capture-serve?path=${path}`;
    return `/${path}`;
};

export default function ProfileTab({ user, onUpdate }: ProfileTabProps) {
    const [fullName, setFullName] = useState(user?.fullName || "");
    const [degree, setDegree] = useState(user?.degree || "");
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState({ text: "", type: "" });
    const [profilePic, setProfilePic] = useState(user?.profilePicturePath || "");
    const [signature, setSignature] = useState(user?.signaturePath || "");
    const contactInfo = user?.contactDetails ? JSON.parse(user.contactDetails) : {};
    const [cameraResolution, setCameraResolution] = useState(contactInfo.cameraResolution || '1080p');
    const [printQuality, setPrintQuality] = useState(contactInfo.printQuality || 'Medium');

    const [isProfilePickerOpen, setIsProfilePickerOpen] = useState(false);
    const [isSignaturePickerOpen, setIsSignaturePickerOpen] = useState(false);

    const handleFilesSelected = async (files: File[], type: "PROFILE_PICTURE" | "SIGNATURE") => {
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
                        type,
                        userId: user.id
                    })
                });
                const result = await res.json();

                if (result.success) {
                    if (type === "PROFILE_PICTURE") setProfilePic(result.filePath);
                    else setSignature(result.filePath);
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

        const result = await updateUserProfile({
            userId: user.id,
            fullName,
            degree,
            profilePicturePath: profilePic,
            signaturePath: signature,
            contactDetails: JSON.stringify({
                ...contactInfo,
                cameraResolution,
                printQuality,
            })
        });

        if (result.success) {
            setMessage({ text: "Profile updated successfully!", type: "success" });
            onUpdate();
        } else {
            setMessage({ text: "Failed to update profile.", type: "error" });
        }
        setIsSaving(false);
    };

    return (
        <form onSubmit={handleSave} className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Profile Header section with Picture */}
            <div className="flex items-center gap-6 bg-slate-50 p-6 rounded-xl border border-slate-100">
                <div className="relative group">
                    <div className="w-24 h-24 rounded-2xl bg-blue-600 flex items-center justify-center text-white text-3xl font-black shadow-lg shadow-blue-500/10 overflow-hidden">
                        {profilePic ? (
                            <img src={getImageUrl(profilePic)} className="w-full h-full object-cover" alt="Profile" />
                        ) : (
                            fullName.charAt(0).toUpperCase()
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsProfilePickerOpen(true)}
                        className="absolute -right-2 -bottom-2 w-10 h-10 bg-white shadow-lg rounded-xl flex items-center justify-center text-slate-600 hover:text-blue-600 hover:scale-110 active:scale-95 transition-all"
                    >
                        <Camera size={20} />
                    </button>
                </div>
                <div>
                    <h3 className="text-lg font-bold text-slate-900">{fullName || "Your Name"}</h3>
                    <p className="text-slate-500 text-xs font-medium">{degree || "Specialization"}</p>
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-600 mt-1.5">Medical Practitioner</p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Full Name</label>
                    <input
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-slate-800 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all text-sm"
                        placeholder="Dr. Name"
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Medical Degree</label>
                    <input
                        type="text"
                        value={degree}
                        onChange={(e) => setDegree(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-slate-800 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all text-sm"
                        placeholder="MD, MBBS, etc."
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Camera Feed Resolution</label>
                    <select
                        value={cameraResolution}
                        onChange={(e) => setCameraResolution(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-slate-800 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all text-sm appearance-none"
                    >
                        <option value="720p">720p (Fastest)</option>
                        <option value="1080p">1080p (Standard)</option>
                        <option value="4K">4K (High Precision)</option>
                    </select>
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Image Capture Quality</label>
                    <select
                        value={printQuality}
                        onChange={(e) => setPrintQuality(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-slate-800 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all text-sm appearance-none"
                    >
                        <option value="Low">Low (Smaller File Size)</option>
                        <option value="Medium">Medium (Balanced)</option>
                        <option value="High">High (Best Print Quality)</option>
                    </select>
                </div>
            </div>

            {/* Signature Upload */}
            <div className="group">
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">Digital Signature</label>
                <div
                    onClick={() => setIsSignaturePickerOpen(true)}
                    className="relative w-full h-20 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center cursor-pointer hover:bg-slate-100/50 hover:border-blue-300 transition-all overflow-hidden"
                >
                    {signature ? (
                        <img src={getImageUrl(signature)} className="h-full object-contain p-2" alt="Signature" />
                    ) : (
                        <div className="flex flex-col items-center">
                            <FileText size={24} className="text-slate-300 mb-1" />
                            <span className="text-xs font-bold text-slate-400">Click to upload signature image</span>
                        </div>
                    )}
                    <button type="button" className="absolute top-2 right-2 p-1.5 bg-white shadow-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                        <Camera size={14} className="text-slate-500" />
                    </button>
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
                {isSaving ? "Saving..." : "Save Profile Changes"}
            </button>
            
            <USBFilePicker 
                isOpen={isProfilePickerOpen}
                onClose={() => setIsProfilePickerOpen(false)}
                onFilesSelected={(files) => handleFilesSelected(files, "PROFILE_PICTURE")}
                title="Select Profile Picture"
                accept="image/*"
            />
            
            <USBFilePicker 
                isOpen={isSignaturePickerOpen}
                onClose={() => setIsSignaturePickerOpen(false)}
                onFilesSelected={(files) => handleFilesSelected(files, "SIGNATURE")}
                title="Select Signature"
                accept="image/*"
            />
        </form>
    );
}
