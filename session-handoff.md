# Session Handoff

## Verified Now

- What is currently working: feat/frq-08-dependency-upgrade (worktree /Users/dan/workspaces/frequency-frq-08) runs remix 3.3.0, pnpm 12.23.0, current tooling, Node 26 via .node-version. Dev and static builds play radio and TV, guide and programme dialog work. app.js is 24.6% smaller than on 3.0.0.
- What verification actually ran: pnpm run check 73/73 on Node 24.21.0 and 26.13.1; frozen install; build; sync-epg on Node 26; Playwright/Chrome golden paths dev 12/12 (Node 24 and 26), static functional pass; scripts/browser-tv-feeds.mjs (dev+static) and browser-tv-review.mjs (dev) PASS; final ./init.sh (see log).

## Changed This Session

- Code or behavior added: No app source changes. Dependency bumps; typescript narrowed to ~6.0.3; engines.node >=26.0.0; docs/framework-3-x-assessment.md; frq-08 passing; frq-09 follow-up pending.
- Infrastructure or harness changes: .node-version (26); pages/quality/tv-sync workflows use node-version-file: .node-version; packageManager pnpm@12.23.0.

## Broken Or Unverified

- Known defect: Pre-existing (identical on 3.0.0): handle.update() loop error when ~150 imgur logos fail at once; dev /tv returns 500 (relative Response.redirect). Both queued in frq-09.
- Unverified path: GitHub Actions on Node 26 (branch not pushed); Pages deploy on Node 26; real iOS/Safari.
- Risk for the next session: Port 44100 is also bound on [::1] by another local app (src/server.ts) - use PORT=44102 or stop it. Main checkout still has the user's uncommitted AGENTS.md prefix on feat/frq-05-tv-feed-management; do not commit or discard it. Parallel unpushed worktree feat/frq-07-compact-browser owns frq-06/frq-07 ids.

## Next Best Step

- Highest-priority unfinished feature: frq-08 push + PR (user to approve), then frq-09-post-upgrade-fixes (needs plan).
- Why it is next: CI on Node 26 is the remaining proof; the logo update storm can drop renders in production when imgur throttles.
- What counts as passing: Quality workflow green on the PR; for frq-09, zero loop errors in loop-repro on a static build plus /tv 302 in dev.
- What must not change during that step: remix pinned 3.3.0 exact; typescript ~6.0.3 until typescript-eslint supports TS 7; no updateUrl/prefetch adoption (re-adds frame runtime).

## Commands

- Startup: ./init.sh; PORT=44102 pnpm run dev
- Verification: pnpm run check; pnpm run build; PLAYWRIGHT_MODULE=<playwright>/index.mjs BROWSER_BASE_URL=http://localhost:44102 node scripts/browser-tv-feeds.mjs
- Focused debug command: serve dist on 127.0.0.1 and count 'infinite loop detected' console messages on ?scope=watch&view=channels while scrolling

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
- Final ./init.sh PASS from clean node_modules (Node 24.21.0: engine WARN only), 73/73.
- Issue #15 created for frq-08; feature_list records github_issue 15.
