# Completed Tasks
## Atualizacao extra - 2026-04-08 (Landing React do zero)
- [x] Fluxo de geracao de landing passou a salvar um `landingCodeBundleJson` como origem principal da pagina, com bundle React/TSX orientado a `shadcn + Radix + Tailwind`.
- [x] Sessoes de criacao agora mantem `codeBundleDraftJson`, permitindo que o chat, o preview e o publish compartilhem a mesma versao do bundle gerado pela IA.
- [x] Preview da landing foi adaptado para priorizar o bundle React em um host isolado por `iframe`, com compilacao de TSX no cliente e fallback automatico para o renderer legado.
- [x] Backend passou a validar imports permitidos, bloquear APIs inseguras e cair em bundle fallback controlado quando a resposta da IA vier invalida para o runtime novo.
- [x] Drawer de edicao manual deixou de tratar `Builder v1` como origem principal e agora mostra resumo do bundle, arquivos gerados, componentes usados e origem da versao.
- [x] Publicacao da landing e artefato do bucket foram ampliados para incluir tambem o `landingCodeBundleJson`, mantendo compatibilidade com `builderDocumentJson` e `sectionsJson`.
- [x] Terceiro icone da barra central do preview agora abre um viewer de codigo com os arquivos React gerados pela IA, usando o bundle salvo na sessao/preview.
- [x] Viewer de codigo foi redesenhado para um layout tipo IDE, com busca, explorer por pastas, abas de arquivos e editor escuro com linhas numeradas.
- [x] Viewer de codigo deixou de abrir em modal e agora substitui a coluna de preview do workspace, alternando entre `Preview` e `Code` pela barra central.
- [x] Painel `Code` ganhou uma coluna de inspeção com todos os arquivos criados, todos os componentes usados, imports usados, tokens do tema e metadados completos do bundle.
- [x] Fluxo de criacao da landing passou a coletar `Cores`, `Tipografia` e `Layout` como preferencias reais do draft, tanto no chat quanto no painel lateral.
- [x] Chat de criacao ganhou fallback de discovery guiado: quando faltam detalhes visuais ou de conteudo, a assistente pede respostas curtas no estilo `Cores: ...`, `Tipografia: ...`, `Layout: ...` e `Pontos principais: ...`.
- [x] Gerador React da landing agora recebe essas preferencias de design no prompt, em vez de depender so de um `visualTheme` generico.
- [x] Workspace de criacao ganhou um questionario guiado no proprio chat, com perguntas objetivas, opcoes rapidas e envio estruturado das respostas para a IA antes da proxima geracao.
- [x] Resize horizontal do chat foi corrigido para continuar funcionando mesmo sobre o preview em `iframe`, com captura de ponteiro e overlay temporario durante o drag.

## Atualizacao extra - 2026-04-07 (Builder Lovable-like v1)
- [x] Fluxo de landing ganhou documento estruturado `builderDocumentJson` para representar a pagina em arvore de componentes tipados, em paralelo ao `sectionsJson` legado.
- [x] Sessoes de criacao agora mantem `builderDraftJson`, permitindo preservar a estrutura da pagina gerada pela IA ao longo do chat, preview e publish.
- [x] `LandingPreviewCanvas` foi adaptado para renderizar a landing a partir do builder v1 quando disponivel, com fallback automatico para o formato legado.
- [x] Drawer de edicao manual passou a exibir a estrutura de blocos da pagina gerada pela IA, deixando a V1 do builder mais transparente durante o refinamento.
- [x] Publish da landing foi ligado ao bucket Cloudflare R2 configurado no `.env`, enviando um artefato JSON da pagina publicada para armazenamento externo.
- [x] Envio de prompt no chat agora aciona geracao automatica de preview logo apos a IA atualizar o draft, sem depender do clique manual em `Gerar preview`.
- [x] Painel de preview passou a exibir o `artifactUrl` publicado no bucket quando a landing e publicada com sucesso.
- [x] Trigger compacto de `Chats recentes` agora usa a logo vermelha dos assets e mostra um botao hamburguer no hover para reabrir a sidebar de chats.

