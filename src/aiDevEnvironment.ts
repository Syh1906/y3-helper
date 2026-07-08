import * as path from 'path';
import { MCP_ENDPOINT } from './mcp/agentContext';

export const AI_DEV_ENV_MARKER = '<!-- Y3_HELPER_AI_DEV_ENV -->';
const Y3_MCP_SERVERS = [
    {
        name: 'y3-helper',
        url: MCP_ENDPOINT,
        role: '项目上下文、地图状态、Lua 诊断、启动游戏、小段执行、截图与 UI 树基础入口。',
    },
    {
        name: 'y3editor',
        url: 'http://127.0.0.1:8765/mcp',
        role: '编辑器侧物编、UI、编辑器资源、保存、热更与导入入口。',
    },
    {
        name: 'y3runtime',
        url: 'http://127.0.0.1:8767/mcp',
        role: '运行中游戏交互、UI 自动化和验收入口。',
    },
] as const;

export interface AiDevEnvironmentSnapshot {
    projectRoot?: string;
    mapRoot?: string;
    scriptRoot?: string;
    y3Root?: string;
    currentMapName?: string;
    mcpEndpoint?: string;
    healthEndpoint?: string;
}

export interface AiDevEnvironmentPlanInput extends AiDevEnvironmentSnapshot {
    skillSourceRoot?: string;
    y3MakerConfigRoot?: string;
}

export interface AiDevEnvironmentPlan {
    rootAgentsPath: string;
    rootClaudePath: string;
    scriptAgentsPath: string;
    scriptClaudePath: string;
    codexSkillSource?: string;
    codexSkillTarget: string;
    claudeSkillLink: string;
    codexConfigPath: string;
    claudeMcpPath: string;
    claudeSettingsPath: string;
    y3MakerMcpSettingsPath: string;
}

export function createRootAgentsMarkdown(snapshot: AiDevEnvironmentSnapshot): string {
    const scriptRoute = toProjectRelativePath(snapshot.projectRoot, snapshot.scriptRoot) ?? 'maps/<当前地图>/script';

    return [
        '# Y3 地图工程 Agent 指南',
        '',
        AI_DEV_ENV_MARKER,
        '',
        '## 地图工程模块路由',
        '',
        `- \`${scriptRoute}\`：Lua 业务逻辑、玩法系统、UI 绑定脚本。`,
        `- \`${scriptRoute}/y3\`：Y3 框架库，默认只读；只有明确处理框架升级、API 溯源或内核问题时进入。`,
        `- \`${scriptRoute}/y3-helper/meta\`：生成层和元数据，默认不手改。`,
        '- `editor_table` / 物编数据：单位、技能、物品、投射物等配置需求进入这里或通过 MCP 处理。',
        '- UI 目录：界面布局、控件、画布和 UI 绑定需求进入对应 UI 模块。',
        '- `global_script`：全局脚本需求才进入。',
        '- 工程配置、`header.project`、地图 JSON：只有明确工程配置需求才修改。',
        '',
        '## 本地能力',
        '',
        '- Y3 内核、事件、UI、物编、同步边界问题使用 `y3-kernel-navigator`。',
        '- MCP 职责：',
        ...Y3_MCP_SERVERS.map((server) => `  - \`${server.name}\`：${server.role}`),
        '- `y3editor` 和 `y3runtime` 依赖编辑器或游戏运行状态；离线时不要视为初始化失败。',
    ].join('\n');
}

export function createScriptAgentsMarkdown(snapshot: AiDevEnvironmentSnapshot): string {
    return [
        '# Y3 地图脚本 Agent 指南',
        '',
        AI_DEV_ENV_MARKER,
        '',
        '## Lua 业务开发',
        '',
        `- 地图脚本目录：${formatPath(snapshot.scriptRoot)}`,
        `- 当前地图：${snapshot.currentMapName ?? '(未识别)'}`,
        `- 地图工程：${formatPath(snapshot.projectRoot)}`,
        '',
        '`script/y3` 是 Y3 框架库，不是地图业务脚本根；不要把业务代码写入 `script/y3`。',
        '',
        '## Skill',
        '',
        '- `y3-kernel-navigator`：涉及 Y3 API、事件、UI、物编、同步/本地边界、加载顺序时使用。',
        '',
        '## MCP 流程',
        '',
        '1. 先读取 `y3-helper://agent-guide` 和 `y3-helper://project-context`。',
        '2. `y3-helper`：项目上下文、`get_game_status`、`read_problems_lua`、`launch_game`、`execute_lua`、截图和基础运行验证。',
        '3. `y3editor`：编辑器资源、物编、UI 热更、保存与导入；编辑器未打开时可暂不可用。',
        '4. `y3runtime`：运行中 UI 自动化、交互验收；游戏未运行时可暂不可用。',
        '5. 先用 `get_game_status` 判断状态，再按需调用对应 MCP 工具。',
    ].join('\n');
}

