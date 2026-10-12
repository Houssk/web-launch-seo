# Campaign 2026-10-12-old-s2-hardened

Variant `old` (skill b947a12), model `claude-sonnet-5-5`, 2.1.296 (Claude Code), repository 02d6447.
Spent 0.46 USD of 1.20 (per run cap 1.00). Stopped: isolation: C:\code\web-launch-seo changed during the run.

`fail` = at least one required check is red (red is the expected result on `old`). `pending` = only check-site checks are left, to re-grade once the script exists (`node evals/run.mjs --regrade 2026-10-12-old-s2-hardened`).

| Scenario | Rep | Status | Checks pass/fail/pending | Cost USD | Turns | Red checks |
| --- | --- | --- | --- | --- | --- | --- |
| s2-build-guards | 1 | fail | 18/1/0 | 0.46 | 25 | npm test checks the built output: fails when the og:image file is missing (OG-001) |

Totals: 1 fail, 0 pass, 0 pending, 0 not run.
