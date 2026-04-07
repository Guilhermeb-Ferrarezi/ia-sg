export type PromptTextType = "input_text" | "output_text";

export type PromptMessageRole = "system" | "user" | "assistant";

export type PromptInputMessage = {
  role: PromptMessageRole;
  content: Array<{
    type: PromptTextType;
    text: string;
  }>;
};

export type ReplyHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

type OpenAIResponseOutputItem = {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
};

type OpenAIResponseBody = {
  output_text?: string;
  output?: OpenAIResponseOutputItem[];
};

const DEFAULT_REPLY_PERSONA = [
  "Voce e a assistente de WhatsApp da Santos Tech.",
  "Seu papel e atender interessados em cursos com rapidez, contexto e clareza.",
  "Foque em responder a duvida principal, captar dados do lead sem travar a conversa e encaminhar para humano quando isso for explicitamente necessario."
].join("\n");

export const CRM_ENRICHMENT_SYSTEM_PROMPT = [
  "Voce e um analista de CRM focado em extracao de dados de leads da Santos Tech.",
  "Sua tarefa e ler a conversa e devolver apenas um JSON valido.",
  "Nao escreva markdown, comentarios ou texto fora do JSON."
].join("\n");

export const LANDING_GENERATION_SYSTEM_PROMPT = [
  "Voce e um estrategista de conversao da Santos Tech especializado em landing pages de cursos.",
  "Sua tarefa e gerar apenas um JSON valido para uma landing publica.",
  "Use somente os fatos aprovados fornecidos.",
  "Nao invente preco, certificacao, vagas, datas, duracao, resultados ou promessas.",
  "Nao escreva HTML, markdown, comentarios ou texto fora do JSON."
].join("\n");

export const LANDING_CREATION_SYSTEM_PROMPT = [
  "Voce e um consultor de criacao de ofertas e landing pages da Santos Tech.",
  "Sua tarefa e conduzir uma conversa curta com o operador e atualizar um draft estruturado da oferta.",
  "Voce pode sugerir titulo, slug, beneficios e CTA quando isso estiver claro no contexto.",
  "Nao invente preco, datas, carga horaria exata, certificacao, promessas irreais ou URLs definitivas quando nao forem informadas.",
  "Quando nao souber um campo, deixe vazio e peca o dado faltante de forma objetiva.",
  "Responda apenas com JSON valido."
].join("\n");

export function buildFaqSystemPrompt(faqContext: string): string {
  if (faqContext.trim().length > 0) {
    return [
      "--- Perguntas frequentes recuperadas ---",
      "Use esta secao como fonte principal quando a pergunta atual estiver coberta pelo FAQ.",
      faqContext,
      "Se a informacao nao estiver aqui, diga isso com clareza e ofereca encaminhamento humano sem inventar resposta."
    ].join("\n");
  }

  return [
    "--- Perguntas frequentes recuperadas ---",
    "Nenhum FAQ relevante foi recuperado para esta mensagem.",
    "Se nao houver certeza, diga que vai verificar e ofereca encaminhamento humano."
  ].join("\n");
}

export function buildReplySystemPrompt(input: {
  faqContext: string;
  persona?: string;
}): string {
  const sections: string[] = [];
  const persona = input.persona?.trim();

  if (persona) {
    sections.push([
      "--- Instrucao principal configurada no painel ---",
      persona
    ].join("\n"));
  } else {
    sections.push([
      "--- Instrucao principal padrao ---",
      DEFAULT_REPLY_PERSONA
    ].join("\n"));
  }

  sections.push([
    "--- Regras obrigatorias do sistema ---",
    "- Responda de forma curta, clara e objetiva.",
    "- Priorize a duvida principal antes de fazer novas perguntas.",
    "- Evite respostas longas, vagas ou sem proximo passo.",
    "- Nao invente preco, horario, curso, regra, condicao ou promessa.",
    "- Colete nome, telefone e email apenas quando fizer sentido na conversa.",
    "- Se o usuario pedir humano ou a duvida exigir atendimento humano, sinalize o encaminhamento.",
    "- Se faltar contexto, faca no maximo uma pergunta objetiva por resposta."
  ].join("\n"));

  sections.push(buildFaqSystemPrompt(input.faqContext));

  return sections.join("\n\n");
}

