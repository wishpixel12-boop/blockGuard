/**
 * Block Guard - Ultimate Universal Edition (Refined)
 * RECONSTRUCTED: Robust single-file logic for local compatibility.
 * Improvements: Full Sidebar Hide, Upgrade/Degrade Cycle, Comments Toggle, 
 * No Formatting (Plain Text focus), and Enhanced Config Modal.
 */

// --- GLOBAL STATE ---
const state = {
    workspaceHandle: null,
    projects: [],
    activeFile: null,
    activeParagraphIndex: undefined,
    config: {
        states: [
            { id: 'draft', name: 'Primer Borrador', color: '#ff3b30', goal: 30000, countType: 'absolute' },
            { id: 'review', name: 'En Revisión', color: '#ff9500', goal: 15000, countType: 'edited' },
            { id: 'final', name: 'Últimos Retoques', color: '#34c759', goal: 5000, countType: 'delta' }
        ],
        autosaveInterval: 30
    },
    sidebarCollapsed: false,
    contextTarget: null,
    autosaveTimer: null,
    modalResolver: null
};

const el = {
    sidebar: document.getElementById('sidebar'),
    projectList: document.getElementById('project-list'),
    editor: document.getElementById('editor-body'),
    ctxMenu: document.getElementById('custom-context-menu'),
    ctxSidebarList: document.getElementById('ctx-sidebar-list'),
    welcomeScreen: document.getElementById('welcome-screen'),
    recentProjectsList: document.getElementById('recent-projects'),
    breadcrumb: document.getElementById('breadcrumb'),
    charGoal: document.getElementById('char-goal'),
    goalProgress: document.getElementById('goal-progress'),
    progressText: document.getElementById('progress-text'),
    statLines: document.getElementById('stat-lines'),
    statWords: document.getElementById('stat-words'),
    statChars: document.getElementById('stat-chars'),
    statAdded: document.getElementById('stat-added'),
    statRemoved: document.getElementById('stat-removed'),
    notificationContainer: document.getElementById('notification-container'),
    hoverZone: document.getElementById('sidebar-hover-zone'),
    statusBar: document.getElementById('status-bar')
};

// --- INITIALIZATION ---
async function init() {
    console.log('[Block Guard] init() started');
    // 1. Load Local Config
    loadConfig();
    console.log('[Block Guard] Config loaded');

    // 2. Setup Basic Event Listeners (needed for early UI)
    setupEventListeners();
    setupSidebarHover();
    setupTabs();
    setupAutosave();

    // 3. Apply Identity (sidebar/welcome name)
    applyUserIdentity();

    // 3. Early UI Restore (Show cached projects immediately)
    const savedMeta = localStorage.getItem('bg_meta');
    if (savedMeta) {
        state.projectsJSON = JSON.parse(savedMeta);
    }

    try {
        const handle = await loadHandle();
        if (handle) {
            state.workspaceHandle = handle;

            // FAVOR CACHE: Fill state.projects with cached data before permission
            await restoreFromJSONCache();
            renderSidebar();

            const permission = await handle.queryPermission({ mode: 'readwrite' });
            if (permission === 'granted') {
                document.body.classList.remove('no-workspace');
                await scanWorkspace(); // Deep scan and sync
                renderSidebar();

                autoOpenFile();
            } else {
                document.body.classList.add('no-workspace');
                // Show "Reconnect" UI
                document.getElementById('sidebar-reconnect-btn').classList.remove('hidden');
                document.getElementById('reconnect-folder-btn').classList.remove('hidden');
                document.getElementById('welcome-message').innerText = 'Se requiere permiso para acceder a tus archivos.';
                notify('Reactiva el acceso a tu carpeta para editar', 'info');
            }
        } else {
            document.body.classList.add('no-workspace');
            document.getElementById('welcome-message').innerText = 'Conecta una carpeta local para empezar.';
        }
    } catch (err) {
        console.error('Init Error:', err);
        document.body.classList.add('no-workspace');
    }

    updateUI();
    console.log('[Block Guard] init() complete - UI updated');
}

function autoOpenFile() {
    const lastFile = localStorage.getItem('bg_last_file');
    if (lastFile) {
        try {
            const { pIdx, path } = JSON.parse(lastFile);
            window.openFileSmart(pIdx, path);
        } catch { }
    } else {
        checkInitialReadme();
    }
}

