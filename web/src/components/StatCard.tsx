
type StatCardProps = {
  label: string;
  value: string | number;
  highlight?: boolean;
};

export default function StatCard({ label, value, highlight }: StatCardProps) {
  return (
    <article className={`relative overflow-hidden flex flex-col justify-between rounded-3xl border p-6 transition-all duration-500 hover:scale-[1.02] active:scale-95 ${highlight
        ? "border-cyan-500/30 bg-linear-to-br from-cyan-500/10 via-blue-500/5 to-transparent shadow-lg shadow-cyan-500/5 ring-1 ring-cyan-500/20"
        : "border-slate-800 bg-slate-900/40 hover:border-slate-700/80 hover:bg-slate-900/60"
      }`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{label}</p>
        <div className={`p-1.5 rounded-lg ${highlight ? "bg-cyan-500 text-slate-950" : "bg-slate-800 text-slate-400"}`}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {highlight ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            )}
          </svg>
        </div>
      </div>
      <div className="mt-4 flex items-baseline gap-1">
        <span className={`text-3xl font-black tracking-tighter ${highlight ? "text-white" : "text-slate-100"}`}>
          {value}
        </span>
      </div>
      {highlight && (
        <div className="absolute -bottom-6 -right-6 h-16 w-16 rounded-full bg-cyan-500/10 blur-2xl"></div>
      )}
    </article>
  );
}