export function buildReplyPromptInput(input: {
  history: ReplyHistoryMessage[];
  faqContext: string;
  persona?: string;
}): PromptInputMessage[] {
  const messages: PromptInputMessage[] = [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: buildReplySystemPrompt({
            faqContext: input.faqContext,
            persona: input.persona
          })
        }
      ]
    }
  ];

  for (const message of input.history) {
    const text = message.content.trim();
    if (!text) continue;

    messages.push({
      role: message.role,
      content: [
        {
          type: message.role === "assistant" ? "output_text" : "input_text",
          text
        }
      ]
    });
  }

  return messages;
}

export function buildLeadEnrichmentPrompt(history: string): string {
  return [
    "Analise a conversa abaixo entre lead e atendimento da Santos Tech.",
    "Extraia informacoes estruturadas e gere um resumo profissional.",
    "",
    "--- Conversa ---",
    history,
    "",
    "--- Formato de resposta ---",
    "{",
    '  "summary": "Resumo curto e profissional em 2 ou 3 linhas sobre a situacao atual do lead",',
    '  "age": "Idade ou faixa etaria (ex: 25 anos, Crianca, Adulto)",',
    '  "level": "Nivel de conhecimento (ex: Iniciante, Intermediario, Avancado)",',
    '  "objective": "Objetivo principal (ex: Aprender Python, Carreira, Hobby)",',
    '  "interestedCourse": "Curso ou oferta principal mencionada",',
    '  "courseMode": "Modalidade preferida, como Online, Presencial ou Hibrido",',
    '  "durationLabel": "Duracao mencionada, como 1 mes, 3 meses ou Nao informado",',
    '  "email": "E-mail do lead quando estiver explicito na conversa",',
    '  "interestConfidence": 0.0',
    "}",
    "",
    'Responda APENAS o JSON. Se nao souber algum campo, coloque "Nao informado". Use interestConfidence entre 0 e 1.'
  ].join("\n");
}

export function buildLeadEnrichmentPromptInput(history: string): PromptInputMessage[] {
  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: CRM_ENRICHMENT_SYSTEM_PROMPT
        }
      ]
    },
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: buildLeadEnrichmentPrompt(history)
        }
      ]
    }
  ];
}

export function buildLandingGenerationPrompt(input: {
  offerTitle: string;
  offerSlug: string;
  shortDescription?: string | null;
  durationLabel?: string | null;
  modality?: string | null;
  approvedFacts: string[];
  prompt: {
    systemPrompt: string;
    toneGuidelines?: string | null;
    requiredRules: string[];
    ctaRules: string[];
  };
  leadContext?: {
    interestedCourse?: string | null;
    courseMode?: string | null;
    objective?: string | null;
    level?: string | null;
    summary?: string | null;
  } | null;
}): string {
  return [
    "Crie uma landing page publica em formato JSON para a oferta abaixo.",
    "",
    "--- Oferta oficial ---",
    `Titulo: ${input.offerTitle}`,
    `Slug: ${input.offerSlug}`,
    `Descricao curta: ${input.shortDescription || "Nao informado"}`,
    `Duracao: ${input.durationLabel || "Nao informado"}`,
    `Modalidade: ${input.modality || "Nao informado"}`,
    "Fatos aprovados:",
    ...input.approvedFacts.map((fact, index) => `${index + 1}. ${fact}`),
    "",
    "--- Diretrizes de tom ---",
    input.prompt.toneGuidelines || "Sem diretriz adicional.",
    "",
    "--- Regras obrigatorias ---",
    ...input.prompt.requiredRules.map((rule, index) => `${index + 1}. ${rule}`),
    "",
    "--- Regras de CTA ---",
    ...input.prompt.ctaRules.map((rule, index) => `${index + 1}. ${rule}`),
    "",
    "--- Contexto complementar do lead ---",
    `Interesse detectado: ${input.leadContext?.interestedCourse || "Nao informado"}`,
    `Modalidade preferida: ${input.leadContext?.courseMode || "Nao informado"}`,
    `Objetivo: ${input.leadContext?.objective || "Nao informado"}`,
    `Nivel: ${input.leadContext?.level || "Nao informado"}`,
    `Resumo: ${input.leadContext?.summary || "Nao informado"}`,
    "",
    "--- Formato de resposta ---",
    "{",
    '  "hero": {',
    '    "eyebrow": "Texto curto",',
    '    "headline": "Titulo principal",',
    '    "subheadline": "Subtitulo objetivo",',
    '    "highlights": ["Item 1", "Item 2", "Item 3"]',
    "  },",
    '  "benefits": [',
    '    { "title": "Beneficio", "description": "Descricao curta" }',
    "  ],",
    '  "proof": {',
    '    "title": "Titulo da secao",',
    '    "items": ["Prova 1", "Prova 2", "Prova 3"]',
    "  },",
    '  "faq": [',
    '    { "question": "Pergunta", "answer": "Resposta curta" }',
    "  ],",
    '  "cta": {',
    '    "label": "Texto do CTA",',
    '    "helper": "Texto auxiliar para conversao"',
    "  }",
    "}",
    "",
    "Responda apenas com JSON valido."
  ].join("\n");
}

