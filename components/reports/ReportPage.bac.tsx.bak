'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Check, Download, Building2, MapPin, Phone, Mail, User, Calendar, Hash, FileText, Info, Stethoscope, Edit3 } from 'lucide-react';
import SmartToolbar from './SmartToolbar';
import PDFDocument from './PDFDocument';
import ImageColumn from './ImageColumn';
import ImageGalleryPicker from './ImageGalleryPicker';
import { getAllTemplates } from '@/data/reportTemplates';
import { updateProcedureType } from '@/app/actions/procedure';

// ═══════════════════════════════════════════════════════════════
// HELPER: Convert array of selections to readable prose
// ═══════════════════════════════════════════════════════════════
const formatMultiSelect = (items: string[]): string => {
    if (!items || items.length === 0) return '';
    if (items.length === 1) return items[0];
    if (items.length === 2) return `${items[0]} and ${items[1]}`;
    return items.slice(0, -1).join(', ') + ', and ' + items[items.length - 1];
};

// Helper to detect ENT procedures
const isENTProcedure = (procedureType: string): boolean => {
    if (!procedureType) return false;
    const lower = procedureType.toLowerCase();
    return lower.includes('nasal') ||
        lower.includes('laryngoscopy') ||
        lower.includes('stroboscopy') ||
        lower.includes('otoendoscopy') ||
        lower.includes('otoscopy') ||
        lower.includes('pharyngoscopy') ||
        lower.includes('sleep_apnea') ||
        lower.includes('osa') ||
        lower.includes('dise') ||
        lower.includes('bronchoscopy') ||
        lower.includes('fob') ||
        lower.includes('oto') ||
        lower.includes('pulmonology_ent') ||
        lower === 'ent';
};

// Helper to detect specific procedure types and return the template category
const getProcedureCategory = (procedureType: string): string => {
    if (!procedureType) return 'gi';
    const lower = procedureType.toLowerCase();

    // Extract subtype from encoded format (specialty:category:subtype)
    const parts = procedureType.split(':');
    const subtype = parts.length === 3 ? parts[2].toLowerCase() : lower;

    // =================================================================
    // ENT PROCEDURES - Check most specific first
    // =================================================================

    // Otology / Ear procedures
    if (subtype.includes('oto') ||
        subtype.includes('otoscopy') ||
        subtype.includes('otoendoscopy') ||
        subtype.includes('otology') ||
        subtype.includes('ear') ||
        subtype.includes('ees')) {
        return 'oto';
    }

    // Sleep Apnea / OSA / DISE
    if (subtype.includes('sleep') ||
        subtype.includes('osa') ||
        subtype.includes('dise') ||
        subtype.includes('apnea') ||
        subtype.includes('drug_induced') ||
        subtype.includes('drug induced')) {
        return 'osa';
    }

    // Stroboscopy
    if (subtype.includes('stroboscopy') ||
        subtype.includes('videostroboscopy')) {
        return 'stroboscopy';
    }

    // Laryngoscopy
    if (subtype.includes('laryng') ||
        subtype.includes('vocal') ||
        subtype.includes('vl_rigid') ||
        subtype.includes('vl_flexible')) {
        return 'laryngoscopy';
    }

    // Bronchoscopy / FOB
    if (subtype.includes('bronch') ||
        subtype.includes('fob') ||
        subtype.includes('bronchoscopy')) {
        return 'fob';
    }

    // Pharyngoscopy / Nasopharyngoscopy
    if (subtype.includes('pharyngo') ||
        subtype.includes('pharyngoscopy') ||
        subtype.includes('nasopharyngo')) {
        return 'pharyngoscopy';
    }

    // Nasal / DNE - Check AFTER specific ENT types
    if (subtype.includes('nasal') ||
        subtype.includes('sinus') ||
        subtype.includes('dne') ||
        subtype.includes('rhinoscopy') ||
        subtype.includes('nasal_endoscopy')) {
        return 'nasal';
    }

    // =================================================================
    // GI PROCEDURES
    // =================================================================
    if (subtype.includes('colon') || subtype.includes('lower_gi')) return 'colonoscopy';
    if (subtype.includes('gastro') || subtype.includes('upper_gi') || subtype.includes('egd') || subtype.includes('ugi')) return 'upper_gi';

    // Default fallback - check if it's a generic ENT reference
    // IMPORTANT: This check must come LAST to avoid catching specific ENT types
    if (lower === 'ent' || lower.includes('pulmonology_ent')) {
        return 'nasal'; // Generic ENT defaults to nasal
    }

    return 'gi'; // Default for GI procedures
};

// Get subtype from encoded procedure type
const getSubtypeId = (procedureType: string): string => {
    if (!procedureType) return '';
    const parts = procedureType.split(':');
    return parts.length === 3 ? parts[2] : procedureType;
};

// Get display title based on procedure category
const getReportTitle = (procedureType: string): string => {
    const category = getProcedureCategory(procedureType);
    switch (category) {
        case 'osa': return 'Drug Induced Sleep Endoscopy (DISE) Report';
        case 'fob': return 'Flexible Fiber-Optic Bronchoscopy Report';
        case 'oto': return 'Otology (Ear Examination) Report';
        case 'stroboscopy': return 'Laryngeal Stroboscopy Report';
        case 'laryngoscopy': return 'Video Laryngoscopy Report';
        case 'nasal': return 'Diagnostic Nasal Endoscopy';
        case 'pharyngoscopy': return 'Pharyngoscopy Report';
        case 'colonoscopy': return 'Colonoscopy Report';
        case 'upper_gi': return 'Upper GI Endoscopy Report';
        default: return 'Endoscopy Report';
    }
};

