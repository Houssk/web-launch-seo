# Keyword research without paid tools

Load for a keyword study, an editorial plan, or choosing the subject of an article.

## Rules

1. **Free signals only, each noted with its date and market**:
   - search engine autocomplete: a sign that a query exists, not a volume;
   - result pages read by hand: who ranks, which measures competition;
   - Google Trends: relative indices (0 means below the threshold), never volumes;
   - AI answers of the engines: who is cited, a GEO indicator.
   Autocomplete endpoints are not documented APIs: do not build a shipped tool on them. Recommendation (unsourced).
2. **Volume is "not measured"** until measured data exists. Never write an estimated monthly volume, never a number next to "searches" or "per month", not even as a range. The result count shown by an engine measures competition, not demand.
3. **No network tool, or a bot check (CAPTCHA)**: stop and say so; never work around it, never fill the gap from memory. Work from the site content and the owner's knowledge of the buyers instead.
4. **Difficulty is qualitative** (low, medium, high), justified by what the result page shows.
5. **Switch to real data after launch**: the Search Console Performance report (queries, impressions, position) replaces indirect signals; revisit priorities after a few weeks of data. Recommendation (unsourced).

## Template: `docs/seo/keywords.md`

Every table row keeps `Volume = not measured`. `Source` says where the signal comes from (site content, autocomplete, result page, Trends, AI answer); `Date` is the day it was read.

```markdown
# Keyword study

Market: <country, language>. Date: <YYYY-MM-DD>. Volumes are not measured: no paid tool, no Search Console data yet.

| Query | Source | Date | Market | Signal | Volume | Competition | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| repairable widget | site content | <date> | UK, en | core offer | not measured | medium (to check on the result page) | candidate |

## Next step
After launch, replace these signals with the Search Console Performance report (queries, impressions, position).
```


## Say in the report

- Volumes are not measured, and why (no paid tool, no network access, no Search Console data yet).
- What replaces them after launch: the Search Console Performance report.
