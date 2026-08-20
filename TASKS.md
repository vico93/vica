# Vica (Osmium) — Tarefas

> Lista granular, em ordem de execução. Cada tarefa tem **critérios de aceite (AC)**. Marque `[x]` ao concluir.
> Siga os milestones de `@PLAN.md` e as regras de `AGENTS.md`.

## M0 — Fundação

- [x] **T0.1** Scaffold do `package.json` (ESM, scripts `gen`/`start`) e `.gitignore` (node_modules, `config.toml`, `*.local.*`, `data/`).
  - AC: `npm install` e `npm start` rodam sem erro (mesmo sem funcionalidade).
- [x] **T0.2** Adicionar `proto/` como **submódulo git** de `osmiumchat/proto` + criar `buf.gen.yaml` (`target=js`) e script `npm run gen`.
  - AC: `git submodule` configurado; `npm run gen` gera `.js` em `src/gen/` (gitignored) sem erros.
- [x] **T0.3** `src/config.js`: carregar `config.toml`, `tools.json`, `mcp.json` (com fallback para templates).
  - AC: config ausente/malformada → erro claro; valores defaults aplicados.
- [x] **T0.4** `src/db/` + `schema.sql` + migrations; `src/utils/logger.js`.
  - AC: DB inicializa; logger escreve em stdout com nível configurável.

## M1 — Transporte Osmium

- [x] **T1.1** Investigar `.proto` (submódulo) + doc do protocolo (e `sdk-js` só como pista) para mapear WS endpoint, auth e framing; registrar em comentário/código.
  - AC: nota com achados adicionada (não alucinar; citar arquivos/linhas).
- [x] **T1.2** `client/connection.js` (WS + reconexão com backoff/jitter).
  - AC: desconecta → reconecta com backoff; eventos `connect`/`disconnect` emitidos.
- [x] **T1.3** `client/transport.js` (encode/decode) e `client/rpc.js` (request_id).
  - AC: round-trip de uma RPC de teste com correlação correta.
- [x] **T1.4** `client/auth.js` (handshake `Initialize`/`Initialized` + token).
  - AC: autentica com sucesso e marca ready.
- [x] **T1.5** `gateway/dispatcher.js` + `events.js`.
  - AC: mensagem recebida é roteada ao handler correto.
- [x] **T1.6** Smoke M1: `!ping` → resposta `pong`.
  - AC: comando responde no canal.

## M2 — Comandos

- [x] **T2.1** `commands/registry.js` (prefixo configurável + parser).
  - AC: comando com prefixo correto dispara; prefixo errado é ignorado.
- [x] **T2.2** Comando `ping`.
- [x] **T2.3** Comandos `perfil` e `rank` (consultando DB — inicialmente stub).
- [x] **T2.4** Comando `perguntar` (posta pergunta no canal).
- [x] **T2.5** Comando `admin` (set emoji de reação, set prefixo) restrito a admins.
- [x] **T2.6** Auto-delete opcional de mensagens de comando.
  - AC: com flag ativa, a mensagem do comando é apagada após execução.

## M3 — XP / Ranking

- [ ] **T3.1** Extrair regras EXATAS de XP do FAQ Loritta + código da branch `old`; registrar em `features/xp/rules.js`.
  - AC: regras documentadas e testáveis (unidade).
- [ ] **T3.2** Persistência de XP (texto) no SQLite (anti-spam: `last_message_at`, `last_message_hash`).
- [ ] **T3.3** `features/xp/voice.js`: presença em voz com >1 não-bot → XP por tempo.
- [ ] **T3.4** `features/xp/level.js`: nível (1000 XP) + ranking local.
- [ ] **T3.5** Conectar `perfil`/`rank` ao banco real (substituir stub).
  - AC: usuário manda mensagens → ganha XP → `perfil`/`rank` refletem; voz pontua corretamente.

## M4 — IA (OpenRouter)

- [x] **T4.1** `ai/agent.js`: `OpenRouter` + `callModel` com modelo configurável + estado por canal via `StateAccessor` (SQLite, tabela `conversations`).
- [x] **T4.2** `system_prompt.md` (raiz) + injeção do system prompt (`instructions`).
- [x] **T4.3** `ai/triggers.js`: menção (entity `username` + substring por code point) + reply a msg do bot (comparação com IDs enviados) + reação (diff do `count` do emoji configurado; vazio = desativado) → dispara agente. Inclui visão de imagem (download via `mediaDownloadFilePart`).
   - ⚠️ **Remoção da reação após responder adiada**: no Osmium `RemoveReaction` só remove a reação do PRÓPRIO bot (semântica diferente do Discord). Decisão: só responder por ora; verificar com o Folf. `user_mention` mantido como fallback defensivo.
- [x] **T4.4** `ai/tools/loader.js`: carregar tools de `tools.json` → `tool()` (zod v4).
- [x] **T4.5** `ai/mcp.js`: carregar MCP remoto de `mcp.json` via `createMCPTools` (ignorar/avisar stdio).
- [x] **T4.6** Smoke M4 (nível unidade): tags, tool loader, `StateAccessor` round-trip e imports verificados. Smoke end-to-end (menção/reply/reação → resposta) pendente de ambiente real (token/endpoint).

> Notas de implementação: `@openrouter/mcp@^1` adicionado; `zod` atualizado para **v4** (o `tool().inputSchema` exige `zod/v4`). Estado de conversa persistido no SQLite (sobrevive a restart). Adiado (futuro): mensagens de boas-vindas/saída configuráveis.

## M5 — Deploy

- [ ] **T5.1** `deploy/vica.service` + templates `*.example.*`.
- [ ] **T5.2** Graceful shutdown (fechar WS e handles MCP) + logs stdout.
- [ ] **T5.3** `README` com setup (clone --recurse-submodules → config → install → gen → systemctl).
- [ ] **T5.4** Revisão de leveza p/ Pi 3b+ (deps, memória).
  - AC: instala e roda em Node 24 sem Docker; instruções de systemd completas.
