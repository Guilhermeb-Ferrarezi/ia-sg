import crypto from "crypto";
import http from "http";
import express from "express";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { WebSocketServer, WebSocket } from "ws";
import {
  buildLandingCodeGenerationPrompt,
  buildLandingCreationPromptInput,
  buildLandingGenerationPromptInput,
  LANDING_CODE_GENERATION_SYSTEM_PROMPT,
  buildLeadEnrichmentPromptInput,
  buildReplyPromptInput,
  extractFirstJsonObject,
  parseResponseOutputText
} from "./ai/prompts";
import { registerAuthRoutes } from "./routes/auth";
import { registerSettingsRoutes } from "./routes/settings";
import { registerSystemRoutes } from "./routes/system";

dotenv.config();

type RequestMeta = {
  requestId: string;
  rawBody?: Buffer;
};

type AIModelRoutingMode = "automatic" | "manual";

type AIModelTaskType =
  | "chat_reply"
  | "lead_enrichment"
  | "lead_classification"
  | "landing_planner"
  | "landing_generation"
  | "landing_code_bundle"
  | "landing_refine"
  | "landing_visual";

type AIModelTaskOverrides = {
  chatReplyModel: string;
  leadEnrichmentModel: string;
  leadClassificationModel: string;
  landingPlannerModel: string;
  landingGenerationModel: string;
  landingCodeBundleModel: string;
  landingRefineModel: string;
  landingVisualFallbackModel: string;
};

type AIConfigValues = {
  model: string;
  strongModel: string;
  cheapModel: string;
  routingMode: AIModelRoutingMode;
  taskOverrides: AIModelTaskOverrides;
  landingPlannerModel: string;
  landingVisualModel: string;
  baseUrl: string;
  transcriptionModel: string;
  persona: string;
  historyLimit: number;
  aiReplyDebounceMs: number;
  humanDelayMinMs: number;
  humanDelayMaxMs: number;
};

type AIModelResolution = {
  taskType: AIModelTaskType;
  selectedModel: string;
  fallbackModel: string | null;
  routingReason: string;
};

type LandingPromptValues = {
  systemPrompt: string;
  toneGuidelines: string;
  requiredRules: string[];
  ctaRules: string[];
  autoGenerateEnabled: boolean;
  autoSendEnabled: boolean;
  confidenceThreshold: number;
};

type LandingCreationDraftValues = {
  title: string;
  slug: string;
  aliases: string[];
  durationLabel: string;
  modality: string;
  shortDescription: string;
  approvedFacts: string[];
  ctaLabel: string;
  ctaUrl: string;
  visualTheme: string;
  colorPalette: string;
  typographyStyle: string;
  layoutStyle: string;
  isActive: boolean;
  planner?: LandingPlannerState;
};

type LandingPlannerPromptDepth = "shallow" | "medium" | "deep";

type LandingPlannerAsk = {
  id: string;
  label: string;
  question: string;
  placeholder: string;
  options: string[];
  helperText?: string;
};

type LandingPlannerState = {
  planSummary: string;
  promptDepth: LandingPlannerPromptDepth;
  shouldAsk: boolean;
  askQueue: LandingPlannerAsk[];
  readyForVisualGeneration: boolean;
  activeMessageId: string | null;
  activeQuestionId: string | null;
  stageSummary: string;
};

type LandingCreationHistoryMessage = {
  id: string;
  role: "user" | "assistant";
  kind?: "chat" | "planner";
  plannerMessageId?: string;
  isMutable?: boolean;
  content: string;
  thinking?: string;
  createdAt: string;
};

type LandingCreationSessionRecord = {
  id: number;
  title: string | null;
  status: string;
  offerDraftJson: unknown;
  promptDraftJson: unknown;
  chatHistoryJson: unknown;
  builderDraftJson?: unknown;
  codeBundleDraftJson?: unknown;
  previewSectionsJson: unknown;
  publishedOfferId: number | null;
  createdAt: Date;
  updatedAt: Date;
};

type LandingBuilderNode =
  | {
    id: string;
    type: "hero";
    props: {
      eyebrow?: string;
      headline?: string;
      subheadline?: string;
      highlights?: string[];
      ctaLabel?: string;
    };
  }
  | {
    id: string;
    type: "info-panel";
    props: {
      title?: string;
      items?: Array<{ label: string; value: string }>;
      helper?: string;
    };
  }
  | {
    id: string;
    type: "feature-grid";
    props: {
      title?: string;
      items?: Array<{ title: string; description: string }>;
    };
  }
  | {
    id: string;
    type: "proof-list";
    props: {
      title?: string;
      items?: string[];
    };
  }
  | {
    id: string;
    type: "faq-list";
    props: {
      title?: string;
      items?: Array<{ question: string; answer: string }>;
    };
  }
  | {
    id: string;
    type: "cta-band";
    props: {
      eyebrow?: string;
      label?: string;
      helper?: string;
    };
  };

type LandingBuilderDocument = {
  version: number;
  kind: "landing-builder-v1";
  metadata: {
    title: string;
    slug: string;
    description?: string;
  };
  theme: {
    accent: string;
    surface: string;
    canvas: string;
  };
  nodes: LandingBuilderNode[];
};

type LandingCodeFile = {
  path: string;
  code: string;
  summary?: string;
};

type LandingCodeBundle = {
  version: number;
  kind: "landing-code-bundle-v1";
  framework: "vite-react";
  source: "ai" | "fallback";
  entryFile: string;
  files: LandingCodeFile[];
  metadata: {
    title: string;
    slug: string;
    description?: string;
    summary: string;
    generatedAt: string;
    visualTheme?: string;
  };
  themeTokens: {
    accent: string;
    surface: string;
    canvas: string;
    text: string;
    muted: string;
  };
  usedComponents: string[];
  usedImports: string[];
};

const LANDING_CODE_ALLOWED_IMPORTS = new Set([
  "react",
  "@/components/ui/button",
  "@/components/ui/badge",
  "@/components/ui/card",
  "@/components/ui/dialog",
  "@/components/ui/dropdown-menu",
  "@/components/ui/sheet",
  "@/components/ui/tooltip",
  "lucide-react"
]);

const PORT = Number(process.env.PORT || "3000");
const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || "";
const META_APP_SECRET = process.env.META_APP_SECRET || "";
const HISTORY_LIMIT = Number(process.env.HISTORY_LIMIT || "20");
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || "";
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
const OPENAI_TRANSCRIPTION_MODEL = process.env.OPENAI_TRANSCRIPTION_MODEL || "whisper-1";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const BOT_PERSONA = process.env.BOT_PERSONA || "";
const AI_REPLY_DEBOUNCE_MS = Math.max(0, Number(process.env.AI_REPLY_DEBOUNCE_MS || ""));
const HUMAN_DELAY_MIN_MS = Number(process.env.HUMAN_DELAY_MIN_MS || null);
const HUMAN_DELAY_MAX_MS = Number(process.env.HUMAN_DELAY_MAX_MS || null);
const AI_CONFIG_KEY = "default";
const LANDING_PROMPT_GLOBAL_SCOPE = "global";
const LANDING_PROMPT_OFFER_SCOPE = "offer";
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.JWT_SECREwT || "";
const LANDING_DELIVERY_SECRET = process.env.LANDING_DELIVERY_SECRET || SESSION_SECRET;
const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || "";
const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 7);
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || "";
const COOKIE_SAMESITE = (process.env.COOKIE_SAMESITE || "").toLowerCase();
const COOKIE_SECURE = (process.env.COOKIE_SECURE || "").toLowerCase();
const DASHBOARD_USER = process.env.DASHBOARD_USER || "";
const DASHBOARD_PASS = process.env.DASHBOARD_PASS || "";
const WEBHOOK_WORKER_INTERVAL_MS = Number(process.env.WEBHOOK_WORKER_INTERVAL_MS || "2000");
const WEBHOOK_MAX_RETRIES = Number(process.env.WEBHOOK_MAX_RETRIES || "5");
const AI_CONFIG_CACHE_TTL_MS = Number(process.env.AI_CONFIG_CACHE_TTL_MS || "30000");
const FAQ_CACHE_TTL_MS = Number(process.env.FAQ_CACHE_TTL_MS || "30000");
const DEFAULT_STAGE_CACHE_TTL_MS = Number(process.env.DEFAULT_STAGE_CACHE_TTL_MS || "300000");
const LOG_DELETE_REAUTH_WINDOW_MS = 150000;
const LOG_SKIP_GET_PATH_PREFIXES = (process.env.LOG_SKIP_GET_PATH_PREFIXES || "/api/health,/api/system/readiness,/api/system/health-details,/api/logs,/api/crm/leads,/api/dashboard/summary")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || "";
const CLOUDFLARE_ACCESS_KEY_ID = process.env.CLOUDFLARE_ACCESS_KEY_ID || "";
const CLOUDFLARE_SECRET_ACCESS_KEY = process.env.CLOUDFLARE_SECRET_ACCESS_KEY || "";
const CLOUDFLARE_BUCKET_NAME = process.env.CLOUDFLARE_BUCKET_NAME || "";
const CLOUDFLARE_PUBLIC_URL = (process.env.CLOUDFLARE_PUBLIC_URL || "").replace(/\/+$/, "");

const requiredEnv = [
  "DATABASE_URL",
  "PORT",
  "WEBHOOK_VERIFY_TOKEN",
  "META_APP_SECRET",
  "WHATSAPP_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "DASHBOARD_USER",
  "DASHBOARD_PASS",
  "SESSION_SECRET",
  "AUTH_COOKIE_NAME"
];

const missingEnv = requiredEnv.filter((key) => !process.env[key] || !String(process.env[key]).trim());
if (missingEnv.length > 0) {
  throw new Error(`Missing required env vars: ${missingEnv.join(", ")}`);
}

if (!Number.isFinite(PORT) || PORT <= 0) {
  throw new Error("Invalid PORT env var.");
}

if (!Number.isFinite(HISTORY_LIMIT) || HISTORY_LIMIT <= 0) {
  throw new Error("Invalid HISTORY_LIMIT env var.");
}

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:8080,http://localhost:8081")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const prisma = new PrismaClient();
const app = express();
const httpServer = http.createServer(app);

// ============================================
// WEBSOCKET SERVER
// ============================================

const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

const wsClients = new Set<WebSocket>();
let wsLastBroadcastMessageId = 0;
let wsSyncInProgress = false;
const logDeleteAuthByUser = new Map<string, number>();
const autoReplyTimers = new Map<number, ReturnType<typeof setTimeout>>();
const autoReplyProcessingContacts = new Set<number>();
const autoReplyContextByContact = new Map<number, { waId: string; waMessageId?: string }>();

wss.on("connection", (ws, req) => {
  // Authenticate WebSocket connection using session cookie
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[AUTH_COOKIE_NAME];
  console.log(`[WS] Connection attempt. Token: ${token ? "exists" : "missing"}`);

  if (!token || !verifySession(token)) {
    console.log("[WS] Connection rejected: Unauthorized");
    ws.close(4001, "Unauthorized");
    return;
  }

  console.log("[WS] Connection accepted");
  wsClients.add(ws);
  void sendSystemHealthSnapshotToClient(ws);
  void broadcastSystemHealthSnapshot();
  ws.on("close", () => {
    console.log("[WS] Client disconnected");
    wsClients.delete(ws);
    void broadcastSystemHealthSnapshot();
  });
  ws.on("error", (err) => {
    console.error("[WS] Client error:", err);
    wsClients.delete(ws);
    void broadcastSystemHealthSnapshot();
  });
});

function broadcastMessage(
  waId: string,
  contactId: number,
  message: { id: number; direction: string; body: string; createdAt: Date }
) {
  if (Number.isInteger(message.id) && message.id > wsLastBroadcastMessageId) {
    wsLastBroadcastMessageId = message.id;
  }
  const payload = JSON.stringify({ type: "new_message", waId, contactId, message });
  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }

  broadcastEvent("analytics_updated");
  broadcastEvent("dashboard_updated");
}

function broadcastEvent(type: string, data?: Record<string, unknown>) {
  const payload = JSON.stringify({ type, ...data });
  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

async function buildSystemHealthSnapshot(): Promise<{
  readiness: { ok: boolean; db: "up" | "down"; error?: string };
  details: {
    ok: boolean;
    uptimeSec: number;
    db: "up" | "down";
    wsClients: number;
    worker: { intervalMs: number; maxRetries: number };
    error?: string;
  };
}> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      readiness: { ok: true, db: "up" },
      details: {
        ok: true,
        uptimeSec: Math.floor(process.uptime()),
        db: "up",
        wsClients: wsClients.size,
        worker: {
          intervalMs: WEBHOOK_WORKER_INTERVAL_MS,
          maxRetries: WEBHOOK_MAX_RETRIES
        }
      }
    };
  } catch (err) {
    const error = formatError(err);
    return {
      readiness: { ok: false, db: "down", error },
      details: {
        ok: false,
        uptimeSec: Math.floor(process.uptime()),
        db: "down",
        wsClients: wsClients.size,
        worker: {
          intervalMs: WEBHOOK_WORKER_INTERVAL_MS,
          maxRetries: WEBHOOK_MAX_RETRIES
        },
        error
      }
    };
  }
}

async function sendSystemHealthSnapshotToClient(ws: WebSocket): Promise<void> {
  if (ws.readyState !== WebSocket.OPEN) return;
  const snapshot = await buildSystemHealthSnapshot();
  ws.send(JSON.stringify({ type: "system_health_updated", ...snapshot }));
}

async function broadcastSystemHealthSnapshot(): Promise<void> {
  const snapshot = await buildSystemHealthSnapshot();
  broadcastEvent("system_health_updated", snapshot);
}

async function initializeWsMessageSync(): Promise<void> {
  const latestMessage = await prisma.message.findFirst({
    orderBy: { id: "desc" },
    select: { id: true }
  });
  wsLastBroadcastMessageId = latestMessage?.id || 0;
}

async function syncMessagesFromDatabase(): Promise<void> {
  if (wsSyncInProgress) return;
  wsSyncInProgress = true;

  try {
    const freshMessages = await prisma.message.findMany({
      where: { id: { gt: wsLastBroadcastMessageId } },
      orderBy: { id: "asc" },
      take: 200,
      include: {
        contact: {
          select: { id: true, waId: true }
        }
      }
    });

    for (const message of freshMessages) {
      if (!message.contact) continue;
      broadcastMessage(message.contact.waId, message.contact.id, {
        id: message.id,
        direction: message.direction,
        body: message.body,
        createdAt: message.createdAt
      });
    }
  } catch (err) {
    console.error("[WS] DB sync error:", err);
  } finally {
    wsSyncInProgress = false;
  }
}

const DEFAULT_PIPELINE_STAGES = [
  { name: "Novo", position: 1, color: "#38bdf8" },
  { name: "Qualificado", position: 2, color: "#22c55e" },
  { name: "Proposta", position: 3, color: "#f59e0b" },
  { name: "NegociaÃ§Ã£o", position: 4, color: "#f97316" },
  { name: "Fechado (ganho)", position: 5, color: "#10b981" },
  { name: "Fechado (perdido)", position: 6, color: "#ef4444" }
] as const;

app.use((req, res, next) => {
  const requestId = typeof req.headers["x-request-id"] === "string" && req.headers["x-request-id"].trim()
    ? req.headers["x-request-id"].trim()
    : crypto.randomUUID();
  (req as express.Request & { meta?: RequestMeta }).meta = { requestId };
  res.setHeader("X-Request-Id", requestId);

  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
  }
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
});

app.use(express.json({
  verify: (req, _res, buffer) => {
    (req as express.Request & { meta?: RequestMeta }).meta = {
      ...(req as express.Request & { meta?: RequestMeta }).meta,
      requestId: (req as express.Request & { meta?: RequestMeta }).meta?.requestId || crypto.randomUUID(),
      rawBody: Buffer.from(buffer)
    };
  }
}));

app.use((req, res, next) => {
  const startedAt = Date.now();
  const requestId = (req as express.Request & { meta?: RequestMeta }).meta?.requestId || "unknown";

  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    const statusCode = res.statusCode;
    const level: "info" | "warn" | "error" = statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info";
    const userAgent = req.get("user-agent") || null;

    if (shouldSkipHttpRequestLog(req.method, req.path, statusCode)) {
      return;
    }

    const body = req.body && typeof req.body === "object"
      ? redactSensitive(req.body as Record<string, unknown>)
      : undefined;

    logEvent(level, "http.request.completed", {
      requestId,
      method: req.method,
      path: req.path,
      statusCode,
      durationMs,
      ip: req.ip,
      userAgent,
      clientOs: inferClientOs(userAgent),
      query: req.query,
      params: req.params,
      body
    });
  });

  next();
});

registerSystemRoutes(app, {
  buildSystemHealthSnapshot
});

app.get("/api/logs", requireSession, async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.max(1, Math.min(100, Number(req.query.limit || 20)));
  const where = buildLogsWhereFromQuery(req.query);

  const [total, logs] = await Promise.all([
    prisma.appLog.count({ where }),
    prisma.appLog.findMany({
      where,
      orderBy: [{ ts: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit
    })
  ]);

  res.json({
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    availablePageSizes: [10, 20, 50, 100],
    filterLabels: {
      level: "NÃ­vel do log (info/warn/error)",
      status: "Status da requisiÃ§Ã£o (sucesso/falha)",
      path: "Trecho da rota HTTP",
      event: "Nome tÃ©cnico do evento",
      requestId: "ID de correlaÃ§Ã£o da requisiÃ§Ã£o",
      waId: "WhatsApp ID do contato",
      contactId: "ID interno do lead/contato",
      statusCode: "Status HTTP (100-599)",
      ip: "IP de origem da requisiÃ§Ã£o",
      clientOs: "Sistema operacional inferido via User-Agent",
      from: "Data/hora inicial",
      to: "Data/hora final",
      search: "Busca geral em evento, rota, mensagem e IDs"
    },
    logs
  });
});

app.post("/api/logs/delete-auth", requireSession, (req, res) => {
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const session = (req as express.Request & { user?: SessionPayload }).user;

  if (!password.trim()) {
    res.status(400).json({ message: "Senha Ã© obrigatÃ³ria." });
    return;
  }

  if (!session || session.username !== DASHBOARD_USER || password !== DASHBOARD_PASS) {
    res.status(401).json({ message: "Senha invÃ¡lida." });
    return;
  }

  const expiresAtMs = Date.now() + LOG_DELETE_REAUTH_WINDOW_MS;
  logDeleteAuthByUser.set(session.username, expiresAtMs);

  res.json({
    ok: true,
    expiresAt: new Date(expiresAtMs).toISOString(),
    ttlMs: LOG_DELETE_REAUTH_WINDOW_MS
  });
});

app.delete("/api/logs", requireSession, async (req, res) => {
  const session = (req as express.Request & { user?: SessionPayload }).user;
  const nowMs = Date.now();
  const validUntilMs = session ? logDeleteAuthByUser.get(session.username) || 0 : 0;
  const hasDeletePermission = Boolean(session && validUntilMs > nowMs);

  if (!hasDeletePermission) {
    res.status(403).json({
      message: "ReautenticaÃ§Ã£o necessÃ¡ria para excluir logs.",
      requiresPassword: true,
      ttlMs: LOG_DELETE_REAUTH_WINDOW_MS
    });
    return;
  }

  const where = buildLogsWhereFromQuery(req.query);
  const hasFilters = Object.keys(where).length > 0;
  const deleteAll = String(req.query.all || "").toLowerCase() === "true";

  if (!hasFilters && !deleteAll) {
    res.status(400).json({
      message: "Para evitar exclusÃ£o acidental, aplique filtros ou envie ?all=true."
    });
    return;
  }

  const deleted = await prisma.appLog.deleteMany({ where: hasFilters ? where : {} });
  const requestId = (req as express.Request & { meta?: RequestMeta }).meta?.requestId || "unknown";

  logEvent("warn", "logs.bulk_deleted", {
    requestId,
    deletedCount: deleted.count,
    scope: hasFilters ? "filtered" : "all",
    deletedBy: session?.username || "unknown"
  });

  res.json({
    message: "Logs removidos com sucesso.",
    deletedCount: deleted.count,
    scope: hasFilters ? "filtered" : "all"
  });
});

registerAuthRoutes(app, {
  dashboardUser: DASHBOARD_USER,
  dashboardPass: DASHBOARD_PASS,
  signSession,
  setAuthCookie,
  clearAuthCookie,
  getSessionFromRequest
});

app.get("/api/dashboard/summary", requireSession, async (_req, res) => {
  const [contacts, messages, inbound, outbound, faqs] = await Promise.all([
    prisma.contact.count(),
    prisma.message.count(),
    prisma.message.count({ where: { direction: "in" } }),
    prisma.message.count({ where: { direction: "out" } }),
    prisma.faq.count({ where: { isActive: true } })
  ]);

  const latestMessage = await prisma.message.findFirst({
    orderBy: { createdAt: "desc" },
    include: { contact: true }
  });

  res.json({
    metrics: {
      contacts,
      messages,
      inbound,
      outbound,
      activeFaqs: faqs
    },
    latest:
      latestMessage
        ? {
          body: latestMessage.body,
          direction: latestMessage.direction,
          contact: latestMessage.contact?.name || latestMessage.contact?.waId || "Sem nome",
          createdAt: latestMessage.createdAt
        }
        : null
  });
});

app.get("/api/dashboard/conversations", requireSession, async (_req, res) => {
  const contacts = await prisma.contact.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 20
      }
    }
  });

  res.json({
    contacts: contacts.map((contact) => ({
      id: contact.id,
      waId: contact.waId,
      name: contact.name,
      createdAt: contact.createdAt,
      messages: [...contact.messages]
        .reverse()
        .map((message) => ({
          id: message.id,
          direction: message.direction,
          body: message.body,
          createdAt: message.createdAt
        }))
    }))
  });
});

app.get("/api/dashboard/faqs", requireSession, async (_req, res) => {
  const faqs = await prisma.faq.findMany({
    orderBy: { updatedAt: "desc" }
  });

  res.json({
    faqs: faqs.map((faq) => ({
      id: faq.id,
      question: faq.question,
      answer: faq.answer,
      isActive: faq.isActive,
      createdAt: faq.createdAt,
      updatedAt: faq.updatedAt
    }))
  });
});

app.post("/api/dashboard/faqs", requireSession, async (req, res) => {
  const questionRaw = typeof req.body?.question === "string" ? req.body.question.trim() : "";
  const answerRaw = typeof req.body?.answer === "string" ? req.body.answer.trim() : "";

  if (!questionRaw || !answerRaw) {
    res.status(400).json({ message: "Pergunta e resposta sÃ£o obrigatÃ³rias." });
    return;
  }

  try {
    const created = await prisma.faq.create({
      data: {
        question: questionRaw,
        answer: answerRaw,
        isActive: true
      }
    });

    res.status(201).json({
      message: "FAQ criado com sucesso.",
      faq: {
        id: created.id,
        question: created.question,
        answer: created.answer,
        isActive: created.isActive,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt
      }
    });
    broadcastEvent("faqs_updated");
    broadcastEvent("dashboard_updated");
  } catch (err: unknown) {
    if (isPrismaUniqueError(err)) {
      res.status(409).json({ message: "JÃ¡ existe um FAQ com essa pergunta." });
      return;
    }
    throw err;
  }
});

app.put("/api/dashboard/faqs/:faqId", requireSession, async (req, res) => {
  const faqId = Number(req.params.faqId);
  if (!Number.isInteger(faqId) || faqId <= 0) {
    res.status(400).json({ message: "ID de FAQ invÃ¡lido." });
    return;
  }

  const questionRaw = typeof req.body?.question === "string" ? req.body.question.trim() : "";
  const answerRaw = typeof req.body?.answer === "string" ? req.body.answer.trim() : "";
  const isActiveRaw = req.body?.isActive;

  if (!questionRaw || !answerRaw) {
    res.status(400).json({ message: "Pergunta e resposta sÃ£o obrigatÃ³rias." });
    return;
  }

  const isActive = typeof isActiveRaw === "boolean" ? isActiveRaw : true;

  try {
    const updated = await prisma.faq.update({
      where: { id: faqId },
      data: {
        question: questionRaw,
        answer: answerRaw,
        isActive
      }
    });

    res.json({
      message: "FAQ atualizado com sucesso.",
      faq: {
        id: updated.id,
        question: updated.question,
        answer: updated.answer,
        isActive: updated.isActive,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt
      }
    });
    broadcastEvent("faqs_updated");
    broadcastEvent("dashboard_updated");
  } catch (err: unknown) {
    if (isPrismaUniqueError(err)) {
      res.status(409).json({ message: "JÃ¡ existe um FAQ com essa pergunta." });
      return;
    }
    if (isPrismaNotFoundError(err)) {
      res.status(404).json({ message: "FAQ nÃ£o encontrado." });
      return;
    }
    throw err;
  }
});

app.delete("/api/dashboard/faqs/:faqId", requireSession, async (req, res) => {
  const faqId = Number(req.params.faqId);
  if (!Number.isInteger(faqId) || faqId <= 0) {
    res.status(400).json({ message: "ID de FAQ invÃ¡lido." });
    return;
  }

  const deleted = await prisma.faq.deleteMany({
    where: { id: faqId }
  });

  if (deleted.count === 0) {
    res.status(404).json({ message: "FAQ nÃ£o encontrado." });
    return;
  }

  broadcastEvent("faqs_updated");
  broadcastEvent("dashboard_updated");
  res.json({ message: "FAQ removido com sucesso." });
});

app.delete("/api/dashboard/messages/:messageId", requireSession, async (req, res) => {
  const messageId = Number(req.params.messageId);
  if (!Number.isInteger(messageId) || messageId <= 0) {
    res.status(400).json({ message: "ID de mensagem invÃ¡lido." });
    return;
  }

  const deleted = await prisma.message.deleteMany({
    where: { id: messageId }
  });

  if (deleted.count === 0) {
    res.status(404).json({ message: "Mensagem nÃ£o encontrada." });
    return;
  }

  broadcastEvent("dashboard_updated");
  broadcastEvent("analytics_updated");
  res.json({ message: "Mensagem removida com sucesso." });
});

app.delete("/api/dashboard/contacts/:contactId/messages", requireSession, async (req, res) => {
  const contactId = Number(req.params.contactId);
  if (!Number.isInteger(contactId) || contactId <= 0) {
    res.status(400).json({ message: "ID de contato invÃ¡lido." });
    return;
  }

  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { id: true }
  });

  if (!contact) {
    res.status(404).json({ message: "Contato nÃ£o encontrado." });
    return;
  }

  const deleted = await prisma.message.deleteMany({
    where: { contactId }
  });

  broadcastEvent("dashboard_updated");
  broadcastEvent("analytics_updated");
  res.json({
    message: "Mensagens removidas com sucesso.",
    deletedCount: deleted.count
  });
});

app.delete("/api/dashboard/contacts/:contactId", requireSession, async (req, res) => {
  const contactId = Number(req.params.contactId);
  if (!Number.isInteger(contactId) || contactId <= 0) {
    res.status(400).json({ message: "ID de contato invÃ¡lido." });
    return;
  }

  const deleted = await prisma.contact.deleteMany({
    where: { id: contactId }
  });

  if (deleted.count === 0) {
    res.status(404).json({ message: "Contato nÃ£o encontrado." });
    return;
  }

  broadcastEvent("dashboard_updated");
  broadcastEvent("analytics_updated");
  res.json({ message: "Contato e histÃ³rico removidos com sucesso." });
});

app.get("/api/crm/stages", requireSession, async (_req, res) => {
  await ensureDefaultStages();
  const stages = await prisma.pipelineStage.findMany({
    where: { isActive: true },
    orderBy: { position: "asc" }
  });

  res.json({ stages });
});

app.post("/api/crm/stages", requireSession, async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const color = typeof req.body?.color === "string" && req.body.color.trim() ? req.body.color.trim() : "#06b6d4";

  if (!name) {
    res.status(400).json({ message: "Nome da etapa Ã© obrigatÃ³rio." });
    return;
  }

  const maxPosition = await prisma.pipelineStage.aggregate({
    _max: { position: true }
  });
  const position = typeof req.body?.position === "number" ? Math.max(1, Math.floor(req.body.position)) : (maxPosition._max.position || 0) + 1;

  try {
    const stage = await prisma.pipelineStage.create({
      data: { name, color, position, isActive: true }
    });
    broadcastEvent("stage_updated");
    res.status(201).json({ message: "Etapa criada com sucesso.", stage });
  } catch (err) {
    if (isPrismaUniqueError(err)) {
      res.status(409).json({ message: "JÃ¡ existe etapa com este nome ou posiÃ§Ã£o." });
      return;
    }
    throw err;
  }
});

app.put("/api/crm/stages/:id(\\d+)", requireSession, async (req, res) => {
  const stageId = Number(req.params.id);
  if (!Number.isInteger(stageId) || stageId <= 0) {
    res.status(400).json({ message: "ID de etapa invÃ¡lido." });
    return;
  }

  const payload: { name?: string; color?: string; isActive?: boolean } = {};
  if (typeof req.body?.name === "string" && req.body.name.trim()) payload.name = req.body.name.trim();
  if (typeof req.body?.color === "string" && req.body.color.trim()) payload.color = req.body.color.trim();
  if (typeof req.body?.isActive === "boolean") payload.isActive = req.body.isActive;

  if (Object.keys(payload).length === 0) {
    res.status(400).json({ message: "Nenhuma alteraÃ§Ã£o enviada." });
    return;
  }

  try {
    const stage = await prisma.pipelineStage.update({
      where: { id: stageId },
      data: payload
    });
    broadcastEvent("stage_updated");
    res.json({ message: "Etapa atualizada com sucesso.", stage });
  } catch (err) {
    if (isPrismaNotFoundError(err)) {
      res.status(404).json({ message: "Etapa nÃ£o encontrada." });
      return;
    }
    if (isPrismaUniqueError(err)) {
      res.status(409).json({ message: "JÃ¡ existe etapa com este nome." });
      return;
    }
    throw err;
  }
});

app.put("/api/crm/stages/reorder", requireSession, async (req, res) => {
  const stageIds = Array.isArray(req.body?.stageIds) ? req.body.stageIds.map((id: unknown) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0) : [];
  if (stageIds.length === 0) {
    res.status(400).json({ message: "Envie uma lista vÃ¡lida de IDs de etapa." });
    return;
  }

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Mover todos para posiÃ§Ãµes temporÃ¡rias (negativas) para evitar conflito de UNIQUE
      for (let i = 0; i < stageIds.length; i++) {
        await tx.pipelineStage.update({
          where: { id: stageIds[i] },
          data: { position: -(i + 1) }
        });
      }
      // 2. Definir posiÃ§Ãµes finais corretas
      for (let i = 0; i < stageIds.length; i++) {
        await tx.pipelineStage.update({
          where: { id: stageIds[i] },
          data: { position: i + 1 }
        });
      }
    });

    const stages = await prisma.pipelineStage.findMany({
      where: { isActive: true },
      orderBy: { position: "asc" }
    });
    broadcastEvent("stage_updated");
    res.json({ message: "Ordem de etapas atualizada.", stages });
  } catch (err) {
    console.error("Erro ao reordenar:", err);
    res.status(500).json({ message: "Falha ao reordenar etapas no banco de dados." });
  }
});

