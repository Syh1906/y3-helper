Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir
$ValidationRoot = Join-Path $RepoRoot "tmp/ai-dev-env-validation"

$MapRoots = @(
    "E:/Program Files (x86)/kkduizhan/Games/y3/2.0/game/LocalData/Y3_Helper_test01",
    "E:/Program Files (x86)/kkduizhan/Games/y3/2.0/game/LocalData/Y3_Helper_test02"
)

function Assert-True {
    param(
        [bool]$Condition,
        [string]$Message
    )
    if (-not $Condition) {
        throw $Message
    }
}

try {
    foreach ($mapRoot in $MapRoots) {
        Assert-True (Test-Path -LiteralPath $mapRoot) "Map root not found: $mapRoot"
    }

    if (Test-Path -LiteralPath $ValidationRoot) {
        Remove-Item -LiteralPath $ValidationRoot -Recurse -Force
    }
    New-Item -ItemType Directory -Path $ValidationRoot | Out-Null

    $copyScript = @'
const fs = require("fs");
const path = require("path");

const validationRoot = process.argv[2];
const mapRoots = process.argv.slice(3);
for (const mapRoot of mapRoots) {
  const target = path.join(validationRoot, path.basename(mapRoot));
  fs.cpSync(mapRoot, target, { recursive: true, force: true, verbatimSymlinks: true });
}
'@
    $copyScript | node - $ValidationRoot $MapRoots
    if ($LASTEXITCODE -ne 0) {
        throw "copying map validation fixtures failed with exit code $LASTEXITCODE"
    }

    Push-Location $RepoRoot
    try {
        npm run compile-tests
        if ($LASTEXITCODE -ne 0) {
            throw "npm run compile-tests failed with exit code $LASTEXITCODE"
        }
    }
    finally {
        Pop-Location
    }

    $nodeScript = @'
const path = require("path");
const repoRoot = process.argv[2].replace(/\\/g, "/");
const validationRoot = process.argv[3].replace(/\\/g, "/");
const {
  AI_DEV_ENV_MARKER,
  buildAiDevEnvironmentPlan,
  createClaudeMcpJson,
  createCodexConfigToml,
  createRootAgentsMarkdown,
  createScriptAgentsMarkdown,
} = require(path.join(repoRoot, "out/aiDevEnvironment.js"));
const {
  applyAiDevEnvironment,
  setAiMcpProjectConfigEnabled,
} = require(path.join(repoRoot, "out/aiDevEnvironmentApplier.js"));
const fs = require("fs");

const skillSourceRoot = "E:/CodeMoy/y3-lualib/.codex/skills/y3-kernel-navigator";
const mapNames = ["Y3_Helper_test01", "Y3_Helper_test02"];

async function main() {
for (const mapName of mapNames) {
  const projectRoot = `${validationRoot}/${mapName}`;
  const scriptRoot = `${projectRoot}/maps/EntryMap/script`;
  const plan = buildAiDevEnvironmentPlan({
    projectRoot,
    scriptRoot,
    currentMapName: "EntryMap",
    skillSourceRoot,
  });
  if (!plan.rootAgentsPath.startsWith(projectRoot)) {
    throw new Error(`plan escaped validation copy: ${plan.rootAgentsPath}`);
  }
  if (!plan.scriptAgentsPath.startsWith(scriptRoot)) {
    throw new Error(`script plan escaped validation copy: ${plan.scriptAgentsPath}`);
  }
  if (!createRootAgentsMarkdown({ projectRoot, scriptRoot, currentMapName: "EntryMap" }).includes(AI_DEV_ENV_MARKER)) {
    throw new Error(`root AGENTS marker missing for ${mapName}`);
  }
  const generatedAgentsMarkdown = [
    createRootAgentsMarkdown({ projectRoot, scriptRoot, currentMapName: "EntryMap" }),
    createScriptAgentsMarkdown({ projectRoot, scriptRoot, currentMapName: "EntryMap" }),
  ].join("\n");
  if (!generatedAgentsMarkdown.includes("y3-kernel-navigator")) {
    throw new Error(`script AGENTS skill missing for ${mapName}`);
  }
  for (const expectedToken of ["\u5e38\u89c1\u4efb\u52a1\u5165\u53e3", "main.lua", "\u53ef\u91cd\u8f7d\u7684\u4ee3\u7801.lua", "y3-helper/meta", ".vscode", ".y3maker", ".log", "log/"]) {
    if (!generatedAgentsMarkdown.includes(expectedToken)) {
      throw new Error(`generated AGENTS navigation token missing for ${mapName}: ${expectedToken}`);
    }
  }
  for (const forbiddenToken of [projectRoot, scriptRoot, "E:/Program Files", "LocalData/Y3_Helper"]) {
    if (generatedAgentsMarkdown.includes(forbiddenToken)) {
      throw new Error(`generated AGENTS leaked machine path token for ${mapName}: ${forbiddenToken}`);
    }
  }
  const generatedCodexConfig = createCodexConfigToml("", true);
  const generatedClaudeConfig = createClaudeMcpJson("", true);
  for (const serverName of ["y3-helper", "y3editor", "y3runtime"]) {
    if (!generatedCodexConfig.includes(`[mcp_servers.${serverName}]`)) {
      throw new Error(`missing Codex MCP server: ${serverName}`);
    }
    if (!generatedClaudeConfig.includes(serverName)) {
      throw new Error(`missing Claude MCP server: ${serverName}`);
    }
  }
  const skillTargetExistedBeforeSkip = fs.existsSync(`${plan.codexSkillTarget}/SKILL.md`);
  const skippedPlan = await applyAiDevEnvironment({
    projectRoot,
    scriptRoot,
    currentMapName: "EntryMap",
    skillSourceRoot: `${projectRoot}/missing-skill-source`,
  });
  if (skippedPlan.skillStatus !== "skipped") {
    throw new Error(`expected missing skill to be skipped for ${mapName}`);
  }
  if (!skillTargetExistedBeforeSkip && fs.existsSync(`${plan.codexSkillTarget}/SKILL.md`)) {
    throw new Error(`missing skill source should not create skill target: ${plan.codexSkillTarget}`);
  }
  fs.writeFileSync(plan.claudeMcpPath, "{ bad json", "utf8");
  let malformedRejected = false;
  try {
    await applyAiDevEnvironment({
      projectRoot,
      scriptRoot,
      currentMapName: "EntryMap",
      skillSourceRoot,
    });
  } catch {
    malformedRejected = true;
  }
  if (!malformedRejected) {
    throw new Error(`malformed Claude MCP json was not rejected: ${plan.claudeMcpPath}`);
  }
  fs.unlinkSync(plan.claudeMcpPath);
  const syncedPlan = await applyAiDevEnvironment({
    projectRoot,
    scriptRoot,
    currentMapName: "EntryMap",
    skillSourceRoot,
  });
  if (syncedPlan.skillStatus !== "synced") {
    throw new Error(`expected existing skill to be synced for ${mapName}`);
  }
  const expectedFiles = [
    plan.gitignorePath,
    plan.rootAgentsPath,
    plan.rootClaudePath,
    plan.scriptAgentsPath,
    plan.scriptClaudePath,
    plan.codexConfigPath,
    plan.claudeMcpPath,
    plan.claudeSettingsPath,
    plan.scriptCodexConfigLink,
    plan.scriptClaudeMcpLink,
    plan.scriptClaudeSettingsLink,
    `${plan.codexSkillTarget}/SKILL.md`,
    `${plan.codexSkillTarget}/.y3-helper-ai-dev-env`,
    plan.claudeSkillLink,
    plan.scriptCodexSkillLink,
    plan.scriptClaudeSkillLink,
  ];
  for (const file of expectedFiles) {
    if (!fs.existsSync(file)) {
      throw new Error(`expected generated path missing: ${file}`);
    }
  }
  if (!fs.lstatSync(plan.rootClaudePath).isSymbolicLink()) {
    throw new Error(`root CLAUDE.md is not a symbolic link: ${plan.rootClaudePath}`);
  }
  if (!fs.lstatSync(plan.claudeSkillLink).isSymbolicLink()) {
    throw new Error(`Claude skill path is not a symbolic link: ${plan.claudeSkillLink}`);
  }
  for (const link of [
    plan.scriptCodexConfigLink,
    plan.scriptClaudeMcpLink,
    plan.scriptClaudeSettingsLink,
    plan.scriptCodexSkillLink,
    plan.scriptClaudeSkillLink,
  ]) {
    if (!fs.lstatSync(link).isSymbolicLink()) {
      throw new Error(`script workspace AI config path is not a symbolic link: ${link}`);
    }
  }
  for (const removedMcpHubPath of [
    `${projectRoot}/.y3maker/mcp_settings.json`,
    `${scriptRoot}/.y3maker/mcp_settings.json`,
  ]) {
    if (fs.existsSync(removedMcpHubPath)) {
      throw new Error(`obsolete Y3-Helper McpHub config should not be generated: ${removedMcpHubPath}`);
    }
  }
  for (const serverName of ["y3-helper", "y3editor", "y3runtime"]) {
    if (!fs.readFileSync(plan.codexConfigPath, "utf8").includes(`[mcp_servers.${serverName}]`)) {
      throw new Error(`Codex MCP server missing after apply: ${serverName}`);
    }
    if (!fs.readFileSync(plan.claudeMcpPath, "utf8").includes(serverName)) {
      throw new Error(`Claude MCP server missing after apply: ${serverName}`);
    }
  }
  const gitignore = fs.readFileSync(plan.gitignorePath, "utf8");
  const gitignoreLines = gitignore.split(/\r?\n/);
  if (!gitignoreLines.includes("/.claude/settings.local.json")) {
    throw new Error(`Claude local settings rule missing from .gitignore: ${plan.gitignorePath}`);
  }
  if (!gitignoreLines.includes("/maps/EntryMap/script/.claude/settings.local.json")) {
    throw new Error(`script Claude local settings rule missing from .gitignore: ${plan.gitignorePath}`);
  }
  const rootGitignoreMatches = gitignoreLines.filter((line) => line === "/.claude/settings.local.json");
  if (rootGitignoreMatches.length !== 1) {
    throw new Error(`Claude local settings rule duplicated in .gitignore: ${plan.gitignorePath}`);
  }
  const scriptGitignoreMatches = gitignoreLines.filter((line) => line === "/maps/EntryMap/script/.claude/settings.local.json");
  if (scriptGitignoreMatches.length !== 1) {
    throw new Error(`script Claude local settings rule duplicated in .gitignore: ${plan.gitignorePath}`);
  }
  await setAiMcpProjectConfigEnabled({
    projectRoot,
    scriptRoot,
    currentMapName: "EntryMap",
    skillSourceRoot,
  }, false);
  const disabledCodex = fs.readFileSync(plan.codexConfigPath, "utf8");
  if ((disabledCodex.match(/enabled = false/g) ?? []).length !== 3) {
    throw new Error(`Codex MCP config was not disabled for all Y3 servers: ${plan.codexConfigPath}`);
  }
  const disabledClaudeMcp = JSON.parse(fs.readFileSync(plan.claudeMcpPath, "utf8"));
  for (const serverName of ["y3-helper", "y3editor", "y3runtime"]) {
    if (disabledClaudeMcp.mcpServers[serverName].disabled !== true) {
      throw new Error(`Claude .mcp.json was not disabled for ${serverName}: ${plan.claudeMcpPath}`);
    }
  }
  const disabledSettings = JSON.parse(fs.readFileSync(plan.claudeSettingsPath, "utf8"));
  for (const serverName of ["y3-helper", "y3editor", "y3runtime"]) {
    if (!disabledSettings.disabledMcpjsonServers.includes(serverName)) {
      throw new Error(`Claude MCP config was not disabled for ${serverName}: ${plan.claudeSettingsPath}`);
    }
  }
  await setAiMcpProjectConfigEnabled({
    projectRoot,
    scriptRoot,
    currentMapName: "EntryMap",
    skillSourceRoot,
  }, true);
  const enabledCodex = fs.readFileSync(plan.codexConfigPath, "utf8");
  if ((enabledCodex.match(/enabled = true/g) ?? []).length !== 3) {
    throw new Error(`Codex MCP config was not enabled for all Y3 servers: ${plan.codexConfigPath}`);
  }
  const enabledClaudeMcp = JSON.parse(fs.readFileSync(plan.claudeMcpPath, "utf8"));
  const enabledSettings = JSON.parse(fs.readFileSync(plan.claudeSettingsPath, "utf8"));
  for (const serverName of ["y3-helper", "y3editor", "y3runtime"]) {
    if (enabledClaudeMcp.mcpServers[serverName].disabled !== false) {
      throw new Error(`Claude .mcp.json was not enabled for ${serverName}: ${plan.claudeMcpPath}`);
    }
    if (!enabledSettings.enabledMcpjsonServers.includes(serverName) || enabledSettings.disabledMcpjsonServers.includes(serverName)) {
      throw new Error(`Claude settings were not enabled for ${serverName}: ${plan.claudeSettingsPath}`);
    }
  }
  fs.writeFileSync(plan.codexConfigPath, '[mcp_servers.y3-helper]\nurl = "http://127.0.0.1:9999/mcp"\nenabled = true\n', "utf8");
  let conflictRejected = false;
  try {
    await applyAiDevEnvironment({
      projectRoot,
      scriptRoot,
      currentMapName: "EntryMap",
      skillSourceRoot,
    });
  } catch {
    conflictRejected = true;
  }
  if (!conflictRejected) {
    throw new Error(`Codex MCP URL conflict was not rejected: ${plan.codexConfigPath}`);
  }
}
console.log("[OK] AI dev environment plans validated for temporary map copies.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
'@

    $scriptPath = Join-Path $ValidationRoot "check-ai-dev-env.js"
    Set-Content -LiteralPath $scriptPath -Value $nodeScript -Encoding UTF8
    Push-Location $RepoRoot
    try {
        node $scriptPath $RepoRoot $ValidationRoot
        if ($LASTEXITCODE -ne 0) {
            throw "node AI dev environment validation failed with exit code $LASTEXITCODE"
        }
    }
    finally {
        Pop-Location
    }
}
finally {
    if (Test-Path -LiteralPath $ValidationRoot) {
        Remove-Item -LiteralPath $ValidationRoot -Recurse -Force
    }
}

Assert-True (-not (Test-Path -LiteralPath $ValidationRoot)) "Validation temp directory was not cleaned: $ValidationRoot"
Write-Output "[OK] AI dev environment validation finished and temp files were cleaned."
