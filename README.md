# Frequency

A dark, touch-friendly radio listening room built with **Remix 3 SPA APIs**. Uses `remix@3.0.0` and lazily loaded `hls.js` for browsers without native HLS. No React, Vite, UI framework or external fonts.

## Run

Node **24.3+** is needed only to install dependencies and build the static site. The deployed app runs entirely in the browser from GitHub Pages; it has no application server or runtime backend.

```sh
pnpm install
pnpm run dev
# http://localhost:44100
pnpm test
pnpm run build
```

`pnpm run dev` starts the local development server. `pnpm run build` type-checks, lints, tests, and compiles a minimized static site into `dist/`. GitHub Pages serves those files directly. Its workflow deploys the `dist/` folder after changes land on `main`; no Node process runs in production. Use HTTPS for the PWA; localhost is allowed for service-worker development. The Pages workflow refreshes the radio schedule extract every six hours and before deployment. Run `node scripts/sync-epg.mjs` to fetch the current feed for local development.

## What works

- Responsive station grid and programme timeline, fixed player, two colour themes, optional favourites, collection search.
- Native audio playback with pause/resume, volume and Media Session controls where available.
- 23 UK live stations: BBC Radio 1–6, nine Global stations, six Bauer stations and NTS 1–2. BBC, Global and NTS play directly; Bauer opens its official Rayo player.
- Official players, schedules and show destinations open in a new tab after releasing current audio. Broadcaster filters, official station logos, brand colours and text fallback artwork.
- The fixed player shows current programme information and playback controls. Channels opens directly to favourites and stations; Guide displays programmes on a horizontally scrolling timeline and caches downloaded schedules in IndexedDB for later sessions and offline use.
- Show destinations for Craig Charles, Chris Moyles and X-Posure, plus broadcaster collections.
- Add/remove device-local items, JSON import/export, RSS episode browsing when CORS is allowed.
- Directional keyboard focus; Enter/Space activation; `/` focuses search. Text fields retain normal arrow-key editing. Native dialogs support Escape.
- Standard-mapped gamepad D-pad / left stick navigation, A to activate and B to close a dialog. Gamepad polling ends with the component lifecycle. Pair the controller in the device OS and press a button to expose it to the browser.
- Offline app shell, catalogue, favourites and local additions **after the first online load and service-worker installation**. Streaming and remote players still need a connection. No audio downloads are implemented.

## Catalogue

Edit **`public/catalogue.json`**, or choose **Manage collection** in the app for device-local additions. Format:

```json
{
  "version": 1,
  "items": [{
    "id": "my-station",
    "title": "My station",
    "subtitle": "A description",
    "kind": "live",
    "url": "https://example.com/player",
    "streamUrl": "https://example.com/live.mp3",
    "streamType": "mp3",
    "logoUrl": "images/my-station.png",
    "provider": "Independent",
    "countryCode": "GB",
    "scheduleSource": "freeview",
    "scheduleId": "RadioX.uk",
    "scheduleUrl": "https://example.com/schedule",
    "showsUrl": "https://example.com/shows",
    "brand": "MY RADIO",
    "mark": "M",
    "color": "#c5e762",
    "tags": ["Alternative"]
  }]
}
```

`kind`: `live`, `show`, `audio`, or `feed`. `id`, `title`, `kind`, `url` are required. Page, stream, schedule and show URLs must use HTTPS. `logoUrl` accepts HTTPS or an app-relative image path (no leading slash or `..`); images preserve their aspect ratio and fall back to `mark` if unavailable. `color` uses six-digit hex. Optional `provider` enables broadcaster filtering; `countryCode` accepts two uppercase letters and does not restrict playback geographically. Custom sources can come from any country.

`scheduleSource` and `scheduleId` are optional and must be supplied together. They map a station to a supported guide feed; current mappings and limits are documented in [content source research](docs/sources.md). Custom additions without a mapping can link to their official schedule page.

Without `streamUrl`, live/show cards open `url` in an official tab; `feed` cards load RSS enclosures. `streamUrl` enables direct playback. Optional `streamType` is `mp3`, `aac`, or `hls`; `.m3u8` URLs are detected automatically if omitted. Native HLS is preferred; other supported browsers lazily load HLS.js. Connections time out after 15 seconds, with Retry and official-player actions. Broadcaster URLs and regional rights can change. Logging into BBC in its own tab does not expose BBC cookies to Frequency or authenticate a raw stream.

