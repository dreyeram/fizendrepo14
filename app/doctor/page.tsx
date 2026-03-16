"use client";
// Force refresh 1


import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useTabManager } from "@/hooks/useTabManager";
import ConsoleFooter from "@/components/shell/ConsoleFooter";
import DualConsoleLayout from "@/components/shell/DualConsoleLayout";
import PatientQueue from "@/components/console/PatientQueue";
import NewPatientForm from "@/components/console/NewPatientForm";
import PatientDetailPanel from "@/components/panels/PatientDetailPanel";
import ReportPage from "@/components/reports/ReportPage";
import AdvancedImageSuite from "@/components/AdvancedImageSuite";
import ImportWizardModal from "@/components/import/ImportWizardModal";
import MediaGalleryModal from "@/components/media/MediaGalleryModal";
import QuickPatientPopup from "@/components/console/QuickPatientPopup";
// import SegmentController from "@/components/session/SegmentController"; // Removed
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { encodeProcedureType } from "@/types/procedureTypes";
import { saveReport, createProcedure, getPatientDetails, updateProcedureType, endProcedure, exitProcedure, cleanupGuestSession, reassignProcedure, saveMediaMetadata } from "@/app/actions/procedure";
import { saveReportPDF } from "@/app/actions/reports";
import { getSeededDoctorId, getCurrentSession, createPatient, searchPatients, deletePatient, getNextMRN, updatePatient, checkDuplicatePatient } from "@/app/actions/auth";
import { getUserProfile } from "@/app/actions/settings";
import { useSessionStore, ProcedureSegment } from "@/lib/store/session.store";
import { calculateAge } from "@/lib/utils";
import { getSystemStatus } from "@/app/actions/system";

const ProcedureMode = dynamic(() => import("@/components/ProcedureMode"), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center h-screen bg-slate-900 border-none">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
    ),
});

interface Patient {
    id: string;
    fullName: string;
    name: string; // Compatibility with old ProcedureMode
    mrn: string;
    age: number;
    gender: 'Male' | 'Female' | 'Other';
    mobile: string;
    email?: string;
    referringDoctor?: string;
    procedureId?: string;
    procedureType?: string;
}

