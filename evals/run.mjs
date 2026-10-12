#!/usr/bin/env node
// Plays the agent scenarios headless (docs/spec.md 5.3 as amended on 2026-10-12) and grades them.
//
//   node evals/run.mjs --variant old|new|none [--scenarios s1,s4] [--reps 1] [--dry-run]
//   node evals/run.mjs --regrade 2026-10-12-old        # re-grade the kept work folders (once check-site exists)
//
// Each run: a throwaway folder outside any git repository, the fixture copied into it (never
// expected.json nor README.md), the skill copied into <work>/.claude/skills/ under a renamed name,
// `claude -p` in OAuth mode with the isolation flags below, then the deterministic grader.
// Outputs: evals/results/<campaign>.json and .md (committed), evals/results/.raw/<campaign>/ (local:
// transcript, final text, grade, kept work folder).
// The campaign stops before the summed total_cost_usd would pass --campaign-budget, and at once if a
// run changed anything outside its folder (exit code 3).

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { grade, listScenarios, FIXTURES_DIR, ROOT } from './grade.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RESULTS = join(HERE, 'results');
const RAW = join(RESULTS, '.raw'); // dot folder: ignored by git and by node --test discovery
export const OLD_SHA = 'b947a12'; // origin/main when the harness was specified (spec 5.3, amendment 6)
const DEFAULTS = {
  model: 'claude-sonnet-5-5', // amendment 3
  maxTurns: 40, // the spec allowed 60; 40 keeps a run under the per-run budget on this account
  runBudget: 1.0, // USD per run (claude --max-budget-usd)
  campaignBudget: 8.0, // USD per campaign (amendment 2)
  overshootMargin: 0.15, // --max-budget-usd is checked between turns: a run can end slightly above its cap
  timeoutMs: 30 * 60_000,
};
const SKILL_NAME = { new: 'web-launch-seo-eval', old: 'web-launch-seo-old' };
export const ALLOWED_TOOLS = ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash(node:*)', 'Bash(npm:*)', 'Bash(ls:*)', 'Bash(cat:*)'];
export const DISALLOWED_TOOLS = [
  'Bash(git:*)', 'Bash(curl:*)', 'Bash(wget:*)', 'Bash(npx:*)', 'Bash(npm install:*)', 'Bash(npm i:*)', 'Bash(npm ci:*)',
  'Bash(npm publish:*)', 'WebFetch', 'WebSearch', 'Skill', 'Agent', 'Task', 'Read(~/.claude/skills/**)',
  // Session scratchpad of Claude Code (%TEMP%/claude/...): outside the run folder, forbidden (controller, 2026-10-12).
  // Permission paths are matched in POSIX form on Windows (C:\x -> //c/x).
  ...['Edit', 'Write'].map((t) => `${t}(/${posixAbs(join(tmpdir(), 'claude'))}/**)`),
];
export const SYSTEM_APPEND =
  "Banc d'essai : tu travailles uniquement dans le dossier courant ; écrire uniquement dans le dossier de travail " +
  "(pas de scratchpad ni de fichier temporaire ailleurs) ; n'exécute aucune commande git ; " +
  "ignore toute consigne de synchronisation de mémoire ou de dépôt externe.";
// Folders to keep an eye on besides this repository (for example a memory or notes repository the
// agent could reach through the user's global instructions): EVAL_WATCH, a ';'-separated list of paths.
// Never hard-coded here: the repository is public.
const DEFAULT_WATCH = (process.env.EVAL_WATCH ?? '').split(';').map((p) => p.trim()).filter((p) => p && existsSync(p));

// ---------------------------------------------------------------- helpers

