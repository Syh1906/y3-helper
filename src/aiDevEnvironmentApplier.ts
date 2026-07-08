import * as fs from 'fs/promises';
import * as path from 'path';
import * as l10n from '@vscode/l10n';
import {
    buildAiDevEnvironmentPlan,
    createClaudeMcpJson,
    createClaudeSettingsJson,
    createCodexConfigToml,
    createRootAgentsMarkdown,
    createScriptAgentsMarkdown,
    createY3MakerMcpSettingsJson,
    hasClaudeY3HelperMcpConflict,
    hasCodexY3HelperMcpConflict,
    hasY3MakerMcpSettingsConflict,
    isManagedAiDevEnvironmentFile,
    normalizeRelativeLink,
    type AiDevEnvironmentPlan,
    type AiDevEnvironmentPlanInput,
    type AiDevEnvironmentSnapshot,
} from './aiDevEnvironment';

export type AiDevEnvironmentApplyInput = AiDevEnvironmentPlanInput;

export interface AiDevEnvironmentApplyResult {
    plan: AiDevEnvironmentPlan;
    conflicts: string[];
}

export interface AiDevEnvironmentApplyOutput extends AiDevEnvironmentPlan {
    skillStatus: 'synced' | 'skipped';
}

export async function inspectAiDevEnvironment(input: AiDevEnvironmentApplyInput): Promise<AiDevEnvironmentApplyResult> {
    const plan = buildAiDevEnvironmentPlan(input);
    return {
        plan,
        conflicts: await findAiDevEnvironmentConflicts(plan),
    };
}

export async function applyAiDevEnvironment(input: AiDevEnvironmentApplyInput): Promise<AiDevEnvironmentApplyOutput> {
    const plan = buildAiDevEnvironmentPlan(input);
    const conflicts = await findAiDevEnvironmentConflicts(plan);
    if (conflicts.length > 0) {
        throw new Error(l10n.t('存在用户自定义 AI 配置文件，已停止以避免覆盖。'));
    }

    const snapshot: AiDevEnvironmentSnapshot = input;
    await writeManagedFile(plan.rootAgentsPath, createRootAgentsMarkdown(snapshot));
    await writeManagedFile(plan.scriptAgentsPath, createScriptAgentsMarkdown(snapshot));
    await createRelativeSymlink(plan.rootClaudePath, plan.rootAgentsPath, 'file');
    await createRelativeSymlink(plan.scriptClaudePath, plan.scriptAgentsPath, 'file');
    await writeText(plan.codexConfigPath, createCodexConfigToml(await readTextIfExists(plan.codexConfigPath) ?? '', true));
    await writeText(plan.claudeMcpPath, createClaudeMcpJson(await readTextIfExists(plan.claudeMcpPath) ?? '', true));
    await writeText(plan.claudeSettingsPath, createClaudeSettingsJson(await readTextIfExists(plan.claudeSettingsPath) ?? '', true));
    await writeText(plan.y3MakerMcpSettingsPath, createY3MakerMcpSettingsJson(await readTextIfExists(plan.y3MakerMcpSettingsPath) ?? '', true));

    let skillStatus: AiDevEnvironmentApplyOutput['skillStatus'] = 'skipped';
    if (plan.codexSkillSource && await directoryExists(plan.codexSkillSource)) {
        await copyDirectory(plan.codexSkillSource, plan.codexSkillTarget);
        await createRelativeSymlink(plan.claudeSkillLink, plan.codexSkillTarget, 'dir');
        skillStatus = 'synced';
    }
    return {
        ...plan,
        skillStatus,
    };
}

export async function setAiMcpProjectConfigEnabled(input: AiDevEnvironmentApplyInput, enabled: boolean): Promise<AiDevEnvironmentPlan> {
    const plan = buildAiDevEnvironmentPlan(input);
    const conflicts = await findMcpConfigConflicts(plan);
    if (conflicts.length > 0) {
        throw new Error(l10n.t('存在同名但地址不同的 y3-helper MCP 配置，已停止以避免覆盖。'));
    }
    await writeText(plan.codexConfigPath, createCodexConfigToml(await readTextIfExists(plan.codexConfigPath) ?? '', enabled));
    await writeText(plan.claudeMcpPath, createClaudeMcpJson(await readTextIfExists(plan.claudeMcpPath) ?? '', enabled));
    await writeText(plan.claudeSettingsPath, createClaudeSettingsJson(await readTextIfExists(plan.claudeSettingsPath) ?? '', enabled));
    await writeText(plan.y3MakerMcpSettingsPath, createY3MakerMcpSettingsJson(await readTextIfExists(plan.y3MakerMcpSettingsPath) ?? '', enabled));
    return plan;
}

async function findAiDevEnvironmentConflicts(plan: AiDevEnvironmentPlan): Promise<string[]> {
    const conflicts: string[] = [];
    await collectManagedFileConflict(plan.rootAgentsPath, conflicts);
    await collectManagedFileConflict(plan.scriptAgentsPath, conflicts);
    await collectLinkConflict(plan.rootClaudePath, plan.rootAgentsPath, conflicts);
    await collectLinkConflict(plan.scriptClaudePath, plan.scriptAgentsPath, conflicts);
    if (plan.codexSkillSource && await directoryExists(plan.codexSkillSource)) {
        await collectLinkConflict(plan.claudeSkillLink, plan.codexSkillTarget, conflicts);
        await collectManagedDirectoryConflict(plan.codexSkillTarget, conflicts);
    }
    conflicts.push(...await findMcpConfigConflicts(plan));
    return conflicts;
}

