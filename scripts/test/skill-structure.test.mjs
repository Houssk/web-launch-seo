// Shape of the skill (docs/spec.md sections 1 and 4.6). Written by the tester; red on the current
// version (b947a12: no references/, second-person description), green once the developer delivers.
// Run: node --test scripts/test/check-site.test.mjs scripts/test/skill-structure.test.mjs   (Node >= 20, zero dependency)

import { describe, test } from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const SKILL = join(ROOT, 'SKILL.md');
const REFS = join(ROOT, 'references');

// Target structure (spec section 1).
const EXPECTED_REFERENCES = [
  'ai-crawlers.md', 'build-guards.md', 'cloudflare.md', 'geo.md', 'keywords.md', 'on-page-seo.md',
  'performance.md', 'post-launch.md', 'pre-launch.md', 'privacy-legal-fr.md', 'publishing-routine.md',
  'security-headers.md', 'structured-data.md',
];
// Section plan imposed on SKILL.md (spec section 1, "Contenu de SKILL.md").
const REQUIRED_HEADINGS = ['How to use', 'Phase router', 'Run the checker', 'Non-negotiable guardrails', 'Report format'];
// No client data anywhere in what ships (spec 4.6; docs/ is the owner's folder and is excluded).
// The repository is public: the forbidden tokens are stored only as SHA-256 fingerprints of the
// lower-case token, never in clear. Each word of a shipped file (and each hyphen part, and each pair
// of consecutive words joined by "-") is hashed and compared. To add a token:
//   node -e "console.log(require('crypto').createHash('sha256').update('<token>').digest('hex'))"
const FORBIDDEN_TOKEN_SHA256 = new Set([
  '1e29483aed344bcf779b26926caf470a5c26e33cf3ffb34842a9fadce7b7b008',
  'a3935fbff43b1de97a3fce7b937e63c0dc40db017a98fa2bed4b1dccc19ebe7c',
  'a595025eac6566f05489599864bdf9b710e3727125503482f05c767a4e7f7cd2',
  '832c2dad609f5273937ab6771db237e7fa4b5967d8d63f69e2f470b827fc64ad',
  'b6e23e1dbd68b8c27d9c8719e7b392f98c4376e84684089b8d3653e0f04d490f',
  '6149c577c04fed00827faba678c1f38cffba91fce124ea790ae7dddea95594f0',
]);
// Generic secret formats (not names): analytics project keys, CAPTCHA site keys.
const SECRET_PATTERNS = [/\bphc_[0-9a-z]{10,}/i, /turnstile[^\n]{0,40}\b0x[0-9a-z_-]{10,}/i];

/** Fingerprints (first 12 hex) of the forbidden tokens found in a text. */
function forbiddenTokens(text) {
  const words = text.toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) ?? [];
  const candidates = new Set();
  words.forEach((w, i) => {
    candidates.add(w);
    for (const part of w.split('-')) candidates.add(part);
    if (i + 1 < words.length) candidates.add(`${w}-${words[i + 1]}`);
  });
  const found = new Set();
  for (const c of candidates) {
    const h = createHash('sha256').update(c).digest('hex');
    if (FORBIDDEN_TOKEN_SHA256.has(h)) found.add(h.slice(0, 12));
  }
  return [...found];
}

