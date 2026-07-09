import { env } from "../../env";
import { TreeNode } from "../treeNode";
import * as vscode from 'vscode';
import * as y3 from 'y3-helper';
import { config } from "../../config";
import { TreeViewManager } from "../../console/treeView";
import { WebviewTerminal } from "../../console/webviewTerminal";
import * as globalScript from '../../globalScript';
import * as l10n from '@vscode/l10n';
import { isY3LibraryUsable } from '../../y3ProjectInit';
import { getMcpStartMode } from '../../mcp/config';
import { isMcpServerRunning } from '../../mcp/runtimeStatus';
import {
    getAgentMcpProjectConfigDescription,
    getAgentMcpProjectConfigTooltip,
    getMcpRuntimeStatusDescription,
    getMcpRuntimeStatusTooltip,
} from '../../agentAccessCenterModel';
import { getCurrentAiMcpProjectConfigState } from '../../agentAccessCenter';

function 多开模式() {
    let node = new TreeNode(l10n.t('多开模式'), {
        tooltip: l10n.t('请手动启动编辑器登录（并选择30天免登录）再使用此功能'),
        checkboxState: config.multiMode ? vscode.TreeItemCheckboxState.Checked : vscode.TreeItemCheckboxState.Unchecked,
        onDidChangeCheckboxState(state) {
            config.multiMode = state === vscode.TreeItemCheckboxState.Checked;
        },
        childs: Array.from({ length: 8 }, (_, i) => {
            const id = i + 1;
            return new TreeNode(l10n.t('玩家{0}', id), {
                checkboxState: config.multiPlayers.includes(id)
                    ? vscode.TreeItemCheckboxState.Checked
                    : vscode.TreeItemCheckboxState.Unchecked,
                description: config.debugPlayers.includes(id)
                    ? l10n.t('启用调试器')
                    : undefined,
                command: {
                    title: l10n.t('切换调试'),
                    command: 'y3-helper.debug.toggle',
                    arguments: [id],
                },
                tooltip: l10n.t('点击此处可以切换是否附加调试此玩家。所有调试的玩家会共用断点，所以不应该附加太多调试器。'),
                onDidChangeCheckboxState(state) {
                    if (state === vscode.TreeItemCheckboxState.Checked) {
                        if (!config.multiPlayers.includes(id)) {
                            config.multiPlayers.push(id);
                        }
                    } else {
                        const index = config.multiPlayers.indexOf(id);
                        if (index !== -1) {
                            config.multiPlayers.splice(index, 1);
                        }
                    }
                },
                update: async (node) => {
                    node.description = config.debugPlayers.includes(id)
                        ? l10n.t('启用调试器')
                        : undefined;
                },
            });
        }),
    });
    vscode.commands.registerCommand('y3-helper.debug.toggle', async (id: number) => {
        const index = config.debugPlayers.indexOf(id);
        if (index === -1) {
            config.debugPlayers.push(id);
        } else {
            config.debugPlayers.splice(index, 1);
        }
        node.childs?.[id-1].refresh();
    });
    return node;
}

function 启用Tracy() {
    let node = new TreeNode(l10n.t('启用Tracy'), {
        tooltip: l10n.t('对Lua进行性能分析，但是会大幅影响运行效率'),
        checkboxState: config.tracy ? vscode.TreeItemCheckboxState.Checked : vscode.TreeItemCheckboxState.Unchecked,
        onDidChangeCheckboxState(state) {
            config.tracy = state === vscode.TreeItemCheckboxState.Checked;
        },
    });
    return node;
}

function 切换自定义视图() {
    let node = new TreeNode(l10n.t('切换自定义视图'), {
        iconPath: new vscode.ThemeIcon('window'),
        show: () => {
            return TreeViewManager.allManagers.size >= 2;
        },
        update: async (node) => {
            node.childs = Array.from(TreeViewManager.allManagers.values(), manager => {
                let child = new TreeNode(manager.client.name, {
                    command: {
                        command: 'y3-helper.custom.show',
                        title: l10n.t('切换自定义视图'),
                        arguments: [manager.id],
                    },
                });
                manager.client.onDidUpdateName(name => {
                    child.label = name;
                    child.refresh();
                });
                return child;
            });
        },
    });
    return node;
}

