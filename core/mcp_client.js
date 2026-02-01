/*
** caminho: core/mcp_client.js
** últimaMod: 2026-02-01
** autor: Vico
** colaboração: Roo
*/

const { spawn } = require('child_process');

// Track running servers
const runningServers = new Map();

// Request ID counter for JSON-RPC
let requestIdCounter = 0;

// Default timeout for requests (30 seconds)
const DEFAULT_TIMEOUT = 30000;

/**
 * Generate a unique request ID for JSON-RPC
 * @returns {number} Unique request ID
 */
function generateRequestId() {
    return ++requestIdCounter;
}

/**
 * Create a JSON-RPC 2.0 request object
 * @param {string} method - The method name
 * @param {object} params - The parameters object
 * @returns {object} JSON-RPC request object
 */
function createJsonRpcRequest(method, params = {}) {
    return {
        jsonrpc: '2.0',
        id: generateRequestId(),
        method: method,
        params: params
    };
}

/**
 * Start an MCP server
 * @param {object} config - Server configuration
 * @param {string} config.name - Server name
 * @param {string} config.type - Server type (should be "mcp")
 * @param {string} config.transport - Transport type ("stdio" or "http")
 * @param {string} [config.url] - URL for http transport
 * @param {string} [config.command] - Command for stdio transport
 * @param {string[]} [config.args] - Arguments for stdio transport
 * @param {object} [config.env] - Environment variables for stdio transport
 * @returns {Promise<object>} Server object with connection handle
 */
async function startServer(config) {
    console.log(`[MCP_CLIENT][INFO] Starting server: ${config.name}`);

    const server = {
        name: config.name,
        type: config.type,
        transport: config.transport,
        config: config,
        initialized: false,
        capabilities: null
    };

    try {
        if (config.transport === 'stdio') {
            // Use shell option for better Windows compatibility
            const useShell = process.platform === 'win32';
            server.process = spawn(config.command, config.args || [], {
                env: { ...process.env, ...config.env },
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: useShell
            });

            server.process.stdout.setEncoding('utf8');

            // Handle process errors
            server.process.on('error', (error) => {
                console.error(`[MCP_CLIENT][ERROR] Process error for ${config.name}:`, error);
            });

            // Handle process exit
            server.process.on('exit', (code, signal) => {
                console.log(`[MCP_CLIENT][INFO] Process ${config.name} exited with code ${code}, signal ${signal}`);
                runningServers.delete(config.name);
            });

            // Collect stderr for debugging
            server.process.stderr.on('data', (data) => {
                console.log(`[MCP_CLIENT][DEBUG] ${config.name} stderr:`, data.toString());
            });

            // Initialize the server
            await initializeServer(server);

        } else if (config.transport === 'http') {
            if (!config.url) {
                throw new Error('URL is required for http transport');
            }
            server.url = config.url;

            // Initialize the server
            await initializeServer(server);
        } else {
            throw new Error(`Unsupported transport type: ${config.transport}`);
        }

        runningServers.set(config.name, server);
        console.log(`[MCP_CLIENT][INFO] Server ${config.name} started successfully`);

        return server;
    } catch (error) {
        console.error(`[MCP_CLIENT][ERROR] Failed to start server ${config.name}:`, error);
        throw error;
    }
}

/**
 * Stop an MCP server
 * @param {object} server - Server object
 * @returns {Promise<void>}
 */
async function stopServer(server) {
    console.log(`[MCP_CLIENT][INFO] Stopping server: ${server.name}`);

    try {
        if (server.transport === 'stdio' && server.process) {
            // Send shutdown notification
            try {
                const request = createJsonRpcRequest('shutdown');
                await sendJsonRpcRequest(server, request);
            } catch (error) {
                console.warn(`[MCP_CLIENT][WARN] Shutdown notification failed for ${server.name}:`, error.message);
            }

            // Kill the process
            server.process.kill('SIGTERM');

            // Wait a bit for graceful shutdown
            await new Promise((resolve) => setTimeout(resolve, 1000));

            // Force kill if still running
            if (server.process.exitCode === null) {
                server.process.kill('SIGKILL');
            }
        } else if (server.transport === 'http') {
            // HTTP connections are stateless, no cleanup needed
            console.log(`[MCP_CLIENT][INFO] HTTP server ${server.name} stopped`);
        }

        runningServers.delete(server.name);
        console.log(`[MCP_CLIENT][INFO] Server ${server.name} stopped successfully`);
    } catch (error) {
        console.error(`[MCP_CLIENT][ERROR] Failed to stop server ${server.name}:`, error);
        throw error;
    }
}

