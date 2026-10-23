# Session Handoff

## Verified Now

- What is currently working: `main` + `chore/agent-harness` build and test clean under pnpm; agent harness files in place.
- What verification actually ran: `./init.sh` (`pnpm install --frozen-lockfile` + `pnpm run check`) — 48/48 tests, typecheck and lint clean (2026-10-24).

## Changed This Session

- Code or behavior added: none to app code.
- Infrastructure or harness changes: AGENTS.md/CLAUDE.md harness, feature_list.json, progress log, init.sh, developer-workflow skill, PR template, Copilot/Codex config; switched repo and CI to pnpm (package-lock.json removed); approved plans for frq-01 and frq-02. Commits 2529b26, b9f8218, 68b02f3.

## Broken Or Unverified

- Known defect: 72 of 145 TV channels not `ok` in the 2026-10-19 snapshot.
- Unverified path: pnpm-based CI workflows have not run on GitHub yet; this PR's Quality run is the first.
- Risk for the next session: iptv-sync.yml first scheduled run is Mon 2026-10-26 and now uses pnpm.

## Next Best Step

- Highest-priority unfinished feature: frq-02-channel-config.
- Why it is next: frq-01 ordering depends on the `pin` field it adds.
- What counts as passing: plan's Verification section — tests, pnpm run check, sync --check, browser check of hidden/added channels.
- What must not change during that step: existing filtering/health semantics for channels not named in the config.

## Commands

- Startup: `./init.sh`
- Verification: `pnpm run check`
- Focused debug command: `node --test test/iptv-parse.test.js`
