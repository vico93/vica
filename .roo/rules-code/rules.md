# Rules from rules-code directory

You should **not** attempt to run the bot straight away on VSCode (using commands like `node bot.js`) because the bot is deployed to a Raspberry Pi 3b+ using systemd (`vica.service`).

If there are modified files by yourself or other personas, it's needed to commit the changes first, either by yourself (using `git` command line) or asking me to do it via Github Desktop. You can suggest a name/description (both in Portuguese) for a commit in case of asking me to do it, or do yourself using command-line.

Afterwards, to connect with the Raspberry Pi you need to use SSH. The bot is stored in a specific directory on the server. `git` is present in the system as well, and you can check its logs using `journalctl`.

## Vibe Check Reflection Policy

When the `vibe_check` tool is available, it must be used for reflection before major actions.

1. Call `vibe_check` after planning and before significant code/config changes.
2. Pass the full user request and relevant context (current plan, assumptions, and risks).
3. After fixing an identified mistake, optionally record the resolved issue with `vibe_learn`.
4. If `vibe_check` is temporarily unavailable, continue with explicit self-review and log the limitation.

---

## Project Overview (January 2026)

**Vica** is a Discord bot developed in Node.js with AI features.

### Key Technologies
- **Discord.js** (v14) - Discord API library
- **OpenAI-compatible APIs** (Requesty) - AI features (chat, embeddings, function calling)
- **SQLite** - Database with prepared statements
- **Node.js** - Runtime environment

### Project Structure
- **18 slash commands** in `commands/` folder
- **7 event handlers** in `events/` folder
- **7 core modules** in `core/` folder
- **2 tools** in `tools/` folder
- **1 helper** in `helpers/` folder

### Key Features
- AI chatbot with conversation context (last 6 messages)
- XP/ranking system with role multipliers
- Long-term memory with semantic search (embeddings)
- Interactive configuration via `/config` command
- Blacklist systems (chatbot, XP, users)
- Multimodal support (images, audio transcription)
- News system with OpenGraph metadata
- Role-based congratulations
- Welcome/leave messages

---

## Database Schema

The bot uses SQLite with 9 tables:

| Table | Purpose |
|-------|---------|
| `mensagens` | Message history for conversation context |
| `rank_xp` | User XP and level information |
| `blacklist_chatbot_canais` | Channels where chatbot is disabled |
| `blacklist_xp_canais` | Channels where XP is not awarded |
| `rank_role_multipliers` | Role-based XP multipliers |
| `guild_settings` | Server-specific configuration |
| `user_memories` | User-specific memories with embeddings |
| `guild_memories` | Server-wide memories with embeddings |
| `role_congrats` | Role congratulations messages |
| `reaction_emojis` | Reaction emojis per server |

**Important**: Production uses `content` columns (not `fact`) for memory tables.

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

---

## Database Operations

### Prepared Statements

Always use prepared statements from [`core/database.js`](core/database.js:1):

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

---

## AI Integration

### OpenAI API Calls

Use [`core/oai_interface.js`](core/oai_interface.js:1) for all OpenAI API calls:

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

The bot implements retry logic for API failures. Use the existing retry patterns in [`core/oai_interface.js`](core/oai_interface.js:1).

---

## Enhanced Memory System (January 2026)

The bot includes an enhanced memory system with:

- **Enhanced Embedding System**: Operational with Requesty API integration and caching
- **Database Schema**: Production uses migrated schema with `content` columns (not `fact`)
- **Memory Analytics**: Active collection and monitoring
- **Configuration**: Uses new Requesty + legacy OpenAI structure
- **Performance Monitoring**: Enhanced embedding system provides detailed statistics

### Memory Tags

The bot uses special tags in messages to trigger memory operations:

| Tag | Purpose | Example |
|-----|---------|---------|
| `[salvar_memoria]` | Save content as a memory | `[salvar_memoria] O usuário gosta de café` |
| `[meta]` | Add metadata to memory | `[meta] preferência: café` |
| `[imagem]` | Include image in memory | `[imagem] (with image attachment)` |

### Memory Types

1. **User Memories**: Specific to individual users (stored in `user_memories` table)
2. **Guild Memories**: Server-wide knowledge (stored in `guild_memories` table)

---

## Technical Details

### Rate Limiting

- **Per-user rate limit**: 5 seconds
- Prevents spam and API abuse
- Implemented using timestamp tracking

### Conversation Context

- **Context window**: Last 6 messages
- Includes both user and bot messages
- Maintains conversation flow
- Stored in `mensagens` table

### Message Splitting

Discord has a 2000 character limit per message. The bot splits long responses:

```javascript
const MAX_LENGTH = 2000;
const chunks = [];
for (let i = 0; i < message.length; i += MAX_LENGTH) {
    chunks.push(message.slice(i, i + MAX_LENGTH));
}
```

---

## Production Deployment Process

Standard deployment process for the enhanced system:

```bash
# SSH to production server
ssh <username>@<hostname>

# Navigate to bot directory
cd <path/to/vica>

# Pull latest changes
git pull

# Restart the bot service
sudo systemctl restart vica.service

# Check service status
sudo systemctl status vica.service

# Monitor logs if needed
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
2. Follow the command structure template (see AGENTS.MD)
3. Add the command to `deploy-commands.js` for deployment
4. Test the command thoroughly before deployment

### Adding a New Event

1. Create a new file in `events/` folder
2. Follow the event structure template (see AGENTS.MD)
3. Register the event in `bot.js`
4. Test the event with various scenarios

### Adding a New Tool

1. Create a new file in `tools/` folder
2. Implement the tool following the template
3. Add tool definition to `data/tools.json`
4. Test the tool with AI integration

### Modifying Database

1. Plan the schema changes
2. Add migration logic to `database.js`
3. Test migration on development environment
4. Update all affected code
5. Test thoroughly before deployment
6. Document the changes

---

## Important Notes

### Permission Checks

All Discord API calls should have appropriate permission checks:
- Verify user has required permissions
- Verify bot has required permissions
- Handle permission errors gracefully

### Ephemeral Responses

Use ephemeral responses for admin commands and error messages to avoid clutter:

```javascript
await interaction.reply({
    content: 'Configuration updated successfully',
    ephemeral: true
});
```

### Security

- Never commit API keys or tokens
- Use environment variables or config files
- Validate user input
- Check permissions before executing privileged operations
- Sanitize database inputs

---

## References

### Project Documentation

- **AGENTS.MD**: Comprehensive guidelines for AI agents working on this project
- **GEMINI.MD**: Detailed technical specifications and architecture
- **README.MD**: User-facing documentation with installation and usage instructions
- **config.example.json**: Configuration template with all available options

### External Documentation

- [Discord.js Documentation](https://discord.js.org/)
- [OpenAI API Documentation](https://platform.openai.com/docs/)
- [Node.js Documentation](https://nodejs.org/docs/)
- [SQLite Documentation](https://www.sqlite.org/docs.html)