app.get("/api/crm/leads", requireSession, async (req, res) => {
  await ensureDefaultStages();
  const defaultStageId = await getDefaultStageId();
  if (defaultStageId) {
    await prisma.contact.updateMany({
      where: { stageId: null },
      data: { stageId: defaultStageId }
    });
  }
  const stageId = req.query.stageId ? Number(req.query.stageId) : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const course = typeof req.query.course === "string" ? req.query.course.trim() : "";
  const modality = typeof req.query.modality === "string" ? req.query.modality.trim() : "";
  const scoreMin = req.query.scoreMin !== undefined ? Number(req.query.scoreMin) : undefined;
  const scoreMax = req.query.scoreMax !== undefined ? Number(req.query.scoreMax) : undefined;
  const handoffNeededQuery = typeof req.query.handoffNeeded === "string"
    ? req.query.handoffNeeded.trim().toLowerCase()
    : "";
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.max(1, Math.min(100, Number(req.query.limit || 20)));
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (stageId && Number.isInteger(stageId) && stageId > 0) where.stageId = stageId;
  if (status && ["open", "won", "lost"].includes(status)) where.leadStatus = status;
  if (course) where.interestedCourse = { contains: course, mode: "insensitive" };
  if (modality) where.courseMode = { contains: modality, mode: "insensitive" };
  if (handoffNeededQuery === "true") where.handoffNeeded = true;
  if (handoffNeededQuery === "false") where.handoffNeeded = false;
  if (Number.isFinite(scoreMin) || Number.isFinite(scoreMax)) {
    where.qualificationScore = {
      ...(Number.isFinite(scoreMin) ? { gte: Number(scoreMin) } : {}),
      ...(Number.isFinite(scoreMax) ? { lte: Number(scoreMax) } : {})
    };
  }
  if (search) {
    where.OR = [
      { waId: { contains: search, mode: "insensitive" } },
      { name: { contains: search, mode: "insensitive" } },
      { notes: { contains: search, mode: "insensitive" } },
      { interestedCourse: { contains: search, mode: "insensitive" } },
      { courseMode: { contains: search, mode: "insensitive" } },
      { availability: { contains: search, mode: "insensitive" } }
    ];
  }

  const [total, leads] = await Promise.all([
    prisma.contact.count({ where }),
    prisma.contact.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip,
      take: limit,
      include: {
        stage: true,
        tasks: {
          where: { status: "open" },
          orderBy: { dueAt: "asc" },
          take: 5
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1
        }
      }
    })
  ]);

  res.json({
    leads: leads.map(mapLeadSummary),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit))
    }
  });
});

app.post("/api/crm/leads", requireSession, async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const waIdRaw = typeof req.body?.waId === "string" ? req.body.waId.trim() : "";
  const waId = normalizeWaId(waIdRaw);
  const email = typeof req.body?.email === "string" ? extractEmailFromText(req.body.email) : null;
  const stageIdRaw = Number(req.body?.stageId);
  const defaultStageId = await getDefaultStageId();
  const stageId = Number.isInteger(stageIdRaw) && stageIdRaw > 0 ? stageIdRaw : defaultStageId;
  const source = typeof req.body?.source === "string" ? req.body.source.trim() : null;
  const notes = typeof req.body?.notes === "string" ? req.body.notes.trim() : null;

  if (!name || !waId || !stageId) {
    res.status(400).json({ message: "Nome e WhatsApp sao obrigatorios." });
    return;
  }

  try {
    const lead = await prisma.contact.create({
      data: {
        name,
        waId,
        email,
        stageId,
        source,
        notes,
        leadStatus: "open",
        botEnabled: true
      },
      include: { stage: true }
    });

    broadcastEvent("lead_created", { lead: mapLeadDetails(lead) });
    broadcastEvent("dashboard_updated");
    broadcastEvent("analytics_updated");
    res.status(201).json({ message: "Lead criado com sucesso.", lead: mapLeadDetails(lead) });
  } catch (err) {
    if (isPrismaUniqueError(err)) {
      res.status(409).json({ message: "JÃ¡ existe lead com este WhatsApp." });
      return;
    }
    throw err;
  }
});

app.get("/api/crm/leads/:id", requireSession, async (req, res) => {
  const leadId = Number(req.params.id);
  if (!Number.isInteger(leadId) || leadId <= 0) {
    res.status(400).json({ message: "ID de lead invÃ¡lido." });
    return;
  }

  const lead = await prisma.contact.findUnique({
    where: { id: leadId },
    include: {
      stage: true,
      messages: { orderBy: { createdAt: "desc" }, take: 100 },
      tasks: { orderBy: [{ status: "asc" }, { dueAt: "asc" }] }
    }
  });

  if (!lead) {
    res.status(404).json({ message: "Lead nÃ£o encontrado." });
    return;
  }

  res.json({ lead: mapLeadDetails(lead) });
});

app.put("/api/crm/leads/:id", requireSession, async (req, res) => {
  const leadId = Number(req.params.id);
  if (!Number.isInteger(leadId) || leadId <= 0) {
    res.status(400).json({ message: "ID de lead invÃ¡lido." });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (typeof req.body?.name === "string") updateData.name = req.body.name.trim() || null;
  if (typeof req.body?.email === "string") updateData.email = extractEmailFromText(req.body.email) || null;
  if (typeof req.body?.waId === "string") {
    const parsed = normalizeWaId(req.body.waId.trim());
    if (!parsed) {
      res.status(400).json({ message: "WhatsApp invÃ¡lido." });
      return;
    }
    updateData.waId = parsed;
  }
  if (typeof req.body?.stageId === "number" && Number.isInteger(req.body.stageId) && req.body.stageId > 0) {
    updateData.stageId = req.body.stageId;
  }
  if (typeof req.body?.source === "string") updateData.source = req.body.source.trim() || null;
  if (typeof req.body?.notes === "string") updateData.notes = req.body.notes.trim() || null;
  if (typeof req.body?.leadStatus === "string" && ["open", "won", "lost"].includes(req.body.leadStatus)) {
    updateData.leadStatus = req.body.leadStatus;
  }
  if (typeof req.body?.botEnabled === "boolean") updateData.botEnabled = req.body.botEnabled;
  if (typeof req.body?.customBotPersona === "string") updateData.customBotPersona = req.body.customBotPersona.trim() || null;
  if (typeof req.body?.interestedCourse === "string") updateData.interestedCourse = req.body.interestedCourse.trim() || null;
  if (typeof req.body?.courseMode === "string") updateData.courseMode = req.body.courseMode.trim() || null;
  if (typeof req.body?.availability === "string") updateData.availability = req.body.availability.trim() || null;
  if (req.body?.interestConfidence === null) updateData.interestConfidence = null;
  if (typeof req.body?.interestConfidence === "number" && Number.isFinite(req.body.interestConfidence)) {
    updateData.interestConfidence = Math.max(0, Math.min(1, Number(req.body.interestConfidence.toFixed(2))));
  }
  if (req.body?.qualificationScore === null) updateData.qualificationScore = null;
  if (typeof req.body?.qualificationScore === "number" && Number.isFinite(req.body.qualificationScore)) {
    updateData.qualificationScore = Math.max(0, Math.min(100, Math.round(req.body.qualificationScore)));
  }
  if (typeof req.body?.handoffNeeded === "boolean") updateData.handoffNeeded = req.body.handoffNeeded;

  if (Object.keys(updateData).length === 0) {
    res.status(400).json({ message: "Nenhuma alteraÃ§Ã£o enviada." });
    return;
  }

  try {
    const lead = await prisma.contact.update({
      where: { id: leadId },
      data: updateData,
      include: { stage: true }
    });
    broadcastEvent("lead_updated", { lead: mapLeadDetails(lead) });
    res.json({ message: "Lead atualizado com sucesso.", lead: mapLeadDetails(lead) });
  } catch (err) {
    if (isPrismaNotFoundError(err)) {
      res.status(404).json({ message: "Lead nÃ£o encontrado." });
      return;
    }
    if (isPrismaUniqueError(err)) {
      res.status(409).json({ message: "JÃ¡ existe lead com este WhatsApp." });
      return;
    }
    throw err;
  }
});

app.patch("/api/crm/leads/:id/handoff", requireSession, async (req, res) => {
  const leadId = Number(req.params.id);
  const handoffNeeded = req.body?.handoffNeeded;

  if (!Number.isInteger(leadId) || leadId <= 0) {
    res.status(400).json({ message: "ID de lead invÃ¡lido." });
    return;
  }

  if (typeof handoffNeeded !== "boolean") {
    res.status(400).json({ message: "Campo handoffNeeded deve ser booleano." });
    return;
  }

  try {
    const lead = await prisma.contact.update({
      where: { id: leadId },
      data: { handoffNeeded },
      include: { stage: true }
    });
    broadcastEvent("lead_profile_updated", { leadId, handoffNeeded });
    broadcastEvent("lead_updated", { lead: mapLeadDetails(lead) });
    res.json({ message: "Handoff do lead atualizado.", lead: mapLeadDetails(lead) });
  } catch (err) {
    if (isPrismaNotFoundError(err)) {
      res.status(404).json({ message: "Lead nÃ£o encontrado." });
      return;
    }
    throw err;
  }
});

app.delete("/api/crm/leads/:id", requireSession, async (req, res) => {
  const leadId = Number(req.params.id);
  if (!Number.isInteger(leadId) || leadId <= 0) {
    res.status(400).json({ message: "ID de lead invÃ¡lido." });
    return;
  }

  try {
    await prisma.contact.delete({
      where: { id: leadId }
    });
    broadcastEvent("lead_deleted", { id: leadId });
    broadcastEvent("dashboard_updated");
    broadcastEvent("analytics_updated");
    res.json({ message: "Lead excluÃ­do com sucesso." });
  } catch (err) {
    if (isPrismaNotFoundError(err)) {
      res.status(404).json({ message: "Lead nÃ£o encontrado." });
      return;
    }
    throw err;
  }
});

app.patch("/api/crm/leads/:id/stage", requireSession, async (req, res) => {
  const leadId = Number(req.params.id);
  const stageId = Number(req.body?.stageId);
  if (!Number.isInteger(leadId) || leadId <= 0 || !Number.isInteger(stageId) || stageId <= 0) {
    res.status(400).json({ message: "Lead e etapa sÃ£o obrigatÃ³rios." });
    return;
  }

  try {
    const lead = await prisma.contact.update({
      where: { id: leadId },
      data: { stageId },
      include: { stage: true }
    });
    broadcastEvent("lead_updated", { lead: mapLeadDetails(lead) });
    res.json({ message: "Etapa do lead atualizada.", lead: mapLeadDetails(lead) });
  } catch (err) {
    if (isPrismaNotFoundError(err)) {
      res.status(404).json({ message: "Lead nÃ£o encontrado." });
      return;
    }
    throw err;
  }
});

app.patch("/api/crm/leads/:id/status", requireSession, async (req, res) => {
  const leadId = Number(req.params.id);
  const leadStatus = typeof req.body?.status === "string" ? req.body.status : "";
  if (!Number.isInteger(leadId) || leadId <= 0 || !["open", "won", "lost"].includes(leadStatus)) {
    res.status(400).json({ message: "Status invÃ¡lido." });
    return;
  }

  try {
    const lead = await prisma.contact.update({
      where: { id: leadId },
      data: { leadStatus },
      include: { stage: true }
    });
    broadcastEvent("lead_updated", { lead: mapLeadDetails(lead) });
    res.json({ message: "Status do lead atualizado.", lead: mapLeadDetails(lead) });
  } catch (err) {
    if (isPrismaNotFoundError(err)) {
      res.status(404).json({ message: "Lead nÃ£o encontrado." });
      return;
    }
    throw err;
  }
});

app.patch("/api/crm/leads/:id/bot", requireSession, async (req, res) => {
  const leadId = Number(req.params.id);
  const enabled = req.body?.enabled;
  if (!Number.isInteger(leadId) || leadId <= 0 || typeof enabled !== "boolean") {
    res.status(400).json({ message: "Envie enabled como boolean." });
    return;
  }

  try {
    const lead = await prisma.contact.update({
      where: { id: leadId },
      data: { botEnabled: enabled },
      include: { stage: true }
    });
    broadcastEvent("lead_updated", { lead: mapLeadDetails(lead) });
    res.json({ message: "Modo bot atualizado.", lead: mapLeadDetails(lead) });
  } catch (err) {
    if (isPrismaNotFoundError(err)) {
      res.status(404).json({ message: "Lead nÃ£o encontrado." });
      return;
    }
    throw err;
  }
});

app.get("/api/crm/leads/:id/messages", requireSession, async (req, res) => {
  const leadId = Number(req.params.id);
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.max(1, Math.min(100, Number(req.query.limit || 20)));
  if (!Number.isInteger(leadId) || leadId <= 0) {
    res.status(400).json({ message: "ID de lead invÃ¡lido." });
    return;
  }

  const skip = (page - 1) * limit;
  const where = { contactId: leadId };
  const [total, messagesDesc] = await Promise.all([
    prisma.message.count({ where }),
    prisma.message.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit
    })
  ]);

  res.json({
    messages: messagesDesc.slice().reverse(),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit))
    }
  });
});
app.get("/api/crm/leads/:id/tasks", requireSession, async (req, res) => {
  const leadId = Number(req.params.id);
  if (!Number.isInteger(leadId) || leadId <= 0) {
    res.status(400).json({ message: "ID de lead invÃ¡lido." });
    return;
  }

  const tasks = await prisma.task.findMany({
    where: { contactId: leadId },
    orderBy: [{ status: "asc" }, { dueAt: "asc" }]
  });

  res.json({ tasks });
});

app.post("/api/crm/leads/:id/tasks", requireSession, async (req, res) => {
  const leadId = Number(req.params.id);
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  const description = typeof req.body?.description === "string" ? req.body.description.trim() : null;
  const dueAtRaw = typeof req.body?.dueAt === "string" ? req.body.dueAt : "";
  const priority = typeof req.body?.priority === "string" && ["low", "medium", "high"].includes(req.body.priority) ? req.body.priority : "medium";
  const dueAt = new Date(dueAtRaw);

  if (!Number.isInteger(leadId) || leadId <= 0 || !title || Number.isNaN(dueAt.getTime())) {
    res.status(400).json({ message: "Lead, tÃ­tulo e vencimento sÃ£o obrigatÃ³rios." });
    return;
  }

  const task = await prisma.task.create({
    data: {
      contactId: leadId,
      title,
      description,
      dueAt,
      priority,
      status: "open"
    }
  });

  broadcastEvent("calendar_tasks_updated");
  res.status(201).json({ message: "Tarefa criada com sucesso.", task });
});

app.put("/api/crm/tasks/:taskId", requireSession, async (req, res) => {
  const taskId = Number(req.params.taskId);
  if (!Number.isInteger(taskId) || taskId <= 0) {
    res.status(400).json({ message: "ID de tarefa invÃ¡lido." });
    return;
  }

  const data: Record<string, unknown> = {};
  if (typeof req.body?.title === "string") data.title = req.body.title.trim();
  if (typeof req.body?.description === "string") data.description = req.body.description.trim() || null;
  if (typeof req.body?.priority === "string" && ["low", "medium", "high"].includes(req.body.priority)) data.priority = req.body.priority;
  if (typeof req.body?.dueAt === "string") {
    const dueAt = new Date(req.body.dueAt);
    if (Number.isNaN(dueAt.getTime())) {
      res.status(400).json({ message: "Data de vencimento invÃ¡lida." });
      return;
    }
    data.dueAt = dueAt;
  }

  if (Object.keys(data).length === 0) {
    res.status(400).json({ message: "Nenhuma alteraÃ§Ã£o enviada." });
    return;
  }

  try {
    const task = await prisma.task.update({
      where: { id: taskId },
      data
    });
    broadcastEvent("calendar_tasks_updated");
    res.json({ message: "Tarefa atualizada com sucesso.", task });
  } catch (err) {
    if (isPrismaNotFoundError(err)) {
      res.status(404).json({ message: "Tarefa nÃ£o encontrada." });
      return;
    }
    throw err;
  }
});

app.patch("/api/crm/tasks/:taskId/status", requireSession, async (req, res) => {
  const taskId = Number(req.params.taskId);
  const status = typeof req.body?.status === "string" ? req.body.status : "";
  if (!Number.isInteger(taskId) || taskId <= 0 || !["open", "done", "canceled"].includes(status)) {
    res.status(400).json({ message: "Status invÃ¡lido." });
    return;
  }

  try {
    const task = await prisma.task.update({
      where: { id: taskId },
      data: {
        status,
        completedAt: status === "done" ? new Date() : null
      }
    });
    broadcastEvent("calendar_tasks_updated");
    res.json({ message: "Status da tarefa atualizado.", task });
  } catch (err) {
    if (isPrismaNotFoundError(err)) {
      res.status(404).json({ message: "Tarefa nÃ£o encontrada." });
      return;
    }
    throw err;
  }
});

app.delete("/api/crm/tasks/:taskId", requireSession, async (req, res) => {
  const taskId = Number(req.params.taskId);
  if (!Number.isInteger(taskId) || taskId <= 0) {
    res.status(400).json({ message: "ID de tarefa invÃ¡lido." });
    return;
  }

  const deleted = await prisma.task.deleteMany({ where: { id: taskId } });
  if (deleted.count === 0) {
    res.status(404).json({ message: "Tarefa nÃ£o encontrada." });
    return;
  }
  broadcastEvent("calendar_tasks_updated");
  res.json({ message: "Tarefa removida com sucesso." });
});

app.get("/api/crm/metrics/conversion", requireSession, async (_req, res) => {
  const [stages, wonTotal, lostTotal, openTotal] = await Promise.all([
    prisma.pipelineStage.findMany({
      where: { isActive: true },
      include: {
        contacts: {
          select: { id: true, leadStatus: true }
        }
      },
      orderBy: { position: "asc" }
    }),
    prisma.contact.count({ where: { leadStatus: "won" } }),
    prisma.contact.count({ where: { leadStatus: "lost" } }),
    prisma.contact.count({ where: { leadStatus: "open" } })
  ]);

  const totalClosed = wonTotal + lostTotal;

  res.json({
    overall: {
      won: wonTotal,
      lost: lostTotal,
      open: openTotal,
      totalClosed,
      conversionRate: totalClosed > 0 ? Number(((wonTotal / totalClosed) * 100).toFixed(2)) : 0
    },
    byStage: stages.map((stage) => {
      const won = stage.contacts.filter((c) => c.leadStatus === "won").length;
      const lost = stage.contacts.filter((c) => c.leadStatus === "lost").length;
      const open = stage.contacts.filter((c) => c.leadStatus === "open").length;
      const closed = won + lost;
      return {
        stageId: stage.id,
        stageName: stage.name,
        stageColor: stage.color,
        total: stage.contacts.length,
        won,
        lost,
        open,
        conversionRate: closed > 0 ? Number(((won / closed) * 100).toFixed(2)) : 0
      };
    })
  });
});

// ============================================
// OFFERS / LANDINGS
// ============================================

app.get("/api/offers", requireSession, async (_req, res) => {
  const offers = await prisma.offer.findMany({
    orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    include: {
      landingPages: {
        orderBy: [{ publishedAt: "desc" }, { version: "desc" }],
        take: 1
      }
    }
  });
  res.json({ offers: offers.map(mapOffer) });
});

app.post("/api/offers", requireSession, async (req, res) => {
  const title = typeof req.body?.title === "string" ? utf8Text(req.body.title.trim()) : "";
  const slugInput = typeof req.body?.slug === "string" ? req.body.slug.trim() : title;
  const slug = normalizeSlug(slugInput);
  const aliases = parseStringArray(req.body?.aliases);
  const approvedFacts = parseStringArray(req.body?.approvedFacts);
  const ctaLabel = typeof req.body?.ctaLabel === "string" ? utf8Text(req.body.ctaLabel.trim()) : "";
  const ctaUrl = typeof req.body?.ctaUrl === "string" ? utf8Text(req.body.ctaUrl.trim()) : "";

  if (!title || !slug || !ctaLabel || !ctaUrl) {
    res.status(400).json({ message: "Titulo, slug, CTA label e CTA URL sao obrigatorios." });
    return;
  }

  try {
    const offer = await prisma.offer.create({
      data: {
        title,
        slug,
        aliases,
        durationLabel: typeof req.body?.durationLabel === "string" ? utf8Text(req.body.durationLabel.trim()) || null : null,
        modality: typeof req.body?.modality === "string" ? utf8Text(req.body.modality.trim()) || null : null,
        shortDescription: typeof req.body?.shortDescription === "string" ? utf8Text(req.body.shortDescription.trim()) || null : null,
        approvedFacts,
        ctaLabel,
        ctaUrl,
        visualTheme: typeof req.body?.visualTheme === "string" ? utf8Text(req.body.visualTheme.trim()) || null : null,
        isActive: typeof req.body?.isActive === "boolean" ? req.body.isActive : true
      }
    });
    logEvent("info", "offer.created", { offerId: offer.id, slug: offer.slug });
    broadcastEvent("offers_updated");
    res.status(201).json({ message: "Oferta criada com sucesso.", offer: mapOffer(offer) });
  } catch (err) {
    if (isPrismaUniqueError(err)) {
      res.status(409).json({ message: "Ja existe oferta com este slug." });
      return;
    }
    throw err;
  }
});

app.put("/api/offers/:id", requireSession, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ message: "ID de oferta invalido." });
    return;
  }

  const data: Record<string, unknown> = {};
  if (typeof req.body?.title === "string") data.title = utf8Text(req.body.title.trim());
  if (typeof req.body?.slug === "string" && req.body.slug.trim()) data.slug = normalizeSlug(req.body.slug);
  if (req.body?.aliases !== undefined) data.aliases = parseStringArray(req.body.aliases);
  if (typeof req.body?.durationLabel === "string") data.durationLabel = utf8Text(req.body.durationLabel.trim()) || null;
  if (typeof req.body?.modality === "string") data.modality = utf8Text(req.body.modality.trim()) || null;
  if (typeof req.body?.shortDescription === "string") data.shortDescription = utf8Text(req.body.shortDescription.trim()) || null;
  if (req.body?.approvedFacts !== undefined) data.approvedFacts = parseStringArray(req.body.approvedFacts);
  if (typeof req.body?.ctaLabel === "string") data.ctaLabel = utf8Text(req.body.ctaLabel.trim());
  if (typeof req.body?.ctaUrl === "string") data.ctaUrl = utf8Text(req.body.ctaUrl.trim());
  if (typeof req.body?.visualTheme === "string") data.visualTheme = utf8Text(req.body.visualTheme.trim()) || null;
  if (typeof req.body?.isActive === "boolean") data.isActive = req.body.isActive;

  try {
    const offer = await prisma.offer.update({
      where: { id },
      data,
      include: {
        landingPages: {
          orderBy: [{ publishedAt: "desc" }, { version: "desc" }],
          take: 1
        }
      }
    });
    logEvent("info", "offer.updated", { offerId: offer.id, slug: offer.slug });
    broadcastEvent("offers_updated");
    res.json({ message: "Oferta atualizada com sucesso.", offer: mapOffer(offer) });
  } catch (err) {
    if (isPrismaNotFoundError(err)) {
      res.status(404).json({ message: "Oferta nao encontrada." });
      return;
    }
    if (isPrismaUniqueError(err)) {
      res.status(409).json({ message: "Ja existe oferta com este slug." });
      return;
    }
    throw err;
  }
});

app.patch("/api/offers/:id/status", requireSession, async (req, res) => {
  const id = Number(req.params.id);
  const isActive = req.body?.isActive;
  if (!Number.isInteger(id) || id <= 0 || typeof isActive !== "boolean") {
    res.status(400).json({ message: "Payload invalido." });
    return;
  }

  try {
    const offer = await prisma.offer.update({
      where: { id },
      data: { isActive }
    });
    broadcastEvent("offers_updated");
    res.json({ message: "Status da oferta atualizado.", offer: mapOffer(offer) });
  } catch (err) {
    if (isPrismaNotFoundError(err)) {
      res.status(404).json({ message: "Oferta nao encontrada." });
      return;
    }
    throw err;
  }
});

app.delete("/api/offers/:id", requireSession, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ message: "ID de oferta invalido." });
    return;
  }

  try {
    const offer = await prisma.offer.delete({
      where: { id }
    });
    logEvent("info", "offer.deleted", { offerId: offer.id, slug: offer.slug });
    broadcastEvent("offers_updated");
    res.json({ message: "Oferta removida com sucesso." });
  } catch (err) {
    if (isPrismaNotFoundError(err)) {
      res.status(404).json({ message: "Oferta nao encontrada." });
      return;
    }
    throw err;
  }
});

app.get("/api/settings/landing-prompt", requireSession, async (_req, res) => {
  res.json(await getGlobalLandingPromptSettings());
});

app.put("/api/settings/landing-prompt", requireSession, async (req, res) => {
  const settings = await persistGlobalLandingPromptSettings(req.body);
  logEvent("info", "landing.prompt.global.updated", { updatedFields: Object.keys(req.body || {}) });
  res.json(settings);
});

app.get("/api/offers/:id/landing-prompt", requireSession, async (req, res) => {
  const offerId = Number(req.params.id);
  if (!Number.isInteger(offerId) || offerId <= 0) {
    res.status(400).json({ message: "Oferta invalida." });
    return;
  }
  res.json(await getOfferLandingPromptSettings(offerId));
});

app.put("/api/offers/:id/landing-prompt", requireSession, async (req, res) => {
  const offerId = Number(req.params.id);
  if (!Number.isInteger(offerId) || offerId <= 0) {
    res.status(400).json({ message: "Oferta invalida." });
    return;
  }
  const settings = await persistOfferLandingPromptSettings(offerId, req.body);
  logEvent("info", "landing.prompt.offer.updated", { offerId, updatedFields: Object.keys(req.body || {}) });
  res.json(settings);
});

app.post("/api/offers/:id/landing/generate", requireSession, async (req, res) => {
  const offerId = Number(req.params.id);
  if (!Number.isInteger(offerId) || offerId <= 0) {
    res.status(400).json({ message: "Oferta invalida." });
    return;
  }

  try {
    const page = await generateLandingPageForOffer(offerId);
    broadcastEvent("offers_updated");
    res.status(201).json({ message: "Landing gerada com sucesso.", landing: mapLandingPageSummary(page) });
  } catch (err) {
    res.status(500).json({ message: formatError(err) });
  }
});

app.post("/api/offers/:id/landing/publish", requireSession, async (req, res) => {
  const offerId = Number(req.params.id);
  const landingPageId = req.body?.landingPageId !== undefined ? Number(req.body.landingPageId) : undefined;
  if (!Number.isInteger(offerId) || offerId <= 0) {
    res.status(400).json({ message: "Oferta invalida." });
    return;
  }

  try {
    const page = await publishLandingPage(offerId, Number.isInteger(landingPageId) ? landingPageId : undefined);
    broadcastEvent("offers_updated");
    res.json({ message: "Landing publicada com sucesso.", landing: mapLandingPageSummary(page) });
  } catch (err) {
    res.status(400).json({ message: formatError(err) });
  }
});

app.get("/api/offers/:id/landing/versions", requireSession, async (req, res) => {
  const offerId = Number(req.params.id);
  if (!Number.isInteger(offerId) || offerId <= 0) {
    res.status(400).json({ message: "Oferta invalida." });
    return;
  }

  const pages = await prisma.landingPage.findMany({
    where: { offerId },
    orderBy: [{ version: "desc" }]
  });
  res.json({ versions: pages.map(mapLandingPageSummary) });
});

app.get("/api/offers/:id/landing/preview", requireSession, async (req, res) => {
  const offerId = Number(req.params.id);
  if (!Number.isInteger(offerId) || offerId <= 0) {
    res.status(400).json({ message: "Oferta invalida." });
    return;
  }

  const page = await prisma.landingPage.findFirst({
    where: { offerId },
    orderBy: [{ status: "asc" }, { version: "desc" }]
  });
  if (!page) {
    res.status(404).json({ message: "Nenhuma landing encontrada." });
    return;
  }
  res.json({ landing: mapLandingPageSummary(page) });
});

app.post("/api/landings/preview", requireSession, async (req, res) => {
  try {
    const offer = normalizeOfferPreviewPayload(req.body?.offer);
    const prompt = mergeLandingPromptPayload(await getGlobalLandingPromptSettings(), req.body?.prompt);
    const leadContext = normalizeLandingLeadContext(req.body?.leadContext);
    const landingCodeBundle = await generateLandingCodeBundleForOfferData({
      offer,
      promptConfig: prompt,
      leadContext,
      eventMeta: {
        eventPrefix: "landing.preview",
        offerId: null,
        slug: offer.slug
      }
    });
    const sectionsJson = buildFallbackLandingSectionsFromOffer({
      offer: {
        ...offer,
        ctaLabel: offer.ctaLabel,
        visualTheme: null
      }
    });

    res.json({
      offer: {
        id: 0,
        title: offer.title,
        slug: offer.slug,
        aliases: [],
        durationLabel: offer.durationLabel,
        modality: offer.modality,
        shortDescription: offer.shortDescription,
        approvedFacts: offer.approvedFacts,
        ctaLabel: offer.ctaLabel,
        ctaUrl: offer.ctaUrl,
        visualTheme: null,
        isActive: true,
        latestLanding: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      landing: {
        id: 0,
        offerId: 0,
        version: 0,
        status: "preview",
        sectionsJson,
        builderDocumentJson: buildLandingBuilderDocument({
          offer: {
            title: offer.title,
            slug: offer.slug,
            shortDescription: offer.shortDescription,
            durationLabel: offer.durationLabel,
            modality: offer.modality,
            approvedFacts: offer.approvedFacts,
            ctaLabel: offer.ctaLabel
          },
          sections: sectionsJson as Record<string, unknown>
        }),
        landingCodeBundleJson: landingCodeBundle,
        promptSnapshot: prompt,
        sourceFactsSnapshot: offer,
        publishedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    });
  } catch (err) {
    res.status(400).json({ message: formatError(err) });
  }
});

app.get("/api/landing-creation/sessions", requireSession, async (_req, res) => {
  const sessions = await prisma.landingCreationSession.findMany({
    orderBy: [{ updatedAt: "desc" }],
    take: 30
  });
  res.json({ sessions: sessions.map(mapLandingCreationSession) });
});

app.post("/api/landing-creation/sessions", requireSession, async (_req, res) => {
  try {
    const session = await createLandingCreationSession();
    broadcastEvent("landing_sessions_updated");
    res.status(201).json({ session: mapLandingCreationSession(session) });
  } catch (err) {
    res.status(500).json({ message: formatError(err) });
  }
});

app.get("/api/landing-creation/sessions/:id", requireSession, async (req, res) => {
  const sessionId = Number(req.params.id);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    res.status(400).json({ message: "Sessao invalida." });
    return;
  }
  try {
    const session = await getLandingCreationSessionOrThrow(sessionId);
    res.json({ session: mapLandingCreationSession(session) });
  } catch (err) {
    res.status(404).json({ message: formatError(err) });
  }
});

app.post("/api/landing-creation/sessions/:id/messages", requireSession, async (req, res) => {
  const sessionId = Number(req.params.id);
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  const absorbAskAnswer = typeof req.body?.absorbAskAnswer === "boolean" ? req.body.absorbAskAnswer : false;
  const askAnswers =
    typeof req.body?.askAnswers === "object" && req.body.askAnswers !== null
      ? Object.fromEntries(
          Object.entries(req.body.askAnswers as Record<string, unknown>)
            .map(([key, value]) => [key, typeof value === "string" ? utf8Text(value).trim() : ""])
            .filter(([, value]) => Boolean(value))
        )
      : null;
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    res.status(400).json({ message: "Sessao invalida." });
    return;
  }
  if (!message && (!askAnswers || Object.keys(askAnswers).length === 0)) {
    res.status(400).json({ message: "Mensagem obrigatoria." });
    return;
  }
  try {
    const session = await runLandingCreationChatTurn(sessionId, message, { absorbAskAnswer, askAnswers });
    broadcastEvent("landing_sessions_updated");
    res.json({ session: mapLandingCreationSession(session) });
  } catch (err) {
    res.status(500).json({ message: formatError(err) });
  }
});

