import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as assert from 'assert';
import {
    applyAiDevEnvironment,
    inspectAiDevEnvironment,
    setAiMcpProjectConfigEnabled,
} from '../../aiDevEnvironmentApplier';
import {
    AI_DEV_ENV_MARKER,
    buildAiDevEnvironmentPlan,
    createClaudeMcpJson,
    createClaudeSettingsJson,
    createCodexConfigToml,
    createLegacyScriptAgentsMarkdown,
    createRootAgentsMarkdown,
    createScriptAgentsMarkdown,
    hasClaudeSettingsJsonConflict,
    readAiMcpProjectConfigState,
    hasCodexY3HelperMcpConflict,
    hasClaudeY3HelperMcpConflict,
    isManagedAiDevEnvironmentFile,
    normalizeRelativeLink,
} from '../../aiDevEnvironment';
import { MCP_ENDPOINT } from '../../mcp/agentContext';

function createLegacyY3MakerMcpSettingsJson(disabled: boolean): string {
    return `${JSON.stringify({
        mcpServers: {
            'y3-helper': {
                type: 'streamableHttp',
                url: 'http://127.0.0.1:8766/mcp',
                headers: {},
                timeout: 60,
                autoApprove: true,
                disabled,
            },
            y3editor: {
                type: 'streamableHttp',
                url: 'http://127.0.0.1:8765/mcp',
                headers: {},
                timeout: 60,
                autoApprove: true,
                disabled,
            },
            y3runtime: {
                type: 'streamableHttp',
                url: 'http://127.0.0.1:8767/mcp',
                headers: {},
                timeout: 60,
                autoApprove: true,
                disabled,
            },
        },
    }, null, 2)}\n`;
}

