# Performance and Core Web Vitals

Load for a performance budget, a Lighthouse regression, layout shift, a heavy animation or scene, or dynamic layout.

## Contents

- The three metrics
- How to measure
- Layout shift (CLS)
- Loading
- Rendering costs
- Say in the report

## The three metrics

- Core Web Vitals: **LCP**, **INP**, **CLS**.
- INP replaced FID as a Core Web Vital on 2024-03-12. Source: https://web.dev/blog/inp-cwv-march-12 (read 2026-10-12) Do not cite FID as a current metric.
- INP is good at 200 ms or less, poor above 500 ms, at the 75th percentile of real page loads. Source: https://web.dev/articles/inp (read 2026-10-12)
- INP is a field metric: the Search Console Core Web Vitals report and real-user measurement give it; a Lighthouse navigation run does not (use Total Blocking Time as a lab proxy). Recommendation (unsourced).

## How to measure

- Production build, served locally, private window, no extensions; never the dev server.
- Several runs and the **median**: "The median Lighthouse score of 5 runs is twice as stable as 1 run"; no concurrent runs; a dedicated machine if possible. Source: https://github.com/GoogleChrome/lighthouse/blob/main/docs/variability.md (read 2026-10-12)
- In CI: Lighthouse CI with `numberOfRuns` 5 and `aggregationMethod: median` (see the build guards reference).
- Measure CLS before and after each change; field data (Search Console, real-user measurement) confirms after deployment.

## Layout shift (CLS)

- Every `<img>` has `width` and `height` (or an `aspect-ratio`) so the browser reserves the space (IMG-001).
- `content-visibility: auto` without `contain-intrinsic-size`: the skipped element gets a zero height and the scrollbar jumps. Always pair it: `contain-intrinsic-size: auto 600px` (an estimate of the real height), then measure CLS before and after (CSS-001). Source: https://web.dev/articles/content-visibility (read 2026-10-12)
- Self-hosted fonts with an adjusted fallback (`size-adjust`) reduce the shift when the font arrives. Recommendation (unsourced).

## Loading

- No third-party stylesheet or font in `<head>` (Google Fonts included): self-host the font files, or use a system font stack (PERF-001).
- No render-blocking script in `<head>`: `defer`, `async` or `type="module"` (PERF-001). PERF-001 only flags external scripts: a classic inline script cannot be deferred, so keep inline `<head>` scripts tiny or move them to the end of `<body>`.
- Images in WebP (or AVIF), sized to their display, `loading="lazy"` below the fold, never on the LCP image.
- Critical CSS inlined, no blocking third-party script.

## Rendering costs

- Container queries: measure their layout cost (Performance panel) before building a scene on them. Recommendation (unsourced).
- Text animated with `transform` can stay rasterised and blurry: animate other properties and return to `transform: none` at rest; check with a screenshot. Recommendation (unsourced).

## Say in the report

- What was fixed, by check-site ID (IMG-001, CSS-001, PERF-001).
- How to measure: median of 5 Lighthouse runs on the production build; INP from field data (Search Console Core Web Vitals report), not from Lighthouse.
- Talk about INP, with its thresholds. Teams and older reports still quote FID: say that INP replaced it on 2024-03-12 (first section), never present FID as current.
