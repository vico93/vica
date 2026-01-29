# Rules from rules-debug directory

You should **not** attempt to run the bot straight away on VSCode (using commands like `node bot.js`) because the bot is deployed to a Raspberry Pi 3b+ using systemd (`vica.service`).

If there are modified files by yourself or other personas, it's needed to commit the changes first, either by yourself (using `git` command line) or asking me to do it via Github Desktop. You can suggest a name/description (both in Portuguese) for a commit in case of asking me to do it, or return to code mode to do it yourself using command-line.

Afterwards, to connect with the Raspberry Pi you need to use SSH. The bot is stored in a specific directory on the server. `git` is present in the system as well, and you can check its logs using `journalctl`.

---

## Debugging Guidelines

### General Debugging Approach

1. **Identify the Issue**: Understand what's not working and gather symptoms
2. **Check Logs**: Use `journalctl -u vica.service -f` to view real-time logs
3. **Add Logging**: Add `[MODULE][LEVEL]` formatted logs to trace execution
4. **Test Locally**: Test changes in a controlled environment before deployment
5. **Verify Fix**: Ensure the fix resolves the issue without side effects

### Log Analysis

When analyzing logs, look for:
- `[MODULE][ERROR]` entries for errors
- `[MODULE][WARN]` entries for warnings
- Timestamps to correlate events
- Stack traces for error context

---

## Enhanced System Debugging (January 2026)

When debugging the enhanced memory system:

- **Enhanced Embedding System**: Check cache hit rates and API usage with `embeddingHelper.obterEstatisticasEmbedding()`
- **Memory Analytics**: Monitor performance with `database.getMemoryAnalyticsStats(guildId)`
- **Configuration Issues**: Verify `config.legacy.openai.*` vs `config.requesty.*` references
- **Database Schema**: Production uses `content` columns, development may use `fact` columns
- **API Integration**: Check Requesty API keys and rate limits vs legacy MNN API fallback

### Performance Monitoring

```javascript
// Check embedding system performance
const embeddingHelper = require('./helpers/embeddingHelper');
const stats = embeddingHelper.obterEstatisticasEmbedding();
console.log('Embedding Performance:', stats);

// Check memory analytics
const database = require('./core/database');
const analytics = database.getMemoryAnalyticsStats(guildId);
console.log('Memory Analytics:', analytics);
```

---

## Common Debugging Scenarios

### Database Issues

**Symptoms**: Queries failing, data not persisting, locks

**Debug Steps**:
1. Check database connection in [`core/database.js`](core/database.js:1)
2. Verify prepared statements are correctly formatted
3. Check for SQL syntax errors in logs
4. Verify table schema matches expected structure
5. Check for concurrent access issues

**Common Fixes**:
- Ensure all prepared statements use `?` placeholders
- Wrap database operations in try/catch blocks
- Use transactions for multiple related operations
- Check for foreign key constraint violations

### API Integration Issues

**Symptoms**: AI responses failing, timeouts, rate limit errors

**Debug Steps**:
1. Check API key configuration in `config.json`
2. Verify API endpoint URLs are correct
3. Check network connectivity to API servers
4. Review retry logic in [`core/oai_interface.js`](core/oai_interface.js:1)
5. Monitor rate limit usage

**Common Fixes**:
- Verify Requesty API key is valid and not expired
- Check for correct model names in configuration
- Adjust timeout values if needed
- Implement exponential backoff for retries

### Discord API Issues

**Symptoms**: Commands not responding, permissions errors, rate limits

**Debug Steps**:
1. Check bot token in `config.json`
2. Verify bot has required permissions in Discord server
3. Check Discord API status for outages
4. Review rate limit handling in code
5. Verify command registration with `deploy-commands.js`

**Common Fixes**:
- Ensure bot has all required permissions
- Check command names match registered commands
- Verify interaction responses are sent within 3 seconds
- Use ephemeral responses for admin commands

### Memory System Issues

**Symptoms**: Memories not saving, retrieval failing, embeddings not working

**Debug Steps**:
1. Check embedding API configuration
2. Verify database schema for memory tables
3. Check tag parsing in [`core/tagParser.js`](core/tagParser.js:1)
4. Review similarity calculation logic
5. Monitor cache performance

**Common Fixes**:
- Ensure `content` column is used (not `fact`) in production
- Check embedding vector dimensions match expected size
- Verify cosine similarity calculation is correct
- Clear cache if stale data is suspected

### Event Handler Issues

**Symptoms**: Events not firing, handlers crashing, memory leaks

**Debug Steps**:
1. Verify events are registered in [`bot.js`](bot.js:1)
2. Check event handler exports (name, execute)
3. Review error handling in event handlers
4. Monitor for unhandled promise rejections
5. Check for memory leaks with long-running processes

**Common Fixes**:
- Ensure event handlers export both `name` and `execute`
- Wrap event logic in try/catch blocks
- Clean up collectors and listeners after use
- Use proper async/await patterns

---

## Debugging Tools

### Adding Debug Logging

