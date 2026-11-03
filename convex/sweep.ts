// The queue #86 sweep: delete the empty lists bare visits inserted before the
// draft fix went live. Which rows match, and why, is in ./sweepRules, which
// tests/sweep.test.mjs pins.
//
// Every function here is internal, so no page can call one; they run from the
// CLI against the deployment in .env.local:
//
//   npx convex run sweep:sweepOrphans '{"dryRun":true}'    counts, writes nothing
//   npx convex run sweep:sweepOrphans '{"dryRun":false}'   deletes what it counted
//
// dryRun has no default, so a delete is never the implicit choice. A result
// names a few matching rows by document _id (not by listId, which is the edit
// link) for a spot check in the dashboard, and counts the rows with the same
// shape from after the cutoff (afterCutoff), which it never deletes.

import { paginationOptsValidator, type PaginationOptions } from "convex/server";
import { v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type DatabaseReader,
} from "./_generated/server";
import {
  checkCutoff,
  checkPageSize,
  sweepAll,
  sweepPage,
  type PageResult,
  type SweepTotals,
} from "./sweepRules";

const sampleValidator = v.object({ _id: v.string(), createdAt: v.string() });

const pageResultValidator = v.object({
  scanned: v.number(),
  orphans: v.number(),
  keptEmpty: v.number(),
  afterCutoff: v.number(),
  afterCutoffNewest: v.union(v.number(), v.null()),
  deleted: v.number(),
  sample: v.array(sampleValidator),
  oldest: v.union(v.number(), v.null()),
  newest: v.union(v.number(), v.null()),
  cursor: v.string(),
  isDone: v.boolean(),
});

const totalsValidator = v.object({
  dryRun: v.boolean(),
  before: v.string(),
  pages: v.number(),
  scanned: v.number(),
  orphans: v.number(),
  keptEmpty: v.number(),
  afterCutoff: v.number(),
  afterCutoffNewest: v.union(v.string(), v.null()),
  deleted: v.number(),
  sample: v.array(sampleValidator),
  oldest: v.union(v.string(), v.null()),
  newest: v.union(v.string(), v.null()),
});

// A field the result types carry and a validator lacks is not a type error (a
// wider object is assignable to a narrower one), but Convex refuses it at run
// time as an extra field. These make the typecheck fail on drift either way.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const pageResultMatches: Same<Infer<typeof pageResultValidator>, PageResult> = true;
const totalsMatch: Same<Infer<typeof totalsValidator>, SweepTotals> = true;
void pageResultMatches;
void totalsMatch;

const pageArgs = { before: v.number(), paginationOpts: paginationOptsValidator };

/**
 * One page of the whole table in creation order. Not bounded by the cutoff, so
 * the rows after it are read and counted as afterCutoff; isUntouchedOrphan in
 * ./sweepRules is what keeps them from deletion.
 */
function rowsInOrder(db: DatabaseReader, paginationOpts: PaginationOptions) {
  return db.query("lists").withIndex("by_creation_time").order("asc").paginate(paginationOpts);
}

/** Counts one page. A query, so the dry run cannot write. */
export const countOrphanPage = internalQuery({
  args: pageArgs,
  returns: pageResultValidator,
  handler: async (ctx, args): Promise<PageResult> => {
    return await sweepPage<Id<"lists">>(
      {
        page: () => rowsInOrder(ctx.db, args.paginationOpts),
        remove: async () => {
          throw new Error("countOrphanPage is a dry run and deletes nothing.");
        },
      },
      { before: args.before, cursor: args.paginationOpts.cursor, dryRun: true },
    );
  },
});

/** Counts and deletes one page, in one transaction. */
export const deleteOrphanPage = internalMutation({
  args: pageArgs,
  returns: pageResultValidator,
  handler: async (ctx, args): Promise<PageResult> => {
    return await sweepPage<Id<"lists">>(
      {
        page: () => rowsInOrder(ctx.db, args.paginationOpts),
        remove: (id) => ctx.db.delete(id),
      },
      { before: args.before, cursor: args.paginationOpts.cursor, dryRun: false },
    );
  },
});

/**
 * Walk the whole table a page at a time and report the totals. `before` may
 * narrow the sweep to an earlier cutoff, never a later one; `pageSize` can be
 * lowered if a page of very long lists hits the per-transaction read limit.
 */
export const sweepOrphans = internalAction({
  args: {
    dryRun: v.boolean(),
    before: v.optional(v.number()),
    pageSize: v.optional(v.number()),
  },
  returns: totalsValidator,
  handler: async (ctx, args): Promise<SweepTotals> => {
    const before = checkCutoff(args.before);
    const numItems = checkPageSize(args.pageSize);
    return await sweepAll(
      async (cursor): Promise<PageResult> => {
        const page = { before, paginationOpts: { numItems, cursor } };
        return args.dryRun
          ? await ctx.runQuery(internal.sweep.countOrphanPage, page)
          : await ctx.runMutation(internal.sweep.deleteOrphanPage, page);
      },
      { before, dryRun: args.dryRun },
    );
  },
});
