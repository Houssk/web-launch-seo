// Contract tests for scripts/check-site.mjs (docs/spec.md section 4).
//
// Written by the tester BEFORE the script exists: every test is red until the developer delivers
// scripts/check-site.mjs. Zero dependency; an explicit file list works on Node 20 and later:
//   node --test scripts/test/check-site.test.mjs scripts/test/skill-structure.test.mjs
//
// Points the spec leaves open, fixed here as the contract (see docs/rapport-testeur.md; validated
// with 9 amendments in docs/validation-contrat.md):
//  A1  Named exports used by the unit tests:
//        isAllowed(robotsTxt, userAgent, path) -> boolean          (Google evaluation of robots.txt)
//        parseHeadersFile(text) -> rules                             (Cloudflare _headers syntax)
//        headersFor(rules, path) -> { [lower-case name]: string }    (all matching rules, values of a
//                                                                     repeated header joined with ", ")
//        imageSize(buffer) -> { width, height, format } | null       (format: png | jpeg | webp)
//        cspHash(scriptText) -> "sha256-<base64>"
//      Importing the module must neither run an analysis nor exit the process.
//  A2  All page-level checks (among them META, OG, CANON-001/002, INDEX-002, SITEMAP-004, JSONLD,
//      ENTITY, HREFLANG, LINK, IMG, PERF, TRACKER, PLACEHOLDER, MIXED, CSP, HEADERS-001) apply to the
//      HTML pages discovered (sitemap + internal links) that answer 200. The answer to the 404 probe
//      only feeds NOTFOUND-001, CANON-003 and HEADERS-002, and is not listed in report.pages.
//  A3  SITEMAP-003 and SITEMAP-004 evaluate the <loc> entries on the --site host only; an off-host
//      <loc> is reported by SITEMAP-002 alone. An off-host <loc> is never fetched and never added to
//      report.pages.
//  A4  "Green face" of a check: on the clean fixture, no finding of that id with severity error or
//      warning (infos allowed), except for info-only ids (JSONLD-006, JSONLD-007): no finding at all.
//  A5  --connect-to is repeatable, curl syntax HOST:PORT:CONNECT-HOST:CONNECT-PORT. In live mode the
//      TLS trust store comes from the environment (the tests set NODE_EXTRA_CA_CERTS). The script never
//      disables certificate verification; an untrusted certificate makes the origin unreachable (exit 2).
//  A6  Every finding has id, severity (error | warning | info), url (string or null for a site-wide
//      finding) and a non-empty message; evidence is optional.
//  A7  In --mode staging, the checks that only make sense for an indexable site are not applied:
//      ROBOTS-002, ROBOTS-003, ROBOTS-005, INDEX-001, SITEMAP-004, PLACEHOLDER-001 (and SITEMAP-002
//      does not require https). In staging, a 404 for robots.txt or the sitemap is not an error
//      (ROBOTS-001, SITEMAP-001); when present, they are still checked.

import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'check-site.mjs');
const FIXTURES = join(ROOT, 'evals', 'fixtures');
const CLEAN = join(FIXTURES, 'clean', 'dist');
const LIVE_CERT = join(HERE, 'fixtures', 'live', 'cert.pem');
const LIVE_KEY = join(HERE, 'fixtures', 'live', 'key.pem');
const SITE = 'https://acme-widgets.test';
const APEX = 'acme-widgets.test';
const SEVERITIES = ['error', 'warning', 'info'];

const TMP = mkdtempSync(join(tmpdir(), 'check-site-test-'));
after(() => rmSync(TMP, { recursive: true, force: true }));
let counter = 0;

// ---------------------------------------------------------------- helpers

function requireScript() {
  assert.ok(existsSync(SCRIPT), 'scripts/check-site.mjs is missing (spec section 4: written by the developer)');
}

/** Runs check-site in a child process (async: the live-mode servers live in this process). */
function run(args, { env = {}, timeoutMs = 60_000 } = {}) {
  requireScript();
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], { cwd: ROOT, env: { ...process.env, ...env } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolvePromise({ code, stdout, stderr });
    });
  });
}

