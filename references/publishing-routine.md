# Publishing routine (every article or page)

Load each time an article or a page is published or substantially updated.

## Content architecture

- One content collection with schema validation (`title`, `description`, `category` enum, `pubDate`, `updatedDate`, `cover`, `coverAlt`, `refs[]`, `lang`, `translationKey`): a bad entry fails the build.
- Blog index per locale; RSS feed per locale with `<link rel="alternate" type="application/rss+xml">` in `<head>`.
- Topic clusters: internal links between related articles.

## Routine

1. **Content**: conforms to the schema. Body: an introduction that answers, `##` sections (question-style headings whose first sentence answers on its own), a table if useful, sources with URLs. A FAQ section only when readers really ask those questions: it brings no Google rich result (see the structured data reference). Human review for accuracy; expert review for high-stakes content.
2. **Facts**: no invented figure, quotation, testimonial, credential or legal reference; each quotation checked on its source page.
3. **Translations**: paired with the same `translationKey`; hreflang symmetric.
4. **Internal links**: from and to related content, plus a call to action; update one or two older articles.
5. **Cover**: WebP, about 1200 x 630, under 120 KB, `width`/`height` set.
6. **Dates**: `dateModified` and sitemap `lastmod` set to the real modification date.
7. **Build and check**: build green, then `node <skill-dir>/scripts/check-site.mjs --dist dist --site <origin>`: 0 error.
8. **Ship**: commit, push, deploy; the URL answers 200 in production (`check-site --url`).
9. **Google**: the sitemap carries the page. A manual indexing request only for a priority page (rules on indexing requests and the Indexing API in the pre-launch reference).
10. **Bing**: if Crawler Hints or an IndexNow integration is set up, check that the URL appears in the IndexNow report of Bing Webmaster Tools; do not assume it. Recommendation (unsourced).
11. **Log the keyword** as done in `docs/seo/keywords.md`.

## Say in the report

- The `check-site` result and what remains for the owner (review, indexing request).