export function buildAiDevEnvironmentPlan(input: AiDevEnvironmentPlanInput): AiDevEnvironmentPlan {
    const projectRoot = requirePath(input.projectRoot, 'projectRoot');
    const scriptRoot = requirePath(input.scriptRoot, 'scriptRoot');
    const skillSourceRoot = input.skillSourceRoot ? normalizePath(input.skillSourceRoot) : undefined;
    const y3MakerConfigRoot = input.y3MakerConfigRoot ? normalizePath(input.y3MakerConfigRoot) : projectRoot;

    return {
        rootAgentsPath: joinPath(projectRoot, 'AGENTS.md'),
        rootClaudePath: joinPath(projectRoot, 'CLAUDE.md'),
        scriptAgentsPath: joinPath(scriptRoot, 'AGENTS.md'),
        scriptClaudePath: joinPath(scriptRoot, 'CLAUDE.md'),
        codexSkillSource: skillSourceRoot,
        codexSkillTarget: joinPath(projectRoot, '.codex', 'skills', 'y3-kernel-navigator'),
        claudeSkillLink: joinPath(projectRoot, '.claude', 'skills', 'y3-kernel-navigator'),
        codexConfigPath: joinPath(projectRoot, '.codex', 'config.toml'),
        claudeMcpPath: joinPath(projectRoot, '.mcp.json'),
        claudeSettingsPath: joinPath(projectRoot, '.claude', 'settings.local.json'),
        y3MakerMcpSettingsPath: joinPath(y3MakerConfigRoot, '.y3maker', 'mcp_settings.json'),
    };
}

