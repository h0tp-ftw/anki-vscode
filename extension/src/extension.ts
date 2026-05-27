import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawn } from 'child_process';

import { WelcomeManager } from './welcome';
import { StorageManager, EnvironmentProfile, AddonProfile } from './storage';
import { EnvironmentsProvider, AddonsProvider, ActionsProvider, EnvironmentItem, AddonItem } from './providers/AnkiTreeProvider';

// ─────────────────────────────────────────────────────────────────────────────
// Path / filesystem helpers
// ─────────────────────────────────────────────────────────────────────────────

// Allowed characters for an addon folder name inside addons21.
// Rejects path separators and traversal so the symlink target can't escape addons21.
const ADDON_ID_RE = /^[A-Za-z0-9._-]+$/;
function isValidAddonId(id: string): boolean {
    return ADDON_ID_RE.test(id) && id !== '.' && id !== '..';
}

// True when `p` is a symlink (or, on Windows, a junction) that this extension
// manages — i.e. safe to delete. Real folders return false so we don't nuke them.
function isManagedLink(p: string): boolean {
    try {
        const st = fs.lstatSync(p);
        if (st.isSymbolicLink()) { return true; }
        if (process.platform === 'win32') {
            // Junctions don't always report as symlinks, but readlink succeeds on them.
            try { fs.readlinkSync(p); return true; } catch { return false; }
        }
        return false;
    } catch {
        return false;
    }
}

// Returns lstat without following symlinks, or undefined if the path doesn't exist.
// Used instead of existsSync so dangling symlinks are still detected.
function tryLstat(p: string): fs.Stats | undefined {
    try { return fs.lstatSync(p); } catch { return undefined; }
}

// Segment-aware containment check. Avoids the `startsWith` bug where
// "/a/addon" wrongly matches "/a/addon-2".
function isPathInsideOrEqual(child: string, parent: string): boolean {
    const rel = path.relative(parent, child);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

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
    const home = os.homedir();
    const base = process.platform === 'win32' ? (process.env.USERPROFILE || home) : home;
    const docs = path.join(base, 'Documents');
    // Fall back to the home dir if ~/Documents doesn't exist, so callers that use
    // this as a spawn cwd don't fail with ENOENT (common on Linux).
    return fs.existsSync(docs) ? docs : home;
}

async function runCommand(command: string, args: string[], cwd: string, timeoutMs?: number): Promise<{ success: boolean; output: string }> {
    return new Promise((resolve) => {
        log(`[Running Command] ${command} ${args.join(' ')} (cwd: ${cwd})`);
        
        let output = '';
        // No `shell: true`: args are passed as a real argv, so paths with spaces
        // work and untrusted input (repo URLs, package names) can't inject shell
        // commands. Safe here because every command is git/python/cmd or an
        // absolute .exe path — none are .cmd/.bat shims needing a shell.
        const proc = spawn(command, args, { cwd });

        let timeout: NodeJS.Timeout | undefined;
        let isTimedOut = false;
        if (timeoutMs) {
            timeout = setTimeout(() => {
                isTimedOut = true;
                log(`[Command Timeout] Command "${command} ${args.join(' ')}" timed out after ${timeoutMs}ms. Killing process...`);
                if (process.platform === 'win32' && proc.pid) {
                    log(`[Diagnostics] Timeout hit. Running tasklist before kill...`);
                    const preTasklist = spawn('tasklist', ['/FI', 'IMAGENAME eq python.exe']);
                    let preOutput = '';
                    preTasklist.stdout.on('data', (c) => { preOutput += c.toString(); });
                    preTasklist.on('close', () => {
                        log(`[Diagnostics] Active python processes BEFORE taskkill:\n${preOutput.trim()}`);
                        
                        log(`[Info] Spawning taskkill for PID ${proc.pid}...`);
                        const killer = spawn('taskkill', ['/F', '/T', '/PID', proc.pid!.toString()]);
                        let killerStderr = '';
                        killer.stderr.on('data', (chunk) => { killerStderr += chunk.toString(); });
                        killer.on('error', (err) => { log(`[Error] Failed to spawn taskkill: ${err.message}`); });
                        killer.on('close', (code) => {
                            if (code !== 0) {
                                log(`[Warning] taskkill exited with code ${code}. Stderr: ${killerStderr.trim()}`);
                            } else {
                                log(`[Info] taskkill successfully completed for PID ${proc.pid}`);
                            }
                            
                            // Check python processes again after kill
                            const postTasklist = spawn('tasklist', ['/FI', 'IMAGENAME eq python.exe']);
                            let postOutput = '';
                            postTasklist.stdout.on('data', (c) => { postOutput += c.toString(); });
                            postTasklist.on('close', () => {
                                log(`[Diagnostics] Active python processes AFTER taskkill:\n${postOutput.trim()}`);
                            });
                        });
                    });
                } else {
                    proc.kill();
                }
                resolve({ success: false, output: output + '\n[ERROR] Command timed out.' });
            }, timeoutMs);
        }

        proc.stdout.on('data', (data) => {
            output += data.toString();
            outputChannel.append(data.toString());
        });

        proc.stderr.on('data', (data) => {
            output += data.toString();
            outputChannel.append(data.toString());
        });

        proc.on('close', (code) => {
            if (timeout) { clearTimeout(timeout); }
            if (!isTimedOut) {
                log(`[Command Finished] Exit code: ${code}`);
                resolve({ success: code === 0, output });
            }
        });

        proc.on('error', (err) => {
            if (timeout) { clearTimeout(timeout); }
            if (!isTimedOut) {
                log(`[Command Error] ${err.message}`);
                resolve({ success: false, output: err.message });
            }
        });
    });
}

