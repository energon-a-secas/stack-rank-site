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
  document.getElementById('exportBtn').addEventListener('click', handleExport);
  document.getElementById('importBtn').addEventListener('click', handleImportClick);
  document.getElementById('importFileInput').addEventListener('change', handleImportFile);
  document.getElementById('resetRanksBtn').addEventListener('click', handleResetRanks);

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

function handleExport() {
  try {
    const exportData = {
      version: 1,
      listId: state.currentListId,
      title: state.list.title,
      items: state.list.items.map(item => {
        const { prevIndex, ...cleanItem } = item;
        return cleanItem;
      }),
      exportedAt: new Date().toISOString()
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `stack-rank-${state.currentListId}-${Date.now()}.json`;
    link.click();

    URL.revokeObjectURL(url);
    showToast('List exported successfully');
  } catch (error) {
    console.error('Export failed:', error);
    showToast('Failed to export list', 'error');
  }
}

function handleImportClick() {
  const fileInput = document.getElementById('importFileInput');
  fileInput.click();
}

async function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const importData = JSON.parse(text);

    // Validate import data
    if (!importData.version || !importData.title || !Array.isArray(importData.items)) {
      throw new Error('Invalid backup file format');
    }

    // Validate items
    for (const item of importData.items) {
      if (!item.id || !item.text || !item.priority || !item.color) {
        throw new Error('Invalid item data in backup file');
      }
      // Check priority is valid
      if (!['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].includes(item.priority)) {
        throw new Error(`Invalid priority value: ${item.priority}`);
      }
    }

    // Confirm import
    const confirmMsg = `Import ${importData.items.length} items from "${importData.title}"?\n\nThis will replace your current list.`;
    if (!confirm(confirmMsg)) {
      e.target.value = ''; // Reset file input
      return;
    }

    // Import data
    updateTitle(importData.title);
    state.list.items = importData.items;

    renderList();
    await saveToBackend();

    showToast(`Imported ${importData.items.length} items successfully`);
    e.target.value = ''; // Reset file input
  } catch (error) {
    console.error('Import failed:', error);
    showToast(`Failed to import: ${error.message}`, 'error');
    e.target.value = ''; // Reset file input
  }
}

async function handleResetRanks() {
  if (!confirm('Reset all rank indicators? This will clear the movement arrows.')) {
    return;
  }

  try {
    // Clear prevIndex from all items
    state.list.items.forEach(item => {
      delete item.prevIndex;
    });

    renderList();
    await saveToBackend();
    showToast('Rank indicators reset');
  } catch (error) {
    console.error('Reset ranks failed:', error);
    showToast('Failed to reset ranks', 'error');
  }
}

// Expose TEMPLATES to window for use in templates modal
window.TEMPLATES = TEMPLATES;
