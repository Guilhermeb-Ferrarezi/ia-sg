import type { LandingBuilderDocument, LandingBuilderNode, LandingPageSummary, LandingSections, Offer } from "../types/dashboard";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeNode(value: unknown): LandingBuilderNode | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.type !== "string" || !isRecord(value.props)) {
    return null;
  }

  const props = value.props as Record<string, unknown>;

  switch (value.type) {
    case "hero":
      return {
        id: value.id,
        type: "hero",
        props: {
          eyebrow: typeof props.eyebrow === "string" ? props.eyebrow : undefined,
          headline: typeof props.headline === "string" ? props.headline : undefined,
          subheadline: typeof props.subheadline === "string" ? props.subheadline : undefined,
          highlights: Array.isArray(props.highlights) ? props.highlights.filter((item): item is string => typeof item === "string") : undefined,
          ctaLabel: typeof props.ctaLabel === "string" ? props.ctaLabel : undefined,
        },
      };
    case "info-panel":
      return {
        id: value.id,
        type: "info-panel",
        props: {
          title: typeof props.title === "string" ? props.title : undefined,
          helper: typeof props.helper === "string" ? props.helper : undefined,
          items: Array.isArray(props.items)
            ? props.items
              .map((item) => (
                isRecord(item) && typeof item.label === "string" && typeof item.value === "string"
                  ? { label: item.label, value: item.value }
                  : null
              ))
              .filter((item): item is { label: string; value: string } => Boolean(item))
            : undefined,
        },
      };
    case "feature-grid":
      return {
        id: value.id,
        type: "feature-grid",
        props: {
          title: typeof props.title === "string" ? props.title : undefined,
          items: Array.isArray(props.items)
            ? props.items
              .map((item) => (
                isRecord(item) && typeof item.title === "string" && typeof item.description === "string"
                  ? { title: item.title, description: item.description }
                  : null
              ))
              .filter((item): item is { title: string; description: string } => Boolean(item))
            : undefined,
        },
      };
    case "proof-list":
      return {
        id: value.id,
        type: "proof-list",
        props: {
          title: typeof props.title === "string" ? props.title : undefined,
          items: Array.isArray(props.items) ? props.items.filter((item): item is string => typeof item === "string") : undefined,
        },
      };
    case "faq-list":
      return {
        id: value.id,
        type: "faq-list",
        props: {
          title: typeof props.title === "string" ? props.title : undefined,
          items: Array.isArray(props.items)
            ? props.items
              .map((item) => (
                isRecord(item) && typeof item.question === "string" && typeof item.answer === "string"
                  ? { question: item.question, answer: item.answer }
                  : null
              ))
              .filter((item): item is { question: string; answer: string } => Boolean(item))
            : undefined,
        },
      };
    case "cta-band":
      return {
        id: value.id,
        type: "cta-band",
        props: {
          eyebrow: typeof props.eyebrow === "string" ? props.eyebrow : undefined,
          label: typeof props.label === "string" ? props.label : undefined,
          helper: typeof props.helper === "string" ? props.helper : undefined,
        },
      };
    default:
      return null;
  }
}

export function normalizeLandingBuilderDocument(value: unknown): LandingBuilderDocument | null {
  if (!isRecord(value) || value.kind !== "landing-builder-v1" || !isRecord(value.metadata) || !isRecord(value.theme) || !Array.isArray(value.nodes)) {
    return null;
  }

  const nodes = value.nodes.map(normalizeNode).filter((node): node is LandingBuilderNode => Boolean(node));
  if (!nodes.length) return null;

  return {
    version: typeof value.version === "number" ? value.version : 1,
    kind: "landing-builder-v1",
    metadata: {
      title: typeof value.metadata.title === "string" ? value.metadata.title : "Landing",
      slug: typeof value.metadata.slug === "string" ? value.metadata.slug : "landing",
      description: typeof value.metadata.description === "string" ? value.metadata.description : undefined,
    },
    theme: {
      accent: typeof value.theme.accent === "string" ? value.theme.accent : "#22d3ee",
      surface: typeof value.theme.surface === "string" ? value.theme.surface : "#0f172a",
      canvas: typeof value.theme.canvas === "string" ? value.theme.canvas : "#08111f",
    },
    nodes,
  };
}

export function buildBuilderDocumentFromLegacy(params: {
  offer: Pick<Offer, "title" | "slug" | "shortDescription" | "approvedFacts" | "ctaLabel" | "durationLabel" | "modality">;
  sections: LandingSections;
  version?: number;
}): LandingBuilderDocument {
  const { offer, sections, version = 1 } = params;
  return {
    version,
    kind: "landing-builder-v1",
    metadata: {
      title: offer.title,
      slug: offer.slug,
      description: offer.shortDescription || undefined,
    },
    theme: {
      accent: "#22d3ee",
      surface: "#0f172a",
      canvas: "#08111f",
    },
    nodes: [
      {
        id: "hero",
        type: "hero",
        props: {
          eyebrow: sections.hero?.eyebrow || "Transforme sua carreira",
          headline: sections.hero?.headline || offer.title,
          subheadline: sections.hero?.subheadline || offer.shortDescription || "",
          highlights: sections.hero?.highlights?.length ? sections.hero.highlights : offer.approvedFacts,
          ctaLabel: sections.cta?.label || offer.ctaLabel,
        },
      },
      {
        id: "summary",
        type: "info-panel",
        props: {
          title: offer.title,
          items: [
            { label: "Duracao", value: offer.durationLabel || "Consulte disponibilidade" },
            { label: "Modalidade", value: offer.modality || "A combinar" },
            { label: "Versao", value: `Landing v${version}` },
          ],
          helper: sections.cta?.helper || "Fale com a equipe e veja a melhor forma de entrar agora.",
        },
      },
      {
        id: "benefits",
        type: "feature-grid",
        props: {
          title: "Destaques",
          items: sections.benefits || [],
        },
      },
      {
        id: "proof",
        type: "proof-list",
        props: {
          title: sections.proof?.title || "Diferenciais",
          items: sections.proof?.items?.length ? sections.proof.items : offer.approvedFacts,
        },
      },
      {
        id: "faq",
        type: "faq-list",
        props: {
          title: "FAQ rapido",
          items: sections.faq || [],
        },
      },
      {
        id: "cta",
        type: "cta-band",
        props: {
          eyebrow: "Pronto para avancar",
          label: sections.cta?.label || offer.ctaLabel,
          helper: sections.cta?.helper || offer.shortDescription || "",
        },
      },
    ],
  };
}

export function resolveLandingBuilderDocument(params: {
  offer: Pick<Offer, "title" | "slug" | "shortDescription" | "approvedFacts" | "ctaLabel" | "durationLabel" | "modality">;
  landing: Pick<LandingPageSummary, "version" | "sectionsJson" | "builderDocumentJson">;
}): LandingBuilderDocument {
  return normalizeLandingBuilderDocument(params.landing.builderDocumentJson)
    || buildBuilderDocumentFromLegacy({
      offer: params.offer,
      sections: params.landing.sectionsJson,
      version: params.landing.version,
    });
}
