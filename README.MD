# Vica - Apenas mais um bot para o Discord

## Sobre

Vica é um bot para Discord que unifica funcionalidades de chatbot via API compatível com a OpenAI (modo IA) e comando de perguntas aleatórias de um banco local (modo banco). Desenvolvido em Node.js, roda atualmente em um VPS (gratidão @mojomast) e tem a Raspberry Pi 3B+ como alvo futuro.

---

## Pré-requisitos

* Node.js 20 ou superior (desenvolvido e testado com Node 24)
* Acesso a um bot registrado no Discord (token e client ID)
* Chave de API compatível com OpenAI Chat Completions (endpoint `/v1`)
* Modelo principal com suporte a visão (as imagens são enviadas direto ao modelo)
* `ffmpeg` no PATH (opcional; usado para extrair o primeiro frame de vídeos)

---

## Instalação

1. Clone o repositório

```bash
git clone https://github.com/vico93/vica.git
cd vica
```

2. Instale as dependências

```bash
npm install
```

3. Crie o arquivo `config.toml` na raiz do projeto (você pode copiar `config.example.toml`):

```toml
[discord]
token = "SEU_DISCORD_BOT_TOKEN"
client_id = "SEU_CLIENT_ID"

[ai_provider]
base_url = "https://sua.api.openai.compativel/v1"
api_key = "SUA_CHAVE_API"
model = "seu-modelo-com-visao"

[ai_settings]
send_system_prompt = true
retries = 3
initial_delay_ms = 1000
historyLimit = 8
historyMaxAge = 480
budgetTokenLimit = 8000
rate_limit_ms = 5000
maxToolTurns = 5
mcpToolTimeoutMs = 30000

[ai_tools]
enabled = true
tools_file = "data/tools.json"
```

As seções opcionais `[models.transcriptions]` e `[models.imagegen]` sobrescrevem provider e modelo apenas para transcrição de áudio e geração de imagem, herdando o restante de `[ai_provider]`. Veja `config.example.toml` para a lista completa de opções.

4. Crie a pasta `data/` com os arquivos de conteúdo:

* `data/system_prompt.txt` - prompt de sistema (personalidade da Vica)
* `data/perguntas.txt` - banco de perguntas do `/perguntar`, uma por linha
* `data/tools.json` - definição das ferramentas e servidores MCP

A pasta `data/` é ignorada pelo git. O arquivo `data/database.db` é criado automaticamente no primeiro boot, com o schema e as migrações definidos em `src/core/database.js`.

5. Registre os comandos slash no Discord

```bash
node deploy-commands.js
```

Para registrar apenas em um servidor durante o desenvolvimento:

```bash
node deploy-commands.js --guild ID_DO_SERVIDOR
```

6. Inicie o bot

```bash
node bot.js
```

---

## Estrutura do Projeto

* `bot.js` - inicializa o cliente, carrega comandos e eventos, sobe os servidores MCP e trata o shutdown
* `src/core/` - configuração (`config.js`) e acesso ao SQLite (`database.js`)
* `src/ai/` - integração com a API (`oai_interface.js`), carregamento de ferramentas (`tool_loader.js`), MCP (`mcp_client.js`), prompt e perguntas (`static_data.js`) e transcrição (`transcriber.js`)
* `src/discord/` - utilitários de Discord: interações, parser de tags, aliases, contexto de canal, cache de auditoria e anexos
* `src/moderation/` - advertências, timeouts, kicks e bans
* `src/rank/` - XP por voz
* `src/commands/` - comandos slash
* `src/events/` - listeners de eventos do Discord
* `src/tools/` - implementações das ferramentas expostas à IA
* `scripts/` - scripts avulsos de manutenção
* `data/` - conteúdo e banco SQLite (não versionado)
* `config.toml` - configurações do bot e da API (não versionado)

---

## Comandos

`/canal-noticia`, `/chat_blacklist`, `/clearwarn`, `/comment`, `/deslurkar`, `/enex`, `/macro`, `/mod_protect`, `/noticia`, `/perguntar`, `/rank`, `/rank_blacklist`, `/rank_profile`, `/rank_reset`, `/rank_rolexp`, `/rank_setxp`, `/reaction_emoji`, `/reaction_thread`, `/reaction_translate`, `/system_channel`, `/translate`, `/trigger`, `/up_role`, `/warn`, `/warn_config`

---

## Funcionalidades

* **Chatbot com IA:** Responde a menções e replies com contexto de conversa, function calling e visão nativa.
* **Sistema de Níveis (XP):** Ganho de XP por mensagem e por voz, com ranking, multiplicadores por cargo e mensagens de level up configuráveis.
* **Ferramentas:** Agenda de eventos do servidor, moderação (warn, timeout, kick, ban e consultas de ranking), leitura de embeds, OCR de documentos, leitura de anexos de texto, transcrição de áudio e geração de imagens.
* **Memórias:** Fatos sobre usuários são gravados automaticamente em mudanças de cargo. A recuperação dessas memórias ainda não está ligada ao prompt (veja Próximos Passos).
* **Configuração via Discord:** Comandos dedicados para gerenciar canais, mensagens de entrada/saída, macros, triggers e blacklists sem reiniciar o bot.
* **Blacklists:** Comandos para impedir o chatbot (`/chat_blacklist`) ou o sistema de XP (`/rank_blacklist`) de funcionar em canais específicos.

---

## MCP Integration

### O que é MCP?

