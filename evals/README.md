# Test bench

Proves that the skill changes what an agent does: red on the previous version (`old`), green on the new one (`new`). Specification: `docs/spec.md` sections 4 and 5, as amended on 2026-10-12 (end of the spec).

## Layout

- `fixtures/<name>/`: test sites with planted defects, each with `expected.json` (check-site ids) and `README.md` (one line per defect, never shown to the agent). `node evals/fixtures/build-fixtures.mjs` regenerates the `dist/` folders and images.
- `scenarios/sN-*.json`: one realistic request per scenario, the fixture it runs on, and deterministic checks.
- `grade.mjs`: the grader (no model). `run.mjs`: the headless runner.
- `results/<campaign>.json|.md`: committed summaries. `results/.raw/`: transcripts and kept work folders (local, ignored by git).

## Commands

```bash
node --test scripts/test/check-site.test.mjs scripts/test/skill-structure.test.mjs     # check-site contract and skill shape
node --test evals/test/grade.test.mjs       # grader, scenarios, runner dry run
node evals/run.mjs --variant old --dry-run
EVAL_WATCH="/path/to/notes-repo" node evals/run.mjs --variant old   # reference pass (1 run per scenario), watching an extra repository
node evals/run.mjs --variant new --reps 3
node evals/run.mjs --regrade 2026-10-12-old   # re-grade kept runs once scripts/check-site.mjs exists
node evals/grade.mjs --scenario s1 --work <dir> --report <result.txt>
```

On Node 22 and later, `node --test <folder>/` runs the folder as a file, and globs only exist from Node 21: pass an explicit file list as above.

## Protocol (amended)

Each run uses a throwaway folder outside any git repository. The fixture is copied into `work/`, and the skill into `work/.claude/skills/` under a renamed name (`web-launch-seo-eval` for `new`, `web-launch-seo-old` for `old` = `git show b947a12:SKILL.md`), so the installed `web-launch-seo` cannot shadow it. The prompt invokes it explicitly (`/web-launch-seo-eval <request>`); `none` sends the request alone.

`claude -p` runs on the subscription (OAuth, not `--bare`), with: `--model claude-sonnet-5-5`, `--no-session-persistence`, `--no-chrome`, `--strict-mcp-config` with an empty MCP config, `--max-turns 40`, `--max-budget-usd 1.00`, `--permission-mode acceptEdits`, an allow-list (`Read, Edit, Write, Glob, Grep, Bash(node|npm|ls|cat)`), a deny-list (git, curl, npx, npm install, WebFetch, WebSearch, Skill, Agent, reading `~/.claude/skills`), and an appended system prompt that keeps the agent in its folder. No network tool, so S3 checks that volumes are not invented.

After each run, the runner compares `git status` and `HEAD` of this repository and of the watched folders (`EVAL_WATCH`, a `;`-separated list of paths, for example a memory repository reachable through the user's global instructions; `--watch <path>`, repeatable, replaces it for one campaign) and audits the transcript for writes outside the folder. Any change stops the campaign (exit 3). The campaign also stops before its summed `total_cost_usd` could pass 8 USD.

Known limit: the user's global instructions (`~/.claude/CLAUDE.md`, personal skills listed, hooks) still load. The bench measures a relative effect, `old` against `new` under the same conditions.

## Dry run of the protocol (T0)

2026-10-12, `claude` 2.1.296, model `claude-sonnet-5-5`: a canary skill (`name: canary`, "reply CANARY-OK") placed in `<tmp>/work/.claude/skills/canary/`, invoked with `claude -p "/canary please"` and the flags above (Skill tool denied): result `CANARY-OK`, 1 turn, 0.015 USD, watched repository unchanged. `--bare` fails on this machine (no `ANTHROPIC_API_KEY`; OAuth is not read in bare mode).
