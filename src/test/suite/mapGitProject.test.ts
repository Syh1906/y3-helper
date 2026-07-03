import * as assert from 'assert';
import * as cp from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
    classifyY3SubmoduleState,
    createSharedWorkspaceContent,
    getGitRepositoryRoot,
    getGitStatusPorcelain,
    isSameFileSystemPath,
    execGit,
    makeSubmoduleAbsorbGitDirsArgs,
    makeSubmoduleAddArgs,
    makeSubmoduleAddExistingArgs,
    makeGitAddArgs,
    makeGitAddDryRunArgs,
    makeGitCommitArgs,
    makeGitInitArgs,
    makeSubmoduleUpdateInitArgs,
    mergeMapGitignore,
    parseSubmoduleStatus,
    probeY3Submodule,
    readTextFileIfExists,
    toPosixRelativePath,
} from '../../mapGitProject';

suite('Map Git project initialization', () => {
    suite('mergeMapGitignore', () => {
        test('appends standard runtime ignores while preserving existing content', () => {
            const existing = [
                '# user rules',
                'custom-cache/',
                '**/log/',
                '',
            ].join('\n');

            const result = mergeMapGitignore(existing);

            assert.ok(result.startsWith(existing));
            assert.ok(result.includes('custom-cache/'));
            assert.strictEqual(countLine(result, '**/log/'), 1);
            assert.ok(result.includes('**/.log/'));
            assert.ok(result.includes('/archive/'));
            assert.ok(result.includes('*.local.code-workspace'));
        });

        test('creates standard ignore content when file is empty', () => {
            const result = mergeMapGitignore('');

            assert.ok(result.includes('**/.log/'));
            assert.ok(result.includes('/lock/'));
            assert.ok(result.includes('/maps/*/store/'));
            assert.ok(result.endsWith('\n'));
        });

        test('does not add blank lines when all standard rules already exist', () => {
            const once = mergeMapGitignore('');
            const twice = mergeMapGitignore(once);

            assert.strictEqual(twice, once);
        });
    });

    suite('createSharedWorkspaceContent', () => {
        test('uses only relative paths for shared workspace folders', () => {
            const text = createSharedWorkspaceContent('maps/EntryMap/script');
            const data = JSON.parse(text);

            assert.deepStrictEqual(data.folders, [
                { name: '地图脚本', path: 'maps/EntryMap/script' },
                { name: '完整工程', path: '.' },
            ]);
            assert.strictEqual(text.includes('E:'), false);
            assert.strictEqual(text.includes('Moy_Y3'), false);
        });
    });

    suite('parseSubmoduleStatus', () => {
        test('maps git submodule status prefixes to stable states', () => {
            assert.strictEqual(parseSubmoduleStatus(' abc123 maps/EntryMap/script/y3'), 'clean');
            assert.strictEqual(parseSubmoduleStatus('-abc123 maps/EntryMap/script/y3'), 'not-initialized');
            assert.strictEqual(parseSubmoduleStatus('+abc123 maps/EntryMap/script/y3'), 'commit-mismatch');
            assert.strictEqual(parseSubmoduleStatus('Uabc123 maps/EntryMap/script/y3'), 'conflict');
        });

        test('returns absent when status line is empty', () => {
            assert.strictEqual(parseSubmoduleStatus(''), 'absent');
        });
    });

    suite('git arguments', () => {
        test('builds project git init and add args', () => {
            assert.deepStrictEqual(makeGitInitArgs(), ['init']);
            assert.deepStrictEqual(makeGitAddDryRunArgs(), ['add', '--dry-run', '.']);
            assert.deepStrictEqual(makeGitAddArgs(), ['add', '.']);
        });

        test('builds submodule add args without shell quoting', () => {
            assert.deepStrictEqual(
                makeSubmoduleAddArgs('https://github.com/Syh1906/y3-lualib.git', 'maps\\EntryMap\\script\\y3'),
                ['submodule', 'add', 'https://github.com/Syh1906/y3-lualib.git', 'maps/EntryMap/script/y3'],
            );
        });

        test('builds existing clone submodule migration args', () => {
            assert.deepStrictEqual(
                makeSubmoduleAddExistingArgs('https://github.com/Syh1906/y3-lualib.git', 'maps\\EntryMap\\script\\y3'),
                ['submodule', 'add', '--force', 'https://github.com/Syh1906/y3-lualib.git', 'maps/EntryMap/script/y3'],
            );
        });

        test('builds absorbgitdirs args for existing clone migration', () => {
            assert.deepStrictEqual(
                makeSubmoduleAbsorbGitDirsArgs('maps\\EntryMap\\script\\y3'),
                ['submodule', 'absorbgitdirs', 'maps/EntryMap/script/y3'],
            );
        });

        test('builds submodule update and commit args', () => {
            assert.deepStrictEqual(
                makeSubmoduleUpdateInitArgs('maps\\EntryMap\\script\\y3'),
                ['submodule', 'update', '--init', '--', 'maps/EntryMap/script/y3'],
            );
            assert.deepStrictEqual(
                makeGitCommitArgs('chore: 初始化地图工程版本管理'),
                ['commit', '-m', 'chore: 初始化地图工程版本管理'],
            );
        });

        test('normalizes Windows separators to repository relative paths', () => {
            assert.strictEqual(toPosixRelativePath('\\maps\\EntryMap\\script'), 'maps/EntryMap/script');
        });
    });

    suite('isSameFileSystemPath', () => {
        test('normalizes slash direction and trailing slashes', () => {
            assert.strictEqual(isSameFileSystemPath('E:\\Maps\\Moy_Y3\\', 'E:/Maps/Moy_Y3'), true);
        });

        test('compares Windows paths case-insensitively', () => {
            assert.strictEqual(isSameFileSystemPath('E:/Maps/Moy_Y3', 'e:/maps/moy_y3'), true);
        });

        test('keeps different directories distinct', () => {
            assert.strictEqual(isSameFileSystemPath('E:/Maps/Moy_Y3', 'E:/Maps'), false);
        });
    });

    suite('classifyY3SubmoduleState', () => {
        const repoUrl = 'https://github.com/Syh1906/y3-lualib.git';

        test('treats missing y3 folder as addable submodule', () => {
            assert.strictEqual(classifyY3SubmoduleState({
                exists: false,
            }, repoUrl), 'missing');
        });

        test('treats clean submodule as already configured', () => {
            assert.strictEqual(classifyY3SubmoduleState({
                exists: true,
                submoduleStatusLine: ' abc123 maps/EntryMap/script/y3',
            }, repoUrl), 'already-submodule');
        });

        test('stops when registered submodule has local changes', () => {
            assert.strictEqual(classifyY3SubmoduleState({
                exists: true,
                submoduleStatusLine: ' abc123 maps/EntryMap/script/y3',
                statusPorcelain: ' M README.md',
            }, repoUrl), 'submodule-dirty');
        });

        test('treats clean existing clone with matching remote as migratable', () => {
            assert.strictEqual(classifyY3SubmoduleState({
                exists: true,
                isGitWorkTree: true,
                originUrl: repoUrl,
                statusPorcelain: '',
            }, repoUrl), 'plain-git-clean');
        });

        test('treats matching remote without git suffix as migratable', () => {
            assert.strictEqual(classifyY3SubmoduleState({
                exists: true,
                isGitWorkTree: true,
                originUrl: 'https://github.com/Syh1906/y3-lualib',
                statusPorcelain: '',
            }, repoUrl), 'plain-git-clean');
        });

        test('stops on dirty existing clone', () => {
            assert.strictEqual(classifyY3SubmoduleState({
                exists: true,
                isGitWorkTree: true,
                originUrl: repoUrl,
                statusPorcelain: ' M main.lua',
            }, repoUrl), 'plain-git-dirty');
        });

        test('stops on remote mismatch', () => {
            assert.strictEqual(classifyY3SubmoduleState({
                exists: true,
                isGitWorkTree: true,
                originUrl: 'https://example.invalid/other.git',
                statusPorcelain: '',
            }, repoUrl), 'remote-mismatch');
        });

        test('stops when existing clone has no origin remote', () => {
            assert.strictEqual(classifyY3SubmoduleState({
                exists: true,
                isGitWorkTree: true,
                statusPorcelain: '',
            }, repoUrl), 'remote-mismatch');
        });

        test('stops when existing y3 folder is not a git work tree', () => {
            assert.strictEqual(classifyY3SubmoduleState({
                exists: true,
                isGitWorkTree: false,
            }, repoUrl), 'not-git');
        });

        test('stops when git reports an unknown submodule status prefix', () => {
            assert.strictEqual(classifyY3SubmoduleState({
                exists: true,
                submoduleStatusLine: '?abc123 maps/EntryMap/script/y3',
            }, repoUrl), 'unknown');
        });
    });

    suite('readTextFileIfExists', () => {
        test('returns undefined only when the file does not exist', async () => {
            const missing = path.join(os.tmpdir(), `y3-helper-missing-${Date.now()}.txt`);

            assert.strictEqual(await readTextFileIfExists(missing), undefined);
        });

        test('throws when the path exists but cannot be read as a text file', async () => {
            const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'y3-helper-dir-'));

            await assert.rejects(readTextFileIfExists(dir));
            await fs.rm(dir, { recursive: true, force: true });
        });
    });

    suite('probeY3Submodule', () => {
        test('reports local changes inside a registered clean submodule', async function () {
            this.timeout(30_000);
            const sourceRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'y3-helper-source-'));
            const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'y3-helper-project-'));
            const relativePath = 'maps/EntryMap/script/y3';
            const y3Path = path.join(projectRoot, ...relativePath.split('/'));
            await createCommittedRepo(sourceRepo);
            await execGitForTest(['init'], projectRoot);
            await execGitForTest(['-c', 'protocol.file.allow=always', 'submodule', 'add', sourceRepo, relativePath], projectRoot);
            await fs.appendFile(path.join(y3Path, 'README.md'), 'dirty\n', 'utf8');

            const probe = await probeY3Submodule(projectRoot, y3Path, relativePath);

            assert.strictEqual(probe.exists, true);
            assert.strictEqual(probe.submoduleStatusLine?.[0], ' ');
            assert.ok(probe.statusPorcelain?.includes('README.md'));
            await fs.rm(sourceRepo, { recursive: true, force: true });
            await fs.rm(projectRoot, { recursive: true, force: true });
        });

        test('detects a registered but missing submodule before treating the path as missing', async function () {
            this.timeout(30_000);
            const sourceRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'y3-helper-source-'));
            const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'y3-helper-project-'));
            const relativePath = 'maps/EntryMap/script/y3';
            const y3Path = path.join(projectRoot, ...relativePath.split('/'));
            await createCommittedRepo(sourceRepo);
            await execGitForTest(['init'], projectRoot);
            await execGitForTest(['-c', 'protocol.file.allow=always', 'submodule', 'add', sourceRepo, relativePath], projectRoot);
            await execGitForTest(['submodule', 'deinit', '-f', '--', relativePath], projectRoot);
            await fs.rm(y3Path, { recursive: true, force: true });

            const probe = await probeY3Submodule(projectRoot, y3Path, relativePath);

            assert.strictEqual(probe.exists, true);
            assert.strictEqual(probe.submoduleStatusLine?.[0], '-');
            await fs.rm(sourceRepo, { recursive: true, force: true });
            await fs.rm(projectRoot, { recursive: true, force: true });
        });

        test('treats a normal y3 directory inside the parent repository as not-git', async function () {
            this.timeout(20_000);
            const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'y3-helper-project-'));
            const y3Path = path.join(projectRoot, 'maps', 'EntryMap', 'script', 'y3');
            await fs.mkdir(y3Path, { recursive: true });
            await execGitForTest(['init'], projectRoot);

            const probe = await probeY3Submodule(projectRoot, y3Path, 'maps/EntryMap/script/y3');

            assert.strictEqual(probe.exists, true);
            assert.strictEqual(probe.isGitWorkTree, false);
            await fs.rm(projectRoot, { recursive: true, force: true });
        });

        test('reports the exact git root for a repository', async function () {
            this.timeout(20_000);
            const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'y3-helper-root-'));
            await execGitForTest(['init'], projectRoot);

            const root = await getGitRepositoryRoot(projectRoot);
            const realProjectRoot = await fs.realpath(projectRoot);

            assert.ok(root);
            assert.strictEqual(isSameFileSystemPath(root!, realProjectRoot), true);
            await fs.rm(projectRoot, { recursive: true, force: true });
        });
    });

    suite('getGitStatusPorcelain', () => {
        test('returns an empty string for a clean repository', async function () {
            this.timeout(20_000);
            const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'y3-helper-clean-'));
            await createCommittedRepo(repo);

            assert.strictEqual(await getGitStatusPorcelain(repo), '');
            await fs.rm(repo, { recursive: true, force: true });
        });

        test('returns porcelain output for dirty repository state', async function () {
            this.timeout(20_000);
            const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'y3-helper-dirty-'));
            await createCommittedRepo(repo);
            await fs.writeFile(path.join(repo, 'dirty.txt'), 'dirty\n', 'utf8');

            const status = await getGitStatusPorcelain(repo);

            assert.ok(status);
            assert.ok(status.includes('dirty.txt'));
            await fs.rm(repo, { recursive: true, force: true });
        });
    });

    suite('execGit', () => {
        test('preserves stdout leading spaces because git status prefixes are significant', async function () {
            this.timeout(20_000);
            const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'y3-helper-prefix-'));
            await createCommittedRepo(repo);

            const result = await execGit(['log', '--format= %H', '-1'], repo);

            assert.strictEqual(result.exitCode, 0);
            assert.strictEqual(result.stdout[0], ' ');
            await fs.rm(repo, { recursive: true, force: true });
        });
    });
});

function countLine(text: string, line: string): number {
    return text.split(/\r?\n/).filter(item => item === line).length;
}

function execGitForTest(args: string[], cwd: string): Promise<void> {
    return new Promise((resolve, reject) => {
        cp.execFile('git', args, { cwd, windowsHide: true }, (error) => {
            if (error) {
                reject(error);
                return;
            }
            resolve();
        });
    });
}

async function createCommittedRepo(cwd: string): Promise<void> {
    await execGitForTest(['init'], cwd);
    await fs.writeFile(path.join(cwd, 'README.md'), 'source\n', 'utf8');
    await execGitForTest(['add', '.'], cwd);
    await execGitForTest(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'init'], cwd);
}
