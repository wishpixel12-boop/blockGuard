/**
 * Block Guard - Versión 3.1 (Corregida)
 * - Sistema de guardado mejorado
 * - Icono de comentario funcional
 * - Selección de línea con background
 * - Botones del sidebar funcionando
 * - Drag & Drop corregido
 * - Menú contextual con texto correcto
 * - Breadcrumbs dinámicos funcionando
 * - Tiempo de gracia antes de cambiar archivo
 */

// ============================================
// CONFIGURACIÓN Y ESTADO GLOBAL
// ============================================

const state = {
    workspaceHandle: null,
    projects: [],
    activeFile: null,
    activeParagraphIndex: undefined,
    exploringFolder: null,
    config: {
        states: [
            { id: 'draft', name: 'Primer Borrador', color: '#ff3b30', goal: 30000, countType: 'absolute' },
            { id: 'review', name: 'En Revisión', color: '#ff9500', goal: 15000, countType: 'edited' },
            { id: 'final', name: 'Últimos Retoques', color: '#34c759', goal: 5000, countType: 'delta' }
        ],
        autosaveInterval: 30,
        defaultGoal: 30000,
        theme: 'dark',
        customTheme: null,
        shortcuts: {
            save: { key: 's', ctrl: true, shift: false, alt: false },
            selectAll: { key: 'a', ctrl: true, shift: false, alt: false },
            bold: { key: 'b', ctrl: true, shift: false, alt: false },
            italic: { key: 'i', ctrl: true, shift: false, alt: false },
            underline: { key: 'u', ctrl: true, shift: false, alt: false },
            find: { key: 'f', ctrl: true, shift: false, alt: false },
            newFile: { key: 'n', ctrl: true, shift: false, alt: false },
            closeFile: { key: 'w', ctrl: true, shift: false, alt: false },
            comment: { key: '/', ctrl: true, shift: false, alt: false },
            heading: { key: 'h', ctrl: true, shift: false, alt: false }
        }
    },
    sidebarCollapsed: false,
    contextTarget: null,
    autosaveTimer: null,
    modalResolver: null,
    confirmResolver: null,
    avatarCrop: {
        image: null,
        ratio: 1,
        startX: 0,
        startY: 0,
        isDragging: false
    },
    activeProjectIndex: undefined,
    textContextMenuVisible: false,
    textSelectionRange: null,
    hoverTimeout: null,
    dragState: {
        isDragging: false,
        draggedItem: null,
        draggedPath: null,
        draggedPIdx: null,
        dropTarget: null
    },
    recordingShortcut: null,
    isSaving: false
};

// Elementos del DOM
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
    statusBar: document.getElementById('status-bar'),
    avatarContainer: document.getElementById('avatar-container'),
    userAvatar: document.getElementById('user-avatar'),
    userAvatarPlaceholder: document.getElementById('user-avatar-placeholder'),
    textContextMenu: null,
    paraToolbar: null,
    formattingToolbar: null
};

// ============================================
// INICIALIZACIÓN
// ============================================

async function init() {
    console.log('[Block Guard] Inicializando aplicación v3.1...');
    console.time('Initialization');

    // Referencias
    el.paraToolbar = document.getElementById('para-toolbar');

    // 1. Crear toolbar de formato
    createFormattingToolbar();

    // 2. Cargar configuración
    loadConfig();
    console.log('[Block Guard] Configuración cargada');

    // 3. Aplicar tema
    applyTheme(state.config.theme || 'dark');

    // 4. Cargar avatar
    loadAvatar();

    // 5. Configurar eventos
    setupEventListeners();
    setupSidebarHover();
    setupTextFormatting();
    setupKeyboardShortcuts();
    setupTabs();
    setupAutosave();

    // 6. Aplicar identidad
    applyUserIdentity();

    // 7. Restaurar proyectos
    const savedMeta = localStorage.getItem('bg_meta');
    if (savedMeta) {
        try {
            state.projectsJSON = JSON.parse(savedMeta);
        } catch (e) {
            console.warn('[Block Guard] Error al parsear metadatos:', e);
        }
    }

    // 8. Intentar cargar workspace
    try {
        const handle = await loadHandle();
        if (handle) {
            state.workspaceHandle = handle;
            console.log(`[Block Guard] Workspace: ${handle.name}`);

            await restoreFromJSONCache();

            const permission = await handle.queryPermission({ mode: 'readwrite' });
            if (permission === 'granted') {
                document.body.classList.remove('no-workspace');
                await scanWorkspace();
                renderSidebar();
                autoOpenFile();
            } else {
                showReconnectUI();
            }
        } else {
            document.body.classList.add('no-workspace');
            document.getElementById('welcome-message').innerText = 'Conecta una carpeta local para empezar.';
        }
    } catch (err) {
        console.error('[Block Guard] Error crítico:', err);
        document.body.classList.add('no-workspace');
        notify('Error al inicializar', 'error');
    }

    updateUI();
    console.timeEnd('Initialization');
}

// ============================================
// TOOLBAR DE FORMATO
// ============================================

function createFormattingToolbar() {
    const toolbar = document.createElement('div');
    toolbar.id = 'formatting-toolbar';
    toolbar.className = 'formatting-toolbar hidden';
    toolbar.innerHTML = `
        <div class="format-group">
            <button class="format-btn" data-action="bold" title="Negrita (Ctrl+B)">
                <i class="fas fa-bold"></i>
            </button>
            <button class="format-btn" data-action="italic" title="Cursiva (Ctrl+I)">
                <i class="fas fa-italic"></i>
            </button>
            <button class="format-btn" data-action="underline" title="Subrayado (Ctrl+U)">
                <i class="fas fa-underline"></i>
            </button>
            <button class="format-btn" data-action="strikethrough" title="Tachado">
                <i class="fas fa-strikethrough"></i>
            </button>
        </div>
        <div class="format-group">
            <button class="format-btn" data-action="h1" title="Encabezado 1">
                <i class="fas fa-heading"></i><span style="font-size:0.6em">1</span>
            </button>
            <button class="format-btn" data-action="h2" title="Encabezado 2">
                <i class="fas fa-heading"></i><span style="font-size:0.6em">2</span>
            </button>
        </div>
        <div class="format-group">
            <button class="format-btn" data-action="quote" title="Cita">
                <i class="fas fa-quote-right"></i>
            </button>
            <button class="format-btn" data-action="code" title="Código">
                <i class="fas fa-code"></i>
            </button>
            <button class="format-btn" data-action="mark" title="Marcar">
                <i class="fas fa-highlighter"></i>
            </button>
        </div>
        <div class="format-group">
            <div class="color-picker-wrapper">
                <button class="format-btn color-picker-btn" data-action="color" title="Color de texto" style="color: var(--text-primary)">
                    <i class="fas fa-font"></i>
                </button>
                <div class="color-picker-popup" id="text-color-picker">
                    <div class="color-presets">
                        <div class="color-preset" style="background: #f5f5f7" data-color="#f5f5f7"></div>
                        <div class="color-preset" style="background: #ff3b30" data-color="#ff3b30"></div>
                        <div class="color-preset" style="background: #ff9500" data-color="#ff9500"></div>
                        <div class="color-preset" style="background: #ffcc00" data-color="#ffcc00"></div>
                        <div class="color-preset" style="background: #34c759" data-color="#34c759"></div>
                        <div class="color-preset" style="background: #0071e3" data-color="#0071e3"></div>
                        <div class="color-preset" style="background: #5856d6" data-color="#5856d6"></div>
                        <div class="color-preset" style="background: #af52de" data-color="#af52de"></div>
                    </div>
                    <div class="color-custom">
                        <input type="color" id="custom-text-color" value="#f5f5f7">
                        <input type="text" id="custom-text-color-hex" value="#f5f5f7" placeholder="#000000">
                    </div>
                </div>
            </div>
        </div>
        <div class="format-group">
            <button class="format-btn" data-action="align-left" title="Alinear izquierda">
                <i class="fas fa-align-left"></i>
            </button>
            <button class="format-btn" data-action="align-center" title="Centrar">
                <i class="fas fa-align-center"></i>
            </button>
            <button class="format-btn" data-action="align-right" title="Alinear derecha">
                <i class="fas fa-align-right"></i>
            </button>
        </div>
        <div class="format-group">
            <button class="format-btn" data-action="comment" title="Comentario (Ctrl+/)">
                <i class="fas fa-comment"></i>
            </button>
        </div>
    `;
    document.body.appendChild(toolbar);
    el.formattingToolbar = toolbar;

    // Event listeners para botones de formato
    toolbar.querySelectorAll('.format-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = btn.getAttribute('data-action');
            if (action === 'color') {
                toggleColorPicker();
            } else {
                executeFormatAction(action);
            }
        });
    });

    // Color presets
    toolbar.querySelectorAll('.color-preset').forEach(preset => {
        preset.addEventListener('click', (e) => {
            e.stopPropagation();
            const color = preset.getAttribute('data-color');
            applyTextColor(color);
            hideColorPicker();
        });
    });

    // Custom color picker
    const customColorInput = document.getElementById('custom-text-color');
    const customColorHex = document.getElementById('custom-text-color-hex');

    if (customColorInput) {
        customColorInput.addEventListener('input', (e) => {
            customColorHex.value = e.target.value;
        });
        customColorInput.addEventListener('change', (e) => {
            applyTextColor(e.target.value);
            hideColorPicker();
        });
    }

    if (customColorHex) {
        customColorHex.addEventListener('input', (e) => {
            if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                customColorInput.value = e.target.value;
            }
        });
        customColorHex.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                    applyTextColor(e.target.value);
                    hideColorPicker();
                }
            }
        });
    }

    // Cerrar color picker al hacer click fuera
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.color-picker-wrapper')) {
            hideColorPicker();
        }
    });
}

function toggleColorPicker() {
    const picker = document.getElementById('text-color-picker');
    if (picker) {
        picker.classList.toggle('visible');
    }
}

function hideColorPicker() {
    const picker = document.getElementById('text-color-picker');
    if (picker) {
        picker.classList.remove('visible');
    }
}

function applyTextColor(color) {
    document.execCommand('foreColor', false, color);
    updateStats();
    saveFileContent(false);
}

function executeFormatAction(action) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    switch (action) {
        case 'bold':
            document.execCommand('bold', false, null);
            break;
        case 'italic':
            document.execCommand('italic', false, null);
            break;
        case 'underline':
            document.execCommand('underline', false, null);
            break;
        case 'strikethrough':
            document.execCommand('strikeThrough', false, null);
            break;
        case 'h1':
            toggleHeading('h1');
            break;
        case 'h2':
            toggleHeading('h2');
            break;
        case 'h3':
            toggleHeading('h3');
            break;
        case 'quote':
            document.execCommand('formatBlock', false, 'blockquote');
            break;
        case 'code':
            wrapSelectionInTag('code');
            break;
        case 'mark':
            wrapSelectionInTag('mark');
            break;
        case 'align-left':
            document.execCommand('justifyLeft', false, null);
            break;
        case 'align-center':
            document.execCommand('justifyCenter', false, null);
            break;
        case 'align-right':
            document.execCommand('justifyRight', false, null);
            break;
        case 'comment':
            addCommentToSelection();
            break;
    }

    updateFormattingToolbarState();
    updateStats();
    saveFileContent(false);
}

function toggleHeading(tag) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const node = selection.anchorNode.parentElement;
    if (node.tagName.toLowerCase() === tag) {
        document.execCommand('formatBlock', false, 'p');
    } else {
        document.execCommand('formatBlock', false, tag);
    }
}

function wrapSelectionInTag(tag) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    const selectedText = range.toString();

    if (selectedText) {
        const element = document.createElement(tag);
        element.textContent = selectedText;
        range.deleteContents();
        range.insertNode(element);

        const newRange = document.createRange();
        newRange.selectNodeContents(element);
        selection.removeAllRanges();
        selection.addRange(newRange);
    }
}

function addCommentToSelection() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    const block = range.startContainer.parentElement.closest('p, h1, h2, h3, blockquote');

    if (block && state.activeFile) {
        const paragraphs = Array.from(el.editor.querySelectorAll('p, h1, h2, h3, blockquote'));
        state.activeParagraphIndex = paragraphs.indexOf(block);

        const side = document.getElementById('comments-sidebar');
        const over = document.getElementById('comments-overlay');
        if (side) side.classList.remove('hidden');
        if (over) over.classList.remove('hidden');
        renderComments();
    }
}

