import crypto from "crypto";
import http from "http";
import express from "express";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { WebSocketServer, WebSocket } from "ws";

dotenv.config();

type RequestMeta = {
  requestId: string;
  rawBody?: Buffer;
};

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
const BOT_PERSONA = process.env.BOT_PERSONA || "";
const AI_REPLY_DEBOUNCE_MS = Math.max(0, Number(process.env.AI_REPLY_DEBOUNCE_MS || ""));
const HUMAN_DELAY_MIN_MS = Number(process.env.HUMAN_DELAY_MIN_MS || null);
const HUMAN_DELAY_MAX_MS = Number(process.env.HUMAN_DELAY_MAX_MS || null);

const SESSION_SECRET = process.env.SESSION_SECRET || process.env.JWT_SECRET || "";
const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || "";
const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 7);
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || "";
const COOKIE_SAMESITE = (process.env.COOKIE_SAMESITE || "").toLowerCase();
const COOKIE_SECURE = (process.env.COOKIE_SECURE || "").toLowerCase();
const DASHBOARD_USER = process.env.DASHBOARD_USER || "";
const DASHBOARD_PASS = process.env.DASHBOARD_PASS || "";
const WEBHOOK_WORKER_INTERVAL_MS = Number(process.env.WEBHOOK_WORKER_INTERVAL_MS || "2000");
const WEBHOOK_MAX_RETRIES = Number(process.env.WEBHOOK_MAX_RETRIES || "5");
const LOG_DELETE_REAUTH_WINDOW_MS = 150000;
const LOG_SKIP_GET_PATH_PREFIXES = (process.env.LOG_SKIP_GET_PATH_PREFIXES || "/api/health,/api/system/readiness,/api/system/health-details,/api/logs,/api/crm/leads,/api/dashboard/summary")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);

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

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:5173")
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
  { name: "Negociação", position: 4, color: "#f97316" },
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

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/system/readiness", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: "up" });
  } catch (err) {
    res.status(503).json({ ok: false, db: "down", error: formatError(err) });
  }
});

app.get("/api/system/health-details", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      ok: true,
      uptimeSec: Math.floor(process.uptime()),
      db: "up",
      wsClients: wsClients.size,
      worker: {
        intervalMs: WEBHOOK_WORKER_INTERVAL_MS,
        maxRetries: WEBHOOK_MAX_RETRIES
      }
    });
  } catch (err) {
    res.status(503).json({
      ok: false,
      uptimeSec: Math.floor(process.uptime()),
      db: "down",
      wsClients: wsClients.size,
      error: formatError(err)
    });
  }
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
      level: "Nível do log (info/warn/error)",
      status: "Status da requisição (sucesso/falha)",
      path: "Trecho da rota HTTP",
      event: "Nome técnico do evento",
      requestId: "ID de correlação da requisição",
      waId: "WhatsApp ID do contato",
      contactId: "ID interno do lead/contato",
      statusCode: "Status HTTP (100-599)",
      ip: "IP de origem da requisição",
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
    res.status(400).json({ message: "Senha é obrigatória." });
    return;
  }

  if (!session || session.username !== DASHBOARD_USER || password !== DASHBOARD_PASS) {
    res.status(401).json({ message: "Senha inválida." });
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
      message: "Reautenticação necessária para excluir logs.",
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
      message: "Para evitar exclusão acidental, aplique filtros ou envie ?all=true."
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

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };

  if (!username || !password) {
    res.status(400).json({ message: "Usuário e senha são obrigatórios." });
    return;
  }

  if (username !== DASHBOARD_USER || password !== DASHBOARD_PASS) {
    res.status(401).json({ message: "Credenciais inválidas." });
    return;
  }

  const token = signSession({ username, role: "admin" });
  setAuthCookie(res, token);

  res.json({
    message: "Login realizado com sucesso.",
    user: { username, role: "admin" }
  });
});

app.post("/api/auth/logout", (_req, res) => {
  clearAuthCookie(res);
  res.json({ message: "Logout realizado com sucesso." });
});

app.get("/api/auth/me", (req, res) => {
  const session = getSessionFromRequest(req);
  if (!session) {
    res.status(401).json({ message: "Não autenticado." });
    return;
  }

  res.json({
    user: {
      username: session.username,
      role: session.role,
      exp: session.exp
    }
  });
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
    res.status(400).json({ message: "Pergunta e resposta são obrigatórias." });
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
      res.status(409).json({ message: "Já existe um FAQ com essa pergunta." });
      return;
    }
    throw err;
  }
});

