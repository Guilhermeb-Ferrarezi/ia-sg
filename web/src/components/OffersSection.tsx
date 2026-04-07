import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BarChart3,
  Bot,
  Eye,
  Globe,
  Layers3,
  Link2,
  MessageSquare,
  MonitorPlay,
  Plus,
  RefreshCw,
  Save,
  Send,
  Sparkles,
  Trash2,
  WandSparkles
} from "lucide-react";
import { apiFetch } from "../lib/apiFetch";
import type {
  LandingCreationDraft,
  LandingCreationSession,
  LandingMetrics,
  LandingPageSummary,
  LandingPreviewLeadContext,
  LandingPreviewResponse,
  LandingPromptConfig,
  Offer
} from "../types/dashboard";
import LandingPreviewCanvas from "./LandingPreviewCanvas";

type ToastType = "success" | "error" | "info" | "loading";
type OffersTab = "chat" | "details" | "prompt" | "preview" | "publish";

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

const emptyPreviewLeadContext: LandingPreviewLeadContext = {
  interestedCourse: "",
  courseMode: "",
  objective: "",
  level: "",
  summary: ""
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

function createOfferDraftFromSessionDraft(draft: LandingCreationDraft): OfferDraft {
  return {
    title: draft.title,
    slug: draft.slug,
    aliases: joinLines(draft.aliases),
    durationLabel: draft.durationLabel,
    modality: draft.modality,
    shortDescription: draft.shortDescription,
    approvedFacts: joinLines(draft.approvedFacts),
    ctaLabel: draft.ctaLabel,
    ctaUrl: draft.ctaUrl,
    visualTheme: draft.visualTheme,
    isActive: draft.isActive
  };
}

function createSessionDraftFromOfferDraft(draft: OfferDraft): LandingCreationDraft {
  return {
    title: draft.title,
    slug: draft.slug,
    aliases: draft.aliases
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean),
    durationLabel: draft.durationLabel,
    modality: draft.modality,
    shortDescription: draft.shortDescription,
    approvedFacts: draft.approvedFacts
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean),
    ctaLabel: draft.ctaLabel,
    ctaUrl: draft.ctaUrl,
    visualTheme: draft.visualTheme,
    isActive: draft.isActive
  };
}

