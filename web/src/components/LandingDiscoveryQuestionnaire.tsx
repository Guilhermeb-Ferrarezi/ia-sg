import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, LayoutTemplate, ListChecks, Palette, Sparkles, Type } from "lucide-react";
import type { LandingCreationDraft } from "../types/dashboard";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./ui/card";
import { cn } from "../lib/utils";

export type LandingDiscoveryAnswers = {
  colorPalette: string;
  typographyStyle: string;
  layoutStyle: string;
  contentNotes: string;
};

type DiscoveryQuestionId = keyof LandingDiscoveryAnswers;

type DiscoveryQuestionConfig = {
  id: DiscoveryQuestionId;
  eyebrow: string;
  title: string;
  description: string;
  placeholder: string;
  icon: typeof Palette;
  options: string[];
  multiline?: boolean;
};

const DISCOVERY_QUESTION_ORDER: DiscoveryQuestionId[] = [
  "colorPalette",
  "typographyStyle",
  "layoutStyle",
  "contentNotes",
];

const DISCOVERY_QUESTION_CONFIG: Record<DiscoveryQuestionId, DiscoveryQuestionConfig> = {
  colorPalette: {
    id: "colorPalette",
    eyebrow: "Cores",
    title: "Qual paleta deve guiar a landing?",
    description: "Escolha o clima visual principal. Isso ajuda a IA a fugir do template generico.",
    placeholder: "Ex: verde profissional com cinza grafite",
    icon: Palette,
    options: [
      "verde profissional",
      "azul premium",
      "preto com dourado",
      "laranja energetico",
      "vermelho de autoridade",
      "ciano tecnologico",
    ],
  },
  typographyStyle: {
    id: "typographyStyle",
    eyebrow: "Tipografia",
    title: "Como a tipografia deve se comportar?",
    description: "Defina o tom da leitura para a IA compor a landing com mais personalidade.",
    placeholder: "Ex: editorial forte e elegante",
    icon: Type,
    options: [
      "elegante",
      "editorial forte",
      "corporativa limpa",
      "tech futurista",
      "minimalista moderna",
      "premium ousada",
    ],
  },
  layoutStyle: {
    id: "layoutStyle",
    eyebrow: "Layout",
    title: "Qual estrutura deve organizar a pagina?",
    description: "Isso define o ritmo visual do hero e das secoes principais.",
    placeholder: "Ex: hero cinematografico + storytelling em cards",
    icon: LayoutTemplate,
    options: [
      "hero + grid",
      "hero + storytelling",
      "split screen",
      "cards assimetricos",
      "editorial premium",
      "landing longa com secoes",
    ],
  },
  contentNotes: {
    id: "contentNotes",
    eyebrow: "Conteudo",
    title: "Quais pontos principais precisam aparecer?",
    description: "Liste modulos, beneficios, provas, bonus ou qualquer argumento que nao pode faltar.",
    placeholder: "Ex:\nCertificado reconhecido\nAulas praticas\nPlanilhas prontas\nSuporte da equipe",
    icon: ListChecks,
    options: [
      "certificado reconhecido",
      "aulas praticas",
      "modulos passo a passo",
      "bonus exclusivos",
      "suporte da equipe",
      "acesso vitalicio",
    ],
    multiline: true,
  },
};

export function buildLandingDiscoveryAnswersFromDraft(draft: LandingCreationDraft): LandingDiscoveryAnswers {
  const contentNotes = draft.approvedFacts.length
    ? draft.approvedFacts.join("\n")
    : draft.shortDescription || "";

  return {
    colorPalette: draft.colorPalette || "",
    typographyStyle: draft.typographyStyle || "",
    layoutStyle: draft.layoutStyle || "",
    contentNotes,
  };
}

export function getLandingDiscoveryMissingQuestionIds(value: LandingDiscoveryAnswers): DiscoveryQuestionId[] {
  return DISCOVERY_QUESTION_ORDER.filter((questionId) => !value[questionId].trim());
}

