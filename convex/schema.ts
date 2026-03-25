import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  lists: defineTable({
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
      })
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_listId", ["listId"]),
});
