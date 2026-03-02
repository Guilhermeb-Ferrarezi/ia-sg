
import { useEffect, useState } from "react";
import type { Toast } from "../types/dashboard";

type ToastContainerProps = {
    toasts: Toast[];
    removeToast: (id: string) => void;
};

export default function ToastContainer({ toasts, removeToast }: ToastContainerProps) {
    return (
        <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 w-full max-w-xs pointer-events-none">
            {toasts.map((toast) => (
                <ToastItem key={toast.id} toast={toast} onRemove={() => removeToast(toast.id)} />
            ))}
        </div>
    );
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: () => void }) {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        setIsVisible(true);
        const timer = setTimeout(() => {
            setIsVisible(false);
            setTimeout(onRemove, 300); // Wait for fade out animation
        }, 5000);
        return () => clearTimeout(timer);
    }, [onRemove]);

    const bgClass =
        toast.type === "success"
            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
            : toast.type === "error"
                ? "bg-rose-500/10 border-rose-500/20 text-rose-300"
                : toast.type === "loading"
                    ? "bg-violet-500/10 border-violet-500/20 text-violet-300 animate-pulse"
                    : "bg-cyan-500/10 border-cyan-500/20 text-cyan-300";

    const icon =
        toast.type === "success" ? (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
        ) : toast.type === "error" ? (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        ) : toast.type === "loading" ? (
            <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
        ) : (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        );

    return (
        <div
            className={`pointer-events-auto flex items-center gap-3 rounded-lg border p-4 shadow-xl transition-all duration-300 ${bgClass} ${isVisible ? "translate-x-0 opacity-100" : "translate-x-8 opacity-0"
                }`}
        >
            <div className="flex-shrink-0">{icon}</div>
            <p className="text-sm font-medium">{toast.message}</p>
            <button
                onClick={() => {
                    setIsVisible(false);
                    setTimeout(onRemove, 300);
                }}
                className="ml-auto flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity"
            >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
    );
}
