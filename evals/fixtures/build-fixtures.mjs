#!/usr/bin/env node
// Generates the static test sites (fixtures) used by the check-site tests and by the agent scenarios.
// Usage: node evals/fixtures/build-fixtures.mjs
//
// Every fixture is a fictitious brand ("Acme Widgets", origin https://acme-widgets.test).
// The generated dist/ folders are committed; expected.json and README.md are written by hand
// next to each dist/ and are never overwritten here. The images are generated (solid-colour PNG),
// never copied from a real site.
//
// Node >= 20, zero dependency.

import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = 'https://acme-widgets.test';
const LOCAL = 'http://localhost:4321';
const ORG_ID = `${SITE}/#organization`;
const WEBSITE_ID = `${SITE}/#website`;

// ---------- images ----------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
/** Solid-colour 8-bit RGB PNG. */
export function png(width, height, [r, g, b]) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) {
    row[1 + x * 3] = r;
    row[2 + x * 3] = g;
    row[3 + x * 3] = b;
  }
  const raw = Buffer.concat(Array(height).fill(row));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const OG_PNG = png(1200, 630, [29, 36, 51]);
const LOGO_PNG = png(512, 512, [214, 90, 49]);
const FAVICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">' +
  '<rect width="32" height="32" rx="6" fill="#1d2433"/><path d="M8 24 16 8l8 16z" fill="#fbfaf7"/></svg>\n';

// ---------- shared assets ----------

const CSS_OK = `:root { --ink: #1d2433; --paper: #fbfaf7; --accent: #d65a31; }
body { margin: 0; font-family: system-ui, sans-serif; color: var(--ink); background: var(--paper); }
header, main, footer { max-width: 42rem; margin: 0 auto; padding: 1rem; }
a { color: var(--accent); }
.later { content-visibility: auto; contain-intrinsic-size: auto 600px; }
`;
const CSS_CV_NO_SIZE = CSS_OK.replace(' contain-intrinsic-size: auto 600px;', '');
const APP_JS = `document.querySelectorAll('a[href^="https:"]').forEach((a) => { a.rel = 'noopener'; });\n`;

const INLINE_JS = "document.documentElement.classList.add('js');";
export const INLINE_HASH = 'sha256-' + createHash('sha256').update(INLINE_JS).digest('base64');

const CSP_OK =
  `default-src 'self'; script-src 'self' '${INLINE_HASH}'; style-src 'self'; img-src 'self' data:; ` +
  `font-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`;
const HEADERS_OK = `/*
  Content-Security-Policy: ${CSP_OK}
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  X-Frame-Options: DENY
`;

// ---------- HTML helpers ----------

/** JSON-LD serialisation that cannot close the script element. */
function ld(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}
function orgGraph(name = 'Acme Widgets', logo = `${SITE}/assets/logo.png`) {
  return ld({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', '@id': ORG_ID, name, url: `${SITE}/`, logo },
      { '@type': 'WebSite', '@id': WEBSITE_ID, url: `${SITE}/`, name: 'Acme Widgets', publisher: { '@id': ORG_ID } },
    ],
  });
}

function page(o) {
  const out = [];
  out.push('<!doctype html>');
  out.push(`<html lang="${o.lang ?? 'en'}">`);
  out.push('<head>');
  out.push('<meta charset="utf-8">');
  out.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
  out.push(`<title>${o.title}</title>`);
  out.push(`<meta name="description" content="${o.description}">`);
  out.push(`<meta name="robots" content="${o.robots ?? 'index, follow'}">`);
  if (o.canonical) out.push(`<link rel="canonical" href="${o.canonical}">`);
  out.push('<meta property="og:type" content="website">');
  out.push(`<meta property="og:site_name" content="${o.siteName ?? 'Acme Widgets'}">`);
  out.push(`<meta property="og:title" content="${o.title}">`);
  if (o.ogUrl) out.push(`<meta property="og:url" content="${o.ogUrl}">`);
  out.push(`<meta property="og:image" content="${o.ogImage ?? `${SITE}/assets/og.png`}">`);
  out.push('<meta name="twitter:card" content="summary_large_image">');
  out.push('<link rel="icon" href="/favicon.svg" type="image/svg+xml">');
  out.push('<link rel="stylesheet" href="/assets/site.css">');
  for (const h of o.headExtra ?? []) out.push(h);
  for (const block of o.jsonld ?? []) out.push(`<script type="application/ld+json">${block}</script>`);
  out.push('</head>');
  out.push('<body>');
  out.push(o.header);
  out.push('<main>');
  out.push(`<h1>${o.h1}</h1>`);
  out.push(o.body.trim());
  out.push('</main>');
  out.push(o.footer);
  for (const b of o.bodyEnd ?? []) out.push(b);
  out.push('</body>');
  out.push('</html>');
  return out.join('\n') + '\n';
}

