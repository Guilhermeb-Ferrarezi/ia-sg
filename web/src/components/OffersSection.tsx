import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Clock, Globe, LayoutDashboard, MessageSquare, MonitorPlay, Plus, RefreshCw, Send, Sparkles, Trash2, X } from "lucide-react";
import { apiFetch } from "../lib/apiFetch";
import type { LandingCreationMessage, LandingCreationSession, LandingPreviewLeadContext, Offer } from "../types/dashboard";
import LandingPreviewCanvas from "./LandingPreviewCanvas";
import { motion, AnimatePresence } from "framer-motion";

type ToastType = "success" | "error" | "info" | "loading";

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

function sortSessionsByRecent(sessions: LandingCreationSession[]): LandingCreationSession[] {
  return [...sessions].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

function formatChatTimeLabel(value: string): string {
  return chatTimeFormatter.format(new Date(value));
}

export default function OffersSection({
  active,
  onWorkspaceModeChange,
  addToast,
  updateToast
}: {
  active: boolean;
  onWorkspaceModeChange?: (open: boolean) => void;
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
  const [error, setError] = useState("");
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const sortedSessions = useMemo(() => sortSessionsByRecent(sessions), [sessions]);
  const latestSession = useMemo(() => sortedSessions[0] ?? null, [sortedSessions]);
  const selectedSession = useMemo(() => {
    if (selectedSessionId === 0) return pendingSession;
    return sortedSessions.find((session) => session.id === selectedSessionId) || null;
  }, [sortedSessions, selectedSessionId, pendingSession]);

  const [localOfferDraft, setLocalOfferDraft] = useState<LandingCreationSession["offerDraft"] | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [sessionContextMenu, setSessionContextMenu] = useState<{ x: number; y: number; sessionId: number; confirm?: boolean } | null>(null);
  const draftDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleGlobalClick = () => setSessionContextMenu(null);
    window.addEventListener("click", handleGlobalClick);
    return () => window.removeEventListener("click", handleGlobalClick);
  }, []);

  useEffect(() => {
    if (showDraftPanel && selectedSession) {
      setLocalOfferDraft(selectedSession.offerDraft);
    }
  }, [showDraftPanel, selectedSessionId]);

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
    onWorkspaceModeChange?.(active && Boolean(selectedSession));
  }, [active, onWorkspaceModeChange, selectedSession]);

  useEffect(() => {
    const textarea = composerTextareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [sessionChatMessage, selectedSessionId]);

  const createSession = () => {
    const now = new Date().toISOString();
    const local: LandingCreationSession = {
      id: 0,
      title: "",
      status: "active",
      offerDraft: { title: "", slug: "", description: "", targetAudience: "", duration: "", modality: "", highlights: [] },
      promptDraft: { systemPrompt: "", welcomeMessage: "", objectionHandling: "" },
      chatHistory: [],
      preview: null,
      createdAt: now,
      updatedAt: now,
    } as unknown as LandingCreationSession;
    setPendingSession(local);
    setSelectedSessionId(0);
  };

  const sendChatMessage = async () => {
    if (!selectedSession || !sessionChatMessage.trim()) return;
    setSendingChat(true);
    const message = sessionChatMessage.trim();
    setSessionChatMessage("");

    // If session is pending (not yet saved), create it in DB first
    let session = selectedSession;
    if (session.id === 0) {
      try {
        const response = await apiFetch<{ session: LandingCreationSession }>("/landing-creation/sessions", { method: "POST" });
        session = response.session;
        replaceSession(session);
        setPendingSession(null);
      } catch (err) {
        addToast(err instanceof Error ? err.message : "Falha ao criar workspace.", "error");
        setSessionChatMessage(message);
        setSendingChat(false);
        return;
      }
    }

    // Optimistic: show user message immediately
    const optimisticMessage: LandingCreationMessage = {
      role: "user",
      content: message,
      createdAt: new Date().toISOString()
    };
    const optimisticSession: LandingCreationSession = {
      ...session,
      chatHistory: [...session.chatHistory, optimisticMessage],
      updatedAt: new Date().toISOString()
    };
    replaceSession(optimisticSession);

    try {
      const response = await apiFetch<{ session: LandingCreationSession }>(
        `/landing-creation/sessions/${session.id}/messages`,
        {
          method: "POST",
          body: JSON.stringify({ message })
        }
      );
      replaceSession(response.session);
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Falha ao enviar mensagem.", "error");
      replaceSession(session);
      setSessionChatMessage(message);
    } finally {
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
      const response = await apiFetch<{ session: LandingCreationSession }>(
        `/landing-creation/sessions/${selectedSession.id}/publish`,
        {
          method: "POST",
          body: JSON.stringify({
            offerDraft: selectedSession.offerDraft,
            promptDraft: selectedSession.promptDraft
          })
        }
      );
      replaceSession(response.session);
      await loadOffers();
      updateToast(toastId, "Oferta publicada com sucesso.", "success");
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
      }
      updateToast(toastId, "Rascunho removido.", "success");
    } catch (err) {
      updateToast(toastId, err instanceof Error ? err.message : "Falha ao excluir rascunho.", "error");
    }
  };

  if (!active) return null;

  const hasPreview = selectedSession?.preview != null;

  if (selectedSession) {
    return (
      <motion.section 
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: "spring", stiffness: 250, damping: 25 }}
        className="flex flex-col gap-4 panel-enter h-screen w-full overflow-hidden p-4"
      >
        <div className="flex items-center justify-start gap-4 px-2">
          <motion.button
            whileHover={{ scale: 1.05, boxShadow: "0 0 15px rgba(139, 92, 246, 0.4)" }}
            whileTap={{ scale: 0.95 }}
            type="button"
            onClick={() => { setSelectedSessionId(null); setPendingSession(null); }}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-700/80 bg-slate-900/50 backdrop-blur-md px-5 py-3 text-sm font-bold text-slate-100 transition-colors hover:border-violet-500/50 hover:bg-slate-900 shadow-lg"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </motion.button>

          <div className="flex flex-wrap items-center gap-3 ml-2">
            <motion.button
              whileHover={{ scale: 1.05, boxShadow: "0 0 20px rgba(139, 92, 246, 0.4)" }}
              whileTap={{ scale: 0.95 }}
              type="button"
              onClick={() => setShowDraftPanel(true)}
              className="group relative inline-flex overflow-hidden items-center gap-2 rounded-2xl border border-violet-500/30 bg-violet-500/10 px-5 py-3 text-sm font-bold text-violet-100 transition-colors hover:border-violet-500/50 hover:bg-violet-500/20 shadow-lg"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-violet-500/0 via-violet-500/20 to-violet-500/0 opacity-0 group-hover:opacity-100 animate-[shimmer_2s_infinite]" />
              <LayoutDashboard className="h-4 w-4 group-hover:scale-110 transition-transform" />
              Preencher dados
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05, boxShadow: "0 0 20px rgba(6, 182, 212, 0.4)" }}
              whileTap={{ scale: 0.95 }}
              type="button"
              disabled={previewing}
              className="inline-flex items-center gap-2 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-5 py-3 text-sm font-bold text-cyan-100 transition-colors hover:border-cyan-400/50 hover:bg-cyan-500/20 shadow-lg disabled:opacity-50 relative overflow-hidden"
              onClick={generateSessionPreview}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/0 via-cyan-500/20 to-cyan-500/0 opacity-0 hover:opacity-100 transition-opacity" />
              {previewing ? <RefreshCw className="h-4 w-4 animate-spin text-cyan-300 relative z-10" /> : <MonitorPlay className="h-4 w-4 text-cyan-400 relative z-10" />}
              <span className="relative z-10">{previewing ? "Gerando..." : "Gerar preview"}</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05, boxShadow: "0 0 20px rgba(16, 185, 129, 0.4)" }}
              whileTap={{ scale: 0.95 }}
              type="button"
              disabled={publishingSession}
              className="relative overflow-hidden inline-flex items-center gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/15 px-5 py-3 text-sm font-bold text-emerald-100 transition-colors hover:border-emerald-400/60 hover:bg-emerald-500/25 shadow-lg disabled:opacity-50 group"
              onClick={publishSession}
            >
              <div className="absolute right-0 top-0 h-full w-20 blur-[20px] bg-emerald-400/30 group-hover:animate-pulse" />
              {publishingSession ? <RefreshCw className="h-4 w-4 animate-spin text-emerald-300 relative z-10" /> : <Sparkles className="h-4 w-4 text-emerald-400 relative z-10" />}
              <span className="relative z-10">{publishingSession ? "Publicando..." : "Publicar"}</span>
            </motion.button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 gap-5 overflow-hidden h-full">
          {/* Sessions Sidebar */}
          <motion.aside 
            initial={{ x: -50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ type: "spring", damping: 20, delay: 0.1 }}
            className="flex w-[320px] h-full flex-shrink-0 flex-col overflow-hidden rounded-[32px] border border-slate-700/50 bg-slate-900/40 backdrop-blur-xl shadow-2xl relative"
          >
            <div className="absolute inset-0 bg-gradient-to-b from-violet-500/5 to-transparent pointer-events-none" />
            <div className="border-b border-slate-700/50 px-6 py-5 relative z-10 bg-slate-900/30">
              <div className="flex items-center gap-3 text-slate-300">
                <Clock className="h-5 w-5 text-violet-400 drop-shadow-[0_0_8px_rgba(167,139,250,0.5)]" />
                <span className="text-xs font-black uppercase tracking-[0.2em] bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-cyan-400">Histórico</span>
              </div>
            </div>
            <div className="supabase-scroll flex-1 overflow-y-auto p-4 space-y-3 relative z-10">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => void createSession()}
                disabled={creatingSession}
                className="w-full mb-4 flex items-center justify-center gap-2 rounded-[22px] border-2 border-dashed border-slate-700/70 p-4 text-sm font-bold text-slate-400 transition-all hover:border-violet-500/50 hover:text-violet-300 hover:bg-violet-500/5 disabled:opacity-50"
              >
                {creatingSession ? <RefreshCw className="h-4 w-4 animate-spin text-violet-400" /> : <Plus className="h-4 w-4" />}
                Novo rascunho
              </motion.button>
              <AnimatePresence>
                {sortedSessions.map((s, index) => (
                  <motion.button
                    key={s.id}
                    initial={{ opacity: 0, x: -20, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ type: "spring", delay: index * 0.05 }}
                    whileHover={{ scale: 1.02, x: 5 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSelectedSessionId(s.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setSessionContextMenu({ x: e.clientX, y: e.clientY, sessionId: s.id });
                    }}
                    className={`w-full group rounded-[22px] p-4 text-left transition-all relative overflow-hidden ${
                      selectedSessionId === s.id 
                        ? "bg-violet-500/15 border border-violet-500/40 shadow-[0_0_20px_rgba(139,92,246,0.15)]" 
                        : "bg-slate-800/30 border border-slate-700/30 hover:bg-slate-800/60 hover:border-slate-600/50"
                    }`}
                  >
                    {selectedSessionId === s.id && (
                       <motion.div layoutId="sidebar-active" className="absolute left-0 top-0 bottom-0 w-1.5 bg-violet-400 rounded-r-full shadow-[0_0_10px_rgba(167,139,250,0.8)]" />
                    )}
                    <div className="flex items-start gap-4">
                      <div className={`mt-0.5 shrink-0 rounded-xl p-2.5 transition-colors ${selectedSessionId === s.id ? "bg-violet-500 text-white shadow-[0_0_15px_rgba(139,92,246,0.5)]" : "bg-slate-900 text-slate-400 group-hover:text-violet-300"}`}>
                        <MessageSquare className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-[15px] font-bold ${selectedSessionId === s.id ? "text-white" : "text-slate-300 group-hover:text-white"}`}>
                          {s.title || "Nova landing"}
                        </p>
                        <p className="mt-1.5 text-[11px] font-medium text-slate-500 group-hover:text-slate-400 transition-colors">
                          {new Date(s.updatedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>
          </motion.aside>

          {sessionContextMenu && createPortal(
            <>
              <div 
                className={`fixed inset-0 ${sessionContextMenu.confirm ? 'bg-black/80 backdrop-blur-md z-[9999]' : 'z-[9998]'}`} 
                onClick={() => setSessionContextMenu(null)} 
              />
              
              {!sessionContextMenu.confirm ? (
                <div
                  className="fixed z-[9999] min-w-[160px] overflow-hidden rounded-xl border border-slate-800 bg-[#121212]/95 p-1 backdrop-blur-md shadow-2xl animate-in fade-in zoom-in-95 duration-100"
                  style={{ top: sessionContextMenu.y, left: sessionContextMenu.x }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSessionContextMenu(prev => prev ? { ...prev, confirm: true } : null);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold text-rose-400 transition-colors hover:bg-rose-500/10"
                  >
                    <Trash2 className="h-4 w-4" />
                    Excluir rascunho
                  </button>
                </div>
              ) : (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none p-4">
                  <div 
                    className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-3xl border border-rose-500/20 bg-slate-900/95 p-6 backdrop-blur-xl shadow-[0_0_80px_rgba(225,29,72,0.15)] animate-in fade-in zoom-in-95 duration-200"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex flex-col items-center mb-6">
                      <div className="w-14 h-14 rounded-full bg-rose-500/10 flex items-center justify-center mb-4">
                        <Trash2 className="h-7 w-7 text-rose-500" />
                      </div>
                      <h3 className="text-xl font-black text-white mb-2">Excluir rascunho?</h3>
                      <p className="text-sm text-slate-400 text-center leading-relaxed">Essa ação é permanente. Tem certeza que deseja deletar os dados destas configurações?</p>
                    </div>
                    
                    <div className="flex items-center gap-3 w-full">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSessionContextMenu(null);
                        }}
                        className="flex-1 rounded-2xl px-4 py-3.5 text-[15px] font-bold text-slate-300 bg-slate-800/80 hover:bg-slate-700 hover:text-white transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => {
                          void deleteSession(sessionContextMenu.sessionId);
                          setSessionContextMenu(null);
                        }}
                        className="flex-1 rounded-2xl px-4 py-3.5 text-[15px] font-bold text-white bg-rose-600 hover:bg-rose-500 shadow-[0_0_20px_rgba(225,29,72,0.4)] hover:shadow-[0_0_30px_rgba(225,29,72,0.6)] transition-all"
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>,
            document.body
          )}

          <motion.div
            layout
            className="min-h-0 flex-1 h-full transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]"
            style={{
              display: "grid",
              gridTemplateColumns: hasPreview ? "440px minmax(0,1fr)" : "1fr",
              gap: hasPreview ? "20px" : "0"
            }}
          >
          <motion.aside
            layout
            className="flex min-h-0 h-full flex-col overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] relative"
            style={{
              maxWidth: hasPreview ? "100%" : "800px",
              margin: hasPreview ? "0" : "0 auto",
              width: "100%",
              backgroundColor: hasPreview ? "rgba(15, 23, 42, 0.45)" : "transparent",
              border: hasPreview ? "1px solid rgba(51, 65, 85, 0.6)" : "none",
              borderRadius: "32px",
              boxShadow: hasPreview ? "0 24px 80px rgba(0,0,0,0.5)" : "none",
              backdropFilter: hasPreview ? "blur(12px)" : "none"
            }}
          >
            {hasPreview && <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-violet-500/5 pointer-events-none" />}
            
            <div className={`px-6 py-5 z-10 ${hasPreview ? "border-b border-slate-800/80 bg-slate-900/40" : ""}`}>
              <motion.h2 layout="position" className="text-2xl font-black tracking-tight text-white drop-shadow-md">
                {selectedSession.title || "Nova landing"}
              </motion.h2>
            </div>

            <div className="flex min-h-0 flex-1 flex-col z-10">
              <div className="min-h-0 flex-1 px-5 py-6">
                <div className="supabase-scroll h-full space-y-4 overflow-y-auto pr-2">
                  <AnimatePresence initial={false}>
                    {selectedSession.chatHistory.length ? (
                      selectedSession.chatHistory.map((message, index) => (
                        <motion.div
                          key={`${message.createdAt}-${index}`}
                          initial={{ opacity: 0, y: 20, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{ type: "spring", stiffness: 250, damping: 25 }}
                          className={message.role === "assistant" ? "max-w-[88%]" : "ml-auto max-w-[84%]"}
                        >
                          <motion.article
                            whileHover={{ scale: 1.01 }}
                            className={`rounded-[28px] px-5 py-4 shadow-xl ${message.role === "assistant"
                              ? "bg-slate-800/80 backdrop-blur-md text-slate-100 border border-slate-700/50"
                              : "border border-violet-400/30 bg-[linear-gradient(135deg,rgba(109,40,217,0.85),rgba(76,29,149,0.9))] text-violet-50 relative overflow-hidden"
                              }`}
                          >
                            {message.role !== "assistant" && (
                              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-[30px] pointer-events-none" />
                            )}
                            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-inherit relative z-10">{message.content}</p>
                            <div className={`mt-3 text-[11px] font-medium relative z-10 ${message.role === "assistant" ? "text-slate-500" : "text-violet-200"}`}>
                              {formatChatTimeLabel(message.createdAt)}
                            </div>
                          </motion.article>
                        </motion.div>
                      ))
                    ) : (
                      <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="max-w-[88%] rounded-[28px] bg-slate-800/50 backdrop-blur-md border border-slate-700/50 px-6 py-5 text-[15px] leading-8 text-slate-300 shadow-xl"
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <Sparkles className="h-5 w-5 text-amber-400" />
                          <h3 className="font-bold text-white">IA Assistente</h3>
                        </div>
                        <p>Olá! Vamos criar uma landing page juntos? Comece descrevendo a oferta ou curso que você quer focar.</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <div className={`p-5 ${hasPreview ? "border-t border-slate-800/80 bg-slate-900/60 backdrop-blur-md" : ""}`}>
                <div className="flex items-center gap-3">
                  <motion.div 
                    whileFocus={{ scale: 1.01, boxShadow: "0 0 0 2px rgba(139,92,246,0.3)" }}
                    className="min-w-0 flex-1 rounded-[30px] border border-slate-600/50 bg-slate-900/90 backdrop-blur-xl p-3 shadow-xl transition-all ring-1 ring-white/10 relative overflow-hidden group focus-within:border-violet-500/50 focus-within:ring-violet-500/20"
                  >
                    <textarea
                      ref={composerTextareaRef}
                      rows={1}
                      placeholder="Peça à IA sobre o design ou conteúdo..."
                      className="w-full resize-none overflow-hidden bg-transparent px-3 py-2 text-[15px] leading-7 text-white outline-none placeholder:text-slate-500 relative z-10"
                      value={sessionChatMessage}
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
                    whileHover={{ scale: 1.1, rotate: -10 }}
                    whileTap={{ scale: 0.9 }}
                    type="button"
                    disabled={sendingChat || !sessionChatMessage.trim()}
                    className="inline-flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-[24px] bg-[linear-gradient(135deg,rgba(139,92,246,1),rgba(109,40,217,1))] text-white shadow-[0_10px_30px_rgba(109,40,217,0.5)] transition-all hover:brightness-125 disabled:opacity-50 disabled:hover:scale-100 disabled:hover:rotate-0"
                    onClick={sendChatMessage}
                  >
                    {sendingChat ? <RefreshCw className="h-6 w-6 animate-spin" /> : <Send className="h-6 w-6 ml-1" />}
                  </motion.button>
                </div>
              </div>
            </div>
          </motion.aside>

          <AnimatePresence>
            {hasPreview && (
              <motion.main 
                initial={{ opacity: 0, x: 50, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 50, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 200, damping: 25 }}
                className="flex min-h-0 flex-col rounded-[32px] border border-slate-700/60 bg-slate-900/40 backdrop-blur-2xl p-5 shadow-[0_0_50px_rgba(0,0,0,0.5)] relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-500/10 blur-[100px] rounded-full pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-80 h-80 bg-violet-500/10 blur-[100px] rounded-full pointer-events-none" />
                <div className="min-h-0 flex-1 overflow-hidden rounded-[20px] bg-black/50 border border-slate-800 relative z-10">
                  <div className="supabase-scroll h-full overflow-y-auto w-full">
                    <LandingPreviewCanvas
                      offer={selectedSession.preview!.offer}
                      landing={selectedSession.preview!.landing}
                      previewLabel="Preview em Tempo Real ⚡"
                    />
                  </div>
                </div>
              </motion.main>
            )}
          </AnimatePresence>
          </motion.div>

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
              onClick={() => setSelectedSessionId(latestSession.id)}
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
