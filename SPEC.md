# Vica (Osmium) — Especificação Técnica

> Documento de referência técnica. Complementa `AGENTS.md` e orienta o `PLAN.md`/`TASKS.md`.

## 1. Visão geral

Reescrita da **Vica** (Discord → Osmium). Três pilares funcionais:

1. **IA de roleplay** (o "coração") — responde quando: (a) é **mencionada**, (b) alguém **responde** uma mensagem anterior dela, ou (c) alguém **reage** com um emoji configurável em qualquer mensagem (ela **remove a reação** após responder).
2. **Ranking/XP estilo Loritta** — com XP de texto (regras da Loritta) **+ XP de voz** (conta quando há **mais de um membro não-bot** no canal de voz ao mesmo tempo).
3. **`/perguntar`** — gera uma pergunta de engajamento no canal.

## 2. Decisões de stack

| Item | Decisão |
|---|---|
| Linguagem | JavaScript puro (ESM), sem TS |
| Runtime | Node 24 LTS |
| Gerenciador | npm |
| Transporte Osmium | WebSocket + Protobuf (protobuf-es) |
| Codegen protobuf | `@bufbuild/protobuf` + `@bufbuild/protoc-gen-es` + `buf` CLI |
| IA | `@openrouter/agent` + `@openrouter/mcp` (+ `zod`) |
| Config | `config.toml` (TOML) + `tools.json` + `mcp.json` |
| Banco de dados | SQLite — `better-sqlite3` (confirmado; build nativo ok no Pi 3b+) |
| Deploy | systemd (VPS AlmaLinux; alvo futuro Raspberry Pi 3b+) |

## 3. Arquitetura / estrutura de pastas

```
vica/
├── AGENTS.md
├── PLAN.md
├── SPEC.md
├── TASKS.md
├── package.json
├── buf.gen.yaml                  # config do protobuf-es (target=js)
├── proto/                        # submódulo git → osmiumchat/proto (fonte dos .proto)
├── src/
│   ├── gen/                      # código gerado (gitignored; não editar manualmente)
│   ├── index.js                  # bootstrap: carrega config → db → client → gateway
│   ├── config.js                 # carrega/valida config.toml + tools.json + mcp.json
│   ├── client/                   # camada de transporte Osmium
│   │   ├── connection.js         # WebSocket + reconexão com backoff
│   │   ├── transport.js          # fromBinary/toBinary (encode/decode)
│   │   ├── rpc.js                # correlação request_id → resposta
│   │   ├── auth.js               # handshake Initialize/Initialized + token
│   │   └── index.js              # fachada: send(), on(event, handler)
│   ├── gateway/
│   │   ├── dispatcher.js         # roteia ServerMessage → handlers por tipo
│   │   └── events.js             # constantes/nomes de eventos
│   ├── commands/
│   │   ├── registry.js           # registro + parser de prefixo
│   │   ├── ping.js
│   │   ├── perfil.js             # perfil/level do usuário
│   │   ├── rank.js               # ranking do servidor
│   │   ├── perguntar.js          # pergunta de engajamento
│   │   └── admin.js              # config: emoji de reação, prefixo
│   ├── ai/
│   │   ├── agent.js              # OpenRouter callModel + state
│   │   ├── triggers.js           # menção / reply / reação → dispara agente
│   │   ├── tools/
│   │   │   └── loader.js         # tools.json → tool() com zod
│   │   └── mcp.js                # mcp.json → createMCPTools()
│   ├── features/
│   │   ├── xp/
│   │   │   ├── rules.js          # regras de XP de texto (Loritta)
│   │   │   ├── voice.js          # XP de voz (presença >1 não-bot)
│   │   │   └── level.js          # nível (1000 XP = 1 nível) e rank
│   │   └── engagement/
│   │       └── perguntar.js      # lógica de geração de perguntas
│   ├── db/
│   │   ├── index.js              # conexão + migrations
│   │   └── schema.sql
│   └── utils/
│       └── logger.js
├── config.example.toml
├── tools.example.json
├── mcp.example.json
├── system_prompt.example.md      # template do system prompt (raiz, gitignored: system_prompt.md)
└── deploy/
    └── vica.service              # unidade systemd (template)
```

## 4. Módulo Osmium (camada de transporte)

O bot **não usa** o `@osmiumchat/sdk`. A camada própria:

