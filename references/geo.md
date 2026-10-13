# GEO: being cited in AI answers

Load when the goal is to be cited by AI assistants (ChatGPT, Perplexity, Claude, Copilot, Google AI Mode), when writing pillar pages, or for the monthly citation check.

## What Google says

- "There are no additional requirements to appear in AI Overviews or AI Mode"; "You don't need to create new machine readable files, AI text files, or markup". Source: https://developers.google.com/search/docs/appearance/ai-features (read 2026-10-12)
- On 2026-06-15 Google noted that llms.txt files are not needed for Google Search. Source: https://developers.google.com/search/updates (read 2026-10-12)
- Google's guide to generative AI features: AI text files are not needed "as Google Search itself doesn't use them"; creating llms.txt files will "neither harm nor help" visibility in Google Search. Source: https://developers.google.com/search/docs/fundamentals/ai-optimization-guide (read 2026-10-12)

## llms.txt: optional

- A proposal by Jeremy Howard (Answer.AI), published 2024-09-03, open to contributions: not a standard. Format: an H1 (the only required section), a blockquote summary, H2 sections of links `[name](url): notes`, an `Optional` section. Source: https://llmstxt.org/ (read 2026-10-12)
- Cheap: publish it if useful, present it as optional, never as "a direct feed to LLMs".
- H1 = the entity name; links absolute, on the public host (LLMS-001).

```markdown
# Example

> Example designs repairable widgets for small workshops.

## Pages

- [About Example](https://example.com/about/): who builds the widgets
- [How we test a widget](https://example.com/blog/how-we-test/): the five bench checks
```

## Rules

1. **Allow the AI search crawlers** (see the AI crawlers reference): a blocked site is not cited.
2. **One entity**: the same name in the title suffix, `og:site_name`, `Organization.name`, the `llms.txt` H1 and the legal notice; the same `sameAs` profiles everywhere. `check-site` reports divergences (ENTITY-001). Recommendation (unsourced).
3. **Answer in the first sentence**: under each heading phrased as a question, the first sentence answers on its own, without relying on context. Recommendation (unsourced).
4. **Primary sources**: cite official texts with their URL in the page, and in `Article.citation`. Recommendation (unsourced).
5. **Bing and IndexNow** stay useful as a discovery channel. Recommendation (unsourced). Do not claim that Bing feeds ChatGPT search: OpenAI runs its own search crawler (`OAI-SearchBot`). Source: https://developers.openai.com/api/docs/bots (read 2026-10-12)
6. Do not claim that assistants cite mostly English content: no source supports it. Publish the languages your buyers read.

## Monthly probe with a fixed list

Recommendation (unsourced). Write 10 to 15 questions once (those of a real buyer), ask them every month with the same wording to the same assistants (ChatGPT, Perplexity, Copilot, Claude, Google AI Mode), and log the result in `docs/seo/geo-probe.md`:

| Date | Engine | Question | Cited (y/n) | URL cited | Competitors cited |
| --- | --- | --- | --- | --- | --- |

## Say in the report

- `llms.txt` is an optional proposal, not used by Google Search.
- Whether the AI search crawlers can reach the site, and what only the owner can change (Cloudflare dashboard, real profiles).
