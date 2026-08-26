import * as assert from 'assert';
import {
	findDuplicateMultiPlayerRoles,
	findInvalidMultiPlayerRoles,
	parseMultiPlayerRoles,
} from '../../multiPlayerRoles';

suite('Multi-player roles', () => {
	test('reads ordered editor role tuples and excludes neutral roles', () => {
		const roles = parseMultiPlayerRoles(JSON.stringify({
			roles: [
				{__tuple__: true, items: [2, {id: 2, name: 'role_two'}]},
				{__tuple__: true, items: [12, {id: 12, name: 'role_twelve'}]},
				{__tuple__: true, items: [31, {id: 31, name: 'neutral_enemy'}]},
				{__tuple__: true, items: [32, {id: 32, name: 'neutral_friend'}]},
			],
		}));

		assert.deepStrictEqual(roles, [
			{id: 2, name: 'role_two'},
			{id: 12, name: 'role_twelve'},
		]);
	});

	test('also accepts plain pair arrays and object-shaped role maps', () => {
		assert.deepStrictEqual(parseMultiPlayerRoles(JSON.stringify({
			roles: [[3, {id: 3}], ['8', {id: 8}]],
		})), [{id: 3, name: undefined}, {id: 8, name: undefined}]);

		assert.deepStrictEqual(parseMultiPlayerRoles(JSON.stringify({
			roles: {'4': {id: 4, name: 'role_four'}},
		})), [{id: 4, name: 'role_four'}]);
	});

	test('rejects malformed or mismatched role ids', () => {
		assert.throws(() => parseMultiPlayerRoles(JSON.stringify({roles: [[1, {id: 2}]]})), /mismatch/);
		assert.throws(() => parseMultiPlayerRoles(JSON.stringify({roles: [[1, {id: 1}], [1, {id: 1}]]})), /Duplicate/);
	});

	test('reports selected roles that are no longer available', () => {
		assert.deepStrictEqual(findInvalidMultiPlayerRoles(
			[2, 9, 9, 12],
			[{id: 2}, {id: 12}],
		), [9]);
	});

	test('reports duplicate selected roles before slot generation', () => {
		assert.deepStrictEqual(findDuplicateMultiPlayerRoles([2, 2, 12, 2, 12]), [2, 12]);
	});
});
