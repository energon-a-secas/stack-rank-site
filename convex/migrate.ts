// Migration script to update old priority values (P0, P1, P2) to new system (P1-P6)
import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// Query to find all lists with old priority values
export const findListsToMigrate = query({
  handler: async (ctx) => {
    const lists = await ctx.db.query("lists").collect();

    const listsToMigrate = lists.filter(list => {
      return list.items.some(item =>
        item.priority === "P0" ||
        (item.priority === "P1" || item.priority === "P2")
      );
    });

    return {
      total: lists.length,
      needsMigration: listsToMigrate.length,
      lists: listsToMigrate.map(l => ({
        listId: l.listId,
        title: l.title,
        itemCount: l.items.length,
        priorities: l.items.map(i => i.priority)
      }))
    };
  },
});

// Migration function to update priorities
// P0 (High) -> P1 (Critical)
// P1 (Medium) -> P3 (Medium)
// P2 (Low) -> P5 (Low)
export const migrateListPriorities = internalMutation({
  args: { listId: v.string() },
  handler: async (ctx, args) => {
    const list = await ctx.db
      .query("lists")
      .withIndex("by_listId", (q) => q.eq("listId", args.listId))
      .first();

    if (!list) {
      throw new Error(`List ${args.listId} not found`);
    }

    const migratedItems = list.items.map(item => {
      let newPriority = item.priority;

      // Map old priorities to new ones
      if (item.priority === "P0") newPriority = "P1"; // High -> Critical
      if (item.priority === "P1") newPriority = "P3"; // Medium -> Medium
      if (item.priority === "P2") newPriority = "P5"; // Low -> Low

      return {
        ...item,
        priority: newPriority
      };
    });

    await ctx.db.patch(list._id, {
      items: migratedItems,
      updatedAt: Date.now()
    });

    return {
      listId: args.listId,
      migratedItemCount: migratedItems.length
    };
  },
});
