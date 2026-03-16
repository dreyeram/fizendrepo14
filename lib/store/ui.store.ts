/**
 * UI Store - Zustand
 * 
 * Manages UI preferences and transient state.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Notification type
 */
export interface Notification {
    id: string;
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message?: string;
    duration?: number;
    timestamp: number;
}

/**
 * Modal state
 */
export interface ModalState {
    isOpen: boolean;
    type: string | null;
    data: Record<string, unknown>;
}

/**
 * Confirmation state
 */
export interface ConfirmationState {
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'primary' | 'danger' | 'success';
    onConfirm: () => void;
    onCancel: () => void;
}

/**
 * UI Store state
 */
interface UIState {
    // Sidebar
    sidebarOpen: boolean;
    sidebarWidth: number;

    // Theme
    theme: 'light' | 'dark' | 'system';

    // Notifications
    notifications: Notification[];

    // Modal
    modal: ModalState;

    // Loading overlay
    isGlobalLoading: boolean;
    loadingMessage: string | null;

    // Confirmation
    confirmation: ConfirmationState;

    // Actions
    toggleSidebar: () => void;
    setSidebarOpen: (open: boolean) => void;
    setSidebarWidth: (width: number) => void;

    setTheme: (theme: 'light' | 'dark' | 'system') => void;

    addNotification: (notification: Omit<Notification, 'id' | 'timestamp'>) => void;
    removeNotification: (id: string) => void;
    clearNotifications: () => void;

    openModal: (type: string, data?: Record<string, unknown>) => void;
    closeModal: () => void;

    // Confirmation actions
    setConfirmation: (confirmation: Omit<ConfirmationState, 'isOpen'>) => void;
    clearConfirmation: () => void;

    setGlobalLoading: (loading: boolean, message?: string) => void;
}

/**
 * Generate unique notification ID
 */
function generateNotificationId(): string {
    return `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
}

/**
 * UI Store
 */
export const useUIStore = create<UIState>()(
    persist(
        (set, get) => ({
            // Initial state
            sidebarOpen: true,
            sidebarWidth: 280,
            theme: 'dark',
            notifications: [],
            modal: { isOpen: false, type: null, data: {} },
            confirmation: {
                isOpen: false,
                title: '',
                message: '',
                onConfirm: () => {},
                onCancel: () => {}
            },
            isGlobalLoading: false,
            loadingMessage: null,

            // Sidebar actions
            toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
            setSidebarOpen: (open) => set({ sidebarOpen: open }),
            setSidebarWidth: (width) => set({ sidebarWidth: Math.max(200, Math.min(400, width)) }),

            // Theme actions
            setTheme: (theme) => set({ theme }),

            // Notification actions
            addNotification: (notification) => {
                const id = generateNotificationId();
                const fullNotification: Notification = {
                    ...notification,
                    id,
                    timestamp: Date.now(),
                    duration: notification.duration ?? 5000,
                };

                set((state) => ({
                    notifications: [...state.notifications, fullNotification],
                }));

                // Auto-remove after duration
                if (fullNotification.duration && fullNotification.duration > 0) {
                    setTimeout(() => {
                        get().removeNotification(id);
                    }, fullNotification.duration);
                }
            },

            removeNotification: (id) => set((state) => ({
                notifications: state.notifications.filter((n) => n.id !== id),
            })),

            clearNotifications: () => set({ notifications: [] }),

            // Modal actions
            openModal: (type, data = {}) => set({
                modal: { isOpen: true, type, data },
            }),

            closeModal: () => set({
                modal: { isOpen: false, type: null, data: {} },
            }),

            // Confirmation actions
            setConfirmation: (confirmation) => set({
                confirmation: { ...confirmation, isOpen: true },
            }),

            clearConfirmation: () => set((state) => ({
                confirmation: { ...state.confirmation, isOpen: false },
            })),

            // Loading actions
            setGlobalLoading: (loading, message) => set({
                isGlobalLoading: loading,
                loadingMessage: message ?? null,
            }),
        }),
        {
            name: 'endoscopy-ui',
            storage: createJSONStorage(() => localStorage),
            // Only persist preferences, not transient state
            partialize: (state) => ({
                sidebarOpen: state.sidebarOpen,
                sidebarWidth: state.sidebarWidth,
                theme: state.theme,
            }),
        }
    )
);

/**
 * Convenience hook for showing notifications
 */
export function useNotify() {
    const addNotification = useUIStore((state) => state.addNotification);

    return {
        success: (title: string, message?: string) =>
            addNotification({ type: 'success', title, message }),
        error: (title: string, message?: string) =>
            addNotification({ type: 'error', title, message, duration: 8000 }),
        warning: (title: string, message?: string) =>
            addNotification({ type: 'warning', title, message }),
        info: (title: string, message?: string) =>
            addNotification({ type: 'info', title, message }),
    };
}

/**
 * Hook to check if a specific modal is open
 */
export function useIsModalOpen(type: string): boolean {
    return useUIStore((state) => state.modal.isOpen && state.modal.type === type);
}

/**
 * Hook to get modal data
 */
export function useModalData<T extends Record<string, unknown>>(): T {
    return useUIStore((state) => state.modal.data as T);
}
