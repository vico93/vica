# Vica - Apenas mais um bot para o Discord

## Sobre

Vica é um bot para Discord que unifica funcionalidades de chatbot via API da OpenAI (modo IA) e comando de perguntas aleatórias de um banco local (modo banco). Desenvolvido em Node.js ~~para rodar em Raspberry Pi~~ (atualmente rodando em um VPS, gratidão @mojomast.

---

## Pré-requisitos

* Node.js (versão 16 ou superior recomendada)
* Acesso a um bot registrado no Discord (token e client ID)
* Chave de API compatível com Responses API (ou OpenAI Chat Completions)
* SQLite3 instalado (para banco de dados local)

---

## Instalação

1. Clone o repositório

```bash
git clone https://github.com/seuusuario/vica.git
cd vica
```

2. Instale as dependências

```bash
npm install
```

3. Crie o arquivo `config.toml` na raiz do projeto (você pode copiar `config.example.toml`) com uma estrutura como esta:

```toml
[discord]
token = "SEU_DISCORD_BOT_TOKEN"
client_id = "SEU_CLIENT_ID"

[models.default]
base_url = "https://sua.api.openai.compativel/v1"
api_key = "SUA_CHAVE_API"
model = "gpt-4o"

[models.vision]
base_url = "https://sua.api.openai.compativel/v1"
api_key = "SUA_CHAVE_API"
model = "gpt-4o"

[models.transcriptions]
base_url = "https://sua.api.openai.compativel/v1"
api_key = "SUA_CHAVE_API"
model = "whisper-1"

[ai_settings]
send_system_prompt = true
retries = 3
initial_delay_ms = 1000
historyLimit = 6
historyMaxAge = 60
budgetTokenLimit = 3000
rate_limit_ms = 5000

[ai_tools]
enabled = true
tools_file = "data/tools.json"
```

4. Adicione perguntas no arquivo `data/perguntas.txt` (uma por linha)

5. Registre os comandos slash no Discord

```bash
node deploy-commands.js
```

6. Inicie o bot

```bash
node bot.js
```

---

## Estrutura do Projeto

* `bot.js` - arquivo principal que inicializa o bot
* `commands/` - comandos slash do bot (ex: `/perguntar`)
* `core/` - lógica de comunicação com a API e manipulação de contexto
* `data/` - banco de perguntas (`perguntas.txt`) e banco SQLite (`database.db`)
* `events/` - listeners de eventos Discord
* `utils/` - funções auxiliares
* `config.toml` - configurações do bot e API (não deve ser versionado)
* `.gitignore` - arquivos e pastas ignorados pelo git

---

## Funcionalidades

* **Chatbot com IA:** Responde a menções e replies utilizando modelos compatíveis com OpenAI, com suporte a contexto de conversação.
* **Sistema de Níveis (XP):** Ganho de XP por mensagens, com ranking e mensagens de level up configuráveis.
* **Memória de Longo Prazo:** Armazena fatos sobre usuários e o servidor para personalizar interações futuras (via embeddings e busca semântica).
* **Configuração via Discord:** Comandos dedicados para gerenciar canais, mensagens de entrada/saída, memórias e outras configurações sem reiniciar o bot.
* **Blacklists:** Comandos para impedir o chatbot (`/chat_blacklist`) ou o sistema de XP (`/rank_blacklist`) de funcionar em canais específicos.
* **Multimodalidade:** Suporte a envio de imagens para análise pela IA.

---

## MCP Integration

### O que é MCP?

O **Model Context Protocol (MCP)** é um protocolo padronizado que permite que assistentes de IA se comuniquem com serviços externos e ferramentas. O Vica suporta MCP para estender suas capacidades sem modificar o código principal.

### Servidores MCP Suportados

| Servidor | Transporte | Status | Ferramentas |
|----------|------------|--------|-------------|
| Memory | stdio | ✅ Funcionando | 9 ferramentas (operações de grafo de conhecimento) |
| Sequential Thinking | http | ⚠️ Precisa de investigação | - |
| Time | http | ⚠️ Precisa de investigação | - |

### Configurando Servidores MCP

Os servidores MCP são configurados no arquivo [`data/tools.json`](data/tools.json). Adicione servidores com o seguinte formato:

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
  "url": "https://example.com/mcp-endpoint"
}
```

### Variáveis de Ambiente

Servidores MCP podem receber variáveis de ambiente através do campo `env`:

```json
"env": {
  "MEMORY_FILE_PATH": "d:/Projetos/Discord/vica/data/memory.json",
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

### Testando Integração MCP

Execute o script de teste para verificar a conectividade dos servidores MCP:

```bash
node test_mcp.js
```

Este script:
- Inicia todos os servidores MCP configurados
- Lista as ferramentas disponíveis de cada servidor
- Realiza um teste simples de chamada de ferramenta
- Para todos os servidores gracefulmente

### Solução de Problemas

**Servidores HTTP retornando HTML:**

As URLs do mcp.so podem não ser endpoints HTTP MCP corretos. Possíveis problemas:
- Protocolo diferente necessário (SSE, WebSocket)
- Headers de autenticação faltando
- Formato de endpoint incorreto

**Compatibilidade com Windows:**

- Use `npm.cmd exec` em vez de `npx` no Windows
- O [`core/mcp_client.js`](core/mcp_client.js) adiciona automaticamente `shell: true` para Windows

**Falhas na inicialização do servidor:**

- Verifique se o comando está disponível no PATH do sistema
- Confirme que as variáveis de ambiente estão configuradas corretamente
- Certifique-se de que as dependências necessárias estão instaladas
- Revise os logs do servidor para mensagens de erro detalhadas

### Adicionando um Novo Servidor MCP

1. Adicione a configuração do servidor em [`data/tools.json`](data/tools.json)
2. Escolha o tipo de transporte apropriado (stdio ou http)
3. Configure as variáveis de ambiente necessárias
4. Teste com `node test_mcp.js`
5. Reinicie o bot para carregar o novo servidor
6. Verifique que as ferramentas estão disponíveis para chamada de função da IA

### Boas Práticas MCP

1. **Prefira transporte stdio** para servidores locais (mais confiável e fácil de debugar)
2. **Use caminhos absolutos** para configurações de servidores baseados em arquivos
3. **Teste completamente** antes de implantar em produção
4. **Monitore a saúde do servidor** através dos logs
5. **Implemente lógica de fallback** quando ferramentas MCP falharem

---

## Sistema de Memórias
Vica usa tags especiais para armazenar e sinalizar contexto:
- `[salvar_memoria]...[/salvar_memoria]`: salva um fato no banco com `importance` (1–10) e `confidence` (0.0–1.0).
- `[meta]...[/meta]`: bloco de metadados inline.
- `[imagem]`: sinaliza que a mensagem possui imagem anexada.

Exemplos:
- `[salvar_memoria]{GUILD_ID}:123456789012345678:curte animes:8:0.9[/salvar_memoria]`
- `[meta]user:João|id:123[/meta]`
- `[imagem] Texto com imagem.`

As tags são parseadas por [core/tagParser.js](core/tagParser.js) e consumidas nas respostas da IA por [core/oai_interface.js](core/oai_interface.js). Placeholders como `{GUILD_ID}` são substituídos automaticamente conforme o contexto.
 
## Próximos Passos

* Refinamento da "personalidade" através de prompt engineering contínuo.
* Melhorias na performance de busca de memórias (embeddings).
