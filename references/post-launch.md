# After deployment: checks and monitoring

Load right after each production deployment, and for the monthly review.

## Checks after each deployment

```bash
node <skill-dir>/scripts/check-site.mjs --url https://example.com --domain example.com --json report.json
curl -sI https://example.com/                     # 200, CSP, Referrer-Policy, nosniff, HSTS
curl -sI http://example.com/                      # 301/308 to https://example.com/
curl -sI "https://www.example.com/a/?q=1"         # 301/308 to https://example.com/a/?q=1 (path and query kept)
curl -s  https://example.com/robots.txt           # Allow, absolute Sitemap, no unexpected managed block
curl -sI https://example.com/does-not-exist/      # a real 404, not 200
curl -sI https://example.com/<relay-path>         # headers set by the Worker itself
```

On Windows PowerShell, call `curl.exe`, not the `curl` alias. `check-site --url` covers REDIRECT-001/002, NOTFOUND-001, HEADERS-001 (HSTS online) and HEADERS-002 (`--path` for relays and APIs).

Then:

- submit the sitemap in Search Console (a Domain property) and in Bing Webmaster Tools (import from Search Console);
- URL inspection of the home page (live test); request indexing only for the home page and key pages;
- open the main pages in a private window: console without errors (CSP violations included).

## Monitoring

- **Search Console**: Pages (indexing), Performance (queries, impressions, position: the real keyword data), Core Web Vitals (field data, INP included), sitemaps.
- **Bing Webmaster Tools**: imported from Search Console; Site Scan; IndexNow report to check that changed URLs arrive.
- **Audience measurement**: choose and configure the tool with the France privacy reference (cookies, storage, consent, opt-out), also useful outside France as a cautious baseline.
- **Monthly**: 30 minutes on Search Console and analytics; the fixed-list AI citation probe (see the GEO reference). Recommendation (unsourced).

## Say in the report

- The output of `check-site --url` (0 error expected) and every command you could not run: **Not verified**, with the command.
