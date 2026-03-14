"use client";

import React, { useState, useEffect } from "react";
import { format } from "date-fns";
import { X, Search, Plus, Clock, Calendar, User, FileText } from "lucide-react";
import { motion } from "framer-motion";
import {
    scheduleProcedureWithTime,
    getAvailableSlots,
    ScheduleSettingsData
} from "@/app/actions/schedule";
import { searchPatients, createPatient } from "@/app/actions/auth";

interface ScheduleModalProps {
    isOpen: boolean;
    onClose: () => void;
    doctorId: string;
    settings: ScheduleSettingsData;
    initialDate?: Date;
    initialTime?: string;
    onSuccess: () => void;
}

interface PatientResult {
    id: string;
    fullName: string;
    mrn: string;
    dateOfBirth?: Date | null;
    gender?: string | null;
}

export function ScheduleModal({
    isOpen,
    onClose,
    doctorId,
    settings,
    initialDate,
    initialTime,
    onSuccess,
}: ScheduleModalProps) {
    // Form state
    const [step, setStep] = useState<"patient" | "schedule">("patient");
    const [selectedPatient, setSelectedPatient] = useState<PatientResult | null>(null);
    // Default to a valid procedure type (ENT > Nasal > Nasal Endoscopy) since we removed the selector
    const [selectedProcedure, setSelectedProcedure] = useState<string>("ent:nasal_sinus:nasal_endoscopy");
    const [selectedDate, setSelectedDate] = useState<Date>(initialDate || new Date());
    const [selectedTime, setSelectedTime] = useState<string>(initialTime || "");
    const [duration, setDuration] = useState<number>(30);
    const [notes, setNotes] = useState<string>("");

    // Search state
    const [patientSearch, setPatientSearch] = useState("");
    const [searchResults, setSearchResults] = useState<PatientResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    // Available slots
    const [availableSlots, setAvailableSlots] = useState<string[]>([]);
    const [loadingSlots, setLoadingSlots] = useState(false);

    // Submission
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string>("");

    // Search for patients
    useEffect(() => {
        const search = async () => {
            if (patientSearch.length < 2) {
                setSearchResults([]);
                return;
            }

            setIsSearching(true);
            try {
                const result = await searchPatients(patientSearch);
                // searchPatients returns { success, patients }
                if (result.success && Array.isArray(result.patients)) {
                    setSearchResults(result.patients.map((p: any) => ({
                        id: p.id,
                        fullName: p.fullName,
                        mrn: p.mrn,
                        dateOfBirth: p.dateOfBirth,
                        gender: p.gender
                    })));
                } else {
                    setSearchResults([]);
                }
            } catch (err) {
                console.error("Search error:", err);
            } finally {
                setIsSearching(false);
            }
        };

        const timer = setTimeout(search, 300);
        return () => clearTimeout(timer);
    }, [patientSearch]);

    // Load available slots when date changes
    useEffect(() => {
        const loadSlots = async () => {
            if (!selectedDate || !duration) return;

            setLoadingSlots(true);
            try {
                const result = await getAvailableSlots(
                    selectedDate,
                    duration,
                    doctorId,
                    settings
                );
                if (result.success && result.slots) {
                    setAvailableSlots(result.slots);
                    // Auto-select initial time if available
                    if (initialTime && result.slots.includes(initialTime)) {
                        setSelectedTime(initialTime);
                    } else if (result.slots.length > 0 && !selectedTime) {
                        setSelectedTime(result.slots[0]);
                    }
                }
            } catch (err) {
                console.error("Error loading slots:", err);
            } finally {
                setLoadingSlots(false);
            }
        };

        loadSlots();
    }, [selectedDate, duration, doctorId, settings, initialTime]);

    // Update duration when procedure changes
    useEffect(() => {
        if (selectedProcedure) {
            // Extract subtype from procedure string
            const subtypeMatch = selectedProcedure.split(":").pop()?.toLowerCase() || "";
            const procedureDurations = settings.procedureDurations as Record<string, number>;

            // Find matching duration
            for (const [key, value] of Object.entries(procedureDurations)) {
                if (subtypeMatch.includes(key) || key.includes(subtypeMatch)) {
                    setDuration(value);
                    return;
                }
            }
            // Default
            setDuration(30);
        }
    }, [selectedProcedure, settings.procedureDurations]);

    // Format time display
    const formatTimeDisplay = (time: string) => {
        const [hours, minutes] = time.split(":").map(Number);
        const ampm = hours >= 12 ? "PM" : "AM";
        const displayHours = hours % 12 || 12;
        return `${displayHours}:${minutes.toString().padStart(2, "0")} ${ampm}`;
    };

    // Handle selection flow
    const handlePatientSelect = (patient: PatientResult) => {
        setSelectedPatient(patient);
        setStep("schedule");
    };

    // Submit
    const handleSubmit = async () => {
        if (!selectedPatient || !selectedProcedure || !selectedTime) {
            setError("Please complete all required fields");
            return;
        }

        setIsSubmitting(true);
        setError("");

        try {
            const result = await scheduleProcedureWithTime({
                patientId: selectedPatient.id,
                doctorId,
                type: selectedProcedure,
                scheduledDate: selectedDate,
                scheduledTime: selectedTime,
                durationMinutes: duration,
                schedulingNotes: notes || undefined,
            });

            if (result.success) {
                onSuccess();
            } else {
                setError(result.error || "Failed to schedule procedure");
            }
        } catch (err) {
            setError("An error occurred while scheduling");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={onClose}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                    <h2 className="text-lg font-semibold text-slate-800">
                        Schedule Procedure
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                        <X className="w-5 h-5 text-slate-500" />
                    </button>
                </div>

                {/* Progress Steps (Simplified) */}
                <div className="flex items-center gap-2 px-6 py-3 bg-slate-50 border-b border-slate-200">
                    <div className={`flex items-center gap-2 ${step === "patient" ? "text-blue-600" : "text-slate-400"}`}>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${step === "patient" ? "bg-blue-600 text-white" : selectedPatient ? "bg-green-500 text-white" : "bg-slate-200"
                            }`}>
                            {selectedPatient ? "✓" : "1"}
                        </div>
                        <span className="text-sm font-medium">Patient</span>
                    </div>
                    <div className="w-8 h-px bg-slate-300" />
                    <div className={`flex items-center gap-2 ${step === "schedule" ? "text-blue-600" : "text-slate-400"}`}>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${step === "schedule" ? "bg-blue-600 text-white" : "bg-slate-200"
                            }`}>
                            2
                        </div>
                        <span className="text-sm font-medium">Schedule</span>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {/* Step 1: Patient Selection */}
                    {step === "patient" && (
                        <div className="space-y-4">
                            {/* Search */}
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                <input
                                    type="text"
                                    value={patientSearch}
                                    onChange={(e) => setPatientSearch(e.target.value)}
                                    placeholder="Search by name or MRN..."
                                    className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    autoFocus
                                />
                            </div>

                            {/* Results */}
                            {isSearching && (
                                <div className="text-center py-4 text-slate-500">
                                    Searching...
                                </div>
                            )}

                            {!isSearching && searchResults.length > 0 && (
                                <div className="space-y-2">
                                    {searchResults.map(patient => (
                                        <div
                                            key={patient.id}
                                            onClick={() => handlePatientSelect(patient)}
                                            className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-blue-50 hover:border-blue-200 transition-colors"
                                        >
                                            <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
                                                <span className="text-sm font-medium text-slate-600">
                                                    {patient.fullName.charAt(0).toUpperCase()}
                                                </span>
                                            </div>
                                            <div className="flex-1">
                                                <div className="font-medium text-slate-800">
                                                    {patient.fullName}
                                                </div>
                                                <div className="text-sm text-slate-500">
                                                    {patient.mrn} • {patient.gender}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {!isSearching && patientSearch.length >= 2 && searchResults.length === 0 && (
                                <div className="text-center py-8 border border-dashed border-slate-300 rounded-lg">
                                    <User className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                                    <p className="text-slate-500 mb-3">No patients found</p>
                                    <button className="text-blue-600 font-medium text-sm hover:underline">
                                        + Register New Patient
                                    </button>
                                </div>
                            )}

                            {patientSearch.length < 2 && (
                                <div className="text-center py-8 text-slate-500 text-sm">
                                    Type at least 2 characters to search
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 2: Schedule (Procedure step skipped) */}
                    {step === "schedule" && (
                        <div className="space-y-4">
                            {/* Summary */}
                            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm">
                                <div className="flex justify-between mb-1">
                                    <span className="text-slate-500">Patient:</span>
                                    <span className="font-medium text-slate-700">{selectedPatient?.fullName}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Procedure:</span>
                                    <span className="font-medium text-slate-700">Standard Consultation</span>
                                </div>
                            </div>

                            {/* Date Picker */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    <Calendar className="w-4 h-4 inline mr-1" />
                                    Date
                                </label>
                                <input
                                    type="date"
                                    value={format(selectedDate, "yyyy-MM-dd")}
                                    onChange={(e) => setSelectedDate(new Date(e.target.value))}
                                    min={format(new Date(), "yyyy-MM-dd")}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            {/* Duration */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    <Clock className="w-4 h-4 inline mr-1" />
                                    Duration
                                </label>
                                <select
                                    value={duration}
                                    onChange={(e) => setDuration(Number(e.target.value))}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value={15}>15 minutes</option>
                                    <option value={30}>30 minutes</option>
                                    <option value={45}>45 minutes</option>
                                    <option value={60}>60 minutes</option>
                                    <option value={90}>90 minutes</option>
                                </select>
                            </div>

                            {/* Time Slots */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    Available Times
                                </label>
                                {loadingSlots ? (
                                    <div className="text-center py-4 text-slate-500">
                                        Loading available slots...
                                    </div>
                                ) : availableSlots.length === 0 ? (
                                    <div className="text-center py-4 text-slate-500 bg-slate-50 rounded-lg">
                                        No available slots for this date
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto">
                                        {availableSlots.map(slot => (
                                            <button
                                                key={slot}
                                                onClick={() => setSelectedTime(slot)}
                                                className={`px-3 py-2 text-sm rounded-lg border transition-colors ${selectedTime === slot
                                                    ? "bg-blue-600 text-white border-blue-600"
                                                    : "bg-white text-slate-700 border-slate-200 hover:border-blue-300"
                                                    }`}
                                            >
                                                {formatTimeDisplay(slot)}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Notes */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    <FileText className="w-4 h-4 inline mr-1" />
                                    Notes (Optional)
                                </label>
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Any special instructions or notes..."
                                    rows={2}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                />
                            </div>

                            {/* Error */}
                            {error && (
                                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                                    {error}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-between">
                    <button
                        onClick={() => {
                            if (step === "schedule") setStep("patient");
                            else onClose();
                        }}
                        className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                        {step === "patient" ? "Cancel" : "Back"}
                    </button>

                    {step === "schedule" && (
                        <button
                            onClick={handleSubmit}
                            disabled={!selectedTime || isSubmitting}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Calendar className="w-4 h-4" />
                            {isSubmitting ? "Scheduling..." : "Schedule Procedure"}
                        </button>
                    )}
                </div>
            </motion.div>
        </div>
    );
}

export default ScheduleModal;
