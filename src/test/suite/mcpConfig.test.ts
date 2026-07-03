import * as assert from 'assert';
import { canAutoStartMcp, normalizeMcpStartMode } from '../../mcp/startMode';

suite('MCP configuration', () => {
    suite('normalizeMcpStartMode', () => {
        test('keeps supported modes stable', () => {
            assert.strictEqual(normalizeMcpStartMode('off'), 'off');
            assert.strictEqual(normalizeMcpStartMode('manual'), 'manual');
            assert.strictEqual(normalizeMcpStartMode('auto'), 'auto');
        });

        test('defaults unknown values to manual', () => {
            assert.strictEqual(normalizeMcpStartMode(undefined), 'manual');
            assert.strictEqual(normalizeMcpStartMode(''), 'manual');
            assert.strictEqual(normalizeMcpStartMode('enabled'), 'manual');
        });
    });

    suite('canAutoStartMcp', () => {
        test('allows auto start only when mode is auto and the project is initialized', () => {
            assert.strictEqual(canAutoStartMcp('auto', false, true), true);
            assert.strictEqual(canAutoStartMcp('auto', false, false), false);
        });

        test('blocks pending auto start when mode changes to manual or off', () => {
            assert.strictEqual(canAutoStartMcp('manual', false, true), false);
            assert.strictEqual(canAutoStartMcp('off', false, true), false);
        });

        test('does not start another server when one is already running', () => {
            assert.strictEqual(canAutoStartMcp('auto', true, true), false);
        });
    });
});
