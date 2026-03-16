"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    User, Building2, Sliders, Palette, Database, Keyboard,
    Save, RotateCcw, Check, ChevronRight, Shield, Bell,
    Monitor, Camera, Timer, History, Image, ZoomIn, Settings2,
    Loader2, Upload, Download, Trash2, Grid3X3, Mic, Eye,
    FileText, AlertTriangle, CheckCircle2, Users, BarChart3,
    Microscope, Plus, MoreVertical, Edit2, Copy, Star, Trash, MousePointer2
} from "lucide-react";
import { useSettings, ProcedureToolSettings, defaultProcedureTools } from "@/contexts/SettingsContext";
import { updateUserProfile, updateOrganizationSettings } from "@/app/actions/settings";
import { exportPatientsCSV, exportSettingsBackup, getExportStatistics } from "@/app/actions/export";
import USBFilePicker from "@/components/ui/USBFilePicker";
import { useConfirm } from "@/lib/hooks/useConfirm";

// Settings Section Types
type SettingsSection = 'profile' | 'organization' | 'communication' | 'procedure-tools' | 'scope-settings' | 'appearance' | 'shortcuts' | 'data';

interface SettingsPanelProps {
    user: {
        id: string;
        fullName: string;
        username: string;
        role: string;
        signaturePath?: string;
        contactDetails?: string;
    };
    organization?: {
        id: string;
        name: string;
        logoPath?: string | null;
        letterheadConfig?: string | null;
        smtpConfig?: string | null;
    };
    onUpdate?: () => void;
}

// Navigation Items
const NAV_ITEMS: { id: SettingsSection; label: string; icon: React.ElementType; description: string }[] = [
    { id: 'profile', label: 'My Profile', icon: User, description: 'Personal info & signature' },
    { id: 'organization', label: 'Organization', icon: Building2, description: 'Clinic branding & details' },
    { id: 'procedure-tools', label: 'Procedure Tools', icon: Sliders, description: 'Toggle features on/off' },
    { id: 'scope-settings', label: 'Scope Profiles', icon: Microscope, description: 'Manage scope configurations' },
    { id: 'appearance', label: 'Appearance', icon: Palette, description: 'Theme & display options' },
    { id: 'shortcuts', label: 'Keyboard Shortcuts', icon: Keyboard, description: 'Customize hotkeys' },
    { id: 'data', label: 'Data & Export', icon: Database, description: 'Backup & export data' },
];

// Procedure Tool Descriptions
const PROCEDURE_TOOL_INFO: Record<keyof ProcedureToolSettings, { label: string; description: string; icon: React.ElementType }> = {
    quadFilter: { label: 'Quad Filter View', description: 'Show 4-panel color filter comparison during procedures', icon: Grid3X3 },
    voiceCommands: { label: 'Voice Commands', description: 'Enable hands-free capture via voice recognition', icon: Mic },
    comparisonMode: { label: 'Comparison Mode', description: 'Side-by-side image comparison tool', icon: Eye },
    timer: { label: 'Procedure Timer', description: 'Display elapsed time during procedures', icon: Timer },
    patientHistory: { label: 'Patient History', description: 'Show previous procedure images in sidebar', icon: History },
    autoStartRecording: { label: 'Auto-Start Recording', description: 'Begin video recording when procedure starts', icon: Camera },
    watermarkOnCaptures: { label: 'Watermark Captures', description: 'Add date/time watermark to captured images', icon: Image },
    fitSettingsPanel: { label: 'Fit Settings Panel', description: 'Show video calibration controls', icon: Monitor },
    galleryPanel: { label: 'Gallery Panel', description: 'Display captured images gallery during procedure', icon: FileText },
    zoomControls: { label: 'Zoom Controls', description: 'Show zoom in/out buttons on video feed', icon: ZoomIn },
};

