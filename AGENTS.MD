# AGENTS.MD - AI Agent Guidelines for Vica Discord Bot

This document provides comprehensive guidelines for AI agents (Roo, Cursor, etc.) working on the Vica Discord bot project.

## Table of Contents
- [Project Overview](#project-overview)
- [Project Structure](#project-structure)
- [Working with Commands](#working-with-commands)
- [Working with Events](#working-with-events)
- [Working with Core Modules](#working-with-core-modules)
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

**Project Context**: Node.js Discord bot with AI features, deployed on Raspberry Pi 3b+

**Key Technologies**:
- Discord.js (v14)
- OpenAI API (GPT-4, embeddings, function calling)
- Model Context Protocol (MCP)
- SQLite database
- Node.js

---

## Project Structure

```
vica/
├── bot.js                 # Main entry point - bot initialization and event registration
├── config.example.toml    # Configuration template (copy to config.toml for use)
├── deploy-commands.js     # Command deployment script for Discord API
├── delete-commands.js     # Command deletion script
├── commands/              # Slash commands (18 files)
│   ├── canal_noticia.js   # News channel configuration
│   ├── chat_blacklist.js  # Chat blacklist management
│   ├── comment.js         # Comment on messages
│   ├── config.js          # Bot configuration
│   ├── deslurkar.js       # Remove slur words
│   ├── enex.js            # Enable/disable features
│   ├── gmemories.js       # Global memory search
│   ├── macro.js           # Macro management (text snippets with aliases)
│   ├── mmemories.js       # Memory management
│   ├── noticia.js         # News posting
│   ├── perguntar.js       # Ask questions to AI
│   ├── rank_blacklist.js  # Rank blacklist management
│   ├── rank_reset.js      # Reset user rank
│   ├── rank_rolexp.js     # Set role XP multiplier
│   ├── rank_setxp.js      # Set user XP
│   ├── rank.js            # Display rank
│   ├── reaction_emoji.js  # Emoji reaction configuration
│   ├── reaction_thread.js # Thread reaction configuration
│   ├── system_channel.js  # System channel configuration
│   ├── trigger.js         # Trigger word configuration
│   └── up_role.js         # Role upgrade configuration
├── core/                  # Core modules (9 files)
│   ├── aliasProcessor.js  # Dynamic alias replacement for macros and messages
│   ├── auditCache.js      # LRU cache for audit log deduplication
│   ├── database.js        # All database operations with prepared statements
│   ├── mcp_client.js      # MCP client for communicating with MCP servers
│   ├── oai_interface.js   # OpenAI API integration with retry logic
│   ├── static_data.js     # Loads questions and system prompt
│   ├── tagParser.js       # SGML tag parser for memory tags
│   ├── tool_loader.js     # Dynamic tool loading from data/tools.json (supports MCP)
│   └── transcriber.js     # Audio transcription
├── events/                # Discord event handlers (7 files)
│   ├── guildBanAdd.js     # Handle user bans
│   ├── guildMemberAdd.js  # Handle new members
│   ├── guildMemberRemove.js # Handle member removals
│   ├── guildMemberUpdate.js # Handle member updates
│   ├── interactionCreate.js # Handle slash command interactions
│   ├── messageCreate.js   # Handle new messages
│   └── messageReactionAdd.js # Handle message reactions
├── helpers/               # Helper utilities (1 file)
│   └── embeddingHelper.js # Embedding-related helpers
├── tools/                 # OpenAI function tools (2 files)
│   ├── calculate.js       # Calculator tool
│   └── get_current_time.js # Current time tool
├── data/                  # Data files
│   └── tools.json         # Tool definitions for OpenAI function calling and MCP servers
├── test_mcp.js            # Test script for MCP integration
└── .roo/                  # Roo-specific rules
```

---

## Working with Commands

### Command Structure

Each command file in the `commands/` folder must export:
- `data`: A `SlashCommandBuilder` object defining the command
- `execute`: An async function that handles the command execution

### Example Command Template

```javascript
/*
** caminho: commands/example.js
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
            // Command logic here
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

1. Create a new file in the `commands/` folder
2. Follow the command structure template above
3. Add the command to `deploy-commands.js` for deployment
4. Test the command thoroughly before deployment

---

## Working with Events

### Event Structure

Each event file in the `events/` folder must export:
- `name`: The event name (string)
- `execute`: An async function that handles the event

### Example Event Template

```javascript
/*
** caminho: events/exampleEvent.js
** últimaMod: YYYY-MM-DD HH:MM
** autor: Vico
** colaboração: [AI assistants]
*/

module.exports = {
    name: 'exampleEvent',
    
    async execute(...args) {
        try {
            // Event logic here
            console.log('[EXAMPLE_EVENT][INFO] Event triggered');
        } catch (error) {
            console.error('[EXAMPLE_EVENT][ERROR]', error);
        }
    }
};
```

### Registering Events

Events are registered in [`bot.js`](bot.js:1) using the client's event emitter:

```javascript
const exampleEvent = require('./events/exampleEvent');
client.on(exampleEvent.name, (...args) => exampleEvent.execute(...args));
```

### Best Practices

1. **Error Handling**: Always wrap event logic in try/catch blocks
2. **Logging**: Log event triggers and errors with consistent format
3. **Performance**: Keep event handlers efficient to avoid blocking
4. **Validation**: Validate event data before processing

### Adding a New Event

1. Create a new file in the `events/` folder
2. Follow the event structure template above
3. Register the event in [`bot.js`](bot.js:1)
4. Test the event with various scenarios

---

## Working with Core Modules

### Database Module ([`core/database.js`](core/database.js:1))

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

### OpenAI Interface Module ([`core/oai_interface.js`](core/oai_interface.js:1))

Handles OpenAI API integration with retry logic.

**Key Functions**:
- `chatCompletion()`: GPT-4 chat completions
- `createEmbedding()`: Create text embeddings
- `transcribeAudio()`: Transcribe audio files

**Best Practices**:
- Implement retry logic for API failures
- Use appropriate timeout values
- Handle rate limiting gracefully
- Log API calls for debugging

### Tag Parser Module ([`core/tagParser.js`](core/tagParser.js:1))

SGML tag parser for memory tags.

**Usage**: Parse and extract tags from memory entries for better organization and retrieval.

### Tool Loader Module ([`core/tool_loader.js`](core/tool_loader.js:1))

Dynamic tool loading from [`data/tools.json`](data/tools.json:1).

**Usage**: Load and manage OpenAI function calling tools dynamically.

### Static Data Module ([`core/static_data.js`](core/static_data.js:1))

Loads questions and system prompt from configuration files.

**Usage**: Access static data like system prompts and predefined questions.

### Transcriber Module ([`core/transcriber.js`](core/transcriber.js:1))

Audio transcription using OpenAI Whisper API.

**Usage**: Transcribe voice messages and audio attachments.

### Audit Cache Module ([`core/auditCache.js`](core/auditCache.js:1))

LRU cache for audit log deduplication.

**Usage**: Prevent duplicate audit log entries within a time window.

### Alias Processor Module ([`core/aliasProcessor.js`](core/aliasProcessor.js:1))

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
const { processAliases } = require('./core/aliasProcessor');

const result = processAliases('Olá {mention}! Bem-vindo ao {server}.', {
  member: guildMember,
  guild: guildMember.guild
});
// Result: "Olá <@123456789>! Bem-vindo ao Meu Servidor."
```

---

## Working with MCP Servers

### Overview

The Vica bot now supports Model Context Protocol (MCP) servers, which allow extending the bot's capabilities with external tools. MCP is a protocol that enables AI assistants to communicate with external services through a standardized interface.

### MCP Client Module

The [`core/mcp_client.js`](core/mcp_client.js:1) module provides functions for communicating with MCP servers:

- `startServer(config)` - Start an MCP server with the given configuration
- `stopServer(server)` - Stop a running MCP server
- `initializeServer(server)` - Initialize MCP connection and handshake
- `listTools(server)` - List available tools from an MCP server
- `callTool(server, toolName, args)` - Call a tool on an MCP server
- `getServer(name)` - Get a running server by name
- `getAllServers()` - Get all running servers
- `stopAllServers()` - Stop all running servers

### Configuring MCP Servers

Add MCP servers to [`data/tools.json`](data/tools.json:1). MCP servers are identified by `"type": "mcp"` in their configuration.

**stdio transport (local npx):**

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

**http transport (hosted servers):**

```json
{
  "name": "example_server",
  "type": "mcp",
  "transport": "http",
  "url": "https://example.com/mcp-endpoint"
}
```

### Environment Variables

MCP servers can receive environment variables via the `env` field in the configuration. These are merged with the existing process environment variables.

Example for the memory server:

```json
"env": {
  "MEMORY_FILE_PATH": "d:/Projetos/Discord/vica/data/memory.json"
}
```

### Currently Supported MCP Servers

| Server | Transport | Status | Tools |
|---------|-----------|--------|--------|
| Memory | stdio | ✅ Working | 9 tools (knowledge graph operations) |
| Sequential Thinking | http | ⚠️ Needs investigation | - |
| Time | http | ⚠️ Needs investigation | - |

### Memory Server Tools

The memory MCP server provides the following tools for knowledge graph operations:

1. **create_entities** - Create multiple new entities in knowledge graph
2. **create_relations** - Create multiple new relations between entities
3. **add_observations** - Add new observations to existing entities
4. **delete_entities** - Delete multiple entities and their relations
5. **delete_observations** - Delete specific observations from entities
6. **delete_relations** - Delete multiple relations from knowledge graph
7. **read_graph** - Read entire knowledge graph
8. **search_nodes** - Search for nodes based on a query
9. **open_nodes** - Open specific nodes by their names

### Using MCP Tools in Code

The [`core/tool_loader.js`](core/tool_loader.js:1) module automatically loads MCP tools and makes them available for OpenAI function calling:

```javascript
const tool_loader = require('./core/tool_loader');

// Load all tools (including MCP tools)
const tools = tool_loader.loadTools();

// Use tools in OpenAI chat completion
const response = await oai.chatCompletion(messages, tools);
```

### MCP Server Lifecycle

MCP servers are managed in [`bot.js`](bot.js:1):

1. **Startup**: All configured MCP servers are started when the bot initializes
2. **Runtime**: Tools are available for AI function calling
3. **Shutdown**: All MCP servers are gracefully stopped when the bot exits

### Troubleshooting

**HTTP-based servers returning HTML:**

The mcp.so URLs may not be correct MCP HTTP endpoints. They might require:
- Different protocol (SSE, WebSocket)
- Authentication headers
- Different endpoint format

**Windows compatibility:**

- Use `npm.cmd exec` instead of `npx` on Windows
- The [`mcp_client.js`](core/mcp_client.js:1) automatically adds `shell: true` for Windows

**Server startup failures:**

- Check that the command is available in the system PATH
- Verify environment variables are correctly set
- Ensure required dependencies are installed
- Check server logs for detailed error messages

### Testing MCP Integration

Run the test script to verify MCP server connectivity:

```bash
node test_mcp.js
```

This will:
1. Start all configured MCP servers
2. List available tools from each server
3. Test a simple tool call
4. Stop all servers

### Adding a New MCP Server

1. Add the server configuration to [`data/tools.json`](data/tools.json:1)
2. Choose the appropriate transport type (stdio or http)
3. Configure any required environment variables
4. Test the server using `node test_mcp.js`
5. Restart the bot to load the new server
6. Verify tools are available in the AI function calling context

### Best Practices

1. **Use stdio transport for local servers**: More reliable and easier to debug
2. **Configure environment variables**: Use absolute paths for file-based servers
3. **Test before deployment**: Always test MCP servers in development first
4. **Monitor server health**: Check logs for MCP server errors
5. **Handle failures gracefully**: Implement fallback logic when MCP tools fail

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
- Workflow: get outline → search symbols → get definitions → read implementation only when needed

---

## Code Style Guidelines

### File Headers

Every file must include a header with the following format:

```javascript
/*
** caminho: path/to/file.js
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

### Code Formatting

- Use 4 spaces for indentation
- Use semicolons at the end of statements
- Use single quotes for strings (unless string contains single quotes)
- Add spaces around operators
- Add spaces after commas

---

## Database Operations

### Prepared Statements

Always use prepared statements from [`database.js`](core/database.js:1):

```javascript
const db = require('./core/database');

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

Follow the existing database schema when making modifications. Common tables include:
- `users`: User information and XP
- `guilds`: Guild-specific settings
- `memories`: AI memory entries
- `blacklist`: Chat blacklist entries
- `triggers`: Trigger word configurations

---

## AI Integration

### OpenAI API Calls

Use [`oai_interface.js`](core/oai_interface.js:1) for all OpenAI API calls:

```javascript
const oai = require('./core/oai_interface');

// Chat completion
const response = await oai.chatCompletion(messages, tools);

// Create embedding
const embedding = await oai.createEmbedding(text);

// Transcribe audio
const transcription = await oai.transcribeAudio(audioBuffer);
```

### Retry Logic

Implement retry logic for API failures:

```javascript
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

async function callWithRetry(fn) {
    for (let i = 0; i < MAX_RETRIES; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === MAX_RETRIES - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (i + 1)));
        }
    }
}
```

### Embeddings for Memory Retrieval

Use embeddings for semantic memory retrieval:

```javascript
// Create embedding for query
const queryEmbedding = await oai.createEmbedding(query);

// Search for similar memories
const similarMemories = await searchMemories(queryEmbedding);
```

### Tool Calling Pattern

Follow the tool calling pattern for function execution:

```javascript
// Define tool in data/tools.json
{
    "name": "tool_name",
    "description": "Tool description",
    "parameters": {
        "type": "object",
        "properties": {
            "param1": {
                "type": "string",
                "description": "Parameter description"
            }
        },
        "required": ["param1"]
    }
}

// Implement tool in tools/tool_name.js
module.exports = {
    name: 'tool_name',
    async execute(params) {
        // Tool logic
        return result;
    }
};
```

---

## Testing Guidelines

### Command Testing

Test commands with different permission levels:
- Administrator permissions
- Moderator permissions
- Regular user permissions
- No permissions

Test edge cases:
- Missing required parameters
- Invalid parameter types
- Empty inputs
- Very long inputs
- Special characters

### Event Testing

Test event handlers with various scenarios:
- Normal operation
- Error conditions
- Rate limiting
- Concurrent events
- Missing data

### Database Testing

Test database operations with edge cases:
- Empty results
- Duplicate entries
- Foreign key constraints
- Large datasets
- Concurrent operations

### AI Integration Testing

Test AI integration with various inputs:
- Normal queries
- Ambiguous queries
- Malicious inputs
- Very long inputs
- Special characters
- Multiple languages

---

## Deployment

### Environment

- **Hardware**: Raspberry Pi 3b+
- **OS**: Linux (Raspberry Pi OS)
- **Service Manager**: systemd

### Service Configuration

The bot runs as a systemd service (`vica.service`):

```ini
[Unit]
Description=Vica Discord Bot
After=network.target

[Service]
Type=simple
User=vico
WorkingDirectory=/home/vico/discord_bots/vica
ExecStart=/usr/bin/node /home/vico/discord_bots/vica/bot.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### Deployment Process

```bash
# SSH into the production server
ssh <username>@<hostname>

# Navigate to the project directory
cd <path/to/vica>

# Pull latest changes
git pull

# Restart the service
sudo systemctl restart vica.service

# Check service status
sudo systemctl status vica.service

# View logs if needed
sudo journalctl -u vica.service -f
```

### Pre-Deployment Checklist

- [ ] All tests pass
- [ ] Code follows style guidelines
- [ ] Database migrations are applied
- [ ] Configuration is updated
- [ ] Commands are deployed
- [ ] Documentation is updated

---

## Common Tasks

### Adding a New Command

1. Create a new file in `commands/` folder
2. Implement the command following the template
3. Add the command to `deploy-commands.js`
4. Deploy commands: `node deploy-commands.js`
5. Test the command thoroughly
6. Update documentation if needed

### Adding a New Event

1. Create a new file in `events/` folder
2. Implement the event following the template
3. Register the event in `bot.js`
4. Test the event with various scenarios
5. Update documentation if needed

### Adding a New Tool

1. Create a new file in `tools/` folder
2. Implement the tool following the template
3. Add tool definition to `data/tools.json`
4. Test the tool with AI integration
5. Update documentation if needed

### Adding a New MCP Server

1. Add server configuration to `data/tools.json`
2. Choose transport type (stdio or http)
3. Configure environment variables if needed
4. Test with `node test_mcp.js`
5. Restart the bot to load the server
6. Verify tools are available for AI function calling

### Modifying Database

1. Plan the schema changes
2. Add migration logic to `database.js`
3. Test migration on development environment
4. Update all affected code
5. Test thoroughly before deployment
6. Document the changes

### Updating Configuration

1. Update `config.example.toml` with new settings
2. Document new configuration options
3. Update code to use new configuration
4. Test with various configurations
5. Deploy configuration changes

### Adding a New Macro

1. Use `/macro create` command to add the macro
2. Use aliases like `{mention}`, `{username}`, `{server}`, `{channel}` in the content
3. Set `moderator_only` to true if only moderators should use it
4. Test the macro by typing `!nome` in a channel
5. Update documentation if needed

---

## Important Notes

### Language Requirements

- **User-facing messages**: Must be in Portuguese
- **Code comments**: Must be in English
- **Documentation**: Must be in English
- **Variable/function names**: Must be in English

### Permission Checks

All Discord API calls should have appropriate permission checks:
- Verify user has required permissions
- Verify bot has required permissions
- Handle permission errors gracefully

### Rate Limiting

Rate limiting is implemented (5 seconds per user):
- Respect Discord API rate limits
- Implement cooldowns for expensive operations
- Use queue systems for bulk operations

### Message Splitting

Messages are split to respect Discord's 2000 character limit:
- Use helper functions to split long messages
- Preserve message integrity when splitting
- Handle code blocks and special formatting

### Conversation Context

Conversation context includes the last 6 messages:
- Maintain context for AI responses
- Implement context window management
- Handle context overflow gracefully

### Error Messages

Provide user-friendly error messages in Portuguese:
- Explain what went wrong
- Suggest how to fix the issue
- Include relevant details for debugging

---

## References

### Project Documentation

- **GEMINI.MD**: Comprehensive project documentation with detailed technical specifications
- **README.MD**: User-facing documentation with installation and usage instructions
- **config.example.toml**: Configuration template with all available options

### External Documentation

- [Discord.js Documentation](https://discord.js.org/)
- [OpenAI API Documentation](https://platform.openai.com/docs/)
- [Node.js Documentation](https://nodejs.org/docs/)
- [SQLite Documentation](https://www.sqlite.org/docs.html)

### Development Tools

- **Roo**: AI coding assistant with project-specific rules in `.roo/`
- **Cursor**: AI-powered code editor
- **VS Code**: Primary development environment

---

## Quick Reference

### Common Imports

```javascript
const { SlashCommandBuilder } = require('discord.js');
const db = require('./core/database');
const oai = require('./core/oai_interface');
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
const response = await oai.chatCompletion(messages, tools);
```

---

## Support

For questions or issues:
1. Check GEMINI.MD for detailed documentation
2. Review existing code for patterns
3. Test changes thoroughly before deployment
4. Document any modifications made

---

**Last Updated**: 2026-03-09
**Maintained By**: Vico
**Contributors**: AI assistants (Roo, Cursor, etc.)
