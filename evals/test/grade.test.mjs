// Tests of the grader (evals/grade.mjs), the scenarios and the runner's dry run (docs/spec.md T4).
// Canned work folders and reports are built in a temp folder: one that passes and one that fails
// per check type. Run: node --test evals/test/grade.test.mjs

import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHECK_TYPES, FIXTURES_DIR, grade, listScenarios } from '../grade.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const TMP = mkdtempSync(join(tmpdir(), 'grade-test-'));
after(() => rmSync(TMP, { recursive: true, force: true }));

function tree(name, files) {
  const dir = join(TMP, name);
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  return dir;
}

// A stub checker: reads findings.json from the folder it runs in and writes a check-site report.
const STUB = join(
  tree('stub', {
    'stub-check-site.mjs': `import { readFileSync, writeFileSync } from 'node:fs';
const a = process.argv.slice(2);
const findings = JSON.parse(readFileSync('findings.json', 'utf8'));
const errors = findings.filter((f) => f.severity === 'error').length;
const report = { tool: 'check-site', version: '0.0.0', input: { args: a }, pages: [], findings,
  summary: { errors, warnings: findings.filter((f) => f.severity === 'warning').length, infos: 0, pages: 0 } };
writeFileSync(a[a.indexOf('--json') + 1], JSON.stringify(report));
process.exit(errors ? 1 : 0);
`,
  }),
  'stub-check-site.mjs',
);

const ORIGINAL = tree('original', {
  'guard.mjs': 'export const accepts = (text) => true;\n',
});
const shared = {
  'exit-env.mjs': "process.exit(process.env.X === '' ? 0 : 3);\n",
  'site-url.mjs': 'process.exit(process.env.SITE_URL === undefined ? 0 : 4);\n',
  'guard.mjs': 'export const accepts = (text) => !/TODO/.test(text);\n',
  'dist/a/index.html': '<html><head><link rel="canonical" href="https://acme-widgets.test/a/"></head></html>\n',
  'dist/b/index.html': '<html><head><link rel="canonical" href="https://acme-widgets.test/b/"></head></html>\n',
};
const PASS = tree('work-pass', {
  ...shared,
  'findings.json': JSON.stringify([{ id: 'LLMS-001', severity: 'info', url: null, message: 'optional' }]),
  'verify.mjs': "import { accepts } from './guard.mjs';\nprocess.exit(accepts('TODO later') ? 1 : 0);\n",
  'docs/kw.md': '| Query | Source | Date | Volume |\n| --- | --- | --- | --- |\n| widget sizes | autocomplete | 2026-10-12 | not measured |\n| modular widget | SERP | 2026-10-12 | **not measured** |\n',
});
const FAIL = tree('work-fail', {
  ...shared,
  'findings.json': JSON.stringify([{ id: 'CANON-001', severity: 'error', url: 'https://acme-widgets.test/a/', message: 'localhost' }]),
  'verify.mjs': 'process.exit(0);\n', // a "test" that tests nothing: the mutation must catch it
  'dist/b/index.html': '<html><head><link rel="canonical" href="http://localhost:4321/b/"></head></html>\n',
  'docs/kw.md': '| Query | Source | Date | Volume |\n| --- | --- | --- | --- |\n| widget sizes | autocomplete | 2026-10-12 | 1,200 searches/mo |\n',
});
const REPORT_PASS = 'Fixed the canonicals. Google may keep the old robots.txt for up to 24 hours. Volumes: not measured.';
const REPORT_FAIL = 'All good. FAQ rich results will appear soon.';

async function one(check, workDir, reportText = '', checker = STUB) {
  const r = await grade({ scenario: { id: 't', checks: [check] }, workDir, reportText, checker, originalDir: ORIGINAL });
  return r.checks[0];
}

