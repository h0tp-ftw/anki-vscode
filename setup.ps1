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

$ErrorActionPreference = 'Stop'

$YELLOW  = 'Yellow'
$CYAN    = 'Cyan'
$GREEN   = 'Green'
$BOLD    = $host.UI.RawUI.ForegroundColor

# --- Prerequisite Checks ---
# Check for Python
$pythonAvailable = $false
$pythonCmd = $null
if (Get-Command python -ErrorAction SilentlyContinue) {
    if ((Get-Command python).Path -like '*WindowsApps*') {
        Write-Host "Error: Detected Python App Installer stub. Please install Python from python.org." -ForegroundColor Red
        exit 1
    } else {
        $pythonAvailable = $true
        $pythonCmd = 'python'
    }
}
if (-not $pythonAvailable -and (Get-Command py -ErrorAction SilentlyContinue)) {
    $pythonAvailable = $true
    $pythonCmd = 'py'
}
if (-not $pythonAvailable) {
    Write-Host "Error: Python is not installed or not in your PATH." -ForegroundColor Red
    exit 1
}

# Check for Git
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "Error: Git is not installed or not in your PATH." -ForegroundColor Red
    exit 1
}

# --- Helper Function ---
function Confirm-OrSelect-Directory {
    param(
        [string]$Title,
        [string]$DefaultDir
    )
    $ExpandedDefault = [Environment]::ExpandEnvironmentVariables($DefaultDir)
    Write-Host "`n--- $Title ---" -ForegroundColor $YELLOW
    $Input = Read-Host "Default: $ExpandedDefault `n(Press Enter to accept default or type custom path)"
    $SelectedDir = if ([string]::IsNullOrWhiteSpace($Input)) { $ExpandedDefault } else { $Input }
    return [Environment]::ExpandEnvironmentVariables($SelectedDir)
}

# --- Main Menu ---
Write-Host "`n--- Main Setup Menu ---" -ForegroundColor $YELLOW
Write-Host "Please select a setup option:"
Write-Host "  [F] Full Install (Default) ⭐: Clone anki-vscode, setup venv, install dependencies, clone addon, create symlink, and generate launch.json." -ForegroundColor $GREEN
Write-Host "  [V] Venv Only: Clone anki-vscode, setup venv, and install dependencies. Skip addon setup." -ForegroundColor $YELLOW
Write-Host "  [A] Addon Setup Only: Clone addon and create symlink. (Skips anki-vscode clone, venv setup, and launch.json generation.)" -ForegroundColor $CYAN
Write-Host ""

$INSTALL_MODE = ''
while ($INSTALL_MODE -eq '') {
    $CHOICE = Read-Host "Enter your choice (F/V/A) [F]"
    if ([string]::IsNullOrWhiteSpace($CHOICE)) { $CHOICE = 'F' }

    switch ($CHOICE.ToUpper()) {
        'F' { $INSTALL_MODE = 'FULL' }
        'V' { $INSTALL_MODE = 'VENV_ONLY' }
        'A' { $INSTALL_MODE = 'ADDON_ONLY' }
        default { Write-Host "Invalid choice. Please enter F, V, or A." -ForegroundColor Red }
    }
}

# ───────────────────────────────────────────────────────────────────────────
# Add-on Selection (for FULL and ADDON_ONLY modes)
# ───────────────────────────────────────────────────────────────────────────
if ($INSTALL_MODE -eq 'FULL' -or $INSTALL_MODE -eq 'ADDON_ONLY') {
    Write-Host "`nCustom Add-on Configuration" -ForegroundColor $CYAN
    Write-Host "==========================="
    $CUSTOM_ADDON_CHOICE = Read-Host "Do you want to install an addon other than Ankimon Experimental? [y/N]"

    $IS_ANKIMON = $true
    if ($CUSTOM_ADDON_CHOICE -eq 'y' -or $CUSTOM_ADDON_CHOICE -eq 'Y') {
        $IS_ANKIMON = $false
        Write-Host "`nEnter custom addon details:" -ForegroundColor $YELLOW
        $ADDON_REPO_URL = Read-Host "GitHub repository URL"
        $ADDON_SRC_PATH = Read-Host "Relative path to Anki addon sub-folder in repo (e.g. src\Addon_name, can be left blank if repo is the addon package)"
        $ADDON_FOLDER_NAME = Read-Host "Addon folder name to be used in addons21 (e.g. 1908235722)"
        $ADDON_NAME = "Custom Addon"
    } else {
        $ADDON_REPO_URL = "https://github.com/h0tp-ftw/ankimon.git"
        $ADDON_SRC_PATH = "src\Ankimon"
        $ADDON_FOLDER_NAME = "1908235722"
        $ADDON_NAME = "Ankimon"
    }
}

