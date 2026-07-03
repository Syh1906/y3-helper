import * as vscode from 'vscode';
import { canAutoStartMcp, normalizeMcpStartMode, type McpStartMode } from './startMode';

export { canAutoStartMcp, normalizeMcpStartMode, type McpStartMode };

export function getMcpStartMode(): McpStartMode {
    const value = vscode.workspace
        .getConfiguration('Y3-Helper', vscode.workspace.workspaceFolders?.[0])
        .get('MCP.StartMode');
    return normalizeMcpStartMode(value);
}
