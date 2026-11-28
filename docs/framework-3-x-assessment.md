# Remix 3.1–3.3: what's new and what to adopt

Assessment for frq-08 (2026-11-27). It covers the Remix releases after the version this app launched on (3.0.0, 1 Oct 2026): **3.1.0** (23 Oct), **3.2.0** (4 Nov) and **3.3.0** (19 Nov). It asks one question: which new framework features are worth refactoring toward in Frequency? It also records issues found while verifying the upgrade.

Sources: `packages/remix/CHANGELOG.md` and the `component`, `assets`, `fetch-router` and `spa` package changelogs in `remix-run/remix`, and the `@remix-run/component@1.3.0` type definitions and README. Remix 3 has no separate upgrade guide; the changelogs are the upgrade notes.

## Bottom line

- **The upgrade needed no code changes.** Every API this app uses (`createRoot`, `on`, `ref`, `Handle.update/queueTask/signal`, `createAssetServer`/`getScriptEntry`, `createRouter`, `staticFiles`, `createRequestListener`, `remix/node-tsx`) is source-compatible from 3.0 to 3.3.
- **The upgrade itself is the biggest win.** Since 3.2, an app that mounts with `createRoot()` and never uses `<Frame>` no longer bundles the frame runtime. On identical source, `dist/assets/app.js` dropped from **160,208 to 120,841 bytes (−24.6%)**, or 51.2 KB → 40.4 KB gzipped.
- **Most new features target server-rendered, frame-based apps.** Frequency is a static, client-only `createRoot` SPA, so they either don't apply or would bring the frame runtime back. Measured below, adopting them costs more than it gains.
- **The worthwhile follow-ups are app-side fixes, not framework adoption.** The most important is a pre-existing update storm when many logos fail to load (see Findings).

## Measured cost of the new client APIs

Each row is a minified esbuild bundle of `createRoot, on, ref` plus the named import from `remix/component@1.3.0`:

| Import | Minified | Gzipped | Δ vs. today |
|---|---:|---:|---|
| `createRoot, on, ref` (what the app uses now) | 48,963 B | 17,454 B | — |
| `+ createMixin` | 48,964 B | 17,455 B | free |
| `+ updateUrl` | 104,188 B | 35,445 B | **+55 KB / +18 KB gz** |
| `+ prefetch` | 111,880 B | 37,832 B | **+63 KB / +20 KB gz** |

`updateUrl` and `prefetch` both import the frame runtime, which undoes the 3.2 size win.

## Candidates

### Not recommended

**`updateUrl()` (3.3)** to replace `history.replaceState` in `persistContext()` ([entry.tsx](../app/public/entry.tsx), around line 211). Its default is `history: 'replace'`, which is exactly what the app does now. The extra features (waiting for an active frame transition, keeping the top-frame source in sync, superseding stale calls) only matter with frame navigation, which this app doesn't use. The docs also say that without frame navigation, "applications restore displayed state on Back/Forward themselves", so it wouldn't add Back/Forward support either. Cost is +18 KB gzipped for no behaviour change. **Skip it.**

**`prefetch()` / `data-rmx-prefetch` (3.1, extended in 3.3).** These prefetch *frame HTML* and the assets it references. The app has no frames and no same-origin document links; its data is JSON fetched by app code, and offline caching belongs to the service worker. Cost is +20 KB gzipped. **Not applicable.**

**Frame features**: `<Frame loading="lazy">` (3.3), `frame.reload({ src, method, body })` (3.1), `defaultResolveFrame` with `{ fetch, commit }` (3.3), the `rmx:navigation` event and `FrameReloadStartEvent` (3.3). All of them assume server-rendered frames. GitHub Pages has no server. **Not applicable.**

**`csp()` middleware (3.2).** It sets a nonce-based Content-Security-Policy header from the router. Production is static GitHub Pages, which can't send response headers, and the middleware would only protect the dev server. A production CSP would have to be a `<meta http-equiv>` tag in `scripts/build.mjs`, and nonces don't work in static HTML. If CSP is wanted, plan it as its own hash-based policy. **Not applicable as a refactor.**