function setupEventListeners() {
    document.addEventListener('contextmenu', handleGlobalContextMenu);
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#custom-context-menu')) el.ctxMenu.classList.add('hidden');

        // Click outside modal to close
        if (e.target.classList.contains('modal')) {
            if (e.target.id === 'settings-modal') e.target.classList.remove('open');
            else if (e.target.id === 'input-modal') window.closeInputModal();
            else if (e.target.id === 'confirm-modal') window.closeConfirmModal(false);
            else if (e.target.id === 'spell-modal') e.target.classList.remove('open');
        }

        // Click on comments overlay to close sidebar
        if (e.target.id === 'comments-overlay') {
            document.getElementById('comments-sidebar').classList.add('hidden');
            e.target.classList.add('hidden');
        }
    });

    // Disable native context menu in editor
    el.editor.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });

    // Header Actions
    const saveBtn = document.getElementById('manual-save');
    if (saveBtn) saveBtn.onclick = () => saveFileContent(true);
    const setupBtn = document.getElementById('setup-folder');
    if (setupBtn) setupBtn.onclick = selectWorkspace;

    const addProjBtn = document.getElementById('add-project');
    if (addProjBtn) addProjBtn.onclick = createProjectAction;

    const collapseBtn = document.getElementById('collapse-sidebar');
    if (collapseBtn) {
        collapseBtn.onclick = () => {
            state.sidebarCollapsed = true;
            el.sidebar.classList.add('collapsed');
            el.sidebar.classList.remove('peek');
            const showBtn = document.getElementById('show-sidebar-btn');
            if (showBtn) showBtn.classList.remove('hidden');
        };
    }

    const showSidebarBtn = document.getElementById('show-sidebar-btn');
    if (showSidebarBtn) {
        showSidebarBtn.onclick = () => {
            state.sidebarCollapsed = false;
            el.sidebar.classList.remove('collapsed', 'peek');
            showSidebarBtn.classList.add('hidden');
        };
    }

    const reconBtn = document.getElementById('reconnect-folder-btn');
    if (reconBtn) reconBtn.onclick = () => requestWorkspacePermission();

    const sideReconBtn = document.getElementById('sidebar-reconnect-btn');
    if (sideReconBtn) sideReconBtn.onclick = () => requestWorkspacePermission();

    const spellBtn = document.getElementById('spell-check');
    if (spellBtn) spellBtn.onclick = toggleSpellCheck;

    // Comments & Modal
    const postPostBtn = document.getElementById('post-comment');
    if (postPostBtn) {
        postPostBtn.onclick = () => {
            const input = document.getElementById('new-comment');
            if (input) {
                postComment(input.value);
                input.value = '';
            }
        };
    }
    const closeCommBtn = document.getElementById('close-comments');
    if (closeCommBtn) {
        closeCommBtn.onclick = () => {
            const side = document.getElementById('comments-sidebar');
            const over = document.getElementById('comments-overlay');
            if (side) side.classList.add('hidden');
            if (over) over.classList.add('hidden');
        };
    }

    // Toggle Logic for Comments Sidebar
    const paraCommBtn = document.getElementById('para-comment-btn');
    if (paraCommBtn) {
        paraCommBtn.onclick = (e) => {
            e.stopPropagation();
            const side = document.getElementById('comments-sidebar');
            const overlay = document.getElementById('comments-overlay');
            const toolbar = document.getElementById('para-toolbar');

            if (side) side.classList.toggle('hidden');
            if (overlay && side) overlay.classList.toggle('hidden', side.classList.contains('hidden'));

            if (side && !side.classList.contains('hidden')) {
                renderComments();
                if (toolbar) {
                    toolbar.classList.add('hidden');
                    toolbar.classList.remove('visible');
                }
            }
        };
    }

    const closeComments = document.getElementById('close-comments');
    if (closeComments) {
        closeComments.onclick = () => {
            document.getElementById('comments-sidebar').classList.add('hidden');
        };
    }

    const openSettingsBtn = document.getElementById('open-settings');
    console.log('[Block Guard] open-settings button:', openSettingsBtn);
    if (openSettingsBtn) {
        openSettingsBtn.onclick = () => {
            console.log('[Block Guard] Settings button clicked');
            document.getElementById('settings-modal').classList.add('open');
            const welcomeName = document.getElementById('welcome-user-name');
            const currentName = welcomeName ? welcomeName.innerText : (state.workspaceHandle ? state.workspaceHandle.name : 'Usuario PC');
            const nameInput = document.getElementById('user-name-input');
            if (nameInput) nameInput.value = localStorage.getItem('bg_user_name') || currentName;
            renderStateConfig();
        };
    }

    document.querySelectorAll('.settings-nav-btn').forEach(btn => {
        btn.onclick = () => {
            const tabId = btn.getAttribute('data-tab');
            document.querySelectorAll('.settings-nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(tabId).classList.add('active');
            document.getElementById('settings-tab-title').innerText = btn.innerText.trim();
        };
    });

    const closeSettingsTop = document.getElementById('close-settings-top');
    if (closeSettingsTop) closeSettingsTop.onclick = () => document.getElementById('settings-modal').classList.remove('open');

    const saveSettingsBtn = document.getElementById('save-settings-btn');
    if (saveSettingsBtn) {
        saveSettingsBtn.onclick = () => {
            saveConfig();
            const nameInp = document.getElementById('user-name-input');
            if (nameInp && nameInp.value) {
                const newName = nameInp.value;
                localStorage.setItem('bg_user_name', newName);
                const sideName = document.getElementById('user-name-display');
                const welcomeName = document.getElementById('welcome-user-name');
                if (sideName) sideName.innerText = newName;
                if (welcomeName) welcomeName.innerText = newName;
            }
            const setModal = document.getElementById('settings-modal');
            if (setModal) setModal.classList.remove('open');
            notify('Configuración guardada correctamente');
            updateUI();
        };
    }

    const addStateBtn = document.getElementById('add-state-btn');
    if (addStateBtn) {
        addStateBtn.onclick = () => {
            state.config.states.push({
                id: 'new_' + Date.now(),
                name: 'Nuevo Estado',
                color: '#0071e3',
                countType: 'absolute',
                goal: 30000
            });
            renderStateConfig();
        };
    }

    // New Connection: Add sub-file button from the editor view
    const addSubFileBtn = document.getElementById('add-sub-file');
    if (addSubFileBtn) {
        addSubFileBtn.onclick = () => {
            if (state.activeFile) {
                state.contextTarget = {
                    type: 'file',
                    pIdx: state.activeProjectIndex || 0,
                    path: getPathFromItem(state.activeFile)
                };
                createFileSystemItemAction();
            }
        };
    }

    // Rename File in Editor Header
    const editorRename = document.getElementById('editor-rename-btn');
    if (editorRename) {
        editorRename.onclick = async () => {
            if (!state.activeFile) return;
            state.contextTarget = {
                type: 'file',
                pIdx: state.activeProjectIndex || 0,
                path: getPathFromItem(state.activeFile)
            };
            await renameItem();
        };
    }

    // Welcome Screen Actions

    // Context Menu Items
    const ctxRename = document.getElementById('ctx-rename');
    if (ctxRename) ctxRename.onclick = renameItem;

    const ctxAdd = document.getElementById('ctx-add-sub');
    if (ctxAdd) ctxAdd.onclick = createFileSystemItemAction;

    const ctxDel = document.getElementById('ctx-delete');
    if (ctxDel) ctxDel.onclick = deleteItemSmart;

    const ctxUp = document.getElementById('ctx-upgrade-sidebar');
    if (ctxUp) ctxUp.onclick = upgradeStatusAction;

    const upStatus = document.getElementById('upgrade-status');
    if (upStatus) upStatus.onclick = upgradeStatusAction;

    // Editor Logic
    el.editor.oninput = () => {
        updateStats();
        if (state.activeFile) {
            state.activeFile.lastCharCount = el.editor.innerText.length;
            // Optimize: Update only the active file's progress circle instead of full re-render
            updateActiveFileProgress();
        }
    };

    el.editor.onmouseover = (e) => {
        const p = e.target.closest('p');
        if (p && el.editor.contains(p)) {
            showParagraphToolbar(p);
        }
    };

    // Detection in the margin/padding area of the container
    document.querySelector('.editor-container').onmousemove = (e) => {
        // If the sidebar is open, don't keep showing toolbars
        if (!document.getElementById('comments-sidebar').classList.contains('hidden')) return;

        const rect = el.editor.getBoundingClientRect();
        // If mouse is to the right of the editor but within the container
        if (e.clientX >= rect.right && e.clientX <= rect.right + 100) {
            const y = e.clientY;
            const paragraphs = Array.from(el.editor.querySelectorAll('p'));
            const p = paragraphs.find(p => {
                const r = p.getBoundingClientRect();
                return y >= r.top && y <= r.bottom;
            });
            if (p) showParagraphToolbar(p);
        }
    };

    el.editor.onmouseleave = (e) => {
        // Only hide if we aren't moving to the toolbar itself
        const toolbar = document.getElementById('para-toolbar');
        if (e.relatedTarget && (e.relatedTarget === toolbar || toolbar.contains(e.relatedTarget))) {
            return;
        }
        // Small delay to allow moving to margins
        setTimeout(() => {
            const overContainer = document.querySelector('.editor-container:hover');
            if (!overContainer) toolbar.classList.add('hidden');
        }, 100);
    };

    // Hide toolbar when clicking outside editor/toolbar
    document.body.addEventListener('mousedown', (e) => {
        const toolbar = document.getElementById('para-toolbar');
        if (!e.target.closest('.editor-container') && !e.target.closest('#para-toolbar')) {
            toolbar.classList.add('hidden');
            toolbar.classList.remove('visible');
        }
    });
    el.editor.onclick = (e) => {
        const p = e.target.closest('p');
        if (p) {
            state.activeParagraphIndex = Array.from(el.editor.children).indexOf(p);
            showParagraphToolbar(p);
            if (!document.getElementById('comments-sidebar').classList.contains('hidden')) renderComments();
        }
    };

    // Ensure clicking the empty container still focuses the editor
    document.querySelector('.editor-container').addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('editor-container') || e.target === el.editor) {
            setTimeout(() => {
                el.editor.focus();
                // If it's empty, ensure the <p> tag is there
                if (el.editor.innerHTML.trim() === '' || el.editor.innerHTML === '<br>') {
                    el.editor.innerHTML = '<p><br></p>';
                }
            }, 0);
        }
    });

    el.editor.addEventListener('focus', () => {
        if (el.editor.innerHTML.trim() === '' || el.editor.innerHTML === '<br>') {
            el.editor.innerHTML = '<p><br></p>';
        }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 's') { e.preventDefault(); saveFileContent(true); }

        // Fix: If editor is empty on Enter, force a paragraph
        if (e.key === 'Enter' && e.target === el.editor) {
            setTimeout(() => {
                if (el.editor.innerHTML.trim() === '' || el.editor.innerHTML === '<br>') {
                    el.editor.innerHTML = '<p><br></p>';
                }
            }, 0);
        }
    });

    // Character Goal Input
    el.charGoal.oninput = () => {
        if (state.activeFile) {
            state.activeFile.goal = parseInt(el.charGoal.value) || 30000;
            updateStats();
            renderSidebar();
            saveMetadata();
        }
    };

    // Spellcheck Confirmation
    const spellConfirm = document.getElementById('spell-confirm-btn');
    if (spellConfirm) {
        spellConfirm.onclick = () => {
            document.getElementById('spell-modal').classList.remove('open');
            localStorage.setItem('bg_spell_warned', 'true');
            performSpellCheckRedirect();
        };
    }

    // Custom Input Modal logic
    document.getElementById('input-modal-confirm').onclick = () => {
        const val = document.getElementById('custom-input-field').value;
        if (state.modalResolver) {
            state.modalResolver(val);
            window.closeInputModal();
        }
    };
    document.getElementById('custom-input-field').onkeydown = (e) => {
        if (e.key === 'Enter') document.getElementById('input-modal-confirm').click();
    };

    // Expand sidebar button (the one inside the collapsed sidebar if it existed, 
    // but usually user just hovers or we need a way to un-collapse permanently)
    // The current UI uses the "X" or hover. Let's ensure the toggle icon in sidebar works for un-collapsing if needed.
    const expandBtn = document.getElementById('expand-sidebar');
    if (expandBtn) {
        expandBtn.onclick = () => {
            state.sidebarCollapsed = false;
            el.sidebar.classList.remove('collapsed', 'peek');
        };
    }
}

