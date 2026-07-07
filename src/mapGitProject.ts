import * as cp from 'child_process';
import { constants } from 'fs';
import * as fs from 'fs/promises';

export type SubmoduleStatus =
    | 'absent'
    | 'clean'
    | 'not-initialized'
    | 'commit-mismatch'
    | 'conflict'
    | 'unknown';

export interface GitResult {
    args: string[];
    cwd: string;
    stdout: string;
    stderr: string;
    exitCode: number;
}

export type Y3SubmoduleState =
    | 'missing'
    | 'already-submodule'
    | 'submodule-not-initialized'
    | 'submodule-commit-mismatch'
    | 'submodule-conflict'
    | 'submodule-dirty'
    | 'plain-git-clean'
    | 'plain-git-dirty'
    | 'remote-mismatch'
    | 'not-git'
    | 'unknown';

export type Y3GitManagementMode =
    | 'skip'
    | 'track-plain-directory'
    | 'submodule'
    | 'keep-independent-git'
    | 'existing-submodule';

export type Y3LibraryGitPlan =
    | { kind: 'skip'; gitArgs: string[] }
    | { kind: 'track-plain-directory'; gitArgs: string[] }
    | { kind: 'keep-independent-git'; gitArgs: string[] }
    | { kind: 'run-git'; gitArgs: string[][] }
    | { kind: 'blocked'; message: string };

export interface Y3LibraryGitManagementInput {
    mode: Y3GitManagementMode;
    state: Y3SubmoduleProbe;
    repoUrl: string;
    relativePath: string;
}

export interface Y3SubmoduleProbe {
    exists: boolean;
    submoduleStatusLine?: string;
    isGitWorkTree?: boolean;
    originUrl?: string;
    statusPorcelain?: string;
}

export const SHARED_WORKSPACE_FILE = '.y3.code-workspace';

const MAP_GITIGNORE_RULES = [
    '# Y3 runtime logs',
    '**/.log/',
    '**/log/',
    '**/logs/',
    '*.log',
    '',
    '# Y3 temporary files',
    '/lock/',
    '*.tmp',
    '*.temp',
    '*.bak',
    '*.backup',
    '',
    '# Y3 local runtime state',
    '/archive/',
    '/store_all/',
    '/maps/*/store/',
    '',
    '# Personal VS Code workspaces',
    '*.local.code-workspace',
];

export function mergeMapGitignore(existing: string | undefined): string {
    const normalized = normalizeNewlines(existing ?? '');
    const lines = normalized.length > 0 ? normalized.split('\n') : [];
    const existingRules = new Set(lines.map(line => line.trim()).filter(Boolean));
    const base = normalized.replace(/\n*$/, '');
    const hasMissingRule = MAP_GITIGNORE_RULES.some((rule) => {
        const trimmed = rule.trim();
        return trimmed.length > 0 && !existingRules.has(trimmed);
    });
    if (!hasMissingRule) {
        return `${base}\n`;
    }

    const additions: string[] = [];

    for (const rule of MAP_GITIGNORE_RULES) {
        const trimmed = rule.trim();
        if (trimmed && existingRules.has(trimmed)) {
            continue;
        }
        additions.push(rule);
        if (trimmed) {
            existingRules.add(trimmed);
        }
    }

    const body = base
        ? `${base}\n\n${additions.join('\n').replace(/\n*$/, '')}`
        : additions.join('\n').replace(/\n*$/, '');
    return `${body}\n`;
}

export function createSharedWorkspaceContent(scriptRelativePath: string): string {
    const workspace = {
        folders: [
            { name: '地图脚本', path: toPosixRelativePath(scriptRelativePath) },
            { name: '完整工程', path: '.' },
        ],
        settings: {
            'git.openRepositoryInParentFolders': 'always',
            'files.exclude': {
                '**/.log': true,
                '**/log': true,
                archive: true,
                lock: true,
                store_all: true,
                'maps/*/store': true,
            },
            'search.exclude': {
                '**/.log': true,
                '**/log': true,
                archive: true,
                lock: true,
                store_all: true,
                'maps/*/store': true,
            },
        },
    };
    return `${JSON.stringify(workspace, null, 4)}\n`;
}

export function parseSubmoduleStatus(line: string): SubmoduleStatus {
    if (line.trim().length === 0) {
        return 'absent';
    }
    const prefix = line[0];
    if (prefix === ' ') {
        return 'clean';
    }
    if (prefix === '-') {
        return 'not-initialized';
    }
    if (prefix === '+') {
        return 'commit-mismatch';
    }
    if (prefix === 'U') {
        return 'conflict';
    }
    return 'unknown';
}

