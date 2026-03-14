import JSZip from 'jszip';
import { saveAs } from 'file-saver';

/**
 * Downloads all media and report for a procedure as a ZIP file.
 * Only includes finalized PDF reports (fetched from server). No on-the-fly generation.
 */
export async function downloadProcedureZip(patient: any, procedure: any, hospital?: any) {
    const zip = new JSZip();
    const folderName = `${patient.mrn || 'Patient'}_${procedure.type || 'Procedure'}_${new Date(procedure.createdAt).toISOString().split('T')[0]}`;
    const folder = zip.folder(folderName);

    if (!folder) throw new Error("Failed to create ZIP folder");

    // 1. Add Media Files (images, videos, annotated) into organized subfolders
    if (procedure.media && procedure.media.length > 0) {
        const imagesFolder = folder.folder("images");
        const videosFolder = folder.folder("videos");
        const annotatedFolder = folder.folder("annotated_images");

        await Promise.all(procedure.media.map(async (m: any, index: number) => {
            try {
                const isDataUrl = m.filePath?.startsWith('data:');
                const url = isDataUrl ? m.filePath : `/api/capture-serve?path=${encodeURIComponent(m.filePath)}`;
                
                const response = await fetch(url);
                if (!response.ok) throw new Error(`Failed to fetch media: ${m.id}`);
                const blob = await response.blob();
                
                // Route to correct subfolder based on type
                let targetFolder = imagesFolder;
                let ext = 'jpg';
                if (m.type === 'VIDEO') {
                    targetFolder = videosFolder;
                    ext = 'mp4';
                } else if (m.type === 'ANNOTATED') {
                    targetFolder = annotatedFolder;
                    ext = 'png';
                }
                
                const fileName = `media_${index + 1}_${m.id.substring(0, 8)}.${ext}`;
                targetFolder?.file(fileName, blob);
            } catch (err) {
                console.error(`Error adding media ${m.id} to ZIP:`, err);
            }
        }));
    }

    // 2. Add Report PDF — ONLY if finalized (fetch from server, no on-the-fly generation)
    if (procedure.report && procedure.report.finalized) {
        try {
            const reportUrl = `/api/report-serve?id=${procedure.id}`;
            const rRes = await fetch(reportUrl);
            if (rRes.ok) {
                const rBlob = await rRes.blob();
                folder.file("Report.pdf", rBlob);
            }
        } catch (err) {
            console.error("Error adding report to ZIP:", err);
        }
    }

    // 3. Generate and Save ZIP
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `${folderName}.zip`);
}

/**
 * Downloads a bulk ZIP containing multiple patients, their procedures, and media/reports.
 */
export async function downloadPatientsZip(patients: any[], hospital?: any) {
    const zip = new JSZip();
    
    // Group everything inside a timestamped generic folder
    const exportParentFolderName = `Patient_Export_${new Date().toISOString().split('T')[0]}`;
    const mainFolder = zip.folder(exportParentFolderName);
    if (!mainFolder) throw new Error("Failed to create main ZIP folder");

    for (const patient of patients) {
        const patientFolder = mainFolder.folder(`${patient.mrn || 'Patient'}_${patient.fullName || 'Export'}`);
        if (!patientFolder) continue;

        // 1. Create Patient Details Text File
        const details = [
            `Patient Name: ${patient.fullName}`,
            `MRN: ${patient.mrn}`,
            `Age: ${patient.age || patient.dateOfBirth || 'N/A'}`,
            `Gender: ${patient.gender || 'N/A'}`,
            `Contact: ${typeof patient.contactInfo === 'string' ? patient.contactInfo : JSON.stringify(patient.contactInfo || 'N/A')}`,
            `Referring Doctor: ${patient.referringDoctor || 'N/A'}`
        ].join('\n');
        patientFolder.file("patient_details.txt", details);

        // 2. Loop through procedures
        const procedures = patient.procedures || [];
        for (const proc of procedures) {
            const procDate = new Date(proc.createdAt).toISOString().split('T')[0];
            const procFolder = patientFolder.folder(`${procDate}_${proc.type || 'Procedure'}`);
            if (!procFolder) continue;

            const videosFolder = procFolder.folder('videos');
            const imagesFolder = procFolder.folder('images');
            const annotatedFolder = procFolder.folder('annotated_images');

            // Add Media Files
            if (proc.media && proc.media.length > 0) {
                await Promise.all(proc.media.map(async (m: any, index: number) => {
                    try {
                        const isDataUrl = m.filePath?.startsWith('data:');
                        const url = isDataUrl ? m.filePath : `/api/capture-serve?path=${encodeURIComponent(m.filePath)}`;
                        
                        const response = await fetch(url);
                        if (!response.ok) return;
                        const blob = await response.blob();
                        
                        let targetFolder = imagesFolder;
                        let ext = 'jpg';
                        if (m.type === 'VIDEO') {
                            targetFolder = videosFolder;
                            ext = 'mp4';
                        } else if (m.type === 'ANNOTATED') {
                            targetFolder = annotatedFolder;
                            ext = 'png';
                        }
                        
                        const fileName = `media_${index + 1}_${m.id.substring(0, 8)}.${ext}`;
                        targetFolder?.file(fileName, blob);
                    } catch (err) {
                        console.error(`Error adding media ${m.id} to export ZIP:`, err);
                    }
                }));
            }

            // Add Report - We only want finalized generated reports, we fetch this from API directly
            if (proc.report && proc.report.finalized) {
                try {
                    // This route serves what's saved exactly, no dynamic re-generation required
                    const reportUrl = `/api/report-serve?id=${proc.id}`;
                    const rRes = await fetch(reportUrl);
                    if (rRes.ok) {
                        const rBlob = await rRes.blob();
                        procFolder.file("Report.pdf", rBlob);
                    }
                } catch (err) {
                    console.error("Error adding report to export ZIP:", err);
                }
            }
        }
    }

    // 3. Generate and Save ZIP
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `${exportParentFolderName}.zip`);
}

