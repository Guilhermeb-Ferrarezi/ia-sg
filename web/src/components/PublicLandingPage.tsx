import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import type { LandingPageSummary, Offer } from "../types/dashboard";

type PublicLandingResponse = {
  offer: Offer;
  landing: LandingPageSummary;
  trackingToken: string | null;
};

function getLandingSlug(): string {
  const parts = window.location.pathname.split("/").filter(Boolean);
  return parts[1] || "";
}

function getTrackingToken(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get("t") || "";
}

export default function PublicLandingPage() {
  const [data, setData] = useState<PublicLandingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const slug = useMemo(() => getLandingSlug(), []);
  const token = useMemo(() => getTrackingToken(), []);

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch(`/api/public/landings/${encodeURIComponent(slug)}?t=${encodeURIComponent(token)}`);
        const json = await response.json();
        if (!response.ok) {
          throw new Error(typeof json?.message === "string" ? json.message : "Falha ao carregar landing.");
        }
        setData(json);
        if (json.trackingToken) {
          void fetch("/api/public/landings/view", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: json.trackingToken })
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao carregar landing.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [slug, token]);

  const handleClick = async () => {
    if (!data) return;
    const trackingToken = data.trackingToken;
    if (!trackingToken) {
      window.location.href = data.offer.ctaUrl;
      return;
    }

    try {
      const response = await fetch("/api/public/landings/click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: trackingToken })
      });
      const json = await response.json();
      if (response.ok && typeof json.redirectUrl === "string") {
        window.location.href = json.redirectUrl;
        return;
      }
    } catch {
      // fallback below
    }
    window.location.href = data.offer.ctaUrl;
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#08111f] text-white">
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-16 w-16 animate-spin items-center justify-center rounded-3xl border border-cyan-400/20 bg-cyan-500/10">
            <Sparkles className="h-7 w-7 text-cyan-200" />
          </div>
          <p className="text-sm uppercase tracking-[0.4em] text-cyan-200/80">Carregando oferta</p>
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#08111f] px-6 text-white">
        <div className="max-w-lg rounded-[32px] border border-rose-500/20 bg-rose-500/10 p-8 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.4em] text-rose-200/80">Landing indisponivel</p>
          <h1 className="mt-3 text-3xl font-black">Nao foi possivel abrir esta pagina</h1>
          <p className="mt-4 text-sm text-rose-100/80">{error || "Tente novamente em instantes."}</p>
        </div>
      </main>
    );
  }

  const hero = data.landing.sectionsJson.hero;
  const benefits = data.landing.sectionsJson.benefits || [];
  const proof = data.landing.sectionsJson.proof;
  const faq = data.landing.sectionsJson.faq || [];
  const cta = data.landing.sectionsJson.cta;

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#08111f] text-white">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.25),_transparent_28%),radial-gradient(circle_at_80%_20%,_rgba(251,191,36,0.18),_transparent_24%),linear-gradient(160deg,_#020617,_#0f172a_45%,_#082f49)]" />
        <div className="absolute -left-20 top-10 h-72 w-72 animate-pulse rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute right-0 top-24 h-80 w-80 animate-pulse rounded-full bg-amber-300/10 blur-3xl" />
        <div className="relative mx-auto grid min-h-[90svh] max-w-7xl gap-12 px-6 py-12 lg:grid-cols-[minmax(0,1.1fr)_420px] lg:items-center lg:px-10">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-500/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.35em] text-cyan-100">
              <Sparkles className="h-4 w-4" />
              {hero?.eyebrow || data.offer.title}
            </div>
            <div className="space-y-5">
              <h1 className="max-w-4xl text-5xl font-black tracking-tight text-white md:text-7xl">
                {hero?.headline || data.offer.title}
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-slate-200 md:text-xl">
                {hero?.subheadline || data.offer.shortDescription}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {(hero?.highlights || data.offer.approvedFacts).slice(0, 4).map((item) => (
                <span key={item} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 backdrop-blur">
                  {item}
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={handleClick}
              className="inline-flex items-center gap-3 rounded-full bg-white px-7 py-4 text-sm font-black uppercase tracking-[0.3em] text-slate-950 transition-transform duration-300 hover:-translate-y-1"
            >
              {cta?.label || data.offer.ctaLabel}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          <div className="rounded-[36px] border border-white/10 bg-white/6 p-6 shadow-[0_30px_120px_rgba(8,15,28,0.55)] backdrop-blur-md">
            <div className="space-y-4 rounded-[28px] bg-slate-950/70 p-6">
              <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-cyan-200/80">Resumo rapido</p>
              <h2 className="text-3xl font-black">{data.offer.title}</h2>
              <div className="grid gap-3 text-sm text-slate-200">
                <InfoRow label="Duracao" value={data.offer.durationLabel || "Consulte disponibilidade"} />
                <InfoRow label="Modalidade" value={data.offer.modality || "A combinar"} />
                <InfoRow label="Versao" value={`Landing v${data.landing.version}`} />
              </div>
              <div className="rounded-[24px] border border-emerald-400/15 bg-emerald-500/10 p-5">
                <p className="text-sm font-semibold text-emerald-50">{cta?.helper || "Fale com a equipe e veja a melhor forma de entrar agora."}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-20 lg:px-10">
        <div className="grid gap-5 md:grid-cols-3">
          {benefits.map((benefit, index) => (
            <article
              key={`${benefit.title}-${index}`}
              className="translate-y-0 rounded-[28px] border border-slate-800 bg-slate-900/70 p-6 transition-all duration-300 hover:-translate-y-2 hover:border-cyan-400/20"
            >
              <p className="text-lg font-black">{benefit.title}</p>
              <p className="mt-3 text-sm leading-7 text-slate-300">{benefit.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-20 lg:px-10">
        <div className="grid gap-6 lg:grid-cols-[0.9fr_minmax(0,1.1fr)]">
          <div className="rounded-[32px] border border-slate-800 bg-slate-900/70 p-8">
            <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-emerald-200/80">{proof?.title || "Diferenciais"}</p>
            <div className="mt-6 space-y-4">
              {(proof?.items || data.offer.approvedFacts).map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-2xl border border-emerald-400/10 bg-emerald-500/10 px-4 py-4">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-300" />
                  <p className="text-sm leading-7 text-emerald-50">{item}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[32px] border border-slate-800 bg-slate-900/70 p-8">
            <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-cyan-200/80">FAQ rapido</p>
            <div className="mt-6 space-y-4">
              {faq.map((item) => (
                <div key={item.question} className="rounded-2xl border border-slate-800 bg-slate-950/80 p-5">
                  <p className="text-lg font-bold text-white">{item.question}</p>
                  <p className="mt-2 text-sm leading-7 text-slate-300">{item.answer}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-white/5 bg-black/20">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-16 lg:flex-row lg:items-center lg:justify-between lg:px-10">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-cyan-200/80">Pronto para avancar</p>
            <h2 className="mt-3 text-4xl font-black">{cta?.label || data.offer.ctaLabel}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">{cta?.helper || data.offer.shortDescription}</p>
          </div>
          <button
            type="button"
            onClick={handleClick}
            className="inline-flex items-center justify-center gap-3 rounded-full bg-cyan-400 px-8 py-4 text-sm font-black uppercase tracking-[0.32em] text-slate-950 transition-transform duration-300 hover:-translate-y-1"
          >
            {cta?.label || data.offer.ctaLabel}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>
    </main>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/8 bg-white/5 px-4 py-3">
      <span className="text-xs font-bold uppercase tracking-[0.28em] text-slate-400">{label}</span>
      <span className="text-right text-sm font-semibold text-white">{value}</span>
    </div>
  );
}
