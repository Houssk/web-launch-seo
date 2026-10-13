# Structured data (JSON-LD)

Load when adding or reviewing JSON-LD, adding a page type, or when someone expects a rich result.

## Contents

- Dated facts: what Google still shows
- Rules
- Serialisation
- Checks
- Say in the report

## Dated facts: what Google still shows

- **FAQ**: since 2023-08-08, FAQ rich results are limited to well-known, authoritative government and health websites. Source: https://developers.google.com/search/blog/2023/08/howto-faq-changes (read 2026-10-12)
- **FAQ**: deprecated on 2026-05-08: "This feature will no longer appear in Google Search starting May 7, 2026"; the documentation was removed on 2026-06-15. Never promise a FAQ rich result. Source: https://developers.google.com/search/updates (read 2026-10-12)
- `FAQPage` markup that mirrors a visible FAQ is harmless: in 2023 Google said there is no need to remove it. Its value for other engines is a Recommendation (unsourced). Source: https://developers.google.com/search/blog/2023/08/howto-faq-changes (read 2026-10-12)
- **HowTo**: no longer shown on desktop since 2023-09-13; the type is deprecated. Source: https://developers.google.com/search/blog/2023/08/howto-faq-changes (read 2026-10-12)
- Other rich result types retired in 2025-2026 (course info, estimated salary, learning video, special announcement, vehicle listing, practice problems): do not propose them. Source: https://developers.google.com/search/updates (read 2026-10-12)

## Rules

1. **One graph linked by `@id`**: `Organization` (`https://example.com/#organization`) and `WebSite` (`https://example.com/#website`, `publisher` pointing to the organization) on every page; other nodes refer to them by `@id`.
2. **`Organization`**: no required property; `logo` at least 112 x 112 px, crawlable, in a format Google Images supports. Use a square raster (PNG, JPEG, WebP) of the symbol, not the SVG favicon (Recommendation (unsourced) for the square PNG). Source: https://developers.google.com/search/docs/appearance/structured-data/organization (read 2026-10-12)
3. **`Organization.name`** is the single entity name defined in the GEO reference, identical on every page (ENTITY-001).
4. **`sameAs`**: only real profiles that exist. Never invent one.
5. **`SoftwareApplication` / `Product`**: the software rich result requires `name`, `offers.price` and `aggregateRating` **or** `review`. Without real ratings there is no rich result: describe the application without a rating. Never add, and never keep, an `aggregateRating` that no real, visible review supports: remove it. Source: https://developers.google.com/search/docs/appearance/structured-data/software-app (read 2026-10-12)
6. **`Article`**: no required property; recommended `author`, `datePublished`, `dateModified` (ISO 8601 with time zone), `headline`, `image` (several images, at least 50,000 pixels, ratios 16x9, 4x3, 1x1). Source: https://developers.google.com/search/docs/appearance/structured-data/article (read 2026-10-12)
7. **`dateModified`** follows the real modification date of the content; the same date feeds the sitemap `lastmod`, which Google uses only if it is "consistently and verifiably" accurate. Source: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap (read 2026-10-12)
8. **About page**: `AboutPage` with `about` pointing to the organization (and to a `Person` when the page presents one; `Person.worksFor` points to the organization). Recommendation (unsourced).
9. **Markup matches visible text**: no property for content the page does not show. Source: https://developers.google.com/search/docs/appearance/ai-features (read 2026-10-12)
10. **Absolute URLs** in `url`, `@id`, `logo`, `image`, `item`, `mainEntityOfPage`, on the public host, never `localhost` (JSONLD-004).

## Serialisation

Text inside JSON-LD must not close the `<script>` element: HTML requires escaping `</script` and `<!--` inside a script. Serialise with every `<` replaced by its JSON escape, and keep markup such as `<b>` out of JSON-LD text. Source: https://html.spec.whatwg.org/multipage/scripting.html#restrictions-for-contents-of-script-elements (read 2026-10-12)

```js
const jsonLd = (data) => JSON.stringify(data).replace(/</g, '\\u003c');
```

A trailing comma or a comment makes the whole block invalid JSON: the block is ignored (JSONLD-001).

## Checks

1. `check-site --dist dist --site <origin>`: JSONLD-001 to JSONLD-008 and ENTITY-001.
2. Shared blocks (the `Organization` graph, the logo) are on every page, the 404 page and other pages outside the sitemap included: apply each fix to every HTML file, then search the whole output for the old value (old logo URL, old name, relative URLs). `check-site` does not read the JSON-LD of the 404 page.
3. Rich Results Test for the eligible types, after deployment.

Minimal home page graph:

```json
{"@context":"https://schema.org","@graph":[
 {"@type":"Organization","@id":"https://example.com/#organization","name":"Example","url":"https://example.com/","logo":"https://example.com/assets/logo.png"},
 {"@type":"WebSite","@id":"https://example.com/#website","url":"https://example.com/","name":"Example","publisher":{"@id":"https://example.com/#organization"}}]}
```

## Say in the report

- FAQ rich results are no longer shown by Google (removed from Search on 2026-05-07, limited since 2023-08): `FAQPage` markup brings no Google rich result; keep it only if it mirrors a visible FAQ.
- Every rating removed, and why (no real, visible reviews).
- Facts you could not check (real profiles for `sameAs`, real dates) go to **Needs owner decision**.