app.put("/api/landing-creation/sessions/:id/prompt", requireSession, async (req, res) => {
  const sessionId = Number(req.params.id);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    res.status(400).json({ message: "Sessao invalida." });
    return;
  }
  try {
    const session = await saveLandingCreationPrompt(sessionId, req.body);
    broadcastEvent("landing_sessions_updated");
    res.json({ session: mapLandingCreationSession(session) });
  } catch (err) {
    res.status(400).json({ message: formatError(err) });
  }
});

app.post("/api/landing-creation/sessions/:id/preview", requireSession, async (req, res) => {
  const sessionId = Number(req.params.id);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    res.status(400).json({ message: "Sessao invalida." });
    return;
  }
  try {
    const session = await generateLandingPreviewForSession(sessionId, req.body);
    broadcastEvent("landing_sessions_updated");
    res.json({ session: mapLandingCreationSession(session) });
  } catch (err) {
    res.status(400).json({ message: formatError(err) });
  }
});

app.patch("/api/landing-creation/sessions/:id", requireSession, async (req, res) => {
  const sessionId = Number(req.params.id);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    res.status(400).json({ message: "Sessao invalida." });
    return;
  }

  try {
    const session = await getLandingCreationSessionOrThrow(sessionId);
    const updates: any = {};
    let nextDraft = normalizeLandingCreationDraft(session.offerDraftJson);

    if (req.body.offerDraft) {
      nextDraft = normalizeLandingCreationDraft(
        req.body.offerDraft,
        nextDraft
      );
      updates.offerDraftJson = nextDraft;
      updates.builderDraftJson = buildLandingBuilderDraftFromDraft(nextDraft) as unknown as object;
      updates.codeBundleDraftJson = buildDefaultLandingCodeBundleFromOffer({
        offer: {
          ...buildPreviewOfferFromDraft(nextDraft),
          approvedFacts: buildPreviewOfferFromDraft(nextDraft).approvedFacts,
          ctaLabel: buildPreviewOfferFromDraft(nextDraft).ctaLabel,
          visualTheme: buildPreviewOfferFromDraft(nextDraft).visualTheme,
          colorPalette: nextDraft.colorPalette,
          typographyStyle: nextDraft.typographyStyle,
          layoutStyle: nextDraft.layoutStyle
        },
        summary: "Bundle atualizado automaticamente a partir das alteracoes manuais do draft.",
        source: "fallback"
      }) as unknown as object;
    }

    if (req.body.promptDraft) {
      updates.promptDraftJson = req.body.promptDraft;
    }

    const updated = await prisma.landingCreationSession.update({
      where: { id: sessionId },
      data: updates
    });

    broadcastEvent("landing_sessions_updated");
    res.json({ session: mapLandingCreationSession(updated) });
  } catch (err) {
    res.status(500).json({ message: formatError(err) });
  }
});

app.delete("/api/landing-creation/sessions/:id", requireSession, async (req, res) => {
  const sessionId = Number(req.params.id);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    res.status(400).json({ message: "Sessao invalida." });
    return;
  }
  try {
    await prisma.landingCreationSession.deleteMany({ where: { id: sessionId } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: formatError(err) });
  }
});

app.post("/api/landing-creation/sessions/:id/publish", requireSession, async (req, res) => {
  const sessionId = Number(req.params.id);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    res.status(400).json({ message: "Sessao invalida." });
    return;
  }
  try {
    const result = await publishLandingCreationSession(sessionId, req.body);
    broadcastEvent("landing_sessions_updated");
    broadcastEvent("offers_updated");
    res.json({
      session: mapLandingCreationSession(result.session),
      landing: mapLandingPageSummary(result.landingPage)
    });
  } catch (err) {
    res.status(400).json({ message: formatError(err) });
  }
});

app.get("/api/offers/:id/landing/metrics", requireSession, async (req, res) => {
  const offerId = Number(req.params.id);
  if (!Number.isInteger(offerId) || offerId <= 0) {
    res.status(400).json({ message: "Oferta invalida." });
    return;
  }

  const [deliveries, views, clicks] = await Promise.all([
    prisma.landingDelivery.count({ where: { offerId } }),
    prisma.landingEvent.count({ where: { delivery: { offerId }, eventType: "view" } }),
    prisma.landingEvent.count({ where: { delivery: { offerId }, eventType: "click" } })
  ]);
  res.json({
    deliveries,
    views,
    clicks,
    clickRate: deliveries > 0 ? Number(((clicks / deliveries) * 100).toFixed(2)) : 0
  });
});

app.get("/api/public/landings/:slug", async (req, res) => {
  const slug = normalizeSlug(req.params.slug || "");
  const token = typeof req.query.t === "string" ? req.query.t : "";
  const verified = token ? verifyLandingDeliveryToken(token) : null;

  const offer = await prisma.offer.findUnique({
    where: { slug },
    include: {
      landingPages: {
        where: { status: "published" },
        orderBy: { publishedAt: "desc" },
        take: 1
      }
    }
  });

  if (!offer || !offer.landingPages[0]) {
    res.status(404).json({ message: "Landing nao encontrada." });
    return;
  }

  const page = offer.landingPages[0];
  res.json({
    offer: mapOffer(offer),
    landing: mapLandingPageSummary(page),
    trackingToken: verified ? token : null
  });
});

app.post("/api/public/landings/view", async (req, res) => {
  const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  const verified = verifyLandingDeliveryToken(token);
  if (!verified) {
    res.status(400).json({ message: "Token invalido." });
    return;
  }

  const delivery = await prisma.landingDelivery.findFirst({
    where: {
      token,
      contactId: verified.contactId,
      offerId: verified.offerId,
      landingPageId: verified.landingPageId
    }
  });
  if (!delivery) {
    res.status(404).json({ message: "Entrega nao encontrada." });
    return;
  }

  await prisma.landingDelivery.update({
    where: { id: delivery.id },
    data: { lastViewedAt: new Date() }
  });
  await prisma.landingEvent.create({
    data: {
      deliveryId: delivery.id,
      eventType: "view",
      requestMeta: { path: "/api/public/landings/view" },
      userAgent: req.get("user-agent") || null,
      ip: req.ip || null,
      referrer: req.get("referer") || null
    }
  });
  logEvent("info", "landing.viewed", {
    contactId: delivery.contactId,
    offerId: delivery.offerId,
    landingPageId: delivery.landingPageId,
    path: "/api/public/landings/view"
  });
  res.json({ success: true });
});

app.post("/api/public/landings/click", async (req, res) => {
  const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  const verified = verifyLandingDeliveryToken(token);
  if (!verified) {
    res.status(400).json({ message: "Token invalido." });
    return;
  }

  const delivery = await prisma.landingDelivery.findFirst({
    where: {
      token,
      contactId: verified.contactId,
      offerId: verified.offerId,
      landingPageId: verified.landingPageId
    },
    include: { offer: true }
  });
  if (!delivery) {
    res.status(404).json({ message: "Entrega nao encontrada." });
    return;
  }

  await prisma.landingDelivery.update({
    where: { id: delivery.id },
    data: { lastClickedAt: new Date() }
  });
  await prisma.landingEvent.create({
    data: {
      deliveryId: delivery.id,
      eventType: "click",
      requestMeta: { path: "/api/public/landings/click" },
      userAgent: req.get("user-agent") || null,
      ip: req.ip || null,
      referrer: req.get("referer") || null
    }
  });
  logEvent("info", "landing.clicked", {
    contactId: delivery.contactId,
    offerId: delivery.offerId,
    landingPageId: delivery.landingPageId,
    path: "/api/public/landings/click"
  });
  res.json({ success: true, redirectUrl: delivery.offer.ctaUrl });
});

// ============================================
// ANALYTICS ENDPOINTS
// ============================================

app.get("/api/analytics/messages-per-day", requireSession, async (req, res) => {
  const days = Math.max(1, Math.min(90, Number(req.query.days || 14)));
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);

  const messages = await prisma.message.findMany({
    where: { createdAt: { gte: since } },
    select: { direction: true, createdAt: true }
  });

  const byDay: Record<string, { inbound: number; outbound: number }> = {};
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    const key = d.toISOString().slice(0, 10);
    byDay[key] = { inbound: 0, outbound: 0 };
  }

  for (const m of messages) {
    const key = new Date(m.createdAt).toISOString().slice(0, 10);
    if (byDay[key]) {
      if (m.direction === "in") byDay[key].inbound++;
      else byDay[key].outbound++;
    }
  }

  res.json({
    data: Object.entries(byDay).map(([date, counts]) => ({
      date,
      ...counts,
      total: counts.inbound + counts.outbound
    }))
  });
});

app.get("/api/analytics/top-contacts", requireSession, async (_req, res) => {
  const contacts = await prisma.contact.findMany({
    take: 10,
    orderBy: { lastInteractionAt: "desc" },
    include: {
      _count: { select: { messages: true } },
      stage: { select: { name: true, color: true } }
    }
  });

  res.json({
    data: contacts.map((c) => ({
      id: c.id,
      name: c.name || c.waId,
      waId: c.waId,
      messageCount: c._count.messages,
      stage: c.stage?.name || null,
      stageColor: c.stage?.color || null,
      lastInteraction: c.lastInteractionAt
    }))
  });
});

app.get("/api/analytics/overview", requireSession, async (_req, res) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const [totalContacts, totalMessages, todayMessages, weekMessages, avgResponseMs] = await Promise.all([
    prisma.contact.count(),
    prisma.message.count(),
    prisma.message.count({ where: { createdAt: { gte: today } } }),
    prisma.message.count({ where: { createdAt: { gte: weekAgo } } }),
    // Average response time approximation: avg gap between in and next out per contact
    prisma.$queryRawUnsafe<Array<{ avg_seconds: number }>>(
      `SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (o."createdAt" - i."createdAt"))), 0) as avg_seconds
       FROM "Message" i
       JOIN LATERAL (
         SELECT "createdAt" FROM "Message" 
         WHERE "contactId" = i."contactId" AND direction = 'out' AND "createdAt" > i."createdAt"
         ORDER BY "createdAt" ASC LIMIT 1
       ) o ON true
       WHERE i.direction = 'in' AND i."createdAt" > NOW() - INTERVAL '7 days'`
    ).catch(() => [{ avg_seconds: 0 }])
  ]);

  const avgResponseSeconds = Math.round(Number(avgResponseMs[0]?.avg_seconds || 0));

  res.json({
    totalContacts,
    totalMessages,
    todayMessages,
    weekMessages,
    avgResponseSeconds
  });
});

// ============================================
// MESSAGE TEMPLATES ENDPOINTS
// ============================================

app.get("/api/templates", requireSession, async (_req, res) => {
  const templates = await prisma.messageTemplate.findMany({
    orderBy: { updatedAt: "desc" }
  });
  res.json({ templates });
});

app.post("/api/templates", requireSession, async (req, res) => {
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  const category = typeof req.body?.category === "string" ? req.body.category.trim() : "geral";

  if (!title || !body) {
    res.status(400).json({ message: "TÃ­tulo e conteÃºdo sÃ£o obrigatÃ³rios." });
    return;
  }

  const template = await prisma.messageTemplate.create({
    data: { title, body, category }
  });
  broadcastEvent("templates_updated");
  res.status(201).json({ message: "Template criado.", template });
});

app.put("/api/templates/:id", requireSession, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ message: "ID invÃ¡lido." });
    return;
  }

  const data: Record<string, unknown> = {};
  if (typeof req.body?.title === "string") data.title = req.body.title.trim();
  if (typeof req.body?.body === "string") data.body = req.body.body.trim();
  if (typeof req.body?.category === "string") data.category = req.body.category.trim();

  if (Object.keys(data).length === 0) {
    res.status(400).json({ message: "Nenhuma alteraÃ§Ã£o." });
    return;
  }

  try {
    const template = await prisma.messageTemplate.update({ where: { id }, data });
    broadcastEvent("templates_updated");
    res.json({ message: "Template atualizado.", template });
  } catch (err) {
    if (isPrismaNotFoundError(err)) {
      res.status(404).json({ message: "Template nÃ£o encontrado." });
      return;
    }
    throw err;
  }
});

app.delete("/api/templates/:id", requireSession, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ message: "ID invÃ¡lido." });
    return;
  }

  const deleted = await prisma.messageTemplate.deleteMany({ where: { id } });
  if (deleted.count === 0) {
    res.status(404).json({ message: "Template nÃ£o encontrado." });
    return;
  }
  broadcastEvent("templates_updated");
  res.json({ message: "Template removido." });
});

// ============================================
// TAGS ENDPOINTS
// ============================================

app.get("/api/tags", requireSession, async (_req, res) => {
  const tags = await prisma.tag.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { contacts: true } } }
  });
  res.json({
    tags: tags.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
      contactCount: t._count.contacts,
      createdAt: t.createdAt
    }))
  });
});

app.post("/api/tags", requireSession, async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const color = typeof req.body?.color === "string" ? req.body.color.trim() : "#06b6d4";

  if (!name) {
    res.status(400).json({ message: "Nome da tag Ã© obrigatÃ³rio." });
    return;
  }

  try {
    const tag = await prisma.tag.create({ data: { name, color } });
    broadcastEvent("tags_updated");
    res.status(201).json({ message: "Tag criada.", tag });
  } catch (err) {
    if (isPrismaUniqueError(err)) {
      res.status(409).json({ message: "Tag jÃ¡ existe." });
      return;
    }
    throw err;
  }
});

app.delete("/api/tags/:id", requireSession, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ message: "ID invÃ¡lido." });
    return;
  }

  const deleted = await prisma.tag.deleteMany({ where: { id } });
  if (deleted.count === 0) {
    res.status(404).json({ message: "Tag nÃ£o encontrada." });
    return;
  }
  broadcastEvent("tags_updated");
  res.json({ message: "Tag removida." });
});

app.post("/api/crm/leads/:id/tags", requireSession, async (req, res) => {
  const leadId = Number(req.params.id);
  const tagId = Number(req.body?.tagId);
  if (!Number.isInteger(leadId) || !Number.isInteger(tagId) || leadId <= 0 || tagId <= 0) {
    res.status(400).json({ message: "Lead e tag sÃ£o obrigatÃ³rios." });
    return;
  }

  try {
    await prisma.contactTag.create({ data: { contactId: leadId, tagId } });
    broadcastEvent("tags_updated");
    broadcastEvent("lead_profile_updated", { leadId });
    res.status(201).json({ message: "Tag adicionada ao lead." });
  } catch (err) {
    if (isPrismaUniqueError(err)) {
      res.status(409).json({ message: "Lead jÃ¡ possui essa tag." });
      return;
    }
    throw err;
  }
});

app.delete("/api/crm/leads/:id/tags/:tagId", requireSession, async (req, res) => {
  const leadId = Number(req.params.id);
  const tagId = Number(req.params.tagId);
  if (!Number.isInteger(leadId) || !Number.isInteger(tagId)) {
    res.status(400).json({ message: "ParÃ¢metros invÃ¡lidos." });
    return;
  }

  await prisma.contactTag.deleteMany({ where: { contactId: leadId, tagId } });
  broadcastEvent("tags_updated");
  broadcastEvent("lead_profile_updated", { leadId });
  res.json({ message: "Tag removida do lead." });
});

app.get("/api/crm/leads/:id/tags", requireSession, async (req, res) => {
  const leadId = Number(req.params.id);
  if (!Number.isInteger(leadId) || leadId <= 0) {
    res.status(400).json({ message: "ID invÃ¡lido." });
    return;
  }

  const contactTags = await prisma.contactTag.findMany({
    where: { contactId: leadId },
    include: { tag: true }
  });

  res.json({ tags: contactTags.map((ct) => ct.tag) });
});

// ============================================
// BOT PERSONA PER LEAD
// ============================================

app.patch("/api/crm/leads/:id/persona", requireSession, async (req, res) => {
  const leadId = Number(req.params.id);
  const persona = typeof req.body?.persona === "string" ? req.body.persona.trim() : null;
  if (!Number.isInteger(leadId) || leadId <= 0) {
    res.status(400).json({ message: "ID de lead invÃ¡lido." });
    return;
  }

  try {
    const lead = await prisma.contact.update({
      where: { id: leadId },
      data: { customBotPersona: persona || null },
      include: { stage: true }
    });
    res.json({ message: "Persona atualizada.", lead: mapLeadDetails(lead) });
  } catch (err) {
    if (isPrismaNotFoundError(err)) {
      res.status(404).json({ message: "Lead nÃ£o encontrado." });
      return;
    }
    throw err;
  }
});

// ============================================
// CALENDAR / TASKS OVERVIEW
// ============================================

app.get("/api/calendar/tasks", requireSession, async (req, res) => {
  const month = Number(req.query.month || (new Date().getMonth() + 1));
  const year = Number(req.query.year || new Date().getFullYear());

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  const tasks = await prisma.task.findMany({
    where: {
      dueAt: { gte: startDate, lte: endDate }
    },
    include: {
      contact: { select: { id: true, name: true, waId: true } }
    },
    orderBy: { dueAt: "asc" }
  });

  res.json({
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      dueAt: t.dueAt,
      status: t.status,
      priority: t.priority,
      contactName: t.contact.name || t.contact.waId,
      contactId: t.contact.id,
      completedAt: t.completedAt
    }))
  });
});

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

app.get("/api/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  const requestId = (req as express.Request & { meta?: RequestMeta }).meta?.requestId || "unknown";
  const rawBody = (req as express.Request & { meta?: RequestMeta }).meta?.rawBody;

  if (!isValidMetaWebhookSignature(req, rawBody)) {
    logEvent("warn", "webhook.signature.invalid", { requestId });
    res.sendStatus(403);
    return;
  }

  const created = await enqueueWebhookEvent(req.body, requestId);
  if (created) {
    broadcastEvent("webhook_event_updated", {
      webhookEventId: created.id,
      status: created.status,
      attemptCount: created.attemptCount,
      waId: created.waId,
      waMessageId: created.waMessageId
    });
  }
  logEvent("info", "webhook.enqueued", {
    requestId,
    eventId: created?.id ?? null,
    waId: created?.waId ?? null,
    waMessageId: created?.waMessageId ?? null,
    deduped: !created
  });

  res.sendStatus(200);
});

app.post("/api/webhook", async (req, res) => {
  const requestId = (req as express.Request & { meta?: RequestMeta }).meta?.requestId || "unknown";
  const rawBody = (req as express.Request & { meta?: RequestMeta }).meta?.rawBody;

  if (!isValidMetaWebhookSignature(req, rawBody)) {
    logEvent("warn", "webhook.signature.invalid", { requestId });
    res.sendStatus(403);
    return;
  }

  const created = await enqueueWebhookEvent(req.body, requestId);
  if (created) {
    broadcastEvent("webhook_event_updated", {
      webhookEventId: created.id,
      status: created.status,
      attemptCount: created.attemptCount,
      waId: created.waId,
      waMessageId: created.waMessageId
    });
  }
  logEvent("info", "webhook.enqueued", {
    requestId,
    eventId: created?.id ?? null,
    waId: created?.waId ?? null,
    waMessageId: created?.waMessageId ?? null,
    deduped: !created
  });

  res.sendStatus(200);
});

app.get("/api/webhook/events", requireSession, async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.max(1, Math.min(100, Number(req.query.limit || 20)));

  const where = status
    ? { status }
    : undefined;

  const [total, events] = await Promise.all([
    prisma.webhookEvent.count({ where }),
    prisma.webhookEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit
    })
  ]);

  res.json({
    page,
    limit,
    total,
    events
  });
});

app.post("/api/webhook/events/:id/replay", requireSession, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ message: "ID de evento invÃ¡lido." });
    return;
  }

  const existing = await prisma.webhookEvent.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ message: "Evento nÃ£o encontrado." });
    return;
  }

  if (existing.status === "processing") {
    res.status(409).json({ message: "Evento em processamento." });
    return;
  }

  const replay = await prisma.webhookEvent.update({
    where: { id },
    data: {
      status: "pending",
      nextAttemptAt: new Date(),
      lastError: null,
      processedAt: null,
      lockedAt: null
    }
  });

  broadcastEvent("webhook_event_updated", {
    webhookEventId: replay.id,
    status: replay.status,
    attemptCount: replay.attemptCount,
    waId: replay.waId,
    waMessageId: replay.waMessageId
  });
  res.json({ message: "Replay agendado com sucesso.", event: replay });
});

let webhookWorkerInProgress = false;

function logEvent(level: "info" | "warn" | "error", event: string, data?: Record<string, unknown>): void {
  const output = {
    ts: new Date().toISOString(),
    level,
    event,
    ...data
  };

  const payload = JSON.stringify(output);
  if (level === "error") {
    console.error(payload);
  } else if (level === "warn") {
    console.warn(payload);
  } else {
    console.log(payload);
  }

  const requestId = typeof data?.requestId === "string" ? data.requestId : null;
  const waId = typeof data?.waId === "string" ? data.waId : null;
  const contactId = typeof data?.contactId === "number" && Number.isInteger(data.contactId) ? data.contactId : null;
  const webhookEventId = typeof data?.eventId === "number" && Number.isInteger(data.eventId) ? data.eventId : null;
  const message = typeof data?.message === "string" ? data.message : null;
  const method = typeof data?.method === "string" ? data.method : null;
  const path = typeof data?.path === "string" ? data.path : null;
  const statusCode = typeof data?.statusCode === "number" && Number.isInteger(data.statusCode) ? data.statusCode : null;
  const durationMs = typeof data?.durationMs === "number" && Number.isInteger(data.durationMs) ? data.durationMs : null;
  const ip = typeof data?.ip === "string" ? data.ip : null;
  const userAgent = typeof data?.userAgent === "string" ? data.userAgent : null;
  const clientOsRaw = typeof data?.clientOs === "string" ? data.clientOs : null;
  const clientOs = clientOsRaw || inferClientOs(userAgent);

  void prisma.appLog.create({
    data: {
      level,
      event,
      method,
      path,
      statusCode,
      durationMs,
      ip,
      userAgent,
      clientOs,
      requestId,
      waId,
      contactId,
      webhookEventId,
      message,
      data: (data || {}) as object
    }
  }).catch((err) => {
    console.error("[LOG_PERSIST_ERROR]", formatError(err));
  });
}

function redactSensitive(input: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  const sensitiveKeys = new Set([
    "password",
    "pass",
    "token",
    "authorization",
    "apiKey",
    "openai_api_key",
    "whatsapp_token",
    "session_secret"
  ]);

  for (const [key, value] of Object.entries(input)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.has(lowerKey) || lowerKey.includes("token") || lowerKey.includes("secret") || lowerKey.includes("password")) {
      redacted[key] = "[REDACTED]";
      continue;
    }

    if (typeof value === "string") {
      redacted[key] = value.length > 300 ? `${value.slice(0, 300)}...[TRUNCATED]` : value;
      continue;
    }

    redacted[key] = value;
  }

  return redacted;
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "unknown_error";
}

function buildLogsWhereFromQuery(query: Record<string, unknown>): Record<string, unknown> {
  const level = typeof query.level === "string" ? query.level.trim().toLowerCase() : "";
  const status = typeof query.status === "string" ? query.status.trim().toLowerCase() : "";
  const event = typeof query.event === "string" ? query.event.trim() : "";
  const method = typeof query.method === "string" ? query.method.trim().toUpperCase() : "";
  const path = typeof query.path === "string" ? query.path.trim() : "";
  const requestId = typeof query.requestId === "string" ? query.requestId.trim() : "";
  const waId = typeof query.waId === "string" ? query.waId.trim() : "";
  const ip = typeof query.ip === "string" ? query.ip.trim() : "";
  const clientOs = typeof query.clientOs === "string" ? query.clientOs.trim() : "";
  const search = typeof query.search === "string" ? query.search.trim() : "";
  const from = typeof query.from === "string" ? query.from.trim() : "";
  const to = typeof query.to === "string" ? query.to.trim() : "";
  const contactId = query.contactId !== undefined ? Number(query.contactId) : undefined;
  const statusCode = query.statusCode !== undefined ? Number(query.statusCode) : undefined;

  const where: Record<string, unknown> = {};
  if (level && ["info", "warn", "error"].includes(level)) where.level = level;
  if (event) where.event = { contains: event, mode: "insensitive" };
  if (method) where.method = method;
  if (path) where.path = { contains: path, mode: "insensitive" };
  if (requestId) where.requestId = { contains: requestId, mode: "insensitive" };
  if (waId) where.waId = { contains: waId, mode: "insensitive" };
  if (ip) where.ip = { contains: ip, mode: "insensitive" };
  if (clientOs) where.clientOs = { contains: clientOs, mode: "insensitive" };
  if (Number.isInteger(contactId) && Number(contactId) > 0) where.contactId = Number(contactId);
  if (Number.isInteger(statusCode) && Number(statusCode) >= 100 && Number(statusCode) <= 599) where.statusCode = Number(statusCode);
  if (status === "success" || status === "sucesso") {
    where.statusCode = { gte: 100, lt: 400 };
  }
  if (status === "fail" || status === "falha") {
    where.statusCode = { gte: 400, lte: 599 };
  }

  const tsFilter: Record<string, unknown> = {};
  if (from) {
    const fromDate = new Date(from);
    if (!Number.isNaN(fromDate.getTime())) tsFilter.gte = fromDate;
  }
  if (to) {
    const toDate = new Date(to);
    if (!Number.isNaN(toDate.getTime())) tsFilter.lte = toDate;
  }
  if (Object.keys(tsFilter).length > 0) where.ts = tsFilter;

  if (search) {
    where.OR = [
      { event: { contains: search, mode: "insensitive" } },
      { path: { contains: search, mode: "insensitive" } },
      { message: { contains: search, mode: "insensitive" } },
      { requestId: { contains: search, mode: "insensitive" } },
      { waId: { contains: search, mode: "insensitive" } },
      { ip: { contains: search, mode: "insensitive" } },
      { clientOs: { contains: search, mode: "insensitive" } }
    ];
  }

  return where;
}

function shouldSkipHttpRequestLog(method: string, path: string, statusCode: number): boolean {
  if (method.toUpperCase() === "GET" && statusCode < 400) return true;
  if (method.toUpperCase() !== "GET") return false;
  if (statusCode >= 400) return false;
  return LOG_SKIP_GET_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix));
}

function inferClientOs(userAgent?: string | null): string | null {
  if (!userAgent) return null;
  const source = userAgent.toLowerCase();

  if (source.includes("windows")) return "Windows";
  if (source.includes("android")) return "Android";
  if (source.includes("iphone") || source.includes("ipad") || source.includes("ios")) return "iOS";
  if (source.includes("mac os") || source.includes("macintosh")) return "macOS";
  if (source.includes("linux")) return "Linux";

  return "Other";
}

function shouldRetryStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

type FetchWithRetryOptions = {
  maxAttempts?: number;
  timeoutMs?: number;
};

function buildRequestSignal(initSignal: AbortSignal | null | undefined, timeoutMs?: number): {
  signal: AbortSignal | undefined;
  cleanup: () => void;
} {
  if (!timeoutMs || timeoutMs <= 0) {
    return {
      signal: initSignal || undefined,
      cleanup: () => undefined
    };
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort(new Error(`Request timeout after ${timeoutMs}ms`));
  }, timeoutMs);

  const abortFromParent = () => {
    const parentReason = "reason" in (initSignal as AbortSignal)
      ? (initSignal as AbortSignal & { reason?: unknown }).reason
      : undefined;
    controller.abort(parentReason);
  };

  if (initSignal) {
    if (initSignal.aborted) {
      abortFromParent();
    } else {
      initSignal.addEventListener("abort", abortFromParent, { once: true });
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeoutHandle);
      if (initSignal) {
        initSignal.removeEventListener("abort", abortFromParent);
      }
    }
  };
}

async function fetchWithRetry(url: string, init: RequestInit, options: number | FetchWithRetryOptions = 3): Promise<Response> {
  let lastError: unknown = null;
  const normalizedOptions = typeof options === "number" ? { maxAttempts: options } : options;
  const maxAttempts = Math.max(1, normalizedOptions.maxAttempts || 3);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { signal, cleanup } = buildRequestSignal(init.signal, normalizedOptions.timeoutMs);
    try {
      const response = await fetch(url, {
        ...init,
        signal
      });
      cleanup();

      if (!shouldRetryStatus(response.status) || attempt === maxAttempts) {
        return response;
      }

      const waitMs = Math.min(8000, 500 * 2 ** (attempt - 1));
      await delay(waitMs);
    } catch (err) {
      cleanup();
      lastError = err;
      if (attempt >= maxAttempts) {
        throw err;
      }
      const waitMs = Math.min(8000, 500 * 2 ** (attempt - 1));
      await delay(waitMs);
    }
  }

  throw new Error(formatError(lastError));
}

function utf8Text(input: string): string {
  return Buffer.from(input, "utf8").toString("utf8").normalize("NFC");
}

