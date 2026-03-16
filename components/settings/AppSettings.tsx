"use client";

import React, { useState, useEffect } from "react";
import {
    Moon, Sun, Bell, BellOff, Globe, Database, Download, Trash2,
    Shield, Eye, EyeOff, Monitor, Laptop, Smartphone, RefreshCw,
    Save, Check, AlertTriangle, Info, Palette, Volume2, VolumeX,
    Clock, Calendar, FileText, HardDrive, Cloud, Wifi, WifiOff,
    ChevronRight, ToggleLeft, ToggleRight, Zap, Settings2, Maximize2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useSettings, SettingsState } from "@/contexts/SettingsContext";
import DataManagement from "./DataManagement";
import { useConfirm } from "@/lib/hooks/useConfirm";

interface AppSettingsProps {
    onClose?: () => void;
}

const accentColors = [
    { name: 'Blue', value: '#3B82F6' },
    { name: 'Indigo', value: '#6366F1' },
    { name: 'Purple', value: '#8B5CF6' },
    { name: 'Pink', value: '#EC4899' },
    { name: 'Rose', value: '#F43F5E' },
    { name: 'Orange', value: '#F97316' },
    { name: 'Amber', value: '#F59E0B' },
    { name: 'Emerald', value: '#10B981' },
    { name: 'Teal', value: '#14B8A6' },
    { name: 'Cyan', value: '#06B6D4' },
];