/** Runs check-site with --json and returns { code, stdout, stderr, json, jsonText }. */
async function report(args, opts) {
  const jsonPath = join(TMP, `report-${++counter}.json`);
  const r = await run([...args, '--json', jsonPath], opts);
  assert.ok(existsSync(jsonPath), `no JSON report written (exit ${r.code}).\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
  const jsonText = readFileSync(jsonPath, 'utf8');
  return { ...r, jsonText, json: JSON.parse(jsonText) };
}

const distReport = (dist, extra = [], opts) => report(['--dist', dist, '--site', SITE, ...extra], opts);

function memo(fn) {
  let p;
  return () => (p ??= fn());
}

function findings(json, id, severity) {
  return json.findings.filter((f) => f.id === id && (!severity || f.severity === severity));
}
function idSet(json, severity) {
  return [...new Set(json.findings.filter((f) => f.severity === severity).map((f) => f.id))].sort();
}
function describeFindings(json) {
  return json.findings.map((f) => `${f.severity[0].toUpperCase()} ${f.id} ${f.url ?? '-'} ${f.message}`).join('\n');
}

/** Copy of the clean dist, modified by `mutate`, for one red case. */
function variant(name, mutate) {
  const dir = join(TMP, `variant-${name}`);
  rmSync(dir, { recursive: true, force: true });
  cpSync(CLEAN, dir, { recursive: true });
  const api = {
    read: (rel) => readFileSync(join(dir, rel), 'utf8'),
    write: (rel, content) => {
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      writeFileSync(join(dir, rel), content);
    },
    remove: (rel) => rmSync(join(dir, rel)),
    replace: (rel, from, to) => {
      const text = readFileSync(join(dir, rel), 'utf8');
      assert.ok(text.includes(from), `test setup: "${from}" not found in ${rel}`);
      writeFileSync(join(dir, rel), text.replace(from, to));
    },
  };
  mutate(api);
  return dir;
}

const fixtureReport = Object.fromEntries(
  ['clean', 'opening', 'schema-geo', 'headers-perf', 'privacy-fr'].map((name) => [
    name,
    memo(() => distReport(join(FIXTURES, name, 'dist'))),
  ]),
);
const cleanReport = fixtureReport.clean;

// ---------------------------------------------------------------- live-mode test server

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

/** Headers of the "/*" rule of the clean _headers (the only rule it has). */
function cleanHeaders() {
  const out = {};
  for (const line of readFileSync(join(CLEAN, '_headers'), 'utf8').split('\n')) {
    const m = line.match(/^\s+([A-Za-z-]+):\s*(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function serveClean(urlPath, res, { soft404, hsts }) {
  const base = { ...cleanHeaders(), ...(hsts ? { 'Strict-Transport-Security': 'max-age=31536000' } : {}) };
  let file = null;
  if (urlPath.endsWith('/')) file = join(CLEAN, urlPath, 'index.html');
  else if (existsSync(join(CLEAN, urlPath, 'index.html'))) {
    res.writeHead(308, { ...base, Location: `${urlPath}/` });
    return res.end();
  } else if (!urlPath.includes('_headers')) file = join(CLEAN, urlPath);
  if (file && existsSync(file)) {
    res.writeHead(200, { ...base, 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    return res.end(readFileSync(file));
  }
  res.writeHead(soft404 ? 200 : 404, { ...base, 'Content-Type': MIME['.html'] });
  return res.end(readFileSync(join(CLEAN, '404.html')));
}

/**
 * Simulates apex, www and plain http by the Host header (spec 4.5 point 4).
 * httpStatus: status of http -> https; www: 'ok' | 'drop-query' | 'chain'.
 */
async function liveSite({ httpStatus = 301, www = 'ok', soft404 = false, hsts = true } = {}) {
  const secure = https.createServer({ key: readFileSync(LIVE_KEY), cert: readFileSync(LIVE_CERT) }, (req, res) => {
    const host = (req.headers.host ?? '').split(':')[0];
    const u = new URL(req.url, `https://${host}`);
    if (host === `www.${APEX}`) {
      const target =
        www === 'ok'
          ? `https://${APEX}${u.pathname}${u.search}`
          : www === 'drop-query'
            ? `https://${APEX}${u.pathname}`
            : `http://${APEX}${u.pathname}${u.search}`;
      res.writeHead(301, { Location: target });
      return res.end();
    }
    return serveClean(decodeURIComponent(u.pathname), res, { soft404, hsts });
  });
  const plain = http.createServer((req, res) => {
    const u = new URL(req.url, `http://${APEX}`);
    res.writeHead(httpStatus, { Location: `https://${APEX}${u.pathname}${u.search}` });
    res.end();
  });
  await Promise.all([new Promise((r) => secure.listen(0, '127.0.0.1', r)), new Promise((r) => plain.listen(0, '127.0.0.1', r))]);
  const sp = secure.address().port;
  const pp = plain.address().port;
  return {
    args: [
      '--url', SITE, '--domain', APEX,
      '--connect-to', `${APEX}:443:127.0.0.1:${sp}`,
      '--connect-to', `www.${APEX}:443:127.0.0.1:${sp}`,
      '--connect-to', `${APEX}:80:127.0.0.1:${pp}`,
      '--connect-to', `www.${APEX}:80:127.0.0.1:${pp}`,
    ],
    env: { NODE_EXTRA_CA_CERTS: LIVE_CERT },
    close: () => Promise.all([new Promise((r) => secure.close(r)), new Promise((r) => plain.close(r))]),
  };
}

async function liveReport(options) {
  const site = await liveSite(options);
  try {
    return await report(site.args, { env: site.env });
  } finally {
    await site.close();
  }
}
const liveGood = memo(() => liveReport());

// ---------------------------------------------------------------- red cases (one per check id)

const red = {
  'ROBOTS-001': memo(() => distReport(variant('no-robots', (v) => v.remove('robots.txt')))),
  'ROBOTS-002': fixtureReport.opening,
  'ROBOTS-003': fixtureReport.opening,
  'ROBOTS-004': fixtureReport['schema-geo'],
  'ROBOTS-005': fixtureReport['schema-geo'],
  'ROBOTS-006': memo(() =>
    distReport(
      variant('staging-disallow', (v) => {
        v.write('robots.txt', 'User-agent: *\nDisallow: /\n');
        v.replace('_headers', '  X-Frame-Options: DENY', '  X-Frame-Options: DENY\n  X-Robots-Tag: noindex');
      }),
      ['--mode', 'staging'],
    ),
  ),
  'SITEMAP-001': memo(() => distReport(variant('no-sitemap', (v) => v.remove('sitemap.xml')))),
  'SITEMAP-002': fixtureReport.opening,
  'SITEMAP-003': memo(() =>
    distReport(
      variant('sitemap-redirect-404', (v) =>
        v.replace(
          'sitemap.xml',
          '</urlset>',
          `  <url>\n    <loc>${SITE}/about</loc>\n    <lastmod>2026-09-16</lastmod>\n  </url>\n  <url>\n    <loc>${SITE}/missing/</loc>\n    <lastmod>2026-09-17</lastmod>\n  </url>\n</urlset>`,
        ),
      ),
    ),
  ),
  'SITEMAP-004': fixtureReport.opening,
  'SITEMAP-005': memo(() =>
    distReport(
      variant('same-lastmod', (v) => v.write('sitemap.xml', v.read('sitemap.xml').replace(/<lastmod>[^<]+<\/lastmod>/g, '<lastmod>2026-10-12</lastmod>'))),
    ),
  ),
  'CANON-001': fixtureReport.opening,
  'CANON-002': memo(() =>
    distReport(
      variant('canonical-elsewhere', (v) =>
        v.replace('about/index.html', `<link rel="canonical" href="${SITE}/about/">`, `<link rel="canonical" href="${SITE}/blog/first-widget/">`),
      ),
    ),
  ),
  'CANON-003': fixtureReport.opening,
  'INDEX-001': fixtureReport.opening,
  'INDEX-002': memo(() => distReport(CLEAN, ['--mode', 'staging'])),
  'META-001': memo(() =>
    distReport(variant('empty-title', (v) => v.replace('about/index.html', '<title>About Acme Widgets</title>', '<title></title>'))),
  ),
  'META-002': memo(() =>
    distReport(variant('no-description', (v) => v.write('about/index.html', v.read('about/index.html').replace(/<meta name="description"[^>]*>\n/, '')))),
  ),
  'META-003': memo(() =>
    distReport(variant('two-h1', (v) => v.replace('about/index.html', '<h1>About Acme Widgets</h1>', '<h1>About Acme Widgets</h1>\n<h1>Our team</h1>'))),
  ),
  'OG-001': memo(() =>
    distReport(
      variant('relative-og-image', (v) =>
        v.replace('about/index.html', `<meta property="og:image" content="${SITE}/assets/og.png">`, '<meta property="og:image" content="/assets/og.png">'),
      ),
    ),
  ),
  'JSONLD-001': fixtureReport['schema-geo'],
  'JSONLD-002': memo(() => distReport(variant('no-website-node', (v) => v.replace('index.html', '"@type":"WebSite"', '"@type":"WebPage"')))),
  'JSONLD-003': fixtureReport['schema-geo'],
  'JSONLD-004': fixtureReport['schema-geo'],
  'JSONLD-005': fixtureReport['schema-geo'],
  'JSONLD-006': fixtureReport['schema-geo'],
  'JSONLD-007': fixtureReport['schema-geo'],
  'JSONLD-008': fixtureReport['schema-geo'],
  'ENTITY-001': fixtureReport['schema-geo'],
  'HREFLANG-001': memo(() =>
    distReport(
      variant('relative-hreflang', (v) =>
        v.replace('about/index.html', '<link rel="icon"', '<link rel="alternate" hreflang="fr" href="/fr/about/">\n<link rel="icon"'),
      ),
    ),
  ),
  'LINK-001': memo(() =>
    distReport(variant('broken-link', (v) => v.replace('about/index.html', '</main>', '<p><a href="/missing-page/">Our catalogue</a></p>\n</main>'))),
  ),
  'NOTFOUND-001': memo(() => liveReport({ soft404: true })),
  'PLACEHOLDER-001': fixtureReport.opening,
  'HEADERS-001': fixtureReport['headers-perf'],
  'HEADERS-002': memo(() =>
    distReport(variant('robots-no-nosniff', (v) => v.write('_headers', v.read('_headers') + '\n/robots.txt\n  ! X-Content-Type-Options\n'))),
  ),
  'CSP-001': fixtureReport['headers-perf'],
  'CSP-002': fixtureReport['headers-perf'],
  'IMG-001': fixtureReport['headers-perf'],
  'CSS-001': fixtureReport['headers-perf'],
  'PERF-001': fixtureReport['headers-perf'],
  'TRACKER-001': fixtureReport['privacy-fr'],
  'LLMS-001': fixtureReport['schema-geo'],
  'REDIRECT-001': memo(() => liveReport({ httpStatus: 302 })),
  'REDIRECT-002': memo(() => liveReport({ www: 'drop-query' })),
  'MIXED-001': memo(() =>
    distReport(
      variant('mixed-content', (v) =>
        v.replace('about/index.html', '</main>', `<p><img src="http://${APEX}/assets/logo.png" width="48" height="48" alt=""></p>\n</main>`),
      ),
    ),
  ),
};

