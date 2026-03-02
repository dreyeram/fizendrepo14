
"use server";

// Enums removed for SQLite compatibility. Use strings.
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { AuditLogger, createAuditLog, type Role } from "@/lib/security";
import { cookies } from "next/headers";
import { verifyAccessToken } from "@/lib/security/jwt";
import { calculateAge } from "@/lib/utils";

// Helper to get current user for audit logging in Server Actions
async function getAuditUser() {
    const token = (await cookies()).get('accessToken')?.value;
    if (!token) return null;
    const decoded = verifyAccessToken(token);
    return decoded ? { id: decoded.userId, username: decoded.username, role: decoded.role as Role } : null;
}

// --- Types ---
export interface CreateProcedureResult {
    success: boolean;
    procedureId?: string;
    error?: string;
}

export interface SaveMediaResult {
    success: boolean;
    mediaId?: string;
    error?: string;
}

// --- Actions ---

export async function createProcedure(data: {
    patientId: string;
    doctorId: string;
    type: string;
}) {
    try {
        const proc = await prisma.procedure.create({
            data: {
                patientId: data.patientId,
                doctorId: data.doctorId,
                type: data.type,
                status: "IN_PROGRESS",
                startTime: new Date(),
            },
        });

        // Audit log
        const user = await getAuditUser();
        if (user) {
            await createAuditLog({
                eventType: 'PROCEDURE_CREATE',
                userId: user.id,
                username: user.username,
                role: user.role,
                resourceType: 'Procedure',
                resourceId: proc.id,
                action: `Started ${data.type} procedure`,
                details: { patientId: data.patientId },
                success: true
            });
        }

        return { success: true, procedureId: proc.id };
    } catch (error) {
        console.error("Create Procedure Error:", error);
        return { success: false, error: "Failed to start procedure." };
    }
}

export async function endProcedure(procedureId: string) {
    try {
        const procExists = await prisma.procedure.findUnique({
            where: { id: procedureId },
            include: { media: true, report: true }
        });

        if (!procExists) throw new Error("Procedure not found");

        let nextStatus = "COMPLETED";
        if (procExists.report !== null) {
            nextStatus = "COMPLETED";
        } else if (procExists.media.length > 0) {
            nextStatus = "CAPTURED";
        } else {
            nextStatus = "COMPLETED";
        }

        const proc = await prisma.procedure.update({
            where: { id: procedureId },
            data: {
                status: nextStatus as any,
                endTime: new Date(),
            },
        });

        // Audit log
        const user = await getAuditUser();
        if (user) {
            await createAuditLog({
                eventType: 'PROCEDURE_UPDATE',
                userId: user.id,
                username: user.username,
                role: user.role,
                resourceType: 'Procedure',
                resourceId: procedureId,
                action: 'Ended procedure (Manual)',
                details: { status: nextStatus },
                success: true
            });
        }

        return { success: true };
    } catch (error) {
        console.error("End Procedure Error:", error);
        return { success: false, error: "Failed to end procedure." };
    }
}

/**
 * Exit a procedure — called when the user explicitly exits via the Back/Exit button.
 * Sets status based on what work was done:
 * - Has report → COMPLETED
 * - Has media but no report → CAPTURED  
 * - No media, no report → CANCELLED (user exited without doing anything)
 */
export async function exitProcedure(procedureId: string) {
    try {
        const procExists = await prisma.procedure.findUnique({
            where: { id: procedureId },
            include: { media: true, report: true }
        });

        if (!procExists) throw new Error("Procedure not found");

        let nextStatus = "CANCELLED";
        if (procExists.report !== null) {
            nextStatus = "COMPLETED";
        } else if (procExists.media.length > 0) {
            nextStatus = "CAPTURED";
        }
        // else: no media, no report → CANCELLED

        await prisma.procedure.update({
            where: { id: procedureId },
            data: {
                status: nextStatus as any,
                endTime: new Date(),
            },
        });

        // Audit log
        const user = await getAuditUser();
        if (user) {
            await createAuditLog({
                eventType: 'PROCEDURE_UPDATE',
                userId: user.id,
                username: user.username,
                role: user.role,
                resourceType: 'Procedure',
                resourceId: procedureId,
                action: 'Exited procedure (user-initiated)',
                details: { status: nextStatus },
                success: true
            });
        }

        revalidatePath('/doctor');
        revalidatePath('/assistant');

        return { success: true, status: nextStatus };
    } catch (error) {
        console.error("Exit Procedure Error:", error);
        return { success: false, error: "Failed to exit procedure." };
    }
}

export async function updateProcedureStatus(procedureId: string, status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED') {
    try {
        const updateData: any = { status };
        if (status === 'COMPLETED') {
            updateData.endTime = new Date();
        }
        if (status === 'IN_PROGRESS') {
            updateData.startTime = new Date();
        }

        await prisma.procedure.update({
            where: { id: procedureId },
            data: updateData,
        });

        revalidatePath('/doctor');
        revalidatePath('/assistant');

        return { success: true };
    } catch (error) {
        console.error("Update Procedure Status Error:", error);
        return { success: false, error: "Failed to update procedure status." };
    }
}

