class StickyNotesApp {
    constructor() {
        this.folders = [];
        this.notes = [];
        this.activeFolderId = 'default';
        this.colors = ['#FFF9C4', '#F8BBD0', '#E1BEE7', '#BBDEFB', '#C8E6C9'];

        // DOM Elements
        this.board = document.getElementById('board');
        this.folderList = document.getElementById('folder-list');
        this.contextMenu = document.getElementById('context-menu');
        this.contextFolderList = document.getElementById('context-folder-list');

        // State
        this.dragState = { isDragging: false, noteId: null, offsetX: 0, offsetY: 0, highestZ: 10 };
        this.contextTargetId = null;
        this.saveTimeout = null;

        this.init();
    }

    async init() {
        // Load data
        const data = await chrome.storage.local.get(['folders', 'notes']);
        this.folders = data.folders || [{ id: 'default', name: 'My Notes', createdAt: Date.now() }];
        this.notes = data.notes || [];

        // Example Note on fresh install
        if (this.notes.length === 0) {
            this.createNote(200, 150, "Welcome! 🎉", "Double click to edit.\nType [] or [x] and press Space to create a checklist.\nRight-click me for options.");
        }

        this.bindEvents();
        this.renderFolders();
        this.renderBoard();
        document.getElementById('shortcut-focus').focus();
    }