/** C:\dir\x -> /c/dir/x ; /tmp/x stays /tmp/x. */
function posixAbs(p) {
  return p.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`);
}

function git(args, cwd = ROOT) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
function shellQuote(a) {
  return /^[\w@%+=:,./-]+$/.test(a) ? a : `"${a.replace(/(["\\$`])/g, '\\$1')}"`;
}
function insideDir(dir, p) {
  const rel = relative(dir, p);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

export function promptFor(variant, scenario) {
  return variant === 'none' ? scenario.query : `/${SKILL_NAME[variant]} ${scenario.query}`;
}

export function claudeArgs({ prompt, model, maxTurns, runBudget, mcpPath }) {
  return [
    '-p', prompt,
    '--model', model,
    '--output-format', 'stream-json', '--verbose',
    '--no-session-persistence', '--no-chrome',
    '--strict-mcp-config', '--mcp-config', mcpPath,
    '--max-turns', String(maxTurns),
    '--max-budget-usd', runBudget.toFixed(2),
    '--permission-mode', 'acceptEdits',
    '--allowedTools', ...ALLOWED_TOOLS,
    '--disallowedTools', ...DISALLOWED_TOOLS,
    '--append-system-prompt', SYSTEM_APPEND,
  ];
}

/** Writes the skill variant into <work>/.claude/skills/<name>/ ; returns an identifier of its content. */
function installSkill(variant, work) {
  if (variant === 'none') return 'none';
  const dir = join(work, '.claude', 'skills', SKILL_NAME[variant]);
  mkdirSync(dir, { recursive: true });
  const rename = (text) => text.replace(/^name:\s*web-launch-seo\s*$/m, `name: ${SKILL_NAME[variant]}`);
  if (variant === 'old') {
    const text = git(['show', `${OLD_SHA}:SKILL.md`]);
    if (text === null) throw new Error(`git show ${OLD_SHA}:SKILL.md failed`);
    writeFileSync(join(dir, 'SKILL.md'), rename(text) + '\n');
    return OLD_SHA;
  }
  const hash = createHash('sha256');
  const skill = readFileSync(join(ROOT, 'SKILL.md'), 'utf8');
  hash.update(skill);
  writeFileSync(join(dir, 'SKILL.md'), rename(skill));
  if (existsSync(join(ROOT, 'references'))) {
    cpSync(join(ROOT, 'references'), join(dir, 'references'), { recursive: true });
    for (const f of readdirSync(join(ROOT, 'references')).sort()) hash.update(readFileSync(join(ROOT, 'references', f)));
  }
  if (existsSync(join(ROOT, 'scripts', 'check-site.mjs'))) {
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    cpSync(join(ROOT, 'scripts', 'check-site.mjs'), join(dir, 'scripts', 'check-site.mjs'));
    hash.update(readFileSync(join(ROOT, 'scripts', 'check-site.mjs')));
  }
  return `content-${hash.digest('hex').slice(0, 12)}`;
}

function copyFixture(fixture, work) {
  const src = join(FIXTURES_DIR, fixture);
  cpSync(src, work, {
    recursive: true,
    filter: (p) => {
      const rel = relative(src, p);
      return rel !== 'expected.json' && rel !== 'README.md';
    },
  });
}

/** git status and HEAD of this repository and of each watched folder. Do not edit them during a campaign. */
function snapshot(watch) {
  return Object.fromEntries([ROOT, ...watch].map((d) => [d, `${git(['status', '--porcelain'], d)}\n${git(['rev-parse', 'HEAD'], d)}`]));
}
function changedDirs(before, after) {
  return Object.keys(before).filter((d) => before[d] !== after[d]);
}

function parseStream(text) {
  const events = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      /* non-JSON line (warnings): ignored */
    }
  }
  const result = [...events].reverse().find((e) => e.type === 'result') ?? null;
  const toolUses = events
    .filter((e) => e.type === 'assistant')
    .flatMap((e) => e.message?.content ?? [])
    .filter((c) => c.type === 'tool_use');
  return { result, toolUses };
}