export async function saveMediaMetadata(data: {
    procedureId: string;
    type: string;
    filePath: string;
    originId?: string;
    timestamp?: Date;
}) {
    try {
        // Validate procedureId exists
        if (!data.procedureId) {
            console.error("Save Media Error: No procedureId provided");
            return { success: false, error: "No procedure ID provided." };
        }

        // Check if procedure exists first (catches FK errors early with a clear message)
        const procedure = await prisma.procedure.findUnique({
            where: { id: data.procedureId }
        });
        if (!procedure) {
            console.error(`Save Media Error: Procedure not found with ID: ${data.procedureId}`);
            return { success: false, error: `Procedure not found: ${data.procedureId}` };
        }

        const media = await prisma.media.create({
            data: {
                procedureId: data.procedureId,
                type: data.type,
                filePath: data.filePath,
                originId: data.originId,
                timestamp: data.timestamp || new Date(),
            },
        });

        return { success: true, mediaId: media.id };
    } catch (error: any) {
        console.error("Save Media Error:", error?.message || error);
        return { success: false, error: `Failed to save media: ${error?.message || 'Unknown error'}` };
    }
}

/**
 * Fetch all media for a specific procedure (for resumption)
 */
export async function getProcedureMedia(procedureId: string) {
    try {
        const media = await prisma.media.findMany({
            where: { procedureId },
            orderBy: { timestamp: "desc" },
        });

        // Format for frontend (matches Capture type in ProcedureMode)
        const formattedMedia = media.map(m => {
            const isDataUrl = m.filePath.startsWith("data:");
            const url = isDataUrl ? m.filePath : `/api/capture-serve?path=${encodeURIComponent(m.filePath)}`;

            const isAnnotated = m.type === 'ANNOTATED';
            let category = 'raw';
            if (isAnnotated) category = 'report';

            // Map DB Types to Frontend Types
            let frontendType = 'image';
            if (m.type === 'VIDEO') frontendType = 'video';

            return {
                id: m.id,
                url: url,
                timestamp: m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                type: frontendType as 'image' | 'video',
                category: category as 'raw' | 'report' | 'other',
                originId: m.originId || undefined
            };
        });

        return { success: true, media: formattedMedia };
    } catch (error) {
        console.error("Get Procedure Media Error:", error);
        return { success: false, error: "Failed to fetch procedure media." };
    }
}

export async function saveReport(data: {
    procedureId: string;
    content: string; // JSON string of findings
    isFinalized?: boolean;
}) {
    try {
        if (!data.procedureId) {
            return { success: false, error: "No procedure ID provided." };
        }

        // 1. Check if procedure exists
        const procedure = await prisma.procedure.findUnique({
            where: { id: data.procedureId },
            select: { id: true, patientId: true }
        });

        if (!procedure) throw new Error(`Procedure with ID ${data.procedureId} not found`);

        // 2. Perform upsert of report
        await prisma.report.upsert({
            where: { procedureId: data.procedureId },
            update: {
                content: data.content,
                ...(data.isFinalized ? { finalized: true, finalizedAt: new Date() } : {}),
            },
            create: {
                procedureId: data.procedureId,
                content: data.content,
                finalized: data.isFinalized || false,
                finalizedAt: data.isFinalized ? new Date() : null,
            },
        });

        // 3. Mark procedure as COMPLETED
        await prisma.procedure.update({
            where: { id: data.procedureId },
            data: { status: 'COMPLETED' }
        });

        // 4. Force revalidation of all potential routes
        revalidatePath('/doctor');
        revalidatePath('/assistant');
        revalidatePath('/'); // Dashboard

        return { success: true };
    } catch (error: any) {
        console.error("Save report CRITICAL error:", error);
        return { success: false, error: error.message };
    } finally {
        // Safety revalidation
        revalidatePath('/doctor');
    }
}

export async function getReports(doctorId: string) {
    try {
        const reports = await prisma.report.findMany({
            where: {
                procedure: { doctorId: doctorId }
            },
            include: {
                procedure: {
                    include: { patient: true }
                }
            },
            orderBy: {
                finalizedAt: 'desc'
            }
        });
        return { success: true, reports };
    } catch (error) {
        console.error("Get Reports Error:", error);
        return { success: false, error: "Failed to fetch reports." };
    }
}

/**
 * Schedule a new procedure for an existing patient.
 * Used by assistants to add visits for returning patients.
 * Creates with SCHEDULED status (Doctor must "Start" to begin).
 */
export async function scheduleProcedure(data: {
    patientId: string;
    doctorId: string;
    type: string;
    notes?: string;
}) {
    try {
        const proc = await prisma.procedure.create({
            data: {
                patientId: data.patientId,
                doctorId: data.doctorId,
                type: data.type,
                status: "SCHEDULED", // Key difference: not IN_PROGRESS
            },
        });

        // Also update patient's updatedAt to bring them to top of list
        await prisma.patient.update({
            where: { id: data.patientId },
            data: { updatedAt: new Date() }
        });

        return { success: true, procedureId: proc.id };
    } catch (error) {
        console.error("Schedule Procedure Error:", error);
        return { success: false, error: "Failed to schedule procedure." };
    }
}

