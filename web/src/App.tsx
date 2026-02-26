
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import ConfirmModal from "./components/ConfirmModal";
import FaqManagerSection from "./components/FaqManagerSection";
import StatCard from "./components/StatCard";
import { apiFetch } from "./lib/apiFetch";
import type { AuthUser, ConfirmDialogState, ConversionMetrics, FaqItem, Lead, PipelineStage, TaskPriority, TaskStatus } from "./types/dashboard";

const TASK_PRIORITIES: TaskPriority[] = ["low", "medium", "high"];
const TASK_STATUSES: TaskStatus[] = ["open", "done", "canceled"];

export default function App() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [activePanel, setActivePanel] = useState<"crm" | "faqs">("crm");

  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [faqSubmitting, setFaqSubmitting] = useState(false);
  const [faqUpdatingId, setFaqUpdatingId] = useState<number | null>(null);
  const [faqDeletingId, setFaqDeletingId] = useState<number | null>(null);
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
  const [leadSubmitting, setLeadSubmitting] = useState(false);
  const [taskSubmitting, setTaskSubmitting] = useState(false);
  const [stageSubmitting, setStageSubmitting] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");

  const [leadName, setLeadName] = useState("");
  const [leadWaId, setLeadWaId] = useState("");
  const [leadSource, setLeadSource] = useState("");
  const [leadNotes, setLeadNotes] = useState("");
  const [leadStageId, setLeadStageId] = useState<number | "">("");

  const [newStageName, setNewStageName] = useState("");
  const [newStageColor, setNewStageColor] = useState("#06b6d4");

  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskDueAt, setTaskDueAt] = useState("");
  const [taskPriority, setTaskPriority] = useState<TaskPriority>("medium");

  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);

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
    if (sortedStages.length > 0 && leadStageId === "") setLeadStageId(sortedStages[0].id);
  }, [leadStageId]);

  const loadLeadDetails = useCallback(async (id: number) => {
    const result = await apiFetch<{ lead: Lead }>(`/crm/leads/${id}`);
    setSelectedLead(result.lead);
    setSelectedLeadId(id);
  }, []);

  const checkSession = useCallback(async () => {
    setLoading(true);
    try {
      const session = await apiFetch<{ user: AuthUser }>("/auth/me");
      setUser(session.user);
      await Promise.all([loadFaqs(), loadCrm()]);
      setError("");
    } catch {
      setUser(null);
      setFaqs([]);
      setStages([]);
      setLeads([]);
      setSelectedLead(null);
    } finally {
      setLoading(false);
    }
  }, [loadFaqs, loadCrm]);

  useEffect(() => {
    checkSession().catch(() => setLoading(false));
  }, [checkSession]);

  useEffect(() => {
    if (!selectedLeadId) return;
    loadLeadDetails(selectedLeadId).catch(() => setError("Falha ao carregar lead."));
  }, [selectedLeadId, loadLeadDetails]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await apiFetch("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
      setPassword("");
      await checkSession();
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
      setSelectedLead(null);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao sair.");
    } finally {
      setSubmitting(false);
    }
  };

  const refreshAll = async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadCrm(), loadFaqs()]);
      if (selectedLeadId) await loadLeadDetails(selectedLeadId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar dados.");
    } finally {
      setRefreshing(false);
    }
  };
  const handleCreateLead = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!leadName.trim() || !leadWaId.trim() || !leadStageId) {
      setError("Nome, WhatsApp e etapa são obrigatórios.");
      return;
    }

    setLeadSubmitting(true);
    try {
      const result = await apiFetch<{ lead: Lead }>("/crm/leads", {
        method: "POST",
        body: JSON.stringify({ name: leadName.trim(), waId: leadWaId.trim(), stageId: leadStageId, source: leadSource || null, notes: leadNotes || null })
      });
      setLeadName("");
      setLeadWaId("");
      setLeadSource("");
      setLeadNotes("");
      await loadCrm();
      setSelectedLeadId(result.lead.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar lead.");
    } finally {
      setLeadSubmitting(false);
    }
  };

  const updateLead = async (leadId: number, path: string, body: unknown, method: "PATCH" | "PUT" = "PATCH") => {
    await apiFetch(path, { method, body: JSON.stringify(body) });
    await loadCrm();
    if (selectedLeadId === leadId) await loadLeadDetails(leadId);
  };

  const handleCreateTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedLeadId || !taskTitle.trim() || !taskDueAt) return;
    setTaskSubmitting(true);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar tarefa.");
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao remover tarefa.");
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar etapa.");
    } finally {
      setStageSubmitting(false);
    }
  };

  const moveStage = async (stageId: number, direction: "up" | "down") => {
    const idx = stages.findIndex((stage) => stage.id === stageId);
    const target = direction === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || target < 0 || target >= stages.length) return;
    const reordered = stages.slice();
    const [item] = reordered.splice(idx, 1);
    reordered.splice(target, 0, item);
    try {
      await apiFetch("/crm/stages/reorder", { method: "PUT", body: JSON.stringify({ stageIds: reordered.map((s) => s.id) }) });
      await loadCrm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao reordenar etapas.");
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

  const handleConfirmAction = async () => {
    if (!confirmDialog || confirmDialog.action.type !== "delete-faq") return;
    await handleDeleteFaq(confirmDialog.action.faqId);
    setConfirmDialog(null);
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
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
      <section className="mx-auto max-w-7xl rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div><h1 className="text-2xl font-semibold">CRM WhatsApp</h1><p className="text-sm text-slate-400">Sessão ativa: {user.username} ({user.role})</p></div>
          <div className="flex flex-wrap gap-2">
            <button className={`rounded-lg border px-4 py-2 text-sm ${activePanel === "crm" ? "border-cyan-500 bg-cyan-500 text-slate-950" : "border-slate-700"}`} onClick={() => setActivePanel("crm")} type="button">CRM</button>
            <button className={`rounded-lg border px-4 py-2 text-sm ${activePanel === "faqs" ? "border-cyan-500 bg-cyan-500 text-slate-950" : "border-slate-700"}`} onClick={() => setActivePanel("faqs")} type="button">FAQs</button>
            <button className="rounded-lg border border-cyan-700/70 px-4 py-2 text-sm text-cyan-200" onClick={() => void refreshAll()} type="button" disabled={refreshing}>{refreshing ? "Atualizando..." : "Atualizar"}</button>
            <button className="rounded-lg border border-slate-700 px-4 py-2 text-sm" onClick={handleLogout} type="button">Sair</button>
          </div>
        </header>

        {error ? <p className="mt-4 rounded border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p> : null}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Leads abertos" value={metrics?.overall.open ?? 0} />
          <StatCard label="Ganhos" value={metrics?.overall.won ?? 0} />
          <StatCard label="Perdidos" value={metrics?.overall.lost ?? 0} />
          <StatCard label="Fechados" value={metrics?.overall.totalClosed ?? 0} />
          <article className="rounded-xl border border-slate-800 bg-slate-950 p-4"><p className="text-xs uppercase tracking-wide text-slate-400">Taxa de conversão</p><p className="mt-2 text-2xl font-semibold text-cyan-300">{metrics?.overall.conversionRate ?? 0}%</p></article>
        </div>

        {activePanel === "crm" ? (
          <section className="mt-6 space-y-4">
            <div className="grid gap-4 lg:grid-cols-3">
              <form className="rounded-xl border border-slate-800 bg-slate-950 p-4" onSubmit={handleCreateLead}>
                <h2 className="text-sm font-medium text-slate-300">Novo lead</h2>
                <div className="mt-3 grid gap-2">
                  <input className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm" value={leadName} onChange={(e) => setLeadName(e.target.value)} placeholder="Nome" required />
                  <input className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm" value={leadWaId} onChange={(e) => setLeadWaId(e.target.value)} placeholder="WhatsApp" required />
                  <select className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm" value={leadStageId} onChange={(e) => setLeadStageId(Number(e.target.value))} required><option value="">Selecione etapa</option>{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                  <input className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm" value={leadSource} onChange={(e) => setLeadSource(e.target.value)} placeholder="Origem (opcional)" />
                  <textarea className="min-h-20 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm" value={leadNotes} onChange={(e) => setLeadNotes(e.target.value)} placeholder="Observações (opcional)" />
                  <button type="submit" disabled={leadSubmitting} className="rounded bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-60">{leadSubmitting ? "Salvando..." : "Criar lead"}</button>
                </div>
              </form>

              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4"><h2 className="text-sm font-medium text-slate-300">Filtros</h2><div className="mt-3 grid gap-2"><input className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar" /><select className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">Todos status</option><option value="open">Abertos</option><option value="won">Ganhos</option><option value="lost">Perdidos</option></select><select className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm" value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}><option value="all">Todas etapas</option>{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div></div>

              <form className="rounded-xl border border-slate-800 bg-slate-950 p-4" onSubmit={handleCreateStage}><h2 className="text-sm font-medium text-slate-300">Pipeline</h2><div className="mt-3 grid gap-2"><input className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm" value={newStageName} onChange={(e) => setNewStageName(e.target.value)} placeholder="Nova etapa" required /><input className="h-10 rounded border border-slate-700 bg-slate-900 px-2" type="color" value={newStageColor} onChange={(e) => setNewStageColor(e.target.value)} /><button type="submit" disabled={stageSubmitting} className="rounded bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-60">{stageSubmitting ? "Criando..." : "Criar etapa"}</button></div><div className="mt-3 space-y-1 text-xs text-slate-400">{stages.map((s) => <div key={s.id} className="flex items-center justify-between rounded border border-slate-800 px-2 py-1"><span>{s.name}</span><div className="flex gap-1"><button type="button" onClick={() => void moveStage(s.id, "up")} className="rounded border border-slate-700 px-2">Up</button><button type="button" onClick={() => void moveStage(s.id, "down")} className="rounded border border-slate-700 px-2">Down</button></div></div>)}</div></form>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 p-4"><h2 className="text-sm font-medium text-slate-300">Pipeline Kanban</h2><div className="mt-3 flex min-w-max gap-3">{stages.map((stage) => <article key={stage.id} className="w-72 rounded-lg border border-slate-800 bg-slate-900 p-3"><div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold" style={{ color: stage.color }}>{stage.name}</h3><span className="text-xs text-slate-400">{(leadsByStage.get(stage.id) || []).length}</span></div><div className="space-y-2">{(leadsByStage.get(stage.id) || []).map((lead) => <button key={lead.id} type="button" onClick={() => setSelectedLeadId(lead.id)} className={`w-full rounded-md border px-3 py-2 text-left text-sm ${selectedLeadId === lead.id ? "border-cyan-500 bg-cyan-900/20" : "border-slate-800 bg-slate-950"}`}><p className="font-medium">{lead.name || "Sem nome"}</p><p className="text-xs text-slate-400">{lead.waId}</p><p className="mt-1 text-xs text-slate-500">{lead.latestMessage?.body || "Sem mensagens"}</p></button>)}</div></article>)}</div></div>

            <section className="rounded-xl border border-slate-800 bg-slate-950 p-4"><h2 className="text-sm font-medium text-slate-300">Detalhes do lead</h2>{selectedLead ? <div className="mt-3 grid gap-4 lg:grid-cols-2"><div className="space-y-3"><div className="rounded-lg border border-slate-800 bg-slate-900 p-3 text-sm"><p><span className="text-slate-400">Nome:</span> {selectedLead.name || "Sem nome"}</p><p><span className="text-slate-400">WhatsApp:</span> {selectedLead.waId}</p><p><span className="text-slate-400">Origem:</span> {selectedLead.source || "-"}</p><div className="mt-2 grid gap-2 sm:grid-cols-3"><select className="rounded border border-slate-700 bg-slate-950 px-2 py-1" value={selectedLead.stageId || ""} onChange={(e) => void updateLead(selectedLead.id, `/crm/leads/${selectedLead.id}/stage`, { stageId: Number(e.target.value) })}>{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select><select className="rounded border border-slate-700 bg-slate-950 px-2 py-1" value={selectedLead.leadStatus} onChange={(e) => void updateLead(selectedLead.id, `/crm/leads/${selectedLead.id}/status`, { status: e.target.value })}><option value="open">open</option><option value="won">won</option><option value="lost">lost</option></select><label className="flex items-center gap-2 rounded border border-slate-700 px-2 py-1 text-xs"><input type="checkbox" checked={selectedLead.botEnabled} onChange={(e) => void updateLead(selectedLead.id, `/crm/leads/${selectedLead.id}/bot`, { enabled: e.target.checked })} />bot ativo</label></div><textarea className="mt-2 min-h-20 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1" defaultValue={selectedLead.notes || ""} onBlur={(e) => void updateLead(selectedLead.id, `/crm/leads/${selectedLead.id}`, { notes: e.target.value }, "PUT")} placeholder="Observações" /></div><div className="rounded-lg border border-slate-800 bg-slate-900 p-3"><h3 className="text-sm font-medium text-slate-300">Mensagens</h3><div className="mt-2 max-h-72 space-y-2 overflow-y-auto">{(selectedLead.messages || []).length > 0 ? (selectedLead.messages || []).map((m) => <div key={m.id} className={`rounded-md border px-3 py-2 text-sm ${m.direction === "in" ? "border-slate-700 bg-slate-950" : "border-cyan-700/40 bg-cyan-900/20"}`}><p className="text-xs text-slate-400">{m.direction === "in" ? "Pessoa" : "Bot"} - {new Date(m.createdAt).toLocaleString("pt-BR")}</p><p>{m.body}</p></div>) : <p className="text-sm text-slate-500">Sem mensagens.</p>}</div></div></div><div className="space-y-3"><form className="rounded-lg border border-slate-800 bg-slate-900 p-3" onSubmit={handleCreateTask}><h3 className="text-sm font-medium text-slate-300">Nova tarefa</h3><div className="mt-2 grid gap-2"><input className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Título" required /><textarea className="min-h-16 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm" value={taskDescription} onChange={(e) => setTaskDescription(e.target.value)} placeholder="Descrição" /><input className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm" type="datetime-local" value={taskDueAt} onChange={(e) => setTaskDueAt(e.target.value)} required /><select className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm" value={taskPriority} onChange={(e) => setTaskPriority(e.target.value as TaskPriority)}>{TASK_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}</select><button type="submit" disabled={taskSubmitting} className="rounded bg-cyan-500 px-3 py-2 text-sm font-medium text-slate-950 disabled:opacity-60">{taskSubmitting ? "Salvando..." : "Criar tarefa"}</button></div></form><div className="rounded-lg border border-slate-800 bg-slate-900 p-3"><h3 className="text-sm font-medium text-slate-300">Tarefas</h3><div className="mt-2 space-y-2">{(selectedLead.tasks || []).length > 0 ? (selectedLead.tasks || []).map((task) => <article key={task.id} className="rounded border border-slate-800 bg-slate-950 p-2 text-sm"><p className="font-medium text-slate-200">{task.title}</p><p className="text-xs text-slate-500">Vence: {new Date(task.dueAt).toLocaleString("pt-BR")} - prioridade {task.priority}</p><div className="mt-2 flex gap-2"><select className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs" value={task.status} onChange={(e) => void apiFetch(`/crm/tasks/${task.id}/status`, { method: "PATCH", body: JSON.stringify({ status: e.target.value }) }).then(async () => { if (selectedLeadId) await loadLeadDetails(selectedLeadId); await loadCrm(); })}>{TASK_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select><button type="button" className="rounded border border-rose-700/70 px-2 py-1 text-xs text-rose-300" onClick={() => void handleDeleteTask(task.id)}>Excluir</button></div></article>) : <p className="text-sm text-slate-500">Sem tarefas.</p>}</div></div></div></div> : <p className="mt-3 text-sm text-slate-400">Selecione um lead no Kanban para abrir detalhes.</p>}</section>
          </section>
        ) : null}

        <FaqManagerSection active={activePanel === "faqs"} faqs={faqs} faqQuestion={faqQuestion} faqAnswer={faqAnswer} faqSubmitting={faqSubmitting} editingFaqId={editingFaqId} editingFaqQuestion={editingFaqQuestion} editingFaqAnswer={editingFaqAnswer} editingFaqIsActive={editingFaqIsActive} faqUpdatingId={faqUpdatingId} faqDeletingId={faqDeletingId} onFaqQuestionChange={setFaqQuestion} onFaqAnswerChange={setFaqAnswer} onCreateFaqSubmit={handleCreateFaq} onStartEditFaq={startEditFaq} onCancelEditFaq={cancelEditFaq} onEditingFaqQuestionChange={setEditingFaqQuestion} onEditingFaqAnswerChange={setEditingFaqAnswer} onEditingFaqIsActiveChange={setEditingFaqIsActive} onSaveFaq={() => void handleSaveFaq()} onOpenConfirm={setConfirmDialog} />

        <ConfirmModal open={Boolean(confirmDialog)} title={confirmDialog?.title || ""} description={confirmDialog?.description || ""} confirmText={confirmDialog?.confirmText || "Confirmar"} tone={confirmDialog?.tone || "danger"} loading={Boolean(faqDeletingId || faqUpdatingId)} onCancel={() => setConfirmDialog(null)} onConfirm={() => { handleConfirmAction().catch((err) => setError(err instanceof Error ? err.message : "Falha ao confirmar ação.")); }} />
      </section>
    </main>
  );
}

