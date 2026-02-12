# Anki Development Suite (VS Code Extension)

This extension provides a dedicated sidebar for managing Anki add-on development environments.

## ✨ Features

- **Environments Panel**: Create and manage isolated Python virtual environments with Anki (aqt) installed.
- **Addons Panel**: Link your add-on source code (local or GitHub) to specific environments.
- **Quick Actions**:
  - **Run Anki (Debug)**: Launch Anki with the debugger attached to your add-on.
  - **Install Package**: Quickly add pip dependencies to your venv.
  - **Git Sync**: Pull latest changes from your add-on's repository.
  - **Generate launch.json**: Create standard VS Code debug configurations.

## 🛠️ Development

To build the extension from source:

```bash
cd extension
npm install
npm run compile
```

Press `F5` in VS Code to launch the Extension Development Host.

## 📦 Installation

Download the latest `.vsix` from the [GitHub Releases](https://github.com/h0tp-ftw/anki-vscode/releases) page. Install the file via:
`Extensions > ... (Views and more actions) > Install from VSIX...`
