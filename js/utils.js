// ── Shared utilities ─────────────────────────────────────────
// Small, pure helper functions used across multiple modules.

import { state } from './state.js';

/** Cached element lookup by ID. */
const _els = {};
export function $(id) {
  return _els[id] || (_els[id] = document.getElementById(id));
}

/** Escape HTML special characters. */
export function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Show a temporary toast notification. */
let _toastTimer = null;
export function showToast(msg, type = 'info') {
  let el = document.getElementById('app-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'app-toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  if (type === 'error') {
    el.style.background = '#7f1d1d';
    el.style.borderColor = '#dc2626';
  } else {
    el.style.background = '#1a1730';
    el.style.borderColor = 'rgba(255,255,255,0.15)';
  }
  el.classList.add('visible');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('visible'), 3000);
}

/** Simple debounce. */
export function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
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
