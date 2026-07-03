# Y3 Helper Agent MCP Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让本地 VSIX 分叉版 Y3-Helper 为外部 AI agent 提供可控、可理解、可验证的 MCP 接入体验。

**Architecture:** MCP 启动由 `Y3-Helper.MCP.StartMode` 控制，默认 `manual`，只有 `auto` 才允许项目识别后静默启动。Agent 上下文、AGENTS.md 内容、MCP resources/prompts 文案集中到纯函数模块，扩展命令只负责读取环境、写文件、复制配置和启动/停止服务。

**Tech Stack:** VS Code Extension API、TypeScript、Mocha TDD、@modelcontextprotocol/sdk 1.13.1、Streamable HTTP MCP。

---

## 完成标准

- [ ] 打开工程根、地图目录、地图 `script` 目录时，都沿用现有 `env` 识别能力，不把用户强制迁移到工程根。
- [ ] 新增 `Y3-Helper.MCP.StartMode`，取值 `off`、`manual`、`auto`，默认 `manual`。
- [ ] `off` 不自动启动 MCP，手动启动命令也提示已关闭。
- [ ] `manual` 不自动启动 MCP，但允许用户手动启动。
- [ ] `auto` 在项目识别成功、Y3 仓库已初始化、端口空闲时静默启动。
- [ ] MCP tools 有面向 agent 的用途、前置条件和风险描述。
- [ ] MCP 提供 `y3-helper://agent-guide`、`y3-helper://project-context`、`y3-helper://tool-workflows`、`y3-helper://safety` resources。
- [ ] MCP 提供 `y3_helper_quickstart`、`y3_lua_debugging`、`y3_runtime_control`、`y3_ui_inspection` prompts。
- [ ] 新增 Agent 接入中心命令，能查看状态、复制 MCP 配置、启动/停止 MCP、生成/打开 `AGENTS.md`。
- [ ] `AGENTS.md` 默认生成到地图脚本目录 `env.scriptUri`，绝不默认写入 `env.y3Uri`。
- [ ] 单测、编译、lint 通过；关键行为有测试覆盖。

## 任务切分

### Task 1: MCP 启动配置

**Files:**
- Create: `src/mcp/config.ts`
- Test: `src/test/suite/mcpConfig.test.ts`
- Modify: `src/extension.ts`
- Modify: `package.json`

- [ ] 写 `normalizeMcpStartMode` 的失败测试：未知值、空值默认 `manual`。
- [ ] 实现 `normalizeMcpStartMode` 和 `getMcpStartMode`。
- [ ] 在 `package.json` 注册 `Y3-Helper.MCP.StartMode`。
- [ ] 修改 `tryAutoStartMCP()`：只有 `auto` 才继续自动启动。
- [ ] 修改手动启动命令：`off` 时不启动并提示。

### Task 2: Agent 上下文与 AGENTS.md

**Files:**
- Create: `src/mcp/agentContext.ts`
- Test: `src/test/suite/mcpAgentContext.test.ts`

- [ ] 写失败测试：MCP 客户端配置为 `http://127.0.0.1:8766/mcp`。
- [ ] 写失败测试：`AGENTS.md` 内容声明脚本目录是默认工作区，`y3` 是框架库。
- [ ] 实现上下文快照、资源文本、AGENTS.md 文本生成。
- [ ] 保持纯函数，不依赖 VS Code API。

### Task 3: MCP resources/prompts/tools

**Files:**
- Modify: `src/mcp/tcpServer.ts`
- Modify: `src/mcp/agentContext.ts`

- [ ] 把 9 个 tool description 改成 agent 可读说明。
- [ ] 注册 4 个 resources，内容由 `agentContext` 生成。
- [ ] 注册 4 个 prompts，返回稳定的 user prompt 消息。
- [ ] 保持每个 MCP session 注册同一组能力。

### Task 4: Agent 接入中心

**Files:**
- Create: `src/agentAccessCenter.ts`
- Modify: `src/extension.ts`
- Modify: `package.json`

- [ ] 新增命令 `y3-helper.openAgentAccessCenter`。
- [ ] 用 QuickPick 做接入中心：状态、复制配置、启动、停止、生成 AGENTS.md、打开 AGENTS.md。
- [ ] 生成 `AGENTS.md` 前使用 `env.mapReady(true)`，目标路径为 `env.scriptUri/AGENTS.md`。
- [ ] 已存在文件时询问覆盖；用户不确认就不写。

### Task 5: 验证与审查

**Files:**
- All changed files

- [ ] 运行 `npm run test:unit`。
- [ ] 运行 `npm run lint`。
- [ ] 运行 `npm run compile`。
- [ ] 审查 diff，确认没有写入 `env.y3Uri/AGENTS.md`。
- [ ] 请求代码审查子代理只读审查。
- [ ] 修复审查发现的 Critical/Important 问题。
- [ ] 提交 git。
