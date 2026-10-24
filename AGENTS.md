# Frequency Agent Guide

This is the canonical instruction file for every coding agent working in this repository: Claude Code, Codex, Cursor, GitHub Copilot and others. Agent-specific files (`CLAUDE.md`, `.github/copilot-instructions.md`, `.codex/`) only point here or add tool-specific notes. Put shared rules in this file, not in those.

## Startup Workflow

**MANDATORY: complete every step below before responding to any user request, including direct task requests, questions and plan requests. If a conversation opens mid-task without these steps done, stop and run them now.**

0. Check that the logged-in GitHub user is `mintsource` (`gh auth status`), and warn if it isn't. GitHub repo actions won't work otherwise.
1. Confirm the working directory with `pwd`.
2. Read `session-handoff.md` and pull out the previous session's verified state, next step and risks. Then reset the file to the blank template at the bottom of this file, so this session can fill it fresh.
3. Read `frequency-progress.md` for the longer-running verified state.
4. Read `feature_list.json` and choose the highest-priority unfinished feature.
   - For any `in_progress` feature, check its `plan_status`. If it isn't `"approved"`, don't continue implementation. Create a plan and get user approval first (see Plan Gate below).
5. Review recent commits with `git log --oneline -5`.
6. Always work on a feature branch.
7. Run `./init.sh`, which runs `pnpm install` and then `pnpm run check`.

If baseline verification is already failing, fix that first. Don't stack new feature work on a broken state.

## Project

**Frequency** is a dark, touch/keyboard/gamepad-friendly PWA for UK live radio ("Listen") and IPTV channels ("Watch").
- **Stack:** Remix 3 component/SPA APIs (`remix@3.0.0`, with JSX via `jsxImportSource: remix/component`). It does **not** use React, Vite, a UI framework or external fonts, so don't add them. `hls.js` is lazy-loaded only when the browser lacks native HLS.
- **Hosting:** production is a fully static site on GitHub Pages (custom domain `frequency.wtf`, served at the root). There is no runtime backend. Node 24.3+ is needed only for dev, tests and the build.
- **Repo:** `machinescapes/FrequencyPlayer`. Use **`pnpm` only**: the version is pinned in `package.json` (`packageManager`) and CI installs with `pnpm install --frozen-lockfile`. Never run `npm install` or commit a `package-lock.json`.

Remix 3 is not Remix 1/2. Don't assume `loader`/`action` exports, `@remix-run/*` packages or `<Outlet />`. Check against https://api.remix.run/api/remix/overview/ and this project's code.

## Commands

```sh
pnpm install
pnpm run dev                # dev server at http://localhost:44100 (PORT overrides it)
pnpm test                   # node --test test/*.test.js
node --test test/epg.test.js                         # one test file
node --test --test-name-pattern="timeout" test/playback.test.js   # one test by name
pnpm run typecheck          # tsc --noEmit (covers app/ and server.ts only)
pnpm run lint               # eslint app server.ts scripts test
pnpm run check              # typecheck + lint + test (this is what CI's Quality workflow runs)
pnpm run build              # check, then scripts/build.mjs → dist/
node scripts/sync-epg.mjs  # fetch the Freeview XMLTV guide into public/epg/freeview.json (gitignored)
pnpm sync:tv               # rebuild public/tv/*.json from Free-TV/IPTV (TV_COUNTRIES=GB for one country)
```

Tests import `.ts` sources directly and rely on Node's built-in type stripping, with no transpile step. IndexedDB code is tested with `fake-indexeddb`, and playback is tested with hand-written Audio/Hls stubs.

## Architecture

### Two ways of serving the same client
- **Dev (`server.ts`)**: a `remix/router` server. `app/assets.ts` uses `remix/assets` to compile `app/public/**` on demand, and the HTML page is assembled with an import map and modulepreloads. If `public/epg/freeview.json` doesn't exist, the server returns an empty schedule. `/tv` redirects to `/?scope=watch&view=channels`.
- **Prod (`scripts/build.mjs`)**: esbuild bundles `app/public/entry.tsx` into `dist/assets/app.js` and minifies `public/styles.css`. It copies `public/`, writes a static `index.html`, `404.html` and `tv.html` (a redirect stub), and stamps `__BUILD_VERSION__` into `sw.js`. `PUBLIC_BASE_PATH` sets the `<base href>` and the compile-time `__APP_BASE_PATH__`. Client fetches must go through `APP_BASE_PATH` with relative paths, not absolute `/...` URLs. The build fails if the bundle contains the Remix server SPA router: the static build has to mount the client directly with `createRoot`.