## Atualizacao extra - 2026-04-07 (Workspace mais justo)
- [x] Workspace de landings foi comprimido com menos borda visual ao redor, gaps menores entre colunas e paddings internos reduzidos na topbar, chat e preview.

## Atualizacao extra - 2026-04-07 (Separacao cromatica do workspace)
- [x] Workspace de landings recebeu hierarquia de cor mais clara, com topbar neutra, sidebar em violeta frio, chat em azul-noturno e preview em ciano-petroleo.

## Atualizacao extra - 2026-04-07 (Estrutura sem bordas divisorias)
- [x] Bordas estruturais do workspace de landings foram removidas dos wrappers principais, deixando a separacao visual concentrada apenas nos elementos internos, como na referencia.

## Atualizacao extra - 2026-04-07 (Topbar inspirada na referencia)
- [x] Header do workspace de landings foi refeito como uma topbar unica inspirada na referencia visual, com bloco de identidade da sessao na esquerda, trilha de controles no centro e acoes do fluxo na direita.

## Atualizacao extra - 2026-04-07 (Workspace mais compacto)
- [x] Workspace de criacao da landing ficou mais compacto, com menos bordas pesadas, menos padding estrutural e mais area util para chat e preview.

## Atualizacao extra - 2026-04-07 (Dropdown no topo para chats com historico)
- [x] Workspace de criacao da landing agora esconde a sidebar assim que um chat selecionado ja possui historico, exibindo no topo um dropdown com os chats recentes mesmo quando o tema visual ainda nao foi definido.

## Atualizacao extra - 2026-04-07 (Regra de skill para componentes)
- [x] Regras de agente atualizadas em `AGENTS.md` e `claude.md` para tornar obrigatoria a prioridade maxima de componentes shadcn e primitivas do Radix UI em qualquer nova adicao de UI.

## Atualizacao extra - 2026-04-07 (Porta livre para frontend local)
- [x] Frontend Vite configurado para iniciar preferencialmente em `8080`, com fallback automatico para a proxima porta livre quando houver conflito.
- [x] Proxy local do frontend corrigido para apontar para a API em `http://localhost:3000`, alinhando o ambiente de desenvolvimento com o backend atual.
- [x] Fallback de `ALLOWED_ORIGINS` do backend e `.env.example` alinhados para aceitar `http://localhost:8080` e `http://localhost:8081` sem ajuste manual.
- [x] `deploy_and_push.sh` ampliado para continuar procurando portas de frontend acima da base preferida, evitando falha quando `8080` e `8081` ja estiverem ocupadas.
- [x] Removida a animacao de saida ao excluir um chat/rascunho no historico da area de landings.
- [x] Removido o card-resumo "Exploracao da landing" do header do workspace fullscreen.
- [x] Barra visual estilo "Preview" movida para o topo do header do workspace, substituindo a copia interna do painel de preview.
- [x] Removido o arredondamento externo do canvas principal da landing preview.
- [x] Animacao de troca entre chats no workspace foi simplificada para fade curto, removendo springs/layouts que causavam bug visual na mudanca de sessao.
- [x] Painel "IA em acao" adicionado ao workspace de landing, exibindo em tempo real o status atual da IA e os ultimos eventos persistidos da sessao selecionada.
- [x] Status da "IA em acao" foi redesenhado como uma resposta visual da propria Lume, trocando texto e cor conforme chat, preview, publicacao ou salvamento.
- [x] Resposta visual da Lume foi refinada para imitar o comportamento de IA em execucao, com texto sendo escrito aos poucos e linha "Thinking" abrindo com animacao do Radix.

## Atualizacao extra - 2026-04-07 (Deploy bash + Compose)
- [x] Criado `deploy_and_push.sh` em bash, espelhando o fluxo do `.bat`, com leitura de portas pelo `.env`, deploy via Docker Compose e push opcional.
- [x] Criado `docker-compose.yml` para `api` e `web`, reutilizando o `.env` atual, `DATABASE_URL` principal e proxy interno de frontend para `/api` e `/ws`.
- [x] Ajustado `.gitignore` para parar de ocultar `deploy_and_push.sh` e `docker-compose.yml`, deixando os arquivos visiveis no diff local.
- [x] Deploy bash reforcado com fallback automatico de portas em uso, evitando falha quando `8080` ou a porta principal da API ja estiverem ocupadas na maquina.

