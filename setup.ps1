<#
 ============================================================================
   Anki-VSCode Setup Script
   Description : Clones the anki-vscode and ankimon repos, creates venv,
                 installs dependencies, configures add-on and launch.json.
   Author      : h0tp-ftw
   Date        : $(Get-Date -Format yyyy-MM-dd)
   Usage       : .\setup.ps1 (download and run interactively)
 ============================================================================
#>

Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "  Anki-VSCode Integration Script (for Ankimon Experimental)" -ForegroundColor Cyan
Write-Host "  by h0tp-ftw | https://github.com/h0tp-ftw/anki-vscode" -ForegroundColor Cyan
Write-Host "  Date: $(Get-Date -Format yyyy-MM-dd)" -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host ""

$ErrorActionPreference = 'Stop'

$YELLOW  = 'Yellow'
$CYAN    = 'Cyan'
$GREEN   = 'Green'
$MAGENTA = 'Magenta'

# Check for Administrator privileges
if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "This script must be run as Administrator. Please right-click PowerShell and select 'Run as administrator'." -ForegroundColor Red
    exit 1
}

# Detect system architecture
$archString = switch ($env:PROCESSOR_ARCHITECTURE) {
    "AMD64" { "x64 (64-bit)" }
    "ARM64" { "ARM64" }
    "x86"   { "x86 (32-bit)" }
    default { $env:PROCESSOR_ARCHITECTURE }
}
Write-Host "Detected Windows architecture: $archString" -ForegroundColor Cyan
Write-Host ""

# Check for Python
$pythonCmd = Get-Command -Name 'python', 'py' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($pythonCmd.Path -like "*WindowsApps*") {
    Write-Host "Detected Python App Installer stub. This will not work." -ForegroundColor Red
    Write-Host "Please install Python from python.org and ensure it's in your PATH." -ForegroundColor Yellow
    exit 1
}
if ($null -eq $pythonCmd) {
    Write-Host "Python is not installed or not in your PATH." -ForegroundColor Red
    Write-Host "Python (with pip) is required to continue." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To install Python ($archString recommended):" -ForegroundColor Cyan
    Write-Host "1. Visit https://www.python.org/downloads/windows/" -ForegroundColor Cyan
    Write-Host "2. Download the appropriate installer for your system." -ForegroundColor Cyan
    Write-Host "3. Run the installer and **CHECK 'Add Python to PATH'**." -ForegroundColor Cyan
    exit 1
}
Write-Host "Python is installed and available in your PATH." -ForegroundColor Green

# Check for Git
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "Git is not installed or not in your PATH." -ForegroundColor Red
    Write-Host "Git is required to clone repositories." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To install Git ($archString recommended):" -ForegroundColor Cyan
    Write-Host "1. Visit https://git-scm.com/download/win" -ForegroundColor Cyan
    Write-Host "2. Download and run the installer with default options." -ForegroundColor Cyan
    exit 1
}
Write-Host "Git is installed and available in your PATH." -ForegroundColor Green

# Configuration
$REPO_URL    = 'https://github.com/h0tp-ftw/anki-vscode.git'
$REPO_NAME   = 'anki-vscode'
$Documents   = [Environment]::GetFolderPath('MyDocuments')
$DefaultRepo = Join-Path $Documents $REPO_NAME

Write-Host "`n==== Anki-VSCode Project Setup ====" -ForegroundColor Cyan

# Prompt for clone directory
$InputRepo = Read-Host "`nDefault clone location for anki-vscode is `"$DefaultRepo`". Press Enter to accept or type a custom path"
$CloneDir  = if ([string]::IsNullOrWhiteSpace($InputRepo)) { $DefaultRepo } else { $InputRepo }
Write-Host "Cloning to: `"$CloneDir`"" -ForegroundColor Green

# Clone or update repository
if (-not (Test-Path $CloneDir)) {
    git clone $REPO_URL $CloneDir
} else {
    Write-Host "Repo exists; pulling latest changes..." -ForegroundColor Yellow
    Set-Location $CloneDir; git pull
}
Set-Location $CloneDir

# Prompt for venv location
$DefaultVenv = Join-Path $CloneDir 'venv'
$InputVenv = Read-Host "`nDefault venv location is `"$DefaultVenv`". Press Enter to accept or type a custom path"
$VenvDir   = if ([string]::IsNullOrWhiteSpace($InputVenv)) { $DefaultVenv } else { $InputVenv }
Write-Host "Creating venv at: `"$VenvDir`"" -ForegroundColor Green

# Create virtual environment
& $pythonCmd -m venv $VenvDir

# Install requirements if present
if (Test-Path 'requirements.txt') {
    Write-Host "`nInstalling dependencies from requirements.txt..." -ForegroundColor Cyan
    & "$VenvDir\Scripts\python.exe" -m pip install --upgrade pip
    & "$VenvDir\Scripts\python.exe" -m pip install -r requirements.txt
}

