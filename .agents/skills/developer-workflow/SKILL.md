---
name: developer-workflow
description: Developer workflow for Frequency — issue creation, PR process, verification checklist and adding a feature with a plan. Use whenever opening a pull request, checking whether an issue exists, composing a PR description, or adding a feature to feature_list.json.
---

# Developer Workflow

This skill covers the whole contribution process for Frequency, from picking up a feature to merging a reviewed, verified PR. It applies to any coding agent (Claude Code, Codex, Cursor, Copilot) and to people.

Repository: `machinescapes/FrequencyPlayer`. Package manager: `pnpm` (pinned via `packageManager` in `package.json`; never commit a `package-lock.json`).

---

## 1. Every PR Requires a Linked Issue

Before opening a PR, confirm that a GitHub issue exists for the work.

```sh
gh issue list --repo machinescapes/FrequencyPlayer --state open
```

If there isn't one, create it:

```sh
gh issue create \
  --repo machinescapes/FrequencyPlayer \
  --title "<concise problem statement>" \
  --body "<one paragraph: the problem or need, what prompted it, the intended outcome>"
```

Record the issue number. It goes in the PR title and body, and in the feature's `github_issue` / `github_issue_url` fields.

---

## 2. PR Title Convention

```
<type>(<scope>): <short imperative description> (#<issue>)
```

| Field | Values |
|-------|--------|
| `type` | `feat` · `fix` · `chore` · `docs` · `refactor` · `test` |
| `scope` | The feature id or affected area, e.g. `frq-01`, `tv`, `epg`, `player`, `sw` |
| description | Imperative, ≤ 60 chars, no trailing period |
| `#issue` | The linked issue number |

Examples:
```
feat(frq-02): add channel config for pinned and hidden channels (#12)
fix(player): retry HLS connect after network change (#9)
chore(ci): run tv sync on workflow_dispatch only (#15)
```

---

## 3. PR Body

Use `.github/PULL_REQUEST_TEMPLATE.md`. GitHub fills it in automatically for `gh pr create` when you don't pass `--body`. It has four sections: Issue, Context, Changes and Verification.

---

## 4. Verification Checklist

Run these in order and record the results in the PR body and in `session-handoff.md`.

### 4a. Typecheck, lint, tests
```sh
pnpm run check
```
It must exit 0. Note the test count (e.g. `48/48`). This is the same command CI's Quality workflow runs.

### 4b. Data snapshots (only if `scripts/` or `public/tv/` changed)
```sh
pnpm sync:tv --check       # committed public/tv matches what the script would produce
```
`--check` needs the network and reflects live upstream data, so a diff can come from upstream drift rather than your change. Say which one it is.

### 4c. Browser smoke test
```sh
pnpm run dev
```
Open http://localhost:44100 and confirm the following:
- `?scope=watch&view=channels`, `?scope=listen&view=channels` and `?scope=all` render. Check that the counts and ordering look right.
- `&view=guide` renders the timeline for channels that have listings.
- The changed behaviour works end-to-end, including at least one edge case.
- A channel or station plays, or fails with the expected message.
- There are no console errors on the affected flows.
- You've taken a screenshot as evidence (`docs/screenshots/` or the PR).

Use the browser automation your agent has. If it has none, ask the user to check and record what they observed.

### 4d. Production build (if the shell, assets, service worker or base path changed)
```sh
pnpm run build
```
Then serve `dist/` and repeat the smoke test.

---

## 5. Before You Push

1. Confirm the feature is `in_progress` in `feature_list.json`.
2. Run `pnpm run check` one final time.
3. Update `frequency-progress.md` and `session-handoff.md`, and commit them.
4. Push the branch and open the PR using the template.
5. After merge, set the feature to `passing` with its verification evidence.

---

## 6. CLI Reference

```sh
gh pr create --repo machinescapes/FrequencyPlayer          # uses the PR template
gh pr create --title "feat(frq-NN): description (#NN)" --body-file /tmp/pr.md
gh pr status
gh run list --repo machinescapes/FrequencyPlayer -L 5      # recent CI runs
gh workflow run tv-sync.yml --repo machinescapes/FrequencyPlayer     # manual TV refresh
```

---

## 7. Feature Status Flow

```
not_started → in_progress → passing
                           ↑
                    (only after verification passes
                     and evidence is recorded)
```

A feature **can't** move to `passing` without evidence in `feature_list.json`. If work is blocked, set it to `blocked` and document why in `frequency-progress.md` before the session ends.

---

## 8. Adding a New Feature via a Plan

### 8a. Write the plan file

Create `docs/plans/frq-NN-short-slug.md`. For the id, take the next number after the highest `frq-NN` in `feature_list.json`.

```markdown
# Plan: <Title> (frq-NN)

## Context
<!-- Why this is needed, what prompted it, the intended outcome. -->

## What Gets Built
<!-- Bullet list of concrete deliverables. -->

## Implementation Steps
<!-- Numbered sections, one per logical chunk. File paths, function names, sketches. -->

## Critical Files
<!-- Table of files to create or modify and what changes in each. -->

## Verification
<!-- pnpm run check, browser smoke test (which scope/view), sync --check if relevant. -->
```

### 8b. Get approval

Present the plan and **wait for the user's explicit approval** before writing any code. Claude Code does this with plan mode and `ExitPlanMode`. Other agents post the plan and stop until the user replies. After approval, set `"plan_status": "approved"`.

### 8c. Add the entry to `feature_list.json`

```json
{
  "id": "frq-NN-short-slug",
  "title": "FRQ-NN Short human-readable title",
  "status": "not_started",
  "type": "feature",
  "plan": "docs/plans/frq-NN-short-slug.md",
  "plan_status": "approved",
  "summary": "One or two sentences on what will be built and why.",
  "summary_of_intent": "User: '<quoted user request that prompted this feature>'",
  "scope": ["path — what changes"],
  "verification": { "check": "not_run", "browser": "not_run" },
  "next_steps": [
    "Read the implementation plan at docs/plans/frq-NN-short-slug.md before starting work.",
    "..."
  ]
}
```

### 8d. Rules

- `"plan"` points to the in-repo file, never to a path outside the repo.
- If the feature is added without a plan, use `"plan": null, "plan_status": "pending"`, and make the first `next_steps` entry: `"Create an approved plan at docs/plans/<id>.md before starting work — implementation is blocked until plan_status is 'approved'."`
- When a plan file exists, the first `next_steps` entry is `"Read the implementation plan at <plan path> before starting work."`
- `"summary_of_intent"` keeps the user's original words.
- For features that come from a GitHub issue, also set `github_issue` (number) and `github_issue_url`.
- **Hard gate:** don't write implementation code for a feature whose `plan_status` isn't `"approved"`.
