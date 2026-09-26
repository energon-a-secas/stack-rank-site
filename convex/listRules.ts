// What a stored list may contain, checked before every write.
//
// The list mutations are public and take no identity: anyone holding a list's
// link may edit it, which is the product (see README). So these checks are the
// only thing between a direct API caller and the rows every visitor renders.
// js/render.js escapes on output as well; this is the second layer, so one of
// them failing does not reopen the hole.
//
// The page stops every value these rules refuse before sending it: item text,
// notes and block reason have input maxlengths below these limits (200, 500,
// 100), the title and tags are cut or refused at these same limits, a restore
// stops at the active-item cap, and a typed link id that fails LIST_ID starts a
// draft under a fresh id. js/rules.js is the page's copy of this file, and
// tests/list-rules.test.mjs checks the two agree. The one exception is a row
// stored before these rules existed that already fails them: it loads, but no
// save of it passes until the offending item is removed.
//
// Completed items are never pruned, so a list grows for as long as it is used.
// The cap that matters is on active items; the total is capped at Convex's own
// array limit (8192 elements), so it refuses nothing the deployment would have
// stored. A list of typical items meets the 1 MiB document limit at about that
// size anyway, and that ceiling is the platform's, not this file's.
//
// Nothing here imports the generated server code, which is what lets
// tests/list-rules.test.mjs run it under node.

import { ConvexError } from "convex/values";

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
} as const;

// A list id arrives from the URL hash, so it is whatever a browser leaves in a
// fragment: generated ids are base36, a typed one can carry "." "~" or percent
// escapes. Nothing HTML-significant fits.
const LIST_ID = /^[A-Za-z0-9._~%-]+$/;

// Item ids are always generated: base36, or "1" to "8" in the templates.
const ITEM_ID = /^[A-Za-z0-9_-]+$/;

// The color is written into a style attribute, so only a hex color counts.
// js/utils.js applies the same pattern before rendering.
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const PRIORITIES = ["P1", "P2", "P3", "P4", "P5", "P6"];

export type StoredItem = {
  id: string;
  text: string;
  color: string;
  priority: string;
  tags: string[];
  notes?: string;
  prevIndex?: number;
  completedAt?: number;
  blockedMessage?: string;
};

function reject(message: string): never {
  throw new ConvexError(message);
}

function checkLength(value: string, max: number, field: string) {
  if (value.length > max) reject(`${field} is longer than ${max} characters.`);
}

export function checkListId(listId: string) {
  if (listId.length === 0 || listId.length > LIMITS.listId || !LIST_ID.test(listId)) {
    reject(`List id must be 1 to ${LIMITS.listId} letters, digits, or . _ ~ % -`);
  }
}

export function checkTitle(title: string) {
  checkLength(title, LIMITS.title, "Title");
}

export function checkItems(items: StoredItem[]) {
  if (items.length > LIMITS.items) reject(`A list holds at most ${LIMITS.items} items.`);
  // An item with no completedAt is active, as the page reads it (!item.completedAt).
  if (items.filter((item) => !item.completedAt).length > LIMITS.activeItems) {
    reject(`A list holds at most ${LIMITS.activeItems} items that are not completed.`);
  }
  for (const item of items) {
    if (item.id.length === 0 || item.id.length > LIMITS.itemId || !ITEM_ID.test(item.id)) {
      reject(`Item id must be 1 to ${LIMITS.itemId} letters, digits, _ or -`);
    }
    checkLength(item.text, LIMITS.text, "Item text");
    if (!HEX_COLOR.test(item.color)) reject("Item color must be a hex color such as #3574db.");
    if (!PRIORITIES.includes(item.priority)) reject("Item priority must be one of P1 to P6.");
    if (item.tags.length > LIMITS.tags) reject(`An item holds at most ${LIMITS.tags} tags.`);
    for (const tag of item.tags) checkLength(tag, LIMITS.tag, "Tag");
    if (item.notes !== undefined) checkLength(item.notes, LIMITS.notes, "Notes");
    if (item.blockedMessage !== undefined) {
      checkLength(item.blockedMessage, LIMITS.blockedMessage, "Block reason");
    }
    if (item.completedAt !== undefined && !(Number.isFinite(item.completedAt) && item.completedAt >= 0)) {
      reject("completedAt must be a timestamp.");
    }
    if (
      item.prevIndex !== undefined &&
      !(Number.isInteger(item.prevIndex) && item.prevIndex >= 0 && item.prevIndex <= LIMITS.items)
    ) {
      reject("prevIndex must be a position in the list.");
    }
  }
}
