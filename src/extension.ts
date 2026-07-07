import moduleAlias from 'module-alias';
import * as path from 'path';

moduleAlias.addAliases({
    'y3-helper': __dirname + '/y3-helper'
});

import * as tools from "./tools";
import * as vscode from 'vscode';
import * as mainMenu from './mainMenu';

import { env } from './env';
import { runShell } from './runShell';
import { LuaDocMaker } from './makeLuaDoc';
import { GameLauncher } from './launchGame';
import { NetworkServer } from './networkServer';
import * as console from './console';
import * as metaBuilder from './metaBuilder';
import * as debug from './debug';
import { EditorLauncher } from './launchEditor';
import * as editorTable from './editorTable';
import * as plugin from './plugin';
import * as y3 from 'y3-helper';
import { config } from './config';
import * as globalScript from './globalScript';
import * as luaLanguage from './luaLanguage';
import * as ecaCompiler from './ecaCompiler';
import * as l10n from '@vscode/l10n';
import * as mcp from './mcp';
import { getMcpHub } from './codemaker/mcpHandlers';
import { registerAgentAccessCenter } from './agentAccessCenter';
import { canAutoStartMcp, getMcpStartMode } from './mcp/config';
import {
    makeY3LibraryCloneArgs,
    resolveY3LibraryRepoUrl,
    Y3_LUALIB_REPO_URL,
} from './y3LibrarySource';
import {
    isY3LibraryUsable,
    planProjectConfigCopy,
    PROJECT_CONFIG_RELATIVE_PATH,
    resolveY3LibraryState,
} from './y3ProjectInit';
import {
    SHARED_WORKSPACE_FILE,
    createSharedWorkspaceContent,
    execGit,
    getGitRepositoryRoot,
    getGitStatusPorcelain,
    isSameFileSystemPath,
    makeGitAddArgs,
    makeGitAddDryRunArgs,
    makeGitCommitArgs,
    makeGitInitArgs,
    mergeMapGitignore,
    planY3LibraryGitManagement,
    probeY3Submodule,
    readTextFileIfExists,
    toPosixRelativePath,
    writeTextFile,
    Y3GitManagementMode,
} from './mapGitProject';

class Helper {
    private context: vscode.ExtensionContext;
    private tcpServer?: mcp.TCPServer;
    private autoStartMCPTask?: Promise<void>;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    private reloadEnvWhenConfigChange() {
        vscode.workspace.onDidChangeConfiguration(async (event) => {
            if (event.affectsConfiguration('Y3-Helper.EditorPath')) {
                tools.log.info(l10n.t('配置已更新，已重新加载环境'));
                await env.updateEditor();
            }
            if (event.affectsConfiguration('Y3-Helper.MCP.StartMode')) {
                if (getMcpStartMode() === 'off') {
                    this.stopTCPServer();
                } else {
                    void this.tryAutoStartMCP();
                }
            }
        });
    }

    private registerCommonCommands() {
        vscode.commands.registerCommand('y3-helper.selectAnotherMap', async () => {
            await env.updateMap(false, true);
            if (!vscode.workspace.workspaceFolders?.some((folder) => folder.uri.fsPath === env.projectUri?.fsPath)) {
                vscode.commands.executeCommand('vscode.openFolder', env.projectUri);
            }
        });
        vscode.commands.registerCommand('y3-helper.shell', async (...args: any[]) => {
            runShell(l10n.t("执行命令"), args[0], args.slice(1));
        });
    }

    private registerCommandOfNetworkServer() {
        let server: NetworkServer | undefined;
        vscode.commands.registerCommand('y3-helper.networkServer', async () => {
            server?.dispose();
            server = new NetworkServer(25895, 25896);
        });
    }

