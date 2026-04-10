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
  "Voce sempre parte de uma arvore de arquivos vazia. Nao existe template base, hero padrao, seed de JSX ou estrutura previa para copiar.",
  "Use React, Tailwind e os componentes permitidos como base tecnica, mas tenha liberdade criativa real para compor a interface.",
  "Priorize fortemente o catalogo shadcn/Radix ja liberado no runtime. Quando um bloco puder ser resolvido por uma primitive permitida, prefira a primitive a markup customizada.",
  "Busque o maximo coerente de variedade com os componentes permitidos. Explore navegacao, disclosure, feedback, overlays, selecao, comparacao e ritmo visual com as primitives disponiveis antes de cair em divs genericas.",
  "Para cores proprietarias, gradientes, sombras e tipografia muito especifica, prefira constantes locais e style props em vez de depender de classes arbitrarias do Tailwind.",
  "Busque uma direcao visual forte, menos generica, com hierarquia clara, ritmo entre secoes e escolhas de layout menos engessadas.",
  "Voce nao precisa transformar tudo em cards padrao. Pode usar estrutura livre com sections, grids, colunas, overlays, bandas, blocos editoriais e composicoes mais autorais.",
  "Pode usar HTML semantico dentro do componente React quando isso melhorar o resultado, mas so depois de esgotar as primitives shadcn/Radix que ja cobrem o mesmo papel. Os componentes permitidos devem dirigir a composicao, nao ficar restritos a um unico Button perdido na pagina.",
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
  "Se der para identificar um unico curso ou oferta e uma direcao plausivel de pagina, prefira seguir para geracao visual.",
  "So gere asks curtos quando o prompt estiver amplo, meta ou raso demais para orientar uma landing unica de curso.",
  "Quando o prompt for suficiente, siga sem ask obrigatorio.",
  "Nao invente preco, datas, carga horaria exata, certificacao, promessas irreais ou URLs definitivas quando nao forem informadas.",
  "Quando nao souber um campo, deixe vazio e peca o dado faltante de forma objetiva.",
  "Responda apenas com JSON valido."
].join("\n");

const LANDING_CODE_ALLOWED_UI_IMPORTS = [
  "@/components/ui/accordion",
  "@/components/ui/alert-dialog",
  "@/components/ui/aspect-ratio",
  "@/components/ui/avatar",
  "@/components/ui/badge",
  "@/components/ui/button",
  "@/components/ui/card",
  "@/components/ui/checkbox",
  "@/components/ui/collapsible",
  "@/components/ui/context-menu",
  "@/components/ui/direction",
  "@/components/ui/dialog",
  "@/components/ui/dropdown-menu",
  "@/components/ui/hover-card",
  "@/components/ui/label",
  "@/components/ui/menubar",
  "@/components/ui/navigation-menu",
  "@/components/ui/popover",
  "@/components/ui/progress",
  "@/components/ui/radio-group",
  "@/components/ui/scroll-area",
  "@/components/ui/select",
  "@/components/ui/separator",
  "@/components/ui/sheet",
  "@/components/ui/slider",
  "@/components/ui/switch",
  "@/components/ui/tabs",
  "@/components/ui/toggle",
  "@/components/ui/toggle-group",
  "@/components/ui/tooltip"
] as const;

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

