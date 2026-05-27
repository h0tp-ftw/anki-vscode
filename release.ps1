# release.ps1 - Build and release the Anki VS Code extension
# Usage:
#   .\release.ps1              # build + git tag + git push
#   .\release.ps1 -DryRun      # build only, no git operations
#   .\release.ps1 -SkipPush    # build + tag locally, but don't push

param(
    [switch]$DryRun,
    [switch]$SkipPush
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ExtDir = "$PSScriptRoot\extension"

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Anki VS Code Extension - Release Tool   " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Read version from package.json
$pkg     = Get-Content "$ExtDir\package.json" | ConvertFrom-Json
$version = $pkg.version
$name    = $pkg.name
$vsix    = "$name-$version.vsix"

Write-Host "  Version : $version" -ForegroundColor Yellow
Write-Host "  Package : $vsix"    -ForegroundColor Yellow
Write-Host ""

# 2. Check git tag doesn't already exist
if (-not $DryRun) {
    $tag         = "v$version"
    $existingTag = git -C $PSScriptRoot tag -l $tag
    if ($existingTag) {
        Write-Host "[!] Git tag '$tag' already exists. Bump version in package.json first." -ForegroundColor Red
        exit 1
    }
}

# 3. Install deps
Write-Host "[1/4] Installing npm dependencies..." -ForegroundColor Green
Push-Location $ExtDir
npm install --silent
Pop-Location

# 4. Compile TypeScript
Write-Host "[2/4] Compiling TypeScript..." -ForegroundColor Green
Push-Location $ExtDir
npm run compile
if ($LASTEXITCODE -ne 0) {
    Write-Host "[!] Compile failed. Aborting." -ForegroundColor Red
    exit 1
}
Pop-Location

# 5. Package .vsix
Write-Host "[3/4] Packaging .vsix..." -ForegroundColor Green
Push-Location $ExtDir
npx @vscode/vsce package --no-dependencies --out "releases\$vsix"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[!] vsce package failed. Aborting." -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location

Write-Host ""
Write-Host "  Built: extension\releases\$vsix" -ForegroundColor Green
Write-Host ""

if ($DryRun) {
    Write-Host "(DryRun - skipping git tag and push)" -ForegroundColor DarkGray
    exit 0
}

# 6. Git add, commit release artifact, tag, push
Write-Host "[4/4] Tagging and pushing..." -ForegroundColor Green

git -C $PSScriptRoot add "extension/releases/$vsix" ".gitignore" "release.ps1"
git -C $PSScriptRoot diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
    git -C $PSScriptRoot commit -m "release: v$version"
}

git -C $PSScriptRoot tag "v$version" -m "Release v$version"

if (-not $SkipPush) {
    git -C $PSScriptRoot push
    git -C $PSScriptRoot push origin "v$version"
    Write-Host "  Pushed tag v$version to origin" -ForegroundColor Green
} else {
    Write-Host "  (SkipPush - tag created locally only)" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Done! v$version released." -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Install locally:"
Write-Host "    code --install-extension extension\releases\$vsix"
Write-Host ""
Write-Host "  Publish to marketplace:"
Write-Host "    npx @vscode/vsce publish"
Write-Host ""