// ============================================
// FORMATO DE TEXTO Y TOOLBAR
// ============================================

function setupTextFormatting() {
    el.editor.addEventListener('mouseup', handleTextSelection);
    el.editor.addEventListener('keyup', (e) => {
        if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete' ||
            e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            setTimeout(() => {
                handleTextSelection();
                updateFormattingToolbarState();
            }, 10);
        }
    });

    el.editor.addEventListener('click', () => {
        setTimeout(updateFormattingToolbarState, 10);
    });
}

function handleTextSelection() {
    const selection = window.getSelection();
    const text = selection.toString().trim();

    if (text.length > 0 && el.editor.contains(selection.anchorNode)) {
        showFormattingToolbar();
    } else {
        hideFormattingToolbar();
    }
}

function showFormattingToolbar() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    const toolbarWidth = el.formattingToolbar.offsetWidth || 400;
    const toolbarHeight = 50;

    let left = rect.left + (rect.width / 2) - (toolbarWidth / 2);
    let top = rect.top - toolbarHeight - 10;

    const padding = 10;
    left = Math.max(padding, Math.min(left, window.innerWidth - toolbarWidth - padding));

    if (top < padding) {
        top = rect.bottom + 10;
    }

    el.formattingToolbar.style.left = `${left}px`;
    el.formattingToolbar.style.top = `${top}px`;
    el.formattingToolbar.classList.remove('hidden');

    updateFormattingToolbarState();
}

function hideFormattingToolbar() {
    if (el.formattingToolbar) {
        el.formattingToolbar.classList.add('hidden');
    }
    hideColorPicker();
}

function updateFormattingToolbarState() {
    const buttons = el.formattingToolbar.querySelectorAll('.format-btn');

    buttons.forEach(btn => {
        const action = btn.getAttribute('data-action');
        let isActive = false;

        switch (action) {
            case 'bold':
                isActive = document.queryCommandState('bold');
                break;
            case 'italic':
                isActive = document.queryCommandState('italic');
                break;
            case 'underline':
                isActive = document.queryCommandState('underline');
                break;
            case 'strikethrough':
                isActive = document.queryCommandState('strikeThrough');
                break;
            case 'align-left':
                isActive = document.queryCommandState('justifyLeft');
                break;
            case 'align-center':
                isActive = document.queryCommandState('justifyCenter');
                break;
            case 'align-right':
                isActive = document.queryCommandState('justifyRight');
                break;
        }

        btn.classList.toggle('active', isActive);
    });
}

// ============================================
// ATAJOS DE TECLADO CONFIGURABLES
// ============================================

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            if (e.key === 'Escape' && state.recordingShortcut) {
                cancelShortcutRecording();
            }
            return;
        }

        const shortcuts = state.config.shortcuts;

        for (const [action, shortcut] of Object.entries(shortcuts)) {
            if (matchesShortcut(e, shortcut)) {
                e.preventDefault();
                executeShortcutAction(action);
                return;
            }
        }

        if (e.key === 'Escape') {
            hideFormattingToolbar();
            hideColorPicker();
        }
    });
}

function matchesShortcut(e, shortcut) {
    return e.key.toLowerCase() === shortcut.key.toLowerCase() &&
        e.ctrlKey === shortcut.ctrl &&
        e.shiftKey === shortcut.shift &&
        e.altKey === shortcut.alt;
}

function executeShortcutAction(action) {
    switch (action) {
        case 'save':
            saveFileContent(true);
            notify('Guardado');
            break;
        case 'selectAll':
            selectAllContent();
            break;
        case 'bold':
            executeFormatAction('bold');
            break;
        case 'italic':
            executeFormatAction('italic');
            break;
        case 'underline':
            executeFormatAction('underline');
            break;
        case 'find':
            break;
        case 'newFile':
            if (state.activeProjectIndex !== undefined) {
                state.contextTarget = { type: 'project', pIdx: state.activeProjectIndex, path: '' };
                createFileSystemItemAction();
            }
            break;
        case 'closeFile':
            window.closeFile();
            break;
        case 'comment':
            executeFormatAction('comment');
            break;
        case 'heading':
            executeFormatAction('h1');
            break;
    }
}

function selectAllContent() {
    const contentElements = el.editor.querySelectorAll('p, h1, h2, h3, blockquote, ul, ol');
    if (contentElements.length === 0) return;

    const selection = window.getSelection();
    const range = document.createRange();

    range.setStartBefore(contentElements[0]);
    range.setEndAfter(contentElements[contentElements.length - 1]);

    selection.removeAllRanges();
    selection.addRange(range);

    showFormattingToolbar();
}

// ============================================
// CONFIGURACIÓN DE ATAJOS EN SETTINGS
// ============================================

