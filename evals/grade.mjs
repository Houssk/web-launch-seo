#!/usr/bin/env node
// Deterministic grader for one agent run (docs/spec.md 5.2 and "Amendements du contrôleur").
// No model is involved: every check is a regex, a file test, a command exit code or a check-site run.
//
// Usage:
//   node evals/grade.mjs --scenario s1-opening --work <dir> --report <result.txt> [--out grade.json] [--checker <path>]
//
// Check types (all required unless "required": false), evaluated in order on the work folder:
//   check-site       runs the checker (default scripts/check-site.mjs) in the work folder with "args" + --json;
//                    "mustNotFind": ids absent (severities error and warning unless "severities" is given),
//                    "mustFind": ids present, "maxErrors": summary.errors <= n.
//                    The check is "pending" while the checker does not exist (it is re-graded later).
//   report-regex     the agent's final text matches "pattern" ("flags").
//   report-not-regex the agent's final text does not match.
//   file-regex       every file matched by "path" (glob: * and **) matches; at least one file must exist.
//                    With "match": "any", one matching file is enough.
//   file-not-regex   no file matched by "path" matches (a missing file passes).
//   md-table-column  every cell of column "column" in the Markdown tables of "path" matches "allow".
//   command          "run" (shell) in the work folder with "env" (null removes a variable) exits with
//                    "expectExit": a number or "nonzero".
//   mutation         same as command, but in a throwaway copy of the work folder where the files of
//                    "restore" are put back from the original fixture (deleted if absent there), the
//                    files of "remove" are deleted (they must exist) and the files of "write" are
//                    written: proves that the agent's tests really guard.
//   any              passes when one of "checks" passes.
//
// A scenario is "fail" when a required check fails, "pending" when none fails but one is pending,
// "pass" otherwise.

import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '..');
export const SCENARIOS_DIR = join(HERE, 'scenarios');
export const FIXTURES_DIR = join(HERE, 'fixtures');
export const DEFAULT_CHECKER = join(ROOT, 'scripts', 'check-site.mjs');
const COMMAND_TIMEOUT_MS = 5 * 60_000; // a build of a fixture takes well under a second; 5 min leaves room for npm on Windows
// Variables that the fixtures read: removed from the inherited environment so a command only sees
// what its check declares.
const SCRUBBED_ENV = ['SITE_URL', 'PUBLIC_INDEXABLE', 'DEPLOY_TARGET'];

export function loadScenario(idOrPath) {
  if (existsSync(idOrPath) && statSync(idOrPath).isFile()) return JSON.parse(readFileSync(idOrPath, 'utf8'));
  const file = readdirSync(SCENARIOS_DIR).find((f) => f === `${idOrPath}.json` || f.startsWith(`${idOrPath}-`));
  if (!file) throw new Error(`unknown scenario ${idOrPath}`);
  return JSON.parse(readFileSync(join(SCENARIOS_DIR, file), 'utf8'));
}

export function listScenarios() {
  return readdirSync(SCENARIOS_DIR)
    .filter((f) => /^s\d+-.*\.json$/.test(f))
    .sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10))
    .map((f) => JSON.parse(readFileSync(join(SCENARIOS_DIR, f), 'utf8')));
}

// ---------------------------------------------------------------- files

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      re += '.*';
      i++;
      if (glob[i + 1] === '/') i++;
    } else if (c === '*') re += '[^/]*';
    else re += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

export function expand(workDir, pattern) {
  if (!pattern.includes('*')) return existsSync(join(workDir, pattern)) ? [join(workDir, pattern)] : [];
  const re = globToRegExp(pattern);
  return walk(workDir).filter((p) => re.test(relative(workDir, p).split('\\').join('/')));
}

function copyWork(src) {
  const dst = mkdtempSync(join(tmpdir(), 'wls-grade-'));
  cpSync(src, dst, { recursive: true }); // .claude included: the agent's tests may call the skill copy
  return dst;
}

// ---------------------------------------------------------------- processes

function runCommand(command, { cwd, env = {}, args, timeoutMs = COMMAND_TIMEOUT_MS }) {
  const base = { ...process.env };
  for (const k of SCRUBBED_ENV) delete base[k];
  for (const [k, v] of Object.entries(env)) {
    if (v === null) delete base[k];
    else base[k] = v;
  }
  return new Promise((resolvePromise) => {
    const child = args
      ? spawn(command, args, { cwd, env: base })
      : spawn(command, { cwd, env: base, shell: true });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on('error', (e) => {
      clearTimeout(timer);
      resolvePromise({ code: -1, out: `${out}\n${e.message}` });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolvePromise({ code: code ?? -1, out });
    });
  });
}

const tail = (s, n = 600) => (s.length > n ? `…${s.slice(-n)}` : s);
function exitMatches(code, expected) {
  return expected === 'nonzero' ? code !== 0 : code === expected;
}

// ---------------------------------------------------------------- checks