/**
 * Initialize MCP connection
 * @param {object} server - Server object
 * @returns {Promise<void>}
 */
async function initializeServer(server) {
    console.log(`[MCP_CLIENT][INFO] Initializing server: ${server.name}`);

    try {
        // Send initialize request
        const initRequest = createJsonRpcRequest('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {
                tools: {}
            },
            clientInfo: {
                name: 'vica-discord-bot',
                version: '1.0.0'
            }
        });

        const initResponse = await sendJsonRpcRequest(server, initRequest);

        if (initResponse.error) {
            throw new Error(`Initialize failed: ${initResponse.error.message}`);
        }

        server.capabilities = initResponse.result?.capabilities || {};
        console.log(`[MCP_CLIENT][INFO] Server ${server.name} capabilities:`, server.capabilities);

        // Send initialized notification
        const initializedNotification = {
            jsonrpc: '2.0',
            method: 'notifications/initialized'
        };

        await sendJsonRpcNotification(server, initializedNotification);

        server.initialized = true;
        console.log(`[MCP_CLIENT][INFO] Server ${server.name} initialized successfully`);
    } catch (error) {
        console.error(`[MCP_CLIENT][ERROR] Failed to initialize server ${server.name}:`, error);
        throw error;
    }
}

/**
 * List available tools from an MCP server
 * @param {object} server - Server object
 * @returns {Promise<Array>} Array of tool definitions in OpenAI function format
 */
async function listTools(server) {
    console.log(`[MCP_CLIENT][INFO] Listing tools for server: ${server.name}`);

    try {
        if (!server.initialized) {
            throw new Error(`Server ${server.name} is not initialized`);
        }

        const request = createJsonRpcRequest('tools/list');
        const response = await sendJsonRpcRequest(server, request);

        if (response.error) {
            throw new Error(`Tools list failed: ${response.error.message}`);
        }

        const tools = response.result?.tools || [];

        // Convert to OpenAI function format
        const openaiTools = tools.map((tool) => ({
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.inputSchema
            }
        }));

        console.log(`[MCP_CLIENT][INFO] Found ${openaiTools.length} tools for ${server.name}`);
        return openaiTools;
    } catch (error) {
        console.error(`[MCP_CLIENT][ERROR] Failed to list tools for ${server.name}:`, error);
        throw error;
    }
}

/**
 * Call a tool on an MCP server
 * @param {object} server - Server object
 * @param {string} toolName - Name of the tool to call
 * @param {object} args - Arguments to pass to the tool
 * @returns {Promise<object>} Tool result
 */
async function callTool(server, toolName, args = {}) {
    console.log(`[MCP_CLIENT][INFO] Calling tool ${toolName} on server: ${server.name}`);

    try {
        if (!server.initialized) {
            throw new Error(`Server ${server.name} is not initialized`);
        }

        const request = createJsonRpcRequest('tools/call', {
            name: toolName,
            arguments: args
        });

        const response = await sendJsonRpcRequest(server, request);

        if (response.error) {
            throw new Error(`Tool call failed: ${response.error.message}`);
        }

        const result = response.result;

        // Handle content array from MCP response
        if (result.content && Array.isArray(result.content)) {
            // Extract text content
            const textContent = result.content
                .filter((item) => item.type === 'text')
                .map((item) => item.text)
                .join('\n');

            return {
                content: textContent,
                isError: result.isError || false,
                _raw: result
            };
        }

        return result;
    } catch (error) {
        console.error(`[MCP_CLIENT][ERROR] Failed to call tool ${toolName} on ${server.name}:`, error);
        throw error;
    }
}

/**
 * Send a JSON-RPC request and wait for response
 * @param {object} server - Server object
 * @param {object} request - JSON-RPC request object
 * @param {number} [timeout] - Request timeout in milliseconds
 * @returns {Promise<object>} JSON-RPC response object
 */
