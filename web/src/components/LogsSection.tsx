import { RefreshCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AppLog } from "../types/dashboard";

type LogsSectionProps = {
  logs: AppLog[];
  loading: boolean;
  error: string;
  page: number;
  limit: number;
  total: number;
  levelFilter: string;
  statusFilter: string;
  searchFilter: string;
  pathFilter: string;
  requestIdFilter: string;
  waIdFilter: string;
  ipFilter: string;
  clientOsFilter: string;
  filterLabels: Record<string, string>;
  deletePassword: string;
  deleteAuthExpiresAt: string | null;
  deleteAuthSubmitting: boolean;
  deleteSubmitting: boolean;
  onLevelFilterChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
  onSearchFilterChange: (value: string) => void;
  onPathFilterChange: (value: string) => void;
  onRequestIdFilterChange: (value: string) => void;
  onWaIdFilterChange: (value: string) => void;
  onIpFilterChange: (value: string) => void;
  onClientOsFilterChange: (value: string) => void;
  onLimitChange: (value: number) => void;
  onDeletePasswordChange: (value: string) => void;
  onAuthorizeDelete: () => void;
  onDeleteFiltered: () => void;
  onDeleteAll: () => void;
  onClearFilters: () => void;
  onPageChange: (page: number) => void;
  onRefresh: () => void;
};

const LEVEL_OPTIONS = ["all", "info", "warn", "error"];
const STATUS_OPTIONS = ["all", "success", "fail"];
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

function levelPill(level: string): string {
  if (level === "error") return "bg-rose-500/10 text-rose-300 border-rose-500/20";
  if (level === "warn") return "bg-amber-500/10 text-amber-300 border-amber-500/20";
  return "bg-cyan-500/10 text-cyan-300 border-cyan-500/20";
}

