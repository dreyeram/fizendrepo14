import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

// Allow large body sizes for image uploads
export const config = {
    api: {
        bodyParser: {
            sizeLimit: '50mb',
        },
    },
};

/**
 * POST /api/capture-upload
 * Receives a base64 image/video and saves it to disk.
 * Returns the file path for storage in the database.
 * All I/O is async to avoid blocking the event loop on Pi 5.
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { procedureId, data, type, filename, scopeShape } = body;

        if (!procedureId || !data) {
            return NextResponse.json(
                { success: false, error: "Missing procedureId or data" },
                { status: 400 }
            );
        }

        // Determine file extension from data URL or type
        let ext = "jpg";
        if (data.startsWith("data:image/png")) ext = "png";
        else if (data.startsWith("data:image/webp")) ext = "webp";
        else if (data.startsWith("data:video/webm")) ext = "webm";
        else if (data.startsWith("data:video/mp4")) ext = "mp4";
        else if (type === "VIDEO") ext = "webm";

        // Create directory structure: uploads/captures/<procedureId>/
        const uploadsDir = path.join(process.cwd(), "uploads", "captures", procedureId);
        await fs.mkdir(uploadsDir, { recursive: true });

        // Generate unique filename
        const timestamp = Date.now();
        const finalFilename = filename || `capture_${timestamp}.${ext}`;
        const filePath = path.join(uploadsDir, finalFilename);

        // Extract base64 data (remove data URL prefix)
        const base64Data = data.replace(/^data:[^;]+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");

        // Write to disk (async — does not block event loop)
        await fs.writeFile(filePath, buffer);

        // Return relative path from project root for storage
        const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, "/");

        return NextResponse.json({
            success: true,
            filePath: relativePath,
            size: buffer.length,
        });
    } catch (error: any) {
        console.error("Capture upload error:", error);
        return NextResponse.json(
            { success: false, error: error?.message || "Upload failed" },
            { status: 500 }
        );
    }
}