function setupSidebarHover() {
    const zone = document.getElementById('sidebar-hover-zone');
    const sidebar = document.getElementById('sidebar');
    if (!zone || !sidebar) return;

    zone.onmouseenter = () => {
        if (state.sidebarCollapsed) {
            sidebar.classList.add('peek');
        }
    };

    sidebar.onmouseleave = (e) => {
        if (state.sidebarCollapsed) {
            // Check if we are moving to the collapse button or something that might trigger a false exit
            sidebar.classList.remove('peek');
        }
    };

    // Also allow clicking the sidebar to "un-collapse" it permanently
    sidebar.onclick = (e) => {
        if (state.sidebarCollapsed && sidebar.classList.contains('peek')) {
            const isToggle = e.target.closest('.toggle-icon') || e.target.closest('.nav-item-dots');
            if (!isToggle) {
                state.sidebarCollapsed = false;
                sidebar.classList.remove('collapsed', 'peek');
            }
        }
    };
}

// --- FILE SYSTEM ---
async function requestWorkspacePermission() {
    if (!state.workspaceHandle) return;
    try {
        const p = await state.workspaceHandle.requestPermission({ mode: 'readwrite' });
        if (p === 'granted') {
            document.body.classList.remove('no-workspace');
            document.getElementById('sidebar-reconnect-btn').classList.add('hidden');
            document.getElementById('reconnect-folder-btn').classList.add('hidden');
            await scanWorkspace();
            renderSidebar();
            autoOpenFile();
        }
    } catch (err) {
        console.error('Permission request failed:', err);
    }
}

async function selectWorkspace() {
    try {
        const h = await window.showDirectoryPicker();
        state.workspaceHandle = h;
        await saveHandle(h);
        await scanWorkspace();
        renderSidebar();
        notify('Proyecto cargado');
    } catch { }
}

async function scanWorkspace() {
    if (!state.workspaceHandle) return;
    let data;
    try {
        document.body.classList.remove('no-workspace');
        // Ensure buttons exist before trying to hide them
        const welcomeRecon = document.getElementById('reconnect-folder-btn');
        if (welcomeRecon) welcomeRecon.classList.add('hidden');

        const sideRecon = document.getElementById('sidebar-reconnect-btn');
        if (sideRecon) sideRecon.classList.add('hidden');

        data = await state.workspaceHandle.getDirectoryHandle('data', { create: true });
    } catch (err) {
        console.error('Error getting/creating data folder:', err);
        notify('Error al acceder a la carpeta data', 'error');
        return;
    }

    const projs = [];
    for await (const entry of data.values()) {
        if (entry.kind === 'directory') {
            const p = { name: entry.name, handle: entry, open: true, items: [] };
            await scanDirectoryRecursive(entry, p.items, entry.name);
            projs.push(p);
        }
    }
    state.projects = projs;
    loadMetadata();
    updateUI();
    // After scanning, if we have a handle, we should ensure JSON is up to date
    saveWorkspaceCache();
}

async function scanDirectoryRecursive(dirHandle, itemsArray, projectName) {
    for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.txt')) {
            const item = {
                name: entry.name, handle: entry, status: 'draft',
                lastCharCount: 0, items: [], comments: [], parentDirHandle: dirHandle,
                projectName: projectName
            };
            try {
                const subDir = await dirHandle.getDirectoryHandle('sub_' + entry.name.replace('.txt', ''), { create: false });
                await scanDirectoryRecursive(subDir, item.items, projectName);
            } catch { }
            itemsArray.push(item);
        }
    }
}

async function createProjectAction() {
    if (!state.workspaceHandle) {
        notify('Primero conecta una carpeta de trabajo', 'error');
        selectWorkspace();
        return;
    }
    const name = await promptCustom('Nombre del nuevo proyecto:', 'Mi Gran Proyecto');
    if (!name) return;
    try {
        const data = await state.workspaceHandle.getDirectoryHandle('data', { create: true });
        const h = await data.getDirectoryHandle(name, { create: true });
        state.projects.push({ name, handle: h, open: true, items: [] });
        renderSidebar();
        saveMetadata();
        notify('Proyecto creado');
    } catch (err) {
        console.error(err);
        notify('Error al crear proyecto', 'error');
    }
}

async function createFileSystemItemAction() {
    const t = state.contextTarget;
    if (!t) return;
    const isProject = t.type === 'project';
    const parent = findItemByPath(t.pIdx, t.path);
    const label = isProject ? 'Nombre del nuevo archivo:' : 'Nombre del sub-archivo:';
    const name = await promptCustom(label, 'Capítulo 1');
    if (!name) return;

    try {
        let targetDir;
        if (isProject) {
            targetDir = parent.handle; // The project directory itself
        } else {
            const parentDir = parent.parentDirHandle;
            const subDirName = 'sub_' + parent.name.replace('.txt', '');
            targetDir = await parentDir.getDirectoryHandle(subDirName, { create: true });
        }

        const fh = await targetDir.getFileHandle(name + '.txt', { create: true });
        const newItem = {
            name: name + '.txt', handle: fh, status: 'draft',
            lastCharCount: 0, items: [], comments: [],
            parentDirHandle: targetDir, projectName: isProject ? parent.name : (parent.projectName || 'Proyecto')
        };

        if (!parent.items) parent.items = [];
        parent.items.push(newItem);
        renderSidebar();
        saveMetadata();
        notify(isProject ? 'Archivo creado' : 'Sub-archivo creado');
    } catch (err) {
        console.error(err);
        notify('Error al crear el elemento', 'error');
    }
}

// --- UI RENDERING ---
function renderSidebar() {
    el.projectList.innerHTML = '';
    state.projects.forEach((p, pIdx) => {
        const li = document.createElement('li');
        li.className = `project-container ${p.open ? 'open' : ''}`;
        li.innerHTML = `
            <div class="nav-item ${state.activeFile === p ? 'active' : ''}" data-type="project" data-p-idx="${pIdx}" data-path="" title="${p.name}">
                <span class="file-name-text">
                    <span class="folder-icons-wrapper">
                        <i class="fas fa-chevron-${p.open ? 'down' : 'right'} toggle-icon"></i>
                        <i class="fas fa-folder folder-icon"></i>
                    </span>
                    <span class="text-content">${p.name}</span>
                </span>
                <div class="nav-item-actions">
                    <i class="fas fa-ellipsis-v nav-item-dots" onclick="event.stopPropagation(); window.showCtxManual(event, 'project', ${pIdx}, '')"></i>
                </div>
            </div>
            <ul class="sub-nav-list" style="max-height: ${p.open ? '2000px' : '0'}">
                ${renderLevel(p.items, pIdx, "")}
            </ul>
        `;
        li.querySelector('.nav-item').onclick = () => { p.open = !p.open; renderSidebar(); };
        el.projectList.appendChild(li);
    });
    updateWelcomeRecent();
}

