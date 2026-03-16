"use client";

import { useUIStore } from "@/lib/store/ui.store";

interface ConfirmOptions {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'primary' | 'danger' | 'success';
}

/**
 * Custom hook to show a branded confirmation dialog instead of window.confirm
 */
export function useConfirm() {
    const setConfirmation = useUIStore((state) => state.setConfirmation);
    const clearConfirmation = useUIStore((state) => state.clearConfirmation);

    const confirm = (options: ConfirmOptions): Promise<boolean> => {
        return new Promise((resolve) => {
            setConfirmation({
                title: options.title,
                message: options.message,
                confirmLabel: options.confirmLabel || "Confirm",
                cancelLabel: options.cancelLabel || "Cancel",
                variant: options.variant || "primary",
                onConfirm: () => {
                    clearConfirmation();
                    resolve(true);
                },
                onCancel: () => {
                    clearConfirmation();
                    resolve(false);
                }
            });
        });
    };

    return confirm;
}
