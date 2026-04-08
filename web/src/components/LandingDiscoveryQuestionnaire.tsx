import { Sparkles } from "lucide-react";
import type { LandingPlannerAsk } from "../types/dashboard";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { cn } from "../lib/utils";

export default function LandingDiscoveryQuestionnaire({
  ask,
  currentStep,
  totalSteps,
  onSelectOption,
}: {
  ask: LandingPlannerAsk;
  currentStep: number;
  totalSteps: number;
  onSelectOption: (option: string) => void;
}) {
  return (
    <Card className="overflow-hidden border-cyan-400/15 bg-[linear-gradient(135deg,rgba(8,47,73,0.18),rgba(2,6,23,0.92))] shadow-[0_20px_60px_rgba(8,145,178,0.14)]">
      <CardHeader className="gap-3 border-b border-white/8 pb-4">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-2 text-cyan-200">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <Badge variant="default" className="mb-2">
              Asking user
            </Badge>
            <CardTitle className="text-base">{ask.label || "Pergunta da Lume"}</CardTitle>
            <CardDescription className="mt-1 max-w-2xl">
              A proxima etapa do plano esta aguardando sua resposta.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-5">
        <div className="rounded-[24px] border border-white/8 bg-slate-950/60 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-200/80">
              Pergunta {currentStep} de {totalSteps}
            </p>
            <span className="rounded-full border border-white/10 bg-slate-900/80 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white">
              Fluxo guiado
            </span>
          </div>

          <h4 className="mt-3 text-lg font-black text-white">{ask.question}</h4>
          {ask.helperText ? (
            <p className="mt-2 text-sm leading-7 text-slate-400">{ask.helperText}</p>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-2">
            {ask.options.map((option) => (
              <Button
                key={option}
                type="button"
                variant="outline"
                size="sm"
                className={cn(
                  "rounded-full px-3.5 text-[11px] font-black uppercase tracking-[0.16em]",
                  "border-white/10 bg-slate-950/80 text-slate-200 hover:bg-slate-900"
                )}
                onClick={() => onSelectOption(option)}
              >
                {option}
              </Button>
            ))}
          </div>

          <div className="mt-5 rounded-[20px] border border-dashed border-slate-700/70 bg-slate-950/40 px-4 py-3">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Resposta esperada</p>
            <p className="mt-2 text-sm text-slate-300">{ask.placeholder}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