function renderLevel(items, pIdx, parentPath) {
    if (!items) return '';
    return items.map((item, iIdx) => {
        const currentPath = parentPath === "" ? `${iIdx}` : `${parentPath},${iIdx}`;
        const active = state.activeFile === item;
        const status = state.config.states.find(s => s.id === item.status) || state.config.states[0];
        const pct = Math.min((item.lastCharCount / (item.goal || 30000)) * 100, 100);
        const offset = 56.5 - (56.5 * pct / 100);
        const hasChildren = item.items && item.items.length > 0;

        return `
            <li class="sub-nav-item ${active ? 'active' : ''} ${hasChildren ? 'has-children' : ''}" 
                data-type="file" data-p-idx="${pIdx}" data-path="${currentPath}" title="${item.name}" 
                onclick="window.handleFileClick(event, ${pIdx}, '${currentPath}')">
                <span class="file-name-text">
                    <span class="folder-icons-wrapper">
                        ${hasChildren ? `<i class="fas fa-chevron-${item.open ? 'down' : 'right'} toggle-icon" onclick="window.toggleSidebarAccordion(event, ${pIdx}, '${currentPath}')"></i>` : ''}
                        <svg class="circle-progress" viewBox="0 0 24 24">
                            <circle class="bg" cx="12" cy="12" r="9"></circle>
                            <circle class="fg" cx="12" cy="12" r="9" style="stroke: ${status.color}; stroke-dashoffset: ${offset}"></circle>
                        </svg>
                    </span>
                    <span class="text-content">${item.name}</span>
                </span>
                <i class="fas fa-ellipsis-v sub-nav-dots" onclick="event.stopPropagation(); window.showCtxManual(event, 'file', ${pIdx}, '${currentPath}')"></i>
            </li>
            ${hasChildren ? `<ul class="nested-list ${item.open ? 'open' : ''}">${renderLevel(item.items, pIdx, currentPath)}</ul>` : ''}
        `;
    }).join('');
}

window.handleFileClick = (e, pIdx, path) => {
    console.log('[Block Guard] handleFileClick called', { pIdx, path });
    // Check if toggle specifically was clicked
    if (e.target.closest('.toggle-icon')) {
        window.toggleSidebarAccordion(e, pIdx, path);
        return;
    }

    const item = findItemByPath(pIdx, path);
    // Auto-open accordion ONLY if it's currently closed and we ARE opening the file
    if (item && item.items && item.items.length > 0 && !item.open && !e.target.closest('.sub-nav-dots')) {
        item.open = true;
        renderSidebar();
    }
    window.openFileSmart(pIdx, path);
};

window.toggleSidebarAccordion = (e, pIdx, path) => {
    if (e) {
        e.stopPropagation();
        e.preventDefault();
    }
    const item = findItemByPath(pIdx, path);
    if (item) {
        item.open = !item.open;
        renderSidebar();
    }
};

function updateUI() {
    const file = state.activeFile;
    const folder = state.exploringFolder;

    el.welcomeScreen.classList.toggle('hidden', !!file || !!folder);
    document.getElementById('metadata-panel').classList.toggle('hidden', !file);

    // Project Explorer View
    const welcomeContent = el.welcomeScreen.querySelector('.welcome-content');
    if (folder) {
        el.welcomeScreen.classList.remove('hidden');
        welcomeContent.innerHTML = `
            <div class="welcome-logo"><i class="fas fa-folder-open"></i></div>
            <h1>${folder.name}</h1>
            <p>Contenido del proyecto:</p>
            <div class="folder-explorer-list" style="margin: 30px 0; max-width: 800px;">
                ${renderExplorerHierarchy(folder.items, folder.pIdx, folder.path)}
                ${folder.items.length === 0 ? '<p style="opacity:0.5">Este proyecto está vacío.</p>' : ''}
            </div>
            <div class="welcome-actions">
                <button class="btn-sub" onclick="window.closeFile()"><i class="fas fa-arrow-left"></i> Volver al Inicio</button>
            </div>
        `;
    } else if (!file) {
        const uName = localStorage.getItem('bg_user_name') || (state.workspaceHandle ? state.workspaceHandle.name : 'Escritor PC');
        // Restore Welcome Screen
        welcomeContent.innerHTML = `
            <div class="welcome-logo"><i class="fas fa-shield-halved"></i></div>
            <h1>Hola de nuevo, <span id="welcome-user-name">${uName}</span></h1>
            <p>¿Qué vamos a escribir hoy? Selecciona un proyecto para continuar.</p>
            <div class="recent-projects-grid" id="recent-projects"></div>
            <div class="welcome-actions">
                <button id="welcome-new-project" class="btn-primary" onclick="window.createProjectAction()"><i class="fas fa-plus"></i> Nuevo Proyecto</button>
                <button id="welcome-open-folder" class="btn-sub" onclick="window.selectWorkspace()"><i class="fas fa-folder-open"></i> Cambiar Carpeta</button>
            </div>
        `;
        updateWelcomeRecent();
    }

    if (file) {
        const projName = file.projectName || 'Proyecto';
        el.breadcrumb.innerHTML = `
            <span onclick="window.closeFile()"><i class="fas fa-home"></i> Inicio</span> 
            <i class="fas fa-chevron-right" style="font-size:0.7rem; opacity:0.5"></i> 
            <span onclick="window.exploreFolder(${state.activeProjectIndex || 0}, '')"><i class="fas fa-folder"></i> ${projName}</span> 
            <i class="fas fa-chevron-right" style="font-size:0.7rem; opacity:0.5"></i> 
            <span class="active"><i class="fas fa-file-alt"></i> ${file.name}</span>
        `;

        const titleEl = document.getElementById('active-file-title');
        const iconEl = document.getElementById('file-icon');
        if (titleEl) {
            titleEl.innerText = file.name.replace('.txt', '');
            titleEl.style.fontSize = '2.5rem';
        }
        if (iconEl) {
            iconEl.innerHTML = `<i class="fas fa-file-alt"></i>`;
            iconEl.style.fontSize = '2.5rem';
            iconEl.style.color = 'var(--accent-blue)';
        }

        const curIdx = state.config.states.findIndex(s => s.id === file.status);
        const st = state.config.states[curIdx] || state.config.states[0];

        el.statusBar.innerText = st.name;
        el.statusBar.style.backgroundColor = st.color;
        el.statusBar.classList.remove('status-pop');
        void el.statusBar.offsetWidth;
        el.statusBar.classList.add('status-pop');

        el.charGoal.value = file.goal || 30000;

        const upBtn = document.getElementById('upgrade-status');
        const upIcon = document.getElementById('upgrade-icon');
        const upText = document.getElementById('upgrade-text');

        if (curIdx === state.config.states.length - 1) {
            upText.innerText = 'Reiniciar';
            upIcon.className = 'fas fa-rotate-left';
            upBtn.classList.add('danger');
        } else {
            upText.innerText = 'Upgrade';
            upIcon.className = 'fas fa-arrow-up';
            upBtn.classList.remove('danger');
        }

        const links = document.getElementById('children-links');
        // PARENT vs CHILD logic: Only show sub-files for top-level (depth 0) files
        const pathParts = (getPathFromItem(file) || "").split(',').filter(x => x !== "");
        const isParent = pathParts.length <= 1;

        if (isParent && file.items && file.items.length > 0) {
            links.classList.remove('hidden');
            document.getElementById('links-list').innerHTML = file.items.map((it, idx) => {
                const itPath = getPathFromItem(it);
                const st = state.config.states.find(s => s.id === it.status) || state.config.states[0];
                const p = Math.min((it.lastCharCount / (it.goal || 30000)) * 100, 100);
                const off = 56.5 - (56.5 * p / 100);
                return `
                <li class="explorer-list-item" onclick="window.openFileSmart(${state.activeProjectIndex}, '${itPath}')">
                    <span class="folder-icons-wrapper">
                        <svg class="circle-progress" viewBox="0 0 24 24">
                            <circle class="bg" cx="12" cy="12" r="9"></circle>
                            <circle class="fg" cx="12" cy="12" r="9" style="stroke: ${st.color}; stroke-dashoffset: ${off}"></circle>
                        </svg>
                    </span>
                    <span class="text-content">${it.name}</span>
                </li>`;
            }).join('');
        } else {
            links.classList.add('hidden');
            document.getElementById('links-list').innerHTML = '';
        }

        updateStats();
    }
}
// --- CONTEXT & EDITOR ---
function handleGlobalContextMenu(e) {
    const target = e.target.closest('[data-type]');
    const isEditor = e.target.closest('#editor-body');
    if (!target && !isEditor) return;

    e.preventDefault();
    el.ctxMenu.classList.remove('hidden');
    el.ctxMenu.style.top = `${e.clientY}px`;
    el.ctxMenu.style.left = `${e.clientX}px`;

    if (isEditor) {
        el.ctxSidebarList.classList.add('hidden');
    } else {
        if (!state.workspaceHandle) {
            el.ctxSidebarList.innerHTML = `<li onclick="window.selectWorkspace()"><i class="fas fa-folder-open"></i> Conectar Carpeta</li>`;
            el.ctxSidebarList.classList.remove('hidden');
            return;
        }
        el.ctxSidebarList.classList.remove('hidden');
        const type = target ? target.dataset.type : 'project';
        state.contextTarget = { type, pIdx: parseInt(target.dataset.pIdx), path: target.dataset.path };

        const addBtn = document.getElementById('ctx-add-sub');
        if (type === 'project') {
            addBtn.innerHTML = '<i class="fas fa-plus-circle"></i> <span>Nuevo Archivo</span>';
            document.getElementById('ctx-upgrade-sidebar').classList.add('hidden');
        } else {
            addBtn.innerHTML = '<i class="fas fa-level-down-alt"></i> <span>Añadir Sub-archivo</span>';
            document.getElementById('ctx-upgrade-sidebar').classList.remove('hidden');
        }
    }
}

