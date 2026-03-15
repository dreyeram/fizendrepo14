"use server";

/**
 * Authentication Actions - Medical Grade Security
 * 
 * Implements secure authentication with:
 * - bcrypt password hashing
 * - JWT token generation
 * - Audit logging
 * - Input validation
 */

import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import {
    hashPassword,
    verifyPassword,
    generateTokenPair,
    verifyAccessToken,
    AuditLogger,
    JWT_CONFIG,
    type Role,
} from "@/lib/security";
import {
    loginSchema,
    organizationRegistrationSchema,
    createPatientSchema,
    patientSearchSchema,
    safeValidate,
} from "@/lib/validators";
import { calculateAge } from "@/lib/utils";

// --- Types ---

interface AuthResult {
    success: boolean;
    error?: string;
    user?: {
        id: string;
        username: string;
        name: string;
        role: Role;
        orgId: string;
        orgName: string;
    };
}

interface CreatePatientResult {
    success: boolean;
    error?: string;
    patient?: {
        id: string;
        mrn: string;
        fullName: string;
        age?: number;
        gender?: string;
        mobile?: string;
        email?: string;
        referringDoctor?: string;
        refId?: string;
    };
}

export interface DuplicateCheckResult {
    exists: boolean;
    patient?: {
        id: string;
        fullName: string;
        mrn: string;
    };
    error?: string;
}

export interface UpdatePatientResult {
    success: boolean;
    error?: string;
    patient?: any;
}

// --- Organization & Setup ---

export async function registerOrganization(data: {
    organizationName: string;
    organizationType: string;
    adminUsername: string;
    adminPassword: string; // Plain password - will be hashed
    adminName: string;
}): Promise<{ success: boolean; orgId?: string; error?: string }> {
    try {
        // Validate input
        const validation = safeValidate(organizationRegistrationSchema, {
            organizationName: data.organizationName,
            organizationType: data.organizationType,
            adminUsername: data.adminUsername,
            adminPassword: data.adminPassword,
            adminName: data.adminName,
        });

        if (!validation.success) {
            return { success: false, error: validation.errors.join(', ') };
        }

        // Check if username already exists
        const existingUser = await prisma.user.findUnique({
            where: { username: data.adminUsername },
        });

        if (existingUser) {
            return { success: false, error: "Username already exists" };
        }

        // Hash the password with bcrypt
        const passwordHash = await hashPassword(data.adminPassword);

        // Create organization and admin user
        const org = await prisma.organization.create({
            data: {
                name: data.organizationName,
                type: data.organizationType,
                users: {
                    create: {
                        username: data.adminUsername,
                        passwordHash: passwordHash,
                        fullName: data.adminName,
                        role: "ADMIN",
                    },
                },
            },
            include: {
                users: true,
            },
        });

        // Log the registration
        await AuditLogger.patientCreate(
            org.users[0].id,
            data.adminUsername,
            'ADMIN',
            org.id,
            data.organizationName
        );

        return { success: true, orgId: org.id };
    } catch (error) {
        console.error("Registration failed:", error);
        return { success: false, error: "Registration failed" };
    }
}

// --- Authentication ---

