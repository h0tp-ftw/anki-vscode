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
Write-Host ("  Date: " + (Get-Date -Format yyyy-MM-dd)) -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host ""

$ErrorActionPreference = 'Stop'

$YELLOW  = 'Yellow'
$CYAN    = 'Cyan'
$GREEN   = 'Green'
$MAGENTA = 'Magenta'

# Check for Administrator privileges
$IsAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $IsAdmin) {
    Write-Host "This script must be run as Administrator. Please right-click PowerShell and select 'Run as administrator'." -ForegroundColor Red
    exit 1
}

# Detect system architecture (x64, ARM64, x86)
$arch = (Get-CimInstance Win32_OperatingSystem).OSArchitecture
if ($arch -match "64") {
    if ($arch -match "ARM") { $archString = "ARM64" }
    else { $archString = "x64 (64-bit)" }
} elseif ($arch -match "32") {
    $archString = "x86 (32-bit)"
} else {
    $archString = $arch
}

Write-Host ""
Write-Host "Detected Windows architecture: $archString" -ForegroundColor Cyan
Write-Host ""

# Check for Python (python or py)
$pythonAvailable = $false
$pythonCmd = $null
if (Get-Command python -ErrorAction SilentlyContinue) {
    if ((Get-Command python).Path -like '*WindowsApps*') {
        Write-Host "Detected Python App Installer stub. This will not work." -ForegroundColor Red
        Write-Host "Please install Python from python.org." -ForegroundColor Yellow
    } else {
        $pythonAvailable = $true
        $pythonCmd = 'python'
    }
}

if (-not $pythonAvailable -and (Get-Command py -ErrorAction SilentlyContinue)) {
    $pythonAvailable = $true
    $pythonCmd = 'py'
}

if ($pythonAvailable) {
    Write-Host "Python is installed and available in your PATH." -ForegroundColor Green
} else {
    Write-Host "Python is not installed or not in your PATH." -ForegroundColor Red
    Write-Host "Python (with pip) is required to continue." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To install Python ($archString recommended):" -ForegroundColor Cyan
    Write-Host "1. Visit https://www.python.org/downloads/windows/" -ForegroundColor Cyan
    if ($archString -eq "ARM64") {
        Write-Host "2. Download the Windows ARM64 executable installer (look for 'Windows ARM64' under 'Stable Releases')." -ForegroundColor Cyan
    } elseif ($archString -eq "x64 (64-bit)") {
        Write-Host "2. Download the Windows x86-64 executable installer (look for 'Windows installer (64-bit)')." -ForegroundColor Cyan
    } else {
        Write-Host "2. Download the Windows x86 executable installer (look for 'Windows installer (32-bit)')." -ForegroundColor Cyan
    }
    Write-Host "3. Run the installer and **MAKE SURE YOU CHECK THE OPTION 'Add Python to PATH'** during installation." -ForegroundColor Cyan
    Write-Host ""
    Write-Host "After installing, please restart this script (and your PowerShell)." -ForegroundColor Yellow
    exit 1
}

# Check for Git
if (Get-Command git -ErrorAction SilentlyContinue) {
    Write-Host "Git is installed and available in your PATH." -ForegroundColor Green
} else {
    Write-Host "Git is not installed or not in your PATH." -ForegroundColor Red
    Write-Host "Git is required to clone repositories." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To install Git ($archString recommended):" -ForegroundColor Cyan
    Write-Host "1. Visit https://git-scm.com/download/win" -ForegroundColor Cyan
    if ($archString -eq "ARM64") {
        Write-Host "2. Download the '64-bit Git for Windows Setup' (ARM64 builds are available in the 'Other Git for Windows downloads' section)." -ForegroundColor Cyan
    } else {
        Write-Host "2. Download the '64-bit Git for Windows Setup' for x64, or '32-bit Git for Windows Setup' for x86." -ForegroundColor Cyan
    }
    Write-Host "3. Follow all the default prompts for its installation." -ForegroundColor Cyan
    Write-Host ""
    Write-Host "After installing, please restart this script (and your PowerShell)." -ForegroundColor Yellow
    exit 1
}

