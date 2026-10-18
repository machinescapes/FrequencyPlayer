# Content sources and integration notes

Researched 17 October 2026. No undocumented API, credentials or stream proxy is required by this app.

## BBC

- Live station: https://www.bbc.co.uk/sounds/play/live:bbc_6music
- Schedule and show discovery: https://www.bbc.co.uk/sounds/schedules/bbc_6music
- Craig Charles programme / episode destination: https://www.bbc.co.uk/programmes/m000h9wt
- Legacy feed documentation: https://support.bbc.co.uk/platform/feeds/RadioandMusicFeeds.htm
- International access changes: https://help.bbc.com/hc/en-us/articles/42652680528659-Update-on-access-to-BBC-Sounds-outside-the-UK

BBC programme pages are useful launch destinations, but a listing is not a playable audio feed. The legacy feed directory does not establish that music shows are available as RSS. No current supported catch-up API or stable direct BBC stream was verified. An old Akamai 6 Music HLS URL returned HTTP 410 and was deliberately excluded. BBC pages may require UK access and sign-in. The local PWA cannot reuse BBC site cookies for independent playback. A UK IP does not by itself grant a direct media URL.

## Radio X / Global Player

- Live destination: https://www.globalplayer.com/live/radiox/uk/
- Catch-up directory: https://www.globalplayer.com/catchup/radiox/uk/
- Chris Moyles show/date selector: https://www.globalplayer.com/catchup/radiox/uk/b8G7abG/
- X-Posure: https://www.radiox.co.uk/radio/shows-presenters/xposure/
- Official FAQ: https://www.radiox.co.uk/faqs/
- Direct live MP3: https://media-ice.musicradio.com/RadioXLondonMP3

The live MP3 was checked with GET: HTTP 200, audio/mpeg, 128 kbps, CORS allowed. HEAD returned 405, so HEAD is not a reliable availability check. This verifies an endpoint response, not listening quality or availability on every network. Direct URLs may change.

The official FAQ describes seven-day catch-up in Global Player. Catch-up show pages load episodes dynamically and do not document a public integration API. Use these pages to select an individual episode in the official player. Offline downloads advertised by Global Player belong to its app; they are not an independent PWA download interface.

## Adding other content

Use a direct HTTPS MP3/M4A URL for an episode, an HTTPS HLS URL on a browser supporting native HLS (notably Safari), a public RSS feed with audio enclosure elements, or an official player URL. RSS fetches require the publisher to allow cross-origin browser requests. Feed imports do not scrape websites or guess stream URLs. The catalogue's search searches your saved collection, not the entire BBC/Global library.

No licensed or authenticated media is cached. Future episode integration should use a documented publisher API or a CORS-enabled RSS feed. No additional HLS player, gamepad, state, CSS, icon or PWA libraries were added.

## Remix 3 references

The implementation follows the installed `remix@3.0.0-rc.5` READMEs, which match the installed runtime:

- `node_modules/remix/INDEX.md`
- `node_modules/remix/src/spa/README.md`
- `node_modules/remix/guides/05-interactivity.md`
- `node_modules/remix/src/assets/README.md`
- https://api.remix.run/api/remix/spa/overview/

It uses `createRouter`, shared `route` definitions, `remix/spa` render/run, setup-scope component state, `handle.update`, `on`/`ref` mixins and abort-scoped browser listeners. The Node server serves only the SPA document, static files and first-party compiled assets; there is no server rendering of the application UI. This intentionally adapts the full-stack template to SPA use instead of introducing Remix 2 / React / Vite conventions. Remix's on-demand asset compiler means no separate build step is required.
