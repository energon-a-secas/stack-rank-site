<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->

## Commands

```bash
make serve   # http://localhost:8828
make test    # node --test tests/*.test.mjs, no browser and no backend
make convex  # npx convex dev
```

## Reading the site costs the deployment nothing

A list is a **draft** until the first write. `createNewList()` builds it in memory
and returns; `persistList()` in `js/state.js` inserts the row the first time it is
called and updates it every time after, which `state.isDraft` decides. Two things
end a draft: the first real edit, and pressing Share, because a link has to
resolve for the person receiving it. Nothing else writes.

This is the fix for queue `#86`. Before it, `init()` called `createList()` on a
bare visit before the visitor had typed anything, so every click through from the
hub inserted an empty `lists` row.

Two consequences worth keeping:

- **The id enters the URL when the row exists, and not before.** `saveToBackend()`
  in `js/render.js` calls `history.replaceState` on the one save that created the
  row. A hash pointing at nothing is a share link that opens an empty list.
- **A hash id with no row is a draft too**, so a link to a deleted list or a
  mistyped one lands somewhere saveable. It used to hold local state with no row,
  and the first edit then failed inside `lists:updateList`, which throws
  "List not found".

`tests/draft.test.mjs` pins all of this with a fake data layer, and it was checked
in both directions: inverting the `isDraft` branch reds 5 of 7, and dropping the
flag from `createNewList` reds a different 5 of 7. Verify a change to this area in
a browser as well, against a fake deployment rather than the real one, or the
check writes the rows it is trying to prove absent.

## Still open

The empty lists that earlier visits already inserted are still in the deployment
and need a sweep. That is a production write, so it belongs to the owner.
