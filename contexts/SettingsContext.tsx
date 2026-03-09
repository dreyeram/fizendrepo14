"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

// Procedure Tool Toggles Interface
export interface ProcedureToolSettings {
    quadFilter: boolean;
    voiceCommands: boolean;
    comparisonMode: boolean;
    timer: boolean;
    patientHistory: boolean;
    autoStartRecording: boolean;
    watermarkOnCaptures: boolean;
    fitSettingsPanel: boolean;
    galleryPanel: boolean;
    zoomControls: boolean;
}

export const defaultProcedureTools: ProcedureToolSettings = {
    quadFilter: true,
    voiceCommands: false,
    comparisonMode: true,
    timer: true,
    patientHistory: true,
    autoStartRecording: false,
    watermarkOnCaptures: true,
    fitSettingsPanel: true,
    galleryPanel: true,
    zoomControls: true,
};


export interface SettingsState {
    // Appearance
    theme: 'light' | 'dark' | 'system';
    accentColor: string;
    compactMode: boolean;
    animations: boolean;

    // Notifications
    notificationsEnabled: boolean;
    soundEnabled: boolean;
    desktopNotifications: boolean;
    emailNotifications: boolean;

    // Data & Storage
    autoSave: boolean;
    autoSaveInterval: number;
    cacheEnabled: boolean;

    // Privacy
    analyticsEnabled: boolean;
    crashReporting: boolean;

    // Procedure Settings
    defaultProcedureType: string;
    captureQuality: 'low' | 'medium' | 'high' | 'ultra';
    videoCalibration: { x: number; y: number; scaleX: number; scaleY: number; rotation: number; flipX: boolean; flipY: boolean; };
    aspectRatio: '16:9' | '4:3 (Stretch Thin)' | '4:3 (Squeeze Wide)' | '1:1';

    // Procedure Tool Toggles (NEW)
    procedureTools: ProcedureToolSettings;

    // Reports
    defaultReportFormat: 'pdf' | 'docx';
    includeTimestamps: boolean;
    includeWatermark: boolean;

    // System
    language: string;
    dateFormat: string;
    timeFormat: '12h' | '24h';

    // Keyboard Shortcuts (NEW)
    shortcuts: {
        newPatient: string;
        search: string;
        settings: string;
        closeTab: string;
        capture: string;
        startRecording: string;
        stopRecording: string;
    };
}

export const defaultSettings: SettingsState = {
    theme: 'light',
    accentColor: '#3B82F6',
    compactMode: false,
    animations: true,
    notificationsEnabled: true,
    soundEnabled: true,
    desktopNotifications: false,
    emailNotifications: true,
    autoSave: true,
    autoSaveInterval: 5,
    cacheEnabled: true,
    analyticsEnabled: true,
    crashReporting: true,
    defaultProcedureType: 'EGD',
    captureQuality: 'high',
    videoCalibration: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, flipX: false, flipY: false },
    aspectRatio: '16:9',
    procedureTools: defaultProcedureTools,
    defaultReportFormat: 'pdf',
    includeTimestamps: true,
    includeWatermark: true,
    language: 'en',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '12h',
    shortcuts: {
        newPatient: 'Ctrl+N',
        search: 'Ctrl+K',
        settings: 'Ctrl+,',
        closeTab: 'Ctrl+W',
        capture: 'Space',
        startRecording: 'R',
        stopRecording: 'S',
    },
};

interface SettingsContextType {
    settings: SettingsState;
    updateSetting: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
    updateProcedureTool: <K extends keyof ProcedureToolSettings>(key: K, value: boolean) => void;
    saveSettings: () => Promise<void>;
    resetSettings: () => void;
    hasChanges: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
    const [settings, setSettings] = useState<SettingsState>(defaultSettings);
    const [hasChanges, setHasChanges] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);

    // Load settings from localStorage
    useEffect(() => {
        const savedSettings = localStorage.getItem('appSettings');
        if (savedSettings) {
            try {
                const parsed = JSON.parse(savedSettings);
                // Deep merge for nested objects like procedureTools
                setSettings({
                    ...defaultSettings,
                    ...parsed,
                    procedureTools: { ...defaultProcedureTools, ...parsed.procedureTools },
                    shortcuts: { ...defaultSettings.shortcuts, ...parsed.shortcuts },
                    videoCalibration: { ...defaultSettings.videoCalibration, ...parsed.videoCalibration },
                });
            } catch (e) {
                console.error('Failed to parse settings', e);
            }
        }
        setIsLoaded(true);
    }, []);

    // ═══════════════════════════════════════
    //  AUTO-PERSIST: Write settings to localStorage on every change
    //  Uses a debounce (500ms) to avoid excessive writes.
    //  Only fires AFTER initial load to prevent overwriting stored data.
    // ═══════════════════════════════════════
    useEffect(() => {
        if (!isLoaded) return; // Don't save before initial load completes
        const timer = setTimeout(() => {
            try {
                localStorage.setItem('appSettings', JSON.stringify(settings));
            } catch (e) {
                console.error('Failed to auto-save settings', e);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [settings, isLoaded]);

    // Apply Theme Effect
    useEffect(() => {
        if (!isLoaded) return;

        const root = document.documentElement;
        if (settings.theme === 'dark') {
            root.classList.add('dark');
        } else if (settings.theme === 'light') {
            root.classList.remove('dark');
        } else {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            const handleChange = (e: MediaQueryListEvent) => {
                if (e.matches) root.classList.add('dark');
                else root.classList.remove('dark');
            };

            if (mediaQuery.matches) root.classList.add('dark');
            else root.classList.remove('dark');

            mediaQuery.addEventListener('change', handleChange);
            return () => mediaQuery.removeEventListener('change', handleChange);
        }
    }, [settings.theme, isLoaded]);

    // Apply Compact Mode Effect
    useEffect(() => {
        if (!isLoaded) return;
        if (settings.compactMode) {
            document.body.classList.add('compact-mode');
        } else {
            document.body.classList.remove('compact-mode');
        }
    }, [settings.compactMode, isLoaded]);

    const updateSetting = <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
        setSettings(prev => ({ ...prev, [key]: value }));
        setHasChanges(true);
    };

    const updateProcedureTool = <K extends keyof ProcedureToolSettings>(key: K, value: boolean) => {
        setSettings(prev => ({
            ...prev,
            procedureTools: { ...prev.procedureTools, [key]: value }
        }));
        setHasChanges(true);
    };

    const saveSettings = async () => {
        try {
            localStorage.setItem('appSettings', JSON.stringify(settings));
            await new Promise(r => setTimeout(r, 300));
            setHasChanges(false);
        } catch (e) {
            console.error('Failed to save settings', e);
            throw e;
        }
    };

    const resetSettings = () => {
        setSettings(defaultSettings);
        setHasChanges(true);
    };

    return (
        <SettingsContext.Provider value={{
            settings,
            updateSetting,
            updateProcedureTool,
            saveSettings,
            resetSettings,
            hasChanges
        }}>
            {children}
        </SettingsContext.Provider>
    );
}

export function useSettings() {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
}
