import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

import { WelcomeManager } from './welcome';
import { StorageManager, EnvironmentProfile, AddonProfile } from './storage';
import { EnvironmentsProvider, AddonsProvider, ActionsProvider, EnvironmentItem, AddonItem } from './providers/AnkiTreeProvider';

// Output channel for logging
let outputChannel: vscode.OutputChannel;

// Tree providers
let environmentsProvider: EnvironmentsProvider;
let addonsProvider: AddonsProvider;
let actionsProvider: ActionsProvider;

export function activate(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel('Anki Development');

    // Initialize storage
    StorageManager.initialize(context);

    // Check for welcome/changelog
    const welcomeManager = new WelcomeManager(context);
    welcomeManager.checkAndShowWelcome();

    // Initialize tree providers
    environmentsProvider = new EnvironmentsProvider();
    addonsProvider = new AddonsProvider();
    actionsProvider = new ActionsProvider();

    // Register tree views
    vscode.window.registerTreeDataProvider('anki-environments', environmentsProvider);
    vscode.window.registerTreeDataProvider('anki-addons', addonsProvider);
    vscode.window.registerTreeDataProvider('anki-actions', actionsProvider);

    // Register commands
    context.subscriptions.push(
        // Legacy setup wizard
        vscode.commands.registerCommand('anki.setup', runLegacySetup),

        // Environment commands
        vscode.commands.registerCommand('anki.addEnvironment', addEnvironment),
        vscode.commands.registerCommand('anki.deleteEnvironment', deleteEnvironment),

        // Addon commands
        vscode.commands.registerCommand('anki.addAddon', addAddon),
        vscode.commands.registerCommand('anki.deleteAddon', deleteAddon),
        vscode.commands.registerCommand('anki.initializeAddon', initializeAddon),

        // Quick actions
        vscode.commands.registerCommand('anki.runAnki', runAnki),
        vscode.commands.registerCommand('anki.installPackage', installPackage),
        vscode.commands.registerCommand('anki.openAddonFolder', openAddonFolder),
        vscode.commands.registerCommand('anki.gitSync', gitSync),
        vscode.commands.registerCommand('anki.generateLaunchConfig', generateLaunchConfig),
        vscode.commands.registerCommand('anki.refreshView', refreshViews),

        // Edit commands
        vscode.commands.registerCommand('anki.editEnvironment', editEnvironment),
        vscode.commands.registerCommand('anki.editAddon', editAddon),
        vscode.commands.registerCommand('anki.openConfig', openConfig)
    );

    log('Anki Development Suite activated!');
}

export function deactivate() {
    if (outputChannel) {
        outputChannel.dispose();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function log(message: string): void {
    outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
}

function getDocumentsFolder(): string {
    if (process.platform === 'win32') {
        return path.join(process.env.USERPROFILE || '', 'Documents');
    }
    return path.join(process.env.HOME || '', 'Documents');
}

async function runCommand(command: string, args: string[], cwd: string): Promise<{ success: boolean; output: string }> {
    return new Promise((resolve) => {
        let output = '';
        const proc = spawn(command, args, { cwd, shell: true });

        proc.stdout.on('data', (data) => {
            output += data.toString();
            outputChannel.append(data.toString());
        });

        proc.stderr.on('data', (data) => {
            output += data.toString();
            outputChannel.append(data.toString());
        });

        proc.on('close', (code) => {
            resolve({ success: code === 0, output });
        });

        proc.on('error', (err) => {
            resolve({ success: false, output: err.message });
        });
    });
}

function refreshViews(): void {
    environmentsProvider.refresh();
    addonsProvider.refresh();
}

function detectAnkiBasePaths(): string[] {
    const detected: string[] = [];

    const possiblePaths = process.platform === 'win32'
        ? [
            path.join(process.env.APPDATA || '', 'Anki2'),
            path.join(process.env.LOCALAPPDATA || '', 'Anki2')
        ]
        : process.platform === 'darwin'
            ? [path.join(process.env.HOME || '', 'Library', 'Application Support', 'Anki2')]
            : [
                path.join(process.env.HOME || '', '.local', 'share', 'Anki2'),
                path.join(process.env.HOME || '', '.var', 'app', 'net.ankiweb.Anki', 'data', 'Anki2')
            ];

    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            detected.push(p);
        }
    }

    return detected;
}

