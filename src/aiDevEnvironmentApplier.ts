import * as fs from 'fs/promises';
import * as path from 'path';
import * as l10n from '@vscode/l10n';
import {
    buildAiDevEnvironmentPlan,
    createClaudeMcpJson,
    createClaudeSettingsJson,
    createCodexConfigToml,
    createLegacyRootAgentsMarkdown,
    createLegacyScriptAgentsMarkdown,
    createRootAgentsMarkdown,
    createScriptAgentsMarkdown,
    hasClaudeY3HelperMcpConflict,
    hasClaudeSettingsJsonConflict,
    hasCodexY3HelperMcpConflict,
    isObsoleteY3MakerMcpSettingsJson,
    mergeManagedAiDevEnvironmentFile,
    mergeAiDevEnvironmentGitignore,
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

const LEGACY_Y3MAKER_MCP_SETTINGS_RELATIVE_PATH = ['.y3maker', 'mcp_settings.json'];

interface AiMcpProjectConfigContent {
    codexConfig: string;
    claudeMcp: string;
    claudeSettings: string;
}

export async function inspectAiDevEnvironment(input: AiDevEnvironmentApplyInput): Promise<AiDevEnvironmentApplyResult> {
    const plan = buildAiDevEnvironmentPlan(input);
    return {
        plan,
        conflicts: await findAiDevEnvironmentConflicts(plan, input),
    };
}

export async function applyAiDevEnvironment(input: AiDevEnvironmentApplyInput): Promise<AiDevEnvironmentApplyOutput> {
    const plan = buildAiDevEnvironmentPlan(input);
    const conflicts = await findAiDevEnvironmentConflicts(plan, input);
    if (conflicts.length > 0) {
        throw new Error(l10n.t('存在用户自定义 AI 配置文件，已停止以避免覆盖。'));
    }

    const snapshot: AiDevEnvironmentSnapshot = input;
    const mcpConfigContent = await createAiMcpProjectConfigContent(plan, true);
    await removeObsoleteY3MakerMcpSettings(plan);
    await writeManagedFile(
        plan.rootAgentsPath,
        createRootAgentsMarkdown(snapshot),
        createLegacyRootAgentsMarkdown(snapshot),
    );
    await writeManagedFile(
        plan.scriptAgentsPath,
        createScriptAgentsMarkdown(snapshot),
        createLegacyScriptAgentsMarkdown(snapshot),
    );
    await createRelativeSymlink(plan.rootClaudePath, plan.rootAgentsPath, 'file');
    await createRelativeSymlink(plan.scriptClaudePath, plan.scriptAgentsPath, 'file');
    await writeText(plan.gitignorePath, mergeAiDevEnvironmentGitignore(
        await readTextIfExists(plan.gitignorePath) ?? '',
        [plan.scriptClaudeSettingsGitignoreRule],
    ));
    await writeAiMcpProjectConfig(plan, mcpConfigContent);
    await createRelativeSymlink(plan.scriptCodexConfigLink, plan.codexConfigPath, 'file');
    await createRelativeSymlink(plan.scriptClaudeMcpLink, plan.claudeMcpPath, 'file');
    await createRelativeSymlink(plan.scriptClaudeSettingsLink, plan.claudeSettingsPath, 'file');

    let skillStatus: AiDevEnvironmentApplyOutput['skillStatus'] = 'skipped';
    if (plan.codexSkillSource && await directoryExists(plan.codexSkillSource)) {
        await copyDirectory(plan.codexSkillSource, plan.codexSkillTarget);
        await createRelativeSymlink(plan.claudeSkillLink, plan.codexSkillTarget, 'dir');
        await createRelativeSymlink(plan.scriptCodexSkillLink, plan.codexSkillTarget, 'dir');
        await createRelativeSymlink(plan.scriptClaudeSkillLink, plan.claudeSkillLink, 'dir');
        skillStatus = 'synced';
    }
    return {
        ...plan,
        skillStatus,
    };
}

export async function setAiMcpProjectConfigEnabled(input: AiDevEnvironmentApplyInput, enabled: boolean): Promise<AiDevEnvironmentPlan> {
    const plan = buildAiDevEnvironmentPlan(input);
    const conflicts = [
        ...await findObsoleteY3MakerMcpSettingsConflicts(plan),
        ...await findScriptConfigLinkConflicts(plan),
        ...await findMcpConfigConflicts(plan),
    ];
    if (conflicts.length > 0) {
        throw new Error(l10n.t('存在同名但地址不同的 y3-helper MCP 配置，已停止以避免覆盖。'));
    }
    const mcpConfigContent = await createAiMcpProjectConfigContent(plan, enabled);
    await removeObsoleteY3MakerMcpSettings(plan);
    await writeText(plan.gitignorePath, mergeAiDevEnvironmentGitignore(
        await readTextIfExists(plan.gitignorePath) ?? '',
        [plan.scriptClaudeSettingsGitignoreRule],
    ));
    await writeAiMcpProjectConfig(plan, mcpConfigContent);
    await createRelativeSymlink(plan.scriptCodexConfigLink, plan.codexConfigPath, 'file');
    await createRelativeSymlink(plan.scriptClaudeMcpLink, plan.claudeMcpPath, 'file');
    await createRelativeSymlink(plan.scriptClaudeSettingsLink, plan.claudeSettingsPath, 'file');
    return plan;
}

async function createAiMcpProjectConfigContent(plan: AiDevEnvironmentPlan, enabled: boolean): Promise<AiMcpProjectConfigContent> {
    return {
        codexConfig: createCodexConfigToml(await readTextIfExists(plan.codexConfigPath) ?? '', enabled),
        claudeMcp: createClaudeMcpJson(await readTextIfExists(plan.claudeMcpPath) ?? '', enabled),
        claudeSettings: createClaudeSettingsJson(await readTextIfExists(plan.claudeSettingsPath) ?? '', enabled),
    };
}

async function writeAiMcpProjectConfig(plan: AiDevEnvironmentPlan, content: AiMcpProjectConfigContent): Promise<void> {
    await writeText(plan.codexConfigPath, content.codexConfig);
    await writeText(plan.claudeMcpPath, content.claudeMcp);
    await writeText(plan.claudeSettingsPath, content.claudeSettings);
}

async function findAiDevEnvironmentConflicts(plan: AiDevEnvironmentPlan, snapshot: AiDevEnvironmentSnapshot): Promise<string[]> {
    const conflicts: string[] = [];
    await collectObsoleteY3MakerMcpSettingsConflict(plan, conflicts);
    await collectManagedFileConflict(
        plan.rootAgentsPath,
        createRootAgentsMarkdown(snapshot),
        createLegacyRootAgentsMarkdown(snapshot),
        conflicts,
    );
    await collectManagedFileConflict(
        plan.scriptAgentsPath,
        createScriptAgentsMarkdown(snapshot),
        createLegacyScriptAgentsMarkdown(snapshot),
        conflicts,
    );
    await collectLinkConflict(plan.rootClaudePath, plan.rootAgentsPath, conflicts);
    await collectLinkConflict(plan.scriptClaudePath, plan.scriptAgentsPath, conflicts);
    conflicts.push(...await findScriptConfigLinkConflicts(plan));
    if (plan.codexSkillSource && await directoryExists(plan.codexSkillSource)) {
        await collectLinkConflict(plan.claudeSkillLink, plan.codexSkillTarget, conflicts);
        await collectLinkConflict(plan.scriptCodexSkillLink, plan.codexSkillTarget, conflicts);
        await collectLinkConflict(plan.scriptClaudeSkillLink, plan.claudeSkillLink, conflicts);
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
    const claudeSettings = await readTextIfExists(plan.claudeSettingsPath);
    if (claudeSettings !== undefined && hasJsonConfigConflict(claudeSettings, hasClaudeSettingsJsonConflict)) {
        conflicts.push(plan.claudeSettingsPath);
    }
    return conflicts;
}

async function findScriptConfigLinkConflicts(plan: AiDevEnvironmentPlan): Promise<string[]> {
    const conflicts: string[] = [];
    await collectLinkConflict(plan.scriptCodexConfigLink, plan.codexConfigPath, conflicts);
    await collectLinkConflict(plan.scriptClaudeMcpLink, plan.claudeMcpPath, conflicts);
    await collectLinkConflict(plan.scriptClaudeSettingsLink, plan.claudeSettingsPath, conflicts);
    return conflicts;
}

async function collectObsoleteY3MakerMcpSettingsConflict(plan: AiDevEnvironmentPlan, conflicts: string[]): Promise<void> {
    conflicts.push(...await findObsoleteY3MakerMcpSettingsConflicts(plan));
}

async function findObsoleteY3MakerMcpSettingsConflicts(plan: AiDevEnvironmentPlan): Promise<string[]> {
    const conflicts: string[] = [];
    for (const filePath of legacyY3MakerMcpSettingsPaths(plan)) {
        const content = await readTextIfExists(filePath);
        if (content !== undefined && !isObsoleteY3MakerMcpSettings(content)) {
            conflicts.push(filePath);
        }
    }
    return conflicts;
}

async function removeObsoleteY3MakerMcpSettings(plan: AiDevEnvironmentPlan): Promise<void> {
    for (const filePath of legacyY3MakerMcpSettingsPaths(plan)) {
        const content = await readTextIfExists(filePath);
        if (content !== undefined && isObsoleteY3MakerMcpSettingsJson(content)) {
            await fs.rm(filePath);
        }
    }
}

function legacyY3MakerMcpSettingsPaths(plan: AiDevEnvironmentPlan): string[] {
    return uniquePaths([
        path.join(path.dirname(plan.gitignorePath), ...LEGACY_Y3MAKER_MCP_SETTINGS_RELATIVE_PATH),
        path.join(path.dirname(plan.scriptAgentsPath), ...LEGACY_Y3MAKER_MCP_SETTINGS_RELATIVE_PATH),
    ]);
}

function isObsoleteY3MakerMcpSettings(content: string): boolean {
    try {
        return isObsoleteY3MakerMcpSettingsJson(content);
    } catch {
        return false;
    }
}

function uniquePaths(filePaths: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const filePath of filePaths) {
        const normalized = normalizeFsPath(path.resolve(filePath));
        if (!seen.has(normalized)) {
            seen.add(normalized);
            result.push(filePath);
        }
    }
    return result;
}

function hasJsonConfigConflict(content: string, check: (content: string) => boolean): boolean {
    try {
        return check(content);
    } catch {
        return true;
    }
}

async function collectManagedFileConflict(filePath: string, expectedContent: string, legacyExpectedContent: string, conflicts: string[]): Promise<void> {
    const content = await readTextIfExists(filePath);
    if (content !== undefined && mergeManagedAiDevEnvironmentFile(content, expectedContent, legacyExpectedContent) === undefined) {
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

async function writeManagedFile(filePath: string, content: string, legacyContent: string): Promise<void> {
    const existing = await readTextIfExists(filePath);
    const merged = mergeManagedAiDevEnvironmentFile(existing, content, legacyContent);
    if (merged === undefined) {
        throw new Error(l10n.t('拒绝覆盖用户自定义文件：{0}', filePath));
    }
    await writeText(filePath, merged);
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
