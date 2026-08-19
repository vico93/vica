# Vica (Osmium) — Plano de Desenvolvimento

> Roadmap em milestones, em ordem de dependência. Cada milestone só é "done" quando os critérios forem satisfeitos (ver também `@TASKS.md`).

## Milestone 0 — Fundação & codegen

**Objetivo:** repo pronto, bindings protobuf gerados, config e DB inicializados.

**Done criteria:**
- [ ] `package.json` com scripts `gen`/`start` e deps (`@bufbuild/protobuf`, `@bufbuild/protoc-gen-es`, `@bufbuild/buf`, `ws`, `toml`, SQLite, `@openrouter/agent`, `@openrouter/mcp`, `zod`, logger).
- [ ] `proto/` como **submódulo git** de `osmiumchat/proto` + `buf.gen.yaml` gerando JS (`target=js`) em `src/gen/` (gitignored).
- [ ] `src/config.js` carrega `config.toml` + `tools.json` + `mcp.json` com validação mínima.
- [ ] `src/db/` com schema inicial + migrations; `src/utils/logger.js` funcionando.

## Milestone 1 — Camada de transporte Osmium

**Objetivo:** conectar, autenticar e trocar mensagens com o Osmium sem SDK.

**Pré-requisito:** mapear WS endpoint, auth e framing lendo os `.proto` (submódulo) + doc do protocolo; `sdk-js` apenas como pista (está desatualizado).

**Done criteria:**
- [ ] `client/connection.js` com WebSocket + reconexão (backoff + jitter).
- [ ] `client/transport.js` encode/decode (`toBinary`/`fromBinary`).
- [ ] `client/rpc.js` correlacionando request/response por `request_id`.
- [ ] `client/auth.js` executando handshake `Initialize`/`Initialized` com token.
- [ ] `gateway/dispatcher.js` despachando updates por tipo.
- [ ] **Smoke:** bot conecta, escuta `message`, e responde `!ping` → `pong`.

## Milestone 2 — Comandos por prefixo

**Objetivo:** sistema de comandos funcional.

**Done criteria:**
- [ ] `commands/registry.js` com parser de prefixo configurável.
- [ ] Comandos `ping`, `perfil`, `rank`, `perguntar`, `admin` implementados.
- [ ] Auto-delete opcional de mensagens de comando.
- [ ] Restrição de `admin` a usuários autorizados.

## Milestone 3 — XP / Ranking

**Objetivo:** sistema de XP estilo Loritta + XP de voz.

**Done criteria:**
- [ ] `features/xp/rules.js` reproduz as regras de XP de texto da Loritta (extraídas do FAQ + branch `old`).
- [ ] `features/xp/voice.js` pontua presença em voz quando há >1 não-bot no canal (1 XP/min).
- [ ] `features/xp/level.js` com nível (1000 XP) e ranking local.
- [ ] Persistência em SQLite; comandos `perfil`/`rank` consultando o banco.

## Milestone 4 — IA (OpenRouter)

**Objetivo:** o "coração" da Vica respondendo via OpenRouter.

**Done criteria:**
- [ ] `ai/agent.js` com `callModel` (modelo configurável) + `ai/persona.md`.
- [ ] Triggers: menção (ID ou username), reply a msg do bot, reação (emoji CUSTOM configurado; vazio = desativado) — com remoção da reação após responder.
- [ ] `ai/tools/loader.js` carregando ferramentas locais de `tools.json`.
- [ ] `ai/mcp.js` carregando MCP remoto de `mcp.json` via `createMCPTools`.
- [ ] **Smoke:** menção gera resposta (ID e username); reply gera resposta; reação dispara resposta e é removida.

## Milestone 5 — Polimento & deploy

**Objetivo:** pronto para rodar em produção (systemd).

**Done criteria:**
- [ ] `deploy/vica.service` + `config.example.toml`/`tools.example.json`/`mcp.example.json`.
- [ ] Logging stdout (journald) e graceful shutdown (fechar WS + MCP handles).
- [ ] Documentação de setup no `README`.
- [ ] Verificação de leveza p/ Raspberry Pi 3b+ (sem deps nativas desnecessárias).

---

## Decisões confirmadas

- XP **local-only** (bot privado). ✓
- **1 XP/min** em voz; **emoji de reação é custom e sem default** (vazio = trigger por reação desativado). ✓
- DB: **`better-sqlite3`**. ✓
- Prefixo: **`!`**. ✓
- `proto/` = **submódulo git**; `src/gen` **gitignored** (regenerar). ✓
- Estrutura e persona **reescritas do zero**; persona em arquivo **`.md`** separado. ✓

## Pendências (fora do nosso controle)

- Nenhuma no momento. *(Detecção de menção resolvida com o Folf — ver `SPEC.md` §6.1.)*
