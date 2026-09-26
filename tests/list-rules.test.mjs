// ── Stored-list rules ────────────────────────────────────────
// convex/listRules.ts is what stands between a direct API caller and the rows
// every visitor renders, since the list mutations take no identity. These tests
// pin both directions: everything the site itself writes passes, and the values
// that used to break out of an HTML attribute are refused.
//
// The rules file imports only convex/values, so node runs it as it ships (type
// stripping). No deployment is involved.
//
//   make test          (or: node --test 'tests/*.test.mjs'; a bare directory
//                       argument is read as one test file and fails)

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';
import { ConvexError } from 'convex/values';
import { checkItems, checkListId, checkTitle, LIMITS } from '../convex/listRules.ts';
import * as page from '../js/rules.js';
import { TEMPLATES, addItem, createNewList, persistList, toggleComplete, updateTitle } from '../js/state.js';

const refuses = (fn) => assert.throws(fn, (err) => err instanceof ConvexError);

const item = (over = {}) => ({
  id: 'k3j9x0aa', text: 'Ship it', color: '#3574db', priority: 'P3', tags: [], notes: '', ...over,
});

const done = (over = {}) => item({ completedAt: 1_700_000_000_000, ...over });

/** A stand-in for js/data.js that applies the server's rules and nothing else. */
const strictServer = {
  async createList(listId, payload) { checkListId(listId); checkTitle(payload.title); checkItems(payload.items); },
  async updateList(listId, payload) { checkTitle(payload.title); checkItems(payload.items); },
};

const freshState = () => ({
  currentListId: null, list: { title: 'New Priority List', items: [] },
  editingItem: null, convex: null, isModified: false, isDraft: false,
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
  refuses(() => checkItems(Array.from({ length: LIMITS.activeItems + 1 }, (_, i) => item({ id: `i${i}` }))));
  assert.doesNotThrow(() => checkItems(Array.from({ length: LIMITS.activeItems }, (_, i) => item({ id: `i${i}` }))));
  refuses(() => checkItems(Array.from({ length: LIMITS.items + 1 }, (_, i) => done({ id: `i${i}` }))));
  assert.doesNotThrow(() => checkItems(Array.from({ length: LIMITS.items }, (_, i) => done({ id: `i${i}` }))));
});

test('the total cap is Convex\'s own array limit, not a lower one', () => {
  // A list keeps every item it finishes. A lower total cap made a list that had
  // finished about 90 items unsaveable through ordinary use.
  assert.equal(LIMITS.items, 8192);
});

test('a long-lived list keeps saving as completed items pile up', async () => {
  // The page's own flow, as a visitor would drive it: add an item, finish it,
  // repeat, with every save going through the server's rules.
  const s = freshState();
  createNewList(null, s);
  for (let i = 0; i < 400; i++) {
    const added = addItem({ text: `task ${i}`, color: '#3574db', priority: 'P3', tags: 'a, b' }, s);
    await persistList(strictServer, s);
    toggleComplete(added.id, s);
    await persistList(strictServer, s);
  }
  for (let i = 0; i < 10; i++) addItem({ text: `open ${i}`, color: '#1a9e70', priority: 'P1', tags: '' }, s);
  await persistList(strictServer, s);
  assert.equal(s.list.items.length, 410);
});

test('limits sit above what the page lets anyone type', () => {
  // Read from index.html rather than copied, so a raised maxlength fails here.
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const maxlength = (id) => Number(html.match(new RegExp(`id="${id}"[^>]*maxlength="(\\d+)"`))[1]);
  assert.ok(LIMITS.text >= maxlength('itemText'));
  assert.ok(LIMITS.notes >= maxlength('itemNotes'));
  assert.ok(LIMITS.blockedMessage >= maxlength('blockMessage'));
  // The page stops adding at 10 active items.
  assert.ok(LIMITS.activeItems >= 10);
  // The title is a contenteditable with no maxlength; events.js cuts it.
  const pasted = 'T'.repeat(LIMITS.title) + '\u{1F600}'.repeat(3);
  assert.doesNotThrow(() => checkTitle(page.clampText(pasted, LIMITS.title)));
  // Cutting never leaves half of a surrogate pair behind.
  const emoji = page.clampText('T'.repeat(LIMITS.title - 1) + '\u{1F600}', LIMITS.title);
  assert.equal(emoji, 'T'.repeat(LIMITS.title - 1));
});