app.put("/api/dashboard/faqs/:faqId", requireSession, async (req, res) => {
  const faqId = Number(req.params.faqId);
  if (!Number.isInteger(faqId) || faqId <= 0) {
    res.status(400).json({ message: "ID de FAQ inválido." });
    return;
  }

  const questionRaw = typeof req.body?.question === "string" ? req.body.question.trim() : "";
  const answerRaw = typeof req.body?.answer === "string" ? req.body.answer.trim() : "";
  const isActiveRaw = req.body?.isActive;

  if (!questionRaw || !answerRaw) {
    res.status(400).json({ message: "Pergunta e resposta são obrigatórias." });
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
      res.status(409).json({ message: "Já existe um FAQ com essa pergunta." });
      return;
    }
    if (isPrismaNotFoundError(err)) {
      res.status(404).json({ message: "FAQ não encontrado." });
      return;
    }
    throw err;
  }
});

app.delete("/api/dashboard/faqs/:faqId", requireSession, async (req, res) => {
  const faqId = Number(req.params.faqId);
  if (!Number.isInteger(faqId) || faqId <= 0) {
    res.status(400).json({ message: "ID de FAQ inválido." });
    return;
  }

  const deleted = await prisma.faq.deleteMany({
    where: { id: faqId }
  });

  if (deleted.count === 0) {
    res.status(404).json({ message: "FAQ não encontrado." });
    return;
  }

  broadcastEvent("faqs_updated");
  broadcastEvent("dashboard_updated");
  res.json({ message: "FAQ removido com sucesso." });
});

app.delete("/api/dashboard/messages/:messageId", requireSession, async (req, res) => {
  const messageId = Number(req.params.messageId);
  if (!Number.isInteger(messageId) || messageId <= 0) {
    res.status(400).json({ message: "ID de mensagem inválido." });
    return;
  }

  const deleted = await prisma.message.deleteMany({
    where: { id: messageId }
  });

  if (deleted.count === 0) {
    res.status(404).json({ message: "Mensagem não encontrada." });
    return;
  }

  broadcastEvent("dashboard_updated");
  broadcastEvent("analytics_updated");
  res.json({ message: "Mensagem removida com sucesso." });
});

app.delete("/api/dashboard/contacts/:contactId/messages", requireSession, async (req, res) => {
  const contactId = Number(req.params.contactId);
  if (!Number.isInteger(contactId) || contactId <= 0) {
    res.status(400).json({ message: "ID de contato inválido." });
    return;
  }

  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { id: true }
  });

  if (!contact) {
    res.status(404).json({ message: "Contato não encontrado." });
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
    res.status(400).json({ message: "ID de contato inválido." });
    return;
  }

  const deleted = await prisma.contact.deleteMany({
    where: { id: contactId }
  });

  if (deleted.count === 0) {
    res.status(404).json({ message: "Contato não encontrado." });
    return;
  }

  broadcastEvent("dashboard_updated");
  broadcastEvent("analytics_updated");
  res.json({ message: "Contato e histórico removidos com sucesso." });
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
    res.status(400).json({ message: "Nome da etapa é obrigatório." });
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
      res.status(409).json({ message: "Já existe etapa com este nome ou posição." });
      return;
    }
    throw err;
  }
});

app.put("/api/crm/stages/:id(\\d+)", requireSession, async (req, res) => {
  const stageId = Number(req.params.id);
  if (!Number.isInteger(stageId) || stageId <= 0) {
    res.status(400).json({ message: "ID de etapa inválido." });
    return;
  }

  const payload: { name?: string; color?: string; isActive?: boolean } = {};
  if (typeof req.body?.name === "string" && req.body.name.trim()) payload.name = req.body.name.trim();
  if (typeof req.body?.color === "string" && req.body.color.trim()) payload.color = req.body.color.trim();
  if (typeof req.body?.isActive === "boolean") payload.isActive = req.body.isActive;

  if (Object.keys(payload).length === 0) {
    res.status(400).json({ message: "Nenhuma alteração enviada." });
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
      res.status(404).json({ message: "Etapa não encontrada." });
      return;
    }
    if (isPrismaUniqueError(err)) {
      res.status(409).json({ message: "Já existe etapa com este nome." });
      return;
    }
    throw err;
  }
});

