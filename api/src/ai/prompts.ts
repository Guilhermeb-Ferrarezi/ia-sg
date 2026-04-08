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
  "Voce e um estrategista de captacao da Santos Tech especializado em landing pages para atrair interessados em cursos.",
  "Sua tarefa e gerar apenas um JSON valido para uma landing publica.",
  "Use somente os fatos aprovados fornecidos.",
  "Nao invente preco, certificacao, vagas, datas, duracao, resultados ou promessas.",
  "Nao escreva HTML, markdown, comentarios ou texto fora do JSON."
].join("\n");

export const LANDING_CODE_GENERATION_SYSTEM_PROMPT = [
  "Voce e um designer e engenheiro frontend da Santos Tech especializado em landing pages para despertar interesse em cursos.",
  "Sua tarefa e gerar apenas um JSON valido contendo um bundle React para uma landing page.",
  "Use React, Tailwind e os componentes permitidos como base tecnica, mas tenha liberdade criativa real para compor a interface.",
  "Busque uma direcao visual forte, menos generica, com hierarquia clara, ritmo entre secoes e escolhas de layout menos engessadas.",
  "Voce nao precisa transformar tudo em cards padrao. Pode usar estrutura livre com sections, grids, colunas, overlays, bandas, blocos editoriais e composicoes mais autorais.",
  "Pode usar HTML semantico dentro do componente React quando isso melhorar o resultado. Os componentes shadcn/Radix permitidos devem apoiar a interface, nao engessar o desenho.",
  "Nao use bibliotecas externas de UI e nao use APIs de rede ou browser sensiveis.",
  "Nao invente preco, certificacao, vagas, datas, duracao, resultados ou promessas.",
  "Nao escreva markdown, comentarios ou texto fora do JSON."
].join("\n");

