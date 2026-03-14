"use client";

import React, { useState, useEffect } from "react";
import { format } from "date-fns";
import {
    Search,
    Plus,
    Eye,
    Calendar,
    MoreVertical,
    FileText,
    User
} from "lucide-react";
import { searchPatients } from "@/app/actions/auth";

// Interfaces (matching PatientManager for consistency)
export interface Procedure {
    id: string;
    type: string;
    status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED';
    createdAt: string;
    hasReport: boolean;
    hasMedia: boolean;
}

export interface Patient {
    id: string;
    name: string;
    age: number;
    gender: 'Male' | 'Female' | 'Other';
    mobile: string;
    email: string;
    mrn: string;
    registeredAt: string;
    procedures: Procedure[];
    contactInfo?: string;
}

interface PatientListProps {
    onViewPatient: (patient: Patient) => void;
    onRegisterPatient?: () => void;
    onScheduleProcedure: (patient: Patient) => void;
    initialQuery?: string;
}

export function PatientList({ onViewPatient, onRegisterPatient, onScheduleProcedure, initialQuery = "" }: PatientListProps) {
    const [patients, setPatients] = useState<Patient[]>([]);
    const [searchQuery, setSearchQuery] = useState(initialQuery);
    const [isLoading, setIsLoading] = useState(true);

    // React to initialQuery changes (from global search)
    useEffect(() => {
        if (initialQuery !== searchQuery) {
            setSearchQuery(initialQuery);
        }
    }, [initialQuery]);

    // Load patients when search query or component mounts
    useEffect(() => {
        // Debounce could be added here, but for now simple effect
        const timer = setTimeout(() => {
            loadPatients();
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const loadPatients = async () => {
        setIsLoading(true);
        try {
            const result = await searchPatients(searchQuery);
            if (!result.success) {
                console.error("Search failed:", result.error);
                setPatients([]);
                return;
            }

            const searchResults = result.patients || [];
            // Map results to Patient interface
            const mapped: Patient[] = searchResults.map((dbP: any) => ({
                id: dbP.id,
                name: dbP.fullName,
                age: dbP.age || 0,
                gender: dbP.gender || 'Other',
                mobile: dbP.mobile || '',
                email: dbP.email || '',
                mrn: dbP.mrn,
                registeredAt: dbP.createdAt,
                procedures: (dbP.procedures || []).map((proc: any) => ({
                    id: proc.id,
                    type: proc.type,
                    status: proc.status,
                    createdAt: proc.createdAt,
                    hasReport: !!proc.report,
                    hasMedia: false // simplified
                }))
            }));
            setPatients(mapped);
        } catch (error) {
            console.error("Error loading patients:", error);
        } finally {
            setIsLoading(false);
        }
    };

    // Filter based on local search query (if needed, or trigger api)
    // For now, let's just trigger API on search change debounced, or handled by effect?
    // The simplified version just filters locally or re-calls.
    // Let's implement local filtering for responsiveness on small data, 
    // but the searchPatients action does a DB search.
    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        loadPatients();
    };

    return (
        <div className="h-full flex flex-col bg-white">
            {/* Toolbar */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
                <h2 className="heading-serif text-slate-800">Patients</h2>

                <div className="flex items-center gap-3">
                    {/* Search */}
                    <form onSubmit={handleSearch} className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search patients..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch(e)}
                            className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-body-base w-64 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                        />
                    </form>

                    {/* Add Patient */}
                    {onRegisterPatient && (
                        <button
                            onClick={onRegisterPatient}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white label-uppercase rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                        >
                            <Plus className="w-4 h-4" />
                            <span>Add Patient</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Table Content */}
            <div className="flex-1 overflow-auto">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-white sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th className="px-6 py-3 border-b border-slate-200 label-uppercase text-slate-500">Patient Name</th>
                            <th className="px-6 py-3 border-b border-slate-200 label-uppercase text-slate-500">MRN</th>
                            <th className="px-6 py-3 border-b border-slate-200 label-uppercase text-slate-500">Age/Gender</th>
                            <th className="px-6 py-3 border-b border-slate-200 label-uppercase text-slate-500">Mobile</th>
                            <th className="px-6 py-3 border-b border-slate-200 label-uppercase text-slate-500">Last Visit</th>
                            <th className="px-6 py-3 border-b border-slate-200 label-uppercase text-slate-500 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {isLoading ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                                    Loading patients...
                                </td>
                            </tr>
                        ) : patients.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                                    No patients found
                                </td>
                            </tr>
                        ) : (
                            patients.map((patient) => (
                                <tr key={patient.id} className="hover:bg-slate-50/80 transition-colors group">
                                    <td className="px-6 py-4">
                                        <button
                                            onClick={() => onViewPatient(patient)}
                                            className="flex items-center gap-3 text-left hover:opacity-90 transition-opacity"
                                        >
                                            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-xs">
                                                {patient.name.charAt(0)}
                                            </div>
                                            <div>
                                                <div className="body-readable font-semibold text-blue-700 hover:text-blue-900 hover:underline">{patient.name}</div>
                                                <div className="text-xs text-slate-500 leading-none">{patient.email}</div>
                                            </div>
                                        </button>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="data-tabular text-slate-600 bg-slate-100 px-2 py-1 rounded">
                                            {patient.mrn}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="data-tabular text-slate-600">{patient.age}</span>
                                        <span className="mx-1 text-slate-300">/</span>
                                        <span className="label-uppercase text-slate-500">{patient.gender}</span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="data-tabular text-slate-600">{patient.mobile || '-'}</span>
                                    </td>
                                    <td className="px-6 py-4 data-tabular text-slate-600">
                                        {patient.procedures.length > 0
                                            ? format(new Date(patient.procedures[0].createdAt), "MMM d, yyyy")
                                            : <span className="text-slate-400 italic body-readable text-sm">No visits</span>
                                        }
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        {/* Actions always visible */}
                                        <div className="flex items-center justify-end gap-1">
                                            <button
                                                onClick={() => onScheduleProcedure(patient)}
                                                className="px-3 py-1.5 label-uppercase text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors flex items-center gap-1"
                                                title="Schedule Procedure"
                                            >
                                                <Calendar className="w-3.5 h-3.5" />
                                                Schedule
                                            </button>
                                            <button
                                                onClick={() => onViewPatient(patient)}
                                                className="px-3 py-1.5 label-uppercase text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1"
                                                title="View Details"
                                            >
                                                <Eye className="w-3.5 h-3.5" />
                                                View
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
