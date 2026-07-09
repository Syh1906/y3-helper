# Y3 Helper Xiaowei Edition

This is the Xiaowei edition of `Syh1906/y3-helper`. This branch is not published to the VSCode Marketplace. Build the `.vsix` package from source and install it manually.

Extension identity:

```text
syh1906.y3-helper-xiaowei
```

## Install

```bash
git clone https://github.com/Syh1906/y3-helper.git
cd y3-helper
npm install
npm run package:vsix
```

The VSIX package is generated at:

```text
dist/vsix/y3-helper-xiaowei-1.0.9.vsix
```

In VSCode, run `Extensions: Install from VSIX...` and select the generated file.

## Features

Y3 Helper supports common Y3 map development tasks:

1. Project initialization for new maps
2. Launching the game and editor
3. Lua debugging and log viewing
4. Object editor data browsing and editing
5. Excel table import
6. Plugin scripts
7. Built-in MCP HTTP server

## MCP

MCP means Model Context Protocol. In this fork, the MCP server runs inside the VSCode extension process. It does not use a standalone `mcp-server.js` file.

Start it from the sidebar:

```text
Y3开发助手 -> MCP Server -> 启动 MCP Server
```

Then connect an MCP client that supports Streamable HTTP to:

```text
http://127.0.0.1:8766/mcp
```

The sidebar `MCP Server` node shows the current local server state: running, not running, or disabled by settings. Starting or stopping the MCP server only controls the local 8766 service inside the extension. It does not change the enabled state in Codex or Claude project MCP configuration files.

To enable or disable Codex / Claude project MCP configuration, open `MCP Server -> Agent 接入中心` and use the AI MCP project config actions.

After starting or stopping the MCP server, connected external agent clients usually do not refresh their MCP connection state automatically. Restart or refresh the agent client if it still shows the old state.

Health check:

```powershell
Invoke-RestMethod http://127.0.0.1:8766/health
```

Expected fields include `status: ok`, `transport: streamable-http`, and `port: 8766`.

## Development

1. Install VSCode and Node.js
2. Open this repository in VSCode
3. Run `npm install`
4. Press `Ctrl+Shift+B` to compile
5. Press `F5` to launch an extension development host
