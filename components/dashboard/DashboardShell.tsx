/**
 * DashboardShell Component
 * 
 * Main layout shell for dashboard pages.
 * Provides navigation sidebar and content area.
 */

"use client";

import React from 'react';
import {
    LayoutDashboard,
    Users,
    Calendar,
    FileText,
    Settings,
    LogOut,
    Activity,
    Shield,
    Pill,
    MessageSquare,
    Command,
    Stethoscope
} from 'lucide-react';
import { clsx } from 'clsx';
import { resolveImageUrl } from '@/lib/utils/image';

interface DashboardShellProps {
    role: 'ADMIN' | 'DOCTOR' | 'ASSISTANT';
    userName: string;
    organizationName?: string;
    logoPath?: string | null;
    currentView: string;
    onViewChange: (view: string) => void;
    onLogout: () => void;
    children: React.ReactNode;
}

const navigationItems = {
    ADMIN: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'users', label: 'Users', icon: Users },
        { id: 'communication', label: 'Communication', icon: MessageSquare },
        { id: 'inventory', label: 'Inventory', icon: Pill },
        { id: 'equipment', label: 'Equipment', icon: Stethoscope },
        { id: 'data', label: 'Data & Security', icon: Shield },
    ],
    DOCTOR: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'patients', label: 'Patients', icon: Users },
        { id: 'schedule', label: 'Schedule', icon: Calendar },
        { id: 'records', label: 'Records', icon: FileText },
    ],
    ASSISTANT: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'patients', label: 'Patients', icon: Users },
        { id: 'schedule', label: 'Schedule', icon: Calendar },
    ],
};

const roleLabels = {
    ADMIN: { label: 'Administrator', icon: Shield, color: 'text-amber-600', bg: 'bg-amber-100' },
    DOCTOR: { label: 'Doctor', icon: Activity, color: 'text-emerald-600', bg: 'bg-emerald-100' },
    ASSISTANT: { label: 'Assistant', icon: Users, color: 'text-blue-600', bg: 'bg-blue-100' },
};

export default function DashboardShell({
    role,
    userName,
    organizationName = "Endoscopy Suite",
    logoPath,
    currentView,
    onViewChange,
    onLogout,
    children,
}: DashboardShellProps) {
    const navItems = navigationItems[role] || [];
    const roleInfo = roleLabels[role];
    const [logoError, setLogoError] = React.useState(false);

    return (
        <div className="flex h-screen aurora-bg font-sans overflow-hidden">
            {/* Sidebar (Glassmorphism) */}
            <aside className="w-72 bg-white/70 backdrop-blur-xl border-r border-white/40 flex flex-col z-20 shadow-xl shadow-slate-200/40">
                {/* Logo/Brand */}
                <div className="p-8 pb-6">
                    <div className="flex items-center gap-3 mb-1">
                        {resolveImageUrl(logoPath) && !logoError ? (
                            <img
                                src={resolveImageUrl(logoPath)!}
                                alt={organizationName}
                                className="w-10 h-10 rounded-xl object-contain shadow-md"
                                onError={() => setLogoError(true)}
                            />
                        ) : (
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
                                <Command size={20} />
                            </div>
                        )}
                        <div className="flex flex-col">
                            <h1 className="heading-serif text-slate-900 leading-tight">{organizationName}</h1>
                            <p className="label-uppercase text-slate-500">Medical System</p>
                        </div>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 px-4 py-6 overflow-y-auto">
                    <p className="px-4 label-uppercase text-slate-400 mb-3">Menu</p>
                    <ul className="space-y-1.5">
                        {navItems.map((item) => {
                            const Icon = item.icon;
                            const isActive = currentView === item.id;

                            return (
                                <li key={item.id}>
                                    <button
                                        onClick={() => onViewChange(item.id)}
                                        className={clsx(
                                            'relative w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all group',
                                            isActive
                                                ? 'bg-white text-blue-700 shadow-lg shadow-slate-200/50 ring-1 ring-black/5'
                                                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100/80'
                                        )}
                                    >
                                        <Icon className={clsx("w-5 h-5 transition-colors", isActive ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600")} />
                                        {item.label}
                                        {isActive && (
                                            <div className="absolute right-3 w-1.5 h-1.5 rounded-full bg-blue-600 shadow-sm" />
                                        )}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </nav>

                {/* User Section */}
                <div className="p-4 mx-4 mb-4 bg-white/50 rounded-2xl border border-white/60 shadow-sm backdrop-blur-sm">
                    <div className="flex items-center gap-3 mb-3">
                        <div className={`w-10 h-10 rounded-xl ${roleInfo.bg} flex items-center justify-center`}>
                            <span className={`text-sm font-bold ${roleInfo.color}`}>
                                {userName.charAt(0).toUpperCase()}
                            </span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-900 truncate">{userName}</p>
                            <p className="label-uppercase text-slate-500">{roleInfo.label}</p>
                        </div>
                    </div>

                    <button
                        onClick={onLogout}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-rose-600 hover:bg-rose-50 transition-colors"
                    >
                        <LogOut className="w-3.5 h-3.5" />
                        Sign Out
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-auto relative z-10">
                {/* Header Blur */}
                <div className="sticky top-0 z-10 h-6 bg-gradient-to-b from-white/20 to-transparent backdrop-blur-[1px]" />

                <div className="p-8 max-w-7xl mx-auto">
                    {children}
                </div>
            </main>
        </div>
    );
}