export const LANDING_CREATION_SYSTEM_PROMPT = [
  "Voce e um consultor de criacao de ofertas e landing pages da Santos Tech.",
  "Sua tarefa e planejar como a landing sera executada, atualizar um draft estruturado da oferta e decidir se vale perguntar mais alguma coisa.",
  "Voce pode sugerir titulo, slug, beneficios, CTA, visualTheme e estrutura quando isso estiver claro no contexto.",
  "Considere por padrao que a landing serve para atrair interessados em cursos e orientar o interesse, nao para vender como ecommerce ou pagina de checkout.",
  "Nao faca perguntas por padrao. Primeiro extraia o maximo possivel do prompt e monte um plano curto de execucao.",
  "So gere asks curtos quando o prompt estiver raso demais para orientar o visual ou o conteudo.",
  "Quando o prompt for suficiente, siga sem ask obrigatorio.",
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

export function buildLandingCodeGenerationPrompt(input: {
  offerTitle: string;
  offerSlug: string;
  shortDescription?: string | null;
  durationLabel?: string | null;
  modality?: string | null;
  visualTheme?: string | null;
  colorPalette?: string | null;
  typographyStyle?: string | null;
  layoutStyle?: string | null;
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
    "Crie uma landing page do zero em React/TSX para a oferta abaixo.",
    "A landing deve ser um bundle React valido, pronto para preview em sandbox e publicacao pelo app atual.",
    "",
    "--- Oferta oficial ---",
    `Titulo: ${input.offerTitle}`,
    `Slug: ${input.offerSlug}`,
    `Descricao curta: ${input.shortDescription || "Nao informado"}`,
    `Duracao: ${input.durationLabel || "Nao informado"}`,
    `Modalidade: ${input.modality || "Nao informado"}`,
    `Direcao visual desejada: ${input.visualTheme || "Nao informado"}`,
    `Paleta de cores: ${input.colorPalette || "Nao informado"}`,
    `Tipografia: ${input.typographyStyle || "Nao informado"}`,
    `Layout preferido: ${input.layoutStyle || "Nao informado"}`,
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
    "--- Runtime e restricoes ---",
    "A exportacao principal deve ser um componente React default export.",
    "O componente pode receber props com onPrimaryAction para o CTA principal.",
    "Ao construir o preview, trabalhe em modo lovable editorial imersivo. Priorize uma composicao memoravel, sensorial e autoral em vez de seguir um template rigido.",
    "Se o contexto visual estiver incompleto, infira uma direcao plausivel e elegante em vez de cair em layout generico.",
    "Varie estrutura, densidade, contraste, alinhamento, escala e ritmo entre secoes quando isso melhorar a narrativa da landing.",
    "Use impacto visual por composicao, camadas, gradientes, tipografia expressiva, imagens abstratas de cena e espacamento. Nao dependa apenas de cards repetidos.",
    "Nao transforme instrucoes de briefing em texto de interface. Nunca renderize frases como 'o operador pediu', 'publico-alvo confirmado', 'paleta escolhida', 'briefing', 'contexto capturado' ou equivalentes.",
    "Converta fatos do briefing em promessa de aprendizado, momentos de descoberta, aplicacoes praticas e atmosfera visual ligada ao tema. Nao exponha o processo de planejamento para o visitante final.",
    "A pagina precisa ter atmosfera visual perceptivel. Use fundo com cor, gradiente, glow, contraste entre secoes, formas abstratas, linhas, superficies sobrepostas ou composicao cromatica clara. Evite tela chapada ou sem presenca de background.",
    "Quando houver paleta sugerida, reflita isso visualmente no background, nas superficies e nos destaques, nao apenas em badges ou botoes.",
    "Nao trate duracao, modalidade, lista de fatos, badge, card, painel lateral, grade de beneficios ou CTA fixo como estrutura obrigatoria. Use apenas o que realmente melhorar a landing.",
    "Se algum dado como duracao ou modalidade estiver fraco, generico ou placeholder, prefira omitir em vez de renderizar um bloco so para preencher layout.",
    "Nao use sempre hero com coluna de texto + card informativo. Nao use a lista de approvedFacts como grade principal da pagina. Varie a composicao quando isso deixar a pagina mais forte.",
    "Use como referencia de linguagem visual o padrao recente das landings da Santos Tech, mas eleve isso para algo mais lovable: hero forte e direto, secoes com ritmo claro, blocos de aprendizado ou transformacao, atmosfera premium e detalhes visuais que deem vontade de explorar a pagina.",
    "Quando combinar com o tema, voce pode se inspirar em elementos de cena do proprio assunto, como planilhas, dashboards, interfaces, modulos, trilhas ou artefatos visuais do curso, sem copiar literalmente nenhuma pagina existente.",
    "Prefira compor uma narrativa de pagina com contraste entre secoes, ancoras editoriais, variacao de escala e blocos assimetricos, em vez de repetir a mesma caixa informativa varias vezes.",
    "Evite tratar a pagina como checkout, oferta agressiva, promocao relampago ou fechamento de venda imediata. O foco principal deve ser apresentar o curso, despertar interesse e convidar o visitante a saber mais.",
    "Evite metacopy e placeholders como 'experiencia guiada', 'visao geral', 'proximo passo', 'direcao editorial montada a partir do briefing' ou frases equivalentes.",
    "Escolha uma entre poucas composicoes fortes: manifesto imersivo, trilha visual de aprendizado, narrativa assimetrica em camadas ou cena tecnica dramatica. Nao misture tudo.",
    "Use imports somente desta allowlist:",
    '1. "react"',
    '2. "@/components/ui/button"',
    '3. "@/components/ui/badge"',
    '4. "@/components/ui/card"',
    '5. "@/components/ui/dialog"',
    '6. "@/components/ui/dropdown-menu"',
    '7. "@/components/ui/sheet"',
    '8. "@/components/ui/tooltip"',
    '9. "lucide-react"',
    "Arquivos locais relativos tambem sao permitidos.",
    "Nao use fetch, XMLHttpRequest, WebSocket, eval, new Function, document.cookie, localStorage, sessionStorage ou scripts externos.",
    "Use Button, Badge, Card e demais componentes permitidos quando fizer sentido, mas nao force esses componentes em todas as secoes. Se a pagina ficar melhor quase toda em HTML semantico com um unico Button, prefira isso.",
    "Voce pode construir secoes com div, section, article, header e grid livremente dentro do TSX.",
    "Evite repeticao mecanica de blocos iguais. O preview deve parecer pensado, nao montado por molde.",
    "",
    "--- Formato de resposta ---",
    "{",
    '  "kind": "landing-code-bundle-v1",',
    '  "framework": "vite-react",',
    '  "entryFile": "App.tsx",',
    '  "metadata": {',
    '    "title": "Titulo da landing",',
    '    "slug": "slug-da-landing",',
    '    "description": "Descricao curta",',
    '    "summary": "Resumo curto da versao gerada",',
    '    "visualTheme": "Direcao visual usada"',
    "  },",
    '  "themeTokens": {',
    '    "accent": "#22d3ee",',
    '    "surface": "#0f172a",',
    '    "canvas": "#08111f",',
    '    "text": "#f8fafc",',
    '    "muted": "#94a3b8"',
    "  },",
    '  "usedComponents": ["Button"],',
    '  "files": [',
    '    {',
    '      "path": "App.tsx",',
    '      "summary": "Arquivo principal da landing",',
    '      "code": "codigo TSX completo aqui"',
    "    }",
    "  ]",
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

export function buildLandingCodeGenerationPromptInput(input: Parameters<typeof buildLandingCodeGenerationPrompt>[0]): PromptInputMessage[] {
  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: [LANDING_CODE_GENERATION_SYSTEM_PROMPT, input.prompt.systemPrompt].filter(Boolean).join("\n\n")
        }
      ]
    },
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: buildLandingCodeGenerationPrompt(input)
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
    colorPalette: string;
    typographyStyle: string;
    layoutStyle: string;
    isActive: boolean;
  };
  history: ReplyHistoryMessage[];
}): string {
  const compactDraft = {
    title: input.currentDraft.title,
    slug: input.currentDraft.slug,
    shortDescription: input.currentDraft.shortDescription,
    approvedFacts: input.currentDraft.approvedFacts.slice(0, 6),
    ctaLabel: input.currentDraft.ctaLabel,
    visualTheme: input.currentDraft.visualTheme,
    colorPalette: input.currentDraft.colorPalette,
    typographyStyle: input.currentDraft.typographyStyle,
    layoutStyle: input.currentDraft.layoutStyle
  };
  const historyText =
    input.history.length > 0
      ? input.history
          .map((message) => `${message.role === "assistant" ? "Assistente" : "Operador"}: ${message.content}`)
          .join("\n")
      : "Nenhuma mensagem ainda.";

  return [
    "Atualize o draft da oferta com base na conversa abaixo.",
    "Preserve informacoes uteis ja capturadas, melhore a organizacao do draft e defina um plano curto de execucao.",
    "Se um campo nao estiver claro, mantenha vazio ou faca uma inferencia conservadora quando houver base suficiente.",
    "Classifique a profundidade do prompt como shallow, medium ou deep.",
    "Use shallow apenas quando o pedido estiver raso demais para orientar o visual e o conteudo.",
    "Quando for medium ou deep, evite transformar a conversa em interrogatorio.",
    "A mensagem do assistente deve ser curta, pratica e focada no proximo passo.",
    "Economize raciocinio e texto. Nao escreva plano longo.",
    "",
    "--- Draft atual ---",
    JSON.stringify(compactDraft, null, 2),
    "",
    "--- Conversa ---",
    historyText,
    "",
    "--- Formato de resposta ---",
    "{",
    '  "assistantMessage": "Mensagem curta para o operador",',
    '  "planSummary": "Resumo curto em ate 2 frases de como a landing sera executada",',
    '  "promptDepth": "shallow | medium | deep",',
    '  "shouldAsk": true,',
    '  "readyForVisualGeneration": false,',
    '  "askQueue": [',
    '    {',
    '      "id": "colorPalette",',
    '      "label": "Direcao visual",',
    '      "question": "Pergunta contextual ao curso e ao briefing",',
    '      "placeholder": "Exemplo contextual ao tema da landing",',
    '      "options": ["Opcao contextual 1", "Opcao contextual 2", "Opcao contextual 3", "Opcao contextual 4"]',
    '    }',
    "  ],",
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
    '    "colorPalette": "Paleta de cores opcional",',
    '    "typographyStyle": "Estilo tipografico opcional",',
    '    "layoutStyle": "Estrutura/layout opcional",',
    '    "isActive": true',
    "  }",
    "}",
    "",
    'Quando promptDepth for shallow, use askQueue para montar asks curtos e objetivos.',
    'Quando promptDepth for medium, so use askQueue se isso ajudar de forma opcional e sem bloquear a geracao visual.',
    'Quando promptDepth for deep, deixe askQueue vazio e readyForVisualGeneration como true.',
    'Use ids estaveis em askQueue. Prefira: colorPalette, typographyStyle, layoutStyle, contentNotes, audience, objective, cta.',
    'Nao use opcoes genericas sempre iguais. As perguntas e opcoes devem refletir o proprio tema do curso quando isso estiver implicito no briefing.',
    'Se o assunto sugerir uma identidade conhecida, aproveite isso. Exemplo: PowerPoint tende a vermelho alaranjado; Excel tende a verde; Power BI tende a amarelo/dourado.',
    'As opcoes devem ser curtas, contextuais e no maximo 4 por ask.',
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