# ───────────────────────────────────────────────────────────────────────────
# anki-vscode clone and venv setup
# ───────────────────────────────────────────────────────────────────────────
if ($INSTALL_MODE -eq 'FULL' -or $INSTALL_MODE -eq 'VENV_ONLY') {
    $REPO_URL = 'https://github.com/h0tp-ftw/anki-vscode.git'
    $REPO_NAME = 'anki-vscode'
    $DefaultRepo = Join-Path ([Environment]::GetFolderPath('MyDocuments')) $REPO_NAME
    
    $CloneDir = Confirm-OrSelect-Directory "Step 1: Select Repository Clone Location" $DefaultRepo
    Write-Host "Cloning repository to: $CloneDir" -ForegroundColor $GREEN

    if (-not (Test-Path $CloneDir)) {
        New-Item -ItemType Directory -Path (Split-Path $CloneDir -Parent) -Force | Out-Null
        git clone $REPO_URL $CloneDir
    } else {
        Write-Host "Repository directory already exists. Updating..." -ForegroundColor $YELLOW
        Set-Location $CloneDir; git pull
    }
    Set-Location $CloneDir

    $DefaultVenv = Join-Path $CloneDir 'venv'
    $VenvDir = Confirm-OrSelect-Directory "Step 2: Select Virtual Environment Location" $DefaultVenv
    
    Write-Host "Creating virtual environment at: $VenvDir" -ForegroundColor $GREEN
    New-Item -ItemType Directory -Path (Split-Path $VenvDir -Parent) -Force | Out-Null
    & $pythonCmd -m venv $VenvDir

    $REQUIREMENTS_INSTALLED = $false
    if (Test-Path 'requirements.txt') {
        Write-Host "`nInstalling requirements from requirements.txt..."
        & "$VenvDir\Scripts\python.exe" -m pip install -q --upgrade pip
        & "$VenvDir\Scripts\pip.exe" install -q -r requirements.txt
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Requirements installed successfully!" -ForegroundColor $GREEN
            $REQUIREMENTS_INSTALLED = $true
        } else {
            Write-Host "⚠️ Some requirements may have failed to install." -ForegroundColor $YELLOW
        }
    } else {
        Write-Host "No requirements.txt found. Skipping dependency installation."
    }

    Write-Host "`nActivating virtual environment..."
    & "$VenvDir\Scripts\Activate.ps1"

    Write-Host "`nVIRTUAL ENVIRONMENT SET UP - SUMMARY"
    Write-Host "==========================="
    Write-Host "✅ Repository cloned/updated at: $CloneDir"
    Write-Host "✅ Virtual environment created at: $VenvDir"
    if ($REQUIREMENTS_INSTALLED) {
        Write-Host "✅ Python packages installed from requirements.txt"
    } else {
        Write-Host "ℹ️ No requirements.txt found - no packages installed"
    }
    Write-Host "✅ Virtual environment is now ACTIVE for this session"
    Write-Host "`nTo reactivate this environment later, run: & '$VenvDir\Scripts\Activate.ps1'"
}

