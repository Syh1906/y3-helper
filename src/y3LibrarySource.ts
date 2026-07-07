export const DEFAULT_Y3_LUALIB_REPO_URL = 'https://github.com/Syh1906/y3-lualib.git';
export const Y3_LUALIB_REPO_URL = DEFAULT_Y3_LUALIB_REPO_URL;

export type RepoUrlResult =
    | { ok: true; url: string }
    | { ok: false; message: string };

const SUPPORTED_URL_PATTERN = /^(https?:\/\/|ssh:\/\/|git@[^:]+:.+)/i;

export function resolveY3LibraryRepoUrl(input: string | undefined): RepoUrlResult {
    if (input === undefined) {
        return { ok: true, url: DEFAULT_Y3_LUALIB_REPO_URL };
    }

    const trimmed = input.trim();
    if (trimmed.length === 0) {
        return { ok: false, message: '自定义 Y3 库仓库地址不能为空' };
    }

    if (!SUPPORTED_URL_PATTERN.test(trimmed)) {
        return { ok: false, message: '自定义 Y3 库仓库地址必须是 http(s)、ssh 或 git@ 形式' };
    }

    return { ok: true, url: trimmed };
}

export function makeY3LibraryCloneArgs(repoUrl: string, targetPath: string): string[] {
    return ['clone', repoUrl, targetPath];
}
