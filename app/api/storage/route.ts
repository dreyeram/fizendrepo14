
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const copyFile = promisify(fs.copyFile);

// Helper to get drives (Windows/Linux compat)
async function getDrives() {
    if (process.platform === 'win32') {
        const drives = [];
        // Simple check for common drive letters
        for (const letter of "DEFGHIJKLMNOPQRSTUVWXYZ".split("")) {
            try {
                const root = `${letter}:\\`;
                await fs.promises.access(root);
                drives.push({ name: `${letter}:`, path: root, type: 'drive' });
            } catch (e) { }
        }
        return drives;
    } else {
        // Linux / Raspberry Pi: Look in common mount points
        const potentialRoots = ['/media', '/run/media', '/mnt'];
        const drives = [];

        for (const root of potentialRoots) {
            try {
                if (!fs.existsSync(root)) continue;
                const entries = await readdir(root);
                
                for (const entry of entries) {
                    const fullPath = path.join(root, entry);
                    try {
                        const stats = await stat(fullPath);
                        if (stats.isDirectory()) {
                            // If it's a directory in /media, /mnt etc, it's likely a drive or a user folder containing drives
                            drives.push({
                                name: entry,
                                path: fullPath,
                                type: 'drive'
                            });

                            // Optimization: if it's a user folder like /media/pi, check inside it immediately
                            // to save the user a click, but also keep the folder itself.
                            if (root === '/media' || root === '/run/media') {
                                try {
                                    const subEntries = await readdir(fullPath);
                                    for (const subEntry of subEntries) {
                                        const subPath = path.join(fullPath, subEntry);
                                        const subStats = await stat(subPath);
                                        if (subStats.isDirectory()) {
                                            drives.push({
                                                name: `${entry}/${subEntry}`,
                                                path: subPath,
                                                type: 'drive'
                                            });
                                        }
                                    }
                                } catch (e) {}
                            }
                        }
                    } catch (e) {}
                }
            } catch (e) {}
        }
        
        // De-duplicate by path
        const seen = new Set();
        return drives.filter(d => {
            if (seen.has(d.path)) return false;
            seen.add(d.path);
            return true;
        });
    }
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const dirPath = searchParams.get('path');

    try {
        if (!dirPath || dirPath === 'root') {
            const drives = await getDrives();
            return NextResponse.json({ success: true, items: drives });
        }

        // Security Check: prevent accessing critical system paths? 
        // For now, we trust the local user/admin.

        const files = await readdir(dirPath);
        const items = await Promise.all(files.map(async (file) => {
            try {
                const fullPath = path.join(dirPath, file);
                const stats = await stat(fullPath);
                return {
                    name: file,
                    path: fullPath,
                    type: stats.isDirectory() ? 'directory' : 'file',
                    size: stats.size,
                    mtime: stats.mtime
                };
            } catch (e) {
                return null;
            }
        }));

        return NextResponse.json({ success: true, items: items.filter(Boolean) });
    } catch (error) {
        return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { action, sourcePath, destPath } = body;

        if (action === 'copy') {
            // Ensure destination directory exists
            const destDir = path.dirname(destPath);
            if (!fs.existsSync(destDir)) {
                await fs.promises.mkdir(destDir, { recursive: true });
            }

            await copyFile(sourcePath, destPath);
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });

    } catch (error) {
        return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
    }
}
