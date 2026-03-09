import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ScopeGeometry {
    x: number;      // Normalized center X (0.0 - 1.0) of VIDEO render rect
    y: number;      // Normalized center Y (0.0 - 1.0) of VIDEO render rect
    width: number;  // For circle/square: fraction of min(renderW, renderH). For rect: fraction of renderW
    height: number; // For rect: fraction of renderH. Ignored for circle/square.
}

export interface CustomScope {
    id: string;
    name: string;
    viewLabel?: string;
    shape: 'circle' | 'square';
    isDefault: boolean;
    createdAt: number;
    geometry: ScopeGeometry;
}

interface ScopeState {
    scopes: CustomScope[];
    activeScopeId: string | null;

    /**
     * Feed pan offset (transient — not stored).
     * Values in % of the video's rendered width/height.
     * e.g. panX = 5 shifts video 5% to the right.
     */
    panX: number;
    panY: number;

    /** Drawing mode shape (transient) */
    drawingShape: 'circle' | 'square' | null;

    /** Drawing mode geometry (transient) */
    drawnGeometry: ScopeGeometry | null;

    // Actions
    addScope: (scope: Omit<CustomScope, 'id' | 'createdAt'>) => void;
    updateScope: (id: string, updates: Partial<Omit<CustomScope, 'id' | 'createdAt'>>) => void;
    removeScope: (id: string) => void;
    setActiveScopeId: (id: string | null) => void;
    setDefaultScope: (id: string) => void;

    // Transient UI
    setDrawingShape: (shape: 'circle' | 'square' | null) => void;
    setDrawnGeometry: (geo: ScopeGeometry | null) => void;
    setPanOffset: (x: number, y: number) => void;
    resetPan: () => void;

    // Persistent Zoom
    mainZoom: number;
    setMainZoom: (zoom: number | ((prev: number) => number)) => void;
}

export const useScopeStore = create<ScopeState>()(
    persist(
        (set) => ({
            scopes: [],
            activeScopeId: null,
            drawingShape: null,
            drawnGeometry: null,
            panX: 0,
            panY: 0,

            addScope: (scopeData) => set((state) => {
                const newScope: CustomScope = {
                    ...scopeData,
                    id: `scope-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    createdAt: Date.now(),
                };
                const updatedScopes = [...state.scopes, newScope];
                if (updatedScopes.length === 1 || newScope.isDefault) {
                    updatedScopes.forEach(s => s.isDefault = (s.id === newScope.id));
                }
                return { scopes: updatedScopes, activeScopeId: state.activeScopeId || newScope.id };
            }),

            updateScope: (id, updates) => set((state) => {
                const updatedScopes = state.scopes.map(s =>
                    s.id === id ? { ...s, ...updates } : s
                );
                if (updates.isDefault) {
                    updatedScopes.forEach(s => s.isDefault = (s.id === id));
                }
                return { scopes: updatedScopes };
            }),

            removeScope: (id) => set((state) => {
                const filteredScopes = state.scopes.filter(s => s.id !== id);
                let newActiveScopeId = state.activeScopeId;
                if (newActiveScopeId === id) {
                    const defaultScope = filteredScopes.find(s => s.isDefault);
                    newActiveScopeId = defaultScope ? defaultScope.id : (filteredScopes[0]?.id || null);
                }
                if (filteredScopes.length > 0 && !filteredScopes.some(s => s.isDefault)) {
                    filteredScopes[0].isDefault = true;
                }
                return { scopes: filteredScopes, activeScopeId: newActiveScopeId, panX: 0, panY: 0 };
            }),

            setActiveScopeId: (id) => set({ activeScopeId: id, panX: 0, panY: 0 }),

            setDefaultScope: (id) => set((state) => ({
                scopes: state.scopes.map(s => ({ ...s, isDefault: s.id === id }))
            })),

            setDrawingShape: (shape) => set({ drawingShape: shape }),
            setDrawnGeometry: (geo) => set({ drawnGeometry: geo }),
            setPanOffset: (x, y) => set({ panX: x, panY: y }),
            resetPan: () => set({ panX: 0, panY: 0 }),

            mainZoom: 1,
            setMainZoom: (zoom) => set((state) => ({
                mainZoom: typeof zoom === 'function' ? (zoom as any)(state.mainZoom) : zoom
            })),
        }),
        {
            name: 'endoscopy-custom-scopes-storage',
            partialize: (state) => ({
                scopes: state.scopes,
                activeScopeId: state.activeScopeId,
                mainZoom: state.mainZoom,
                // panX/panY are transient — NOT persisted
            }),
        }
    )
);
