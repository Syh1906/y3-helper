import * as assert from 'assert';
import { createMcpServerInfo } from '../../mcp/serverInfo';

suite('MCP server identity', () => {
    test('uses the supplied extension version', () => {
        assert.deepStrictEqual(createMcpServerInfo('9.8.7'), {
            name: 'y3-helper',
            version: '9.8.7',
        });
    });
});
