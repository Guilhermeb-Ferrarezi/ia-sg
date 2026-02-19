import crypto from "crypto";
import express from "express";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || "";
const HISTORY_LIMIT = Number(process.env.HISTORY_LIMIT || 20);
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || "";
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY || "";
const GROQ_MODEL = process.env.GROQ_MODEL || process.env.OPENAI_MODEL || "";
const BOT_PERSONA = process.env.BOT_PERSONA || "";
const HUMAN_DELAY_MIN_MS = Number(process.env.HUMAN_DELAY_MIN_MS || 1200);
const HUMAN_DELAY_MAX_MS = Number(process.env.HUMAN_DELAY_MAX_MS || 6500);

const SESSION_SECRET = process.env.SESSION_SECRET || process.env.JWT_SECRET || "dev-session-secret";
const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || "ia_sg_auth";
const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 7);
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || "";
const COOKIE_SAMESITE = (process.env.COOKIE_SAMESITE || "lax").toLowerCase();
const COOKIE_SECURE = (process.env.COOKIE_SECURE || "").toLowerCase();
const DASHBOARD_USER = process.env.DASHBOARD_USER || "";
const DASHBOARD_PASS = process.env.DASHBOARD_PASS || "";

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const prisma = new PrismaClient();
const app = express();

app.use((req, res, next) => {
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

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
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

  res.json({ message: "Contato e histórico removidos com sucesso." });
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

app.post("/webhook", (req, res) => {
  res.sendStatus(200);

  setImmediate(async () => {
    try {
      const msg = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      if (!msg) return;

      const waId = msg.from as string | undefined;
      const waMessageId = msg.id as string | undefined;
      const profileNameRaw = req.body?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name;
      const profileName =
        typeof profileNameRaw === "string" && profileNameRaw.trim()
          ? profileNameRaw.trim()
          : null;
      if (!waId) return;

      const contact = await prisma.contact.upsert({
        where: { waId },
        update: {},
        create: { waId, name: profileName }
      });

      if (msg.type !== "text") {
        await prisma.message.create({
          data: {
            contactId: contact.id,
            direction: "in",
            body: `[${msg.type}]`,
            waMessageId: waMessageId || null
          }
        }).catch((err: unknown) => {
          if (isPrismaUniqueError(err)) return;
          throw err;
        });

        const fallback = "Por enquanto eu só entendo texto 🙂";
        await sendWhatsAppText(waId, fallback);
        await prisma.message.create({
          data: {
            contactId: contact.id,
            direction: "out",
            body: fallback,
            waMessageId: null
          }
        });
        return;
      }

      const textIn = msg.text?.body as string | undefined;
      if (!textIn) return;

      try {
        await prisma.message.create({
          data: {
            contactId: contact.id,
            direction: "in",
            body: textIn,
            waMessageId: waMessageId || null
          }
        });
      } catch (err) {
        if (isPrismaUniqueError(err)) {
          return;
        }
        throw err;
      }

      const historyRows = await prisma.message.findMany({
        where: { contactId: contact.id },
        orderBy: { createdAt: "desc" },
        take: HISTORY_LIMIT
      });
      const history: Array<{ role: "user" | "assistant"; content: string }> =
        historyRows.reverse().map((m: { direction: string; body: string }) => ({
          role: (m.direction === "in" ? "user" : "assistant") as
            | "user"
            | "assistant",
          content: m.body
        }));

      const faqContext = await getFaqContextForInput(textIn);

      await sendWhatsAppTypingIndicator(waMessageId);
      const reply = await generateReplyWithTyping(history, faqContext, waMessageId).catch((err) => {
        console.error("OpenAI error:", err);
        return "Desculpe, tive um problema aqui. Pode repetir?";
      });

      await delay(getHumanDelayMs(reply));
      await sendWhatsAppText(waId, reply);
      await prisma.message.create({
        data: {
          contactId: contact.id,
          direction: "out",
          body: reply,
          waMessageId: null
        }
      });
    } catch (err) {
      console.error("Webhook processing error:", err);
    }
  });
});

app.post("/api/webhook", (req, res) => {
  res.sendStatus(200);

  setImmediate(async () => {
    try {
      const msg = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      if (!msg) return;

      const waId = msg.from as string | undefined;
      const waMessageId = msg.id as string | undefined;
      const profileNameRaw = req.body?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name;
      const profileName =
        typeof profileNameRaw === "string" && profileNameRaw.trim()
          ? profileNameRaw.trim()
          : null;
      if (!waId) return;

      const contact = await prisma.contact.upsert({
        where: { waId },
        update: {},
        create: { waId, name: profileName }
      });

      if (msg.type !== "text") {
        await prisma.message.create({
          data: {
            contactId: contact.id,
            direction: "in",
            body: `[${msg.type}]`,
            waMessageId: waMessageId || null
          }
        }).catch((err: unknown) => {
          if (isPrismaUniqueError(err)) return;
          throw err;
        });

        const fallback = "Por enquanto eu só entendo texto 🙂";
        await sendWhatsAppText(waId, fallback);
        await prisma.message.create({
          data: {
            contactId: contact.id,
            direction: "out",
            body: fallback,
            waMessageId: null
          }
        });
        return;
      }

      const textIn = msg.text?.body as string | undefined;
      if (!textIn) return;

      try {
        await prisma.message.create({
          data: {
            contactId: contact.id,
            direction: "in",
            body: textIn,
            waMessageId: waMessageId || null
          }
        });
      } catch (err) {
        if (isPrismaUniqueError(err)) {
          return;
        }
        throw err;
      }

      const historyRows = await prisma.message.findMany({
        where: { contactId: contact.id },
        orderBy: { createdAt: "desc" },
        take: HISTORY_LIMIT
      });
      const history: Array<{ role: "user" | "assistant"; content: string }> =
        historyRows.reverse().map((m: { direction: string; body: string }) => ({
          role: (m.direction === "in" ? "user" : "assistant") as
            | "user"
            | "assistant",
          content: m.body
        }));

      const faqContext = await getFaqContextForInput(textIn);

      await sendWhatsAppTypingIndicator(waMessageId);
      const reply = await generateReplyWithTyping(history, faqContext, waMessageId).catch((err) => {
        console.error("OpenAI error:", err);
        return "Desculpe, tive um problema aqui. Pode repetir?";
      });

      await delay(getHumanDelayMs(reply));
      await sendWhatsAppText(waId, reply);
      await prisma.message.create({
        data: {
          contactId: contact.id,
          direction: "out",
          body: reply,
          waMessageId: null
        }
      });
    } catch (err) {
      console.error("Webhook processing error:", err);
    }
  });
});

async function generateReply(
  history: Array<{ role: "user" | "assistant"; content: string }>,
  faqContext: string
): Promise<string> {
  if (!GROQ_API_KEY || !GROQ_MODEL) {
    return "Configuração incompleta da IA.";
  }

  const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        {
          role: "system",
          content: BOT_PERSONA
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
    : "Desculpe, não consegui responder agora.";
}

async function generateReplyWithTyping(
  history: Array<{ role: "user" | "assistant"; content: string }>,
  faqContext: string,
  waMessageId?: string
): Promise<string> {
  if (!waMessageId) {
    return generateReply(history, faqContext);
  }

  const interval = setInterval(() => {
    sendWhatsAppTypingIndicator(waMessageId).catch((err) => {
      console.error("Typing indicator error:", err);
    });
  }, 20000);

  try {
    return await generateReply(history, faqContext);
  } finally {
    clearInterval(interval);
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

  const resp = await fetch(url, {
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

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