export async function loginUser(
    username: string,
    password: string
): Promise<AuthResult> {
    try {
        // Validate input
        const validation = safeValidate(loginSchema, { username, password });
        if (!validation.success) {
            await AuditLogger.loginFailure(username, 'Validation failed');
            return { success: false, error: validation.errors.join(', ') };
        }

        // Find user
        const user = await prisma.user.findUnique({
            where: { username },
            include: { organization: true },
        });

        if (!user) {
            await AuditLogger.loginFailure(username, 'User not found');
            return { success: false, error: "Invalid credentials" };
        }

        // Verify password - support both bcrypt hashed and legacy plain-text passwords
        let isValid = false;

        // Check if password is bcrypt hashed (starts with $2a$, $2b$, or $2y$)
        const isBcryptHash = user.passwordHash.startsWith('$2');

        if (isBcryptHash) {
            // New bcrypt password
            isValid = await verifyPassword(password, user.passwordHash);
        } else {
            // Legacy plain-text password (for seeded data)
            // Trim just in case of whitespace issues in seed data
            isValid = password === user.passwordHash.trim();

            // If valid, upgrade to bcrypt hash for future logins
            // But only if password meets complexity requirements (>= 8 chars)
            if (isValid && password.length >= 8) {
                try {
                    const newHash = await hashPassword(password);
                    await prisma.user.update({
                        where: { id: user.id },
                        data: { passwordHash: newHash },
                    });
                } catch (e) {
                    // Log but don't fail login if upgrade fails
                    console.error('Failed to upgrade password hash:', e);
                }
            }
        }

        if (!isValid) {
            await AuditLogger.loginFailure(username, 'Invalid password');
            return { success: false, error: "Invalid credentials" };
        }

        // Generate JWT tokens
        const tokenPayload = {
            userId: user.id,
            username: user.username,
            role: user.role as Role,
            organizationId: user.organizationId,
            fullName: user.fullName,
        };

        const tokens = generateTokenPair(tokenPayload);

        // Set HTTP-only cookies
        const cookieStore = await cookies();

        cookieStore.set(JWT_CONFIG.ACCESS_COOKIE_NAME, tokens.accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 15 * 60, // 15 minutes
            path: '/',
        });

        cookieStore.set(JWT_CONFIG.REFRESH_COOKIE_NAME, tokens.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 8 * 60 * 60, // 8 hours
            path: '/',
        });

        // Log successful login
        await AuditLogger.loginSuccess(user.id, user.username, user.role as Role);

        return {
            success: true,
            user: {
                id: user.id,
                username: user.username,
                name: user.fullName,
                role: user.role as Role,
                orgId: user.organizationId,
                orgName: user.organization.name,
            },
        };
    } catch (error) {
        console.error("Login error:", error);
        await AuditLogger.loginFailure(username, 'Server error');
        return { success: false, error: "Login failed" };
    }
}

export async function logoutUser(): Promise<{ success: boolean }> {
    try {
        const cookieStore = await cookies();

        // Get current user for audit log
        const accessToken = cookieStore.get(JWT_CONFIG.ACCESS_COOKIE_NAME)?.value;
        if (accessToken) {
            const decoded = verifyAccessToken(accessToken);
            if (decoded) {
                await AuditLogger.logout(decoded.userId, decoded.username, decoded.role);
            }
        }

        // Clear cookies
        cookieStore.delete(JWT_CONFIG.ACCESS_COOKIE_NAME);
        cookieStore.delete(JWT_CONFIG.REFRESH_COOKIE_NAME);

        return { success: true };
    } catch (error) {
        console.error("Logout error:", error);
        return { success: true }; // Always succeed logout
    }
}

export async function getCurrentSession(): Promise<AuthResult> {
    try {
        const cookieStore = await cookies();
        const accessToken = cookieStore.get(JWT_CONFIG.ACCESS_COOKIE_NAME)?.value;

        if (!accessToken) {
            return { success: false, error: "Not authenticated" };
        }

        const decoded = verifyAccessToken(accessToken);

        if (!decoded) {
            return { success: false, error: "Invalid token" };
        }

        // Get fresh user data
        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            include: { organization: true },
        });

        if (!user) {
            return { success: false, error: "User not found" };
        }

        return {
            success: true,
            user: {
                id: user.id,
                username: user.username,
                name: user.fullName,
                role: user.role as Role,
                orgId: user.organizationId,
                orgName: user.organization.name,
            },
        };
    } catch (error) {
        console.error("Session check error:", error);
        return { success: false, error: "Session check failed" };
    }
}

// --- Patient Management ---

