# Build guards: one URL per environment, rules enforced by tests

Load when setting up or changing the build, an environment (local, CI, staging, production), a deployment workflow, or when adding any SEO or security rule.

## Contents

- One public URL per environment
- Guards in the build configuration
- Rules enforced by tests
- Test template (Node, zero dependency)
- Lighthouse CI
- Prove a guard by removing it
- Say in the report

## One public URL per environment

- The public URL comes from the build environment (`SITE_URL`), never from code. Each environment has its own: local, Lighthouse CI, staging, production.
- An empty variable is not an absent one: an unset CI secret often arrives as an empty string. Test the value, not the presence. Recommendation (unsourced), learned on a real launch.
- Build tests receive **the same** `SITE_URL` as the build. A workflow that passes the URL to the build but not to the tests gets tests that are red on the production build only. Recommendation (unsourced).
- Public test keys of third-party services (for example "always valid" CAPTCHA site keys) are refused when `SITE_URL` is public. Recommendation (unsourced).

## Guards in the build configuration

The build **refuses to build** instead of shipping a wrong page. Generic example (put it at the top of `astro.config.mjs`, `build.mjs` or the equivalent: it runs before any page is written):

```js
const indexable = process.env.PUBLIC_INDEXABLE === 'true';   // closed by default
const lighthouse = process.env.LIGHTHOUSE_CI === 'true';     // explicit, tested exception
const site = (process.env.SITE_URL ?? '').trim();            // an empty variable is not a value
if (indexable) {
  if (!site) throw new Error('SITE_URL is required for an indexable build');
  const { protocol, hostname } = new URL(site);
  const local = hostname === 'localhost' || hostname === '127.0.0.1';
  if (local && !lighthouse) throw new Error(`SITE_URL ${site} is local: only the Lighthouse CI build (LIGHTHOUSE_CI=true) may be indexable on localhost`);
  if (!local && protocol !== 'https:') throw new Error('an indexable public build needs an https SITE_URL');
}
if (site.endsWith('/')) throw new Error('SITE_URL must not end with a slash');
```

The same switch then drives every output (see the pre-launch reference): `robots` meta (`index, follow` or `noindex`), `robots.txt` (always `Allow: /`; `Sitemap:` line when indexable), sitemap content.

Placeholder guard, in the same build, on the visible text of every page when the build is indexable. The marker list is in the pre-launch reference; translate each marker into a regular expression:

```js
const MARKERS = [/* the default markers of the pre-launch reference, plus the project's own */];
if (indexable) for (const page of pages) for (const m of MARKERS) {
  if (m.test(visibleText(page))) throw new Error(`placeholder text on ${page.path}: ${m}`);
}
```

Validate content at build time too (schema of each article: title, description, dates, cover): a bad entry fails the build.

## Rules enforced by tests

A rule that matters has a test that blocks the merge, and the test runs on the **built output**, not only on helper functions: a canonical can be wrong in `dist/` while every unit test of the URL helper is green.

Minimal build tests (on `dist/`):

- one `h1` per page, `lang` on `<html>`;
- title and description present and unique; length over 60 / 160 characters reported as a warning (truncation convention, not a Google rule);
- absolute canonical equal to the page path on the public host; no canonical on the 404;
- absolute `og:image` whose file exists in `dist/`;
- every JSON-LD block is valid JSON with a schema.org `@context`; the home page has `Organization` and `WebSite`; require at least one block (a loop over zero blocks passes silently);
- `robots.txt` and sitemap match the switch; `noindex` pages absent from the sitemap;
- every internal link leads to a built page.

The simplest way: copy `check-site.mjs` into the project (single file, zero dependency, Node 20+) and run it from `npm test` after a build. Copy it with Node:

```bash
node -e "const fs=require('node:fs');fs.mkdirSync('scripts',{recursive:true});fs.copyFileSync(process.argv[1],'scripts/check-site.mjs')" <skill-dir>/scripts/check-site.mjs
```

