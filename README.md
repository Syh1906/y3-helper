# English Version

[README-EN.md](./README-EN.md)

# Y3开发助手（本地分叉版）

这是 `Syh1906/y3-helper` 的本地 VSIX 分叉版。这个分支不发布到 VSCode 插件市场，只从源码构建 `.vsix` 后安装。扩展身份为 `syh1906.y3-helper-local`，版本线从 `1.0.0` 开始。当前版本暂停 Y3Maker AI 面板、聊天设置和启动链路，保留源码作为后续恢复锚点。

## 安装

### 从源码构建 VSIX

```bash
git clone https://github.com/Syh1906/y3-helper.git
cd y3-helper
npm install
npm run package:vsix
```

生成的安装包位于：

```text
dist/vsix/y3-helper-local-1.0.1.vsix
```

在 VSCode 中按 `Ctrl+Shift+P`，输入 `Extensions: Install from VSIX...`，选择该 `.vsix` 文件安装。

## 初始化项目（给新建的地图使用，老地图勿用）

1. 点击左侧栏“Y3开发助手”图标，点击“初始化”
2. 选择地图路径
3. 等待初始化完成

## 功能面板

包含“启动游戏”、“在编辑器中打开”、“查看日志”等常用功能。当前不会显示右侧 `Y3Maker` 面板，也不会在启动时拉起 CodeMaker API Server。

当使用此助手启动游戏后，游戏会连接到开发助手，并额外提供以下功能：

1. 一键热重载
2. 在“自定义视图”区显示仪表盘，可以监控游戏状态并快速重启
3. 在 VSCode 的“终端”区使用远程终端，显示游戏日志以及执行命令

## 物编支持

打开地图后，可以在 `资源管理器/Y3开发助手：物编数据` 中浏览、编辑物编数据（`.json` 文件）。

打开物编 json 文件后，可以在 `资源管理器/大纲/Y3开发助手：物编字段` 视图中以中文查看和跳转字段。

### 搜索

按下 `Ctrl+T` 即可搜索物编，例如使用 `#关羽` 来搜索名称中带有 “关羽” 的所有物编。使用 `#关羽.移动速度` 可以搜索到指定物编字段。

也可以使用数字 key 与英文字段名来搜索。分割符支持 `.` 和 `/`。

## 高级应用

### 自定义视图

你可以自己在自定义视图上画按钮，见[演示代码](https://github.com/Syh1906/y3-lualib/blob/main/%E6%BC%94%E7%A4%BA/Y3%E5%BC%80%E5%8F%91%E5%8A%A9%E6%89%8B/%E8%87%AA%E5%AE%9A%E4%B9%89%E8%A7%86%E5%9B%BE.lua)。

### 远程终端

可以在地图发布到平台后，使用远程终端功能调试线上地图。

> 应当只在测试服中启用此功能。

1. 在代码中埋入初始化代码：

    ```lua
    y3.game:event('玩家-发送指定消息', 'Link Start', function (trg, data)
        y3.develop.helper.init(11037)
    end)
    -- 允许在平台中执行本地代码
    y3.config.code.enable_local = true
    ```

2. 在 VSCode 设置中将 `Y3-Helper.ServerPort` 改为相同端口号 `11037`
3. 重启 VSCode，确保扩展应用新的端口号
4. 点击侧边栏的“Y3开发助手”图标，确保此助手已启动
5. 触发第 1 步中的初始化代码，连接远程终端

### 插件

插件是存放在地图中的 JavaScript 脚本，可以手动或自动运行，用于批量修改物编、生成 Lua 文件等任务。

在侧边栏的“Y3开发助手”中点击 `插件/初始化` 后，会在 `script/y3-helper/plugin` 目录中生成演示文件。

### MCP

MCP 是 Model Context Protocol 的缩写。这里的 MCP Server 是扩展内置的本地 HTTP 服务，用于让支持 MCP 的 AI 工具连接 Y3-Helper，进而启动游戏、读取状态、执行 Lua、读取日志和获取 UI 数据。

当前本地分叉版保留 MCP 能力，它不依赖已暂停的 Y3Maker 面板。扩展不提供独立的 `mcp-server.js` 文件；MCP 服务由 VSCode 扩展进程启动，地址为：

```text
http://127.0.0.1:8766/mcp
```

使用步骤：

1. 安装并启用 `syh1906.y3-helper-local` 扩展
2. 打开已初始化的 Y3 地图工程
3. 在侧边栏“Y3开发助手”中点击 `MCP Server/启动 MCP Server`
4. 用支持 Streamable HTTP MCP 的客户端连接 `http://127.0.0.1:8766/mcp`

可以用下面的命令检查服务是否已经启动：

```powershell
Invoke-RestMethod http://127.0.0.1:8766/health
```

预期返回中包含 `status: ok`、`transport: streamable-http` 和 `port: 8766`。

## 如何对本扩展进行二次开发

1. 安装 VSCode 和 Node.js
2. 下载本仓库源码
3. 使用 VSCode 打开项目文件夹
4. 在终端中运行 `npm install`
5. 按 `Ctrl+Shift+B` 启动实时编译
6. 按 `F5` 启动新的 VSCode 窗口测试代码
