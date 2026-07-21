---
name: web-launch-seo
description: Use when building, launching, or optimizing a marketing/content website and you want production-grade SEO, GEO (LLM visibility), performance, i18n, deployment and monitoring — plus the per-article publishing routine. Reference stack is Astro (static) + Cloudflare, but the checklists apply to any static site. Trigger on "new website", "SEO setup", "launch site", "optimize SEO/GEO", "make my site rank", "publish an article checklist".
---

# Web Launch & SEO/GEO Playbook

A reusable, battle-tested checklist to build a fast, well-referenced website and keep it optimized. Reference implementation: **Astro static site + Cloudflare Workers**, trilingual, Lighthouse 100×4. Adapt the tools; the principles hold for any stack.

**How to use:** work top to bottom for a new site. For an existing site, jump to the phase you need. The **Per-new-page/article routine** (§7) is the recurring checklist for every publish.

---

## 1. Foundations — build the site right

- **Static-first framework** (Astro, Eleventy, Hugo…): pre-rendered HTML = fast + crawlable. Everything server-rendered, nothing critical hidden behind JS.
- **Content collections with schema validation** (Astro `astro:content` + Zod): every article validated at build (`title`, `description ≤160`, `category` enum, `pubDate`, `cover`, `refs[]`…). A bad article fails the build — the build IS your test gate.
- **Design tokens + scoped CSS. NO inline CSS** (`style="…"` forbidden). CSS lives in component `<style>` blocks or a tokens file. Keeps it maintainable and CSP-friendly.
- **Self-host fonts** (e.g. `@fontsource-variable/...`) — no render-blocking third-party font requests.
- **Performance budget from day one:**
  - Inline critical CSS (`build.inlineStylesheets: 'always'` in Astro) → removes render-blocking requests.
  - `compressHTML: true`.
  - Images in **WebP**, sized, `loading="lazy" decoding="async"`, explicit `width`/`height` (avoids CLS).
  - Target **Lighthouse 100/100/100/100** on the **production build** (`astro build` + `astro preview`) in **incognito** — never judge perf on the dev server or with extensions on.

## 2. On-page SEO (every page)

- **`<title>` ≤ 60 chars**, unique per page. **`<meta name="description">` ≤ 160**, unique.
- **`<link rel="canonical">`** = self, absolute URL.
- **Open Graph**: `og:type`, `og:title`, `og:description`, `og:url`, `og:image` (1200×630), `og:site_name`, `og:locale`.
- **Twitter cards**: `summary` by default; **`summary_large_image` for articles** (with a real cover image).
- **`<meta name="robots" content="index, follow">`** (and `noindex, follow` on legal/utility pages).
- **Heading hierarchy**: one `<h1>`, logical `<h2>`/`<h3>`. Question-style headings help both SEO and featured snippets.
- **Structured data (JSON-LD)** — add the types you actually have:
  - `Organization` / `ProfessionalService` (site-wide, with `@id`).
  - `WebSite`.
  - `Article` / `TechArticle` per post (`headline`, `datePublished`, `author`, `publisher`, `articleSection`, `image`, `inLanguage`, `citation` from your refs).
  - `FAQPage` when the page has a FAQ (directly citable by search + LLMs).
  - `BreadcrumbList`.
- **`robots.txt`**: `Allow: /` + `Sitemap:` line.
- **`sitemap.xml`** auto-generated (`@astrojs/sitemap`), multilingual, ideally with `<lastmod>` so engines re-crawl changed pages.

## 3. GEO — be cited by LLMs (ChatGPT, Perplexity, Copilot)

- **`public/llms.txt`** at the root: a concise, structured summary of the site (offering, expertise, key pages, contact). Keep it accurate — it's a direct feed to LLMs.
- **Write citable content**: a bold, self-contained **definition at the top of each section**; clear Q&A; tables; FAQ. LLMs quote crisp, standalone statements.
- **Cite authoritative sources** (standards, official docs, with URLs) — lends credibility and gets surfaced.
- **English content matters** — LLMs cite mostly English. If multilingual, ship EN.
- **Bing = a GEO channel**: Bing feeds ChatGPT Search and Copilot. Getting indexed on Bing (via IndexNow, §6) is a GEO lever, not just "the small engine".
- **Measure GEO manually**: monthly, ask 5-10 real questions to ChatGPT/Perplexity/Copilot and note whether/when you're cited.

## 4. Internationalization (if multilingual)

- **Typed dictionary pattern**: one source-of-truth locale file (`fr.ts` → `type Dict = typeof fr`), other locales typed `: Dict`. A missing key **fails the build** — that's the enforcement.
- **Routing**: default locale unprefixed (`/`), others prefixed (`/en/`, `/es/`). Astro `i18n` with `prefixDefaultLocale: false`.
- **Per-page hreflang** (NOT just the homepage): each page points its `hreflang` alternates to the **equivalent translated page**, plus `x-default`. Don't emit homepage hreflang on sub-pages.
- **Pair translations explicitly**: give the content schema a `lang` field + a shared `translationKey`; the route finds the counterpart by matching key to build the alternate URL. Emit no alternates for un-paired pages (better than pointing them at homepages).
- **Don't auto-redirect by browser language** — Google discourages it. Use hreflang + a language selector; optionally a soft "available in English →" suggestion.
- **Localize display taxonomy**: if your category enum is in one language, map labels for the others (a small `Record<string,string>`), used in visible UI + JSON-LD `articleSection`.

## 5. Content architecture (blog)

