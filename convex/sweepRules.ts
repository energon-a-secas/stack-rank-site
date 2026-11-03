// Which `lists` rows the queue #86 sweep may delete, and how it walks the table.
//
// Until the draft fix (commit 642c3ff) went live, a bare visit inserted a row
// before the visitor had typed anything: js/state.js called lists:createList
// with the default title and no items, and lists:createList stamps createdAt and
// updatedAt with the same Date.now(). Every row nobody touched afterwards still
// has exactly that shape. Since the fix, the one thing that writes such a row is
// pressing Share on an untouched draft, which is deliberate, so the shape alone
// is not enough: the row must also predate the fix.
//
// DRAFT_FIX_LIVE_AT is when GitHub Pages started building bdd71d8, the first
// build that served 642c3ff (2026-10-01T11:09:58Z). No visitor could run the
// fixed page before it, so nothing older is a deliberate Share. Pages caches
// for 600 s, so a stale tab may have inserted an orphan in the minutes after
// it; those few are left, rather than risk deleting a list someone shared.
//
// A row is spared when any one thing about it shows a person: a title other
// than the default, a single item, or any update at all (a list filled and then
// emptied by hand has updatedAt > createdAt). convex/sweep.ts registers the
// Convex functions; this file imports nothing generated, so
// tests/sweep.test.mjs runs it under node as it ships.

import { ConvexError } from "convex/values";

/** The title js/state.js gives a new list, unchanged since the first commit. */
export const DEFAULT_TITLE = "New Priority List";

/** 2026-10-01T11:09:58Z: the first Pages build to serve the draft fix. */
export const DRAFT_FIX_LIVE_AT = 1790852998000;

export const PAGE_SIZE = { default: 100, max: 500 } as const;

/** How many matching rows a result names, for a spot check in the dashboard. */
export const SAMPLE_SIZE = 5;

export type SweepRow<Id extends string = string> = {
  _id: Id;
  title: string;
  items: readonly unknown[];
  createdAt: number;
  updatedAt: number;
};

export type Sample = { _id: string; createdAt: string };

export type PageResult = {
  scanned: number;
  orphans: number;
  keptEmpty: number;
  deleted: number;
  sample: Sample[];
  oldest: number | null;
  newest: number | null;
  cursor: string;
  isDone: boolean;
};

export type SweepTotals = {
  dryRun: boolean;
  before: string;
  pages: number;
  scanned: number;
  orphans: number;
  keptEmpty: number;
  deleted: number;
  sample: Sample[];
  oldest: string | null;
  newest: string | null;
};

/** One page of the table, oldest first, and a way to delete a row. */
export type SweepDb<Id extends string> = {
  page(before: number, cursor: string | null): Promise<{
    page: SweepRow<Id>[];
    continueCursor: string;
    isDone: boolean;
  }>;
  remove(id: Id): Promise<void>;
};

function reject(message: string): never {
  throw new ConvexError(message);
}

/** True for a row a bare visit inserted and nobody touched again. */
export function isUntouchedOrphan(row: SweepRow, cutoff: number = DRAFT_FIX_LIVE_AT): boolean {
  return (
    row.title === DEFAULT_TITLE &&
    row.items.length === 0 &&
    row.updatedAt === row.createdAt &&
    row.createdAt < cutoff
  );
}

/**
 * The cutoff a sweep uses. An earlier one narrows the sweep; a later one is
 * refused, because every untouched row written after the fix went live is a
 * list somebody chose to share.
 */
export function checkCutoff(before: number = DRAFT_FIX_LIVE_AT): number {
  if (!Number.isFinite(before)) reject("before must be a timestamp in milliseconds.");
  if (before > DRAFT_FIX_LIVE_AT) {
    reject(
      `before may not be later than ${DRAFT_FIX_LIVE_AT} (${new Date(DRAFT_FIX_LIVE_AT).toISOString()}): ` +
        "an untouched list written after the draft fix went live was shared on purpose.",
    );
  }
  return before;
}

export function checkPageSize(pageSize: number = PAGE_SIZE.default): number {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > PAGE_SIZE.max) {
    reject(`pageSize must be a whole number from 1 to ${PAGE_SIZE.max}.`);
  }
  return pageSize;
}

/**
 * Read one page of rows created before the cutoff and count the orphans in it.
 * With dryRun false it deletes them too; with dryRun true it never calls
 * db.remove, which is what lets the dry run be a query.
 */
export async function sweepPage<Id extends string>(
  db: SweepDb<Id>,
  args: { before: number; cursor: string | null; dryRun: boolean },
): Promise<PageResult> {
  const cutoff = checkCutoff(args.before);
  const { page, continueCursor, isDone } = await db.page(cutoff, args.cursor);

  const result: PageResult = {
    scanned: page.length,
    orphans: 0,
    keptEmpty: 0,
    deleted: 0,
    sample: [],
    oldest: null,
    newest: null,
    cursor: continueCursor,
    isDone,
  };

  for (const row of page) {
    if (!isUntouchedOrphan(row, cutoff)) {
      if (row.items.length === 0) result.keptEmpty++;
      continue;
    }
    result.orphans++;
    if (result.oldest === null || row.createdAt < result.oldest) result.oldest = row.createdAt;
    if (result.newest === null || row.createdAt > result.newest) result.newest = row.createdAt;
    if (result.sample.length < SAMPLE_SIZE) {
      result.sample.push({ _id: row._id, createdAt: new Date(row.createdAt).toISOString() });
    }
    if (!args.dryRun) {
      await db.remove(row._id);
      result.deleted++;
    }
  }

  return result;
}

/**
 * Run pages until the table is done and add them up. Each page is its own
 * transaction (a query for a dry run, a mutation otherwise), so a table of any
 * size stays inside Convex's per-transaction read limits.
 */
export async function sweepAll(
  runPage: (cursor: string | null) => Promise<PageResult>,
  args: { before: number; dryRun: boolean },
): Promise<SweepTotals> {
  const before = checkCutoff(args.before);
  let oldest: number | null = null;
  let newest: number | null = null;
  const totals: SweepTotals = {
    dryRun: args.dryRun,
    before: new Date(before).toISOString(),
    pages: 0,
    scanned: 0,
    orphans: 0,
    keptEmpty: 0,
    deleted: 0,
    sample: [],
    oldest: null,
    newest: null,
  };

  let cursor: string | null = null;
  for (;;) {
    const page: PageResult = await runPage(cursor);
    totals.pages++;
    totals.scanned += page.scanned;
    totals.orphans += page.orphans;
    totals.keptEmpty += page.keptEmpty;
    totals.deleted += page.deleted;
    for (const s of page.sample) {
      if (totals.sample.length < SAMPLE_SIZE) totals.sample.push(s);
    }
    if (page.oldest !== null && (oldest === null || page.oldest < oldest)) oldest = page.oldest;
    if (page.newest !== null && (newest === null || page.newest > newest)) newest = page.newest;

    if (page.isDone) break;
    if (page.cursor === cursor) reject("The sweep stopped: a page returned the cursor it was given.");
    cursor = page.cursor;
  }

  totals.oldest = oldest === null ? null : new Date(oldest).toISOString();
  totals.newest = newest === null ? null : new Date(newest).toISOString();
  return totals;
}
