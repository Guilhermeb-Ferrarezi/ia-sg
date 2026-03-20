import type { CSSProperties, ReactNode } from "react";
import {
  Bot,
  Brain,
  Check,
  ChevronRight,
  Clock3,
  Gauge,
  GraduationCap,
  Phone,
  Save,
  ShieldAlert,
  Sparkles,
  Target,
  User,
  Zap
} from "lucide-react";

import {
  getQualificationCompletion,
  getQualificationGuidance,
  getQualificationSignals,
  parseQualificationScore,
  type LeadProfileDraft
} from "../lib/leadQualification";
import type { Lead, PipelineStage } from "../types/dashboard";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

type LeadQualificationPanelProps = {
  lead: Lead;
  draft: LeadProfileDraft | null;
  stages: PipelineStage[];
  saving: boolean;
  deleting: boolean;
  onStageChange: (stageId: number | null) => void;
  onInterestedCourseChange: (value: string) => void;
  onCourseModeChange: (value: string) => void;
  onAvailabilityChange: (value: string) => void;
  onQualificationScoreChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onCustomBotPersonaChange: (value: string) => void;
  onToggleBotEnabled: (enabled: boolean) => void;
  onToggleHandoffNeeded: (enabled: boolean) => void;
  onSave: () => void;
  onDelete: () => void;
};

const guidanceToneClasses: Record<"sky" | "emerald" | "amber" | "rose", string> = {
  sky: "border-cyan-400/20 bg-cyan-500/10 text-cyan-100 shadow-cyan-500/10",
  emerald: "border-emerald-400/20 bg-emerald-500/10 text-emerald-100 shadow-emerald-500/10",
  amber: "border-amber-400/20 bg-amber-500/10 text-amber-100 shadow-amber-500/10",
  rose: "border-rose-400/20 bg-rose-500/10 text-rose-100 shadow-rose-500/10"
};

const scoreToneClasses = {
  empty: {
    badge: "border-slate-700 bg-slate-900/80 text-slate-300",
    ring: "rgba(100,116,139,0.85)",
    glow: "shadow-slate-900/40"
  },
  low: {
    badge: "border-rose-400/20 bg-rose-500/10 text-rose-100",
    ring: "rgba(244,63,94,0.92)",
    glow: "shadow-rose-500/25"
  },
  mid: {
    badge: "border-amber-400/20 bg-amber-500/10 text-amber-100",
    ring: "rgba(245,158,11,0.92)",
    glow: "shadow-amber-500/20"
  },
  high: {
    badge: "border-emerald-400/20 bg-emerald-500/10 text-emerald-100",
    ring: "rgba(16,185,129,0.92)",
    glow: "shadow-emerald-500/20"
  }
};

