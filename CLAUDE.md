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
  mistyped one lands somewhere saveable (under a fresh id when the server would
  refuse the typed one, see below). It used to hold local state with no row,
  and the first edit then failed inside `lists:updateList`, which throws
  "List not found".

`tests/draft.test.mjs` pins all of this with a fake data layer, and it was checked
in both directions: inverting the `isDraft` branch reds 5 of 7, and dropping the
flag from `createNewList` reds a different 5 of 7. Verify a change to this area in
a browser as well, against a fake deployment rather than the real one, or the
check writes the rows it is trying to prove absent.

## Who can write a list

Nobody signs in. A list's id is its only guard: `getList` and `updateList` are
public and take no identity, which is what the README promises (anyone with the
link can edit). Five things follow from that:

- `convex/listRules.ts` checks every stored field before `createList` or
  `updateList` writes: id and color patterns, lengths, item counts. It is the only
  server gate, and `tests/list-rules.test.mjs` pins it in both directions.
- `js/rules.js` is the page's copy of those rules, and the test fails if the two
  disagree. The page stops a refused value before sending it: the title is cut
  at 200, tags past 20 or past 100 characters are refused in the item form, a
  restore stops at 100 active items, an import is checked whole before it
  replaces the list, and a typed link id the server would refuse (a `:` or `!`
  left in the fragment) starts a draft under a fresh id with a notice.
- **Completed items are never pruned**, so a list grows for as long as it is
  used. The cap that bites is 100 *active* items. The total is capped at 8192,
  Convex's own array limit, so it refuses nothing the deployment would store;
  a first version capped the total at 100 and a list that had finished about 90
  items could no longer be saved. Do not lower it without a retention rule.
- `js/render.js` escapes every value it interpolates and reduces a color to a hex
  color (`safeColor` in `js/rules.js`) before it reaches a style attribute,
  because a row can hold anything written before the rules existed.
- `lists:deleteList` and `migrate:findListsToMigrate` are internal. The first let
  any link holder delete a list, with no page that calls it; the second returned
  every list id, which is every edit link.

Who may update or delete a list (a per-list edit token, or sign-in through the
Auth Kit) is an owner decision that has not been made, not an oversight.

## Content Security Policy

Every page GitHub Pages serves carries a strict `<meta http-equiv="Content-Security-Policy">`:
`index.html`, `404.html` and `tests/test-hash.html` (it ships too). Scripts get no
`'unsafe-inline'`, so if an escaping bug returns to `js/render.js`, an injected
handler or `<script>` still does not run. It is the second layer, not the fix.

- **No Markdown is published.** Pages runs Jekyll, which by default renders every
  tracked `.md` into a same-origin HTML page with theme scripts and no policy
  (`/CLAUDE.html`, `/docs/DEPLOY.html`). `_config.yml` excludes every Markdown
  extension and `docs/`. A new `.html` page, or a file with `---` front matter outside
  `docs/`, needs its own policy or its own exclude entry. Keep `_config.yml`
  rather than switching to `.nojekyll`, which would publish `.claude/` and
  `_redirects`.
- **`index.html` allows three inline scripts by sha256**: the header kit's theme
  guard, the `window.CONVEX_URL` line and the module that imports the Convex
  client. Any edit to one, whitespace included, blocks it until the hash is
  updated. Smoke check 29 in the monorepo (`bash scripts/smoke.sh --only=29`)
  names the hash a changed script needs and any pin left stale. It skips
  `tests/`, so `tests/test-hash.html`'s one hash is yours to keep in step.
- **Third-party scripts are allowed by exact path**: `https://esm.sh/convex@1.21.0/`
  plus the two `jwt-decode` paths esm.sh resolves it to, and SortableJS's one
  file on jsdelivr (also SRI-pinned). A version bump changes the policy in the
  same edit; a new dependency path esm.sh starts serving shows up as a
  `script-src-elem` violation in the console.
- **`connect-src` names this deployment only**
  (`https://industrious-hare-401.convex.cloud/api/`). `ConvexHttpClient` never
  opens a WebSocket, so there is no `wss:` entry. Moving the deployment changes
  `CONVEX_URL`, the fallback in `js/utils.js` and this entry together.
- **No inline event handlers**, in HTML or in JS template strings: they do not
  run here. Wire listeners in `js/events.js`.
- `frame-ancestors`, `report-uri` and `X-Content-Type-Options` do nothing in a
  meta tag, so none are set.

## Still open

**The orphan sweep is built and has not run.** The empty lists that bare visits
inserted before the draft fix went live are still in the deployment. Deleting
them writes to the data the live site reads, so running it is the owner's call.

What it deletes is `isUntouchedOrphan` in `convex/sweepRules.ts`: the title is
`New Priority List`, there are no items, `updatedAt === createdAt`, and
`createdAt` is before `DRAFT_FIX_LIVE_AT` (1790852998000, 2026-10-01T11:09:58Z,
when Pages started building bdd71d8, the first build to serve the fix in
642c3ff). Anything a person touched is spared: a title, one item, any update at
all (a list filled and then emptied by hand). The cutoff is not optional: since
the fix, pressing Share on an untouched draft writes exactly the orphan shape,
on purpose, so the functions refuse a later one. Pages caches for 600 s, so a
stale tab may have inserted a few orphans in the minutes after the cutoff; they
are left.

Anyone holding the link to a swept row still gets the same page: a hash with no
row opens an empty draft under the same id (see above), which is what the row
showed, and only the toast changes ("New list ready"). So a pre-fix visitor who
shared the empty list they landed on loses nothing.

Run it from this directory, against the deployment in `.env.local`
(`industrious-hare-401`, which the live site reads):

```bash
npx convex dev --once                                      # push convex/, see below
npx convex run sweep:sweepOrphans '{"dryRun":true}'        # counts, writes nothing
npx convex run sweep:sweepOrphans '{"dryRun":false}'       # deletes what it counted
npx convex run sweep:sweepOrphans '{"dryRun":true}'        # orphans should be 0
```

- **Not `npx convex deploy`.** `.env.local` names a dev deployment, and the site
  reads it; `deploy` targets the project's prod deployment instead. The push
  ships everything in `convex/`, including the field rules and the internal
  `deleteList` from f1abedd and 4e330e5 if they are not live yet.
- Before the deleting run, check that `newest` in the dry run is before the
  cutoff and open one `sample` id in the dashboard (it is the document `_id`,
  not the `listId`, which is an edit link). `keptEmpty` counts the empty rows
  the sweep spares, renamed or edited ones.
- `dryRun` has no default. `before` can narrow the sweep to an earlier cutoff;
  `pageSize` (default 100, at most 500) can be lowered if a page of very long
  lists hits the per-transaction read limit.

`tests/sweep.test.mjs` pins the predicate and the paging, and every clause and
guard was mutated: all 18 mutants turn a test red. The functions were also run
end to end on a local Convex backend with ten fake rows (the cached
`convex-local-backend` on loopback, a scratch copy with no `.env.local`): the
dry run counted 5 orphans of 8 rows scanned and deleted nothing, the real run at
`pageSize: 2` deleted exactly those 5, the survivors were the item, renamed,
emptied and two post-cutoff rows, and a later cutoff, a missing `dryRun` and
`pageSize: 0` were refused. `convex/_generated/api.d.ts` was edited by hand to
list the new modules, and codegen on that scratch push produced the same file.

A row written before `convex/listRules.ts` existed that fails it (a non-hex color,
an id with markup in it) renders safely but cannot be saved again until the
offending item is removed. Every id and color generator in this repo's history
passes, so only hand-written rows should be affected.
