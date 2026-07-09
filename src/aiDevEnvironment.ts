import * as path from 'path';
import { MCP_ENDPOINT } from './mcp/agentContext';
import type { AgentMcpProjectConfigState } from './agentAccessCenterModel';

export const AI_DEV_ENV_MARKER = '<!-- Y3_HELPER_AI_DEV_ENV -->';
export const AI_DEV_ENV_BLOCK_BEGIN = '<!-- Y3_HELPER_AI_DEV_ENV:BEGIN -->';
export const AI_DEV_ENV_BLOCK_END = '<!-- Y3_HELPER_AI_DEV_ENV:END -->';
export const CLAUDE_LOCAL_SETTINGS_GITIGNORE_RULE = '/.claude/settings.local.json';
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
const LEGACY_Y3MAKER_MCP_SERVER_KEYS = ['autoApprove', 'disabled', 'headers', 'timeout', 'type', 'url'];

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
    gitignorePath: string;
    scriptCodexConfigLink: string;
    scriptClaudeMcpLink: string;
    scriptClaudeSettingsLink: string;
    scriptCodexSkillLink: string;
    scriptClaudeSkillLink: string;
    scriptClaudeSettingsGitignoreRule: string;
}

export function createRootAgentsMarkdown(snapshot: AiDevEnvironmentSnapshot): string {
    return createManagedAgentsMarkdown(
        '# Y3 地图工程 Agent 指南',
        createRootAgentsMarkdownBody(snapshot),
    );
}

export function createLegacyRootAgentsMarkdown(snapshot: AiDevEnvironmentSnapshot): string {
    return createLegacyAgentsMarkdown(
        '# Y3 地图工程 Agent 指南',
        createRootAgentsMarkdownBody(snapshot),
    );
}

function createRootAgentsMarkdownBody(snapshot: AiDevEnvironmentSnapshot): string[] {
    const scriptRoute = toProjectRelativePath(snapshot.projectRoot, snapshot.scriptRoot) ?? 'maps/<当前地图>/script';

    return [
        '## 地图工程模块路由',
        '',
        `- \`${scriptRoute}\`：Lua 业务逻辑、玩法系统、UI 绑定脚本。`,
        `- \`${scriptRoute}/y3\`：Y3 框架库，默认只读；只有明确处理框架升级、API 溯源或内核问题时进入。`,
        `- \`${scriptRoute}/y3-helper/meta\`：生成层和元数据，默认不手改。`,
        '- `editor_table` / 物编数据：单位、技能、物品、投射物等配置需求进入这里或通过 MCP 处理。',
        '- UI 目录：界面布局、控件、画布和 UI 绑定需求进入对应 UI 模块。',
        '- `global_script`：全局脚本需求才进入。',
        '- 工程配置、`header.project`、地图 JSON：只有明确工程配置需求才修改。',
        '- `.codex` / `.claude` / `.mcp.json` / `.y3maker`：AI 与 MCP 配置，只有明确配置修复需求才修改。',
        '- `.log` / `log/`：运行日志，只读排查，不作为业务代码入口。',
        '',
        '## 常见任务入口',
        '',
        `- 普通玩法、事件、初始化逻辑：进入 \`${scriptRoute}\`，优先从 \`main.lua\` 追踪加载链路。`,
        '- 单位、技能、物品、投射物：优先看 `editor_table` 或使用 `y3editor` MCP。',
        '- 运行验收、截图、游戏状态：优先使用 `y3-helper` / `y3runtime` MCP。',
        '- AI/MCP 配置修复：再处理 `.codex`、`.claude`、`.mcp.json`、`.y3maker`。',
        '',
        '## 本地能力',
        '',
        '- Y3 内核、事件、UI、物编、同步边界问题使用 `y3-kernel-navigator`。',
        '- MCP 职责：',
        ...Y3_MCP_SERVERS.map((server) => `  - \`${server.name}\`：${server.role}`),
        '- `y3editor` 和 `y3runtime` 依赖编辑器或游戏运行状态；离线时不要视为初始化失败。',
    ];
}

export function createScriptAgentsMarkdown(snapshot: AiDevEnvironmentSnapshot): string {
    return createManagedAgentsMarkdown(
        '# Y3 地图脚本 Agent 指南',
        createScriptAgentsMarkdownBody(snapshot),
    );
}