// ─────────────────────────────────────────────────────────────────────────────
// Environment Commands
// ─────────────────────────────────────────────────────────────────────────────

async function addEnvironment(): Promise<void> {
    outputChannel.show(true);
    log('--- Adding new environment ---');

    // Get name
    const name = await vscode.window.showInputBox({
        prompt: 'Environment name',
        placeHolder: 'e.g., Anki 24.11',
        ignoreFocusOut: true
    });
    if (!name) { return; }

    // Select venv location
    const defaultVenv = path.join(getDocumentsFolder(), 'anki-vscode', `venv-${name.toLowerCase().replace(/\s+/g, '-')}`);
    const venvUri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(defaultVenv),
        title: 'Select Virtual Environment Location'
    });
    if (!venvUri) { return; }
    const venvPath = venvUri.fsPath;

    // Select Anki base path with auto-detection
    const detectedAnkiPaths = detectAnkiBasePaths();
    let ankiBasePath: string;

    if (detectedAnkiPaths.length > 0) {
        // Show detected paths as options
        const ankiOptions: Array<{ label: string; description: string; value: string | 'custom' }> = [
            ...detectedAnkiPaths.map(p => ({
                label: `$(check) ${path.basename(path.dirname(p))}`,
                description: p,
                value: p
            })),
            { label: '$(folder) Choose custom location...', description: '', value: 'custom' }
        ];

        const ankiChoice = await vscode.window.showQuickPick(ankiOptions, {
            placeHolder: 'Select Anki data directory (auto-detected)',
            ignoreFocusOut: true
        });
        if (!ankiChoice) { return; }

        if (ankiChoice.value === 'custom') {
            const ankiBaseUri = await vscode.window.showOpenDialog({
                canSelectFolders: true,
                canSelectFiles: false,
                canSelectMany: false,
                openLabel: 'Select Anki Base Directory (Anki2)',
                title: 'Select Anki Data Directory'
            });
            if (!ankiBaseUri?.[0]) { return; }
            ankiBasePath = ankiBaseUri[0].fsPath;
        } else {
            ankiBasePath = ankiChoice.value;
        }
    } else {
        // No auto-detection, fall back to folder picker
        const defaultAnkiBase = path.join(getDocumentsFolder(), 'Anki2');
        const ankiBaseUri = await vscode.window.showOpenDialog({
            canSelectFolders: true,
            canSelectFiles: false,
            canSelectMany: false,
            defaultUri: vscode.Uri.file(defaultAnkiBase),
            openLabel: 'Select Anki Base Directory (Anki2)',
            title: 'Select Anki Data Directory'
        });
        ankiBasePath = ankiBaseUri?.[0]?.fsPath || defaultAnkiBase;
    }

    // Create venv
    log(`Creating venv at ${venvPath}...`);
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const venvResult = await runCommand(pythonCmd, ['-m', 'venv', venvPath], getDocumentsFolder());

    if (!venvResult.success) {
        vscode.window.showErrorMessage('Failed to create virtual environment.');
        StorageManager.getInstance().addEnvironment({
            name,
            venvPath,
            ankiBasePath,
            status: 'error'
        });
        return;
    }

    // Install aqt package
    log('Installing aqt (Anki) package...');
    const pipPath = process.platform === 'win32'
        ? path.join(venvPath, 'Scripts', 'pip.exe')
        : path.join(venvPath, 'bin', 'pip');

    await runCommand(pipPath, ['install', '--upgrade', 'pip'], venvPath);
    const installResult = await runCommand(pipPath, ['install', 'aqt'], venvPath);

    const status = installResult.success ? 'ready' : 'needs-setup';

    StorageManager.getInstance().addEnvironment({
        name,
        venvPath,
        ankiBasePath,
        status
    });

    log(`✅ Environment "${name}" created!`);
    vscode.window.showInformationMessage(`Environment "${name}" created successfully!`);
}