function normalizeSlug(input: string): string {
  return utf8Text(input)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function normalizeSearchText(input: string): string {
  return normalizeSlug(input).replace(/-/g, " ").trim();
}

function normalizeOfferPreviewPayload(payload: unknown): {
  title: string;
  slug: string;
  shortDescription: string | null;
  durationLabel: string | null;
  modality: string | null;
  approvedFacts: string[];
  ctaLabel: string;
  ctaUrl: string;
} {
  const body = typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : {};
  const title = typeof body.title === "string" ? utf8Text(body.title).trim() : "";
  const slug = normalizeSlug(typeof body.slug === "string" ? body.slug : title);
  const approvedFacts = parseStringArray(body.approvedFacts);
  const ctaLabel = typeof body.ctaLabel === "string" ? utf8Text(body.ctaLabel).trim() : "";
  const ctaUrl = typeof body.ctaUrl === "string" ? utf8Text(body.ctaUrl).trim() : "";

  if (!title) throw new Error("Informe o titulo da oferta para gerar o preview.");
  if (!slug) throw new Error("Informe um slug valido para gerar o preview.");
  if (!ctaLabel) throw new Error("Informe o texto do CTA para gerar o preview.");
  if (!ctaUrl) throw new Error("Informe a URL do CTA para gerar o preview.");
  if (!approvedFacts.length) throw new Error("Informe ao menos um fato aprovado para gerar o preview.");

  return {
    title,
    slug,
    shortDescription: typeof body.shortDescription === "string" && body.shortDescription.trim() ? utf8Text(body.shortDescription.trim()) : null,
    durationLabel: typeof body.durationLabel === "string" && body.durationLabel.trim() ? utf8Text(body.durationLabel.trim()) : null,
    modality: typeof body.modality === "string" && body.modality.trim() ? utf8Text(body.modality.trim()) : null,
    approvedFacts,
    ctaLabel,
    ctaUrl
  };
}

function normalizeLandingLeadContext(payload: unknown): {
  interestedCourse?: string | null;
  courseMode?: string | null;
  objective?: string | null;
  level?: string | null;
  summary?: string | null;
} {
  const body = typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : {};
  const pick = (key: string) =>
    typeof body[key] === "string" && String(body[key]).trim()
      ? utf8Text(String(body[key]).trim())
      : null;

  return {
    interestedCourse: pick("interestedCourse"),
    courseMode: pick("courseMode"),
    objective: pick("objective"),
    level: pick("level"),
    summary: pick("summary")
  };
}

function buildDefaultLandingPlannerState(): LandingPlannerState {
  return {
    planSummary: "",
    promptDepth: "shallow",
    shouldAsk: false,
    askQueue: [],
    readyForVisualGeneration: false,
    activeMessageId: null,
    activeQuestionId: null,
    stageSummary: ""
  };
}

function normalizeLandingPlannerAskQueue(payload: unknown): LandingPlannerAsk[] {
  if (!Array.isArray(payload)) return [];
  const asks: LandingPlannerAsk[] = [];
  for (const item of payload) {
    const body = typeof item === "object" && item !== null ? item as Record<string, unknown> : {};
    const id = typeof body.id === "string" ? utf8Text(body.id).trim() : "";
    const label = typeof body.label === "string" ? utf8Text(body.label).trim() : "";
    const question = typeof body.question === "string" ? utf8Text(body.question).trim() : "";
    const placeholder = typeof body.placeholder === "string" ? utf8Text(body.placeholder).trim() : "";
    const helperText = typeof body.helperText === "string" ? utf8Text(body.helperText).trim() : undefined;
    const options = Array.isArray(body.options)
      ? body.options.map((value) => typeof value === "string" ? utf8Text(value).trim() : "").filter(Boolean)
      : [];
    if (!id || !question) continue;
    asks.push({
      id,
      label: label || "Pergunta da Lume",
      question,
      placeholder,
      options,
      ...(helperText ? { helperText } : {})
    });
  }
  return asks;
}

function normalizeLandingPlannerState(payload: unknown, fallback?: LandingPlannerState): LandingPlannerState {
  const body = typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : {};
  const base = fallback ? { ...fallback } : buildDefaultLandingPlannerState();
  const promptDepth = typeof body.promptDepth === "string" && ["shallow", "medium", "deep"].includes(body.promptDepth)
    ? body.promptDepth as LandingPlannerPromptDepth
    : base.promptDepth;

  return {
    planSummary: typeof body.planSummary === "string" ? utf8Text(body.planSummary).trim() : base.planSummary,
    promptDepth,
    shouldAsk: typeof body.shouldAsk === "boolean" ? body.shouldAsk : base.shouldAsk,
    askQueue: body.askQueue !== undefined ? normalizeLandingPlannerAskQueue(body.askQueue) : base.askQueue,
    readyForVisualGeneration: typeof body.readyForVisualGeneration === "boolean"
      ? body.readyForVisualGeneration
      : base.readyForVisualGeneration,
    activeMessageId: typeof body.activeMessageId === "string" && body.activeMessageId.trim()
      ? utf8Text(body.activeMessageId).trim()
      : base.activeMessageId,
    activeQuestionId: typeof body.activeQuestionId === "string" && body.activeQuestionId.trim()
      ? utf8Text(body.activeQuestionId).trim()
      : base.activeQuestionId,
    stageSummary: typeof body.stageSummary === "string" ? utf8Text(body.stageSummary).trim() : base.stageSummary
  };
}

function buildDefaultLandingCreationDraft(): LandingCreationDraftValues {
  return {
    title: "",
    slug: "",
    aliases: [],
    durationLabel: "",
    modality: "",
    shortDescription: "",
    approvedFacts: [],
    ctaLabel: "",
    ctaUrl: "",
    visualTheme: "",
    colorPalette: "",
    typographyStyle: "",
    layoutStyle: "",
    isActive: true,
    planner: buildDefaultLandingPlannerState()
  };
}

function normalizeLandingCreationDraft(payload: unknown, fallback?: LandingCreationDraftValues): LandingCreationDraftValues {
  const base = fallback ? { ...fallback } : buildDefaultLandingCreationDraft();
  const body = typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : {};

  if (typeof body.title === "string") base.title = utf8Text(body.title).trim();
  if (typeof body.slug === "string") base.slug = normalizeSlug(body.slug);
  if (body.aliases !== undefined) base.aliases = parseStringArray(body.aliases);
  if (typeof body.durationLabel === "string") base.durationLabel = utf8Text(body.durationLabel).trim();
  if (typeof body.modality === "string") base.modality = utf8Text(body.modality).trim();
  if (typeof body.shortDescription === "string") base.shortDescription = utf8Text(body.shortDescription).trim();
  if (body.approvedFacts !== undefined) base.approvedFacts = parseStringArray(body.approvedFacts);
  if (typeof body.ctaLabel === "string") base.ctaLabel = utf8Text(body.ctaLabel).trim();
  if (typeof body.ctaUrl === "string") base.ctaUrl = utf8Text(body.ctaUrl).trim();
  if (typeof body.visualTheme === "string") base.visualTheme = utf8Text(body.visualTheme).trim();
  if (typeof body.colorPalette === "string") base.colorPalette = utf8Text(body.colorPalette).trim();
  if (typeof body.typographyStyle === "string") base.typographyStyle = utf8Text(body.typographyStyle).trim();
  if (typeof body.layoutStyle === "string") base.layoutStyle = utf8Text(body.layoutStyle).trim();
  if (typeof body.isActive === "boolean") base.isActive = body.isActive;
  if (body.planner !== undefined) base.planner = normalizeLandingPlannerState(body.planner, base.planner);

  if (!base.slug && base.title) {
    base.slug = normalizeSlug(base.title);
  }

  return base;
}

function buildLandingDesignSummary(input: {
  visualTheme?: string | null;
  colorPalette?: string | null;
  typographyStyle?: string | null;
  layoutStyle?: string | null;
}): string {
  const parts = [
    input.visualTheme?.trim() || "",
    input.colorPalette?.trim() ? `Cores: ${input.colorPalette.trim()}` : "",
    input.typographyStyle?.trim() ? `Tipografia: ${input.typographyStyle.trim()}` : "",
    input.layoutStyle?.trim() ? `Layout: ${input.layoutStyle.trim()}` : "",
  ].filter(Boolean);

  return parts.join(" | ");
}

function isProcessOrMetaFact(value: string): boolean {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  if (!normalized) return true;

  return [
    "o operador pediu",
    "publico-alvo confirmado",
    "publico alvo confirmado",
    "objetivo confirmado",
    "paleta confirmada",
    "tipografia confirmada",
    "layout confirmado",
    "direcao visual",
    "direcao visual desejada",
    "prompt do usuario",
    "briefing",
    "contexto capturado",
    "resposta do usuario"
  ].some((entry) => normalized.includes(entry));
}

function sanitizeApprovedFactsForLanding(facts: string[], fallbackText: string): string[] {
  const seen = new Set<string>();
  const sanitized = facts
    .map((fact) => utf8Text(fact).trim())
    .filter((fact) => fact.length > 0)
    .filter((fact) => !isProcessOrMetaFact(fact))
    .filter((fact) => {
      const key = fact.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return sanitized.length ? sanitized : [fallbackText];
}

function resolveFallbackThemeTokens(input: {
  colorPalette?: string | null;
  visualTheme?: string | null;
}): {
  accent: string;
  surface: string;
  canvas: string;
  text: string;
  muted: string;
} {
  const basis = `${input.colorPalette || ""} ${input.visualTheme || ""}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (basis.includes("verde")) {
    return {
      accent: "#34d399",
      surface: "#052e2b",
      canvas: "#021916",
      text: "#ecfdf5",
      muted: "#9fdcc8"
    };
  }

  if (basis.includes("laranja") || basis.includes("dourado") || basis.includes("amarelo")) {
    return {
      accent: "#f59e0b",
      surface: "#3b1900",
      canvas: "#140b02",
      text: "#fff7ed",
      muted: "#fdba74"
    };
  }

  if (basis.includes("vermelho")) {
    return {
      accent: "#f43f5e",
      surface: "#3a0d18",
      canvas: "#15060a",
      text: "#fff1f2",
      muted: "#fda4af"
    };
  }

  if (basis.includes("claro") || basis.includes("branco")) {
    return {
      accent: "#2563eb",
      surface: "#dbeafe",
      canvas: "#eff6ff",
      text: "#0f172a",
      muted: "#475569"
    };
  }

  return {
    accent: "#22d3ee",
    surface: "#0f172a",
    canvas: "#020617",
    text: "#f8fafc",
    muted: "#94a3b8"
  };
}

function inferLandingPromptDepth(draft: LandingCreationDraftValues): LandingPlannerPromptDepth {
  const hasTopic = Boolean(draft.title.trim() || draft.slug.trim());
  const hasContent = Boolean(draft.shortDescription.trim() || draft.approvedFacts.length > 0);
  const hasRichContent = draft.approvedFacts.length >= 3 || draft.shortDescription.trim().length >= 80;
  const hasVisualDirection = Boolean(
    draft.visualTheme.trim() ||
    draft.colorPalette.trim() ||
    draft.typographyStyle.trim() ||
    draft.layoutStyle.trim()
  );

  if (hasTopic && hasRichContent && hasVisualDirection) return "deep";
  if (hasTopic && (hasContent || hasVisualDirection)) return "medium";
  return "shallow";
}

function inferLandingTopicContext(draft: LandingCreationDraftValues) {
  const source = `${draft.title} ${draft.shortDescription} ${draft.visualTheme} ${draft.colorPalette}`.toLowerCase();
  const has = (pattern: RegExp) => pattern.test(source);

  if (has(/powerpoint|ppt|slide|apresenta/)) {
    return {
      paletteQuestion: "A landing deve seguir o vermelho alaranjado do PowerPoint ou prefere outra direcao?",
      palettePlaceholder: "Ex: vermelho alaranjado do PowerPoint com fundo grafite",
      paletteOptions: [
        "vermelho alaranjado do PowerPoint",
        "coral com vinho escuro",
        "laranja queimado com grafite",
        "vermelho vivo com off-white"
      ],
      typographyOptions: ["editorial impactante", "corporativa forte", "apresentacao premium", "tecnologica limpa"],
      layoutOptions: ["hero dramatica com blocos", "storytelling em faixas", "split screen", "landing longa fluida"],
      contentOptions: ["aulas praticas com slides", "design de apresentacoes", "animacoes e recursos", "produtividade no escritorio"]
    };
  }

  if (has(/excel|planilha|spreadsheet/)) {
    return {
      paletteQuestion: "A landing deve seguir o verde classico do Excel ou outra direcao visual?",
      palettePlaceholder: "Ex: verde Excel com cinza grafite",
      paletteOptions: [
        "verde Excel com grafite",
        "verde esmeralda com preto",
        "verde profissional com branco gelo",
        "verde vibrante com azul petroleo"
      ],
      typographyOptions: ["corporativa limpa", "editorial forte", "moderna objetiva", "tecnica elegante"],
      layoutOptions: ["hero com dados em camadas", "storytelling de produtividade", "split screen", "landing longa fluida"],
      contentOptions: ["formulas e funcoes", "graficos e dashboards", "produtividade no escritorio", "aulas praticas"]
    };
  }

  if (has(/power bi|dashboard|dados|analytics|analista/)) {
    return {
      paletteQuestion: "Qual clima visual combina mais com essa landing de Power BI?",
      palettePlaceholder: "Ex: amarelo Power BI com azul profundo",
      paletteOptions: [
        "amarelo Power BI com grafite",
        "mostarda com azul profundo",
        "dourado com preto tecnico",
        "amarelo suave com chumbo"
      ],
      typographyOptions: ["tech futurista", "editorial forte", "corporativa premium", "dados com visual limpo"],
      layoutOptions: ["painel imersivo", "hero com dashboards", "split screen", "narrativa em secoes"],
      contentOptions: ["dashboards e indicadores", "modelagem de dados", "analise pratica", "projetos reais"]
    };
  }

  if (has(/python|flask|react|javascript|node|codigo|programa|dev|desenvolv/)) {
    return {
      paletteQuestion: "Que atmosfera visual deve guiar essa landing tecnica?",
      palettePlaceholder: "Ex: fundo escuro com ciano e verde codigo",
      paletteOptions: [
        "ciano com grafite",
        "verde codigo com preto",
        "azul noturno com neon suave",
        "laranja terminal com chumbo"
      ],
      typographyOptions: ["tech futurista", "mono editorial", "moderna limpa", "experimental tecnica"],
      layoutOptions: ["studio tecnico imersivo", "split screen", "hero com camadas", "narrativa de aprendizado"],
      contentOptions: ["projetos do zero", "aplicacoes praticas", "codigo orientado a iniciantes", "fluxo real de desenvolvimento"]
    };
  }

  if (has(/kids|crianca|infantil|juvenil|teen|jovem/)) {
    return {
      paletteQuestion: "Qual energia visual combina melhor com essa landing infantil?",
      palettePlaceholder: "Ex: azul divertido com amarelo e coral",
      paletteOptions: [
        "azul divertido com amarelo",
        "coral com azul ceu",
        "verde lima com roxo suave",
        "multicolorido vibrante"
      ],
      typographyOptions: ["divertida e amigavel", "ludica com impacto", "moderna arredondada", "energia criativa"],
      layoutOptions: ["blocos ludicos", "hero ilustrativa", "cards dinamicos", "landing longa divertida"],
      contentOptions: ["aprendizado divertido", "aulas praticas", "criatividade e logica", "projetos para criancas"]
    };
  }

  return {
    paletteQuestion: "Qual paleta deve guiar a landing?",
    palettePlaceholder: "Ex: azul profundo com cinza grafite",
    paletteOptions: [
      "azul profundo com grafite",
      "verde profissional com chumbo",
      "preto com dourado discreto",
      "coral com azul escuro"
    ],
    typographyOptions: ["editorial forte", "elegante", "corporativa limpa", "tech futurista"],
    layoutOptions: ["hero com storytelling", "split screen", "landing longa fluida", "hero com camadas"],
    contentOptions: ["aulas praticas", "beneficios reais", "para quem e o curso", "aplicacao no dia a dia"]
  };
}

function buildLandingPlannerAskQueue(draft: LandingCreationDraftValues, depth: LandingPlannerPromptDepth): LandingPlannerAsk[] {
  if (depth === "deep") return [];

  const asks: LandingPlannerAsk[] = [];
  const context = inferLandingTopicContext(draft);

  if (!draft.colorPalette.trim()) {
    asks.push({
      id: "colorPalette",
      label: "Direcao visual",
      question: context.paletteQuestion,
      placeholder: context.palettePlaceholder,
      options: context.paletteOptions,
      helperText: "Pode confirmar uma das sugestoes ou responder do seu jeito."
    });
  }

  if (!draft.typographyStyle.trim()) {
    asks.push({
      id: "typographyStyle",
      label: "Tipografia",
      question: "Como a tipografia deve se comportar?",
      placeholder: "Ex: editorial forte e elegante",
      options: context.typographyOptions,
      helperText: "Isso ajuda o Gemini a dar identidade para a pagina."
    });
  }

  if (!draft.layoutStyle.trim()) {
    asks.push({
      id: "layoutStyle",
      label: "Layout",
      question: "Qual estrutura deve organizar a landing?",
      placeholder: "Ex: hero cinematografico com storytelling em cards",
      options: context.layoutOptions,
      helperText: "Se preferir, responda do seu jeito."
    });
  }

  if (!draft.shortDescription.trim() && draft.approvedFacts.length === 0) {
    asks.push({
      id: "contentNotes",
      label: "Conteudo",
      question: "Quais pontos principais precisam aparecer?",
      placeholder: "Ex: certificado reconhecido, aulas praticas e suporte da equipe",
      options: context.contentOptions,
      helperText: "Pode mandar em uma frase ou em topicos."
    });
  }

  return depth === "medium" ? asks.slice(0, 1) : asks;
}

function buildFallbackLandingPlannerState(draft: LandingCreationDraftValues, previous?: LandingPlannerState): LandingPlannerState {
  const promptDepth = inferLandingPromptDepth(draft);
  const askQueue = buildLandingPlannerAskQueue(draft, promptDepth);
  const readyForVisualGeneration = promptDepth !== "shallow" || askQueue.length === 0;
  const shouldAsk = promptDepth === "shallow" && askQueue.length > 0;
  const planSummary = previous?.planSummary?.trim() || [
    `Vou estruturar a landing${draft.title ? ` de ${draft.title}` : ""} em blocos de conversao,`,
    readyForVisualGeneration
      ? "passar essa direcao para a geracao visual e montar um preview inicial."
      : "mas antes preciso de um pouco mais de contexto para guiar melhor o visual."
  ].join(" ");

  return {
    planSummary,
    promptDepth,
    shouldAsk,
    askQueue,
    readyForVisualGeneration,
    activeMessageId: previous?.activeMessageId || null,
    activeQuestionId: askQueue[0]?.id || null,
    stageSummary: previous?.stageSummary?.trim() || planSummary
  };
}

function buildLandingPlannerStateFromAiResponse(parsed: Record<string, unknown>, draft: LandingCreationDraftValues): LandingPlannerState {
  const plannerPayload = typeof parsed.planner === "object" && parsed.planner !== null
    ? parsed.planner
    : {
      planSummary: parsed.planSummary,
      promptDepth: parsed.promptDepth,
      shouldAsk: parsed.shouldAsk,
      askQueue: parsed.askQueue,
      readyForVisualGeneration: parsed.readyForVisualGeneration
    };

  const normalized = normalizeLandingPlannerState(plannerPayload, buildFallbackLandingPlannerState(draft, draft.planner));
  const fallback = buildFallbackLandingPlannerState(draft, {
    ...normalized,
    planSummary: normalized.planSummary
  });

  return {
    planSummary: normalized.planSummary || fallback.planSummary,
    promptDepth: normalized.promptDepth,
    shouldAsk: normalized.promptDepth === "shallow" ? normalized.shouldAsk || fallback.shouldAsk : false,
    askQueue: normalized.askQueue.length ? normalized.askQueue : fallback.askQueue,
    readyForVisualGeneration: normalized.promptDepth === "shallow"
      ? normalizeBoolean(normalized.readyForVisualGeneration, fallback.readyForVisualGeneration)
      : true,
    activeMessageId: normalized.activeMessageId || fallback.activeMessageId,
    activeQuestionId: (normalized.askQueue.length ? normalized.askQueue[0]?.id : normalized.activeQuestionId) || fallback.activeQuestionId,
    stageSummary: normalized.stageSummary || normalized.planSummary || fallback.stageSummary
  };
}

function buildLandingPlannerAssistantMessage(planner: LandingPlannerState, fallbackMessage: string): {
  content: string;
  thinking: string;
  stageSummary: string;
} {
  const compactSummary = planner.stageSummary.trim() || fallbackMessage.trim() || planner.planSummary.trim() || "Rascunho atualizado.";
  const replyLines: string[] = [compactSummary];

  if (planner.shouldAsk && planner.askQueue[0]) {
    replyLines.push(planner.askQueue[0].question);
  }

  return {
    content: replyLines.join("\n\n"),
    thinking: "",
    stageSummary: compactSummary
  };
}

function toTitleCase(input: string): string {
  return input
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function extractSimpleLandingTopic(message: string): string | null {
  const normalized = utf8Text(message).trim();
  if (!normalized || normalized.length > 120) return null;

  const matchers = [
    /landing\s+(?:de|do|da)?\s+(.+)$/i,
    /pagina\s+(?:de|do|da)?\s+(.+)$/i,
    /cria(?:r)?\s+uma?\s+landing\s+(?:de|do|da)?\s+(.+)$/i,
    /quero\s+uma?\s+landing\s+(?:de|do|da)?\s+(.+)$/i
  ];

  for (const matcher of matchers) {
    const match = normalized.match(matcher);
    const topic = match?.[1]?.trim();
    if (topic) {
      return topic
        .replace(/[.!?]+$/g, "")
        .trim();
    }
  }

  return null;
}

function buildFastLandingDraftFromTopic(topic: string, fallback: LandingCreationDraftValues): LandingCreationDraftValues {
  const normalizedTopic = toTitleCase(topic.trim());
  const courseLabel = /^curso\b/i.test(normalizedTopic) ? normalizedTopic : `Curso de ${normalizedTopic}`;
  const nextDraft = normalizeLandingCreationDraft({
    ...fallback,
    title: courseLabel,
    slug: normalizeSlug(courseLabel),
    shortDescription: fallback.shortDescription.trim() || `Landing para atrair interessados no ${courseLabel}.`,
    approvedFacts: fallback.approvedFacts.length > 0
      ? fallback.approvedFacts
      : [
          `Oferta focada em ${normalizedTopic}.`,
          "Pagina pensada para captar interesse e direcionar o lead para o proximo passo."
        ]
  }, fallback);

  const topicContext = inferLandingTopicContext(nextDraft);
  if (!nextDraft.colorPalette.trim()) nextDraft.colorPalette = topicContext.paletteOptions[0] || "";
  if (!nextDraft.typographyStyle.trim()) nextDraft.typographyStyle = topicContext.typographyOptions[0] || "";
  if (!nextDraft.layoutStyle.trim()) nextDraft.layoutStyle = topicContext.layoutOptions[0] || "";
  if (!nextDraft.ctaLabel.trim()) nextDraft.ctaLabel = "Quero saber mais";

  const planSummary = [
    `Vou estruturar a landing de ${normalizedTopic} com hero principal, proposta do curso, beneficios praticos e CTA final.`,
    `A direcao inicial fica em ${nextDraft.colorPalette}, com tipografia ${nextDraft.typographyStyle} e layout ${nextDraft.layoutStyle}.`
  ].join(" ");

  nextDraft.planner = {
    planSummary,
    promptDepth: "deep",
    shouldAsk: false,
    askQueue: [],
    readyForVisualGeneration: false,
    activeMessageId: null,
    activeQuestionId: null,
    stageSummary: planSummary
  };

  return nextDraft;
}

function applyAskAnswerToDraft(draft: LandingCreationDraftValues, questionId: string | null | undefined, answer: string): LandingCreationDraftValues {
  const nextDraft = normalizeLandingCreationDraft(draft, draft);
  const normalizedAnswer = utf8Text(answer).trim();
  if (!questionId || !normalizedAnswer) return nextDraft;

  switch (questionId) {
    case "colorPalette":
      nextDraft.colorPalette = normalizedAnswer;
      break;
    case "typographyStyle":
      nextDraft.typographyStyle = normalizedAnswer;
      break;
    case "layoutStyle":
      nextDraft.layoutStyle = normalizedAnswer;
      break;
    case "cta":
      nextDraft.ctaLabel = normalizedAnswer;
      break;
    case "objective":
      if (!nextDraft.shortDescription) {
        nextDraft.shortDescription = normalizedAnswer;
      } else if (!nextDraft.approvedFacts.includes(normalizedAnswer)) {
        nextDraft.approvedFacts = [...nextDraft.approvedFacts, normalizedAnswer];
      }
      break;
    default:
      break;
  }

  return nextDraft;
}

function applyAskAnswersToDraft(draft: LandingCreationDraftValues, askAnswers?: Record<string, string> | null): LandingCreationDraftValues {
  if (!askAnswers || Object.keys(askAnswers).length === 0) return normalizeLandingCreationDraft(draft, draft);
  return Object.entries(askAnswers).reduce((nextDraft, [questionId, answer]) => {
    return applyAskAnswerToDraft(nextDraft, questionId, answer);
  }, normalizeLandingCreationDraft(draft, draft));
}

function normalizeLandingCreationHistory(payload: unknown): LandingCreationHistoryMessage[] {
  if (!Array.isArray(payload)) return [];
  return payload
    .map((entry): LandingCreationHistoryMessage | null => {
      if (!entry || typeof entry !== "object") return null;
      const item = entry as Record<string, unknown>;
      const role = item.role === "assistant" ? "assistant" : item.role === "user" ? "user" : null;
      const content = typeof item.content === "string" ? utf8Text(item.content).trim() : "";
      const createdAt = typeof item.createdAt === "string" && item.createdAt.trim() ? item.createdAt : new Date().toISOString();
      const id = typeof item.id === "string" && item.id.trim() ? utf8Text(item.id).trim() : `${role || "message"}-${createdAt}`;
      if (!role || !content) return null;
      const thinking = typeof item.thinking === "string" && item.thinking.trim() ? utf8Text(item.thinking).trim() : undefined;
      const kind = item.kind === "planner" ? "planner" : "chat";
      const plannerMessageId = typeof item.plannerMessageId === "string" && item.plannerMessageId.trim()
        ? utf8Text(item.plannerMessageId).trim()
        : undefined;
      const isMutable = typeof item.isMutable === "boolean" ? item.isMutable : undefined;
      return {
        id,
        role,
        kind,
        content,
        createdAt,
        ...(plannerMessageId ? { plannerMessageId } : {}),
        ...(typeof isMutable === "boolean" ? { isMutable } : {}),
        ...(thinking ? { thinking } : {})
      };
    })
    .filter((entry): entry is LandingCreationHistoryMessage => Boolean(entry));
}

function computeLandingDraftReadiness(draft: LandingCreationDraftValues) {
  const missingPreviewFields: string[] = [];
  const missingPublishFields: string[] = [];

  if (!draft.title) missingPreviewFields.push("title");
  if (!draft.shortDescription && draft.approvedFacts.length === 0) missingPreviewFields.push("content");

  if (!draft.title) missingPublishFields.push("title");
  if (!draft.slug) missingPublishFields.push("slug");
  if (draft.approvedFacts.length === 0) missingPublishFields.push("approvedFacts");
  if (!draft.ctaLabel) missingPublishFields.push("ctaLabel");
  if (!draft.ctaUrl) missingPublishFields.push("ctaUrl");

  return {
    canPreview: missingPreviewFields.length === 0,
    canPublish: missingPublishFields.length === 0,
    missingPreviewFields,
    missingPublishFields
  };
}

function buildPreviewOfferFromDraft(draft: LandingCreationDraftValues) {
  const visualDirection = buildLandingDesignSummary(draft);
  const fallbackText = draft.shortDescription || draft.title || "Oferta em criacao";
  const approvedFacts = sanitizeApprovedFactsForLanding(draft.approvedFacts, fallbackText);

  return {
    title: draft.title || "Nova oferta",
    slug: draft.slug || normalizeSlug(draft.title || "nova-oferta"),
    shortDescription: draft.shortDescription || draft.title || "Oferta em criacao",
    durationLabel: draft.durationLabel || null,
    modality: draft.modality || null,
    approvedFacts,
    ctaLabel: draft.ctaLabel || "Quero saber mais",
    ctaUrl: draft.ctaUrl || "https://wa.me/",
    visualTheme: visualDirection || null,
    isActive: draft.isActive
  };
}

function buildFallbackLandingSectionsFromOffer(params: {
  offer: {
    title: string;
    slug: string;
    shortDescription: string | null;
    durationLabel: string | null;
    modality: string | null;
    approvedFacts: string[];
    ctaLabel: string;
    visualTheme?: string | null;
  };
}) {
  const approvedFacts = params.offer.approvedFacts.length
    ? params.offer.approvedFacts
    : [params.offer.shortDescription || params.offer.title];

  return {
    hero: {
      eyebrow: params.offer.visualTheme || "Landing criada com IA",
      headline: params.offer.title,
      subheadline: params.offer.shortDescription || "Construa uma versao pronta para conversao em poucos minutos.",
      highlights: approvedFacts.slice(0, 4)
    },
    benefits: approvedFacts.slice(0, 3).map((fact, index) => ({
      title: fact,
      description: index === 0
        ? "Bloco principal construido a partir dos fatos aprovados da oferta."
        : "Conteudo inicial pronto para ser refinado no chat ou no painel lateral."
    })),
    proof: {
      title: "O que voce vai encontrar",
      items: approvedFacts
    },
    faq: [],
    cta: {
      label: params.offer.ctaLabel,
      helper: params.offer.shortDescription || "Fale com nossa equipe e veja a proxima etapa."
    }
  };
}

function normalizeLandingCodeFile(value: unknown): LandingCodeFile | null {
  if (!value || typeof value !== "object") return null;
  const file = value as Record<string, unknown>;
  const path = typeof file.path === "string" ? utf8Text(file.path).trim() : "";
  const code = typeof file.code === "string" ? file.code.trim() : "";
  if (!path || !code) return null;

  return {
    path,
    code,
    summary: typeof file.summary === "string" ? utf8Text(file.summary).trim() : undefined
  };
}

function extractImportSources(code: string): string[] {
  const sources = new Set<string>();
  const importPattern = /\b(?:import|export)\s+[^"'`]+?\s+from\s+["'`]([^"'`]+)["'`]/g;
  const sideEffectImportPattern = /\bimport\s+["'`]([^"'`]+)["'`]/g;
  const requirePattern = /\brequire\(\s*["'`]([^"'`]+)["'`]\s*\)/g;

  for (const pattern of [importPattern, sideEffectImportPattern, requirePattern]) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(code)) !== null) {
      if (match[1]) {
        sources.add(match[1].trim());
      }
    }
  }

  return [...sources];
}

function normalizeLandingCodeBundle(value: unknown, fallback?: {
  title: string;
  slug: string;
  shortDescription: string | null;
  visualTheme?: string | null;
}): LandingCodeBundle | null {
  if (!value || typeof value !== "object") return null;
  const bundle = value as Record<string, unknown>;
  const files = Array.isArray(bundle.files)
    ? bundle.files.map(normalizeLandingCodeFile).filter((file): file is LandingCodeFile => Boolean(file))
    : [];
  const entryFile = typeof bundle.entryFile === "string" ? utf8Text(bundle.entryFile).trim() : "";

  if (
    bundle.kind !== "landing-code-bundle-v1" ||
    bundle.framework !== "vite-react" ||
    !entryFile ||
    !files.length ||
    !files.some((file) => file.path === entryFile)
  ) {
    return null;
  }

  const metadata = bundle.metadata && typeof bundle.metadata === "object" ? bundle.metadata as Record<string, unknown> : {};
  const themeTokens = bundle.themeTokens && typeof bundle.themeTokens === "object"
    ? bundle.themeTokens as Record<string, unknown>
    : {};
  const usedImports = [...new Set(files.flatMap((file) => extractImportSources(file.code)))];

  return {
    version: typeof bundle.version === "number" ? bundle.version : 1,
    kind: "landing-code-bundle-v1",
    framework: "vite-react",
    source: bundle.source === "fallback" ? "fallback" : "ai",
    entryFile,
    files,
    metadata: {
      title: typeof metadata.title === "string" ? utf8Text(metadata.title).trim() : fallback?.title || "Landing",
      slug: typeof metadata.slug === "string" ? normalizeSlug(metadata.slug) : fallback?.slug || "landing",
      description: typeof metadata.description === "string" ? utf8Text(metadata.description).trim() : fallback?.shortDescription || undefined,
      summary: typeof metadata.summary === "string" ? utf8Text(metadata.summary).trim() : "Bundle React gerado para esta landing.",
      generatedAt: typeof metadata.generatedAt === "string" ? metadata.generatedAt : new Date().toISOString(),
      visualTheme: typeof metadata.visualTheme === "string" ? utf8Text(metadata.visualTheme).trim() : fallback?.visualTheme || undefined
    },
    themeTokens: {
      accent: typeof themeTokens.accent === "string" ? themeTokens.accent : "#22d3ee",
      surface: typeof themeTokens.surface === "string" ? themeTokens.surface : "#0f172a",
      canvas: typeof themeTokens.canvas === "string" ? themeTokens.canvas : "#08111f",
      text: typeof themeTokens.text === "string" ? themeTokens.text : "#f8fafc",
      muted: typeof themeTokens.muted === "string" ? themeTokens.muted : "#94a3b8"
    },
    usedComponents: Array.isArray(bundle.usedComponents)
      ? bundle.usedComponents
        .map((entry) => (typeof entry === "string" ? utf8Text(entry).trim() : ""))
        .filter(Boolean)
      : [],
    usedImports
  };
}

function validateLandingCodeBundle(bundle: LandingCodeBundle): string[] {
  const issues: string[] = [];
  const normalizedPaths = new Set(bundle.files.map((file) => file.path));

  for (const file of bundle.files) {
    const imports = extractImportSources(file.code);
    for (const source of imports) {
      if (source.startsWith("./") || source.startsWith("../")) {
        const base = file.path.split("/").slice(0, -1).join("/");
        const normalized = normalizePathSegments([base, source].filter(Boolean).join("/"));
        if (!normalizedPaths.has(normalized)) {
          issues.push(`Import relativo ausente: ${source} em ${file.path}`);
        }
        continue;
      }

      if (!LANDING_CODE_ALLOWED_IMPORTS.has(source)) {
        issues.push(`Import nao permitido: ${source}`);
      }
    }

    const bannedPatterns: Array<[RegExp, string]> = [
      [/\beval\s*\(/, "eval"],
      [/\bnew Function\s*\(/, "new Function"],
      [/\bfetch\s*\(/, "fetch"],
      [/\bXMLHttpRequest\b/, "XMLHttpRequest"],
      [/\bWebSocket\b/, "WebSocket"],
      [/\bdocument\.cookie\b/, "document.cookie"],
      [/\blocalStorage\b/, "localStorage"],
      [/\bsessionStorage\b/, "sessionStorage"],
      [/\bimport\s*\(/, "import dinamico"]
    ];

    for (const [pattern, label] of bannedPatterns) {
      if (pattern.test(file.code)) {
        issues.push(`Uso nao permitido de ${label} em ${file.path}`);
      }
    }
  }

  if (!bundle.usedImports.some((item) => item.startsWith("@/components/ui/"))) {
    issues.push("O bundle precisa usar componentes shadcn/Radix da allowlist.");
  }

  return issues;
}

function normalizePathSegments(value: string): string {
  const segments = value.split("/").filter(Boolean);
  const output: string[] = [];
  for (const segment of segments) {
    if (segment === ".") continue;
    if (segment === "..") {
      output.pop();
      continue;
    }
    output.push(segment);
  }
  return output.join("/");
}

function buildDefaultLandingCodeBundleFromOffer(params: {
  offer: {
    title: string;
    slug: string;
    shortDescription: string | null;
    durationLabel: string | null;
    modality: string | null;
    approvedFacts: string[];
    ctaLabel: string;
    visualTheme?: string | null;
    colorPalette?: string | null;
    typographyStyle?: string | null;
    layoutStyle?: string | null;
  };
  summary: string;
  source?: "ai" | "fallback";
}): LandingCodeBundle {
  const themeTokens = resolveFallbackThemeTokens({
    colorPalette: params.offer.colorPalette,
    visualTheme: params.offer.visualTheme
  });
  const payload = {
    title: params.offer.title,
    description: params.offer.shortDescription || "A IA vai montar o preview visual completo a partir do briefing da landing.",
    ctaLabel: params.offer.ctaLabel,
    visualTheme: params.offer.visualTheme || "",
    colorPalette: params.offer.colorPalette || ""
  };
  const payloadLiteral = JSON.stringify(payload, null, 2);
  const code = [
    'import * as React from "react";',
    'import { Button } from "@/components/ui/button";',
    'import { ArrowRight } from "lucide-react";',
    "",
    `const content = ${payloadLiteral};`,
    `const theme = ${JSON.stringify(themeTokens, null, 2)};`,
    "",
    "export default function LandingPage({ onPrimaryAction }: { onPrimaryAction?: () => void }) {",
    "  return (",
    '    <main className="min-h-screen overflow-hidden" style={{ color: theme.text, background: `radial-gradient(circle at 20% 18%, ${theme.accent}16, transparent 18%), linear-gradient(180deg, ${theme.canvas} 0%, ${theme.surface} 48%, ${theme.canvas} 100%)` }}>',
    '      <section className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center gap-8 px-6 py-20 text-center">',
    '        <div className="space-y-4">',
    '          <p className="text-sm uppercase tracking-[0.28em]" style={{ color: theme.muted }}>{content.colorPalette || content.visualTheme || "aguardando geracao visual"}</p>',
    '          <h1 className="text-4xl font-black text-white md:text-6xl">{content.title}</h1>',
    '          <p className="mx-auto max-w-2xl text-lg leading-8" style={{ color: theme.text }}>{content.description}</p>',
    '        </div>',
    '        <div className="rounded-[32px] border px-6 py-6" style={{ borderColor: `${theme.accent}18`, backgroundColor: `${theme.canvas}b8` }}>',
    '          <p className="max-w-xl text-base leading-7" style={{ color: theme.muted }}>Preview inicial montado para acelerar o fluxo. Agora e so refinar o design, a copy e os blocos principais da pagina.</p>',
    '        </div>',
    '        <Button size="lg" onClick={onPrimaryAction}><ArrowRight data-icon="inline-end" />{content.ctaLabel}</Button>',
    '      </section>',
    '    </main>',
    '  );',
    '}'
  ].join("\n");

  return {
    version: 1,
    kind: "landing-code-bundle-v1",
    framework: "vite-react",
    source: params.source || "fallback",
    entryFile: "App.tsx",
    files: [
      {
        path: "App.tsx",
        summary: "Arquivo principal da landing gerada no runtime controlado.",
        code
      }
    ],
    metadata: {
      title: params.offer.title,
      slug: params.offer.slug,
      description: params.offer.shortDescription || undefined,
      summary: params.summary,
      generatedAt: new Date().toISOString()
    },
    themeTokens,
    usedComponents: ["Button"],
    usedImports: [
      "react",
      "@/components/ui/button",
      "lucide-react"
    ]
  };
}

function buildLandingBuilderDocument(params: {
  offer: {
    title: string;
    slug: string;
    shortDescription: string | null;
    durationLabel: string | null;
    modality: string | null;
    approvedFacts: string[];
    ctaLabel: string;
  };
  sections: Record<string, unknown>;
  version?: number;
}): LandingBuilderDocument {
  const sections = params.sections;
  const hero = typeof sections.hero === "object" && sections.hero !== null ? sections.hero as Record<string, unknown> : {};
  const benefits = Array.isArray(sections.benefits) ? sections.benefits : [];
  const proof = typeof sections.proof === "object" && sections.proof !== null ? sections.proof as Record<string, unknown> : {};
  const faq = Array.isArray(sections.faq) ? sections.faq : [];
  const cta = typeof sections.cta === "object" && sections.cta !== null ? sections.cta as Record<string, unknown> : {};

  const benefitItems = benefits
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const item = entry as Record<string, unknown>;
      const title = typeof item.title === "string" ? utf8Text(item.title).trim() : "";
      const description = typeof item.description === "string" ? utf8Text(item.description).trim() : "";
      return title && description ? { title, description } : null;
    })
    .filter((entry): entry is { title: string; description: string } => Boolean(entry));

  const faqItems = faq
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const item = entry as Record<string, unknown>;
      const question = typeof item.question === "string" ? utf8Text(item.question).trim() : "";
      const answer = typeof item.answer === "string" ? utf8Text(item.answer).trim() : "";
      return question && answer ? { question, answer } : null;
    })
    .filter((entry): entry is { question: string; answer: string } => Boolean(entry));

  return {
    version: params.version || 1,
    kind: "landing-builder-v1",
    metadata: {
      title: params.offer.title,
      slug: params.offer.slug,
      description: params.offer.shortDescription || undefined
    },
    theme: {
      accent: "#22d3ee",
      surface: "#0f172a",
      canvas: "#08111f"
    },
    nodes: [
      {
        id: "hero",
        type: "hero",
        props: {
          eyebrow: typeof hero.eyebrow === "string" ? utf8Text(hero.eyebrow).trim() : "Transforme sua carreira",
          headline: typeof hero.headline === "string" ? utf8Text(hero.headline).trim() : params.offer.title,
          subheadline: typeof hero.subheadline === "string" ? utf8Text(hero.subheadline).trim() : (params.offer.shortDescription || ""),
          highlights: parseStringArray(hero.highlights).length ? parseStringArray(hero.highlights) : params.offer.approvedFacts,
          ctaLabel: typeof cta.label === "string" ? utf8Text(cta.label).trim() : params.offer.ctaLabel
        }
      },
      {
        id: "summary",
        type: "info-panel",
        props: {
          title: params.offer.title,
          items: [
            { label: "Duracao", value: params.offer.durationLabel || "Consulte disponibilidade" },
            { label: "Modalidade", value: params.offer.modality || "A combinar" },
            { label: "Versao", value: `Landing v${params.version || 1}` }
          ],
          helper: typeof cta.helper === "string" ? utf8Text(cta.helper).trim() : "Fale com a equipe e veja a melhor forma de entrar agora."
        }
      },
      {
        id: "benefits",
        type: "feature-grid",
        props: {
          title: "Destaques",
          items: benefitItems
        }
      },
      {
        id: "proof",
        type: "proof-list",
        props: {
          title: typeof proof.title === "string" ? utf8Text(proof.title).trim() : "Diferenciais",
          items: parseStringArray(proof.items).length ? parseStringArray(proof.items) : params.offer.approvedFacts
        }
      },
      {
        id: "faq",
        type: "faq-list",
        props: {
          title: "FAQ rapido",
          items: faqItems
        }
      },
      {
        id: "cta",
        type: "cta-band",
        props: {
          eyebrow: "Pronto para avancar",
          label: typeof cta.label === "string" ? utf8Text(cta.label).trim() : params.offer.ctaLabel,
          helper: typeof cta.helper === "string" ? utf8Text(cta.helper).trim() : (params.offer.shortDescription || "")
        }
      }
    ]
  };
}

function buildLandingBuilderDraftFromDraft(draft: LandingCreationDraftValues): LandingBuilderDocument {
  return buildLandingBuilderDocument({
    offer: {
      title: draft.title || "Nova oferta",
      slug: draft.slug || normalizeSlug(draft.title || "nova-oferta"),
      shortDescription: draft.shortDescription || draft.title || "Oferta em criacao",
      durationLabel: draft.durationLabel || null,
      modality: draft.modality || null,
      approvedFacts: draft.approvedFacts.length ? draft.approvedFacts : [draft.shortDescription || draft.title || "Oferta em criacao"],
      ctaLabel: draft.ctaLabel || "Quero saber mais"
    },
    sections: {
      hero: {
        eyebrow: "Construa sua landing com IA",
        headline: draft.title || "Nova landing",
        subheadline: draft.shortDescription || "Descreva a oferta e refine a pagina em tempo real.",
        highlights: draft.approvedFacts
      },
      benefits: draft.approvedFacts.slice(0, 3).map((fact) => ({
        title: fact,
        description: "Bloco inicial gerado a partir dos fatos aprovados."
      })),
      proof: {
        title: "Pontos aprovados",
        items: draft.approvedFacts
      },
      faq: [],
      cta: {
        label: draft.ctaLabel || "Quero saber mais",
        helper: draft.shortDescription || "Continue refinando no chat ou publique quando estiver pronto."
      }
    },
    version: 1
  });
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === "string" ? utf8Text(entry.trim()) : ""))
      .filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/\r?\n|,/)
      .map((entry) => utf8Text(entry.trim()))
      .filter(Boolean);
  }
  return [];
}

function serializeOfferJsonList(value: unknown): string[] {
  return parseStringArray(value);
}

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

function hmacSha256(key: Buffer | string, value: string, encoding?: crypto.BinaryToTextEncoding): Buffer | string {
  const digest = crypto.createHmac("sha256", key).update(value, "utf8").digest();
  return encoding ? digest.toString(encoding) : digest;
}

function buildR2CanonicalUri(bucket: string, key: string): string {
  return `/${[bucket, ...key.split("/").filter(Boolean)].map((segment) => encodeURIComponent(segment)).join("/")}`;
}

function buildR2PublicAssetUrl(key: string): string | null {
  if (!CLOUDFLARE_PUBLIC_URL || !CLOUDFLARE_BUCKET_NAME) return null;
  return `${CLOUDFLARE_PUBLIC_URL}/${CLOUDFLARE_BUCKET_NAME}/${key.split("/").map((segment) => encodeURIComponent(segment)).join("/")}`;
}

function getLandingArtifactMetaFromPage(page: {
  id: number;
  version: number;
  sourceFactsSnapshot?: unknown;
}): { key: string; url: string | null } | null {
  const snapshot = typeof page.sourceFactsSnapshot === "object" && page.sourceFactsSnapshot !== null
    ? page.sourceFactsSnapshot as Record<string, unknown>
    : {};
  const slug = typeof snapshot.slug === "string" ? normalizeSlug(snapshot.slug) : "";
  if (!slug || !CLOUDFLARE_BUCKET_NAME) return null;
  const key = `landings/${slug}/v${page.version}-page-${page.id}.json`;
  return {
    key,
    url: buildR2PublicAssetUrl(key)
  };
}

async function uploadLandingArtifactToR2(params: {
  offerId: number;
  landingPageId: number;
  slug: string;
  version: number;
  payload: Record<string, unknown>;
}): Promise<{ key: string; url: string | null } | null> {
  if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_ACCESS_KEY_ID || !CLOUDFLARE_SECRET_ACCESS_KEY || !CLOUDFLARE_BUCKET_NAME) {
    return null;
  }

  const key = `landings/${normalizeSlug(params.slug || `offer-${params.offerId}`)}/v${params.version}-page-${params.landingPageId}.json`;
  const endpoint = `https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const method = "PUT";
  const contentType = "application/json; charset=utf-8";
  const body = JSON.stringify(params.payload, null, 2);
  const hashedPayload = sha256Hex(body);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const host = `${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const canonicalUri = buildR2CanonicalUri(CLOUDFLARE_BUCKET_NAME, key);
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-amz-content-sha256:${hashedPayload}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [
    method,
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    hashedPayload
  ].join("\n");
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest)
  ].join("\n");
  const kDate = hmacSha256(`AWS4${CLOUDFLARE_SECRET_ACCESS_KEY}`, dateStamp) as Buffer;
  const kRegion = hmacSha256(kDate, "auto") as Buffer;
  const kService = hmacSha256(kRegion, "s3") as Buffer;
  const kSigning = hmacSha256(kService, "aws4_request") as Buffer;
  const signature = hmacSha256(kSigning, stringToSign, "hex") as string;
  const authorization = `AWS4-HMAC-SHA256 Credential=${CLOUDFLARE_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(`${endpoint}${canonicalUri}`, {
    method,
    headers: {
      Authorization: authorization,
      "Content-Type": contentType,
      Host: host,
      "x-amz-content-sha256": hashedPayload,
      "x-amz-date": amzDate
    },
    body
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Falha ao enviar artefato ao R2 (${response.status}): ${detail || "sem detalhes"}`);
  }

  return {
    key,
    url: buildR2PublicAssetUrl(key)
  };
}

function mapOffer(offer: {
  id: number;
  title: string;
  slug: string;
  aliases: unknown;
  durationLabel: string | null;
  modality: string | null;
  shortDescription: string | null;
  approvedFacts: unknown;
  ctaLabel: string;
  ctaUrl: string;
  visualTheme: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  landingPages?: Array<{
    id: number;
    version: number;
    status: string;
    publishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
}): Record<string, unknown> {
  const latestLanding = offer.landingPages?.[0] || null;
  return {
    id: offer.id,
    title: offer.title,
    slug: offer.slug,
    aliases: serializeOfferJsonList(offer.aliases),
    durationLabel: offer.durationLabel,
    modality: offer.modality,
    shortDescription: offer.shortDescription,
    approvedFacts: serializeOfferJsonList(offer.approvedFacts),
    ctaLabel: offer.ctaLabel,
    ctaUrl: offer.ctaUrl,
    visualTheme: offer.visualTheme,
    isActive: offer.isActive,
    latestLanding,
    createdAt: offer.createdAt,
    updatedAt: offer.updatedAt
  };
}

function mapLandingPageSummary(page: {
  id: number;
  offerId: number;
  version: number;
  status: string;
  sectionsJson: unknown;
  builderDocumentJson?: unknown;
  landingCodeBundleJson?: unknown;
  promptSnapshot: unknown;
  sourceFactsSnapshot: unknown;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): Record<string, unknown> {
  const artifact = getLandingArtifactMetaFromPage(page);
  return {
    id: page.id,
    offerId: page.offerId,
    version: page.version,
    status: page.status,
    sectionsJson: page.sectionsJson,
    builderDocumentJson: page.builderDocumentJson ?? null,
    landingCodeBundleJson: page.landingCodeBundleJson ?? null,
    artifactKey: artifact?.key || null,
    artifactUrl: artifact?.url || null,
    promptSnapshot: page.promptSnapshot,
    sourceFactsSnapshot: page.sourceFactsSnapshot,
    publishedAt: page.publishedAt,
    createdAt: page.createdAt,
    updatedAt: page.updatedAt
  };
}

function mapLandingCreationSession(session: {
  id: number;
  title: string | null;
  status: string;
  offerDraftJson: unknown;
  promptDraftJson: unknown;
  chatHistoryJson: unknown;
  builderDraftJson?: unknown;
  codeBundleDraftJson?: unknown;
  previewSectionsJson: unknown;
  publishedOfferId: number | null;
  createdAt: Date;
  updatedAt: Date;
}): Record<string, unknown> {
  const draft = normalizeLandingCreationDraft(session.offerDraftJson);
  const planner = normalizeLandingPlannerState(draft.planner, buildFallbackLandingPlannerState(draft));
  const promptDraft = mergeLandingPromptPayload(buildDefaultLandingPromptValues(), session.promptDraftJson);
  const chatHistory = normalizeLandingCreationHistory(session.chatHistoryJson);
  const readiness = computeLandingDraftReadiness(draft);
  const previewOffer = buildPreviewOfferFromDraft(draft);
  const hasStoredPreview = session.previewSectionsJson && typeof session.previewSectionsJson === "object";
  const previewSections = hasStoredPreview ? session.previewSectionsJson : null;
  const builderDraft = session.builderDraftJson && typeof session.builderDraftJson === "object"
    ? session.builderDraftJson
    : buildLandingBuilderDraftFromDraft(draft);
  const codeBundleDraft = session.codeBundleDraftJson && typeof session.codeBundleDraftJson === "object"
    ? session.codeBundleDraftJson
    : buildDefaultLandingCodeBundleFromOffer({
      offer: {
        ...previewOffer,
        approvedFacts: previewOffer.approvedFacts,
        ctaLabel: previewOffer.ctaLabel,
        visualTheme: previewOffer.visualTheme,
        colorPalette: draft.colorPalette,
        typographyStyle: draft.typographyStyle,
        layoutStyle: draft.layoutStyle
      },
      summary: "Bundle inicial criado a partir do draft da oferta.",
      source: "fallback"
    });
  const previewBuilder = previewSections
    ? buildLandingBuilderDocument({
        offer: {
          title: previewOffer.title,
          slug: previewOffer.slug,
          shortDescription: previewOffer.shortDescription,
          durationLabel: previewOffer.durationLabel,
          modality: previewOffer.modality,
          approvedFacts: previewOffer.approvedFacts,
          ctaLabel: previewOffer.ctaLabel
        },
        sections: previewSections as Record<string, unknown>
      })
    : null;

  return {
    id: session.id,
    title: session.title || draft.title || `Nova landing ${session.id}`,
    status: session.status,
    offerDraft: draft,
    promptDraft,
    chatHistory,
    readiness,
    planner,
    builderDraft,
    codeBundleDraft,
    preview: previewSections
      ? {
          offer: {
            id: session.publishedOfferId || 0,
            title: previewOffer.title,
            slug: previewOffer.slug,
            aliases: draft.aliases,
            durationLabel: previewOffer.durationLabel,
            modality: previewOffer.modality,
            shortDescription: previewOffer.shortDescription,
            approvedFacts: previewOffer.approvedFacts,
            ctaLabel: previewOffer.ctaLabel,
            ctaUrl: previewOffer.ctaUrl,
            visualTheme: previewOffer.visualTheme,
            isActive: previewOffer.isActive,
            latestLanding: null,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt
          },
          landing: {
            id: 0,
            offerId: session.publishedOfferId || 0,
            version: 0,
            status: "preview",
            sectionsJson: previewSections,
            builderDocumentJson: previewBuilder,
            landingCodeBundleJson: codeBundleDraft,
            promptSnapshot: promptDraft,
            sourceFactsSnapshot: draft,
            publishedAt: null,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt
          }
        }
      : null,
    publishedOfferId: session.publishedOfferId,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt
  };
}

function signLandingDeliveryToken(input: { contactId: number; offerId: number; landingPageId: number }): string {
  const payload = Buffer.from(
    JSON.stringify({
      contactId: input.contactId,
      offerId: input.offerId,
      landingPageId: input.landingPageId,
      iat: Date.now()
    }),
    "utf8"
  ).toString("base64url");
  const signature = crypto.createHmac("sha256", LANDING_DELIVERY_SECRET).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyLandingDeliveryToken(token: string): { contactId: number; offerId: number; landingPageId: number } | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = crypto.createHmac("sha256", LANDING_DELIVERY_SECRET).update(payload).digest("base64url");
  if (!safeEqual(signature, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
    const contactId = Number(parsed.contactId);
    const offerId = Number(parsed.offerId);
    const landingPageId = Number(parsed.landingPageId);
    if (!Number.isInteger(contactId) || !Number.isInteger(offerId) || !Number.isInteger(landingPageId)) {
      return null;
    }
    return { contactId, offerId, landingPageId };
  } catch {
    return null;
  }
}

function buildPublicLandingUrl(slug: string, token: string): string {
  const publicBase = (allowedOrigins[0] || "http://localhost:8085").replace(/\/+$/, "");
  return `${publicBase}/ofertas/${encodeURIComponent(slug)}?t=${encodeURIComponent(token)}`;
}

function extractEmailFromText(input: string): string | null {
  const match = input.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? utf8Text(match[0].trim().toLowerCase()) : null;
}

async function findMatchingOffer(params: {
  interestedCourse?: string | null;
  courseMode?: string | null;
  durationLabel?: string | null;
}) {
  const offers = await prisma.offer.findMany({
    where: { isActive: true }
  });
  const interestText = normalizeSearchText(
    [params.interestedCourse, params.courseMode, params.durationLabel].filter(Boolean).join(" ")
  );
  if (!interestText) return null;

  const scored = offers
    .map((offer) => {
      const aliases = serializeOfferJsonList(offer.aliases);
      const haystack = [offer.title, offer.slug, offer.durationLabel, offer.modality, ...aliases]
        .filter(Boolean)
        .map((entry) => normalizeSearchText(String(entry)))
        .join(" ");
      let score = 0;
      if (haystack.includes(normalizeSearchText(offer.title))) score += 0.1;
      if (haystack.includes(interestText)) score += 1;
      for (const term of interestText.split(/\s+/)) {
        if (term && haystack.includes(term)) score += 0.18;
      }
      if (params.durationLabel && offer.durationLabel && normalizeSearchText(offer.durationLabel).includes(normalizeSearchText(params.durationLabel))) score += 0.25;
      if (params.courseMode && offer.modality && normalizeSearchText(offer.modality).includes(normalizeSearchText(params.courseMode))) score += 0.2;
      return { offer, score };
    })
    .sort((left, right) => right.score - left.score);

  return scored[0] && scored[0].score >= 0.65 ? scored[0].offer : null;
}

async function generateLandingPageForOffer(offerId: number, leadContext?: {
  interestedCourse?: string | null;
  courseMode?: string | null;
  objective?: string | null;
  level?: string | null;
  summary?: string | null;
}) {
  const offer = await prisma.offer.findUnique({ where: { id: offerId } });
  if (!offer) throw new Error("Oferta nao encontrada.");
  const promptConfig = await getOfferLandingPromptSettings(offerId);
  const approvedFacts = serializeOfferJsonList(offer.approvedFacts);
  const fallbackSections = buildFallbackLandingSectionsFromOffer({
    offer: {
      title: offer.title,
      slug: offer.slug,
      shortDescription: offer.shortDescription,
      durationLabel: offer.durationLabel,
      modality: offer.modality,
      approvedFacts,
      ctaLabel: offer.ctaLabel,
      visualTheme: offer.visualTheme
    }
  });
  const landingCodeBundle = await generateLandingCodeBundleForOfferData({
    offer: {
      title: offer.title,
      slug: offer.slug,
      shortDescription: offer.shortDescription,
      durationLabel: offer.durationLabel,
      modality: offer.modality,
      approvedFacts,
      ctaLabel: offer.ctaLabel,
      visualTheme: offer.visualTheme
    },
    promptConfig,
    leadContext,
    eventMeta: {
      eventPrefix: "landing.generate",
      offerId,
      slug: offer.slug
    }
  });

  const latest = await prisma.landingPage.findFirst({
    where: { offerId },
    orderBy: { version: "desc" }
  });
  const page = await prisma.landingPage.create({
    data: {
      offerId,
      version: (latest?.version || 0) + 1,
      status: "draft",
      sectionsJson: fallbackSections as object,
      builderDocumentJson: buildLandingBuilderDocument({
        offer: {
          title: offer.title,
          slug: offer.slug,
          shortDescription: offer.shortDescription,
          durationLabel: offer.durationLabel,
          modality: offer.modality,
          approvedFacts,
          ctaLabel: offer.ctaLabel
        },
        sections: fallbackSections as Record<string, unknown>,
        version: (latest?.version || 0) + 1
      }) as unknown as object,
      landingCodeBundleJson: landingCodeBundle as unknown as object,
      promptSnapshot: {
        ...promptConfig,
        scope: promptConfig.scope,
        offerId: promptConfig.offerId
      },
      sourceFactsSnapshot: {
        title: offer.title,
        slug: offer.slug,
        durationLabel: offer.durationLabel,
        modality: offer.modality,
        shortDescription: offer.shortDescription,
        approvedFacts
      }
    } as any
  });
  logEvent("info", "landing.generate.succeeded", { offerId, landingPageId: page.id, version: page.version, slug: offer.slug });
  return page;
}

async function generateLandingSectionsForOfferData(params: {
  offer: {
    title: string;
    slug: string;
    shortDescription: string | null;
    durationLabel: string | null;
    modality: string | null;
    approvedFacts: string[];
  };
  promptConfig: {
    systemPrompt: string;
    toneGuidelines: string;
    requiredRules: string[];
    ctaRules: string[];
  };
  leadContext?: {
    interestedCourse?: string | null;
    courseMode?: string | null;
    objective?: string | null;
    level?: string | null;
    summary?: string | null;
  };
  eventMeta: {
    eventPrefix: string;
    offerId?: number | null;
    slug: string;
    sessionId?: number | null;
  };
}) {
  const approvedFacts = params.offer.approvedFacts.length
    ? params.offer.approvedFacts
    : [params.offer.shortDescription || params.offer.title];
  const promptInput = buildLandingGenerationPromptInput({
    offerTitle: params.offer.title,
    offerSlug: params.offer.slug,
    shortDescription: params.offer.shortDescription,
    durationLabel: params.offer.durationLabel,
    modality: params.offer.modality,
    approvedFacts,
    prompt: {
      systemPrompt: params.promptConfig.systemPrompt,
      toneGuidelines: params.promptConfig.toneGuidelines,
      requiredRules: params.promptConfig.requiredRules,
      ctaRules: params.promptConfig.ctaRules
    },
    leadContext: params.leadContext
  });

  logEvent("info", `${params.eventMeta.eventPrefix}.started`, {
    sessionId: params.eventMeta.sessionId ?? null,
    offerId: params.eventMeta.offerId,
    slug: params.eventMeta.slug
  });
  const { response: resp, selectedModel, fallbackUsed } = await callOpenAIResponsesWithRouting({
    taskType: "landing_generation",
    input: promptInput,
    maxOutputTokens: 900,
    metadata: {
      sessionId: params.eventMeta.sessionId ?? null,
      offerId: params.eventMeta.offerId,
      slug: params.eventMeta.slug
    }
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    logEvent("error", `${params.eventMeta.eventPrefix}.failed`, {
      sessionId: params.eventMeta.sessionId ?? null,
      offerId: params.eventMeta.offerId,
      slug: params.eventMeta.slug,
      selectedModel,
      fallbackUsed,
      statusCode: resp.status,
      message: detail
    });
    throw new Error(`Falha ao gerar landing (${resp.status}).`);
  }

  const data = await resp.json();
  const sectionsJson = extractFirstJsonObject(parseResponseOutputText(data));
  if (!sectionsJson) {
    logEvent("error", `${params.eventMeta.eventPrefix}.failed`, {
      sessionId: params.eventMeta.sessionId ?? null,
      offerId: params.eventMeta.offerId,
      slug: params.eventMeta.slug,
      message: "json_invalido"
    });
    throw new Error("Resposta da IA para landing veio sem JSON valido.");
  }

  return sectionsJson;
}

function parseGeminiOutputText(payload: unknown): string {
  const body = payload as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const parts: string[] = [];
  for (const candidate of body?.candidates || []) {
    for (const part of candidate.content?.parts || []) {
      if (typeof part.text === "string" && part.text.trim()) {
        parts.push(part.text.trim());
      }
    }
  }

  return parts.join("\n").trim();
}

function buildLandingCodeBundlePromptText(params: {
  offer: {
    title: string;
    slug: string;
    shortDescription: string | null;
    durationLabel: string | null;
    modality: string | null;
    approvedFacts: string[];
    ctaLabel: string;
    visualTheme?: string | null;
    colorPalette?: string | null;
    typographyStyle?: string | null;
    layoutStyle?: string | null;
  };
  promptConfig: {
    systemPrompt: string;
    toneGuidelines: string;
    requiredRules: string[];
    ctaRules: string[];
  };
  leadContext?: {
    interestedCourse?: string | null;
    courseMode?: string | null;
    objective?: string | null;
    level?: string | null;
    summary?: string | null;
  };
}) {
  const approvedFacts = params.offer.approvedFacts.length
    ? params.offer.approvedFacts
    : [params.offer.shortDescription || params.offer.title];

  return [
    LANDING_CODE_GENERATION_SYSTEM_PROMPT,
    params.promptConfig.systemPrompt,
    "",
    buildLandingCodeGenerationPrompt({
      offerTitle: params.offer.title,
      offerSlug: params.offer.slug,
      shortDescription: params.offer.shortDescription,
      durationLabel: params.offer.durationLabel,
      modality: params.offer.modality,
      visualTheme: params.offer.visualTheme,
      colorPalette: params.offer.colorPalette,
      typographyStyle: params.offer.typographyStyle,
      layoutStyle: params.offer.layoutStyle,
      approvedFacts,
      prompt: params.promptConfig,
      leadContext: params.leadContext
    })
  ].filter(Boolean).join("\n\n");
}

async function generateLandingCodeBundleWithGemini(params: {
  offer: {
    title: string;
    slug: string;
    shortDescription: string | null;
    durationLabel: string | null;
    modality: string | null;
    approvedFacts: string[];
    ctaLabel: string;
    visualTheme?: string | null;
    colorPalette?: string | null;
    typographyStyle?: string | null;
    layoutStyle?: string | null;
  };
  promptConfig: {
    systemPrompt: string;
    toneGuidelines: string;
    requiredRules: string[];
    ctaRules: string[];
  };
  leadContext?: {
    interestedCourse?: string | null;
    courseMode?: string | null;
    objective?: string | null;
    level?: string | null;
    summary?: string | null;
  };
  eventMeta: {
    eventPrefix: string;
    offerId?: number | null;
    slug: string;
    sessionId?: number | null;
  };
}): Promise<LandingCodeBundle | null> {
  if (!GEMINI_API_KEY || !GEMINI_MODEL) {
    logEvent("warn", `${params.eventMeta.eventPrefix}.provider_skipped`, {
      sessionId: params.eventMeta.sessionId ?? null,
      offerId: params.eventMeta.offerId,
      slug: params.eventMeta.slug,
      mode: "react_bundle",
      provider: "gemini",
      message: "gemini_nao_configurado"
    });
    return null;
  }

  const promptText = buildLandingCodeBundlePromptText(params);

  const visualModel = runtimeLandingVisualModel.trim() || GEMINI_MODEL;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(visualModel)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  const resp = await fetchWithRetry(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: promptText }]
        }
      ],
      generationConfig: {
        temperature: 0.9,
        topP: 0.60,
        maxOutputTokens: 10000,
        responseMimeType: "application/json"
      }
    })
  }).catch((err) => {
    logEvent("error", `${params.eventMeta.eventPrefix}.failed`, {
      sessionId: params.eventMeta.sessionId ?? null,
      offerId: params.eventMeta.offerId,
      slug: params.eventMeta.slug,
      mode: "react_bundle",
      provider: "gemini",
      message: formatError(err)
    });
    return null;
  });

  if (!resp) return null;
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    logEvent("error", `${params.eventMeta.eventPrefix}.failed`, {
      sessionId: params.eventMeta.sessionId ?? null,
      offerId: params.eventMeta.offerId,
      slug: params.eventMeta.slug,
      mode: "react_bundle",
      provider: "gemini",
      statusCode: resp.status,
      message: detail,
      fallbackProvider: "openai"
    });
    return null;
  }

  const payload = await resp.json();
  const parsed = extractFirstJsonObject(parseGeminiOutputText(payload));
  const normalizedBundle = normalizeLandingCodeBundle(parsed, {
    title: params.offer.title,
    slug: params.offer.slug,
    shortDescription: params.offer.shortDescription,
    visualTheme: params.offer.visualTheme
  });

  if (!normalizedBundle) {
    logEvent("warn", `${params.eventMeta.eventPrefix}.provider_invalid`, {
      sessionId: params.eventMeta.sessionId ?? null,
      offerId: params.eventMeta.offerId,
      slug: params.eventMeta.slug,
      mode: "react_bundle",
      provider: "gemini",
      message: "bundle_invalido",
      fallbackProvider: "openai"
    });
    return null;
  }

  const validationIssues = validateLandingCodeBundle(normalizedBundle);
  if (validationIssues.length > 0) {
    logEvent("warn", `${params.eventMeta.eventPrefix}.provider_invalid`, {
      sessionId: params.eventMeta.sessionId ?? null,
      offerId: params.eventMeta.offerId,
      slug: params.eventMeta.slug,
      mode: "react_bundle",
      provider: "gemini",
      issues: validationIssues,
      fallbackProvider: "openai"
    });
    return null;
  }

  return {
    ...normalizedBundle,
    source: "ai",
    metadata: {
      ...normalizedBundle.metadata,
      generatedAt: new Date().toISOString()
    }
  };
}

function stableSerialize(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(String(value));
}

function buildLandingPreviewCacheKey(params: {
  draft: LandingCreationDraftValues;
  promptDraft: LandingPromptValues;
  leadContext?: {
    interestedCourse?: string | null;
    courseMode?: string | null;
    objective?: string | null;
    level?: string | null;
    summary?: string | null;
  };
}): string {
  const normalizedLeadContext = params.leadContext && Object.values(params.leadContext).some((value) => Boolean(value))
    ? params.leadContext
    : null;
  return stableSerialize({
    draft: params.draft,
    promptDraft: params.promptDraft,
    leadContext: normalizedLeadContext
  });
}

async function generateLandingCodeBundleWithOpenAI(params: {
  offer: {
    title: string;
    slug: string;
    shortDescription: string | null;
    durationLabel: string | null;
    modality: string | null;
    approvedFacts: string[];
    ctaLabel: string;
    visualTheme?: string | null;
    colorPalette?: string | null;
    typographyStyle?: string | null;
    layoutStyle?: string | null;
  };
  promptConfig: {
    systemPrompt: string;
    toneGuidelines: string;
    requiredRules: string[];
    ctaRules: string[];
  };
  leadContext?: {
    interestedCourse?: string | null;
    courseMode?: string | null;
    objective?: string | null;
    level?: string | null;
    summary?: string | null;
  };
  eventMeta: {
    eventPrefix: string;
    offerId?: number | null;
    slug: string;
    sessionId?: number | null;
  };
}): Promise<LandingCodeBundle | null> {
  if (!OPENAI_API_KEY) {
    logEvent("warn", `${params.eventMeta.eventPrefix}.provider_skipped`, {
      sessionId: params.eventMeta.sessionId ?? null,
      offerId: params.eventMeta.offerId,
      slug: params.eventMeta.slug,
      mode: "react_bundle",
      provider: "openai",
      message: "openai_nao_configurado"
    });
    return null;
  }

  const promptText = buildLandingCodeBundlePromptText(params);
  const responseResult = await callOpenAIResponsesWithRouting({
    taskType: "landing_code_bundle",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: promptText
          }
        ]
      }
    ],
    maxOutputTokens: 6000,
    metadata: {
      sessionId: params.eventMeta.sessionId ?? null,
      offerId: params.eventMeta.offerId,
      slug: params.eventMeta.slug
    }
  }).catch((err) => {
    logEvent("error", `${params.eventMeta.eventPrefix}.failed`, {
      sessionId: params.eventMeta.sessionId ?? null,
      offerId: params.eventMeta.offerId,
      slug: params.eventMeta.slug,
      mode: "react_bundle",
      provider: "openai",
      message: formatError(err)
    });
    return null;
  });

  if (!responseResult) return null;
  const { response: resp, selectedModel, fallbackUsed } = responseResult;
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    logEvent("error", `${params.eventMeta.eventPrefix}.failed`, {
      sessionId: params.eventMeta.sessionId ?? null,
      offerId: params.eventMeta.offerId,
      slug: params.eventMeta.slug,
      mode: "react_bundle",
      provider: "openai",
      selectedModel,
      fallbackUsed,
      statusCode: resp.status,
      message: detail
    });
    return null;
  }

  const payload = await resp.json();
  const parsed = extractFirstJsonObject(parseResponseOutputText(payload));
  const normalizedBundle = normalizeLandingCodeBundle(parsed, {
    title: params.offer.title,
    slug: params.offer.slug,
    shortDescription: params.offer.shortDescription,
    visualTheme: params.offer.visualTheme
  });

  if (!normalizedBundle) {
    logEvent("warn", `${params.eventMeta.eventPrefix}.provider_invalid`, {
      sessionId: params.eventMeta.sessionId ?? null,
      offerId: params.eventMeta.offerId,
      slug: params.eventMeta.slug,
      mode: "react_bundle",
      provider: "openai",
      message: "bundle_invalido",
      rawPreview: parseResponseOutputText(payload).slice(0, 1200)
    });
    return null;
  }

  const validationIssues = validateLandingCodeBundle(normalizedBundle);
  if (validationIssues.length > 0) {
    logEvent("warn", `${params.eventMeta.eventPrefix}.provider_invalid`, {
      sessionId: params.eventMeta.sessionId ?? null,
      offerId: params.eventMeta.offerId,
      slug: params.eventMeta.slug,
      mode: "react_bundle",
      provider: "openai",
      issues: validationIssues
    });
    return null;
  }

  return {
    ...normalizedBundle,
    source: "ai",
    metadata: {
      ...normalizedBundle.metadata,
      generatedAt: new Date().toISOString()
    }
  };
}

async function generateLandingCodeBundleForOfferData(params: {
  offer: {
    title: string;
    slug: string;
    shortDescription: string | null;
    durationLabel: string | null;
    modality: string | null;
    approvedFacts: string[];
    ctaLabel: string;
    visualTheme?: string | null;
    colorPalette?: string | null;
    typographyStyle?: string | null;
    layoutStyle?: string | null;
  };
  promptConfig: {
    systemPrompt: string;
    toneGuidelines: string;
    requiredRules: string[];
    ctaRules: string[];
  };
  leadContext?: {
    interestedCourse?: string | null;
    courseMode?: string | null;
    objective?: string | null;
    level?: string | null;
    summary?: string | null;
  };
  eventMeta: {
    eventPrefix: string;
    offerId?: number | null;
    slug: string;
    sessionId?: number | null;
  };
}): Promise<LandingCodeBundle> {
  logEvent("info", `${params.eventMeta.eventPrefix}.started`, {
    sessionId: params.eventMeta.sessionId ?? null,
    offerId: params.eventMeta.offerId,
    slug: params.eventMeta.slug,
    mode: "react_bundle",
    providerOrder: ["openai"]
  });

  const openaiBundle = await generateLandingCodeBundleWithOpenAI(params);
  if (openaiBundle) {
    logEvent("info", `${params.eventMeta.eventPrefix}.succeeded`, {
      sessionId: params.eventMeta.sessionId ?? null,
      offerId: params.eventMeta.offerId,
      slug: params.eventMeta.slug,
      mode: "react_bundle",
      provider: "openai",
      entryFile: openaiBundle.entryFile,
      files: openaiBundle.files.map((file) => file.path),
      usedComponents: openaiBundle.usedComponents
    });
    return openaiBundle;
  }

  logEvent("error", `${params.eventMeta.eventPrefix}.failed`, {
    sessionId: params.eventMeta.sessionId ?? null,
    offerId: params.eventMeta.offerId,
    slug: params.eventMeta.slug,
    mode: "react_bundle",
    provider: "none",
    message: "Nenhum provider conseguiu gerar um bundle visual valido."
  });
  throw new Error("Nenhum provider de IA conseguiu gerar o preview visual agora.");
}

async function createLandingCreationSession() {
  const promptDraft = await getGlobalLandingPromptSettings();
  const defaultDraft = buildDefaultLandingCreationDraft();
  const previewOffer = buildPreviewOfferFromDraft(defaultDraft);
  const session = await prisma.landingCreationSession.create({
    data: {
      title: "Nova landing",
      status: "draft",
      offerDraftJson: defaultDraft,
      promptDraftJson: promptDraft,
      builderDraftJson: buildLandingBuilderDraftFromDraft(defaultDraft) as unknown as object,
      codeBundleDraftJson: buildDefaultLandingCodeBundleFromOffer({
        offer: {
          ...previewOffer,
          approvedFacts: previewOffer.approvedFacts,
          ctaLabel: previewOffer.ctaLabel,
          visualTheme: previewOffer.visualTheme,
          colorPalette: defaultDraft.colorPalette,
          typographyStyle: defaultDraft.typographyStyle,
          layoutStyle: defaultDraft.layoutStyle
        },
        summary: "Bundle inicial criado para uma nova sessao de landing.",
        source: "fallback"
      }) as unknown as object,
      chatHistoryJson: []
    } as any
  });
  logEvent("info", "landing.creation.session.created", { sessionId: session.id });
  return session;
}

async function getLandingCreationSessionOrThrow(sessionId: number): Promise<LandingCreationSessionRecord> {
  const session = await prisma.landingCreationSession.findUnique({
    where: { id: sessionId }
  }) as LandingCreationSessionRecord | null;
  if (!session) throw new Error("Sessao de criacao nao encontrada.");
  return session;
}

async function runLandingCreationChatTurn(sessionId: number, userMessage: string, options?: { absorbAskAnswer?: boolean; askAnswers?: Record<string, string> | null }) {
  const session = await getLandingCreationSessionOrThrow(sessionId);
  const draft = normalizeLandingCreationDraft(session.offerDraftJson);
  const history = normalizeLandingCreationHistory(session.chatHistoryJson);
  const currentPlanner = normalizeLandingPlannerState(draft.planner, buildFallbackLandingPlannerState(draft));
  const askAnswerSummary =
    options?.askAnswers && Object.keys(options.askAnswers).length > 0
      ? Object.entries(options.askAnswers).map(([key, value]) => `${key}: ${value}`).join("\n")
      : "";
  const requestDraft = options?.absorbAskAnswer
    ? applyAskAnswersToDraft(
        applyAskAnswerToDraft(draft, currentPlanner.activeQuestionId, userMessage),
        options?.askAnswers || null
      )
    : draft;
  const userEntry: LandingCreationHistoryMessage = {
    id: `user-${crypto.randomUUID()}`,
    role: "user" as const,
    kind: "chat" as const,
    content: utf8Text(userMessage || askAnswerSummary).trim(),
    createdAt: new Date().toISOString()
  };
  const nextHistory = [
    ...history,
    userEntry
  ];
  const simpleTopic = !options?.absorbAskAnswer && history.length <= 2 ? extractSimpleLandingTopic(userMessage) : null;
  if (simpleTopic) {
    const nextDraft = buildFastLandingDraftFromTopic(simpleTopic, requestDraft);
    const assistantContent = [
      `Planejamento inicial da landing de ${toTitleCase(simpleTopic)}:`,
      "1. Hero direto com promessa clara do curso.",
      "2. Blocos com beneficios e aplicacoes praticas.",
      `3. Direcao visual base: ${nextDraft.colorPalette}.`,
      `4. Tipografia: ${nextDraft.typographyStyle}.`,
      `5. Estrutura: ${nextDraft.layoutStyle}.`,
      "Se essa base estiver certa, eu sigo para o preview."
    ].join("\n");
    const nextCreatedAt = new Date().toISOString();
    const updatedHistory = [
      ...nextHistory,
      {
        id: `assistant-${crypto.randomUUID()}`,
        role: "assistant" as const,
        kind: "planner" as const,
        content: assistantContent,
        thinking: nextDraft.planner?.planSummary || undefined,
        createdAt: nextCreatedAt
      }
    ];
    const previewOffer = buildPreviewOfferFromDraft(nextDraft);
    const updated = await prisma.landingCreationSession.update({
      where: { id: sessionId },
      data: {
        title: nextDraft.title || session.title || "Nova landing",
        status: "draft",
        offerDraftJson: nextDraft,
        builderDraftJson: buildLandingBuilderDraftFromDraft(nextDraft) as unknown as object,
        codeBundleDraftJson: buildDefaultLandingCodeBundleFromOffer({
          offer: {
            ...previewOffer,
            approvedFacts: previewOffer.approvedFacts,
            ctaLabel: previewOffer.ctaLabel,
            visualTheme: previewOffer.visualTheme,
            colorPalette: nextDraft.colorPalette,
            typographyStyle: nextDraft.typographyStyle,
            layoutStyle: nextDraft.layoutStyle
          },
          summary: `Bundle base criado instantaneamente para ${previewOffer.title}.`,
          source: "fallback"
        }) as unknown as object,
        previewSectionsJson: null,
        chatHistoryJson: updatedHistory
      } as any
    });
    logEvent("info", "landing.creation.chat.fast_path", {
      sessionId,
      topic: simpleTopic,
      title: nextDraft.title
    });
    return updated;
  }
  const plannerHistory = nextHistory
    .slice(-LANDING_PLANNER_HISTORY_LIMIT)
    .map((message) => ({
      role: message.role,
      content: message.content
    }));

  logEvent("info", "landing.creation.chat.started", {
    sessionId,
    messageLength: userMessage.length
  });
  const { response: resp, selectedModel, fallbackUsed } = await callOpenAIResponsesWithRouting({
    taskType: "landing_planner",
    input: buildLandingCreationPromptInput({
      currentDraft: requestDraft,
      history: plannerHistory
    }),
    maxOutputTokens: 1200,
    metadata: { sessionId }
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    logEvent("error", "landing.creation.chat.failed", {
      sessionId,
      selectedModel,
      fallbackUsed,
      statusCode: resp.status,
      message: detail
    });
    throw new Error(`Falha ao conversar com a IA (${resp.status}).`);
  }

  const data = await resp.json();
  const parsed = extractFirstJsonObject(parseResponseOutputText(data));
  if (!parsed) {
    logEvent("error", "landing.creation.chat.failed", { sessionId, message: "json_invalido" });
    throw new Error("A resposta da IA veio sem JSON valido.");
  }

  const assistantMessage =
    typeof parsed.assistantMessage === "string" && parsed.assistantMessage.trim()
      ? utf8Text(parsed.assistantMessage).trim()
      : "Rascunho atualizado. Pode seguir com mais detalhes ou gerar o preview.";
  const nextDraft = normalizeLandingCreationDraft(parsed.draft, requestDraft);
  const planner = buildLandingPlannerStateFromAiResponse(parsed, nextDraft);
  nextDraft.planner = planner;
  const {
    content: nextAssistantContent,
    thinking: nextAssistantThinking,
    stageSummary
  } = buildLandingPlannerAssistantMessage(planner, assistantMessage);
  const persistedHistory = options?.absorbAskAnswer ? history : nextHistory;
  const plannerTurn = planner.shouldAsk || Boolean(options?.absorbAskAnswer);
  const plannerMessageId = plannerTurn
    ? planner.activeMessageId || currentPlanner.activeMessageId || `planner-${crypto.randomUUID()}`
    : null;
  const nextCreatedAt = new Date().toISOString();

  planner.activeMessageId = plannerTurn ? plannerMessageId : null;
  planner.activeQuestionId = planner.askQueue[0]?.id || null;
  planner.stageSummary = stageSummary;
  nextDraft.planner = planner;

  const updatedHistory = plannerTurn && plannerMessageId
    ? (() => {
        const nextPlannerMessage: LandingCreationHistoryMessage = {
          id: plannerMessageId,
          role: "assistant",
          kind: "planner",
          plannerMessageId,
          isMutable: true,
          content: nextAssistantContent,
          ...(nextAssistantThinking ? { thinking: nextAssistantThinking } : {}),
          createdAt: nextCreatedAt
        };
        const existingIndex = persistedHistory.findIndex((entry) => entry.id === plannerMessageId || entry.plannerMessageId === plannerMessageId);
        if (existingIndex >= 0) {
          return persistedHistory.map((entry, index) => (index === existingIndex ? nextPlannerMessage : entry));
        }
        return [...persistedHistory, nextPlannerMessage];
      })()
    : [
        ...persistedHistory,
        {
          id: `assistant-${crypto.randomUUID()}`,
          role: "assistant" as const,
          kind: "chat" as const,
          content: nextAssistantContent,
          ...(nextAssistantThinking ? { thinking: nextAssistantThinking } : {}),
          createdAt: nextCreatedAt
        }
      ];

  const updated = await prisma.landingCreationSession.update({
    where: { id: sessionId },
    data: {
      title: nextDraft.title || session.title || "Nova landing",
      status: "draft",
      offerDraftJson: nextDraft,
      builderDraftJson: buildLandingBuilderDraftFromDraft(nextDraft) as unknown as object,
      codeBundleDraftJson: buildDefaultLandingCodeBundleFromOffer({
        offer: {
          ...buildPreviewOfferFromDraft(nextDraft),
          approvedFacts: buildPreviewOfferFromDraft(nextDraft).approvedFacts,
          ctaLabel: buildPreviewOfferFromDraft(nextDraft).ctaLabel,
          visualTheme: buildPreviewOfferFromDraft(nextDraft).visualTheme,
          colorPalette: nextDraft.colorPalette,
          typographyStyle: nextDraft.typographyStyle,
          layoutStyle: nextDraft.layoutStyle
        },
        summary: "Bundle base recalculado a partir da conversa mais recente.",
        source: "fallback"
      }) as unknown as object,
      chatHistoryJson: updatedHistory
    } as any
  });
  logEvent("info", "landing.creation.chat.succeeded", { sessionId });
  return updated;
}

async function generateLandingPreviewForSession(sessionId: number, payload: unknown) {
  const session = await getLandingCreationSessionOrThrow(sessionId);
  const currentDraft = normalizeLandingCreationDraft(session.offerDraftJson);
  const currentPromptDraft = mergeLandingPromptPayload(buildDefaultLandingPromptValues(), session.promptDraftJson);
  const mergedDraft = normalizeLandingCreationDraft(
    typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>).offerDraft : undefined,
    currentDraft
  );
  const promptDraft = mergeLandingPromptPayload(
    currentPromptDraft,
    typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>).promptDraft : undefined
  );
  const leadContext = normalizeLandingLeadContext(
    typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>).leadContext : undefined
  );
  const hasStoredPreview = Boolean(session.previewSectionsJson && typeof session.previewSectionsJson === "object");
  const hasStoredBundle = Boolean(session.codeBundleDraftJson && typeof session.codeBundleDraftJson === "object");
  const nextPreviewKey = buildLandingPreviewCacheKey({ draft: mergedDraft, promptDraft, leadContext });
  const currentPreviewKey = buildLandingPreviewCacheKey({
    draft: currentDraft,
    promptDraft: currentPromptDraft,
    leadContext: undefined
  });

  if (hasStoredPreview && hasStoredBundle && nextPreviewKey === currentPreviewKey) {
    logEvent("info", "landing.creation.preview.reused", { sessionId });
    return session;
  }

  const previewOffer = buildPreviewOfferFromDraft(mergedDraft);
  const landingCodeBundle = await generateLandingCodeBundleForOfferData({
    offer: {
      title: previewOffer.title,
      slug: previewOffer.slug,
      shortDescription: previewOffer.shortDescription,
      durationLabel: previewOffer.durationLabel,
      modality: previewOffer.modality,
      approvedFacts: previewOffer.approvedFacts,
      ctaLabel: previewOffer.ctaLabel,
      visualTheme: previewOffer.visualTheme,
      colorPalette: mergedDraft.colorPalette,
      typographyStyle: mergedDraft.typographyStyle,
      layoutStyle: mergedDraft.layoutStyle
    },
    promptConfig: promptDraft,
    leadContext,
    eventMeta: {
      eventPrefix: "landing.creation.preview",
      sessionId,
      offerId: null,
      slug: previewOffer.slug
    }
  });
  const sectionsJson = buildFallbackLandingSectionsFromOffer({
    offer: {
      title: previewOffer.title,
      slug: previewOffer.slug,
      shortDescription: previewOffer.shortDescription,
      durationLabel: previewOffer.durationLabel,
      modality: previewOffer.modality,
      approvedFacts: previewOffer.approvedFacts,
      ctaLabel: previewOffer.ctaLabel,
      visualTheme: previewOffer.visualTheme
    }
  });
  const builderDocument = buildLandingBuilderDocument({
    offer: {
      title: previewOffer.title,
      slug: previewOffer.slug,
      shortDescription: previewOffer.shortDescription,
      durationLabel: previewOffer.durationLabel,
      modality: previewOffer.modality,
      approvedFacts: previewOffer.approvedFacts,
      ctaLabel: previewOffer.ctaLabel
    },
    sections: sectionsJson as Record<string, unknown>
  });

  const updated = await prisma.landingCreationSession.update({
    where: { id: sessionId },
    data: {
      title: mergedDraft.title || session.title || "Nova landing",
      status: "preview_ready",
      offerDraftJson: mergedDraft,
      promptDraftJson: promptDraft,
      builderDraftJson: builderDocument as unknown as object,
      codeBundleDraftJson: landingCodeBundle as unknown as object,
      previewSectionsJson: sectionsJson as object
    } as any
  });
  logEvent("info", "landing.creation.preview.generated", { sessionId });
  return updated;
}

async function saveLandingCreationPrompt(sessionId: number, payload: unknown) {
  const session = await getLandingCreationSessionOrThrow(sessionId);
  const nextPrompt = mergeLandingPromptPayload(
    mergeLandingPromptPayload(buildDefaultLandingPromptValues(), session.promptDraftJson),
    payload
  );
  return prisma.landingCreationSession.update({
    where: { id: sessionId },
    data: {
      promptDraftJson: nextPrompt
    }
  });
}

async function publishLandingCreationSession(sessionId: number, payload: unknown) {
  const session = await getLandingCreationSessionOrThrow(sessionId);
  const draft = normalizeLandingCreationDraft(
    typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>).offerDraft : undefined,
    normalizeLandingCreationDraft(session.offerDraftJson)
  );
  const promptDraft = mergeLandingPromptPayload(
    mergeLandingPromptPayload(buildDefaultLandingPromptValues(), session.promptDraftJson),
    typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>).promptDraft : undefined
  );
  const readiness = computeLandingDraftReadiness(draft);
  if (!readiness.canPublish) {
    throw new Error(`Campos obrigatorios para publicar: ${readiness.missingPublishFields.join(", ")}`);
  }

  const offerData = {
    title: draft.title,
    slug: draft.slug,
    aliases: draft.aliases,
    durationLabel: draft.durationLabel || null,
    modality: draft.modality || null,
    shortDescription: draft.shortDescription || null,
    approvedFacts: draft.approvedFacts,
    ctaLabel: draft.ctaLabel,
    ctaUrl: draft.ctaUrl,
    visualTheme: buildLandingDesignSummary(draft) || null,
    isActive: draft.isActive
  };

  let offerId = session.publishedOfferId || null;
  if (offerId) {
    await prisma.offer.update({
      where: { id: offerId },
      data: offerData
    });
  } else {
    const createdOffer = await prisma.offer.create({ data: offerData });
      offerId = createdOffer.id;
  }

  const hasStoredPreview = session.previewSectionsJson && typeof session.previewSectionsJson === "object";
  const hasStoredBundle = session.codeBundleDraftJson && typeof session.codeBundleDraftJson === "object";
  if (hasStoredPreview) {
    logEvent("info", "landing.creation.publish.started", {
      sessionId,
      offerId,
      slug: offerData.slug,
      source: "cached_preview"
    });
  }

  const sectionsJson = hasStoredPreview
    ? session.previewSectionsJson
    : buildFallbackLandingSectionsFromOffer({
        offer: {
          title: offerData.title,
          slug: offerData.slug,
          shortDescription: offerData.shortDescription,
          durationLabel: offerData.durationLabel,
          modality: offerData.modality,
          approvedFacts: offerData.approvedFacts,
          ctaLabel: offerData.ctaLabel,
          visualTheme: offerData.visualTheme
        }
      });
  const landingCodeBundle = hasStoredBundle
    ? session.codeBundleDraftJson
    : await generateLandingCodeBundleForOfferData({
        offer: {
          title: offerData.title,
          slug: offerData.slug,
          shortDescription: offerData.shortDescription,
          durationLabel: offerData.durationLabel,
          modality: offerData.modality,
          approvedFacts: offerData.approvedFacts,
          ctaLabel: offerData.ctaLabel,
          visualTheme: offerData.visualTheme,
          colorPalette: draft.colorPalette,
          typographyStyle: draft.typographyStyle,
          layoutStyle: draft.layoutStyle
        },
        promptConfig: promptDraft,
        eventMeta: {
          eventPrefix: "landing.creation.publish",
          sessionId,
          offerId,
          slug: offerData.slug
        }
      });

  const latest = await prisma.landingPage.findFirst({
    where: { offerId },
    orderBy: { version: "desc" }
  });
  await prisma.landingPage.updateMany({
    where: { offerId, status: "published" },
    data: { status: "archived" }
  });

  const landingPage = await prisma.landingPage.create({
    data: {
      offerId,
      version: (latest?.version || 0) + 1,
      status: "published",
      sectionsJson: sectionsJson as object,
      builderDocumentJson: buildLandingBuilderDocument({
        offer: {
          title: offerData.title,
          slug: offerData.slug,
          shortDescription: offerData.shortDescription,
          durationLabel: offerData.durationLabel,
          modality: offerData.modality,
          approvedFacts: offerData.approvedFacts,
          ctaLabel: offerData.ctaLabel
        },
        sections: sectionsJson as Record<string, unknown>,
        version: (latest?.version || 0) + 1
      }) as unknown as object,
      landingCodeBundleJson: landingCodeBundle as object,
      promptSnapshot: promptDraft,
      sourceFactsSnapshot: draft,
      publishedAt: new Date()
    } as any
  });
  let artifactMeta: { key: string; url: string | null } | null = null;
  try {
    artifactMeta = await uploadLandingArtifactToR2({
      offerId,
      landingPageId: landingPage.id,
      slug: offerData.slug,
      version: landingPage.version,
      payload: {
        kind: "landing-published-artifact-v1",
        publishedAt: new Date().toISOString(),
        offer: offerData,
        landing: {
          id: landingPage.id,
          version: landingPage.version,
          status: landingPage.status,
          sectionsJson,
          landingCodeBundleJson: landingCodeBundle,
          builderDocumentJson: buildLandingBuilderDocument({
            offer: {
              title: offerData.title,
              slug: offerData.slug,
              shortDescription: offerData.shortDescription,
              durationLabel: offerData.durationLabel,
              modality: offerData.modality,
              approvedFacts: offerData.approvedFacts,
              ctaLabel: offerData.ctaLabel
            },
            sections: sectionsJson as Record<string, unknown>,
            version: landingPage.version
          })
        }
      }
    });
    logEvent("info", "landing.creation.artifact_uploaded", {
      sessionId,
      offerId,
      landingPageId: landingPage.id,
      assetKey: artifactMeta?.key || null,
      assetUrl: artifactMeta?.url || null
    });
  } catch (err) {
    logEvent("error", "landing.creation.artifact_upload_failed", {
      sessionId,
      offerId,
      landingPageId: landingPage.id,
      message: formatError(err)
    });
  }

  const updatedSession = await prisma.landingCreationSession.update({
    where: { id: sessionId },
    data: {
      title: draft.title,
      status: "published",
      offerDraftJson: draft,
      promptDraftJson: promptDraft,
      builderDraftJson: buildLandingBuilderDocument({
        offer: {
          title: offerData.title,
          slug: offerData.slug,
          shortDescription: offerData.shortDescription,
          durationLabel: offerData.durationLabel,
          modality: offerData.modality,
          approvedFacts: offerData.approvedFacts,
          ctaLabel: offerData.ctaLabel
        },
        sections: sectionsJson as Record<string, unknown>,
        version: (latest?.version || 0) + 1
      }) as unknown as object,
      codeBundleDraftJson: landingCodeBundle as object,
      previewSectionsJson: sectionsJson as object,
      publishedOfferId: offerId
    } as any
  });
  logEvent("info", "landing.creation.published", {
    sessionId,
    offerId,
    landingPageId: landingPage.id,
    assetKey: artifactMeta?.key || null,
    assetUrl: artifactMeta?.url || null
  });
  return { session: updatedSession, landingPage };
}

async function publishLandingPage(offerId: number, landingPageId?: number) {
  const target = landingPageId
    ? await prisma.landingPage.findUnique({ where: { id: landingPageId } })
    : await prisma.landingPage.findFirst({
      where: { offerId },
      orderBy: { version: "desc" }
    });
  if (!target || target.offerId !== offerId) {
    throw new Error("Landing nao encontrada para publicacao.");
  }

  await prisma.landingPage.updateMany({
    where: {
      offerId,
      status: "published"
    },
    data: {
      status: "archived"
    }
  });

  const published = await prisma.landingPage.update({
    where: { id: target.id },
    data: {
      status: "published",
      publishedAt: new Date()
    }
  });
  try {
    const artifact = await uploadLandingArtifactToR2({
      offerId,
      landingPageId: published.id,
      slug: String((target.sourceFactsSnapshot as Record<string, unknown> | null)?.slug || `offer-${offerId}`),
      version: published.version,
      payload: {
        kind: "landing-published-artifact-v1",
        publishedAt: new Date().toISOString(),
        offerId,
        landing: {
          id: published.id,
          version: published.version,
          status: published.status,
          sectionsJson: target.sectionsJson,
          builderDocumentJson: (target as Record<string, unknown>).builderDocumentJson || null,
          landingCodeBundleJson: (target as Record<string, unknown>).landingCodeBundleJson || null
        }
      }
    });
    logEvent("info", "landing.publish.artifact_uploaded", {
      offerId,
      landingPageId: published.id,
      assetKey: artifact?.key || null,
      assetUrl: artifact?.url || null
    });
  } catch (err) {
    logEvent("error", "landing.publish.artifact_upload_failed", {
      offerId,
      landingPageId: published.id,
      message: formatError(err)
    });
  }
  return published;
}

async function ensurePublishedLandingForOffer(offerId: number, leadContext?: {
  interestedCourse?: string | null;
  courseMode?: string | null;
  objective?: string | null;
  level?: string | null;
  summary?: string | null;
}) {
  const existing = await prisma.landingPage.findFirst({
    where: {
      offerId,
      status: "published"
    },
    orderBy: { publishedAt: "desc" }
  });
  if (existing) return existing;
  const generated = await generateLandingPageForOffer(offerId, leadContext);
  return publishLandingPage(offerId, generated.id);
}

async function ensureLandingDelivery(contact: {
  id: number;
  waId: string;
  handoffNeeded: boolean;
}, offer: {
  id: number;
  slug: string;
}, page: {
  id: number;
}) {
  const existing = await prisma.landingDelivery.findFirst({
    where: {
      contactId: contact.id,
      offerId: offer.id,
      landingPageId: page.id
    }
  });
  if (existing) return existing;

  const token = signLandingDeliveryToken({
    contactId: contact.id,
    offerId: offer.id,
    landingPageId: page.id
  });

  return prisma.landingDelivery.create({
    data: {
      contactId: contact.id,
      offerId: offer.id,
      landingPageId: page.id,
      token,
      deliveryChannel: "whatsapp"
    }
  });
}

function extractWebhookData(payload: unknown): { waId: string | null; waMessageId: string | null } {
  const msg = (payload as any)?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  const waId = normalizeWaId(String(msg?.from || ""));
  const waMessageId = typeof msg?.id === "string" && msg.id.trim() ? msg.id.trim() : null;
  return {
    waId: waId || null,
    waMessageId
  };
}

function buildWebhookDedupeKey(payload: unknown, waMessageId: string | null): string {
  if (waMessageId) {
    return `wa:${waMessageId}`;
  }

  const hash = crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  return `payload:${hash}`;
}

function isValidMetaWebhookSignature(req: express.Request, rawBody?: Buffer): boolean {
  if (!rawBody || !META_APP_SECRET) return false;

  const signatureHeader = req.headers["x-hub-signature-256"];
  const rawSignature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  if (!rawSignature || !rawSignature.startsWith("sha256=")) {
    return false;
  }

  const digest = crypto
    .createHmac("sha256", META_APP_SECRET)
    .update(rawBody)
    .digest("hex");

  return safeEqual(rawSignature, `sha256=${digest}`);
}

async function enqueueWebhookEvent(payload: unknown, requestId: string) {
  const { waId, waMessageId } = extractWebhookData(payload);
  const dedupeKey = buildWebhookDedupeKey(payload, waMessageId);

  try {
    return await prisma.webhookEvent.create({
      data: {
        requestId,
        waId,
        waMessageId,
        dedupeKey,
        payload: payload as object,
        status: "pending",
        nextAttemptAt: new Date()
      }
    });
  } catch (err) {
    if (isPrismaUniqueError(err)) return null;
    throw err;
  }
}

function computeBackoffMs(attempt: number): number {
  return Math.min(60000, 1000 * 2 ** Math.max(0, attempt - 1));
}

async function processWebhookQueueTick(): Promise<void> {
  if (webhookWorkerInProgress) return;
  webhookWorkerInProgress = true;

  try {
    for (let i = 0; i < 10; i++) {
      const now = new Date();
      const candidate = await prisma.webhookEvent.findFirst({
        where: {
          status: { in: ["pending", "failed"] },
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }]
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }]
      });

      if (!candidate) break;

      const claimed = await prisma.webhookEvent.updateMany({
        where: {
          id: candidate.id,
          status: candidate.status
        },
        data: {
          status: "processing",
          lockedAt: new Date()
        }
      });

      if (claimed.count === 0) continue;

      try {
        await processIncomingWebhook(candidate.payload, {
          requestId: candidate.requestId,
          eventId: candidate.id
        });

        const updated = await prisma.webhookEvent.update({
          where: { id: candidate.id },
          data: {
            status: "done",
            processedAt: new Date(),
            lockedAt: null,
            lastError: null
          }
        });
        broadcastEvent("webhook_event_updated", {
          webhookEventId: updated.id,
          status: updated.status,
          attemptCount: updated.attemptCount,
          waId: updated.waId,
          waMessageId: updated.waMessageId
        });
      } catch (err) {
        const attemptCount = candidate.attemptCount + 1;
        const dead = attemptCount >= WEBHOOK_MAX_RETRIES;
        const nextAttemptAt = dead ? null : new Date(Date.now() + computeBackoffMs(attemptCount));

        const updated = await prisma.webhookEvent.update({
          where: { id: candidate.id },
          data: {
            status: dead ? "dead" : "failed",
            attemptCount,
            nextAttemptAt,
            lockedAt: null,
            lastError: formatError(err)
          }
        });

        logEvent("error", "webhook.processing.failed", {
          requestId: updated.requestId,
          eventId: updated.id,
          waId: updated.waId,
          waMessageId: updated.waMessageId,
          status: updated.status,
          attemptCount: updated.attemptCount,
          error: updated.lastError
        });

        broadcastEvent("webhook_event_failed", {
          webhookEventId: updated.id,
          status: updated.status,
          attemptCount: updated.attemptCount,
          waId: updated.waId,
          waMessageId: updated.waMessageId,
          error: updated.lastError
        });

        broadcastEvent("webhook_event_updated", {
          webhookEventId: updated.id,
          status: updated.status,
          attemptCount: updated.attemptCount,
          waId: updated.waId,
          waMessageId: updated.waMessageId,
          error: updated.lastError
        });
      }
    }
  } finally {
    webhookWorkerInProgress = false;
  }
}

async function processIncomingWebhook(
  payload: unknown,
  context?: { requestId?: string; eventId?: number }
): Promise<void> {
  await syncRuntimeAIConfigFromDatabase();

  const requestId = context?.requestId || "system";
  const msg = (payload as any)?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!msg) return;

  const waIdRaw = msg.from as string | undefined;
  const waId = normalizeWaId(waIdRaw || "");
  const waMessageId = msg.id as string | undefined;
  const profileNameRaw = (payload as any)?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name;
  const profileName = typeof profileNameRaw === "string" && profileNameRaw.trim() ? utf8Text(profileNameRaw.trim()) : null;
  if (!waId) return;

  const defaultStageId = await getDefaultStageId();
  const contact = await prisma.contact.upsert({
    where: { waId },
    update: {
      name: profileName || undefined,
      lastInteractionAt: new Date()
    },
    create: {
      waId,
      name: profileName,
      stageId: defaultStageId,
      leadStatus: "open",
      botEnabled: true,
      lastInteractionAt: new Date()
    }
  });

  logEvent("info", "webhook.message.accepted", {
    requestId,
    eventId: context?.eventId ?? null,
    waId,
    waMessageId: waMessageId || null,
    contactId: contact.id,
    messageType: msg.type
  });

  if (msg.type !== "text" && msg.type !== "audio") {
    const inMsg = await prisma.message.create({
      data: {
        contactId: contact.id,
        direction: "in",
        body: `[${msg.type}]`,
        waMessageId: waMessageId || null
      }
    }).catch((err: unknown) => {
      if (isPrismaUniqueError(err)) return null;
      throw err;
    });

    if (inMsg) broadcastMessage(waId, contact.id, { id: inMsg.id, direction: "in", body: inMsg.body, createdAt: inMsg.createdAt });

    if (!(contact as any).botEnabled) return;

    const fallback = "Por enquanto eu sÃ³ entendo texto e Ã¡udio ðŸ™‚";
    await sendWhatsAppText(waId, fallback);
    const outFallback = await prisma.message.create({
      data: {
        contactId: contact.id,
        direction: "out",
        body: fallback,
        waMessageId: null
      }
    });
    broadcastMessage(waId, contact.id, { id: outFallback.id, direction: "out", body: outFallback.body, createdAt: outFallback.createdAt });
    return;
  }

  let textIn = "";
  if (msg.type === "audio") {
    const audioId = msg.audio?.id;
    if (audioId) {
      await sendWhatsAppTypingIndicator(waMessageId);
      textIn = await transcribeAudio(audioId).catch((err) => {
        console.error("Transcription error:", err);
        return "[Ãudio nÃ£o pÃ´de ser transcrito]";
      });
    } else {
      textIn = "[Ãudio]";
    }
  } else {
    textIn = (msg.text?.body as string | undefined) || "";
  }

  textIn = utf8Text(textIn);

  if (!textIn && msg.type === "text") return;

  let inboundMsg: { id: number; direction: string; body: string; createdAt: Date } | null = null;
  try {
    inboundMsg = await prisma.message.create({
      data: {
        contactId: contact.id,
        direction: "in",
        body: textIn,
        waMessageId: waMessageId || null
      }
    });
  } catch (err) {
    if (isPrismaUniqueError(err)) return;
    throw err;
  }

  if (inboundMsg) broadcastMessage(waId, contact.id, { id: inboundMsg.id, direction: "in", body: inboundMsg.body, createdAt: inboundMsg.createdAt });

  if (!(contact as any).botEnabled) return;
  scheduleAutoReply(contact.id, waId, waMessageId);
}

function scheduleAutoReply(contactId: number, waId: string, waMessageId?: string): void {
  autoReplyContextByContact.set(contactId, { waId, waMessageId });

  const existingTimer = autoReplyTimers.get(contactId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timer = setTimeout(() => {
    autoReplyTimers.delete(contactId);
    void runAutoReplyForContact(contactId);
  }, runtimeAIReplyDebounceMs);

  autoReplyTimers.set(contactId, timer);
}

async function buildHistoryForAutoReply(contactId: number): Promise<{
  history: Array<{ role: "user" | "assistant"; content: string }>;
  pendingInput: string;
  pendingCount: number;
}> {
  const historyTake = Math.max(24, runtimeHistoryLimit + 8);
  const rows = await prisma.message.findMany({
    where: { contactId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: historyTake
  });

  if (rows.length === 0) {
    return { history: [], pendingInput: "", pendingCount: 0 };
  }

  let lastOutboundIndex = -1;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].direction === "out") {
      lastOutboundIndex = i;
      break;
    }
  }

  const pendingInbound = rows
    .slice(lastOutboundIndex + 1)
    .filter((message) => message.direction === "in");

  if (pendingInbound.length === 0) {
    return { history: [], pendingInput: "", pendingCount: 0 };
  }

  const pendingToRespond = pendingInbound.slice(0, 2);
  const keepFromHistory = Math.max(0, runtimeHistoryLimit - pendingToRespond.length);
  const historyBeforePending = rows.slice(0, lastOutboundIndex + 1).slice(-keepFromHistory);
  const promptRows = [...historyBeforePending, ...pendingToRespond];

  const history = promptRows.map((message) => ({
    role: (message.direction === "in" ? "user" : "assistant") as "user" | "assistant",
    content: message.body
  }));

  return {
    history,
    pendingInput: pendingToRespond.map((message) => message.body).join("\n"),
    pendingCount: pendingInbound.length
  };
}

async function runAutoReplyForContact(contactId: number): Promise<void> {
  if (autoReplyProcessingContacts.has(contactId)) {
    return;
  }

  await syncRuntimeAIConfigFromDatabase();

  const context = autoReplyContextByContact.get(contactId);
  if (!context) {
    return;
  }

  autoReplyProcessingContacts.add(contactId);
  try {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: {
        id: true,
        waId: true,
        botEnabled: true,
        customBotPersona: true
      }
    });

    if (!contact || !contact.botEnabled) {
      return;
    }

    const { history, pendingInput, pendingCount } = await buildHistoryForAutoReply(contactId);
    if (!pendingInput || history.length === 0) {
      return;
    }

    if (pendingCount > 2) {
      logEvent("info", "ai.reply.pending_messages_capped", {
        contactId,
        waId: contact.waId,
        pendingCount,
        usedCount: 2
      });
    }

    broadcastEvent("bot_thinking", { contactId: contact.id, waId: contact.waId, step: "Pensando..." });
    const faqContext = await getFaqContextForInput(pendingInput);
    broadcastEvent("bot_thinking", { contactId: contact.id, waId: contact.waId, step: "Consultando base de conhecimento..." });
    await sendWhatsAppTypingIndicator(context.waMessageId);
    const personaOverride = typeof contact.customBotPersona === "string" && contact.customBotPersona.trim()
      ? contact.customBotPersona.trim()
      : undefined;
    broadcastEvent("bot_thinking", { contactId: contact.id, waId: contact.waId, step: "Gerando resposta..." });
    const reply = await generateReplyWithTyping(history, faqContext, personaOverride, context.waMessageId).catch((err) => {
      console.error("OpenAI error:", err);
      broadcastEvent("bot_thinking_done", { contactId: contact.id, waId: contact.waId });
      return "Desculpe, tive um problema aqui. Pode repetir?";
    });

    const safeReply = utf8Text(reply);
    await delay(getHumanDelayMs(safeReply));
    await sendWhatsAppText(contact.waId, safeReply);
    const outMsg = await prisma.message.create({
      data: {
        contactId: contact.id,
        direction: "out",
        body: safeReply,
        waMessageId: null
      }
    });

    broadcastEvent("bot_thinking_done", { contactId: contact.id, waId: contact.waId });
    broadcastMessage(contact.waId, contact.id, {
      id: outMsg.id,
      direction: "out",
      body: safeReply,
      createdAt: outMsg.createdAt
    });

    setImmediate(() => {
      enrichLeadWithAI(contact.id).catch((err) => {
        console.error("Enrichment error:", err);
      });
      processLeadLandingAutomation(contact.id).catch((err) => {
        console.error("Landing automation error:", err);
      });
    });
  } finally {
    autoReplyProcessingContacts.delete(contactId);
  }
}

async function processLeadLandingAutomation(contactId: number): Promise<void> {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    include: { _count: { select: { messages: true } } }
  });

  if (!contact || contact.handoffNeeded) {
    if (contact) {
      logEvent("info", "landing.send.skipped", {
        contactId: contact.id,
        waId: contact.waId,
        message: "handoff_ativo"
      });
    }
    return;
  }

  // Only auto-send landing page after meaningful engagement (5+ messages)
  // to avoid sending a second message right after the first AI reply
  const messageCount = (contact as any)._count?.messages ?? 0;
  if (messageCount < 5) {
    logEvent("info", "landing.send.skipped", {
      contactId: contact.id,
      waId: contact.waId,
      message: "conversa_curta",
      messageCount
    });
    return;
  }

  const promptSettings = await getGlobalLandingPromptSettings();
  if (!promptSettings.autoGenerateEnabled || !promptSettings.autoSendEnabled) {
    logEvent("info", "landing.send.skipped", {
      contactId: contact.id,
      waId: contact.waId,
      message: "automacao_desativada"
    });
    return;
  }

  if ((contact.interestConfidence || 0) < promptSettings.confidenceThreshold) {
    logEvent("info", "landing.send.skipped", {
      contactId: contact.id,
      waId: contact.waId,
      message: "baixa_confianca",
      interestConfidence: contact.interestConfidence
    });
    return;
  }

  const offer = await findMatchingOffer({
    interestedCourse: contact.interestedCourse,
    courseMode: contact.courseMode,
    durationLabel: null
  });

  if (!offer) {
    logEvent("info", "landing.send.skipped", {
      contactId: contact.id,
      waId: contact.waId,
      message: "oferta_nao_encontrada"
    });
    return;
  }

  logEvent("info", "offer.matched", {
    contactId: contact.id,
    waId: contact.waId,
    offerId: offer.id,
    slug: offer.slug
  });

  const page = await ensurePublishedLandingForOffer(offer.id, {
    interestedCourse: contact.interestedCourse,
    courseMode: contact.courseMode,
    objective: contact.objective,
    level: contact.level,
    summary: contact.aiSummary
  });
  const delivery = await ensureLandingDelivery(contact, offer, page);

  if (contact.lastLandingPageId === page.id && contact.lastLandingOfferId === offer.id) {
    logEvent("info", "landing.send.skipped", {
      contactId: contact.id,
      waId: contact.waId,
      offerId: offer.id,
      landingPageId: page.id,
      message: "versao_ja_enviada"
    });
    return;
  }

  const publicUrl = buildPublicLandingUrl(offer.slug, delivery.token);
  const outbound = utf8Text(`Separei uma pagina com tudo sobre ${offer.title} para voce: ${publicUrl}`);
  await sendWhatsAppText(contact.waId, outbound);
  const outMsg = await prisma.message.create({
    data: {
      contactId: contact.id,
      direction: "out",
      body: outbound,
      waMessageId: null
    }
  });

  await prisma.contact.update({
    where: { id: contact.id },
    data: {
      lastLandingSentAt: new Date(),
      lastLandingOfferId: offer.id,
      lastLandingPageId: page.id
    }
  });

  broadcastMessage(contact.waId, contact.id, {
    id: outMsg.id,
    direction: "out",
    body: outbound,
    createdAt: outMsg.createdAt
  });

  logEvent("info", "landing.sent", {
    contactId: contact.id,
    waId: contact.waId,
    offerId: offer.id,
    landingPageId: page.id,
    deliveryId: delivery.id,
    url: publicUrl
  });
}

async function generateReply(
  history: Array<{ role: "user" | "assistant"; content: string }>,
  faqContext: string,
  persona?: string
): Promise<string> {
  if (!OPENAI_API_KEY || !runtimeOpenAIModel) {
    return "ConfiguraÃ§Ã£o incompleta da IA.";
  }

  const resolvedPersona = typeof persona === "string" && persona.trim()
    ? persona.trim()
    : (await syncRuntimeAIConfigFromDatabase()).persona;

  const { response: resp } = await callOpenAIResponsesWithRouting({
    taskType: "chat_reply",
    input: buildReplyPromptInput({
      history,
      faqContext,
      persona: resolvedPersona
    }),
    maxOutputTokens: 180,
    metadata: {
      message: "resposta_whatsapp"
    }
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`OpenAI HTTP ${resp.status}: ${text}`);
  }

  const data = await resp.json();
  const content = parseResponseOutputText(data);
  return content
    ? content
    : "Desculpe, NÃ£o consegui responder agora.";
}

async function generateReplyWithTyping(
  history: Array<{ role: "user" | "assistant"; content: string }>,
  faqContext: string,
  persona?: string,
  waMessageId?: string
): Promise<string> {
  if (!waMessageId) {
    return generateReply(history, faqContext, persona);
  }

  const interval = setInterval(() => {
    sendWhatsAppTypingIndicator(waMessageId).catch((err) => {
      console.error("Typing indicator error:", err);
    });
  }, 20000);

  try {
    return await generateReply(history, faqContext, persona);
  } finally {
    clearInterval(interval);
  }
}

async function enrichLeadWithAI(contactId: number): Promise<void> {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    include: { messages: { orderBy: { createdAt: "desc" }, take: 30 } }
  });

  if (!contact || contact.messages.length === 0) return;

  const history = contact.messages.slice().reverse().map(m =>
    `${m.direction === "in" ? "Cliente" : "Atendente"}: ${m.body}`
  ).join("\n");
  try {
    const { response: resp } = await callOpenAIResponsesWithRouting({
      taskType: "lead_enrichment",
      input: buildLeadEnrichmentPromptInput(history),
      maxOutputTokens: 300,
      metadata: {
        contactId
      }
    });

    if (!resp.ok) return;

    const data = await resp.json();
    const result = extractFirstJsonObject(parseResponseOutputText(data)) || {};

    const updatedLead = await prisma.contact.update({
      where: { id: contactId },
      data: {
        aiSummary: result.summary && result.summary !== "NÃ£o informado" ? result.summary : undefined,
        age: result.age && result.age !== "NÃ£o informado" ? result.age : undefined,
        level: result.level && result.level !== "NÃ£o informado" ? result.level : undefined,
        objective: result.objective && result.objective !== "NÃ£o informado" ? result.objective : undefined,
        interestedCourse: result.interestedCourse && result.interestedCourse !== "NÃ£o informado" ? result.interestedCourse : undefined,
        courseMode: result.courseMode && result.courseMode !== "NÃ£o informado" ? result.courseMode : undefined,
        email: typeof result.email === "string" ? extractEmailFromText(result.email) || undefined : undefined,
        interestConfidence:
          typeof result.interestConfidence === "number" && Number.isFinite(result.interestConfidence)
            ? Math.max(0, Math.min(1, Number(result.interestConfidence.toFixed(2))))
            : undefined
      },
      include: { stage: true }
    });

    broadcastEvent("lead_updated", { lead: mapLeadDetails(updatedLead) });
  } catch (err) {
    console.error("Enrichment error:", err);
  }
}

async function transcribeAudio(mediaId: string): Promise<string> {
  if (!OPENAI_API_KEY) return "[TranscriÃ§Ã£o desabilitada]";

  try {
    // 1. Get media URL from Meta
    const mediaResp = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
    });
    if (!mediaResp.ok) throw new Error("Falha ao obter URL do Ã¡udio");
    const mediaData = await mediaResp.json();
    const audioUrl = mediaData.url;

    // 2. Download audio file
    const audioContent = await fetch(audioUrl, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
    });
    if (!audioContent.ok) throw new Error("Falha ao baixar Ã¡udio");
    const blob = await audioContent.blob();

    // 3. Send to OpenAI transcription
    const formData = new FormData();
    formData.append("file", blob, "audio.ogg");
    formData.append("model", runtimeOpenAITranscriptionModel);

    const openaiResp = await fetchWithRetry(`${runtimeOpenAIBaseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: formData
    });

    if (!openaiResp.ok) {
      const errText = await openaiResp.text();
      console.error("OpenAI transcription error:", errText);
      throw new Error("Falha na transcriÃ§Ã£o OpenAI");
    }

    const openaiData = await openaiResp.json();
    return openaiData.text || "[Ãudio sem fala detectada]";
  } catch (err) {
    console.error("Transcription pipeline error:", err);
    throw err;
  }
}

async function getActiveFaqsCached(): Promise<Array<{ question: string; answer: string }>> {
  if (cachedActiveFaqsLoadedAt > 0 && (Date.now() - cachedActiveFaqsLoadedAt) < FAQ_CACHE_TTL_MS) {
    return cachedActiveFaqs;
  }

  const activeFaqs = await prisma.faq.findMany({
    where: { isActive: true },
    select: { question: true, answer: true }
  });

  cachedActiveFaqs = activeFaqs;
  cachedActiveFaqsLoadedAt = Date.now();
  return activeFaqs;
}

async function getFaqContextForInput(input: string): Promise<string> {
  const text = input.trim();
  if (!text) return "";

  const activeFaqs = await getActiveFaqsCached();
  if (activeFaqs.length === 0) return "";

  const normalizedInput = normalizeText(text);
  const tokens = tokenizeForMatch(text);

  const ranked = activeFaqs
    .map((faq) => {
      const variants = splitFaqVariants(faq.question);
      const bestVariant = variants
        .map((variant) => ({
          variant,
          score: scoreVariantMatch(normalizedInput, tokens, variant)
        }))
        .sort((a, b) => b.score - a.score)[0];

      const answerTokens = tokenizeForMatch(faq.answer);
      const answerHits = countIntersection(tokens, answerTokens);
      const score = (bestVariant?.score || 0) * 3 + answerHits;
      return {
        question: faq.question,
        answer: faq.answer,
        matchedVariant: bestVariant?.variant || faq.question,
        score
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (ranked.length === 0) return "";

  return ranked
    .map(
      (item, index) =>
        `${index + 1}. Pergunta: ${item.question}\nVariaÃ§Ã£o relevante: ${item.matchedVariant}\nResposta: ${item.answer}`
    )
    .join("\n\n");
}

function tokenizeForMatch(text: string): string[] {
  const cleaned = normalizeText(text).replace(/[^a-z0-9\s]/g, " ");

  const stopWords = new Set([
    "a",
    "o",
    "as",
    "os",
    "de",
    "da",
    "do",
    "das",
    "dos",
    "e",
    "em",
    "para",
    "por",
    "com",
    "um",
    "uma",
    "na",
    "no",
    "nas",
    "nos",
    "que"
  ]);

  const shortAllowed = new Set(["oi", "ola", "opa", "eai", "eae", "hey", "ok"]);

  return cleaned
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => (part.length >= 3 || shortAllowed.has(part)) && !stopWords.has(part));
}

function countIntersection(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const bSet = new Set(b);
  let score = 0;
  for (const token of a) {
    if (bSet.has(token)) score += 1;
  }
  return score;
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitFaqVariants(question: string): string[] {
  return question
    .split(/\r?\n|[;,|]/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function scoreVariantMatch(normalizedInput: string, inputTokens: string[], variant: string): number {
  const normalizedVariant = normalizeText(variant);
  if (!normalizedVariant) return 0;

  const variantTokens = tokenizeForMatch(normalizedVariant);
  const tokenHits = countIntersection(inputTokens, variantTokens);
  let score = tokenHits;

  if (normalizedInput === normalizedVariant) {
    score += 6;
  }

  if (
    normalizedVariant.length >= 2 &&
    (normalizedInput.includes(normalizedVariant) || normalizedVariant.includes(normalizedInput))
  ) {
    score += 4;
  }

  if (variantTokens.length > 0 && variantTokens.every((token) => normalizedInput.includes(token))) {
    score += 2;
  }

  return score;
}

async function sendWhatsAppText(to: string, body: string): Promise<void> {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    console.error("WhatsApp config missing");
    return;
  }

  const url = `https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const resp = await fetchWithRetry(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${WHATSAPP_TOKEN}`
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body, preview_url: false }
    })
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`WhatsApp HTTP ${resp.status}: ${text}`);
  }
}

async function sendWhatsAppTypingIndicator(
  waMessageId?: string
): Promise<void> {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID || !waMessageId) {
    return;
  }

  const url = `https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${WHATSAPP_TOKEN}`
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: waMessageId,
      typing_indicator: { type: "text" }
    })
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    console.error(`Typing indicator HTTP ${resp.status}: ${text}`);
  }
}

async function ensureDefaultStages(): Promise<void> {
  const count = await prisma.pipelineStage.count();
  if (count > 0) return;

  await prisma.pipelineStage.createMany({
    data: DEFAULT_PIPELINE_STAGES.map((stage) => ({
      name: stage.name,
      position: stage.position,
      color: stage.color,
      isActive: true
    })),
    skipDuplicates: true
  });
}

async function getDefaultStageId(): Promise<number | null> {
  if (cachedDefaultStageLoadedAt > 0 && (Date.now() - cachedDefaultStageLoadedAt) < DEFAULT_STAGE_CACHE_TTL_MS) {
    return cachedDefaultStageId;
  }

  await ensureDefaultStages();
  const firstStage = await prisma.pipelineStage.findFirst({
    where: { isActive: true },
    orderBy: { position: "asc" },
    select: { id: true }
  });
  cachedDefaultStageId = firstStage?.id || null;
  cachedDefaultStageLoadedAt = Date.now();
  return cachedDefaultStageId;
}

function normalizeWaId(input: string): string {
  const digits = input.replace(/[^\d]/g, "");
  return digits;
}

function mapLeadSummary(
  contact: {
    id: number;
    waId: string;
    name: string | null;
    email: string | null;
    stageId: number | null;
    leadStatus: string;
    source: string | null;
    notes: string | null;
    botEnabled: boolean;
    customBotPersona: string | null;
    aiSummary: string | null;
    age: string | null;
    level: string | null;
    objective: string | null;
    interestedCourse: string | null;
    courseMode: string | null;
    availability: string | null;
    interestConfidence: number | null;
    qualificationScore: number | null;
    handoffNeeded: boolean;
    lastLandingSentAt: Date | null;
    lastLandingOfferId: number | null;
    lastLandingPageId: number | null;
    lastInteractionAt: Date | null;
    createdAt: Date;
    stage?: { id: number; name: string; color: string; position: number } | null;
    tasks?: Array<{ id: number; title: string; dueAt: Date; priority: string; status: string }>;
    messages?: Array<{ id: number; direction: string; body: string; createdAt: Date }>;
  }
): Record<string, unknown> {
  const latestMessage = contact.messages?.[0] || null;
  return {
    id: contact.id,
    waId: contact.waId,
    name: contact.name,
    email: contact.email,
    stageId: contact.stageId,
    stage: contact.stage || null,
    leadStatus: contact.leadStatus,
    source: contact.source,
    notes: contact.notes,
    botEnabled: contact.botEnabled,
    customBotPersona: contact.customBotPersona,
    aiSummary: contact.aiSummary,
    age: contact.age,
    level: contact.level,
    objective: contact.objective,
    interestedCourse: contact.interestedCourse,
    courseMode: contact.courseMode,
    availability: contact.availability,
    interestConfidence: contact.interestConfidence,
    qualificationScore: contact.qualificationScore,
    handoffNeeded: contact.handoffNeeded,
    lastLandingSentAt: contact.lastLandingSentAt,
    lastLandingOfferId: contact.lastLandingOfferId,
    lastLandingPageId: contact.lastLandingPageId,
    lastInteractionAt: contact.lastInteractionAt,
    createdAt: contact.createdAt,
    openTasks: contact.tasks || [],
    latestMessage
  };
}

function mapLeadDetails(
  contact: {
    id: number;
    waId: string;
    name: string | null;
    email: string | null;
    stageId: number | null;
    leadStatus: string;
    source: string | null;
    notes: string | null;
    botEnabled: boolean;
    customBotPersona: string | null;
    aiSummary: string | null;
    age: string | null;
    level: string | null;
    objective: string | null;
    interestedCourse: string | null;
    courseMode: string | null;
    availability: string | null;
    interestConfidence: number | null;
    qualificationScore: number | null;
    handoffNeeded: boolean;
    lastLandingSentAt: Date | null;
    lastLandingOfferId: number | null;
    lastLandingPageId: number | null;
    lastInteractionAt: Date | null;
    createdAt: Date;
    stage?: { id: number; name: string; color: string; position: number } | null;
    messages?: Array<{ id: number; direction: string; body: string; createdAt: Date }>;
    tasks?: Array<{ id: number; title: string; description: string | null; dueAt: Date; priority: string; status: string; completedAt: Date | null }>;
  }
): Record<string, unknown> {
  return {
    ...mapLeadSummary(contact),
    messages: (contact.messages || []).slice().reverse(),
    tasks: contact.tasks || []
  };
}

type SessionPayload = {
  username: string;
  role: string;
  exp: number;
};

function signSession(input: { username: string; role: string }): string {
  const payload: SessionPayload = {
    username: input.username,
    role: input.role,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_DAYS * 24 * 60 * 60
  };

  const payloadEncoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(payloadEncoded)
    .digest("base64url");

  return `${payloadEncoded}.${signature}`;
}

function verifySession(token: string): SessionPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadEncoded, signature] = parts;
  const expected = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(payloadEncoded)
    .digest("base64url");

  if (!safeEqual(signature, expected)) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadEncoded, "base64url").toString("utf8")) as SessionPayload;
  } catch {
    return null;
  }

  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function setAuthCookie(res: express.Response, token: string): void {
  const maxAge = SESSION_TTL_DAYS * 24 * 60 * 60;
  const cookieParts = [
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/",
    `Max-Age=${maxAge}`,
    shouldUseSecureCookie() ? "Secure" : "",
    cookieSameSiteAttribute(),
    COOKIE_DOMAIN ? `Domain=${COOKIE_DOMAIN}` : ""
  ].filter(Boolean);

  res.setHeader("Set-Cookie", cookieParts.join("; "));
}