1. **Fonte dos `.proto`**: `proto/` é um **submódulo git** de `github.com/osmiumchat/proto` (clonar com `--recurse-submodules`). É a **fonte da verdade** — o `@osmiumchat/sdk` está desatualizado em relação a ele e **não deve ser usado**.
2. **Gerar bindings** com `buf` + `protoc-gen-es` usando `target=js` (JS puro) para `src/gen/` (**gitignored**). `buf.gen.yaml`:
   ```yaml
   version: v2
   inputs:
     - directory: proto
   plugins:
     - local: protoc-gen-es
       out: src/gen
       opt: target=js
   ```
   Script `npm run gen` → `buf generate`.
3. **`client/connection.js`**: WebSocket (`ws`), reconexão com backoff exponencial + jitter, heartbeat (se o protocolo exigir).
4. **`client/transport.js`**: serialização com `toBinary`/`fromBinary` de `ClientMessage`/`ServerMessage`.
5. **`client/rpc.js`**: cada `ClientMessage` tem `request_id`; correlacionar `ServerMessage`/`RPCResult`/`RPCError`.
6. **`client/auth.js`**: fluxo de autenticação por token (ver `auth.proto`) e handshake `Initialize`→`Initialized`.
7. **`gateway/dispatcher.js`**: recebe updates em tempo real (push) e despacha para handlers.

> ⚠️ **O que o harness DEVE descobrir antes de codar:** endpoint exato do WebSocket, como o token é enviado, a sequência de `Initialize`/`Initialized` e o enquadramento de `ClientMessage`/`ServerMessage` no wire. Fontes, em ordem: (1) submódulo `proto/` + doc do protocolo (`core.proto`, "Client-Server Communication", "Message Flow"); (2) `sdk-js` apenas como pista, **validando contra os `.proto`** (o SDK está desatualizado). **Não assumir** — a doc pública tem inconsistências (landing usa `OsmiumClient` + `"message"`; o README usa `Client` + `Events.MessageCreated`).

## 5. Comandos (por prefixo)

- **Prefixo** configurável em `config.toml` (padrão: `!`).
- Parser simples: `<prefixo><comando> [args...]`.
- **Auto-delete** opcional da mensagem de comando (flag na config).
- MVP de comandos:
  - `ping` — latência.
  - `perfil` (e alias `level`) — XP/nível/colocação do usuário.
  - `rank` — ranking do servidor (paginado).
  - `perguntar` — gera pergunta de engajamento.
  - `admin` — configura emoji de reação da IA e prefixo (restrito a admins).
- **Removido por falta de suporte no Osmium:** criação de tópico dentro da mensagem do rank e menção `@everyone` (não existe). Ver §13.

## 6. IA (OpenRouter Agent SDK)

Pacotes: `@openrouter/agent`, `@openrouter/mcp`, `zod`.

### 6.1 Triggers
- **Menção** do bot em uma mensagem (ver algoritmo abaixo).
- **Reply** a uma mensagem do bot.
- **Reação** com um **emoji configurado por admin** (por comunidade, via `!admin emoji`) em qualquer mensagem → após responder, **remover a reação** (adiado — `RemoveReaction` só remove a reação do próprio bot).
  - **Sem default:** se nenhum emoji estiver configurado, o trigger por reação fica **desativado**.
  - ⚠️ **Custom emoji do Osmium é "skin" sobre um emoji Unicode base** (`MetadataCustomEmoji.emoji`): configure o **emoji base** (ex.: `👩`), não o shortcode (`:vica:`). `!admin emoji detect` descobre o valor exato.

**Detecção de menção (referência: `hasMention` do SDK):**

```js
get hasMention() {
  if (this.replyToMessage?.authorId === this.client.user?.id) return true; // reply à msg do bot conta como menção
  const username = this.client.user?.username;
  if (!username) return false; // bot sem username → sem menção
  if (this.entities) {
    return this.entities.some(e =>
      e.entity === 'username' &&
      this.message.substring(e.startIndex + 1, e.startIndex + 1 + e.length) === username
    );
  }
  return false;
}
```

Regras extraídas (e confirmadas pelo Folf):

1. **Reply a uma mensagem do bot** conta como "menção" no SDK. No nosso bot, reply já é trigger separado — sem conflito, só não duplicar a resposta.
2. **Só a entidade `username` é verificada** — como o bot tem username, menções a ele chegam como `username`. O `user_mention` (por ID) **nem é checado** aqui; manter apenas como fallback defensivo (alvo sem username).
3. **Extração do username**: `substring(startIndex + 1, startIndex + 1 + length)` — o `+1` pula o `@`; `length` é o tamanho do username. Comparar com o username do bot.
4. No login/Ready, capturar **ID e username** do bot (equivalente ao `client.user` do SDK).

