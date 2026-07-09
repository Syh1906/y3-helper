import * as vscode from 'vscode';
import * as l10n from '@vscode/l10n';
import { env } from './env';
import {
    applyAiDevEnvironment,
    inspectAiDevEnvironment,
    setAiMcpProjectConfigEnabled,
} from './aiDevEnvironmentApplier';
import {
    createScriptAgentsMarkdown,
    readAiMcpProjectConfigState,
} from './aiDevEnvironment';
import {
    createAgentContextSnapshot,
    createMcpClientConfigJson,
} from './mcp/agentContext';
import { getMcpStartMode } from './mcp/config';
import {
    AGENT_CLIENT_MCP_REFRESH_NOTICE,
    type AgentAccessCenterAction,
    formatAiDevEnvironmentConflictMessage,
    getMcpToggleAction,
    getMcpRuntimeStatusDescription,
    getMcpRuntimeStatusTooltip,
    getAgentMcpProjectConfigDescription,
    getAgentMcpProjectConfigTooltip,
    isMcpToggleActionStale,
    shouldRefreshAgentAccessCenterAfterAction,
} from './agentAccessCenterModel';

export interface AgentAccessCenterOptions {
    isMcpRunning(): boolean;
    startMcp(): Promise<boolean>;
    stopMcp(): void;
    refreshMainMenu(): void;
}

