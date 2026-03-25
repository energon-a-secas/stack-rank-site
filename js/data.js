// ── Data layer ───────────────────────────────────────────────
// Convex client communication

import { state } from './state.js';

export function getConvexClient() {
  return state.convex;
}

export async function getList(listId) {
  try {
    const client = getConvexClient();
    if (!client) return null;

    // Call Convex function by name (browser-compatible)
    return await client.query('lists:getList', { listId });
  } catch (error) {
    console.error('Failed to fetch list:', error);
    return null;
  }
}

export async function createList(listId, listData) {
  try {
    const client = getConvexClient();
    if (!client) return null;

    // Strip out UI-only fields (prevIndex) before saving to backend
    const cleanItems = listData.items.map(item => {
      const { prevIndex, ...cleanItem } = item;
      return cleanItem;
    });

    // Call Convex function by name (browser-compatible)
    return await client.mutation('lists:createList', {
      listId,
      title: listData.title,
      items: cleanItems
    });
  } catch (error) {
    console.error('Failed to create list:', error);
    throw error;
  }
}

export async function updateList(listId, updates) {
  try {
    const client = getConvexClient();
    if (!client) return null;

    // Strip out UI-only fields (prevIndex) before saving to backend
    const cleanUpdates = { ...updates };
    if (cleanUpdates.items) {
      cleanUpdates.items = cleanUpdates.items.map(item => {
        const { prevIndex, ...cleanItem } = item;
        return cleanItem;
      });
    }

    // Call Convex function by name (browser-compatible)
    await client.mutation('lists:updateList', {
      listId,
      ...cleanUpdates
    });
  } catch (error) {
    console.error('Failed to update list:', error);
    throw error;
  }
}

export async function deleteList(listId) {
  try {
    const client = getConvexClient();
    if (!client) return;

    // Call Convex function by name (browser-compatible)
    await client.mutation('lists:deleteList', { listId });
  } catch (error) {
    console.error('Failed to delete list:', error);
  }
}
