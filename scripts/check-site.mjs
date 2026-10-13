#!/usr/bin/env node
// check-site: deterministic launch checks for a static site, before deployment (--dist) or online (--url).
// Node >= 20, zero dependency. Contract: docs/spec.md section 4 (checks 4.3, output 4.4).
//
//   node scripts/check-site.mjs --dist dist --site https://example.com [--mode launch|staging]
//   node scripts/check-site.mjs --url https://example.com --domain example.com
//
// Options: --mode launch|staging, --path <p> (repeatable), --forbid <regex> (repeatable),
// --max-pages <n>, --json <file>, --strict, --connect-to HOST:PORT:CONNECT-HOST:CONNECT-PORT (repeatable, tests).
// Exit codes: 0 no error (no warning either with --strict), 1 at least one error, 2 invalid usage,
// missing folder or unreachable origin (an untrusted TLS certificate counts as unreachable).
//
// Importing this module runs nothing: the unit functions below are exported for the tests.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { extname, join, relative, resolve, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

export const VERSION = '1.0.0';

// ---------------------------------------------------------------- constants (each one justified)

// Truncation conventions of result pages, not Google rules: Google sets no length limit on titles
// (https://developers.google.com/search/docs/appearance/title-link) nor on descriptions
// (https://developers.google.com/search/docs/appearance/snippet). Warnings only.
const TITLE_MAX = 60;
const DESCRIPTION_MIN = 50;
const DESCRIPTION_MAX = 160;
// Crawl bound: enough for a marketing site; the test fixtures have fewer than 10 pages.
const MAX_PAGES_DEFAULT = 200;
// Per-request timeout and parallelism: polite to a live origin, fast on a local folder.
const TIMEOUT_MS = 10_000;
const CONCURRENCY = 4;
// Body cap: Google reads at most 500 KiB of robots.txt; HTML pages of a static site stay far below 5 MiB.
const MAX_BODY_BYTES = 5 * 1024 * 1024;
// Organization logo: at least 112 x 112 px (https://developers.google.com/search/docs/appearance/structured-data/organization).
const LOGO_MIN_PX = 112;
// Fixed path for the soft-404 probe: fixed so that two runs give the same report.
const PROBE_PATH = '/__check-site-404-5f0c2b7e/';
// Default placeholder markers (spec G1); --forbid adds project-specific ones.
const DEFAULT_MARKERS = [/lorem ipsum/i, /\bTODO\b/, /\bTBD\b/, /\[placeholder\]/i, /\[à compléter\]/i];
// AI crawlers that make a site cited in answers (search / user retrieval) versus training crawlers.
// Tokens from https://developers.openai.com/api/docs/bots and https://support.claude.com/en/articles/8896518;
// PerplexityBot as named by the spec.
const AI_SEARCH_BOTS = ['OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot'];
const AI_TRAINING_BOTS = ['GPTBot', 'ClaudeBot', 'CCBot', 'Google-Extended', 'Applebot-Extended', 'Bytespider', 'meta-externalagent', 'Amazonbot'];
const TRACKER_HOSTS = /clarity\.ms|googletagmanager\.com|google-analytics\.com|posthog|plausible|matomo/i;
const STORAGE_API = /\b(document\.cookie|localStorage|sessionStorage)\b/;

// ---------------------------------------------------------------- unit functions (exported)

/** sha256 CSP source of an inline script, exact text (whitespace counts). */
export function cspHash(scriptText, algorithm = 'sha256') {
  return `${algorithm}-${createHash(algorithm).update(scriptText, 'utf8').digest('base64')}`;
}

/** Width, height and format of a PNG, JPEG or WebP image; null for anything else (SVG included). */
export function imageSize(buffer) {
  const b = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a && b.toString('ascii', 12, 16) === 'IHDR') {
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), format: 'png' };
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 3 < b.length) {
      if (b[i] !== 0xff) return null;
      let marker = b[i + 1];
      while (marker === 0xff && i + 2 < b.length) marker = b[++i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      if (marker === 0xd9 || marker === 0xda) return null;
      const len = b.readUInt16BE(i + 2);
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof && i + 8 < b.length) return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5), format: 'jpeg' };
      i += 2 + len;
    }
    return null;
  }
  if (b.length >= 25 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = b.toString('ascii', 12, 16);
    if (chunk === 'VP8X' && b.length >= 30) return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3), format: 'webp' };
    if (chunk === 'VP8L' && b[20] === 0x2f) {
      const bits = b.readUInt32LE(21);
      return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff), format: 'webp' };
    }
    if (chunk === 'VP8 ' && b.length >= 30 && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) {
      return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff, format: 'webp' };
    }
  }
  return null;
}

/** Groups of a robots.txt: [{ agents: [lower-case tokens], rules: [{ allow, pattern }] }]. */
function parseRobots(text) {
  const groups = [];
  let current = null;
  let lastWasAgent = false;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'user-agent') {
      if (!lastWasAgent || !current) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (key === 'allow' || key === 'disallow') {
      lastWasAgent = false;
      if (current && value !== '') current.rules.push({ allow: key === 'allow', pattern: value });
    } else {
      lastWasAgent = false; // sitemap, content-signal, crawl-delay...: do not end the group
    }
  }
  return groups;
}