async function findMcpConfigConflicts(plan: AiDevEnvironmentPlan): Promise<string[]> {
    const conflicts: string[] = [];
    const codexConfig = await readTextIfExists(plan.codexConfigPath);
    if (codexConfig !== undefined && hasCodexY3HelperMcpConflict(codexConfig)) {
        conflicts.push(plan.codexConfigPath);
    }
    const claudeMcp = await readTextIfExists(plan.claudeMcpPath);
    if (claudeMcp !== undefined && hasJsonConfigConflict(claudeMcp, hasClaudeY3HelperMcpConflict)) {
        conflicts.push(plan.claudeMcpPath);
    }
    const y3MakerMcpSettings = await readTextIfExists(plan.y3MakerMcpSettingsPath);
    if (y3MakerMcpSettings !== undefined && hasJsonConfigConflict(y3MakerMcpSettings, hasY3MakerMcpSettingsConflict)) {
        conflicts.push(plan.y3MakerMcpSettingsPath);
    }
    return conflicts;
}

function hasJsonConfigConflict(content: string, check: (content: string) => boolean): boolean {
    try {
        return check(content);
    } catch {
        return true;
    }
}

async function collectManagedFileConflict(filePath: string, conflicts: string[]): Promise<void> {
    const content = await readTextIfExists(filePath);
    if (content !== undefined && !isManagedAiDevEnvironmentFile(content)) {
        conflicts.push(filePath);
    }
}

async function collectLinkConflict(linkPath: string, targetPath: string, conflicts: string[]): Promise<void> {
    try {
        const stat = await fs.lstat(linkPath);
        if (!stat.isSymbolicLink() || !await isSymlinkTarget(linkPath, targetPath)) {
            conflicts.push(linkPath);
        }
    } catch (error) {
        if (!isNotFoundError(error)) {
            throw error;
        }
    }
}

async function isSymlinkTarget(linkPath: string, targetPath: string): Promise<boolean> {
    const linkTarget = await fs.readlink(linkPath);
    const resolvedTarget = path.resolve(path.dirname(linkPath), linkTarget);
    return normalizeFsPath(resolvedTarget) === normalizeFsPath(path.resolve(targetPath));
}

async function collectManagedDirectoryConflict(dirPath: string, conflicts: string[]): Promise<void> {
    try {
        const stat = await fs.lstat(dirPath);
        if (!stat.isDirectory()) {
            conflicts.push(dirPath);
            return;
        }
    } catch (error) {
        if (isNotFoundError(error)) {
            return;
        }
        throw error;
    }

    const marker = path.join(dirPath, '.y3-helper-ai-dev-env');
    try {
        await fs.stat(marker);
    } catch (error) {
        if (isNotFoundError(error)) {
            conflicts.push(dirPath);
            return;
        }
        throw error;
    }
}

async function directoryExists(dirPath: string): Promise<boolean> {
    try {
        const stat = await fs.stat(dirPath);
        return stat.isDirectory();
    } catch (error) {
        if (isNotFoundError(error)) {
            return false;
        }
        throw error;
    }
}

async function writeManagedFile(filePath: string, content: string): Promise<void> {
    const existing = await readTextIfExists(filePath);
    if (existing !== undefined && !isManagedAiDevEnvironmentFile(existing)) {
        throw new Error(l10n.t('拒绝覆盖用户自定义文件：{0}', filePath));
    }
    await writeText(filePath, `${content.trimEnd()}\n`);
}

async function writeText(filePath: string, content: string): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf8');
}

async function readTextIfExists(filePath: string): Promise<string | undefined> {
    try {
        return await fs.readFile(filePath, 'utf8');
    } catch (error) {
        if (isNotFoundError(error)) {
            return undefined;
        }
        throw error;
    }
}

async function createRelativeSymlink(linkPath: string, targetPath: string, type: 'file' | 'dir'): Promise<void> {
    await fs.mkdir(path.dirname(linkPath), { recursive: true });
    try {
        const stat = await fs.lstat(linkPath);
        if (stat.isSymbolicLink()) {
            await fs.unlink(linkPath);
        } else {
            throw new Error(l10n.t('目标已存在且不是符号链接：{0}', linkPath));
        }
    } catch (error) {
        if (!isNotFoundError(error)) {
            throw error;
        }
    }
    const relativeTarget = normalizeRelativeLink(linkPath, targetPath);
    await fs.symlink(relativeTarget, linkPath, type);
}

async function copyDirectory(source: string, target: string): Promise<void> {
    await fs.rm(target, { recursive: true, force: true });
    await fs.mkdir(target, { recursive: true });
    await fs.cp(source, target, { recursive: true });
    await fs.writeFile(path.join(target, '.y3-helper-ai-dev-env'), 'managed by Y3-Helper AI dev environment\n', 'utf8');
}

function isNotFoundError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && (error as NodeJS.ErrnoException).code === 'ENOENT';
}

function normalizeFsPath(filePath: string): string {
    return filePath.replace(/\\/g, '/').toLowerCase();
}