function renderShortcutsConfig() {
    const container = document.getElementById('shortcuts-config-list');
    if (!container) return;

    const shortcutLabels = {
        save: { name: 'Guardar', desc: 'Guardar el archivo actual' },
        selectAll: { name: 'Seleccionar todo', desc: 'Seleccionar todo el contenido' },
        bold: { name: 'Negrita', desc: 'Aplicar formato negrita' },
        italic: { name: 'Cursiva', desc: 'Aplicar formato cursiva' },
        underline: { name: 'Subrayado', desc: 'Aplicar formato subrayado' },
        find: { name: 'Buscar', desc: 'Buscar en el documento' },
        newFile: { name: 'Nuevo archivo', desc: 'Crear un nuevo archivo' },
        closeFile: { name: 'Cerrar archivo', desc: 'Cerrar el archivo actual' },
        comment: { name: 'Comentario', desc: 'Añadir un comentario' },
        heading: { name: 'Encabezado', desc: 'Convertir a encabezado' }
    };

    container.innerHTML = Object.entries(state.config.shortcuts).map(([action, shortcut]) => {
        const label = shortcutLabels[action] || { name: action, desc: '' };
        return `
            <div class="shortcut-item" data-action="${action}">
                <div class="shortcut-info">
                    <span class="shortcut-name">${label.name}</span>
                    <span class="shortcut-desc">${label.desc}</span>
                </div>
                <div class="shortcut-keys">
                    <div class="key-combo" onclick="startRecordingShortcut('${action}')">
                        ${formatShortcut(shortcut)}
                    </div>
                </div>
                <div class="shortcut-actions">
                    <button onclick="resetShortcut('${action}')" class="reset" title="Restaurar por defecto">
                        <i class="fas fa-undo"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function formatShortcut(shortcut) {
    const parts = [];
    if (shortcut.ctrl) parts.push('<span class="key">Ctrl</span>');
    if (shortcut.alt) parts.push('<span class="key">Alt</span>');
    if (shortcut.shift) parts.push('<span class="key">Shift</span>');
    parts.push(`<span class="key">${shortcut.key.toUpperCase()}</span>`);
    return parts.join('<span class="key-plus">+</span>');
}

function startRecordingShortcut(action) {
    state.recordingShortcut = action;

    const combo = document.querySelector(`.shortcut-item[data-action="${action}"] .key-combo`);
    if (combo) {
        combo.classList.add('recording');
        combo.innerHTML = '<span>Presiona teclas...</span>';
    }

    notify('Presiona la combinación de teclas deseada');

    const handler = (e) => {
        e.preventDefault();

        if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;

        state.config.shortcuts[action] = {
            key: e.key.toLowerCase(),
            ctrl: e.ctrlKey,
            alt: e.altKey,
            shift: e.shiftKey
        };

        cancelShortcutRecording();
        renderShortcutsConfig();
        saveConfig();
        notify('Atajo actualizado');

        document.removeEventListener('keydown', handler);
    };

    document.addEventListener('keydown', handler);

    const escapeHandler = (e) => {
        if (e.key === 'Escape') {
            cancelShortcutRecording();
            document.removeEventListener('keydown', handler);
            document.removeEventListener('keydown', escapeHandler);
        }
    };
    document.addEventListener('keydown', escapeHandler);
}

function cancelShortcutRecording() {
    if (state.recordingShortcut) {
        renderShortcutsConfig();
        state.recordingShortcut = null;
    }
}

function resetShortcut(action) {
    const defaults = {
        save: { key: 's', ctrl: true, shift: false, alt: false },
        selectAll: { key: 'a', ctrl: true, shift: false, alt: false },
        bold: { key: 'b', ctrl: true, shift: false, alt: false },
        italic: { key: 'i', ctrl: true, shift: false, alt: false },
        underline: { key: 'u', ctrl: true, shift: false, alt: false },
        find: { key: 'f', ctrl: true, shift: false, alt: false },
        newFile: { key: 'n', ctrl: true, shift: false, alt: false },
        closeFile: { key: 'w', ctrl: true, shift: false, alt: false },
        comment: { key: '/', ctrl: true, shift: false, alt: false },
        heading: { key: 'h', ctrl: true, shift: false, alt: false }
    };

    if (defaults[action]) {
        state.config.shortcuts[action] = { ...defaults[action] };
        renderShortcutsConfig();
        saveConfig();
        notify('Atajo restaurado');
    }
}


// ============================================
// DRAG & DROP PARA REORGANIZAR ARCHIVOS
// ============================================

function makeItemDraggable(element, pIdx, path, type) {
    element.draggable = true;

    element.addEventListener('dragstart', (e) => {
        state.dragState.isDragging = true;
        state.dragState.draggedItem = findItemByPath(pIdx, path);
        state.dragState.draggedPath = path;
        state.dragState.draggedPIdx = pIdx;
        state.dragState.draggedType = type;

        element.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', JSON.stringify({ pIdx, path, type }));
    });

    element.addEventListener('dragend', (e) => {
        element.classList.remove('dragging');

        document.querySelectorAll('.drag-over, .drag-over-top, .drag-over-bottom').forEach(el => {
            el.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
        });

        state.dragState.isDragging = false;
        state.dragState.draggedItem = null;
        state.dragState.draggedPath = null;
        state.dragState.draggedPIdx = null;
        state.dragState.draggedType = null;
    });
}

function makeItemDroppable(element, pIdx, path, type) {
    element.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        if (!state.dragState.isDragging) return;

        const rect = element.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;

        element.classList.remove('drag-over-top', 'drag-over-bottom');

        if (e.clientY < midY) {
            element.classList.add('drag-over-top');
        } else {
            element.classList.add('drag-over-bottom');
        }
    });

    element.addEventListener('dragleave', (e) => {
        element.classList.remove('drag-over-top', 'drag-over-bottom');
    });

    element.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        element.classList.remove('drag-over-top', 'drag-over-bottom');

        if (!state.dragState.isDragging || !state.dragState.draggedItem) return;

        const targetItem = findItemByPath(pIdx, path);
        if (!targetItem) return;

        if (state.dragState.draggedItem === targetItem) return;
        if (isDescendant(state.dragState.draggedItem, targetItem)) return;

        const rect = element.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const dropPosition = e.clientY < midY ? 'before' : 'after';

        await performDragDrop(targetItem, pIdx, path, type, dropPosition);
    });
}

function isDescendant(parent, child) {
    if (!parent.items || parent.items.length === 0) return false;

    for (const item of parent.items) {
        if (item === child) return true;
        if (isDescendant(item, child)) return true;
    }
    return false;
}

/**
 * Mueve un archivo o directorio físicamente.
 */
async function physicalFileMove(fileItem, newParentDirHandle) {
    const oldHandle = fileItem.handle;
    const fileName = fileItem.name;
    const oldParentDir = fileItem.parentDirHandle;

    try {
        // 1. Mover el archivo .txt
        const newFileHandle = await newParentDirHandle.getFileHandle(fileName, { create: true });
        const oldFile = await oldHandle.getFile();
        const writable = await newFileHandle.createWritable();
        await writable.write(await oldFile.arrayBuffer());
        await writable.close();

        // 2. Mover la carpeta de hijos (sub_...) si existe
        const subDirName = 'sub_' + fileName.replace('.txt', '');
        let oldSubDir;
        try {
            oldSubDir = await oldParentDir.getDirectoryHandle(subDirName);
        } catch (e) {
            // No hay sub-carpeta, ignorar
        }

        if (oldSubDir) {
            const newSubDir = await newParentDirHandle.getDirectoryHandle(subDirName, { create: true });
            await copyDirRecursive(oldSubDir, newSubDir);
            // Intentar borrar carpeta vieja
            await oldParentDir.removeEntry(subDirName, { recursive: true });
        }

        // 3. Borrar archivo viejo
        await oldParentDir.removeEntry(fileName);

        // 4. Actualizar referencias en el item
        fileItem.handle = newFileHandle;
        fileItem.parentDirHandle = newParentDirHandle;

        return true;
    } catch (err) {
        console.error('Error moviendo archivo físicamente:', err);
        throw err;
    }
}

async function copyDirRecursive(srcHandle, destHandle) {
    for await (const entry of srcHandle.values()) {
        if (entry.kind === 'file') {
            const srcFile = await entry.getFile();
            const destFileHandle = await destHandle.getFileHandle(entry.name, { create: true });
            const writable = await destFileHandle.createWritable();
            await writable.write(await srcFile.arrayBuffer());
            await writable.close();
        } else if (entry.kind === 'directory') {
            const newDestHandle = await destHandle.getDirectoryHandle(entry.name, { create: true });
            await copyDirRecursive(entry, newDestHandle);
        }
    }
}


async function performDragDrop(targetItem, targetPIdx, targetPath, targetType, position) {
    const draggedItem = state.dragState.draggedItem;
    const draggedPIdx = state.dragState.draggedPIdx;
    const draggedPath = state.dragState.draggedPath;

    try {
        const sourceCollection = getParentCollection(draggedPIdx, draggedPath);
        const sourceIndex = getIndexFromPath(draggedPath);

        sourceCollection.splice(sourceIndex, 1);

        let targetCollection;
        let targetIndex;

        if (targetType === 'project') {
            targetCollection = targetItem.items;
            targetIndex = position === 'before' ? 0 : targetCollection.length;
        } else {
            const parentCollection = getParentCollection(targetPIdx, targetPath);
            const itemIndex = getIndexFromPath(targetPath);

            if (position === 'before') {
                targetCollection = parentCollection;
                targetIndex = itemIndex;
            } else {
                // REGLA: No permitir hijos de hijos (solo 1 nivel de profundidad)
                // Si el item ya es un hijo de proyecto, no puede tener hijos propios
                const isTargetAtRoot = !targetPath.includes(',');

                if (isTargetAtRoot && targetItem.items) {
                    targetCollection = targetItem.items;
                    targetIndex = targetItem.items.length;
                    targetItem.open = true;
                } else {
                    targetCollection = parentCollection;
                    targetIndex = itemIndex + 1;
                }
            }
        }

        targetCollection.splice(targetIndex, 0, draggedItem);

        // --- SINCRONIZACIÓN FÍSICA ---
        let targetDirHandle;
        if (targetType === 'project') {
            targetDirHandle = targetItem.handle;
        } else {
            // Si el drop es sobre un archivo o entre ellos
            if (position === 'before') {
                targetDirHandle = targetItem.parentDirHandle;
            } else {
                const isTargetAtRoot = !targetPath.includes(',');
                if (isTargetAtRoot) {
                    // Si se suelta sobre un archivo raíz para meterlo como hijo
                    const subDirName = 'sub_' + targetItem.name.replace('.txt', '');
                    targetDirHandle = await targetItem.parentDirHandle.getDirectoryHandle(subDirName, { create: true });
                } else {
                    // Si se suelta entre otros hijos
                    targetDirHandle = targetItem.parentDirHandle;
                }
            }
        }

        await physicalFileMove(draggedItem, targetDirHandle);
        // -----------------------------

        updateItemProjectName(draggedItem, targetPIdx);


        saveMetadata();
        renderSidebar();
        updateUI();

        notify('Archivo movido');
    } catch (err) {
        console.error('Error en drag & drop:', err);
        notify('Error al mover archivo', 'error');
    }
}

function updateItemProjectName(item, pIdx) {
    const project = state.projects[pIdx];
    if (project) {
        item.projectName = project.name;
    }

    if (item.items) {
        item.items.forEach(child => updateItemProjectName(child, pIdx));
    }
}

// ============================================
// BREADCRUMBS DINÁMICOS
// ============================================

function updateBreadcrumbs() {
    const breadcrumb = document.getElementById('breadcrumb');
    if (!breadcrumb) return;

    const parts = [];

    parts.push(`
        <button id="show-sidebar-btn" class="show-sidebar-btn ${state.sidebarCollapsed ? '' : 'hidden'}" title="Mostrar Sidebar">
            <i class="fas fa-bars"></i>
        </button>
    `);

    parts.push(`<span class="root" onclick="window.closeFile()"><i class="fas fa-home"></i> Inicio</span>`);

    if (state.exploringFolder) {
        const project = state.projects[state.exploringFolder.pIdx];
        if (project) {
            parts.push(`<i class="fas fa-chevron-right breadcrumb-separator"></i>`);
            parts.push(`<span class="crumb" onclick="window.closeFile()">${escapeHtml(project.name)}</span>`);
            parts.push(`<i class="fas fa-chevron-right breadcrumb-separator"></i>`);
            parts.push(`<span class="crumb active">${escapeHtml(state.exploringFolder.name)}</span>`);
        }
    } else if (state.activeFile) {
        const pIdx = state.activeProjectIndex;
        const project = state.projects[pIdx];
        const file = state.activeFile;

        const filePath = getPathFromItem(file);
        const pathParts = filePath ? filePath.split(',') : [];

        if (project) {
            parts.push(`<i class="fas fa-chevron-right breadcrumb-separator"></i>`);
            parts.push(`<span class="crumb" onclick="window.closeFile()">${escapeHtml(project.name)}</span>`);

            let currentItem = project;
            for (let i = 0; i < pathParts.length - 1; i++) {
                const idx = parseInt(pathParts[i]);
                if (currentItem.items && currentItem.items[idx]) {
                    currentItem = currentItem.items[idx];
                    const parentPath = pathParts.slice(0, i + 1).join(',');
                    parts.push(`<i class="fas fa-chevron-right breadcrumb-separator"></i>`);
                    parts.push(`<span class="crumb" onclick="window.openFileSmart(${pIdx}, '${parentPath}')">${escapeHtml(currentItem.name.replace('.txt', ''))}</span>`);
                }
            }

            parts.push(`<i class="fas fa-chevron-right breadcrumb-separator"></i>`);
            parts.push(`<span class="crumb active" title="Archivo actual">${escapeHtml(file.name.replace('.txt', ''))}</span>`);
        }
    } else {
        // Estado inicial sin archivo
        parts.push(`<i class="fas fa-chevron-right breadcrumb-separator"></i>`);
        parts.push(`<span class="crumb active">Explorador</span>`);
    }

    breadcrumb.innerHTML = parts.join('');

    const showBtn = document.getElementById('show-sidebar-btn');
    if (showBtn) {
        showBtn.onclick = () => {
            state.sidebarCollapsed = false;
            el.sidebar.classList.remove('collapsed', 'peek');
            showBtn.classList.add('hidden');
            const collapseBtn = document.getElementById('collapse-sidebar');
            if (collapseBtn) collapseBtn.classList.remove('hidden');
        };
    }
}

// ============================================
// CONFIGURACIÓN DE EVENTOS
// ============================================

function setupEventListeners() {
    document.addEventListener('click', handleGlobalClick);

    el.editor.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const selection = window.getSelection();
        if (selection.toString().trim()) {
            showFormattingToolbar();
        }
    });

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
            collapseBtn.classList.add('hidden');
            document.getElementById('show-sidebar-btn').classList.remove('hidden');
        };
    }

    const showSidebarBtn = document.getElementById('show-sidebar-btn');
    if (showSidebarBtn) {
        showSidebarBtn.onclick = () => {
            state.sidebarCollapsed = false;
            el.sidebar.classList.remove('collapsed', 'peek');
            showSidebarBtn.classList.add('hidden');
            const collapseBtn = document.getElementById('collapse-sidebar');
            if (collapseBtn) collapseBtn.classList.remove('hidden');
        };
    }

    const reconBtn = document.getElementById('reconnect-folder-btn');
    if (reconBtn) reconBtn.onclick = () => requestWorkspacePermission();

    const sideReconBtn = document.getElementById('sidebar-reconnect-btn');
    if (sideReconBtn) sideReconBtn.onclick = () => requestWorkspacePermission();

    const spellBtn = document.getElementById('spell-check');
    if (spellBtn) spellBtn.onclick = toggleSpellCheck;

    setupCommentsControls();
    setupSettingsControls();
    setupEditorControls();

    el.charGoal.oninput = handleCharGoalChange;

    document.getElementById('input-modal-confirm').onclick = handleInputModalConfirm;
    document.getElementById('custom-input-field').onkeydown = (e) => {
        if (e.key === 'Enter') document.getElementById('input-modal-confirm').click();
    };

    setupAvatarUpload();
    setupDataManagement();
    setupContextMenuActions();

    const upgradeFooterBtn = document.getElementById('upgrade-status');
    if (upgradeFooterBtn) {
        upgradeFooterBtn.onclick = () => {
            if (state.activeFile) {
                upgradeStatusAction();
            }
        };
    }

    console.log('[Block Guard] Eventos configurados');
}

function setupContextMenuActions() {
    const ctxRename = document.getElementById('ctx-rename');
    if (ctxRename) {
        ctxRename.onclick = () => {
            el.ctxMenu.classList.add('hidden');
            renameItem();
        };
    }

    const ctxAddSub = document.getElementById('ctx-add-sub');
    if (ctxAddSub) {
        ctxAddSub.onclick = () => {
            el.ctxMenu.classList.add('hidden');
            createFileSystemItemAction();
        };
    }

    const ctxUpgrade = document.getElementById('ctx-upgrade-sidebar');
    if (ctxUpgrade) {
        ctxUpgrade.onclick = () => {
            el.ctxMenu.classList.add('hidden');
            upgradeStatusAction();
        };
    }

    const ctxDelete = document.getElementById('ctx-delete');
    if (ctxDelete) {
        ctxDelete.onclick = () => {
            el.ctxMenu.classList.add('hidden');
            deleteItemSmart();
        };
    }
}

function setupCommentsControls() {
    const postPostBtn = document.getElementById('post-comment');
    if (postPostBtn) {
        postPostBtn.onclick = () => {
            const input = document.getElementById('new-comment');
            if (input && input.value.trim()) {
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
}

function setupSettingsControls() {
    const openSettingsBtn = document.getElementById('open-settings');
    if (openSettingsBtn) {
        openSettingsBtn.onclick = () => {
            document.getElementById('settings-modal').classList.add('open');
            const currentName = localStorage.getItem('bg_user_name') ||
                (state.workspaceHandle ? state.workspaceHandle.name : 'Usuario');
            const nameInput = document.getElementById('user-name-input');
            if (nameInput) nameInput.value = currentName;

            updateSettingsAvatar();
            renderStateConfig();
            renderThemePreviews();
            renderShortcutsConfig();
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
                localStorage.setItem('bg_user_name', nameInp.value);
                applyUserIdentity();
            }
            document.getElementById('settings-modal').classList.remove('open');
            notify('Configuración guardada correctamente');
        };
    }

    const addStateBtn = document.getElementById('add-state-btn');
    if (addStateBtn) {
        addStateBtn.onclick = () => {
            state.config.states.push({
                id: 'state_' + Date.now(),
                name: 'Nuevo Estado',
                color: '#0071e3',
                countType: 'absolute',
                goal: state.config.defaultGoal || 30000
            });
            renderStateConfig();
        };
    }

    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.onclick = () => {
            const theme = btn.getAttribute('data-theme');
            applyTheme(theme);
            document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        };
    });

    setupCustomColorPickers();

    const saveCustomThemeBtn = document.getElementById('save-custom-theme');
    if (saveCustomThemeBtn) saveCustomThemeBtn.onclick = saveCustomTheme;

    const changeAvatarBtn = document.getElementById('change-avatar-btn');
    if (changeAvatarBtn) changeAvatarBtn.onclick = () => document.getElementById('avatar-upload-input').click();

    const removeAvatarBtn = document.getElementById('remove-avatar-btn');
    if (removeAvatarBtn) removeAvatarBtn.onclick = removeAvatar;
}

function setupEditorControls() {
    el.editor.oninput = () => {
        updateStats();
        if (state.activeFile) {
            state.activeFile.lastCharCount = el.editor.innerText.length;
            updateActiveFileProgress();
        }
    };

    el.editor.onmouseover = (e) => {
        const p = e.target.closest('p, h1, h2, h3, blockquote');
        if (p && el.editor.contains(p)) {
            showParagraphToolbar(p);
        }
    };

    document.querySelector('.editor-container').onmousemove = (e) => {
        if (!document.getElementById('comments-sidebar').classList.contains('hidden')) return;

        const rect = el.editor.getBoundingClientRect();
        if (e.clientX >= rect.right && e.clientX <= rect.right + 100) {
            const y = e.clientY;
            const paragraphs = Array.from(el.editor.querySelectorAll('p, h1, h2, h3, blockquote'));
            const p = paragraphs.find(par => {
                const r = par.getBoundingClientRect();
                return y >= r.top && y <= r.bottom;
            });
            if (p) showParagraphToolbar(p);
        }
    };

    el.editor.onmouseleave = (e) => {
        const toolbar = document.getElementById('para-toolbar');
        if (e.relatedTarget && (e.relatedTarget === toolbar || toolbar.contains(e.relatedTarget))) {
            return;
        }
        setTimeout(() => {
            const overContainer = document.querySelector('.editor-container:hover');
            if (!overContainer) {
                toolbar.classList.add('hidden');
                toolbar.classList.remove('visible');
            }
        }, 100);
    };

    document.body.addEventListener('mousedown', (e) => {
        const toolbar = document.getElementById('para-toolbar');
        if (!e.target.closest('.editor-container') && !e.target.closest('#para-toolbar') &&
            !e.target.closest('#formatting-toolbar') && !e.target.closest('.color-picker-popup')) {
            toolbar.classList.add('hidden');
            toolbar.classList.remove('visible');
            hideFormattingToolbar();
        }
    });

    el.editor.onclick = (e) => {
        const p = e.target.closest('p, h1, h2, h3, blockquote');
        if (p) {
            state.activeParagraphIndex = Array.from(el.editor.children).indexOf(p);
            showParagraphToolbar(p);
            if (!document.getElementById('comments-sidebar').classList.contains('hidden')) {
                renderComments();
            }
        }
    };

    document.querySelector('.editor-container').addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('editor-container') || e.target === el.editor) {
            setTimeout(() => {
                el.editor.focus();
                ensureEditorContent();
            }, 0);
        }
    });

    el.editor.addEventListener('focus', ensureEditorContent);

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
}

function ensureEditorContent() {
    if (el.editor.innerHTML.trim() === '' || el.editor.innerHTML === '<br>') {
        el.editor.innerHTML = '<p><br></p>';
    }
}

function handleCharGoalChange() {
    if (state.activeFile) {
        state.activeFile.goal = parseInt(el.charGoal.value) || state.config.defaultGoal || 30000;
        updateStats();
        renderSidebar();
        saveMetadata();
    }
}

function handleInputModalConfirm() {
    const val = document.getElementById('custom-input-field').value;
    if (state.modalResolver) {
        state.modalResolver(val);
        window.closeInputModal();
    }
}

function handleGlobalClick(e) {
    if (!e.target.closest('#custom-context-menu')) {
        el.ctxMenu.classList.add('hidden');
    }

    if (e.target.classList.contains('modal')) {
        if (e.target.id === 'settings-modal') e.target.classList.remove('open');
        else if (e.target.id === 'input-modal') window.closeInputModal();
        else if (e.target.id === 'confirm-modal') window.closeConfirmModal(false);
        else if (e.target.id === 'spell-modal') e.target.classList.remove('open');
        else if (e.target.id === 'avatar-crop-modal') window.closeAvatarCropModal();
    }

    if (e.target.id === 'comments-overlay') {
        document.getElementById('comments-sidebar').classList.add('hidden');
        e.target.classList.add('hidden');
    }
}

// ============================================
// HOVER DEL SIDEBAR
// ============================================

function setupSidebarHover() {
    const zone = document.getElementById('sidebar-hover-zone');
    const sidebar = document.getElementById('sidebar');
    const collapseBtn = document.getElementById('collapse-sidebar');

    if (!zone || !sidebar) return;

    document.body.classList.add('sidebar-hover-zone-active');

    zone.onmouseenter = () => {
        if (state.sidebarCollapsed) {
            sidebar.classList.add('peek');
            document.body.classList.add('sidebar-hover');
        }
    };

    sidebar.onmouseleave = (e) => {
        if (state.sidebarCollapsed) {
            sidebar.classList.remove('peek');
            document.body.classList.remove('sidebar-hover');
        }
    };

    sidebar.onclick = (e) => {
        if (state.sidebarCollapsed && sidebar.classList.contains('peek')) {
            const isToggle = e.target.closest('.toggle-icon') || e.target.closest('.nav-item-dots') || e.target.closest('.sub-nav-dots');
            const isCollapseBtn = e.target.closest('#collapse-sidebar');

            if (!isToggle && !isCollapseBtn) {
                state.sidebarCollapsed = false;
                sidebar.classList.remove('collapsed', 'peek');
                document.body.classList.remove('sidebar-hover');
                if (collapseBtn) collapseBtn.classList.remove('hidden');
            }
        }
    };
}

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
    const interval = (state.config.autosaveInterval || 30) * 1000;
    state.autosaveTimer = setInterval(() => {
        if (state.activeFile) saveFileContent(false);
    }, interval);
}


// ============================================
// SISTEMA DE ARCHIVOS
// ============================================

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
            notify('Permisos restaurados');
        } else {
            notify('Permiso denegado', 'error');
        }
    } catch (err) {
        console.error('Error:', err);
        notify('Error al solicitar permisos', 'error');
    }
}

async function selectWorkspace() {
    try {
        const h = await window.showDirectoryPicker();
        state.workspaceHandle = h;
        await saveHandle(h);
        await scanWorkspace();
        renderSidebar();
        notify('Carpeta conectada');
    } catch (err) {
        if (err.name !== 'AbortError') {
            console.error(err);
            notify('Error al conectar carpeta', 'error');
        }
    }
}

async function scanWorkspace() {
    if (!state.workspaceHandle) return;

    let data;
    try {
        document.body.classList.remove('no-workspace');
        const welcomeRecon = document.getElementById('reconnect-folder-btn');
        if (welcomeRecon) welcomeRecon.classList.add('hidden');
        const sideRecon = document.getElementById('sidebar-reconnect-btn');
        if (sideRecon) sideRecon.classList.add('hidden');

        data = await state.workspaceHandle.getDirectoryHandle('data', { create: true });
    } catch (err) {
        console.error(err);
        notify('Error al acceder a datos', 'error');
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
    saveWorkspaceCache();
}

async function scanDirectoryRecursive(dirHandle, itemsArray, projectName) {
    for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.txt')) {
            const item = {
                name: entry.name,
                handle: entry,
                status: 'draft',
                lastCharCount: 0,
                items: [],
                comments: [],
                parentDirHandle: dirHandle,
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
        notify('Primero conecta una carpeta', 'error');
        selectWorkspace();
        return;
    }
    const name = await promptCustom('Nombre del proyecto:', 'Mi Proyecto');
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
    if (!parent) return;

    let label = isProject ? 'Nombre del nuevo archivo:' : 'Nombre del sub-archivo:';
    let defaultVal = isProject ? 'Capítulo 1' : 'Sección 1';
    const name = await promptCustom(label, defaultVal);

    if (!name) return;

    try {
        let targetDir;
        if (isProject) {
            targetDir = parent.handle;
        } else {
            const parentDir = parent.parentDirHandle;
            const subDirName = 'sub_' + parent.name.replace('.txt', '');
            targetDir = await parentDir.getDirectoryHandle(subDirName, { create: true });
        }

        const fh = await targetDir.getFileHandle(name + '.txt', { create: true });
        const newItem = {
            name: name + '.txt',
            handle: fh,
            status: 'draft',
            lastCharCount: 0,
            items: [],
            comments: [],
            parentDirHandle: targetDir,
            projectName: isProject ? parent.name : (parent.projectName || 'Proyecto')
        };

        if (!parent.items) parent.items = [];
        parent.items.push(newItem);
        renderSidebar();
        saveMetadata();
        notify(isProject ? 'Archivo creado' : 'Sub-archivo creado');
    } catch (err) {
        console.error(err);
        notify('Error al crear', 'error');
    }
}

// ============================================
// RENDERIZADO DE UI - SIDEBAR CORREGIDO
// ============================================

function renderSidebar() {
    el.projectList.innerHTML = '';

    if (!state.workspaceHandle) return;

    state.projects.forEach((p, pIdx) => {
        const li = document.createElement('li');
        li.className = `project-container ${p.open ? 'open' : ''}`;

        const navItem = document.createElement('div');
        navItem.className = `nav-item ${state.activeFile === p ? 'active' : ''}`;
        navItem.setAttribute('data-type', 'project');
        navItem.setAttribute('data-p-idx', pIdx);
        navItem.setAttribute('data-path', '');
        navItem.title = p.name;
        navItem.innerHTML = `
            <span class="file-name-text">
                <span class="folder-icons-wrapper">
                    <i class="fas fa-chevron-${p.open ? 'down' : 'right'} toggle-icon"></i>
                    <i class="fas fa-folder folder-icon"></i>
                </span>
                <span class="text-content">${smartTruncate(p.name, 15)}</span>
            </span>
            <div class="nav-item-actions">
                <i class="fas fa-ellipsis-v nav-item-dots"></i>
            </div>
        `;

        navItem.onclick = (e) => {
            if (e.target.closest('.nav-item-dots')) {
                e.stopPropagation(); // Prevenir drag al clickear puntos
                window.showCtxManual(e, 'project', pIdx, '');
                return;
            }
            p.open = !p.open;
            renderSidebar();
        };

        // Los proyectos NO deben ser draggables según el requerimiento
        // makeItemDraggable(navItem, pIdx, '', 'project');
        makeItemDroppable(navItem, pIdx, '', 'project');

        li.appendChild(navItem);

        const subList = document.createElement('ul');
        subList.className = `sub-nav-list ${p.open ? 'open' : ''}`;

        if (p.items && p.items.length > 0) {
            renderLevelItems(p.items, pIdx, '', subList);
        }

        li.appendChild(subList);
        el.projectList.appendChild(li);
    });

    updateWelcomeRecent();
}

function renderLevelItems(items, pIdx, parentPath, container) {
    items.forEach((item, iIdx) => {
        const currentPath = parentPath === "" ? `${iIdx}` : `${parentPath},${iIdx}`;
        const active = state.activeFile === item;
        const status = state.config.states.find(s => s.id === item.status) || state.config.states[0];
        const pct = Math.min((item.lastCharCount / (item.goal || state.config.defaultGoal || 30000)) * 100, 100);
        const offset = 56.5 - (56.5 * pct / 100);
        const hasChildren = item.items && item.items.length > 0;
        const displayName = item.name.replace('.txt', '');

        const li = document.createElement('li');
        li.className = `sub-nav-item ${active ? 'active' : ''} ${hasChildren ? 'has-children' : ''}`;
        li.setAttribute('data-type', 'file');
        li.setAttribute('data-p-idx', pIdx);
        li.setAttribute('data-path', currentPath);
        li.title = item.name;
        li.innerHTML = `
            <span class="file-name-text">
                <span class="folder-icons-wrapper">
                    ${hasChildren ? `<i class="fas fa-chevron-${item.open ? 'down' : 'right'} toggle-icon"></i>` : ''}
                    <svg class="circle-progress" viewBox="0 0 24 24">
                        <circle class="bg" cx="12" cy="12" r="9"></circle>
                        <circle class="fg" cx="12" cy="12" r="9" style="stroke: ${status.color}; stroke-dashoffset: ${offset}"></circle>
                    </svg>
                </span>
                <span class="text-content">${smartTruncate(displayName, 18)}</span>
            </span>
            <i class="fas fa-ellipsis-v sub-nav-dots"></i>
        `;

        li.onclick = (e) => {
            if (e.target.closest('.toggle-icon')) {
                e.stopPropagation();
                item.open = !item.open;
                renderSidebar();
                return;
            }
            if (e.target.closest('.sub-nav-dots')) {
                e.stopPropagation(); // Prevenir drag al clickear puntos
                window.showCtxManual(e, 'file', pIdx, currentPath);
                return;
            }

            if (hasChildren && !item.open) {
                item.open = true;
                renderSidebar();
            }
            openFileWithSave(pIdx, currentPath);
        };

        makeItemDraggable(li, pIdx, currentPath, 'file');
        makeItemDroppable(li, pIdx, currentPath, 'file');

        container.appendChild(li);

        if (hasChildren) {
            const childrenContainer = document.createElement('ul');
            childrenContainer.className = `nested-list ${item.open ? 'open' : ''}`;

            childrenContainer.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
            });

            childrenContainer.addEventListener('drop', async (e) => {
                e.preventDefault();
                e.stopPropagation();

                if (!state.dragState.isDragging || !state.dragState.draggedItem) return;

                const draggedItem = state.dragState.draggedItem;
                const draggedPIdx = state.dragState.draggedPIdx;
                const draggedPath = state.dragState.draggedPath;

                if (draggedItem === item || isDescendant(draggedItem, item)) return;

                try {
                    const sourceCollection = getParentCollection(draggedPIdx, draggedPath);
                    const sourceIndex = getIndexFromPath(draggedPath);
                    sourceCollection.splice(sourceIndex, 1);

                    if (!item.items) item.items = [];
                    item.items.push(draggedItem);
                    item.open = true;

                    updateItemProjectName(draggedItem, pIdx);

                    saveMetadata();
                    renderSidebar();
                    notify('Archivo movido como sub-archivo');
                } catch (err) {
                    console.error('Error en drop:', err);
                    notify('Error al mover archivo', 'error');
                }
            });

            renderLevelItems(item.items, pIdx, currentPath, childrenContainer);
            container.appendChild(childrenContainer);
        }
    });
}

function smartTruncate(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 2) + '...';
}

// ============================================
// APERTURA DE ARCHIVOS CON GUARDADO
// ============================================

async function openFileWithSave(pIdx, path) {
    // Guardar archivo actual primero
    if (state.activeFile && state.isSaving === false) {
        state.isSaving = true;
        notify('Guardando...');
        await saveFileContent(false);
        state.isSaving = false;
    }

    // Pequeño delay para asegurar que se guardó
    setTimeout(() => {
        window.openFileSmart(pIdx, path);
    }, 100);
}

function updateUI() {
    const file = state.activeFile;
    const folder = state.exploringFolder;

    el.welcomeScreen.classList.toggle('hidden', !!file || !!folder);
    document.getElementById('metadata-panel').classList.toggle('hidden', !file);

    const welcomeContent = el.welcomeScreen.querySelector('.welcome-content');

    if (folder) {
        el.welcomeScreen.classList.remove('hidden');
        welcomeContent.innerHTML = `
            <div class="welcome-logo"><i class="fas fa-folder-open"></i></div>
            <h1>${escapeHtml(folder.name)}</h1>
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
        const uName = localStorage.getItem('bg_user_name') ||
            (state.workspaceHandle ? state.workspaceHandle.name : 'Escritor');

        welcomeContent.innerHTML = `
            <div class="welcome-logo"><i class="fas fa-shield-halved"></i></div>
            <h1>Hola de nuevo, <span id="welcome-user-name">${escapeHtml(uName)}</span></h1>
            <p>¿Qué vamos a escribir hoy? ${state.workspaceHandle ? 'Selecciona un proyecto.' : 'Conecta una carpeta.'}</p>

            <button id="reconnect-folder-btn" class="btn-primary hidden" style="margin: 20px auto;">
                <i class="fas fa-unlock"></i> Reactivar Acceso
            </button>

            <div class="recent-projects-grid" id="recent-projects">
                ${renderWelcomeProjects()}
            </div>

            <div class="welcome-actions">
                <button id="welcome-new-project" class="btn-primary" onclick="window.createProjectAction()">
                    <i class="fas fa-plus"></i> Nuevo Proyecto
                </button>
                <button id="welcome-open-folder" class="btn-sub" onclick="window.selectWorkspace()">
                    <i class="fas fa-folder-open"></i> ${state.workspaceHandle ? 'Cambiar Carpeta' : 'Conectar Carpeta'}
                </button>
            </div>
        `;

        const reconBtn = document.getElementById('reconnect-folder-btn');
        if (reconBtn) {
            reconBtn.onclick = () => requestWorkspacePermission();
            reconBtn.classList.toggle('hidden', !!state.workspaceHandle);
        }
    } else {
        const st = state.config.states.find(s => s.id === file.status) || state.config.states[0];
        document.getElementById('active-file-title').innerText = file.name.replace('.txt', '');
        document.getElementById('goal-progress').style.width = `${Math.min((file.lastCharCount / (file.goal || state.config.defaultGoal || 30000)) * 100, 100)}%`;
        document.getElementById('progress-text').innerText = `${Math.min(Math.round((file.lastCharCount / (file.goal || state.config.defaultGoal || 30000)) * 100), 100)}%`;
        document.getElementById('char-goal').value = file.goal || state.config.defaultGoal || 30000;
        el.statusBar.innerText = st.name;
        el.statusBar.style.backgroundColor = st.color;

        updateBreadcrumbs();
        renderChildrenLinks();
    }

    // Ocultar componentes si no hay workspace
    const hasWorkspace = !!state.workspaceHandle;
    if (el.sidebar) el.sidebar.classList.toggle('hidden', !hasWorkspace);
    const topBar = document.querySelector('.top-bar');
    if (topBar) topBar.classList.toggle('hidden', !hasWorkspace);
    const footer = document.querySelector('.editor-footer');
    if (footer) footer.classList.toggle('hidden', !hasWorkspace);

    updateStats();
}

function renderWelcomeProjects() {
    if (!state.projects.length) return '<p style="opacity:0.5; margin:20px 0">No hay proyectos aún.</p>';

    return state.projects.map((p, idx) => {
        const hasContent = p.items && p.items.length > 0;
        return `
            <div class="recent-project-card" onclick="window.quickAdd(${idx})">
                <div class="recent-project-icon">
                    <i class="fas fa-folder${p.open ? '-open' : ''}"></i>
                </div>
                <div class="recent-project-info">
                    <span class="recent-project-name">${escapeHtml(p.name)}</span>
                    <span class="recent-project-count">${p.items.length} archivo${p.items.length !== 1 ? 's' : ''}</span>
                </div>
                ${hasContent ? '<i class="fas fa-chevron-right recent-project-arrow"></i>' : ''}
            </div>
        `;
    }).join('');
}

function updateWelcomeRecent() {
    if (state.exploringFolder || state.activeFile) return;
    const recentContainer = document.getElementById('recent-projects');
    if (recentContainer) recentContainer.innerHTML = renderWelcomeProjects();
}

function showReconnectUI() {
    if (!state.exploringFolder && !state.activeFile) {
        document.body.classList.add('no-workspace');
        document.getElementById('welcome-message').innerText = 'Tu sesión expiró. Reconecta la carpeta.';
        const reconBtn = document.getElementById('reconnect-folder-btn');
        if (reconBtn) reconBtn.classList.remove('hidden');
        updateUI();
    }
}

function renderChildrenLinks() {
    const container = document.getElementById('children-links');
    const list = document.getElementById('links-list');

    if (!container || !list) return;

    if (!state.activeFile || !state.activeFile.items || state.activeFile.items.length === 0) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');
    list.innerHTML = state.activeFile.items.map(item => `
        <li onclick="openFileWithSave(${state.activeProjectIndex || 0}, '${getPathFromItem(item)}')">
            <i class="fas fa-link"></i> ${escapeHtml(item.name.replace('.txt', ''))}
        </li>
    `).join('');
}

function renderExplorerHierarchy(items, pIdx, parentPath) {
    if (!items || items.length === 0) return '';

    return items.map((item, iIdx) => {
        const currentPath = parentPath === "" ? `${iIdx}` : `${parentPath},${iIdx}`;
        const st = state.config.states.find(s => s.id === item.status) || state.config.states[0];
        const p = Math.min((item.lastCharCount / (item.goal || state.config.defaultGoal || 30000)) * 100, 100);
        const off = 56.5 - (56.5 * p / 100);
        const hasChildren = item.items && item.items.length > 0;

        return `
            <div class="explorer-hierarchy-item" style="margin-left: ${parentPath === "" ? 0 : 20}px">
                <div class="explorer-list-item" onclick="openFileWithSave(${pIdx}, '${currentPath}')">
                    <span class="folder-icons-wrapper">
                        <svg class="circle-progress" viewBox="0 0 24 24">
                            <circle class="bg" cx="12" cy="12" r="9"></circle>
                            <circle class="fg" cx="12" cy="12" r="9" style="stroke: ${st.color}; stroke-dashoffset: ${off}"></circle>
                        </svg>
                    </span>
                    <span class="text-content" title="${escapeHtml(item.name)}">${smartTruncate(item.name.replace('.txt', ''), 25)}</span>
                </div>
                ${hasChildren ? `<div class="explorer-children">${renderExplorerHierarchy(item.items, pIdx, currentPath)}</div>` : ''}
            </div>
        `;
    }).join('');
}

function renderStateConfig() {
    const list = document.getElementById('states-config-list');
    if (!list) return;

    const actionLabels = {
        'absolute': 'Contar Totales',
        'edited': 'Contar Ediciones',
        'delta': 'Contar Nuevos'
    };

    list.innerHTML = state.config.states.map((s, i) => `
    <div class="state-config-item">
        <div class="state-reorder-actions">
            <i class="fas fa-chevron-up ${i === 0 ? 'hidden' : ''}" onclick="window.moveStateUp(${i})"></i>
            <i class="fas fa-chevron-down ${i === state.config.states.length - 1 ? 'hidden' : ''}" onclick="window.moveStateDown(${i})"></i>
        </div>
        <input type="color" value="${s.color}" onchange="window.updateStateColor(${i}, this.value)" title="Color">
        <div class="state-info-edit">
            <span class="state-name-display">${escapeHtml(s.name)}</span>
            <div class="state-action-display">
                <span class="action-label">${actionLabels[s.countType] || 'Contar Totales'}</span>
                <button class="btn-icon-small" onclick="window.editStateAction(${i})" title="Editar acción">
                    <i class="fas fa-pen"></i>
                </button>
            </div>
        </div>
        <div class="state-item-actions">
            <button class="btn-icon-small" onclick="window.editStateName(${i})" title="Editar nombre"><i class="fas fa-pen"></i></button>
            <button class="btn-icon-small danger" onclick="window.removeState(${i})" title="Eliminar"><i class="fas fa-trash"></i></button>
        </div>
    </div>`).join('');
}

function renderThemePreviews() {
    const grid = document.getElementById('theme-preview-grid');
    if (!grid) return;

    const themes = [
        { id: 'dark', name: 'Oscuro', colors: ['#0a0a0a', '#121212', '#0071e3'] },
        { id: 'light', name: 'Claro', colors: ['#ffffff', '#f5f5f7', '#0071e3'] },
        { id: 'midnight', name: 'Azul Noche', colors: ['#0d1b2a', '#1b263b', '#64b5f6'] },
        { id: 'forest', name: 'Verde', colors: ['#1a1f1b', '#242d26', '#81c784'] },
        { id: 'lavender', name: 'Violeta', colors: ['#181824', '#252538', '#9c7bf8'] },
        { id: 'cyber', name: 'Cyber', colors: ['#0a0f1c', '#111827', '#38bdf8'] }
    ];

    grid.innerHTML = themes.map(t => `
        <div class="theme-preview-card ${state.config.theme === t.id ? 'active' : ''}" 
             data-theme="${t.id}" onclick="applyTheme('${t.id}')">
            <div class="theme-colors">
                ${t.colors.map(c => `<span style="background: ${c}"></span>`).join('')}
            </div>
            <div class="theme-name">${t.name}</div>
        </div>
    `).join('');
}


// ============================================
// ESTADÍSTICAS Y PROGRESO
// ============================================

function updateStats() {
    const text = el.editor.innerText;
    const file = state.activeFile;
    if (!file) return;

    const paragraphs = el.editor.querySelectorAll('p, h1, h2, h3, blockquote');
    el.statLines.innerHTML = `<i class="fas fa-paragraph"></i> ${paragraphs.length}`;
    el.statWords.innerHTML = `<i class="fas fa-font"></i> ${text.trim() ? text.trim().split(/\s+/).length : 0}`;
    el.statChars.innerHTML = `<i class="fas fa-keyboard"></i> ${text.length}`;

    const status = state.config.states.find(s => s.id === file.status) || state.config.states[0];

    let currentCount = text.length;
    if (status.countType === 'edited') {
        currentCount = (file.hist?.edited || 0);
    } else if (status.countType === 'delta') {
        currentCount = Math.max(0, text.length - (file.sessionStartLength || 0));
    }

    file.lastCharCount = currentCount;
    const goal = file.goal || state.config.defaultGoal || 30000;
    const pct = Math.min(Math.round((currentCount / goal) * 100), 100);

    document.getElementById('goal-progress').style.width = `${pct}%`;
    document.getElementById('progress-text').innerText = `${pct}%`;
    el.statusBar.innerText = status.name;
    el.statusBar.style.backgroundColor = status.color;

    if (el.statAdded && file.hist) {
        el.statAdded.innerHTML = `<i class="fas fa-plus-circle"></i> ${file.hist.added || 0}`;
    } else if (el.statAdded) {
        el.statAdded.innerHTML = `<i class="fas fa-plus-circle"></i> 0`;
    }

    if (el.statRemoved && file.hist) {
        el.statRemoved.innerHTML = `<i class="fas fa-minus-circle"></i> ${file.hist.removed || 0}`;
    } else if (el.statRemoved) {
        el.statRemoved.innerHTML = `<i class="fas fa-minus-circle"></i> 0`;
    }

    updateActiveFileProgress();
}

function updateActiveFileProgress() {
    const activeItem = document.querySelector('.sub-nav-item.active');
    if (activeItem && state.activeFile) {
        const pct = Math.min((state.activeFile.lastCharCount / (state.activeFile.goal || state.config.defaultGoal || 30000)) * 100, 100);
        const circle = activeItem.querySelector('circle.fg');
        if (circle) circle.style.strokeDashoffset = 56.5 - (56.5 * pct / 100);
    }
}

// ============================================
// COMENTARIOS Y TOOLBAR DE PÁRRAFO
// ============================================

function showParagraphToolbar(p) {
    const toolbar = document.getElementById('para-toolbar');
    if (!toolbar) return;

    const commentsSidebar = document.getElementById('comments-sidebar');
    if (commentsSidebar && !commentsSidebar.classList.contains('hidden')) {
        toolbar.classList.add('hidden');
        toolbar.classList.remove('visible');
        return;
    }

    toolbar.classList.remove('hidden');
    toolbar.classList.add('visible');

    // Posicionar el toolbar al lado del párrafo
    const editorRect = el.editor.getBoundingClientRect();
    const pRect = p.getBoundingClientRect();
    const relativeTop = pRect.top - editorRect.top + el.editor.scrollTop;

    toolbar.style.top = `${relativeTop + 5}px`;
    toolbar.style.right = '10px';
    toolbar.style.left = 'auto';

    const paras = Array.from(el.editor.querySelectorAll('p, h1, h2, h3, blockquote'));
    state.activeParagraphIndex = paras.indexOf(p);

    const count = (state.activeFile?.comments || []).filter(c => c.pIdx === state.activeParagraphIndex).length;
    const countEl = document.getElementById('para-comment-count');
    if (countEl) countEl.innerText = count > 0 ? count : '';

    // Eventos del toolbar para que no desaparezca al entrar en él
    toolbar.onmouseenter = () => {
        toolbar.classList.remove('hidden');
        toolbar.classList.add('visible');
    };

    toolbar.onmouseleave = (e) => {
        if (!e.relatedTarget?.closest('p, h1, h2, h3, blockquote')) {
            toolbar.classList.add('hidden');
            toolbar.classList.remove('visible');
        }
    };

    toolbar.onclick = (e) => {
        e.stopPropagation();
        const side = document.getElementById('comments-sidebar');
        const over = document.getElementById('comments-overlay');
        if (side) side.classList.remove('hidden');
        if (over) over.classList.remove('hidden');
        renderComments();
    };
}


function setupEditorControls() {
    el.editor.addEventListener('mousemove', (e) => {
        const p = e.target.closest('p, h1, h2, h3, blockquote');
        const toolbar = document.getElementById('para-toolbar');
        if (p && el.editor.contains(p)) {
            showParagraphToolbar(p);
        } else if (toolbar && !e.relatedTarget?.closest('#para-toolbar')) {
            // Solo ocultar si no vamos hacia el toolbar
            toolbar.classList.remove('visible');
            toolbar.classList.add('hidden');
        }
    });

    el.editor.addEventListener('mouseleave', (e) => {
        const toolbar = document.getElementById('para-toolbar');
        if (toolbar && e.relatedTarget && (e.relatedTarget === toolbar || toolbar.contains(e.relatedTarget))) {
            return;
        }
        if (toolbar) {
            toolbar.classList.remove('visible');
            toolbar.classList.add('hidden');
        }
    });

    // Asegurar que el toolbar se oculte al scrollear o clickear fuera
    el.editor.addEventListener('scroll', () => {
        const toolbar = document.getElementById('para-toolbar');
        if (toolbar) {
            toolbar.classList.remove('visible');
            toolbar.classList.add('hidden');
        }
    });
}


function postComment(text) {
    if (!text.trim() || !state.activeFile) return;
    if (!state.activeFile.comments) state.activeFile.comments = [];

    const author = localStorage.getItem('bg_user_name') || 'Escritor';
    state.activeFile.comments.push({
        author,
        text,
        date: new Date().toLocaleString(),
        pIdx: state.activeParagraphIndex || 0
    });

    saveMetadata();
    renderComments();
}

function renderComments() {
    const list = document.getElementById('comments-list');
    if (!state.activeFile) return;

    const comments = (state.activeFile.comments || []).filter(c =>
        state.activeParagraphIndex === undefined || c.pIdx === state.activeParagraphIndex
    );

    list.innerHTML = comments.length === 0
        ? '<p style="text-align:center; opacity:0.5; margin-top:20px">Sin comentarios aquí.</p>'
        : comments.map(c => `
            <div class="comment-item">
                <div class="comment-author">
                    <span>${escapeHtml(c.author)}</span>
                    <small>${escapeHtml(c.date)}</small>
                </div>
                <p>${escapeHtml(c.text)}</p>
            </div>
        `).join('');
}

// ============================================
// GUARDADO Y CARGA DE ARCHIVOS
// ============================================

async function saveFileContent(isManual = false) {
    if (!state.activeFile) return false;

    const text = el.editor.innerHTML;
    const oldLength = state.activeFile.lastCharCount || 0;
    const newLength = el.editor.innerText.length;

    if (!state.activeFile.hist) state.activeFile.hist = { added: 0, removed: 0, edited: 0 };

    const diff = newLength - oldLength;
    if (diff > 0) state.activeFile.hist.added += diff;
    else if (diff < 0) state.activeFile.hist.removed += Math.abs(diff);

    state.activeFile.hist.edited += Math.abs(diff);

    try {
        const w = await state.activeFile.handle.createWritable();
        await w.write(text);
        await w.close();
        state.activeFile.lastUpdated = new Date().toISOString();
        saveMetadata();
        if (isManual) notify('Cambios guardados');
        return true;
    } catch (err) {
        console.error('Error al guardar:', err);
        notify('Error al guardar', 'error');
        return false;
    }
}

function autoOpenFile() {
    const lastFile = localStorage.getItem('bg_last_file');
    if (lastFile) {
        try {
            const { pIdx, path } = JSON.parse(lastFile);
            window.openFileSmart(pIdx, path);
        } catch (e) {
            checkInitialReadme();
        }
    } else {
        checkInitialReadme();
    }
}

window.openFileSmart = async (pIdx, path) => {
    const item = findItemByPath(pIdx, path);
    if (!item) return;

    if (item.items && !item.handle.getFile) {
        window.exploreFolder(pIdx, path);
        return;
    }

    try {
        const fh = item.handle;
        if (!fh.getFile) throw new Error('No es un archivo');

        const file = await fh.getFile();
        const text = await file.text();

        state.activeFile = item;
        state.exploringFolder = null;
        state.activeParagraphIndex = undefined;
        el.editor.innerHTML = text || '<p><br></p>';

        item.sessionStartLength = text.length;
        if (!item.hist) item.hist = { added: 0, removed: 0, edited: 0 };
    } catch (err) {
        console.error(err);
        state.activeFile = item;
        el.editor.innerHTML = '<p><br></p>';
        notify('Error al abrir', 'error');
    }

    updateUI();
    updateStats();
    renderSidebar();
    state.activeProjectIndex = pIdx;
    item.lastUpdated = new Date().toISOString();
    localStorage.setItem('bg_last_file', JSON.stringify({ pIdx, path }));
};

window.closeFile = async () => {
    if (state.activeFile) {
        notify('Guardando...');
        await saveFileContent(false);
    }

    state.activeFile = null;
    state.exploringFolder = null;
    state.activeProjectIndex = undefined;
    updateUI();
    renderSidebar();
};

window.exploreFolder = (pIdx, path) => {
    const item = findItemByPath(pIdx, path);
    if (!item) return;

    state.activeFile = null;
    state.exploringFolder = { ...item, pIdx, path };
    state.activeProjectIndex = pIdx;
    updateUI();
    renderSidebar();
};

// ============================================
// GESTIÓN DE RUTAS Y UTILIDADES
// ============================================

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

function getIndexFromPath(path) {
    if (!path) return 0;
    const parts = path.split(',').map(Number);
    return parts[parts.length - 1];
}

window.handleFileClick = (e, pIdx, path) => {
    if (e.target.closest('.toggle-icon')) {
        window.toggleSidebarAccordion(e, pIdx, path);
        return;
    }

    const item = findItemByPath(pIdx, path);
    if (item && item.items && item.items.length > 0 && !item.open && !e.target.closest('.sub-nav-dots')) {
        item.open = true;
        renderSidebar();
    }
    openFileWithSave(pIdx, path);
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

window.showCtxManual = (e, type, pIdx, path) => {
    state.contextTarget = { type, pIdx, path };

    // Actualizar texto del menú según el tipo
    const ctxAddSub = document.getElementById('ctx-add-sub');
    if (ctxAddSub) {
        if (type === 'project') {
            ctxAddSub.innerHTML = '<i class="fas fa-file-plus"></i> <span>Nuevo Archivo</span>';
        } else {
            ctxAddSub.innerHTML = '<i class="fas fa-level-down-alt"></i> <span>Añadir Sub-archivo</span>';
        }
    }

    el.ctxMenu.classList.remove('hidden');
    el.ctxMenu.style.top = `${e.clientY}px`;
    el.ctxMenu.style.left = `${e.clientX}px`;
    el.ctxSidebarList.classList.remove('hidden');
};

// ============================================
// CONFIGURACIÓN Y PERSISTENCIA
// ============================================

function loadConfig() {
    const c = localStorage.getItem('bg_config');
    if (c) {
        try {
            const parsed = JSON.parse(c);
            state.config = {
                ...state.config,
                ...parsed,
                states: (parsed.states || []).map(s => ({
                    ...s,
                    countType: s.countType || 'absolute',
                    goal: s.goal || 30000
                })),
                shortcuts: { ...state.config.shortcuts, ...(parsed.shortcuts || {}) }
            };

            const autosaveInput = document.getElementById('autosave-interval');
            const goalInput = document.getElementById('default-goal');
            if (autosaveInput) autosaveInput.value = state.config.autosaveInterval || 30;
            if (goalInput) goalInput.value = state.config.defaultGoal || 30000;
        } catch (e) {
            console.warn('Error:', e);
        }
    }
}

function saveConfig() {
    const autosaveInput = document.getElementById('autosave-interval');
    const goalInput = document.getElementById('default-goal');

    if (autosaveInput) state.config.autosaveInterval = parseInt(autosaveInput.value) || 30;
    if (goalInput) state.config.defaultGoal = parseInt(goalInput.value) || 30000;

    localStorage.setItem('bg_config', JSON.stringify(state.config));
    saveWorkspaceCache();
    setupAutosave();
}

function saveMetadata() {
    const metaStr = JSON.stringify(state.projects.map(p => ({
        name: p.name,
        open: p.open,
        items: p.items.map(serialize)
    })));
    localStorage.setItem('bg_meta', metaStr);
    saveWorkspaceCache();
}

function serialize(item) {
    return {
        name: item.name,
        status: item.status,
        goal: item.goal,
        lastCharCount: item.lastCharCount,
        items: (item.items || []).map(serialize),
        comments: item.comments || [],
        lastUpdated: item.lastUpdated
    };
}

function deserialize(item) {
    return {
        name: item.name,
        status: item.status || 'draft',
        goal: item.goal || state.config.defaultGoal || 30000,
        lastCharCount: item.lastCharCount || 0,
        items: (item.items || []).map(deserialize),
        comments: item.comments || [],
        lastUpdated: item.lastUpdated
    };
}

function loadMetadata() {
    const r = localStorage.getItem('bg_meta');
    if (!r) return;

    try {
        const m = JSON.parse(r);
        state.projects.forEach(p => {
            const mt = m.find(x => x.name === p.name);
            if (mt) {
                p.open = mt.open;
                syncItems(p.items, mt.items);
            }
        });
    } catch (e) {
        console.warn('Error:', e);
    }
}

function syncItems(liveItems, cachedItems) {
    if (!liveItems || !cachedItems) return;

    liveItems.forEach(live => {
        const cached = cachedItems.find(c => c.name === live.name);
        if (cached) {
            applyMetadata(live, cached);
        }
    });
}

function applyMetadata(live, cached) {
    live.status = cached.status || 'draft';
    live.goal = cached.goal || state.config.defaultGoal || 30000;
    live.lastCharCount = cached.lastCharCount || 0;
    live.lastUpdated = cached.lastUpdated;
    live.comments = cached.comments || [];
    live.open = cached.open;
    live.syncDone = true;
    if (live.items && cached.items) {
        syncItems(live.items, cached.items);
    }
}

async function saveWorkspaceCache() {
    if (!state.workspaceHandle) return;

    try {
        const metadata = {
            version: '3.1',
            lastUpdated: new Date().toISOString(),
            config: state.config,
            userName: localStorage.getItem('bg_user_name'),
            avatar: localStorage.getItem('bg_avatar'),
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
        console.warn('Error:', err);
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
                    ...state.config,
                    ...metadata.config,
                    autosaveInterval: metadata.config.autosaveInterval || 30,
                    states: (metadata.config.states || []).map(s => ({
                        ...s,
                        countType: s.countType || 'absolute',
                        goal: s.goal || 30000
                    })),
                    shortcuts: { ...state.config.shortcuts, ...(metadata.config.shortcuts || {}) }
                };
            }

            if (metadata.userName) {
                localStorage.setItem('bg_user_name', metadata.userName);
                applyUserIdentity();
            }

            if (metadata.avatar) {
                localStorage.setItem('bg_avatar', metadata.avatar);
                loadAvatar();
            }

            state.projects = metadata.projects.map(p => ({
                name: p.name,
                open: p.open,
                items: (p.items || []).map(deserialize)
            }));
        }
    } catch (err) {
        console.log('Sin caché JSON');
    }
}


