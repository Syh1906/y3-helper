export type AgentAccessCenterAction =
    | 'noop'
    | 'copyMcpConfig'
    | 'initializeAiDevEnvironment'
    | 'enableAiMcpConfig'
    | 'disableAiMcpConfig'
    | 'generateAgentsMarkdown'
    | 'openAgentsMarkdown'
    | 'copyScriptPath'
    | 'startMcp'
    | 'stopMcp';

export const AGENT_CLIENT_MCP_REFRESH_NOTICE = '外部 Agent 客户端通常不会自动刷新 MCP 连接状态，如已连接请重启或刷新 Agent 客户端。';
export const MCP_RUNTIME_CONFIG_BOUNDARY_NOTICE = '启动/停止只控制 Y3-Helper 扩展内的本地 MCP Server，不会修改 Codex / Claude 项目 MCP 配置的启用状态。';

export interface AgentMcpProjectConfigState {
    codexEnabled: boolean;
    claudeMcpEnabled: boolean;
    claudeSettingsEnabled: boolean;
    error?: string;
}

export function formatAiDevEnvironmentConflictMessage(conflicts: string[]): string {
    const detail = conflicts.map((item) => item.replace(/\\/g, '/')).join('\n');
    return [
        'AI 开发环境初始化发现用户自定义文件，已停止以避免覆盖。',
        '',
        '不需要删除这些文件，也不需要重新初始化地图。',
        '处理方式：',
        '1. 如果是 AGENTS.md / CLAUDE.md：把你的自定义内容放到 Y3_HELPER_AI_DEV_ENV:BEGIN 和 Y3_HELPER_AI_DEV_ENV:END 托管块外；托管块内由 Y3-Helper 后续同步更新。',
        '2. 如果是 .codex/config.toml / .mcp.json / .claude/settings.local.json：保留你的其它配置，只把同名 y3-helper / y3editor / y3runtime MCP 条目改回 Y3-Helper 的本地地址，或移开同名冲突条目。',
        '3. 调整后重新运行“初始化 / 修复 AI 开发环境”，Y3-Helper 会继续同步托管内容，并保留托管块外的用户扩展。',
        '',
        '冲突文件：',
        detail,
    ].join('\n');
}

export function getMcpToggleAction(isMcpRunning: boolean): AgentAccessCenterAction {
    return isMcpRunning ? 'stopMcp' : 'startMcp';
}

export function getMcpRuntimeStatusDescription(isMcpRunning: boolean, mode: string): string {
    if (mode === 'off') {
        return '设置关闭';
    }
    return isMcpRunning ? '运行中' : '未运行';
}

export function getAgentMcpProjectConfigDescription(state: AgentMcpProjectConfigState | undefined): string {
    if (!state) {
        return '未初始化';
    }
    if (state.error) {
        return '配置异常';
    }
    if (state.codexEnabled && state.claudeMcpEnabled && state.claudeSettingsEnabled) {
        return '已启用';
    }
    if (!state.codexEnabled && !state.claudeMcpEnabled && !state.claudeSettingsEnabled) {
        return '已禁用';
    }
    return '不一致';
}

export function getAgentMcpProjectConfigTooltip(state: AgentMcpProjectConfigState | undefined): string {
    if (!state) {
        return '未找到完整的 Codex / Claude 项目 MCP 配置。请先运行“初始化 / 修复 AI 开发环境”。';
    }
    if (state.error) {
        return [
            'Codex / Claude 项目 MCP 配置读取失败。',
            `错误：${state.error}`,
            '请修复配置文件后再次刷新或运行“初始化 / 修复 AI 开发环境”。',
        ].join('\n');
    }
    return [
        `Agent 项目 MCP 配置：${getAgentMcpProjectConfigDescription(state)}。`,
        `Codex config.toml：${state.codexEnabled ? '启用' : '禁用'}。`,
        `Claude .mcp.json：${state.claudeMcpEnabled ? '启用' : '禁用'}。`,
        `Claude settings.local.json：${state.claudeSettingsEnabled ? '启用' : '禁用'}。`,
        MCP_RUNTIME_CONFIG_BOUNDARY_NOTICE,
    ].join('\n');
}

export function getMcpRuntimeStatusTooltip(isMcpRunning: boolean, mode: string): string {
    const status = getMcpRuntimeStatusDescription(isMcpRunning, mode);
    return [
        `当前本地 8766 MCP 服务：${status}。`,
        `启动模式：${mode}。`,
        MCP_RUNTIME_CONFIG_BOUNDARY_NOTICE,
        AGENT_CLIENT_MCP_REFRESH_NOTICE,
    ].join('\n');
}

export function shouldRefreshAgentAccessCenterAfterAction(action: AgentAccessCenterAction): boolean {
    return action === 'startMcp'
        || action === 'stopMcp'
        || action === 'enableAiMcpConfig'
        || action === 'disableAiMcpConfig';
}

export function isMcpToggleActionStale(action: AgentAccessCenterAction, isMcpRunning: boolean): boolean {
    if (action === 'startMcp') {
        return isMcpRunning;
    }
    if (action === 'stopMcp') {
        return !isMcpRunning;
    }
    return false;
}
