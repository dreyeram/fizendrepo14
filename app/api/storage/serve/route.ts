import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

/**
 * GET /api/storage/serve?path=<string>
 * Serves files from external storage to bypass browser file path restrictions.
 */
export async function GET(req: NextRequest) {
    try {
        const filePath = req.nextUrl.searchParams.get("path");
        if (!filePath) {
            return NextResponse.json({ error: "No path provided" }, { status: 400 });
        }

        // Basic sanity check to ensure it exists
        try {
            await fs.access(filePath);
        } catch {
            return NextResponse.json({ error: "File not found or access denied" }, { status: 404 });
        }

        // Check if it's a file
        const stats = await fs.stat(filePath);
        if (!stats.isFile()) {
            return NextResponse.json({ error: "Provided path is not a file" }, { status: 400 });
        }

        // Read file
        const fileBuffer = await fs.readFile(filePath);

        // Determine content type
        const ext = path.extname(filePath).toLowerCase();
        const contentTypes: Record<string, string> = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".webp": "image/webp",
            ".webm": "video/webm",
            ".mp4": "video/mp4",
            ".json": "application/json",
            ".pdf": "application/pdf",
        };
        const contentType = contentTypes[ext] || "application/octet-stream";

        return new NextResponse(fileBuffer, {
            headers: {
                "Content-Type": contentType,
                "Cache-Control": "public, max-age=31536000, immutable",
                "Content-Disposition": `inline; filename="${path.basename(filePath)}"`,
            },
        });
    } catch (error: any) {
        console.error("Storage serve error:", error);
        return NextResponse.json({ error: error?.message || "Failed to serve file" }, { status: 500 });
    }
}