export class 功能 extends TreeNode {
    constructor() {
        super(l10n.t('功能'), {
            iconPath: new vscode.ThemeIcon('beaker'),
            show: async () => {
                await env.mapReady();
                return env.scriptUri !== undefined;
            },
            collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
            childs: [
                new TreeNode(l10n.t('初始化Y3库'), {
                    command: {
                        command: 'y3-helper.initProject',
                        title: l10n.t('初始化Y3库'),
                    },
                    update: async (node) => {
                        const usable = env.y3Uri ? await isY3LibraryUsable(env.y3Uri.fsPath) : false;
                        node.iconPath = usable
                            ? new vscode.ThemeIcon('check')
                            : new vscode.ThemeIcon('cloud-download');
                        node.tooltip = usable
                            ? l10n.t('Y3 库已就绪，可再次点击修复项目配置')
                            : l10n.t('安装 Y3 库或修复项目配置');
                    },
                    show: async () => {
                        return !await globalScript.isEnabled();
                    }
                }),
                new TreeNode(l10n.t('编辑器需要更新！'), {
                    iconPath: new vscode.ThemeIcon('symbol-event'),
                    init: (node) => {
                        y3.version.onDidChange(async () => {
                            node.parent?.refresh();
                        });
                    },
                    update: async (node) => {
                        if (y3.env.editorUri === undefined) {
                            return;
                        }
                        let client = await y3.version.getClient();
                        let server = await y3.version.getServer();
                        node.description = `${client?.display} -> ${server?.display}`;
                        node.tooltip = `${client?.version} -> ${server?.version}`;
                        node.command = {
                            command: 'y3-helper.shell',
                            title: l10n.t('启动编辑器'),
                            arguments: [
                                'start',
                                y3.env.editorUri?.fsPath,
                            ]
                        };
                    },
                    show: async () => {
                        return y3.env.editorUri !== undefined
                            && await y3.version.needUpdate();
                    }
                }),
                new TreeNode(l10n.t('启动游戏'), {
                    iconPath: new vscode.ThemeIcon('play'),
                    tooltip: 'Shift + F5',
                    command: {
                        command: 'y3-helper.launchGame',
                        title: l10n.t('启动游戏'),
                    },
                    update: async (node) => {
                        let map = env.project?.selectedMap;
                        let name = map?.name;
                        let description = map?.description;
                        if (name === description) {
                            node.description = `${name}`;
                        } else {
                            node.description = `${description}@${name}`;
                        }

                        function makeChilds(): TreeNode[] {
                            if (!env.project) {
                                return [];
                            }
                            let options: ['option' | 'map', string, y3.Map][] = [];
                            if (env.project.entryMap) {
                                options.push(['option', 'entry', env.project.entryMap]);
                            }
                            if (env.currentMap) {
                                options.push(['option', 'current', env.currentMap]);
                            }
                            for (const map of env.project.maps) {
                                options.push(['map', map.name, map]);
                            }
                
                            let target: (typeof options[0]) | undefined;
                            for (const option of options) {
                                if (config.launchMap[0] === option[0] && config.launchMap[1] === option[1]) {
                                    target = option;
                                    break;
                                }
                            }
                
                            return options.map((option) => {
                                const [type, name, map] = option;
                                if (type === 'map') {
                                    return new TreeNode(map.name, {
                                        tooltip: map.description,
                                        iconPath: option === target
                                                ? new vscode.ThemeIcon('arrow-circle-right')
                                                : new vscode.ThemeIcon('circle-outline'),
                                        command: {
                                            command: 'y3-helper.selectLaunchingMap',
                                            title: l10n.t('选择启动地图'),
                                            arguments: [type, name],
                                        },
                                    });
                                } else {
                                    let nodeName = name === 'entry'
                                                ? l10n.t('主地图')
                                                : l10n.t('当前地图');
                                    return new TreeNode(nodeName, {
                                        description: map.name,
                                        tooltip: map.description,
                                        iconPath: option === target
                                                ? new vscode.ThemeIcon('arrow-circle-right')
                                                : new vscode.ThemeIcon('circle-outline'),
                                        command: {
                                            command: 'y3-helper.selectLaunchingMap',
                                            title: l10n.t('选择启动地图'),
                                            arguments: [type, name],
                                        },
                                    });
                                }
                            });
                        }
                
                        node.childs = makeChilds();
                    },
                    init: (node) => {
                        env.onDidChange(async () => {
                            node.refresh();
                        });
                        vscode.commands.registerCommand('y3-helper.selectLaunchingMap', async (type: 'option' | 'map', name: string) => {
                            config.launchMap = [type, name];
                            node.refresh();
                        });
                    },
                }),
                new TreeNode(l10n.t('附加调试器'), {
                    command: {
                        command: 'y3-helper.attach',
                        title: l10n.t('附加调试器'),
                    },
                    iconPath: new vscode.ThemeIcon('run-all'),
                    childs: [
                        new TreeNode(l10n.t('启动游戏后立即附加'), {
                            checkboxState: config.attachWhenLaunch
                                        ? vscode.TreeItemCheckboxState.Checked
                                        : vscode.TreeItemCheckboxState.Unchecked,
                            onDidChangeCheckboxState(state) {
                                config.attachWhenLaunch = state === vscode.TreeItemCheckboxState.Checked;
                            },
                        })
                    ],
                }),
                new TreeNode(l10n.t('在编辑器中打开'), {
                    command: {
                        command: 'y3-helper.launchEditor',
                        title: l10n.t('在编辑器中打开'),
                    },
                    iconPath: new vscode.ThemeIcon('mortar-board'),
                }),
                new TreeNode(l10n.t('查看物编数据'), {
                    command: {
                        command: 'y3-helper.editorTableView.focus',
                        title: l10n.t('查看物编数据'),
                    },
                    iconPath: new vscode.ThemeIcon('symbol-function'),
                }),
                new TreeNode(l10n.t('查看日志'), {
                    iconPath: new vscode.ThemeIcon('output'),
                    show: () => {
                        return env.scriptUri !== undefined;
                    },
                    update: async (node) => {
                        if (env.scriptUri === undefined) {
                            return;
                        }
                        node.command = {
                            command: 'vscode.open',
                            title: l10n.t('查看日志'),
                            arguments: [vscode.Uri.joinPath(env.scriptUri!, '.log/lua_player01.log')]
                        };
                    },
                }),
                new TreeNode(l10n.t('重新打开控制台'), {
                    iconPath: new vscode.ThemeIcon('terminal'),
                    command: {
                        command: 'y3-helper.reopenConsole',
                        title: l10n.t('重新打开控制台'),
                    },
                    show: () => WebviewTerminal.hasDisposedPanel(),
                }),
                多开模式(),
                启用Tracy(),
                切换自定义视图(),
                new TreeNode('MCP Server', {
                    iconPath: new vscode.ThemeIcon('plug'),
                    update: (node) => {
                        const mode = getMcpStartMode();
                        const running = isMcpServerRunning();
                        node.description = l10n.t(getMcpRuntimeStatusDescription(running, mode));
                        node.tooltip = l10n.t(getMcpRuntimeStatusTooltip(running, mode));
                    },
                    childs: [
                        new TreeNode(l10n.t('MCP 运行状态'), {
                            iconPath: new vscode.ThemeIcon('info'),
                            update: (node) => {
                                const mode = getMcpStartMode();
                                const running = isMcpServerRunning();
                                node.description = l10n.t(getMcpRuntimeStatusDescription(running, mode));
                                node.tooltip = l10n.t(getMcpRuntimeStatusTooltip(running, mode));
                            },
                        }),
                        new TreeNode(l10n.t('Agent 配置状态'), {
                            iconPath: new vscode.ThemeIcon('settings-gear'),
                            update: async (node) => {
                                const state = await getCurrentAiMcpProjectConfigState();
                                node.description = l10n.t(getAgentMcpProjectConfigDescription(state));
                                node.tooltip = l10n.t(getAgentMcpProjectConfigTooltip(state));
                            },
                        }),
                        new TreeNode(l10n.t('启动 MCP Server'), {
                            iconPath: new vscode.ThemeIcon('play'),
                            command: {
                                command: 'y3-helper.startMCPServer',
                                title: l10n.t('启动 MCP Server'),
                            },
                            tooltip: l10n.t('启动本地 8766 MCP 服务。该操作不会修改 Codex / Claude 项目 MCP 配置。'),
                        }),
                        new TreeNode(l10n.t('停止 MCP Server'), {
                            iconPath: new vscode.ThemeIcon('debug-stop'),
                            command: {
                                command: 'y3-helper.stopMCPServer',
                                title: l10n.t('停止 MCP Server'),
                            },
                            tooltip: l10n.t('停止本地 8766 MCP 服务。外部 Agent 客户端通常需要重启或刷新后才能感知连接变化。'),
                        }),
                        new TreeNode(l10n.t('Agent 接入中心'), {
                            iconPath: new vscode.ThemeIcon('account'),
                            command: {
                                command: 'y3-helper.openAgentAccessCenter',
                                title: l10n.t('Agent 接入中心'),
                            },
                            tooltip: l10n.t('打开 Agent 接入中心，用于初始化 AI 开发环境，或启用 / 禁用 Codex / Claude 项目 MCP 配置。'),
                        }),
                        new TreeNode(l10n.t('启用 AI MCP 项目配置'), {
                            iconPath: new vscode.ThemeIcon('check'),
                            command: {
                                command: 'y3-helper.enableAiMcpConfig',
                                title: l10n.t('启用 AI MCP 项目配置'),
                            },
                            tooltip: l10n.t('同时启用 Codex config.toml、Claude .mcp.json 和 Claude settings.local.json 中的三项 Y3 MCP 配置。'),
                        }),
                        new TreeNode(l10n.t('禁用 AI MCP 项目配置'), {
                            iconPath: new vscode.ThemeIcon('circle-slash'),
                            command: {
                                command: 'y3-helper.disableAiMcpConfig',
                                title: l10n.t('禁用 AI MCP 项目配置'),
                            },
                            tooltip: l10n.t('同时禁用 Codex config.toml、Claude .mcp.json 和 Claude settings.local.json 中的三项 Y3 MCP 配置。'),
                        }),
                    ],
                }),
            ]
        });

        TreeViewManager.onDidChange(() => {
            this.refresh();
        });
        WebviewTerminal.onDidChangePanelState.event(() => {
            this.refresh();
        });
    }
};