export function createLegacyScriptAgentsMarkdown(snapshot: AiDevEnvironmentSnapshot): string {
    return createLegacyAgentsMarkdown(
        '# Y3 地图脚本 Agent 指南',
        createScriptAgentsMarkdownBody(snapshot),
    );
}

function createScriptAgentsMarkdownBody(snapshot: AiDevEnvironmentSnapshot): string[] {
    const scriptRoute = toProjectRelativePath(snapshot.projectRoot, snapshot.scriptRoot) ?? 'maps/<当前地图>/script';

    return [
        '## Lua 业务开发',
        '',
        '- 地图工程根目录：当前地图工程根目录（包含 `header.project`）。',
        `- 地图脚本目录：\`${scriptRoute}\`（相对地图工程根目录；若工作区直接打开 script，则为当前目录）。`,
        `- 当前地图：${snapshot.currentMapName ?? '(未识别)'}`,
        '',
        '## 脚本入口与只读边界',
        '',
        '- `main.lua`：地图自动运行入口；初始化、事件注册、业务加载链路先从这里追踪。',
        '- `可重载的代码.lua`：热重载或调试迭代相关需求才进入。',
        '- `y3/`：Y3 框架库，默认只读；不要把业务代码写入 `script/y3`。',
        '- `y3-helper/meta/`：生成层和元数据，默认不手改。',
        '- `.vscode/` / `.y3maker/`：工具配置，只有明确配置修复需求才修改。',
        '- `.log/` / `log/`：运行日志，只读排查，不作为业务代码入口。',
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
    ];
}

function createManagedAgentsMarkdown(title: string, bodyLines: string[]): string {
    return [
        title,
        '',
        AI_DEV_ENV_BLOCK_BEGIN,
        AI_DEV_ENV_MARKER,
        '',
        ...bodyLines,
        AI_DEV_ENV_BLOCK_END,
    ].join('\n');
}

function createLegacyAgentsMarkdown(title: string, bodyLines: string[]): string {
    return [
        title,
        '',
        AI_DEV_ENV_MARKER,
        '',
        ...bodyLines,
    ].join('\n');
}

export function buildAiDevEnvironmentPlan(input: AiDevEnvironmentPlanInput): AiDevEnvironmentPlan {
    const projectRoot = requirePath(input.projectRoot, 'projectRoot');
    const scriptRoot = requirePath(input.scriptRoot, 'scriptRoot');
    const skillSourceRoot = input.skillSourceRoot ? normalizePath(input.skillSourceRoot) : undefined;
    const scriptClaudeSettingsPath = joinPath(scriptRoot, '.claude', 'settings.local.json');

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
        gitignorePath: joinPath(projectRoot, '.gitignore'),
        scriptCodexConfigLink: joinPath(scriptRoot, '.codex', 'config.toml'),
        scriptClaudeMcpLink: joinPath(scriptRoot, '.mcp.json'),
        scriptClaudeSettingsLink: scriptClaudeSettingsPath,
        scriptCodexSkillLink: joinPath(scriptRoot, '.codex', 'skills', 'y3-kernel-navigator'),
        scriptClaudeSkillLink: joinPath(scriptRoot, '.claude', 'skills', 'y3-kernel-navigator'),
        scriptClaudeSettingsGitignoreRule: createRootRelativeGitignoreRule(projectRoot, scriptClaudeSettingsPath),
    };
}

export function mergeAiDevEnvironmentGitignore(existingContent: string, extraRules: string[] = []): string {
    const normalized = existingContent.replace(/\r\n/g, '\n');
    const requiredRules = [CLAUDE_LOCAL_SETTINGS_GITIGNORE_RULE, ...extraRules].filter((rule, index, rules) => rule && rules.indexOf(rule) === index);
    const lines = normalized.split('\n');
    const missingRules = requiredRules.filter((rule) => !lines.includes(rule));
    if (missingRules.length === 0) {
        return normalized.endsWith('\n') ? normalized : `${normalized}\n`;
    }
    const trimmed = normalized.trimEnd();
    return `${trimmed ? `${trimmed}\n` : ''}\n# Claude local settings\n${missingRules.join('\n')}\n`;
}

