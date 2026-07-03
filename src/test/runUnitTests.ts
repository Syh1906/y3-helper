import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

const INTEGRATION_TEST_FILES = new Set([
	'extension.test.js',
]);

async function main(): Promise<void> {
	const mocha = new Mocha({
		ui: 'tdd',
		color: true,
	});

	const testsRoot = path.resolve(__dirname, './suite');
	const files = await glob('**/*.test.js', { cwd: testsRoot });
	for (const file of files) {
		if (!INTEGRATION_TEST_FILES.has(file.replace(/\\/g, '/'))) {
			mocha.addFile(path.resolve(testsRoot, file));
		}
	}

	await new Promise<void>((resolve, reject) => {
		mocha.run(failures => {
			if (failures > 0) {
				reject(new Error(`${failures} tests failed.`));
				return;
			}
			resolve();
		});
	});
}

main().catch((err) => {
	console.error('Failed to run unit tests', err);
	process.exit(1);
});
