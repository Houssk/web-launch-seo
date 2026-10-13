# AI crawlers: policy and the Cloudflare layer

Load when the goal is to be cited by AI assistants, when writing `robots.txt`, when changing Cloudflare Security or Bots settings, or when citations drop.

## Contents

- Write the policy down
- Crawler tokens
- The Cloudflare layer can rewrite the policy
- Check what is served
- Say in the report

## Write the policy down

Write the AI crawler policy in the repository (a comment at the top of `robots.txt`, or a doc). Separate:

- **search and retrieval crawlers**: they make the site cited in answers. A site that wants to be cited allows them;
- **training crawlers**: allowing or blocking them is the owner's decision, not the agent's.

```text
# AI crawler policy: search and retrieval crawlers allowed (citations).
# Training crawlers: <allowed|blocked> (owner decision, <date>).
User-agent: *
Allow: /

Sitemap: https://example.com/sitemap.xml
```

## Crawler tokens

| Vendor | Search / retrieval | Training | Notes |
| --- | --- | --- | --- |
| OpenAI | `OAI-SearchBot` (ChatGPT search: a site that blocks it "will not be shown in ChatGPT search answers"); `ChatGPT-User` (action of a user, "robots.txt rules may not apply") | `GPTBot` | Source: https://developers.openai.com/api/docs/bots (read 2026-10-12) |
| Anthropic | `Claude-SearchBot` (search), `Claude-User` (user request) | `ClaudeBot` | All respect robots.txt. Source: https://support.claude.com/en/articles/8896518 (read 2026-10-12) |
| Google | `Googlebot` also governs AI Overviews and AI Mode | `Google-Extended` (training and grounding in other Google systems) | Source: https://developers.google.com/search/docs/appearance/ai-features (read 2026-10-12) |
| Perplexity and others | `PerplexityBot` | - | Tokens not verified at the source: Recommendation (unsourced) |

## The Cloudflare layer can rewrite the policy

What the repository says is not always what is served:

- **Managed robots.txt** prepends a block to the site's file ("Cloudflare will prepend our managed content before your original content"), between `# BEGIN Cloudflare Managed content` and `# END Cloudflare Managed Content`, with `Disallow: /` for crawlers such as GPTBot, ClaudeBot, CCBot, Google-Extended, and a `Content-signal` line. It appears when an AI policy is set to block and Bot Preference Sync is on. Source: https://developers.cloudflare.com/bots/additional-configurations/managed-robots-txt/ (read 2026-10-12)
- **AI Crawl Control** blocks a crawler with a WAF rule ("creates or updates a WAF custom rule"): the crawler can be blocked even when `robots.txt` allows it. Source: https://developers.cloudflare.com/ai-crawl-control/features/manage-ai-crawlers/ (read 2026-10-12)
- Cloudflare announced on 2025-07-01 that it blocks AI crawlers by default; the default of a given zone is not documented on the pages read: **always check the dashboard** (AI Crawl Control, crawler list; Security, Bots). Source: https://blog.cloudflare.com/content-independence-day-no-ai-crawl-without-compensation/ (read 2026-10-12)
- **Bot Fight Mode** issues computationally expensive challenges to detected bots, can challenge API traffic, and "You cannot bypass or skip Bot Fight Mode using WAF custom rules". Source: https://developers.cloudflare.com/bots/get-started/bot-fight-mode/ (read 2026-10-12) For a content site: off. Recommendation (unsourced).

When a managed block in the served `robots.txt` disallows search crawlers, editing the repository file is not enough: the owner must change the setting in the Cloudflare dashboard (AI Crawl Control, managed robots.txt, Bot Preference Sync), or the block comes back at the edge.

## Check what is served

```bash
curl -s https://example.com/robots.txt | head -40
node <skill-dir>/scripts/check-site.mjs --url https://example.com    # ROBOTS-004 managed block, ROBOTS-005 AI search crawlers
```

In a built `dist/`, `robots.txt` must not disallow `/` to any AI search crawler (ROBOTS-005).

## Say in the report

- Which search crawlers were blocked, and that the block came from Cloudflare (managed robots.txt / AI Crawl Control): the owner must change it in the dashboard.
- The training-crawler choice, left to the owner.
