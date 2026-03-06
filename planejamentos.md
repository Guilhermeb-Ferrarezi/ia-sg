# Planejamento 90 Dias - Bot WhatsApp IA (Escola de Cursos)

## Resumo
Planejamento para evolução do projeto com prioridade em confiabilidade operacional antes de novas funcionalidades.  
Este é o conteúdo oficial mantido em `planejamentos.md`.

## Objetivos (90 dias)
1. Disponibilidade da API >= 99,5%.
2. Falhas de processamento de webhook < 1%.
3. Zero resposta duplicada para a mesma mensagem (`waMessageId`).
4. Tempo médio de primeira resposta automática < 45s.
5. Pelo menos 70% dos leads com perfil qualificado (curso, modalidade, disponibilidade).
6. Cobertura de testes automatizados para fluxos críticos de API e front.

## Roadmap por sprint (2 semanas cada)

### Sprint 1 - Base de Confiabilidade
1. Validar variáveis de ambiente no boot (fail-fast).
2. Padronizar UTF-8 e textos sem erro de acentuação.
3. Validar assinatura do webhook da Meta.
4. Criar logs estruturados com correlação (`requestId`, `waId`, `contactId`).
5. Adicionar endpoint de readiness com verificação de DB.
6. Critério de aceite: webhook inválido retorna 403 e API não sobe sem env obrigatória.

### Sprint 2 - Idempotência e Fila
1. Persistir eventos de webhook em tabela própria.
2. Processar eventos via worker interno (`pending`, `processing`, `done`, `failed`, `dead`).
3. Implementar retry com backoff para OpenAI e WhatsApp.
4. Criar replay manual para eventos com falha.
5. Critério de aceite: evento repetido não gera resposta duplicada.

### Status atual (Sprint 1 e 2)
1. Sprint 1 e Sprint 2: concluídas no backend.
2. Critérios de aceite atendidos:
   - webhook inválido retorna `403`;
   - API não sobe sem variáveis obrigatórias;
   - evento repetido não gera resposta duplicada.
3. Funcionalidades acessíveis no frontend (aba `Operação`):
   - Saúde do sistema (`readiness` e `health-details`);
   - Lista de eventos de webhook com filtro/paginação;
   - Replay manual de eventos com falha.
4. Itens dessas sprints que não possuem tela dedicada (somente backend):
   - validação fail-fast de env;
   - validação de assinatura da Meta;
   - logs estruturados com correlação;
   - retry/backoff de integrações.

### Sprint 3 - Qualificação de Leads
1. Extrair dados de interesse: curso, modalidade, disponibilidade, nível, objetivo.
2. Fazer perguntas de triagem quando faltar dado essencial.
3. Calcular score de qualificação por lead (0-100).
4. Encaminhar para humano por regra quando houver ambiguidade.
5. Critério de aceite: perfil mínimo completo em >= 70% dos leads com conversa ativa.

### Sprint 4 - CRM Operacional
1. Exibir novos campos de qualificação no painel.
2. Criar automações de tarefa (ex.: follow-up em 24h sem resposta).
3. Finalizar gestão de tags no frontend.
4. Melhorar uso de templates no chat manual.
5. Critério de aceite: operação comercial usa filtros por perfil e score sem intervenção técnica.

### Sprint 5 - Analytics e Auditoria
1. Adicionar métricas por curso, origem e handoff.
2. Registrar auditoria de eventos críticos.
3. Exportar leads e tarefas em CSV com filtros.
4. Critério de aceite: dashboard responde perguntas de funil e exportação funciona.

### Sprint 6 - Hardening e Go-Live
1. Pipeline CI com testes API e front.
2. Checklist de deploy/rollback no fluxo atual.
3. Rotina de backup e restauração validada.
4. Runbook de incidentes operacionais.
5. Critério de aceite: deploy seguro com smoke test e rollback documentado.

## Mudanças de APIs, interfaces e tipos

### Novos endpoints
1. `GET /api/system/readiness`
2. `GET /api/system/health-details`
3. `GET /api/webhook/events?status=&page=&limit=`
4. `POST /api/webhook/events/:id/replay`
5. `PATCH /api/crm/leads/:id/handoff`

### Alterações de endpoints existentes
1. `POST /api/webhook` com validação obrigatória de assinatura.
2. `GET /api/crm/leads` com filtros adicionais: `course`, `modality`, `scoreMin`, `scoreMax`, `handoffNeeded`.
3. `PUT /api/crm/leads/:id` aceitando campos de qualificação.

### Alterações de schema/tipos
1. `Contact`: `interestedCourse`, `courseMode`, `availability`, `qualificationScore`, `handoffNeeded`.
2. Nova entidade `WebhookEvent` para rastreio e reprocesso.
3. Tipo `Lead` no frontend atualizado com novos campos.
4. Novos eventos WS: `lead_profile_updated`, `webhook_event_failed`.

## Testes e cenários obrigatórios
1. Segurança: autenticação e assinatura de webhook.
2. Idempotência: mesma mensagem recebida duas vezes sem duplicar resposta.
3. Resiliência: falha OpenAI e WhatsApp com retry e dead-letter.
4. CRM: CRUD de lead, mudança de estágio/status, bot on/off e tarefas automáticas.
5. Chat: fluxo bot, fluxo humano e transição sem conflito.
6. Front: atualização em tempo real com novos eventos WebSocket.

## Riscos e mitigação
1. Risco: sobrecarga no `server.ts` monolítico.  
Mitigação: modularizar em camadas (`routes`, `services`, `workers`).
2. Risco: regressão em tempo real (WS).  
Mitigação: testes de integração e fallback de sync periódico.
3. Risco: custos de IA em alta.  
Mitigação: limites por contato, cache de contexto e observabilidade de consumo.

## Assumptions e defaults
1. Domínio oficial: escola de cursos.
2. Prioridade do ciclo: confiabilidade primeiro.
3. Horizonte: 90 dias.
4. Stack mantida: Express + Prisma + React + WebSocket.
5. Banco principal: PostgreSQL.
6. Canais suportados no ciclo: texto e áudio.
7. Timezone operacional: `America/Sao_Paulo`.

## Itens fora de WS (tempo real) - status atualizado
1. Saude do sistema agora possui push WS dedicado com evento `system_health_updated` (polling 30s mantido como fallback).
2. Lista de eventos de webhook agora possui notificacao WS dedicada via `webhook_event_updated` (além de `webhook_event_failed`).
3. Analytics agora possui evento WS `analytics_updated` para refresh automatico.
4. Calendario de tarefas agora possui evento WS `calendar_tasks_updated` para refresh automatico.
5. FAQs agora possuem sincronizacao WS dedicada com evento `faqs_updated`.
6. Templates de mensagem agora possuem sincronizacao WS dedicada com evento `templates_updated`.
7. Tags e vinculacao de tags agora possuem sincronizacao WS dedicada com eventos `tags_updated` e `lead_profile_updated`.
8. Resumo historico de dashboard agora possui sinalizacao WS via evento `dashboard_updated`.
9. Envio manual no chat (`/api/chat/send`) agora evita reload HTTP obrigatorio apos acao (append otimista + WS).

