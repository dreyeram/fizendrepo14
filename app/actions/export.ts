"use server";

import { prisma } from "@/lib/prisma";

/**
 * Export selected patients to CSV on USB
 */
export async function exportPatientsAction(patientIds: string[]) {
    try {
        if (!patientIds || patientIds.length === 0) {
            return { success: false, error: "No patients selected for export" };
        }

        // Fetch patient details from DB
        const patients = await prisma.patient.findMany({
            where: {
                id: { in: patientIds },
                deletedAt: null
            },
            select: {
                mrn: true,
                fullName: true,
                dateOfBirth: true,
                gender: true,
                contactInfo: true
            }
        });

        if (patients.length === 0) {
            return { success: false, error: "No valid patient records found" };
        }

        // Format for export lib
        const exportData = patients.map(p => ({
            mrn: p.mrn,
            fullName: p.fullName,
            dateOfBirth: p.dateOfBirth?.toISOString().split('T')[0] || '',
            gender: p.gender || '',
            contactInfo: typeof p.contactInfo === 'string' ? p.contactInfo : JSON.stringify(p.contactInfo || '')
        }));

        // Build CSV string
        const headers = ['MRN', 'Full Name', 'Date of Birth', 'Gender', 'Contact'];
        const rows = exportData.map(p => [
            p.mrn,
            p.fullName,
            p.dateOfBirth,
            p.gender,
            p.contactInfo,
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        return {
            success: true,
            data: csvContent,
            fileName: `patients_export_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`
        };
    } catch (error) {
        console.error("Export action failure:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Export action failed"
        };
    }
}

export async function getExportStatistics() {
    try {
        const patientCount = await prisma.patient.count({ where: { deletedAt: null } });
        const procedureCount = await prisma.procedure.count(); // Procedure has no deletedAt
        // Mock other counts for now as tables might not exist or be complex to query
        const reportCount = await prisma.report.count();
        const mediaCount = await prisma.media.count();

        return {
            success: true,
            stats: {
                patientCount,
                procedureCount,
                reportCount,
                mediaCount
            }
        };
    } catch (error) {
        return { success: false, error: "Failed to fetch statistics" };
    }
}

export async function exportPatientsCSV() {
    try {
        const patients = await prisma.patient.findMany({
            where: { deletedAt: null },
            select: {
                mrn: true,
                fullName: true,
                dateOfBirth: true,
                gender: true,
                contactInfo: true,
                createdAt: true
            }
        });

        // Convert to CSV string (basic implementation)
        const headers = ['MRN', 'Name', 'DOB', 'Gender', 'Created At'];
        const rows = patients.map(p => [
            p.mrn,
            p.fullName,
            p.dateOfBirth?.toISOString().split('T')[0] || '',
            p.gender || '',
            p.createdAt.toISOString().split('T')[0]
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(r => r.map(c => `"${c}"`).join(','))
        ].join('\n');

        return {
            success: true,
            data: csvContent,
            filename: `patients_export_${new Date().toISOString().split('T')[0]}.csv`,
            count: patients.length
        };
    } catch (error) {
        return { success: false, error: "Failed to export patients" };
    }
}

export async function exportSettingsBackup(userId: string) {
    try {
        if (!userId) return { success: false, error: "User ID required" };

        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { organization: true }
        });

        if (!user) return { success: false, error: "User not found" };

        const settings = {
            user: {
                name: user.fullName, // schema uses fullName
                contactDetails: user.contactDetails, // schema uses contactDetails
                role: user.role
            },
            organization: user.organization,
            exportedAt: new Date().toISOString()
        };

        return {
            success: true,
            data: JSON.stringify(settings, null, 2),
            filename: `settings_backup_${new Date().toISOString().split('T')[0]}.json`
        };
    } catch (error) {
        return { success: false, error: "Failed to export settings" };
    }
}
