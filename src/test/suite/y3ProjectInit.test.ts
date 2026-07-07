import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
    isY3LibraryUsable,
    planProjectConfigCopy,
    resolveY3LibraryState,
} from '../../y3ProjectInit';

suite('Y3 project initialization helpers', () => {
    suite('resolveY3LibraryState', () => {
        test('treats missing y3 directory as missing', async () => {
            const root = await fs.mkdtemp(path.join(os.tmpdir(), 'y3-init-missing-'));
            const state = await resolveY3LibraryState(path.join(root, 'y3'));

            assert.strictEqual(state.kind, 'missing');
            await fs.rm(root, { recursive: true, force: true });
        });

        test('accepts manually copied y3 library without git directory', async () => {
            const y3Path = await createY3LibraryFixture({ git: false, config: true });

            const state = await resolveY3LibraryState(y3Path);

            assert.strictEqual(state.kind, 'manual-copy-valid');
            assert.strictEqual(await isY3LibraryUsable(y3Path), true);
            await fs.rm(path.dirname(y3Path), { recursive: true, force: true });
        });

        test('accepts git y3 library with required layout', async () => {
            const y3Path = await createY3LibraryFixture({ git: true, config: true });

            const state = await resolveY3LibraryState(y3Path);

            assert.strictEqual(state.kind, 'git-valid');
            assert.strictEqual(await isY3LibraryUsable(y3Path), true);
            await fs.rm(path.dirname(y3Path), { recursive: true, force: true });
        });

        test('rejects existing non-git y3 directory without project config template', async () => {
            const y3Path = await createY3LibraryFixture({ git: false, config: false });

            const state = await resolveY3LibraryState(y3Path);

            assert.strictEqual(state.kind, 'invalid');
            assert.ok(state.reason.includes('演示/项目配置'));
            assert.strictEqual(await isY3LibraryUsable(y3Path), false);
            await fs.rm(path.dirname(y3Path), { recursive: true, force: true });
        });
    });

    suite('planProjectConfigCopy', () => {
        test('plans config copy without overwriting by default', async () => {
            const fixture = await createConfigFixture({ existingMain: true });

            const plan = await planProjectConfigCopy(fixture.source, fixture.target, { overwrite: false });

            assert.ok(plan.conflicts.some(item => item.relativePath === 'main.lua'));
            assert.strictEqual(plan.copyItems.some(item => item.relativePath === 'main.lua'), false);
            assert.ok(plan.copyItems.some(item => item.relativePath === '.luarc.json'));
            await fs.rm(fixture.root, { recursive: true, force: true });
        });

        test('plans config copy with overwrite only when requested', async () => {
            const fixture = await createConfigFixture({ existingMain: true });

            const plan = await planProjectConfigCopy(fixture.source, fixture.target, { overwrite: true });

            assert.ok(plan.copyItems.some(item => item.relativePath === 'main.lua'));
            assert.strictEqual(plan.conflicts.length, 0);
            await fs.rm(fixture.root, { recursive: true, force: true });
        });

        test('keeps nested config relative paths stable', async () => {
            const fixture = await createConfigFixture({ existingMain: false });
            await fs.mkdir(path.join(fixture.source, '.vscode'), { recursive: true });
            await fs.writeFile(path.join(fixture.source, '.vscode', 'launch.json'), '{}\n', 'utf8');

            const plan = await planProjectConfigCopy(fixture.source, fixture.target, { overwrite: false });

            assert.ok(plan.copyItems.some(item => item.relativePath === '.vscode/launch.json'));
            await fs.rm(fixture.root, { recursive: true, force: true });
        });
    });
});

async function createY3LibraryFixture(options: { git: boolean; config: boolean }): Promise<string> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'y3-init-library-'));
    const y3Path = path.join(root, 'y3');
    await fs.mkdir(y3Path, { recursive: true });
    await fs.writeFile(path.join(y3Path, 'README.md'), 'Y3 library\n', 'utf8');
    if (options.git) {
        await fs.mkdir(path.join(y3Path, '.git'), { recursive: true });
    }
    if (options.config) {
        const configDir = path.join(y3Path, '演示', '项目配置');
        await fs.mkdir(configDir, { recursive: true });
        await fs.writeFile(path.join(configDir, 'main.lua'), 'print("hello")\n', 'utf8');
    }
    return y3Path;
}

async function createConfigFixture(options: { existingMain: boolean }): Promise<{ root: string; source: string; target: string }> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'y3-init-config-'));
    const source = path.join(root, 'source');
    const target = path.join(root, 'target');
    await fs.mkdir(source, { recursive: true });
    await fs.mkdir(target, { recursive: true });
    await fs.writeFile(path.join(source, 'main.lua'), 'print("source")\n', 'utf8');
    await fs.writeFile(path.join(source, '.luarc.json'), '{}\n', 'utf8');
    if (options.existingMain) {
        await fs.writeFile(path.join(target, 'main.lua'), 'print("target")\n', 'utf8');
    }
    return { root, source, target };
}
