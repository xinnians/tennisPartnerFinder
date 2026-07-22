# Cross-Project AI Setup Handoff

This file summarizes the discussion about adapting Ian's Claude Code and Codex setup from a VChat/Android-focused workflow into a cross-project workflow for Android, web, backend, database, deployment, and project-management work.

Intended next reader: Claude Code.

## Current Goal

Ian originally used Claude Code and Codex mostly for `vchatandroid`, so many AI settings and habits are Android/VChat-centric. He now wants to use AI across multiple projects and domains without leaking Android assumptions into web/backend/project-management work.

The desired outcome is a layered AI setup:

- Global rules capture Ian's personal working style and safety red lines.
- Project rules capture each repo's real architecture, commands, tests, and boundaries.
- Task briefs capture one-off scope and constraints for the current thread only.
- Claude Code and Codex share the same governance kernel, while keeping tool-specific settings separate.

## Relevant Files Observed

- `/Users/ian/.claude/CLAUDE.md`
  - Global personal preferences.
  - Already contains Traditional Chinese response preference, verification discipline, plan-first workflow, three-bucket uncertainty handling, and no proactive push.
- `/Users/ian/.claude/settings.json`
  - Claude Code permissions/plugins.
  - Currently contains Android/VChat-specific command allowlist entries such as `adb` and VChat Gradle tasks.
- `/Users/ian/.codex/config.toml`
  - Codex model/plugin/project settings.
  - Currently has `desktop.open-in-target-preferences.global = "androidStudio"`.
  - Currently has `[features] js_repl = false`; no `multi_agent = true` was observed when checked.
- `/Users/ian/.codex/AGENTS.md`
  - Currently empty when checked.
  - Good target for a Codex-side mirror of the global governance kernel.
- `/Users/ian/tennisPartnerFinder/CLAUDE.md`
  - Good example of non-Android repo-level AI onboarding.
  - Documents project type, commands, architecture, mock-vs-Supabase boundary, testing, product red lines, and environment behavior.
- `/Users/ian/vchatandroid`
  - Mentioned by agents as the right home for VChat/Android-specific workflow, Gradle commands, OpenIM docs, adb, Maestro, and OpenSpec-heavy rules.

## Multi-Agent Analysis Summary

Five read-only agents were used to analyze the problem from different angles:

1. Android/VChat workflow
2. Web/frontend/full-stack
3. Backend/DB/security/ops
4. Project management and multi-agent pipeline
5. Claude Code/Codex tool governance

No files were modified by the subagents.

The common diagnosis:

- The global behavior preferences are mostly right.
- The global tool assumptions are too Android/VChat-specific.
- The largest cross-project risk is rule and permission leakage, not lack of rules.
- Claude Code has mature global behavior rules; Codex currently lacks an equivalent written governance file because `~/.codex/AGENTS.md` is empty.
- VChat's heavier process should be preserved, but contained inside the VChat repo.

## Recommended Layering

### 1. Global Layer

Keep only cross-project rules:

- Traditional Chinese, Taiwan usage.
- Right-sized responses.
- Do not guess when unverified.
- Use `[已驗證]`, `[推論]`, and `[不確定]` for technical claims when appropriate.
- Read project architecture before making changes.
- Give a strawman plan before coding.
- Challenge weak assumptions directly.
- Do not proactively push.
- Protect user changes.
- Verify before claiming work is complete.
- Apply security red lines globally.

Avoid globalizing:

- Android/Gradle/adb assumptions.
- OpenIM/VChat-specific references.
- VChat-specific agent names, file paths, or process gates.
- Web-specific deployment commands.
- Backend-specific DB details.

### 2. Project Layer

Every repo should have a short AI onboarding file. Preferred long-term direction:

- Use `AGENTS.md` as a neutral cross-tool entry card.
- Let `CLAUDE.md` remain a Claude adapter where useful.
- If a repo only has `CLAUDE.md`, Codex should be told to read it until a neutral `AGENTS.md` exists.

Each repo-level file should include:

- What this project is.
- Tech stack and intentionally absent tooling.
- Real install/build/test/dev commands.
- Source-of-truth docs.
- Architecture boundaries.
- Data/security/privacy boundaries.
- Environment matrix.
- Deployment policy.
- Verification expectations.
- Non-goals and product red lines.

`tennisPartnerFinder/CLAUDE.md` is a strong model for this.

### 3. Task Layer

Each thread should state temporary constraints only:

- Goal.
- Scope.
- Files or areas not to touch.
- Whether this is read-only.
- Expected verification.
- Whether subagents are allowed.
- Whether this is PM-only, implementation, review, or debugging.

Do not write one-off task constraints into global settings.

## Claude Code Specific Recommendations

Suggested next work for Claude Code:

1. Refactor `/Users/ian/.claude/CLAUDE.md`
   - Keep the current personal preferences.
   - Add cross-project safety red lines.
   - Add one sentence that outside `vchatandroid`, Android/Gradle/OpenIM/VChat workflow must not be assumed.
   - Consider allowing repo-level trivial carve-outs for very small tasks, while keeping plan-first as the default.

2. Refactor `/Users/ian/.claude/settings.json`
   - Move Android/VChat command allowlist entries into `/Users/ian/vchatandroid/.claude/settings.local.json` or equivalent project-local settings.
   - Narrow overly broad global entries where practical, especially `Bash(git:*)`, `Bash(bash:*)`, and `Bash(python3:*)`.
   - Add deny/ask protection for push, production deploy, destructive git, destructive filesystem, and production DB writes.

