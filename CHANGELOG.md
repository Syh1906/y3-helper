# 变更日志

本文件记录 `y3-helper-local` 本地 VSIX 分叉版的重要变更。

格式参考 [Keep a Changelog](http://keepachangelog.com/)。

## [Unreleased]

## [1.0.1] - 2026-07-04

### 新增

- 增加 Agent 接入中心，集中展示 MCP 连接地址、项目上下文和 Agent 指南生成入口。
- 增加 `Y3-Helper.MCP.StartMode` 配置，支持 `off`、`manual`、`auto` 三种 MCP Server 启动模式，默认仅手动启动。
- 增加 MCP `resources`、`prompts` 和工具说明，让外部 Agent 客户端能读取当前 Y3 项目上下文。
- 增加 `AGENTS.md` 生成入口，默认写入地图脚本目录。

### 变更

- MCP Server 自动启动遵循扩展配置，不再强制静默启动。

## [1.0.0] - 2026-07-04

### 变更

- 将扩展身份调整为 `syh1906.y3-helper-local`，作为本地 VSIX 分叉版的版本基线。
- 将发行版本线从 `1.0.0` 开始，避免与上游公开插件的版本链条混用。