function robotsPatternMatches(pattern, path) {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const re = body.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${re}${anchored ? '$' : ''}`).test(path);
}

/**
 * robots.txt evaluated as Google does: the group of the agent (exact token, case-insensitive) or else
 * the * group, groups of the same agent merged, longest matching rule wins, Allow wins a tie, * and $.
 * Source: https://developers.google.com/search/docs/crawling-indexing/robots/robots_txt
 */
export function isAllowed(robotsTxt, userAgent, path) {
  const groups = parseRobots(robotsTxt);
  const ua = String(userAgent).toLowerCase();
  let rules = groups.filter((g) => g.agents.includes(ua)).flatMap((g) => g.rules);
  if (!groups.some((g) => g.agents.includes(ua))) rules = groups.filter((g) => g.agents.includes('*')).flatMap((g) => g.rules);
  let best = null;
  for (const r of rules) {
    if (!robotsPatternMatches(r.pattern, path)) continue;
    if (!best || r.pattern.length > best.pattern.length || (r.pattern.length === best.pattern.length && r.allow)) best = r;
  }
  return best ? best.allow : true;
}

/** Cloudflare _headers file: [{ pattern, set: [[name, value]], detach: [lower-case names] }]. */
export function parseHeadersFile(text) {
  const rules = [];
  let current = null;
  for (const raw of String(text).split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    if (!/^\s/.test(raw)) {
      current = { pattern: raw.trim(), set: [], detach: [] };
      rules.push(current);
      continue;
    }
    if (!current) continue;
    const line = raw.trim();
    const detach = line.match(/^!\s*([^\s:]+)/);
    if (detach) {
      current.detach.push(detach[1].toLowerCase());
      continue;
    }
    const m = line.match(/^([^:\s]+)\s*:\s*(.*)$/);
    if (m) current.set.push([m[1].toLowerCase(), m[2].trim()]);
  }
  return rules;
}

function headerPatternMatches(pattern, path) {
  let p = pattern;
  const abs = p.match(/^https?:\/\/[^/]+(\/.*)$/);
  if (abs) p = abs[1];
  if (!p.startsWith('/')) return false;
  const re = p
    .split(/(\*|:[A-Za-z]\w*)/)
    .map((part) => (part === '*' ? '.*' : /^:[A-Za-z]\w*$/.test(part) ? '[^/]+' : part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')))
    .join('');
  return new RegExp(`^${re}$`).test(path);
}

/** Headers that the matching _headers rules give a path: values of a repeated header joined with ", ". */
export function headersFor(rules, path) {
  const out = {};
  const detached = new Set();
  for (const rule of rules) {
    if (!headerPatternMatches(rule.pattern, path)) continue;
    for (const [name, value] of rule.set) out[name] = name in out ? `${out[name]}, ${value}` : value;
    for (const name of rule.detach) detached.add(name);
  }
  for (const name of detached) delete out[name];
  return out;
}

// ---------------------------------------------------------------- HTML reader

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : all;
    }
    return ENTITIES[e.toLowerCase()] ?? all;
  });
}

const RAW_TEXT = new Set(['script', 'style', 'title', 'textarea', 'noscript', 'template']);

/** Small tag reader: elements with attributes (comments skipped), raw text of script/style/title, visible text. */
export function parseHtml(html) {
  const elements = [];
  const text = [];
  let inHead = false;
  let i = 0;
  const attrName = /[^\s"'>/=]+/y;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) {
      if (!inHead) text.push(html.slice(i));
      break;
    }
    if (lt > i && !inHead) text.push(html.slice(i, lt));
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      i = end === -1 ? html.length : end + 3;
      continue;
    }
    if (html[lt + 1] === '!' || html[lt + 1] === '?') {
      const end = html.indexOf('>', lt);
      i = end === -1 ? html.length : end + 1;
      continue;
    }
    if (html[lt + 1] === '/') {
      const m = /^<\/([A-Za-z][\w:-]*)[^>]*>/.exec(html.slice(lt, lt + 256));
      if (m) {
        if (m[1].toLowerCase() === 'head') inHead = false;
        i = lt + m[0].length;
      } else i = lt + 1;
      continue;
    }
    const nm = /^<([A-Za-z][\w:-]*)/.exec(html.slice(lt, lt + 128));
    if (!nm) {
      if (!inHead) text.push('<');
      i = lt + 1;
      continue;
    }
    const name = nm[1].toLowerCase();
    let j = lt + nm[0].length;
    const attrs = {};
    while (j < html.length) {
      while (j < html.length && /[\s/]/.test(html[j])) j++;
      if (j >= html.length) break;
      if (html[j] === '>') {
        j++;
        break;
      }
      attrName.lastIndex = j;
      const an = attrName.exec(html);
      if (!an) {
        j++;
        continue;
      }
      const key = an[0].toLowerCase();
      j = attrName.lastIndex;
      let k = j;
      while (k < html.length && /\s/.test(html[k])) k++;
      let value = '';
      if (html[k] === '=') {
        k++;
        while (k < html.length && /\s/.test(html[k])) k++;
        const q = html[k];
        if (q === '"' || q === "'") {
          const end = html.indexOf(q, k + 1);
          value = html.slice(k + 1, end === -1 ? html.length : end);
          j = end === -1 ? html.length : end + 1;
        } else {
          const m = /[^\s>]*/y;
          m.lastIndex = k;
          value = m.exec(html)[0];
          j = m.lastIndex;
        }
      }
      if (!(key in attrs)) attrs[key] = decodeEntities(value);
    }
    const el = { name, attrs, inHead };
    if (name === 'head') inHead = true;
    if (name === 'body') {
      inHead = false;
      el.inHead = false;
    }
    if (RAW_TEXT.has(name)) {
      const close = new RegExp(`</${name}[\\s>/]`, 'ig');
      close.lastIndex = j;
      const m = close.exec(html);
      const end = m ? m.index : html.length;
      el.text = html.slice(j, end);
      const gt = m ? html.indexOf('>', end) : -1;
      i = gt === -1 ? html.length : gt + 1;
    } else i = j;
    elements.push(el);
  }
  const visible = decodeEntities(text.join(' ')).replace(/\s+/g, ' ').trim();
  return { elements, text: visible };
}

// ---------------------------------------------------------------- small helpers

const sortStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const oneLine = (s) => String(s).replace(/\s+/g, ' ').trim();
const relTokens = (el) => (el.attrs.rel ?? '').toLowerCase().split(/\s+/).filter(Boolean);
const isLocalHost = (hostname) => /^(localhost|127(\.\d+){3}|\[::1\]|0\.0\.0\.0)$/i.test(hostname) || /\.localhost$/i.test(hostname);
function tryUrl(value, base) {
  try {
    return base === undefined ? new URL(value) : new URL(value, base);
  } catch {
    return null;
  }
}
const isAbsoluteHttp = (s) => /^https?:\/\//i.test(String(s).trim());
const pageKey = (u) => `${u.origin}${u.pathname}`;
const EXECUTABLE_TYPE = /^((text|application)\/(x-)?(java|ecma)script|module)$/i;
const isExecutableScript = (el) => {
  const t = (el.attrs.type ?? '').trim().split(';')[0].trim();
  return t === '' || EXECUTABLE_TYPE.test(t);
};
const ORG_TYPE = /^(Organization|Corporation|LocalBusiness|OnlineBusiness|OnlineStore|NGO|NewsMediaOrganization|EducationalOrganization)$/;
const ARTICLE_TYPE = /^(Article|BlogPosting|NewsArticle|TechArticle|ScholarlyArticle|Report)$/;
const APP_TYPE = /^(SoftwareApplication|MobileApplication|WebApplication|VideoGame|Product)$/;
function typesOf(node) {
  const t = node?.['@type'];
  return (Array.isArray(t) ? t : [t]).filter((x) => typeof x === 'string');
}
/** Block roots and @graph items: the entities a page declares. */
function topNodes(data) {
  const roots = (Array.isArray(data) ? data : [data]).filter((d) => d && typeof d === 'object');
  return roots.flatMap((d) => (Array.isArray(d['@graph']) ? [d, ...d['@graph'].filter((g) => g && typeof g === 'object')] : [d]));
}
function* allNodes(value) {
  if (Array.isArray(value)) for (const v of value) yield* allNodes(v);
  else if (value && typeof value === 'object') {
    yield value;
    for (const v of Object.values(value)) yield* allNodes(v);
  }
}
const contextOk = (c) =>
  typeof c === 'string'
    ? /^https?:\/\/schema\.org\/?$/i.test(c)
    : Array.isArray(c)
      ? c.some(contextOk)
      : c && typeof c === 'object'
        ? contextOk(c['@vocab'] ?? '')
        : false;

function cspPolicies(value) {
  return String(value ?? '')
    .split(',')
    .map((p) => {
      const map = new Map();
      for (const d of p.split(';')) {
        const parts = d.trim().split(/\s+/).filter(Boolean);
        if (parts.length && !map.has(parts[0].toLowerCase())) map.set(parts[0].toLowerCase(), parts.slice(1));
      }
      return map;
    })
    .filter((m) => m.size > 0);
}
const scriptDirective = (policy) => policy.get('script-src-elem') ?? policy.get('script-src') ?? policy.get('default-src') ?? null;

function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const k = next++;
      out[k] = await fn(items[k]);
    }
  };
  return Promise.all(Array.from({ length: Math.min(n, items.length) }, worker)).then(() => out);
}

// ---------------------------------------------------------------- fetchers

const MIME = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.pdf': 'application/pdf',
};

/**
 * Serves a dist/ folder in process, with the semantics of a static host (Cloudflare-style): /x/ -> x/index.html,
 * /x -> x.html or 308 to /x/, else 404 with the body of 404.html; _headers applied, _headers/_redirects not served.
 */
function distFetcher(root, siteHost) {
  const rules = existsSync(join(root, '_headers')) ? parseHeadersFile(readFileSync(join(root, '_headers'), 'utf8')) : [];
  const fileAt = (p) => {
    const f = resolve(root, `.${p}`);
    const rel = relative(root, f);
    if (rel.startsWith('..') || isAbsolute(rel)) return null;
    return existsSync(f) && statSync(f).isFile() ? f : null;
  };
  return async (url) => {
    const u = new URL(url);
    if (u.host !== siteHost) return { status: 0, headers: {}, body: Buffer.alloc(0), error: 'off-host request refused' };
    let path;
    try {
      path = decodeURIComponent(u.pathname);
    } catch {
      path = u.pathname;
    }
    const respond = (status, file, extra = {}) => ({
      status,
      headers: { 'content-type': file ? (MIME[extname(file).toLowerCase()] ?? 'application/octet-stream') : 'text/html; charset=utf-8', ...headersFor(rules, u.pathname), ...extra },
      body: file ? readFileSync(file) : Buffer.alloc(0),
    });
    const hidden = /(^|\/)_(headers|redirects|routes\.json)$/.test(path);
    if (!hidden) {
      if (path.endsWith('/')) {
        const f = fileAt(`${path}index.html`);
        if (f) return respond(200, f);
      } else {
        const f = fileAt(path) ?? fileAt(`${path}.html`);
        if (f) return respond(200, f);
        if (fileAt(`${path}/index.html`)) return respond(308, null, { location: `${path}/${u.search}` });
      }
    }
    const notFound = fileAt('/404.html');
    const r = respond(404, notFound);
    if (!notFound) r.headers['content-type'] = 'text/html; charset=utf-8';
    return r;
  };
}

/** Live fetcher: no redirect following, TLS always verified, --connect-to like curl. */
function liveFetcher(connectTo) {
  return (url) =>
    new Promise((resolvePromise) => {
      const u = new URL(url);
      const secure = u.protocol === 'https:';
      const port = Number(u.port || (secure ? 443 : 80));
      const target = connectTo.get(`${u.hostname.toLowerCase()}:${port}`);
      const opts = {
        method: 'GET',
        host: target?.host ?? u.hostname,
        port: target?.port ?? port,
        path: `${u.pathname}${u.search}`,
        headers: { host: u.host, 'user-agent': `check-site/${VERSION}`, accept: '*/*' },
        agent: false,
        timeout: TIMEOUT_MS,
      };
      if (secure && !isIP(u.hostname)) opts.servername = u.hostname;
      const req = (secure ? https : http).request(opts, (res) => {
        const chunks = [];
        let size = 0;
        res.on('data', (c) => {
          size += c.length;
          if (size <= MAX_BODY_BYTES) chunks.push(c);
        });
        res.on('end', () => {
          const headers = {};
          for (const [k, v] of Object.entries(res.headers)) headers[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v);
          resolvePromise({ status: res.statusCode ?? 0, headers, body: Buffer.concat(chunks) });
        });
        res.on('error', (e) => resolvePromise({ status: 0, headers: {}, body: Buffer.alloc(0), error: e.code ?? e.message }));
      });
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', (e) => resolvePromise({ status: 0, headers: {}, body: Buffer.alloc(0), error: e.code ?? e.message }));
      req.end();
    });
}

// ---------------------------------------------------------------- page model

function readPage(url, res) {
  const html = res.body.toString('utf8');
  const { elements, text } = parseHtml(html);
  const by = (name) => elements.filter((e) => e.name === name);
  const metas = by('meta');
  const metaName = (n) => metas.filter((m) => (m.attrs.name ?? '').toLowerCase() === n).map((m) => m.attrs.content ?? '');
  const metaProp = (p) => metas.filter((m) => (m.attrs.property ?? '').toLowerCase() === p).map((m) => m.attrs.content ?? '');
  const links = by('link');
  const robotsMeta = [...metaName('robots'), ...metaName('googlebot')].join(', ').toLowerCase();
  const xRobots = (res.headers['x-robots-tag'] ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => {
      const ua = s.match(/^([a-z0-9_-]+)\s*:\s*\S/);
      return !ua || ['googlebot', 'unavailable_after', 'max-snippet', 'max-image-preview', 'max-video-preview'].includes(ua[1]);
    })
    .join(', ');
  const noindex = /\b(noindex|none)\b/.test(robotsMeta) || /\b(noindex|none)\b/.test(xRobots);
  const canonicals = links.filter((l) => relTokens(l).includes('canonical')).map((l) => l.attrs.href ?? '');
  const titleEl = elements.find((e) => e.name === 'title');
  const metaCsp = metas.filter((m) => (m.attrs['http-equiv'] ?? '').toLowerCase() === 'content-security-policy').map((m) => m.attrs.content ?? '');
  const scripts = by('script');
  const ld = scripts.filter((s) => (s.attrs.type ?? '').trim().toLowerCase() === 'application/ld+json').map((s) => {
    const raw = s.text ?? '';
    try {
      return { raw, data: JSON.parse(raw) };
    } catch (e) {
      return { raw, error: e.message };
    }
  });
  return {
    url,
    headers: res.headers,
    elements,
    text,
    lang: elements.find((e) => e.name === 'html')?.attrs.lang ?? '',
    title: titleEl ? decodeEntities(titleEl.text ?? '').trim() : null,
    descriptions: metaName('description'),
    noindex,
    indexable: !noindex,
    canonicals,
    canonical: canonicals.length ? (tryUrl(canonicals[0], url)?.href ?? canonicals[0]) : null,
    og: { image: metaProp('og:image'), title: metaProp('og:title'), url: metaProp('og:url'), siteName: metaProp('og:site_name') },
    twitterCard: metaName('twitter:card'),
    h1: by('h1').length,
    anchors: by('a').map((a) => a.attrs.href).filter((h) => typeof h === 'string'),
    images: by('img'),
    scripts,
    styles: by('style').map((s) => s.text ?? ''),
    links,
    alternates: links.filter((l) => relTokens(l).includes('alternate') && l.attrs.hreflang),
    ld,
    csp: [res.headers['content-security-policy'], ...metaCsp].filter(Boolean).join(', '),
  };
}

// ---------------------------------------------------------------- analysis

class Unreachable extends Error {}

async function analyse(o, fetcher) {
  const site = new URL(o.site);
  const origin = site.origin;
  const siteHost = site.host;
  const staging = o.mode === 'staging';
  const launch = !staging;
  const live = o.kind === 'url';
  const findings = [];
  const add = (id, severity, url, message, evidence) => {
    const f = { id, severity, url: url ?? null, message: oneLine(message) };
    if (evidence !== undefined) f.evidence = oneLine(evidence).slice(0, 300);
    findings.push(f);
  };
  const cache = new Map();
  const get = (url) => {
    const u = tryUrl(url);
    if (!u || u.host !== siteHost) return Promise.resolve({ status: 0, headers: {}, body: Buffer.alloc(0), error: 'off-host' });
    const key = u.href;
    if (!cache.has(key)) cache.set(key, fetcher(key));
    return cache.get(key);
  };
  const isHtml = (res) => /^text\/html\b/i.test(res.headers['content-type'] ?? '') || (!res.headers['content-type'] && /^\s*<!doctype html|^\s*<html/i.test(res.body.toString('utf8', 0, 200)));
  const nosniff = (res) => /^\s*nosniff\s*$/i.test((res.headers['x-content-type-options'] ?? '').split(',')[0] ?? '');

  // Reachability (live): the home page must answer, whatever its status.
  const home = `${origin}/`;
  const first = await get(home);
  if (first.status === 0) throw new Unreachable(`${origin} is unreachable: ${first.error}`);

  // ---- robots.txt
  const robotsUrl = `${origin}/robots.txt`;
  const robots = await get(robotsUrl);
  let robotsText = null;
  if (robots.status === 200) {
    robotsText = robots.body.toString('utf8');
    const ct = robots.headers['content-type'] ?? '';
    if (!/^text\/plain\b/i.test(ct)) add('ROBOTS-001', 'error', robotsUrl, `robots.txt is served as "${ct || 'no content type'}", expected text/plain`);
    if (!nosniff(robots)) add('HEADERS-002', 'warning', robotsUrl, 'X-Content-Type-Options: nosniff missing on robots.txt');
  } else if (!(staging && robots.status === 404)) {
    add('ROBOTS-001', 'error', robotsUrl, `robots.txt answers ${robots.status}, expected 200 text/plain (Google treats a 4xx as "no rule", a 5xx pauses crawling)`);
  }
  const sitemapLines = [];
  if (robotsText !== null) {
    for (const m of robotsText.matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)) sitemapLines.push(m[1]);
    if (launch && !isAllowed(robotsText, '*', '/')) {
      add('ROBOTS-002', 'error', robotsUrl, 'robots.txt disallows / for User-agent: * : the site cannot be crawled, and a Disallow also hides any noindex from Google');
    }
    if (launch) {
      if (!sitemapLines.length) add('ROBOTS-003', 'error', robotsUrl, `robots.txt has no Sitemap: line (expected ${origin}/sitemap.xml or the sitemap index)`);
      for (const line of sitemapLines) {
        const u = tryUrl(line);
        if (!u || !isAbsoluteHttp(line)) add('ROBOTS-003', 'error', robotsUrl, `Sitemap: ${line} is not an absolute URL`);
        else if (u.protocol !== 'https:' || u.host !== siteHost) add('ROBOTS-003', 'error', robotsUrl, `Sitemap: ${line} is not https on ${siteHost}`);
      }
    }
    const managed = robotsText.match(/#\s*BEGIN Cloudflare Managed content([\s\S]*?)(#\s*END Cloudflare Managed Content|$)/i);
    if (managed) {
      const agents = [...new Set([...managed[1].matchAll(/^\s*user-agent\s*:\s*(\S+)/gim)].map((m) => m[1]))];
      const blocked = agents.filter((a) => a !== '*' && !isAllowed(managed[1], a, '/'));
      add('ROBOTS-004', 'warning', robotsUrl, `Cloudflare managed robots.txt block detected (prepended at the edge, not in the repository); it disallows: ${blocked.join(', ') || 'nothing'}. Review AI Crawl Control / managed robots.txt in the Cloudflare dashboard`);
    }
    if (launch) {
      const searchBlocked = AI_SEARCH_BOTS.filter((b) => !isAllowed(robotsText, b, '/'));
      if (searchBlocked.length) add('ROBOTS-005', 'warning', robotsUrl, `AI search/retrieval crawlers disallowed on /: ${searchBlocked.join(', ')} (a blocked site is not cited in their answers)`);
      const trainingBlocked = AI_TRAINING_BOTS.filter((b) => !isAllowed(robotsText, b, '/'));
      if (trainingBlocked.length) add('ROBOTS-005', 'info', robotsUrl, `AI training crawlers disallowed on /: ${trainingBlocked.join(', ')} (owner decision)`);
    }
    if (staging && !isAllowed(robotsText, '*', '/')) {
      add('ROBOTS-006', 'warning', robotsUrl, 'staging robots.txt disallows / : crawlers cannot read the noindex of the pages, and a linked staging URL can still be listed without content. Allow crawling and rely on noindex (or put the staging behind access control)');
    }
  }

  // ---- sitemap discovery
  const entries = []; // { loc, lastmod, sitemap }
  const sitemapUrls = [];
  let sitemapFound = false;
  const readSitemap = async (url, depth) => {
    const res = await get(url);
    if (res.status !== 200) return res.status;
    sitemapFound = true;
    sitemapUrls.push(url);
    if (!nosniff(res)) add('HEADERS-002', 'warning', url, 'X-Content-Type-Options: nosniff missing on the sitemap');
    const xml = res.body.toString('utf8');
    const value = (s) => decodeEntities(s.replace(/^<!\[CDATA\[|\]\]>$/g, '').trim());
    if (/<sitemapindex[\s>]/i.test(xml)) {
      for (const m of xml.matchAll(/<sitemap>([\s\S]*?)<\/sitemap>/gi)) {
        const loc = value(m[1].match(/<loc>([\s\S]*?)<\/loc>/i)?.[1] ?? '');
        const u = tryUrl(loc);
        if (!u || u.host !== siteHost) {
          add('SITEMAP-002', 'error', loc || url, `sitemap index entry ${loc} is not on ${siteHost}`);
          continue;
        }
        if (depth >= 2) continue;
        const st = await readSitemap(u.href, depth + 1);
        if (st !== 200 && !(staging && st === 404)) add('SITEMAP-001', 'error', u.href, `child sitemap ${u.href} answers ${st}`);
      }
    } else if (/<urlset[\s>]/i.test(xml)) {
      for (const m of xml.matchAll(/<url>([\s\S]*?)<\/url>/gi)) {
        entries.push({
          loc: value(m[1].match(/<loc>([\s\S]*?)<\/loc>/i)?.[1] ?? ''),
          lastmod: m[1].match(/<lastmod>([\s\S]*?)<\/lastmod>/i) ? value(m[1].match(/<lastmod>([\s\S]*?)<\/lastmod>/i)[1]) : null,
          sitemap: url,
        });
      }
    } else add('SITEMAP-001', 'error', url, 'the sitemap is not readable XML (no <urlset> nor <sitemapindex>)');
    return 200;
  };
  const declared = sitemapLines.map((l) => tryUrl(l)).filter((u) => u && u.host === siteHost && /^https?:$/.test(u.protocol));
  if (declared.length) {
    for (const u of declared) {
      const st = await readSitemap(u.href, 0);
      if (st !== 200 && !(staging && st === 404)) add('SITEMAP-001', 'error', u.href, `the sitemap declared in robots.txt answers ${st}`);
    }
  } else {
    for (const p of ['/sitemap.xml', '/sitemap-index.xml']) if ((await readSitemap(`${origin}${p}`, 0)) === 200) break;
    if (!sitemapFound && launch) add('SITEMAP-001', 'error', null, `no sitemap found (robots.txt Sitemap: line, ${origin}/sitemap.xml, ${origin}/sitemap-index.xml)`);
  }
  const onHostLocs = [];
  for (const e of entries) {
    const u = isAbsoluteHttp(e.loc) ? tryUrl(e.loc) : null;
    const problems = [];
    if (!u) problems.push('not an absolute URL');
    else {
      if (isLocalHost(u.hostname)) problems.push('points to a local address');
      else if (u.host !== siteHost) problems.push(`is not on ${siteHost}`);
      if (launch && u.protocol !== 'https:') problems.push('is not https');
    }
    if (problems.length) add('SITEMAP-002', 'error', e.loc || e.sitemap, `sitemap <loc> ${e.loc} ${problems.join(', ')}`);
    if (u && u.host === siteHost) onHostLocs.push({ ...e, url: u });
  }
  const W3C_DATE = /^\d{4}(-\d{2}(-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?)?)?$/;
  const lastmods = entries.filter((e) => e.lastmod !== null);
  for (const e of lastmods) if (!W3C_DATE.test(e.lastmod)) add('SITEMAP-005', 'warning', e.loc || e.sitemap, `invalid lastmod "${e.lastmod}" (W3C date expected)`);
  if (lastmods.length >= 2 && new Set(lastmods.map((e) => e.lastmod)).size === 1) {
    add('SITEMAP-005', 'warning', lastmods[0].sitemap, `every <lastmod> is ${lastmods[0].lastmod}: a build date, which Google ignores unless lastmod is consistently accurate; use the real modification date of each page`);
  }

  // ---- crawl: sitemap URLs on the host + internal links from /
  const status = new Map(); // fetched URL -> status
  const pages = new Map();
  const seen = new Set();
  let frontier = [];
  const enqueue = (u) => {
    if (!u || u.host !== siteHost || !/^https?:$/.test(u.protocol)) return;
    const key = `${origin}${u.pathname}`;
    if (!seen.has(key)) {
      seen.add(key);
      frontier.push(key);
    }
  };
  enqueue(new URL(home));
  for (const e of onHostLocs) enqueue(e.url);
  while (frontier.length && pages.size < o.maxPages) {
    const batch = [...frontier].sort(sortStr);
    frontier = [];
    const results = await pool(batch, CONCURRENCY, (u) => get(u));
    for (const [k, url] of batch.entries()) {
      const res = results[k];
      status.set(url, res.status);
      if (res.status >= 300 && res.status < 400 && res.headers.location) enqueue(tryUrl(res.headers.location, url));
      if (res.status !== 200 || !isHtml(res) || pages.size >= o.maxPages) continue;
      const page = readPage(url, res);
      pages.set(url, page);
      for (const href of page.anchors) {
        const t = tryUrl(href, url);
        if (t && t.host === siteHost && /^https?:$/.test(t.protocol)) enqueue(t);
      }
    }
  }
  const list = [...pages.values()].sort((a, b) => sortStr(a.url, b.url));

  // SITEMAP-003: each <loc> on the host answers 200 without redirect (fetched as written).
  const locResults = await pool(onHostLocs, CONCURRENCY, (e) => get(e.url.href));
  for (const [k, e] of onHostLocs.entries()) {
    const res = locResults[k];
    if (res.status !== 200) {
      const where = res.status >= 300 && res.status < 400 ? ` (redirects to ${res.headers.location ?? '?'})` : '';
      add('SITEMAP-003', 'error', e.url.href, `sitemap <loc> ${e.url.href} answers ${res.status}${where}, expected 200 without redirect`);
    }
  }
  // SITEMAP-004: launch only, no noindex nor canonicalised URL in the sitemap.
  if (launch) {
    for (const e of onHostLocs) {
      const page = pages.get(pageKey(e.url));
      if (!page || locResults[onHostLocs.indexOf(e)].status !== 200) continue;
      if (page.noindex) add('SITEMAP-004', 'error', page.url, `${page.url} is listed in the sitemap but is noindex: remove it from the sitemap, or make it indexable`);
      else if (page.canonical && page.canonical.split(/[?#]/)[0] !== e.url.href.split(/[?#]/)[0]) {
        add('SITEMAP-004', 'error', page.url, `${page.url} is listed in the sitemap but canonicalised to ${page.canonical}`);
      }
    }
  }

  // ---- soft-404 probe (not a page: only NOTFOUND-001, CANON-003, HEADERS-002)
  const probeUrl = `${origin}${PROBE_PATH}`;
  const probe = await get(probeUrl);
  if (probe.status !== 404) add('NOTFOUND-001', 'error', probeUrl, `a missing page answers ${probe.status}, expected 404 (soft 404)`);
  if (probe.status !== 0 && !nosniff(probe)) add('HEADERS-002', 'warning', probeUrl, 'X-Content-Type-Options: nosniff missing on the 404 response');
  if (probe.status !== 0 && isHtml(probe)) {
    const p = readPage(probeUrl, probe);
    if (p.canonicals.length) add('CANON-003', 'warning', probeUrl, `the 404 page declares a canonical (${p.canonicals[0]}): remove it`, `<link rel="canonical" href="${p.canonicals[0]}">`);
  }

  // ---- per-page checks
  const titles = new Map();
  const descs = new Map();
  for (const p of list) {
    if (p.title) titles.set(p.title, [...(titles.get(p.title) ?? []), p.url]);
    if (p.descriptions[0]) descs.set(p.descriptions[0], [...(descs.get(p.descriptions[0]) ?? []), p.url]);
  }
  const imageCache = new Map();
  const imageInfo = async (url) => {
    if (!imageCache.has(url)) {
      imageCache.set(
        url,
        get(url).then((res) => ({ status: res.status, type: res.headers['content-type'] ?? '', size: res.status === 200 ? imageSize(res.body) : null })),
      );
    }
    return imageCache.get(url);
  };
  const orgNames = new Map(); // name -> [urls]
  const siteNames = new Map();
  const stylesheets = new Set();
  const siteScripts = new Set();
  const reportedLogo = new Set();
  const homePage = pages.get(home);

  if (launch) {
    if (!homePage) add('INDEX-001', 'error', home, `the home page did not answer 200 HTML (status ${status.get(home) ?? first.status})`);
    else if (homePage.noindex) add('INDEX-001', 'error', home, 'the home page is noindex (meta robots or X-Robots-Tag): the site cannot be indexed');
    const noindex = list.filter((p) => p.noindex).map((p) => new URL(p.url).pathname);
    if (noindex.length) add('INDEX-001', 'info', null, `noindex pages: ${noindex.join(', ')}`);
  }

  for (const p of list) {
    const u = new URL(p.url);
    // INDEX-002
    if (staging && p.indexable) add('INDEX-002', 'error', p.url, 'staging page without noindex (neither meta robots nor X-Robots-Tag)');
    // CANON-001 / CANON-002
    if (p.indexable) {
      if (p.canonicals.length !== 1) add('CANON-001', 'error', p.url, `indexable page with ${p.canonicals.length} canonical links (exactly one expected)`);
      else {
        const raw = p.canonicals[0];
        const c = tryUrl(raw, p.url);
        if (!isAbsoluteHttp(raw)) add('CANON-001', 'error', p.url, `canonical ${raw} is not absolute`, `<link rel="canonical" href="${raw}">`);
        else if (c && isLocalHost(c.hostname)) add('CANON-001', 'error', p.url, `canonical is ${raw} (local address; expected host ${siteHost})`, `<link rel="canonical" href="${raw}">`);
        else if (c && c.host !== siteHost) add('CANON-001', 'error', p.url, `canonical is ${raw} (expected host ${siteHost})`, `<link rel="canonical" href="${raw}">`);
      }
    }
    if (p.canonical && p.canonical.split(/[?#]/)[0] !== p.url) add('CANON-002', 'warning', p.url, `canonical ${p.canonical} differs from the served URL ${p.url}`);
    // META
    if (!p.title) add('META-001', 'error', p.url, 'missing or empty <title>');
    else {
      if (titles.get(p.title).length > 1) add('META-001', 'warning', p.url, `title "${p.title}" is shared with ${titles.get(p.title).filter((x) => x !== p.url).join(', ')}`);
      if ([...p.title].length > TITLE_MAX) add('META-001', 'warning', p.url, `title is ${[...p.title].length} characters (over ${TITLE_MAX} it is often truncated; a convention, not a Google limit)`);
    }
    const desc = (p.descriptions[0] ?? '').trim();
    if (!desc) add('META-002', 'error', p.url, 'missing or empty meta description');
    else {
      if (descs.get(p.descriptions[0]).length > 1) add('META-002', 'warning', p.url, `description is shared with ${descs.get(p.descriptions[0]).filter((x) => x !== p.url).join(', ')}`);
      const n = [...desc].length;
      if (n < DESCRIPTION_MIN || n > DESCRIPTION_MAX) add('META-002', 'warning', p.url, `description is ${n} characters (${DESCRIPTION_MIN} to ${DESCRIPTION_MAX} is the usual snippet range; a convention, not a Google limit)`);
    }
    const metaIssues = [];
    if (p.h1 !== 1) metaIssues.push(`${p.h1} <h1> (exactly one expected)`);
    if (!p.lang.trim()) metaIssues.push('<html lang> missing');
    if (metaIssues.length) add('META-003', 'warning', p.url, metaIssues.join('; '));
    // OG-001
    const ogImage = p.og.image[0];
    if (!ogImage) add('OG-001', 'error', p.url, 'og:image missing');
    else {
      const iu = isAbsoluteHttp(ogImage) ? tryUrl(ogImage) : null;
      if (!iu) add('OG-001', 'error', p.url, `og:image ${ogImage} is not an absolute URL`);
      else if (iu.host !== siteHost) add('OG-001', 'error', p.url, `og:image ${ogImage} is not on ${siteHost}`);
      else {
        const info = await imageInfo(iu.href);
        if (info.status !== 200 || !/^image\//i.test(info.type)) add('OG-001', 'error', p.url, `og:image ${ogImage} answers ${info.status} ${info.type || ''}, expected 200 image/*`);
      }
    }
    const ogMissing = [];
    if (!p.og.title[0]) ogMissing.push('og:title missing');
    if (!p.og.url[0]) ogMissing.push('og:url missing');
    else if (p.canonical && tryUrl(p.og.url[0], p.url)?.href !== p.canonical) ogMissing.push(`og:url ${p.og.url[0]} differs from the canonical ${p.canonical}`);
    if (!p.twitterCard[0]) ogMissing.push('twitter:card missing');
    if (ogMissing.length) add('OG-001', 'warning', p.url, ogMissing.join('; '));
    for (const n of p.og.siteName) siteNames.set(n.trim(), [...(siteNames.get(n.trim()) ?? []), p.url]);

    // JSON-LD
    const types = new Set();
    for (const [bi, block] of p.ld.entries()) {
      const label = `JSON-LD block ${bi + 1}`;
      if (block.raw.includes('<')) add('JSONLD-003', 'warning', p.url, `${label} contains a raw "<": serialise with JSON.stringify(data).replace(/</g, "\\u003c") so no text can close the script element`);
      if (block.error) {
        add('JSONLD-001', 'error', p.url, `${label} is not valid JSON (${block.error})`, block.raw.slice(0, 120));
        continue;
      }
      const roots = (Array.isArray(block.data) ? block.data : [block.data]).filter((d) => d && typeof d === 'object');
      if (roots.some((r) => !contextOk(r['@context']))) add('JSONLD-002', 'warning', p.url, `${label}: @context missing or not https://schema.org`);
      for (const n of allNodes(block.data)) for (const t of typesOf(n)) types.add(t);
      const tops = topNodes(block.data);
      // JSONLD-004: URLs absolute, on the site host. Nested third-party entities (authors, citations) may
      // point elsewhere; relative and local URLs are refused everywhere.
      const URL_KEYS = new Set(['url', '@id', 'logo', 'image', 'item', 'mainEntityOfPage']);
      const bad = [];
      const checkUrl = (key, value, strict) => {
        if (typeof value !== 'string' || value.startsWith('_:')) return;
        const v = value.trim();
        if (!isAbsoluteHttp(v)) {
          if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return; // mailto:, data:, urn:...
          bad.push(`${key} "${v}" is relative`);
          return;
        }
        const x = tryUrl(v);
        if (!x) bad.push(`${key} "${v}" is invalid`);
        else if (isLocalHost(x.hostname)) bad.push(`${key} "${v}" is a local address`);
        else if (strict && x.host !== siteHost) bad.push(`${key} "${v}" is not on ${siteHost}`);
      };
      const walk = (value, key, strict) => {
        if (Array.isArray(value)) value.forEach((v) => walk(v, key, strict));
        else if (value && typeof value === 'object') {
          const own = typeof value['@id'] === 'string' && tryUrl(value['@id'])?.host === siteHost;
          for (const [k, v] of Object.entries(value)) {
            if (k === '@graph') continue;
            walk(v, k, (strict && tops.includes(value)) || own);
          }
        } else if (URL_KEYS.has(key)) checkUrl(key, value, strict);
      };
      for (const t of tops) {
        for (const [k, v] of Object.entries(t)) if (k !== '@graph') walk(v, k, true);
      }
      if (bad.length) add('JSONLD-004', 'error', p.url, `${label}: ${[...new Set(bad)].join('; ')}`);
      for (const node of tops) {
        const ts = typesOf(node);
        if (ts.some((t) => ORG_TYPE.test(t))) {
          const foreign = typeof node['@id'] === 'string' && tryUrl(node['@id']) && tryUrl(node['@id']).host !== siteHost;
          if (typeof node.name === 'string' && !foreign) orgNames.set(node.name.trim(), [...(orgNames.get(node.name.trim()) ?? []), p.url]);
          if (!foreign) {
            const logo = typeof node.logo === 'string' ? node.logo : (node.logo?.url ?? node.logo?.contentUrl ?? null);
            let problem = null;
            if (!logo) problem = 'Organization.logo missing';
            else {
              const lu = tryUrl(logo, p.url);
              if (lu && lu.host === siteHost) {
                const info = await imageInfo(lu.href);
                if (info.status !== 200) problem = `Organization.logo ${logo} answers ${info.status}`;
                else if (!info.size) problem = `Organization.logo ${logo} is not a raster image (PNG, JPEG or WebP expected; SVG is not accepted as a logo here)`;
                else if (info.size.width < LOGO_MIN_PX || info.size.height < LOGO_MIN_PX) problem = `Organization.logo ${logo} is ${info.size.width} x ${info.size.height} px (at least ${LOGO_MIN_PX} x ${LOGO_MIN_PX})`;
              }
            }
            if (problem && !reportedLogo.has(problem)) {
              reportedLogo.add(problem);
              add('JSONLD-005', 'warning', p.url, problem);
            }
          }
        }
      }
      for (const n of allNodes(block.data)) {
        const ts = typesOf(n);
        if (ts.some((t) => t === 'FAQPage' || t === 'HowTo')) add('JSONLD-006', 'info', p.url, `${ts.join(', ')} markup: no Google rich result (FAQ rich results removed 2026-05-07, HowTo 2023-09); keep it only if it mirrors visible content`);
        if (ts.some((t) => APP_TYPE.test(t)) && !(n.offers && (n.aggregateRating || n.review))) {
          const missing = [n.offers ? null : 'offers', n.aggregateRating || n.review ? null : 'aggregateRating or review'].filter(Boolean);
          add('JSONLD-007', 'info', p.url, `${ts.join(', ')} without ${missing.join(' and ')}: not eligible for the rich result. A rating must come from real reviews visible on the page: never invent one, remove an unsupported one`);
        }
        if (ts.some((t) => ARTICLE_TYPE.test(t)) && !n.dateModified) add('JSONLD-008', 'warning', p.url, `${ts.join(', ')} without dateModified (use the real modification date, also used for the sitemap lastmod)`);
      }
    }
    if (p.url === home && !(([...types].some((t) => ORG_TYPE.test(t))) && types.has('WebSite'))) {
      add('JSONLD-002', 'warning', p.url, 'the home page does not declare both Organization and WebSite in JSON-LD');
    }

    // HREFLANG-001
    if (p.alternates.length) {
      const issues = [];
      for (const a of p.alternates) if (!isAbsoluteHttp(a.attrs.href ?? '')) issues.push(`hreflang="${a.attrs.hreflang}" href="${a.attrs.href ?? ''}" is relative`);
      if (!p.alternates.some((a) => a.attrs.hreflang.toLowerCase() === 'x-default')) issues.push('no x-default alternate');
      for (const a of p.alternates) {
        const t = tryUrl(a.attrs.href ?? '', p.url);
        const other = t && pages.get(pageKey(t));
        if (other && other.url !== p.url && !other.alternates.some((b) => tryUrl(b.attrs.href ?? '', other.url)?.href === p.url)) issues.push(`${other.url} does not link back`);
      }
      if (issues.length) add('HREFLANG-001', 'warning', p.url, issues.join('; '));
    }

    // LINK-001
    const broken = new Set();
    for (const href of p.anchors) {
      if (/^(mailto|tel|javascript|data):/i.test(href) || href.startsWith('#')) continue;
      const t = tryUrl(href, p.url);
      if (!t || t.host !== siteHost) continue;
      if (status.get(`${origin}${t.pathname}`) === 404) broken.add(href);
    }
    if (broken.size) add('LINK-001', 'error', p.url, `internal link(s) answering 404: ${[...broken].sort(sortStr).join(', ')}`);

    // PLACEHOLDER-001: every public page (discovered, 200), indexable or not: a noindex legal page is
    // still public. The 404 probe is not a page and is never read here.
    if (launch) {
      const markers = [...DEFAULT_MARKERS, ...o.forbid];
      const hits = markers.map((re) => p.text.match(re)?.[0]).filter(Boolean);
      if (hits.length) add('PLACEHOLDER-001', 'error', p.url, `placeholder text on a public page: ${[...new Set(hits)].map((h) => `"${h}"`).join(', ')} (content to complete by the owner, not to invent)`);
    }

    // HEADERS-001
    const h = p.headers;
    const missingErr = [];
    if (!nosniff({ headers: h })) missingErr.push('X-Content-Type-Options: nosniff');
    if (!p.csp) missingErr.push('Content-Security-Policy');
    if (missingErr.length) add('HEADERS-001', 'error', p.url, `missing on the HTML response: ${missingErr.join(', ')}`);
    const missingWarn = [];
    if (!h['referrer-policy']) missingWarn.push('Referrer-Policy');
    if (!h['permissions-policy']) missingWarn.push('Permissions-Policy');
    if (!/frame-ancestors/i.test(h['content-security-policy'] ?? '') && !h['x-frame-options']) missingWarn.push('frame-ancestors or X-Frame-Options');
    if (live && u.protocol === 'https:' && !h['strict-transport-security']) missingWarn.push('Strict-Transport-Security');
    if (missingWarn.length) add('HEADERS-001', 'warning', p.url, `missing on the HTML response: ${missingWarn.join(', ')}`);

    // CSP-001 / CSP-002
    const policies = cspPolicies(p.csp);
    for (const pol of policies) {
      const d = scriptDirective(pol);
      if (!d) continue;
      const hasHashOrNonce = d.some((t) => /^'(sha(256|384|512)-|nonce-)/i.test(t));
      if (d.includes("'unsafe-eval'")) add('CSP-001', 'error', p.url, "script-src allows 'unsafe-eval'");
      if (d.includes("'unsafe-inline'") && !hasHashOrNonce) add('CSP-001', 'error', p.url, "script-src allows 'unsafe-inline' without hash: any injected script runs. Allow inline scripts by their sha256 hash");
    }
    const inline = p.scripts.filter((s) => !s.attrs.src && isExecutableScript(s) && (s.text ?? '').length > 0);
    for (const s of inline) {
      for (const pol of policies) {
        const d = scriptDirective(pol);
        if (!d) continue;
        const allowed = d.some((t) => {
          const m = t.match(/^'(sha256|sha384|sha512)-(.+)'$/i);
          if (m) return cspHash(s.text, m[1].toLowerCase()) === `${m[1].toLowerCase()}-${m[2]}`;
          const n = t.match(/^'nonce-(.+)'$/i);
          return Boolean(n && s.attrs.nonce === n[1]);
        });
        if (!allowed) {
          add('CSP-002', 'error', p.url, `inline script not allowed by its hash: add '${cspHash(s.text)}' to script-src (or move the script to a file)`, s.text.slice(0, 80));
          break;
        }
      }
    }

    // IMG-001
    const unsized = p.images.filter((i) => !i.attrs.width || !i.attrs.height).map((i) => i.attrs.src ?? '?');
    if (unsized.length) add('IMG-001', 'warning', p.url, `<img> without width and height (layout shift): ${unsized.join(', ')}`);

    // PERF-001 and stylesheets/scripts for CSS-001 and TRACKER-001
    const perf = [];
    for (const l of p.links) {
      const rel = relTokens(l);
      const t = tryUrl(l.attrs.href ?? '', p.url);
      if (!t) continue;
      if (rel.includes('stylesheet') && t.host === siteHost) stylesheets.add(t.href);
      if (l.inHead && t.host !== siteHost && (rel.includes('stylesheet') || (rel.includes('preload') && (l.attrs.as ?? '').toLowerCase() === 'font'))) {
        perf.push(`third-party ${rel.includes('stylesheet') ? 'stylesheet' : 'font'} ${t.href}`);
      }
    }
    for (const s of p.scripts) {
      if (!s.attrs.src || !isExecutableScript(s)) continue;
      const t = tryUrl(s.attrs.src, p.url);
      if (t && t.host === siteHost) siteScripts.add(t.href);
      const isModule = (s.attrs.type ?? '').trim().toLowerCase() === 'module';
      if (s.inHead && !('defer' in s.attrs) && !('async' in s.attrs) && !isModule) perf.push(`render-blocking script ${s.attrs.src}`);
    }
    if (perf.length) add('PERF-001', 'warning', p.url, `in <head>: ${perf.join('; ')}`);
    for (const css of p.styles) {
      const issue = cssIssue(css);
      if (issue) add('CSS-001', 'warning', p.url, `inline <style>: ${issue}`);
    }

    // TRACKER-001
    const vendors = p.scripts.flatMap((s) => [s.attrs.src ?? '', s.text ?? '']).filter((x) => TRACKER_HOSTS.test(x)).map((x) => x.match(TRACKER_HOSTS)[0]);
    const storage = p.scripts.filter((s) => !s.attrs.src && isExecutableScript(s)).map((s) => (s.text ?? '').match(STORAGE_API)?.[0]).filter(Boolean);
    if (vendors.length || storage.length) {
      const what = [...new Set([...vendors.map((v) => `analytics script (${v})`), ...storage.map((s) => `inline script using ${s}`)])];
      add('TRACKER-001', 'warning', p.url, `${what.join(', ')}: article 82 (France/EU) - check consent or the audience-measurement exemption, an opt-out link and the privacy notice`);
    }

    // MIXED-001
    if (u.protocol === 'https:') {
      const mixed = [];
      for (const e of p.elements) {
        const v = ['img', 'script', 'iframe', 'source', 'video', 'audio', 'embed', 'track'].includes(e.name)
          ? e.attrs.src
          : e.name === 'link' && relTokens(e).some((r) => ['stylesheet', 'icon', 'preload', 'manifest', 'apple-touch-icon'].includes(r))
            ? e.attrs.href
            : e.name === 'object'
              ? e.attrs.data
              : null;
        if (v && /^http:\/\//i.test(v.trim())) mixed.push(v.trim());
      }
      if (mixed.length) add('MIXED-001', 'warning', p.url, `http:// resource(s) on an https page: ${[...new Set(mixed)].join(', ')}`);
    }
  }

  // ---- site-wide checks
  // DIST-001: the in-memory server does not apply _redirects (spec 4.2): say so instead of staying silent.
  if (o.kind === 'dist' && existsSync(join(resolve(o.dist), '_redirects'))) {
    add('DIST-001', 'info', null, '_redirects found but not applied in --dist mode: check the redirects online with --url --domain');
  }
  // CSS-001 on same-host stylesheets
  for (const css of [...stylesheets].sort(sortStr)) {
    const res = await get(css);
    if (res.status !== 200) continue;
    const issue = cssIssue(res.body.toString('utf8'));
    if (issue) add('CSS-001', 'warning', css, issue);
  }
  // TRACKER-001 on same-host scripts
  for (const js of [...siteScripts].sort(sortStr)) {
    const res = await get(js);
    if (res.status !== 200) continue;
    const m = res.body.toString('utf8').match(STORAGE_API);
    if (m) add('TRACKER-001', 'warning', js, `site script uses ${m[0]} (article 82 covers reading or writing on the device: cookies and localStorage are trackers for the CNIL, sessionStorage by a cautious reading; consent, or the exemption with opt-out and information)`);
  }

  // LLMS-001
  const llmsUrl = `${origin}/llms.txt`;
  const llms = await get(llmsUrl);
  let llmsH1 = null;
  if (llms.status !== 200) add('LLMS-001', 'warning', llmsUrl, `/llms.txt answers ${llms.status}: optional proposal (llmstxt.org), not used by Google Search; cheap to publish for other assistants`);
  else {
    const txt = llms.body.toString('utf8');
    llmsH1 = txt.match(/^# +(\S.*)$/m)?.[1].trim() ?? null;
    const problems = [];
    if (!llmsH1) problems.push('no H1 (the only required section)');
    for (const m of txt.matchAll(/\[[^\]]*\]\(([^)\s]+)/g)) {
      const t = isAbsoluteHttp(m[1]) ? tryUrl(m[1]) : null;
      if (!t) problems.push(`relative link ${m[1]}`);
      else if (t.host !== siteHost) problems.push(`link ${m[1]} is not on ${siteHost}`);
    }
    if (problems.length) add('LLMS-001', 'warning', llmsUrl, `llms.txt: ${problems.join('; ')}`);
    else add('LLMS-001', 'info', llmsUrl, 'llms.txt present: an optional proposal (llmstxt.org), not used by Google Search');
  }

  // ENTITY-001
  const names = new Map();
  for (const [n, urls] of orgNames) names.set(n, [...(names.get(n) ?? []), ...urls.map((x) => `Organization.name on ${new URL(x).pathname}`)]);
  for (const [n, urls] of siteNames) names.set(n, [...(names.get(n) ?? []), ...urls.map((x) => `og:site_name on ${new URL(x).pathname}`)]);
  if (llmsH1) names.set(llmsH1, [...(names.get(llmsH1) ?? []), 'llms.txt H1']);
  if (names.size > 1) {
    const detail = [...names.keys()].sort(sortStr).map((n) => `"${n}" (${[...new Set(names.get(n))].slice(0, 3).join(', ')}${names.get(n).length > 3 ? ', ...' : ''})`);
    add('ENTITY-001', 'warning', null, `the entity has ${names.size} names: ${detail.join('; ')}. Use one name everywhere`);
  }

  // HEADERS-002 on --path
  for (const p of o.paths) {
    const url = tryUrl(p, origin)?.href;
    if (!url) continue;
    const res = await get(url);
    if (res.status === 0) add('HEADERS-002', 'warning', url, `${p} did not answer (${res.error})`);
    else if (!nosniff(res)) add('HEADERS-002', 'warning', url, `X-Content-Type-Options: nosniff missing on ${p} (responses produced by a Worker do not get the _headers file)`);
  }

  // REDIRECT-001 / REDIRECT-002 (live, --domain)
  if (live && o.domain) {
    const checkRedirect = async (id, from, to) => {
      const res = await fetcher(from);
      if (res.status === 0) return add(id, 'error', from, `${from} did not answer (${res.error}); expected a 301/308 to ${to}`);
      const loc = res.headers.location ? tryUrl(res.headers.location, from)?.href : null;
      if (![301, 308].includes(res.status) || loc !== to) {
        add(id, 'error', from, `${from} answers ${res.status}${loc ? ` to ${loc}` : ''}; expected a single 301/308 to ${to}`);
      }
    };
    await checkRedirect('REDIRECT-001', `http://${o.domain}/`, `https://${o.domain}/`);
    await checkRedirect('REDIRECT-002', `https://www.${o.domain}/a/?q=1`, `https://${o.domain}/a/?q=1`);
  }

  const pagesOut = list.map((p) => ({ url: p.url, status: 200, indexable: p.indexable, canonical: p.canonical }));
  const sevRank = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => sortStr(a.url ?? '', b.url ?? '') || sortStr(a.id, b.id) || sevRank[a.severity] - sevRank[b.severity] || sortStr(a.message, b.message));
  const count = (s) => findings.filter((f) => f.severity === s).length;
  return { pages: pagesOut, findings, summary: { errors: count('error'), warnings: count('warning'), infos: count('info'), pages: pagesOut.length } };
}

/** CSS-001: content-visibility: auto without contain-intrinsic-size in the same rule (null when fine). */
function cssIssue(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of clean.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    if (/content-visibility\s*:\s*auto/i.test(m[2]) && !/contain-intrinsic-(size|width|height|block-size|inline-size)\s*:/i.test(m[2])) {
      return `"${oneLine(m[1])}" sets content-visibility: auto without contain-intrinsic-size (skipped content collapses to zero height: layout shift)`;
    }
  }
  return null;
}