const HEADER_EN =
  '<header><a href="/"><img src="/assets/logo.png" width="48" height="48" alt="Acme Widgets"></a>\n' +
  '<nav><a href="/about/">About</a> <a href="/blog/first-widget/">Blog</a></nav></header>';
const FOOTER_EN = '<footer><a href="/legal/">Legal notice</a></footer>';
const INLINE_SCRIPT_TAG = `<script>${INLINE_JS}</script>`;

function sitemap(entries) {
  const urls = entries
    .map((e) => `  <url>\n    <loc>${e.loc}</loc>\n    <lastmod>${e.lastmod}</lastmod>\n  </url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

const ROBOTS_OK = `# AI crawler policy: search and retrieval crawlers are allowed so that answers can cite the site.
# Training crawlers: allowed (owner decision, reviewed before launch).
User-agent: *
Allow: /

Sitemap: ${SITE}/sitemap.xml
`;

const LLMS_OK = `# Acme Widgets

> Acme Widgets designs modular, repairable widgets for small workshops.

## Pages

- [About Acme Widgets](${SITE}/about/): who builds the widgets and why they are repairable
- [How we test a widget before it ships](${SITE}/blog/first-widget/): the five bench checks
`;

// ---------- English site (clean and its defective variants) ----------

/**
 * @param {object} v variant switches (all default to the clean site)
 */
function englishSite(v = {}) {
  const canonOrigin = v.canonOrigin ?? SITE;
  const files = {};
  const orgName = v.orgNames ?? { home: 'Acme Widgets', about: 'Acme Widgets', article: 'Acme Widgets' };
  const logo = v.logo ?? `${SITE}/assets/logo.png`;
  const inline = v.inlineScript ?? 'all'; // 'all' | 'none' | 'article-unhashed'
  const bodyEnd = inline === 'all' ? [INLINE_SCRIPT_TAG] : [];
  const headJs = ['<script src="/assets/app.js" defer></script>'];

  const homeLd = [orgGraph(orgName.home, logo), ...(v.homeExtraLd ?? [])];
  files['index.html'] = page({
    title: 'Acme Widgets: modular widgets for small workshops',
    description:
      'Acme Widgets designs modular, repairable widgets for small workshops, with open dimensions and spare parts kept in stock for ten years.',
    robots: v.homeRobots,
    canonical: `${canonOrigin}/`,
    ogUrl: `${SITE}/`,
    headExtra: v.homeHeadExtra ?? headJs,
    jsonld: homeLd,
    header: HEADER_EN,
    h1: 'Modular widgets for small workshops',
    body:
      (v.homeComment ?? '') +
      `<p>Every Acme widget is built from the same twelve parts, so a workshop can repair, extend or resize it with a screwdriver.</p>
<p>${v.homeImg ?? '<img src="/assets/og.png" width="1200" height="630" alt="A modular widget on the test bench">'}</p>
<p>Read <a href="/blog/first-widget/">how we test a widget before it ships</a> or learn <a href="/about/">who we are</a>.</p>` +
      (v.homeExtraBody ?? ''),
    footer: FOOTER_EN,
    bodyEnd,
  });

  files['about/index.html'] = page({
    title: 'About Acme Widgets',
    description:
      'Who builds Acme Widgets, how the workshop is organised, and why every widget is designed to be repaired rather than replaced.',
    canonical: `${canonOrigin}/about/`,
    ogUrl: `${SITE}/about/`,
    jsonld: [
      orgGraph(orgName.about, logo),
      ld({
        '@context': 'https://schema.org',
        '@type': 'AboutPage',
        '@id': `${SITE}/about/#webpage`,
        url: `${SITE}/about/`,
        name: 'About Acme Widgets',
        about: { '@id': ORG_ID },
      }),
      ...(v.aboutExtraLd ?? []),
    ],
    headExtra: headJs,
    header: HEADER_EN,
    h1: 'About Acme Widgets',
    body:
      `<p>Acme Widgets is a small team of mechanical designers who got tired of throwing away tools that broke at one joint.</p>
<p>The workshop keeps spare parts for every widget it has ever sold, for at least ten years.</p>` + (v.aboutExtraBody ?? ''),
    footer: FOOTER_EN,
    bodyEnd,
  });

  const articleLd = v.articleLd ?? [
    orgGraph(orgName.article, logo),
    ld({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Article',
          '@id': `${SITE}/blog/first-widget/#article`,
          headline: 'How we test a widget before it ships',
          datePublished: '2026-10-01T09:00:00+02:00',
          dateModified: '2026-10-05T09:00:00+02:00',
          author: { '@id': ORG_ID },
          publisher: { '@id': ORG_ID },
          image: [`${SITE}/assets/og.png`],
          mainEntityOfPage: `${SITE}/blog/first-widget/`,
        },
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
            { '@type': 'ListItem', position: 2, name: 'How we test a widget before it ships', item: `${SITE}/blog/first-widget/` },
          ],
        },
      ],
    }),
  ];
  files['blog/first-widget/index.html'] = page({
    title: 'How we test a widget before it ships',
    description:
      'The five checks every Acme widget passes on the test bench before it leaves the workshop: load, heat, vibration, fit and finish.',
    canonical: `${canonOrigin}/blog/first-widget/`,
    ogUrl: `${SITE}/blog/first-widget/`,
    jsonld: [...articleLd, ...(v.articleExtraLd ?? [])],
    headExtra: headJs,
    header: HEADER_EN,
    h1: 'How we test a widget before it ships',
    body:
      `<p>Each widget goes through five checks on the bench: load, heat, vibration, fit and finish.</p>
<section class="later">
<h2>The load check</h2>
<p>The widget holds twice its rated load for ten minutes. Any visible deformation sends it back to assembly.</p>
<h2>The fit check</h2>
<p>Every joint is opened and closed twenty times with a standard screwdriver.</p>
</section>` + (v.articleExtraBody ?? ''),
    footer: FOOTER_EN,
    bodyEnd: inline === 'article-unhashed' ? ['<script>window.acmeStart = Date.now();</script>'] : bodyEnd,
  });

  files['legal/index.html'] = page({
    title: 'Legal notice | Acme Widgets',
    description:
      'Publisher, registered office, publication director and hosting provider of the Acme Widgets website, as required for a company website.',
    robots: 'noindex, follow',
    canonical: `${canonOrigin}/legal/`,
    ogUrl: `${SITE}/legal/`,
    jsonld: [orgGraph(orgName.home, logo)],
    headExtra: headJs,
    header: HEADER_EN,
    h1: 'Legal notice',
    body: `<p>Publisher: Acme Widgets Ltd, 14 Foundry Lane, Brookfield BR1 4QT. Phone: +44 20 7946 0000.</p>
<p>Publication director: the managing director of Acme Widgets Ltd.</p>
<p>Hosting provider: Northwind Hosting Ltd, 3 Harbour Road, Brookfield BR2 7LX. Phone: +44 20 7946 0001.</p>`,
    footer: FOOTER_EN,
    bodyEnd,
  });

  files['404.html'] = page({
    title: 'Page not found | Acme Widgets',
    description: 'The page you asked for does not exist. Go back to the Acme Widgets home page to find modular widgets.',
    robots: 'noindex',
    canonical: v.notFoundCanonical,
    jsonld: [orgGraph(orgName.home, logo)],
    headExtra: headJs,
    header: HEADER_EN,
    h1: 'Page not found',
    body: '<p>This page does not exist. <a href="/">Back to the home page</a>.</p>',
    footer: FOOTER_EN,
    bodyEnd,
  });

  files['robots.txt'] = v.robots ?? ROBOTS_OK;
  files['sitemap.xml'] = sitemap(
    v.sitemap ?? [
      { loc: `${SITE}/`, lastmod: '2026-09-01' },
      { loc: `${SITE}/about/`, lastmod: '2026-09-15' },
      { loc: `${SITE}/blog/first-widget/`, lastmod: '2026-10-05' },
    ],
  );
  if (v.llms !== null) files['llms.txt'] = v.llms ?? LLMS_OK;
  files['_headers'] = v.headers ?? HEADERS_OK;
  files['assets/site.css'] = v.css ?? CSS_OK;
  files['assets/app.js'] = APP_JS;
  files['assets/og.png'] = OG_PNG;
  files['assets/logo.png'] = LOGO_PNG;
  files['favicon.svg'] = FAVICON_SVG;
  return files;
}

