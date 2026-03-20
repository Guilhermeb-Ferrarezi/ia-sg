import type { Lead } from "../types/dashboard";

export type LeadProfileDraft = {
  stageId: number | null;
  botEnabled: boolean;
  handoffNeeded: boolean;
  interestedCourse: string;
  courseMode: string;
  availability: string;
  qualificationScore: string;
  notes: string;
  customBotPersona: string;
};

export type QualificationSignal = {
  id: "course" | "mode" | "availability" | "level" | "objective";
  label: string;
  value: string | null;
  ready: boolean;
  helper: string;
};

function asText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function buildLeadProfileDraft(lead: Lead): LeadProfileDraft {
  return {
    stageId: lead.stageId,
    botEnabled: lead.botEnabled,
    handoffNeeded: lead.handoffNeeded,
    interestedCourse: lead.interestedCourse || "",
    courseMode: lead.courseMode || "",
    availability: lead.availability || "",
    qualificationScore: lead.qualificationScore == null ? "" : String(lead.qualificationScore),
    notes: lead.notes || "",
    customBotPersona: lead.customBotPersona || ""
  };
}

export function parseQualificationScore(value: string | number | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.min(100, Math.round(parsed)));
    }
  }

  return null;
}

export function getQualificationSignals(
  lead: Pick<Lead, "level" | "objective" | "interestedCourse" | "courseMode" | "availability">,
  draft?: Pick<LeadProfileDraft, "interestedCourse" | "courseMode" | "availability"> | null
): QualificationSignal[] {
  const interestedCourse = asText(draft?.interestedCourse ?? lead.interestedCourse);
  const courseMode = asText(draft?.courseMode ?? lead.courseMode);
  const availability = asText(draft?.availability ?? lead.availability);
  const level = asText(lead.level);
  const objective = asText(lead.objective);

  return [
    {
      id: "course",
      label: "Curso",
      value: interestedCourse,
      ready: Boolean(interestedCourse),
      helper: "Oferta ou area de interesse principal."
    },
    {
      id: "mode",
      label: "Modalidade",
      value: courseMode,
      ready: Boolean(courseMode),
      helper: "Formato preferido, como online ou presencial."
    },
    {
      id: "availability",
      label: "Disponibilidade",
      value: availability,
      ready: Boolean(availability),
      helper: "Janela de horario ou periodo para estudar."
    },
    {
      id: "level",
      label: "Nivel",
      value: level,
      ready: Boolean(level),
      helper: "Experiencia atual identificada na conversa."
    },
    {
      id: "objective",
      label: "Objetivo",
      value: objective,
      ready: Boolean(objective),
      helper: "Motivacao principal para comprar o curso."
    }
  ];
}

export function getQualificationCompletion(signals: QualificationSignal[]): number {
  if (!signals.length) return 0;
  const completed = signals.filter((signal) => signal.ready).length;
  return Math.round((completed / signals.length) * 100);
}

export function getQualificationGuidance(params: {
  score: number | null;
  completion: number;
  handoffNeeded: boolean;
}): {
  tone: "sky" | "emerald" | "amber" | "rose";
  title: string;
  description: string;
} {
  const { score, completion, handoffNeeded } = params;

  if (handoffNeeded) {
    return {
      tone: "rose",
      title: "Escalar para humano",
      description: "Handoff manual sinalizado. Priorize contato comercial assistido."
    };
  }

  if (completion < 60) {
    return {
      tone: "amber",
      title: "Completar triagem",
      description: "Ainda faltam dados essenciais para fechar o perfil minimo do lead."
    };
  }

  if ((score ?? 0) >= 80) {
    return {
      tone: "emerald",
      title: "Lead aquecido",
      description: "Perfil consistente para abordagem comercial mais direta."
    };
  }

  return {
    tone: "sky",
    title: "Aprofundar contexto",
    description: "Existe base suficiente, mas ainda vale explorar urgencia e decisor."
  };
}