function formatInteractionDate(value: string | null): string {
  if (!value) return "Sem interacao recente";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Sem interacao recente";

  return parsed.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getScoreTone(score: number | null) {
  if (score == null) return scoreToneClasses.empty;
  if (score >= 75) return scoreToneClasses.high;
  if (score >= 45) return scoreToneClasses.mid;
  return scoreToneClasses.low;
}

export default function LeadQualificationPanel({
  lead,
  draft,
  stages,
  saving,
  deleting,
  onStageChange,
  onInterestedCourseChange,
  onCourseModeChange,
  onAvailabilityChange,
  onQualificationScoreChange,
  onNotesChange,
  onCustomBotPersonaChange,
  onToggleBotEnabled,
  onToggleHandoffNeeded,
  onSave,
  onDelete
}: LeadQualificationPanelProps) {
  const score = parseQualificationScore(draft?.qualificationScore ?? lead.qualificationScore);
  const scoreTone = getScoreTone(score);
  const signals = getQualificationSignals(lead, draft);
  const completion = getQualificationCompletion(signals);
  const completedSignals = signals.filter((signal) => signal.ready).length;
  const guidance = getQualificationGuidance({
    score,
    completion,
    handoffNeeded: draft?.handoffNeeded ?? lead.handoffNeeded
  });
  const stageId = draft?.stageId ?? lead.stageId;
  const currentStage = stages.find((stage) => stage.id === stageId) || lead.stage || null;
  const scoreAngle = score == null ? 0 : Math.max(12, Math.round(score * 3.6));
  const scoreDialStyle: CSSProperties =
    score == null
      ? {
        background: "linear-gradient(135deg, rgba(15,23,42,0.96), rgba(30,41,59,0.82))"
      }
      : {
        background: `conic-gradient(${scoreTone.ring} 0deg ${scoreAngle}deg, rgba(15,23,42,0.92) ${scoreAngle}deg 360deg)`
      };

  return (
    <TooltipProvider delayDuration={120}>
      <div className="space-y-5 fade-in-up">
        <div className="lead-sheen relative overflow-hidden rounded-[28px] border border-slate-800/90 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.14),_transparent_32%),linear-gradient(180deg,_rgba(15,23,42,0.96),_rgba(2,6,23,0.94))] p-5 shadow-2xl shadow-black/25">
          <div className="lead-aurora absolute -left-16 top-8 h-32 w-32 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="lead-aurora absolute -right-12 bottom-0 h-36 w-36 rounded-full bg-emerald-400/10 blur-3xl [animation-delay:-1.8s]" />
          <div className="absolute inset-x-5 top-5 h-px bg-gradient-to-r from-transparent via-white/12 to-transparent" />

          <div className="relative space-y-5">
            <div className="flex items-start gap-4">
              <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[22px] border border-cyan-400/20 bg-[linear-gradient(135deg,rgba(34,211,238,0.24),rgba(14,165,233,0.1),rgba(16,185,129,0.18))] shadow-lg shadow-cyan-500/10">
                <div className="lead-orbit absolute inset-2 rounded-full border border-white/10" />
                <span className="relative text-2xl font-black uppercase tracking-tight text-white">
                  {lead.name?.[0]?.toUpperCase() || "L"}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-cyan-300/80">
                      Sprint 3 cockpit
                    </p>
                    <h3 className="mt-1 truncate text-xl font-black tracking-tight text-white">
                      {lead.name || "Sem nome"}
                    </h3>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-300">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700/80 bg-slate-950/80 px-3 py-1">
                        <Phone className="h-3.5 w-3.5 text-emerald-400" />
                        {lead.waId}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700/80 bg-slate-950/80 px-3 py-1">
                        <Clock3 className="h-3.5 w-3.5 text-cyan-300" />
                        {formatInteractionDate(lead.lastInteractionAt)}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold shadow-lg ${scoreTone.badge}`}>
                      <Gauge className="h-3.5 w-3.5" />
                      {score == null ? "Sem score" : `Score ${score}`}
                    </span>
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold shadow-lg ${guidanceToneClasses[guidance.tone]}`}>
                      <ChevronRight className="h-3.5 w-3.5" />
                      {guidance.title}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <MetricCard
                label="Cobertura"
                value={`${completion}%`}
                helper={`${completedSignals}/5 sinais essenciais`}
                icon={<Sparkles className="h-4 w-4 text-cyan-300" />}
                tooltip="Cobertura mede quantos sinais do perfil minimo ja foram capturados."
              />
              <MetricCard
                label="Origem"
                value={lead.source || "Direto"}
                helper={currentStage?.name || "Sem etapa"}
                icon={<User className="h-4 w-4 text-emerald-300" />}
              />
              <MetricCard
                label="Proxima acao"
                value={guidance.title}
                helper={guidance.description}
                icon={<Zap className="h-4 w-4 text-amber-300" />}
              />
            </div>

            <div className="rounded-[24px] border border-slate-800/90 bg-slate-950/55 p-4 shadow-xl shadow-black/20">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_152px]">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-800/90 bg-slate-950/80 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-slate-500">
                          Pipeline
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-100">
                          Etapa atual do lead
                        </p>
                      </div>
                      <div className="inline-flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-900/80 px-3 py-1 text-xs text-slate-300">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: currentStage?.color || "#38bdf8" }}
                        />
                        {currentStage?.name || "Sem etapa"}
                      </div>
                    </div>
                    <div className="mt-4 flex items-center gap-3">
                      <select
                        className="h-11 w-full rounded-2xl border border-slate-800 bg-slate-900/90 px-4 text-sm font-medium text-slate-100 outline-none transition-all duration-300 focus:border-cyan-400/40 focus:ring-2 focus:ring-cyan-500/15"
                        value={stageId ?? ""}
                        onChange={(event) => {
                          const next = Number(event.target.value);
                          onStageChange(Number.isInteger(next) && next > 0 ? next : null);
                        }}
                      >
                        <option value="">Selecione uma etapa</option>
                        {stages.map((stage) => (
                          <option key={stage.id} value={stage.id}>
                            {stage.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-800/90 bg-slate-950/80 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <InsightPill icon={<Clock3 className="h-3.5 w-3.5" />} label={lead.age || "Idade pendente"} />
                      <InsightPill icon={<Brain className="h-3.5 w-3.5" />} label={lead.level || "Nivel pendente"} />
                      <InsightPill icon={<Target className="h-3.5 w-3.5" />} label={lead.objective || "Objetivo pendente"} />
                    </div>
                    <div className="mt-4 rounded-2xl border border-slate-800/70 bg-slate-900/70 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500">
                        Resumo da IA
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-200">
                        {lead.aiSummary || "A IA ainda nao consolidou um resumo do contexto deste lead."}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[24px] border border-slate-800/90 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.98))] p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-slate-500">
                      Score dial
                    </p>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-700 bg-slate-900/90 text-xs font-bold text-slate-400 transition-colors hover:text-white"
                        >
                          ?
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-56 text-balance leading-5 text-slate-300">
                        Score de 0 a 100 para priorizacao comercial. Pode ser ajustado manualmente sem perder os sinais extraidos.
                      </TooltipContent>
                    </Tooltip>
                  </div>

                  <div className="mt-4 flex flex-col items-center">
                    <div
                      className={`lead-meter relative flex h-32 w-32 items-center justify-center rounded-full p-[11px] shadow-2xl ${scoreTone.glow}`}
                      style={scoreDialStyle}
                    >
                      <div className="flex h-full w-full flex-col items-center justify-center rounded-full border border-white/10 bg-slate-950/90 text-center">
                        <span className="text-[11px] font-bold uppercase tracking-[0.34em] text-slate-500">
                          Score
                        </span>
                        <span className="mt-1 text-3xl font-black tracking-tight text-white">
                          {score == null ? "--" : score}
                        </span>
                        <span className="text-xs text-slate-400">
                          /100
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 w-full space-y-2">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>Ajuste manual</span>
                        <span>{score == null ? "Sem valor" : `${score}/100`}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={score ?? 0}
                        onChange={(event) => onQualificationScoreChange(event.target.value)}
                        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-800 accent-cyan-400"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <SectionCard
          title="Radar de triagem"
          eyebrow="Perfil minimo"
          description="Acompanhe o que ja foi extraido da conversa e o que ainda precisa ser perguntado."
        >
          <div className="space-y-3">
            {signals.map((signal) => (
              <SignalRow key={signal.id} signal={signal} />
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Campos editaveis"
          eyebrow="Sprint 3"
          description="Refine os sinais principais para o time comercial trabalhar com mais contexto."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <FieldShell label="Curso de interesse" icon={<GraduationCap className="h-4 w-4 text-cyan-300" />}>
              <input
                className="h-11 w-full rounded-2xl border border-slate-800 bg-slate-950/90 px-4 text-sm text-slate-100 outline-none transition-all duration-300 focus:border-cyan-400/40 focus:ring-2 focus:ring-cyan-500/15"
                value={draft?.interestedCourse || ""}
                placeholder="Ex: Full Stack, Power BI, Ingles"
                onChange={(event) => onInterestedCourseChange(event.target.value)}
              />
            </FieldShell>
            <FieldShell label="Modalidade" icon={<Sparkles className="h-4 w-4 text-violet-300" />}>
              <input
                className="h-11 w-full rounded-2xl border border-slate-800 bg-slate-950/90 px-4 text-sm text-slate-100 outline-none transition-all duration-300 focus:border-violet-400/40 focus:ring-2 focus:ring-violet-500/15"
                value={draft?.courseMode || ""}
                placeholder="Ex: Online ao vivo, presencial, hibrido"
                onChange={(event) => onCourseModeChange(event.target.value)}
              />
            </FieldShell>
            <FieldShell label="Disponibilidade" icon={<Clock3 className="h-4 w-4 text-emerald-300" />}>
              <input
                className="h-11 w-full rounded-2xl border border-slate-800 bg-slate-950/90 px-4 text-sm text-slate-100 outline-none transition-all duration-300 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-500/15"
                value={draft?.availability || ""}
                placeholder="Ex: Noite, fins de semana, horario comercial"
                onChange={(event) => onAvailabilityChange(event.target.value)}
              />
            </FieldShell>
            <FieldShell label="Score manual" icon={<Gauge className="h-4 w-4 text-amber-300" />}>
              <input
                type="number"
                min={0}
                max={100}
                className="h-11 w-full rounded-2xl border border-slate-800 bg-slate-950/90 px-4 text-sm text-slate-100 outline-none transition-all duration-300 focus:border-amber-400/40 focus:ring-2 focus:ring-amber-500/15"
                value={draft?.qualificationScore || ""}
                placeholder="0 a 100"
                onChange={(event) => onQualificationScoreChange(event.target.value)}
              />
            </FieldShell>
          </div>
        </SectionCard>

        <div className="grid gap-4 xl:grid-cols-2">
          <TogglePanel
            active={draft?.botEnabled ?? lead.botEnabled}
            icon={<Bot className="h-4 w-4" />}
            title="Automacao AI"
            description="Mantem resposta automatica ativa para este lead."
            onToggle={() => onToggleBotEnabled(!(draft?.botEnabled ?? lead.botEnabled))}
            tone="cyan"
          />
          <TogglePanel
            active={draft?.handoffNeeded ?? lead.handoffNeeded}
            icon={<ShieldAlert className="h-4 w-4" />}
            title="Handoff humano"
            description="Sinaliza ambiguidade, urgencia ou necessidade de atendimento manual."
            onToggle={() => onToggleHandoffNeeded(!(draft?.handoffNeeded ?? lead.handoffNeeded))}
            tone="amber"
          />
        </div>

        <SectionCard
          title="Notas internas"
          eyebrow="Contexto operacional"
          description="Registre sinais de objeecao, urgencia, decisor e proximos passos."
        >
          <textarea
            className="supabase-scroll min-h-[130px] w-full resize-y rounded-[22px] border border-slate-800 bg-slate-950/90 px-4 py-3 text-sm leading-6 text-slate-100 outline-none transition-all duration-300 focus:border-cyan-400/40 focus:ring-2 focus:ring-cyan-500/15"
            value={draft?.notes || ""}
            placeholder="Ex: quer bolsa, precisa decidir com a familia, pediu retorno apos salario..."
            onChange={(event) => onNotesChange(event.target.value)}
          />
        </SectionCard>

        <SectionCard
          title="Persona do bot"
          eyebrow="Ajuste fino"
          description="Use somente quando este lead precisar de um tom de voz ou abordagem diferente do padrao."
        >
          <textarea
            className="supabase-scroll min-h-[120px] w-full resize-y rounded-[22px] border border-slate-800 bg-slate-950/90 px-4 py-3 text-sm leading-6 text-slate-100 outline-none transition-all duration-300 focus:border-violet-400/40 focus:ring-2 focus:ring-violet-500/15"
            value={draft?.customBotPersona || ""}
            placeholder="Ex: responder com tom mais tecnico, resumido e direto para decisor financeiro."
            onChange={(event) => onCustomBotPersonaChange(event.target.value)}
          />
        </SectionCard>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !draft}
            className="group inline-flex h-12 items-center justify-center gap-2 rounded-[22px] border border-cyan-400/20 bg-[linear-gradient(135deg,rgba(6,182,212,0.22),rgba(14,165,233,0.08),rgba(15,23,42,0.95))] px-5 text-sm font-semibold text-cyan-50 shadow-lg shadow-cyan-500/10 transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-300/30 hover:shadow-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-55"
          >
            <Save className={`h-4 w-4 ${saving ? "animate-spin" : "transition-transform duration-300 group-hover:scale-110"}`} />
            {saving ? "Salvando lead..." : "Salvar alteracoes do lead"}
          </button>

          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="group inline-flex h-12 items-center justify-center gap-2 rounded-[22px] border border-rose-400/20 bg-[linear-gradient(135deg,rgba(244,63,94,0.14),rgba(127,29,29,0.05),rgba(15,23,42,0.95))] px-5 text-sm font-semibold text-rose-100 shadow-lg shadow-rose-500/10 transition-all duration-300 hover:-translate-y-0.5 hover:border-rose-300/30 hover:shadow-rose-500/20 disabled:cursor-not-allowed disabled:opacity-55"
          >
            <ShieldAlert className="h-4 w-4 transition-transform duration-300 group-hover:scale-110" />
            {deleting ? "Removendo..." : "Excluir lead"}
          </button>
        </div>
      </div>
    </TooltipProvider>
  );
}

function MetricCard({
  label,
  value,
  helper,
  icon,
  tooltip
}: {
  label: string;
  value: string;
  helper: string;
  icon: ReactNode;
  tooltip?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800/90 bg-slate-950/75 p-4 shadow-lg shadow-black/15">
      <div className="flex items-start justify-between gap-3">
        <div className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-white/8 bg-white/5">
          {icon}
        </div>
        {tooltip ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-700 bg-slate-900/80 text-[11px] font-bold text-slate-400 transition-colors hover:text-white"
              >
                i
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-56 text-balance leading-5 text-slate-300">
              {tooltip}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.32em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-white">
        {value}
      </p>
      <p className="mt-2 text-xs leading-5 text-slate-400">
        {helper}
      </p>
    </div>
  );
}

function SectionCard({
  eyebrow,
  title,
  description,
  children
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[26px] border border-slate-800/90 bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(2,6,23,0.94))] p-5 shadow-2xl shadow-black/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.34em] text-slate-500">
            {eyebrow}
          </p>
          <h4 className="mt-1 text-lg font-black tracking-tight text-white">
            {title}
          </h4>
        </div>
        <p className="max-w-lg text-sm leading-6 text-slate-400">
          {description}
        </p>
      </div>
      <div className="mt-5">
        {children}
      </div>
    </section>
  );
}

