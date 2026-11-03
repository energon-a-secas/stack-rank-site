// ── Orphan sweep ─────────────────────────────────────────────
// Before the draft fix went live, a bare visit inserted an empty `lists` row.
// convex/sweep.ts deletes those rows; convex/sweepRules.ts decides which ones
// they are. These tests pin that decision from both sides: the shape a bare
// visit wrote is matched, and each thing that shows a person touched a row
// (a title, an item, an update, a Share after the fix) spares it.
//
// sweepRules.ts imports only convex/values, so node runs it as it ships. The
// Convex functions around it were run end to end on a local backend with fake
// rows; see "Still open" in CLAUDE.md.
//
//   make test          (or: node --test 'tests/*.test.mjs')

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ConvexError } from 'convex/values';
import {
  DEFAULT_TITLE,
  DRAFT_FIX_LIVE_AT,
  PAGE_SIZE,
  SAMPLE_SIZE,
  checkCutoff,
  checkPageSize,
  isUntouchedOrphan,
  sweepAll,
  sweepPage,
} from '../convex/sweepRules.ts';
import { createNewList, persistList, addItem } from '../js/state.js';

const refuses = (fn) => assert.throws(fn, (err) => err instanceof ConvexError);
const refusesAsync = (fn) => assert.rejects(fn, (err) => err instanceof ConvexError);

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** A row as lists:createList stores it: createdAt and updatedAt are one Date.now(). */
function row(over = {}) {
  const createdAt = over.createdAt ?? DRAFT_FIX_LIVE_AT - 30 * DAY;
  return {
    _id: over._id ?? `doc-${createdAt}`,
    title: DEFAULT_TITLE,
    items: [],
    createdAt,
    updatedAt: createdAt,
    ...over,
  };
}

const item = { id: 'k3j9x0aa', text: 'Ship it', color: '#3574db', priority: 'P3', tags: [] };

function freshState() {
  return {
    currentListId: null, list: { title: 'New Priority List', items: [] },
    editingItem: null, convex: null, isModified: false, isDraft: false,
  };
}

/** What the page sends, stamped the way lists:createList stamps it. */
async function rowThePageWrites(now, edit = () => {}) {
  const s = freshState();
  createNewList(null, s);
  edit(s);
  let stored = null;
  await persistList({
    async createList(listId, payload) { stored = { _id: listId, ...payload, createdAt: now, updatedAt: now }; },
    async updateList() { throw new Error('a draft is inserted, not updated'); },
  }, s);
  return stored;
}

/**
 * An in-memory table read the way convex/sweep.ts reads it: oldest first,
 * bounded by the cutoff, a page at a time, with an opaque cursor.
 */
function fakeDb(rows, pageSize = 2) {
  const table = [...rows].sort((a, b) => a.createdAt - b.createdAt);
  const calls = { pages: 0, removed: [] };
  return {
    calls,
    table,
    async page(before, cursor) {
      calls.pages++;
      const visible = table.filter((r) => r.createdAt < before && !calls.removed.includes(r._id));
      const start = cursor === null ? 0 : visible.findIndex((r) => r.createdAt > Number(cursor));
      const from = start === -1 ? visible.length : start;
      const page = visible.slice(from, from + pageSize);
      const last = page.at(-1);
      return {
        page,
        continueCursor: last ? String(last.createdAt) : String(cursor ?? ''),
        isDone: from + pageSize >= visible.length,
      };
    },
    async remove(id) { calls.removed.push(id); },
  };
}

// ── The cutoff and the title ─────────────────────────────────

test('the cutoff is the first Pages build that served the draft fix', () => {
  assert.equal(DRAFT_FIX_LIVE_AT, Date.UTC(2026, 9, 1, 11, 9, 58));
  assert.equal(new Date(DRAFT_FIX_LIVE_AT).toISOString(), '2026-10-01T11:09:58.000Z');
});

test('the default title is the one the page gives a new list', () => {
  // If the page's default ever changes, rows written under the new title would
  // not match, and rows a person titled with the old default would.
  const s = freshState();
  createNewList(null, s);
  assert.equal(s.list.title, DEFAULT_TITLE);
});

// ── The predicate ────────────────────────────────────────────

test('an untouched row from before the fix is an orphan', async () => {
  assert.equal(isUntouchedOrphan(row()), true);
  assert.equal(isUntouchedOrphan(row({ createdAt: DRAFT_FIX_LIVE_AT - 1 })), true);
  // The shape the pre-fix page wrote on a bare visit, end to end.
  assert.equal(isUntouchedOrphan(await rowThePageWrites(DRAFT_FIX_LIVE_AT - DAY)), true);
});