test('the page applies the same limits and patterns as the server', () => {
  assert.deepEqual({ ...page.LIMITS }, { ...LIMITS });
  const cases = [
    [], [item()], [item({ color: '#ABC' })], [item({ tags: ['a&b', '<t>'] })],
    [item({ id: 'x"><img>' })], [item({ id: '' })], [item({ id: 'a'.repeat(65) })],
    [item({ color: 'red' })], [item({ color: 'url(/x)' })], [item({ priority: 'P0' })],
    [item({ text: 'x'.repeat(LIMITS.text) })], [item({ text: 'x'.repeat(LIMITS.text + 1) })],
    [item({ notes: 'x'.repeat(LIMITS.notes + 1) })], [item({ blockedMessage: 'x'.repeat(LIMITS.blockedMessage + 1) })],
    [item({ tags: Array(LIMITS.tags + 1).fill('t') })], [item({ tags: ['t'.repeat(LIMITS.tag + 1)] })],
    [item({ completedAt: -1 })], [done()],
    Array.from({ length: LIMITS.activeItems + 1 }, (_, i) => item({ id: `i${i}` })),
    Array.from({ length: LIMITS.activeItems }, (_, i) => item({ id: `i${i}` })),
    [...Array.from({ length: 300 }, (_, i) => done({ id: `d${i}` })), item()],
  ];
  for (const items of cases) {
    let serverRefused = false;
    try { checkItems(items); } catch { serverRefused = true; }
    const problem = page.listProblem('A title', items);
    assert.equal(problem !== null, serverRefused, `${JSON.stringify(items).slice(0, 80)}: page says ${problem}`);
  }
  assert.notEqual(page.listProblem('t'.repeat(LIMITS.title + 1), []), null);
  for (const id of ['k3j9x0aa', 'team.q3~planning', 'caf%C3%A9', 'team:q3', "o'brien", 'a&b', 'x'.repeat(65)]) {
    let serverRefused = false;
    try { checkListId(id); } catch { serverRefused = true; }
    assert.equal(!page.isListId(id), serverRefused, id);
  }
});

test('a typed link id the server would refuse starts a draft it will accept', async () => {
  // A browser leaves ":" "!" "(" and an apostrophe unencoded in a fragment, and
  // app.js takes the first path segment verbatim.
  for (const typed of ['team:q3', 'plan!', 'a+b', 'list(1)', "o'brien", 'a&b', 'x'.repeat(65)]) {
    const s = freshState();
    createNewList(typed, s);
    assert.notEqual(s.currentListId, typed);
    assert.equal(s.isDraft, true);
    addItem({ text: 'first edit', color: '#3574db', priority: 'P3', tags: '' }, s);
    await persistList(strictServer, s);
  }
  // An id the server accepts is kept, so a typed name still names the list.
  for (const typed of ['team-q3', 'caf%C3%A9', 'team.q3~planning']) {
    const s = freshState();
    createNewList(typed, s);
    assert.equal(s.currentListId, typed);
    updateTitle('Named by hand', s);
    await persistList(strictServer, s);
  }
});

test('numbers must be real positions and timestamps', () => {
  refuses(() => checkItems([item({ completedAt: Number.NaN })]));
  refuses(() => checkItems([item({ completedAt: -1 })]));
  refuses(() => checkItems([item({ prevIndex: 1.5 })]));
  refuses(() => checkItems([item({ prevIndex: Number.POSITIVE_INFINITY })]));
  checkItems([item({ completedAt: Date.now(), prevIndex: 3 })]);
});
