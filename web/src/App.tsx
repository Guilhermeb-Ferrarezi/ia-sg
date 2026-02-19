import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

type AuthUser = {
  username: string;
  role: string;
  exp: number;
};

type DashboardSummary = {
  metrics: {
    contacts: number;
    messages: number;
    inbound: number;
    outbound: number;
    activeFaqs: number;
  };
  latest: {
    body: string;
    direction: string;
    contact: string;
    createdAt: string;
  } | null;
};

type ContactConversation = {
  id: number;
  waId: string;
  name: string | null;
  createdAt: string;
  messages: Array<{
    id: number;
    direction: "in" | "out" | string;
    body: string;
    createdAt: string;
  }>;
};

type ConfirmDialogState = {
  title: string;
  description: string;
  confirmText: string;
  tone: "danger" | "warning";
  action:
    | { type: "delete-contact"; contact: ContactConversation }
    | { type: "clear-contact-messages"; contact: ContactConversation }
    | { type: "delete-message"; messageId: number };
};

const API_URL = import.meta.env.VITE_API_URL || "";

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    credentials: "include"
  });

  const text = await response.text();
  const data = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "message" in data &&
      typeof (data as { message: unknown }).message === "string"
        ? (data as { message: string }).message
        : "Erro na requisição";

    throw new Error(message);
  }

  return data as T;
}