// --- opening: the evening before launch, built with the local SITE_URL and the staging robots.txt
function openingSite() {
  return englishSite({
    canonOrigin: LOCAL,
    homeRobots: 'noindex',
    robots: 'User-agent: *\nDisallow: /\n',
    sitemap: [
      { loc: `${SITE}/`, lastmod: '2026-09-01' },
      { loc: `${SITE}/about/`, lastmod: '2026-09-15' },
      { loc: `${LOCAL}/blog/first-widget/`, lastmod: '2026-10-05' },
      { loc: `${SITE}/legal/`, lastmod: '2026-09-20' },
    ],
    aboutExtraBody: `
<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
<p>TODO: add the team photos and the workshop address.</p>`,
    notFoundCanonical: `${LOCAL}/404/`,
  });
}

// --- schema-geo: correct on the surface, structured data from another era, Cloudflare managed robots block
const CF_MANAGED_ROBOTS = `# BEGIN Cloudflare Managed content

User-agent: *
Content-signal: search=yes,ai-train=no
Allow: /

User-agent: Amazonbot
Disallow: /

User-agent: Applebot-Extended
Disallow: /

User-agent: Bytespider
Disallow: /

User-agent: CCBot
Disallow: /

User-agent: ClaudeBot
Disallow: /

User-agent: Google-Extended
Disallow: /

User-agent: GPTBot
Disallow: /

User-agent: meta-externalagent
Disallow: /

User-agent: OAI-SearchBot
Disallow: /

User-agent: PerplexityBot
Disallow: /

# END Cloudflare Managed Content

User-agent: *
Allow: /

Sitemap: ${SITE}/sitemap.xml
`;