export default function SettingsPanel({ user, organization, onUpdate }: SettingsPanelProps) {
    const [activeSection, setActiveSection] = useState<SettingsSection>('profile');
    const { settings, updateSetting, updateProcedureTool, saveSettings, resetSettings, hasChanges } = useSettings();
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const confirm = useConfirm();

    const showToast = (type: 'success' | 'error', message: string) => {
        setToast({ type, message });
        setTimeout(() => setToast(null), 3000);
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await saveSettings();
            setSaveSuccess(true);
            showToast('success', 'Settings saved successfully');
            setTimeout(() => setSaveSuccess(false), 2000);
            onUpdate?.();
        } catch {
            showToast('error', 'Failed to save settings');
        } finally {
            setIsSaving(false);
        }
    };

    const handleReset = async () => {
        const ok = await confirm({
            title: "Reset Settings",
            message: "Reset all settings to defaults? This cannot be undone.",
            confirmLabel: "Reset",
            variant: "danger"
        });
        if (ok) {
            resetSettings();
            showToast('success', 'Settings reset to defaults');
        }
    };

    return (
        <div className="h-full flex bg-slate-50 overflow-hidden">
            {/* Toast Notification */}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg ${toast.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                            }`}
                    >
                        {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                        {toast.message}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Left Navigation */}
            <nav className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0">
                <div className="p-4 border-b border-slate-100">
                    <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <Settings2 size={20} className="text-blue-600" />
                        Settings
                    </h2>
                </div>

                <div className="flex-1 overflow-y-auto p-2">
                    {NAV_ITEMS.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => setActiveSection(item.id)}
                            className={`w-full text-left p-3 rounded-lg mb-1 transition-all group ${activeSection === item.id
                                ? 'bg-blue-50 text-blue-700'
                                : 'text-slate-600 hover:bg-slate-50'
                                }`}
                        >
                            <div className="flex items-center gap-3">
                                <item.icon size={18} className={activeSection === item.id ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'} />
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium truncate">{item.label}</div>
                                    <div className="text-xs text-slate-400 truncate">{item.description}</div>
                                </div>
                                {activeSection === item.id && <ChevronRight size={16} className="text-blue-500" />}
                            </div>
                        </button>
                    ))}
                </div>

                {/* Save/Reset Footer */}
                <div className="p-4 border-t border-slate-100 bg-slate-50 space-y-2">
                    <button
                        onClick={handleSave}
                        disabled={!hasChanges || isSaving}
                        className={`w-full py-2.5 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all ${hasChanges
                            ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md'
                            : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                            }`}
                    >
                        {isSaving ? <Loader2 size={16} className="animate-spin" /> : saveSuccess ? <Check size={16} /> : <Save size={16} />}
                        {saveSuccess ? 'Saved!' : hasChanges ? 'Save Changes' : 'No Changes'}
                    </button>
                    <button
                        onClick={handleReset}
                        className="w-full py-2 rounded-lg text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center gap-2"
                    >
                        <RotateCcw size={14} />
                        Reset to Defaults
                    </button>
                </div>
            </nav>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeSection}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.15 }}
                        className="p-6 max-w-4xl"
                    >
                        {activeSection === 'profile' && <ProfileSection user={user} showToast={showToast} onUpdate={onUpdate} />}
                        {activeSection === 'organization' && <OrganizationSection organization={organization} showToast={showToast} onUpdate={onUpdate} />}
                        {activeSection === 'procedure-tools' && <ProcedureToolsSection tools={settings.procedureTools} onToggle={updateProcedureTool} />}
                        {activeSection === 'scope-settings' && <ScopeProfilesSection settings={settings} updateSetting={updateSetting} showToast={showToast} />}
                        {activeSection === 'appearance' && <AppearanceSection settings={settings} updateSetting={updateSetting} />}
                        {activeSection === 'shortcuts' && <ShortcutsSection shortcuts={settings.shortcuts} />}
                        {activeSection === 'data' && <DataSection user={user} showToast={showToast} />}
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
}

// ============ SECTIONS ============

function ProfileSection({ user, showToast, onUpdate }: { user: SettingsPanelProps['user']; showToast: (type: 'success' | 'error', msg: string) => void; onUpdate?: () => void }) {
    const [fullName, setFullName] = useState(user.fullName);
    const [phone, setPhone] = useState(() => {
        try { return user.contactDetails ? JSON.parse(user.contactDetails).phone || '' : ''; } catch { return ''; }
    });
    const [email, setEmail] = useState(() => {
        try { return user.contactDetails ? JSON.parse(user.contactDetails).email || '' : ''; } catch { return ''; }
    });
    const [specialty, setSpecialty] = useState(() => {
        try { return user.contactDetails ? JSON.parse(user.contactDetails).specialty || '' : ''; } catch { return ''; }
    });
    const [isSaving, setIsSaving] = useState(false);

    const handleSaveProfile = async () => {
        setIsSaving(true);
        try {
            const contactDetails = JSON.stringify({ phone, email, specialty });
            const result = await updateUserProfile({
                userId: user.id,
                fullName,
                contactDetails,
            });
            if (result.success) {
                showToast('success', 'Profile updated successfully');
                onUpdate?.();
            } else {
                showToast('error', result.error || 'Failed to update profile');
            }
        } catch {
            showToast('error', 'Failed to update profile');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-xl font-bold text-slate-900">My Profile</h3>
                <p className="text-sm text-slate-500">Manage your personal information and signature.</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
                {/* Avatar */}
                <div className="flex items-center gap-4">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-2xl font-bold">
                        {fullName.charAt(0)}
                    </div>
                    <div>
                        <h4 className="text-lg font-bold text-slate-900">{fullName}</h4>
                        <p className="text-sm text-slate-500">@{user.username}</p>
                        <span className="inline-block mt-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                            {user.role}
                        </span>
                    </div>
                </div>

                {/* Form Fields */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-600 mb-1.5">Full Name</label>
                        <input
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-600 mb-1.5">Specialty</label>
                        <input
                            type="text"
                            value={specialty}
                            onChange={(e) => setSpecialty(e.target.value)}
                            placeholder="e.g. ENT Surgeon"
                            className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-600 mb-1.5">Phone</label>
                        <input
                            type="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="+91 98765 43210"
                            className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-600 mb-1.5">Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="doctor@clinic.com"
                            className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                        />
                    </div>
                </div>

                {/* Save Button */}
                <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                    <button className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700">
                        <Shield size={16} />
                        Change Password
                    </button>
                    <button
                        onClick={handleSaveProfile}
                        disabled={isSaving}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                    >
                        {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        Save Profile
                    </button>
                </div>
            </div>
        </div>
    );
}

function OrganizationSection({ organization, showToast, onUpdate }: { organization?: SettingsPanelProps['organization']; showToast: (type: 'success' | 'error', msg: string) => void; onUpdate?: () => void }) {
    const [orgName, setOrgName] = useState(organization?.name || '');
    const [isSaving, setIsSaving] = useState(false);
    const [isLogoPickerOpen, setIsLogoPickerOpen] = useState(false);

    const handleSaveOrg = async () => {
        if (!organization?.id) return;
        setIsSaving(true);
        try {
            const result = await updateOrganizationSettings({
                id: organization.id,
                name: orgName,
            });
            if (result.success) {
                showToast('success', 'Organization updated');
                onUpdate?.();
            } else {
                showToast('error', result.error || 'Failed to update');
            }
        } catch {
            showToast('error', 'Failed to update organization');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-xl font-bold text-slate-900">Organization</h3>
                <p className="text-sm text-slate-500">Manage clinic branding and white-label settings.</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
                {/* Logo */}
                <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1.5">Clinic Logo</label>
                    <div className="flex items-center gap-4">
                        <div className="w-24 h-24 rounded-xl bg-slate-100 border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden">
                            {organization?.logoPath ? (
                                <img src={organization.logoPath} alt="Logo" className="w-full h-full object-contain" />
                            ) : (
                                <Building2 size={32} className="text-slate-300" />
                            )}
                        </div>
                        <div>
                            <button
                                onClick={() => setIsLogoPickerOpen(true)}
                                disabled={isSaving}
                                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50"
                            >
                                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                                Upload Logo
                            </button>
                            <p className="text-xs text-slate-400 mt-2">Recommended: 200x200px, PNG</p>
                            
                            <USBFilePicker 
                                isOpen={isLogoPickerOpen}
                                onClose={() => setIsLogoPickerOpen(false)}
                                onFilesSelected={async (files) => {
                                    const file = files[0];
                                    if (!file || !organization?.id) return;

                                    const reader = new FileReader();
                                    reader.onloadend = async () => {
                                        const base64 = reader.result as string;
                                        setIsSaving(true);
                                        try {
                                            const result = await updateOrganizationSettings({
                                                id: organization.id,
                                                logoPath: base64
                                            });
                                            if (result.success) {
                                                showToast('success', 'Logo uploaded');
                                                onUpdate?.();
                                            } else {
                                                showToast('error', 'Upload failed');
                                            }
                                        } catch {
                                            showToast('error', 'Error uploading logo');
                                        } finally {
                                            setIsSaving(false);
                                        }
                                    };
                                    reader.readAsDataURL(file);
                                }}
                                title="Select Clinic Logo"
                                accept="image/*"
                            />
                        </div>
                    </div>
                </div>

                {/* Name */}
                <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1.5">Organization Name</label>
                    <input
                        type="text"
                        value={orgName}
                        onChange={(e) => setOrgName(e.target.value)}
                        className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                        placeholder="e.g. Loyal Med Clinic"
                    />
                </div>

                {/* Save */}
                <div className="pt-4 border-t border-slate-100 flex justify-end">
                    <button
                        onClick={handleSaveOrg}
                        disabled={isSaving}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                    >
                        {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        Save Organization
                    </button>
                </div>
            </div>
        </div>
    );
}

function ProcedureToolsSection({ tools, onToggle }: { tools: ProcedureToolSettings; onToggle: <K extends keyof ProcedureToolSettings>(key: K, value: boolean) => void }) {
    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-xl font-bold text-slate-900">Procedure Tools</h3>
                <p className="text-sm text-slate-500">Toggle features on or off to customize your procedure workflow.</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
                {(Object.keys(PROCEDURE_TOOL_INFO) as (keyof ProcedureToolSettings)[]).map((key) => {
                    const info = PROCEDURE_TOOL_INFO[key];
                    const isEnabled = tools[key];

                    return (
                        <div key={key} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                            <div className="flex items-center gap-4">
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isEnabled ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                                    <info.icon size={20} />
                                </div>
                                <div>
                                    <div className="font-medium text-slate-900">{info.label}</div>
                                    <div className="text-sm text-slate-500">{info.description}</div>
                                </div>
                            </div>

                            <button
                                onClick={() => onToggle(key, !isEnabled)}
                                className={`relative w-12 h-7 rounded-full transition-colors ${isEnabled ? 'bg-blue-600' : 'bg-slate-200'}`}
                            >
                                <motion.div
                                    layout
                                    className="absolute top-1 w-5 h-5 bg-white rounded-full shadow-md"
                                    animate={{ left: isEnabled ? 26 : 4 }}
                                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                />
                            </button>
                        </div>
                    );
                })}
            </div>

            <div className="text-sm text-slate-500 bg-amber-50 border border-amber-100 rounded-lg p-4 flex items-start gap-3">
                <Bell size={18} className="text-amber-500 shrink-0 mt-0.5" />
                <div><strong className="text-amber-700">Note:</strong> Changes will take effect the next time you start a procedure.</div>
            </div>
        </div>
    );
}

function AppearanceSection({ settings, updateSetting }: { settings: any; updateSetting: any }) {
    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-xl font-bold text-slate-900">Appearance</h3>
                <p className="text-sm text-slate-500">Customize the look and feel of the application.</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
                {/* Theme */}
                <div>
                    <label className="block text-sm font-medium text-slate-600 mb-3">Theme</label>
                    <div className="flex gap-3">
                        {(['light', 'dark', 'system'] as const).map((theme) => (
                            <button
                                key={theme}
                                onClick={() => updateSetting('theme', theme)}
                                className={`flex-1 p-4 rounded-xl border-2 transition-all ${settings.theme === theme
                                    ? 'border-blue-500 bg-blue-50'
                                    : 'border-slate-200 hover:border-slate-300'
                                    }`}
                            >
                                <div className="text-sm font-medium capitalize text-slate-900">{theme}</div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Toggles */}
                {[
                    { key: 'compactMode', label: 'Compact Mode', desc: 'Reduce padding and spacing throughout the UI' },
                    { key: 'animations', label: 'Animations', desc: 'Enable smooth transitions and animations' },
                ].map(({ key, label, desc }) => (
                    <div key={key} className="flex items-center justify-between">
                        <div>
                            <div className="font-medium text-slate-900">{label}</div>
                            <div className="text-sm text-slate-500">{desc}</div>
                        </div>
                        <button
                            onClick={() => updateSetting(key as any, !settings[key])}
                            className={`relative w-12 h-7 rounded-full transition-colors ${settings[key] ? 'bg-blue-600' : 'bg-slate-200'}`}
                        >
                            <motion.div layout className="absolute top-1 w-5 h-5 bg-white rounded-full shadow-md" animate={{ left: settings[key] ? 26 : 4 }} transition={{ type: "spring", stiffness: 500, damping: 30 }} />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}


function ShortcutsSection({ shortcuts }: { shortcuts: any }) {
    const shortcutList = [
        { key: 'newPatient', label: 'New Patient', current: shortcuts.newPatient },
        { key: 'search', label: 'Focus Search', current: shortcuts.search },
        { key: 'settings', label: 'Open Settings', current: shortcuts.settings },
        { key: 'closeTab', label: 'Close Tab', current: shortcuts.closeTab },
        { key: 'capture', label: 'Capture Image', current: shortcuts.capture },
        { key: 'startRecording', label: 'Start Recording', current: shortcuts.startRecording },
        { key: 'stopRecording', label: 'Stop Recording', current: shortcuts.stopRecording },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-xl font-bold text-slate-900">Keyboard Shortcuts</h3>
                <p className="text-sm text-slate-500">View and customize keyboard shortcuts.</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
                {shortcutList.map((shortcut) => (
                    <div key={shortcut.key} className="p-4 flex items-center justify-between">
                        <div className="font-medium text-slate-900">{shortcut.label}</div>
                        <kbd className="px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-sm font-mono text-slate-600">
                            {shortcut.current}
                        </kbd>
                    </div>
                ))}
            </div>
        </div>
    );
}

function DataSection({ user, showToast }: { user: SettingsPanelProps['user']; showToast: (type: 'success' | 'error', msg: string) => void }) {
    const [isExporting, setIsExporting] = useState<string | null>(null);
    const [stats, setStats] = useState<{ patientCount: number; procedureCount: number; reportCount: number; mediaCount: number } | null>(null);
    const [isLoadingStats, setIsLoadingStats] = useState(true);
    const [showPinModal, setShowPinModal] = useState(false);
    const [pinInput, setPinInput] = useState('');
    const [pinError, setPinError] = useState('');

    const isAdmin = user.role === 'ADMIN' || user.role === 'admin';

    // Load statistics on mount
    useEffect(() => {
        async function loadStats() {
            setIsLoadingStats(true);
            try {
                const result = await getExportStatistics();
                if (result.success && result.stats) {
                    setStats(result.stats);
                }
            } catch {
                console.error('Failed to load stats');
            } finally {
                setIsLoadingStats(false);
            }
        }
        loadStats();
    }, []);

    // Trigger file download
    const downloadFile = (content: string, filename: string, mimeType: string) => {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleExportPatients = async () => {
        setIsExporting('Patients');
        try {
            const result = await exportPatientsCSV();
            if (result.success && result.data) {
                downloadFile(result.data, result.filename || 'patients.csv', 'text/csv');
                showToast('success', `Exported ${result.count} patients`);
            } else {
                showToast('error', result.error || 'Export failed');
            }
        } catch {
            showToast('error', 'Failed to export');
        } finally {
            setIsExporting(null);
        }
    };

    const handleExportSettings = async () => {
        setIsExporting('Settings');
        try {
            const result = await exportSettingsBackup(user.id);
            if (result.success && result.data) {
                downloadFile(result.data, result.filename || 'settings.json', 'application/json');
                showToast('success', 'Settings exported');
            } else {
                showToast('error', result.error || 'Export failed');
            }
        } catch {
            showToast('error', 'Failed to export');
        } finally {
            setIsExporting(null);
        }
    };

    const handleDangerAction = () => {
        if (!isAdmin) {
            showToast('error', 'Only admins can perform this action');
            return;
        }
        setShowPinModal(true);
        setPinInput('');
        setPinError('');
    };

    const handlePinSubmit = async () => {
        // Default PIN is 1234, but in production this would come from the database
        const correctPin = '1234';
        if (pinInput === correctPin) {
            setIsLoadingStats(true); // Show loading while purging
            try {
                const { purgeAllData } = await import("@/app/actions/admin");
                const result = await purgeAllData();
                if (result.success) {
                    showToast('success', 'System data purged successfully');
                    // Refresh stats
                    const statsResult = await getExportStatistics();
                    if (statsResult.success && statsResult.stats) setStats(statsResult.stats);
                } else {
                    showToast('error', result.error || 'Purge failed');
                }
            } catch {
                showToast('error', 'Failed to purge data');
            } finally {
                setIsLoadingStats(false);
                setShowPinModal(false);
            }
        } else {
            setPinError('Incorrect PIN');
        }
    };

    const statItems = [
        { label: 'Patients', value: stats?.patientCount ?? 0, icon: Users, color: 'blue', gradient: 'from-blue-500 to-indigo-600' },
        { label: 'Procedures', value: stats?.procedureCount ?? 0, icon: Camera, color: 'emerald', gradient: 'from-emerald-500 to-teal-600' },
        { label: 'Reports', value: stats?.reportCount ?? 0, icon: FileText, color: 'violet', gradient: 'from-violet-500 to-purple-600' },
        { label: 'Media', value: stats?.mediaCount ?? 0, icon: Image, color: 'amber', gradient: 'from-amber-500 to-orange-600' },
    ];

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-xl font-bold text-slate-900">Data & Export</h3>
                    <p className="text-sm text-slate-500">Manage your data and exports</p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                    <span className={`px-2 py-1 rounded-full font-medium ${isAdmin ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {isAdmin ? '🔐 Admin Access' : '👤 Limited Access'}
                    </span>
                </div>
            </div>

            {/* Statistics Row - Modern Glass Cards */}
            <div className="grid grid-cols-4 gap-3">
                {isLoadingStats ? (
                    Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />
                    ))
                ) : (
                    statItems.map((item) => (
                        <div
                            key={item.label}
                            className="relative overflow-hidden rounded-xl bg-gradient-to-br p-[1px]"
                            style={{ backgroundImage: `linear-gradient(135deg, var(--tw-gradient-stops))` }}
                        >
                            <div className={`bg-gradient-to-br ${item.gradient} rounded-xl p-4 h-full`}>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="text-white/70 text-xs font-medium uppercase tracking-wider">{item.label}</div>
                                        <div className="text-2xl font-bold text-white mt-0.5">{item.value.toLocaleString()}</div>
                                    </div>
                                    <div className="w-10 h-10 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center">
                                        <item.icon size={20} className="text-white" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Export & Danger Zone - Side by Side */}
            <div className="grid grid-cols-3 gap-4">
                {/* Export Section - Takes 2 columns */}
                <div className="col-span-2 bg-white rounded-xl border border-slate-200 p-4">
                    <h4 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                        <Download size={16} className="text-blue-600" />
                        Quick Export
                    </h4>
                    <div className="grid grid-cols-4 gap-2">
                        <button
                            onClick={handleExportPatients}
                            disabled={isExporting !== null}
                            className="group p-3 border border-slate-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-all text-center disabled:opacity-50"
                        >
                            {isExporting === 'Patients' ? (
                                <Loader2 size={20} className="text-blue-600 mx-auto animate-spin" />
                            ) : (
                                <Users size={20} className="text-blue-600 mx-auto group-hover:scale-110 transition-transform" />
                            )}
                            <div className="text-xs font-medium text-slate-700 mt-1.5">Patients</div>
                            <div className="text-[10px] text-slate-400">CSV</div>
                        </button>

                        <button
                            disabled={true}
                            className="p-3 border border-slate-100 rounded-lg text-center opacity-40 cursor-not-allowed"
                        >
                            <FileText size={20} className="text-slate-400 mx-auto" />
                            <div className="text-xs font-medium text-slate-400 mt-1.5">Reports</div>
                            <div className="text-[10px] text-slate-300">Soon</div>
                        </button>

                        <button
                            disabled={true}
                            className="p-3 border border-slate-100 rounded-lg text-center opacity-40 cursor-not-allowed"
                        >
                            <Image size={20} className="text-slate-400 mx-auto" />
                            <div className="text-xs font-medium text-slate-400 mt-1.5">Media</div>
                            <div className="text-[10px] text-slate-300">Soon</div>
                        </button>

                        <button
                            onClick={handleExportSettings}
                            disabled={isExporting !== null}
                            className="group p-3 border border-slate-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-all text-center disabled:opacity-50"
                        >
                            {isExporting === 'Settings' ? (
                                <Loader2 size={20} className="text-blue-600 mx-auto animate-spin" />
                            ) : (
                                <Settings2 size={20} className="text-blue-600 mx-auto group-hover:scale-110 transition-transform" />
                            )}
                            <div className="text-xs font-medium text-slate-700 mt-1.5">Settings</div>
                            <div className="text-[10px] text-slate-400">JSON</div>
                        </button>
                    </div>
                </div>

                {/* Danger Zone - 1 column */}
                <div className="bg-gradient-to-br from-red-50 to-rose-50 rounded-xl border border-red-200 p-4">
                    <h4 className="font-semibold text-red-800 flex items-center gap-2 text-sm">
                        <Shield size={14} className="text-red-600" />
                        Danger Zone
                    </h4>
                    <p className="text-xs text-red-600/80 mt-1 mb-3">
                        {isAdmin ? 'Admin PIN required' : 'Admin access only'}
                    </p>
                    <button
                        onClick={handleDangerAction}
                        disabled={!isAdmin}
                        className={`w-full py-2 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-1.5 ${isAdmin
                            ? 'bg-red-600 text-white hover:bg-red-700'
                            : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                            }`}
                    >
                        <Trash2 size={12} />
                        {isAdmin ? 'Erase System Data' : 'Clear Local Cache'}
                    </button>
                </div>
            </div>

            {/* PIN Modal */}
            <AnimatePresence>
                {showPinModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]"
                        onClick={() => setShowPinModal(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-white rounded-2xl p-6 w-80 shadow-2xl"
                        >
                            <div className="text-center mb-4">
                                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <Shield size={24} className="text-red-600" />
                                </div>
                                <h3 className="font-bold text-slate-900">Admin Verification</h3>
                                <p className="text-sm text-slate-500 mt-1">Enter your security PIN to proceed</p>
                            </div>

                            <input
                                type="password"
                                value={pinInput}
                                onChange={(e) => {
                                    setPinInput(e.target.value);
                                    setPinError('');
                                }}
                                placeholder="Enter PIN"
                                maxLength={6}
                                className={`w-full h-12 px-4 text-center text-xl font-mono tracking-widest border rounded-lg outline-none transition-colors ${pinError ? 'border-red-500 bg-red-50' : 'border-slate-200 focus:border-blue-500'
                                    }`}
                                autoFocus
                            />
                            {pinError && (
                                <p className="text-red-500 text-xs text-center mt-2">{pinError}</p>
                            )}

                            <div className="flex gap-2 mt-4">
                                <button
                                    onClick={() => setShowPinModal(false)}
                                    className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handlePinSubmit}
                                    className="flex-1 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
                                >
                                    Confirm
                                </button>
                            </div>

                            <p className="text-[10px] text-slate-400 text-center mt-4">
                                Default PIN: 1234 (Change in Admin Settings)
                            </p>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

const generateId = () => `scope-${Date.now()}`;

function ScopeProfilesSection({ settings, updateSetting, showToast }: { settings: any; updateSetting: any; showToast: any }) {
    const [isEditing, setIsEditing] = useState<string | null>(null); // 'new' or profileId
    const [editForm, setEditForm] = useState<any>({});
    const [profiles, setProfiles] = useState<any[]>(settings.scopeProfiles || []);

    useEffect(() => {
        setProfiles(settings.scopeProfiles || []);
    }, [settings.scopeProfiles]);

    const handleEdit = (profile: any) => {
        setEditForm({ ...profile });
        setIsEditing(profile.id);
    };

    const handleCreate = () => {
        const newProfile = {
            id: generateId(),
            name: 'New Scope',
            manufacturer: '',
            model: '',
            shape: 'circle',
            captureArea: { x: 0.5, y: 0.5, width: 0.8, height: 0.8 },
            isDefault: false,
            lastUsed: Date.now(),
        };
        setEditForm(newProfile);
        setIsEditing('new');
    };

    const handleSaveProfile = () => {
        let updatedProfiles = [...profiles];
        if (isEditing === 'new') {
            updatedProfiles.push(editForm);
        } else {
            updatedProfiles = updatedProfiles.map(p => p.id === isEditing ? editForm : p);
        }

        // If this is the first profile, make it default
        if (updatedProfiles.length === 1) {
            updatedProfiles[0].isDefault = true;
        }

        updateSetting('scopeProfiles', updatedProfiles);
        setIsEditing(null);
        showToast('success', isEditing === 'new' ? 'Scope profile created' : 'Scope profile updated');
    };

    const handleDelete = (id: string) => {
        if (confirm('Are you sure you want to delete this profile?')) {
            const updatedProfiles = profiles.filter(p => p.id !== id);
            if (updatedProfiles.length > 0 && !updatedProfiles.some(p => p.isDefault)) {
                updatedProfiles[0].isDefault = true; // Ensure there's always a default
            }
            updateSetting('scopeProfiles', updatedProfiles);
            showToast('success', 'Profile deleted');
        }
    };

    const handleSetDefault = (id: string) => {
        const updatedProfiles = profiles.map(p => ({
            ...p,
            isDefault: p.id === id
        }));
        updateSetting('scopeProfiles', updatedProfiles);
        updateSetting('activeScopeId', id); // Auto-switch active scope too
        showToast('success', 'Default scope updated');
    };

    const handleDuplicate = (profile: any) => {
        const newProfile = {
            ...profile,
            id: generateId(),
            name: `${profile.name} (Copy)`,
            isDefault: false,
        };
        const updatedProfiles = [...profiles, newProfile];
        updateSetting('scopeProfiles', updatedProfiles);
        showToast('success', 'Profile duplicated');
    };

    if (isEditing) {
        return (
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-xl font-bold text-slate-900">{isEditing === 'new' ? 'New Scope Profile' : 'Edit Scope Profile'}</h3>
                        <p className="text-sm text-slate-500">Configure your scope details and capture area.</p>
                    </div>
                    <button onClick={() => setIsEditing(null)} className="text-sm text-slate-500 hover:text-slate-700">Cancel</button>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1.5">Profile Name</label>
                            <input
                                type="text"
                                value={editForm.name}
                                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500"
                                placeholder="e.g. Olympus GI-180"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1.5">Manufacturer</label>
                            <input
                                type="text"
                                value={editForm.manufacturer || ''}
                                onChange={(e) => setEditForm({ ...editForm, manufacturer: e.target.value })}
                                className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500"
                                placeholder="e.g. Olympus"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1.5">Model</label>
                            <input
                                type="text"
                                value={editForm.model || ''}
                                onChange={(e) => setEditForm({ ...editForm, model: e.target.value })}
                                className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500"
                                placeholder="e.g. GIF-H190"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1.5">Capture Shape</label>
                            <div className="flex bg-slate-100 rounded-lg p-1">
                                {['circle', 'square', 'rect'].map((shape) => (
                                    <button
                                        key={shape}
                                        onClick={() => setEditForm({ ...editForm, shape })}
                                        className={`flex-1 py-1.5 text-xs font-medium rounded-md capitalize transition-all ${editForm.shape === shape ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        {shape}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Placeholder for Visual Editor */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 flex flex-col items-center justify-center text-center">
                        <div className="w-16 h-16 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mb-4">
                            <MousePointer2 size={32} />
                        </div>
                        <h4 className="font-semibold text-slate-900 mb-1">Visual Capture Editor</h4>
                        <p className="text-sm text-slate-500 max-w-sm mb-4">Drag and resize the capture area directly on the camera feed in Phase 3.</p>
                        <div className="text-xs font-mono bg-slate-200 px-3 py-1 rounded text-slate-600">
                            Current: {Math.round(editForm.captureArea.width * 100)}% x {Math.round(editForm.captureArea.height * 100)}% @ {Math.round(editForm.captureArea.x * 100)}%, {Math.round(editForm.captureArea.y * 100)}%
                        </div>
                    </div>

                    <div className="flex justify-end pt-4 border-t border-slate-100">
                        <button
                            onClick={handleSaveProfile}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2"
                        >
                            <Save size={16} />
                            Save Profile
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-xl font-bold text-slate-900">Scope Profiles</h3>
                    <p className="text-sm text-slate-500">Manage different medical scopes and their settings.</p>
                </div>
                <button
                    onClick={handleCreate}
                    className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2"
                >
                    <Plus size={16} />
                    Add New Scope
                </button>
            </div>

            <div className="grid gap-3">
                {profiles.map((profile: any) => (
                    <div key={profile.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4 hover:border-blue-300 transition-all group">
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${profile.shape === 'circle' ? 'rounded-full' : ''} bg-slate-100 text-slate-500`}>
                            <Microscope size={24} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <h4 className="font-bold text-slate-900 truncate">{profile.name}</h4>
                                {profile.isDefault && (
                                    <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                                        <Star size={10} fill="currentColor" /> Default
                                    </span>
                                )}
                            </div>
                            <div className="text-xs text-slate-500">
                                {profile.manufacturer} {profile.model ? `• ${profile.model}` : ''} • {profile.shape}
                            </div>
                        </div>

                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {!profile.isDefault && (
                                <button
                                    onClick={() => handleSetDefault(profile.id)}
                                    className="p-2 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg"
                                    title="Set as Default"
                                >
                                    <Star size={16} />
                                </button>
                            )}
                            <button
                                onClick={() => handleDuplicate(profile)}
                                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                                title="Duplicate"
                            >
                                <Copy size={16} />
                            </button>
                            <button
                                onClick={() => handleEdit(profile)}
                                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                                title="Edit"
                            >
                                <Edit2 size={16} />
                            </button>
                            <button
                                onClick={() => handleDelete(profile.id)}
                                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                                title="Delete"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <AchievementBadge count={profiles.length} />
        </div>
    );
}

function AchievementBadge({ count }: { count: number }) {
    if (count < 3) return null;
    return (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm text-lg">🎯</div>
            <div>
                <div className="text-sm font-bold text-slate-800">Scope Master!</div>
                <div className="text-xs text-slate-500">You have configured {count} distinct scope profiles.</div>
            </div>
        </div>
    )
}