export default function App() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [conversations, setConversations] = useState<ContactConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [deletingContactId, setDeletingContactId] = useState<number | null>(null);
  const [clearingContactId, setClearingContactId] = useState<number | null>(null);
  const [deletingMessageId, setDeletingMessageId] = useState<number | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);

  const [search, setSearch] = useState("");
  const [directionFilter, setDirectionFilter] = useState<"all" | "in" | "out">("all");
  const [itemsPerPage, setItemsPerPage] = useState(6);
  const [page, setPage] = useState(1);

  const loadDashboard = useCallback(async () => {
    const [summaryResult, conversationsResult] = await Promise.all([
      apiFetch<DashboardSummary>("/dashboard/summary"),
      apiFetch<{ contacts: ContactConversation[] }>("/dashboard/conversations")
    ]);
    setSummary(summaryResult);
    setConversations(conversationsResult.contacts);
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

    if (confirmDialog.action.type === "delete-contact") {
      await deleteContact(confirmDialog.action.contact);
      setConfirmDialog(null);
      return;
    }

    if (confirmDialog.action.type === "clear-contact-messages") {
      await clearContactMessages(confirmDialog.action.contact);
      setConfirmDialog(null);
      return;
    }

    await deleteMessage(confirmDialog.action.messageId);
    setConfirmDialog(null);
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
    if (page > totalPages) {
      setPage(totalPages);
    }
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

            {error ? (
              <p className="rounded-md border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                {error}
              </p>
            ) : null}

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
            <p className="mt-1 text-sm text-slate-400">
              Sessão ativa: {user.username} ({user.role})
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="rounded-lg border border-cyan-700/70 px-4 py-2 text-sm text-cyan-200 transition-all hover:bg-cyan-900/20 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={() => {
                handleRefreshDashboard().catch(() => {
                  /* handled in state */
                });
              }}
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

        {error ? (
          <p className="mt-4 rounded-md border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </p>
        ) : null}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Contatos" value={summary?.metrics.contacts ?? 0} />
          <StatCard label="Mensagens" value={summary?.metrics.messages ?? 0} />
          <StatCard label="Entradas" value={summary?.metrics.inbound ?? 0} />
          <StatCard label="Saídas" value={summary?.metrics.outbound ?? 0} />
          <StatCard label="FAQs Ativas" value={summary?.metrics.activeFaqs ?? 0} />
        </div>

        <section className="mt-6 rounded-xl border border-slate-800 bg-slate-950 p-4">
          <h2 className="text-sm font-medium text-slate-300">Última mensagem registrada</h2>
          {summary?.latest ? (
            <div className="mt-3 space-y-1 text-sm text-slate-200">
              <p>
                <span className="text-slate-400">Contato:</span> {summary.latest.contact}
              </p>
              <p>
                <span className="text-slate-400">Direção:</span> {summary.latest.direction}
              </p>
              <p>
                <span className="text-slate-400">Texto:</span> {summary.latest.body}
              </p>
              <p>
                <span className="text-slate-400">Data:</span>{" "}
                {new Date(summary.latest.createdAt).toLocaleString("pt-BR")}
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-400">Nenhuma mensagem encontrada.</p>
          )}
        </section>

        <section className="mt-6 rounded-xl border border-slate-800 bg-slate-950 p-4">
          <h2 className="text-sm font-medium text-slate-300">Filtros</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filtrar por número, nome ou texto"
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-cyan-400"
            />
            <select
              value={directionFilter}
              onChange={(event) => setDirectionFilter(event.target.value as "all" | "in" | "out")}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-cyan-400"
            >
              <option value="all">Todas direções</option>
              <option value="in">Somente entrada</option>
              <option value="out">Somente saída</option>
            </select>
            <select
              value={itemsPerPage}
              onChange={(event) => setItemsPerPage(Number(event.target.value))}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-cyan-400"
            >
              <option value={3}>3 por página</option>
              <option value={6}>6 por página</option>
              <option value={10}>10 por página</option>
              <option value={20}>20 por página</option>
            </select>
          </div>
        </section>

        <section className="mt-6 rounded-xl border border-slate-800 bg-slate-950 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-slate-300">Número e conversa da pessoa</h2>
            <span className="text-xs text-slate-400">{filteredConversations.length} contato(s)</span>
          </div>

          {paginatedConversations.length > 0 ? (
            <>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {paginatedConversations.map((contact) => (
                  <article
                    key={contact.id}
                    className="animate-in fade-in-0 slide-in-from-bottom-2 rounded-lg border border-slate-800 bg-slate-900 p-4 duration-300"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm text-slate-300">
                          <span className="text-slate-500">Número:</span> {contact.waId}
                        </p>
                        <p className="text-sm text-slate-300">
                          <span className="text-slate-500">Nome:</span> {contact.name || "Sem nome"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="rounded-md border border-amber-600/60 px-2 py-1 text-xs text-amber-300 transition hover:bg-amber-900/20 disabled:opacity-40"
                          type="button"
                          onClick={() =>
                            setConfirmDialog({
                              title: "Limpar mensagens do contato",
                              description: `As mensagens de "${contact.name || contact.waId}" serão removidas, mas o contato será mantido.`,
                              confirmText: "Limpar mensagens",
                              tone: "warning",
                              action: { type: "clear-contact-messages", contact }
                            })
                          }
                          disabled={clearingContactId === contact.id || deletingContactId === contact.id}
                        >
                          {clearingContactId === contact.id ? "Limpando..." : "Limpar mensagens"}
                        </button>
                        <button
                          className="rounded-md border border-rose-600/60 px-2 py-1 text-xs text-rose-300 transition hover:bg-rose-900/20 disabled:opacity-40"
                          type="button"
                          onClick={() =>
                            setConfirmDialog({
                              title: "Apagar contato",
                              description: `O contato "${contact.name || contact.waId}" e todo o histórico serão removidos permanentemente.`,
                              confirmText: "Apagar contato",
                              tone: "danger",
                              action: { type: "delete-contact", contact }
                            })
                          }
                          disabled={deletingContactId === contact.id || clearingContactId === contact.id}
                        >
                          {deletingContactId === contact.id ? "Apagando..." : "Apagar contato"}
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      {contact.messages.length > 0 ? (
                        contact.messages.map((message) => (
                          <div
                            key={message.id}
                            className={`animate-in fade-in-0 slide-in-from-right-2 rounded-md px-3 py-2 text-sm transition-all duration-200 ${
                              message.direction === "in"
                                ? "border border-slate-700 bg-slate-950 text-slate-200"
                                : "border border-cyan-700/40 bg-cyan-900/20 text-cyan-100"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p>
                                  <span className="text-slate-400">{message.direction === "in" ? "Pessoa" : "Bot"}:</span>{" "}
                                  {message.body}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {new Date(message.createdAt).toLocaleString("pt-BR")}
                                </p>
                              </div>
                              <button
                                className="rounded-md border border-rose-600/60 px-2 py-1 text-xs text-rose-300 transition hover:bg-rose-900/20 disabled:opacity-40"
                                type="button"
                                onClick={() =>
                                  setConfirmDialog({
                                    title: "Apagar mensagem",
                                    description: "Esta mensagem será removida permanentemente da conversa.",
                                    confirmText: "Apagar mensagem",
                                    tone: "danger",
                                    action: { type: "delete-message", messageId: message.id }
                                  })
                                }
                                disabled={deletingMessageId === message.id}
                              >
                                {deletingMessageId === message.id ? "Apagando..." : "Apagar"}
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-slate-500">Sem conversa registrada.</p>
                      )}
                    </div>
                  </article>
                ))}
              </div>

              <div className="mt-5 flex items-center justify-between gap-3">
                <p className="text-xs text-slate-400">
                  Página {page} de {totalPages} • mostrando {paginatedConversations.length} de{" "}
                  {filteredConversations.length}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    className="rounded-md border border-slate-700 px-3 py-1 text-sm transition hover:bg-slate-800 disabled:opacity-40"
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    disabled={page === 1}
                    type="button"
                  >
                    Anterior
                  </button>
                  <button
                    className="rounded-md border border-slate-700 px-3 py-1 text-sm transition hover:bg-slate-800 disabled:opacity-40"
                    onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={page === totalPages}
                    type="button"
                  >
                    Próxima
                  </button>
                </div>
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-slate-400">Nenhuma conversa encontrada para esse filtro.</p>
          )}
        </section>
        <ConfirmModal
          open={Boolean(confirmDialog)}
          title={confirmDialog?.title || ""}
          description={confirmDialog?.description || ""}
          confirmText={confirmDialog?.confirmText || "Confirmar"}
          tone={confirmDialog?.tone || "danger"}
          loading={Boolean(deletingContactId || clearingContactId || deletingMessageId)}
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

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="animate-in fade-in-0 slide-in-from-bottom-2 rounded-xl border border-slate-800 bg-slate-950 p-4 duration-300">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-cyan-300">{value}</p>
    </article>
  );
}

function ConfirmModal({
  open,
  title,
  description,
  confirmText,
  tone,
  loading,
  onCancel,
  onConfirm
}: {
  open: boolean;
  title: string;
  description: string;
  confirmText: string;
  tone: "danger" | "warning";
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  const confirmButtonClass =
    tone === "danger"
      ? "bg-rose-600 text-rose-50 hover:bg-rose-500"
      : "bg-amber-500 text-slate-950 hover:bg-amber-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md animate-in zoom-in-95 fade-in-0 rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl duration-200">
        <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">{description}</p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800 disabled:opacity-50"
            onClick={onCancel}
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-2 text-sm font-medium transition disabled:opacity-60 ${confirmButtonClass}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Processando..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