window.closeFile = () => {
    state.activeFile = null;
    state.exploringFolder = null;
    updateUI();
    renderSidebar();
};

window.exploreFolder = (pIdx, path) => {
    const item = findItemByPath(pIdx, path);
    if (!item) return;
    state.activeFile = null;
    state.exploringFolder = { ...item, pIdx, path };
    updateUI();
    renderSidebar();
};

window.openFileSmart = async (pIdx, path) => {
    const item = findItemByPath(pIdx, path);
    if (!item || (item.items && !item.handle.getFile)) {
        // If it's a project/folder, don't try to open as file
        if (item) window.exploreFolder(pIdx, path);
        return;
    }
    try {
        const fh = item.handle;
        if (!fh.getFile) throw new Error('Not a file');
        const file = await fh.getFile();
        const text = await file.text();
        state.activeFile = item;
        state.exploringFolder = null;
        state.activeParagraphIndex = undefined;
        el.editor.innerHTML = text || '<p><br></p>';
        // Initial session values for advanced counting
        item.sessionStartLength = text.length;
        if (!item.hist) item.hist = { added: 0, removed: 0, edited: 0 };
    } catch (err) {
        console.error('Error opening file:', err);
        state.activeFile = item;
        el.editor.innerHTML = '<p><br></p>';
    }
    updateUI();
    updateStats();
    renderSidebar();
    state.activeProjectIndex = pIdx;
    item.lastUpdated = new Date().toISOString();
    localStorage.setItem('bg_last_file', JSON.stringify({ pIdx, path }));
};

function getPathFromItem(target) {
    let found = null;
    state.projects.forEach((p, pIdx) => {
        const check = (items, path) => {
            items.forEach((it, idx) => {
                const current = path === "" ? `${idx}` : `${path},${idx}`;
                if (it === target) found = current;
                if (it.items) check(it.items, current);
            });
        };
        check(p.items, "");
    });
    return found || "";
}

function updateStats() {
    const text = el.editor.innerText;
    const file = state.activeFile;
    if (!file) return;

    el.statChars.innerText = `Caracteres: ${text.length}`;
    el.statWords.innerText = `Palabras: ${text.trim() ? text.trim().split(/\s+/).length : 0}`;
    el.statLines.innerText = `Líneas: ${el.editor.querySelectorAll('p').length}`;

    const status = state.config.states.find(s => s.id === file.status) || state.config.states[0];

    // Advanced Counting Logic
    let currentCount = text.length;
    if (status.countType === 'edited') {
        currentCount = (file.hist?.edited || 0);
    } else if (status.countType === 'delta') {
        currentCount = Math.max(0, text.length - (file.sessionStartLength || 0));
    }

    file.lastCharCount = currentCount;
    const goal = file.goal || 30000;
    const pct = Math.min(Math.round((currentCount / goal) * 100), 100);

    document.getElementById('goal-progress').style.width = `${pct}%`;
    document.getElementById('progress-text').innerText = `${pct}%`;
    el.statusBar.innerText = status.name;
    el.statusBar.style.backgroundColor = status.color;

    if (el.statAdded) el.statAdded.innerHTML = `<i class="fas fa-plus"></i> ${file.hist?.added || 0}`;
    if (el.statRemoved) el.statRemoved.innerHTML = `<i class="fas fa-minus"></i> ${file.hist?.removed || 0}`;

    updateActiveFileProgress();
}

// --- COMMENTS (RIGHT SIDE) ---
function showParagraphToolbar(p) {
    const toolbar = document.getElementById('para-toolbar');
    if (!toolbar) return;
    if (!document.getElementById('comments-sidebar').classList.contains('hidden')) {
        toolbar.classList.add('hidden');
        toolbar.classList.remove('visible');
        return;
    }
    toolbar.classList.remove('hidden');
    toolbar.classList.add('visible');
    toolbar.style.top = `${p.offsetTop}px`;
    toolbar.style.left = `calc(96% + 5px)`;
    const paras = Array.from(el.editor.querySelectorAll('p'));
    state.activeParagraphIndex = paras.indexOf(p);
    const count = (state.activeFile?.comments || []).filter(c => c.pIdx === state.activeParagraphIndex).length;
    document.getElementById('para-comment-count').innerText = count > 0 ? count : '';
}

function postComment(text) {
    if (!text.trim() || !state.activeFile) return;
    if (!state.activeFile.comments) state.activeFile.comments = [];
    const author = localStorage.getItem('bg_user_name') || 'Escritor';
    state.activeFile.comments.push({ author, text, date: new Date().toLocaleTimeString(), pIdx: state.activeParagraphIndex || 0 });
    saveMetadata(); renderComments();
}

function renderComments() {
    const list = document.getElementById('comments-list');
    if (!state.activeFile) return;
    const comments = (state.activeFile.comments || []).filter(c => state.activeParagraphIndex === undefined || c.pIdx === state.activeParagraphIndex);
    list.innerHTML = comments.length === 0 ? '<p style="text-align:center; opacity:0.5; margin-top:20px">Sin comentarios aquí.</p>' :
        comments.map(c => `<div class="comment-item">
            <div class="comment-author"><span>${c.author}</span><small>${c.date}</small></div>
            <p>${c.text}</p>
        </div>`).join('');
}

// --- CONFIG & UTILS ---
function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.tab-btn, .tab-content').forEach(el => el.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.add('active');
        };
    });
}

