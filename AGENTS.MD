# AGENTS.MD - AI Agent Guidelines for Vica Discord Bot

This document provides guidelines for AI agents working on the Vica Discord bot project.

## Table of Contents
- [Project Overview](#project-overview)
- [Project Structure](#project-structure)
- [Working with Commands](#working-with-commands)
- [Working with Events](#working-with-events)
- [Working with Core Modules](#working-with-core-modules)
- [Working with Tools](#working-with-tools)
- [Working with MCP Servers](#working-with-mcp-servers)
- [Code Style Guidelines](#code-style-guidelines)
- [Database Operations](#database-operations)
- [AI Integration](#ai-integration)
- [Testing Guidelines](#testing-guidelines)
- [Deployment](#deployment)
- [Common Tasks](#common-tasks)
- [Important Notes](#important-notes)
- [References](#references)

---

## Project Overview

**Purpose**: Guide AI agents in understanding and working with the Vica Discord bot

**Language**: English (for code comments and documentation), Portuguese (for user-facing messages)

**Project Context**: Node.js Discord bot with AI features. Runs on a Debian VPS today; a Raspberry Pi 3B+ is the future target.

**Key Technologies**:
- Discord.js (v14)
- OpenAI-compatible Chat Completions API (any provider exposing `/v1`)
- Model Context Protocol (MCP)
- SQLite via `better-sqlite3`
- Node.js 20+ (developed on Node 24)

---

## Project Structure

```
vica/
├── bot.js                  # Entry point: client, command/event loading, MCP lifecycle
├── deploy-commands.js      # Slash command deployment (global or --guild)
├── delete-commands.js      # Slash command removal
├── config.example.toml     # Configuration template (copy to config.toml)
├── src/
│   ├── core/
│   │   ├── config.js       # Loads and validates config.toml
│   │   └── database.js     # SQLite schema, migrations and all queries
│   ├── ai/
│   │   ├── oai_interface.js  # Chat completions, vision, tool loop, retries
│   │   ├── tool_loader.js    # Loads data/tools.json and executes tool calls
│   │   ├── mcp_client.js     # MCP client (stdio and http transports)
│   │   ├── static_data.js    # Loads perguntas.txt and system_prompt.txt
│   │   └── transcriber.js    # Audio transcription
│   ├── discord/
│   │   ├── discord_interaction.js  # Safe reply/defer helpers with retries
│   │   ├── tagParser.js            # SGML tag parsing/stripping
│   │   ├── aliasProcessor.js       # Dynamic alias replacement
│   │   ├── channel_context.js      # Active channel/topic context
│   │   ├── auditCache.js           # LRU cache for audit log dedup
│   │   ├── message_attachments.js  # Attachment classification and hints
│   │   └── video_frame.js          # First-frame extraction via ffmpeg
│   ├── moderation/
│   │   └── moderation.js   # Warn, timeout, kick, ban and protections
│   ├── rank/
│   │   └── voice_xp.js     # Voice channel XP service
│   ├── commands/           # Slash commands (25 files)
│   ├── events/             # Discord event handlers (6 files)
│   └── tools/              # Tool implementations exposed to the AI (7 files)
├── scripts/                # Standalone maintenance scripts
├── data/                   # Content and SQLite database (gitignored)
│   ├── perguntas.txt       # Question bank for /perguntar
│   ├── system_prompt.txt   # System prompt (Vica persona)
│   ├── tools.json          # Tool and MCP server definitions
│   └── database.db         # Created automatically on first boot
└── tmp/                    # Scratch space for downloads/encoding (gitignored)
```

Note: `config.toml` and `data/` are gitignored. `src/core/config.js` reads `config.toml` from the repository root, and `src/ai/*` reads content from `data/`.

---

## Working with Commands

### Command Structure

Each command file in `src/commands/` must export:
- `data`: A `SlashCommandBuilder` object defining the command
- `execute`: An async function that handles the command execution

### Example Command Template

```javascript
/*
** caminho: src/commands/example.js
** últimaMod: YYYY-MM-DD HH:MM
** autor: Vico
** colaboração: [AI assistants]
*/

const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('example')
        .setDescription('Example command description')
        .addStringOption(option =>
            option.setName('input')
                .setDescription('Input parameter')
                .setRequired(true)),

    async execute(interaction) {
        // Permission check
        if (!interaction.member.permissions.has('ADMINISTRATOR')) {
            await interaction.reply({
                content: 'Você não tem permissão para usar este comando.',
                ephemeral: true
            });
            return;
        }

        try {
            const input = interaction.options.getString('input');
            await interaction.reply(`Resposta: ${input}`);
        } catch (error) {
            console.error('[EXAMPLE][ERROR]', error);
            await interaction.reply({
                content: 'Ocorreu um erro ao executar o comando.',
                ephemeral: true
            });
        }
    }
};
```

### Best Practices

1. **Permission Checks**: Always verify user permissions before executing actions
2. **Ephemeral Responses**: Use ephemeral responses for admin commands and error messages
3. **Error Handling**: Wrap command logic in try/catch blocks
4. **Logging**: Use `[MODULE][LEVEL]` format for consistent logging
5. **User Messages**: Use Portuguese for all user-facing messages
6. **Code Comments**: Use English for code comments and documentation

### Adding a New Command

1. Create a new file in `src/commands/`
2. Follow the command structure template above
3. Deploy with the command in `src/commands/` (see `deploy-commands.js`) and add it to `deploy-commands.js`
4. Test the command thoroughly before deployment

---

## Working with Events

### Event Structure

Each event file in `src/events/` must export:
- `name`: The event name (string)
- `execute`: An async function that handles the event

### Example Event Template

```javascript
/*
** caminho: src/events/exampleEvent.js
** últimaMod: YYYY-MM-DD HH:MM
** autor: Vico
** colaboração: [AI assistants]
*/

module.exports = {
    name: 'exampleEvent',

    async execute(...args) {
        try {
            console.log('[EXAMPLE_EVENT][INFO] Event triggered');
        } catch (error) {
            console.error('[EXAMPLE_EVENT][ERROR]', error);
        }
    }
};
```

### Registering Events

Events are registered dynamically in [`bot.js`](bot.js:1): every file in `src/events/` is loaded and bound to `client.on` (or `client.once` when the module exports `once: true`), with the client appended as the last argument.

### Best Practices

1. **Error Handling**: Always wrap event logic in try/catch blocks
2. **Logging**: Log event triggers and errors with consistent format
3. **Performance**: Keep event handlers efficient to avoid blocking
4. **Validation**: Validate event data before processing

### Adding a New Event

1. Create a new file in `src/events/`
2. Follow the event structure template above
3. No registration needed: `bot.js` loads every file in the folder
4. Test the event with various scenarios

---

## Working with Core Modules

### Config Module ([`src/core/config.js`](src/core/config.js:1))

Reads `config.toml` from the repository root, parses it with `toml` and normalizes every value, so missing keys fall back to defaults.

**Key Accessors**:
- `config.discord.token` / `config.discord.clientId`
- `config.ai_provider` - primary provider (`base_url`, `api_key`, `model`, `headers`)
- `config.settings` (alias `config.ai_settings`) - normalized AI settings
- `config.getModelConfig(capability)` - merged model config for `default`, `transcriptions` or `imagegen`
- `config.resolveToolModelConfig(toolDefinition, fallbackCapability)` - merges a tool `runtime` block over a capability

### Database Module ([`src/core/database.js`](src/core/database.js:1))

Handles all database operations using prepared statements.

**Key Functions**:
- `db.prepare()`: Create prepared statements
- `db.run()`: Execute INSERT/UPDATE/DELETE operations
- `db.get()`: Retrieve a single row
- `db.all()`: Retrieve multiple rows

**Best Practices**:
- Always use prepared statements to prevent SQL injection
- Validate input before database operations
- Handle errors gracefully with user-friendly messages
- Follow the existing database schema

Note: the module creates `data/` if it does not exist and builds/migrates the schema on first import. It lazily requires `src/ai/oai_interface.js` inside `getGerarEmbedding()` to avoid a circular dependency.

### OpenAI Interface Module ([`src/ai/oai_interface.js`](src/ai/oai_interface.js:1))

Handles the OpenAI-compatible API integration with retry logic.

**Key Functions**:
- `gerarRespostaContextual()`: Main contextual chat response (history, channel context, tools, vision)
- `gerarComentarioViaAPI()`: Summary/comment generation
- `gerarMensagemBemVindoViaAPI()`: Welcome/leave/kick/ban/up_role messages
- `gerarEmbedding()`: Create text embeddings
- `transcribeAudio()`: Transcribe audio files

**Best Practices**:
- Implement retry logic for API failures (use `withRetries`)
- Handle rate limiting gracefully
- Log API calls for debugging

### Tag Parser Module ([`src/discord/tagParser.js`](src/discord/tagParser.js:1))

SGML tag parser. Strips control tags from model output and from incoming messages: `[imagem]`, `[imagem_gerada]`, `[meta]...[/meta]`, `[memory]...[/memory]` and leaked instruction tags (`[trigger]`, `[pergunta]`, `[welcome]`, `[leave]`, `[kick]`, `[ban]`, `[up_role]`).

### Tool Loader Module ([`src/ai/tool_loader.js`](src/ai/tool_loader.js:1))

Dynamic tool loading from `data/tools.json`, MCP server lifecycle and tool call execution.

**Key Functions**:
- `getOpenAITools({ excludeTools })`: Tools in OpenAI function-calling format
- `executeToolCalls(toolCalls, context)`: Runs a batch of tool calls
- `startMCPServers()` / `stopAllMCPServers()`: MCP lifecycle (called from `bot.js`)

### Static Data Module ([`src/ai/static_data.js`](src/ai/static_data.js:1))

Loads `data/perguntas.txt` and `data/system_prompt.txt` at import time. Note that this happens synchronously on `require`, so the files must exist or the process throws.

### Transcriber Module ([`src/ai/transcriber.js`](src/ai/transcriber.js:1))

Audio transcription via the API's transcription endpoint.

### Channel Context Module ([`src/discord/channel_context.js`](src/discord/channel_context.js:1))

Maintains an "active topic" per channel/topic in SQLite and formats a short snapshot injected into the prompt.

### Audit Cache Module ([`src/discord/auditCache.js`](src/discord/auditCache.js:1))

LRU cache for audit log deduplication. Reuse this pattern for any other in-memory cache instead of a plain `Map`.

### Alias Processor Module ([`src/discord/aliasProcessor.js`](src/discord/aliasProcessor.js:1))

Dynamic alias replacement system for macros and messages.

**Supported Aliases**:
| Alias | Replacement | Context Required |
|-------|-------------|-----------------|
| `{mention}` | `<@userId>` | `member` |
| `{username}` | `user.username` | `member` |
| `{displayname}` | `member.displayName` | `member` |
| `{globalname}` | `user.globalName \|\| user.username` | `member` |
| `{server}` | `guild.name` | `guild` |
| `{channel}` | `<#channelId>` | `channel` |
| `{role}` | `role.name` | `role` |
| `{role_mention}` | `<@&roleId>` | `role` |
| `{reason}` | `reason string` | `reason` |

**Usage**:
```javascript
const { processAliases } = require('../discord/aliasProcessor');

const result = processAliases('Olá {mention}! Bem-vindo ao {server}.', {
  member: guildMember,
  guild: guildMember.guild
});
// Result: "Olá <@123456789>! Bem-vindo ao Meu Servidor."
```

### Moderation Module ([`src/moderation/moderation.js`](src/moderation/moderation.js:1))

Warn/timeout/kick/ban helpers, permission resolution, protected users/roles, warn configuration and the automatic action when the warn limit is reached.

### Voice XP Module ([`src/rank/voice_xp.js`](src/rank/voice_xp.js:1))

Background service that grants XP for time spent in voice channels. Started and stopped from `bot.js`.

---

## Working with Tools

Tool implementations live in `src/tools/` and are registered in `data/tools.json`. Each implementation exports a single function:

```javascript
module.exports = {
    async execute(args, context) {
        // context: { source, guildId, userId, botUserId, channel, client, inlineAttachments, toolUsageState, sourceMessageId, toolDefinition }
        return result;
    }
};
```

The registration entry points at the handler relative to the repository root:

```json
{
  "name": "discord_calendar",
  "description": "Manages Discord server scheduled events (calendar).",
  "handler": "src/tools/discord_calendar.js",
  "parameters": { "type": "object", "properties": {}, "required": [] }
}
```

Tools may override the model used for their own API calls with a `runtime` block:

```json
"runtime": { "model": "provider/model-name" }
```

Available implementations: `audio_transcription`, `discord_calendar`, `discord_embed`, `discord_guild_management`, `extract_document_text`, `image_generation`, `read_text_attachment`.

---

## Working with MCP Servers

### Overview

MCP servers extend the bot's capabilities through a standard protocol. They are configured in `data/tools.json` and identified by `"type": "mcp"`.

### MCP Client Module

The [`src/ai/mcp_client.js`](src/ai/mcp_client.js:1) module provides:

- `startServer(config)` / `stopServer(server)`
- `initializeServer(server)` / `listTools(server)`
- `callTool(server, toolName, args)`
- `getServer(name)` / `getAllServers()` / `stopAllServers()`

### Configuring MCP Servers

**stdio transport (local process):**

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

**http transport (hosted server):**

```json
{
  "name": "example_server",
  "type": "mcp",
  "transport": "http",
  "url": "https://example.com/mcp-endpoint",
  "headers": { "X-API-Key": "SUA_CHAVE" }
}
```

### MCP Server Lifecycle

MCP servers are managed in [`bot.js`](bot.js:1):

1. **Startup**: `toolLoader.startMCPServers()` runs on the `ClientReady` event
2. **Runtime**: tools are available for AI function calling
3. **Shutdown**: `toolLoader.stopAllMCPServers()` runs on SIGINT/SIGTERM

### Troubleshooting

Failing MCP servers do **not** crash the bot: `startMCPServers()` catches errors per server and continues. The side effect is silent degradation, where a tool simply does not exist for the model. Always check `[TOOL_LOADER]` logs after startup.

- Verify the command (`npx`, `uvx`) is on the system PATH
- Avoid absolute paths tied to a specific machine (for example `/home/vico/.local/bin/uvx`)
- Confirm environment variables are set correctly
- On Windows, prefer `npm.cmd exec` over `npx`; the client adds `shell: true` automatically

### Best Practices

1. **Use stdio transport for local servers**: more reliable and easier to debug
2. **Keep machine-specific credentials in `env`/`headers`**: `data/tools.json` is gitignored
3. **Test before deployment**: verify the tool list in the logs
4. **Handle failures gracefully**: never assume a tool exists

### Vibe Check Reflection Policy

When the `vibe_check` tool is available, it must be used for reflection before major actions.

ALWAYS include the full user prompt in every `vibe_check` call to preserve context awareness.

As an autonomous agent:
1. Treat `vibe_check` as a high-priority collaborative pattern interrupt for course correction, not as optional output
2. Use `vibe_check` at strategic points: after planning and before implementation, when complexity increases, and before significant system changes
3. Always provide the current phase in the call (`planning`, `implementation`, or `review`) for context-appropriate feedback
4. Adapt the approach based on `vibe_check` feedback unless it is clearly irrelevant; if ignored, document why
5. Chain `vibe_check` with `vibe_learn` after resolving mistakes to record recurring patterns and successful corrections
6. If `vibe_check` is temporarily unavailable, continue with explicit self-review and log the limitation

### VS Code Symbol Tools for Context Efficiency

Use VS Code symbol tools to reduce context consumption:
- `get_document_symbols_code` for file structure overview instead of reading entire files
- `search_symbols_code` to find symbols by name across the project
- `get_symbol_definition_code` for type info and docs without full file context
- Workflow: get outline -> search symbols -> get definitions -> read implementation only when needed

---

## Code Style Guidelines

### File Headers

Every file must include a header with the following format:

```javascript
/*
** caminho: src/path/to/file.js
** últimaMod: YYYY-MM-DD HH:MM
** autor: Vico
** colaboração: [AI assistants]
*/
```

### Logging Format

Use the `[MODULE][LEVEL]` format for consistent logging:

```javascript
console.log('[MODULE][INFO] Information message');
console.warn('[MODULE][WARN] Warning message');
console.error('[MODULE][ERROR] Error message');
```

### Async/Await Patterns

Always use async/await for asynchronous operations:

```javascript
async function example() {
    try {
        const result = await someAsyncOperation();
        return result;
    } catch (error) {
        console.error('[EXAMPLE][ERROR]', error);
        throw error;
    }
}
```

### Error Handling

Wrap all potentially error-prone code in try/catch blocks:

```javascript
try {
    // Code that might throw an error
} catch (error) {
    console.error('[MODULE][ERROR]', error);
    // Handle error appropriately
}
```

### Language Guidelines

- **User-facing messages**: Portuguese
- **Code comments**: English
- **Documentation**: English
- **Variable names**: English (camelCase)
- **Function names**: English (camelCase)

Note: a few older modules still use Portuguese function names (`gerarRespostaContextual`, `adicionarMemoriaUsuario`). Keep existing names when editing those modules; use English for new code.

### Code Formatting

- Use 4 spaces for indentation
- Use semicolons at the end of statements
- Use single quotes for strings (unless string contains single quotes)
- Add spaces around operators
- Add spaces after commas

---

## Database Operations

### Prepared Statements

Always use prepared statements from [`src/core/database.js`](src/core/database.js:1):

```javascript
const db = require('./src/core/database');

// Insert
const stmt = db.prepare('INSERT INTO table (column1, column2) VALUES (?, ?)');
stmt.run(value1, value2);

// Update
const stmt = db.prepare('UPDATE table SET column1 = ? WHERE id = ?');
stmt.run(newValue, id);

// Select single row
const stmt = db.prepare('SELECT * FROM table WHERE id = ?');
const row = stmt.get(id);

// Select multiple rows
const stmt = db.prepare('SELECT * FROM table WHERE status = ?');
const rows = stmt.all(status);
```

### Input Validation

Always validate input before database operations:

```javascript
if (!input || typeof input !== 'string' || input.length > 1000) {
    throw new Error('Invalid input');
}
```

### Error Handling

Handle database errors gracefully:

```javascript
try {
    const stmt = db.prepare('INSERT INTO table (column) VALUES (?)');
    stmt.run(value);
} catch (error) {
    console.error('[MODULE][ERROR] Database error:', error);
    await interaction.reply({
        content: 'Erro ao salvar no banco de dados.',
        ephemeral: true
    });
}
```

### Database Schema

Follow the existing schema when making modifications. Tables include:
- `rank_xp`, `rank_role_multipliers` - XP and rank
- `guild_settings` - per-guild configuration
- `mensagens`, `channel_contexts` - conversation history and channel context
- `user_memories`, `guild_memories` - long-term memories (embedding columns exist, retrieval not wired yet)
- `blacklist_chatbot_canais`, `blacklist_xp_canais` - blacklists
- `warn_counts`, `warn_config`, `moderation_protected_users`, `moderation_protected_roles` - moderation
- `guild_macros`, `reaction_emojis`, `role_congrats`

---

## AI Integration

### API Calls

Use [`src/ai/oai_interface.js`](src/ai/oai_interface.js:1) for all API calls:

```javascript
const oai = require('./src/ai/oai_interface');

const response = await oai.gerarRespostaContextual(
  guildId, channelId, userId, botUserId, userMessage,
  imageUrl, channel, sourceMessageId, originalAuthorId, imageDataUrl
);
```

### Retry Logic

`withRetries(fn, label)` retries only on 429, 5xx and transient network errors, with linear backoff controlled by `retries` and `initial_delay_ms`.

### Tool Calling Pattern

1. Define the tool in `data/tools.json` (see [Working with Tools](#working-with-tools))
2. Implement `execute(args, context)` in `src/tools/`
3. The tool loop in `oai_interface.js` sends tool results back to the model until it stops requesting tools, up to `maxToolTurns`

### Vision

Images (and the first frame of videos) are sent inline to the main model as `image_url` content parts, so the configured `model` must support vision.

---

## Testing Guidelines

There is currently no automated test suite (`npm test` is a placeholder). When adding behaviour, verify manually:

### Command Testing

Test commands with different permission levels (administrator, moderator, regular user, none) and edge cases (missing parameters, invalid types, empty/very long inputs, special characters).

### Event Testing

Test event handlers with normal operation, error conditions, rate limiting, concurrent events and missing data.

### Database Testing

Test database operations with edge cases: empty results, duplicate entries, foreign key constraints, large datasets, concurrent operations.

### AI Integration Testing

Test with normal queries, ambiguous queries, malicious inputs, very long inputs, special characters and multiple languages.

---

## Deployment

### Environment

- **Host**: Debian 12 VPS with Node.js 24
- **Future target**: Raspberry Pi 3B+ (prefer the 64-bit Raspberry Pi OS there)
- **Service Manager**: systemd

### Service Configuration

```ini
[Unit]
Description=Vica Discord Bot
After=network.target

[Service]
Type=simple
User=vico
WorkingDirectory=/home/vico/vica
ExecStart=/usr/bin/node /home/vico/vica/bot.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### Deployment Process

```bash
# Pull latest changes
cd /home/vico/vica
git pull

# Install dependencies exactly as locked
npm ci

# Restart and verify
sudo systemctl restart vica.service
sudo systemctl status vica.service
sudo journalctl -u vica.service -f
```

### Pre-Deployment Checklist

- [ ] `node --check` passes on changed files
- [ ] Code follows style guidelines
- [ ] Database migrations are applied (automatic on boot)
- [ ] `config.toml` and `data/` are present on the host
- [ ] Commands are deployed (`node deploy-commands.js`)
- [ ] Documentation is updated

---

## Common Tasks

### Adding a New Command

1. Create a new file in `src/commands/`
2. Implement the command following the template
3. Deploy commands: `node deploy-commands.js`
4. Test the command thoroughly

### Adding a New Event

1. Create a new file in `src/events/`
2. Implement the event following the template
3. No registration step: `bot.js` loads the folder dynamically
4. Test the event with various scenarios

### Adding a New Tool

1. Create a new file in `src/tools/`
2. Export `execute(args, context)`
3. Add the tool definition to `data/tools.json` with `handler: "src/tools/your_tool.js"`
4. Test the tool with AI integration

### Adding a New MCP Server

1. Add the server configuration to `data/tools.json`
2. Choose transport type (stdio or http)
3. Configure environment variables if needed
4. Restart the bot and confirm the tools were listed in the logs

### Modifying the Database

1. Plan the schema changes
2. Add migration logic to `src/core/database.js` (idempotent, guarded by `PRAGMA table_info`)
3. Test migration on a throwaway `data/database.db`
4. Update all affected code
5. Document the changes

### Updating Configuration

1. Update `config.example.toml` with new settings
2. Document new configuration options
3. Add normalization with a default in `src/core/config.js`
4. Update code to use the new setting

### Adding a New Macro

1. Use `/macro create` to add the macro
2. Use aliases like `{mention}`, `{username}`, `{server}`, `{channel}` in the content
3. Set `moderator_only` to true if only moderators should use it
4. Test the macro by typing `!nome` in a channel

---

## Important Notes

### Language Requirements

- **User-facing messages**: Portuguese
- **Code comments**: English
- **Documentation**: English
- **Variable/function names**: English (camelCase)

### Permission Checks

All Discord API calls should have appropriate permission checks:
- Verify user has required permissions
- Verify bot has required permissions
- Handle permission errors gracefully

### Rate Limiting

Rate limiting is implemented per user (`rate_limit_ms`, default 5000 ms) inside `oai_interface.js`, plus a separate XP cooldown in `events/messageCreate.js`.

### Message Splitting

Messages are split to respect Discord's 2000 character limit. Note that `splitText` is currently duplicated across `src/events/messageCreate.js`, `src/events/messageReactionAdd.js`, `src/commands/comment.js` and `src/commands/trigger.js`; prefer extracting a shared helper when touching this logic.

### Conversation Context

Conversation context includes the last recent messages (`historyLimit`) within `historyMaxAge`, filtered by author/reply/mention relevance.

### Error Messages

Provide user-friendly error messages in Portuguese:
- Explain what went wrong
- Suggest how to fix the issue
- Include relevant details for debugging

---

## References

### Project Documentation

- **README.MD**: User-facing documentation with installation and usage instructions
- **config.example.toml**: Configuration template with all available options

### External Documentation

- [Discord.js Documentation](https://discord.js.org/)
- [OpenAI API Documentation](https://platform.openai.com/docs/)
- [Node.js Documentation](https://nodejs.org/docs/)
- [better-sqlite3 Documentation](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md)

### Development Tools

- **Codex / Cursor / Roo**: AI coding assistants
- **VS Code**: Primary development environment

---

## Quick Reference

### Common Imports

```javascript
const { SlashCommandBuilder } = require('discord.js');
const db = require('../core/database');
const oai = require('../ai/oai_interface');
```

Imports from `src/commands/` and `src/events/` reach the other domains with `../`:

```javascript
const database = require('../core/database');
const oai = require('../ai/oai_interface');
const tagParser = require('../discord/tagParser');
const moderation = require('../moderation/moderation');
const config = require('../core/config');
```

### Common Patterns

**Permission Check**:
```javascript
if (!interaction.member.permissions.has('ADMINISTRATOR')) {
    await interaction.reply({
        content: 'Você não tem permissão para usar este comando.',
        ephemeral: true
    });
    return;
}
```

**Error Handling**:
```javascript
try {
    // Code
} catch (error) {
    console.error('[MODULE][ERROR]', error);
    await interaction.reply({
        content: 'Ocorreu um erro ao executar a operação.',
        ephemeral: true
    });
}
```

**Database Query**:
```javascript
const stmt = db.prepare('SELECT * FROM table WHERE id = ?');
const result = stmt.get(id);
```

**AI Chat**:
```javascript
const resposta = await oai.gerarRespostaContextual(
  guildId, channelId, userId, botUserId, prompt,
  imageUrl, channel, sourceMessageId, originalAuthorId, imageDataUrl
);
```

---

## Support

For questions or issues:
1. Check the README for setup and usage
2. Review existing code for patterns
3. Test changes thoroughly before deployment
4. Document any modifications made

---

**Last Updated**: 2026-09-12
**Maintained By**: Vico
**Contributors**: AI assistants (ChatGPT, Gemini, Claude, Roo, Cursor, Codex)