⚠️ **Representação (importante):** o snippet é do SDK, que normaliza a entidade (`e.entity === 'username'`, campos camelCase `startIndex`/`length`). Com **protobuf-es puro**, o oneof `entity` vem como objeto `{ case, value }` e os campos em camelCase — ex.: `e.entity?.case === 'username'`. **Confirmar a forma exata no código gerado em `src/gen/`** (nome do case, ex.: `username` vs `userMention`).

⚠️ `start_index`/`length` são em **Unicode code points** (não bytes nem UTF-16). O SDK usa `substring` (UTF-16), que quebra com caracteres fora do BMP (emoji). No nosso bot, fatiar por code point (ex.: `Array.from(text)`).

### 6.2 Persona
- `system_prompt.md` (raiz, gitignored; template `system_prompt.example.md`) = system prompt de roleplay, em arquivo **`.md`** separado (não reutilizar os `.txt` das versões antigas; conteúdo a reescrever/definir).
- Estado de conversa por canal/thread gerido pelo Agent SDK (`callModel` mantém o histórico da sessão).

### 6.3 Ferramentas locais (`tools.json`)

O Agent SDK define cada ferramenta em **código** com `tool({ name, description, inputSchema, execute })`. O `inputSchema` descreve os argumentos que o modelo pode passar, usando a biblioteca **zod** (lib de validação: você descreve a "forma" do objeto — campos, tipos, obrigatórios — e ela valida os argumentos do modelo antes de executar).

Como `tools.json` é JSON puro e o SDK espera zod (código), a estratégia adotada:

- **`tools.json`** = índice simples de quais ferramentas carregar e de onde:
  ```json
  { "tools": [ { "name": "get_weather", "module": "./tools/weather.js", "enabled": true } ] }
  ```
- **Cada módulo** (`./tools/weather.js`) exporta `name`, `description`, `inputSchema` (zod) e `execute` — o contrato fica no código, onde o zod vive.
- `loader.js` lê o JSON, importa os módulos e monta o array de `tool()` para o `callModel`.

> Por quê não colocar o schema inteiro no JSON? Porque exigiria converter JSON Schema → zod em runtime (frágil). Manter o zod no módulo e o JSON só como índice é mais simples de estender (copiar um módulo-exemplo + uma linha no JSON).

### 6.4 MCP (`mcp.json`)
- Usar `@openrouter/mcp` → `createMCPTools({ url, auth })`, espalhar `mcp.tools` no `callModel`.
- `mcp.json` pode seguir o formato popular (`mcpServers`), **mas**:
  > ⚠️ **`@openrouter/mcp` só suporta servidores remotos (Streamable HTTP/SSE). Servidores `stdio` estão FORA de escopo.** Entradas `stdio` (command/args) devem ser ignoradas com aviso no MVP (ou exigiriam um bridge separado, fora do escopo inicial).

```json
{
  "mcpServers": {
    "linear": { "url": "https://mcp.example.com/mcp", "headers": { "Authorization": "Bearer ..." } }
  }
}
```

- `mcp.js` mapeia cada entrada (url + auth) → `createMCPTools`, fechando os handles no shutdown.

## 7. XP / Ranking (estilo Loritta)

Referência: https://loritta.website/us/extras/faq-loritta/experience

### 7.1 Regras de XP de texto (reproduzir a Loritta)
- Mensagem com **> 5 caracteres**.
- Mensagem **diferente da última** enviada.
- **Anti-spam** ("humanamente possível"): se a última msg do usuário foi há ~5s e vier texto gigante, ignorar (conferir fórmula exata: `caracteres/7` vs intervalo).
- Mensagem **sem caracteres repetidos** (ex.: `kkkkkk` → `k`) precisa ter **> 12 caracteres**.
- XP = `caracteres_não_repetidos / 7`, com **teto de 35 XP** (há menção a `/4` na doc — conferir regra exata no FAQ original e no código antigo da branch `old`).

> ⚠️ Extrair a fórmula EXATA do FAQ original e do código antigo (branch `old`), não improvisar.

### 7.2 XP de voz (diferencial da Vica)
- Conta **atividade em canal de voz** quando há **> 1 membro não-bot** no canal simultaneamente.
- Acúmulo por tempo: **1 XP/minuto** (confirmado). Cada usuário não-bot presente pontua enquanto houver >1 não-bot no canal.

### 7.3 Níveis e rank
- **1 nível = 1000 XP**.
- XP **local por comunidade** (bot privado; sem XP global).
- Comandos `perfil` e `rank` (colocação, XP atual, XP até o próximo nível).

### 7.4 Removido/adaptado (limitações do Osmium)
- **Sem** criação de tópico na mensagem de rank.
- **Sem** menção `@everyone` no rank/perguntar.