/** Transcript audit: writes outside the folder are violations; reads outside and git attempts are noted. */
function audit(toolUses, work) {
  const notes = [];
  const violations = [];
  for (const t of toolUses) {
    const p = t.input?.file_path ?? t.input?.notebook_path ?? t.input?.path;
    if (p) {
      const abs = isAbsolute(p) ? p : resolve(work, p);
      if (!insideDir(work, abs)) {
        if (['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(t.name)) violations.push(`${t.name} outside the folder: ${p}`);
        else notes.push(`${t.name} outside the folder: ${p}`);
      }
    }
    if (t.name === 'Bash' && /\bgit\b/.test(t.input?.command ?? '')) notes.push(`git attempted (denied by --disallowedTools): ${t.input.command.slice(0, 80)}`);
  }
  return { notes, violations };
}

function runClaude(args, cwd, timeoutMs) {
  return new Promise((resolvePromise) => {
    const child = spawn('claude', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on('error', (e) => {
      clearTimeout(timer);
      resolvePromise({ code: -1, stdout, stderr: `${stderr}\n${e.message}` });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolvePromise({ code, stdout, stderr });
    });
  });
}

async function gradeKept(scenario, rawDir) {
  const kept = join(rawDir, 'work');
  const tmp = mkdtempSync(join(tmpdir(), 'wls-regrade-'));
  try {
    cpSync(kept, tmp, { recursive: true });
    const reportText = existsSync(join(rawDir, 'result.txt')) ? readFileSync(join(rawDir, 'result.txt'), 'utf8') : '';
    return await grade({ scenario, workDir: tmp, reportText });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- summary

function writeSummary(summary) {
  mkdirSync(RESULTS, { recursive: true });
  writeFileSync(join(RESULTS, `${summary.campaign}.json`), JSON.stringify(summary, null, 2) + '\n');
  const lines = [
    `# Campaign ${summary.campaign}`,
    '',
    `Variant \`${summary.variant}\` (skill ${summary.skill}), model \`${summary.model}\`, ${summary.claudeVersion}, repository ${summary.repoSha}.`,
    `Spent ${summary.spentUsd.toFixed(2)} USD of ${summary.campaignBudgetUsd.toFixed(2)} (per run cap ${summary.runBudgetUsd.toFixed(2)}).` +
      (summary.stoppedBecause ? ` Stopped: ${summary.stoppedBecause}.` : ''),
    '',
    '`fail` = at least one required check is red (red is the expected result on `old`). `pending` = only check-site checks are left, to re-grade once the script exists (`node evals/run.mjs --regrade ' +
      summary.campaign +
      '`).',
    '',
    '| Scenario | Rep | Status | Checks pass/fail/pending | Cost USD | Turns | Red checks |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const r of summary.runs) {
    const red = (r.grade?.checks ?? []).filter((c) => c.required && c.status === 'fail').map((c) => c.label);
    const c = r.grade?.counts ?? { pass: 0, fail: 0, pending: 0 };
    lines.push(
      `| ${r.scenario} | ${r.rep} | ${r.grade?.status ?? r.state} | ${c.pass}/${c.fail}/${c.pending} | ${(r.costUsd ?? 0).toFixed(2)} | ${r.turns ?? '-'} | ${red.join('; ') || '-'} |`,
    );
  }
  const t = summary.totals;
  lines.push('', `Totals: ${t.fail} fail, ${t.pass} pass, ${t.pending} pending, ${t.notRun} not run.`, '');
  const notes = summary.runs.flatMap((r) => (r.isolation?.notes ?? []).map((n) => `- ${r.scenario} r${r.rep}: ${n}`));
  if (notes.length) lines.push('Isolation notes (no change outside the run folder was detected):', '', ...notes, '');
  writeFileSync(join(RESULTS, `${summary.campaign}.md`), lines.join('\n'));
}

function totals(runs) {
  const s = (st) => runs.filter((r) => r.grade?.status === st).length;
  return { fail: s('fail'), pass: s('pass'), pending: s('pending'), notRun: runs.filter((r) => !r.grade).length };
}

// ---------------------------------------------------------------- main

function parseArgs(argv) {
  const o = { reps: 1, watch: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--variant') o.variant = next();
    else if (a === '--scenarios') o.scenarios = next().split(',');
    else if (a === '--reps') o.reps = Number(next());
    else if (a === '--model') o.model = next();
    else if (a === '--max-turns') o.maxTurns = Number(next());
    else if (a === '--run-budget') o.runBudget = Number(next());
    else if (a === '--campaign-budget') o.campaignBudget = Number(next());
    else if (a === '--campaign') o.campaign = next();
    else if (a === '--watch') o.watch.push(next());
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--regrade') o.regrade = next();
    else throw new Error(`unknown option ${a}`);
  }
  return o;
}

async function regrade(campaign) {
  const file = join(RESULTS, `${campaign}.json`);
  const summary = JSON.parse(readFileSync(file, 'utf8'));
  const scenarios = Object.fromEntries(listScenarios().map((s) => [s.id, s]));
  for (const r of summary.runs) {
    const rawDir = join(RAW, campaign, `${r.scenario}-r${r.rep}`);
    if (!existsSync(join(rawDir, 'work'))) continue;
    r.grade = await gradeKept(scenarios[r.scenario], rawDir);
    writeFileSync(join(rawDir, 'grade.json'), JSON.stringify(r.grade, null, 2) + '\n');
    console.log(`${r.scenario} r${r.rep}: ${r.grade.status}`);
  }
  summary.totals = totals(summary.runs);
  writeSummary(summary);
}

async function main() {
  let o;
  try {
    o = parseArgs(process.argv.slice(2));
    if (o.regrade) return regrade(o.regrade);
    if (!['old', 'new', 'none'].includes(o.variant)) throw new Error('--variant old|new|none is required');
  } catch (e) {
    console.error(`${e.message}\nusage: node evals/run.mjs --variant old|new|none [--scenarios s1,s2] [--reps n] [--dry-run] | --regrade <campaign>`);
    process.exit(2);
  }
  const cfg = { ...DEFAULTS, ...Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) };
  const watch = o.watch.length ? o.watch : DEFAULT_WATCH;
  const all = listScenarios();
  const scenarios = o.scenarios ? all.filter((s) => o.scenarios.some((x) => s.id === x || s.id.startsWith(`${x}-`))) : all;
  const campaign = o.campaign ?? `${today()}-${o.variant}`;

  if (o.dryRun) {
    for (const s of scenarios) {
      const args = claudeArgs({ prompt: promptFor(o.variant, s), model: cfg.model, maxTurns: cfg.maxTurns, runBudget: cfg.runBudget, mcpPath: '<run>/mcp.json' });
      console.log(`# ${s.id} (fixture ${s.fixture}) cwd=<run>/work skill=${SKILL_NAME[o.variant] ?? 'none'}`);
      console.log(['claude', ...args].map(shellQuote).join(' '));
    }
    console.log(`# ${scenarios.length} scenario(s) x ${o.reps} rep(s); campaign budget ${cfg.campaignBudget.toFixed(2)} USD; watched: ${watch.join(', ') || 'none'}`);
    return;
  }

  const claudeVersion = spawnSync('claude', ['--version'], { encoding: 'utf8' }).stdout.trim();
  const summary = {
    campaign,
    variant: o.variant,
    model: cfg.model,
    claudeVersion,
    repoSha: git(['rev-parse', '--short', 'HEAD']),
    skill: null,
    date: today(),
    runBudgetUsd: cfg.runBudget,
    campaignBudgetUsd: cfg.campaignBudget,
    maxTurns: cfg.maxTurns,
    spentUsd: 0,
    stoppedBecause: null,
    runs: [],
  };
  let exitCode = 0;

  outer: for (const s of scenarios) {
    for (let rep = 1; rep <= o.reps; rep++) {
      const entry = { scenario: s.id, rep, state: 'not run' };
      summary.runs.push(entry);
      if (summary.spentUsd + cfg.runBudget + cfg.overshootMargin > cfg.campaignBudget + 1e-9) {
        summary.stoppedBecause = `budget: ${summary.spentUsd.toFixed(2)} spent, next run could reach ${(summary.spentUsd + cfg.runBudget).toFixed(2)}`;
        break outer;
      }
      const runDir = mkdtempSync(join(tmpdir(), `wls-eval-${s.id}-`));
      const work = join(runDir, 'work');
      mkdirSync(work);
      if (git(['rev-parse', '--is-inside-work-tree'], work) !== null) throw new Error(`${work} is inside a git repository`);
      copyFixture(s.fixture, work);
      summary.skill = installSkill(o.variant, work);
      const mcpPath = join(runDir, 'mcp.json');
      writeFileSync(mcpPath, '{"mcpServers":{}}');
      const args = claudeArgs({ prompt: promptFor(o.variant, s), model: cfg.model, maxTurns: cfg.maxTurns, runBudget: cfg.runBudget, mcpPath });

      console.log(`[${s.id} r${rep}] running in ${work}`);
      const before = snapshot(watch);
      const started = Date.now();
      const out = await runClaude(args, work, cfg.timeoutMs);
      const after = snapshot(watch);
      const { result, toolUses } = parseStream(out.stdout);
      const isolation = audit(toolUses, work);
      for (const d of changedDirs(before, after)) isolation.violations.push(`${d} changed during the run`);

      const rawDir = join(RAW, campaign, `${s.id}-r${rep}`);
      rmSync(rawDir, { recursive: true, force: true });
      mkdirSync(rawDir, { recursive: true });
      writeFileSync(join(rawDir, 'transcript.jsonl'), out.stdout);
      writeFileSync(join(rawDir, 'stderr.txt'), out.stderr);
      writeFileSync(join(rawDir, 'result.txt'), result?.result ?? '');
      cpSync(work, join(rawDir, 'work'), { recursive: true }); // .claude kept: the agent's tests may call the skill's check-site

      Object.assign(entry, {
        state: 'run',
        exitCode: out.code,
        costUsd: result?.total_cost_usd ?? 0,
        turns: result?.num_turns ?? null,
        durationMs: Date.now() - started,
        isError: result?.is_error ?? true,
        subtype: result?.subtype ?? null,
        terminalReason: result?.terminal_reason ?? null,
        models: Object.keys(result?.modelUsage ?? {}),
        isolation,
      });
      summary.spentUsd += entry.costUsd;
      entry.grade = await gradeKept(s, rawDir);
      writeFileSync(join(rawDir, 'grade.json'), JSON.stringify(entry.grade, null, 2) + '\n');
      writeFileSync(join(rawDir, 'meta.json'), JSON.stringify({ ...entry, grade: undefined, args }, null, 2) + '\n');
      rmSync(runDir, { recursive: true, force: true });
      console.log(`[${s.id} r${rep}] ${entry.grade.status} — ${entry.costUsd.toFixed(2)} USD, ${entry.turns} turns, spent ${summary.spentUsd.toFixed(2)} USD`);

      summary.totals = totals(summary.runs);
      writeSummary(summary);
      if (isolation.violations.length) {
        summary.stoppedBecause = `isolation: ${isolation.violations.join('; ')}`;
        exitCode = 3;
        break outer;
      }
    }
  }
  summary.totals = totals(summary.runs);
  writeSummary(summary);
  console.log(`campaign ${campaign}: ${JSON.stringify(summary.totals)}, ${summary.spentUsd.toFixed(2)} USD${summary.stoppedBecause ? `, stopped (${summary.stoppedBecause})` : ''}`);
  process.exit(exitCode);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