/**
 * Get full patient details including all procedures, reports, and media
 */
export async function getPatientDetails(patientId: string) {
    try {
        if (!patientId) return { success: false, error: "No ID provided" };

        let patient = await prisma.patient.findUnique({
            where: { id: patientId },
            include: {
                procedures: {
                    orderBy: { createdAt: 'desc' },
                    include: {
                        report: true,
                        media: {
                            orderBy: { timestamp: 'desc' }
                        },
                        doctor: {
                            select: { fullName: true }
                        }
                    }
                }
            }
        });

        // Robust Fallback: Try MRN if ID lookup fails (handles cases where frontend passes MRN as ID)
        if (!patient && patientId.length < 50) { // Arbitrary length check to avoid trying to match long IDs as MRNs
            patient = await prisma.patient.findUnique({
                where: { mrn: patientId },
                include: {
                    procedures: {
                        orderBy: { createdAt: 'desc' },
                        include: {
                            report: true,
                            media: { orderBy: { timestamp: 'desc' } },
                            doctor: { select: { fullName: true } }
                        }
                    }
                }
            });
        }

        if (!patient) {
            console.error(`[getPatientDetails] Patient not found for ID/MRN: ${patientId}`);
            return { success: false, error: "Patient not found" };
        }


        // Format the data for easier frontend consumption
        const procedures = patient.procedures.map((proc: typeof patient.procedures[0]) => ({
            id: proc.id,
            type: proc.type,
            status: proc.status,
            date: proc.createdAt,
            doctorName: proc.doctor?.fullName || 'Unknown',
            hasReport: !!proc.report,
            report: proc.report ? {
                id: proc.report.id,
                content: proc.report.content,
                finalized: proc.report.finalized,
                finalizedAt: proc.report.finalizedAt
            } : null,
            media: proc.media.map((m: typeof proc.media[0]) => ({
                id: m.id,
                type: m.type,
                filePath: m.filePath,
                timestamp: m.timestamp
            }))
        }));

        // Flatten all media for the media tab
        const allMedia = patient.procedures.flatMap((proc: typeof patient.procedures[0]) =>
            proc.media.map((m: typeof proc.media[0]) => {
                // Handle both base64 data URLs and file paths
                const isDataUrl = m.filePath.startsWith('data:');
                const url = isDataUrl ? m.filePath : `/api/capture-serve?path=${encodeURIComponent(m.filePath)}`;

                return {
                    id: m.id,
                    type: m.type,
                    filePath: m.filePath,
                    url,
                    timestamp: m.timestamp,
                    procedureId: proc.id,
                    procedureType: proc.type,
                    procedureDate: proc.createdAt
                };
            })
        ).sort((a: { timestamp: Date }, b: { timestamp: Date }) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        // Get all reports
        const allReports = patient.procedures
            .filter((proc: typeof patient.procedures[0]) => proc.report)
            .map((proc: typeof patient.procedures[0]) => ({
                id: proc.report!.id,
                procedureId: proc.id,
                procedureType: proc.type,
                date: proc.createdAt,
                finalized: proc.report!.finalized,
                finalizedAt: proc.report!.finalizedAt,
                content: proc.report!.content,
                doctorName: proc.doctor?.fullName || 'Unknown'
            }))
            .sort((a: { date: Date }, b: { date: Date }) => new Date(b.date).getTime() - new Date(a.date).getTime());

        return {
            success: true,
            patient: {
                id: patient.id,
                mrn: patient.mrn,
                fullName: patient.fullName,
                age: (patient as any).age ?? (patient.dateOfBirth ? calculateAge(patient.dateOfBirth) : undefined),
                dateOfBirth: patient.dateOfBirth,
                gender: patient.gender,
                mobile: (patient as any).mobile || (patient.contactInfo ? JSON.parse(patient.contactInfo).mobile : undefined),
                email: (patient as any).email || (patient.contactInfo ? JSON.parse(patient.contactInfo).email : undefined),
                address: (patient as any).address,
                contactInfo: patient.contactInfo,
                createdAt: patient.createdAt
            },
            procedures,
            allMedia,
            allReports
        };
    } catch (error) {
        console.error("Get Patient Details Error:", error);
        return { success: false, error: "Failed to fetch patient details." };
    }
}

/**
 * Update procedure type (for changing report template)
 */
export async function updateProcedureType(procedureId: string, newType: string) {
    try {
        await prisma.procedure.update({
            where: { id: procedureId },
            data: { type: newType },
        });

        revalidatePath('/doctor');
        revalidatePath('/assistant');

        return { success: true };
    } catch (error) {
        console.error("Update Procedure Type Error:", error);
        return { success: false, error: "Failed to update procedure type." };
    }
}


export async function deleteMedia(mediaId: string) {
    try {
        await prisma.media.delete({
            where: { id: mediaId },
        });
        return { success: true };
    } catch (error) {
        console.error("Delete Media Error:", error);
        return { success: false, error: "Failed to delete media." };
    }
}