Keep project-specific tests for what the checker cannot see.

## Test template (Node, zero dependency)

`test/build.test.mjs`, run by `npm test` (`node --test`). Adapt the build command and origins. Keep the build tests in one file: they share `dist/`, and `node --test` runs files in parallel.

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

function build(env) {
  const base = { ...process.env };
  for (const k of ['SITE_URL', 'PUBLIC_INDEXABLE', 'LIGHTHOUSE_CI']) delete base[k];
  return spawnSync(process.execPath, ['build.mjs'], { env: { ...base, ...env }, encoding: 'utf8' });
}
const check = (...args) => spawnSync(process.execPath, ['scripts/check-site.mjs', '--dist', 'dist', ...args], { encoding: 'utf8' });

test('indexable build refuses a missing, empty or local SITE_URL', () => {
  assert.notEqual(build({ PUBLIC_INDEXABLE: 'true' }).status, 0);
  assert.notEqual(build({ PUBLIC_INDEXABLE: 'true', SITE_URL: '' }).status, 0);
  assert.notEqual(build({ PUBLIC_INDEXABLE: 'true', SITE_URL: 'http://localhost:4321' }).status, 0);
});

test('the Lighthouse CI build (localhost, LIGHTHOUSE_CI=true) still builds', () => {
  assert.equal(build({ PUBLIC_INDEXABLE: 'true', SITE_URL: 'http://localhost:4321', LIGHTHOUSE_CI: 'true' }).status, 0);
});

test('staging build: noindex everywhere and crawling allowed', () => {
  assert.equal(build({ SITE_URL: 'https://staging.example.com' }).status, 0);
  const r = check('--site', 'https://staging.example.com', '--mode', 'staging');
  assert.equal(r.status, 0, r.stdout);
  assert.doesNotMatch(r.stdout, /ROBOTS-006/);
});

// Last: leaves the production build in dist/.
test('production build: check-site finds no error in the output', () => {
  const b = build({ PUBLIC_INDEXABLE: 'true', SITE_URL: 'https://example.com' });
  assert.equal(b.status, 0, b.stderr);
  const r = check('--site', 'https://example.com');
  assert.equal(r.status, 0, r.stdout);
});
```

Add a test for the placeholder guard: build a copy of the project (or a temporary content folder) with a page containing `Lorem ipsum` and `TODO`, expect a non-zero exit.

## Lighthouse CI

- Blocking in CI, on the production-like build: at least 3 runs (the `numberOfRuns` default is 3; 5 is steadier), assertions aggregated on the `median`.
- The assertion default is `{"aggregationMethod": "optimistic", "minScore": 1}`: `optimistic` keeps the best run and can hide a performance regression. Set `median` explicitly.
- `staticDistDir` makes Lighthouse CI serve the built folder itself.

Source: https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/configuration.md (read 2026-10-12)

```json
{
  "ci": {
    "collect": { "staticDistDir": "./dist", "numberOfRuns": 5 },
    "assert": {
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.95, "aggregationMethod": "median" }],
        "categories:accessibility": ["error", { "minScore": 1, "aggregationMethod": "median" }],
        "categories:best-practices": ["error", { "minScore": 1, "aggregationMethod": "median" }],
        "categories:seo": ["error", { "minScore": 1, "aggregationMethod": "median" }]
      }
    }
  }
}
```

The scores above are an example; each project sets its own.

## Prove a guard by removing it

Remove the guard (or put the old code back), run the tests: they must fail. Restore the guard: they must pass. A guard whose test stays green without it guards nothing.

```bash
git stash push -- build.mjs   # remove the guard
npm test                      # must FAIL on the guard's test
git stash pop                 # restore
npm test                      # must PASS
```

## Say in the report

- Which builds now fail (missing, empty or local `SITE_URL`; placeholder text) and the single exception (Lighthouse CI build), with the test that covers each.
- That the tests check the built output with `check-site`, and whether you proved each guard by removing it (or that the proof is left to the owner).
