import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ProcedureSegment {
    id: string; // The database procedure table ID
    index: number; // 1, 2, 3...
    type?: string;
    status: 'draft' | 'saved' | 'completed';
    createdAt: Date;
    thumbnailUrl?: string; // For the segment bar snapshot
}

interface SessionState {
    activePatientId: string | null;
    segments: ProcedureSegment[];
    captures: any[];
    activeSegmentIndex: number; // The currently selected index (1-based)
    sessionTimer: number;

    // Actions
    startSession: (patientId: string) => void;
    tickSessionTimer: () => void;
    addSegment: (segment: ProcedureSegment) => void;
    updateSegment: (index: number, updates: Partial<ProcedureSegment>) => void;
    setActiveSegment: (index: number) => void;
    removeSegment: (index: number) => void;
    updateSegmentThumbnail: (id: string, url: string) => void;
    addCapture: (capture: any) => void;
    setCaptures: (captures: any[] | ((prev: any[]) => any[])) => void;
    endSession: () => void;

    // Recovery
    hydrateSession: (patientId: string, savedSegments: ProcedureSegment[]) => void;
}

export const useSessionStore = create<SessionState>()(
    persist(
        (set, get) => ({
            activePatientId: null,
            segments: [],
            captures: [],
            activeSegmentIndex: 1,
            sessionTimer: 0,

            startSession: (patientId) => set({
                activePatientId: patientId,
                segments: [],
                captures: [],
                activeSegmentIndex: 1,
                sessionTimer: 0
            }),

            tickSessionTimer: () => set((state) => ({ sessionTimer: state.sessionTimer + 1 })),

            addSegment: (segment) => set((state) => {
                // Safeguard: Ensure we don't add a duplicate index
                const exists = state.segments.some(s => s.index === segment.index);
                if (exists) {
                    console.warn(`[SessionStore] Segment with index ${segment.index} already exists. Incrementing.`);
                    const maxIndex = Math.max(...state.segments.map(s => s.index), 0);
                    segment.index = maxIndex + 1;
                }
                return {
                    segments: [...state.segments, segment],
                    activeSegmentIndex: segment.index
                };
            }),

            updateSegment: (index, updates) => set((state) => ({
                segments: state.segments.map(s => s.index === index ? { ...s, ...updates } : s)
            })),

            setActiveSegment: (index) => set({ activeSegmentIndex: index }),
            
            removeSegment: (index) => set((state) => {
                const newSegments = state.segments.filter(s => s.index !== index);
                const newCaptures = state.captures.filter(c => c.segmentIndex !== index);
                let newActiveIndex = state.activeSegmentIndex;
                
                // If we deleted the active segment, pick the last one or 1
                if (state.activeSegmentIndex === index) {
                    newActiveIndex = newSegments.length > 0 
                        ? newSegments[newSegments.length - 1].index 
                        : 1;
                }
                
                return {
                    segments: newSegments,
                    captures: newCaptures,
                    activeSegmentIndex: newActiveIndex
                };
            }),

            updateSegmentThumbnail: (id, url) => set((state) => ({
                segments: state.segments.map(s => s.id === id ? { ...s, thumbnailUrl: url } : s)
            })),

            addCapture: (capture) => set((state) => ({
                captures: [capture, ...state.captures]
            })),

            setCaptures: (captures) => set((state) => ({
                captures: typeof captures === 'function' ? (captures as any)(state.captures) : captures
            })),

            endSession: () => set({
                activePatientId: null,
                segments: [],
                captures: [],
                activeSegmentIndex: 1,
                sessionTimer: 0
            }),

            hydrateSession: (patientId, savedSegments) => {
                // Deduplicate indices if they somehow got corrupted in storage
                const seenIndices = new Set<number>();
                const cleanSegments = savedSegments.map(s => {
                    let idx = s.index;
                    while (seenIndices.has(idx)) {
                        idx++;
                    }
                    seenIndices.add(idx);
                    return { ...s, index: idx };
                });
                
                set({
                    activePatientId: patientId,
                    segments: cleanSegments,
                    activeSegmentIndex: cleanSegments.length > 0 ? cleanSegments[cleanSegments.length - 1].index : 1
                });
            }
        }),
        {
            name: 'session-storage',
            partialize: (state) => ({
                activePatientId: state.activePatientId,
                // capturing simplified segments for persistence
                segments: state.segments,
                activeSegmentIndex: state.activeSegmentIndex,
                sessionTimer: state.sessionTimer
            })
        }
    )
);