export async function getNextMRN(): Promise<{ success: boolean; mrn?: string; error?: string }> {
    try {
        const session = await getCurrentSession();
        let orgId: string;

        if (!session.success || !session.user) {
            const defaultOrg = await prisma.organization.findFirst({ select: { id: true } });
            if (!defaultOrg) return { success: false, error: "No organization found" };
            orgId = defaultOrg.id;
        } else {
            orgId = session.user.orgId;
        }

        const org = await prisma.organization.findUnique({
            where: { id: orgId },
            select: { uhidConfig: true }
        });

        let config = { prefix: "MRN-", suffix: "", currentSerial: 1000, digits: 6 };
        if (org?.uhidConfig) {
            try {
                const parsed = JSON.parse(org.uhidConfig);
                config = { ...config, ...parsed };
            } catch (e) { /* ignore */ }
        }

        // --- ROBUST DYNAMIC SEARCH ---
        // Instead of just trusting the config, find the first truly available number
        let serial = config.currentSerial;
        let availableMrn = '';
        let isCollision = true;
        let attempts = 0;

        while (isCollision && attempts < 100) {
            const serialStr = serial.toString().padStart(config.digits, '0');
            availableMrn = `${config.prefix}${serialStr}${config.suffix}`;
            
            const existing = await prisma.patient.findUnique({
                where: { mrn: availableMrn },
                select: { id: true }
            });

            if (!existing) {
                isCollision = false;
            } else {
                serial++;
                attempts++;
            }
        }

        // If we found a different serial than the one in config, update config on-the-fly to stay in sync
        if (serial !== config.currentSerial) {
            try {
                const newConfig = { ...config, currentSerial: serial };
                await prisma.organization.update({
                    where: { id: orgId },
                    data: { uhidConfig: JSON.stringify(newConfig) }
                });
            } catch (e) { console.error("Failed to sync uhidConfig during getNextMRN:", e); }
        }

        return { success: true, mrn: availableMrn };
    } catch (error) {
        console.error("Get next MRN error:", error);
        return { success: false, error: "Failed to fetch next MRN" };
    }
}

export async function getReferringPhysicians(): Promise<{ success: boolean; physicians: string[]; error?: string }> {
    try {
        const patients = await prisma.patient.findMany({
            where: {
                referringDoctor: { not: null },
                deletedAt: null
            },
            select: { referringDoctor: true },
            distinct: ['referringDoctor']
        });

        const physicians = patients
            .map(p => p.referringDoctor as string)
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b));

        return { success: true, physicians };
    } catch (error) {
        console.error("Get referring physicians error:", error);
        return { success: false, physicians: [], error: "Failed to fetch physicians" };
    }
}

export async function createPatient(data: {
    fullName: string;
    age?: number;
    gender?: string;
    mobile?: string;
    email?: string;
    address?: string;
    referringDoctor?: string;
    refId?: string;
}): Promise<CreatePatientResult> {
    try {
        // Validate input
        const validation = safeValidate(createPatientSchema, data);
        if (!validation.success) {
            return { success: false, error: validation.errors.join(', ') };
        }

        // Get session to identify Organization
        const session = await getCurrentSession();
        let orgId: string;
        let auditUserId: string | undefined;
        let auditUsername: string | undefined;
        let auditRole: string | undefined;

        if (!session.success || !session.user) {
            // Fallback: Use the first organization if not authenticated
            const defaultOrg = await prisma.organization.findFirst({
                select: { id: true }
            });
            if (!defaultOrg) {
                return { success: false, error: "No organization found to assign patient to" };
            }
            orgId = defaultOrg.id;
            auditUserId = 'SYSTEM';
            auditUsername = 'system_guest';
            auditRole = 'GUEST';
        } else {
            orgId = session.user.orgId;
            auditUserId = session.user.id;
            auditUsername = session.user.username;
            auditRole = session.user.role;
        }

        // Use transaction to ensure atomic Serial increment
        const patient = await prisma.$transaction(async (tx) => {
            // 1. Fetch Organization Config
            const org = await tx.organization.findUnique({
                where: { id: orgId },
                select: { uhidConfig: true }
            });

            // 2. Parse or Default Config
            let config = { prefix: "MRN-", suffix: "", currentSerial: 1000, digits: 6 };
            if (org?.uhidConfig) {
                try {
                    const parsed = JSON.parse(org.uhidConfig);
                    config = { ...config, ...parsed };
                } catch (e) { /* ignore parse error */ }
            }

            // 3. Generate MRN
            let mrn = '';
            const isGuest = data.refId === 'GUEST';

            if (isGuest) {
                // Generate a temporary GUEST MRN - do not use serial
                const timestamp = Date.now().toString().slice(-6);
                const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
                mrn = `GUEST-${timestamp}${random}`;
            } else {
                // ATOMIC COLLISION SEARCH
                let serial = config.currentSerial;
                let isCollision = true;
                let attempts = 0;

                while (isCollision && attempts < 100) {
                    const serialStr = serial.toString().padStart(config.digits, '0');
                    const candidateMrn = `${config.prefix}${serialStr}${config.suffix}`;
                    
                    const existing = await tx.patient.findUnique({
                        where: { mrn: candidateMrn },
                        select: { id: true }
                    });

                    if (!existing) {
                        mrn = candidateMrn;
                        isCollision = false;
                    } else {
                        serial++;
                        attempts++;
                    }
                }

                // 4. Update Serial in Org (to next available)
                const nextSerialForConfig = serial + 1;
                const newConfig = { ...config, currentSerial: nextSerialForConfig };
                await tx.organization.update({
                    where: { id: orgId },
                    data: { uhidConfig: JSON.stringify(newConfig) }
                });
            }

            // Build contact info JSON
            const contactInfo: Record<string, string> = {};
            if (data.mobile) contactInfo.mobile = `+91${data.mobile}`;
            if (data.email) contactInfo.email = data.email;
            if (data.address) contactInfo.address = data.address;

            // Calculate approximate DOB from age if provided
            let dateOfBirth: Date | undefined;
            if (data.age) {
                const today = new Date();
                dateOfBirth = new Date(today.getFullYear() - data.age, 0, 1); // Jan 1st of birth year
            }

            return await tx.patient.create({
                data: {
                    fullName: data.fullName,
                    mrn: mrn,
                    gender: data.gender,
                    // @ts-ignore
                    age: data.age,
                    dateOfBirth,
                    // @ts-ignore
                    mobile: data.mobile,
                    // @ts-ignore
                    email: data.email,
                    // @ts-ignore
                    address: data.address,
                    // @ts-ignore
                    referringDoctor: data.referringDoctor,
                    // @ts-ignore
                    refId: data.refId,
                    contactInfo: Object.keys(contactInfo).length > 0
                        ? JSON.stringify(contactInfo)
                        : undefined,
                },
            });
        });

        // Audit log
        await AuditLogger.patientCreate(
            auditUserId || 'SYSTEM',
            auditUsername || 'system',
            auditRole as any || 'SYSTEM',
            patient.id,
            patient.fullName
        );

        return {
            success: true,
            patient: {
                id: patient.id,
                mrn: patient.mrn,
                fullName: patient.fullName,
                // @ts-ignore
                age: data.age,
                gender: patient.gender || undefined,
                mobile: (patient as any).mobile || data.mobile,
                email: (patient as any).email || data.email,
                referringDoctor: (patient as any).referringDoctor || data.referringDoctor,
                // @ts-ignore
                refId: (patient as any).refId || data.refId
            },
        };
    } catch (error: any) {
        console.error("CRITICAL: Create patient error:", error);
        return {
            success: false,
            error: `Patient creation failed: ${error.message || 'Unknown error'}`
        };
    } finally {
        revalidatePath('/doctor');
        revalidatePath('/assistant');
        revalidatePath('/');
    }
}

