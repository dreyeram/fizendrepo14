//app/api/report-serve/route.ts

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/report-serve?id=<procedureId>
 * Serves report PDFs from disk. Uses multiple strategies to locate the file:
 *   1. Check the stored pdfPath from the database
 *   2. Try standard naming: report_<procedureId>.pdf
 *   3. Try standard naming: report_<reportId>.pdf  
 *   4. Search both public/reports/ and data/reports/ directories
 */
export async function GET(req: NextRequest) {
    try {
        const procedureId = req.nextUrl.searchParams.get("id");
        if (!procedureId) {
            return NextResponse.json({ error: "No procedure id provided" }, { status: 400 });
        }

        // Sanitize
        const safeId = procedureId.replace(/[^a-zA-Z0-9\-]/g, "");
        if (!safeId) {
            return NextResponse.json({ error: "Invalid id" }, { status: 400 });
        }

        // Look up the report in the database to get pdfPath and reportId
        let report: { id: string; pdfPath: string | null } | null = null;
        try {
            report = await prisma.report.findUnique({
                where: { procedureId: safeId },
                select: { id: true, pdfPath: true }
            });
        } catch (e) {
            console.error("DB lookup failed:", e);
        }

        // Build list of candidate file paths to check
        const candidates: string[] = [];

        // Strategy 1: Use stored pdfPath from DB
        if (report?.pdfPath) {
            // pdfPath is like "/reports/report_xxx.pdf" — resolve from public/ and data/
            const relativePath = report.pdfPath.replace(/^\//, "");
            candidates.push(path.join(process.cwd(), "public", relativePath));
            candidates.push(path.join(process.cwd(), "data", relativePath));
            candidates.push(path.join(process.cwd(), relativePath));
        }

        // Strategy 2: Standard naming with procedureId
        candidates.push(path.join(process.cwd(), "public", "reports", `report_${safeId}.pdf`));
        candidates.push(path.join(process.cwd(), "data", "reports", `report_${safeId}.pdf`));

        // Strategy 3: Standard naming with reportId
        if (report?.id) {
            const safeReportId = report.id.replace(/[^a-zA-Z0-9\-]/g, "");
            candidates.push(path.join(process.cwd(), "public", "reports", `report_${safeReportId}.pdf`));
            candidates.push(path.join(process.cwd(), "data", "reports", `report_${safeReportId}.pdf`));
        }

        // Try each candidate path
        let absolutePath: string | null = null;
        for (const candidate of candidates) {
            if (fs.existsSync(candidate)) {
                absolutePath = candidate;
                break;
            }
        }

        // Strategy 4 (fallback): If no specific file found, check if there's any PDF
        // in the directories that might match (for legacy/migrated data)
        if (!absolutePath) {
            const reportDirs = [
                path.join(process.cwd(), "public", "reports"),
                path.join(process.cwd(), "data", "reports"),
            ];

            for (const dir of reportDirs) {
                if (fs.existsSync(dir)) {
                    const files = fs.readdirSync(dir).filter(f => f.endsWith('.pdf'));
                    if (files.length > 0) {
                        // Log available files for debugging
                        console.log(`[report-serve] Available PDFs in ${dir}:`, files);
                    }
                }
            }

            console.error(`[report-serve] PDF not found for procedureId=${safeId}, reportId=${report?.id}. Checked:`, candidates);
            return NextResponse.json({
                error: "Report PDF not found on disk. The report may not have been finalized/generated yet."
            }, { status: 404 });
        }

        const fileBuffer = fs.readFileSync(absolutePath);

        return new NextResponse(fileBuffer, {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `inline; filename="report_${safeId}.pdf"`,
                "Cache-Control": "public, max-age=3600",
            },
        });
    } catch (error: any) {
        console.error("Report serve error:", error);
        return NextResponse.json({ error: error?.message || "Failed to serve report" }, { status: 500 });
    }
}
