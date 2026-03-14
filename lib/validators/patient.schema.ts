/**
 * Patient Validation Schemas
 * 
 * Zod schemas for validating patient-related requests.
 */

import { z } from 'zod';

/**
 * Indian mobile number regex (10 digits starting with 6-9)
 */
const indianMobileRegex = /^[6-9]\d{9}$/;

/**
 * Create patient schema
 */
export const createPatientSchema = z.object({
    fullName: z
        .string()
        .trim()
        .min(2, 'Name must be at least 2 characters')
        .max(22, 'Name must not exceed 22 characters')
        .regex(/^[a-zA-Z\s.'-]+$/, 'Name can only contain letters, spaces, and common punctuation'),
    dateOfBirth: z
        .string()
        .datetime()
        .optional()
        .or(z.date().optional()),
    age: z
        .number()
        .min(0.01, 'Age must be at least 1 month')
        .max(150, 'Age must be realistic (max 150)')
        .optional(),
    gender: z.enum(['Male', 'Female', 'Other']).optional(),
    mobile: z
        .string()
        .trim()
        .regex(indianMobileRegex, 'Please enter a valid 10-digit mobile number')
        .optional()
        .or(z.literal('')),
    email: z
        .string()
        .trim()
        .email('Please enter a valid email address')
        .max(255, 'Email is too long')
        .optional()
        .or(z.literal('')),
    address: z
        .string()
        .trim()
        .max(500, 'Address must not exceed 500 characters')
        .optional(),
    referringDoctor: z
        .string()
        .trim()
        .optional(),
    refId: z
        .string()
        .trim()
        .optional(),
}).strict();

export type CreatePatientInput = z.infer<typeof createPatientSchema>;

/**
 * Update patient schema
 */
export const updatePatientSchema = createPatientSchema.partial().extend({
    id: z.string().uuid('Invalid patient ID'),
}).strict();

export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;

/**
 * Patient search schema
 */
export const patientSearchSchema = z.object({
    query: z
        .string()
        .trim()
        .max(100, 'Search query too long')
        .optional(),
    limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(50),
    offset: z
        .number()
        .int()
        .min(0)
        .default(0),
}).strict();

export type PatientSearchInput = z.infer<typeof patientSearchSchema>;

/**
 * Patient ID parameter schema
 */
export const patientIdSchema = z.object({
    id: z.string().uuid('Invalid patient ID'),
}).strict();

export type PatientIdInput = z.infer<typeof patientIdSchema>;
