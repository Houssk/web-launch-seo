# clean (negative control)

No planted defect. `check-site --dist dist --site https://acme-widgets.test` must report zero errors and zero warnings (false-positive control). Infos are allowed.

What makes it clean, so a check that fires here is a false positive:

- `robots.txt` allows `/` for every agent, AI crawler policy written as a comment, absolute https `Sitemap:` line.
- `sitemap.xml` lists the three indexable pages only, with distinct `lastmod` dates; `/legal/` (noindex) is not listed.
- Every page: one `<h1>`, `lang`, unique title (60 characters or fewer) and description (50 to 160), absolute canonical on `https://acme-widgets.test`, `og:url` equal to the canonical, absolute `og:image` (1200 x 630 PNG), `twitter:card`.
- `404.html` has no canonical.
- JSON-LD: `Organization` + `WebSite` graph on every page (same name "Acme Widgets" as `og:site_name` and the `llms.txt` H1), raster 512 x 512 logo, `Article` with `dateModified`, absolute URLs everywhere, `<` escaped.
- `_headers` (`/*`): CSP whose `script-src` carries the exact sha256 of the only inline script, `nosniff`, Referrer-Policy, Permissions-Policy, `X-Frame-Options`, `frame-ancestors`.
- Images have `width` and `height`; `content-visibility: auto` is paired with `contain-intrinsic-size`; the only head script is `defer`; no third-party resource; no tracker, no storage API.