# Activate the virtual environment for current session
Write-Host "`nActivating virtual environment..." -ForegroundColor Cyan
& "$VenvDir\Scripts\Activate.ps1"

# Summary
Write-Host "`n=== Setup Summary ===" -ForegroundColor Cyan
Write-Host "Repository path : `"$CloneDir`"" -ForegroundColor Green
Write-Host "Virtual env path: `"$VenvDir`"" -ForegroundColor Green
if (Test-Path 'requirements.txt') {
    Write-Host 'Dependencies     : Installed' -ForegroundColor Green
} else {
    Write-Host 'Dependencies     : None found' -ForegroundColor Yellow
}
Write-Host 'Virtual env      : Active in this session' -ForegroundColor Green
Write-Host "======================================`n" -ForegroundColor Cyan

# Add-on Installation & launch.json Generation

$CUSTOM_ADDON_CHOICE = Read-Host "Do you want to install an addon other than Ankimon Experimental? [y/N]"

$IS_ANKIMON = $true
if ($CUSTOM_ADDON_CHOICE -eq 'y' -or $CUSTOM_ADDON_CHOICE -eq 'Y') {
    $IS_ANKIMON = $false
    Write-Host "`nEnter custom addon details:" -ForegroundColor Yellow
    $ADDON_REPO_URL = Read-Host "GitHub repository URL"
    $ADDON_SRC_PATH = Read-Host "Relative path to addon source folder (e.g., src\Ankimon)"
    $ADDON_FOLDER_NAME = Read-Host "Addon folder name in addons21 (e.g., 1908235722)"
    $ADDON_NAME = "Custom Addon"
} else {
    $ADDON_REPO_URL = "https://github.com/h0tp-ftw/ankimon.git"
    $ADDON_SRC_PATH = "src\Ankimon"
    $ADDON_FOLDER_NAME = "1908235722"
    $ADDON_NAME = "Ankimon"
}

Write-Host "`n$ADDON_NAME Add-on Installation Mode" -ForegroundColor Cyan
Write-Host "1) Native Anki installation (detect and use your system’s addons21)." -ForegroundColor Yellow
Write-Host "2) Separate Anki installation (you specify a base directory)." -ForegroundColor Yellow
$MODE = Read-Host 'Select [1 or 2]'

# Default addon clone location
$DefaultAddonCloneDir = Join-Path $Documents ($ADDON_REPO_URL.Split('/')[-1].Replace('.git',''))
$AddonCloneDirInput = Read-Host "Press Enter to clone $ADDON_NAME under `"$DefaultAddonCloneDir`", or type a custom path"
$AddonCloneDir = if ([string]::IsNullOrWhiteSpace($AddonCloneDirInput)) { $DefaultAddonCloneDir } else { $AddonCloneDirInput }
if (-not (Test-Path $AddonCloneDir)) { New-Item -ItemType Directory -Path $AddonCloneDir | Out-Null }
if (-not (Test-Path (Join-Path $AddonCloneDir '.git'))) {
    Write-Host "Cloning $ADDON_NAME into `"$AddonCloneDir`"..." -ForegroundColor Green
    git clone $ADDON_REPO_URL $AddonCloneDir
} else {
    Write-Host "Updating existing $ADDON_NAME repo..." -ForegroundColor Yellow
    Push-Location $AddonCloneDir; git pull; Pop-Location
}

