// ── Entry point ──────────────────────────────────────────────
// Import modules and initialize the app.
// Keep this file under 50 lines — it only wires things together.

import { state, loadFromBackend, createNewList, loadFromLocalStorage } from './state.js';
import * as render from './render.js';
import * as events from './events.js';
import * as data from './data.js';
import * as utils from './utils.js';

async function loadListFromHash() {
  // Use hash-based routing for GitHub Pages compatibility
  const hash = window.location.hash.slice(1); // Remove leading #
  const urlListId = hash.split('/').filter(Boolean)[0];

  if (urlListId && urlListId !== state.currentListId) {
    state.currentListId = urlListId;
    const list = await data.getList(urlListId);
    if (list) {
      loadFromBackend(list);
    } else {
      createNewList(urlListId);
    }
    loadFromLocalStorage();
    render.renderList();
  }
}

async function init() {
  try {
    console.log('[App] Starting initialization...');
    await utils.loadConvexClient();
    console.log('[App] Convex client loaded');

    // Check for hash in URL
    const hash = window.location.hash.slice(1);
    const urlListId = hash.split('/').filter(Boolean)[0];
    console.log('[App] Hash:', hash, '| Extracted ID:', urlListId);

    if (urlListId) {
      state.currentListId = urlListId;
      console.log('[App] Loading list:', urlListId);
      const list = await data.getList(urlListId);
      if (list) {
        console.log('[App] List found in DB:', list);
        loadFromBackend(list);
        console.log('[App] State after loadFromBackend:', state.list);
      } else {
        console.log('[App] List not found, starting a draft with ID:', urlListId);
        createNewList(urlListId);
      }
    } else {
      // A bare visit gets a draft and no URL. Both the row and the hash appear on
      // the first edit, so reading the site costs the deployment nothing.
      console.log('[App] No hash, starting an unsaved draft');
      createNewList();
    }

    // Don't load from localStorage when loading from backend - it might have stale data
    // loadFromLocalStorage();

    render.init();
    events.init();

    // Listen for hash changes (back/forward navigation)
    window.addEventListener('hashchange', loadListFromHash);

    console.log('[App] Initialization complete');
    utils.showToast(state.isDraft ? 'New list ready' : 'List loaded successfully');

  } catch (error) {
    console.error('[App] Failed to initialize:', error);
    utils.showToast('Failed to load list', 'error');
  }
}

document.addEventListener('DOMContentLoaded', init);
