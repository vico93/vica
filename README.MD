# Vica - Bot Único para Discord

## Sobre

Vica é um bot para Discord que unifica funcionalidades de chatbot via API da OpenAI (modo IA) e comando de perguntas aleatórias de um banco local (modo banco). Desenvolvido em Node.js para rodar em Raspberry Pi.

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

3. Crie o arquivo `config.json` na raiz do projeto com a estrutura:

```json
{
  "discord": {
    "token": "SEU_DISCORD_BOT_TOKEN",
    "clientId": "SEU_CLIENT_ID"
  },
  "openai": {
    "base_url": "https://sua.api.openai.compativel/responses",
    "api_key": "SUA_CHAVE_API",
    "model": "modelo-exemplo"
  },
  "settings": {
    "historyLimit": 6,
    "maxTokens": 500
  }
}
```

4. Adicione perguntas no arquivo `data/perguntas.txt` (uma por linha)

5. Inicie o bot

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
* `config.json` - configurações do bot e API (não deve ser versionado)
* `.gitignore` - arquivos e pastas ignorados pelo git

---

## Próximos Passos

* Implementar armazenamento e gerenciamento do histórico de mensagens com SQLite
* Criar blacklist de canais para modo chatbot
* Desenvolver comandos para configurar o bot diretamente pelo Discord