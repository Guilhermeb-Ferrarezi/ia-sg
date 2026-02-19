import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import ConfirmModal from "./components/ConfirmModal";
import DashboardConversationsSection from "./components/DashboardConversationsSection";
import FaqManagerSection from "./components/FaqManagerSection";
import StatCard from "./components/StatCard";
import { apiFetch } from "./lib/apiFetch";
import type { AuthUser, ConfirmDialogState, ContactConversation, DashboardSummary, FaqItem } from "./types/dashboard";

export default function App() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [conversations, setConversations] = useState<ContactConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [faqSubmitting, setFaqSubmitting] = useState(false);
  const [faqUpdatingId, setFaqUpdatingId] = useState<number | null>(null);
  const [faqDeletingId, setFaqDeletingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [deletingContactId, setDeletingContactId] = useState<number | null>(null);
  const [clearingContactId, setClearingContactId] = useState<number | null>(null);
  const [deletingMessageId, setDeletingMessageId] = useState<number | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);

  const [search, setSearch] = useState("");
  const [directionFilter, setDirectionFilter] = useState<"all" | "in" | "out">("all");
  const [itemsPerPage, setItemsPerPage] = useState(6);
  const [page, setPage] = useState(1);
  const [faqQuestion, setFaqQuestion] = useState("");
  const [faqAnswer, setFaqAnswer] = useState("");
  const [editingFaqId, setEditingFaqId] = useState<number | null>(null);
  const [editingFaqQuestion, setEditingFaqQuestion] = useState("");
  const [editingFaqAnswer, setEditingFaqAnswer] = useState("");
  const [editingFaqIsActive, setEditingFaqIsActive] = useState(true);
  const [activePanel, setActivePanel] = useState<"dashboard" | "faqs">("dashboard");

  const loadDashboard = useCallback(async () => {
    const [summaryResult, conversationsResult, faqResult] = await Promise.all([
      apiFetch<DashboardSummary>("/dashboard/summary"),
      apiFetch<{ contacts: ContactConversation[] }>("/dashboard/conversations"),
      apiFetch<{ faqs: FaqItem[] }>("/dashboard/faqs")
    ]);
    setSummary(summaryResult);
    setConversations(conversationsResult.contacts);
    setFaqs(faqResult.faqs);
  }, []);

  const checkSession = useCallback(async () => {
    setLoading(true);
    try {
      const session = await apiFetch<{ user: AuthUser }>("/auth/me");
      setUser(session.user);
      await loadDashboard();
      setError("");
    } catch {
      setUser(null);
      setSummary(null);
      setFaqs([]);
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, [loadDashboard]);

  useEffect(() => {
    checkSession().catch(() => {
      setLoading(false);
      setUser(null);
      setSummary(null);
      setConversations([]);
    });
  }, [checkSession]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      await apiFetch<{ user: AuthUser }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password })
      });

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
      await apiFetch<{ message: string }>("/auth/logout", { method: "POST" });
      setUser(null);
      setSummary(null);
      setFaqs([]);
      setConversations([]);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao sair.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRefreshDashboard = async () => {
    setRefreshing(true);
    setError("");
    try {
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar dados.");
    } finally {
      setRefreshing(false);
    }
  };

  const handleCreateFaq = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!faqQuestion.trim() || !faqAnswer.trim()) {
      setError("Preencha pergunta e resposta para adicionar um FAQ.");
      return;
    }

    setFaqSubmitting(true);
    setError("");
    try {
      await apiFetch<{ message: string; faq: FaqItem }>("/dashboard/faqs", {
        method: "POST",
        body: JSON.stringify({
          question: faqQuestion.trim(),
          answer: faqAnswer.trim()
        })
      });
      setFaqQuestion("");
      setFaqAnswer("");
      await loadDashboard();
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
    setError("");
  };

  const cancelEditFaq = () => {
    setEditingFaqId(null);
    setEditingFaqQuestion("");
    setEditingFaqAnswer("");
    setEditingFaqIsActive(true);
  };

  const handleSaveFaq = async () => {
    if (!editingFaqId) return;
    if (!editingFaqQuestion.trim() || !editingFaqAnswer.trim()) {
      setError("Preencha pergunta e resposta para salvar o FAQ.");
      return;
    }

    setFaqUpdatingId(editingFaqId);
    setError("");
    try {
      await apiFetch<{ message: string; faq: FaqItem }>(`/dashboard/faqs/${editingFaqId}`, {
        method: "PUT",
        body: JSON.stringify({
          question: editingFaqQuestion.trim(),
          answer: editingFaqAnswer.trim(),
          isActive: editingFaqIsActive
        })
      });
      cancelEditFaq();
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar FAQ.");
    } finally {
      setFaqUpdatingId(null);
    }
  };

  const handleDeleteFaq = async (faqId: number) => {
    setFaqDeletingId(faqId);
    setError("");
    try {
      await apiFetch<{ message: string }>(`/dashboard/faqs/${faqId}`, { method: "DELETE" });
      if (editingFaqId === faqId) cancelEditFaq();
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao remover FAQ.");
    } finally {
      setFaqDeletingId(null);
    }
  };

  const deleteContact = async (contact: ContactConversation) => {
    setDeletingContactId(contact.id);
    setError("");
    try {
      await apiFetch<{ message: string }>(`/dashboard/contacts/${contact.id}`, { method: "DELETE" });
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao apagar contato.");
    } finally {
      setDeletingContactId(null);
    }
  };

  const clearContactMessages = async (contact: ContactConversation) => {
    setClearingContactId(contact.id);
    setError("");
    try {
      await apiFetch<{ message: string; deletedCount: number }>(`/dashboard/contacts/${contact.id}/messages`, {
        method: "DELETE"
      });
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao apagar mensagens.");
    } finally {
      setClearingContactId(null);
    }
  };

  const deleteMessage = async (messageId: number) => {
    setDeletingMessageId(messageId);
    setError("");
    try {
      await apiFetch<{ message: string }>(`/dashboard/messages/${messageId}`, { method: "DELETE" });
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao apagar mensagem.");
    } finally {
      setDeletingMessageId(null);
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmDialog) return;

    if (confirmDialog.action.type === "delete-contact") return deleteContact(confirmDialog.action.contact).then(() => setConfirmDialog(null));
    if (confirmDialog.action.type === "clear-contact-messages") return clearContactMessages(confirmDialog.action.contact).then(() => setConfirmDialog(null));
    if (confirmDialog.action.type === "delete-faq") return handleDeleteFaq(confirmDialog.action.faqId).then(() => setConfirmDialog(null));
    return deleteMessage(confirmDialog.action.messageId).then(() => setConfirmDialog(null));
  };

  const filteredConversations = useMemo(() => {
    const term = search.trim().toLowerCase();

    return conversations.filter((contact) => {
      const matchesSearch =
        !term ||
        contact.waId.toLowerCase().includes(term) ||
        (contact.name || "").toLowerCase().includes(term) ||
        contact.messages.some((message) => message.body.toLowerCase().includes(term));

      const matchesDirection =
        directionFilter === "all" ||
        contact.messages.some((message) => message.direction === directionFilter);

      return matchesSearch && matchesDirection;
    });
  }, [conversations, search, directionFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredConversations.length / itemsPerPage));

  useEffect(() => {
    setPage(1);
  }, [search, directionFilter, itemsPerPage]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paginatedConversations = useMemo(() => {
    const start = (page - 1) * itemsPerPage;
    return filteredConversations.slice(start, start + itemsPerPage);
  }, [filteredConversations, page, itemsPerPage]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <p className="text-lg">Carregando sessão...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
        <section className="w-full max-w-md animate-in zoom-in-95 fade-in-0 rounded-2xl border border-slate-800 bg-slate-900 p-8 text-slate-100 shadow-2xl duration-300">
          <h1 className="text-2xl font-semibold">Painel do Bot WhatsApp</h1>
          <p className="mt-2 text-sm text-slate-400">Faça login para acessar o dashboard.</p>

          <form className="mt-6 space-y-4" onSubmit={handleLogin}>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-300">Usuário</span>
              <input
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-cyan-400"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                required
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-slate-300">Senha</span>
              <input
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-cyan-400"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>

            {error ? <p className="rounded-md border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p> : null}

            <button
              className="w-full rounded-lg bg-cyan-500 px-4 py-2 font-medium text-slate-950 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              type="submit"
              disabled={submitting}
            >
              {submitting ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
      <section className="mx-auto max-w-6xl animate-in fade-in-0 slide-in-from-bottom-2 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl duration-300">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Dashboard IA WhatsApp</h1>
            <p className="mt-1 text-sm text-slate-400">Sessão ativa: {user.username} ({user.role})</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className={`rounded-lg border px-4 py-2 text-sm transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
                activePanel === "dashboard"
                  ? "border-cyan-500 bg-cyan-500 text-slate-950"
                  : "border-slate-700 text-slate-100 hover:bg-slate-800"
              }`}
              type="button"
              onClick={() => setActivePanel("dashboard")}
              disabled={submitting || refreshing}
            >
              Dashboard
            </button>
            <button
              className={`rounded-lg border px-4 py-2 text-sm transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
                activePanel === "faqs"
                  ? "border-cyan-500 bg-cyan-500 text-slate-950"
                  : "border-slate-700 text-slate-100 hover:bg-slate-800"
              }`}
              type="button"
              onClick={() => setActivePanel("faqs")}
              disabled={submitting || refreshing}
            >
              FAQs
            </button>
            <button
              className="rounded-lg border border-cyan-700/70 px-4 py-2 text-sm text-cyan-200 transition-all hover:bg-cyan-900/20 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={() => void handleRefreshDashboard()}
              disabled={refreshing || submitting}
            >
              {refreshing ? "Atualizando..." : "Atualizar agora"}
            </button>
            <button
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm transition-all hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={handleLogout}
              disabled={submitting || refreshing}
            >
              Sair
            </button>
          </div>
        </header>

        {error ? <p className="mt-4 rounded-md border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p> : null}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Contatos" value={summary?.metrics.contacts ?? 0} />
          <StatCard label="Mensagens" value={summary?.metrics.messages ?? 0} />
          <StatCard label="Entradas" value={summary?.metrics.inbound ?? 0} />
          <StatCard label="Saídas" value={summary?.metrics.outbound ?? 0} />
          <article className="animate-in fade-in-0 slide-in-from-bottom-2 rounded-xl border border-slate-800 bg-slate-950 p-4 duration-300">
            <p className="text-xs uppercase tracking-wide text-slate-400">FAQs Ativas</p>
            <p className="mt-2 text-2xl font-semibold text-cyan-300">{summary?.metrics.activeFaqs ?? 0}</p>
            <button
              type="button"
              onClick={() => setActivePanel("faqs")}
              className="mt-3 rounded-md border border-cyan-700/70 px-3 py-1 text-xs text-cyan-200 transition hover:bg-cyan-900/20"
            >
              Ir para FAQs
            </button>
          </article>
        </div>

        <FaqManagerSection
          active={activePanel === "faqs"}
          faqs={faqs}
          faqQuestion={faqQuestion}
          faqAnswer={faqAnswer}
          faqSubmitting={faqSubmitting}
          editingFaqId={editingFaqId}
          editingFaqQuestion={editingFaqQuestion}
          editingFaqAnswer={editingFaqAnswer}
          editingFaqIsActive={editingFaqIsActive}
          faqUpdatingId={faqUpdatingId}
          faqDeletingId={faqDeletingId}
          onFaqQuestionChange={setFaqQuestion}
          onFaqAnswerChange={setFaqAnswer}
          onCreateFaqSubmit={handleCreateFaq}
          onStartEditFaq={startEditFaq}
          onCancelEditFaq={cancelEditFaq}
          onEditingFaqQuestionChange={setEditingFaqQuestion}
          onEditingFaqAnswerChange={setEditingFaqAnswer}
          onEditingFaqIsActiveChange={setEditingFaqIsActive}
          onSaveFaq={() => void handleSaveFaq()}
          onOpenConfirm={setConfirmDialog}
        />

        <DashboardConversationsSection
          active={activePanel === "dashboard"}
          summary={summary}
          search={search}
          directionFilter={directionFilter}
          itemsPerPage={itemsPerPage}
          filteredConversationsLength={filteredConversations.length}
          paginatedConversations={paginatedConversations}
          page={page}
          totalPages={totalPages}
          deletingContactId={deletingContactId}
          clearingContactId={clearingContactId}
          deletingMessageId={deletingMessageId}
          onSearchChange={setSearch}
          onDirectionFilterChange={setDirectionFilter}
          onItemsPerPageChange={setItemsPerPage}
          onOpenConfirm={setConfirmDialog}
          onPageChange={setPage}
        />

        <ConfirmModal
          open={Boolean(confirmDialog)}
          title={confirmDialog?.title || ""}
          description={confirmDialog?.description || ""}
          confirmText={confirmDialog?.confirmText || "Confirmar"}
          tone={confirmDialog?.tone || "danger"}
          loading={Boolean(deletingContactId || clearingContactId || deletingMessageId || faqDeletingId || faqUpdatingId)}
          onCancel={() => setConfirmDialog(null)}
          onConfirm={() => {
            handleConfirmAction().catch((err) => {
              setError(err instanceof Error ? err.message : "Falha ao confirmar ação.");
            });
          }}
        />
      </section>
    </main>
  );
}
