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
    projectsDataList: document.getElementById('projectsDataList'),
    userBadge: document.getElementById('userBadge'),
    logoutBtn: document.getElementById('logoutBtn'),
    appRoot: document.getElementById('appRoot'),
    authView: document.getElementById('authView'),
    authTabLogin: document.getElementById('authTabLogin'),
    authTabSignup: document.getElementById('authTabSignup'),
    authPanelLogin: document.getElementById('authPanelLogin'),
    authPanelSignup: document.getElementById('authPanelSignup'),
    loginForm: document.getElementById('loginForm'),
    signupForm: document.getElementById('signupForm')
  };

  const STORAGE_KEY = 'tasks.app.v1';
  const ACCOUNTS_KEY = 'tasks.accounts.v1';
  const SESSION_KEY = 'tasks.session.v1';
  const THEME_KEY = 'tasks.theme.v1';

  /** @type {{ tasks: any[]; projects: string[]; tags: string[] }} */
  let state = { tasks: [], projects: [], tags: [] };
  /** @type {{ id: string; email: string; displayName: string } | null } */
  let currentUser = null;

  const generateId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  function toBase64(bytes) { return btoa(String.fromCharCode(...bytes)); }
  function fromBase64(b64) { return Uint8Array.from(atob(b64), c => c.charCodeAt(0)); }

  function loadAccounts() {
    try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]'); } catch { return []; }
  }
  function saveAccounts(accounts) {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  }
  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
  }
  function setSession(user) {
    if (user) localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id }));
    else localStorage.removeItem(SESSION_KEY);
  }

  async function hashPassword(password, saltB64) {
    const enc = new TextEncoder();
    const salt = saltB64 ? fromBase64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
    try {
      if (!crypto?.subtle) throw new Error('subtle-not-available');
      const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
      const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', iterations: 250000, salt }, keyMaterial, 256);
      const hash = new Uint8Array(bits);
      return { saltB64: toBase64(salt), hashB64: toBase64(hash) };
    } catch (_) {
      // Insecure fallback for non-secure contexts (e.g., file://). For dev/demo only.
      const data = enc.encode(password);
      const mixed = new Uint8Array(salt.length + data.length);
      mixed.set(salt, 0); mixed.set(data, salt.length);
      let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
      for (let r = 0; r < 100000; r++) {
        for (let i = 0; i < mixed.length; i++) {
          h1 = Math.imul(h1 ^ mixed[i], 2654435761);
          h2 = Math.imul(h2 ^ mixed[i], 1597334677);
        }
        h1 = (h1 << 13) | (h1 >>> 19);
        h2 = (h2 << 11) | (h2 >>> 21);
      }
      const out = new Uint8Array(32);
      const words = [h1, h2, h1 ^ h2, (h1 * 31) ^ (h2 * 17), ~h1, ~h2, (h1 >>> 1) ^ (h2 << 1), (h1 << 1) ^ (h2 >>> 1)];
      for (let i = 0; i < 8; i++) {
        const w = words[i] >>> 0;
        out[i * 4 + 0] = (w >>> 24) & 0xff;
        out[i * 4 + 1] = (w >>> 16) & 0xff;
        out[i * 4 + 2] = (w >>> 8) & 0xff;
        out[i * 4 + 3] = w & 0xff;
      }
      return { saltB64: toBase64(salt), hashB64: toBase64(out) };
    }
  }

  async function createAccount(email, password, displayName) {
    const accounts = loadAccounts();
    const exists = accounts.some(a => a.email.toLowerCase() === email.toLowerCase());
    if (exists) throw new Error('Un compte existe déjà avec cet email.');
    const { saltB64, hashB64 } = await hashPassword(password);
    const user = { id: generateId(), email, displayName, passwordHash: hashB64, passwordSalt: saltB64, createdAt: Date.now() };
    accounts.push(user);
    saveAccounts(accounts);
    return { id: user.id, email: user.email, displayName: user.displayName };
  }

  async function signIn(email, password) {
    const accounts = loadAccounts();
    const user = accounts.find(a => a.email.toLowerCase() === email.toLowerCase());
    if (!user) throw new Error('Identifiants invalides.');
    const { hashB64 } = await hashPassword(password, user.passwordSalt);
    if (hashB64 !== user.passwordHash) throw new Error('Identifiants invalides.');
    return { id: user.id, email: user.email, displayName: user.displayName };
  }

  function getStorageKeyForUser(userId) { return `${STORAGE_KEY}::${userId}`; }

  function loadState() {
    try {
      if (!currentUser) return;
      const raw = localStorage.getItem(getStorageKeyForUser(currentUser.id));
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
    if (!currentUser) return;
    localStorage.setItem(getStorageKeyForUser(currentUser.id), JSON.stringify(state));
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
    updateUserBadge();
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

    // Auth tabs
    dom.authTabLogin?.addEventListener('click', () => switchAuthTab('login'));
    dom.authTabSignup?.addEventListener('click', () => switchAuthTab('signup'));

    // Auth forms
    dom.loginForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = dom.loginForm.elements['email'].value.trim();
      const password = dom.loginForm.elements['password'].value;
      try {
        currentUser = await signIn(email, password);
        setSession(currentUser);
        onSignedIn();
      } catch (err) { alert(err.message || String(err)); }
    });

    dom.signupForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const displayName = dom.signupForm.elements['displayName'].value.trim();
      const email = dom.signupForm.elements['email'].value.trim();
      const password = dom.signupForm.elements['password'].value;
      const password2 = dom.signupForm.elements['password2'].value;
      if (password.length < 8) { alert('Mot de passe trop court (min 8).'); return; }
      if (password !== password2) { alert('Les mots de passe ne correspondent pas.'); return; }
      try {
        currentUser = await createAccount(email, password, displayName);
        setSession(currentUser);
        onSignedIn(true);
      } catch (err) { alert(err.message || String(err)); }
    });

    dom.logoutBtn?.addEventListener('click', () => onSignOut());
  }

  function switchAuthTab(which) {
    const loginActive = which === 'login';
    dom.authTabLogin.classList.toggle('active', loginActive);
    dom.authTabLogin.setAttribute('aria-selected', String(loginActive));
    dom.authTabSignup.classList.toggle('active', !loginActive);
    dom.authTabSignup.setAttribute('aria-selected', String(!loginActive));
    dom.authPanelLogin.classList.toggle('active', loginActive);
    dom.authPanelSignup.classList.toggle('active', !loginActive);
  }

  function updateUserBadge() {
    if (!dom.userBadge) return;
    if (!currentUser) { dom.userBadge.textContent = ''; return; }
    const label = currentUser.displayName || currentUser.email;
    dom.userBadge.textContent = label;
  }

  function showAppRoot() { if (dom.appRoot) { dom.appRoot.hidden = false; dom.appRoot.style.display = ''; } }
  function hideAppRoot() { if (dom.appRoot) { dom.appRoot.hidden = true; dom.appRoot.style.display = 'none'; } }
  function showAuthView() { if (dom.authView) { dom.authView.hidden = false; dom.authView.style.display = 'grid'; } }
  function hideAuthView() { if (dom.authView) { dom.authView.hidden = true; dom.authView.style.display = 'none'; } }

  function onSignedIn(isNew) {
    // Ensure visibility toggling is robust across environments
    hideAuthView();
    showAppRoot();
    if (isNew) {
      state = { tasks: [], projects: [], tags: [] };
      saveState();
    } else {
      loadState();
    }
    refreshUI();
  }

  function onSignOut() {
    setSession(null);
    currentUser = null;
    hideAppRoot();
    showAuthView();
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(console.error);
    }
  }

  // Init
  setTheme(true);
  setupEvents();
  const session = getSession();
  if (session) {
    const accounts = loadAccounts();
    const found = accounts.find(a => a.id === session.userId);
    if (found) {
      currentUser = { id: found.id, email: found.email, displayName: found.displayName };
      showAppRoot();
      hideAuthView();
      loadState();
      refreshUI();
    } else {
      hideAppRoot();
      showAuthView();
    }
  } else {
    hideAppRoot();
    showAuthView();
  }
  registerServiceWorker();
})();