test('a Share on an untouched draft after the fix is spared', async () => {
  // Since the fix, pressing Share is the one thing that writes an empty,
  // never-updated row with the default title. That list was shared on purpose.
  const shared = await rowThePageWrites(DRAFT_FIX_LIVE_AT + HOUR);
  assert.equal(shared.title, DEFAULT_TITLE);
  assert.deepEqual(shared.items, []);
  assert.equal(isUntouchedOrphan(shared), false);
  assert.equal(isUntouchedOrphan(row({ createdAt: DRAFT_FIX_LIVE_AT })), false);
});

test('a row with one item is spared', async () => {
  assert.equal(isUntouchedOrphan(row({ items: [item] })), false);
  const withItem = await rowThePageWrites(DRAFT_FIX_LIVE_AT - DAY, (s) =>
    addItem({ text: 'Ship it', priority: 'P3', tags: '' }, s));
  assert.equal(isUntouchedOrphan(withItem), false);
});

test('a renamed row is spared', () => {
  assert.equal(isUntouchedOrphan(row({ title: 'Groceries' })), false);
  assert.equal(isUntouchedOrphan(row({ title: `${DEFAULT_TITLE} ` })), false);
  assert.equal(isUntouchedOrphan(row({ title: '' })), false);
});

test('a row emptied after an edit is spared', () => {
  const createdAt = DRAFT_FIX_LIVE_AT - 10 * DAY;
  assert.equal(isUntouchedOrphan(row({ createdAt, updatedAt: createdAt + 1 })), false);
  assert.equal(isUntouchedOrphan(row({ createdAt, updatedAt: createdAt + DAY })), false);
});

test('an earlier cutoff narrows the predicate', () => {
  const r = row({ createdAt: DRAFT_FIX_LIVE_AT - DAY });
  assert.equal(isUntouchedOrphan(r, DRAFT_FIX_LIVE_AT - 2 * DAY), false);
  assert.equal(isUntouchedOrphan(r, DRAFT_FIX_LIVE_AT - DAY + 1), true);
});

// ── Arguments ────────────────────────────────────────────────

test('the cutoff can move earlier and never later', () => {
  assert.equal(checkCutoff(), DRAFT_FIX_LIVE_AT);
  assert.equal(checkCutoff(DRAFT_FIX_LIVE_AT), DRAFT_FIX_LIVE_AT);
  assert.equal(checkCutoff(DRAFT_FIX_LIVE_AT - DAY), DRAFT_FIX_LIVE_AT - DAY);
  refuses(() => checkCutoff(DRAFT_FIX_LIVE_AT + 1));
  refuses(() => checkCutoff(Date.UTC(2026, 10, 3)));
  refuses(() => checkCutoff(Number.NaN));
  refuses(() => checkCutoff(Number.POSITIVE_INFINITY));
});

test('the page size is a whole number within the bounds', () => {
  assert.equal(checkPageSize(), PAGE_SIZE.default);
  assert.equal(checkPageSize(1), 1);
  assert.equal(checkPageSize(PAGE_SIZE.max), PAGE_SIZE.max);
  for (const bad of [0, -1, 1.5, PAGE_SIZE.max + 1, Number.NaN]) refuses(() => checkPageSize(bad));
});

// ── One page ─────────────────────────────────────────────────

const mixed = () => [
  row({ _id: 'orphan-a', createdAt: DRAFT_FIX_LIVE_AT - 200 * DAY }),
  row({ _id: 'item', createdAt: DRAFT_FIX_LIVE_AT - 20 * DAY, items: [item] }),
  row({ _id: 'orphan-b', createdAt: DRAFT_FIX_LIVE_AT - 10 * DAY }),
  row({ _id: 'renamed', createdAt: DRAFT_FIX_LIVE_AT - 9 * DAY, title: 'Groceries' }),
  row({ _id: 'emptied', createdAt: DRAFT_FIX_LIVE_AT - 12 * HOUR, updatedAt: DRAFT_FIX_LIVE_AT - 11 * HOUR }),
  row({ _id: 'orphan-c', createdAt: DRAFT_FIX_LIVE_AT - 1000 }),
  row({ _id: 'shared', createdAt: DRAFT_FIX_LIVE_AT + 5000 }),
];