app.put("/api/crm/stages/reorder", requireSession, async (req, res) => {
  const stageIds = Array.isArray(req.body?.stageIds) ? req.body.stageIds.map((id: unknown) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0) : [];
  if (stageIds.length === 0) {
    res.status(400).json({ message: "Envie uma lista válida de IDs de etapa." });
    return;
  }

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Mover todos para posições temporárias (negativas) para evitar conflito de UNIQUE
      for (let i = 0; i < stageIds.length; i++) {
        await tx.pipelineStage.update({
          where: { id: stageIds[i] },
          data: { position: -(i + 1) }
        });
      }
      // 2. Definir posições finais corretas
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
      res.status(409).json({ message: "Já existe lead com este WhatsApp." });
      return;
    }
    throw err;
  }
});

app.get("/api/crm/leads/:id", requireSession, async (req, res) => {
  const leadId = Number(req.params.id);
  if (!Number.isInteger(leadId) || leadId <= 0) {
    res.status(400).json({ message: "ID de lead inválido." });
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
    res.status(404).json({ message: "Lead não encontrado." });
    return;
  }

  res.json({ lead: mapLeadDetails(lead) });
});

app.put("/api/crm/leads/:id", requireSession, async (req, res) => {
  const leadId = Number(req.params.id);
  if (!Number.isInteger(leadId) || leadId <= 0) {
    res.status(400).json({ message: "ID de lead inválido." });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (typeof req.body?.name === "string") updateData.name = req.body.name.trim() || null;
  if (typeof req.body?.waId === "string") {
    const parsed = normalizeWaId(req.body.waId.trim());
    if (!parsed) {
      res.status(400).json({ message: "WhatsApp inválido." });
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
  if (req.body?.qualificationScore === null) updateData.qualificationScore = null;
  if (typeof req.body?.qualificationScore === "number" && Number.isFinite(req.body.qualificationScore)) {
    updateData.qualificationScore = Math.max(0, Math.min(100, Math.round(req.body.qualificationScore)));
  }
  if (typeof req.body?.handoffNeeded === "boolean") updateData.handoffNeeded = req.body.handoffNeeded;

  if (Object.keys(updateData).length === 0) {
    res.status(400).json({ message: "Nenhuma alteração enviada." });
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
      res.status(404).json({ message: "Lead não encontrado." });
      return;
    }
    if (isPrismaUniqueError(err)) {
      res.status(409).json({ message: "Já existe lead com este WhatsApp." });
      return;
    }
    throw err;
  }
});

app.patch("/api/crm/leads/:id/handoff", requireSession, async (req, res) => {
  const leadId = Number(req.params.id);
  const handoffNeeded = req.body?.handoffNeeded;

  if (!Number.isInteger(leadId) || leadId <= 0) {
    res.status(400).json({ message: "ID de lead inválido." });
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
      res.status(404).json({ message: "Lead não encontrado." });
      return;
    }
    throw err;
  }
});

app.delete("/api/crm/leads/:id", requireSession, async (req, res) => {
  const leadId = Number(req.params.id);
  if (!Number.isInteger(leadId) || leadId <= 0) {
    res.status(400).json({ message: "ID de lead inválido." });
    return;
  }

  try {
    await prisma.contact.delete({
      where: { id: leadId }
    });
    broadcastEvent("lead_deleted", { id: leadId });
    broadcastEvent("dashboard_updated");
    broadcastEvent("analytics_updated");
    res.json({ message: "Lead excluído com sucesso." });
  } catch (err) {
    if (isPrismaNotFoundError(err)) {
      res.status(404).json({ message: "Lead não encontrado." });
      return;
    }
    throw err;
  }
});

app.patch("/api/crm/leads/:id/stage", requireSession, async (req, res) => {
  const leadId = Number(req.params.id);
  const stageId = Number(req.body?.stageId);
  if (!Number.isInteger(leadId) || leadId <= 0 || !Number.isInteger(stageId) || stageId <= 0) {
    res.status(400).json({ message: "Lead e etapa são obrigatórios." });
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
      res.status(404).json({ message: "Lead não encontrado." });
      return;
    }
    throw err;
  }
});

