"use server";

import fs from 'fs';
import path from 'path';
import { prisma } from "@/lib/prisma";
import { INTERNAL_PATHS } from "@/lib/storage/paths";

/**
 * Exports multiple patients and their procedures to a local path (USB)
 */
export async function exportToUSBAction(patientIds: string[], destFolder: string) {
    try {
        if (!patientIds || patientIds.length === 0) {
            return { success: false, error: "No patients selected" };
        }

        if (!destFolder) {
            return { success: false, error: "Destination folder not specified" };
        }

        // Verify destination is writable
        try {
            const testFile = path.join(destFolder, `.write-test-${Date.now()}`);
            fs.writeFileSync(testFile, 'test');
            fs.unlinkSync(testFile);
        } catch (e) {
            return { success: false, error: "Destination folder is not writable" };
        }

        const stats = {
            patients: 0,
            procedures: 0,
            files: 0
        };

        // Fetch full patient data
        const patients = await prisma.patient.findMany({
            where: { id: { in: patientIds } },
            include: {
                procedures: {
                    include: {
                        media: {
                            where: { isDeleted: false }
                        },
                        report: true
                    }
                }
            }
        });

        // Create a root export folder with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        const rootExportName = `Export_${timestamp}`;
        const rootExportPath = path.join(destFolder, rootExportName);
        
        if (!fs.existsSync(rootExportPath)) {
            fs.mkdirSync(rootExportPath, { recursive: true });
        }

        for (const patient of patients) {
            const safeName = (patient.fullName || 'Patient').replace(/[^a-zA-Z0-9]/g, '_');
            const patientFolderName = `${patient.mrn || 'N-A'}_${safeName}`;
            const patientPath = path.join(rootExportPath, patientFolderName);
            
            if (!fs.existsSync(patientPath)) {
                fs.mkdirSync(patientPath, { recursive: true });
            }

            // Write patient details
            const details = [
                `Name: ${patient.fullName}`,
                `MRN: ${patient.mrn}`,
                `Age: ${patient.age || 'N/A'}`,
                `Gender: ${patient.gender || 'N/A'}`,
                `Mobile: ${patient.mobile || 'N/A'}`,
                `Email: ${patient.email || 'N/A'}`,
                `Exported At: ${new Date().toLocaleString()}`
            ].join('\n');
            fs.writeFileSync(path.join(patientPath, 'patient_info.txt'), details);

            stats.patients++;

            for (const proc of (patient.procedures || [])) {
                const procDate = new Date(proc.createdAt).toISOString().split('T')[0];
                const procSafeType = (proc.type || 'Procedure').replace(/[^a-zA-Z0-9]/g, '_');
                const procFolderName = `${procDate}_${procSafeType}`;
                const procPath = path.join(patientPath, procFolderName);

                if (!fs.existsSync(procPath)) {
                    fs.mkdirSync(procPath, { recursive: true });
                }

                stats.procedures++;

                // Subfolders for media
                const imgPath = path.join(procPath, 'images');
                const vidPath = path.join(procPath, 'videos');
                const annPath = path.join(procPath, 'annotated');

                if (proc.media && proc.media.length > 0) {
                    fs.mkdirSync(imgPath, { recursive: true });
                    fs.mkdirSync(vidPath, { recursive: true });
                    fs.mkdirSync(annPath, { recursive: true });

                    for (const m of proc.media) {
                        if (!m.filePath) continue;
                        
                        // Internal path to the file
                        const source = m.filePath;
                        if (fs.existsSync(source)) {
                            let targetDir = imgPath;
                            if (m.type === 'VIDEO') targetDir = vidPath;
                            else if (m.type === 'ANNOTATED') targetDir = annPath;

                            const filename = path.basename(source);
                            const dest = path.join(targetDir, filename);
                            try {
                                fs.copyFileSync(source, dest);
                                stats.files++;
                            } catch (e) {
                                console.error(`Failed to copy file ${source}:`, e);
                            }
                        }
                    }
                }

                // Copy report if exists
                // The reports are stored in INTERNAL_PATHS.reports / report_{procedureId}.pdf
                const reportFile = path.join(INTERNAL_PATHS.reports, `report_${proc.id}.pdf`);
                if (fs.existsSync(reportFile)) {
                    try {
                        fs.copyFileSync(reportFile, path.join(procPath, 'Report.pdf'));
                        stats.files++;
                    } catch (e) {
                        console.error(`Failed to copy report ${reportFile}:`, e);
                    }
                }
            }
        }

        return { 
            success: true, 
            message: `Successfully exported ${stats.patients} patients, ${stats.procedures} procedures and ${stats.files} files to ${rootExportName}`,
            exportPath: rootExportPath
        };

    } catch (error) {
        console.error("USB Export Error:", error);
        return { success: false, error: String(error) };
    }
}

/**
 * Exports a single procedure to a local path (USB)
 */
