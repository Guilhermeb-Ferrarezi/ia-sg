import type { LandingCodeBundle, LandingCodeFile, LandingPageSummary } from "../types/dashboard";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeLandingCodeFile(value: unknown): LandingCodeFile | null {
  if (!isRecord(value) || typeof value.path !== "string" || typeof value.code !== "string") {
    return null;
  }

  const path = value.path.trim();
  const code = value.code.trim();
  if (!path || !code) return null;

  return {
    path,
    code,
    summary: typeof value.summary === "string" ? value.summary : undefined,
  };
}

export function normalizeLandingCodeBundle(value: unknown): LandingCodeBundle | null {
  if (
    !isRecord(value) ||
    value.kind !== "landing-code-bundle-v1" ||
    value.framework !== "vite-react" ||
    typeof value.entryFile !== "string" ||
    !Array.isArray(value.files) ||
    !isRecord(value.metadata) ||
    !isRecord(value.themeTokens)
  ) {
    return null;
  }

  const files = value.files.map(normalizeLandingCodeFile).filter((file): file is LandingCodeFile => Boolean(file));
  if (!files.length || !files.some((file) => file.path === value.entryFile)) return null;

  return {
    version: typeof value.version === "number" ? value.version : 1,
    kind: "landing-code-bundle-v1",
    framework: "vite-react",
    source: value.source === "fallback" ? "fallback" : "ai",
    entryFile: value.entryFile,
    files,
    metadata: {
      title: typeof value.metadata.title === "string" ? value.metadata.title : "Landing",
      slug: typeof value.metadata.slug === "string" ? value.metadata.slug : "landing",
      description: typeof value.metadata.description === "string" ? value.metadata.description : undefined,
      summary: typeof value.metadata.summary === "string" ? value.metadata.summary : "Bundle React gerado para esta landing.",
      generatedAt: typeof value.metadata.generatedAt === "string" ? value.metadata.generatedAt : new Date(0).toISOString(),
      visualTheme: typeof value.metadata.visualTheme === "string" ? value.metadata.visualTheme : undefined,
    },
    themeTokens: {
      accent: typeof value.themeTokens.accent === "string" ? value.themeTokens.accent : "#22d3ee",
      surface: typeof value.themeTokens.surface === "string" ? value.themeTokens.surface : "#0f172a",
      canvas: typeof value.themeTokens.canvas === "string" ? value.themeTokens.canvas : "#08111f",
      text: typeof value.themeTokens.text === "string" ? value.themeTokens.text : "#f8fafc",
      muted: typeof value.themeTokens.muted === "string" ? value.themeTokens.muted : "#94a3b8",
    },
    usedComponents: Array.isArray(value.usedComponents)
      ? value.usedComponents.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      : [],
    usedImports: Array.isArray(value.usedImports)
      ? value.usedImports.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      : [],
  };
}

export function resolveLandingCodeBundle(
  landing: Pick<LandingPageSummary, "landingCodeBundleJson">
): LandingCodeBundle | null {
  return normalizeLandingCodeBundle(landing.landingCodeBundleJson);
}