async function deleteEnvironment(item: EnvironmentItem): Promise<void> {
    const confirm = await vscode.window.showWarningMessage(
        `Delete environment "${item.profile.name}"? This will NOT delete the venv files.`,
        { modal: true },
        'Delete'
    );
    if (confirm === 'Delete') {
        StorageManager.getInstance().deleteEnvironment(item.profile.id);
        log(`Deleted environment: ${item.profile.name}`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Addon Commands
// ─────────────────────────────────────────────────────────────────────────────

async function addAddon(): Promise<void> {
    outputChannel.show(true);
    log('--- Adding new addon ---');

    // Choose source
    const sourceChoice = await vscode.window.showQuickPick([
        { label: '$(github) Clone from GitHub', value: 'github' },
        { label: '$(folder) Use Existing Folder', value: 'existing' }
    ], {
        placeHolder: 'How do you want to add the addon?',
        ignoreFocusOut: true
    });
    if (!sourceChoice) { return; }

    let localPath: string;
    let repoUrl: string | undefined;
    let name: string;

    if (sourceChoice.value === 'github') {
        // Clone from GitHub
        repoUrl = await vscode.window.showInputBox({
            prompt: 'GitHub repository URL',
            placeHolder: 'https://github.com/user/addon.git',
            ignoreFocusOut: true
        });
        if (!repoUrl) { return; }

        name = path.basename(repoUrl, '.git');

        const defaultCloneDir = path.join(getDocumentsFolder(), name);
        const cloneUri = await vscode.window.showOpenDialog({
            canSelectFolders: true,
            canSelectFiles: false,
            canSelectMany: false,
            openLabel: 'Select Clone Location',
            defaultUri: vscode.Uri.file(getDocumentsFolder())
        });
        localPath = cloneUri?.[0]?.fsPath ? path.join(cloneUri[0].fsPath, name) : defaultCloneDir;

        // Clone
        log(`Cloning ${repoUrl} to ${localPath}...`);
        const cloneResult = await runCommand('git', ['clone', repoUrl, localPath], getDocumentsFolder());
        if (!cloneResult.success) {
            vscode.window.showErrorMessage('Failed to clone repository.');
            return;
        }
    } else {
        // Use existing folder
        const folderUri = await vscode.window.showOpenDialog({
            canSelectFolders: true,
            canSelectFiles: false,
            canSelectMany: false,
            openLabel: 'Select Addon Folder'
        });
        if (!folderUri?.[0]) { return; }
        localPath = folderUri[0].fsPath;
        name = path.basename(localPath);
    }

    // Get source subfolder using folder browser
    // NOTE: Some repos have the actual addon code in a subfolder (e.g., src/Ankimon)
    // This is the folder that contains __init__.py and will be symlinked to addons21
    const subfolderChoice = await vscode.window.showQuickPick([
        { label: '$(folder) Browse to select subfolder', description: 'For repos where addon code is in a subfolder', value: 'browse' },
        { label: '$(root-folder) Use root (no subfolder)', description: 'If __init__.py is at the root of the repo', value: 'root' }
    ], {
        placeHolder: 'Which folder contains the addon code (__init__.py)?',
        ignoreFocusOut: true
    });
    if (!subfolderChoice) { return; }

    let srcSubfolder = '';
    if (subfolderChoice.value === 'browse') {
        const subfolderUri = await vscode.window.showOpenDialog({
            canSelectFolders: true,
            canSelectFiles: false,
            canSelectMany: false,
            defaultUri: vscode.Uri.file(localPath),
            openLabel: 'Select Addon Source Folder',
            title: 'Select the folder containing __init__.py'
        });
        if (subfolderUri?.[0]) {
            const relativePath = path.relative(localPath, subfolderUri[0].fsPath);
            srcSubfolder = relativePath === '.' ? '' : relativePath;
        }
    }

    // Get addon ID (folder name in addons21)
    const addonId = await vscode.window.showInputBox({
        prompt: 'Choose a folder name for this addon in Anki\'s addons21 directory (can be anything you want)',
        placeHolder: 'e.g., my-addon or 1908235722',
        ignoreFocusOut: true
    });
    if (!addonId) { return; }

    // Link to environment (optional)
    const environments = StorageManager.getInstance().getEnvironments();
    let linkedEnvId: string | undefined;
    if (environments.length > 0) {
        const envChoice = await vscode.window.showQuickPick(
            [
                { label: 'None', value: undefined },
                ...environments.map(e => ({ label: e.name, value: e.id }))
            ],
            { placeHolder: 'Link to an environment?', ignoreFocusOut: true }
        );
        linkedEnvId = envChoice?.value;
    }

    StorageManager.getInstance().addAddon({
        name,
        repoUrl,
        localPath,
        srcSubfolder,
        addonId,
        linkedEnvId,
        isInitialized: false
    });

    log(`✅ Addon "${name}" added!`);
    vscode.window.showInformationMessage(`Addon "${name}" added! Click "Initialize" to create symlink.`);
}

async function deleteAddon(item: AddonItem): Promise<void> {
    const confirm = await vscode.window.showWarningMessage(
        `Remove addon "${item.profile.name}" from the list? This will NOT delete the files.`,
        { modal: true },
        'Remove'
    );
    if (confirm === 'Remove') {
        StorageManager.getInstance().deleteAddon(item.profile.id);
        log(`Removed addon: ${item.profile.name}`);
    }
}

async function initializeAddon(item: AddonItem): Promise<void> {
    const addon = item.profile;
    const storage = StorageManager.getInstance();

    // Check if linked to an environment
    if (!addon.linkedEnvId) {
        const environments = storage.getEnvironments();
        if (environments.length === 0) {
            vscode.window.showErrorMessage('No environments available. Create one first.');
            return;
        }
        const envChoice = await vscode.window.showQuickPick(
            environments.map(e => ({ label: e.name, value: e.id })),
            { placeHolder: 'Select environment to link to', ignoreFocusOut: true }
        );
        if (!envChoice) { return; }
        storage.updateAddon(addon.id, { linkedEnvId: envChoice.value });
        addon.linkedEnvId = envChoice.value;
    }

    const env = storage.getEnvironment(addon.linkedEnvId);
    if (!env) {
        vscode.window.showErrorMessage('Linked environment not found.');
        return;
    }

    // Create symlink
    const srcDir = addon.srcSubfolder
        ? path.join(addon.localPath, addon.srcSubfolder)
        : addon.localPath;

    const addonsDir = path.join(env.ankiBasePath, 'addons21');
    const targetLink = path.join(addonsDir, addon.addonId);

    log(`Creating symlink: ${targetLink} -> ${srcDir}`);

    // Ensure addons21 exists
    if (!fs.existsSync(addonsDir)) {
        fs.mkdirSync(addonsDir, { recursive: true });
    }

    // Remove existing
    if (fs.existsSync(targetLink)) {
        fs.rmSync(targetLink, { recursive: true, force: true });
    }

    try {
        if (process.platform === 'win32') {
            // Use junction on Windows (doesn't require admin)
            await runCommand('cmd', ['/c', 'mklink', '/J', targetLink, srcDir], addonsDir);
        } else {
            fs.symlinkSync(srcDir, targetLink, 'dir');
        }

        storage.updateAddon(addon.id, { isInitialized: true });
        log(`✅ Symlink created for "${addon.name}"`);
        vscode.window.showInformationMessage(`Addon "${addon.name}" initialized!`);
    } catch (err) {
        log(`❌ Failed to create symlink: ${err}`);
        vscode.window.showErrorMessage(`Failed to create symlink. ${err}`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Quick Actions
// ─────────────────────────────────────────────────────────────────────────────

async function runAnki(): Promise<void> {
    const storage = StorageManager.getInstance();
    const addons = storage.getAddons().filter(a => a.isInitialized && a.linkedEnvId);

    if (addons.length === 0) {
        vscode.window.showWarningMessage('No initialized addons. Add and initialize an addon first.');
        return;
    }

    // Pick addon if multiple
    let addon: AddonProfile;
    if (addons.length === 1) {
        addon = addons[0];
    } else {
        const choice = await vscode.window.showQuickPick(
            addons.map(a => ({ label: a.name, value: a })),
            { placeHolder: 'Select addon to run' }
        );
        if (!choice) { return; }
        addon = choice.value;
    }

    const env = storage.getEnvironment(addon.linkedEnvId!);
    if (!env) {
        vscode.window.showErrorMessage('Environment not found.');
        return;
    }

    // Check if we're already in the addon's workspace
    const currentWorkspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const addonPath = addon.localPath;
    const isInCorrectWorkspace = currentWorkspace &&
        (currentWorkspace === addonPath || currentWorkspace.startsWith(addonPath) || addonPath.startsWith(currentWorkspace));

    if (!isInCorrectWorkspace) {
        // Ask before switching workspaces
        const switchChoice = await vscode.window.showWarningMessage(
            `The addon "${addon.name}" is not in the current workspace. Switch to it?`,
            { modal: true },
            'Switch & Run Anki',
            'Run Without Switching',
            'Cancel'
        );

        if (switchChoice === 'Cancel' || !switchChoice) {
            return;
        }

        if (switchChoice === 'Switch & Run Anki') {
            // Switch workspace - note: extension will reload, user needs to run again
            vscode.window.showInformationMessage(
                'Switching workspace... Press "Run Anki" again after the workspace loads.',
                { modal: false }
            );
            const addonUri = vscode.Uri.file(addonPath);
            await vscode.commands.executeCommand('vscode.openFolder', addonUri, { forceNewWindow: false });
            return; // Extension will reload, exit here
        }
        // If "Run Without Switching", continue to start debug in current workspace
    }

    // Build launch config on the fly
    const ankiExe = process.platform === 'win32'
        ? path.join(env.venvPath, 'Scripts', 'anki.exe')
        : path.join(env.venvPath, 'bin', 'anki');

    const pythonExe = process.platform === 'win32'
        ? path.join(env.venvPath, 'Scripts', 'python.exe')
        : path.join(env.venvPath, 'bin', 'python');

    const launchConfig: vscode.DebugConfiguration = {
        type: 'debugpy',
        name: 'Anki Debug',
        request: 'launch',
        program: ankiExe,
        python: pythonExe,
        args: ['-b', env.ankiBasePath],
        cwd: addonPath,
        stopOnEntry: false
    };

    await vscode.debug.startDebugging(undefined, launchConfig);
    log(`Started Anki with addon: ${addon.name}`);
}

async function openAddonFolder(): Promise<void> {
    const storage = StorageManager.getInstance();
    const addons = storage.getAddons();

    if (addons.length === 0) {
        vscode.window.showWarningMessage('No addons configured.');
        return;
    }

    let addon: AddonProfile;
    if (addons.length === 1) {
        addon = addons[0];
    } else {
        const choice = await vscode.window.showQuickPick(
            addons.map(a => ({ label: a.name, value: a })),
            { placeHolder: 'Select addon to open' }
        );
        if (!choice) { return; }
        addon = choice.value;
    }

    const folderUri = vscode.Uri.file(addon.localPath);
    await vscode.commands.executeCommand('revealFileInOS', folderUri);
    log(`Opened folder: ${addon.localPath}`);
}

async function gitSync(): Promise<void> {
    const storage = StorageManager.getInstance();
    const addons = storage.getAddons().filter(a => a.repoUrl);

    if (addons.length === 0) {
        vscode.window.showWarningMessage('No addons with Git repos configured.');
        return;
    }

    let addon: AddonProfile;
    if (addons.length === 1) {
        addon = addons[0];
    } else {
        const choice = await vscode.window.showQuickPick(
            addons.map(a => ({ label: a.name, description: a.repoUrl, value: a })),
            { placeHolder: 'Select addon to sync' }
        );
        if (!choice) { return; }
        addon = choice.value;
    }

    outputChannel.show(true);
    log(`Syncing ${addon.name}...`);

    const result = await runCommand('git', ['pull'], addon.localPath);
    if (result.success) {
        vscode.window.showInformationMessage(`Synced ${addon.name}`);
    } else {
        vscode.window.showErrorMessage(`Failed to sync ${addon.name}`);
    }
}

async function generateLaunchConfig(): Promise<void> {
    const storage = StorageManager.getInstance();
    const addons = storage.getAddons().filter(a => a.isInitialized && a.linkedEnvId);

    if (addons.length === 0) {
        vscode.window.showWarningMessage('No initialized addons. Initialize an addon first.');
        return;
    }

    let addon: AddonProfile;
    if (addons.length === 1) {
        addon = addons[0];
    } else {
        const choice = await vscode.window.showQuickPick(
            addons.map(a => ({ label: a.name, value: a })),
            { placeHolder: 'Select addon to generate launch.json for' }
        );
        if (!choice) { return; }
        addon = choice.value;
    }

    const env = storage.getEnvironment(addon.linkedEnvId!);
    if (!env) {
        vscode.window.showErrorMessage('Linked environment not found.');
        return;
    }

    const ankiExe = process.platform === 'win32'
        ? path.join(env.venvPath, 'Scripts', 'anki.exe')
        : path.join(env.venvPath, 'bin', 'anki');

    const pythonExe = process.platform === 'win32'
        ? path.join(env.venvPath, 'Scripts', 'python.exe')
        : path.join(env.venvPath, 'bin', 'python');

    const launchJson = {
        version: '0.2.0',
        configurations: [
            {
                type: 'debugpy',
                name: 'Anki Debug',
                request: 'launch',
                program: ankiExe,
                python: pythonExe,
                args: ['-b', env.ankiBasePath],
                cwd: '${workspaceFolder}',
                stopOnEntry: false
            }
        ]
    };

    // Create .vscode folder and launch.json in addon folder
    const vscodePath = path.join(addon.localPath, '.vscode');
    const launchPath = path.join(vscodePath, 'launch.json');

    if (!fs.existsSync(vscodePath)) {
        fs.mkdirSync(vscodePath, { recursive: true });
    }

    fs.writeFileSync(launchPath, JSON.stringify(launchJson, null, 4), 'utf-8');

    log(`Generated launch.json at ${launchPath}`);
    vscode.window.showInformationMessage(`Generated launch.json for ${addon.name}`);

    // Open the file
    const doc = await vscode.workspace.openTextDocument(launchPath);
    await vscode.window.showTextDocument(doc);
}

async function installPackage(): Promise<void> {
    const storage = StorageManager.getInstance();
    const environments = storage.getEnvironments().filter(e => e.status === 'ready');

    if (environments.length === 0) {
        vscode.window.showWarningMessage('No ready environments. Create one first.');
        return;
    }

    // Pick environment
    let env: EnvironmentProfile;
    if (environments.length === 1) {
        env = environments[0];
    } else {
        const choice = await vscode.window.showQuickPick(
            environments.map(e => ({ label: e.name, value: e })),
            { placeHolder: 'Select environment to install into' }
        );
        if (!choice) { return; }
        env = choice.value;
    }

    const packageName = await vscode.window.showInputBox({
        prompt: 'Package name to install',
        placeHolder: 'e.g., requests',
        ignoreFocusOut: true
    });
    if (!packageName) { return; }

    outputChannel.show(true);
    log(`Installing ${packageName} into ${env.name}...`);

    const pipPath = process.platform === 'win32'
        ? path.join(env.venvPath, 'Scripts', 'pip.exe')
        : path.join(env.venvPath, 'bin', 'pip');

    const result = await runCommand(pipPath, ['install', packageName], env.venvPath);

    if (result.success) {
        vscode.window.showInformationMessage(`Installed ${packageName}`);
    } else {
        vscode.window.showErrorMessage(`Failed to install ${packageName}`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy Setup Wizard
// ─────────────────────────────────────────────────────────────────────────────

async function runLegacySetup(): Promise<void> {
    vscode.window.showInformationMessage('Use the Anki sidebar panel for the new setup experience!');
}

// ─────────────────────────────────────────────────────────────────────────────
// Edit Commands
// ─────────────────────────────────────────────────────────────────────────────

async function editEnvironment(item: EnvironmentItem): Promise<void> {
    const env = item.profile;
    const storage = StorageManager.getInstance();

    // Show current values and let user edit each field
    const fieldChoice = await vscode.window.showQuickPick([
        { label: '📝 Name', description: env.name, value: 'name' },
        { label: '📁 Venv Path', description: env.venvPath, value: 'venvPath' },
        { label: '🗂️ Anki Base Path', description: env.ankiBasePath, value: 'ankiBasePath' },
        { label: '$(json) View Raw JSON', description: 'Open config file', value: 'openConfig' }
    ], {
        placeHolder: `Edit environment: ${env.name}`,
        ignoreFocusOut: true
    });
    if (!fieldChoice) { return; }

    if (fieldChoice.value === 'openConfig') {
        await openConfig();
        return;
    }

    if (fieldChoice.value === 'name') {
        const newName = await vscode.window.showInputBox({
            prompt: 'New environment name',
            value: env.name,
            ignoreFocusOut: true
        });
        if (newName && newName !== env.name) {
            storage.updateEnvironment(env.id, { name: newName });
            log(`Updated environment name to: ${newName}`);
        }
    } else if (fieldChoice.value === 'venvPath') {
        const newUri = await vscode.window.showOpenDialog({
            canSelectFolders: true,
            canSelectFiles: false,
            canSelectMany: false,
            defaultUri: vscode.Uri.file(env.venvPath),
            openLabel: 'Select Venv Folder'
        });
        if (newUri?.[0]) {
            storage.updateEnvironment(env.id, { venvPath: newUri[0].fsPath });
            log(`Updated venv path to: ${newUri[0].fsPath}`);
        }
    } else if (fieldChoice.value === 'ankiBasePath') {
        const newUri = await vscode.window.showOpenDialog({
            canSelectFolders: true,
            canSelectFiles: false,
            canSelectMany: false,
            defaultUri: vscode.Uri.file(env.ankiBasePath),
            openLabel: 'Select Anki Base Directory'
        });
        if (newUri?.[0]) {
            storage.updateEnvironment(env.id, { ankiBasePath: newUri[0].fsPath });
            log(`Updated Anki base path to: ${newUri[0].fsPath}`);
        }
    }

    vscode.window.showInformationMessage('Environment updated!');
}

async function editAddon(item: AddonItem): Promise<void> {
    const addon = item.profile;
    const storage = StorageManager.getInstance();

    const fieldChoice = await vscode.window.showQuickPick([
        { label: '📝 Name', description: addon.name, value: 'name' },
        { label: '📁 Local Path', description: addon.localPath, value: 'localPath' },
        { label: '📂 Source Subfolder', description: addon.srcSubfolder || '(root)', value: 'srcSubfolder' },
        { label: '🔢 Addon ID', description: addon.addonId, value: 'addonId' },
        { label: '🔗 Linked Environment', description: addon.linkedEnvId ? storage.getEnvironment(addon.linkedEnvId)?.name : 'None', value: 'linkedEnvId' },
        { label: '$(json) View Raw JSON', description: 'Open config file', value: 'openConfig' }
    ], {
        placeHolder: `Edit addon: ${addon.name}`,
        ignoreFocusOut: true
    });
    if (!fieldChoice) { return; }

    if (fieldChoice.value === 'openConfig') {
        await openConfig();
        return;
    }

    if (fieldChoice.value === 'name') {
        const newName = await vscode.window.showInputBox({
            prompt: 'New addon name',
            value: addon.name,
            ignoreFocusOut: true
        });
        if (newName && newName !== addon.name) {
            storage.updateAddon(addon.id, { name: newName });
            log(`Updated addon name to: ${newName}`);
        }
    } else if (fieldChoice.value === 'localPath') {
        const newUri = await vscode.window.showOpenDialog({
            canSelectFolders: true,
            canSelectFiles: false,
            canSelectMany: false,
            defaultUri: vscode.Uri.file(addon.localPath),
            openLabel: 'Select Addon Root Folder'
        });
        if (newUri?.[0]) {
            storage.updateAddon(addon.id, { localPath: newUri[0].fsPath, isInitialized: false });
            log(`Updated local path to: ${newUri[0].fsPath}`);
        }
    } else if (fieldChoice.value === 'srcSubfolder') {
        // Browse inside the addon folder for subfolder
        const baseUri = vscode.Uri.file(addon.localPath);
        const selectedUri = await vscode.window.showOpenDialog({
            canSelectFolders: true,
            canSelectFiles: false,
            canSelectMany: false,
            defaultUri: baseUri,
            openLabel: 'Select Addon Source Folder',
            title: 'Select the folder containing __init__.py (or leave as root)'
        });
        if (selectedUri?.[0]) {
            const selectedPath = selectedUri[0].fsPath;
            // Calculate relative path from addon root
            const relativePath = path.relative(addon.localPath, selectedPath);
            storage.updateAddon(addon.id, { srcSubfolder: relativePath === '.' ? '' : relativePath, isInitialized: false });
            log(`Updated source subfolder to: ${relativePath || '(root)'}`);
        }
    } else if (fieldChoice.value === 'addonId') {
        const newId = await vscode.window.showInputBox({
            prompt: 'Addon folder name in addons21',
            value: addon.addonId,
            ignoreFocusOut: true
        });
        if (newId && newId !== addon.addonId) {
            storage.updateAddon(addon.id, { addonId: newId, isInitialized: false });
            log(`Updated addon ID to: ${newId}`);
        }
    } else if (fieldChoice.value === 'linkedEnvId') {
        const environments = storage.getEnvironments();
        const envChoice = await vscode.window.showQuickPick(
            [
                { label: 'None', value: undefined },
                ...environments.map(e => ({ label: e.name, value: e.id }))
            ],
            { placeHolder: 'Link to an environment', ignoreFocusOut: true }
        );
        if (envChoice !== undefined) {
            storage.updateAddon(addon.id, { linkedEnvId: envChoice.value, isInitialized: false });
            log(`Linked addon to environment: ${envChoice.label}`);
        }
    }

    vscode.window.showInformationMessage('Addon updated!');
}

async function openConfig(): Promise<void> {
    const storage = StorageManager.getInstance();
    // Get config path from storage manager
    const configPath = path.join(
        vscode.extensions.getExtension('h0tp-ftw.anki-vscode-setup')?.extensionUri.fsPath || '',
        '..',
        'globalStorage',
        'h0tp-ftw.anki-vscode-setup',
        'anki-dev-config.json'
    );

    // Try to find actual config path
    const globalStoragePath = path.join(process.env.APPDATA || process.env.HOME || '',
        process.platform === 'win32' ? 'Code/User/globalStorage/h0tp-ftw.anki-vscode-setup' : '.config/Code/User/globalStorage/h0tp-ftw.anki-vscode-setup');
    const actualConfigPath = path.join(globalStoragePath, 'anki-dev-config.json');

    if (fs.existsSync(actualConfigPath)) {
        const doc = await vscode.workspace.openTextDocument(actualConfigPath);
        await vscode.window.showTextDocument(doc);
    } else {
        vscode.window.showWarningMessage('Config file not found. Create an environment or addon first.');
    }
}
