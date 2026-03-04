import { useCallback, useEffect, useRef, useState } from "react";
import { resolveWebSocketUrl } from "../lib/ws";

const NOTIFICATION_DURATION_MS = 5000; // 5 seconds

type NotificationItem = {
    id: string;
    contactName: string;
    message: string;
    timestamp: string;
    createdAt: number;
    visible: boolean;
};

type IncomingPayload = {
    waId?: string;
    contactName?: string;
    body?: string;
    direction?: string;
    message?: {
        id?: number | string;
        body?: string;
        direction?: string;
        createdAt?: string;
    };
};

function playNotificationSound() {
    try {
        const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        if (ctx.state === "suspended") {
            void ctx.resume().catch(() => undefined);
        }

        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.type = "sine";
        osc1.frequency.setValueAtTime(880, ctx.currentTime);
        osc1.frequency.setValueAtTime(660, ctx.currentTime + 0.08);
        gain1.gain.setValueAtTime(0.3, ctx.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc1.start(ctx.currentTime);
        osc1.stop(ctx.currentTime + 0.15);

        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(1320, ctx.currentTime + 0.12);
        osc2.frequency.setValueAtTime(1100, ctx.currentTime + 0.2);
        gain2.gain.setValueAtTime(0, ctx.currentTime);
        gain2.gain.setValueAtTime(0.25, ctx.currentTime + 0.12);
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
        osc2.start(ctx.currentTime + 0.12);
        osc2.stop(ctx.currentTime + 0.35);

        setTimeout(() => ctx.close(), 500);
    } catch {
        // Audio not supported
    }
}

function useRelativeTime(createdAt: number) {
    const [, setTick] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => setTick((t) => t + 1), 1000);
        return () => clearInterval(interval);
    }, []);

    const diff = Math.floor((Date.now() - createdAt) / 1000);
    if (diff < 5) return "agora";
    if (diff < 60) return `há ${diff}s`;
    if (diff < 3600) return `há ${Math.floor(diff / 60)}min`;
    return `há ${Math.floor(diff / 3600)}h`;
}

function NotificationCard({
    notif,
    onDismiss
}: {
    notif: NotificationItem;
    onDismiss: () => void;
}) {
    const relativeTime = useRelativeTime(notif.createdAt);
    const [progress, setProgress] = useState(100);
    const [paused, setPaused] = useState(false);
    const startRef = useRef(Date.now());
    const remainingRef = useRef(NOTIFICATION_DURATION_MS);

    useEffect(() => {
        if (paused) return;

        startRef.current = Date.now();
        const totalRemaining = remainingRef.current;

        const interval = setInterval(() => {
            const elapsed = Date.now() - startRef.current;
            const newRemaining = totalRemaining - elapsed;
            const pct = Math.max(0, (newRemaining / NOTIFICATION_DURATION_MS) * 100);
            setProgress(pct);

            if (newRemaining <= 0) {
                clearInterval(interval);
                onDismiss();
            }
        }, 50);

        return () => {
            clearInterval(interval);
            remainingRef.current = Math.max(0, totalRemaining - (Date.now() - startRef.current));
        };
    }, [paused, onDismiss]);

    return (
        <div
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            className={`pointer-events-auto relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-slate-900/95 backdrop-blur-xl shadow-2xl shadow-emerald-500/5 transition-all duration-300 ${notif.visible
                ? "translate-x-0 opacity-100 scale-100"
                : "translate-x-12 opacity-0 scale-95"
                }`}
        >
            <div className="flex items-start gap-3 p-4">
                {/* WhatsApp Icon */}
                <div className="shrink-0 h-10 w-10 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                    <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.414 0 .018 5.393 0 12.028c0 2.119.554 4.187 1.61 6.006L0 24l6.117-1.605a11.803 11.803 0 005.925 1.586h.005c6.632 0 12.028-5.396 12.033-12.03a11.751 11.751 0 00-3.489-8.452z" />
                    </svg>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-bold text-emerald-400 truncate">
                            {notif.contactName}
                        </span>
                        <span className="text-[10px] text-slate-500 font-medium ml-2 shrink-0">
                            {relativeTime}
                        </span>
                    </div>
                    <p className="text-sm text-slate-300 leading-snug line-clamp-2">
                        {notif.message}
                    </p>
                </div>

                {/* Close */}
                <button
                    onClick={onDismiss}
                    className="shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-all"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* Progress Bar */}
            <div className="h-[3px] bg-slate-800/50 w-full">
                <div
                    className="h-full bg-emerald-500/60 transition-none"
                    style={{ width: `${progress}%` }}
                />
            </div>
        </div>
    );
}