app.patch("/api/crm/leads/:id/status", requireSession, async (req, res) => {
  const leadId = Number(req.params.id);
  const leadStatus = typeof req.body?.status === "string" ? req.body.status : "";
  if (!Number.isInteger(leadId) || leadId <= 0 || !["open", "won", "lost"].includes(leadStatus)) {
    res.status(400).json({ message: "Status inválido." });
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
      res.status(404).json({ message: "Lead não encontrado." });
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
      res.status(404).json({ message: "Lead não encontrado." });
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
    res.status(400).json({ message: "ID de lead inválido." });
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
    res.status(400).json({ message: "ID de lead inválido." });
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
    res.status(400).json({ message: "Lead, título e vencimento são obrigatórios." });
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
    res.status(400).json({ message: "ID de tarefa inválido." });
    return;
  }

  const data: Record<string, unknown> = {};
  if (typeof req.body?.title === "string") data.title = req.body.title.trim();
  if (typeof req.body?.description === "string") data.description = req.body.description.trim() || null;
  if (typeof req.body?.priority === "string" && ["low", "medium", "high"].includes(req.body.priority)) data.priority = req.body.priority;
  if (typeof req.body?.dueAt === "string") {
    const dueAt = new Date(req.body.dueAt);
    if (Number.isNaN(dueAt.getTime())) {
      res.status(400).json({ message: "Data de vencimento inválida." });
      return;
    }
    data.dueAt = dueAt;
  }

  if (Object.keys(data).length === 0) {
    res.status(400).json({ message: "Nenhuma alteração enviada." });
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
      res.status(404).json({ message: "Tarefa não encontrada." });
      return;
    }
    throw err;
  }
});

app.patch("/api/crm/tasks/:taskId/status", requireSession, async (req, res) => {
  const taskId = Number(req.params.taskId);
  const status = typeof req.body?.status === "string" ? req.body.status : "";
  if (!Number.isInteger(taskId) || taskId <= 0 || !["open", "done", "canceled"].includes(status)) {
    res.status(400).json({ message: "Status inválido." });
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
      res.status(404).json({ message: "Tarefa não encontrada." });
      return;
    }
    throw err;
  }
});

app.delete("/api/crm/tasks/:taskId", requireSession, async (req, res) => {
  const taskId = Number(req.params.taskId);
  if (!Number.isInteger(taskId) || taskId <= 0) {
    res.status(400).json({ message: "ID de tarefa inválido." });
    return;
  }

  const deleted = await prisma.task.deleteMany({ where: { id: taskId } });
  if (deleted.count === 0) {
    res.status(404).json({ message: "Tarefa não encontrada." });
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
    res.status(400).json({ message: "Título e conteúdo são obrigatórios." });
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
    res.status(400).json({ message: "ID inválido." });
    return;
  }

  const data: Record<string, unknown> = {};
  if (typeof req.body?.title === "string") data.title = req.body.title.trim();
  if (typeof req.body?.body === "string") data.body = req.body.body.trim();
  if (typeof req.body?.category === "string") data.category = req.body.category.trim();

  if (Object.keys(data).length === 0) {
    res.status(400).json({ message: "Nenhuma alteração." });
    return;
  }

  try {
    const template = await prisma.messageTemplate.update({ where: { id }, data });
    broadcastEvent("templates_updated");
    res.json({ message: "Template atualizado.", template });
  } catch (err) {
    if (isPrismaNotFoundError(err)) {
      res.status(404).json({ message: "Template não encontrado." });
      return;
    }
    throw err;
  }
});

app.delete("/api/templates/:id", requireSession, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ message: "ID inválido." });
    return;
  }

  const deleted = await prisma.messageTemplate.deleteMany({ where: { id } });
  if (deleted.count === 0) {
    res.status(404).json({ message: "Template não encontrado." });
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
    res.status(400).json({ message: "Nome da tag é obrigatório." });
    return;
  }

  try {
    const tag = await prisma.tag.create({ data: { name, color } });
    broadcastEvent("tags_updated");
    res.status(201).json({ message: "Tag criada.", tag });
  } catch (err) {
    if (isPrismaUniqueError(err)) {
      res.status(409).json({ message: "Tag já existe." });
      return;
    }
    throw err;
  }
});

