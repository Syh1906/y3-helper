const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const outputDir = path.join(root, 'dist', 'vsix');
const outputPath = path.join(outputDir, `${pkg.name}-${pkg.version}.vsix`);
const vsceCli = path.join(root, 'node_modules', '@vscode', 'vsce', 'vsce');

fs.mkdirSync(outputDir, { recursive: true });

const result = spawnSync(
  process.execPath,
  [vsceCli, 'package', '--out', outputPath],
  {
    cwd: root,
    stdio: 'inherit',
  }
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
