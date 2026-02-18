import express from "express";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || "";
const HISTORY_LIMIT = Number(process.env.HISTORY_LIMIT || 20);
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || "";
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "";

const prisma = new PrismaClient();
const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
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

app.post("/webhook", (req, res) => {
  res.sendStatus(200);

  setImmediate(async () => {
    try {
      const msg = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      if (!msg) return;

      const waId = msg.from as string | undefined;
      const waMessageId = msg.id as string | undefined;
      if (!waId) return;

      const contact = await prisma.contact.upsert({
        where: { waId },
        update: {},
        create: { waId }
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
          role: m.direction === "in" ? "user" : "assistant",
          content: m.body
        }));

      const reply = await generateReply(history).catch((err) => {
        console.error("OpenAI error:", err);
        return "Desculpe, tive um problema aqui. Pode repetir?";
      });

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
  history: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string> {
  if (!OPENAI_API_KEY || !OPENAI_MODEL) {
    return "Configuração incompleta da IA.";
  }

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
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
          content:
            "Você é um atendente objetivo, útil e curto. Se faltar dado, pergunte direto. Não invente."
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

function isPrismaUniqueError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
