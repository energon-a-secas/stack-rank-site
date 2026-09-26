// ── Draft lists ──────────────────────────────────────────────
// A bare visit to the site used to insert a `lists` row before the visitor had
// typed anything, so every click through from the hub left an empty document in
// the deployment. These tests pin the rule that replaced it: nothing is written
// until the first edit, and then exactly one row is written.
//
// `state.js` imports only `rules.js` and neither touches the DOM, so it runs
// here as it ships.
// `persistList` takes the data layer as an argument for the same reason, which is
// what lets a fake stand in for Convex.
//
//   make test          (or: node --test 'tests/*.test.mjs'; a bare directory
//                       argument is read as one test file and fails)

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  state,
  createNewList,
  loadFromBackend,
  persistList,
  addItem,
  loadTemplate,
} from '../js/state.js';

/** A stand-in for js/data.js that records what it was asked to do. */
function fakeData() {
  const calls = { created: [], updated: [] };
  return {
    calls,
    async createList(listId, payload) {
      calls.created.push({ listId, payload });
    },
    async updateList(listId, payload) {
      calls.updated.push({ listId, payload });
    },
  };
}

/** A fresh state object, so no test can see another one's list. */
function freshState() {
  return {
    currentListId: null,
    list: { title: 'New Priority List', items: [] },
    editingItem: null,
    convex: null,
    isModified: false,
    isDraft: false,
  };
}

test('the shipped state object starts as no draft at all', () => {
  // Guards the shape rather than the flow: a state object with no isDraft key
  // would make every draft branch below read as false and the tests would pass
  // while the site wrote a row on load.
  assert.equal('isDraft' in state, true);
});

test('a bare visit writes nothing', async () => {
  const s = freshState();
  const data = fakeData();

  const id = createNewList(null, s);

  assert.equal(typeof id, 'string');
  assert.equal(s.currentListId, id);
  assert.equal(s.isDraft, true);
  assert.deepEqual(data.calls.created, []);
  assert.deepEqual(data.calls.updated, []);
});

test('the first edit inserts exactly one row and never updates', async () => {
  const s = freshState();
  const data = fakeData();
  createNewList(null, s);

  addItem({ text: 'Write the test first', priority: 'P1', tags: 'meta' }, s);
  const result = await persistList(data, s);

  assert.equal(result.created, true);
  assert.equal(result.listId, s.currentListId);
  assert.equal(data.calls.created.length, 1);
  assert.equal(data.calls.updated.length, 0);
  assert.equal(data.calls.created[0].listId, s.currentListId);
  assert.equal(data.calls.created[0].payload.items[0].text, 'Write the test first');
  assert.equal(s.isDraft, false);
});

test('the second edit updates and does not insert a second row', async () => {
  const s = freshState();
  const data = fakeData();
  createNewList(null, s);

  addItem({ text: 'one', priority: 'P1', tags: '' }, s);
  await persistList(data, s);
  addItem({ text: 'two', priority: 'P2', tags: '' }, s);
  const result = await persistList(data, s);

  assert.equal(result.created, false);
  assert.equal(data.calls.created.length, 1);
  assert.equal(data.calls.updated.length, 1);
  assert.equal(data.calls.updated[0].payload.items.length, 2);
});

test('a list that came from the backend is never inserted again', async () => {
  const s = freshState();
  const data = fakeData();
  s.currentListId = 'existing123';
  s.isDraft = true; // as if a draft had been open in this tab first
  loadFromBackend({ title: 'Real list', items: [] }, s);

  assert.equal(s.isDraft, false);

  await persistList(data, s);

  assert.equal(data.calls.created.length, 0);
  assert.equal(data.calls.updated.length, 1);
  assert.equal(data.calls.updated[0].listId, 'existing123');
});

test('an id from the URL that has no row is a saveable draft', async () => {
  // The old code called createList only when no id was passed, so a link to a
  // deleted list, or a mistyped hash, held local state with no row and the first
  // edit failed inside lists:updateList, which throws "List not found".
  const s = freshState();
  const data = fakeData();

  createNewList('typo-in-the-link', s);
  assert.equal(s.isDraft, true);
  assert.deepEqual(data.calls.created, []);

  addItem({ text: 'still saves', priority: 'P3', tags: '' }, s);
  const result = await persistList(data, s);

  assert.equal(result.created, true);
  assert.equal(data.calls.created[0].listId, 'typo-in-the-link');
});

test('persistList strips what the Convex validators reject', async () => {
  const s = freshState();
  const data = fakeData();
  createNewList(null, s);
  loadTemplate('shifting', s);

  await persistList(data, s);

  const sent = data.calls.created[0].payload.items;
  // prevIndex is display-only: the up/down deltas fade on the next reload.
  assert.equal(sent.some(i => 'prevIndex' in i), false);
  // An absent completedAt or blockedMessage is dropped, not sent as null.
  assert.equal(sent.some(i => 'completedAt' in i && !i.completedAt), false);
  assert.equal(sent.some(i => 'blockedMessage' in i && !i.blockedMessage), false);
  // The one genuinely completed and the one genuinely blocked item keep theirs.
  assert.equal(sent.filter(i => i.completedAt).length, 1);
  assert.equal(sent.filter(i => i.blockedMessage).length, 1);
});