const skillText = () => readFileSync(SKILL, 'utf8');
function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(m, 'SKILL.md has no YAML frontmatter');
  const fields = {};
  for (const line of m[1].split(/\r?\n/)) {
    const f = line.match(/^([a-z_]+):\s*(.*)$/);
    if (f) fields[f[1]] = f[2].replace(/^["']|["']$/g, '');
  }
  return fields;
}
const refFiles = () => (existsSync(REFS) ? readdirSync(REFS).filter((f) => f.endsWith('.md')).sort() : []);
function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (f === '.git' || f === 'node_modules' || f.startsWith('.')) return [];
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const TEXT_EXT = /\.(md|mjs|js|json|txt|html|xml|css|svg|toml|yml|yaml)$|_headers$/;

describe('SKILL.md (spec 4.6)', () => {
  test('200 lines at most (target 150)', () => {
    const lines = skillText().split(/\r?\n/).length;
    assert.ok(lines <= 200, `SKILL.md has ${lines} lines`);
  });

  test('name: lower case, digits, hyphens, 64 characters at most, no reserved word', () => {
    const { name } = frontmatter(skillText());
    assert.match(name ?? '', /^[a-z0-9-]{1,64}$/);
    assert.doesNotMatch(name, /anthropic|claude/);
  });

  test('description: present, 1024 characters at most, no XML tag', () => {
    const { description } = frontmatter(skillText());
    assert.ok(description && description.length > 0, 'description missing');
    assert.ok(description.length <= 1024, `description is ${description.length} characters`);
    assert.doesNotMatch(description, /<[a-z][^>]*>/i, 'XML tag in the description');
  });

  test('description in the third person: starts neither with "I", "You" nor an imperative "Use"', () => {
    const { description } = frontmatter(skillText());
    assert.doesNotMatch(description, /^(I|You|Use)\b/, `description starts with: ${description.slice(0, 40)}`);
  });

  test('description carries the trigger words of the spec', () => {
    const { description } = frontmatter(skillText());
    for (const word of ['launch', 'staging', 'noindex', 'robots.txt', 'sitemap', 'canonical', 'JSON-LD', 'Core Web Vitals', 'llms.txt', 'AI crawlers', 'security headers', 'Cloudflare']) {
      assert.ok(description.toLowerCase().includes(word.toLowerCase()), `trigger word missing: ${word}`);
    }
  });

  test('section plan: How to use, Phase router, Run the checker, Non-negotiable guardrails, Report format', () => {
    const text = skillText();
    for (const h of REQUIRED_HEADINGS) assert.match(text, new RegExp(`^## ${h}\\b`, 'm'), `missing "## ${h}"`);
  });

  test('the checker is run, with both commands (--dist before deploy, --url after)', () => {
    const text = skillText();
    assert.ok(existsSync(join(ROOT, 'scripts', 'check-site.mjs')), 'scripts/check-site.mjs missing');
    assert.match(text, /scripts\/check-site\.mjs --dist/);
    assert.match(text, /scripts\/check-site\.mjs --url/);
  });

  test('report format names its three sections: Fixed, Needs owner decision, Not verified', () => {
    const text = skillText();
    for (const s of ['Fixed', 'Needs owner decision', 'Not verified']) assert.ok(text.includes(s), `missing "${s}"`);
  });
});

describe('references/ (spec sections 1 and 4.6)', () => {
  test('the 13 reference files of the target structure exist', () => {
    assert.deepEqual(refFiles(), [...EXPECTED_REFERENCES].sort());
  });

  test('every references/*.md link of SKILL.md exists', () => {
    const links = [...skillText().matchAll(/references\/([a-z0-9-]+\.md)/g)].map((m) => m[1]);
    for (const l of links) assert.ok(existsSync(join(REFS, l)), `SKILL.md links missing references/${l}`);
  });

  test('every reference file is linked from SKILL.md', () => {
    const text = skillText();
    const files = refFiles();
    assert.ok(files.length > 0, 'references/ is empty or missing');
    for (const f of files) assert.ok(text.includes(`references/${f}`), `references/${f} is not linked from SKILL.md`);
  });

  test('one level deep: no reference links another reference', () => {
    for (const f of refFiles()) {
      const text = readFileSync(join(REFS, f), 'utf8');
      const others = refFiles().filter((o) => o !== f && (text.includes(`references/${o}`) || text.includes(`](${o})`) || text.includes(`](./${o})`)));
      assert.deepEqual(others, [], `references/${f} links ${others.join(', ')}`);
    }
  });

  test('a reference over 100 lines starts with "## Contents" (first 15 lines)', () => {
    for (const f of refFiles()) {
      const lines = readFileSync(join(REFS, f), 'utf8').split(/\r?\n/);
      if (lines.length > 100) assert.ok(lines.slice(0, 15).some((l) => /^## Contents\b/.test(l)), `references/${f}: ${lines.length} lines, no "## Contents"`);
    }
  });

  test('every "Source:" line carries a URL and a read date', () => {
    for (const f of refFiles()) {
      readFileSync(join(REFS, f), 'utf8')
        .split(/\r?\n/)
        .filter((l) => /\bSource:/.test(l))
        .forEach((l) => assert.match(l, /https?:\/\/\S+.*\b20\d\d-\d\d-\d\d\b/, `references/${f}: ${l.trim()}`));
    }
  });

  test('a "Recommendation" is either sourced or labelled "Recommendation (unsourced)"', () => {
    for (const f of refFiles()) {
      readFileSync(join(REFS, f), 'utf8')
        .split(/\r?\n/)
        .filter((l) => /\bRecommendation\b/.test(l))
        .forEach((l) => assert.match(l, /Recommendation \(unsourced\)|Source:/, `references/${f}: ${l.trim()}`));
    }
  });

  test('a reference that states a dated fact has at least one Source line', () => {
    for (const f of refFiles()) {
      const text = readFileSync(join(REFS, f), 'utf8');
      if (/\b20\d\d-\d\d-\d\d\b/.test(text)) assert.match(text, /\bSource:/, `references/${f} has dates but no Source line`);
    }
  });
});

describe('repository hygiene (spec 4.6, T1)', () => {
  const shipped = () =>
    ['SKILL.md', 'README.md', 'references', 'scripts', 'evals']
      .flatMap((p) => (existsSync(join(ROOT, p)) && statSync(join(ROOT, p)).isDirectory() ? walk(join(ROOT, p)) : [join(ROOT, p)]))
      .filter((p) => existsSync(p) && TEXT_EXT.test(p)); // this file included: it holds no name in clear

  test('no client data in the skill, the scripts or the test bench', () => {
    const hits = [];
    for (const p of shipped()) {
      const text = readFileSync(p, 'utf8');
      for (const h of forbiddenTokens(text)) hits.push(`${relative(ROOT, p)}: forbidden token sha256:${h}`);
      for (const re of SECRET_PATTERNS) if (re.test(text)) hits.push(`${relative(ROOT, p)}: ${re}`);
    }
    assert.deepEqual(hits, []);
  });

  test('no backslash in a path written in SKILL.md or references/', () => {
    const files = [SKILL, ...refFiles().map((f) => join(REFS, f))];
    for (const p of files) {
      const bad = readFileSync(p, 'utf8').match(/\b[\w.-]+\\[\w.-]+\\?[\w.-]*/g) ?? [];
      assert.deepEqual(bad.filter((b) => !/\\[nrtu0]/.test(b)), [], `${relative(ROOT, p)}: backslash path`);
    }
  });
});