```javascript
// Add detailed logging for debugging
console.log('[MODULE][DEBUG] Variable value:', variable);
console.log('[MODULE][DEBUG] Function called with:', JSON.stringify(params));
console.log('[MODULE][DEBUG] Execution time:', Date.now() - startTime, 'ms');
```

### Testing Database Queries

```javascript
// Test database queries directly
const db = require('./core/database');
const stmt = db.prepare('SELECT * FROM table WHERE id = ?');
const result = stmt.get(testId);
console.log('[DEBUG][DB] Query result:', result);
```

### Testing API Calls

```javascript
// Test API calls with detailed logging
const oai = require('./core/oai_interface');
console.log('[DEBUG][OAI] Calling API with:', messages);
const response = await oai.chatCompletion(messages, tools);
console.log('[DEBUG][OAI] API response:', response);
```

### Monitoring Performance

```javascript
// Monitor function execution time
const startTime = Date.now();
// ... function code ...
const duration = Date.now() - startTime;
console.log('[MODULE][PERF] Function executed in:', duration, 'ms');
```

---

## Production Debugging

### Remote Debugging via SSH

```bash
# Connect to production server
ssh <username>@<hostname>

# Navigate to bot directory
cd <path/to/vica>

# View real-time logs
sudo journalctl -u vica.service -f

# View recent logs
sudo journalctl -u vica.service -n 100

# View logs since specific time
sudo journalctl -u vica.service --since "1 hour ago"

# Search for errors
sudo journalctl -u vica.service | grep ERROR
```

### Checking Service Status

```bash
# Check if service is running
sudo systemctl status vica.service

# Restart service
sudo systemctl restart vica.service

# Stop service
sudo systemctl stop vica.service

# Start service
sudo systemctl start vica.service
```

### Analyzing Core Dumps

If the bot crashes:

```bash
# Check for core dumps
ls -la /var/lib/systemd/coredump/

# Analyze with gdb if available
gdb /usr/bin/node /var/lib/systemd/coredump/core.*
```

---

## Error Handling Best Practices

### Try/Catch Patterns

```javascript
async function safeExecute() {
    try {
        const result = await riskyOperation();
        return result;
    } catch (error) {
        console.error('[MODULE][ERROR] Operation failed:', error);
        // Log additional context
        console.error('[MODULE][ERROR] Context:', { param1, param2 });
        // Return fallback value or rethrow
        return null;
    }
}
```

### Graceful Degradation

```javascript
async function getMemoryWithFallback(query) {
    try {
        // Try enhanced memory system
        return await enhancedMemorySearch(query);
    } catch (error) {
        console.warn('[MODULE][WARN] Enhanced memory failed, using fallback:', error);
        // Fallback to simple search
        return await simpleMemorySearch(query);
    }
}
```

### Error Recovery

```javascript
async function resilientOperation() {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 1000;

    for (let i = 0; i < MAX_RETRIES; i++) {
        try {
            return await operation();
        } catch (error) {
            console.error(`[MODULE][ERROR] Attempt ${i + 1} failed:`, error);
            if (i === MAX_RETRIES - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (i + 1)));
        }
    }
}
```

---

## Performance Debugging

### Identifying Bottlenecks

1. **Database Queries**: Slow queries, missing indexes
2. **API Calls**: High latency, rate limits
3. **Event Handlers**: Blocking operations, memory leaks
4. **Memory Usage**: Growing memory, cache issues

### Profiling Techniques

```javascript
// Profile function execution
const startMemory = process.memoryUsage().heapUsed;
const startTime = Date.now();

// ... code to profile ...

const endMemory = process.memoryUsage().heapUsed;
const duration = Date.now() - startTime;
console.log('[PROFILE] Duration:', duration, 'ms');
console.log('[PROFILE] Memory delta:', (endMemory - startMemory) / 1024 / 1024, 'MB');
```

### Memory Leak Detection

```javascript
// Monitor memory usage over time
setInterval(() => {
    const usage = process.memoryUsage();
    console.log('[MEMORY] Heap used:', (usage.heapUsed / 1024 / 1024).toFixed(2), 'MB');
    console.log('[MEMORY] Heap total:', (usage.heapTotal / 1024 / 1024).toFixed(2), 'MB');
}, 60000); // Every minute
```

---

## Testing Debugged Code

### Unit Testing

```javascript
// Test individual functions
function testFunction() {
    const input = 'test';
    const expected = 'expected';
    const result = functionToTest(input);
    
    if (result === expected) {
        console.log('[TEST] PASSED');
    } else {
        console.log('[TEST] FAILED - Expected:', expected, 'Got:', result);
    }
}
```

### Integration Testing

```javascript
// Test component interactions
async function testIntegration() {
    try {
        const result = await componentA.process();
        const final = await componentB.handle(result);
        console.log('[INTEGRATION TEST] PASSED');
    } catch (error) {
        console.error('[INTEGRATION TEST] FAILED:', error);
    }
}
```

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
- [systemd Documentation](https://www.freedesktop.org/software/systemd/man/)
