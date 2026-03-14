'use client';

import React, { useState, useEffect } from 'react';
import { Power, Wifi, WifiOff, RefreshCw, Moon, ChevronDown, Monitor, Video, VideoOff, Battery, Zap, AlertTriangle, HardDrive } from 'lucide-react';
import { shutdownSystem, restartSystem, sleepSystem, getSystemStatus } from '@/app/actions/system';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Tooltip from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';

export function SystemStatus() {
    const [isLocal, setIsLocal] = useState(false);
    const [status, setStatus] = useState<{
        wifi: string | null;
        camera: boolean;
        power: 'stable' | 'warning';
        usb: boolean;
    }>({
        wifi: null,
        camera: true,
        power: 'stable',
        usb: false
    });
    const [currentTime, setCurrentTime] = useState<Date | null>(null);

    const refreshStatus = async () => {
        try {
            const data = await getSystemStatus();
            setStatus({
                wifi: data.wifi,
                camera: data.camera,
                power: data.power as 'stable' | 'warning',
                usb: data.usb
            });
        } catch (error) {
            console.error("Failed to fetch system status", error);
        }
    };

    useEffect(() => {
        const checkLocal = () => {
            const hostname = window.location.hostname;
            setIsLocal(hostname === 'localhost' || hostname === '127.0.0.1');
        };
        checkLocal();
        setCurrentTime(new Date());
        refreshStatus();

        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        const statusTimer = setInterval(refreshStatus, 10000); // Check every 10s

        return () => {
            clearInterval(timer);
            clearInterval(statusTimer);
        };
    }, []);

    const handleShutdown = async () => { if (confirm('Shutdown system?')) await shutdownSystem(); };
    const handleRestart = async () => { if (confirm('Restart system?')) await restartSystem(); };
    const handleSleep = async () => { await sleepSystem(); };

    if (!currentTime) return null;

    return (
        <Tooltip.Provider delayDuration={300}>
            <div className="flex items-center gap-2">
                {/* 5. System Icon (Menu Up) */}
                {isLocal && (
                    <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                            <button className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-black/[0.04] text-slate-500 transition-all outline-none group">
                                <Monitor size={14} className="text-slate-400 group-hover:text-blue-500" />
                                <ChevronDown size={10} className="text-slate-300" />
                            </button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                            <DropdownMenu.Content
                                className="min-w-[180px] bg-white/95 backdrop-blur-xl rounded-xl shadow-2xl border border-slate-100 p-2 z-[100] animate-in slide-in-from-bottom-2 duration-200"
                                side="top"
                                sideOffset={8}
                                align="center"
                            >
                                <DropdownMenu.Item onClick={handleSleep} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-50 outline-none cursor-pointer">
                                    <Moon size={16} /> <span>Sleep Mode</span>
                                </DropdownMenu.Item>
                                <DropdownMenu.Item onClick={handleRestart} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-bold text-amber-600 hover:bg-amber-50 outline-none cursor-pointer">
                                    <RefreshCw size={16} /> <span>Restart System</span>
                                </DropdownMenu.Item>
                                <DropdownMenu.Separator className="h-px bg-slate-100 my-1.5" />
                                <DropdownMenu.Item onClick={handleShutdown} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-bold text-rose-600 hover:bg-rose-50 outline-none cursor-pointer">
                                    <Power size={16} /> <span>Shutdown</span>
                                </DropdownMenu.Item>
                            </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                )}

                {/* 4. Wifi Signal */}
                <Tooltip.Root>
                    <Tooltip.Trigger asChild>
                        <div className={cn(
                            "flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors cursor-default",
                            status.wifi ? "text-blue-600 hover:bg-blue-50/50" : "text-slate-300"
                        )}>
                            {status.wifi ? <Wifi size={15} strokeWidth={2.5} /> : <WifiOff size={15} strokeWidth={2.5} />}
                        </div>
                    </Tooltip.Trigger>
                    <Tooltip.Portal>
                        <Tooltip.Content className="bg-slate-900 text-white text-[10px] px-2 py-1 rounded-md z-[110]" sideOffset={5}>
                            {status.wifi ? `Connected to ${status.wifi}` : 'Searching for Network...'}
                            <Tooltip.Arrow className="fill-slate-900" />
                        </Tooltip.Content>
                    </Tooltip.Portal>
                </Tooltip.Root>

                {/* 3. Camera Status */}
                <Tooltip.Root>
                    <Tooltip.Trigger asChild>
                        <div className={cn(
                            "flex items-center justify-center w-8 h-8 rounded-lg transition-colors",
                            status.camera ? "text-emerald-500 hover:bg-emerald-50/50" : "text-rose-500 bg-rose-50/50"
                        )}>
                            {status.camera ? <Video size={16} strokeWidth={2.5} /> : <VideoOff size={16} strokeWidth={2.5} />}
                        </div>
                    </Tooltip.Trigger>
                </Tooltip.Root>

                {/* 2.5 USB Status */}
                <Tooltip.Root>
                    <Tooltip.Trigger asChild>
                        <div className={cn(
                            "flex items-center justify-center w-8 h-8 rounded-lg transition-colors",
                            status.usb ? "text-blue-500 hover:bg-blue-50/50" : "text-slate-300"
                        )}>
                            <HardDrive size={16} strokeWidth={2.5} />
                        </div>
                    </Tooltip.Trigger>
                    <Tooltip.Portal>
                        <Tooltip.Content className="bg-slate-900 text-white text-[10px] px-2 py-1 rounded-md z-[110]" sideOffset={5}>
                            {status.usb ? 'External USB Storage Detected' : 'No External Storage Found'}
                            <Tooltip.Arrow className="fill-slate-900" />
                        </Tooltip.Content>
                    </Tooltip.Portal>
                </Tooltip.Root>


                {/* 1. Date and Time (Extreme Corner) */}
                <div className="flex flex-col items-end px-2 py-1 rounded-lg hover:bg-black/[0.04] transition-colors cursor-default ml-1">
                    <span className="text-[11px] font-bold text-slate-700 leading-none">
                        {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                    </span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter leading-none mt-1">
                        {currentTime.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                </div>
            </div>
        </Tooltip.Provider>
    );
}
