# Installation Guide

This guide provides detailed instructions for setting up the Anki Development Suite.

## Automated Setup (Scripts)

### macOS/Linux (Bash)
Run this command in your terminal:
```bash
curl -fsSL https://raw.githubusercontent.com/h0tp-ftw/anki-vscode/refs/heads/master/setup.sh | bash
```
After running, choose your desired setup option (Full Install, Venv Only, or Addon Setup Only).

### Windows (PowerShell)
Open **PowerShell as Administrator** and run:
```powershell
Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/h0tp-ftw/anki-vscode/refs/heads/master/setup.ps1' -OutFile 'setup.ps1'
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\setup.ps1
```

---

## Manual Setup

### 1. Download the Extension
Download the latest `.vsix` from the [GitHub Releases](https://github.com/h0tp-ftw/anki-vscode/releases) page.

### 2. VS Code Configuration
1. Install the extension in VS Code.
2. Open your add-on folder in VS Code.
2. Copy `launch.json` from this repository to `.vscode/launch.json` in your addon.
3. Update `program` and `python` paths in `launch.json` to point to your `venv`.