function sendJsonRpcRequest(server, request, timeout = DEFAULT_TIMEOUT) {
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            reject(new Error(`Request timeout after ${timeout}ms`));
        }, timeout);

        if (server.transport === 'stdio') {
            handleStdioRequest(server, request)
                .then((response) => {
                    clearTimeout(timeoutId);
                    resolve(response);
                })
                .catch((error) => {
                    clearTimeout(timeoutId);
                    reject(error);
                });
        } else if (server.transport === 'http') {
            handleHttpRequest(server, request)
                .then((response) => {
                    clearTimeout(timeoutId);
                    resolve(response);
                })
                .catch((error) => {
                    clearTimeout(timeoutId);
                    reject(error);
                });
        } else {
            clearTimeout(timeoutId);
            reject(new Error(`Unsupported transport: ${server.transport}`));
        }
    });
}

/**
 * Send a JSON-RPC notification (no response expected)
 * @param {object} server - Server object
 * @param {object} notification - JSON-RPC notification object
 * @returns {Promise<void>}
 */
function sendJsonRpcNotification(server, notification) {
    return new Promise((resolve, reject) => {
        if (server.transport === 'stdio') {
            try {
                const data = JSON.stringify(notification) + '\n';
                server.process.stdin.write(data);
                resolve();
            } catch (error) {
                reject(error);
            }
        } else if (server.transport === 'http') {
            // HTTP notifications are sent as requests but we don't wait for response
            fetch(server.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(notification)
            }).catch((error) => {
                console.warn(`[MCP_CLIENT][WARN] HTTP notification failed:`, error.message);
            });
            resolve();
        } else {
            reject(new Error(`Unsupported transport: ${server.transport}`));
        }
    });
}

/**
 * Handle stdio transport request
 * @param {object} server - Server object
 * @param {object} request - JSON-RPC request object
 * @returns {Promise<object>} JSON-RPC response object
 */
function handleStdioRequest(server, request) {
    return new Promise((resolve, reject) => {
        try {
            const data = JSON.stringify(request) + '\n';
            server.process.stdin.write(data);

            // Set up response handler
            const responseHandler = (chunk) => {
                try {
                    const lines = chunk.toString().split('\n').filter((line) => line.trim());

                    for (const line of lines) {
                        const response = JSON.parse(line);

                        // Check if this is the response to our request
                        if (response.id === request.id) {
                            server.process.stdout.off('data', responseHandler);
                            resolve(response);
                            return;
                        }
                    }
                } catch (error) {
                    console.error(`[MCP_CLIENT][ERROR] Failed to parse response:`, error);
                }
            };

            server.process.stdout.once('data', responseHandler);

            // Set up error handler
            const errorHandler = (error) => {
                server.process.stdout.off('data', responseHandler);
                reject(error);
            };

            server.process.stdout.once('error', errorHandler);

        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Handle http transport request
 * @param {object} server - Server object
 * @param {object} request - JSON-RPC request object
 * @returns {Promise<object>} JSON-RPC response object
 */
async function handleHttpRequest(server, request) {
    try {
        const response = await fetch(server.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(request)
        });

        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        if (data.error) {
            throw new Error(`JSON-RPC error: ${data.error.message} (code: ${data.error.code})`);
        }

        return data;
    } catch (error) {
        console.error(`[MCP_CLIENT][ERROR] HTTP request failed:`, error);
        throw error;
    }
}

/**
 * Get a running server by name
 * @param {string} name - Server name
 * @returns {object|undefined} Server object or undefined if not found
 */
function getServer(name) {
    return runningServers.get(name);
}

/**
 * Get all running servers
 * @returns {Map} Map of running servers
 */
function getAllServers() {
    return runningServers;
}

/**
 * Stop all running servers
 * @returns {Promise<void>}
 */
async function stopAllServers() {
    console.log(`[MCP_CLIENT][INFO] Stopping all servers (${runningServers.size} running)`);

    const stopPromises = [];
    for (const [name, server] of runningServers) {
        stopPromises.push(stopServer(server));
    }

    await Promise.allSettled(stopPromises);
    console.log(`[MCP_CLIENT][INFO] All servers stopped`);
}

module.exports = {
    startServer,
    stopServer,
    initializeServer,
    listTools,
    callTool,
    getServer,
    getAllServers,
    stopAllServers
};