export function classifyY3SubmoduleState(probe: Y3SubmoduleProbe, expectedRepoUrl: string): Y3SubmoduleState {
    if (!probe.exists) {
        return 'missing';
    }

    if (probe.submoduleStatusLine !== undefined) {
        const status = parseSubmoduleStatus(probe.submoduleStatusLine);
        if ((probe.statusPorcelain ?? '').trim().length > 0) {
            return 'submodule-dirty';
        }
        if (status === 'clean') {
            return 'already-submodule';
        }
        if (status === 'not-initialized') {
            return 'submodule-not-initialized';
        }
        if (status === 'commit-mismatch') {
            return 'submodule-commit-mismatch';
        }
        if (status === 'conflict') {
            return 'submodule-conflict';
        }
        if (status === 'unknown') {
            return 'unknown';
        }
    }

    if (!probe.isGitWorkTree) {
        return 'not-git';
    }

    if (!probe.originUrl || normalizeRepoUrl(probe.originUrl) !== normalizeRepoUrl(expectedRepoUrl)) {
        return 'remote-mismatch';
    }

    if ((probe.statusPorcelain ?? '').trim().length > 0) {
        return 'plain-git-dirty';
    }

    return 'plain-git-clean';
}

export function planY3LibraryGitManagement(input: Y3LibraryGitManagementInput): Y3LibraryGitPlan {
    if (input.mode === 'skip') {
        return { kind: 'skip', gitArgs: [] };
    }

    if (input.mode === 'track-plain-directory') {
        if (!input.state.exists) {
            return { kind: 'blocked', message: 'Y3 库目录不存在，不能作为普通目录纳入工程 Git。' };
        }
        if (input.state.isGitWorkTree === false) {
            return { kind: 'track-plain-directory', gitArgs: [] };
        }
        return { kind: 'blocked', message: 'Y3 库目录不是普通复制目录，请重新选择管理方式。' };
    }

    if (input.mode === 'keep-independent-git') {
        if (!input.state.exists || !input.state.isGitWorkTree) {
            return { kind: 'blocked', message: 'Y3 库目录不是独立 Git 仓库。' };
        }
        if ((input.state.statusPorcelain ?? '').trim().length > 0) {
            return { kind: 'blocked', message: 'Y3 库独立 Git 仓库存在未提交改动，请先提交或清理。' };
        }
        return { kind: 'keep-independent-git', gitArgs: [] };
    }

    if (input.mode === 'existing-submodule') {
        if (input.state.submoduleStatusLine === undefined) {
            return { kind: 'blocked', message: 'Y3 库尚未登记为子模块。' };
        }
        if ((input.state.statusPorcelain ?? '').trim().length > 0) {
            return { kind: 'blocked', message: 'Y3 库子模块存在本地改动，请先提交或清理。' };
        }
        const status = parseSubmoduleStatus(input.state.submoduleStatusLine);
        if (status === 'not-initialized') {
            return { kind: 'run-git', gitArgs: [makeSubmoduleUpdateInitArgs(input.relativePath)] };
        }
        if (status === 'clean') {
            return { kind: 'run-git', gitArgs: [] };
        }
        return { kind: 'blocked', message: 'Y3 库子模块状态需要先手动处理。' };
    }

    const state = classifyY3SubmoduleState(input.state, input.repoUrl);
    if (state === 'missing') {
        return { kind: 'run-git', gitArgs: [makeSubmoduleAddArgs(input.repoUrl, input.relativePath)] };
    }
    if (state === 'submodule-not-initialized') {
        return { kind: 'run-git', gitArgs: [makeSubmoduleUpdateInitArgs(input.relativePath)] };
    }
    if (state === 'plain-git-clean') {
        return {
            kind: 'run-git',
            gitArgs: [
                makeSubmoduleAddExistingArgs(input.repoUrl, input.relativePath),
                makeSubmoduleAbsorbGitDirsArgs(input.relativePath),
            ],
        };
    }
    if (state === 'already-submodule') {
        return { kind: 'run-git', gitArgs: [] };
    }

    return { kind: 'blocked', message: 'Y3 库当前状态无法自动配置为子模块。' };
}

export function makeSubmoduleAddArgs(repoUrl: string, relativePath: string): string[] {
    return ['submodule', 'add', repoUrl, toPosixRelativePath(relativePath)];
}

export function makeSubmoduleAddExistingArgs(repoUrl: string, relativePath: string): string[] {
    return ['submodule', 'add', '--force', repoUrl, toPosixRelativePath(relativePath)];
}

export function makeSubmoduleAbsorbGitDirsArgs(relativePath: string): string[] {
    return ['submodule', 'absorbgitdirs', toPosixRelativePath(relativePath)];
}

