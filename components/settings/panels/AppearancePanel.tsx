"use client";

import React, { useState } from "react";
import { Moon, Sun, Monitor, Palette, Save, Check, RotateCcw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useSettings } from "@/contexts/SettingsContext";
import { useConfirm } from "@/lib/hooks/useConfirm";

interface AppearancePanelProps {
    onUnsavedChange: (hasChanges: boolean) => void;
}

const ACCENT_COLORS = [
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

export default function AppearancePanel({ onUnsavedChange }: AppearancePanelProps) {
    const { settings, updateSetting, saveSettings, resetSettings } = useSettings();
    const [saveSuccess, setSaveSuccess] = useState(false);
    const confirm = useConfirm();

    const handleThemeChange = (theme: 'light' | 'dark' | 'system') => {
        updateSetting('theme', theme);
        onUnsavedChange(true);
    };

    const handleColorChange = (color: string) => {
        updateSetting('accentColor', color);
        onUnsavedChange(true);
    };

    const handleSave = async () => {
        await saveSettings();
        setSaveSuccess(true);
        onUnsavedChange(false);
        setTimeout(() => setSaveSuccess(false), 3000);
    };

    const handleReset = async () => {
        const ok = await confirm({
            title: 'Reset Appearance',
            message: 'Reset all appearance settings to defaults?',
            confirmLabel: 'Reset Settings',
            variant: 'danger'
        });
        if (ok) {
            resetSettings();
            onUnsavedChange(false);
        }
    };

    return (
        <div className="max-w-2xl space-y-8">
            {/* Theme Selection */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
                    <h4 className="text-sm font-bold text-slate-700">Theme</h4>
                    <p className="text-xs text-slate-500 mt-0.5">Choose your preferred color mode</p>
                </div>

                <div className="p-6">
                    <div className="grid grid-cols-3 gap-4">
                        {[
                            { id: 'light', icon: Sun, label: 'Light', desc: 'Bright & clean' },
                            { id: 'dark', icon: Moon, label: 'Dark', desc: 'Easy on eyes' },
                            { id: 'system', icon: Monitor, label: 'System', desc: 'Auto switch' },
                        ].map(theme => {
                            const isActive = settings.theme === theme.id;
                            const Icon = theme.icon;
                            return (
                                <button
                                    key={theme.id}
                                    onClick={() => handleThemeChange(theme.id as any)}
                                    className={`p-4 rounded-xl border-2 transition-all text-left ${isActive
                                        ? 'border-blue-500 bg-blue-50'
                                        : 'border-slate-200 bg-white hover:border-slate-300'
                                        }`}
                                >
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${isActive ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'
                                        }`}>
                                        <Icon size={20} />
                                    </div>
                                    <p className={`font-bold text-sm ${isActive ? 'text-blue-700' : 'text-slate-700'}`}>
                                        {theme.label}
                                    </p>
                                    <p className="text-[10px] text-slate-500 mt-0.5">{theme.desc}</p>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Accent Color */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                    <Palette size={16} className="text-slate-500" />
                    <div>
                        <h4 className="text-sm font-bold text-slate-700">Accent Color</h4>
                        <p className="text-xs text-slate-500 mt-0.5">Personalize buttons and highlights</p>
                    </div>
                </div>

                <div className="p-6">
                    <div className="flex flex-wrap gap-3">
                        {ACCENT_COLORS.map(color => {
                            const isActive = settings.accentColor === color.value;
                            return (
                                <button
                                    key={color.value}
                                    onClick={() => handleColorChange(color.value)}
                                    className="group relative"
                                    title={color.name}
                                >
                                    <div
                                        className={`w-10 h-10 rounded-xl transition-all ${isActive ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : 'hover:scale-105'
                                            }`}
                                        style={{ backgroundColor: color.value }}
                                    >
                                        {isActive && (
                                            <Check size={16} className="absolute inset-0 m-auto text-white" />
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Compact Mode */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 flex items-center justify-between">
                    <div>
                        <h4 className="text-sm font-bold text-slate-700">Compact Mode</h4>
                        <p className="text-xs text-slate-500 mt-0.5">Reduce spacing for more content on screen</p>
                    </div>
                    <button
                        onClick={() => {
                            updateSetting('compactMode', !settings.compactMode);
                            onUnsavedChange(true);
                        }}
                        className={`w-12 h-6 rounded-full transition-colors relative ${settings.compactMode ? 'bg-blue-600' : 'bg-slate-300'
                            }`}
                    >
                        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.compactMode ? 'left-6' : 'left-0.5'
                            }`} />
                    </button>
                </div>
            </div>

            {/* Animations Toggle */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 flex items-center justify-between">
                    <div>
                        <h4 className="text-sm font-bold text-slate-700">Animations</h4>
                        <p className="text-xs text-slate-500 mt-0.5">Enable smooth transitions and effects</p>
                    </div>
                    <button
                        onClick={() => {
                            updateSetting('animations', !settings.animations);
                            onUnsavedChange(true);
                        }}
                        className={`w-12 h-6 rounded-full transition-colors relative ${settings.animations ? 'bg-blue-600' : 'bg-slate-300'
                            }`}
                    >
                        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.animations ? 'left-6' : 'left-0.5'
                            }`} />
                    </button>
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-4">
                <button
                    onClick={handleReset}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-colors flex items-center gap-2"
                >
                    <RotateCcw size={14} />
                    Reset to Default
                </button>

                <div className="flex items-center gap-4">
                    <AnimatePresence>
                        {saveSuccess && (
                            <motion.div
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 10 }}
                                className="flex items-center gap-2 text-emerald-600"
                            >
                                <Check size={18} />
                                <span className="text-sm font-semibold">Saved!</span>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <button
                        onClick={handleSave}
                        className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-sm shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all flex items-center gap-2"
                    >
                        <Save size={16} />
                        Save Preferences
                    </button>
                </div>
            </div>
        </div>
    );
}