export default function LogsSection({
  logs,
  loading,
  error,
  page,
  limit,
  total,
  levelFilter,
  statusFilter,
  searchFilter,
  pathFilter,
  requestIdFilter,
  waIdFilter,
  ipFilter,
  clientOsFilter,
  filterLabels,
  deletePassword,
  deleteAuthExpiresAt,
  deleteAuthSubmitting,
  deleteSubmitting,
  onLevelFilterChange,
  onStatusFilterChange,
  onSearchFilterChange,
  onPathFilterChange,
  onRequestIdFilterChange,
  onWaIdFilterChange,
  onIpFilterChange,
  onClientOsFilterChange,
  onLimitChange,
  onDeletePasswordChange,
  onAuthorizeDelete,
  onDeleteFiltered,
  onDeleteAll,
  onClearFilters,
  onPageChange,
  onRefresh
}: LogsSectionProps) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const [gotoPageValue, setGotoPageValue] = useState(String(page));

  useEffect(() => {
    setGotoPageValue(String(page));
  }, [page]);

  const canDeleteWithoutPassword = useMemo(() => {
    if (!deleteAuthExpiresAt) return false;
    const expiresMs = new Date(deleteAuthExpiresAt).getTime();
    return Number.isFinite(expiresMs) && expiresMs > Date.now();
  }, [deleteAuthExpiresAt]);

  const deleteWindowLabel = useMemo(() => {
    if (!canDeleteWithoutPassword || !deleteAuthExpiresAt) return "Sem autorização ativa";
    const expires = new Date(deleteAuthExpiresAt);
    return `Autorizado até ${expires.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
  }, [canDeleteWithoutPassword, deleteAuthExpiresAt]);

  const submitGoToPage = () => {
    const next = Number(gotoPageValue);
    if (!Number.isInteger(next)) return;
    onPageChange(Math.max(1, Math.min(totalPages, next)));
  };

  const hasActiveFilters = levelFilter !== "all"
    || statusFilter !== "all"
    || Boolean(searchFilter.trim())
    || Boolean(pathFilter.trim())
    || Boolean(requestIdFilter.trim())
    || Boolean(waIdFilter.trim())
    || Boolean(ipFilter.trim())
    || Boolean(clientOsFilter.trim());

  const mapStatusLabel = (entry: AppLog): { label: string; tone: string } => {
    if (entry.statusCode == null) {
      return { label: "sem status", tone: "text-slate-400" };
    }
    if (entry.statusCode >= 400) {
      return { label: "falha", tone: "text-rose-300" };
    }
    return { label: "sucesso", tone: "text-emerald-300" };
  };

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-slate-200">Logs do Sistema</h2>
          <p className="text-xs text-slate-500">Eventos de backend com filtros e paginação</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
          <button
            type="button"
            onClick={onClearFilters}
            disabled={!hasActiveFilters}
            className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40"
          >
            Remover filtros
          </button>
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-1">
          <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-500">{filterLabels.level || "Nível"}</span>
          <select
            value={levelFilter}
            onChange={(event) => onLevelFilterChange(event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            {LEVEL_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option === "all" ? "Todos" : option === "info" ? "Info" : option === "warn" ? "Aviso" : "Erro"}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-500">{filterLabels.status || "Status"}</span>
          <select
            value={statusFilter}
            onChange={(event) => onStatusFilterChange(event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option === "all" ? "Todos" : option === "success" ? "Sucesso" : "Falha"}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-500">{filterLabels.search || "Busca"}</span>
          <input
            value={searchFilter}
            onChange={(event) => onSearchFilterChange(event.target.value)}
            placeholder="Evento, rota, mensagem, requestId..."
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-cyan-400"
          />
        </label>

        <label className="space-y-1">
          <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-500">Itens por página</span>
          <select
            value={limit}
            onChange={(event) => onLimitChange(Number(event.target.value))}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-500">{filterLabels.path || "Rota"}</span>
          <input
            value={pathFilter}
            onChange={(event) => onPathFilterChange(event.target.value)}
            placeholder="Ex: /api/webhook"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-cyan-400"
          />
        </label>

        <label className="space-y-1">
          <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-500">{filterLabels.requestId || "Request ID"}</span>
          <input
            value={requestIdFilter}
            onChange={(event) => onRequestIdFilterChange(event.target.value)}
            placeholder="ID da requisição"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-cyan-400"
          />
        </label>

        <label className="space-y-1">
          <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-500">{filterLabels.waId || "WhatsApp ID"}</span>
          <input
            value={waIdFilter}
            onChange={(event) => onWaIdFilterChange(event.target.value)}
            placeholder="WA ID"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-cyan-400"
          />
        </label>

        <label className="space-y-1">
          <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-500">{filterLabels.ip || "IP"}</span>
          <input
            value={ipFilter}
            onChange={(event) => onIpFilterChange(event.target.value)}
            placeholder="IP de origem"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-cyan-400"
          />
        </label>

        <label className="space-y-1">
          <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-500">{filterLabels.clientOs || "Sistema operacional"}</span>
          <input
            value={clientOsFilter}
            onChange={(event) => onClientOsFilterChange(event.target.value)}
            placeholder="Windows, Android, iOS..."
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-cyan-400"
          />
        </label>
      </div>

      {error ? <p className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p> : null}
      {loading ? <p className="text-sm text-slate-400">Carregando logs...</p> : null}

      {!loading && logs.length === 0 ? (
        <div className="rounded-lg border border-slate-800 bg-slate-950 px-4 py-6 text-center text-sm text-slate-500">
          Nenhum log encontrado para os filtros selecionados.
        </div>
      ) : null}

      {!loading && logs.length > 0 ? (
        <div className="space-y-2">
          {logs.map((entry) => (
            <article key={entry.id} className="rounded-xl border border-slate-800 bg-slate-950 p-3">
              {(() => {
                const statusInfo = mapStatusLabel(entry);
                return (
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Status: <span className={statusInfo.tone}>{statusInfo.label}</span>
                  </div>
                );
              })()}
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${levelPill(entry.level)}`}>
                  {entry.level}
                </span>
                <span className="text-xs font-semibold text-slate-200">{entry.event}</span>
                <span className="text-[11px] text-slate-500">#{entry.id}</span>
              </div>

              <div className="mt-2 grid gap-2 text-xs text-slate-400 sm:grid-cols-2 lg:grid-cols-4">
                <p>Data: <span className="text-slate-200">{new Date(entry.ts).toLocaleString("pt-BR")}</span></p>
                <p>Método: <span className="text-slate-200">{entry.method || "-"}</span></p>
                <p>Rota: <span className="text-slate-200">{entry.path || "-"}</span></p>
                <p>Status: <span className="text-slate-200">{entry.statusCode ?? "-"}</span></p>
                <p>Duração: <span className="text-slate-200">{entry.durationMs != null ? `${entry.durationMs}ms` : "-"}</span></p>
                <p>IP: <span className="text-slate-200">{entry.ip || "-"}</span></p>
                <p>SO: <span className="text-slate-200">{entry.clientOs || "-"}</span></p>
                <p>requestId: <span className="text-slate-200">{entry.requestId || "-"}</span></p>
                <p>waId: <span className="text-slate-200">{entry.waId || "-"}</span></p>
                <p>contactId: <span className="text-slate-200">{entry.contactId ?? "-"}</span></p>
              </div>

              {entry.message ? <p className="mt-2 text-xs text-slate-300">Mensagem: {entry.message}</p> : null}
              {entry.data ? (
                <details className="mt-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2">
                  <summary className="cursor-pointer text-[11px] font-semibold text-slate-300">Dados brutos do log</summary>
                  <pre className="supabase-scroll mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-[11px] text-slate-400">
                    {JSON.stringify(entry.data, null, 2)}
                  </pre>
                </details>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}

      <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="password"
            value={deletePassword}
            onChange={(event) => onDeletePasswordChange(event.target.value)}
            placeholder="Senha para autorizar exclusão"
            className="min-w-[240px] rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500"
          />
          <button
            type="button"
            onClick={onAuthorizeDelete}
            disabled={deleteAuthSubmitting}
            className="rounded-lg border border-amber-500/50 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/10 disabled:opacity-50"
          >
            {deleteAuthSubmitting ? "Autorizando..." : "Autorizar por 2m30"}
          </button>
          <button
            type="button"
            onClick={onDeleteFiltered}
            disabled={deleteSubmitting || !canDeleteWithoutPassword}
            className="rounded-lg border border-rose-500/50 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/10 disabled:opacity-50"
          >
            {deleteSubmitting ? "Excluindo..." : "Excluir logs filtrados"}
          </button>
          <button
            type="button"
            onClick={onDeleteAll}
            disabled={deleteSubmitting || !canDeleteWithoutPassword}
            className="rounded-lg border border-rose-600/60 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-600/20 disabled:opacity-50"
          >
            Excluir todos logs
          </button>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">{deleteWindowLabel}</p>
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
        <p>Página {page} de {totalPages}</p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(1)}
            className="rounded-md border border-slate-700 px-3 py-1 disabled:opacity-40"
          >
            Primeira
          </button>
          <button
            type="button"
            disabled={page <= 5}
            onClick={() => onPageChange(Math.max(1, page - 5))}
            className="rounded-md border border-slate-700 px-3 py-1 disabled:opacity-40"
          >
            -5
          </button>
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="rounded-md border border-slate-700 px-3 py-1 disabled:opacity-40"
          >
            Anterior
          </button>
          <label htmlFor="logs-goto" className="text-slate-400">Ir para</label>
          <input
            id="logs-goto"
            type="number"
            min={1}
            max={totalPages}
            value={gotoPageValue}
            onChange={(event) => setGotoPageValue(event.target.value)}
            onBlur={submitGoToPage}
            className="w-20 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
          />
          <button
            type="button"
            onClick={submitGoToPage}
            className="rounded-md border border-slate-700 px-3 py-1"
          >
            OK
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="rounded-md border border-slate-700 px-3 py-1 disabled:opacity-40"
          >
            Próxima
          </button>
          <button
            type="button"
            disabled={page >= totalPages - 4}
            onClick={() => onPageChange(Math.min(totalPages, page + 5))}
            className="rounded-md border border-slate-700 px-3 py-1 disabled:opacity-40"
          >
            +5
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => onPageChange(totalPages)}
            className="rounded-md border border-slate-700 px-3 py-1 disabled:opacity-40"
          >
            Última
          </button>
        </div>
      </div>
    </section>
  );
}
