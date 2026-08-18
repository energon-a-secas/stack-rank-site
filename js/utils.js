// Generic helpers come from the DOM Kit (js/neorgon-dom.js, vendored from
// packages/neorgon-ui/dom/). They are re-exported so every existing
// `import { escHtml } from './utils.js'` keeps working.
//
// Do not edit js/neorgon-dom.js. Edit the canonical source and run
// packages/neorgon-ui/sync-dom.sh.
import { escHtml, debounce, showToast as kitToast } from './neorgon-dom.js';
export { escHtml, debounce };

// ── Shared utilities ─────────────────────────────────────────
// Small, pure helper functions used across multiple modules.

import { state } from './state.js';

/** Cached element lookup by ID. */
const _els = {};
export function $(id) {
  return _els[id] || (_els[id] = document.getElementById(id));
}


/** Show a temporary toast notification. */
/** This site's own toast contract, rendered by the kit. */
export function showToast(msg) {
  return kitToast(msg, { id: 'app-toast', className: 'toast',
    visibleClass: 'visible', duration: 3000 });
}


/** Format a timestamp for display (e.g. "Apr 27, 2:35 PM"). */
export function formatTimestamp(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', '
    + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}


/** Load Convex client */
export async function loadConvexClient() {
  if (state.convex) return;

  // Wait for Convex to be loaded via script tag
  let retries = 0;
  while (!window.ConvexHttpClient && retries < 50) {
    await new Promise(resolve => setTimeout(resolve, 100));
    retries++;
  }

  if (!window.ConvexHttpClient) {
    throw new Error('ConvexHttpClient not loaded');
  }

  state.convex = new window.ConvexHttpClient(window.CONVEX_URL || 'https://industrious-hare-401.convex.cloud');
}

/** Copy text to clipboard */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    return false;
  }
}
