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

    test('removes the paused Y3Maker main menu entry while keeping Agent access center', () => {
        const mainMenuSource = readSource('src/mainMenu/mainMenu.ts');

        assert.strictEqual(mainMenuSource.includes('CodeMaker入口'), false);
        assert.strictEqual(mainMenuSource.includes('Y3MakerConfigUpdate'), false);
        assert.strictEqual(mainMenuSource.includes('Agent接入中心'), true);
    });

    test('keeps recovery anchors for future Y3Maker restoration', () => {
        assert.strictEqual(fs.existsSync(path.join(repoRoot, 'src', 'codemaker')), true);
        assert.strictEqual(fs.existsSync(path.join(repoRoot, 'src', 'y3makerConfig.ts')), true);
        assert.strictEqual(fs.existsSync(path.join(repoRoot, 'src', 'mainMenu', 'pages', 'codemaker.ts')), true);
    });
});