// ============================================
// SISTEMA DE AVATAR CON CROP
// ============================================

function setupAvatarUpload() {
    const avatarContainer = document.getElementById('avatar-container');
    const avatarInput = document.getElementById('avatar-upload-input');

    if (avatarContainer) {
        avatarContainer.onclick = () => avatarInput.click();
    }

    if (avatarInput) {
        avatarInput.onchange = handleAvatarSelect;
    }

    const cropBtns = document.querySelectorAll('.crop-ratio-btns button');
    cropBtns.forEach(btn => {
        btn.onclick = () => {
            cropBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.avatarCrop.ratio = parseFloat(btn.getAttribute('data-ratio'));
            redrawCropCanvas();
        };
    });

    const applyCropBtn = document.getElementById('apply-crop-btn');
    if (applyCropBtn) {
        applyCropBtn.onclick = applyCroppedAvatar;
    }
}

function handleAvatarSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        notify('Selecciona una imagen válida', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            state.avatarCrop.image = img;
            openAvatarCropModal();
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
}

function openAvatarCropModal() {
    document.getElementById('avatar-crop-modal').classList.add('open');
    redrawCropCanvas();
}

window.closeAvatarCropModal = () => {
    document.getElementById('avatar-crop-modal').classList.remove('open');
};

function redrawCropCanvas() {
    const canvas = document.getElementById('avatar-crop-canvas');
    const ctx = canvas.getContext('2d');
    const img = state.avatarCrop.image;

    if (!img || !canvas) return;

    const ratio = state.avatarCrop.ratio;
    const maxSize = 300;

    let width = img.width;
    let height = width / ratio;

    if (height > maxSize * ratio) {
        height = maxSize * ratio;
        width = height * ratio;
    }

    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
}

