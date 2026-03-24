<div align="center">

# Stack Rank

Drag-and-drop reorder team priorities. Share lists via URL, changes sync instantly.

[![Live][badge-site]][url-site]
[![HTML5][badge-html]][url-html]
[![CSS3][badge-css]][url-css]
[![JavaScript][badge-js]][url-js]
[![Claude Code][badge-claude]][url-claude]
[![License][badge-license]](LICENSE)

[badge-site]:    https://img.shields.io/badge/live_site-0063e5?style=for-the-badge&logo=googlechrome&logoColor=white
[badge-html]:    https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white
[badge-css]:     https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white
[badge-js]:      https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black
[badge-claude]:  https://img.shields.io/badge/Claude_Code-CC785C?style=for-the-badge&logo=anthropic&logoColor=white
[badge-license]: https://img.shields.io/badge/license-MIT-404040?style=for-the-badge

[url-site]:   https://stackrank.neorgon.com/
[url-html]:   #
[url-css]:    #
[url-js]:     #
[url-claude]: https://claude.ai/code

</div>

---

## Overview

Stack Rank helps teams prioritize work visually. Drag items to reorder, customize colors, add metadata, and share lists with anyone via URL. No signup needed—anyone with the link can edit.

**Live:** stackrank.neorgon.com

---

## Features

- **Drag-and-drop reordering** -- Smooth animations with SortableJS, move cards with drag handles
- **URL sharing** -- Each list gets a unique, unguessable ID. Share the link, collaborate instantly
- **No authentication** -- Anyone with the URL can view and edit (up to 10 items per list)
- **Customizable cards** -- 8 vibrant colors plus priority badges (P0/P1/P2)
- **Rich metadata** -- Add tags, notes, and priority levels to each item
- **Default templates** -- Pre-filled lists for shopping, team priorities, reminders, and project steps
- **Local cache** -- Works offline, syncs automatically when back online
- **Responsive design** -- Works great on mobile and desktop

---

## Running locally

ES modules and Convex require HTTP server setup:

```bash
# Install dependencies
npm install

# Start Convex backend
npx convex dev

# In another terminal, start HTTP server
python3 -m http.server 8828
```

Then open http://localhost:8828

---

## Architecture

![Architecture](docs/architecture.svg)

```
stack-rank-site/
├── index.html              # Main app shell
├── css/
│   └── style.css          # All styles + custom Stack Rank UI
├── js/
│   ├── app.js             # Entry point, initialization
│   ├── state.js           # Shared state, CRUD operations
│   ├── render.js          # DOM rendering, SortableJS setup
│   ├── events.js          # Event handlers, user interactions
│   ├── data.js            # Convex API client layer
│   └── utils.js           # Helpers, toast, clipboard, etc.
├── convex/                 # Convex backend
│   ├── schema.ts          # Database schema
│   ├── lists.ts           # Queries and mutations
│   └── tsconfig.json      # TypeScript config
├── CNAME                  # stackrank.neorgon.com
├── package.json           # Dependencies (convex)
├── Makefile               # Dev commands
├── README.md              # This file
├── robots.txt             # Search engine rules
└── sitemap.xml            # SEO sitemap
```

### Backend

The Convex backend stores list data with:
- **Schema**: `lists` table with `listId` (unique string), `title`, `items` array, and timestamps
- **Functions**: `getList`, `createList`, `updateList`, `deleteList`
- **No auth**: Lists are public but unguessable (random 10-char IDs)

---

<div align="center">
<sub>Part of <a href="https://neorgon.com/">Neorgon</a></sub>
</div>
