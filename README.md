# web-launch-seo

A reusable **[Claude Code](https://claude.com/claude-code) skill** + universal playbook to build, launch, and keep optimizing a fast, well-referenced website — **SEO, GEO (LLM visibility), performance, i18n, deployment and monitoring** — plus the per-article publishing routine.

Reference stack: **[Astro](https://astro.build) static site + Cloudflare**, trilingual, Lighthouse 100×4. The checklists apply to any static-site stack.

## What's inside

The full playbook lives in [`SKILL.md`](./SKILL.md), organized in 10 reusable sections:

1. **Foundations** — static-first, content collections + schema validation, no inline CSS, self-hosted fonts, Lighthouse-100 budget
2. **On-page SEO** — titles/descriptions, canonical, Open Graph, Twitter cards, JSON-LD (Article/FAQ/Breadcrumb), robots, sitemap + `lastmod`
3. **GEO** — `llms.txt`, citable content, authoritative sources, English content, Bing → ChatGPT/Copilot
4. **Internationalization** — typed dictionary pattern, per-page hreflang, `translationKey` pairing, localized taxonomy
5. **Content architecture** — content collection with `lang`/`translationKey`, RSS feeds, internal linking, accuracy guardrails
6. **Deployment & Cloudflare hardening** — Always Use HTTPS, HSTS, www→apex, Crawler Hints (IndexNow), Early Hints, Tiered Cache
7. **Per-new-page/article routine** — the recurring publishing checklist
8. **Monitoring** — Search Console, Bing Webmaster, Cloudflare Web Analytics, Clarity
9. **Non-negotiable guardrails** — no inline CSS, factual accuracy, GDPR/cookies, legal pages
10. **Launch sequence** — the condensed order of operations

## Install as a Claude Code skill

Clone it into your Claude Code skills directory so it's auto-discovered in **every** project:

```bash
git clone https://github.com/Houssk/web-launch-seo ~/.claude/skills/web-launch-seo
```

(On Windows: `%USERPROFILE%\.claude\skills\web-launch-seo`.)

## Usage

In any Claude Code session:

- Type **`/web-launch-seo`**, or
- Just ask — *"help me launch/optimize the SEO for this site"* — and the skill triggers automatically.

## License

[MIT](./LICENSE) — use it, adapt it, ship better sites.
