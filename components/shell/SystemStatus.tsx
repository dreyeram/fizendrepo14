'use client';

import React, { useState, useEffect } from 'react';
import { Power, RefreshCw, Moon, ChevronDown, Monitor, Video, VideoOff, AlertTriangle, CheckCircle2, HardDrive, LogOut, Loader2 } from 'lucide-react';
import { shutdownSystem, restartSystem, sleepSystem, getSystemStatus, ejectUSB } from '@/app/actions/system';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Tooltip from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';
import { useConfirm } from '@/lib/hooks/useConfirm';

export function SystemStatus() {
    const [isLocal, setIsLocal] = useState(false);
    const [status, setStatus] = useState<{
        camera: boolean;
        power: 'stable' | 'warning';
        usb: boolean;
    }>({
        camera: true,
        power: 'stable',
        usb: false
    });
    const [currentTime, setCurrentTime] = useState<Date | null>(null);
    const [isEjecting, setIsEjecting] = useState(false);
    const [ejectMsg, setEjectMsg] = useState<string | null>(null);
    const confirm = useConfirm();

    const refreshStatus = async () => {
        try {
            const data = await getSystemStatus();
            setStatus({
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
        const statusTimer = setInterval(refreshStatus, 10000);

        return () => {
            clearInterval(timer);
            clearInterval(statusTimer);
        };
    }, []);

    const handleShutdown = async () => { 
        if (await confirm({
            title: 'Shutdown System',
            message: 'Are you sure you want to shutdown the system?',
            confirmLabel: 'Shutdown',
            variant: 'danger'
        })) {
            await shutdownSystem();
        }
    };
    const handleRestart = async () => { 
        if (await confirm({
            title: 'Restart System',
            message: 'Are you sure you want to restart the system?',
            confirmLabel: 'Restart',
            variant: 'danger'
        })) {
            await restartSystem();
        }
    };
    const handleSleep = async () => { await sleepSystem(); };

    const handleEjectUSB = async () => {
        setIsEjecting(true);
        setEjectMsg(null);
        try {
            const result = await ejectUSB();
            setEjectMsg(result.success ? '✓ Ejected safely' : (result.error || 'Eject failed'));
            if (result.success) {
                setTimeout(() => {
                    setEjectMsg(null);
                    refreshStatus(); // Refresh to update USB status
                }, 2500);
            }
        } catch {
            setEjectMsg('Eject failed');
        } finally {
            setIsEjecting(false);
        }
    };

    if (!currentTime) return null;

    return (
        <Tooltip.Provider delayDuration={300}>
            <div className="flex items-center gap-1">

                {/* System Power Menu — only on local/kiosk */}
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

                {/* Camera Status — composite icon with badge */}
                <Tooltip.Root>
                    <Tooltip.Trigger asChild>
                        <div className={cn(
                            "relative flex items-center justify-center w-8 h-8 rounded-lg transition-colors cursor-default",
                            status.camera
                                ? "text-emerald-500 hover:bg-emerald-50/60"
                                : "text-rose-500 bg-rose-50/60"
                        )}>
                            {status.camera
                                ? <Video size={16} strokeWidth={2.5} />
                                : <VideoOff size={16} strokeWidth={2.5} />
                            }
                            {/* Status badge — bottom-right corner */}
                            <span className={cn(
                                "absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center shadow-sm border-[1.5px]",
                                status.camera
                                    ? "bg-emerald-500 border-white"
                                    : "bg-amber-500 border-white"
                            )}>
                                {status.camera
                                    ? <CheckCircle2 size={8} className="text-white" strokeWidth={3} />
                                    : <AlertTriangle size={7} className="text-white" strokeWidth={3} />
                                }
                            </span>
                        </div>
                    </Tooltip.Trigger>
                    <Tooltip.Portal>
                        <Tooltip.Content
                            className={cn(
                                "text-white text-[10px] px-2.5 py-1.5 rounded-lg z-[110] font-bold shadow-xl",
                                status.camera ? "bg-emerald-600" : "bg-rose-600"
                            )}
                            sideOffset={5}
                        >
                            {status.camera ? '✓ Camera Connected' : '⚠ Camera Not Detected'}
                            <Tooltip.Arrow className={status.camera ? "fill-emerald-600" : "fill-rose-600"} />
                        </Tooltip.Content>
                    </Tooltip.Portal>
                </Tooltip.Root>

                {/* USB Storage — dropdown with Eject when connected */}
                {status.usb ? (
                    <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                            <button className="relative flex items-center justify-center w-8 h-8 rounded-lg text-blue-500 hover:bg-blue-50/60 transition-colors outline-none">
                                <HardDrive size={16} strokeWidth={2.5} />
                                {/* Connected dot */}
                                <span className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-blue-500 border-[1.5px] border-white shadow-sm" />
                            </button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                            <DropdownMenu.Content
                                className="min-w-[220px] bg-white/95 backdrop-blur-xl rounded-xl shadow-2xl border border-slate-100 p-2 z-[100] animate-in slide-in-from-bottom-2 duration-200"
                                side="top"
                                sideOffset={8}
                                align="end"
                            >
                                {/* Info row */}
                                <div className="px-3 py-2 mb-1 bg-blue-50 rounded-lg border border-blue-100 flex items-center gap-2">
                                    <HardDrive size={13} className="text-blue-500 shrink-0" />
                                    <div className="flex flex-col min-w-0">
                                        <span className="text-[11px] font-black text-blue-700">External Storage</span>
                                        <span className="text-[9px] text-blue-400 uppercase tracking-wide">USB Connected</span>
                                    </div>
                                </div>

                                {ejectMsg ? (
                                    <div className={cn(
                                        "px-3 py-2 rounded-lg text-[11px] font-bold flex items-center gap-2",
                                        ejectMsg.startsWith('✓') ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                                    )}>
                                        {ejectMsg}
                                    </div>
                                ) : (
                                    <DropdownMenu.Item
                                        onClick={handleEjectUSB}
                                        disabled={isEjecting}
                                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-bold text-slate-700 hover:bg-amber-50 hover:text-amber-700 outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        {isEjecting
                                            ? <Loader2 size={15} className="animate-spin text-amber-500" />
                                            : <LogOut size={15} className="text-amber-500" />
                                        }
                                        <span>{isEjecting ? 'Ejecting...' : 'Safely Eject USB'}</span>
                                    </DropdownMenu.Item>
                                )}
                            </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                ) : (
                    <Tooltip.Root>
                        <Tooltip.Trigger asChild>
                            <div className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-300 cursor-default">
                                <HardDrive size={16} strokeWidth={2} />
                            </div>
                        </Tooltip.Trigger>
                        <Tooltip.Portal>
                            <Tooltip.Content className="bg-slate-900 text-white text-[10px] px-2 py-1 rounded-md z-[110]" sideOffset={5}>
                                No External Storage
                                <Tooltip.Arrow className="fill-slate-900" />
                            </Tooltip.Content>
                        </Tooltip.Portal>
                    </Tooltip.Root>
                )}

                {/* Date and Time */}
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
