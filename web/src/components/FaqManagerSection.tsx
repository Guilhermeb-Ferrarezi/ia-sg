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
    <section className={`${active ? "mt-6" : "hidden"} rounded-xl border border-slate-800 bg-slate-950 p-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-slate-300">Gerenciar FAQs</h2>
        <span className="text-xs text-slate-400">{faqs.length} registro(s)</span>
      </div>

      <form className="mt-3 grid gap-2" onSubmit={onCreateFaqSubmit}>
        <input
          value={faqQuestion}
          onChange={(event) => onFaqQuestionChange(event.target.value)}
          placeholder="Pergunta"
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-cyan-400"
          required
        />
        <textarea
          value={faqAnswer}
          onChange={(event) => onFaqAnswerChange(event.target.value)}
          placeholder="Resposta"
          className="min-h-24 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-cyan-400"
          required
        />
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={faqSubmitting}
            className="rounded-md bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:brightness-110 disabled:opacity-60"
          >
            {faqSubmitting ? "Salvando..." : "Adicionar FAQ"}
          </button>
        </div>
      </form>

      <div className="mt-4 space-y-2">
        {faqs.length > 0 ? (
          faqs.map((faq) => (
            <article key={faq.id} className="rounded-lg border border-slate-800 bg-slate-900 p-3">
              {editingFaqId === faq.id ? (
                <div className="space-y-2">
                  <input
                    value={editingFaqQuestion}
                    onChange={(event) => onEditingFaqQuestionChange(event.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-400"
                  />
                  <textarea
                    value={editingFaqAnswer}
                    onChange={(event) => onEditingFaqAnswerChange(event.target.value)}
                    className="min-h-24 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-400"
                  />
                  <label className="flex items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={editingFaqIsActive}
                      onChange={(event) => onEditingFaqIsActiveChange(event.target.checked)}
                    />
                    FAQ ativo
                  </label>
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:bg-slate-800"
                      onClick={onCancelEditFaq}
                      disabled={faqUpdatingId === faq.id}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="rounded-md bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:brightness-110 disabled:opacity-60"
                      onClick={onSaveFaq}
                      disabled={faqUpdatingId === faq.id}
                    >
                      {faqUpdatingId === faq.id ? "Salvando..." : "Salvar"}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm font-medium text-slate-200">{faq.question}</p>
                  <p className="mt-1 text-sm text-slate-400">{faq.answer}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Status: {faq.isActive ? "Ativo" : "Inativo"} • Atualizado em{" "}
                    {new Date(faq.updatedAt).toLocaleString("pt-BR")}
                  </p>
                  <div className="mt-2 flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      className="rounded-md border border-cyan-700/60 px-4 py-2 text-sm text-cyan-200 transition hover:bg-cyan-900/20"
                      onClick={() => onStartEditFaq(faq)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-rose-700/60 px-4 py-2 text-sm text-rose-300 transition hover:bg-rose-900/20"
                      onClick={() =>
                        onOpenConfirm({
                          title: "Excluir FAQ",
                          description: `Deseja excluir o FAQ "${faq.question}"?`,
                          confirmText: "Excluir FAQ",
                          tone: "danger",
                          action: { type: "delete-faq", faqId: faq.id }
                        })
                      }
                      disabled={faqDeletingId === faq.id}
                    >
                      {faqDeletingId === faq.id ? "Excluindo..." : "Excluir"}
                    </button>
                  </div>
                </>
              )}
            </article>
          ))
        ) : (
          <p className="text-sm text-slate-500">Nenhum FAQ cadastrado ainda.</p>
        )}
      </div>
    </section>
  );
}
