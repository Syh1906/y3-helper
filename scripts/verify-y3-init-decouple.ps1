param(
    [Parameter(Mandatory = $true)]
    [string]$TemplatePath,

    [switch]$KeepTemp
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
chcp 65001 >$null

function Write-Ok([string]$Message) {
    Write-Output "[OK] $Message"
}

function Assert-PathExists([string]$Path, [string]$Message) {
    if (!(Test-Path -LiteralPath $Path)) {
        throw "${Message}: $Path"
    }
}

$resolvedTemplate = (Resolve-Path -LiteralPath $TemplatePath).Path
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$tempRoot = Join-Path $repoRoot 'tmp/y3-init-decouple'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$tempProject = Join-Path $tempRoot "Y3_Helper_test01-$stamp"

try {
    New-Item -ItemType Directory -Path $tempRoot -Force >$null
    Copy-Item -LiteralPath $resolvedTemplate -Destination $tempProject -Recurse -Force
    Write-Ok "Copied template to temp project: $tempProject"

    $headerProject = Join-Path $tempProject 'header.project'
    $scriptPath = Join-Path $tempProject 'maps/EntryMap/script'
    $y3Path = Join-Path $scriptPath 'y3'
    Assert-PathExists $headerProject 'Temp project is missing header.project'
    Assert-PathExists $scriptPath 'Temp project is missing EntryMap script directory'
    if (Test-Path -LiteralPath $y3Path) {
        throw "Blank template copy should not already contain script/y3: $y3Path"
    }
    Write-Ok "Blank template copy has expected structure and no script/y3"

    $demoDirName = -join @([char]0x6F14, [char]0x793A)
    $configDirName = -join @([char]0x9879, [char]0x76EE, [char]0x914D, [char]0x7F6E)
    $demoDir = Join-Path $y3Path $demoDirName
    $configDir = Join-Path $demoDir $configDirName
    New-Item -ItemType Directory -Path $configDir -Force >$null
    Set-Content -LiteralPath (Join-Path $y3Path 'README.md') -Value "Y3 library fixture" -Encoding UTF8
    Set-Content -LiteralPath (Join-Path $configDir 'main.lua') -Value "print('fixture')" -Encoding UTF8
    Write-Ok "Created manual-copy Y3 library fixture without .git"

    $nodeScript = @(
        'const { resolveY3LibraryState, isY3LibraryUsable } = require("./out/y3ProjectInit");',
        'const y3Path = process.argv[2];',
        '(async () => {',
        '  const state = await resolveY3LibraryState(y3Path);',
        '  const usable = await isY3LibraryUsable(y3Path);',
        '  if (state.kind !== "manual-copy-valid" || usable !== true) {',
        '    console.error(JSON.stringify({ state, usable }));',
        '    process.exit(1);',
        '  }',
        '  console.log(JSON.stringify({ state, usable }));',
        '})().catch((error) => {',
        '  console.error(error);',
        '  process.exit(1);',
        '});'
    ) -join "`n"
    $checkOutput = $nodeScript | node - $y3Path
    if ($LASTEXITCODE -ne 0) {
        throw "Manual-copy Y3 library recognition failed: $checkOutput"
    }
    Write-Ok "Manual-copy Y3 library recognized: $checkOutput"
}
finally {
    if (!$KeepTemp -and (Test-Path -LiteralPath $tempProject)) {
        Remove-Item -LiteralPath $tempProject -Recurse -Force
        Write-Ok "Cleaned temp project: $tempProject"
    } elseif ($KeepTemp) {
        Write-Output "[INFO] Kept temp project: $tempProject"
    }
}
