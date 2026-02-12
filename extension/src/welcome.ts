import * as vscode from 'vscode';
import * as path from 'path';

export class WelcomeManager {
    private context: vscode.ExtensionContext;
    private readonly versionKey = 'anki-vscode-setup.version';

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    public async checkAndShowWelcome() {
        const currentVersion = this.context.extension.packageJSON.version;
        const previousVersion = this.context.globalState.get<string>(this.versionKey);

        if (currentVersion !== previousVersion) {
            await this.showWelcome(currentVersion, !previousVersion);
            await this.context.globalState.update(this.versionKey, currentVersion);
        }
    }

    private async showWelcome(version: string, isNewInstall: boolean) {
        // Create a webview panel
        const panel = vscode.window.createWebviewPanel(
            'ankiWelcome',
            isNewInstall ? 'Welcome to Anki Dev Suite' : `Anki Dev Suite v${version}`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        // Get content
        panel.webview.html = this.getWebviewContent(version, isNewInstall);
    }

    private getWebviewContent(version: string, isNewInstall: boolean): string {
        const title = 'Anki Development Suite';

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            padding: 20px;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
        }
        h1, h2, h3 { color: var(--vscode-textLink-foreground); }
        .header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
        .version-badge {
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 0.85em;
            font-weight: 500;
        }
        .card {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            padding: 15px;
            border-radius: 6px;
            margin: 15px 0;
            border: 1px solid var(--vscode-widget-border);
        }
        .btn {
            display: inline-block;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            padding: 8px 16px;
            text-decoration: none;
            border-radius: 4px;
            margin-top: 10px;
        }
        .btn:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        ul, ol { padding-left: 20px; }
        code {
            background-color: var(--vscode-textBlockQuote-background);
            padding: 2px 4px;
            border-radius: 3px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>📖 ${title}</h1>
        <span class="version-badge">v${version}</span>
    </div>
    
    <div class="card">
        <h2>👋 About the Creator</h2>
        <p>Hi, I'm <strong>h0tp</strong> (h0tp-ftw)! I built this extension to simplify Anki addon development.</p>
        <p>If you find this useful or need help, join our community:</p>
        <a href="https://discord.gg/your-discord-link" class="btn">Join Discord Community</a>
    </div>

    <div class="card" style="border-left: 4px solid var(--vscode-editorError-foreground);">
        <h2>⚠️ License & Terms</h2>
        <p>This extension is released under the <strong>GPL-3.0 License</strong>.</p>
        <p>This aligns with Anki's own open-source philosophy (AGPL-3.0). Freedom to share and modify!</p>
        <p><em>This tool is not affiliated with standard Anki (Damien Elmes).</em></p>
    </div>

    <div class="card">
        <h2>🚀 Getting Started</h2>
        <ol>
            <li>Click the <strong>Book Icon</strong> in the Activity Bar (left).</li>
            <li>Create an <strong>Environment</strong> (installs Anki & dependencies).</li>
            <li>Add your <strong>Addon</strong> (cloned or local).</li>
            <li>Click <strong>Initialize</strong> to create the symlink.</li>
            <li>Click <strong>Generate launch.json</strong> and press F5!</li>
        </ol>
    </div>
</body>
</html>`;
    }
}