function clearAuthCookie(res: express.Response): void {
  const cookieParts = [
    `${AUTH_COOKIE_NAME}=`,
    "HttpOnly",
    "Path=/",
    "Max-Age=0",
    shouldUseSecureCookie() ? "Secure" : "",
    cookieSameSiteAttribute(),
    COOKIE_DOMAIN ? `Domain=${COOKIE_DOMAIN}` : ""
  ].filter(Boolean);

  res.setHeader("Set-Cookie", cookieParts.join("; "));
}

function cookieSameSiteAttribute(): string {
  if (COOKIE_SAMESITE === "none") return "SameSite=None";
  if (COOKIE_SAMESITE === "strict") return "SameSite=Strict";
  return "SameSite=Lax";
}

function shouldUseSecureCookie(): boolean {
  if (COOKIE_SECURE === "true" || COOKIE_SECURE === "1") return true;
  if (COOKIE_SECURE === "false" || COOKIE_SECURE === "0") return false;
  return process.env.NODE_ENV === "production";
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};

  return header.split(";").reduce<Record<string, string>>((acc, part) => {
    const [name, ...valueParts] = part.trim().split("=");
    if (!name || valueParts.length === 0) return acc;
    acc[name] = decodeURIComponent(valueParts.join("="));
    return acc;
  }, {});
}