function setupAutosave() {
    if (state.autosaveTimer) clearInterval(state.autosaveTimer);
    state.autosaveTimer = setInterval(() => { if (state.activeFile) saveFileContent(false); }, (state.config.autosaveInterval || 30) * 1000);
}

async function saveFileContent(isManual = false) {
    if (!state.activeFile) return;
    const text = el.editor.innerText;
    const oldLength = state.activeFile.lastCharCount || 0;
    const newLength = text.length;

    // Basic tracking of changes
    if (!state.activeFile.hist) state.activeFile.hist = { added: 0, removed: 0, edited: 0 };

    const diff = newLength - oldLength;
    if (diff > 0) state.activeFile.hist.added += diff;
    else if (diff < 0) state.activeFile.hist.removed += Math.abs(diff);

    // Heuristic for 'edited': if length is similar but content changed. 
    // For now we'll just track total volatility as 'edited'
    state.activeFile.hist.edited += Math.abs(diff);

    try {
        const w = await state.activeFile.handle.createWritable();
        await w.write(el.editor.innerHTML);
        await w.close();
        state.activeFile.lastUpdated = new Date().toISOString();
        saveMetadata();
        if (isManual) notify('Cambios guardados');
    } catch { }
}

// setupSidebarHover() - Removed duplicate (original is at line 483-511)

function notify(msg, type = 'info') {
    const n = document.createElement('div');
    n.className = `notification ${type}`;
    n.innerHTML = `<i class="fas fa-info-circle"></i> ${msg}`;
    el.notificationContainer.appendChild(n);
    setTimeout(() => { n.style.opacity = '0'; setTimeout(() => n.remove(), 400); }, 3000);
}

async function checkInitialReadme() {
    if (state.projects.length === 0) {
        try {
            const data = await state.workspaceHandle.getDirectoryHandle('data', { create: true });
            const h = await data.getDirectoryHandle('Guía de Inicio', { create: true });
            const fh = await h.getFileHandle('Bienvenida.txt', { create: true });
            const w = await fh.createWritable();
            await w.write(`<h1>Bienvenido a Block Guard</h1>
<p>Block Guard es tu santuario personal para la escritura. Aquí tienes todo lo necesario para organizar tus historias, notas o proyectos de investigación.</p>

<h3>Consejos rápidos:</h3>
<ul>
    <li><b>Organización</b>: Crea proyectos en la barra lateral haciendo click derecho.</li>
    <li><b>Jerarquía</b>: Puedes añadir sub-archivos dentro de otros archivos para mayor estructura.</li>
    <li><b>Progreso</b>: Los círculos en el sidebar muestran cuánto te falta para llegar a tu meta de caracteres.</li>
    <li><b>Caché JSON</b>: Todo se guarda automáticamente en <i>block_guard_metadata.json</i> dentro de tu carpeta.</li>
</ul>

<p>Para empezar, selecciona esta carpeta "Guía de Inicio" o crea tu primer proyecto propio.</p>`);
            await w.close();
            await scanWorkspace();
            renderSidebar();
            if (state.projects.length > 0 && state.projects[0].items.length > 0) {
                window.openFileSmart(0, "0");
            }
        } catch (err) { console.error('Readme creation failed', err); }
    }
}

// --- PERSISTENCE HELPERS (JSON + LOCAL) ---
function applyUserIdentity() {
    const savedName = localStorage.getItem('bg_user_name');
    const folderName = state.workspaceHandle ? state.workspaceHandle.name : 'Escritor PC';
    const finalName = savedName || folderName;

    // Sidebar
    const sideName = document.getElementById('user-name-display');
    if (sideName) sideName.innerText = finalName;

    // Welcome Screen
    const welcomeUser = document.getElementById('welcome-user-name');
    if (welcomeUser) welcomeUser.innerText = finalName;

    // Avatar Icon fallback
    const avatarImg = document.getElementById('user-avatar');
    if (avatarImg && !avatarImg.src.includes('http')) {
        avatarImg.style.display = 'none';
        const placeholder = document.getElementById('user-avatar-placeholder');
        if (placeholder) placeholder.style.display = 'flex';
    }
}

async function saveWorkspaceCache() {
    if (!state.workspaceHandle) return;
    try {
        const metadata = {
            version: '2.0',
            lastUpdated: new Date().toISOString(),
            config: state.config, // PORTABLE CONFIG
            userName: localStorage.getItem('bg_user_name'), // SYNC IDENTITY
            projects: state.projects.map(p => ({
                name: p.name,
                open: p.open,
                items: p.items.map(serialize)
            }))
        };
        const fh = await state.workspaceHandle.getFileHandle('block_guard_metadata.json', { create: true });
        const w = await fh.createWritable();
        await w.write(JSON.stringify(metadata, null, 4));
        await w.close();
    } catch (err) {
        console.warn('JSON Cache failed:', err);
    }
}

async function restoreFromJSONCache() {
    if (!state.workspaceHandle) return;
    try {
        const fh = await state.workspaceHandle.getFileHandle('block_guard_metadata.json', { create: false });
        const file = await fh.getFile();
        const text = await file.text();
        const metadata = JSON.parse(text);
        if (metadata && metadata.projects) {
            if (metadata.config) {
                state.config = {
                    ...metadata.config,
                    autosaveInterval: metadata.config.autosaveInterval || 30,
                    states: (metadata.config.states || []).map(s => ({
                        ...s,
                        countType: s.countType || 'absolute',
                        goal: s.goal || 30000
                    }))
                };
            }
            if (metadata.userName) {
                localStorage.setItem('bg_user_name', metadata.userName);
                applyUserIdentity();
            }
            state.projects = metadata.projects.map(p => ({
                name: p.name,
                open: p.open,
                items: (p.items || []).map(deserialize)
            }));
        }
    } catch { }
}

function saveMetadata() {
    const metaStr = JSON.stringify(state.projects.map(p => ({ name: p.name, open: p.open, items: p.items.map(serialize) })));
    localStorage.setItem('bg_meta', metaStr);
    saveWorkspaceCache(); // Sync with Filesystem
}
function serialize(item) { return { name: item.name, status: item.status, goal: item.goal, lastCharCount: item.lastCharCount, items: (item.items || []).map(serialize), comments: item.comments || [] }; }
function deserialize(item) { return { name: item.name, status: item.status, goal: item.goal, lastCharCount: item.lastCharCount, items: (item.items || []).map(deserialize), comments: item.comments || [] }; }
function loadMetadata() {
    const r = localStorage.getItem('bg_meta'); if (!r) return;
    const m = JSON.parse(r);
    state.projects.forEach(p => {
        const mt = m.find(x => x.name === p.name);
        if (mt) {
            p.open = mt.open;
            syncItems(p.items, mt.items);
        }
    });
}

function syncItems(liveItems, cachedItems) {
    if (!liveItems || !cachedItems) return;

    // Pass 1: Name-based match (standard)
    liveItems.forEach(live => {
        const cached = cachedItems.find(c => c.name === live.name);
        if (cached) {
            applyMetadata(live, cached);
        }
    });

    // Pass 2: Orphan Recovery (if a rename happened)
    // We look for cached items that were NOT matched in Pass 1
    const unmatchedCached = cachedItems.filter(c => !liveItems.find(l => l.name === c.name));
    const unmatchedLive = liveItems.filter(l => !l.syncDone);

    if (unmatchedCached.length > 0 && unmatchedLive.length > 0) {
        // Simple heuristic: if there's exactly 1 unmatched on both sides, it's likely a rename
        if (unmatchedCached.length === 1 && unmatchedLive.length === 1) {
            applyMetadata(unmatchedLive[0], unmatchedCached[0]);
        }
    }
}