## Refactor - Modularizacao do server.ts (Mar 2026)
- [x] Extracao dos prompts de IA para modulo dedicado.
- [x] Extracao das rotas de auth, system e settings para arquivos proprios.
- [x] `server.ts` reduzido para papel mais focado em bootstrap, worker e orquestracao.
- [x] `api/src/ai/prompts.ts` refeito para montar prompts em `input` estruturado no estilo do servico OpenAI de referencia, com parser centralizado de texto e JSON.

Atualizado em: 2026-03-20

## Sprint 3 - Qualificacao de Leads (Visual CRM) (Mar 2026)
- [x] Painel lateral do lead redesenhado para o sprint 3 com score dial, cobertura de perfil e radar de triagem.
- [x] Cards do pipeline enriquecidos com sinais visuais de qualificacao, handoff e progresso do perfil.
- [x] Animacoes extras adicionadas ao CRM para spotlight, sheen e leitura mais rapida do estado do lead.
- [x] Correcao do compose para deploy apontar o backend ao banco `db` com credenciais validas da stack local.

Atualizado em: 2026-03-20

## Sprint 3 - ConfiguraÃ§Ãµes e Perfil WhatsApp/IA (Mar 2026)
- [x] Endpoints REST para configuraÃ§Ãµes de IA: GET/PUT /api/settings/ai
- [x] Endpoints REST para perfil do WhatsApp: GET/PUT /api/settings/whatsapp-profile, POST /api/settings/whatsapp-profile/photo
- [x] RefatoraÃ§Ã£o do backend para runtime config dinÃ¢mico (model, persona, delays, etc)
- [x] Componente SettingsSection com tabs (IA e WhatsApp), animaÃ§Ãµes extremas, UI moderna (shadcn, radix, tailwind)
- [x] Correcao do upload da foto do perfil WhatsApp para o fluxo oficial de Resumable Upload da Meta, com uso de `profile_picture_handle` na atualizacao do business profile.
- [x] Tela dedicada de carregamento para a aba de configuracoes, com estados separados para boot inicial, carregamento da IA e carregamento do perfil WhatsApp.
- [x] Alerts inline da tela de configuracoes substituidos por toasts flutuantes usando o container global do app.
- [x] Campo de modelo da IA trocado por um select com modelos oficiais atuais da OpenAI a partir de `gpt-4o-mini`, mantendo fallback para modelo customizado ja salvo.
- [x] Campo `Base URL` removido da tela de configuracoes da IA para simplificar o fluxo padrao com OpenAI.
- [x] IntegraÃ§Ã£o da nova aba "ConfiguraÃ§Ãµes" na sidebar e navegaÃ§Ã£o mobile
- [x] Cards de status, formulÃ¡rios, validaÃ§Ãµes e UX detalhada para settings
- [x] Logs detalhados e persistentes para todas as aÃ§Ãµes de configuraÃ§Ã£o

- [x] Persistencia real das configuracoes da IA em tabela `AiConfig` no banco.
- [x] Webhook e auto-reply passam a recarregar configuracao da IA do banco antes de aplicar debounce, historico, modelo, persona, delays e transcricao.
- [x] Correcao de consistencia entre bancos: tabela `AiConfig` criada tambem no Postgres externo e bootstrap da API passou a auto-criar essa tabela caso o ambiente ainda nao tenha sido provisionado.
- [x] Remocao do `CREATE TABLE IF NOT EXISTS` do runtime da API; o schema volta a ser provisionado pelo Prisma, e o prompt do sistema agora resolve a `persona` a partir de `AiConfig` no banco a cada geracao de resposta.
- [x] Alinhamento do deploy para a API usar o `DATABASE_URL` principal do `.env`, eliminando a divergencia entre o banco visto no painel e o banco inspecionado no IDE para `AiConfig/persona`.

