class PopupNotesApp {
    constructor() {
        this.folders = [];
        this.notes = [];
        this.activeFolderId = 'default';
        this.colors = ['#FFF9C4', '#F8BBD0', '#E1BEE7', '#BBDEFB', '#C8E6C9'];

        this.board = document.getElementById('board');
        this.folderList = document.getElementById('folder-list');
        this.contextMenu = document.getElementById('context-menu');
        this.contextFolderList = document.getElementById('context-folder-list');

        this.contextTargetId = null;
        this.saveTimeout = null;

        this.init();
    }

    async init() {
        const data = await chrome.storage.local.get(['folders', 'notes', 'activeFolderId']);
        this.folders = data.folders || [{ id: 'default', name: 'My Notes', createdAt: Date.now() }];
        this.notes = data.notes || [];
        if (data.activeFolderId && this.folders.find(f => f.id === data.activeFolderId)) {
            this.activeFolderId = data.activeFolderId;
        } else {
            this.activeFolderId = this.folders[0].id;
        }

        if (this.notes.length === 0) {
            this.createNote("Welcome!", "Double click to edit.\nPress Ctrl+Shift+9 for a checklist.\nRight-click for options.");
        }

        this.bindEvents();
        this.renderFolders();
        this.renderBoard();
        document.getElementById('shortcut-focus').focus();
    }