# Configuration
$REPO_URL    = 'https://github.com/h0tp-ftw/anki-vscode.git'
$REPO_NAME   = 'anki-vscode'
$Documents   = [Environment]::GetFolderPath('MyDocuments')
$DefaultRepo = Join-Path $Documents $REPO_NAME

Write-Host "`n==== Anki-VSCode Project Setup ====" -ForegroundColor Cyan

# Prompt for clone directory
Write-Host "`nDefault clone location for anki-vscode: $DefaultRepo" -ForegroundColor Cyan
Write-Host "Examples: C:\Users\Name\Documents\my-project | D:\Dev\anki-vscode" -ForegroundColor Yellow
$InputRepo = Read-Host 'Press Enter to accept default or type custom path'
$CloneDir  = if ([string]::IsNullOrWhiteSpace($InputRepo)) { $DefaultRepo } else { $InputRepo }
Write-Host "Cloning to: $CloneDir" -ForegroundColor Green

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
Write-Host "`nDefault venv location: $DefaultVenv" -ForegroundColor Cyan
Write-Host "Examples: C:\Envs\anki-env | .\venv" -ForegroundColor Yellow
$InputVenv = Read-Host 'Press Enter to accept default or type custom path'
$VenvDir   = if ([string]::IsNullOrWhiteSpace($InputVenv)) { $DefaultVenv } else { $InputVenv }
Write-Host "Creating venv at: $VenvDir" -ForegroundColor Green

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
Write-Host "Repository path : $CloneDir" -ForegroundColor Green
Write-Host "Virtual env path: $VenvDir" -ForegroundColor Green
if (Test-Path 'requirements.txt') {
    Write-Host 'Dependencies     : Installed' -ForegroundColor Green
} else {
    Write-Host 'Dependencies     : None found' -ForegroundColor Yellow
}
Write-Host 'Virtual env      : Active in this session' -ForegroundColor Green
Write-Host "======================================`n" -ForegroundColor Cyan

# Ankimon Add-on Installation & launch.json Generation

Write-Host ""
Write-Host "Ankimon Add-on Installation Mode" -ForegroundColor Cyan
Write-Host "1) Native Anki installation (detect and use your system’s addons21). This will use your existing Anki installation for all the files and addons." -ForegroundColor Yellow
Write-Host "2) Separate Anki installation (you specify a base directory). This will make an entirely new Anki installation, separate from your normal Anki installation." -ForegroundColor Yellow
Write-Host "Both options are good. 1. is more convenient and mimics your actual installation, and 2. is isolated from your install, and messing up your addon will not affect your normal installation." -ForegroundColor Yellow
Write-Host ""
$MODE = Read-Host 'Select [1 or 2]'

# Default Ankimon clone location
$DefaultAnkimon = Join-Path $Documents 'ankimon'
$AnkimonDirInput = Read-Host "Press Enter to clone Ankimon under [$DefaultAnkimon], or type custom path"
$AnkimonDir = if ([string]::IsNullOrWhiteSpace($AnkimonDirInput)) { $DefaultAnkimon } else { $AnkimonDirInput }
if (-not (Test-Path $AnkimonDir)) { New-Item -ItemType Directory -Path $AnkimonDir | Out-Null }
if (-not (Test-Path (Join-Path $AnkimonDir '.git'))) {
    Write-Host "Cloning Ankimon into $AnkimonDir…" -ForegroundColor Green
    git clone https://github.com/h0tp-ftw/ankimon.git $AnkimonDir
} else {
    Write-Host "Updating existing Ankimon repo…" -ForegroundColor Yellow
    Push-Location $AnkimonDir
    git pull
    Pop-Location
}