export async function exportSingleProcedureToUSBAction(patientId: string, procedureId: string, destFolder: string) {
    try {
        if (!patientId || !procedureId) {
            return { success: false, error: "Missing patient or procedure ID" };
        }

        if (!destFolder) {
            return { success: false, error: "Destination folder not specified" };
        }

        const patient = await prisma.patient.findUnique({
            where: { id: patientId },
            include: {
                procedures: {
                    where: { id: procedureId },
                    include: {
                        media: { where: { isDeleted: false } },
                        report: true
                    }
                }
            }
        });

        if (!patient || !patient.procedures?.[0]) {
            return { success: false, error: "Procedure not found" };
        }

        const proc = patient.procedures[0];
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        const safeName = (patient.fullName || 'Patient').replace(/[^a-zA-Z0-9]/g, '_');
        const procDate = new Date(proc.createdAt).toISOString().split('T')[0];
        const procSafeType = (proc.type || 'Procedure').replace(/[^a-zA-Z0-9]/g, '_');
        
        const exportFolderName = `${patient.mrn || 'N-A'}_${safeName}_${procDate}_${procSafeType}`;
        const exportPath = path.join(destFolder, exportFolderName);

        if (!fs.existsSync(exportPath)) {
            fs.mkdirSync(exportPath, { recursive: true });
        }

        // Write patient/procedure info
        const details = [
            `Name: ${patient.fullName}`,
            `MRN: ${patient.mrn}`,
            `Procedure: ${proc.type}`,
            `Date: ${new Date(proc.createdAt).toLocaleString()}`,
            `Exported At: ${new Date().toLocaleString()}`
        ].join('\n');
        fs.writeFileSync(path.join(exportPath, 'info.txt'), details);

        let filesCopied = 0;

        // Copy media
        if (proc.media && proc.media.length > 0) {
            const imgPath = path.join(exportPath, 'images');
            const vidPath = path.join(exportPath, 'videos');
            const annPath = path.join(exportPath, 'annotated');

            fs.mkdirSync(imgPath, { recursive: true });
            fs.mkdirSync(vidPath, { recursive: true });
            fs.mkdirSync(annPath, { recursive: true });

            for (const m of proc.media) {
                if (!m.filePath || !fs.existsSync(m.filePath)) continue;
                
                let targetDir = imgPath;
                if (m.type === 'VIDEO') targetDir = vidPath;
                else if (m.type === 'ANNOTATED') targetDir = annPath;

                const dest = path.join(targetDir, path.basename(m.filePath));
                fs.copyFileSync(m.filePath, dest);
                filesCopied++;
            }
        }

        // Copy report
        const reportFile = path.join(INTERNAL_PATHS.reports, `report_${proc.id}.pdf`);
        if (fs.existsSync(reportFile)) {
            fs.copyFileSync(reportFile, path.join(exportPath, 'Report.pdf'));
            filesCopied++;
        }

        return { 
            success: true, 
            message: `Successfully exported procedure and ${filesCopied} files to ${exportFolderName}`,
            exportPath
        };

    } catch (error) {
        console.error("Single Procedure USB Export Error:", error);
        return { success: false, error: String(error) };
    }
}

/**
 * Exports a single media file to a USB path
 */
export async function exportMediaToUSBAction(mediaId: string, destFolder: string) {
    try {
        const media = await prisma.media.findUnique({
            where: { id: mediaId },
            include: { procedure: { include: { patient: true } } }
        });

        if (!media || !media.filePath || !fs.existsSync(media.filePath)) {
            return { success: false, error: "Media file not found" };
        }

        if (!destFolder) {
            return { success: false, error: "Destination folder not specified" };
        }

        const patient = media.procedure?.patient;
        const safePatientName = (patient?.fullName || 'Patient').replace(/[^a-zA-Z0-9]/g, '_');
        const filename = path.basename(media.filePath);
        
        // We can just copy it directly to the destFolder, or create a patient folder there.
        // Let's copy it directly but maybe prefix with patient MRN
        const destFilename = patient?.mrn ? `${patient.mrn}_${filename}` : filename;
        const destPath = path.join(destFolder, destFilename);

        fs.copyFileSync(media.filePath, destPath);

        return { 
            success: true, 
            message: `Successfully exported media to ${destFilename}`,
            destPath
        };
    } catch (error) {
        console.error("Media USB Export Error:", error);
        return { success: false, error: String(error) };
    }
}

/**
 * Performs a full system backup (DB + Media + Reports) to USB
 */
export async function exportFullBackupToUSBAction(destFolder: string) {
    try {
        if (!destFolder) {
            return { success: false, error: "Destination folder not specified" };
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        const backupFolderName = `FullBackup_${timestamp}_${Date.now()}`;
        const backupPath = path.join(destFolder, backupFolderName);

        if (!fs.existsSync(backupPath)) {
            fs.mkdirSync(backupPath, { recursive: true });
        }

        const stats = {
            copied: 0,
            failed: 0
        };

        const copyRecursive = (src: string, dest: string) => {
            if (!fs.existsSync(src)) return;
            const isDir = fs.statSync(src).isDirectory();
            if (isDir) {
                if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
                fs.readdirSync(src).forEach(child => {
                    copyRecursive(path.join(src, child), path.join(dest, child));
                });
            } else {
                try {
                    fs.copyFileSync(src, dest);
                    stats.copied++;
                } catch (e) {
                    console.error(`Backup failed for ${src}:`, e);
                    stats.failed++;
                }
            }
        };

        // 1. Copy Database
        if (fs.existsSync(INTERNAL_PATHS.database)) {
            const dbDest = path.join(backupPath, 'database');
            fs.mkdirSync(dbDest, { recursive: true });
            fs.copyFileSync(INTERNAL_PATHS.database, path.join(dbDest, 'endoscopy.db'));
            stats.copied++;
        }

        // 2. Copy Media
        copyRecursive(INTERNAL_PATHS.media, path.join(backupPath, 'media'));

        // 3. Copy Reports
        copyRecursive(INTERNAL_PATHS.reports, path.join(backupPath, 'reports'));

        // 4. Copy Config
        copyRecursive(INTERNAL_PATHS.config, path.join(backupPath, 'config'));

        return { 
            success: true, 
            message: `Full backup completed. Copied ${stats.copied} files to ${backupFolderName}. ${stats.failed > 0 ? `Failed ${stats.failed} files.` : ''}`,
            backupPath
        };

    } catch (error) {
        console.error("Full Backup USB Error:", error);
        return { success: false, error: String(error) };
    }
}
