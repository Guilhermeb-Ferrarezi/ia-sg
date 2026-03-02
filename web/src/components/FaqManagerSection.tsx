import type { FormEvent } from "react";
import type { FaqItem, ConfirmDialogState } from "../types/dashboard";

type FaqManagerSectionProps = {
  active: boolean;
  faqs: FaqItem[];
  faqQuestion: string;
  faqAnswer: string;
  faqSubmitting: boolean;
  editingFaqId: number | null;
  editingFaqQuestion: string;
  editingFaqAnswer: string;
  editingFaqIsActive: boolean;
  faqUpdatingId: number | null;
  faqDeletingId: number | null;
  onFaqQuestionChange: (value: string) => void;
  onFaqAnswerChange: (value: string) => void;
  onCreateFaqSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onStartEditFaq: (faq: FaqItem) => void;
  onCancelEditFaq: () => void;
  onEditingFaqQuestionChange: (value: string) => void;
  onEditingFaqAnswerChange: (value: string) => void;
  onEditingFaqIsActiveChange: (value: boolean) => void;
  onSaveFaq: () => void;
  onOpenConfirm: (dialog: ConfirmDialogState) => void;
};

export default function FaqManagerSection({
  active,
  faqs,
  faqQuestion,
  faqAnswer,
  faqSubmitting,
  editingFaqId,
  editingFaqQuestion,
  editingFaqAnswer,
  editingFaqIsActive,
  faqUpdatingId,
  faqDeletingId,
  onFaqQuestionChange,
  onFaqAnswerChange,
  onCreateFaqSubmit,
  onStartEditFaq,
  onCancelEditFaq,
  onEditingFaqQuestionChange,
  onEditingFaqAnswerChange,
  onEditingFaqIsActiveChange,
  onSaveFaq,
  onOpenConfirm
}: FaqManagerSectionProps) {
  return (
    <section className={`${active ? "block animate-in fade-in slide-in-from-bottom-4 duration-500" : "hidden"} space-y-8`}>
      <div className="rounded-3xl border border-slate-800 bg-[#0f172a]/80 p-8 shadow-2xl backdrop-blur-sm">
        <div className="flex items-center justify-between border-b border-slate-800 pb-6 mb-8">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-cyan-600 shadow-lg shadow-cyan-600/20 text-slate-100">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white tracking-tight">Base de Conhecimento</h2>
              <p className="text-sm text-slate-500 mt-1">Configure as respostas automáticas para o bot AI</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/50 px-4 py-2">
            <span className="h-2 w-2 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.5)]"></span>
            <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">{faqs.length} FAQs</span>
          </div>
        </div>

        <form className="grid gap-6 bg-slate-900/40 p-6 rounded-2xl border border-slate-800 shadow-inner" onSubmit={onCreateFaqSubmit}>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Pergunta do Usuário</label>
              <input
                value={faqQuestion}
                onChange={(event) => onFaqQuestionChange(event.target.value)}
                placeholder="Ex: Qual o horário de atendimento?"
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-5 py-4 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Resposta da AI</label>
              <textarea
                value={faqAnswer}
                onChange={(event) => onFaqAnswerChange(event.target.value)}
                placeholder="Ex: Atendemos de segunda a sexta, das 08h às 18h."
                className="w-full min-h-[56px] rounded-xl border border-slate-800 bg-slate-950 px-5 py-4 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all resize-none"
                required
              />
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={faqSubmitting}
              className="flex items-center gap-3 rounded-xl bg-cyan-500 px-8 py-4 text-xs font-black text-slate-950 shadow-lg shadow-cyan-500/20 hover:bg-cyan-400 hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-60 disabled:pointer-events-none uppercase tracking-widest"
            >
              {faqSubmitting ? (
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              )}
              {faqSubmitting ? "Enviando..." : "Cadastrar FAQ"}
            </button>
          </div>
        </form>

        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {faqs.length > 0 ? (
            faqs.map((faq) => (
              <article key={faq.id} className={`group relative flex flex-col rounded-3xl border transition-all duration-300 p-6 ${editingFaqId === faq.id
                ? "border-cyan-500 bg-cyan-500/5 ring-1 ring-cyan-500/20"
                : "border-slate-800 bg-slate-900/30 hover:border-slate-700 hover:bg-slate-900/50"
                }`}>
                {editingFaqId === faq.id ? (
                  <div className="space-y-4 h-full">
                    <div className="space-y-2 flex-1">
                      <input
                        value={editingFaqQuestion}
                        onChange={(event) => onEditingFaqQuestionChange(event.target.value)}
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-500"
                      />
                      <textarea
                        value={editingFaqAnswer}
                        onChange={(event) => onEditingFaqAnswerChange(event.target.value)}
                        className="w-full min-h-[120px] rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-500 resize-none"
                      />
                    </div>
                    <div className="flex items-center justify-between pt-2">
                      <label className="flex items-center gap-2 cursor-pointer group/toggle">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={editingFaqIsActive}
                          onChange={(event) => onEditingFaqIsActiveChange(event.target.checked)}
                        />
                        <div className="w-8 h-4 bg-slate-800 rounded-full peer peer-checked:bg-cyan-500 relative transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-4"></div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest group-hover/toggle:text-slate-300 transition-colors">Ativo</span>
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="rounded-lg border border-slate-700 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
                          onClick={onCancelEditFaq}
                          disabled={faqUpdatingId === faq.id}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          className="rounded-lg bg-cyan-500 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-950 transition hover:brightness-110 disabled:opacity-60"
                          onClick={onSaveFaq}
                          disabled={faqUpdatingId === faq.id}
                        >
                          {faqUpdatingId === faq.id ? "Salvando..." : "Salvar"}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <p className="text-sm font-bold text-white line-clamp-2 leading-tight">{faq.question}</p>
                        <div className={`p-1.5 rounded-lg shrink-0 ${faq.isActive ? "bg-emerald-500/10 text-emerald-500" : "bg-slate-800 text-slate-500"}`}>
                          <div className="w-1.5 h-1.5 rounded-full bg-current shadow-[0_0_8px_currentColor]"></div>
                        </div>
                      </div>
                      <p className="text-xs text-slate-400 line-clamp-4 leading-relaxed">{faq.answer}</p>
                    </div>
                    <div className="mt-6 pt-6 border-t border-slate-800/60 flex items-center justify-between">
                      <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest italic">
                        {new Date(faq.updatedAt).toLocaleDateString("pt-BR")}
                      </span>
                      <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0">
                        <button
                          type="button"
                          className="p-2 rounded-lg bg-slate-800/50 text-slate-400 hover:bg-cyan-500/10 hover:text-cyan-400 transition-all"
                          onClick={() => onStartEditFaq(faq)}
                          title="Editar FAQ"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                        <button
                          type="button"
                          className="p-2 rounded-lg bg-slate-800/50 text-slate-400 hover:bg-rose-500/10 hover:text-rose-500 transition-all"
                          onClick={() =>
                            onOpenConfirm({
                              title: "Remover da base?",
                              description: `Esta ação removerá a resposta automática para: "${faq.question}"`,
                              confirmText: "Sim, excluir",
                              tone: "danger",
                              action: { type: "delete-faq", faqId: faq.id }
                            })
                          }
                          disabled={faqDeletingId === faq.id}
                          title="Excluir FAQ"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </article>
            ))
          ) : (
            <div className="col-span-full py-12 flex flex-col items-center justify-center border-2 border-dashed border-slate-800 rounded-3xl bg-slate-900/20">
              <svg className="w-12 h-12 text-slate-700 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.782 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
              <p className="text-sm font-bold uppercase tracking-widest text-slate-600">Nenhum FAQ cadastrado ainda</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
