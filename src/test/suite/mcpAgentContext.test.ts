import * as assert from 'assert';
import {
    MCP_HTTP_PORT,
    createAgentGuide,
    createAgentSafetyGuide,
    createAgentsMarkdown,
    createMcpClientConfig,
    createProjectContext,
    createToolWorkflows,
    type AgentContextSnapshot,
} from '../../mcp/agentContext';

suite('MCP agent context', () => {
    const snapshot: AgentContextSnapshot = {
        projectRoot: 'E:/Maps/Moy_Y3',
        mapRoot: 'E:/Maps/Moy_Y3/maps/EntryMap',
        scriptRoot: 'E:/Maps/Moy_Y3/maps/EntryMap/script',
        y3Root: 'E:/Maps/Moy_Y3/maps/EntryMap/script/y3',
        helperRoot: 'E:/Maps/Moy_Y3/maps/EntryMap/script/y3-helper',
        currentMapName: 'EntryMap',
        mcpEndpoint: `http://127.0.0.1:${MCP_HTTP_PORT}/mcp`,
        healthEndpoint: `http://127.0.0.1:${MCP_HTTP_PORT}/health`,
    };

    test('builds a streamable HTTP MCP client config', () => {
        assert.deepStrictEqual(createMcpClientConfig(), {
            mcpServers: {
                'y3-helper': {
                    type: 'streamableHttp',
                    url: 'http://127.0.0.1:8766/mcp',
                },
            },
        });
    });

    test('creates AGENTS.md for the map script directory, not the y3 framework library', () => {
        const markdown = createAgentsMarkdown(snapshot);

        assert.ok(markdown.includes('地图脚本目录'));
        assert.ok(markdown.includes('E:/Maps/Moy_Y3/maps/EntryMap/script'));
        assert.ok(markdown.includes('`script/y3` 是 Y3 框架库'));
        assert.ok(markdown.includes('不要把 `AGENTS.md` 默认写入 `script/y3`'));
    });

    test('creates resources that teach agents when to use Y3 Helper MCP', () => {
        assert.ok(createAgentGuide(snapshot).includes('先读取 `y3-helper://project-context`'));
        assert.ok(createProjectContext(snapshot).includes('"scriptRoot"'));
        assert.ok(createToolWorkflows(snapshot).includes('read_problems_lua'));
        assert.ok(createAgentSafetyGuide(snapshot).includes('execute_lua'));
    });

    test('normalizes Windows paths for agent-readable text', () => {
        const markdown = createAgentsMarkdown({
            ...snapshot,
            scriptRoot: 'E:\\Maps\\Moy_Y3\\maps\\EntryMap\\script',
        });

        assert.ok(markdown.includes('E:/Maps/Moy_Y3/maps/EntryMap/script'));
        assert.strictEqual(markdown.includes('E:\\Maps'), false);
    });
});