## 8. Comando `/perguntar`

- Gera uma pergunta de engajamento no canal onde foi executado.
- Opção original "mencionar `@everyone` ou não" → **removida** (não existe no Osmium); apenas posta a pergunta.

## 9. Configuração

### 9.1 `config.toml` (básico do bot)
```toml
[osmium]
endpoint = "wss://osmium.chat/api/v1/gateway"  # endpoint WebSocket
token = "..."          # NUNCA versionar (template usa placeholder)
prefix = "!"
auto_delete_commands = false
voice_xp_per_minute = 1

[openrouter]
model = "..."           # ex.: modelo OpenRouter com crédito/gratuito
api_key = "..."         # NUNCA versionar
system_prompt = "system_prompt.md"  # system prompt na raiz (gitignored; template system_prompt.example.md)

[database]
path = "./data/vica.db"

[logging]
level = "info"
```

### 9.2 `tools.json` e `mcp.json`
Ver §6.3 e §6.4. Templates: `tools.example.json` e `mcp.example.json`.

## 10. Banco de dados

- SQLite via **`better-sqlite3`** (confirmado).
- `src/db/schema.sql` com migrations versionadas (tabela `schema_migrations`).
- Tabelas mínimas:
  - `users` (id, comunidade, nome/nick, ...)
  - `xp` (user_id, comunidade_id, xp_total, xp_voice, xp_text, last_message_at, last_message_hash, ...)
  - `settings` (chave/valor por comunidade: prefixo, emoji, canais ignorados, etc.)
  - `conversations` (estado da IA por canal, se necessário persistir)

## 11. Logging

- Logger central em `src/utils/logger.js` (ex.: `pino` ou similar leve) → **stdout**.
- Rodando sob systemd, o `journald` captura stdout/stderr automaticamente (`journalctl -u vica`).

## 12. Deploy (systemd)

- `deploy/vica.service`: `Type=simple`, `ExecStart=/usr/bin/node /opt/vica/src/index.js`, `WorkingDirectory=...`, `User=...`, `Restart=on-failure`, `EnvironmentFile` (se usar `.env`).
- Fluxo: `git clone --recurse-submodules` → copiar `config.example.toml` → `config.toml` (preencher segredos) → `npm install` → `npm run gen` (gera `src/gen`) → copiar `.service` → `systemctl enable --now vica`.
- **Otimizar para Pi 3b+**: evitar deps nativas pesadas, manter memória baixa, backoff de reconexão, sem Docker.

## 13. Riscos & gotchas (⚠️ não esquecer)

1. **Sem slash commands** → prefixo obrigatório.
2. **Sem `@everyone`/`@here`** → adaptar rank/perguntar.
3. **SDK `@osmiumchat/sdk` desatualizado** em relação a `osmiumchat/proto` → fonte da verdade são os `.proto` (submódulo); SDK só como pista.
4. **`@openrouter/mcp` não suporta stdio** → `mcp.json` só com servidores remotos no MVP.
5. **`tool()` exige zod** → estratégia definida: JSON é só índice; zod fica no módulo da ferramenta (§6.3).
6. **Fórmula XP exata** → extrair do FAQ + branch `old`, não improvisar.
7. **Menção de usuário/bot** → resolvido: `user_mention` (por ID, carrega o alvo) vs `username` (por nome → `users.lookupUsername`). Ver §6.1. Índices em **Unicode code points**, não UTF-16.
8. **`src/gen`** é **gitignored** e regenerado com `npm run gen`; `proto/` é **submódulo git**.
9. **Raspberry Pi 3b+** (ARM, ~1 GB): `better-sqlite3` (confirmado) exige toolchain nativo — garantir build tools no alvo.

## 14. Referências

- Protocolo Osmium (índice): https://mintlify.com/osmiumchat/proto/llms.txt
- `.proto` oficiais: https://github.com/osmiumchat/proto
- `types.MessageEntity` (menções): https://osmium.chat/docs/proto/types.messageentity/
- Users API (`lookupUsername`): https://mintlify.wiki/osmiumchat/proto/api/users.md
- SDK JS (pista de transporte apenas; pode estar desatualizado): https://github.com/osmiumchat/sdk-js
- protobuf-es: https://github.com/bufbuild/protobuf-es
- OpenRouter Agent SDK: https://openrouter.ai/docs/agent-sdk/overview
- OpenRouter Tools: https://openrouter.ai/docs/agent-sdk/call-model/tools
- OpenRouter MCP: https://openrouter.ai/docs/agent-sdk/call-model/mcp-tools
- XP Loritta: https://loritta.website/us/extras/faq-loritta/experience
