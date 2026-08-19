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
- [ ] **T1.5** `gateway/dispatcher.js` + `events.js`.
  - AC: mensagem recebida é roteada ao handler correto.
- [ ] **T1.6** Smoke M1: `!ping` → resposta `pong`.
  - AC: comando responde no canal.

## M2 — Comandos

- [ ] **T2.1** `commands/registry.js` (prefixo configurável + parser).
  - AC: comando com prefixo correto dispara; prefixo errado é ignorado.
- [ ] **T2.2** Comando `ping`.
- [ ] **T2.3** Comandos `perfil` e `rank` (consultando DB — inicialmente stub).
- [ ] **T2.4** Comando `perguntar` (posta pergunta no canal).
- [ ] **T2.5** Comando `admin` (set emoji de reação, set prefixo) restrito a admins.
- [ ] **T2.6** Auto-delete opcional de mensagens de comando.
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

- [ ] **T4.1** `ai/agent.js`: `OpenRouter` + `callModel` com modelo configurável.
- [ ] **T4.2** `ai/persona.md` + injeção do system prompt.
- [ ] **T4.3** `ai/triggers.js`: menção + reply a msg do bot + reação (emoji custom; vazio = desativado) → dispara agente; **remove reação** após responder.
  - AC: menção por `username` replicando `hasMention` do SDK (substring `startIndex+1` → compara com username do bot, via code points); reply e reação funcionando; reação removida. `user_mention` opcional (fallback defensivo).
- [ ] **T4.4** `ai/tools/loader.js`: carregar tools de `tools.json` → `tool()` (estratégia zod do SPEC §6.3).
- [ ] **T4.5** `ai/mcp.js`: carregar MCP remoto de `mcp.json` via `createMCPTools` (ignorar/avisar stdio).
- [ ] **T4.6** Smoke M4: menção (ID e nome) → resposta; reply → resposta; reação → resposta + remoção.

## M5 — Deploy

- [ ] **T5.1** `deploy/vica.service` + templates `*.example.*`.
- [ ] **T5.2** Graceful shutdown (fechar WS e handles MCP) + logs stdout.
- [ ] **T5.3** `README` com setup (clone --recurse-submodules → config → install → gen → systemctl).
- [ ] **T5.4** Revisão de leveza p/ Pi 3b+ (deps, memória).
  - AC: instala e roda em Node 24 sem Docker; instruções de systemd completas.