function faqLd(pairs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: pairs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  };
}
function faqHtml(pairs) {
  return '\n<section>\n<h2>Frequently asked questions</h2>\n' + pairs.map(([q, a]) => `<h3>${q}</h3>\n<p>${a}</p>`).join('\n') + '\n</section>';
}

function schemaGeoSite() {
  const homeFaq = [
    ['How fast do widgets ship?', 'Our <b>modular</b> widgets ship within 48 hours.'],
    ['Can I repair a widget myself?', 'Yes. Every part can be replaced with a standard screwdriver.'],
  ];
  const aboutFaq = [['Where is the workshop?', 'The workshop is in Brookfield.']];
  const articleFaq = [['How long does the load check take?', 'Ten minutes per widget.']];
  // FAQ blocks are serialised raw on purpose: the "<b>" must stay unescaped (JSONLD-003).
  const rawLd = (obj) => JSON.stringify(obj);
  return englishSite({
    orgNames: { home: 'Acme', about: 'ACME Corp', article: 'Acme Widgets SAS' },
    logo: `${SITE}/favicon.svg`,
    robots: CF_MANAGED_ROBOTS,
    llms: null,
    homeComment: '<!-- FAQPage markup on every page = FAQ rich results in Google (SEO plan 2022) -->\n',
    homeExtraLd: [
      rawLd(faqLd(homeFaq)),
      ld({
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'Acme Widget Configurator',
        applicationCategory: 'DesignApplication',
        operatingSystem: 'Web',
        aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.9', ratingCount: '1287' },
      }),
    ],
    homeExtraBody: faqHtml(homeFaq) + '\n<p>Try the <strong>Acme Widget Configurator</strong> in your browser.</p>',
    aboutExtraLd: [
      // invalid JSON (trailing comma): JSONLD-001
      '{"@context":"https://schema.org","@type":"Organization","name":"ACME Corp","foundingDate":"2019",}',
      ld(faqLd(aboutFaq)),
    ],
    aboutExtraBody: faqHtml(aboutFaq),
    articleLd: [
      orgGraph('Acme Widgets SAS', `${SITE}/favicon.svg`),
      ld({
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: 'How we test a widget before it ships',
        datePublished: '2022-03-14',
        author: { '@type': 'Organization', name: 'Acme Widgets SAS' },
        image: '/assets/og.png',
        mainEntityOfPage: '/blog/first-widget/',
      }),
      ld({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: '/' },
          { '@type': 'ListItem', position: 2, name: 'How we test a widget before it ships', item: '/blog/first-widget/' },
        ],
      }),
    ],
    articleExtraLd: [ld(faqLd(articleFaq))],
    articleExtraBody: faqHtml(articleFaq),
  });
}

