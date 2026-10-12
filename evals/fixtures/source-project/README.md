# source-project (a small static generator with no guard)

A zero-dependency Node project: `build.mjs` renders `content/*.json` into `dist/` and copies `public/`. `npm run build`, `npm test` (`node --test`, no test yet). Built with `SITE_URL=https://acme-widgets.test`, the output is clean. Planted defects (in the build, not in the output):

- `SITE_URL` missing or empty falls back silently to `http://localhost:4321`: canonicals, sitemap, `og:image`, JSON-LD and `robots.txt` all point to localhost, and the build succeeds.
- No indexing switch: every page is always `index, follow` and `robots.txt` always allows everything, so there is no way to build a public but non-indexed staging.
- No placeholder guard: a content file with "Lorem ipsum" or "TODO" ships.
- No test at all.