Atualizado em: 2026-03-20

## Sprint 1 - Base de Confiabilidade (Backend)

- [x] Validacao fail-fast de variaveis de ambiente obrigatorias no boot da API.
- [x] Padronizacao de texto UTF-8/NFC no processamento de mensagens.
- [x] Validacao obrigatoria de assinatura Meta (`x-hub-signature-256`) em `/webhook` e `/api/webhook`.
- [x] Retorno `403` para webhook com assinatura invalida.
- [x] Logs estruturados em JSON com correlacao por `requestId` e dados de webhook (`waId`, `waMessageId`, `contactId`).
- [x] Endpoint `GET /api/system/readiness` com verificacao de banco.
- [x] Endpoint `GET /api/system/health-details` com status de banco, uptime, WS clients e worker.

## Sprint 2 - Idempotencia e Fila (Backend)

- [x] Criacao da entidade `WebhookEvent` no Prisma.
- [x] Migracao SQL para tabela `WebhookEvent` com indices e `dedupeKey` unico.
- [x] Enfileiramento de eventos de webhook em tabela propria.
- [x] Dedupe de eventos por `dedupeKey` (`waMessageId` ou hash do payload).
- [x] Worker interno de processamento com estados: `pending`, `processing`, `done`, `failed`, `dead`.
- [x] Retry com backoff exponencial no worker de webhook.
- [x] Retry com backoff em chamadas externas (OpenAI e WhatsApp) via `fetchWithRetry`.
- [x] Endpoint `GET /api/webhook/events` (filtro por status + paginacao).
- [x] Endpoint `POST /api/webhook/events/:id/replay` para reprocessamento manual.
- [x] Emissao de evento WS `webhook_event_failed` para falhas/dead-letter.
- [x] Protecao contra mensagem duplicada por `@@unique([contactId, waMessageId])` no model `Message`.

## Frontend - Operacao e Navegacao

- [x] Implementacao de navegacao lateral responsiva com Radix + shadcn (desktop + mobile).
- [x] Sidebar fixa a esquerda no desktop.
- [x] Sidebar com colapso/expansao animado e botao de abrir/fechar na base.
- [x] Ajustes de overflow/truncamento na sidebar para evitar corte visual ao recolher.
- [x] Correcoes de icones e alinhamento dos itens da sidebar.
- [x] Menu mobile em `Sheet` (Radix Dialog) com os mesmos paineis da sidebar.
- [x] Inclusao da aba `Operacao` no frontend.
- [x] Tela `SystemHealthSection` consumindo readiness/health-details.
- [x] Tela `WebhookEventsSection` com filtro, paginacao e botao de replay.
- [x] Polling de reforco na aba `Operacao` para manter lista de eventos de webhook atualizada.
- [x] Badge de falhas de webhook na navegacao.
- [x] Edicao de perfil do lead em lote (uma unica requisicao `PUT`) com acao explicita de salvar.
- [x] Inclusao da aba `Logs` no frontend com filtro e paginacao.
- [x] Tipos frontend adicionados para `SystemReadiness`, `SystemHealthDetails`, `WebhookEvent`, `WebhookEventsResponse`.
- [x] Padrao de scrollbar estilo "Supabase-like" (`.supabase-scroll`) aplicado nas areas com overflow.

## Tempo real (WS) - Itens que estavam fora de WS

- [x] Push WS de saude do sistema com evento `system_health_updated` (mantendo fallback por polling).
- [x] Push WS de atualizacao da fila de webhook com evento `webhook_event_updated` (enqueue, replay, done, failed/dead).
- [x] Push WS para analytics com evento `analytics_updated` e refresh automatico no painel.
- [x] Push WS para calendario de tarefas com evento `calendar_tasks_updated` e refresh automatico no painel.
- [x] Push WS para FAQs com evento `faqs_updated`.
- [x] Push WS para templates com evento `templates_updated` e sincronizacao no chat.
- [x] Push WS para tags e vinculacao de tags com eventos `tags_updated` e `lead_profile_updated`.
- [x] Evento WS `dashboard_updated` para resumo/historico de dashboard.
- [x] Envio manual no chat (`/api/chat/send`) sem reload HTTP obrigatorio apos acao (append otimista + WS).