export default function AppSettings({ onClose }: AppSettingsProps) {
    const { settings, updateSetting, saveSettings, resetSettings, hasChanges } = useSettings();
    const [activeSection, setActiveSection] = useState('appearance');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const confirm = useConfirm();

    const handleSave = async () => {
        setSaving(true);
        await saveSettings();
        setSaving(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const handleReset = async () => {
        const ok = await confirm({
            title: 'Reset Settings',
            message: 'Reset all settings to defaults? This cannot be undone.',
            confirmLabel: 'Reset Everything',
            variant: 'danger'
        });
        if (ok) {
            resetSettings();
        }
    };

    const exportSettings = () => {
        const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'loyalmed-settings.json';
        a.click();
        URL.revokeObjectURL(url);
    };

    const sections = [
        { id: 'appearance', icon: Palette, label: 'Appearance' },
        { id: 'notifications', icon: Bell, label: 'Notifications' },
        { id: 'procedure', icon: Zap, label: 'Procedures' },
        { id: 'reports', icon: FileText, label: 'Reports' },
        { id: 'data', icon: Database, label: 'Data & Storage' },
        { id: 'privacy', icon: Shield, label: 'Privacy' },
        { id: 'system', icon: Settings2, label: 'System' },
    ];

    const Toggle = ({ enabled, onChange, disabled = false }: { enabled: boolean; onChange: (v: boolean) => void; disabled?: boolean }) => (
        <button
            onClick={() => !disabled && onChange(!enabled)}
            className={`relative w-12 h-6 rounded-full transition-colors ${enabled ? 'bg-blue-600' : 'bg-slate-300'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
            <motion.div
                animate={{ x: enabled ? 24 : 2 }}
                className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-md"
            />
        </button>
    );

    const SettingRow = ({ icon: Icon, label, description, children }: { icon: any; label: string; description?: string; children: React.ReactNode }) => (
        <div className="flex items-center justify-between py-4 border-b border-slate-100 last:border-0">
            <div className="flex items-start gap-3">
                <div className="p-2 bg-slate-100 rounded-lg text-slate-500">
                    <Icon size={18} />
                </div>
                <div>
                    <div className="font-semibold text-slate-900">{label}</div>
                    {description && <div className="text-sm text-slate-500 mt-0.5">{description}</div>}
                </div>
            </div>
            <div className="flex-shrink-0 ml-4">
                {children}
            </div>
        </div>
    );

    return (
        <div className="max-w-5xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-black text-slate-900">App Settings</h1>
                    <p className="text-slate-500 mt-1">Customize your LoyalMed experience</p>
                </div>
                <div className="flex items-center gap-3">
                    {hasChanges && (
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="text-sm text-amber-600 font-medium flex items-center gap-2"
                        >
                            <AlertTriangle size={16} /> Unsaved changes
                        </motion.div>
                    )}
                    {saved && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="text-sm text-emerald-600 font-medium flex items-center gap-2"
                        >
                            <Check size={16} /> Saved!
                        </motion.div>
                    )}
                    <button
                        onClick={handleSave}
                        disabled={!hasChanges || saving}
                        className={`px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition-all ${hasChanges && !saving
                            ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-500/20'
                            : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            }`}
                    >
                        {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                        {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>

            <div className="flex gap-8">
                {/* Sidebar */}
                <div className="w-56 flex-shrink-0">
                    <nav className="space-y-1">
                        {sections.map(section => (
                            <button
                                key={section.id}
                                onClick={() => setActiveSection(section.id)}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${activeSection === section.id
                                    ? 'bg-blue-50 text-blue-600'
                                    : 'text-slate-600 hover:bg-slate-50'
                                    }`}
                            >
                                <section.icon size={18} />
                                {section.label}
                            </button>
                        ))}
                    </nav>

                    <div className="mt-8 pt-6 border-t border-slate-200 space-y-2">
                        <button
                            onClick={exportSettings}
                            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                        >
                            <Download size={16} /> Export Settings
                        </button>
                        <button
                            onClick={handleReset}
                            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-rose-500 hover:bg-rose-50 transition-colors"
                        >
                            <RefreshCw size={16} /> Reset to Defaults
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-lg p-6">
                    <AnimatePresence mode="wait">
                        {/* Appearance */}
                        {activeSection === 'appearance' && (
                            <motion.div
                                key="appearance"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                            >
                                <h2 className="text-lg font-bold text-slate-900 mb-4">Appearance</h2>

                                {/* Theme with Live Preview */}
                                <div className="py-4 border-b border-slate-100">
                                    <div className="flex items-start gap-3 mb-4">
                                        <div className="p-2 bg-slate-100 rounded-lg text-slate-500">
                                            <Sun size={18} />
                                        </div>
                                        <div>
                                            <div className="font-semibold text-slate-900">Theme</div>
                                            <div className="text-sm text-slate-500 mt-0.5">Choose your preferred color scheme</div>
                                        </div>
                                    </div>

                                    {/* Theme Preview Cards */}
                                    <div className="grid grid-cols-3 gap-4 mt-4">
                                        {/* Light Theme */}
                                        <button
                                            onClick={() => updateSetting('theme', 'light')}
                                            className={`relative rounded-xl overflow-hidden border-2 transition-all hover:scale-[1.02] ${settings.theme === 'light'
                                                ? 'border-blue-500 ring-4 ring-blue-100'
                                                : 'border-slate-200 hover:border-slate-300'
                                                }`}
                                        >
                                            {/* Light Preview */}
                                            <div className="bg-[#F8FAFC] p-3 h-28">
                                                <div className="bg-white rounded-lg h-4 w-full mb-2 shadow-sm" />
                                                <div className="flex gap-2">
                                                    <div className="bg-blue-500 rounded-lg h-12 w-12 flex-shrink-0" />
                                                    <div className="flex-1 space-y-1.5">
                                                        <div className="bg-slate-200 rounded h-2.5 w-full" />
                                                        <div className="bg-slate-200 rounded h-2 w-3/4" />
                                                        <div className="bg-slate-100 rounded h-2 w-1/2" />
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="bg-white py-2 px-3 flex items-center justify-between">
                                                <span className="text-sm font-semibold text-slate-700">Light</span>
                                                {settings.theme === 'light' && (
                                                    <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                                                        <Check size={12} className="text-white" />
                                                    </div>
                                                )}
                                            </div>
                                        </button>

                                        {/* Dark Theme */}
                                        <button
                                            onClick={() => updateSetting('theme', 'dark')}
                                            className={`relative rounded-xl overflow-hidden border-2 transition-all hover:scale-[1.02] ${settings.theme === 'dark'
                                                ? 'border-blue-500 ring-4 ring-blue-100'
                                                : 'border-slate-200 hover:border-slate-300'
                                                }`}
                                        >
                                            {/* Dark Preview */}
                                            <div className="bg-[#0F172A] p-3 h-28">
                                                <div className="bg-[#1E293B] rounded-lg h-4 w-full mb-2" />
                                                <div className="flex gap-2">
                                                    <div className="bg-blue-500 rounded-lg h-12 w-12 flex-shrink-0" />
                                                    <div className="flex-1 space-y-1.5">
                                                        <div className="bg-slate-600 rounded h-2.5 w-full" />
                                                        <div className="bg-slate-600 rounded h-2 w-3/4" />
                                                        <div className="bg-slate-700 rounded h-2 w-1/2" />
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="bg-[#1E293B] py-2 px-3 flex items-center justify-between">
                                                <span className="text-sm font-semibold text-slate-200">Dark</span>
                                                {settings.theme === 'dark' && (
                                                    <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                                                        <Check size={12} className="text-white" />
                                                    </div>
                                                )}
                                            </div>
                                        </button>

                                        {/* Auto/System Theme */}
                                        <button
                                            onClick={() => updateSetting('theme', 'system')}
                                            className={`relative rounded-xl overflow-hidden border-2 transition-all hover:scale-[1.02] ${settings.theme === 'system'
                                                ? 'border-blue-500 ring-4 ring-blue-100'
                                                : 'border-slate-200 hover:border-slate-300'
                                                }`}
                                        >
                                            {/* Split Preview */}
                                            <div className="h-28 flex">
                                                <div className="bg-[#F8FAFC] p-2 flex-1">
                                                    <div className="bg-white rounded h-3 w-full mb-1.5 shadow-sm" />
                                                    <div className="bg-slate-200 rounded h-2 w-3/4 mb-1" />
                                                    <div className="bg-slate-100 rounded h-2 w-1/2" />
                                                </div>
                                                <div className="bg-[#0F172A] p-2 flex-1">
                                                    <div className="bg-[#1E293B] rounded h-3 w-full mb-1.5" />
                                                    <div className="bg-slate-600 rounded h-2 w-3/4 mb-1" />
                                                    <div className="bg-slate-700 rounded h-2 w-1/2" />
                                                </div>
                                            </div>
                                            <div className="bg-gradient-to-r from-white to-[#1E293B] py-2 px-3 flex items-center justify-between">
                                                <span className="text-sm font-semibold text-slate-700">Auto</span>
                                                {settings.theme === 'system' && (
                                                    <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                                                        <Check size={12} className="text-white" />
                                                    </div>
                                                )}
                                            </div>
                                        </button>
                                    </div>

                                    <p className="text-xs text-slate-400 mt-3">
                                        {settings.theme === 'system'
                                            ? 'Theme follows your system preference'
                                            : settings.theme === 'dark'
                                                ? 'Easier on the eyes in low-light environments'
                                                : 'Best visibility in well-lit environments'
                                        }
                                    </p>
                                </div>

                                <SettingRow icon={Palette} label="Accent Color" description="Primary color for buttons and highlights">
                                    <div className="flex gap-2">
                                        {accentColors.map(color => (
                                            <button
                                                key={color.value}
                                                onClick={() => updateSetting('accentColor', color.value)}
                                                className={`w-8 h-8 rounded-full transition-all ${settings.accentColor === color.value ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : 'hover:scale-110'
                                                    }`}
                                                style={{ backgroundColor: color.value }}
                                                title={color.name}
                                            />
                                        ))}
                                    </div>
                                </SettingRow>

                                <SettingRow icon={Monitor} label="Compact Mode" description="Reduce spacing for more content on screen">
                                    <Toggle enabled={settings.compactMode} onChange={(v) => updateSetting('compactMode', v)} />
                                </SettingRow>

                                <SettingRow icon={Zap} label="Animations" description="Enable smooth transitions and effects">
                                    <Toggle enabled={settings.animations} onChange={(v) => updateSetting('animations', v)} />
                                </SettingRow>
                            </motion.div>
                        )}

                        {/* Notifications */}
                        {activeSection === 'notifications' && (
                            <motion.div
                                key="notifications"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                            >
                                <h2 className="text-lg font-bold text-slate-900 mb-4">Notifications</h2>

                                <SettingRow icon={Bell} label="Enable Notifications" description="Receive alerts and updates">
                                    <Toggle enabled={settings.notificationsEnabled} onChange={(v) => updateSetting('notificationsEnabled', v)} />
                                </SettingRow>

                                <SettingRow icon={Volume2} label="Sound Effects" description="Play sounds for notifications">
                                    <Toggle
                                        enabled={settings.soundEnabled}
                                        onChange={(v) => updateSetting('soundEnabled', v)}
                                        disabled={!settings.notificationsEnabled}
                                    />
                                </SettingRow>

                                <SettingRow icon={Monitor} label="Desktop Notifications" description="Show system notifications">
                                    <Toggle
                                        enabled={settings.desktopNotifications}
                                        onChange={(v) => updateSetting('desktopNotifications', v)}
                                        disabled={!settings.notificationsEnabled}
                                    />
                                </SettingRow>

                                <SettingRow icon={Globe} label="Email Notifications" description="Receive important updates via email">
                                    <Toggle
                                        enabled={settings.emailNotifications}
                                        onChange={(v) => updateSetting('emailNotifications', v)}
                                        disabled={!settings.notificationsEnabled}
                                    />
                                </SettingRow>
                            </motion.div>
                        )}

                        {/* Procedure Settings */}
                        {activeSection === 'procedure' && (
                            <motion.div
                                key="procedure"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                            >
                                <h2 className="text-lg font-bold text-slate-900 mb-4">Procedure Settings</h2>

                                <SettingRow icon={FileText} label="Default Procedure Type" description="Pre-selected when starting new procedure">
                                    <select
                                        value={settings.defaultProcedureType}
                                        onChange={(e) => updateSetting('defaultProcedureType', e.target.value)}
                                        className="px-4 py-2 bg-slate-100 rounded-lg text-sm font-medium text-slate-700 border-0 focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="EGD">EGD (Gastroscopy)</option>
                                        <option value="Colonoscopy">Colonoscopy</option>
                                        <option value="ERCP">ERCP</option>
                                        <option value="Bronchoscopy">Bronchoscopy</option>
                                    </select>
                                </SettingRow>

                                <SettingRow icon={Zap} label="Auto-Start Recording" description="Start recording when procedure begins">
                                    <Toggle enabled={settings.procedureTools.autoStartRecording} onChange={(v) => updateSetting('procedureTools', { ...settings.procedureTools, autoStartRecording: v })} />
                                </SettingRow>

                                <SettingRow icon={Monitor} label="Capture Quality" description="Image resolution for captures">
                                    <select
                                        value={settings.captureQuality}
                                        onChange={(e) => updateSetting('captureQuality', e.target.value as any)}
                                        className="px-4 py-2 bg-slate-100 rounded-lg text-sm font-medium text-slate-700 border-0 focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="low">Low (720p)</option>
                                        <option value="medium">Medium (1080p)</option>
                                        <option value="high">High (1440p)</option>
                                        <option value="ultra">Ultra (4K)</option>
                                    </select>
                                </SettingRow>

                                <SettingRow icon={Maximize2} label="Aspect Ratio Correction" description="Fix stretched or squished camera feeds">
                                    <select
                                        value={settings.aspectRatio}
                                        onChange={(e) => updateSetting('aspectRatio', e.target.value as any)}
                                        className="px-4 py-2 bg-slate-100 rounded-lg text-sm font-medium text-slate-700 border-0 focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="16:9">Default (16:9)</option>
                                        <option value="4:3 (Stretch Thin)">4:3 (Stretch Thin)</option>
                                        <option value="4:3 (Squeeze Wide)">4:3 (Squeeze Wide)</option>
                                        <option value="1:1">Square (1:1)</option>
                                    </select>
                                </SettingRow>
                            </motion.div>
                        )}

                        {/* Reports */}
                        {activeSection === 'reports' && (
                            <motion.div
                                key="reports"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                            >
                                <h2 className="text-lg font-bold text-slate-900 mb-4">Report Settings</h2>

                                <SettingRow icon={FileText} label="Default Format" description="Preferred format for generated reports">
                                    <div className="flex gap-2">
                                        {(['pdf', 'docx'] as const).map(format => (
                                            <button
                                                key={format}
                                                onClick={() => updateSetting('defaultReportFormat', format)}
                                                className={`px-4 py-2 rounded-lg text-sm font-medium uppercase transition-all ${settings.defaultReportFormat === format
                                                    ? 'bg-blue-600 text-white'
                                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                    }`}
                                            >
                                                {format}
                                            </button>
                                        ))}
                                    </div>
                                </SettingRow>

                                <SettingRow icon={Clock} label="Include Timestamps" description="Add procedure time to reports">
                                    <Toggle enabled={settings.includeTimestamps} onChange={(v) => updateSetting('includeTimestamps', v)} />
                                </SettingRow>

                                <SettingRow icon={Shield} label="Include Watermark" description="Add organization watermark to PDFs">
                                    <Toggle enabled={settings.includeWatermark} onChange={(v) => updateSetting('includeWatermark', v)} />
                                </SettingRow>
                            </motion.div>
                        )}

                        {/* Data & Storage */}
                        {activeSection === 'data' && (
                            <motion.div
                                key="data"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                            >
                                <h2 className="text-lg font-bold text-slate-900 mb-4">Data & Storage</h2>

                                <SettingRow icon={Save} label="Auto-Save" description="Automatically save changes">
                                    <Toggle enabled={settings.autoSave} onChange={(v) => updateSetting('autoSave', v)} />
                                </SettingRow>

                                <SettingRow icon={Clock} label="Auto-Save Interval" description="How often to save (in minutes)">
                                    <select
                                        value={settings.autoSaveInterval}
                                        onChange={(e) => updateSetting('autoSaveInterval', parseInt(e.target.value))}
                                        disabled={!settings.autoSave}
                                        className="px-4 py-2 bg-slate-100 rounded-lg text-sm font-medium text-slate-700 border-0 focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                                    >
                                        <option value={1}>Every 1 minute</option>
                                        <option value={2}>Every 2 minutes</option>
                                        <option value={5}>Every 5 minutes</option>
                                        <option value={10}>Every 10 minutes</option>
                                    </select>
                                </SettingRow>

                                <SettingRow icon={HardDrive} label="Enable Cache" description="Cache data for faster loading">
                                    <Toggle enabled={settings.cacheEnabled} onChange={(v) => updateSetting('cacheEnabled', v)} />
                                </SettingRow>

                                <div className="my-6 border-t border-slate-100" />
                                <DataManagement />

                                {/* Offline-First Info */}
                                <div className="mt-6 p-4 bg-emerald-50 rounded-xl">
                                    <div className="flex gap-3">
                                        <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600 flex-shrink-0">
                                            <WifiOff size={18} />
                                        </div>
                                        <div>
                                            <div className="font-semibold text-emerald-900">Offline-First Architecture</div>
                                            <div className="text-sm text-emerald-700 mt-1">
                                                LoyalMed is designed to work completely offline. All data is stored locally
                                                on your device and no internet connection is required for daily operations.
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-4 p-4 bg-slate-50 rounded-xl">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-sm font-medium text-slate-700">Storage Used</span>
                                        <span className="text-sm text-slate-500">2.4 GB / 10 GB</span>
                                    </div>
                                    <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                                        <div className="h-full bg-blue-500 rounded-full" style={{ width: '24%' }} />
                                    </div>
                                    <button className="mt-4 text-sm text-rose-500 font-medium hover:underline">
                                        Clear Cache (124 MB)
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {/* Privacy */}
                        {activeSection === 'privacy' && (
                            <motion.div
                                key="privacy"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                            >
                                <h2 className="text-lg font-bold text-slate-900 mb-4">Privacy & Security</h2>

                                <SettingRow icon={Eye} label="Usage Analytics" description="Help improve LoyalMed with anonymous data">
                                    <Toggle enabled={settings.analyticsEnabled} onChange={(v) => updateSetting('analyticsEnabled', v)} />
                                </SettingRow>

                                <SettingRow icon={AlertTriangle} label="Crash Reporting" description="Send crash reports to help fix bugs">
                                    <Toggle enabled={settings.crashReporting} onChange={(v) => updateSetting('crashReporting', v)} />
                                </SettingRow>

                                <div className="mt-6 p-4 bg-blue-50 rounded-xl">
                                    <div className="flex gap-3">
                                        <Info className="text-blue-500 flex-shrink-0" size={20} />
                                        <div>
                                            <div className="font-medium text-blue-900">Your privacy matters</div>
                                            <div className="text-sm text-blue-700 mt-1">
                                                We never share your personal information or patient data with third parties.
                                                All data is encrypted and stored securely.
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* System */}
                        {activeSection === 'system' && (
                            <motion.div
                                key="system"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                            >
                                <h2 className="text-lg font-bold text-slate-900 mb-4">System Settings</h2>

                                <SettingRow icon={Globe} label="Language" description="App display language">
                                    <select
                                        value={settings.language}
                                        onChange={(e) => updateSetting('language', e.target.value)}
                                        className="px-4 py-2 bg-slate-100 rounded-lg text-sm font-medium text-slate-700 border-0 focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="en">English</option>
                                        <option value="hi">Hindi</option>
                                        <option value="es">Spanish</option>
                                        <option value="fr">French</option>
                                        <option value="de">German</option>
                                    </select>
                                </SettingRow>

                                <SettingRow icon={Calendar} label="Date Format" description="How dates are displayed">
                                    <select
                                        value={settings.dateFormat}
                                        onChange={(e) => updateSetting('dateFormat', e.target.value)}
                                        className="px-4 py-2 bg-slate-100 rounded-lg text-sm font-medium text-slate-700 border-0 focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                                        <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                                        <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                                    </select>
                                </SettingRow>

                                <SettingRow icon={Clock} label="Time Format" description="12-hour or 24-hour clock">
                                    <div className="flex gap-2">
                                        {(['12h', '24h'] as const).map(format => (
                                            <button
                                                key={format}
                                                onClick={() => updateSetting('timeFormat', format)}
                                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${settings.timeFormat === format
                                                    ? 'bg-blue-600 text-white'
                                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                    }`}
                                            >
                                                {format}
                                            </button>
                                        ))}
                                    </div>
                                </SettingRow>

                                <div className="mt-6 p-4 bg-slate-50 rounded-xl">
                                    <div className="text-sm text-slate-500 space-y-1">
                                        <div>Version: <span className="font-medium text-slate-700">1.0.0</span></div>
                                        <div>Build: <span className="font-medium text-slate-700">2024.12.30</span></div>
                                        <div>Environment: <span className="font-medium text-slate-700">Production</span></div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}