    bindEvents() {
        document.getElementById('btn-new-folder').addEventListener('click', () => this.createFolder());
        document.getElementById('fab-new-note').addEventListener('click', () => this.createNote());

        document.addEventListener('keydown', (e) => {
            // Escape to close menus or blur
            if (e.key === 'Escape') {
                if (document.activeElement) document.activeElement.blur();
                this.closeContextMenu();
            }
            // Ctrl+N for New Note
            if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
                e.preventDefault();
                this.createNote();
            }
            // Ctrl+Shift+F for New Folder
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'f') {
                e.preventDefault();
                this.createFolder();
            }
            // Ctrl+Shift+9 for Checklist Toggle
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === '9') {
                e.preventDefault();
                this.toggleChecklistForSelection();
            }
        });

        // Delegate Checkbox clicks for strict state saving
        this.board.addEventListener('change', (e) => {
            if (e.target.classList.contains('task-cb')) {
                const parentDiv = e.target.closest('div');
                if (parentDiv) {
                    e.target.checked ? parentDiv.classList.add('line-checked') : parentDiv.classList.remove('line-checked');
                }
                const noteEl = e.target.closest('.note');
                if (noteEl) this.saveNoteContent(noteEl.id);
            }
        });

        // Context Menu Setup
        document.addEventListener('contextmenu', (e) => this.handleContextMenu(e));
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.context-menu')) this.closeContextMenu();
        });
        document.getElementById('context-delete').addEventListener('click', () => {
            if (this.contextTargetId) this.deleteNote(this.contextTargetId);
            this.closeContextMenu();
        });
    }

    // --- State & Storage ---
    saveData() {
        clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => {
            chrome.storage.local.set({
                folders: this.folders,
                notes: this.notes,
                activeFolderId: this.activeFolderId
            });
        }, 300); // Faster debounce for popup environment
    }

    // --- Folders ---
    createFolder() {
        const name = prompt('Folder name:');
        if (!name) return;
        const id = 'folder_' + Date.now();
        this.folders.push({ id, name, createdAt: Date.now() });
        this.activeFolderId = id;
        this.renderFolders();
        this.renderBoard();
        this.saveData();
    }

    deleteFolder(id) {
        if (this.folders.length === 1) return alert('Cannot delete your only folder.');
        if (!confirm('Delete folder and all notes inside?')) return;

        this.folders = this.folders.filter(f => f.id !== id);
        this.notes = this.notes.filter(n => n.folderId !== id);
        this.activeFolderId = this.folders[0].id;

        this.renderFolders();
        this.renderBoard();
        this.saveData();
    }

    renderFolders() {
        this.folderList.innerHTML = '';
        this.folders.forEach(folder => {
            const li = document.createElement('li');
            li.className = `folder-item ${folder.id === this.activeFolderId ? 'active' : ''}`;

            const span = document.createElement('span');
            span.textContent = folder.name;
            span.onclick = () => {
                this.activeFolderId = folder.id;
                this.renderFolders();
                this.renderBoard();
                this.saveData();
            };
            li.appendChild(span);

            const actions = document.createElement('div');
            actions.className = 'folder-actions';
            const delBtn = document.createElement('button');
            delBtn.innerHTML = '✖';
            delBtn.onclick = (e) => { e.stopPropagation(); this.deleteFolder(folder.id); };

            actions.appendChild(delBtn);
            li.appendChild(actions);
            this.folderList.appendChild(li);
        });
    }

    // --- Notes ---
    createNote(title = "", body = "") {
        const note = {
            id: 'note_' + Date.now(),
            folderId: this.activeFolderId,
            title: title,
            body: body || '<div><br></div>',
            color: this.colors[Math.floor(Math.random() * this.colors.length)],
        };

        this.notes.unshift(note); // Add to beginning of grid
        this.renderBoard();
        this.saveData();

        setTimeout(() => {
            const el = document.getElementById(note.id);
            if (el) el.querySelector('.note-title').focus();
        }, 50);
    }

    deleteNote(id) {
        this.notes = this.notes.filter(n => n.id !== id);
        const el = document.getElementById(id);
        if (el) el.remove();
        this.saveData();
    }

    cycleColor(noteId) {
        const note = this.notes.find(n => n.id === noteId);
        if (!note) return;
        const nextIndex = (this.colors.indexOf(note.color) + 1) % this.colors.length;
        note.color = this.colors[nextIndex];
        document.getElementById(noteId).style.backgroundColor = note.color;
        this.saveData();
    }

    renderBoard() {
        this.board.innerHTML = '';
        const currentNotes = this.notes.filter(n => n.folderId === this.activeFolderId);
        currentNotes.forEach(note => this.buildNoteDOM(note));
    }

    buildNoteDOM(note) {
        const el = document.createElement('div');
        el.className = 'note';
        el.id = note.id;
        el.style.backgroundColor = note.color;

        const header = document.createElement('div');
        header.className = 'note-header';

        // Checkbox Toolbar Button
        const checkBtn = document.createElement('button');
        checkBtn.className = 'note-btn';
        checkBtn.innerHTML = '☑';
        checkBtn.title = "Toggle Checklist (Ctrl+Shift+9)";
        checkBtn.onclick = () => {
            el.querySelector('.note-body').focus();
            this.toggleChecklistForSelection();
        };

        const colorBtn = document.createElement('button');
        colorBtn.className = 'note-btn';
        colorBtn.innerHTML = '🎨';
        colorBtn.onclick = () => this.cycleColor(note.id);

        header.append(checkBtn, colorBtn);

        const titleInput = document.createElement('input');
        titleInput.className = 'note-title';
        titleInput.type = 'text';
        titleInput.placeholder = 'Untitled';
        titleInput.value = note.title;
        titleInput.addEventListener('input', (e) => {
            note.title = e.target.value;
            this.saveData();
        });

        const bodyEl = document.createElement('div');
        bodyEl.className = 'note-body';
        bodyEl.contentEditable = true;
        bodyEl.innerHTML = note.body;

        bodyEl.addEventListener('input', () => this.saveNoteContent(note.id));

        el.append(header, titleInput, bodyEl);
        this.board.appendChild(el);
    }

    saveNoteContent(id) {
        const note = this.notes.find(n => n.id === id);
        const el = document.getElementById(id);
        if (note && el) {
            note.body = el.querySelector('.note-body').innerHTML;
            this.saveData();
        }
    }

    // --- Checklist Logic ---
    toggleChecklistForSelection() {
        const sel = window.getSelection();
        if (!sel.rangeCount) return;

        let node = sel.focusNode;
        // Ensure we are inside a note body
        const noteBody = node.nodeType === 3 ? node.parentElement.closest('.note-body') : node.closest('.note-body');
        if (!noteBody) return;

        // Force wrap text in a block element (div) if not already
        document.execCommand('formatBlock', false, 'div');

        // Find the block container of the current cursor
        let blockNode = sel.focusNode;
        while (blockNode && blockNode.nodeType === 3) blockNode = blockNode.parentElement;
        if (!blockNode || blockNode === noteBody) return;

        const hasCheckbox = blockNode.querySelector('.task-cb');

        if (hasCheckbox) {
            // Remove checklist
            hasCheckbox.remove();
            blockNode.classList.remove('line-checked');
            // Clean up leading spaces left behind
            blockNode.innerHTML = blockNode.innerHTML.replace(/^&nbsp;/, '').trim();
        } else {
            // Add checklist
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'task-cb';
            blockNode.insertBefore(cb, blockNode.firstChild);
            blockNode.insertBefore(document.createTextNode('\u00A0'), cb.nextSibling); // Add space
        }

        const noteId = noteBody.closest('.note').id;
        this.saveNoteContent(noteId);
    }

    // --- Context Menu ---
    handleContextMenu(e) {
        const noteEl = e.target.closest('.note');
        if (noteEl) {
            e.preventDefault();
            this.contextTargetId = noteEl.id;

            // Constrain menu within popup bounds
            let x = e.clientX;
            let y = e.clientY;
            if (x + 160 > window.innerWidth) x = window.innerWidth - 165;
            if (y + 100 > window.innerHeight) y = window.innerHeight - 105;

            this.contextMenu.style.left = `${x}px`;
            this.contextMenu.style.top = `${y}px`;
            this.contextMenu.classList.remove('hidden');

            this.populateContextFolderList();
        } else {
            this.closeContextMenu();
        }
    }

    populateContextFolderList() {
        this.contextFolderList.innerHTML = '';
        this.folders.forEach(folder => {
            if (folder.id !== this.activeFolderId) {
                const item = document.createElement('div');
                item.className = 'menu-item';
                item.textContent = folder.name;
                item.onclick = () => {
                    const note = this.notes.find(n => n.id === this.contextTargetId);
                    if (note) {
                        note.folderId = folder.id;
                        this.saveData();
                        this.renderBoard();
                    }
                    this.closeContextMenu();
                };
                this.contextFolderList.appendChild(item);
            }
        });

        if (this.contextFolderList.children.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'menu-item';
            empty.style.color = '#888';
            empty.textContent = 'No other folders';
            this.contextFolderList.appendChild(empty);
        }
    }

    closeContextMenu() {
        this.contextMenu.classList.add('hidden');
        this.contextTargetId = null;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new PopupNotesApp();
});