export function createCodexConfigToml(existingContent: string, enabled: boolean): string {
    let content = existingContent.trimEnd();
    for (const server of Y3_MCP_SERVERS) {
        const blockPattern = createCodexServerBlockPattern(server.name);
        const existingBlock = content.match(blockPattern)?.[0];
        const block = createCodexServerBlock(
            existingBlock,
            server.name,
            {
                url: server.url,
                transport: 'streamable_http',
                tool_timeout_sec: '60',
                enabled: enabled ? 'true' : 'false',
            },
        );

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
            ...asObject(mcpServers[server.name]),
            type: 'http',
            url: server.url,
            timeout: 60000,
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

export function readAiMcpProjectConfigState(input: {
    codexConfigContent?: string;
    claudeMcpContent?: string;
    claudeSettingsContent?: string;
}): AgentMcpProjectConfigState | undefined {
    if (
        input.codexConfigContent === undefined
        || input.claudeMcpContent === undefined
        || input.claudeSettingsContent === undefined
    ) {
        return undefined;
    }
    return {
        codexEnabled: readCodexMcpConfigEnabled(input.codexConfigContent),
        claudeMcpEnabled: readClaudeMcpJsonEnabled(input.claudeMcpContent),
        claudeSettingsEnabled: readClaudeSettingsEnabled(input.claudeSettingsContent),
    };
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

export function hasClaudeSettingsJsonConflict(existingContent: string): boolean {
    parseJsonObject(existingContent);
    return false;
}

function readCodexMcpConfigEnabled(content: string): boolean {
    for (const server of Y3_MCP_SERVERS) {
        const block = content.match(createCodexServerBlockPattern(server.name))?.[0];
        if (!block) {
            return false;
        }
        const url = block.match(/^\s*url\s*=\s*"([^"]+)"/m)?.[1];
        if (url !== server.url) {
            return false;
        }
        const enabled = block.match(/^\s*enabled\s*=\s*(true|false)/m)?.[1];
        if (enabled !== 'true') {
            return false;
        }
    }
    return true;
}

function readClaudeMcpJsonEnabled(content: string): boolean {
    const root = parseJsonObject(content);
    const mcpServers = asObject(root.mcpServers);
    for (const server of Y3_MCP_SERVERS) {
        const config = asObject(mcpServers[server.name]);
        if (config.url !== server.url || config.disabled !== false) {
            return false;
        }
    }
    return true;
}

function readClaudeSettingsEnabled(content: string): boolean {
    const root = parseJsonObject(content);
    const enabledServers = uniqueStringArray(root.enabledMcpjsonServers);
    const disabledServers = uniqueStringArray(root.disabledMcpjsonServers);
    for (const server of Y3_MCP_SERVERS) {
        if (!enabledServers.includes(server.name) || disabledServers.includes(server.name)) {
            return false;
        }
    }
    return true;
}

export function isObsoleteY3MakerMcpSettingsJson(existingContent: string): boolean {
    const root = parseJsonObject(existingContent);
    if (!hasExactKeys(root, ['mcpServers'])) {
        return false;
    }
    const mcpServers = asObject(root.mcpServers);
    if (!hasExactKeys(mcpServers, Y3_MCP_SERVERS.map((server) => server.name))) {
        return false;
    }
    for (const server of Y3_MCP_SERVERS) {
        const serverConfig = asObject(mcpServers[server.name]);
        if (!hasExactKeys(serverConfig, LEGACY_Y3MAKER_MCP_SERVER_KEYS)) {
            return false;
        }
        const headers = asObject(serverConfig.headers);
        if (
            serverConfig.type !== 'streamableHttp'
            || serverConfig.url !== server.url
            || Object.keys(headers).length !== 0
            || serverConfig.timeout !== 60
            || serverConfig.autoApprove !== true
            || typeof serverConfig.disabled !== 'boolean'
        ) {
            return false;
        }
    }
    return true;
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

export function isUnmodifiedManagedAiDevEnvironmentFile(existingContent: string, expectedContent: string): boolean {
    return normalizeGeneratedContent(existingContent) === normalizeGeneratedContent(expectedContent);
}

export function mergeManagedAiDevEnvironmentFile(existingContent: string | undefined, expectedContent: string, legacyExpectedContent?: string): string | undefined {
    const normalizedExpected = normalizeGeneratedContent(expectedContent);
    if (existingContent === undefined) {
        return normalizedExpected;
    }

    const existingBlock = getManagedBlockRange(existingContent);
    const expectedBlock = getManagedBlockRange(normalizedExpected);
    if (existingBlock && expectedBlock) {
        return normalizeGeneratedContent([
            existingContent.slice(0, existingBlock.start),
            normalizedExpected.slice(expectedBlock.start, expectedBlock.end),
            existingContent.slice(existingBlock.end),
        ].join(''));
    }

    if (!existingContent.includes(AI_DEV_ENV_MARKER)) {
        return undefined;
    }

    if (legacyExpectedContent !== undefined) {
        const normalizedExisting = normalizeGeneratedContent(existingContent);
        const normalizedLegacy = normalizeGeneratedContent(legacyExpectedContent);
        if (normalizedExisting.startsWith(normalizedLegacy)) {
            return normalizeGeneratedContent(`${normalizedExpected}${normalizedExisting.slice(normalizedLegacy.length)}`);
        }
    }

    return normalizeGeneratedContent(existingContent) === normalizedExpected
        ? normalizedExpected
        : undefined;
}

function parseJsonObject(content: string): Record<string, any> {
    if (!content.trim()) {
        return {};
    }
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('JSON root must be an object');
    }
    return parsed as Record<string, any>;
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

function hasExactKeys(value: Record<string, any>, expectedKeys: readonly string[]): boolean {
    const actualKeys = Object.keys(value).sort();
    const sortedExpectedKeys = [...expectedKeys].sort();
    return actualKeys.length === sortedExpectedKeys.length
        && actualKeys.every((key, index) => key === sortedExpectedKeys[index]);
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

function createCodexServerBlock(existingBlock: string | undefined, serverName: string, managedFields: Record<string, string>): string {
    const header = existingBlock?.match(/^\s*(\[mcp_servers\.(?:"[^"]+"|[^\]]+)\])/m)?.[1] ?? `[mcp_servers.${serverName}]`;
    const lines = existingBlock ? existingBlock.trimEnd().split('\n') : [header];
    const result = [header];
    const remainingFields = new Set(Object.keys(managedFields));

    for (const line of lines.slice(1)) {
        const key = line.match(/^\s*([A-Za-z0-9_-]+)\s*=/)?.[1];
        if (key && Object.prototype.hasOwnProperty.call(managedFields, key)) {
            result.push(`${key} = ${formatTomlValue(managedFields[key])}`);
            remainingFields.delete(key);
        } else {
            result.push(line);
        }
    }

    for (const [key, value] of Object.entries(managedFields)) {
        if (remainingFields.has(key)) {
            result.push(`${key} = ${formatTomlValue(value)}`);
        }
    }

    return result.join('\n');
}

function formatTomlValue(value: string): string {
    if (value === 'true' || value === 'false' || /^\d+$/.test(value)) {
        return value;
    }
    return `"${value}"`;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizePath(value: string): string {
    return value.replace(/\\/g, '/');
}

function normalizeGeneratedContent(content: string): string {
    return `${content.replace(/\r\n/g, '\n').trimEnd()}\n`;
}

function getManagedBlockRange(content: string): { start: number; end: number } | undefined {
    const start = content.indexOf(AI_DEV_ENV_BLOCK_BEGIN);
    if (start < 0) {
        return undefined;
    }
    const endStart = content.indexOf(AI_DEV_ENV_BLOCK_END, start + AI_DEV_ENV_BLOCK_BEGIN.length);
    if (endStart < 0) {
        return undefined;
    }
    return {
        start,
        end: endStart + AI_DEV_ENV_BLOCK_END.length,
    };
}

function createRootRelativeGitignoreRule(projectRoot: string, targetPath: string): string {
    const relative = toProjectRelativePath(projectRoot, targetPath);
    return relative ? `/${relative}` : CLAUDE_LOCAL_SETTINGS_GITIGNORE_RULE;
}

function toProjectRelativePath(projectRoot: string | undefined, targetPath: string | undefined): string | undefined {
    if (!projectRoot || !targetPath) {
        return undefined;
    }
    const relative = path.win32.relative(projectRoot.replace(/\//g, '\\'), targetPath.replace(/\//g, '\\'));
    return relative ? normalizePath(relative) : undefined;
}