export function buildLandingDesignBriefPrompt(input: {
  offerTitle: string;
  offerSlug: string;
  shortDescription?: string | null;
  durationLabel?: string | null;
  modality?: string | null;
  ctaLabel: string;
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
    "Crie uma design brief curta e forte para uma landing page de curso.",
    "A brief precisa servir como base visual e narrativa para uma segunda etapa que gerara o bundle React.",
    "Nao escreva HTML, JSX, markdown ou comentarios fora do JSON.",
    "",
    "--- Oferta oficial ---",
    `Titulo: ${input.offerTitle}`,
    `Slug: ${input.offerSlug}`,
    `Descricao curta: ${input.shortDescription || "Nao informado"}`,
    `Duracao: ${input.durationLabel || "Nao informado"}`,
    `Modalidade: ${input.modality || "Nao informado"}`,
    `CTA principal obrigatorio: ${input.ctaLabel}`,
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
    "--- Regras da brief ---",
    "Seja concreta. Nada de frases vagas sobre 'experiencia guiada' ou 'jornada transformadora' sem explicar a cena da pagina.",
    "A brief precisa escolher uma tese visual dominante, um plano de conteudo enxuto e um plano de composicao claro.",
    "Cada secao precisa ter uma funcao diferente. Nao repita a mesma ideia com nomes diferentes.",
    "Para cursos tecnicos, cite cenas reais como fluxos, integrações, dashboards, templates, módulos, automações ou bastidores operacionais.",
    "A CTA label final precisa ser exatamente igual ao CTA principal obrigatorio informado acima.",
    "A sequencia minima esperada e: hero, suporte/prova, detalhe/trilha e CTA final.",
    "",
    "--- Formato de resposta ---",
    "{",
    '  "visualThesis": "Uma frase com humor, materialidade e energia visual",',
    '  "contentPlan": ["Hero", "Support", "Detail", "Final CTA"],',
    '  "interactionThesis": ["Animacao 1", "Animacao 2", "Animacao 3"],',
    '  "hero": {',
    '    "composition": "Como a primeira dobra deve parecer",',
    '    "headline": "Headline principal",',
    '    "subheadline": "Subheadline curta",',
    '    "supportingPoints": ["Ponto 1", "Ponto 2", "Ponto 3"],',
    '    "sceneIdeas": ["Cena 1", "Cena 2"]',
    "  },",
    '  "sections": [',
    '    { "id": "support", "title": "Nome da secao", "goal": "Funcao narrativa", "layoutIdea": "Ideia visual", "content": ["Item 1", "Item 2"] }',
    "  ],",
    '  "designSystemHints": {',
    '    "palette": ["Cor 1", "Cor 2", "Cor 3"],',
    '    "typeMood": "Direcao tipografica",',
    '    "surfaces": "Como tratar fundos e superficies",',
    '    "avoid": ["Evitar 1", "Evitar 2"]',
    "  },",
    '  "componentPlan": ["Button", "Badge", "Tabs", "Accordion", "ScrollArea", "Card", "Tooltip"],',
    '  "cta": {',
    '    "label": "Texto exato do CTA",',
    '    "helper": "Texto auxiliar curto" ',
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
  ctaLabel: string;
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
    `CTA principal obrigatorio: ${input.ctaLabel}`,
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
    "O texto do CTA principal deve ser exatamente igual ao CTA principal obrigatorio informado acima. Nao troque por sinonimos, nao encurte e nao invente variacao.",
    "A landing precisa ter estrutura minima de pagina de curso, nao apenas um hero curto com 2 ou 3 blocos soltos.",
    "Inclua no minimo: hero forte com proposta de valor, secao de beneficios ou transformacao, secao de conteudo/modulos/trilha, secao de prova ou aplicacoes praticas, FAQ e CTA final repetido perto do encerramento.",
    "Quando o layoutStyle pedir hero com storytelling, o hero precisa ter narrativa visual e copy mais forte do que apenas titulo + subtitulo curto.",
    "Evite hero generico com titulo do curso, uma frase curta e um botao sozinho. Isso nao basta para esta tarefa.",
    "O hero precisa parecer uma cena real da landing: kicker ou badge, headline forte, texto de apoio com densidade, CTA principal claro e uma composicao visual secundaria relevante ao tema.",
    "Nao entregue pagina com cara de wireframe premium. Cada secao precisa ter funcao narrativa clara: descoberta, transformacao, aplicacao pratica, confianca ou fechamento.",
    "Inclua pelo menos uma secao de aplicacoes praticas ou prova concreta com exemplos do que a pessoa vai conseguir construir, automatizar ou operar apos aprender.",
    "Inclua pelo menos um bloco com ritmo visual diferente do resto da pagina, como composicao assimetrica, cena em camadas, painel tecnico, trilha editorial ou contraste de background entre secoes.",
    "Evite paginas que parecam apenas uma pilha de cards centralizados. Misture escala, alinhamento, densidade e hierarquia sem perder legibilidade.",
    "Gere arquivos como se estivesse criando a landing do zero a partir do prompt atual. Nao assuma a existencia de um App anterior, seed visual ou template escondido.",
    "Ao construir o preview, trabalhe em modo lovable editorial imersivo. Priorize uma composicao memoravel, sensorial e autoral em vez de seguir um template rigido.",
    "Se o contexto visual estiver incompleto, infira uma direcao plausivel e elegante em vez de cair em layout generico.",
    "Varie estrutura, densidade, contraste, alinhamento, escala e ritmo entre secoes quando isso melhorar a narrativa da landing.",
    "Use impacto visual por composicao, camadas, gradientes, tipografia expressiva, imagens abstratas de cena e espacamento. Nao dependa apenas de cards repetidos.",
    "Nao transforme instrucoes de briefing em texto de interface. Nunca renderize frases como 'o operador pediu', 'publico-alvo confirmado', 'paleta escolhida', 'briefing', 'contexto capturado' ou equivalentes.",
    "Converta fatos do briefing em promessa de aprendizado, momentos de descoberta, aplicacoes praticas e atmosfera visual ligada ao tema. Nao exponha o processo de planejamento para o visitante final.",
    "A pagina precisa ter atmosfera visual perceptivel. Use fundo com cor, gradiente, glow, contraste entre secoes, formas abstratas, linhas, superficies sobrepostas ou composicao cromatica clara. Evite tela chapada ou sem presenca de background.",
    "Quando houver paleta sugerida, reflita isso visualmente no background, nas superficies e nos destaques, nao apenas em badges ou botoes.",
    "Para paletas com hex especifico, gradientes personalizados, box-shadow customizado e ajustes tipograficos finos, prefira constantes e style={{ ... }} no JSX em vez de classes Tailwind arbitrarias como bg-[#185ABD], text-[#185ABD], shadow-[...] ou tracking-[...].",
    "Nao trate duracao, modalidade, lista de fatos, badge, card, painel lateral, grade de beneficios ou CTA fixo como estrutura obrigatoria. Use apenas o que realmente melhorar a landing.",
    "Se algum dado como duracao ou modalidade estiver fraco, generico ou placeholder, prefira omitir em vez de renderizar um bloco so para preencher layout.",
    "Nao use sempre hero com coluna de texto + card informativo. Nao use a lista de approvedFacts como grade principal da pagina. Varie a composicao quando isso deixar a pagina mais forte.",
    "Use como referencia de linguagem visual o padrao recente das landings da Santos Tech, mas eleve isso para algo mais lovable: hero forte e direto, secoes com ritmo claro, blocos de aprendizado ou transformacao, atmosfera premium e detalhes visuais que deem vontade de explorar a pagina.",
    "Quando combinar com o tema, voce pode se inspirar em elementos de cena do proprio assunto, como planilhas, dashboards, interfaces, modulos, trilhas ou artefatos visuais do curso, sem copiar literalmente nenhuma pagina existente.",
    "Prefira compor uma narrativa de pagina com contraste entre secoes, ancoras editoriais, variacao de escala e blocos assimetricos, em vez de repetir a mesma caixa informativa varias vezes.",
    "Em curso tecnico, troque copy genérica por cenas concretas: fluxos, integrações, dashboards, módulos, templates, rotinas, automações, entregas ou bastidores do trabalho.",
    "Distribua o conteudo para que a pagina nao morra depois do hero. O miolo precisa sustentar interesse com pelo menos dois blocos realmente diferentes entre si, nao apenas uma nova grade com a mesma linguagem.",
    "Evite tratar a pagina como checkout, oferta agressiva, promocao relampago ou fechamento de venda imediata. O foco principal deve ser apresentar o curso, despertar interesse e convidar o visitante a saber mais.",
    "Evite metacopy e placeholders como 'experiencia guiada', 'visao geral', 'proximo passo', 'direcao editorial montada a partir do briefing' ou frases equivalentes.",
    "A landing deve terminar no ultimo bloco util de conteudo ou CTA. Nao adicione footer institucional, barra inferior, strip final, ticker, copyright, assinatura da marca ou mini-rodape com nome da escola e titulo do curso.",
    "Escolha uma entre poucas composicoes fortes: manifesto imersivo, trilha visual de aprendizado, narrativa assimetrica em camadas ou cena tecnica dramatica. Nao misture tudo.",
    "Use imports somente desta allowlist:",
    '1. "react"',
    ...LANDING_CODE_ALLOWED_UI_IMPORTS.map((item, index) => `${index + 2}. "${item}"`),
    `${LANDING_CODE_ALLOWED_UI_IMPORTS.length + 2}. "lucide-react"`,
    "Arquivos locais relativos tambem sao permitidos.",
    'O bundle precisa importar e usar explicitamente componentes `@/components/ui/*`. O caminho minimo seguro e `@/components/ui/button` com `<Button>` em um CTA visivel, mas o objetivo aqui e ir muito alem do minimo.',
    "Use o maior numero coerente de componentes da allowlist. Em uma landing rica, tente combinar pelo menos 6 componentes distintos quando houver secoes suficientes, sempre sem criar elementos mortos.",
    "Mapeie componentes a papeis reais da pagina. Exemplos: `Accordion` ou `Collapsible` no FAQ; `Tabs` ou `ToggleGroup` para trilhas e modulos; `ScrollArea` para paines densos; `HoverCard`, `Tooltip` ou `Popover` para detalhes; `Separator` para ritmo; `Card`, `AspectRatio`, `Avatar` e `Badge` para cenas e prova; `Progress`, `Slider`, `Switch`, `RadioGroup` ou `Select` quando ajudarem a explicar niveis, filtros, comparacoes ou percursos.",
    "Para esta task, prefira pelo menos 7 componentes distintos quando a pagina tiver conteudo suficiente, incluindo obrigatoriamente alguns de estrutura editorial e alguns de detalhe interativo.",
    "Se houver cabecalho, menu contextual ou CTA complementar, prefira `NavigationMenu`, `Menubar`, `DropdownMenu`, `Sheet`, `Dialog` ou `AlertDialog` quando fizer sentido de UX.",
    "Nao use um componente apenas para preencher checklist. Mas, antes de recorrer a blocos customizados, esgote as opcoes do catalogo shadcn/Radix ja permitido.",
    "Nao use fetch, XMLHttpRequest, WebSocket, eval, new Function, document.cookie, localStorage, sessionStorage ou scripts externos.",
    "Prefira compor secoes inteiras com componentes da allowlist em vez de usar HTML semantico quase puro. So recue para markup customizada quando a primitive nao cobrir bem a interacao ou a estrutura.",
    "Voce pode construir secoes com div, section, article, header e grid livremente dentro do TSX.",
    "Evite repeticao mecanica de blocos iguais. O preview deve parecer pensado, nao montado por molde.",
    "No JSON final, o campo code deve ser uma string JSON valida. Nao use template literals com crase, nao use cercas markdown e nao deixe TSX fora das aspas.",
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
    '  "usedComponents": ["Button", "Badge", "Accordion", "Tabs", "Separator", "ScrollArea"],',
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

export function buildLandingDesignBriefPromptInput(input: Parameters<typeof buildLandingDesignBriefPrompt>[0]): PromptInputMessage[] {
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
          text: buildLandingDesignBriefPrompt(input)
        }
      ]
    }
  ];
}

