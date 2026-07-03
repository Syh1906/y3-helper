export const MCP_HTTP_PORT = 8766;
export const MCP_ENDPOINT = `http://127.0.0.1:${MCP_HTTP_PORT}/mcp`;
export const MCP_HEALTH_ENDPOINT = `http://127.0.0.1:${MCP_HTTP_PORT}/health`;

export interface AgentContextSnapshot {
    projectRoot?: string;
    mapRoot?: string;
    scriptRoot?: string;
    y3Root?: string;
    helperRoot?: string;
    currentMapName?: string;
    mcpEndpoint: string;
    healthEndpoint: string;
}

export interface AgentContextInput {
    projectRoot?: string;
    mapRoot?: string;
    scriptRoot?: string;
    y3Root?: string;
    helperRoot?: string;
    currentMapName?: string;
}

export function createAgentContextSnapshot(input: AgentContextInput): AgentContextSnapshot {
    return {
        projectRoot: normalizeDisplayPath(input.projectRoot),
        mapRoot: normalizeDisplayPath(input.mapRoot),
        scriptRoot: normalizeDisplayPath(input.scriptRoot),
        y3Root: normalizeDisplayPath(input.y3Root),
        helperRoot: normalizeDisplayPath(input.helperRoot),
        currentMapName: input.currentMapName,
        mcpEndpoint: MCP_ENDPOINT,
        healthEndpoint: MCP_HEALTH_ENDPOINT,
    };
}

function normalizeDisplayPath(value: string | undefined): string | undefined {
    return value?.replace(/\\/g, '/');
}

export function createMcpClientConfig(): Record<string, unknown> {
    return {
        mcpServers: {
            'y3-helper': {
                type: 'streamableHttp',
                url: MCP_ENDPOINT,
            },
        },
    };
}

export function createMcpClientConfigJson(): string {
    return JSON.stringify(createMcpClientConfig(), null, 2);
}

export function createAgentGuide(snapshot: AgentContextSnapshot): string {
    return [
        '# Y3-Helper Agent Guide',
        '',
        '你正在连接本地 VSIX 分叉版 Y3-Helper 提供的 MCP 服务。',
        '',
        '## 启动顺序',
        '',
        '1. 先读取 `y3-helper://project-context`，确认当前地图、脚本目录和 MCP 地址。',
        '2. 再调用 `get_game_status` 判断游戏是否已经运行。',
        '3. 需要诊断 Lua 时优先调用 `read_problems_lua`。',
        '4. 需要运行时验证时，再使用 `launch_game`、`execute_lua`、`capture_screenshot`。',
        '',
        '## 当前入口',
        '',
        `- MCP: ${snapshot.mcpEndpoint}`,
        `- Health: ${snapshot.healthEndpoint}`,
        `- Script: ${formatPath(snapshot.scriptRoot)}`,
    ].join('\n');
}

export function createProjectContext(snapshot: AgentContextSnapshot): string {
    return JSON.stringify({
        projectRoot: formatOptionalPath(snapshot.projectRoot),
        mapRoot: formatOptionalPath(snapshot.mapRoot),
        scriptRoot: formatOptionalPath(snapshot.scriptRoot),
        y3Root: formatOptionalPath(snapshot.y3Root),
        helperRoot: formatOptionalPath(snapshot.helperRoot),
        currentMapName: snapshot.currentMapName ?? null,
        mcpEndpoint: snapshot.mcpEndpoint,
        healthEndpoint: snapshot.healthEndpoint,
        workspaceGuidance: '默认把地图 script 目录作为 agent 工作区；script/y3 是 Y3 框架库，不是地图业务脚本根。',
    }, null, 2);
}

export function createToolWorkflows(snapshot: AgentContextSnapshot): string {
    return [
        '# Y3-Helper MCP Tool Workflows',
        '',
        `当前脚本目录：${formatPath(snapshot.scriptRoot)}`,
        '',
        '## Lua 诊断',
        '',
        '1. 调用 `read_problems_lua` 获取 LuaLS 诊断。',
        '2. 修改脚本文件后再次调用 `read_problems_lua` 验证。',
        '',
        '## 运行时验证',
        '',
        '1. 调用 `get_game_status`。',
        '2. 游戏未运行时调用 `launch_game`。',
        '3. 游戏运行后调用 `execute_lua` 做最小验证。',
        '4. UI 相关任务可调用 `get_ui_canvas` 和 `capture_screenshot`。',
    ].join('\n');
}

export function createAgentSafetyGuide(snapshot: AgentContextSnapshot): string {
    return [
        '# Y3-Helper MCP Safety',
        '',
        `地图脚本目录：${formatPath(snapshot.scriptRoot)}`,
        '',
        '- `execute_lua` 会在正在运行的游戏里执行 Lua，只用于验证明确的小片段。',
        '- `launch_game`、`quick_restart`、`stop_game` 会影响本地游戏进程。',
        '- `script/y3` 是 Y3 框架库，默认不要把地图业务逻辑或 `AGENTS.md` 写到这里。',
        '- 修改地图脚本后，优先用 `read_problems_lua` 和运行时最小验证闭环。',
    ].join('\n');
}

export function createAgentsMarkdown(snapshot: AgentContextSnapshot): string {
    return [
        '# Y3 地图脚本 Agent 指南',
        '',
        '本文件面向打开当前地图脚本目录的 AI agent。',
        '',
        '## 工作区边界',
        '',
        `- 地图脚本目录：${formatPath(snapshot.scriptRoot)}`,
        `- 当前地图：${snapshot.currentMapName ?? '(未识别)'}`,
        `- 地图工程：${formatPath(snapshot.projectRoot)}`,
        '',
        '`script/y3` 是 Y3 框架库，不是地图业务脚本根。不要把 `AGENTS.md` 默认写入 `script/y3`。',
        '',
        '## MCP 接入',
        '',
        '```json',
        JSON.stringify(createMcpClientConfig(), null, 2),
        '```',
        '',
        '连接后先读取 `y3-helper://agent-guide` 和 `y3-helper://project-context`。',
        '',
        '## 推荐流程',
        '',
        '1. 先调用 `get_game_status`。',
        '2. Lua 静态诊断调用 `read_problems_lua`。',
        '3. 运行时验证按需调用 `launch_game`、`execute_lua`、`capture_screenshot`。',
        '4. UI 结构查询调用 `get_ui_canvas`。',
    ].join('\n');
}

function formatPath(value: string | undefined): string {
    return normalizeDisplayPath(value) ?? '(未识别)';
}

function formatOptionalPath(value: string | undefined): string | null {
    return normalizeDisplayPath(value) ?? null;
}