function buildAnsweredQuestionIds(value: LandingDiscoveryAnswers): DiscoveryQuestionId[] {
  return DISCOVERY_QUESTION_ORDER.filter((questionId) => value[questionId].trim());
}

export default function LandingDiscoveryQuestionnaire({
  value,
  onChange,
  onSubmit,
  submitting = false,
}: {
  value: LandingDiscoveryAnswers;
  onChange: (nextValue: LandingDiscoveryAnswers) => void;
  onSubmit: () => void;
  submitting?: boolean;
}) {
  const [activeQuestionId, setActiveQuestionId] = useState<DiscoveryQuestionId>("colorPalette");

  const pendingQuestionIds = useMemo(() => getLandingDiscoveryMissingQuestionIds(value), [value]);
  const answeredQuestionIds = useMemo(() => buildAnsweredQuestionIds(value), [value]);

  useEffect(() => {
    if (!pendingQuestionIds.length) return;
    if (!pendingQuestionIds.includes(activeQuestionId)) {
      setActiveQuestionId(pendingQuestionIds[0]);
    }
  }, [activeQuestionId, pendingQuestionIds]);

  const currentQuestionId = pendingQuestionIds.length ? activeQuestionId : DISCOVERY_QUESTION_ORDER[DISCOVERY_QUESTION_ORDER.length - 1];
  const currentQuestion = DISCOVERY_QUESTION_CONFIG[currentQuestionId];
  const currentIndex = pendingQuestionIds.length ? pendingQuestionIds.indexOf(currentQuestionId) : DISCOVERY_QUESTION_ORDER.length;
  const totalPending = pendingQuestionIds.length;
  const currentValue = value[currentQuestionId];
  const Icon = currentQuestion.icon;

  const updateAnswer = (questionId: DiscoveryQuestionId, nextValue: string) => {
    onChange({
      ...value,
      [questionId]: nextValue,
    });
  };

  const selectOption = (option: string) => {
    if (currentQuestionId === "contentNotes") {
      const lines = value.contentNotes
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      if (lines.includes(option)) return;
      updateAnswer("contentNotes", [...lines, option].join("\n"));
      return;
    }

    updateAnswer(currentQuestionId, option);
  };

  const goToPrevious = () => {
    if (!pendingQuestionIds.length) return;
    const previousIndex = Math.max(0, currentIndex - 1);
    setActiveQuestionId(pendingQuestionIds[previousIndex]);
  };

  const goToNext = () => {
    if (!pendingQuestionIds.length) return;
    if (!currentValue.trim()) return;
    const nextIndex = Math.min(pendingQuestionIds.length - 1, currentIndex + 1);
    setActiveQuestionId(pendingQuestionIds[nextIndex]);
  };

  return (
    <Card className="overflow-hidden border-cyan-400/15 bg-[linear-gradient(135deg,rgba(8,47,73,0.26),rgba(2,6,23,0.8))] shadow-[0_18px_55px_rgba(8,145,178,0.14)]">
      <CardHeader className="gap-3 border-b border-white/8 pb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-2 text-cyan-200">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <Badge variant="default" className="mb-2">
                Briefing guiado
              </Badge>
              <CardTitle className="text-lg">Perguntas da Lume</CardTitle>
              <CardDescription className="mt-1 max-w-xl">
                Responda o briefing rapido e eu uso essas escolhas para enriquecer a landing antes da proxima geracao.
              </CardDescription>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-right">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Progresso</p>
            <p className="mt-1 text-sm font-semibold text-white">
              {answeredQuestionIds.length}/{DISCOVERY_QUESTION_ORDER.length} respondidas
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {DISCOVERY_QUESTION_ORDER.map((questionId, index) => {
            const config = DISCOVERY_QUESTION_CONFIG[questionId];
            const answered = Boolean(value[questionId].trim());
            const isActive = questionId === currentQuestionId && pendingQuestionIds.length > 0;

            return (
              <button
                key={questionId}
                type="button"
                onClick={() => setActiveQuestionId(questionId)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] transition-colors",
                  answered
                    ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
                    : isActive
                      ? "border-cyan-400/25 bg-cyan-500/10 text-cyan-100"
                      : "border-slate-700 bg-slate-950/80 text-slate-300 hover:border-slate-600 hover:text-white"
                )}
              >
                <span className="inline-flex size-4 items-center justify-center rounded-full bg-white/10 text-[10px]">
                  {answered ? <Check className="h-3 w-3" /> : index + 1}
                </span>
                {config.eyebrow}
              </button>
            );
          })}
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-6">
        {pendingQuestionIds.length ? (
          <>
            <div className="rounded-[24px] border border-white/8 bg-slate-950/60 p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-2 text-cyan-200">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-200/80">
                    Pergunta {currentIndex + 1} de {totalPending}
                  </p>
                  <h4 className="mt-2 text-lg font-black text-white">{currentQuestion.title}</h4>
                  <p className="mt-2 text-sm leading-7 text-slate-400">{currentQuestion.description}</p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {currentQuestion.options.map((option) => {
                  const selected = currentQuestionId === "contentNotes"
                    ? value.contentNotes.split("\n").map((line) => line.trim()).filter(Boolean).includes(option)
                    : currentValue.trim().toLowerCase() === option.toLowerCase();

                  return (
                    <Button
                      key={option}
                      type="button"
                      variant={selected ? "default" : "outline"}
                      size="sm"
                      className={selected ? "bg-cyan-400 text-slate-950" : "border-white/10 bg-slate-950/80 text-slate-200 hover:bg-slate-900"}
                      onClick={() => selectOption(option)}
                    >
                      {option}
                    </Button>
                  );
                })}
              </div>

              {currentQuestion.multiline ? (
                <textarea
                  rows={5}
                  value={currentValue}
                  onChange={(event) => updateAnswer(currentQuestionId, event.target.value)}
                  placeholder={currentQuestion.placeholder}
                  className="mt-5 w-full resize-none rounded-[24px] border border-slate-700/60 bg-slate-950/80 px-4 py-3 text-sm leading-7 text-white outline-none transition-colors placeholder:text-slate-500 focus:border-cyan-400/35"
                />
              ) : (
                <input
                  type="text"
                  value={currentValue}
                  onChange={(event) => updateAnswer(currentQuestionId, event.target.value)}
                  placeholder={currentQuestion.placeholder}
                  className="mt-5 h-12 w-full rounded-[20px] border border-slate-700/60 bg-slate-950/80 px-4 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-cyan-400/35"
                />
              )}
            </div>
          </>
        ) : (
          <div className="rounded-[24px] border border-emerald-400/20 bg-emerald-500/8 p-5">
            <Badge className="mb-3 bg-emerald-500/12 text-emerald-100">Briefing pronto</Badge>
            <h4 className="text-lg font-black text-white">As perguntas principais ja foram respondidas.</h4>
            <p className="mt-2 text-sm leading-7 text-slate-300">
              Envie essas respostas para a Lume e eu atualizo a sessao com mais contexto visual e de conteudo.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {DISCOVERY_QUESTION_ORDER.map((questionId) => (
                <Badge key={questionId} variant="secondary" className="border-emerald-400/15 bg-slate-950/70 text-slate-100">
                  {DISCOVERY_QUESTION_CONFIG[questionId].eyebrow}: {value[questionId]}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="justify-between border-t border-white/8 pt-5">
        <div className="text-sm text-slate-500">
          {pendingQuestionIds.length
            ? "Voce tambem pode escrever sua propria resposta no campo abaixo."
            : "Essas respostas vao entrar no draft e na proxima resposta da IA."}
        </div>

        <div className="flex items-center gap-2">
          {pendingQuestionIds.length ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={currentIndex === 0}
                onClick={goToPrevious}
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!currentValue.trim()}
                onClick={goToNext}
              >
                Proxima
                <ArrowRight className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Button type="button" size="sm" onClick={onSubmit} disabled={submitting}>
              {submitting ? "Enviando..." : "Enviar respostas para a Lume"}
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