O **Model Context Protocol (MCP)** é um protocolo padronizado que permite que assistentes de IA se comuniquem com serviços externos e ferramentas. O Vica suporta MCP para estender suas capacidades sem modificar o código principal.

### Servidores MCP configurados

Os servidores abaixo estão descritos em `data/tools.json` (arquivo não versionado, então esta tabela reflete a configuração local):

| Servidor | Transporte | Observação |
|----------|------------|------------|
| Time | stdio (`uvx`) | `mcp-server-time`, com `--local-timezone=America/Sao_Paulo` |
| Fetch | stdio (`uvx`) | `mcp-server-fetch` |
| Google Search | stdio (`npx`) | `@mcp-server/google-search-mcp` |
| SportDB | http | Requer `X-API-Key` em `headers` |
| MeuPC | stdio (`npx`) | Específico do PC do Vico; não faz sentido em VPS |

### Configurando Servidores MCP

Adicione servidores em `data/tools.json`. Servidores MCP são identificados por `"type": "mcp"`.

**Transporte stdio (servidores locais):**

```json
{
  "name": "memory",
  "type": "mcp",
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-memory@latest"],
  "env": {
    "MEMORY_FILE_PATH": "./data/memory.json"
  }
}
```

**Transporte http (servidores hospedados):**

```json
{
  "name": "example_server",
  "type": "mcp",
  "transport": "http",
  "url": "https://example.com/mcp-endpoint",
  "headers": {
    "X-API-Key": "SUA_CHAVE"
  }
}
```

### Variáveis de Ambiente

Servidores MCP podem receber variáveis de ambiente através do campo `env`, mescladas com o ambiente do processo:

```json
"env": {
  "MEMORY_FILE_PATH": "/caminho/absoluto/data/memory.json",
  "CUSTOM_VAR": "valor"
}
```

### Servidor de Memória

O servidor MCP de memória fornece operações de grafo de conhecimento:

**Ferramentas disponíveis:**
1. `create_entities` - Criar múltiplas entidades no grafo
2. `create_relations` - Criar relações entre entidades
3. `add_observations` - Adicionar observações a entidades existentes
4. `delete_entities` - Remover entidades e suas relações
5. `delete_observations` - Remover observações específicas
6. `delete_relations` - Remover relações do grafo
7. `read_graph` - Ler o grafo completo
8. `search_nodes` - Buscar nós baseado em queries
9. `open_nodes` - Abrir nós específicos por nome

### Solução de Problemas

**Falhas na inicialização do servidor:**

Falhas de MCP não derrubam o bot: `src/ai/tool_loader.js` captura erros por servidor e continua. O efeito colateral é que a ferramenta simplesmente não existe para a IA, então confira os logs de inicialização (`[TOOL_LOADER]`).

- Verifique se o comando (`npx`, `uvx`) está disponível no PATH do sistema
- Cuidado com caminhos absolutos específicos de uma máquina (ex: `/home/vico/.local/bin/uvx`)
- Confirme que as variáveis de ambiente estão configuradas corretamente
- Certifique-se de que as dependências necessárias estão instaladas

**Compatibilidade com Windows:**

- Use `npm.cmd exec` em vez de `npx` no Windows
- O [`src/ai/mcp_client.js`](src/ai/mcp_client.js) adiciona automaticamente `shell: true` para Windows

### Adicionando um Novo Servidor MCP

1. Adicione a configuração do servidor em `data/tools.json`
2. Escolha o tipo de transporte apropriado (stdio ou http)
3. Configure as variáveis de ambiente necessárias
4. Reinicie o bot para carregar o novo servidor
5. Confirme nos logs que as ferramentas foram listadas pelo `tool_loader`

### Boas Práticas MCP

1. **Prefira transporte stdio** para servidores locais (mais confiável e fácil de debugar)
2. **Evite caminhos absolutos** amarrados a uma máquina específica
3. **Use caminhos absolutos** apenas para configurações de servidores baseados em arquivos
4. **Teste completamente** antes de implantar em produção
5. **Monitore a saúde do servidor** através dos logs

---

## Sistema de Memórias

Fatos sobre usuários são gravados automaticamente em mudanças de cargo, via `database.adicionarMemoriaUsuario` (chamado em [`src/ai/oai_interface.js`](src/ai/oai_interface.js) e [`src/events/guildMemberUpdate.js`](src/events/guildMemberUpdate.js)), nas tabelas `user_memories` e `guild_memories`.

A tag `[memory]...[/memory]` é removida das respostas antes de enviar ao Discord, junto com `[imagem]`, `[imagem_gerada]` e `[meta]...[/meta]`. O parser fica em [`src/discord/tagParser.js`](src/discord/tagParser.js).

Exemplos de tags presentes nas mensagens:
- `[meta]user:João|globalname:João|id:123456789012345678[/meta]`
- `[imagem] Texto com imagem.`
- `[thread_op]João: mensagem que abriu o tópico[/thread_op]`

Placeholders como `{GUILD_ID}` e `{reason}` são substituídos automaticamente conforme o contexto.

As colunas `embedding` já existem no schema, mas a busca semântica de memórias ainda não é usada no prompt.

---

## Próximos Passos

* Concluir a reintegração da visão nativa, removendo a ferramenta `analyze_image` e o caminho de handoff.
* Religar a recuperação de memórias por embeddings ao prompt.
* Deduplicar helpers repetidos (`splitText`, `getOpenThreadForMessage`) e o envio de respostas em chunks.
* Adicionar uma suíte de testes automatizados (hoje não existe) e lint.