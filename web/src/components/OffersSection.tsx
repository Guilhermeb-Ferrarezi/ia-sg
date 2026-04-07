import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { BarChart3, Bot, Eye, Globe, Link2, Save, Send, Sparkles, WandSparkles } from "lucide-react";
import { apiFetch } from "../lib/apiFetch";
import type { LandingMetrics, LandingPageSummary, LandingPromptConfig, Offer } from "../types/dashboard";

type ToastType = "success" | "error" | "info" | "loading";

type OfferDraft = {
  title: string;
  slug: string;
  aliases: string;
  durationLabel: string;
  modality: string;
  shortDescription: string;
  approvedFacts: string;
  ctaLabel: string;
  ctaUrl: string;
  visualTheme: string;
  isActive: boolean;
};

const emptyOfferDraft: OfferDraft = {
  title: "",
  slug: "",
  aliases: "",
  durationLabel: "",
  modality: "",
  shortDescription: "",
  approvedFacts: "",
  ctaLabel: "",
  ctaUrl: "",
  visualTheme: "",
  isActive: true
};

function joinLines(values: string[]): string {
  return values.join("\n");
}

function createDraftFromOffer(offer: Offer | null): OfferDraft {
  if (!offer) return emptyOfferDraft;
  return {
    title: offer.title,
    slug: offer.slug,
    aliases: joinLines(offer.aliases),
    durationLabel: offer.durationLabel || "",
    modality: offer.modality || "",
    shortDescription: offer.shortDescription || "",
    approvedFacts: joinLines(offer.approvedFacts),
    ctaLabel: offer.ctaLabel,
    ctaUrl: offer.ctaUrl,
    visualTheme: offer.visualTheme || "",
    isActive: offer.isActive
  };
}

