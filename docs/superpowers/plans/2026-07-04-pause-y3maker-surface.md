# 暂停 Y3Maker 可见入口推进计划

> Parent: [../index.md](../index.md)

## 最终目标

本地 VSIX 安装后不再出现右侧 `Y3Maker` 面板，不再暴露 Y3Maker 聊天设置，不再启动 CodeMaker 运行时。源码保留恢复锚点，后续是否恢复由新的决策决定。

## 全局冻结契约

1. 暂停的是 Y3Maker AI 面板、聊天设置、主菜单入口和 CodeMaker 启动链路。
2. 保留 `src/codemaker/`、`src/y3makerConfig.ts`、`src/mainMenu/pages/codemaker.ts` 和 `src/mainMenu/pages/y3makerConfigUpdate.ts`。
3. 不删除或改名 `Y3-Helper.MCP.StartMode`，不影响 Agent 接入中心和扩展内置 MCP 服务。
4. 不新增运行时 fallback 或自动恢复逻辑。

## 阶段详述

### 阶段 1: 断开可见入口

**目标**：从扩展清单和主菜单移除 Y3Maker 可见入口。

**待办清单**：
- [x] 删除 `codemaker-sidebar` 视图贡献。
- [x] 删除 `secondarySidebar` 的 `Y3Maker` 容器。
- [x] 删除 `y3-helper.codemaker.open` 命令。
- [x] 删除主菜单中的 `CodeMaker入口`。

**验收规格**：
- [x] VSIX 内 `extension/package.json` 不包含 `codemaker-sidebar`、`codemaker.webview` 或 `y3-helper.codemaker.open`。

### 阶段 2: 断开设置和启动链路

**目标**：不再暴露 Y3Maker 聊天设置，不再随扩展启动 CodeMaker 运行时。

**待办清单**：
- [x] 删除 `Y3Maker.CodeChat*` 设置项。
- [x] 删除 `activate()` 对 `initCodeMaker(context)` 的调用。
- [x] 删除 `deactivate()` 对 `stopCodeMaker()` 的调用。
- [x] 保留 `Y3-Helper.MCP.StartMode`。

**验收规格**：
- [x] 单元测试确认暂停入口缺失，MCP 启动模式仍保留。

### 阶段 3: 文档同步

**目标**：让维护者能区分“当前暂停态”和“后续恢复锚点”。

**待办清单**：
- [x] 更新 `README.md` 和 `CHANGELOG.md`。
- [x] 更新 `文档/README.md`。
- [x] 更新架构、启动流程、核心模块和功能流程文档。

**验收规格**：
- [x] 文档同时说明暂停范围、MCP 不受影响、恢复优先查看的文件。

## 验收清单

- [x] `npm run compile` 通过。
- [x] `npm test` 通过。
- [x] `npm run package:vsix` 生成 `dist/vsix/y3-helper-local-1.0.1.vsix`。
- [x] VSIX 清单核验确认没有 Y3Maker 侧边栏、webview、打开命令和聊天设置。
- [x] 搜索确认 `package.json`、`src/extension.ts`、`src/mainMenu/mainMenu.ts` 没有活动接线残留。

## 变更记录

| 日期 | 变更内容 | 影响范围 | 原因 | 审批人 |
|------|----------|----------|------|--------|
| 2026-07-04 | 建立暂停 Y3Maker 可见入口计划 | VSIX 清单、启动链路、主菜单、文档 | 当前功能未完成对接，安装态入口会误导用户 | 用户确认 |