export function buildLandingCodeRefinePromptInput(input: {
  offerTitle: string;
  offerSlug: string;
  currentBundle: unknown;
  reviewSummary: string;
  issues: Array<{
    severity: string;
    category: string;
    title: string;
    detail: string;
    viewport?: string | null;
  }>;
}): PromptInputMessage[] {
  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: LANDING_CODE_GENERATION_SYSTEM_PROMPT
        }
      ]
    },
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: [
            "Repare o bundle React/TSX da landing abaixo.",
            "Mantenha a proposta visual e a narrativa sempre que possivel. Corrija apenas o necessario para remover os problemas apontados.",
            "Nao escreva markdown, comentarios ou texto fora do JSON final.",
            "",
            `Titulo: ${input.offerTitle}`,
            `Slug: ${input.offerSlug}`,
            `Resumo da revisao: ${input.reviewSummary}`,
            "",
            "Problemas obrigatorios para corrigir:",
            ...input.issues.map((issue, index) =>
              `${index + 1}. [${issue.severity}] ${issue.category} - ${issue.title}${issue.viewport ? ` (${issue.viewport})` : ""}: ${issue.detail}`
            ),
            "",
            "Regras de reparo:",
            "1. Preserve o schema landing-code-bundle-v1.",
            "2. Preserve ou aumente o uso coerente de componentes shadcn/Radix ja permitidos.",
            "3. Garanta CTA principal visivel na primeira dobra sem quebrar a composicao.",
            "4. Remova overflow horizontal, sobreposicoes graves e texto ilegivel.",
            "5. Nao adicione footer institucional, ticker ou barra residual.",
              "6. Se animacoes estiverem exageradas a ponto de prejudicar leitura, simplifique sem matar a energia visual.",
              "7. Se um detalhe estiver causando falha estrutural, prefira uma solucao robusta a um truque visual fragil.",
              "8. O CTA principal deve ficar exatamente igual ao CTA aprovado no draft, sem sinonimos ou troca de intencao.",
              "9. Se a landing estiver curta demais, expanda a estrutura para um padrao real de pagina de curso com hero forte, beneficios, trilha/modulos, prova/aplicacoes, FAQ e CTA final.",
              "10. Se a pagina estiver correta estruturalmente, mas ainda parecer generica, aumente densidade visual, contraste entre secoes e concretude do conteudo sem trocar o tema.",
              "11. O hero reparado precisa parecer uma cena real, com copy forte, composicao secundaria relevante e menos cara de template.",
              "12. O campo code no JSON final precisa ser string JSON valida, sem crase e sem TSX solto fora das aspas.",
              "",
              "Bundle atual:",
            JSON.stringify(input.currentBundle, null, 2),
            "",
            "Responda apenas com um JSON valido no mesmo schema do bundle."
          ].join("\n")
        }
      ]
    }
  ];
}

