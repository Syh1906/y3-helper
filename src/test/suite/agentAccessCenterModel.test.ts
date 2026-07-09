import * as assert from 'assert';
import {
    AGENT_CLIENT_MCP_REFRESH_NOTICE,
    MCP_RUNTIME_CONFIG_BOUNDARY_NOTICE,
    formatAiDevEnvironmentConflictMessage,
    getAgentMcpProjectConfigDescription,
    getMcpToggleAction,
    getMcpRuntimeStatusDescription,
    getMcpRuntimeStatusTooltip,
    isMcpToggleActionStale,
    shouldRefreshAgentAccessCenterAfterAction,
} from '../../agentAccessCenterModel';

suite('Agent access center model', () => {
    test('uses the live MCP running state to choose the start or stop action', () => {
        assert.strictEqual(getMcpToggleAction(false), 'startMcp');
        assert.strictEqual(getMcpToggleAction(true), 'stopMcp');
    });

    test('refreshes the access center after MCP start, stop, enable, and disable actions', () => {
        assert.strictEqual(shouldRefreshAgentAccessCenterAfterAction('startMcp'), true);
        assert.strictEqual(shouldRefreshAgentAccessCenterAfterAction('stopMcp'), true);
        assert.strictEqual(shouldRefreshAgentAccessCenterAfterAction('enableAiMcpConfig'), true);
        assert.strictEqual(shouldRefreshAgentAccessCenterAfterAction('disableAiMcpConfig'), true);
        assert.strictEqual(shouldRefreshAgentAccessCenterAfterAction('noop'), false);
        assert.strictEqual(shouldRefreshAgentAccessCenterAfterAction('copyMcpConfig'), false);
        assert.strictEqual(shouldRefreshAgentAccessCenterAfterAction('initializeAiDevEnvironment'), false);
    });

    test('detects stale MCP toggle choices before executing them', () => {
        assert.strictEqual(isMcpToggleActionStale('startMcp', true), true);
        assert.strictEqual(isMcpToggleActionStale('stopMcp', false), true);
        assert.strictEqual(isMcpToggleActionStale('startMcp', false), false);
        assert.strictEqual(isMcpToggleActionStale('stopMcp', true), false);
    });

    test('warns that external agent clients need to reload MCP state', () => {
        assert.match(AGENT_CLIENT_MCP_REFRESH_NOTICE, /Agent 客户端/);
        assert.match(AGENT_CLIENT_MCP_REFRESH_NOTICE, /重启或刷新/);
    });

    test('describes the MCP runtime state separately from Agent project config state', () => {
        assert.strictEqual(getMcpRuntimeStatusDescription(true, 'manual'), '运行中');
        assert.strictEqual(getMcpRuntimeStatusDescription(false, 'manual'), '未运行');
        assert.strictEqual(getMcpRuntimeStatusDescription(false, 'auto'), '未运行');
        assert.strictEqual(getMcpRuntimeStatusDescription(false, 'off'), '设置关闭');

        assert.match(MCP_RUNTIME_CONFIG_BOUNDARY_NOTICE, /启动\/停止/);
        assert.match(MCP_RUNTIME_CONFIG_BOUNDARY_NOTICE, /不会修改/);
        assert.match(MCP_RUNTIME_CONFIG_BOUNDARY_NOTICE, /Codex \/ Claude/);

        const tooltip = getMcpRuntimeStatusTooltip(true, 'auto');
        assert.match(tooltip, /扩展内/);
        assert.match(tooltip, /8766/);
        assert.match(tooltip, /Codex \/ Claude/);
    });

    test('describes Agent MCP project config state from Codex and Claude files', () => {
        assert.strictEqual(
            getAgentMcpProjectConfigDescription({
                codexEnabled: true,
                claudeMcpEnabled: true,
                claudeSettingsEnabled: true,
            }),
            '已启用',
        );
        assert.strictEqual(
            getAgentMcpProjectConfigDescription({
                codexEnabled: false,
                claudeMcpEnabled: false,
                claudeSettingsEnabled: false,
            }),
            '已禁用',
        );
        assert.strictEqual(
            getAgentMcpProjectConfigDescription({
                codexEnabled: true,
                claudeMcpEnabled: false,
                claudeSettingsEnabled: true,
            }),
            '不一致',
        );
        assert.strictEqual(
            getAgentMcpProjectConfigDescription(undefined),
            '未初始化',
        );
        assert.strictEqual(
            getAgentMcpProjectConfigDescription({
                codexEnabled: false,
                claudeMcpEnabled: false,
                claudeSettingsEnabled: false,
                error: 'bad json',
            }),
            '配置异常',
        );
    });

    test('explains how to resolve AI environment conflicts without deleting user files', () => {
        const message = formatAiDevEnvironmentConflictMessage([
            'E:\\Maps\\Y3_Helper_test01\\AGENTS.md',
            'E:\\Maps\\Y3_Helper_test01\\.mcp.json',
        ]);

        assert.match(message, /已停止/);
        assert.match(message, /不需要删除/);
        assert.match(message, /重新初始化地图/);
        assert.match(message, /Y3_HELPER_AI_DEV_ENV:BEGIN/);
        assert.match(message, /Y3_HELPER_AI_DEV_ENV:END/);
        assert.match(message, /托管块/);
        assert.match(message, /重新运行/);
        assert.match(message, /E:\/Maps\/Y3_Helper_test01\/AGENTS.md/);
        assert.match(message, /E:\/Maps\/Y3_Helper_test01\/.mcp.json/);
    });
});
