---
name: web-launch-seo
description: Launches and hardens static marketing and content sites for search engines and AI answers. Covers the pre-launch indexing switch (staging, noindex, robots.txt, sitemap, canonical), build guards and their tests, structured data (JSON-LD), keyword research without paid tools, AI crawlers and GEO (llms.txt), security headers, Core Web Vitals and Lighthouse, French privacy and legal notices (CNIL, LCEN), Cloudflare settings, post-deploy checks and the publish-an-article routine. Ships a zero-dependency checker that finds launch defects in a built dist folder or on a live URL. Use when a site is about to launch or go live, when setting up staging, SEO, structured data, an AI crawler policy, security headers or performance work, or when publishing an article.
---

# Web launch, SEO and GEO

Gets a static site crawled, indexed and cited without the mistakes that break a launch. Reference stack: Astro and Cloudflare; the rules hold for any static generator and host. Detailed rules, with their sources and read dates, live in `references/`: load only what the task needs.

## How to use

1. Find the phase in the router below and read the matching reference(s) before acting.
2. Run the checker on what exists (the built `dist/`, or the live URL) and read every finding.
3. Fix at the source (build configuration, templates, content). When only a built `dist/` is given, fix it there and say the same fix must go to the source.
4. Re-run the checker until it reports 0 error; justify every warning you leave.
5. Report in the format below, including the "Say in the report" points of each reference you used.

## Phase router

| Situation | Load |
| --- | --- |
| Going live, opening indexing, creating a staging site, Search Console errors right after opening | `references/pre-launch.md` |
| Build configuration, environments, CI, "make the build safe", tests that guard SEO rules, Lighthouse CI | `references/build-guards.md` |
| Page templates: titles, descriptions, canonicals, Open Graph, sitemap, hreflang, internal links | `references/on-page-seo.md` |
| JSON-LD, rich results, schema.org types, logo, ratings, dates | `references/structured-data.md` |
| Keyword study, editorial plan, choosing an article subject | `references/keywords.md` |
| Being cited by ChatGPT, Perplexity, Claude, Copilot or AI Mode; llms.txt; entity name | `references/geo.md` |
| robots.txt for AI crawlers, Cloudflare bot or AI settings, citations dropping | `references/ai-crawlers.md` |
| Visitors in France or the EU: audience measurement, cookies or storage, consent banner, privacy page, legal notice, high-stakes content | `references/privacy-legal-fr.md` |
| CSP, security headers, third-party scripts, iframes, Workers, relays | `references/security-headers.md` |
| Lighthouse, Core Web Vitals (LCP, INP, CLS), layout shift, fonts, heavy scenes | `references/performance.md` |
| Cloudflare zone settings (HTTPS, HSTS, redirects, caching, Crawler Hints, Early Hints) | `references/cloudflare.md` |
| Right after a production deployment; monthly monitoring | `references/post-launch.md` |
| Publishing or updating an article or a page | `references/publishing-routine.md` |

Several rows often apply: a launch usually needs pre-launch, on-page SEO and security headers.

## Run the checker

`<skill-dir>` is this skill's base directory. Node 20 or later, no dependency, no install.

```bash
# before deployment, on the build output (launch mode: the site must be indexable)
node <skill-dir>/scripts/check-site.mjs --dist dist --site https://example.com
# a staging build: every page noindex, crawling allowed
node <skill-dir>/scripts/check-site.mjs --dist dist --site https://staging.example.com --mode staging
# after deployment, on the live site (adds redirects, HSTS, real 404)
node <skill-dir>/scripts/check-site.mjs --url https://example.com --domain example.com --json report.json
```

- Exit code 0: no error. 1: at least one error (`--strict`: warnings count too). 2: invalid usage, missing folder or unreachable origin.
- One line per finding: `E|W|I CHECK-ID /path message`. The message says what is wrong and what to do; the reference of the phase says why.
- Options: `--path /ingest/x` (headers of a relay or API, repeatable), `--forbid "Coming soon"` (extra placeholder marker), `--max-pages`, `--json`.
- In a project, copy the script into `scripts/` and run it from `npm test` after the build (see `references/build-guards.md`).
- It sees only what is built or served. Dashboard settings (Cloudflare, Search Console), legal facts and consent choices are for you to reason about and for the owner to decide.

## Non-negotiable guardrails

- One indexing switch, closed by default; robots meta, `robots.txt` and sitemap all follow it.
- Never use `Disallow` to deindex: a blocked page cannot have its `noindex` read. Deindex with `noindex` and crawling allowed.
- An indexable build refuses a missing, empty or local `SITE_URL` (one explicit, tested exception: the Lighthouse CI build).
- Every guard has a test on the built output, and the test fails when the guard is removed.
- Never invent: figures, search volumes, reviews, ratings, quotations, legal identifiers, article or criterion numbers, `sameAs` profiles, replacement for placeholder text.
- Legal questions (CNIL, LCEN, consent, accepted risks) are listed for the owner with the rule and its source, not decided by the agent.
- A dated fact (Google features, Cloudflare defaults, legal articles) is stated with its source and read date from the reference; if it matters and may have changed, say it must be checked again.
- Never promise a rich result or a ranking.

## Report format

Always these three sections (in the user's language):

- **Fixed**: each file changed, what changed, the check-site ID it clears; the final checker summary line.
- **Needs owner decision**: each item, the rule behind it and its source, the risk if left as is.
- **Not verified**: what you could not check (live headers, Search Console, Cloudflare dashboard, legal facts) and the exact command or place to check it.

Add the "Say in the report" points of every reference you loaded.
