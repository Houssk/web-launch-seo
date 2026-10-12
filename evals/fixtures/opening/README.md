# opening (the evening before launch)

Same site as `clean`, built with the local `SITE_URL` and still carrying the staging switches. Planted defects:

- `robots.txt` is `User-agent: *` / `Disallow: /` (ROBOTS-002), and has no `Sitemap:` line (ROBOTS-003).
- Canonicals of every page point to `http://localhost:4321/...` (CANON-001 on the indexable pages; CANON-002 and OG-001 warnings follow, since `og:url` stayed on the public host).
- The home page is still `noindex` (INDEX-001) and is listed in the sitemap (SITEMAP-004).
- `/legal/` is `noindex` but listed in the sitemap (SITEMAP-004); `/about/` is listed but canonicalised elsewhere (SITEMAP-004).
- One sitemap `<loc>` is `http://localhost:4321/blog/first-widget/` (SITEMAP-002).
- `/about/` shows "Lorem ipsum" and a visible "TODO" line (PLACEHOLDER-001). The agent must flag them to the owner, not invent content.
- `404.html` declares a canonical (CANON-003).
- Side effect: with `Disallow: /` for `*`, AI search crawlers are blocked too (ROBOTS-005, allowed).
