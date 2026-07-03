import * as vscode from 'vscode';
import * as http from 'http';
import * as crypto from 'crypto';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import * as tools from '../tools';
import { GameSessionManager } from './gameSessionManager';
import { define } from '../customDefine';
import type { UINode } from '../customDefine/ui';
import * as envImport from '../env';
import {
    MCP_HTTP_PORT,
    createAgentContextSnapshot,
    createAgentGuide,
    createAgentSafetyGuide,
    createProjectContext,
    createToolWorkflows,
} from './agentContext';

const UI_PACKAGE_KEY = '\u754c\u9762';
const UI_CANVAS_KEY = '\u753b\u677f';

interface MCPSession {
    id: string;
    createdAt: number;
    server: McpServer;
    transport: StreamableHTTPServerTransport;
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function hasMethod(message: unknown): message is { method: string } {
    return !!message
        && typeof message === 'object'
        && typeof (message as { method?: unknown }).method === 'string';
}

export class TCPServer extends vscode.Disposable {
    private httpServer?: http.Server;
    private readonly sessionManager: GameSessionManager;
    private readonly mcpSessions = new Map<string, MCPSession>();

    private readonly UI_TYPE_NAMES: Record<number, string> = {
        1: 'Button',
        3: 'TextLabel',
        4: 'Image',
        5: 'Progress',
        7: 'Layout',
        10: 'ScrollView',
        18: 'Buff',
        27: 'Chat_Box',
        38: 'Sequence_Animation',
    };

    constructor() {
        super(() => this.dispose());
        this.sessionManager = new GameSessionManager();
    }

    async start(): Promise<boolean> {
        return await this.startHTTPServer();
    }

    private getHeaderValue(value: string | string[] | undefined): string | undefined {
        if (Array.isArray(value)) {
            return value[0];
        }
        return value;
    }

    private isAllowedOrigin(origin: string | undefined): boolean {
        if (!origin) {
            return true;
        }

        if (origin.startsWith('vscode-webview://') || origin.startsWith('vscode-file://')) {
            return true;
        }

        try {
            const parsed = new URL(origin);
            return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname);
        } catch {
            return false;
        }
    }

