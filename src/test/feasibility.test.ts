import * as assert from 'assert';

import { HashSet } from '../utility/hashSet';

type TestObject = {
    id: number;
    name: string;
};

function run(): void {
    assert.deepStrictEqual(JSON.parse('[1,2,3,4,5]'), [1, 2, 3, 4, 5]);

    const set = new HashSet<TestObject>();
    const first = { id: 1, name: 'Object 1' };
    const duplicate = { id: 1, name: 'Object 1' };
    const differentName = { id: 1, name: 'Object 2' };
    const differentId = { id: 5, name: 'Object 1' };

    set.add(first);
    set.add(duplicate);
    set.add(differentName);
    set.add(differentId);

    assert.strictEqual(set.size, 3);
    assert.strictEqual(set.has(first), true);
    assert.deepStrictEqual([...set], [duplicate, differentName, differentId]);

    console.log('Feasibility checks passed.');
}

run();