function applyCroppedAvatar() {
    const canvas = document.getElementById('avatar-crop-canvas');
    if (!canvas) return;

    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = 200;
    finalCanvas.height = 200 / state.avatarCrop.ratio;

    const ctx = finalCanvas.getContext('2d');
    ctx.drawImage(canvas, 0, 0, finalCanvas.width, finalCanvas.height);

    const dataUrl = finalCanvas.toDataURL('image/png');
    saveAvatar(dataUrl);
    window.closeAvatarCropModal();
}

function saveAvatar(dataUrl) {
    localStorage.setItem('bg_avatar', dataUrl);
    loadAvatar();
    saveWorkspaceCache();
    notify('Avatar actualizado');
}

function loadAvatar() {
    const avatarData = localStorage.getItem('bg_avatar');
    if (avatarData && el.userAvatar && el.userAvatarPlaceholder) {
        el.userAvatar.src = avatarData;
        el.userAvatar.classList.add('visible');
        el.userAvatarPlaceholder.classList.add('hidden');

        const settingsAvatar = document.getElementById('settings-avatar-img');
        const settingsPlaceholder = document.getElementById('settings-avatar-placeholder');
        if (settingsAvatar && settingsPlaceholder) {
            settingsAvatar.src = avatarData;
            settingsAvatar.classList.add('visible');
            settingsPlaceholder.classList.add('hidden');
        }
    }
}

