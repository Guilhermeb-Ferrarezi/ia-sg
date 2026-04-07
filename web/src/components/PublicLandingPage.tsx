import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import type { LandingPageSummary, Offer } from "../types/dashboard";
import LandingPreviewCanvas from "./LandingPreviewCanvas";

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

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#08111f] p-0 text-white">
      <LandingPreviewCanvas offer={data.offer} landing={data.landing} previewLabel={data.offer.title} onCtaClick={handleClick} />
    </main>
  );
}
