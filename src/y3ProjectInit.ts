import * as fs from 'fs/promises';
import * as path from 'path';

export type Y3LibraryState =
    | { kind: 'missing' }
    | { kind: 'git-valid'; gitPath: string }
    | { kind: 'manual-copy-valid' }
    | { kind: 'invalid'; reason: string };

export interface ProjectConfigCopyItem {
    relativePath: string;
    sourcePath: string;
    targetPath: string;
}

export interface ProjectConfigCopyPlan {
    copyItems: ProjectConfigCopyItem[];
    conflicts: ProjectConfigCopyItem[];
}

export const PROJECT_CONFIG_RELATIVE_PATH = '演示/项目配置';
const LIBRARY_MARKER_FILES = ['README.md', '更新日志.md', 'CHANGELOG.md', 'init.lua'];

export async function resolveY3LibraryState(y3Path: string): Promise<Y3LibraryState> {
    const stat = await statIfExists(y3Path);
    if (!stat) {
        return { kind: 'missing' };
    }
    if (!stat.isDirectory()) {
        return { kind: 'invalid', reason: `${y3Path} 不是目录` };
    }

    const layoutError = await validateY3LibraryLayout(y3Path);
    if (layoutError) {
        return { kind: 'invalid', reason: layoutError };
    }

    const gitPath = path.join(y3Path, '.git');
    const gitStat = await statIfExists(gitPath);
    if (gitStat) {
        return { kind: 'git-valid', gitPath };
    }

    return { kind: 'manual-copy-valid' };
}

export async function isY3LibraryUsable(y3Path: string): Promise<boolean> {
    const state = await resolveY3LibraryState(y3Path);
    return state.kind === 'git-valid' || state.kind === 'manual-copy-valid';
}

export async function planProjectConfigCopy(
    sourceDir: string,
    targetDir: string,
    options: { overwrite: boolean },
): Promise<ProjectConfigCopyPlan> {
    const copyItems: ProjectConfigCopyItem[] = [];
    const conflicts: ProjectConfigCopyItem[] = [];
    const entries = await collectFiles(sourceDir, sourceDir);

    for (const item of entries) {
        const targetPath = path.join(targetDir, ...item.relativePath.split('/'));
        const copyItem = {
            relativePath: item.relativePath,
            sourcePath: item.sourcePath,
            targetPath,
        };
        const targetExists = await statIfExists(targetPath);
        if (targetExists && !options.overwrite) {
            conflicts.push(copyItem);
            continue;
        }
        copyItems.push(copyItem);
    }

    return { copyItems, conflicts };
}

async function validateY3LibraryLayout(y3Path: string): Promise<string | undefined> {
    const configPath = path.join(y3Path, ...PROJECT_CONFIG_RELATIVE_PATH.split('/'));
    const configStat = await statIfExists(configPath);
    if (!configStat || !configStat.isDirectory()) {
        return `缺少 ${PROJECT_CONFIG_RELATIVE_PATH}`;
    }

    const markerExists = await hasAnyFile(y3Path, LIBRARY_MARKER_FILES);
    if (!markerExists) {
        return `缺少 Y3 库标识文件：${LIBRARY_MARKER_FILES.join(', ')}`;
    }

    return undefined;
}

async function collectFiles(root: string, current: string): Promise<ProjectConfigCopyItem[]> {
    const result: ProjectConfigCopyItem[] = [];
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
        const sourcePath = path.join(current, entry.name);
        if (entry.isDirectory()) {
            result.push(...await collectFiles(root, sourcePath));
            continue;
        }
        if (!entry.isFile()) {
            continue;
        }
        result.push({
            relativePath: toPosixRelativePath(path.relative(root, sourcePath)),
            sourcePath,
            targetPath: '',
        });
    }
    return result;
}

async function hasAnyFile(root: string, names: string[]): Promise<boolean> {
    for (const name of names) {
        const stat = await statIfExists(path.join(root, name));
        if (stat?.isFile()) {
            return true;
        }
    }
    return false;
}

async function statIfExists(targetPath: string): Promise<import('fs').Stats | undefined> {
    try {
        return await fs.stat(targetPath);
    } catch (error) {
        if (isNodeError(error) && error.code === 'ENOENT') {
            return undefined;
        }
        throw error;
    }
}

function toPosixRelativePath(value: string): string {
    return value.replace(/\\/g, '/');
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && 'code' in error;
}
