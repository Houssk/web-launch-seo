# headers-perf (weak headers, layout shift, render-blocking resources)

Content as in `clean`, plus `worker/ingest-proxy.mjs`, an analytics relay in source form (not served by `check-site`). Planted defects:

- `_headers` (`/*`) has only `nosniff` and `X-Frame-Options`: no CSP, Referrer-Policy or Permissions-Policy on `/`, `/about/`, `/legal/` (HEADERS-001).
- `/blog/*` gets a CSP whose `script-src` is `'self' 'unsafe-inline'` (CSP-001).
- The article has an inline script whose sha256 is not in `script-src` (CSP-002).
- `worker/ingest-proxy.mjs` forwards the visitor's headers (cookies included) to the vendor and returns the vendor's response headers unchanged: `set-cookie` passes through, no `X-Content-Type-Options`. `_headers` does not apply to a Worker's responses.
- The hero image on the home page has no `width`/`height` (IMG-001).
- `assets/site.css` has `content-visibility: auto` without `contain-intrinsic-size` (CSS-001).
- The home `<head>` loads a Google Fonts stylesheet and a script without `defer`/`async` (PERF-001).
