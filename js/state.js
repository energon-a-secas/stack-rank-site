// ── State management ─────────────────────────────────────────
// Shared mutable state object. All modules import and mutate the
// same reference, replacing the original top-level `let` globals.

const STORAGE_KEY = 'stack-rank-state';

export const state = {
  currentListId: null,
  list: {
    title: 'New Priority List',
    items: []
  },
  editingItem: null,
  convex: null,
  isModified: false
};

export const TEMPLATES = {
  shopping: {
    title: 'Shopping List',
    items: [
      { id: '1', text: 'Milk and dairy', color: '#3b82f6', priority: 'P2', tags: ['grocery'], notes: '' },
      { id: '2', text: 'Fresh vegetables', color: '#10b981', priority: 'P2', tags: ['grocery', 'healthy'], notes: '' },
      { id: '3', text: 'Toilet paper', color: '#f59e0b', priority: 'P4', tags: ['household'], notes: 'Check for deals on bulk' },
      { id: '4', text: 'Dish soap', color: '#ec4899', priority: 'P5', tags: ['household'], notes: '' }
    ]
  },
  team: {
    title: 'Team Sprint Priorities',
    items: [
      { id: '1', text: 'Fix critical login bug', color: '#ef4444', priority: 'P1', tags: ['urgent', 'bug'], notes: 'Affects 20% of users' },
      { id: '2', text: 'Implement user dashboard', color: '#3b82f6', priority: 'P1', tags: ['feature'], notes: 'Blocked by API update' },
      { id: '3', text: 'Update documentation', color: '#10b981', priority: 'P5', tags: ['docs'], notes: '' }
    ]
  },
  reminder: {
    title: 'Important Reminders',
    items: [
      { id: '1', text: 'Doctor appointment', color: '#ef4444', priority: 'P1', tags: ['health'], notes: 'Thursday 2pm, bring insurance card' },
      { id: '2', text: 'Pay electricity bill', color: '#f59e0b', priority: 'P1', tags: ['bills'], notes: 'Due on 15th' },
      { id: '3', text: 'Renew passport', color: '#8b5cf6', priority: 'P3', tags: ['travel'], notes: 'Expires in 3 months' },
      { id: '4', text: 'Schedule car maintenance', color: '#10b981', priority: 'P3', tags: ['auto'], notes: 'Oil change overdue' },
      { id: '5', text: 'Buy birthday gift', color: '#ec4899', priority: 'P4', tags: ['personal'], notes: 'For mom, likes gardening' }
    ]
  },
  project: {
    title: 'Project Milestones',
    items: [
      { id: '1', text: 'Define project scope', color: '#3b82f6', priority: 'P1', tags: ['planning'], notes: 'Get stakeholder approval' },
      { id: '2', text: 'Create wireframes', color: '#8b5cf6', priority: 'P2', tags: ['design'], notes: 'Focus on mobile first' },
      { id: '3', text: 'Set up development environment', color: '#10b981', priority: 'P3', tags: ['dev'], notes: 'Include CI/CD pipeline' },
      { id: '4', text: 'Write unit tests', color: '#06b6d4', priority: 'P4', tags: ['testing', 'quality'], notes: 'Target 80% coverage' }
    ]
  }
};

/** Load saved state from localStorage. */
export function loadFromLocalStorage(s = state) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved.listId === s.currentListId) {
        s.list = { ...s.list, ...saved.list };
      }
    }
  } catch {
    // ignore corrupted data
  }
}

/** Persist current state to localStorage. */
export function saveToLocalStorage(s = state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      listId: s.currentListId,
      list: s.list
    }));
  } catch {
    // quota exceeded or private browsing
  }
}

/** Load list from backend */
export function loadFromBackend(listData, s = state) {
  s.list = {
    title: listData.title || 'New Priority List',
    items: listData.items || []
  };
  s.isModified = false;
}

/** Create a new list */
export async function createNewList(listId = null, s = state) {
  const newListId = listId || Math.random().toString(36).substring(2, 12);
  s.currentListId = newListId;
  s.list = {
    title: 'New Priority List',
    items: []
  };
  s.isModified = false;

  if (!listId) {
    const data = await import('./data.js');
    await data.createList(newListId, s.list);
  }

  return newListId;
}

/** Add a new item to the list */
export function addItem(itemData, s = state) {
  const newItem = {
    id: Math.random().toString(36).substring(2, 10),
    text: itemData.text,
    color: itemData.color || '#f97316',
    priority: itemData.priority || 'P3',
    tags: itemData.tags ? itemData.tags.split(',').map(t => t.trim()).filter(t => t) : [],
    notes: itemData.notes || ''
  };

  s.list.items.push(newItem);
  s.isModified = true;
  saveToLocalStorage(s);
  return newItem;
}

/** Update an existing item */
export function updateItem(itemId, itemData, s = state) {
  const itemIndex = s.list.items.findIndex(item => item.id === itemId);
  if (itemIndex !== -1) {
    s.list.items[itemIndex] = {
      ...s.list.items[itemIndex],
      text: itemData.text,
      color: itemData.color,
      priority: itemData.priority,
      tags: itemData.tags ? itemData.tags.split(',').map(t => t.trim()).filter(t => t) : [],
      notes: itemData.notes || ''
    };
    s.isModified = true;
    saveToLocalStorage(s);
    return s.list.items[itemIndex];
  }
  return null;
}

/** Delete an item */
export function deleteItem(itemId, s = state) {
  s.list.items = s.list.items.filter(item => item.id !== itemId);
  s.isModified = true;
  saveToLocalStorage(s);
}

/** Reorder items */
export function reorderItems(oldIndex, newIndex, s = state) {
  const items = [...s.list.items];
  const [movedItem] = items.splice(oldIndex, 1);
  items.splice(newIndex, 0, movedItem);
  s.list.items = items;
  s.isModified = true;
  saveToLocalStorage(s);
}

/** Load template data */
export function loadTemplate(templateName, s = state) {
  if (TEMPLATES[templateName]) {
    const template = TEMPLATES[templateName];
    s.list.title = template.title;
    s.list.items = [...template.items];
    s.isModified = true;
    saveToLocalStorage(s);
    return true;
  }
  return false;
}

/** Update list title */
export function updateTitle(title, s = state) {
  s.list.title = title;
  s.isModified = true;
  saveToLocalStorage(s);
}
