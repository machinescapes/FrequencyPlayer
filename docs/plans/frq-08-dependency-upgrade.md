# Plan: Dependency upgrade — Remix 3.3.0, Node 26, framework assessment (frq-08)

## Context

The repo has been pinned to `remix@3.0.0` (released 1 Oct 2026) since the v3 launch. Remix has since published **3.1.0** (23 Oct), **3.2.0** (4 Nov) and **3.3.0** (19 Nov), and the rest of the toolchain has drifted too. Separately, the build/deploy runtime is pinned to Node 24 in all three workflows: Node 24 moved to **maintenance on 20 Oct 2026**, while **Node 26 is now Active LTS** (since 28 Oct 2026). CI is therefore building a static site on a maintenance-line runtime.

Three outcomes are wanted:

1. Everything on current versions, including Remix 3.3.0.
2. Any fixes needed after reading the upgrade material, applied and verified.
3. A written assessment of framework features that did not exist at 3.0 and would be worth refactoring toward — plus a patched deployed Node.

**User decisions already taken:** Remix → **3.3.0**; Node → **26 in CI and in `engines`**; the framework assessment is **documented only** on this branch, with refactors deferred to follow-up features.

There is no Remix "upgrade guide" for 3.0 → 3.3. I checked: `remix.run/docs/.../upgrading` 404s to the v2 docs, and the v3 docs site has no migration page. The authoritative source is `packages/remix/CHANGELOG.md` plus the per-package changelogs (`component`, `assets`, `fetch-router`, `spa`) — all sections for 3.1, 3.2 and 3.3 have already been read and are reflected below. 3.1–3.3 are semver-minors with no breaking changes for the API surface this repo uses.

## Target versions

| Package | Current | Target | Note |
|---|---|---|---|
| `remix` | `3.0.0` (exact pin) | `3.3.0` (exact pin) | pulls `@remix-run/component` 1.0.0→1.3.0, `assets` 1.0.0→1.0.3, `fetch-router` 1.0.0→1.0.1, `spa` 1.0.0→1.0.3 |
| `hls.js` | `^1.7.3` | `^1.7.4` | |
| `@types/node` | `^26.6.5` | `^26.6.11` | matches Node 26 |
| `eslint` | `^10.13.0` | `^10.15.0` | |
| `typescript-eslint` | `^8.71.2` | `^8.74.0` | |
| `fake-indexeddb` | `^6.2.6` | `^6.2.8` | |
| `fast-xml-parser` | `^5.11.2` | `^5.12.1` | |
| `esbuild` | `^0.28.2` | no change | already latest |
| `typescript` | `^6.0.3` | **pin `~6.0.3`** | see below |
| `pnpm` (`packageManager`) | `12.9.1` | `12.23.0` | lockfile stays `lockfileVersion: 9.0` |

### Why TypeScript is the one exception

TypeScript `7.0.2` is the current `latest`, but `typescript-eslint@8.74.0` — which is itself the latest, with no 9.x published — declares `typescript: ">=4.8.4 <6.1.0"`. Taking TS 7 would mean either dropping `typescript-eslint` from `eslint.config.js` entirely or running a peer range that is known-incompatible. `6.0.3` is the newest 6.x, so the repo is already current *within* the supported window. The range is narrowed to `~6.0.3` so a future update fails loudly instead of resolving past typescript-eslint's `<6.1.0` peer ceiling. Flagged in the assessment doc as "revisit when typescript-eslint supports TS 7", not silently skipped.

## Compatibility checks already done

Verified directly against the published `remix@3.3.0` and `@remix-run/*` tarballs, not inferred from release notes:

