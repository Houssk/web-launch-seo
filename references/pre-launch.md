# Pre-launch: indexing switch, closed staging, opening day

Load before any public deployment, before creating a staging site, before flipping indexing on, and when Search Console reports an error right after opening.

## Contents

- One indexing switch
- Staging: public but closed
- Placeholder guard
- Owner-only opening conditions
- Opening sequence
- Opening-day pitfalls
- Fixing a built `dist/` the evening before
- Say in the report

## One indexing switch

- One build variable, for example `PUBLIC_INDEXABLE=true`, drives together: the `<meta name="robots">` of every page, the content of `robots.txt`, the `X-Robots-Tag` header if any, and whether pages enter the sitemap.
- **Closed by default**: a build without the explicit variable is not indexable.
- Never two sources of truth (typical defect: `robots.txt` opened by hand while pages still say `noindex`, or the reverse).
- Indexable build: `robots.txt` allows `/` and carries an absolute https `Sitemap:` line on the public host; every indexable page has `index, follow` and a self canonical; `noindex` pages (legal notice, thank-you pages) stay out of the sitemap.

## Staging: public but closed

In order of preference:

1. Access control (HTTP authentication, Cloudflare Access): nothing is readable, so nothing is indexable. Recommendation (unsourced).
2. Otherwise: `X-Robots-Tag: noindex` on **every** staging response (or `noindex` on every page) **and** a `robots.txt` that does **not** disallow crawling, so that crawlers can read the `noindex`. For `noindex` to work, "the page or resource must not be blocked by a robots.txt file"; the `X-Robots-Tag` header has the same effect as the meta tag. Source: https://developers.google.com/search/docs/crawling-indexing/block-indexing (read 2026-10-12)
3. Never `Disallow: /` alone: a staging URL linked from elsewhere can still be listed in results, without content. Same source.

Check a staging build with `check-site --mode staging` (INDEX-002, ROBOTS-006). In staging a missing sitemap or `robots.txt` is fine.

## Placeholder guard

An indexable build fails when a public page contains a placeholder marker. Default list (extend per project, for example with the project's own "coming soon" wording): `lorem ipsum`, `TODO`, `TBD`, `[placeholder]`, `[à compléter]`. `check-site` applies the same list (PLACEHOLDER-001, extra markers with `--forbid`).

Never replace placeholder text with invented content (team, address, figures): list it for the owner.

## Owner-only opening conditions

The agent lists them; the owner decides:

- name and brand checked;
- domain configured: HTTPS forced, HSTS, `www` redirect;
- legal pages complete (for France, see the legal reference);
- expert review of high-stakes content (health, law, finance, regulation);
- audience measurement compliant with local privacy law.

## Opening sequence

```bash
SITE_URL=https://example.com PUBLIC_INDEXABLE=true npm run build
node <skill-dir>/scripts/check-site.mjs --dist dist --site https://example.com      # 0 error
# deploy
node <skill-dir>/scripts/check-site.mjs --url https://example.com --domain example.com
# Search Console and Bing Webmaster Tools: submit the sitemap; URL inspection of the home page only
```

## Opening-day pitfalls

| Pitfall | Rule |
| --- | --- |
| `Disallow` hides `noindex` | A URL blocked by robots.txt is never fetched again, so its `noindex` is never read and the URL can stay in results. Unblock first, let crawlers read `noindex`. |
| robots.txt is cached | Google caches robots.txt "for up to 24 hours", longer if it cannot refresh it. After the switch, the old file can apply for a day: do not conclude to a failure, check with the live test of URL inspection. |
| robots.txt answers 4xx | Google treats any 4xx except 429 "as if a valid robots.txt file didn't exist": a staging without robots.txt and without `noindex` is crawlable. |
| robots.txt answers 5xx | Crawling stops for 12 hours, then the last cached copy is used for up to 30 days. |
| "Couldn't fetch" on the sitemap of a new property | Documented causes: robots.txt, manual action, 404, server error, low crawl demand; Google retries "for a few days". Check URL inspection live ("Crawl allowed? Yes", "Page fetch: Successful"), then wait; do not resubmit in a loop. |
| Several properties | A sitemap submitted in one property is not visible in another: prefer a Domain property. |
| Indexing requests | Manual, home page and key pages only. The Indexing API is only for `JobPosting` pages and `BroadcastEvent` embedded in a `VideoObject`. The daily quota of manual requests is not documented: do not quote one. |

Source: https://developers.google.com/search/docs/crawling-indexing/block-indexing (read 2026-10-12)
Source: https://developers.google.com/search/docs/crawling-indexing/robots/robots_txt (read 2026-10-12)
Source: https://support.google.com/webmasters/answer/7451001 (read 2026-10-12)
Source: https://developers.google.com/search/apis/indexing-api/v3/quickstart (read 2026-10-12)

## Fixing a built `dist/` the evening before

When only the build output is available: run `check-site --dist dist --site <public origin>`, fix every error in the files (the rules above say how), and never invent content for placeholder text. Then say that each fix must also go into the build configuration, or the next build brings the defects back.

## Say in the report

- robots.txt is cached by Google for up to 24 hours: the opening can look ineffective for a day.
- A page disallowed in robots.txt cannot have its `noindex` read (it is never fetched); use `noindex` with crawling allowed, never `Disallow` to deindex.
- Each placeholder found, as an owner decision.
