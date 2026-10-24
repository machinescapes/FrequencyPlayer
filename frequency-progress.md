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

### Session 2026-10-24 (cont.): frq-02 channel config

- `scripts/iptv-config.json` (pin/hide/add) applied by `applyConfig()` in `scripts/iptv-parse.mjs` before the health probe; `validateConfig()` rejects bad entries; unmatched ids warn.
- Verified: `pnpm run check` 56/56; `pnpm sync:iptv` then `--check` clean; browser (Chrome) hide + add + playback confirmed, screenshot `docs/screenshots/frq-02-config-added-playing.png`.
- `pnpm sync:iptv --check` compares live health probes, so it can fail on upstream drift rather than code changes.

### Session 2026-10-24 (cont.): frq-01 channel order

- `orderChannels()` tiers: listings → config `pin` → essentials → health → title; `fromWatch` carries `pin`/`essential`; unused favourites param dropped. Documented in `docs/iptv.md` "Channel order".
- Verified: `pnpm run check` 60/60; Chrome — Watch grid follows pin list then essentials; scopes have no duplicates; radio order identical to main. Screenshot `docs/screenshots/frq-01-watch-order.png`.

### Session 2026-10-24 (cont.): frq-03 YouTube-style TV player

- One shared `<video>` moves between three hosts in `entry.tsx`: inline (inside the selected card), mini (bottom bar thumbnail) and expanded (stage). An IntersectionObserver docks inline → mini when the card scrolls away and restores it on return. Phones (≤540 px) open a sticky 16:9 stage instead of inline.
- Overlay controls (`videoControls`) on the video: play/pause, LIVE, PiP, expand/collapse, full screen on the container (webkit fallback for iOS). Idle fade after 3 s; `f`/`k`/`Esc` shortcuts; double-tap for full screen.
- Verified: `pnpm run check` 60/60; Chrome desktop + phone emulation golden paths and edge cases (guide, listen scope, failed stream). Screenshots `docs/screenshots/frq-03-*.png`. Real iOS Safari not yet checked.

### Session 2026-10-24 (cont.): frq-04 Free-TV catalogue

- TV now comes from Free-TV/IPTV, one country at a time (`public/tv/<CC>.json`, 86 countries, 714 KB total). iptv-org removed. File order and logos are preserved; http/YouTube rows open in a new tab; geo-blocked rows are kept and labelled. A top-bar country picker shows the UK as "UK", and a VPN note is on every Watch page. `tv-sync.yml` runs weekly.
- Verified: `pnpm run check` 50/50, build, full sync, Chrome desktop and phone (screenshots `docs/screenshots/frq-04-*.png`). BBC inline playback is unverified from outside the UK.