// id -> severity expected on its red case (spec 4.3)
const CHECKS = {
  'ROBOTS-001': 'error', 'ROBOTS-002': 'error', 'ROBOTS-003': 'error', 'ROBOTS-004': 'warning',
  'ROBOTS-005': 'warning', 'ROBOTS-006': 'warning',
  'SITEMAP-001': 'error', 'SITEMAP-002': 'error', 'SITEMAP-003': 'error', 'SITEMAP-004': 'error', 'SITEMAP-005': 'warning',
  'CANON-001': 'error', 'CANON-002': 'warning', 'CANON-003': 'warning',
  'INDEX-001': 'error', 'INDEX-002': 'error',
  'META-001': 'error', 'META-002': 'error', 'META-003': 'warning',
  'OG-001': 'error',
  'JSONLD-001': 'error', 'JSONLD-002': 'warning', 'JSONLD-003': 'warning', 'JSONLD-004': 'error',
  'JSONLD-005': 'warning', 'JSONLD-006': 'info', 'JSONLD-007': 'info', 'JSONLD-008': 'warning',
  'ENTITY-001': 'warning', 'HREFLANG-001': 'warning', 'LINK-001': 'error', 'NOTFOUND-001': 'error',
  'PLACEHOLDER-001': 'error', 'HEADERS-001': 'error', 'HEADERS-002': 'warning',
  'CSP-001': 'error', 'CSP-002': 'error', 'IMG-001': 'warning', 'CSS-001': 'warning', 'PERF-001': 'warning',
  'TRACKER-001': 'warning', 'LLMS-001': 'warning', 'REDIRECT-001': 'error', 'REDIRECT-002': 'error', 'MIXED-001': 'warning',
};
const LIVE_ONLY = new Set(['REDIRECT-001', 'REDIRECT-002']);
const INFO_ONLY = new Set(['JSONLD-006', 'JSONLD-007']);

// ---------------------------------------------------------------- 4.5.1 two faces per check

describe('two faces per check (spec 4.5 point 1)', () => {
  test('every id of spec 4.3 has a red case', () => {
    assert.equal(Object.keys(CHECKS).length, 45);
    assert.deepEqual(Object.keys(red).sort(), Object.keys(CHECKS).sort());
  });

  for (const [id, severity] of Object.entries(CHECKS)) {
    describe(id, () => {
      test(`fires as ${severity} on its red case`, async () => {
        const r = await red[id]();
        assert.ok(findings(r.json, id, severity).length > 0, `${id} (${severity}) not reported.\nFindings:\n${describeFindings(r.json)}`);
      });
      test('stays silent on the clean site', async () => {
        const r = LIVE_ONLY.has(id) ? await liveGood() : await cleanReport();
        const hits = INFO_ONLY.has(id) ? findings(r.json, id) : findings(r.json, id).filter((f) => f.severity !== 'info');
        assert.deepEqual(hits, [], `${id} is a false positive on the clean site`);
      });
    });
  }

  test('NOTFOUND-001 stays silent on the live clean site too', async () => {
    const r = await liveGood();
    assert.deepEqual(findings(r.json, 'NOTFOUND-001'), []);
  });
});

// ---------------------------------------------------------------- finer red cases

