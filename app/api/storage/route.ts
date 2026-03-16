
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
                
                let entries = [];
                try {
                    entries = await readdir(root);
                } catch (e) {
                    console.error(`Error reading root ${root}:`, e);
                    continue;
                }
                
                for (const entry of entries) {
                    const fullPath = path.join(root, entry);
                    try {
                        const stats = await stat(fullPath);
                        if (stats.isDirectory()) {
                            // Basic check if we can even enter the directory
                            try {
                                await readdir(fullPath);
                            } catch (e) {
                                // If we can't read it (e.g. /media/pi restricted), 
                                // check if there are sub-mounts we CAN read
                                if (root === '/media' || root === '/run/media') {
                                    // Sometimes /media/pi is restricted but /media/pi/DRIVENAME is not
                                    // if it's auto-mounted with specific user permissions.
                                    // However, usually we need to be that user.
                                    // Let's try to check for common sub-entries if possible or just skip.
                                }
                                continue; 
                            }

                            drives.push({
                                name: entry,
                                path: fullPath,
                                type: 'drive'
                            });

                            // Optimization: if it's a user folder like /media/pi, check inside it
                            if (root === '/media' || root === '/run/media') {
                                try {
                                    const subEntries = await readdir(fullPath);
                                    for (const subEntry of subEntries) {
                                        const subPath = path.join(fullPath, subEntry);
                                        try {
                                            const subStats = await stat(subPath);
                                            if (subStats.isDirectory()) {
                                                // Test if this sub-dir is readable
                                                await readdir(subPath);
                                                drives.push({
                                                    name: subEntry, // Just use the drive name
                                                    path: subPath,
                                                    type: 'drive'
                                                });
                                            }
                                        } catch (e) {}
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
    const usbOnly = searchParams.get('usbOnly') === 'true';

    try {
        if (!dirPath || dirPath === 'root') {
            let drives = await getDrives();
            
            if (usbOnly) {
                if (process.platform === 'win32') {
                    // On Windows, keep it simple for now as USB letters are dynamic
                    // but we can at least filter D: if we want to be safe, but D: is often a data drive
                    // drives = drives.filter(d => d.name !== 'D:');
                } else {
                    // On Linux, getDrives already checks /media, /run/media, /mnt
                    // which are typical USB mount points.
                }
            }

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
