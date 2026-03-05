import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/apiFetch";
import type { CalendarTask } from "../types/dashboard";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const priorityColors: Record<string, string> = {
    high: "bg-rose-500/20 border-rose-500/30 text-rose-400",
    medium: "bg-amber-500/20 border-amber-500/30 text-amber-400",
    low: "bg-emerald-500/20 border-emerald-500/30 text-emerald-400"
};

const statusIcons: Record<string, string> = {
    open: "⏳",
    done: "✅",
    canceled: "❌"
};

export default function CalendarSection({ active }: { active: boolean }) {
    const [tasks, setTasks] = useState<CalendarTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
    const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
    const [selectedDay, setSelectedDay] = useState<number | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const result = await apiFetch<{ tasks: CalendarTask[] }>(
                `/calendar/tasks?month=${currentMonth + 1}&year=${currentYear}`
            );
            setTasks(result.tasks);
        } catch (err) {
            console.error("Calendar load error:", err);
        } finally {
            setLoading(false);
        }
    }, [currentMonth, currentYear]);

    useEffect(() => {
        if (active) load();
    }, [active, load]);

    if (!active) return null;

    const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const today = new Date();
    const isCurrentMonth = today.getMonth() === currentMonth && today.getFullYear() === currentYear;

    const tasksByDay = new Map<number, CalendarTask[]>();
    for (const task of tasks) {
        const day = new Date(task.dueAt).getDate();
        if (!tasksByDay.has(day)) tasksByDay.set(day, []);
        tasksByDay.get(day)!.push(task);
    }

    const prevMonth = () => {
        if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear((y) => y - 1); }
        else setCurrentMonth((m) => m - 1);
        setSelectedDay(null);
    };
    const nextMonth = () => {
        if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear((y) => y + 1); }
        else setCurrentMonth((m) => m + 1);
        setSelectedDay(null);
    };

    const selectedTasks = selectedDay ? (tasksByDay.get(selectedDay) || []) : [];

    return (
        <section className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
                {/* Calendar Grid */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-amber-500 shadow-lg shadow-amber-500/30 text-slate-950">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-white tracking-tight">{MONTHS[currentMonth]} {currentYear}</h2>
                                <p className="text-xs text-slate-500 mt-0.5">{tasks.length} tarefas no mês</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                            </button>
                            <button
                                onClick={() => { setCurrentMonth(today.getMonth()); setCurrentYear(today.getFullYear()); setSelectedDay(null); }}
                                className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest text-amber-400 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition-all"
                            >
                                Hoje
                            </button>
                            <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                            </button>
                        </div>
                    </div>

                    {/* Weekday Headers */}
                    <div className="grid grid-cols-7 gap-1 mb-2">
                        {WEEKDAYS.map((wd) => (
                            <div key={wd} className="text-center text-[10px] font-bold text-slate-500 uppercase tracking-widest py-2">{wd}</div>
                        ))}
                    </div>

                    {/* Days Grid */}
                    <div className="grid grid-cols-7 gap-1">
                        {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                            <div key={`empty-${i}`} className="h-20" />
                        ))}
                        {Array.from({ length: daysInMonth }).map((_, i) => {
                            const day = i + 1;
                            const dayTasks = tasksByDay.get(day) || [];
                            const isToday = isCurrentMonth && day === today.getDate();
                            const isSelected = selectedDay === day;
                            const hasOpenTasks = dayTasks.some((t) => t.status === "open");
                            const hasHighPriority = dayTasks.some((t) => t.priority === "high" && t.status === "open");

                            return (
                                <button
                                    key={day}
                                    onClick={() => setSelectedDay(day === selectedDay ? null : day)}
                                    className={`h-20 rounded-xl border p-2 text-left transition-all hover:border-slate-600 group ${isSelected
                                            ? "border-amber-500 bg-amber-500/10 ring-1 ring-amber-500/50"
                                            : isToday
                                                ? "border-cyan-500/50 bg-cyan-500/5"
                                                : "border-slate-800/50 hover:bg-slate-800/30"
                                        }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <span className={`text-sm font-bold ${isToday ? "text-cyan-400" : isSelected ? "text-amber-400" : "text-slate-300"}`}>
                                            {day}
                                        </span>
                                        {dayTasks.length > 0 && (
                                            <div className="flex items-center gap-1">
                                                {hasHighPriority && <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />}
                                                {hasOpenTasks && !hasHighPriority && <div className="w-2 h-2 rounded-full bg-amber-500" />}
                                                <span className="text-[9px] font-bold text-slate-500">{dayTasks.length}</span>
                                            </div>
                                        )}
                                    </div>
                                    {dayTasks.length > 0 && (
                                        <div className="mt-1 space-y-0.5">
                                            {dayTasks.slice(0, 2).map((t) => (
                                                <div key={t.id} className={`text-[9px] truncate px-1.5 py-0.5 rounded font-medium border ${priorityColors[t.priority] || priorityColors.medium} ${t.status === "done" ? "opacity-50 line-through" : ""}`}>
                                                    {t.title}
                                                </div>
                                            ))}
                                            {dayTasks.length > 2 && (
                                                <div className="text-[9px] text-slate-500 font-bold pl-1">+{dayTasks.length - 2} mais</div>
                                            )}
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Sidebar - Day Details */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 shadow-sm flex flex-col">
                    <h3 className="text-sm font-bold uppercase tracking-widest text-slate-300 mb-4">
                        {selectedDay
                            ? `${selectedDay} de ${MONTHS[currentMonth]}`
                            : "Selecione um dia"}
                    </h3>

                    {loading ? (
                        <div className="flex-1 flex items-center justify-center">
                            <svg className="animate-spin h-6 w-6 text-amber-500" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        </div>
                    ) : selectedDay && selectedTasks.length > 0 ? (
                        <div className="supabase-scroll flex-1 space-y-3 overflow-y-auto">
                            {selectedTasks.map((task) => (
                                <div key={task.id} className={`rounded-xl border p-4 transition-all ${priorityColors[task.priority] || priorityColors.medium} ${task.status === "done" ? "opacity-60" : ""}`}>
                                    <div className="flex items-start justify-between mb-2">
                                        <span className="text-sm font-bold">{statusIcons[task.status] || "⏳"} {task.title}</span>
                                        <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">{task.priority}</span>
                                    </div>
                                    {task.description && (
                                        <p className="text-xs opacity-80 mb-2">{task.description}</p>
                                    )}
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">{task.contactName}</span>
                                        <span className="text-[10px] font-mono opacity-60">
                                            {new Date(task.dueAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
                            <svg className="w-12 h-12 mb-3 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <p className="text-xs font-bold uppercase tracking-widest">{selectedDay ? "Sem tarefas neste dia" : "Clique num dia para ver os detalhes"}</p>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