function applyMetadata(live, cached) {
    live.status = cached.status || 'draft';
    live.goal = cached.goal || 30000;
    live.lastCharCount = cached.lastCharCount || 0;
    live.lastUpdated = cached.lastUpdated;
    live.comments = cached.comments || [];
    live.open = cached.open;
    live.syncDone = true; // Mark as processed
    if (live.items && cached.items) {
        syncItems(live.items, cached.items);
    }
}
function loadConfig() {
    const c = localStorage.getItem('bg_config');
    if (c) {
        state.config = JSON.parse(c);
        // Validar que autosaveInterval no sea null
        if (!state.config.autosaveInterval) {
            state.config.autosaveInterval = 30;
        }
        // Asegurar que todos los estados tengan countType y goal
        state.config.states = (state.config.states || []).map(s => ({
            ...s,
            countType: s.countType || 'absolute',
            goal: s.goal || 30000
        }));
        document.getElementById('autosave-interval').value = state.config.autosaveInterval;
    }
}
function saveConfig() {
    state.config.autosaveInterval = parseInt(document.getElementById('autosave-interval').value);
    localStorage.setItem('bg_config', JSON.stringify(state.config));
    const userNameInput = document.getElementById('user-name-input');
    if (userNameInput) {
        localStorage.setItem('bg_user_name', userNameInput.value);
        applyUserIdentity();
    }
    saveWorkspaceCache();
    setupAutosave();
    notify('Configuración guardada');
}

function findItemByPath(pIdx, pathStr) {
    if (pIdx === undefined || pIdx === null) return null;
    let item = state.projects[pIdx];
    if (!item) return null;
    if (!pathStr || pathStr === "") return item;
    const parts = (pathStr + "").split(',').filter(x => x !== "").map(Number);
    for (const idx of parts) {
        if (!item.items || !item.items[idx]) return item;
        item = item.items[idx];
    }
    return item;
}

function getParentCollection(pIdx, pathStr) {
    if (!pathStr) return state.projects;
    const parts = pathStr.split(',').map(Number);
    let p = state.projects[pIdx];
    if (parts.length === 1) return p.items;
    for (let i = 0; i < parts.length - 1; i++) { p = p.items[parts[i]]; }
    return p.items;
}
async function saveHandle(h) { const db = await getDB(); const tx = db.transaction('handles', 'readwrite'); tx.objectStore('handles').put(h, 'rootHandle'); }
async function loadHandle() { const db = await getDB(); const tx = db.transaction('handles', 'readonly'); return new Promise(r => { const req = tx.objectStore('handles').get('rootHandle'); req.onsuccess = () => r(req.result); }); }
async function getDB() { return new Promise((r, j) => { const req = indexedDB.open('BlockGuardDB', 1); req.onupgradeneeded = () => req.result.createObjectStore('handles'); req.onsuccess = () => r(req.result); req.onerror = () => j(req.error); }); }

function window_showCtxManual(e, type, pIdx, path) {
    state.contextTarget = { type, pIdx, path };
    el.ctxMenu.classList.remove('hidden');
    el.ctxMenu.style.top = `${e.clientY}px`;
    el.ctxMenu.style.left = `${e.clientX}px`;
    el.ctxSidebarList.classList.remove('hidden');
}

window.showCtxManual = window_showCtxManual;

window.quickAdd = (idx) => {
    const p = state.projects[idx];
    if (p && p.items.length > 0) { window.openFileSmart(idx, "0"); }
    else { state.contextTarget = { type: 'project', pIdx: idx, path: "" }; createFileSystemItemAction(); }
};

window.updateStateColor = (i, v) => { state.config.states[i].color = v; saveConfig(); updateUI(); renderSidebar(); };
window.updateStateName = (i, v) => { state.config.states[i].name = v; saveConfig(); updateUI(); renderSidebar(); };
window.updateStateAction = (i, v) => { state.config.states[i].countType = v; saveConfig(); updateUI(); renderSidebar(); };

window.removeState = async (i) => {
    const ok = await confirmCustom('Eliminar Estado', '¿Estás seguro de eliminar este estado?', 'Eliminar');
    if (ok) {
        state.config.states.splice(i, 1);
        saveConfig();
        renderStateConfig();
        updateUI();
        renderSidebar();
    }
};
window.moveStateUp = (i) => { if (i <= 0) return; const item = state.config.states.splice(i, 1)[0]; state.config.states.splice(i - 1, 0, item); saveConfig(); renderStateConfig(); updateUI(); renderSidebar(); };
window.moveStateDown = (i) => { if (i >= state.config.states.length - 1) return; const item = state.config.states.splice(i, 1)[0]; state.config.states.splice(i + 1, 0, item); saveConfig(); renderStateConfig(); updateUI(); renderSidebar(); };

async function renameItem() {
    const t = state.contextTarget;
    const item = findItemByPath(t.pIdx, t.path);
    if (!item) return;

    const n = await promptCustom('Nuevo nombre:', item.name);
    if (!n) return;

    // Preserve .txt if it's a file but not if it's a folder/project
    const isFolder = item.items && item.items.length > 0;
    const newName = n.endsWith('.txt') || isFolder ? n : n + '.txt';

    try {
        // ROBUST RENAME
        const oldName = item.name;
        if (item.handle && item.handle.move) {
            await item.handle.move(newName);
        }

        item.name = newName;

        // Immediate Metadata Sync
        const meta = localStorage.getItem('bg_meta');
        if (meta) {
            // If it's a project (t.path === ""), we need special handling
            // but the findItemByPath handles nested structures too.
            saveMetadata();
        }

        renderSidebar();

        // Update header and UI if renaming the current file
        if (state.activeFile === item) {
            updateUI();
        }

        notify('Nombre actualizado correctamente');
    } catch (err) {
        console.error('Rename failed:', err);
        notify('No se pudo renombrar el archivo', 'error');
    }
}

window.promptCustom = (title, placeholder = "") => {
    return new Promise(resolve => {
        document.getElementById('input-modal-title').innerText = title;
        const field = document.getElementById('custom-input-field');
        field.value = placeholder;
        document.getElementById('input-modal').classList.add('open');
        state.modalResolver = resolve;
        setTimeout(() => field.focus(), 100);
    });
};

window.closeInputModal = () => {
    document.getElementById('input-modal').classList.remove('open');
    if (state.modalResolver) state.modalResolver(null);
    state.modalResolver = null;
};

function upgradeStatusAction() {
    const item = state.activeFile || findItemByPath(state.contextTarget?.pIdx, state.contextTarget?.path);
    if (!item) return;
    const cur = state.config.states.findIndex(s => s.id === item.status);
    if (cur === state.config.states.length - 1) {
        item.status = state.config.states[0].id;
        notify('Estado reiniciado');
    } else {
        item.status = state.config.states[cur + 1].id;
    }
    updateUI(); renderSidebar(); saveMetadata();
}

async function deleteItemSmart() {
    const t = state.contextTarget;
    const item = findItemByPath(t.pIdx, t.path);
    if (!item) return;

    const isFolder = t.type === 'project' || (item.items && item.items.length > 0);
    const msg = isFolder ? `¿Enviar "${item.name}" a la papelera?` : `¿Eliminar "${item.name}"?`;
    const ok = await confirmCustom('Eliminar', msg, 'Borrar');
    if (!ok) return;

    try {
        // Silent/Trash: In a real desktop app we'd move to Trash. 
        // In Web Picker, we just delete the handle.
        if (item.handle && item.handle.remove) {
            await item.handle.remove({ recursive: true });
        } else if (t.type === 'project') {
            await state.workspaceHandle.getDirectoryHandle('data', { create: false }).then(d => d.removeEntry(item.name, { recursive: true }));
        }

        const col = getParentCollection(t.pIdx, t.path);
        const idx = t.type === 'project' ? t.pIdx : getIndexFromPath(t.path);
        col.splice(idx, 1);

        if (state.activeFile === item) window.closeFile();
        renderSidebar(); saveMetadata(); updateUI();
        notify('Elemento eliminado');
    } catch (err) {
        console.error(err);
        notify('Error al eliminar', 'error');
    }
}

