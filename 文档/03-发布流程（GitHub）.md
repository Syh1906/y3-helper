# 03 - 本地 VSIX 构建流程

## 1. 概述

当前分支只从源码构建 VSIX 安装包，不发布到 VSCode 插件市场。GitHub Actions 只保留构建检查，不承担发布职责。

| 流程 | 触发方式 | 做什么 |
|------|----------|--------|
| 本地构建 | 手动运行 `npm run package:vsix` | 生成本地安装用 `.vsix` |
| GitHub Actions 构建 | 推送 `main` 分支 | 编译并上传构建产物用于检查 |

---

## 2. 本地构建

### 步骤一：安装依赖

```bash
npm install
```

### 步骤二：构建 VSIX

```bash
npm run package:vsix
```

该命令会先执行 `vscode:prepublish`，再把安装包输出到：

```text
dist/vsix/y3-helper-xiaowei-1.0.6.vsix
```

### 步骤三：安装 VSIX

在 VSCode 中按 `Ctrl+Shift+P`，执行 `Extensions: Install from VSIX...`，选择 `dist/vsix` 下的安装包。

---

## 3. 构建检查

提交前建议运行：

```bash
npm run compile
npm run lint
npm run test:unit
npm run package:vsix
```

其中：

| 命令 | 用途 |
|------|------|
| `npm run compile` | 用 Webpack 生成开发模式 `dist/extension.js` |
| `npm run lint` | 检查 TypeScript 代码规范 |
| `npm run test:unit` | 运行单元测试入口 |
| `npm run package:vsix` | 构建最终 VSIX 安装包 |

---

## 4. GitHub Actions

`build.yml` 在推送 `main` 分支时运行。它会安装依赖、执行 TypeScript 编译检查，并生成 `dist/vsix/y3-helper-xiaowei-${{ github.sha }}.vsix` 作为 artifact。

当前分支没有自动发布工作流，也没有内网同步工作流。新增工作流时必须保持这个边界：只允许构建和检查，不允许发布到插件市场或同步到其他远端。

---

## 5. MCP 验证

MCP 服务由扩展进程内的 `dist/extension.js` 提供，不依赖独立的 `mcp-server.js`。

安装 VSIX 后，打开已初始化的 Y3 地图工程，在侧边栏执行：

```text
Y3开发助手 -> MCP Server -> 启动 MCP Server
```

随后检查健康接口：

```powershell
Invoke-RestMethod http://127.0.0.1:8766/health
```

预期返回中包含：

```text
status: ok
transport: streamable-http
port: 8766
```