interface ReportPageProps {
    patient: {
        id?: string;
        name: string;
        age?: number;
        gender?: string;
        mrn?: string;
        procedureType?: string;
    };
    procedureId?: string;  // For updating procedure type in DB
    captures: Array<{
        id: string;
        url: string;
        type?: 'image' | 'video';
        selected?: boolean;
        findings?: { location?: string };
        maskType?: string;
        originalWidth?: number;
        originalHeight?: number;
    }>;
    onBack: () => void;
    onComplete?: () => void;
    onGeneratePDF: (reportData: any, action?: 'download' | 'preview' | 'print' | 'save') => Promise<void>;
    hospital?: {
        name?: string;
        address?: string;
        mobile?: string;
        email?: string;
        logoPath?: string;
    };
    doctor?: {
        fullName?: string;
        specialty?: string;
        signaturePath?: string;
    };
}

// ═══════════════════════════════════════════════════════════════
// SECTION DEFINITIONS - Define all fields for each procedure type
// ═══════════════════════════════════════════════════════════════
const getReportSections = (procedureType: string) => {
    const category = getProcedureCategory(procedureType);

    // Sleep Apnea / OSA sections
    if (category === 'osa') {
        return [
            {
                id: 'indication',
                title: 'Indication',
                type: 'findings' as const,
                fields: [
                    { id: 'indication', label: 'Indication', type: 'multiselect' as const, options: ['Snoring', 'Unrefreshing sleep', 'Morning headache', 'Nocturia', 'Poor concentration', 'Hypertension / Diabetes / CAD', 'Post-operative evaluation', 'Others'] },
                    { id: 'essScore', label: 'ESS Score (/24)', type: 'text' as const, placeholder: 'e.g. 16' },
                    { id: 'bmi', label: 'BMI (kg/m²)', type: 'text' as const, placeholder: 'e.g. 28.5' }
                ]
            },
            {
                id: 'oralExam',
                title: 'Oral Cavity & Oropharynx',
                type: 'findings' as const,
                fields: [
                    { id: 'mallampatiGrade', label: 'Mallampati Grade', type: 'select' as const, options: ['I', 'II', 'III', 'IV'] },
                    { id: 'tonsilsGrade', label: 'Tonsils', type: 'select' as const, options: ['Grade 0', 'I', 'II', 'III', 'IV'] },
                    { id: 'uvula', label: 'Uvula', type: 'select' as const, options: ['Normal', 'Elongated', 'Redundant'] },
                    { id: 'tongueBase', label: 'Tongue Base', type: 'select' as const, options: ['Normal', 'Bulky', 'Retroglossal narrowing'] }
                ]
            },
            {
                id: 'sleepStudy',
                title: 'Sleep Study Details',
                type: 'findings' as const,
                fields: [
                    { id: 'ahi', label: 'AHI (/hr)', type: 'text' as const, placeholder: 'e.g. 28.4' },
                    { id: 'lowestSpo2', label: 'Lowest SpO2 (%)', type: 'text' as const, placeholder: 'e.g. 78' },
                    { id: 'osaSeverity', label: 'OSA Severity', type: 'select' as const, options: ['Normal (<5)', 'Mild OSA (5-14.9)', 'Moderate OSA (15-29.9)', 'Severe OSA (≥30)'] }
                ]
            },
            {
                id: 'conclusion',
                title: 'Impression & Plan',
                type: 'impression' as const,
                fields: [
                    { id: 'impression', label: 'Impression', type: 'textarea' as const, placeholder: 'Enter diagnostic impression...' },
                    { id: 'plan', label: 'Plan', type: 'textarea' as const, placeholder: 'Enter recommendations...' }
                ]
            }
        ];
    }

    // Laryngoscopy sections
    if (category === 'laryngoscopy') {
        return [
            {
                id: 'indication',
                title: 'Indication',
                type: 'findings' as const,
                fields: [
                    { id: 'indication', label: 'Indication', type: 'multiselect' as const, options: ['Hoarseness of voice', 'Dysphagia / odynophagia', 'Chronic cough', 'Suspected vocal cord lesion', 'Professional voice assessment', 'Airway evaluation / stridor', 'Post-operative evaluation', 'Others'] }
                ]
            },
            {
                id: 'findings',
                title: 'Endoscopic Findings',
                type: 'findings' as const,
                fields: [
                    { id: 'baseOfTongue', label: 'Base of Tongue', type: 'select' as const, options: ['Normal', 'Abnormal'] },
                    { id: 'vallecula', label: 'Vallecula', type: 'select' as const, options: ['Clear', 'Pooling'] },
                    { id: 'epiglottis', label: 'Epiglottis', type: 'select' as const, options: ['Normal', 'Edematous', 'Omega-shaped'] },
                    { id: 'arytenoids', label: 'Arytenoids', type: 'select' as const, options: ['Normal', 'Congested'] },
                    { id: 'falseCords', label: 'False Vocal Cords', type: 'select' as const, options: ['Normal', 'Edematous'] },
                    { id: 'trueVocalCords', label: 'True Vocal Cords', type: 'select' as const, options: ['Normal', 'Lesion'] },
                    { id: 'vocalCordMobility', label: 'Vocal Cord Mobility', type: 'select' as const, options: ['Normal', 'Reduced', 'Fixed'] },
                    { id: 'glotticClosure', label: 'Glottic Closure', type: 'select' as const, options: ['Complete', 'Incomplete'] }
                ]
            },
            {
                id: 'conclusion',
                title: 'Impression & Plan',
                type: 'impression' as const,
                fields: [
                    { id: 'impression', label: 'Impression', type: 'textarea' as const, placeholder: 'Enter diagnostic impression...' },
                    { id: 'plan', label: 'Plan', type: 'textarea' as const, placeholder: 'Enter recommendations...' }
                ]
            }
        ];
    }

    // Stroboscopy sections
    if (category === 'stroboscopy') {
        return [
            {
                id: 'indication',
                title: 'Indication',
                type: 'findings' as const,
                fields: [
                    { id: 'indication', label: 'Indication', type: 'multiselect' as const, options: ['Hoarseness of voice', 'Professional voice user', 'Suspected vocal cord lesion', 'Voice fatigue', 'Post-operative / Post-therapy assessment', 'Others'] }
                ]
            },
            {
                id: 'voiceHistory',
                title: 'Voice History',
                type: 'findings' as const,
                fields: [
                    { id: 'durationOfSymptoms', label: 'Duration of Symptoms', type: 'text' as const, placeholder: 'days' },
                    { id: 'voiceAbuseOveruse', label: 'Voice Abuse / Overuse', type: 'select' as const, options: ['Yes', 'No'] },
                    { id: 'smokingAlcohol', label: 'Smoking / Alcohol', type: 'select' as const, options: ['Yes', 'No'] },
                    { id: 'gerd', label: 'GERD', type: 'select' as const, options: ['Yes', 'No'] }
                ]
            },
            {
                id: 'rightVocalFold',
                title: 'Right Vocal Fold',
                type: 'findings' as const,
                fields: [
                    { id: 'rightVocalFoldEdge', label: 'Vocal Fold Edge', type: 'select' as const, options: ['Smooth', 'Irregular'] },
                    { id: 'rightColor', label: 'Color', type: 'select' as const, options: ['Normal', 'Congested'] },
                    { id: 'rightAmplitude', label: 'Amplitude', type: 'select' as const, options: ['Normal', 'Reduced', 'Increased'] },
                    { id: 'rightMucosalWave', label: 'Mucosal Wave', type: 'select' as const, options: ['Normal', 'Reduced', 'Absent'] }
                ]
            },
            {
                id: 'leftVocalFold',
                title: 'Left Vocal Fold',
                type: 'findings' as const,
                fields: [
                    { id: 'leftVocalFoldEdge', label: 'Vocal Fold Edge', type: 'select' as const, options: ['Smooth', 'Irregular'] },
                    { id: 'leftColor', label: 'Color', type: 'select' as const, options: ['Normal', 'Congested'] },
                    { id: 'leftAmplitude', label: 'Amplitude', type: 'select' as const, options: ['Normal', 'Reduced', 'Increased'] },
                    { id: 'leftMucosalWave', label: 'Mucosal Wave', type: 'select' as const, options: ['Normal', 'Reduced', 'Absent'] }
                ]
            },
            {
                id: 'glotticPattern',
                title: 'Glottic Closure Pattern',
                type: 'findings' as const,
                fields: [
                    { id: 'closurePattern', label: 'Pattern', type: 'multiselect' as const, options: ['Complete', 'Anterior gap', 'Posterior gap', 'Hourglass', 'Spindle', 'Irregular / Incomplete'] }
                ]
            },
            {
                id: 'conclusion',
                title: 'Impression & Plan',
                type: 'impression' as const,
                fields: [
                    { id: 'impression', label: 'Impression', type: 'textarea' as const, placeholder: 'Enter diagnostic impression...' },
                    { id: 'plan', label: 'Plan', type: 'multiselect' as const, options: ['Voice therapy', 'Medical management', 'Microlaryngeal surgery', 'Voice rest', 'Follow-up stroboscopy', 'Others'] }
                ]
            }
        ];
    }

    // Otoscopy/Otoendoscopy sections
    if (category === 'oto') {
        return [
            {
                id: 'indication',
                title: 'Indication',
                type: 'findings' as const,
                fields: [
                    { id: 'indication', label: 'Indication', type: 'multiselect' as const, options: ['Ear discharge', 'Hearing loss', 'Ear pain', 'Tinnitus', 'Vertigo', 'Ear block / fullness', 'Post-operative follow-up', 'Others'] }
                ]
            },
            {
                id: 'rightEar',
                title: 'Right Ear',
                type: 'findings' as const,
                fields: [
                    { id: 'eacRight', label: 'External Auditory Canal', type: 'select' as const, options: ['Normal', 'Edematous', 'Discharge'] },
                    { id: 'tmColorRight', label: 'TM Color', type: 'select' as const, options: ['Normal', 'Congested'] },
                    { id: 'tmPerforationRight', label: 'TM Perforation', type: 'select' as const, options: ['Nil', 'Central', 'Marginal', 'Attic'] }
                ]
            },
            {
                id: 'leftEar',
                title: 'Left Ear',
                type: 'findings' as const,
                fields: [
                    { id: 'eacLeft', label: 'External Auditory Canal', type: 'select' as const, options: ['Normal', 'Edematous', 'Discharge'] },
                    { id: 'tmColorLeft', label: 'TM Color', type: 'select' as const, options: ['Normal', 'Congested'] },
                    { id: 'tmPerforationLeft', label: 'TM Perforation', type: 'select' as const, options: ['Nil', 'Central', 'Marginal', 'Attic'] }
                ]
            },
            {
                id: 'conclusion',
                title: 'Impression & Plan',
                type: 'impression' as const,
                fields: [
                    { id: 'impression', label: 'Impression', type: 'textarea' as const, placeholder: 'Enter diagnostic impression...' },
                    { id: 'plan', label: 'Plan', type: 'textarea' as const, placeholder: 'Enter recommendations...' }
                ]
            }
        ];
    }

    // Bronchoscopy / FOB sections
    if (category === 'fob') {
        return [
            {
                id: 'indication',
                title: 'Indication',
                type: 'findings' as const,
                fields: [
                    { id: 'indication', label: 'Indication', type: 'multiselect' as const, options: ['Vocal cord palsy assessment', 'Tracheal / subglottic evaluation', 'Foreign body suspicion', 'Pre-operative airway assessment', 'Post-operative evaluation', 'Others'] }
                ]
            },
            {
                id: 'findings',
                title: 'Endoscopic Findings',
                type: 'findings' as const,
                fields: [
                    { id: 'nasalCavity', label: 'Nasal Cavity', type: 'select' as const, options: ['Normal', 'DNS', 'Turbinate hypertrophy'] },
                    { id: 'epiglottis', label: 'Epiglottis', type: 'select' as const, options: ['Normal', 'Edematous', 'Omega-shaped'] },
                    { id: 'vocalCordMobility', label: 'Vocal Cord Mobility', type: 'select' as const, options: ['Normal bilaterally', 'Right palsy', 'Left palsy', 'Restricted movement'] },
                    { id: 'subglottis', label: 'Subglottis', type: 'select' as const, options: ['Normal', 'Narrowed', 'Stenosis'] },
                    { id: 'trachea', label: 'Trachea', type: 'select' as const, options: ['Normal', 'Compression', 'Growth'] }
                ]
            },
            {
                id: 'conclusion',
                title: 'Impression & Plan',
                type: 'impression' as const,
                fields: [
                    { id: 'impression', label: 'Impression', type: 'textarea' as const, placeholder: 'Enter diagnostic impression...' },
                    { id: 'plan', label: 'Plan', type: 'textarea' as const, placeholder: 'Enter recommendations...' }
                ]
            }
        ];
    }

    // DNE / Nasal Endoscopy sections
    if (category === 'nasal' || category === 'pharyngoscopy') {
        return [
            {
                id: 'indication',
                title: 'Indication',
                type: 'findings' as const,
                fields: [
                    { id: 'indication', label: 'Indication for Endoscopy', type: 'multiselect' as const, options: ['Nasal obstruction', 'Post-nasal drip', 'Chronic rhinosinusitis', 'Epistaxis', 'Headache', 'Post-operative evaluation', 'Hyposmia/Anosmia', 'Recurrent sinusitis', 'Nasal mass', 'Foreign body', 'Septal evaluation'], placeholder: 'Select indications...' }
                ]
            },
            {
                id: 'nasal_cavity',
                title: 'Nasal Cavity Findings',
                type: 'bilateral' as const,
                fields: [
                    { id: 'septum', label: 'Septum', type: 'bilateral' as const, options: ['Central', 'DNS to Left', 'DNS to Right', 'Spur Left', 'Spur Right', 'Perforated'], showBoth: false },
                    { id: 'inferior_turbinate', label: 'Inferior Turbinate', type: 'bilateral' as const, options: ['Normal', 'Hypertrophied', 'Congested', 'Atrophic'], showBoth: true },
                    { id: 'middle_turbinate', label: 'Middle Turbinate', type: 'bilateral' as const, options: ['Normal', 'Paradoxical', 'Concha bullosa', 'Polypoidal'], showBoth: true }
                ]
            },
            {
                id: 'conclusion',
                title: 'Impression & Recommendations',
                type: 'impression' as const,
                fields: [
                    { id: 'impression', label: 'Impression', type: 'textarea' as const, placeholder: 'Enter diagnostic impression...' },
                    { id: 'plan', label: 'Advice/Plan', type: 'textarea' as const, placeholder: 'Enter recommendations and follow-up plan...' }
                ]
            }
        ];
    }

    // Default GI sections (colonoscopy, upper_gi, etc.)
    return [
        {
            id: 'indication',
            title: 'Indication',
            type: 'findings' as const,
            fields: [
                { id: 'indication', label: 'Indication', type: 'multiselect' as const, options: ['Screening', 'GI bleeding', 'Epigastric pain', 'Dyspepsia', 'Dysphagia', 'GERD', 'Weight loss', 'Anemia', 'Follow-up', 'Surveillance'] }
            ]
        },
        {
            id: 'findings',
            title: 'Findings',
            type: 'findings' as const,
            fields: [
                { id: 'esophagus', label: 'Esophagus', type: 'select' as const, options: ['Normal', 'Esophagitis Grade A', 'Esophagitis Grade B', 'Barrett\'s', 'Stricture', 'Mass'] },
                { id: 'gej', label: 'GE Junction', type: 'select' as const, options: ['Normal', 'Hiatal hernia', 'Irregular Z-line'] },
                { id: 'stomach', label: 'Stomach', type: 'select' as const, options: ['Normal', 'Antral gastritis', 'Pangastritis', 'Erosions', 'Ulcer', 'Mass', 'Polyp'] },
                { id: 'duodenum', label: 'Duodenum', type: 'select' as const, options: ['Normal D1 and D2', 'Duodenitis', 'Erosions', 'Ulcer', 'Mass'] }
            ]
        },
        {
            id: 'conclusion',
            title: 'Impression & Plan',
            type: 'impression' as const,
            fields: [
                { id: 'impression', label: 'Impression', type: 'textarea' as const, placeholder: 'Enter diagnostic impression...' },
                { id: 'plan', label: 'Plan', type: 'textarea' as const, placeholder: 'Enter recommendations...' }
            ]
        }
    ];
};

