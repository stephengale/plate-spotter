import {
  App, goToSessionSelect, goToVariant, openSheet, closeSheet, showToast,
} from '../app.js';
import { addSpot, subscribeToSpots, updateSession, getUsersByIds } from '../db.js';
import {
  platePlaceholderSrc, addLongPress,
  getStateCount, getTotalSpots, getDistinctStates, getDistinctVariantsForState,
} from '../utils.js';
import { serverTimestamp } from 'firebase/firestore';

export async function mountGame() {
  const session = App.currentSession;

  // ── Header ───────────────────────────────────────────────────────────────
  document.getElementById('game-session-name').textContent = session.name;
  document.getElementById('game-player-name').textContent  = playerName();
  document.getElementById('stat-types-total').textContent  = App.plates.length;

  // ── Bind header buttons (before any awaits so they work immediately) ─────
  const playerBtn = document.getElementById('btn-player-switcher');
  const endBtn    = document.getElementById('btn-end-session');
  playerBtn.replaceWith(playerBtn.cloneNode(true));
  endBtn.replaceWith(endBtn.cloneNode(true));
  document.getElementById('btn-player-switcher').addEventListener('click', openPlayerSheet);
  document.getElementById('btn-end-session').addEventListener('click',    openEndSheet);

  // ── Build plate grid ─────────────────────────────────────────────────────
  const gridEl = document.getElementById('plate-grid');
  gridEl.innerHTML = '';
  App.plates.forEach(plate => {
    gridEl.appendChild(buildTile(plate));
  });

  // ── Attach Firestore listener ─────────────────────────────────────────────
  if (App.spotsUnsub) App.spotsUnsub();
  App.spotsUnsub = subscribeToSpots(session.id, spots => {
    App.spots = spots;
    updateCounts();
    if (typeof App._variantRefresh === 'function') App._variantRefresh();
  });

  // Load session players last — doesn't block interaction above
  try {
    App.sessionPlayers = await getUsersByIds(session.playerIds || []);
    document.getElementById('game-player-name').textContent = playerName();
  } catch {
    App.sessionPlayers = [App.currentUser];
  }
}

export function unmountGame() {
  if (App.spotsUnsub) {
    App.spotsUnsub();
    App.spotsUnsub = null;
  }
}

// ── Tile construction ──────────────────────────────────────────────────────

function buildTile(plate) {
  const tile = document.createElement('div');
  tile.className = 'plate-tile';
  tile.dataset.stateCode = plate.code;

  const img = document.createElement('img');
  img.src   = plate.image;
  img.alt   = plate.label;
  img.loading = 'lazy';
  img.onerror = () => { img.src = platePlaceholderSrc(plate.code, plate.label); };

  const footer = document.createElement('div');
  footer.className = 'tile-footer';

  const label = document.createElement('div');
  label.className = 'tile-label';
  label.textContent = plate.label;

  const variantsEl = document.createElement('div');
  variantsEl.className = 'tile-variants';
  variantsEl.hidden = plate.variants.length === 0;

  footer.appendChild(label);
  footer.appendChild(variantsEl);

  const badge = document.createElement('div');
  badge.className = 'tile-badge';
  badge.hidden = true;

  tile.appendChild(img);
  tile.appendChild(footer);
  tile.appendChild(badge);

  addLongPress(
    tile,
    () => tapPlate(plate),
    () => longPressPlate(plate),
  );

  return tile;
}

// ── Count updates ──────────────────────────────────────────────────────────