function InsightPill({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-slate-800/90 bg-slate-900/80 px-3 py-1.5 text-xs font-medium text-slate-300">
      <span className="text-slate-400">
        {icon}
      </span>
      {label}
    </div>
  );
}

function FieldShell({
  label,
  icon,
  children
}: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="space-y-2">
      <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-200">
        {icon}
        {label}
      </span>
      {children}
    </label>
  );
}

function SignalRow({
  signal
}: {
  signal: ReturnType<typeof getQualificationSignals>[number];
}) {
  const iconMap = {
    course: <GraduationCap className="h-4 w-4" />,
    mode: <Sparkles className="h-4 w-4" />,
    availability: <Clock3 className="h-4 w-4" />,
    level: <Brain className="h-4 w-4" />,
    objective: <Target className="h-4 w-4" />
  } as const;

  return (
    <div
      className={`grid gap-3 rounded-2xl border p-4 transition-all duration-300 md:grid-cols-[44px_minmax(0,1fr)_auto] ${signal.ready
        ? "border-emerald-400/15 bg-emerald-500/8 shadow-lg shadow-emerald-500/5"
        : "border-slate-800/90 bg-slate-950/70"
      }`}
    >
      <div
        className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl border ${signal.ready
          ? "border-emerald-400/15 bg-emerald-500/10 text-emerald-200"
          : "border-slate-800 bg-slate-900/80 text-slate-400"
        }`}
      >
        {iconMap[signal.id]}
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-white">
            {signal.label}
          </p>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${signal.ready
            ? "bg-emerald-500/10 text-emerald-200"
            : "bg-slate-800 text-slate-400"
          }`}>
            {signal.ready ? (
              <>
                <Check className="h-3.5 w-3.5" />
                Capturado
              </>
            ) : (
              "Pendente"
            )}
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-300">
          {signal.value || "Sem dado confirmado ainda"}
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          {signal.helper}
        </p>
      </div>

      <div className="flex items-center justify-start md:justify-end">
        <div className={`h-2.5 w-24 overflow-hidden rounded-full ${signal.ready ? "bg-emerald-500/15" : "bg-slate-800"}`}>
          <div className={`h-full rounded-full transition-all duration-500 ${signal.ready ? "w-full bg-emerald-400" : "w-[18%] bg-slate-700"}`} />
        </div>
      </div>
    </div>
  );
}

