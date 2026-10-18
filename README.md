# Frequency

A dark, touch-friendly radio listening room built with **Remix 3 SPA APIs**. The only direct dependency is `remix`, pinned to `3.0.0-rc.5` (a release candidate). No React, Vite, UI framework, external fonts or additional libraries.

## Run

Node **24.3+** is needed only to install dependencies and build the static site. The deployed app runs entirely in the browser from GitHub Pages; it has no application server or runtime backend.

```sh
npm ci
npm run dev
# http://localhost:44100
npm test
npm run build
```

`npm run dev` starts the local development server. `npm run build` type-checks, lints, tests, and compiles a minimized static site into `dist/`. GitHub Pages serves those files directly. Its workflow deploys the `dist/` folder after changes land on `main`; no Node process runs in production. Use HTTPS for the PWA; localhost is allowed for service-worker development.

## What works

- Responsive tablet / TV collection grid, fixed player, two colour themes, favourites, collection search.
- Native audio playback with pause/resume, volume and Media Session controls where available.
- Radio X direct MP3; BBC Sounds opens in an in-app player dialog. Global Player pages open in the same tab because they block iframe embedding; browser Back returns to Frequency.
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
    "brand": "MY RADIO",
    "mark": "M",
    "color": "#c5e762",
    "tags": ["Alternative"]
  }]
}
```

`kind`: `live`, `show`, `audio`, or `feed`. `id`, `title`, `kind`, `url` are required. All URLs must use HTTPS. Without `streamUrl`, live/show cards open `url`; `feed` cards load RSS enclosures. `streamUrl` enables in-app playback for live/audio items. Direct HLS needs native browser support; no third-party HLS library is installed. Device JSON import replaces only device additions, leaving the built-in file intact. Export contains device additions. localStorage data stays in that browser profile.

## Offline and updates

The worker precaches the document and local assets, then keeps network-first copies with cached fallbacks. It never caches third-party streams or feeds. Each build changes the worker cache version. The app checks for a new worker at startup, when the tab returns to the foreground, and every five minutes while open. Updates found during startup activate and reload automatically. An update that arrives while the app is open shows a dialog; **Update now** activates the waiting worker and reloads, while **Later** leaves the current session in place. Offline update checks fail quietly and the installed shell remains available.

## iPad / TV

On iPad Safari, open the HTTPS deployment and use Share → Add to Home Screen. Test the actual Xbox controller/iPadOS combination: gamepad availability, hardware volume, autoplay and background audio are browser/OS controlled. In-app volume sliders may be ignored by iOS; use hardware volume. No real iPad, Xbox or TV hardware verification has been performed. Native HLS and authenticated broadcaster playback must also be checked on the intended UK network.

Themes use CSS custom properties, cascade layers, logical properties, `color-mix`, responsive grids, visible focus and reduced-motion support. Change the token layer in `public/styles.css`; the avatar button switches moss/lilac and remembers the choice. Station marks and record artwork are CSS/text treatments, not downloaded official logos.

## Validation

`npm test` covers catalogue validity, unsafe URLs, duplicate IDs and style/tag normalisation. Browser smoke tests using an already-installed external Playwright/Chrome verified collection loading, favourites, add content, search, arrow focus, offline reload, and mobile overflow with no runtime errors. These browser tools are not project dependencies. Safari and real controller testing remain manual.

See [content source research](docs/sources.md) for verified endpoints and BBC/Global limitations.
