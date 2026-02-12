import * as vscode from 'vscode';
import { StorageManager, EnvironmentProfile, AddonProfile } from '../storage';

// ─────────────────────────────────────────────────────────────────────────────
// Tree Item Classes
// ─────────────────────────────────────────────────────────────────────────────

export class EnvironmentItem extends vscode.TreeItem {
    constructor(public readonly profile: EnvironmentProfile) {
        super(profile.name, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'environment';
        this.description = profile.status;
        this.tooltip = `Venv: ${profile.venvPath}\nAnki Base: ${profile.ankiBasePath}`;

        // Status icons
        switch (profile.status) {
            case 'ready':
                this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
                break;
            case 'needs-setup':
                this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('testing.iconQueued'));
                break;
            case 'error':
                this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'));
                break;
        }
    }
}

export class AddonItem extends vscode.TreeItem {
    constructor(public readonly profile: AddonProfile) {
        super(profile.name, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'addon';
        this.description = profile.isInitialized ? 'Linked' : 'Not linked';
        this.tooltip = `Path: ${profile.localPath}\nAddon ID: ${profile.addonId}`;

        if (profile.isInitialized) {
            this.iconPath = new vscode.ThemeIcon('link', new vscode.ThemeColor('testing.iconPassed'));
        } else {
            this.iconPath = new vscode.ThemeIcon('plug', new vscode.ThemeColor('testing.iconQueued'));
        }
    }
}

export class ActionItem extends vscode.TreeItem {
    constructor(
        label: string,
        public readonly commandId: string,
        icon: string,
        tooltip?: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'action';
        this.iconPath = new vscode.ThemeIcon(icon);
        this.tooltip = tooltip || label;
        this.command = {
            command: commandId,
            title: label
        };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Environments Tree Provider
// ─────────────────────────────────────────────────────────────────────────────

export class EnvironmentsProvider implements vscode.TreeDataProvider<EnvironmentItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<EnvironmentItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor() {
        // Listen for storage changes
        StorageManager.getInstance().onChange(() => this.refresh());
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: EnvironmentItem): vscode.TreeItem {
        return element;
    }

    getChildren(): EnvironmentItem[] {
        const environments = StorageManager.getInstance().getEnvironments();
        return environments.map(env => new EnvironmentItem(env));
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Addons Tree Provider
// ─────────────────────────────────────────────────────────────────────────────

export class AddonsProvider implements vscode.TreeDataProvider<AddonItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<AddonItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor() {
        StorageManager.getInstance().onChange(() => this.refresh());
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: AddonItem): vscode.TreeItem {
        return element;
    }

    getChildren(): AddonItem[] {
        const addons = StorageManager.getInstance().getAddons();
        return addons.map(addon => new AddonItem(addon));
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Quick Actions Tree Provider
// ─────────────────────────────────────────────────────────────────────────────

export class ActionsProvider implements vscode.TreeDataProvider<ActionItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ActionItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    getTreeItem(element: ActionItem): vscode.TreeItem {
        return element;
    }

    getChildren(): ActionItem[] {
        return [
            new ActionItem('Run Anki (Debug)', 'anki.runAnki', 'play', 'Start Anki with debugger attached'),
            new ActionItem('Install Package', 'anki.installPackage', 'package', 'Install a pip package into the active environment'),
            new ActionItem('Open Addon Folder', 'anki.openAddonFolder', 'folder-opened', 'Open addon folder in File Explorer'),
            new ActionItem('Git Sync (Pull)', 'anki.gitSync', 'repo-sync', 'Pull latest changes from addon repo'),
            new ActionItem('Generate launch.json', 'anki.generateLaunchConfig', 'debug-configure', 'Generate debug config for addon'),
            new ActionItem('Open Config', 'anki.openConfig', 'json', 'View raw profiles configuration')
        ];
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
}
