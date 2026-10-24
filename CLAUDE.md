# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Claude Code specifics

Everything shared lives in `AGENTS.md`. Only add notes here that apply to Claude Code alone.

- **Plan Gate:** enter plan mode, research with Explore agents, write the plan to `docs/plans/<id>.md`, then call `ExitPlanMode` and wait for approval.
- **Skills:** `.claude/skills/*` are symlinks to `.agents/skills/*`, so `/developer-workflow` loads the same file other agents read. Edit the file under `.agents/`, not the symlink.
- **Browser verification:** use the Playwright MCP or the preview tools against `pnpm run dev` (http://localhost:44100) and save screenshots under `docs/screenshots/`.
- **Memory:** agent-private memory doesn't replace the repo files. Record state in `session-handoff.md`, `frequency-progress.md` and `feature_list.json`.