function parseIncomingPayload(raw: unknown): {
    dedupeKey: string;
    contactName: string;
    body: string;
} | null {
    if (typeof raw !== "object" || raw === null) return null;
    const data = raw as IncomingPayload;

    const waId = typeof data.waId === "string" ? data.waId : "";
    const body = data.body || data.message?.body || "";
    const direction = (data.direction || data.message?.direction || "").toLowerCase();
    if (!body) return null;
    if (direction === "out") return null;

    const messageIdRaw = data.message?.id;
    const messageId = Number(messageIdRaw);
    const contactName = data.contactName || waId || "Contato";
    const fallbackKey = `${waId}:${body}:${data.message?.createdAt || ""}`;
    const dedupeKey =
        Number.isInteger(messageId) && messageId > 0
            ? `${waId}:${messageId}`
            : fallbackKey;

    return {
        dedupeKey,
        contactName,
        body
    };
}

export default function MessageNotifications() {
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const seenKeysRef = useRef<Set<string>>(new Set());
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const notify = useCallback((raw: unknown) => {
        const parsed = parseIncomingPayload(raw);
        if (!parsed) return;

        if (seenKeysRef.current.has(parsed.dedupeKey)) return;
        seenKeysRef.current.add(parsed.dedupeKey);
        if (seenKeysRef.current.size > 500) {
            const oldest = seenKeysRef.current.values().next().value as string | undefined;
            if (oldest) seenKeysRef.current.delete(oldest);
        }

        const newNotif: NotificationItem = {
            id: Math.random().toString(36).substring(2, 9),
            contactName: parsed.contactName,
            message: parsed.body,
            timestamp: new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit"
            }),
            createdAt: Date.now(),
            visible: true
        };

        setNotifications((prev) => [newNotif, ...prev].slice(0, 8));
        playNotificationSound();
    }, []);

    useEffect(() => {
        const handleNewMessage = (event: Event) => {
            const customEvent = event as CustomEvent<unknown>;
            notify(customEvent.detail);
        };

        window.addEventListener("ws-new-message", handleNewMessage);
        return () => window.removeEventListener("ws-new-message", handleNewMessage);
    }, [notify]);

    useEffect(() => {
        function connect() {
            const ws = new WebSocket(resolveWebSocketUrl());

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(String(event.data));
                    if (data?.type === "new_message") {
                        notify(data);
                    }
                } catch {
                    // ignore malformed messages
                }
            };

            ws.onclose = () => {
                reconnectRef.current = setTimeout(connect, 4000);
            };

            ws.onerror = () => ws.close();
            wsRef.current = ws;
        }

        connect();

        return () => {
            if (reconnectRef.current) clearTimeout(reconnectRef.current);
            if (wsRef.current) {
                wsRef.current.onclose = null;
                wsRef.current.close();
            }
        };
    }, [notify]);

    const dismissNotification = useCallback((id: string) => {
        setNotifications((prev) =>
            prev.map((n) => (n.id === id ? { ...n, visible: false } : n))
        );
        setTimeout(() => {
            setNotifications((prev) => prev.filter((n) => n.id !== id));
        }, 300);
    }, []);

    const dismissAll = () => {
        setNotifications((prev) => prev.map((n) => ({ ...n, visible: false })));
        setTimeout(() => setNotifications([]), 300);
    };

    return (
        <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 w-full max-w-sm pointer-events-none">
            {notifications.length > 1 && (
                <div className="pointer-events-auto flex justify-end">
                    <button
                        onClick={dismissAll}
                        className="text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-200 bg-slate-900/90 border border-slate-700 px-3 py-1.5 rounded-lg backdrop-blur-sm transition-all hover:bg-slate-800"
                    >
                        Limpar todas ({notifications.length})
                    </button>
                </div>
            )}
            {notifications.map((notif) => (
                <NotificationCard
                    key={notif.id}
                    notif={notif}
                    onDismiss={() => dismissNotification(notif.id)}
                />
            ))}
        </div>
    );
}
