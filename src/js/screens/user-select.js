import { App, goToSessionSelect, showToast } from '../app.js';
import { getUsers, createUser } from '../db.js';

export async function mountUserSelect() {
  const listEl      = document.getElementById('user-list');
  const formEl      = document.getElementById('new-player-form');
  const btnNew      = document.getElementById('btn-new-player');
  const btnCancel   = document.getElementById('btn-cancel-player');
  const btnSave     = document.getElementById('btn-save-player');
  const nameInput   = document.getElementById('new-player-name');
  const errorEl     = document.getElementById('new-player-error');

  // Reset form state
  formEl.classList.add('hidden');
  btnNew.classList.remove('hidden');
  nameInput.value = '';
  errorEl.classList.add('hidden');

  // ── Load users ──────────────────────────────────────────────────────────
  listEl.innerHTML = '<p class="empty-state">Loading…</p>';
  let users = [];
  try {
    users = await getUsers();
  } catch {
    listEl.innerHTML = '<p class="empty-state">Could not load players.</p>';
    return;
  }

  renderList(users);

  // ── Handlers ────────────────────────────────────────────────────────────
  btnNew.addEventListener('click', () => {
    formEl.classList.remove('hidden');
    btnNew.classList.add('hidden');
    errorEl.classList.add('hidden');
    nameInput.value = '';
    setTimeout(() => nameInput.focus(), 50);
  }, { once: true });

  btnCancel.addEventListener('click', () => {
    formEl.classList.add('hidden');
    btnNew.classList.remove('hidden');
    mountUserSelect(); // re-mount to rebind once listeners
  }, { once: true });

  btnSave.addEventListener('click', () => savePlayer(users), { once: true });
  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') savePlayer(users); });

  function renderList(list) {
    if (!list.length) {
      listEl.innerHTML = '<p class="empty-state">No players yet — add one below.</p>';
      return;
    }
    listEl.innerHTML = '';
    list.forEach(user => {
      const el = document.createElement('div');
      el.className = 'list-item';
      el.innerHTML = `<div class="list-item-title">${esc(user.name)}</div>`;
      el.addEventListener('click', () => selectUser(user));
      listEl.appendChild(el);
    });
  }

  async function savePlayer(existing) {
    const name = nameInput.value.trim();
    if (!name) {
      showInlineError('Name cannot be empty.');
      return;
    }
    const dup = existing.find(u => u.name.toLowerCase() === name.toLowerCase());
    if (dup) {
      showInlineError('A player with that name already exists.');
      return;
    }
    btnSave.disabled = true;
    try {
      const user = await createUser(name);
      selectUser(user);
    } catch {
      showInlineError('Could not save player. Try again.');
      btnSave.disabled = false;
    }
  }

  function showInlineError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.remove('hidden');
  }
}

function selectUser(user) {
  App.currentUser = user;
  sessionStorage.setItem('ps_user', JSON.stringify(user));
  goToSessionSelect();
}

function esc(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