// ---------------------------------------------------------------- CLI

class UsageError extends Error {}

function parseArgs(argv) {
  const o = { mode: 'launch', paths: [], forbid: [], connectTo: new Map(), maxPages: MAX_PAGES_DEFAULT, strict: false };
  const single = { '--dist': 'dist', '--site': 'site', '--url': 'url', '--domain': 'domain', '--mode': 'mode', '--max-pages': 'maxPages', '--json': 'json' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new UsageError(`${a} needs a value`);
      return v;
    };
    if (a in single) o[single[a]] = value();
    else if (a === '--path') o.paths.push(value());
    else if (a === '--forbid') {
      const v = value();
      try {
        o.forbid.push(new RegExp(v, 'i'));
      } catch (e) {
        throw new UsageError(`--forbid ${v}: ${e.message}`);
      }
    } else if (a === '--connect-to') {
      const v = value();
      const m = v.match(/^([^:]+):(\d+):([^:]+|\[[^\]]+\]):(\d+)$/);
      if (!m) throw new UsageError(`--connect-to ${v}: expected HOST:PORT:CONNECT-HOST:CONNECT-PORT`);
      o.connectTo.set(`${m[1].toLowerCase()}:${m[2]}`, { host: m[3].replace(/^\[|\]$/g, ''), port: Number(m[4]) });
    } else if (a === '--strict') o.strict = true;
    else throw new UsageError(`unknown option ${a}`);
  }
  if (!o.dist && !o.url) throw new UsageError('--dist <dir> --site <origin>, or --url <origin>, is required');
  if (o.dist && o.url) throw new UsageError('use --dist or --url, not both');
  if (o.dist && !o.site) throw new UsageError('--dist needs --site <https://public-origin>');
  if (o.url && !o.site) o.site = o.url;
  for (const k of ['site', 'url']) {
    if (o[k] && !(isAbsoluteHttp(o[k]) && tryUrl(o[k]))) throw new UsageError(`--${k} ${o[k]} is not an http(s) URL`);
  }
  if (!['launch', 'staging'].includes(o.mode)) throw new UsageError(`--mode ${o.mode}: launch or staging`);
  o.maxPages = Number(o.maxPages);
  if (!Number.isInteger(o.maxPages) || o.maxPages < 1) throw new UsageError('--max-pages must be a positive integer');
  if (o.dist && !(existsSync(o.dist) && statSync(o.dist).isDirectory())) throw new UsageError(`--dist ${o.dist}: no such folder`);
  o.kind = o.dist ? 'dist' : 'url';
  return o;
}