Manage collection provides separate official/direct addresses, logo, colour, broadcaster, schedule and show inputs. For an audio episode, a single URL still becomes its direct audio address. Device JSON import replaces only device additions, leaving the built-in file intact. Export contains device additions. Existing version-1 catalogues and localStorage entries remain supported; storage stays in that browser profile.

## Offline and updates

The worker precaches the document and local assets, then keeps network-first copies with cached fallbacks. It never caches third-party streams or feeds. Each build changes the worker cache version. The app checks for a new worker at startup, when the tab returns to the foreground, and every five minutes while open. Updates found during startup activate and reload automatically. An update that arrives while the app is open shows a dialog; **Update now** activates the waiting worker and reloads, while **Later** leaves the current session in place. Offline update checks fail quietly and the installed shell remains available.

## iPad / TV

On iPad Safari, open the HTTPS deployment and use Share → Add to Home Screen. Test the actual Xbox controller/iPadOS combination: gamepad availability, hardware volume, autoplay and background audio are browser/OS controlled. In-app volume sliders may be ignored by iOS; use hardware volume. No real iPad, Xbox or TV hardware verification has been performed. Native HLS and authenticated broadcaster playback must also be checked on the intended UK network. Desktop Chrome and automated WebKit playback checks do not establish actual Safari app/PWA behaviour or UK availability.

Themes use CSS custom properties, cascade layers, logical properties, `color-mix`, responsive grids, visible focus and reduced-motion support. Change the token layer in `public/styles.css`; the avatar button switches moss/lilac and remembers the choice. Station cards and player artwork use broadcaster-hosted official logos and brand colours, with CSS/text fallback marks. See source notes for artwork provenance and metadata usage requirements.

## Screenshots

- Channels: [desktop](docs/screenshots/frequency-home-grid-desktop.png) · [mobile](docs/screenshots/frequency-home-grid-mobile.png)
- Guide: [desktop](docs/screenshots/frequency-guide-desktop.png) · [mobile](docs/screenshots/frequency-guide-mobile.png)
- Setup and schedule states: [favourites picker](docs/screenshots/frequency-picker-desktop.png) · [empty favourites](docs/screenshots/frequency-empty-favourites.png) · [loading](docs/screenshots/frequency-schedule-loading.png) · [unavailable](docs/screenshots/frequency-schedule-unavailable.png)

## Working with coding agents

This repo uses the same session harness for every coding agent:

| File | Purpose | Read by |
| --- | --- | --- |
| `AGENTS.md` | Canonical instructions: startup workflow, plan gate, definition of done, architecture | Codex, Cursor, Copilot coding agent (natively); Claude Code via `CLAUDE.md` |
| `CLAUDE.md` | Imports `AGENTS.md` plus Claude-only notes | Claude Code |
| `.github/copilot-instructions.md` | Pointer to `AGENTS.md` | GitHub Copilot |
| `.codex/environments/environment.toml` | Setup (`pnpm install`) and Dev/Check actions | Codex app |
| `feature_list.json` | Backlog; implementation needs `plan_status: "approved"` | all |
| `frequency-progress.md` | Long-running verified state and session log | all |
| `session-handoff.md` | Per-session handoff, reset at the start of each session | all |
| `init.sh` | `pnpm install` + `pnpm run check` baseline | all |
| `.agents/skills/` | Shared procedures (symlinked into `.claude/skills/`) | all |

Cursor needs no extra file. Put shared rules in `AGENTS.md` only.

## Validation

`pnpm test` covers catalogue/import compatibility, unsafe URLs, duplicate IDs, styling, playback lifecycle, timeout/retry, HLS selection and autoplay handling. Browser smoke tests using an already-installed external Playwright/Chrome verified collection loading, favourites, add content, search, arrow focus, offline reload, and mobile overflow with no runtime errors. Additional production browser checks verified all 17 direct streams in Chrome and native-HLS WebKit, plus broadcaster filtering, config additions, artwork fallback, official tabs, audio cleanup and mobile overflow under a Pages subpath. Chrome offline reload and simulated gamepad navigation passed; WebKit offline emulation failed internally and remains unverified. These browser tools are not project dependencies. Actual Safari, UK-network, iPad and real controller testing remain manual.

The current browser check also verified first-use favourites setup, the empty-favourites action, schedule loading and failure states, all 23 station rows, 215 programme blocks, and horizontal Guide scrolling with no page-width overflow at 390 px. The screenshots use the Freeview-EPG snapshot fetched on 18 October 2026; live listings naturally change between builds.

See [content source research](docs/sources.md) for verified endpoints and BBC/Global limitations.

Updated station views: [desktop](docs/screenshots/stations-desktop.png) · [mobile](docs/screenshots/stations-mobile.png).