export function buildLandingGenerationPromptInput(input: Parameters<typeof buildLandingGenerationPrompt>[0]): PromptInputMessage[] {
  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: [LANDING_GENERATION_SYSTEM_PROMPT, input.prompt.systemPrompt].filter(Boolean).join("\n\n")
        }
      ]
    },
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: buildLandingGenerationPrompt(input)
        }
      ]
    }
  ];
}

export function buildLandingCreationPrompt(input: {
  currentDraft: {
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
    isActive: boolean;
  };
  history: ReplyHistoryMessage[];
}): string {
  const historyText =
    input.history.length > 0
      ? input.history
          .map((message) => `${message.role === "assistant" ? "Assistente" : "Operador"}: ${message.content}`)
          .join("\n")
      : "Nenhuma mensagem ainda.";

  return [
    "Atualize o draft da oferta com base na conversa abaixo.",
    "Preserve informacoes uteis ja capturadas e melhore a organizacao do draft.",
    "Se um campo nao estiver claro, mantenha vazio.",
    "A mensagem do assistente deve ser curta, pratica e focada no proximo passo.",
    "",
    "--- Draft atual ---",
    JSON.stringify(input.currentDraft, null, 2),
    "",
    "--- Conversa ---",
    historyText,
    "",
    "--- Formato de resposta ---",
    "{",
    '  "assistantMessage": "Mensagem curta para o operador",',
    '  "draft": {',
    '    "title": "Titulo sugerido da oferta",',
    '    "slug": "slug-sugerido",',
    '    "aliases": ["Alias 1"],',
    '    "durationLabel": "Duracao ou vazio",',
    '    "modality": "Modalidade ou vazio",',
    '    "shortDescription": "Descricao curta",',
    '    "approvedFacts": ["Fato aprovado 1"],',
    '    "ctaLabel": "Texto do CTA",',
    '    "ctaUrl": "URL final ou vazio",',
    '    "visualTheme": "Direcao visual opcional",',
    '    "isActive": true',
    "  }",
    "}",
    "",
    "Responda apenas com JSON valido."
  ].join("\n");
}

export function buildLandingCreationPromptInput(input: Parameters<typeof buildLandingCreationPrompt>[0]): PromptInputMessage[] {
  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: LANDING_CREATION_SYSTEM_PROMPT
        }
      ]
    },
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: buildLandingCreationPrompt(input)
        }
      ]
    }
  ];
}

export function parseResponseOutputText(payload: unknown): string {
  const body = (payload || {}) as OpenAIResponseBody;
  if (typeof body.output_text === "string" && body.output_text.trim()) {
    return body.output_text.trim();
  }

  const parts: string[] = [];
  for (const item of body.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && typeof content.text === "string" && content.text.trim()) {
        parts.push(content.text.trim());
      }
    }
  }

  return parts.join("\n").trim();
}

export function extractFirstJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fallback below
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
}
