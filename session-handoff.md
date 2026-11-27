# Session Handoff

## Verified Now

- What is currently working:
- What verification actually ran:

## Changed This Session

- Code or behavior added:
- Infrastructure or harness changes:

## Broken Or Unverified

- Known defect:
- Unverified path:
- Risk for the next session:

## Next Best Step

- Highest-priority unfinished feature:
- Why it is next:
- What counts as passing:
- What must not change during that step:

## Commands

- Startup:
- Verification:
- Focused debug command:

## Session Log

- 2026-11-27 startup: gh user mintsource OK; worktree /Users/dan/workspaces/frequency-frq-08 on feat/frq-08-dependency-upgrade from origin/main 258d482 (PR #14 already merged). Main checkout's uncommitted user AGENTS.md prefix left untouched.
- ./init.sh PASS on baseline: install, typecheck, lint, 73/73 tests (Node v24.21.0, pnpm 12.9.1).
- frq-08-dependency-upgrade added in_progress/approved (frq-06/07 ids taken by unpushed feat/frq-07-compact-browser worktree). Plan docs/plans/frq-08-dependency-upgrade.md.
- Step 1 tooling bump (eslint 10.15.0, typescript-eslint 8.74.0, @types/node 26.6.11, hls.js 1.7.4, fake-indexeddb 6.2.8, fast-xml-parser 5.12.1, typescript pinned ~6.0.3): pnpm install --frozen-lockfile OK; pnpm run check PASS exit 0, 73/73.
- Step 2 pnpm 12.9.1 -> 12.23.0: lockfile self block regenerated (lockfileVersion 9.0 unchanged), frozen install OK, allowBuilds esbuild still honoured; pnpm run check PASS 73/73.
- Step 3 remix 3.0.0 -> 3.3.0 (component 1.3.0, assets 1.0.3, fetch-router 1.0.1, spa 1.0.3): typecheck/lint clean with no source changes; pnpm run build PASS 73/73; dist/assets/app.js 160,208 -> 120,841 bytes (-24.6%, gzip 51,181 -> 40,402) vs identical source on 3.0.0. SPA guard still armed (probe bundle importing spaResponse contains the string).
- Blocker found: [::1]:44100 owned by another local node app (PID 23905, src/server.ts); dev verified on PORT=44102, static on 127.0.0.1:44101.
- Dev curl matrix: / 200, 27 modulepreloads, entry not double-preloaded; epg/freeview.json + epg/tv.json 200; all 28 offline-assets.json hrefs 200. /tv 500 = PRE-EXISTING: Node Response.redirect rejects relative URL (reproduced with plain node -e, no Remix). Dev only; prod uses tv.html. Not fixed on this branch.
- Browser (Playwright 1.66 + Chrome, /tmp/frq08-browser/golden.mjs): dev 12/12 PASS (BBC Radio 1 plays; BBC One video advanced 5.3s/136 frames; all/guide programme dialog; 255 aria attrs all "true"/"false"; blocked-stream Retry; mobile no overflow). Static 10/12: functional all PASS; 2 console-clean checks fail on upstream i.imgur.com logo 403s.
- PRE-EXISTING finding: "handle.update() infinite loop detected" on static origin. ~149 imgur logos 403 in one burst; each img on('error') calls update(), exceeding the 50-per-turn limit. Identical on 3.0.0 static build (19/39/43 vs 20/43/43 loop errors over 3 runs); 0 on dev/localhost. Detector unchanged between component 1.0.0 and 1.3.0 (threshold 50). Logged as follow-up.
- scripts/browser-tv-feeds.mjs PASS dev + static (pageErrors []); scripts/browser-tv-review.mjs PASS dev (pageErrors []). Harness screenshots not committed; golden screenshots docs/screenshots/frq-08-{dev,static}-*.png.
- Step 4 Node 26: .node-version (26) added; all three workflows use actions/setup-node node-version-file: .node-version; engines.node >=26.0.0; README/AGENTS/docs/sources.md version text (remix 3.3.0, Node 26+).
- Node 26 verification used official v26.13.1 tarball (SHASUMS256 OK) in /tmp, PATH-only (nvm untouched): clean pnpm install --frozen-lockfile, pnpm run check PASS 73/73 (no Experimental/Deprecation warnings), build PASS, sync-epg PASS (287 ch / 48,639 progs), dev server on Node 26 (remix/node-tsx loader) golden 12/12 PASS.
- Node 24.21.0 with engines >=26: pnpm prints "Unsupported engine" WARN, install and typecheck still succeed (engine-strict unset).
