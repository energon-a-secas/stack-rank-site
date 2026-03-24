# Deployment Guide

## Local Development

```bash
# Start development servers
make serve      # Starts HTTP server on port 8828
make convex     # Starts Convex backend

# Or manually:
python3 server.py           # SPA-aware HTTP server
npx convex dev              # Convex dev server
```

Visit `http://localhost:8828/` to test locally.

## GitHub Pages

The site uses a `404.html` workaround to support client-side routing on GitHub Pages.

**Setup:**
1. Push to GitHub
2. Go to Settings → Pages
3. Set source to your branch (e.g., `main`)
4. Site will be available at `https://yourusername.github.io/stack-rank-site/`

**How it works:**
- When GitHub Pages encounters `/w37e97wpsg/`, it serves `404.html`
- `404.html` redirects to `index.html` while preserving the path in `sessionStorage`
- `index.html` restores the path from `sessionStorage`
- JavaScript routing takes over

## Netlify

Netlify has native SPA routing support via `_redirects` file (already included).

**Setup:**
1. Connect your GitHub repo to Netlify
2. Build settings: None needed (static site)
3. Deploy

The `_redirects` file handles all routing automatically.

## Vercel

Vercel has native SPA routing support via `vercel.json` (already included).

**Setup:**
1. Install Vercel CLI: `npm i -g vercel`
2. Run: `vercel`
3. Follow prompts to link/deploy

The `vercel.json` file handles all routing automatically.

## Cloudflare Pages

Cloudflare Pages has native SPA routing support.

**Setup:**
1. Create a `_redirects` file (already included)
2. Connect your GitHub repo to Cloudflare Pages
3. Build settings: None needed (static site)
4. Deploy

## Environment Variables

For Convex to work in production, ensure `CONVEX_URL` is set correctly in `index.html`:

```javascript
window.CONVEX_URL = 'https://industrious-hare-401.convex.cloud';
```

Update this to your production Convex deployment URL.

## Testing Routing

After deploying, test these URLs:
- Base: `https://your-domain.com/` ✅
- List: `https://your-domain.com/abc123xyz/` ✅ (should load and show the list)

If you see a 404 or blank page, check:
1. `404.html` is deployed
2. `index.html` has the sessionStorage restore script
3. Convex client is loading correctly (check browser console)
