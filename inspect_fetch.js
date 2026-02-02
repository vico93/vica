
const toolLoader = require('./core/tool_loader');

async function inspect() {
    try {
        await toolLoader.startMCPServers();
        const tools = await toolLoader.getMCPTools();
        const fetchTool = tools.find(t => t.function.name === 'fetch');
        
        if (fetchTool) {
            console.log(JSON.stringify(fetchTool, null, 2));
        } else {
            console.log('Fetch tool not found');
        }
        
        await toolLoader.stopAllMCPServers();
    } catch (e) {
        console.error(e);
    }
}

inspect();