function removeAvatar() {
    localStorage.removeItem('bg_avatar');
    el.userAvatar.src = '';
    el.userAvatar.classList.remove('visible');
    el.userAvatarPlaceholder.classList.remove('hidden');

    const settingsAvatar = document.getElementById('settings-avatar-img');
    const settingsPlaceholder = document.getElementById('settings-avatar-placeholder');
    if (settingsAvatar) settingsAvatar.classList.remove('visible');
    if (settingsPlaceholder) settingsPlaceholder.classList.remove('hidden');

    saveWorkspaceCache();
    notify('Avatar eliminado');
}

function updateSettingsAvatar() {
    const avatarData = localStorage.getItem('bg_avatar');
    const settingsAvatar = document.getElementById('settings-avatar-img');
    const settingsPlaceholder = document.getElementById('settings-avatar-placeholder');

    if (settingsAvatar && settingsPlaceholder) {
        if (avatarData) {
            settingsAvatar.src = avatarData;
            settingsAvatar.classList.add('visible');
            settingsPlaceholder.classList.add('hidden');
        } else {
            settingsAvatar.classList.remove('visible');
            settingsPlaceholder.classList.remove('hidden');
        }
    }
}

// ============================================
// SISTEMA DE TEMAS
// ============================================

function applyTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    state.config.theme = theme;

    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-theme') === theme);
    });

    document.querySelectorAll('.theme-preview-card').forEach(card => {
        card.classList.toggle('active', card.getAttribute('data-theme') === theme);
    });

    localStorage.setItem('bg_theme', theme);
}

