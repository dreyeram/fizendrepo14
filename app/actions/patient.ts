"use server";

import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";

/**
 * Check if a report PDF file actually exists on disk.
 * Checks both public/reports/ and data/reports/ directories.
 */
function findReportPdf(procedureId: string, reportId: string, storedPdfPath: string | null): string | null {
    const candidates: string[] = [];

    // 1. Stored pdfPath from DB
    if (storedPdfPath) {
        const relativePath = storedPdfPath.replace(/^\//, "");
        candidates.push(path.join(process.cwd(), "public", relativePath));
        candidates.push(path.join(process.cwd(), "data", relativePath));
        candidates.push(path.join(process.cwd(), relativePath));
    }

    // 2. Standard naming with procedureId
    candidates.push(path.join(process.cwd(), "public", "reports", `report_${procedureId}.pdf`));
    candidates.push(path.join(process.cwd(), "data", "reports", `report_${procedureId}.pdf`));

    // 3. Standard naming with reportId
    candidates.push(path.join(process.cwd(), "public", "reports", `report_${reportId}.pdf`));
    candidates.push(path.join(process.cwd(), "data", "reports", `report_${reportId}.pdf`));

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    return null;
}

export async function getPatientHistory(patientId: string) {
    try {
        // Fetch previous completed procedures for this patient
        const procedures = await prisma.procedure.findMany({
            where: {
                patientId: patientId,
            },
            include: {
                media: {
                    where: { isDeleted: false },
                    orderBy: { timestamp: 'desc' }
                },
                report: true,
                doctor: true,
            },
            orderBy: {
                createdAt: 'desc'
            },
            take: 10
        });

        const history = procedures.map((proc: any) => {
            const mediaItems = proc.media.map((m: any) => ({
                id: m.id,
                url: m.filePath.startsWith('data:') ? m.filePath : `/api/capture-serve?path=${encodeURIComponent(m.filePath)}`,
                type: m.type === 'VIDEO' ? 'video' : 'image'
            }));

            // Only include report if a PDF file actually exists on disk
            if (proc.report) {
                const pdfExists = findReportPdf(proc.id, proc.report.id, proc.report.pdfPath);
                if (pdfExists) {
                    mediaItems.push({
                        id: proc.report.id,
                        url: `/api/report-serve?id=${proc.id}`,
                        type: 'report',
                        title: 'PDF Report'
                    });
                }
            }

            return {
                id: proc.id,
                date: (proc.startTime || proc.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
                procedure: proc.type,
                doctor: proc.doctor?.fullName || "Unknown Doctor",
                media: mediaItems
            };
        });

        return { success: true, history };
    } catch (error) {
        console.error("Get Patient History Error:", error);
        return { success: false, error: "Failed to fetch patient history." };
    }
}