async function rmSyncWithRetry(dirPath: string, retries = 5, delayMs = 500): Promise<void> {
    for (let i = 0; i < retries; i++) {
        try {
            if (fs.existsSync(dirPath)) {
                fs.rmSync(dirPath, { recursive: true, force: true });
            }
            return;
        } catch (err) {
            if (i === retries - 1) {
                throw err;
            }
            log(`[Info] rmSync failed (attempt ${i + 1}/${retries}), retrying in ${delayMs}ms... Error: ${err}`);
            await new Promise((r) => setTimeout(r, delayMs));
        }
    }
}

async function cleanOrRenameVenvDir(dirPath: string): Promise<void> {
    if (!fs.existsSync(dirPath)) {
        return;
    }
    const tempPath = `${dirPath}-${Date.now()}-deleted`;
    try {
        // Try renaming it first to free up the original path immediately
        fs.renameSync(dirPath, tempPath);
        log(`[Info] Renamed partial venv to ${tempPath}`);
        // Now try to delete the temp path in the background/safely
        try {
            await rmSyncWithRetry(tempPath, 3, 200);
            log(`[Info] Cleaned up temporary directory ${tempPath}`);
        } catch (rmErr: any) {
            log(`[Warning] Could not immediately delete ${tempPath}: ${rmErr.message}. It will remain locked temporarily.`);
        }
    } catch (renameErr: any) {
        log(`[Warning] Rename failed: ${renameErr.message}. Falling back to direct deletion...`);
        // Fall back to direct cleanup
        await rmSyncWithRetry(dirPath, 5, 500);
    }
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

function checkVenvExists(venvPath: string): boolean {
    const pythonExe = process.platform === 'win32'
        ? path.join(venvPath, 'Scripts', 'python.exe')
        : path.join(venvPath, 'bin', 'python');
    return fs.existsSync(pythonExe);
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
    let createVenv = true;
    if (checkVenvExists(venvPath)) {
        const choice = await vscode.window.showQuickPick(
            ['Use existing virtual environment', 'Recreate / Overwrite'],
            {
                placeHolder: 'A virtual environment already exists at this location.',
                ignoreFocusOut: true
            }
        );
        if (!choice) { return; }
        if (choice === 'Use existing virtual environment') {
            createVenv = false;
        } else if (choice === 'Recreate / Overwrite') {
            log(`Cleaning up existing venv at ${venvPath} before recreation...`);
            await cleanOrRenameVenvDir(venvPath);
        }
    }

    let venvSuccess = true;
    if (createVenv) {
        log(`Creating venv at ${venvPath}...`);
        const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
        let venvResult = await runCommand(pythonCmd, ['-m', 'venv', venvPath], getDocumentsFolder(), 60000);

        if (!venvResult.success) {
            const fallback = await vscode.window.showWarningMessage(
                'Failed or timed out creating virtual environment. Attempt creation without pip (bypasses buggy ensurepip subprocess)?',
                'Yes',
                'No'
            );
            if (fallback === 'Yes') {
                // Clean up the partial venv left by the killed process to avoid
                // "Permission denied" errors on partially-written files (e.g. Scripts/python.exe)
                if (fs.existsSync(venvPath)) {
                    log(`Cleaning up partial venv at ${venvPath}...`);
                    await cleanOrRenameVenvDir(venvPath);
                }
                log('Attempting to create venv without pip...');
                venvResult = await runCommand(pythonCmd, ['-m', 'venv', '--without-pip', venvPath], getDocumentsFolder(), 30000);
            }
        }

        venvSuccess = venvResult.success;
    } else {
        log(`Using existing venv at ${venvPath}.`);
    }

    if (!venvSuccess) {
        vscode.window.showErrorMessage('Failed to create virtual environment.');
        StorageManager.getInstance().addEnvironment({
            name,
            venvPath,
            ankiBasePath,
            status: 'error'
        });
        return;
    }

    // Install aqt package if pip is available
    const pipPath = process.platform === 'win32'
        ? path.join(venvPath, 'Scripts', 'pip.exe')
        : path.join(venvPath, 'bin', 'pip');

    let status: 'ready' | 'needs-setup' | 'error' = 'needs-setup';

    if (fs.existsSync(pipPath)) {
        log('Installing aqt (Anki) package...');
        await runCommand(pipPath, ['install', '--upgrade', 'pip'], venvPath, 60000);
        const installResult = await runCommand(pipPath, ['install', 'aqt'], venvPath, 120000);
        status = installResult.success ? 'ready' : 'needs-setup';
    } else {
        log('⚠️ pip was not found in the virtual environment. Skipping automated package installation.');
        vscode.window.showWarningMessage('Virtual environment created, but pip is not installed. You will need to install pip and "aqt" manually.');
        status = 'needs-setup';
    }

    StorageManager.getInstance().addEnvironment({
        name,
        venvPath,
        ankiBasePath,
        status
    });

    log(`✅ Environment "${name}" created!`);
    vscode.window.showInformationMessage(`Environment "${name}" setup completed!`);
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

        // Refuse to clone over an existing file or a non-empty folder (git would
        // fail with a cryptic error otherwise).
        if (fs.existsSync(localPath)) {
            const st = fs.statSync(localPath);
            if (!st.isDirectory() || fs.readdirSync(localPath).length > 0) {
                vscode.window.showErrorMessage(`Cannot clone: "${localPath}" already exists and is not empty.`);
                return;
            }
        }

        // Clone
        log(`Cloning ${repoUrl} to ${localPath}...`);
        const cloneResult = await runCommand('git', ['clone', '--recursive', repoUrl, localPath], getDocumentsFolder());
        if (!cloneResult.success) {
            vscode.window.showErrorMessage('Failed to clone repository. Make sure Git is installed and the URL is correct — see the "Anki Development" output for details.');
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
        prompt: 'Choose a folder name for this addon in Anki\'s addons21 directory',
        placeHolder: 'e.g., my-addon or 1908235722',
        ignoreFocusOut: true,
        validateInput: (v) => isValidAddonId(v.trim())
            ? undefined
            : 'Use only letters, numbers, dots, dashes and underscores (no slashes or "..").'
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

    // Guard the addon ID before it goes into a filesystem path — an id like
    // "../../x" would make targetLink escape addons21 and the delete below
    // could destroy unrelated files.
    if (!isValidAddonId(addon.addonId)) {
        vscode.window.showErrorMessage(`Invalid addon folder name "${addon.addonId}". Edit the addon and use only letters, numbers, dots, dashes and underscores.`);
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

    // Remove anything already at the target. Only auto-delete links we manage;
    // if it's a real folder (e.g. a separately installed addon), confirm first.
    if (tryLstat(targetLink)) {
        if (!isManagedLink(targetLink)) {
            const choice = await vscode.window.showWarningMessage(
                `"${targetLink}" already exists and is a real folder, not a managed link. Overwrite and permanently delete its contents?`,
                { modal: true },
                'Overwrite'
            );
            if (choice !== 'Overwrite') { return; }
        }
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
    const isInCorrectWorkspace = !!currentWorkspace &&
        (isPathInsideOrEqual(addonPath, currentWorkspace) || isPathInsideOrEqual(currentWorkspace, addonPath));

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
    const pythonExe = process.platform === 'win32'
        ? path.join(env.venvPath, 'Scripts', 'python.exe')
        : path.join(env.venvPath, 'bin', 'python');

    const vscodePath = path.join(addonPath, '.vscode');
    const runAnkiPath = path.join(vscodePath, 'run_anki.py');

    if (!fs.existsSync(vscodePath)) {
        fs.mkdirSync(vscodePath, { recursive: true });
    }
    if (!fs.existsSync(runAnkiPath)) {
        fs.writeFileSync(runAnkiPath, 'import sys\nfrom aqt import run\nsys.exit(run())\n', 'utf-8');
    }

    const launchConfig: vscode.DebugConfiguration = {
        type: 'debugpy',
        name: 'Anki Debug',
        request: 'launch',
        program: runAnkiPath,
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

    const result = await runCommand('git', ['pull', '--recurse-submodules'], addon.localPath);
    if (result.success) {
        // Ensure any newly added submodules are initialized/checked out.
        await runCommand('git', ['submodule', 'update', '--init', '--recursive'], addon.localPath);
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
                program: '${workspaceFolder}/.vscode/run_anki.py',
                python: pythonExe,
                args: ['-b', env.ankiBasePath],
                cwd: '${workspaceFolder}',
                stopOnEntry: false
            }
        ]
    };

    // Create .vscode folder, run_anki.py, and launch.json in addon folder
    const vscodePath = path.join(addon.localPath, '.vscode');
    const launchPath = path.join(vscodePath, 'launch.json');
    const runAnkiPath = path.join(vscodePath, 'run_anki.py');

    if (!fs.existsSync(vscodePath)) {
        fs.mkdirSync(vscodePath, { recursive: true });
    }

    if (!fs.existsSync(runAnkiPath)) {
        fs.writeFileSync(runAnkiPath, 'import sys\nfrom aqt import run\nsys.exit(run())\n', 'utf-8');
    }

    // Don't clobber an existing debug config without asking.
    if (fs.existsSync(launchPath)) {
        const choice = await vscode.window.showWarningMessage(
            `launch.json already exists for ${addon.name}. Overwrite it?`,
            { modal: true },
            'Overwrite'
        );
        if (choice !== 'Overwrite') { return; }
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

    // `--` stops the package name being interpreted as a pip flag (e.g. "-r ...").
    const result = await runCommand(pipPath, ['install', '--', packageName], env.venvPath);

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
            ignoreFocusOut: true,
            validateInput: (v) => isValidAddonId(v.trim())
                ? undefined
                : 'Use only letters, numbers, dots, dashes and underscores (no slashes or "..").'
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
    // Use the real path the StorageManager writes to, rather than guessing — the
    // old guess broke on VSCodium, Insiders, portable installs and remote/WSL.
    const configPath = StorageManager.getInstance().getConfigPath();

    if (fs.existsSync(configPath)) {
        const doc = await vscode.workspace.openTextDocument(configPath);
        await vscode.window.showTextDocument(doc);
    } else {
        vscode.window.showWarningMessage('Config file not found. Create an environment or addon first.');
    }
}