export async function getCurrentAiMcpProjectConfigState() {
    await env.mapReady(false);
    if (!env.projectUri || !env.scriptUri) {
        return undefined;
    }
    const snapshot = getAgentSnapshot();
    const inspected = await inspectAiDevEnvironment(snapshot);
    const readText = async (filePath: string): Promise<string | undefined> => {
        try {
            const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
            return new TextDecoder().decode(bytes);
        } catch {
            return undefined;
        }
    };
    try {
        return readAiMcpProjectConfigState({
            codexConfigContent: await readText(inspected.plan.codexConfigPath),
            claudeMcpContent: await readText(inspected.plan.claudeMcpPath),
            claudeSettingsContent: await readText(inspected.plan.claudeSettingsPath),
        });
    } catch (error) {
        return {
            codexEnabled: false,
            claudeMcpEnabled: false,
            claudeSettingsEnabled: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

interface AgentAccessCenterQuickPickItem extends vscode.QuickPickItem {
    action: AgentAccessCenterAction;
}

function getAgentSnapshot() {
    return createAgentContextSnapshot({
        projectRoot: env.projectUri?.fsPath,
        mapRoot: env.mapUri?.fsPath,
        scriptRoot: env.scriptUri?.fsPath,
        y3Root: env.y3Uri?.fsPath,
        helperRoot: env.helperUri?.fsPath,
        currentMapName: env.currentMap?.name,
    });
}

async function ensureScriptUri(): Promise<vscode.Uri | undefined> {
    await env.mapReady(true);
    if (!env.scriptUri) {
        vscode.window.showErrorMessage(l10n.t('未找到 Y3 地图脚本目录，请先打开地图工程或地图 script 目录。'));
        return undefined;
    }
    return env.scriptUri;
}

async function ensureProjectAndScriptUri(): Promise<{ projectUri: vscode.Uri; scriptUri: vscode.Uri } | undefined> {
    const scriptUri = await ensureScriptUri();
    if (!scriptUri) {
        return undefined;
    }
    if (!env.projectUri) {
        vscode.window.showErrorMessage(l10n.t('未找到 Y3 地图工程根目录，请先打开地图工程。'));
        return undefined;
    }
    return {
        projectUri: env.projectUri,
        scriptUri,
    };
}

async function copyMcpConfig(): Promise<void> {
    await vscode.env.clipboard.writeText(createMcpClientConfigJson());
    vscode.window.showInformationMessage(l10n.t('已复制 Y3-Helper MCP 客户端配置'));
}

async function copyScriptPath(): Promise<void> {
    const scriptUri = await ensureScriptUri();
    if (!scriptUri) {
        return;
    }
    await vscode.env.clipboard.writeText(scriptUri.fsPath.replace(/\\/g, '/'));
    vscode.window.showInformationMessage(l10n.t('已复制地图脚本目录路径'));
}

async function openAgentsMarkdown(): Promise<void> {
    const scriptUri = await ensureScriptUri();
    if (!scriptUri) {
        return;
    }
    const agentsUri = vscode.Uri.joinPath(scriptUri, 'AGENTS.md');
    await vscode.commands.executeCommand('vscode.open', agentsUri);
}

async function generateAgentsMarkdown(): Promise<void> {
    const scriptUri = await ensureScriptUri();
    if (!scriptUri) {
        return;
    }

    const agentsUri = vscode.Uri.joinPath(scriptUri, 'AGENTS.md');
    let exists = false;
    try {
        await vscode.workspace.fs.stat(agentsUri);
        exists = true;
    } catch {}

    const action = exists ? l10n.t('覆盖 AGENTS.md') : l10n.t('生成 AGENTS.md');
    const message = exists
        ? l10n.t('地图脚本目录已存在 AGENTS.md。是否覆盖为 Y3-Helper Agent 接入指南？\n{0}', agentsUri.fsPath)
        : l10n.t('将在地图脚本目录生成 AGENTS.md，用于让外部 agent 了解 Y3-Helper MCP 接入方式。\n{0}', agentsUri.fsPath);
    const result = await vscode.window.showInformationMessage(message, { modal: true }, action);
    if (result !== action) {
        return;
    }

    const content = createScriptAgentsMarkdown(getAgentSnapshot());
    await vscode.workspace.fs.writeFile(agentsUri, new TextEncoder().encode(content));
    await vscode.commands.executeCommand('vscode.open', agentsUri);
    vscode.window.showInformationMessage(l10n.t('AGENTS.md 已生成到地图脚本目录'));
}

async function initializeAiDevEnvironment(refreshMainMenu: () => void): Promise<void> {
    const roots = await ensureProjectAndScriptUri();
    if (!roots) {
        return;
    }

    const skillSourceRoot = await resolveSkillSourceRoot();

    const snapshot = getAgentSnapshot();
    const input = {
        ...snapshot,
        skillSourceRoot,
    };
    let plan;
    let conflicts: string[];
    try {
        const inspected = await inspectAiDevEnvironment(input);
        plan = inspected.plan;
        conflicts = inspected.conflicts;
    } catch (error) {
        vscode.window.showErrorMessage(l10n.t('AI 开发环境检查失败：{0}', error instanceof Error ? error.message : String(error)));
        return;
    }
    if (conflicts.length > 0) {
        vscode.window.showWarningMessage(l10n.t(formatAiDevEnvironmentConflictMessage(conflicts)), { modal: true });
        return;
    }

    const action = l10n.t('初始化 / 修复');
    const skillNote = skillSourceRoot
        ? l10n.t('已找到 y3-kernel-navigator skill，本次会同步到 Codex/Claude。')
        : l10n.t('未找到 y3-kernel-navigator skill，本次会跳过 skill；后续补齐 Y3 库 skill 后可再次运行修复。');
    const result = await vscode.window.showInformationMessage(
        l10n.t('将为当前地图工程初始化 / 修复 Codex、Claude、AGENTS.md、skills 和三项 MCP 项目配置。\n{0}\n{1}', roots.projectUri.fsPath, skillNote),
        { modal: true },
        action,
    );
    if (result !== action) {
        return;
    }

    try {
        const applied = await applyAiDevEnvironment(input);
        const message = applied.skillStatus === 'synced'
            ? l10n.t('AI 开发环境已初始化 / 修复完成，skill 已同步。')
            : l10n.t('AI 开发环境已初始化 / 修复完成，未找到 y3-kernel-navigator skill，已跳过 skill 分项。');
        vscode.window.showInformationMessage(message);
        refreshMainMenu();
    } catch (error) {
        vscode.window.showErrorMessage(l10n.t('AI 开发环境初始化失败：{0}', error instanceof Error ? error.message : String(error)));
        return;
    }

    await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(plan.rootAgentsPath));
}

async function setAiMcpConfigEnabled(enabled: boolean, refreshMainMenu: () => void): Promise<void> {
    const roots = await ensureProjectAndScriptUri();
    if (!roots) {
        return;
    }

    const action = enabled ? l10n.t('启用') : l10n.t('禁用');
    const result = await vscode.window.showInformationMessage(
        l10n.t('{0} Codex / Claude / Y3-Helper 项目级三项 MCP 配置？\n{1}', action, roots.projectUri.fsPath),
        { modal: true },
        action,
    );
    if (result !== action) {
        return;
    }

    try {
        await setAiMcpProjectConfigEnabled({
            ...getAgentSnapshot(),
            skillSourceRoot: roots.projectUri.fsPath,
        }, enabled);
    } catch (error) {
        vscode.window.showErrorMessage(l10n.t('AI MCP 项目配置更新失败：{0}', error instanceof Error ? error.message : String(error)));
        return;
    }
    refreshMainMenu();
    vscode.window.showInformationMessage(enabled ? l10n.t('AI MCP 项目配置已启用') : l10n.t('AI MCP 项目配置已禁用'));
}

async function resolveSkillSourceRoot(): Promise<string | undefined> {
    const y3Uri = env.y3Uri;
    if (!y3Uri) {
        return undefined;
    }
    const skillUri = vscode.Uri.joinPath(y3Uri, '.codex', 'skills', 'y3-kernel-navigator');
    try {
        const stat = await vscode.workspace.fs.stat(skillUri);
        return stat.type === vscode.FileType.Directory ? skillUri.fsPath : undefined;
    } catch {
        return undefined;
    }
}

export function registerAgentAccessCenter(options: AgentAccessCenterOptions): vscode.Disposable[] {
    const openCommand = vscode.commands.registerCommand('y3-helper.openAgentAccessCenter', async () => {
        await env.mapReady(false);
        const mode = getMcpStartMode();
        const snapshot = getAgentSnapshot();
        const running = options.isMcpRunning();
        const status = l10n.t(getMcpRuntimeStatusDescription(running, mode));
        const scriptRoot = snapshot.scriptRoot ?? l10n.t('未识别');
        const mcpToggleAction = getMcpToggleAction(running);
        const projectConfigState = await getCurrentAiMcpProjectConfigState();
        const projectConfigStatus = l10n.t(getAgentMcpProjectConfigDescription(projectConfigState));

        const items: AgentAccessCenterQuickPickItem[] = [
            {
                label: l10n.t('$(info) 当前状态'),
                description: l10n.t('MCP Server: {0}, Agent 配置: {1}', status, projectConfigStatus),
                detail: l10n.t('启动模式: {0}\n脚本目录: {1}\n{2}', mode, scriptRoot, getAgentMcpProjectConfigTooltip(projectConfigState)),
                action: 'noop',
            },
            {
                label: l10n.t('$(copy) 复制 MCP 客户端配置'),
                description: l10n.t('y3-helper / y3editor / y3runtime'),
                action: 'copyMcpConfig',
            },
            {
                label: l10n.t('$(sparkle) 初始化 / 修复 AI 开发环境'),
                description: l10n.t('生成 Codex/Claude 规则、skills 和 MCP 项目配置'),
                action: 'initializeAiDevEnvironment',
            },
            {
                label: l10n.t('$(check) 启用 AI MCP 项目配置'),
                description: l10n.t('写入或启用 Codex/Claude/Y3-Helper 的三 MCP 配置'),
                action: 'enableAiMcpConfig',
            },
            {
                label: l10n.t('$(circle-slash) 禁用 AI MCP 项目配置'),
                description: l10n.t('保留配置文件，但禁用三项项目 MCP'),
                action: 'disableAiMcpConfig',
            },
            {
                label: l10n.t('$(file-add) 生成 AGENTS.md'),
                description: l10n.t('默认写入地图 script 目录'),
                action: 'generateAgentsMarkdown',
            },
            {
                label: l10n.t('$(go-to-file) 打开 AGENTS.md'),
                description: l10n.t('打开地图 script 目录中的 AGENTS.md'),
                action: 'openAgentsMarkdown',
            },
            {
                label: l10n.t('$(folder-opened) 复制地图脚本目录路径'),
                description: scriptRoot,
                action: 'copyScriptPath',
            },
            {
                label: running ? l10n.t('$(debug-stop) 停止 MCP Server') : l10n.t('$(debug-start) 启动 MCP Server'),
                description: running ? l10n.t('停止本地 8766 MCP 服务') : l10n.t('按当前配置启动本地 8766 MCP 服务'),
                detail: l10n.t(AGENT_CLIENT_MCP_REFRESH_NOTICE),
                action: mcpToggleAction,
            },
        ];

        const picked = await vscode.window.showQuickPick(items, {
            title: l10n.t('Y3-Helper Agent 接入中心'),
            placeHolder: l10n.t('选择要执行的 Agent 接入操作'),
        });
        if (!picked) {
            return;
        }

        if (isMcpToggleActionStale(picked.action, options.isMcpRunning())) {
            vscode.window.showInformationMessage(l10n.t('MCP Server 状态已变化，已刷新 Agent 接入中心。'));
            await vscode.commands.executeCommand('y3-helper.openAgentAccessCenter');
            return;
        }

        if (picked.action === 'noop') {
            return;
        }
        if (picked.action === 'copyMcpConfig') {
            await copyMcpConfig();
            return;
        }
        if (picked.action === 'initializeAiDevEnvironment') {
            await initializeAiDevEnvironment(options.refreshMainMenu);
            return;
        }
        if (picked.action === 'enableAiMcpConfig') {
            await setAiMcpConfigEnabled(true, options.refreshMainMenu);
            if (shouldRefreshAgentAccessCenterAfterAction(picked.action)) {
                await vscode.commands.executeCommand('y3-helper.openAgentAccessCenter');
            }
            return;
        }
        if (picked.action === 'disableAiMcpConfig') {
            await setAiMcpConfigEnabled(false, options.refreshMainMenu);
            if (shouldRefreshAgentAccessCenterAfterAction(picked.action)) {
                await vscode.commands.executeCommand('y3-helper.openAgentAccessCenter');
            }
            return;
        }
        if (picked.action === 'generateAgentsMarkdown') {
            await generateAgentsMarkdown();
            return;
        }
        if (picked.action === 'openAgentsMarkdown') {
            await openAgentsMarkdown();
            return;
        }
        if (picked.action === 'copyScriptPath') {
            await copyScriptPath();
            return;
        }
        if (picked.action === 'startMcp') {
            await options.startMcp();
            if (shouldRefreshAgentAccessCenterAfterAction(picked.action)) {
                await vscode.commands.executeCommand('y3-helper.openAgentAccessCenter');
            }
            return;
        }
        if (picked.action === 'stopMcp') {
            options.stopMcp();
            if (shouldRefreshAgentAccessCenterAfterAction(picked.action)) {
                await vscode.commands.executeCommand('y3-helper.openAgentAccessCenter');
            }
        }
    });

    const createAgentsCommand = vscode.commands.registerCommand('y3-helper.createAgentsMarkdown', generateAgentsMarkdown);
    const initializeAiDevEnvironmentCommand = vscode.commands.registerCommand(
        'y3-helper.initializeAiDevEnvironment',
        () => initializeAiDevEnvironment(options.refreshMainMenu),
    );
    const enableAiMcpConfigCommand = vscode.commands.registerCommand(
        'y3-helper.enableAiMcpConfig',
        () => setAiMcpConfigEnabled(true, options.refreshMainMenu),
    );
    const disableAiMcpConfigCommand = vscode.commands.registerCommand(
        'y3-helper.disableAiMcpConfig',
        () => setAiMcpConfigEnabled(false, options.refreshMainMenu),
    );
    return [
        openCommand,
        createAgentsCommand,
        initializeAiDevEnvironmentCommand,
        enableAiMcpConfigCommand,
        disableAiMcpConfigCommand,
    ];
}
