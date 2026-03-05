import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/apiFetch";
import type { AnalyticsOverview, MessagesPerDay, TopContact } from "../types/dashboard";

export default function AnalyticsSection({ active }: { active: boolean }) {
    const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
    const [messagesPerDay, setMessagesPerDay] = useState<MessagesPerDay[]>([]);
    const [topContacts, setTopContacts] = useState<TopContact[]>([]);
    const [days, setDays] = useState(14);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [ov, mpd, tc] = await Promise.all([
                apiFetch<AnalyticsOverview>("/analytics/overview"),
                apiFetch<{ data: MessagesPerDay[] }>(`/analytics/messages-per-day?days=${days}`),
                apiFetch<{ data: TopContact[] }>("/analytics/top-contacts")
            ]);
            setOverview(ov);
            setMessagesPerDay(mpd.data);
            setTopContacts(tc.data);
        } catch (err) {
            console.error("Analytics load error:", err);
        } finally {
            setLoading(false);
        }
    }, [days]);

    useEffect(() => {
        if (active) load();
    }, [active, load]);

    useEffect(() => {
        const handleRealtimeUpdate = () => {
            if (!active) return;
            void load();
        };

        window.addEventListener("ws-analytics-updated", handleRealtimeUpdate);
        return () => window.removeEventListener("ws-analytics-updated", handleRealtimeUpdate);
    }, [active, load]);

    if (!active) return null;

    const maxTotal = Math.max(1, ...messagesPerDay.map((d) => d.total));

    const formatResponseTime = (seconds: number) => {
        if (seconds < 60) return `${seconds}s`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}min`;
        return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}min`;
    };

    return (
        <section className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-violet-500 shadow-lg shadow-violet-500/30 text-white">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-white tracking-tight">Analytics</h2>
                        <p className="text-xs text-slate-500 mt-0.5">Visão geral do desempenho</p>
                    </div>
                </div>
                <button
                    onClick={() => void load()}
                    disabled={loading}
                    className="flex items-center gap-2 rounded-xl border border-violet-500/20 bg-violet-500/5 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-violet-400 hover:bg-violet-500/10 transition-all disabled:opacity-50"
                >
                    <svg className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {loading ? "Carregando..." : "Atualizar"}
                </button>
            </div>

            {loading && !overview ? (
                <div className="flex h-64 items-center justify-center">
                    <svg className="animate-spin h-8 w-8 text-violet-500" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                </div>
            ) : (
                <>
                    {/* KPI Cards */}
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                        {[
                            { label: "Total Contatos", value: overview?.totalContacts ?? 0, color: "text-cyan-400" },
                            { label: "Total Mensagens", value: overview?.totalMessages ?? 0, color: "text-violet-400" },
                            { label: "Hoje", value: overview?.todayMessages ?? 0, color: "text-emerald-400" },
                            { label: "Últimos 7 dias", value: overview?.weekMessages ?? 0, color: "text-amber-400" },
                            { label: "Tempo Médio Resposta", value: formatResponseTime(overview?.avgResponseSeconds ?? 0), color: "text-rose-400" }
                        ].map((card) => (
                            <div key={card.label} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 shadow-sm">
                                <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">{card.label}</span>
                                <span className={`block text-2xl font-black mt-2 ${card.color}`}>{card.value}</span>
                            </div>
                        ))}
                    </div>

                    {/* Chart */}
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-sm font-bold uppercase tracking-widest text-slate-300">Mensagens por dia</h3>
                            <div className="flex items-center gap-2">
                                {[7, 14, 30].map((d) => (
                                    <button
                                        key={d}
                                        onClick={() => setDays(d)}
                                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest border transition-all ${days === d
                                            ? "text-violet-400 bg-violet-500/10 border-violet-500/30 ring-1 ring-violet-500/50"
                                            : "text-slate-500 border-transparent hover:bg-slate-800/50"
                                            }`}
                                    >
                                        {d}d
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex items-end gap-1 h-48">
                            {messagesPerDay.map((day) => (
                                <div key={day.date} className="h-full flex-1 flex flex-col items-center justify-end gap-1 group relative">
                                    {/* Tooltip */}
                                    <div className="absolute -top-14 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                        <div className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 shadow-xl text-center whitespace-nowrap">
                                            <div className="text-[10px] font-bold text-slate-400">{day.date}</div>
                                            <div className="text-xs font-bold">
                                                <span className="text-cyan-400">{day.inbound}↓</span>
                                                {" "}
                                                <span className="text-violet-400">{day.outbound}↑</span>
                                            </div>
                                        </div>
                                    </div>
                                    {/* Bars */}
                                    <div className="w-full flex flex-col gap-px" style={{ height: `${Math.max(4, (day.total / maxTotal) * 100)}%` }}>
                                        <div
                                            className="w-full rounded-t-sm bg-cyan-500/60 hover:bg-cyan-500 transition-colors"
                                            style={{ flex: day.inbound }}
                                        />
                                        <div
                                            className="w-full rounded-b-sm bg-violet-500/60 hover:bg-violet-500 transition-colors"
                                            style={{ flex: day.outbound || 0.01 }}
                                        />
                                    </div>
                                    <span className="text-[8px] text-slate-600 font-mono">{day.date.slice(5)}</span>
                                </div>
                            ))}
                        </div>
                        <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t border-slate-800">
                            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-cyan-500/60" /><span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Recebidas</span></div>
                            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-violet-500/60" /><span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Enviadas</span></div>
                        </div>
                    </div>

                    {/* Top Contacts */}
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 shadow-sm">
                        <h3 className="text-sm font-bold uppercase tracking-widest text-slate-300 mb-4">Top 10 Contatos Mais Ativos</h3>
                        <div className="supabase-scroll overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-800">
                                        <th className="text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest pb-3 pr-4">#</th>
                                        <th className="text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest pb-3 pr-4">Nome</th>
                                        <th className="text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest pb-3 pr-4">WhatsApp</th>
                                        <th className="text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest pb-3 pr-4">Etapa</th>
                                        <th className="text-right text-[10px] font-bold text-slate-500 uppercase tracking-widest pb-3">Mensagens</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {topContacts.map((c, i) => (
                                        <tr key={c.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                                            <td className="py-3 pr-4 font-mono text-slate-600">{i + 1}</td>
                                            <td className="py-3 pr-4 font-bold text-slate-200">{c.name}</td>
                                            <td className="py-3 pr-4 font-mono text-slate-400 text-xs">{c.waId}</td>
                                            <td className="py-3 pr-4">
                                                {c.stage && (
                                                    <span className="px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest" style={{ backgroundColor: `${c.stageColor}20`, color: c.stageColor || undefined }}>{c.stage}</span>
                                                )}
                                            </td>
                                            <td className="py-3 text-right font-bold text-violet-400">{c.messageCount}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </section>
    );
}
