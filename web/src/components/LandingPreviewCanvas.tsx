import { AlertTriangle } from "lucide-react";

import type { LandingPageSummary, Offer } from "../types/dashboard";
import { resolveLandingCodeBundle } from "../lib/landingCodeBundle";
import LandingCodePreviewHost from "./LandingCodePreviewHost";

export default function LandingPreviewCanvas({
  offer: _offer,
  landing,
  previewLabel: _previewLabel,
  onCtaClick,
}: {
  offer: Pick<Offer, "title" | "shortDescription" | "approvedFacts" | "ctaLabel" | "ctaUrl" | "durationLabel" | "modality">;
  landing: Pick<LandingPageSummary, "landingCodeBundleJson">;
  previewLabel?: string;
  onCtaClick?: () => void;
}) {
  const codeBundle = resolveLandingCodeBundle(landing);

  if (!codeBundle) {
    return (
      <div className="flex min-h-[640px] items-center justify-center bg-[#020617] px-6 text-white">
        <div className="max-w-lg rounded-[32px] border border-amber-400/15 bg-amber-500/10 p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-400/10 text-amber-200">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.35em] text-amber-200/80">Preview indisponivel</p>
          <h2 className="mt-3 text-3xl font-black">A landing ainda nao foi gerada</h2>
          <p className="mt-3 text-sm leading-7 text-amber-50/80">
            Envie um prompt valido ou gere o preview novamente para montar os arquivos React do zero.
          </p>
        </div>
      </div>
    );
  }

  return <LandingCodePreviewHost bundle={codeBundle} onPrimaryAction={onCtaClick} />;
}
