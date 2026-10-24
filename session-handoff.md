# Session Handoff

## Verified Now

- What is currently working: Free-TV catalogue for 86 countries, top-bar country picker (UK shown as 'UK'), VPN note, http/YouTube rows open in a new tab, UK guide join (40 channels).
- What verification actually ran: pnpm run check 50/50; pnpm run build; pnpm sync:tv (full); Chrome Playwright desktop + phone on pnpm run dev (2026-10-24).

## Changed This Session

- Code or behavior added: scripts/freetv-parse.mjs, scripts/sync-tv.mjs, scripts/tv-config.json, public/tv/*.json; tv-catalogue.js validators + UK/GB display helpers; media.ts external rows + file-order sort; entry.tsx country picker, per-country loading, VPN note, labels; styles.
- Infrastructure or harness changes: tv-sync.yml replaces iptv-sync.yml; iptv-org code, data, tests and docs removed; docs/tv-sources.md.

## Broken Or Unverified

- Known defect: none found.
- Unverified path: geo-blocked BBC playback (this machine is outside the UK; segments 403) — check on a UK VPN.
- Risk for the next session: a fresh worktree has no public/epg/freeview.json, so the Guide looks empty until `node scripts/sync-epg.mjs` runs. pnpm sync:tv --check can fail on live stream drift.

## Next Best Step

- Highest-priority unfinished feature: none open; open the PR for feat/frq-04-freetv.
- Why it is next: frq-04 is verified locally.
- What counts as passing: Quality CI green; BBC plays on a UK VPN.
- What must not change during that step: radio/Listen catalogue and Freeview guide.

## Commands

- Startup: `./init.sh` then `node scripts/sync-epg.mjs` for guide data
- Verification: `pnpm run check`; `TV_COUNTRIES=GB pnpm sync:tv`; browser script /tmp/frq04-pw/verify.mjs
- Focused debug command: `node --test test/freetv-parse.test.js`

## Session Log

- Startup: worktree .claude/worktrees/frq-04-freetv on feat/frq-04-freetv from origin/main c88158f; gh = mintsource; `pnpm run check` baseline 60/60.
- frq-04-freetv-catalogue added (in_progress, plan approved).
- Full pnpm sync:tv: 86 countries, 714 KB, Free-TV@05a6685, ~2 min; malformed rows skipped BA1 HU1 JP6 RS2.
- frq-04 → passing: check 50/50, build ok, full sync 86 countries, Chrome desktop+phone verified.
