"use client";

import React, { useState, useEffect } from 'react';
import { Loader2, RefreshCw, LogOut, CheckCircle, Smartphone } from 'lucide-react';
import Image from 'next/image';
import QRCode from 'qrcode';
import { useConfirm } from "@/lib/hooks/useConfirm";

export default function WhatsAppConnect() {
    const [status, setStatus] = useState<string>('DISCONNECTED');
    const [qrCodeData, setQrCodeData] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
    const confirm = useConfirm();

    const fetchStatus = async () => {
        try {
            const res = await fetch('/api/whatsapp');
            const data = await res.json();
            setStatus(data.status);
            setQrCodeData(data.qrCode);

            if (data.qrCode) {
                const url = await QRCode.toDataURL(data.qrCode);
                setQrImageUrl(url);
            } else {
                setQrImageUrl(null);
            }
        } catch (error) {
            console.error('Failed to fetch WhatsApp status', error);
        }
    };

    // Polling for status updates when expecting changes
    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 3000); // Poll every 3s
        return () => clearInterval(interval);
    }, []);

    const handleInitialize = async () => {
        setIsLoading(true);
        try {
            await fetch('/api/whatsapp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'initialize' })
            });
            // Polling will pick up the change
        } catch (error) {
            console.error(error);
            alert('Failed to start WhatsApp client');
        } finally {
            setIsLoading(false);
        }
    };

    const handleLogout = async () => {
        const ok = await confirm({
            title: "Disconnect WhatsApp",
            message: "Are you sure you want to disconnect WhatsApp? You will need to scan the QR code again.",
            confirmLabel: "Disconnect",
            variant: "danger"
        });
        if (!ok) return;

        setIsLoading(true);
        try {
            await fetch('/api/whatsapp', {
                method: 'DELETE'
            });
            setStatus('DISCONNECTED');
            setQrCodeData(null);
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-700 p-2">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-5">
                    <div className="p-4 bg-emerald-100 rounded-[1.5rem] text-emerald-600 shadow-inner">
                        <Smartphone size={32} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-semibold text-slate-800 tracking-tight">WhatsApp Engine</h2>
                        <p className="text-slate-500 text-xs font-medium mt-1 uppercase tracking-wider">Direct Patient Messaging</p>
                    </div>
                </div>
                <div className={`px-5 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider border shadow-sm ${status === 'READY' || status === 'AUTHENTICATED'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-100 ring-4 ring-emerald-500/5'
                    : status === 'INITIALIZING' ? 'bg-blue-50 text-blue-700 border-blue-100'
                        : status === 'ERROR' ? 'bg-rose-50 text-rose-700 border-rose-100'
                            : 'bg-white/60 text-slate-500 border-white/80'
                    }`}>
                    <div className="flex items-center gap-3">
                        {(status === 'READY' || status === 'AUTHENTICATED') && (
                            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                        )}
                        {status === 'READY' || status === 'AUTHENTICATED' ? 'System Ready' : status.replace('_', ' ')}
                    </div>
                </div>
            </div>

            <div className="bg-white/40 backdrop-blur-2xl border border-white/80 rounded-[2.5rem] p-12 shadow-2xl shadow-slate-200/60 min-h-[450px] flex flex-col items-center justify-center text-center relative overflow-hidden">
                {/* Background Decoration */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 via-blue-500 to-indigo-500 opacity-50" />

                {status === 'DISCONNECTED' && (
                    <div className="space-y-8 animate-in fade-in zoom-in duration-500">
                        <div className="w-24 h-24 bg-slate-100 rounded-[2rem] flex items-center justify-center text-slate-300 mx-auto shadow-inner">
                            <Smartphone size={48} className="stroke-[1.5]" />
                        </div>
                        <div>
                            <h3 className="text-xl font-semibold text-slate-800 tracking-tight mb-3">Initialize Connection</h3>
                            <p className="text-slate-500 text-sm font-medium max-w-sm mx-auto leading-relaxed">
                                Establish a secure bridge between your clinic and patients for automated report delivery.
                            </p>
                        </div>
                        <button
                            onClick={handleInitialize}
                            disabled={isLoading}
                            className="px-10 py-4 bg-white hover:bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-2xl font-semibold text-sm uppercase tracking-wider transition-all shadow-xl shadow-emerald-900/5 active:scale-95 flex items-center gap-3 mx-auto disabled:opacity-50"
                        >
                            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5 stroke-[2.5]" />}
                            Boot Service
                        </button>
                    </div>
                )}

                {status === 'INITIALIZING' && (
                    <div className="space-y-8">
                        <div className="relative">
                            <div className="w-24 h-24 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mx-auto" />
                            <Smartphone size={32} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-blue-600" />
                        </div>
                        <div>
                            <h3 className="text-xl font-semibold text-slate-800 tracking-tight mb-3">Syncing System</h3>
                            <p className="text-slate-500 text-xs font-medium uppercase tracking-wider">Launching Secure Virtual Instance</p>
                        </div>
                    </div>
                )}

                {status === 'ERROR' && (
                    <div className="space-y-8 animate-in fade-in zoom-in duration-500">
                        <div className="w-24 h-24 bg-rose-50 rounded-[2rem] flex items-center justify-center text-rose-500 mx-auto shadow-sm">
                            <Smartphone size={48} className="stroke-[1.5]" />
                        </div>
                        <div>
                            <h3 className="text-xl font-semibold text-rose-900 tracking-tight mb-3">Initialization Failed</h3>
                            <p className="text-slate-500 text-sm font-medium max-w-xs mx-auto leading-relaxed">
                                We encountered a conflict during startup. Please ensure your network allows external socket connections.
                            </p>
                        </div>
                        <button
                            onClick={handleInitialize}
                            disabled={isLoading}
                            className="px-10 py-4 bg-white hover:bg-rose-50 text-rose-600 border border-rose-100 rounded-2xl font-semibold text-sm uppercase tracking-wider transition-all shadow-xl shadow-rose-900/5 active:scale-95 flex items-center gap-3 mx-auto disabled:opacity-50"
                        >
                            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5 stroke-[2.5]" />}
                            Attempt Re-link
                        </button>
                    </div>
                )}

                {status === 'QR_READY' && qrImageUrl && (
                    <div className="space-y-10 animate-in fade-in zoom-in duration-500 max-w-lg w-full">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
                            <div className="bg-white p-6 rounded-[2.5rem] shadow-2xl shadow-slate-200/80 border border-slate-100 ring-1 ring-black/5 relative group">
                                <img src={qrImageUrl} alt="WhatsApp QR Code" className="w-full aspect-square object-contain" />
                                <div className="absolute inset-0 bg-white/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center p-8 text-center text-xs font-semibold uppercase text-slate-900 tracking-wider">
                                    Refresh if expired
                                </div>
                            </div>

                            <div className="text-left space-y-6">
                                <h3 className="text-xl font-semibold text-slate-800 tracking-tight">Scan Identity</h3>
                                <div className="space-y-4">
                                    {[
                                        'Open WhatsApp on phone',
                                        'Navigate to Linked Devices',
                                        'Point camera at this screen'
                                    ].map((step, i) => (
                                        <div key={i} className="flex items-center gap-4 group">
                                            <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-xs font-semibold text-slate-400 group-hover:bg-emerald-100 group-hover:text-emerald-600 transition-all">
                                                0{i + 1}
                                            </div>
                                            <p className="text-sm font-medium text-slate-600">{step}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {(status === 'AUTHENTICATED' || status === 'READY') && (
                    <div className="space-y-8 animate-in fade-in zoom-in duration-500">
                        <div className="relative">
                            <div className="w-32 h-32 bg-emerald-50 rounded-[3rem] flex items-center justify-center text-emerald-500 mx-auto shadow-inner ring-8 ring-emerald-500/5">
                                <CheckCircle size={64} className="stroke-[1]" />
                            </div>
                            <div className="absolute -bottom-2 -right-2 bg-white p-3 rounded-2xl shadow-lg border border-emerald-100">
                                <Smartphone size={20} className="text-emerald-600" />
                            </div>
                        </div>

                        <div>
                            <h3 className="text-2xl font-semibold text-slate-800 tracking-tight mb-3">Core Active</h3>
                            <p className="text-slate-500 text-sm font-medium max-w-sm mx-auto leading-relaxed">
                                Secure patient gateway is established. Automated report distribution and prescription alerts are enabled.
                            </p>
                        </div>

                        <button
                            onClick={handleLogout}
                            disabled={isLoading}
                            className="px-8 py-3 bg-white hover:bg-rose-50 text-rose-500 border border-rose-100 rounded-xl font-semibold text-xs uppercase tracking-wider transition-all active:scale-95 flex items-center gap-2 mx-auto mt-6"
                        >
                            <LogOut size={14} className="stroke-[2.5]" />
                            Terminate Bridge
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