function getSessionFromRequest(req: express.Request): SessionPayload | null {
  const cookies = parseCookies(req.headers.cookie);
  const raw = cookies[AUTH_COOKIE_NAME];
  if (!raw) return null;

  return verifySession(raw);
}

function requireSession(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const session = getSessionFromRequest(req);
  if (!session) {
    res.status(401).json({ message: "NÃ£o autenticado." });
    return;
  }

  (req as express.Request & { user?: SessionPayload }).user = session;
  next();
}

function getHumanDelayMs(reply: string): number {
  const safeMin = Number.isFinite(runtimeHumanDelayMin) ? runtimeHumanDelayMin : 1200;
  const safeMax = Number.isFinite(runtimeHumanDelayMax) ? runtimeHumanDelayMax : 6500;
  const min = Math.max(0, Math.min(safeMin, safeMax));
  const max = Math.max(min, Math.max(safeMin, safeMax));
  const byLength = Math.max(min, Math.min(max, 800 + reply.length * 45));
  const jitter = Math.floor(Math.random() * 500);
  return Math.min(max, byLength + jitter);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isPrismaUniqueError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}

function isPrismaNotFoundError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2025"
  );
}

// ============================================
// CHAT ENDPOINTS
// ============================================

class ChatService {
  async sendMessage(waId: string, message: string) {
    let contact = await prisma.contact.findUnique({
      where: { waId }
    });

    if (!contact) {
      const defaultStageId = await getDefaultStageId();
      contact = await prisma.contact.create({
        data: {
          waId,
          name: waId,
          stageId: defaultStageId,
          leadStatus: "open",
          botEnabled: false
        }
      });
    }

    await sendWhatsAppText(waId, message);

    const storedMessage = await prisma.message.create({
      data: {
        contactId: contact.id,
        direction: "out",
        body: message
      }
    });

    await prisma.contact.update({
      where: { id: contact.id },
      data: { lastInteractionAt: new Date() }
    });

    // Broadcast via WebSocket
    broadcastMessage(waId, contact.id, {
      id: storedMessage.id,
      direction: storedMessage.direction,
      body: storedMessage.body,
      createdAt: storedMessage.createdAt
    });

    return {
      id: storedMessage.id,
      contactId: contact.id,
      direction: storedMessage.direction,
      body: storedMessage.body,
      createdAt: storedMessage.createdAt
    };
  }

