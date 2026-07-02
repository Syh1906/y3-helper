import * as assert from 'assert';
import { Y3_LUALIB_REPO_URL } from '../../y3LibrarySource';

suite('Y3 library source', () => {
    test('uses the local VSIX branch fork for project initialization', () => {
        assert.strictEqual(Y3_LUALIB_REPO_URL, 'https://github.com/Syh1906/y3-lualib.git');
    });
});
