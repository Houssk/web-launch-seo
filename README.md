# web-launch-seo

A **[Claude Code](https://claude.com/claude-code) skill** to launch and harden static marketing and content sites for search engines and AI answers: pre-launch indexing switch and staging, build guards and their tests, structured data, keyword research without paid tools, AI crawlers and GEO, security headers, Core Web Vitals, French privacy and legal notices, Cloudflare settings, post-deploy checks and the per-article routine.

Reference stack: [Astro](https://astro.build) static site + Cloudflare. The rules apply to any static-site stack.

## What's inside

- [`SKILL.md`](./SKILL.md): the short operating guide (phase router, checker, guardrails, report format).
- [`references/`](./references): one file per moment of the work, loaded on demand. Every factual rule carries its source and read date; unsourced advice is labelled "Recommendation (unsourced)".
- [`scripts/check-site.mjs`](./scripts/check-site.mjs): a zero-dependency checker (Node 20+) with 45 checks (robots.txt, sitemap, canonicals, indexability, placeholders, Open Graph, JSON-LD, entity name, links, soft 404, security headers, CSP hashes, images, CSS, render-blocking resources, trackers, llms.txt, redirects).
- [`evals/`](./evals): the test bench (fixture sites with planted defects, agent scenarios, deterministic grader).

## Use the checker

```bash
node scripts/check-site.mjs --dist dist --site https://example.com                      # before deploying
node scripts/check-site.mjs --dist dist --site https://staging.example.com --mode staging
node scripts/check-site.mjs --url https://example.com --domain example.com --json report.json   # after deploying
```

Exit code 0 = no error, 1 = errors, 2 = invalid usage or unreachable origin.

## Install as a Claude Code skill

```bash
git clone https://github.com/Houssk/web-launch-seo ~/.claude/skills/web-launch-seo
```

Then type `/web-launch-seo`, or ask "help me launch this site" and the skill triggers.

## Tests

```bash
node --test scripts/test/check-site.test.mjs scripts/test/skill-structure.test.mjs
node --test evals/test/grade.test.mjs
node evals/run.mjs --variant new --dry-run
```

Protocol of the agent scenarios: [`evals/README.md`](./evals/README.md).

## License

[MIT](./LICENSE)
