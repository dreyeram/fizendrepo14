"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    User, Building2, Calendar, Palette, Bell, Database, Trash2,
    ArrowLeft, X, ChevronRight, Shield, Settings, Mail, MessageSquare, Stethoscope
} from "lucide-react";

// Panel imports
import ProfilePanel from "./panels/ProfilePanel";
import OrganizationPanel from "./panels/OrganizationPanel";
import SchedulePanel from "./panels/SchedulePanel";
import AppearancePanel from "./panels/AppearancePanel";
import NotificationsPanel from "./panels/NotificationsPanel";
import DataPanel from "./panels/DataPanel";
import DangerPanel from "./panels/DangerPanel";
import EmailPanel from "./panels/EmailPanel";
import MessageTemplatesPanel from "@/components/admin/settings/MessageTemplatesPanel";
import EquipmentSettings from "@/components/settings/EquipmentSettings";
import { useConfirm } from "@/lib/hooks/useConfirm";

// Types
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
        logoPath?: string | null;
        letterheadConfig?: string | null;
        smtpConfig?: string | null;
    };
}

interface SettingsHubProps {
    user: UserData;
    organization?: {
        id: string;
        name: string;
        type: string;
        logoPath?: string | null;
        letterheadConfig?: string | null;
        smtpConfig?: string | null;
    };
    onUpdate: () => void;
    onClose: () => void;
    defaultTab?: string;
}

// Settings tabs configuration
const SETTINGS_TABS = [
    { id: 'profile', label: 'My Profile', icon: User, group: 'account', description: 'Personal information & signature' },
    { id: 'organization', label: 'Organization', icon: Building2, group: 'account', description: 'Clinic details & branding', adminOnly: true },
    { id: 'schedule', label: 'Schedule', icon: Calendar, group: 'clinic', description: 'Working hours & holidays', adminOnly: true },
    { id: 'appearance', label: 'Appearance', icon: Palette, group: 'app', description: 'Theme & display preferences' },
    { id: 'notifications', label: 'Notifications', icon: Bell, group: 'app', description: 'Alerts & sound settings' },
    { id: 'data', label: 'Data & Backup', icon: Database, group: 'app', description: 'Export, import & storage' },
    { id: 'email', label: 'Email Setup', icon: Mail, group: 'clinic', description: 'SMTP configuration for reports', adminOnly: true },
    { id: 'templates', label: 'Message Templates', icon: MessageSquare, group: 'clinic', description: 'Customize sharing messages', adminOnly: true },
    { id: 'equipment', label: 'Equipment', icon: Stethoscope, group: 'clinic', description: 'Manage scopes & processors', adminOnly: true },
    { id: 'danger', label: 'Danger Zone', icon: Trash2, group: 'danger', description: 'Destructive actions' },
];

const GROUP_LABELS: Record<string, string> = {
    'account': 'Account',
    'clinic': 'Clinic',
    'app': 'Application',
    'danger': '',
};

