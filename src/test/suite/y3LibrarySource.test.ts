import * as assert from 'assert';
import {
    DEFAULT_Y3_LUALIB_REPO_URL,
    makeY3LibraryCloneArgs,
    resolveY3LibraryRepoUrl,
    Y3_LUALIB_REPO_URL,
} from '../../y3LibrarySource';

suite('Y3 library source', () => {
    test('uses the local VSIX branch fork for project initialization', () => {
        assert.strictEqual(Y3_LUALIB_REPO_URL, 'https://github.com/Syh1906/y3-lualib.git');
        assert.strictEqual(DEFAULT_Y3_LUALIB_REPO_URL, 'https://github.com/Syh1906/y3-lualib.git');
    });

    test('uses the default repository only when no explicit custom input is provided', () => {
        assert.deepStrictEqual(
            resolveY3LibraryRepoUrl(undefined),
            { ok: true, url: 'https://github.com/Syh1906/y3-lualib.git' },
        );
    });

    test('accepts explicit custom repository URLs', () => {
        assert.deepStrictEqual(
            resolveY3LibraryRepoUrl('https://example.com/team/y3-lualib.git'),
            { ok: true, url: 'https://example.com/team/y3-lualib.git' },
        );
        assert.deepStrictEqual(
            resolveY3LibraryRepoUrl('git@example.com:team/y3-lualib.git'),
            { ok: true, url: 'git@example.com:team/y3-lualib.git' },
        );
    });

    test('rejects blank custom repository URL without silently falling back', () => {
        const result = resolveY3LibraryRepoUrl('   ');

        assert.strictEqual(result.ok, false);
    });

    test('rejects unsupported custom repository URL schemes', () => {
        const result = resolveY3LibraryRepoUrl('file:///tmp/y3-lualib');

        assert.strictEqual(result.ok, false);
    });

    test('builds clone args without shell quoting', () => {
        assert.deepStrictEqual(
            makeY3LibraryCloneArgs('https://example.com/team/y3-lualib.git', 'E:/Maps/EntryMap/script/y3'),
            ['clone', 'https://example.com/team/y3-lualib.git', 'E:/Maps/EntryMap/script/y3'],
        );
    });
});
