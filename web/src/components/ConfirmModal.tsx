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