export function makeSubmoduleUpdateInitArgs(relativePath: string): string[] {
    return ['submodule', 'update', '--init', '--', toPosixRelativePath(relativePath)];
}

export function makeGitInitArgs(): string[] {
    return ['init'];
}

export function makeGitAddDryRunArgs(excludePaths: string[] = []): string[] {
    return makeGitAddArgsBase(['add', '--dry-run', '.'], excludePaths);
}

export function makeGitAddArgs(excludePaths: string[] = []): string[] {
    return makeGitAddArgsBase(['add', '.'], excludePaths);
}

export function makeGitCommitArgs(message: string): string[] {
    return ['commit', '-m', message];
}

export async function isGitRepository(cwd: string): Promise<boolean> {
    return await getGitRepositoryRoot(cwd) !== undefined;
}

export async function getGitRepositoryRoot(cwd: string): Promise<string | undefined> {
    const result = await execGit(['rev-parse', '--show-toplevel'], cwd);
    const stdout = result.stdout.trim();
    if (result.exitCode !== 0 || stdout.length === 0) {
        return undefined;
    }
    return stdout;
}

export async function probeY3Submodule(projectRoot: string, y3Path: string, relativePath: string): Promise<Y3SubmoduleProbe> {
    const submoduleStatus = await execGit(['submodule', 'status', '--', toPosixRelativePath(relativePath)], projectRoot);
    if (submoduleStatus.exitCode === 0 && submoduleStatus.stdout.trim().length > 0) {
        const status = await getGitStatusPorcelain(y3Path);
        return {
            exists: true,
            submoduleStatusLine: submoduleStatus.stdout.split(/\r?\n/)[0],
            statusPorcelain: status,
        };
    }

    const exists = await pathExists(y3Path);
    if (!exists) {
        return { exists: false };
    }

    const y3GitRoot = await getGitRepositoryRoot(y3Path);
    if (!y3GitRoot || !isSameFileSystemPath(y3GitRoot, y3Path)) {
        return {
            exists: true,
            isGitWorkTree: false,
        };
    }

    const [origin, status] = await Promise.all([
        execGit(['remote', 'get-url', 'origin'], y3Path),
        getGitStatusPorcelain(y3Path),
    ]);

    return {
        exists: true,
        isGitWorkTree: true,
        originUrl: origin.exitCode === 0 ? origin.stdout.trim() : undefined,
        statusPorcelain: status,
    };
}

export async function getGitStatusPorcelain(cwd: string): Promise<string | undefined> {
    const status = await execGit(['status', '--porcelain'], cwd);
    if (status.exitCode !== 0) {
        return undefined;
    }
    return status.stdout;
}

export async function readTextFileIfExists(path: string): Promise<string | undefined> {
    try {
        await fs.access(path, constants.F_OK);
    } catch (error) {
        if (isNodeError(error) && error.code === 'ENOENT') {
            return undefined;
        }
        throw error;
    }

    try {
        return await fs.readFile(path, 'utf8');
    } catch (error) {
        throw error;
    }
}

export async function writeTextFile(path: string, text: string): Promise<void> {
    await fs.writeFile(path, text, 'utf8');
}

export function execGit(args: string[], cwd: string, timeoutMs = 30_000): Promise<GitResult> {
    return new Promise((resolve) => {
        cp.execFile('git', args, {
            cwd,
            timeout: timeoutMs,
            windowsHide: true,
        }, (error, stdout, stderr) => {
            resolve({
                args,
                cwd,
                stdout: stdout ?? '',
                stderr: (stderr ?? '').trim(),
                exitCode: error ? Number((error as any).code ?? 1) : 0,
            });
        });
    });
}

export function toPosixRelativePath(value: string): string {
    return value.replace(/\\/g, '/').replace(/^\/+/, '');
}

export function isSameFileSystemPath(left: string, right: string): boolean {
    return normalizeFileSystemPath(left) === normalizeFileSystemPath(right);
}

function normalizeNewlines(value: string): string {
    return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function normalizeRepoUrl(value: string): string {
    return value.trim().replace(/\/+$/, '').replace(/\.git$/i, '').toLowerCase();
}

function makeGitAddArgsBase(baseArgs: string[], excludePaths: string[]): string[] {
    const excludes = excludePaths.map(path => `:(exclude)${toPosixRelativePath(path)}`);
    if (excludes.length === 0) {
        return baseArgs;
    }
    return [...baseArgs.slice(0, -1), '--', baseArgs[baseArgs.length - 1], ...excludes];
}

async function pathExists(path: string): Promise<boolean> {
    try {
        await fs.stat(path);
        return true;
    } catch {
        return false;
    }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && 'code' in error;
}

function normalizeFileSystemPath(value: string): string {
    return value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}
