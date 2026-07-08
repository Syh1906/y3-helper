const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertNotContains(file, needles) {
  const text = read(file);
  for (const needle of needles) {
    assert(!text.includes(needle), `${file} must not contain ${needle}`);
  }
}

const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));

assert(pkg.name === 'y3-helper-xiaowei', 'package.json name must be y3-helper-xiaowei');
assert(pkg.displayName === 'Y3开发助手（小为版）', 'package.json displayName must identify the Xiaowei edition');
assert(pkg.publisher === 'syh1906', 'package.json publisher must be syh1906');
assert(/^1\.0\.\d+$/.test(pkg.version), 'package.json version must stay on the 1.0.x Xiaowei edition line');
assert(pkg.repository && pkg.repository.url === 'https://github.com/Syh1906/y3-helper', 'repository.url must point to Syh1906/y3-helper');
assert(pkg.scripts && pkg.scripts['package:vsix'], 'package:vsix script must exist');
assert(pkg.scripts['package:vsix'].includes('scripts/package-vsix.js'), 'package:vsix must use scripts/package-vsix.js');
assert(read('scripts/package-vsix.js').includes("'dist', 'vsix'"), 'package-vsix.js must write into dist/vsix');
assert(read('scripts/package-vsix.js').includes("'node_modules'"), 'package-vsix.js must use the project-local vsce binary');
assert(pkg.devDependencies && pkg.devDependencies['@vscode/vsce'], '@vscode/vsce must be locked as a project devDependency');

assert(lock.name === pkg.name, 'package-lock root name must match package.json');
assert(lock.version === pkg.version, 'package-lock root version must match package.json');
assert(lock.packages && lock.packages[''] && lock.packages[''].name === pkg.name, 'package-lock packages root name must match package.json');
assert(lock.packages[''].version === pkg.version, 'package-lock packages root version must match package.json');

assert(!exists('.github/workflows/publish.yml'), 'publish.yml must be removed');
assert(!exists('.github/workflows/mirror.yml'), 'mirror.yml must be removed');
assert(read('.vscodeignore').includes('.codemaker/'), '.vscodeignore must exclude internal .codemaker workspace files from VSIX');
assert(read('.github/workflows/build.yml').includes('node scripts/verify-xiaowei-edition.js'), 'build workflow must run the Xiaowei edition verifier');
assert(read('.github/workflows/build.yml').includes('npm run package:vsix'), 'build workflow must reuse the Xiaowei edition VSIX packaging script');

const currentFiles = [
  'package.json',
  'README.md',
  'README-EN.md',
  '文档/README.md',
  '文档/01-项目架构总览.md',
  '文档/02-编译与打包.md',
  '文档/03-发布流程（GitHub）.md',
];

for (const file of currentFiles) {
  if (exists(file)) {
    assertNotContains(file, [
      'github.com/y3-editor/y3-helper',
      'sumneko.y3-helper',
      'VSCODE_TOKEN',
      'vsce publish',
      'git-hztx.nie.netease.com',
      'dist/mcp-server.js',
      '配置 MCP (Windows)',
      '配置 MCP (WSL)',
    ]);
  }
}

const readme = read('README.md');
assert(readme.includes('http://127.0.0.1:8766/mcp'), 'README.md must document the HTTP MCP endpoint');
assert(readme.includes('MCP Server/启动 MCP Server'), 'README.md must keep the real MCP start menu path');
assertNotContains('README.md', ['本地分叉版', 'y3-helper-local']);
assertNotContains('README-EN.md', ['Local Fork', 'local VSIX fork', 'y3-helper-local']);

console.log('Xiaowei edition identity checks passed');
