/* Tasks App — logique principale */

(() => {
  const dom = {
    searchInput: document.getElementById('searchInput'),
    themeToggle: document.getElementById('themeToggle'),
    newTaskBtn: document.getElementById('newTaskBtn'),
    projectsList: document.getElementById('projectsList'),
    tagsList: document.getElementById('tagsList'),
    projectInput: document.getElementById('projectInput'),
    tagInput: document.getElementById('tagInput'),
    addProjectBtn: document.getElementById('addProjectBtn'),
    addTagBtn: document.getElementById('addTagBtn'),
    statusFilter: document.getElementById('statusFilter'),
    priorityFilter: document.getElementById('priorityFilter'),
    exportBtn: document.getElementById('exportBtn'),
    importInput: document.getElementById('importInput'),
    tabList: document.getElementById('tabList'),
    tabBoard: document.getElementById('tabBoard'),
    viewList: document.getElementById('viewList'),
    viewBoard: document.getElementById('viewBoard'),
    listContainer: document.getElementById('listContainer'),
    dropzones: () => Array.from(document.querySelectorAll('.dropzone')),
    templates: { taskItem: document.getElementById('taskItemTemplate') },
    dialog: document.getElementById('taskDialog'),
    form: document.getElementById('taskForm'),
    dialogTitle: document.getElementById('dialogTitle'),
    deleteTaskBtn: document.getElementById('deleteTaskBtn'),
    cancelDialogBtn: document.getElementById('cancelDialogBtn'),
    projectsDataList: document.getElementById('projectsDataList')
  };

  const STORAGE_KEY = 'tasks.app.v1';
  const THEME_KEY = 'tasks.theme.v1';

  /** @type {{ tasks: any[]; projects: string[]; tags: string[] }} */
  let state = { tasks: [], projects: [], tags: [] };

  const generateId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        state = JSON.parse(raw);
      } else {
        // Seed with sample content for first-time UX
        state = {
          tasks: [
            { id: generateId(), title: 'Découvrir l’application', description: 'Parcourir les vues et options.', status: 'todo', priority: 'medium', project: 'Général', tags: ['onboarding'], createdAt: Date.now(), updatedAt: Date.now() },
            { id: generateId(), title: 'Créer une première tâche', description: 'Cliquer sur “Nouvelle tâche”.', status: 'in_progress', priority: 'low', project: 'Général', tags: ['guide'], createdAt: Date.now(), updatedAt: Date.now() },
            { id: generateId(), title: 'Glisser-déposer', description: 'Déplacer une carte entre les colonnes.', status: 'done', priority: 'high', project: 'Général', tags: ['kanban'], createdAt: Date.now(), updatedAt: Date.now(), completedAt: Date.now() }
          ],
          projects: ['Général'],
          tags: ['onboarding', 'guide', 'kanban']
        };
        saveState();
      }
    } catch (e) {
      console.error('Impossible de charger les données', e);
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    refreshUI();
  }

  function setTheme(initial) {
    const stored = localStorage.getItem(THEME_KEY);
    const root = document.documentElement;
    const value = initial ? (stored || 'auto') : (root.getAttribute('data-theme') === 'dark' ? 'light' : root.getAttribute('data-theme') === 'light' ? 'auto' : 'dark');
    root.setAttribute('data-theme', value);
    localStorage.setItem(THEME_KEY, value);
  }

  function normalizeText(text) {
    return (text || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function getActiveFilters() {
    const query = normalizeText(dom.searchInput.value);
    const status = dom.statusFilter.value;
    const priority = dom.priorityFilter.value;
    const projectChip = dom.projectsList.querySelector('li.active');
    const tagChip = dom.tagsList.querySelector('li.active');
    return {
      query, status, priority,
      project: projectChip ? projectChip.dataset.value : '',
      tag: tagChip ? tagChip.dataset.value : ''
    };
  }

  function taskMatchesFilters(task, filters) {
    if (filters.status && task.status !== filters.status) return false;
    if (filters.priority && task.priority !== filters.priority) return false;
    if (filters.project && task.project !== filters.project) return false;
    if (filters.tag && !(task.tags || []).includes(filters.tag)) return false;

    const hay = normalizeText(`${task.title} ${task.description} ${task.project} ${(task.tags || []).join(' ')}`);
    return !filters.query || hay.includes(filters.query);
  }

  function renderProjectsAndTags() {
    const makeChip = (value, list) => {
      const li = document.createElement('li');
      li.textContent = value;
      li.dataset.value = value;
      li.addEventListener('click', () => {
        for (const c of list.children) c.classList.remove('active');
        if (!li.classList.contains('active')) li.classList.add('active'); else li.classList.remove('active');
        refreshUI();
      });
      return li;
    };

    dom.projectsList.innerHTML = '';
    state.projects.forEach(p => dom.projectsList.appendChild(makeChip(p, dom.projectsList)));

    dom.tagsList.innerHTML = '';
    state.tags.forEach(t => dom.tagsList.appendChild(makeChip(t, dom.tagsList)));

    dom.projectsDataList.innerHTML = state.projects.map(p => `<option value="${p}"></option>`).join('');
  }

  function createTaskCard(task) {
    const node = /** @type {HTMLElement} */(dom.templates.taskItem.content.firstElementChild.cloneNode(true));
    node.dataset.id = task.id;
    const titleEl = node.querySelector('.task-title');
    const descEl = node.querySelector('.task-desc');
    const metaEl = node.querySelector('.task-meta');
    const prioDot = node.querySelector('.priority-dot');

    titleEl.textContent = task.title;
    descEl.textContent = task.description || '';
    const parts = [];
    if (task.project) parts.push(`📁 ${task.project}`);
    if (task.dueDate) parts.push(`📅 ${new Date(task.dueDate).toLocaleDateString()}`);
    if (task.tags?.length) parts.push(`🏷️ ${task.tags.join(', ')}`);
    metaEl.textContent = parts.join('   ');

    prioDot.classList.add(task.priority === 'high' ? 'prio-high' : task.priority === 'low' ? 'prio-low' : 'prio-medium');

    const editBtn = node.querySelector('button.edit');
    const completeBtn = node.querySelector('button.complete');
    editBtn.addEventListener('click', () => openTaskDialog(task));
    completeBtn.addEventListener('click', () => {
      updateTask(task.id, { status: 'done', completedAt: Date.now() });
    });

    node.addEventListener('dragstart', (e) => {
      e.dataTransfer?.setData('text/plain', task.id);
      e.dataTransfer?.setDragImage(node, 10, 10);
    });

    return node;
  }

  function renderListView() {
    const filters = getActiveFilters();
    const items = state.tasks.filter(t => taskMatchesFilters(t, filters));
    // Sort: not done first, then priority, then date
    items.sort((a, b) => {
      const doneWeight = (a.status === 'done') - (b.status === 'done');
      if (doneWeight !== 0) return doneWeight;
      const prioRank = { high: 0, medium: 1, low: 2 };
      const prioDiff = prioRank[a.priority] - prioRank[b.priority];
      if (prioDiff !== 0) return prioDiff;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
    dom.listContainer.innerHTML = '';
    items.forEach(t => dom.listContainer.appendChild(createTaskCard(t)));
  }

  function renderBoardView() {
    const filters = getActiveFilters();
    const zones = dom.dropzones();
    zones.forEach(z => {
      z.innerHTML = '';
      const status = z.dataset.status;
      const tasksForColumn = state.tasks.filter(t => t.status === status && taskMatchesFilters(t, filters));
      tasksForColumn.sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
      tasksForColumn.forEach(t => z.appendChild(createTaskCard(t)));
    });
  }

  function refreshUI() {
    renderProjectsAndTags();
    if (dom.tabList.classList.contains('active')) {
      renderListView();
    } else {
      renderBoardView();
    }
  }

  function upsertProject(name) {
    const value = (name || '').trim();
    if (!value) return;
    if (!state.projects.includes(value)) state.projects.push(value);
    saveState();
  }

  function upsertTag(name) {
    const value = (name || '').trim();
    if (!value) return;
    if (!state.tags.includes(value)) state.tags.push(value);
    saveState();
  }

  function addTask(task) {
    state.tasks.unshift({ ...task, id: generateId(), createdAt: Date.now(), updatedAt: Date.now() });
    upsertProject(task.project);
    (task.tags || []).forEach(upsertTag);
    saveState();
  }

  function updateTask(id, updates) {
    const idx = state.tasks.findIndex(t => t.id === id);
    if (idx === -1) return;
    const current = state.tasks[idx];
    state.tasks[idx] = { ...current, ...updates, updatedAt: Date.now() };
    saveState();
  }

  function deleteTask(id) {
    state.tasks = state.tasks.filter(t => t.id !== id);
    saveState();
  }

  function openTaskDialog(existing) {
    dom.form.reset();
    dom.deleteTaskBtn.hidden = !existing;
    dom.dialogTitle.textContent = existing ? 'Modifier la tâche' : 'Nouvelle tâche';
    dom.form.elements['id'].value = existing?.id || '';
    dom.form.elements['title'].value = existing?.title || '';
    dom.form.elements['description'].value = existing?.description || '';
    dom.form.elements['dueDate'].value = existing?.dueDate || '';
    dom.form.elements['priority'].value = existing?.priority || 'medium';
    dom.form.elements['status'].value = existing?.status || 'todo';
    dom.form.elements['project'].value = existing?.project || '';
    dom.form.elements['tags'].value = (existing?.tags || []).join(', ');
    dom.dialog.showModal();
  }

  function closeTaskDialog() {
    if (dom.dialog.open) dom.dialog.close();
  }

  function exportData() {
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `tasks-export-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const next = JSON.parse(String(reader.result));
        if (!next || !Array.isArray(next.tasks)) throw new Error('Fichier invalide');
        state = {
          tasks: Array.isArray(next.tasks) ? next.tasks : [],
          projects: Array.isArray(next.projects) ? next.projects : [],
          tags: Array.isArray(next.tags) ? next.tags : []
        };
        saveState();
      } catch (e) { alert('Import impossible: ' + e.message); }
    };
    reader.readAsText(file);
  }

  function setupEvents() {
    // Board drag events (attach once)
    dom.dropzones().forEach(z => {
      z.addEventListener('dragover', (e) => { e.preventDefault(); z.classList.add('drag-over'); });
      z.addEventListener('dragleave', () => z.classList.remove('drag-over'));
      z.addEventListener('drop', (e) => {
        e.preventDefault();
        z.classList.remove('drag-over');
        const id = e.dataTransfer?.getData('text/plain');
        if (!id) return;
        updateTask(id, { status: z.dataset.status });
      });
    });

    // Tabs
    dom.tabList.addEventListener('click', () => {
      dom.tabList.classList.add('active'); dom.tabList.setAttribute('aria-selected', 'true');
      dom.tabBoard.classList.remove('active'); dom.tabBoard.setAttribute('aria-selected', 'false');
      dom.viewList.classList.add('active'); dom.viewBoard.classList.remove('active');
      refreshUI();
    });
    dom.tabBoard.addEventListener('click', () => {
      dom.tabBoard.classList.add('active'); dom.tabBoard.setAttribute('aria-selected', 'true');
      dom.tabList.classList.remove('active'); dom.tabList.setAttribute('aria-selected', 'false');
      dom.viewBoard.classList.add('active'); dom.viewList.classList.remove('active');
      refreshUI();
    });

    // Search & filters
    dom.searchInput.addEventListener('input', refreshUI);
    dom.statusFilter.addEventListener('change', refreshUI);
    dom.priorityFilter.addEventListener('change', refreshUI);

    // Projects / Tags
    dom.addProjectBtn.addEventListener('click', () => { upsertProject(dom.projectInput.value); dom.projectInput.value = ''; });
    dom.addTagBtn.addEventListener('click', () => { upsertTag(dom.tagInput.value); dom.tagInput.value = ''; });

    // New task
    dom.newTaskBtn.addEventListener('click', () => openTaskDialog());

    dom.cancelDialogBtn.addEventListener('click', () => closeTaskDialog());
    dom.deleteTaskBtn.addEventListener('click', () => {
      const id = dom.form.elements['id'].value;
      if (id) deleteTask(id);
      closeTaskDialog();
    });

    dom.form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = new FormData(dom.form);
      const payload = {
        title: String(data.get('title') || '').trim(),
        description: String(data.get('description') || '').trim(),
        dueDate: String(data.get('dueDate') || ''),
        priority: String(data.get('priority') || 'medium'),
        status: String(data.get('status') || 'todo'),
        project: String(data.get('project') || '').trim(),
        tags: String(data.get('tags') || '').split(',').map(t => t.trim()).filter(Boolean)
      };
      const id = String(data.get('id') || '');
      if (!payload.title) { alert('Le titre est requis.'); return; }
      if (id) updateTask(id, payload); else addTask(payload);
      closeTaskDialog();
    });

    // Data
    dom.exportBtn.addEventListener('click', exportData);
    dom.importInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0]; if (file) importData(file);
      dom.importInput.value = '';
    });

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement !== dom.searchInput) { e.preventDefault(); dom.searchInput.focus(); }
      if (e.key.toLowerCase() === 'n' && !dom.dialog.open) { e.preventDefault(); openTaskDialog(); }
      if (e.key.toLowerCase() === 'e' && !dom.dialog.open) { e.preventDefault(); exportData(); }
      if (e.key.toLowerCase() === 'i' && !dom.dialog.open) { e.preventDefault(); dom.importInput.click(); }
    });

    // Theme toggle
    dom.themeToggle.addEventListener('click', () => setTheme(false));
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(console.error);
    }
  }

  // Init
  setTheme(true);
  loadState();
  setupEvents();
  refreshUI();
  registerServiceWorker();
})();

