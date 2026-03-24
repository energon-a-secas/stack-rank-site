// ── Entry point ──────────────────────────────────────────────
// Import modules and initialize the app.
// Keep this file under 50 lines — it only wires things together.

import { state, loadFromBackend, createNewList, loadFromLocalStorage } from './state.js';
import * as render from './render.js';
import * as events from './events.js';
import * as data from './data.js';
import * as utils from './utils.js';

async function init() {
  try {
    await utils.loadConvexClient();

    const pathParts = window.location.pathname.split('/').filter(Boolean);
    const urlListId = pathParts[0];

    if (urlListId) {
      state.currentListId = urlListId;
      const list = await data.getList(urlListId);
      if (list) {
        loadFromBackend(list);
      } else {
        await createNewList(urlListId);
      }
    } else {
      await createNewList();
      history.replaceState(null, '', `/${state.currentListId}/`);
    }

    loadFromLocalStorage();

    render.init();
    events.init();

  } catch (error) {
    console.error('Failed to initialize app:', error);
    utils.showToast('Failed to load list', 'error');
  }
}

document.addEventListener('DOMContentLoaded', init);
