import type { ConfirmDialogState, ContactConversation, DashboardSummary } from "../types/dashboard";

type DashboardConversationsSectionProps = {
  active: boolean;
  summary: DashboardSummary | null;
  search: string;
  directionFilter: "all" | "in" | "out";
  itemsPerPage: number;
  filteredConversationsLength: number;
  paginatedConversations: ContactConversation[];
  page: number;
  totalPages: number;
  deletingContactId: number | null;
  clearingContactId: number | null;
  deletingMessageId: number | null;
  onSearchChange: (value: string) => void;
  onDirectionFilterChange: (value: "all" | "in" | "out") => void;
  onItemsPerPageChange: (value: number) => void;
  onOpenConfirm: (dialog: ConfirmDialogState) => void;
  onPageChange: (page: number) => void;
};

export default function DashboardConversationsSection({
  active,
  summary,
  search,
  directionFilter,
  itemsPerPage,
  filteredConversationsLength,
  paginatedConversations,
  page,
  totalPages,
  deletingContactId,
  clearingContactId,
  deletingMessageId,
  onSearchChange,
  onDirectionFilterChange,
  onItemsPerPageChange,
  onOpenConfirm,
  onPageChange
}: DashboardConversationsSectionProps) {
  const sectionClass = `${active ? "mt-6" : "hidden"} rounded-xl border border-slate-800 bg-slate-950 p-4`;

  return (
    <>
      <section className={sectionClass}>
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

      <section className={sectionClass}>
        <h2 className="text-sm font-medium text-slate-300">Filtros</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Filtrar por número, nome ou texto"
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-cyan-400"
          />
          <select
            value={directionFilter}
            onChange={(event) => onDirectionFilterChange(event.target.value as "all" | "in" | "out")}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-cyan-400"
          >
            <option value="all">Todas direções</option>
            <option value="in">Somente entrada</option>
            <option value="out">Somente saída</option>
          </select>
          <select
            value={itemsPerPage}
            onChange={(event) => onItemsPerPageChange(Number(event.target.value))}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-cyan-400"
          >
            <option value={3}>3 por página</option>
            <option value={6}>6 por página</option>
            <option value={10}>10 por página</option>
            <option value={20}>20 por página</option>
          </select>
        </div>
      </section>

      <section className={sectionClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-slate-300">Número e conversa da pessoa</h2>
          <span className="text-xs text-slate-400">{filteredConversationsLength} contato(s)</span>
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
                          onOpenConfirm({
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
                          onOpenConfirm({
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
                                onOpenConfirm({
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
                Página {page} de {totalPages} • mostrando {paginatedConversations.length} de {filteredConversationsLength}
              </p>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-md border border-slate-700 px-3 py-1 text-sm transition hover:bg-slate-800 disabled:opacity-40"
                  onClick={() => onPageChange(Math.max(1, page - 1))}
                  disabled={page === 1}
                  type="button"
                >
                  Anterior
                </button>
                <button
                  className="rounded-md border border-slate-700 px-3 py-1 text-sm transition hover:bg-slate-800 disabled:opacity-40"
                  onClick={() => onPageChange(Math.min(totalPages, page + 1))}
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
    </>
  );
}