export async function checkMobileExists(mobile: string): Promise<{ exists: boolean; error?: string }> {
    try {
        const existingMobilePatient = await prisma.patient.findFirst({
            where: {
                OR: [
                    // @ts-ignore
                    { mobile: mobile },
                    { contactInfo: { contains: mobile } }
                ]
            }
        });

        return { exists: !!existingMobilePatient };
    } catch (error: any) {
        console.error("Check mobile error:", error);
        return { exists: false, error: 'Failed to verify mobile uniqueness' };
    }
}

export async function checkEmailExists(email: string): Promise<{ exists: boolean; error?: string }> {
    try {
        const existingEmailPatient = await prisma.patient.findFirst({
            where: {
                OR: [
                    // @ts-ignore
                    { email: email.toLowerCase().trim() },
                    { contactInfo: { contains: email.toLowerCase().trim() } }
                ]
            }
        });

        return { exists: !!existingEmailPatient };
    } catch (error: any) {
        console.error("Check email error:", error);
        return { exists: false, error: 'Failed to verify email uniqueness' };
    }
}

export async function checkDuplicatePatient(data: {
    fullName: string;
    age: number;
    gender: string;
    mobile: string;
}): Promise<DuplicateCheckResult> {
    try {
        const existingPatient = await prisma.patient.findFirst({
            where: {
                fullName: data.fullName.trim(),
                age: data.age,
                gender: data.gender,
                mobile: data.mobile.trim(),
                deletedAt: null
            },
            select: {
                id: true,
                fullName: true,
                mrn: true
            }
        });

        return {
            exists: !!existingPatient,
            patient: existingPatient || undefined
        };
    } catch (error: any) {
        console.error("Duplicate check error:", error);
        return { exists: false, error: 'Registry verification failed' };
    }
}

