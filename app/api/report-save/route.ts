//app/api/report-save/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as Blob | null;
        const procedureId = formData.get("procedureId") as string | null;

        if (!file || !procedureId) {
            return NextResponse.json({ error: "Missing required fields (file, procedureId)" }, { status: 400 });
        }

        // Write to BOTH locations for maximum compatibility with report-serve
        const fileName = `report_${procedureId}.pdf`;
        const dbPdfPath = `/reports/${fileName}`;

        // Read the blob into a buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        console.log(`[report-save] Saving PDF for ${procedureId}, size: ${buffer.length} bytes`);

        // Primary: Write to data/reports/ (internal storage)
        const dataDir = path.join(process.cwd(), "data", "reports");
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(path.join(dataDir, fileName), buffer);

        // Secondary: Also write to public/reports/ (for legacy compatibility)
        const publicDir = path.join(process.cwd(), "public", "reports");
        if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
        fs.writeFileSync(path.join(publicDir, fileName), buffer);

        // Update the Report pdfPath in the database
        const report = await prisma.report.findUnique({
            where: { procedureId: procedureId }
        });

        if (report) {
            await prisma.report.update({
                where: { procedureId: procedureId },
                data: { pdfPath: dbPdfPath }
            });
        }

        return NextResponse.json({
            success: true,
            message: "PDF saved successfully.",
            path: dbPdfPath,
            size: buffer.length
        });
    } catch (error: any) {
        console.error("PDF upload/write error:", error);
        return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 });
    }
}
