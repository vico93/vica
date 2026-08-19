# Vica (Osmium) — Regras do Agente

> Instruções para o **OpenCode**. Leia este arquivo antes de qualquer alteração.
> Documentos de apoio (carregar **sob demanda**, conforme a tarefa): `@SPEC.md`, `@PLAN.md`, `@TASKS.md`.

## O que é

**Vica** é um bot de chat para comunidade, em **reescrita do Discord para o Osmium** (https://osmium.chat).

Esta é a branch `osmium`. A versão antiga do Discord está na branch `old` e serve **apenas** como referência de regras de negócio (fórmula de XP, comportamento dos comandos) — **não portar código dela**: a estrutura é reescrita **do zero** (ver `SPEC.md`). A persona também é reescrita, num arquivo **`.md`** separado (não reutilizar os `.txt` antigos).

## Regras de ouro (NÃO negociáveis)

1. **JavaScript puro (ESM), sem TypeScript.** Runtime **Node 24 LTS**, gerenciador **npm**. Não introduza TS.
2. **NÃO usar o SDK oficial** (`@osmiumchat/sdk`) — ele está **desatualizado** em relação ao repositório `osmiumchat/proto`. Usar **protobuf-es** (`@bufbuild/protobuf` + `@bufbuild/protoc-gen-es`) sobre os `.proto` vindos do **submódulo git** `osmiumchat/proto`, e escrever a **própria camada de transporte**.
3. **NÃO alucinar a API do Osmium.** Antes de codar qualquer RPC/evento/auth, ler obrigatoriamente:
   - os `.proto` oficiais do **submódulo** `github.com/osmiumchat/proto` (fonte da verdade)
   - a doc do protocolo (`core.proto`, "Client-Server Communication", "Message Flow", via `llms.txt`)
   - `github.com/osmiumchat/sdk-js` (`packages/sdk/src`) **apenas como última pista** para endpoint do WebSocket/framing — está desatualizado; **sempre validar contra os `.proto`**.
4. **IA via OpenRouter Agent SDK** (`@openrouter/agent` + `@openrouter/mcp`), **não** a API OpenAI diretamente.
5. **O Osmium NÃO tem slash commands** → comandos por **prefixo** (configurável em `config.toml`).
6. **O Osmium NÃO tem `@everyone`/`@here`** (e possivelmente nem mention de cargo) → toda funcionalidade que dependia de menção coletiva é **removida ou adaptada** (ver `SPEC.md`).
7. **Sem Docker.** O bot roda sob **systemd** e o código deve ser **leve o suficiente para um Raspberry Pi 3b+** (ARM, ~1 GB RAM).

## Comandos úteis

```bash
npm install
npm run gen     # gera bindings protobuf-es a partir de proto/ (target=js)
npm start       # inicia o bot
npm run lint    # se configurado
```

## Estrutura (resumo)

Ver `@SPEC.md` → "Arquitetura". Resumo dos módulos:

- `src/client/` — camada de transporte Osmium (WebSocket + protobuf)
- `src/gateway/` — roteamento de eventos recebidos
- `src/commands/` — sistema de comandos por prefixo
- `src/ai/` — integração OpenRouter (triggers, persona, tools, MCP)
- `src/features/` — XP/ranking e engajamento (`/perguntar`)
- `src/db/` — persistência (SQLite)
- `src/utils/` — logger e utilitários

## Convenções

- Módulos **ESM** (`import`/`export`). Sem `require`, salvo exceção justificada em comentário.
- **Segredos** (token do bot, chave OpenRouter, headers MCP) **nunca** versionados: usar `config.toml` local + templates `*.example.*`.
- Logging sempre via logger central (`src/utils/logger.js`), nunca `console.log` espalhado.
- Comando novo: registrar em `src/commands/registry.js` e documentar no help.
- Antes de declarar uma tarefa concluída, rodar o smoke test indicado em `@TASKS.md`.

## Git

- Commits **diretos na branch `osmium`** (sem PRs).
- O OpenCode adiciona automaticamente `Co-Authored-By: opencode <noreply@opencode.ai>` nos commits que ele gerar — **mantenha**.
- Não commitar `node_modules`, segredos nem artefatos. Manter `.gitignore` atualizado.
- `proto/` é um **submódulo git** de `github.com/osmiumchat/proto` (clone inicial com `--recurse-submodules`).
- `src/gen/` (bindings gerados) é **gitignored** — regenerar com `npm run gen`.

## Carregamento de documentos (sob demanda)

CRÍTICO: ao iniciar uma tarefa, leia os arquivos referenciados com `@` abaixo conforme a necessidade, usando sua ferramenta de leitura. Trate o conteúdo como instrução obrigatória. Não carregue tudo de uma vez — carregue o que for relevante para a tarefa.

- Ordem de execução e milestones: `@PLAN.md`
- Especificação técnica (arquitetura, schemas, regras de negócio): `@SPEC.md`
- Tarefas granulares com critérios de aceite: `@TASKS.md`

## Fontes externas (leia quando relevante)

- Protocolo Osmium (índice da doc): https://mintlify.com/osmiumchat/proto/llms.txt
- `.proto` oficiais: https://github.com/osmiumchat/proto
- SDK JS (pista de transporte apenas; pode estar desatualizado): https://github.com/osmiumchat/sdk-js
- protobuf-es: https://github.com/bufbuild/protobuf-es
- OpenRouter Agent SDK: https://openrouter.ai/docs/agent-sdk/overview
- OpenRouter Tools: https://openrouter.ai/docs/agent-sdk/call-model/tools
- OpenRouter MCP: https://openrouter.ai/docs/agent-sdk/call-model/mcp-tools
- Sistema XP da Loritta (referência de regras): https://loritta.website/us/extras/faq-loritta/experience