- **One content collection**, `lang` + `translationKey` fields (see §4).
- **Blog index per locale**, filtered by `lang`, index pages hreflang-paired to each other.
- **RSS feeds** (`@astrojs/rss`): `/rss.xml` per locale + `<link rel="alternate" type="application/rss+xml">` autodiscovery in `<head>`. Helps aggregators and some LLM crawlers.
- **Internal linking**: every new article links to 1-2 related articles + a relevant resource + a conversion CTA. Update older articles to link the new one (topic clusters).
- **Factual accuracy is a hard guardrail** for expert/regulated content: cite verifiable sources, mark uncertain claims, **human expert review before publishing**. Never fabricate stats, testimonials, or credentials.

## 6. Deployment & infra (Cloudflare reference)

Deploy on push (Cloudflare Workers/Pages Builds, Netlify, Vercel…). Then the **Cloudflare hardening checklist**:

- [ ] **SSL/TLS → Always Use HTTPS = ON** (verify `http://` returns a 301, not 200).
- [ ] **HSTS = ON** (start max-age 6 months; it's semi-permanent — enable only once all HTTPS works).
- [ ] **Minimum TLS Version = 1.2**. SSL/TLS mode = **Full (strict)**.
- [ ] **www → apex redirect**: DNS `CNAME www → apex` (proxied) + a Redirect Rule `Hostname eq "www.example.com"` → Dynamic `concat("https://example.com", http.request.uri.path)`, 301, preserve query. (Free Universal SSL covers `*.domain` — no need for paid Advanced Certificate Manager.)
- [ ] **Crawler Hints = ON** (Caching → Configuration) → automatic **IndexNow** ping to Bing/Yandex on content change. Zero code.
- [ ] **Early Hints = ON** (Speed → Optimization).
- [ ] **Tiered Cache = ON** (free generic version; skip paid "Smart Topology"/Argo).
- [ ] **Bot Fight Mode = OFF** for a content site (don't risk challenging Googlebot/Bingbot; rely on WAF + Medium security).
- [ ] Security headers via a `public/_headers` file: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, cache rules for static assets.
- Already automatic on Cloudflare: HTTP/3, Brotli/gzip. (Auto Minify was removed — minify at build instead.)

## 7. Per-new-page/article routine ← THE RECURRING CHECKLIST

Every time you publish an article or page:

1. **Content** — `.md` conforms to the schema: `title`, `description ≤160`, `category` (valid enum), `pubDate`, `readingTime`, `cover` (WebP, unique), `coverAlt`, `refs[]`. Body: intro → `##` sections (question style) → a table if useful → FAQ (`###`) → sources. Human review for accuracy.
2. **Translations** — create the paired translation(s) with the same `translationKey` + correct `lang`. Verify hreflang FR↔EN is symmetric.
3. **Internal links** — link from/to related content + a CTA; update 1-2 older articles to point here.
4. **Cover image** — generate/optimize to WebP ~1200×630, <120 KB.
5. **Build green** — `npm run build` (validates schema + types). Fix before commit.
6. **Verify rendered** — open the page: title, cover, table, FAQ, structured data, no console errors.
7. **Ship** — commit + push (auto-deploy). Confirm the URL is 200 in production.
8. **Google** — the sitemap auto-updates; **once**, for a brand-new site or a priority page, do **GSC → URL Inspection → Request Indexing** (quota ~10/day). Routine articles don't need this — the sitemap handles them.
9. **Bing/GEO** — nothing to do: **Crawler Hints/IndexNow** pings automatically on deploy.
10. **Log the keyword** — mark it done in your `docs/seo/keywords.md` backlog.

> Automation reality: you CANNOT automate Google's "Request Indexing" button. The Indexing API is **only** for `JobPosting`/`BroadcastEvent` — do not abuse it for articles. For Google, automation = fresh **sitemap + lastmod**. For Bing/LLMs, automation = **IndexNow** (done). So the only manual step is a one-time indexing request for key pages at launch.

## 8. Monitoring stack

- **Google Search Console** — verify (DNS TXT), submit `sitemap-index.xml`, watch Queries / Pages / Core Web Vitals / hreflang.
- **Bing Webmaster Tools** — **import from GSC** (1 click, imports property + sitemap). Run **Site Scan** (free on-page audit).
- **Cloudflare Web Analytics** — cookieless, no consent banner needed. Real visits + Core Web Vitals.
- **Microsoft Clarity** — heatmaps + session replay (⚠️ cookies → needs a consent banner under GDPR; gate it behind opt-in, or use cookieless analytics only).
- **Monthly ritual**: 30 min reviewing GSC + analytics; double down on what works. Manual GEO citation test (§3).

## 9. Non-negotiable guardrails

- **No inline CSS** (`style="…"`).
- **Factual accuracy** for expert content: verifiable claims, cited sources, human review. Zero fabrication (stats, testimonials, credentials).
- **GDPR/cookies**: cookieless analytics need no banner; anything with cookies (Clarity, GA) needs **prior consent** — gate the script behind an opt-in banner. Keep the legal/cookies page truthful about what's actually running.
- **Legal pages**: complete `mentions légales` / imprint (company identifiers, host, contact); `noindex` them.
- **Judge performance on the production build in incognito**, never the dev server.

## 10. Quick-reference: the launch sequence

```
Build foundations (§1) → on-page SEO (§2) → GEO/llms.txt (§3) → i18n (§4)
→ content + RSS (§5) → deploy + Cloudflare hardening (§6)
→ GSC + Bing + analytics (§8) → one-time Request Indexing of key pages (§7.8)
→ then: per-article routine (§7) forever.
```
