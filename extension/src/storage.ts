import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface EnvironmentProfile {
    id: string;
    name: string;
    venvPath: string;
    ankiBasePath: string;
    status: 'ready' | 'needs-setup' | 'error';
}

export interface AddonProfile {
    id: string;
    name: string;
    repoUrl?: string;
    localPath: string;
    srcSubfolder: string;
    addonId: string;
    linkedEnvId?: string;
    isInitialized: boolean;
}

export interface StorageData {
    environments: EnvironmentProfile[];
    addons: AddonProfile[];
    activeEnvironmentId?: string;
    activeAddonId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage Manager
// ─────────────────────────────────────────────────────────────────────────────

export class StorageManager {
    private static instance: StorageManager;
    private data: StorageData;
    private configPath: string;
    private onChangeEmitter = new vscode.EventEmitter<void>();
    public readonly onChange = this.onChangeEmitter.event;

    private constructor(context: vscode.ExtensionContext) {
        this.configPath = path.join(context.globalStorageUri.fsPath, 'anki-dev-config.json');
        this.data = this.load();
    }

    static initialize(context: vscode.ExtensionContext): StorageManager {
        if (!StorageManager.instance) {
            StorageManager.instance = new StorageManager(context);
        }
        return StorageManager.instance;
    }

    static getInstance(): StorageManager {
        if (!StorageManager.instance) {
            throw new Error('StorageManager not initialized. Call initialize() first.');
        }
        return StorageManager.instance;
    }

    private load(): StorageData {
        try {
            if (fs.existsSync(this.configPath)) {
                const content = fs.readFileSync(this.configPath, 'utf-8');
                return JSON.parse(content);
            }
        } catch (err) {
            console.error('Failed to load config:', err);
        }
        return { environments: [], addons: [] };
    }

    private save(): void {
        try {
            const dir = path.dirname(this.configPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.configPath, JSON.stringify(this.data, null, 2), 'utf-8');
            this.onChangeEmitter.fire();
        } catch (err) {
            console.error('Failed to save config:', err);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Environments
    // ─────────────────────────────────────────────────────────────────────────

    getEnvironments(): EnvironmentProfile[] {
        return this.data.environments;
    }

    getEnvironment(id: string): EnvironmentProfile | undefined {
        return this.data.environments.find(e => e.id === id);
    }

    addEnvironment(env: Omit<EnvironmentProfile, 'id'>): EnvironmentProfile {
        const newEnv: EnvironmentProfile = {
            ...env,
            id: this.generateId()
        };
        this.data.environments.push(newEnv);
        this.save();
        return newEnv;
    }

    updateEnvironment(id: string, updates: Partial<EnvironmentProfile>): void {
        const index = this.data.environments.findIndex(e => e.id === id);
        if (index !== -1) {
            this.data.environments[index] = { ...this.data.environments[index], ...updates };
            this.save();
        }
    }

    deleteEnvironment(id: string): void {
        this.data.environments = this.data.environments.filter(e => e.id !== id);
        // Unlink any addons that were using this environment
        this.data.addons.forEach(a => {
            if (a.linkedEnvId === id) {
                a.linkedEnvId = undefined;
            }
        });
        this.save();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Addons
    // ─────────────────────────────────────────────────────────────────────────

    getAddons(): AddonProfile[] {
        return this.data.addons;
    }

    getAddon(id: string): AddonProfile | undefined {
        return this.data.addons.find(a => a.id === id);
    }

    addAddon(addon: Omit<AddonProfile, 'id'>): AddonProfile {
        const newAddon: AddonProfile = {
            ...addon,
            id: this.generateId()
        };
        this.data.addons.push(newAddon);
        this.save();
        return newAddon;
    }

    updateAddon(id: string, updates: Partial<AddonProfile>): void {
        const index = this.data.addons.findIndex(a => a.id === id);
        if (index !== -1) {
            this.data.addons[index] = { ...this.data.addons[index], ...updates };
            this.save();
        }
    }

    deleteAddon(id: string): void {
        this.data.addons = this.data.addons.filter(a => a.id !== id);
        this.save();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Active selections
    // ─────────────────────────────────────────────────────────────────────────

    getActiveEnvironmentId(): string | undefined {
        return this.data.activeEnvironmentId;
    }

    setActiveEnvironmentId(id: string | undefined): void {
        this.data.activeEnvironmentId = id;
        this.save();
    }

    getActiveAddonId(): string | undefined {
        return this.data.activeAddonId;
    }

    setActiveAddonId(id: string | undefined): void {
        this.data.activeAddonId = id;
        this.save();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Utilities
    // ─────────────────────────────────────────────────────────────────────────

    private generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substring(2);
    }
}
