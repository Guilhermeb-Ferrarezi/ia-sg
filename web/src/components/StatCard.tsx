type StatCardProps = {
  label: string;
  value: number;
};

export default function StatCard({ label, value }: StatCardProps) {
  return (
    <article className="animate-in fade-in-0 slide-in-from-bottom-2 rounded-xl border border-slate-800 bg-slate-950 p-4 duration-300">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-cyan-300">{value}</p>
    </article>
  );
}
