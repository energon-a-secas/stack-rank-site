// ── Stored-list rules ────────────────────────────────────────
// convex/listRules.ts is what stands between a direct API caller and the rows
// every visitor renders, since the list mutations take no identity. These tests
// pin both directions: everything the site itself writes passes, and the values
// that used to break out of an HTML attribute are refused.
//
// The rules file imports only convex/values, so node runs it as it ships (type
// stripping). No deployment is involved.
//
//   node --test tests/          (or: make test)

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ConvexError } from 'convex/values';
import { checkItems, checkListId, checkTitle, LIMITS } from '../convex/listRules.ts';
import { TEMPLATES } from '../js/state.js';

const refuses = (fn) => assert.throws(fn, (err) => err instanceof ConvexError);

const item = (over = {}) => ({
  id: 'k3j9x0aa', text: 'Ship it', color: '#3574db', priority: 'P3', tags: [], notes: '', ...over,
});

test('every shipped template is accepted', () => {
  for (const [name, template] of Object.entries(TEMPLATES)) {
    assert.doesNotThrow(() => checkTitle(template.title), name);
    assert.doesNotThrow(() => checkItems(template.items), name);
  }
});

test('generated ids and legitimate text are accepted', () => {
  for (let i = 0; i < 50; i++) {
    checkListId(Math.random().toString(36).substring(2, 12));
    checkItems([item({ id: Math.random().toString(36).substring(2, 10) })]);
  }
  // A typed hash id: dots, tildes and percent escapes are what a fragment holds.
  checkListId('team.q3~planning');
  checkListId('caf%C3%A9');
  // Free text is free: it is escaped where it is rendered, not refused here.
  checkTitle(`Q&A <launch> "big" 'day'`);
  checkItems([item({ text: `A & B <c> "d" 'e'`, tags: ['a&b', '<t>'], notes: '<b>x</b>', blockedMessage: 'Waiting on "A&B"' })]);
});

test('three and six digit hex colors in either case are accepted', () => {
  checkItems([item({ color: '#abc' }), item({ id: 'b', color: '#ABCDEF' })]);
});

test('an item id that breaks out of data-id is refused', () => {
  refuses(() => checkItems([item({ id: '"><img src=x onerror=alert(1)>' })]));
  refuses(() => checkItems([item({ id: '' })]));
  refuses(() => checkItems([item({ id: 'a'.repeat(LIMITS.itemId + 1) })]));
});

test('a color that is not a hex color is refused', () => {
  for (const color of ['red;"><svg onload=alert(1)>', 'url(/track)', 'red', '#12', '#1234567', 'var(--accent)', '#abc;x:y']) {
    refuses(() => checkItems([item({ color })]));
  }
});

test('a list id with HTML-significant characters is refused', () => {
  for (const id of ['', '<x>', 'a"b', "a'b", 'a b', 'a/b', 'a&b', 'x'.repeat(LIMITS.listId + 1)]) {
    refuses(() => checkListId(id));
  }
});

test('lengths and counts are capped', () => {
  refuses(() => checkTitle('t'.repeat(LIMITS.title + 1)));
  refuses(() => checkItems([item({ text: 'x'.repeat(LIMITS.text + 1) })]));
  refuses(() => checkItems([item({ notes: 'x'.repeat(LIMITS.notes + 1) })]));
  refuses(() => checkItems([item({ blockedMessage: 'x'.repeat(LIMITS.blockedMessage + 1) })]));
  refuses(() => checkItems([item({ tags: Array(LIMITS.tags + 1).fill('t') })]));
  refuses(() => checkItems([item({ tags: ['t'.repeat(LIMITS.tag + 1)] })]));
  refuses(() => checkItems(Array.from({ length: LIMITS.items + 1 }, (_, i) => item({ id: `i${i}` }))));
  assert.doesNotThrow(() => checkItems(Array.from({ length: LIMITS.items }, (_, i) => item({ id: `i${i}` }))));
});

test('limits sit above what the page lets anyone type', () => {
  // index.html: itemText maxlength 200, itemNotes 500, blockMessage 100; the
  // page stops at 10 active items.
  assert.ok(LIMITS.text >= 200);
  assert.ok(LIMITS.notes >= 500);
  assert.ok(LIMITS.blockedMessage >= 100);
  assert.ok(LIMITS.items >= 10);
});

test('numbers must be real positions and timestamps', () => {
  refuses(() => checkItems([item({ completedAt: Number.NaN })]));
  refuses(() => checkItems([item({ completedAt: -1 })]));
  refuses(() => checkItems([item({ prevIndex: 1.5 })]));
  refuses(() => checkItems([item({ prevIndex: Number.POSITIVE_INFINITY })]));
  checkItems([item({ completedAt: Date.now(), prevIndex: 3 })]);
});