export function buildLandingCodePreflightReviewPromptInput(input: {
  offerTitle: string;
  offerSlug: string;
  draftSummary: string;
  currentBundle: unknown;
}): PromptInputMessage[] {
  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: [
            "Voce e um revisor tecnico de UI da Santos Tech.",
            "Sua tarefa e fazer um preflight estrutural de uma landing React antes da revisao visual final no navegador.",
            "Analise apenas o bundle e o contexto fornecido. Nao invente screenshot, console error ou resultado de browser real.",
            "Se algo depender de renderizacao real, marque como warning conservador, nunca como erro inventado.",
            "Responda apenas com JSON valido."
          ].join("\n")
        }
      ]
    },
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: [
            "Revise o bundle abaixo e gere um parecer de preflight.",
            "",
            `Titulo: ${input.offerTitle}`,
            `Slug: ${input.offerSlug}`,
            `Resumo do draft: ${input.draftSummary}`,
            "",
            "Regras:",
            "1. Identifique riscos estruturais reais no codigo, especialmente CTA ausente, hero fraco, secoes insuficientes, imports suspeitos, excesso de animacao, possivel overflow e contraste questionavel.",
            "2. Nao declare erro de runtime sem evidencia estatica clara.",
            "3. snapshots deve ser um array vazio.",
            "4. consoleErrors deve ser um array vazio.",
            "5. metrics deve ser null.",
            "6. Use status implicito pelo conteudo: issues criticas apenas quando houver forte evidencia estrutural.",
            "",
            "Formato exato de resposta:",
            "{",
            '  "summary": "Resumo curto do preflight",',
            '  "score": 0,',
            '  "issues": [',
            "    {",
            '      "severity": "critical | warning | info",',
            '      "category": "runtime | overflow | cta | contrast | layout | motion",',
            '      "title": "Titulo curto",',
            '      "detail": "Descricao objetiva",',
            '      "selector": null,',
            '      "viewport": "shared"',
            "    }",
            "  ],",
            '  "snapshots": [],',
            '  "consoleErrors": [],',
            '  "metrics": null',
            "}",
            "",
            "Bundle atual:",
            JSON.stringify(input.currentBundle, null, 2)
          ].join("\n")
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
    "Use shallow apenas quando o pedido estiver amplo, meta ou raso demais para orientar uma landing unica de curso.",
    "Quando for medium ou deep, evite transformar a conversa em interrogatorio.",
    "Se houver um curso, oferta ou tema principal identificavel, prefira readyForVisualGeneration como true mesmo sem todos os detalhes finos.",
    "Se o draft final ja tiver titulo claro, descricao ou fatos suficientes e alguma direcao de estrutura/CTA, nao bloqueie o preview com askQueue. Nessa situacao, retorne shouldAsk false e readyForVisualGeneration true.",
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
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const body = (payload || {}) as OpenAIResponseBody;
  if (typeof body.output_text === "string" && body.output_text.trim()) {
    return body.output_text.trim();
  }

  const parts: string[] = [];
  for (const item of Array.isArray(body.output) ? body.output : []) {
    for (const content of Array.isArray(item.content) ? item.content : []) {
      if (typeof content.text === "string" && content.text.trim()) {
        parts.push(content.text.trim());
      }
    }
  }

  return parts.join("\n").trim();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractObjectFromParsedValue(value: unknown): Record<string, unknown> | null {
  if (isPlainObject(value)) return value;
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (isPlainObject(entry)) {
        return entry;
      }
    }
  }
  return null;
}

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

