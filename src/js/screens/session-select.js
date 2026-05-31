import { App, goToUserSelect, goToGame, openSheet, closeSheet, showToast } from '../app.js';
import { getUsers, getSessions, createSession, getSessionSpots, deleteSession } from '../db.js';
import { formatDateTime, formatDateTimeShort, getSessionTotalSpots, getSessionDistinctStates } from '../utils.js';

export async function mountSessionSelect() {
  document.getElementById('session-player-label').textContent =
    `Playing as ${App.currentUser.name}`;

  const listEl   = document.getElementById('session-list');
  const btnSwitch = document.getElementById('btn-switch-player');
  const btnNew   = document.getElementById('btn-new-session');

  // Replace listeners cleanly
  btnSwitch.replaceWith(btnSwitch.cloneNode(true));
  btnNew.replaceWith(btnNew.cloneNode(true));
  document.getElementById('btn-switch-player').addEventListener('click', () => goToUserSelect());
  document.getElementById('btn-new-session').addEventListener('click',   () => openNewSessionSheet());

  // ── Load sessions ────────────────────────────────────────────────────────
  listEl.innerHTML = '<p class="empty-state">Loading…</p>';
  let sessions = [];
  try {
    sessions = await getSessions();
  } catch {
    listEl.innerHTML = '<p class="empty-state">Could not load sessions.</p>';
    return;
  }

  if (!sessions.length) {
    listEl.innerHTML = '<p class="empty-state">No sessions yet — start one below.</p>';
    return;
  }

  // Render sessions immediately, then load spot counts async
  renderSessions(sessions, {});

  // Load spot counts for all sessions in parallel
  const spotsBySession = {};
  await Promise.all(sessions.map(async s => {
    try {
      const spots = await getSessionSpots(s.id);
      spotsBySession[s.id] = spots;
    } catch { /* leave blank */ }
  }));
  renderSessions(sessions, spotsBySession);

  function renderSessions(list, spotMap) {
    listEl.innerHTML = '';
    const totalTypes = App.plates.length;

    list.forEach(session => {
      const spots   = spotMap[session.id] || null;
      const total   = spots ? getSessionTotalSpots(spots) : null;
      const types   = spots ? getSessionDistinctStates(spots) : null;
      const spotsLabel = spots
        ? `${total} spot${total !== 1 ? 's' : ''} · ${types} / ${totalTypes} types`
        : '…';

      const statusClass = `status-${session.status}`;
      const statusText  = session.status.charAt(0).toUpperCase() + session.status.slice(1);

      let finishedLine = '';
      if (session.status === 'completed' || session.status === 'discarded') {
        const verb = session.status === 'completed' ? 'Finished' : 'Discarded';
        finishedLine = `<span>${verb}: ${formatDateTimeShort(session.finishedAt)}</span>`;
      }

      const playerCount = (session.playerIds || []).length;

      const el = document.createElement('div');
      el.className = 'list-item';
      el.innerHTML = `
        <div class="list-item-row">
          <span class="list-item-title">${esc(session.name)}</span>
          <div class="list-item-row-end">
            <span class="status-chip ${statusClass}">${statusText}</span>
            <button class="btn-delete-session" title="Delete session" aria-label="Delete session">
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zm2.46-7.12l1.41-1.41L12 12.59l2.12-2.12 1.41 1.41L13.41 14l2.12 2.12-1.41 1.41L12 15.41l-2.12 2.12-1.41-1.41L10.59 14l-2.13-2.12zM15.5 4l-1-1h-5l-1 1H5v2h14V4z"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="list-item-meta">
          <span>${playerCount} player${playerCount !== 1 ? 's' : ''}</span>
          <span>Started: ${formatDateTimeShort(session.startedAt)}</span>
          <span>Last saved: ${formatDateTimeShort(session.savedAt)}</span>
          ${finishedLine}
        </div>
        <div class="list-item-spots">${spotsLabel}</div>
      `;
      el.querySelector('.btn-delete-session').addEventListener('click', e => {
        e.stopPropagation();
        confirmDelete(session, el, list, spotMap);
      });
      el.addEventListener('click', () => openSession(session));
      listEl.appendChild(el);
    });
  }
}

