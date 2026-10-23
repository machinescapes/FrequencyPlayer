# Progress Log

## Current Verified State

- 2026-10-24: `main` at `81de95b` (deploys to frequency.wtf root). `pnpm run check` passes: typecheck, lint and 48/48 tests.
- TV catalogue: `public/iptv.json` was generated locally on 2026-10-19. It has 145 GB channels: 73 `ok`, 31 `cors`, 41 `offline`. 13 are essentials, and only BBC News South Asia is `ok` among them. 22 channels have guide coverage.
- `iptv-sync.yml` hasn't run yet. It reached `main` on Tue 2026-10-20, after that week's Monday 04:17 UTC slot, so the first scheduled run is Mon 2026-10-26. It can be triggered early with `gh workflow run iptv-sync.yml`.
- Known catalogue gap: BBC Two, Three and Four, CBBC and CBeebies are missing because iptv-org only lists them as `http://` or DASH `.mpd`, and the sync accepts HTTPS HLS only.
- Pages deploys on schedule every 6 hours and is succeeding.

## Session Log

### Session 2026-10-24: agent harness adopted

- Brought the unscatteredweb session harness into this repo: `AGENTS.md` (canonical, agent-neutral), `CLAUDE.md` (imports it), `feature_list.json`, this log, `session-handoff.md`, `init.sh`, the `.agents/skills/developer-workflow` skill (symlinked into `.claude/skills`), the PR template, `.github/copilot-instructions.md` and the Codex environment.
- Seeded `frq-01-channel-order-control` and `frq-02-channel-config`. Both now have approved plans in `docs/plans/` (frq-02 first, since frq-01 depends on it).
- Brought `docs/iptv.md` up to date with what the sync really does (GB filter, guide join, health probe, US-runner geo caveat).
- Verification: `./init.sh` (`pnpm install` + `pnpm run check`).
- Standardised on pnpm: `packageManager: pnpm@12.9.1`, `package-lock.json` removed, CI workflows use `pnpm/action-setup` + `pnpm install --frozen-lockfile`, all docs and scripts updated.