export function createCodexConfigToml(existingContent: string, enabled: boolean): string {
    let content = existingContent.trimEnd();
    for (const server of Y3_MCP_SERVERS) {
        const blockPattern = createCodexServerBlockPattern(server.name);
        const existingBlock = content.match(blockPattern)?.[0];
        const header = existingBlock?.match(/^\s*(\[mcp_servers\.(?:"[^"]+"|[^\]]+)\])/m)?.[1] ?? `[mcp_servers.${server.name}]`;
        const block = [
            header,
            `url = "${server.url}"`,
            'transport = "streamable_http"',
            'tool_timeout_sec = 60',
            `enabled = ${enabled ? 'true' : 'false'}`,
        ].join('\n');

        if (blockPattern.test(content)) {
            content = content.replace(blockPattern, block).trimEnd();
        } else {
            content = content ? `${content}\n\n${block}` : block;
        }
    }
    return `${content}\n`;
}

export function createClaudeMcpJson(existingContent: string, enabled: boolean): string {
    const root = parseJsonObject(existingContent);
    const mcpServers = asObject(root.mcpServers);
    root.mcpServers = mcpServers;
    for (const server of Y3_MCP_SERVERS) {
        mcpServers[server.name] = {
            type: 'http',
            url: server.url,
            timeout: 60000,
            disabled: !enabled,
        };
    }
    return `${JSON.stringify(root, null, 2)}\n`;
}

export function createY3MakerMcpSettingsJson(existingContent: string, enabled: boolean): string {
    const root = parseJsonObject(existingContent);
    const mcpServers = asObject(root.mcpServers);
    root.mcpServers = mcpServers;
    for (const server of Y3_MCP_SERVERS) {
        mcpServers[server.name] = {
            type: 'streamableHttp',
            url: server.url,
            headers: {},
            timeout: 60,
            autoApprove: true,
            disabled: !enabled,
        };
    }
    return `${JSON.stringify(root, null, 2)}\n`;
}

export function createClaudeSettingsJson(existingContent: string, enabled: boolean): string {
    const root = parseJsonObject(existingContent);
    const enabledServers = uniqueStringArray(root.enabledMcpjsonServers);
    const disabledServers = uniqueStringArray(root.disabledMcpjsonServers);

    const y3ServerNames = Y3_MCP_SERVERS.map((server) => server.name);
    root.enabledMcpjsonServers = enabled
        ? addNames(removeNames(enabledServers, y3ServerNames), y3ServerNames)
        : removeNames(enabledServers, y3ServerNames);
    root.disabledMcpjsonServers = enabled
        ? removeNames(disabledServers, y3ServerNames)
        : addNames(removeNames(disabledServers, y3ServerNames), y3ServerNames);

    return `${JSON.stringify(root, null, 2)}\n`;
}

export function hasCodexY3HelperMcpConflict(existingContent: string): boolean {
    for (const server of Y3_MCP_SERVERS) {
        const block = existingContent.match(createCodexServerBlockPattern(server.name))?.[0];
        if (!block) {
            continue;
        }
        const url = block.match(/^\s*url\s*=\s*"([^"]+)"/m)?.[1];
        if (url !== server.url) {
            return true;
        }
    }
    return false;
}

export function hasClaudeY3HelperMcpConflict(existingContent: string): boolean {
    const root = parseJsonObject(existingContent);
    const mcpServers = asObject(root.mcpServers);
    return hasJsonMcpServerConflict(mcpServers);
}

export function hasY3MakerMcpSettingsConflict(existingContent: string): boolean {
    const root = parseJsonObject(existingContent);
    const mcpServers = asObject(root.mcpServers);
    return hasJsonMcpServerConflict(mcpServers);
}

function hasJsonMcpServerConflict(mcpServers: Record<string, any>): boolean {
    for (const server of Y3_MCP_SERVERS) {
        if (!Object.prototype.hasOwnProperty.call(mcpServers, server.name)) {
            continue;
        }
        const serverConfig = asObject(mcpServers[server.name]);
        if (serverConfig.url !== server.url) {
            return true;
        }
    }
    return false;
}

export function normalizeRelativeLink(linkPath: string, targetPath: string): string {
    const linkParent = path.win32.dirname(linkPath.replace(/\//g, '\\'));
    const relative = path.win32.relative(linkParent, targetPath.replace(/\//g, '\\'));
    return normalizePath(relative);
}

export function isManagedAiDevEnvironmentFile(content: string): boolean {
    return content.includes(AI_DEV_ENV_MARKER);
}

function parseJsonObject(content: string): Record<string, any> {
    if (!content.trim()) {
        return {};
    }
    const parsed = JSON.parse(content);
    return asObject(parsed);
}

function asObject(value: unknown): Record<string, any> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function uniqueStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return Array.from(new Set(value.filter((item): item is string => typeof item === 'string')));
}

function addNames(values: string[], names: string[]): string[] {
    let result = [...values];
    for (const name of names) {
        if (!result.includes(name)) {
            result = [...result, name];
        }
    }
    return result;
}

function removeNames(values: string[], names: string[]): string[] {
    return values.filter((value) => !names.includes(value));
}

function requirePath(value: string | undefined, name: string): string {
    if (!value) {
        throw new Error(`${name} is required`);
    }
    return normalizePath(value);
}

function joinPath(...parts: string[]): string {
    return normalizePath(path.win32.join(...parts.map((part) => part.replace(/\//g, '\\'))));
}

function createCodexServerBlockPattern(serverName: string): RegExp {
    return new RegExp(`\\[mcp_servers\\.(?:"${escapeRegExp(serverName)}"|${escapeRegExp(serverName)})\\][\\s\\S]*?(?=\\n\\[|$)`);
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatPath(value: string | undefined): string {
    return value ? normalizePath(value) : '(未识别)';
}

function normalizePath(value: string): string {
    return value.replace(/\\/g, '/');
}

function toProjectRelativePath(projectRoot: string | undefined, targetPath: string | undefined): string | undefined {
    if (!projectRoot || !targetPath) {
        return undefined;
    }
    const relative = path.win32.relative(projectRoot.replace(/\//g, '\\'), targetPath.replace(/\//g, '\\'));
    return relative ? normalizePath(relative) : undefined;
}