## Seguranca, Sessao e Tempo Real

- [x] Sessao com cookie assinado (HMAC) e validacao server-side.
- [x] Cookie configuravel por env (`SameSite`, `Secure`, `Domain`, TTL).
- [x] CORS com allowlist por `ALLOWED_ORIGINS`.
- [x] Autenticacao de conexao WebSocket via cookie de sessao.
- [x] Broadcast em tempo real para eventos de CRM e novas mensagens.

## Deploy e Configuracao

- [x] Script `deploy_and_push.bat` para fluxo de deploy local com Docker, validacao e push opcional.
- [x] Atualizacao de `.env.example` com variaveis de webhook worker e seguranca de cookie.
- [x] Ajustes de stack frontend para Radix/shadcn (dependencias e componentes `ui/sheet` e `ui/tooltip`).

## Implementado alem do escopo inicial de confiabilidade

- [x] CRUD completo de etapas do funil (inclui reorder).
- [x] CRUD completo de leads e tarefas no CRM.
- [x] CRUD de templates de mensagem.
- [x] CRUD de tags e vinculacao de tags aos leads.
- [x] Endpoints de analytics (`messages-per-day`, `top-contacts`, `overview`).
- [x] Endpoint de calendario de tarefas.
- [x] Endpoint `GET /api/logs` com paginacao e filtros (`level`, `event`, `requestId`, `waId`, `contactId`, `search`, `from`, `to`).
- [x] Persistencia de logs estruturados em tabela `AppLog`.
- [x] Captura automatica de logs HTTP por request (metodo, rota, status, duracao, ip, user-agent, query, params e body sanitizado).
- [x] Persistencia de logs de nivel `error` no banco (alem de console).
- [x] Aba `Logs` com filtros avancados (`level`, `method`, `path`, `requestId`, `waId`, busca geral), paginacao e visualizacao de dados brutos.

## Pendencias (nao concluidas ainda do planejamento de 90 dias)

- [x] Campos de qualificacao no `Contact`: `interestedCourse`, `courseMode`, `availability`, `qualificationScore`, `handoffNeeded`.
- [x] Endpoint `PATCH /api/crm/leads/:id/handoff`.
- [x] Filtros planejados em `GET /api/crm/leads`: `course`, `modality`, `scoreMin`, `scoreMax`, `handoffNeeded`.
- [x] Evento WS `lead_profile_updated`.
- [ ] Entregas de Sprint 3 em diante (qualificacao avancada, auditoria/exportacao/CI hardening).

## Atualizacao extra - 2026-03-06 (Logs, Lead e IA)