    // --- Core Events & Listeners ---
    bindEvents() {
        document.getElementById('btn-new-folder').addEventListener('click', () => this.createFolder());
        document.getElementById('fab-new-note').addEventListener('click', () => this.createNote());

        // Keyboard Shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (document.activeElement) document.activeElement.blur();
                this.closeContextMenu();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
                e.preventDefault();
                this.createNote();
            }
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
                e.preventDefault();
                this.createFolder();
            }
        });

        // Board Delegation for Checkboxes
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

        // Dragging
        document.addEventListener('mousemove', (e) => this.onDrag(e));
        document.addEventListener('mouseup', () => this.onDragEnd());

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

    // --- Storage ---
    saveData() {
        clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => {
            chrome.storage.local.set({ folders: this.folders, notes: this.notes });
        }, 500);
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
    createNote(x = null, y = null, title = "", body = "") {
        const offset = (this.notes.filter(n => n.folderId === this.activeFolderId).length % 10) * 20;

        const note = {
            id: 'note_' + Date.now(),
            folderId: this.activeFolderId,
            title: title,
            body: body || '<div><br></div>', // Ensure div wrapping for checklists
            color: this.colors[Math.floor(Math.random() * this.colors.length)],
            x: x !== null ? x : 150 + offset,
            y: y !== null ? y : 150 + offset,
            r: (Math.random() * 6) - 3, // Random slight rotation
            z: ++this.dragState.highestZ
        };

        this.notes.push(note);
        this.renderBoard();
        this.saveData();

        // Focus title
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
        el.style.left = note.x + 'px';
        el.style.top = note.y + 'px';
        el.style.backgroundColor = note.color;
        el.style.transform = `rotate(${note.r}deg)`;
        el.style.zIndex = note.z || 10;

        // Bring to front
        el.addEventListener('mousedown', () => {
            note.z = ++this.dragState.highestZ;
            el.style.zIndex = note.z;
        });

        // Header (Drag handle & Toolbar)
        const header = document.createElement('div');
        header.className = 'note-header';
        header.addEventListener('mousedown', (e) => this.onDragStart(e, note, el));

        const colorBtn = document.createElement('button');
        colorBtn.className = 'note-btn';
        colorBtn.innerHTML = '🎨';
        colorBtn.onclick = () => this.cycleColor(note.id);

        header.appendChild(colorBtn);

        // Title Input
        const titleInput = document.createElement('input');
        titleInput.className = 'note-title';
        titleInput.type = 'text';
        titleInput.placeholder = 'Title...';
        titleInput.value = note.title;
        titleInput.addEventListener('input', (e) => {
            note.title = e.target.value;
            this.saveData();
        });

        // Body ContentEditable
        const bodyEl = document.createElement('div');
        bodyEl.className = 'note-body';
        bodyEl.contentEditable = true;
        bodyEl.innerHTML = note.body;

        // Auto-save and Checkbox parsing logic
        bodyEl.addEventListener('input', () => this.saveNoteContent(note.id));
        bodyEl.addEventListener('keydown', (e) => this.handleChecklistFormatting(e, bodyEl, note.id));

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

    // --- Checklist Magic Parser ---
    handleChecklistFormatting(e, bodyEl, noteId) {
        // Trigger formatting when user types space after [] or [x]
        if (e.key === ' ') {
            const sel = window.getSelection();
            if (!sel.isCollapsed) return;

            const node = sel.focusNode;
            if (node && node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent;
                const offset = sel.focusOffset;

                // Regex checks if cursor is immediately after [] or [x] or [ ]
                const match = text.slice(0, offset).match(/\[( |x|)\]$/i);

                if (match) {
                    e.preventDefault();
                    const markerLen = match[0].length;
                    const isChecked = match[1].toLowerCase() === 'x';

                    // 1. Remove the text brackets
                    node.textContent = text.slice(0, offset - markerLen) + text.slice(offset);

                    // 2. Wrap current line in a div if not already (contenteditable creates divs natively, but just in case)
                    let parentElement = node.parentElement;
                    if (parentElement === bodyEl) {
                        document.execCommand('formatBlock', false, 'div');
                        parentElement = sel.focusNode.parentElement;
                    }

                    // 3. Create the checkbox input
                    const cb = document.createElement('input');
                    cb.type = 'checkbox';
                    cb.className = 'task-cb';
                    cb.checked = isChecked;

                    if (isChecked) parentElement.classList.add('line-checked');

                    // 4. Insert checkbox at caret position
                    const range = sel.getRangeAt(0);
                    range.setStart(node, offset - markerLen);
                    range.collapse(true);
                    range.insertNode(cb);

                    // 5. Add space and reset caret
                    const space = document.createTextNode('\u00A0');
                    range.setStartAfter(cb);
                    range.collapse(true);
                    range.insertNode(space);

                    range.setStartAfter(space);
                    sel.removeAllRanges();
                    sel.addRange(range);

                    this.saveNoteContent(noteId);
                }
            }
        }
    }

    // --- Drag & Drop ---
    onDragStart(e, note, el) {
        if (e.target.tagName === 'BUTTON') return;
        this.dragState = {
            isDragging: true, noteId: note.id, el: el, noteRef: note,
            offsetX: e.clientX - note.x, offsetY: e.clientY - note.y
        };
        el.classList.add('dragging');
        el.style.transform = `rotate(0deg) scale(1.02)`;
    }

    onDrag(e) {
        if (!this.dragState.isDragging) return;
        e.preventDefault();
        const newX = e.clientX - this.dragState.offsetX;
        const newY = e.clientY - this.dragState.offsetY;
        this.dragState.el.style.left = newX + 'px';
        this.dragState.el.style.top = newY + 'px';
        this.dragState.noteRef.x = newX;
        this.dragState.noteRef.y = newY;
    }

    onDragEnd() {
        if (!this.dragState.isDragging) return;
        const { el, noteRef } = this.dragState;
        el.classList.remove('dragging');
        el.style.transform = `rotate(${noteRef.r}deg)`;
        this.dragState.isDragging = false;
        this.saveData();
    }

    // --- Right-Click Context Menu ---
    handleContextMenu(e) {
        const noteEl = e.target.closest('.note');
        if (noteEl) {
            e.preventDefault(); // Prevent browser menu
            this.contextTargetId = noteEl.id;

            this.contextMenu.style.left = `${e.pageX}px`;
            this.contextMenu.style.top = `${e.pageY}px`;
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

        // Hide submenu if no other folders exist
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
    window.app = new StickyNotesApp();
});