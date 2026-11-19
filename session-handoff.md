# Session Handoff

## Verified Now

- What is currently working: FRQ-05 default IPTV-org UK, multiple feeds/channel controls, verification, grouped fallback playback, XMLTV/UK guides, local transfer/offline; existing Listen preserved. GitHub mintsource, feature branch feat/frq-05-tv-feed-management.
- What verification actually ran: ./init.sh baseline 50/50; final check/build 70/70; EPG sync; complete development and static Chrome suites (1440x1000 + 390x844), 36 screenshots in docs/screenshots/frq-05-*.png. Full commands/captions in docs/tv-feed-browser-evidence.md.

## Changed This Session

- Code or behavior added: Approved FRQ-05 implementation and Add channels entry points; see docs/plans/frq-05-tv-feed-management.md and docs/tv-feeds.md.
- Infrastructure or harness changes: scripts/browser-tv-feeds.mjs with attributed local playback fixture; broader generated UK guide; default M3U snapshot in weekly sync; complete offline JS manifest. Issue #13.

## Broken Or Unverified

- Known defect: No application defect found by final deterministic/browser checks. pnpm sync:tv --check fails on known live upstream/health drift in optional country JSON; those files remain unchanged.
- Unverified path: Every real upstream stream, geographic availability on a UK VPN, real iOS Safari and physical gamepad/TV hardware.
- Risk for the next session: AGENTS.md has a pre-existing user-owned prefix change that must remain uncommitted; architecture addendum staged separately. Generated EPG is gitignored and needs sync in fresh checkouts. Current origin/main has newer optional catalogue refreshes; branch did not overwrite them.

## Next Best Step

- Highest-priority unfinished feature: frq-05-tv-feed-management remains in_progress, approved and verified locally, awaiting PR/CI/review/merge.
- Why it is next: Complete review and merge of this user-requested feature; no additional implementation feature is started.
- What counts as passing: Quality CI green, reviewed PR with embedded browser screenshots, merge; update feature to passing after merge.
- What must not change during that step: User-owned AGENTS.md prefix, Listen catalogue, unrelated optional country snapshots; retain all recorded evidence.

## Commands

- Startup: ./init.sh; node scripts/sync-epg.mjs for local Guide data; pnpm run dev.
- Verification: pnpm run check; pnpm run build; browser commands in docs/tv-feeds.md / docs/tv-feed-browser-evidence.md.
- Focused debug command: node --test test/tv-feeds.test.js; PLAYWRIGHT_MODULE=/tmp/frq05-browser/node_modules/playwright/index.mjs node scripts/browser-tv-feeds.mjs.

## Session Log

