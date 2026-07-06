import * as assert from 'assert';
import { runMcpServerAction } from '../../codemaker/handlers/mcpActions';

suite('MCP handler actions', () => {
    test('pings existing connections without restarting all servers', async () => {
        const calls: string[] = [];
        const hub = {
            pingMcpServers: async () => { calls.push('ping'); },
            restartAllConnections: async () => { calls.push('restartAll'); },
            restartConnection: async (serverName: string) => { calls.push(`restart:${serverName}`); },
        };

        await runMcpServerAction(hub, 'PING_MCP_SERVERS', undefined);

        assert.deepStrictEqual(calls, ['ping']);
    });

    test('restarts all servers only for restart messages without a server name', async () => {
        const calls: string[] = [];
        const hub = {
            pingMcpServers: async () => { calls.push('ping'); },
            restartAllConnections: async () => { calls.push('restartAll'); },
            restartConnection: async (serverName: string) => { calls.push(`restart:${serverName}`); },
        };

        await runMcpServerAction(hub, 'RESTART_MCP_SERVERS', undefined);

        assert.deepStrictEqual(calls, ['restartAll']);
    });

    test('restarts a single server when restart message names one', async () => {
        const calls: string[] = [];
        const hub = {
            pingMcpServers: async () => { calls.push('ping'); },
            restartAllConnections: async () => { calls.push('restartAll'); },
            restartConnection: async (serverName: string) => { calls.push(`restart:${serverName}`); },
        };

        await runMcpServerAction(hub, 'RESTART_MCP_SERVERS', { serverName: 'y3runtime' });

        assert.deepStrictEqual(calls, ['restart:y3runtime']);
    });
});
