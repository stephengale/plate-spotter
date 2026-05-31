import { App, goBackFromVariant, showToast } from '../app.js';
import { addSpot } from '../db.js';
import { platePlaceholderSrc, addLongPress, getVariantCount } from '../utils.js';

export function mountVariant(stateCode) {
  const plate = App.plates.find(p => p.code === stateCode);
  if (!plate) { goBackFromVariant(); return; }

  document.getElementById('variant-state-label').textContent = plate.label;

  const gridEl = document.getElementById('variant-grid');
  gridEl.innerHTML = '';
  plate.variants.forEach(variant => {
    gridEl.appendChild(buildVariantTile(stateCode, variant));
  });

  document.getElementById('btn-variant-back').replaceWith(
    document.getElementById('btn-variant-back').cloneNode(true),
  );
  document.getElementById('btn-variant-back').addEventListener('click', goBackFromVariant);

  // Keep counts live — the spots listener in game.js is still active.
  // Re-render badges whenever App.spots updates via a MutationObserver shim.
  // Simpler: just re-render once on mount, then rely on the listener callback.
  updateVariantCounts(stateCode);

  // Wire the spots listener to also refresh variant counts while on this screen
  App._variantRefresh = () => updateVariantCounts(stateCode);
}

function buildVariantTile(stateCode, variant) {
  const tile = document.createElement('div');
  tile.className = 'plate-tile';
  tile.dataset.variantId = variant.id;

  const img = document.createElement('img');
  img.src     = variant.image;
  img.alt     = variant.label;
  img.loading = 'lazy';
  img.onerror = () => { img.src = platePlaceholderSrc(variant.id, variant.label); };

  const footer = document.createElement('div');
  footer.className = 'tile-footer';
  const label = document.createElement('div');
  label.className   = 'tile-label';
  label.textContent = variant.label;
  footer.appendChild(label);

  const badge = document.createElement('div');
  badge.className = 'tile-badge';
  badge.hidden = true;

  tile.appendChild(img);
  tile.appendChild(footer);
  tile.appendChild(badge);

  addLongPress(
    tile,
    () => tapVariant(stateCode, variant),
    () => { /* no drill-down on variants */ },
  );

  return tile;
}

function updateVariantCounts(stateCode) {
  const { spots, activePlayerId } = App;
  document.querySelectorAll('#variant-grid [data-variant-id]').forEach(tile => {
    const variantId = tile.dataset.variantId;
    const count     = getVariantCount(spots, activePlayerId, stateCode, variantId);
    const badge     = tile.querySelector('.tile-badge');
    badge.textContent = count;
    badge.hidden = count === 0;
  });
}

async function tapVariant(stateCode, variant) {
  try {
    await addSpot(App.currentSession.id, {
      playerId:  App.activePlayerId,
      stateCode,
      variantId: variant.id,
    });
    // Counts update via the live Firestore listener in game.js;
    // also refresh this screen's badges directly.
    updateVariantCounts(stateCode);
  } catch {
    showToast('Could not record spot — check your connection.');
  }
}
