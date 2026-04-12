class NotesApp {
    constructor() {
        this.folders = [];
        this.notes = [];
        this.activeFolderId = 'quick-jot';
        this.colors = ['#FFF9C4', '#F8BBD0', '#E1BEE7', '#BBDEFB', '#C8E6C9'];

        // DOM Elements
        this.board = document.getElementById('board');
        this.folderList = document.getElementById('folder-list');
        this.emptyState = document.getElementById('empty-state');
        this.sidebar = document.getElementById('sidebar');

        // State for dragging
        this.dragState = { isDragging: false, noteId: null, offsetX: 0, offsetY: 0, highestZ: 10 };
        this.saveTimeout = null;

        this.init();
    }

    async init() {
        // Load data from Chrome Storage
        const data = await chrome.storage.local.get(['folders', 'notes']);

        this.folders = data.folders || [{ id: 'quick-jot', name: 'Quick Jot' }];
        this.notes = data.notes || [];

        // First install mock note
        if (!data.folders && !data.notes) {
            this.addNote('quick-jot', 100, 100, 'Welcome to your new wall!\n\n- Double click to type\n- Drag to move\n- Ctrl+N to add notes');
        }

        this.bindEvents();
        this.renderFolders();
        this.renderBoard();
        document.getElementById('shortcut-focus').focus();
    }

    bindEvents() {
        // Sidebar Toggles
        document.getElementById('toggle-sidebar').addEventListener('click', () => {
            this.sidebar.classList.add('collapsed');
            document.getElementById('toggle-sidebar-show').classList.remove('hidden');
        });
        document.getElementById('toggle-sidebar-show').addEventListener('click', (e) => {
            this.sidebar.classList.remove('collapsed');
            e.target.classList.add('hidden');
        });

        // Folder & Note Creation
        document.getElementById('btn-new-folder').addEventListener('click', () => this.createFolder());
        document.getElementById('fab-new-note').addEventListener('click', () => this.addNote());

        // Keyboard Shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (document.activeElement) document.activeElement.blur();
                this.sidebar.classList.add('collapsed');
                document.getElementById('toggle-sidebar-show').classList.remove('hidden');
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
                e.preventDefault();
                this.addNote();
            }
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
                e.preventDefault();
                this.createFolder();
            }
        });

        // Manual Drag Events
        document.addEventListener('mousemove', (e) => this.onDrag(e));
        document.addEventListener('mouseup', () => this.onDragEnd());
    }

    // --- State & Storage ---
    saveData() {
        clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => {
            chrome.storage.local.set({ folders: this.folders, notes: this.notes });
        }, 500); // 500ms debounce
    }

    // --- Folders ---
    createFolder() {
        const name = prompt('Folder name:');
        if (!name) return;
        const id = 'folder_' + Date.now();
        this.folders.push({ id, name });
        this.activeFolderId = id;
        this.renderFolders();
        this.renderBoard();
        this.saveData();
    }

    deleteFolder(id) {
        if (id === 'quick-jot') return; // Cannot delete default
        if (!confirm('Delete folder and all its notes?')) return;

        this.folders = this.folders.filter(f => f.id !== id);
        this.notes = this.notes.filter(n => n.folderId !== id);
        this.activeFolderId = 'quick-jot';

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

            if (folder.id !== 'quick-jot') {
                const actions = document.createElement('div');
                actions.className = 'folder-actions';

                const delBtn = document.createElement('button');
                delBtn.innerHTML = '✖';
                delBtn.onclick = (e) => { e.stopPropagation(); this.deleteFolder(folder.id); };

                actions.appendChild(delBtn);
                li.appendChild(actions);
            }
            this.folderList.appendChild(li);
        });
    }

    // --- Notes ---
    addNote(folderId = this.activeFolderId, x = null, y = null, content = '') {
        // Slight rotation for natural feel
        const rotation = (Math.random() * 4) - 2;

        // Cascade position if null
        const offset = (this.notes.filter(n => n.folderId === folderId).length % 10) * 20;

        const note = {
            id: 'note_' + Date.now(),
            folderId,
            content,
            color: this.colors[0],
            x: x !== null ? x : 100 + offset,
            y: y !== null ? y : 100 + offset,
            r: rotation,
            z: ++this.dragState.highestZ
        };

        this.notes.push(note);
        this.renderBoard();
        this.saveData();

        // Focus new note
        setTimeout(() => {
            const newEl = document.getElementById(note.id);
            if (newEl) newEl.querySelector('.note-content').focus();
        }, 50);
    }

    deleteNote(id) {
        this.notes = this.notes.filter(n => n.id !== id);
        this.renderBoard();
        this.saveData();
    }

    cycleColor(note) {
        const currentIndex = this.colors.indexOf(note.color);
        const nextIndex = (currentIndex + 1) % this.colors.length;
        note.color = this.colors[nextIndex];
        document.getElementById(note.id).style.backgroundColor = note.color;
        this.saveData();
    }

    renderBoard() {
        this.board.innerHTML = '';
        const currentNotes = this.notes.filter(n => n.folderId === this.activeFolderId);

        if (currentNotes.length === 0) {
            this.emptyState.classList.remove('hidden');
        } else {
            this.emptyState.classList.add('hidden');
            currentNotes.forEach(note => this.createNoteElement(note));
        }
    }

    createNoteElement(note) {
        const el = document.createElement('div');
        el.className = 'note';
        el.id = note.id;
        el.style.left = note.x + 'px';
        el.style.top = note.y + 'px';
        el.style.backgroundColor = note.color;
        el.style.transform = `rotate(${note.r}deg)`;
        el.style.zIndex = note.z || 10;

        // Bring to front on mousedown
        el.addEventListener('mousedown', () => {
            note.z = ++this.dragState.highestZ;
            el.style.zIndex = note.z;
        });

        const header = document.createElement('div');
        header.className = 'note-header';

        // Drag Handling
        header.addEventListener('mousedown', (e) => this.onDragStart(e, note, el));

        // Color Cycle
        const colorBtn = document.createElement('button');
        colorBtn.className = 'note-btn';
        colorBtn.innerHTML = '🎨';
        colorBtn.onclick = () => this.cycleColor(note);

        // Delete
        const delBtn = document.createElement('button');
        delBtn.className = 'note-btn';
        delBtn.innerHTML = '✖';
        delBtn.onclick = () => this.deleteNote(note.id);

        header.append(colorBtn, delBtn);

        const content = document.createElement('textarea');
        content.className = 'note-content';
        content.value = note.content;

        // Auto-save on input
        content.addEventListener('input', (e) => {
            note.content = e.target.value;
            this.saveData();
        });

        el.append(header, content);
        this.board.appendChild(el);
    }

    // --- Drag & Drop (Manual) ---
    onDragStart(e, note, el) {
        if (e.target.tagName === 'BUTTON') return; // Don't drag if clicking buttons
        this.dragState = {
            isDragging: true,
            noteId: note.id,
            el: el,
            noteRef: note,
            offsetX: e.clientX - note.x,
            offsetY: e.clientY - note.y,
            highestZ: this.dragState.highestZ
        };
        el.classList.add('dragging');
        el.style.transform = `rotate(0deg) scale(1.05)`; // Straighten while dragging
    }

    onDrag(e) {
        if (!this.dragState.isDragging) return;
        e.preventDefault();

        const newX = e.clientX - this.dragState.offsetX;
        const newY = e.clientY - this.dragState.offsetY;

        this.dragState.el.style.left = newX + 'px';
        this.dragState.el.style.top = newY + 'px';

        // Update memory
        this.dragState.noteRef.x = newX;
        this.dragState.noteRef.y = newY;
    }

    onDragEnd() {
        if (!this.dragState.isDragging) return;

        const { el, noteRef } = this.dragState;
        el.classList.remove('dragging');
        el.style.transform = `rotate(${noteRef.r}deg)`; // Restore original rotation

        this.dragState.isDragging = false;
        this.saveData();
    }
}

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    window.app = new NotesApp();
});