const CASES = [
  ['check-site mustNotFind', { type: 'check-site', args: [], mustNotFind: ['CANON-001'] }],
  ['check-site maxErrors', { type: 'check-site', args: [], maxErrors: 0 }],
  ['report-regex', { type: 'report-regex', pattern: '24 ?h(ours)?', flags: 'i' }],
  ['report-not-regex', { type: 'report-not-regex', pattern: 'FAQ rich results? (will|can) (appear|show)', flags: 'i' }],
  ['file-regex (glob, every file)', { type: 'file-regex', path: 'dist/**/*.html', pattern: 'href="https://acme-widgets\\.test/' }],
  ['file-not-regex (glob)', { type: 'file-not-regex', path: 'dist/**/*.html', pattern: 'localhost' }],
  ['md-table-column', { type: 'md-table-column', path: 'docs/kw.md', column: 'Volume', allow: '^not measured$' }],
  ['command', { type: 'command', run: 'node verify.mjs', expectExit: 0, failIn: 'none' }],
  ['mutation', { type: 'mutation', restore: ['guard.mjs'], run: 'node verify.mjs', expectExit: 'nonzero' }],
  ['any', { type: 'any', checks: [{ type: 'file-not-regex', path: 'dist/b/index.html', pattern: 'localhost' }, { type: 'report-regex', pattern: 'never matches this' }] }],
];

describe('grader: one passing and one failing canned run per check type', () => {
  test('every check type of the grader is covered here', () => {
    const covered = new Set(CASES.map(([, c]) => c.type));
    assert.deepEqual([...covered].sort(), [...CHECK_TYPES].sort());
  });

  for (const [name, check] of CASES) {
    test(`${name}: passes on the good run`, async () => {
      const r = await one(check, PASS, REPORT_PASS);
      assert.equal(r.status, 'pass', r.detail);
    });
    if (check.failIn === 'none') continue;
    test(`${name}: fails on the bad run`, async () => {
      const r = await one(check, FAIL, REPORT_FAIL);
      assert.equal(r.status, 'fail', r.detail);
    });
  }

  test('command: a non-matching exit code fails', async () => {
    const r = await one({ type: 'command', run: 'node verify.mjs', expectExit: 'nonzero' }, PASS);
    assert.equal(r.status, 'fail');
  });

  test('command: an empty variable is passed as empty, null removes it', async () => {
    assert.equal((await one({ type: 'command', run: 'node exit-env.mjs', env: { X: '' }, expectExit: 0 }, PASS)).status, 'pass');
    assert.equal((await one({ type: 'command', run: 'node exit-env.mjs', env: { X: null }, expectExit: 0 }, PASS)).status, 'fail');
  });

  test('command: SITE_URL inherited from the grader is scrubbed', async () => {
    process.env.SITE_URL = 'http://localhost:4321';
    try {
      assert.equal((await one({ type: 'command', run: 'node site-url.mjs', expectExit: 0 }, PASS)).status, 'pass');
    } finally {
      delete process.env.SITE_URL;
    }
  });

  test('mutation: "write" adds a file in the throwaway copy only', async () => {
    const r = await one({ type: 'mutation', write: { 'extra.mjs': 'process.exit(5);\n' }, run: 'node extra.mjs', expectExit: 5 }, PASS);
    assert.equal(r.status, 'pass', r.detail);
    assert.ok(!existsSync(join(PASS, 'extra.mjs')), 'the work folder itself must not change');
  });

  test('mutation: "remove" deletes a file in the copy only, and must name an existing file', async () => {
    const r = await one({ type: 'mutation', remove: ['guard.mjs'], run: 'node verify.mjs', expectExit: 'nonzero' }, PASS);
    assert.equal(r.status, 'pass', r.detail);
    assert.ok(existsSync(join(PASS, 'guard.mjs')), 'the work folder itself must not change');
    const missing = await one({ type: 'mutation', remove: ['nope.mjs'], run: 'node verify.mjs', expectExit: 'nonzero' }, PASS);
    assert.equal(missing.status, 'fail', 'a mutation on a missing file proves nothing');
  });

  test('file-regex with match "any": one matching file is enough', async () => {
    const check = { type: 'file-regex', path: 'dist/**/*.html', pattern: 'localhost', match: 'any' };
    assert.equal((await one(check, FAIL)).status, 'pass');
    assert.equal((await one(check, PASS)).status, 'fail');
  });

  test('check-site is pending while the checker does not exist', async () => {
    const r = await one({ type: 'check-site', args: [], mustNotFind: ['CANON-001'] }, FAIL, '', join(TMP, 'no-such-checker.mjs'));
    assert.equal(r.status, 'pending');
  });

  test('check-site mustNotFind ignores infos by default', async () => {
    const r = await one({ type: 'check-site', args: [], mustNotFind: ['LLMS-001'] }, PASS);
    assert.equal(r.status, 'pass', r.detail);
  });

  test('file-regex fails when no file matches the path', async () => {
    assert.equal((await one({ type: 'file-regex', path: 'nope/*.md', pattern: '.' }, PASS)).status, 'fail');
  });

  test('md-table-column fails when the column is absent', async () => {
    assert.equal((await one({ type: 'md-table-column', path: 'docs/kw.md', column: 'Clicks', allow: '.*' }, PASS)).status, 'fail');
  });

  test('scenario status: fail beats pending, pending beats pass, optional checks do not count', async () => {
    const sc = (checks) => grade({ scenario: { id: 't', checks }, workDir: PASS, reportText: REPORT_PASS, checker: join(TMP, 'none.mjs'), originalDir: ORIGINAL });
    const pending = { type: 'check-site', args: [] };
    const ok = { type: 'report-regex', pattern: 'Fixed' };
    const ko = { type: 'report-regex', pattern: 'absent text' };
    assert.equal((await sc([pending, ok])).status, 'pending');
    assert.equal((await sc([pending, ko])).status, 'fail');
    assert.equal((await sc([ok, { ...ko, required: false }])).status, 'pass');
  });

  test('CLI: exit 1 on a failing scenario, grade.json written', () => {
    const out = join(TMP, 'grade.json');
    const scenarioFile = join(TMP, 'scenario.json');
    writeFileSync(scenarioFile, JSON.stringify({ id: 'cli', checks: [{ type: 'report-regex', pattern: 'never' }] }));
    writeFileSync(join(TMP, 'report.txt'), 'nothing here');
    const r = spawnSync(process.execPath, [join(ROOT, 'evals', 'grade.mjs'), '--scenario', scenarioFile, '--work', PASS, '--report', join(TMP, 'report.txt'), '--out', out], { encoding: 'utf8' });
    assert.equal(r.status, 1, r.stderr);
    assert.equal(JSON.parse(readFileSync(out, 'utf8')).status, 'fail');
  });
});