function setupCustomColorPickers() {
    const colorInputs = [
        { color: 'custom-bg-primary', hex: 'custom-bg-primary-hex' },
        { color: 'custom-bg-secondary', hex: 'custom-bg-secondary-hex' },
        { color: 'custom-accent', hex: 'custom-accent-hex' },
        { color: 'custom-text', hex: 'custom-text-hex' }
    ];

    colorInputs.forEach(pair => {
        const colorInput = document.getElementById(pair.color);
        const hexInput = document.getElementById(pair.hex);

        if (colorInput && hexInput) {
            colorInput.oninput = () => {
                hexInput.value = colorInput.value;
            };

            hexInput.oninput = () => {
                if (/^#[0-9A-Fa-f]{6}$/.test(hexInput.value)) {
                    colorInput.value = hexInput.value;
                }
            };
        }
    });
}

function saveCustomTheme() {
    const themeName = document.getElementById('custom-theme-name')?.value || 'Mi Tema';
    const customTheme = {
        name: themeName,
        bgPrimary: document.getElementById('custom-bg-primary').value,
        bgSecondary: document.getElementById('custom-bg-secondary').value,
        accent: document.getElementById('custom-accent').value,
        text: document.getElementById('custom-text').value
    };

    document.documentElement.style.setProperty('--bg-primary', customTheme.bgPrimary);
    document.documentElement.style.setProperty('--bg-secondary', customTheme.bgSecondary);
    document.documentElement.style.setProperty('--accent-blue', customTheme.accent);
    document.documentElement.style.setProperty('--text-primary', customTheme.text);

    state.config.customTheme = customTheme;
    state.config.theme = 'custom';

    localStorage.setItem('bg_custom_theme', JSON.stringify(customTheme));
    localStorage.setItem('bg_theme', 'custom');

    notify(`Tema "${themeName}" guardado`);
}

// ============================================
// EXPORTAR/IMPORTAR DATOS
// ============================================

function setupDataManagement() {
    const exportBtn = document.getElementById('export-data-btn');
    const importBtn = document.getElementById('import-data-btn');
    const importInput = document.getElementById('import-data-input');
    const clearBtn = document.getElementById('clear-cache-btn');

    if (exportBtn) exportBtn.onclick = exportAllData;
    if (importBtn) importBtn.onclick = () => importInput.click();
    if (importInput) importInput.onchange = importDataHandler;
    if (clearBtn) clearBtn.onclick = clearCache;
}