describe('check details', () => {
  test('SITEMAP-003 reports both the redirected and the missing <loc>', async () => {
    const r = await red['SITEMAP-003']();
    const text = JSON.stringify(findings(r.json, 'SITEMAP-003'));
    assert.match(text, /acme-widgets\.test\/about(?!\/)/, 'the /about (308) entry is not reported');
    assert.match(text, /missing\//, 'the /missing/ (404) entry is not reported');
  });

  test('CANON-001: two canonicals on one page is an error', async () => {
    const r = await distReport(
      variant('two-canonicals', (v) =>
        v.replace('about/index.html', '<link rel="icon"', `<link rel="canonical" href="${SITE}/about/team/">\n<link rel="icon"`),
      ),
    );
    assert.ok(findings(r.json, 'CANON-001', 'error').length > 0, describeFindings(r.json));
  });

  test("CSP-001: 'unsafe-eval' in script-src is an error", async () => {
    const r = await distReport(variant('unsafe-eval', (v) => v.replace('_headers', "script-src 'self'", "script-src 'self' 'unsafe-eval'")));
    assert.ok(findings(r.json, 'CSP-001', 'error').length > 0, describeFindings(r.json));
  });

  test('CSP-002: an inline script edited without updating its hash is an error', async () => {
    const r = await distReport(
      variant('stale-hash', (v) => v.replace('about/index.html', "classList.add('js');", "classList.add('js', 'ready');")),
    );
    assert.ok(findings(r.json, 'CSP-002', 'error').length > 0, describeFindings(r.json));
  });

  test('CSP-002 ignores application/ld+json blocks (data, not executed)', async () => {
    const r = await cleanReport();
    assert.deepEqual(findings(r.json, 'CSP-002'), []);
  });

  // Review 2, R2-1: a public page is any page discovered (sitemap or internal links) that answers 200,
  // indexable or not. A noindex legal page is public: its placeholder must block the launch too
  // (references/privacy-legal-fr.md promises it). Replaces the former "ignores non-indexable pages".
  test('PLACEHOLDER-001 also blocks a public noindex page ([à compléter] on /legal/): error, exit 1', async () => {
    const dir = variant('placeholder-on-noindex', (v) =>
      v.replace('legal/index.html', '</main>', '<p>Hébergeur : [à compléter]</p>\n</main>'),
    );
    const r = await distReport(dir);
    assert.ok(
      findings(r.json, 'PLACEHOLDER-001', 'error').some((f) => f.url === `${SITE}/legal/`),
      `PLACEHOLDER-001 not reported on the noindex /legal/ page.\n${describeFindings(r.json)}`,
    );
    assert.notEqual(r.code, 0, 'exit code');
  });

  test('PLACEHOLDER-001 ignores the 404 page (not a public page, spec 4.2)', async () => {
    const dir = variant('placeholder-on-404', (v) => v.replace('404.html', '</main>', '<p>TODO: a friendlier 404 text.</p>\n</main>'));
    const r = await distReport(dir);
    assert.deepEqual(findings(r.json, 'PLACEHOLDER-001'), [], describeFindings(r.json));
    assert.equal(r.code, 0);
  });

  test('--forbid adds a project-specific placeholder marker', async () => {
    const dir = variant('coming-soon', (v) => v.replace('about/index.html', '</main>', '<p>Coming soon: our team.</p>\n</main>'));
    const plain = await distReport(dir);
    assert.deepEqual(findings(plain.json, 'PLACEHOLDER-001'), [], '"Coming soon" is not a default marker');
    const custom = await distReport(dir, ['--forbid', 'Coming soon']);
    assert.ok(findings(custom.json, 'PLACEHOLDER-001', 'error').length > 0, describeFindings(custom.json));
  });

  test('--mode staging: noindex by X-Robots-Tag on every response and an open robots.txt is a valid staging', async () => {
    const dir = variant('staging-ok', (v) => v.replace('_headers', '  X-Frame-Options: DENY', '  X-Frame-Options: DENY\n  X-Robots-Tag: noindex'));
    const r = await distReport(dir, ['--mode', 'staging']);
    assert.deepEqual(idSet(r.json, 'error'), [], describeFindings(r.json));
    assert.deepEqual(findings(r.json, 'ROBOTS-006'), []);
    assert.equal(r.code, 0);
  });

  test('--mode launch: X-Robots-Tag: noindex on the home page is caught (tag and header combined)', async () => {
    const dir = variant('header-noindex', (v) => v.write('_headers', v.read('_headers') + '\n/\n  X-Robots-Tag: noindex\n'));
    const r = await distReport(dir);
    assert.ok(findings(r.json, 'INDEX-001', 'error').length > 0, describeFindings(r.json));
  });

  test('HTML reader: upper-case tags and unquoted attributes are read', async () => {
    const dir = variant('uppercase', (v) =>
      v.replace('about/index.html', `<link rel="canonical" href="${SITE}/about/">`, `<LINK REL=canonical HREF=${SITE}/about/>`),
    );
    const r = await distReport(dir);
    assert.deepEqual(idSet(r.json, 'error'), [], describeFindings(r.json));
    assert.deepEqual(findings(r.json, 'CANON-002').filter((f) => f.severity !== 'info'), []);
  });

  test('HTML reader: a canonical inside an HTML comment is ignored', async () => {
    const dir = variant('commented', (v) =>
      v.replace('about/index.html', '<link rel="icon"', '<!-- <link rel="canonical" href="http://localhost:4321/about/"> -->\n<link rel="icon"'),
    );
    const r = await distReport(dir);
    assert.deepEqual(findings(r.json, 'CANON-001'), [], describeFindings(r.json));
  });

  test('_headers rules add up: /blog/* CSP and /* nosniff both reach the article', async () => {
    const r = await fixtureReport['headers-perf']();
    const articleMissing = r.json.findings.filter(
      (f) => f.id === 'HEADERS-001' && f.severity === 'error' && (f.url ?? '').endsWith('/blog/first-widget/'),
    );
    assert.deepEqual(articleMissing, [], 'the article gets nosniff from /* and a CSP from /blog/*');
  });
});

// ---------------------------------------------------------------- contract amendments (docs/validation-contrat.md)

describe('contract amendments (validation of A1-A7)', () => {
  test('A3: an off-host <loc> is reported by SITEMAP-002, never fetched, never listed as a page', async () => {
    let hits = 0;
    const server = http.createServer((req, res) => {
      hits++;
      res.writeHead(200, { 'Content-Type': MIME['.html'] });
      res.end('<!doctype html><title>x</title>');
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    try {
      const dir = variant('off-host-loc', (v) =>
        v.replace('sitemap.xml', '</urlset>', `  <url>\n    <loc>http://127.0.0.1:${port}/x/</loc>\n    <lastmod>2026-09-18</lastmod>\n  </url>\n</urlset>`),
      );
      const r = await distReport(dir);
      assert.ok(findings(r.json, 'SITEMAP-002', 'error').length > 0, describeFindings(r.json));
      assert.equal(hits, 0, 'the off-host <loc> was fetched');
      assert.deepEqual(r.json.pages.filter((p) => p.url.includes('127.0.0.1')), [], 'the off-host <loc> is listed as a page');
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  test('A5: certificate verification is never disabled (untrusted certificate: exit 2)', async () => {
    const site = await liveSite();
    try {
      // spawn drops undefined values: this also neutralises a variable set on the machine
      const r = await run(site.args, { env: { NODE_EXTRA_CA_CERTS: undefined } });
      assert.equal(r.code, 2, `expected exit 2 with an untrusted certificate.\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
    } finally {
      await site.close();
    }
  });

  test('A7: in staging, a missing robots.txt or sitemap is not an error (ROBOTS-001, SITEMAP-001)', async () => {
    const dir = variant('staging-no-robots-no-sitemap', (v) => {
      v.replace('_headers', '  X-Frame-Options: DENY', '  X-Frame-Options: DENY\n  X-Robots-Tag: noindex');
      v.remove('robots.txt');
      v.remove('sitemap.xml');
    });
    const r = await distReport(dir, ['--mode', 'staging']);
    assert.deepEqual(idSet(r.json, 'error'), [], describeFindings(r.json));
    assert.equal(r.code, 0);
  });

  test('discovery: robots.txt Sitemap line -> sitemap-index.xml -> sitemap-0.xml (Astro layout)', async () => {
    const dir = variant('sitemap-index', (v) => {
      v.write('sitemap-0.xml', v.read('sitemap.xml'));
      v.remove('sitemap.xml');
      v.write(
        'sitemap-index.xml',
        `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <sitemap>\n    <loc>${SITE}/sitemap-0.xml</loc>\n  </sitemap>\n</sitemapindex>\n`,
      );
      v.replace('robots.txt', `Sitemap: ${SITE}/sitemap.xml`, `Sitemap: ${SITE}/sitemap-index.xml`);
    });
    const r = await distReport(dir);
    assert.deepEqual(idSet(r.json, 'error'), [], describeFindings(r.json));
    assert.deepEqual(idSet(r.json, 'warning'), [], describeFindings(r.json));
    assert.deepEqual(
      r.json.pages.map((p) => p.url),
      [`${SITE}/`, `${SITE}/about/`, `${SITE}/blog/first-widget/`, `${SITE}/legal/`],
    );
  });
});

// ---------------------------------------------------------------- review findings (docs/relecture.md I1, M8)

describe('review findings: TRACKER-001 storage paths, JSONLD-004 tolerance', () => {
  const ldBlock = (obj) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;
  const addToAboutHead = (name, html) => variant(name, (v) => v.replace('about/index.html', '</head>', `${html}\n</head>`));

  test('TRACKER-001: an inline script using sessionStorage is reported on its page', async () => {
    const dir = variant('tracker-inline', (v) =>
      v.replace('about/index.html', '</main>', "</main>\n<script>sessionStorage.setItem('visit', '1');</script>"),
    );
    const r = await distReport(dir);
    const hits = findings(r.json, 'TRACKER-001', 'warning');
    assert.ok(hits.some((f) => f.url === `${SITE}/about/`), `TRACKER-001 not reported on /about/.\n${describeFindings(r.json)}`);
  });

  test('TRACKER-001: a site script (/assets/*.js) using sessionStorage is reported on the script URL', async () => {
    const dir = variant('tracker-site-js', (v) => {
      v.write('assets/visit.js', "if (!sessionStorage.getItem('visit')) sessionStorage.setItem('visit', String(Date.now()));\n");
      v.replace('about/index.html', '</head>', '<script src="/assets/visit.js" defer></script>\n</head>');
    });
    const r = await distReport(dir);
    const hits = findings(r.json, 'TRACKER-001', 'warning');
    assert.ok(hits.some((f) => f.url === `${SITE}/assets/visit.js`), `TRACKER-001 not reported on /assets/visit.js.\n${describeFindings(r.json)}`);
  });

  test('TRACKER-001: localStorage in a site script and document.cookie inline are reported too', async () => {
    const dir = variant('tracker-local-cookie', (v) => {
      v.write('assets/prefs.js', "localStorage.setItem('theme', 'dark');\n");
      v.replace('about/index.html', '</head>', '<script src="/assets/prefs.js" defer></script>\n</head>');
      v.replace('blog/first-widget/index.html', '</main>', "</main>\n<script>document.cookie = 'seen=1; path=/';</script>");
    });
    const r = await distReport(dir);
    const urls = findings(r.json, 'TRACKER-001', 'warning').map((f) => f.url);
    assert.ok(urls.includes(`${SITE}/assets/prefs.js`), `localStorage in a site script not reported.\n${describeFindings(r.json)}`);
    assert.ok(urls.includes(`${SITE}/blog/first-widget/`), `document.cookie inline not reported.\n${describeFindings(r.json)}`);
  });

  test('JSONLD-004 tolerates third-party nested entities (author.url, citation.url on other hosts)', async () => {
    const dir = addToAboutHead(
      'jsonld-third-party',
      ldBlock({
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        '@id': `${SITE}/about/#page`,
        url: `${SITE}/about/`,
        author: { '@type': 'Person', name: 'Jane Roe', url: 'https://jane-roe.example/' },
        citation: { '@type': 'CreativeWork', url: 'https://www.w3.org/TR/html52/' },
      }),
    );
    const r = await distReport(dir);
    assert.deepEqual(findings(r.json, 'JSONLD-004'), [], describeFindings(r.json));
  });

  test('JSONLD-004 refuses an off-host url in a nested node whose @id is on the site', async () => {
    const dir = addToAboutHead(
      'jsonld-own-node-off-host',
      ldBlock({
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        '@id': `${SITE}/about/#page`,
        url: `${SITE}/about/`,
        author: { '@type': 'Person', '@id': `${SITE}/#jane`, name: 'Jane Roe', url: 'https://jane-roe.example/' },
      }),
    );
    const r = await distReport(dir);
    assert.ok(findings(r.json, 'JSONLD-004', 'error').length > 0, describeFindings(r.json));
  });

  test('JSONLD-004 still refuses a relative url inside a third-party nested node', async () => {
    const dir = addToAboutHead(
      'jsonld-third-party-relative',
      ldBlock({
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        '@id': `${SITE}/about/#page`,
        url: `${SITE}/about/`,
        author: { '@type': 'Person', name: 'Jane Roe', url: '/team/jane/' },
      }),
    );
    const r = await distReport(dir);
    assert.ok(findings(r.json, 'JSONLD-004', 'error').length > 0, describeFindings(r.json));
  });
});

// ---------------------------------------------------------------- DIST-001 (review 2, R2-2)

describe('DIST-001: _redirects is not applied in --dist mode (two faces)', () => {
  test('fires as info when dist/ has a _redirects file', async () => {
    const r = await distReport(variant('with-redirects', (v) => v.write('_redirects', '/old/ /about/ 301\n')));
    assert.ok(findings(r.json, 'DIST-001', 'info').length > 0, describeFindings(r.json));
    assert.equal(r.code, 0, 'an info never fails the run');
  });
  test('stays silent without _redirects (clean)', async () => {
    const r = await cleanReport();
    assert.deepEqual(findings(r.json, 'DIST-001'), []);
  });
});

// ---------------------------------------------------------------- 4.5.2 fixtures: exact errors

describe('fixtures: exact errors, expected warnings (spec 4.5 point 2)', () => {
  for (const name of ['clean', 'opening', 'schema-geo', 'headers-perf', 'privacy-fr']) {
    test(name, async () => {
      const expected = JSON.parse(readFileSync(join(FIXTURES, name, 'expected.json'), 'utf8'));
      const r = await fixtureReport[name]();
      const listing = describeFindings(r.json);
      assert.deepEqual(idSet(r.json, 'error'), [...expected.errors].sort(), `errors differ.\n${listing}`);
      const warnings = idSet(r.json, 'warning');
      for (const w of expected.warnings) assert.ok(warnings.includes(w), `expected warning ${w} missing.\n${listing}`);
      const allowed = new Set([...expected.warnings, ...expected.allowedWarnings]);
      assert.deepEqual(warnings.filter((w) => !allowed.has(w)), [], `unexpected warnings.\n${listing}`);
      const infos = idSet(r.json, 'info');
      for (const i of expected.infos) assert.ok(infos.includes(i), `expected info ${i} missing.\n${listing}`);
      assert.equal(r.code, expected.errors.length > 0 ? 1 : 0, 'exit code');
    });
  }

  function buildSource(name, env) {
    const dir = join(TMP, `source-${name}`);
    rmSync(dir, { recursive: true, force: true });
    cpSync(join(FIXTURES, 'source-project'), dir, { recursive: true, filter: (src) => !/[\\/]dist([\\/]|$)/.test(src) });
    const clean = { ...process.env };
    delete clean.SITE_URL;
    delete clean.PUBLIC_INDEXABLE;
    return new Promise((resolvePromise, reject) => {
      const child = spawn(process.execPath, ['build.mjs'], { cwd: dir, env: { ...clean, ...env } });
      child.on('close', (code) => (code === 0 ? resolvePromise(join(dir, 'dist')) : reject(new Error(`build failed (${code})`))));
    });
  }

  test('source-project built with SITE_URL=https://acme-widgets.test is clean', async () => {
    requireScript();
    const dist = await buildSource('https', { SITE_URL: SITE });
    const r = await distReport(dist);
    assert.deepEqual(idSet(r.json, 'error'), [], describeFindings(r.json));
    assert.deepEqual(idSet(r.json, 'warning'), [], describeFindings(r.json));
  });

  test('source-project built with the defaults ships localhost canonicals (CANON-001)', async () => {
    requireScript();
    const dist = await buildSource('default', {});
    const r = await distReport(dist);
    assert.ok(findings(r.json, 'CANON-001', 'error').length > 0, describeFindings(r.json));
  });
});

// ---------------------------------------------------------------- 4.5.4 live mode

describe('live mode (spec 4.5 point 4)', () => {
  test('correct redirects, HSTS and real 404: no error, no warning, exit 0', async () => {
    const r = await liveGood();
    assert.deepEqual(idSet(r.json, 'error'), [], describeFindings(r.json));
    assert.deepEqual(idSet(r.json, 'warning'), [], describeFindings(r.json));
    assert.equal(r.code, 0);
    assert.equal(r.json.input.kind, 'url');
  });

  test('302 instead of 301/308 for http -> https is REDIRECT-001', async () => {
    const r = await red['REDIRECT-001']();
    assert.ok(findings(r.json, 'REDIRECT-001', 'error').length > 0, describeFindings(r.json));
    assert.equal(r.code, 1);
  });

  test('www -> apex that loses the query string is REDIRECT-002', async () => {
    const r = await red['REDIRECT-002']();
    assert.ok(findings(r.json, 'REDIRECT-002', 'error').length > 0, describeFindings(r.json));
  });

  test('a chain of two redirects (www -> http apex -> https apex) is REDIRECT-002', async () => {
    const r = await liveReport({ www: 'chain' });
    assert.ok(findings(r.json, 'REDIRECT-002', 'error').length > 0, describeFindings(r.json));
  });

  test('soft 404 is NOTFOUND-001', async () => {
    const r = await red['NOTFOUND-001']();
    assert.ok(findings(r.json, 'NOTFOUND-001', 'error').length > 0, describeFindings(r.json));
  });

  test('missing Strict-Transport-Security online is a HEADERS-001 warning', async () => {
    const r = await liveReport({ hsts: false });
    assert.ok(findings(r.json, 'HEADERS-001', 'warning').length > 0, describeFindings(r.json));
    assert.deepEqual(idSet(r.json, 'error'), [], describeFindings(r.json));
  });
});

// ---------------------------------------------------------------- 4.4 output and 4.5.5 exit codes

describe('exit codes (spec 4.4, 4.5 point 5)', () => {
  test('0 on the clean site', async () => {
    assert.equal((await run(['--dist', CLEAN, '--site', SITE])).code, 0);
  });
  test('1 when there is at least one error', async () => {
    assert.equal((await run(['--dist', join(FIXTURES, 'opening', 'dist'), '--site', SITE])).code, 1);
  });
  test('warnings alone: 0, and 1 with --strict', async () => {
    const dist = join(FIXTURES, 'privacy-fr', 'dist');
    assert.equal((await run(['--dist', dist, '--site', SITE])).code, 0);
    assert.equal((await run(['--dist', dist, '--site', SITE, '--strict'])).code, 1);
  });
  test('2 without arguments', async () => {
    assert.equal((await run([])).code, 2);
  });
  test('2 on an unknown option', async () => {
    assert.equal((await run(['--dist', CLEAN, '--site', SITE, '--bogus'])).code, 2);
  });
  test('2 when --dist has no --site', async () => {
    assert.equal((await run(['--dist', CLEAN])).code, 2);
  });
  test('2 when the --dist folder does not exist', async () => {
    assert.equal((await run(['--dist', join(TMP, 'does-not-exist'), '--site', SITE])).code, 2);
  });
  test('2 when the --url origin is unreachable', async () => {
    assert.equal((await run(['--url', 'http://127.0.0.1:1'], { timeoutMs: 60_000 })).code, 2);
  });
});

describe('JSON report (spec 4.4)', () => {
  test('shape: tool, version, input, pages, findings, summary', async () => {
    const { json } = await fixtureReport.opening();
    assert.equal(json.tool, 'check-site');
    assert.match(json.version, /^\d+\.\d+\.\d+$/);
    assert.equal(json.input.kind, 'dist');
    assert.equal(json.input.site, SITE);
    assert.equal(json.input.mode, 'launch');
    assert.ok(Array.isArray(json.pages) && json.pages.length > 0);
    assert.ok(Array.isArray(json.findings) && json.findings.length > 0);
    for (const f of json.findings) {
      assert.match(f.id, /^[A-Z]+-\d{3}$/, `bad id ${f.id}`);
      assert.ok(SEVERITIES.includes(f.severity), `bad severity ${f.severity}`);
      assert.ok(f.url === null || typeof f.url === 'string', 'url is a string or null');
      assert.ok(typeof f.message === 'string' && f.message.length > 0, `${f.id}: empty message`);
    }
    const count = (s) => json.findings.filter((f) => f.severity === s).length;
    assert.deepEqual(json.summary, { errors: count('error'), warnings: count('warning'), infos: count('info'), pages: json.pages.length });
  });

  test('pages of the clean site: the four discovered pages, 200, indexable flag, canonical', async () => {
    const { json } = await cleanReport();
    assert.deepEqual(
      json.pages.map((p) => p.url),
      [`${SITE}/`, `${SITE}/about/`, `${SITE}/blog/first-widget/`, `${SITE}/legal/`],
    );
    for (const p of json.pages) {
      assert.equal(p.status, 200, p.url);
      assert.equal(p.indexable, !p.url.endsWith('/legal/'), p.url);
      assert.equal(p.canonical, p.url, p.url);
    }
  });

  test('dist mode rewrites URLs on --site: no local address in the report', async () => {
    for (const name of ['clean', 'opening']) {
      const { json, jsonText } = await fixtureReport[name]();
      assert.ok(!jsonText.includes('127.0.0.1'), `${name}: the local server address leaks into the report`);
      for (const p of json.pages) assert.ok(p.url.startsWith(`${SITE}/`), p.url);
    }
  });

  test('pages sorted by URL, findings by URL then id', async () => {
    const { json } = await fixtureReport['schema-geo']();
    const urls = json.pages.map((p) => p.url);
    assert.deepEqual(urls, [...urls].sort());
    const keys = json.findings.map((f) => `${f.url ?? ''}\u0000${f.id}`);
    assert.deepEqual(keys, [...keys].sort());
  });

  test('deterministic: two runs give byte-identical JSON', async () => {
    const a = await distReport(join(FIXTURES, 'opening', 'dist'));
    const b = await distReport(join(FIXTURES, 'opening', 'dist'));
    assert.equal(a.jsonText, b.jsonText);
  });

  test('the opening home page is reported non-indexable', async () => {
    const { json } = await fixtureReport.opening();
    const home = json.pages.find((p) => p.url === `${SITE}/`);
    assert.ok(home, 'home page missing from pages');
    assert.equal(home.indexable, false);
  });
});

describe('text output (spec 4.4)', () => {
  test('one line per finding, grouped by severity, then the summary line', async () => {
    const { stdout, json } = await fixtureReport['schema-geo']();
    const lines = stdout.split(/\r?\n/);
    const findingLines = lines.filter((l) => /^[EWI] [A-Z]+-\d{3} /.test(l));
    assert.equal(findingLines.length, json.findings.length, 'one text line per JSON finding');
    const order = findingLines.map((l) => 'EWI'.indexOf(l[0]));
    assert.deepEqual(order, [...order].sort((x, y) => x - y), 'errors first, then warnings, then infos');
    for (const f of json.findings) {
      assert.ok(findingLines.some((l) => l.startsWith(`${f.severity[0].toUpperCase()} ${f.id} `)), `no text line for ${f.id}`);
    }
    // the duration may follow on the same line (spec 4.1)
    const m = stdout.match(/^(\d+) errors?, (\d+) warnings?, (\d+) infos? — (\d+) pages?\b/m);
    assert.ok(m, `summary line not found in:\n${stdout}`);
    assert.deepEqual(m.slice(1).map(Number), [json.summary.errors, json.summary.warnings, json.summary.infos, json.summary.pages]);
  });

  test('a finding line names the page path and the evidence (spec example)', async () => {
    const { stdout } = await fixtureReport.opening();
    assert.match(stdout, /^E CANON-001 \/about\/ .*localhost:4321/m);
  });
});

// ---------------------------------------------------------------- 4.5.3 unit tests

const mod = memo(async () => {
  requireScript();
  return import(pathToFileURL(SCRIPT).href);
});

describe('module (spec 4.1)', () => {
  test('importing does not run an analysis and exposes the unit functions', async () => {
    const m = await mod();
    for (const name of ['isAllowed', 'parseHeadersFile', 'headersFor', 'imageSize', 'cspHash']) {
      assert.equal(typeof m[name], 'function', `export ${name} missing`);
    }
  });
});

describe('robots.txt evaluation, Google rules (spec 4.5 point 3)', () => {
  const cases = [
    ['most specific group wins', 'User-agent: *\nDisallow: /\n\nUser-agent: Googlebot\nAllow: /\n', 'Googlebot', '/', true],
    ['most specific group wins (others)', 'User-agent: *\nDisallow: /\n\nUser-agent: Googlebot\nAllow: /\n', 'OtherBot', '/', false],
    ['user-agent match is case-insensitive', 'user-agent: googlebot\ndisallow: /private/\n', 'Googlebot', '/private/x', false],
    ['longest rule wins (allow)', 'User-agent: *\nDisallow: /a\nAllow: /a/b\n', 'Bot', '/a/b/c', true],
    ['longest rule wins (disallow)', 'User-agent: *\nDisallow: /a\nAllow: /a/b\n', 'Bot', '/a/x', false],
    ['allow wins a tie', 'User-agent: *\nDisallow: /page\nAllow: /page\n', 'Bot', '/page', true],
    ['* wildcard', 'User-agent: *\nDisallow: /*.pdf\n', 'Bot', '/docs/x.pdf', false],
    ['* wildcard (no match)', 'User-agent: *\nDisallow: /*.pdf\n', 'Bot', '/docs/x.html', true],
    ['$ end anchor', 'User-agent: *\nDisallow: /*.php$\n', 'Bot', '/index.php', false],
    ['$ end anchor (query string)', 'User-agent: *\nDisallow: /*.php$\n', 'Bot', '/index.php?x=1', true],
    ['no group for the agent: allowed', 'User-agent: Googlebot\nDisallow: /\n', 'OtherBot', '/', true],
    ['empty file: allowed', '', 'Bot', '/', true],
    ['empty Disallow: allowed', 'User-agent: *\nDisallow:\n', 'Bot', '/x', true],
    ['several user-agent lines share a group', 'User-agent: a\nUser-agent: b\nDisallow: /\n', 'b', '/', false],
    ['groups of the same agent are merged', 'User-agent: *\nAllow: /\n\nUser-agent: *\nDisallow: /private/\n', 'Bot', '/private/x', false],
    ['comments are ignored', '# Disallow: /\nUser-agent: * # all\nAllow: / # open\n', 'Bot', '/', true],
  ];
  for (const [name, txt, ua, path, expected] of cases) {
    test(name, async () => {
      const { isAllowed } = await mod();
      assert.equal(isAllowed(txt, ua, path), expected);
    });
  }
  test('Cloudflare managed block: OAI-SearchBot is blocked, Googlebot is not', async () => {
    const { isAllowed } = await mod();
    const txt = readFileSync(join(FIXTURES, 'schema-geo', 'dist', 'robots.txt'), 'utf8');
    assert.equal(isAllowed(txt, 'OAI-SearchBot', '/'), false);
    assert.equal(isAllowed(txt, 'Googlebot', '/'), true);
  });
});

describe('_headers (spec 4.5 point 3)', () => {
  const text = [
    '# comment',
    '/*',
    '  X-Frame-Options: DENY',
    '  Content-Security-Policy: default-src \'self\'',
    '',
    '/blog/*',
    '  Content-Security-Policy: frame-ancestors \'none\'',
    '',
    '/embed/*',
    '  ! X-Frame-Options',
    '',
    '/about/',
    '  X-Page: about',
    '',
  ].join('\n');

  test('/* applies everywhere', async () => {
    const { parseHeadersFile, headersFor } = await mod();
    assert.equal(headersFor(parseHeadersFile(text), '/x/')['x-frame-options'], 'DENY');
  });
  test('a path wildcard only matches below its prefix', async () => {
    const { parseHeadersFile, headersFor } = await mod();
    const rules = parseHeadersFile(text);
    assert.match(headersFor(rules, '/blog/a/')['content-security-policy'], /frame-ancestors/);
    assert.doesNotMatch(headersFor(rules, '/about/')['content-security-policy'], /frame-ancestors/);
  });
  test('matching rules add up (two CSP values)', async () => {
    const { parseHeadersFile, headersFor } = await mod();
    const csp = headersFor(parseHeadersFile(text), '/blog/a/')['content-security-policy'];
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /frame-ancestors 'none'/);
  });
  test('"! Name" detaches a header set by a broader rule', async () => {
    const { parseHeadersFile, headersFor } = await mod();
    assert.equal(headersFor(parseHeadersFile(text), '/embed/x/')['x-frame-options'], undefined);
  });
  test('an exact path matches only itself', async () => {
    const { parseHeadersFile, headersFor } = await mod();
    const rules = parseHeadersFile(text);
    assert.equal(headersFor(rules, '/about/')['x-page'], 'about');
    assert.equal(headersFor(rules, '/about/team/')['x-page'], undefined);
  });
});

describe('image dimensions (spec 4.5 point 3)', () => {
  const riff = (fourcc, payload) => {
    const chunk = Buffer.concat([Buffer.from(fourcc, 'ascii'), Buffer.alloc(4), payload]);
    chunk.writeUInt32LE(payload.length, 4);
    const head = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]);
    head.writeUInt32LE(4 + chunk.length, 4);
    return Buffer.concat([head, chunk]);
  };
  const jpeg = (sof) =>
    Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
      0xff, sof, 0x00, 0x11, 0x08, 0x00, 0x96, 0x01, 0x2c, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
      0xff, 0xd9,
    ]);
  const cases = [
    ['PNG logo', () => readFileSync(join(CLEAN, 'assets', 'logo.png')), { width: 512, height: 512, format: 'png' }],
    ['PNG og image', () => readFileSync(join(CLEAN, 'assets', 'og.png')), { width: 1200, height: 630, format: 'png' }],
    ['JPEG baseline (SOF0)', () => jpeg(0xc0), { width: 300, height: 150, format: 'jpeg' }],
    ['JPEG progressive (SOF2)', () => jpeg(0xc2), { width: 300, height: 150, format: 'jpeg' }],
    ['WebP VP8X', () => riff('VP8X', Buffer.from([0x00, 0, 0, 0, 0x8f, 0x01, 0x00, 0x2b, 0x01, 0x00])), { width: 400, height: 300, format: 'webp' }],
    ['WebP VP8L', () => riff('VP8L', Buffer.from([0x2f, 0x77, 0xc0, 0x13, 0x00])), { width: 120, height: 80, format: 'webp' }],
    ['WebP VP8', () => riff('VP8 ', Buffer.from([0x50, 0x01, 0x00, 0x9d, 0x01, 0x2a, 0x80, 0x02, 0xe0, 0x01])), { width: 640, height: 480, format: 'webp' }],
  ];
  for (const [name, buf, expected] of cases) {
    test(name, async () => {
      const { imageSize } = await mod();
      assert.deepEqual(imageSize(buf()), expected);
    });
  }
  test('SVG or unknown bytes: null', async () => {
    const { imageSize } = await mod();
    assert.equal(imageSize(readFileSync(join(CLEAN, 'favicon.svg'))), null);
    assert.equal(imageSize(Buffer.from('not an image')), null);
  });
});

describe('CSP hash (spec 4.5 point 3)', () => {
  test('sha256 of the exact script text, base64, prefixed', async () => {
    const { cspHash } = await mod();
    const js = "document.documentElement.classList.add('js');";
    const expected = 'sha256-' + createHash('sha256').update(js).digest('base64');
    assert.equal(cspHash(js), expected);
    assert.ok(readFileSync(join(CLEAN, '_headers'), 'utf8').includes(expected), 'the clean fixture CSP carries this hash');
  });
  test('whitespace counts', async () => {
    const { cspHash } = await mod();
    assert.notEqual(cspHash('alert(1)'), cspHash(' alert(1)'));
  });
});
