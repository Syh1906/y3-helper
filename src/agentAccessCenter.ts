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
} from './aiDevEnvironment';
import {
    createAgentContextSnapshot,
    createMcpClientConfigJson,
} from './mcp/agentContext';
import { getMcpStartMode } from './mcp/config';
import { getMcpHub } from './codemaker/mcpHandlers';

export interface AgentAccessCenterOptions {
    isMcpRunning(): boolean;
    startMcp(): Promise<boolean>;
    stopMcp(): void;
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

async function initializeAiDevEnvironment(): Promise<void> {
    const roots = await ensureProjectAndScriptUri();
    if (!roots) {
        return;
    }

    const skillSourceRoot = await resolveSkillSourceRoot();

    const snapshot = getAgentSnapshot();
    const input = {
        ...snapshot,
        skillSourceRoot,
        y3MakerConfigRoot: getWorkspaceRootForMcpHub(),
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
        const detail = conflicts.map((item) => item.replace(/\\/g, '/')).join('\n');
        vscode.window.showWarningMessage(l10n.t('AI 开发环境初始化发现用户自定义文件，已停止以避免覆盖：\n{0}', detail), { modal: true });
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
        await getMcpHub()?.restartAllConnections();
        vscode.window.showInformationMessage(message);
    } catch (error) {
        vscode.window.showErrorMessage(l10n.t('AI 开发环境初始化失败：{0}', error instanceof Error ? error.message : String(error)));
        return;
    }

    await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(plan.rootAgentsPath));
}

async function setAiMcpConfigEnabled(enabled: boolean): Promise<void> {
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
            y3MakerConfigRoot: getWorkspaceRootForMcpHub(),
        }, enabled);
        await getMcpHub()?.restartAllConnections();
    } catch (error) {
        vscode.window.showErrorMessage(l10n.t('AI MCP 项目配置更新失败：{0}', error instanceof Error ? error.message : String(error)));
        return;
    }
    vscode.window.showInformationMessage(enabled ? l10n.t('AI MCP 项目配置已启用') : l10n.t('AI MCP 项目配置已禁用'));
}

function getWorkspaceRootForMcpHub(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
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
        const status = running ? l10n.t('运行中') : l10n.t('未运行');
        const scriptRoot = snapshot.scriptRoot ?? l10n.t('未识别');

        const items: vscode.QuickPickItem[] = [
            {
                label: l10n.t('$(info) 当前状态'),
                description: l10n.t('MCP: {0}, 启动模式: {1}', status, mode),
                detail: l10n.t('脚本目录: {0}', scriptRoot),
            },
            {
                label: l10n.t('$(copy) 复制 MCP 客户端配置'),
                description: l10n.t('y3-helper / y3editor / y3runtime'),
            },
            {
                label: l10n.t('$(sparkle) 初始化 / 修复 AI 开发环境'),
                description: l10n.t('生成 Codex/Claude 规则、skills 和 MCP 项目配置'),
            },
            {
                label: l10n.t('$(check) 启用 AI MCP 项目配置'),
                description: l10n.t('写入或启用 Codex/Claude/Y3-Helper 的三 MCP 配置'),
            },
            {
                label: l10n.t('$(circle-slash) 禁用 AI MCP 项目配置'),
                description: l10n.t('保留配置文件，但禁用三项项目 MCP'),
            },
            {
                label: l10n.t('$(file-add) 生成 AGENTS.md'),
                description: l10n.t('默认写入地图 script 目录'),
            },
            {
                label: l10n.t('$(go-to-file) 打开 AGENTS.md'),
                description: l10n.t('打开地图 script 目录中的 AGENTS.md'),
            },
            {
                label: l10n.t('$(folder-opened) 复制地图脚本目录路径'),
                description: scriptRoot,
            },
            {
                label: running ? l10n.t('$(debug-stop) 停止 MCP Server') : l10n.t('$(debug-start) 启动 MCP Server'),
                description: running ? l10n.t('停止本地 8766 MCP 服务') : l10n.t('按当前配置启动本地 8766 MCP 服务'),
            },
        ];

        const picked = await vscode.window.showQuickPick(items, {
            title: l10n.t('Y3-Helper Agent 接入中心'),
            placeHolder: l10n.t('选择要执行的 Agent 接入操作'),
        });
        if (!picked) {
            return;
        }

        if (picked.label.includes(l10n.t('复制 MCP 客户端配置'))) {
            await copyMcpConfig();
            return;
        }
        if (picked.label.includes(l10n.t('初始化 / 修复 AI 开发环境'))) {
            await initializeAiDevEnvironment();
            return;
        }
        if (picked.label.includes(l10n.t('启用 AI MCP 项目配置'))) {
            await setAiMcpConfigEnabled(true);
            return;
        }
        if (picked.label.includes(l10n.t('禁用 AI MCP 项目配置'))) {
            await setAiMcpConfigEnabled(false);
            return;
        }
        if (picked.label.includes(l10n.t('生成 AGENTS.md'))) {
            await generateAgentsMarkdown();
            return;
        }
        if (picked.label.includes(l10n.t('打开 AGENTS.md'))) {
            await openAgentsMarkdown();
            return;
        }
        if (picked.label.includes(l10n.t('复制地图脚本目录路径'))) {
            await copyScriptPath();
            return;
        }
        if (picked.label.includes(l10n.t('启动 MCP Server'))) {
            await options.startMcp();
            return;
        }
        if (picked.label.includes(l10n.t('停止 MCP Server'))) {
            options.stopMcp();
        }
    });

    const createAgentsCommand = vscode.commands.registerCommand('y3-helper.createAgentsMarkdown', generateAgentsMarkdown);
    const initializeAiDevEnvironmentCommand = vscode.commands.registerCommand('y3-helper.initializeAiDevEnvironment', initializeAiDevEnvironment);
    return [openCommand, createAgentsCommand, initializeAiDevEnvironmentCommand];
}