# ───────────────────────────────────────────────────────────────────────────
# Add-on Installation & launch.json Generation
# ───────────────────────────────────────────────────────────────────────────
if ($INSTALL_MODE -eq 'FULL' -or $INSTALL_MODE -eq 'ADDON_ONLY') {
    Write-Host "`n$ADDON_NAME Add-on Installation Mode" -ForegroundColor $CYAN
    Write-Host "1) Native Anki: Uses your existing Anki addons21 directory."
    Write-Host "2) Separate Anki: Creates a new, isolated Anki installation."
    Write-Host "Option 1 is convenient; Option 2 is isolated and safer for development."
    $MODE = Read-Host "`nSelect [1 or 2]"

    $DefaultAddonCloneDir = Join-Path ([Environment]::GetFolderPath('MyDocuments')) ($ADDON_REPO_URL.Split('/')[-1].Replace('.git',''))
    $AddonCloneDir = Confirm-OrSelect-Directory "Step 3: Select Addon Clone Location" $DefaultAddonCloneDir
    
    New-Item -ItemType Directory -Path $AddonCloneDir -Force | Out-Null
    if (-not (Test-Path (Join-Path $AddonCloneDir '.git'))) {
        Write-Host "Cloning $ADDON_NAME into $AddonCloneDir…" 
        git clone $ADDON_REPO_URL $AddonCloneDir
    } else {
        Write-Host "Updating existing $ADDON_NAME repo…" 
        Push-Location $AddonCloneDir; git pull; Pop-Location
    }

    Write-Host "`n--- Step 4: Select Anki Base Directory ---" -ForegroundColor $YELLOW
    if ($MODE -eq '1') {
        Write-Host "`nDetecting native Anki addons21 directory..."
        $possible = @(
            "$env:APPDATA\Anki2\addons21",
            "$env:LOCALAPPDATA\Anki2\addons21"
        )
        $AddonsDir = $null
        foreach ($dir in $possible) {
            if (Test-Path $dir) {
                Write-Host "Found: $dir"
                $yn = Read-Host "Use this directory? [Y/n]"
                if (-not ($yn -match '^[Nn]')) {
                    $AddonsDir = $dir
                    break
                }
            }
        }
        if (-not $AddonsDir) {
            Write-Host "Could not auto-detect addons21. It should contain folders like '$ADDON_FOLDER_NAME'."
            $DefaultAnkiBase = Join-Path ([Environment]::GetFolderPath('MyDocuments')) "Anki2"
            $AnkiBase = Confirm-OrSelect-Directory "Select Anki Base Directory" $DefaultAnkiBase
            $AddonsDir = Join-Path $AnkiBase 'addons21'
        } else {
            $AnkiBase = (Get-Item $AddonsDir).Parent.FullName
        }
    } elseif ($MODE -eq '2') {
        $DefaultAnkiBase = Join-Path ([Environment]::GetFolderPath('MyDocuments')) "Anki2"
        $AnkiBase = Confirm-OrSelect-Directory "Select Anki Base Directory" $DefaultAnkiBase
        $AddonsDir = Join-Path $AnkiBase 'addons21'
        New-Item -ItemType Directory -Path $AddonsDir -Force | Out-Null
    } else {
        Write-Host "Invalid option; aborting." -ForegroundColor Red
        exit 1
    }

    if ($IS_ANKIMON) {
        Write-Host "`n⚠️ IMPORTANT: Ankimon User Files Backup Required ⚠️" -ForegroundColor Red
        Write-Host "Your existing Ankimon user files WILL BE DELETED."
        $confirm1 = Read-Host "Have you backed up all your user files? Type YES to continue" 
        if ($confirm1 -ne 'YES') { Write-Host "Aborting."; exit 1 }
        $confirm2 = Read-Host "FINAL WARNING: Type YES to proceed with deletion" 
        if ($confirm2 -ne 'YES') { Write-Host "Aborting."; exit 1 }
    } else {
        Write-Host "`n⚠️ IMPORTANT: Custom Addon .gitignore Warning ⚠️" -ForegroundColor Red
        Write-Host "Ensure your addon's .gitignore properly ignores cache/user data."
        $CONFIRM_CUSTOM = Read-Host "Have you configured your .gitignore? Type YES to continue"
        if ($CONFIRM_CUSTOM -ne 'YES') { Write-Host "Aborting."; exit 1 }
    }

    $srcDir = Join-Path $AddonCloneDir $ADDON_SRC_PATH
    $targetLink = Join-Path $AddonsDir $ADDON_FOLDER_NAME
    Write-Host "`nLinking $srcDir -> $targetLink"
    if (Test-Path $targetLink) {
        Write-Host "Removing existing directory/symlink at $targetLink"
        Remove-Item -LiteralPath $targetLink -Recurse -Force
    }
    New-Item -ItemType SymbolicLink -Path $targetLink -Target $srcDir | Out-Null
    Write-Host "Symlink created successfully."

    if ($INSTALL_MODE -eq 'FULL') {
        $launchDir = Join-Path $AddonCloneDir '.vscode'
        New-Item -ItemType Directory -Path $launchDir -Force | Out-Null

        $runAnkiFile = Join-Path $launchDir 'run_anki.py'
        $runAnkiContent = "import sys`nfrom aqt import run`nsys.exit(run())`n"
        Set-Content -Path $runAnkiFile -Value $runAnkiContent -Encoding UTF8

        $launchFile = Join-Path $launchDir 'launch.json'
        $ankiBaseEscaped = $AnkiBase.Replace('\', '\\')
        $pythonPath = "$($VenvDir)\Scripts\python.exe".Replace('\', '\\')

        $launchJsonContent = @"
{
    "version": "0.2.0",
    "configurations": [
        {
            "name": "Python Anki",
            "type": "debugpy",
            "request": "launch",
            "stopOnEntry": false,
            "program": "`${workspaceFolder}/.vscode/run_anki.py",
            "cwd": "`${workspaceFolder}",
            "python": "$pythonPath",
            "args": [
                "-b",
                "$ankiBaseEscaped"
            ],
            "envFile": "`${workspaceFolder}/.env"
        }
    ]
}
"@
        Set-Content -Path $launchFile -Value $launchJsonContent -Encoding UTF8
        Write-Host "`nlaunch.json generated at $launchFile"

        Write-Host "`nThe automated setup is complete. Now, I will guide you through the final manual steps in VS Code."
        
        Write-Host "`n--- STEP 1: Open $ADDON_NAME Project in VS Code ---" -ForegroundColor $YELLOW
        Read-Host "Press Enter once $ADDON_NAME folder is open in VS Code..."

        Write-Host "`n--- STEP 2: Start Debugging ---" -ForegroundColor $YELLOW
        Read-Host "Press Enter once Anki has started via the debugger..."

        Write-Host "`n=====================================================================" -ForegroundColor $GREEN
        Write-Host "  Setup Complete! Your debugging environment is configured." -ForegroundColor $GREEN
        Write-Host "=====================================================================" -ForegroundColor $GREEN
        Write-Host "`nSetup Summary:"
        Write-Host "  - Add-on Source: $AddonCloneDir" -ForegroundColor $CYAN
        Write-Host "  - Virtual Env:   $VenvDir" -ForegroundColor $CYAN
        Write-Host "  - Anki Data Directory: $AnkiBase" -ForegroundColor $CYAN
    }
}

Write-Host "`nThanks for using the tool! <3 - h0tp"
Write-Host ""
