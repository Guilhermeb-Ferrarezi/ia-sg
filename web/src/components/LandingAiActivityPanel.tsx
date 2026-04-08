import { useEffect, useMemo, useState } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { AlertTriangle, Bot, CheckCircle2, LoaderCircle, RefreshCcw } from "lucide-react";
import type { AppLog } from "../types/dashboard";

export type LandingAiActivityType = "idle" | "chat" | "preview" | "publish" | "save";

type LandingAiActivityPanelProps = {
  activityType: LandingAiActivityType;
  busy: boolean;
  busyLabel: string;
  busyDescription: string;
  logs: AppLog[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
};

type ActivityCopy = {
  message: string;
  type: LandingAiActivityType;
  isError?: boolean;
};

function readLogData(log: AppLog): Record<string, unknown> | null {
  return typeof log.data === "object" && log.data !== null ? (log.data as Record<string, unknown>) : null;
}

function formatLogTime(value: string): string {
  return new Date(value).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function getBusyActivityCopy(type: LandingAiActivityType, label: string, description: string): ActivityCopy {
  if (type === "chat") {
    return {
      message: description || label || "Estou lendo sua mensagem e ajustando o rascunho atual para te responder com mais contexto.",
      type: "chat"
    };
  }

  if (type === "preview") {
    return {
      message: description || label || "Estou montando a estrutura da landing e gerando o preview desta versao para voce revisar.",
      type: "preview"
    };
  }

  if (type === "publish") {
    return {
      message: description || label || "Estou consolidando a versao final, publicando a landing e persistindo os artefatos desta entrega.",
      type: "publish"
    };
  }

  if (type === "save") {
    return {
      message: description || label || "Estou salvando os dados que voce ajustou para usar isso nas proximas geracoes da landing.",
      type: "save"
    };
  }

  return {
    message: description || label || "Estou pronta para continuar essa landing assim que voce mandar o proximo comando.",
    type: "idle"
  };
}

function getActivityCopy(log: AppLog): ActivityCopy {
  const data = readLogData(log);
  const detail = typeof log.message === "string" && log.message.trim() ? log.message.trim() : "";
  const statusCode = typeof data?.statusCode === "number" ? data.statusCode : null;
  const fallbackDescription = detail || (statusCode ? `HTTP ${statusCode}` : "Sem detalhe adicional.");

  switch (log.event) {
    case "landing.creation.chat.started":
      return {
        message: "Estou analisando sua mensagem e cruzando isso com o rascunho atual antes de responder.",
        type: "chat"
      };
    case "landing.creation.chat.succeeded":
      return {
        message: "Terminei essa resposta e ja incorporei as informacoes mais recentes no draft da landing.",
        type: "chat"
      };
    case "landing.creation.chat.failed":
      return {
        message: fallbackDescription,
        type: "chat",
        isError: true
      };
    case "landing.creation.preview.started":
      return {
        message: "Comecei a montar o preview e estou convertendo a estrutura da landing para o canvas.",
        type: "preview"
      };
    case "landing.creation.preview.generated":
      return {
        message: "O preview desta versao ficou pronto e o canvas ja recebeu a nova estrutura da landing.",
        type: "preview"
      };
    case "landing.creation.preview.failed":
      return {
        message: fallbackDescription,
        type: "preview",
        isError: true
      };
    case "landing.creation.publish.started":
      return {
        message: "Iniciei a publicacao da landing e estou consolidando esta versao antes de liberar o resultado final.",
        type: "publish"
      };
    case "landing.creation.publish.failed":
      return {
        message: fallbackDescription,
        type: "publish",
        isError: true
      };
    case "landing.creation.published":
      return {
        message: "A landing foi publicada com sucesso e esta versao ja esta persistida para uso no fluxo real.",
        type: "publish"
      };
    case "landing.creation.session.created":
      return {
        message: "Abri um novo workspace para voce. Me diga a oferta e eu comeco a montar a landing daqui.",
        type: "idle"
      };
    default:
      return {
        message: fallbackDescription,
        type: "idle",
        isError: log.level === "error"
      };
  }
}

function getActivityClasses(type: LandingAiActivityType, isError: boolean): {
  surface: string;
  text: string;
  accent: string;
  iconShell: string;
  icon: string;
  thinking: string;
} {
  if (isError) {
    return {
      surface: "border-rose-500/16 bg-[linear-gradient(180deg,rgba(30,16,18,0.98),rgba(21,12,14,0.98))]",
      text: "text-rose-50",
      accent: "bg-rose-400/80",
      iconShell: "border border-rose-500/18 bg-rose-500/8",
      icon: "text-rose-300",
      thinking: "text-rose-200/70"
    };
  }

  if (type === "chat") {
    return {
      surface: "border-cyan-500/14 bg-[linear-gradient(180deg,rgba(28,28,31,0.98),rgba(20,20,24,0.98))]",
      text: "text-slate-50",
      accent: "bg-cyan-400/80",
      iconShell: "border border-cyan-500/18 bg-cyan-500/8",
      icon: "text-cyan-300",
      thinking: "text-cyan-200/65"
    };
  }

  if (type === "preview") {
    return {
      surface: "border-violet-500/14 bg-[linear-gradient(180deg,rgba(28,28,31,0.98),rgba(20,20,24,0.98))]",
      text: "text-slate-50",
      accent: "bg-violet-400/80",
      iconShell: "border border-violet-500/18 bg-violet-500/8",
      icon: "text-violet-300",
      thinking: "text-violet-200/65"
    };
  }

  if (type === "publish") {
    return {
      surface: "border-emerald-500/14 bg-[linear-gradient(180deg,rgba(28,28,31,0.98),rgba(20,20,24,0.98))]",
      text: "text-slate-50",
      accent: "bg-emerald-400/80",
      iconShell: "border border-emerald-500/18 bg-emerald-500/8",
      icon: "text-emerald-300",
      thinking: "text-emerald-200/65"
    };
  }

  if (type === "save") {
    return {
      surface: "border-amber-500/14 bg-[linear-gradient(180deg,rgba(28,28,31,0.98),rgba(20,20,24,0.98))]",
      text: "text-slate-50",
      accent: "bg-amber-400/80",
      iconShell: "border border-amber-500/18 bg-amber-500/8",
      icon: "text-amber-300",
      thinking: "text-amber-200/65"
    };
  }

  return {
    surface: "border-slate-700/50 bg-[linear-gradient(180deg,rgba(28,28,31,0.98),rgba(20,20,24,0.98))]",
    text: "text-slate-100",
    accent: "bg-slate-500/70",
    iconShell: "border border-slate-700/50 bg-slate-800/70",
    icon: "text-slate-300",
    thinking: "text-slate-400/80"
  };
}

function useTypedText(text: string, triggerKey: string): { typedText: string; typing: boolean } {
  const [typedText, setTypedText] = useState(text);

  useEffect(() => {
    if (!text.trim()) {
      setTypedText("");
      return;
    }

    let index = 0;
    setTypedText("");

    const timer = window.setInterval(() => {
      index = Math.min(text.length, index + (text[index] === " " ? 2 : 1));
      setTypedText(text.slice(0, index));
      if (index >= text.length) {
        window.clearInterval(timer);
      }
    }, 14);

    return () => window.clearInterval(timer);
  }, [text, triggerKey]);

  return { typedText, typing: typedText.length < text.length };
}

export default function LandingAiActivityPanel({
  activityType,
  busy,
  busyLabel,
  busyDescription,
  logs,
  loading,
  error,
  onRefresh
}: LandingAiActivityPanelProps) {
  const latestLog = logs[0] ?? null;
  const latestActivity = latestLog ? getActivityCopy(latestLog) : null;
  const displayActivity = busy
    ? getBusyActivityCopy(activityType, busyLabel, busyDescription)
    : latestActivity || getBusyActivityCopy("idle", "", "");
  const hasAttentionState = Boolean(error) || Boolean(displayActivity.isError);
  const activityClasses = getActivityClasses(displayActivity.type, hasAttentionState);
  const animationKey = useMemo(
    () => `${busy ? "busy" : "done"}:${activityType}:${latestLog?.id ?? "none"}:${displayActivity.message}`,
    [activityType, busy, displayActivity.message, latestLog?.id]
  );
  const { typedText, typing } = useTypedText(displayActivity.message, animationKey);
  const showThinking = busy || loading;
  const showCaret = busy || typing;

  return (
    <section className="group relative w-full">
      <div className={`relative overflow-hidden rounded-[24px] border px-5 py-5 shadow-[0_18px_50px_rgba(0,0,0,0.24)] ${activityClasses.surface}`}>
        <div className={`absolute inset-y-0 left-0 w-px ${activityClasses.accent}`} />

        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className={`flex size-9 shrink-0 items-center justify-center rounded-2xl ${activityClasses.iconShell}`}>
              {busy ? (
                <LoaderCircle className={`h-4 w-4 animate-spin ${activityClasses.icon}`} />
              ) : hasAttentionState ? (
                <AlertTriangle className={`h-4 w-4 ${activityClasses.icon}`} />
              ) : latestLog ? (
                <CheckCircle2 className={`h-4 w-4 ${activityClasses.icon}`} />
              ) : (
                <Bot className={`h-4 w-4 ${activityClasses.icon}`} />
              )}
            </div>

            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-slate-500">Lume</p>
              {latestLog ? (
                <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-slate-600">
                  {formatLogTime(latestLog.ts)}
                </p>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl text-slate-600 opacity-0 transition-all hover:bg-slate-800/70 hover:text-white group-hover:opacity-100"
            aria-label="Atualizar atividade da IA"
          >
            <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="space-y-5">
          <p className={`min-h-[72px] whitespace-pre-wrap text-[15px] leading-8 ${activityClasses.text}`}>
            {typedText}
            {showCaret ? <span className="ml-0.5 inline-block h-[1.1em] w-px translate-y-1 animate-pulse bg-current align-middle" /> : null}
          </p>

          <Collapsible.Root open={showThinking}>
            <Collapsible.Content className="overflow-hidden data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-1 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1">
              <div className={`flex items-center gap-2 text-[13px] ${activityClasses.thinking}`}>
                <span className="font-medium tracking-[0.08em]">Thinking</span>
                <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse [animation-delay:-0.2s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse [animation-delay:-0.1s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
              </div>
            </Collapsible.Content>
          </Collapsible.Root>

          {error ? (
            <p className="text-xs leading-6 text-rose-200">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
