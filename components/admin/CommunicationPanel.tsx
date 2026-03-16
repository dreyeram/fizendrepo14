"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    MessageSquare, Mail, RefreshCw, Loader2, CheckCircle, XCircle,
    Smartphone, Settings2, Send, Activity, Clock, AlertTriangle,
    Wifi, WifiOff, Zap, Shield
} from 'lucide-react';
import QRCode from 'qrcode';
import { useConfirm } from "@/lib/hooks/useConfirm";
import { useNotify } from "@/lib/store/ui.store";

interface WhatsAppStatus {
    connection: string;
    qrCode: string | null;
    lastPing: string | null;
    uptime: number;
    messagesSent: number;
    messagesFailed: number;
    lastError: string | null;
}

interface EmailConfig {
    host?: string;
    port?: number;
    secure?: boolean;
    user?: string;
    fromName?: string;
    fromEmail?: string;
}

export default function CommunicationPanel() {
    const [activeTab, setActiveTab] = useState<'whatsapp' | 'email'>('whatsapp');

    // WhatsApp state
    const [waStatus, setWaStatus] = useState<WhatsAppStatus | null>(null);
    const [waLoading, setWaLoading] = useState(false);
    const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
    const confirm = useConfirm();
    const notify = useNotify();

    // Email state
    const [emailConfigured, setEmailConfigured] = useState(false);
    const [emailConfig, setEmailConfig] = useState<EmailConfig>({});
    const [emailForm, setEmailForm] = useState({
        host: '',
        port: 587,
        secure: false,
        user: '',
        password: '',
        fromName: '',
        fromEmail: ''
    });
    const [emailLoading, setEmailLoading] = useState(false);
    const [emailTestResult, setEmailTestResult] = useState<{ success: boolean; error?: string } | null>(null);

    // Fetch statuses
    const fetchStatus = useCallback(async () => {
        try {
            const res = await fetch('/api/communication');
            const data = await res.json();

            if (data.whatsapp) {
                setWaStatus(data.whatsapp);
                if (data.whatsapp.qrCode) {
                    const url = await QRCode.toDataURL(data.whatsapp.qrCode);
                    setQrImageUrl(url);
                } else {
                    setQrImageUrl(null);
                }
            }

            if (data.email) {
                setEmailConfigured(data.email.configured);
                if (data.email.config) {
                    setEmailConfig(data.email.config);
                    setEmailForm(prev => ({ ...prev, ...data.email.config }));
                }
            }
        } catch (error) {
            console.error('Failed to fetch status:', error);
        }
    }, []);

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 3000);
        return () => clearInterval(interval);
    }, [fetchStatus]);

    // WhatsApp handlers
    const handleWaConnect = async () => {
        setWaLoading(true);
        try {
            await fetch('/api/communication', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ service: 'whatsapp', action: 'initialize' })
            });
        } catch (error) {
            console.error('Connect failed:', error);
        } finally {
            setWaLoading(false);
        }
    };

    const handleWaDisconnect = async () => {
        const ok = await confirm({
            title: "Disconnect WhatsApp",
            message: "Disconnect WhatsApp? You will need to scan QR code again.",
            confirmLabel: "Disconnect",
            variant: "danger"
        });
        if (!ok) return;

        setWaLoading(true);
        try {
            await fetch('/api/communication?service=whatsapp', { method: 'DELETE' });
            setWaStatus(null);
            setQrImageUrl(null);
        } catch (error) {
            console.error('Disconnect failed:', error);
        } finally {
            setWaLoading(false);
        }
    };

    // Email handlers
    const handleEmailConfigure = async () => {
        setEmailLoading(true);
        setEmailTestResult(null);
        try {
            await fetch('/api/communication', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    service: 'email',
                    action: 'configure',
                    config: emailForm
                })
            });

            // Test connection
            const testRes = await fetch('/api/communication', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ service: 'email', action: 'test' })
            });
            const testResult = await testRes.json();
            setEmailTestResult(testResult);

            if (testResult.success) {
                setEmailConfigured(true);
            }
        } catch (error) {
            console.error('Email config failed:', error);
            setEmailTestResult({ success: false, error: 'Configuration failed' });
        } finally {
            setEmailLoading(false);
        }
    };

    const formatUptime = (ms: number) => {
        if (!ms) return '--';
        const hours = Math.floor(ms / (1000 * 60 * 60));
        const mins = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
        return `${hours}h ${mins}m`;
    };

    const getConnectionColor = (status: string) => {
        switch (status) {
            case 'READY': return 'text-green-500';
            case 'AUTHENTICATED': return 'text-blue-500';
            case 'CONNECTING':
            case 'QR_READY': return 'text-amber-500';
            case 'ERROR': return 'text-red-500';
            default: return 'text-slate-400';
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-700 p-2">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-5">
                    <div className="p-4 bg-blue-100 rounded-[1.5rem] text-blue-600 shadow-inner">
                        <MessageSquare size={32} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-semibold text-slate-800 tracking-tight">Communication</h2>
                        <p className="text-slate-500 text-xs font-medium mt-1 uppercase tracking-wider">Channels & Connectivity</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    <Shield className="w-4 h-4 text-emerald-500" />
                    Medical-Grade Security
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-4 p-1.5 bg-white/60 backdrop-blur-xl border border-white/80 rounded-2xl shadow-lg shadow-slate-200/40 w-fit">
                <button
                    onClick={() => setActiveTab('whatsapp')}
                    className={`px-8 py-3 rounded-xl font-semibold text-xs uppercase tracking-wider transition-all flex items-center gap-3 ${activeTab === 'whatsapp'
                        ? 'bg-white text-emerald-700 shadow-md ring-1 ring-black/5'
                        : 'text-slate-500 hover:text-slate-700'
                        }`}
                >
                    <Smartphone className="w-4 h-4" />
                    WhatsApp
                    {waStatus?.connection === 'READY' && (
                        <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('email')}
                    className={`px-8 py-3 rounded-xl font-semibold text-xs uppercase tracking-wider transition-all flex items-center gap-3 ${activeTab === 'email'
                        ? 'bg-white text-indigo-700 shadow-md ring-1 ring-black/5'
                        : 'text-slate-500 hover:text-slate-700'
                        }`}
                >
                    <Mail className="w-4 h-4" />
                    Email (SMTP)
                    {emailConfigured && (
                        <span className="w-2 h-2 bg-indigo-500 rounded-full" />
                    )}
                </button>
            </div>

            <AnimatePresence mode="wait">
                {/* WhatsApp Tab */}
                {activeTab === 'whatsapp' && (
                    <motion.div
                        key="whatsapp"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-6"
                    >
                        {/* Status Card */}
                        <div className="bg-white/40 backdrop-blur-2xl border border-white/80 rounded-[2.5rem] overflow-hidden shadow-2xl shadow-slate-200/60 max-w-4xl">
                            <div className="p-8 border-b border-white/50 bg-white/30">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-6">
                                        <div className={`p-4 rounded-2xl shadow-inner ${waStatus?.connection === 'READY'
                                            ? 'bg-emerald-100 text-emerald-600'
                                            : waStatus?.connection === 'ERROR'
                                                ? 'bg-rose-100 text-rose-600'
                                                : 'bg-slate-100 text-slate-500'
                                            }`}>
                                            {waStatus?.connection === 'READY' ? (
                                                <Wifi className="w-8 h-8" />
                                            ) : waStatus?.connection === 'ERROR' ? (
                                                <WifiOff className="w-8 h-8" />
                                            ) : (
                                                <Smartphone className="w-8 h-8" />
                                            )}
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-semibold text-slate-800 tracking-tight">WhatsApp Gateway</h3>
                                            <p className={`text-xs font-semibold uppercase tracking-wider mt-1 ${getConnectionColor(waStatus?.connection || 'DISCONNECTED')}`}>
                                                {waStatus?.connection || 'DISCONNECTED'}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex gap-4">
                                        {waStatus?.connection === 'READY' || waStatus?.connection === 'AUTHENTICATED' ? (
                                            <button
                                                onClick={handleWaDisconnect}
                                                disabled={waLoading}
                                                className="px-6 py-3 bg-white hover:bg-rose-50 text-rose-600 border border-rose-100 rounded-xl font-semibold text-sm uppercase tracking-wider transition-all shadow-sm active:scale-95"
                                            >
                                                Disconnect
                                            </button>
                                        ) : (
                                            <button
                                                onClick={handleWaConnect}
                                                disabled={waLoading || waStatus?.connection === 'CONNECTING' || waStatus?.connection === 'QR_READY'}
                                                className="px-8 py-3 bg-white hover:bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-xl font-semibold text-sm uppercase tracking-wider transition-all shadow-xl shadow-emerald-900/5 active:scale-95 flex items-center gap-3"
                                            >
                                                {waLoading || waStatus?.connection === 'CONNECTING' ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <Zap className="w-4 h-4" />
                                                )}
                                                Initialize
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* QR Code Display */}
                            {waStatus?.connection === 'QR_READY' && qrImageUrl && (
                                <div className="p-12 bg-white/20 flex flex-col items-center animate-in zoom-in duration-500">
                                    <div className="bg-white p-6 rounded-[2.5rem] shadow-2xl border border-white ring-1 ring-black/5">
                                        <img src={qrImageUrl} alt="WhatsApp QR" className="w-64 h-64" />
                                    </div>
                                    <div className="mt-8 text-center max-w-sm">
                                        <h4 className="text-xl font-black text-slate-900 mb-4 tracking-tight">Authentication Required</h4>
                                        <div className="text-left space-y-3 bg-white/50 p-6 rounded-2xl border border-white">
                                            {[
                                                '1. Open WhatsApp on your phone',
                                                '2. Settings → Linked Devices',
                                                '3. Tap "Link a Device"',
                                                '4. Scan this QR code'
                                            ].map((step, i) => (
                                                <p key={i} className="text-xs text-slate-600 font-medium uppercase tracking-wider leading-relaxed">
                                                    {step}
                                                </p>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Error Display */}
                            {waStatus?.connection === 'ERROR' && waStatus.lastError && (
                                <div className="p-8 bg-rose-50/50 border-t border-rose-100">
                                    <div className="flex items-start gap-4">
                                        <AlertTriangle className="w-6 h-6 text-rose-500" />
                                        <div>
                                            <h4 className="font-semibold text-rose-900 text-lg">Infrastructure Error</h4>
                                            <p className="text-sm text-rose-600 font-medium mt-1">{waStatus.lastError}</p>
                                            <button
                                                onClick={handleWaConnect}
                                                className="mt-6 flex items-center gap-2 text-sm font-semibold text-rose-700 hover:text-rose-900 uppercase tracking-wider"
                                            >
                                                <RefreshCw className="w-4 h-4" />
                                                Retry Connection
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Stats */}
                            {waStatus?.connection === 'READY' && (
                                <div className="p-8 grid grid-cols-4 gap-8 bg-white/30 backdrop-blur-sm border-t border-white/50">
                                    {[
                                        { label: 'DELIVERED', val: waStatus.messagesSent, color: 'text-slate-900' },
                                        { label: 'FAILED', val: waStatus.messagesFailed, color: 'text-rose-600' },
                                        { label: 'UPTIME', val: formatUptime(waStatus.uptime), color: 'text-slate-900' },
                                        { label: 'SYSTEM', val: 'HEALTHY', color: 'text-emerald-600', icon: Activity }
                                    ].map((stat, i) => (
                                        <div key={i} className="flex flex-col">
                                            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{stat.label}</div>
                                            <div className={`text-xl font-semibold tracking-tight ${stat.color} flex items-center gap-2`}>
                                                {stat.icon && <stat.icon className="w-5 h-5" />}
                                                {stat.val}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}

                {/* Email Tab */}
                {activeTab === 'email' && (
                    <motion.div
                        key="email"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="max-w-4xl"
                    >
                        <div className="bg-white/40 backdrop-blur-2xl border border-white/80 rounded-[2.5rem] p-10 shadow-2xl shadow-slate-200/60 transition-all">
                            <div className="flex items-center gap-4 mb-10">
                                <div className="p-4 bg-indigo-50 rounded-2xl text-indigo-600 shadow-inner">
                                    <Settings2 className="w-8 h-8" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold text-slate-800 tracking-tight">SMTP Configuration</h3>
                                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Mail Delivery Infrastructure</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-8">
                                {[
                                    { label: 'SMTP Host', key: 'host', placeholder: 'smtp.gmail.com' },
                                    { label: 'Port', key: 'port', type: 'number' },
                                    { label: 'Username', key: 'user', placeholder: 'your@email.com' },
                                    { label: 'Password', key: 'password', type: 'password', placeholder: '••••••••' },
                                    { label: 'From Name', key: 'fromName', placeholder: 'Your Clinic' },
                                    { label: 'From Email', key: 'fromEmail', placeholder: 'noreply@yourclinic.com' }
                                ].map((field) => (
                                    <div key={field.key}>
                                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 ml-2">{field.label}</label>
                                        <input
                                            type={field.type || 'text'}
                                            value={emailForm[field.key as keyof typeof emailForm] as string | number}
                                            onChange={(e) => setEmailForm(p => ({ ...p, [field.key]: field.type === 'number' ? parseInt(e.target.value) : e.target.value }))}
                                            placeholder={field.placeholder}
                                            className="w-full bg-white/50 border border-slate-100 rounded-2xl px-6 py-4 text-slate-800 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500/50 transition-all font-semibold text-sm"
                                        />
                                    </div>
                                ))}
                            </div>

                            <div className="flex items-center gap-3 mt-8 ml-2">
                                <input
                                    type="checkbox"
                                    id="secure"
                                    checked={emailForm.secure}
                                    onChange={(e) => setEmailForm(p => ({ ...p, secure: e.target.checked }))}
                                    className="w-5 h-5 rounded-lg border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <label htmlFor="secure" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Use SSL/TLS (Implicit port 465)</label>
                            </div>

                            <div className="mt-12 flex items-center justify-between bg-white/30 p-6 rounded-3xl border border-white/50">
                                <button
                                    onClick={handleEmailConfigure}
                                    disabled={emailLoading || !emailForm.host || !emailForm.user || !emailForm.password}
                                    className="px-10 py-5 bg-white hover:bg-slate-50 text-indigo-600 border border-indigo-100 rounded-[1.5rem] font-semibold text-sm uppercase tracking-wider shadow-xl shadow-indigo-900/5 active:scale-95 transition-all flex items-center gap-3"
                                >
                                    {emailLoading ? <Loader2 className="animate-spin" /> : <Send size={20} className="stroke-[2.5]" />}
                                    Save & Test System
                                </button>

                                {emailTestResult && (
                                    <div className={`flex items-center gap-3 px-6 py-4 rounded-2xl font-semibold text-xs uppercase tracking-wider border border-white shadow-sm ${emailTestResult.success ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                                        }`}>
                                        {emailTestResult.success ? (
                                            <><CheckCircle className="w-5 h-5" /> Connection SUCCESSful</>
                                        ) : (
                                            <><XCircle className="w-5 h-5" /> {emailTestResult.error || 'Connection Failed'}</>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