    private setCommonHeaders(res: http.ServerResponse, origin?: string): void {
        if (origin) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Vary', 'Origin');
        }
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID');
        res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id, MCP-Protocol-Version');
    }

    private writeJsonResponse(res: http.ServerResponse, statusCode: number, body: unknown): void {
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(statusCode);
        res.end(JSON.stringify(body));
    }

    private writeJsonRpcError(
        res: http.ServerResponse,
        statusCode: number,
        code: number,
        message: string
    ): void {
        this.writeJsonResponse(res, statusCode, {
            jsonrpc: '2.0',
            id: null,
            error: { code, message }
        });
    }

    private async startHTTPServer(): Promise<boolean> {
        this.httpServer = http.createServer((req, res) => {
            void this.handleHTTPRequest(req, res);
        });

        return await new Promise<boolean>((resolve, reject) => {
            this.httpServer!.listen(MCP_HTTP_PORT, '127.0.0.1', () => {
                tools.log.info(`[MCP] Streamable HTTP server listening on http://127.0.0.1:${MCP_HTTP_PORT}/mcp`);
                resolve(true);
            });
            this.httpServer!.on('error', (error: NodeJS.ErrnoException) => {
                if (error.code === 'EADDRINUSE') {
                    tools.log.warn(`[MCP] Port ${MCP_HTTP_PORT} is already in use`);
                    resolve(false);
                } else {
                    reject(error);
                }
            });
        });
    }

    private async handleHTTPRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        const origin = this.getHeaderValue(req.headers.origin);
        if (!this.isAllowedOrigin(origin)) {
            this.writeJsonResponse(res, 403, { error: 'Forbidden origin' });
            return;
        }

        this.setCommonHeaders(res, origin);

        if (req.method === 'OPTIONS') {
            res.setHeader('Content-Length', '0');
            res.writeHead(204);
            res.end();
            return;
        }

        const url = req.url || '/';

        try {
            if (url === '/mcp' || url.startsWith('/mcp?')) {
                switch (req.method) {
                    case 'POST':
                        await this.handleMCPPost(req, res);
                        return;
                    case 'GET':
                    case 'DELETE':
                        await this.handleSessionRequest(req, res);
                        return;
                    default:
                        this.writeJsonResponse(res, 405, { error: 'Method not allowed' });
                        return;
                }
            }

            if (url === '/health') {
                this.writeJsonResponse(res, 200, {
                    status: 'ok',
                    transport: 'streamable-http',
                    port: MCP_HTTP_PORT,
                    activeSessions: this.mcpSessions.size
                });
                return;
            }

            this.writeJsonResponse(res, 404, { error: 'Not found' });
        } catch (error) {
            tools.log.error('[MCP] HTTP request error:', error);
            if (!res.headersSent) {
                this.writeJsonResponse(res, 500, { error: 'Internal server error' });
            }
        }
    }

    private async handleMCPPost(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        const body = await this.readBody(req);
        let parsedBody: unknown;

        try {
            parsedBody = JSON.parse(body);
        } catch (error) {
            tools.log.error('[MCP] Failed to parse request body:', error);
            this.writeJsonRpcError(res, 400, -32700, 'Parse error');
            return;
        }

        if (hasMethod(parsedBody)) {
            tools.log.info(`[MCP] Received ${parsedBody.method}`);
        }

        const sessionId = this.getHeaderValue(req.headers['mcp-session-id']);
        if (sessionId) {
            const session = this.mcpSessions.get(sessionId);
            if (!session) {
                this.writeJsonRpcError(res, 404, -32001, 'Session not found');
                return;
            }

            await session.transport.handleRequest(req, res, parsedBody);
            return;
        }

        if (!isInitializeRequest(parsedBody)) {
            this.writeJsonRpcError(res, 400, -32000, 'Bad Request: No valid session ID provided');
            return;
        }

        const { transport } = await this.createSessionTransport();
        await transport.handleRequest(req, res, parsedBody);
    }

    private async handleSessionRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        const sessionId = this.getHeaderValue(req.headers['mcp-session-id']);
        if (!sessionId) {
            this.writeJsonRpcError(res, 400, -32000, 'Bad Request: Mcp-Session-Id header is required');
            return;
        }

        const session = this.mcpSessions.get(sessionId);
        if (!session) {
            this.writeJsonRpcError(res, 404, -32001, 'Session not found');
            return;
        }

        await session.transport.handleRequest(req, res);
    }

    private async closeSession(sessionId: string): Promise<void> {
        const session = this.mcpSessions.get(sessionId);
        if (!session) {
            return;
        }

        this.mcpSessions.delete(sessionId);
        try {
            await session.server.close();
        } catch (error) {
            tools.log.warn(`[MCP] Failed to close session ${sessionId}: ${getErrorMessage(error)}`);
        }
    }

    private async createSessionTransport(): Promise<{ server: McpServer; transport: StreamableHTTPServerTransport }> {
        const server = this.createMcpServer();
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => crypto.randomUUID(),
            enableJsonResponse: true,
            onsessioninitialized: (sessionId) => {
                this.mcpSessions.set(sessionId, {
                    id: sessionId,
                    createdAt: Date.now(),
                    server,
                    transport,
                });
            }
        });

        transport.onerror = (error) => {
            tools.log.error('[MCP] Transport error:', error);
        };

        transport.onclose = () => {
            const sessionId = transport.sessionId;
            if (sessionId) {
                void this.closeSession(sessionId);
            }
        };

        await server.connect(transport);
        return { server, transport };
    }

    private createMcpServer(): McpServer {
        const server = new McpServer({
            name: 'y3-helper',
            version: '1.0.0'
        });

        this.registerAgentResources(server);
        this.registerAgentPrompts(server);

        server.registerTool('launch_game', {
            title: '启动 Y3 游戏',
            description: '启动当前 VS Code 识别到的 Y3 地图游戏。这个工具会等待编辑器和地图环境就绪，并在启动前保存 GMP 数据；启动过程可能异步完成，调用后用 get_game_status 查询结果。',
            inputSchema: {}
        }, async () => this.runTool(async () => await this.sessionManager.launchGame({})));

        server.registerTool('get_game_status', {
            title: '读取游戏状态',
            description: '读取当前 Y3 游戏会话状态，包括是否运行、session id、客户端连接状态、启动/重启状态和错误信息。Agent 在执行运行时操作前应先调用此工具。',
            inputSchema: {}
        }, async () => this.runTool(() => this.sessionManager.getGameStatus()));

        server.registerTool('execute_lua', {
            title: '执行 Lua 片段',
            description: '在已连接的运行中游戏客户端执行 Lua 代码，并返回执行后捕获到的新增日志。需要已有活动游戏会话和客户端连接；只用于明确的小范围运行时验证。',
            inputSchema: {
                code: z.string()
            }
        }, async ({ code }) => this.runTool(async () => await this.sessionManager.executeLua({ code })));

        server.registerTool('quick_restart', {
            title: '快速重启游戏',
            description: '向运行中的游戏发送 .rr 快速重启命令，等待客户端重新连接，并返回重启期间新增日志。需要已有活动游戏会话和客户端连接。',
            inputSchema: {}
        }, async () => this.runTool(async () => await this.sessionManager.quickRestart()));

        server.registerTool('stop_game', {
            title: '停止游戏',
            description: '停止当前 Y3 游戏会话。该操作会向本地玩家发送退出 Lua 并清理 MCP 游戏会话状态，会影响本地正在运行的游戏。',
            inputSchema: {}
        }, async () => this.runTool(async () => await this.sessionManager.stopGame({})));

        server.registerTool('get_logs', {
            title: '读取游戏日志',
            description: '读取当前 MCP 游戏会话捕获到的最近 N 行日志。默认读取 100 行；没有活动会话时会返回失败状态。',
            inputSchema: {
                limit: z.number().optional()
            }
        }, async ({ limit }) => this.runTool(async () => await this.sessionManager.getLogs({ limit })));

        server.registerTool('capture_screenshot', {
            title: '捕获游戏截图',
            description: '请求运行中的游戏写出截图文件，并返回截图路径。调用方需要用自己的图片读取能力查看该文件；不能只根据路径猜测截图内容。',
            inputSchema: {}
        }, async () => this.runTool(async () => await this.sessionManager.captureScreenshot()));

        server.registerTool('read_problems_lua', {
            title: '读取 Lua 诊断',
            description: '调用 VS Code 的 vscodeOperator_readProblems 获取 Lua 诊断。可用 pathGlob 限定文件或目录；默认读取当前工作区 Lua 文件 warning 及以上问题。',
            inputSchema: {
                pathGlob: z.union([z.string(), z.array(z.string())]).optional()
            }
        }, async ({ pathGlob }) => this.runTool(async () => await this.sessionManager.readProblemsLua({ pathGlob })));

        server.registerTool('get_ui_canvas', {
            title: '读取 UI 画布树',
            description: '读取当前地图 UI 画布树，返回节点名、控件类型和 uid。可用 nodePath 定位子树，用 depth 控制展开深度，depth=-1 表示不限制深度。',
            inputSchema: {
                nodePath: z.string().optional(),
                depth: z.number().optional()
            }
        }, async ({ nodePath, depth }) => this.runTool(async () => await this.getUICanvas({ nodePath, depth })));

        return server;
    }

    private getAgentContextSnapshot() {
        return createAgentContextSnapshot({
            projectRoot: envImport.env.projectUri?.fsPath,
            mapRoot: envImport.env.mapUri?.fsPath,
            scriptRoot: envImport.env.scriptUri?.fsPath,
            y3Root: envImport.env.y3Uri?.fsPath,
            helperRoot: envImport.env.helperUri?.fsPath,
            currentMapName: envImport.env.currentMap?.name,
        });
    }

    private registerAgentResources(server: McpServer): void {
        const registerTextResource = (
            name: string,
            uri: string,
            title: string,
            description: string,
            read: () => string,
        ) => {
            server.registerResource(name, uri, {
                title,
                description,
                mimeType: 'text/plain; charset=utf-8',
            }, async () => ({
                contents: [{
                    uri,
                    text: read(),
                }],
            }));
        };

        registerTextResource(
            'agent-guide',
            'y3-helper://agent-guide',
            'Y3-Helper Agent Guide',
            'Agent 接入 Y3-Helper MCP 后的初始化说明和推荐顺序。',
            () => createAgentGuide(this.getAgentContextSnapshot()),
        );
        registerTextResource(
            'project-context',
            'y3-helper://project-context',
            'Y3 Project Context',
            '当前 Y3 工程、地图、脚本目录和 MCP 端点的机器可读上下文。',
            () => createProjectContext(this.getAgentContextSnapshot()),
        );
        registerTextResource(
            'tool-workflows',
            'y3-helper://tool-workflows',
            'Y3-Helper Tool Workflows',
            'Lua 诊断、运行时验证和 UI 查询的 MCP 工具调用顺序。',
            () => createToolWorkflows(this.getAgentContextSnapshot()),
        );
        registerTextResource(
            'safety',
            'y3-helper://safety',
            'Y3-Helper MCP Safety',
            '有副作用工具和脚本目录边界的安全说明。',
            () => createAgentSafetyGuide(this.getAgentContextSnapshot()),
        );
    }

    private registerAgentPrompts(server: McpServer): void {
        const registerPrompt = (name: string, title: string, description: string, text: string) => {
            server.registerPrompt(name, {
                title,
                description,
            }, async () => ({
                messages: [{
                    role: 'user',
                    content: {
                        type: 'text',
                        text,
                    },
                }],
            }));
        };

        registerPrompt(
            'y3_helper_quickstart',
            'Y3-Helper Quickstart',
            '让 agent 先读取项目上下文并判断下一步。',
            '请先读取 y3-helper://agent-guide 和 y3-helper://project-context，然后调用 get_game_status，总结当前 Y3 地图项目状态和下一步建议。',
        );
        registerPrompt(
            'y3_lua_debugging',
            'Y3 Lua Debugging',
            '诊断当前地图 Lua 问题并给出修复顺序。',
            '请调用 read_problems_lua 读取 Lua 诊断，按文件和严重程度整理问题。修改代码前先说明你会触碰哪些脚本文件。',
        );
        registerPrompt(
            'y3_runtime_control',
            'Y3 Runtime Control',
            '启动或检查游戏运行时状态。',
            '请先调用 get_game_status。如果游戏未运行，说明将启动本地游戏进程后再调用 launch_game；启动后继续轮询 get_game_status。',
        );
        registerPrompt(
            'y3_ui_inspection',
            'Y3 UI Inspection',
            '读取地图 UI 结构并辅助定位节点。',
            '请调用 get_ui_canvas 读取当前地图 UI 画布树。需要截图时再调用 capture_screenshot，并且必须读取截图文件后再描述画面。',
        );
    }

    private async runTool<T>(handler: () => Promise<T> | T): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
        try {
            const result = await handler();
            return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
            };
        } catch (error) {
            return {
                content: [{ type: 'text', text: `Error: ${getErrorMessage(error)}` }],
                isError: true
            };
        }
    }

    private async getUICanvas(toolArgs: { nodePath?: string; depth?: number }): Promise<Record<string, unknown>> {
        const nodePath = toolArgs.nodePath;
        let depth: number | undefined = 1;

        if (toolArgs.depth !== undefined) {
            const rawDepth = Number(toolArgs.depth);
            if (!Number.isNaN(rawDepth)) {
                depth = rawDepth === -1 ? undefined : Math.max(0, Math.floor(rawDepth));
            }
        }

        if (!envImport.env.currentMap) {
            return {
                success: false,
                error: 'No map is currently loaded. Open a Y3 map project in VSCode first.'
            };
        }

        try {
            const uiPackage = await (define(envImport.env.currentMap) as any)[UI_PACKAGE_KEY].getUIPackage();
            const canvases = (uiPackage[UI_CANVAS_KEY] ?? []) as UINode[];

            if (nodePath !== undefined) {
                const segments = nodePath.split('.');
                let target: UINode | undefined;

                for (const canvas of canvases) {
                    if (canvas.name === segments[0]) {
                        if (segments.length === 1) {
                            target = canvas;
                        } else {
                            target = this.findNodeByPath(canvas.childs ?? [], segments.slice(1));
                        }

                        if (target) {
                            break;
                        }
                    }
                }

                if (!target) {
                    return {
                        success: false,
                        error: `Node path not found: ${nodePath}`
                    };
                }

                return {
                    success: true,
                    canvas: this.formatNodeTree(target, '', true, depth)
                };
            }

            const lines: string[] = [];
            if (canvases.length === 0) {
                lines.push('Canvas: (none)');
            } else {
                for (const canvas of canvases) {
                    lines.push(`Canvas: ${canvas.name}`);
                    const children = canvas.childs ?? [];
                    children.forEach((child, index) => {
                        lines.push(this.formatNodeTree(child, '', index === children.length - 1, depth));
                    });
                    lines.push('');
                }
            }

            return {
                success: true,
                canvas: lines.join('\n').trimEnd()
            };
        } catch (error) {
            return {
                success: false,
                error: `Failed to read UI data: ${getErrorMessage(error)}`
            };
        }
    }

    private readBody(req: http.IncomingMessage): Promise<string> {
        return new Promise((resolve, reject) => {
            let body = '';
            req.on('data', (chunk) => body += chunk);
            req.on('end', () => resolve(body));
            req.on('error', reject);
        });
    }

    private findNodeByPath(nodes: UINode[], pathSegments: string[]): UINode | undefined {
        if (pathSegments.length === 0) {
            return undefined;
        }

        const [head, ...rest] = pathSegments;
        const found = nodes.find((node) => node.name === head);
        if (!found) {
            return undefined;
        }

        if (rest.length === 0) {
            return found;
        }

        return this.findNodeByPath(found.childs ?? [], rest);
    }

    private formatNodeTree(
        node: UINode,
        prefix: string = '',
        isLast: boolean = true,
        maxDepth?: number,
        currentDepth: number = 0
    ): string {
        const connector = isLast ? '+- ' : '|- ';
        const typeName = this.UI_TYPE_NAMES[node.type] ?? `type_${node.type}`;
        const line = `${prefix}${connector}${node.name} [${typeName}] (uid: ${node.uid})`;

        if (maxDepth !== undefined && currentDepth >= maxDepth) {
            const childCount = (node.childs ?? []).length;
            if (childCount > 0) {
                const childPrefix = prefix + (isLast ? '   ' : '|  ');
                return [line, `${childPrefix}... (${childCount} child nodes)`].join('\n');
            }
            return line;
        }

        const childPrefix = prefix + (isLast ? '   ' : '|  ');
        const children = node.childs ?? [];
        const childLines = children.map((child, index) =>
            this.formatNodeTree(child, childPrefix, index === children.length - 1, maxDepth, currentDepth + 1)
        );

        return [line, ...childLines].join('\n');
    }

    dispose(): void {
        const sessionIds = Array.from(this.mcpSessions.keys());
        for (const sessionId of sessionIds) {
            void this.closeSession(sessionId);
        }

        this.httpServer?.close();
        this.sessionManager.dispose();
    }
}
