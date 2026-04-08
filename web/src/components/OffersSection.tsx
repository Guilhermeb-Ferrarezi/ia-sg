import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Brain, ChartNoAxesColumn, ChevronDown, ChevronLeft, ChevronRight, CodeXml, CornerDownLeft, Ellipsis, FileText, Globe, History, LayoutDashboard, Menu, MessageSquare, MonitorPlay, PanelLeftClose, PanelsTopLeft, Plus, RefreshCw, Send, Sparkles, Trash2, X } from "lucide-react";
import { apiFetch } from "../lib/apiFetch";
import type { LandingCreationSession, LandingPageSummary, LandingPreviewLeadContext, Offer } from "../types/dashboard";
import LandingPreviewCanvas from "./LandingPreviewCanvas";
import LandingCodeIdePane from "./LandingCodeIdePane";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/dropdown-menu";
import logoVermelha from "../assets/logoVermelha.png";

type ToastType = "success" | "error" | "info" | "loading";
const CHAT_PANE_MIN_WIDTH = 320;
const CHAT_PANE_MAX_WIDTH = 600;
const CHAT_PANE_DEFAULT_WIDTH = 380;
const CHAT_COMPOSER_MAX_HEIGHT = 224;

const emptyPreviewLeadContext: LandingPreviewLeadContext = {
  interestedCourse: "",
  courseMode: "",
  objective: "",
  level: "",
  summary: ""
};

const chatTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit"
});

const sessionTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit"
});