function getIndexFromPath(path) { if (!path) return 0; const parts = path.split(',').map(Number); return parts[parts.length - 1]; }

window.confirmCustom = (title, text, confirmLabel = 'Confirmar') => {
    return new Promise(resolve => {
        document.getElementById('confirm-modal-title').innerText = title;
        document.getElementById('confirm-modal-text').innerText = text;
        const btn = document.getElementById('confirm-modal-yes');
        btn.innerText = confirmLabel;
        document.getElementById('confirm-modal').classList.add('open');
        state.confirmResolver = resolve;
        btn.onclick = () => window.closeConfirmModal(true);
    });
};

window.closeConfirmModal = (val) => {
    document.getElementById('confirm-modal').classList.remove('open');
    if (state.confirmResolver) state.confirmResolver(val);
    state.confirmResolver = null;
};

function renderExplorerHierarchy(items, pIdx, parentPath) {
    if (!items) return '';
    return items.map((item, idx) => {
        const currentPath = parentPath === "" ? `${idx}` : `${parentPath},${idx}`;
        const st = state.config.states.find(s => s.id === item.status) || state.config.states[0];
        const p = Math.min((item.lastCharCount / (item.goal || 30000)) * 100, 100);
        const off = 56.5 - (56.5 * p / 100);
        const hasChildren = item.items && item.items.length > 0;

        return `
            <div class="explorer-hierarchy-item" style="margin-left: ${parentPath === "" ? 0 : 20}px">
                <div class="explorer-list-item" onclick="window.openFileSmart(${pIdx}, '${currentPath}')">
                    <span class="folder-icons-wrapper">
                        <svg class="circle-progress" viewBox="0 0 24 24">
                            <circle class="bg" cx="12" cy="12" r="9"></circle>
                            <circle class="fg" cx="12" cy="12" r="9" style="stroke: ${st.color}; stroke-dashoffset: ${off}"></circle>
                        </svg>
                    </span>
                    <span class="text-content">${item.name}</span>
                </div>
                ${hasChildren ? `<div class="explorer-children">${renderExplorerHierarchy(item.items, pIdx, currentPath)}</div>` : ''}
            </div>
        `;
    }).join('');
}

window.exploreFolder = (pIdx, path) => {
    const item = findItemByPath(pIdx, path);
    if (!item) return;
    state.activeFile = null;
    state.exploringFolder = { pIdx, path, name: item.name, items: item.items || [] };

    // Update breadcrumb real-time even when exploring
    const projName = state.projects[pIdx]?.name || 'Proyecto';
    el.breadcrumb.innerHTML = `
        <span onclick="window.closeFile()"><i class="fas fa-home"></i> Inicio</span> 
        <i class="fas fa-chevron-right" style="font-size:0.7rem; opacity:0.5"></i> 
        <span class="active"><i class="fas fa-folder"></i> ${item.name}</span>
    `;

    updateUI();
};

function toggleSpellCheck() {
    if (!state.activeFile) return;
    if (localStorage.getItem('bg_spell_warned')) performSpellCheckRedirect();
    else {
        confirmCustom('Corrector Ortográfico', 'Abriremos una herramienta externa para que pegues tu texto y lo revises. ¿Deseas continuar?', 'Continuar').then(ok => {
            if (ok) {
                localStorage.setItem('bg_spell_warned', 'true');
                performSpellCheckRedirect();
            }
        });
    }
}

function performSpellCheckRedirect() {
    navigator.clipboard.writeText(el.editor.innerText).then(() => {
        notify('Texto copiado. Abriendo corrector...');
        window.open('https://www.correctoronline.es/', '_blank');
    }).catch(() => window.open('https://www.correctoronline.es/', '_blank'));
}

function updateWelcomeRecent() {
    const allFiles = [];
    state.projects.forEach((p, pIdx) => {
        const flatten = (items) => {
            items.forEach(it => {
                allFiles.push({ ...it, pIdx });
                if (it.items) flatten(it.items);
            });
        };
        flatten(p.items);
    });

    // Sort by lastUpdated (newest first)
    allFiles.sort((a, b) => new Date(b.lastUpdated || 0) - new Date(a.lastUpdated || 0));

    const recent = allFiles.slice(0, 4);
    const grid = document.getElementById('recent-projects');
    if (!grid) return;

    grid.innerHTML = recent.map(f => {
        const path = getPathFromItem(f);
        return `
        <div class="recent-card" onclick="window.openFileSmart(${f.pIdx}, '${path}')">
            <i class="fas fa-file-alt"></i>
            <div class="recent-card-info">
                <h4>${f.name.replace('.txt', '')}</h4>
                <span>${state.projects[f.pIdx].name}</span>
            </div>
        </div>`;
    }).join('');
}

function renderStateConfig() {
    const list = document.getElementById('states-config-list');
    if (!list) return;
    list.innerHTML = state.config.states.map((s, i) => `
    <div class="state-config-item">
        <div class="state-reorder-actions">
            <i class="fas fa-chevron-up ${i === 0 ? 'hidden' : ''}" onclick="window.moveStateUp(${i})"></i>
            <i class="fas fa-chevron-down ${i === state.config.states.length - 1 ? 'hidden' : ''}" onclick="window.moveStateDown(${i})"></i>
        </div>
        <input type="color" value="${s.color}" onchange="window.updateStateColor(${i}, this.value)" title="Color del estado">
        <div class="state-info-edit">
            <span class="state-name-display">${s.name}</span>
            <select onchange="window.updateStateAction(${i}, this.value)">
                <option value="absolute" ${s.countType === 'absolute' ? 'selected' : ''}>Contar Totales</option>
                <option value="edited" ${s.countType === 'edited' ? 'selected' : ''}>Contar Ediciones</option>
                <option value="delta" ${s.countType === 'delta' ? 'selected' : ''}>Contar Nuevos</option>
            </select>
        </div>
        <div class="state-item-actions">
            <button class="btn-icon-small" onclick="window.editStateName(${i})" title="Editar nombre"><i class="fas fa-pen"></i></button>
            <button class="btn-icon-small danger" onclick="window.removeState(${i})" title="Eliminar"><i class="fas fa-trash"></i></button>
        </div>
    </div>`).join('');
}

window.editStateName = async (index) => {
    const s = state.config.states[index];
    const newName = await promptCustom('Nombre del estado:', s.name);
    if (newName) {
        s.name = newName;
        renderStateConfig();
    }
};

function updateActiveFileProgress() {
    const activeItem = document.querySelector('.sub-nav-item.active');
    if (activeItem && state.activeFile) {
        const pct = Math.min((state.activeFile.lastCharCount / (state.activeFile.goal || 30000)) * 100, 100);
        const circle = activeItem.querySelector('circle.fg');
        if (circle) circle.style.strokeDashoffset = 56.5 - (56.5 * pct / 100);
    }
}

// --- ATTACH ALL FUNCTIONS TO WINDOW (must be after function definitions) ---
window.createProjectAction = createProjectAction;
window.selectWorkspace = selectWorkspace;
window.createFileSystemItemAction = createFileSystemItemAction;
window.renameItem = renameItem;
window.deleteItemSmart = deleteItemSmart;
window.upgradeStatusAction = upgradeStatusAction;
window.openFileSmart = openFileSmart;
window.closeFile = closeFile;
window.exploreFolder = exploreFolder;
window.requestWorkspacePermission = requestWorkspacePermission;
window.promptCustom = promptCustom;
window.closeInputModal = closeInputModal;
window.confirmCustom = confirmCustom;
window.closeConfirmModal = closeConfirmModal;

init();