- [x] Logs HTTP com filtro de ruido para reduzir volume em banco (skip de GETs comuns/health quando sucesso).
- [x] Enriquecimento de logs com `ip` e `clientOs` (SO inferido por `user-agent`).
- [x] Backend de logs com filtros mais detalhados (`ip`, `clientOs`) e metadados de label para UI.
- [x] Exclusao de logs protegida por senha do usuario logado, com janela de reautenticacao de 2m30.
- [x] Endpoint de exclusao de logs com suporte a excluir filtrados ou tudo (`?all=true`).
- [x] Paginacao de logs aprimorada no frontend (primeira/ultima, salto de 5, ir para pagina e seletor de itens por pagina).
- [x] UI de logs com labels explicativos para cada filtro e exibicao de `IP` + `SO` por entrada.
- [x] Remocao de ruido de logs HTTP GET bem-sucedidos (mantendo falhas para auditoria).
- [x] Filtro de logs por status em portugues (`sucesso`/`falha`) no backend e frontend.
- [x] Remocao do filtro por metodo HTTP na tela de logs e adicao de botao `Remover filtros`.
- [x] Labels dos filtros de logs reposicionados acima dos campos para melhor leitura.
- [x] Carregamento do painel do lead ajustado para manter contexto anterior durante refresh (sem limpar historico antes da resposta).
- [x] Layout responsivo do painel do lead ajustado para coluna esquerda maior que a direita em telas grandes.
- [x] Painel de lead estabilizado no loading (overlay sem quebrar layout/scroll durante atualizacao).
- [x] Painel de lead responsivo recalibrado para evitar coluna esquerda desproporcional e compressao da area direita.
- [x] Loading inicial de detalhe do lead padronizado para a mesma altura do estado sem selecao (400px).
- [x] Animacao dedicada de carregamento de lead aplicada no estado inicial e no overlay de atualizacao.
- [x] Correcao de flicker ao mover lead de etapa (preservacao otimista durante refresh concorrente).
- [x] Cards de metricas e identificacao de sessao exibidos apenas no painel CRM.
- [x] Botao de sair removido do header e movido para sidebar (desktop e menu mobile).
- [x] Controle de resposta da IA com debounce de mensagens consecutivas (`AI_REPLY_DEBOUNCE_MS`).
- [x] Agrupamento de mensagens pendentes da IA para responder primeiro contexto principal (ate 2 mensagens de entrada por ciclo).
- [x] Geracao do Prisma Client e builds de `api` e `web` validados com sucesso apos as alteracoes.

## Atualizacao extra - 2026-04-07 (Modal de informacoes do lead)

- [x] Aba fixa de informacoes do lead removida da grade principal e convertida em modal acionado por botao.
- [x] Resumo compacto do lead adicionado acima do historico com CTA para abrir o cockpit completo.
- [x] Novo componente `ui/dialog` em padrao shadcn/Radix para suportar o modal responsivo.
- [x] Build de `web` validado com sucesso apos a mudanca do painel para modal.

## Atualizacao extra - 2026-04-07 (Landings dinamicas por interesse)

- [x] Extensao do schema Prisma com `email` e metadados de landing em `Contact`, alem das entidades `Offer`, `LandingPromptConfig`, `LandingPage`, `LandingDelivery` e `LandingEvent`.
- [x] SQL de migracao versionado em `api/prisma/migrations/20260407_add_offers_landings/migration.sql` e schema aplicado ao banco com Prisma.
- [x] Enriquecimento de lead por IA ampliado para extrair `interestedCourse`, `courseMode`, `email` e `interestConfidence`.
- [x] CRUD autenticado de ofertas, configuracao de prompt global/por oferta e operacoes de landing (generate, publish, versions, preview, metrics).
- [x] Endpoints publicos de landing com rota por `slug`, tracking de `view` e `click` por token assinado.
- [x] Automacao no fluxo do webhook para casar oferta, garantir landing publicada, enviar link por WhatsApp e registrar auditoria persistida.
- [x] Nova area administrativa `Landings` no frontend com catalogo de ofertas, configuracao de prompt, preview e metricas.
- [x] Nova superficie publica `/ofertas/:slug` no frontend atual com renderizacao da landing e CTA rastreado.
- [x] Preview sob demanda no painel de `Landings`, com geracao temporaria por IA a partir do formulario atual e renderizacao visual completa antes de salvar/publicar.
- [x] Reorganizacao da area `Landings` em abas separadas para `Informacoes`, `Prompt` e `Preview`, deixando o fluxo de edicao mais claro.
- [x] Novo fluxo de criacao por `Chat criador`, com sessao persistida no banco, historico da conversa, draft estruturado da oferta e publicacao final sem depender do formulario no primeiro passo.
- [x] Nova entidade `LandingCreationSession`, endpoints de chat/prompt/preview/publicacao e workspace administrativo para criar landings via chatbot mantendo a arquitetura JSON + rota publica.
- [x] Card explicativo de arquitetura no painel de `Landings`, mostrando como o chat vira draft, preview JSON, `Offer`, `LandingPage` e rota publica React.
- [x] CRUD completo na lista de `Ofertas publicadas`, com criar nova oferta, editar, ativar/pausar e excluir direto do catalogo administrativo.
- [x] Builds de `api` e `web` validados com sucesso apos a implementacao.