# Determine Anki addons21 and base directory
if ($MODE -eq '1') {
    Write-Host "`nDetecting native Anki addons21 directory..." -ForegroundColor Cyan
    $possible = @("$env:APPDATA\Anki2\addons21", "$env:LOCALAPPDATA\Anki2\addons21")
    $AddonsDir = $null
    foreach ($dir in $possible) {
        if (Test-Path $dir) {
            Write-Host "Found: `"$dir`"" -ForegroundColor Green
            $yn = Read-Host "Use this directory? [Y/n]"
            if ($yn -eq '' -or $yn -match '^[Yy]') {
                $AddonsDir = $dir
                break
            }
        }
    }
    if (-not $AddonsDir) {
        $AnkiBase = Read-Host "Could not auto-detect addons21. Enter your Anki base directory"
        $AddonsDir = Join-Path $AnkiBase 'addons21'
    } else {
        $AnkiBase = (Get-Item $AddonsDir).Parent.FullName
    }
} elseif ($MODE -eq '2') {
    $AnkiBase = Read-Host "`nEnter your Anki base directory for the new installation"
    $AddonsDir = Join-Path $AnkiBase 'addons21'
    if (-not (Test-Path $AddonsDir)) { New-Item -ItemType Directory -Path $AddonsDir | Out-Null }
} else {
    Write-Host "Invalid option; aborting." -ForegroundColor Red
    exit 1
}

# User Backup Warning and Double Confirmation
if ($IS_ANKIMON) {
    Write-Host "`nIMPORTANT: USER FILES BACKUP REQUIRED" -ForegroundColor Red
    Write-Host "Your existing Ankimon user files WILL BE DELETED." -ForegroundColor Yellow
    Write-Host "You MUST backup files from the 'user_files' directory." -ForegroundColor Yellow
    $confirm1 = Read-Host "Have you backed up all your user files? Type YES to continue" 
    if ($confirm1 -ne 'YES') { Write-Host "Aborting."; exit 1 }
    $confirm2 = Read-Host "FINAL WARNING: Type YES to proceed with deletion and installation" 
    if ($confirm2 -ne 'YES') { Write-Host "Aborting."; exit 1 }
} else {
    Write-Host "`nIMPORTANT: Custom Addon .gitignore Warning" -ForegroundColor Red
    Write-Host "Ensure your addon's repo ignores cache and user data via .gitignore." -ForegroundColor Yellow
    $CONFIRM_CUSTOM = Read-Host "Have you configured your .gitignore? Type YES to continue"
    if ($CONFIRM_CUSTOM -ne 'YES') { Write-Host "Aborting."; exit 1 }
}

# Symlink addon source to addons21 folder
$srcDir     = Join-Path $AddonCloneDir $ADDON_SRC_PATH
$targetLink = Join-Path $AddonsDir $ADDON_FOLDER_NAME

Write-Host "`nLinking `"$srcDir`" to `"$targetLink`"..." -ForegroundColor Cyan
if (Test-Path $targetLink) {
    Write-Host "Removing existing link/folder at `"$targetLink`"..." -ForegroundColor Yellow
    Remove-Item -LiteralPath $targetLink -Recurse -Force
}
New-Item -ItemType SymbolicLink -Path $targetLink -Target $srcDir | Out-Null
Write-Host "Symlink created successfully." -ForegroundColor Green

# Generate launch.json
$launchDir = Join-Path $AddonCloneDir ".vscode"
New-Item -ItemType Directory -Path $launchDir -ErrorAction SilentlyContinue | Out-Null
$launchFile = Join-Path $launchDir "launch.json"
$programPath = Join-Path $VenvDir "Scripts\anki.exe"
$ankiBasePath = $AnkiBase

$jsonContent = @{
    version = "0.2.0"
    configurations = @(
        @{
            name = "Python Anki"
            type = "debugpy"
            request = "launch"
            stopOnEntry = $false
            program = $programPath
            cwd = '${workspaceRoot}'
            env = @{}
            args = @("-b", $ankiBasePath)
            envFile = '${workspaceRoot}/.env'
        }
    )
} | ConvertTo-Json -Depth 5

$jsonContent | Set-Content -Path $launchFile -Encoding UTF8
Write-Host "launch.json configured at: `"$launchFile`"" -ForegroundColor Green

# Final Confirmation & User Guidance
Write-Host "`n--- STEP 1: Open the $ADDON_NAME Project in VS Code ---" -ForegroundColor $YELLOW
Write-Host "1. In VS Code, go to 'File' > 'Open Folder...' and select:"
Write-Host "   $AddonCloneDir" -ForegroundColor $CYAN
Read-Host "Press Enter once the folder is open in VS Code"

Write-Host "`n--- STEP 2: Select the Python Interpreter ---" -ForegroundColor $YELLOW
Write-Host "1. Press Ctrl+Shift+P to open the Command Palette."
Write-Host "2. Type 'Python: Select Interpreter' and press Enter."
Write-Host "3. Select 'Enter interpreter path...' and find:"
Write-Host "   $(Join-Path $VenvDir 'Scripts\python.exe')" -ForegroundColor $CYAN
Read-Host "Press Enter once the interpreter is set"

Write-Host "`n--- STEP 3: Start Debugging ---" -ForegroundColor $YELLOW
Write-Host "1. Click the 'Run and Debug' icon (Ctrl+Shift+D)."
Write-Host "2. Select 'Python Anki' from the dropdown and click the green play button."
Read-Host "Press Enter once Anki has started"

Write-Host "`n=====================================================================" -ForegroundColor $GREEN
Write-Host "  Congratulations! Your debugging environment is fully configured!" -ForegroundColor $GREEN
Write-Host "=====================================================================" -ForegroundColor $GREEN
Write-Host "`nSummary of your setup:"
Write-Host "  - Add-on Source    : $AddonCloneDir" -ForegroundColor $CYAN
Write-Host "  - Virtual Env      : $VenvDir" -ForegroundColor $CYAN
Write-Host "  - Interpreter Path : $(Join-Path $VenvDir 'Scripts\python.exe')" -ForegroundColor $CYAN
Write-Host "  - Anki Data        : $AnkiBase" -ForegroundColor $CYAN
Write-Host "`nThanks for using the tool, hope it helps <3 - h0tp" -ForegroundColor $MAGENTA