export default function DoctorPage() {
    const tabManager = useTabManager();
    const {
        activePatientId,
        segments,
        activeSegmentIndex,
        startSession,
        addSegment,
        endSession,
        hydrateSession
    } = useSessionStore();

    const [mode, setMode] = useState<'suite' | 'procedure' | 'annotate' | 'report'>('suite');

    // UI States
    const [activePatient, setActivePatient] = useState<Patient | null>(null);
    const [selectedPatient, setSelectedPatient] = useState<any | null>(null);
    const [reportCaptures, setReportCaptures] = useState<any[]>([]);
    const [isGalleryOpen, setIsGalleryOpen] = useState(false);
    const [galleryProcedure, setGalleryProcedure] = useState<any>(null);
    const [galleryPatient, setGalleryPatient] = useState<any>(null);
    const [galleryInitialTab, setGalleryInitialTab] = useState<'images' | 'videos' | 'report'>('images');
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [isLoadingSession, setIsLoadingSession] = useState(false);
    const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
    const [isDirectProcedure, setIsDirectProcedure] = useState(false);
    const [isCameraConnected, setIsCameraConnected] = useState(false);
    const [isQuickPatientPopupOpen, setIsQuickPatientPopupOpen] = useState(false);
    const [quickPatientInitialData, setQuickPatientInitialData] = useState<any>(null);
    const [quickPatientCaptures, setQuickPatientCaptures] = useState<any[]>([]);

    // Context States
    const [orgData, setOrgData] = useState<any>(null);
    const [userData, setUserData] = useState<any>(null);
    const [doctorId, setDoctorId] = useState<string | null>(null);

    // Layout State
    const [layoutFocus, setLayoutFocus] = useState<'left' | 'right' | 'both'>('both');
    const [lastValidProcId, setLastValidProcId] = useState<string | null>(null);

    // Import State
    const [pendingImportFiles, setPendingImportFiles] = useState<File[]>([]);
    const [pendingImportName, setPendingImportName] = useState("");

    // Auto-refresh state
    const [queueRefreshKey, setQueueRefreshKey] = useState(0);

    // Edit state
    const [editingPatient, setEditingPatient] = useState<any>(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const [queueSearchQuery, setQueueSearchQuery] = useState("");

    useEffect(() => {
        loadData();
        
        // Setup camera status polling
        const pollCamera = async () => {
            try {
                const status = await getSystemStatus();
                setIsCameraConnected(!!status.camera);
            } catch (e) {
                console.error("Camera poll failed:", e);
            }
        };
        
        pollCamera();
        const interval = setInterval(pollCamera, 5000);
        return () => clearInterval(interval);
    }, []);

    const loadData = async () => {
        setIsLoadingSession(true);
        setEditingPatient(null);
        try {
            console.log("[DoctorPage] Booting clinical session...");

            // ALWAYS use the JWT session to identify WHO is logged in.
            const session = await getCurrentSession();

            if (session.success && session.user) {
                const sessionUserId = session.user.id;
                setDoctorId(sessionUserId);
                const userResult = await getUserProfile(sessionUserId);
                if (userResult.success && userResult.user) {
                    setUserData(userResult.user);
                    setOrgData(userResult.user.organization);
                    setRefreshKey(prev => prev + 1);
                }
            } else {
                // No valid session — fallback to first doctor for backward-compat
                const seededId = await getSeededDoctorId();
                if (seededId) {
                    setDoctorId(seededId);
                    const userResult = await getUserProfile(seededId);
                    if (userResult.success && userResult.user) {
                        setUserData(userResult.user);
                        setOrgData(userResult.user.organization);
                        setRefreshKey(prev => prev + 1);
                    }
                } else {
                    console.error("No active session and no seeded doctor found.");
                }
            }
        } catch (error) {
            console.error("Clinical boot error:", error);
        } finally {
            setIsLoadingSession(false);
        }
    };

    // ... (hydration logic) ...

    // --- VIDEO THUMBNAIL HELPER ---
    const generateVideoThumbnail = (file: File): Promise<string> => {
        return new Promise((resolve) => {
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.src = URL.createObjectURL(file);
            video.muted = true;
            video.playsInline = true;
            
            video.onloadedmetadata = () => {
                video.currentTime = 0.5; // Capture frame at 0.5s
            };
            
            video.onseeked = () => {
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                URL.revokeObjectURL(video.src);
                resolve(dataUrl);
            };

            video.onerror = () => {
                URL.revokeObjectURL(video.src);
                resolve(""); // Fallback to empty if fails
            };
        });
    };

    // --- IMPORT PROCESSING HELPER ---
    const createProcedureFromImports = async (patientId: string, files: File[], customName: string = "External Import", onProgress?: (p: number) => void) => {
        if (files.length === 0) return;

        console.log("Processing imported files:", files.length);

        try {
            // 1. Create Procedure (Type: Custom Name)
            const res = await createProcedure({
                patientId,
                doctorId: doctorId || "system",
                type: customName, 
                source: "External Import"
            });

            if (!res.success || !res.procedureId) {
                console.error("Procedure creation failed:", res.error);
                throw new Error(res.error || "Failed to create import procedure");
            }
            const procedureId = res.procedureId;

            let uploadedCount = 0;
            const total = files.length;

            for (const file of files) {
                // Convert media to base64
                const reader = new FileReader();
                const dataUrl = await new Promise<string>((resolve) => {
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(file);
                });

                const isVideo = file.type.startsWith('video/');
                const type = isVideo ? 'VIDEO' : 'IMAGE';
                
                // Generate thumbnail for videos if needed
                let thumbnailData = "";
                if (isVideo) {
                    thumbnailData = await generateVideoThumbnail(file);
                }

                // Upload to API
                const uploadRes = await fetch('/api/capture-upload', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        procedureId,
                        data: dataUrl,
                        type,
                        filename: file.name,
                        thumbnailData: thumbnailData || undefined
                    })
                });

                if (!uploadRes.ok) throw new Error(`Upload failed for ${file.name}`);
                
                const uploadJson = await uploadRes.json();
                if (uploadJson.success) {
                    // Save metadata
                    await saveMediaMetadata({
                        procedureId,
                        type,
                        filePath: uploadJson.filePath,
                        thumbnailPath: uploadJson.thumbnailPath,
                        timestamp: new Date()
                    });
                }

                uploadedCount++;
                if (onProgress) onProgress((uploadedCount / total) * 100);
            }

        } catch (e: any) {
            console.error("Failed to process imports:", e);
            throw e;
        }
    };

    // --- HANDLERS ---

    const handleToggleFavorite = async (id: string, isFav: boolean) => {
        // Implementation here if needed
    };

    const handleEndAndAnnotate = async (p: any, proc: any) => {
        try {
            const res = await endProcedure(proc.id);
            if (res.success) {
                setQueueRefreshKey(prev => prev + 1);
                handleCreateReportFromImport(proc.media || [], proc, p);
            } else {
                alert("Failed to end procedure: " + res.error);
            }
        } catch (e) {
            console.error("End & Annotate error:", e);
        }
    };

    const handleDirectProcedure = async () => {
        if (!isCameraConnected) {
            alert("Please connect camera to start procedure.");
            return;
        }

        const uniqueGuestMobile = `700${Date.now().toString().slice(-7)}`;
        const res = await createPatient({
            fullName: "Guest Patient",
            gender: "Other",
            age: 0.1, 
            mobile: uniqueGuestMobile, 
            refId: "GUEST"
        });

        if (res.success && res.patient) {
            handleStartProcedure(res.patient, undefined, true);
        } else {
            console.error("Initialization failed:", res.error);
            alert("Initialization failed. Please check system logs.");
        }
    };

    const handleQuickPatientSave = async (data: any) => {
        if (!activePatient || !activePatient.procedureId) return;
        
        try {
            // 1. Update Procedure Type if provided
            if (data.procedureType) {
                await updateProcedureType(activePatient.procedureId, data.procedureType);
            }

            if (data.type === 'existing') {
                const res = await reassignProcedure(activePatient.procedureId, activePatient.id, data.patientId);
                if (res.success) {
                    setIsQuickPatientPopupOpen(false);
                    setIsDirectProcedure(false);
                    setMode('suite');
                    setLayoutFocus('left'); // Focus on queue
                    setQueueRefreshKey(prev => prev + 1);
                } else {
                    alert("Failed to link patient: " + res.error);
                }
            } else {
                const nextMrnRes = await getNextMRN();
                const realMrn = nextMrnRes.success ? nextMrnRes.mrn : `RN-${Date.now()}`;

                const updateRes = await updatePatient(activePatient.id, {
                    fullName: data.fullName,
                    age: parseFloat(data.age),
                    gender: data.gender,
                    mobile: data.mobile,
                    mrn: realMrn,
                    refId: "" 
                } as any);

                if (updateRes.success) {
                    setIsQuickPatientPopupOpen(false);
                    setIsDirectProcedure(false);
                    setMode('suite');
                    setLayoutFocus('left'); // Focus on queue
                    setQueueRefreshKey(prev => prev + 1);
                } else {
                    alert("Failed to register patient: " + updateRes.error);
                }
            }
        } catch (err) {
            console.error("Quick Register Error:", err);
            alert("Unexpected error during registration.");
        }
    };

    // A. Registration Success (No Auto-Start)
    const handlePatientRegistered = async (patient: any) => {
        // Clear edit state if any
        setEditingPatient(null);

        // If we were in a direct procedure and just registered the guest, go to annotate
        if (isDirectProcedure && reportCaptures.length > 0) {
            setIsDirectProcedure(false);
            setMode('annotate');
            setQueueRefreshKey(prev => prev + 1);
            return;
        }

        // Ensure no stale session lingers
        endSession();

        // 1. Process Pending Imports if any
        if (pendingImportFiles.length > 0) {
            await createProcedureFromImports(patient.id, pendingImportFiles, pendingImportName);
            setPendingImportFiles([]);
            setPendingImportName("");
            setSelectedImageIds([]);
        }

        // 2. Reset Layout (Show Queue)
        setLayoutFocus('left');

        // 3. Clear Active Patient to ensure we don't accidentally start
        setActivePatient(null);

        // 4. Trigger Queue Refresh
        setQueueRefreshKey(prev => prev + 1);
    };

    // B. Import to Existing Patient (No Auto-Start)
    const handleImportToPatient = async (files: File[], patient: any, customName?: string, onProgress?: (p: number) => void) => {
        // STRICT: Clear any active session and ensure we are in dashboard mode
        endSession();
        setActivePatient(null);
        setMode('suite');

        await createProcedureFromImports(patient.id, files, customName, onProgress);
        setQueueRefreshKey(prev => prev + 1);
    };

    // C. Start Procedure (Manual "Play" Button)
    const handleStartProcedure = async (patient: any, procedureId?: string, isDirect: boolean = false) => {
        console.log("[DoctorPage] handleStartProcedure called for patient:", patient.id, "procedureId:", procedureId, "isDirect:", isDirect);

        setIsDirectProcedure(isDirect);

        // 0. Check camera status
        try {
            const status = await getSystemStatus();
            if (!status.camera) {
                alert("Please connect camera to start procedure.");
                return;
            }
        } catch (error) {
            console.error("Failed to check camera status:", error);
            // Optional: allow proceed if check fails? Better to be safe.
            alert("Camera status check failed. Please ensure camera is connected.");
            return;
        }

        // 1. Resolve doctor ID — use current JWT session first, then fallback to seeded
        let currentDoctorId = doctorId;
        if (!currentDoctorId) {
            try {
                // Use logged-in session user first
                const session = await getCurrentSession();
                if (session.success && session.user) {
                    currentDoctorId = session.user.id;
                    setDoctorId(session.user.id);
                    if (!userData) {
                        const userResult = await getUserProfile(session.user.id);
                        if (userResult.success && userResult.user) {
                            setUserData(userResult.user);
                            setOrgData(userResult.user.organization);
                        }
                    }
                } else {
                    // Last resort: seeded doctor
                    const fetchedId = await getSeededDoctorId();
                    if (fetchedId) {
                        currentDoctorId = fetchedId;
                        setDoctorId(fetchedId);
                    }
                }
            } catch (e) {
                console.error("Failed to recover doctor ID", e);
            }
        }

        if (!currentDoctorId && !procedureId) {
            console.error("No doctor ID and no procedure ID — cannot start");
            alert("Unable to start procedure: no active doctor profile found. Please log in again.");
            return;
        }

        // 2. Create the procedure FIRST (before switching mode)
        let activeProcId = procedureId;
        if (!activeProcId && currentDoctorId) {
            try {
                const res = await createProcedure({
                    patientId: patient.id,
                    doctorId: currentDoctorId,
                    type: 'generic'
                });
                if (res.success && res.procedureId) {
                    activeProcId = res.procedureId;
                } else {
                    console.error("createProcedure returned failure:", res.error);
                    alert("Failed to create procedure: " + (res.error || "Unknown error"));
                    return;
                }
            } catch (error) {
                console.error("Failed to create procedure:", error);
                alert("Failed to initialize procedure. Please try again.");
                return;
            }
        }

        if (!activeProcId) {
            console.error("No procedure ID available after creation attempt");
            alert("Could not start procedure session. Please try again.");
            return;
        }

        // 3. Now that we have a valid procedure ID, set up the session
        const pObj: Patient = {
            id: patient.id,
            fullName: patient.fullName || patient.name,
            name: patient.fullName || patient.name,
            mrn: patient.mrn,
            age: (patient.age !== undefined && patient.age !== null) ? patient.age : 0,
            gender: patient.gender,
            mobile: patient.mobile,
            referringDoctor: patient.referringDoctor,
            procedureId: activeProcId
        };
        setActivePatient(pObj);
        startSession(patient.id);
        addSegment({
            id: activeProcId,
            index: 1,
            status: 'draft',
            createdAt: new Date(),
            type: 'generic'
        });
        setSelectedImageIds([]);

        // 4. Only NOW transition to procedure mode
        console.log("[DoctorPage] Transitioning to procedure mode for procId:", activeProcId);
        setMode('procedure');
    };

    // D. Create Report from Import (Workflow Entry)
    const handleCreateReportFromImport = (media: any[], procedure: any, patient: any) => {
        // 1. Set Active Patient
        setActivePatient({
            id: patient.id,
            fullName: patient.fullName,
            name: patient.fullName,
            mrn: patient.mrn,
            age: patient.age,
            gender: patient.gender,
            mobile: patient.mobile,
            referringDoctor: patient.referringDoctor,
            procedureId: procedure.id
        });

        // 2. Prepare Captures for Annotation
        // Convert the media/captures format if necessary
        // The media coming from PatientDetailPanel seems to be flattened.
        // We need 'id', 'url', 'notes'.
        const captures = media.map(m => ({
            id: m.id,
            url: m.url || (m.filePath ? (m.filePath.startsWith('data:') ? m.filePath : `/api/capture-serve?path=${encodeURIComponent(m.filePath)}`) : ''),
            createdAt: m.timestamp,
            notes: ""
        }));

        setReportCaptures(captures);

        // 3. Set Mock Segment so AdvancedImageSuite knows the ID
        // AdvancedImageSuite looks at: segments.find(s => s.index === activeSegmentIndex)?.id
        // We need to inject this procedure into the segments list or handle it locally.
        // Easiest is to add a dummy segment to the store or just bypass generic logic?
        // Actually, AdvancedImageSuite writes to reportCaptures. 
        // When generating report, it calls 'setMode(report)'.
        // ReportPage uses 'activePatient.procedureId' if single segment?

        // Let's set a session state that mimics a loaded procedure
        // We won't use startSession() to avoid full hydration logic which implies new/draft.
        // We just manually populate the needed store/state.

        // Use a special index or clear segments and add this one?
        // Let's just set the procedureId in activePatient (done above).
        // And update the segment store to reflect this single procedure context
        useSessionStore.setState({
            activePatientId: patient.id,
            segments: [{
                id: procedure.id,
                index: 1,
                status: 'completed',
                createdAt: new Date(procedure.date),
                type: procedure.type
            }],
            activeSegmentIndex: 1
        });

        setSelectedImageIds([]);
        setMode('annotate');
    };

    const handleSaveReport = async (reportData: any, action?: string) => {
        // ReportPage now passes { segments: [], action: '' } for multi-segment reports
        // If it's the old single-segment save, reportData will have procedureId.

        // 1. Check if it's the new multi-segment payload
        if (reportData.segments && Array.isArray(reportData.segments)) {
            let letterheadData: any = {};
            try { letterheadData = orgData?.letterheadConfig ? JSON.parse(orgData.letterheadConfig) : {}; } catch (e) { }
            if (!letterheadData) letterheadData = {};

            let doctorContactData: any = {};
            try { doctorContactData = userData?.contactDetails ? JSON.parse(userData.contactDetails) : {}; } catch (e) { }
            if (!doctorContactData) doctorContactData = {};

            const pdfParams = {
                patient: activePatient,
                doctor: {
                    fullName: userData?.fullName || "Doctor",
                    specialty: doctorContactData?.specialty || "",
                    signaturePath: userData?.signaturePath || ""
                },
                hospital: {
                    name: orgData?.name || "Medical Center",
                    address: orgData?.address || letterheadData?.address || "",
                    mobile: orgData?.mobile || letterheadData?.phone || "",
                    email: orgData?.contactEmail || letterheadData?.email || "",
                    logoPath: orgData?.logoPath || ""
                },
                segments: reportData.segments,
                footerText: reportData.footerText
            };

            const { generatePDF } = await import("@/lib/ReportGenerator");

            // 1. Generate a CLEAN blob (no action) for disk persistence
            //    This avoids embedding autoPrint triggers in the saved file
            const cleanBlob = await generatePDF({ ...pdfParams, action: undefined } as any);

            // 2. Persist PDF to disk for each procedure segment  
            //    Using FormData upload (btoa fails silently for large blobs)
            try {
                for (const seg of reportData.segments) {
                    if (seg.procedureId) {
                        const fd = new FormData();
                        fd.append('file', cleanBlob, `report_${seg.procedureId}.pdf`);
                        fd.append('procedureId', seg.procedureId);
                        const res = await fetch('/api/report-save', { method: 'POST', body: fd });
                        if (!res.ok) {
                            console.error(`Failed to save PDF for ${seg.procedureId}:`, await res.text());
                        }
                    }
                }
            } catch (e) {
                console.error("Failed to persist PDF to disk:", e);
            }

            // 3. Generate the ACTION blob (with print/download triggers) for UI
            const requestedAction = reportData.action || action;
            if (requestedAction) {
                return await generatePDF({ ...pdfParams, action: requestedAction } as any);
            }

            return cleanBlob;
        }

        // 2. Fallback for old single-procedure saves (from ProcedureMode or logic)
        const currentSegment = segments.find(s => s.index === activeSegmentIndex);
        const procId = reportData.procedureId || currentSegment?.id;

        if (!procId) return;

        if (action === 'save' || !action) {
            await saveReport({
                procedureId: procId,
                content: JSON.stringify(reportData)
            });
            // [FIX] Force reload of patient details to reflect saved state
            if (activePatient) {
                const refreshed = await getPatientDetails(activePatient.id);
                if (refreshed.success && refreshed.patient && selectedPatient?.id === activePatient.id) {
                    setSelectedPatient({
                        ...refreshed.patient,
                        procedures: refreshed.procedures || []
                    });
                }
            }
            return;
        }

        // If for some reason old code calls download/print on single object, we need to adapt it to segments
        // But ReportPage is the only one calling preview/download now, so the above block should catch it.
        // This is just a safety fallback.
        return;
    };

    // C. Edit Patient
    const handleEditPatient = (patient: any) => {
        setEditingPatient(patient);
        setLayoutFocus('both');
    };

    const handleEditCancel = () => {
        setEditingPatient(null);
        setLayoutFocus('both');
    };

    // D. Navigation & Session resets
    const handleNewCase = () => {
        setEditingPatient(null);
        setLayoutFocus('both');
    };

    const handleLogout = () => { window.location.href = '/login'; };

    // --- Render Logic ---

    // Track last valid ID to prevent unmounting flicker
    useEffect(() => {
        const activeSegment = segments.find(s => s.index === activeSegmentIndex);
        if (activeSegment?.id) {
            setLastValidProcId(activeSegment.id);
        }
    }, [segments, activeSegmentIndex]);

    // 1. Session View (Procedure Mode + Segment Controller)
    if (mode === 'procedure' && activePatient) {
        const activeSegment = segments.find(s => s.index === activeSegmentIndex);
        const currentProcId = activeSegment?.id;

        return (
            <div className="relative w-full h-screen bg-black overflow-hidden intro-fade-in">
                {(() => {
                    // Logic to maintain the last valid ID if the new one is temporarily missing
                    // This prevents the "Initializing..." flash when switching tabs.
                    const displayId = currentProcId || lastValidProcId;

                    if (displayId) {
                        return (
                            <ProcedureMode
                                key={activePatient.id} 
                                procedureId={displayId}
                                patient={activePatient}
                                isDirectProcedure={isDirectProcedure}
                                onBack={async () => {
                                    setLastValidProcId(null);
                                    
                                    // Guest Cleanup Logic
                                    if (isDirectProcedure) {
                                        const sessionState = useSessionStore.getState();
                                        if (sessionState.captures.length === 0) {
                                            await cleanupGuestSession(displayId, activePatient.id);
                                        }
                                    }

                                    try {
                                        await exitProcedure(displayId);
                                    } catch (e) {
                                        console.error('Failed to persist procedure state on back:', e);
                                    }
                                    setMode('suite');
                                    setActivePatient(null);
                                    setIsDirectProcedure(false);
                                    endSession();
                                    setQueueRefreshKey(prev => prev + 1);
                                }}
                                onGenerateReport={(captures) => {
                                    setLastValidProcId(null);
                                    setReportCaptures(captures);
                                    
                                    if (isDirectProcedure) {
                                        // Trigger Quick Patient Popup
                                        setQuickPatientInitialData({
                                            fullName: "",
                                            age: "",
                                            gender: "Male",
                                            mobile: ""
                                        });
                                        setQuickPatientCaptures(captures);
                                        setIsQuickPatientPopupOpen(true);
                                        
                                        // Reset to suite mode so popup is overlaid on dashboard
                                        setMode('suite');
                                        setLayoutFocus('right');
                                    } else {
                                        setMode('annotate');
                                    }
                                }}
                            />
                        );
                    } else {
                        // Only show loader if we genuinely have NO ID (initial load)
                        return (
                            <div className="flex flex-col items-center justify-center h-full text-white/50 gap-4">
                                <Loader2 className="w-10 h-10 animate-spin" />
                                <p className="text-sm font-medium uppercase tracking-widest">Initializing Session...</p>
                            </div>
                        );
                    }
                })()}
            </div>
        );
    }

    // 2. Annotation & Report (Same as before, passed active segment ID)
    if (mode === 'annotate' && activePatient) {
        return (
            <AdvancedImageSuite
                captures={reportCaptures}
                onUpdateCaptures={setReportCaptures}
                onClose={async () => {
                    // User explicitly closing annotation — use exitProcedure for context-aware status
                    const procId = segments.find(s => s.index === activeSegmentIndex)?.id;
                    if (procId && !procId.startsWith('temp-')) {
                        try {
                            await exitProcedure(procId);
                        } catch (e) {
                            console.error('Failed to persist procedure state on annotate close:', e);
                        }
                    }
                    setMode('suite');
                    setActivePatient(null);
                    setSelectedImageIds([]);
                    endSession();
                    setQueueRefreshKey(prev => prev + 1);
                }}
                onGenerateReport={(selectedIds, templateMap, fullCaptures) => {
                    setSelectedImageIds(selectedIds);
                    // Use the full capture objects passed from AdvancedImageSuite
                    // which contain proper URLs (including DB-fetched items)
                    const selectedCaptures = fullCaptures && fullCaptures.length > 0
                        ? fullCaptures
                        : reportCaptures.filter(c => selectedIds.includes(c.id));
                    setReportCaptures(selectedCaptures);

                    if (templateMap) {
                        // Persist all selected templates from the workspace to DB and store
                        Object.entries(templateMap).forEach(([procId, tId]) => {
                            if (tId && tId !== 'generic') {
                                // DB call (async but we fire-and-forget for speed since we update store next)
                                updateProcedureType(procId, tId);
                            }
                        });

                        // Update store immediately for global UI consistency across all segments
                        const updatedSegments = segments.map(s =>
                            templateMap[s.id] ? { ...s, type: templateMap[s.id] } : s
                        );
                        useSessionStore.setState({ segments: updatedSegments });
                    }

                    setMode('report');
                }}
                procedureId={segments.find(s => s.index === activeSegmentIndex)?.id}
                initialSelectedIds={selectedImageIds}
            />
        );
    }

    if (mode === 'report' && activePatient) {
        let letterheadData: any = {};
        try { letterheadData = orgData?.letterheadConfig ? JSON.parse(orgData.letterheadConfig) : {}; } catch (e) { }
        if (!letterheadData) letterheadData = {};

        let doctorContactData: any = {};
        try { doctorContactData = userData?.contactDetails ? JSON.parse(userData.contactDetails) : {}; } catch (e) { }
        if (!doctorContactData) doctorContactData = {};

        const activeSegment = segments.find(s => s.index === activeSegmentIndex);

        return (
            <ReportPage
                patient={activePatient}
                captures={reportCaptures}
                onBack={() => { setMode('suite'); setSelectedImageIds([]); }}
                onBackToAnnotate={(ids: string[] | undefined) => {
                    if (ids && Array.isArray(ids)) setSelectedImageIds(ids);
                    setMode('annotate');
                }}
                onComplete={() => {
                    setMode('suite');
                    setActivePatient(null);
                    endSession();
                }}
                onSave={handleSaveReport}
                onGeneratePDF={handleSaveReport}
                onSaveSuccess={() => {
                    setRefreshKey(prev => prev + 1);
                }}
                hospital={{
                    id: orgData?.id,
                    name: orgData?.name,
                    address: orgData?.address || "",
                    mobile: orgData?.mobile || "",
                    email: orgData?.contactEmail || "",
                    logoPath: orgData?.logoPath
                }}
                doctor={{
                    fullName: userData?.fullName,
                    specialty: doctorContactData?.specialty || "Endoscopist",
                    signaturePath: userData?.signaturePath
                }}
                initialSelectedIds={selectedImageIds}
                key={`report-${refreshKey}`}
            />
        );
    }

    // 3. Dashboard (Default)
    return (
        <div className="w-full h-screen flex flex-col overflow-hidden aurora-bg font-sans">


            <main className="flex-1 overflow-hidden">
                <DualConsoleLayout
                    focusedPanel={layoutFocus}
                    onFocusChange={setLayoutFocus}
                    leftPanel={
                        <PatientQueue
                            currentUserId={doctorId || undefined}
                            onViewHistory={(p: any, procId: string, tab?: 'images' | 'videos' | 'report') => {
                                const proc = p.procedures?.find((x: any) => x.id === procId);
                                if ((proc?.media && proc.media.length > 0) || proc?.report) {
                                    setGalleryProcedure(proc);
                                    setGalleryPatient(p);
                                    setGalleryInitialTab(tab || 'images');
                                    setIsGalleryOpen(true);
                                } else {
                                    alert("No media or report available for this specific procedure yet.");
                                }
                            }}
                            onStartProcedure={(p: any, procId) => handleStartProcedure(p, procId, false)}
                            onStartAnnotate={(p: any, proc: any) => handleCreateReportFromImport(proc.media || [], proc, p)}
                            onEndAndAnnotate={handleEndAndAnnotate}
                            onEditReport={(p: any, proc: any) => {
                                // Navigate directly to report editor for draft reports
                                setActivePatient({
                                    id: p.id,
                                    fullName: p.fullName,
                                    name: p.fullName,
                                    mrn: p.mrn,
                                    age: p.age,
                                    gender: p.gender,
                                    mobile: p.mobile,
                                    referringDoctor: p.referringDoctor,
                                    procedureId: proc.id
                                });

                                // Load report captures from the draft report content
                                let reportCaps: any[] = [];
                                if (proc.report?.content) {
                                    try {
                                        const rContent = typeof proc.report.content === 'string'
                                            ? JSON.parse(proc.report.content)
                                            : proc.report.content;

                                        if (Array.isArray(rContent)) {
                                            reportCaps = rContent.reduce((acc: any[], seg: any) => [...acc, ...(seg.captures || [])], []);
                                        } else {
                                            reportCaps = rContent.captures || [];
                                        }
                                        // Deduplicate
                                        reportCaps = Array.from(new Map(reportCaps.map((c: any) => [c.id, c])).values());

                                        // Set initial selections from draft
                                        const initialSelected = reportCaps.filter(c => c.category === 'selected' || c.isSelected).map(c => c.id);
                                        setSelectedImageIds(initialSelected);
                                    } catch (e) {
                                        console.error("Error parsing draft report:", e);
                                    }
                                }

                                // Fallback: if no captures in report, use media
                                if (reportCaps.length === 0 && proc.media?.length > 0) {
                                    reportCaps = proc.media.map((m: any) => ({
                                        id: m.id,
                                        url: m.url || (m.filePath ? (m.filePath.startsWith('data:') ? m.filePath : `/api/capture-serve?path=${encodeURIComponent(m.filePath)}`) : ''),
                                        createdAt: m.timestamp,
                                        notes: ""
                                    }));
                                }

                                setReportCaptures(reportCaps);

                                // Set session state
                                useSessionStore.setState({
                                    activePatientId: p.id,
                                    segments: [{
                                        id: proc.id,
                                        index: 1,
                                        status: 'completed',
                                        createdAt: new Date(proc.createdAt),
                                        type: proc.type
                                    }],
                                    activeSegmentIndex: 1
                                });

                                setMode('report');
                            }}
                            onPreviewReport={(p: any, proc: any) => {
                                // Instead of opening the white preview modal, open the black gallery with report tab
                                setGalleryProcedure(proc);
                                setGalleryPatient(p);
                                setGalleryInitialTab('report');
                                setIsGalleryOpen(true);
                            }}
                            onImport={() => setIsImportModalOpen(true)}
                            onEdit={(p: any) => handleEditPatient(p)}
                            refreshKey={queueRefreshKey}
                            onSearchChange={setQueueSearchQuery}
                            orgLogo={orgData?.logoPath}
                            orgData={orgData}
                            isCameraConnected={isCameraConnected}
                        />
                    }
                    rightPanel={
                        <div className="h-full flex flex-col bg-white">
                            <div className="flex-1 overflow-hidden">
                                <NewPatientForm
                                    key={editingPatient?.id || 'new'}
                                    onSuccess={handlePatientRegistered}
                                    editingPatient={editingPatient}
                                    orgLogo={orgData?.logoPath}
                                    onCancel={handleEditCancel}
                                    onDuplicateMobile={setQueueSearchQuery}
                                    isMediaImported={pendingImportFiles.length > 0}
                                    onDirectProcedure={handleDirectProcedure}
                                    isCameraConnected={isCameraConnected}
                                />
                            </div>
                            <ConsoleFooter
                                userId={doctorId || ""}
                                userName={userData?.fullName || "Doctor"}
                                onLogout={handleLogout}
                                onUpdate={loadData}
                            />
                        </div>
                    }
                />
            </main>

            {/* Import Wizard Modal */}
            <AnimatePresence>
                {isImportModalOpen && (
                    <ImportWizardModal
                        isOpen={isImportModalOpen}
                        onClose={() => setIsImportModalOpen(false)}
                        onFinish={async (files, patient, importData, onProgress) => {
                            const procName = importData.procedureType || "External Import";

                            if (importData.patientType === 'existing' && patient) {
                                // Existing Patient: Link and Import
                                await handleImportToPatient(files, patient, procName, onProgress);
                            } else if (importData.patientType === 'new') {
                                // New Patient: Register first, then import
                                // PREVENT DUPLICATES: Check if patient already exists first
                                try {
                                    let targetPatientId: string | null = null;

                                    // Check for existing patient with same name + mobile
                                    const dupCheck = await checkDuplicatePatient({
                                        fullName: importData.fullName,
                                        age: parseFloat(importData.age),
                                        gender: importData.gender,
                                        mobile: importData.mobile
                                    });

                                    if (dupCheck.exists && dupCheck.patient) {
                                        console.log("Reusing existing patient:", dupCheck.patient.id);
                                        targetPatientId = dupCheck.patient.id;
                                    } else {
                                        // No duplicate found, create new patient
                                        const regRes = await createPatient({
                                            fullName: importData.fullName,
                                            age: parseFloat(importData.age),
                                            gender: importData.gender,
                                            mobile: importData.mobile,
                                            refId: "" // Regular patient
                                        });

                                        if (regRes.success && regRes.patient) {
                                            targetPatientId = regRes.patient.id;
                                        } else {
                                            throw new Error(regRes.error || "Failed to register patient");
                                        }
                                    }

                                    if (targetPatientId) {
                                        await createProcedureFromImports(targetPatientId, files, procName, onProgress);
                                        setQueueRefreshKey(prev => prev + 1);
                                    }
                                } catch (e: any) {
                                    console.error("Import registration error:", e);
                                    throw new Error(e.message || "Failed to register patient for import.");
                                }
                            }
                        }}
                    />
                )}
            </AnimatePresence>

            {/* Patient Detail Slide-Over (iOS Pro Standard) */}
            <AnimatePresence>
                {selectedPatient && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-hidden pointer-events-none">
                        {/* Backdrop Blur */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setSelectedPatient(null)}
                            className="absolute inset-0 bg-slate-900/10 backdrop-blur-sm pointer-events-auto"
                        />

                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 10 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 10 }}
                            transition={{ type: "spring", damping: 25, stiffness: 300 }}
                            className="w-[500px] max-h-[85vh] m-auto rounded-3xl overflow-hidden pointer-events-auto shadow-2xl border border-white/40 bg-white/40 backdrop-blur-xl relative z-50 flex flex-col"
                        >
                            <PatientDetailPanel
                                patient={selectedPatient}
                                onBack={() => setSelectedPatient(null)}
                                onStartProcedure={(p, procId) => {
                                    setSelectedPatient(null);
                                    handleStartProcedure(p, procId, false);
                                }}
                                onCreateReport={(media, proc) => {
                                    handleCreateReportFromImport(media, proc, selectedPatient);
                                    setSelectedPatient(null); // Close panel
                                }}
                                onGenerateReport={(report, proc) => {
                                    // Set mode to report
                                    setActivePatient({
                                        id: selectedPatient.id,
                                        fullName: selectedPatient.fullName,
                                        name: selectedPatient.fullName,
                                        mrn: selectedPatient.mrn,
                                        age: selectedPatient.age,
                                        gender: selectedPatient.gender,
                                        mobile: selectedPatient.mobile,
                                        referringDoctor: selectedPatient.referringDoctor,
                                        procedureId: proc.id
                                    });

                                    // Parse report content if needed for captures?
                                    // ReportPage reloads data usually or expects props.
                                    // If we just switch mode to report, we might need to populate reportCaptures
                                    try {
                                        const rContent = typeof report.content === 'string' ? JSON.parse(report.content) : report.content;

                                        // [FIX] Handle new multi-segment array format or old single-object format
                                        let allCaptures: any[] = [];
                                        if (Array.isArray(rContent)) {
                                            // New format: extract captures from all segments
                                            allCaptures = rContent.reduce((acc, seg) => [...acc, ...(seg.captures || [])], []);
                                        } else {
                                            // Old format: extract from root
                                            allCaptures = rContent.captures || [];
                                        }

                                        // Deduplicate by ID to avoid ghost segments
                                        const uniqueCaptures = Array.from(new Map(allCaptures.map(c => [c.id, c])).values());
                                        setReportCaptures(uniqueCaptures);
                                    } catch (e) {
                                        console.error("Error parsing report for edit:", e);
                                        setReportCaptures([]);
                                    }

                                    // Mock segment for store consistency
                                    useSessionStore.setState({
                                        activePatientId: selectedPatient.id,
                                        segments: [{
                                            id: proc.id,
                                            index: 1,
                                            status: 'completed',
                                            createdAt: new Date(proc.date),
                                            type: proc.type
                                        }],
                                        activeSegmentIndex: 1
                                    });

                                    setMode('report');
                                    setSelectedPatient(null);
                                }}
                                onEndAndAnnotate={async (proc) => {
                                    // 1. Close panel immediately for responsive UI
                                    setSelectedPatient(null);

                                    // 2. Correctly end the procedure to get the proper status
                                    import('@/app/actions/procedure').then(({ endProcedure }) => {
                                        endProcedure(proc.id).catch(console.error);
                                    });

                                    // 3. Transition to Annotation Workflow
                                    handleCreateReportFromImport(proc.media || [], proc, selectedPatient);
                                }}
                                onViewReport={(r) => {
                                    // CHECK: Is this a raw import or finalized report?
                                    let isRaw = false;
                                    let rawMedia: any[] = [];
                                    try {
                                        const content = typeof r.content === 'string' ? JSON.parse(r.content) : r.content;
                                        if (content.source || (content.captures && !content.formData)) {
                                            isRaw = true;
                                            rawMedia = content.captures || [];
                                        }
                                    } catch (e) { console.error("Error parsing report", e); }

                                    if (isRaw) {
                                        setGalleryProcedure({ id: r.procedureId || 'raw', media: rawMedia });
                                        setGalleryPatient(selectedPatient);
                                        setGalleryInitialTab('images');
                                        setIsGalleryOpen(true);
                                    } else {
                                        // Finalized or draft report - open gallery report tab
                                        setGalleryProcedure({ id: r.procedureId, report: r });
                                        setGalleryPatient(selectedPatient);
                                        setGalleryInitialTab('report');
                                        setIsGalleryOpen(true);
                                    }
                                }}
                                onShareReport={async (report, patient) => {
                                    const targetPatient = patient || selectedPatient;
                                    const phone = targetPatient?.mobile;

                                    if (!phone) {
                                        alert("No mobile number available for this patient");
                                        return;
                                    }

                                    const cleanMobile = phone.replace(/\D/g, '');
                                    const finalNumber = cleanMobile.length === 10 ? `91${cleanMobile}` : cleanMobile;

                                    try {
                                        const reportData = typeof report.content === 'string'
                                            ? JSON.parse(report.content)
                                            : report.content;

                                        const letterheadData = orgData?.letterheadConfig ? JSON.parse(orgData.letterheadConfig) : {};
                                        const doctorContactData = userData?.contactDetails ? JSON.parse(userData.contactDetails) : {};

                                        const pdfParams = {
                                            patient: reportData.patient || targetPatient,
                                            doctor: {
                                                name: userData?.fullName || "Doctor",
                                                specialty: doctorContactData.specialty || "",
                                                sign: userData?.signaturePath || ""
                                            },
                                            hospital: {
                                                name: orgData?.name || "Medical Center",
                                                address: letterheadData.address || "",
                                                mobile: letterheadData.phone || "",
                                                email: letterheadData.email || "",
                                                logoPath: orgData?.logoPath || ""
                                            },
                                            formData: reportData.formData || reportData,
                                            selectedImages: reportData.selectedImages || [],
                                            captures: reportData.captures || [],
                                            imageCaptions: reportData.imageCaptions || {},
                                            procedureId: report.procedureId,
                                            prescription: reportData.prescription || []
                                        };

                                        console.log("Generating PDF for automated WhatsApp share...");

                                        const { generatePDF } = await import("@/lib/ReportGenerator");

                                        // Generate share link first to ensure strict consistency with ShareModal
                                        const { generateShareLink } = await import("@/app/actions/communication");
                                        const linkResult = await generateShareLink({
                                            procedureId: report.procedureId,
                                            recipient: finalNumber,
                                            channel: "whatsapp"
                                        });

                                        if (!linkResult.success || !linkResult.url) {
                                            alert("Failed to generate report link for automated sharing.");
                                            return;
                                        }

                                        const message = `Hello ${targetPatient.fullName}, here is your medical report from ${orgData?.name || 'Endoscopy Suite'}: ${linkResult.url}`;

                                        console.log("Sending automated WhatsApp message to", finalNumber);

                                        // Use unified API endpoint (same as ShareModal)
                                        const res = await fetch('/api/communication', {
                                            method: 'POST',
                                            headers: {
                                                'Content-Type': 'application/json',
                                            },
                                            body: JSON.stringify({
                                                service: 'whatsapp',
                                                action: 'send',
                                                phone: finalNumber,
                                                message: message,
                                                procedureId: report.procedureId // Passthrough if needed by logged logic, though new API uses phone/message
                                            })
                                        });

                                        const result = await res.json();

                                        if (result.success) {
                                            alert(`Report successfully shared with ${targetPatient.fullName} via WhatsApp.`);
                                        } else {
                                            alert(`WhatsApp sending failed: ${result.error || 'Server error'}. Please check if WhatsApp is connected in the new Communication panel.`);
                                        }

                                    } catch (err) {
                                        console.error('WhatsApp automated share error:', err);
                                        alert('An error occurred while trying to share the report automatically.');
                                    }
                                }}
                            />
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>


            <MediaGalleryModal
                isOpen={isGalleryOpen}
                onClose={() => setIsGalleryOpen(false)}
                procedure={galleryProcedure}
                patient={galleryPatient}
                organizationName={orgData?.name}
                initialTab={galleryInitialTab}
            />

            <QuickPatientPopup
                isOpen={isQuickPatientPopupOpen}
                onClose={() => setIsQuickPatientPopupOpen(false)}
                onSave={handleQuickPatientSave}
                captures={quickPatientCaptures}
                initialData={quickPatientInitialData}
            />
        </div>
    );
}