## Atualizacao extra - 2026-04-07 (Refino visual da area Landings)

- [x] `OffersSection.tsx` recebeu page header, metric cards mais limpos e tabs com navegacao visual alinhada ao painel administrativo.
- [x] Sidebar de sessoes/ofertas e card de operacoes foram reorganizados com hierarquia mais clara, espacamento generoso e lista de versoes simplificada.
- [x] Workspace de criacao ficou mais enxuto, com menos textos explicativos, sem card de arquitetura e apenas contexto util nas sessoes e no preview.
- [x] Fluxo de criacao migrado para um workspace fullscreen estilo Lovable, com chat a esquerda, preview central e retorno simples para a lista de ofertas publicadas.
- [x] Modo de criacao passou a esconder a sidebar e o header do app, ocupando a tela inteira com apenas o botao de voltar no topo.
- [x] Feed do chat de criacao foi refinado para parecer uma thread de builder, com separadores de data, cards de mensagem mais editoriais e composer mais proximo do estilo Lovable.
- [x] Chat de criacao foi simplificado novamente para ficar mais proximo de um chat real, com menos chrome interno, menos espacamento morto e bubbles mais limpas.
- [x] Composer do chat passou a autoajustar a altura conforme o texto digitado, sem tamanho fixo predefinido.
- [x] Composer do workspace passou a enviar com `Enter`, manter quebra de linha com `Shift+Enter` e usar o botao de envio separado visualmente da caixa de texto.
- [x] Build de `web` validado com sucesso em `bun run build` apos o refino visual.
- [x] Cores do chat de criacao unificadas com o painel de preview (`bg-slate-900/40`, `bg-slate-950/70` para bubbles, `bg-slate-900/60` para composer), eliminando o desalinhamento de tons entre as duas areas.
- [x] Exibicao otimista da mensagem do usuario no chat de criacao: a mensagem aparece imediatamente ao enviar, sem esperar o roundtrip da API. Em caso de erro, rollback automatico e restauracao do texto no composer.
- [x] Chat do workspace expande para o centro da tela (max 720px) quando nao ha preview gerado, com transicao suave ao gerar preview para split view. Botoes de acao (Gerar preview, Publicar) fixos no header.
- [x] Removido o background/border da caixa de chat quando centralizado, fazendo com que o chat se misture visualmente com o fundo do aplicativo conforme solicitado.
- [x] Adicionado botao "Preencher dados" e painel lateral (drawer) para edicao manual dos campos da oferta (Titulo, Slug, Duracao, Modalidade, CTA, etc.), permitindo que o usuario preencha as informacoes diretamente sem depender apenas do chat.
- [x] Otimizacao das cores das bubbles de chat (gradientes e opacidade) para garantir legibilidade total sobre o fundo da pagina.
- [x] Adicionada barra lateral (sidebar) no workspace de criação, listando o histórico de rascunhos (chats) recentes para troca rápida entre sessões.
- [x] Implementada a rota `PATCH /api/landing-creation/sessions/:id` no backend, corrigindo o erro 404 ao tentar atualizar manualmente os dados do rascunho via painel lateral.
- [x] Ajuste de layout responsivo no workspace: Sidebar (280px) + Chat (Dynamic) + Preview (Dynamic), mantendo a fluidez visual do "builder".
- [x] Workspace configurado com altura fixa (`h-[calc(100vh-80px)]`) e scroll interno, garantindo que o histórico de chats e a área de mensagens fiquem sempre visíveis e operáveis sem rolar a página inteira.
- [x] Atualizado o background do campo de input (composer) para `bg-slate-900/90` com sombra externa e anel de brilho sutil, proporcionando melhor destaque visual sobre o fundo transparente.
- [x] Implementado **Debounce de 3 segundos** no painel de edição de rascunhos. O sistema agora aguarda o usuário parar de digitar para enviar o salvamento automático, eliminando lentidões e requisições excessivas (PATCH).
- [x] Barra lateral de rascunhos ajustada para ocupar **100% da altura** disponível no workspace, com scroll interno independente e visual integrado.
- [x] Adicionado **Menu de Contexto (Clique Direito)** nos itens do histórico de chats. Agora é possível excluir rascunhos diretamente pela barra lateral de forma rápida.
- [x] Corrigido bug de duplicação de inputs no painel de rascunhos.
- [x] Design de workspace extremamente modernizado com *framer-motion*: introdução de glassmorphism avançado (backdrop-blur), micro-interações intensas com efeito `spring` e layouts fluídos, implementando a experiência exigida de visual deslumbrante e interatividade máxima.

