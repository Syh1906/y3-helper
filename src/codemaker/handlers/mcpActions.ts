export type McpServerAction = 'PING_MCP_SERVERS' | 'RESTART_MCP_SERVERS';

export interface McpServerActionHub {
    pingMcpServers(): Promise<void>;
    restartConnection(serverName: string): Promise<void>;
    restartAllConnections(): Promise<void>;
}

export async function runMcpServerAction(
    hub: McpServerActionHub,
    action: McpServerAction,
    data: any,
): Promise<void> {
    if (action === 'PING_MCP_SERVERS') {
        await hub.pingMcpServers();
        return;
    }

    const serverName = data?.name || data?.serverName;
    if (serverName) {
        await hub.restartConnection(serverName);
        return;
    }

    await hub.restartAllConnections();
}