const evaluators = {
  async 'check-site'(c, ctx) {
    if (!existsSync(ctx.checker)) return { status: 'pending', detail: 'check-site not delivered yet: re-grade later' };
    const jsonPath = join(mkdtempSync(join(tmpdir(), 'wls-cs-')), 'report.json');
    const r = await runCommand(process.execPath, { cwd: ctx.workDir, args: [ctx.checker, ...c.args, '--json', jsonPath] });
    if (!existsSync(jsonPath)) return { status: 'fail', detail: `check-site wrote no report (exit ${r.code}): ${tail(r.out)}` };
    const report = JSON.parse(readFileSync(jsonPath, 'utf8'));
    const severities = c.severities ?? ['error', 'warning'];
    const problems = [];
    for (const id of c.mustNotFind ?? []) {
      const hits = report.findings.filter((f) => f.id === id && severities.includes(f.severity));
      if (hits.length) problems.push(`${id} still reported (${hits.map((h) => h.url ?? '-').join(', ')})`);
    }
    for (const id of c.mustFind ?? []) {
      if (!report.findings.some((f) => f.id === id)) problems.push(`${id} not reported`);
    }
    if (c.maxErrors !== undefined && report.summary.errors > c.maxErrors) {
      const ids = [...new Set(report.findings.filter((f) => f.severity === 'error').map((f) => f.id))];
      problems.push(`${report.summary.errors} errors (max ${c.maxErrors}): ${ids.join(', ')}`);
    }
    return problems.length ? { status: 'fail', detail: problems.join('; ') } : { status: 'pass', detail: `${report.summary.errors} errors, ${report.summary.warnings} warnings` };
  },

  async 'report-regex'(c, ctx) {
    const ok = new RegExp(c.pattern, c.flags ?? '').test(ctx.reportText);
    return { status: ok ? 'pass' : 'fail', detail: ok ? 'found in the final report' : `/${c.pattern}/${c.flags ?? ''} not found in the final report` };
  },

  async 'report-not-regex'(c, ctx) {
    const m = ctx.reportText.match(new RegExp(c.pattern, c.flags ?? ''));
    return m ? { status: 'fail', detail: `forbidden text in the final report: "${m[0].slice(0, 120)}"` } : { status: 'pass', detail: 'absent' };
  },

  async 'file-regex'(c, ctx) {
    const files = expand(ctx.workDir, c.path);
    if (!files.length) return { status: 'fail', detail: `no file matches ${c.path}` };
    const re = new RegExp(c.pattern, c.flags ?? '');
    const misses = files.filter((f) => !re.test(readFileSync(f, 'utf8'))).map((f) => relative(ctx.workDir, f));
    if (c.match === 'any') {
      return misses.length < files.length ? { status: 'pass', detail: `${files.length - misses.length}/${files.length} file(s) match` } : { status: 'fail', detail: `/${c.pattern}/ found in none of ${files.length} file(s) matching ${c.path}` };
    }
    return misses.length ? { status: 'fail', detail: `/${c.pattern}/ not found in ${misses.join(', ')}` } : { status: 'pass', detail: `${files.length} file(s)` };
  },

  async 'file-not-regex'(c, ctx) {
    const re = new RegExp(c.pattern, c.flags ?? '');
    const hits = [];
    for (const f of expand(ctx.workDir, c.path)) {
      const m = readFileSync(f, 'utf8').match(re);
      if (m) hits.push(`${relative(ctx.workDir, f)}: "${m[0].slice(0, 100)}"`);
    }
    return hits.length ? { status: 'fail', detail: `forbidden text: ${hits.join('; ')}` } : { status: 'pass', detail: 'absent' };
  },

  async 'md-table-column'(c, ctx) {
    const files = expand(ctx.workDir, c.path);
    if (!files.length) return { status: 'fail', detail: `no file matches ${c.path}` };
    const allow = new RegExp(c.allow, c.flags ?? 'i');
    const bad = [];
    let cells = 0;
    for (const f of files) {
      const lines = readFileSync(f, 'utf8').split(/\r?\n/);
      let col = -1;
      for (const line of lines) {
        if (!/^\s*\|/.test(line)) {
          col = -1;
          continue;
        }
        const parts = line.trim().replace(/^\||\|$/g, '').split('|').map((s) => s.trim());
        if (col === -1) {
          col = parts.findIndex((p) => p.replace(/[*_`]/g, '').toLowerCase().startsWith(c.column.toLowerCase()));
          if (col === -1) col = -2; // a table without that column
          continue;
        }
        if (col < 0 || /^:?-{2,}:?$/.test(parts[0] ?? '')) continue;
        cells++;
        const cell = (parts[col] ?? '').replace(/[*_`]/g, '').trim();
        if (!allow.test(cell)) bad.push(`"${cell}"`);
      }
    }
    if (!cells) return { status: 'fail', detail: `no table with a "${c.column}" column in ${c.path}` };
    return bad.length ? { status: 'fail', detail: `${bad.length}/${cells} ${c.column} cells not allowed: ${bad.slice(0, 5).join(', ')}` } : { status: 'pass', detail: `${cells} cells` };
  },

  async command(c, ctx) {
    const r = await runCommand(c.run, { cwd: ctx.workDir, env: c.env });
    const ok = exitMatches(r.code, c.expectExit ?? 0);
    return { status: ok ? 'pass' : 'fail', detail: `exit ${r.code} (expected ${c.expectExit ?? 0})${ok ? '' : `: ${tail(r.out)}`}` };
  },

  async mutation(c, ctx) {
    if (!ctx.originalDir) return { status: 'fail', detail: 'no original fixture to restore from' };
    const copy = copyWork(ctx.workDir);
    try {
      for (const rel of c.restore ?? []) {
        const src = join(ctx.originalDir, rel);
        if (existsSync(src)) cpSync(src, join(copy, rel), { recursive: true });
        else rmSync(join(copy, rel), { recursive: true, force: true });
      }
      for (const rel of c.remove ?? []) {
        if (!existsSync(join(copy, rel))) return { status: 'fail', detail: `mutation setup: ${rel} does not exist in the work folder` };
        rmSync(join(copy, rel), { recursive: true, force: true });
      }
      for (const [rel, content] of Object.entries(c.write ?? {})) {
        mkdirSync(dirname(join(copy, rel)), { recursive: true });
        writeFileSync(join(copy, rel), typeof content === 'string' ? content : JSON.stringify(content, null, 2));
      }
      const r = await runCommand(c.run, { cwd: copy, env: c.env });
      const ok = exitMatches(r.code, c.expectExit ?? 'nonzero');
      return { status: ok ? 'pass' : 'fail', detail: `after the mutation: exit ${r.code} (expected ${c.expectExit ?? 'nonzero'})${ok ? '' : `: ${tail(r.out)}`}` };
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  },

  async any(c, ctx) {
    const results = [];
    for (const sub of c.checks) results.push(await evaluate(sub, ctx));
    if (results.some((r) => r.status === 'pass')) return { status: 'pass', detail: results.map((r) => r.status).join('/') };
    if (results.some((r) => r.status === 'pending')) return { status: 'pending', detail: results.map((r) => r.detail).join(' | ') };
    return { status: 'fail', detail: results.map((r) => r.detail).join(' | ') };
  },
};

async function evaluate(check, ctx) {
  const fn = evaluators[check.type];
  if (!fn) return { status: 'fail', detail: `unknown check type ${check.type}` };
  try {
    return await fn(check, ctx);
  } catch (e) {
    return { status: 'fail', detail: `grader error: ${e.message}` };
  }
}

export const CHECK_TYPES = Object.keys(evaluators);

/**
 * @param {{ scenario: object, workDir: string, reportText: string, checker?: string, originalDir?: string }} o
 */
export async function grade({ scenario, workDir, reportText, checker = DEFAULT_CHECKER, originalDir }) {
  const ctx = {
    workDir: resolve(workDir),
    reportText: reportText ?? '',
    checker,
    originalDir: originalDir ?? (scenario.fixture ? join(FIXTURES_DIR, scenario.fixture) : undefined),
  };
  const checks = [];
  for (const [i, c] of scenario.checks.entries()) {
    const r = await evaluate(c, ctx);
    checks.push({ index: i + 1, label: c.label ?? c.type, type: c.type, required: c.required !== false, gap: c.gap ?? null, ...r });
  }
  const required = checks.filter((c) => c.required);
  const status = required.some((c) => c.status === 'fail') ? 'fail' : required.some((c) => c.status === 'pending') ? 'pending' : 'pass';
  const count = (s) => required.filter((c) => c.status === s).length;
  return { scenario: scenario.id, status, counts: { pass: count('pass'), fail: count('fail'), pending: count('pending') }, checks };
}

// ---------------------------------------------------------------- CLI

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`unexpected argument ${a}`);
    o[a.slice(2)] = argv[++i];
  }
  return o;
}

async function main() {
  let o;
  try {
    o = parseArgs(process.argv.slice(2));
    if (!o.scenario || !o.work) throw new Error('--scenario and --work are required');
  } catch (e) {
    console.error(`${e.message}\nusage: node evals/grade.mjs --scenario <id> --work <dir> --report <file> [--out grade.json] [--checker <path>]`);
    process.exit(2);
  }
  const scenario = loadScenario(o.scenario);
  const reportText = o.report && existsSync(o.report) ? readFileSync(o.report, 'utf8') : '';
  const result = await grade({ scenario, workDir: o.work, reportText, checker: o.checker ?? DEFAULT_CHECKER });
  if (o.out) writeFileSync(o.out, JSON.stringify(result, null, 2) + '\n');
  for (const c of result.checks) console.log(`${c.status.toUpperCase().padEnd(7)} ${String(c.index).padStart(2)} ${c.label}: ${c.detail}`);
  console.log(`${result.scenario}: ${result.status} (${result.counts.pass} pass, ${result.counts.fail} fail, ${result.counts.pending} pending)`);
  process.exit(result.status === 'fail' ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
