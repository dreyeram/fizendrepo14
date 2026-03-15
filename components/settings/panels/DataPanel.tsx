"use client";

import React, { useState } from "react";
import { Database, Download, Upload, HardDrive, Trash2, RefreshCw, FileJson, FileSpreadsheet, Check, AlertCircle, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import USBFilePicker from "@/components/ui/USBFilePicker";

interface DataPanelProps {
    userId: string;
    onUpdate: () => void;
}

// Helper to convert data to CSV format
function convertToCSV(data: any[], headers?: string[]): string {
    if (!data || data.length === 0) return '';

    // Use provided headers or extract from first object
    const csvHeaders = headers || Object.keys(data[0]);

    const rows = data.map(row => {
        return csvHeaders.map(header => {
            const value = row[header];
            // Handle nested objects, arrays, null/undefined
            if (value === null || value === undefined) return '';
            if (typeof value === 'object') return JSON.stringify(value).replace(/"/g, '""');
            // Escape quotes and wrap in quotes if contains comma or newline
            const stringValue = String(value);
            if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
                return `"${stringValue.replace(/"/g, '""')}"`;
            }
            return stringValue;
        }).join(',');
    });

    return [csvHeaders.join(','), ...rows].join('\n');
}

// Helper to trigger file download
function downloadFile(content: string, filename: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

export default function DataPanel({ userId, onUpdate }: DataPanelProps) {
    const [isExporting, setIsExporting] = useState(false);
    const [isClearing, setIsClearing] = useState(false);
    const [exportSuccess, setExportSuccess] = useState('');
    const [exportError, setExportError] = useState('');
    const [isImportPickerOpen, setIsImportPickerOpen] = useState(false);

    // Simulated storage usage (would come from server in production)
    const storageUsed = 2.4; // GB
    const storageTotal = 10; // GB
    const storagePercent = (storageUsed / storageTotal) * 100;

    const handleExport = async (format: 'json' | 'csv') => {
        setIsExporting(true);
        setExportError('');
        setExportSuccess('');

        try {
            // Fetch data from the API
            const response = await fetch('/api/export-data');

            if (!response.ok) {
                throw new Error('Failed to fetch data for export');
            }

            const data = await response.json();
            const timestamp = new Date().toISOString().split('T')[0];

            if (format === 'json') {
                // Export as JSON
                const jsonContent = JSON.stringify(data, null, 2);
                downloadFile(jsonContent, `ent-suite-backup-${timestamp}.json`, 'application/json');
            } else {
                // Export as CSV - flatten the data structure for spreadsheet compatibility
                const flattenedPatients = (data.patients || []).map((p: any) => ({
                    id: p.id,
                    fullName: p.fullName,
                    mrn: p.mrn,
                    mobile: p.mobile,
                    email: p.email,
                    gender: p.gender,
                    dateOfBirth: p.dateOfBirth,
                    address: p.address,
                    createdAt: p.createdAt,
                    procedureCount: p.procedures?.length || 0,
                }));

                const csvContent = convertToCSV(flattenedPatients, [
                    'id', 'fullName', 'mrn', 'mobile', 'email', 'gender', 'dateOfBirth', 'address', 'createdAt', 'procedureCount'
                ]);
                downloadFile(csvContent, `ent-suite-patients-${timestamp}.csv`, 'text/csv');
            }

            setExportSuccess(`Data exported as ${format.toUpperCase()}!`);
            setTimeout(() => setExportSuccess(''), 4000);
        } catch (error) {
            console.error('Export error:', error);
            setExportError('Export failed. Please try again.');
            setTimeout(() => setExportError(''), 4000);
        } finally {
            setIsExporting(false);
        }
    };

    const handleImportSelected = async (files: File[]) => {
        const file = files[0];
        if (!file) return;

        // Implementation for data import would go here
        // For now just show a not implemented message
        setExportError('Data import from file is not fully implemented yet.');
        setTimeout(() => setExportError(''), 4000);
    };

    const handleClearCache = async () => {
        if (!confirm('Clear all cached data? This will not delete your saved data.')) return;
        setIsClearing(true);

        try {
            // Clear localStorage items (except critical ones)
            const keysToKeep = ['appSettings', 'theme'];
            const allKeys = Object.keys(localStorage);
            allKeys.forEach(key => {
                if (!keysToKeep.includes(key)) {
                    localStorage.removeItem(key);
                }
            });

            // Clear session storage
            sessionStorage.clear();

            // Simulate a small delay for UX
            await new Promise(r => setTimeout(r, 500));
            onUpdate();
        } catch (error) {
            console.error('Clear cache error:', error);
        } finally {
            setIsClearing(false);
        }
    };

    return (
        <div className="max-w-2xl space-y-8">
            {/* Storage Usage */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                    <HardDrive size={16} className="text-slate-500" />
                    <div>
                        <h4 className="text-sm font-bold text-slate-700">Storage Usage</h4>
                        <p className="text-xs text-slate-500 mt-0.5">Media files and database storage</p>
                    </div>
                </div>

                <div className="p-6">
                    <div className="flex items-end justify-between mb-3">
                        <div>
                            <span className="text-3xl font-black text-slate-900">{storageUsed}</span>
                            <span className="text-sm text-slate-500 ml-1">GB used</span>
                        </div>
                        <span className="text-sm font-semibold text-slate-500">of {storageTotal} GB</span>
                    </div>

                    <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all ${storagePercent > 80 ? 'bg-rose-500' :
                                    storagePercent > 60 ? 'bg-amber-500' : 'bg-blue-500'
                                }`}
                            style={{ width: `${storagePercent}%` }}
                        />
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-4">
                        {[
                            { label: 'Images', size: '1.8 GB', color: 'bg-blue-100 text-blue-700' },
                            { label: 'Videos', size: '0.4 GB', color: 'bg-purple-100 text-purple-700' },
                            { label: 'Reports', size: '0.2 GB', color: 'bg-emerald-100 text-emerald-700' },
                        ].map(item => (
                            <div key={item.label} className={`p-3 rounded-xl ${item.color}`}>
                                <p className="text-xs font-bold">{item.label}</p>
                                <p className="text-lg font-black">{item.size}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Export Data */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                    <Download size={16} className="text-slate-500" />
                    <div>
                        <h4 className="text-sm font-bold text-slate-700">Export Data</h4>
                        <p className="text-xs text-slate-500 mt-0.5">Download your data for backup</p>
                    </div>
                </div>

                <div className="p-6">
                    <div className="grid grid-cols-2 gap-4">
                        <button
                            onClick={() => handleExport('json')}
                            disabled={isExporting}
                            className="p-4 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors group disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isExporting ? (
                                <Loader2 size={24} className="text-amber-500 mb-2 animate-spin" />
                            ) : (
                                <FileJson size={24} className="text-amber-500 mb-2 group-hover:scale-110 transition-transform" />
                            )}
                            <p className="font-bold text-sm text-slate-700">Export as JSON</p>
                            <p className="text-[10px] text-slate-500 mt-1">Full data with structure</p>
                        </button>

                        <button
                            onClick={() => handleExport('csv')}
                            disabled={isExporting}
                            className="p-4 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors group disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isExporting ? (
                                <Loader2 size={24} className="text-emerald-500 mb-2 animate-spin" />
                            ) : (
                                <FileSpreadsheet size={24} className="text-emerald-500 mb-2 group-hover:scale-110 transition-transform" />
                            )}
                            <p className="font-bold text-sm text-slate-700">Export as CSV</p>
                            <p className="text-[10px] text-slate-500 mt-1">Spreadsheet compatible</p>
                        </button>
                    </div>

                    <AnimatePresence>
                        {exportSuccess && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 10 }}
                                className="mt-4 p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-2"
                            >
                                <Check size={16} className="text-emerald-600" />
                                <span className="text-sm font-semibold text-emerald-700">{exportSuccess}</span>
                            </motion.div>
                        )}
                        {exportError && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 10 }}
                                className="mt-4 p-3 bg-rose-50 border border-rose-100 rounded-xl flex items-center gap-2"
                            >
                                <AlertCircle size={16} className="text-rose-600" />
                                <span className="text-sm font-semibold text-rose-700">{exportError}</span>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Import Data */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                    <Upload size={16} className="text-slate-500" />
                    <div>
                        <h4 className="text-sm font-bold text-slate-700">Import Data</h4>
                        <p className="text-xs text-slate-500 mt-0.5">Restore from a backup file</p>
                    </div>
                </div>

                <div className="p-6">
                    <button 
                        onClick={() => setIsImportPickerOpen(true)}
                        className="w-full flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors"
                    >
                        <Upload size={32} className="text-slate-400 mb-2" />
                        <p className="font-bold text-sm text-slate-700">Select backup file to import</p>
                        <p className="text-[10px] text-slate-500 mt-1">(JSON only)</p>
                    </button>
                    <p className="text-xs text-slate-400 mt-3 text-center">
                        ⚠️ Import will merge with existing data. Duplicates will be skipped.
                    </p>
                </div>
            </div>

            {/* Clear Cache */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <RefreshCw size={20} className="text-slate-400" />
                        <div>
                            <h4 className="text-sm font-bold text-slate-700">Clear Cache</h4>
                            <p className="text-xs text-slate-500">Free up temporary storage</p>
                        </div>
                    </div>
                    <button
                        onClick={handleClearCache}
                        disabled={isClearing}
                        className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                        {isClearing ? (
                            <Loader2 size={14} className="animate-spin" />
                        ) : (
                            <Trash2 size={14} />
                        )}
                        {isClearing ? 'Clearing...' : 'Clear Cache'}
                    </button>
                </div>
            </div>
            
            <USBFilePicker 
                isOpen={isImportPickerOpen}
                onClose={() => setIsImportPickerOpen(false)}
                onFilesSelected={handleImportSelected}
                title="Select Backup to Import"
                accept=".json"
            />
        </div>
    );
}
