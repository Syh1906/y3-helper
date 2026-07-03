import { TreeNode } from '../treeNode';
import * as vscode from 'vscode';
import * as l10n from '@vscode/l10n';

export class Agent接入中心 extends TreeNode {
    constructor() {
        super(l10n.t('Agent 接入中心'), {
            iconPath: new vscode.ThemeIcon('plug'),
            command: {
                command: 'y3-helper.openAgentAccessCenter',
                title: l10n.t('Agent 接入中心'),
            },
            tooltip: l10n.t('配置外部 AI agent 通过 MCP 接入当前 Y3 地图项目'),
        });
    }
}
