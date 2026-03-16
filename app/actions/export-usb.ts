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
