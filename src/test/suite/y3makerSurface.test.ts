import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..', '..');

function readPackageJson(): any {
    const packageJsonPath = path.join(repoRoot, 'package.json');
    return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
}

function readSource(relativePath: string): string {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

suite('Y3Maker paused surface', () => {
    test('does not expose the paused Y3Maker sidebar, webview, command, or chat settings', () => {
        const manifest = readPackageJson();
        const contributes = manifest.contributes ?? {};

        assert.strictEqual(contributes.views?.['codemaker-sidebar'], undefined);
        assert.strictEqual(contributes.viewsContainers?.secondarySidebar, undefined);

        const commands = contributes.commands ?? [];
        assert.strictEqual(
            commands.some((command: { command?: string }) => command.command === 'y3-helper.codemaker.open'),
            false
        );

        const properties = contributes.configuration?.properties ?? {};
        const pausedSettings = [
            'Y3Maker.CodeChatApiKey',
            'Y3Maker.CodeChatApiBaseUrl',
            'Y3Maker.CodeChatModel',
            'Y3Maker.CodeChatWireApi',
            'Y3Maker.CodeChatRequestTimeoutMs',
            'Y3Maker.CodeChatMaxOutputTokens',
            'Y3Maker.CodeChatContextWindowSize',
        ];

        for (const setting of pausedSettings) {
            assert.strictEqual(properties[setting], undefined, `${setting} should not be exposed`);
        }

        assert.ok(properties['Y3-Helper.MCP.StartMode'], 'MCP start mode must stay exposed');
    });

    test('does not initialize the paused CodeMaker runtime on extension activation', () => {
        const extensionSource = readSource('src/extension.ts');

        assert.strictEqual(extensionSource.includes('initCodeMaker'), false);
        assert.strictEqual(extensionSource.includes('stopCodeMaker'), false);
    });

    test('removes the paused Y3Maker main menu entry without duplicating Agent access center', () => {
        const mainMenuSource = readSource('src/mainMenu/mainMenu.ts');
        const featuresSource = readSource('src/mainMenu/pages/features.ts');

        assert.strictEqual(mainMenuSource.includes('CodeMaker入口'), false);
        assert.strictEqual(mainMenuSource.includes('Y3MakerConfigUpdate'), false);
        assert.strictEqual(mainMenuSource.includes('Agent接入中心'), false);
        assert.strictEqual(mainMenuSource.includes('new Agent接入中心'), false);
        assert.ok(featuresSource.includes('Agent 接入中心'));
    });

    test('keeps Agent access center and AI environment initialization commands exposed', () => {
        const manifest = readPackageJson();
        const commands = manifest.contributes?.commands ?? [];
        const commandIds = commands.map((command: { command?: string }) => command.command);

        assert.ok(commandIds.includes('y3-helper.openAgentAccessCenter'));
        assert.ok(commandIds.includes('y3-helper.createAgentsMarkdown'));
        assert.ok(commandIds.includes('y3-helper.initializeAiDevEnvironment'));
        assert.ok(commandIds.includes('y3-helper.enableAiMcpConfig'));
        assert.ok(commandIds.includes('y3-helper.disableAiMcpConfig'));
    });

    test('does not route AI environment initialization through the paused McpHub client', () => {
        const agentAccessCenterSource = readSource('src/agentAccessCenter.ts');

        assert.strictEqual(agentAccessCenterSource.includes('getMcpHub'), false);
        assert.strictEqual(agentAccessCenterSource.includes('restartAllConnections'), false);
    });

    test('refreshes Agent access center state after MCP start or stop actions', () => {
        const agentAccessCenterSource = readSource('src/agentAccessCenter.ts');

        assert.ok(agentAccessCenterSource.includes('getMcpToggleAction(running)'));
        assert.ok(agentAccessCenterSource.includes('isMcpToggleActionStale(picked.action, options.isMcpRunning())'));
        assert.ok(agentAccessCenterSource.includes('shouldRefreshAgentAccessCenterAfterAction(picked.action)'));
        assert.ok(agentAccessCenterSource.includes("executeCommand('y3-helper.openAgentAccessCenter')"));
    });

    test('shows MCP runtime status and Agent config entry in the main menu', () => {
        const featuresSource = readSource('src/mainMenu/pages/features.ts');
        const extensionSource = readSource('src/extension.ts');
        const agentAccessCenterSource = readSource('src/agentAccessCenter.ts');

        assert.ok(featuresSource.includes('getMcpRuntimeStatusDescription'));
        assert.ok(featuresSource.includes('getMcpRuntimeStatusTooltip'));
        assert.ok(featuresSource.includes('MCP 运行状态'));
        assert.ok(featuresSource.includes('Agent 配置状态'));
        assert.ok(featuresSource.includes('Agent 接入中心'));
        assert.ok(featuresSource.includes('y3-helper.openAgentAccessCenter'));
        assert.ok(featuresSource.includes('y3-helper.enableAiMcpConfig'));
        assert.ok(featuresSource.includes('y3-helper.disableAiMcpConfig'));
        assert.ok(agentAccessCenterSource.includes('y3-helper.enableAiMcpConfig'));
        assert.ok(agentAccessCenterSource.includes('y3-helper.disableAiMcpConfig'));
        assert.ok(agentAccessCenterSource.includes('getAgentMcpProjectConfigDescription(projectConfigState)'));
        assert.ok(agentAccessCenterSource.includes('refreshMainMenu()'));
        assert.ok(featuresSource.includes('本地 8766 MCP 服务'));
        assert.strictEqual(featuresSource.includes('Claude Code'), false);
        assert.strictEqual(extensionSource.includes("mainMenu.refresh('功能/MCP Server')"), false);
        assert.ok(extensionSource.includes('mainMenu.refresh();'));
        assert.ok(extensionSource.includes('this.tcpServer?.dispose();'));
    });

    test('keeps recovery anchors for future Y3Maker restoration', () => {
        assert.strictEqual(fs.existsSync(path.join(repoRoot, 'src', 'codemaker')), true);
        assert.strictEqual(fs.existsSync(path.join(repoRoot, 'src', 'y3makerConfig.ts')), true);
        assert.strictEqual(fs.existsSync(path.join(repoRoot, 'src', 'mainMenu', 'pages', 'codemaker.ts')), true);
    });
});
