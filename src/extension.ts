import moduleAlias from 'module-alias';

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
import { initCodeMaker, stopCodeMaker } from './codemaker';
import { Y3_LUALIB_REPO_URL } from './y3LibrarySource';
import {
    SHARED_WORKSPACE_FILE,
    classifyY3SubmoduleState,
    createSharedWorkspaceContent,
    execGit,
    getGitRepositoryRoot,
    getGitStatusPorcelain,
    isSameFileSystemPath,
    makeGitAddArgs,
    makeGitAddDryRunArgs,
    makeGitCommitArgs,
    makeGitInitArgs,
    makeSubmoduleAbsorbGitDirsArgs,
    makeSubmoduleAddArgs,
    makeSubmoduleAddExistingArgs,
    makeSubmoduleUpdateInitArgs,
    mergeMapGitignore,
    probeY3Submodule,
    readTextFileIfExists,
    toPosixRelativePath,
    writeTextFile,
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
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: l10n.t('正在初始化Y3项目...'),
            }, async (progress, token) => {
                await env.mapReady(true);
                if (!env.scriptUri) {
                    vscode.window.showErrorMessage(l10n.t('未找到Y3地图路径，请先用编辑器创建地图或重新指定！'));
                    return;
                };

                let scriptUri = env.scriptUri!;
                let y3Uri = env.y3Uri!;

                try {
                    if ((await vscode.workspace.fs.stat(vscode.Uri.joinPath(y3Uri, '.git'))).type === vscode.FileType.Directory) {
                        vscode.window.showErrorMessage(l10n.t('此项目已经初始化过了！'));
                        return;
                    }
                } catch {}

                try {
                    let state = await vscode.workspace.fs.stat(y3Uri);
                    if (state.type === vscode.FileType.Directory) {
                        // 直接删除这个目录
                        try {
                            await vscode.workspace.fs.delete(y3Uri, {
                                recursive: true,
                                useTrash: true,
                            });
                            vscode.window.showInformationMessage(l10n.t('已将原有的 {0} 目录移至回收站', y3Uri.fsPath));
                        } catch (error) {
                            vscode.window.showErrorMessage(l10n.t('{0} 已被占用，请手动删除它！', y3Uri.fsPath));
                            return;
                        }
                    } else {
                        vscode.window.showErrorMessage(l10n.t('{0} 已被占用，请手动删除它！', y3Uri.fsPath));
                        return;
                    };
                } catch (error) {
                    // ignore
                }

                await runShell(l10n.t("初始化Y3项目"), "git", [
                    "clone",
                    Y3_LUALIB_REPO_URL,
                    y3Uri.fsPath,
                ]);

                if (!y3.fs.isExists(y3Uri, 'README.md')) {
                    vscode.window.showWarningMessage(l10n.t('仓库拉取失败！'));
                    return;
                }

                // 初始化配置
                await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(scriptUri, '.log'));
                if (env.globalScriptUri) {
                    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(env.globalScriptUri, '.log'));
                }
                let copySource = vscode.Uri.joinPath(y3Uri, l10n.t('演示/项目配置'));
                for await (const entry of await vscode.workspace.fs.readDirectory(copySource)) {
                    try {
                        await vscode.workspace.fs.copy(
                            vscode.Uri.joinPath(copySource, entry[0]),
                            vscode.Uri.joinPath(scriptUri, entry[0]),
                            {
                                overwrite: true,
                            }
                        );
                    } catch {}
                }

                // 打开项目
                await this.context.globalState.update("NewProjectPath", scriptUri.fsPath);
                await vscode.commands.executeCommand('vscode.openFolder', env.projectUri);

                this.checkNewProject();

                mainMenu.init();
            });
            running = false;
        });
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

        const submoduleReady = await this.ensureY3Submodule(projectRoot, y3Path, y3RelativePath);
        if (!submoduleReady) {
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

        const dryRun = await execGit(makeGitAddDryRunArgs(), projectRoot);
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

        const addResult = await execGit(makeGitAddArgs(), projectRoot);
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

    private async ensureY3Submodule(projectRoot: string, y3Path: string, y3RelativePath: string): Promise<boolean> {
        const probe = await probeY3Submodule(projectRoot, y3Path, y3RelativePath);
        const state = classifyY3SubmoduleState(probe, Y3_LUALIB_REPO_URL);

        if (state === 'already-submodule') {
            return true;
        }

        if (state === 'missing') {
            const ok = l10n.t('添加 Y3 库子模块');
            const res = await vscode.window.showInformationMessage(
                l10n.t('将把 Y3 库作为 Git 子模块添加到 {0}', y3RelativePath),
                { modal: true },
                ok,
            );
            if (res !== ok) {
                return false;
            }
            const result = await execGit(makeSubmoduleAddArgs(Y3_LUALIB_REPO_URL, y3RelativePath), projectRoot, 120_000);
            if (result.exitCode !== 0) {
                vscode.window.showErrorMessage(l10n.t('添加 Y3 库子模块失败：{0}', result.stderr || result.stdout));
                return false;
            }
            return true;
        }

        if (state === 'submodule-not-initialized') {
            const ok = l10n.t('初始化子模块');
            const res = await vscode.window.showInformationMessage(
                l10n.t('Y3 库子模块尚未初始化，是否执行 git submodule update --init？'),
                { modal: true },
                ok,
            );
            if (res !== ok) {
                return false;
            }
            const result = await execGit(makeSubmoduleUpdateInitArgs(y3RelativePath), projectRoot, 120_000);
            if (result.exitCode !== 0) {
                vscode.window.showErrorMessage(l10n.t('初始化 Y3 库子模块失败：{0}', result.stderr || result.stdout));
                return false;
            }
            return true;
        }

        if (state === 'plain-git-clean') {
            const ok = l10n.t('迁移为子模块');
            const res = await vscode.window.showWarningMessage(
                l10n.t('检测到 {0} 是干净的独立 Git 仓库。是否注册为当前地图工程的子模块？', y3RelativePath),
                { modal: true },
                ok,
            );
            if (res !== ok) {
                return false;
            }
            const addResult = await execGit(makeSubmoduleAddExistingArgs(Y3_LUALIB_REPO_URL, y3RelativePath), projectRoot, 120_000);
            if (addResult.exitCode !== 0) {
                vscode.window.showErrorMessage(l10n.t('注册 Y3 库子模块失败：{0}', addResult.stderr || addResult.stdout));
                return false;
            }
            const absorbResult = await execGit(makeSubmoduleAbsorbGitDirsArgs(y3RelativePath), projectRoot, 120_000);
            if (absorbResult.exitCode !== 0) {
                vscode.window.showErrorMessage(l10n.t('迁移 Y3 库 Git 目录失败：{0}', absorbResult.stderr || absorbResult.stdout));
                return false;
            }
            return true;
        }

        const messageByState: Record<string, string> = {
            'plain-git-dirty': l10n.t('Y3 库目录存在未提交改动，请先提交或清理后再初始化版本管理。'),
            'submodule-dirty': l10n.t('Y3 库子模块存在未提交改动，请先提交或清理后再初始化版本管理。'),
            'remote-mismatch': l10n.t('Y3 库目录的远端仓库不是预期地址，请确认来源后手动处理。'),
            'not-git': l10n.t('Y3 库目录已存在但不是 Git 工作区，请手动处理后再初始化版本管理。'),
            'submodule-commit-mismatch': l10n.t('Y3 库子模块指针与工作区提交不一致，请先确认并处理。'),
            'submodule-conflict': l10n.t('Y3 库子模块存在冲突，请先解决冲突。'),
        };
        vscode.window.showErrorMessage(messageByState[state] ?? l10n.t('Y3 库子模块状态未知，请手动检查。'));
        return false;
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

    private async hasGitDirectory(y3Uri?: vscode.Uri): Promise<boolean> {
        if (!y3Uri) {
            return false;
        }
        try {
            const gitUri = vscode.Uri.joinPath(y3Uri, '.git');
            const stat = await vscode.workspace.fs.stat(gitUri);
            return stat.type === vscode.FileType.Directory;
        } catch {
            return false;
        }
    }

    /**
     * 检查 Y3 仓库是否已初始化（.git 目录存在）。
     * 用于 MCP Server 自动启动守卫：未初始化的仓库不应自动启动 MCP。
     * 启用全局脚本后，仓库可能位于 global_script/y3。
     */
    private async isY3Initialized(): Promise<boolean> {
        if (await this.hasGitDirectory(env.y3Uri)) {
            return true;
        }
        return this.hasGitDirectory(
            env.globalScriptUri ? vscode.Uri.joinPath(env.globalScriptUri, l10n.t('y3')) : undefined
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

    // 初始化 CodeMaker 模块
    initCodeMaker(context);
}

export function deactivate() {
    stopCodeMaker();
}