function exportAllData() {
    const data = {
        exportDate: new Date().toISOString(),
        version: '3.1',
        config: state.config,
        userName: localStorage.getItem('bg_user_name'),
        avatar: localStorage.getItem('bg_avatar'),
        meta: localStorage.getItem('bg_meta'),
        projects: state.projects.map(p => ({
            name: p.name,
            open: p.open,
            items: p.items.map(serialize)
        }))
    };

    const blob = new Blob([JSON.stringify(data, null, 4)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `block_guard_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    notify('Datos exportados');
}

function importDataHandler(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const data = JSON.parse(event.target.result);

            if (data.config) {
                state.config = { ...state.config, ...data.config };
                localStorage.setItem('bg_config', JSON.stringify(state.config));
            }

            if (data.userName) {
                localStorage.setItem('bg_user_name', data.userName);
            }

            if (data.avatar) {
                localStorage.setItem('bg_avatar', data.avatar);
                loadAvatar();
            }

            if (data.projects) {
                state.projects = data.projects.map(p => ({
                    name: p.name,
                    open: p.open,
                    items: (p.items || []).map(deserialize)
                }));
                localStorage.setItem('bg_meta', JSON.stringify(data.projects.map(p => ({
                    name: p.name,
                    open: p.open,
                    items: p.items.map(serialize)
                }))));
                renderSidebar();
            }

            if (data.config?.theme) {
                applyTheme(data.config.theme);
            }

            updateUI();
            applyUserIdentity();

            if (state.workspaceHandle) {
                await saveWorkspaceCache();
            }

            notify('Datos importados correctamente');
        } catch (err) {
            console.error(err);
            notify('Error al importar', 'error');
        }
    };
    reader.readAsText(file);
    e.target.value = '';
}

async function clearCache() {
    const confirmed = await confirmCustom(
        'Limpiar Caché',
        'Esto eliminará toda la caché local, datos del navegador y configuraciones. ¿Continuar?',
        'Limpiar Todo'
    );

    if (confirmed) {
        localStorage.clear();

        try {
            const databases = await indexedDB.databases();
            databases.forEach(db => {
                if (db.name) {
                    indexedDB.deleteDatabase(db.name);
                }
            });
        } catch (e) {
            console.warn('Error:', e);
        }

        sessionStorage.clear();

        notify('Caché limpiada. Recargando...');

        setTimeout(() => {
            location.reload();
        }, 1500);
    }
}

// ============================================
// IDENTIDAD DE USUARIO
// ============================================

function applyUserIdentity() {
    const savedName = localStorage.getItem('bg_user_name');
    const folderName = state.workspaceHandle ? state.workspaceHandle.name : 'Escritor';
    const finalName = savedName || folderName;

    const sideName = document.getElementById('user-name-display');
    if (sideName) sideName.innerText = finalName;

    const welcomeUser = document.getElementById('welcome-user-name');
    if (welcomeUser) welcomeUser.innerText = finalName;
}

// ============================================
// MODALES Y NOTIFICACIONES
// ============================================

function notify(msg, type = 'info') {
    const n = document.createElement('div');
    n.className = `notification ${type}`;
    n.innerHTML = `<i class="fas fa-info-circle"></i> ${escapeHtml(msg)}`;
    el.notificationContainer.appendChild(n);

    setTimeout(() => {
        n.style.opacity = '0';
        setTimeout(() => n.remove(), 400);
    }, 3000);
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

// ============================================
// OPERACIONES DE ARCHIVOS
// ============================================

async function renameItem() {
    const t = state.contextTarget;
    const item = findItemByPath(t.pIdx, t.path);
    if (!item) return;

    const n = await promptCustom('Nuevo nombre:', item.name);
    if (!n) return;

    const isFolder = item.items && item.items.length > 0;
    const newName = n.endsWith('.txt') || isFolder ? n : n + '.txt';

    try {
        const oldName = item.name;
        if (item.handle && item.handle.move) {
            await item.handle.move(newName);
        }

        item.name = newName;

        if (item.items && item.items.length > 0) {
            item.items.forEach(child => {
                child.projectName = newName;
                if (child.items && child.items.length > 0) {
                    updateChildrenProjectName(child.items, newName);
                }
            });
        }

        saveMetadata();
        renderSidebar();

        if (state.activeFile === item) {
            updateUI();
        }

        notify('Nombre actualizado correctamente');
    } catch (err) {
        console.error('Rename failed:', err);
        notify('No se pudo renombrar el archivo', 'error');
    }
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
        if (item.handle && item.handle.remove) {
            await item.handle.remove({ recursive: true });
        } else if (t.type === 'project') {
            await state.workspaceHandle.getDirectoryHandle('data', { create: false }).then(d => d.removeEntry(item.name, { recursive: true }));
        }

        const col = getParentCollection(t.pIdx, t.path);
        const idx = t.type === 'project' ? t.pIdx : getIndexFromPath(t.path);

        if (t.type !== 'project' && item.items && item.items.length > 0) {
            const parentCollection = col;
            const insertIndex = idx;
            const children = item.items;
            const parentName = item.name.replace('.txt', '');
            children.forEach(child => {
                child.open = false;
                child.projectName = parentName;
                if (child.items && child.items.length > 0) {
                    updateChildrenProjectName(child.items, parentName);
                }
            });
            parentCollection.splice(insertIndex, 1, ...children);
        } else {
            col.splice(idx, 1);
        }

        if (state.activeFile === item) window.closeFile();
        renderSidebar(); saveMetadata(); updateUI();
        notify('Elemento eliminado');
    } catch (err) {
        console.error(err);
        notify('Error al eliminar', 'error');
    }
}

function updateChildrenProjectName(itemsArray, newParentName) {
    itemsArray.forEach(child => {
        child.projectName = newParentName;
        if (child.items && child.items.length > 0) {
            updateChildrenProjectName(child.items, newParentName);
        }
    });
}

function upgradeStatusAction() {
    const item = state.activeFile || findItemByPath(state.contextTarget?.pIdx, state.contextTarget?.path);
    if (!item) return;

    const cur = state.config.states.findIndex(s => s.id === item.status);
    if (cur === -1) {
        item.status = state.config.states[0].id;
        notify('Estado reiniciado');
    } else if (cur === state.config.states.length - 1) {
        item.status = state.config.states[0].id;
        notify('Estado reiniciado');
    } else {
        item.status = state.config.states[cur + 1].id;
        notify('Estado actualizado');
    }

    updateUI();
    renderSidebar();
    saveMetadata();
}

// ============================================
// CORRECCIÓN ORTOGRÁFICA
// ============================================

function toggleSpellCheck() {
    if (!state.activeFile) return;

    const dontShowAgain = localStorage.getItem('bg_spell_dont_show');

    if (dontShowAgain === 'true') {
        performSpellCheckRedirect();
    } else {
        confirmSpellCheckWithCheckbox();
    }
}

function confirmSpellCheckWithCheckbox() {
    const modal = document.getElementById('spell-modal');
    const checkbox = document.getElementById('spell-dont-show');
    const confirmBtn = document.getElementById('spell-confirm-btn');

    if (checkbox) checkbox.checked = false;

    confirmBtn.onclick = () => {
        if (checkbox && checkbox.checked) {
            localStorage.setItem('bg_spell_dont_show', 'true');
        }
        modal.classList.remove('open');
        performSpellCheckRedirect();
    };

    modal.classList.add('open');
}

function performSpellCheckRedirect() {
    navigator.clipboard.writeText(el.editor.innerText).then(() => {
        notify('Texto copiado. Abriendo corrector...');
        window.open('https://www.correctoronline.es/', '_blank');
    }).catch(() => {
        window.open('https://www.correctoronline.es/', '_blank');
    });
}

// ============================================
// UTILIDADES
// ============================================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

window.quickAdd = (idx) => {
    const p = state.projects[idx];
    if (p && p.items.length > 0) {
        openFileWithSave(idx, "0");
    } else {
        state.contextTarget = { type: 'project', pIdx: idx, path: "" };
        createFileSystemItemAction();
    }
};

window.updateStateColor = (i, v) => {
    state.config.states[i].color = v;
    saveConfig();
    updateUI();
    renderSidebar();
};

window.updateStateName = (i, v) => {
    state.config.states[i].name = v;
    saveConfig();
    updateUI();
    renderSidebar();
};

window.updateStateAction = (i, v) => {
    state.config.states[i].countType = v;
    saveConfig();
    updateUI();
    renderSidebar();
};

window.removeState = async (i) => {
    const ok = await confirmCustom('Eliminar Estado', '¿Estás seguro?', 'Eliminar');
    if (ok) {
        state.config.states.splice(i, 1);
        saveConfig();
        renderStateConfig();
        updateUI();
        renderSidebar();
    }
};

window.moveStateUp = (i) => {
    if (i <= 0) return;
    const item = state.config.states.splice(i, 1)[0];
    state.config.states.splice(i - 1, 0, item);
    saveConfig();
    renderStateConfig();
    updateUI();
    renderSidebar();
};

window.moveStateDown = (i) => {
    if (i >= state.config.states.length - 1) return;
    const item = state.config.states.splice(i, 1)[0];
    state.config.states.splice(i + 1, 0, item);
    saveConfig();
    renderStateConfig();
    updateUI();
    renderSidebar();
};

window.editStateName = async (index) => {
    const s = state.config.states[index];
    const newName = await promptCustom('Nombre del estado:', s.name);
    if (newName) {
        s.name = newName;
        renderStateConfig();
    }
};

window.editStateAction = async (index) => {
    const s = state.config.states[index];
    const actionLabels = {
        'absolute': 'Contar Totales',
        'edited': 'Contar Ediciones',
        'delta': 'Contar Nuevos'
    };

    const currentLabel = actionLabels[s.countType] || 'Contar Totales';
    const action = await promptCustom('Tipo de conteo:', currentLabel);
    if (!action) return;

    const actionLower = action.toLowerCase();
    let newAction = s.countType;

    if (actionLower.includes('total')) {
        newAction = 'absolute';
    } else if (actionLower.includes('edicion') || actionLower.includes('editado')) {
        newAction = 'edited';
    } else if (actionLower.includes('nuevo') || actionLower.includes('delta')) {
        newAction = 'delta';
    }

    s.countType = newAction;
    renderStateConfig();
    saveConfig();
};

// ============================================
// BASE DE DATOS INDEXEDDB
// ============================================

async function saveHandle(h) {
    const db = await getDB();
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').put(h, 'rootHandle');
}

async function loadHandle() {
    const db = await getDB();
    const tx = db.transaction('handles', 'readonly');
    return new Promise(resolve => {
        const req = tx.objectStore('handles').get('rootHandle');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
    });
}

function getDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('BlockGuardDB', 1);
        req.onupgradeneeded = () => {
            req.result.createObjectStore('handles');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

// ============================================
// ARCHIVO DE BIENVENIDA
// ============================================

async function checkInitialReadme() {
    if (state.projects.length === 0 && state.workspaceHandle) {
        try {
            const data = await state.workspaceHandle.getDirectoryHandle('data', { create: true });
            const h = await data.getDirectoryHandle('Guía de Inicio', { create: true });
            const fh = await h.getFileHandle('Bienvenida.txt', { create: true });

            const w = await fh.createWritable();
            await w.write(`<h1>Bienvenido a Block Guard</h1>
<p>Block Guard es tu editor de texto personal. Organiza tus proyectos y escribe sin distracciones.</p>

<h3>Cómo empezar:</h3>
<ul>
    <li>Crea proyectos desde el sidebar</li>
    <li>Añade archivos a tus proyectos</li>
    <li>Usa los estados para seguir tu progreso</li>
    <li>Personaliza el tema desde Configuración</li>
</ul>

<p>¡Empieza a escribir!</p>`);
            await w.close();

            await scanWorkspace();
            renderSidebar();

            if (state.projects.length > 0 && state.projects[0].items.length > 0) {
                window.openFileSmart(0, "0");
            }
        } catch (err) {
            console.error(err);
        }
    }
}

// ============================================
// EXPONER FUNCIONES A WINDOW
// ============================================

window.createProjectAction = createProjectAction;
window.selectWorkspace = selectWorkspace;
window.createFileSystemItemAction = createFileSystemItemAction;
window.renameItem = renameItem;
window.deleteItemSmart = deleteItemSmart;
window.upgradeStatusAction = upgradeStatusAction;
window.requestWorkspacePermission = requestWorkspacePermission;
window.promptCustom = window.promptCustom;
window.closeInputModal = window.closeInputModal;
window.confirmCustom = window.confirmCustom;
window.closeConfirmModal = window.closeConfirmModal;
window.closeAvatarCropModal = window.closeAvatarCropModal;
window.handleFileClick = window.handleFileClick;
window.toggleSidebarAccordion = window.toggleSidebarAccordion;
window.showCtxManual = window.showCtxManual;
window.quickAdd = window.quickAdd;
window.updateStateColor = window.updateStateColor;
window.updateStateName = window.updateStateName;
window.updateStateAction = window.updateStateAction;
window.removeState = window.removeState;
window.moveStateUp = window.moveStateUp;
window.moveStateDown = window.moveStateDown;
window.editStateName = window.editStateName;
window.editStateAction = window.editStateAction;
window.applyTheme = applyTheme;
window.startRecordingShortcut = startRecordingShortcut;
window.resetShortcut = resetShortcut;
window.openFileWithSave = openFileWithSave;
window.openFileSmart = window.openFileSmart;
window.closeFile = window.closeFile;
window.exploreFolder = window.exploreFolder;

// ============================================
// INICIAR APLICACIÓN
// ============================================

init();
