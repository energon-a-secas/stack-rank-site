// ── Event handlers ───────────────────────────────────────────
// All event listeners and user interaction handlers.

import { state, addItem, updateItem, updateTitle, loadTemplate, TEMPLATES } from './state.js';
import { renderList, openItemModal, closeItemModal, openTemplateModal, closeTemplateModal, getSelectedColor, renderUrlDisplay } from './render.js';
import { saveToBackend } from './render.js';
import { showToast, copyToClipboard } from './utils.js';

export function init() {
  bindEvents();
}

function bindEvents() {
  document.getElementById('listTitle').addEventListener('input', handleTitleChange);
  document.getElementById('listTitle').addEventListener('blur', handleTitleBlur);

  document.getElementById('addItemBtn').addEventListener('click', () => openItemModal());
  document.getElementById('addFirstItemBtn').addEventListener('click', () => openItemModal());
  document.getElementById('shareBtn').addEventListener('click', handleShare);
  document.getElementById('templateBtn').addEventListener('click', openTemplateModal);

  document.getElementById('itemForm').addEventListener('submit', handleItemSubmit);
  document.getElementById('cancelItemBtn').addEventListener('click', closeItemModal);
  document.getElementById('closeModalBtn').addEventListener('click', closeItemModal);

  document.getElementById('copyUrlBtn').addEventListener('click', handleCopyUrl);
  document.getElementById('closeTemplateModalBtn').addEventListener('click', closeTemplateModal);

  document.querySelectorAll('.color-option').forEach(option => {
    option.addEventListener('click', handleColorClick);
  });

  document.querySelectorAll('.template-card').forEach(card => {
    card.addEventListener('click', handleTemplateClick);
  });

  document.addEventListener('click', handleOutsideModalClick);
}

function handleTitleChange(e) {
  updateTitle(e.target.textContent.trim());
}

async function handleTitleBlur(e) {
  const title = e.target.textContent.trim();
  if (!title) {
    e.target.textContent = state.list.title;
    return;
  }
  updateTitle(title);
  await saveToBackend();
  showToast('List title updated');
}

async function handleItemSubmit(e) {
  e.preventDefault();

  const itemData = {
    text: document.getElementById('itemText').value,
    priority: document.getElementById('itemPriority').value,
    tags: document.getElementById('itemTags').value,
    notes: document.getElementById('itemNotes').value,
    color: getSelectedColor()
  };

  if (!itemData.text.trim()) {
    showToast('Please enter item text', 'error');
    return;
  }

  if (!state.editingItem && state.list.items.length >= 10) {
    showToast('Maximum 10 items allowed', 'error');
    return;
  }

  try {
    if (state.editingItem) {
      const { updateItem } = await import('./state.js');
      updateItem(state.editingItem.id, itemData);
      showToast('Item updated');
    } else {
      addItem(itemData);
      showToast('Item added');
    }

    renderList();
    await saveToBackend();
  } catch (error) {
    console.error('Error saving item:', error);
    showToast('Failed to save item', 'error');
  } finally {
    closeItemModal();
  }
}

function handleColorClick(e) {
  document.querySelectorAll('.color-option').forEach(option => {
    option.classList.remove('active');
  });
  e.target.classList.add('active');
}

function handleShare() {
  renderUrlDisplay();
  const urlInput = document.getElementById('shareUrl');
  urlInput.select();
}

async function handleCopyUrl() {
  const urlInput = document.getElementById('shareUrl');
  await copyToClipboard(urlInput.value);
  showToast('URL copied to clipboard');
}

async function handleTemplateClick(e) {
  const templateName = e.currentTarget.dataset.template;
  if (!confirm(`Load ${TEMPLATES[templateName].title} template? This will replace your current list.`)) {
    return;
  }

  loadTemplate(templateName);
  renderList();
  await saveToBackend();
  closeTemplateModal();
  showToast('Template loaded');
}

function handleOutsideModalClick(e) {
  const itemModal = document.getElementById('itemModal');
  const templateModal = document.getElementById('templateModal');

  if (e.target === itemModal) {
    closeItemModal();
  } else if (e.target === templateModal) {
    closeTemplateModal();
  }
}

// Expose TEMPLATES to window for use in templates modal
window.TEMPLATES = TEMPLATES;
