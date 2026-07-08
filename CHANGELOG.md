# 变更日志

本文件记录 `y3-helper-local` 本地 VSIX 分叉版的重要变更。

格式参考 [Keep a Changelog](http://keepachangelog.com/)。

## [Unreleased]

## [1.0.4] - 2026-07-08

### 新增

- 增加“初始化 / 修复 AI 开发环境”入口，为地图工程生成 Codex/Claude 规则文件、同步 `y3-kernel-navigator` skill，并写入项目级 MCP 配置。
- 恢复 `y3-helper`、`y3editor`、`y3runtime` 三项 MCP 工具配置，供 Codex、Claude 和 Y3-Helper `McpHub` 使用。

### 变更

- 根目录 `AGENTS.md` 改为地图工程模块路由说明，`script/AGENTS.md` 保持 Lua 业务开发指引。
- `y3-kernel-navigator` 缺失时 AI 初始化继续完成 AGENTS 和 MCP 配置，后续补齐 skill 后可再次运行修复。
- `.y3maker/mcp_settings.json` 仅作为 MCP 连接配置使用，不恢复 Y3Maker 聊天入口或 CodeMaker 面板。

### 修复

- 修复已运行 `McpHub` 在 AI MCP 配置写入后不立即刷新连接的问题。
- 修复打开 `script` 目录时 `.y3maker` 写入位置与 `McpHub` 读取位置不一致的问题。
- 修复损坏的 MCP JSON 配置可能导致初始化异常中断的问题。
- 修复 Codex MCP TOML 使用带引号表名时可能追加重复配置的问题。

## [1.0.3] - 2026-07-08

### 新增

- 支持手动复制到地图脚本目录的 `y3` 库作为有效初始化来源。
- 支持通过默认仓库或自定义 Git 仓库安装 Y3 库。
- 增加地图工程版本管理中的 Y3 库管理方式选择，支持不管理、普通目录、子模块或保留独立 Git 仓库。
- 增加空白地图模板验收脚本，用于验证 Y3 库初始化与工程版本管理解耦流程。

### 变更

- 将 Y3 库安装、项目配置初始化和地图工程版本管理拆分为独立流程。
- MCP 自动启动和菜单状态改为根据 Y3 库可用性判断，不再只依赖 `y3/.git`。
- 项目配置初始化遇到已有配置时默认保留，覆盖需要显式确认。

## [1.0.2] - 2026-07-06

### 变更

- 暂停 Y3Maker AI 面板、`Y3Maker.CodeChat*` 设置项、主菜单入口和扩展启动链路；保留 `src/codemaker/`、`src/y3makerConfig.ts` 与历史菜单节点作为后续恢复锚点。

### 修复

- 修复 `PING_MCP_SERVERS` 被当成重启处理的问题，ping 操作不再触发 MCP server 重启。

## [1.0.1] - 2026-07-04

### 新增

- 增加 Agent 接入中心，集中展示 MCP 连接地址、项目上下文和 Agent 指南生成入口。
- 增加 `Y3-Helper.MCP.StartMode` 配置，支持 `off`、`manual`、`auto` 三种 MCP Server 启动模式，默认仅手动启动。
- 增加 MCP `resources`、`prompts` 和工具说明，让外部 Agent 客户端能读取当前 Y3 项目上下文。
- 增加 `AGENTS.md` 生成入口，默认写入地图脚本目录。

### 变更

- 修复 VS Code 插件清单中的配置警告。
- MCP Server 自动启动遵循扩展配置，不再强制静默启动。

## [1.0.0] - 2026-07-04

### 变更

- 将扩展身份调整为 `syh1906.y3-helper-local`，作为本地 VSIX 分叉版的版本基线。
- 将发行版本线从 `1.0.0` 开始，避免与上游公开插件的版本链条混用。