// --- headers-perf: correct content, weak headers, layout-shift and render-blocking traps
const HEADERS_WEAK = `/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY

/blog/*
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com
`;
function headersPerfSite() {
  return englishSite({
    inlineScript: 'article-unhashed',
    headers: HEADERS_WEAK,
    css: CSS_CV_NO_SIZE,
    homeHeadExtra: [
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap">',
      '<script src="/assets/app.js"></script>',
    ],
    homeImg: '<img src="/assets/og.png" alt="A modular widget on the test bench">',
  });
}

const WORKER_INGEST = `// Analytics relay: /ingest/* on the site is forwarded to the analytics vendor (EU region).
// Deployed as a Cloudflare Worker route in front of the static site.
const UPSTREAM = 'https://eu.analytics.example.com';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const upstream = new URL(url.pathname.replace(/^\\/ingest/, '') || '/', UPSTREAM);
    upstream.search = url.search;
    const response = await fetch(upstream, {
      method: request.method,
      headers: request.headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    });
    return new Response(response.body, { status: response.status, headers: response.headers });
  },
};
`;

// ---------- French site (privacy-fr) ----------

function frenchSite() {
  const files = {};
  const header =
    '<header><a href="/"><img src="/assets/logo.png" width="48" height="48" alt="Acme Widgets"></a>\n' +
    '<nav><a href="/a-propos/">À propos</a> <a href="/confidentialite/">Confidentialité</a></nav></header>';
  const footer = '<footer><a href="/mentions-legales/">Mentions légales</a> <a href="/confidentialite/">Confidentialité</a></footer>';
  const headExtra = [
    '<script async src="https://www.clarity.ms/tag/acmetest01"></script>',
    '<script src="/assets/visite.js" defer></script>',
  ];
  const common = { lang: 'fr', header, footer, headExtra };
  files['index.html'] = page({
    ...common,
    title: 'Acme Widgets : widgets modulaires pour ateliers',
    description:
      'Acme Widgets conçoit des widgets modulaires et réparables pour les petits ateliers, avec des pièces détachées gardées en stock dix ans.',
    canonical: `${SITE}/`,
    ogUrl: `${SITE}/`,
    jsonld: [orgGraph()],
    h1: 'Des widgets modulaires pour les petits ateliers',
    body: `<p>Chaque widget Acme est construit à partir des mêmes douze pièces : un atelier peut le réparer ou l'agrandir avec un simple tournevis.</p>
<p>Découvrez <a href="/a-propos/">qui nous sommes</a>.</p>`,
  });
  files['a-propos/index.html'] = page({
    ...common,
    title: "À propos d'Acme Widgets",
    description:
      "Qui fabrique les widgets Acme, comment l'atelier est organisé, et pourquoi chaque widget est conçu pour être réparé plutôt que remplacé.",
    canonical: `${SITE}/a-propos/`,
    ogUrl: `${SITE}/a-propos/`,
    jsonld: [orgGraph()],
    h1: "À propos d'Acme Widgets",
    body: `<p>Acme Widgets est une petite équipe de concepteurs mécaniques. L'atelier garde des pièces détachées pour chaque widget vendu.</p>`,
  });
  files['confidentialite/index.html'] = page({
    ...common,
    title: 'Confidentialité | Acme Widgets',
    description:
      "Comment Acme Widgets traite les données des visiteurs de son site : mesure d'audience, formulaires de contact et droits des personnes.",
    canonical: `${SITE}/confidentialite/`,
    ogUrl: `${SITE}/confidentialite/`,
    jsonld: [orgGraph()],
    h1: 'Politique de confidentialité',
    body: `<p>Ce site n'utilise aucun traceur.</p>
<p>Nous mesurons l'audience de façon anonyme pour améliorer nos pages.</p>
<p>Pour exercer vos droits, écrivez-nous à l'adresse indiquée dans les mentions légales.</p>`,
  });
  files['mentions-legales/index.html'] = page({
    ...common,
    title: 'Mentions légales | Acme Widgets',
    description: "Informations sur l'éditeur du site Acme Widgets : dénomination, siège social, capital et immatriculation de la société.",
    robots: 'noindex, follow',
    canonical: `${SITE}/mentions-legales/`,
    ogUrl: `${SITE}/mentions-legales/`,
    jsonld: [orgGraph()],
    h1: 'Mentions légales',
    body: `<p>Éditeur : Acme Widgets SAS, société par actions simplifiée au capital de 10 000 €, 1 rue de l'Exemple, 75000 Paris.</p>
<p>Téléphone : 01 00 00 00 00. RCS Paris 000 000 000.</p>`,
  });
  files['404.html'] = page({
    ...common,
    title: 'Page introuvable | Acme Widgets',
    description: "La page demandée n'existe pas. Revenez à l'accueil d'Acme Widgets pour découvrir nos widgets modulaires.",
    robots: 'noindex',
    jsonld: [orgGraph()],
    h1: 'Page introuvable',
    body: `<p>Cette page n'existe pas. <a href="/">Retour à l'accueil</a>.</p>`,
  });
  files['robots.txt'] = `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`;
  files['sitemap.xml'] = sitemap([
    { loc: `${SITE}/`, lastmod: '2026-09-01' },
    { loc: `${SITE}/a-propos/`, lastmod: '2026-09-10' },
    { loc: `${SITE}/confidentialite/`, lastmod: '2026-09-20' },
  ]);
  files['llms.txt'] = `# Acme Widgets

> Acme Widgets conçoit des widgets modulaires et réparables pour les petits ateliers.

## Pages

- [À propos](${SITE}/a-propos/): l'équipe et l'atelier
- [Confidentialité](${SITE}/confidentialite/): données des visiteurs
`;
  files['_headers'] = `/*
  Content-Security-Policy: default-src 'self'; script-src 'self' https://www.clarity.ms; connect-src 'self' https://*.clarity.ms; img-src 'self' data: https://*.clarity.ms; style-src 'self'; font-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  X-Frame-Options: DENY
`;
  files['assets/site.css'] = CSS_OK;
  files['assets/visite.js'] = `// Identifiant de visite, conservé le temps de l'onglet, envoyé avec chaque événement de mesure.
if (!sessionStorage.getItem('acme_visite')) {
  sessionStorage.setItem('acme_visite', crypto.randomUUID());
}
`;
  files['assets/og.png'] = OG_PNG;
  files['assets/logo.png'] = LOGO_PNG;
  files['favicon.svg'] = FAVICON_SVG;
  return files;
}

// ---------- write ----------

function writeTree(base, files) {
  rmSync(base, { recursive: true, force: true });
  for (const [rel, content] of Object.entries(files)) {
    const p = join(base, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
}

function main() {
  writeTree(join(HERE, 'clean', 'dist'), englishSite());
  writeTree(join(HERE, 'opening', 'dist'), openingSite());
  writeTree(join(HERE, 'schema-geo', 'dist'), schemaGeoSite());
  writeTree(join(HERE, 'headers-perf', 'dist'), headersPerfSite());
  writeTree(join(HERE, 'headers-perf', 'worker'), { 'ingest-proxy.mjs': WORKER_INGEST });
  writeTree(join(HERE, 'privacy-fr', 'dist'), frenchSite());
  // source-project: only the generated images; the sources are written by hand.
  writeTree(join(HERE, 'source-project', 'public', 'assets', 'img'), { 'og.png': OG_PNG, 'logo.png': LOGO_PNG });
  console.log(`fixtures written; inline script hash ${INLINE_HASH}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
