import { verifyToken } from './db.js';
import { mountUserSelect }    from './screens/user-select.js';
import { mountSessionSelect } from './screens/session-select.js';
import { mountGame, unmountGame } from './screens/game.js';
import { mountVariant }       from './screens/variant.js';

// ── Shared application state ───────────────────────────────────────────────
export const App = {
  token:          null,
  currentUser:    null,   // { id, name }
  currentSession: null,   // { id, name, playerIds, status, startedAt, savedAt, finishedAt }
  sessionPlayers: [],     // [{ id, name }]
  plates:         [],     // loaded from plates.json
  spots:          [],     // live array from Firestore listener
  activePlayerId: null,
  spotsUnsub:     null,   // Firestore unsubscribe fn
};

// ── Screen management ──────────────────────────────────────────────────────
export function navigate(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
}

export function showError(msg) {
  document.getElementById('error-message').textContent = msg;
  navigate('screen-error');
}

// ── Toast ──────────────────────────────────────────────────────────────────
let toastTimer = null;
export function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 2500);
}

// ── Bottom sheet ───────────────────────────────────────────────────────────
export function openSheet(contentEl) {
  const overlay = document.getElementById('sheet-overlay');
  const sheet   = document.getElementById('bottom-sheet');
  sheet.innerHTML = '';
  sheet.appendChild(contentEl);
  overlay.classList.remove('hidden');
  sheet.classList.remove('hidden');
  requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add('open')));
}

export function closeSheet() {
  const overlay = document.getElementById('sheet-overlay');
  const sheet   = document.getElementById('bottom-sheet');
  sheet.classList.remove('open');
  setTimeout(() => {
    overlay.classList.add('hidden');
    sheet.classList.add('hidden');
    sheet.innerHTML = '';
  }, 300);
}

// ── Navigation helpers used by screens ────────────────────────────────────
export function goToUserSelect() {
  mountUserSelect();
  navigate('screen-user-select');
}

export function goToSessionSelect() {
  mountSessionSelect();
  navigate('screen-session-select');
}

export function goToGame() {
  mountGame();
  navigate('screen-game');
}

export function goToVariant(stateCode) {
  mountVariant(stateCode);
  navigate('screen-variant');
}

export function goBackFromVariant() {
  App._variantRefresh = null;
  navigate('screen-game');
}

// ── Boot ───────────────────────────────────────────────────────────────────
async function init() {
  // Load plate catalog
  try {
    const res = await fetch('src/data/plates.json');
    App.plates = await res.json();
  } catch {
    showError('Failed to load plate catalog.');
    return;
  }

  // Read token from URL
  const params = new URLSearchParams(window.location.search);
  App.token = params.get('token');

  // Verify token
  try {
    const valid = await verifyToken(App.token);
    if (!valid) {
      showError('Invalid or missing access token.');
      return;
    }
  } catch {
    showError('Could not connect to the server. Please check your connection.');
    return;
  }

  // Restore user from sessionStorage
  const saved = sessionStorage.getItem('ps_user');
  if (saved) {
    try { App.currentUser = JSON.parse(saved); } catch { /* ignore */ }
  }

  goToUserSelect();
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('sheet-overlay').addEventListener('click', closeSheet);
  init();
});
