import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

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
    items: v.array(
      v.object({
        id: v.string(),
        text: v.string(),
        color: v.string(),
        priority: v.union(v.literal("P1"), v.literal("P2"), v.literal("P3"), v.literal("P4"), v.literal("P5"), v.literal("P6")),
        tags: v.array(v.string()),
        notes: v.optional(v.string()),
        prevIndex: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
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
    items: v.optional(
      v.array(
        v.object({
          id: v.string(),
          text: v.string(),
          color: v.string(),
          priority: v.union(v.literal("P1"), v.literal("P2"), v.literal("P3"), v.literal("P4"), v.literal("P5"), v.literal("P6")),
          tags: v.array(v.string()),
          notes: v.optional(v.string()),
          prevIndex: v.optional(v.number()),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
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

export const deleteList = mutation({
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
