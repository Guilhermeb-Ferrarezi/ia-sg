import { RefreshCcw } from "lucide-react";
import type { WebhookEvent } from "../types/dashboard";

type WebhookEventsSectionProps = {
  events: WebhookEvent[];
  loading: boolean;
  error: string;
  statusFilter: string;
  page: number;
  limit: number;
  total: number;
  replayingId: number | null;
  onStatusFilterChange: (value: string) => void;
  onPageChange: (page: number) => void;
  onRefresh: () => void;
  onReplay: (id: number) => void;
};

const STATUS_OPTIONS = ["all", "pending", "processing", "done", "failed", "dead"];

function statusPill(status: string): string {
  if (status === "done") return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
  if (status === "failed" || status === "dead") return "bg-rose-500/10 text-rose-300 border-rose-500/20";
  if (status === "processing") return "bg-amber-500/10 text-amber-300 border-amber-500/20";
  return "bg-slate-800 text-slate-300 border-slate-700";
}

export default function WebhookEventsSection({
  events,
  loading,
  error,
  statusFilter,
  page,
  limit,
  total,
  replayingId,
  onStatusFilterChange,
  onPageChange,
  onRefresh,
  onReplay
}: WebhookEventsSectionProps) {
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-slate-200">Eventos de Webhook</h2>
          <p className="text-xs text-slate-500">Fila de processamento e reprocessamento manual</p>
        </div>

        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="webhook-status">Filtrar por status</label>
          <select
            id="webhook-status"
            value={statusFilter}
            onChange={(event) => onStatusFilterChange(event.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>
      </div>

      {error ? <p className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p> : null}

      {loading ? <p className="text-sm text-slate-400">Carregando eventos...</p> : null}

      {!loading && events.length === 0 ? (
        <div className="rounded-lg border border-slate-800 bg-slate-950 px-4 py-6 text-center text-sm text-slate-500">
          Nenhum evento encontrado para o filtro selecionado.
        </div>
      ) : null}

      {!loading && events.length > 0 ? (
        <div className="space-y-2">
          {events.map((event) => (
            <article key={event.id} className="rounded-xl border border-slate-800 bg-slate-950 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">#{event.id}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${statusPill(event.status)}`}>
                    {event.status}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={replayingId === event.id || event.status === "processing"}
                  onClick={() => onReplay(event.id)}
                  className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-500/20 disabled:opacity-50"
                >
                  {replayingId === event.id ? "Reprocessando..." : "Reprocessar"}
                </button>
              </div>

              <div className="mt-2 grid gap-2 text-xs text-slate-400 sm:grid-cols-2 lg:grid-cols-4">
                <p>waId: <span className="text-slate-200">{event.waId || "-"}</span></p>
                <p>waMessageId: <span className="text-slate-200">{event.waMessageId || "-"}</span></p>
                <p>Tentativas: <span className="text-slate-200">{event.attemptCount}</span></p>
                <p>Criado: <span className="text-slate-200">{new Date(event.createdAt).toLocaleString("pt-BR")}</span></p>
              </div>

              {event.lastError ? <p className="mt-2 text-xs text-rose-300">Erro: {event.lastError}</p> : null}
            </article>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
        <p>Página {page} de {totalPages}</p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="rounded-md border border-slate-700 px-3 py-1 disabled:opacity-40"
          >
            Anterior
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="rounded-md border border-slate-700 px-3 py-1 disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      </div>
    </section>
  );
}
