import { Database, RefreshCcw, Server } from "lucide-react";
import type { SystemHealthDetails, SystemReadiness } from "../types/dashboard";

type SystemHealthSectionProps = {
  readiness: SystemReadiness | null;
  details: SystemHealthDetails | null;
  loading: boolean;
  error: string;
  lastUpdated: Date | null;
  onRefresh: () => void;
};

export default function SystemHealthSection({ readiness, details, loading, error, lastUpdated, onRefresh }: SystemHealthSectionProps) {
  const dbDown = readiness?.db === "down" || details?.db === "down";

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-slate-200">Saúde do Sistema</h2>
          <p className="text-xs text-slate-500">Atualização automática a cada 30s</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-cyan-400"
          aria-label="Atualizar saúde do sistema"
        >
          <RefreshCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-xl border border-slate-800 bg-slate-950 p-3">
          <div className="mb-2 flex items-center gap-2 text-slate-400">
            <Database className="h-4 w-4" />
            <span className="text-xs uppercase tracking-widest">Banco</span>
          </div>
          <p className={`text-sm font-semibold ${dbDown ? "text-rose-300" : "text-emerald-300"}`}>
            {readiness?.db || details?.db || "desconhecido"}
          </p>
        </article>

        <article className="rounded-xl border border-slate-800 bg-slate-950 p-3">
          <div className="mb-2 flex items-center gap-2 text-slate-400">
            <Server className="h-4 w-4" />
            <span className="text-xs uppercase tracking-widest">API</span>
          </div>
          <p className={`text-sm font-semibold ${readiness?.ok ? "text-emerald-300" : "text-rose-300"}`}>
            {readiness?.ok ? "operacional" : "instável"}
          </p>
        </article>

        <article className="rounded-xl border border-slate-800 bg-slate-950 p-3">
          <p className="mb-2 text-xs uppercase tracking-widest text-slate-400">WS clients</p>
          <p className="text-sm font-semibold text-slate-200">{details?.wsClients ?? "-"}</p>
        </article>

        <article className="rounded-xl border border-slate-800 bg-slate-950 p-3">
          <p className="mb-2 text-xs uppercase tracking-widest text-slate-400">Uptime</p>
          <p className="text-sm font-semibold text-slate-200">{details?.uptimeSec ?? "-"}s</p>
        </article>
      </div>

      <p className="mt-3 text-[11px] text-slate-500">
        {lastUpdated ? `Última atualização: ${lastUpdated.toLocaleTimeString("pt-BR")}` : "Sem atualização ainda"}
      </p>
    </section>
  );
}