function displayUrl(url, origin) {
  if (url === null) return '-';
  return url.startsWith(`${origin}/`) ? url.slice(origin.length) : url;
}

export async function main(argv = process.argv.slice(2)) {
  const started = Date.now();
  let o;
  try {
    o = parseArgs(argv);
  } catch (e) {
    process.stderr.write(`check-site: ${e.message}\nusage: node check-site.mjs --dist <dir> --site <https://origin> [--mode launch|staging] [--json <file>] [--strict]\n       node check-site.mjs --url <https://origin> [--domain <apex>] [--path <p>] [--json <file>] [--strict]\n`);
    return 2;
  }
  const origin = new URL(o.site).origin;
  const fetcher = o.kind === 'dist' ? distFetcher(resolve(o.dist), new URL(o.site).host) : liveFetcher(o.connectTo);
  let result;
  try {
    result = await analyse(o, fetcher);
  } catch (e) {
    if (e instanceof Unreachable) {
      process.stderr.write(`check-site: ${e.message}\n`);
      return 2;
    }
    throw e;
  }
  const input = o.kind === 'dist' ? { kind: 'dist', dist: o.dist, site: origin, mode: o.mode } : { kind: 'url', url: o.url, site: origin, mode: o.mode, ...(o.domain ? { domain: o.domain } : {}) };
  const report = { tool: 'check-site', version: VERSION, input, ...result };
  if (o.json) writeFileSync(o.json, `${JSON.stringify(report, null, 2)}\n`);
  const lines = [];
  for (const sev of ['error', 'warning', 'info']) {
    for (const f of report.findings.filter((x) => x.severity === sev)) lines.push(`${sev[0].toUpperCase()} ${f.id} ${displayUrl(f.url, origin)} ${f.message}`);
  }
  const s = report.summary;
  lines.push(`${s.errors} errors, ${s.warnings} warnings, ${s.infos} infos — ${s.pages} pages (${((Date.now() - started) / 1000).toFixed(1)} s)`);
  process.stdout.write(`${lines.join('\n')}\n`);
  return s.errors > 0 || (o.strict && s.warnings > 0) ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (e) => {
      process.stderr.write(`check-site: internal error: ${e.stack ?? e.message}\n`);
      process.exitCode = 2;
    },
  );
}