function getMissingPublishFieldsFromOfferDraft(draft: OfferDraft): string[] {
  const missing: string[] = [];
  if (!draft.title.trim()) missing.push("title");
  if (!draft.slug.trim()) missing.push("slug");
  if (!draft.approvedFacts.trim()) missing.push("approvedFacts");
  if (!draft.ctaLabel.trim()) missing.push("ctaLabel");
  if (!draft.ctaUrl.trim()) missing.push("ctaUrl");
  return missing;
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
  const [previewOffer, setPreviewOffer] = useState<Offer | null>(null);
  const [previewLeadContext, setPreviewLeadContext] = useState<LandingPreviewLeadContext>(emptyPreviewLeadContext);
  const [versions, setVersions] = useState<LandingPageSummary[]>([]);
  const [metrics, setMetrics] = useState<LandingMetrics | null>(null);
  const [sessions, setSessions] = useState<LandingCreationSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [sessionDraft, setSessionDraft] = useState<OfferDraft>(emptyOfferDraft);
  const [sessionPromptDraft, setSessionPromptDraft] = useState<LandingPromptConfig | null>(null);
  const [sessionChatMessage, setSessionChatMessage] = useState("");
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sendingChat, setSendingChat] = useState(false);
  const [savingSessionPrompt, setSavingSessionPrompt] = useState(false);
  const [publishingSession, setPublishingSession] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingOffer, setSavingOffer] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [deletingOfferId, setDeletingOfferId] = useState<number | null>(null);
  const [togglingOfferId, setTogglingOfferId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<OffersTab>("details");

  const selectedOffer = useMemo(
    () => offers.find((offer) => offer.id === selectedOfferId) || null,
    [offers, selectedOfferId]
  );
  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) || null,
    [sessions, selectedSessionId]
  );

  const loadOffers = useCallback(async () => {
    const response = await apiFetch<{ offers: Offer[] }>("/offers");
    setOffers(response.offers);
    setSelectedOfferId((current) => {
      if (current && response.offers.some((offer) => offer.id === current)) {
        return current;
      }
      return response.offers[0]?.id ?? null;
    });
  }, []);

  const loadGlobalPrompt = useCallback(async () => {
    const response = await apiFetch<LandingPromptConfig>("/settings/landing-prompt");
    setGlobalPrompt(response);
  }, []);

  const loadSessions = useCallback(async () => {
    setSessionLoading(true);
    try {
      const response = await apiFetch<{ sessions: LandingCreationSession[] }>("/landing-creation/sessions");
      setSessions(response.sessions);
      setSelectedSessionId((current) => current ?? response.sessions[0]?.id ?? null);
    } finally {
      setSessionLoading(false);
    }
  }, []);

  const replaceSession = useCallback((session: LandingCreationSession) => {
    setSessions((current) => {
      const next = current.some((item) => item.id === session.id)
        ? current.map((item) => (item.id === session.id ? session : item))
        : [session, ...current];
      return next.sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
    });
    setSelectedSessionId(session.id);
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
    Promise.all([loadOffers(), loadGlobalPrompt(), loadSessions()])
      .catch((err) => setError(err instanceof Error ? err.message : "Falha ao carregar ofertas."))
      .finally(() => setLoading(false));
  }, [active, loadOffers, loadGlobalPrompt, loadSessions]);

  useEffect(() => {
    if (!selectedOffer) {
      setOfferDraft(emptyOfferDraft);
      setPreview(null);
      setPreviewOffer(null);
      setPreviewLeadContext(emptyPreviewLeadContext);
      setVersions([]);
      setMetrics(null);
      return;
    }
    setOfferDraft(createDraftFromOffer(selectedOffer));
    setPreviewOffer(selectedOffer);
    void loadOfferContext(selectedOffer.id);
  }, [selectedOffer, loadOfferContext]);

  useEffect(() => {
    if (!selectedSession) {
      setSessionDraft(emptyOfferDraft);
      setSessionPromptDraft(null);
      setSessionChatMessage("");
      return;
    }
    setSelectedOfferId(null);
    setSessionDraft(createOfferDraftFromSessionDraft(selectedSession.offerDraft));
    setSessionPromptDraft(selectedSession.promptDraft);
    setActiveTab("chat");
  }, [selectedSession]);

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

  const startManualOfferCreation = useCallback(() => {
    setSelectedSessionId(null);
    setSelectedOfferId(null);
    setOfferDraft(emptyOfferDraft);
    setOfferPrompt(globalPrompt);
    setPreview(null);
    setPreviewOffer(null);
    setPreviewLeadContext(emptyPreviewLeadContext);
    setVersions([]);
    setMetrics(null);
    setActiveTab("details");
  }, [globalPrompt]);

  const selectOfferForEditing = useCallback((offerId: number) => {
    setSelectedOfferId(offerId);
    setSelectedSessionId(null);
    setActiveTab("details");
  }, []);

  const toggleOfferStatus = async (offer: Offer) => {
    setTogglingOfferId(offer.id);
    const toastId = addToast(`${offer.isActive ? "Pausando" : "Ativando"} oferta...`, "loading");
    try {
      await apiFetch(`/offers/${offer.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !offer.isActive })
      });
      await loadOffers();
      if (selectedOfferId === offer.id) {
        await loadOfferContext(offer.id);
      }
      updateToast(toastId, `Oferta ${offer.isActive ? "pausada" : "ativada"} com sucesso.`, "success");
    } catch (err) {
      updateToast(toastId, err instanceof Error ? err.message : "Falha ao atualizar status da oferta.", "error");
    } finally {
      setTogglingOfferId(null);
    }
  };

  const deleteOffer = async (offer: Offer) => {
    const confirmed = window.confirm(`Excluir a oferta "${offer.title}" e todas as versoes publicadas?`);
    if (!confirmed) return;

    setDeletingOfferId(offer.id);
    const toastId = addToast("Excluindo oferta...", "loading");
    try {
      await apiFetch(`/offers/${offer.id}`, { method: "DELETE" });
      if (selectedOfferId === offer.id) {
        setSelectedOfferId(null);
        setOfferDraft(emptyOfferDraft);
        setOfferPrompt(globalPrompt);
        setPreview(null);
        setPreviewOffer(null);
        setPreviewLeadContext(emptyPreviewLeadContext);
        setVersions([]);
        setMetrics(null);
      }
      await loadOffers();
      updateToast(toastId, "Oferta removida com sucesso.", "success");
    } catch (err) {
      updateToast(toastId, err instanceof Error ? err.message : "Falha ao excluir oferta.", "error");
    } finally {
      setDeletingOfferId(null);
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

  const generateDraftPreview = async () => {
    const prompt = offerPrompt || globalPrompt;
    if (!prompt) {
      addToast("Carregue o prompt antes de gerar o preview.", "error");
      return;
    }

    setPreviewing(true);
    const toastId = addToast("Gerando preview da landing...", "loading");
    try {
      const response = await apiFetch<LandingPreviewResponse>("/landings/preview", {
        method: "POST",
        body: JSON.stringify({
          offer: {
            title: offerDraft.title,
            slug: offerDraft.slug,
            shortDescription: offerDraft.shortDescription,
            durationLabel: offerDraft.durationLabel,
            modality: offerDraft.modality,
            approvedFacts: offerDraft.approvedFacts,
            ctaLabel: offerDraft.ctaLabel,
            ctaUrl: offerDraft.ctaUrl
          },
          prompt,
          leadContext: previewLeadContext
        })
      });
      setPreview(response.landing);
      setPreviewOffer(response.offer);
      updateToast(toastId, "Preview atualizado com IA.", "success");
    } catch (err) {
      updateToast(toastId, err instanceof Error ? err.message : "Falha ao gerar preview.", "error");
    } finally {
      setPreviewing(false);
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

  const createSession = async () => {
    const toastId = addToast("Criando workspace de landing...", "loading");
    try {
      const response = await apiFetch<{ session: LandingCreationSession }>("/landing-creation/sessions", {
        method: "POST"
      });
      replaceSession(response.session);
      setSelectedOfferId(null);
      setActiveTab("chat");
      updateToast(toastId, "Workspace criado.", "success");
    } catch (err) {
      updateToast(toastId, err instanceof Error ? err.message : "Falha ao criar workspace.", "error");
    }
  };

  const sendChatMessage = async () => {
    if (!selectedSession || !sessionChatMessage.trim()) return;
    setSendingChat(true);
    const message = sessionChatMessage.trim();
    setSessionChatMessage("");
    try {
      const response = await apiFetch<{ session: LandingCreationSession }>(`/landing-creation/sessions/${selectedSession.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ message })
      });
      replaceSession(response.session);
      setSessionDraft(createOfferDraftFromSessionDraft(response.session.offerDraft));
      setSessionPromptDraft(response.session.promptDraft);
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Falha ao enviar mensagem.", "error");
      setSessionChatMessage(message);
    } finally {
      setSendingChat(false);
    }
  };

  const saveSessionPrompt = async () => {
    if (!selectedSession || !sessionPromptDraft) return;
    setSavingSessionPrompt(true);
    const toastId = addToast("Salvando prompt da sessao...", "loading");
    try {
      const response = await apiFetch<{ session: LandingCreationSession }>(`/landing-creation/sessions/${selectedSession.id}/prompt`, {
        method: "PUT",
        body: JSON.stringify(sessionPromptDraft)
      });
      replaceSession(response.session);
      setSessionPromptDraft(response.session.promptDraft);
      updateToast(toastId, "Prompt da sessao salvo.", "success");
    } catch (err) {
      updateToast(toastId, err instanceof Error ? err.message : "Falha ao salvar prompt da sessao.", "error");
    } finally {
      setSavingSessionPrompt(false);
    }
  };

  const generateSessionPreview = async () => {
    if (!selectedSession || !sessionPromptDraft) return;
    setPreviewing(true);
    const toastId = addToast("Gerando preview do chatbot...", "loading");
    try {
      const response = await apiFetch<{ session: LandingCreationSession }>(`/landing-creation/sessions/${selectedSession.id}/preview`, {
        method: "POST",
        body: JSON.stringify({
          offerDraft: createSessionDraftFromOfferDraft(sessionDraft),
          promptDraft: sessionPromptDraft,
          leadContext: previewLeadContext
        })
      });
      replaceSession(response.session);
      setSessionDraft(createOfferDraftFromSessionDraft(response.session.offerDraft));
      setSessionPromptDraft(response.session.promptDraft);
      setActiveTab("preview");
      updateToast(toastId, "Preview atualizado.", "success");
    } catch (err) {
      updateToast(toastId, err instanceof Error ? err.message : "Falha ao gerar preview.", "error");
    } finally {
      setPreviewing(false);
    }
  };

  const publishSession = async () => {
    if (!selectedSession || !sessionPromptDraft) return;
    setPublishingSession(true);
    const toastId = addToast("Publicando oferta do chatbot...", "loading");
    try {
      const response = await apiFetch<{ session: LandingCreationSession }>(`/landing-creation/sessions/${selectedSession.id}/publish`, {
        method: "POST",
        body: JSON.stringify({
          offerDraft: createSessionDraftFromOfferDraft(sessionDraft),
          promptDraft: sessionPromptDraft
        })
      });
      replaceSession(response.session);
      setSessionDraft(createOfferDraftFromSessionDraft(response.session.offerDraft));
      await loadOffers();
      updateToast(toastId, "Oferta publicada com sucesso.", "success");
    } catch (err) {
      updateToast(toastId, err instanceof Error ? err.message : "Falha ao publicar oferta.", "error");
    } finally {
      setPublishingSession(false);
    }
  };

  if (!active) return null;

  return (
    <section className="space-y-6 panel-enter">
      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5 shadow-2xl shadow-black/20">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-cyan-300/80">Landings</p>
              <h2 className="mt-1 text-xl font-black text-white">Chat criador + catalogo</h2>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-2xl border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-xs font-bold uppercase tracking-wider text-violet-100"
                onClick={() => void createSession()}
              >
                <span className="inline-flex items-center gap-1">
                  <Plus className="h-3.5 w-3.5" />
                  Chat
                </span>
              </button>
              <button
                type="button"
                className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-bold uppercase tracking-wider text-cyan-200"
                onClick={startManualOfferCreation}
              >
                Manual
              </button>
            </div>
          </div>

          <div className="mt-5 space-y-6">
            <div>
              <div className="mb-3 flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-violet-300" />
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-violet-200/80">Criacoes por chat</p>
              </div>
              <div className="space-y-3">
                {sessions.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => {
                      setSelectedSessionId(session.id);
                      setSelectedOfferId(null);
                      setActiveTab("chat");
                    }}
                    className={`w-full rounded-2xl border p-4 text-left transition-all ${selectedSessionId === session.id ? "border-violet-400/40 bg-violet-500/10" : "border-slate-800 bg-slate-950/60 hover:border-slate-700"}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-white">{session.title}</p>
                        <p className="mt-1 text-xs text-slate-400">{session.chatHistory.length} mensagens</p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] ${session.status === "published" ? "bg-emerald-500/15 text-emerald-300" : session.status === "preview_ready" ? "bg-cyan-500/15 text-cyan-200" : "bg-violet-500/15 text-violet-200"}`}>
                        {session.status}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-300">
                      {session.offerDraft.title ? <span className="rounded-full bg-slate-800 px-2 py-1">{session.offerDraft.title}</span> : null}
                      {session.readiness.canPreview ? <span className="rounded-full bg-cyan-500/15 px-2 py-1 text-cyan-200">preview ok</span> : null}
                      {session.readiness.canPublish ? <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-emerald-200">pronta para publicar</span> : null}
                    </div>
                  </button>
                ))}
                {!sessions.length && !sessionLoading ? (
                  <div className="rounded-2xl border border-dashed border-slate-700 p-5 text-sm text-slate-400">
                    Nenhuma criacao por chat ainda.
                  </div>
                ) : null}
              </div>
            </div>

            <div className="border-t border-slate-800 pt-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-cyan-300" />
                  <p className="text-xs font-bold uppercase tracking-[0.3em] text-cyan-200/80">Ofertas publicadas</p>
                </div>
                <button
                  type="button"
                  onClick={startManualOfferCreation}
                  className="inline-flex items-center gap-2 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-bold text-cyan-100"
                >
                  <Plus className="h-4 w-4" />
                  Nova oferta
                </button>
              </div>
              <div className="space-y-3">
                {offers.map((offer) => (
                  <div
                    key={offer.id}
                    className={`w-full rounded-2xl border p-4 text-left transition-all ${selectedOfferId === offer.id ? "border-cyan-400/40 bg-cyan-500/10" : "border-slate-800 bg-slate-950/60 hover:border-slate-700"}`}
                  >
                    <button type="button" onClick={() => selectOfferForEditing(offer.id)} className="w-full text-left">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-white">{offer.title}</p>
                          <p className="mt-1 text-xs text-slate-400">/{offer.slug}</p>
                        </div>
                        <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] ${offer.isActive ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-700/70 text-slate-300"}`}>
                          {offer.isActive ? "Ativa" : "Pausada"}
                        </span>
                      </div>
                    </button>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-300">
                      {offer.durationLabel ? <span className="rounded-full bg-slate-800 px-2 py-1">{offer.durationLabel}</span> : null}
                      {offer.modality ? <span className="rounded-full bg-slate-800 px-2 py-1">{offer.modality}</span> : null}
                      {offer.latestLanding ? <span className="rounded-full bg-cyan-500/15 px-2 py-1 text-cyan-200">v{offer.latestLanding.version}</span> : null}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => selectOfferForEditing(offer.id)}
                        className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-100"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleOfferStatus(offer)}
                        disabled={togglingOfferId === offer.id}
                        className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-100 disabled:opacity-50"
                      >
                        {togglingOfferId === offer.id ? "Atualizando..." : offer.isActive ? "Pausar" : "Ativar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteOffer(offer)}
                        disabled={deletingOfferId === offer.id}
                        className="inline-flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-100 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {deletingOfferId === offer.id ? "Excluindo..." : "Excluir"}
                      </button>
                    </div>
                  </div>
                ))}
                {!offers.length && !loading ? (
                  <div className="rounded-2xl border border-dashed border-slate-700 p-5 text-sm text-slate-400">
                    Nenhuma oferta cadastrada ainda.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {error ? <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

          {selectedSession ? (
            <>
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
                <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5 shadow-2xl shadow-black/20">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-violet-300/80">Workspace do chatbot</p>
                      <h3 className="mt-1 text-lg font-bold text-white">{selectedSession.title}</h3>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.3em] ${selectedSession.status === "published" ? "bg-emerald-500/15 text-emerald-200" : selectedSession.status === "preview_ready" ? "bg-cyan-500/15 text-cyan-200" : "bg-violet-500/15 text-violet-200"}`}>
                      {selectedSession.status}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <MetricCard icon={<MessageSquare className="h-4 w-4 text-violet-200" />} label="Mensagens" value={selectedSession.chatHistory.length} helper="Historico da criacao" />
                    <MetricCard icon={<MonitorPlay className="h-4 w-4 text-cyan-200" />} label="Preview" value={selectedSession.readiness.canPreview ? 1 : 0} helper={selectedSession.readiness.canPreview ? "Pronto para gerar" : `Faltando: ${selectedSession.readiness.missingPreviewFields.join(", ") || "dados"}`} />
                    <MetricCard icon={<Sparkles className="h-4 w-4 text-emerald-200" />} label="Publicacao" value={selectedSession.readiness.canPublish ? 1 : 0} helper={selectedSession.readiness.canPublish ? "Pronto para publicar" : `Faltando: ${selectedSession.readiness.missingPublishFields.join(", ") || "dados"}`} />
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5 shadow-2xl shadow-black/20">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-cyan-300/80">Acoes</p>
                      <h3 className="mt-1 text-lg font-bold text-white">Preview e publicacao</h3>
                    </div>
                    {selectedSession.publishedOfferId ? (
                      <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.3em] text-emerald-200">
                        offer #{selectedSession.publishedOfferId}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button type="button" disabled={previewing} className="inline-flex items-center gap-2 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm font-bold text-cyan-100 disabled:opacity-50" onClick={generateSessionPreview}>
                      {previewing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <MonitorPlay className="h-4 w-4" />}
                      {previewing ? "Gerando..." : "Gerar preview"}
                    </button>
                    <button type="button" disabled={publishingSession} className="inline-flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-100 disabled:opacity-50" onClick={publishSession}>
                      {publishingSession ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      {publishingSession ? "Publicando..." : "Publicar oferta"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-2 shadow-2xl shadow-black/20">
                <div className="flex flex-wrap gap-2">
                  <SectionTabButton active={activeTab === "chat"} icon={<MessageSquare className="h-4 w-4" />} label="Chat criador" onClick={() => setActiveTab("chat")} />
                  <SectionTabButton active={activeTab === "prompt"} icon={<Bot className="h-4 w-4" />} label="Prompt" onClick={() => setActiveTab("prompt")} />
                  <SectionTabButton active={activeTab === "preview"} icon={<MonitorPlay className="h-4 w-4" />} label="Preview" onClick={() => setActiveTab("preview")} />
                  <SectionTabButton active={activeTab === "publish"} icon={<Globe className="h-4 w-4" />} label="Publicar oferta" onClick={() => setActiveTab("publish")} />
                </div>
              </div>
            </>
          ) : null}

          {!selectedSession ? (
          <>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="grid gap-4 md:grid-cols-3">
              <MetricCard icon={<Send className="h-4 w-4 text-cyan-200" />} label="Envios" value={metrics?.deliveries ?? 0} helper="Links enviados pelo WhatsApp" />
              <MetricCard icon={<Eye className="h-4 w-4 text-emerald-200" />} label="Views" value={metrics?.views ?? 0} helper="Aberturas rastreadas" />
              <MetricCard icon={<Link2 className="h-4 w-4 text-amber-200" />} label="Cliques" value={metrics?.clicks ?? 0} helper={`CTR ${metrics?.clickRate ?? 0}%`} />
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5 shadow-2xl shadow-black/20">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-cyan-300/80">Operacoes</p>
                  <h3 className="mt-1 text-lg font-bold text-white">Geracao e publicacao</h3>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {selectedOffer ? (
                    <button
                      type="button"
                      onClick={() => void toggleOfferStatus(selectedOffer)}
                      disabled={togglingOfferId === selectedOffer.id}
                      className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-bold uppercase tracking-wider text-amber-100 disabled:opacity-50"
                    >
                      {togglingOfferId === selectedOffer.id ? "Atualizando..." : selectedOffer.isActive ? "Pausar oferta" : "Ativar oferta"}
                    </button>
                  ) : null}
                  {selectedOffer ? (
                    <button
                      type="button"
                      onClick={() => void deleteOffer(selectedOffer)}
                      disabled={deletingOfferId === selectedOffer.id}
                      className="inline-flex items-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-bold uppercase tracking-wider text-rose-100 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      {deletingOfferId === selectedOffer.id ? "Excluindo..." : "Excluir"}
                    </button>
                  ) : null}
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
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <button type="button" disabled={previewing} className="inline-flex items-center gap-2 rounded-2xl border border-violet-500/30 bg-violet-500/10 px-4 py-3 text-sm font-bold text-violet-100 disabled:opacity-50" onClick={generateDraftPreview}>
                  {previewing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <MonitorPlay className="h-4 w-4" />}
                  {previewing ? "Gerando preview..." : "Gerar preview IA"}
                </button>
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
                      onClick={() => {
                        setPreview(version);
                        if (selectedOffer) setPreviewOffer(selectedOffer);
                        setActiveTab("preview");
                      }}
                    >
                      <span>v{version.version} | {version.status}</span>
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

          <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-2 shadow-2xl shadow-black/20">
            <div className="flex flex-wrap gap-2">
              <SectionTabButton active={activeTab === "details"} icon={<Globe className="h-4 w-4" />} label="Informacoes" onClick={() => setActiveTab("details")} />
              <SectionTabButton active={activeTab === "prompt"} icon={<Bot className="h-4 w-4" />} label="Prompt" onClick={() => setActiveTab("prompt")} />
              <SectionTabButton active={activeTab === "preview"} icon={<MonitorPlay className="h-4 w-4" />} label="Preview" onClick={() => setActiveTab("preview")} />
            </div>
          </div>

          {activeTab === "details" ? (
            <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5 shadow-2xl shadow-black/20">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-cyan-300" />
                <h3 className="text-lg font-bold text-white">Informacoes da oferta</h3>
              </div>
              <p className="mt-2 text-sm text-slate-400">
                Preencha os dados comerciais da oferta. Esse bloco alimenta a IA e a landing publicada.
              </p>
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
          ) : null}

          {activeTab === "prompt" ? (
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
          ) : null}

          {activeTab === "preview" ? (
            <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
              <div className="rounded-[32px] border border-slate-800 bg-slate-900/60 p-5 shadow-2xl shadow-black/30">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-violet-300" />
                  <h3 className="text-lg font-black text-white">Contexto do lead para preview</h3>
                </div>
                <p className="mt-2 text-sm text-slate-400">
                  Use esse contexto para testar variacoes da copy antes de publicar a landing.
                </p>
                <div className="mt-5 space-y-3">
                  <input className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white" placeholder="Curso/interesse detectado" value={previewLeadContext.interestedCourse} onChange={(e) => setPreviewLeadContext((current) => ({ ...current, interestedCourse: e.target.value }))} />
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                    <input className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white" placeholder="Modalidade" value={previewLeadContext.courseMode} onChange={(e) => setPreviewLeadContext((current) => ({ ...current, courseMode: e.target.value }))} />
                    <input className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white" placeholder="Nivel do lead" value={previewLeadContext.level} onChange={(e) => setPreviewLeadContext((current) => ({ ...current, level: e.target.value }))} />
                  </div>
                  <input className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white" placeholder="Objetivo principal" value={previewLeadContext.objective} onChange={(e) => setPreviewLeadContext((current) => ({ ...current, objective: e.target.value }))} />
                  <textarea className="min-h-[160px] w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white" placeholder="Resumo da conversa para dar contexto ao preview" value={previewLeadContext.summary} onChange={(e) => setPreviewLeadContext((current) => ({ ...current, summary: e.target.value }))} />
                  <button type="button" className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-bold text-slate-200" onClick={() => setPreviewLeadContext(emptyPreviewLeadContext)}>
                    <RefreshCw className="h-4 w-4" />
                    Limpar contexto
                  </button>
                </div>
              </div>

              <div className="rounded-[32px] border border-slate-800 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(251,191,36,0.14),_transparent_28%),linear-gradient(180deg,_rgba(2,6,23,0.98),_rgba(15,23,42,0.96))] p-6 shadow-2xl shadow-black/30">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-cyan-300" />
                    <h3 className="text-xl font-black text-white">Preview da landing</h3>
                  </div>
                  <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.3em] text-cyan-200">
                    estilo editor
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-400">
                  Preencha os dados, ajuste o prompt e gere o preview visual sem precisar publicar.
                </p>

                {preview && previewOffer ? (
                  <>
                    <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                      <span className="rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1">status: {preview.status}</span>
                      <span className="rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1">versao: {preview.version}</span>
                      <span className="rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1">{previewOffer.slug}</span>
                    </div>
                    <div className="mt-6 overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/60">
                      <div className="flex items-center gap-2 border-b border-white/10 bg-slate-950/80 px-4 py-3">
                        <span className="h-3 w-3 rounded-full bg-rose-400/80" />
                        <span className="h-3 w-3 rounded-full bg-amber-400/80" />
                        <span className="h-3 w-3 rounded-full bg-emerald-400/80" />
                        <p className="ml-3 text-xs font-bold uppercase tracking-[0.3em] text-slate-400">Canvas de preview</p>
                      </div>
                      <div className="max-h-[980px] overflow-y-auto supabase-scroll">
                        <LandingPreviewCanvas
                          offer={previewOffer}
                          landing={preview}
                          previewLabel={preview.status === "preview" ? "Preview ao vivo" : "Landing publicada"}
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="mt-6 rounded-3xl border border-dashed border-slate-700 p-8 text-center text-slate-400">
                    Gere um preview para visualizar a landing completa.
                  </div>
                )}
              </div>
            </div>
          ) : null}
          </>
          ) : null}

          {selectedSession && activeTab === "chat" ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="rounded-[32px] border border-slate-800 bg-slate-900/60 p-5 shadow-2xl shadow-black/30">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-violet-300" />
                  <h3 className="text-lg font-bold text-white">Chat criador</h3>
                </div>
                <p className="mt-2 text-sm text-slate-400">
                  Converse com a IA sobre o curso, a promessa, o publico e o CTA. Ela monta o rascunho da landing para voce.
                </p>
                <div className="mt-5 space-y-3">
                  <div className="max-h-[420px] space-y-3 overflow-y-auto rounded-3xl border border-slate-800 bg-slate-950/70 p-4 supabase-scroll">
                    {selectedSession.chatHistory.map((message, index) => (
                      <div
                        key={`${message.createdAt}-${index}`}
                        className={`rounded-2xl border px-4 py-3 text-sm ${message.role === "assistant" ? "border-violet-500/20 bg-violet-500/10 text-violet-50" : "border-slate-800 bg-slate-900 text-slate-100"}`}
                      >
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400">
                          {message.role === "assistant" ? "Assistente" : "Voce"}
                        </p>
                        <p className="leading-7">{message.content}</p>
                      </div>
                    ))}
                    {!selectedSession.chatHistory.length ? (
                      <div className="rounded-2xl border border-dashed border-slate-700 p-5 text-sm text-slate-400">
                        Comece descrevendo a oferta que voce quer criar.
                      </div>
                    ) : null}
                  </div>
                  <textarea
                    className="min-h-[120px] w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white"
                    placeholder="Exemplo: Quero uma landing para curso de Informatica de 1 mes, com foco em iniciantes e CTA para falar com a equipe..."
                    value={sessionChatMessage}
                    onChange={(event) => setSessionChatMessage(event.target.value)}
                  />
                  <div className="flex justify-end">
                    <button type="button" disabled={sendingChat || !sessionChatMessage.trim()} className="inline-flex items-center gap-2 rounded-2xl bg-violet-500 px-4 py-3 text-sm font-bold text-white disabled:opacity-50" onClick={sendChatMessage}>
                      {sendingChat ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      {sendingChat ? "Enviando..." : "Enviar para o bot"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <ArchitectureCard />
                <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5 shadow-2xl shadow-black/20">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-cyan-300" />
                    <h3 className="text-lg font-bold text-white">Rascunho atual</h3>
                  </div>
                  <div className="mt-4 space-y-3 text-sm text-slate-300">
                    <DraftLine label="Titulo" value={selectedSession.offerDraft.title || "Nao definido"} />
                    <DraftLine label="Slug" value={selectedSession.offerDraft.slug || "Nao definido"} />
                    <DraftLine label="CTA" value={selectedSession.offerDraft.ctaLabel || "Nao definido"} />
                    <DraftLine label="Fatos" value={selectedSession.offerDraft.approvedFacts.length ? `${selectedSession.offerDraft.approvedFacts.length} itens` : "Nenhum ainda"} />
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {selectedSession && activeTab === "prompt" ? (
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
                title="Prompt desta sessao"
                icon={<MessageSquare className="h-4 w-4 text-violet-200" />}
                prompt={sessionPromptDraft}
                onChange={setSessionPromptDraft}
                onSave={saveSessionPrompt}
                saving={savingSessionPrompt}
              />
            </div>
          ) : null}

          {selectedSession && activeTab === "publish" ? (
            <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5 shadow-2xl shadow-black/20">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-emerald-300" />
                <h3 className="text-lg font-bold text-white">Publicar oferta</h3>
              </div>
              <p className="mt-2 text-sm text-slate-400">
                Aqui voce faz os ajustes finais antes de publicar a rota publica da landing.
              </p>
              <div className="mt-4 grid gap-3">
                <input className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white" placeholder="Titulo" value={sessionDraft.title} onChange={(e) => setSessionDraft((current) => ({ ...current, title: e.target.value }))} />
                <input className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white" placeholder="Slug" value={sessionDraft.slug} onChange={(e) => setSessionDraft((current) => ({ ...current, slug: e.target.value }))} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <input className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white" placeholder="Duracao" value={sessionDraft.durationLabel} onChange={(e) => setSessionDraft((current) => ({ ...current, durationLabel: e.target.value }))} />
                  <input className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white" placeholder="Modalidade" value={sessionDraft.modality} onChange={(e) => setSessionDraft((current) => ({ ...current, modality: e.target.value }))} />
                </div>
                <textarea className="min-h-[88px] rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white" placeholder="Descricao curta" value={sessionDraft.shortDescription} onChange={(e) => setSessionDraft((current) => ({ ...current, shortDescription: e.target.value }))} />
                <textarea className="min-h-[88px] rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white" placeholder="Aliases, um por linha" value={sessionDraft.aliases} onChange={(e) => setSessionDraft((current) => ({ ...current, aliases: e.target.value }))} />
                <textarea className="min-h-[110px] rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white" placeholder="Fatos aprovados, um por linha" value={sessionDraft.approvedFacts} onChange={(e) => setSessionDraft((current) => ({ ...current, approvedFacts: e.target.value }))} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <input className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white" placeholder="CTA label" value={sessionDraft.ctaLabel} onChange={(e) => setSessionDraft((current) => ({ ...current, ctaLabel: e.target.value }))} />
                  <input className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white" placeholder="CTA URL" value={sessionDraft.ctaUrl} onChange={(e) => setSessionDraft((current) => ({ ...current, ctaUrl: e.target.value }))} />
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200">
                  <span>Oferta ativa</span>
                  <input type="checkbox" checked={sessionDraft.isActive} onChange={(e) => setSessionDraft((current) => ({ ...current, isActive: e.target.checked }))} />
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-300">
                  <p className="font-semibold text-white">Campos faltando</p>
                  <p className="mt-2">{getMissingPublishFieldsFromOfferDraft(sessionDraft).length ? getMissingPublishFieldsFromOfferDraft(sessionDraft).join(", ") : "Nenhum. A oferta ja pode ser publicada."}</p>
                </div>
                <div className="flex justify-end">
                  <button type="button" disabled={publishingSession} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-bold text-slate-950 disabled:opacity-50" onClick={publishSession}>
                    {publishingSession ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {publishingSession ? "Publicando..." : "Publicar oferta"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {selectedSession && activeTab === "preview" ? (
            <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
              <div className="rounded-[32px] border border-slate-800 bg-slate-900/60 p-5 shadow-2xl shadow-black/30">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-violet-300" />
                  <h3 className="text-lg font-black text-white">Contexto do preview</h3>
                </div>
                <p className="mt-2 text-sm text-slate-400">Adicione contexto opcional para orientar a copy antes de publicar.</p>
                <div className="mt-5 space-y-3">
                  <input className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white" placeholder="Curso/interesse detectado" value={previewLeadContext.interestedCourse} onChange={(e) => setPreviewLeadContext((current) => ({ ...current, interestedCourse: e.target.value }))} />
                  <input className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white" placeholder="Modalidade" value={previewLeadContext.courseMode} onChange={(e) => setPreviewLeadContext((current) => ({ ...current, courseMode: e.target.value }))} />
                  <input className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white" placeholder="Objetivo principal" value={previewLeadContext.objective} onChange={(e) => setPreviewLeadContext((current) => ({ ...current, objective: e.target.value }))} />
                  <textarea className="min-h-[140px] w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white" placeholder="Resumo da conversa para dar contexto" value={previewLeadContext.summary} onChange={(e) => setPreviewLeadContext((current) => ({ ...current, summary: e.target.value }))} />
                  <button type="button" className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-bold text-slate-200" onClick={() => setPreviewLeadContext(emptyPreviewLeadContext)}>
                    <RefreshCw className="h-4 w-4" />
                    Limpar contexto
                  </button>
                </div>
              </div>

              <div className="rounded-[32px] border border-slate-800 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(251,191,36,0.14),_transparent_28%),linear-gradient(180deg,_rgba(2,6,23,0.98),_rgba(15,23,42,0.96))] p-6 shadow-2xl shadow-black/30">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-cyan-300" />
                    <h3 className="text-xl font-black text-white">Preview da landing</h3>
                  </div>
                  <button type="button" disabled={previewing} className="inline-flex items-center gap-2 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.3em] text-cyan-100 disabled:opacity-50" onClick={generateSessionPreview}>
                    {previewing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <MonitorPlay className="h-4 w-4" />}
                    regenerar
                  </button>
                </div>
                {selectedSession.preview ? (
                  <div className="mt-6 overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/60">
                    <div className="flex items-center gap-2 border-b border-white/10 bg-slate-950/80 px-4 py-3">
                      <span className="h-3 w-3 rounded-full bg-rose-400/80" />
                      <span className="h-3 w-3 rounded-full bg-amber-400/80" />
                      <span className="h-3 w-3 rounded-full bg-emerald-400/80" />
                      <p className="ml-3 text-xs font-bold uppercase tracking-[0.3em] text-slate-400">Canvas de preview</p>
                    </div>
                    <div className="max-h-[980px] overflow-y-auto supabase-scroll">
                      <LandingPreviewCanvas offer={selectedSession.preview.offer} landing={selectedSession.preview.landing} previewLabel="Preview do chatbot" />
                    </div>
                  </div>
                ) : (
                  <div className="mt-6 rounded-3xl border border-dashed border-slate-700 p-8 text-center text-slate-400">
                    Gere o preview para visualizar a landing completa do chatbot.
                  </div>
                )}
              </div>
            </div>
          ) : null}
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

function SectionTabButton({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold transition-all ${
        active
          ? "border border-cyan-400/20 bg-cyan-500/10 text-cyan-100 shadow-lg shadow-cyan-950/20"
          : "border border-transparent bg-slate-950/40 text-slate-400 hover:border-slate-700 hover:text-slate-100"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ArchitectureCard() {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5 shadow-2xl shadow-black/20">
      <div className="flex items-center gap-2">
        <Layers3 className="h-4 w-4 text-cyan-300" />
        <h3 className="text-lg font-bold text-white">Arquitetura da landing</h3>
      </div>
      <div className="mt-4 space-y-3 text-sm text-slate-300">
        <DraftLine label="1. Chat" value="A IA conversa com voce e monta um draft estruturado da oferta." />
        <DraftLine label="2. Preview" value="Esse draft vira JSON de secoes da landing, sem HTML livre vindo da IA." />
        <DraftLine label="3. Publicacao" value="Ao publicar, o draft vira Offer + LandingPage no banco." />
        <DraftLine label="4. Rota publica" value="A rota /ofertas/:slug renderiza a pagina no React usando esse JSON." />
      </div>
    </div>
  );
}

function DraftLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500">{label}</p>
      <p className="mt-2 leading-6 text-slate-200">{value}</p>
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
