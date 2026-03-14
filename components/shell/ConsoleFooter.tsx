"use client";

import React from "react";
import { LogOut, UserCircle, Bell, Settings, User } from "lucide-react";
import { SystemStatus } from "./SystemStatus";
import * as Popover from '@radix-ui/react-popover';
import SettingsDialog from "../settings/SettingsDialog";

interface ConsoleFooterProps {
    userId: string;
    userName: string;
    onLogout: () => void;
    onUpdate?: () => void;
}

export default function ConsoleFooter({
    userId,
    userName,
    onLogout,
    onUpdate
}: ConsoleFooterProps) {
    const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
    const cleanUserName = userName.replace(/^(Dr\.|Dr)\s+/i, "");

    return (
        <footer className="h-[52px] w-full z-50 flex items-center justify-between px-2 relative shrink-0">
            {/* Windows 11 Style Glassmorphism Background */}
            <div className="absolute inset-x-0 bottom-0 top-0 bg-white/60 backdrop-blur-2xl border-t border-white/40 shadow-[0_8px_32px_rgba(0,0,0,0.08)]" />

            {/* Left Side: System Tray */}
            <div className="relative flex items-center pl-2">
                <SystemStatus />
            </div>

            {/* Right Side: Profile & Notifications */}
            <div className="relative flex items-center gap-3 pr-6">
                <SettingsDialog
                    userId={userId}
                    isOpen={isSettingsOpen}
                    onClose={() => setIsSettingsOpen(false)}
                    onUpdate={onUpdate}
                />

                {/* Profile Popover */}
                <Popover.Root>
                    <Popover.Trigger asChild>
                        <button className="flex items-center gap-3 px-3 py-1.5 rounded-full hover:bg-white/60 active:scale-95 transition-all text-slate-700 outline-none shadow-sm border border-slate-100 bg-white/40 group">
                            <span className="text-xs font-bold tracking-tight truncate max-w-[120px]">Dr. {cleanUserName}</span>
                            <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20 group-hover:shadow-blue-500/30 transition-shadow">
                                <User size={14} />
                            </div>
                        </button>
                    </Popover.Trigger>
                    <Popover.Portal>
                        <Popover.Content
                            className="min-w-[220px] bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white p-2.5 z-[100] animate-in slide-in-from-bottom-2 duration-300"
                            side="top"
                            sideOffset={12}
                            align="end"
                        >
                            <div className="px-3 py-2.5 border-b border-slate-100 mb-1.5 text-right">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Medical Profile</p>
                                <p className="text-sm font-bold text-slate-800">Dr. {cleanUserName}</p>
                            </div>
                            <button
                                onClick={() => { setIsSettingsOpen(true); }}
                                className="w-full flex items-center justify-end gap-3 px-3 py-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors text-right"
                            >
                                Profile Settings
                                <Settings size={16} className="text-slate-400" />
                            </button>
                            <button
                                onClick={onLogout}
                                className="w-full flex items-center justify-end gap-3 px-3 py-2.5 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors text-right"
                            >
                                Sign Out
                                <LogOut size={16} />
                            </button>
                        </Popover.Content>
                    </Popover.Portal>
                </Popover.Root>
            </div>
        </footer>
    );
}