suite('AI development environment', () => {
    const snapshot = {
        projectRoot: 'E:/Maps/Y3_Helper_test01',
        mapRoot: 'E:/Maps/Y3_Helper_test01/maps/EntryMap',
        scriptRoot: 'E:/Maps/Y3_Helper_test01/maps/EntryMap/script',
        y3Root: 'E:/Maps/Y3_Helper_test01/maps/EntryMap/script/y3',
        currentMapName: 'EntryMap',
        mcpEndpoint: MCP_ENDPOINT,
        healthEndpoint: 'http://127.0.0.1:8766/health',
    };

    test('creates root AGENTS.md as module router instead of forcing script workspace', () => {
        const markdown = createRootAgentsMarkdown(snapshot);

        assert.ok(markdown.includes(AI_DEV_ENV_MARKER));
        assert.ok(markdown.includes('Y3_HELPER_AI_DEV_ENV:BEGIN'));
        assert.ok(markdown.includes('Y3_HELPER_AI_DEV_ENV:END'));
        assert.ok(markdown.includes('地图工程模块路由'));
        assert.ok(markdown.includes('常见任务入口'));
        assert.ok(markdown.includes('maps/EntryMap/script'));
        assert.ok(markdown.includes('main.lua'));
        assert.ok(markdown.includes('script/y3'));
        assert.ok(markdown.includes('默认只读'));
        assert.ok(markdown.includes('.y3maker'));
        assert.ok(markdown.includes('.log'));
        assert.strictEqual(markdown.includes('必须进入 script'), false);
    });

    test('uses the actual scriptRoot route instead of assuming EntryMap', () => {
        const markdown = createRootAgentsMarkdown({
            projectRoot: 'E:/Maps/MultiMap',
            scriptRoot: 'E:/Maps/MultiMap/maps/BossRush/script',
            currentMapName: undefined,
        });

        assert.ok(markdown.includes('maps/BossRush/script'));
        assert.strictEqual(markdown.includes('maps/EntryMap/script'), false);
    });

    test('creates script AGENTS.md for Lua business work', () => {
        const markdown = createScriptAgentsMarkdown(snapshot);

        assert.ok(markdown.includes('Y3_HELPER_AI_DEV_ENV:BEGIN'));
        assert.ok(markdown.includes('Y3_HELPER_AI_DEV_ENV:END'));
        assert.ok(markdown.includes('Lua 业务开发'));
        assert.ok(markdown.includes('maps/EntryMap/script'));
        assert.ok(markdown.includes('地图工程根目录'));
        assert.ok(markdown.includes('main.lua'));
        assert.ok(markdown.includes('可重载的代码.lua'));
        assert.ok(markdown.includes('y3-helper/meta'));
        assert.ok(markdown.includes('.vscode'));
        assert.ok(markdown.includes('.y3maker'));
        assert.ok(markdown.includes('.log'));
        assert.ok(markdown.includes('log/'));
        assert.ok(markdown.includes('y3-kernel-navigator'));
        assert.ok(markdown.includes('read_problems_lua'));
        assert.ok(markdown.includes('execute_lua'));
        assert.strictEqual(markdown.includes('E:/Maps/Y3_Helper_test01'), false);
    });

    test('keeps generated AGENTS markdown free of machine absolute paths', () => {
        const localSnapshot = {
            ...snapshot,
            projectRoot: 'E:/Program Files (x86)/kkduizhan/Games/y3/2.0/game/LocalData/Y3_Helper_test01',
            scriptRoot: 'E:/Program Files (x86)/kkduizhan/Games/y3/2.0/game/LocalData/Y3_Helper_test01/maps/EntryMap/script',
        };
        const markdown = [
            createRootAgentsMarkdown(localSnapshot),
            createScriptAgentsMarkdown(localSnapshot),
        ].join('\n');

        assert.ok(markdown.includes('maps/EntryMap/script'));
        assert.strictEqual(markdown.includes('E:/'), false);
        assert.strictEqual(markdown.includes('Program Files'), false);
    });

    test('builds default plan paths for Codex and Claude', () => {
        const plan = buildAiDevEnvironmentPlan({
            ...snapshot,
            skillSourceRoot: 'E:/CodeMoy/y3-lualib/.codex/skills/y3-kernel-navigator',
        });

        assert.strictEqual(plan.rootAgentsPath, 'E:/Maps/Y3_Helper_test01/AGENTS.md');
        assert.strictEqual(plan.rootClaudePath, 'E:/Maps/Y3_Helper_test01/CLAUDE.md');
        assert.strictEqual(plan.scriptAgentsPath, 'E:/Maps/Y3_Helper_test01/maps/EntryMap/script/AGENTS.md');
        assert.strictEqual(plan.scriptClaudePath, 'E:/Maps/Y3_Helper_test01/maps/EntryMap/script/CLAUDE.md');
        assert.strictEqual(plan.codexSkillTarget, 'E:/Maps/Y3_Helper_test01/.codex/skills/y3-kernel-navigator');
        assert.strictEqual(plan.claudeSkillLink, 'E:/Maps/Y3_Helper_test01/.claude/skills/y3-kernel-navigator');
        assert.strictEqual(plan.codexConfigPath, 'E:/Maps/Y3_Helper_test01/.codex/config.toml');
        assert.strictEqual(plan.claudeMcpPath, 'E:/Maps/Y3_Helper_test01/.mcp.json');
        assert.strictEqual(plan.scriptCodexConfigLink, 'E:/Maps/Y3_Helper_test01/maps/EntryMap/script/.codex/config.toml');
        assert.strictEqual(plan.scriptClaudeMcpLink, 'E:/Maps/Y3_Helper_test01/maps/EntryMap/script/.mcp.json');
        assert.strictEqual(plan.scriptClaudeSettingsLink, 'E:/Maps/Y3_Helper_test01/maps/EntryMap/script/.claude/settings.local.json');
        assert.strictEqual(plan.scriptCodexSkillLink, 'E:/Maps/Y3_Helper_test01/maps/EntryMap/script/.codex/skills/y3-kernel-navigator');
        assert.strictEqual(plan.scriptClaudeSkillLink, 'E:/Maps/Y3_Helper_test01/maps/EntryMap/script/.claude/skills/y3-kernel-navigator');
    });

    test('builds default plan paths even when kernel skill has not been initialized yet', () => {
        const plan = buildAiDevEnvironmentPlan(snapshot);

        assert.strictEqual(plan.codexSkillSource, undefined);
        assert.strictEqual(plan.codexSkillTarget, 'E:/Maps/Y3_Helper_test01/.codex/skills/y3-kernel-navigator');
        assert.strictEqual('y3MakerMcpSettingsPath' in plan, false);
    });

    test('creates Codex MCP config for y3-helper, y3editor, and y3runtime', () => {
        const toml = createCodexConfigToml('', true);

        assert.ok(toml.includes('[mcp_servers.y3-helper]'));
        assert.ok(toml.includes('url = "http://127.0.0.1:8766/mcp"'));
        assert.ok(toml.includes('[mcp_servers.y3editor]'));
        assert.ok(toml.includes('url = "http://127.0.0.1:8765/mcp"'));
        assert.ok(toml.includes('[mcp_servers.y3runtime]'));
        assert.ok(toml.includes('url = "http://127.0.0.1:8767/mcp"'));
        assert.ok(toml.includes('enabled = true'));
    });

    test('disables Codex MCP config without deleting the server block', () => {
        const enabled = createCodexConfigToml('', true);
        const disabled = createCodexConfigToml(enabled, false);

        assert.ok(disabled.includes('[mcp_servers.y3-helper]'));
        assert.ok(disabled.includes('enabled = false'));
    });

    test('creates Claude project MCP json for the three Y3 MCP tools', () => {
        const json = createClaudeMcpJson('', true);
        const parsed = JSON.parse(json);

        assert.deepStrictEqual(Object.keys(parsed.mcpServers), ['y3-helper', 'y3editor', 'y3runtime']);
        assert.strictEqual(parsed.mcpServers['y3-helper'].url, 'http://127.0.0.1:8766/mcp');
        assert.strictEqual(parsed.mcpServers.y3editor.url, 'http://127.0.0.1:8765/mcp');
        assert.strictEqual(parsed.mcpServers.y3runtime.url, 'http://127.0.0.1:8767/mcp');
    });

    test('creates Claude settings that can disable three Y3 MCP tools while preserving other disabled servers', () => {
        const json = createClaudeSettingsJson('{ "disabledMcpjsonServers": ["other"] }', false);
        const parsed = JSON.parse(json);

        assert.deepStrictEqual(parsed.disabledMcpjsonServers.sort(), ['other', 'y3-helper', 'y3editor', 'y3runtime']);
    });

    test('detects existing Codex y3-helper MCP config with a different URL as conflict', () => {
        const existing = [
            '[mcp_servers.y3-helper]',
            'url = "http://127.0.0.1:9999/mcp"',
            'enabled = true',
            '',
        ].join('\n');

        assert.strictEqual(hasCodexY3HelperMcpConflict(existing), true);
        assert.strictEqual(hasCodexY3HelperMcpConflict(createCodexConfigToml('', true)), false);
    });

    test('detects incomplete existing Codex y3-helper MCP config as conflict', () => {
        const existing = [
            '[mcp_servers.y3-helper]',
            'enabled = true',
            '',
        ].join('\n');

        assert.strictEqual(hasCodexY3HelperMcpConflict(existing), true);
    });

    test('updates quoted Codex MCP server tables instead of appending duplicates', () => {
        const existing = [
            '[mcp_servers."y3-helper"]',
            'url = "http://127.0.0.1:8766/mcp"',
            'enabled = false',
            '',
        ].join('\n');

        const updated = createCodexConfigToml(existing, true);

        assert.strictEqual((updated.match(/y3-helper/g) ?? []).length, 1);
        assert.ok(updated.includes('[mcp_servers."y3-helper"]'));
        assert.ok(updated.includes('enabled = true'));
        assert.strictEqual(hasCodexY3HelperMcpConflict(existing), false);
    });

    test('preserves custom Codex MCP fields while toggling managed Y3 server fields', () => {
        const existing = [
            '[mcp_servers.y3-helper]',
            'url = "http://127.0.0.1:8766/mcp"',
            'enabled = true',
            'custom_flag = "keep"',
            '',
        ].join('\n');

        const updated = createCodexConfigToml(existing, false);

        assert.ok(updated.includes('enabled = false'));
        assert.ok(updated.includes('custom_flag = "keep"'));
        assert.strictEqual((updated.match(/\[mcp_servers\.y3-helper\]/g) ?? []).length, 1);
    });

    test('detects existing Claude y3-helper MCP config with a different URL as conflict', () => {
        const existing = JSON.stringify({
            mcpServers: {
                'y3-helper': {
                    type: 'http',
                    url: 'http://127.0.0.1:9999/mcp',
                },
            },
        });

        assert.strictEqual(hasClaudeY3HelperMcpConflict(existing), true);
        assert.strictEqual(hasClaudeY3HelperMcpConflict(createClaudeMcpJson('', true)), false);
    });

    test('preserves custom Claude MCP fields while toggling managed Y3 server fields', () => {
        const existing = JSON.stringify({
            mcpServers: {
                'y3-helper': {
                    type: 'http',
                    url: 'http://127.0.0.1:8766/mcp',
                    headers: {
                        'x-custom': 'keep',
                    },
                    note: 'keep me',
                    disabled: false,
                },
            },
        });

        const parsed = JSON.parse(createClaudeMcpJson(existing, false));

        assert.strictEqual(parsed.mcpServers['y3-helper'].disabled, true);
        assert.strictEqual(parsed.mcpServers['y3-helper'].note, 'keep me');
        assert.deepStrictEqual(parsed.mcpServers['y3-helper'].headers, { 'x-custom': 'keep' });
    });

    test('detects incomplete existing Claude y3-helper MCP config as conflict', () => {
        const existing = JSON.stringify({
            mcpServers: {
                'y3-helper': {
                    type: 'http',
                },
            },
        });

        assert.strictEqual(hasClaudeY3HelperMcpConflict(existing), true);
    });

    test('detects existing Codex and Claude MCP URL conflicts', () => {
        assert.strictEqual(hasCodexY3HelperMcpConflict([
            '[mcp_servers.y3runtime]',
            'url = "http://127.0.0.1:9999/mcp"',
        ].join('\n')), true);

        assert.strictEqual(hasClaudeY3HelperMcpConflict(JSON.stringify({
            mcpServers: {
                y3editor: {
                    url: 'http://127.0.0.1:9999/mcp',
                },
            },
        })), true);
    });

    test('reports malformed JSON MCP files as conflicts without writing outputs', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'y3-helper-ai-bad-json-'));
        try {
            const input = {
                projectRoot: root,
                scriptRoot: path.join(root, 'maps', 'EntryMap', 'script'),
                currentMapName: 'EntryMap',
            };
            const plan = buildAiDevEnvironmentPlan(input);
            await fs.mkdir(path.dirname(plan.claudeMcpPath), { recursive: true });
            await fs.writeFile(plan.claudeMcpPath, '{ bad json', 'utf8');

            const result = await inspectAiDevEnvironment(input);

            assert.ok(result.conflicts.includes(plan.claudeMcpPath));
            await assert.rejects(() => applyAiDevEnvironment(input), /存在用户自定义 AI 配置文件/);
            await assert.rejects(() => fs.stat(plan.rootAgentsPath), { code: 'ENOENT' });
        } finally {
            await fs.rm(root, { recursive: true, force: true });
        }
    });

    test('calculates relative link targets with forward slashes', () => {
        assert.strictEqual(
            normalizeRelativeLink('E:/Map/.claude/skills/y3-kernel-navigator', 'E:/Map/.codex/skills/y3-kernel-navigator'),
            '../../.codex/skills/y3-kernel-navigator',
        );
    });

    test('recognizes only marker-owned files as managed files', () => {
        assert.strictEqual(isManagedAiDevEnvironmentFile(`${AI_DEV_ENV_MARKER}\n# title`), true);
        assert.strictEqual(isManagedAiDevEnvironmentFile('# user notes'), false);
        assert.strictEqual(isManagedAiDevEnvironmentFile(''), false);
    });

    test('reports malformed Claude local settings as conflicts before writing MCP outputs', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'y3-helper-ai-bad-settings-'));
        try {
            const input = {
                projectRoot: root,
                scriptRoot: path.join(root, 'maps', 'EntryMap', 'script'),
                currentMapName: 'EntryMap',
            };
            const plan = buildAiDevEnvironmentPlan(input);
            await fs.mkdir(path.dirname(plan.codexConfigPath), { recursive: true });
            await fs.mkdir(path.dirname(plan.claudeMcpPath), { recursive: true });
            await fs.mkdir(path.dirname(plan.claudeSettingsPath), { recursive: true });
            await fs.writeFile(plan.codexConfigPath, createCodexConfigToml('', true), 'utf8');
            await fs.writeFile(plan.claudeMcpPath, createClaudeMcpJson('', true), 'utf8');
            await fs.writeFile(plan.claudeSettingsPath, '{ bad json', 'utf8');
            const beforeCodex = await fs.readFile(plan.codexConfigPath, 'utf8');
            const beforeClaudeMcp = await fs.readFile(plan.claudeMcpPath, 'utf8');

            const result = await inspectAiDevEnvironment(input);

            assert.ok(result.conflicts.includes(plan.claudeSettingsPath));
            assert.strictEqual(hasClaudeSettingsJsonConflict('{}'), false);
            assert.throws(() => hasClaudeSettingsJsonConflict('{ bad json'));
            await assert.rejects(() => setAiMcpProjectConfigEnabled(input, false), /存在同名但地址不同/);
            assert.strictEqual(await fs.readFile(plan.codexConfigPath, 'utf8'), beforeCodex);
            assert.strictEqual(await fs.readFile(plan.claudeMcpPath, 'utf8'), beforeClaudeMcp);
            assert.strictEqual(await fs.readFile(plan.claudeSettingsPath, 'utf8'), '{ bad json');
        } finally {
            await fs.rm(root, { recursive: true, force: true });
        }
    });

    test('keeps user extensions outside managed AGENTS blocks during repair', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'y3-helper-ai-user-extended-'));
        try {
            const input = {
                projectRoot: root,
                scriptRoot: path.join(root, 'maps', 'EntryMap', 'script'),
                currentMapName: 'EntryMap',
            };
            const plan = buildAiDevEnvironmentPlan(input);
            await applyAiDevEnvironment(input);
            await fs.appendFile(plan.scriptAgentsPath, '\n## 用户扩展\n\n- 保留我的项目约定。\n', 'utf8');

            const result = await inspectAiDevEnvironment(input);
            assert.strictEqual(result.conflicts.includes(plan.scriptAgentsPath), false);

            await applyAiDevEnvironment(input);

            assert.ok((await fs.readFile(plan.scriptAgentsPath, 'utf8')).includes('保留我的项目约定'));
        } finally {
            await fs.rm(root, { recursive: true, force: true });
        }
    });

    test('upgrades legacy generated AGENTS files with appended user content into managed blocks', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'y3-helper-ai-legacy-append-'));
        try {
            const input = {
                projectRoot: root,
                scriptRoot: path.join(root, 'maps', 'EntryMap', 'script'),
                currentMapName: 'EntryMap',
            };
            const plan = buildAiDevEnvironmentPlan(input);
            await fs.mkdir(path.dirname(plan.scriptAgentsPath), { recursive: true });
            const legacy = `${createLegacyScriptAgentsMarkdown(input)}\n\n## 用户扩展\n\n- 保留旧版追加内容。\n`;
            await fs.writeFile(plan.scriptAgentsPath, legacy, 'utf8');

            const result = await inspectAiDevEnvironment(input);
            assert.strictEqual(result.conflicts.includes(plan.scriptAgentsPath), false);

            await applyAiDevEnvironment(input);
            const updated = await fs.readFile(plan.scriptAgentsPath, 'utf8');

            assert.ok(updated.includes('Y3_HELPER_AI_DEV_ENV:BEGIN'));
            assert.ok(updated.includes('Y3_HELPER_AI_DEV_ENV:END'));
            assert.ok(updated.includes('保留旧版追加内容'));
        } finally {
            await fs.rm(root, { recursive: true, force: true });
        }
    });

    test('toggles MCP project config without requiring an existing skill source', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'y3-helper-ai-mcp-'));
        try {
            const scriptRoot = path.join(root, 'maps', 'EntryMap', 'script');
            const input = {
                projectRoot: root,
                scriptRoot,
                currentMapName: 'EntryMap',
                skillSourceRoot: path.join(root, 'missing-skill-source'),
            };
            const plan = buildAiDevEnvironmentPlan(input);

            await setAiMcpProjectConfigEnabled(input, false);

            const codexConfig = await fs.readFile(plan.codexConfigPath, 'utf8');
            assert.strictEqual((codexConfig.match(/enabled = false/g) ?? []).length, 3);
            const claudeMcp = JSON.parse(await fs.readFile(plan.claudeMcpPath, 'utf8'));
            assert.strictEqual(claudeMcp.mcpServers['y3-helper'].disabled, true);
            assert.strictEqual(claudeMcp.mcpServers.y3editor.disabled, true);
            assert.strictEqual(claudeMcp.mcpServers.y3runtime.disabled, true);
            const settings = JSON.parse(await fs.readFile(plan.claudeSettingsPath, 'utf8'));
            assert.deepStrictEqual(settings.disabledMcpjsonServers.sort(), ['y3-helper', 'y3editor', 'y3runtime']);
            assert.deepStrictEqual(readAiMcpProjectConfigState({
                codexConfigContent: codexConfig,
                claudeMcpContent: JSON.stringify(claudeMcp),
                claudeSettingsContent: JSON.stringify(settings),
            }), {
                codexEnabled: false,
                claudeMcpEnabled: false,
                claudeSettingsEnabled: false,
            });

            await setAiMcpProjectConfigEnabled(input, true);

            const enabledCodexConfig = await fs.readFile(plan.codexConfigPath, 'utf8');
            assert.strictEqual((enabledCodexConfig.match(/enabled = true/g) ?? []).length, 3);
            const enabledClaudeMcp = JSON.parse(await fs.readFile(plan.claudeMcpPath, 'utf8'));
            assert.strictEqual(enabledClaudeMcp.mcpServers['y3-helper'].disabled, false);
            assert.strictEqual(enabledClaudeMcp.mcpServers.y3editor.disabled, false);
            assert.strictEqual(enabledClaudeMcp.mcpServers.y3runtime.disabled, false);
            const enabledSettings = JSON.parse(await fs.readFile(plan.claudeSettingsPath, 'utf8'));
            assert.deepStrictEqual(enabledSettings.enabledMcpjsonServers.sort(), ['y3-helper', 'y3editor', 'y3runtime']);
            assert.deepStrictEqual(enabledSettings.disabledMcpjsonServers, []);
            await assert.rejects(() => fs.stat(path.join(root, '.y3maker', 'mcp_settings.json')), { code: 'ENOENT' });
            await assert.rejects(() => fs.stat(path.join(scriptRoot, '.y3maker', 'mcp_settings.json')), { code: 'ENOENT' });
        } finally {
            await fs.rm(root, { recursive: true, force: true });
        }
    });

    test('continues AGENTS and MCP initialization when skill source is missing', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'y3-helper-ai-apply-'));
        try {
            const input = {
                projectRoot: root,
                scriptRoot: path.join(root, 'maps', 'EntryMap', 'script'),
                currentMapName: 'EntryMap',
                skillSourceRoot: path.join(root, 'missing-skill-source'),
            };
            const plan = buildAiDevEnvironmentPlan(input);

            const result = await applyAiDevEnvironment(input);

            assert.strictEqual(result.skillStatus, 'skipped');
            assert.ok((await fs.readFile(path.join(root, '.gitignore'), 'utf8')).includes('/.claude/settings.local.json'));
            assert.ok((await fs.readFile(plan.rootAgentsPath, 'utf8')).includes(AI_DEV_ENV_MARKER));
            assert.ok((await fs.readFile(plan.scriptAgentsPath, 'utf8')).includes(AI_DEV_ENV_MARKER));
            assert.ok((await fs.readFile(plan.codexConfigPath, 'utf8')).includes('[mcp_servers.y3runtime]'));
            await assert.rejects(() => fs.stat(plan.codexSkillTarget), { code: 'ENOENT' });
            await assert.rejects(() => fs.stat(path.join(root, '.y3maker', 'mcp_settings.json')), { code: 'ENOENT' });
        } finally {
            await fs.rm(root, { recursive: true, force: true });
        }
    });

    test('links script workspace MCP config files back to the project root', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'y3-helper-ai-script-links-'));
        try {
            const skillSourceRoot = path.join(root, 'skill-source');
            const input = {
                projectRoot: root,
                scriptRoot: path.join(root, 'maps', 'EntryMap', 'script'),
                currentMapName: 'EntryMap',
                skillSourceRoot,
            };
            await fs.mkdir(skillSourceRoot, { recursive: true });
            await fs.writeFile(path.join(skillSourceRoot, 'SKILL.md'), '---\nname: y3-kernel-navigator\n---\n', 'utf8');
            const plan = buildAiDevEnvironmentPlan(input);

            await applyAiDevEnvironment(input);

            assert.strictEqual((await fs.lstat(plan.scriptCodexConfigLink)).isSymbolicLink(), true);
            assert.strictEqual((await fs.lstat(plan.scriptClaudeMcpLink)).isSymbolicLink(), true);
            assert.strictEqual((await fs.lstat(plan.scriptClaudeSettingsLink)).isSymbolicLink(), true);
            assert.strictEqual((await fs.lstat(plan.scriptCodexSkillLink)).isSymbolicLink(), true);
            assert.strictEqual((await fs.lstat(plan.scriptClaudeSkillLink)).isSymbolicLink(), true);
            assert.strictEqual(
                normalizeRelativeLink(plan.scriptCodexConfigLink, plan.codexConfigPath),
                (await fs.readlink(plan.scriptCodexConfigLink)).replace(/\\/g, '/'),
            );
            assert.strictEqual(
                normalizeRelativeLink(plan.scriptClaudeMcpLink, plan.claudeMcpPath),
                (await fs.readlink(plan.scriptClaudeMcpLink)).replace(/\\/g, '/'),
            );
        } finally {
            await fs.rm(root, { recursive: true, force: true });
        }
    });

    test('removes obsolete Y3-Helper McpHub settings only when they match the legacy generated shape', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'y3-helper-ai-y3maker-cleanup-'));
        try {
            const scriptRoot = path.join(root, 'maps', 'EntryMap', 'script');
            const input = {
                projectRoot: root,
                scriptRoot,
                currentMapName: 'EntryMap',
            };
            const rootLegacyPath = path.join(root, '.y3maker', 'mcp_settings.json');
            const scriptLegacyPath = path.join(scriptRoot, '.y3maker', 'mcp_settings.json');
            await fs.mkdir(path.dirname(rootLegacyPath), { recursive: true });
            await fs.mkdir(path.dirname(scriptLegacyPath), { recursive: true });
            await fs.writeFile(rootLegacyPath, createLegacyY3MakerMcpSettingsJson(false), 'utf8');
            await fs.writeFile(scriptLegacyPath, createLegacyY3MakerMcpSettingsJson(true), 'utf8');

            await applyAiDevEnvironment(input);

            await assert.rejects(() => fs.stat(rootLegacyPath), { code: 'ENOENT' });
            await assert.rejects(() => fs.stat(scriptLegacyPath), { code: 'ENOENT' });

            await fs.writeFile(scriptLegacyPath, JSON.stringify({
                mcpServers: {
                    custom: {
                        type: 'streamableHttp',
                        url: 'http://127.0.0.1:9999/mcp',
                    },
                },
            }, null, 2), 'utf8');

            const result = await inspectAiDevEnvironment(input);

            assert.ok(result.conflicts.includes(scriptLegacyPath));
            await assert.rejects(() => applyAiDevEnvironment(input), /存在用户自定义 AI 配置文件/);
            await assert.rejects(() => setAiMcpProjectConfigEnabled(input, false), /存在同名但地址不同/);
            assert.ok((await fs.readFile(scriptLegacyPath, 'utf8')).includes('custom'));
        } finally {
            await fs.rm(root, { recursive: true, force: true });
        }
    });

    test('keeps Claude local settings out of Git while preserving existing ignore rules', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'y3-helper-ai-gitignore-'));
        try {
            const scriptRoot = path.join(root, 'maps', 'EntryMap', 'script');
            const input = {
                projectRoot: root,
                scriptRoot,
                currentMapName: 'EntryMap',
            };
            await fs.writeFile(path.join(root, '.gitignore'), '# existing\n*.log\n', 'utf8');

            await applyAiDevEnvironment(input);
            await setAiMcpProjectConfigEnabled(input, false);

            const gitignore = await fs.readFile(path.join(root, '.gitignore'), 'utf8');
            const gitignoreLines = gitignore.split(/\r?\n/);
            assert.ok(gitignore.includes('# existing'));
            assert.ok(gitignore.includes('*.log'));
            assert.strictEqual(gitignoreLines.filter((line) => line === '/.claude/settings.local.json').length, 1);
            assert.strictEqual(gitignoreLines.filter((line) => line === '/maps/EntryMap/script/.claude/settings.local.json').length, 1);
            assert.ok(gitignore.includes('/maps/EntryMap/script/.claude/settings.local.json'));
        } finally {
            await fs.rm(root, { recursive: true, force: true });
        }
    });

    test('can sync the kernel skill on a later repair after an earlier skip', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'y3-helper-ai-resume-'));
        try {
            const skillSourceRoot = path.join(root, 'skill-source');
            const input = {
                projectRoot: root,
                scriptRoot: path.join(root, 'maps', 'EntryMap', 'script'),
                currentMapName: 'EntryMap',
                skillSourceRoot,
            };
            const plan = buildAiDevEnvironmentPlan(input);

            const skipped = await applyAiDevEnvironment(input);
            assert.strictEqual(skipped.skillStatus, 'skipped');
            await assert.rejects(() => fs.stat(plan.codexSkillTarget), { code: 'ENOENT' });

            await fs.mkdir(skillSourceRoot, { recursive: true });
            await fs.writeFile(path.join(skillSourceRoot, 'SKILL.md'), '---\nname: y3-kernel-navigator\n---\n', 'utf8');

            const synced = await applyAiDevEnvironment(input);
            assert.strictEqual(synced.skillStatus, 'synced');
            assert.ok((await fs.readFile(path.join(plan.codexSkillTarget, 'SKILL.md'), 'utf8')).includes('y3-kernel-navigator'));
            assert.ok((await fs.lstat(plan.claudeSkillLink)).isSymbolicLink());
            assert.ok((await fs.lstat(plan.scriptCodexSkillLink)).isSymbolicLink());
            assert.ok((await fs.lstat(plan.scriptClaudeSkillLink)).isSymbolicLink());
        } finally {
            await fs.rm(root, { recursive: true, force: true });
        }
    });

    test('treats existing symlink to a different target as conflict', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'y3-helper-ai-link-'));
        try {
            const scriptRoot = path.join(root, 'maps', 'EntryMap', 'script');
            const skillSourceRoot = path.join(root, 'skill-source');
            const customTarget = path.join(root, 'custom-agents.md');
            await fs.mkdir(scriptRoot, { recursive: true });
            await fs.mkdir(skillSourceRoot, { recursive: true });
            await fs.writeFile(customTarget, '# custom\n', 'utf8');

            const input = {
                projectRoot: root,
                scriptRoot,
                currentMapName: 'EntryMap',
                skillSourceRoot,
            };
            const plan = buildAiDevEnvironmentPlan(input);
            await fs.symlink('custom-agents.md', plan.rootClaudePath, 'file');

            const result = await inspectAiDevEnvironment(input);

            assert.ok(result.conflicts.includes(plan.rootClaudePath));
        } finally {
            await fs.rm(root, { recursive: true, force: true });
        }
    });

    test('does not overwrite script config links when toggling MCP project config', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'y3-helper-ai-toggle-link-'));
        try {
            const scriptRoot = path.join(root, 'maps', 'EntryMap', 'script');
            const input = {
                projectRoot: root,
                scriptRoot,
                currentMapName: 'EntryMap',
            };
            const plan = buildAiDevEnvironmentPlan(input);
            const customMcpJson = path.join(root, 'custom-mcp.json');
            await fs.mkdir(path.dirname(plan.scriptClaudeMcpLink), { recursive: true });
            await fs.writeFile(customMcpJson, '{}\n', 'utf8');
            await fs.symlink(path.relative(path.dirname(plan.scriptClaudeMcpLink), customMcpJson), plan.scriptClaudeMcpLink, 'file');

            await assert.rejects(() => setAiMcpProjectConfigEnabled(input, false), /存在同名但地址不同/);

            assert.strictEqual(
                path.resolve(path.dirname(plan.scriptClaudeMcpLink), await fs.readlink(plan.scriptClaudeMcpLink)),
                customMcpJson,
            );
        } finally {
            await fs.rm(root, { recursive: true, force: true });
        }
    });
});