test('a dry-run page counts and deletes nothing', async () => {
  const db = fakeDb(mixed(), 100);
  const page = await sweepPage(db, { before: DRAFT_FIX_LIVE_AT, cursor: null, dryRun: true });

  assert.deepEqual(db.calls.removed, []);
  assert.equal(page.scanned, 6, 'the row after the cutoff is outside the scan');
  assert.equal(page.orphans, 3);
  assert.equal(page.keptEmpty, 2, 'the renamed and the emptied row');
  assert.equal(page.deleted, 0);
  assert.deepEqual(page.sample.map((s) => s._id), ['orphan-a', 'orphan-b', 'orphan-c']);
  assert.equal(page.oldest, DRAFT_FIX_LIVE_AT - 200 * DAY);
  assert.equal(page.newest, DRAFT_FIX_LIVE_AT - 1000);
  assert.equal(page.isDone, true);
});

test('a deleting page removes the orphans and nothing else', async () => {
  const db = fakeDb(mixed(), 100);
  const page = await sweepPage(db, { before: DRAFT_FIX_LIVE_AT, cursor: null, dryRun: false });

  assert.deepEqual(db.calls.removed, ['orphan-a', 'orphan-b', 'orphan-c']);
  assert.equal(page.deleted, 3);
  assert.equal(page.orphans, 3);
});

test('a page refuses a late cutoff before it reads anything', async () => {
  const db = fakeDb(mixed(), 100);
  await refusesAsync(() => sweepPage(db, { before: DRAFT_FIX_LIVE_AT + 1, cursor: null, dryRun: false }));
  assert.equal(db.calls.pages, 0);
  assert.deepEqual(db.calls.removed, []);
});

// ── The whole table ──────────────────────────────────────────

test('the sweep pages to the end and adds the pages up', async () => {
  const db = fakeDb(mixed(), 2);
  const totals = await sweepAll(
    (cursor) => sweepPage(db, { before: DRAFT_FIX_LIVE_AT, cursor, dryRun: false }),
    { before: DRAFT_FIX_LIVE_AT, dryRun: false },
  );

  assert.equal(totals.pages, 3);
  assert.equal(totals.scanned, 6);
  assert.equal(totals.orphans, 3);
  assert.equal(totals.deleted, 3);
  assert.equal(totals.keptEmpty, 2);
  assert.equal(totals.before, '2026-10-01T11:09:58.000Z');
  assert.equal(totals.oldest, new Date(DRAFT_FIX_LIVE_AT - 200 * DAY).toISOString());
  assert.equal(totals.newest, new Date(DRAFT_FIX_LIVE_AT - 1000).toISOString());
  assert.deepEqual(db.calls.removed.sort(), ['orphan-a', 'orphan-b', 'orphan-c']);
});

test('a dry run over the whole table writes nothing', async () => {
  const db = fakeDb(mixed(), 2);
  const totals = await sweepAll(
    (cursor) => sweepPage(db, { before: DRAFT_FIX_LIVE_AT, cursor, dryRun: true }),
    { before: DRAFT_FIX_LIVE_AT, dryRun: true },
  );
  assert.equal(totals.dryRun, true);
  assert.equal(totals.orphans, 3);
  assert.equal(totals.deleted, 0);
  assert.deepEqual(db.calls.removed, []);
});

test('the sample names at most a handful of rows', async () => {
  const rows = Array.from({ length: 12 }, (_, i) => row({ _id: `o${i}`, createdAt: DRAFT_FIX_LIVE_AT - (i + 1) * DAY }));

  const onePage = await sweepPage(fakeDb(rows, 100), { before: DRAFT_FIX_LIVE_AT, cursor: null, dryRun: true });
  assert.equal(onePage.orphans, 12);
  assert.equal(onePage.sample.length, SAMPLE_SIZE);

  const db = fakeDb(rows, 5);
  const totals = await sweepAll(
    (cursor) => sweepPage(db, { before: DRAFT_FIX_LIVE_AT, cursor, dryRun: true }),
    { before: DRAFT_FIX_LIVE_AT, dryRun: true },
  );
  assert.equal(totals.orphans, 12);
  assert.equal(totals.sample.length, SAMPLE_SIZE);
});

test('a page that does not move the cursor stops the sweep', async () => {
  let calls = 0;
  const stuck = async (cursor) => {
    // Without the check the sweep would loop forever; fail instead of hanging.
    if (++calls > 5) throw new Error('the sweep kept asking for the same page');
    return {
      scanned: 0, orphans: 0, keptEmpty: 0, deleted: 0, sample: [],
      oldest: null, newest: null, cursor: cursor ?? 'c0', isDone: false,
    };
  };
  await refusesAsync(() => sweepAll(stuck, { before: DRAFT_FIX_LIVE_AT, dryRun: true }));
  assert.equal(calls, 2);
});

test('the whole sweep refuses a late cutoff', async () => {
  let called = false;
  await refusesAsync(() => sweepAll(async () => { called = true; }, { before: DRAFT_FIX_LIVE_AT + 1, dryRun: false }));
  assert.equal(called, false);
});