  async getHistory(waId: string, limit: number) {
    const contact = await prisma.contact.findUnique({
      where: { waId }
    });

    if (!contact) {
      return [];
    }

    const messages = await prisma.message.findMany({
      where: { contactId: contact.id },
      orderBy: { createdAt: "desc" },
      take: limit
    });

    return messages.reverse().map((m) => ({
      id: m.id,
      direction: m.direction,
      body: m.body,
      createdAt: m.createdAt
    }));
  }
}

class ChatController {
  private chatService = new ChatService();

  send = async (req: express.Request, res: express.Response): Promise<void> => {
    const waIdRaw = typeof req.body?.wa_id === "string" ? req.body.wa_id.trim() : "";
    const waId = normalizeWaId(waIdRaw);
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";

    if (!waId) {
      res.status(400).json({ message: "WhatsApp ID (wa_id) is required." });
      return;
    }

    if (!message) {
      res.status(400).json({ message: "Message is required." });
      return;
    }

    try {
      const data = await this.chatService.sendMessage(waId, message);
      res.json({
        success: true,
        message: "Message sent successfully.",
        data
      });
    } catch (err) {
      console.error("Error sending chat message:", err);
      res.status(500).json({ message: "Failed to send message." });
    }
  };

  history = async (req: express.Request, res: express.Response): Promise<void> => {
    const waId = normalizeWaId(req.params.waId || "");
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 50)));

    if (!waId) {
      res.status(400).json({ message: "WhatsApp ID (waId) is required." });
      return;
    }

    try {
      const messages = await this.chatService.getHistory(waId, limit);
      res.json({ success: true, messages });
    } catch (err) {
      console.error("Error fetching chat history:", err);
      res.status(500).json({ message: "Failed to fetch chat history." });
    }
  };
}