**SSR and hydration fixes**: boolean `aria-*` serialization (3.2), form-control edit replay before hydration (3.3), `createMixin(..., { ssr: false })` (3.1), `css()` serialization fixes (3.2). The app is not server-rendered and uses no `css()`. Verified in the browser anyway: all 255 `aria-pressed`/`aria-checked`/`aria-expanded` attributes render as `"true"`/`"false"`.

**Array `value` on multiple `<select>` (3.3).** The app has no multiple selects.

### Worth considering

| # | Change | Why | Size | Framework API? |
|---|---|---|---|---|
| 1 | **Coalesce logo-failure updates** | Fixes the update storm below: today each failed `<img>` calls `handle.update()`. Mark failures, then call `update()` once per frame (for example from a `requestAnimationFrame` flag). A reusable `createMixin`-based "logo with fallback" mixin would cost nothing in bundle size. | S | `createMixin` (already in 3.0) |
| 2 | **Harden the static-build guard** | [build.mjs](../scripts/build.mjs) greps the bundle for the private error text `Expected a Remix SPA response`. It still works in 3.3 (verified with a probe bundle), but a rewording upstream would silently disable it. Use esbuild `metafile: true` and fail if any input path matches `spa-response`. | S | no |
| 3 | **Import `ScriptEntry` in `server.ts`** | `server.ts` hand-writes the shape `remix/assets` already exports as `ScriptEntry`, so an upstream shape change would compile and then fail at runtime. | XS | no |
| 4 | **Dev-server cleanups** | `/tv` returns **500** in dev, because Node's `Response.redirect()` rejects relative URLs; production is unaffected because it serves `tv.html`. `/epg/freeview.json` is registered twice in `server.ts`, so the second handler never runs. `app/routes.ts` is imported by nothing but is still typechecked and listed in `allowFiles`. | S | no |
| 5 | **Evaluate `remix/test` for component tests** | `entry.tsx` and `tv-manager.tsx` have no unit coverage; only the external Playwright harnesses exercise them. Since 3.3, `remix/test` has `t.useFakeTimers()` that also fakes `Date`, `performance.now()` and `AbortSignal.timeout()`. That suits the 15-second connect timeout and the now/next clock. Its browser mode needs Playwright as a peer dependency, so this is a test-strategy decision, not a drop-in change. | M | `remix/test` |
| 6 | **Back/Forward between scopes and views** | Not a bug: `persistContext()` only replaces the history entry, so Back leaves the app. If scope and view changes should become history entries, that's a product decision: push on change and re-read the query string on `popstate`. Plain History API; `updateUrl` adds nothing here (see above). | S | no |

## Findings from verifying the upgrade

Both are **pre-existing**: they reproduce identically on Remix 3.0.0 and are not regressions from the upgrade.

1. **Update storm when logos fail.** In a static build served from `127.0.0.1`, about 149 `i.imgur.com` channel logos returned 403 in one burst. Each `<img>` error handler calls `update()`, so `App` goes past the runtime's limit of 50 updates per event-loop turn. The runtime logs `handle.update() infinite loop detected` and drops the remaining renders for that turn. Over 3 runs: **3.0.0** had 19, 39 and 43 loop errors; **3.3.0** had 20, 43 and 43; dev on `localhost` had 0. The detector's logic and limit are the same in `@remix-run/component` 1.0.0 and 1.3.0. curl gets 200 for these logos from any referer, including `https://frequency.wtf/`, so the 403s come from Chrome's ~150 parallel requests (throttling), and production could hit the same thing whenever imgur throttles. Candidate 1 fixes it.
2. **`/tv` returns 500 on the dev server.** `Response.redirect('/?scope=watch&view=channels', 302)` throws `ERR_INVALID_URL` because Node has no base URL for relative redirects (reproduced with plain `node -e`, no Remix involved). Production is unaffected. Fix: `new Response(null, { status: 302, headers: { Location: '/?scope=watch&view=channels' } })`.

## Deliberately held back

**TypeScript 7.** `typescript@7.0.2` is `latest`, but `typescript-eslint@8.74.0`, which is also its latest release with no 9.x published, supports `typescript >=4.8.4 <6.1.0`. The repo stays on 6.0.3, the newest 6.x, with the range narrowed to `~6.0.3` so a routine update can't move past the supported range. Revisit when typescript-eslint publishes TS 7 support.