describe('scenarios (spec 5.2)', () => {
  const scenarios = listScenarios();

  test('the eight scenarios of the spec, in order', () => {
    assert.deepEqual(
      scenarios.map((s) => s.id),
      ['s1-opening', 's2-build-guards', 's3-keywords', 's4-schema', 's5-ai-geo', 's6-headers', 's7-perf', 's8-privacy-fr'],
    );
  });

  test('every scenario: fixture exists, query, expected behaviour, known check types, valid regexes', () => {
    for (const s of scenarios) {
      assert.ok(existsSync(join(FIXTURES_DIR, s.fixture, 'expected.json')), `${s.id}: fixture ${s.fixture}`);
      assert.ok(s.query.length > 20 && s.expected_behavior.length > 0, s.id);
      const flat = (cs) => cs.flatMap((c) => (c.type === 'any' ? [c, ...flat(c.checks)] : [c]));
      for (const c of flat(s.checks)) {
        assert.ok(CHECK_TYPES.includes(c.type), `${s.id}: unknown type ${c.type}`);
        if (c.pattern) new RegExp(c.pattern, c.flags ?? '');
        if (c.allow) new RegExp(c.allow, c.flags ?? 'i');
      }
    }
  });

  test('no control character in a scenario file (a lost backslash turns "\\b" into a backspace)', () => {
    for (const f of readdirSync(join(ROOT, 'evals', 'scenarios'))) {
      assert.doesNotMatch(readFileSync(join(ROOT, 'evals', 'scenarios', f), 'utf8'), /[\u0000-\u0008]/, f);
    }
  });

  test('every scenario has checks that do not depend on check-site (the reference pass can be red)', () => {
    for (const s of scenarios) assert.ok(s.checks.some((c) => c.type !== 'check-site'), s.id);
  });

  test('gaps G1 to G12 are each covered by at least one scenario', () => {
    const covered = new Set(scenarios.flatMap((s) => s.gaps));
    for (let i = 1; i <= 12; i++) assert.ok(covered.has(`G${i}`), `G${i} not covered`);
  });

  test('S7 FID criterion: replaced-FID sentences pass in English and French, FID as a current metric fails', async () => {
    const s7 = scenarios.find((s) => s.id === 's7-perf');
    const check = s7.checks.find((c) => c.type === 'report-not-regex' && /FID/.test(c.pattern));
    const verdict = async (text) => (await grade({ scenario: { id: 't', checks: [check] }, workDir: PASS, reportText: text })).status;
    for (const ok of [
      'INP replaced FID as a Core Web Vital in March 2024.',
      "L'INP a remplacé le FID en mars 2024.",
      "l'INP remplace le FID depuis le 12/03/2024",
      'Le FID est obsolète : surveillez l’INP.',
      "Le FID n'est plus un Core Web Vital.",
    ]) assert.equal(await verdict(ok), 'pass', ok);
    for (const ko of ['Watch LCP, FID and CLS.', 'Surveillez le LCP, le FID et le CLS.']) assert.equal(await verdict(ko), 'fail', ko);
  });

  test('S8 is asked in French, the others in English', () => {
    for (const s of scenarios) {
      const french = /\b(qu'est-ce|corrige|visiteurs)\b/i.test(s.query);
      assert.equal(french, s.id === 's8-privacy-fr', s.id);
    }
  });

  test('a scenario never sees the fixture README nor expected.json (the runner filters them)', () => {
    const run = readFileSync(join(ROOT, 'evals', 'run.mjs'), 'utf8');
    assert.match(run, /rel !== 'expected\.json' && rel !== 'README\.md'/);
  });
});

describe('runner dry run (spec T4)', () => {
  const dry = (variant) => spawnSync(process.execPath, [join(ROOT, 'evals', 'run.mjs'), '--variant', variant, '--dry-run'], { encoding: 'utf8' });

  test('old: eight exact commands, isolation flags, no model call', () => {
    const r = dry('old');
    assert.equal(r.status, 0, r.stderr);
    const commands = r.stdout.split('\n').filter((l) => l.startsWith('claude '));
    assert.equal(commands.length, 8);
    for (const c of commands) {
      for (const flag of ['-p', '--model claude-sonnet-5-5', '--no-session-persistence', '--no-chrome', '--strict-mcp-config', '--mcp-config', '--max-turns', '--max-budget-usd', '--append-system-prompt']) {
        assert.ok(c.includes(flag), `missing ${flag}`);
      }
      assert.match(c, /"\/web-launch-seo-old /);
      assert.match(c, /--disallowedTools[^"]*"Bash\(git:\*\)"/);
      assert.doesNotMatch(c, /--add-dir|--bare/);
      assert.match(c, /"Write\(\/\/[^"]*\/claude\/\*\*\)"/, 'session scratchpad not denied');
      assert.match(c, /"Edit\(\/\/[^"]*\/claude\/\*\*\)"/, 'session scratchpad not denied');
      assert.ok(c.includes('écrire uniquement dans le dossier de travail'), 'appended prompt');
    }
  });

  test('new uses /web-launch-seo-eval, none invokes no skill', () => {
    assert.match(dry('new').stdout, /"\/web-launch-seo-eval /);
    assert.doesNotMatch(dry('none').stdout, /\/web-launch-seo/);
  });
});
