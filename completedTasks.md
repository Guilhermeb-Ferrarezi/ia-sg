# Completed Tasks

Atualizado em: 2026-03-05

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
- [x] Badge de falhas de webhook na navegacao.
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

## Pendencias (nao concluidas ainda do planejamento de 90 dias)

- [ ] Campos de qualificacao no `Contact`: `interestedCourse`, `courseMode`, `availability`, `qualificationScore`, `handoffNeeded`.
- [ ] Endpoint `PATCH /api/crm/leads/:id/handoff`.
- [ ] Filtros planejados em `GET /api/crm/leads`: `course`, `modality`, `scoreMin`, `scoreMax`, `handoffNeeded`.
- [x] Evento WS `lead_profile_updated`.
- [ ] Entregas de Sprint 3 em diante (qualificacao avancada, auditoria/exportacao/CI hardening).