function findFirstBalancedJsonObject(raw: string): string | null {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === "\\") {
      if (inString) escapeNext = true;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === "{") {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
      continue;
    }

    if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        return raw.slice(start, index + 1).trim();
      }
    }
  }

  return null;
}

function sanitizeJsonLikeTemplateLiterals(raw: string): string {
  return raw.replace(/"code"\s*:\s*`([\s\S]*?)`(?=\s*[},])/g, (_match, code) => {
    const normalizedCode = String(code).replace(/\r\n/g, "\n");
    return `"code": ${JSON.stringify(normalizedCode)}`;
  });
}

export function extractFirstJsonObject(raw: string): Record<string, unknown> | null {
  const initial = raw.replace(/^\uFEFF/, "").trim();
  if (!initial) return null;

  const queue = [initial];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const candidate = queue.shift()?.trim() || "";
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);

    try {
      const parsed = JSON.parse(candidate) as unknown;
      const objectValue = extractObjectFromParsedValue(parsed);
      if (objectValue) {
        return objectValue;
      }

      if (typeof parsed === "string" && parsed.trim()) {
        queue.push(parsed.trim());
      }
    } catch {
      // try alternative extractions below
    }

    const withoutFence = stripCodeFence(candidate);
    if (withoutFence !== candidate) {
      queue.push(withoutFence);
    }

    const sanitizedTemplateLiterals = sanitizeJsonLikeTemplateLiterals(candidate);
    if (sanitizedTemplateLiterals !== candidate) {
      queue.push(sanitizedTemplateLiterals);
    }

    if (
      (candidate.startsWith("\"") && candidate.endsWith("\"")) ||
      (candidate.startsWith("'") && candidate.endsWith("'"))
    ) {
      queue.push(candidate.slice(1, -1).trim());
    }

    const balancedObject = findFirstBalancedJsonObject(candidate);
    if (balancedObject && balancedObject !== candidate) {
      queue.push(balancedObject);
    }
  }

  return null;
}