- 2026-11-18: Startup `./init.sh` PASS: dependency install, typecheck, lint, 50/50 tests; GitHub mintsource; branch feat/frq-05-tv-feed-management.
- Previous verified state: FRQ-04 merged; real iOS/controller coverage incomplete; guide needs generated EPG; old progress notes include superseded iptv-org data.
- User approved FRQ-05 plan and required browser screenshots embedded in PR; AGENTS.md has a user-owned uncommitted change, left untouched.
- FRQ-05 added: in_progress, plan_status approved; implementation authorised by user.
- Issue #13 created for FRQ-05: https://github.com/machinescapes/FrequencyPlayer/issues/13.
- `pnpm run check` PASS after integration (50/50 existing tests; new tests not yet included at that run).
- Unexpected dev-server finding: Remix assets rejects fast-xml-parser's CommonJS internals. Switching browser XMLTV parsing to native DOMParser while keeping shared conversion and the existing Node pipeline parser.
- `pnpm run check` FAIL with new suite: 64/67; Node exposes navigator without onLine, incorrectly classified probes offline. Fixing offline detection to require onLine === false. Browser XMLTV parser changed to native DOMParser; shared guide conversion retained for Node sync/tests.
- `pnpm run check` PASS: typecheck, lint, 67/67 tests after Node offline detection fix.
- `node scripts/sync-epg.mjs` PASS: broad guide 287 channels / 48,965 programmes; existing radio/TV extract 9,122 programmes. First Chrome smoke renders without page errors; full flows pending.
- `pnpm run build` PASS: check 67/67 and static bundles built, including lazy XMLTV/HLS chunks in offline manifest.
- Chrome preliminary browser checks PASS: Add channels opens populated manager; 390px manager has no horizontal overflow (372px client/scroll width). Screenshots currently /tmp/frq05-manager*.png; full evidence suite pending.
- `pnpm sync:tv --check` FAIL: committed optional Free-TV country snapshots differ from current upstream/health probes (including GB, UA, AE, US, VE and index). No optional catalogue rewrites applied; default snapshot independently validated. This known live-data drift is separate from deterministic code checks.
- Browser suite reached real HLS fallback playback, imports, toggles, verification, manual EPG, refresh/new/error and grouped Guide screenshots. Harness failed waiting for gzip guide text inside an already-collapsed details panel; guide loaded successfully. Correcting panel-state handling before rerunning.
- Second browser suite exercised all desktop/mobile flows and produced 16 screenshots. Final error assertion caught harness-injected localStorage access on external popup documents; guarding the test initialisation by origin and rerunning. Application flows completed successfully.
- `pnpm run check` PASS: 67/67 after guide-priority and persistence-coalescing review.
- Full development browser suite PASS: `PLAYWRIGHT_MODULE=/tmp/frq05-browser/node_modules/playwright/index.mjs node scripts/browser-tv-feeds.mjs`; desktop + mobile, real HLS fixture playback, no application page errors, 16 screenshots. Additional coverage and review fixes underway before final build/PR.
- Extended browser suite caught a brittle settings-import success-message assertion: guide refresh immediately replaces that message. Export validates and restores correctly; changing the assertion to the restored feed switch state. Optional Free-TV and guide-error preservation were exercised before that point.
- `pnpm run check` PASS (67/67) before final stream-identity review. Stream preferences now distinguish identical entries from separate feeds; disabled feed filters reset to All.
- `pnpm run build` PASS again: typecheck/lint/67 tests and static asset output after stream identity and optional UK migration changes. Static server running at http://localhost:44101 for production browser checks.
- Extended development browser suite PASS: same Playwright command, now includes optional Free-TV switching/filter reset, invalid guide retention, cross-feed alternate streams, keyboard search and 18 caption-ready screenshots; no page errors.
- Production static browser suite PASS: `BROWSER_BASE_URL=http://localhost:44101 BROWSER_EVIDENCE_PREFIX=frq-05-static PLAYWRIGHT_MODULE=/tmp/frq05-browser/node_modules/playwright/index.mjs node scripts/browser-tv-feeds.mjs`; all desktop/mobile flows, offline reload and no page errors; 18 additional screenshots.
- Review improvement: guide records now persist separately from feed choices so each verification result does not rewrite the broad 49k-programme guide. Rechecking persistence and rebuilding before final evidence run.
- Persistence follow-up `pnpm run check` PASS: 70/70 including guide-cache updates, cancelled lazy HLS loading and muted autoplay rejection. Earlier intermediate persistence check failed on an extra undefined field in the round-trip shape; fixed before this pass.
- Expanded reload assertion found a UI defect: the saved preferred stream is correct in exported settings, but a freshly mounted select shows its first option. Fixing option selection on initial render; also applying this to manual mapping/group and country controls. Final browser suites will be repeated.
- `pnpm run build` PASS: 70/70 tests and static assets before the select-initialisation fix.
- Final expanded development browser suite PASS after select fix: manual grouping/ungrouping and remembered stream after reload now included; no page errors, 18 screenshots refreshed.
- `pnpm run build` PASS: 70/70 tests and all production assets after select fix.
- Final production browser suite PASS after select/persistence fixes: full desktop/mobile scenarios, manual grouping and remembered preference on reload, no page errors; 18 static screenshots refreshed (36 total).
- Default M3U independently matches live upstream after LF normalisation: 308 entries / 297 grouped channels. Existing optional Free-TV catalogue drift remains documented.
- Final `./init.sh` PASS: install, typecheck, lint, 70/70 tests. Screenshot review found mobile expanded-player actions could be clipped despite no page-width overflow; adjusting that row and adding explicit control-bound checks before refreshing final captures.
- Mobile expanded-player layout fix verified in development suite: all stage controls inside the 390px viewport; no page errors. `pnpm run build` PASS again (70/70). Refreshing production captures for this visual correction.
- Final static suite PASS after mobile action-row correction; every expanded-player action is within the 390px viewport, no page errors. 36 final screenshots ready for PR; docs/tv-feed-browser-evidence.md records all coverage and known catalogue drift.
