# Progress Log

## Current Verified State

- 2026-11-18: FRQ-05 implemented on `feat/frq-05-tv-feed-management` (issue #13): default IPTV-org UK, Add channels, multiple feed/entry controls, browser verification, grouped stream selection/fallback, custom XMLTV and broader UK EPG, IndexedDB/transfer/offline. Check/build pass with 70 tests. Development and static Chrome desktop/mobile suites pass with 36 screenshots; see `docs/tv-feed-browser-evidence.md`. Optional Free-TV live snapshot check reports upstream drift; default M3U matches upstream. Awaiting PR review/merge; no production deployment claimed.

- 2026-11-14: Local checkout includes merged PR #12 (5850d36) and subsequent catalogue refresh; older iptv-org notes below are historical. `./init.sh` passes: typecheck, lint, 50/50 tests. No browser or deployment verification this session. All tracked features remain passing; local main was behind origin/main by 2 commits at startup.

- 2026-10-24: `main` includes frq-01, frq-02 (PR #10) and frq-03 (direct push, `c88158f`), all live on frequency.wtf. Earlier today: `main` at `81de95b` (deploys to frequency.wtf root). `pnpm run check` passes: typecheck, lint and 48/48 tests.
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

### Session 2026-11-18: FRQ-05 feed management

- User approved the detailed plan and browser screenshot requirement. Issue #13; plan `docs/plans/frq-05-tv-feed-management.md` approved, feature in_progress.
- Added pure feed/group/guide logic, separate IndexedDB guide records, import/export/refresh controls, native browser XMLTV parsing, muted isolated verification and fallback player integration. Optional Free-TV UK defaults off; legacy favourites preserved/matched where unambiguous.
- Verified actual HLS fixture playback, definitive/inconclusive exclusions, cancellation, manual EPG/group mapping, feed switches/bulk/refresh/new/error, XML/GZ upload, remembered preference, transfer/reload/offline and mobile playback. Initial select-value and browser harness issues were fixed and suites repeated successfully.
- Existing optional Free-TV snapshots drift from live upstream; no unrelated country JSON changes. Actual upstream stream uptime and real iOS/gamepad hardware remain outside fixture evidence.

- PR #14 opened for issue #13: https://github.com/machinescapes/FrequencyPlayer/pull/14. Seven embedded screenshots plus complete 36-image report; Quality CI pending. Implementation commit 45f324d, handoff commit 75d3203.

- Quality CI passed on branch and PR runs 44466068797 / 44466079881; PR #14 is mergeable. All 36 screenshots committed; 7 embedded PR images verified. Feature awaits review/merge.

### PR #14 review fixes

- Both available threads are Codex findings (no Claude review thread present): migrated favourites resurrect after removal, and TV guides stay at startup snapshots. Both confirmed valid.
- Consume only unambiguous legacy favourite mappings and persist explicit removals, including delayed metadata; retain unmatched/ambiguous dormant legacy IDs.
- Refresh built-in/remote custom TV guides on six-hour/foreground/online paths, deduplicate concurrent built-in requests, retain cached failures/uploaded files, and refresh media metadata.
- Check/build 73/73; focused real-Chrome dev/static regressions pass with 12 added screenshots. Existing original 36 screenshots retained. Push/reply/resolve and CI confirmation next.

- Review-fix commit cdfe497 pushed. Quality CI passed (44473499414 / 44473506279). Both review threads replied with evidence and resolved: 4625042529 / 4625042538. PR #14 remains open for review/merge.

- PR #14 recheck: no new comments or Claude-authored review output; both previous Codex threads remain resolved with evidence-linked replies. ./init.sh passes 73/73 and head 524c032 Quality is green. No code changes needed.