function sortSessionsByRecent(sessions: LandingCreationSession[]): LandingCreationSession[] {
  return [...sessions].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

function formatChatTimeLabel(value: string): string {
  return chatTimeFormatter.format(new Date(value));
}

function formatSessionTimeLabel(value: string): string {
  return sessionTimeFormatter.format(new Date(value));
}

function clampChatPaneWidth(value: number): number {
  return Math.min(CHAT_PANE_MAX_WIDTH, Math.max(CHAT_PANE_MIN_WIDTH, value));
}

function isAbortError(error: unknown): boolean {
  return (error instanceof DOMException && error.name === "AbortError")
    || (error instanceof Error && error.name === "AbortError");
}

function buildSessionAutoPreviewKey(session: Pick<LandingCreationSession, "offerDraft" | "promptDraft">): string {
  return JSON.stringify({
    offerDraft: session.offerDraft,
    promptDraft: session.promptDraft
  });
}

function ThinkingBlock({ thinking, label = "Raciocinio" }: { thinking: string; label?: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="relative z-10 mb-2.5">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center gap-2 rounded-xl border border-slate-700/30 bg-slate-900/40 px-3 py-2 text-left transition-colors hover:bg-slate-800/50"
      >
        <Brain className="h-3.5 w-3.5 shrink-0 text-violet-400/70" />
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</span>
        <motion.span
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="ml-auto"
        >
          <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <p className="whitespace-pre-wrap rounded-b-xl border border-t-0 border-slate-700/30 bg-slate-900/30 px-3 py-2.5 text-[13px] leading-relaxed text-slate-400/80">
              {thinking}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function OffersSection({
  active,
  onWorkspaceModeChange,
  onRequestSidebar,
  addToast,
  updateToast
}: {
  active: boolean;
  onWorkspaceModeChange?: (open: boolean) => void;
  onRequestSidebar?: () => void;
  addToast: (message: string, type?: ToastType) => string;
  updateToast: (id: string, message: string, type: ToastType) => void;
}) {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [sessions, setSessions] = useState<LandingCreationSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [pendingSession, setPendingSession] = useState<LandingCreationSession | null>(null);
  const [sessionChatMessage, setSessionChatMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [creatingSession] = useState(false);
  const [sendingChat, setSendingChat] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [publishingSession, setPublishingSession] = useState(false);
  const [deletingOfferId, setDeletingOfferId] = useState<number | null>(null);
  const [togglingOfferId, setTogglingOfferId] = useState<number | null>(null);
  const [showDraftPanel, setShowDraftPanel] = useState(false);
  const [forceHistorySidebar, setForceHistorySidebar] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [chatPaneWidth, setChatPaneWidth] = useState(CHAT_PANE_DEFAULT_WIDTH);
  const [isResizingChatPane, setIsResizingChatPane] = useState(false);
  const [previewPaneMode, setPreviewPaneMode] = useState<"preview" | "code">("preview");
  const [logoHovered, setLogoHovered] = useState(false);
  const [error, setError] = useState("");
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [plannerCustomMode, setPlannerCustomMode] = useState(false);
  const [plannerSelectedOption, setPlannerSelectedOption] = useState<string | null>(null);
  const [plannerAskIndex, setPlannerAskIndex] = useState(0);
  const [plannerAnswers, setPlannerAnswers] = useState<Record<string, string>>({});

  const sortedSessions = useMemo(() => sortSessionsByRecent(sessions), [sessions]);
  const latestSession = useMemo(() => sortedSessions[0] ?? null, [sortedSessions]);
  const selectedSession = useMemo(() => {
    if (selectedSessionId === 0) return pendingSession;
    return sortedSessions.find((session) => session.id === selectedSessionId) || null;
  }, [sortedSessions, selectedSessionId, pendingSession]);
  const selectedSessionCodeBundle = useMemo(() => {
    if (!selectedSession) return null;
    return selectedSession.preview?.landing?.landingCodeBundleJson || selectedSession.codeBundleDraft || null;
  }, [selectedSession]);
  const askQueue = useMemo(
    () => (sendingChat || !selectedSession?.planner.shouldAsk ? [] : selectedSession.planner.askQueue),
    [sendingChat, selectedSession]
  );
  const activePlannerAsk = askQueue[plannerAskIndex] ?? null;
  const hasPlannerAsk = askQueue.length > 0;

  const [localOfferDraft, setLocalOfferDraft] = useState<LandingCreationSession["offerDraft"] | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [sessionToDeleteId, setSessionToDeleteId] = useState<number | null>(null);
  const draftDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatResizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const sendingChatRef = useRef(false);
  const chatAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (showDraftPanel && selectedSession) {
      setLocalOfferDraft(selectedSession.offerDraft);
    }
  }, [showDraftPanel, selectedSessionId]);

  useEffect(() => {
    setPreviewPaneMode("preview");
  }, [selectedSessionId]);

  useEffect(() => {
    if (previewPaneMode === "code" && !selectedSessionCodeBundle) {
      setPreviewPaneMode("preview");
    }
  }, [previewPaneMode, selectedSessionCodeBundle]);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      if (!chatResizeStateRef.current) return;
      const deltaX = event.clientX - chatResizeStateRef.current.startX;
      setChatPaneWidth(clampChatPaneWidth(chatResizeStateRef.current.startWidth + deltaX));
    }

    function handlePointerUp() {
      chatResizeStateRef.current = null;
      setIsResizingChatPane(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    window.addEventListener("blur", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      window.removeEventListener("blur", handlePointerUp);
    };
  }, []);

  // Reset ask index when session or queue changes
  useEffect(() => {
    setPlannerAskIndex(0);
    setPlannerAnswers({});
    setPlannerSelectedOption(null);
    setPlannerCustomMode(false);
  }, [selectedSessionId, askQueue.length]);

  useEffect(() => {
    function handleEsc(event: KeyboardEvent) {
      if (event.key === "Escape" && hasPlannerAsk && !sendingChat) {
        dismissAllAsks();
      }
    }
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [hasPlannerAsk, sendingChat]);

  const recentSessions = useMemo(() => {
    if (!selectedSession || selectedSession.id === 0) {
      return sortedSessions.slice(0, 3);
    }

    return sortedSessions.filter((session) => session.id !== selectedSession.id).slice(0, 3);
  }, [selectedSession, sortedSessions]);

  const sidebarSessions = useMemo(() => {
    if (selectedSessionId === 0 && pendingSession) {
      return [pendingSession, ...sortedSessions];
    }

    return sortedSessions;
  }, [pendingSession, selectedSessionId, sortedSessions]);

  const sessionToDelete = useMemo(() => {
    if (sessionToDeleteId === null) return null;
    if (selectedSession?.id === sessionToDeleteId) return selectedSession;
    return sortedSessions.find((session) => session.id === sessionToDeleteId) || null;
  }, [selectedSession, sessionToDeleteId, sortedSessions]);

  const openSessionWorkspace = useCallback((session: LandingCreationSession) => {
    setSelectedSessionId(session.id);
    setForceHistorySidebar(session.chatHistory.length === 0);
  }, []);

  const startChatResize = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (chatCollapsed) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    chatResizeStateRef.current = {
      startX: event.clientX,
      startWidth: chatPaneWidth
    };
    setIsResizingChatPane(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [chatCollapsed, chatPaneWidth]);

  const updateLocalDraft = useCallback((updatedDraft: LandingCreationSession["offerDraft"]) => {
    setLocalOfferDraft(updatedDraft);
    if (draftDebounceRef.current) clearTimeout(draftDebounceRef.current);
    draftDebounceRef.current = setTimeout(() => {
      void patchSessionDraft({ offerDraft: updatedDraft });
    }, 3000);
  }, []);

  const loadOffers = useCallback(async () => {
    const response = await apiFetch<{ offers: Offer[] }>("/offers");
    setOffers(response.offers);
  }, []);

  const loadSessions = useCallback(async () => {
    const response = await apiFetch<{ sessions: LandingCreationSession[] }>("/landing-creation/sessions");
    const nextSessions = sortSessionsByRecent(response.sessions);
    setSessions(nextSessions);
    setSelectedSessionId((current) => (current && nextSessions.some((session) => session.id === current) ? current : null));
  }, []);

  const replaceSession = useCallback((session: LandingCreationSession) => {
    setSessions((current) => {
      const next = current.some((item) => item.id === session.id)
        ? current.map((item) => (item.id === session.id ? session : item))
        : [session, ...current];
      return sortSessionsByRecent(next);
    });
    setSelectedSessionId(session.id);
  }, []);

  const ensureCreationSessionPersisted = useCallback(async (session: LandingCreationSession) => {
    if (session.id > 0) return session;

    const response = await apiFetch<{ session: LandingCreationSession }>("/landing-creation/sessions", { method: "POST" });
    replaceSession(response.session);
    setPendingSession(null);
    return response.session;
  }, [replaceSession]);

  useEffect(() => {
    if (!active) return;
    setLoading(true);
    setError("");
    Promise.all([loadOffers(), loadSessions()])
      .catch((err) => setError(err instanceof Error ? err.message : "Falha ao carregar a area de landings."))
      .finally(() => setLoading(false));
  }, [active, loadOffers, loadSessions]);

  useEffect(() => {
    setSessionChatMessage("");
  }, [selectedSessionId]);

  useEffect(() => {
    setPlannerSelectedOption(null);
    setPlannerCustomMode(false);
  }, [activePlannerAsk?.id]);

  useEffect(() => {
    onWorkspaceModeChange?.(active && Boolean(selectedSession));
  }, [active, onWorkspaceModeChange, selectedSession]);

  useEffect(() => {
    const textarea = composerTextareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    const nextHeight = Math.min(textarea.scrollHeight, CHAT_COMPOSER_MAX_HEIGHT);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > CHAT_COMPOSER_MAX_HEIGHT ? "auto" : "hidden";
  }, [sessionChatMessage, selectedSessionId]);

  const createSession = () => {
    const now = new Date().toISOString();
    const local: LandingCreationSession = {
      id: 0,
      title: "",
      status: "draft",
      offerDraft: {
        title: "",
        slug: "",
        aliases: [],
        durationLabel: "",
        modality: "",
        shortDescription: "",
        approvedFacts: [],
        ctaLabel: "",
        ctaUrl: "",
        visualTheme: "",
        colorPalette: "",
        typographyStyle: "",
        layoutStyle: "",
        isActive: true,
      },
      promptDraft: {
        systemPrompt: "",
        toneGuidelines: "",
        requiredRules: [],
        ctaRules: [],
        autoGenerateEnabled: true,
        autoSendEnabled: false,
        confidenceThreshold: 0.6,
      },
      chatHistory: [],
      readiness: {
        canPreview: false,
        canPublish: false,
        missingPreviewFields: [],
        missingPublishFields: [],
      },
      planner: {
        planSummary: "",
        promptDepth: "shallow",
        shouldAsk: false,
        askQueue: [],
        readyForVisualGeneration: false,
        activeMessageId: null,
        activeQuestionId: null,
        stageSummary: "",
      },
      builderDraft: null,
      codeBundleDraft: null,
      preview: null,
      publishedOfferId: null,
      createdAt: now,
      updatedAt: now,
    };
    setPendingSession(local as LandingCreationSession);
    setSelectedSessionId(0);
  };

  // Advance to next ask locally, or send consolidated answers when done
  const advancePlannerAsk = () => {
    const currentAsk = askQueue[plannerAskIndex];
    if (!currentAsk) return;

    const answer = plannerCustomMode
      ? sessionChatMessage.trim()
      : (plannerSelectedOption || "").trim();
    if (!answer) return;

    const updatedAnswers = { ...plannerAnswers, [currentAsk.id || `ask-${plannerAskIndex}`]: answer };
    setPlannerAnswers(updatedAnswers);
    setPlannerSelectedOption(null);
    setPlannerCustomMode(false);
    setSessionChatMessage("");

    const nextIndex = plannerAskIndex + 1;
    if (nextIndex < askQueue.length) {
      // More asks to show
      setPlannerAskIndex(nextIndex);
    } else {
      // All asks answered — send consolidated message
      const consolidated = askQueue.map((ask, i) => {
        const key = ask.id || `ask-${i}`;
        return `${ask.label}: ${updatedAnswers[key] || "pular"}`;
      }).join("\n");
      setPlannerAskIndex(0);
      setPlannerAnswers({});
      void sendChatMessage(consolidated);
    }
  };

  const dismissAllAsks = () => {
    const consolidated = askQueue.map((ask) => `${ask.label}: pular`).join("\n");
    setPlannerAskIndex(0);
    setPlannerAnswers({});
    setPlannerSelectedOption(null);
    setPlannerCustomMode(false);
    setSessionChatMessage("");
    void sendChatMessage(consolidated);
  };

  const stopChatGeneration = useCallback(() => {
    const controller = chatAbortControllerRef.current;
    if (!controller) return;
    controller.abort();
    chatAbortControllerRef.current = null;
    sendingChatRef.current = false;
    setSendingChat(false);
    setPreviewing(false);
    addToast("Geracao interrompida.", "info");
  }, [addToast]);

  const sendChatMessage = async (messageOverride?: string) => {
    if (!selectedSession) return;
    if (sendingChatRef.current) return;
    const resolvedMessage = (messageOverride ?? sessionChatMessage).trim();
    if (!resolvedMessage) return;

    sendingChatRef.current = true;
    setSendingChat(true);
    const message = resolvedMessage;
    setSessionChatMessage("");
    setPlannerSelectedOption(null);
    setPlannerCustomMode(false);

    // If session is pending (not yet saved), create it in DB first
    let session = selectedSession;
    if (session.id === 0) {
      try {
        session = await ensureCreationSessionPersisted(session);
      } catch (err) {
        addToast(err instanceof Error ? err.message : "Falha ao criar workspace.", "error");
        setSessionChatMessage(message);
        sendingChatRef.current = false;
        setSendingChat(false);
        return;
      }
    }

    // Optimistic: show user message immediately
    const absorbAskAnswer = Boolean(hasPlannerAsk);
    const optimisticPlanner = absorbAskAnswer
      ? {
          ...session.planner,
          askQueue: [],
          activeQuestionId: null,
          shouldAsk: false
        }
      : session.planner;
    const optimisticSession: LandingCreationSession = {
      ...session,
      planner: optimisticPlanner,
      chatHistory: absorbAskAnswer
        ? session.chatHistory
        : [
            ...session.chatHistory,
            {
              id: `user-${Date.now()}`,
              role: "user",
              kind: "chat",
              content: message,
              createdAt: new Date().toISOString()
            }
          ],
      updatedAt: new Date().toISOString()
    };
    replaceSession(optimisticSession);

    const abortController = new AbortController();
    chatAbortControllerRef.current = abortController;
    let requestPhase: "message" | "preview" = "message";

    try {
      const response = await apiFetch<{ session: LandingCreationSession }>(
        `/landing-creation/sessions/${session.id}/messages`,
        {
          method: "POST",
          body: JSON.stringify({ message, absorbAskAnswer }),
          signal: abortController.signal
        }
      );
      replaceSession(response.session);
      setPlannerAskIndex(0);
      setPlannerAnswers({});

      const shouldAutoPreview = !response.session.preview
        && response.session.planner.readyForVisualGeneration
        && (
          !session.preview
          || buildSessionAutoPreviewKey(session) !== buildSessionAutoPreviewKey(response.session)
        );

      if (shouldAutoPreview) {
        requestPhase = "preview";
        setPreviewing(true);
        try {
          const previewResponse = await apiFetch<{ session: LandingCreationSession }>(
            `/landing-creation/sessions/${session.id}/preview`,
            {
              method: "POST",
              body: JSON.stringify({
                offerDraft: response.session.offerDraft,
                promptDraft: response.session.promptDraft,
                leadContext: emptyPreviewLeadContext
              }),
              signal: abortController.signal
            }
          );
          replaceSession(previewResponse.session);
        } catch (previewErr) {
          if (isAbortError(previewErr)) {
            return;
          }
          addToast(previewErr instanceof Error ? previewErr.message : "Falha ao gerar preview automatico.", "error");
        } finally {
          setPreviewing(false);
        }
      }
    } catch (err) {
      if (isAbortError(err)) {
        if (requestPhase === "message") {
          replaceSession(session);
          setSessionChatMessage(message);
        }
        return;
      }
      addToast(err instanceof Error ? err.message : "Falha ao enviar mensagem.", "error");
      replaceSession(session);
      setSessionChatMessage(message);
      // no-op: planner answers already reset
    } finally {
      if (chatAbortControllerRef.current === abortController) {
        chatAbortControllerRef.current = null;
      }
      sendingChatRef.current = false;
      setSendingChat(false);
    }
  };

  const generateSessionPreview = async () => {
    if (!selectedSession) return;
    setPreviewing(true);
    const toastId = addToast("Gerando preview do chatbot...", "loading");
    try {
      const response = await apiFetch<{ session: LandingCreationSession }>(
        `/landing-creation/sessions/${selectedSession.id}/preview`,
        {
          method: "POST",
          body: JSON.stringify({
            offerDraft: selectedSession.offerDraft,
            promptDraft: selectedSession.promptDraft,
            leadContext: emptyPreviewLeadContext
          })
        }
      );
      replaceSession(response.session);
      updateToast(toastId, "Preview atualizado.", "success");
    } catch (err) {
      updateToast(toastId, err instanceof Error ? err.message : "Falha ao gerar preview.", "error");
    } finally {
      setPreviewing(false);
    }
  };

  const publishSession = async () => {
    if (!selectedSession) return;
    setPublishingSession(true);
    const toastId = addToast("Publicando oferta do chatbot...", "loading");
    try {
      const response = await apiFetch<{ session: LandingCreationSession; landing: LandingPageSummary }>(
        `/landing-creation/sessions/${selectedSession.id}/publish`,
        {
          method: "POST",
          body: JSON.stringify({
            offerDraft: selectedSession.offerDraft,
            promptDraft: selectedSession.promptDraft
          })
        }
      );
      replaceSession(response.session.preview
        ? {
          ...response.session,
          preview: {
            ...response.session.preview,
            landing: response.landing
          }
        }
        : response.session);
      await loadOffers();
      updateToast(
        toastId,
        response.landing.artifactUrl ? "Oferta publicada e artefato enviado ao bucket." : "Oferta publicada com sucesso.",
        "success"
      );
    } catch (err) {
      updateToast(toastId, err instanceof Error ? err.message : "Falha ao publicar oferta.", "error");
    } finally {
      setPublishingSession(false);
    }
  };

  const patchSessionDraft = async (updates: Partial<{ offerDraft: any; promptDraft: any }>, silent = false) => {
    if (!selectedSession) return;
    const toastId = silent ? null : addToast("Atualizando rascunho...", "loading");
    try {
      const response = await apiFetch<{ session: LandingCreationSession }>(
        `/landing-creation/sessions/${selectedSession.id}`,
        {
          method: "PATCH",
          body: JSON.stringify(updates)
        }
      );
      replaceSession(response.session);
      if (toastId) updateToast(toastId, "Rascunho atualizado.", "success");
    } catch (err) {
      if (toastId) updateToast(toastId, err instanceof Error ? err.message : "Falha ao atualizar rascunho.", "error");
    }
  };

  const toggleOfferStatus = async (offer: Offer) => {
    setTogglingOfferId(offer.id);
    const toastId = addToast(`${offer.isActive ? "Pausando" : "Ativando"} oferta...`, "loading");
    try {
      await apiFetch(`/offers/${offer.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !offer.isActive })
      });
      await loadOffers();
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
      await loadOffers();
      updateToast(toastId, "Oferta removida com sucesso.", "success");
    } catch (err) {
      updateToast(toastId, err instanceof Error ? err.message : "Falha ao excluir oferta.", "error");
    } finally {
      setDeletingOfferId(null);
    }
  };

  const deleteSession = async (sessionId: number) => {

    const toastId = addToast("Excluindo rascunho...", "loading");
    try {
      await apiFetch(`/landing-creation/sessions/${sessionId}`, { method: "DELETE" });
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (selectedSessionId === sessionId) {
        setSelectedSessionId(null);
        setPendingSession(null);
      }
      setSessionToDeleteId((current) => (current === sessionId ? null : current));
      updateToast(toastId, "Rascunho removido.", "success");
    } catch (err) {
      updateToast(toastId, err instanceof Error ? err.message : "Falha ao excluir rascunho.", "error");
    }
  };

  if (!active) return null;

  const hasPreview = selectedSession?.preview != null;

  if (selectedSession) {
    const activeSessionTitle = selectedSession.title || "Nova landing";
    const activeSessionMeta = `Atualizado ${formatSessionTimeLabel(selectedSession.updatedAt)}`;
    const useCompactHistoryDropdown = selectedSession.chatHistory.length > 0 && !forceHistorySidebar;
    const showHistorySidebar = forceHistorySidebar || !useCompactHistoryDropdown;
    const workspaceGridColumns = showHistorySidebar
      ? (hasPreview ? `280px ${chatPaneWidth}px minmax(0,1fr)` : "280px minmax(0,1fr)")
      : chatCollapsed && hasPreview
        ? "0px minmax(0,1fr)"
        : (hasPreview ? `${chatPaneWidth}px minmax(0,1fr)` : "1fr");

    return (
      <motion.section 
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: "spring", stiffness: 250, damping: 25 }}
        className="flex h-screen w-full flex-col gap-0 overflow-hidden px-0 py-0 panel-enter"
      >
        <div className="sticky top-0 z-30">
          <div className="grid min-h-[48px] grid-cols-1 gap-2 border-b border-slate-800/60 bg-slate-950/95 px-3 py-1 backdrop-blur-xl lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)_auto] lg:items-center">
            <div className="flex min-w-0 items-center gap-2.5">
              {useCompactHistoryDropdown ? (
                <div className="flex min-w-0 items-center gap-2.5">
                  <button
                    type="button"
                    aria-label="Abrir menu principal"
                    className="group relative flex size-9 shrink-0 items-center justify-center rounded-lg overflow-hidden"
                    onMouseEnter={() => setLogoHovered(true)}
                    onMouseLeave={() => setLogoHovered(false)}
                    onClick={() => onRequestSidebar?.()}
                  >
                    <img
                      src={logoVermelha}
                      alt="Santos Tech"
                      className={`h-7 w-7 object-contain transition-all duration-200 ${logoHovered ? "opacity-0 scale-75" : "opacity-100 scale-100"}`}
                    />
                    <div className={`absolute inset-0 flex items-center justify-center transition-all duration-200 ${logoHovered ? "opacity-100 scale-100" : "opacity-0 scale-75"}`}>
                      <Menu className="h-5 w-5 text-slate-200" />
                    </div>
                  </button>

                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-white">{activeSessionTitle}</span>
                    <span className="block truncate text-[11px] text-slate-500">{activeSessionMeta}</span>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label="Historico de chats"
                        className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
                      >
                        <History className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>

                    <DropdownMenuContent
                      align="start"
                      sideOffset={8}
                      className="w-[min(92vw,340px)] rounded-xl border border-slate-700/80 bg-slate-950/95 p-2 shadow-xl backdrop-blur-2xl"
                    >
                      <DropdownMenuLabel className="px-2 pb-1.5 pt-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        Chats recentes
                      </DropdownMenuLabel>

                      <DropdownMenuGroup className="flex flex-col gap-0.5">
                        <DropdownMenuItem
                          onSelect={() => {
                            setForceHistorySidebar(true);
                            void createSession();
                          }}
                          className="rounded-lg px-2 py-2 focus:bg-violet-500/15 focus:text-white"
                        >
                          <Plus className="h-4 w-4 text-violet-400" />
                          <span className="text-sm font-semibold text-slate-200">Novo rascunho</span>
                        </DropdownMenuItem>
                      </DropdownMenuGroup>

                      <DropdownMenuSeparator className="my-1.5 bg-slate-800/90" />

                      {recentSessions.length ? (
                        <DropdownMenuGroup className="flex flex-col gap-0.5">
                          {recentSessions.map((session) => {
                            return (
                              <DropdownMenuItem
                                key={session.id}
                                onSelect={() => {
                                  setSelectedSessionId(session.id);
                                  setForceHistorySidebar(false);
                                }}
                                className="rounded-lg px-2 py-2 focus:bg-slate-800 focus:text-white"
                              >
                                <MessageSquare className="h-4 w-4 text-slate-400" />
                                <div className="flex min-w-0 flex-1 flex-col">
                                  <span className="truncate text-sm font-semibold text-slate-200">{session.title || "Nova landing"}</span>
                                  <span className="truncate text-[11px] text-slate-500">
                                    {formatSessionTimeLabel(session.updatedAt)}
                                  </span>
                                </div>
                              </DropdownMenuItem>
                            );
                          })}
                        </DropdownMenuGroup>
                      ) : (
                        <div className="px-2 py-2 text-sm text-slate-500">Sem outros chats.</div>
                      )}

                      <DropdownMenuSeparator className="my-1.5 bg-slate-800/90" />

                      <DropdownMenuGroup className="flex flex-col gap-0.5">
                        <DropdownMenuItem
                          onSelect={() => {
                            if (selectedSession.id > 0) setSessionToDeleteId(selectedSession.id);
                          }}
                          disabled={selectedSession.id === 0}
                          variant="destructive"
                          className="rounded-lg px-2 py-2"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="text-sm font-semibold">Excluir chat atual</span>
                        </DropdownMenuItem>

                        <DropdownMenuItem
                          onSelect={() => {
                            setSelectedSessionId(null);
                            setPendingSession(null);
                            setForceHistorySidebar(false);
                          }}
                          className="rounded-lg px-2 py-2 focus:bg-slate-800 focus:text-white"
                        >
                          <ArrowLeft className="h-4 w-4 text-slate-400" />
                          <span className="text-sm font-semibold text-slate-200">Voltar para lista</span>
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {hasPreview && (
                    <button
                      type="button"
                      aria-label={chatCollapsed ? "Expandir chat" : "Colapsar chat"}
                      onClick={() => setChatCollapsed(!chatCollapsed)}
                      className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
                    >
                      <PanelLeftClose className={`h-4 w-4 transition-transform ${chatCollapsed ? "rotate-180" : ""}`} />
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSessionId(null);
                      setPendingSession(null);
                      setForceHistorySidebar(false);
                    }}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-700/50 bg-slate-900/80 px-3 py-1.5 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-800"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Voltar
                  </button>
                </>
              )}
            </div>

            <div className="hidden min-w-0 items-center justify-center lg:flex">
              {hasPreview ? (
                <div className="inline-flex max-w-full items-center gap-0.5 rounded-lg border border-slate-700/50 bg-slate-900/90 px-0.5 py-0.5">
                  <button
                    type="button"
                    onClick={() => setPreviewPaneMode("preview")}
                    className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      previewPaneMode === "preview"
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "text-slate-400 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    <PanelsTopLeft className="h-3.5 w-3.5" />
                    Preview
                  </button>
                  <button
                    type="button"
                    aria-label="Resumo da landing"
                    className="inline-flex size-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
                  >
                    <FileText className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Estrutura da landing"
                    onClick={() => {
                      if (selectedSessionCodeBundle) {
                        setPreviewPaneMode("code");
                      }
                    }}
                    disabled={!selectedSessionCodeBundle}
                    className={`inline-flex size-8 items-center justify-center rounded-md transition-colors ${
                      selectedSessionCodeBundle
                        ? previewPaneMode === "code"
                          ? "bg-sky-500/15 text-sky-200"
                          : "text-slate-400 hover:bg-slate-800 hover:text-white"
                        : "cursor-not-allowed text-slate-600"
                    }`}
                  >
                    <CodeXml className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Publicacao da landing"
                    className="inline-flex size-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
                  >
                    <Globe className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Metricas da landing"
                    className="inline-flex size-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
                  >
                    <ChartNoAxesColumn className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Mais opcoes"
                    className="inline-flex size-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
                  >
                    <Ellipsis className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-start gap-1.5 lg:justify-end">
            <button
              type="button"
              onClick={() => setShowDraftPanel(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700/50 bg-slate-800/60 px-3 py-1.5 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-700/60"
            >
              <LayoutDashboard className="h-4 w-4 text-violet-400" />
              Preencher dados
            </button>

            <button
              type="button"
              disabled={previewing}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700/50 bg-slate-800/60 px-3 py-1.5 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-700/60 disabled:opacity-50"
              onClick={generateSessionPreview}
            >
              {previewing ? <RefreshCw className="h-4 w-4 animate-spin text-cyan-400" /> : <MonitorPlay className="h-4 w-4 text-cyan-400" />}
              {previewing ? "Gerando..." : "Gerar preview"}
            </button>

            <button
              type="button"
              disabled={publishingSession}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
              onClick={publishSession}
            >
              {publishingSession ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {publishingSession ? "Publicando..." : "Publicar"}
            </button>
            </div>
          </div>
        </div>

        <div className="flex min-h-0 h-full flex-1 overflow-hidden">
          <div
            className="min-h-0 flex-1 h-full transition-[grid-template-columns] duration-200 ease-out"
            style={{
              display: "grid",
              gridTemplateColumns: workspaceGridColumns,
              gap: "0"
            }}
          >
            {showHistorySidebar ? (
              <aside
                className="flex min-h-0 h-full flex-col overflow-hidden border-r border-slate-800/60 bg-slate-950/80 backdrop-blur-2xl"
              >
                <div className="border-b border-slate-800/60 px-3.5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.26em] text-slate-500">Chats</p>
                      <h3 className="mt-1 text-lg font-black text-white">Historico recente</h3>
                    </div>
                    <span className="rounded-full border border-slate-700/80 bg-slate-900/80 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
                      {sidebarSessions.length}
                    </span>
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    type="button"
                    onClick={() => {
                      setForceHistorySidebar(true);
                      void createSession();
                    }}
                    className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-[18px] border border-dashed border-violet-500/25 bg-violet-500/8 px-3.5 py-2.5 text-sm font-bold text-violet-100 transition-colors hover:border-violet-400/45 hover:bg-violet-500/12"
                  >
                    <Plus className="h-4 w-4" />
                    Novo chat
                  </motion.button>
                </div>

                <div className="supabase-scroll flex-1 overflow-y-auto p-2">
                  <div className="flex flex-col gap-2">
                    {sidebarSessions.map((session, index) => {
                      const isPending = session.id === 0;
                      const isActive = selectedSession.id === session.id;
                      const sessionMeta = `Atualizado ${formatSessionTimeLabel(session.updatedAt)}`;

                      return (
                        <motion.div
                          key={`${session.id}-${index}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            openSessionWorkspace(session);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              openSessionWorkspace(session);
                            }
                          }}
                          className={`group flex items-start gap-2.5 rounded-[18px] border px-2.5 py-2.5 text-left transition-all ${
                            isActive
                              ? "border-violet-500/35 bg-[linear-gradient(135deg,rgba(109,40,217,0.18),rgba(49,46,129,0.14))] shadow-[0_0_18px_rgba(139,92,246,0.14)]"
                              : "border-slate-800/70 bg-[linear-gradient(135deg,rgba(49,46,129,0.12),rgba(15,23,42,0.2))] hover:border-slate-600/70 hover:bg-[linear-gradient(135deg,rgba(67,56,202,0.16),rgba(15,23,42,0.3))]"
                          }`}
                        >
                          <div className={`mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-[16px] border ${
                            isActive
                              ? "border-violet-400/25 bg-violet-500/18 text-violet-100"
                              : "border-slate-800/70 bg-[linear-gradient(135deg,rgba(30,27,75,0.3),rgba(15,23,42,0.42))] text-slate-300"
                          }`}>
                            <MessageSquare className="h-4 w-4" />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-black text-white">
                                  {session.title || "Nova landing"}
                                </p>
                                <p className="mt-1 truncate text-xs text-slate-400">{sessionMeta}</p>
                              </div>

                              {!isPending ? (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setSessionToDeleteId(session.id);
                                  }}
                                  className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-transparent text-slate-500 transition-colors hover:border-rose-500/20 hover:bg-rose-500/10 hover:text-rose-300"
                                  aria-label="Excluir rascunho"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              ) : null}
                            </div>

                            <div className="mt-3 flex items-center gap-2">
                              <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-[0.22em] ${
                                isActive ? "bg-violet-500/15 text-violet-100" : "bg-slate-800/90 text-slate-400"
                              }`}>
                                {isPending ? "Rascunho local" : "Workspace"}
                              </span>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              </aside>
            ) : null}

            <AnimatePresence mode="wait" initial={false}>
              <motion.aside
                key={`session-pane-${selectedSession.id}-${hasPreview ? "preview" : "solo"}-${showHistorySidebar ? "sidebar" : "compact"}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{
                  opacity: chatCollapsed && hasPreview ? 0 : 1,
                  x: chatCollapsed && hasPreview ? -20 : 0,
                  y: 0
                }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className={`relative flex min-h-0 h-full flex-col overflow-hidden ${chatCollapsed && hasPreview ? "pointer-events-none" : ""}`}
                style={{
                  maxWidth: hasPreview || showHistorySidebar ? "100%" : "800px",
                  margin: hasPreview || showHistorySidebar ? "0" : "0 auto",
                  width: "100%",
                  backgroundColor: "rgba(2, 6, 23, 0.6)",
                  border: "none",
                  borderRight: hasPreview && !(chatCollapsed && !showHistorySidebar) ? "1px solid rgba(51,65,85,0.4)" : "none",
                  borderRadius: "0",
                  boxShadow: "none",
                  backdropFilter: "none"
                }}
              >
                {hasPreview && !chatCollapsed ? (
                  <button
                    type="button"
                    aria-label="Redimensionar largura do chat"
                    onPointerDown={startChatResize}
                    className="absolute right-0 top-0 z-30 hidden h-full w-3 -translate-x-1/2 cursor-col-resize touch-none lg:block"
                  >
                    <span className="mx-auto block h-full w-px bg-slate-800/70 transition-colors hover:bg-violet-400/50" />
                  </button>
                ) : null}
                <div className="z-10 px-3.5 py-2.5">
                  <h2 className="text-2xl font-black tracking-tight text-white drop-shadow-md">
                    {selectedSession.title || "Nova landing"}
                  </h2>
                </div>

                <div className="flex min-h-0 flex-1 flex-col z-10">
                  <div className="min-h-0 flex-1 px-3.5 py-3.5">
                    <div className="supabase-scroll h-full overflow-y-auto pr-1">
                      {selectedSession.chatHistory.length ? (
                        <div className="space-y-3.5">
                          {selectedSession.chatHistory.map((message) => (
                            <div
                              key={message.id}
                              className={message.role === "assistant" ? "max-w-[88%]" : "ml-auto max-w-[84%]"}
                            >
                              <motion.article
                                whileHover={{ scale: 1.01 }}
                                className={`rounded-[20px] px-3.5 py-3 shadow-xl ${message.role === "assistant"
                                  ? message.kind === "planner"
                                    ? "bg-[linear-gradient(135deg,rgba(17,24,39,0.94),rgba(15,23,42,0.9))] backdrop-blur-md text-slate-100 border border-cyan-400/10"
                                    : "bg-[linear-gradient(135deg,rgba(30,41,59,0.82),rgba(15,23,42,0.74))] backdrop-blur-md text-slate-100 border border-slate-800/40"
                                  : "border border-violet-400/25 bg-[linear-gradient(135deg,rgba(109,40,217,0.82),rgba(76,29,149,0.88))] text-violet-50 relative overflow-hidden"
                                  }`}
                              >
                                {message.role !== "assistant" && (
                                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-[30px] pointer-events-none" />
                                )}
                                {message.role === "assistant" && message.thinking && message.kind !== "planner" ? (
                                  <ThinkingBlock thinking={message.thinking} />
                                ) : null}
                                {message.role === "assistant" && message.kind === "planner" ? (
                                  <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200/80">
                                    <Sparkles className="h-3.5 w-3.5 text-cyan-300/80" />
                                    <span>Lume</span>
                                  </div>
                                ) : null}
                                <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-inherit relative z-10">{message.content}</p>
                                <div className={`mt-3 text-[11px] font-medium relative z-10 ${message.role === "assistant" ? "text-slate-500" : "text-violet-200"}`}>
                                  {formatChatTimeLabel(message.createdAt)}
                                </div>
                              </motion.article>
                            </div>
                          ))}

                          {sendingChat ? (
                            <div className="max-w-[72%]">
                              <motion.article
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                className="rounded-[20px] border border-slate-800/40 bg-[linear-gradient(135deg,rgba(30,41,59,0.82),rgba(15,23,42,0.74))] px-4 py-3 shadow-xl backdrop-blur-md"
                              >
                                <div className="flex items-center gap-3">
                                  <span className="text-[15px] leading-relaxed text-slate-100">Pensando</span>
                                  <div className="flex items-center gap-1.5">
                                    {[0, 1, 2].map((dot) => (
                                      <motion.span
                                        key={dot}
                                        className="block h-1.5 w-1.5 rounded-full bg-violet-300/80"
                                        animate={{ opacity: [0.25, 1, 0.25], y: [0, -2, 0] }}
                                        transition={{
                                          duration: 1,
                                          repeat: Number.POSITIVE_INFINITY,
                                          delay: dot * 0.14,
                                          ease: "easeInOut"
                                        }}
                                      />
                                    ))}
                                  </div>
                                </div>
                              </motion.article>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="max-w-[88%] rounded-[20px] border border-slate-800/40 bg-[linear-gradient(135deg,rgba(30,41,59,0.58),rgba(15,23,42,0.5))] px-4 py-3.5 text-[15px] leading-8 text-slate-300 shadow-xl backdrop-blur-md">
                          <div className="mb-2 flex items-center gap-3">
                            <Sparkles className="h-5 w-5 text-amber-400" />
                            <h3 className="font-bold text-white">Lume</h3>
                          </div>
                          <p>Olá! Vamos criar uma landing page juntos? Comece descrevendo a oferta ou curso que você quer focar.</p>
                        </div>
                      )}
                    </div>
                </div>

                  <AnimatePresence mode="wait">
                    {hasPlannerAsk && activePlannerAsk && selectedSession && (
                      <motion.div
                        key={`ask-${plannerAskIndex}-${activePlannerAsk.id || plannerAskIndex}`}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.22, ease: "easeOut" }}
                        className="border-t border-slate-700/30 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(8,14,30,0.98))] px-4 py-3.5"
                      >
                        {/* Header: label + counter with navigation */}
                        <div className="mb-2.5 flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-300/80">{activePlannerAsk.label}</span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={plannerAskIndex === 0}
                              className="inline-flex h-5 w-5 items-center justify-center rounded text-slate-500 transition-colors hover:text-slate-300 disabled:opacity-20 disabled:hover:text-slate-500"
                              onClick={() => {
                                setPlannerSelectedOption(null);
                                setPlannerCustomMode(false);
                                setSessionChatMessage("");
                                setPlannerAskIndex((i) => Math.max(0, i - 1));
                              }}
                            >
                              <ChevronLeft className="h-3.5 w-3.5" />
                            </button>
                            <span className="text-[10px] font-bold tracking-wider text-slate-500">
                              {plannerAskIndex + 1} de {askQueue.length}
                            </span>
                            <button
                              type="button"
                              disabled={!plannerAnswers[activePlannerAsk.id || `ask-${plannerAskIndex}`]}
                              className="inline-flex h-5 w-5 items-center justify-center rounded text-slate-500 transition-colors hover:text-slate-300 disabled:opacity-20 disabled:hover:text-slate-500"
                              onClick={() => {
                                setPlannerSelectedOption(null);
                                setPlannerCustomMode(false);
                                setSessionChatMessage("");
                                setPlannerAskIndex((i) => Math.min(askQueue.length - 1, i + 1));
                              }}
                            >
                              <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Question */}
                        <p className="mb-3 text-[14px] leading-6 text-slate-100">{activePlannerAsk.question}</p>

                        {/* Options */}
                        <div className="space-y-1.5">
                          {activePlannerAsk.options.slice(0, 4).map((option, optionIndex) => {
                            const selected = !plannerCustomMode && plannerSelectedOption === option;
                            return (
                              <button
                                key={option}
                                type="button"
                                disabled={sendingChat}
                                className={`group/opt flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all duration-150 ${
                                  selected
                                    ? "border-violet-400/40 bg-violet-500/12 text-white shadow-[0_0_12px_rgba(139,92,246,0.1)]"
                                    : "border-slate-700/40 bg-slate-800/30 text-slate-300 hover:border-slate-600/50 hover:bg-slate-700/30 hover:text-slate-100"
                                }`}
                                onClick={() => {
                                  setPlannerCustomMode(false);
                                  setPlannerSelectedOption(option);
                                }}
                              >
                                <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold transition-colors ${
                                  selected
                                    ? "bg-violet-500/25 text-violet-200 border border-violet-400/30"
                                    : "bg-slate-700/50 text-slate-400 border border-slate-600/30 group-hover/opt:text-slate-200"
                                }`}>
                                  {optionIndex + 1}
                                </span>
                                <span className="text-[13px] leading-5">{option}</span>
                              </button>
                            );
                          })}

                          {/* Custom input row */}
                          <div
                            className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-all duration-150 ${
                              plannerCustomMode
                                ? "border-violet-400/40 bg-violet-500/12 text-white shadow-[0_0_12px_rgba(139,92,246,0.1)]"
                                : "border-slate-700/40 bg-slate-800/30 text-slate-300"
                            }`}
                          >
                            <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold transition-colors ${
                              plannerCustomMode
                                ? "bg-violet-500/25 text-violet-200 border border-violet-400/30"
                                : "bg-slate-700/50 text-slate-400 border border-slate-600/30"
                            }`}>
                              {(activePlannerAsk.options.length > 4 ? 5 : activePlannerAsk.options.length + 1)}
                            </span>
                            <input
                              type="text"
                              value={plannerCustomMode ? sessionChatMessage : ""}
                              disabled={sendingChat}
                              placeholder={activePlannerAsk.placeholder || "Escreva sua resposta"}
                              className="w-full bg-transparent text-[13px] leading-5 text-white outline-none placeholder:text-slate-500"
                              onFocus={() => {
                                setPlannerCustomMode(true);
                                setPlannerSelectedOption(null);
                              }}
                              onChange={(event) => {
                                setPlannerCustomMode(true);
                                setPlannerSelectedOption(null);
                                setSessionChatMessage(event.target.value);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  advancePlannerAsk();
                                }
                              }}
                            />
                          </div>
                        </div>

                        {/* Progress dots */}
                        {askQueue.length > 1 && (
                          <div className="mt-3 flex items-center justify-center gap-1.5">
                            {askQueue.map((_, i) => (
                              <motion.span
                                key={i}
                                className={`block h-1.5 rounded-full transition-all ${
                                  i < plannerAskIndex
                                    ? "w-1.5 bg-violet-400/60"
                                    : i === plannerAskIndex
                                    ? "w-4 bg-violet-400"
                                    : "w-1.5 bg-slate-700"
                                }`}
                                layout
                                transition={{ duration: 0.2 }}
                              />
                            ))}
                          </div>
                        )}

                        {/* Footer: dismiss + continue */}
                        <div className="mt-3 flex items-center justify-between">
                          <button
                            type="button"
                            className="flex items-center gap-1.5 text-[11px] text-slate-500 transition-colors hover:text-slate-300"
                            onClick={() => { dismissAllAsks(); }}
                          >
                            Dispensar
                            <kbd className="rounded border border-slate-700/60 bg-slate-800/60 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">ESC</kbd>
                          </button>
                          <motion.button
                            whileHover={{ scale: 1.04 }}
                            whileTap={{ scale: 0.96 }}
                            type="button"
                            disabled={sendingChat || (plannerCustomMode ? !sessionChatMessage.trim() : !plannerSelectedOption?.trim())}
                            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-[12px] font-bold text-white shadow-lg shadow-violet-600/20 transition-all hover:bg-violet-500 disabled:opacity-40 disabled:hover:bg-violet-600"
                            onClick={() => { advancePlannerAsk(); }}
                          >
                            {plannerAskIndex < askQueue.length - 1 ? "Continuar" : "Finalizar"}
                            <CornerDownLeft className="h-3.5 w-3.5 opacity-60" />
                          </motion.button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Composer - hidden when ask is active */}
                  {!hasPlannerAsk && (
                    <div className="border-t border-slate-800/40 p-3">
                      <div className="flex items-center gap-3">
                        <motion.div
                          whileFocus={{ scale: 1.01, boxShadow: "0 0 0 2px rgba(139,92,246,0.3)" }}
                          className="group relative min-w-0 flex-1 overflow-hidden rounded-[18px] border border-slate-700/45 bg-[linear-gradient(135deg,rgba(15,23,42,0.94),rgba(30,41,59,0.78))] p-2 shadow-xl transition-all ring-1 ring-white/8 backdrop-blur-xl focus-within:border-violet-500/45 focus-within:ring-violet-500/15"
                        >
                          <textarea
                            ref={composerTextareaRef}
                            rows={1}
                            placeholder={"Peça à Lume sobre o design ou conteúdo..."}
                            className="relative z-10 max-h-56 w-full resize-none overflow-y-auto bg-transparent px-2.5 py-1.5 text-[15px] leading-7 text-white outline-none placeholder:text-slate-500"
                            value={sessionChatMessage}
                            disabled={sendingChat}
                            onChange={(event) => setSessionChatMessage(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" && !event.shiftKey) {
                                event.preventDefault();
                                void sendChatMessage();
                              }
                            }}
                          />
                        </motion.div>

                        <motion.button
                          whileHover={sendingChat ? { scale: 1.06 } : { scale: 1.1, rotate: -10 }}
                          whileTap={{ scale: 0.92 }}
                          type="button"
                          disabled={!sendingChat && !sessionChatMessage.trim()}
                          className={`inline-flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-[18px] text-white transition-all disabled:opacity-50 ${
                            sendingChat
                              ? "bg-slate-800 shadow-[0_8px_20px_rgba(15,23,42,0.4)] hover:bg-slate-700"
                              : "bg-[linear-gradient(135deg,rgba(139,92,246,1),rgba(109,40,217,1))] shadow-[0_8px_20px_rgba(109,40,217,0.36)] hover:brightness-125 disabled:hover:brightness-100"
                          }`}
                          onClick={() => {
                            if (sendingChat) {
                              stopChatGeneration();
                              return;
                            }
                            void sendChatMessage();
                          }}
                        >
                          {sendingChat ? (
                            <span className="h-3.5 w-3.5 rounded-[2px] bg-white" />
                          ) : (
                            <Send className="h-6 w-6 ml-1" />
                          )}
                        </motion.button>
                      </div>
                    </div>
                  )}
                </div>
              </motion.aside>
            </AnimatePresence>

            <AnimatePresence>
              {hasPreview && (
                <motion.main 
                  key={`preview-pane-${selectedSession.id}-${selectedSession.preview?.landing?.version ?? 0}-${previewPaneMode}`}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 12 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="relative flex min-h-0 flex-col overflow-hidden bg-slate-950/40"
                >
                  {isResizingChatPane ? (
                    <div className="absolute inset-0 z-40 cursor-col-resize bg-transparent" />
                  ) : null}
                  {previewPaneMode === "code" && selectedSessionCodeBundle ? (
                    <LandingCodeIdePane
                      bundle={selectedSessionCodeBundle}
                      title={activeSessionTitle}
                      onBackToPreview={() => setPreviewPaneMode("preview")}
                      onToast={(message, type) => {
                        addToast(message, type);
                      }}
                    />
                  ) : (
                    <div className="relative z-10 min-h-0 flex-1 overflow-hidden">
                      <div className="supabase-scroll h-full overflow-y-auto w-full">
                        <LandingPreviewCanvas
                          offer={selectedSession.preview!.offer}
                          landing={selectedSession.preview!.landing}
                          previewLabel="Preview em Tempo Real ⚡"
                        />
                        {selectedSession.preview?.landing?.artifactUrl ? (
                          <div className="border-t border-slate-800/50 bg-slate-950/75 px-4 py-4">
                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-400/15 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-50">
                              <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-200/80">Artefato no bucket</p>
                                <p className="mt-1 break-all text-emerald-50/90">{selectedSession.preview.landing.artifactUrl}</p>
                              </div>
                              <a
                                href={selectedSession.preview.landing.artifactUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex shrink-0 items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-100 transition-colors hover:bg-emerald-400/20"
                              >
                                Abrir
                              </a>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )}
                </motion.main>
              )}
            </AnimatePresence>
          </div>

          <Dialog open={sessionToDeleteId !== null} onOpenChange={(open) => !open && setSessionToDeleteId(null)}>
            <DialogContent className="max-w-md overflow-hidden rounded-[32px] border border-rose-500/20 bg-slate-950/95 p-0">
              <DialogHeader className="gap-3 p-6 pb-0">
                <div className="flex size-14 items-center justify-center rounded-full border border-rose-500/20 bg-rose-500/10 text-rose-400">
                  <Trash2 className="h-6 w-6" />
                </div>
                <DialogTitle>Excluir chat atual?</DialogTitle>
                <DialogDescription>
                  {sessionToDelete
                    ? `O rascunho "${sessionToDelete.title || "Nova landing"}" sera removido permanentemente.`
                    : "Este rascunho sera removido permanentemente."}
                </DialogDescription>
              </DialogHeader>

              <DialogFooter className="border-t border-slate-800/80 bg-slate-950/80 p-6 pt-4">
                <button
                  type="button"
                  onClick={() => setSessionToDeleteId(null)}
                  className="rounded-2xl bg-slate-800/80 px-4 py-3 text-sm font-bold text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (sessionToDeleteId !== null) {
                      void deleteSession(sessionToDeleteId);
                    }
                    setSessionToDeleteId(null);
                  }}
                  className="rounded-2xl bg-rose-600 px-4 py-3 text-sm font-bold text-white shadow-[0_0_24px_rgba(225,29,72,0.35)] transition-colors hover:bg-rose-500"
                >
                  Excluir
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Draft Slider Panel */}
          <AnimatePresence>
            {showDraftPanel && localOfferDraft && (
              <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setShowDraftPanel(false)}>
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="absolute inset-0 bg-black/70 backdrop-blur-md" 
                />
                
                <motion.div
                  initial={{ x: "100%", opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: "100%", opacity: 0 }}
                  transition={{ type: "spring", damping: 30, stiffness: 300 }}
                  className="relative h-full w-full max-w-lg border-l border-slate-800/80 bg-slate-950/90 backdrop-blur-2xl p-7 shadow-2xl flex flex-col"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="mb-8 flex items-center justify-between">
                    <div className="flex items-center gap-4 text-white">
                      <div className="p-3 bg-violet-500/20 rounded-xl border border-violet-500/30">
                        <LayoutDashboard className="h-6 w-6 text-violet-400" />
                      </div>
                      <h3 className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">Dados da Landing</h3>
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.1, rotate: 90 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setShowDraftPanel(false)}
                      className="rounded-full bg-slate-800/80 p-2.5 text-slate-400 hover:text-white border border-slate-700/50 shadow-md"
                    >
                      <X className="h-5 w-5" />
                    </motion.button>
                  </div>

                  <div className="supabase-scroll flex-1 space-y-6 overflow-y-auto pr-3 pb-8">
                    {selectedSession?.codeBundleDraft ? (
                      <div className="rounded-3xl border border-cyan-400/15 bg-cyan-500/8 p-5 shadow-[0_18px_55px_rgba(8,145,178,0.12)]">
                        <div className="mb-3 flex items-center gap-3">
                          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-2 text-cyan-200">
                            <CodeXml className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-200/80">React bundle</p>
                            <p className="text-sm font-semibold text-white">Origem principal da landing gerada pela IA</p>
                          </div>
                        </div>
                        <div className="grid gap-3">
                          <div className="rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Resumo</p>
                            <p className="mt-2 text-sm font-semibold text-white">
                              {selectedSession.codeBundleDraft.metadata.summary}
                            </p>
                          </div>

                          <div className="rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Arquivos</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {selectedSession.codeBundleDraft.files.map((file) => (
                                <span
                                  key={file.path}
                                  className="rounded-full border border-white/10 bg-slate-950/80 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-200"
                                >
                                  {file.path}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className="rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Componentes usados</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {selectedSession.codeBundleDraft.usedComponents.map((componentName) => (
                                <span
                                  key={componentName}
                                  className="rounded-full border border-white/10 bg-slate-950/80 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-200"
                                >
                                  {componentName}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className="rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Origem</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <span className="rounded-full border border-white/10 bg-slate-950/80 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-200">
                                {selectedSession.codeBundleDraft.source === "fallback" ? "Fallback controlado" : "IA"}
                              </span>
                              <span className="rounded-full border border-white/10 bg-slate-950/80 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-200">
                                {selectedSession.codeBundleDraft.entryFile}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : selectedSession?.builderDraft?.nodes?.length ? (
                      <div className="rounded-3xl border border-cyan-400/15 bg-cyan-500/8 p-5 shadow-[0_18px_55px_rgba(8,145,178,0.12)]">
                        <div className="mb-3 flex items-center gap-3">
                          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-2 text-cyan-200">
                            <PanelsTopLeft className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-200/80">Builder legado</p>
                            <p className="text-sm font-semibold text-white">Fallback estrutural para landings antigas</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {selectedSession.builderDraft.nodes.map((node) => (
                            <span
                              key={node.id}
                              className="rounded-full border border-white/10 bg-slate-900/70 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-200"
                            >
                              {node.type}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <div className="space-y-5">
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                        <label className="mb-2 block text-xs font-black uppercase tracking-[0.15em] text-violet-300">Titulo da Oferta</label>
                        <input
                          type="text"
                          className="w-full rounded-2xl border border-slate-700/50 bg-slate-900/60 px-5 py-4 text-sm text-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 focus:outline-none transition-all shadow-inner"
                          value={localOfferDraft.title}
                          onChange={(e) => updateLocalDraft({ ...localOfferDraft, title: e.target.value })}
                        />
                      </motion.div>

                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                        <label className="mb-2 block text-xs font-black uppercase tracking-[0.15em] text-violet-300">Slug (URL)</label>
                        <input
                          type="text"
                          className="w-full rounded-2xl border border-slate-700/50 bg-slate-900/60 px-5 py-4 text-sm text-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 focus:outline-none transition-all shadow-inner"
                          value={localOfferDraft.slug}
                          onChange={(e) => updateLocalDraft({ ...localOfferDraft, slug: e.target.value })}
                        />
                      </motion.div>

                      <div className="grid grid-cols-2 gap-5">
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                          <label className="mb-2 block text-xs font-black uppercase tracking-[0.15em] text-violet-300">Duracao</label>
                          <input
                            type="text"
                            placeholder="Ex: 5 meses"
                            className="w-full rounded-2xl border border-slate-700/50 bg-slate-900/60 px-5 py-4 text-sm text-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 focus:outline-none transition-all shadow-inner"
                            value={localOfferDraft.durationLabel || ""}
                            onChange={(e) => updateLocalDraft({ ...localOfferDraft, durationLabel: e.target.value })}
                          />
                        </motion.div>
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
                          <label className="mb-2 block text-xs font-black uppercase tracking-[0.15em] text-violet-300">Modalidade</label>
                          <input
                            type="text"
                            placeholder="Ex: informatica"
                            className="w-full rounded-2xl border border-slate-700/50 bg-slate-900/60 px-5 py-4 text-sm text-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 focus:outline-none transition-all shadow-inner"
                            value={localOfferDraft.modality || ""}
                            onChange={(e) => updateLocalDraft({ ...localOfferDraft, modality: e.target.value })}
                          />
                        </motion.div>
                      </div>

                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                        <label className="mb-2 block text-xs font-black uppercase tracking-[0.15em] text-violet-300">Descricao Curta</label>
                        <textarea
                          rows={4}
                          className="w-full resize-none rounded-2xl border border-slate-700/50 bg-slate-900/60 px-5 py-4 text-sm text-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 focus:outline-none transition-all shadow-inner"
                          value={localOfferDraft.shortDescription || ""}
                          onChange={(e) => updateLocalDraft({ ...localOfferDraft, shortDescription: e.target.value })}
                        />
                      </motion.div>

                      <div className="grid grid-cols-2 gap-5">
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
                          <label className="mb-2 block text-xs font-black uppercase tracking-[0.15em] text-violet-300">Texto do CTA</label>
                          <input
                            type="text"
                            className="w-full rounded-2xl border border-slate-700/50 bg-slate-900/60 px-5 py-4 text-sm text-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 focus:outline-none transition-all shadow-inner"
                            value={localOfferDraft.ctaLabel}
                            onChange={(e) => updateLocalDraft({ ...localOfferDraft, ctaLabel: e.target.value })}
                          />
                        </motion.div>
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                          <label className="mb-2 block text-xs font-black uppercase tracking-[0.15em] text-violet-300">Link do CTA</label>
                          <input
                            type="text"
                            className="w-full rounded-2xl border border-slate-700/50 bg-slate-900/60 px-5 py-4 text-sm text-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 focus:outline-none transition-all shadow-inner"
                            value={localOfferDraft.ctaUrl}
                            onChange={(e) => updateLocalDraft({ ...localOfferDraft, ctaUrl: e.target.value })}
                          />
                        </motion.div>
                      </div>

                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
                        <label className="mb-2 block text-xs font-black uppercase tracking-[0.15em] text-violet-300">Tema Visual</label>
                        <input
                          type="text"
                          placeholder="Ex: tecnologico, moderno"
                          className="w-full rounded-2xl border border-slate-700/50 bg-slate-900/60 px-5 py-4 text-sm text-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 focus:outline-none transition-all shadow-inner"
                          value={localOfferDraft.visualTheme || ""}
                          onChange={(e) => updateLocalDraft({ ...localOfferDraft, visualTheme: e.target.value })}
                        />
                      </motion.div>

                      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
                          <label className="mb-2 block text-xs font-black uppercase tracking-[0.15em] text-violet-300">Cores</label>
                          <input
                            type="text"
                            placeholder="Ex: verde profissional"
                            className="w-full rounded-2xl border border-slate-700/50 bg-slate-900/60 px-5 py-4 text-sm text-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 focus:outline-none transition-all shadow-inner"
                            value={localOfferDraft.colorPalette || ""}
                            onChange={(e) => updateLocalDraft({ ...localOfferDraft, colorPalette: e.target.value })}
                          />
                        </motion.div>

                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}>
                          <label className="mb-2 block text-xs font-black uppercase tracking-[0.15em] text-violet-300">Tipografia</label>
                          <input
                            type="text"
                            placeholder="Ex: elegante"
                            className="w-full rounded-2xl border border-slate-700/50 bg-slate-900/60 px-5 py-4 text-sm text-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 focus:outline-none transition-all shadow-inner"
                            value={localOfferDraft.typographyStyle || ""}
                            onChange={(e) => updateLocalDraft({ ...localOfferDraft, typographyStyle: e.target.value })}
                          />
                        </motion.div>

                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
                          <label className="mb-2 block text-xs font-black uppercase tracking-[0.15em] text-violet-300">Layout</label>
                          <input
                            type="text"
                            placeholder="Ex: hero + grid"
                            className="w-full rounded-2xl border border-slate-700/50 bg-slate-900/60 px-5 py-4 text-sm text-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 focus:outline-none transition-all shadow-inner"
                            value={localOfferDraft.layoutStyle || ""}
                            onChange={(e) => updateLocalDraft({ ...localOfferDraft, layoutStyle: e.target.value })}
                          />
                        </motion.div>
                      </div>
                    </div>
                  </div>

                  {/* Save Footer */}
                  <div className="pt-6 border-t border-slate-800/80 mt-auto">
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={async () => {
                        if (!localOfferDraft) return;
                        if (draftDebounceRef.current) clearTimeout(draftDebounceRef.current);
                        setSavingDraft(true);
                        await patchSessionDraft({ offerDraft: localOfferDraft });
                        setSavingDraft(false);
                      }}
                      disabled={savingDraft}
                      className="flex w-full items-center justify-center gap-3 rounded-2xl bg-[linear-gradient(135deg,rgba(139,92,246,1),rgba(109,40,217,0.9))] py-4 text-sm font-black text-white shadow-[0_10px_30px_rgba(109,40,217,0.4)] transition-all hover:brightness-110 disabled:opacity-60 disabled:hover:scale-100 relative overflow-hidden group"
                    >
                      <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                      {savingDraft ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
                      <span className="text-[15px]">{savingDraft ? "Salvando..." : "Salvar Dados"}</span>
                    </motion.button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </div>
      </motion.section>
    );
  }


  return (
    <section className="space-y-8 panel-enter">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">Landings</h1>
          <p className="max-w-2xl text-sm text-slate-400 sm:text-base">Gerenciamento de landing pages</p>
        </div>

        <div className="flex flex-wrap gap-3">
          {latestSession ? (
            <button
              type="button"
              onClick={() => openSessionWorkspace(latestSession)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-sm font-bold text-slate-100 transition-all hover:border-slate-600 hover:bg-slate-950"
            >
              <RefreshCw className="h-4 w-4" />
              Continuar rascunho
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => void createSession()}
            disabled={creatingSession}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-500 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-violet-500/20 transition-all hover:-translate-y-0.5 hover:bg-violet-400 active:translate-y-0 disabled:opacity-50"
          >
            {creatingSession ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {creatingSession ? "Criando..." : "Nova landing"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="rounded-[32px] border border-slate-800/80 bg-slate-900/50 p-6 shadow-xl shadow-black/10">
        <div className="flex flex-col gap-4 border-b border-slate-800/80 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-cyan-300" />
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-cyan-200/80">Ofertas publicadas</p>
            </div>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-white">Catalogo ativo</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Gerencie apenas o que ja esta no ar. A criacao agora acontece em um workspace fullscreen.
            </p>
          </div>

          <div className="rounded-[24px] border border-slate-800 bg-slate-950/60 px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-500">Ofertas</p>
            <p className="mt-2 text-3xl font-black tracking-tight text-white">{offers.length}</p>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          {loading ? (
            <div className="rounded-[26px] border border-slate-800/80 bg-slate-950/60 px-5 py-6 text-sm text-slate-400">
              Carregando ofertas...
            </div>
          ) : null}

          {!loading && !offers.length ? (
            <div className="rounded-[26px] border border-dashed border-slate-700 bg-slate-950/40 px-5 py-8 text-sm text-slate-400">
              Nenhuma oferta cadastrada ainda.
            </div>
          ) : null}

          {offers.map((offer) => (
            <div
              key={offer.id}
              className="rounded-[26px] border border-slate-800/80 bg-slate-950/70 px-5 py-5 transition-all hover:border-slate-700/80 hover:bg-slate-950"
            >
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-lg font-bold text-white">{offer.title}</p>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] ${offer.isActive ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-700/70 text-slate-300"
                        }`}
                    >
                      {offer.isActive ? "Ativa" : "Pausada"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-400">/{offer.slug}</p>
                  <p className="mt-2 text-sm text-slate-500">
                    {offer.latestLanding
                      ? `Landing disponivel na versao ${offer.latestLanding.version}.`
                      : "Nenhuma versao publicada ainda."}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {offer.latestLanding ? (
                    <a
                      href={`/ofertas/${offer.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-bold text-slate-200 transition-all hover:border-slate-600 hover:bg-slate-900"
                    >
                      <Globe className="h-4 w-4" />
                      Abrir landing
                    </a>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => void toggleOfferStatus(offer)}
                    disabled={togglingOfferId === offer.id}
                    className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm font-bold text-amber-100 transition-all hover:bg-amber-500/15 disabled:opacity-50"
                  >
                    {togglingOfferId === offer.id ? "Atualizando..." : offer.isActive ? "Pausar" : "Ativar"}
                  </button>

                  <button
                    type="button"
                    onClick={() => void deleteOffer(offer)}
                    disabled={deletingOfferId === offer.id}
                    className="inline-flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm font-bold text-rose-100 transition-all hover:bg-rose-500/15 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    {deletingOfferId === offer.id ? "Excluindo..." : "Excluir"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