/**
 * Search patients by name, MRN, mobile, email, or RefId
 * 
 * Used for building the quick-search list in sidebars and modals
 */
export async function searchPatients(query: string = "", limit: number = 50, doctorId?: string) {
    try {
        const searchTerm = (query || "").trim();

        // Base filter - exclude soft-deleted patients
        const where: any = {
            deletedAt: null
        };

        // We do NOT filter the patient list by doctorId because patients are shared 
        // across the organization. Any doctor should be able to select any patient 
        // to start a new procedure.
        // Instead, the `include.procedures` below filters the history so a doctor
        // only sees their own past procedures.

        if (searchTerm) {
            where.OR = [
                { fullName: { contains: searchTerm } },
                { mrn: { contains: searchTerm } },
                { mobile: { contains: searchTerm } },
                { email: { contains: searchTerm } },
                { refId: { contains: searchTerm } }
            ];
        }

        const patients = await prisma.patient.findMany({
            where,
            orderBy: { updatedAt: 'desc' },
            take: limit,
            include: {
                procedures: {
                    // Only include procedures from this doctor (if filtered)
                    where: doctorId ? { doctorId } : undefined,
                    orderBy: { createdAt: "desc" },
                    take: 10,
                    include: {
                        media: {
                            where: { isDeleted: false },
                            orderBy: { timestamp: "desc" }
                        },
                        report: { select: { id: true, finalized: true, pdfPath: true } }
                    }
                }
            }
        });

        // Map results to ensure consistent structure and data types
        // First: collect all procedure IDs and fetch their source field via raw SQL
        // (Prisma's generated client may not know about the 'source' column)
        const allProcIds = patients.flatMap(p => p.procedures.map(pr => pr.id));
        let sourceMap: Record<string, string | null> = {};
        
        if (allProcIds.length > 0) {
            try {
                const placeholders = allProcIds.map(() => '?').join(',');
                const rawSources: any[] = await prisma.$queryRawUnsafe(
                    `SELECT id, source FROM Procedure WHERE id IN (${placeholders})`,
                    ...allProcIds
                );
                for (const row of rawSources) {
                    sourceMap[row.id] = row.source || null;
                }
            } catch (e) {
                console.error("Failed to fetch procedure sources via raw SQL:", e);
            }
        }

        const result = patients.map(p => ({
            ...p,
            age: p.age ?? (p.dateOfBirth ? calculateAge(p.dateOfBirth) : undefined),
            procedures: p.procedures.map(proc => ({
                ...proc,
                source: sourceMap[proc.id] || (proc as any).source || null,
                hasReport: !!proc.report,
                hasMedia: proc.media.length > 0,
                // Count specific media types
                mediaStats: {
                    images: proc.media.filter(m => m.type === 'IMAGE' || m.type === 'ANNOTATED').length,
                    videos: proc.media.filter(m => m.type === 'VIDEO').length,
                    reports: proc.report ? 1 : 0
                }
            }))
        }));

        // Return standardized object for all consumers
        return {
            success: true,
            patients: JSON.parse(JSON.stringify(result))
        };
    } catch (error) {
        console.error("Patient search failed:", error);
        return {
            success: false,
            patients: [],
            error: error instanceof Error ? error.message : "Search failed"
        };
    }
}

export async function getSeededDoctorId(): Promise<string | undefined> {
    try {
        const user = await prisma.user.findFirst({
            where: { role: "DOCTOR" },
        });
        return user?.id;
    } catch (error) {
        console.error("Get seeded doctor error:", error);
        return undefined;
    }
}

export async function getSeededAdminId(): Promise<string | undefined> {
    try {
        const user = await prisma.user.findFirst({
            where: { role: "ADMIN" },
        });
        return user?.id;
    } catch (error) {
        console.error("Get seeded admin error:", error);
        return undefined;
    }
}

// --- Password Management ---

export async function changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
): Promise<{ success: boolean; error?: string }> {
    try {
        // Get user
        const user = await prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            return { success: false, error: "User not found" };
        }

        // Verify current password
        const isValid = await verifyPassword(currentPassword, user.passwordHash);
        if (!isValid) {
            return { success: false, error: "Current password is incorrect" };
        }

        // Hash new password
        const newHash = await hashPassword(newPassword);

        // Update password
        await prisma.user.update({
            where: { id: userId },
            data: { passwordHash: newHash },
        });

        // Audit log
        await AuditLogger.passwordChange(userId, user.username, user.role as Role);

        return { success: true };
    } catch (error) {
        console.error("Change password error:", error);
        return { success: false, error: "Password change failed" };
    }
}

