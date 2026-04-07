# Completed Tasks
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
- [x] Build de `web` validado com sucesso em `bun run build` apos o refino visual.