function TogglePanel({
  active,
  icon,
  title,
  description,
  onToggle,
  tone
}: {
  active: boolean;
  icon: ReactNode;
  title: string;
  description: string;
  onToggle: () => void;
  tone: "cyan" | "amber";
}) {
  const toneClasses =
    tone === "cyan"
      ? active
        ? "border-cyan-400/20 bg-cyan-500/10 text-cyan-50"
        : "border-slate-800/90 bg-slate-950/70 text-slate-100"
      : active
        ? "border-amber-400/20 bg-amber-500/10 text-amber-50"
        : "border-slate-800/90 bg-slate-950/70 text-slate-100";

  const dotClasses =
    tone === "cyan"
      ? active
        ? "translate-x-5 bg-cyan-300"
        : "translate-x-0 bg-slate-500"
      : active
        ? "translate-x-5 bg-amber-300"
        : "translate-x-0 bg-slate-500";

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`group rounded-[24px] border p-5 text-left shadow-2xl shadow-black/15 transition-all duration-300 hover:-translate-y-0.5 ${toneClasses}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
            {icon}
          </div>
          <h4 className="mt-4 text-base font-black tracking-tight">
            {title}
          </h4>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            {description}
          </p>
        </div>
        <div className="inline-flex items-center gap-3">
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${active ? "border-white/15 bg-white/10 text-white" : "border-slate-700 bg-slate-900/70 text-slate-400"}`}>
            {active ? "Ativo" : "Inativo"}
          </span>
          <div className="relative h-7 w-12 rounded-full bg-slate-900/80">
            <div className={`absolute left-1 top-1 h-5 w-5 rounded-full transition-transform duration-300 ${dotClasses}`} />
          </div>
        </div>
      </div>
    </button>
  );
}
