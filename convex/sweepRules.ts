// Which `lists` rows the queue #86 sweep may delete, and how it walks the table.
//
// Until the draft fix (commit 642c3ff) went live, a bare visit inserted a row
// before the visitor had typed anything: js/state.js called lists:createList
// with the default title and no items, and lists:createList stamps createdAt and
// updatedAt with the same Date.now(). Every row nobody touched afterwards still
// has exactly that shape.
//
// The shape alone is not enough, because two things still write it after the
// fix went live, and the row cannot tell them apart (same payload, same id
// generator, same mutation):
//   - the live page, when someone presses Share on an untouched draft. That
//     list was shared on purpose.
//   - the pre-fix page, wherever a copy still runs: a tab reloaded from cache in
//     the minutes after the cutoff (Pages caches for 600 s), or a copy served
//     from its own root. The five git snapshots of this site on
//     rewind.neorgon.com hold that code; on 2026-11-03 they wrote nothing,
//     because their root-absolute /js/app.js loads rewind's own app.js (and the
//     live snapshot lacks five of its modules), shown in a browser with every
//     Convex request intercepted.
// So the sweep deletes only rows created before the cutoff. Rows with the shape
// from after it are counted as afterCutoff and left: a count that keeps rising
// between two dry runs means old code is writing somewhere, and the fix for
// that is finding the copy, not widening the sweep.
//
// DRAFT_FIX_LIVE_AT is when GitHub Pages started building bdd71d8, the first
// build that served 642c3ff (2026-10-01T11:09:58Z). No visitor of
// stackrank.neorgon.com ran the fixed page before it. The fixed code did run
// locally from 2026-09-18 against this same deployment (js/utils.js names it),
// so a Share made from `make serve` before the cutoff is swept; its link still
// opens the same empty draft under its id, so nothing a person sees is lost.
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

/**
 * What one page found. `orphans` are deleted (unless a dry run); `oldest` and
 * `newest` are their date range. `afterCutoff` counts rows with the untouched
 * shape created at or after the cutoff, which are never deleted, and
 * `afterCutoffNewest` is the latest of them. `keptEmpty` counts the other empty
 * rows, the ones a person renamed or edited.
 */
export type PageResult = {
  scanned: number;
  orphans: number;
  keptEmpty: number;
  afterCutoff: number;
  afterCutoffNewest: number | null;
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
  afterCutoff: number;
  afterCutoffNewest: string | null;
  deleted: number;
  sample: Sample[];
  oldest: string | null;
  newest: string | null;
};

/**
 * One page of the whole table, oldest first, and a way to delete a row. The
 * page is not bounded by the cutoff: rows after it are read so that
 * `afterCutoff` can be counted, and the predicate keeps them from deletion.
 */
export type SweepDb<Id extends string> = {
  page(cursor: string | null): Promise<{
    page: SweepRow<Id>[];
    continueCursor: string;
    isDone: boolean;
  }>;
  remove(id: Id): Promise<void>;
};

function reject(message: string): never {
  throw new ConvexError(message);
}

/**
 * True for the shape lists:createList stores when nobody has touched a list:
 * the default title, no items, never updated. Old and new code both write it.
 */
export function hasUntouchedShape(row: SweepRow): boolean {
  return row.title === DEFAULT_TITLE && row.items.length === 0 && row.updatedAt === row.createdAt;
}

/** True for a row a bare visit inserted before the fix and nobody touched again. */
export function isUntouchedOrphan(row: SweepRow, cutoff: number = DRAFT_FIX_LIVE_AT): boolean {
  return hasUntouchedShape(row) && row.createdAt < cutoff;
}

/**
 * The cutoff a sweep uses. An earlier one narrows the sweep; a later one is
 * refused, because after the fix went live an untouched row may be a list
 * somebody shared on purpose, and nothing in the row says which.
 */
export function checkCutoff(before: number = DRAFT_FIX_LIVE_AT): number {
  if (!Number.isFinite(before)) reject("before must be a timestamp in milliseconds.");
  if (before > DRAFT_FIX_LIVE_AT) {
    reject(
      `before may not be later than ${DRAFT_FIX_LIVE_AT} (${new Date(DRAFT_FIX_LIVE_AT).toISOString()}): ` +
        "after the draft fix went live, an untouched list may have been shared on purpose, and the row " +
        "cannot show whether old code wrote it instead. The dry run counts those rows as afterCutoff.",
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
 * Read one page of the table and count the orphans in it, and the rows with the
 * same shape from after the cutoff. With dryRun false it deletes the orphans
 * (never the afterCutoff rows); with dryRun true it never calls db.remove,
 * which is what lets the dry run be a query.
 */
export async function sweepPage<Id extends string>(
  db: SweepDb<Id>,
  args: { before: number; cursor: string | null; dryRun: boolean },
): Promise<PageResult> {
  const cutoff = checkCutoff(args.before);
  const { page, continueCursor, isDone } = await db.page(args.cursor);

  const result: PageResult = {
    scanned: page.length,
    orphans: 0,
    keptEmpty: 0,
    afterCutoff: 0,
    afterCutoffNewest: null,
    deleted: 0,
    sample: [],
    oldest: null,
    newest: null,
    cursor: continueCursor,
    isDone,
  };

  for (const row of page) {
    if (!isUntouchedOrphan(row, cutoff)) {
      if (hasUntouchedShape(row)) {
        result.afterCutoff++;
        if (result.afterCutoffNewest === null || row.createdAt > result.afterCutoffNewest) {
          result.afterCutoffNewest = row.createdAt;
        }
      } else if (row.items.length === 0) {
        result.keptEmpty++;
      }
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
  let afterCutoffNewest: number | null = null;
  const totals: SweepTotals = {
    dryRun: args.dryRun,
    before: new Date(before).toISOString(),
    pages: 0,
    scanned: 0,
    orphans: 0,
    keptEmpty: 0,
    afterCutoff: 0,
    afterCutoffNewest: null,
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
    totals.afterCutoff += page.afterCutoff;
    totals.deleted += page.deleted;
    for (const s of page.sample) {
      if (totals.sample.length < SAMPLE_SIZE) totals.sample.push(s);
    }
    if (page.oldest !== null && (oldest === null || page.oldest < oldest)) oldest = page.oldest;
    if (page.newest !== null && (newest === null || page.newest > newest)) newest = page.newest;
    if (
      page.afterCutoffNewest !== null &&
      (afterCutoffNewest === null || page.afterCutoffNewest > afterCutoffNewest)
    ) {
      afterCutoffNewest = page.afterCutoffNewest;
    }

    if (page.isDone) break;
    if (page.cursor === cursor) reject("The sweep stopped: a page returned the cursor it was given.");
    cursor = page.cursor;
  }

  totals.oldest = oldest === null ? null : new Date(oldest).toISOString();
  totals.newest = newest === null ? null : new Date(newest).toISOString();
  totals.afterCutoffNewest =
    afterCutoffNewest === null ? null : new Date(afterCutoffNewest).toISOString();
  return totals;
}