- **Every imported subpath still exists**: `./component`, `./assets`, `./router`, `./routes`, `./node-tsx`, `./node-fetch-server`, `./middleware/static`, `./test` (110 export entries in total; `./middleware/csp` is new).
- **`Handle` is source-compatible**: `update(): Promise<AbortSignal>` and `queueTask(task: Task): void` are unchanged from 1.0.0. The seven `update().then(...)` sites in [entry.tsx](app/public/entry.tsx) keep working.
- **Component exports intact**: `createRoot`, `on`, `ref`, `Handle`, `createMixin` all still exported. New in 3.3: `updateUrl`, `prefetch`, `navigate`.
- **Asset server API intact**: `AssetServerOptions` keeps `basePath`, `rootDir`, `allowFiles`, `allowPackages`, `minify`; `getScriptEntry(filePath): Promise<ScriptEntry>` unchanged; `ScriptEntry` is a public type export.
- **`remix@3.3.0` still declares `engines.node: ">=24.3.0"`** — the Node 26 bump is our choice, not forced by Remix.
- **The rest of the toolchain tolerates the chosen versions**: `@types/node@26.6.11` targets TS ≥5.6 (we have 6.0.3), and `eslint@10.15.0` accepts Node `>=24`, so nothing in the bump forces a Node or TS jump beyond what is planned.
- **The static-build guard still works**: `'Expected a Remix SPA response'` is still present in `@remix-run/component@1.3.0` (`dist/runtime/spa-response.js`), so the check in [build.mjs:42](scripts/build.mjs#L42) still catches a regression.

### Behaviour changes in 3.1–3.3 that do *not* apply here

- `css()` numeric/custom-property serialization changes — the app imports no `css()`; all styling is [public/styles.css](public/styles.css).
- Boolean `aria-*`/`data-*` now render `"true"`/`"false"` on the server — the app is client-rendered only (`createRoot`, no SSR). Re-check `aria-pressed`/`aria-checked`/`aria-expanded` in the browser anyway.
- Nonce CSP, lazy `<Frame>`, streaming SSR, `clientEntry` — none used.

## Implementation steps

Branch: `feat/frq-08-dependency-upgrade`, cut from `origin/main` (which already includes merged PR #14) in its own worktree. `frq-06`/`frq-07` are taken by unpushed work in another worktree.

Each numbered step is one commit that leaves `pnpm run check` green.

### 1. Tooling-only bump

`eslint`, `typescript-eslint`, `@types/node`, `hls.js`, `fake-indexeddb`, `fast-xml-parser`. Run `pnpm install`, then `pnpm run check`. Isolating this from the Remix bump means any lint-rule or type drift is attributable.

Watch for: new `@typescript-eslint` recommended rules firing on existing code (the config spreads `tseslint.configs.recommended`), and `@types/node` 26 typings on [server.ts:12](server.ts#L12) (`NodeJS.ErrnoException`).

### 2. pnpm bump

Set `"packageManager": "pnpm@12.23.0"`, regenerate the lockfile with that pnpm. Confirm [pnpm-workspace.yaml](pnpm-workspace.yaml) still uses `allowBuilds:` (pnpm 12 syntax, unchanged) so esbuild's install script still runs. Re-run `pnpm install --frozen-lockfile` to prove CI's exact command works.

### 3. Remix 3.0.0 → 3.3.0

Change the pin only (the repo uses an exact pin, not `^`). Then, in order:

1. `pnpm run typecheck` — fix any type drift at the real call sites: [entry.tsx:1](app/public/entry.tsx#L1), [tv-manager.tsx:1](app/public/tv-manager.tsx#L1), [server.ts:3-5](server.ts#L3-L5), [assets.ts:1](app/assets.ts#L1).
2. `pnpm run lint`, `pnpm test` (73 tests).
3. `pnpm run build` — must still emit `dist/assets/app.js` and must still pass the SPA-router guard.
4. `pnpm run dev` — browser pass (below).

`skipLibCheck: true` hides breaking `.d.ts` changes inside `@remix-run/*`, so typecheck only proves our own call sites — the runtime pass in step 4 is what actually validates the asset server and router.

### 4. Node 26

- `.github/workflows/{pages,quality,tv-sync}.yml` — `node-version: 24` → `26`.
- [package.json](package.json) `engines.node` → `">=26.0.0"`.
- Add `.node-version` containing `26`, so local dev matches CI instead of relying on prose.
- Update [README.md](README.md) (Node 24.3+ line) and [AGENTS.md](AGENTS.md) (Node 24.3+ line).

**Local caveat:** this machine runs Node `v24.21.0` and pnpm's `engine-strict` is unset, so the mismatch produces a warning rather than a hard failure — `init.sh` will still pass here. Verify the real Node 26 path (local version manager switch, or let `quality.yml` prove it on the branch push) before calling the step done.

### 5. Docs and records

- Version references: [README.md](README.md) (`remix@3.0.0`), [AGENTS.md](AGENTS.md) (`remix@3.0.0`, Node floor), [docs/sources.md](docs/sources.md) (~line 109, "installed `remix@3.0.0` component and asset APIs").
- New feature entry `frq-08-dependency-upgrade` in [feature_list.json](feature_list.json) with the user's own words in `summary_of_intent`, `plan_status: "approved"`, plus browser evidence.
- [session-handoff.md](session-handoff.md) and [frequency-progress.md](frequency-progress.md).

### 6. Assessment doc (documentation only)

Write `docs/framework-3-x-assessment.md`. Candidates, each with what it would replace and a rough risk:

| Candidate | Now | Why it matters |
|---|---|---|
| `updateUrl()` (3.3) | hand-written `history.replaceState` at [entry.tsx:211](app/public/entry.tsx#L211) | URL state without a fetch or re-render; small, contained change |
| Back/forward support | **no `popstate` listener** — browser back/forward does not update the UI | a real latent defect; the strongest case for adopting the navigation APIs |
| `prefetch()` / `data-rmx-prefetch` (3.1) | none | may help cold guide/channel navigation |
| Build-guard hardening | greps a private error string at [build.mjs:42](scripts/build.mjs#L42) | assert on the absence of a `remix/spa` import instead of an internal message |
| Dead code | [app/routes.ts](app/routes.ts) is imported by nothing; `/epg/freeview.json` is registered twice in [server.ts](server.ts) (lines 8 and 35) | the second route is unreachable — a pre-existing latent bug worth a separate fix |
| `csp()` middleware (3.2), `<Frame>`, `clientEntry`, `createMixin({ssr:false})` | — | recorded as **not applicable** to a static, client-only build |

Any follow-up that is worth doing gets logged as `frq-09` with `plan_status: "pending"` so it goes through the plan gate, rather than being smuggled into this branch.

## Critical files

| File | Change |
|---|---|
| [package.json](package.json) | version bumps, `engines.node`, `packageManager` |
| `pnpm-lock.yaml` | regenerated |
| `pnpm-workspace.yaml` | verify only (`allowBuilds`) |
| [.github/workflows/](.github/workflows/) `pages.yml`, `quality.yml`, `tv-sync.yml` | `node-version: 26` |
| `.node-version` | new |
| [README.md](README.md), [AGENTS.md](AGENTS.md), [docs/sources.md](docs/sources.md) | version and Node-floor text |
| [docs/framework-3-x-assessment.md](docs/framework-3-x-assessment.md) | new |
| [feature_list.json](feature_list.json), [session-handoff.md](session-handoff.md), [frequency-progress.md](frequency-progress.md) | records and evidence |
| [app/public/entry.tsx](app/public/entry.tsx), [app/public/tv-manager.tsx](app/public/tv-manager.tsx), [server.ts](server.ts), [app/assets.ts](app/assets.ts) | only if typecheck demands it — no intentional refactors |

## Verification

1. `pnpm install --frozen-lockfile` — the exact CI command, against the regenerated lockfile.
2. `pnpm run check` — typecheck + lint + **73/73** tests. Record the test count; it must not drop.
3. `pnpm run build` — assert `dist/assets/app.js` exists, and assert the SPA-router guard is still armed (build fails if the bundle regresses; confirm the string is still detected rather than assuming it).
4. `pnpm run dev` on http://localhost:44100 — golden path per scope and view:
   - `?scope=listen&view=channels` — a radio station plays.
   - `?scope=watch&view=channels` — a TV channel plays.
   - `?scope=all&view=guide` — the guide renders and a programme opens.
   Plus one edge case (a failed/geo-blocked stream), and check the console for zero errors and no hydration warnings. Save screenshots under `docs/screenshots/`.
5. Real playback fixtures: `scripts/browser-tv-feeds.mjs` (external Playwright/installed Chromium), desktop and mobile.
6. `./init.sh` — restarts clean from a fresh install.
7. Node 26 proof: the `quality.yml` run on the pushing branch, or a local switch to 26 with `pnpm run check` + `pnpm run build`.

## Risks

- **Parallel branch `feat/frq-07-compact-browser`** (local, unpushed) touches the UI; whichever lands second rebases. This branch changes app code only if typecheck forces it.
- **`skipLibCheck: true`** means typecheck passing is weaker evidence than it looks for a framework bump; the browser pass is the real gate.
- **Exact pin** (`"remix": "3.3.0"`) makes rollback a one-line revert plus `pnpm install` — no range semantics involved.
- Everything Node-side is build/dev/test only; production is static files, so a bad Node bump cannot take the site down, only the deploy pipeline.