/**
 * Downloads a ZIP containing multiple selected procedures for a single patient.
 */
export async function downloadMultipleProceduresZip(patient: any, procedures: any[], hospital?: any) {
    const zip = new JSZip();
    
    // Parent folder name based on the patient
    const exportParentFolderName = `${patient.mrn || 'Patient'}_Procedures_Export_${new Date().toISOString().split('T')[0]}`;
    const mainFolder = zip.folder(exportParentFolderName);
    if (!mainFolder) throw new Error("Failed to create main ZIP folder");

    // 1. Create Patient Details Text File
    const details = [
        `Patient Name: ${patient.fullName}`,
        `MRN: ${patient.mrn}`,
        `Age: ${patient.age || patient.dateOfBirth || 'N/A'}`,
        `Gender: ${patient.gender || 'N/A'}`,
        `Contact: ${typeof patient.contactInfo === 'string' ? patient.contactInfo : JSON.stringify(patient.contactInfo || 'N/A')}`,
        `Referring Doctor: ${patient.referringDoctor || 'N/A'}`
    ].join('\n');
    mainFolder.file("patient_details.txt", details);

    // 2. Loop through selected procedures
    for (const proc of procedures) {
        const procDate = new Date(proc.createdAt).toISOString().split('T')[0];
        const procFolder = mainFolder.folder(`${procDate}_${proc.type || 'Procedure'}`);
        if (!procFolder) continue;

        const videosFolder = procFolder.folder('videos');
        const imagesFolder = procFolder.folder('images');
        const annotatedFolder = procFolder.folder('annotated_images');

        // Add Media Files
        if (proc.media && proc.media.length > 0) {
            await Promise.all(proc.media.map(async (m: any, index: number) => {
                try {
                    const isDataUrl = m.filePath?.startsWith('data:');
                    const url = isDataUrl ? m.filePath : `/api/capture-serve?path=${encodeURIComponent(m.filePath)}`;
                    
                    const response = await fetch(url);
                    if (!response.ok) return;
                    const blob = await response.blob();
                    
                    let targetFolder = imagesFolder;
                    let ext = 'jpg';
                    if (m.type === 'VIDEO') {
                        targetFolder = videosFolder;
                        ext = 'mp4';
                    } else if (m.type === 'ANNOTATED') {
                        targetFolder = annotatedFolder;
                        ext = 'png';
                    }
                    
                    const fileName = `media_${index + 1}_${m.id.substring(0, 8)}.${ext}`;
                    targetFolder?.file(fileName, blob);
                } catch (err) {
                    console.error(`Error adding media ${m.id} to export ZIP:`, err);
                }
            }));
        }

        // Add Report
        if (proc.report && proc.report.finalized) {
            try {
                // Fetch the explicitly finalized PDF
                const reportUrl = `/api/report-serve?id=${proc.id}`;
                const rRes = await fetch(reportUrl);
                if (rRes.ok) {
                    const rBlob = await rRes.blob();
                    procFolder.file("Report.pdf", rBlob);
                }
            } catch (err) {
                console.error("Error adding report to export ZIP:", err);
            }
        }
    }

    // 3. Generate and Save ZIP
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `${exportParentFolderName}.zip`);
}