export default function SettingsHub({ user, organization, onUpdate, onClose, defaultTab = 'profile' }: SettingsHubProps) {
    const [activeTab, setActiveTab] = useState(defaultTab);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const confirm = useConfirm();

    // Filter tabs based on user role
    const visibleTabs = SETTINGS_TABS.filter(tab => {
        if (tab.adminOnly && user.role !== 'DOCTOR' && user.role !== 'ADMIN') {
            return false;
        }
        return true;
    });

    // Group tabs
    const groupedTabs = visibleTabs.reduce((acc, tab) => {
        if (!acc[tab.group]) acc[tab.group] = [];
        acc[tab.group].push(tab);
        return acc;
    }, {} as Record<string, typeof SETTINGS_TABS>);

    const handleTabChange = async (tabId: string) => {
        if (hasUnsavedChanges) {
            const ok = await confirm({
                title: 'Unsaved Changes',
                message: 'You have unsaved changes. Discard them?',
                confirmLabel: 'Discard Changes',
                variant: 'danger'
            });
            if (!ok) return;
        }
        setHasUnsavedChanges(false);
        setActiveTab(tabId);
    };

    const handleClose = async () => {
        if (hasUnsavedChanges) {
            const ok = await confirm({
                title: 'Unsaved Changes',
                message: 'You have unsaved changes. Discard them?',
                confirmLabel: 'Discard Changes',
                variant: 'danger'
            });
            if (!ok) return;
        }
        onClose();
    };

    const activeTabData = SETTINGS_TABS.find(t => t.id === activeTab);

    return (
        <div className="fixed inset-0 z-50 bg-slate-900/20 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="w-full max-w-4xl h-[80vh] bg-white/80 backdrop-blur-2xl rounded-2xl shadow-2xl overflow-hidden flex border border-white/60"
            >
                {/* Sidebar */}
                <div className="w-56 bg-white/40 border-r border-white/40 flex flex-col">
                    {/* Header */}
                    <div className="p-4 border-b border-white/40">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleClose}
                                className="p-2 -ml-2 rounded-xl hover:bg-white/60 text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                <ArrowLeft size={16} />
                            </button>
                            <div>
                                <h1 className="text-base font-black text-slate-900">Settings</h1>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Control Panel</p>
                            </div>
                        </div>
                    </div>

                    {/* Navigation */}
                    <nav className="flex-1 p-3 overflow-y-auto">
                        {Object.entries(groupedTabs).map(([group, tabs], groupIndex) => (
                            <div key={group} className={groupIndex > 0 ? 'mt-6' : ''}>
                                {GROUP_LABELS[group] && (
                                    <p className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-4">
                                        {GROUP_LABELS[group]}
                                    </p>
                                )}
                                {group === 'danger' && <div className="h-px bg-slate-200/50 my-3 mx-4" />}
                                <div className="space-y-1">
                                    {tabs.map(tab => {
                                        const isActive = activeTab === tab.id;
                                        const Icon = tab.icon;
                                        return (
                                            <button
                                                key={tab.id}
                                                onClick={() => handleTabChange(tab.id)}
                                                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-left transition-all group relative overflow-hidden ${isActive
                                                    ? tab.group === 'danger'
                                                        ? 'bg-rose-50 text-rose-700 shadow-sm ring-1 ring-rose-100'
                                                        : 'bg-white text-blue-700 shadow-sm ring-1 ring-blue-50'
                                                    : tab.group === 'danger'
                                                        ? 'text-rose-500 hover:bg-rose-50/50'
                                                        : 'text-slate-500 hover:bg-white/60 hover:text-slate-700'
                                                    }`}
                                            >
                                                <Icon size={16} className={isActive ? '' : 'opacity-60'} />
                                                <span className="text-[13px] font-bold">{tab.label}</span>
                                                {isActive && (
                                                    <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full ${tab.group === 'danger' ? 'bg-rose-500' : 'bg-blue-600'
                                                        }`} />
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </nav>

                    {/* Footer */}
                    <div className="p-4 border-t border-white/40 bg-white/30">
                        <div className="flex items-center gap-3 px-3 py-2 bg-white/60 rounded-xl border border-white/50 shadow-sm">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-xs shadow-md shadow-blue-500/20">
                                {user.fullName.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-slate-800 truncate">{user.fullName}</p>
                                <p className="text-[10px] text-slate-500 font-medium">{user.role}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 flex flex-col overflow-hidden bg-white/30">
                    {/* Content Header */}
                    <div className="px-6 py-4 border-b border-white/40 flex items-center justify-between bg-white/40 backdrop-blur-sm">
                        <div>
                            <h2 className="text-xl font-black text-slate-900 tracking-tight">{activeTabData?.label}</h2>
                            <p className="text-xs text-slate-500 mt-0.5 font-medium">{activeTabData?.description}</p>
                        </div>
                        <button
                            onClick={handleClose}
                            className="p-2.5 rounded-xl hover:bg-white text-slate-400 hover:text-slate-600 transition-all shadow-sm hover:shadow-md border border-transparent hover:border-slate-200"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Scrollable Content */}
                    <div className="flex-1 overflow-y-auto p-6">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activeTab}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.3, ease: "easeOut" }}
                            >
                                {activeTab === 'profile' && (
                                    <ProfilePanel
                                        user={user}
                                        onUpdate={onUpdate}
                                        onUnsavedChange={setHasUnsavedChanges}
                                    />
                                )}
                                {activeTab === 'organization' && organization && (
                                    <OrganizationPanel
                                        organization={organization}
                                        onUpdate={onUpdate}
                                        onUnsavedChange={setHasUnsavedChanges}
                                    />
                                )}
                                {activeTab === 'schedule' && (
                                    <SchedulePanel
                                        organizationId={organization?.id}
                                        onUpdate={onUpdate}
                                        onUnsavedChange={setHasUnsavedChanges}
                                    />
                                )}
                                {activeTab === 'appearance' && (
                                    <AppearancePanel
                                        onUnsavedChange={setHasUnsavedChanges}
                                    />
                                )}
                                {activeTab === 'notifications' && (
                                    <NotificationsPanel
                                        onUnsavedChange={setHasUnsavedChanges}
                                    />
                                )}
                                {activeTab === 'data' && (
                                    <DataPanel
                                        userId={user.id}
                                        onUpdate={onUpdate}
                                    />
                                )}
                                {activeTab === 'email' && organization && (
                                    <EmailPanel
                                        organization={organization}
                                        onUpdate={onUpdate}
                                        onUnsavedChange={setHasUnsavedChanges}
                                    />
                                )}
                                {activeTab === 'templates' && organization && (
                                    <MessageTemplatesPanel
                                        organization={organization}
                                        onUpdate={onUpdate}
                                        onUnsavedChange={setHasUnsavedChanges}
                                    />
                                )}
                                {activeTab === 'equipment' && (
                                    <EquipmentSettings />
                                )}
                                {activeTab === 'danger' && (
                                    <DangerPanel
                                        userId={user.id}
                                        onUpdate={onUpdate}
                                    />
                                )}
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