    private registerCommandOfInitProject() {
        let running = false;
        vscode.commands.registerCommand('y3-helper.initProject', async () => {
            if (running) {
                return;
            }
            running = true;
            try {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: l10n.t('正在初始化Y3项目...'),
                }, async () => {
                    await this.initY3LibraryProject();
                });
            } finally {
                running = false;
            }
        });
    }

    private async initY3LibraryProject() {
        await env.mapReady(true);
        if (!env.scriptUri || !env.y3Uri) {
            vscode.window.showErrorMessage(l10n.t('未找到Y3地图路径，请先用编辑器创建地图或重新指定！'));
            return;
        }

        const scriptUri = env.scriptUri;
        const y3Uri = env.y3Uri;
        let state = await resolveY3LibraryState(y3Uri.fsPath);

        if (state.kind === 'invalid') {
            vscode.window.showErrorMessage(l10n.t('Y3 库目录不可用：{0}。请手动处理后重试。', state.reason));
            return;
        }

        if (state.kind === 'missing') {
            const installed = await this.installY3Library(y3Uri);
            if (!installed) {
                return;
            }
            state = await resolveY3LibraryState(y3Uri.fsPath);
            if (state.kind === 'invalid' || state.kind === 'missing') {
                const reason = state.kind === 'invalid' ? state.reason : l10n.t('未找到 Y3 库目录');
                vscode.window.showErrorMessage(l10n.t('Y3 库安装后仍不可用：{0}', reason));
                return;
            }
        }

        const configInitialized = await this.initializeY3ProjectConfig(scriptUri, y3Uri);
        if (!configInitialized) {
            return;
        }
        await this.context.globalState.update("NewProjectPath", scriptUri.fsPath);
        await vscode.commands.executeCommand('vscode.openFolder', env.projectUri);
        this.checkNewProject();
        mainMenu.init();
    }

    private async installY3Library(y3Uri: vscode.Uri): Promise<boolean> {
        const useDefault = l10n.t('使用默认仓库');
        const useCustom = l10n.t('输入自定义仓库');
        const choice = await vscode.window.showInformationMessage(
            l10n.t('当前地图脚本目录尚未安装 Y3 库。请选择安装来源。'),
            { modal: true },
            useDefault,
            useCustom,
        );
        if (!choice) {
            return false;
        }

        const customInput = choice === useCustom
            ? await vscode.window.showInputBox({
                prompt: l10n.t('请输入 Y3 库 Git 仓库地址'),
                placeHolder: Y3_LUALIB_REPO_URL,
                ignoreFocusOut: true,
            })
            : undefined;
        if (choice === useCustom && customInput === undefined) {
            return false;
        }

        const repo = resolveY3LibraryRepoUrl(customInput);
        if (!repo.ok) {
            vscode.window.showErrorMessage(repo.message);
            return false;
        }

        const exitCode = await runShell(
            l10n.t("安装Y3库"),
            "git",
            makeY3LibraryCloneArgs(repo.url, y3Uri.fsPath),
        );
        if (exitCode !== 0) {
            vscode.window.showWarningMessage(l10n.t('Y3 库仓库拉取失败！'));
            return false;
        }
        return true;
    }

    private async initializeY3ProjectConfig(scriptUri: vscode.Uri, y3Uri: vscode.Uri): Promise<boolean> {
        const sourcePath = vscode.Uri.joinPath(y3Uri, ...PROJECT_CONFIG_RELATIVE_PATH.split('/')).fsPath;
        const plan = await planProjectConfigCopy(sourcePath, scriptUri.fsPath, { overwrite: false });
        if (plan.conflicts.length > 0) {
            const overwrite = l10n.t('覆盖已有配置');
            const skip = l10n.t('保留已有配置');
            const conflictPreview = plan.conflicts.map(item => item.relativePath).join('\n');
            const choice = await vscode.window.showWarningMessage(
                l10n.t('以下配置文件已存在：\n{0}\n是否覆盖？', conflictPreview),
                { modal: true },
                skip,
                overwrite,
            );
            if (!choice) {
                return false;
            }
            if (choice === overwrite) {
                const copied = await this.copyY3ProjectConfig(scriptUri, y3Uri, true);
                if (!copied) {
                    return false;
                }
                return true;
            }
        }

        return this.copyY3ProjectConfig(scriptUri, y3Uri, false);
    }

    private async copyY3ProjectConfig(scriptUri: vscode.Uri, y3Uri: vscode.Uri, overwrite: boolean): Promise<boolean> {
        try {
            await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(scriptUri, '.log'));
            if (env.globalScriptUri) {
                await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(env.globalScriptUri, '.log'));
            }

            const sourcePath = vscode.Uri.joinPath(y3Uri, ...PROJECT_CONFIG_RELATIVE_PATH.split('/')).fsPath;
            const plan = await planProjectConfigCopy(sourcePath, scriptUri.fsPath, { overwrite });
            for (const item of plan.copyItems) {
                await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(item.targetPath)));
                await vscode.workspace.fs.copy(
                    vscode.Uri.file(item.sourcePath),
                    vscode.Uri.file(item.targetPath),
                    { overwrite },
                );
            }
            return true;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(l10n.t('初始化项目配置失败：{0}', message));
            return false;
        }
    }

    private registerCommandOfInitMapGitProject() {
        let running = false;
        vscode.commands.registerCommand('y3-helper.initMapGitProject', async () => {
            if (running) {
                return;
            }
            running = true;
            try {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: l10n.t('正在初始化地图工程版本管理...'),
                    cancellable: false,
                }, async () => {
                    await this.initMapGitProject();
                });
            } finally {
                running = false;
            }
        });
    }

    private async initMapGitProject() {
        await env.mapReady(true);
        const projectUri = env.projectUri;
        const targetMap = env.currentMap ?? env.project?.entryMap;
        if (!projectUri || !targetMap) {
            vscode.window.showErrorMessage(l10n.t('未找到Y3地图工程，请先用编辑器创建地图或重新指定！'));
            return;
        }

        if (!await y3.fs.isExists(vscode.Uri.joinPath(projectUri, 'header.project'))) {
            vscode.window.showErrorMessage(l10n.t('当前目录不是有效的Y3地图工程：缺少 header.project'));
            return;
        }

        const projectRoot = projectUri.fsPath;
        const scriptRelativePath = toPosixRelativePath(`maps/${targetMap.name}/script`);
        const y3RelativePath = `${scriptRelativePath}/y3`;
        const y3Path = vscode.Uri.joinPath(projectUri, ...y3RelativePath.split('/')).fsPath;

        const gitRoot = await getGitRepositoryRoot(projectRoot);
        if (gitRoot && !isSameFileSystemPath(gitRoot, projectRoot)) {
            vscode.window.showErrorMessage(l10n.t(
                '当前地图工程位于另一个 Git 仓库内：{0}。请在地图工程根目录单独初始化版本管理后再继续。',
                gitRoot,
            ));
            return;
        }

        if (!gitRoot) {
            const ok = l10n.t('初始化 Git 仓库');
            const res = await vscode.window.showWarningMessage(
                l10n.t('地图工程尚未启用 Git。是否在工程根目录初始化 Git 仓库？\n{0}', projectRoot),
                { modal: true },
                ok,
            );
            if (res !== ok) {
                return;
            }
            const initResult = await execGit(makeGitInitArgs(), projectRoot);
            if (initResult.exitCode !== 0) {
                vscode.window.showErrorMessage(l10n.t('Git 初始化失败：{0}', initResult.stderr || initResult.stdout));
                return;
            }
        } else {
            const status = await getGitStatusPorcelain(projectRoot);
            if (status === undefined) {
                vscode.window.showErrorMessage(l10n.t('读取地图工程 Git 状态失败，请手动检查后重试。'));
                return;
            }
            if (status.trim().length > 0) {
                vscode.window.showErrorMessage(l10n.t('地图工程已存在未提交改动，请先提交或清理后再初始化版本管理。'));
                return;
            }
        }

        const gitignoreUri = vscode.Uri.joinPath(projectUri, '.gitignore');
        const existingGitignore = await readTextFileIfExists(gitignoreUri.fsPath);
        const mergedGitignore = mergeMapGitignore(existingGitignore);
        if (mergedGitignore !== (existingGitignore ?? '')) {
            const ok = l10n.t('写入 .gitignore');
            const res = await vscode.window.showInformationMessage(
                l10n.t('将写入地图工程推荐的 .gitignore 规则，用于排除日志、锁、缓存和个人工作区。'),
                { modal: true },
                ok,
            );
            if (res !== ok) {
                return;
            }
            await writeTextFile(gitignoreUri.fsPath, mergedGitignore);
        }

        const unmanagedY3Paths = await this.configureY3LibraryGitManagement(projectRoot, y3Path, y3RelativePath);
        if (unmanagedY3Paths === undefined) {
            return;
        }

        const workspaceUri = vscode.Uri.joinPath(projectUri, SHARED_WORKSPACE_FILE);
        const workspaceText = createSharedWorkspaceContent(scriptRelativePath);
        const existingWorkspace = await readTextFileIfExists(workspaceUri.fsPath);
        if (existingWorkspace !== workspaceText) {
            if (existingWorkspace !== undefined) {
                const open = l10n.t('打开现有文件');
                const overwrite = l10n.t('覆盖');
                const res = await vscode.window.showWarningMessage(
                    l10n.t('{0} 已存在，是否覆盖为推荐的团队共享工作区？', SHARED_WORKSPACE_FILE),
                    { modal: true },
                    open,
                    overwrite,
                );
                if (res === open) {
                    await vscode.commands.executeCommand('vscode.open', workspaceUri);
                    return;
                }
                if (res !== overwrite) {
                    return;
                }
            } else {
                const ok = l10n.t('生成工作区文件');
                const res = await vscode.window.showInformationMessage(
                    l10n.t('将生成团队共享工作区文件 {0}，只包含相对路径。', SHARED_WORKSPACE_FILE),
                    { modal: true },
                    ok,
                );
                if (res !== ok) {
                    return;
                }
            }
            await writeTextFile(workspaceUri.fsPath, workspaceText);
        }

        const dryRun = await execGit(makeGitAddDryRunArgs(unmanagedY3Paths), projectRoot);
        if (dryRun.exitCode !== 0) {
            vscode.window.showErrorMessage(l10n.t('Git 暂存预览失败：{0}', dryRun.stderr || dryRun.stdout));
            return;
        }
        const preview = dryRun.stdout || l10n.t('没有需要暂存的文件');
        const add = l10n.t('确认暂存');
        const previewResult = await vscode.window.showInformationMessage(
            l10n.t('即将纳入版本管理的文件预览：\n{0}', preview),
            { modal: true },
            add,
        );
        if (previewResult !== add) {
            return;
        }

        const addResult = await execGit(makeGitAddArgs(unmanagedY3Paths), projectRoot);
        if (addResult.exitCode !== 0) {
            vscode.window.showErrorMessage(l10n.t('Git 暂存失败：{0}', addResult.stderr || addResult.stdout));
            return;
        }

        const commit = l10n.t('创建提交');
        const commitResult = await vscode.window.showInformationMessage(
            l10n.t('地图工程版本管理初始化内容已暂存。是否创建首次提交？'),
            { modal: true },
            commit,
            l10n.t('稍后手动提交'),
        );
        if (commitResult === commit) {
            const result = await execGit(makeGitCommitArgs('chore: 初始化地图工程版本管理'), projectRoot);
            if (result.exitCode !== 0) {
                vscode.window.showErrorMessage(l10n.t('Git 提交失败：{0}', result.stderr || result.stdout));
                return;
            }
        }

        vscode.window.showInformationMessage(l10n.t('地图工程版本管理初始化完成'));
        mainMenu.refresh();
    }

    private async configureY3LibraryGitManagement(
        projectRoot: string,
        y3Path: string,
        y3RelativePath: string,
    ): Promise<string[] | undefined> {
        const probe = await probeY3Submodule(projectRoot, y3Path, y3RelativePath);
        const selection = await this.chooseY3LibraryGitManagementMode(probe);
        if (!selection) {
            return undefined;
        }

        const plan = planY3LibraryGitManagement({
            mode: selection.mode,
            state: probe,
            repoUrl: selection.repoUrl,
            relativePath: y3RelativePath,
        });

        if (plan.kind === 'blocked') {
            vscode.window.showErrorMessage(plan.message);
            return undefined;
        }

        if (plan.kind === 'run-git') {
            for (const gitArgs of plan.gitArgs) {
                const result = await execGit(gitArgs, projectRoot, 120_000);
                if (result.exitCode !== 0) {
                    vscode.window.showErrorMessage(l10n.t('配置 Y3 库 Git 管理失败：{0}', result.stderr || result.stdout));
                    return undefined;
                }
            }
        }

        if (plan.kind === 'skip' || plan.kind === 'keep-independent-git') {
            return [y3RelativePath];
        }
        return [];
    }

    private async chooseY3LibraryGitManagementMode(probe: Awaited<ReturnType<typeof probeY3Submodule>>): Promise<{
        mode: Y3GitManagementMode;
        repoUrl: string;
    } | undefined> {
        const skip = l10n.t('不管理 Y3 库');
        const trackPlain = l10n.t('作为普通目录纳入工程 Git');
        const submoduleDefault = l10n.t('作为子模块：默认仓库');
        const submoduleCustom = l10n.t('作为子模块：自定义仓库');
        const keepIndependent = l10n.t('保留独立 Git 仓库');
        const existingSubmodule = l10n.t('继续使用已有子模块');

        const choices: string[] = [skip];
        if (probe.submoduleStatusLine !== undefined) {
            choices.push(existingSubmodule);
        } else {
            if (probe.exists && probe.isGitWorkTree === false) {
                choices.push(trackPlain);
            }
            choices.push(submoduleDefault, submoduleCustom);
            if (probe.exists && probe.isGitWorkTree) {
                choices.push(keepIndependent);
            }
        }

        const choice = await vscode.window.showInformationMessage(
            l10n.t('请选择地图工程 Git 如何处理 Y3 库。'),
            { modal: true },
            ...choices,
        );
        if (!choice) {
            return undefined;
        }

        if (choice === skip) {
            return { mode: 'skip', repoUrl: Y3_LUALIB_REPO_URL };
        }
        if (choice === trackPlain) {
            return { mode: 'track-plain-directory', repoUrl: Y3_LUALIB_REPO_URL };
        }
        if (choice === keepIndependent) {
            return { mode: 'keep-independent-git', repoUrl: Y3_LUALIB_REPO_URL };
        }
        if (choice === existingSubmodule) {
            return { mode: 'existing-submodule', repoUrl: Y3_LUALIB_REPO_URL };
        }
        if (choice === submoduleCustom) {
            const input = await vscode.window.showInputBox({
                prompt: l10n.t('请输入用于 Y3 库子模块的 Git 仓库地址'),
                placeHolder: Y3_LUALIB_REPO_URL,
                ignoreFocusOut: true,
            });
            if (input === undefined) {
                return undefined;
            }
            const repo = resolveY3LibraryRepoUrl(input);
            if (!repo.ok) {
                vscode.window.showErrorMessage(repo.message);
                return undefined;
            }
            return { mode: 'submodule', repoUrl: repo.url };
        }

        return { mode: 'submodule', repoUrl: Y3_LUALIB_REPO_URL };
    }

    private registerCommandOfMakeLuaDoc() {
        vscode.commands.registerCommand('y3-helper.makeLuaDoc', async () => {
            await vscode.window.withProgress({
                title: l10n.t('正在生成文档...'),
                location: vscode.ProgressLocation.Window,
            }, async (progress) => {
                let luaDocMaker = new LuaDocMaker(this.context);
                await luaDocMaker.make();
            });
        });
    }

    private registerCommandOfLaunchGame() {
        vscode.commands.registerCommand('y3-helper.launchGame', async () => {
            let luaArgs: Record<string, string> = {};

            if (config.tracy) {
                luaArgs['lua_tracy'] = 'true';
            }

            if (config.attachWhenLaunch) {
                if (config.multiMode) {
                    luaArgs['lua_multi_mode'] = 'true';
                    luaArgs['lua_multi_wait_debugger'] = 'true';
                    luaArgs['lua_multi_debug_players'] = config.debugPlayers.sort().join('#');
                    if (config.multiPlayers.length === 0) {
                        vscode.window.showErrorMessage(l10n.t('请至少选择一个玩家才能启动游戏！'));
                        return;
                    }
                } else {
                    luaArgs['lua_wait_debugger'] = 'true';
                }
            }

            await vscode.window.withProgress({
                title: l10n.t('正在启动游戏...'),
                location: vscode.ProgressLocation.Window,
            }, async (progress) => {
                let gameLauncher = new GameLauncher();

                let suc = await gameLauncher.launch({
                    luaArgs: luaArgs,
                    multi: config.multiMode ? config.multiPlayers.sort() : undefined,
                    tracy: config.tracy,
                });

                if (!suc) {
                    return;
                }

                if (config.attachWhenLaunch) {
                    await debug.attach();
                }
            });
        });
    }

    private registerCommandOfLaunchEditor() {
        vscode.commands.registerCommand('y3-helper.launchEditor', async () => {
            await vscode.window.withProgress({
                title: l10n.t('正在启动编辑器...'),
                location: vscode.ProgressLocation.Window,
            }, async (progress) => {
                let editorLauncher = new EditorLauncher();
                await editorLauncher.launch();
            });
        });
    }

    private registerCommandOfAttach() {
        vscode.commands.registerCommand('y3-helper.attach', async () => {
            await debug.attach();
        });
    }

    private async startTCPServer(silent: boolean = false): Promise<boolean> {
        try {
            this.tcpServer = new mcp.TCPServer();
            const started = await this.tcpServer.start();
            if (!started) {
                this.tcpServer.dispose();
                this.tcpServer = undefined;
                tools.log.warn('[Y3-Helper] MCP HTTP server did not bind to port 8766');
                if (!silent) {
                    vscode.window.showWarningMessage(l10n.t('MCP Server 端口 8766 已被占用，当前实例未启动'));
                }
                return false;
            }
            tools.log.info('[Y3-Helper] MCP Server started');
            // TCPServer 就绪后再启动 McpHub，避免 McpHub 连接 y3-helper:8766 时端口尚未监听
            // 确保 McpHub 已启动（注册文件监听 + 初始化 MCP servers）
            const hub = getMcpHub();
            if (hub) {
                await hub.start();
            }
            return true;
        } catch (error) {
            tools.log.error('[Y3-Helper] Failed to start MCP Server:', error);
            if (!silent) {
                vscode.window.showErrorMessage(l10n.t('启动 MCP Server 失败'));
            }
            return false;
        }
    }

    private stopTCPServer() {
        if (this.tcpServer) {
            this.tcpServer.dispose();
            this.tcpServer = undefined;
            tools.log.info('[Y3-Helper] TCP Server stopped');
        }
    }

    private async tryAutoStartMCP() {
        if (this.tcpServer || this.autoStartMCPTask) {
            return;
        }
        if (getMcpStartMode() !== 'auto') {
            return;
        }

        this.autoStartMCPTask = (async () => {
            try {
                await env.mapReady();
                const initialized = await this.isY3Initialized();
                if (!canAutoStartMcp(getMcpStartMode(), this.tcpServer !== undefined, initialized)) {
                    return;
                }
                await this.runStartupStep('startMCPServer', () => this.startTCPServer(true));
            } catch (error) {
                this.logStartupError('tryAutoStartMCP', error);
            }
        })();

        try {
            await this.autoStartMCPTask;
        } finally {
            this.autoStartMCPTask = undefined;
        }
    }

    private async hasUsableY3Library(y3Uri?: vscode.Uri): Promise<boolean> {
        if (!y3Uri) {
            return false;
        }
        return isY3LibraryUsable(y3Uri.fsPath);
    }

    /**
     * 检查 Y3 库内容是否可用。
     * 用于 MCP Server 自动启动守卫：未准备好 Y3 库的地图不应自动启动 MCP。
     * 启用全局脚本后，仓库可能位于 global_script/y3。
     */
    private async isY3Initialized(): Promise<boolean> {
        if (await this.hasUsableY3Library(env.y3Uri)) {
            return true;
        }
        return this.hasUsableY3Library(
            env.globalScriptUri ? vscode.Uri.joinPath(env.globalScriptUri, 'y3') : undefined
        );
    }

    private registerCommandOfMCP() {
        vscode.commands.registerCommand('y3-helper.startMCPServer', async () => {
            if (getMcpStartMode() === 'off') {
                vscode.window.showInformationMessage(l10n.t('MCP Server 已在设置中关闭'));
                return;
            }
            if (this.tcpServer) {
                vscode.window.showInformationMessage(l10n.t('MCP Server 已经在运行'));
                return;
            }
            if (await this.startTCPServer()) {
                vscode.window.showInformationMessage(l10n.t('MCP Server 已启动'));
            }
        });

        vscode.commands.registerCommand('y3-helper.stopMCPServer', () => {
            if (!this.tcpServer) {
                vscode.window.showInformationMessage(l10n.t('MCP Server 未运行'));
                return;
            }
            this.stopTCPServer();
            vscode.window.showInformationMessage(l10n.t('MCP Server 已停止'));
        });
    }

    private registerCommandOfAgentAccessCenter() {
        const disposables = registerAgentAccessCenter({
            isMcpRunning: () => this.tcpServer !== undefined,
            startMcp: async () => {
                if (getMcpStartMode() === 'off') {
                    vscode.window.showInformationMessage(l10n.t('MCP Server 已在设置中关闭'));
                    return false;
                }
                if (this.tcpServer) {
                    vscode.window.showInformationMessage(l10n.t('MCP Server 已经在运行'));
                    return true;
                }
                const started = await this.startTCPServer();
                if (started) {
                    vscode.window.showInformationMessage(l10n.t('MCP Server 已启动'));
                }
                return started;
            },
            stopMcp: () => {
                if (!this.tcpServer) {
                    vscode.window.showInformationMessage(l10n.t('MCP Server 未运行'));
                    return;
                }
                this.stopTCPServer();
                vscode.window.showInformationMessage(l10n.t('MCP Server 已停止'));
            },
        });
        this.context.subscriptions.push(...disposables);
    }

    private checkNewProject() {
        let newProjectPath = this.context.globalState.get("NewProjectPath");
        if (!newProjectPath) {
            return;
        };
        if (!vscode.workspace.workspaceFolders) {
            return;
        };
        let workspaceUri = vscode.workspace.workspaceFolders[0].uri;
        if (!workspaceUri) {
            return ;
        };
        if (this.context.globalState.get("NewProjectPath") === workspaceUri.fsPath) {
            this.context.globalState.update("NewProjectPath", undefined);
            new Promise(async () => {
                await vscode.commands.executeCommand(
                    'vscode.open',
                    vscode.Uri.joinPath(workspaceUri, 'main.lua'),
                );
                vscode.window.showInformationMessage(l10n.t("欢迎使用Y3编辑器！"));
            });
        };
    }

    private logStartupError(step: string, error: unknown) {
        tools.log.error(`[Y3-Helper] Startup step failed: ${step}`, error);
    }

    private async runStartupStep(step: string, action: () => Promise<unknown> | unknown): Promise<void> {
        try {
            await action();
        } catch (error) {
            this.logStartupError(step, error);
        }
    }

    public start() {
        this.registerCommandOfInitProject();
        this.registerCommandOfInitMapGitProject();
        this.registerCommandOfMakeLuaDoc();
        this.registerCommandOfLaunchGame();
        this.registerCommandOfAttach();
        this.registerCommandOfLaunchEditor();
        this.registerCommandOfMCP();
        this.registerCommandOfAgentAccessCenter();

        this.reloadEnvWhenConfigChange();

        this.registerCommandOfNetworkServer();
        this.registerCommonCommands();

        // 项目切换时自动清理 MCP 连接缓存并重新初始化
        vscode.workspace.onDidChangeWorkspaceFolders(async () => {
            const hub = getMcpHub();
            if (hub) {
                try {
                    await hub.resetConnections();
                } catch (error) {
                    tools.log.error('[Y3-Helper] Failed to reset MCP connections after workspace change', error);
                }
            }
        });

        env.onDidChange(() => {
            void this.tryAutoStartMCP();
        });

        setTimeout(async () => {
            await this.runStartupStep('checkNewProject', () => this.checkNewProject());
            await this.runStartupStep('mainMenu.init', () => mainMenu.init());

            // 本地 VSIX 分支不再自动 clone、迁移或更新 y3-maker-config。
            (async () => {
                try {
                    await env.mapReady();
                    if (!env.project) {
                        return;
                    }
                    mainMenu.refresh();
                } catch {
                    // 静默跳过
                }

                // 仅在 Y3 仓库已初始化后才自动启动 MCP Server（静默模式）
                await this.tryAutoStartMCP();
            })();

            await this.runStartupStep('metaBuilder.init', () => metaBuilder.init());
            await this.runStartupStep('debug.init', () => debug.init(this.context));
            await this.runStartupStep('console.init', () => console.init());
            await this.runStartupStep('editorTable.init', () => editorTable.init());
            await this.runStartupStep('plugin.init', () => plugin.init());
            await this.runStartupStep('globalScript.init', () => globalScript.init());
            await this.runStartupStep('luaLanguage.init', () => luaLanguage.init());
            await this.runStartupStep('ecaCompiler.init', () => ecaCompiler.init());
            await this.runStartupStep('y3.version.init', () => y3.version.init());
        }, 100);
    }
}

export async function activate(context: vscode.ExtensionContext) {
    let osLocale = await import('os-locale');
    y3.setContext(context);
    let language = vscode.workspace.getConfiguration('Y3-Helper').get('Language');
    if (language === 'default') {
        // VSCode的语言或系统语言任意一个是中文，则使用中文
        if (vscode.env.language === 'zh-cn' || await osLocale.osLocale() === 'zh-CN') {
            language = 'zh-cn';
        } else {
            language = 'en';
        }
    }
    env.language = language as any;
    if (language !== 'zh-cn') {
        await l10n.config({
            uri: y3.uri(context.extensionUri, 'l10n/bundle.l10n.json').toString(),
        });
    }
    let helper = new Helper(context);

    helper.start();

}

export function deactivate() {
}
