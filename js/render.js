// ── DOM rendering ────────────────────────────────────────────
// All functions that create or update DOM elements.

import { state } from './state.js';
import { escHtml, formatTimestamp } from './utils.js';

let sortableInstance = null;

function hexToRgba(hex, alpha = 1) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function init() {
  renderList();
  setupDragAndDrop();
}

export function renderList() {
  const titleEl = document.getElementById('listTitle');
  const itemListEl = document.getElementById('itemList');
  const emptyStateEl = document.getElementById('emptyState');

  titleEl.textContent = state.list.title;

  if (state.list.items.length === 0) {
    itemListEl.classList.add('hidden');
    emptyStateEl.classList.remove('hidden');
    removeCompletedSection();
    return;
  }

  const activeItems = state.list.items.filter(i => !i.completedAt);
  const completedItems = state.list.items.filter(i => i.completedAt);

  if (activeItems.length === 0 && completedItems.length > 0) {
    itemListEl.classList.add('hidden');
    emptyStateEl.classList.remove('hidden');
  } else {
    itemListEl.classList.remove('hidden');
    emptyStateEl.classList.add('hidden');
  }

  itemListEl.innerHTML = activeItems.map((item, index) => renderItemCard(item, index)).join('');
  renderCompletedSection(completedItems);
  updateEventListeners();
}

function renderItemCard(item, index) {
  const prevIndex = item.prevIndex ?? index;
  const rankChange = prevIndex - index;
  const rankIndicator = rankChange > 0
    ? `<span class="rank-up">↑ ${rankChange}</span>`
    : rankChange < 0
    ? `<span class="rank-down">↓ ${Math.abs(rankChange)}</span>`
    : '';

  const isBlocked = !!item.blockedMessage;
  const blockedClass = isBlocked ? ' item-card--blocked' : '';
  const blockedBanner = isBlocked
    ? `<div class="blocked-banner"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8 0-1.85.63-3.55 1.69-4.9L16.9 18.31C15.55 19.37 13.85 20 12 20zm6.31-3.1L7.1 5.69C8.45 4.63 10.15 4 12 4c4.42 0 8 3.58 8 8 0 1.85-.63 3.55-1.69 4.9z"/></svg>${escHtml(item.blockedMessage)}</div>`
    : '';

  return `
    <div class="item-card${blockedClass}" data-id="${item.id}" data-index="${index}" style="background: ${item.color}; border-color: white;">
      ${blockedBanner}
      <div class="item-left-col">
        <span class="item-priority">${item.priority}</span>
        ${item.tags.length > 0 ? item.tags.map(tag => `<span class="tag">${escHtml(tag)}</span>`).join('') : ''}
      </div>
      <div class="item-center-col">
        <h3 class="item-text">${escHtml(item.text)}</h3>
        ${item.notes ? `<div class="item-notes">${escHtml(item.notes)}</div>` : ''}
      </div>
      <div class="item-right-col">
        ${rankIndicator}
        <button class="complete-item-btn" title="Mark complete" data-id="${item.id}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
          </svg>
        </button>
        <button class="block-item-btn" title="${isBlocked ? 'Unblock' : 'Block'}" data-id="${item.id}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8 0-1.85.63-3.55 1.69-4.9L16.9 18.31C15.55 19.37 13.85 20 12 20zm6.31-3.1L7.1 5.69C8.45 4.63 10.15 4 12 4c4.42 0 8 3.58 8 8 0 1.85-.63 3.55-1.69 4.9z"/>
          </svg>
        </button>
        <button class="edit-item-btn" title="Edit" data-id="${item.id}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
          </svg>
        </button>
        <button class="delete-item-btn" title="Delete" data-id="${item.id}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
          </svg>
        </button>
      </div>
    </div>
  `;
}

function removeCompletedSection() {
  const existing = document.getElementById('completedSection');
  if (existing) existing.remove();
}

function renderCompletedSection(completedItems) {
  removeCompletedSection();
  if (completedItems.length === 0) return;

  const container = document.querySelector('.container');
  const section = document.createElement('div');
  section.id = 'completedSection';
  section.className = 'completed-section';

  const isCollapsed = state._completedCollapsed !== false;

  section.innerHTML = `
    <button class="completed-toggle" id="completedToggle">
      <svg class="completed-chevron ${isCollapsed ? '' : 'open'}" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6-6-6z"/>
      </svg>
      <span>Completed</span>
      <span class="completed-count">${completedItems.length}</span>
    </button>
    <div class="completed-list ${isCollapsed ? 'collapsed' : ''}">
      ${completedItems.map(item => `
        <div class="completed-card" data-id="${item.id}" style="--card-color: ${item.color};">
          <div class="completed-left">
            <button class="uncomplete-item-btn" title="Restore" data-id="${item.id}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
              </svg>
            </button>
            <span class="completed-text">${escHtml(item.text)}</span>
          </div>
          <div class="completed-right">
            <span class="completed-time">${formatTimestamp(item.completedAt)}</span>
            <button class="delete-item-btn" title="Delete" data-id="${item.id}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
              </svg>
            </button>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  const emptyState = document.getElementById('emptyState');
  container.insertBefore(section, emptyState.nextSibling);

  document.getElementById('completedToggle').addEventListener('click', () => {
    const list = section.querySelector('.completed-list');
    const chevron = section.querySelector('.completed-chevron');
    list.classList.toggle('collapsed');
    chevron.classList.toggle('open');
    state._completedCollapsed = list.classList.contains('collapsed');
  });

  section.querySelectorAll('.uncomplete-item-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { toggleComplete } = await import('./state.js');
      toggleComplete(btn.dataset.id);
      renderList();
      saveToBackend();
    });
  });

  section.querySelectorAll('.delete-item-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirm('Delete this item?')) {
        const { deleteItem } = await import('./state.js');
        deleteItem(btn.dataset.id);
        renderList();
        saveToBackend();
      }
    });
  });
}

