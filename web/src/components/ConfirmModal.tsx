type ConfirmModalProps = {
  open: boolean;
  title: string;
  description: string;
  confirmText: string;
  tone: "danger" | "warning";
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function ConfirmModal({
  open,
  title,
  description,
  confirmText,
  tone,
  loading,
  onCancel,
  onConfirm
}: ConfirmModalProps) {
  if (!open) return null;

  const confirmButtonClass =
    tone === "danger"
      ? "bg-rose-600 text-rose-50 hover:bg-rose-500 shadow-lg shadow-rose-500/20"
      : "bg-amber-500 text-slate-950 hover:bg-amber-400 shadow-lg shadow-amber-500/20";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md scale-enter rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-3">
          <div className={`p-2 rounded-xl ${tone === "danger" ? "bg-rose-500/10 text-rose-500" : "bg-amber-500/10 text-amber-500"}`}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-slate-100">{title}</h3>
        </div>
        <p className="text-sm leading-relaxed text-slate-400 ml-[52px]">{description}</p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            className="rounded-xl border border-slate-700 px-5 py-2.5 text-sm font-medium text-slate-300 transition-all hover:bg-slate-800 hover:text-white disabled:opacity-50"
            onClick={onCancel}
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-all disabled:opacity-60 ${confirmButtonClass}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading && (
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            {loading ? "Processando..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
