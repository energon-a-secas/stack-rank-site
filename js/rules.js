// ── Stored-list rules, page side ─────────────────────────────
// The page's copy of convex/listRules.ts: the patterns and limits the backend
// applies before it stores a list. The page uses them to stop a value before it
// is sent (a pasted title, a long tag list, an imported backup, a typed link id
// that could never be saved) and to decide what is safe to write into an HTML
// attribute. tests/list-rules.test.mjs checks that the two files agree.
//
// Imports nothing and touches no DOM, so node runs it as it ships.

export const LIMITS = {
  listId: 64,
  itemId: 64,
  title: 200,
  activeItems: 100,
  items: 8192,
  text: 500,
  tags: 20,
  tag: 100,
  notes: 2000,
  blockedMessage: 500,
};

// Same patterns as convex/listRules.ts; the reasons are written there.
const LIST_ID = /^[A-Za-z0-9._~%-]+$/;
const ITEM_ID = /^[A-Za-z0-9_-]+$/;
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const PRIORITIES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];

/**
 * Item colors and ids arrive from the Convex row and from imported backups, and
 * both are written into HTML attributes, the color into a style attribute. Only
 * a hex color is treated as a color; anything else renders as the default
 * swatch.
 */
export const DEFAULT_COLOR = '#e06b2d';

export function isHexColor(value) {
  return typeof value === 'string' && HEX_COLOR.test(value);
}

export function safeColor(value) {
  return isHexColor(value) ? value : DEFAULT_COLOR;
}

export function isItemId(value) {
  return typeof value === 'string' && value.length <= LIMITS.itemId && ITEM_ID.test(value);
}

export function isListId(value) {
  return typeof value === 'string' && value.length <= LIMITS.listId && LIST_ID.test(value);
}

/** The tags field as the page stores it: comma separated, trimmed, no blanks. */
export function parseTags(value) {
  return value ? String(value).split(',').map(t => t.trim()).filter(t => t) : [];
}

/** Cut text to `max` UTF-16 units without leaving half of a surrogate pair. */
export function clampText(value, max) {
  let out = String(value).slice(0, max);
  if (/[\uD800-\uDBFF]$/.test(out)) out = out.slice(0, -1);
  return out;
}

const isText = (value) => typeof value === 'string';

/**
 * The first reason convex/listRules.ts would refuse this title and these items,
 * or null. An empty completedAt or blockedMessage counts as absent, because
 * persistList drops them before sending; prevIndex is never sent at all.
 */
export function listProblem(title, items) {
  if (!isText(title)) return 'Title must be text.';
  if (title.length > LIMITS.title) return `Title is longer than ${LIMITS.title} characters.`;
  if (!Array.isArray(items)) return 'Items must be a list.';
  if (items.length > LIMITS.items) return `A list holds at most ${LIMITS.items} items.`;
  if (items.filter(item => !item?.completedAt).length > LIMITS.activeItems) {
    return `A list holds at most ${LIMITS.activeItems} items that are not completed.`;
  }
  for (const item of items) {
    if (!item || !isItemId(item.id)) {
      return `Item id must be 1 to ${LIMITS.itemId} letters, digits, _ or -`;
    }
    if (!isText(item.text)) return 'Item text must be text.';
    if (item.text.length > LIMITS.text) return `Item text is longer than ${LIMITS.text} characters.`;
    if (!isHexColor(item.color)) return 'Item color must be a hex color such as #3574db.';
    if (!PRIORITIES.includes(item.priority)) return 'Item priority must be one of P1 to P6.';
    if (!Array.isArray(item.tags) || !item.tags.every(isText)) return 'Item tags must be a list of text.';
    if (item.tags.length > LIMITS.tags) return `An item holds at most ${LIMITS.tags} tags.`;
    if (item.tags.some(tag => tag.length > LIMITS.tag)) return `Tag is longer than ${LIMITS.tag} characters.`;
    if (item.notes !== undefined && !isText(item.notes)) return 'Notes must be text.';
    if (item.notes !== undefined && item.notes.length > LIMITS.notes) {
      return `Notes is longer than ${LIMITS.notes} characters.`;
    }
    if (item.blockedMessage) {
      if (!isText(item.blockedMessage)) return 'Block reason must be text.';
      if (item.blockedMessage.length > LIMITS.blockedMessage) {
        return `Block reason is longer than ${LIMITS.blockedMessage} characters.`;
      }
    }
    if (item.completedAt && !(Number.isFinite(item.completedAt) && item.completedAt >= 0)) {
      return 'completedAt must be a timestamp.';
    }
  }
  return null;
}