function updateCounts() {
  const { spots, activePlayerId, plates } = App;
  const total   = getTotalSpots(spots, activePlayerId);
  const distinct = getDistinctStates(spots, activePlayerId);

  document.getElementById('stat-total-spots').textContent  = total;
  document.getElementById('stat-types-spotted').textContent = distinct;
  document.getElementById('game-player-name').textContent   = playerName();

  document.querySelectorAll('#plate-grid [data-state-code]').forEach(tile => {
    const code  = tile.dataset.stateCode;
    const count = getStateCount(spots, activePlayerId, code);
    const badge = tile.querySelector('.tile-badge');
    badge.textContent = count;
    badge.hidden = count === 0;

    const plate      = plates.find(p => p.code === code);
    const variantsEl = tile.querySelector('.tile-variants');
    if (plate && plate.variants.length > 0) {
      const spotted = getDistinctVariantsForState(spots, activePlayerId, code);
      variantsEl.textContent = `${spotted} / ${plate.variants.length} variants`;
      variantsEl.hidden = false;
    }
  });
}

// ── Interactions ───────────────────────────────────────────────────────────

async function tapPlate(plate) {
  try {
    await addSpot(App.currentSession.id, {
      playerId:  App.activePlayerId,
      stateCode: plate.code,
      variantId: null,
    });
  } catch {
    showToast('Could not record spot — check your connection.');
  }
}

function longPressPlate(plate) {
  if (!plate.variants.length) {
    showToast(`No variants for ${plate.label}`);
    return;
  }
  goToVariant(plate.code);
}

// ── Player switcher sheet ──────────────────────────────────────────────────

function openPlayerSheet() {
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-title">Switch Player</div>
  `;
  App.sessionPlayers.forEach(player => {
    const btn = document.createElement('button');
    btn.className = 'sheet-action' + (player.id === App.activePlayerId ? ' active' : '');
    btn.textContent = player.name + (player.id === App.activePlayerId ? ' ✓' : '');
    btn.addEventListener('click', () => {
      App.activePlayerId = player.id;
      document.getElementById('game-player-name').textContent = playerName();
      updateCounts();
      closeSheet();
    });
    wrap.appendChild(btn);
  });

  const cancel = document.createElement('button');
  cancel.className = 'sheet-action muted';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', closeSheet);
  wrap.appendChild(cancel);

  openSheet(wrap);
}

// ── End session sheet ──────────────────────────────────────────────────────

function openEndSheet() {
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-title">End Session</div>
  `;

  const btnSave = document.createElement('button');
  btnSave.className = 'sheet-action';
  btnSave.textContent = 'Save — keep session active for later';
  btnSave.addEventListener('click', saveSession);

  const btnFinish = document.createElement('button');
  btnFinish.className = 'sheet-action';
  btnFinish.textContent = 'Finish — mark as completed';
  btnFinish.addEventListener('click', () => endSession('completed'));

  const btnDiscard = document.createElement('button');
  btnDiscard.className = 'sheet-action danger';
  btnDiscard.textContent = 'Discard — abandon this session';
  btnDiscard.addEventListener('click', () => endSession('discarded'));

  const btnCancel = document.createElement('button');
  btnCancel.className = 'sheet-action muted';
  btnCancel.textContent = 'Cancel';
  btnCancel.addEventListener('click', closeSheet);

  wrap.appendChild(btnSave);
  wrap.appendChild(btnFinish);
  wrap.appendChild(btnDiscard);
  wrap.appendChild(btnCancel);
  openSheet(wrap);
}

async function saveSession() {
  closeSheet();
  try {
    await updateSession(App.currentSession.id, { savedAt: serverTimestamp() });
  } catch {
    showToast('Could not save — check your connection.');
    return;
  }
  unmountGame();
  App.currentSession = null;
  App.spots = [];
  goToSessionSelect();
}

async function endSession(status) {
  closeSheet();
  try {
    await updateSession(App.currentSession.id, {
      status,
      finishedAt: serverTimestamp(),
    });
  } catch {
    showToast('Could not update session status.');
    return;
  }
  unmountGame();
  App.currentSession = null;
  App.spots = [];
  goToSessionSelect();
}

// ── Helper ─────────────────────────────────────────────────────────────────

function playerName() {
  const player = App.sessionPlayers.find(p => p.id === App.activePlayerId)
    || App.currentUser;
  return player ? player.name : '';
}