## Atualizacao extra - 2026-04-07 (Historico condensado no topo do chat)

- [x] Historico lateral do workspace de criacao foi removido no modo de chat e substituido por um dropdown no topo esquerdo, ocupando o lugar do antigo botao de voltar.
- [x] Novo trigger do dropdown passou a exibir o chat atual com contexto rapido do tema salvo ou da ultima atualizacao, seguindo a referencia visual solicitada.
- [x] Dropdown do chat agora lista ate 3 chats recentes, oferece atalho para novo rascunho, opcao de excluir o chat atual e a acao de voltar para a lista principal.
- [x] Adicionado wrapper `DropdownMenu` em `web/src/components/ui/dropdown-menu.tsx`, alinhando a implementacao ao stack Tailwind + shadcn/Radix usado no projeto.
- [x] Build de `web` validado com sucesso em `bun run build` apos a refatoracao do historico do chat.

## Atualizacao extra - 2026-04-07 (Workspace dividido em recentes, chat e preview)

- [x] Workspace de criacao da landing foi reorganizado em 3 areas persistentes: coluna de recentes, coluna de chat e coluna de preview, seguindo a divisao visual solicitada.
- [x] Adicionado botao para colapsar e reabrir a coluna do chat, liberando mais espaco para o preview sem perder o contexto da sessao.
- [x] Preview passou a permanecer sempre visivel como painel dedicado, com estado vazio orientado quando ainda nao existe landing gerada.
- [x] Lista de recentes ganhou navegacao direta entre sessoes, destaque visual da sessao ativa e atalho de exclusao no proprio card.
- [x] Build de `web` validado com sucesso em `bun run build` apos a nova divisao da interface.

## Atualizacao extra - 2026-04-07 (Ajustes finais do workspace e nome da IA)

- [x] Workspace de criacao voltou ao formato anterior com dropdown superior para chats recentes, removendo novamente a coluna fixa de recentes.
- [x] Nome visivel da IA foi padronizado para `Lume` no frontend, incluindo chat de landings, configuracoes, automacao e resumo de lead.
- [x] Build de `web` validado com sucesso em `bun run build` apos o ajuste de nomenclatura para `Lume` e o retorno do dropdown superior.
- [x] Dropdown superior do historico agora aparece apenas quando a sessao ja esta em conversa e com tema definido; antes disso, o workspace volta a exibir a sidebar de chats.

- [x] Trigger compacto de chats foi simplificado de novo para ficar como a referencia: apenas a logo vermelha visivel, com hamburguer no hover abrindo a sidebar.

- [x] Dropdown superior acima do chat foi restaurado no workspace compacto, substituindo novamente a versao de logo isolada.

- [x] Logo vermelha no header compacto passou a abrir a sidebar principal em overlay dentro do modo imersivo de landings.

- [x] Selecionar um rascunho com historico pela sidebar ou por `Continuar rascunho` agora abre direto no modo compacto, exibindo a barra superior sem clique extra.

- [x] Seta ao lado do titulo no header compacto foi removida e o botao de colapsar agora realmente esconde a coluna do chat quando ha preview.

- [x] Colapso do chat no modo compacto foi ajustado para recolher na propria coluna, evitando que o preview desça para baixo durante a transicao.

- [x] Coluna do chat ganhou controle manual de largura por alca de resize, com limite maximo fixo de 600px.
