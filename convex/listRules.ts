// What a stored list may contain, checked before every write.
//
// The list mutations are public and take no identity: anyone holding a list's
// link may edit it, which is the product (see README). So these checks are the
// only thing between a direct API caller and the rows every visitor renders.
// js/render.js escapes on output as well; this is the second layer, so one of
// them failing does not reopen the hole.
//
// Limits sit above what the page lets anyone type (item text 200, notes 500,
// block reason 100, 10 active items), so no list the site itself wrote is
// refused. Nothing here imports the generated server code, which is what lets
// tests/list-rules.test.mjs run it under node.

import { ConvexError } from "convex/values";

export const LIMITS = {
  listId: 64,
  itemId: 64,
  title: 200,
  items: 100,
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