export default function ReportPage({
    patient,
    captures,
    onBack,
    onComplete,
    onGeneratePDF,
    hospital,
    doctor,
    procedureId
}: ReportPageProps) {
    // State
    const [isFinalized, setIsFinalized] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [galleryOpen, setGalleryOpen] = useState(false);
    const [referredBy, setReferredBy] = useState('');
    const [reportData, setReportData] = useState<Record<string, any>>({});
    const [procedureDate, setProcedureDate] = useState('');
    const [currentProcedureType, setCurrentProcedureType] = useState(patient.procedureType || '');

    // Get all available templates for dropdown
    const availableTemplates = getAllTemplates().map(t => ({
        id: t.id,
        name: t.name,
        shortName: t.shortName
    }));

    // Set date on client-side only
    useEffect(() => {
        setProcedureDate(new Date().toLocaleDateString('en-IN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        }));
    }, []);

    // Image state
    const imageOnlyCaptures = captures.filter(c => c.type !== 'video');
    const [selectedImages, setSelectedImages] = useState<string[]>(() => {
        const preSelected = imageOnlyCaptures.filter(c => c.selected).map(c => c.id);
        return preSelected.length > 0 ? preSelected : imageOnlyCaptures.slice(0, 4).map(c => c.id);
    });
    const [imageCaptions, setImageCaptions] = useState<Record<string, string>>(() => {
        const caps: Record<string, string> = {};
        captures.forEach(c => {
            if (c.findings?.location) caps[c.id] = c.findings.location;
        });
        return caps;
    });

    // DEBUG: Log procedureType to trace the issue
    useEffect(() => {
        console.log('🔍 [ReportPage] patient:', patient);
        console.log('🔍 [ReportPage] patient.procedureType:', patient.procedureType);
        console.log('🔍 [ReportPage] currentProcedureType:', currentProcedureType);
        console.log('🔍 [ReportPage] category:', getProcedureCategory(currentProcedureType || ''));
    }, [patient, currentProcedureType]);

    // Get sections based on current procedure type (not patient.procedureType)
    const sections = getReportSections(currentProcedureType || '');
    const isENT = isENTProcedure(currentProcedureType || '');
    const reportTitle = getReportTitle(currentProcedureType || '');

    // Handler: Template change
    const handleTemplateChange = async (newType: string) => {
        // Update local state first for instant UI feedback
        setCurrentProcedureType(newType);
        // Clear form data to avoid stale fields
        setReportData({});

        // Update in database if procedureId is available
        if (procedureId) {
            const result = await updateProcedureType(procedureId, newType);
            if (!result.success) {
                console.error('Failed to update procedure type:', result.error);
            }
        }
    };

    // Get selected captures in order (only images, not videos)
    const selectedCaptures = selectedImages
        .map(id => imageOnlyCaptures.find(c => c.id === id))
        .filter(Boolean) as typeof captures;

    // Handler: Field change
    const handleFieldChange = (fieldId: string, value: any) => {
        setReportData(prev => ({ ...prev, [fieldId]: value }));
    };

    // Handler: Auto-fill Normal Macro
    const handleNormalMacro = () => {
        const normalData: Record<string, any> = {};
        sections.forEach(section => {
            section.fields.forEach((field: any) => {
                if (field.type === 'bilateral') {
                    normalData[`${field.id}_right`] = field.options?.[0] || 'Normal';
                    if (field.showBoth !== false) {
                        normalData[`${field.id}_left`] = field.options?.[0] || 'Normal';
                    }
                } else if (field.type === 'select') {
                    normalData[field.id] = field.options?.[0] || 'Normal';
                } else if (field.type === 'multiselect') {
                    normalData[field.id] = [];
                }
            });
        });

        const category = getProcedureCategory(patient.procedureType || '');
        if (category === 'osa') {
            normalData.impression = 'Normal upper airway examination. No significant obstruction identified. Normal findings on awake nasopharyngolaryngoscopy.';
            normalData.plan = 'Conservative management advised. Continue weight reduction. Follow up as clinically indicated.';
        } else if (category === 'laryngoscopy') {
            normalData.impression = 'Normal laryngoscopic examination. Bilateral vocal cords are mobile with complete glottic closure. No lesions identified.';
            normalData.plan = 'Voice therapy if symptomatic. Follow up as clinically indicated.';
        } else if (category === 'oto') {
            normalData.impression = 'Normal bilateral otoscopy. Tympanic membranes intact with normal appearance.';
            normalData.plan = 'No active intervention required. Follow up as clinically indicated.';
        } else if (category === 'fob') {
            normalData.impression = 'Normal flexible fiber-optic bronchoscopy. No airway abnormality identified.';
            normalData.plan = 'Medical management. Follow up as clinically indicated.';
        } else if (category === 'nasal') {
            normalData.impression = 'Normal diagnostic nasal endoscopy. Bilateral nasal passages are patent with normal mucosa. Septum is central. Turbinates are normal.';
            normalData.plan = 'No active intervention required. Follow up as clinically indicated.';
        } else {
            normalData.impression = 'Normal upper GI endoscopy. Esophagus, GE junction, stomach, and duodenum appear normal.';
            normalData.plan = 'No specific follow-up required. Resume normal diet.';
        }
        setReportData(normalData);
    };

    const buildPDFData = () => {
        // Generate Dynamic Printable Sections
        const printableSections = sections
            .filter(section => section.id !== 'conclusion') // Exclude conclusion as it's handled in footer
            .map(section => {
                const filledFields = section.fields.map((field: any) => {
                    let value = reportData[field.id];
                    let displayValue = '';

                    // Format based on type
                    if (field.type === 'multiselect' && Array.isArray(value)) {
                        displayValue = formatMultiSelect(value);
                    } else if (field.type === 'bilateral') {
                        const r = reportData[`${field.id}_right`];
                        const l = reportData[`${field.id}_left`];
                        if (r || l) {
                            displayValue = `R: ${r || '—'} | L: ${l || '—'}`;
                        }
                    } else {
                        displayValue = value ? String(value) : '';
                    }

                    return { label: field.label, value: displayValue };
                }).filter(f => f.value && f.value !== 'undefined' && f.value !== 'null');

                return {
                    title: section.title,
                    items: filledFields
                };
            }).filter(s => s.items.length > 0);

        const formData: any = {
            header: {
                procedureDate: procedureDate || new Date().toLocaleDateString('en-IN'),
                endoscopist: doctor?.fullName || 'Endoscopist',
                patientMRN: patient.mrn || patient.id,
                ageSex: `${patient.age || '?'} / ${patient.gender || '?'}`,
                referredBy: referredBy,
                instrument: reportData.equipment || 'Endoscope'
            },
            footer: {
                impression: reportData.impression || '',
                recommendations: reportData.plan || '',
                icd10: [],
                followUp: '',
                pathologyRequest: false
            },
            type: isENT ? 'ENT' : 'GI',
            printableSections: printableSections // <--- NEW DYNAMIC DATA
        };

        return {
            patient: {
                name: patient.name,
                age: patient.age,
                gender: patient.gender,
                mrn: patient.mrn || patient.id,
                procedureType: patient.procedureType
            },
            formData: formData,
            selectedImages: selectedCaptures.map(c => ({
                url: c.url,
                caption: imageCaptions[c.id] || '',
                maskType: c.maskType
            })),
            hospital: hospital,
            doctor: doctor,
            procedureType: patient.procedureType
        };
    };

    // Handlers
    const handleSave = async () => {
        setIsSaving(true);
        try {
            await onGeneratePDF(buildPDFData(), 'save');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDownload = async () => {
        await onGeneratePDF(buildPDFData(), 'download');
    };

    const handleFinalize = async () => {
        setIsSaving(true);
        try {
            await onGeneratePDF(buildPDFData(), 'download');
            setIsFinalized(true);
        } finally {
            setIsSaving(false);
        }
    };

    const handleFinalReturn = () => {
        if (onComplete) onComplete();
        else if (onBack) onBack();
    };

    const handleGalleryConfirm = (newSelectedIds: string[], newCaptions: Record<string, string>) => {
        setSelectedImages(newSelectedIds);
        setImageCaptions(prev => ({ ...prev, ...newCaptions }));
    };

    // Render field based on type
    const renderField = (field: any) => {
        const value = reportData[field.id];

        if (field.type === 'select') {
            return (
                <div key={field.id} className="flex items-center gap-6 py-3 border-b border-slate-100 group">
                    <label className="w-40 text-sm font-semibold text-slate-500 uppercase tracking-tight group-hover:text-blue-600 transition-colors uppercase">{field.label}:</label>
                    <select
                        value={value || ''}
                        onChange={e => handleFieldChange(field.id, e.target.value)}
                        className="flex-1 bg-transparent border-none text-slate-800 font-semibold focus:ring-0 cursor-pointer hover:text-blue-600 transition-colors"
                    >
                        <option value="">Select option...</option>
                        {field.options?.map((opt: string) => (
                            <option key={opt} value={opt}>{opt}</option>
                        ))}
                    </select>
                </div>
            );
        }

        if (field.type === 'multiselect') {
            return (
                <div key={field.id} className="py-4 border-b border-slate-100">
                    <label className="block text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 leading-none">{field.label}:</label>
                    <div className="flex flex-wrap gap-1.5">
                        {field.options?.map((opt: string) => {
                            const isSelected = (value || []).includes(opt);
                            return (
                                <button
                                    key={opt}
                                    onClick={() => {
                                        const current = value || [];
                                        const updated = isSelected
                                            ? current.filter((v: string) => v !== opt)
                                            : [...current, opt];
                                        handleFieldChange(field.id, updated);
                                    }}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-full transition-all border ${isSelected
                                        ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-200 scale-105'
                                        : 'bg-white border-slate-200 text-slate-500 hover:border-blue-300 hover:bg-blue-50'
                                        }`}
                                >
                                    {opt}
                                </button>
                            );
                        })}
                    </div>
                </div>
            );
        }

        if (field.type === 'textarea') {
            return (
                <div key={field.id} className="py-6 border-b border-slate-100 last:border-0 group">
                    <label className="flex items-center gap-2 text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 group-hover:text-blue-600 transition-colors">
                        <Edit3 size={14} />
                        {field.label}
                    </label>
                    <textarea
                        value={value || ''}
                        onChange={e => handleFieldChange(field.id, e.target.value)}
                        placeholder={field.placeholder}
                        className="w-full bg-slate-50/50 border border-slate-100 rounded-2xl p-4 text-base font-medium text-slate-800 placeholder:text-slate-300 placeholder:italic focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all min-h-[140px] resize-none"
                    />
                </div>
            );
        }

        if (field.type === 'text') {
            return (
                <div key={field.id} className="flex items-center gap-6 py-3 border-b border-slate-100 group">
                    <label className="w-40 text-sm font-bold text-slate-400 uppercase tracking-tight group-hover:text-blue-600 transition-colors">{field.label}:</label>
                    <input
                        type="text"
                        value={value || ''}
                        onChange={e => handleFieldChange(field.id, e.target.value)}
                        placeholder={field.placeholder}
                        className="flex-1 bg-transparent border-none text-slate-800 font-bold focus:ring-0 placeholder:text-slate-200 hover:bg-slate-50 rounded px-2 -mx-2 transition-colors"
                    />
                </div>
            );
        }

        if (field.type === 'bilateral') {
            return (
                <div key={field.id} className="grid grid-cols-[160px_1fr_1fr] items-center gap-4 py-3 border-b border-slate-100 group">
                    <label className="text-sm font-bold text-slate-400 uppercase tracking-tight group-hover:text-blue-600 transition-colors">{field.label}:</label>
                    <select
                        value={reportData[`${field.id}_right`] || ''}
                        onChange={e => handleFieldChange(`${field.id}_right`, e.target.value)}
                        className="bg-transparent border-none text-blue-600 font-bold focus:ring-0 cursor-pointer hover:bg-blue-50 rounded px-2 transition-colors text-right"
                    >
                        <option value="">R: ...</option>
                        {field.options?.map((opt: string) => (
                            <option key={opt} value={opt}>R: {opt}</option>
                        ))}
                    </select>
                    {field.showBoth !== false && (
                        <select
                            value={reportData[`${field.id}_left`] || ''}
                            onChange={e => handleFieldChange(`${field.id}_left`, e.target.value)}
                            className="bg-transparent border-none text-indigo-600 font-bold focus:ring-0 cursor-pointer hover:bg-indigo-50 rounded px-2 transition-colors"
                        >
                            <option value="">L: ...</option>
                            {field.options?.map((opt: string) => (
                                <option key={opt} value={opt}>L: {opt}</option>
                            ))}
                        </select>
                    )}
                </div>
            );
        }

        return null;
    };

    // Finalized screen
    if (isFinalized) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center p-8">
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="bg-slate-50 border border-slate-100 rounded-[3rem] p-16 shadow-2xl text-center max-w-xl"
                >
                    <div className="w-24 h-24 bg-gradient-to-br from-emerald-400 to-green-600 rounded-full flex items-center justify-center mx-auto mb-8 shadow-lg shadow-emerald-200">
                        <Check size={48} className="text-white" />
                    </div>
                    <h2 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">Report Finalized!</h2>
                    <p className="text-slate-500 font-medium text-lg mb-10 px-8">The digital record has been successfully updated and your PDF is ready for sharing.</p>
                    <button
                        onClick={handleFinalReturn}
                        className="px-10 py-4 bg-slate-900 text-white rounded-2xl font-bold text-lg hover:bg-slate-800 transition-all hover:scale-105 active:scale-95 shadow-xl shadow-slate-200"
                    >
                        Return to Dashboard
                    </button>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-100/50">
            {/* Toolbar */}
            <SmartToolbar
                reportTitle={reportTitle}
                onBack={onBack}
                onNormalMacro={handleNormalMacro}
                onSave={handleSave}
                onDownload={handleDownload}
                onFinalize={handleFinalize}
                isSaving={isSaving}
                currentProcedureType={currentProcedureType}
                availableTemplates={availableTemplates}
                onTemplateChange={handleTemplateChange}
            />

            {/* Main Content: 70/30 Split */}
            <div className="flex pt-24 pb-12 items-start justify-center px-4 sm:px-8 xl:px-12 gap-8 max-w-[1600px] mx-auto">

                {/* 70% Column: The "Paper" Document */}
                <div className="flex-[7] min-w-0">
                    <motion.div
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        className="bg-white shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] rounded-lg overflow-hidden border border-slate-200 relative"
                    >
                        {/* 1. LETTERHEAD (Organization Data) */}
                        <div className="px-12 pt-12 pb-8 border-b-2 border-slate-900 flex justify-between items-start gap-8">
                            <div className="flex items-start gap-6">
                                {hospital?.logoPath ? (
                                    <img src={hospital.logoPath} alt="Logo" className="w-24 h-24 object-contain grayscale hover:grayscale-0 transition-all duration-500" />
                                ) : (
                                    <div className="w-20 h-20 bg-slate-900 rounded-2xl flex items-center justify-center text-white">
                                        <Building2 size={32} />
                                    </div>
                                )}
                                <div className="space-y-1">
                                    <h2 className="text-2xl font-black text-slate-900 leading-tight uppercase tracking-tight">{hospital?.name || "Endoscopy Medical Center"}</h2>
                                    <div className="flex flex-col gap-0.5 mt-1">
                                        <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-wider">
                                            <MapPin size={10} className="text-slate-300" />
                                            {hospital?.address || "Medical District, City Center"}
                                        </div>
                                        <div className="flex items-center gap-4 mt-1">
                                            <div className="flex items-center gap-2 text-slate-500 text-xs font-bold">
                                                <Phone size={10} className="text-slate-300" />
                                                {hospital?.mobile || "+91 00000 00000"}
                                            </div>
                                            <div className="flex items-center gap-2 text-slate-500 text-xs font-bold">
                                                <Mail size={10} className="text-slate-300" />
                                                {hospital?.email || "info@clinic.com"}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Doctor Seal / Specialty Area */}
                            <div className="text-right">
                                <div className="text-blue-600 font-black text-xl leading-none">{doctor?.fullName?.split(' ').pop()}</div>
                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">{doctor?.specialty || "Chief Specialist"}</div>
                                <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col items-end gap-1">
                                    <div className="flex items-center gap-2 text-slate-900 font-black text-sm uppercase">
                                        <Stethoscope size={14} className="text-blue-500" />
                                        Medical Report
                                    </div>
                                    <div className="text-[9px] text-slate-400 uppercase font-black tracking-widest">{reportTitle}</div>
                                </div>
                            </div>
                        </div>

                        {/* 2. PATIENT INFO BLOCK */}
                        <div className="px-12 py-8 bg-slate-50/50 grid grid-cols-4 gap-6 border-b border-slate-100">
                            <div className="space-y-1">
                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                    <User size={10} /> Name
                                </div>
                                <div className="text-sm font-black text-slate-800">{patient.name}</div>
                            </div>
                            <div className="space-y-1">
                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                    <Hash size={10} /> MRN / ID
                                </div>
                                <div className="text-sm font-bold text-slate-600 font-mono tracking-tighter">{patient.mrn || patient.id}</div>
                            </div>
                            <div className="space-y-1">
                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                    <Calendar size={10} /> Age / Sex
                                </div>
                                <div className="text-sm font-black text-slate-800">{patient.age || "?"}Y / {patient.gender || "?"}</div>
                            </div>
                            <div className="space-y-1">
                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                    <Info size={10} /> Date
                                </div>
                                <div className="text-sm font-bold text-slate-600">{procedureDate}</div>
                            </div>
                        </div>

                        {/* 3. DYNAMIC FORM SECTIONS */}
                        <div className="px-12 py-10 space-y-10">
                            {sections.map((section, sIdx) => (
                                <div key={section.id} className="relative">
                                    {/* Section Badge */}
                                    <div className="flex items-center gap-4 mb-6">
                                        <span className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-400 border border-slate-200">
                                            0{sIdx + 1}
                                        </span>
                                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-[0.1em]">
                                            {section.title}
                                        </h3>
                                        <div className="flex-1 h-px bg-slate-100" />
                                    </div>

                                    <div className="space-y-1">
                                        {section.fields.map(renderField)}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* 4. SIGNATURE AREA (Preview Only) */}
                        <div className="px-12 py-12 border-t border-slate-100 flex justify-end">
                            <div className="text-center min-w-[200px] group opacity-60 hover:opacity-100 transition-opacity">
                                <div className="h-16 border-b-2 border-slate-100 flex items-center justify-center italic text-slate-300 group-hover:text-blue-600 transition-colors">
                                    {doctor?.fullName?.split(' ').pop()} Signed digitally
                                </div>
                                <div className="mt-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Authorized Signature</div>
                                <div className="text-xs font-bold text-slate-800">{doctor?.fullName}</div>
                            </div>
                        </div>
                    </motion.div>
                </div>

                {/* 30% Column: Media Palette (Sticky) */}
                <div className="flex-[3] sticky top-24 h-[calc(100vh-120px)] flex flex-col">
                    <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden flex flex-col h-full">
                        <ImageColumn
                            images={selectedCaptures as any}
                            captions={imageCaptions}
                            onCaptionChange={(id, caption) => setImageCaptions(prev => ({ ...prev, [id]: caption }))}
                            onAddImage={() => setGalleryOpen(true)}
                        />
                    </div>
                </div>
            </div>

            {/* Gallery Picker Modal */}
            <AnimatePresence>
                {galleryOpen && (
                    <ImageGalleryPicker
                        isOpen={galleryOpen}
                        allCaptures={imageOnlyCaptures}
                        selectedIds={selectedImages}
                        captions={imageCaptions}
                        onConfirm={handleGalleryConfirm}
                        onClose={() => setGalleryOpen(false)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