# Determine Anki addons21 and base directory with confirmation
if ($MODE -eq '1') {
    Write-Host ""
    Write-Host "Detecting native Anki addons21 directory..." -ForegroundColor Cyan
    $possible = @(
        "$env:APPDATA\Anki2\addons21",
        "$env:LOCALAPPDATA\Anki2\addons21"
    )
    $AddonsDir = $null
    foreach ($dir in $possible) {
        if (Test-Path $dir) {
            Write-Host "Found: $dir" -ForegroundColor Green
            $yn = Read-Host "Use this directory? [Y/n]"
            if ($yn -eq '' -or $yn -match '^[Yy]') {
                $AddonsDir = $dir
                break
            }
        }
    }
    if (-not $AddonsDir) {
        Write-Host "Could not auto-detect addons21. It should contain folders like '1908235722' (for Ankimon)." -ForegroundColor Yellow
        $AnkiBase = Read-Host "Enter your Anki base directory (this folder should contain a folder named addons21)"
        $AddonsDir = Join-Path $AnkiBase 'addons21'
    } else {
        $AnkiBase = (Get-Item $AddonsDir).Parent.FullName
    }
} elseif ($MODE -eq '2') {
    Write-Host ""
    $AnkiBase = Read-Host "Enter your Anki base directory where you want to store the new Anki installation. (It will get an addons21 folder with a symlinked version of Ankimon)"
    $AddonsDir = Join-Path $AnkiBase 'addons21'
    if (-not (Test-Path $AddonsDir)) { New-Item -ItemType Directory -Path $AddonsDir | Out-Null }
} else {
    Write-Host "Invalid option; aborting." -ForegroundColor Red
    exit 1
}

# User Backup Warning and Double Confirmation

Write-Host ""
Write-Host "IMPORTANT: USER FILES BACKUP REQUIRED" -ForegroundColor Red
Write-Host "Before installing, your existing Ankimon user files WILL BE DELETED." -ForegroundColor Yellow
Write-Host "You MUST backup the following files from the 'user_files' directory:" -ForegroundColor Yellow
Write-Host "  - meta.json, mypokemon.json, mainpokemon.json, badges.json, items.json" -ForegroundColor Yellow
Write-Host "  - teams.json and data.json (if they exist)" -ForegroundColor Yellow
if ($MODE -eq '2') {
    Write-Host "Note: For a NEW (mode 2) installation, backup is still strongly recommended." -ForegroundColor Yellow
}
Write-Host ""
$confirm1 = Read-Host "Have you backed up all your user files? Type YES to continue" 
if ($confirm1 -ne 'YES') {
    Write-Host "Aborting installation." -ForegroundColor Red
    exit 1
}
$confirm2 = Read-Host "FINAL WARNING: Type YES to proceed with deletion and installation" 
if ($confirm2 -ne 'YES') {
    Write-Host "Aborting installation." -ForegroundColor Red
    exit 1
}
Write-Host "Proceeding with Ankimon add-on installation..." -ForegroundColor Green

# Symlink src/Ankimon -> addons21/1908235722

$srcDir     = Join-Path $AnkimonDir 'src\Ankimon'
$targetLink = Join-Path $AddonsDir '1908235722'

Write-Host ""
Write-Host "Linking `$srcDir` to the directory `$targetLink` " -ForegroundColor Cyan
if (Test-Path $targetLink) {
    Write-Host "Removing existing link or folder at $targetLink..." -ForegroundColor Yellow
    Remove-Item -LiteralPath $targetLink -Recurse -Force
}
New-Item -ItemType SymbolicLink -Path $targetLink -Target $srcDir | Out-Null

Write-Host "Symlink created: $targetLink pointing to $srcDir" -ForegroundColor Green

$sourceTemplate = Join-Path $CloneDir '.vscode\launch_windows.json'
$destDir        = Join-Path $AnkimonDir '.vscode'
$destTemplate   = Join-Path $destDir 'launch_windows.json'

if (-not (Test-Path $destTemplate)) {
    if (-not (Test-Path $destDir)) {
        New-Item -ItemType Directory -Path $destDir | Out-Null
    }
    Copy-Item -Path $sourceTemplate -Destination $destTemplate -Force
}

# Generate the final launch.json using the copied template
$templateFile = $destTemplate
$launchFile   = Join-Path $AnkimonDir '.vscode\launch.json'

$content = Get-Content -Path $templateFile -Raw
$content = $content.Replace('$PROGRAM_PATH$', "$($VenvDir)\Scripts\anki.exe")
$content = $content.Replace('$DATA_DIR$',      $AnkiBase)
$content | Set-Content -Path $launchFile -Encoding UTF8

Write-Host "launch.json configured at: $launchFile" -ForegroundColor Green

