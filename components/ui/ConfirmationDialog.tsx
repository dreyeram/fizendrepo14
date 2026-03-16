"use client";

import React from "react";
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogDescription, 
    DialogFooter 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/lib/store/ui.store";
import { AlertTriangle, Info, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Global confirmation dialog component
 * To be placed in the root layout or a global providers wrapper
 */
export function ConfirmationDialog() {
    const { isOpen, title, message, confirmLabel, cancelLabel, variant, onConfirm, onCancel } = useUIStore((state) => state.confirmation);
    const clearConfirmation = useUIStore((state) => state.clearConfirmation);

    const handleConfirm = () => {
        onConfirm();
    };

    const handleCancel = () => {
        onCancel();
    };

    const getIcon = () => {
        switch (variant) {
            case 'danger':
                return <AlertTriangle className="w-10 h-10 text-rose-500 mb-2" />;
            case 'success':
                return <CheckCircle2 className="w-10 h-10 text-emerald-500 mb-2" />;
            default:
                return <Info className="w-10 h-10 text-blue-500 mb-2" />;
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleCancel(); }}>
            <DialogContent showCloseButton={false} className="sm:max-w-md bg-slate-900 border-slate-800 shadow-2xl overflow-hidden p-0 rounded-2xl">
                <div className="p-8 flex flex-col items-center text-center">
                    {getIcon()}
                    <DialogHeader className="p-0 border-0 items-center">
                        <DialogTitle className="text-xl font-bold text-white mb-2">{title}</DialogTitle>
                        <DialogDescription className="text-slate-400 text-sm leading-relaxed">
                            {message}
                        </DialogDescription>
                    </DialogHeader>
                </div>
                
                <DialogFooter className="bg-slate-950/50 p-6 flex flex-row items-center justify-center gap-3 border-t border-slate-800/50">
                    <Button
                        variant="ghost"
                        onClick={handleCancel}
                        className="flex-1 text-slate-400 hover:text-white hover:bg-white/5 font-semibold py-2.5 rounded-xl border border-white/5"
                    >
                        {cancelLabel || "Cancel"}
                    </Button>
                    <Button
                        variant={variant === 'danger' ? 'danger' : variant === 'success' ? 'success' : 'primary'}
                        onClick={handleConfirm}
                        className={cn(
                            "flex-1 font-bold py-2.5 rounded-xl shadow-lg",
                            variant === 'primary' && "bg-blue-600 hover:bg-blue-700 shadow-blue-500/20"
                        )}
                    >
                        {confirmLabel || "Confirm"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
