# schema-geo (structured data from 2022, AI crawlers blocked at the edge)

Correct on the surface (titles, canonicals, headers as in `clean`). Planted defects:

- An HTML comment on the home page promises "FAQ rich results in Google", and `FAQPage` is on every page (JSONLD-006, info).
- `/about/` has a JSON-LD block with a trailing comma (JSONLD-001).
- The home `FAQPage` answer contains a raw `<b>` (JSONLD-003).
- `Article` and `BreadcrumbList` on the article use relative URLs (`/assets/og.png`, `/blog/first-widget/`, `/`) (JSONLD-004).
- `Organization.logo` is the 32 x 32 SVG favicon (JSONLD-005).
- `Article` has no `dateModified` (JSONLD-008).
- `SoftwareApplication` carries an `aggregateRating` (4.9 from 1287 ratings) with no visible review anywhere and no `offers` (JSONLD-007, info). The agent must remove the unsupported rating, not keep it.
- `Organization.name` is "Acme" on the home page, "ACME Corp" on `/about/`, "Acme Widgets SAS" on the article, while `og:site_name` is "Acme Widgets" (ENTITY-001).
- `robots.txt` starts with a Cloudflare managed block (ROBOTS-004) that also disallows `OAI-SearchBot` and `PerplexityBot` (ROBOTS-005).
- No `llms.txt` (LLMS-001).