app.delete("/api/tags/:id", requireSession, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ message: "ID inválido." });
    return;
  }

  const deleted = await prisma.tag.deleteMany({ where: { id } });
  if (deleted.count === 0) {
    res.status(404).json({ message: "Tag não encontrada." });
    return;
  }
  broadcastEvent("tags_updated");
  res.json({ message: "Tag removida." });
});

app.post("/api/crm/leads/:id/tags", requireSession, async (req, res) => {
  const leadId = Number(req.params.id);
  const tagId = Number(req.body?.tagId);
  if (!Number.isInteger(leadId) || !Number.isInteger(tagId) || leadId <= 0 || tagId <= 0) {
    res.status(400).json({ message: "Lead e tag são obrigatórios." });
    return;
  }

  try {
    await prisma.contactTag.create({ data: { contactId: leadId, tagId } });
    broadcastEvent("tags_updated");
    broadcastEvent("lead_profile_updated", { leadId });
    res.status(201).json({ message: "Tag adicionada ao lead." });
  } catch (err) {
    if (isPrismaUniqueError(err)) {
      res.status(409).json({ message: "Lead já possui essa tag." });
      return;
    }
    throw err;
  }
});

app.delete("/api/crm/leads/:id/tags/:tagId", requireSession, async (req, res) => {
  const leadId = Number(req.params.id);
  const tagId = Number(req.params.tagId);
  if (!Number.isInteger(leadId) || !Number.isInteger(tagId)) {
    res.status(400).json({ message: "Parâmetros inválidos." });
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
    res.status(400).json({ message: "ID inválido." });
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
    res.status(400).json({ message: "ID de lead inválido." });
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
      res.status(404).json({ message: "Lead não encontrado." });
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
    res.status(400).json({ message: "ID de evento inválido." });
    return;
  }

  const existing = await prisma.webhookEvent.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ message: "Evento não encontrado." });
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

async function fetchWithRetry(url: string, init: RequestInit, maxAttempts = 3): Promise<Response> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, init);
      if (!shouldRetryStatus(response.status) || attempt === maxAttempts) {
        return response;
      }

      const waitMs = Math.min(8000, 500 * 2 ** (attempt - 1));
      await delay(waitMs);
    } catch (err) {
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

    const fallback = "Por enquanto eu só entendo texto e áudio 🙂";
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
        return "[Áudio não pôde ser transcrito]";
      });
    } else {
      textIn = "[Áudio]";
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
  }, AI_REPLY_DEBOUNCE_MS);

  autoReplyTimers.set(contactId, timer);
}

async function buildHistoryForAutoReply(contactId: number): Promise<{
  history: Array<{ role: "user" | "assistant"; content: string }>;
  pendingInput: string;
  pendingCount: number;
}> {
  const rows = await prisma.message.findMany({
    where: { contactId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 120
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
  const keepFromHistory = Math.max(0, HISTORY_LIMIT - pendingToRespond.length);
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

    const faqContext = await getFaqContextForInput(pendingInput);
    await sendWhatsAppTypingIndicator(context.waMessageId);
    const personaToUse = contact.customBotPersona || BOT_PERSONA;
    const reply = await generateReplyWithTyping(history, faqContext, personaToUse, context.waMessageId).catch((err) => {
      console.error("OpenAI error:", err);
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
    });
  } finally {
    autoReplyProcessingContacts.delete(contactId);
  }
}

async function generateReply(
  history: Array<{ role: "user" | "assistant"; content: string }>,
  faqContext: string,
  persona?: string
): Promise<string> {
  if (!OPENAI_API_KEY || !OPENAI_MODEL) {
    return "Configuração incompleta da IA.";
  }

  const resp = await fetchWithRetry(`${OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content: persona || BOT_PERSONA
        },
        {
          role: "system",
          content:
            faqContext.trim().length > 0
              ? `Base de FAQ relevante:\n${faqContext}\n\nRegra: use primeiro as informacoes acima. Se nao houver informacao suficiente no FAQ, diga que nao tem essa informacao no momento e ofereca encaminhamento humano.`
              : "Regra: se nao tiver certeza, diga que vai verificar e ofereca encaminhamento humano."
        },
        ...history
      ]
    })
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`OpenAI HTTP ${resp.status}: ${text}`);
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  return typeof content === "string" && content.trim()
    ? content.trim()
    : "Desculpe, Não consegui responder agora.";
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

  const prompt = `Você é um analista de CRM de uma escola de cursos chamada Santos Tech. Com base na conversa abaixo, extraia informações estruturadas sobre o lead e gere um resumo.

Conversa:
${history}

Formato de Resposta (JSON):
{
  "summary": "Resumo curto e profissional em 2 ou 3 linhas sobre a situação atual do lead",
  "age": "Idade ou faixa etária (ex: 25 anos, Criança, Adulto)",
  "level": "Nível de conhecimento (ex: Iniciante, Intermediário, Avançado)",
  "objective": "Objetivo principal (ex: Aprender Python, Carreira, Hobby)"
}

Responda APENAS o JSON. Se não souber algum campo, coloque "Não informado".`;

  try {
    const resp = await fetchWithRetry(`${OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: "system", content: "Você é um assistente focado em extração de dados de CRM." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" }
      })
    });

    if (!resp.ok) return;

    const data = await resp.json();
    const result = JSON.parse(data?.choices?.[0]?.message?.content || "{}");

    const updatedLead = await prisma.contact.update({
      where: { id: contactId },
      data: {
        aiSummary: result.summary && result.summary !== "Não informado" ? result.summary : undefined,
        age: result.age && result.age !== "Não informado" ? result.age : undefined,
        level: result.level && result.level !== "Não informado" ? result.level : undefined,
        objective: result.objective && result.objective !== "Não informado" ? result.objective : undefined
      },
      include: { stage: true }
    });

    broadcastEvent("lead_updated", { lead: mapLeadDetails(updatedLead) });
  } catch (err) {
    console.error("Enrichment error:", err);
  }
}