When you change how the page shell, assets or offline manifest work, update **both** `server.ts` and `scripts/build.mjs`.

### Client (`app/public/`)
- `entry.tsx` is the whole UI: a single `App(handle)` Remix component. State lives in closure variables, and re-rendering is explicit through `handle.update()`. Listeners, fetches and timers are tied to `handle.signal` so they are cleaned up when the component goes away.
- The app has one shell with **scope** `watch | listen | all` and **view** `Channels | Guide`, both reflected in the `?scope=&view=` query string. Watch and Listen used to be separate apps; see `docs/plans/media-browser-ia.md`.
- `media.ts` normalises radio rows (`public/catalogue.json`, validated by `catalogue.js`) and TV rows (`public/tv/<CC>.json`, one country at a time, validated by `tv-catalogue.js`) into a single `MediaItem` shape. IDs are **namespaced** (`listen:<id>`, `watch:<id>`) so the two sources can't collide in favourites or the guide. It also handles filtering, ordering (`orderChannels`: listings, then config `pin`, then Free-TV list order, then title) and the favourites migration.
- `epg.ts` validates schedules, computes now/next and caches schedules in IndexedDB for offline use. NTS schedules are parsed client-side. The Freeview guide is built at deploy time.
- `playback.ts` drives a shared media element: connecting, playing, paused, failed or blocked, a 15 s connect timeout with retry, native HLS preferred over the lazy `hls.js` import, and Media Session integration.
- `navigation.js` provides directional (arrow-key and gamepad) focus movement. Text inputs keep normal arrow-key editing.
- `localStorage` holds device-local additions (`frequency.custom`), favourites and the theme.

### Data pipeline (`scripts/`)
- `sync-epg.mjs` downloads the dp247 Freeview-EPG XMLTV feed and keeps only the stations mapped through `scheduleSource: "freeview"` + `scheduleId` (radio) or `epgId` (TV, stored as `watch:<id>`). The result is validated with `validateSchedule` from `app/public/epg.ts`. The Pages workflow runs it every 6 hours before building, with `EPG_FALLBACK_URL` pointing at the live site.
- `sync-tv.mjs` + `freetv-parse.mjs` turn Free-TV/IPTV's per-country markdown lists into `public/tv/<CC>.json` plus `public/tv/index.json`. They keep `[>]` rows in file order with logos, mark HTTPS HLS rows as inline and everything else (http, YouTube) as external (opens in a new tab), keep geo-blocked rows, apply `scripts/tv-config.json`, join the UK to the Freeview guide, and probe stream health. Country codes are ISO in data (`GB`), but menus and URLs say **UK**. A weekly workflow commits the result. Details are in `docs/tv-sources.md`.
- `sync-epg.mjs` reads `public/tv/GB.json` for the TV guide join. A fresh checkout or worktree has no `public/epg/freeview.json`, so the Guide is empty until you run `node scripts/sync-epg.mjs`.

### Service worker (`public/sw.js`)
On install it precaches the core files plus whatever `offline-assets.json` lists. Same-origin core files and JS assets are served network-first with a cache fallback. Streams, media, Range requests and third-party URLs are never cached. Updates go through a `SKIP_WAITING` message from the in-app "Update now" dialog.

## Catalogue rules

`public/catalogue.json` (version 1) needs `id`, `title`, `kind` (`live|show|audio|feed`) and `url` on every item. All URLs must use HTTPS. `logoUrl` is either HTTPS or app-relative (no leading `/` and no `..`). `color` is six-digit hex. `scheduleSource` and `scheduleId` must appear together. Without a `streamUrl`, a card opens its official page in a new tab. Bauer stations deliberately open the Rayo player. The README has the full format. Endpoint research and BBC/Global limitations are in `docs/sources.md`.

## CI

- `quality.yml` runs `pnpm run check` on PRs and on pushes to non-main branches.
- `pages.yml` runs on pushes to `main`, every 6 hours, or manually. It runs sync-epg, then `pnpm run build`, then deploys `dist/`.
- `tv-sync.yml` runs weekly (Monday 04:17 UTC) and commits a refreshed `public/tv/` to `main` when it changes. Its health probe runs from a GitHub-hosted runner, so geo-blocked streams it cannot reach are recorded as `geo`, not `offline`.