export default function OffersSection({
  active,
  addToast,
  updateToast
}: {
  active: boolean;
  addToast: (message: string, type?: ToastType) => string;
  updateToast: (id: string, message: string, type: ToastType) => void;
}) {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [selectedOfferId, setSelectedOfferId] = useState<number | null>(null);
  const [offerDraft, setOfferDraft] = useState<OfferDraft>(emptyOfferDraft);
  const [globalPrompt, setGlobalPrompt] = useState<LandingPromptConfig | null>(null);
  const [offerPrompt, setOfferPrompt] = useState<LandingPromptConfig | null>(null);
  const [preview, setPreview] = useState<LandingPageSummary | null>(null);
  const [versions, setVersions] = useState<LandingPageSummary[]>([]);
  const [metrics, setMetrics] = useState<LandingMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingOffer, setSavingOffer] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");

  const selectedOffer = useMemo(
    () => offers.find((offer) => offer.id === selectedOfferId) || null,
    [offers, selectedOfferId]
  );

  const loadOffers = useCallback(async () => {
    const response = await apiFetch<{ offers: Offer[] }>("/offers");
    setOffers(response.offers);
    setSelectedOfferId((current) => current ?? response.offers[0]?.id ?? null);
  }, []);

  const loadGlobalPrompt = useCallback(async () => {
    const response = await apiFetch<LandingPromptConfig>("/settings/landing-prompt");
    setGlobalPrompt(response);
  }, []);

  const loadOfferContext = useCallback(async (offerId: number) => {
    const [promptResponse, previewResponse, versionResponse, metricsResponse] = await Promise.allSettled([
      apiFetch<LandingPromptConfig>(`/offers/${offerId}/landing-prompt`),
      apiFetch<{ landing: LandingPageSummary }>(`/offers/${offerId}/landing/preview`),
      apiFetch<{ versions: LandingPageSummary[] }>(`/offers/${offerId}/landing/versions`),
      apiFetch<LandingMetrics>(`/offers/${offerId}/landing/metrics`)
    ]);

    if (promptResponse.status === "fulfilled") setOfferPrompt(promptResponse.value);
    else setOfferPrompt(null);
    if (previewResponse.status === "fulfilled") setPreview(previewResponse.value.landing);
    else setPreview(null);
    if (versionResponse.status === "fulfilled") setVersions(versionResponse.value.versions);
    else setVersions([]);
    if (metricsResponse.status === "fulfilled") setMetrics(metricsResponse.value);
    else setMetrics(null);
  }, []);

  useEffect(() => {
    if (!active) return;
    setLoading(true);
    setError("");
    Promise.all([loadOffers(), loadGlobalPrompt()])
      .catch((err) => setError(err instanceof Error ? err.message : "Falha ao carregar ofertas."))
      .finally(() => setLoading(false));
  }, [active, loadOffers, loadGlobalPrompt]);

  useEffect(() => {
    if (!selectedOffer) {
      setOfferDraft(emptyOfferDraft);
      setPreview(null);
      setVersions([]);
      setMetrics(null);
      return;
    }
    setOfferDraft(createDraftFromOffer(selectedOffer));
    void loadOfferContext(selectedOffer.id);
  }, [selectedOffer, loadOfferContext]);

  const saveOffer = async () => {
    setSavingOffer(true);
    const toastId = addToast("Salvando oferta...", "loading");
    try {
      const payload = {
        ...offerDraft,
        aliases: offerDraft.aliases,
        approvedFacts: offerDraft.approvedFacts
      };
      if (selectedOffer) {
        await apiFetch(`/offers/${selectedOffer.id}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
      } else {
        await apiFetch("/offers", {
          method: "POST",
          body: JSON.stringify(payload)
        });
      }
      await loadOffers();
      updateToast(toastId, "Oferta salva com sucesso.", "success");
    } catch (err) {
      updateToast(toastId, err instanceof Error ? err.message : "Falha ao salvar oferta.", "error");
    } finally {
      setSavingOffer(false);
    }
  };

  const saveGlobalPrompt = async () => {
    if (!globalPrompt) return;
    setSavingPrompt(true);
    const toastId = addToast("Salvando prompt global...", "loading");
    try {
      const response = await apiFetch<LandingPromptConfig>("/settings/landing-prompt", {
        method: "PUT",
        body: JSON.stringify(globalPrompt)
      });
      setGlobalPrompt(response);
      updateToast(toastId, "Prompt global salvo.", "success");
    } catch (err) {
      updateToast(toastId, err instanceof Error ? err.message : "Falha ao salvar prompt global.", "error");
    } finally {
      setSavingPrompt(false);
    }
  };

  const saveOfferPrompt = async () => {
    if (!selectedOffer || !offerPrompt) return;
    setSavingPrompt(true);
    const toastId = addToast("Salvando prompt da oferta...", "loading");
    try {
      const response = await apiFetch<LandingPromptConfig>(`/offers/${selectedOffer.id}/landing-prompt`, {
        method: "PUT",
        body: JSON.stringify(offerPrompt)
      });
      setOfferPrompt(response);
      updateToast(toastId, "Prompt da oferta salvo.", "success");
    } catch (err) {
      updateToast(toastId, err instanceof Error ? err.message : "Falha ao salvar prompt da oferta.", "error");
    } finally {
      setSavingPrompt(false);
    }
  };

  const generateLanding = async () => {
    if (!selectedOffer) return;
    setGenerating(true);
    const toastId = addToast("Gerando landing...", "loading");
    try {
      await apiFetch(`/offers/${selectedOffer.id}/landing/generate`, { method: "POST" });
      await loadOfferContext(selectedOffer.id);
      await loadOffers();
      updateToast(toastId, "Landing gerada com sucesso.", "success");
    } catch (err) {
      updateToast(toastId, err instanceof Error ? err.message : "Falha ao gerar landing.", "error");
    } finally {
      setGenerating(false);
    }
  };

  const publishLanding = async (landingPageId?: number) => {
    if (!selectedOffer) return;
    setPublishing(true);
    const toastId = addToast("Publicando landing...", "loading");
    try {
      await apiFetch(`/offers/${selectedOffer.id}/landing/publish`, {
        method: "POST",
        body: JSON.stringify({ landingPageId })
      });
      await loadOfferContext(selectedOffer.id);
      await loadOffers();
      updateToast(toastId, "Landing publicada.", "success");
    } catch (err) {
      updateToast(toastId, err instanceof Error ? err.message : "Falha ao publicar landing.", "error");
    } finally {
      setPublishing(false);
    }
  };

  if (!active) return null;

  return (
    <section className="space-y-6 panel-enter">
      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5 shadow-2xl shadow-black/20">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-cyan-300/80">Ofertas</p>
              <h2 className="mt-1 text-xl font-black text-white">Catalogo e landing AI</h2>
            </div>
            <button
              type="button"
              className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-bold uppercase tracking-wider text-cyan-200"
              onClick={() => {
                setSelectedOfferId(null);
                setOfferDraft(emptyOfferDraft);
              }}
            >
              Nova
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {offers.map((offer) => (
              <button
                key={offer.id}
                type="button"
                onClick={() => setSelectedOfferId(offer.id)}
                className={`w-full rounded-2xl border p-4 text-left transition-all ${selectedOfferId === offer.id ? "border-cyan-400/40 bg-cyan-500/10" : "border-slate-800 bg-slate-950/60 hover:border-slate-700"}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-white">{offer.title}</p>
                    <p className="mt-1 text-xs text-slate-400">/{offer.slug}</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] ${offer.isActive ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-700/70 text-slate-300"}`}>
                    {offer.isActive ? "Ativa" : "Pausada"}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-300">
                  {offer.durationLabel ? <span className="rounded-full bg-slate-800 px-2 py-1">{offer.durationLabel}</span> : null}
                  {offer.modality ? <span className="rounded-full bg-slate-800 px-2 py-1">{offer.modality}</span> : null}
                  {offer.latestLanding ? <span className="rounded-full bg-cyan-500/15 px-2 py-1 text-cyan-200">v{offer.latestLanding.version}</span> : null}
                </div>
              </button>
            ))}
            {!offers.length && !loading ? (
              <div className="rounded-2xl border border-dashed border-slate-700 p-5 text-sm text-slate-400">
                Nenhuma oferta cadastrada ainda.
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-6">
          {error ? <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5 shadow-2xl shadow-black/20">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-cyan-300" />
                <h3 className="text-lg font-bold text-white">Oferta selecionada</h3>
              </div>
              <div className="mt-4 grid gap-3">
                <input className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white" placeholder="Titulo" value={offerDraft.title} onChange={(e) => setOfferDraft((current) => ({ ...current, title: e.target.value }))} />
                <input className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white" placeholder="Slug" value={offerDraft.slug} onChange={(e) => setOfferDraft((current) => ({ ...current, slug: e.target.value }))} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <input className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white" placeholder="Duracao" value={offerDraft.durationLabel} onChange={(e) => setOfferDraft((current) => ({ ...current, durationLabel: e.target.value }))} />
                  <input className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white" placeholder="Modalidade" value={offerDraft.modality} onChange={(e) => setOfferDraft((current) => ({ ...current, modality: e.target.value }))} />
                </div>
                <textarea className="min-h-[88px] rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white" placeholder="Descricao curta" value={offerDraft.shortDescription} onChange={(e) => setOfferDraft((current) => ({ ...current, shortDescription: e.target.value }))} />
                <textarea className="min-h-[88px] rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white" placeholder="Aliases, um por linha" value={offerDraft.aliases} onChange={(e) => setOfferDraft((current) => ({ ...current, aliases: e.target.value }))} />
                <textarea className="min-h-[110px] rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white" placeholder="Fatos aprovados, um por linha" value={offerDraft.approvedFacts} onChange={(e) => setOfferDraft((current) => ({ ...current, approvedFacts: e.target.value }))} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <input className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white" placeholder="CTA label" value={offerDraft.ctaLabel} onChange={(e) => setOfferDraft((current) => ({ ...current, ctaLabel: e.target.value }))} />
                  <input className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white" placeholder="CTA URL" value={offerDraft.ctaUrl} onChange={(e) => setOfferDraft((current) => ({ ...current, ctaUrl: e.target.value }))} />
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200">
                  <span>Oferta ativa</span>
                  <input type="checkbox" checked={offerDraft.isActive} onChange={(e) => setOfferDraft((current) => ({ ...current, isActive: e.target.checked }))} />
                </div>
                <button type="button" disabled={savingOffer} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-500 px-4 py-3 text-sm font-bold text-slate-950" onClick={saveOffer}>
                  <Save className="h-4 w-4" />
                  {savingOffer ? "Salvando..." : "Salvar oferta"}
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <MetricCard icon={<Send className="h-4 w-4 text-cyan-200" />} label="Envios" value={metrics?.deliveries ?? 0} helper="Links enviados pelo WhatsApp" />
              <MetricCard icon={<Eye className="h-4 w-4 text-emerald-200" />} label="Views" value={metrics?.views ?? 0} helper="Aberturas rastreadas" />
              <MetricCard icon={<Link2 className="h-4 w-4 text-amber-200" />} label="Cliques" value={metrics?.clicks ?? 0} helper={`CTR ${metrics?.clickRate ?? 0}%`} />
              <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5 shadow-2xl shadow-black/20">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-cyan-300/80">Operacoes</p>
                    <h3 className="mt-1 text-lg font-bold text-white">Geracao e publicacao</h3>
                  </div>
                  {selectedOffer?.latestLanding ? (
                    <a
                      href={`/ofertas/${selectedOffer.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-200"
                    >
                      <Globe className="h-4 w-4" />
                      Abrir
                    </a>
                  ) : null}
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button type="button" disabled={!selectedOffer || generating} className="inline-flex items-center gap-2 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm font-bold text-cyan-100 disabled:opacity-50" onClick={generateLanding}>
                    <WandSparkles className="h-4 w-4" />
                    {generating ? "Gerando..." : "Gerar landing"}
                  </button>
                  <button type="button" disabled={!selectedOffer || publishing || !preview} className="inline-flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-100 disabled:opacity-50" onClick={() => publishLanding(preview?.id)}>
                    <Sparkles className="h-4 w-4" />
                    {publishing ? "Publicando..." : "Publicar"}
                  </button>
                </div>
                <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-300">
                  <p className="font-semibold text-white">Versoes disponiveis</p>
                  <div className="mt-3 space-y-2">
                    {versions.map((version) => (
                      <button
                        key={version.id}
                        type="button"
                        className="flex w-full items-center justify-between rounded-2xl border border-slate-800 px-3 py-2 text-left hover:border-slate-700"
                        onClick={() => setPreview(version)}
                      >
                        <span>v{version.version} • {version.status}</span>
                        {version.status !== "published" ? (
                          <span className="text-xs text-cyan-200">preview</span>
                        ) : (
                          <span className="text-xs text-emerald-200">publicada</span>
                        )}
                      </button>
                    ))}
                    {!versions.length ? <p className="text-slate-500">Nenhuma versao gerada.</p> : null}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <PromptCard
              title="Prompt global da landing"
              icon={<Bot className="h-4 w-4 text-cyan-200" />}
              prompt={globalPrompt}
              onChange={setGlobalPrompt}
              onSave={saveGlobalPrompt}
              saving={savingPrompt}
            />
            <PromptCard
              title="Override por oferta"
              icon={<BarChart3 className="h-4 w-4 text-emerald-200" />}
              prompt={offerPrompt}
              onChange={setOfferPrompt}
              onSave={saveOfferPrompt}
              saving={savingPrompt}
            />
          </div>

          <div className="rounded-[32px] border border-slate-800 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(251,191,36,0.14),_transparent_28%),linear-gradient(180deg,_rgba(2,6,23,0.98),_rgba(15,23,42,0.96))] p-6 shadow-2xl shadow-black/30">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-cyan-300" />
              <h3 className="text-xl font-black text-white">Preview da landing</h3>
            </div>
            {preview ? (
              <div className="mt-6 space-y-6">
                <section className="overflow-hidden rounded-[28px] border border-white/10 bg-black/25 p-6">
                  <p className="text-xs font-bold uppercase tracking-[0.3em] text-cyan-200/80">{preview.sectionsJson.hero?.eyebrow || selectedOffer?.title}</p>
                  <h2 className="mt-3 max-w-4xl text-4xl font-black tracking-tight text-white">{preview.sectionsJson.hero?.headline || selectedOffer?.title}</h2>
                  <p className="mt-3 max-w-2xl text-base text-slate-200">{preview.sectionsJson.hero?.subheadline || selectedOffer?.shortDescription}</p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {(preview.sectionsJson.hero?.highlights || selectedOffer?.approvedFacts || []).slice(0, 4).map((item) => (
                      <span key={item} className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-sm text-cyan-100">{item}</span>
                    ))}
                  </div>
                </section>

                <div className="grid gap-4 md:grid-cols-3">
                  {(preview.sectionsJson.benefits || []).map((benefit) => (
                    <article key={benefit.title} className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
                      <p className="text-lg font-bold text-white">{benefit.title}</p>
                      <p className="mt-2 text-sm text-slate-300">{benefit.description}</p>
                    </article>
                  ))}
                </div>

                <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
                  <p className="text-sm font-bold uppercase tracking-[0.3em] text-emerald-300/80">{preview.sectionsJson.proof?.title || "Diferenciais"}</p>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    {(preview.sectionsJson.proof?.items || []).map((item) => (
                      <div key={item} className="rounded-2xl border border-emerald-500/15 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-50">{item}</div>
                    ))}
                  </div>
                </section>
              </div>
            ) : (
              <div className="mt-6 rounded-3xl border border-dashed border-slate-700 p-8 text-center text-slate-400">
                Gere uma landing para visualizar a copy estruturada.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function MetricCard({ icon, label, value, helper }: { icon: ReactNode; label: string; value: number; helper: string }) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5 shadow-2xl shadow-black/20">
      <div className="flex items-center justify-between gap-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">{icon}</div>
        <p className="text-3xl font-black text-white">{value}</p>
      </div>
      <p className="mt-4 text-xs font-bold uppercase tracking-[0.3em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm text-slate-300">{helper}</p>
    </div>
  );
}

function PromptCard({
  title,
  icon,
  prompt,
  onChange,
  onSave,
  saving
}: {
  title: string;
  icon: ReactNode;
  prompt: LandingPromptConfig | null;
  onChange: (value: LandingPromptConfig | null) => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5 shadow-2xl shadow-black/20">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-lg font-bold text-white">{title}</h3>
      </div>
      {!prompt ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-700 p-4 text-sm text-slate-400">Selecione uma oferta para carregar o prompt.</div>
      ) : (
        <div className="mt-4 space-y-3">
          <textarea className="min-h-[120px] w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white" value={prompt.systemPrompt} onChange={(e) => onChange({ ...prompt, systemPrompt: e.target.value })} />
          <textarea className="min-h-[80px] w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white" value={prompt.toneGuidelines} onChange={(e) => onChange({ ...prompt, toneGuidelines: e.target.value })} />
          <textarea className="min-h-[84px] w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white" value={prompt.requiredRules.join("\n")} onChange={(e) => onChange({ ...prompt, requiredRules: e.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) })} />
          <textarea className="min-h-[84px] w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white" value={prompt.ctaRules.join("\n")} onChange={(e) => onChange({ ...prompt, ctaRules: e.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) })} />
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200">
              <span className="block text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500">Auto gerar</span>
              <input className="mt-3" type="checkbox" checked={prompt.autoGenerateEnabled} onChange={(e) => onChange({ ...prompt, autoGenerateEnabled: e.target.checked })} />
            </label>
            <label className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200">
              <span className="block text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500">Auto enviar</span>
              <input className="mt-3" type="checkbox" checked={prompt.autoSendEnabled} onChange={(e) => onChange({ ...prompt, autoSendEnabled: e.target.checked })} />
            </label>
            <label className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200">
              <span className="block text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500">Confianca</span>
              <input className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2" type="number" min="0" max="1" step="0.05" value={prompt.confidenceThreshold} onChange={(e) => onChange({ ...prompt, confidenceThreshold: Number(e.target.value) || 0 })} />
            </label>
          </div>
          <button type="button" disabled={saving} className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-950" onClick={onSave}>
            <Save className="h-4 w-4" />
            {saving ? "Salvando..." : "Salvar prompt"}
          </button>
        </div>
      )}
    </div>
  );
}
