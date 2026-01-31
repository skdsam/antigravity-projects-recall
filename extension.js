const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const {
    exec
} = require('child_process');
const https = require('https');
const {
    promisify
} = require('util');

const execAsync = promisify(exec);

function activate(context) {
    const storagePath = path.join(process.env.USERPROFILE, '.project-tracker', 'tracked_projects.json');

    function getProjects() {
        if (!fs.existsSync(storagePath)) {
            return [];
        }
        try {
            const content = fs.readFileSync(storagePath, 'utf8');
            if (!content.trim()) return [];
            const projects = JSON.parse(content);
            if (!Array.isArray(projects)) return [];
            return projects;
        } catch (e) {
            console.error('Error parsing projects storage:', e);
            return null;
        }
    }

    let cachedSession = null;
    async function getGitHubSession(silent = true) {
        if (cachedSession && silent) return cachedSession;
        try {
            const session = await vscode.authentication.getSession('github', ['repo', 'user'], {
                createIfNone: !silent
            });
            cachedSession = session;
            return session;
        } catch (e) {
            console.error('Project Tracker: GitHub session error', e);
            return null;
        }
    }

    // Cache for git behind status to avoid excessive fetching
    const gitStatusCache = new Map();
    const STATUS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

    async function fetchGitHubRepos() {
        const session = await getGitHubSession();
        if (!session) return [];

        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.github.com',
                path: '/user/repos?sort=updated&per_page=50',
                method: 'GET',
                headers: {
                    'Authorization': `token ${session.accessToken}`,
                    'User-Agent': 'vscode-project-tracker'
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        const repos = JSON.parse(data);
                        if (Array.isArray(repos)) {
                            resolve(repos.map(r => ({
                                name: r.name,
                                fullName: r.full_name,
                                url: r.clone_url,
                                description: r.description,
                                private: r.private
                            })));
                        } else {
                            resolve([]);
                        }
                    } catch (e) {
                        resolve([]);
                    }
                });
            });

            req.on('error', (e) => resolve([]));
            req.end();
        });
    }

    function saveProjects(projects) {
        if (!fs.existsSync(path.dirname(storagePath))) {
            fs.mkdirSync(path.dirname(storagePath), {
                recursive: true
            });
        }
        fs.writeFileSync(storagePath, JSON.stringify(projects, null, 2));
    }

    function getRelativeTimeString(date) {
        const delta = Math.round((new Date() - new Date(date)) / 1000);
        const minute = 60;
        const hour = minute * 60;
        const day = hour * 24;

        if (delta < 5) return 'just now';
        if (delta < minute) return `${delta}s`;
        if (delta < hour) return `${Math.floor(delta / minute)}m`;
        if (delta < day) return `${Math.floor(delta / hour)}h`;
        return `${Math.floor(delta / day)}d`;
    }

    async function checkGitStatus(projectPath) {
        try {
            // Check for local changes
            // Fetch in background to update remote tracking branches
            const cacheKey = projectPath;
            const cached = gitStatusCache.get(cacheKey);
            const now = Date.now();

            if (!cached || (now - cached.timestamp >= STATUS_CACHE_TTL)) {
                try {
                    await execAsync('git fetch', {
                        cwd: projectPath,
                        timeout: 15000 // Increased timeout for slower connections
                    });
                } catch (e) {
                    console.error(`Project Tracker: Fetch failed for ${projectPath}`, e.message);
                }
            }

            // use git status -sb which is much faster and provides sync info
            const {
                stdout: statusStdout
            } = await execAsync('git status -sb --porcelain', {
                cwd: projectPath,
                timeout: 3000
            });

            const lines = statusStdout.trim().split('\n');
            const branchLine = lines[0]; // e.g. "## main...origin/main [behind 1]"
            const fileLines = lines.slice(1).filter(l => l.trim().length > 0);

            let isBehind = false;
            let behindCount = 0;

            if (branchLine.includes('behind')) {
                const match = branchLine.match(/behind (\d+)/);
                if (match) {
                    behindCount = parseInt(match[1]);
                    isBehind = true;
                }
            }

            // Update cache after actual check
            gitStatusCache.set(cacheKey, {
                isBehind,
                behindCount,
                timestamp: now
            });

            return {
                isDirty: fileLines.length > 0,
                count: fileLines.length,
                isBehind,
                behindCount
            };
        } catch (e) {
            return {
                isDirty: false,
                count: 0,
                isBehind: false,
                behindCount: 0
            };
        }
    }

    async function getGitActivity(projectPath) {
        try {
            // Get commits per day for the last 7 days
            // Format: count|date
            const {
                stdout
            } = await execAsync('git log --since="7 days ago" --format="%ad" --date=short', {
                cwd: projectPath,
                timeout: 3000
            });

            if (!stdout.trim()) return "";

            const commits = stdout.trim().split('\n');
            const dayCounts = {};
            const today = new Date();

            for (let i = 0; i < 7; i++) {
                const date = new Date(today);
                date.setDate(today.getDate() - i);
                const dateStr = date.toISOString().split('T')[0];
                dayCounts[dateStr] = 0;
            }

            commits.forEach(date => {
                if (dayCounts[date] !== undefined) {
                    dayCounts[date]++;
                }
            });

            const blocks = [' ', ' ', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
            const sparkline = Object.values(dayCounts).reverse().map(count => {
                const scale = Math.min(count, 8);
                return blocks[scale];
            }).join('');

            return sparkline;
        } catch (e) {
            return "";
        }
    }

    async function getTopContributors(projectPath) {
        try {
            const {
                stdout
            } = await execAsync('git shortlog -sn --all --no-merges -n 3', {
                cwd: projectPath,
                timeout: 3000
            });
            return stdout.trim().split('\n').map(line => line.trim());
        } catch (e) {
            return [];
        }
    }

    async function getProjectMetadata(projectPath) {
        if (!fs.existsSync(projectPath)) return null;

        const metadata = {
            branch: null,
            tech: [],
            files: [],
            isDirty: false,
            gitDiffCount: 0,
            isBehind: false,
            behindCount: 0,
            sparkline: "",
            contributors: []
        };

        try {
            const gitDir = path.join(projectPath, '.git');
            if (fs.existsSync(gitDir)) {
                const gitStatus = await checkGitStatus(projectPath);
                metadata.isDirty = gitStatus.isDirty;
                metadata.gitDiffCount = gitStatus.count;
                metadata.isBehind = gitStatus.isBehind;
                metadata.behindCount = gitStatus.behindCount;
                metadata.sparkline = await getGitActivity(projectPath);
                metadata.contributors = await getTopContributors(projectPath);

                const gitHeadPath = path.join(gitDir, 'HEAD');
                if (fs.existsSync(gitHeadPath)) {
                    const headContent = fs.readFileSync(gitHeadPath, 'utf8').trim();
                    if (headContent.startsWith('ref: refs/heads/')) {
                        metadata.branch = headContent.replace('ref: refs/heads/', '');
                    } else if (headContent.length === 40) {
                        metadata.branch = headContent.substring(0, 7);
                    }
                }
            }

            const dirFiles = fs.readdirSync(projectPath);
            const keyFiles = ['package.json', 'README.md', 'requirements.txt', 'index.html', 'main.py', 'extension.js', '.gitignore'];
            metadata.files = dirFiles.filter(f => keyFiles.includes(f));

            if (dirFiles.includes('package.json')) metadata.tech.push('Node.js');
            if (dirFiles.includes('requirements.txt') || dirFiles.some(f => f.endsWith('.py'))) metadata.tech.push('Python');
            if (dirFiles.includes('index.html')) metadata.tech.push('Web');
            if (dirFiles.includes('Cargo.toml')) metadata.tech.push('Rust');
            if (dirFiles.includes('go.mod')) metadata.tech.push('Go');
            if (dirFiles.includes('composer.json')) metadata.tech.push('PHP');

        } catch (e) {
            console.error('Error reading metadata for', projectPath, e);
        }

        return metadata;
    }

    class ProjectItem extends vscode.TreeItem {
        constructor(label, collapsibleState, projectPath, type = 'project') {
            super(label, collapsibleState);
            this.projectPath = projectPath;
            this.resourceUri = projectPath ? vscode.Uri.file(projectPath) : undefined;
            this.type = type;
        }
    }

    class ProjectDecorationProvider {
        constructor() {
            this._onDidChangeFileDecorations = new vscode.EventEmitter();
            this.onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;
        }

        refresh() {
            this._onDidChangeFileDecorations.fire(undefined);
        }

        provideFileDecoration(uri) {
            const projects = getProjects();
            if (!projects) return undefined;

            const project = projects.find(p => p.path.toLowerCase() === uri.fsPath.toLowerCase());
            if (!project) return undefined;

            const cache = gitStatusCache.get(project.path);
            if (cache && cache.isBehind) {
                return {
                    badge: `↓${cache.behindCount > 0 ? cache.behindCount : ''}`,
                    tooltip: `Behind remote by ${cache.behindCount} commit(s)`,
                    color: new vscode.ThemeColor('errorForeground'),
                    propagate: false
                };
            }
            return undefined;
        }
    }

    class ProjectDataProvider {
        constructor() {
            this._onDidChangeTreeData = new vscode.EventEmitter();
            this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        }

        refresh() {
            this._onDidChangeTreeData.fire();
            projectDecorationProvider.refresh();
        }

        getTreeItem(element) {
            return element;
        }

        async getChildren(element) {
            if (!element) {
                let projects = getProjects();
                if (!projects) return [];

                projects.sort((a, b) => {
                    if (a.pinned && !b.pinned) return -1;
                    if (!a.pinned && b.pinned) return 1;
                    return new Date(b.lastAccessed) - new Date(a.lastAccessed);
                });

                const items = [];

                try {
                    const session = await getGitHubSession(true);
                    if (session) {
                        const githubSection = new ProjectItem('Available on GitHub', vscode.TreeItemCollapsibleState.Collapsed, null, 'section');
                        githubSection.iconPath = new vscode.ThemeIcon('github');
                        githubSection.contextValue = 'githubSection';
                        items.push(githubSection);
                    } else {
                        const signInItem = new ProjectItem('Sign in to GitHub...', vscode.TreeItemCollapsibleState.None, null, 'auth');
                        signInItem.iconPath = new vscode.ThemeIcon('github');
                        signInItem.command = {
                            command: 'project-tracker.signInGitHub',
                            title: 'Sign in to GitHub'
                        };
                        signInItem.contextValue = 'signInItem';
                        items.push(signInItem);
                    }
                } catch (e) {
                    console.error('Project Tracker: Error in getChildren session check', e);
                }

                const projectItems = await Promise.all(projects.map(async p => {
                    const exists = fs.existsSync(p.path);
                    const relTime = getRelativeTimeString(p.lastAccessed);
                    const metadata = exists ? await getProjectMetadata(p.path) : null;

                    const labelTitle = (exists && metadata && metadata.gitDiffCount > 0) ?
                        `${p.name} [${metadata.gitDiffCount}]` :
                        p.name;

                    // Determine type icon
                    let typeIcon = 'symbol-folder';

                    if (p.icon) {
                        typeIcon = p.icon;
                    } else if (metadata && metadata.tech.length > 0) {
                        const techMap = {
                            'Node.js': 'package',
                            'Python': 'symbol-method',
                            'Web': 'globe',
                            'Rust': 'tools',
                            'Go': 'symbol-class',
                            'PHP': 'code'
                        };
                        typeIcon = techMap[metadata.tech[0]] || 'symbol-folder';
                    }

                    if (!exists) typeIcon = 'error';
                    let iconColor = p.color ? new vscode.ThemeColor(p.color) : undefined;
                    if (exists && metadata && metadata.isBehind && !p.color) {
                        iconColor = new vscode.ThemeColor('errorForeground');
                    }

                    // Always use the type icon as the primary icon.
                    // If pinned, we add a pin emoji to the label for visual distinction.
                    const item = new ProjectItem(
                        p.pinned ? `📌 ${labelTitle}` : labelTitle,
                        exists ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
                        p.path,
                        'project'
                    );

                    item.iconPath = new vscode.ThemeIcon(typeIcon, iconColor);

                    let description = [];
                    if (exists && metadata) {
                        let branchText = metadata.branch ? `🌿 ${metadata.branch}` : '';
                        if (metadata.isDirty) branchText += '*';
                        if (branchText) description.push(branchText);
                        if (metadata.sparkline) description.push(metadata.sparkline);
                    }
                    description.push(relTime);

                    item.description = exists ? description.join(' • ') : `(Missing) ${relTime}`;
                    item.tooltip = exists ? `${p.pinned ? '📌 ' : ''}${p.name}\n${p.path}` : `${p.name} (Missing)\n${p.path}`;

                    let contextValue = exists ? (p.pinned ? 'projectPinned' : 'project') : 'invalid-project';
                    if (exists && metadata && metadata.isBehind) {
                        contextValue += '-behind';
                    }
                    item.contextValue = contextValue;

                    item.command = {
                        command: 'project-tracker.openProject',
                        title: 'Open Project',
                        arguments: [p.path]
                    };

                    return item;
                }));

                items.push(...projectItems);
                return items;
            }

            if (element.type === 'project') {
                const metadata = await getProjectMetadata(element.projectPath);
                if (!metadata) return [];

                const children = [];
                if (metadata.branch) {
                    const branchItem = new ProjectItem(`Branch: ${metadata.branch}${metadata.isDirty ? '*' : ''}`, vscode.TreeItemCollapsibleState.None);
                    branchItem.iconPath = new vscode.ThemeIcon('git-branch');
                    children.push(branchItem);
                }

                if (metadata.contributors && metadata.contributors.length > 0) {
                    const teamItem = new ProjectItem(`Top Contributors`, vscode.TreeItemCollapsibleState.Collapsed);
                    teamItem.iconPath = new vscode.ThemeIcon('organization');
                    teamItem.type = 'team';
                    teamItem.contributors = metadata.contributors;
                    children.push(teamItem);
                }

                if (metadata.tech.length > 0) {
                    const techItem = new ProjectItem(`Tech: ${metadata.tech.join(', ')}`, vscode.TreeItemCollapsibleState.None);
                    techItem.iconPath = new vscode.ThemeIcon('code');
                    children.push(techItem);
                }

                if (metadata.files.length > 0) {
                    metadata.files.forEach(f => {
                        const fileItem = new ProjectItem(f, vscode.TreeItemCollapsibleState.None);
                        fileItem.iconPath = new vscode.ThemeIcon('file');
                        fileItem.command = {
                            command: 'vscode.open',
                            title: 'Open File',
                            arguments: [vscode.Uri.file(path.join(element.projectPath, f))]
                        };
                        children.push(fileItem);
                    });
                }
                return children;
            }

            if (element.type === 'section') {
                if (element.label === 'Available on GitHub') {
                    const repos = await fetchGitHubRepos();
                    const projects = getProjects() || [];
                    const localNames = projects.map(p => p.name.toLowerCase());

                    const externalRepos = repos.filter(r => !localNames.includes(r.name.toLowerCase()));

                    return externalRepos.map(r => {
                        const item = new ProjectItem(
                            r.name,
                            vscode.TreeItemCollapsibleState.None,
                            r.url,
                            'external-repo'
                        );
                        item.description = r.private ? '🔒 Private' : '🌐 Public';
                        item.tooltip = r.description || r.fullName;
                        item.iconPath = new vscode.ThemeIcon('github');
                        item.contextValue = 'external-repo';
                        item.command = {
                            command: 'project-tracker.cloneRepository',
                            title: 'Clone Repository',
                            arguments: [r]
                        };
                        return item;
                    });
                }
            }

            if (element.type === 'team') {
                return element.contributors.map(c => {
                    const item = new ProjectItem(c, vscode.TreeItemCollapsibleState.None);
                    item.iconPath = new vscode.ThemeIcon('account');
                    return item;
                });
            }

            return [];
        }
    }

    const projectDataProvider = new ProjectDataProvider();
    vscode.window.registerTreeDataProvider('projectList', projectDataProvider);

    const projectDecorationProvider = new ProjectDecorationProvider();
    context.subscriptions.push(vscode.window.registerFileDecorationProvider(projectDecorationProvider));

    function trackCurrentFolders() {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders) return;

        let projects = getProjects();
        if (projects === null) return;
        let changed = false;

        folders.forEach(folder => {
            const folderPath = folder.uri.fsPath;
            const existingIndex = projects.findIndex(p => p.path.toLowerCase() === folderPath.toLowerCase());

            if (existingIndex === -1) {
                projects.unshift({
                    name: path.basename(folderPath),
                    path: folderPath,
                    lastAccessed: new Date().toISOString(),
                    pinned: false
                });
                changed = true;
            } else {
                projects[existingIndex].lastAccessed = new Date().toISOString();
                const item = projects.splice(existingIndex, 1)[0];
                projects.unshift(item);
                changed = true;
            }
        });

        if (changed) {
            saveProjects(projects.slice(0, 50));
            projectDataProvider.refresh();
        }
    }

    trackCurrentFolders();
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => trackCurrentFolders()));

    context.subscriptions.push(vscode.commands.registerCommand('project-tracker.refreshList', () => {
        gitStatusCache.clear();
        projectDataProvider.refresh();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('project-tracker.openProject', (projectPath) => {
        if (!fs.existsSync(projectPath)) {
            vscode.window.showErrorMessage(`Project folder no longer exists: ${projectPath}`);
            return;
        }
        vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(projectPath), true);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('project-tracker.pullProject', async (item) => {
        const projectPath = item.projectPath;
        if (!projectPath || !fs.existsSync(projectPath)) return;

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Pulling updates for ${path.basename(projectPath)}`,
            cancellable: false
        }, async (progress) => {
            try {
                await execAsync('git pull', {
                    cwd: projectPath,
                    timeout: 30000
                });
                gitStatusCache.clear();
                vscode.window.showInformationMessage(`Successfully pulled updates for ${path.basename(projectPath)}`);
                projectDataProvider.refresh();
            } catch (e) {
                vscode.window.showErrorMessage(`Failed to pull updates: ${e.message}`);
            }
        });
    }));

    context.subscriptions.push(vscode.commands.registerCommand('project-tracker.cloneRepository', async (repo) => {
        const result = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Select Folder to Clone Into'
        });

        if (result && result[0]) {
            const parentPath = result[0].fsPath;
            const projectPath = path.join(parentPath, repo.name);

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Cloning ${repo.fullName}...`,
                cancellable: false
            }, async (progress) => {
                try {
                    await execAsync(`git clone ${repo.url}`, {
                        cwd: parentPath,
                        timeout: 60000
                    });

                    let projects = getProjects() || [];
                    projects.unshift({
                        name: repo.name,
                        path: projectPath,
                        lastAccessed: new Date().toISOString(),
                        pinned: false
                    });
                    saveProjects(projects.slice(0, 50));
                    projectDataProvider.refresh();

                    const open = await vscode.window.showInformationMessage(`Cloned ${repo.name} successfullly. Open now?`, 'Yes', 'No');
                    if (open === 'Yes') {
                        vscode.commands.executeCommand('project-tracker.openProject', projectPath);
                    }
                } catch (e) {
                    vscode.window.showErrorMessage(`Failed to clone ${repo.name}: ${e.message}`);
                }
            });
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('project-tracker.signInGitHub', async () => {
        const session = await getGitHubSession(false);
        if (session) {
            vscode.window.showInformationMessage(`Signed in as ${session.account.label}`);
            projectDataProvider.refresh();
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('project-tracker.searchProjects', async () => {
        const projects = getProjects();
        if (!projects || projects.length === 0) return;

        const items = projects.map(p => ({
            label: p.name,
            description: fs.existsSync(p.path) ? p.path : `(Missing) ${p.path}`,
            path: p.path,
            exists: fs.existsSync(p.path)
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Search recent projects...',
            matchOnDescription: true
        });
        if (selected) {
            if (!selected.exists) {
                vscode.window.showErrorMessage(`Project folder no longer exists: ${selected.path}`);
                return;
            }
            vscode.commands.executeCommand('project-tracker.openProject', selected.path);
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('project-tracker.addProjectFolder', async () => {
        const result = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Add Folder'
        });
        if (result && result[0]) {
            const folderPath = result[0].fsPath;
            let projects = getProjects();
            if (projects === null) return;

            const existingIndex = projects.findIndex(p => p.path.toLowerCase() === folderPath.toLowerCase());
            if (existingIndex === -1) {
                projects.unshift({
                    name: path.basename(folderPath),
                    path: folderPath,
                    lastAccessed: new Date().toISOString(),
                    pinned: false
                });
            } else {
                projects[existingIndex].lastAccessed = new Date().toISOString();
                const item = projects.splice(existingIndex, 1)[0];
                projects.unshift(item);
            }
            saveProjects(projects.slice(0, 50));
            projectDataProvider.refresh();
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('project-tracker.removeProject', async (item) => {
        if (!item || !item.projectPath) return;
        const confirm = await vscode.window.showWarningMessage(`Remove "${item.label}" from recent projects?`, {
            modal: true
        }, 'Remove');
        if (confirm === 'Remove') {
            let projects = getProjects();
            if (projects === null) return;
            projects = projects.filter(p => p.path.toLowerCase() !== item.projectPath.toLowerCase());
            saveProjects(projects);
            projectDataProvider.refresh();
            vscode.window.setStatusBarMessage(`Removed ${item.label} from tracker.`, 3000);
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('project-tracker.pinProject', async (item) => {
        if (!item || !item.projectPath) return;
        let projects = getProjects();
        const index = projects.findIndex(p => p.path.toLowerCase() === item.projectPath.toLowerCase());
        if (index !== -1) {
            projects[index].pinned = true;
            saveProjects(projects);
            projectDataProvider.refresh();
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('project-tracker.unpinProject', async (item) => {
        if (!item || !item.projectPath) return;
        let projects = getProjects();
        const index = projects.findIndex(p => p.path.toLowerCase() === item.projectPath.toLowerCase());
        if (index !== -1) {
            projects[index].pinned = false;
            saveProjects(projects);
            projectDataProvider.refresh();
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('project-tracker.openStorageFile', async () => {
        if (fs.existsSync(storagePath)) {
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(storagePath));
            await vscode.window.showTextDocument(doc);
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('project-tracker.setProjectIcon', async (item) => {
        if (!item || !item.projectPath) return;

        const iconItems = [{
                label: '$(folder) Folder',
                icon: 'symbol-folder'
            },
            {
                label: '$(root-folder) Root',
                icon: 'root-folder'
            },
            {
                label: '$(repo) Repository',
                icon: 'repo'
            },
            {
                label: '$(star) Star/Favorite',
                icon: 'star'
            },
            {
                label: '$(heart) Personal',
                icon: 'heart'
            },
            {
                label: '$(rocket) Launch/Ship',
                icon: 'rocket'
            },
            {
                label: '$(beaker) Experimental/Labs',
                icon: 'beaker'
            },
            {
                label: '$(flask) Research',
                icon: 'flask'
            },
            {
                label: '$(bug) Debug/Issues',
                icon: 'bug'
            },
            {
                label: '$(tools) Tools/Rust',
                icon: 'tools'
            },
            {
                label: '$(gear) Config/Settings',
                icon: 'gear'
            },
            {
                label: '$(terminal) CLI/Shell',
                icon: 'terminal'
            },
            {
                label: '$(code) Code/General',
                icon: 'code'
            },
            {
                label: '$(symbol-method) Function/Python',
                icon: 'symbol-method'
            },
            {
                label: '$(symbol-class) Class/Go',
                icon: 'symbol-class'
            },
            {
                label: '$(ruby) Ruby',
                icon: 'ruby'
            },
            {
                label: '$(package) Package/Node.js',
                icon: 'package'
            },
            {
                label: '$(globe) Web/Public',
                icon: 'globe'
            },
            {
                label: '$(server) Server/Backend',
                icon: 'server'
            },
            {
                label: '$(database) Database/SQL',
                icon: 'database'
            },
            {
                label: '$(cloud) Cloud/Remote',
                icon: 'cloud'
            },
            {
                label: '$(device-mobile) Mobile/App',
                icon: 'device-mobile'
            },
            {
                label: '$(desktop-download) Installer',
                icon: 'desktop-download'
            },
            {
                label: '$(extensions) Plugins/Add-ons',
                icon: 'extensions'
            },
            {
                label: '$(law) License/Legal',
                icon: 'law'
            },
            {
                label: '$(book) Documentation',
                icon: 'book'
            },
            {
                label: '$(library) Library',
                icon: 'library'
            },
            {
                label: '$(lock) Private/Security',
                icon: 'lock'
            },
            {
                label: '$(shield) Secure',
                icon: 'shield'
            },
            {
                label: '$(zap) Fast/Action',
                icon: 'zap'
            },
            {
                label: '$(flame) Hot/Urgent',
                icon: 'flame'
            },
            {
                label: '$(archive) Archive',
                icon: 'archive'
            },
            {
                label: '$(trash) Deprecated',
                icon: 'trash'
            },
            {
                label: '$(github) GitHub',
                icon: 'github'
            },
            {
                label: '$(circle-outline) Default (Reset to default)',
                icon: null
            }
        ];

        const selected = await vscode.window.showQuickPick(iconItems, {
            placeHolder: 'Select Project Icon',
            matchOnDescription: true
        });
        if (selected) {
            let projects = getProjects();
            const index = projects.findIndex(p => p.path.toLowerCase() === item.projectPath.toLowerCase());
            if (index !== -1) {
                projects[index].icon = selected.icon;
                saveProjects(projects);
                projectDataProvider.refresh();
            }
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('project-tracker.setProjectColor', async (item) => {
        if (!item || !item.projectPath) return;

        const colorItems = [
            // Charts Colors
            {
                label: '$(circle-filled) Blue (Charts)',
                color: 'charts.blue'
            },
            {
                label: '$(circle-filled) Red (Charts)',
                color: 'charts.red'
            },
            {
                label: '$(circle-filled) Green (Charts)',
                color: 'charts.green'
            },
            {
                label: '$(circle-filled) Yellow (Charts)',
                color: 'charts.yellow'
            },
            {
                label: '$(circle-filled) Orange (Charts)',
                color: 'charts.orange'
            },
            {
                label: '$(circle-filled) Purple (Charts)',
                color: 'charts.purple'
            },

            // Terminal Colors (Standard)
            {
                label: '$(circle-filled) Cyan',
                color: 'terminal.ansiCyan'
            },
            {
                label: '$(circle-filled) Magenta',
                color: 'terminal.ansiMagenta'
            },
            {
                label: '$(circle-filled) Green',
                color: 'terminal.ansiGreen'
            },
            {
                label: '$(circle-filled) Red',
                color: 'terminal.ansiRed'
            },
            {
                label: '$(circle-filled) Yellow',
                color: 'terminal.ansiYellow'
            },
            {
                label: '$(circle-filled) Blue',
                color: 'terminal.ansiBlue'
            },
            {
                label: '$(circle-filled) White',
                color: 'terminal.ansiWhite'
            },
            {
                label: '$(circle-filled) Black',
                color: 'terminal.ansiBlack'
            },

            // Terminal Colors (Bright)
            {
                label: '$(circle-filled) Bright Red',
                color: 'terminal.ansiBrightRed'
            },
            {
                label: '$(circle-filled) Bright Green',
                color: 'terminal.ansiBrightGreen'
            },
            {
                label: '$(circle-filled) Bright Yellow',
                color: 'terminal.ansiBrightYellow'
            },
            {
                label: '$(circle-filled) Bright Blue',
                color: 'terminal.ansiBrightBlue'
            },
            {
                label: '$(circle-filled) Bright Magenta',
                color: 'terminal.ansiBrightMagenta'
            },
            {
                label: '$(circle-filled) Bright Cyan',
                color: 'terminal.ansiBrightCyan'
            },
            {
                label: '$(circle-filled) Bright White',
                color: 'terminal.ansiBrightWhite'
            },
            {
                label: '$(circle-filled) Bright Black (Gray)',
                color: 'terminal.ansiBrightBlack'
            },

            // Git Decorations
            {
                label: '$(circle-filled) Git Added (Green)',
                color: 'gitDecoration.addedResourceForeground'
            },
            {
                label: '$(circle-filled) Git Modified (Yellow)',
                color: 'gitDecoration.modifiedResourceForeground'
            },
            {
                label: '$(circle-filled) Git Deleted (Red)',
                color: 'gitDecoration.deletedResourceForeground'
            },
            {
                label: '$(circle-filled) Git Untracked',
                color: 'gitDecoration.untrackedResourceForeground'
            },
            {
                label: '$(circle-filled) Git Ignored',
                color: 'gitDecoration.ignoredResourceForeground'
            },
            {
                label: '$(circle-filled) Git Conflicting',
                color: 'gitDecoration.conflictingResourceForeground'
            },
            {
                label: '$(circle-filled) Git Submodule',
                color: 'gitDecoration.submoduleResourceForeground'
            },

            // Other
            {
                label: '$(circle-filled) Error (Red)',
                color: 'errorForeground'
            },
            {
                label: '$(circle-filled) Warning (Orange)',
                color: 'editorWarning.foreground'
            },
            {
                label: '$(circle-filled) Info (Blue)',
                color: 'editorInfo.foreground'
            },
            {
                label: '$(circle-filled) Gray (Lines)',
                color: 'charts.lines'
            },
            {
                label: '$(circle-filled) Foreground',
                color: 'foreground'
            },

            {
                label: '$(circle-outline) Default (Reset to default)',
                color: null
            }
        ];

        const selected = await vscode.window.showQuickPick(colorItems, {
            placeHolder: 'Select Project Color',
            matchOnDescription: true
        });
        if (selected) {
            let projects = getProjects();
            const index = projects.findIndex(p => p.path.toLowerCase() === item.projectPath.toLowerCase());
            if (index !== -1) {
                projects[index].color = selected.color;
                saveProjects(projects);
                projectDataProvider.refresh();
            }
        }
    }));

    async function checkForUpdate(manual = false) {
        const extensionId = 'skdsam.project-tracker';
        const extension = vscode.extensions.getExtension(extensionId);
        if (!extension) return;

        const currentVersion = extension.packageJSON.version;
        const repoUrl = extension.packageJSON.repository.url.replace('.git', '');
        const rawUrl = repoUrl.replace('github.com', 'raw.githubusercontent.com') + '/main/package.json';

        try {
            const data = await new Promise((resolve, reject) => {
                https.get(rawUrl, (res) => {
                    let body = '';
                    res.on('data', (chunk) => body += chunk);
                    res.on('end', () => {
                        try {
                            resolve(JSON.parse(body));
                        } catch (e) {
                            reject(new Error('Invalid remote package.json'));
                        }
                    });
                    res.on('error', reject);
                }).on('error', reject);
            });

            const latestVersion = data.version;
            if (isNewer(latestVersion, currentVersion)) {
                const msg = `New version available: v${latestVersion} (Current: v${currentVersion})`;
                const action = 'Get Update';
                const result = await vscode.window.showInformationMessage(msg, action);
                if (result === action) {
                    vscode.env.openExternal(vscode.Uri.parse(repoUrl));
                }
            } else if (manual) {
                vscode.window.showInformationMessage(`Project Tracker is up to date (v${currentVersion}).`);
            }
        } catch (e) {
            if (manual) {
                vscode.window.showErrorMessage(`Update check failed: ${e.message}`);
            }
        }
    }

    function isNewer(latest, current) {
        const l = latest.split('.').map(Number);
        const c = current.split('.').map(Number);
        for (let i = 0; i < 3; i++) {
            if (l[i] > (c[i] || 0)) return true;
            if (l[i] < (c[i] || 0)) return false;
        }
        return false;
    }

    // Check for updates on activation
    setTimeout(() => checkForUpdate(), 5000);

    context.subscriptions.push(vscode.commands.registerCommand('project-tracker.checkForUpdate', () => checkForUpdate(true)));
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};