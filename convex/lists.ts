import { internalMutation, mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { checkItems, checkListId, checkTitle } from "./listRules";

// The shape of one item. The validator only checks types; lengths, the color
// pattern, ids and the item count are checked by ./listRules before any write.
const itemValidator = v.object({
  id: v.string(),
  text: v.string(),
  color: v.string(),
  priority: v.union(v.literal("P1"), v.literal("P2"), v.literal("P3"), v.literal("P4"), v.literal("P5"), v.literal("P6")),
  tags: v.array(v.string()),
  notes: v.optional(v.string()),
  prevIndex: v.optional(v.number()),
  completedAt: v.optional(v.number()),
  blockedMessage: v.optional(v.string()),
});

export const getList = query({
  args: { listId: v.string() },
  handler: async (ctx, args) => {
    const list = await ctx.db
      .query("lists")
      .withIndex("by_listId", (q) => q.eq("listId", args.listId))
      .first();

    return list;
  },
});

export const createList = mutation({
  args: {
    listId: v.string(),
    title: v.string(),
    items: v.array(itemValidator),
  },
  handler: async (ctx, args) => {
    checkListId(args.listId);
    checkTitle(args.title);
    checkItems(args.items);

    // A second row under the same id would sit behind the first, and surface
    // under the original link the moment the first row is removed.
    const existing = await ctx.db
      .query("lists")
      .withIndex("by_listId", (q) => q.eq("listId", args.listId))
      .first();
    if (existing) {
      throw new ConvexError("A list with this id already exists.");
    }

    const now = Date.now();
    const listId = await ctx.db.insert("lists", {
      listId: args.listId,
      title: args.title,
      items: args.items,
      createdAt: now,
      updatedAt: now,
    });
    return listId;
  },
});

export const updateList = mutation({
  args: {
    listId: v.string(),
    title: v.optional(v.string()),
    items: v.optional(v.array(itemValidator)),
  },
  handler: async (ctx, args) => {
    if (args.title !== undefined) checkTitle(args.title);
    if (args.items !== undefined) checkItems(args.items);

    const list = await ctx.db
      .query("lists")
      .withIndex("by_listId", (q) => q.eq("listId", args.listId))
      .first();

    if (!list) {
      throw new Error("List not found");
    }

    const updates: any = {
      updatedAt: Date.now(),
    };

    if (args.title !== undefined) updates.title = args.title;
    if (args.items !== undefined) updates.items = args.items;

    await ctx.db.patch(list._id, updates);

    return list._id;
  },
});

// Internal: no page calls it, and as a public mutation it let anyone who had
// seen a link delete that list. Who may delete a list is an open product
// question; until it is answered, deletion happens from the dashboard.
export const deleteList = internalMutation({
  args: { listId: v.string() },
  handler: async (ctx, args) => {
    const list = await ctx.db
      .query("lists")
      .withIndex("by_listId", (q) => q.eq("listId", args.listId))
      .first();

    if (list) {
      await ctx.db.delete(list._id);
    }
  },
});
