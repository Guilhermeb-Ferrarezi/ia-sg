
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { FormEvent } from "react";
import ConfirmModal from "./components/ConfirmModal";
import FaqManagerSection from "./components/FaqManagerSection";
import ChatSection from "./components/ChatSection";
import MessageNotifications from "./components/MessageNotifications";
import AnalyticsSection from "./components/AnalyticsSection";
import CalendarSection from "./components/CalendarSection";
import PaginationControls from "./components/PaginationControls";
import StatCard from "./components/StatCard";
import { apiFetch } from "./lib/apiFetch";
import type { AuthUser, ConfirmDialogState, ContactMessage, ConversionMetrics, FaqItem, Lead, PaginationMeta, PipelineStage, TaskPriority, TaskStatus, Toast } from "./types/dashboard";
import ToastContainer from "./components/ToastContainer";

const TASK_PRIORITIES: TaskPriority[] = ["low", "medium", "high"];
const TASK_STATUSES: TaskStatus[] = ["open", "done", "canceled"];
const DEFAULT_LEAD_MESSAGES_PAGE_SIZE = 5;

export default function App() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [activePanel, setActivePanel] = useState<"crm" | "faqs" | "chat" | "analytics" | "calendar">("crm");
  const [activeChatWaId, setActiveChatWaId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: "success" | "error" | "info" | "loading" = "info") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    return id;
  }, []);

  const updateToast = useCallback((id: string, message: string, type: "success" | "error" | "info" | "loading") => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, message, type } : t)));
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [faqSubmitting, setFaqSubmitting] = useState(false);
  const [faqUpdatingId, setFaqUpdatingId] = useState<number | null>(null);
  const [faqDeletingId, setFaqDeletingId] = useState<number | null>(null);
  const [deletingLeadId, setDeletingLeadId] = useState<number | null>(null);
  const [faqQuestion, setFaqQuestion] = useState("");
  const [faqAnswer, setFaqAnswer] = useState("");
  const [editingFaqId, setEditingFaqId] = useState<number | null>(null);
  const [editingFaqQuestion, setEditingFaqQuestion] = useState("");
  const [editingFaqAnswer, setEditingFaqAnswer] = useState("");
  const [editingFaqIsActive, setEditingFaqIsActive] = useState(true);

  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [metrics, setMetrics] = useState<ConversionMetrics | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [leadDetailsLoading, setLeadDetailsLoading] = useState(false);
  const [leadMessages, setLeadMessages] = useState<ContactMessage[]>([]);
  const [leadMessagesLoading, setLeadMessagesLoading] = useState(false);
  const [leadMessagesPage, setLeadMessagesPage] = useState(1);
  const [leadMessagesPageSize, setLeadMessagesPageSize] = useState(DEFAULT_LEAD_MESSAGES_PAGE_SIZE);
  const [leadMessagesPagination, setLeadMessagesPagination] = useState<PaginationMeta | null>(null);
  const leadDetailsRequestRef = useRef(0);
  const leadMessagesRequestRef = useRef(0);
  const [leadSubmitting, setLeadSubmitting] = useState(false);
  const [taskSubmitting, setTaskSubmitting] = useState(false);
  const [stageSubmitting, setStageSubmitting] = useState(false);
  const [draggedLeadId, setDraggedLeadId] = useState<number | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<number | null>(null);
  const [movingLeadId, setMovingLeadId] = useState<number | null>(null);
  const [draggedStageId, setDraggedStageId] = useState<number | null>(null);
  const [dragOverStageOrder, setDragOverStageOrder] = useState<number | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [kanbanPageSize, setKanbanPageSize] = useState(5);
  const [kanbanStagePage, setKanbanStagePage] = useState<Record<number, number>>({});

  const [leadName, setLeadName] = useState("");
  const [leadWaId, setLeadWaId] = useState("");
  const [leadSource, setLeadSource] = useState("");
  const [leadNotes, setLeadNotes] = useState("");

  const [newStageName, setNewStageName] = useState("");
  const [newStageColor, setNewStageColor] = useState("#06b6d4");

  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskDueAt, setTaskDueAt] = useState("");
  const [taskPriority, setTaskPriority] = useState<TaskPriority>("medium");

  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; lead: Lead; stageSubmenu?: boolean } | null>(null);

  const loadFaqs = useCallback(async () => {
    const result = await apiFetch<{ faqs: FaqItem[] }>("/dashboard/faqs");
    setFaqs(result.faqs);
  }, []);

  const loadCrm = useCallback(async () => {
    const [stagesRes, leadsRes, metricsRes] = await Promise.all([
      apiFetch<{ stages: PipelineStage[] }>("/crm/stages"),
      apiFetch<{ leads: Lead[] }>("/crm/leads?limit=200"),
      apiFetch<ConversionMetrics>("/crm/metrics/conversion")
    ]);
    const sortedStages = stagesRes.stages.slice().sort((a, b) => a.position - b.position);
    setStages(sortedStages);
    setLeads(leadsRes.leads);
    setMetrics(metricsRes);
  }, []);

  const loadLeadDetails = useCallback(async (id: number) => {
    const requestId = ++leadDetailsRequestRef.current;
    setLeadDetailsLoading(true);
    try {
      const result = await apiFetch<{ lead: Lead }>(`/crm/leads/${id}`);
      if (requestId !== leadDetailsRequestRef.current) return;
      setSelectedLead(result.lead);
    } finally {
      if (requestId === leadDetailsRequestRef.current) {
        setLeadDetailsLoading(false);
      }
    }
  }, []);

  const loadLeadMessages = useCallback(async (leadId: number, page: number) => {
    const requestId = ++leadMessagesRequestRef.current;
    setLeadMessagesLoading(true);
    try {
      const result = await apiFetch<{ messages: ContactMessage[]; pagination: PaginationMeta }>(
        `/crm/leads/${leadId}/messages?page=${page}&limit=${leadMessagesPageSize}`
      );
      if (requestId !== leadMessagesRequestRef.current) return;
      setLeadMessages(result.messages);
      setLeadMessagesPagination(result.pagination);
      setLeadMessagesPage(result.pagination.page);
    } finally {
      if (requestId === leadMessagesRequestRef.current) {
        setLeadMessagesLoading(false);
      }
    }
  }, [leadMessagesPageSize]);

  const checkSession = useCallback(async () => {
    setLoading(true);
    try {
      const [session] = await Promise.all([
        apiFetch<{ user: AuthUser }>("/auth/me"),
        loadFaqs(),
        loadCrm()
      ]);
      setUser(session.user);
      setError("");
    } catch {
      setUser(null);
      setFaqs([]);
      setStages([]);
      setLeads([]);
      setSelectedLeadId(null);
      setSelectedLead(null);
    } finally {
      setLoading(false);
    }
  }, [loadFaqs, loadCrm]);

  useEffect(() => {
    checkSession().catch(() => setLoading(false));
  }, [checkSession]);

  useEffect(() => {
    if (!selectedLeadId) {
      setSelectedLead(null);
      setLeadDetailsLoading(false);
      setLeadMessages([]);
      setLeadMessagesPagination(null);
      setLeadMessagesPage(1);
      setLeadMessagesLoading(false);
      return;
    }
    setLeadMessages([]);
    setLeadMessagesPagination(null);
    setLeadMessagesPage(1);
    loadLeadDetails(selectedLeadId).catch(() => setError("Falha ao carregar lead."));
    loadLeadMessages(selectedLeadId, 1).catch(() => setError("Falha ao carregar mensagens do lead."));
  }, [selectedLeadId, loadLeadDetails, loadLeadMessages]);

  useEffect(() => {
    if (!error) return;
    addToast(error, "error");
    const timer = window.setTimeout(() => setError(""), 4000);
    return () => window.clearTimeout(timer);
  }, [error, addToast]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await apiFetch("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
      setPassword("");
      await checkSession();
      addToast(`Bem-vindo, ${username}!`, "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao entrar.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    setSubmitting(true);
    try {
      await apiFetch("/auth/logout", { method: "POST" });
      setUser(null);
      setLeads([]);
      setStages([]);
      setFaqs([]);
      setSelectedLeadId(null);
      setSelectedLead(null);
      setError("");
      addToast("Sessão encerrada.", "info");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao sair.");
    } finally {
      setSubmitting(false);
    }
  };

  const refreshAll = async () => {
    setRefreshing(true);
    addToast("Buscando atualizações...", "info");
    try {
      await Promise.all([loadCrm(), loadFaqs()]);
      if (selectedLeadId) {
        await Promise.all([
          loadLeadDetails(selectedLeadId),
          loadLeadMessages(selectedLeadId, leadMessagesPage)
        ]);
      }
      addToast("Dados atualizados!", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar dados.");
    } finally {
      setRefreshing(false);
    }
  };
  const handleCreateLead = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!leadName.trim() || !leadWaId.trim()) {
      setError("Nome e WhatsApp sao obrigatorios.");
      return;
    }

    setLeadSubmitting(true);
    try {
      const result = await apiFetch<{ lead: Lead }>("/crm/leads", {
        method: "POST",
        body: JSON.stringify({ name: leadName.trim(), waId: leadWaId.trim(), source: leadSource || null, notes: leadNotes || null })
      });
      setLeadName("");
      setLeadWaId("");
      setLeadSource("");
      setLeadNotes("");
      await loadCrm();
      setSelectedLeadId(result.lead.id);
      addToast("Lead criado com sucesso!", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar lead.");
    } finally {
      setLeadSubmitting(false);
    }
  };

  const updateLead = async (leadId: number, path: string, body: unknown, method: "PATCH" | "PUT" = "PATCH") => {
    try {
      await apiFetch(path, { method, body: JSON.stringify(body) });
      await loadCrm();
      if (selectedLeadId === leadId) await loadLeadDetails(leadId);
      addToast("Lead atualizado!", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar lead.");
    }
  };

  const handleCreateTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedLeadId) {
      setError("Selecione um lead para criar uma tarefa.");
      return;
    }
    if (!taskTitle.trim()) {
      setError("Digite um título para a tarefa.");
      return;
    }
    if (!taskDueAt) {
      setError("Selecione uma data para a tarefa.");
      return;
    }
    setTaskSubmitting(true);
    const toastId = addToast("Agendando tarefa...", "loading");
    try {
      await apiFetch(`/crm/leads/${selectedLeadId}/tasks`, {
        method: "POST",
        body: JSON.stringify({ title: taskTitle.trim(), description: taskDescription || null, dueAt: new Date(taskDueAt).toISOString(), priority: taskPriority })
      });
      setTaskTitle("");
      setTaskDescription("");
      setTaskDueAt("");
      setTaskPriority("medium");
      await loadCrm();
      await loadLeadDetails(selectedLeadId);
      updateToast(toastId, "Tarefa agendada com sucesso!", "success");
    } catch (err) {
      updateToast(toastId, err instanceof Error ? err.message : "Falha ao criar tarefa.", "error");
    } finally {
      setTaskSubmitting(false);
    }
  };

  const handleDeleteTask = async (taskId: number) => {
    if (!selectedLeadId) return;
    try {
      await apiFetch(`/crm/tasks/${taskId}`, { method: "DELETE" });
      await loadCrm();
      await loadLeadDetails(selectedLeadId);
      addToast("Tarefa removida.", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao remover tarefa.");
    }
  };

  const handleDeleteLead = async (leadId: number) => {
    setDeletingLeadId(leadId);
    try {
      await apiFetch(`/crm/leads/${leadId}`, { method: "DELETE" });
      if (selectedLeadId === leadId) {
        setSelectedLeadId(null);
        setSelectedLead(null);
        setLeadMessages([]);
        setLeadMessagesPagination(null);
        setLeadMessagesPage(1);
      }
      await loadCrm();
      addToast("Lead removido com sucesso.", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao excluir lead.");
    } finally {
      setDeletingLeadId(null);
    }
  };

  const handleChangeLeadMessagesPage = async (page: number) => {
    if (!selectedLeadId) return;
    try {
      await loadLeadMessages(selectedLeadId, page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao paginar mensagens.");
    }
  };

  const handleChangeLeadMessagesPageSize = async (pageSize: number) => {
    if (!selectedLeadId) return;
    setLeadMessagesPageSize(pageSize);
    setLeadMessagesPage(1);
    try {
      const result = await apiFetch<{ messages: ContactMessage[]; pagination: PaginationMeta }>(
        `/crm/leads/${selectedLeadId}/messages?page=1&limit=${pageSize}`
      );
      setLeadMessages(result.messages);
      setLeadMessagesPagination(result.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao alterar paginação.");
    }
  };

  const handleDropLeadOnStage = async (stageId: number) => {
    const leadId = draggedLeadId;
    setDragOverStageId(null);
    setDraggedLeadId(null);
    if (!leadId) return;

    const lead = leads.find((item) => item.id === leadId);
    if (!lead || lead.stageId === stageId) return;
    const previousStageId = lead.stageId ?? null;
    const nextStage = stages.find((stage) => stage.id === stageId) || null;
    const previousStage = previousStageId ? stages.find((stage) => stage.id === previousStageId) || null : null;

    setMovingLeadId(leadId);
    setLeads((currentLeads) =>
      currentLeads.map((item) =>
        item.id === leadId
          ? {
            ...item,
            stageId,
            stage: nextStage
          }
          : item
      )
    );
    setSelectedLead((currentLead) =>
      currentLead && currentLead.id === leadId
        ? {
          ...currentLead,
          stageId,
          stage: nextStage
        }
        : currentLead
    );
    try {
      await apiFetch(`/crm/leads/${leadId}/stage`, {
        method: "PATCH",
        body: JSON.stringify({ stageId })
      });
      if (selectedLeadId === leadId) {
        void loadLeadDetails(leadId);
      }
      void loadCrm();
      addToast("Etapa do lead alterada.", "success");
    } catch (err) {
      setLeads((currentLeads) =>
        currentLeads.map((item) =>
          item.id === leadId
            ? {
              ...item,
              stageId: previousStageId,
              stage: previousStage
            }
            : item
        )
      );
      setSelectedLead((currentLead) =>
        currentLead && currentLead.id === leadId
          ? {
            ...currentLead,
            stageId: previousStageId,
            stage: previousStage
          }
          : currentLead
      );
      setError(err instanceof Error ? err.message : "Falha ao mover lead de etapa.");
    } finally {
      setMovingLeadId(null);
    }
  };

  const handleCreateStage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newStageName.trim()) return;
    setStageSubmitting(true);
    try {
      await apiFetch("/crm/stages", { method: "POST", body: JSON.stringify({ name: newStageName.trim(), color: newStageColor }) });
      setNewStageName("");
      setNewStageColor("#06b6d4");
      await loadCrm();
      addToast("Etapa criada com sucesso!", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar etapa.");
    } finally {
      setStageSubmitting(false);
    }
  };

  const handleSaveStageNameBlur = async (stageId: number, newName: string, originalName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === originalName) return;
    try {
      await apiFetch(`/crm/stages/${stageId}`, {
        method: "PUT",
        body: JSON.stringify({ name: trimmed })
      });
      await loadCrm();
      addToast("Etapa renomeada!", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao renomear etapa.");
    }
  };

  const moveStage = async (stageId: number, direction: "up" | "down") => {
    const idx = stages.findIndex((stage) => stage.id === stageId);
    if (idx < 0) return;
    const target = direction === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= stages.length) return;

    const originalStages = [...stages];
    const reordered = [...stages];
    const [item] = reordered.splice(idx, 1);
    reordered.splice(target, 0, item);

    // Optimistic update
    setStages(reordered);

    try {
      await apiFetch("/crm/stages/reorder", {
        method: "PUT",
        body: JSON.stringify({ stageIds: reordered.map((s) => s.id) })
      });
      await loadCrm();
      addToast("Ordem do pipeline salva.", "success");
    } catch (err) {
      setStages(originalStages);
      setError(err instanceof Error ? err.message : "Falha ao reordenar etapas.");
    }
  };

  const handleDropStage = async (targetStageId: number) => {
    const sourceId = draggedStageId;
    setDraggedStageId(null);
    setDragOverStageOrder(null);
    if (!sourceId || sourceId === targetStageId) return;

    const sourceIdx = stages.findIndex(s => s.id === sourceId);
    const targetIdx = stages.findIndex(s => s.id === targetStageId);
    if (sourceIdx < 0 || targetIdx < 0) return;

    const originalStages = [...stages];
    const reordered = [...stages];
    const [item] = reordered.splice(sourceIdx, 1);
    reordered.splice(targetIdx, 0, item);

    // Optimistic update
    setStages(reordered);

    try {
      await apiFetch("/crm/stages/reorder", {
        method: "PUT",
        body: JSON.stringify({ stageIds: reordered.map(s => s.id) })
      });
      await loadCrm();
      addToast("Pipeline reordenado!", "success");
    } catch (err) {
      setStages(originalStages);
      setError(err instanceof Error ? err.message : "Falha ao reordenar.");
    }
  };

  const handleCreateFaq = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!faqQuestion.trim() || !faqAnswer.trim()) return;
    setFaqSubmitting(true);
    try {
      await apiFetch("/dashboard/faqs", { method: "POST", body: JSON.stringify({ question: faqQuestion.trim(), answer: faqAnswer.trim() }) });
      setFaqQuestion("");
      setFaqAnswer("");
      await loadFaqs();
      addToast("FAQ adicionado!", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao adicionar FAQ.");
    } finally {
      setFaqSubmitting(false);
    }
  };

  const startEditFaq = (faq: FaqItem) => {
    setEditingFaqId(faq.id);
    setEditingFaqQuestion(faq.question);
    setEditingFaqAnswer(faq.answer);
    setEditingFaqIsActive(faq.isActive);
  };

  const cancelEditFaq = () => {
    setEditingFaqId(null);
    setEditingFaqQuestion("");
    setEditingFaqAnswer("");
    setEditingFaqIsActive(true);
  };

  const handleSaveFaq = async () => {
    if (!editingFaqId) return;
    setFaqUpdatingId(editingFaqId);
    try {
      await apiFetch(`/dashboard/faqs/${editingFaqId}`, {
        method: "PUT",
        body: JSON.stringify({ question: editingFaqQuestion.trim(), answer: editingFaqAnswer.trim(), isActive: editingFaqIsActive })
      });
      cancelEditFaq();
      await loadFaqs();
      addToast("FAQ salvo!", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar FAQ.");
    } finally {
      setFaqUpdatingId(null);
    }
  };

  const handleDeleteFaq = async (faqId: number) => {
    setFaqDeletingId(faqId);
    try {
      await apiFetch(`/dashboard/faqs/${faqId}`, { method: "DELETE" });
      if (editingFaqId === faqId) cancelEditFaq();
      await loadFaqs();
      addToast("FAQ removido.", "info");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao remover FAQ.");
    } finally {
      setFaqDeletingId(null);
    }
  };

  const filteredLeads = useMemo(() => {
    const term = search.trim().toLowerCase();
    return leads.filter((lead) => {
      const matchesSearch = !term || lead.waId.toLowerCase().includes(term) || (lead.name || "").toLowerCase().includes(term) || (lead.notes || "").toLowerCase().includes(term);
      const matchesStatus = statusFilter === "all" || lead.leadStatus === statusFilter;
      const matchesStage = stageFilter === "all" || String(lead.stageId || "") === stageFilter;
      return matchesSearch && matchesStatus && matchesStage;
    });
  }, [leads, search, statusFilter, stageFilter]);

  const leadsByStage = useMemo(() => {
    const map = new Map<number, Lead[]>();
    stages.forEach((stage) => map.set(stage.id, []));
    filteredLeads.forEach((lead) => {
      if (lead.stageId && map.has(lead.stageId)) map.get(lead.stageId)?.push(lead);
    });
    return map;
  }, [filteredLeads, stages]);

  useEffect(() => {
    setKanbanStagePage((current) => {
      const next: Record<number, number> = {};
      let changed = false;

      stages.forEach((stage) => {
        const total = (leadsByStage.get(stage.id) || []).length;
        const totalPages = Math.max(1, Math.ceil(total / kanbanPageSize));
        const currentPage = current[stage.id] ?? 1;
        const clamped = Math.min(totalPages, Math.max(1, currentPage));
        next[stage.id] = clamped;
        if (current[stage.id] !== clamped) changed = true;
      });

      if (Object.keys(current).length !== Object.keys(next).length) changed = true;
      return changed ? next : current;
    });
  }, [stages, leadsByStage, kanbanPageSize]);

  const handleKanbanStagePageChange = (stageId: number, page: number) => {
    setKanbanStagePage((current) => ({ ...current, [stageId]: Math.max(1, page) }));
  };

  const handleConfirmAction = async () => {
    if (!confirmDialog) return;
    if (confirmDialog.action.type === "delete-faq") {
      await handleDeleteFaq(confirmDialog.action.faqId);
      setConfirmDialog(null);
      return;
    }
    if (confirmDialog.action.type === "delete-lead") {
      await handleDeleteLead(confirmDialog.action.leadId);
      setConfirmDialog(null);
    }
  };
  if (loading) return <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">Carregando sessão...</main>;

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
        <form className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8" onSubmit={handleLogin}>
          <h1 className="text-2xl font-semibold text-slate-100">CRM WhatsApp</h1>
          <p className="mt-2 text-sm text-slate-400">Faça login para acessar o dashboard.</p>
          <div className="mt-6 space-y-3">
            <input className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Usuário" required />
            <input className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Senha" required />
            {error ? <p className="rounded border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p> : null}
            <button className="w-full rounded-lg bg-cyan-500 px-4 py-2 font-medium text-slate-950 disabled:opacity-60" type="submit" disabled={submitting}>{submitting ? "Entrando..." : "Entrar"}</button>
          </div>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#020617] px-4 py-8 text-slate-100 selection:bg-cyan-500/30">
      <section className="mx-auto max-w-[1600px] space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-6 px-2">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight bg-linear-to-r from-white to-slate-400 bg-clip-text text-transparent">CRM WhatsApp</h1>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 uppercase tracking-widest">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Sessão ativa: <span className="text-slate-300">{user.username}</span> ({user.role})
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center p-1 bg-slate-900/50 border border-slate-800 rounded-xl">
              <button
                className={`rounded-lg px-5 py-2 text-xs font-bold uppercase tracking-wider transition-all ${activePanel === "crm" ? "bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20" : "text-slate-400 hover:text-slate-200"}`}
                onClick={() => setActivePanel("crm")}
                type="button"
              >
                CRM
              </button>
              <button
                className={`rounded-lg px-5 py-2 text-xs font-bold uppercase tracking-wider transition-all ${activePanel === "faqs" ? "bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20" : "text-slate-400 hover:text-slate-200"}`}
                onClick={() => setActivePanel("faqs")}
                type="button"
              >
                FAQs
              </button>
              <button
                className={`rounded-lg px-5 py-2 text-xs font-bold uppercase tracking-wider transition-all ${activePanel === "chat" ? "bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20" : "text-slate-400 hover:text-slate-200"}`}
                onClick={() => setActivePanel("chat")}
                type="button"
              >
                Chat
              </button>
              <button
                className={`rounded-lg px-5 py-2 text-xs font-bold uppercase tracking-wider transition-all ${activePanel === "analytics" ? "bg-violet-500 text-white shadow-lg shadow-violet-500/20" : "text-slate-400 hover:text-slate-200"}`}
                onClick={() => setActivePanel("analytics")}
                type="button"
              >
                Analytics
              </button>
              <button
                className={`rounded-lg px-5 py-2 text-xs font-bold uppercase tracking-wider transition-all ${activePanel === "calendar" ? "bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20" : "text-slate-400 hover:text-slate-200"}`}
                onClick={() => setActivePanel("calendar")}
                type="button"
              >
                Calendário
              </button>
            </div>
            <div className="h-8 w-px bg-slate-800 mx-2 invisible sm:visible"></div>
            <button className="flex items-center gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-cyan-400 hover:bg-cyan-500/10 transition-all disabled:opacity-50" onClick={() => void refreshAll()} type="button" disabled={refreshing}>
              <svg className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {refreshing ? "Atualizando..." : "Atualizar"}
            </button>
            <button className="rounded-xl border border-slate-800 bg-slate-900/50 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-all" onClick={handleLogout} type="button">Sair</button>
          </div>
        </header>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Leads abertos" value={metrics?.overall.open ?? 0} />
          <StatCard label="Ganhos" value={metrics?.overall.won ?? 0} />
          <StatCard label="Perdidos" value={metrics?.overall.lost ?? 0} />
          <StatCard label="Fechados" value={metrics?.overall.totalClosed ?? 0} />
          <StatCard label="Taxa de conversão" value={`${metrics?.overall.conversionRate ?? 0}%`} highlight />
        </div>

        {activePanel === "crm" ? (
          <section className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Coluna Novo Lead */}
              <form className="group flex flex-col rounded-2xl border border-slate-800 bg-slate-900/50 p-6 transition-all hover:border-slate-700/80 shadow-sm" onSubmit={handleCreateLead}>
                <div className="flex items-center gap-2 border-b border-slate-800 pb-4 mb-5">
                  <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-500">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <h2 className="text-sm font-bold uppercase tracking-widest text-slate-300">Novo Lead</h2>
                </div>
                <div className="space-y-3">
                  <input className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all" value={leadName} onChange={(e) => setLeadName(e.target.value)} placeholder="Nome completo" required />
                  <input className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all" value={leadWaId} onChange={(e) => setLeadWaId(e.target.value)} placeholder="WhatsApp (DDI + DDD + Número)" required />
                  <input className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all" value={leadSource} onChange={(e) => setLeadSource(e.target.value)} placeholder="Origem (ex: Facebook, Orgânico)" />
                  <textarea className="w-full min-h-[100px] rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all resize-none" value={leadNotes} onChange={(e) => setLeadNotes(e.target.value)} placeholder="Observações adicionais..." />
                  <button type="submit" disabled={leadSubmitting} className="w-full mt-2 flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3.5 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-500/20 hover:bg-cyan-400 hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-60 disabled:pointer-events-none uppercase tracking-widest leading-none">
                    {leadSubmitting ? (
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    ) : "Criar lead"}
                  </button>
                </div>
              </form>

              {/* Coluna Filtros */}
              <div className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/50 p-6 transition-all hover:border-slate-700/80 shadow-sm">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-4 mb-5">
                  <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-500">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                    </svg>
                  </div>
                  <h2 className="text-sm font-bold uppercase tracking-widest text-slate-300">Filtros</h2>
                </div>
                <div className="space-y-4">
                  <div className="group relative">
                    <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 group-focus-within:text-cyan-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input className="w-full rounded-xl border border-slate-800 bg-slate-950 pl-11 pr-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar leads..." />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Status</label>
                    <select className="w-full appearance-none rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                      <option value="all">Todos status</option>
                      <option value="open">Abertos</option>
                      <option value="won">Ganhos</option>
                      <option value="lost">Perdidos</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Etapa do Funil</label>
                    <select className="w-full appearance-none rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all" value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
                      <option value="all">Todas etapas</option>
                      {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Coluna Pipeline */}
              <form className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/50 p-6 transition-all hover:border-slate-700/80 shadow-sm" onSubmit={handleCreateStage}>
                <div className="flex items-center gap-2 border-b border-slate-800 pb-4 mb-5">
                  <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-500">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  </div>
                  <h2 className="text-sm font-bold uppercase tracking-widest text-slate-300">Pipeline</h2>
                </div>
                <div className="space-y-3">
                  <input className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all" value={newStageName} onChange={(e) => setNewStageName(e.target.value)} placeholder="Nova etapa do funil" required />
                  <div className="flex items-center gap-3">
                    <div className="flex-1 space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Cor</label>
                      <div className="relative h-[46px]">
                        <input className="absolute inset-0 h-full w-full rounded-xl border border-slate-800 bg-slate-950 cursor-pointer overflow-hidden opacity-0" type="color" value={newStageColor} onChange={(e) => setNewStageColor(e.target.value)} />
                        <div className="pointer-events-none flex h-full w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-950 px-4">
                          <span className="text-xs font-mono text-slate-300">{newStageColor.toUpperCase()}</span>
                          <div className="h-5 w-5 rounded-full ring-2 ring-slate-800" style={{ backgroundColor: newStageColor }}></div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <button type="submit" disabled={stageSubmitting} className="w-full mt-2 rounded-xl bg-cyan-500 px-4 py-3.5 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-500/20 hover:bg-cyan-400 hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-60 uppercase tracking-widest leading-none">
                    {stageSubmitting ? "Criando..." : "Criar etapa"}
                  </button>
                </div>

                {/* Lista de Etapas (Drag and Drop) */}
                <div className="mt-8 space-y-2 max-h-[250px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block sticky top-0 bg-[#161d2b] py-1">Organizar Etapas</label>
                  {stages.map((s) => (
                    <div
                      key={s.id}
                      draggable
                      onDragStart={() => setDraggedStageId(s.id)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (dragOverStageOrder !== s.id) setDragOverStageOrder(s.id);
                      }}
                      onDragLeave={() => {
                        if (dragOverStageOrder === s.id) setDragOverStageOrder(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        void handleDropStage(s.id);
                      }}
                      className={`flex items-center gap-3 rounded-xl border p-3 transition-all group cursor-move ${dragOverStageOrder === s.id
                        ? "border-cyan-500 bg-cyan-500/10 scale-[1.02] z-10"
                        : "border-slate-800/50 bg-slate-950/50 hover:border-slate-700"
                        } ${draggedStageId === s.id ? "opacity-30" : "opacity-100"}`}
                    >
                      <div className="text-slate-600 group-hover:text-cyan-500 transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                      </div>
                      <div className="p-1.5 rounded-lg bg-cyan-500/5">
                        <svg className="w-4 h-4 text-cyan-500/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                      </div>
                      <input
                        key={`stage-name-${s.id}-${s.name}`}
                        className="flex-1 min-w-0 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs font-semibold text-slate-100 outline-none focus:border-cyan-500/30 focus:bg-slate-950 transition-colors"
                        defaultValue={s.name}
                        onBlur={(e) => void handleSaveStageNameBlur(s.id, e.target.value, s.name)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
                      />
                      <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button type="button" onClick={(e) => { e.stopPropagation(); void moveStage(s.id, "up"); }} className="text-slate-600 hover:text-cyan-400 p-0.5 transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                        </button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); void moveStage(s.id, "down"); }} className="text-slate-600 hover:text-cyan-400 p-0.5 transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </form>
            </div>

            <div className="overflow-x-auto rounded-3xl border border-slate-800 bg-[#0f172a]/80 p-6 shadow-2xl backdrop-blur-sm">
              <div className="flex items-center justify-between border-b border-slate-800 pb-5 mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-cyan-500 shadow-lg shadow-cyan-500/30 text-slate-950">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white tracking-tight">Pipeline de Vendas</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Gestão visual e arraste de leads em tempo real</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {/* Search */}
                  <div className="relative">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar lead..."
                      className="w-52 rounded-xl border border-slate-800 bg-slate-950 pl-10 pr-4 py-2 text-xs text-slate-100 placeholder:text-slate-500 outline-none focus:border-cyan-500/50 transition-all"
                    />
                  </div>
                  {/* Status Filter */}
                  <div className="flex items-center gap-1">
                    {[
                      { value: "all", label: "Todos", color: "text-slate-400 bg-slate-800/60 border-slate-700" },
                      { value: "open", label: "Abertos", color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30" },
                      { value: "won", label: "Ganhos", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
                      { value: "lost", label: "Perdidos", color: "text-rose-400 bg-rose-500/10 border-rose-500/30" }
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setStatusFilter(opt.value)}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest border transition-all ${statusFilter === opt.value
                          ? opt.color + " ring-1 ring-current"
                          : "text-slate-500 bg-transparent border-transparent hover:bg-slate-800/50"
                          }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none">Visibilidade</span>
                  <select
                    className="appearance-none rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-xs font-bold text-slate-400 outline-none focus:border-cyan-500/50 transition-all hover:bg-slate-900 cursor-pointer"
                    value={kanbanPageSize}
                    onChange={(e) => setKanbanPageSize(Number(e.target.value))}
                  >
                    {[3, 5, 10, 20].map(v => <option key={v} value={v}>{v} leads por fase</option>)}
                  </select>
                </div>
              </div>
              <div className="mt-3 flex min-w-max gap-3">
                {stages.map((stage) => (
                  <article
                    key={stage.id}
                    className={`w-72 rounded-lg border p-3 ${dragOverStageId === stage.id ? "border-cyan-500 bg-cyan-900/10" : "border-slate-800 bg-slate-900"} flex flex-col`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (dragOverStageId !== stage.id) setDragOverStageId(stage.id);
                    }}
                    onDragLeave={() => {
                      if (dragOverStageId === stage.id) setDragOverStageId(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggedStageId) {
                        void handleDropStage(stage.id);
                      } else {
                        void handleDropLeadOnStage(stage.id);
                      }
                    }}
                  >
                    <div className="group/stage-header mb-3 flex items-center justify-between gap-2 p-1">
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        {/* Drag Handle (Hamburger) */}
                        <div
                          draggable
                          onDragStart={() => setDraggedStageId(stage.id)}
                          onDragEnd={() => setDraggedStageId(null)}
                          className="cursor-grab active:cursor-grabbing p-1 text-slate-600 hover:text-cyan-400 transition-colors"
                          title="Arraste para mover etapa"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                          </svg>
                        </div>
                        <input
                          key={`kanban-stage-${stage.id}-${stage.name}`}
                          className="flex-1 min-w-0 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-black outline-none focus:border-cyan-500/50 focus:bg-slate-950 transition-all uppercase tracking-tight"
                          style={{ color: stage.color }}
                          defaultValue={stage.name}
                          onBlur={(e) => void handleSaveStageNameBlur(stage.id, e.target.value, stage.name)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
                          }}
                        />
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover/stage-header:opacity-100 transition-opacity">
                        <button onClick={() => void moveStage(stage.id, "up")} disabled={stages.indexOf(stage) === 0} className="p-1 text-slate-600 hover:text-cyan-500 disabled:opacity-20 transition-colors" title="Subir etapa">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                        </button>
                        <button onClick={() => void moveStage(stage.id, "down")} disabled={stages.indexOf(stage) === stages.length - 1} className="p-1 text-slate-600 hover:text-cyan-500 disabled:opacity-20 transition-colors" title="Descer etapa">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </button>
                        <span className="ml-1 text-[10px] font-bold text-slate-500 bg-slate-800/50 px-1.5 py-0.5 rounded-full">{(leadsByStage.get(stage.id) || []).length}</span>
                      </div>
                    </div>
                    <div
                      className="flex-1 space-y-2"
                      style={{
                        minHeight: (() => {
                          const totalInStage = (leadsByStage.get(stage.id) || []).length;
                          const visibleCards = Math.min(kanbanPageSize, totalInStage);
                          if (visibleCards <= 0) return "0rem";
                          const cardHeightRem = 5.5;
                          const cardGapRem = 0.5;
                          return `${visibleCards * cardHeightRem + Math.max(0, visibleCards - 1) * cardGapRem}rem`;
                        })()
                      }}
                    >
                      {(leadsByStage.get(stage.id) || [])
                        .slice(
                          ((kanbanStagePage[stage.id] ?? 1) - 1) * kanbanPageSize,
                          (kanbanStagePage[stage.id] ?? 1) * kanbanPageSize
                        )
                        .map((lead) => (
                          <button
                            key={lead.id}
                            type="button"
                            draggable
                            onDragStart={() => setDraggedLeadId(lead.id)}
                            onDragEnd={() => {
                              setDraggedLeadId(null);
                              setDragOverStageId(null);
                            }}
                            onClick={() => setSelectedLeadId(lead.id)}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setContextMenu({ x: e.pageX, y: e.pageY, lead });
                            }}
                            className={`group relative w-full rounded-xl border p-4 text-left transition-all hover:scale-[1.02] active:scale-95 ${selectedLeadId === lead.id
                              ? "border-cyan-500 bg-cyan-500/10 shadow-lg shadow-cyan-500/10"
                              : "border-slate-800 bg-slate-900/50 hover:border-slate-700 hover:bg-slate-900"
                              } ${movingLeadId === lead.id ? "opacity-60 cursor-wait" : "cursor-grab"}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-bold text-slate-100 line-clamp-1">{lead.name || "Sem nome"}</p>
                              <div className={`mt-0.5 rounded-full p-1 ${lead.botEnabled ? "bg-cyan-500/20 text-cyan-400" : "bg-slate-800 text-slate-500"}`}>
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                              </div>
                            </div>
                            <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
                              <svg className="w-3 h-3 text-emerald-500" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.414 0 .018 5.393 0 12.028c0 2.119.554 4.187 1.61 6.006L0 24l6.117-1.605a11.803 11.803 0 005.925 1.586h.005c6.632 0 12.028-5.396 12.033-12.03a11.751 11.751 0 00-3.489-8.452z" />
                              </svg>
                              <span>{lead.waId}</span>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {lead.latestMessage ? (
                                <div className="w-full rounded-lg bg-slate-950/50 p-2 text-[11px] text-slate-400 italic">
                                  "{lead.latestMessage.body}"
                                </div>
                              ) : null}
                            </div>
                            {movingLeadId === lead.id ? (
                              <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-slate-950/40 backdrop-blur-[2px]">
                                <div className="flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1.5 shadow-xl border border-slate-700">
                                  <svg className="animate-spin h-3 w-3 text-cyan-500" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                  <span className="text-[10px] font-bold text-cyan-500 uppercase">Movendo...</span>
                                </div>
                              </div>
                            ) : null}
                          </button>
                        ))}
                    </div>
                    {(() => {
                      const totalInStage = (leadsByStage.get(stage.id) || []).length;
                      if (totalInStage <= kanbanPageSize) return null;
                      const currentPage = kanbanStagePage[stage.id] ?? 1;
                      const totalPages = Math.max(1, Math.ceil(totalInStage / kanbanPageSize));
                      return (
                        <div className="mt-2 flex items-center justify-between border-t border-slate-800 pt-2 text-[11px] text-slate-400">
                          <span>
                            Página {currentPage}/{totalPages}
                          </span>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              className="rounded border border-slate-700 px-2 py-1 disabled:opacity-50"
                              disabled={currentPage <= 1}
                              onClick={() => handleKanbanStagePageChange(stage.id, currentPage - 1)}
                            >
                              Anterior
                            </button>
                            <button
                              type="button"
                              className="rounded border border-slate-700 px-2 py-1 disabled:opacity-50"
                              disabled={currentPage >= totalPages}
                              onClick={() => handleKanbanStagePageChange(stage.id, currentPage + 1)}
                            >
                              Próxima
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </article>
                ))}
              </div>
            </div>

            <section className="relative overflow-hidden rounded-2xl border border-slate-800 bg-[#0f172a]/80 shadow-2xl backdrop-blur-sm">
              <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/50 p-5">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-500">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-sm font-bold uppercase tracking-widest text-slate-100">Painel do Lead</h2>
                    <p className="text-[10px] text-slate-500 mt-0.5">Gestão completa de histórico e tarefas</p>
                  </div>
                </div>
                {selectedLead && (
                  <button
                    onClick={() => setSelectedLeadId(null)}
                    className="p-2 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              {leadDetailsLoading && selectedLeadId ? (
                <div className="flex h-100px flex-col items-center justify-center gap-4 text-slate-500">
                  <svg className="animate-spin h-8 w-8 text-cyan-500" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  <p className="text-sm font-medium animate-pulse">Carregando detalhes do lead...</p>
                </div>
              ) : selectedLead ? (
                <div className="grid gap-0 lg:grid-cols-[400px_1fr]">
                  {/* Sidebar de Informações */}
                  <div className="border-r border-slate-800 p-6 space-y-6 bg-slate-900/20">
                    <div className="space-y-4">
                      <div className="flex items-center gap-4">
                        <div className="h-16 w-16 rounded-2xl bg-linear-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 shadow-lg shadow-cyan-500/20">
                          <span className="text-2xl font-black">{selectedLead.name?.[0]?.toUpperCase() || "L"}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-bold text-white truncate">{selectedLead.name || "Sem nome"}</h3>
                          <div className="flex items-center gap-1.5 text-xs text-slate-400">
                            <svg className="w-3 h-3 text-emerald-500 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.414 0 .018 5.393 0 12.028c0 2.119.554 4.187 1.61 6.006L0 24l6.117-1.605a11.803 11.803 0 005.925 1.586h.005c6.632 0 12.028-5.396 12.033-12.03a11.751 11.751 0 00-3.489-8.452z" />
                            </svg>
                            <span className="truncate">{selectedLead.waId}</span>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                          <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Origem</span>
                          <span className="block text-sm font-medium text-slate-200 mt-1">{selectedLead.source || "Direto"}</span>
                        </div>
                        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                          <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Etapa</span>
                          <select
                            className="bg-transparent text-sm font-medium text-cyan-400 outline-none w-full mt-1 appearance-none"
                            value={selectedLead.stageId ?? ""}
                            onChange={(e) => void updateLead(selectedLead.id, `/crm/leads/${selectedLead.id}/stage`, { stageId: Number(e.target.value) })}
                          >
                            {stages.map(s => <option key={s.id} value={s.id} className="bg-slate-900 text-slate-200">{s.name}</option>)}
                          </select>
                        </div>
                      </div>

                      <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 p-4">
                        <div className="flex items-center gap-2">
                          <div className={`p-1.5 rounded-lg ${selectedLead.botEnabled ? "bg-cyan-500/20 text-cyan-500" : "bg-slate-800 text-slate-500"}`}>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                          </div>
                          <span className="text-xs font-bold uppercase tracking-widest text-slate-300">Automação AI</span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={selectedLead.botEnabled}
                            onChange={(e) => void updateLead(selectedLead.id, `/crm/leads/${selectedLead.id}/bot`, { enabled: e.target.checked })}
                          />
                          <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500"></div>
                        </label>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Notas Internas</label>
                        <textarea
                          className="w-full min-h-[120px] rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:border-cyan-500/50 transition-all resize-none"
                          defaultValue={selectedLead.notes || ""}
                          onBlur={(e) => void updateLead(selectedLead.id, `/crm/leads/${selectedLead.id}`, { notes: e.target.value }, "PUT")}
                          placeholder="Clique para adicionar notas sobre o lead..."
                        />
                      </div>

                      {/* Bot Persona Custom */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Persona do Bot (personalizada)</label>
                        <textarea
                          className="w-full min-h-[80px] rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:border-violet-500/50 transition-all resize-none"
                          defaultValue={selectedLead.customBotPersona || ""}
                          onBlur={(e) => void updateLead(selectedLead.id, `/crm/leads/${selectedLead.id}/persona`, { persona: e.target.value }, "PATCH")}
                          placeholder="Deixe vazio para usar a persona padrão. Ex: 'Responda de forma mais formal para este cliente VIP...'"
                        />
                      </div>

                      <button
                        type="button"
                        className="w-full flex items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-xs font-bold text-rose-400 hover:bg-rose-500 hover:text-white transition-all group"
                        disabled={deletingLeadId === selectedLead.id}
                        onClick={() =>
                          setConfirmDialog({
                            title: "Excluir permanentemente?",
                            description: "Isso removerá todo o histórico de mensagens e tarefas vinculadas a este lead.",
                            confirmText: "Sim, excluir lead",
                            tone: "danger",
                            action: { type: "delete-lead", leadId: selectedLead.id, leadName: selectedLead.name, waId: selectedLead.waId }
                          })
                        }
                      >
                        <svg className="w-4 h-4 opacity-70 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        {deletingLeadId === selectedLead.id ? "Removendo..." : "Excluir Lead"}
                      </button>
                    </div>
                  </div>

                  {/* Conteúdo Principal (Mensagens e Tarefas) */}
                  <div className="p-0 flex flex-col h-[650px]">
                    {/* Tabs / Headers para o conteúdo principal */}
                    <div className="flex items-center border-b border-slate-800 px-6 pt-6 gap-8">
                      <button className="pb-4 text-sm font-bold uppercase tracking-widest text-cyan-500 border-b-2 border-cyan-500">Histórico</button>
                      <button
                        onClick={() => { setActiveChatWaId(selectedLead.waId); setActivePanel("chat"); }}
                        className="pb-4 text-sm font-bold uppercase tracking-widest text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-2 border-b-2 border-transparent hover:border-emerald-400"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.102C3.512 15.046 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        Conversar
                      </button>
                      <button className="pb-4 text-sm font-bold uppercase tracking-widest text-slate-500 hover:text-slate-300 transition-colors">Tarefas</button>
                    </div>

                    <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-[1fr_350px]">
                      {/* Chat History */}
                      <div className="min-h-0 flex flex-col border-r border-slate-800">
                        <div className="min-h-0 flex-1 p-4 space-y-3 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                          {leadMessages.length > 0 ? (
                            leadMessages.map((m) => (
                              <div
                                key={m.id}
                                className={`flex ${m.direction === "in" ? "justify-start" : "justify-end"}`}
                              >
                                <div
                                  className={`flex flex-col max-w-[80%] ${m.direction === "in" ? "items-start" : "items-end"}`}
                                >
                                  <div className={`rounded-2xl px-5 py-3.5 text-sm shadow-md ${m.direction === "in"
                                    ? "bg-slate-800 text-slate-100 rounded-tl-none border border-slate-700/50"
                                    : "bg-cyan-600 text-white rounded-tr-none shadow-cyan-500/20"
                                    }`}>
                                    <p className="leading-relaxed whitespace-pre-wrap">{m.body}</p>
                                  </div>
                                  <span className={`text-[9px] mt-1.5 font-bold uppercase tracking-widest text-slate-500 ${m.direction === "in" ? "pl-1" : "pr-1"}`}>
                                    {m.direction === "in" ? "Lead" : "AI Assistant"} • {new Date(m.createdAt).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="flex h-full flex-col items-center justify-center text-slate-600">
                              <svg className="w-12 h-12 mb-3 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                              </svg>
                              <p className="text-xs uppercase tracking-widest font-bold">Nenhuma mensagem registrada</p>
                            </div>
                          )}
                        </div>
                        <div className="shrink-0 p-4 bg-slate-900/40 border-t border-slate-800">
                          <PaginationControls
                            page={leadMessagesPagination?.page || 1}
                            totalPages={leadMessagesPagination?.totalPages || 1}
                            totalItems={leadMessagesPagination?.total || 0}
                            pageSize={leadMessagesPageSize}
                            loading={leadMessagesLoading}
                            onPageChange={(page) => void handleChangeLeadMessagesPage(page)}
                            onPageSizeChange={(pageSize) => void handleChangeLeadMessagesPageSize(pageSize)}
                          />
                        </div>
                      </div>

                      {/* Task Section */}
                      <div className="flex flex-col bg-slate-900/40">
                        <div className="p-5 border-b border-slate-800">
                          <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400">Próximos Passos</h4>
                        </div>
                        <div className="flex-1 p-5 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800">
                          <form className="mb-6 space-y-4" onSubmit={handleCreateTask}>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Título da Tarefa</label>
                              <input className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-slate-100 placeholder:text-slate-600 outline-none focus:border-cyan-500/50 transition-all" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Ex: Retornar a ligação de vendas, Enviar proposta..." required />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Notas / Descrição (Opcional)</label>
                              <textarea className="w-full min-h-[60px] rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-slate-100 placeholder:text-slate-600 outline-none focus:border-cyan-500/50 transition-all resize-none" value={taskDescription} onChange={(e) => setTaskDescription(e.target.value)} placeholder="Detalhes de como executar essa tarefa e o que não esquecer..." />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Data e Hora Máxima</label>
                                <input className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-[10px] text-slate-100 outline-none focus:border-cyan-500/50 transition-all" type="datetime-local" value={taskDueAt} onChange={(e) => setTaskDueAt(e.target.value)} required />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Relevância</label>
                                <select className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-[10px] text-slate-100 outline-none focus:border-cyan-500/50 transition-all font-bold uppercase tracking-widest" value={taskPriority} onChange={(e) => setTaskPriority(e.target.value as TaskPriority)}>
                                  {TASK_PRIORITIES.map(p => <option key={p} value={p}>{p === "high" ? "Alta" : p === "medium" ? "Média" : "Baixa"}</option>)}
                                </select>
                              </div>
                            </div>
                            <button type="submit" disabled={taskSubmitting} className="w-full rounded-xl bg-slate-100 px-4 py-2.5 text-[10px] font-black text-slate-950 hover:bg-white transition-all disabled:opacity-50 uppercase tracking-widest">
                              {taskSubmitting ? "Salvando..." : "Adicionar Tarefa"}
                            </button>
                          </form>

                          <div className="space-y-3">
                            {(selectedLead.tasks || []).length > 0 ? (
                              (selectedLead.tasks || []).map((task) => (
                                <div key={task.id} className="group relative rounded-xl border border-slate-800 bg-slate-950 p-3 transition-all hover:border-slate-700">
                                  <div className="flex items-start justify-between">
                                    <div>
                                      <p className={`text-xs font-bold ${task.status === 'done' ? 'text-slate-500 line-through' : 'text-slate-200'}`}>{task.title}</p>
                                      <div className="mt-1 flex items-center gap-2">
                                        <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${task.priority === 'high' ? 'bg-rose-500/10 text-rose-500' :
                                          task.priority === 'medium' ? 'bg-amber-500/10 text-amber-500' : 'bg-slate-800 text-slate-500'
                                          }`}>{task.priority}</span>
                                        <span className="text-[9px] text-slate-500 font-medium">{new Date(task.dueAt).toLocaleDateString("pt-BR")}</span>
                                      </div>
                                    </div>
                                    <button onClick={() => void handleDeleteTask(task.id)} className="opacity-0 group-hover:opacity-100 p-1 text-slate-600 hover:text-rose-500 transition-all">
                                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                  </div>
                                  <div className="mt-3">
                                    <select
                                      className="w-full rounded-lg border border-slate-800 bg-slate-900 px-2 py-1.5 text-[10px] font-bold text-slate-400 outline-none"
                                      value={task.status}
                                      onChange={(e) => void apiFetch(`/crm/tasks/${task.id}/status`, { method: "PATCH", body: JSON.stringify({ status: e.target.value }) }).then(async () => {
                                        if (selectedLeadId) await loadLeadDetails(selectedLeadId);
                                        await loadCrm();
                                      })}
                                    >
                                      {TASK_STATUSES.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                                    </select>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <p className="text-[10px] text-center font-bold text-slate-600 uppercase tracking-widest mt-10">Fila de tarefas vazia</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-[400px] flex-col items-center justify-center text-slate-600">
                  <div className="mb-4 rounded-full bg-slate-900 p-6 border border-slate-800">
                    <svg className="w-12 h-12 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                    </svg>
                  </div>
                  <p className="text-sm font-bold uppercase tracking-widest animate-pulse">Selecione um lead no pipeline para abrir o painel</p>
                </div>
              )}
            </section>
          </section>
        ) : null}

        <FaqManagerSection active={activePanel === "faqs"} faqs={faqs} faqQuestion={faqQuestion} faqAnswer={faqAnswer} faqSubmitting={faqSubmitting} editingFaqId={editingFaqId} editingFaqQuestion={editingFaqQuestion} editingFaqAnswer={editingFaqAnswer} editingFaqIsActive={editingFaqIsActive} faqUpdatingId={faqUpdatingId} faqDeletingId={faqDeletingId} onFaqQuestionChange={setFaqQuestion} onFaqAnswerChange={setFaqAnswer} onCreateFaqSubmit={handleCreateFaq} onStartEditFaq={startEditFaq} onCancelEditFaq={cancelEditFaq} onEditingFaqQuestionChange={setEditingFaqQuestion} onEditingFaqAnswerChange={setEditingFaqAnswer} onEditingFaqIsActiveChange={setEditingFaqIsActive} onSaveFaq={() => void handleSaveFaq()} onOpenConfirm={setConfirmDialog} />

        {activePanel === "chat" && <ChatSection initialSelectedWaId={activeChatWaId} />}

        <AnalyticsSection active={activePanel === "analytics"} />
        <CalendarSection active={activePanel === "calendar"} />

        <ConfirmModal open={Boolean(confirmDialog)} title={confirmDialog?.title || ""} description={confirmDialog?.description || ""} confirmText={confirmDialog?.confirmText || "Confirmar"} tone={confirmDialog?.tone || "danger"} loading={Boolean(faqDeletingId || faqUpdatingId || deletingLeadId)} onCancel={() => setConfirmDialog(null)} onConfirm={() => { handleConfirmAction().catch((err) => setError(err instanceof Error ? err.message : "Falha ao confirmar ação.")); }} />

        <ToastContainer toasts={toasts} removeToast={removeToast} />
        <MessageNotifications />

      </section>
      {/* Context Menu - rendered as portal to avoid positioning issues from backdrop-blur */}
      {contextMenu && createPortal(
        <>
          <div className="fixed inset-0 z-[9990]" onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }} />
          <div
            ref={(el) => {
              if (el) {
                const rect = el.getBoundingClientRect();
                const docW = document.documentElement.scrollWidth;
                const docH = document.documentElement.scrollHeight;
                const maxX = Math.max(0, docW - rect.width - 8);
                const maxY = Math.max(0, docH - rect.height - 8);
                const clampedX = Math.min(contextMenu.x, maxX);
                const clampedY = Math.min(contextMenu.y, maxY);
                if (parseFloat(el.style.left) !== clampedX || parseFloat(el.style.top) !== clampedY) {
                  el.style.left = `${clampedX}px`;
                  el.style.top = `${clampedY}px`;
                }
              }
            }}
            className="absolute z-[9991] min-w-[220px] animate-in fade-in zoom-in-95 duration-150"
            style={{
              left: contextMenu.x,
              top: contextMenu.y
            }}
          >
            <div className="rounded-xl border border-slate-700 bg-slate-900 backdrop-blur-xl shadow-2xl shadow-black/40 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 bg-slate-800/30">
                <p className="text-sm font-bold text-white truncate">{contextMenu.lead.name || "Sem nome"}</p>
                <p className="text-[10px] text-slate-500 font-mono">{contextMenu.lead.waId}</p>
              </div>
              <div className="p-1.5">
                <button onClick={() => { setActiveChatWaId(contextMenu.lead.waId); setActivePanel("chat"); setContextMenu(null); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm text-slate-200 hover:bg-cyan-500/10 hover:text-cyan-400 transition-all group">
                  <svg className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                  <span className="font-medium">Abrir Chat</span>
                </button>
                <button onClick={() => { setSelectedLeadId(contextMenu.lead.id); setContextMenu(null); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm text-slate-200 hover:bg-slate-700/50 transition-all group">
                  <svg className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  <span className="font-medium">Ver Detalhes</span>
                </button>
                <div className="h-px bg-slate-800 my-1 mx-2" />
                <button onClick={() => { void updateLead(contextMenu.lead.id, `/crm/leads/${contextMenu.lead.id}/bot`, { enabled: !contextMenu.lead.botEnabled }); setContextMenu(null); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm text-slate-200 hover:bg-slate-700/50 transition-all">
                  <svg className={`w-4 h-4 ${contextMenu.lead.botEnabled ? "text-cyan-400" : "text-slate-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  <span className="font-medium">{contextMenu.lead.botEnabled ? "Desativar Bot" : "Ativar Bot"}</span>
                  <div className={`ml-auto w-2 h-2 rounded-full ${contextMenu.lead.botEnabled ? "bg-cyan-400" : "bg-slate-600"}`} />
                </button>
                <div className="h-px bg-slate-800 my-1 mx-2" />
                <div className="px-3 py-1"><span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Status</span></div>
                {[
                  { value: "open", label: "Aberto", color: "text-cyan-400 hover:bg-cyan-500/10", dot: "bg-cyan-400" },
                  { value: "won", label: "Ganho", color: "text-emerald-400 hover:bg-emerald-500/10", dot: "bg-emerald-400" },
                  { value: "lost", label: "Perdido", color: "text-rose-400 hover:bg-rose-500/10", dot: "bg-rose-400" }
                ].map((s) => (
                  <button key={s.value} onClick={() => { void updateLead(contextMenu.lead.id, `/crm/leads/${contextMenu.lead.id}`, { leadStatus: s.value }, "PUT"); setContextMenu(null); }} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm transition-all ${s.color}`}>
                    <div className={`w-2.5 h-2.5 rounded-full ${s.dot} ${contextMenu.lead.leadStatus === s.value ? "ring-2 ring-current ring-offset-1 ring-offset-slate-900" : "opacity-40"}`} />
                    <span className={`font-medium ${contextMenu.lead.leadStatus === s.value ? "" : "text-slate-400"}`}>{s.label}</span>
                    {contextMenu.lead.leadStatus === s.value && <svg className="w-3.5 h-3.5 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                  </button>
                ))}
                <div className="h-px bg-slate-800 my-1 mx-2" />
                <button onClick={() => setContextMenu((prev) => prev ? { ...prev, stageSubmenu: !prev.stageSubmenu } : null)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm text-slate-200 hover:bg-slate-700/50 transition-all group">
                  <svg className="w-4 h-4 text-slate-500 group-hover:text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>
                  <span className="font-medium">Mover para Etapa</span>
                  <svg className={`w-3.5 h-3.5 ml-auto text-slate-500 transition-transform ${contextMenu.stageSubmenu ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
                {contextMenu.stageSubmenu && (
                  <div className="mx-2 mb-1 rounded-lg border border-slate-800 bg-slate-950 overflow-hidden">
                    {stages.map((st) => (
                      <button key={st.id} onClick={() => { void updateLead(contextMenu.lead.id, `/crm/leads/${contextMenu.lead.id}/stage`, { stageId: st.id }); setContextMenu(null); }} className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs transition-all hover:bg-slate-800 ${contextMenu.lead.stageId === st.id ? "text-white font-bold" : "text-slate-400"}`}>
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: st.color }} />
                        <span className="truncate">{st.name}</span>
                        {contextMenu.lead.stageId === st.id && <svg className="w-3 h-3 ml-auto text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                      </button>
                    ))}
                  </div>
                )}
                <div className="h-px bg-slate-800 my-1 mx-2" />
                <button onClick={() => { setConfirmDialog({ title: "Excluir permanentemente?", description: `Isso removerá "${contextMenu.lead.name || contextMenu.lead.waId}" e todo o histórico.`, confirmText: "Sim, excluir", tone: "danger", action: { type: "delete-lead", leadId: contextMenu.lead.id, leadName: contextMenu.lead.name, waId: contextMenu.lead.waId } }); setContextMenu(null); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm text-rose-400 hover:bg-rose-500/10 transition-all group">
                  <svg className="w-4 h-4 text-rose-400/60 group-hover:text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  <span className="font-medium">Excluir Lead</span>
                </button>
              </div>
            </div>
          </div>
        </>,
        document.body
      )}
    </main>
  );
}