3. Keep VChat strong
   - Do not delete the VChat-heavy workflow.
   - Move it to the VChat repo where it belongs.
   - VChat can continue using OpenSpec and multi-agent pipeline as its normal heavy workflow.

## Codex Specific Recommendations

Suggested next work for Codex setup:

1. Populate `/Users/ian/.codex/AGENTS.md`
   - Mirror the shared global governance kernel from `/Users/ian/.claude/CLAUDE.md`.
   - Keep it concise.
   - Do not include VChat project details.

2. Adjust `/Users/ian/.codex/config.toml`
   - Remove or override global `androidStudio` as the open-in target.
   - Make Android Studio a VChat project preference instead of a global default.
   - If Codex multi-agent workflows should be available, add:

```toml
[features]
js_repl = false
multi_agent = true
```

3. Keep Codex-specific details in Codex config
   - Sandbox behavior.
   - Approval behavior.
   - Plugin/tool availability.
   - Browser/computer-use behavior.
   - `apply_patch` editing constraints.

## Security Red Lines To Add Globally

Recommended global safety rules:

- Do not proactively `git push`.
- Do not deploy to production without explicit approval.
- Do not apply production migrations without explicit approval.
- Do not modify production data.
- Do not read, print, summarize, commit, or expose secret values. Only confirm whether required secrets appear present.
- Do not run destructive commands such as `rm -rf`, `git reset --hard`, `git clean -fdx`, `drop database`, `truncate`, or broad `delete/update` without a clear `where` condition.
- Do not use production service role keys, production DB URLs, or cloud admin tokens for exploratory work.
- Do not modify migrations that have already been applied to hosted/production environments. Add forward migrations instead.
- For DB/RLS/schema changes, use local-first validation before proposing production application.
- For OAuth redirect, CORS, referrer allowlist, DNS, domain, billing, and cloud settings, propose a plan first.

## Project Type Routing

Use different process levels instead of forcing every task through VChat-level OpenSpec.

- PM only
  - Status reports, backlog cleanup, Jira/Confluence summaries, meeting action items.
  - No code context unless needed.
- Mini plan
  - Single-file or low-risk changes.
  - Still give a short 5-bullet strawman first.
- Repo plan
  - Multi-step feature work, product direction, SEO/content waves, release plans.
  - Use repo source-of-truth docs.
- OpenSpec
  - Cross-module behavior, API contracts, schema/RLS, privacy, security, payment, auth, or long-lived capability changes.
  - VChat complex features likely stay here.
- Pipeline
  - Architect, implementer, tester, reviewer, reporter roles.
  - Use when multiple independent streams or high-risk changes exist.
- Review only
  - Diff review, security review, regression risk review.
  - Findings first, with file/line references.

## Multi-Agent Role Template

Recommended reusable roles:

- PM / Commander
  - Owns scope, user gates, final judgment, and handoff.
- Scout / Explorer
  - Read-only repo and docs investigation.
- Architect
  - Designs approach, risks, acceptance criteria, and tradeoffs.
- Implementer
  - Implements only the approved plan.
- Tester
  - Reproduces, tests, and verifies behavior.
- Reviewer
  - Fresh-context review against spec, diff, and acceptance criteria.
- Reporter
  - Jira, Confluence, status reports, release notes.

Important rule:

- Subagents collect evidence and propose recommendations.
- The main thread keeps product judgment, scope decisions, and risk acceptance.

## Repo-Level Template

For new projects, create a short `AGENTS.md` or `CLAUDE.md` with this structure:

```md
# AI Onboarding

## What This Project Is

## Source Of Truth

## Tech Stack

## Commands

## Architecture Boundaries

## Data / Security Boundaries

## Environment Matrix

## Testing And Verification

## Deployment Policy

## Product Red Lines / Non-Goals

## Common Gotchas
```

For backend/DB projects, add:

- Migration policy.
- RLS/ACL policy.
- Secrets policy.
- Rollback policy.
- Local/staging/prod operation matrix.

For frontend/web projects, add:

- Visual QA expectations.
- Browser/dev server workflow.
- Playwright projects.
- Responsive viewport checks.
- Console error policy.
- Deployment preview policy.

For Android/mobile projects, add:

- Module boundaries.
- Gradle task matrix.
- Emulator/device testing policy.
- adb permissions.
- Release flavor/build variant rules.

## Suggested Claude Code Prompt

Use this prompt to continue:

```text
請讀取 `/Users/ian/tennisPartnerFinder/docs/ai-cross-project-setup-handoff.md`，並幫我把跨專案 AI 設置整理成可落地的修改計畫。

先不要改檔。請先給我 5 bullet strawman plan，並把未確定點依三桶紀律分類：

1. repo / docs 可查得到，請你自己查
2. 在我腦中且錯了會造成大 rework，請問我
3. 在我腦中但 rework 便宜，請列入假設

目標是調整 Claude Code / Codex 設置，讓 VChat Android 流程保留在 VChat 專案層，同時建立跨專案共用的全域治理規則、Codex AGENTS mirror、repo onboarding template，以及安全權限邊界。
```

## My Recommendation

Do this in phases:

1. Create the shared governance kernel.
2. Mirror it to Codex `~/.codex/AGENTS.md`.
3. Move VChat/Android-specific permissions back to the VChat repo.
4. Add global safety red lines and permission gates.
5. Create repo onboarding templates.
6. Apply the template to `tennisPartnerFinder` only if Ian wants a neutral `AGENTS.md` in addition to `CLAUDE.md`.

The key principle: preserve the power of the VChat workflow, but stop making it the default shape of every project.