# Final Confirmation & User Guidance

# --- STEP 1: Open the Folder ---
Write-Host "--- STEP 1: Open the Ankimon Project in VS Code ---" -ForegroundColor $YELLOW
Write-Host "Please open Visual Studio Code."
Write-Host "In VS Code, go to 'File' > 'Open Folder...' and select the Ankimon directory."
Write-Host "The correct folder path is: " -NoNewline
Write-Host "$AnkimonDir" -ForegroundColor $CYAN
Write-Host "To confirm that it is correct, go to the Source Control tab (Ctrl + Shift + G). If it is correct, it will show you the Changes tab and a Graph of commits in the lower field."
Write-Host "If it tells you to Initialize Repository or Open Folder, you have the wrong folder."
Write-Host ""
Write-Host "Press Enter once you have the Ankimon folder open in VS Code..." -NoNewline
$null = Read-Host

# --- STEP 2: Select the Python Interpreter ---
Write-Host ""
Write-Host "--- STEP 2: Select the Python Interpreter ---" -ForegroundColor $YELLOW
Write-Host "This is a crucial step. We need to tell VS Code to use the Python from our new virtual environment."
Write-Host "1. In VS Code, press " -NoNewline
Write-Host "Ctrl+Shift+P" -ForegroundColor $CYAN -NoNewline
Write-Host " to open the Command Palette."
Write-Host "2. Type " -NoNewline
Write-Host "Python: Select Interpreter" -ForegroundColor $CYAN -NoNewline
Write-Host " and press Enter."
Write-Host "3. A list of Python interpreters will appear. Click on " -NoNewline
Write-Host "'Enter interpreter path...'" -ForegroundColor $CYAN
Write-Host "4. Paste the following path into the input box and press Enter:"
Write-Host "   $($VenvDir)\Scripts\python.exe" -ForegroundColor $CYAN
Write-Host ""
Write-Host "After this, you should see the correct Python version in the bottom-right corner of VS Code."
Write-Host "The imports on your file (like import aqt) should also be resolved now."
Write-Host ""
Write-Host "Press Enter once you have set the interpreter..." -NoNewline
$null = Read-Host

# --- STEP 3: Start Debugging ---
Write-Host ""
Write-Host "--- STEP 3: Start Debugging ---" -ForegroundColor $YELLOW
Write-Host "Now, let's launch Anki with the debugger attached."
Write-Host "1. Click on the 'Run and Debug' icon in the left sidebar (it looks like a play button with a bug) (Ctrl+Shift+D)."
Write-Host "2. At the top of the Run and Debug panel, you should see a green play button next to a dropdown."
Write-Host "3. The dropdown should already say " -NoNewline
Write-Host "'Python Anki'" -ForegroundColor $GREEN -NoNewline
Write-Host ". If not, select it from the list."
Write-Host "4. Click the green play button to start debugging."
Write-Host ""
Write-Host "Anki should now open with your Ankimon add-on loaded."
Write-Host ""
Write-Host "Press Enter once Anki has started..." -NoNewline
$null = Read-Host

# --- FINAL CONFIRMATION ---
Write-Host ""
Write-Host "=====================================================================" -ForegroundColor $GREEN
Write-Host "  Congratulations! Your debugging environment is fully configured!" -ForegroundColor $GREEN
Write-Host "=====================================================================" -ForegroundColor $GREEN
Write-Host ""
Write-Host "Here is a summary of your setup for future reference:"
Write-Host "  - Add-on Source: " -NoNewline
Write-Host "$AnkimonDir" -ForegroundColor $CYAN
Write-Host "  - Virtual Env: " -NoNewline
Write-Host "$VenvDir" -ForegroundColor $CYAN
Write-Host "  - Interpreter Path: " -NoNewline
Write-Host "$($VenvDir)\Scripts\python.exe" -ForegroundColor $CYAN
Write-Host "  - Anki Data Directory: " -NoNewline
Write-Host "$AnkiBase" -ForegroundColor $CYAN
Write-Host ""
Write-Host "Thanks for using the tool, hope it helps <3 - h0tp" -ForegroundColor $MAGENTA
Write-Host ""
