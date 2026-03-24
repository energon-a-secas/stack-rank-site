// ── DOM rendering ────────────────────────────────────────────
// All functions that create or update DOM elements.

import { state } from './state.js';
import { escHtml } from './utils.js';

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
    return;
  }

  itemListEl.classList.remove('hidden');
  emptyStateEl.classList.add('hidden');

  itemListEl.innerHTML = state.list.items.map((item, index) => {
    const prevIndex = item.prevIndex ?? index;
    const rankChange = prevIndex - index;
    const rankIndicator = rankChange > 0
      ? `<span class="rank-up">↑ ${rankChange}</span>`
      : rankChange < 0
      ? `<span class="rank-down">↓ ${Math.abs(rankChange)}</span>`
      : '';

    return `
    <div class="item-card" data-id="${item.id}" data-index="${index}" style="background: ${item.color}; border-color: white;">
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
  }).join('');

  updateEventListeners();
}

export function renderUrlDisplay() {
  const urlDisplayEl = document.getElementById('urlDisplay');
  const shareUrlEl = document.getElementById('shareUrl');

  const url = `${window.location.origin}/${state.currentListId}/`;
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
    filter: 'button, .edit-item-btn, .delete-item-btn',
    preventOnFilter: false,
    onEnd: async function(evt) {
      const { oldIndex, newIndex } = evt;
      if (oldIndex !== newIndex) {
        const { reorderItems } = await import('./state.js');
        // Store the old position for rank indicator
        state.list.items[oldIndex].prevIndex = oldIndex;
        reorderItems(oldIndex, newIndex);
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
}

async function saveToBackend() {
  const data = await import('./data.js');
  await data.updateList(state.currentListId, {
    title: state.list.title,
    items: state.list.items
  });
}

export { saveToBackend };
