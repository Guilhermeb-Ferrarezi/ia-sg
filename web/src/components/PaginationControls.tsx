type PaginationControlsProps = {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

export default function PaginationControls({
  page,
  totalPages,
  totalItems,
  pageSize,
  loading = false,
  onPageChange,
  onPageSizeChange
}: PaginationControlsProps) {
  const canGoPrev = !loading && page > 1;
  const canGoNext = !loading && page < totalPages;
  const safeTotalPages = Math.max(1, totalPages);
  const startItem = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalItems);
  const pageSizeOptions = [5, 10, 20, 50];

  return (
    <div className="mt-3 rounded-xl border border-slate-700/70 bg-slate-950/70 p-3">
      <p className="text-sm text-slate-400">Exibindo {startItem} a {endItem} de {totalItems} itens</p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span>Itens por página:</span>
          <select
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 disabled:opacity-60"
            value={pageSize}
            disabled={loading}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 disabled:opacity-50"
            disabled={!canGoPrev}
            onClick={() => onPageChange(page - 1)}
          >
            ← Anterior
          </button>
          <span className="rounded-md bg-rose-600 px-2 py-1 text-xs font-semibold text-white">{page}</span>
          <span className="text-sm text-slate-400">Página:</span>
          <input
            type="number"
            min={1}
            max={safeTotalPages}
            value={page}
            disabled={loading}
            onChange={(e) => {
              const nextPage = Number(e.target.value);
              if (!Number.isInteger(nextPage)) return;
              onPageChange(Math.min(safeTotalPages, Math.max(1, nextPage)));
            }}
            className="w-16 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-200"
          />
          <button
            type="button"
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 disabled:opacity-50"
            disabled={!canGoNext}
            onClick={() => onPageChange(page + 1)}
          >
            Próxima →
          </button>
        </div>
      </div>
    </div>
  );
}
