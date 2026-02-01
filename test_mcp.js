/*
** caminho: test_mcp.js
** últimaMod: 2026-02-01
** autor: Vico
** colaboração: Roo
*/

/*
  Test script for MCP (Model Context Protocol) integration.
  This script tests MCP server initialization, tool discovery, and tool execution.
*/

const toolLoader = require('./core/tool_loader');

// ANSI color codes for console output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
    console.log('\n' + '='.repeat(60));
    log(title, 'cyan');
    console.log('='.repeat(60));
}

function logSuccess(message) {
    log(`✓ ${message}`, 'green');
}

function logError(message) {
    log(`✗ ${message}`, 'red');
}

function logWarning(message) {
    log(`⚠ ${message}`, 'yellow');
}

function logInfo(message) {
    log(`ℹ ${message}`, 'blue');
}

/**
 * Main test function
 */
async function runTests() {
    logSection('MCP Integration Test');
    logInfo('Starting MCP integration tests...\n');

    let testResults = {
        mcpServersStarted: [],
        mcpServersFailed: [],
        toolsDiscovered: [],
        toolsExecuted: [],
        errors: []
    };

    try {
        // Test 1: Start MCP servers
        logSection('Test 1: Starting MCP Servers');
        logInfo('Starting MCP servers from configuration...\n');

        await toolLoader.startMCPServers();

        // Get running MCP servers
        const mcpServers = toolLoader.getMCPServers();

        if (mcpServers.size === 0) {
            logWarning('No MCP servers are running');
        } else {
            logSuccess(`${mcpServers.size} MCP server(s) started successfully\n`);

            for (const [name, server] of mcpServers) {
                if (server.initialized) {
                    logSuccess(`  - ${name} (${server.transport}): initialized`);
                    testResults.mcpServersStarted.push(name);
                } else {
                    logWarning(`  - ${name} (${server.transport}): not initialized`);
                    testResults.mcpServersFailed.push(name);
                }
            }
        }

        // Test 2: Discover tools from MCP servers
        logSection('Test 2: Discovering Tools from MCP Servers');
        logInfo('Listing available tools from MCP servers...\n');

        const mcpTools = await toolLoader.getMCPTools();

        if (mcpTools.length === 0) {
            logWarning('No tools discovered from MCP servers');
        } else {
            logSuccess(`${mcpTools.length} tool(s) discovered from MCP servers\n`);

            for (const tool of mcpTools) {
                const toolName = tool.function?.name || 'unknown';
                const serverName = tool._mcpServer || 'unknown';
                const description = tool.function?.description || 'No description';

                logInfo(`  - ${toolName} (from ${serverName})`);
                logInfo(`    Description: ${description.substring(0, 80)}${description.length > 80 ? '...' : ''}`);
                testResults.toolsDiscovered.push({ name: toolName, server: serverName });
            }
        }

        // Test 3: Get all OpenAI tools (including MCP tools)
        logSection('Test 3: Getting All OpenAI Tools');
        logInfo('Retrieving all tools in OpenAI format...\n');

        const allTools = await toolLoader.getOpenAITools();

        logSuccess(`${allTools.length} total tool(s) available\n`);

        for (const tool of allTools) {
            if (tool.type === 'function') {
                const toolName = tool.function?.name || 'unknown';
                const serverName = tool._mcpServer || 'custom';
                logInfo(`  - ${toolName} (${serverName})`);
            } else if (tool.type) {
                logInfo(`  - ${tool.type} (native)`);
            }
        }

        // Test 4: Execute a simple tool (if available)
        logSection('Test 4: Executing a Tool');
        
        // Try to find a simple tool to execute
        const timeTool = mcpTools.find(t => t.function?.name === 'get_current_time');
        const sequentialTool = mcpTools.find(t => t.function?.name === 'sequential_thinking');

        if (timeTool) {
            logInfo('Executing get_current_time tool...\n');
            try {
                const result = await toolLoader.executeTool('get_current_time', {});
                
                if (result.success !== false) {
                    logSuccess('Tool executed successfully');
                    logInfo(`  Result: ${JSON.stringify(result, null, 2).substring(0, 200)}...`);
                    testResults.toolsExecuted.push('get_current_time');
                } else {
                    logError(`Tool execution failed: ${result.error}`);
                    testResults.errors.push({ tool: 'get_current_time', error: result.error });
                }
            } catch (error) {
                logError(`Tool execution error: ${error.message}`);
                testResults.errors.push({ tool: 'get_current_time', error: error.message });
            }
        } else if (sequentialTool) {
            logInfo('Executing sequential_thinking tool...\n');
            try {
                const result = await toolLoader.executeTool('sequential_thinking', {
                    query: 'What is 2 + 2?'
                });
                
                if (result.success !== false) {
                    logSuccess('Tool executed successfully');
                    logInfo(`  Result: ${JSON.stringify(result, null, 2).substring(0, 200)}...`);
                    testResults.toolsExecuted.push('sequential_thinking');
                } else {
                    logError(`Tool execution failed: ${result.error}`);
                    testResults.errors.push({ tool: 'sequential_thinking', error: result.error });
                }
            } catch (error) {
                logError(`Tool execution error: ${error.message}`);
                testResults.errors.push({ tool: 'sequential_thinking', error: error.message });
            }
        } else {
            logWarning('No suitable tool found for execution test');
        }

    } catch (error) {
        logError(`Test failed with error: ${error.message}`);
        testResults.errors.push({ general: error.message });
    }

    // Test 5: Stop MCP servers
    logSection('Test 5: Stopping MCP Servers');
    logInfo('Stopping all MCP servers...\n');

    try {
        await toolLoader.stopAllMCPServers();
        logSuccess('All MCP servers stopped successfully');
    } catch (error) {
        logError(`Failed to stop MCP servers: ${error.message}`);
        testResults.errors.push({ shutdown: error.message });
    }

    // Print summary
    logSection('Test Summary');
    
    logInfo(`MCP Servers Started: ${testResults.mcpServersStarted.length}`);
    for (const server of testResults.mcpServersStarted) {
        logSuccess(`  - ${server}`);
    }

    if (testResults.mcpServersFailed.length > 0) {
        logInfo(`\nMCP Servers Failed: ${testResults.mcpServersFailed.length}`);
        for (const server of testResults.mcpServersFailed) {
            logError(`  - ${server}`);
        }
    }

    logInfo(`\nTools Discovered: ${testResults.toolsDiscovered.length}`);
    for (const tool of testResults.toolsDiscovered) {
        logSuccess(`  - ${tool.name} (from ${tool.server})`);
    }

    logInfo(`\nTools Executed: ${testResults.toolsExecuted.length}`);
    for (const tool of testResults.toolsExecuted) {
        logSuccess(`  - ${tool}`);
    }

    if (testResults.errors.length > 0) {
        logInfo(`\nErrors: ${testResults.errors.length}`);
        for (const error of testResults.errors) {
            logError(`  - ${JSON.stringify(error)}`);
        }
    }

    // Final verdict
    logSection('Final Verdict');
    
    const allTestsPassed = 
        testResults.mcpServersStarted.length > 0 &&
        testResults.toolsDiscovered.length > 0 &&
        testResults.errors.length === 0;

    if (allTestsPassed) {
        logSuccess('All tests passed! MCP integration is working correctly.');
        process.exit(0);
    } else {
        logWarning('Some tests failed. Check the errors above for details.');
        process.exit(1);
    }
}

// Run the tests
runTests().catch(error => {
    logError(`Fatal error: ${error.message}`);
    console.error(error);
    process.exit(1);
});
