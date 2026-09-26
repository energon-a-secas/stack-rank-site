// ── State management ─────────────────────────────────────────
// Shared mutable state object. All modules import and mutate the
// same reference, replacing the original top-level `let` globals.

import { isListId, parseTags } from './rules.js';

const STORAGE_KEY = 'stack-rank-state';

export const state = {
  currentListId: null,
  list: {
    title: 'New Priority List',
    items: []
  },
  editingItem: null,
  convex: null,
  isModified: false,
  // True while the list exists only in this browser. A bare visit to the site
  // used to insert a `lists` row before the visitor had typed anything, so every
  // click through from the hub left an empty document behind. Nothing is written
  // until the first real edit, or until Share, which needs a link that resolves.
  isDraft: false
};

export const TEMPLATES = {
  /*
   * The demonstration template. Every other one is a flat list, which shows
   * none of what this tool actually does. This one is a sprint caught
   * mid-reshuffle: `prevIndex` drives the up/down rank deltas, one item is
   * blocked on someone else, one has already shipped. It is the only template
   * where the card can be seen in all of its states at once.
   *
   * `prevIndex` is the item's position in the *previous* ordering, counted
   * over active items only, so these seven must stay a permutation of 0-6.
   * The field is display-only: saveToBackend strips it, so the deltas fade on
   * the next reload, which is the correct lifetime for "what moved recently".
   */
  shifting: {
    title: 'Shifting Priorities',
    items: [
      { id: '1', text: 'Patch the auth token refresh loop', color: '#d63a3a', priority: 'P1', tags: ['urgent', 'security'], notes: 'Sessions dropping after 30 minutes. Two enterprise accounts have escalated.', prevIndex: 4 },
      { id: '2', text: 'Cut checkout latency below 400ms', color: '#e06b2d', priority: 'P1', tags: ['performance'], notes: 'p95 is 1.2s on mobile.', prevIndex: 1 },
      { id: '3', text: 'Ship the billing migration', color: '#3574db', priority: 'P2', tags: ['billing', 'infra'], notes: 'Slipped a slot after the auth incident took the week.', prevIndex: 0 },
      { id: '4', text: 'Rework the onboarding empty states', color: '#7c52d9', priority: 'P3', tags: ['design', 'growth'], notes: '', prevIndex: 5 },
      { id: '5', text: 'Retire the v1 reporting endpoint', color: '#1296b0', priority: 'P3', tags: ['tech-debt'], notes: '', prevIndex: 2, blockedMessage: 'Two customers still on v1, no migration date' },
      { id: '6', text: 'Add audit log export', color: '#1a9e70', priority: 'P4', tags: ['enterprise'], notes: 'Asked for in three renewal calls.', prevIndex: 3 },
      { id: '7', text: 'Translate the docs to Spanish', color: '#d44080', priority: 'P5', tags: ['content', 'i18n'], notes: '', prevIndex: 6 },
      { id: '8', text: 'Roll out the new status page', color: '#d4890f', priority: 'P4', tags: ['infra'], notes: '', completedAt: Date.now() - 3 * 60 * 60 * 1000 }
    ]
  },
  shopping: {
    title: 'Shopping List',
    items: [
      { id: '1', text: 'Milk and dairy', color: '#3574db', priority: 'P2', tags: ['grocery'], notes: '' },
      { id: '2', text: 'Fresh vegetables', color: '#1a9e70', priority: 'P2', tags: ['grocery', 'healthy'], notes: '' },
      { id: '3', text: 'Toilet paper', color: '#d4890f', priority: 'P4', tags: ['household'], notes: 'Check for deals on bulk' },
      { id: '4', text: 'Dish soap', color: '#d44080', priority: 'P5', tags: ['household'], notes: '' }
    ]
  },
  team: {
    title: 'Team Sprint Priorities',
    items: [
      { id: '1', text: 'Fix critical login bug', color: '#d63a3a', priority: 'P1', tags: ['urgent', 'bug'], notes: 'Affects 20% of users' },
      { id: '2', text: 'Implement user dashboard', color: '#3574db', priority: 'P1', tags: ['feature'], notes: 'Blocked by API update' },
      { id: '3', text: 'Update documentation', color: '#1a9e70', priority: 'P5', tags: ['docs'], notes: '' }
    ]
  },
  reminder: {
    title: 'Important Reminders',
    items: [
      { id: '1', text: 'Doctor appointment', color: '#d63a3a', priority: 'P1', tags: ['health'], notes: 'Thursday 2pm, bring insurance card' },
      { id: '2', text: 'Pay electricity bill', color: '#d4890f', priority: 'P1', tags: ['bills'], notes: 'Due on 15th' },
      { id: '3', text: 'Renew passport', color: '#7c52d9', priority: 'P3', tags: ['travel'], notes: 'Expires in 3 months' },
      { id: '4', text: 'Schedule car maintenance', color: '#1a9e70', priority: 'P3', tags: ['auto'], notes: 'Oil change overdue' },
      { id: '5', text: 'Buy birthday gift', color: '#d44080', priority: 'P4', tags: ['personal'], notes: 'For mom, likes gardening' }
    ]
  },
  project: {
    title: 'Project Milestones',
    items: [
      { id: '1', text: 'Define project scope', color: '#3574db', priority: 'P1', tags: ['planning'], notes: 'Get stakeholder approval' },
      { id: '2', text: 'Create wireframes', color: '#7c52d9', priority: 'P2', tags: ['design'], notes: 'Focus on mobile first' },
      { id: '3', text: 'Set up development environment', color: '#1a9e70', priority: 'P3', tags: ['dev'], notes: 'Include CI/CD pipeline' },
      { id: '4', text: 'Write unit tests', color: '#1296b0', priority: 'P4', tags: ['testing', 'quality'], notes: 'Target 80% coverage' }
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
  s.isDraft = false;
}

/**
 * Start a new list in memory. Writes nothing: the row is inserted by
 * `persistList` on the first edit.
 *
 * A `listId` from the URL hash is treated the same way, so a link to a list that
 * was deleted, or a mistyped id, lands on a saveable draft. It used to land on
 * local state with no row, and the first edit then failed inside
 * `lists:updateList`, which throws "List not found".
 *
 * An id `lists:createList` would refuse (convex/listRules.ts: a ":" or "!" a
 * browser leaves in a fragment, say) gets a fresh random id instead, or the
 * first edit would fail. The caller compares `s.currentListId` with what it
 * passed to tell the visitor.
 */
export function createNewList(listId = null, s = state) {
  const newListId = isListId(listId) ? listId : Math.random().toString(36).substring(2, 12);
  s.currentListId = newListId;
  s.list = {
    title: 'New Priority List',
    items: []
  };
  s.isModified = false;
  s.isDraft = true;

  return newListId;
}

/**
 * Write the list to the backend, inserting its row the first time.
 *
 * The create-or-update choice lives here rather than in `render.js` so it can be
 * tested without a DOM: `tests/draft.test.mjs` passes a fake data layer. Returns
 * `{ created }` so the caller can put the id in the URL at the one moment the
 * link starts resolving.
 *
 * `prevIndex` is display-only and never stored, and an absent `completedAt` or
 * `blockedMessage` is dropped rather than sent as null, which the validators in
 * `convex/lists.ts` would reject.
 */
export async function persistList(dataLayer, s = state) {
  const cleanItems = s.list.items.map(item => {
    const { prevIndex, ...rest } = item;
    const clean = { ...rest };
    if (!clean.completedAt) delete clean.completedAt;
    if (!clean.blockedMessage) delete clean.blockedMessage;
    return clean;
  });
  const payload = { title: s.list.title, items: cleanItems };

  if (s.isDraft) {
    await dataLayer.createList(s.currentListId, payload);
    s.isDraft = false;
    return { created: true, listId: s.currentListId };
  }

  await dataLayer.updateList(s.currentListId, payload);
  return { created: false, listId: s.currentListId };
}

/** Add a new item to the list */
export function addItem(itemData, s = state) {
  const newItem = {
    id: Math.random().toString(36).substring(2, 10),
    text: itemData.text,
    color: itemData.color || '#f97316',
    priority: itemData.priority || 'P3',
    tags: parseTags(itemData.tags),
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
      tags: parseTags(itemData.tags),
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

/**
 * Load template data.
 *
 * Items are deep-copied. A shallow `[...template.items]` hands the live item
 * objects straight to the list, so completing or blocking an item afterwards
 * writes that state back into TEMPLATES and the template is permanently dirty
 * for the rest of the session.
 */
export function loadTemplate(templateName, s = state) {
  if (TEMPLATES[templateName]) {
    const template = TEMPLATES[templateName];
    s.list.title = template.title;
    s.list.items = template.items.map(item => ({ ...item, tags: [...item.tags] }));
    s.isModified = true;
    saveToLocalStorage(s);
    return true;
  }
  return false;
}

/** Mark an item as complete (or uncomplete) */
export function toggleComplete(itemId, s = state) {
  const item = s.list.items.find(i => i.id === itemId);
  if (item) {
    item.completedAt = item.completedAt ? null : Date.now();
    if (item.completedAt) item.blockedMessage = null;
    s.isModified = true;
    saveToLocalStorage(s);
    return item;
  }
  return null;
}

/** Set or clear a blocked message on an item */
export function toggleBlocked(itemId, message = null, s = state) {
  const item = s.list.items.find(i => i.id === itemId);
  if (item) {
    item.blockedMessage = item.blockedMessage ? null : (message || 'Blocked');
    s.isModified = true;
    saveToLocalStorage(s);
    return item;
  }
  return null;
}

/** Update list title */
export function updateTitle(title, s = state) {
  s.list.title = title;
  s.isModified = true;
  saveToLocalStorage(s);
}