export async function updatePatient(id: string, data: {
    fullName?: string;
    age?: number;
    gender?: string;
    mobile?: string;
    email?: string;
    address?: string;
    referringDoctor?: string;
    refId?: string;
    mrn?: string;
}): Promise<UpdatePatientResult> {
    try {
        // Validate session
        const session = await getCurrentSession();
        let auditUserId = 'SYSTEM';
        let auditUsername = 'system';
        let auditRole = 'GUEST';

        if (session.success && session.user) {
            auditUserId = session.user.id;
            auditUsername = session.user.username;
            auditRole = session.user.role;
        }

        const orgId = session.success && session.user ? session.user.orgId : null;

        // Calculate DOB if age changes
        let dateOfBirth: Date | undefined;
        if (data.age !== undefined) {
            const today = new Date();
            dateOfBirth = new Date(today.getFullYear() - data.age, 0, 1);
        }

        const patient = await prisma.$transaction(async (tx) => {
            let finalMrn = data.mrn;

            // If a new real MRN is being assigned (usually during GUEST conversion)
            if (finalMrn && !finalMrn.startsWith('GUEST-') && orgId) {
                const org = await tx.organization.findUnique({
                    where: { id: orgId },
                    select: { uhidConfig: true }
                });

                if (org?.uhidConfig) {
                    try {
                        let config = JSON.parse(org.uhidConfig);
                        
                        // ATOMIC COLLISION PREVENTION:
                        // Instead of just checking if data.mrn matches next serial,
                        // we find the actual next available serial in case of fragmentation or drift.
                        
                        let serial = config.currentSerial;
                        let availableMrn = '';
                        let isCollision = true;
                        let attempts = 0;

                        while (isCollision && attempts < 100) {
                            const serialStr = serial.toString().padStart(config.digits, '0');
                            availableMrn = `${config.prefix}${serialStr}${config.suffix}`;
                            
                            const existing = await tx.patient.findUnique({
                                where: { mrn: availableMrn },
                                select: { id: true }
                            });

                            if (!existing || existing.id === id) {
                                isCollision = false;
                            } else {
                                serial++;
                                attempts++;
                            }
                        }

                        finalMrn = availableMrn;

                        // Update Org Serial only if we found or moved to a new one
                        const nextSerial = serial + 1;
                        if (nextSerial > config.currentSerial) {
                            const newConfig = { ...config, currentSerial: nextSerial };
                            await tx.organization.update({
                                where: { id: orgId },
                                data: { uhidConfig: JSON.stringify(newConfig) }
                            });
                        }
                    } catch (e) {
                        console.error("MRN reconciliation failed in update:", e);
                    }
                }
            }

            return await tx.patient.update({
                where: { id },
                data: {
                    fullName: data.fullName,
                    gender: data.gender,
                    // @ts-ignore
                    age: data.age,
                    dateOfBirth: dateOfBirth,
                    // @ts-ignore
                    mobile: data.mobile,
                    // @ts-ignore
                    email: data.email,
                    // @ts-ignore
                    address: data.address,
                    // @ts-ignore
                    referringDoctor: data.referringDoctor,
                    // @ts-ignore
                    refId: data.refId,
                    mrn: finalMrn,
                }
            });
        });

        // Audit log
        await AuditLogger.patientUpdate(
            auditUserId,
            auditUsername,
            auditRole as any,
            patient.id,
            data as any
        );

        revalidatePath('/doctor');
        revalidatePath('/assistant');
        return { success: true, patient };
    } catch (error: any) {
        console.error("Update patient error:", error);
        return { success: false, error: error.message || "Failed to update patient" };
    }
}

export async function deletePatient(id: string): Promise<{ success: boolean; error?: string }> {
    try {
        await prisma.patient.delete({
            where: { id }
        });
        
        revalidatePath('/doctor');
        revalidatePath('/assistant');
        return { success: true };
    } catch (error: any) {
        console.error("Delete patient error:", error);
        return { success: false, error: error.message || "Failed to delete patient" };
    }
}