## Skills

Reusable procedures live in `.agents/skills/<name>/SKILL.md`. Any agent can read them directly, and Claude Code also exposes them as slash commands through symlinks in `.claude/skills/`.

- [.agents/skills/developer-workflow/SKILL.md](.agents/skills/developer-workflow/SKILL.md): issues, PR title and body, the verification checklist, and adding a feature with a plan.

## Plan Gate

A feature must have `plan_status: "approved"` in `feature_list.json` before any implementation begins. This applies to every `not_started` and `in_progress` feature. `passing` features are grandfathered.

To get an approved plan:

1. Research the feature area (read-only), then write the plan to `docs/plans/<id>.md` using the template in the developer-workflow skill (Section 8). Set `"plan_status": "draft"`.
2. Present the plan to the user and **wait for explicit approval**. Each agent does this its own way: Claude Code uses plan mode and `ExitPlanMode`; other agents post the plan in chat and stop until the user replies.
3. After approval, update `feature_list.json` to `"plan_status": "approved"` and `"plan": "docs/plans/<id>.md"`.

**Don't write any implementation code for a feature whose `plan_status` isn't `"approved"`.**

## Definition of Done

A feature is done only when **all** of these are true:

- The target behaviour is implemented and reachable from the UI (or, for pipeline work, it shows up in the generated data).
- `pnpm run check` is clean (typecheck, lint and tests).
- **The change was checked in a real browser.** Start `pnpm run dev`, open http://localhost:44100, and go through the feature's golden path and at least one edge case in the affected scope (`?scope=watch|listen|all`, `&view=channels|guide`). Take a screenshot as evidence. A passing typecheck doesn't replace this. Use whatever browser automation your agent has (Playwright, a preview tool, or similar). If it has none, ask the user to check and record what they saw.
- Evidence is recorded in `feature_list.json` or `frequency-progress.md`, including the screenshot path or a description of what you saw in the browser.
- README and `docs/` are updated if the change is user-visible, and `CLAUDE.md`/`AGENTS.md` if the architecture or commands changed.
- The repository can still be restarted from `./init.sh`.

## During Session: Continuous Logging

Update `session-handoff.md` **immediately**, before any other work, whenever any of these happen:

- A commit is created: record the hash and what changed.
- A PR is opened, updated or merged: record the number and status.
- A verification (`pnpm run check`, a browser check, `pnpm sync:tv --check`) runs: record pass/fail and the exact command.
- A feature changes state: record its id and new status.
- A blocker or unexpected finding comes up: record what it is and what you tried.

One line per event is enough. If the session is interrupted, the next one should be able to reconstruct exactly what happened.

## End of Session

Before ending a session:

1. Fill in every section of `session-handoff.md` and commit it.
2. Update `frequency-progress.md`.
3. Update `feature_list.json`.
4. Update `README.md` / `docs/` if needed.
5. Record any unresolved risk or blocker.
6. Commit with a descriptive message once the work is in a safe state. Agents always use a feature branch, even without branch protection.
7. Leave the repo in a state where the next session can run `./init.sh` straight away.
8. Before opening a PR, check that `session-handoff.md` is fully written and committed. Then follow the PR process in the developer-workflow skill: make sure a GitHub issue exists, use the title convention `<type>(<scope>): description (#NNN)`, and fill in `.github/PULL_REQUEST_TEMPLATE.md`. **Don't open a PR while `session-handoff.md` is blank or stale.**

## CLI Tools (Preferred)

Prefer CLI tools (`gh`, `pnpm`, `git`) for GitHub and build work. Use MCP tools as a fallback, and tell the user if a required MCP server isn't running.

## Rules

- One active feature per branch.
- Don't claim completion without evidence you can run.
- Don't rewrite the feature list to hide unfinished work.
- Don't remove or weaken tests to make a task look complete.
- Repository files (`frequency-progress.md`, `feature_list.json`, `session-handoff.md`) are the system of record. Agent-private memory is not.
- Don't add files under `.claude/`, `.cursor/` or `.github/` that duplicate rules from this file. Point back here instead.

## session-handoff.md Blank Template

When resetting `session-handoff.md` at startup, write exactly this content:

```markdown
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
```