const chatController = new ChatController();

app.post("/api/chat/send", requireSession, chatController.send);
app.get("/api/chat/history/:waId", requireSession, chatController.history);

// ============================================
// SETTINGS â€” AI CONFIG
// ============================================

let runtimeBotPersona = BOT_PERSONA;
let runtimeOpenAIModel = OPENAI_MODEL;
let runtimeStrongModel = "gpt-5";
let runtimeCheapModel = OPENAI_MODEL;
let runtimeRoutingMode: AIModelRoutingMode = "automatic";
let runtimeTaskOverrides: AIModelTaskOverrides = {
  chatReplyModel: "",
  leadEnrichmentModel: "",
  leadClassificationModel: "",
  landingPlannerModel: "",
  landingGenerationModel: "",
  landingCodeBundleModel: "",
  landingRefineModel: "",
  landingVisualFallbackModel: ""
};
let runtimeLandingPlannerModel = OPENAI_MODEL;
let runtimeLandingVisualModel = GEMINI_MODEL;
let runtimeOpenAIBaseUrl = OPENAI_BASE_URL;
let runtimeOpenAITranscriptionModel = OPENAI_TRANSCRIPTION_MODEL;
let runtimeHistoryLimit = HISTORY_LIMIT;
let runtimeAIReplyDebounceMs = AI_REPLY_DEBOUNCE_MS;
let runtimeHumanDelayMin = HUMAN_DELAY_MIN_MS;
let runtimeHumanDelayMax = HUMAN_DELAY_MAX_MS;
let runtimeAIConfigLastLoadedAt = 0;
let cachedActiveFaqs: Array<{ question: string; answer: string }> = [];
let cachedActiveFaqsLoadedAt = 0;
let cachedDefaultStageId: number | null = null;
let cachedDefaultStageLoadedAt = 0;
const LANDING_PLANNER_HISTORY_LIMIT = 8;

function normalizePositiveInt(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

function normalizeNonNegativeInt(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : fallback;
}

function normalizeRoutingMode(value: unknown): AIModelRoutingMode {
  return value === "manual" ? "manual" : "automatic";
}

function buildDefaultTaskOverrides(): AIModelTaskOverrides {
  return {
    chatReplyModel: "",
    leadEnrichmentModel: "",
    leadClassificationModel: "",
    landingPlannerModel: "",
    landingGenerationModel: "",
    landingCodeBundleModel: "",
    landingRefineModel: "",
    landingVisualFallbackModel: ""
  };
}

function normalizeTaskOverrides(value: unknown): AIModelTaskOverrides {
  const base = buildDefaultTaskOverrides();
  if (!value || typeof value !== "object") return base;

  const record = value as Record<string, unknown>;
  for (const key of Object.keys(base) as Array<keyof AIModelTaskOverrides>) {
    const raw = record[key];
    base[key] = typeof raw === "string" ? raw.trim() : "";
  }

  return base;
}

function buildRoutingDefaults() {
  return {
    strongModel: "gpt-5",
    cheapModel: "gpt-5-mini",
    routingMode: "automatic" as AIModelRoutingMode,
    taskOverrides: buildDefaultTaskOverrides()
  };
}

function buildDefaultAIConfig(): AIConfigValues {
  const routingDefaults = buildRoutingDefaults();
  const defaults = {
    model: OPENAI_MODEL.trim() || routingDefaults.cheapModel,
    strongModel: routingDefaults.strongModel,
    cheapModel: routingDefaults.cheapModel,
    routingMode: routingDefaults.routingMode,
    taskOverrides: routingDefaults.taskOverrides,
    landingPlannerModel: routingDefaults.strongModel,
    landingVisualModel: GEMINI_MODEL.trim() || "gemini-2.5-flash",
    baseUrl: OPENAI_BASE_URL.replace(/\/+$/, "") || "https://api.openai.com/v1",
    transcriptionModel: OPENAI_TRANSCRIPTION_MODEL.trim() || "whisper-1",
    persona: BOT_PERSONA,
    historyLimit: normalizePositiveInt(HISTORY_LIMIT, 20),
    aiReplyDebounceMs: normalizeNonNegativeInt(AI_REPLY_DEBOUNCE_MS, 0),
    humanDelayMinMs: normalizeNonNegativeInt(HUMAN_DELAY_MIN_MS, 1200),
    humanDelayMaxMs: normalizeNonNegativeInt(HUMAN_DELAY_MAX_MS, 6500)
  };

  return {
    ...defaults,
    humanDelayMaxMs: Math.max(defaults.humanDelayMinMs, defaults.humanDelayMaxMs)
  };
}

function mapAIConfigRecord(record: {
  model: string;
  strongModel?: string | null;
  cheapModel?: string | null;
  routingMode?: string | null;
  taskOverrides?: unknown;
  landingPlannerModel?: string | null;
  landingVisualModel?: string | null;
  baseUrl: string;
  transcriptionModel: string;
  persona: string;
  historyLimit: number;
  aiReplyDebounceMs: number;
  humanDelayMinMs: number;
  humanDelayMaxMs: number;
}): AIConfigValues {
  const defaults = buildDefaultAIConfig();
  const humanDelayMinMs = normalizeNonNegativeInt(record.humanDelayMinMs, defaults.humanDelayMinMs);
  const humanDelayMaxMs = Math.max(humanDelayMinMs, normalizeNonNegativeInt(record.humanDelayMaxMs, defaults.humanDelayMaxMs));
  const taskOverrides = normalizeTaskOverrides(record.taskOverrides);
  const cheapModel = record.cheapModel?.trim() || record.model.trim() || defaults.cheapModel;
  const strongModel =
    record.strongModel?.trim() ||
    record.landingPlannerModel?.trim() ||
    defaults.strongModel;
  const landingPlannerModel =
    record.landingPlannerModel?.trim() ||
    taskOverrides.landingPlannerModel ||
    strongModel;

  return {
    model: record.model.trim() || cheapModel,
    strongModel,
    cheapModel,
    routingMode: normalizeRoutingMode(record.routingMode),
    taskOverrides,
    landingPlannerModel,
    landingVisualModel: record.landingVisualModel?.trim() || defaults.landingVisualModel,
    baseUrl: record.baseUrl.trim().replace(/\/+$/, "") || defaults.baseUrl,
    transcriptionModel: record.transcriptionModel.trim() || defaults.transcriptionModel,
    persona: record.persona,
    historyLimit: normalizePositiveInt(record.historyLimit, defaults.historyLimit),
    aiReplyDebounceMs: normalizeNonNegativeInt(record.aiReplyDebounceMs, defaults.aiReplyDebounceMs),
    humanDelayMinMs,
    humanDelayMaxMs
  };
}

function applyAIConfigToRuntime(config: AIConfigValues): void {
  runtimeBotPersona = config.persona;
  runtimeOpenAIModel = config.model;
  runtimeStrongModel = config.strongModel;
  runtimeCheapModel = config.cheapModel;
  runtimeRoutingMode = config.routingMode;
  runtimeTaskOverrides = config.taskOverrides;
  runtimeLandingPlannerModel = config.landingPlannerModel;
  runtimeLandingVisualModel = config.landingVisualModel;
  runtimeOpenAIBaseUrl = config.baseUrl;
  runtimeOpenAITranscriptionModel = config.transcriptionModel;
  runtimeHistoryLimit = config.historyLimit;
  runtimeAIReplyDebounceMs = config.aiReplyDebounceMs;
  runtimeHumanDelayMin = config.humanDelayMinMs;
  runtimeHumanDelayMax = config.humanDelayMaxMs;
}

function getRuntimeAIConfig(): AIConfigValues {
  return {
    model: runtimeOpenAIModel,
    strongModel: runtimeStrongModel,
    cheapModel: runtimeCheapModel,
    routingMode: runtimeRoutingMode,
    taskOverrides: runtimeTaskOverrides,
    landingPlannerModel: runtimeLandingPlannerModel,
    landingVisualModel: runtimeLandingVisualModel,
    baseUrl: runtimeOpenAIBaseUrl,
    transcriptionModel: runtimeOpenAITranscriptionModel,
    persona: runtimeBotPersona,
    historyLimit: runtimeHistoryLimit,
    aiReplyDebounceMs: runtimeAIReplyDebounceMs,
    humanDelayMinMs: runtimeHumanDelayMin,
    humanDelayMaxMs: runtimeHumanDelayMax
  };
}

function buildAISettingsResponse() {
  const config = getRuntimeAIConfig();
  return {
    ...config,
    hasApiKey: !!OPENAI_API_KEY,
    hasVisualApiKey: !!GEMINI_API_KEY,
    language: "pt-BR",
    provider: config.baseUrl.includes("openai.com") ? "OpenAI" : "Custom"
  };
}

function resolveBaseModelForTask(config: AIConfigValues, taskType: AIModelTaskType): string {
  switch (taskType) {
    case "landing_planner":
    case "landing_generation":
    case "landing_code_bundle":
    case "landing_refine":
    case "landing_visual":
      return config.strongModel || config.cheapModel;
    case "chat_reply":
    case "lead_enrichment":
    case "lead_classification":
    default:
      return config.cheapModel || config.strongModel;
  }
}

function resolveOverrideModelForTask(config: AIConfigValues, taskType: AIModelTaskType): string {
  switch (taskType) {
    case "chat_reply":
      return config.taskOverrides.chatReplyModel;
    case "lead_enrichment":
      return config.taskOverrides.leadEnrichmentModel;
    case "lead_classification":
      return config.taskOverrides.leadClassificationModel;
    case "landing_planner":
      return config.taskOverrides.landingPlannerModel || config.landingPlannerModel;
    case "landing_generation":
      return config.taskOverrides.landingGenerationModel;
    case "landing_code_bundle":
      return config.taskOverrides.landingCodeBundleModel;
    case "landing_refine":
      return config.taskOverrides.landingRefineModel;
    case "landing_visual":
      return config.taskOverrides.landingVisualFallbackModel;
    default:
      return "";
  }
}

function resolveModelForTask(config: AIConfigValues, taskType: AIModelTaskType): AIModelResolution {
  const baseModel = resolveBaseModelForTask(config, taskType).trim();
  const overrideModel = resolveOverrideModelForTask(config, taskType).trim();
  const selectedModel = overrideModel || baseModel || config.cheapModel || config.strongModel || config.model;
  const fallbackModel =
    selectedModel === config.cheapModel && config.strongModel && config.strongModel !== selectedModel
      ? config.strongModel
      : null;

  return {
    taskType,
    selectedModel,
    fallbackModel,
    routingReason: overrideModel
      ? `override:${taskType}`
      : `${config.routingMode}:${selectedModel === config.strongModel ? "strong" : "cheap"}`
  };
}

function resolveTaskRequestTimeoutMs(taskType: AIModelTaskType): number {
  switch (taskType) {
    case "chat_reply":
      return 15000;
    case "lead_enrichment":
    case "lead_classification":
      return 18000;
    case "landing_planner":
      return 25000;
    case "landing_generation":
    case "landing_refine":
      return 30000;
    case "landing_code_bundle":
    case "landing_visual":
      return 35000;
    default:
      return 20000;
  }
}

function resolveTaskMaxAttempts(taskType: AIModelTaskType): number {
  switch (taskType) {
    case "chat_reply":
    case "lead_enrichment":
    case "lead_classification":
      return 2;
    case "landing_planner":
    case "landing_generation":
    case "landing_code_bundle":
    case "landing_refine":
    case "landing_visual":
      return 2;
    default:
      return 3;
  }
}

function canRetryWithFallback(resp: Response): boolean {
  return resp.status === 408 || resp.status === 409 || resp.status === 429 || resp.status >= 500;
}

async function callOpenAIResponsesWithRouting(params: {
  taskType: AIModelTaskType;
  input: unknown;
  maxOutputTokens: number;
  metadata?: Record<string, unknown>;
}) {
  if (!OPENAI_API_KEY) {
    throw new Error("OpenAI API key ausente.");
  }

  const aiConfig = await syncRuntimeAIConfigFromDatabase();
  const resolution = resolveModelForTask(aiConfig, params.taskType);
  const baseLog = {
    provider: "openai",
    taskType: params.taskType,
    routingReason: resolution.routingReason,
    maxOutputTokens: params.maxOutputTokens,
    ...params.metadata
  };

  const requestWithModel = (model: string) =>
    fetchWithRetry(`${aiConfig.baseUrl}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model,
        input: params.input,
        max_output_tokens: params.maxOutputTokens
      })
    }, {
      maxAttempts: resolveTaskMaxAttempts(params.taskType),
      timeoutMs: resolveTaskRequestTimeoutMs(params.taskType)
    });

  logEvent("info", "ai.routing.selected", {
    ...baseLog,
    selectedModel: resolution.selectedModel,
    fallbackModel: resolution.fallbackModel,
    fallbackUsed: false
  });

  try {
    const response = await requestWithModel(resolution.selectedModel);
    if (
      response.ok ||
      !resolution.fallbackModel ||
      resolution.fallbackModel === resolution.selectedModel ||
      !canRetryWithFallback(response)
    ) {
      return {
        response,
        selectedModel: resolution.selectedModel,
        fallbackUsed: false
      };
    }

    const failedStatus = response.status;
    const failedBody = await response.text().catch(() => "");
    logEvent("warn", "ai.routing.fallback", {
      ...baseLog,
      selectedModel: resolution.selectedModel,
      fallbackModel: resolution.fallbackModel,
      fallbackUsed: true,
      statusCode: failedStatus,
      message: failedBody || "fallback_por_status"
    });

    const fallbackResponse = await requestWithModel(resolution.fallbackModel);
    return {
      response: fallbackResponse,
      selectedModel: resolution.fallbackModel,
      fallbackUsed: true
    };
  } catch (err) {
    if (!resolution.fallbackModel || resolution.fallbackModel === resolution.selectedModel) {
      throw err;
    }

    logEvent("warn", "ai.routing.fallback", {
      ...baseLog,
      selectedModel: resolution.selectedModel,
      fallbackModel: resolution.fallbackModel,
      fallbackUsed: true,
      message: formatError(err)
    });

    const fallbackResponse = await requestWithModel(resolution.fallbackModel);
    return {
      response: fallbackResponse,
      selectedModel: resolution.fallbackModel,
      fallbackUsed: true
    };
  }
}

function buildDefaultLandingPromptValues(): LandingPromptValues {
  return {
    systemPrompt: [
      "Monte uma landing page publica para atrair interessados em cursos da Santos Tech.",
      "A copy deve ser objetiva, premium, clara e orientada a interesse.",
      "Nunca invente informacoes que nao estejam nos fatos aprovados da oferta."
    ].join("\n"),
    toneGuidelines: [
      "Tom confiante, humano e direto.",
      "Evite jargao tecnico desnecessario.",
      "Use frases escaneaveis e convite claro para saber mais."
    ].join("\n"),
    requiredRules: [
      "Nao inventar preco, carga horaria, datas, certificado ou promessas.",
      "Usar somente fatos aprovados da oferta.",
      "Headline curta e clara.",
      "CTA final alinhado a captacao de interesse no curso."
    ],
    ctaRules: [
      "O CTA deve convidar o lead a conhecer melhor o curso, falar com a equipe ou demonstrar interesse.",
      "O texto auxiliar deve reduzir friccao e reforcar descoberta, interesse ou orientacao do proximo passo."
    ],
    autoGenerateEnabled: true,
    autoSendEnabled: true,
    confidenceThreshold: 0.75
  };
}

function normalizeLandingRules(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const rules = value
    .map((entry) => (typeof entry === "string" ? utf8Text(entry.trim()) : ""))
    .filter(Boolean);
  return rules.length > 0 ? rules : fallback;
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeConfidenceThreshold(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function mapLandingPromptConfigRecord(record: {
  systemPrompt: string;
  toneGuidelines: string | null;
  requiredRules: unknown;
  ctaRules: unknown;
  active: boolean;
}): LandingPromptValues {
  const defaults = buildDefaultLandingPromptValues();
  return {
    systemPrompt: utf8Text(record.systemPrompt || defaults.systemPrompt),
    toneGuidelines: utf8Text(record.toneGuidelines || defaults.toneGuidelines),
    requiredRules: normalizeLandingRules(record.requiredRules, defaults.requiredRules),
    ctaRules: normalizeLandingRules(record.ctaRules, defaults.ctaRules),
    autoGenerateEnabled: defaults.autoGenerateEnabled,
    autoSendEnabled: defaults.autoSendEnabled,
    confidenceThreshold: defaults.confidenceThreshold
  };
}

async function ensureGlobalLandingPromptConfig() {
  const defaults = buildDefaultLandingPromptValues();
  const existing = await prisma.landingPromptConfig.findFirst({
    where: { scope: LANDING_PROMPT_GLOBAL_SCOPE },
    orderBy: { updatedAt: "desc" }
  });
  if (existing) return existing;
  return prisma.landingPromptConfig.create({
    data: {
      scope: LANDING_PROMPT_GLOBAL_SCOPE,
      systemPrompt: defaults.systemPrompt,
      toneGuidelines: defaults.toneGuidelines,
      requiredRules: defaults.requiredRules,
      ctaRules: {
        rules: defaults.ctaRules,
        autoGenerateEnabled: defaults.autoGenerateEnabled,
        autoSendEnabled: defaults.autoSendEnabled,
        confidenceThreshold: defaults.confidenceThreshold
      },
      active: true
    }
  });
}

async function getGlobalLandingPromptSettings(): Promise<LandingPromptValues> {
  const record = await ensureGlobalLandingPromptConfig();
  const mapped = mapLandingPromptConfigRecord(record);
  const ctaRules = typeof record.ctaRules === "object" && record.ctaRules !== null ? record.ctaRules as Record<string, unknown> : {};
  return {
    ...mapped,
    ctaRules: normalizeLandingRules(ctaRules.rules, mapped.ctaRules),
    autoGenerateEnabled: normalizeBoolean(ctaRules.autoGenerateEnabled, true),
    autoSendEnabled: normalizeBoolean(ctaRules.autoSendEnabled, true),
    confidenceThreshold: normalizeConfidenceThreshold(ctaRules.confidenceThreshold, 0.75)
  };
}

async function getOfferLandingPromptSettings(offerId: number): Promise<LandingPromptValues & { scope: string; offerId: number | null }> {
  const globalConfig = await getGlobalLandingPromptSettings();
  const override = await prisma.landingPromptConfig.findFirst({
    where: {
      scope: LANDING_PROMPT_OFFER_SCOPE,
      offerId,
      active: true
    },
    orderBy: { updatedAt: "desc" }
  });

  if (!override) {
    return { ...globalConfig, scope: LANDING_PROMPT_GLOBAL_SCOPE, offerId: null };
  }

  const mapped = mapLandingPromptConfigRecord(override);
  const ctaRules = typeof override.ctaRules === "object" && override.ctaRules !== null ? override.ctaRules as Record<string, unknown> : {};
  return {
    systemPrompt: mapped.systemPrompt || globalConfig.systemPrompt,
    toneGuidelines: mapped.toneGuidelines || globalConfig.toneGuidelines,
    requiredRules: mapped.requiredRules.length ? mapped.requiredRules : globalConfig.requiredRules,
    ctaRules: normalizeLandingRules(ctaRules.rules, mapped.ctaRules.length ? mapped.ctaRules : globalConfig.ctaRules),
    autoGenerateEnabled: normalizeBoolean(ctaRules.autoGenerateEnabled, globalConfig.autoGenerateEnabled),
    autoSendEnabled: normalizeBoolean(ctaRules.autoSendEnabled, globalConfig.autoSendEnabled),
    confidenceThreshold: normalizeConfidenceThreshold(ctaRules.confidenceThreshold, globalConfig.confidenceThreshold),
    scope: LANDING_PROMPT_OFFER_SCOPE,
    offerId
  };
}

function mergeLandingPromptPayload(current: LandingPromptValues, payload: unknown): LandingPromptValues {
  const body = typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : {};
  return {
    systemPrompt: typeof body.systemPrompt === "string" && body.systemPrompt.trim() ? utf8Text(body.systemPrompt.trim()) : current.systemPrompt,
    toneGuidelines: typeof body.toneGuidelines === "string" && body.toneGuidelines.trim() ? utf8Text(body.toneGuidelines.trim()) : current.toneGuidelines,
    requiredRules: body.requiredRules !== undefined ? normalizeLandingRules(body.requiredRules, current.requiredRules) : current.requiredRules,
    ctaRules: body.ctaRules !== undefined ? normalizeLandingRules(body.ctaRules, current.ctaRules) : current.ctaRules,
    autoGenerateEnabled: body.autoGenerateEnabled !== undefined ? normalizeBoolean(body.autoGenerateEnabled, current.autoGenerateEnabled) : current.autoGenerateEnabled,
    autoSendEnabled: body.autoSendEnabled !== undefined ? normalizeBoolean(body.autoSendEnabled, current.autoSendEnabled) : current.autoSendEnabled,
    confidenceThreshold: body.confidenceThreshold !== undefined ? normalizeConfidenceThreshold(body.confidenceThreshold, current.confidenceThreshold) : current.confidenceThreshold
  };
}

async function persistGlobalLandingPromptSettings(payload: unknown): Promise<LandingPromptValues> {
  const current = await getGlobalLandingPromptSettings();
  const next = mergeLandingPromptPayload(current, payload);
  const existing = await ensureGlobalLandingPromptConfig();
  await prisma.landingPromptConfig.update({
    where: { id: existing.id },
    data: {
      scope: LANDING_PROMPT_GLOBAL_SCOPE,
      systemPrompt: next.systemPrompt,
      toneGuidelines: next.toneGuidelines,
      requiredRules: next.requiredRules,
      ctaRules: {
        rules: next.ctaRules,
        autoGenerateEnabled: next.autoGenerateEnabled,
        autoSendEnabled: next.autoSendEnabled,
        confidenceThreshold: next.confidenceThreshold
      },
      active: true
    }
  });
  return getGlobalLandingPromptSettings();
}

async function persistOfferLandingPromptSettings(offerId: number, payload: unknown) {
  const current = await getOfferLandingPromptSettings(offerId);
  const next = mergeLandingPromptPayload(current, payload);
  const existing = await prisma.landingPromptConfig.findFirst({
    where: {
      scope: LANDING_PROMPT_OFFER_SCOPE,
      offerId
    }
  });
  const data = {
    scope: LANDING_PROMPT_OFFER_SCOPE,
    offerId,
    systemPrompt: next.systemPrompt,
    toneGuidelines: next.toneGuidelines,
    requiredRules: next.requiredRules,
    ctaRules: {
      rules: next.ctaRules,
      autoGenerateEnabled: next.autoGenerateEnabled,
      autoSendEnabled: next.autoSendEnabled,
      confidenceThreshold: next.confidenceThreshold
    },
    active: true
  };

  if (existing) {
    await prisma.landingPromptConfig.update({
      where: { id: existing.id },
      data
    });
  } else {
    await prisma.landingPromptConfig.create({ data });
  }

  return getOfferLandingPromptSettings(offerId);
}

async function ensureAIConfigRecord() {
  const defaults = buildDefaultAIConfig();
  return prisma.aiConfig.upsert({
    where: { key: AI_CONFIG_KEY },
    update: {},
    create: {
      key: AI_CONFIG_KEY,
      ...defaults
    }
  });
}

async function syncRuntimeAIConfigFromDatabase(forceRefresh = false): Promise<AIConfigValues> {
  if (!forceRefresh && runtimeAIConfigLastLoadedAt > 0 && (Date.now() - runtimeAIConfigLastLoadedAt) < AI_CONFIG_CACHE_TTL_MS) {
    return getRuntimeAIConfig();
  }

  const record = await ensureAIConfigRecord();
  const config = mapAIConfigRecord(record);
  applyAIConfigToRuntime(config);
  runtimeAIConfigLastLoadedAt = Date.now();
  return config;
}

function mergeAIConfigWithPayload(current: AIConfigValues, payload: unknown): AIConfigValues {
  const next: AIConfigValues = { ...current };
  const body = typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : {};

  if (typeof body.model === "string" && body.model.trim()) next.model = body.model.trim();
  if (typeof body.strongModel === "string" && body.strongModel.trim()) next.strongModel = body.strongModel.trim();
  if (typeof body.cheapModel === "string" && body.cheapModel.trim()) next.cheapModel = body.cheapModel.trim();
  if (body.routingMode !== undefined) next.routingMode = normalizeRoutingMode(body.routingMode);
  if (body.taskOverrides !== undefined) next.taskOverrides = normalizeTaskOverrides(body.taskOverrides);
  if (typeof body.landingPlannerModel === "string" && body.landingPlannerModel.trim()) next.landingPlannerModel = body.landingPlannerModel.trim();
  if (typeof body.landingVisualModel === "string" && body.landingVisualModel.trim()) next.landingVisualModel = body.landingVisualModel.trim();
  if (typeof body.baseUrl === "string" && body.baseUrl.trim()) next.baseUrl = body.baseUrl.trim().replace(/\/+$/, "");
  if (typeof body.transcriptionModel === "string" && body.transcriptionModel.trim()) next.transcriptionModel = body.transcriptionModel.trim();
  if (typeof body.persona === "string") next.persona = body.persona;
  if (typeof body.historyLimit === "number" && body.historyLimit > 0) next.historyLimit = Math.round(body.historyLimit);
  if (typeof body.aiReplyDebounceMs === "number" && body.aiReplyDebounceMs >= 0) next.aiReplyDebounceMs = Math.round(body.aiReplyDebounceMs);
  if (typeof body.humanDelayMinMs === "number" && body.humanDelayMinMs >= 0) next.humanDelayMinMs = Math.round(body.humanDelayMinMs);
  if (typeof body.humanDelayMaxMs === "number" && body.humanDelayMaxMs >= 0) next.humanDelayMaxMs = Math.round(body.humanDelayMaxMs);

  if (next.humanDelayMaxMs < next.humanDelayMinMs) {
    next.humanDelayMaxMs = next.humanDelayMinMs;
  }

  next.strongModel = next.strongModel.trim() || current.strongModel || buildDefaultAIConfig().strongModel;
  next.cheapModel = next.cheapModel.trim() || next.model.trim() || current.cheapModel || buildDefaultAIConfig().cheapModel;
  next.model = next.model.trim() || next.cheapModel;
  next.landingPlannerModel =
    next.landingPlannerModel.trim() ||
    next.taskOverrides.landingPlannerModel ||
    next.strongModel;

  return next;
}

async function persistAIConfigFromPayload(payload: unknown): Promise<AIConfigValues> {
  const current = await syncRuntimeAIConfigFromDatabase();
  const next = mergeAIConfigWithPayload(current, payload);

  const record = await prisma.aiConfig.upsert({
    where: { key: AI_CONFIG_KEY },
    update: {
      ...next,
      model: next.cheapModel,
      strongModel: next.strongModel,
      cheapModel: next.cheapModel,
      routingMode: next.routingMode,
      taskOverrides: next.taskOverrides
    },
    create: {
      key: AI_CONFIG_KEY,
      ...next,
      model: next.cheapModel,
      strongModel: next.strongModel,
      cheapModel: next.cheapModel,
      routingMode: next.routingMode,
      taskOverrides: next.taskOverrides
    }
  });

  const config = mapAIConfigRecord(record);
  applyAIConfigToRuntime(config);
  runtimeAIConfigLastLoadedAt = Date.now();
  return config;
}

registerSettingsRoutes(app, {
  requireSession,
  getAISettings: async () => {
    await syncRuntimeAIConfigFromDatabase();
    return buildAISettingsResponse();
  },
  updateAISettings: async (payload) => {
    await persistAIConfigFromPayload(payload);
    return buildAISettingsResponse();
  },
  logEvent,
  formatError,
  whatsappPhoneNumberId: WHATSAPP_PHONE_NUMBER_ID,
  whatsappToken: WHATSAPP_TOKEN
});

httpServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT} (HTTP + WebSocket)`);
  void (async () => {
    await syncRuntimeAIConfigFromDatabase();
    await initializeWsMessageSync();
    void broadcastSystemHealthSnapshot();
    setInterval(() => {
      void syncMessagesFromDatabase();
    }, 1500);
    setInterval(() => {
      void processWebhookQueueTick();
    }, WEBHOOK_WORKER_INTERVAL_MS);
    setInterval(() => {
      void broadcastSystemHealthSnapshot();
    }, 30000);
    void processWebhookQueueTick();
  })();
});
