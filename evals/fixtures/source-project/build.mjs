// Static site build: content/*.json + public/ -> dist/
// Usage: npm run build   (reads SITE_URL from the environment)
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DIST = join(ROOT, 'dist');
const SITE_URL = process.env.SITE_URL || 'http://localhost:4321';
const ORG_ID = `${SITE_URL}/#organization`;

const pages = readdirSync(join(ROOT, 'content'))
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(ROOT, 'content', f), 'utf8')));

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}
function ld(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

function graph() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', '@id': ORG_ID, name: 'Acme Widgets', url: `${SITE_URL}/`, logo: `${SITE_URL}/assets/img/logo.png` },
      { '@type': 'WebSite', '@id': `${SITE_URL}/#website`, url: `${SITE_URL}/`, name: 'Acme Widgets', publisher: { '@id': ORG_ID } },
    ],
  };
}

function articleLd(p, url) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: p.title,
    datePublished: p.published,
    dateModified: p.updated,
    author: { '@id': ORG_ID },
    publisher: { '@id': ORG_ID },
    image: [`${SITE_URL}/assets/img/og.png`],
    mainEntityOfPage: url,
  };
}

function render(p) {
  const url = `${SITE_URL}${p.path}`;
  const robots = p.notFound ? 'noindex' : p.indexable === false ? 'noindex, follow' : 'index, follow';
  const blocks = [graph()];
  if (p.type === 'article') blocks.push(articleLd(p, url));
  const nav = pages
    .filter((q) => q.nav)
    .map((q) => `<a href="${q.path}">${esc(q.nav)}</a>`)
    .join(' ');
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(p.title)}</title>`,
    `<meta name="description" content="${esc(p.description)}">`,
    `<meta name="robots" content="${robots}">`,
    p.notFound ? '' : `<link rel="canonical" href="${url}">`,
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="Acme Widgets">',
    `<meta property="og:title" content="${esc(p.title)}">`,
    p.notFound ? '' : `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${SITE_URL}/assets/img/og.png">`,
    '<meta name="twitter:card" content="summary_large_image">',
    '<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
    '<link rel="stylesheet" href="/assets/site.css">',
    ...blocks.map((b) => `<script type="application/ld+json">${ld(b)}</script>`),
    '</head>',
    '<body>',
    `<header><a href="/"><img src="/assets/img/logo.png" width="48" height="48" alt="Acme Widgets"></a>\n<nav>${nav}</nav></header>`,
    '<main>',
    `<h1>${esc(p.h1)}</h1>`,
    ...p.body.map((para) => `<p>${esc(para)}</p>`),
    '</main>',
    '<footer><a href="/legal/">Legal notice</a></footer>',
    '</body>',
    '</html>',
    '',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

function outFile(p) {
  if (p.notFound) return join(DIST, '404.html');
  return join(DIST, p.path, 'index.html');
}

rmSync(DIST, { recursive: true, force: true });
cpSync(join(ROOT, 'public'), DIST, { recursive: true });

for (const p of pages) {
  const file = outFile(p);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, render(p) + '\n');
}

const listed = pages.filter((p) => !p.notFound && p.indexable !== false);
writeFileSync(
  join(DIST, 'sitemap.xml'),
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    listed.map((p) => `  <url>\n    <loc>${SITE_URL}${p.path}</loc>\n    <lastmod>${p.updated}</lastmod>\n  </url>`).join('\n') +
    '\n</urlset>\n',
);
writeFileSync(join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
writeFileSync(
  join(DIST, 'llms.txt'),
  '# Acme Widgets\n\n> Acme Widgets designs modular, repairable widgets for small workshops.\n\n## Pages\n\n' +
    listed.filter((p) => p.path !== '/').map((p) => `- [${p.title}](${SITE_URL}${p.path}): ${p.description}`).join('\n') +
    '\n',
);

console.log(`built ${pages.length} pages for ${SITE_URL}`);
