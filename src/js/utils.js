// ── Date formatting ────────────────────────────────────────────────────────

export function formatDateTime(ts) {
  if (!ts) return 'Never';
  const d = (ts.toDate ? ts.toDate() : new Date(ts));
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

export function formatDateTimeShort(ts) {
  if (!ts) return 'Never';
  const d = (ts.toDate ? ts.toDate() : new Date(ts));
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// ── Long-press detection ───────────────────────────────────────────────────

export function addLongPress(el, onTap, onLongPress, duration = 500) {
  let timer = null;
  let longFired = false;

  function startPress() {
    longFired = false;
    timer = setTimeout(() => {
      longFired = true;
      onLongPress();
    }, duration);
  }

  function cancelPress() {
    clearTimeout(timer);
  }

  function endPress() {
    clearTimeout(timer);
    if (!longFired) onTap();
  }

  el.addEventListener('touchstart',  startPress,  { passive: true });
  el.addEventListener('touchend',    endPress);
  el.addEventListener('touchcancel', cancelPress);
  el.addEventListener('touchmove',   cancelPress, { passive: true });

  // Mouse fallback for desktop
  el.addEventListener('mousedown',  startPress);
  el.addEventListener('mouseup',    endPress);
  el.addEventListener('mouseleave', cancelPress);
}

// ── Plate placeholder SVG ──────────────────────────────────────────────────

const PLATE_COLORS = [
  '#1e3a5f','#1a4731','#5c1a1a','#2d1a5c',
  '#7a4310','#0a3d55','#3b2a0a','#1a3a4a',
];

export function platePlaceholderSrc(code, label) {
  const idx   = [...code].reduce((a, c) => a + c.charCodeAt(0), 0) % PLATE_COLORS.length;
  const color = PLATE_COLORS[idx];
  const short = code.replace('_', ' ').slice(0, 8);
  const lbl   = label.length > 16 ? label.slice(0, 16) : label;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 150">
    <rect width="300" height="150" rx="10" fill="${color}"/>
    <rect x="7" y="7" width="286" height="136" rx="7" fill="white" stroke="${color}" stroke-width="3"/>
    <text x="150" y="88" font-family="'Arial Black',Arial,sans-serif" font-size="50" font-weight="900" fill="#1a1a1a" text-anchor="middle" dominant-baseline="middle">${short}</text>
    <text x="150" y="127" font-family="Arial,sans-serif" font-size="13" fill="#555" text-anchor="middle">${lbl.toUpperCase()}</text>
  </svg>`;

  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

// ── Spot counting ──────────────────────────────────────────────────────────

export function getStateCount(spots, playerId, stateCode) {
  return spots.filter(s => s.playerId === playerId && s.stateCode === stateCode).length;
}

export function getVariantCount(spots, playerId, stateCode, variantId) {
  return spots.filter(
    s => s.playerId === playerId && s.stateCode === stateCode && s.variantId === variantId,
  ).length;
}

export function getTotalSpots(spots, playerId) {
  return spots.filter(s => s.playerId === playerId).length;
}

export function getDistinctStates(spots, playerId) {
  return new Set(spots.filter(s => s.playerId === playerId).map(s => s.stateCode)).size;
}

export function getDistinctVariantsForState(spots, playerId, stateCode) {
  return new Set(
    spots
      .filter(s => s.playerId === playerId && s.stateCode === stateCode && s.variantId)
      .map(s => s.variantId),
  ).size;
}

// Session-wide (all players) counts for the session list
export function getSessionTotalSpots(spots) {
  return spots.length;
}

export function getSessionDistinctStates(spots) {
  return new Set(spots.map(s => s.stateCode)).size;
}
