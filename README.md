# Frequency

A dark, touch-friendly radio listening room built with **Remix 3 SPA APIs**. The only direct dependency is `remix`, pinned to `3.0.0-rc.5` (a release candidate). No React, Vite, UI framework, external fonts or additional libraries.

## Run

Node **24.3+** required.

```sh
npm ci
npm run dev
# http://localhost:44100
npm test
```

`npm start` starts production mode, using Remix's on-demand asset pipeline; no separate build step. `PORT=3000 npm start` changes the port. Use HTTPS in deployment; localhost is allowed for service-worker development. The development server watches server/module changes; refresh the browser after editing UI or CSS. There is intentionally no fake build or typecheck command: no TypeScript development dependency has been added without approval.

## What works

- Responsive tablet / TV collection grid, fixed player, two colour themes, favourites, collection search.
- Native audio playback with pause/resume, volume and Media Session controls where available.
- Radio X direct MP3; BBC stations and catch-up launch official players. These launch links open in another tab; their audio is controlled there.
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

The worker caches the document, local assets and complete Remix ESM graph discovered from entry/preload URLs. It never caches third-party streams or feeds. Its cache namespace is app-specific. New workers wait for existing tabs to close before activating. Bump `CACHE` in `public/sw.js` when shipping a new asset set. For local development, unregister the worker in browser developer tools if testing asset-cache changes. Catalogue and assets use network-first with cached fallback.

## iPad / TV

On iPad Safari, open the HTTPS deployment and use Share → Add to Home Screen. Test the actual Xbox controller/iPadOS combination: gamepad availability, hardware volume, autoplay and background audio are browser/OS controlled. In-app volume sliders may be ignored by iOS; use hardware volume. No real iPad, Xbox or TV hardware verification has been performed. Native HLS and authenticated broadcaster playback must also be checked on the intended UK network.

Themes use CSS custom properties, cascade layers, logical properties, `color-mix`, responsive grids, visible focus and reduced-motion support. Change the token layer in `public/styles.css`; the avatar button switches moss/lilac and remembers the choice. Station marks and record artwork are CSS/text treatments, not downloaded official logos.

## Validation

`npm test` covers catalogue validity, unsafe URLs, duplicate IDs and style/tag normalisation. Browser smoke tests using an already-installed external Playwright/Chrome verified collection loading, favourites, add content, search, arrow focus, offline reload, and mobile overflow with no runtime errors. These browser tools are not project dependencies. Safari and real controller testing remain manual.

See [content source research](docs/sources.md) for verified endpoints and BBC/Global limitations.