function confirmDelete(session, rowEl, list, spotMap) {
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-title">Delete Session</div>
  `;

  const msg = document.createElement('p');
  msg.style.cssText = 'padding: 4px 20px 12px; font-size:15px; color:#1e293b;';
  msg.textContent = `Delete "${session.name}"? This cannot be undone.`;
  wrap.appendChild(msg);

  const btnDelete = document.createElement('button');
  btnDelete.className = 'sheet-action danger';
  btnDelete.textContent = 'Delete permanently';
  btnDelete.addEventListener('click', async () => {
    closeSheet();
    btnDelete.disabled = true;
    try {
      await deleteSession(session.id);
      // Remove row immediately from the rendered list
      rowEl.remove();
      const remaining = list.filter(s => s.id !== session.id);
      if (!remaining.length) {
        document.getElementById('session-list').innerHTML =
          '<p class="empty-state">No sessions yet — start one below.</p>';
      }
    } catch {
      showToast('Could not delete session — check your connection.');
    }
  });

  const btnCancel = document.createElement('button');
  btnCancel.className = 'sheet-action muted';
  btnCancel.textContent = 'Cancel';
  btnCancel.addEventListener('click', closeSheet);

  wrap.appendChild(btnDelete);
  wrap.appendChild(btnCancel);
  openSheet(wrap);
}

function openSession(session) {
  App.currentSession  = session;
  App.activePlayerId  = App.currentUser.id;
  goToGame();
}

// ── New Session Sheet ──────────────────────────────────────────────────────

async function openNewSessionSheet() {
  let allUsers = [];
  try { allUsers = await getUsers(); } catch { /* proceed */ }

  const selectedIds = new Set([App.currentUser.id]);

  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-title">New Session</div>
    <div class="sheet-form">
      <div>
        <label>Session Name</label>
        <input id="sheet-session-name" type="text" placeholder="e.g. Road trip to Vegas" maxlength="50" autocomplete="off">
      </div>
      <div>
        <label>Players</label>
        <div id="sheet-player-list" class="sheet-player-list"></div>
      </div>
      <p id="sheet-session-error" class="sheet-form-error hidden"></p>
      <div class="sheet-form-actions">
        <button id="sheet-cancel" class="btn btn-ghost">Cancel</button>
        <button id="sheet-create" class="btn btn-primary">Create</button>
      </div>
    </div>
  `;

  const playerListEl = wrap.querySelector('#sheet-player-list');
  const nameInput    = wrap.querySelector('#sheet-session-name');
  const errorEl      = wrap.querySelector('#sheet-session-error');
  const btnCreate    = wrap.querySelector('#sheet-create');
  const btnCancel    = wrap.querySelector('#sheet-cancel');

  function renderPlayerChips() {
    playerListEl.innerHTML = '';
    allUsers.forEach(u => {
      const chip = document.createElement('div');
      chip.className = 'sheet-player-chip' + (selectedIds.has(u.id) ? ' selected' : '');
      chip.dataset.id = u.id;
      chip.innerHTML = `<span>${esc(u.name)}</span><span class="chip-check">&#10003;</span>`;
      chip.addEventListener('click', () => {
        if (u.id === App.currentUser.id) return; // current user always included
        if (selectedIds.has(u.id)) selectedIds.delete(u.id);
        else selectedIds.add(u.id);
        renderPlayerChips();
      });
      playerListEl.appendChild(chip);
    });
  }
  renderPlayerChips();

  btnCancel.addEventListener('click', closeSheet);
  btnCreate.addEventListener('click', async () => {
    const name = nameInput.value.trim();
    if (!name) {
      errorEl.textContent = 'Session name is required.';
      errorEl.classList.remove('hidden');
      return;
    }
    btnCreate.disabled = true;
    const playerIds = [...selectedIds];
    // Ensure current user is first
    const ordered = [App.currentUser.id, ...playerIds.filter(id => id !== App.currentUser.id)];
    try {
      const session = await createSession({ name, playerIds: ordered });
      // Load player objects for the session
      App.currentSession  = { ...session, startedAt: null, savedAt: null, finishedAt: null };
      App.activePlayerId  = App.currentUser.id;
      closeSheet();
      goToGame();
    } catch {
      errorEl.textContent = 'Could not create session. Try again.';
      errorEl.classList.remove('hidden');
      btnCreate.disabled = false;
    }
  });

  openSheet(wrap);
  setTimeout(() => nameInput.focus(), 350);
}

function esc(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
