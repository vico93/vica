# Notas de Protocolo Osmium (Descoberta & Mapeamento)

> Mapeamento técnico baseado nos arquivos `.proto` oficiais (`proto/`) e na documentação do protocolo (`mintlify.wiki/osmiumchat/proto/`).

## 1. Endpoint WebSocket e Framing
- **Endpoint**: `wss://osmium.chat/api/v1/gateway` (ou customizável em `config.toml` sob a chave `[osmium].endpoint`).
- **Framing**: Protocol Buffers binário sobre WebSocket binário (`binaryType = 'arraybuffer'`).
- **Mensagem enviada (Client → Server)**: `osmium.client.core.ClientMessage` (`proto/core.proto:22-129`).
  - Campo `id`: `uint32` (request_id numérico incremental gerado pelo cliente).
  - Campo `message`: `oneof` com a RPC invocada (ex.: `core_initialize`, `auth_authorize`, `messages_send_message`, etc.).
- **Mensagem recebida (Server → Client)**: `osmium.client.core.ServerMessage` (`proto/core.proto:131-137`).
  - Campo `id`: `uint32` (id sequencial gerado pelo servidor).
  - Campo `message`: `oneof` contendo:
    - `update`: `osmium.client.updates.Update` (`proto/updates.proto:11-40`) — push em tempo real.
    - `result`: `osmium.client.core.RPCResult` (`proto/core.proto:139-190`) — resposta de RPC com correlação pelo `req_id`.

## 2. Sequência de Inicialização e Autenticação
1. **Conexão WebSocket**: abre conexão WS com endpoint.
2. **Handshake `Initialize` (`proto/core.proto:198-204`)**:
   - Enviado em `ClientMessage.message.core_initialize`:
     - `client_id`: uint32 (ex.: 0 ou client_id da aplicação)
     - `device_type`: "desktop" ou "server"
     - `device_version`: versão do SO/Node
     - `app_version`: versão do bot (ex.: "0.1.0")
     - `no_subscribe`: `false` (precisamos receber real-time updates)
   - Resposta esperada via `RPCResult.result.initialized` (`proto/core.proto:206-209`).
3. **Autenticação `Authorize` (`proto/auth.proto:30`)**:
   - Enviado em `ClientMessage.message.auth_authorize`:
     - `token`: string (token do bot obtido via MakeABot).
   - Resposta esperada via `RPCResult.result.authorization` (`proto/auth.proto:32-37`):
     - `token`: string
     - `user`: `osmium.client.types.User` (contém `id`, `name`, `username`, `bot`)
     - `session_id`: fixed64
4. **Estado Pronto (Ready)**: armazena `user` (bot identity) e passa a escutar e rotear `Update`s.

## 3. Estrutura de Envio de Mensagens e Respostas
- **Envio**: `ClientMessage.message.messages_send_message` (`proto/messages.proto:11-49`).
  - `chat_ref`: `ChatRef` (`proto/refs.proto:6-13`), suportando `channel: { community_id, channel_id }`, `user: { user_id }` ou `group: { group_id }`.
  - `message`: string com o conteúdo do texto.
  - `reply_to`: opcional `{ message_id, quote }`.
- **Eventos em Tempo Real (`Update`)**:
  - `message_created`: `UpdateMessageCreated` (`proto/updates.proto:42-49`) contendo `message` (`types.Message`) e `author` (`types.User`).
  - `message_reactions`: `UpdateMessageReactions` (`proto/updates.proto:180-184`).