export function renderUrlDisplay() {
  const urlDisplayEl = document.getElementById('urlDisplay');
  const shareUrlEl = document.getElementById('shareUrl');

  const url = `${window.location.origin}/#/${state.currentListId}/`;
  shareUrlEl.value = url;
  urlDisplayEl.style.display = 'block';
}

export function openItemModal(item = null) {
  const modal = document.getElementById('itemModal');
  const title = document.getElementById('modalTitle');
  const form = document.getElementById('itemForm');

  title.textContent = item ? 'Edit Item' : 'Add Item';
  form.reset();

  if (item) {
    document.getElementById('itemText').value = item.text;
    document.getElementById('itemPriority').value = item.priority;
    document.getElementById('itemTags').value = item.tags.join(', ');
    document.getElementById('itemNotes').value = item.notes || '';

    const colorOption = document.querySelector(`[data-color="${item.color}"]`);
    if (colorOption) {
      document.querySelectorAll('.color-option').forEach(btn => btn.classList.remove('active'));
      colorOption.classList.add('active');
    }
  }

  state.editingItem = item;
  modal.classList.add('open');
}

export function closeItemModal() {
  const modal = document.getElementById('itemModal');
  modal.classList.remove('open');
  state.editingItem = null;
}

export function openBlockModal(itemId) {
  const modal = document.getElementById('blockModal');
  document.getElementById('blockMessage').value = '';
  modal.dataset.itemId = itemId;
  modal.classList.add('open');
  document.getElementById('blockMessage').focus();
}

export function closeBlockModal() {
  const modal = document.getElementById('blockModal');
  modal.classList.remove('open');
  delete modal.dataset.itemId;
}

export function openTemplateModal() {
  const modal = document.getElementById('templateModal');
  modal.classList.add('open');
}

export function closeTemplateModal() {
  const modal = document.getElementById('templateModal');
  modal.classList.remove('open');
}

export function getSelectedColor() {
  const activeColor = document.querySelector('.color-option.active');
  return activeColor ? activeColor.dataset.color : '#f97316';
}

function setupDragAndDrop() {
  const itemListEl = document.getElementById('itemList');

  if (sortableInstance) {
    sortableInstance.destroy();
  }

  sortableInstance = new Sortable(itemListEl, {
    animation: 250,
    easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    ghostClass: 'dragging',
    filter: 'button, .edit-item-btn, .delete-item-btn, .complete-item-btn, .block-item-btn',
    preventOnFilter: false,
    onEnd: async function(evt) {
      const { oldIndex, newIndex } = evt;
      if (oldIndex !== newIndex) {
        const { reorderItems } = await import('./state.js');
        const activeItems = state.list.items.filter(i => !i.completedAt);
        const movedItemId = activeItems[oldIndex].id;
        const fullOldIndex = state.list.items.findIndex(i => i.id === movedItemId);
        const targetItemId = activeItems[newIndex].id;
        const fullNewIndex = state.list.items.findIndex(i => i.id === targetItemId);
        reorderItems(fullOldIndex, fullNewIndex);
        const movedItem = state.list.items.find(item => item.id === movedItemId);
        if (movedItem) {
          movedItem.prevIndex = oldIndex;
        }
        renderList();
        saveToBackend();
      }
    }
  });
}

function updateEventListeners() {
  document.querySelectorAll('.edit-item-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const itemId = btn.dataset.id;
      const item = state.list.items.find(i => i.id === itemId);
      if (item) {
        openItemModal(item);
      }
    });
  });

  document.querySelectorAll('.delete-item-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const itemId = btn.dataset.id;
      if (confirm('Delete this item?')) {
        const { deleteItem } = await import('./state.js');
        deleteItem(itemId);
        renderList();
        saveToBackend();
      }
    });
  });

  document.querySelectorAll('.complete-item-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const { toggleComplete } = await import('./state.js');
      toggleComplete(btn.dataset.id);
      renderList();
      saveToBackend();
    });
  });

  document.querySelectorAll('.block-item-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const itemId = btn.dataset.id;
      const item = state.list.items.find(i => i.id === itemId);
      if (item && item.blockedMessage) {
        const { toggleBlocked } = await import('./state.js');
        toggleBlocked(itemId);
        renderList();
        saveToBackend();
      } else {
        openBlockModal(itemId);
      }
    });
  });
}

async function saveToBackend() {
  const data = await import('./data.js');
  const cleanItems = state.list.items.map(item => {
    const { prevIndex, ...rest } = item;
    const clean = { ...rest };
    if (!clean.completedAt) delete clean.completedAt;
    if (!clean.blockedMessage) delete clean.blockedMessage;
    return clean;
  });
  await data.updateList(state.currentListId, {
    title: state.list.title,
    items: cleanItems
  });
}

export { saveToBackend };