async function transcribeAudio(mediaId: string): Promise<string> {
  if (!OPENAI_API_KEY) return "[Transcrição desabilitada]";

  try {
    // 1. Get media URL from Meta
    const mediaResp = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
    });
    if (!mediaResp.ok) throw new Error("Falha ao obter URL do áudio");
    const mediaData = await mediaResp.json();
    const audioUrl = mediaData.url;

    // 2. Download audio file
    const audioContent = await fetch(audioUrl, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
    });
    if (!audioContent.ok) throw new Error("Falha ao baixar áudio");
    const blob = await audioContent.blob();

    // 3. Send to OpenAI transcription
    const formData = new FormData();
    formData.append("file", blob, "audio.ogg");
    formData.append("model", OPENAI_TRANSCRIPTION_MODEL);

    const openaiResp = await fetchWithRetry(`${OPENAI_BASE_URL}/audio/transcriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: formData
    });

    if (!openaiResp.ok) {
      const errText = await openaiResp.text();
      console.error("OpenAI transcription error:", errText);
      throw new Error("Falha na transcrição OpenAI");
    }

    const openaiData = await openaiResp.json();
    return openaiData.text || "[Áudio sem fala detectada]";
  } catch (err) {
    console.error("Transcription pipeline error:", err);
    throw err;
  }
}

async function getFaqContextForInput(input: string): Promise<string> {
  const text = input.trim();
  if (!text) return "";

  const activeFaqs = await prisma.faq.findMany({
    where: { isActive: true },
    select: { question: true, answer: true }
  });

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
        `${index + 1}. Pergunta: ${item.question}\nVariação relevante: ${item.matchedVariant}\nResposta: ${item.answer}`
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
  await ensureDefaultStages();
  const firstStage = await prisma.pipelineStage.findFirst({
    where: { isActive: true },
    orderBy: { position: "asc" },
    select: { id: true }
  });
  return firstStage?.id || null;
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
    qualificationScore: number | null;
    handoffNeeded: boolean;
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
    qualificationScore: contact.qualificationScore,
    handoffNeeded: contact.handoffNeeded,
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
    qualificationScore: number | null;
    handoffNeeded: boolean;
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
    res.status(401).json({ message: "Não autenticado." });
    return;
  }

  (req as express.Request & { user?: SessionPayload }).user = session;
  next();
}

function getHumanDelayMs(reply: string): number {
  const safeMin = Number.isFinite(HUMAN_DELAY_MIN_MS) ? HUMAN_DELAY_MIN_MS : 1200;
  const safeMax = Number.isFinite(HUMAN_DELAY_MAX_MS) ? HUMAN_DELAY_MAX_MS : 6500;
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

httpServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT} (HTTP + WebSocket)`);
  void (async () => {
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





